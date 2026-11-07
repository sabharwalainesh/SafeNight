import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, demoTabs, elapse, fails, resetStores, tab } from './helpers';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetStores();
});
afterEach(() => {
  vi.useRealTimers();
});

const HOUR = 3600000;

async function manualSession() {
  const alex = tab('alex');
  const sam = tab('sam');
  let sid = '';
  let code = '';
  await call(async () => {
    sid = await alex.result.current.no.actions.createSession({
      name: 'Night',
      venueHint: 'Bar',
      startsAt: Date.now(),
      expiresAt: Date.now() + 4 * HOUR,
      checkinIntervalMinutes: 30,
    });
  });
  await call(async () => {
    code = (await alex.result.current.no.actions.createInvite(sid, 60, 5)).code;
  });
  return { alex, sam, sid, code };
}

describe('C1 rules', () => {
  it('joins by invite code and rejects a bad code', async () => {
    const { sam, sid, code } = await manualSession();
    await fails(() => sam.result.current.no.actions.joinSession('ZZZZZZ'), /invalid or expired/);
    await call(() => sam.result.current.no.actions.joinSession(code.toLowerCase()));
    expect(sam.result.current.no.mySessions.map((s) => s.id)).toEqual([sid]);
    await fails(() => sam.result.current.no.actions.joinSession(code), /Already in this session/);
  });

  it('only the volunteer can accept the driver role', async () => {
    const { alex, sam, sid, code } = await manualSession();
    await call(() => sam.result.current.no.actions.joinSession(code));
    await call(() => sam.result.current.no.actions.volunteerDriver(sid));
    const aId = sam.result.current.no.roster(sid)!.drivers[0].id;
    await fails(() => alex.result.current.no.actions.acceptDriverRole(aId), /Only the driver/);
    expect(sam.result.current.no.roster(sid)!.drivers[0].acceptedAt).toBeNull();
    await call(() => sam.result.current.no.actions.acceptDriverRole(aId));
    expect(alex.result.current.no.roster(sid)!.drivers[0].acceptedAt).not.toBeNull();
  });

  it('the organizer has no way to change another member sharing scope', async () => {
    const { alex, sam, sid, code } = await manualSession();
    await call(() => sam.result.current.no.actions.joinSession(code));
    // setSharingScope takes no target: it only ever changes the caller.
    await call(() => alex.result.current.no.actions.setSharingScope(sid, 'precise'));
    const scope = (u: string) => alex.result.current.no.roster(sid)!.members.find((m) => m.userId === u)!.sharingScope;
    expect(scope('alex')).toBe('precise');
    expect(scope('sam')).toBe('none');
  });

  it('leaving revokes the leaver own grants; ending revokes all', async () => {
    const t = await demoTabs();
    const sid = t.alex.result.current.no.mySessions[0].id;
    expect(t.alex.result.current.no.myConsents.some((g) => g.subject === 'jordan')).toBe(true);
    await call(() => t.jordan.result.current.no.actions.leaveSession(sid));
    expect(t.alex.result.current.no.myConsents.some((g) => g.subject === 'jordan')).toBe(false);
    expect(t.alex.result.current.no.myConsents.some((g) => g.subject === 'maya')).toBe(true);
    await fails(() => t.alex.result.current.no.actions.leaveSession(sid), /Organizer must end/);
    await call(() => t.alex.result.current.no.actions.endSession(sid));
    for (const p of [t.alex, t.sam, t.maya]) expect(p.result.current.no.myConsents).toHaveLength(0);
  });
});

describe('C2 rules', () => {
  it('rejects a duplicate concern', async () => {
    const t = await demoTabs();
    await call(() => t.alex.result.current.safety.actions.reportConcern('maya', 'unwell', ''));
    await fails(() => t.alex.result.current.safety.actions.reportConcern('maya', 'unwell', ''), /Already reported/);
  });

  it('an okay check-in does not close the incident', async () => {
    const t = await demoTabs();
    await call(() => t.maya.result.current.safety.actions.checkIn('need_friend', ''));
    expect(t.maya.result.current.safety.incidents).toHaveLength(1);
    await call(() => t.maya.result.current.safety.actions.checkIn('okay', ''));
    const inc = t.alex.result.current.safety.incidents[0];
    expect(inc.status).toBe('open');
    expect(t.alex.result.current.safety.timeline(inc.id).map((e) => e.kind)).toContain('subject_says_fine');
  });

  it('the subject cannot acknowledge their own incident', async () => {
    const t = await demoTabs();
    await call(() => t.maya.result.current.safety.actions.checkIn('unwell', ''));
    const id = t.maya.result.current.safety.incidents[0].id;
    await fails(() => t.maya.result.current.safety.actions.acknowledgeIncident(id), /own alert/);
    await call(() => t.alex.result.current.safety.actions.acknowledgeIncident(id));
    expect(t.maya.result.current.safety.incidents[0].status).toBe('acknowledged');
  });

  it('only the subject can cancel, and only within 2 minutes', async () => {
    const t = await demoTabs();
    await call(() => t.maya.result.current.safety.actions.checkIn('need_ride', ''));
    const id = t.maya.result.current.safety.incidents[0].id;
    await fails(() => t.alex.result.current.safety.actions.cancelIncident(id, ''), /Only the person can cancel/);
    await elapse(3 * 60000);
    await fails(() => t.maya.result.current.safety.actions.cancelIncident(id, ''), /within 2 minutes/);

    await call(() => t.jordan.result.current.safety.actions.checkIn('unwell', ''));
    const jid = t.jordan.result.current.safety.incidents.find((i) => i.subject === 'jordan')!.id;
    await call(() => t.jordan.result.current.safety.actions.cancelIncident(jid, 'false alarm'));
    expect(t.alex.result.current.safety.incidents.find((i) => i.id === jid)?.status).toBe('cancelled');
  });

  it('hides locations without consent, rounds them with an approximate grant', async () => {
    const { alex, sam, sid, code } = await manualSession();
    await call(() => sam.result.current.no.actions.joinSession(code));
    await call(() => sam.result.current.no.actions.setSharingScope(sid, 'precise'));
    await call(() => sam.result.current.safety.actions.postLocation(40.123456, -74.987654, 10, 'simulated'));
    expect(alex.result.current.safety.locations).toHaveLength(0);

    await call(() => sam.result.current.no.actions.grantConsent('alex', sid, 'location_approximate', 60));
    const [loc] = alex.result.current.safety.locations;
    expect(loc.approximate).toBe(true);
    expect(loc.lat).toBe(40.123);
    expect(loc.lng).toBe(-74.988);

    await call(() => sam.result.current.no.actions.grantConsent('alex', sid, 'location_precise', 60));
    expect(alex.result.current.safety.locations[0].approximate).toBe(false);
    expect(alex.result.current.safety.locations[0].lat).toBe(40.123456);

    const g = sam.result.current.no.myConsents.filter((c) => c.subject === 'sam');
    for (const c of g) await call(() => sam.result.current.no.actions.revokeConsent(c.id));
    expect(alex.result.current.safety.locations).toHaveLength(0);
  });
});

describe('C3 rules', () => {
  const revokeMessaging = async (t: Awaited<ReturnType<typeof demoTabs>>, who: 'alex' | 'maya' | 'jordan') => {
    const tabw = t[who];
    const grant = tabw.result.current.no.myConsents.find((g) => g.subject === who && g.recipient === 'sam' && g.scope === 'messaging')!;
    await call(() => tabw.result.current.no.actions.revokeConsent(grant.id));
  };

  it('revoked messaging consent gives a Blocked receipt and skips to the next tier', async () => {
    const t = await demoTabs();
    await revokeMessaging(t, 'maya');
    await call(() => t.alex.result.current.safety.actions.reportConcern('sam', 'possible_consumption', ''));
    const incId = t.alex.result.current.safety.incidents[0].id;
    const job = t.alex.result.current.agent.jobForIncident(incId)!;
    const rs = t.alex.result.current.agent.receipts(job.id);
    const blocked = rs.find((r) => r.tool === 'send_approved_message' && r.status === 'rejected');
    expect(blocked?.args.recipient).toBe('maya');
    expect(blocked?.rejectReason).toMatch(/consent/i);
    expect(job.escalationTier).toBe(1);
    const notes = t.alex.result.current.agent.notifications(incId);
    expect(notes.map((n) => n.recipient)).toEqual(['jordan']);
  });

  it('no false handoff when the organizer cannot be reached', async () => {
    const t = await demoTabs();
    for (const who of ['maya', 'jordan', 'alex'] as const) await revokeMessaging(t, who);
    await call(() => t.alex.result.current.safety.actions.reportConcern('sam', 'possible_consumption', ''));
    const incId = t.alex.result.current.safety.incidents[0].id;
    const job = t.alex.result.current.agent.jobForIncident(incId)!;
    expect(job.status).not.toBe('handed_off');
    expect(job.status).toBe('escalated');
    expect(t.alex.result.current.agent.notifications(incId)).toHaveLength(0);
    const rs = t.alex.result.current.agent.receipts(job.id);
    expect(rs.find((r) => r.tool === 'handoff_to_organizer')?.status).toBe('rejected');
    expect(rs.some((r) => r.tool === 'handoff_to_organizer' && r.status === 'executed')).toBe(false);
    expect(t.alex.result.current.safety.incidents[0].status).toBe('open');
    expect(t.alex.result.current.safety.timeline(incId).map((e) => e.kind)).toContain('agent_no_one_reachable');
  });
});
