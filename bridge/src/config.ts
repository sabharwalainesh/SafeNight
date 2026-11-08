export interface Config {
  port: number;
  host: string;
  bridgeToken: string;
  simulateAll: boolean;
  debounceMs: number;
  simDelayMs: number;
  callDelayMs: number;
  stateFile: string | null;
  nemotronBaseUrl: string;
  nemotronApiKey: string;
  nemotronModel: string;
  photonProjectId: string;
  photonProjectSecret: string;
  photonWebhookSecret: string;
  elevenLabsApiKey: string;
  elevenLabsWebhookSecret: string;
  buddyAgentId: string;
  dispatchAgentId: string;
  agentPhoneNumberId: string;
  demoDispatchNumber: string;
  blockedNumbers: string[];
  personaPhones: Record<string, string>;
  textChannel: 'imessage' | 'none';
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = (k: string): string => (env[k] ?? '').trim();
  const personaPhones: Record<string, string> = {};
  for (const p of ['alex', 'sam', 'maya', 'jordan']) {
    const v = e(`PHONE_${p.toUpperCase()}`);
    if (v) personaPhones[p] = v;
  }
  const tc = e('TEXT_CHANNEL').toLowerCase();
  const textChannel: 'imessage' | 'none' =
    tc === 'imessage' || tc === 'none' ? tc : e('PHOTON_PROJECT_ID') && e('PHOTON_PROJECT_SECRET') ? 'imessage' : 'none';
  return {
    textChannel,
    port: num(env.BRIDGE_PORT, 8787),
    host: e('BRIDGE_HOST') || '127.0.0.1',
    bridgeToken: e('BRIDGE_TOKEN'),
    simulateAll: e('SIMULATE_ALL') === '1',
    debounceMs: num(env.DEBOUNCE_MS, 1500),
    simDelayMs: num(env.SIM_DELAY_MS, 3000),
    callDelayMs: num(env.CALL_DELAY_MS, 45_000),
    stateFile: env.BRIDGE_STATE_FILE === undefined ? '.data/state.json' : env.BRIDGE_STATE_FILE || null,
    nemotronBaseUrl: e('NEMOTRON_BASE_URL') || 'https://integrate.api.nvidia.com/v1',
    nemotronApiKey: e('NEMOTRON_API_KEY'),
    nemotronModel: e('NEMOTRON_MODEL') || 'nvidia/nemotron-3.5-lightning-30b-a3b',
    photonProjectId: e('PHOTON_PROJECT_ID'),
    photonProjectSecret: e('PHOTON_PROJECT_SECRET'),
    photonWebhookSecret: e('PHOTON_WEBHOOK_SECRET'),
    elevenLabsApiKey: e('ELEVENLABS_API_KEY'),
    elevenLabsWebhookSecret: e('ELEVENLABS_WEBHOOK_SECRET'),
    buddyAgentId: e('ELEVENLABS_BUDDY_AGENT_ID'),
    dispatchAgentId: e('ELEVENLABS_DISPATCH_AGENT_ID'),
    agentPhoneNumberId: e('ELEVENLABS_AGENT_PHONE_NUMBER_ID'),
    demoDispatchNumber: e('DEMO_DISPATCH_NUMBER'),
    blockedNumbers: e('BLOCKED_NUMBERS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    personaPhones,
  };
}
