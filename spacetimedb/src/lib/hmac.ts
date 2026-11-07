// Pure-TypeScript SHA-1 and HMAC-SHA1 for Twilio webhook signature validation.
// The module runtime does not expose WebCrypto, so this is self-contained. Inputs are UTF-8.

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function sha1(message: Uint8Array): Uint8Array {
  const ml = message.length;
  const withOne = ml + 1;
  const padded = Math.ceil((withOne + 8) / 64) * 64;
  const buf = new Uint8Array(padded);
  buf.set(message);
  buf[ml] = 0x80;
  const bits = ml * 8;
  // 64-bit big-endian length; messages here are far below 2^32 bits.
  buf[padded - 4] = (bits >>> 24) & 0xff;
  buf[padded - 3] = (bits >>> 16) & 0xff;
  buf[padded - 2] = (bits >>> 8) & 0xff;
  buf[padded - 1] = bits & 0xff;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((buf[j]! << 24) | (buf[j + 1]! << 16) | (buf[j + 2]! << 8) | buf[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 80; i++) w[i] = rotl((w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!) >>> 0, 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]!) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  for (const [i, h] of [h0, h1, h2, h3, h4].entries()) {
    out[i * 4] = (h >>> 24) & 0xff; out[i * 4 + 1] = (h >>> 16) & 0xff; out[i * 4 + 2] = (h >>> 8) & 0xff; out[i * 4 + 3] = h & 0xff;
  }
  return out;
}

export function hmacSha1(key: string, message: string): Uint8Array {
  let k = utf8(key);
  if (k.length > 64) k = sha1(k);
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = block[i]! ^ 0x36; opad[i] = block[i]! ^ 0x5c; }
  const msg = utf8(message);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  const innerHash = sha1(inner);
  const outer = new Uint8Array(64 + 20);
  outer.set(opad); outer.set(innerHash, 64);
  return sha1(outer);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!, b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2]!;
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    out += b2 === undefined ? '=' : B64[b2 & 63]!;
  }
  return out;
}

export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Twilio request signature: Base64(HMAC-SHA1(authToken, url + concat(sorted(key+value)))).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  return base64(hmacSha1(authToken, data));
}

/** Constant-time string comparison (both inputs short). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
