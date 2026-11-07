import { useState } from 'react';
import { useSetCurrentSessionId } from '../../features/night-out/currentSession';
import { NightOutSession } from './session/NightOutSession';
import { NightOutStart } from './start';

// Night Out tab. Expects a NightOutContext provider above it (see App.tsx).
export function NightOutTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const setCurrent = useSetCurrentSessionId();
  const open = (id: string) => {
    setCurrent(id);
    setOpenId(id);
  };
  return openId === null ? (
    <NightOutStart onOpen={open} />
  ) : (
    <NightOutSession sessionId={openId} onBack={() => setOpenId(null)} />
  );
}
