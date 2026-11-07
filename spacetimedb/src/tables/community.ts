import { t, table } from 'spacetimedb/server';
import { SharingScope } from './nightout';

// ── Enums (no payload, so they can be indexed) ──────────────────────────────
export const VenueReportCategory = t.enum('VenueReportCategory', [
  'crowding',
  'blocked_exit',
  'aggressive_behavior',
  'drink_tampering',
  'water_available',
  'medical_staff',
  'lighting',
  'unsafe_pickup',
  'other',
]);
export const Confidence = t.enum('Confidence', ['unverified', 'corroborated', 'verified', 'disputed']);
export const ModerationState = t.enum('ModerationState', ['pending', 'published', 'hidden']);
export const VoteKind = t.enum('VoteKind', ['corroborate', 'dispute']);
export const ResourceType = t.enum('ResourceType', ['campus_safety', 'staffed_venue', 'medical', 'transit_stop', 'pickup_point']);
// Named `AppRoleKind` because the `app_role` table already reserves the type name `AppRole`.
export const AppRole = t.enum('AppRoleKind', ['moderator']);

// ── Tables ──────────────────────────────────────────────────────────────────

// Public: approximate venue geometry only (3 decimals ≈ 100 m). Never a person's position.
export const venue = table(
  { name: 'venue', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    approxLat: t.f64(),
    approxLng: t.f64(),
    source: t.string(),
    verifiedAt: t.timestamp().optional(),
    createdAt: t.timestamp(),
  }
);

// Public: venue-level, time-limited, moderated observations. No reporter identity here.
export const venueReport = table(
  { name: 'venue_report' },
  {
    id: t.u64().primaryKey().autoInc(),
    venueId: t.u64().index('btree'),
    category: VenueReportCategory,
    textRedacted: t.string(),
    confidence: Confidence,
    moderation: ModerationState.index('btree'),
    reportCount: t.u16(),
    disputeCount: t.u16(),
    expiresAt: t.timestamp(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Private: who filed (or corroborated by re-filing) which report. Read only through `my_venue_reports`.
export const venueReportAuthor = table(
  {
    name: 'venue_report_author',
    indexes: [{ accessor: 'byReportAuthor', algorithm: 'btree', columns: ['reportId', 'author'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    reportId: t.u64().index('btree'),
    author: t.identity().index('btree'),
    createdAt: t.timestamp(),
  }
);

// Private: one vote per voter per report.
export const venueReportVote = table(
  {
    name: 'venue_report_vote',
    indexes: [{ accessor: 'byReportVoter', algorithm: 'btree', columns: ['reportId', 'voter'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    reportId: t.u64().index('btree'),
    voter: t.identity().index('btree'),
    kind: VoteKind,
  }
);

// Private schedule table: interval sweep that hides expired reports (never deletes them).
export const venueReportExpiry = table(
  { name: 'venue_report_expiry' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Public: verified or clearly labeled demo resources. Distinct from community reports.
export const safetyResource = table(
  { name: 'safety_resource', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    type: ResourceType,
    name: t.string().unique(),
    lat: t.f64(),
    lng: t.f64(),
    hours: t.string(),
    source: t.string(),
    verifiedAt: t.timestamp(),
    createdAt: t.timestamp(),
  }
);

// Private schedule table: hourly retention sweep.
export const retentionSweep = table(
  { name: 'retention_sweep' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Private: owner-managed roles (moderators).
export const appRole = table(
  { name: 'app_role' },
  {
    identity: t.identity().primaryKey(),
    role: AppRole,
    grantedAt: t.timestamp(),
  }
);

// Private: a person's privacy defaults. Read through `my_privacy_settings`.
export const userPrivacySettings = table(
  { name: 'user_privacy_settings' },
  {
    identity: t.identity().primaryKey(),
    defaultSharingScope: SharingScope,
    defaultConsentTtlMinutes: t.u32(),
    allowBuddyAlerts: t.bool(),
    allowGroupAlerts: t.bool(),
    retainCheckinsDays: t.u16(),
    updatedAt: t.timestamp(),
  }
);
