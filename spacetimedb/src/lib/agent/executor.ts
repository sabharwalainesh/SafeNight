import { Identity, ScheduleAt } from 'spacetimedb';
import type { Ctx } from '../auth';
import { envOf } from '../env';
import { addEvent, isOpenStatus, sendAlert, handoffRecipients } from '../safety';
import { minutesAfter } from '../time';
import { isTerminalJob } from './jobs';
import { recipientAllowed } from './context';
import { isModelTemplate, renderTemplate } from './templates';
import { isToolName, MAX_OPEN_FOLLOWUPS, validateArgs, type ToolCall } from './tools';
import type { TransportInput, TransportResult } from './transport';
import { twilioConfig } from './twilio';
import { sanitizeOptions } from './links';

export type SegmentInput = {
  jobId: bigint;
  planVersion: number;
  /** The wake event this plan answers; hand_off is only valid for the contact-seeking events. */
  event: string;
  calls: ToolCall[];
  startIndex: number;
  simulated: boolean;
  /** Result of the HTTP lookup that ended the previous segment, if any. */
  transport?: TransportResult;
  transportReceiptId?: bigint;
  /** Who the plan last asked to confirm (hex); follow-up timers expect this person. */
  confirmationTarget?: string;
  /** 'model' (default) or 'policy' for the deterministic safety net; stored on every receipt. */
  source?: ReceiptSource;
  /** Prefix for receipt indices so policy receipts never collide with model receipts of the same version. */
  indexPrefix?: string;
};

export type ReceiptSource = 'model' | 'policy';

export type SegmentOutcome = {
  nextIndex: number;
  stopped: boolean;
  transportRequest?: TransportInput;
  transportReceiptId?: bigint;
  proposedRide: boolean;
  scheduledFollowup: boolean;
  handedOff: boolean;
  confirmationTarget?: string;
};

type Job = NonNullable<ReturnType<Ctx['db']['agentJob']['id']['find']>>;
type Incident = NonNullable<ReturnType<Ctx['db']['incident']['id']['find']>>;

/** Display name of the most recently messaged participant (other than `exclude`) who has NOT acknowledged. */
function previousContactName(ctx: Ctx, jobId: bigint, incidentId: bigint, exclude: Identity): string | undefined {
  let best: { id: bigint; who: Identity } | undefined;
  for (const n of ctx.db.notification.jobId.filter(jobId)) {
    if (n.recipient.isEqual(exclude)) continue;
    let acknowledged = false;
    for (const p of ctx.db.incidentParticipant.byIncidentUser.filter([incidentId, n.recipient])) acknowledged = p.acknowledgedAt !== undefined;
    if (acknowledged) continue;
    if (!best || n.id > best.id) best = { id: n.id, who: n.recipient };
  }
  return best ? ctx.db.userProfile.identity.find(best.who)?.displayName : undefined;
}

/**
 * Every template slot is filled from the database. Model-supplied vars are never used: all
 * placeholders in TEMPLATES are server-known, so there is nothing safe for the model to add.
 */
function templateVars(ctx: Ctx, job: { id: bigint }, incident: { id: bigint; sessionId: bigint; subject: Identity }, target: Identity): Record<string, string> {
  const name = (who: Identity | undefined) => (who ? ctx.db.userProfile.identity.find(who)?.displayName : undefined) ?? 'a friend';
  const session = ctx.db.nightSession.id.find(incident.sessionId);
  const previous = previousContactName(ctx, job.id, incident.id, target) ?? 'a friend';
  return {
    subjectName: name(incident.subject),
    helperName: name(target),
    previousContactName: previous,
    primaryName: previous,
    organizerName: name(session?.organizer),
  };
}

const HANDOFF_EVENTS = new Set(['incident_opened', 'buddy_nonresponse', 'buddy_declined']);

/** True when some participant other than the subject can still be messaged and has not been contacted for this job. */
function hasEligibleContact(ctx: Ctx, job: { id: bigint }, incident: Incident): boolean {
  const contacted = new Set<string>();
  for (const n of ctx.db.notification.jobId.filter(job.id)) contacted.add(n.recipient.toHexString());
  for (const p of ctx.db.incidentParticipant.incidentId.filter(incident.id)) {
    if (p.userId.isEqual(incident.subject) || contacted.has(p.userId.toHexString())) continue;
    if (recipientAllowed(ctx, incident, p.userId)) return true;
  }
  return false;
}

export function receipt(
  ctx: Ctx,
  jobId: bigint,
  planVersion: number,
  index: number | string,
  tool: string,
  args: unknown,
  status: 'proposed' | 'rejected' | 'executed' | 'failed',
  result: unknown,
  rejectReason: string,
  simulated: boolean,
  resultText = '',
  source: ReceiptSource = 'model'
) {
  const key = `${jobId}:${planVersion}:${index}:${tool}`;
  if (ctx.db.agentAction.idempotencyKey.find(key)) return undefined;
  const text = status === 'rejected' ? '' : source === 'policy' && !resultText.startsWith('Policy:') ? `Policy: ${resultText}` : resultText;
  return ctx.db.agentAction.insert({
    id: 0n,
    jobId,
    planVersion,
    tool,
    argsJson: JSON.stringify(args ?? {}),
    status: { tag: status },
    resultJson: JSON.stringify(result ?? {}),
    rejectReason,
    simulated,
    idempotencyKey: key,
    at: ctx.timestamp,
    resultText: text.slice(0, 120),
    source,
  });
}

/** Short human summary for a receipt (≤ 120 chars). */
export function summarizeTransport(result: TransportResult): string {
  if (result.status === 'failed') return `Transport lookup failed (${result.error ?? 'unknown'}); nothing usable`;
  if (result.status === 'partial') return `Lookup failed (${result.error ?? 'unknown'}); ${result.options.length} pickup-aware provider links`;
  if (result.status === 'ok') {
    const route = result.options.find(o => o.source === 'osrm');
    return `Route ~${route?.durationMinutes ?? '?'} min, ${route?.distanceKm ?? '?'} km; ${result.options.length} options`;
  }
  return `Provider links only (${result.options.length})`;
}

/** Mark a `proposed` receipt as executed/failed once its HTTP result is known. */
export function completeTransportReceipt(ctx: Ctx, receiptId: bigint, result: TransportResult) {
  const row = ctx.db.agentAction.id.find(receiptId);
  if (!row) return;
  ctx.db.agentAction.id.update({
    ...row,
    status: { tag: result.status === 'failed' ? 'failed' : 'executed' },
    resultJson: JSON.stringify(result),
    rejectReason: result.error ?? '',
    simulated: false,
    resultText: summarizeTransport(result).slice(0, 120),
  });
}

/**
 * Execute plan steps [startIndex..) inside one transaction. Stops early (returning the index to
 * resume from) when a step needs HTTP, when the job closed, or when the plan version went stale.
 * Pure with respect to its inputs: everything it reads comes from the database or `input`.
 */
export function executeSegment(ctx: Ctx, input: SegmentInput): SegmentOutcome {
  const out: SegmentOutcome = {
    nextIndex: input.calls.length,
    stopped: false,
    proposedRide: false,
    scheduledFollowup: false,
    handedOff: false,
    confirmationTarget: input.confirmationTarget,
  };
  if (input.transportReceiptId !== undefined && input.transport) {
    completeTransportReceipt(ctx, input.transportReceiptId, input.transport);
  }
  const sim = input.simulated;
  const src: ReceiptSource = input.source ?? 'model';
  const pfx = input.indexPrefix ?? '';
  const rec = (
    index: number,
    tool: string,
    args: unknown,
    status: 'proposed' | 'rejected' | 'executed' | 'failed',
    result: unknown,
    rejectReason: string,
    resultText = ''
  ) => receipt(ctx, input.jobId, input.planVersion, `${pfx}${index}`, tool, args, status, result, rejectReason, sim, resultText, src);

  for (let i = input.startIndex; i < input.calls.length; i++) {
    const call = input.calls[i]!;
    const job = ctx.db.agentJob.id.find(input.jobId);
    if (!job || isTerminalJob(job.status.tag)) {
      rec(i, call.name, call.args, 'rejected', {}, 'job_closed');
      out.stopped = true;
      break;
    }
    if (job.planVersion !== input.planVersion) {
      rec(i, call.name, call.args, 'rejected', {}, 'stale_plan');
      out.stopped = true;
      break;
    }
    const incident = ctx.db.incident.id.find(job.incidentId);
    if (!incident || !isOpenStatus(incident.status.tag)) {
      rec(i, call.name, call.args, 'rejected', {}, 'incident_closed');
      out.stopped = true;
      break;
    }
    if (!isToolName(call.name)) {
      rec(i, call.name, call.args, 'rejected', {}, 'tool_not_allowed');
      continue;
    }
    const validated = validateArgs(call.name, call.args ?? {});
    if (!validated.ok) {
      rec(i, call.name, call.args, 'rejected', {}, `invalid_args: ${validated.reason}`);
      continue;
    }
    const args = validated.args;
    const subjectName = ctx.db.userProfile.identity.find(incident.subject)?.displayName ?? 'Unknown';

    switch (call.name) {
      case 'get_group_context': {
        const participants = [];
        for (const p of ctx.db.incidentParticipant.incidentId.filter(incident.id)) {
          participants.push({
            userId: p.userId.toHexString(),
            role: p.role.tag,
            acknowledged: p.acknowledgedAt !== undefined,
            canMessage: recipientAllowed(ctx, incident, p.userId),
          });
        }
        rec(i, call.name, args, 'executed', { incident: incident.status.tag, participants }, '',
          `${participants.length} participants, ${participants.filter(p => p.canMessage).length} reachable; incident ${incident.status.tag}`);
        break;
      }
      case 'get_recent_checkins': {
        if (args.userId !== incident.subject.toHexString()) {
          rec(i, call.name, args, 'rejected', {}, 'only the incident subject\'s check-ins are readable');
          break;
        }
        const windowMicros = BigInt(args.windowMinutes as number) * 60_000_000n;
        const kinds: { kind: string; minutesAgo: number }[] = [];
        for (const c of ctx.db.checkin.bySessionUser.filter([incident.sessionId, incident.subject])) {
          const age = ctx.timestamp.microsSinceUnixEpoch - c.createdAt.microsSinceUnixEpoch;
          if (age <= windowMicros) kinds.push({ kind: c.kind.tag, minutesAgo: Number(age / 60_000_000n) });
        }
        rec(i, call.name, args, 'executed', { checkins: kinds }, '',
          kinds.length ? `${kinds.length} check-ins; latest ${kinds[0]!.kind} ${kinds[0]!.minutesAgo} min ago` : 'No recent check-ins');
        break;
      }
      case 'get_last_shared_location': {
        if (args.userId !== incident.subject.toHexString()) {
          rec(i, call.name, args, 'rejected', {}, 'only the incident subject\'s location age is readable');
          break;
        }
        // Age and accuracy only. Coordinates never enter receipts (every participant can read them) or the model context.
        let result: unknown = { available: false };
        for (const loc of ctx.db.latestLocation.bySessionUser.filter([incident.sessionId, incident.subject])) {
          result = {
            available: true,
            ageMinutes: Number((ctx.timestamp.microsSinceUnixEpoch - loc.recordedAt.microsSinceUnixEpoch) / 60_000_000n),
            accuracyM: loc.accuracyM,
          };
        }
        const loc = result as { available: boolean; ageMinutes?: number };
        rec(i, call.name, args, 'executed', result, '',
          loc.available ? `Last shared location is ${loc.ageMinutes} min old (rounded)` : 'No shared location available');
        break;
      }
      case 'get_transport_options': {
        const row = rec(i, call.name, args, 'proposed', {}, '');
        if (row) {
          let pickup: TransportInput['pickup'] = null;
          for (const loc of ctx.db.latestLocation.bySessionUser.filter([incident.sessionId, incident.subject])) {
            pickup = { lat: loc.lat, lng: loc.lng };
          }
          const session = ctx.db.nightSession.id.find(incident.sessionId);
          out.transportRequest = {
            pickup,
            venueHint: session?.venueHint ?? '',
            nowIso: ctx.timestamp.toDate().toISOString(),
          };
          out.transportReceiptId = row.id;
          out.nextIndex = i + 1;
          return out;
        }
        break;
      }
      case 'send_approved_message':
      case 'request_human_confirmation': {
        const targetHex = (call.name === 'send_approved_message' ? args.recipient : args.userId) as string;
        const target = Identity.fromString(targetHex);
        if (!recipientAllowed(ctx, incident, target)) {
          rec(i, call.name, args, 'rejected', {}, 'recipient_not_authorized: not a participant with messaging consent from the subject');
          break;
        }
        const template = call.name === 'send_approved_message' ? (args.template as string) : 'ack_request';
        if (!isModelTemplate(template)) {
          rec(i, call.name, args, 'rejected', {}, 'template_not_allowed');
          break;
        }
        // Every slot is filled from the database; nothing the planner wrote reaches a message body.
        const body = renderTemplate(template, templateVars(ctx, job, incident, target));
        const env = envOf(ctx);
        const twilio = twilioConfig(env);
        const phone = ctx.db.userPhone.identity.find(target)?.phoneE164 ?? '';
        const channel = call.name === 'send_approved_message' && twilio && phone.length > 0 ? 'sms' : 'in_app';
        const n = ctx.db.notification.insert({
          id: 0n,
          incidentId: incident.id,
          jobId: job.id,
          recipient: target,
          channel: { tag: channel },
          template,
          body,
          status: { tag: 'queued' },
          providerId: '',
          simulated: channel !== 'sms',
          createdAt: ctx.timestamp,
          acknowledgedAt: undefined,
        });
        ctx.db.notificationDispatch.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
          notificationId: n.id,
        });
        const targetName = ctx.db.userProfile.identity.find(target)?.displayName ?? 'participant';
        if (call.name === 'request_human_confirmation') {
          sendAlert(ctx, target, incident.id, 'ack_requested', String(args.question));
          out.confirmationTarget = targetHex;
          addEvent(ctx, incident.id, 'confirmation_requested', `Asked ${targetName} to confirm they are helping`, sim);
        } else {
          addEvent(ctx, incident.id, 'message_queued', `${template} queued for ${targetName} via ${channel}`, channel !== 'sms');
          if (out.confirmationTarget === undefined) out.confirmationTarget = targetHex;
        }
        rec(i, call.name, args, 'executed', { notificationId: String(n.id), channel }, '',
          call.name === 'request_human_confirmation' ? `Asked ${targetName} to confirm` : `${template} queued for ${targetName} via ${channel}`);
        break;
      }
      case 'schedule_followup': {
        let open = 0;
        for (const _t of ctx.db.followupTimer.jobId.filter(job.id)) open++;
        if (open >= MAX_OPEN_FOLLOWUPS) {
          rec(i, call.name, args, 'rejected', {}, 'too_many_open_followups');
          break;
        }
        const expectedHex = out.confirmationTarget;
        const session = ctx.db.nightSession.id.find(incident.sessionId);
        const expectedFrom = expectedHex ? Identity.fromString(expectedHex) : (session?.organizer ?? incident.subject);
        const minutes = args.delayMinutes as number;
        const timer = ctx.db.followupTimer.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(minutesAfter(ctx.timestamp, minutes).microsSinceUnixEpoch),
          jobId: job.id,
          expectedFrom,
          tier: job.escalationTier,
        });
        out.scheduledFollowup = true;
        rec(i, call.name, args, 'executed', { timerId: String(timer.scheduledId), minutes }, '',
          `Follow-up in ${minutes} min`);
        break;
      }
      case 'update_incident_state': {
        const state = args.state as string;
        const target = state === 'acknowledged' ? 'acknowledged' : 'assistance_underway';
        const from = incident.status.tag;
        const allowedFrom = target === 'acknowledged' ? ['open'] : ['open', 'acknowledged', 'assistance_underway'];
        if (!allowedFrom.includes(from)) {
          rec(i, call.name, args, 'rejected', {}, `invalid_transition: ${from} -> ${target}`);
          break;
        }
        if (from !== target) {
          ctx.db.incident.id.update({ ...incident, status: { tag: target } });
          addEvent(ctx, incident.id, 'state_updated', `Agent set status ${target}`, sim);
        }
        rec(i, call.name, args, 'executed', { from, to: target }, '', `Status ${from} → ${target}`);
        break;
      }
      case 'propose_ride_plan': {
        const rider = Identity.fromString(args.riderId as string);
        let isParticipant = false;
        for (const _p of ctx.db.incidentParticipant.byIncidentUser.filter([incident.id, rider])) isParticipant = true;
        if (!isParticipant) {
          rec(i, call.name, args, 'rejected', {}, 'rider_not_participant');
          break;
        }
        let options: unknown;
        let dropped = 0;
        const fetchedAtMs = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
        if (args.options === 'from_transport_lookup') {
          if (!input.transport) {
            rec(i, call.name, args, 'rejected', {}, 'no_transport_lookup_in_plan');
            break;
          }
          const clean = sanitizeOptions(input.transport.options);
          dropped = clean.dropped;
          options = { ...input.transport, options: clean.kept.map(o => ({ ...o, fetchedAt: fetchedAtMs })) };
        } else {
          const clean = sanitizeOptions(args.options as { kind: string; label: string; url: string; source: string }[]);
          dropped = clean.dropped;
          options = {
            status: 'model_proposed',
            fetchedAt: ctx.timestamp.toDate().toISOString(),
            options: clean.kept.map(o => ({ ...o, fetchedAt: fetchedAtMs })),
            simulated: sim,
          };
        }
        let existing;
        for (const r of ctx.db.ridePlan.jobId.filter(job.id)) {
          if (r.status.tag === 'proposed' || r.status.tag === 'accepted') existing = r;
        }
        const optionsJson = JSON.stringify(options);
        let planId: bigint;
        if (existing) {
          ctx.db.ridePlan.id.update({ ...existing, optionsJson, updatedAt: ctx.timestamp });
          planId = existing.id;
        } else {
          planId = ctx.db.ridePlan.insert({
            id: 0n,
            incidentId: incident.id,
            jobId: job.id,
            riderId: rider,
            optionsJson,
            chosenOption: '',
            status: { tag: 'proposed' },
            confirmedBy: undefined,
            updatedAt: ctx.timestamp,
          }).id;
        }
        out.proposedRide = true;
        addEvent(ctx, incident.id, 'ride_proposed', `Transport options proposed for ${subjectName}; a person books`, sim);
        for (const p of ctx.db.incidentParticipant.incidentId.filter(incident.id)) {
          if (p.userId.isEqual(rider) || p.acknowledgedAt !== undefined) {
            sendAlert(ctx, p.userId, incident.id, 'incident_update', `Ride options for ${subjectName} are ready. Someone needs to book and confirm.`);
          }
        }
        rec(i, call.name, args, 'executed', { ridePlanId: String(planId), droppedLinks: dropped }, '',
          `Ride plan #${planId} proposed${dropped ? `; ${dropped} link(s) dropped by the allowlist` : ''}`);
        break;
      }
      case 'no_action': {
        rec(i, call.name, args, 'executed', { reason: (args.reason as string) || '' }, '', 'No action needed');
        break;
      }
      case 'hand_off': {
        // A hand-off ends automated coordination, so it is only valid while the agent is still looking
        // for a helper and nobody eligible is left. A ride in progress is never a reason to hand off.
        if (!HANDOFF_EVENTS.has(input.event) || hasEligibleContact(ctx, job, incident)) {
          rec(i, call.name, args, 'rejected', {}, 'hand_off_not_applicable');
          break;
        }
        ctx.db.agentJob.id.update({ ...job, status: { tag: 'handed_off' }, lastEvent: 'handed_off', updatedAt: ctx.timestamp });
        for (const t of ctx.db.followupTimer.jobId.filter(job.id)) ctx.db.followupTimer.scheduledId.delete(t.scheduledId);
        const reason = (args.reason as string) || 'no eligible contact remains';
        const takers = handoffRecipients(ctx, incident);
        addEvent(ctx, incident.id, 'handed_off', `Automated coordination stopped (${reason}); ${takers.length ? 'a human participant' : 'nobody is available and the group'} asked to take over`, sim);
        for (const who of takers) {
          sendAlert(ctx, who, incident.id, 'incident_update', `SafeNight could not reach a helper for ${subjectName}. Please take over coordination.`);
        }
        out.handedOff = true;
        rec(i, call.name, args, 'executed', { reason, recipients: takers.length }, '', `Handed off to a human participant: ${reason}`);
        out.stopped = true;
        out.nextIndex = input.calls.length;
        return out;
      }
    }
  }
  return out;
}

export type { Job as AgentJobRowType, Incident as IncidentRowType };
