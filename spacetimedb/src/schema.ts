import { profilePhoto } from './tables/photos';
import { schema, t, table } from 'spacetimedb/server';
import {
  consentGrant,
  driverAssignment,
  invite,
  nightSession,
  sessionExpiry,
  sessionMember,
  trustedContact,
  userPhone,
  userProfile,
} from './tables/nightout';
import {
  checkin,
  checkinTimer,
  concernReport,
  consumptionSelfReport,
  incident,
  incidentEvent,
  incidentParticipant,
  latestLocation,
  locationSweep,
  locationUpdate,
  safetyAlert,
} from './tables/safety';
import {
  agentAction,
  agentJob,
  agentPlan,
  agentWake,
  followupTimer,
  notification,
  notificationDispatch,
  ridePlan,
} from './tables/agent';
import {
  appRole,
  retentionSweep,
  safetyResource,
  userPrivacySettings,
  venue,
  venueReport,
  venueReportAuthor,
  venueReportExpiry,
  venueReportVote,
} from './tables/community';
import { demoPersona, demoSession } from './tables/demo';
import { meetup, meetupExpiry, meetupPosition } from './tables/meetup';

// Private: single row recording who published the database (module owner).
export const config = table(
  { name: 'config' },
  {
    id: t.u8().primaryKey(),
    owner: t.identity(),
    createdAt: t.timestamp(),
  }
);

// Public: live connection presence per identity.
export const clientPresence = table(
  { name: 'client_presence', public: true },
  {
    identity: t.identity().primaryKey(),
    online: t.bool(),
    lastSeenAt: t.timestamp(),
    connectionCount: t.u32(),
  }
);

// Private: audit trail of policy-relevant actions.
export const auditEvent = table(
  { name: 'audit_event' },
  {
    id: t.u64().primaryKey().autoInc(),
    actor: t.identity().index('btree'),
    action: t.string(),
    resource: t.string(),
    decision: t.string(),
    at: t.timestamp(),
  }
);

// Private: what module version is published. Read by `runtime_status` so the view's read set
// includes a table row and re-evaluates after every publish + `ensure_schedules`.
export const moduleMeta = table(
  { name: 'module_meta' },
  {
    id: t.u8().primaryKey(),
    moduleVersion: t.string(),
    publishedAt: t.timestamp(),
  }
);

export const spacetimedb = schema(
  {
    config,
    moduleMeta,
    clientPresence,
    auditEvent,
    userProfile,
    profilePhoto,
    userPhone,
    trustedContact,
    nightSession,
    invite,
    sessionMember,
    driverAssignment,
    consentGrant,
    sessionExpiry,
    locationUpdate,
    latestLocation,
    checkin,
    consumptionSelfReport,
    concernReport,
    incident,
    incidentEvent,
    incidentParticipant,
    safetyAlert,
    checkinTimer,
    locationSweep,
    agentJob,
    agentPlan,
    agentAction,
    agentWake,
    followupTimer,
    notification,
    notificationDispatch,
    ridePlan,
    venue,
    venueReport,
    venueReportAuthor,
    venueReportVote,
    venueReportExpiry,
    safetyResource,
    retentionSweep,
    appRole,
    userPrivacySettings,
    demoPersona,
    demoSession,
    meetup,
    meetupExpiry,
    meetupPosition,
  },
  {
    env: {
      NEMOTRON_API_KEY: t.string().optional(),
      NEMOTRON_MODEL: t.string().optional(),
      NEMOTRON_BASE_URL: t.string().optional(),
      TWILIO_ACCOUNT_SID: t.string().optional(),
      TWILIO_AUTH_TOKEN: t.string().optional(),
      TWILIO_FROM_NUMBER: t.string().optional(),
      APP_ENV: t.enum('AppEnv', ['development', 'demo', 'production']).optional(),
    },
  }
);
