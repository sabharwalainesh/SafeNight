import { SenderError, t } from 'spacetimedb/server';
import { closeMeetupsForIncident } from '../lib/meetup';
import type { Identity } from 'spacetimedb';
import { spacetimedb } from '../schema';
import { followupTimer } from '../tables/agent';
import { audit, deny, type Ctx } from '../lib/auth';
import { envOf } from '../lib/env';
import { addEvent, displayNameOf, findParticipant, hasActiveGrant, isOpenStatus, participantsOf, sendAlert } from '../lib/safety';
import {
  clearFollowupTimers,
  closeJobForIncident,
  completeRidePlans,
  hasPendingWake,
  isTerminalJob,
  wakeAgent,
} from '../lib/agent/jobs';
import { runFollowup } from '../lib/agent/followup';

const ACTIVE_FOR_ACK = new Set(['queued', 'planning', 'waiting_for_ack', 'escalated']);
const DEMO_EVENTS = new Set(['incident_opened', 'buddy_nonresponse', 'buddy_declined', 'buddy_acknowledged', 'ride_booked', 'pickup_confirmed']);

function getJob(ctx: Ctx, jobId: bigint) {
  const job = ctx.db.agentJob.id.find(jobId);
  if (!job) throw new SenderError('Job not found');
  const incident = ctx.db.incident.id.find(job.incidentId);
  if (!incident) throw new SenderError('Incident not found');
  return { job, incident };
}

function requireParticipant(ctx: Ctx, incidentId: bigint, who: Identity = ctx.sender) {
  const p = findParticipant(ctx, incidentId, who);
  if (!p) throw new SenderError('Only participants can do that');
  return p;
}

/** The subject, or a buddy/organizer participant who holds the subject's messaging consent. */
function isSubjectOrTrustedHelper(ctx: Ctx, incident: { id: bigint; sessionId: bigint; subject: Identity }, who: Identity) {
  if (incident.subject.isEqual(who)) return true;
  const p = findParticipant(ctx, incident.id, who);
  if (!p) return false;
  return (p.role.tag === 'buddy' || p.role.tag === 'organizer' || p.role.tag === 'reporter' || p.role.tag === 'backup') &&
    hasActiveGrant(ctx, incident.subject, who, incident.sessionId, 'messaging');
}

/** Demo helpers are open to anyone outside production and to the owner always. */
function requireDemoAllowed(ctx: Ctx, action: string) {
  const owner = ctx.db.config.id.find(0)?.owner;
  if (owner?.isEqual(ctx.sender)) return;
  if (envOf(ctx).APP_ENV === 'production') deny(ctx, action, 'demo', 'Demo controls are disabled in production');
}

// Scheduler-only: did the expected person respond?
export const onFollowupDue = spacetimedb.reducer(
  { onSchedule: followupTimer },
  { arg: followupTimer.rowType },
  (ctx, { arg }) => {
    runFollowup(ctx, { jobId: arg.jobId, expectedFrom: arg.expectedFrom, tier: arg.tier });
  }
);

export const acknowledgeAssistance = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  const { job, incident } = getJob(ctx, jobId);
  const p = requireParticipant(ctx, incident.id);
  if (incident.subject.isEqual(ctx.sender)) throw new SenderError("You can't acknowledge your own alert");
  if (isTerminalJob(job.status.tag) || !isOpenStatus(incident.status.tag)) throw new SenderError('This incident is closed');
  const me = displayNameOf(ctx, ctx.sender);
  if (p.acknowledgedAt === undefined) ctx.db.incidentParticipant.id.update({ ...p, acknowledgedAt: ctx.timestamp });
  for (const n of ctx.db.notification.jobId.filter(job.id)) {
    if (n.recipient.isEqual(ctx.sender) && n.status.tag !== 'acknowledged') {
      ctx.db.notification.id.update({ ...n, status: { tag: 'acknowledged' }, acknowledgedAt: ctx.timestamp });
    }
  }
  if (incident.status.tag === 'open') ctx.db.incident.id.update({ ...incident, status: { tag: 'acknowledged' } });
  addEvent(ctx, incident.id, 'acknowledged', `${me} acknowledged and is helping`);
  sendAlert(ctx, incident.subject, incident.id, 'incident_update', `${me} is on it.`);
  clearFollowupTimers(ctx, job.id, job.escalationTier);
  if (ACTIVE_FOR_ACK.has(job.status.tag) && !hasPendingWake(ctx, job.id, 'buddy_acknowledged')) {
    wakeAgent(ctx, job.id, 'buddy_acknowledged', job.planVersion);
    ctx.db.agentJob.id.update({ ...job, lastEvent: 'buddy_acknowledged', updatedAt: ctx.timestamp });
  }
  audit(ctx, 'acknowledge_assistance', `agent_job:${jobId}`);
});

export const declineAssistance = spacetimedb.reducer({ jobId: t.u64(), reason: t.string() }, (ctx, { jobId, reason }) => {
  const { job, incident } = getJob(ctx, jobId);
  requireParticipant(ctx, incident.id);
  if (incident.subject.isEqual(ctx.sender)) throw new SenderError('Use cancel or resolve for your own incident');
  if (isTerminalJob(job.status.tag) || !isOpenStatus(incident.status.tag)) throw new SenderError('This incident is closed');
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incident.id, 'declined', `${me} can't help right now${reason.trim() ? ` (${reason.trim().slice(0, 140)})` : ''}`);
  clearFollowupTimers(ctx, job.id, job.escalationTier);
  if (ACTIVE_FOR_ACK.has(job.status.tag) && !hasPendingWake(ctx, job.id)) {
    wakeAgent(ctx, job.id, 'buddy_declined', job.planVersion);
    ctx.db.agentJob.id.update({ ...job, lastEvent: 'buddy_declined', updatedAt: ctx.timestamp });
  }
});

function getRidePlan(ctx: Ctx, ridePlanId: bigint) {
  const plan = ctx.db.ridePlan.id.find(ridePlanId);
  if (!plan) throw new SenderError('Ride plan not found');
  const incident = ctx.db.incident.id.find(plan.incidentId);
  if (!incident) throw new SenderError('Incident not found');
  return { plan, incident };
}

export const acceptRideOption = spacetimedb.reducer({ ridePlanId: t.u64(), option: t.string() }, (ctx, { ridePlanId, option }) => {
  const { plan, incident } = getRidePlan(ctx, ridePlanId);
  if (!isSubjectOrTrustedHelper(ctx, incident, ctx.sender)) {
    deny(ctx, 'accept_ride_option', `ride_plan:${ridePlanId}`, 'Only the rider or a helper with their messaging consent can choose a ride');
  }
  const chosen = option.trim();
  if (chosen.length === 0 || chosen.length > 80) throw new SenderError('Pick one of the offered options');
  if (plan.status.tag !== 'proposed' && plan.status.tag !== 'accepted') throw new SenderError('This ride plan is no longer open');
  ctx.db.ridePlan.id.update({ ...plan, chosenOption: chosen, status: { tag: 'accepted' }, confirmedBy: ctx.sender, updatedAt: ctx.timestamp });
  addEvent(ctx, incident.id, 'ride_accepted', `${displayNameOf(ctx, ctx.sender)} chose: ${chosen}`);
});

export const confirmRideBooked = spacetimedb.reducer({ ridePlanId: t.u64() }, (ctx, { ridePlanId }) => {
  const { plan, incident } = getRidePlan(ctx, ridePlanId);
  const accepter = plan.confirmedBy;
  if (!incident.subject.isEqual(ctx.sender) && !(accepter && accepter.isEqual(ctx.sender))) {
    deny(ctx, 'confirm_ride_booked', `ride_plan:${ridePlanId}`, 'Only the rider or the helper who chose the ride can confirm the booking');
  }
  if (plan.status.tag !== 'proposed' && plan.status.tag !== 'accepted') throw new SenderError('This ride plan is no longer open');
  if (!isOpenStatus(incident.status.tag)) throw new SenderError('This incident is closed');
  ctx.db.ridePlan.id.update({ ...plan, status: { tag: 'booked_by_user' }, confirmedBy: ctx.sender, updatedAt: ctx.timestamp });
  ctx.db.incident.id.update({ ...incident, status: { tag: 'transport_arranged' } });
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incident.id, 'ride_booked', `${me} confirmed the ride is booked (by a person, not the agent)`);
  const job = ctx.db.agentJob.incidentId.find(incident.id);
  if (job && !isTerminalJob(job.status.tag)) {
    clearFollowupTimers(ctx, job.id);
    ctx.db.agentJob.id.update({ ...job, status: { tag: 'awaiting_home_confirmation' }, lastEvent: 'ride_booked', updatedAt: ctx.timestamp });
    if (!hasPendingWake(ctx, job.id, 'ride_booked')) wakeAgent(ctx, job.id, 'ride_booked', job.planVersion);
  }
  for (const p of participantsOf(ctx, incident.id)) {
    if (!p.userId.isEqual(ctx.sender)) sendAlert(ctx, p.userId, incident.id, 'incident_update', `Transport for ${displayNameOf(ctx, incident.subject)} is booked.`);
  }
  audit(ctx, 'confirm_ride_booked', `ride_plan:${ridePlanId}`);
});

export const confirmPickup = spacetimedb.reducer({ ridePlanId: t.u64() }, (ctx, { ridePlanId }) => {
  const { plan, incident } = getRidePlan(ctx, ridePlanId);
  if (!incident.subject.isEqual(ctx.sender)) deny(ctx, 'confirm_pickup', `ride_plan:${ridePlanId}`, 'Only the rider can confirm the pickup');
  if (plan.status.tag !== 'booked_by_user') throw new SenderError('Confirm the booking first');
  ctx.db.ridePlan.id.update({ ...plan, status: { tag: 'pickup_confirmed' }, updatedAt: ctx.timestamp });
  addEvent(ctx, incident.id, 'pickup_confirmed', `${displayNameOf(ctx, ctx.sender)} confirmed the pickup`);
  const job = ctx.db.agentJob.incidentId.find(incident.id);
  if (job && !isTerminalJob(job.status.tag) && !hasPendingWake(ctx, job.id, 'pickup_confirmed')) {
    wakeAgent(ctx, job.id, 'pickup_confirmed', job.planVersion);
  }
});

const HOME_OK_STATES = new Set(['awaiting_home_confirmation', 'transport_arranged']);

export const confirmHome = spacetimedb.reducer({ incidentId: t.u64() }, (ctx, { incidentId }) => {
  const incident = ctx.db.incident.id.find(incidentId);
  if (!incident || !incident.subject.isEqual(ctx.sender)) {
    deny(ctx, 'confirm_home', `incident:${incidentId}`, 'Only the person the incident is about can confirm they are home');
  }
  if (!isOpenStatus(incident.status.tag)) throw new SenderError('This incident is closed');
  let rideBooked = false;
  for (const r of ctx.db.ridePlan.incidentId.filter(incidentId)) {
    if (r.status.tag === 'booked_by_user' || r.status.tag === 'pickup_confirmed') rideBooked = true;
  }
  if (!HOME_OK_STATES.has(incident.status.tag) && !rideBooked) {
    throw new SenderError('Home confirmation applies once transport is arranged; use "I\'m okay" or resolve otherwise');
  }
  ctx.db.incident.id.update({ ...incident, status: { tag: 'resolved' }, resolvedAt: ctx.timestamp, resolvedBy: ctx.sender });
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incidentId, 'resolved', `${me} confirmed they are home`);
  closeJobForIncident(ctx, incidentId, 'resolved', 'home_confirmed');
  closeMeetupsForIncident(ctx, incidentId);
  completeRidePlans(ctx, incidentId);
  for (const p of participantsOf(ctx, incidentId)) {
    if (!p.userId.isEqual(ctx.sender)) sendAlert(ctx, p.userId, incidentId, 'incident_update', `${me} confirmed they are home.`);
  }
  audit(ctx, 'confirm_home', `incident:${incidentId}`);
});

// Demo: fire the job's earliest open follow-up timer now (refuses in production unless owner).
export const demoFireFollowup = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  requireDemoAllowed(ctx, 'demo_fire_followup');
  getJob(ctx, jobId);
  let earliest: { scheduledId: bigint; jobId: bigint; expectedFrom: Identity; tier: number } | undefined;
  for (const row of ctx.db.followupTimer.jobId.filter(jobId)) {
    if (!earliest || row.scheduledId < earliest.scheduledId) earliest = row;
  }
  if (!earliest) throw new SenderError('No open follow-up timer for this job');
  ctx.db.followupTimer.scheduledId.delete(earliest.scheduledId);
  const result = runFollowup(ctx, earliest);
  audit(ctx, 'demo_fire_followup', `agent_job:${jobId}:${result}`);
});

// Demo: wake the agent with a chosen event now (refuses in production unless owner).
export const demoWakeAgent = spacetimedb.reducer({ jobId: t.u64(), event: t.string() }, (ctx, { jobId, event }) => {
  requireDemoAllowed(ctx, 'demo_wake_agent');
  const { job } = getJob(ctx, jobId);
  if (!DEMO_EVENTS.has(event)) throw new SenderError(`event must be one of ${[...DEMO_EVENTS].join(', ')}`);
  if (isTerminalJob(job.status.tag)) throw new SenderError('This job is closed');
  wakeAgent(ctx, job.id, event, job.planVersion);
  audit(ctx, 'demo_wake_agent', `agent_job:${jobId}:${event}`);
});
