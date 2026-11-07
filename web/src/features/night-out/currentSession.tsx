import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNightOut } from './api';

type Value = { sessionId: string | null; set: (id: string | null) => void };

const CurrentSessionContext = createContext<Value | null>(null);

/** Mount inside the NightOut provider. Tracks which session the app is "in". */
export function CurrentSessionProvider(props: { children?: ReactNode }) {
  const { mySessions } = useNightOut();
  const [selected, setSelected] = useState<string | null>(null);
  // Falls back to the first session when nothing is selected or the selected one disappeared.
  const sessionId = (selected !== null && mySessions.some((s) => s.id === selected) ? selected : mySessions[0]?.id) ?? null;
  const set = useCallback((id: string | null) => setSelected(id), []);
  const value = useMemo(() => ({ sessionId, set }), [sessionId, set]);
  return createElement(CurrentSessionContext.Provider, { value }, props.children);
}

/** Current session id, or undefined when no CurrentSessionProvider is mounted. */
export function useOptionalCurrentSessionId(): string | null | undefined {
  return useContext(CurrentSessionContext)?.sessionId;
}

export function useCurrentSessionId(): string | null {
  const v = useContext(CurrentSessionContext);
  const { mySessions } = useNightOut();
  return v ? v.sessionId : (mySessions[0]?.id ?? null);
}

/** No-op when no CurrentSessionProvider is mounted. */
export function useSetCurrentSessionId(): (id: string | null) => void {
  return useContext(CurrentSessionContext)?.set ?? noop;
}
const noop = () => {};
