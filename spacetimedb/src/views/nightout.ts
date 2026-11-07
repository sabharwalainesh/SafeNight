import { t, type Infer } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import { spacetimedb } from '../schema';
import {
  consentGrant,
  DriverStatus,
  invite,
  MemberRole,
  nightSession,
  SharingScope,
  trustedContact,
} from '../tables/nightout';

// Sessions where the caller is an active member. Query-builder semijoin: filters on the
// membership side, returns night_session rows, evaluated incrementally by the query engine.
export const mySessions = spacetimedb.view(
  { name: 'my_sessions', public: true },
  t.array(nightSession.rowType),
  ctx =>
    ctx.from.sessionMember
      .where(m => m.userId.eq(ctx.sender).and(m.active.eq(true)))
      .rightSemijoin(ctx.from.nightSession, (m, s) => m.sessionId.eq(s.id))
);

const rosterRow = t.row('RosterRow', {
  memberId: t.u64().primaryKey(),
  sessionId: t.u64(),
  userId: t.identity(),
  displayName: t.string(),
  avatarEmoji: t.string(),
  role: MemberRole,
  sharingScope: SharingScope,
  driverStatus: DriverStatus,
  joinedAt: t.timestamp(),
  active: t.bool(),
});

type RosterRowValue = Infer<typeof rosterRow>;

// One row per member (active or departed) of every session the caller is an active member of.
export const myRosters = spacetimedb.view(
  { name: 'my_rosters', public: true },
  t.array(rosterRow),
  ctx => {
    const rows: RosterRowValue[] = [];
    const seenSessions = new Set<bigint>();
    for (const mine of ctx.db.sessionMember.userId.filter(ctx.sender)) {
      if (!mine.active || seenSessions.has(mine.sessionId)) continue;
      seenSessions.add(mine.sessionId);
      let driverId: Identity | undefined;
      let accepted = false;
      for (const a of ctx.db.driverAssignment.sessionId.filter(mine.sessionId)) {
        if (a.endedAt === undefined) {
          driverId = a.driverId;
          accepted = a.acceptedAt !== undefined;
        }
      }
      for (const m of ctx.db.sessionMember.sessionId.filter(mine.sessionId)) {
        const profile = ctx.db.userProfile.identity.find(m.userId);
        const isDriver = driverId !== undefined && driverId.isEqual(m.userId);
        rows.push({
          memberId: m.id,
          sessionId: m.sessionId,
          userId: m.userId,
          displayName: profile?.displayName ?? 'Unknown',
          avatarEmoji: profile?.avatarEmoji ?? '',
          role: m.role,
          sharingScope: m.sharingScope,
          driverStatus: { tag: isDriver ? (accepted ? 'accepted' : 'volunteered') : 'none' },
          joinedAt: m.joinedAt,
          active: m.active,
        });
      }
    }
    return rows;
  }
);

// Invites for sessions the caller organizes. The invite table itself is private.
export const myInvites = spacetimedb.view(
  { name: 'my_invites', public: true },
  t.array(invite.rowType),
  ctx => {
    const rows = [];
    for (const s of ctx.db.nightSession.organizer.filter(ctx.sender)) {
      for (const inv of ctx.db.invite.sessionId.filter(s.id)) rows.push(inv);
    }
    return rows;
  }
);

// Grants where the caller is the subject or the recipient.
export const myConsents = spacetimedb.view(
  { name: 'my_consents', public: true },
  t.array(consentGrant.rowType),
  ctx => {
    const seen = new Set<bigint>();
    const rows = [];
    for (const g of ctx.db.consentGrant.subject.filter(ctx.sender)) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        rows.push(g);
      }
    }
    for (const g of ctx.db.consentGrant.recipient.filter(ctx.sender)) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        rows.push(g);
      }
    }
    return rows;
  }
);

// The caller's own trusted contacts.
export const myContacts = spacetimedb.view(
  { name: 'my_contacts', public: true },
  t.array(trustedContact.rowType),
  ctx => Array.from(ctx.db.trustedContact.owner.filter(ctx.sender))
);
