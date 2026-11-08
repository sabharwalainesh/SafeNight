import { dataSource } from '../../lib/dataSource';
import type { ReactNode } from 'react';
import { SafetyLiveProvider } from './live';
import { SafetyMockProvider } from './mock';

export const SAFETY_SOURCE: 'live' | 'mock' =
  dataSource('VITE_SAFETY_SOURCE');

export function SafetyProvider(props: { children?: ReactNode }) {
  return SAFETY_SOURCE === 'live' ? (
    <SafetyLiveProvider>{props.children}</SafetyLiveProvider>
  ) : (
    <SafetyMockProvider>{props.children}</SafetyMockProvider>
  );
}
