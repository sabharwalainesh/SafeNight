import { t } from 'spacetimedb/server';
import { clientPresence, spacetimedb } from '../schema';
import { DEFAULT_NEMOTRON_MODEL, MODULE_VERSION } from '../lib/constants';
import { envOf } from '../lib/env';

// Shared across all subscribers: who is connected right now.
export const onlineMembers = spacetimedb.anonymousView(
  { name: 'online_members', public: true },
  t.array(clientPresence.rowType),
  ctx => ctx.from.clientPresence.where(p => p.online.eq(true))
);

// Note: the row type name must differ from the PascalCase view name ('RuntimeStatus'),
// otherwise the module definition contains two types with the same name.
const runtimeStatusRow = t.row('RuntimeStatusRow', {
  id: t.u8().primaryKey(),
  appEnv: t.string(),
  nemotronMode: t.string(),
  nemotronModel: t.string(),
  messagingMode: t.string(),
  moduleVersion: t.string(),
});

// Tells clients whether external integrations are live or simulated. Never exposes secret values.
export const runtimeStatus = spacetimedb.anonymousView(
  { name: 'runtime_status', public: true },
  t.array(runtimeStatusRow),
  ctx => {
    const env = envOf(ctx);
    const messagingLive = Boolean(
      env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
    );
    return [
      {
        id: 0,
        appEnv: env.APP_ENV ?? 'development',
        nemotronMode: env.NEMOTRON_API_KEY ? 'live' : 'simulated',
        nemotronModel: env.NEMOTRON_MODEL ?? DEFAULT_NEMOTRON_MODEL,
        messagingMode: messagingLive ? 'live' : 'simulated',
        moduleVersion: MODULE_VERSION,
      },
    ];
  }
);
