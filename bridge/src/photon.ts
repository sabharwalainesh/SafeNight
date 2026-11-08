import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';

// TODO: verify path against Photon 2.0 beta API reference.
export const PHOTON_MESSAGES_PATH = (projectId: string): string =>
  `https://api.photon.codes/v1/projects/${encodeURIComponent(projectId)}/messages`;

export interface TextResult {
  ok: boolean;
  simulated: boolean;
  detail: string;
}

export const photonSimulated = (c: Config): boolean =>
  c.simulateAll || !c.photonApiKey || !c.photonProjectId;

export async function sendText(
  c: Config,
  f: typeof fetch,
  args: { spaceId: string; senderId: string; text: string; idempotencyKey?: string },
): Promise<TextResult> {
  if (photonSimulated(c)) {
    console.log(`[SIMULATED text -> ${args.spaceId}] ${args.text}`);
    return { ok: true, simulated: true, detail: 'SIMULATED: text not actually sent' };
  }
  try {
    const res = await f(PHOTON_MESSAGES_PATH(c.photonProjectId), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${c.photonApiKey}`,
        'idempotency-key': args.idempotencyKey ?? randomUUID(),
      },
      body: JSON.stringify({
        spaceId: args.spaceId,
        senderId: args.senderId,
        content: { type: 'text', format: 'plain', text: args.text },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, simulated: false, detail: `Photon HTTP ${res.status}` };
    return { ok: true, simulated: false, detail: 'Text sent via Photon' };
  } catch (e) {
    return { ok: false, simulated: false, detail: `Photon error: ${(e as Error).message}` };
  }
}
