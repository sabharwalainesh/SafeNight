# SafeNight

Go out together. Get home together.

Read the [Nemotron incident coordination design](docs/NEMOTRON_INCIDENT_COORDINATION.md) for the proposed SOS-to-resolution workflow, friend and mutual assistance reports, and AI/backend responsibilities.

SafeNight is a planned consent-based nightlife safety app with temporary friend groups, help requests, transportation coordination, and explicit home check-ins.

## Required hackathon tracks

- **NVIDIA Nemotron:** Event-triggered agents that go beyond chat, plan and execute multi-step workflows, intelligently use external APIs, and solve real safety-coordination problems.
- **Spacetime:** The majority of the backend must be built on SpacetimeDB. Qualification requires submission of a public GitHub repository.

See [the track requirements and demo plan](docs/HACKATHON_TRACK_REQUIREMENTS.md) for architecture ownership, evidence, and the submission checklist. These are required build targets; the app and qualification have not yet been verified.

The SpacetimeDB-primary architecture supersedes the original blueprint's FastAPI/Supabase backend proposal. Read [project memory](PROJECT_MEMORY.md) and the [original blueprint](docs/SafeNight_Complete_App_Blueprint_v2.md) for product context.

## Backend and local development

The backend is a SpacetimeDB 2.14 TypeScript module in `spacetimedb/`; the client is a React app in `web/`. There is no separate API server. See [WORKFLOW.md](WORKFLOW.md) for the chunk plan and who owns what, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the table, reducer, view, procedure, and tool contract (sections 5 to 9 describe what is implemented).

Prerequisites: Node 22 or newer, and the [SpacetimeDB CLI](https://spacetimedb.com/install) 2.14 (`curl -sSf https://install.spacetimedb.com | sh`).

```bash
npm install                 # once, from the repo root (npm workspaces)
spacetime start             # local server on 127.0.0.1:3000, keep it running in its own terminal
npm run publish:local       # build + publish the module as `safenight`, then arm schedules and seed demo resources
npm run generate            # regenerate web/src/module_bindings from the module (committed; Person A runs it)
npm run dev -w web          # Vite dev server for the client (defaults to mock data; see below)
npm run test:module         # 66 module unit tests on the in-memory SpacetimeDB datastore, no server needed
npm run test:web            # web unit tests (jsdom, Testing Library, axe-core)
npm run demo                # drives four live identities through the full driver-concern incident
npm run check:rls           # proves row-level security on the live server with member and outsider identities
```

Run the client against the live module instead of its mocks by creating `web/.env.local` (git-ignored):

```bash
VITE_NIGHTOUT_SOURCE=live
VITE_SAFETY_SOURCE=live
```

What runs where:

| Capability | Owner | Mode today |
|---|---|---|
| Sessions, invites, roles, explicit driver acceptance, consent grants and revocation, sharing scope | SpacetimeDB reducers and views | live |
| Consent-scoped locations, check-ins, concern reports, incidents, immediate no-driving warning (event table with row-level security), human-only resolution | SpacetimeDB reducers, views, schedule tables | live |
| Agent jobs, versioned plans, validated tool execution, receipts, follow-up timers, buddy nonresponse escalation, ride plans | SpacetimeDB scheduled procedures and reducers | live; planner **simulated** until `NEMOTRON_API_KEY` is set |
| Nemotron inference | scheduled procedure `agent_step` → NVIDIA NIM chat completions with tool calling | waiting on the API key; falls back to the simulated planner |
| Messaging | scheduled procedure `deliver_notification` → Twilio | **simulated** until `TWILIO_*` are set |
| Transport lookup | procedure → Nominatim and OSRM, no key | live; OSRM is blocked by TLS on some hosts and is then recorded as a failed receipt |
| Venue reports, moderation, votes, expiry, safety resources, retention, data deletion, privacy settings | SpacetimeDB reducers, views, schedule tables, HTTP handlers | live |

Every simulated plan, message, and receipt carries `simulated: true` in the data, and the UI labels it. Supplying keys never changes a reducer, table, or timer, only who produced the plan text and whether an HTTP request left the host. See [.env.example](.env.example) for the variables and the `spacetime publish --env-only` command that sets them. `GET /v1/database/safenight/route/health` reports the module version and modes.

## Demo

Follow the [judge demo script](docs/DEMO_SCRIPT.md) (~5 minutes, four tabs in one browser: `?as=alex`, `?as=sam`, `?as=maya`, `?as=jordan`). Tabs: Night Out, Map, Reports, Inbox, Profile; the judge demo panel lives in Profile.

Two ways to run the client:

| Mode | Command | Data |
| --- | --- | --- |
| Live (default) | `npm run dev -w web` | Every tab reads and writes the SpacetimeDB module (needs `spacetime start` and the module published; see above). Each persona tab registers itself; once all four are open, "Set up demo group" in Profile creates the session, Sam's accepted driver role and the demo consents on the server. "Advance timer", "Reset demo group" and "Wipe all demo data" call the module's demo reducers. |
| Mock | `npm run dev:mock -w web` | Local mock data shared between tabs (MOCK DATA badges) and a deterministic simulated planner. No server needed. |

`VITE_DATA_SOURCE=mock` switches every tab to mocks; a per-tab flag (`VITE_NIGHTOUT_SOURCE`, `VITE_SAFETY_SOURCE`, `VITE_AGENT_SOURCE`, `VITE_REPORTS_SOURCE`, `VITE_PROFILE_SOURCE` = `mock` or `live`) overrides it for one tab.

In both modes no SMS is sent unless Twilio is configured on the module, and the app never books or pays for rides: ride options are deep links the person opens and confirms. Real Nemotron planning runs only when `NEMOTRON_API_KEY` is set on the module; otherwise plans and receipts are labeled SIMULATED.

**Emergency coordination (optional):** the `bridge/` service lets Nemotron decide when to text the friend group over iMessage (Photon Spectrum), call a buddy (ElevenLabs voice over Photon SIP), or place a **SIMULATED dispatch call** to a demo number. Real emergency numbers are blocked in code, and nothing reaches emergency services. Run it with `npm run dev --prefix bridge`, then start the web app with `VITE_BRIDGE_URL=http://127.0.0.1:8787 VITE_BRIDGE_TOKEN=<same token> npm run dev -w web`. Without keys everything is simulated. Setup and guardrails: [bridge/README.md](bridge/README.md).

`npm test -w web` runs the client suite (101 tests): the full demo flow and safety rules on mock data, axe accessibility checks on every screen, colour contrast, and the live data converters.

## Hackathon tracks

| Item | Status | Where |
| --- | --- | --- |
| Client UI for the full SOS flow (group, consent, map, reports, inbox, agent timeline, rides, profile) | Implemented | `web/src/screens/`, `web/src/features/` |
| Client on live SpacetimeDB data for every tab | Implemented; live run by Person B still to do | `web/src/features/*/live/` |
| Deterministic no-driving warning, in the same transaction as the concern report | Implemented in the module | `spacetimedb/` |
| Track 1: event-triggered agent (scheduled procedure), versioned plans, validated tool calls, receipts, nonresponse escalation | Implemented in the module | `spacetimedb/` |
| Track 1: real Nemotron calls | Implemented; runs only with `NEMOTRON_API_KEY`, simulated planner otherwise | `spacetimedb/` |
| Track 1: external APIs | Transport lookup via Nominatim/OSRM implemented; messaging simulated unless Twilio is configured | `spacetimedb/` |
| Track 2: SpacetimeDB as the backend (tables, reducers, views, schedules, procedures, RLS) | Implemented (C0-C4); deployment in progress (C5) | `spacetimedb/` |
| Public GitHub submission | Not yet: the repository must be public before submission | See [track requirements](docs/HACKATHON_TRACK_REQUIREMENTS.md) |

Known gap: phone numbers currently sit in the public `user_profile` table, so the live client hides phone entry until the module keeps them private. No track is claimed as satisfied until the live four-tab demo has been recorded end to end.
