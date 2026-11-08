import { t } from 'spacetimedb/server';
import { Identity, ScheduleAt } from 'spacetimedb';
import { spacetimedb } from '../schema';
import { agentWake, notificationDispatch } from '../tables/agent';
import type { Ctx } from '../lib/auth';
import { envOf } from '../lib/env';
import { addEvent, isOpenStatus, sendAlert } from '../lib/safety';
import { minutesAfter } from '../lib/time';
import { buildContext, type AgentContext } from '../lib/agent/context';
import { executeSegment, receipt, type SegmentInput, type SegmentOutcome } from '../lib/agent/executor';
import { isTerminalJob } from '../lib/agent/jobs';
import { callNemotron, initialMessages, toolResultMessage, type ChatMessage } from '../lib/agent/nemotron';
import { SIMULATED_MODEL, simulatedPlan, type PlanProposal } from '../lib/agent/simulated';
import { DEFAULT_FOLLOWUP_MINUTES, MAX_ROUNDS, MAX_TOOL_CALLS_PER_PLAN, type ToolCall } from '../lib/agent/tools';
import { fetchTransportOptions, providerLinksOnly, type TransportResult } from '../lib/agent/transport';
import { sendSms, twilioConfig } from '../lib/agent/twilio';

const READ_TOOLS = new Set(['get_group_context', 'get_recent_checkins', 'get_last_shared_location', 'get_transport_options']);
const WRITE_TOOLS = new Set(['send_approved_message', 'request_human_confirmation', 'schedule_followup', 'update_incident_state', 'propose_ride_plan', 'hand_off']);

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
    source: 'policy',
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
type RoundCall = ToolCall & { round: number };

/** Insert plan version `planVersion + 1` for this job with the first round's calls. */
function storePlan(tx: Ctx, jobId: bigint, proposal: Proposal, calls: RoundCall[]): number {
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
    rounds: 1,
  });
  addEvent(tx, job.incidentId, 'agent_plan', `Plan v${version} (${proposal.model}): ${proposal.summary}`, proposal.simulated);
  return version;
}

/** Append a later round's calls to the same plan version (stepsJson is the flat list; each call carries `round`). */
function appendRound(tx: Ctx, jobId: bigint, version: number, allCalls: RoundCall[], round: number, summary: string) {
  for (const plan of tx.db.agentPlan.jobId.filter(jobId)) {
    if (plan.version !== version) continue;
    const text = summary.startsWith('Nemotron proposed') ? plan.summary : `${plan.summary} ${summary}`.slice(0, 500);
    tx.db.agentPlan.id.update({ ...plan, stepsJson: JSON.stringify(allCalls), rounds: round, summary: text });
    addEvent(tx, (tx.db.agentJob.id.find(jobId)?.incidentId) ?? 0n, 'agent_plan_round', `Plan v${version} round ${round}: ${summary}`, plan.simulated);
  }
}

type Acc = { proposedRide: boolean; scheduledFollowup: boolean; handedOff: boolean; stopped: boolean };

type Exec = {
  out: SegmentOutcome;
  transport?: TransportResult;
};

/**
 * Execute calls [startIndex..) of `calls` for a plan version: transactional segments with the HTTP
 * transport lookup (if any) between them. Returns the final outcome and the transport result seen.
 */
function executeCalls(
  ctx: Parameters<typeof fetchTransportOptions>[0],
  base: Omit<SegmentInput, 'calls' | 'startIndex'>,
  calls: ToolCall[],
  startIndex: number,
  transport: TransportResult | undefined
): Exec {
  let input: SegmentInput = { ...base, calls, startIndex, transport };
  let out = ctx.withTx(tx => executeSegment(tx, input));
  let seen = transport;
  while (out.transportRequest && !out.stopped) {
    const fetched = fetchTransportOptions(ctx, out.transportRequest);
    seen = fetched;
    input = {
      ...base,
      calls,
      startIndex: out.nextIndex,
      transport: fetched,
      transportReceiptId: out.transportReceiptId,
      confirmationTarget: out.confirmationTarget,
    };
    const next = ctx.withTx(tx => executeSegment(tx, input));
    out = { ...next, proposedRide: out.proposedRide || next.proposedRide, scheduledFollowup: out.scheduledFollowup || next.scheduledFollowup, handedOff: out.handedOff || next.handedOff };
  }
  return { out, transport: seen };
}

/** Receipts of this version for indices [from, to) as tool-result payloads, in call order. */
function readRoundResults(tx: Ctx, jobId: bigint, version: number, calls: ToolCall[], from: number, to: number): unknown[] {
  const results: unknown[] = [];
  for (let i = from; i < to; i++) {
    const call = calls[i]!;
    const row = tx.db.agentAction.idempotencyKey.find(`${jobId}:${version}:${i}:${call.name}`);
    if (!row) {
      results.push({ error: 'not_executed' });
    } else if (row.status.tag === 'rejected') {
      results.push({ error: row.rejectReason });
    } else {
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(row.resultJson);
      } catch {
        parsed = { raw: row.resultJson };
      }
      results.push({ status: row.status.tag, result: parsed });
    }
  }
  return results;
}

/**
 * Deterministic completion rules applied after the planner. Every rule runs through the same
 * executor and leaves a receipt with `source = 'policy'`, so the UI can tell policy from model.
 */
function policyCalls(tx: Ctx, jobId: bigint, version: number, event: string, acc: Acc): { calls: ToolCall[]; transportFallback: TransportResult | undefined } {
  const none = { calls: [] as ToolCall[], transportFallback: undefined };
  const job = tx.db.agentJob.id.find(jobId);
  if (!job || isTerminalJob(job.status.tag) || acc.handedOff) return none;
  const incident = tx.db.incident.id.find(job.incidentId);
  if (!incident || !isOpenStatus(incident.status.tag)) return none;

  const calls: ToolCall[] = [];
  // (b) every person messaged this step must also be asked to confirm.
  const messaged = new Set<string>();
  const confirmed = new Set<string>();
  for (const a of tx.db.agentAction.jobId.filter(jobId)) {
    if (a.planVersion !== version || a.status.tag !== 'executed') continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(a.argsJson) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    if (a.tool === 'send_approved_message' && typeof args.recipient === 'string') messaged.add(args.recipient);
    if (a.tool === 'request_human_confirmation' && typeof args.userId === 'string') confirmed.add(args.userId);
  }
  const subjectName = tx.db.userProfile.identity.find(incident.subject)?.displayName ?? 'your friend';
  for (const who of messaged) {
    if (!confirmed.has(who)) calls.push({ name: 'request_human_confirmation', args: { userId: who, question: `Can you help ${subjectName} tonight?` } });
  }
  // (a) an acknowledged helper means transport is the next step; never leave the person without options.
  let transportFallback: TransportResult | undefined;
  if (event === 'buddy_acknowledged' && !acc.proposedRide) {
    let openPlan = false;
    for (const r of tx.db.ridePlan.jobId.filter(jobId)) {
      if (r.status.tag === 'proposed' || r.status.tag === 'accepted') openPlan = true;
    }
    if (!openPlan) {
      let pickup: { lat: number; lng: number } | null = null;
      for (const loc of tx.db.latestLocation.bySessionUser.filter([incident.sessionId, incident.subject])) pickup = { lat: loc.lat, lng: loc.lng };
      transportFallback = providerLinksOnly(tx.timestamp.toDate().toISOString(), pickup);
      calls.push({ name: 'propose_ride_plan', args: { riderId: incident.subject.toHexString(), options: 'from_transport_lookup' } });
      calls.push({ name: 'update_incident_state', args: { state: 'transport_pending' } });
    }
  }
  return { calls, transportFallback };
}

function finalize(tx: Ctx, jobId: bigint, version: number, event: string, priorStatus: string, acc: Acc, simulated: boolean, confirmationTarget: string | undefined) {
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
        const timer = tx.db.followupTimer.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(minutesAfter(tx.timestamp, DEFAULT_FOLLOWUP_MINUTES).microsSinceUnixEpoch),
          jobId: job.id,
          expectedFrom,
          tier: job.escalationTier,
        });
        // (c) the default follow-up is a policy action, recorded as such.
        receipt(tx, job.id, version, 'pf0', 'schedule_followup', { delayMinutes: DEFAULT_FOLLOWUP_MINUTES }, 'executed',
          { timerId: String(timer.scheduledId), minutes: DEFAULT_FOLLOWUP_MINUTES }, '', simulated, `default follow-up in ${DEFAULT_FOLLOWUP_MINUTES} min`, 'policy');
      }
    }
  }
  tx.db.agentJob.id.update({ ...job, status: { tag: status as never }, lastEvent: event, updatedAt: tx.timestamp });
}

const mergeAcc = (acc: Acc, o: SegmentOutcome) => {
  acc.proposedRide ||= o.proposedRide;
  acc.scheduledFollowup ||= o.scheduledFollowup;
  acc.handedOff ||= o.handedOff;
  acc.stopped ||= o.stopped;
};

/**
 * Scheduled procedure: one coordination step. Reads minimal context in a transaction, then runs an
 * agentic loop outside transactions: ask Nemotron (or the simulated planner) for tool calls, validate
 * and execute them transactionally, feed read-tool results back, and repeat for up to MAX_ROUNDS.
 * Deterministic policy rules then fill gaps (labeled `source: policy`), and the job status is set.
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
    const acc: Acc = { proposedRide: false, scheduledFollowup: false, handedOff: false, stopped: false };
    let version = 0;
    let simulated = true;
    let allCalls: RoundCall[] = [];
    let transport: TransportResult | undefined;
    let confirmationTarget: string | undefined;

    const runRound = (proposalCalls: ToolCall[], round: number): SegmentOutcome => {
      const tagged: RoundCall[] = proposalCalls.slice(0, MAX_TOOL_CALLS_PER_PLAN).map(c => ({ ...c, round }));
      const startIndex = allCalls.length;
      allCalls = allCalls.concat(tagged);
      const calls = allCalls;
      const exec = executeCalls(ctx, { jobId: prep.jobId, planVersion: version, event: prep.event, simulated, confirmationTarget }, calls, startIndex, transport);
      transport = exec.transport ?? transport;
      confirmationTarget = exec.out.confirmationTarget ?? confirmationTarget;
      mergeAcc(acc, exec.out);
      return exec.out;
    };

    let live = false;
    let messages: ChatMessage[] = [];
    if (env.NEMOTRON_API_KEY) {
      messages = initialMessages(prep.context);
      try {
        const turn = callNemotron(ctx, env.NEMOTRON_API_KEY, env.NEMOTRON_MODEL, env.NEMOTRON_BASE_URL, messages);
        live = true;
        simulated = false;
        const firstCalls: RoundCall[] = turn.calls.slice(0, MAX_TOOL_CALLS_PER_PLAN).map(c => ({ ...c, round: 1 }));
        const proposal: Proposal = { summary: turn.summary, calls: turn.calls, model: turn.model, simulated: false };
        version = ctx.withTx(tx => storePlan(tx, prep.jobId, proposal, firstCalls));
        let lastTurn = turn;
        let previousWriteSignature = '';
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          const calls = lastTurn.calls;
          if (calls.length === 0) break;
          const writeCalls = calls.filter(c => WRITE_TOOLS.has(c.name));
          const signature = JSON.stringify(writeCalls);
          if (round > 1 && writeCalls.length > 0 && signature === previousWriteSignature) {
            // The model repeated its outward actions verbatim; executing them again would duplicate messages.
            ctx.withTx(tx => addEvent(tx, (tx.db.agentJob.id.find(prep.jobId)?.incidentId) ?? 0n, 'no_progress', `Plan v${version} round ${round} repeated the previous round; stopped`, false));
            break;
          }
          previousWriteSignature = signature;
          const startIndex = allCalls.length;
          runRound(calls, round);
          if (round > 1) {
            const snapshot = allCalls;
            const summary = lastTurn.summary;
            ctx.withTx(tx => appendRound(tx, prep.jobId, version, snapshot, round, summary));
          }
          if (acc.stopped || acc.handedOff || acc.proposedRide) break;
          if (!calls.some(c => READ_TOOLS.has(c.name))) break;
          if (round === MAX_ROUNDS) {
            ctx.withTx(tx => addEvent(tx, (tx.db.agentJob.id.find(prep.jobId)?.incidentId) ?? 0n, 'rounds_exhausted', `Plan v${version}: ${MAX_ROUNDS} model rounds used without a final step; policy rules finish the step`, false));
            break;
          }
          const toolResults = ctx.withTx(tx => readRoundResults(tx, prep.jobId, version, allCalls, startIndex, allCalls.length));
          messages = messages.concat([lastTurn.assistantMessage, ...toolResults.map((r, i) => toolResultMessage(lastTurn.callIds[i] ?? `call_${i}`, r))]);
          try {
            lastTurn = callNemotron(ctx, env.NEMOTRON_API_KEY, env.NEMOTRON_MODEL, env.NEMOTRON_BASE_URL, messages);
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.warn(`agent_step job=${prep.jobId}: Nemotron round ${round + 1} failed (${reason}); policy rules finish the step`);
            ctx.withTx(tx => addEvent(tx, (tx.db.agentJob.id.find(prep.jobId)?.incidentId) ?? 0n, 'model_round_failed', `Round ${round + 1}: ${reason}`.slice(0, 200), false));
            break;
          }
        }
      } catch (e) {
        if (live) throw e;
        const reason = e instanceof Error ? e.message : String(e);
        console.warn(`agent_step job=${prep.jobId}: Nemotron failed (${reason}); using the simulated planner`);
        const sim = simulatedPlan(prep.context);
        const proposal: Proposal = { ...sim, model: `fallback:${reason}`.slice(0, 120), simulated: true };
        simulated = true;
        version = ctx.withTx(tx => storePlan(tx, prep.jobId, proposal, sim.calls.map(c => ({ ...c, round: 1 }))));
        runRound(sim.calls, 1);
      }
    } else {
      const sim = simulatedPlan(prep.context);
      const proposal: Proposal = { ...sim, model: SIMULATED_MODEL, simulated: true };
      version = ctx.withTx(tx => storePlan(tx, prep.jobId, proposal, sim.calls.map(c => ({ ...c, round: 1 }))));
      runRound(sim.calls, 1);
    }

    // Policy safety net: fill the gaps the planner left, with receipts labeled `source: policy`.
    if (!acc.stopped && !acc.handedOff) {
      const planned = ctx.withTx(tx => policyCalls(tx, prep.jobId, version, prep.event, acc));
      if (planned.calls.length > 0) {
        const input: SegmentInput = {
          jobId: prep.jobId,
          planVersion: version,
          event: prep.event,
          calls: planned.calls,
          startIndex: 0,
          simulated,
          transport: transport ?? planned.transportFallback,
          confirmationTarget,
          source: 'policy',
          indexPrefix: 'p',
        };
        const out = ctx.withTx(tx => executeSegment(tx, input));
        mergeAcc(acc, out);
        confirmationTarget = out.confirmationTarget ?? confirmationTarget;
      }
    }
    const finalTarget = confirmationTarget;
    const finalSim = simulated;
    const finalVersion = version;
    ctx.withTx(tx => finalize(tx, prep.jobId, finalVersion, prep.event, prep.priorStatus, acc, finalSim, finalTarget));
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
      return { id: row.id, channel: row.channel.tag, body: row.body, phone: tx.db.userPhone.identity.find(row.recipient)?.phoneE164 ?? '' };
    });
    if (!pending) return {};
    const cfg = twilioConfig(envOf(ctx));
    let outcome: { status: 'sent' | 'failed'; providerId: string; simulated: boolean; error?: string };
    if (pending.channel === 'sms' && cfg && pending.phone.length > 0) {
      const r = sendSms(ctx, cfg, pending.phone, pending.body);
      // Only a status code reaches the timeline; raw provider errors could echo the request URL.
      const code = r.error && /^twilio_http_\d{3}$/.test(r.error) ? r.error : 'twilio_request_failed';
      outcome = r.ok ? { status: 'sent', providerId: r.providerId, simulated: false } : { status: 'failed', providerId: '', simulated: false, error: code };
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
