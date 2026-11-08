// Plain constants. Not re-exported from index.ts: the module entry may only export spacetime objects.
export const DEFAULT_NEMOTRON_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
export const DEFAULT_NEMOTRON_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const MODULE_VERSION = '0.9.1';
export const MAX_TTL_MINUTES = 1440;
export const INVITE_CODE_LENGTH = 6;
// Unambiguous uppercase alphabet: no 0/O/1/I.
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
