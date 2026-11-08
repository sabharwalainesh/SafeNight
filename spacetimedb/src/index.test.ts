import { describe, expect, it } from 'vitest';
import { ConnectionId, Timestamp, type Identity } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';

import spacetimedb, * as moduleExports from './index';

let nextConnection = 1n;
function principal(subject: string) {
  return TestAuth.fromJwtPayload(
    JSON.stringify({ iss: 'https://safenight.test', sub: subject }),
    new ConnectionId(nextConnection++)
  );
}

function harness() {
  return createModuleTestHarness(spacetimedb, moduleExports);
}

describe('C0 system module', () => {
  it('init stores the publisher as owner and writes an audit row', () => {
    const test = harness();
    const owner = principal('owner');
    let ownerIdentity: Identity | undefined;
    test.withReducerTx(owner, ctx => {
      ownerIdentity = ctx.sender;
      moduleExports.init(ctx, {});
    });
    const row = test.db.config.id.find(0);
    expect(row).toBeDefined();
    expect(row!.owner.isEqual(ownerIdentity!)).toBe(true);
    const audits = [...test.db.auditEvent.iter()];
    expect(audits.map(a => a.action)).toEqual(['init']);
  });

  it('connect and disconnect toggle presence and connection count', () => {
    const test = harness();
    const alice = principal('alice');
    let aliceId: Identity | undefined;
    test.withReducerTx(alice, ctx => {
      aliceId = ctx.sender;
      moduleExports.onConnect(ctx, {});
    });
    expect(test.db.clientPresence.identity.find(aliceId!)).toMatchObject({
      online: true,
      connectionCount: 1,
    });
    test.withReducerTx(alice, ctx => moduleExports.onConnect(ctx, {}));
    expect(test.db.clientPresence.identity.find(aliceId!)?.connectionCount).toBe(2);
    test.withReducerTx(alice, ctx => moduleExports.onDisconnect(ctx, {}));
    expect(test.db.clientPresence.identity.find(aliceId!)).toMatchObject({
      online: true,
      connectionCount: 1,
    });
    test.withReducerTx(alice, ctx => moduleExports.onDisconnect(ctx, {}));
    expect(test.db.clientPresence.identity.find(aliceId!)).toMatchObject({
      online: false,
      connectionCount: 0,
    });
  });

  it('ping records an audit row with the caller and the clock timestamp', () => {
    const test = harness();
    const now = Timestamp.fromDate(new Date('2026-11-07T22:00:00Z'));
    test.clock.set(now);
    const alice = principal('alice');
    let aliceId: Identity | undefined;
    test.withReducerTx(alice, ctx => {
      aliceId = ctx.sender;
      moduleExports.ping(ctx, { note: 'hello' });
    });
    const audits = [...test.db.auditEvent.iter()];
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor.isEqual(aliceId!)).toBe(true);
    expect(audits[0]!.action).toBe('ping');
    expect(audits[0]!.at.microsSinceUnixEpoch).toBe(now.microsSinceUnixEpoch);
  });

  it('rejects an over-long note and rolls back', () => {
    const test = harness();
    const alice = principal('alice');
    expect(() =>
      test.withReducerTx(alice, ctx => {
        moduleExports.ping(ctx, { note: 'ok' });
        moduleExports.ping(ctx, { note: 'x'.repeat(201) });
      })
    ).toThrow('Note too long');
    expect(test.db.auditEvent.count()).toBe(0n);
  });

  it('online_members returns only online rows', () => {
    const test = harness();
    const alice = principal('alice');
    const bob = principal('bob');
    test.withReducerTx(alice, ctx => moduleExports.onConnect(ctx, {}));
    test.withReducerTx(bob, ctx => {
      moduleExports.onConnect(ctx, {});
      moduleExports.onDisconnect(ctx, {});
    });
    const rows = test.runQuery<{ online: boolean }>(
      moduleExports.onlineMembers(test.anonymousViewContext())
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.online).toBe(true);
  });

  it('runtime_status reports simulated mode without a Nemotron key', () => {
    const test = harness();
    const rows = moduleExports.runtimeStatus(test.anonymousViewContext());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 0,
      nemotronMode: 'simulated',
      messagingMode: 'simulated',
      appEnv: 'development',
      moduleVersion: '0.8.0-sec',
    });
  });
});
