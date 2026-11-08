import { createHmac, timingSafeEqual } from 'node:crypto';
import { Webhook } from 'standardwebhooks';

const TOLERANCE_S = 30 * 60;

/** ElevenLabs header format: `t=<unix>,v0=<hex hmac-sha256 of "<t>.<body>">`. */
export function verifyElevenLabs(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts['t'];
  const v0 = parts['v0'];
  if (!t || !v0 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v0.replace(/^v0=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signElevenLabs(rawBody: string, secret: string, nowMs = Date.now()): string {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v0=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}

/** Standard Webhooks verification; returns parsed payload or null. */
export function verifyPhoton(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): unknown | null {
  if (!secret) return null;
  const h: Record<string, string> = {};
  for (const k of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const v = headers[k];
    if (typeof v === 'string') h[k] = v;
  }
  try {
    return new Webhook(secret).verify(rawBody, h);
  } catch {
    return null;
  }
}

export interface InboundText {
  text: string;
  spaceId: string;
  senderId: string;
  phone?: string;
}

/** Defensive extraction; verify against the Photon 2.0 beta webhook reference. */
export function parseInboundText(payload: unknown): InboundText | null {
  const p = payload as Record<string, any> | null;
  if (!p || typeof p !== 'object') return null;
  const d = (p.data && typeof p.data === 'object' ? p.data : p) as Record<string, any>;
  const text = d.content?.text ?? d.text ?? d.message?.content?.text;
  const spaceId = d.spaceId ?? d.space?.id;
  const senderId = d.senderId ?? d.sender?.id;
  if (typeof text !== 'string' || !spaceId || !senderId) return null;
  const phone = d.sender?.phone ?? d.senderPhone ?? (/^\+?\d{7,}$/.test(String(senderId)) ? String(senderId) : undefined);
  return { text, spaceId: String(spaceId), senderId: String(senderId), phone: phone ? String(phone) : undefined };
}

export const JOIN_RE = /^join\s+(alex|sam|maya|jordan)$/i;

const POSITIVE = /\b(yes|yeah|yep|confirmed?|on (my|the|their) way|safe|ok(ay)?)\b/i;
const NEGATIVE = /\b(declined|refused|did not|didn't|unable|not (able|available|sure)|no answer|voicemail|said no)\b/i;
export const summaryIndicatesYes = (s: string): boolean => POSITIVE.test(s) && !NEGATIVE.test(s);
