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

// The SpacetimeDB SDK registers window/document "focus", "online", "pageshow" and
// "visibilitychange" listeners after the socket opens to detect resume. React Native's
// global has no EventTarget API, so provide no-op listeners (AppState handles resume
// via the SDK's automatic reconnect instead).
const w = g.window as Record<string, unknown>;
if (typeof w.addEventListener !== 'function') {
  w.addEventListener = () => {};
  w.removeEventListener = () => {};
  w.dispatchEvent = () => true;
}
if (typeof g.document !== 'undefined') {
  const d = g.document as Record<string, unknown>;
  if (typeof d.addEventListener !== 'function') {
    d.addEventListener = () => {};
    d.removeEventListener = () => {};
  }
}

installLocalStorage();
