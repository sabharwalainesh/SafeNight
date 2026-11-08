import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { sessionExpiry } from '../tables/nightout';
import {
  audit,
  deny,
  findMembership,
  getSession,
  openDriverAssignment,
  requireActiveMember,
  requireOrganizer,
  requireProfile,
  sessionIsOpen,
  type Ctx,
} from '../lib/auth';
import { INVITE_ALPHABET, INVITE_CODE_LENGTH, MAX_TTL_MINUTES } from '../lib/constants';
import { isAtOrBefore, minutesAfter } from '../lib/time';
import { ScheduleAt } from 'spacetimedb';
import { armCheckinTimer, clearCheckinTimers } from '../lib/safety';
import { clearSessionExpiry, closeSession } from '../lib/nightout';

export const createSession = spacetimedb.reducer(
  {
    name: t.string(),
    venueHint: t.string(),
    startsAt: t.timestamp(),
    expiresAt: t.timestamp(),
    checkinIntervalMinutes: t.u16(),
  },
  (ctx, { name, venueHint, startsAt, expiresAt, checkinIntervalMinutes }) => {
    requireProfile(ctx);
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new SenderError('Session name cannot be empty');
    if (isAtOrBefore(expiresAt, ctx.timestamp)) throw new SenderError('Session end must be in the future');
    if (isAtOrBefore(expiresAt, startsAt)) throw new SenderError('Session end must be after its start');
    const status = isAtOrBefore(startsAt, ctx.timestamp) ? 'active' : 'planned';
    const session = ctx.db.nightSession.insert({
      id: 0n,
      organizer: ctx.sender,
      name: trimmed,
      venueHint,
      startsAt,
      expiresAt,
      status: { tag: status },
      checkinIntervalMinutes,
      createdAt: ctx.timestamp,
    });
    ctx.db.sessionMember.insert({
      id: 0n,
      sessionId: session.id,
      userId: ctx.sender,
      role: { tag: 'organizer' },
      joinedAt: ctx.timestamp,
      leftAt: undefined,
      sharingScope: { tag: 'none' },
      active: true,
    });
    ctx.db.sessionExpiry.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(expiresAt.microsSinceUnixEpoch),
      sessionId: session.id,
    });
    armCheckinTimer(ctx, session.id, ctx.sender);
    audit(ctx, 'create_session', `night_session:${session.id}`);
  }
);

function generateCode(ctx: Ctx): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_ALPHABET[ctx.random.integerInRange(0, INVITE_ALPHABET.length - 1)];
    }
    if (!ctx.db.invite.code.find(code)) return code;
  }
  throw new Error('Could not generate a unique invite code');
}

export const createInvite = spacetimedb.reducer(
  { sessionId: t.u64(), ttlMinutes: t.u32(), maxUses: t.u8() },
  (ctx, { sessionId, ttlMinutes, maxUses }) => {
    const session = getSession(ctx, sessionId);
    requireOrganizer(ctx, session, 'create_invite');
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    if (ttlMinutes < 1 || ttlMinutes > MAX_TTL_MINUTES) {
      throw new SenderError('ttlMinutes must be between 1 and 1440');
    }
    if (maxUses < 1) throw new SenderError('maxUses must be at least 1');
    ctx.db.invite.insert({
      id: 0n,
      sessionId,
      code: generateCode(ctx),
      createdBy: ctx.sender,
      expiresAt: minutesAfter(ctx.timestamp, ttlMinutes),
      revokedAt: undefined,
      maxUses,
      uses: 0,
    });
  }
);

export const revokeInvite = spacetimedb.reducer({ inviteId: t.u64() }, (ctx, { inviteId }) => {
  const inv = ctx.db.invite.id.find(inviteId);
  if (!inv) throw new SenderError('Invite not found');
  const session = getSession(ctx, inv.sessionId);
  requireOrganizer(ctx, session, 'revoke_invite');
  if (inv.revokedAt !== undefined) return;
  ctx.db.invite.id.update({ ...inv, revokedAt: ctx.timestamp });
  audit(ctx, 'revoke_invite', `invite:${inviteId}`);
});

export const joinSession = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  requireProfile(ctx);
  const inv = ctx.db.invite.code.find(code.trim().toUpperCase());
  if (!inv) throw new SenderError('Invalid invite code');
  if (inv.revokedAt !== undefined) throw new SenderError('Invite was revoked');
  if (isAtOrBefore(inv.expiresAt, ctx.timestamp)) throw new SenderError('Invite has expired');
  if (inv.uses >= inv.maxUses) throw new SenderError('Invite has no uses left');
  const session = getSession(ctx, inv.sessionId);
  if (!sessionIsOpen(session)) throw new SenderError('Session is not active');

  const existing = findMembership(ctx, session.id, ctx.sender);
  if (existing?.active) throw new SenderError('Already a member');
  if (existing) {
    ctx.db.sessionMember.id.update({
      ...existing,
      active: true,
      leftAt: undefined,
      joinedAt: ctx.timestamp,
      role: { tag: 'participant' },
      sharingScope: { tag: 'none' },
    });
  } else {
    ctx.db.sessionMember.insert({
      id: 0n,
      sessionId: session.id,
      userId: ctx.sender,
      role: { tag: 'participant' },
      joinedAt: ctx.timestamp,
      leftAt: undefined,
      sharingScope: { tag: 'none' },
      active: true,
    });
  }
  ctx.db.invite.id.update({ ...inv, uses: inv.uses + 1 });
  armCheckinTimer(ctx, session.id, ctx.sender);
  audit(ctx, 'join_session', `night_session:${session.id}`);
});

export const leaveSession = spacetimedb.reducer({ sessionId: t.u64() }, (ctx, { sessionId }) => {
  const session = getSession(ctx, sessionId);
  const m = requireActiveMember(ctx, sessionId);
  if (session.organizer.isEqual(ctx.sender) && sessionIsOpen(session)) {
    throw new SenderError('Organizer must end the session instead');
  }
  ctx.db.sessionMember.id.update({ ...m, active: false, leftAt: ctx.timestamp });
  clearCheckinTimers(ctx, sessionId, ctx.sender);
  const a = openDriverAssignment(ctx, sessionId);
  if (a && a.driverId.isEqual(ctx.sender)) {
    ctx.db.driverAssignment.id.update({ ...a, endedAt: ctx.timestamp, endReason: { tag: 'left_session' } });
  }
  // Leaving revokes every grant the caller gave or received for this session.
  for (const g of ctx.db.consentGrant.sessionId.filter(sessionId)) {
    if (g.revokedAt === undefined && (g.subject.isEqual(ctx.sender) || g.recipient.isEqual(ctx.sender))) {
      ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
    }
  }
  audit(ctx, 'leave_session', `night_session:${sessionId}`);
});

export const endSession = spacetimedb.reducer({ sessionId: t.u64() }, (ctx, { sessionId }) => {
  const session = getSession(ctx, sessionId);
  requireOrganizer(ctx, session, 'end_session');
  if (!sessionIsOpen(session)) return;
  closeSession(ctx, sessionId, 'ended');
  clearSessionExpiry(ctx, sessionId);
  audit(ctx, 'end_session', `night_session:${sessionId}`);
});

// Scheduler-only (private): fires at the session's expiresAt.
export const expireSession = spacetimedb.reducer(
  { onSchedule: sessionExpiry },
  { arg: sessionExpiry.rowType },
  (ctx, { arg }) => {
    closeSession(ctx, arg.sessionId, 'expired');
  }
);

// Unused-guard for `deny` import in files that only use it conditionally.
void deny;
