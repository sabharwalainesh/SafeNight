import { SenderError } from 'spacetimedb/server';
import type { Timestamp } from 'spacetimedb';

/** Cheap per-caller abuse guards. Windows are sliding and computed from existing rows, so no extra tables. */
export const LIMITS = {
  checkinsPerMinute: 10,
  locationsPerMinute: 30,
  meetupLocationsPerMinute: 60,
  concernsPerHour: 5,
  venueReportsPerHour: 8,
  venuesPerHour: 5,
  openInvitesPerSession: 10,
} as const;

export const MINUTE_MICROS = 60_000_000n;
export const HOUR_MICROS = 60n * MINUTE_MICROS;

/** Count rows whose timestamp falls within `windowMicros` before `now`. */
export function countRecent<T>(rows: Iterable<T>, at: (row: T) => Timestamp, now: Timestamp, windowMicros: bigint): number {
  let n = 0;
  for (const row of rows) {
    if (now.microsSinceUnixEpoch - at(row).microsSinceUnixEpoch <= windowMicros) n++;
  }
  return n;
}

export function enforceLimit(count: number, limit: number, message: string) {
  if (count >= limit) throw new SenderError(message);
}
