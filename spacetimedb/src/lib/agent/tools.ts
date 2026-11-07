import { TEMPLATE_NAMES } from './templates';

/** A tool call in the shape produced by both Nemotron (OpenAI tool_calls) and the simulated planner. */
export type ToolCall = { name: string; args: Record<string, unknown> };

export const MAX_FOLLOWUP_MINUTES = 30;
export const MAX_OPEN_FOLLOWUPS = 3;
export const DEFAULT_FOLLOWUP_MINUTES = 2;
export const MAX_TOOL_CALLS_PER_PLAN = 8;

export const UPDATE_STATES = ['acknowledged', 'assistance_underway', 'transport_pending'] as const;

export const TOOL_NAMES = [
  'get_group_context',
  'get_recent_checkins',
  'get_last_shared_location',
  'get_transport_options',
  'send_approved_message',
  'request_human_confirmation',
  'schedule_followup',
  'update_incident_state',
  'propose_ride_plan',
  'hand_off',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;
const hex64 = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v) ? v.toLowerCase() : undefined;

/**
 * Hand-written argument validation. Returns the normalized args or a rejection reason.
 * Authorization (consent, membership, state) is checked by the executor against the database.
 */
export function validateArgs(name: ToolName, args: Record<string, unknown>): { ok: true; args: Record<string, unknown> } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason });
  switch (name) {
    case 'get_group_context':
    case 'hand_off':
      return { ok: true, args: { reason: str(args.reason, 280) ?? '' } };
    case 'get_recent_checkins': {
      const userId = hex64(args.userId);
      const win = typeof args.windowMinutes === 'number' ? Math.floor(args.windowMinutes) : 60;
      if (!userId) return bad('userId must be a 64-hex identity');
      if (win < 1 || win > 240) return bad('windowMinutes must be 1..240');
      return { ok: true, args: { userId, windowMinutes: win } };
    }
    case 'get_last_shared_location': {
      const userId = hex64(args.userId);
      if (!userId) return bad('userId must be a 64-hex identity');
      return { ok: true, args: { userId } };
    }
    case 'get_transport_options':
      return { ok: true, args: { pickupArea: str(args.pickupArea, 120) ?? 'subject_last_location' } };
    case 'send_approved_message': {
      const recipient = hex64(args.recipient);
      const template = str(args.template, 40);
      if (!recipient) return bad('recipient must be a 64-hex identity');
      if (!template || !(TEMPLATE_NAMES as readonly string[]).includes(template)) return bad(`template must be one of ${TEMPLATE_NAMES.join(', ')}`);
      const vars: Record<string, string> = {};
      if (args.vars && typeof args.vars === 'object') {
        for (const [k, v] of Object.entries(args.vars as Record<string, unknown>)) {
          if (typeof v === 'string' && /^\w{1,32}$/.test(k)) vars[k] = v.slice(0, 120);
        }
      }
      return { ok: true, args: { recipient, template, vars } };
    }
    case 'request_human_confirmation': {
      const userId = hex64(args.userId);
      if (!userId) return bad('userId must be a 64-hex identity');
      return { ok: true, args: { userId, question: str(args.question, 200) ?? 'Can you help?' } };
    }
    case 'schedule_followup': {
      const m = typeof args.delayMinutes === 'number' ? Math.floor(args.delayMinutes) : NaN;
      if (!(m >= 1 && m <= MAX_FOLLOWUP_MINUTES)) return bad(`delayMinutes must be 1..${MAX_FOLLOWUP_MINUTES}`);
      return { ok: true, args: { delayMinutes: m } };
    }
    case 'update_incident_state': {
      const state = str(args.state, 40);
      if (!state || !(UPDATE_STATES as readonly string[]).includes(state)) return bad(`state must be one of ${UPDATE_STATES.join(', ')}`);
      return { ok: true, args: { state } };
    }
    case 'propose_ride_plan': {
      const riderId = hex64(args.riderId);
      if (!riderId) return bad('riderId must be a 64-hex identity');
      if (args.options === 'from_transport_lookup') return { ok: true, args: { riderId, options: 'from_transport_lookup' } };
      if (!Array.isArray(args.options) || args.options.length === 0 || args.options.length > 6) return bad('options must be 1..6 entries or "from_transport_lookup"');
      const options = (args.options as unknown[]).map(o => {
        const obj = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
        return {
          kind: str(obj.kind, 40) ?? 'other',
          label: str(obj.label, 80) ?? 'Option',
          url: typeof obj.url === 'string' && /^(https?:\/\/|uber:\/\/|lyft:\/\/)/.test(obj.url) ? obj.url.slice(0, 300) : '',
          source: 'model_proposed',
        };
      });
      return { ok: true, args: { riderId, options } };
    }
  }
}

/** OpenAI-compatible function tool definitions sent to Nemotron. */
export const TOOL_DEFINITIONS = [
  tool('get_group_context', 'Read roles, acknowledgment and consent flags for the incident participants. No locations.', {}),
  tool('get_recent_checkins', "Read the subject's recent check-in kinds (no notes).", {
    userId: { type: 'string', description: '64-hex identity of the incident subject' },
    windowMinutes: { type: 'integer', minimum: 1, maximum: 240 },
  }, ['userId']),
  tool('get_last_shared_location', 'Read how old the subject\'s last consented location is, rounded coordinates only.', {
    userId: { type: 'string' },
  }, ['userId']),
  tool('get_transport_options', 'Look up rideshare links and, where possible, a route estimate from the venue to the subject. Read-only; never books.', {
    pickupArea: { type: 'string', description: 'free-text hint; the server uses the consented last location' },
  }),
  tool('send_approved_message', 'Send a fixed-template message to ONE participant who has messaging consent from the subject. Templates: ' + TEMPLATE_NAMES.join(', ') + '.', {
    recipient: { type: 'string', description: '64-hex identity from the participants list with canMessage=true' },
    template: { type: 'string', enum: [...TEMPLATE_NAMES] },
    vars: { type: 'object', additionalProperties: { type: 'string' } },
  }, ['recipient', 'template']),
  tool('request_human_confirmation', 'Ask one participant (canMessage=true) to acknowledge they are helping.', {
    userId: { type: 'string' },
    question: { type: 'string', maxLength: 200 },
  }, ['userId']),
  tool('schedule_followup', 'Wake the agent again after a delay if no acknowledgment arrives (1..30 minutes).', {
    delayMinutes: { type: 'integer', minimum: 1, maximum: MAX_FOLLOWUP_MINUTES },
  }, ['delayMinutes']),
  tool('update_incident_state', 'Advance the incident to acknowledged, assistance_underway or transport_pending. Never resolves.', {
    state: { type: 'string', enum: [...UPDATE_STATES] },
  }, ['state']),
  tool('propose_ride_plan', 'Propose transport options for the subject. A human books; pass "from_transport_lookup" to use the options fetched earlier in this plan.', {
    riderId: { type: 'string' },
    options: { description: 'array of {kind,label,url} or the string "from_transport_lookup"' },
  }, ['riderId', 'options']),
  tool('hand_off', 'Stop automated coordination and hand the incident to the organizer when no eligible contact remains.', {
    reason: { type: 'string', maxLength: 280 },
  }),
];

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  };
}
