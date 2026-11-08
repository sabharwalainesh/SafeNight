import { dataSource } from '../../lib/dataSource';
import type { ReactNode } from 'react';
import { ReportsLiveProvider } from './live';
import { ReportsMockProvider } from './mock';

export const REPORTS_SOURCE: 'live' | 'mock' =
  dataSource('VITE_REPORTS_SOURCE');

/** `me` is only used by the mock (per-user dedupe and vote tracking). */
export function ReportsProvider(props: { children?: ReactNode; me: string }) {
  return REPORTS_SOURCE === 'live' ? (
    <ReportsLiveProvider>{props.children}</ReportsLiveProvider>
  ) : (
    <ReportsMockProvider me={props.me}>{props.children}</ReportsMockProvider>
  );
}
