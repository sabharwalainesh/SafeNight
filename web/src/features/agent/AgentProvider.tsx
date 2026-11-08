import { dataSource } from '../../lib/dataSource';
import type { ReactNode } from 'react';
import { AgentLiveProvider } from './live';
import { AgentMockProvider } from './mock';

export const AGENT_SOURCE: 'live' | 'mock' =
  dataSource('VITE_AGENT_SOURCE');

export function AgentProvider(props: { children?: ReactNode }) {
  return AGENT_SOURCE === 'live' ? (
    <AgentLiveProvider>{props.children}</AgentLiveProvider>
  ) : (
    <AgentMockProvider>{props.children}</AgentMockProvider>
  );
}
