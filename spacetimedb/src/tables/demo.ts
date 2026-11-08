import { t, table } from 'spacetimedb/server';

// Private: which browser identity currently plays which judge-demo persona.
// Identities are issued per tab, so this is the only way one tab can set up a group for the others.
export const demoPersona = table(
  { name: 'demo_persona' },
  {
    personaId: t.string().primaryKey(),
    identity: t.identity().unique(),
    displayName: t.string(),
    avatarEmoji: t.string(),
    registeredAt: t.timestamp(),
  }
);

// Private: sessions created by `demo_setup_group`, so setup is idempotent and reset knows what to end.
export const demoSession = table(
  { name: 'demo_session' },
  {
    sessionId: t.u64().primaryKey(),
    createdAt: t.timestamp(),
  }
);
