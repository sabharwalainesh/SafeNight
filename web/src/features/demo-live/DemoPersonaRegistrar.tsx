import { useEffect, useRef } from 'react';
import { useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { reducers } from '../../module_bindings';
import { readCurrentPersona } from '../../personas';
import { useAgent } from '../agent/api';
import { useNightOut } from '../night-out/api';
import { AVATARS } from './useDemoLive';

function Registrar() {
  const { isActive, identity } = useSpacetimeDB();
  const register = useReducer(reducers.demoRegisterPersona);
  const done = useRef<string | null>(null);
  const key = identity?.toHexString() ?? null;

  useEffect(() => {
    if (!isActive || !key || done.current === key) return;
    done.current = key;
    const p = readCurrentPersona();
    register({ personaId: p.id, displayName: p.name, avatarEmoji: AVATARS[p.id] }).catch((e: unknown) => {
      // Production refuses demo reducers; that is expected and harmless.
      console.info('Demo persona registration skipped:', e instanceof Error ? e.message : e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, key]);

  return null;
}

/** Registers the current persona once per connection. Renders nothing; no-op in mock mode. */
export function DemoPersonaRegistrar() {
  const agentMocked = useAgent().mocked;
  const nightOutMocked = useNightOut().mocked;
  return agentMocked && nightOutMocked ? null : <Registrar />;
}
