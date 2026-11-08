export function ago(at: number, now: number = Date.now()): string {
  const s = Math.round((now - at) / 1000);
  if (!Number.isFinite(s)) return 'unknown';
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "in 3 h" / "2 min ago" for past and future. */
export function relFuture(at: number, now: number = Date.now()): string {
  const diff = at - now;
  const m = Math.round(Math.abs(diff) / 60000);
  const text = m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const errText = (e: unknown, fallback = 'Something went wrong') => (e instanceof Error ? e.message : fallback);

export const humanize = (t: string) => {
  const s = t.replace(/[_.-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
