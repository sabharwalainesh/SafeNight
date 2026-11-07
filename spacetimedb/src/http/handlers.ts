import { Router, SyncResponse } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { DEFAULT_NEMOTRON_MODEL, MODULE_VERSION } from '../lib/constants';
import { envOf } from '../lib/env';
import { timingSafeEqual, twilioSignature } from '../lib/hmac';

const json = (body: unknown, status = 200) =>
  new SyncResponse(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// GET /health: liveness plus which integrations are live. Never returns secret values.
export const health = spacetimedb.httpHandler((ctx, _req) => {
  const env = envOf(ctx);
  const messagingLive = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  const meta = ctx.withTx(tx => tx.db.moduleMeta.id.find(0));
  return json({
    ok: true,
    moduleVersion: meta?.moduleVersion ?? MODULE_VERSION,
    nemotronMode: env.NEMOTRON_API_KEY ? 'live' : 'simulated',
    nemotronModel: env.NEMOTRON_MODEL ?? DEFAULT_NEMOTRON_MODEL,
    messagingMode: messagingLive ? 'live' : 'simulated',
  });
});

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const k = decodeURIComponent((idx === -1 ? pair : pair.slice(0, idx)).replace(/\+/g, ' '));
    const v = idx === -1 ? '' : decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

/**
 * POST /webhooks/twilio: Twilio message status callbacks. Only meaningful when messaging is live.
 * Validates `X-Twilio-Signature` (HMAC-SHA1 of the public URL + sorted form params, keyed by the auth
 * token). Twilio signs the URL it was given, so set `TWILIO_WEBHOOK_URL`-style configuration on the
 * Twilio side to exactly `$SPACETIMEDB_URI/v1/database/safenight/route/webhooks/twilio`.
 */
export const twilioWebhook = spacetimedb.httpHandler((ctx, req) => {
  const env = envOf(ctx);
  const live = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  if (!live || !env.TWILIO_AUTH_TOKEN) return json({ error: 'messaging not configured' }, 404);
  const body = req.text();
  const params = parseForm(body);
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const expected = twilioSignature(env.TWILIO_AUTH_TOKEN, req.url, params);
  if (!signature || !timingSafeEqual(signature, expected)) return json({ error: 'invalid signature' }, 403);
  const sid = params.MessageSid ?? '';
  const status = (params.MessageStatus ?? '').toLowerCase();
  if (!sid) return json({ error: 'MessageSid required' }, 400);
  const mapped = status === 'delivered' ? 'delivered' : status === 'failed' || status === 'undelivered' ? 'failed' : undefined;
  const updated = ctx.withTx(tx => {
    let n = 0;
    if (!mapped) return 0;
    for (const row of tx.db.notification.iter()) {
      if (row.providerId !== sid) continue;
      if (row.status.tag === 'acknowledged') continue;
      tx.db.notification.id.update({ ...row, status: { tag: mapped } });
      n++;
    }
    return n;
  });
  return json({ ok: true, updated, status: mapped ?? 'ignored' });
});

export const router = spacetimedb.httpRouter(
  new Router().get('/health', health).post('/webhooks/twilio', twilioWebhook)
);
