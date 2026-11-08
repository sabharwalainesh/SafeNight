// Pure row -> AgentApi converters. Rows are structurally typed so tests can pass fakes.
// JSON columns (stepsJson/argsJson/resultJson/optionsJson) are parsed defensively.
import type { Identity, Timestamp } from 'spacetimedb';
import { idStr, identityStr, optTsMs, tagToSnake, tsMs } from '../../night-out/live/convert';
import type {
  ActionStatus,
  AgentAction,
  AgentJob,
  AgentJobStatus,
  AgentNotification,
  AgentPlan,
  Channel,
  DeliveryStatus,
  PlanStep,
  RideOption,
  RidePlan,
  RideStatus,
} from '../api';

type Tag = { tag: string };

export type JobRowLike = {
  id: bigint;
  incidentId: bigint;
  status: Tag;
  planVersion: number;
  escalationTier: number;
  lastEvent: string;
  wakeCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Not present in the C3 view today; read if a later module adds them.
  followupDueAt?: Timestamp | null;
  followupExpectedFrom?: Identity | null;
};
export type PlanRowLike = {
  id: bigint;
  jobId: bigint;
  version: number;
  summary: string;
  stepsJson: string;
  model: string;
  simulated: boolean;
  createdAt: Timestamp;
};
export type ActionRowLike = {
  id: bigint;
  jobId: bigint;
  planVersion: number;
  tool: string;
  argsJson: string;
  status: Tag;
  resultJson: string;
  rejectReason: string;
  resultText?: string;
  simulated: boolean;
  at: Timestamp;
};
export type NotificationRowLike = {
  id: bigint;
  incidentId: bigint;
  recipient: Identity;
  channel: Tag;
  template: string;
  body: string;
  status: Tag;
  simulated: boolean;
  createdAt: Timestamp;
  acknowledgedAt?: Timestamp | null;
};
export type RidePlanRowLike = {
  id: bigint;
  incidentId: bigint;
  riderId: Identity;
  optionsJson: string;
  chosenOption: string;
  status: Tag;
  confirmedBy?: Identity | null;
  updatedAt: Timestamp;
};

/** Enum tag -> snake_case contract value, falling back when the tag is unknown. */
function mapEnum<T extends string>(tag: Tag, allowed: readonly T[], fallback: T): T {
  const s = tagToSnake(tag?.tag ?? '');
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}
const JOB_STATUSES = ['queued', 'planning', 'waiting_for_ack', 'escalated', 'transport_pending', 'awaiting_home_confirmation', 'resolved', 'handed_off', 'cancelled'] as const;
const ACTION_STATUSES = ['proposed', 'rejected', 'executed', 'failed', 'delivered', 'acknowledged'] as const;
const CHANNELS = ['in_app', 'sms', 'voice'] as const;
const DELIVERY = ['queued', 'sent', 'delivered', 'failed', 'acknowledged'] as const;
const RIDE_STATUSES = ['proposed', 'accepted', 'booked_by_user', 'pickup_confirmed', 'completed', 'cancelled'] as const;

export const jobStatus = (t: Tag): AgentJobStatus => mapEnum(t, JOB_STATUSES, 'queued');
export const actionStatus = (t: Tag): ActionStatus => mapEnum(t, ACTION_STATUSES, 'proposed');
export const channelOf = (t: Tag): Channel => mapEnum(t, CHANNELS, 'in_app');
export const deliveryStatus = (t: Tag): DeliveryStatus => mapEnum(t, DELIVERY, 'queued');
export const rideStatus = (t: Tag): RideStatus => mapEnum(t, RIDE_STATUSES, 'proposed');

export function parseJson(s: string | null | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

export function toJob(r: JobRowLike): AgentJob {
  return {
    id: idStr(r.id),
    incidentId: idStr(r.incidentId),
    status: jobStatus(r.status),
    planVersion: r.planVersion,
    escalationTier: r.escalationTier,
    lastEvent: r.lastEvent,
    wakeCount: r.wakeCount,
    createdAt: tsMs(r.createdAt),
    updatedAt: tsMs(r.updatedAt),
    followupDueAt: optTsMs(r.followupDueAt),
    followupExpectedFrom: r.followupExpectedFrom ? identityStr(r.followupExpectedFrom) : null,
  };
}

const humanTool = (t: string) => t.replace(/_/g, ' ');

/** stepsJson is the tool-call list `[{name,args}]`; also accepts strings and `{title,detail}`. */
export function parseSteps(json: string): PlanStep[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  const out: PlanStep[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push({ title: item, detail: '' });
    else if (isObj(item)) {
      const name = str(item.name) || str(item.tool);
      const title = str(item.title) || (name ? humanTool(name) : '');
      let detail = str(item.detail);
      if (!detail && isObj(item.args)) {
        detail = Object.entries(item.args)
          .filter(([, val]) => typeof val !== 'object')
          .map(([k, val]) => `${k}: ${String(val).slice(0, 60)}`)
          .join(', ');
      }
      if (title) out.push({ title, detail });
    }
  }
  return out;
}

export const toPlan = (r: PlanRowLike): AgentPlan => ({
  id: idStr(r.id),
  jobId: idStr(r.jobId),
  version: r.version,
  summary: r.summary,
  steps: parseSteps(r.stepsJson),
  model: r.model,
  simulated: r.simulated,
  createdAt: tsMs(r.createdAt),
});

/** One short human sentence from a receipt's result, falling back to tool + status. */
export function resultText(tool: string, status: string, resultJson: string, rejectReason: string): string {
  const v = parseJson(resultJson);
  if (isObj(v)) {
    if (typeof v.message === 'string' && v.message) return v.message.slice(0, 160);
    if (typeof v.summary === 'string' && v.summary) return v.summary.slice(0, 160);
    if (tool === 'get_transport_options') {
      const n = Array.isArray(v.options) ? v.options.length : 0;
      const st = str(v.status);
      if (st === 'failed') return `Transport lookup failed${v.error ? `: ${str(v.error)}` : ''}`;
      if (st === 'provider_links_only') return `Provider links only (${n} options)`;
      if (st === 'ok') return `Route found, ${n} options`;
    }
    if (typeof v.error === 'string' && v.error) return `Error: ${v.error}`.slice(0, 160);
    if (Array.isArray(v.participants)) return `Read ${v.participants.length} participants`;
  }
  if (rejectReason) return `${humanTool(tool)} ${status}: ${rejectReason}`;
  return `${humanTool(tool)}: ${status}`;
}

export function toAction(r: ActionRowLike): AgentAction {
  const st = actionStatus(r.status);
  const args = parseJson(r.argsJson);
  return {
    id: idStr(r.id),
    jobId: idStr(r.jobId),
    planVersion: r.planVersion,
    tool: r.tool,
    args: isObj(args) ? args : {},
    status: st,
    resultText: r.resultText ? r.resultText : resultText(r.tool, st, r.resultJson, r.rejectReason),
    rejectReason: r.rejectReason,
    simulated: r.simulated,
    at: tsMs(r.at),
  };
}

export function toNotification(r: NotificationRowLike, nameOf: (id: string) => string | undefined): AgentNotification {
  const recipient = identityStr(r.recipient);
  return {
    id: idStr(r.id),
    incidentId: idStr(r.incidentId),
    recipient,
    recipientName: nameOf(recipient) ?? recipient.slice(0, 8),
    channel: channelOf(r.channel),
    template: r.template,
    body: r.body,
    status: deliveryStatus(r.status),
    simulated: r.simulated,
    createdAt: tsMs(r.createdAt),
    acknowledgedAt: optTsMs(r.acknowledgedAt),
  };
}

const KINDS = ['rideshare', 'transit', 'walk_with_buddy', 'friend_driver'] as const;

/** optionsJson is either a TransportResult `{status,fetchedAt,options[],error?}` or a bare options array. */
export function parseRideOptions(json: string, fetchedAtFallback: number): RideOption[] {
  const v = parseJson(json);
  const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.options) ? v.options : [];
  const status = isObj(v) ? str(v.status) : '';
  const error = isObj(v) ? str(v.error) : '';
  let fetchedAt = fetchedAtFallback;
  if (isObj(v) && typeof v.fetchedAt === 'string') {
    const t = Date.parse(v.fetchedAt);
    if (!Number.isNaN(t)) fetchedAt = t;
  }
  const out: RideOption[] = [];
  for (const o of list) {
    if (!isObj(o)) continue;
    const label = str(o.label);
    if (!label) continue;
    const kindRaw = str(o.kind);
    const kind: RideOption['kind'] = (KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as RideOption['kind']) : 'rideshare';
    const src = str(o.source);
    let source =
      src === 'osrm' ? 'OSRM route' : src === 'provider_link' ? 'Provider link only' : src === 'model_proposed' ? 'Proposed by the planner' : src || 'Unknown source';
    if (status === 'failed') source = `Lookup failed: ${error || 'unknown error'}`;
    out.push({
      id: label,
      kind,
      label,
      url: str(o.url) || null,
      etaMinutes: typeof o.durationMinutes === 'number' ? o.durationMinutes : null,
      source,
      fetchedAt,
      simulated: o.simulated === true,
    });
  }
  return out;
}

export function toRidePlan(r: RidePlanRowLike, nameOf: (id: string) => string | undefined): RidePlan {
  const rider = identityStr(r.riderId);
  const updatedAt = tsMs(r.updatedAt);
  return {
    id: idStr(r.id),
    incidentId: idStr(r.incidentId),
    riderId: rider,
    riderName: nameOf(rider) ?? rider.slice(0, 8),
    options: parseRideOptions(r.optionsJson, updatedAt),
    chosenOption: r.chosenOption || null,
    status: rideStatus(r.status),
    confirmedBy: r.confirmedBy ? identityStr(r.confirmedBy) : null,
    updatedAt,
  };
}
