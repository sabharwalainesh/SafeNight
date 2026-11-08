// Live demo / e2e seed: four identities, a driver concern, simulated (or live) Nemotron coordination,
// primary non-response → backup escalation, acknowledgment → transport proposal.
// Run: `npx tsx scripts/demo_driver_incident.mts` from the repo root against a local server
// with the module published. Exits 0 only when the job reached transport_pending or later.
import { DbConnection, tables } from '../web/src/module_bindings/index.ts';

const HOST = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.SPACETIMEDB_DB_NAME ?? 'safenight';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const short = (hex: string) => hex.slice(0, 8);

async function waitFor<T>(label: string, fn: () => T | undefined, ms = 45_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = fn();
    if (v !== undefined) return v;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}`);
}

type Client = { conn: DbConnection; hex: string; alerts: string[]; name: string };
function connect(name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const alerts: string[] = [];
    const conn = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnectError((_c, e) => reject(e))
      .onConnect((ctx, identity) => {
        ctx.db.safetyAlert.onInsert((_c, row) => alerts.push(`${row.kind.tag}: ${row.message.slice(0, 60)}`));
        ctx
          .subscriptionBuilder()
          .onError((_c, e) => reject(e))
          .onApplied(() => resolve({ conn, hex: identity.toHexString(), alerts, name }))
          .subscribe([
            tables.safetyAlert,
            tables.mySessions,
            tables.myInvites,
            tables.myRosters,
            tables.driverAssignment,
            tables.myIncidents,
            tables.myAgentJobs,
            tables.myAgentPlans,
            tables.myAgentActions,
            tables.myNotifications,
            tables.myRidePlans,
            tables.myIncidentEvents,
          ]);
      })
      .build();
  });
}

const alex = await connect('Alex (organizer)');
const sam = await connect('Sam (driver)');
const maya = await connect('Maya (buddy #1)');
const jordan = await connect('Jordan (backup #2)');
const all = [alex, sam, maya, jordan];
for (const c of all) console.log(`${c.name}: ${short(c.hex)}`);

// Judge-demo helpers: each tab binds its identity to a persona, then any tab builds the group.
await alex.conn.reducers.demoRegisterPersona({ personaId: 'alex', displayName: 'Alex', avatarEmoji: '🦊' });
await sam.conn.reducers.demoRegisterPersona({ personaId: 'sam', displayName: 'Sam', avatarEmoji: '🚗' });
await maya.conn.reducers.demoRegisterPersona({ personaId: 'maya', displayName: 'Maya', avatarEmoji: '🛡️' });
await jordan.conn.reducers.demoRegisterPersona({ personaId: 'jordan', displayName: 'Jordan', avatarEmoji: '⭐' });

const sessionName = `Demo ${new Date().toISOString().slice(11, 19)}`;
await alex.conn.reducers.demoSetupGroup({ name: sessionName });
const session = await waitFor('session', () => [...alex.conn.db.mySessions.iter()].find(s => s.name === sessionName));
await waitFor('roster of 4', () => ([...alex.conn.db.myRosters.iter()].filter(r => r.sessionId === session.id).length === 4 ? true : undefined));
const samId = [...alex.conn.db.myRosters.iter()].find(r => r.sessionId === session.id && r.displayName === 'Sam')!.userId;
const driverRow = await waitFor('accepted driver', () =>
  [...sam.conn.db.driverAssignment.iter()].find(d => d.sessionId === session.id && d.acceptedAt !== undefined)
);
if (!driverRow.driverId.isEqual(samId)) throw new Error('expected Sam to be the accepted driver');
console.log('Setup done via demo_setup_group: session, roster of 4, accepted driver Sam, buddies Maya (1) and Jordan (2), consent matrix, simulated locations.');

console.log('\n1. Alex reports a concern about the driver...');
await alex.conn.reducers.reportConcern({ sessionId: session.id, subject: samId, category: { tag: 'PossibleConsumption' }, note: 'Sam had a few drinks' });
const incident = await waitFor('incident', () => [...alex.conn.db.myIncidents.iter()].find(i => i.sessionId === session.id));
console.log(`   incident #${incident.id} ${incident.kind.tag} ${incident.severity.tag}`);
await sleep(600);
console.log(`   Sam's alerts: ${JSON.stringify(sam.alerts)}`);

const jobRow = () => [...alex.conn.db.myAgentJobs.iter()].find(j => j.incidentId === incident.id);
const job = await waitFor('agent job', jobRow);
console.log(`2. Agent job #${job.id} status=${job.status.tag}; waiting for the first plan...`);
await waitFor('plan v1', () => ([...alex.conn.db.myAgentPlans.iter()].some(p => p.jobId === job.id) ? true : undefined), 75_000);
await sleep(1500);
const printState = (label: string) => {
  const j = jobRow()!;
  const plans = [...alex.conn.db.myAgentPlans.iter()].filter(p => p.jobId === job.id).sort((a, b) => a.version - b.version);
  const actions = [...alex.conn.db.myAgentActions.iter()].filter(a => a.jobId === job.id).sort((a, b) => Number(a.id - b.id));
  console.log(`\n== ${label}: job ${j.status.tag} tier=${j.escalationTier} planVersion=${j.planVersion}`);
  for (const p of plans) console.log(`   plan v${p.version} [${p.model}${p.simulated ? ', SIMULATED' : ''}]: ${p.summary}`);
  for (const a of actions) console.log(`   receipt v${a.planVersion} ${a.tool} → ${a.status.tag}${a.rejectReason ? ` (${a.rejectReason})` : ''}${a.simulated ? ' [SIMULATED]' : ''}`);
  console.log(`   Maya notifications: ${[...maya.conn.db.myNotifications.iter()].map(n => `${n.template}:${n.status.tag}`).join(', ') || '-'}`);
  console.log(`   Jordan notifications: ${[...jordan.conn.db.myNotifications.iter()].map(n => `${n.template}:${n.status.tag}`).join(', ') || '-'}`);
};
printState('after plan v1');
const mayaGotAlert = [...maya.conn.db.myNotifications.iter()].some(n => n.template === 'buddy_alert');
if (!mayaGotAlert) throw new Error('expected Maya (priority 1) to be contacted first');

console.log('\n3. Maya does not respond. Firing the follow-up timer now (demo control)...');
await alex.conn.reducers.demoFireFollowup({ jobId: job.id });
await waitFor('plan v2', () => ([...alex.conn.db.myAgentPlans.iter()].some(p => p.jobId === job.id && p.version === 2) ? true : undefined), 75_000);
await sleep(1500);
printState('after escalation');
const jordanGotAlert = [...jordan.conn.db.myNotifications.iter()].some(n => n.template === 'backup_alert');
if (!jordanGotAlert) throw new Error('expected Jordan (backup) to be contacted after the non-response');

console.log('\n4. Jordan acknowledges...');
await jordan.conn.reducers.acknowledgeAssistance({ jobId: job.id });
const ride = await waitFor('ride plan', () => [...alex.conn.db.myRidePlans.iter()].find(r => r.incidentId === incident.id), 90_000);
await sleep(1000);
printState('after acknowledgment');
const options = JSON.parse(ride.optionsJson);
console.log(`   ride plan #${ride.id} ${ride.status.tag}; transport lookup status=${options.status}${options.error ? ` (${options.error})` : ''}`);
for (const o of options.options ?? []) console.log(`     - ${o.label} [${o.source}]${o.durationMinutes ? ` ~${o.durationMinutes} min` : ''}${o.url ? ` ${o.url}` : ''}`);

console.log('\n5. Sam picks Uber and confirms the booking; later confirms pickup and home...');
await sam.conn.reducers.acceptRideOption({ ridePlanId: ride.id, option: 'Uber' });
await sam.conn.reducers.confirmRideBooked({ ridePlanId: ride.id });
await waitFor('job awaiting home', () => (jobRow()?.status.tag === 'AwaitingHomeConfirmation' ? true : undefined));
await sleep(1500);
await sam.conn.reducers.confirmPickup({ ridePlanId: ride.id });
await sam.conn.reducers.confirmHome({ incidentId: incident.id });
await waitFor('job resolved', () => (jobRow()?.status.tag === 'Resolved' ? true : undefined));
printState('after home confirmation');
console.log('\nTimeline:');
for (const e of [...alex.conn.db.myIncidentEvents.iter()].filter(e => e.incidentId === incident.id).sort((a, b) => Number(a.id - b.id))) {
  console.log(`   ${e.at.toDate().toISOString().slice(11, 19)} ${e.kind}${e.simulated ? ' [SIMULATED]' : ''}: ${e.detail}`);
}
const finalJob = jobRow()!;
const reachedTransport = ['TransportPending', 'AwaitingHomeConfirmation', 'Resolved'].includes(finalJob.status.tag);
console.log(reachedTransport ? '\nDEMO: PASS' : `\nDEMO: FAIL (job ended in ${finalJob.status.tag})`);
for (const c of all) c.conn.disconnect();
process.exit(reachedTransport ? 0 : 1);
