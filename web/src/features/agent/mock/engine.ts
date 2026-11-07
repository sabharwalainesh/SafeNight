// MOCK until C3-A bindings: deterministic simulated planner, follow-up escalation and human actions.
// Nothing here calls a model, SMS or voice provider. Every output is labeled simulated.
import type { EpochMs, UserId } from '../../night-out/api';
import type { IncidentStatus } from '../../safety/api';
import { getSnapshot as noSnap, mutate as noMutate, type MockState as NoState } from '../../night-out/mock/store';
import { getSnapshot as safeSnap, mutate as safeMutate, type MockState as SafeState } from '../../safety/mock/store';
import type { ActionStatus, AgentActions, DemoActions, RideOption } from '../api';
import { empty, getSnapshot, mutate, type MockState, type StoredJob } from './store';

export const MODEL = 'simulated-planner';
export const FOLLOWUP_MS = 2 * 60000;
const MIN = 60000;
const AGENT = 'agent';
const AGENT_NAME = 'SafeNight agent';
const TRIGGER_KINDS = ['possible_impaired_driving', 'help_requested'];
const OPEN_JOB: StoredJob['status'][] = ['waiting_for_ack', 'escalated'];

type SafetyWrite = {
  incidentId: string;
  actor: UserId;
  actorName: string;
  kind: string;
  detail: string;
  simulated: boolean;
  status?: IncidentStatus;
  ackBy?: UserId;
  resolvedBy?: UserId;
};

type Roster = {
  members: NoState['members'];
  organizer: UserId | null;
  driverId: UserId | null;
  grants: NoState['grants'];
};

function rosterOf(sessionId: string): Roster {
  const no = noSnap();
  return {
    members: no.members.filter((m) => m.sessionId === sessionId && m.leftAt === null),
    organizer: no.sessions.find((x) => x.id === sessionId)?.organizer ?? null,
    driverId: no.drivers.find((d) => d.sessionId === sessionId && d.endedAt === null && d.acceptedAt !== null)?.driverId ?? null,
    grants: no.grants.filter((g) => g.sessionId === sessionId),
  };
}

const live = (g: NoState['grants'][number], now: EpochMs) => g.revokedAt === null && g.startsAt <= now + 1000 && g.expiresAt > now;
const nameOf = (r: Roster, u: UserId) => r.members.find((m) => m.userId === u)?.displayName ?? u;

function writeSafety(writes: SafetyWrite[]) {
  if (writes.length === 0) return;
  safeMutate((s: SafeState, id) => {
    for (const w of writes) {
      const inc = s.incidents.find((i) => i.id === w.incidentId);
      if (!inc) continue;
      if (w.status) inc.status = w.status;
      if (w.ackBy) {
        const p = inc.participants.find((x) => x.userId === w.ackBy);
        if (p && p.acknowledgedAt === null) p.acknowledgedAt = Date.now();
      }
      if (w.resolvedBy) {
        inc.resolvedAt = Date.now();
        inc.resolvedBy = w.resolvedBy;
      }
      s.events.push({ id: id(), incidentId: w.incidentId, at: Date.now(), actor: w.actor, actorName: w.actorName, kind: w.kind, detail: w.detail, simulated: w.simulated });
    }
  });
}

const agentWrite = (incidentId: string, kind: string, detail: string, status?: IncidentStatus): SafetyWrite => ({
  incidentId,
  actor: AGENT,
  actorName: AGENT_NAME,
  kind,
  detail: `${detail} (SIMULATED)`,
  simulated: true,
  status,
});

function receipt(s: MockState, id: () => string, job: StoredJob, tool: string, status: ActionStatus, resultText: string, args: Record<string, unknown> = {}, rejectReason = '') {
  s.actions.push({ id: id(), jobId: job.id, planVersion: job.planVersion, tool, args, status, resultText, rejectReason, simulated: true, at: Date.now() });
}

function buildPlan(s: MockState, id: () => string, job: StoredJob, summary: string) {
  const steps = s.actions
    .filter((a) => a.jobId === job.id && a.planVersion === job.planVersion)
    .map((a) => ({ title: a.tool.replace(/_/g, ' '), detail: a.status === 'rejected' ? `Rejected: ${a.rejectReason}` : a.resultText }));
  s.plans.push({ id: id(), jobId: job.id, version: job.planVersion, summary, steps, model: MODEL, simulated: true, createdAt: Date.now() });
}

/** Try to message the person at `tier`. Re-checks consent every time (revocation). */
function sendTo(s: MockState, id: () => string, job: StoredJob, tier: number, r: Roster): boolean {
  const to = job.tiers[tier];
  const name = job.tierNames[tier];
  const now = Date.now();
  const consent = r.grants.some((g) => g.subject === to && g.scope === 'messaging' && live(g, now));
  if (!consent) {
    receipt(s, id, job, 'send_approved_message', 'rejected', `Message to ${name} not sent`, { recipient: to, tier }, `No messaging consent from ${name}`);
    return false;
  }
  const handoff = tier >= 2;
  s.notifications.push({
    id: id(),
    incidentId: job.incidentId,
    recipient: to,
    recipientName: name,
    channel: 'in_app',
    template: handoff ? 'organizer_handoff' : 'buddy_help',
    body: handoff
      ? `${job.subjectName} may need help getting home and no buddy has replied. You are the organizer, so this is handed to you.`
      : `${job.subjectName} may need help getting home. Can you check on them?`,
    status: 'queued',
    simulated: true,
    createdAt: now,
    acknowledgedAt: null,
    sentAt: now + 1000,
    deliveredAt: now + 2000,
  });
  receipt(s, id, job, 'send_approved_message', 'executed', `In-app message to ${name} queued (SIMULATED, not yet delivered)`, { recipient: to, tier, channel: 'in_app' });
  return true;
}

/** Send starting at `start`, escalating past tiers that refuse. Sets tier, status and follow-up. */
function route(s: MockState, id: () => string, job: StoredJob, start: number, r: Roster, lastEvent: string) {
  let t = start;
  while (t <= 2 && !sendTo(s, id, job, t, r)) t++;
  t = Math.min(t, 2);
  job.escalationTier = t;
  job.lastEvent = lastEvent;
  job.updatedAt = Date.now();
  if (t >= 2) {
    job.status = 'handed_off';
    job.followupDueAt = null;
    job.followupExpectedFrom = null;
    receipt(s, id, job, 'handoff_to_organizer', 'executed', `Handed off to organizer ${job.tierNames[2]}`, { organizer: job.tiers[2] });
    return;
  }
  job.status = t === 0 ? 'waiting_for_ack' : 'escalated';
  receipt(s, id, job, 'request_human_confirmation', 'proposed', `Waiting for ${job.tierNames[t]} to confirm they can help`, { from: job.tiers[t] });
  job.followupDueAt = Date.now() + FOLLOWUP_MS;
  job.followupExpectedFrom = job.tiers[t];
  receipt(s, id, job, 'schedule_followup', 'executed', `Follow-up in 2 minutes if ${job.tierNames[t]} has not replied`, { minutes: 2 });
}

function escalate(s: MockState, id: () => string, job: StoredJob, lastEvent: string, why: string): SafetyWrite[] {
  const r = rosterOf(job.sessionId);
  job.planVersion += 1;
  const from = job.escalationTier;
  route(s, id, job, from + 1, r, lastEvent);
  const to = job.tierNames[job.escalationTier];
  const summary = `${why}. Escalated from ${job.tierNames[from]} to ${to}.`;
  buildPlan(s, id, job, summary);
  return [agentWrite(job.incidentId, 'agent_escalated', summary, undefined)];
}

/** Planner: create a job, plan v1 and ride options for every open triggering incident without a job. */
export function runPlanner() {
  const open = safeSnap().incidents.filter((i) => TRIGGER_KINDS.includes(i.kind) && !['resolved', 'cancelled', 'handed_off'].includes(i.status));
  const pending = open.filter((i) => !getSnapshot().jobs.some((j) => j.incidentId === i.id));
  if (pending.length === 0) return;
  const writes: SafetyWrite[] = [];
  mutate((s, id) => {
    for (const inc of pending) {
      if (s.jobs.some((j) => j.incidentId === inc.id)) continue; // idempotent: checked inside mutate
      const r = rosterOf(inc.sessionId);
      const now = Date.now();
      const others = r.members.filter((m) => m.userId !== inc.subject);
      const pick = (key: string) => others.find((m) => m.userId.toLowerCase() === key || m.displayName.toLowerCase() === key);
      const nonReporter = others.filter((m) => m.userId !== inc.openedBy);
      const primary = pick('maya') ?? nonReporter[0] ?? others[0];
      const backup = pick('jordan') && pick('jordan') !== primary ? pick('jordan') : others.find((m) => m !== primary && m.userId !== inc.openedBy) ?? others.find((m) => m !== primary);
      const orgId = r.organizer ?? primary?.userId ?? inc.subject;
      const tiers = [primary?.userId ?? orgId, backup?.userId ?? orgId, orgId];
      const job: StoredJob = {
        id: id(),
        incidentId: inc.id,
        status: 'planning',
        planVersion: 1,
        escalationTier: 0,
        lastEvent: 'created',
        wakeCount: 1,
        createdAt: now,
        updatedAt: now,
        followupDueAt: null,
        followupExpectedFrom: null,
        sessionId: inc.sessionId,
        subject: inc.subject,
        subjectName: inc.subjectName,
        tiers,
        tierNames: tiers.map((u) => nameOf(r, u)),
        ackedBy: null,
      };
      s.jobs.push(job);
      receipt(s, id, job, 'get_group_context', 'executed', `${r.members.length} members in the session; driver is ${r.driverId ? nameOf(r, r.driverId) : 'not set'}`);
      const checkins = safeSnap().checkins.filter((c) => c.sessionId === inc.sessionId && c.userId === inc.subject);
      receipt(s, id, job, 'get_recent_checkins', 'executed', `${checkins.length} recent check-in(s) from ${inc.subjectName}`);
      const locOk = r.grants.some((g) => g.subject === inc.subject && g.recipient === tiers[0] && g.scope.startsWith('location_') && live(g, now));
      if (locOk) receipt(s, id, job, 'get_last_shared_location', 'executed', `Last shared location of ${inc.subjectName} is visible to ${job.tierNames[0]}`);
      else receipt(s, id, job, 'get_last_shared_location', 'rejected', 'Location not read', {}, `No location consent from ${inc.subjectName}`);
      route(s, id, job, 0, r, 'plan_created');

      const options: RideOption[] = [
        { id: 'uber', kind: 'rideshare', label: 'Uber', url: 'https://m.uber.com/ul/', etaMinutes: null, source: 'Deep link — book in the app', fetchedAt: now, simulated: true },
        { id: 'lyft', kind: 'rideshare', label: 'Lyft', url: 'https://lyft.com/ride', etaMinutes: null, source: 'Deep link — book in the app', fetchedAt: now, simulated: true },
        { id: 'transit', kind: 'transit', label: 'Public transit', url: null, etaMinutes: 25, source: 'SIMULATED estimate — OSRM not called in mock', fetchedAt: now, simulated: true },
        { id: 'walk', kind: 'walk_with_buddy', label: `Walk home with ${job.tierNames[0]}`, url: null, etaMinutes: null, source: 'Suggested by the simulated planner', fetchedAt: now, simulated: true },
      ];
      const friend = others.find((m) => m.userId !== r.driverId);
      if (friend)
        options.push({ id: 'friend', kind: 'friend_driver', label: `Ride with ${friend.displayName}`, url: null, etaMinutes: null, source: 'Suggested by the simulated planner', fetchedAt: now, simulated: true });
      s.rides.push({ id: id(), incidentId: inc.id, riderId: inc.subject, riderName: inc.subjectName, options, chosenOption: null, status: 'proposed', confirmedBy: null, updatedAt: now });
      receipt(s, id, job, 'propose_ride_plan', 'executed', `${options.length} ride options proposed for ${inc.subjectName}; nothing is booked`, { options: options.map((o) => o.id) });

      const summary =
        job.escalationTier === 0
          ? `Ask ${job.tierNames[0]} to check on ${inc.subjectName}, then offer ride options. Everything below is simulated.`
          : `${job.tierNames[0]} could not be asked; routed to ${job.tierNames[job.escalationTier]}. Everything below is simulated.`;
      buildPlan(s, id, job, summary);
      writes.push(agentWrite(inc.id, 'agent_plan', summary));
      writes.push(agentWrite(inc.id, job.escalationTier >= 2 ? 'agent_escalated' : 'agent_message', `Asked ${job.tierNames[job.escalationTier]} to help ${inc.subjectName}`));
    }
  });
  writeSafety(writes);
}

/** Escalate every job whose follow-up is due. The check runs inside mutate so each tier fires once. */
export function checkFollowups() {
  const now = Date.now();
  if (!getSnapshot().jobs.some((j) => OPEN_JOB.includes(j.status) && j.followupDueAt !== null && j.followupDueAt <= now)) return;
  const writes: SafetyWrite[] = [];
  mutate((s, id) => {
    for (const job of s.jobs) {
      if (!OPEN_JOB.includes(job.status) || job.followupDueAt === null || job.followupDueAt > Date.now() || job.escalationTier >= 2) continue;
      writes.push(...escalate(s, id, job, 'followup_expired', `${job.tierNames[job.escalationTier]} did not reply in time`));
    }
  });
  writeSafety(writes);
}

const myName = (r: Roster, me: UserId) => nameOf(r, me);

function findJob(s: MockState, jobId: string): StoredJob {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error('Job not found');
  return job;
}

function requireRecipient(job: StoredJob, me: UserId) {
  if (!['waiting_for_ack', 'escalated', 'handed_off'].includes(job.status)) throw new Error('This request is no longer waiting for a reply');
  if (job.tiers[job.escalationTier] !== me) throw new Error('Only the buddy who was asked can acknowledge');
}

function requireRider(s: MockState, planId: string, me: UserId) {
  const ride = s.rides.find((x) => x.id === planId);
  if (!ride) throw new Error('Ride plan not found');
  const job = s.jobs.find((j) => j.incidentId === ride.incidentId);
  if (me !== ride.riderId && !(job && job.ackedBy === me)) throw new Error('Only the rider or their buddy can choose a ride');
  return { ride, job };
}

export function makeActions(getMe: () => UserId): AgentActions {
  const run = async <T,>(fn: () => T): Promise<T> => fn();
  return {
    acknowledgeAssistance: (jobId) =>
      run(() => {
        const me = getMe();
        const writes: SafetyWrite[] = [];
        mutate((s, id) => {
          const job = findJob(s, jobId);
          requireRecipient(job, me);
          const r = rosterOf(job.sessionId);
          const now = Date.now();
          for (const n of s.notifications) if (n.incidentId === job.incidentId && n.recipient === me && n.acknowledgedAt === null) {
            n.acknowledgedAt = now;
            n.status = 'acknowledged';
          }
          job.ackedBy = me;
          job.status = 'transport_pending';
          job.followupDueAt = null;
          job.followupExpectedFrom = null;
          job.lastEvent = 'acknowledged';
          job.updatedAt = now;
          receipt(s, id, job, 'request_human_confirmation', 'acknowledged', `${myName(r, me)} acknowledged and will help`, { by: me });
          writes.push({ incidentId: job.incidentId, actor: me, actorName: myName(r, me), kind: 'acknowledged', detail: `${myName(r, me)} said they will help`, simulated: false, status: 'assistance_underway', ackBy: me });
        });
        writeSafety(writes);
      }),
    declineAssistance: (jobId, reason) =>
      run(() => {
        const me = getMe();
        const writes: SafetyWrite[] = [];
        mutate((s, id) => {
          const job = findJob(s, jobId);
          requireRecipient(job, me);
          const r = rosterOf(job.sessionId);
          writes.push({ incidentId: job.incidentId, actor: me, actorName: myName(r, me), kind: 'declined', detail: `${myName(r, me)} cannot help${reason ? `: ${reason}` : ''}`, simulated: false });
          writes.push(...escalate(s, id, job, 'buddy_declined', `${myName(r, me)} declined`));
        });
        writeSafety(writes);
      }),
    acceptRideOption: (planId, optionId) =>
      run(() => {
        const me = getMe();
        mutate((s) => {
          const { ride } = requireRider(s, planId, me);
          if (!ride.options.some((o) => o.id === optionId)) throw new Error('Ride option not found');
          if (ride.status !== 'proposed' && ride.status !== 'accepted') throw new Error('This ride is already underway');
          ride.chosenOption = optionId;
          ride.status = 'accepted';
          ride.updatedAt = Date.now();
        });
      }),
    confirmRideBooked: (planId) =>
      run(() => {
        const me = getMe();
        const writes: SafetyWrite[] = [];
        mutate((s) => {
          const { ride, job } = requireRider(s, planId, me);
          if (ride.status !== 'accepted') throw new Error('Choose a ride option first');
          ride.status = 'booked_by_user';
          ride.confirmedBy = me;
          ride.updatedAt = Date.now();
          const r = rosterOf(job?.sessionId ?? '');
          writes.push({ incidentId: ride.incidentId, actor: me, actorName: myName(r, me), kind: 'ride_booked', detail: `${myName(r, me)} says the ride is booked`, simulated: false, status: 'transport_arranged' });
        });
        writeSafety(writes);
      }),
    confirmPickup: (planId) =>
      run(() => {
        const me = getMe();
        const writes: SafetyWrite[] = [];
        mutate((s) => {
          const { ride, job } = requireRider(s, planId, me);
          if (ride.status !== 'booked_by_user') throw new Error('Confirm the ride is booked first');
          ride.status = 'pickup_confirmed';
          ride.confirmedBy = me;
          ride.updatedAt = Date.now();
          if (job) {
            job.status = 'awaiting_home_confirmation';
            job.lastEvent = 'pickup_confirmed';
            job.updatedAt = Date.now();
          }
          const r = rosterOf(job?.sessionId ?? '');
          writes.push({ incidentId: ride.incidentId, actor: me, actorName: myName(r, me), kind: 'pickup_confirmed', detail: `${myName(r, me)} confirmed pickup`, simulated: false, status: 'awaiting_home_confirmation' });
        });
        writeSafety(writes);
      }),
    confirmHome: (incidentId) =>
      run(() => {
        const me = getMe();
        const inc = safeSnap().incidents.find((i) => i.id === incidentId);
        if (!inc) throw new Error('Incident not found');
        if (inc.subject !== me) throw new Error(`Only ${inc.subjectName} can confirm they are home`);
        mutate((s) => {
          const job = s.jobs.find((j) => j.incidentId === incidentId);
          if (job) {
            job.status = 'resolved';
            job.followupDueAt = null;
            job.followupExpectedFrom = null;
            job.lastEvent = 'home_confirmed';
            job.updatedAt = Date.now();
          }
          const ride = s.rides.find((x) => x.incidentId === incidentId);
          if (ride) {
            ride.status = 'completed';
            ride.updatedAt = Date.now();
          }
        });
        writeSafety([{ incidentId, actor: me, actorName: inc.subjectName, kind: 'resolved', detail: `${inc.subjectName} confirmed they are home`, simulated: false, status: 'resolved', resolvedBy: me }]);
      }),
  };
}

function guard() {
  if (import.meta.env.MODE === 'production') throw new Error('Demo controls are disabled in production');
}

export function makeDemo(): DemoActions {
  return {
    fireFollowup: async (jobId) => {
      guard();
      mutate((s) => {
        const job = findJob(s, jobId);
        if (!OPEN_JOB.includes(job.status) || job.followupDueAt === null) throw new Error('No follow-up timer is open for this job');
        job.followupDueAt = Date.now();
      });
      checkFollowups();
    },
    reset: async () => {
      guard();
      mutate((s) => Object.assign(s, empty()));
      safeMutate((s) => {
        s.counter = 0;
        s.locations = [];
        s.checkins = [];
        s.incidents = [];
        s.events = [];
        s.alerts = [];
        s.reports = [];
        s.dismissed = [];
        s.consumptions = [];
      });
      noMutate((s) => {
        s.counter = 0;
        s.sessions = [];
        s.members = [];
        s.invites = [];
        s.drivers = [];
        s.grants = [];
      });
    },
    setupGroup: async () => {
      guard();
      const people: [UserId, string][] = [['alex', 'Alex'], ['sam', 'Sam'], ['maya', 'Maya'], ['jordan', 'Jordan']];
      noMutate((s, id) => {
        const now = Date.now();
        for (const m of s.members) if (m.leftAt === null && people.some(([u]) => u === m.userId)) m.leftAt = now;
        for (const x of s.sessions) if (x.status === 'active' && x.organizer === 'alex') x.status = 'ended';
        const sid = id();
        s.sessions.push({ id: sid, organizer: 'alex', name: 'Saturday night', venueHint: 'Demo venue', startsAt: now, expiresAt: now + 8 * 60 * MIN, status: 'active', checkinIntervalMinutes: 30, createdAt: now });
        for (const [u, n] of people)
          s.members.push({ id: id(), sessionId: sid, userId: u, displayName: n, role: u === 'alex' ? 'organizer' : 'participant', joinedAt: now, leftAt: null, sharingScope: 'precise' });
        s.drivers.push({ id: id(), sessionId: sid, driverId: 'sam', volunteeredAt: now, acceptedAt: now, endedAt: null, endReason: 'none' });
        for (const [subject] of people)
          for (const [recipient] of people)
            if (subject !== recipient)
              for (const scope of ['location_precise', 'checkins', 'messaging', 'concern_reports'] as const)
                s.grants.push({ id: id(), subject, recipient, sessionId: sid, scope, startsAt: now, expiresAt: now + 300 * MIN, revokedAt: null });
      });
    },
  };
}
