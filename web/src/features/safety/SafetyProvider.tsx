import type { ReactNode } from 'react';
import { SafetyLiveProvider } from './live';
import { SafetyMockProvider } from './mock';

export const SAFETY_SOURCE: 'live' | 'mock' =
  (import.meta.env as Record<string, string | undefined>).VITE_SAFETY_SOURCE === 'live' ? 'live' : 'mock';

export function SafetyProvider(props: { children?: ReactNode }) {
  return SAFETY_SOURCE === 'live' ? (
    <SafetyLiveProvider>{props.children}</SafetyLiveProvider>
  ) : (
    <SafetyMockProvider>{props.children}</SafetyMockProvider>
  );
}
