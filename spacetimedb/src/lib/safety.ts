import { SenderError } from 'spacetimedb/server';
import { ScheduleAt, type Identity } from 'spacetimedb';
import type { Ctx } from './auth';
import { findMembership, getSession, sessionIsOpen } from './auth';
import { isBefore, minutesAfter } from './time';

export const DRIVER_WARNING =
  "Please don't drive tonight. A friend is worried you may have been drinking. Your group will help you get home.";
export const LOCATION_TTL_MINUTES = 15;
export const CANCEL_WINDOW_MICROS = 2n * 60_000_000n;
export const DEDUPE_BUCKET_MICROS = 5n * 60_000_000n;
export const SWEEP_INTERVAL_MICROS = 60n * 1_000_000n;
export const MAX_NOTE_LENGTH = 280;

export type IncidentKindTag = 'possible_impaired_driving' | 'help_requested' | 'missed_checkin' | 'feeling_unsafe';
export type SeverityTag = 'info' | 'elevated' | 'urgent';
export type AlertKindTag = 'no_driving_warning' | 'help_requested' | 'ack_requested' | 'incident_update';

const CLOSED = new Set(['resolved', 'cancelled', 'handed_off']);

export function isOpenStatus(tag: string): boolean {
  return !CLOSED.has(tag);
}

export function displayNameOf(ctx: { db: Ctx['db'] }, who: Identity): string {
  return ctx.db.userProfile.identity.find(who)?.displayName ?? 'Unknown';
}

export function requireNote(note: string): string {
  if (note.length > MAX_NOTE_LENGTH) throw new SenderError(`Note must be ${MAX_NOTE_LENGTH} characters or fewer`);
  return note.trim();
}

/** The accepted, still-open driver for a session, if any. */
export function acceptedDriverId(ctx: Ctx, sessionId: bigint): Identity | undefined {
  for (const a of ctx.db.driverAssignment.sessionId.filter(sessionId)) {
    if (a.endedAt === undefined && a.acceptedAt !== undefined) return a.driverId;
  }
  return undefined;
}

/** Unexpired, unrevoked grant from subject to recipient for a scope within a session. */
export function hasActiveGrant(
  ctx: Ctx,
  subject: Identity,
  recipient: Identity,
  sessionId: bigint,
  scope: string
): boolean {
  for (const g of ctx.db.consentGrant.bySubjectRecipient.filter([subject, recipient])) {
    if (
      g.sessionId === sessionId &&
      g.scope.tag === scope &&
      g.revokedAt === undefined &&
      isBefore(ctx.timestamp, g.expiresAt)
    ) {
      return true;
    }
  }
  return false;
}

export function findOpenIncident(ctx: Ctx, sessionId: bigint, subject: Identity) {
  for (const i of ctx.db.incident.subject.filter(subject)) {
    if (i.sessionId === sessionId && isOpenStatus(i.status.tag)) return i;
  }
  return undefined;
}

export function findParticipant(ctx: Ctx, incidentId: bigint, userId: Identity) {
  for (const p of ctx.db.incidentParticipant.byIncidentUser.filter([incidentId, userId])) return p;
  return undefined;
}

export function addEvent(ctx: Ctx, incidentId: bigint, kind: string, detail: string, simulated = false) {
  ctx.db.incidentEvent.insert({
    id: 0n,
    incidentId,
    at: ctx.timestamp,
    actor: ctx.sender,
    kind,
    detail,
    simulated,
  });
}

export function sendAlert(ctx: Ctx, recipient: Identity, incidentId: bigint, kind: AlertKindTag, message: string) {
  ctx.db.safetyAlert.insert({ recipient, incidentId, kind: { tag: kind }, message, at: ctx.timestamp });
}

/**
 * Open an incident with every active member as a participant. Writes the `opened` and
 * `agent_requested` timeline events. Alerts are the caller's responsibility.
 */
export function openIncident(
  ctx: Ctx,
  sessionId: bigint,
  subject: Identity,
  reporter: Identity,
  kind: IncidentKindTag,
  severity: SeverityTag,
  detail: string
) {
  const session = getSession(ctx, sessionId);
  const inc = ctx.db.incident.insert({
    id: 0n,
    sessionId,
    subject,
    kind: { tag: kind },
    severity: { tag: severity },
    status: { tag: 'open' },
    openedBy: reporter,
    openedAt: ctx.timestamp,
    resolvedAt: undefined,
    resolvedBy: undefined,
  });
  for (const m of ctx.db.sessionMember.sessionId.filter(sessionId)) {
    if (!m.active) continue;
    const role = m.userId.isEqual(subject)
      ? 'subject'
      : m.userId.isEqual(session.organizer)
        ? 'organizer'
        : m.userId.isEqual(reporter)
          ? 'reporter'
          : 'buddy';
    ctx.db.incidentParticipant.insert({
      id: 0n,
      incidentId: inc.id,
      userId: m.userId,
      role: { tag: role },
      acknowledgedAt: undefined,
    });
  }
  addEvent(ctx, inc.id, 'opened', detail);
  addEvent(ctx, inc.id, 'agent_requested', 'Coordination agent requested (C3 wires the wake-up)');
  return inc;
}

export function participantsOf(ctx: Ctx, incidentId: bigint) {
  return Array.from(ctx.db.incidentParticipant.incidentId.filter(incidentId));
}

/** Deterministic driver path: incident + immediate no-driving warning, all in this transaction. */
export function openDriverIncident(ctx: Ctx, sessionId: bigint, driverId: Identity, reporter: Identity, detail: string) {
  const session = getSession(ctx, sessionId);
  const inc = openIncident(ctx, sessionId, driverId, reporter, 'possible_impaired_driving', 'urgent', detail);
  sendAlert(ctx, driverId, inc.id, 'no_driving_warning', DRIVER_WARNING);
  addEvent(ctx, inc.id, 'warning_shown', 'Deterministic no-driving warning sent to the driver');
  const msg = `${displayNameOf(ctx, reporter)} is worried about ${displayNameOf(ctx, driverId)}. The driver has been asked not to drive.`;
  for (const p of participantsOf(ctx, inc.id)) {
    if (p.userId.isEqual(driverId) || p.userId.isEqual(reporter)) continue;
    if (p.userId.isEqual(session.organizer)) sendAlert(ctx, p.userId, inc.id, 'incident_update', msg);
    else sendAlert(ctx, p.userId, inc.id, 'ack_requested', `${msg} Please acknowledge.`);
  }
  return inc;
}

export function clearCheckinTimers(ctx: Ctx, sessionId: bigint, userId: Identity) {
  for (const row of ctx.db.checkinTimer.userId.filter(userId)) {
    if (row.sessionId === sessionId) ctx.db.checkinTimer.scheduledId.delete(row.scheduledId);
  }
}

/** (Re)arm the member's one-shot check-in timer if the session is open and they are active. */
export function armCheckinTimer(ctx: Ctx, sessionId: bigint, userId: Identity) {
  clearCheckinTimers(ctx, sessionId, userId);
  const session = ctx.db.nightSession.id.find(sessionId);
  if (!session || !sessionIsOpen(session)) return;
  const m = findMembership(ctx, sessionId, userId);
  if (!m || !m.active) return;
  const minutes = Math.max(1, session.checkinIntervalMinutes);
  ctx.db.checkinTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(minutesAfter(ctx.timestamp, minutes).microsSinceUnixEpoch),
    sessionId,
    userId,
    armedAt: ctx.timestamp,
  });
}

export function ensureSweepScheduled(ctx: Ctx) {
  if (ctx.db.locationSweep.count() > 0n) return false;
  ctx.db.locationSweep.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(SWEEP_INTERVAL_MICROS) });
  return true;
}
