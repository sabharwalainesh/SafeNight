import { describe, expect, it } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { parseRideOptions, parseSteps, toAction, toJob, toNotification, toPlan, toRidePlan } from '../features/agent/live/convert';

const ida = new Identity('00000000000000000000000000000000000000000000000000000000000000aa');
const idb = new Identity('00000000000000000000000000000000000000000000000000000000000000bb');
const ts = (ms: number) => Timestamp.fromDate(new Date(ms));
const names = (id: string) => (id === ida.toHexString() ? 'Maya' : undefined);

describe('agent live converters', () => {
  it('job maps enum and has null follow-up when the view lacks it', () => {
    const j = toJob({ id: 1n, incidentId: 9n, status: { tag: 'WaitingForAck' }, planVersion: 2, escalationTier: 1, lastEvent: 'x', wakeCount: 3, createdAt: ts(1), updatedAt: ts(2) });
    expect(j).toMatchObject({ id: '1', incidentId: '9', status: 'waiting_for_ack', followupDueAt: null, followupExpectedFrom: null, updatedAt: 2 });
    expect(toJob({ id: 1n, incidentId: 9n, status: { tag: 'Bogus' }, planVersion: 0, escalationTier: 0, lastEvent: '', wakeCount: 0, createdAt: ts(1), updatedAt: ts(2), followupDueAt: ts(50), followupExpectedFrom: idb })).toMatchObject({
      status: 'queued',
      followupDueAt: 50,
      followupExpectedFrom: idb.toHexString(),
    });
  });

  it('steps parse tool calls, strings, {title,detail}; malformed -> []', () => {
    const steps = parseSteps(JSON.stringify(['Do a thing', { title: 'T', detail: 'D' }, { name: 'schedule_followup', args: { delayMinutes: 2 } }, 5]));
    expect(steps).toEqual([
      { title: 'Do a thing', detail: '' },
      { title: 'T', detail: 'D' },
      { title: 'schedule followup', detail: 'delayMinutes: 2' },
    ]);
    expect(parseSteps('{not json')).toEqual([]);
    expect(parseSteps('{"a":1}')).toEqual([]);
    expect(toPlan({ id: 2n, jobId: 1n, version: 3, summary: 's', stepsJson: '', model: 'simulated-planner', simulated: true, createdAt: ts(4) }).steps).toEqual([]);
  });

  it('action maps status, args, result text with safe fallbacks', () => {
    const base = { id: 5n, jobId: 1n, planVersion: 1, tool: 'send_approved_message', argsJson: '{"template":"buddy_alert"}', status: { tag: 'Executed' }, resultJson: '{}', rejectReason: '', simulated: true, at: ts(9) };
    const a = toAction(base);
    expect(a).toMatchObject({ status: 'executed', args: { template: 'buddy_alert' }, resultText: 'send approved message: executed', at: 9 });
    const bad = toAction({ ...base, argsJson: 'oops', resultJson: 'oops', status: { tag: 'Rejected' }, rejectReason: 'stale_plan' });
    expect(bad.args).toEqual({});
    expect(bad.resultText).toBe('send approved message rejected: stale_plan');
    const t = toAction({ ...base, tool: 'get_transport_options', resultJson: '{"status":"failed","error":"osrm_http_503","options":[]}' });
    expect(t.resultText).toBe('Transport lookup failed: osrm_http_503');
  });

  it('notification maps enums and names the recipient', () => {
    const n = toNotification({ id: 1n, incidentId: 2n, recipient: ida, channel: { tag: 'InApp' }, template: 'buddy_alert', body: 'b', status: { tag: 'Sent' }, simulated: true, createdAt: ts(3), acknowledgedAt: null }, names);
    expect(n).toMatchObject({ recipientName: 'Maya', channel: 'in_app', status: 'sent', acknowledgedAt: null });
    const u = toNotification({ id: 1n, incidentId: 2n, recipient: idb, channel: { tag: 'Sms' }, template: 't', body: 'b', status: { tag: 'Acknowledged' }, simulated: false, createdAt: ts(3), acknowledgedAt: ts(8) }, names);
    expect(u.recipientName).toHaveLength(8);
    expect(u).toMatchObject({ channel: 'sms', status: 'acknowledged', acknowledgedAt: 8 });
  });

  it('ride options: osrm, provider links, failed lookup, malformed', () => {
    const ok = parseRideOptions(
      JSON.stringify({
        status: 'ok',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        options: [
          { kind: 'route', label: 'Drive', url: '', source: 'osrm', durationMinutes: 12, distanceKm: 4 },
          { kind: 'rideshare', label: 'Uber', url: 'https://m.uber.com/x', source: 'provider_link' },
        ],
      }),
      7,
    );
    expect(ok[0]).toMatchObject({ id: 'Drive', etaMinutes: 12, source: 'OSRM route', url: null, simulated: false, fetchedAt: Date.parse('2026-01-01T00:00:00.000Z') });
    expect(ok[1]).toMatchObject({ id: 'Uber', kind: 'rideshare', source: 'Provider link only', etaMinutes: null });
    const failed = parseRideOptions(JSON.stringify({ status: 'failed', error: 'tls', options: [{ kind: 'transit', label: 'Transit', url: 'https://x', source: 'provider_link' }] }), 7);
    expect(failed[0]).toMatchObject({ kind: 'transit', source: 'Lookup failed: tls', fetchedAt: 7 });
    expect(parseRideOptions('garbage', 1)).toEqual([]);
    expect(parseRideOptions('[{"nolabel":1}]', 1)).toEqual([]);
  });

  it('ride plan maps status, rider name and chosen option', () => {
    const r = toRidePlan({ id: 4n, incidentId: 2n, riderId: ida, optionsJson: '[]', chosenOption: '', status: { tag: 'BookedByUser' }, confirmedBy: idb, updatedAt: ts(11) }, names);
    expect(r).toMatchObject({ riderName: 'Maya', chosenOption: null, status: 'booked_by_user', confirmedBy: idb.toHexString(), updatedAt: 11, options: [] });
  });
});
