import { useEffect, useRef, type ReactNode } from 'react';
import { useReducer, useSpacetimeDB } from 'spacetimedb/react';
import type { Persona } from '../personas';
import { AVATARS, AgentLiveProvider, CurrentSessionProvider, NightOutLiveProvider, ProfileLiveProvider, SafetyLiveProvider, reducers } from '../web';

/** Registers this device's persona with the server once per identity (judge demo helper). */
function PersonaRegistrar({ persona }: { persona: Persona }) {
  const { isActive, identity } = useSpacetimeDB();
  const register = useReducer(reducers.demoRegisterPersona);
  const done = useRef<string | null>(null);
  const key = identity?.toHexString() ?? null;
  useEffect(() => {
    if (!isActive || !key || done.current === key) return;
    done.current = key;
    register({ personaId: persona.id, displayName: persona.name, avatarEmoji: AVATARS[persona.id] }).catch((e: unknown) => {
      console.info('Demo persona registration skipped:', e instanceof Error ? e.message : e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, key]);
  return null;
}

/** The web client's live data layer, unchanged, on top of the SpacetimeDB React provider. */
export function LiveProviders({ persona, children }: { persona: Persona; children?: ReactNode }) {
  return (
    <NightOutLiveProvider displayName={persona.name} avatarEmoji={AVATARS[persona.id]}>
      <CurrentSessionProvider>
        <SafetyLiveProvider>
          <AgentLiveProvider>
            <ProfileLiveProvider>
              <PersonaRegistrar persona={persona} />
              {children}
            </ProfileLiveProvider>
          </AgentLiveProvider>
        </SafetyLiveProvider>
      </CurrentSessionProvider>
    </NightOutLiveProvider>
  );
}
