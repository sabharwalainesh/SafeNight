import { describe, expect, it } from 'vitest';
import { ConnectionId, Identity, Timestamp, TimeDuration } from 'spacetimedb';
import type { ProcedureCtx } from 'spacetimedb/server';
import { createModuleTestHarness, TestAuth, type TestHttpResponse } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';
import { handoffRecipients } from './lib/safety';

let nextConnection = 900n;
function principal(subject: string) {
  return TestAuth.fromJwtPayload(
    JSON.stringify({ iss: 'https://safenight.test', sub: subject }),
    new ConnectionId(nextConnection++)
  );
}

const NOW = Timestamp.fromDate(new Date('2026-11-07T22:00:00Z'));
const MIN = 60_000_000n;
const plus = (minutes: number) => new Timestamp(NOW.microsSinceUnixEpoch + BigInt(minutes) * MIN);
const advance = (test: Harness, minutes: number) => test.clock.advance(TimeDuration.fromMillis(minutes * 60_000));

function makeHarness() {
  return createModuleTestHarness(spacetimedb, m);
}
type Harness = ReturnType<typeof makeHarness>;
type PCtx = ProcedureCtx<never>;

/** Four personas: Alex organizer, Sam accepted driver, Maya buddy #1, Jordan backup #2 (trusted contacts of Sam). */
function setup(opts: { contacts?: boolean } = {}) {
  const contacts = opts.contacts ?? true;
  const test = makeHarness();
  test.clock.set(NOW);
  const alex = principal('alex');
  const sam = principal('sam');
  const maya = principal('maya');
  const jordan = principal('jordan');
  const outsider = principal('outsider');
  const id = (auth: TestAuth): Identity => test.viewContext(auth).sender;
  for (const [auth, name] of [[alex, 'Alex'], [sam, 'Sam'], [maya, 'Maya'], [jordan, 'Jordan'], [outsider, 'Outsider']] as const) {
    test.withReducerTx(auth, ctx => m.setProfile(ctx, { displayName: name, avatarEmoji: '🙂' }));
  }
  test.withReducerTx(alex, ctx =>
    m.createSession(ctx, { name: 'Friday Night', venueHint: 'Downtown', startsAt: NOW, expiresAt: plus(300), checkinIntervalMinutes: 60 })
  );
  const session = [...test.db.nightSession.iter()][0]!;
  test.withReducerTx(alex, ctx => m.createInvite(ctx, { sessionId: session.id, ttlMinutes: 60, maxUses: 10 }));
  const code = [...test.db.invite.iter()][0]!.code;
  for (const auth of [sam, maya, jordan]) test.withReducerTx(auth, ctx => m.joinSession(ctx, { code }));
  test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
  const assignment = [...test.db.driverAssignment.iter()][0]!;
  test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: assignment.id }));
  if (contacts) {
    test.withReducerTx(sam, ctx => m.addTrustedContact(ctx, { contact: id(maya), role: { tag: 'buddy' }, messagingConsent: true, priority: 1 }));
    test.withReducerTx(sam, ctx => m.addTrustedContact(ctx, { contact: id(jordan), role: { tag: 'backup_buddy' }, messagingConsent: true, priority: 2 }));
  }
  return { test, alex, sam, maya, jordan, outsider, id, sessionId: session.id };
}

const reportDriverConcern = (s: ReturnType<typeof setup>) =>
  s.test.withReducerTx(s.alex, ctx =>
    m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.sam), category: { tag: 'possible_consumption' }, note: 'Had a few' })
  );
const job = (test: Harness) => [...test.db.agentJob.iter()][0]!;
const wakes = (test: Harness) => [...test.db.agentWake.iter()];
const notifications = (test: Harness) => [...test.db.notification.iter()];
const receipts = (test: Harness) => [...test.db.agentAction.iter()].sort((a, b) => Number(a.id - b.id));
const timers = (test: Harness) => [...test.db.followupTimer.iter()];
const events = (test: Harness, incidentId: bigint) => [...test.db.incidentEvent.incidentId.filter(incidentId)].map(e => e.kind);

type Responder = (req: { uri: string }, body: string) => TestHttpResponse | Error;
const reply = (code: number, body?: unknown): TestHttpResponse => ({
  code,
  headers: { entries: [] },
  version: { tag: 'Http11' },
  body: body === undefined ? '' : JSON.stringify(body),
});

/** Supplies an env to a procedure context (the harness has none) while delegating everything else. */
function withEnv<T extends object>(ctx: T, env: Record<string, string>): T {
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'env') return env;
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Run every pending wake through agent_step (the harness never fires schedules). */
function runPendingWakes(test: Harness, opts: { env?: Record<string, string>; responder?: Responder } = {}) {
  const seen: string[] = [];
  const requests: string[] = [];
  for (const wake of wakes(test)) {
    let ctx = test
      .procedureContextBuilder(TestAuth.internal())
      .http((_t, req, body) => {
        requests.push(req.uri);
        const r = opts.responder ? opts.responder(req, new TextDecoder().decode(body)) : new Error('no responder configured');
        if (r instanceof Error) throw r;
        return r;
      })
      .build() as unknown as PCtx;
    if (opts.env) ctx = withEnv(ctx, opts.env);
    test.db.agentWake.scheduledId.delete(wake.scheduledId); // the scheduler deletes the row before running a procedure
    m.agentStep(ctx as never, { arg: wake });
    seen.push(wake.event);
  }
  return { events: seen, requests };
}

const nemotronReply = (toolCalls: { name: string; args: unknown }[], model = 'nvidia/test-model') =>
  reply(200, {
    model,
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Contact the primary buddy and follow up.',
          tool_calls: toolCalls.map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
        },
      },
    ],
  });

describe('C3 agent job lifecycle', () => {
  it('opening an incident creates a queued job and an immediate wake', () => {
    const s = setup();
    reportDriverConcern(s);
    const j = job(s.test);
    expect(j.status.tag).toBe('queued');
    expect(j.planVersion).toBe(0);
    expect(wakes(s.test)).toHaveLength(1);
    expect(wakes(s.test)[0]!.event).toBe('incident_opened');
    expect(wakes(s.test)[0]!.jobId).toBe(j.id);
  });

  it('simulated step: plan v1, message + confirmation to the priority-1 buddy only, assistance_underway, follow-up timer, receipts', () => {
    const s = setup();
    reportDriverConcern(s);
    const incident = [...s.test.db.incident.iter()][0]!;
    const run = runPendingWakes(s.test);
    expect(run.events).toEqual(['incident_opened']);
    expect(run.requests).toHaveLength(0); // no HTTP in simulated mode

    const plans = [...s.test.db.agentPlan.iter()];
    expect(plans).toHaveLength(1);
    expect(plans[0]!.version).toBe(1);
    expect(plans[0]!.model).toBe('simulated-planner');
    expect(plans[0]!.simulated).toBe(true);

    const ns = notifications(s.test);
    expect(ns).toHaveLength(2);
    expect(ns.every(n => n.recipient.isEqual(s.id(s.maya)))).toBe(true);
    expect(ns.map(n => n.template).sort()).toEqual(['ack_request', 'buddy_alert']);
    expect(ns.every(n => n.status.tag === 'queued' && n.simulated === true && n.channel.tag === 'in_app')).toBe(true);
    expect([...s.test.db.notificationDispatch.iter()]).toHaveLength(2);

    expect(s.test.db.incident.id.find(incident.id)!.status.tag).toBe('assistance_underway');
    const ts = timers(s.test);
    expect(ts).toHaveLength(1);
    expect(ts[0]!.expectedFrom.isEqual(s.id(s.maya))).toBe(true);
    expect(ts[0]!.tier).toBe(0);

    const rs = receipts(s.test);
    expect(rs.map(r => r.tool)).toEqual(['get_group_context', 'send_approved_message', 'request_human_confirmation', 'update_incident_state', 'schedule_followup']);
    expect(rs.every(r => r.status.tag === 'executed' && r.simulated === true)).toBe(true);
    expect(rs.every(r => r.idempotencyKey.startsWith(`${job(s.test).id}:1:`))).toBe(true);

    const j = job(s.test);
    expect(j.status.tag).toBe('waiting_for_ack');
    expect(j.planVersion).toBe(1);
    expect(j.wakeCount).toBe(1);
    expect(events(s.test, incident.id)).toContain('agent_plan');
    expect(m.myAgentJobs(s.test.viewContext(s.maya))[0]!.subjectName).toBe('Sam');
    expect(m.myNotifications(s.test.viewContext(s.maya))).toHaveLength(2);
    expect(m.myNotifications(s.test.viewContext(s.jordan))).toHaveLength(0);
    expect(m.myAgentActions(s.test.viewContext(s.outsider))).toHaveLength(0);
  });

  it('live step: executes Nemotron tool calls, records the model, and sends the request to /chat/completions', () => {
    const s = setup();
    reportDriverConcern(s);
    const maya = s.id(s.maya).toHexString();
    const bodies: string[] = [];
    const run = runPendingWakes(s.test, {
      env: { NEMOTRON_API_KEY: 'test-key', NEMOTRON_MODEL: 'nvidia/test-model' },
      responder: (_req, body) => {
        bodies.push(body);
        return nemotronReply([
          { name: 'get_group_context', args: {} },
          { name: 'send_approved_message', args: { recipient: maya, template: 'buddy_alert', vars: { subjectName: 'ignored' } } },
          { name: 'request_human_confirmation', args: { userId: maya, question: 'Can you check on Sam?' } },
          { name: 'schedule_followup', args: { delayMinutes: 3 } },
        ]);
      },
    });
    expect(run.requests).toEqual(['https://integrate.api.nvidia.com/v1/chat/completions']);
    const sent = JSON.parse(bodies[0]!);
    expect(sent.model).toBe('nvidia/test-model');
    expect(sent.tool_choice).toBe('auto');
    expect(sent.tools.map((t: { function: { name: string } }) => t.function.name)).toContain('send_approved_message');
    expect(sent.messages[0].role).toBe('system');
    expect(JSON.parse(sent.messages[1].content).context.subject.displayName).toBe('Sam');
    expect(JSON.stringify(sent)).not.toContain('"lat"'); // no coordinates leave the host

    const plan = [...s.test.db.agentPlan.iter()][0]!;
    expect(plan.model).toBe('nvidia/test-model');
    expect(plan.simulated).toBe(false);
    expect(plan.summary).toBe('Contact the primary buddy and follow up.');
    const ns = notifications(s.test);
    expect(ns).toHaveLength(2);
    expect(ns.find(n => n.template === 'buddy_alert')!.body).toContain('Sam may need a hand'); // subjectName is server-filled
    expect(receipts(s.test).every(r => r.status.tag === 'executed' && r.simulated === false)).toBe(true);
    expect(timers(s.test)).toHaveLength(1);
  });

  it('rejects a message to a non-participant and an unknown tool, with receipts and no side effects', () => {
    const s = setup();
    reportDriverConcern(s);
    const outsider = s.id(s.outsider).toHexString();
    runPendingWakes(s.test, {
      env: { NEMOTRON_API_KEY: 'k' },
      responder: () =>
        nemotronReply([
          { name: 'send_approved_message', args: { recipient: outsider, template: 'buddy_alert', vars: {} } },
          { name: 'call_911', args: {} },
          { name: 'send_approved_message', args: { recipient: s.id(s.maya).toHexString(), template: 'free_text', vars: {} } },
        ]),
    });
    const rs = receipts(s.test);
    expect(rs.map(r => [r.tool, r.status.tag])).toEqual([
      ['send_approved_message', 'rejected'],
      ['call_911', 'rejected'],
      ['send_approved_message', 'rejected'],
    ]);
    expect(rs[0]!.rejectReason).toContain('recipient_not_authorized');
    expect(rs[1]!.rejectReason).toBe('tool_not_allowed');
    expect(rs[2]!.rejectReason).toContain('template must be one of');
    expect(notifications(s.test)).toHaveLength(0);
    // the job still waits with a default follow-up so a bad plan never strands the person
    expect(job(s.test).status.tag).toBe('waiting_for_ack');
    expect(timers(s.test)).toHaveLength(1);
  });

  it('falls back to the simulated planner on an HTTP error and on a network failure', () => {
    for (const failure of [reply(500, { error: 'boom' }), new Error('connection reset')] as const) {
      const s = setup();
      reportDriverConcern(s);
      runPendingWakes(s.test, { env: { NEMOTRON_API_KEY: 'k' }, responder: () => failure });
      const plan = [...s.test.db.agentPlan.iter()][0]!;
      expect(plan.simulated).toBe(true);
      expect(plan.model.startsWith('fallback:')).toBe(true);
      expect(notifications(s.test).filter(n => n.template === 'buddy_alert')).toHaveLength(1);
    }
  });

  it('a stale wake is rejected without planning', () => {
    const s = setup();
    reportDriverConcern(s);
    const j = job(s.test);
    s.test.db.agentJob.id.update({ ...j, planVersion: 5 });
    const wake = wakes(s.test)[0]!;
    s.test.db.agentWake.scheduledId.update({ ...wake, planVersion: 1 });
    runPendingWakes(s.test);
    expect([...s.test.db.agentPlan.iter()]).toHaveLength(0);
    const rs = receipts(s.test);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.tool).toBe('agent_step');
    expect(rs[0]!.rejectReason).toBe('stale_plan');
    expect(notifications(s.test)).toHaveLength(0);
  });
});

describe('C3 escalation and acknowledgment', () => {
  it('nonresponse escalates once per tier, messages the backup, then hands off after tier 2', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const j = job(s.test);
    const timer0 = timers(s.test)[0]!;

    // first follow-up: no acknowledgment → escalate to tier 1 and wake buddy_nonresponse
    advance(s.test, 3);
    s.test.withReducerTx(TestAuth.internal(), ctx => m.onFollowupDue(ctx, { arg: timer0 }));
    expect(job(s.test).status.tag).toBe('escalated');
    expect(job(s.test).escalationTier).toBe(1);
    expect(wakes(s.test).map(w => w.event)).toEqual(['buddy_nonresponse']);
    // firing the same (stale, tier 0) timer again does not double-escalate
    s.test.withReducerTx(TestAuth.internal(), ctx => m.onFollowupDue(ctx, { arg: timer0 }));
    expect(job(s.test).escalationTier).toBe(1);
    expect(wakes(s.test)).toHaveLength(1);
    s.test.db.followupTimer.scheduledId.delete(timer0.scheduledId);

    // the escalation step messages Jordan (backup) and not Maya again
    runPendingWakes(s.test);
    const toJordan = notifications(s.test).filter(n => n.recipient.isEqual(s.id(s.jordan)));
    const toMaya = notifications(s.test).filter(n => n.recipient.isEqual(s.id(s.maya)));
    expect(toJordan.map(n => n.template).sort()).toEqual(['ack_request', 'backup_alert']);
    expect(toMaya).toHaveLength(2); // unchanged from plan v1
    expect(toJordan.find(n => n.template === 'backup_alert')!.body).toContain("Maya hasn't responded");
    expect(job(s.test).planVersion).toBe(2);
    expect(job(s.test).status.tag).toBe('waiting_for_ack');
    const timer1 = timers(s.test).find(t => t.tier === 1)!;
    expect(timer1.expectedFrom.isEqual(s.id(s.jordan))).toBe(true);

    // second nonresponse → tier 2 → planner finds nobody fresh → hand_off
    advance(s.test, 3);
    s.test.withReducerTx(TestAuth.internal(), ctx => m.onFollowupDue(ctx, { arg: timer1 }));
    s.test.db.followupTimer.scheduledId.delete(timer1.scheduledId);
    expect(job(s.test).escalationTier).toBe(2);
    runPendingWakes(s.test);
    expect(job(s.test).status.tag).toBe('handed_off');
    expect(receipts(s.test).some(r => r.tool === 'hand_off' && r.status.tag === 'executed')).toBe(true);
    expect(events(s.test, j.incidentId)).toContain('handed_off');
    expect(timers(s.test)).toHaveLength(0);
    // a later timer for a closed job does nothing
    s.test.withReducerTx(TestAuth.internal(), ctx => m.onFollowupDue(ctx, { arg: { ...timer1, tier: 2 } }));
    expect(job(s.test).status.tag).toBe('handed_off');
  });

  it('tier > 2 via timers alone hands off even without a planner step', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const base = timers(s.test)[0]!;
    for (const tier of [0, 1, 2]) {
      s.test.withReducerTx(TestAuth.internal(), ctx => m.onFollowupDue(ctx, { arg: { ...base, tier } }));
    }
    expect(job(s.test).status.tag).toBe('handed_off');
  });

  it('acknowledge_assistance: subject rejected; buddy OK; wake buddy_acknowledged exactly once; timers for the tier cleared', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const j = job(s.test);
    expect(() => s.test.withReducerTx(s.sam, ctx => m.acknowledgeAssistance(ctx, { jobId: j.id }))).toThrow("You can't acknowledge your own alert");
    expect(() => s.test.withReducerTx(s.outsider, ctx => m.acknowledgeAssistance(ctx, { jobId: j.id }))).toThrow('Only participants can do that');
    s.test.withReducerTx(s.maya, ctx => m.acknowledgeAssistance(ctx, { jobId: j.id }));
    s.test.withReducerTx(s.maya, ctx => m.acknowledgeAssistance(ctx, { jobId: j.id }));
    expect(wakes(s.test).map(w => w.event)).toEqual(['buddy_acknowledged']);
    expect(timers(s.test)).toHaveLength(0);
    const p = [...s.test.db.incidentParticipant.iter()].find(x => x.userId.isEqual(s.id(s.maya)))!;
    expect(p.acknowledgedAt).toBeDefined();
    expect(notifications(s.test).every(n => n.status.tag === 'acknowledged')).toBe(true);
    // a follow-up that fires after acknowledgment does not escalate
    s.test.withReducerTx(TestAuth.internal(), ctx =>
      m.onFollowupDue(ctx, { arg: { scheduledId: 99n, scheduledAt: { tag: 'Time', value: NOW } as never, jobId: j.id, expectedFrom: s.id(s.maya), tier: 0 } })
    );
    expect(job(s.test).escalationTier).toBe(0);
  });

  it('revoked messaging consent blocks the next outward message to that person', () => {
    const s = setup({ contacts: false });
    s.test.withReducerTx(s.sam, ctx =>
      m.grantConsent(ctx, { recipient: s.id(s.maya), sessionId: s.sessionId, scope: { tag: 'messaging' }, ttlMinutes: 120 })
    );
    reportDriverConcern(s);
    runPendingWakes(s.test);
    expect(notifications(s.test).filter(n => n.template === 'buddy_alert' && n.recipient.isEqual(s.id(s.maya)))).toHaveLength(1);
    const grant = [...s.test.db.consentGrant.iter()][0]!;
    s.test.withReducerTx(s.sam, ctx => m.revokeConsent(ctx, { grantId: grant.id }));
    // a new wake with a model plan that targets Maya again
    const jobId = job(s.test).id;
    s.test.withReducerTx(s.alex, ctx => m.demoWakeAgent(ctx, { jobId, event: 'buddy_nonresponse' }));
    runPendingWakes(s.test, {
      env: { NEMOTRON_API_KEY: 'k' },
      responder: () => nemotronReply([{ name: 'send_approved_message', args: { recipient: s.id(s.maya).toHexString(), template: 'backup_alert', vars: {} } }]),
    });
    const last = receipts(s.test)[receipts(s.test).length - 1]!;
    expect(last.planVersion).toBe(2);
    expect(last.status.tag).toBe('rejected');
    expect(last.rejectReason).toContain('recipient_not_authorized');
    expect(notifications(s.test).filter(n => n.template === 'backup_alert')).toHaveLength(0);
  });

  it('decline_assistance wakes the planner, which moves on to the next contact', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const jobId = job(s.test).id;
    s.test.withReducerTx(s.maya, ctx => m.declineAssistance(ctx, { jobId, reason: 'at work' }));
    expect(wakes(s.test).map(w => w.event)).toEqual(['buddy_declined']);
    runPendingWakes(s.test);
    expect(notifications(s.test).filter(n => n.recipient.isEqual(s.id(s.jordan)) && n.template === 'backup_alert')).toHaveLength(1);
  });
});

describe('C3 transport and closure', () => {
  const nominatim = reply(200, [{ lat: '40.7', lon: '-74.0', display_name: 'Downtown' }]);
  const osrm = reply(200, { routes: [{ duration: 840, distance: 6200 }] });

  function ackedWithLocation() {
    const s = setup();
    s.test.withReducerTx(s.sam, ctx => m.setSharingScope(ctx, { sessionId: s.sessionId, scope: { tag: 'approximate' } }));
    s.test.withReducerTx(s.sam, ctx => m.postLocation(ctx, { sessionId: s.sessionId, lat: 40.75, lng: -73.99, accuracyM: 20, source: { tag: 'simulated' } }));
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const jobId = job(s.test).id; // read outside the transaction: harness reads inside a tx deadlock the datastore
    s.test.withReducerTx(s.maya, ctx => m.acknowledgeAssistance(ctx, { jobId }));
    return s;
  }

  it('buddy_acknowledged: fetches transport (Nominatim + OSRM), proposes a ride plan, job transport_pending', () => {
    const s = ackedWithLocation();
    const replies = [nominatim, osrm];
    const run = runPendingWakes(s.test, { responder: () => replies.shift() ?? new Error('unexpected request') });
    expect(run.events).toEqual(['buddy_acknowledged']);
    expect(run.requests[0]).toContain('nominatim.openstreetmap.org/search?q=Downtown');
    expect(run.requests[1]).toContain('router.project-osrm.org/route/v1/driving/-74,40.7;-73.99,40.75');
    const transport = receipts(s.test).find(r => r.tool === 'get_transport_options')!;
    expect(transport.status.tag).toBe('executed');
    expect(transport.simulated).toBe(false);
    const result = JSON.parse(transport.resultJson);
    expect(result.status).toBe('ok');
    expect(result.options[0]).toMatchObject({ source: 'osrm', durationMinutes: 14, distanceKm: 6.2 });
    expect(result.options.some((o: { label: string }) => o.label === 'Uber')).toBe(true);
    expect(result.pickup).toEqual({ lat: 40.75, lng: -73.99, approximate: true });
    const plans = [...s.test.db.ridePlan.iter()];
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status.tag).toBe('proposed');
    expect(plans[0]!.riderId.isEqual(s.id(s.sam))).toBe(true);
    expect(JSON.parse(plans[0]!.optionsJson).options).toHaveLength(4);
    expect(job(s.test).status.tag).toBe('transport_pending');
    expect(m.myRidePlans(s.test.viewContext(s.jordan))).toHaveLength(1);
    expect(m.myRidePlans(s.test.viewContext(s.outsider))).toHaveLength(0);
  });

  it('transport lookup failure is a failed receipt with provider links only, nothing invented', () => {
    const s = ackedWithLocation();
    const replies = [nominatim, reply(503)];
    runPendingWakes(s.test, { responder: () => replies.shift() ?? new Error('unexpected request') });
    const transport = receipts(s.test).find(r => r.tool === 'get_transport_options')!;
    expect(transport.status.tag).toBe('failed');
    const result = JSON.parse(transport.resultJson);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('osrm_http_503');
    expect(result.options.every((o: { source: string }) => o.source === 'provider_link')).toBe(true);
    // the ride plan still exists with the provider links, so a human can book
    expect([...s.test.db.ridePlan.iter()]).toHaveLength(1);
    expect(job(s.test).status.tag).toBe('transport_pending');
  });

  it('ride: accept → booked (incident transport_arranged, job awaiting_home_confirmation) → pickup → home confirmed by the subject only', () => {
    const s = ackedWithLocation();
    const replies = [nominatim, osrm];
    runPendingWakes(s.test, { responder: () => replies.shift() ?? new Error('unexpected request') });
    const plan = [...s.test.db.ridePlan.iter()][0]!;
    const j = job(s.test);
    expect(() => s.test.withReducerTx(s.jordan, ctx => m.acceptRideOption(ctx, { ridePlanId: plan.id, option: 'Uber' }))).toThrow(
      'Only the rider or a helper with their messaging consent can choose a ride'
    );
    s.test.withReducerTx(s.sam, ctx => m.acceptRideOption(ctx, { ridePlanId: plan.id, option: 'Uber' }));
    expect(() => s.test.withReducerTx(s.maya, ctx => m.confirmRideBooked(ctx, { ridePlanId: plan.id }))).toThrow(
      'Only the rider or the helper who chose the ride can confirm the booking'
    );
    expect(() => s.test.withReducerTx(s.sam, ctx => m.confirmHome(ctx, { incidentId: j.incidentId }))).toThrow('Home confirmation applies once transport is arranged');
    s.test.withReducerTx(s.sam, ctx => m.confirmRideBooked(ctx, { ridePlanId: plan.id }));
    expect(s.test.db.incident.id.find(j.incidentId)!.status.tag).toBe('transport_arranged');
    expect(job(s.test).status.tag).toBe('awaiting_home_confirmation');
    expect(wakes(s.test).map(w => w.event)).toEqual(['ride_booked']);
    runPendingWakes(s.test);
    expect(notifications(s.test).filter(n => n.template === 'ride_booked' && n.recipient.isEqual(s.id(s.maya)))).toHaveLength(1);
    expect(job(s.test).status.tag).toBe('awaiting_home_confirmation'); // unchanged by the ride_booked plan
    expect(() => s.test.withReducerTx(s.maya, ctx => m.confirmPickup(ctx, { ridePlanId: plan.id }))).toThrow('Only the rider can confirm the pickup');
    s.test.withReducerTx(s.sam, ctx => m.confirmPickup(ctx, { ridePlanId: plan.id }));
    expect(() => s.test.withReducerTx(s.maya, ctx => m.confirmHome(ctx, { incidentId: j.incidentId }))).toThrow(
      'Only the person the incident is about can confirm they are home'
    );
    s.test.withReducerTx(s.sam, ctx => m.confirmHome(ctx, { incidentId: j.incidentId }));
    expect(s.test.db.incident.id.find(j.incidentId)!.status.tag).toBe('resolved');
    expect(job(s.test).status.tag).toBe('resolved');
    expect(timers(s.test)).toHaveLength(0);
    expect(wakes(s.test)).toHaveLength(0);
    expect(s.test.db.ridePlan.id.find(plan.id)!.status.tag).toBe('completed');
  });

  it('human resolution closes the job; a late wake is rejected as job_closed', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const j = job(s.test);
    s.test.withReducerTx(s.sam, ctx => m.resolveIncident(ctx, { incidentId: j.incidentId, note: 'Got a ride with Alex' }));
    expect(job(s.test).status.tag).toBe('resolved');
    expect(timers(s.test)).toHaveLength(0);
    // demo wake on a closed job is refused; a raw wake row is rejected by the step
    expect(() => s.test.withReducerTx(s.alex, ctx => m.demoWakeAgent(ctx, { jobId: j.id, event: 'buddy_nonresponse' }))).toThrow('This job is closed');
    s.test.db.agentWake.insert({ scheduledId: 0n, scheduledAt: { tag: 'Time', value: NOW } as never, jobId: j.id, event: 'buddy_nonresponse', planVersion: 0 });
    runPendingWakes(s.test);
    expect(receipts(s.test)[receipts(s.test).length - 1]!.rejectReason).toBe('job_closed');
    expect([...s.test.db.agentPlan.iter()]).toHaveLength(1);
  });

  it('deliver_notification: simulated delivery marks sent with simulated=true and writes the timeline event', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const dispatches = [...s.test.db.notificationDispatch.iter()];
    expect(dispatches.length).toBeGreaterThan(0);
    for (const d of dispatches) {
      s.test.db.notificationDispatch.scheduledId.delete(d.scheduledId);
      const ctx = s.test.procedureContextBuilder(TestAuth.internal()).build();
      m.deliverNotification(ctx as never, { arg: d });
    }
    const ns = notifications(s.test);
    expect(ns.every(n => n.status.tag === 'sent' && n.simulated === true && n.channel.tag === 'in_app')).toBe(true);
    const kinds = events(s.test, job(s.test).incidentId);
    expect(kinds.filter(k => k === 'message_sent')).toHaveLength(ns.length);
    // delivering twice is a no-op
    m.deliverNotification(s.test.procedureContextBuilder(TestAuth.internal()).build() as never, { arg: dispatches[0]! });
    expect(events(s.test, job(s.test).incidentId).filter(k => k === 'message_sent')).toHaveLength(ns.length);
  });

  it('demo_fire_followup runs the earliest timer now and refuses when none is open', () => {
    const s = setup();
    reportDriverConcern(s);
    runPendingWakes(s.test);
    const jobId = job(s.test).id;
    s.test.withReducerTx(s.alex, ctx => m.demoFireFollowup(ctx, { jobId }));
    expect(job(s.test).escalationTier).toBe(1);
    expect(timers(s.test)).toHaveLength(0);
    expect(() => s.test.withReducerTx(s.alex, ctx => m.demoFireFollowup(ctx, { jobId }))).toThrow('No open follow-up timer');
  });
});

describe('hand-off never targets the suspected driver', () => {
  it('hands off to the reporter when the organizer is the incident subject', () => {
    const test = makeHarness();
    test.clock.set(NOW);
    const sam = principal('sam-organizer');
    const alex = principal('alex-participant');
    const id = (auth: TestAuth): Identity => test.viewContext(auth).sender;
    test.withReducerTx(sam, ctx => m.setProfile(ctx, { displayName: 'Sam', avatarEmoji: '🚗' }));
    test.withReducerTx(alex, ctx => m.setProfile(ctx, { displayName: 'Alex', avatarEmoji: '🦊' }));
    // Sam organizes AND drives; nobody is a trusted contact, so the planner must hand off.
    test.withReducerTx(sam, ctx =>
      m.createSession(ctx, { name: 'Solo organizer', venueHint: '', startsAt: NOW, expiresAt: plus(300), checkinIntervalMinutes: 60 })
    );
    const session = [...test.db.nightSession.iter()][0]!;
    test.withReducerTx(sam, ctx => m.createInvite(ctx, { sessionId: session.id, ttlMinutes: 60, maxUses: 4 }));
    const code = [...test.db.invite.iter()][0]!.code;
    test.withReducerTx(alex, ctx => m.joinSession(ctx, { code }));
    test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    const assignment = [...test.db.driverAssignment.iter()][0]!;
    test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: assignment.id }));
    test.withReducerTx(alex, ctx =>
      m.reportConcern(ctx, { sessionId: session.id, subject: id(sam), category: { tag: 'possible_consumption' }, note: 'Had a few' })
    );

    runPendingWakes(test);

    expect(job(test).status.tag).toBe('handed_off');
    const incident = [...test.db.incident.iter()][0]!;
    expect(events(test, incident.id)).toContain('handed_off');
    // Event-table rows are gone after commit, so check the recipient rule directly.
    const takers = test.withReducerTx(alex, ctx => handoffRecipients(ctx as never, incident).map(i => i.toHexString()));
    expect(takers).toEqual([id(alex).toHexString()]);
  });
});
