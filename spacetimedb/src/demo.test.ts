import { describe, expect, it } from 'vitest';
import { ConnectionId, Identity, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';

import spacetimedb, * as m from './index';
import { requireDemoAllowed } from './lib/community';
import type { Ctx } from './lib/auth';

let nextConnection = 900n;
function principal(subject: string) {
  return TestAuth.fromJwtPayload(
    JSON.stringify({ iss: 'https://safenight.test', sub: subject }),
    new ConnectionId(nextConnection++)
  );
}

const NOW = Timestamp.fromDate(new Date('2026-11-07T21:00:00Z'));

function setup() {
  const test = createModuleTestHarness(spacetimedb, m);
  test.clock.set(NOW);
  const auths = { alex: principal('alex'), sam: principal('sam'), maya: principal('maya'), jordan: principal('jordan') };
  const id = (auth: TestAuth): Identity => test.viewContext(auth).sender;
  return { test, auths, id };
}

function registerAll(s: ReturnType<typeof setup>) {
  for (const [pid, auth] of Object.entries(s.auths)) {
    s.test.withReducerTx(auth, ctx =>
      m.demoRegisterPersona(ctx, { personaId: pid, displayName: pid[0]!.toUpperCase() + pid.slice(1), avatarEmoji: '🙂' })
    );
  }
}

function openDemoSession(s: ReturnType<typeof setup>) {
  return [...s.test.db.nightSession.iter()].find(x => x.status.tag === 'active' || x.status.tag === 'planned');
}

describe('C5 demo helpers', () => {
  it('register + setup builds the full group once; a second setup reuses it', () => {
    const s = setup();
    registerAll(s);
    expect(s.test.db.demoPersona.count()).toBe(4n);
    expect(s.test.db.userProfile.count()).toBe(4n);

    s.test.withReducerTx(s.auths.alex, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    const session = openDemoSession(s)!;
    expect(session).toBeDefined();
    expect(session.organizer.isEqual(s.id(s.auths.alex))).toBe(true);
    expect(s.test.db.nightSession.count()).toBe(1n);
    expect(s.test.db.demoSession.count()).toBe(1n);

    const members = [...s.test.db.sessionMember.iter()].filter(x => x.sessionId === session.id);
    expect(members).toHaveLength(4);
    expect(members.every(x => x.active && x.sharingScope.tag === 'approximate')).toBe(true);
    expect(members.filter(x => x.role.tag === 'organizer')).toHaveLength(1);

    const drivers = [...s.test.db.driverAssignment.iter()].filter(x => x.sessionId === session.id);
    expect(drivers).toHaveLength(1);
    expect(drivers[0]!.driverId.isEqual(s.id(s.auths.sam))).toBe(true);
    expect(drivers[0]!.acceptedAt).toBeDefined();
    expect(drivers[0]!.endedAt).toBeUndefined();

    const contacts = [...s.test.db.trustedContact.iter()].filter(c => c.owner.isEqual(s.id(s.auths.sam)));
    expect(contacts.map(c => [c.role.tag, c.priority, c.messagingConsent]).sort()).toEqual([
      ['backup_buddy', 2, true],
      ['buddy', 1, true],
    ]);

    // 12 ordered pairs x 2 scopes + 4 messaging grants.
    const grants = [...s.test.db.consentGrant.iter()].filter(g => g.sessionId === session.id && g.revokedAt === undefined);
    expect(grants).toHaveLength(28);
    expect(grants.filter(g => g.scope.tag === 'messaging')).toHaveLength(4);

    const locs = [...s.test.db.latestLocation.iter()].filter(l => l.sessionId === session.id);
    expect(locs).toHaveLength(4);
    // New Year's Eve scenario: everyone around Times Square / Midtown Manhattan.
    for (const l of locs) {
      expect(l.lat).toBeGreaterThan(40.75);
      expect(l.lat).toBeLessThan(40.76);
      expect(l.lng).toBeGreaterThan(-73.99);
      expect(l.lng).toBeLessThan(-73.97);
    }
    expect(session.venueHint).toBe('Times Square, New York, NY');
    expect([...s.test.db.checkinTimer.iter()].filter(tm => tm.sessionId === session.id)).toHaveLength(4);
    expect(s.test.db.sessionExpiry.count()).toBe(1n);

    // Idempotent.
    s.test.withReducerTx(s.auths.maya, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    expect(s.test.db.nightSession.count()).toBe(1n);
    expect([...s.test.db.sessionMember.iter()]).toHaveLength(4);
    expect([...s.test.db.driverAssignment.iter()]).toHaveLength(1);
    expect([...s.test.db.consentGrant.iter()].filter(g => g.revokedAt === undefined)).toHaveLength(28);
    expect([...s.test.db.latestLocation.iter()]).toHaveLength(4);
    expect([...s.test.db.trustedContact.iter()]).toHaveLength(2);
  });

  it('refuses setup until all four personas are registered', () => {
    const s = setup();
    for (const pid of ['alex', 'sam', 'maya'] as const) {
      s.test.withReducerTx(s.auths[pid], ctx => m.demoRegisterPersona(ctx, { personaId: pid, displayName: pid, avatarEmoji: '🙂' }));
    }
    expect(() => s.test.withReducerTx(s.auths.alex, ctx => m.demoSetupGroup(ctx, { name: 'x' }))).toThrow(
      'Register all four personas first: missing jordan'
    );
    expect(s.test.db.nightSession.count()).toBe(0n);
  });

  it('re-registering replaces the identity for a persona and rejects unknown ids', () => {
    const s = setup();
    registerAll(s);
    const newSam = principal('sam-2');
    s.test.withReducerTx(newSam, ctx => m.demoRegisterPersona(ctx, { personaId: 'SAM', displayName: 'Sam', avatarEmoji: '🚗' }));
    expect(s.test.db.demoPersona.count()).toBe(4n);
    expect(s.test.db.demoPersona.personaId.find('sam')!.identity.isEqual(s.id(newSam))).toBe(true);
    // An identity moving to another persona frees its old slot.
    s.test.withReducerTx(newSam, ctx => m.demoRegisterPersona(ctx, { personaId: 'jordan', displayName: 'J', avatarEmoji: '⭐' }));
    expect(s.test.db.demoPersona.personaId.find('sam')).toBeNull();
    expect(s.test.db.demoPersona.personaId.find('jordan')!.identity.isEqual(s.id(newSam))).toBe(true);
    expect(() =>
      s.test.withReducerTx(newSam, ctx => m.demoRegisterPersona(ctx, { personaId: 'zed', displayName: 'Z', avatarEmoji: '' }))
    ).toThrow('Unknown persona id');
    expect(m.demoPersonas(s.test.anonymousViewContext())).toBeDefined();
  });

  it('production guard: non-owners are refused when APP_ENV is production', () => {
    const stub = (appEnv: string | undefined) =>
      ({
        sender: Identity.zero(),
        db: { config: { id: { find: () => undefined } } },
        env: appEnv === undefined ? {} : { APP_ENV: appEnv },
      }) as unknown as Ctx;
    expect(() => requireDemoAllowed(stub('production'))).toThrow('Demo controls are disabled in production');
    expect(() => requireDemoAllowed(stub('demo'))).not.toThrow();
    expect(() => requireDemoAllowed(stub(undefined))).not.toThrow();
    // The owner is always allowed.
    const owner = Identity.zero();
    const asOwner = {
      sender: owner,
      db: { config: { id: { find: () => ({ id: 0, owner, createdAt: NOW }) } } },
      env: { APP_ENV: 'production' },
    } as unknown as Ctx;
    expect(() => requireDemoAllowed(asOwner)).not.toThrow();
  });

  it('demo_reset_group ends the session, cancels its open incidents, and is a no-op afterwards', () => {
    const s = setup();
    registerAll(s);
    s.test.withReducerTx(s.auths.alex, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    const session = openDemoSession(s)!;
    const samId = s.id(s.auths.sam);
    s.test.withReducerTx(s.auths.alex, ctx =>
      m.reportConcern(ctx, { sessionId: session.id, subject: samId, category: { tag: 'possible_consumption' }, note: 'had drinks' })
    );
    expect([...s.test.db.incident.iter()].filter(i => i.status.tag === 'open')).toHaveLength(1);

    s.test.withReducerTx(s.auths.jordan, ctx => m.demoResetGroup(ctx, {}));
    expect(s.test.db.nightSession.id.find(session.id)!.status.tag).toBe('ended');
    expect([...s.test.db.sessionMember.iter()].every(x => !x.active)).toBe(true);
    expect([...s.test.db.consentGrant.iter()].every(g => g.revokedAt !== undefined)).toBe(true);
    expect([...s.test.db.driverAssignment.iter()].every(d => d.endedAt !== undefined)).toBe(true);
    const inc = [...s.test.db.incident.iter()][0]!;
    expect(inc.status.tag).toBe('cancelled');
    expect(inc.resolvedBy?.isEqual(samId)).toBe(true);
    expect([...s.test.db.agentJob.iter()][0]!.status.tag).toBe('cancelled');
    expect(s.test.db.demoSession.count()).toBe(0n);
    expect(s.test.db.sessionExpiry.count()).toBe(0n);
    expect(s.test.db.demoPersona.count()).toBe(4n);

    s.test.withReducerTx(s.auths.jordan, ctx => m.demoResetGroup(ctx, {}));
    expect([...s.test.db.auditEvent.iter()].filter(a => a.action === 'demo_reset_group').map(a => a.resource)).toEqual([
      'ended:1',
      'ended:0',
    ]);

    // After a reset, setup creates a fresh session again.
    s.test.withReducerTx(s.auths.alex, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    expect([...s.test.db.nightSession.iter()].filter(x => x.status.tag === 'active')).toHaveLength(1);
  });

  it('reset_demo clears demo sessions but keeps personas', () => {
    const s = setup();
    registerAll(s);
    s.test.withReducerTx(s.auths.alex, ctx => m.demoSetupGroup(ctx, { name: 'Judge demo' }));
    s.test.withReducerTx(s.auths.alex, ctx => m.resetDemo(ctx, {}));
    expect(s.test.db.demoSession.count()).toBe(0n);
    expect(s.test.db.demoPersona.count()).toBe(4n);
  });
});
