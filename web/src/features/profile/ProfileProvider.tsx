import { dataSource } from '../../lib/dataSource';
import type { ReactNode } from 'react';
import { ProfileLiveProvider } from './live';
import { ProfileMockProvider } from './mock';

export const PROFILE_SOURCE: 'live' | 'mock' =
  dataSource('VITE_PROFILE_SOURCE');

export function ProfileProvider(props: { me: string; displayName: string; children?: ReactNode }) {
  return PROFILE_SOURCE === 'live' ? (
    <ProfileLiveProvider>{props.children}</ProfileLiveProvider>
  ) : (
    <ProfileMockProvider me={props.me} displayName={props.displayName}>
      {props.children}
    </ProfileMockProvider>
  );
}
