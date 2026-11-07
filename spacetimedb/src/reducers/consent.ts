import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { ConsentScope, SharingScope } from '../tables/nightout';
import { audit, deny, getSession, requireActiveMember, sessionIsOpen } from '../lib/auth';
import { MAX_TTL_MINUTES } from '../lib/constants';
import { minutesAfter } from '../lib/time';

export const grantConsent = spacetimedb.reducer(
  { recipient: t.identity(), sessionId: t.u64(), scope: ConsentScope, ttlMinutes: t.u32() },
  (ctx, { recipient, sessionId, scope, ttlMinutes }) => {
    const session = getSession(ctx, sessionId);
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    requireActiveMember(ctx, sessionId);
    if (recipient.isEqual(ctx.sender)) throw new SenderError('Cannot grant consent to yourself');
    requireActiveMember(ctx, sessionId, recipient);
    if (ttlMinutes < 1 || ttlMinutes > MAX_TTL_MINUTES) {
      throw new SenderError('ttlMinutes must be between 1 and 1440');
    }
    // Replace an existing open grant for the same (recipient, session, scope).
    for (const g of ctx.db.consentGrant.bySubjectRecipient.filter([ctx.sender, recipient])) {
      if (g.sessionId === sessionId && g.scope.tag === scope.tag && g.revokedAt === undefined) {
        ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
      }
    }
    const grant = ctx.db.consentGrant.insert({
      id: 0n,
      subject: ctx.sender,
      recipient,
      sessionId,
      scope,
      startsAt: ctx.timestamp,
      expiresAt: minutesAfter(ctx.timestamp, ttlMinutes),
      revokedAt: undefined,
    });
    audit(ctx, 'grant_consent', `consent_grant:${grant.id}:${scope.tag}`);
  }
);

export const revokeConsent = spacetimedb.reducer({ grantId: t.u64() }, (ctx, { grantId }) => {
  const g = ctx.db.consentGrant.id.find(grantId);
  if (!g) throw new SenderError('Consent grant not found');
  if (!g.subject.isEqual(ctx.sender)) {
    deny(ctx, 'revoke_consent', `consent_grant:${grantId}`, 'Only the subject can revoke consent');
  }
  if (g.revokedAt !== undefined) return; // idempotent
  ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
  audit(ctx, 'revoke_consent', `consent_grant:${grantId}`);
});

// Only ever changes the caller's own row: an organizer cannot force sharing on anyone.
export const setSharingScope = spacetimedb.reducer(
  { sessionId: t.u64(), scope: SharingScope },
  (ctx, { sessionId, scope }) => {
    const m = requireActiveMember(ctx, sessionId);
    ctx.db.sessionMember.id.update({ ...m, sharingScope: scope });
  }
);
