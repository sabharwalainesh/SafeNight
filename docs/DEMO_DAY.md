# Demo day setup: two phones + two laptops, one database

**Scenario:** New Year's Eve in New York. Alex, Maya and Jordan are at the Times Square ball drop; Sam, the designated driver, is a few blocks away near Grand Central. All locations are simulated and labeled; the seeded safety resources are Midtown demo entries.

The database runs on SpacetimeDB Maincloud (`safenight`, owner: Sohaib's spacetimedb.com login). Every device connects to `wss://maincloud.spacetimedb.com`, so nothing depends on venue Wi-Fi reaching a laptop. Health check: <https://maincloud.spacetimedb.com/v1/database/safenight/route/health> (expect `nemotronMode: "live"`).

| Device | Persona | Role in the demo |
|---|---|---|
| Phone 1 | **Sam** (designated driver) | sees the "Do not drive" banner, ride options, confirms home |
| Phone 2 | **Maya** (primary buddy) | receives the alert, ignores it |
| Laptop 1 | **Alex** (organizer) | roster + consent, reports the concern, judge demo panel |
| Laptop 2 | **Jordan** (backup buddy) | "I'm on it", plan versions and receipts |

## Laptops (web app)

```bash
git pull
npm install
printf 'VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com\nVITE_SPACETIMEDB_DB_NAME=safenight\n' >> web/.env.local
npm run dev -w web
```

Open `http://localhost:5173/?as=alex` (laptop 1) and `http://localhost:5173/?as=jordan` (laptop 2). The status strip must read **Nemotron: live** and **module 0.8.1**. Optional: the coordination bridge (`bridge/`, B's) needs its own `bridge/.env` and `npm run dev --prefix bridge`; it is simulated unless configured.

## Phones without Expo Go: the hosted PWA (recommended)

The web app is deployed on Vercel and already points at Maincloud: **<https://safenight-liart.vercel.app>** (project `safenight` in Sohaib's Vercel account; redeploy with `cd web && VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com VITE_SPACETIMEDB_DB_NAME=safenight VITE_NIGHTOUT_SOURCE=live VITE_SAFETY_SOURCE=live VITE_BRIDGE_URL= VITE_BRIDGE_TOKEN= npx vite build && cd dist && npx vercel deploy --prod --yes`).

On each phone: open the URL in Safari, add `?as=sam` (phone 1) or `?as=maya` (phone 2), tap Share → **Add to Home Screen**, then launch it from the home screen like an app. No laptop, Metro, or tunnel is involved; the phone talks to Maincloud directly. The coordination bridge is disabled in this build (it only runs on a laptop).

## Phones (Expo Go)

Each phone loads the app code from its owner's laptop; data goes straight to Maincloud.

```bash
cd mobile && npm install
npx expo start --tunnel ngrok   # answer "y" to install @expo/ngrok the first time
```

Scan the QR with the iPhone Camera app (or enter the `exp://...` URL in Expo Go). In the app: pick the persona (Sam on phone 1, Maya on phone 2), leave the server at `wss://maincloud.spacetimedb.com`, tap **Test connection**, Continue. If the tunnel is slow, `npx expo start` works when the phone and laptop are on the same hotspot; the server field then still points at Maincloud.

Fallback without Expo Go: the web app is a PWA. `npm run dev:phone -w web` prints LAN URLs; open one in Safari and add it to the home screen.

## Run order (about 5 minutes)

1. Laptop 1 (Alex) → Profile → Judge demo: all four personas show ✓ → **Reset demo group**, then **Set up demo group**.
2. Alex → Night Out → open "New Year's Eve" (the session name the panel created): roster, Sam's **Driver** badge, consent toggles.
3. Alex → Map → **Report a concern** → Sam → "May have been drinking" → Send.
4. Phone 1 (Sam): "Do not drive" appears instantly. Deterministic, no AI.
5. Alex → Inbox → incident: plan v1 from Nemotron, receipts, SIMULATED labels.
6. Phone 2 (Maya): alert arrives; do nothing. Alex → Profile → **Advance timer** (or wait 2 min): escalation, plan v2 to Jordan.
7. Laptop 2 (Jordan) → Inbox → incident → **I'm on it**. Plan v3 (two rounds) proposes ride options.
8. Phone 1 (Sam): **Choose this** → **I booked this** → **Confirm pickup** → **I'm home safe** → **Yes, I'm home**.
9. Every device shows **Resolved by Sam**.
10. **Come to me (compass), optional:** Phone 2 (Maya) → Map → **Need help** → **Come to me**. Laptop 2 (Jordan) → Alerts → the incident → **I'm coming**: Jordan's screen shows the compass to Maya with the distance (on a phone, tap **Enable compass** when iOS asks; a laptop shows a north-up arrow on simulated positions). Maya sees "Jordan is coming · N m away". Jordan taps **I've arrived**; both show "✓ Jordan arrived". Precise location is shared both ways only for this trip and expires in 60 minutes.

## Reset between runs

Any device → Profile → **Reset demo group** → **Yes, reset the group** (second tap) then **Set up demo group**. If a screen looks stale after a redeploy, hard-reload the PWA once (the service worker caches the previous bundle). **Wipe all demo data** clears everything except venues and resources.

## Maintenance (Sohaib's laptop, logged in to Maincloud)

```bash
spacetime publish safenight --server maincloud --module-path ./spacetimedb --no-config --yes   # new module version
spacetime call safenight ensure_schedules --server maincloud --no-config                          # after every publish
NEMOTRON_API_KEY='...' spacetime publish safenight --env-only --server maincloud --no-config       # rotate the key
spacetime logs safenight --server maincloud --no-config | tail -40
```
