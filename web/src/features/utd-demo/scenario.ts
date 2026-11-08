// Hardcoded UT Dallas demo scenario: the people, where they are, and what the scripted agent says.
// Everything here is demo data. Positions are real campus spots; the people are not real.
import type { LatLng } from '../meetup/geo';

export const UTD_CENTER: LatLng = { lat: 32.9858, lng: -96.7501 };
/** Where "You" stand when this device is not near campus (the Plinth). */
export const PLINTH: LatLng = { lat: 32.9857, lng: -96.7497 };
/** Real GPS is used for "You" only within this distance of campus. */
export const NEAR_CAMPUS_M = 3000;
export const ARRIVE_WITHIN_M = 15;

export type PersonId = 'jordan' | 'sam' | 'priya' | 'diego' | 'maya';
export type Person = {
  id: PersonId;
  name: string;
  emoji: string;
  color: string;
  role: string;
  spot: string;
  home: LatLng;
};

export const PEOPLE: Person[] = [
  { id: 'jordan', name: 'Jordan', emoji: '🌙', color: '#5e5ce6', role: 'Backup buddy', spot: 'ECSS building', home: { lat: 32.9866, lng: -96.7502 } },
  { id: 'sam', name: 'Sam', emoji: '🚗', color: '#0a84ff', role: 'Driver tonight', spot: 'Student Union', home: { lat: 32.9869, lng: -96.7488 } },
  { id: 'priya', name: 'Priya', emoji: '📚', color: '#ff9f0a', role: 'Friend', spot: 'McDermott Library', home: { lat: 32.9862, lng: -96.7476 } },
  { id: 'diego', name: 'Diego', emoji: '☕️', color: '#30b0c7', role: 'Friend', spot: 'Comet Cafe', home: { lat: 32.9889, lng: -96.7521 } },
  { id: 'maya', name: 'Maya', emoji: '🌿', color: '#ff453a', role: 'Friend', spot: 'Residence Hall West lot', home: { lat: 32.9909, lng: -96.754 } },
];

export const personById = (id: string): Person | undefined => PEOPLE.find((p) => p.id === id);

export const GROUP_NAME = 'Comets night out';
export const MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';

export type OptionId = 'go' | 'call_jordan' | 'text_group' | 'ride' | 'dispatch';
export type NemotronOption = {
  id: OptionId;
  rank: number;
  title: string;
  detail: string;
  tool: string;
  checks: { label: string; ok: boolean }[];
  recommended?: boolean;
  caution?: string;
};

/** Streamed "thinking" for the scripted Nemotron panel. */
export const REASONING =
  "Maya asked for help at 10:41 PM near the Residence Hall West lot and has not answered two check-ins. " +
  'Her phone last reported 4 minutes ago (precise, ±8 m). Nobody has acknowledged yet. ' +
  "You are the closest friend by walking route, so the least escalation that is safe is asking you to go to her. " +
  'In parallel, Jordan (backup buddy) can be called by voice, and the group can be texted. ' +
  'Sam is the designated driver and can be offered as a ride. ' +
  'Dispatch is not warranted yet: there is no report of injury or immediate danger, and friends are responding.';

export const OPTIONS: NemotronOption[] = [
  {
    id: 'go',
    rank: 1,
    title: 'Ask you to go to Maya',
    detail: "You're the closest friend. Opens walking directions and the compass; Maya sees you're coming.",
    tool: 'offer_to_come',
    recommended: true,
    checks: [
      { label: 'Least escalation that is safe', ok: true },
      { label: 'Precise location shared only between you two', ok: true },
    ],
  },
  {
    id: 'call_jordan',
    rank: 2,
    title: 'Call Jordan (backup buddy)',
    detail: 'AI voice call through ElevenLabs over the Photon line: "Maya may need help near Residence Hall West. Can you check on her?"',
    tool: 'call_person',
    checks: [
      { label: 'Jordan opted in to safety calls', ok: true },
      { label: 'Call cooldown respected', ok: true },
    ],
  },
  {
    id: 'text_group',
    rank: 3,
    title: 'Text the group',
    detail: 'Fixed-format alert through Photon iMessage. The server writes the text; the model only picks the template.',
    tool: 'text_group',
    checks: [
      { label: 'Template only, no free text from the model', ok: true },
      { label: 'Only opted-in friends', ok: true },
    ],
  },
  {
    id: 'ride',
    rank: 4,
    title: 'Offer a ride home',
    detail: 'Sam (designated driver) or Uber/Lyft deep links. Nothing is booked automatically; a person confirms.',
    tool: 'ride_options',
    checks: [
      { label: 'Never auto-books', ok: true },
      { label: 'Driver accepted the role tonight', ok: true },
    ],
  },
  {
    id: 'dispatch',
    rank: 5,
    title: 'Dispatch call',
    detail: 'Only if nobody responds and danger is credible. SIMULATED: calls a demo number, never 911.',
    tool: 'dispatch_call',
    caution: 'Not recommended now: friends are responding.',
    checks: [
      { label: 'Credible danger', ok: false },
      { label: 'Friends unresponsive', ok: false },
    ],
  },
];

export const RIDE_LINKS = [
  { label: 'Uber', url: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location' },
  { label: 'Lyft', url: 'https://lyft.com/ride?id=lyft' },
];
