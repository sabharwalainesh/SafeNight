import { t, table } from 'spacetimedb/server';

// ── Enums (no payload, so they can be indexed) ──────────────────────────────
export const ContactRole = t.enum('ContactRole', ['buddy', 'backup_buddy', 'emergency']);
export const SessionStatus = t.enum('SessionStatus', ['planned', 'active', 'ended', 'expired']);
export const MemberRole = t.enum('MemberRole', ['organizer', 'participant']);
export const SharingScope = t.enum('SharingScope', ['none', 'approximate', 'precise']);
export const DriverEndReason = t.enum('DriverEndReason', [
  'none',
  'cannot_drive',
  'replaced',
  'session_ended',
  'left_session',
]);
export const ConsentScope = t.enum('ConsentScope', [
  'location_precise',
  'location_approximate',
  'checkins',
  'concern_reports',
  'messaging',
]);
export const DriverStatus = t.enum('DriverStatus', ['none', 'volunteered', 'accepted']);

// ── Tables ──────────────────────────────────────────────────────────────────

// Public: display identity for members. No contact details here.
export const userProfile = table(
  { name: 'user_profile', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    avatarEmoji: t.string(),
    phoneVerified: t.bool(),
    createdAt: t.timestamp(),
  }
);

// Private: a person's safety buddies and backup ladder.
export const trustedContact = table(
  {
    name: 'trusted_contact',
    indexes: [{ accessor: 'byOwnerPriority', algorithm: 'btree', columns: ['owner', 'priority'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    contact: t.identity(),
    role: ContactRole,
    messagingConsent: t.bool(),
    priority: t.u8(),
    createdAt: t.timestamp(),
  }
);

// Public: a temporary Night Out group.
export const nightSession = table(
  { name: 'night_session', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    organizer: t.identity().index('btree'),
    name: t.string(),
    venueHint: t.string(),
    startsAt: t.timestamp(),
    expiresAt: t.timestamp(),
    status: SessionStatus.index('btree'),
    checkinIntervalMinutes: t.u16(),
    createdAt: t.timestamp(),
  }
);

// Private: invite codes are never broadcast; organizers read them through `my_invites`.
export const invite = table(
  { name: 'invite' },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    code: t.string().unique(),
    createdBy: t.identity(),
    expiresAt: t.timestamp(),
    revokedAt: t.timestamp().optional(),
    maxUses: t.u8(),
    uses: t.u8(),
  }
);

// Public: membership and per-member sharing state. `active` mirrors `leftAt === undefined`.
export const sessionMember = table(
  {
    name: 'session_member',
    public: true,
    indexes: [{ accessor: 'bySessionUser', algorithm: 'btree', columns: ['sessionId', 'userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    userId: t.identity().index('btree'),
    role: MemberRole,
    joinedAt: t.timestamp(),
    leftAt: t.timestamp().optional(),
    sharingScope: SharingScope,
    active: t.bool(),
  }
);

// Public: designated-driver volunteering and explicit acceptance.
export const driverAssignment = table(
  { name: 'driver_assignment', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    driverId: t.identity().index('btree'),
    volunteeredAt: t.timestamp(),
    acceptedAt: t.timestamp().optional(),
    endedAt: t.timestamp().optional(),
    endReason: DriverEndReason,
  }
);

// Private: scoped, time-limited, revocable consent from subject to recipient.
export const consentGrant = table(
  {
    name: 'consent_grant',
    indexes: [
      { accessor: 'bySubjectRecipient', algorithm: 'btree', columns: ['subject', 'recipient'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    subject: t.identity().index('btree'),
    recipient: t.identity().index('btree'),
    sessionId: t.u64().index('btree'),
    scope: ConsentScope,
    startsAt: t.timestamp(),
    expiresAt: t.timestamp(),
    revokedAt: t.timestamp().optional(),
  }
);

// Private schedule table: fires `expire_session` at the session's expiresAt.
export const sessionExpiry = table(
  { name: 'session_expiry' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    sessionId: t.u64(),
  }
);
