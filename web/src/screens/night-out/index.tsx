import { useState } from 'react';
import { NightOutMockProvider } from '../../features/night-out/mock';
import type { Persona } from '../../personas';
import { NightOutSession } from './session/NightOutSession';
import { NightOutStart } from './start';

// Night Out tab. Backed by the local mock until C1-A bindings land; then the
// provider below is swapped for the bindings adapter and nothing else changes.
export function NightOutTab({ persona }: { persona: Persona }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <NightOutMockProvider me={persona.id} displayName={persona.name}>
      {openId === null ? (
        <NightOutStart onOpen={setOpenId} />
      ) : (
        <NightOutSession sessionId={openId} onBack={() => setOpenId(null)} />
      )}
    </NightOutMockProvider>
  );
}
