import { describe, expect, it } from 'vitest';
import { ConnectionId, ScheduleAt, Timestamp, TimeDuration, type Identity } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';

let nextConnection = 500n;
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

/** Four personas in one session: Alex organizer, Sam accepted driver, Maya and Jordan participants. */
function setup() {
  const test = makeHarness();
  test.clock.set(NOW);
  const alex = principal('alex');
  const sam = principal('sam');
  const maya = principal('maya');
  const jordan = principal('jordan');
  const outsider = principal('outsider');
  const id = (auth: TestAuth): Identity => test.viewContext(auth).sender;
  for (const [auth, name] of [
    [alex, 'Alex'],
    [sam, 'Sam'],
    [maya, 'Maya'],
    [jordan, 'Jordan'],
    [outsider, 'Outsider'],
  ] as const) {
    test.withReducerTx(auth, ctx => m.setProfile(ctx, { displayName: name, avatarEmoji: '🙂' }));
  }
  test.withReducerTx(alex, ctx =>
    m.createSession(ctx, { name: 'Friday Night', venueHint: 'Downtown', startsAt: NOW, expiresAt: plus(300), checkinIntervalMinutes: 30 })
  );
  const session = [...test.db.nightSession.iter()][0]!;
  test.withReducerTx(alex, ctx => m.createInvite(ctx, { sessionId: session.id, ttlMinutes: 60, maxUses: 10 }));
  const code = [...test.db.invite.iter()][0]!.code;
  for (const auth of [sam, maya, jordan]) test.withReducerTx(auth, ctx => m.joinSession(ctx, { code }));
  test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
  const assignment = [...test.db.driverAssignment.iter()][0]!;
  test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: assignment.id }));
  return { test, alex, sam, maya, jordan, outsider, id, sessionId: session.id };
}

const grant = (test: Harness, from: TestAuth, to: Identity, sessionId: bigint, scope: string, ttl = 60) =>
  test.withReducerTx(from, ctx =>
    m.grantConsent(ctx, { recipient: to, sessionId, scope: { tag: scope } as never, ttlMinutes: ttl })
  );
const share = (test: Harness, who: TestAuth, sessionId: bigint, scope: string) =>
  test.withReducerTx(who, ctx => m.setSharingScope(ctx, { sessionId, scope: { tag: scope } as never }));
const post = (test: Harness, who: TestAuth, sessionId: bigint, lat: number, lng: number) =>
  test.withReducerTx(who, ctx =>
    m.postLocation(ctx, { sessionId, lat, lng, accuracyM: 12, source: { tag: 'simulated' } })
  );
const visible = (test: Harness, who: TestAuth) => m.visibleLocations(test.viewContext(who));
const incidents = (test: Harness) => [...test.db.incident.iter()];
const events = (test: Harness, incidentId: bigint) => [...test.db.incidentEvent.incidentId.filter(incidentId)];

describe('C2 locations', () => {
  it('rejects posting while sharing is off, then stores and upserts latest_location', () => {
    const { test, sam, sessionId } = setup();
    expect(() => post(test, sam, sessionId, 40.1, -74.1)).toThrow('Turn on location sharing first');
    share(test, sam, sessionId, 'precise');
    post(test, sam, sessionId, 40.1, -74.1);
    post(test, sam, sessionId, 40.2, -74.2);
    expect(test.db.locationUpdate.count()).toBe(2n);
    expect(test.db.latestLocation.count()).toBe(1n);
    expect([...test.db.latestLocation.iter()][0]!.lat).toBe(40.2);
  });

  it('is consent-scoped: precise exact, approximate rounded, none hidden, own always visible', () => {
    const { test, sam, maya, jordan, alex, id, sessionId } = setup();
    share(test, sam, sessionId, 'precise');
    post(test, sam, sessionId, 40.123456, -74.654321);
    // Own row always visible, exact.
    const mine = visible(test, sam);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.lat).toBe(40.123456);
    expect(mine[0]!.approximate).toBe(false);
    // No grant → hidden.
    expect(visible(test, maya)).toHaveLength(0);
    // Approximate grant → rounded.
    grant(test, sam, id(maya), sessionId, 'location_approximate');
    const approx = visible(test, maya);
    expect(approx).toHaveLength(1);
    expect(approx[0]!.lat).toBe(40.123);
    expect(approx[0]!.lng).toBe(-74.654);
    expect(approx[0]!.approximate).toBe(true);
    expect(approx[0]!.displayName).toBe('Sam');
    // Precise grant → exact.
    grant(test, sam, id(jordan), sessionId, 'location_precise');
    const precise = visible(test, jordan);
    expect(precise[0]!.lat).toBe(40.123456);
    expect(precise[0]!.approximate).toBe(false);
    // Subject's own scope caps everything: approximate forces rounding even with a precise grant.
    share(test, sam, sessionId, 'approximate');
    expect(visible(test, jordan)[0]!.approximate).toBe(true);
    // Scope none hides even with a grant.
    share(test, sam, sessionId, 'none');
    expect(visible(test, jordan)).toHaveLength(0);
    // Organizer gets nothing without a grant.
    expect(visible(test, alex)).toHaveLength(0);
  });

  it('sweep_locations deletes expired rows and marks expired grants revoked', () => {
    const { test, sam, maya, id, sessionId } = setup();
    share(test, sam, sessionId, 'precise');
    post(test, sam, sessionId, 40, -74);
    grant(test, sam, id(maya), sessionId, 'location_precise', 10);
    advance(test, 16);
    test.withReducerTx(TestAuth.internal(), ctx =>
      m.sweepLocations(ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.interval(60_000_000n) } })
    );
    expect(test.db.locationUpdate.count()).toBe(0n);
    expect(test.db.latestLocation.count()).toBe(0n);
    const g = [...test.db.consentGrant.iter()][0]!;
    expect(g.revokedAt).toBeDefined();
    expect(visible(test, maya)).toHaveLength(0);
  });
});

describe('C2 deterministic safety engine', () => {
  it('a concern about the accepted driver opens an incident and warns in the same transaction', () => {
    const { test, alex, sam, maya, jordan, outsider, id, sessionId } = setup();
    test.withReducerTx(alex, ctx => {
      m.reportConcern(ctx, { sessionId, subject: id(sam), category: { tag: 'possible_consumption' }, note: 'Had a few' });
      const alerts = [...ctx.db.safetyAlert.iter()];
      const warning = alerts.find(a => a.kind.tag === 'no_driving_warning');
      expect(warning).toBeDefined();
      expect(warning!.recipient.isEqual(id(sam))).toBe(true);
      const acks = alerts.filter(a => a.kind.tag === 'ack_requested').map(a => a.recipient.toHexString()).sort();
      expect(acks).toEqual([id(maya).toHexString(), id(jordan).toHexString()].sort());
      expect(alerts.some(a => a.recipient.isEqual(id(alex)))).toBe(false); // reporter is the organizer: no self alert
    });
    const inc = incidents(test)[0]!;
    expect(inc.kind.tag).toBe('possible_impaired_driving');
    expect(inc.severity.tag).toBe('urgent');
    expect(inc.status.tag).toBe('open');
    expect(inc.subject.isEqual(id(sam))).toBe(true);
    const participants = [...test.db.incidentParticipant.iter()];
    expect(participants).toHaveLength(4);
    expect(participants.find(p => p.userId.isEqual(id(sam)))!.role.tag).toBe('subject');
    expect(participants.find(p => p.userId.isEqual(id(alex)))!.role.tag).toBe('organizer');
    expect(participants.find(p => p.userId.isEqual(id(maya)))!.role.tag).toBe('buddy');
    expect(events(test, inc.id).map(e => e.kind)).toEqual(['opened', 'agent_requested', 'warning_shown']);
    // Views: participants see it with the subject's name; outsiders do not.
    const mine = m.myIncidents(test.viewContext(maya));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subjectName).toBe('Sam');
    expect(m.myIncidents(test.viewContext(outsider))).toHaveLength(0);
    expect(m.myIncidentParticipants(test.viewContext(maya)).map(p => p.displayName).sort()).toEqual(['Alex', 'Jordan', 'Maya', 'Sam']);
    expect(m.myIncidentEvents(test.viewContext(jordan)).length).toBe(3);
    expect(m.myIncidentEvents(test.viewContext(outsider))).toHaveLength(0);
  });

  it('deduplicates concerns within a 5-minute bucket', () => {
    const { test, alex, maya, sam, id, sessionId } = setup();
    const report = (who: TestAuth) =>
      test.withReducerTx(who, ctx =>
        m.reportConcern(ctx, { sessionId, subject: id(sam), category: { tag: 'possible_consumption' }, note: '' })
      );
    report(alex);
    expect(() => report(maya)).toThrow('Already reported');
    advance(test, 5);
    report(maya); // new bucket: accepted, folded into the existing open incident
    expect(incidents(test)).toHaveLength(1);
    expect(events(test, incidents(test)[0]!.id).some(e => e.kind === 'concern_repeated')).toBe(true);
  });

  it("'okay' never changes an open incident; 'home' resolves only from the right states and only for the subject", () => {
    const { test, alex, sam, maya, id, sessionId } = setup();
    test.withReducerTx(alex, ctx =>
      m.reportConcern(ctx, { sessionId, subject: id(sam), category: { tag: 'possible_consumption' }, note: '' })
    );
    const inc = incidents(test)[0]!;
    test.withReducerTx(sam, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'okay' }, note: '' }));
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('open');
    expect(events(test, inc.id).some(e => e.kind === 'subject_says_fine')).toBe(true);
    // home from 'open' does not resolve
    test.withReducerTx(sam, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'home' }, note: '' }));
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('open');
    // move to awaiting_home_confirmation directly; another participant's home does nothing to Sam's incident
    test.db.incident.id.update({ ...test.db.incident.id.find(inc.id)!, status: { tag: 'awaiting_home_confirmation' } });
    test.withReducerTx(maya, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'home' }, note: '' }));
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('awaiting_home_confirmation');
    test.withReducerTx(sam, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'home' }, note: '' }));
    const resolved = test.db.incident.id.find(inc.id)!;
    expect(resolved.status.tag).toBe('resolved');
    expect(resolved.resolvedBy!.isEqual(id(sam))).toBe(true);
  });

  it('help check-ins open a help_requested incident and alert the others', () => {
    const { test, maya, id, sessionId } = setup();
    test.withReducerTx(maya, ctx => {
      m.checkIn(ctx, { sessionId, kind: { tag: 'need_ride' }, note: 'stuck at the venue' });
      const alerts = [...ctx.db.safetyAlert.iter()];
      expect(alerts).toHaveLength(3);
      expect(alerts.every(a => a.kind.tag === 'help_requested' && !a.recipient.isEqual(id(maya)))).toBe(true);
    });
    const inc = incidents(test)[0]!;
    expect(inc.kind.tag).toBe('help_requested');
    expect(inc.severity.tag).toBe('elevated');
    test.withReducerTx(maya, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'unwell' }, note: '' }));
    expect(incidents(test)).toHaveLength(1);
    expect(test.db.incident.id.find(inc.id)!.severity.tag).toBe('urgent');
  });

  it('acknowledge: subject rejected, participant OK, outsider rejected', () => {
    const { test, alex, sam, maya, outsider, id, sessionId } = setup();
    test.withReducerTx(alex, ctx =>
      m.reportConcern(ctx, { sessionId, subject: id(sam), category: { tag: 'possible_consumption' }, note: '' })
    );
    const inc = incidents(test)[0]!;
    expect(() => test.withReducerTx(sam, ctx => m.acknowledgeIncident(ctx, { incidentId: inc.id }))).toThrow(
      "You can't acknowledge your own alert"
    );
    expect(() => test.withReducerTx(outsider, ctx => m.acknowledgeIncident(ctx, { incidentId: inc.id }))).toThrow(
      'Only participants can acknowledge'
    );
    test.withReducerTx(maya, ctx => m.acknowledgeIncident(ctx, { incidentId: inc.id }));
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('acknowledged');
    const p = [...test.db.incidentParticipant.iter()].find(x => x.userId.isEqual(id(maya)))!;
    expect(p.acknowledgedAt).toBeDefined();
  });

  it('resolve: random member rejected, trusted buddy with messaging+checkins OK, subject OK, scheduler never', () => {
    const { test, alex, sam, maya, jordan, id, sessionId } = setup();
    const open = () =>
      test.withReducerTx(alex, ctx =>
        m.reportConcern(ctx, { sessionId, subject: id(sam), category: { tag: 'possible_consumption' }, note: '' })
      );
    open();
    const first = incidents(test)[0]!;
    expect(() => test.withReducerTx(jordan, ctx => m.resolveIncident(ctx, { incidentId: first.id, note: '' }))).toThrow(
      'You are not allowed to resolve this incident'
    );
    expect(() =>
      test.withReducerTx(TestAuth.internal(), ctx => m.resolveIncident(ctx, { incidentId: first.id, note: '' }))
    ).toThrow('Only a person can resolve an incident');
    grant(test, sam, id(maya), sessionId, 'messaging');
    expect(() => test.withReducerTx(maya, ctx => m.resolveIncident(ctx, { incidentId: first.id, note: '' }))).toThrow(
      'You are not allowed to resolve this incident'
    );
    grant(test, sam, id(maya), sessionId, 'checkins');
    test.withReducerTx(maya, ctx => m.resolveIncident(ctx, { incidentId: first.id, note: 'Sam is riding with me' }));
    expect(test.db.incident.id.find(first.id)!.status.tag).toBe('resolved');
    // a new incident, resolved by the subject
    advance(test, 6);
    open();
    const second = incidents(test).find(i => i.id !== first.id)!;
    test.withReducerTx(sam, ctx => m.resolveIncident(ctx, { incidentId: second.id, note: '' }));
    expect(test.db.incident.id.find(second.id)!.status.tag).toBe('resolved');
  });

  it('cancel: subject only, within two minutes', () => {
    const { test, maya, jordan, sessionId } = setup();
    test.withReducerTx(maya, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'need_friend' }, note: '' }));
    const inc = incidents(test)[0]!;
    expect(() => test.withReducerTx(jordan, ctx => m.cancelIncident(ctx, { incidentId: inc.id, reason: '' }))).toThrow(
      'Only the person the incident is about can cancel it'
    );
    advance(test, 3);
    expect(() => test.withReducerTx(maya, ctx => m.cancelIncident(ctx, { incidentId: inc.id, reason: '' }))).toThrow(
      'Too late to cancel; resolve it instead'
    );
    test.withReducerTx(maya, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'need_friend' }, note: 'again' }));
    // still the same incident (open) → cannot cancel; open a fresh one for Jordan and cancel quickly
    test.withReducerTx(jordan, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'need_ride' }, note: '' }));
    const jordans = incidents(test).find(i => i.id !== inc.id)!;
    test.withReducerTx(jordan, ctx => m.cancelIncident(ctx, { incidentId: jordans.id, reason: 'misstap' }));
    expect(test.db.incident.id.find(jordans.id)!.status.tag).toBe('cancelled');
  });

  it('driver self-report: private warning without disclosure, incident with it', () => {
    const { test, sam, maya, id, sessionId } = setup();
    test.withReducerTx(sam, ctx => {
      m.reportConsumption(ctx, { sessionId, level: { tag: 'some' }, shareWithBuddy: false });
      const alerts = [...ctx.db.safetyAlert.iter()];
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.kind.tag).toBe('no_driving_warning');
      expect(alerts[0]!.recipient.isEqual(id(sam))).toBe(true);
    });
    expect(incidents(test)).toHaveLength(0);
    test.withReducerTx(sam, ctx => m.reportConsumption(ctx, { sessionId, level: { tag: 'some' }, shareWithBuddy: true }));
    expect(incidents(test)).toHaveLength(1);
    expect(incidents(test)[0]!.kind.tag).toBe('possible_impaired_driving');
    expect(m.myIncidents(test.viewContext(maya))).toHaveLength(1);
    // a non-driver self-report never opens anything
    test.withReducerTx(maya, ctx => m.reportConsumption(ctx, { sessionId, level: { tag: 'impaired_feeling' }, shareWithBuddy: true }));
    expect(incidents(test)).toHaveLength(1);
  });

  it('check-in timers: armed on join, re-armed on check-in, missed check-in opens an incident', () => {
    const { test, maya, id, sessionId } = setup();
    const timerFor = (who: Identity) => [...test.db.checkinTimer.iter()].filter(t => t.userId.isEqual(who));
    expect(timerFor(id(maya))).toHaveLength(1);
    const armed = timerFor(id(maya))[0]!;
    // She checks in: no incident when the timer fires.
    advance(test, 10);
    test.withReducerTx(maya, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'okay' }, note: '' }));
    expect(timerFor(id(maya))).toHaveLength(1);
    expect(timerFor(id(maya))[0]!.scheduledId).not.toBe(armed.scheduledId);
    advance(test, 25);
    test.withReducerTx(TestAuth.internal(), ctx => m.onCheckinDue(ctx, { arg: armed }));
    expect(incidents(test)).toHaveLength(0);
    // No check-in since the current timer was armed → missed_checkin.
    const current = timerFor(id(maya))[0]!;
    advance(test, 30);
    test.withReducerTx(TestAuth.internal(), ctx => {
      m.onCheckinDue(ctx, { arg: current });
      const alerts = [...ctx.db.safetyAlert.iter()];
      expect(alerts.filter(a => a.kind.tag === 'ack_requested')).toHaveLength(3);
    });
    const inc = incidents(test)[0]!;
    expect(inc.kind.tag).toBe('missed_checkin');
    expect(inc.subject.isEqual(id(maya))).toBe(true);
    // re-armed again
    expect(timerFor(id(maya))).toHaveLength(1);
  });
});
