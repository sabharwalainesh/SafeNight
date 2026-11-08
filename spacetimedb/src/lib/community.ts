import { SenderError } from 'spacetimedb/server';
import { ScheduleAt, type Identity } from 'spacetimedb';
import type { Ctx } from './auth';
import { envOf } from './env';
import { isOpenStatus } from './safety';

export const REPORT_TTL_MINUTES = 4 * 60;
export const REPORT_MERGE_WINDOW_MICROS = 2n * 60n * 60_000_000n;
export const CORROBORATED_AT = 3;
export const MAX_REPORT_TEXT = 280;
export const VENUE_EXPIRY_INTERVAL_MICROS = 5n * 60n * 1_000_000n;
export const RETENTION_INTERVAL_MICROS = 60n * 60n * 1_000_000n;
export const SENSITIVE_CATEGORIES = new Set(['aggressive_behavior', 'drink_tampering']);

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Replace phone numbers, emails, URLs and @handles so public reports never carry contact details. */
export function redactText(input: string): string {
  return input
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]')
    .replace(/(?<![\w@])@\w{2,}/g, '[redacted]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function requireReportText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new SenderError('Describe what you observed');
  if (trimmed.length > MAX_REPORT_TEXT) throw new SenderError(`Report must be ${MAX_REPORT_TEXT} characters or fewer`);
  return redactText(trimmed);
}

export function ownerOf(ctx: { db: Ctx['db'] }): Identity | undefined {
  return ctx.db.config.id.find(0)?.owner;
}

export function isOwner(ctx: Ctx): boolean {
  return ownerOf(ctx)?.isEqual(ctx.sender) ?? false;
}

export function requireOwner(ctx: Ctx) {
  if (!isOwner(ctx)) throw new SenderError('Only the database owner can do that');
}

export function isModerator(ctx: Ctx): boolean {
  if (isOwner(ctx)) return true;
  return ctx.db.appRole.identity.find(ctx.sender)?.role.tag === 'moderator';
}

/** Demo controls are open to everyone except in production; the owner may always use them. */
export function requireDemoAllowed(ctx: Ctx) {
  if (isOwner(ctx)) return;
  if (envOf(ctx).APP_ENV === 'production') throw new SenderError('Demo controls are disabled in production');
}

// Clearly labeled demo resources around the demo venue (Deep Ellum, Dallas). Coordinates are plausible, not real places.
export const DEMO_RESOURCES: { type: string; name: string; lat: number; lng: number; hours: string }[] = [
  // New Year's Eve demo scenario: Midtown Manhattan around Times Square. Fictional/demo entries.
  { type: 'campus_safety', name: 'NYE safety help desk (demo)', lat: 40.7575, lng: -73.9858, hours: 'NYE 16:00–02:00' },
  { type: 'staffed_venue', name: 'Marriott Marquis lobby (demo)', lat: 40.7585, lng: -73.9862, hours: '24/7' },
  { type: 'medical', name: 'Midtown Medical Station (demo)', lat: 40.7565, lng: -73.988, hours: 'NYE 18:00–03:00' },
  { type: 'transit_stop', name: 'Times Sq–42 St subway (demo)', lat: 40.7553, lng: -73.9872, hours: '24/7' },
  { type: 'transit_stop', name: 'Grand Central Terminal (demo)', lat: 40.7527, lng: -73.9772, hours: '05:30–02:00' },
  { type: 'pickup_point', name: 'W 44th St rideshare pickup (demo)', lat: 40.7566, lng: -73.985, hours: 'always' },
  { type: 'pickup_point', name: 'W 48th St pickup (demo)', lat: 40.76, lng: -73.9845, hours: 'always' },
];

/** Idempotent: inserts missing demo resources, updates existing ones by name, removes demo-seed rows no longer listed. */
export function seedResources(ctx: Ctx): number {
  let touched = 0;
  const wanted = new Set(DEMO_RESOURCES.map(r => r.name));
  for (const r of DEMO_RESOURCES) {
    const row = {
      type: { tag: r.type as 'campus_safety' },
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      hours: r.hours,
      source: 'demo-seed',
      verifiedAt: ctx.timestamp,
    };
    const existing = ctx.db.safetyResource.name.find(r.name);
    if (existing) ctx.db.safetyResource.id.update({ ...existing, ...row });
    else ctx.db.safetyResource.insert({ ...row, id: 0n, createdAt: ctx.timestamp });
    touched++;
  }
  for (const r of [...ctx.db.safetyResource.iter()]) {
    if (r.source === 'demo-seed' && !wanted.has(r.name)) {
      ctx.db.safetyResource.id.delete(r.id);
      touched++;
    }
  }
  return touched;
}

/** Idempotent: interval sweeps for venue report expiry and retention. Returns what was created. */
export function ensureCommunitySchedules(ctx: Ctx): string[] {
  const created: string[] = [];
  if (ctx.db.venueReportExpiry.count() === 0n) {
    ctx.db.venueReportExpiry.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(VENUE_EXPIRY_INTERVAL_MICROS) });
    created.push('venue_report_expiry');
  }
  if (ctx.db.retentionSweep.count() === 0n) {
    ctx.db.retentionSweep.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(RETENTION_INTERVAL_MICROS) });
    created.push('retention_sweep');
  }
  return created;
}

export function privacyDefaults(ctx: { db: Ctx['db'] }, who: Identity) {
  return ctx.db.userPrivacySettings.identity.find(who);
}
export const DEFAULT_CONSENT_TTL_MINUTES = 180;

// ── Retention ───────────────────────────────────────────────────────────────
const HOUR = 60n * 60_000_000n;
const DAY = 24n * HOUR;
export const RETENTION = {
  checkinMicros: DAY,
  locationMicros: HOUR,
  consumptionMicros: DAY,
  notificationMicros: 7n * DAY,
  auditMicros: 30n * DAY,
  closedIncidentMicros: 7n * DAY,
};

/** Shared by the scheduled sweep and tests. Returns counts for logging. */
export function runRetention(ctx: Ctx) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const older = (ts: { microsSinceUnixEpoch: bigint }, max: bigint) => now - ts.microsSinceUnixEpoch > max;
  let deleted = 0;
  for (const c of ctx.db.checkin.iter()) if (older(c.createdAt, RETENTION.checkinMicros)) { ctx.db.checkin.id.delete(c.id); deleted++; }
  for (const l of ctx.db.locationUpdate.iter()) if (older(l.recordedAt, RETENTION.locationMicros)) { ctx.db.locationUpdate.id.delete(l.id); deleted++; }
  for (const l of ctx.db.latestLocation.iter()) if (older(l.recordedAt, RETENTION.locationMicros)) { ctx.db.latestLocation.id.delete(l.id); deleted++; }
  for (const r of ctx.db.consumptionSelfReport.iter()) if (older(r.createdAt, RETENTION.consumptionMicros)) { ctx.db.consumptionSelfReport.id.delete(r.id); deleted++; }
  for (const n of ctx.db.notification.iter()) if (older(n.createdAt, RETENTION.notificationMicros)) { ctx.db.notification.id.delete(n.id); deleted++; }
  for (const a of ctx.db.auditEvent.iter()) if (older(a.at, RETENTION.auditMicros)) { ctx.db.auditEvent.id.delete(a.id); deleted++; }
  let blanked = 0;
  for (const inc of ctx.db.incident.iter()) {
    if (isOpenStatus(inc.status.tag) || !inc.resolvedAt || !older(inc.resolvedAt, RETENTION.closedIncidentMicros)) continue;
    for (const e of ctx.db.incidentEvent.incidentId.filter(inc.id)) {
      if (e.detail !== '') { ctx.db.incidentEvent.id.update({ ...e, detail: '' }); blanked++; }
    }
    for (const c of ctx.db.concernReport.subject.filter(inc.subject)) {
      if (c.sessionId === inc.sessionId && c.note !== '') { ctx.db.concernReport.id.update({ ...c, note: '' }); blanked++; }
    }
  }
  return { deleted, blanked };
}

