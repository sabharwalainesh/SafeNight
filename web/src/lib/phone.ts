import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/min';

/** US/Canada national input by default; an explicit + keeps any country code. */
export function formatPhone(value: string): string {
  return new AsYouType('US').input(value.slice(0, 40));
}
export function normalizePhone(value: string): string {
  if (!value.trim()) return '';
  const parsed = parsePhoneNumberFromString(value, 'US');
  if (!parsed?.isPossible()) throw new Error('Enter a complete phone number. For outside the US or Canada, start with + and your country code.');
  return parsed.number;
}

/** onChange helper: formats as you type, and lets backspace delete through a formatting character like ")" or "-". */
export function formatPhoneInput(prev: string, next: string): string {
  const digits = (s: string) => s.replace(/[^\d+]/g, '');
  if (next.length < prev.length && digits(next) === digits(prev)) {
    const d = digits(next);
    return formatPhone(d.slice(0, -1));
  }
  return formatPhone(next);
}
