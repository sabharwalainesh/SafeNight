import type { ReactNode } from 'react';
import { AgentLiveProvider } from './live';
import { AgentMockProvider } from './mock';

export const AGENT_SOURCE: 'live' | 'mock' =
  (import.meta.env as Record<string, string | undefined>).VITE_AGENT_SOURCE === 'live' ? 'live' : 'mock';

export function AgentProvider(props: { children?: ReactNode }) {
  return AGENT_SOURCE === 'live' ? (
    <AgentLiveProvider>{props.children}</AgentLiveProvider>
  ) : (
    <AgentMockProvider>{props.children}</AgentMockProvider>
  );
}
