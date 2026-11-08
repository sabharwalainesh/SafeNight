import { t, table } from 'spacetimedb/server';

export const MeetupStatus = t.enum('MeetupStatus', ['coming', 'arrived', 'cancelled']);

// Private: one "Come to me" pairing (requester = incident subject, helper = someone coming).
// Exposed only through the per-user `my_meetups` view.
export const meetup = table(
  { name: 'meetup' },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    sessionId: t.u64().index('btree'),
    requester: t.identity().index('btree'),
    helper: t.identity().index('btree'),
    status: MeetupStatus,
    startedAt: t.timestamp(),
    arrivedAt: t.timestamp().optional(),
    expiresAt: t.timestamp(),
  }
);

// Private schedule: expire stale `coming` meetups and revoke their grants.
export const meetupExpiry = table(
  { name: 'meetup_expiry' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Private, ephemeral: the latest high-rate position of each party of a `coming` meetup.
// One row per (meetup, user), updated in place so every fix is a single small row delta pushed to the
// trip partner over the subscription (no history rows, unlike `location_update`). Deleted when the
// meetup ends. Exposed only through `my_meetup_positions` (the other party, while the precise grant holds).
export const meetupPosition = table(
  { name: 'meetup_position' },
  {
    id: t.u64().primaryKey().autoInc(),
    meetupId: t.u64().index('btree'),
    userId: t.identity(),
    lat: t.f64(),
    lng: t.f64(),
    accuracyM: t.f32(),
    /** GPS course over ground in degrees from north, when moving. */
    headingDeg: t.f32().optional(),
    /** Ground speed in m/s, when the device reports it. */
    speedMps: t.f32().optional(),
    recordedAt: t.timestamp(),
  }
);
