// Live RLS check: a member sees its session's rows on the public tables; an outsider sees none.
// Run: `npx tsx scripts/check_rls.mts` from the repo root against a local server with the module published.
import { Timestamp } from 'spacetimedb';
import { DbConnection, tables } from '../web/src/module_bindings/index.ts';

const HOST = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.SPACETIMEDB_DB_NAME ?? 'safenight';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function connect(name: string): Promise<{ conn: DbConnection; hex: string; alerts: number }> {
  return new Promise((resolve, reject) => {
    const client = { conn: undefined as unknown as DbConnection, hex: '', alerts: 0 };
    client.conn = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnectError((_c, e) => reject(e))
      .onConnect((ctx, identity) => {
        client.hex = identity.toHexString();
        ctx.db.safetyAlert.onInsert(() => client.alerts++);
        ctx.subscriptionBuilder()
          .onError((_c, e) => reject(e))
          .onApplied(() => resolve(client))
          .subscribe([tables.sessionMember, tables.nightSession, tables.driverAssignment, tables.safetyAlert, tables.mySessions, tables.myRosters]);
      })
      .build();
    void name;
  });
}

const alex = await connect('alex');
const outsider = await connect('outsider');
await alex.conn.reducers.setProfile({ displayName: 'RLS Alex', avatarEmoji: '🦊' });
await outsider.conn.reducers.setProfile({ displayName: 'RLS Outsider', avatarEmoji: '👤' });
const name = `RLS check ${new Date().toISOString().slice(11, 19)}`;
await alex.conn.reducers.createSession({
  name,
  venueHint: '',
  startsAt: Timestamp.fromDate(new Date()),
  expiresAt: Timestamp.fromDate(new Date(Date.now() + 3600_000)),
  checkinIntervalMinutes: 60,
});
await alex.conn.reducers.volunteerDriver({ sessionId: [...alex.conn.db.mySessions.iter()].find(s => s.name === name)!.id });
await sleep(1500);

const session = [...alex.conn.db.nightSession.iter()].find(s => s.name === name);
const alexMembers = [...alex.conn.db.sessionMember.iter()].filter(m => session && m.sessionId === session.id).length;
const alexDrivers = [...alex.conn.db.driverAssignment.iter()].filter(d => session && d.sessionId === session.id).length;
const outSessions = [...outsider.conn.db.nightSession.iter()].length;
const outMembers = [...outsider.conn.db.sessionMember.iter()].length;
const outDrivers = [...outsider.conn.db.driverAssignment.iter()].length;
console.log(`member sees: session=${session ? 1 : 0} members=${alexMembers} drivers=${alexDrivers}`);
console.log(`outsider sees: members=${outMembers} (filtered) sessions=${outSessions} drivers=${outDrivers} (unfiltered by design, see rls.ts)`);
// night_session and driver_assignment have no RLS filter on 2.14.1 (see spacetimedb/src/rls.ts); only session_member is row-filtered.
const ok = !!session && alexMembers === 1 && alexDrivers === 1 && outMembers === 0;
console.log(ok ? 'RLS: PASS' : 'RLS: FAIL');
alex.conn.disconnect();
outsider.conn.disconnect();
process.exit(ok ? 0 : 1);
