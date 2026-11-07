import type { InferSchema } from 'spacetimedb/server';
import type { spacetimedb } from '../schema';

type Env = InferSchema<typeof spacetimedb>['env'];

/**
 * Read declared environment values from any context.
 * On a published database `ctx.env` is a host-backed proxy. The in-memory unit-test
 * harness does not provide `env_get`, so `ctx.env` is undefined there; treat that as
 * "nothing configured", which is also the correct default for the simulated mode.
 */
export function envOf(ctx: { env?: unknown }): Partial<Record<keyof Env, string>> {
  const env = ctx.env as Partial<Record<keyof Env, string>> | undefined;
  return env ?? {};
}
