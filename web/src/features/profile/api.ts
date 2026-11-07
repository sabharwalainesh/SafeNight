// Client-side contract for the Profile tab (C4). Ids are strings, people are
// UserId strings, times are epoch milliseconds.
import { createContext, useContext } from 'react';

export type UserId = string;
export type EpochMs = number;
export type ContactRole = 'buddy' | 'backup_buddy' | 'emergency';
export type DefaultSharing = 'none' | 'approximate' | 'precise';

export type UserProfile = { userId: UserId; displayName: string; avatarEmoji: string; phoneVerified: boolean; phone: string };
export type TrustedContact = {
  id: string;
  owner: UserId;
  contact: UserId;
  contactName: string;
  role: ContactRole;
  messagingConsent: boolean;
  priority: number;
  createdAt: EpochMs;
};
export type PrivacyDefaults = {
  defaultSharing: DefaultSharing;
  defaultConsentMinutes: number;
  allowBuddyAlerts: boolean;
  allowGroupAlerts: boolean;
  retainCheckinsDays: number;
};

export const DEFAULT_PRIVACY: PrivacyDefaults = {
  defaultSharing: 'approximate',
  defaultConsentMinutes: 180,
  allowBuddyAlerts: true,
  allowGroupAlerts: true,
  retainCheckinsDays: 7,
};

export type ProfileActions = {
  /** E.164 (+15551234567) or empty to clear. */
  setPhone(e164: string): Promise<void>;
  setProfile(displayName: string, avatarEmoji: string): Promise<void>;
  addTrustedContact(contact: UserId, role: ContactRole, messagingConsent: boolean, priority: number): Promise<void>;
  removeTrustedContact(id: string): Promise<void>;
  moveContact(id: string, direction: 'up' | 'down'): Promise<void>;
  setPrivacyDefaults(p: PrivacyDefaults): Promise<void>;
  /** Removes the caller's profile, contacts and privacy prefs. */
  deleteMyData(): Promise<void>;
};

export type ProfileApi = {
  me: UserId;
  ready: boolean;
  mocked: boolean;
  profile: UserProfile | null;
  /** My contacts, sorted by priority. */
  contacts: TrustedContact[];
  knownPeople: { userId: UserId; displayName: string }[];
  privacy: PrivacyDefaults;
  /** False when the server has no privacy row yet and `privacy` shows defaults. */
  privacySaved: boolean;
  actions: ProfileActions;
};

export const ProfileContext = createContext<ProfileApi | null>(null);

export function useProfile(): ProfileApi {
  const api = useContext(ProfileContext);
  if (!api) throw new Error('useProfile must be used inside a ProfileContext provider');
  return api;
}
