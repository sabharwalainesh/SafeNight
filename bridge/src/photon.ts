import type { Config } from './config.js';

export interface TextResult {
  ok: boolean;
  simulated: boolean;
  /** true when blocked because the person never texted the SafeNight line */
  noSpace?: boolean;
  detail: string;
}

/** Minimal slice of a spectrum-ts Space / Message that this bridge relies on. */
export interface SpaceLike {
  id: string;
  send(content: string): Promise<unknown>;
}
export interface InboundMessage {
  text: string;
  spaceId: string;
  senderId: string;
  phone?: string;
}

export const photonSimulated = (c: Config): boolean =>
  c.simulateAll || !c.photonProjectId || !c.photonProjectSecret;

const PHONE_LIKE = /^\+?[\d\s().-]{7,}$/;
export const phoneLike = (s: unknown): string | undefined =>
  typeof s === 'string' && PHONE_LIKE.test(s.trim()) ? s.trim() : undefined;

/** E.164-ish normalisation: digits only with a leading +; bare 10 digits assume +1. */
export function normalizePhone(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const digits = p.replace(/\D/g, '');
  if (digits.length < 7) return undefined;
  if (!p.trim().startsWith('+') && digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** Keeps the latest Space per conversation (needed to send; the shared line cannot cold-start). */
export class PhotonLink {
  private spaces = new Map<string, SpaceLike>();
  private app: { stop(): Promise<void> } | null = null;
  constructor(private config: Config) {}

  get simulated(): boolean { return photonSimulated(this.config); }
  remember(space: SpaceLike): void { this.spaces.set(space.id, space); }
  hasSpace(spaceId: string): boolean { return this.spaces.has(spaceId); }

  /** Start consuming inbound iMessages. No-op (returns false) in SIMULATED mode. */
  async start(onInbound: (m: InboundMessage) => Promise<unknown>): Promise<boolean> {
    if (this.simulated) return false;
    const { Spectrum } = await import('spectrum-ts');
    const { imessage } = await import('spectrum-ts/providers/imessage');
    const app = await Spectrum({
      projectId: this.config.photonProjectId,
      projectSecret: this.config.photonProjectSecret,
      providers: [imessage.config()],
    });
    this.app = app;
    void (async () => {
      try {
        for await (const [space, message] of app.messages) {
          try {
            if (message.direction !== 'inbound' || message.content.type !== 'text') continue;
            this.remember(space as unknown as SpaceLike);
            const senderId = message.sender?.id ?? '';
            await onInbound({ text: message.content.text, spaceId: space.id, senderId, phone: phoneLike(senderId) });
          } catch (e) {
            console.warn(`[photon] inbound handler error: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        console.error(`[photon] message stream ended: ${(e as Error).message}`);
      }
    })();
    return true;
  }

  async stop(): Promise<void> { await this.app?.stop(); this.app = null; }

  async send(args: { spaceId: string; text: string; name?: string }): Promise<TextResult> {
    if (this.simulated) {
      console.log(`[SIMULATED text -> ${args.spaceId}] ${args.text}`);
      return { ok: true, simulated: true, detail: 'SIMULATED: text not actually sent' };
    }
    const space = this.spaces.get(args.spaceId);
    if (!space) {
      return { ok: false, simulated: false, noSpace: true, detail: `Ask ${args.name ?? 'them'} to text the SafeNight line first` };
    }
    try {
      await space.send(args.text);
      return { ok: true, simulated: false, detail: 'Text sent via Photon (iMessage)' };
    } catch (e) {
      return { ok: false, simulated: false, detail: `Photon error: ${(e as Error).message}` };
    }
  }
}
