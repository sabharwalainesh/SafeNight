import { t, table } from 'spacetimedb/server';

// ── Enums (no payload, so they can be indexed) ──────────────────────────────
export const AgentJobStatus = t.enum('AgentJobStatus', [
  'queued',
  'planning',
  'waiting_for_ack',
  'escalated',
  'transport_pending',
  'awaiting_home_confirmation',
  'resolved',
  'handed_off',
  'cancelled',
]);
export const ActionStatus = t.enum('ActionStatus', ['proposed', 'rejected', 'executed', 'failed', 'delivered', 'acknowledged']);
export const Channel = t.enum('Channel', ['in_app', 'sms', 'voice']);
export const DeliveryStatus = t.enum('DeliveryStatus', ['queued', 'sent', 'delivered', 'failed', 'acknowledged']);
export const RideStatus = t.enum('RideStatus', [
  'proposed',
  'accepted',
  'booked_by_user',
  'pickup_confirmed',
  'completed',
  'cancelled',
]);

// ── Tables (all private; exposed to participants through views) ─────────────

// One durable coordination job per incident.
export const agentJob = table(
  { name: 'agent_job' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().unique(),
    status: AgentJobStatus.index('btree'),
    planVersion: t.u32(),
    escalationTier: t.u8(),
    lastEvent: t.string(),
    wakeCount: t.u32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Versioned plans: what the model (or the simulated planner) proposed.
export const agentPlan = table(
  { name: 'agent_plan' },
  {
    id: t.u64().primaryKey().autoInc(),
    jobId: t.u64().index('btree'),
    version: t.u32(),
    summary: t.string(),
    stepsJson: t.string(),
    model: t.string(),
    simulated: t.bool(),
    createdAt: t.timestamp(),
    // Number of model round-trips that produced this plan version (tool loop). Added in C3-A.2 with a default.
    rounds: t.u8().default(1),
  }
);

// Action receipts: every proposed tool call and what happened to it.
export const agentAction = table(
  { name: 'agent_action' },
  {
    id: t.u64().primaryKey().autoInc(),
    jobId: t.u64().index('btree'),
    planVersion: t.u32(),
    tool: t.string(),
    argsJson: t.string(),
    status: ActionStatus,
    resultJson: t.string(),
    rejectReason: t.string(),
    simulated: t.bool(),
    idempotencyKey: t.string().unique(),
    at: t.timestamp(),
    // Short human summary of the result (≤ 120 chars); empty for rejected calls. Added in C4 with a default.
    resultText: t.string().default(''),
    // 'model' (Nemotron or the simulated planner proposed it) or 'policy' (deterministic safety net). Added in C3-A.2.
    source: t.string().default('model'),
  }
);

// Schedule table → scheduled procedure `agent_step`. `planVersion` 0 means "any version".
export const agentWake = table(
  { name: 'agent_wake' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    jobId: t.u64().index('btree'),
    event: t.string(),
    planVersion: t.u32(),
  }
);

// Schedule table → reducer `on_followup_due`: did the expected person respond?
export const followupTimer = table(
  { name: 'followup_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    jobId: t.u64().index('btree'),
    expectedFrom: t.identity(),
    tier: t.u8(),
  }
);

// Outward messages. `simulated` is true unless a real SMS left the host.
export const notification = table(
  { name: 'notification' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    jobId: t.u64().index('btree'),
    recipient: t.identity().index('btree'),
    channel: Channel,
    template: t.string(),
    body: t.string(),
    status: DeliveryStatus,
    providerId: t.string(),
    simulated: t.bool(),
    createdAt: t.timestamp(),
    acknowledgedAt: t.timestamp().optional(),
  }
);

// Schedule table → scheduled procedure `deliver_notification`.
export const notificationDispatch = table(
  { name: 'notification_dispatch' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    notificationId: t.u64(),
  }
);

// Transport coordination. Humans book; the agent only proposes.
export const ridePlan = table(
  { name: 'ride_plan' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    jobId: t.u64().index('btree'),
    riderId: t.identity(),
    optionsJson: t.string(),
    chosenOption: t.string(),
    status: RideStatus,
    confirmedBy: t.identity().optional(),
    updatedAt: t.timestamp(),
  }
);
