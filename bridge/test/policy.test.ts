import { describe, expect, it } from 'vitest';
import { emergencyNumberReason, validateAction, type PolicyContext } from '../src/policy.js';
import { act, incident } from './helpers.js';

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  incident: incident({ severity: 'urgent' }), now: 1_000_000, demoDispatchNumber: '+15550100199', blockedNumbers: [],
  phoneFor: (p) => ({ sam: '+15550100001', maya: '+15550100002', alex: '+15550100003' } as Record<string, string>)[p],
  optedIn: () => true, history: [], ...over,
});
const dispatch = { type: 'dispatch_call', reason: 'r', summary: 's' } as const;

describe('emergency numbers', () => {
  it.each(['911', '+1 911', '(911)', '+1 (911) 555 1234', '112', '+44 999', '999', '000', '988', '933', '12345', '+1 112 555 0000'])(
    'blocks %s', (n) => expect(emergencyNumberReason(n)).not.toBeNull());
  it('allows ordinary numbers', () => expect(emergencyNumberReason('+1 555 010 0199')).toBeNull());
  it('honours BLOCKED_NUMBERS', () => {
    expect(emergencyNumberReason('+1 555 010 0199', ['(555) 010-0199'])).not.toBeNull();
  });
});

describe('dispatch policy', () => {
  it('allows urgent with no acknowledgement and targets the demo number', () => {
    const r = validateAction(dispatch, ctx());
    expect(r).toMatchObject({ ok: true, number: '+15550100199' });
  });
  it('blocks when not urgent', () => {
    expect(validateAction(dispatch, ctx({ incident: incident({ severity: 'elevated' }) })).ok).toBe(false);
  });
  it('blocks when someone acknowledged and no emergency check-in', () => {
    const inc = incident({ severity: 'urgent' });
    inc.participants[1]!.acknowledged = true;
    expect(validateAction(dispatch, ctx({ incident: inc })).ok).toBe(false);
  });
  it('allows acknowledged incident with emergency check-in', () => {
    const inc = incident({ severity: 'urgent', recentCheckins: [{ kind: 'emergency', at: '2026-01-01T00:01:00Z' }] });
    inc.participants[1]!.acknowledged = true;
    expect(validateAction(dispatch, ctx({ incident: inc })).ok).toBe(true);
  });
  it('allows only one dispatch per incident', () => {
    const r = validateAction(dispatch, ctx({ history: [act({ type: 'dispatch_call', status: 'completed' })] }));
    expect(r.ok).toBe(false);
  });
  it('requires a demo number', () => {
    expect(validateAction(dispatch, ctx({ demoDispatchNumber: '' }))).toEqual({ ok: false, reason: 'No demo dispatch number configured' });
  });
  it('hard blocks an emergency demo number', () => {
    for (const n of ['911', '+1 911', '(911)', '112', '999']) {
      expect(validateAction(dispatch, ctx({ demoDispatchNumber: n })).ok).toBe(false);
    }
  });
  it('blocks resolved incidents', () => {
    expect(validateAction(dispatch, ctx({ incident: incident({ severity: 'urgent', status: 'resolved' }) })).ok).toBe(false);
  });
});

describe('call and text policy', () => {
  const call = { type: 'call_person', personaId: 'sam', reason: 'r' } as const;
  it('calls a participant with a phone', () => expect(validateAction(call, ctx()).ok).toBe(true));
  it('blocks without phone', () => expect(validateAction(call, ctx({ phoneFor: () => undefined })).ok).toBe(false));
  it('blocks non-participants', () => expect(validateAction({ ...call, personaId: 'jordan' }, ctx()).ok).toBe(false));
  it('blocks emergency phone numbers', () => expect(validateAction(call, ctx({ phoneFor: () => '911' })).ok).toBe(false));
  it('limits to one call per person per 5 minutes', () => {
    const h = [act({ type: 'call_person', target: 'sam', createdAt: 1_000_000 - 60_000 })];
    expect(validateAction(call, ctx({ history: h })).ok).toBe(false);
    expect(validateAction(call, ctx({ history: [{ ...h[0]!, createdAt: 1_000_000 - 6 * 60_000 }] })).ok).toBe(true);
  });
  it('does not call the subject for a non-check incident', () => {
    expect(validateAction({ ...call, personaId: 'alex' }, ctx()).ok).toBe(false);
    expect(validateAction({ ...call, personaId: 'alex' }, ctx({ incident: incident({ kind: 'check-on-subject' }) })).ok).toBe(true);
  });
  it('texts only when someone opted in', () => {
    const t = { type: 'text_group', template: 'help_needed' } as const;
    expect(validateAction(t, ctx()).ok).toBe(true);
    expect(validateAction(t, ctx({ optedIn: () => false })).ok).toBe(false);
  });
});
