import { ScheduleAt, type Identity } from 'spacetimedb';
import type { Ctx } from './auth';
import { isBefore } from './time';

export const MEETUP_TTL_MINUTES = 60;
export const MEETUP_EXPIRY_INTERVAL_MICROS = 60n * 1_000_000n;

export function ensureMeetupExpiryScheduled(ctx: Ctx) {
  if (ctx.db.meetupExpiry.count() > 0n) return false;
  ctx.db.meetupExpiry.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(MEETUP_EXPIRY_INTERVAL_MICROS) });
  return true;
}

/** The helper's still-`coming` meetup for an incident, if any. */
export function findComingMeetup(ctx: Ctx, incidentId: bigint, helper: Identity) {
  for (const mu of ctx.db.meetup.incidentId.filter(incidentId)) {
    if (mu.status.tag === 'coming' && mu.helper.isEqual(helper)) return mu;
  }
  return undefined;
}

/** True when `who` is requester or helper of a `coming` meetup in this session (not yet expired). */
export function hasActiveMeetup(ctx: Ctx, sessionId: bigint, who: Identity): boolean {
  for (const mu of ctx.db.meetup.sessionId.filter(sessionId)) {
    if (mu.status.tag !== 'coming' || !isBefore(ctx.timestamp, mu.expiresAt)) continue;
    if (mu.requester.isEqual(who) || mu.helper.isEqual(who)) return true;
  }
  return false;
}

/** Drop the live compass positions of a meetup (it ended, or its grants were revoked). */
export function clearMeetupPositions(ctx: Ctx, meetupId: bigint): void {
  for (const p of [...ctx.db.meetupPosition.meetupId.filter(meetupId)]) ctx.db.meetupPosition.id.delete(p.id);
}

/** Revoke only the two location_precise grants a meetup created (requester↔helper in its session). */
export function revokeMeetupGrants(ctx: Ctx, mu: { id?: bigint; sessionId: bigint; requester: Identity; helper: Identity }) {
  if (mu.id !== undefined) clearMeetupPositions(ctx, mu.id);
  for (const [subject, recipient] of [
    [mu.requester, mu.helper],
    [mu.helper, mu.requester],
  ] as const) {
    for (const g of ctx.db.consentGrant.bySubjectRecipient.filter([subject, recipient])) {
      if (g.sessionId === mu.sessionId && g.scope.tag === 'location_precise' && g.revokedAt === undefined) {
        ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
      }
    }
  }
}

/**
 * An incident that closes (resolved, cancelled, handed off, demo reset) takes its in-progress meetups
 * with it: status cancelled, the two precise-location grants revoked. Otherwise the helper would stay
 * "on their way" forever and could never accept the next request.
 */
export function closeMeetupsForIncident(ctx: Ctx, incidentId: bigint): number {
  let n = 0;
  for (const mu of ctx.db.meetup.incidentId.filter(incidentId)) {
    if (mu.status.tag !== 'coming') continue;
    ctx.db.meetup.id.update({ ...mu, status: { tag: 'cancelled' } });
    revokeMeetupGrants(ctx, mu);
    n++;
  }
  return n;
}
