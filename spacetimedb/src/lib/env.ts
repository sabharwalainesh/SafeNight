import type { InferSchema } from 'spacetimedb/server';
import type { spacetimedb } from '../schema';

type Env = InferSchema<typeof spacetimedb>['env'];
type EnvValues = Partial<Record<keyof Env, string>>;
const KEYS: (keyof Env)[] = [
  'NEMOTRON_API_KEY',
  'NEMOTRON_MODEL',
  'NEMOTRON_BASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'APP_ENV',
];

/**
 * Read declared environment values from any context.
 * On a published database `ctx.env` is a host-backed proxy. The in-memory unit-test harness
 * does not provide `env_get`: `ctx.env` is undefined in reducer contexts and throws inside
 * procedure transactions. Both cases mean "nothing configured", which is also the simulated
 * default, so every read is guarded.
 */
export function envOf(ctx: { env?: unknown }): EnvValues {
  let env: Record<string, unknown> | undefined;
  try {
    env = ctx.env as Record<string, unknown> | undefined;
  } catch {
    return {};
  }
  if (!env) return {};
  const out: EnvValues = {};
  for (const key of KEYS) {
    try {
      const v = env[key];
      if (typeof v === 'string') out[key] = v;
    } catch {
      /* unsupported host call in tests: treat as unset */
    }
  }
  return out;
}
