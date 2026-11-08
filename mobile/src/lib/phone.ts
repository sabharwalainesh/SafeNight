import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/min';

/** Formats as the user types: US/Canada by default; a leading + keeps any country code. */
export function formatPhone(value: string): string {
  const raw = value.slice(0, 40);
  // Let backspace remove a trailing ")" or "-" instead of fighting the user.
  if (/[\s()-]$/.test(raw)) return raw;
  const out = new AsYouType('US').input(raw);
  // "(555)" with nothing after it can't be backspaced through; show bare digits until the 4th.
  return /^\(\d{3}\)$/.test(out) ? out.slice(1, 4) : out;
}

/** E.164 (+15551234567) or '' when empty. Throws a readable error for incomplete numbers. */
export function normalizePhone(value: string): string {
  if (!value.trim()) return '';
  const parsed = parsePhoneNumberFromString(value, 'US');
  if (!parsed?.isPossible()) throw new Error('Enter a complete phone number. Outside the US or Canada, start with + and your country code.');
  return parsed.number;
}

/** Display form of a stored E.164 number. */
export function displayPhone(e164: string): string {
  if (!e164) return '';
  return parsePhoneNumberFromString(e164)?.formatNational() ?? e164;
}
