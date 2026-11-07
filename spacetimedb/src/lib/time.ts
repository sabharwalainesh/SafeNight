import { Timestamp } from 'spacetimedb';

const MICROS_PER_MINUTE = 60_000_000n;

export function minutesAfter(base: Timestamp, minutes: number): Timestamp {
  return new Timestamp(base.microsSinceUnixEpoch + BigInt(minutes) * MICROS_PER_MINUTE);
}

export function isBefore(a: Timestamp, b: Timestamp): boolean {
  return a.microsSinceUnixEpoch < b.microsSinceUnixEpoch;
}

export function isAtOrBefore(a: Timestamp, b: Timestamp): boolean {
  return a.microsSinceUnixEpoch <= b.microsSinceUnixEpoch;
}
