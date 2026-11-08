import { Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { inviteMessage } from '../../../web/src/lib/invite';

export { inviteCodeFromUrl } from './inviteCode';

/** App deep link for an invite code. */
export const inviteDeepLink = (code: string) => `safenight://join?code=${code}`;

/** Optional web link (EXPO_PUBLIC_WEB_URL), so friends without the app can join in a browser. */
export function inviteWebLink(code: string): string | null {
  const base = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim().replace(/[?#].*$/, '');
  return /^https:\/\//.test(base) ? `${base}?join=${code}` : null;
}

export function inviteText(groupName: string, code: string): string {
  const web = inviteWebLink(code);
  return `${inviteMessage(groupName, code)}\n${web ?? inviteDeepLink(code)}`;
}

/** System share sheet with the invite. */
export async function shareInvite(groupName: string, code: string): Promise<'shared' | 'dismissed'> {
  const message = inviteText(groupName, code);
  const r = await Share.share(Platform.OS === 'ios' ? { message } : { message, title: `Join ${groupName}` }, { subject: `Join ${groupName} on SafeNight` });
  return r.action === Share.sharedAction ? 'shared' : 'dismissed';
}

/**
 * Pick someone from Contacts and text them the invite. Only the chosen number is used, on this device;
 * the address book is never uploaded. Falls back to the share sheet if Messages is unavailable.
 */
export async function inviteFromContacts(groupName: string, code: string): Promise<'sent' | 'cancelled' | 'shared'> {
  if (!requireOptionalNativeModule('ExpoContacts')) throw new Error('Contacts need the latest SafeNight build. Rebuild the app from Xcode.');
  const Contacts = await import('expo-contacts/legacy');
  const picked = await Contacts.presentContactPickerAsync();
  if (!picked) return 'cancelled';
  const phones = (picked.phoneNumbers ?? []).map((p) => p.number ?? p.digits ?? '').filter(Boolean);
  const first = picked.firstName || picked.name || 'there';
  const message = `Hey ${first}! ${inviteText(groupName, code)}`;
  const SMS = requireOptionalNativeModule('ExpoSMS') ? await import('expo-sms') : null;
  if (phones.length && SMS && (await SMS.isAvailableAsync())) {
    const r = await SMS.sendSMSAsync([phones[0]!], message);
    return r.result === 'cancelled' ? 'cancelled' : 'sent';
  }
  await Share.share({ message });
  return 'shared';
}
