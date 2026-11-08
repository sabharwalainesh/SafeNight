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
| Agent | **Nemotron via NVIDIA NIM** (`https://integrate.api.nvidia.com/v1/chat/completions`, OpenAI-compatible tool calling) called from a **scheduled SpacetimeDB procedure**. Model is configurable through the `NEMOTRON_MODEL` env var (default `nvidia/nemotron-3.5-super-vl-120b-a12b`; the older `nemotron-3-super` id returns 404 on the team's NIM key). | Track 1 requires Nemotron with event-driven, multi-step, tool-using behavior. A procedure keeps the call inside Spacetime; tool validation, consent, state, timers stay in reducers. |
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
├── mobile/                     Expo (React Native) app for Expo Go; reuses web/src/features/*/live  [A]
├── bridge/                     standalone coordination bridge (Photon texting, ElevenLabs calls)    [B]
├── video/                      Remotion video project                                                [B]
├── docs/video/                 Playwright-recorded demo video sources, captions, narration           [A]
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

- 2026-11-07 — **C1-A Night Out core complete, gate green.** Tables `user_profile`, `trusted_contact`, `night_session`, `invite` (private), `session_member` (+`active`), `driver_assignment`, `consent_grant`, `session_expiry` schedule → `expire_session`. 15 reducers with explicit driver acceptance, subject-only consent, organizer-only invites/end, self-only sharing scope. Views `my_sessions` (query-builder semijoin), `my_rosters`, `my_invites`, `my_consents`, `my_contacts`. 20/20 unit tests, automatic migration on local publish (no reset), bindings regenerated, ARCHITECTURE.md §6 marked IMPLEMENTED with deviations.

- 2026-11-07 — Rebased onto B's C1-B/C2-B commits. The orchestrator's own C1-B screens were discarded in favor of B's `features/*/api.ts` contract + mock design; A touches nothing under `web/src/` except `module_bindings/`.

- 2026-11-07 — **C2-A safety engine complete, gate green.** `location_update` + `latest_location`, `checkin`, `consumption_self_report`, `concern_report` (5-minute dedupe key), `incident`, `incident_event`, `incident_participant`, `safety_alert` **public event table with an RLS filter** (`recipient = :sender`, verified live with three identities), `checkin_timer` and `location_sweep` schedule tables. Reducers: `post_location`, `check_in`, `report_consumption`, `report_concern`, `acknowledge_incident`, `resolve_incident`, `cancel_incident`, `ensure_schedules`; scheduled `on_checkin_due`, `sweep_locations`. Views: `visible_locations`, `my_checkins`, `my_incidents`, `my_incident_participants`, `my_incident_events` (all argument-free, per-user). 32/32 tests, automatic migration, bindings regenerated, ARCHITECTURE.md §7 IMPLEMENTED with a "Client notes for the SafetyApi adapter" list.

- 2026-11-07 — **C3-A Nemotron agent workflow complete, gate green.** `agent_job`, `agent_plan` (versioned), `agent_action` receipts (idempotency keys, `simulated` flag), `agent_wake` schedule → **scheduled procedure `agent_step`** (minimal authorized context → Nemotron chat completions with the tool allowlist when `NEMOTRON_API_KEY` is set, deterministic simulated planner otherwise or on HTTP failure → every tool call validated against participants, consent, plan version, templates, limits → receipts), `followup_timer` → `on_followup_due` (primary nonresponse → backup → hand-off to organizer), `notification` + `notification_dispatch` → scheduled procedure `deliver_notification` (Twilio when configured, simulated otherwise), `ride_plan`, transport lookup via Nominatim + OSRM outside transactions (failure → `failed` receipt with provider links, nothing invented). Human reducers: `acknowledge_assistance`, `decline_assistance`, `accept_ride_option`, `confirm_ride_booked`, `confirm_pickup`, `confirm_home` (subject only), `demo_fire_followup`, `demo_wake_agent`, `set_phone`. Views `my_agent_jobs`, `my_agent_plans`, `my_agent_actions`, `my_notifications`, `my_ride_plans`. 49/49 tests. `scripts/demo_driver_incident.mts` drives four live identities through the whole flow and passes (OSRM blocked by TLS from this host; recorded as a failed receipt). ARCHITECTURE.md §8 IMPLEMENTED with "Client notes for the agent UI".

- 2026-11-07 — **C4-A complete, gate green.** Venues and venue reports (redaction, moderation, merge/corroboration, votes, 4 h expiry sweep, reporter identity private), demo-labeled safety resources, retention sweep, HTTP handlers `GET /health` and `POST /webhooks/twilio` (real HMAC-SHA1), RLS on `session_member` (the `night_session`/`driver_assignment` join filters break subscriptions and were dropped), hardening tests (prompt injection, unauthorized views, duplicate wakes, scheduler cannot resolve), admin `set_app_role`/`moderate_venue_report`/`reset_demo`, and B's asks: `delete_my_data`, `user_privacy_settings` + `set_privacy_settings` + `my_privacy_settings`, `my_rosters.leftAt`, `my_agent_jobs.followupDueAt/followupExpectedFrom`, `agent_action.resultText`, ride deep-link allowlist with `source`/`fetchedAt`. `module_meta` table fixes the cached `runtime_status` view. 66/66 module tests, 93/93 web tests, demo script PASS, RLS script PASS, CI runs the web suite.

- 2026-11-07 — **C5-A complete.** Judge demo helpers `demo_register_persona`, `demo_setup_group` (idempotent four-persona group with accepted driver, contacts, consent matrix, simulated locations), `demo_reset_group`, `demo_personas` view; `scripts/demo_driver_incident.mts` uses them. README backend section and submission checklist updated with evidence. **Live browser walk on B's UI in live mode passed:** Alex's concern on the Map tab produced Sam's "Do not drive" banner within a second via the RLS-filtered event table. Fixed from that walk: hand-off alerts now never target the incident subject (organizer-is-driver case goes to the reporter or another participant), with a regression test. 73/73 module tests, 93/93 web tests, demo script PASS, module `0.6.0-c5` published locally.

- 2026-11-07 — **Nemotron is live.** Key + model published to the local DB environment (`--env-only`); health route and `runtime_status` report `live`. First real run: plans v1–v3 from `nemotron-3.5-super` (`simulated=false`), correct primary → backup adaptation; the model returns one tool call per response, so the transport stage stalled after `get_transport_options`.

- 2026-11-07 — **C3-A.2 complete.** Multi-round tool loop (results fed back, max 3 rounds), labeled policy receipts, transport fallback with pickup-aware links; 81 tests; live run: every plan from `nemotron-3.5-super`, transport step in two rounds, demo PASS.
- 2026-11-07 — **Live UI verification passed** on B's screens against the live module with the real model: demo group via the judge panel → concern → instant warning on Sam's tab → plan v1 to Maya → real 2-minute timer → plan v2 to Jordan → Jordan "I'm on it" → two-round transport plan with provider-link fallback → Sam books, confirms pickup, confirms home → Resolved on all four tabs.
- 2026-11-07 — **Security review complete** (`docs/SECURITY_REVIEW.md`): 11 fixes incl. phone numbers moved to a private table, server-filled templates only, reporter masked from the subject, `hand_off` only when contacts are exhausted + `no_action` tool, active-member RLS, no coordinates in receipts, rate limits, demo guards, webhook hardening, `known_people` view. 96/96 module tests, module `0.8.0-sec` published, RLS and live demo re-verified.

- 2026-11-07 — **Demo video delivered.** `docs/video/` holds the slides, the four-phone stage, the Playwright recorder, captions, `SafeNight-demo.srt`, and `VIDEO_SCRIPT.md` (timestamped narration). Output `~/Downloads/SafeNight-demo.mp4` (4:12, 1080p, burned-in captions, no audio; the user records the voiceover). The live-demo section was captured against the real module with real Nemotron plans; messaging labeled SIMULATED; transport shows the provider-link fallback.

- 2026-11-08 — **Follow-ups for B shipped (module 0.8.1):** default Nemotron model is now `nvidia/nemotron-3.5-super-vl-120b-a12b` (old id 404s on this account), atomic `reorder_trusted_contacts`, phone privacy confirmed fixed (`user_profile.phoneE164` always empty; use `my_phone`/`set_phone`). 99/99 tests. B's bridge-feed proposal (module → bridge server-side) is open for agreement; `bridge/` stays B-owned.

- 2026-11-08 — **`mobile/` Expo app (SDK 58) for Expo Go.** Native screens for Night Out, Map, Inbox/incident (agent panel, receipts, ride stepper, home confirm), Profile (judge demo panel); persona + server picker on first launch, token per persona/host. Reuses B's five `api.ts` contracts and `live/` adapters plus the generated bindings through Metro `watchFolders` and a resolver that pins one `spacetimedb` and one `react`; localStorage shim over AsyncStorage; `withCompression('none')`. Verified: typecheck, iOS + Android `expo export` bundles, 5 unit tests, live web-mode run against the LAN server (setup group, roster, map, check-in). Not verified on a physical phone yet. See `mobile/README.md`.

- 2026-11-08 — **Maincloud is live.** Database `safenight` on `wss://maincloud.spacetimedb.com` (owner: Sohaib's spacetimedb.com login), module 0.8.1, Nemotron key + model set, `APP_ENV=demo`, schedules armed, resources seeded; health route reports live. RLS proof PASS against Maincloud; demo script run showed Nemotron plan v1 live and a labeled fallback when one model call exceeded the 20 s HTTP timeout → timeout raised to 40 s and the script's waits lengthened. Device guide: `docs/DEMO_DAY.md` (2 phones in Expo Go + 2 laptops, all on Maincloud). Mobile default server is Maincloud.

- 2026-11-08 — **Phone runs the Expo app over a tunnel.** Expo's signed tunnel needs matching Expo logins on laptop (`npx expo login`) and Expo Go; `npm run mobile:tunnel` (root) / `npm run tunnel` (mobile) use `--tunnel ngrok`. Fixed on first device run: the SDK's window/document resume listeners crashed on React Native → no-op shims in `mobile/src/polyfills.ts`.

**In progress (planned 2026-11-08, from Sohaib's review of the phone app)**
- **IN PROGRESS 2026-11-08 — Mobile redesign:** a subagent was mid-way when Sohaib's usage limit hit. If `mobile/` has uncommitted changes when you read this: run `cd mobile && npx tsc --noEmit && npm test && npx expo export --platform ios --platform android && rm -rf dist`, then commit `mobile/` and push. If it is incomplete, finish per the spec below (design system in `mobile/src/ui/`, four tabs Tonight/Map/Inbox/Me, `react-native-maps`, one-tap "Start a hangout"). Web (B) should pass an empty name or "New Year's Eve" to `demo_setup_group` so the session name matches.
- **Mobile redesign (A, `mobile/`):** too many buttons, flow scattered. Target: Apple HIG minimalism. Four tabs: **Tonight** (one status card: group, driver, your sharing; one primary action row: I'm okay / Need help; concern report lives behind the driver's row), **Map** (real Apple Maps via `react-native-maps`, works in Expo Go), **Inbox** (alerts + incidents; incident screen keeps plan/receipts/ride but grouped into collapsible sections), **Me** (profile, people, privacy, data; the judge panel under a separate "Demo" group at the bottom). System font (SF), large titles, grouped inset lists, 17 pt body, one primary button per screen, no "Backend check"/"Online now" on the home screen (moved to Me → Developer). **Hangout creation in one tap:** "Start a hangout" creates a session with defaults (name from the date, ends in 6 h, 60-min check-ins) and shows the invite code immediately; "Join with a code" is one field.
- **DONE 2026-11-08 — Demo scenario is NYE Times Square:** `demo_setup_group` seeds "New Year's Eve" at "Times Square, New York, NY" with the four friends around the ball (Sam near Grand Central); 7 Midtown demo safety resources, idempotent by name. 99/99 tests; published to Maincloud; demo script PASS there with live Nemotron plans. (Original plan text follows.)
- **Demo scenario (A, `spacetimedb/`):** New Year's Eve ball drop in New York. `demo_setup_group` seeds the four friends around Times Square (venue hint "Times Square, New York, NY"), with Sam a few blocks away; safety-resource seeds move to Midtown Manhattan. Published to Maincloud; web picks it up automatically.
- **For B (web):** same scenario appears on the web map automatically (seeded coordinates); consider mirroring the simplified IA on the web later.

**For B**
- Point your laptop at Maincloud: append `VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com` and `VITE_SPACETIMEDB_DB_NAME=safenight` to `web/.env.local` (see `docs/DEMO_DAY.md`). Only Sohaib's login can publish the module there; ask A for module changes. Remaining items are the user's: repo public, hosting decision (laptop vs Maincloud), optional Twilio keys.

**Previously in progress (done)**
- C3-A.2 live tuning: multi-round tool loop inside `agent_step` (tool results fed back to the model, max 3 rounds), labeled deterministic policy receipts (`source: policy`) that guarantee the transport stage ends in a proposed ride plan, geocodable demo venue, pickup coordinates in ride deep links.
- Still waiting on: `NEMOTRON_API_KEY` (planner is simulated until then), decision on Maincloud vs laptop for judging, repo made public. B: adapters for `AgentApi`/`ReportsApi`/`ProfileApi`, flip providers to live, refresh README Demo and Hackathon tracks sections.

**For B: wiring `NightOutApi` to the live bindings (C1-A is live on the local server)**
- `useTable(tables.mySessions)` → `NightSession[]` (already excludes sessions you left). Map `id`/`sessionId` bigint → `String(id)`, `Identity` → `identity.toHexString()`, `Timestamp` → `ts.toDate().getTime()`, enum tags PascalCase → snake_case (`'LocationPrecise'` → `'location_precise'`; a tiny `tagToSnake()` helper covers all enums).
- `roster(sessionId)`: filter `useTable(tables.myRosters)` by `sessionId` (rows carry `displayName`, `avatarEmoji`, `role`, `sharingScope`, `driverStatus`, `active`), `useTable(tables.nightSession)` for the session row, `useTable(tables.driverAssignment)` filtered by `sessionId`, `useTable(tables.myInvites)` for the organizer's invites. There is no `session_roster(sessionId)` view with arguments (the TS client query builder cannot subscribe to view args).
- `myConsents` → `useTable(tables.myConsents)` (subject or recipient; filter `revokedAt === undefined && expiresAt > now` client-side).
- Actions map 1:1 to `reducers.*` with object args: `createInvite({ sessionId: BigInt(id), ttlMinutes, maxUses })` etc. Reducer promises reject with `SenderError` whose `message` is the human-readable text. `joinSession` resolves to void; read the new session from `mySessions` after `onApplied`. `createSession` also resolves to void; select the newest `mySessions` row.
- `me` is `useSpacetimeDB().identity?.toHexString()`; a profile row (`reducers.setProfile`) is required before `createSession`/`joinSession` (`'Set up your profile first'`).
- Error strings and every column are listed in `docs/ARCHITECTURE.md` §6.

**Next**
- C3-A agent workflow.

**Blockers / needs from B**
- None.

**For B (status 2026-11-07)**
- Every binding you asked for is live: `delete_my_data`, privacy settings, `leftAt`, `followupDueAt`/`followupExpectedFrom`, `resultText`, link allowlist, `demo_fire_followup`/`demo_wake_agent`/`reset_demo`, and (C5, landing now) `demo_register_persona` + `demo_setup_group` + `demo_reset_group` + `demo_personas` view for the judge panel. CI runs `npm test -w web`.
- Please refresh README "Demo" and "Hackathon tracks" (they still say mock-only / module in progress) and flip the default providers to live once your adapters for `AgentApi`, `ReportsApi`, `ProfileApi` exist.

**Needs from the user**
- `NEMOTRON_API_KEY` (and model confirmation) to switch the planner from simulated to live; Maincloud login if the judged demo should not run on a laptop; make the repo public before submission.

**Gotchas recorded for later chunks**
- The module entry (and anything it `export *`s) may only export Spacetime objects; keep constants/helpers in `src/lib/` and do not re-export them.
- A view named `foo_bar` reserves the type name `FooBar`; custom `t.row` names must differ (e.g. `FooBarRow`).
- `ctx.env` is undefined in the vitest harness; read it through `envOf(ctx)` in `src/lib/env.ts` so tests see simulated mode.
- Enum variants are PascalCase in generated bindings (`{ tag: 'Active' }`) even though module code declares them snake_case.
- Query-builder semijoin: the right side must be a bare table ref; put filters on the left/source side and use `rightSemijoin` to return the other table.
- Prefix lookups on multi-column indexes fail in the test harness; add a single-column index for the column you filter alone.
- A `throw` rolls back the transaction, so denied actions cannot persist `audit_event` rows; `deny()` logs and throws instead.
- Anonymous views whose read set has no table rows are cached across publishes (`runtime_status` kept reporting an old version); read at least one table row (`module_meta`).
- Reading `test.db.*` inside a `withReducerTx` callback deadlocks the harness; read ids before the callback. `ctx.env` inside a procedure transaction throws in the harness; guard with `envOf`.
- RLS join filters on `night_session`/`driver_assignment` publish but make every subscription to those tables fail with "Subscriptions require indexes on join columns"; only the `session_member` self-join works.
- Enum names must not collide with a table's PascalCase type (`AppRole` → `AppRoleKind`); `UniqueIndex` has no `update`, update through the primary key; no `Array.prototype.at` under the ES2021 lib.

---

## Person B — status

_Owner: Person B (Claude Pro). Edit only this section._

### Summary (kept current; details in the dated log below)

**Done (all on `main`, web suite 112 tests green, bridge 56 tests green):**
- Client for every chunk (C1–C5): Night Out, Map, status/check-ins + hold-to-confirm emergency, concern sheet, no-driving banner, Inbox + incident timeline, agent plan/receipts/messages, ride options + "I'm home safe", Reports, Profile (contacts ladder, privacy, phone, delete), judge demo panel.
- Live SpacetimeDB adapters for all five domains (night-out, safety, agent, reports, profile); live is the default, `npm run dev:mock -w web` for local mocks. Demo persona auto-registration + one-click "Set up demo group" on the server.
- Verification: integration tests for the demo flow and safety rules, axe accessibility checks on every screen, WCAG contrast test, keyboard hold-to-confirm test, converter tests for every live adapter.
- Phone-ready web app (PWA, persona picker, install hint, `dev:phone`), four-device demo guide in `docs/DEMO_SCRIPT.md`.
- Emergency coordination `bridge/`: Nemotron decides calls (buddy → backup → SIMULATED dispatch to a demo number; emergency numbers hard-blocked), ElevenLabs voice over the Photon 2.0 SIP line. Verified live: real Nemotron decision → real call to a teammate's phone. Texting off (`TEXT_CHANNEL=none`) because SMS on the line needs a 10DLC campaign.
- Docs: README (modes, bridge, phones, tracks), demo script, bridge README.

**In progress (2026-11-08):**
- UI redesign from user feedback: Apple-style design system (SF typography, grouped lists, translucent 4-tab bar: Tonight / Map / Alerts / You), diagnostics moved off the home screen, one-tap "Start a hangout" (defaults: New Year's Eve, Times Square), sectioned session screen with fewer buttons, real Leaflet/OpenStreetMap map of Times Square with the four friends at preset spots for the ball drop, compact status bar with a "Need help" sheet.

**Planned / remaining:**
- Walk the four-device demo on live data (2 laptop tabs + 2 phones) once the module is on Maincloud; record results here.
- Rehearse with `SIMULATE_ALL=1`; real calls only for final checks (ElevenLabs Starter ≈ 45 call-minutes; plan set to cancel Dec 8).
- Fill `bridge/.env` demo phones (`PHONE_MAYA`, `PHONE_JORDAN`, `DEMO_DISPATCH_NUMBER`), optional dispatch agent; enable voicemail detection on the ElevenLabs agents.
- Stretch (with A, `mobile/`): Expo development build in the iOS Simulator and a Live Activity incident card on the lock screen / Dynamic Island.
- Stretch: SMS texting via the Photon 2.0 beta API once a 10DLC campaign is approved.

**Done**
- 2026-11-07 — C0 web shell exists (built by the orchestrator so B starts from a working app): persona switcher (`?as=sam|alex|maya|jordan`, one SpacetimeDB identity per persona), connection status, runtime-status badges, online list, ping check, five-tab shell with placeholders. Typecheck and `vite build` pass.

- 2026-11-07 — **C1-B Night Out tab built against a local mock** (C1-A bindings not landed yet). `web/src/features/night-out/api.ts` is the client contract (types mirror ARCHITECTURE §6; `useNightOut()` hook). `features/night-out/mock/` implements it with §6 rules (explicit driver acceptance, caller-only sharing, leave revokes own grants, end revokes all) and syncs persona tabs via localStorage + BroadcastChannel. Screens: `screens/night-out/start/` (my sessions, create, join by code) and `screens/night-out/session/` (roster, invites, driver volunteer/accept/stop, own sharing scope, per-recipient consent toggles, leave/end with inline confirm). Every screen shows a `MOCK DATA — C1-A pending` badge. Gate: typecheck + `vite build` pass. **Not covered:** four-tab live roster check not yet run by hand; no server-backed data.

- 2026-11-07 — **C2-B built against a local mock** (C2-A bindings not landed). Contract `web/src/features/safety/api.ts` (`useSafety()`; current session = first of `mySessions`). Mock `features/safety/mock/` follows ARCHITECTURE §7: consent-filtered `visible_locations` with approximate rounding and 5-min stale flag; concern on the accepted driver with `possible_consumption` opens the incident, warns the driver and alerts organizer/participants in one mutation; dedupe "Already reported"; `okay` never closes an open incident; acknowledge excludes the subject; resolve only by the subject or organizer/buddy with live `messaging`+`checkins` grants; cancel subject-only within 2 min; driver self-report stays private unless shared. Screens: Map tab (`screens/map/`, SVG plot + list, SIMULATED badge, stale state) with the status bar (`features/status/`: check-ins, 1.5 s hold-to-confirm emergency with keyboard support, concern sheet in a native dialog, private self-report); app-wide no-driving banner; Inbox tab (`screens/inbox/`) with incident timeline (`screens/incident/`). Gate: typecheck + `vite build` pass. **Not covered:** the "Alex's concern shows Sam's warning within 1 s" check has not been run by hand (no browser automation available); `awaiting_home_confirmation` is never reached until C3 transport flow exists.

- 2026-11-07 — **C3-B built against a simulated agent mock** (C3-A not landed). Contract `web/src/features/agent/api.ts`. Mock `features/agent/mock/` is a deterministic planner (every plan/receipt/notification `simulated`): plan v1 with tool receipts, consent re-checked before every message (missing/revoked → "Blocked" receipt), message to primary buddy (queued → sent → delivered), 2-min follow-up, escalation primary → backup → organizer exactly once per tier, decline escalates, honest "no one reachable" when nobody can be messaged; ride plan proposed → chosen → booked by a person → pickup confirmed; only the subject confirms home; the agent never resolves. Incident screen embeds `features/agent-panel/` (plan, receipts, messages with distinct delivery states, buddy "I'm on it"/"I can't help"), `features/rides/` (stepper, deep links allowlisted to Uber/Lyft https or app schemes, "I booked this", confirm pickup, "I'm home safe"). Judge `features/demo-panel/` in the Profile tab: set up demo group, advance timer, reset; disabled when `VITE_APP_ENV=production`.
- 2026-11-07 — **C4-B built against mocks.** Reports tab (`features/reports/`, `screens/reports/`): venue-level reports, contact-info redaction, 280-char limit, per-submitter merge/corroboration, simulated moderation, expiry, fictional seed venues and resources; no reporter identity in client objects. Profile tab (`features/profile/`, `screens/profile/`): profile, trusted-contact backup ladder with reorder, privacy defaults, typed-confirmation data delete (profile, contacts, privacy only for now). `docs/DEMO_SCRIPT.md` and README "Demo" / "Hackathon tracks" sections written, marking mock vs real honestly. Accessibility review: contrast of badges/chips on `--surface` passes; global focus-visible and reduced-motion rules exist; headings fixed. Gate: typecheck + `vite build` pass. **Not covered:** Lighthouse ≥ 90 not measured and the demo script not walked by hand (no browser automation available here).

- 2026-11-07 — **C1-B live adapter** `web/src/features/night-out/live/` implements `NightOutApi` on the C1-A bindings (`my_sessions`, `my_rosters`, `night_session`, `driver_assignment`, `my_invites`, `my_consents`, `user_profile`; reducers 1:1, auto `set_profile` before create/join, waits for the new row to resolve ids). Switch with `VITE_NIGHTOUT_SOURCE=live` (`features/night-out/NightOutProvider.tsx`); default stays `mock` because the C2/C3 mocks and the demo panel read the mock Night Out store directly. Gate: typecheck + `vite build` pass in both modes. **Not covered:** not run against a live server (SpacetimeDB CLI not installed on B's machine). Mapping notes: module `DriverEndReason.LeftSession` shown as `none`; `my_rosters` has no `leftAt`, so departed members show `joinedAt` as best effort.

- 2026-11-07 — **Verification and live-mode readiness.** Web test harness (`npm test -w web`: vitest + jsdom + Testing Library + axe-core), **80 tests passing**: the full `docs/DEMO_SCRIPT.md` flow driven through four persona hooks (setup → concern → instant no-driving warning → plan v1 → follow-up → backup buddy → ack → ride booked → pickup → only Sam confirms home → resolved; reset), C1–C3 safety rules (driver acceptance, consent revocation, dedupe, okay-doesn't-close, subject-only cancel, blocked messaging, no false handoff); axe-core on every screen with zero violations; accessible names on every control; keyboard hold-to-confirm; WCAG contrast ≥ 4.5:1 for all theme and chip colour pairs (57). Agent/safety mocks and demo panel no longer read the mock Night Out store directly, so they run with `VITE_NIGHTOUT_SOURCE=live` (limit: in live mode the agent only sees consents the caller can see; group setup needs a backend demo reducer). Shared current session (`features/night-out/currentSession.tsx`) so Map/Inbox follow the session opened in Night Out. Gate: tests, typecheck, and `vite build` (mock and live) pass. **Not covered:** a real-browser walk and Lighthouse score (no browser automation on B's machine; jsdom axe skips colour contrast, covered by the computed contrast test instead); no live-server run.

- 2026-11-07 — **C2-B live adapter** `web/src/features/safety/live/` implements `SafetyApi` on the C2-A bindings per ARCHITECTURE §7 client notes (visible_locations, my_checkins, my_incidents + my_incident_participants, my_incident_events, `safety_alert` via `onInsert` only; dismissals per identity in localStorage). Switch with `VITE_SAFETY_SOURCE=live` (`features/safety/SafetyProvider.tsx`), independent of `VITE_NIGHTOUT_SOURCE`. The agent mock now reads incidents through a `SafetyView`: in live-safety mode it plans from caller-visible incidents, never writes the safety mock store, records status changes as "pending backend C3-A" receipts, and "I'm home" calls `check_in(home)`. Gate: 87 tests, typecheck, and build (all-mock and all-live) pass. **Not covered:** no run against a live server (no SpacetimeDB CLI on B's machine).

- 2026-11-07 — **C3-B live adapter** `web/src/features/agent/live/` implements `AgentApi` on the C3-A bindings per ARCHITECTURE §8 client notes (`my_agent_jobs`, `my_agent_plans`, `my_agent_actions`, `my_notifications`, `my_ride_plans`; JSON columns parsed defensively; ride options chosen by `label`; human reducers 1:1; `demo_fire_followup` for the judge timer). Switch with `VITE_AGENT_SOURCE=live` (`features/agent/AgentProvider.tsx`). Live demo panel: "Advance timer" works; group setup/reset disabled until C4 `reset_demo`. Ride links additionally allow `https://www.google.com/maps/...` (the module's transit link). Gate: 93 tests, typecheck, build (all-mock and all-live) pass. **Not covered:** no live-server run from B's machine.

- 2026-11-07 — **C4-B live adapters**: Reports (`features/reports/live/`: venues, published + own reports, resources, create venue, submit, corroborate/dispute votes) and Profile (`features/profile/live/`: profile, contacts ladder, privacy settings, delete my data) plus live demo reset via `reset_demo`. Every tab now has a live adapter; `npm run dev:live -w web` turns them all on. Gate: 100 tests, typecheck, build (mock and live) pass. **Not covered:** no live-server run from B's machine; README Demo/Tracks sections and `docs/DEMO_SCRIPT.md` updated for live mode.

- 2026-11-07 — **C5-B client integration.** Live data is now the default (`npm run dev -w web`); `npm run dev:mock -w web` / `VITE_DATA_SOURCE=mock` runs on local mocks, per-tab flags override. Uses A's C5 additions: roster `leftAt`, receipt `resultText`, follow-up countdown fields, and the demo reducers (`features/demo-live/`: each persona tab auto-registers via `demo_register_persona`; Profile demo panel shows registered personas, "Set up demo group" → `demo_setup_group`, "Reset demo group" → `demo_reset_group`, "Wipe all demo data" → `reset_demo`). README and demo script updated. Gate: 101 tests, typecheck, build (live and mock) pass. **Not covered:** the live four-tab walk in a real browser (C5 "B verifies").

- 2026-11-08 — **Emergency coordination bridge (Photon track stretch).** New standalone `bridge/` service (own package, not a workspace): incident screens sync snapshots; Nemotron (NIM tool calling; deterministic simulated planner without a key) chooses `text_group` (fixed templates only), `call_person`, or `dispatch_call`; a pure policy layer validates every action (dispatch only for urgent + emergency/unacknowledged, once per incident, ONLY to `DEMO_DISPATCH_NUMBER`, emergency/short codes hard-blocked). Texts via Photon Spectrum (`spectrum-ts`, shared iMessage line, persona opt-in by texting "join <persona>" from the configured phone); calls via ElevenLabs outbound SIP over Photon. Localhost-only by default, token + rate limit. Web: `features/coordination/` panel on the incident screen (Nemotron reasoning, text/call statuses, "SIMULATED DISPATCH" box), personas taken from the server registry, location only under consent. Gate: web 107 tests, bridge 50 tests, simulated end-to-end smoke (sync → dispatch decision → 401 without token). **Not covered:** no real Photon/ElevenLabs/Nemotron call yet (needs keys in `bridge/.env`).

- 2026-11-08 — **Phone-ready demo + live bridge check.** PWA (manifest, icons, app-shell service worker that never touches SpacetimeDB/bridge traffic), "Who is this phone?" persona picker for home-screen launches, install hint, `npm run dev:phone -w web` (LAN URLs), and a four-device demo guide in `docs/DEMO_SCRIPT.md` (2 laptop tabs + 2 phones; needs live data). Bridge verified against real services: Photon Spectrum and ElevenLabs credentials accepted, buddy agent and imported Photon SIP number found, and a real Nemotron decision (`nvidia/nemotron-3.5-lightning-30b-a3b`) chose the least-escalation group text, correctly blocked because nobody had opted in. Fixed: bridge now loads `bridge/.env`; default model switched because `nemotron-3-super-120b-a12b` returns 404 on our NIM account. Gate: web 112 tests, bridge 52 tests.

- 2026-11-08 — **Live call verified end to end.** Bridge (calls-only, `TEXT_CHANNEL=none`) + real Nemotron (`nemotron-3.5-lightning-30b-a3b`) + ElevenLabs over the Photon 2.0 SIP line `+16179580190`: Nemotron first chose to call the subject, policy blocked it, Nemotron re-planned and called the organizer, the phone rang and the Buddy agent spoke (reached voicemail, 9 s). Earlier SIP 403 was a wrong digest password (SIP trace: 407 challenge → correct user/realm/SHA-256 → 403); fixed by resetting the Photon outbound password. SMS on that line is blocked until a 10DLC campaign exists, so texting stays off.

**In progress**
- Nothing.

**Next**
- Run the C1/C2 gates on live data: `VITE_NIGHTOUT_SOURCE=live VITE_SAFETY_SOURCE=live npm run dev -w web` against `spacetime start` + published module, four persona tabs.
- C5 verify: walk `docs/DEMO_SCRIPT.md` on live data (`npm run dev -w web` against a running server) in four real browser tabs; record results here.
- When A's bindings land: write adapters implementing `NightOutApi`, `SafetyApi`, `AgentApi`, `ReportsApi`, `ProfileApi` and swap them for the mock providers in `web/src/App.tsx`; screens should not change. Then run every gate against the local server.

**Blockers / needs from A**

Open:
- **Hosting (blocks the four-device demo):** publish the module to Maincloud (`spacetime login` + `spacetime publish safenight`) or agree on a laptop server reachable on Wi-Fi. Phones and laptop tabs must share one live database; mock data only syncs inside one browser.
- **Bridge server-side feed (proposal):** today the incident screen POSTs snapshots to `bridge/` with a browser-held `VITE_BRIDGE_TOKEN` (demo-only, bridge bound to 127.0.0.1). Production path: the module feeds the bridge (a bridge identity + outbox view, or a procedure POSTing snapshots) and records bridge call/text outcomes as receipts on the incident timeline.
- **ElevenLabs post-call webhook (optional):** an `/webhooks/elevenlabs` HTTP handler in the module (HMAC `elevenlabs-signature`) would record call outcomes on Maincloud without a laptop tunnel.
- **Voice in the agent tool list (optional):** the module's `send_approved_message` is SMS/in-app only; the voice escalation (buddy call → backup → SIMULATED dispatch to a demo number) currently lives entirely in `bridge/`. If you want it in Nemotron's module-side plan, add a `request_call` tool whose execution the bridge picks up.

Done by A (thanks): phone numbers moved to private `user_phone` / `myPhone` (B adapter updated), working default Nemotron model, atomic `reorder_trusted_contacts` (B adapter updated), `leftAt`, `followupDueAt`/`followupExpectedFrom`, `resultText`, demo persona/group/reset reducers, `submit_venue_report`, `delete_my_data`, privacy settings, ride-link allowlist, `npm test -w web` in CI, ownership rows for `bridge/`, `video/`, `mobile/`.

---

## Open questions (for the user)

1. **Who is Person A and who is Person B?** Names and GitHub handles, so commits and this file can say so.
2. **SpacetimeDB hosting for the demo:** local server during judging, or Maincloud? Maincloud needs the repo owner to run `spacetime login` once on the publishing machine and to pick the database name (proposed: `safenight`).
3. **Nemotron:** besides the API key, confirm the model. Default is `nvidia/nemotron-3-super-120b-a12b` on `integrate.api.nvidia.com`; any Nemotron model with tool calling works by changing `NEMOTRON_MODEL`.
4. **Twilio:** do you have an account with a verified test number? If not, messaging stays simulated and labeled.
5. **iOS:** build a native SwiftUI app later, or is the mobile-first web app enough for the hackathon? A native app needs a Swift client for the SpacetimeDB WebSocket protocol (no official SDK) and an iOS simulator runtime download (~7 GB).
6. **Public repo timing:** the repository must be public to qualify. Make it public now or right before submission?
