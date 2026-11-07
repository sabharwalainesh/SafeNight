import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import type { spacetimedb } from '../schema';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/**
 * Deny an action. A throwing reducer rolls back every write in its transaction, so a
 * denial cannot leave an `audit_event` row behind; the module log (which is not
 * transactional) records it instead, and the client receives the SenderError.
 */
export function deny(ctx: Ctx, action: string, resource: string, message: string): never {
  console.warn(`deny actor=${ctx.sender.toHexString()} action=${action} resource=${resource}: ${message}`);
  throw new SenderError(message);
}

export function audit(ctx: Ctx, action: string, resource: string, decision = 'allow') {
  ctx.db.auditEvent.insert({
    id: 0n,
    actor: ctx.sender,
    action,
    resource,
    decision,
    at: ctx.timestamp,
  });
}

export function requireProfile(ctx: Ctx) {
  const profile = ctx.db.userProfile.identity.find(ctx.sender);
  if (!profile) throw new SenderError('Set up your profile first');
  return profile;
}

export function getSession(ctx: Ctx, sessionId: bigint) {
  const session = ctx.db.nightSession.id.find(sessionId);
  if (!session) throw new SenderError('Session not found');
  return session;
}

export function sessionIsOpen(session: { status: { tag: string } }): boolean {
  return session.status.tag === 'planned' || session.status.tag === 'active';
}

export function findMembership(ctx: Ctx, sessionId: bigint, userId: Identity) {
  for (const m of ctx.db.sessionMember.bySessionUser.filter([sessionId, userId])) {
    return m;
  }
  return undefined;
}

export function requireActiveMember(ctx: Ctx, sessionId: bigint, userId: Identity = ctx.sender) {
  const m = findMembership(ctx, sessionId, userId);
  if (!m || !m.active) {
    throw new SenderError(
      userId.isEqual(ctx.sender) ? 'Not a member of this session' : 'Recipient is not an active member'
    );
  }
  return m;
}

export function requireOrganizer(ctx: Ctx, session: { id: bigint; organizer: Identity }, action: string) {
  if (!session.organizer.isEqual(ctx.sender)) {
    deny(ctx, action, `night_session:${session.id}`, 'Only the organizer can do that');
  }
}

export function openDriverAssignment(ctx: Ctx, sessionId: bigint) {
  for (const a of ctx.db.driverAssignment.sessionId.filter(sessionId)) {
    if (a.endedAt === undefined) return a;
  }
  return undefined;
}
