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
