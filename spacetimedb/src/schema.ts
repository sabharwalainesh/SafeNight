import { schema, t, table } from 'spacetimedb/server';
import {
  consentGrant,
  driverAssignment,
  invite,
  nightSession,
  sessionExpiry,
  sessionMember,
  trustedContact,
  userProfile,
} from './tables/nightout';

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

export const spacetimedb = schema(
  {
    config,
    clientPresence,
    auditEvent,
    userProfile,
    trustedContact,
    nightSession,
    invite,
    sessionMember,
    driverAssignment,
    consentGrant,
    sessionExpiry,
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
