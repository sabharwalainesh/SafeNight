import { describe, expect, it } from 'vitest';
import { ConnectionId, Timestamp, TimeDuration, type Identity } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';

let nextConnection = 100n;
function principal(subject: string) {
  return TestAuth.fromJwtPayload(
    JSON.stringify({ iss: 'https://safenight.test', sub: subject }),
    new ConnectionId(nextConnection++)
  );
}

const NOW = Timestamp.fromDate(new Date('2026-11-07T21:00:00Z'));
const MIN = 60_000_000n;
const plus = (minutes: number) => new Timestamp(NOW.microsSinceUnixEpoch + BigInt(minutes) * MIN);

function makeHarness() {
  return createModuleTestHarness(spacetimedb, m);
}
type Harness = ReturnType<typeof makeHarness>;

function setup() {
  const test = makeHarness();
  test.clock.set(NOW);
  const alex = principal('alex');
  const sam = principal('sam');
  const maya = principal('maya');
  const id = (auth: TestAuth): Identity => test.viewContext(auth).sender;
  for (const [auth, name] of [
    [alex, 'Alex'],
    [sam, 'Sam'],
    [maya, 'Maya'],
  ] as const) {
    test.withReducerTx(auth, ctx => m.setProfile(ctx, { displayName: name, avatarEmoji: '🙂' }));
  }
  return { test, alex, sam, maya, id };
}

function createSession(test: Harness, auth: TestAuth) {
  test.withReducerTx(auth, ctx =>
    m.createSession(ctx, {
      name: 'Friday Night',
      venueHint: 'Downtown',
      startsAt: NOW,
      expiresAt: plus(240),
      checkinIntervalMinutes: 30,
    })
  );
  const sessions = [...test.db.nightSession.iter()].sort((a, b) => Number(a.id - b.id));
  return sessions[sessions.length - 1]!;
}

function createInvite(test: Harness, auth: TestAuth, sessionId: bigint, maxUses = 10, ttl = 60) {
  test.withReducerTx(auth, ctx => m.createInvite(ctx, { sessionId, ttlMinutes: ttl, maxUses }));
  const invites = [...test.db.invite.iter()].filter(i => i.sessionId === sessionId);
  return invites[invites.length - 1]!;
}

function join(test: Harness, auth: TestAuth, code: string) {
  test.withReducerTx(auth, ctx => m.joinSession(ctx, { code }));
}

describe('C1 sessions and invites', () => {
  it('requires a profile to create a session', () => {
    const { test } = setup();
    const nobody = principal('nobody');
    expect(() =>
      test.withReducerTx(nobody, ctx =>
        m.createSession(ctx, {
          name: 'x',
          venueHint: '',
          startsAt: NOW,
          expiresAt: plus(60),
          checkinIntervalMinutes: 30,
        })
      )
    ).toThrow('Set up your profile first');
  });

  it('create_session inserts the organizer member and a session_expiry row', () => {
    const { test, alex, id } = setup();
    const session = createSession(test, alex);
    expect(session.status.tag).toBe('active');
    const members = [...test.db.sessionMember.iter()];
    expect(members).toHaveLength(1);
    expect(members[0]!.userId.isEqual(id(alex))).toBe(true);
    expect(members[0]!.role.tag).toBe('organizer');
    expect(members[0]!.sharingScope.tag).toBe('none');
    const expiry = [...test.db.sessionExpiry.iter()];
    expect(expiry).toHaveLength(1);
    expect(expiry[0]!.sessionId).toBe(session.id);
  });

  it('invite codes are 6 unambiguous characters and joining works once per user', () => {
    const { test, alex, sam, id } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    expect(invite.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    join(test, sam, invite.code.toLowerCase());
    const samRow = [...test.db.sessionMember.iter()].find(r => r.userId.isEqual(id(sam)))!;
    expect(samRow.active).toBe(true);
    expect(samRow.sharingScope.tag).toBe('none');
    expect(samRow.role.tag).toBe('participant');
    expect(test.db.invite.id.find(invite.id)!.uses).toBe(1);
    expect(() => join(test, sam, invite.code)).toThrow('Already a member');
  });

  it('rejects revoked, expired, and exhausted invites; non-organizers cannot create them', () => {
    const { test, alex, sam, maya } = setup();
    const session = createSession(test, alex);
    expect(() => createInvite(test, sam, session.id)).toThrow('Only the organizer can do that');

    const revoked = createInvite(test, alex, session.id);
    test.withReducerTx(alex, ctx => m.revokeInvite(ctx, { inviteId: revoked.id }));
    expect(() => join(test, sam, revoked.code)).toThrow('Invite was revoked');

    const limited = createInvite(test, alex, session.id, 1);
    join(test, sam, limited.code);
    expect(() => join(test, maya, limited.code)).toThrow('Invite has no uses left');

    const shortLived = createInvite(test, alex, session.id, 10, 5);
    test.clock.advance(TimeDuration.fromMillis(6 * 60_000));
    expect(() => join(test, maya, shortLived.code)).toThrow('Invite has expired');
    expect(() => join(test, maya, 'ZZZZZZ')).toThrow('Invalid invite code');
  });

  it('leaving marks the member inactive, revokes their grants, and ends their driver role', () => {
    const { test, alex, sam, id } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    test.withReducerTx(sam, ctx =>
      m.grantConsent(ctx, { recipient: id(alex), sessionId: session.id, scope: { tag: 'checkins' }, ttlMinutes: 60 })
    );
    expect(() => test.withReducerTx(alex, ctx => m.leaveSession(ctx, { sessionId: session.id }))).toThrow(
      'Organizer must end the session instead'
    );
    test.withReducerTx(sam, ctx => m.leaveSession(ctx, { sessionId: session.id }));
    const samRow = [...test.db.sessionMember.iter()].find(r => r.userId.isEqual(id(sam)))!;
    expect(samRow.active).toBe(false);
    expect(samRow.leftAt).toBeDefined();
    expect([...test.db.consentGrant.iter()].every(g => g.revokedAt !== undefined)).toBe(true);
    expect([...test.db.driverAssignment.iter()][0]!.endReason.tag).toBe('left_session');
    // Re-joining re-activates the same row.
    join(test, sam, invite.code);
    const again = [...test.db.sessionMember.iter()].find(r => r.userId.isEqual(id(sam)))!;
    expect(again.id).toBe(samRow.id);
    expect(again.active).toBe(true);
  });

  it('expire_session closes everything and is idempotent', () => {
    const { test, alex, sam, id } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    test.withReducerTx(alex, ctx =>
      m.grantConsent(ctx, { recipient: id(sam), sessionId: session.id, scope: { tag: 'messaging' }, ttlMinutes: 30 })
    );
    const timer = [...test.db.sessionExpiry.iter()][0]!;
    test.clock.set(plus(241));
    for (let i = 0; i < 2; i++) {
      test.withReducerTx(TestAuth.internal(), ctx => m.expireSession(ctx, { arg: timer }));
    }
    expect(test.db.nightSession.id.find(session.id)!.status.tag).toBe('expired');
    expect([...test.db.sessionMember.iter()].every(r => !r.active)).toBe(true);
    expect([...test.db.consentGrant.iter()].every(g => g.revokedAt !== undefined)).toBe(true);
    expect([...test.db.driverAssignment.iter()][0]!.endReason.tag).toBe('session_ended');
    expect(() => join(test, principal('late'), invite.code)).toThrow();
  });

  it('end_session is organizer-only and removes the pending expiry timer', () => {
    const { test, alex, sam } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    expect(() => test.withReducerTx(sam, ctx => m.endSession(ctx, { sessionId: session.id }))).toThrow(
      'Only the organizer can do that'
    );
    test.withReducerTx(alex, ctx => m.endSession(ctx, { sessionId: session.id }));
    expect(test.db.nightSession.id.find(session.id)!.status.tag).toBe('ended');
    expect(test.db.sessionExpiry.count()).toBe(0n);
  });
});

describe('C1 driver role', () => {
  it('requires explicit acceptance by the volunteer and allows one open assignment', () => {
    const { test, alex, sam, maya } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    join(test, maya, invite.code);
    test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    const a = [...test.db.driverAssignment.iter()][0]!;
    expect(a.acceptedAt).toBeUndefined();
    expect(() => test.withReducerTx(maya, ctx => m.volunteerDriver(ctx, { sessionId: session.id }))).toThrow(
      'A driver is already assigned for this session'
    );
    expect(() => test.withReducerTx(alex, ctx => m.acceptDriverRole(ctx, { assignmentId: a.id }))).toThrow(
      'Only the volunteer can accept the driver role'
    );
    test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: a.id }));
    expect(test.db.driverAssignment.id.find(a.id)!.acceptedAt).toBeDefined();
    expect(() =>
      test.withReducerTx(maya, ctx => m.endDriverRole(ctx, { assignmentId: a.id, reason: { tag: 'replaced' } }))
    ).toThrow('Only the driver or organizer can end the driver role');
    test.withReducerTx(alex, ctx => m.endDriverRole(ctx, { assignmentId: a.id, reason: { tag: 'cannot_drive' } }));
    expect(test.db.driverAssignment.id.find(a.id)!.endReason.tag).toBe('cannot_drive');
    // A new volunteer is possible once the previous assignment ended.
    test.withReducerTx(maya, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    expect(test.db.driverAssignment.count()).toBe(2n);
  });
});

describe('C1 consent and sharing', () => {
  it('grants require an active recipient member; only the subject revokes; replacement revokes the old grant', () => {
    const { test, alex, sam, maya, id } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    expect(() =>
      test.withReducerTx(alex, ctx =>
        m.grantConsent(ctx, { recipient: id(maya), sessionId: session.id, scope: { tag: 'checkins' }, ttlMinutes: 60 })
      )
    ).toThrow('Recipient is not an active member');
    expect(() =>
      test.withReducerTx(alex, ctx =>
        m.grantConsent(ctx, { recipient: id(sam), sessionId: session.id, scope: { tag: 'checkins' }, ttlMinutes: 0 })
      )
    ).toThrow('ttlMinutes must be between 1 and 1440');
    test.withReducerTx(alex, ctx =>
      m.grantConsent(ctx, { recipient: id(sam), sessionId: session.id, scope: { tag: 'location_precise' }, ttlMinutes: 60 })
    );
    const first = [...test.db.consentGrant.iter()][0]!;
    expect(first.expiresAt.microsSinceUnixEpoch).toBe(plus(60).microsSinceUnixEpoch);
    expect(() => test.withReducerTx(sam, ctx => m.revokeConsent(ctx, { grantId: first.id }))).toThrow(
      'Only the subject can revoke consent'
    );
    test.withReducerTx(alex, ctx =>
      m.grantConsent(ctx, { recipient: id(sam), sessionId: session.id, scope: { tag: 'location_precise' }, ttlMinutes: 30 })
    );
    const grants = [...test.db.consentGrant.iter()].sort((a, b) => Number(a.id - b.id));
    expect(grants).toHaveLength(2);
    expect(grants[0]!.revokedAt).toBeDefined();
    expect(grants[1]!.revokedAt).toBeUndefined();
    test.withReducerTx(alex, ctx => m.revokeConsent(ctx, { grantId: grants[1]!.id }));
    expect(test.db.consentGrant.id.find(grants[1]!.id)!.revokedAt).toBeDefined();
  });

  it('set_sharing_scope only changes the caller’s own row', () => {
    const { test, alex, sam, id } = setup();
    const session = createSession(test, alex);
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    test.withReducerTx(alex, ctx => m.setSharingScope(ctx, { sessionId: session.id, scope: { tag: 'precise' } }));
    const rows = [...test.db.sessionMember.iter()];
    expect(rows.find(r => r.userId.isEqual(id(alex)))!.sharingScope.tag).toBe('precise');
    expect(rows.find(r => r.userId.isEqual(id(sam)))!.sharingScope.tag).toBe('none');
  });
});

describe('C1 views', () => {
  function viewScenario() {
    const ctx = setup();
    const { test, alex, sam, maya, id } = ctx;
    const session = createSession(test, alex);
    const other = createSession(test, maya); // maya's own session, sam not a member
    const invite = createInvite(test, alex, session.id);
    join(test, sam, invite.code);
    test.withReducerTx(sam, ctx => m.volunteerDriver(ctx, { sessionId: session.id }));
    const a = [...test.db.driverAssignment.iter()][0]!;
    test.withReducerTx(sam, ctx => m.acceptDriverRole(ctx, { assignmentId: a.id }));
    test.withReducerTx(alex, ctx =>
      m.grantConsent(ctx, { recipient: id(sam), sessionId: session.id, scope: { tag: 'checkins' }, ttlMinutes: 60 })
    );
    test.withReducerTx(alex, ctx =>
      m.addTrustedContact(ctx, { contact: id(maya), role: { tag: 'buddy' }, messagingConsent: true, priority: 1 })
    );
    return { ...ctx, session, other, invite };
  }

  it('my_sessions returns only sessions where the caller is an active member', () => {
    const { test, alex, sam, maya, session, other } = viewScenario();
    const sessionsFor = (auth: TestAuth) =>
      test.runQuery<{ id: bigint }>(m.mySessions(test.viewContext(auth))).map(s => s.id);
    expect(sessionsFor(sam)).toEqual([session.id]);
    expect(sessionsFor(maya)).toEqual([other.id]);
    expect(sessionsFor(alex)).toEqual([session.id]);
  });

  it('my_rosters includes display names and driver status', () => {
    const { test, sam, maya, other } = viewScenario();
    const samRoster = m.myRosters(test.viewContext(sam));
    expect(samRoster.map(r => r.displayName).sort()).toEqual(['Alex', 'Sam']);
    expect(samRoster.find(r => r.displayName === 'Sam')!.driverStatus.tag).toBe('accepted');
    expect(samRoster.find(r => r.displayName === 'Alex')!.driverStatus.tag).toBe('none');
    expect(m.myRosters(test.viewContext(maya)).map(r => r.sessionId)).toEqual([other.id]);
  });

  it('my_invites is visible to the organizer only', () => {
    const { test, alex, sam, invite } = viewScenario();
    expect(m.myInvites(test.viewContext(alex)).map(i => i.code)).toEqual([invite.code]);
    expect(m.myInvites(test.viewContext(sam))).toHaveLength(0);
  });

  it('my_consents is visible to subject and recipient; my_contacts to the owner', () => {
    const { test, alex, sam, maya } = viewScenario();
    expect(m.myConsents(test.viewContext(alex))).toHaveLength(1);
    expect(m.myConsents(test.viewContext(sam))).toHaveLength(1);
    expect(m.myConsents(test.viewContext(maya))).toHaveLength(0);
    expect(m.myContacts(test.viewContext(alex))).toHaveLength(1);
    expect(m.myContacts(test.viewContext(maya))).toHaveLength(0);
  });
});
