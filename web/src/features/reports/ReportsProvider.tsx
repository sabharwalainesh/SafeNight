import type { ReactNode } from 'react';
import { ReportsLiveProvider } from './live';
import { ReportsMockProvider } from './mock';

export const REPORTS_SOURCE: 'live' | 'mock' =
  (import.meta.env as Record<string, string | undefined>).VITE_REPORTS_SOURCE === 'live' ? 'live' : 'mock';

/** `me` is only used by the mock (per-user dedupe and vote tracking). */
export function ReportsProvider(props: { children?: ReactNode; me: string }) {
  return REPORTS_SOURCE === 'live' ? (
    <ReportsLiveProvider>{props.children}</ReportsLiveProvider>
  ) : (
    <ReportsMockProvider me={props.me}>{props.children}</ReportsMockProvider>
  );
}
