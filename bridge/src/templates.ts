import type { IncidentSnapshot, TextTemplate } from './types.js';

/** Remove URLs, phone-like digit runs, control chars and newlines from incident text, then clip. */
export function safeField(v: unknown, n = 80): string {
  // Allowlist, not blocklist: after NFKC (folds fullwidth/ideographic dots), keep
  // only letters, digits, spaces and a few harmless marks. No '.', '/', ':' or '@',
  // so nothing in a name or venue can form a link, handle or domain.
  return String(v ?? '')
    .normalize('NFKC')
    .replace(/(https?:\/\/|www\.)\S*/gi, ' ')
    .replace(/\S+\.\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s',&()-]/gu, ' ')
    // Any 4+ digit run, whatever script or separators, so no phone number can be assembled.
    .replace(/\+?\p{N}[\p{N}\s()',&-]{2,}\p{N}/gu, ' ')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

export const mapsLink = (inc: IncidentSnapshot): string => {
  const lat = Number(inc.lastLocation?.lat);
  const lng = Number(inc.lastLocation?.lng);
  if (!inc.lastLocation || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
  return `https://maps.google.com/?q=${lat.toFixed(4)},${lng.toFixed(4)}`;
};

export const TEXT_PREFIX = 'SafeNight alert (demo):';
export const TEXT_SUFFIX = "Reply ON IT or CAN'T.";

/** Bridge-authored message. Only incident fields (sanitized) are interpolated; never model text. */
export function renderText(t: TextTemplate, inc: IncidentSnapshot, minutesSince: number): string {
  const who = safeField(inc.subjectName, 40) || 'A friend';
  const venue = safeField(inc.venue);
  const at = venue ? ` near ${venue}` : '';
  const map = mapsLink(inc);
  const loc = `${at}${inc.lastLocation?.approximate ? ' (approximate)' : ''}.${map ? ` Map: ${map}` : ''}`;
  const mins = Math.max(0, Math.round(minutesSince));
  let body: string;
  switch (t) {
    case 'help_needed': body = `${who} asked for help${loc}`; break;
    case 'driver_concern': body = `${who} may be at risk driving${loc}`; break;
    case 'escalation': body = `${who} still needs help and nobody has responded after ${mins} min${loc}`; break;
    case 'update_resolved_by_person': body = `${who}'s alert was closed in SafeNight.`; break;
  }
  return `${TEXT_PREFIX} ${body} ${TEXT_SUFFIX}`;
}
