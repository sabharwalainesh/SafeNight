import { useState } from 'react';
import { NightOutSession } from './session/NightOutSession';
import { NightOutStart } from './start';

// Night Out tab. Expects a NightOutContext provider above it (see App.tsx).
export function NightOutTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    openId === null ? (
      <NightOutStart onOpen={setOpenId} />
    ) : (
      <NightOutSession sessionId={openId} onBack={() => setOpenId(null)} />
    )
  );
}
