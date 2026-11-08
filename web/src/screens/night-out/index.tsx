import { useState } from 'react';
import { useSetCurrentSessionId } from '../../features/night-out/currentSession';
import { inviteCodeFromUrl } from '../../lib/invite';
import { NightOutSession } from './session/NightOutSession';
import { NightOutStart } from './start';

/** Reads ?join=CODE once and removes it from the address bar so it is not re-shared or re-used on reload. */
function takeJoinCode(): string {
  if (typeof window === 'undefined') return '';
  const code = inviteCodeFromUrl(window.location.href);
  if (code) {
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState(window.history.state, '', url.toString());
  }
  return code;
}

// Night Out tab. Expects a NightOutContext provider above it (see App.tsx).
export function NightOutTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteCode] = useState(takeJoinCode);
  const setCurrent = useSetCurrentSessionId();
  const open = (id: string) => {
    setCurrent(id);
    setOpenId(id);
  };
  return openId === null ? (
    <NightOutStart onOpen={open} initialCode={inviteCode} />
  ) : (
    <NightOutSession sessionId={openId} onBack={() => setOpenId(null)} />
  );
}
