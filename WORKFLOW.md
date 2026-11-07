# SafeNight build workflow (two-person, conflict-free)

This file is the single place that says **what we are building, in what order, who owns what, and where each person is right now.** Keep it current: update your own status section every time you finish or start a chunk, in the same commit as the code.

## How to use this file

1. `git pull --rebase origin main` before you edit anything here.
2. Edit **only your own status section** (`## Person A — status

_Owner: Person A (Claude Max). Edit only this section._

**Done**
- 2026-11-07 — Plan, ownership map, and chunk list written (this file). Stack decisions verified against SpacetimeDB 2.14.1 docs. SpacetimeDB CLI 2.14.1 installed on the planning machine.

**In progress**
- Nothing. No application code exists yet; chunks start only after the open questions below are answered.

**Next**
- C0 scaffold.

**Blockers / needs from B**
- None.

**Needs from the user**
- See "Open questions" at the bottom.

---

## Person B — status`). Never edit the other person's section. The plan sections above them change only by agreement.
3. Commit the status change together with the code it describes. Push right away.
4. If a chunk is blocked, write the blocker in your section and ping the other person.

## Decisions already made

| Area | Decision | Why |
|---|---|---|
| Backend | **SpacetimeDB 2.14.1 TypeScript module** in `spacetimedb/`. No separate API server. | Track 2 requires the majority of the backend on Spacetime. TypeScript modules support procedures with HTTP (stable), views, scheduled reducers and procedures, event tables, env vars, HTTP handlers, and in-process unit tests. One language across module and client. |
| Agent | **Nemotron via NVIDIA NIM** (`https://integrate.api.nvidia.com/v1/chat/completions`, OpenAI-compatible tool calling) called from a **scheduled SpacetimeDB procedure**. Model is configurable through the `NEMOTRON_MODEL` env var (default `nvidia/nemotron-3-super-120b-a12b`). | Track 1 requires Nemotron with event-driven, multi-step, tool-using behavior. A procedure keeps the call inside Spacetime; tool validation, consent, state, timers stay in reducers. |
| Key handling | `NEMOTRON_API_KEY` is an **optional** module env var. Absent key = **simulated planner** (deterministic, every receipt labeled `SIMULATED`). Present key = real Nemotron. Nothing else changes. | The key arrives later. The whole flow must be testable now. |
| Client | **React 19 + Vite + TypeScript** in `web/`, using `spacetimedb/react` hooks and generated bindings. Four demo personas in four browser tabs. | Fastest path to a judge-ready demo. Mobile-first responsive layout, dark theme. |
| iOS / watchOS | **Deferred.** No official Swift SDK for SpacetimeDB; no iOS simulator runtime is installed on the build machine. Revisit after the web demo is solid. | Not required by either track. |
| Messaging | Twilio adapter as a procedure, **simulated unless** `TWILIO_*` env vars are set. Every message row carries `channel` and `simulated` flags. | Real consented messaging is track evidence; simulation must be labeled. |
| Transport / maps | OSRM public routing + OpenStreetMap Nominatim (no key) through a procedure, labeled as external data with freshness. Ride providers are deep links the human confirms. | Real external API use without purchases. |
| Auth | SpacetimeDB-issued identities (anonymous tokens stored per persona in the browser). SpacetimeAuth/OIDC later. | Enough for the demo; module logic already keys everything on `Identity`. |
| Deployment | Local `spacetime start` for development. Maincloud (`spacetime login` + `spacetime publish`) for the judged demo. | Needs an account login from the repo owner (see open questions). |

## Repository layout and ownership

```
SafeNight/
├── WORKFLOW.md                 shared plan + per-person status (this file)
├── spacetime.json              CLI config: database name, module path, codegen target   [A]
├── package.json                npm workspaces: spacetimedb, web                          [A]
├── spacetimedb/                SpacetimeDB TypeScript module                             [A]
│   ├── src/index.ts            schema assembly, re-exports
│   ├── src/tables/             table definitions by domain
│   ├── src/reducers/           transactional business logic
│   ├── src/views/              per-user and shared views
│   ├── src/procedures/         Nemotron, messaging, transport (HTTP side effects)
│   ├── src/http/               HTTP handlers (webhooks, health)
│   ├── src/lib/                policy, tool allowlist, simulated planner
│   └── src/**/*.test.ts        vitest unit tests against the in-memory datastore
├── web/                        React client                                              [B]
│   ├── src/module_bindings/    GENERATED. Only A regenerates and commits this.           [A]
│   └── src/...                 everything else in web/                                   [B]
├── scripts/                    demo seeding, e2e driver, test runners                    [A]
├── docs/ARCHITECTURE.md        the contract: tables, reducers, views, procedures         [A writes, B reads]
├── docs/DEMO_SCRIPT.md         judge demo walkthrough                                    [B]
└── README.md                   setup, env vars, track mapping                            [B owns; A edits only the "Backend" section]
```

**Ownership is by directory.** A change outside your directories goes through the other person (message them, or open a PR they merge). The only shared files are `WORKFLOW.md` (separate status sections) and `README.md` (separate sections).

## Merge-conflict rules

- Work directly on `main`. Small commits. `git pull --rebase origin main` before every push. Never force-push `main`.
- Never edit files you do not own. If you need a reducer, view, or field that does not exist, write the request in your status section under **Needs from A/B** and keep working with the simulated or mocked shape from `docs/ARCHITECTURE.md`.
- Schema changes are A's job and always come with: updated `docs/ARCHITECTURE.md`, regenerated `web/src/module_bindings/`, passing module tests, in **one commit**. B then pulls and adapts the UI.
- B never edits `web/src/module_bindings/`. A never edits other files under `web/src/`.
- Generated bindings are committed so B can build without the CLI.
- Lockfiles: one `package-lock.json` at the repo root (npm workspaces). Only run `npm install` from the root. If both add dependencies in the same window, the second person re-runs `npm install` after rebasing and commits the merged lockfile.

## Claude subscriptions and how to spend them

- **Person A — Claude Max.** Larger usage allowance (5x or 20x Pro). Takes the long, iterative, test-heavy work: module, agent, tests, codegen, integration, deployment. Run one Claude Code session per chunk; let it run the full test loop.
- **Person B — Claude Pro.** Smaller allowance. Takes UI and docs work that lands in well-bounded sessions. Tips: one component or screen per session; paste the relevant section of `docs/ARCHITECTURE.md` and the generated binding file for the table you are using; ask for a plan first, then implement; avoid long autonomous loops.

Both: start every session by reading `WORKFLOW.md`, `docs/ARCHITECTURE.md`, and `AGENTS.md`. Put the chunk ID in commit messages (`C2-A: ...`).

## Chunk plan

Every chunk ends with its **test gate** passing and a status update here. A chunk is not done until the gate is green. B's chunks depend on A's chunk of the same number being merged (bindings), except where noted.

### C0 — Scaffold (A)
- Repo layout above, npm workspaces, `spacetime.json`, module skeleton with env declarations, vitest harness, web skeleton with provider and persona switcher, CI workflow (module tests + web typecheck/build).
- **Gate:** `npm test -w spacetimedb` passes; `spacetime build` passes; `spacetime publish --server local` succeeds; `spacetime generate` produces bindings; `npm run build -w web` passes.

### C1 — Night Out core
- **A:** `user_profile`, `trusted_contact`, `night_session` (+ expiry schedule), `invite` (short code, expiry, revocation), `session_member` (roles, join/leave), `driver_assignment` (explicit accept, "I can no longer drive"), `consent_grant` (scope, recipient, expiry, revoke). Views: `my_sessions`, `session_roster(sessionId)`, `my_consents`. Lifecycle reducers (presence). **Gate:** unit tests for invite expiry, join/leave, driver must accept explicitly, organizer cannot force sharing, revocation blocks future reads.
- **B:** App shell (dark theme, 5 tabs), persona switcher (Sam, Alex, Maya, Jordan each with its own identity/token), Night Out tab: create session, join by code, roster with roles and sharing state, driver volunteer/accept, consent toggles, leave/end session. **Gate:** four tabs show the same roster live; roles update in real time.

### C2 — Location, status, deterministic safety engine
- **A:** `location_update` (consent-scoped visibility, accuracy, timestamp, stale flag via interval schedule, expiry purge), `checkin` (I'm okay / need friend / need ride / unwell / emergency), `consumption_self_report` (private), `concern_report` (restricted visibility), `incident` + `incident_event` timeline, `safety_alert` **event table** for the immediate no-driving warning, acknowledgment, human-only resolution, "I'm fine does not cancel a pending incident", missed check-in schedule. Views: `visible_locations`, `my_incidents`, `incident_timeline(incidentId)`. **Gate:** tests for consent-scoped location reads, concern → incident + warning in one transaction, duplicate concern dedupe, I'm-fine semantics, unauthorized resolution rejected.
- **B:** Map tab (simulated coordinates with "SIMULATED" badge, stale/offline states), status action bar with hold-to-confirm for emergency, concern report sheet, no-driving warning banner driven by the event table, Inbox tab (alerts, acknowledgments), incident timeline screen. **Gate:** concern from Alex shows Sam the warning within a second in another tab; timeline updates live.

### C3 — Nemotron agent workflow
- **A:** `agent_job`, `agent_plan` (versioned), `agent_action` receipts, `agent_wake` schedule table → scheduled procedure `agent_step` (reads minimal authorized context in a tx, calls Nemotron with the tool schema, validates every tool call against policy and consent in a tx, executes DB tools, schedules external tools, records receipts, schedules follow-up). Tools: `get_group_context`, `get_recent_checkins`, `get_last_shared_location`, `get_transport_options` (OSRM/Nominatim procedure), `send_approved_message` (Twilio procedure or simulated), `request_human_confirmation`, `schedule_followup`, `update_incident_state`. `followup_timer` schedule → nonresponse → re-wake with `buddy_nonresponse` event → backup escalation. `ride_plan` with proposed/accepted/booked_by_user/completed. Simulated planner when no key. **Gate:** tests with mocked HTTP: plan persisted, disallowed tool rejected, primary nonresponse escalates to backup exactly once, duplicate wake is idempotent, revocation mid-incident blocks the next outward action, home confirmation only by the person.
- **B:** Incident screen shows plan + receipts (sent / acknowledged / booked / completed as distinct states, SIMULATED labels), buddy acknowledge/decline actions, ride options with "I booked this" confirmation, "I'm home" confirmation, judge demo panel (reset demo, advance timers). **Gate:** full scripted demo runs in four tabs without touching the CLI.

### C4 — Community, hardening, integrations
- **A:** `venue`, `venue_report` (categories, redaction, expiry schedule, moderation state, duplicate merge), `safety_resource` seed, RLS filters on public tables that carry per-user data, HTTP handlers (`/health`, `/webhooks/twilio`), prompt-injection text test, retention purge schedule, audit table, owner-only admin reducers. **Gate:** tests for reporter anonymity, expired reports hidden, injection text cannot change tool permissions, admin reducers reject non-owners.
- **B:** Reports tab (submit, list with freshness and moderation labels), Profile tab (contacts, backup ladder, privacy defaults, data delete), accessibility pass (contrast, focus, reduced motion), `docs/DEMO_SCRIPT.md`, README demo and track sections. **Gate:** Lighthouse accessibility ≥ 90 on the main screens; demo script walks clean.

### C5 — Integration, deploy, submission (A leads, B verifies)
- `scripts/e2e.ts` drives four identities through the full demo against a live local server and asserts the timeline. Publish to Maincloud. Record the video. Submission checklist in `docs/HACKATHON_TRACK_REQUIREMENTS.md` ticked only with evidence.

## Test method (same for every chunk)

1. **Unit:** `npm test -w spacetimedb` (vitest + SpacetimeDB in-memory datastore; HTTP mocked).
2. **Publish:** `spacetime publish --server local` then `spacetime sql`/`spacetime call` smoke checks listed in the chunk.
3. **Client:** `npm run typecheck -w web && npm run build -w web`; open the app with four personas and run the chunk's gate scenario by hand.
4. **Record** the result in your status section (pass/fail, date, what was not covered).

## Commands

```bash
# one-time
curl -sSf https://install.spacetimedb.com | sh     # SpacetimeDB CLI 2.14.x
npm install                                        # from repo root

# every session
spacetime start                                    # local server on :3000 (separate terminal)
npm run dev                                        # publishes module, generates bindings, runs web (spacetime dev)

# gates
npm test -w spacetimedb
npm run typecheck -w web && npm run build -w web
spacetime publish --server local
spacetime generate
```

Secrets go in `spacetime.local.json` (git-ignored) or the shell, never in `spacetime.json`:

```bash
NEMOTRON_API_KEY='...' spacetime publish safenight --env-only --server local
```

---

## Person A — status

_Owner: Person A (Claude Max). Edit only this section._

**Done**
- 2026-11-07 — Plan, ownership map, and chunk list written (this file). SpacetimeDB CLI 2.14.1 installed on the planning machine.
- 2026-11-07 — **C0 scaffold complete, gate green.** npm workspaces (`spacetimedb`, `web`), `spacetime.json`, module with `config` / `client_presence` / `audit_event`, optional env declarations, `ping` reducer, lifecycle reducers, `online_members` and `runtime_status` views, 6 vitest unit tests passing, `spacetime build` and `spacetime publish --server local` succeed, bindings generated into `web/src/module_bindings/`, `scripts/e2e.ts` passes against the live local database, CI workflow added, `docs/ARCHITECTURE.md` contract written (C0 exact, C1–C4 planned).

**In progress**
- Nothing.

**Next**
- C1-A Night Out core (sessions, invites, membership, driver acceptance, consent grants, views). Starts on go-ahead.

**Blockers / needs from B**
- None.

**Needs from the user**
- See "Open questions" at the bottom.

**Gotchas recorded for later chunks**
- The module entry (and anything it `export *`s) may only export Spacetime objects; keep constants/helpers in `src/lib/` and do not re-export them.
- A view named `foo_bar` reserves the type name `FooBar`; custom `t.row` names must differ (e.g. `FooBarRow`).
- `ctx.env` is undefined in the vitest harness; read it through `envOf(ctx)` in `src/lib/env.ts` so tests see simulated mode.

---

## Person B — status

_Owner: Person B (Claude Pro). Edit only this section._

**Done**
- 2026-11-07 — C0 web shell exists (built by the orchestrator so B starts from a working app): persona switcher (`?as=sam|alex|maya|jordan`, one SpacetimeDB identity per persona), connection status, runtime-status badges, online list, ping check, five-tab shell with placeholders. Typecheck and `vite build` pass.

**In progress**
- Nothing.

**Next**
- C1-B Night Out tab, once C1-A bindings land. Until then: read `docs/ARCHITECTURE.md` C1 section and `web/src/App.tsx`.

**Blockers / needs from A**
- None.

---

## Open questions (for the user)

1. **Who is Person A and who is Person B?** Names and GitHub handles, so commits and this file can say so.
2. **SpacetimeDB hosting for the demo:** local server during judging, or Maincloud? Maincloud needs the repo owner to run `spacetime login` once on the publishing machine and to pick the database name (proposed: `safenight`).
3. **Nemotron:** besides the API key, confirm the model. Default is `nvidia/nemotron-3-super-120b-a12b` on `integrate.api.nvidia.com`; any Nemotron model with tool calling works by changing `NEMOTRON_MODEL`.
4. **Twilio:** do you have an account with a verified test number? If not, messaging stays simulated and labeled.
5. **iOS:** build a native SwiftUI app later, or is the mobile-first web app enough for the hackathon? A native app needs a Swift client for the SpacetimeDB WebSocket protocol (no official SDK) and an iOS simulator runtime download (~7 GB).
6. **Public repo timing:** the repository must be public to qualify. Make it public now or right before submission?
