import { describe, expect, it } from 'vitest';
import { ConnectionId, Identity, Timestamp, TimeDuration } from 'spacetimedb';
import type { ProcedureCtx } from 'spacetimedb/server';
import { createModuleTestHarness, TestAuth, type TestHttpResponse } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';
import { parseForm, MAX_WEBHOOK_BODY_BYTES } from './lib/http';
import { LIMITS } from './lib/limits';

let nextConnection = 1900n;
function principal(subject: string) {
  return TestAuth.fromJwtPayload(JSON.stringify({ iss: 'https://safenight.test', sub: subject }), new ConnectionId(nextConnection++));
}
const NOW = Timestamp.fromDate(new Date('2026-11-07T22:00:00Z'));
const MIN = 60_000_000n;
const plus = (minutes: number) => new Timestamp(NOW.microsSinceUnixEpoch + BigInt(minutes) * MIN);
function makeHarness() {
  return createModuleTestHarness(spacetimedb, m);
}
type Harness = ReturnType<typeof makeHarness>;
type PCtx = ProcedureCtx<never>;

/** Alex organizes, Sam is the accepted driver, Maya buddy #1, Jordan backup #2, Outsider is in no session. */
function setup() {
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
    m.createSession(ctx, { name: 'Friday Night', venueHint: 'Deep Ellum, Dallas, TX', startsAt: NOW, expiresAt: plus(300), checkinIntervalMinutes: 60 })
  );
  const session = [...test.db.nightSession.iter()][0]!;
  test.withReducerTx(alex, ctx => m.createInvite(ctx, { sessionId: session.id, ttlMinutes: 60, maxUses: 10 }));
  const code = [...test.db.invite.iter()][0]!.code;
  for (const auth of [sam, maya, jordan]) test.withReducerTx(auth, ctx => m.joinSession(ctx, { code }));
  test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
  const assignment = [...test.db.driverAssignment.iter()][0]!;
  test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: assignment.id }));
  test.withReducerTx(sam, ctx => m.addTrustedContact(ctx, { contact: id(maya), role: { tag: 'buddy' }, messagingConsent: true, priority: 1 }));
  test.withReducerTx(sam, ctx => m.addTrustedContact(ctx, { contact: id(jordan), role: { tag: 'backup_buddy' }, messagingConsent: true, priority: 2 }));
  return { test, alex, sam, maya, jordan, outsider, id, sessionId: session.id };
}
type S = ReturnType<typeof setup>;

const reportDriverConcern = (s: S, note = 'Had a few') =>
  s.test.withReducerTx(s.alex, ctx =>
    m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.sam), category: { tag: 'possible_consumption' }, note })
  );
const receipts = (test: Harness) => [...test.db.agentAction.iter()].sort((a, b) => Number(a.id - b.id));

const reply = (code: number, body?: unknown): TestHttpResponse => ({
  code,
  headers: { entries: [] },
  version: { tag: 'Http11' },
  body: body === undefined ? '' : JSON.stringify(body),
});
const nemotronReply = (toolCalls: { name: string; args: unknown }[]) =>
  reply(200, {
    model: 'nvidia/test-model',
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'test plan',
          tool_calls: toolCalls.map((c, i) => ({ id: `c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
        },
      },
    ],
  });

function withEnv<T extends object>(ctx: T, env: Record<string, string>): T {
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'env') return env;
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Run every pending wake through agent_step with a scripted model. */
function runWakes(test: Harness, responder?: (req: { uri: string }, body: string) => TestHttpResponse) {
  for (const wake of [...test.db.agentWake.iter()]) {
    let ctx = test
      .procedureContextBuilder(TestAuth.internal())
      .http((_t, req, body) => {
        if (!responder) throw new Error('no responder');
        return responder(req, new TextDecoder().decode(body));
      })
      .build() as unknown as PCtx;
    if (responder) ctx = withEnv(ctx, { NEMOTRON_API_KEY: 'test-key' });
    test.db.agentWake.scheduledId.delete(wake.scheduledId);
    m.agentStep(ctx as never, { arg: wake });
  }
}

describe('security review: phone numbers are private', () => {
  it('set_phone stores the number in user_phone, never on the public profile; only the owner reads it', () => {
    const s = setup();
    s.test.withReducerTx(s.sam, ctx => m.setPhone(ctx, { phoneE164: '+15551234567' }));
    expect(s.test.db.userProfile.identity.find(s.id(s.sam))!.phoneE164).toBe('');
    expect(s.test.db.userPhone.identity.find(s.id(s.sam))!.phoneE164).toBe('+15551234567');
    expect(m.myPhone(s.test.viewContext(s.sam))?.phoneE164).toBe('+15551234567');
    expect(m.myPhone(s.test.viewContext(s.maya))).toBeUndefined();
    // Editing the profile later never resurrects a public phone.
    s.test.withReducerTx(s.sam, ctx => m.setProfile(ctx, { displayName: 'Sam R', avatarEmoji: '🚗' }));
    expect(s.test.db.userProfile.identity.find(s.id(s.sam))!.phoneE164).toBe('');
    // Clearing deletes the private row.
    s.test.withReducerTx(s.sam, ctx => m.setPhone(ctx, { phoneE164: '' }));
    expect(s.test.db.userPhone.identity.find(s.id(s.sam))).toBeNull();
    expect(() => s.test.withReducerTx(s.sam, ctx => m.setPhone(ctx, { phoneE164: '555-1234' }))).toThrow('E.164');
  });

  it('a number left on the public row by an older module version is moved to user_phone on the next profile edit', () => {
    const s = setup();
    const sam = s.id(s.sam);
    const row = s.test.db.userProfile.identity.find(sam)!;
    s.test.db.userProfile.identity.update({ ...row, phoneE164: '+15550001111' });
    s.test.withReducerTx(s.sam, ctx => m.setProfile(ctx, { displayName: 'Sam', avatarEmoji: '🚗' }));
    expect(s.test.db.userProfile.identity.find(sam)!.phoneE164).toBe('');
    expect(s.test.db.userPhone.identity.find(sam)!.phoneE164).toBe('+15550001111');
  });
});

describe('security review: no model text reaches messages, no coordinates reach receipts', () => {
  it('model-supplied template vars are ignored and free-text templates are not selectable', () => {
    const s = setup();
    reportDriverConcern(s);
    const maya = s.id(s.maya).toHexString();
    runWakes(s.test, () =>
      nemotronReply([
        { name: 'send_approved_message', args: { recipient: maya, template: 'buddy_alert', vars: { subjectName: 'INJECTED NAME' } } },
        { name: 'send_approved_message', args: { recipient: maya, template: 'incident_update', vars: { detail: 'call 555-0100 now' } } },
        { name: 'send_approved_message', args: { recipient: maya, template: 'organizer_handoff' } },
      ])
    );
    const bodies = [...s.test.db.notification.iter()].map(n => n.body);
    expect(bodies.some(b => b.includes('Sam may need a hand'))).toBe(true);
    expect(bodies.join('\n')).not.toContain('INJECTED');
    expect(bodies.join('\n')).not.toContain('555-0100');
    const rs = receipts(s.test).filter(r => r.tool === 'send_approved_message' && r.source === 'model');
    expect(rs[0]!.status.tag).toBe('executed');
    expect(rs[1]!.rejectReason).toContain('template must be one of');
    expect(rs[2]!.rejectReason).toContain('template must be one of');
    expect(JSON.stringify(rs[0]!.argsJson)).not.toContain('INJECTED');
  });

  it('get_last_shared_location returns age and accuracy only', () => {
    const s = setup();
    s.test.withReducerTx(s.sam, ctx => m.setSharingScope(ctx, { sessionId: s.sessionId, scope: { tag: 'precise' } }));
    s.test.withReducerTx(s.sam, ctx => m.postLocation(ctx, { sessionId: s.sessionId, lat: 32.7851, lng: -96.7826, accuracyM: 20, source: { tag: 'simulated' } }));
    reportDriverConcern(s);
    runWakes(s.test, () => nemotronReply([{ name: 'get_last_shared_location', args: { userId: s.id(s.sam).toHexString() } }]));
    const r = receipts(s.test).find(x => x.tool === 'get_last_shared_location')!;
    expect(r.status.tag).toBe('executed');
    expect(r.resultJson).not.toContain('lat');
    expect(r.resultJson).not.toContain('lng');
    expect(JSON.parse(r.resultJson)).toMatchObject({ available: true, ageMinutes: 0 });
  });
});

describe('security review: the subject never learns who reported them', () => {
  it('masks the reporter in my_incidents, my_incident_participants and my_incident_events for the subject only', () => {
    const s = setup();
    // Maya (a buddy, not the organizer) reports the driver.
    s.test.withReducerTx(s.maya, ctx =>
      m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.sam), category: { tag: 'possible_consumption' }, note: 'Sam had a few' })
    );
    const maya = s.id(s.maya);
    const asSam = s.test.viewContext(s.sam);
    const asJordan = s.test.viewContext(s.jordan);

    const samInc = m.myIncidents(asSam)[0]!;
    expect(samInc.openedBy.isEqual(Identity.zero())).toBe(true);
    const jordanInc = m.myIncidents(asJordan)[0]!;
    expect(jordanInc.openedBy.isEqual(maya)).toBe(true);

    expect(m.myIncidentParticipants(asSam).some(p => p.role.tag === 'reporter')).toBe(false);
    expect(m.myIncidentParticipants(asJordan).some(p => p.role.tag === 'reporter' && p.userId.isEqual(maya))).toBe(true);

    const samOpened = m.myIncidentEvents(asSam).find(e => e.kind === 'opened')!;
    expect(samOpened.actorName).toBe('A group member');
    expect(samOpened.actor.isEqual(Identity.zero())).toBe(true);
    const jordanOpened = m.myIncidentEvents(asJordan).find(e => e.kind === 'opened')!;
    expect(jordanOpened.actorName).toBe('Maya');
    // Events by other people (e.g. Jordan acknowledging) stay attributed for the subject.
    s.test.withReducerTx(s.jordan, ctx => m.acknowledgeIncident(ctx, { incidentId: samInc.id }));
    expect(m.myIncidentEvents(asSam).find(e => e.kind === 'acknowledged')!.actorName).toBe('Jordan');
  });
});

describe('security review: rate limits', () => {
  it('caps check-ins per minute and location posts per minute', () => {
    const s = setup();
    for (let i = 0; i < LIMITS.checkinsPerMinute; i++) {
      s.test.withReducerTx(s.maya, ctx => m.checkIn(ctx, { sessionId: s.sessionId, kind: { tag: 'okay' }, note: '' }));
    }
    expect(() => s.test.withReducerTx(s.maya, ctx => m.checkIn(ctx, { sessionId: s.sessionId, kind: { tag: 'okay' }, note: '' }))).toThrow('Too many check-ins');
    s.test.clock.advance(TimeDuration.fromMillis(61_000));
    s.test.withReducerTx(s.maya, ctx => m.checkIn(ctx, { sessionId: s.sessionId, kind: { tag: 'okay' }, note: '' }));

    s.test.withReducerTx(s.sam, ctx => m.setSharingScope(ctx, { sessionId: s.sessionId, scope: { tag: 'approximate' } }));
    for (let i = 0; i < LIMITS.locationsPerMinute; i++) {
      s.test.withReducerTx(s.sam, ctx => m.postLocation(ctx, { sessionId: s.sessionId, lat: 32.78, lng: -96.78, accuracyM: 10, source: { tag: 'simulated' } }));
    }
    expect(() =>
      s.test.withReducerTx(s.sam, ctx => m.postLocation(ctx, { sessionId: s.sessionId, lat: 32.78, lng: -96.78, accuracyM: 10, source: { tag: 'simulated' } }))
    ).toThrow('Too many location updates');
  });

  it('caps concern reports per reporter per hour (beyond the duplicate suppression)', () => {
    const s = setup();
    const cats = ['separated', 'unwell', 'unsafe'] as const;
    let filed = 0;
    for (let round = 0; filed < LIMITS.concernsPerHour; round++) {
      for (const c of cats) {
        if (filed >= LIMITS.concernsPerHour) break;
        s.test.withReducerTx(s.alex, ctx => m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.jordan), category: { tag: c }, note: '' }));
        filed++;
      }
      s.test.clock.advance(TimeDuration.fromMillis(5 * 60_000)); // new dedupe bucket
    }
    expect(() =>
      s.test.withReducerTx(s.alex, ctx => m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.jordan), category: { tag: 'separated' }, note: '' }))
    ).toThrow('several concerns this hour');
    // Another reporter is not affected.
    s.test.withReducerTx(s.maya, ctx => m.reportConcern(ctx, { sessionId: s.sessionId, subject: s.id(s.jordan), category: { tag: 'separated' }, note: '' }));
  });

  it('caps open invites per session, venue reports per author per hour, and venues per creator per hour', () => {
    const s = setup();
    for (let i = 1; i < LIMITS.openInvitesPerSession; i++) {
      s.test.withReducerTx(s.alex, ctx => m.createInvite(ctx, { sessionId: s.sessionId, ttlMinutes: 60, maxUses: 1 }));
    }
    expect(() => s.test.withReducerTx(s.alex, ctx => m.createInvite(ctx, { sessionId: s.sessionId, ttlMinutes: 60, maxUses: 1 }))).toThrow('Too many open invites');

    for (let i = 0; i < LIMITS.venuesPerHour; i++) {
      s.test.withReducerTx(s.maya, ctx => m.createVenue(ctx, { name: `Venue ${i}`, approxLat: 32.78 + i / 100, approxLng: -96.78 }));
    }
    expect(() => s.test.withReducerTx(s.maya, ctx => m.createVenue(ctx, { name: 'One more', approxLat: 32.9, approxLng: -96.9 }))).toThrow('several venues this hour');

    const venueId = [...s.test.db.venue.iter()][0]!.id;
    const categories = ['crowding', 'blocked_exit', 'aggressive_behavior', 'drink_tampering', 'water_available', 'medical_staff', 'lighting', 'unsafe_pickup', 'other'] as const;
    for (let i = 0; i < LIMITS.venueReportsPerHour; i++) {
      s.test.withReducerTx(s.jordan, ctx => m.submitVenueReport(ctx, { venueId, category: { tag: categories[i]! }, text: `observation ${i}` }));
    }
    expect(() =>
      s.test.withReducerTx(s.jordan, ctx => m.submitVenueReport(ctx, { venueId, category: { tag: categories[LIMITS.venueReportsPerHour]! }, text: 'one more' }))
    ).toThrow('several reports this hour');
  });
});

describe('security review: erasure and demo guards', () => {
  it('delete_my_data also removes the private phone and demo persona rows; nothing keyed by the identity remains', () => {
    const s = setup();
    const sam = s.id(s.sam);
    s.test.withReducerTx(s.sam, ctx => m.setPhone(ctx, { phoneE164: '+15551234567' }));
    s.test.withReducerTx(s.sam, ctx => m.demoRegisterPersona(ctx, { personaId: 'sam', displayName: 'Sam', avatarEmoji: '🚗' }));
    s.test.withReducerTx(s.sam, ctx => m.setPrivacySettings(ctx, { defaultSharingScope: { tag: 'approximate' }, defaultConsentTtlMinutes: 60, allowBuddyAlerts: true, allowGroupAlerts: true, retainCheckinsDays: 7 }));
    s.test.withReducerTx(s.sam, ctx => m.deleteMyData(ctx, {}));
    const db = s.test.db;
    const remaining = [
      db.userProfile.identity.find(sam),
      db.userPhone.identity.find(sam),
      db.userPrivacySettings.identity.find(sam),
      db.demoPersona.identity.find(sam),
      db.appRole.identity.find(sam),
      ...db.trustedContact.owner.filter(sam),
      ...db.consentGrant.subject.filter(sam),
      ...db.latestLocation.userId.filter(sam),
      ...db.locationUpdate.userId.filter(sam),
      ...db.checkin.userId.filter(sam),
      ...db.consumptionSelfReport.userId.filter(sam),
      ...db.notification.recipient.filter(sam),
      ...db.venueReportAuthor.author.filter(sam),
      ...db.venueReportVote.voter.filter(sam),
      ...db.checkinTimer.userId.filter(sam),
    ].filter(x => x !== null && x !== undefined);
    expect(remaining).toHaveLength(0);
    const personas = s.test.runQuery<{ identity: Identity }>(m.demoPersonas(s.test.anonymousViewContext()));
    expect(personas.some(p => p.identity.isEqual(sam))).toBe(false);
  });

  it('only a registered demo persona (or the owner) can build or reset the demo group', () => {
    const s = setup();
    for (const [auth, pid] of [[s.alex, 'alex'], [s.sam, 'sam'], [s.maya, 'maya'], [s.jordan, 'jordan']] as const) {
      s.test.withReducerTx(auth, ctx => m.demoRegisterPersona(ctx, { personaId: pid, displayName: pid, avatarEmoji: '🙂' }));
    }
    expect(() => s.test.withReducerTx(s.outsider, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }))).toThrow('Register as a demo persona first');
    expect(() => s.test.withReducerTx(s.outsider, ctx => m.demoResetGroup(ctx, {}))).toThrow('Register as a demo persona first');
    s.test.withReducerTx(s.maya, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    expect([...s.test.db.demoSession.iter()]).toHaveLength(1);
  });
});

describe('security review: agent cannot abandon a ride in progress; slots are server-filled', () => {
  it('rejects hand_off outside the contact-seeking events and records no_action instead', () => {
    const s = setup();
    reportDriverConcern(s);
    runWakes(s.test); // simulated plan v1 messages Maya
    const j = [...s.test.db.agentJob.iter()][0]!;
    s.test.db.agentJob.id.update({ ...j, status: { tag: 'awaiting_home_confirmation' } });
    s.test.withReducerTx(s.alex, ctx => m.demoWakeAgent(ctx, { jobId: j.id, event: 'pickup_confirmed' }));
    runWakes(s.test, () => nemotronReply([{ name: 'hand_off', args: { reason: 'Pickup confirmed and ride arranged; no eligible contact needed' } }]));
    const handoff = receipts(s.test).find(r => r.tool === 'hand_off')!;
    expect(handoff.status.tag).toBe('rejected');
    expect(handoff.rejectReason).toBe('hand_off_not_applicable');
    expect(s.test.db.agentJob.id.find(j.id)!.status.tag).toBe('awaiting_home_confirmation');
    expect([...s.test.db.incidentEvent.incidentId.filter(j.incidentId)].map(e => e.kind)).not.toContain('handed_off');

    s.test.withReducerTx(s.alex, ctx => m.demoWakeAgent(ctx, { jobId: j.id, event: 'ride_booked' }));
    runWakes(s.test, () => nemotronReply([{ name: 'no_action', args: { reason: 'ride booked; nothing missing' } }]));
    const noop = receipts(s.test).find(r => r.tool === 'no_action')!;
    expect(noop.status.tag).toBe('executed');
    expect(noop.resultText).toBe('No action needed');
    expect(s.test.db.agentJob.id.find(j.id)!.status.tag).toBe('awaiting_home_confirmation');
  });

  it('rejects hand_off while an eligible contact remains, even for incident_opened', () => {
    const s = setup();
    reportDriverConcern(s);
    runWakes(s.test, () => nemotronReply([{ name: 'hand_off', args: { reason: 'giving up early' } }]));
    const handoff = receipts(s.test).find(r => r.tool === 'hand_off')!;
    expect(handoff.rejectReason).toBe('hand_off_not_applicable');
    expect(s.test.db.agentJob.id.find([...s.test.db.agentJob.iter()][0]!.id)!.status.tag).not.toBe('handed_off');
  });

  it('backup_alert names the contact who did not respond, filled by the server', () => {
    const s = setup();
    reportDriverConcern(s);
    runWakes(s.test); // Maya is messaged
    const j = [...s.test.db.agentJob.iter()][0]!;
    s.test.withReducerTx(s.alex, ctx => m.demoFireFollowup(ctx, { jobId: j.id })); // Maya did not respond
    runWakes(s.test, () =>
      nemotronReply([{ name: 'send_approved_message', args: { recipient: s.id(s.jordan).toHexString(), template: 'backup_alert', vars: {} } }])
    );
    const backup = [...s.test.db.notification.iter()].find(n => n.template === 'backup_alert')!;
    expect(backup.body).toContain("Maya hasn't responded");
    expect(backup.body).toContain('Sam may need a hand');
    expect(backup.body).not.toContain('…');
  });
});

describe('security review: known_people', () => {
  it('lists only people who share an active session with the caller', () => {
    const s = setup();
    const names = (auth: TestAuth) => m.knownPeople(s.test.viewContext(auth)).map(p => p.displayName).sort();
    expect(names(s.alex)).toEqual(['Alex', 'Jordan', 'Maya', 'Sam']);
    expect(names(s.outsider)).toEqual(['Outsider']);
    s.test.withReducerTx(s.jordan, ctx => m.leaveSession(ctx, { sessionId: s.sessionId }));
    expect(names(s.alex)).toEqual(['Alex', 'Maya', 'Sam']);
  });
});

describe('security review: webhook parsing', () => {
  it('parses form bodies, tolerates malformed escapes, and bounds the body size', () => {
    expect(parseForm('MessageSid=SM1&MessageStatus=delivered&To=%2B1555')).toEqual({ MessageSid: 'SM1', MessageStatus: 'delivered', To: '+1555' });
    expect(parseForm('a=%E0%A4%A')).toBeUndefined();
    expect(MAX_WEBHOOK_BODY_BYTES).toBe(65536);
  });
});
