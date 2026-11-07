// C0 smoke test against a running local SpacetimeDB.
// Usage: npx tsx scripts/e2e.ts   (from the repository root)
//
// Connects with the generated bindings, subscribes to the two C0 views,
// prints their rows, calls `ping`, and exits 0. Exits 1 on connection error
// or if everything has not completed within 15 seconds.

import { DbConnection, tables, type ErrorContext } from '../web/src/module_bindings';

const HOST = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
const DB_NAME = process.env.SPACETIMEDB_DB_NAME ?? 'safenight';
const TIMEOUT_MS = 15_000;

function fail(message: string, error?: unknown): never {
  console.error(`e2e: FAIL ${message}`);
  if (error !== undefined) console.error(error);
  process.exit(1);
}

const timeout = setTimeout(() => fail(`timed out after ${TIMEOUT_MS} ms`), TIMEOUT_MS);

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnectError((_ctx: ErrorContext, err: Error) => fail(`could not connect to ${HOST}/${DB_NAME}`, err))
  .onDisconnect((_ctx: ErrorContext, err?: Error) => {
    if (err) fail('disconnected with error', err);
  })
  .onConnect((ctx, identity) => {
    console.log(`e2e: connected to ${HOST}/${DB_NAME} as ${identity.toHexString().slice(0, 12)}…`);

    ctx
      .subscriptionBuilder()
      .onError((_ctx, err) => fail('subscription rejected', err))
      .onApplied(async () => {
        const status = [...ctx.db.runtimeStatus.iter()];
        const online = [...ctx.db.onlineMembers.iter()];
        console.log('e2e: runtime_status =', JSON.stringify(status, bigintReplacer));
        console.log(`e2e: online_members = ${online.length} row(s)`);
        if (status.length !== 1) fail(`expected exactly one runtime_status row, got ${status.length}`);
        if (online.length < 1) fail('expected at least this connection in online_members');

        try {
          await ctx.reducers.ping({ note: 'e2e smoke' });
          console.log('e2e: ping accepted');
        } catch (err) {
          fail('ping reducer rejected', err);
        }

        try {
          await ctx.reducers.ping({ note: 'x'.repeat(201) });
          fail('ping with an over-long note should have been rejected');
        } catch {
          console.log('e2e: over-long ping rejected as expected');
        }

        clearTimeout(timeout);
        console.log('e2e: PASS');
        conn.disconnect();
        process.exit(0);
      })
      .subscribe([tables.runtimeStatus, tables.onlineMembers]);
  })
  .build();

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}
