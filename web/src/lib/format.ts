import type { Identity, Timestamp } from 'spacetimedb';

/** First 8 hex characters of an identity, enough to tell demo users apart. */
export function shortIdentity(identity: Identity | undefined | null): string {
  if (!identity) return '--------';
  return identity.toHexString().slice(0, 8);
}

/** Human-readable age of a timestamp ("just now", "3 min ago", "2 h ago"). */
export function relativeTime(timestamp: Timestamp, now: number = Date.now()): string {
  const ms = now - timestamp.toDate().getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 0) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

/** Absolute clock time for timestamps that must be exact (incident timelines). */
export function clockTime(timestamp: Timestamp): string {
  return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
