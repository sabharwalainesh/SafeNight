// Runs before anything else (see ../index.ts). React Native (Hermes) has WebSocket,
// TextEncoder and, on current versions, TextDecoder; older runtimes get a polyfill.
// `window` is aliased to the global by React Native itself, so the web adapters'
// `window.setInterval` works unchanged; `window.localStorage` is shimmed below.
import { installLocalStorage } from './localStorageShim';

const g = globalThis as Record<string, unknown>;

if (typeof g.TextDecoder === 'undefined' || typeof g.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fast-text-encoding');
}
if (typeof g.window === 'undefined') {
  g.window = globalThis;
}

installLocalStorage();
