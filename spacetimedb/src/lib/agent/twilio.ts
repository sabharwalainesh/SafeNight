import { TimeDuration } from 'spacetimedb';
import type { ProcedureCtx, InferSchema } from 'spacetimedb/server';
import type { spacetimedb } from '../../schema';

type PCtx = ProcedureCtx<InferSchema<typeof spacetimedb>>;

export type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };

export function twilioConfig(env: Record<string, string | undefined>): TwilioConfig | undefined {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_FROM_NUMBER: fromNumber } = env;
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : undefined;
}

export type SmsResult = { ok: boolean; providerId: string; error?: string };

/** POST to Twilio's Messages endpoint with HTTP Basic auth. Throws nothing; returns the outcome. */
export function sendSms(ctx: PCtx, cfg: TwilioConfig, to: string, body: string): SmsResult {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
    const form = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(cfg.fromNumber)}&Body=${encodeURIComponent(body)}`;
    const response = ctx.http.fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${base64(`${cfg.accountSid}:${cfg.authToken}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: form,
      timeout: TimeDuration.fromMillis(10_000),
    });
    if (response.status < 200 || response.status >= 300) return { ok: false, providerId: '', error: `twilio_http_${response.status}` };
    const data = response.json();
    return { ok: true, providerId: typeof data?.sid === 'string' ? data.sid : '' };
  } catch (e) {
    return { ok: false, providerId: '', error: e instanceof Error ? e.message : String(e) };
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63]! + B64[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[triple & 63]! : '=';
  }
  return out;
}
