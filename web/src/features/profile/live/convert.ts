// Pure converters between SpacetimeDB rows and the Profile client contract.
import type { ContactRole, DefaultSharing, PrivacyDefaults, TrustedContact, UserProfile } from '../api';
import { DEFAULT_PRIVACY } from '../api';
import { identityStr, snakeToTag, tagToSnake, tsMs } from '../../night-out/live/convert';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

// `user_profile` is public; its deprecated phoneE164 is never read. The caller's
// phone comes from the private `my_phone` row and is passed in.
export function toProfile(r: Row, phone = ''): UserProfile {
  return {
    userId: identityStr(r.identity),
    displayName: r.displayName,
    avatarEmoji: r.avatarEmoji,
    phoneVerified: !!r.phoneVerified,
    phone,
  };
}

/** Phone from the caller's own `my_phone` row (or ''). */
export const toPhone = (r: Row | undefined | null): string => r?.phoneE164 ?? '';

const ROLES: ContactRole[] = ['buddy', 'backup_buddy', 'emergency'];
export function toRole(tag: string): ContactRole {
  const s = tagToSnake(tag) as ContactRole;
  return ROLES.includes(s) ? s : 'buddy';
}

export function toContact(r: Row, nameOf: (id: string) => string | undefined): TrustedContact {
  const contact = identityStr(r.contact);
  return {
    id: String(r.id),
    owner: identityStr(r.owner),
    contact,
    contactName: nameOf(contact) ?? 'Unknown person',
    role: toRole(r.role.tag),
    messagingConsent: !!r.messagingConsent,
    priority: Number(r.priority),
    createdAt: tsMs(r.createdAt),
  };
}

const SHARING: DefaultSharing[] = ['none', 'approximate', 'precise'];
export function toPrivacy(r: Row | undefined | null): PrivacyDefaults {
  if (!r) return { ...DEFAULT_PRIVACY };
  const s = tagToSnake(r.defaultSharingScope.tag) as DefaultSharing;
  return {
    defaultSharing: SHARING.includes(s) ? s : DEFAULT_PRIVACY.defaultSharing,
    defaultConsentMinutes: Number(r.defaultConsentTtlMinutes),
    allowBuddyAlerts: !!r.allowBuddyAlerts,
    allowGroupAlerts: !!r.allowGroupAlerts,
    retainCheckinsDays: Number(r.retainCheckinsDays),
  };
}

export function privacyArgs(p: PrivacyDefaults) {
  return {
    defaultSharingScope: { tag: snakeToTag(p.defaultSharing) } as { tag: 'None' | 'Approximate' | 'Precise' },
    defaultConsentTtlMinutes: Math.round(p.defaultConsentMinutes),
    allowBuddyAlerts: p.allowBuddyAlerts,
    allowGroupAlerts: p.allowGroupAlerts,
    retainCheckinsDays: Math.round(p.retainCheckinsDays),
  };
}

export const roleTag = (r: ContactRole) => ({ tag: snakeToTag(r) }) as { tag: 'Buddy' | 'BackupBuddy' | 'Emergency' };

/** Contacts sorted by priority (ties by creation). */
export const sortContacts = (cs: TrustedContact[]) => [...cs].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

/**
 * Plan a reorder as remove+re-add. Returns the two contacts with swapped
 * priorities (1-based positions), or null when the move is out of range.
 */
export function planMove(sorted: TrustedContact[], id: string, dir: 'up' | 'down') {
  const i = sorted.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Contact not found');
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return null;
  return { a: sorted[i], b: sorted[j], aPriority: j + 1, bPriority: i + 1 };
}

/** New full id order after moving one contact a step; null when out of range. */
export function reorderIds(sorted: TrustedContact[], id: string, dir: 'up' | 'down'): bigint[] | null {
  const i = sorted.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Contact not found');
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return null;
  const ids = sorted.map((c) => BigInt(c.id));
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
