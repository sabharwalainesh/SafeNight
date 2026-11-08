import { describe, expect, it } from 'vitest';
import { ConnectionId, ScheduleAt, Timestamp, TimeDuration, type Identity } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';

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

function makeHarness() {
  return createModuleTestHarness(spacetimedb, m);
}
type Harness = ReturnType<typeof makeHarness>;
const advance = (test: Harness, minutes: number) => test.clock.advance(TimeDuration.fromMillis(minutes * 60_000));

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
  return { test, alex, sam, maya, jordan, outsider, id, sessionId: session.id };
}

type Alert = { recipient: Identity; kind: { tag: string }; message: string };
let lastAlerts: Alert[] = [];
/** Run a reducer and capture the safety_alert events it emitted (event rows exist only inside the tx). */
function run(test: Harness, who: TestAuth, fn: (ctx: Parameters<Parameters<Harness['withReducerTx']>[1]>[0]) => void) {
  test.withReducerTx(who, ctx => {
    fn(ctx);
    lastAlerts = [...ctx.db.safetyAlert.iter()];
  });
}
const request = (test: Harness, who: TestAuth, sessionId: bigint, note = '') =>
  run(test, who, ctx => m.requestCompany(ctx, { sessionId, note }));
const offer = (test: Harness, who: TestAuth, incidentId: bigint) =>
  run(test, who, ctx => m.offerToCome(ctx, { incidentId }));
const incidents = (test: Harness) => [...test.db.incident.iter()];
const meetups = (test: Harness) => [...test.db.meetup.iter()];
const events = (test: Harness, incidentId: bigint) => [...test.db.incidentEvent.incidentId.filter(incidentId)].map(e => e.kind);
const alertsFor = (_test: Harness, who: Identity) => lastAlerts.filter(a => a.recipient.isEqual(who));
const last = <T,>(xs: T[]): T => xs[xs.length - 1]!;
const activeGrants = (test: Harness, subject: Identity, recipient: Identity) =>
  [...test.db.consentGrant.bySubjectRecipient.filter([subject, recipient])].filter(g => g.revokedAt === undefined);
const share = (test: Harness, who: TestAuth, sessionId: bigint) =>
  test.withReducerTx(who, ctx => m.setSharingScope(ctx, { sessionId, scope: { tag: 'precise' } }));
const post = (test: Harness, who: TestAuth, sessionId: bigint) =>
  test.withReducerTx(who, ctx => m.postLocation(ctx, { sessionId, lat: 40.1, lng: -74.1, accuracyM: 5, source: { tag: 'simulated' } }));
const runExpiry = (test: Harness) =>
  run(test, TestAuth.internal(), ctx =>
    m.expireMeetups(ctx, { arg: { scheduledId: 1n, scheduledAt: ScheduleAt.interval(60_000_000n) } })
  );

describe('F1 meetups: request_company', () => {
  it('opens a help_requested incident flagged meetupWanted, records a need_friend check-in, alerts others', () => {
    const { test, sam, alex, maya, jordan, id, sessionId } = setup();
    request(test, sam, sessionId, 'near the fountain');
    const inc = incidents(test)[0]!;
    expect(inc.kind.tag).toBe('help_requested');
    expect(inc.meetupWanted).toBe(true);
    expect(inc.subject.isEqual(id(sam))).toBe(true);
    expect([...test.db.checkin.iter()][0]!.kind.tag).toBe('need_friend');
    expect(events(test, inc.id)).toContain('company_requested');
    for (const who of [alex, maya, jordan]) {
      const a = alertsFor(test, id(who));
      expect(a).toHaveLength(1);
      expect(a[0]!.kind.tag).toBe('help_requested');
      expect(a[0]!.message).toBe('Sam wants someone to come to them.');
    }
    expect(alertsFor(test, id(sam))).toHaveLength(0);
  });

  it('reuses an existing open incident and only flips meetupWanted', () => {
    const { test, sam, sessionId } = setup();
    test.withReducerTx(sam, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'need_ride' }, note: '' }));
    expect(incidents(test)[0]!.meetupWanted).toBe(false);
    request(test, sam, sessionId);
    expect(incidents(test)).toHaveLength(1);
    expect(incidents(test)[0]!.meetupWanted).toBe(true);
  });

  it('rejects outsiders and rate-limits like check-ins', () => {
    const { test, sam, outsider, sessionId } = setup();
    expect(() => request(test, outsider, sessionId)).toThrow('Not a member');
    for (let i = 0; i < 10; i++) request(test, sam, sessionId);
    expect(() => request(test, sam, sessionId)).toThrow('Too many check-ins');
  });
});

describe('F1 meetups: precision while on a trip', () => {
  it('the helper and requester see each other precisely during the trip even with an approximate default', () => {
    const { test, sam, maya, id, sessionId } = setup();
    for (const who of [sam, maya]) {
      test.withReducerTx(who, ctx => m.setSharingScope(ctx, { sessionId, scope: { tag: 'approximate' } }));
      post(test, who, sessionId);
    }
    const samId = id(sam);
    const mayaId = id(maya);
    const seenBy = (who: TestAuth, target: Identity) => {
      const rows = m.visibleLocations(test.viewContext(who));
      return rows.find(r => r.userId.isEqual(target));
    };
    test.withReducerTx(sam, ctx => m.requestCompany(ctx, { sessionId, note: '' }));
    const inc = incidents(test)[0]!;
    expect(seenBy(maya, samId)?.approximate ?? true).toBe(true); // not precise before the trip (hidden or approximate)
    test.withReducerTx(maya, ctx => m.offerToCome(ctx, { incidentId: inc.id }));
    expect(seenBy(maya, samId)?.approximate).toBe(false);
    expect(seenBy(sam, mayaId)?.approximate).toBe(false);
    const muId = meetups(test)[0]!.id;
    test.withReducerTx(maya, ctx => m.markArrived(ctx, { meetupId: muId }));
    // Back to the approximate default once the trip is over.
    expect(seenBy(maya, samId)?.approximate ?? true).toBe(true);
  });
});

describe('F1 meetups: closing the incident closes its trips', () => {
  it('resolving the incident cancels a coming meetup, revokes its grants, and frees the helper for the next request', () => {
    const { test, sam, maya, id, sessionId } = setup();
    request(test, sam, sessionId);
    const inc = incidents(test)[0]!;
    offer(test, maya, inc.id);
    expect(meetups(test)[0]!.status.tag).toBe('coming');
    run(test, sam, ctx => m.resolveIncident(ctx, { incidentId: inc.id, note: 'all good' }));
    expect(meetups(test)[0]!.status.tag).toBe('cancelled');
    expect(activeGrants(test, id(sam), id(maya))).toHaveLength(0);
    expect(activeGrants(test, id(maya), id(sam))).toHaveLength(0);
    // Sam asks again; Maya is no longer "on her way" and can accept.
    advance(test, 2);
    request(test, sam, sessionId);
    const inc2 = incidents(test).find(i => i.id !== inc.id)!;
    offer(test, maya, inc2.id);
    expect(meetups(test).filter(mu => mu.status.tag === 'coming')).toHaveLength(1);
  });
});

describe('F1 meetups: offer_to_come', () => {
  it('creates one coming meetup, grants precise location both ways for 60 min, acknowledges, alerts both', () => {
    const { test, sam, maya, jordan, id, sessionId } = setup();
    request(test, sam, sessionId);
    const inc = incidents(test)[0]!;
    offer(test, maya, inc.id);
    const mu = meetups(test);
    expect(mu).toHaveLength(1);
    expect(mu[0]!.status.tag).toBe('coming');
    expect(mu[0]!.requester.isEqual(id(sam))).toBe(true);
    expect(mu[0]!.helper.isEqual(id(maya))).toBe(true);
    expect(mu[0]!.expiresAt.microsSinceUnixEpoch).toBe(plus(60).microsSinceUnixEpoch);
    const g1 = activeGrants(test, id(sam), id(maya));
    const g2 = activeGrants(test, id(maya), id(sam));
    expect(g1).toHaveLength(1);
    expect(g2).toHaveLength(1);
    expect(g1[0]!.scope.tag).toBe('location_precise');
    expect(g1[0]!.sessionId).toBe(sessionId);
    expect(g1[0]!.expiresAt.microsSinceUnixEpoch).toBe(plus(60).microsSinceUnixEpoch);
    const p = [...test.db.incidentParticipant.byIncidentUser.filter([inc.id, id(maya)])][0]!;
    expect(p.acknowledgedAt).toBeDefined();
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('acknowledged');
    expect(events(test, inc.id)).toContain('helper_coming');
    expect(last(alertsFor(test, id(sam))).message).toBe('Maya is coming to you.');
    expect(last(alertsFor(test, id(maya))).message).toBe('Head to Sam; the compass is live.');
    expect([...test.db.auditEvent.iter()].some(a => a.action === 'offer_to_come')).toBe(true);
    // Idempotent: a second offer by the same helper creates nothing new.
    offer(test, maya, inc.id);
    expect(meetups(test)).toHaveLength(1);
    expect(activeGrants(test, id(sam), id(maya))).toHaveLength(1);
    // A second helper gets their own meetup.
    offer(test, jordan, inc.id);
    expect(meetups(test)).toHaveLength(2);
  });

  it('rejects the subject, non-participants, closed incidents, and incidents without meetupWanted', () => {
    const { test, sam, maya, outsider, sessionId } = setup();
    test.withReducerTx(sam, ctx => m.checkIn(ctx, { sessionId, kind: { tag: 'need_ride' }, note: '' }));
    const inc = incidents(test)[0]!;
    expect(() => offer(test, maya, inc.id)).toThrow('Nobody asked for company');
    request(test, sam, sessionId);
    expect(() => offer(test, sam, inc.id)).toThrow("can't come to yourself");
    expect(() => offer(test, outsider, inc.id)).toThrow('Only participants');
    test.withReducerTx(sam, ctx => m.cancelIncident(ctx, { incidentId: inc.id, reason: 'fine now' }));
    expect(() => offer(test, maya, inc.id)).toThrow('closed');
  });
});

describe('F1 meetups: arrive, cancel, expire, limits, view', () => {
  function pair() {
    const s = setup();
    request(s.test, s.sam, s.sessionId);
    const inc = incidents(s.test)[0]!;
    offer(s.test, s.maya, inc.id);
    return { ...s, inc, mu: meetups(s.test)[0]! };
  }

  it('mark_arrived by either side: coming→arrived, incident stays open, both alerted', () => {
    const { test, sam, maya, id, inc, mu } = pair();
    advance(test, 5);
    run(test, sam, ctx => m.markArrived(ctx, { meetupId: mu.id }));
    const after = test.db.meetup.id.find(mu.id)!;
    expect(after.status.tag).toBe('arrived');
    expect(after.arrivedAt!.microsSinceUnixEpoch).toBe(plus(5).microsSinceUnixEpoch);
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('acknowledged');
    expect(events(test, inc.id)).toContain('helper_arrived');
    expect(last(alertsFor(test, id(sam))).message).toBe('Maya has arrived.');
    expect(last(alertsFor(test, id(maya))).message).toBe('You reached Sam.');
    expect(() => test.withReducerTx(maya, ctx => m.markArrived(ctx, { meetupId: mu.id }))).toThrow('not in progress');
  });

  it('rejects arrive/cancel from third parties', () => {
    const { test, jordan, alex, mu } = pair();
    expect(() => test.withReducerTx(jordan, ctx => m.markArrived(ctx, { meetupId: mu.id }))).toThrow('Only the requester or helper');
    expect(() => test.withReducerTx(alex, ctx => m.cancelMeetup(ctx, { meetupId: mu.id, reason: '' }))).toThrow('Only the requester or helper');
  });

  it('cancel_meetup revokes only the two meetup grants', () => {
    const { test, sam, maya, jordan, id, inc, mu, sessionId } = pair();
    // An unrelated grant that must survive.
    test.withReducerTx(sam, ctx =>
      m.grantConsent(ctx, { recipient: id(jordan), sessionId, scope: { tag: 'location_precise' }, ttlMinutes: 60 })
    );
    run(test, maya, ctx => m.cancelMeetup(ctx, { meetupId: mu.id, reason: 'found a cab' }));
    expect(test.db.meetup.id.find(mu.id)!.status.tag).toBe('cancelled');
    expect(activeGrants(test, id(sam), id(maya))).toHaveLength(0);
    expect(activeGrants(test, id(maya), id(sam))).toHaveLength(0);
    expect(activeGrants(test, id(sam), id(jordan))).toHaveLength(1);
    expect(events(test, inc.id)).toContain('meetup_cancelled');
    expect(last(alertsFor(test, id(sam))).message).toBe('Maya cancelled the meetup.');
    expect(test.db.incident.id.find(inc.id)!.status.tag).toBe('acknowledged');
  });

  it('expire_meetups cancels stale coming meetups and revokes grants; fresh ones untouched', () => {
    const { test, sam, maya, id, mu } = pair();
    advance(test, 30);
    runExpiry(test);
    expect(test.db.meetup.id.find(mu.id)!.status.tag).toBe('coming');
    advance(test, 31);
    runExpiry(test);
    expect(test.db.meetup.id.find(mu.id)!.status.tag).toBe('cancelled');
    expect(activeGrants(test, id(sam), id(maya))).toHaveLength(0);
    expect(last(alertsFor(test, id(maya))).message).toContain('timed out');
  });

  it('post_location allows 60/min for meetup parties and 30/min otherwise', () => {
    const { test, sam, maya, jordan, sessionId } = pair();
    for (const who of [sam, maya, jordan]) share(test, who, sessionId);
    for (let i = 0; i < 30; i++) post(test, jordan, sessionId);
    expect(() => post(test, jordan, sessionId)).toThrow('Too many location updates');
    for (let i = 0; i < 60; i++) post(test, sam, sessionId);
    expect(() => post(test, sam, sessionId)).toThrow('Too many location updates');
    for (let i = 0; i < 60; i++) post(test, maya, sessionId);
    expect(() => post(test, maya, sessionId)).toThrow('Too many location updates');
  });

  it('my_meetups: parties and incident participants see it, outsiders do not; names resolved', () => {
    const { test, sam, maya, jordan, outsider, mu } = pair();
    for (const who of [sam, maya, jordan]) {
      const rows = m.myMeetups(test.viewContext(who));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(mu.id);
      expect(rows[0]!.requesterName).toBe('Sam');
      expect(rows[0]!.helperName).toBe('Maya');
      expect(rows[0]!.status.tag).toBe('coming');
    }
    expect(m.myMeetups(test.viewContext(outsider))).toHaveLength(0);
  });

  it('schedules: init arms meetup_expiry; ensure_schedules re-arms it when missing', () => {
    const test = makeHarness();
    const owner = principal('owner');
    test.withReducerTx(owner, ctx => m.init(ctx, {}));
    expect(test.db.meetupExpiry.count()).toBe(1n);
    for (const row of test.db.meetupExpiry.iter()) test.db.meetupExpiry.scheduledId.delete(row.scheduledId);
    test.withReducerTx(owner, ctx => m.ensureSchedules(ctx, {}));
    expect(test.db.meetupExpiry.count()).toBe(1n);
    expect(last([...test.db.auditEvent.iter()]).resource).toContain('meetup_expiry');
  });
});

describe('live compass stream: stream_meetup_position', () => {
  const stream = (test: Harness, who: TestAuth, meetupId: bigint, lat = 40.7581, extra: { headingDeg?: number; speedMps?: number } = {}) =>
    test.withReducerTx(who, ctx => m.streamMeetupPosition(ctx, { meetupId, lat, lng: -73.9855, accuracyM: 6, ...extra }));
  const trip = () => {
    const s = setup();
    request(s.test, s.sam, s.sessionId);
    offer(s.test, s.alex, incidents(s.test)[0]!.id);
    share(s.test, s.alex, s.sessionId);
    share(s.test, s.sam, s.sessionId);
    return { ...s, meetupId: meetups(s.test)[0]!.id };
  };
  const positions = (test: Harness) => [...test.db.meetupPosition.iter()];
  const tick = (test: Harness, ms: number) => test.clock.advance(TimeDuration.fromMillis(ms));

  it('upserts one row per party and shows it only to the trip partner', () => {
    const { test, alex, sam, maya, outsider, id, meetupId } = trip();
    stream(test, alex, meetupId, 40.7581, { headingDeg: 90, speedMps: 1.4 });
    tick(test, 300);
    stream(test, alex, meetupId, 40.7582);
    expect(positions(test)).toHaveLength(1);
    const seen = m.myMeetupPositions(test.viewContext(sam));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.userId.isEqual(id(alex))).toBe(true);
    expect(seen[0]!.lat).toBeCloseTo(40.7582);
    expect(m.myMeetupPositions(test.viewContext(alex))).toHaveLength(0); // own row is not echoed
    for (const who of [maya, outsider]) expect(m.myMeetupPositions(test.viewContext(who))).toHaveLength(0);
  });

  it('drops fixes faster than ~4 Hz without erroring', () => {
    const { test, alex, meetupId } = trip();
    stream(test, alex, meetupId, 40.1);
    tick(test, 50);
    stream(test, alex, meetupId, 40.2);
    expect(positions(test)[0]!.lat).toBeCloseTo(40.1);
    tick(test, 200);
    stream(test, alex, meetupId, 40.3);
    expect(positions(test)[0]!.lat).toBeCloseTo(40.3);
  });

  it('rejects non-parties and bad input; ignores out-of-range heading/speed', () => {
    const { test, alex, maya, meetupId } = trip();
    expect(() => stream(test, maya, meetupId)).toThrow(/requester or helper/);
    expect(() => stream(test, alex, meetupId, 123)).toThrow(/Invalid coordinates/);
    stream(test, alex, meetupId, 40.1, { headingDeg: 400, speedMps: -3 });
    expect(positions(test)[0]!.headingDeg).toBeUndefined();
    expect(positions(test)[0]!.speedMps).toBeUndefined();
  });

  it('hides the stream once the partner revokes precise sharing, and clears it when the trip ends', () => {
    const { test, alex, sam, meetupId } = trip();
    stream(test, alex, meetupId);
    tick(test, 300);
    stream(test, sam, meetupId);
    for (const g of activeGrants(test, test.viewContext(alex).sender, test.viewContext(sam).sender)) {
      test.withReducerTx(alex, ctx => m.revokeConsent(ctx, { grantId: g.id }));
    }
    expect(m.myMeetupPositions(test.viewContext(sam))).toHaveLength(0);
    expect(m.myMeetupPositions(test.viewContext(alex))).toHaveLength(1);
    run(test, sam, ctx => m.markArrived(ctx, { meetupId }));
    expect(positions(test)).toHaveLength(0);
    expect(() => stream(test, alex, meetupId)).toThrow(/not in progress/);
  });

  it('cancel and expiry clear positions', () => {
    const { test, alex, meetupId } = trip();
    stream(test, alex, meetupId);
    run(test, alex, ctx => m.cancelMeetup(ctx, { meetupId, reason: '' }));
    expect(positions(test)).toHaveLength(0);
    const t2 = trip();
    stream(t2.test, t2.alex, t2.meetupId);
    advance(t2.test, 61);
    runExpiry(t2.test);
    expect(positions(t2.test)).toHaveLength(0);
  });

  it('honours sharing off and leaving the group, like visible_locations', () => {
    const { test, alex, sam, sessionId, meetupId } = trip();
    stream(test, alex, meetupId);
    expect(m.myMeetupPositions(test.viewContext(sam))).toHaveLength(1);
    test.withReducerTx(alex, ctx => m.setSharingScope(ctx, { sessionId, scope: { tag: 'none' } }));
    expect(m.myMeetupPositions(test.viewContext(sam))).toHaveLength(0);
    tick(test, 300);
    stream(test, alex, meetupId); // dropped, and clears the stale row
    expect(positions(test).filter(p => p.userId.isEqual(test.viewContext(alex).sender))).toHaveLength(0);
  });
});
