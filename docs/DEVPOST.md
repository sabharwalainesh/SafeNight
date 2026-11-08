# Devpost submission copy (paste into "Project details")

## About the project

### Inspiration
Every one of us has had the night where the group splits up. Someone's phone dies, someone walks off from the party, and the text you sent to check on them sits there unread. The apps that exist for this are all-or-nothing: either you broadcast your location to everyone forever, or you have nothing. People turn that off. We wanted the thing a good friend does, done by software with consent at every step: notice when someone goes quiet, get the right person moving, and never pretend a "sent" message is help.

### What it does
SafeNight is a consent-based safety app for a night out with friends.

- **Night Out groups.** Start a hangout in one tap, join with a code, name a designated driver who has to accept the role.
- **Consent per person, per scope.** Approximate or precise location, check-ins, messaging, each with an expiry and a revoke. The server never sends you a row you weren't granted.
- **Check-ins and "Need help".** One tap says you're okay; one tap raises an incident for your group.
- **Deterministic safety rules.** "May have been drinking" about the driver shows a **Do not drive** banner on their phone in under a second. No AI in that path.
- **A Nemotron agent that proposes, and policy that decides.** When an incident opens, NVIDIA Nemotron plans who to contact first, waits for acknowledgment, and escalates to the next person. Every step is a receipt: sent, delivered, acknowledged. The agent cannot contact the person in trouble and cannot resolve an incident. Only a human can.
- **Come to me.** A friend who needs company taps once. Whoever accepts gets a live map of both people with distance and walking directions, fed by a high-rate position stream. Precise sharing exists only between those two and only until arrival.
- **Ride and home.** Ride options as deep links (the app never books), pickup confirmation, and "I'm home safe" closes the incident, attributed to the person it was about.
- **Demo mode (UT Dallas).** A scripted walkthrough with simulated friends on campus, a real walking route, a typed-out Nemotron plan with policy badges, messages, and a live status card, so the product can be shown on a single phone.

### How we built it
- **SpacetimeDB is the whole backend.** One TypeScript module on Maincloud: 40+ tables, 50+ reducers (every write is a transaction with auth and rate limits), per-user views with row-level security, scheduled reducers for check-in timers and sweeps, an event table that pushes alerts to the right phones in milliseconds, and a private `meetup_position` table streamed at up to 4 Hz for the live finder. The client talks to nothing else over one WebSocket.
- **Nemotron inside the database.** `nvidia/nemotron-3.5-super` is called through NVIDIA NIM from a SpacetimeDB scheduled procedure. A multi-round tool loop with an allowlist and validator turns the plan into reducer calls; templates are filled server-side so the model never writes free text to a friend. When the model is unreachable the planner falls back to a deterministic plan, always labeled.
- **Phones with no install.** React + Vite PWA hosted on Vercel, added to the home screen from Safari. Leaflet and OpenStreetMap for maps, Geolocation and device-orientation sensors, OSRM foot routing for walking directions, Apple/Google Maps hand-off.
- **Tests.** 119 module tests run the real database in-process (reducers, views, RLS, schedules) and 149 web tests cover adapters, the demo state machine, routing and accessibility.

### Challenges we ran into
- **GPS is not a compass.** Our first "Come to me" was an arrow. Real phones 5 m apart with 10 to 40 m GPS error made it spin. We measured the data, fused positions by accuracy, and then replaced the arrow with a live map plus walking directions, which is what people actually use.
- **Service workers that never let go.** The PWA cached its own shell forever, so phones kept old builds through a dozen redeploys. The shell is now network-first and the app reloads itself when a new worker takes over.
- **Letting the model plan without letting it act.** Nemotron sometimes wanted to hand off to dispatch or message the wrong person. The fix was structural: an allowlist, a validator, server-filled templates, and a rule that only humans resolve.
- **Consent that survives a demo.** Trip-scoped precise sharing had to override a person's "approximate" default without leaking it anywhere else, and had to end on arrival or when the incident closes.

### Accomplishments we're proud of
- A real-time, multi-phone safety flow where every state (sent, delivered, acknowledged, booked, home) is distinct and visible.
- A backend that is one database module, with the agent running inside it.
- Row-level security that makes privacy a property of the data layer rather than of UI code.

### What we learned
SpacetimeDB collapses the API tier: a reducer plus a subscription replaced what would have been a server, a queue and a push service. Agentic AI is safest when the model's output is a plan over a small set of tools and a policy layer owns the decisions. And on phones, the honest UI (a map with uncertainty) beats the impressive one (an arrow).

### What's next
Native iOS build with the lock-screen Live Activity and Ultra-wideband direction between phones, real messaging once a 10DLC campaign is approved, and venue partnerships for the reports layer.

## Built with (tags)
spacetimedb, typescript, nvidia-nemotron, nvidia-nim, react, vite, pwa, vercel, leaflet, openstreetmap, osrm, websocket, node.js, vitest, expo, elevenlabs, photon

## "Try it out" links
- https://safenight-liart.vercel.app (hosted PWA, live on SpacetimeDB Maincloud)
- https://safenight-liart.vercel.app/?demo=utd (one-phone scripted demo)
- https://github.com/sabharwalainesh/SafeNight (source)

## Image gallery (3:2, screenshots to take on a phone)
1. Tonight: hangout with the four people and the Driver badge
2. Map with real pins and accuracy circles
3. Do not drive banner on Sam's phone
4. Incident with Nemotron plan and receipts (sent / delivered / acknowledged)
5. Come to me finder map with distance and "Get walking directions"
6. Demo mode: Nemotron panel with policy badges
7. Architecture slide from the pitch deck (export slide 6 as PNG)

## Video
Upload `~/Downloads/SafeNight-demo.mp4` (4:12, captions, record your voiceover over it) to YouTube as Unlisted and paste the link.
