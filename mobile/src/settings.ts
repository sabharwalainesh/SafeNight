// Pure helpers for server settings and per-persona identity keys (unit-tested).
export type PersonaId = 'sam' | 'alex' | 'maya' | 'jordan';
export const PERSONA_IDS: readonly PersonaId[] = ['alex', 'sam', 'maya', 'jordan'];

export const DEFAULT_HOST = process.env.EXPO_PUBLIC_SPACETIMEDB_HOST ?? 'ws://11.80.0.178:3000';
export const DEFAULT_DB = process.env.EXPO_PUBLIC_SPACETIMEDB_DB_NAME ?? 'safenight';

/** Accepts "host:3000", "http(s)://host", "ws(s)://host/" and returns a ws(s):// URL without a trailing slash. */
export function normalizeWsHost(input: string): string {
  let s = input.trim();
  if (!s) return DEFAULT_HOST;
  s = s.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  if (!/^wss?:\/\//i.test(s)) s = `ws://${s}`;
  return s.replace(/\/+$/, '');
}

/** ws(s):// -> http(s):// for the REST/health routes. */
export function httpBase(wsHost: string): string {
  return normalizeWsHost(wsHost).replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
}

export function healthUrl(wsHost: string, db: string): string {
  return `${httpBase(wsHost)}/v1/database/${encodeURIComponent(db)}/route/health`;
}

/** Same scheme as the web client, so a phone keeps one identity per persona and server. */
export function tokenKey(wsHost: string, db: string, persona: PersonaId): string {
  return `${normalizeWsHost(wsHost)}/${db}/${persona}/auth_token`;
}

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && (PERSONA_IDS as readonly string[]).includes(v);
}
