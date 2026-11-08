/** Largest request body the webhook accepts (Twilio status callbacks are a few hundred bytes). */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

/**
 * Parse an application/x-www-form-urlencoded body. Returns undefined when a percent-escape is
 * malformed instead of throwing, so the handler can answer 400 rather than fail.
 */
export function parseForm(body: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  try {
    for (const pair of body.split('&')) {
      if (!pair) continue;
      const idx = pair.indexOf('=');
      const k = decodeURIComponent((idx === -1 ? pair : pair.slice(0, idx)).replace(/\+/g, ' '));
      const v = idx === -1 ? '' : decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
      out[k] = v;
    }
  } catch {
    return undefined;
  }
  return out;
}
