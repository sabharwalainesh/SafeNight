import { t, table } from 'spacetimedb/server';

// ── Enums (no payload, so they can be indexed) ──────────────────────────────
export const LocationSource = t.enum('LocationSource', ['device', 'simulated']);
export const CheckinKind = t.enum('CheckinKind', ['okay', 'need_friend', 'need_ride', 'unwell', 'emergency', 'home']);
export const ConsumptionLevel = t.enum('ConsumptionLevel', ['none', 'some', 'impaired_feeling']);
export const ConcernCategory = t.enum('ConcernCategory', ['possible_consumption', 'separated', 'unwell', 'unsafe']);
export const IncidentKind = t.enum('IncidentKind', [
  'possible_impaired_driving',
  'help_requested',
  'missed_checkin',
  'feeling_unsafe',
]);
export const Severity = t.enum('Severity', ['info', 'elevated', 'urgent']);
export const IncidentStatus = t.enum('IncidentStatus', [
  'open',
  'acknowledged',
  'assistance_underway',
  'transport_arranged',
  'awaiting_home_confirmation',
  'resolved',
  'cancelled',
  'handed_off',
]);
export const ParticipantRole = t.enum('ParticipantRole', ['subject', 'reporter', 'buddy', 'backup', 'organizer']);
export const AlertKind = t.enum('AlertKind', ['no_driving_warning', 'help_requested', 'ack_requested', 'incident_update']);

// ── Tables ──────────────────────────────────────────────────────────────────

// Private: location history (purged by the sweep). Never exposed directly.
export const locationUpdate = table(
  {
    name: 'location_update',
    indexes: [{ accessor: 'bySessionUser', algorithm: 'btree', columns: ['sessionId', 'userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    userId: t.identity().index('btree'),
    lat: t.f64(),
    lng: t.f64(),
    accuracyM: t.f32(),
    recordedAt: t.timestamp(),
    expiresAt: t.timestamp(),
    source: LocationSource,
  }
);

// Private: one row per (session, member) with the newest location, so views can use index lookups.
export const latestLocation = table(
  {
    name: 'latest_location',
    indexes: [{ accessor: 'bySessionUser', algorithm: 'btree', columns: ['sessionId', 'userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    sessionId: t.u64().index('btree'),
    userId: t.identity().index('btree'),
    lat: t.f64(),
    lng: t.f64(),
    accuracyM: t.f32(),
    recordedAt: t.timestamp(),
    expiresAt: t.timestamp(),
    source: LocationSource,
  }
);

// Private: one-tap wellness states.
export const checkin = table(
  {
    name: 'checkin',
    indexes: [{ accessor: 'bySessionUser', algorithm: 'btree', columns: ['sessionId', 'userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    userId: t.identity().index('btree'),
    kind: CheckinKind,
    note: t.string(),
    createdAt: t.timestamp(),
  }
);

// Private: optional self-report. Only the deterministic driver warning ever reads it.
export const consumptionSelfReport = table(
  { name: 'consumption_self_report' },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.identity().index('btree'),
    sessionId: t.u64().index('btree'),
    level: ConsumptionLevel,
    shareWithBuddy: t.bool(),
    createdAt: t.timestamp(),
  }
);

// Private: a trusted member's concern about another member. Never public.
export const concernReport = table(
  { name: 'concern_report' },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    reporter: t.identity(),
    subject: t.identity().index('btree'),
    category: ConcernCategory,
    note: t.string(),
    createdAt: t.timestamp(),
    dedupeKey: t.string().unique(),
  }
);

// Private: durable incident state. Exposed to participants through `my_incidents`.
export const incident = table(
  { name: 'incident' },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    subject: t.identity().index('btree'),
    kind: IncidentKind,
    severity: Severity,
    status: IncidentStatus.index('btree'),
    openedBy: t.identity(),
    openedAt: t.timestamp(),
    resolvedAt: t.timestamp().optional(),
    resolvedBy: t.identity().optional(),
    // F1: the subject asked for someone to come to them ("Come to me").
    meetupWanted: t.bool().default(false),
  }
);

// Private: the incident timeline.
export const incidentEvent = table(
  { name: 'incident_event' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    at: t.timestamp(),
    actor: t.identity(),
    kind: t.string(),
    detail: t.string(),
    simulated: t.bool(),
  }
);

// Private: who is involved in an incident and whether they acknowledged.
export const incidentParticipant = table(
  {
    name: 'incident_participant',
    indexes: [{ accessor: 'byIncidentUser', algorithm: 'btree', columns: ['incidentId', 'userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    userId: t.identity().index('btree'),
    role: ParticipantRole,
    acknowledgedAt: t.timestamp().optional(),
  }
);

// Public EVENT table: rows exist only for the committing transaction and are broadcast to
// subscribers, then deleted. A row-level-security filter limits delivery to `recipient`.
export const safetyAlert = table(
  { name: 'safety_alert', public: true, event: true },
  {
    recipient: t.identity().index('btree'),
    incidentId: t.u64(),
    kind: AlertKind,
    message: t.string(),
    at: t.timestamp(),
  }
);

// Private schedule table: one-shot per member, re-armed by every check-in.
export const checkinTimer = table(
  { name: 'checkin_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    sessionId: t.u64(),
    userId: t.identity().index('btree'),
    armedAt: t.timestamp(),
  }
);

// Private schedule table: interval maintenance (expired locations and consent grants).
export const locationSweep = table(
  { name: 'location_sweep' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);
