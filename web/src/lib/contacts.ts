// Contact Picker API (Chrome on Android). The picked contact never leaves the device:
// we only open the user's own Messages app with a prefilled invite.

type PickedContact = { name?: string[]; tel?: string[] };
type ContactsManager = { select(props: string[], opts?: { multiple?: boolean }): Promise<PickedContact[]> };

function manager(): ContactsManager | null {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & { contacts?: ContactsManager }) | undefined;
  return nav?.contacts && typeof nav.contacts.select === 'function' ? nav.contacts : null;
}

export function supportsContactPicker(): boolean {
  return manager() !== null;
}

/** Opens the system contact picker. Returns null if cancelled or the contact has no phone number. */
export async function pickContactPhone(): Promise<{ name: string; tel: string } | null> {
  const m = manager();
  if (!m) return null;
  const [c] = await m.select(['name', 'tel'], { multiple: false });
  const tel = c?.tel?.find((t) => t.trim());
  if (!tel) return null;
  return { name: c?.name?.[0]?.trim() || 'your friend', tel: tel.trim() };
}

/** sms: link that works on iOS and Android ("?&body=" is accepted by both). */
export function smsHref(tel: string, body: string): string {
  const number = tel.replace(/[^\d+]/g, '');
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}
