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

export const KIND_LABELS: Record<string, string> = {
  possible_impaired_driving: 'Possible impaired driving',
  help_requested: 'Help requested',
  missed_checkin: 'Missed check-in',
  feeling_unsafe: 'Feeling unsafe',
};
