import { createContext, useMemo, type ReactNode } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../../module_bindings';
import { NIGHT_OUT_SOURCE } from '../night-out/NightOutProvider';
import type { PersonaMap } from './snapshot';

/** identity hex → persona id, from the server's demo_personas registry (live mode). */
export const PersonaMapContext = createContext<PersonaMap>({});

function LivePersonaMap({ children }: { children?: ReactNode }) {
  const [rows] = useTable(tables.demoPersonas);
  const map = useMemo(() => Object.fromEntries(rows.map(r => [r.identity.toHexString(), r.personaId])), [rows]);
  return <PersonaMapContext.Provider value={map}>{children}</PersonaMapContext.Provider>;
}

export function PersonaMapProvider({ children }: { children?: ReactNode }) {
  return NIGHT_OUT_SOURCE === 'live' ? <LivePersonaMap>{children}</LivePersonaMap> : <>{children}</>;
}
