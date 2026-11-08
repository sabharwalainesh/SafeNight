import type { Config } from './config.js';
import type { IncidentSnapshot } from './types.js';

export const ELEVENLABS_OUTBOUND_URL = 'https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call';

export interface CallResult {
  ok: boolean;
  simulated: boolean;
  detail: string;
  conversationId?: string;
}

export type CallType = 'buddy' | 'dispatch_simulated';

export function buildDynamicVars(
  inc: IncidentSnapshot,
  callType: CallType,
  personName: string,
  openedAt: number,
  now: number,
  summary?: string,
): Record<string, string | number> {
  const loc = inc.lastLocation;
  return {
    call_type: callType,
    person_name: personName,
    location_text: loc
      ? `${inc.venue || 'unknown venue'}${loc.approximate ? ' (approximate)' : ''}`
      : inc.venue || 'location unknown',
    maps_url: loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : '',
    situation: (summary || `${inc.kind} (${inc.severity}) during ${inc.sessionName}`).slice(0, 280),
    reporter: inc.subjectName,
    minutes_since: Math.max(0, Math.round((now - openedAt) / 60_000)),
    callback_note: 'Reply in the SafeNight text thread or open the SafeNight app.',
  };
}

export async function placeCall(
  c: Config,
  f: typeof fetch,
  args: { callType: CallType; to: string; vars: Record<string, string | number> },
): Promise<CallResult> {
  const agentId = args.callType === 'buddy' ? c.buddyAgentId : c.dispatchAgentId;
  const simulated = c.simulateAll || !c.elevenLabsApiKey || !agentId || !c.agentPhoneNumberId;
  if (simulated) {
    console.log(`[SIMULATED ${args.callType} call] vars=${JSON.stringify(args.vars)}`);
    return { ok: true, simulated: true, detail: 'SIMULATED: no real call placed' };
  }
  try {
    const res = await f(ELEVENLABS_OUTBOUND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': c.elevenLabsApiKey },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: c.agentPhoneNumberId,
        to_number: args.to,
        conversation_initiation_client_data: { dynamic_variables: args.vars },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, simulated: false, detail: `ElevenLabs HTTP ${res.status}` };
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; conversation_id?: string; message?: string };
    if (j.success === false) return { ok: false, simulated: false, detail: `ElevenLabs: ${j.message ?? 'call rejected'}` };
    return { ok: true, simulated: false, detail: 'Call placed', conversationId: j.conversation_id };
  } catch (e) {
    return { ok: false, simulated: false, detail: `ElevenLabs error: ${(e as Error).message}` };
  }
}
