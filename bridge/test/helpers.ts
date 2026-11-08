import { loadConfig, type Config } from '../src/config.js';
import type { Action, IncidentSnapshot } from '../src/types.js';

export const cfg = (env: Record<string, string> = {}): Config =>
  loadConfig({ BRIDGE_STATE_FILE: '', DEBOUNCE_MS: '20', SIM_DELAY_MS: '10', CALL_DELAY_MS: '0', ...env });

export function incident(over: Partial<IncidentSnapshot> = {}): IncidentSnapshot {
  return {
    id: 'inc1', kind: 'help_requested', severity: 'elevated', status: 'open',
    subjectName: 'Alex', subjectPersonaId: 'alex', sessionName: 'Friday night', venue: 'The Anchor',
    lastLocation: { lat: 40.7, lng: -74, approximate: false, recordedAt: '2026-01-01T00:00:00Z' },
    participants: [
      { personaId: 'alex', displayName: 'Alex', role: 'subject', acknowledged: false },
      { personaId: 'sam', displayName: 'Sam', role: 'primary', acknowledged: false },
      { personaId: 'maya', displayName: 'Maya', role: 'backup', acknowledged: false },
    ],
    recentCheckins: [], events: [{ kind: 'opened', detail: 'x', at: '2026-01-01T00:00:00Z' }],
    ...over,
  };
}

export const act = (over: Partial<Action>): Action => ({
  id: 'a', type: 'text_group', target: 'group', status: 'sent', detail: '', simulated: true, createdAt: 0, ...over,
});
