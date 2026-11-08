import type { Identity } from 'spacetimedb';
import type { Ctx } from '../auth';
import { addEvent, displayNameOf, findParticipant, isOpenStatus, sendAlert, handoffRecipients } from '../safety';
import { clearFollowupTimers, clearPendingWakes, closeJobForIncident, isTerminalJob, wakeAgent } from './jobs';

export const MAX_ESCALATION_TIER = 2;

/** Shared by the scheduled reducer and the demo trigger. */
export function runFollowup(ctx: Ctx, timer: { jobId: bigint; expectedFrom: Identity; tier: number }): string {
  const job = ctx.db.agentJob.id.find(timer.jobId);
  if (!job || isTerminalJob(job.status.tag)) return 'closed';
  const incident = ctx.db.incident.id.find(job.incidentId);
  if (!incident || !isOpenStatus(incident.status.tag)) {
    closeJobForIncident(ctx, job.incidentId, incident?.status.tag === 'resolved' ? 'resolved' : 'cancelled', 'incident_closed');
    return 'closed';
  }
  const expectedName = displayNameOf(ctx, timer.expectedFrom);
  const p = findParticipant(ctx, incident.id, timer.expectedFrom);
  if (p?.acknowledgedAt !== undefined) {
    addEvent(ctx, incident.id, 'followup_ok', `${expectedName} had acknowledged; no escalation`);
    return 'ok';
  }
  if (timer.tier !== job.escalationTier) {
    addEvent(ctx, incident.id, 'followup_stale', `Follow-up for tier ${timer.tier} ignored; job is at tier ${job.escalationTier}`);
    return 'stale';
  }
  if (job.status.tag === 'awaiting_home_confirmation' || job.status.tag === 'transport_pending') {
    addEvent(ctx, incident.id, 'followup_noted', `${expectedName} has not confirmed yet; transport stage keeps waiting`);
    return 'noted';
  }
  const tier = job.escalationTier + 1;
  if (tier > MAX_ESCALATION_TIER) {
    ctx.db.agentJob.id.update({ ...job, status: { tag: 'handed_off' }, lastEvent: 'handed_off', updatedAt: ctx.timestamp });
    clearFollowupTimers(ctx, job.id);
    clearPendingWakes(ctx, job.id);
    addEvent(ctx, incident.id, 'handed_off', `No acknowledgment after ${MAX_ESCALATION_TIER} escalations; organizer asked to take over`);
    for (const who of handoffRecipients(ctx, incident)) {
      sendAlert(ctx, who, incident.id, 'incident_update', `Nobody acknowledged the request to help ${displayNameOf(ctx, incident.subject)}. Please take over.`);
    }
    return 'handed_off';
  }
  ctx.db.agentJob.id.update({ ...job, status: { tag: 'escalated' }, escalationTier: tier, lastEvent: 'buddy_nonresponse', updatedAt: ctx.timestamp });
  addEvent(ctx, incident.id, 'escalated', `${expectedName} did not respond in time; escalating (tier ${tier})`);
  wakeAgent(ctx, job.id, 'buddy_nonresponse', job.planVersion);
  return 'escalated';
}

