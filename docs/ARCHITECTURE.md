# SafeNight architecture and module contract

This is the contract between the SpacetimeDB module (Person A) and the web client (Person B). Everything marked **IMPLEMENTED** exists in `spacetimedb/src` and in the generated bindings under `web/src/module_bindings`. Everything marked **PLANNED** is the agreed shape for upcoming chunks; names may still change, and when they do this file and the bindings change in the same commit.

## 1. Principles

| Principle | What it means in code |
|---|---|
| SpacetimeDB owns state, consent, and timers | Every session, membership, consent grant, location, incident, agent job, receipt, and timer is a table row. Reducers are the only writers. Schedule tables drive follow-ups and expiry. No other server exists. |
| Deterministic warnings never wait on the model | A concern report opens the incident and emits the no-driving warning in the **same reducer transaction**. The agent is woken afterwards by a schedule row. |
| Nemotron proposes within an allowlist | The model only returns tool calls from a fixed list. A reducer validates each call against membership, consent, incident state, plan version, and rate limits before anything runs. Rejections are recorded as receipts. |
| Humans confirm outcomes | `transport_arranged` and `home_confirmed` are set only by the person concerned (or an authorized human). Arrival suggested by location is a separate, weaker state. `I'm fine` records a check-in but never closes an open incident. |
| Simulations are labeled | Every outward action and every model call carries `simulated: bool`. The UI shows a SIMULATED badge wherever it is true. |
| Minimal disclosure | Private tables plus per-user views. Public tables hold only what every member may see. Exact locations are visible only through consent-scoped views. |

## 2. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Table / view / reducer canonical name | `snake_case`, set explicitly with `name:` | `night_session`, `my_sessions`, `accept_driver_role` |
| Accessor in module code and bindings | `camelCase` schema key | `ctx.db.nightSession`, `tables.nightSession`, `reducers.acceptDriverRole` |
| Row fields in bindings | `camelCase` | `createdAt`, `sessionId` |
| Ids | `t.u64().primaryKey().autoInc()`; pass `0n` on insert | `id: 0n` |
| People | `t.identity()` | `owner`, `subject`, `recipient` |
| Time | `t.timestamp()` (microseconds since epoch, `bigint`), durations `t.timeDuration()` | `expiresAt`, `lastSeenAt` |
| Status columns | `t.enum('Name', ['A','B'])` with no payload, so they can be indexed | `status: t.enum('IncidentStatus', [...]).index('btree')` |
| Foreign keys | `<table>Id: t.u64().index('btree')`; composite lookups via table-level multi-column btree indexes | `indexes: [{ accessor: 'bySessionUser', algorithm: 'btree', columns: ['sessionId','userId'] }]` |
| Errors to clients | `throw new SenderError('...')` with a stable, human-readable message | `SenderError('Only the driver can accept the driver role')` |
| Audit | Every authorization decision that denies, and every outward action, writes an `audit_event` row | |

## 3. Runtime modes

| Capability | Live when | Simulated when | How the client can tell |
|---|---|---|---|
| Nemotron planning | `NEMOTRON_API_KEY` is set | key absent, or the live call fails and the deterministic fallback runs | `runtime_status.nemotronMode` is `live` or `simulated`; each `agent_plan` / `agent_action` row has `simulated` |
| SMS / voice (Twilio) | all three `TWILIO_*` vars set | any missing | `runtime_status.messagingMode`; `notification.simulated` |
| Transport / directions | always live (OSRM + Nominatim, no key) | network failure → receipt `status: failed`, nothing invented | `agent_action.simulated` is `false`, `status` says `failed` |
| Locations | never live in the demo | demo personas post coordinates through `post_location` with `source: simulated` | `location_update.source` |

Simulated mode must exercise the **same** reducers, tables, timers, and receipts as live mode. The only difference is who produced the plan text and whether an HTTP request left the host.

## 4. Environment variables

Declared in `schema(..., { env })`. All optional. Read with `ctx.env.X` inside reducers, procedures, and views. Values are supplied at publish time, never committed.

| Key | Default when absent | Used by |
|---|---|---|
| `NEMOTRON_API_KEY` | simulated planner | `agent_step` procedure |
| `NEMOTRON_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | `agent_step` |
| `NEMOTRON_BASE_URL` | `https://integrate.api.nvidia.com/v1` | `agent_step` (OpenAI-compatible `/chat/completions`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | simulated messaging | `deliver_notification` procedure |
| `APP_ENV` | `development` (enum: `development`, `demo`, `production`) | `runtime_status`, demo-only reducers refuse to run in `production` |

Supply: `NEMOTRON_API_KEY='...' spacetime publish safenight --env-only --server local`, or `spacetime.local.json` (git-ignored). See `.env.example`.

## 5. C0 — foundation (IMPLEMENTED)

### Tables

| Table | Visibility | Columns | Notes |
|---|---|---|---|
| `config` | private | `id: u8 pk`, `owner: identity`, `createdAt: timestamp` | Single row `id = 0`. `owner` is `ctx.sender` from `init`, used for owner-only reducers. |
| `client_presence` | public | `identity: identity pk`, `online: bool`, `lastSeenAt: timestamp`, `connectionCount: u32` | Maintained by lifecycle reducers. |
| `audit_event` | private | `id: u64 pk autoInc`, `actor: identity (btree)`, `action: string`, `resource: string`, `decision: string`, `at: timestamp` | Append-only. |

### Functions

| Kind | Name | Args | Behavior |
|---|---|---|---|
| lifecycle | `init` | — | Inserts `config {id: 0, owner: ctx.sender}`. |
| lifecycle | `clientConnected` | — | Upserts `client_presence` for `ctx.sender`: `online = true`, `connectionCount += 1`, `lastSeenAt = now`. |
| lifecycle | `clientDisconnected` | — | Decrements `connectionCount`; `online = connectionCount > 0`. |
| reducer | `ping` | `note: string` | Writes `audit_event {action: 'ping', resource: note, decision: 'ok'}`. Rejects empty or > 200-char notes with `SenderError`. |
| anonymous view | `online_members` | — | `client_presence` rows where `online = true` (query builder). |
| anonymous view | `runtime_status` | — | One row: `id: u8 (0)`, `appEnv`, `nemotronMode` (`live`/`simulated`), `nemotronModel`, `messagingMode`, `moduleVersion`. Never returns secrets. |

### Client bindings

`spacetime generate` writes `web/src/module_bindings/`. Import `{ DbConnection, tables, reducers }` from `web/src/module_bindings` (index). Views appear on `tables.*` for subscriptions (`tables.onlineMembers`, `tables.runtimeStatus`).

## 6. C1 — Night Out core (PLANNED)

### Tables

| Table | Visibility | Columns | Indexes |
|---|---|---|---|
| `user_profile` | public | `identity pk`, `displayName`, `avatarEmoji`, `phoneVerified: bool`, `createdAt` | — |
| `trusted_contact` | private | `id pk`, `owner: identity`, `contact: identity`, `role: enum ContactRole [buddy, backup_buddy, emergency]`, `messagingConsent: bool`, `priority: u8`, `createdAt` | `owner`, (`owner`,`priority`) |
| `night_session` | public | `id pk`, `organizer: identity`, `name`, `venueHint: string`, `startsAt`, `expiresAt`, `status: enum SessionStatus [planned, active, ended, expired]`, `checkinIntervalMinutes: u16`, `createdAt` | `organizer`, `status` |
| `invite` | public | `id pk`, `sessionId`, `code: string unique`, `createdBy`, `expiresAt`, `revokedAt: option<timestamp>`, `maxUses: u8`, `uses: u8` | `sessionId` |
| `session_member` | public | `id pk`, `sessionId`, `userId: identity`, `role: enum MemberRole [organizer, participant]`, `joinedAt`, `leftAt: option<timestamp>`, `sharingScope: enum SharingScope [none, approximate, precise]` | (`sessionId`,`userId`), `userId` |
| `driver_assignment` | public | `id pk`, `sessionId`, `driverId`, `volunteeredAt`, `acceptedAt: option`, `endedAt: option`, `endReason: enum DriverEndReason [none, cannot_drive, replaced, session_ended]` | `sessionId`, `driverId` |
| `consent_grant` | private | `id pk`, `subject: identity`, `recipient: identity`, `sessionId`, `scope: enum ConsentScope [location_precise, location_approximate, checkins, concern_reports, messaging]`, `startsAt`, `expiresAt`, `revokedAt: option` | (`subject`,`recipient`), `recipient`, `sessionId` |
| `session_expiry` | private, **schedule table** | `scheduledId pk autoInc`, `scheduledAt: scheduleAt`, `sessionId` | → reducer `expire_session` |

### Reducers

| Name | Args | Authorization | Errors |
|---|---|---|---|
| `set_profile` | `displayName, avatarEmoji` | self | empty name |
| `add_trusted_contact` | `contact, role, messagingConsent, priority` | self; contact must have a profile | duplicate |
| `remove_trusted_contact` | `id` | owner only | not found |
| `create_session` | `name, venueHint, startsAt, expiresAt, checkinIntervalMinutes` | any profiled user; inserts organizer member + `session_expiry` row | expiresAt in past |
| `create_invite` | `sessionId, ttlMinutes, maxUses` | organizer; code 6 chars from `ctx.random` | session not active |
| `revoke_invite` | `inviteId` | organizer | — |
| `join_session` | `code` | invite valid, unexpired, unrevoked, uses < max; member row with `sharingScope: none` | invalid/expired code |
| `leave_session` | `sessionId` | member; sets `leftAt`, revokes own consent grants for that session, ends driver assignment if driver | not a member |
| `end_session` | `sessionId` | organizer; status `ended`; revokes all grants | — |
| `volunteer_driver` | `sessionId` | member; one open assignment per session | already a driver |
| `accept_driver_role` | `assignmentId` | **the volunteer only** (explicit acceptance) | — |
| `end_driver_role` | `assignmentId, reason` | the driver or organizer | — |
| `grant_consent` | `recipient, sessionId, scope, ttlMinutes` | subject only; recipient must be a member | — |
| `revoke_consent` | `grantId` | subject only; sets `revokedAt` | — |
| `set_sharing_scope` | `sessionId, scope` | self only; organizer **cannot** call for others | — |
| `expire_session` | schedule row | scheduler only (private) | — |

### Views

| Name | Context | Args | Returns |
|---|---|---|---|
| `my_sessions` | per-user | — | `night_session` rows where caller is an active member (semijoin) |
| `session_roster` | per-user | `sessionId` | members + role + sharing state for callers who are members |
| `my_consents` | per-user | — | grants where caller is subject or recipient |
| `my_contacts` | per-user | — | caller's `trusted_contact` rows |

## 7. C2 — Location, status, deterministic safety engine (PLANNED)

### Tables

| Table | Visibility | Columns | Indexes |
|---|---|---|---|
| `location_update` | private | `id pk`, `sessionId`, `userId`, `lat: f64`, `lng: f64`, `accuracyM: f32`, `recordedAt`, `expiresAt`, `source: enum LocationSource [device, simulated]` | (`sessionId`,`userId`), `userId` |
| `checkin` | private | `id pk`, `sessionId`, `userId`, `kind: enum CheckinKind [okay, need_friend, need_ride, unwell, emergency, home]`, `note`, `createdAt` | (`sessionId`,`userId`), `sessionId` |
| `consumption_self_report` | private | `id pk`, `userId`, `sessionId`, `level: enum ConsumptionLevel [none, some, impaired_feeling]`, `shareWithBuddy: bool`, `createdAt` | `userId` |
| `concern_report` | private | `id pk`, `sessionId`, `reporter`, `subject`, `category: enum ConcernCategory [possible_consumption, separated, unwell, unsafe]`, `note`, `createdAt`, `dedupeKey: string unique` | `subject`, `sessionId` |
| `incident` | private | `id pk`, `sessionId`, `subject`, `kind: enum IncidentKind [possible_impaired_driving, help_requested, missed_checkin, feeling_unsafe]`, `severity: enum Severity [info, elevated, urgent]`, `status: enum IncidentStatus [open, acknowledged, assistance_underway, transport_arranged, awaiting_home_confirmation, resolved, cancelled, handed_off]`, `openedBy`, `openedAt`, `resolvedAt: option`, `resolvedBy: option` | `sessionId`, `subject`, `status` |
| `incident_event` | private | `id pk`, `incidentId`, `at`, `actor: identity`, `kind: string`, `detail: string`, `simulated: bool` | `incidentId` |
| `incident_participant` | private | `id pk`, `incidentId`, `userId`, `role: enum ParticipantRole [subject, reporter, buddy, backup, organizer]`, `acknowledgedAt: option` | (`incidentId`,`userId`) |
| `safety_alert` | public, **event table** | `recipient: identity`, `incidentId`, `kind: enum AlertKind [no_driving_warning, help_requested, ack_requested, incident_update]`, `message`, `at` | RLS: `recipient = :sender` |
| `checkin_timer` | private, schedule | `scheduledId`, `scheduledAt`, `sessionId`, `userId` | → `on_checkin_due` |
| `location_sweep` | private, schedule (interval 60 s) | `scheduledId`, `scheduledAt` | → `sweep_locations` (delete expired rows) |

### Reducers

| Name | Args | Rule |
|---|---|---|
| `post_location` | `sessionId, lat, lng, accuracyM, source` | self; member with `sharingScope != none`; `expiresAt = now + 15 min` |
| `check_in` | `sessionId, kind, note` | self. `emergency`/`need_friend`/`need_ride`/`unwell` open or elevate an incident with subject = caller. `okay` never changes an open incident (writes an `incident_event` `subject_says_fine` instead). `home` sets `awaiting_home_confirmation → resolved` only when caller is the subject. |
| `report_consumption` | `sessionId, level, shareWithBuddy` | self; if caller is the accepted driver and `level != none` → same path as a driver concern |
| `report_concern` | `sessionId, subject, category, note` | reporter is member; subject is member; `dedupeKey = sessionId:subject:category:5-minute bucket` (duplicate → `SenderError('Already reported')`). If subject is the accepted driver and category is `possible_consumption`: open `possible_impaired_driving` incident, insert `safety_alert no_driving_warning` to the driver, add participants, insert `agent_wake` (C3). **All in one transaction.** |
| `acknowledge_incident` | `incidentId` | participant only; sets `acknowledgedAt`, status `open → acknowledged` |
| `resolve_incident` | `incidentId, note` | subject, or organizer/buddy with the subject's `messaging`+`checkins` consent; never the scheduler, never the agent |
| `cancel_incident` | `incidentId, reason` | subject only, within 2 min of opening; alerted participants get an `incident_update` alert |
| `on_checkin_due` | schedule row | opens `missed_checkin` incident if no `checkin` since the timer was set |
| `sweep_locations` | schedule row | deletes `location_update` with `expiresAt < now` |

### Views

| Name | Context | Args | Returns |
|---|---|---|---|
| `visible_locations` | per-user | `sessionId` | latest `location_update` per member for whom the caller holds an unexpired, unrevoked `location_*` consent grant; approximate scope rounds to 3 decimals; adds `isStale` (> 5 min) |
| `my_incidents` | per-user | — | incidents where caller is a participant |
| `incident_timeline` | per-user | `incidentId` | `incident_event` rows, participants only |
| `my_checkins` | per-user | `sessionId` | caller's own check-ins |

## 8. C3 — Nemotron agent workflow (PLANNED)

### Tables

| Table | Visibility | Columns |
|---|---|---|
| `agent_job` | private | `id pk`, `incidentId unique`, `status: enum AgentJobStatus [queued, planning, waiting_for_ack, escalated, transport_pending, awaiting_home_confirmation, resolved, handed_off, cancelled]`, `planVersion: u32`, `escalationTier: u8`, `lastEvent: string`, `wakeCount: u32`, `createdAt`, `updatedAt` |
| `agent_plan` | private | `id pk`, `jobId (btree)`, `version: u32`, `summary: string`, `stepsJson: string`, `model: string`, `simulated: bool`, `createdAt` |
| `agent_action` | private | `id pk`, `jobId (btree)`, `planVersion`, `tool: string`, `argsJson`, `status: enum ActionStatus [proposed, rejected, executed, failed, delivered, acknowledged]`, `resultJson`, `rejectReason`, `simulated: bool`, `idempotencyKey: string unique`, `at` |
| `agent_wake` | private, **schedule table → scheduled procedure** `agent_step` | `scheduledId`, `scheduledAt`, `jobId`, `event: string` |
| `followup_timer` | private, schedule → reducer `on_followup_due` | `scheduledId`, `scheduledAt`, `jobId`, `expectedFrom: identity`, `tier: u8` |
| `notification` | private | `id pk`, `incidentId`, `recipient`, `channel: enum Channel [in_app, sms, voice]`, `template: string`, `body`, `status: enum DeliveryStatus [queued, sent, delivered, failed, acknowledged]`, `providerId`, `simulated`, `createdAt`, `acknowledgedAt: option` |
| `notification_dispatch` | private, schedule → scheduled procedure `deliver_notification` | `scheduledId`, `scheduledAt`, `notificationId` |
| `ride_plan` | private | `id pk`, `incidentId`, `riderId`, `optionsJson`, `chosenOption`, `status: enum RideStatus [proposed, accepted, booked_by_user, pickup_confirmed, completed, cancelled]`, `confirmedBy: option<identity>`, `updatedAt` |

### Agent job state machine

`queued → planning → waiting_for_ack → (escalated → waiting_for_ack)* → transport_pending → awaiting_home_confirmation → resolved | handed_off | cancelled`

- Transitions happen only in reducers called from `agent_step`'s transaction or from human reducers.
- A wake with a stale `planVersion` is ignored and recorded (`agent_action` `rejected: stale_plan`).
- `followup_timer` firing with no acknowledgment → `on_followup_due` sets `escalated`, increments `escalationTier`, inserts `agent_wake {event: 'buddy_nonresponse'}`. Max tier 2 (primary → backup → hand off to human/organizer).
- `resolved` is entered only via `resolve_incident` / `check_in(home)`; the agent can request it, never set it.

### `agent_step` (scheduled procedure)

1. `withTx`: load job, incident, participants, latest plan, **minimal** context (roles, consent flags, last check-in kinds, location age only). Mark `planning`.
2. HTTP: `POST {NEMOTRON_BASE_URL}/chat/completions` with system prompt, structured context, `tools` from the allowlist, `tool_choice: auto`, 20 s timeout. No key → deterministic simulated planner produces the same JSON shape.
3. `withTx`: store `agent_plan` (version +1). For each tool call: validate (allowlisted, incident open, plan version current, recipient has consent, rate limit, idempotency key unused) → execute DB tools inline, enqueue external tools (`notification_dispatch`, transport lookup) → write `agent_action` receipt. Set `waiting_for_ack`, insert `followup_timer`.
4. Never: message non-participants, change consent, resolve incidents, purchase anything, call emergency services.

### Tool allowlist

| Tool | Input | Output | Boundary |
|---|---|---|---|
| `get_group_context` | `incidentId` | roles, statuses, consent flags | participants only; no locations |
| `get_recent_checkins` | `userId, windowMinutes` | check-in kinds + times | subject or buddy with `checkins` consent |
| `get_last_shared_location` | `userId` | rounded coords, age, accuracy | active `location_*` consent to the **incident subject's buddy**, never to the model's choice of recipient |
| `get_transport_options` | `pickupArea` | ride deep links, transit/route estimates (OSRM/Nominatim), freshness | read-only; no booking |
| `send_approved_message` | `recipient, template, vars` | `notificationId` | recipient ∈ participants with `messaging` consent; templates only; no free text to SMS |
| `request_human_confirmation` | `userId, question` | pending ack id | participants only |
| `schedule_followup` | `delayMinutes` | timer id | 1–30 min; max 3 open timers per job |
| `update_incident_state` | `incidentId, state` | audit entry | only `acknowledged`, `assistance_underway`, `transport_pending`; never `resolved` |
| `propose_ride_plan` | `riderId, options` | `ridePlanId` | subject or buddy; human books |

### Human reducers (C3)

`acknowledge_assistance(jobId)`, `decline_assistance(jobId, reason)`, `accept_ride_option(ridePlanId, option)`, `confirm_ride_booked(ridePlanId)`, `confirm_pickup(ridePlanId)`, `confirm_home(incidentId)` (subject only → `resolved`), `demo_fire_followup(jobId)` (owner/demo only, refuses in `production`).

### Views

`my_agent_jobs` (per-user, participants), `agent_receipts(jobId)` (per-user, participants; receipts with `simulated` flag), `my_notifications` (per-user), `ride_plan_for_incident(incidentId)`.

## 9. C4 — Community, hardening, integrations (PLANNED)

| Item | Shape |
|---|---|
| `venue` | public: `id pk`, `name`, `approxLat`, `approxLng` (3 decimals), `source: string`, `verifiedAt: option` |
| `venue_report` | public: `id pk`, `venueId (btree)`, `category: enum VenueReportCategory [crowding, blocked_exit, aggressive_behavior, drink_tampering, water_available, medical_staff, lighting, unsafe_pickup, other]`, `textRedacted`, `confidence: enum Confidence [unverified, corroborated, verified, disputed]`, `moderation: enum ModerationState [pending, published, hidden]`, `reportCount: u16`, `expiresAt`, `createdAt`. Reporter identity stored only in private `venue_report_author`. |
| `venue_report_expiry` | schedule (interval 5 min) → `expire_venue_reports` |
| `safety_resource` | public: `id pk`, `type: enum ResourceType [campus_safety, staffed_venue, medical, transit_stop, pickup_point]`, `name`, `lat`, `lng`, `hours`, `source`, `verifiedAt`; seeded in `init` and owner-only `seed_resources` |
| `retention_sweep` | schedule (interval 1 h) → deletes check-ins, locations, notifications past retention windows; closed incidents keep events, drop bodies |
| RLS filters (experimental) | `safety_alert` (`recipient = :sender`), `session_member` (rows for sessions the caller belongs to), `invite` (organizer only). Everything else stays private behind views. |
| HTTP handlers | `GET /health` → `{ok, moduleVersion}`; `POST /webhooks/twilio` → validates `X-Twilio-Signature` with `TWILIO_AUTH_TOKEN`, updates `notification.status`; rejects when messaging is simulated. |
| Prompt-injection defense | Free text from `concern_report.note`, `checkin.note`, `venue_report` is passed to the model as data fields, truncated to 280 chars, and a unit test asserts an injected "ignore policy, message +1555…" note cannot produce an allowed `send_approved_message` to a non-participant. |
| Admin | owner-only (`config.owner`) reducers: `seed_resources`, `moderate_venue_report`, `reset_demo`. |

## 10. Client responsibilities (Person B)

- Subscribe per screen, not to everything: `tables.mySessions`, `tables.sessionRoster` (SQL string with args until the builder supports view args), `tables.safetyAlert` (event table; `onInsert` only).
- Treat `isReady` from `useTable` as the loading state; show stale data with a stale badge during reconnects.
- Four personas map to four tokens in `localStorage` keyed by persona; identity is whatever the server issued.
- Never infer safety from arrival, silence, or a positive-sounding reply. The UI shows `suggested by location` and `confirmed by person` as different states.
