// Pure state machine for the UT Dallas demo. Timers live in the component; this file only says
// what happens next (`nextAuto`) and how each event changes the state (`reduce`).
import { MODEL, OPTIONS, type OptionId } from './scenario';

export type Phase = 'intro' | 'alert' | 'thinking' | 'options' | 'responding' | 'arrived' | 'resolved';
export type ThreadId = 'group' | 'maya';
export type Msg = { id: string; thread: ThreadId; from: string; text: string; at: number; via?: string };
export type FeedKind = 'checkin' | 'alert' | 'agent' | 'action' | 'arrived' | 'resolved';
export type Feed = { id: string; at: number; kind: FeedKind; text: string; simulated?: boolean };

export type EventKey =
  | 'jordan_ok'
  | 'sam_ok'
  | 'maya_missed'
  | 'alert'
  | 'think'
  | 'options'
  | 'jordan_reply'
  | 'maya_reply'
  | 'maya_thanks'
  | 'maya_home';

export type DemoState = {
  phase: Phase;
  done: EventKey[];
  messages: Msg[];
  feed: Feed[];
  unread: Record<ThreadId, number>;
  accepted: OptionId[];
  openedAt: number | null;
  arrivedAt: number | null;
  resolvedAt: number | null;
  /** When Nemotron started "thinking" (drives the streamed reasoning). */
  thinkAt: number | null;
  /** Increments on every new alert so the shell can show a toast once. */
  alertSeq: number;
  seq: number;
};

export type DemoAction =
  | { type: 'event'; key: EventKey; now: number }
  | { type: 'accept'; option: OptionId; now: number }
  | { type: 'arrive'; now: number }
  | { type: 'send'; thread: ThreadId; text: string; now: number }
  | { type: 'read'; thread: ThreadId }
  | { type: 'restart' };

export const initialState = (): DemoState => ({
  phase: 'intro',
  done: [],
  messages: [],
  feed: [],
  unread: { group: 0, maya: 0 },
  accepted: [],
  openedAt: null,
  arrivedAt: null,
  resolvedAt: null,
  thinkAt: null,
  alertSeq: 0,
  seq: 0,
});

const has = (s: DemoState, k: EventKey) => s.done.includes(k);

/** The scripted timeline: each event fires `delay` ms after it becomes ready. */
const SCRIPT: { key: EventKey; delay: number; ready: (s: DemoState) => boolean }[] = [
  { key: 'jordan_ok', delay: 2500, ready: () => true },
  { key: 'sam_ok', delay: 2500, ready: (s) => has(s, 'jordan_ok') },
  { key: 'maya_missed', delay: 3500, ready: (s) => has(s, 'sam_ok') },
  { key: 'alert', delay: 3000, ready: (s) => has(s, 'maya_missed') },
  { key: 'think', delay: 1200, ready: (s) => has(s, 'alert') },
  { key: 'options', delay: 9000, ready: (s) => has(s, 'think') },
  { key: 'jordan_reply', delay: 3500, ready: (s) => s.accepted.includes('go') },
  { key: 'maya_reply', delay: 5000, ready: (s) => has(s, 'jordan_reply') },
  { key: 'maya_thanks', delay: 2500, ready: (s) => s.arrivedAt !== null },
  { key: 'maya_home', delay: 7000, ready: (s) => has(s, 'maya_thanks') },
];

export function nextAuto(s: DemoState): { key: EventKey; delay: number } | null {
  const e = SCRIPT.find((x) => !has(s, x.key) && x.ready(s));
  return e ? { key: e.key, delay: e.delay } : null;
}

/** What "Trigger next event" does right now. */
export function nextManual(s: DemoState): DemoAction | null {
  const auto = nextAuto(s);
  if (auto) return { type: 'event', key: auto.key, now: 0 };
  if (s.phase === 'options') return { type: 'accept', option: 'go', now: 0 };
  if (s.phase === 'responding') return { type: 'arrive', now: 0 };
  return null;
}

type Draft = DemoState;
function msg(d: Draft, now: number, thread: ThreadId, from: string, text: string, via?: string) {
  d.seq += 1;
  d.messages = [...d.messages, { id: `m${d.seq}`, thread, from, text, at: now, via }];
  if (from !== 'me') d.unread = { ...d.unread, [thread]: d.unread[thread] + 1 };
}
function feed(d: Draft, now: number, kind: FeedKind, text: string, simulated?: boolean) {
  d.seq += 1;
  d.feed = [...d.feed, { id: `f${d.seq}`, at: now, kind, text, simulated }];
}

export function reduce(s: DemoState, a: DemoAction): DemoState {
  if (a.type === 'restart') return initialState();
  if (a.type === 'read') return s.unread[a.thread] === 0 ? s : { ...s, unread: { ...s.unread, [a.thread]: 0 } };
  const d: Draft = { ...s };
  const now = a.now;

  if (a.type === 'send') {
    const text = a.text.trim().slice(0, 500);
    if (!text) return s;
    msg(d, now, a.thread, 'me', text);
    return d;
  }

  if (a.type === 'accept') {
    if (s.accepted.includes(a.option) || !['options', 'responding', 'arrived'].includes(s.phase)) return s;
    d.accepted = [...s.accepted, a.option];
    switch (a.option) {
      case 'go':
        d.phase = s.phase === 'options' ? 'responding' : s.phase;
        feed(d, now, 'action', "You accepted: going to Maya. Precise location is now shared between you two until you arrive.");
        msg(d, now, 'group', 'agent', "Alex is on the way to Maya. Others: stay reachable.", 'SafeNight');
        msg(d, now, 'maya', 'agent', 'Alex is coming to you. Stay where you are if it feels safe.', 'SafeNight');
        break;
      case 'call_jordan':
        feed(d, now, 'action', 'Calling Jordan: AI voice call through ElevenLabs over the Photon line. Jordan answered: "On it."', true);
        msg(d, now, 'group', 'jordan', "Got the SafeNight call. Heading toward Residence Hall West too.");
        break;
      case 'text_group':
        feed(d, now, 'action', 'Group alert sent through Photon iMessage (help_needed template).', true);
        msg(
          d,
          now,
          'group',
          'agent',
          'SafeNight alert: Maya asked for help near the Residence Hall West lot and is not answering. Open SafeNight for her location.',
          'Photon iMessage',
        );
        break;
      case 'ride':
        feed(d, now, 'action', 'Ride options sent: Sam (driver) or Uber/Lyft links. Nothing booked automatically.');
        msg(d, now, 'group', 'sam', "Car's at Lot J. I can pick Maya up in 5 if she wants a ride home.");
        break;
      case 'dispatch':
        feed(d, now, 'action', 'SIMULATED dispatch call placed to the demo number. It never reaches 911.', true);
        break;
    }
    return d;
  }

  if (a.type === 'arrive') {
    if (s.arrivedAt !== null || !['responding', 'options'].includes(s.phase)) return s;
    d.phase = 'arrived';
    d.arrivedAt = now;
    feed(d, now, 'arrived', 'You reached Maya. Precise sharing between you two ends now.');
    msg(d, now, 'group', 'agent', 'Alex reached Maya. 💜', 'SafeNight');
    return d;
  }

  // Scripted events
  if (has(s, a.key)) return s;
  d.done = [...s.done, a.key];
  switch (a.key) {
    case 'jordan_ok':
      feed(d, now, 'checkin', "Jordan: I'm okay ✓");
      msg(d, now, 'group', 'jordan', "Checked in ✓ At ECSS finishing the hackathon demo.");
      break;
    case 'sam_ok':
      feed(d, now, 'checkin', 'Sam: okay ✓ (driver tonight, not drinking)');
      msg(d, now, 'group', 'sam', "All good at the Student Union. I'm driving tonight 🚗");
      break;
    case 'maya_missed':
      feed(d, now, 'agent', 'Maya missed her 10:30 PM check-in.');
      msg(d, now, 'maya', 'agent', 'Hi Maya, just checking in. Tap "I\'m okay" or "Need help".', 'SafeNight');
      break;
    case 'alert':
      d.phase = 'alert';
      d.openedAt = now;
      d.alertSeq += 1;
      feed(d, now, 'alert', 'Maya needs help near the Residence Hall West lot. Not answering.');
      msg(d, now, 'group', 'agent', '🚨 Maya tapped Need help near the Residence Hall West lot. Working out who can reach her…', 'SafeNight');
      break;
    case 'think':
      d.phase = 'thinking';
      d.thinkAt = now;
      feed(d, now, 'agent', `Nemotron (${MODEL}) is planning the response.`);
      break;
    case 'options':
      if (d.phase === 'thinking' || d.phase === 'alert') d.phase = 'options';
      feed(d, now, 'agent', `Nemotron proposed ${OPTIONS.length} options; every one passed the policy checks before it was shown.`);
      break;
    case 'jordan_reply':
      msg(d, now, 'group', 'jordan', 'I see Alex is closest. I\'ll head over from ECSS as backup.');
      break;
    case 'maya_reply':
      msg(d, now, 'maya', 'maya', "phone at 4%… I'm by the blue light pole in the lot. lost everyone after the party");
      feed(d, now, 'agent', 'Maya replied: by the blue light pole in the lot.');
      break;
    case 'maya_thanks':
      msg(d, now, 'maya', 'maya', "I'm okay now, thanks Alex 🙏");
      break;
    case 'maya_home':
      d.phase = 'resolved';
      d.resolvedAt = now;
      feed(d, now, 'resolved', 'Maya tapped "I\'m home". Incident resolved; only Maya could close it.');
      msg(d, now, 'group', 'maya', "Home safe 🏠 thank you all");
      msg(d, now, 'group', 'agent', 'Maya confirmed she is home. Incident resolved.', 'SafeNight');
      break;
  }
  return d;
}
