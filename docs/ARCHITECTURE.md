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
| reducer | `ping` | `note: string` | Writes `audit_event {action: 'ping', resource: 'system', decision: 'allow'}`. Rejects notes longer than 200 chars with `SenderError('Note too long')`; empty notes are allowed. |
| anonymous view | `online_members` | — | `client_presence` rows where `online = true` (query builder). |
| anonymous view | `runtime_status` | — | One row: `id: u8 (0)`, `appEnv`, `nemotronMode` (`live`/`simulated`), `nemotronModel`, `messagingMode`, `moduleVersion`. Never returns secrets. |

### Client bindings

`spacetime generate` writes `web/src/module_bindings/`. Import `{ DbConnection, tables, reducers }` from `web/src/module_bindings` (index). Views appear on `tables.*` for subscriptions (`tables.onlineMembers`, `tables.runtimeStatus`).

## 6. C1 — Night Out core (IMPLEMENTED)

Module version `0.2.0-c1`. Source: `spacetimedb/src/tables/nightout.ts`, `reducers/{profile,sessions,driver,consent}.ts`, `views/nightout.ts`, helpers in `lib/{auth,time,constants}.ts`. Tests: `spacetimedb/src/nightout.test.ts` (14 tests) plus the 6 C0 tests.

### Enums (module spelling → client binding spelling)

Module code uses the snake_case variant names below. **Generated client bindings convert variants to PascalCase** (`{ tag: 'LocationPrecise' }`, `{ tag: 'Active' }`), so the web client must use the PascalCase form both when reading rows and when passing reducer arguments.

| Enum | Module variants | Client tags |
|---|---|---|
| `ContactRole` | `buddy`, `backup_buddy`, `emergency` | `Buddy`, `BackupBuddy`, `Emergency` |
| `SessionStatus` | `planned`, `active`, `ended`, `expired` | `Planned`, `Active`, `Ended`, `Expired` |
| `MemberRole` | `organizer`, `participant` | `Organizer`, `Participant` |
| `SharingScope` | `none`, `approximate`, `precise` | `None`, `Approximate`, `Precise` |
| `DriverEndReason` | `none`, `cannot_drive`, `replaced`, `session_ended`, `left_session` | `None`, `CannotDrive`, `Replaced`, `SessionEnded`, `LeftSession` |
| `ConsentScope` | `location_precise`, `location_approximate`, `checkins`, `concern_reports`, `messaging` | `LocationPrecise`, `LocationApproximate`, `Checkins`, `ConcernReports`, `Messaging` |
| `DriverStatus` (view-only) | `none`, `volunteered`, `accepted` | `None`, `Volunteered`, `Accepted` |

### Tables

| Table | Visibility | Columns (binding field names) | Indexes |
|---|---|---|---|
| `user_profile` | public | `identity: Identity pk`, `displayName`, `avatarEmoji`, `phoneVerified: bool`, `createdAt` | pk |
| `trusted_contact` | private | `id pk autoInc`, `owner: Identity`, `contact: Identity`, `role: ContactRole`, `messagingConsent: bool`, `priority: u8`, `createdAt` | `owner`; `byOwnerPriority(owner, priority)` |
| `night_session` | public | `id pk autoInc`, `organizer: Identity`, `name`, `venueHint`, `startsAt`, `expiresAt`, `status: SessionStatus`, `checkinIntervalMinutes: u16`, `createdAt` | `organizer`, `status` |
| `invite` | **private** | `id pk autoInc`, `sessionId`, `code: string unique`, `createdBy: Identity`, `expiresAt`, `revokedAt?: Timestamp`, `maxUses: u8`, `uses: u8` | `sessionId`, `code` (unique) |
| `session_member` | public | `id pk autoInc`, `sessionId`, `userId: Identity`, `role: MemberRole`, `joinedAt`, `leftAt?: Timestamp`, `sharingScope: SharingScope`, `active: bool` | `sessionId`, `userId`, `bySessionUser(sessionId, userId)` |
| `driver_assignment` | public | `id pk autoInc`, `sessionId`, `driverId: Identity`, `volunteeredAt`, `acceptedAt?: Timestamp`, `endedAt?: Timestamp`, `endReason: DriverEndReason` | `sessionId`, `driverId` |
| `consent_grant` | private | `id pk autoInc`, `subject: Identity`, `recipient: Identity`, `sessionId`, `scope: ConsentScope`, `startsAt`, `expiresAt`, `revokedAt?: Timestamp` | `subject`, `recipient`, `sessionId`, `bySubjectRecipient(subject, recipient)` |
| `session_expiry` | private, **schedule table** | `scheduledId pk autoInc`, `scheduledAt: ScheduleAt`, `sessionId` | → reducer `expire_session` (scheduler-only) |

`active` always mirrors `leftAt === undefined`; filter on `active` in subscriptions. Optional timestamps are `undefined` when absent.

### Reducers

Binding name is the camelCase of the canonical name (`reducers.createSession`). All arguments are passed as one object.

| Canonical name | Args | Rule | Error strings |
|---|---|---|---|
| `set_profile` | `displayName, avatarEmoji` | upsert caller's profile; name trimmed, 1–40 chars | `Display name cannot be empty`, `Display name too long` |
| `add_trusted_contact` | `contact: Identity, role: ContactRole, messagingConsent, priority: u8` | contact must have a profile and not be the caller; one row per (owner, contact) | `Cannot add yourself as a contact`, `Contact has no SafeNight profile`, `Contact already added` |
| `remove_trusted_contact` | `id` | owner only (others get not-found) | `Contact not found` |
| `create_session` | `name, venueHint, startsAt: Timestamp, expiresAt: Timestamp, checkinIntervalMinutes: u16` | profile required; status `active` if `startsAt <= now` else `planned`; inserts organizer member (`sharingScope: none`) and a `session_expiry` row at `expiresAt` | `Set up your profile first`, `Session name cannot be empty`, `Session end must be in the future`, `Session end must be after its start` |
| `create_invite` | `sessionId, ttlMinutes: u32 (1–1440), maxUses: u8 (≥1)` | organizer only; session `planned`/`active`; 6-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | `Only the organizer can do that`, `Session is not active`, `ttlMinutes must be between 1 and 1440`, `maxUses must be at least 1` |
| `revoke_invite` | `inviteId` | organizer only; idempotent | `Invite not found`, `Only the organizer can do that` |
| `join_session` | `code` | profile required; code is case-insensitive; invite unrevoked, unexpired, `uses < maxUses`; session open; existing active member rejected; departed member re-activated (same row, role `participant`, scope `none`); `uses += 1` | `Set up your profile first`, `Invalid invite code`, `Invite was revoked`, `Invite has expired`, `Invite has no uses left`, `Session is not active`, `Already a member` |
| `leave_session` | `sessionId` | active member; the organizer of an open session cannot leave (must end it); sets `active=false, leftAt`; ends the caller's open driver assignment (`left_session`); revokes every open grant for that session where the caller is subject **or** recipient | `Session not found`, `Not a member of this session`, `Organizer must end the session instead` |
| `end_session` | `sessionId` | organizer only; status `ended`; members inactive; all session grants revoked; open driver assignment ended (`session_ended`); pending `session_expiry` rows deleted; no-op if already closed | `Only the organizer can do that` |
| `volunteer_driver` | `sessionId` | active member; session open; at most one open assignment (`endedAt` undefined) per session; `acceptedAt` stays undefined until acceptance | `Session is not active`, `Not a member of this session`, `A driver is already assigned for this session` |
| `accept_driver_role` | `assignmentId` | **the volunteer only**; idempotent once accepted | `Driver assignment not found`, `Driver assignment has ended`, `Only the volunteer can accept the driver role` |
| `end_driver_role` | `assignmentId, reason: DriverEndReason` | the driver or the organizer; `reason` must not be `none` | `Provide a reason for ending the driver role`, `Only the driver or organizer can end the driver role` |
| `grant_consent` | `recipient: Identity, sessionId, scope: ConsentScope, ttlMinutes: u32 (1–1440)` | subject is always the caller; caller and recipient must be active members; recipient ≠ caller; an open grant with the same (recipient, session, scope) is revoked first | `Session is not active`, `Not a member of this session`, `Cannot grant consent to yourself`, `Recipient is not an active member`, `ttlMinutes must be between 1 and 1440` |
| `revoke_consent` | `grantId` | subject only; idempotent | `Consent grant not found`, `Only the subject can revoke consent` |
| `set_sharing_scope` | `sessionId, scope: SharingScope` | changes only the caller's own member row; there is no reducer that changes another member's scope | `Not a member of this session` |
| `expire_session` | schedule row | scheduler-only (private); same closing logic as `end_session` with status `expired`; idempotent | — |

Denials: a throwing reducer rolls back its transaction, so denials cannot persist an `audit_event` row; `lib/auth.ts#deny` writes the actor/action/resource to the module log (not transactional) and throws the `SenderError`. Allowed sensitive actions (`create_session`, `join_session`, `leave_session`, `end_session`, `volunteer_driver`, `accept_driver_role`, `end_driver_role`, `grant_consent`, `revoke_consent`, `revoke_invite`) write `audit_event` rows with `decision: 'allow'`.

### Views (all per-user, no arguments)

| Canonical name | Binding | Row type | Returns |
|---|---|---|---|
| `my_sessions` | `tables.mySessions` | `NightSession` (pk `id`, so `onUpdate` fires) | sessions where the caller is an **active** member. Query-builder semijoin: `session_member.where(userId = caller AND active).rightSemijoin(night_session)` |
| `my_rosters` | `tables.myRosters` | `RosterRow`: `memberId: u64 (pk)`, `sessionId`, `userId: Identity`, `displayName`, `avatarEmoji`, `role: MemberRole`, `sharingScope: SharingScope`, `driverStatus: DriverStatus`, `joinedAt`, `active: bool` | one row per member (active **and departed**) of every session the caller is an active member of, including the caller's own row. `driverStatus` is `volunteered`/`accepted` for the member holding the session's open driver assignment |
| `my_invites` | `tables.myInvites` | `Invite` | invites of sessions the caller organizes (the only way a client sees codes) |
| `my_consents` | `tables.myConsents` | `ConsentGrant` | grants where the caller is subject or recipient (revoked ones included; check `revokedAt`/`expiresAt`) |
| `my_contacts` | `tables.myContacts` | `TrustedContact` | the caller's own trusted contacts |

The procedural views read only through indexes (`sessionMember.userId`, `sessionMember.sessionId`, `driverAssignment.sessionId`, `userProfile.identity`, `nightSession.organizer`, `invite.sessionId`, `consentGrant.subject`, `consentGrant.recipient`, `trustedContact.owner`).

### Client notes (Person B)

- Public tables you can subscribe to directly: `tables.userProfile`, `tables.nightSession`, `tables.sessionMember`, `tables.driverAssignment`, `tables.clientPresence`. Prefer the views for "my" data: `tables.mySessions`, `tables.myRosters`, `tables.myInvites`, `tables.myConsents`, `tables.myContacts`.
- Enum values in bindings are PascalCase tagged objects: read `row.status.tag === 'Active'`; pass `{ tag: 'LocationPrecise' }` to `reducers.grantConsent`.
- Timestamps are `Timestamp` objects (`.toDate()`, `.microsSinceUnixEpoch`); build them with `Timestamp.fromDate(new Date(...))` for `createSession`.
- `u64` ids are `bigint` in bindings; `u8`/`u16`/`u32` are `number`.
- In the generated `types.ts`, `MySessions`, `MyRosters`, `MyInvites`, `MyConsents`, `MyContacts` are empty placeholder objects; type rows with `NightSession`, `RosterRow`, `Invite`, `ConsentGrant`, `TrustedContact`.
- Reducer calls return promises that reject with `SenderError` carrying the error strings above; show them verbatim.

## 7. C2 — Location, status, deterministic safety engine (IMPLEMENTED)

Module version `0.3.0-c2`. All functions live in `spacetimedb/src/reducers/safety.ts`, `views/safety.ts`, `lib/safety.ts`, `tables/safety.ts`, `rls.ts`.

### Tables

| Table | Visibility | Columns | Indexes |
|---|---|---|---|
| `location_update` | private | `id pk autoInc`, `sessionId`, `userId`, `lat: f64`, `lng: f64`, `accuracyM: f32`, `recordedAt`, `expiresAt` (= recordedAt + 15 min), `source: LocationSource [device, simulated]` | `sessionId`, `userId`, (`sessionId`,`userId`) |
| `latest_location` | private | same columns plus `locationId` (the `location_update` id); exactly one row per (session, member), upserted by `post_location` | `sessionId`, `userId`, (`sessionId`,`userId`) |
| `checkin` | private | `id pk`, `sessionId`, `userId`, `kind: CheckinKind [okay, need_friend, need_ride, unwell, emergency, home]`, `note` (≤ 280), `createdAt` | `sessionId`, `userId`, (`sessionId`,`userId`) |
| `consumption_self_report` | private | `id pk`, `userId`, `sessionId`, `level: ConsumptionLevel [none, some, impaired_feeling]`, `shareWithBuddy: bool`, `createdAt` | `userId`, `sessionId` |
| `concern_report` | private | `id pk`, `sessionId`, `reporter`, `subject`, `category: ConcernCategory [possible_consumption, separated, unwell, unsafe]`, `note`, `createdAt`, `dedupeKey: string unique` (`sessionId:subjectHex:category:5-min bucket`) | `sessionId`, `subject` |
| `incident` | private | `id pk`, `sessionId`, `subject`, `kind: IncidentKind [possible_impaired_driving, help_requested, missed_checkin, feeling_unsafe]`, `severity: Severity [info, elevated, urgent]`, `status: IncidentStatus [open, acknowledged, assistance_underway, transport_arranged, awaiting_home_confirmation, resolved, cancelled, handed_off]`, `openedBy`, `openedAt`, `resolvedAt?`, `resolvedBy?` | `sessionId`, `subject`, `status` |
| `incident_event` | private | `id pk`, `incidentId`, `at`, `actor`, `kind: string`, `detail: string`, `simulated: bool` | `incidentId` |
| `incident_participant` | private | `id pk`, `incidentId`, `userId`, `role: ParticipantRole [subject, reporter, buddy, backup, organizer]`, `acknowledgedAt?` | `incidentId`, `userId`, (`incidentId`,`userId`) |
| `safety_alert` | **public event table** | `recipient`, `incidentId` (0 for the private driver self-warning), `kind: AlertKind [no_driving_warning, help_requested, ack_requested, incident_update]`, `message`, `at` | `recipient`; **RLS** `recipient = :sender` (verified live: only the recipient's `onInsert` fires) |
| `checkin_timer` | private, schedule → `on_checkin_due` | `scheduledId`, `scheduledAt`, `sessionId`, `userId`, `armedAt` | `userId` |
| `location_sweep` | private, schedule (interval 60 s) → `sweep_locations` | `scheduledId`, `scheduledAt` | — |

Incident event kinds written so far: `opened`, `agent_requested`, `warning_shown`, `concern_added`, `concern_repeated`, `elevated`, `emergency_guidance`, `subject_says_fine`, `home_reported`, `missed_checkin`, `acknowledged`, `resolved`, `cancelled`.

### Reducers

| Name | Args | Rule | Error strings |
|---|---|---|---|
| `post_location` | `sessionId, lat, lng, accuracyM, source` | caller is an active member of an open session with `sharingScope != none`; inserts history and upserts `latest_location`; `expiresAt = now + 15 min` | `Session is not active`, `Not a member of this session`, `Turn on location sharing first`, `Invalid coordinates` |
| `check_in` | `sessionId, kind, note` | records the check-in and re-arms the caller's `checkin_timer`. `okay`: adds `subject_says_fine` to the caller's open incident, **never changes its status**. `need_friend`/`need_ride`/`unwell`/`emergency`: opens a `help_requested` incident (elevated; urgent for unwell/emergency) or escalates the caller's open one, then alerts every other participant with `help_requested`; `emergency` also records that emergency services remain the person's call. `home`: resolves the caller's open incident **only** from `awaiting_home_confirmation` or `transport_arranged` (resolvedBy = caller, `incident_update` to participants); otherwise records `home_reported`. | `Note must be 280 characters or fewer` |
| `report_consumption` | `sessionId, level, shareWithBuddy` | stores the private row. If the caller is the **accepted driver** and `level != none`: without `shareWithBuddy` only a private `no_driving_warning` alert (incidentId 0, no incident, audit row); with it the full driver path below. Non-drivers never trigger anything. | as above |
| `report_concern` | `sessionId, subject, category, note` | reporter and subject active members, subject ≠ reporter; `dedupeKey` unique per 5-minute bucket. Driver + `possible_consumption` → **driver path**: `possible_impaired_driving` (urgent) incident, participants for all active members, `no_driving_warning` to the driver, `incident_update` to the organizer, `ack_requested` to everyone else except the reporter, events `opened`/`agent_requested`/`warning_shown`, all in one transaction. A repeat within an open driver incident adds `concern_repeated`. Other categories → `feeling_unsafe` (elevated) incident (or `concern_added` on the subject's open incident) with `ack_requested` to all participants but the subject. | `Use a check-in to report about yourself`, `Subject is not in this session`, `Already reported` |
| `acknowledge_incident` | `incidentId` | participant, not the subject, incident open; sets `acknowledgedAt`; `open → acknowledged`; `incident_update` to the subject | `Only participants can acknowledge`, `You can't acknowledge your own alert`, `This incident is closed` |
| `resolve_incident` | `incidentId, note` | never the scheduler (`senderAuth.isInternal`); the subject, or an `organizer`/`buddy` participant holding the subject's unexpired `messaging` **and** `checkins` grants for that session; `incident_update` to the others | `Only a person can resolve an incident`, `You are not allowed to resolve this incident`, `This incident is closed` |
| `cancel_incident` | `incidentId, reason` | subject only, within 2 minutes of `openedAt`; `incident_update` to the others | `Only the person the incident is about can cancel it`, `Too late to cancel; resolve it instead`, `This incident is closed` |
| `on_checkin_due` | schedule row | scheduler only. If the member is still active in an open session and has no check-in since `armedAt`: `missed_checkin` event on their open incident, or a new `missed_checkin` (elevated) incident with `ack_requested` to the others and an `incident_update` nudge to the member. Always re-arms. | — |
| `sweep_locations` | schedule row | scheduler only, every 60 s: deletes expired `location_update`/`latest_location` rows and sets `revokedAt = expiresAt` on expired consent grants (views have no clock, so they rely on `revokedAt`). | — |
| `ensure_schedules` | — | owner only (`config.owner`); re-creates the `location_sweep` interval row after a republish (`init` does not re-run). Call once: `spacetime call safenight ensure_schedules`. | `Only the database owner can do that` |

C1 reducers changed: `create_session` and `join_session` arm the member's `checkin_timer` (`now + checkinIntervalMinutes`); `leave_session`, `end_session` and `expire_session` clear timers.

### Views (all per-user, argument-free)

| Name | Row | Returns |
|---|---|---|
| `visible_locations` | `VisibleLocationRow { id (location_update id, pk), sessionId, userId, displayName, lat, lng, accuracyM, recordedAt, source, approximate }` | the latest location of every active member of every session the caller is active in, when: it is the caller's own row (exact), or the member's `sharingScope != none` **and** the caller holds an unrevoked `location_precise` (exact) or `location_approximate` (rounded to 3 decimals, `approximate = true`) grant from that member for that session. A member's `approximate` scope forces rounding even over a precise grant. Staleness (`recordedAt` older than 5 min) is computed by the client. |
| `my_checkins` | `checkin` row | the caller's check-ins across sessions |
| `my_incidents` | `IncidentRow { id pk, sessionId, subject, subjectName, kind, severity, status, openedBy, openedAt, resolvedAt?, resolvedBy? }` | incidents where the caller is a participant |
| `my_incident_participants` | `IncidentParticipantRow { id pk, incidentId, userId, displayName, role, acknowledgedAt? }` | participants of those incidents |
| `my_incident_events` | `IncidentEventRow { id pk, incidentId, at, actor, actorName, kind, detail, simulated }` | timeline events of those incidents (`actorName` is `SafeNight` for the scheduler) |

### Client notes for the `SafetyApi` adapter (Person B)

Generated bindings (`web/src/module_bindings`): `tables.visibleLocations`, `tables.myCheckins`, `tables.myIncidents`, `tables.myIncidentParticipants`, `tables.myIncidentEvents`, `tables.safetyAlert`; `reducers.postLocation`, `reducers.checkIn`, `reducers.reportConsumption`, `reducers.reportConcern`, `reducers.acknowledgeIncident`, `reducers.resolveIncident`, `reducers.cancelIncident`. Row types in `types.ts`: `VisibleLocationRow`, `IncidentRow`, `IncidentParticipantRow`, `IncidentEventRow`, `SafetyAlert`, `Checkin`.

- Enum tags are **PascalCase** in bindings: `CheckinKind {Okay, NeedFriend, NeedRide, Unwell, Emergency, Home}`, `ConsumptionLevel {None, Some, ImpairedFeeling}`, `ConcernCategory {PossibleConsumption, Separated, Unwell, Unsafe}`, `IncidentKind {PossibleImpairedDriving, HelpRequested, MissedCheckin, FeelingUnsafe}`, `Severity {Info, Elevated, Urgent}`, `IncidentStatus {Open, Acknowledged, AssistanceUnderway, TransportArranged, AwaitingHomeConfirmation, Resolved, Cancelled, HandedOff}`, `ParticipantRole {Subject, Reporter, Buddy, Backup, Organizer}`, `AlertKind {NoDrivingWarning, HelpRequested, AckRequested, IncidentUpdate}`, `LocationSource {Device, Simulated}`. Pass `{ tag: 'NeedRide' }`, read `row.status.tag === 'Open'`.
- `locations` ← `useTable(tables.visibleLocations)` filtered to the current `sessionId`; `isStale = Date.now() - recordedAt.toDate().getTime() > 5 min`; `myLocation` is the row whose `userId` equals my identity.
- `incidents` ← `tables.myIncidents` joined client-side with `tables.myIncidentParticipants` on `incidentId` (gives `participants` with `displayName`, `role`, `acknowledgedAt`).
- `timeline(id)` ← `tables.myIncidentEvents` filtered by `incidentId`, sorted by `at`.
- `alerts` ← `tables.safetyAlert` is an event table: subscribe and use `onInsert` only (rows never stay in the cache; `count()` is always 0). RLS already limits delivery to `recipient = me`; keep dismissals client-side. `incidentId === 0n` is the private driver self-warning with no incident.
- `myCheckins` ← `tables.myCheckins` filtered by `sessionId`, newest first.
- Actions ← `reducers.*` with `bigint` ids; `postLocation.source` is `{ tag: 'Simulated' }` for demo personas; reducer promises reject with `SenderError` carrying the strings above.
- Deterministic path to demo: Alex `reportConcern(sessionId, samIdentity, { tag: 'PossibleConsumption' }, note)` → Sam's tab gets a `NoDrivingWarning` alert in the same transaction and `myIncidents` shows the `PossibleImpairedDriving` incident to all four personas.

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
| RLS filters (experimental) | `safety_alert` (`recipient = :sender`) is **done in C2** and verified live. Still planned: `session_member` (rows for sessions the caller belongs to). `invite` is already private (C1) and read through `my_invites`. Everything else stays private behind views. |
| HTTP handlers | `GET /health` → `{ok, moduleVersion}`; `POST /webhooks/twilio` → validates `X-Twilio-Signature` with `TWILIO_AUTH_TOKEN`, updates `notification.status`; rejects when messaging is simulated. |
| Prompt-injection defense | Free text from `concern_report.note`, `checkin.note`, `venue_report` is passed to the model as data fields, truncated to 280 chars, and a unit test asserts an injected "ignore policy, message +1555…" note cannot produce an allowed `send_approved_message` to a non-participant. |
| Admin | owner-only (`config.owner`) reducers: `seed_resources`, `moderate_venue_report`, `reset_demo`. |

## 10. Client responsibilities (Person B)

- Subscribe per screen, not to everything: `tables.mySessions`, `tables.myRosters` (argument-free; filter by `sessionId` client-side), `tables.safetyAlert` (event table; `onInsert` only).
- Treat `isReady` from `useTable` as the loading state; show stale data with a stale badge during reconnects.
- Four personas map to four tokens in `localStorage` keyed by persona; identity is whatever the server issued.
- Never infer safety from arrival, silence, or a positive-sounding reply. The UI shows `suggested by location` and `confirmed by person` as different states.
