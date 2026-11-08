import { SenderError } from 'spacetimedb';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import type { PersonaId } from '../../personas';

export const AVATARS: Record<PersonaId, string> = { sam: '🚗', alex: '🎉', maya: '🌿', jordan: '🌙' };
export const DEMO_PERSONA_IDS: readonly PersonaId[] = ['alex', 'sam', 'maya', 'jordan'];

function toError(e: unknown): Error {
  if (e instanceof SenderError) return new Error(e.message);
  if (e instanceof Error) return e;
  return new Error(String(e));
}

/** Registered demo personas plus the group reducers. Live (SpacetimeDB) mode only. */
export function useDemoLive() {
  const [rows, ready] = useTable(tables.demoPersonas);
  const setup = useReducer(reducers.demoSetupGroup);
  const reset = useReducer(reducers.demoResetGroup);
  const registered = new Set<string>(rows.map((r) => r.personaId));
  return {
    ready,
    registered,
    allRegistered: DEMO_PERSONA_IDS.every((id) => registered.has(id)),
    setupGroup: (name: string) => setup({ name }).catch((e: unknown) => Promise.reject(toError(e))),
    resetGroup: () => reset().catch((e: unknown) => Promise.reject(toError(e))),
  };
}
