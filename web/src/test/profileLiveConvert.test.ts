import { describe, expect, it } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { planMove, privacyArgs, sortContacts, toContact, toPrivacy, toProfile } from '../features/profile/live/convert';
import { DEFAULT_PRIVACY } from '../features/profile/api';

const ida = new Identity('00000000000000000000000000000000000000000000000000000000000000aa');
const idb = new Identity('00000000000000000000000000000000000000000000000000000000000000bb');
const ts = (ms: number) => Timestamp.fromDate(new Date(ms));

describe('profile live converters', () => {
  it('profile row', () => {
    expect(toProfile({ identity: ida, displayName: 'Maya', avatarEmoji: 'x', phoneVerified: false, createdAt: ts(1), phoneE164: '+15551234567' })).toEqual({
      userId: ida.toHexString(),
      displayName: 'Maya',
      avatarEmoji: 'x',
      phoneVerified: false,
      phone: '+15551234567',
    });
  });

  it('contact maps role and name', () => {
    const c = toContact({ id: 4n, owner: ida, contact: idb, role: { tag: 'BackupBuddy' }, messagingConsent: true, priority: 2, createdAt: ts(9) }, (id) => (id === idb.toHexString() ? 'Jordan' : undefined));
    expect(c).toMatchObject({ id: '4', contactName: 'Jordan', role: 'backup_buddy', priority: 2, createdAt: 9, messagingConsent: true });
    expect(toContact({ id: 5n, owner: ida, contact: ida, role: { tag: 'Emergency' }, messagingConsent: false, priority: 1, createdAt: ts(1) }, () => undefined).contactName).toBe('Unknown person');
  });

  it('privacy: no row gives defaults; row maps and round-trips to args', () => {
    expect(toPrivacy(undefined)).toEqual(DEFAULT_PRIVACY);
    const p = toPrivacy({ defaultSharingScope: { tag: 'Precise' }, defaultConsentTtlMinutes: 60, allowBuddyAlerts: false, allowGroupAlerts: true, retainCheckinsDays: 30 });
    expect(p).toEqual({ defaultSharing: 'precise', defaultConsentMinutes: 60, allowBuddyAlerts: false, allowGroupAlerts: true, retainCheckinsDays: 30 });
    expect(privacyArgs(p)).toEqual({ defaultSharingScope: { tag: 'Precise' }, defaultConsentTtlMinutes: 60, allowBuddyAlerts: false, allowGroupAlerts: true, retainCheckinsDays: 30 });
  });

  it('planMove swaps neighbours and respects bounds', () => {
    const mk = (id: string, priority: number) => ({ id, owner: 'o', contact: id, contactName: id, role: 'buddy' as const, messagingConsent: false, priority, createdAt: 0 });
    const list = sortContacts([mk('b', 2), mk('a', 1), mk('c', 3)]);
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    const m = planMove(list, 'b', 'up');
    expect(m).toMatchObject({ aPriority: 1, bPriority: 2 });
    expect(m?.a.id).toBe('b');
    expect(m?.b.id).toBe('a');
    expect(planMove(list, 'a', 'up')).toBeNull();
    expect(planMove(list, 'c', 'down')).toBeNull();
    expect(() => planMove(list, 'zz', 'up')).toThrow();
  });
});
