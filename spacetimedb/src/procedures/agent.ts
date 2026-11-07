import { t } from 'spacetimedb/server';
import { Identity, ScheduleAt } from 'spacetimedb';
import { spacetimedb } from '../schema';
import { agentWake, notificationDispatch } from '../tables/agent';
import type { Ctx } from '../lib/auth';
import { envOf } from '../lib/env';
import { addEvent, isOpenStatus, sendAlert } from '../lib/safety';
import { minutesAfter } from '../lib/time';
import { buildContext, type AgentContext } from '../lib/agent/context';
import { executeSegment, type SegmentInput, type SegmentOutcome } from '../lib/agent/executor';
import { isTerminalJob } from '../lib/agent/jobs';
import { callNemotron } from '../lib/agent/nemotron';
import { SIMULATED_MODEL, simulatedPlan, type PlanProposal } from '../lib/agent/simulated';
import { DEFAULT_FOLLOWUP_MINUTES, MAX_TOOL_CALLS_PER_PLAN } from '../lib/agent/tools';
import { fetchTransportOptions } from '../lib/agent/transport';
import { sendSms, twilioConfig } from '../lib/agent/twilio';

type Prep =
  | { kind: 'skip' }
  | { kind: 'run'; jobId: bigint; priorStatus: string; event: string; context: AgentContext };

function wakeReceipt(tx: Ctx, wake: { jobId: bigint; scheduledId: bigint; event: string }, reason: string) {
  const key = `${wake.jobId}:wake:${wake.scheduledId}:agent_step`;
  if (tx.db.agentAction.idempotencyKey.find(key)) return;
  tx.db.agentAction.insert({
    id: 0n,
    jobId: wake.jobId,
    planVersion: 0,
    tool: 'agent_step',
    argsJson: JSON.stringify({ event: wake.event }),
    status: { tag: 'rejected' },
    resultJson: '{}',
    rejectReason: reason,
    simulated: true,
    idempotencyKey: key,
    at: tx.timestamp,
    resultText: '',
  });
}

function prepare(tx: Ctx, wake: { jobId: bigint; scheduledId: bigint; event: string; planVersion: number }): Prep {
  const job = tx.db.agentJob.id.find(wake.jobId);
  if (!job) return { kind: 'skip' };
  if (isTerminalJob(job.status.tag)) {
    wakeReceipt(tx, wake, 'job_closed');
    return { kind: 'skip' };
  }
  if (wake.planVersion !== 0 && wake.planVersion < job.planVersion) {
    wakeReceipt(tx, wake, 'stale_plan');
    return { kind: 'skip' };
  }
  // A second `incident_opened` wake for a job that already planned is a duplicate event, not a new one.
  if (wake.planVersion === 0 && wake.event === 'incident_opened' && job.planVersion > 0) {
    wakeReceipt(tx, wake, 'duplicate_wake');
    return { kind: 'skip' };
  }
  const incident = tx.db.incident.id.find(job.incidentId);
  if (!incident || !isOpenStatus(incident.status.tag)) {
    wakeReceipt(tx, wake, 'incident_closed');
    const closed = incident?.status.tag === 'resolved' ? 'resolved' : 'cancelled';
    tx.db.agentJob.id.update({ ...job, status: { tag: closed }, lastEvent: 'incident_closed', updatedAt: tx.timestamp });
    return { kind: 'skip' };
  }
  const priorStatus = job.status.tag;
  const updated = { ...job, status: { tag: 'planning' as const }, wakeCount: job.wakeCount + 1, lastEvent: wake.event, updatedAt: tx.timestamp };
  tx.db.agentJob.id.update(updated);
  return { kind: 'run', jobId: job.id, priorStatus, event: wake.event, context: buildContext(tx, updated, incident, wake.event) };
}

type Proposal = PlanProposal & { model: string; simulated: boolean };

function storePlan(tx: Ctx, jobId: bigint, proposal: Proposal, calls: SegmentInput['calls']): number {
  const job = tx.db.agentJob.id.find(jobId);
  if (!job) throw new Error('job vanished');
  const version = job.planVersion + 1;
  tx.db.agentJob.id.update({ ...job, planVersion: version, updatedAt: tx.timestamp });
  tx.db.agentPlan.insert({
    id: 0n,
    jobId,
    version,
    summary: proposal.summary,
    stepsJson: JSON.stringify(calls),
    model: proposal.model,
    simulated: proposal.simulated,
    createdAt: tx.timestamp,
  });
  addEvent(tx, job.incidentId, 'agent_plan', `Plan v${version} (${proposal.model}): ${proposal.summary}`, proposal.simulated);
  return version;
}

type Acc = { proposedRide: boolean; scheduledFollowup: boolean; handedOff: boolean };

function finalize(tx: Ctx, jobId: bigint, event: string, priorStatus: string, acc: Acc, confirmationTarget: string | undefined) {
  const job = tx.db.agentJob.id.find(jobId);
  if (!job || isTerminalJob(job.status.tag)) return;
  let status: string;
  if (acc.handedOff) return;
  else if (acc.proposedRide) status = 'transport_pending';
  else if (['queued', 'waiting_for_ack', 'escalated', 'planning'].includes(priorStatus)) status = 'waiting_for_ack';
  else status = priorStatus;
  if (status === 'waiting_for_ack' && !acc.scheduledFollowup) {
    let open = 0;
    for (const _t of tx.db.followupTimer.jobId.filter(job.id)) open++;
    if (open === 0) {
      const incident = tx.db.incident.id.find(job.incidentId);
      const session = incident && tx.db.nightSession.id.find(incident.sessionId);
      const expectedFrom = confirmationTarget
        ? Identity.fromString(confirmationTarget)
        : (session?.organizer ?? incident?.subject);
      if (expectedFrom) {
        tx.db.followupTimer.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(minutesAfter(tx.timestamp, DEFAULT_FOLLOWUP_MINUTES).microsSinceUnixEpoch),
          jobId: job.id,
          expectedFrom,
          tier: job.escalationTier,
        });
      }
    }
  }
  tx.db.agentJob.id.update({ ...job, status: { tag: status as never }, lastEvent: event, updatedAt: tx.timestamp });
}

/**
 * Scheduled procedure: one coordination step. Reads minimal context in a transaction, asks
 * Nemotron (or the simulated planner) for tool calls outside any transaction, then validates
 * and executes them in transactions. HTTP-backed tools split the execution into segments.
 */
export const agentStep = spacetimedb.procedure(
  { onSchedule: agentWake },
  { arg: agentWake.rowType },
  t.unit(),
  (ctx, { arg }) => {
    const wake = { jobId: arg.jobId, scheduledId: arg.scheduledId, event: arg.event, planVersion: arg.planVersion };
    const prep = ctx.withTx(tx => prepare(tx, wake));
    if (prep.kind === 'skip') return {};

    const env = envOf(ctx);
    let proposal: Proposal;
    if (env.NEMOTRON_API_KEY) {
      try {
        const live = callNemotron(ctx, env.NEMOTRON_API_KEY, env.NEMOTRON_MODEL, env.NEMOTRON_BASE_URL, prep.context);
        proposal = { ...live, simulated: false };
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.warn(`agent_step job=${prep.jobId}: Nemotron failed (${reason}); using the simulated planner`);
        proposal = { ...simulatedPlan(prep.context), model: `fallback:${reason}`.slice(0, 120), simulated: true };
      }
    } else {
      proposal = { ...simulatedPlan(prep.context), model: SIMULATED_MODEL, simulated: true };
    }
    const calls = proposal.calls.slice(0, MAX_TOOL_CALLS_PER_PLAN);

    const acc: Acc = { proposedRide: false, scheduledFollowup: false, handedOff: false };
    const first = ctx.withTx(tx => {
      const version = storePlan(tx, prep.jobId, proposal, calls);
      const out = executeSegment(tx, { jobId: prep.jobId, planVersion: version, calls, startIndex: 0, simulated: proposal.simulated });
      return { version, out };
    });
    let out: SegmentOutcome = first.out;
    const merge = (o: SegmentOutcome) => {
      acc.proposedRide ||= o.proposedRide;
      acc.scheduledFollowup ||= o.scheduledFollowup;
      acc.handedOff ||= o.handedOff;
    };
    merge(out);
    while (out.transportRequest && !out.stopped) {
      const transport = fetchTransportOptions(ctx, out.transportRequest);
      const input: SegmentInput = {
        jobId: prep.jobId,
        planVersion: first.version,
        calls,
        startIndex: out.nextIndex,
        simulated: proposal.simulated,
        transport,
        transportReceiptId: out.transportReceiptId,
        confirmationTarget: out.confirmationTarget,
      };
      out = ctx.withTx(tx => executeSegment(tx, input));
      merge(out);
    }
    const confirmationTarget = out.confirmationTarget;
    ctx.withTx(tx => finalize(tx, prep.jobId, prep.event, prep.priorStatus, acc, confirmationTarget));
    return {};
  }
);

/** Scheduled procedure: deliver one queued notification (real SMS when Twilio is configured). */
export const deliverNotification = spacetimedb.procedure(
  { onSchedule: notificationDispatch },
  { arg: notificationDispatch.rowType },
  t.unit(),
  (ctx, { arg }) => {
    const pending = ctx.withTx(tx => {
      const row = tx.db.notification.id.find(arg.notificationId);
      if (!row || row.status.tag !== 'queued') return undefined;
      return { id: row.id, channel: row.channel.tag, body: row.body, phone: tx.db.userProfile.identity.find(row.recipient)?.phoneE164 ?? '' };
    });
    if (!pending) return {};
    const cfg = twilioConfig(envOf(ctx));
    let outcome: { status: 'sent' | 'failed'; providerId: string; simulated: boolean; error?: string };
    if (pending.channel === 'sms' && cfg && pending.phone.length > 0) {
      const r = sendSms(ctx, cfg, pending.phone, pending.body);
      outcome = r.ok ? { status: 'sent', providerId: r.providerId, simulated: false } : { status: 'failed', providerId: '', simulated: false, error: r.error };
    } else {
      outcome = { status: 'sent', providerId: '', simulated: true };
    }
    ctx.withTx(tx => {
      const row = tx.db.notification.id.find(pending.id);
      if (!row || row.status.tag !== 'queued') return;
      const channel = outcome.simulated && row.channel.tag === 'sms' ? { tag: 'in_app' as const } : row.channel;
      tx.db.notification.id.update({ ...row, status: { tag: outcome.status }, providerId: outcome.providerId, simulated: outcome.simulated, channel });
      const name = tx.db.userProfile.identity.find(row.recipient)?.displayName ?? 'participant';
      addEvent(
        tx,
        row.incidentId,
        outcome.status === 'sent' ? 'message_sent' : 'message_failed',
        `${row.template} → ${name} via ${channel.tag}${outcome.error ? ` (${outcome.error})` : ''}`,
        outcome.simulated
      );
      if (outcome.status === 'sent') sendAlert(tx, row.recipient, row.incidentId, 'incident_update', row.body);
    });
    return {};
  }
);

