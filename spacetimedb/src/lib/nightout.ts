import type { Identity } from 'spacetimedb';
import type { Infer } from 'spacetimedb/server';
import type { Ctx } from './auth';
import type { ConsentScope } from '../tables/nightout';
import { clearCheckinTimers } from './safety';
import { minutesAfter } from './time';

export type ConsentScopeValue = Infer<typeof ConsentScope>;
export type CloseStatus = 'ended' | 'expired';

/** Idempotent: closes a session and everything that depends on it (members, grants, driver, timers). */
export function closeSession(ctx: Ctx, sessionId: bigint, status: CloseStatus) {
  const session = ctx.db.nightSession.id.find(sessionId);
  if (!session) return;
  if (session.status.tag === 'ended' || session.status.tag === 'expired') return;
  ctx.db.nightSession.id.update({ ...session, status: { tag: status } });
  for (const m of ctx.db.sessionMember.sessionId.filter(sessionId)) {
    if (m.active) ctx.db.sessionMember.id.update({ ...m, active: false, leftAt: ctx.timestamp });
    clearCheckinTimers(ctx, sessionId, m.userId);
  }
  for (const g of ctx.db.consentGrant.sessionId.filter(sessionId)) {
    if (g.revokedAt === undefined) ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
  }
  for (const a of ctx.db.driverAssignment.sessionId.filter(sessionId)) {
    if (a.endedAt === undefined) {
      ctx.db.driverAssignment.id.update({ ...a, endedAt: ctx.timestamp, endReason: { tag: 'session_ended' } });
    }
  }
}

/** Delete the one-shot expiry rows of a session (used when it is ended before its expiresAt). */
export function clearSessionExpiry(ctx: Ctx, sessionId: bigint) {
  for (const row of ctx.db.sessionExpiry.iter()) {
    if (row.sessionId === sessionId) ctx.db.sessionExpiry.scheduledId.delete(row.scheduledId);
  }
}

/**
 * Insert a consent grant from `subject` to `recipient`, revoking any open grant with the same
 * (recipient, session, scope) first. Authorization (subject is the caller, both are active members,
 * ttl range) is the caller's responsibility.
 */
export function insertGrant(
  ctx: Ctx,
  subject: Identity,
  recipient: Identity,
  sessionId: bigint,
  scope: ConsentScopeValue,
  ttlMinutes: number
) {
  for (const g of ctx.db.consentGrant.bySubjectRecipient.filter([subject, recipient])) {
    if (g.sessionId === sessionId && g.scope.tag === scope.tag && g.revokedAt === undefined) {
      ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
    }
  }
  return ctx.db.consentGrant.insert({
    id: 0n,
    subject,
    recipient,
    sessionId,
    scope,
    startsAt: ctx.timestamp,
    expiresAt: minutesAfter(ctx.timestamp, ttlMinutes),
    revokedAt: undefined,
  });
}
