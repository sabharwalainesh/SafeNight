import { describe, expect, it } from 'vitest';
import { healthUrl, httpBase, isPersonaId, normalizeWsHost, tokenKey } from '../settings';

describe('server settings helpers', () => {
  it('normalizes bare hosts and http(s) URLs to ws(s) without trailing slashes', () => {
    expect(normalizeWsHost('192.168.1.10:3000')).toBe('ws://192.168.1.10:3000');
    expect(normalizeWsHost('http://localhost:3000/')).toBe('ws://localhost:3000');
    expect(normalizeWsHost('https://maincloud.spacetimedb.com')).toBe('wss://maincloud.spacetimedb.com');
    expect(normalizeWsHost('  wss://maincloud.spacetimedb.com// ')).toBe('wss://maincloud.spacetimedb.com');
  });
  it('maps ws(s) back to http(s) for REST routes', () => {
    expect(httpBase('ws://11.80.0.178:3000')).toBe('http://11.80.0.178:3000');
    expect(httpBase('wss://maincloud.spacetimedb.com')).toBe('https://maincloud.spacetimedb.com');
    expect(healthUrl('ws://127.0.0.1:3000', 'safenight')).toBe('http://127.0.0.1:3000/v1/database/safenight/route/health');
  });
  it('keys tokens per host, database and persona, matching the web client', () => {
    expect(tokenKey('ws://localhost:3000', 'safenight', 'sam')).toBe('ws://localhost:3000/safenight/sam/auth_token');
    expect(tokenKey('http://localhost:3000/', 'safenight', 'maya')).toBe('ws://localhost:3000/safenight/maya/auth_token');
    expect(tokenKey('ws://a:3000', 'db', 'alex')).not.toBe(tokenKey('ws://b:3000', 'db', 'alex'));
  });
  it('recognizes only the four demo personas', () => {
    expect(isPersonaId('jordan')).toBe(true);
    expect(isPersonaId('judge')).toBe(false);
    expect(isPersonaId(null)).toBe(false);
  });
});
