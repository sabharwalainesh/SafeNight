import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from './config.js';
import { Engine } from './engine.js';
import type { IncidentSnapshot } from './types.js';
import { parseInboundText, verifyElevenLabs, verifyPhoton } from './webhooks.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY = 512 * 1024;
const SYNC_LIMIT = 30;
const SYNC_WINDOW_MS = 60_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const safeEq = (a: string, b: string): boolean => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function validSnapshot(x: any): x is IncidentSnapshot {
  return !!x && typeof x.id === 'string' && x.id.length > 0 && typeof x.kind === 'string' &&
    typeof x.severity === 'string' && typeof x.status === 'string' &&
    Array.isArray(x.participants) && Array.isArray(x.recentCheckins ?? []) && Array.isArray(x.events ?? []);
}

export function createApp(config: Config, engine: Engine) {
  const hits = new Map<string, number[]>();
  const limited = (ip: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < SYNC_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < SYNC_WINDOW_MS)) hits.delete(k);
    return recent.length > SYNC_LIMIT;
  };
  return async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && LOCAL_ORIGIN.test(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'content-type, x-bridge-token');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://bridge.local');
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/health') return send(200, { ok: true });

      if (req.method === 'POST' && path === '/v1/webhooks/elevenlabs') {
        const raw = await readBody(req);
        if (!verifyElevenLabs(raw, req.headers['elevenlabs-signature'] as string | undefined, config.elevenLabsWebhookSecret)) {
          return send(401, { error: 'bad signature' });
        }
        return send(200, engine.handleElevenLabs(JSON.parse(raw)));
      }
      if (req.method === 'POST' && path === '/v1/webhooks/photon') {
        const raw = await readBody(req);
        const payload = verifyPhoton(raw, req.headers, config.photonWebhookSecret);
        if (payload === null) return send(401, { error: 'bad signature' });
        const m = parseInboundText(payload);
        return send(200, { result: m ? await engine.handleInbound(m) : 'ignored' });
      }

      if (path.startsWith('/v1/incidents')) {
        if (!config.bridgeToken) return send(500, { error: 'BRIDGE_TOKEN not configured' });
        if (!safeEq(String(req.headers['x-bridge-token'] ?? ''), config.bridgeToken)) return send(401, { error: 'unauthorized' });

        if (req.method === 'POST' && path === '/v1/incidents/sync') {
          if (limited(req.socket.remoteAddress ?? 'unknown')) return send(429, { error: 'rate limited' });
          let body: any;
          try { body = JSON.parse(await readBody(req)); } catch { return send(400, { error: 'invalid json' }); }
          if (!validSnapshot(body?.incident)) return send(400, { error: 'invalid incident' });
          const inc = body.incident as IncidentSnapshot;
          inc.recentCheckins ??= []; inc.events ??= [];
          engine.sync(inc);
          return send(202, { queued: true });
        }
        const m = /^\/v1\/incidents\/([^/]+)$/.exec(path);
        if (req.method === 'GET' && m) {
          const v = engine.view(decodeURIComponent(m[1]!));
          return send(200, v ?? { decisions: [], dispatch: null });
        }
      }
      send(404, { error: 'not found' });
    } catch (e) {
      console.error('[server]', e);
      if (!res.headersSent) send(500, { error: 'internal error' });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const engine = new Engine(config);
  setInterval(() => engine.tick(), 30_000).unref();
  engine.photon.start((m) => engine.handleInbound(m)).catch((e) => console.error(`[photon] failed to start: ${(e as Error).message}`));
  createServer(createApp(config, engine)).listen(config.port, config.host, () => {
    const mode = (k: boolean) => (k ? 'live' : 'SIMULATED');
    console.log(`SafeNight bridge on ${config.host}:${config.port}`);
    if (config.host !== '127.0.0.1' && config.host !== 'localhost') console.warn('  WARNING: BRIDGE_HOST exposes the bridge beyond this machine; protect it with a firewall/TLS');
    console.log(`  nemotron: ${config.nemotronApiKey && !config.simulateAll ? 'live' : 'simulated-planner'}`);
    console.log(`  photon: ${mode(!engine.photon.simulated)}`);
    console.log(`  elevenlabs: ${mode(!!config.elevenLabsApiKey && !!config.agentPhoneNumberId && !config.simulateAll)}`);
    if (!config.bridgeToken) console.warn('  WARNING: BRIDGE_TOKEN unset; incident routes will refuse requests');
  });
}
