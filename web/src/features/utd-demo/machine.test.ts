import { describe, expect, it } from 'vitest';
import { initialState, nextAuto, nextManual, reduce, type DemoState, type EventKey } from './machine';

const fire = (s: DemoState, key: EventKey, now = 1000) => reduce(s, { type: 'event', key, now });

describe('UTD demo state machine', () => {
  it('runs the scripted timeline in order and opens the alert', () => {
    let s = initialState();
    const order: EventKey[] = [];
    for (let i = 0; i < 6; i++) {
      const n = nextAuto(s)!;
      order.push(n.key);
      s = fire(s, n.key, 1000 + i);
    }
    expect(order).toEqual(['jordan_ok', 'sam_ok', 'maya_missed', 'alert', 'think', 'options']);
    expect(s.phase).toBe('options');
    expect(s.alertSeq).toBe(1);
    expect(s.unread.group).toBeGreaterThan(0);
    // Nothing auto-fires until a human accepts an option.
    expect(nextAuto(s)).toBeNull();
    expect(nextManual(s)).toEqual({ type: 'accept', option: 'go', now: 0 });
  });

  it('accepting "go" starts the response, arrival and Maya going home resolve it', () => {
    let s = initialState();
    for (const k of ['jordan_ok', 'sam_ok', 'maya_missed', 'alert', 'think', 'options'] as EventKey[]) s = fire(s, k);
    s = reduce(s, { type: 'accept', option: 'go', now: 2000 });
    expect(s.phase).toBe('responding');
    expect(s.accepted).toEqual(['go']);
    expect(nextAuto(s)?.key).toBe('jordan_reply');
    // Accepting twice is a no-op.
    expect(reduce(s, { type: 'accept', option: 'go', now: 2001 })).toBe(s);
    s = fire(s, 'jordan_reply');
    s = fire(s, 'maya_reply');
    s = reduce(s, { type: 'arrive', now: 3000 });
    expect(s.phase).toBe('arrived');
    expect(s.arrivedAt).toBe(3000);
    expect(nextAuto(s)?.key).toBe('maya_thanks');
    s = fire(s, 'maya_thanks');
    s = fire(s, 'maya_home', 4000);
    expect(s.phase).toBe('resolved');
    expect(s.resolvedAt).toBe(4000);
    expect(nextAuto(s)).toBeNull();
    expect(nextManual(s)).toBeNull();
  });

  it('messages count as unread until the thread is read; sending never adds unread', () => {
    let s = fire(initialState(), 'jordan_ok');
    expect(s.unread.group).toBe(1);
    s = reduce(s, { type: 'send', thread: 'group', text: '  on my way  ', now: 5 });
    expect(s.messages[s.messages.length - 1]?.text).toBe('on my way');
    expect(s.unread.group).toBe(1);
    s = reduce(s, { type: 'read', thread: 'group' });
    expect(s.unread.group).toBe(0);
    expect(reduce(s, { type: 'send', thread: 'group', text: '   ', now: 6 })).toBe(s);
  });

  it('dispatch is labeled simulated and restart clears everything', () => {
    let s = initialState();
    for (const k of ['jordan_ok', 'sam_ok', 'maya_missed', 'alert', 'think', 'options'] as EventKey[]) s = fire(s, k);
    s = reduce(s, { type: 'accept', option: 'dispatch', now: 10 });
    expect(s.feed[s.feed.length - 1]?.simulated).toBe(true);
    expect(s.feed[s.feed.length - 1]?.text).toMatch(/never reaches 911/);
    expect(reduce(s, { type: 'restart' })).toEqual(initialState());
  });
});
