import { ScheduleAt } from 'spacetimedb';
import type { Ctx } from '../auth';

export type JobCloseStatus = 'resolved' | 'cancelled' | 'handed_off';
const TERMINAL = new Set(['resolved', 'handed_off', 'cancelled']);

export function isTerminalJob(status: string): boolean {
  return TERMINAL.has(status);
}

export function findJobByIncident(ctx: Ctx, incidentId: bigint) {
  return ctx.db.agentJob.incidentId.find(incidentId);
}

/** Insert an immediate wake for a job. `planVersion` 0 means "valid for any plan version". */
export function wakeAgent(ctx: Ctx, jobId: bigint, event: string, planVersion = 0) {
  ctx.db.agentWake.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
    jobId,
    event,
    planVersion,
  });
}

export function hasPendingWake(ctx: Ctx, jobId: bigint, event?: string): boolean {
  for (const w of ctx.db.agentWake.jobId.filter(jobId)) {
    if (event === undefined || w.event === event) return true;
  }
  return false;
}

/** Create the coordination job for a freshly opened incident and wake the agent now. */
export function enqueueAgentJob(ctx: Ctx, incidentId: bigint) {
  if (ctx.db.agentJob.incidentId.find(incidentId)) return;
  const job = ctx.db.agentJob.insert({
    id: 0n,
    incidentId,
    status: { tag: 'queued' },
    planVersion: 0,
    escalationTier: 0,
    lastEvent: 'incident_opened',
    wakeCount: 0,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  wakeAgent(ctx, job.id, 'incident_opened');
}

export function clearFollowupTimers(ctx: Ctx, jobId: bigint, tier?: number) {
  for (const row of ctx.db.followupTimer.jobId.filter(jobId)) {
    if (tier === undefined || row.tier === tier) ctx.db.followupTimer.scheduledId.delete(row.scheduledId);
  }
}

export function clearPendingWakes(ctx: Ctx, jobId: bigint) {
  for (const row of ctx.db.agentWake.jobId.filter(jobId)) ctx.db.agentWake.scheduledId.delete(row.scheduledId);
}

/** Close the job attached to an incident (idempotent). Called by human resolution/cancellation paths. */
export function closeJobForIncident(ctx: Ctx, incidentId: bigint, status: JobCloseStatus, event: string) {
  const job = findJobByIncident(ctx, incidentId);
  if (!job || isTerminalJob(job.status.tag)) return;
  ctx.db.agentJob.id.update({ ...job, status: { tag: status }, lastEvent: event, updatedAt: ctx.timestamp });
  clearFollowupTimers(ctx, job.id);
  clearPendingWakes(ctx, job.id);
}

/** Mark open ride plans of an incident completed once the person is home. */
export function completeRidePlans(ctx: Ctx, incidentId: bigint) {
  for (const r of ctx.db.ridePlan.incidentId.filter(incidentId)) {
    if (r.status.tag !== 'completed' && r.status.tag !== 'cancelled') {
      ctx.db.ridePlan.id.update({ ...r, status: { tag: 'completed' }, updatedAt: ctx.timestamp });
    }
  }
}
