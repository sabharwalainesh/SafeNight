import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, demoTabs, elapse, fails, resetStores } from './helpers';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetStores();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('judge demo flow (mock-backed, four tabs)', () => {
  it('runs the full DEMO_SCRIPT from setup to Sam confirming home', async () => {
    const t = await demoTabs();
    const { alex, sam, maya, jordan } = t;

    for (const p of Object.values(t)) expect(p.result.current.no.mySessions).toHaveLength(1);
    expect(alex.result.current.no.roster(alex.result.current.no.mySessions[0].id)?.drivers[0].driverId).toBe('sam');

    // Alex reports Sam; the deterministic warning reaches Sam in the same act.
    await call(() => alex.result.current.safety.actions.reportConcern('sam', 'possible_consumption', ''));
    expect(sam.result.current.safety.alerts.map((a) => a.kind)).toContain('no_driving_warning');

    for (const p of Object.values(t)) {
      expect(p.result.current.safety.incidents).toHaveLength(1);
      expect(p.result.current.safety.incidents[0].kind).toBe('possible_impaired_driving');
    }
    const incId = alex.result.current.safety.incidents[0].id;

    // Agent job, plan v1, receipts, message to Maya.
    let job = alex.result.current.agent.jobForIncident(incId)!;
    expect(job).toBeTruthy();
    expect(job.planVersion).toBe(1);
    expect(job.escalationTier).toBe(0);
    expect(alex.result.current.agent.latestPlan(job.id)?.version).toBe(1);
    const receipts = alex.result.current.agent.receipts(job.id);
    const toMaya = receipts.find((r) => r.tool === 'send_approved_message' && r.args.recipient === 'maya');
    expect(toMaya?.status).toBe('executed');
    expect(toMaya?.simulated).toBe(true);

    const notif = () => maya.result.current.agent.notifications(incId).find((n) => n.recipient === 'maya')!;
    expect(notif().status).toBe('queued');
    await elapse(1500);
    expect(notif().status).toBe('sent');
    await elapse(1500);
    expect(notif().status).toBe('delivered');
    expect(notif().acknowledgedAt).toBeNull();

    // Timer fires: tier 1, plan v2, message to Jordan.
    await call(() => alex.result.current.agent.demo.fireFollowup(job.id));
    job = alex.result.current.agent.jobForIncident(incId)!;
    expect(job.escalationTier).toBe(1);
    expect(job.planVersion).toBe(2);
    expect(alex.result.current.agent.latestPlan(job.id)?.version).toBe(2);
    expect(
      alex.result.current.agent.receipts(job.id).some((r) => r.tool === 'send_approved_message' && r.args.recipient === 'jordan' && r.status === 'executed'),
    ).toBe(true);

    // Maya can no longer acknowledge; Jordan can.
    await fails(() => maya.result.current.agent.actions.acknowledgeAssistance(job.id), /Only the buddy who was asked/);
    await call(() => jordan.result.current.agent.actions.acknowledgeAssistance(job.id));
    expect(jordan.result.current.safety.incidents[0].status).toBe('assistance_underway');

    // Ride flow.
    const ride = sam.result.current.agent.ridePlan(incId)!;
    expect(ride.status).toBe('proposed');
    await call(() => sam.result.current.agent.actions.acceptRideOption(ride.id, 'uber'));
    expect(sam.result.current.agent.ridePlan(incId)?.status).toBe('accepted');
    await call(() => sam.result.current.agent.actions.confirmRideBooked(ride.id));
    expect(sam.result.current.safety.incidents[0].status).toBe('transport_arranged');
    expect(sam.result.current.agent.ridePlan(incId)?.status).toBe('booked_by_user');
    expect(sam.result.current.agent.jobForIncident(incId)?.followupDueAt).toBeNull();

    await call(() => jordan.result.current.agent.actions.confirmPickup(ride.id));
    expect(sam.result.current.safety.incidents[0].status).toBe('awaiting_home_confirmation');
    expect(sam.result.current.agent.jobForIncident(incId)?.status).toBe('awaiting_home_confirmation');

    // Only Sam can confirm home.
    await fails(() => maya.result.current.agent.actions.confirmHome(incId), /Only Sam can confirm/);
    expect(maya.result.current.safety.incidents[0].status).toBe('awaiting_home_confirmation');
    await call(() => sam.result.current.agent.actions.confirmHome(incId));
    const done = alex.result.current.safety.incidents[0];
    expect(done.status).toBe('resolved');
    expect(done.resolvedBy).toBe('sam');
    expect(alex.result.current.agent.jobForIncident(incId)?.status).toBe('resolved');
    expect(alex.result.current.agent.ridePlan(incId)?.status).toBe('completed');
  });

  it('demo.reset clears sessions, incidents and agent data for every tab', async () => {
    const t = await demoTabs();
    await call(() => t.alex.result.current.safety.actions.reportConcern('sam', 'possible_consumption', ''));
    expect(t.maya.result.current.safety.incidents).toHaveLength(1);
    await call(() => t.jordan.result.current.agent.demo.reset());
    for (const p of Object.values(t)) {
      expect(p.result.current.no.mySessions).toHaveLength(0);
      expect(p.result.current.no.myConsents).toHaveLength(0);
      expect(p.result.current.safety.incidents).toHaveLength(0);
    }
    expect(JSON.parse(localStorage.getItem('safenight.mock.agent.v1')!).jobs).toEqual([]);
  });
});
