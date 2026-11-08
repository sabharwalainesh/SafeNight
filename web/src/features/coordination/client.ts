import type { IncidentPlan, SyncBody } from './types';

export const bridgeUrl = (): string | null => (import.meta.env.VITE_BRIDGE_URL || '').replace(/\/+$/, '') || null;

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['content-type'] = 'application/json';
  const t = import.meta.env.VITE_BRIDGE_TOKEN;
  if (t) h['x-bridge-token'] = t;
  return h;
}

export async function syncIncident(base: string, body: SyncBody, signal?: AbortSignal): Promise<void> {
  const r = await fetch(`${base}/v1/incidents/sync`, { method: 'POST', headers: headers(true), body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(`Bridge sync failed (${r.status})`);
}

export async function fetchPlan(base: string, id: string, signal?: AbortSignal): Promise<IncidentPlan> {
  const r = await fetch(`${base}/v1/incidents/${encodeURIComponent(id)}`, { headers: headers(false), signal });
  if (!r.ok) throw new Error(`Bridge unavailable (${r.status})`);
  const j = (await r.json()) as Partial<IncidentPlan>;
  return { decisions: Array.isArray(j.decisions) ? j.decisions : [], dispatch: j.dispatch ?? null };
}
