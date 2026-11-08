# SafeNight mobile (Expo Go)

The phone app for judging: the same SafeNight product as the web client, as a React Native app you open in **Expo Go**. It talks to the same SpacetimeDB database as the laptops, so two phones and two laptops act as four people in one Night Out.

It is a native UI over the web client's data layer: `web/src/features/*/api.ts` (contracts), `web/src/features/*/live/**` (SpacetimeDB adapters) and the generated `web/src/module_bindings` are imported directly (see `metro.config.js`). No business rules live in the phone app.

## Prerequisites

- **Expo Go** on each phone (App Store / Play Store).
- Node 22+ on the laptop that runs Metro (`npm install` in this folder once).
- A running SpacetimeDB with the `safenight` module published: either a laptop on the same Wi-Fi running `spacetime start --listen-addr 0.0.0.0:3000`, or Maincloud.

## Run it

```bash
cd mobile
npm install            # once
npx expo start         # same Wi-Fi: scan the QR code with the Camera app (iOS) or Expo Go (Android)
npx expo start --tunnel   # phones on a different network (installs @expo/ngrok on first use; slower)
```

On first launch the phone asks **Who is this phone?** (Alex, Sam, Maya, Jordan) and which **server** to use. Tap **Test connection** before continuing; it calls the module's health route and shows the module version and whether Nemotron is live or simulated.

- LAN server: `ws://<laptop-ip>:3000` (find the IP with `ipconfig getifaddr en0`). The laptop must start SpacetimeDB with `--listen-addr 0.0.0.0:3000`, not the default localhost-only bind.
- Maincloud: `wss://maincloud.spacetimedb.com` (after `spacetime publish --server maincloud`).

Defaults come from `mobile/.env` (copy `.env.example`): `EXPO_PUBLIC_SPACETIMEDB_HOST`, `EXPO_PUBLIC_SPACETIMEDB_DB_NAME`. Tap your name in the header to switch persona or server; each persona keeps its own identity per server (token stored on the device).

## Judging layout (two phones, two laptops)

| Device | Persona | Does |
|---|---|---|
| Laptop 1 (browser `?as=alex`) | Alex, organizer | Profile → Judge demo → **Set up demo group**; reports the concern from Map |
| Phone 1 (Expo Go) | Sam, designated driver | Sees the instant **Do not drive** banner; later chooses the ride, confirms pickup and **I'm home safe** |
| Phone 2 (Expo Go) | Maya, primary buddy | Receives the first request and ignores it (or taps **I'm on it**) |
| Laptop 2 (browser `?as=jordan`) | Jordan, backup buddy | Receives the escalation and taps **I'm on it** |

Any device can run any persona; the phones register themselves when they connect, and the Profile tab's Judge demo panel shows which personas are registered, **Set up demo group**, **Advance timer (simulate no reply)**, **Reset demo group** and **Wipe all demo data**.

## Verification

- `npm run typecheck` (tsc over the app and the imported web data layer)
- `npm test` (vitest: settings normalization, token keys, localStorage shim)
- `npm run export` bundles iOS and Android with Metro (catches resolution errors)
- `npm run web` runs the same code with react-native-web, useful to exercise the live data layer in a browser; it is not a substitute for Expo Go rendering.

## How it works

- `metro.config.js` watches the repo root, resolves `react`/`react-native` from `mobile/node_modules` and `spacetimedb` from the root `node_modules` (one SDK instance shared with the bindings), and enables the SDK's `browser` export so the WebSocket build is used on native.
- `src/polyfills.ts` runs first: `TextEncoder`/`TextDecoder` fallback (`fast-text-encoding`) and a synchronous `localStorage` shim backed by AsyncStorage (the web adapters store the auth token and alert dismissals there).
- The connection is built with `.withCompression('none')` because React Native has no `DecompressionStream`.
