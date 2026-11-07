import { describe, expect, it } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { toAlert, toCheckin, toEvent, toIncident, toLocation } from '../features/safety/live/convert';

const ida = new Identity('00000000000000000000000000000000000000000000000000000000000000aa');
const idb = new Identity('00000000000000000000000000000000000000000000000000000000000000bb');
const ts = (ms: number) => Timestamp.fromDate(new Date(ms));

describe('safety live converters', () => {
  it('location: stale after 5 minutes, approximate defaults false', () => {
    const base = { sessionId: 1n, userId: ida, displayName: 'A', lat: 1, lng: 2, accuracyM: 5, source: { tag: 'Simulated' } };
    const fresh = toLocation({ ...base, recordedAt: ts(1_000_000) }, 1_000_000 + 60_000);
    expect(fresh.isStale).toBe(false);
    expect(fresh.approximate).toBe(false);
    expect(fresh.source).toBe('simulated');
    const old = toLocation({ ...base, recordedAt: ts(1_000_000), approximate: true }, 1_000_000 + 301_000);
    expect(old.isStale).toBe(true);
    expect(old.approximate).toBe(true);
  });

  it('checkin maps snake-case kind', () => {
    const c = toCheckin({ id: 7n, sessionId: 1n, userId: ida, kind: { tag: 'NeedRide' }, note: 'n', createdAt: ts(5) });
    expect(c).toMatchObject({ id: '7', sessionId: '1', kind: 'need_ride', createdAt: 5 });
  });

  it('incident joins participants and takes subjectName from subject participant', () => {
    const row = {
      id: 3n, sessionId: 1n, subject: ida, subjectName: 'old', kind: { tag: 'PossibleImpairedDriving' },
      severity: { tag: 'Urgent' }, status: { tag: 'AwaitingHomeConfirmation' }, openedBy: idb, openedAt: ts(10),
      resolvedAt: undefined, resolvedBy: undefined,
    };
    const parts = [
      { incidentId: 3n, userId: ida, displayName: 'Sam', role: { tag: 'Subject' }, acknowledgedAt: undefined },
      { incidentId: 3n, userId: idb, displayName: 'Alex', role: { tag: 'Reporter' }, acknowledgedAt: ts(20) },
      { incidentId: 4n, userId: idb, displayName: 'Other', role: { tag: 'Buddy' } },
    ];
    const inc = toIncident(row, parts);
    expect(inc.subjectName).toBe('Sam');
    expect(inc.status).toBe('awaiting_home_confirmation');
    expect(inc.kind).toBe('possible_impaired_driving');
    expect(inc.resolvedAt).toBeNull();
    expect(inc.participants).toHaveLength(2);
    expect(inc.participants[1]).toMatchObject({ role: 'reporter', acknowledgedAt: 20 });
  });

  it('event falls back to participant name', () => {
    const parts = [{ incidentId: 3n, userId: idb, displayName: 'Alex', role: { tag: 'Reporter' } }];
    const e = toEvent({ id: 1n, incidentId: 3n, at: ts(9), actor: idb, actorName: '', kind: 'opened', detail: 'd', simulated: true }, parts);
    expect(e).toMatchObject({ actorName: 'Alex', simulated: true, incidentId: '3' });
  });

  it('alert incidentId 0n maps to empty string', () => {
    const a = toAlert({ recipient: ida, incidentId: 0n, kind: { tag: 'NoDrivingWarning' }, message: 'm', at: ts(1) }, 'x');
    expect(a).toMatchObject({ id: 'x', incidentId: '', kind: 'no_driving_warning' });
  });
});
