/**
 * Ride deep-link allowlist. Options can come from model output, so every URL is validated server-side
 * before it is stored or shown. Anything else is dropped (the receipt notes how many were dropped).
 */
export const RIDE_LINK_PREFIXES = [
  'https://m.uber.com/',
  'https://lyft.com/',
  'https://www.lyft.com/',
  'uber://',
  'lyft://',
  // Transit directions are not a ride booking but are the one non-rideshare link the agent may show.
  'https://www.google.com/maps/dir/',
] as const;

export function isAllowedRideUrl(url: string): boolean {
  return RIDE_LINK_PREFIXES.some(p => url.startsWith(p));
}

export type SanitizedOption = { kind: string; label: string; url: string; source: string; fetchedAt: number; durationMinutes?: number; distanceKm?: number };

/** Keep options whose URL is empty (informational) or allowlisted; return the survivors and the dropped count. */
export function sanitizeOptions<T extends { url: string }>(options: T[]): { kept: T[]; dropped: number } {
  const kept = options.filter(o => o.url === '' || isAllowedRideUrl(o.url));
  return { kept, dropped: options.length - kept.length };
}
