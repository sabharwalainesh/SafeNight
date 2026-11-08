# Devpost submission copy (paste into "Project details")

## About the project

### Inspiration
Nights out have a gap nobody owns. Friends split up. The person who said they'd drive has a drink, and everyone notices but nobody wants to be the one to say it. Someone goes quiet and the text you sent to check on them sits there unread. Location sharing doesn't close that gap: a pin tells you where someone is, not that anyone is coming. And the apps that try are all-or-nothing trackers that people switch off. We wanted what a good friend does, done by software with consent at every step: notice when something is off, get the right person moving, and never pretend a "sent" message is help.

### What it does
SafeNight is a consent-based safety app for groups of friends, designated drivers and safety buddies on a night out. The loop is simple: plan the night, stay connected, notice a concern, coordinate help, confirm everyone got home.

- **A Night Out is a temporary group.** It expires. It is not a tracker and not an emergency dispatcher. Every role, including the designated driver, is accepted on purpose; nobody is volunteered silently.
- **Consent is granular.** Each person grants each friend specific scopes, approximate or precise location, check-ins, messaging, for a limited time, and can revoke any of them. The map shows only people who consented, at the scope they chose.
- **Check-ins and Need help.** One tap says "I'm okay"; one tap raises an incident for your group. "I'm okay" never closes an incident. People resolve things, not the app.
- **Deterministic safety rules.** Report "may have been drinking" about the driver and their phone shows **Do not drive** in the same transaction as the report. No AI in that path. We never detect intoxication and never declare anyone sober: a concern is a concern, not a verdict.
- **An agent that adapts.** When an incident opens, NVIDIA Nemotron plans who to reach first, waits for an acknowledgment, escalates to the backup buddy when nobody answers, looks up transport and proposes a ride. Every step leaves a receipt that says who proposed it: the model, a policy rule, or a simulation. Sent is not delivered, delivered is not acknowledged, acknowledged is not resolved; the states stay distinct on every screen.
- **Come to me.** A friend who needs someone taps once. Whoever accepts gets a live finder: a map of both people with their accuracy circles, distance with uncertainty, a live-updating position fed by a 4 Hz stream, and one-tap walking directions in Apple or Google Maps. Precise location is shared only between those two people and only until arrival, when the grants are revoked automatically. We started this feature as a compass arrow; more on that below.
- **Rides and home.** Ride options are provider links; a person books, never the app. Pickup is confirmed by the rider or the buddy, and only the person the incident is about can say "I'm home". Then it resolves for everyone, with a timeline of every step and who did it.
- **Privacy by construction.** Row-level security means the server never sends a row you weren't granted. "Delete my data" removes everything SafeNight holds about you.

### How we built it
- **SpacetimeDB is the entire backend. There is no API server.** One TypeScript module on Maincloud holds sessions, members, consent grants, incidents, meetups, timers and agent state as tables and reducers: 40+ tables and 50+ reducers, each write a transaction with auth and rate limits. Per-user views are consent-scoped. Scheduled reducers run check-in timers, follow-up escalation and sweeps. The do-not-drive warning is an event table with row-level security, so only the driver's connection receives it. The Come to me stream is a private table updated in place up to four times a second and pushed to the one partner allowed to see it.
- **The agent lives inside the database.** A scheduled procedure calls `nvidia/nemotron-3.5-super` through NVIDIA NIM with a strict tool allowlist. Tool results are fed back for up to three rounds, every call is validated against consent and incident state before it executes, and message templates are filled server-side so the model never writes free text to a friend. If the model is unreachable, a deterministic planner takes over and the receipt says so.
- **Phones with nothing to install.** React + Vite progressive web app on Vercel, added to the home screen from Safari. One WebSocket to SpacetimeDB carries reducers up and subscriptions down. Leaflet and OpenStreetMap for maps, Geolocation and device sensors for position, OSRM foot routing and a maps hand-off for directions.
- **Evidence.** 119 module tests run the real database in-process, covering consent revocation, unauthorized access, duplicate events, escalation, prompt injection and the trip lifecycle. 149 web tests cover the live adapters, geometry, routing and accessibility. Plus repeated end-to-end runs with four identities on real phones.

### Challenges we ran into
- **A compass is the wrong instrument for GPS.** Our first Come to me was an arrow: bearing to your friend minus the phone's heading. On real phones a few metres apart, with 5 to 40 m of GPS error, the arrow spun. We pulled the raw fixes from the server, confirmed the separation was smaller than the error, researched the alternatives (Bluetooth ranging isn't available to web apps on iOS; Ultra-wideband needs a native build) and rebuilt the feature as a live finder map with accuracy circles, uncertainty on the distance, and walking directions. The honest interface beat the impressive one.
- **Letting the model plan without letting it act.** Nemotron sometimes wanted to hand off to dispatch or message the person in trouble. The fix was structural, not prompt-based: an allowlist, a validator, server-filled templates, a hard rule that only humans resolve, and receipts that name the source of every step.
- **Consent that holds under pressure.** Trip-scoped precise sharing had to override a person's "approximate" default for exactly one other person, and had to end on arrival, on cancel, or whenever the incident closes by any path. We wrote tests for each of those exits.
- **Real time on real phones.** Service workers that cached the old shell forever, iOS permission prompts that only fire from a tap, rate limits that had to make room for a 4 Hz stream without opening a flood. Each one was a small lesson in where the browser ends and the device begins.

### Accomplishments we're proud of
- A multi-phone safety flow where every state is distinct and visible, running on one database with no middle tier.
- An agentic workflow where the model proposes, policy decides, and a person always closes the loop.
- Privacy as a property of the data layer, enforced by row-level security rather than by UI code.

### What we learned
SpacetimeDB collapsed what would have been a server, a queue and a push service into reducers and subscriptions; the warning reaches the driver's phone in under a second with nothing in between. Agentic AI is safest when its output is a plan over a small set of tools and the policy layer owns the decisions. And measuring beats guessing: one look at the raw GPS data told us more about the compass than an evening of tuning.

### What's next
Native iOS build with the lock-screen Live Activity we prototyped and Ultra-wideband direction between phones. Real messaging and voice through the bridge once carrier approval lands (Nemotron and SpacetimeDB are live today; messaging is simulated and labeled). Venue partnerships for the reports layer.

## Built with (tags)
spacetimedb, typescript, nvidia-nemotron, nvidia-nim, react, vite, pwa, vercel, leaflet, openstreetmap, osrm, websocket, node.js, vitest, expo, elevenlabs, photon

## "Try it out" links
- https://safenight-liart.vercel.app (hosted PWA, live on SpacetimeDB Maincloud)
- https://github.com/sabharwalainesh/SafeNight (source)

## Image gallery (3:2, screenshots to take on a phone)
1. Tonight: hangout with the four people and the Driver badge
2. Map with real pins and accuracy circles
3. Do not drive banner on Sam's phone
4. Incident with Nemotron plan and receipts (sent / delivered / acknowledged)
5. Come to me finder map with distance and "Get walking directions"
6. Architecture slide from the pitch deck (export slide 6 as PNG)

## Video
Upload `~/Downloads/SafeNight-demo.mp4` (4:12, captions, record your voiceover over it) to YouTube as Unlisted and paste the link.
