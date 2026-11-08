import { TEXT_TEMPLATES, type Action, type IncidentSnapshot, type ProposedAction } from './types.js';

export const EMERGENCY_PREFIXES = [
  '911', '112', '999', '000', '110', '119', '118', '100', '101', '102', '108', '933', '988',
];
export const CALL_COOLDOWN_MS = 5 * 60_000;
export const TEXT_COOLDOWN_MS = 2 * 60_000;

export interface PolicyContext {
  incident: IncidentSnapshot;
  now: number;
  demoDispatchNumber?: string;
  blockedNumbers: string[];
  phoneFor: (personaId: string) => string | undefined;
  optedIn: (personaId: string) => boolean;
  /** All previously recorded actions for this incident (including blocked). */
  history: Action[];
}

export type PolicyResult =
  | { ok: true; target: string; number?: string }
  | { ok: false; reason: string };

export const digitsOf = (n: string): string => n.replace(/\D/g, '');

function variants(n: string): string[] {
  const d = digitsOf(n);
  const out = new Set<string>([d]);
  if (d.startsWith('00')) out.add(d.slice(2));
  if (d.startsWith('011')) out.add(d.slice(3));
  for (const v of [...out]) if (v.length === 11 && v.startsWith('1')) out.add(v.slice(1));
  for (const v of [...out]) if (v.startsWith('1') && v.length > 1) out.add(v.slice(1));
  return [...out];
}

/** Returns a reason string if the number must never be dialed, else null. */
export function emergencyNumberReason(number: string, blockedNumbers: string[] = []): string | null {
  const d = digitsOf(number);
  if (d.length <= 6) return `Number has ${d.length} digits (short code); refusing to dial`;
  const vs = variants(number);
  for (const v of vs) {
    if (v.length <= 6) return 'Number looks like a short code; refusing to dial';
    const hit = EMERGENCY_PREFIXES.find((p) => v.startsWith(p));
    if (hit) return `Number matches emergency service code ${hit}; refusing to dial`;
  }
  const blocked = new Set(blockedNumbers.flatMap((b) => variants(b)));
  if (vs.some((v) => blocked.has(v))) return 'Number is in BLOCKED_NUMBERS; refusing to dial';
  return null;
}

const CLOSED = new Set(['resolved', 'cancelled', 'canceled', 'closed']);
export const isOpenish = (status: string): boolean => !CLOSED.has(status.trim().toLowerCase());

export function nonSubject(inc: IncidentSnapshot) {
  return inc.participants.filter((p) => p.personaId !== inc.subjectPersonaId);
}
export const noneAcknowledged = (inc: IncidentSnapshot): boolean =>
  !nonSubject(inc).some((p) => p.acknowledged);
export function latestCheckinIsEmergency(inc: IncidentSnapshot): boolean {
  const sorted = [...inc.recentCheckins].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted[sorted.length - 1];
  return !!last && /emergency/i.test(last.kind);
}

export function validateAction(a: ProposedAction, ctx: PolicyContext): PolicyResult {
  const { incident: inc } = ctx;
  const resolvedUpdate = a.type === 'text_group' && a.template === 'update_resolved_by_person' && inc.status.toLowerCase() === 'resolved';
  if (!isOpenish(inc.status) && !resolvedUpdate) return { ok: false, reason: `Incident is ${inc.status}; no actions allowed` };
  // The "closed" update may only go out once the incident really is resolved.
  if (a.type === 'text_group' && a.template === 'update_resolved_by_person' && !resolvedUpdate) return { ok: false, reason: 'Incident is not resolved' };
  const prior = ctx.history.filter((h) => h.status !== 'blocked');

  if (a.type === 'text_group') {
    if (!a.template || !(TEXT_TEMPLATES as readonly string[]).includes(a.template)) return { ok: false, reason: 'Unknown text template' };
    const recipients = inc.participants.filter((p) => ctx.optedIn(p.personaId));
    if (recipients.length === 0) return { ok: false, reason: 'No participants have opted in by texting "join <name>"' };
    if (prior.some((h) => h.type === 'text_group' && ctx.now - h.createdAt < TEXT_COOLDOWN_MS)) {
      return { ok: false, reason: 'Group text rate limit (1 per 2 minutes)' };
    }
    return { ok: true, target: 'group' };
  }

  if (a.type === 'call_person') {
    const pid = (a.personaId ?? '').toLowerCase();
    const p = inc.participants.find((x) => x.personaId.toLowerCase() === pid);
    if (!p) return { ok: false, reason: `${pid || 'unknown'} is not a participant in this incident` };
    if (p.personaId === inc.subjectPersonaId && !/check/i.test(inc.kind)) {
      return { ok: false, reason: 'Will not call the subject unless this is a check-on-subject incident' };
    }
    const phone = ctx.phoneFor(p.personaId);
    if (!phone) return { ok: false, reason: `No registered phone for ${p.displayName}` };
    const bad = emergencyNumberReason(phone, ctx.blockedNumbers);
    if (bad) return { ok: false, reason: bad };
    if (prior.some((h) => h.type === 'call_person' && h.target === p.personaId && ctx.now - h.createdAt < CALL_COOLDOWN_MS)) {
      return { ok: false, reason: `Already called ${p.displayName} within 5 minutes` };
    }
    return { ok: true, target: p.personaId, number: phone };
  }

  if (a.type === 'dispatch_call') {
    if (inc.severity.toLowerCase() !== 'urgent') return { ok: false, reason: 'Dispatch requires urgent severity' };
    if (!(latestCheckinIsEmergency(inc) || noneAcknowledged(inc))) {
      return { ok: false, reason: 'Dispatch requires an emergency check-in or no acknowledgement from anyone' };
    }
    if (prior.some((h) => h.type === 'dispatch_call')) {
      return { ok: false, reason: 'A dispatch call was already made for this incident' };
    }
    const demo = ctx.demoDispatchNumber?.trim();
    if (!demo) return { ok: false, reason: 'No demo dispatch number configured' };
    const bad = emergencyNumberReason(demo, ctx.blockedNumbers);
    if (bad) return { ok: false, reason: bad };
    return { ok: true, target: 'demo-dispatch-line', number: demo };
  }

  return { ok: false, reason: 'Unknown action type' };
}
