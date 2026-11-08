import { dataSource } from '../../lib/dataSource';
import type { ReactNode } from 'react';
import type { Persona } from '../../personas';
import { NightOutLiveProvider } from './live';
import { NightOutMockProvider } from './mock';

// Live by default (see lib/dataSource.ts); VITE_DATA_SOURCE=mock or
// VITE_NIGHTOUT_SOURCE=mock runs the Night Out tab on the local mock instead.
export const NIGHT_OUT_SOURCE: 'live' | 'mock' =
  dataSource('VITE_NIGHTOUT_SOURCE');

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
