import type { ReactNode } from 'react';
import type { Persona } from '../../personas';
import { NightOutLiveProvider } from './live';
import { NightOutMockProvider } from './mock';

// Mock by default: the C2/C3 mocks and the judge demo panel still read and
// write the mock Night Out store directly, so the full demo only works on mock
// data until their live adapters exist. Set VITE_NIGHTOUT_SOURCE=live to run
// the Night Out tab against the SpacetimeDB module (C1-A).
export const NIGHT_OUT_SOURCE: 'live' | 'mock' =
  import.meta.env.VITE_NIGHTOUT_SOURCE === 'live' ? 'live' : 'mock';

const AVATARS: Record<string, string> = { sam: '🚗', alex: '🎉', maya: '🌿', jordan: '🌙' };

export function NightOutProvider({ persona, children }: { persona: Persona; children?: ReactNode }) {
  return NIGHT_OUT_SOURCE === 'live' ? (
    <NightOutLiveProvider displayName={persona.name} avatarEmoji={AVATARS[persona.id] ?? '🙂'}>
      {children}
    </NightOutLiveProvider>
  ) : (
    <NightOutMockProvider me={persona.id} displayName={persona.name}>
      {children}
    </NightOutMockProvider>
  );
}
