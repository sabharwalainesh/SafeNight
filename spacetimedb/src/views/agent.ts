import { t, type Infer, type InferSchema, type ViewCtx } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { agentAction, agentPlan, AgentJobStatus, notification, ridePlan } from '../tables/agent';

type VCtx = ViewCtx<InferSchema<typeof spacetimedb>>;

/** Incident ids where the caller is a participant. */
function myIncidentIds(ctx: VCtx): bigint[] {
  const ids: bigint[] = [];
  const seen = new Set<bigint>();
  for (const p of ctx.db.incidentParticipant.userId.filter(ctx.sender)) {
    if (!seen.has(p.incidentId)) {
      seen.add(p.incidentId);
      ids.push(p.incidentId);
    }
  }
  return ids;
}

const agentJobRow = t.row('AgentJobRow', {
  id: t.u64().primaryKey(),
  incidentId: t.u64(),
  subjectName: t.string(),
  status: AgentJobStatus,
  planVersion: t.u32(),
  escalationTier: t.u8(),
  lastEvent: t.string(),
  wakeCount: t.u32(),
  createdAt: t.timestamp(),
  updatedAt: t.timestamp(),
  followupDueAt: t.timestamp().optional(),
  followupExpectedFrom: t.identity().optional(),
});
type AgentJobValue = Infer<typeof agentJobRow>;

// Coordination jobs for incidents the caller participates in.
export const myAgentJobs = spacetimedb.view(
  { name: 'my_agent_jobs', public: true },
  t.array(agentJobRow),
  ctx => {
    const rows: AgentJobValue[] = [];
    for (const incidentId of myIncidentIds(ctx)) {
      const job = ctx.db.agentJob.incidentId.find(incidentId);
      if (!job) continue;
      const incident = ctx.db.incident.id.find(incidentId);
      let followupDueAt: AgentJobValue['followupDueAt'];
      let followupExpectedFrom: AgentJobValue['followupExpectedFrom'];
      for (const timer of ctx.db.followupTimer.jobId.filter(job.id)) {
        if (timer.scheduledAt.tag !== 'Time') continue;
        const due = timer.scheduledAt.value;
        if (!followupDueAt || due.microsSinceUnixEpoch < followupDueAt.microsSinceUnixEpoch) {
          followupDueAt = due;
          followupExpectedFrom = timer.expectedFrom;
        }
      }
      rows.push({
        id: job.id,
        incidentId: job.incidentId,
        subjectName: incident ? (ctx.db.userProfile.identity.find(incident.subject)?.displayName ?? 'Unknown') : 'Unknown',
        status: job.status,
        planVersion: job.planVersion,
        escalationTier: job.escalationTier,
        lastEvent: job.lastEvent,
        wakeCount: job.wakeCount,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        followupDueAt,
        followupExpectedFrom,
      });
    }
    return rows;
  }
);

// Versioned plans (summary, steps, model, simulated flag) for the caller's incidents.
export const myAgentPlans = spacetimedb.view(
  { name: 'my_agent_plans', public: true },
  t.array(agentPlan.rowType),
  ctx => {
    const rows = [];
    for (const incidentId of myIncidentIds(ctx)) {
      const job = ctx.db.agentJob.incidentId.find(incidentId);
      if (!job) continue;
      for (const plan of ctx.db.agentPlan.jobId.filter(job.id)) rows.push(plan);
    }
    return rows;
  }
);

// Action receipts for the caller's incidents.
export const myAgentActions = spacetimedb.view(
  { name: 'my_agent_actions', public: true },
  t.array(agentAction.rowType),
  ctx => {
    const rows = [];
    for (const incidentId of myIncidentIds(ctx)) {
      const job = ctx.db.agentJob.incidentId.find(incidentId);
      if (!job) continue;
      for (const a of ctx.db.agentAction.jobId.filter(job.id)) rows.push(a);
    }
    return rows;
  }
);

// Messages addressed to the caller.
export const myNotifications = spacetimedb.view(
  { name: 'my_notifications', public: true },
  t.array(notification.rowType),
  ctx => Array.from(ctx.db.notification.recipient.filter(ctx.sender))
);

// Ride plans for the caller's incidents.
export const myRidePlans = spacetimedb.view(
  { name: 'my_ride_plans', public: true },
  t.array(ridePlan.rowType),
  ctx => {
    const rows = [];
    for (const incidentId of myIncidentIds(ctx)) {
      for (const r of ctx.db.ridePlan.incidentId.filter(incidentId)) rows.push(r);
    }
    return rows;
  }
);
