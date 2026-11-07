import type { Identity, Timestamp } from 'spacetimedb';

export const idStr = (v: bigint): string => String(v);
export const identityStr = (v: Identity): string => v.toHexString();
export const tsMs = (v: Timestamp): number => v.toDate().getTime();
export const optTsMs = (v: Timestamp | undefined | null): number | null => (v ? tsMs(v) : null);

/** `LocationPrecise` -> `location_precise`. */
export function tagToSnake(tag: string): string {
  return tag.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** `location_precise` -> `LocationPrecise`. */
export function snakeToTag(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

export const snakeEnum = (s: string): { tag: string } => ({ tag: snakeToTag(s) });
