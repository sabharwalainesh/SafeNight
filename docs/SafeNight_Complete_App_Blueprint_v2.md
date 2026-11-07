# SafeNight: Complete Product Specification

**Tagline:** Go out together. Get home together.  
**Document version:** 1.1  
**Date:** November 7, 2026  
**Status:** Product vision, functional requirements, technical architecture, and hackathon implementation plan

> SafeNight is a consent-based nightlife safety platform combining temporary friend groups, live location sharing, community hazard reports, wellness check-ins, designated driver coordination, safer-place discovery, Apple Watch support, and an NVIDIA Nemotron-powered agent that orchestrates approved safety workflows.

## 1. Product vision

SafeNight helps people coordinate safety before, during, and after parties, bars, concerts, festivals, and other nights out. Its core loop is **plan → stay connected → identify concerns → coordinate help → confirm everyone is accounted for**.

SafeNight is **not** an intoxication detector, emergency dispatch service, medical diagnostic device, sobriety certification service, or guarantee of safety. It must never infer that a person is safe merely because they arrived at a location or that an area is safe merely because it is crowded.

### 1.1 Primary users

- College students and young adults going out in groups.
- Designated drivers and safety buddies.
- Event attendees and organizers.
- Campus safety teams and vetted venue partners in future versions.

### 1.2 Core differentiation

- Temporary, event-specific groups rather than indefinite tracking.
- Proactive, permissioned intervention workflows rather than passive location pins.
- Venue-level, time-sensitive community observations with moderation.
- An agent that uses tools to coordinate real-world assistance and adapt to replies.

### 1.3 Product principles

1. **Consent first:** Sharing is opt-in, revocable, time-bounded, and visible.
2. **Minimize sensitive data:** Substance-use details are private by default; never publish them to nearby users.
3. **Do not overclaim:** Sensor anomalies do not prove impairment; crowds do not prove safety.
4. **Act quickly on explicit danger:** Deterministic rules trigger urgent warnings without waiting for an LLM.
5. **Human control:** People choose contacts, permissions, transportation, and escalation settings.
6. **No silent surveillance:** Clear indicators for location, health, and contact access.
7. **Degrade gracefully:** Missing location, network, watch, or API access never becomes false reassurance.

## 2. Full user journey

### 2.1 Onboarding

- Sign up with Apple or phone/email authentication.
- Verify phone number for messaging features.
- Create profile: display name, avatar, preferred language, optional campus.
- Explain the difference between approximate and precise location sharing.
- Configure trusted contacts, emergency contacts, and backup safety buddy.
- Set privacy defaults and optional retention settings.
- Separately request location, notifications, contacts, and HealthKit permissions when needed.
- Show explicit limitations and emergency-service instructions.
- Offer a demo mode with synthetic users and events.

### 2.2 Before going out

1. Create a **Night Out** session with name, date, optional venue, and estimated end time.
2. Invite friends using a short-lived link, QR code, or contact invite.
3. Each friend individually opts into session-specific location sharing.
4. Each member can enter an intended destination or choose to keep it private.
5. Members select trusted safety buddies and check-in preferences.
6. A designated driver can volunteer and explicitly accept the role.
7. Group sets optional meetup point, transportation plan, and check-in cadence.
8. Everyone sees the session privacy and escalation rules before starting.

### 2.3 During the night

- Show the group map and each person's last consented location with timestamp and accuracy.
- Provide one-tap status: **I'm okay**, **Need a friend**, **Need a ride**, **Feeling unwell**, **Emergency help**.
- Allow optional private alcohol/substance self-reports; allow trusted members to submit a *concern report* without making a definitive claim.
- Display venue-level reports and nearby verified resources.
- Prompt agreed check-ins, not incessant reminders.
- Start safety workflows when an explicit report, assistance request, missed check-in, or opted-in trigger warrants it.

### 2.4 Returning home

- Offer ride coordination, meeting points, and ETA sharing.
- Detect possible arrival at a chosen destination where permission allows.
- Ask the user to explicitly confirm **I'm home / I'm safe**.
- If confirmation is missed, follow the user's configured contact ladder.
- End the session when participants confirm or individually opt out; clearly distinguish **confirmed**, **awaiting response**, **location unavailable**, and **left session**.
- Expire location-sharing tokens and purge ephemeral data according to retention settings.

### 2.5 Leaving home again after returning

- A Night Out can remain **paused at home** within a user-selected active outing window instead of being permanently closed on the first return home.
- If the user leaves their configured home region again during that window, the app may automatically **resume the user's personal outing mode** after prior explicit opt-in, subject to OS location delivery and authorization.
- Rejoining or resuming a **group's** live location sharing requires a still-valid, scoped consent grant. Never silently revive an expired session or reinstate sharing after revocation.
- Prompt the user to confirm whether this is the same hangout, a new outing, or an unrelated trip. If unavailable, default to a private personal safety state, not public/group sharing.

## 3. Feature requirements

### 3.1 Night Out group management

**Must have**
- Create, join, leave, and end a session.
- Invite link with expiration and revocation.
- Group roles: organizer, participant, designated driver, safety buddy.
- Member-specific permissions and sharing status.
- Session time limit and auto-expiration.
- Prevent organizers from forcing another member to share location or health data.

**Later**
- Recurring friend circles, multiple simultaneous events, organizer templates.

### 3.2 Live location and reunion

**Must have**
- Opt-in foreground location; background updates only with explicit platform permission.
- Map pins with **last updated**, **accuracy**, and **sharing state**.
- Geofence-style arrival suggestions and destination check-ins.
- Manual **Find my group** and **Share meetup point** actions.
- Detect possible separation only when the user opts in and thresholds are configurable.
- Handle stale locations and offline states transparently.

**Later**
- Battery-aware update cadence, safe meetup suggestions, limited-time location links for trusted contacts.

**Rules**
- Never expose exact member locations to public venue participants.
- No covert tracking, stalking features, or permanent movement histories.
- Do not automatically infer driving from GPS movement alone.

### 3.3 Wellness and substance-use check-ins

**Must have**
- One-tap wellness states and optional free-text note.
- Optional private self-report of alcohol or substance consumption; avoid requiring detailed quantities.
- Trusted friend concern reports with reporter identity restricted to authorized responders and audit records.
- Clearly label reports as **reported concern**, not verified impairment.
- Let the user ask for water, a buddy, a ride, or emergency help.
- Separate permissions for self-report storage and any disclosure to a safety buddy.

**Later**
- Personalized, user-controlled check-in schedules and accessible watch prompts.

**Rules**
- Do not produce a BAC estimate from phone/watch signals.
- Do not declare anyone sober or safe to drive.
- Do not show consumption data in a public heatmap or public profile.
- Do not make third-party reports into public accusations.

### 3.4 Designated driver system

**Must have**
- Driver volunteer/acceptance flow and group-visible role badge.
- Pre-night reminders about staying alcohol- and drug-free.
- Explicit **I can no longer drive** button and replacement-driver flow.
- Trigger intervention if driver self-reports consumption or a trusted member reports concern.
- Warn the driver not to drive, offer ride alternatives, and notify designated safety buddies according to consent.
- Track whether a transport plan was **proposed**, **accepted**, **booked by user**, or **confirmed completed**.

**Critical escalation behavior**
1. Deterministic event engine immediately shows a warning and offers a no-driving action.
2. If appropriate and not likely to distract someone already driving, send a push or automated voice/SMS check-in.
3. Notify preapproved safety buddies with minimal necessary details.
4. Nemotron coordinates alternatives and follow-ups using authorized tools.
5. If imminent danger is reported, show instructions for contacting local emergency services; do not assume the app can dispatch responders.
6. Never send repeated distracting calls or notifications to a person believed to be actively driving.

**Later**
- Integrations with ride providers, verified event shuttles, and external breathalyzers, without treating any result as driving clearance.

### 3.5 Community party and venue intelligence

**Must have**
- Nearby venue or event discovery using approximate location.
- Opt-in **I'm at this event** participation; anonymous to other attendees.
- Report categories: crowding, blocked exit, aggressive behavior, suspected drink tampering, water availability, medical staff, lighting, unsafe transport pickup, other hazards.
- Optional high-level report of alcohol-related or substance-related safety concerns, never a marketplace or precise inventory of drugs.
- Report timestamp, expiration, moderation state, and confidence/verification label.
- Merge likely duplicate reports; allow contradictory reports to coexist with uncertainty.
- Report abuse, false reports, harassment, and doxxing.

**Later**
- Event organizer dashboards, verified venue staff updates, crowd-level estimates only from privacy-preserving aggregates with minimum cohort thresholds.

**Rules**
- Never publish the identity or precise location of a reporter or alleged affected individual.
- No exact maps of where drugs are obtainable.
- Do not describe a venue as definitively dangerous based on unverified submissions.
- Provide clear freshness indicators and dispute/appeal paths for venue reports.

### 3.6 Safer-place discovery and navigation

**Must have**
- Map verified, publicly accessible resources: campus safety offices, staffed venues, medical stations, public transport stops, and official pickup points.
- Show operating hours where known, last verification time, and source.
- Let users request directions and share a meetup point with trusted friends.
- Prioritize staffed, accessible, open resources rather than simple user density.

**Later**
- Verified event safe zones, official campus escorts, event shuttle tracking, accessibility filters.

**Rules**
- Clearly distinguish **verified resource** from **community suggestion**.
- Never promise a route or destination is safe.
- Do not route people into a reported active hazard without a clear warning and alternatives.

### 3.7 SOS and assistance

**Must have**
- Prominent **Need help now** button with confirmation or hold gesture to reduce accidental sends.
- Options: notify buddy, share location temporarily, call emergency services, find nearby staffed help.
- User-controlled escalation ladder and backup contacts.
- Incident status timeline and acknowledgments.
- Accessible, high-contrast emergency interface and offline fallback guidance.

**Later**
- Campus escort partnerships and event medical team integrations where officially authorized.

**Rules**
- Do not claim to contact emergency dispatch unless a supported, explicitly authorized integration exists.
- Acknowledge that an alert sent does not mean it was read or that help is coming.

### 3.8 Apple Watch companion

**Must have for initial watch prototype**
- Join/identify active Night Out.
- One-tap check-in, help request, ride request, and haptic reminders.
- Display designated driver role and check-in status.
- Sync approved events to the phone/backend.

**Experimental**
- Permissioned HealthKit heart rate, HRV, and activity context.
- Private wellness prompt on unusual signals, without asserting intoxication.
- Explore available fall-detection-related pathways only within documented watchOS APIs; do not promise access to Apple's system fall detection events.

**Rules**
- HealthKit access and background delivery depend on permissions and OS behavior.
- Physiological changes can reflect exercise, stress, dehydration, illness, medication, or other factors.
- Never notify others that a user is drunk based solely on watch readings.

### 3.9 Notifications and communication

- Push notifications via APNs.
- Optional SMS/voice via Twilio for preapproved contacts and scenarios.
- Rate limits, quiet modes, retry policies, and acknowledgment tracking.
- Context-specific messages that do not reveal unnecessary sensitive information.
- Fallback from push to SMS/voice only when consent and rules allow.
- Store delivery state separately from read/acknowledged state.

### 3.10 Accessibility and localization

- VoiceOver, Dynamic Type, high contrast, large touch targets, reduced motion.
- Distinguishable alerts without relying only on color.
- Multilingual notifications and emergency instructions.
- Low-connectivity modes and battery-conscious location updates.


### 3.11 iPhone Live Activity, Lock Screen and widget safety controls

**Goal:** Make **Feeling unsafe** and **I'm fine** available without navigating through the app. Keep the active outing visible on the Lock Screen and, on supported iPhones, the Dynamic Island.

**Surface distinctions**
- **Live Activity (ActivityKit + WidgetKit + SwiftUI):** Lock Screen and Dynamic Island outing status, group name (optional), elapsed time, next check-in, and help state. Tap a control to open the relevant app flow. Where supported by the deployment target, use interactive Live Activity controls via App Intents, with a fallback to deep links; test on actual devices and OS versions.
- **Home Screen widget (WidgetKit):** A persistent shortcut for starting/resuming an outing, checking status, and opening **Feeling unsafe** or **I'm fine**. Widgets and Live Activities have different update and interaction limits.
- **Apple Watch complication/widget:** Fast check-in and help request; avoid claiming continuous medical monitoring.

**User-visible states**
`Not out` → `Outing active` → `Feeling unsafe / help requested` → `Help acknowledged` → `Paused at home` → `Resumed outing` → `Ended / expired`.

**Live Activity behavior**
- On user-confirmed outing start, request a Live Activity with privacy-conscious content; use a neutral title when Lock Screen privacy is enabled.
- Show two prominent actions: **Feeling unsafe** (urgent assistance workflow) and **I'm fine** (timestamped reassurance/check-in). Also provide **Need a ride**, **Call emergency services**, and **Open group** in the expanded app screen.
- A tap must generate an authenticated, idempotent event, update the server, and provide visible feedback. Do not assume a button tap succeeded while offline.
- Keep the activity refreshed during the outing through allowed app updates and ActivityKit push updates. **iOS does not permit a single Live Activity to run indefinitely:** plan for its finite active duration (typically up to eight hours, with limited additional Lock Screen display), dismissal, OS throttling, and user removal. When it expires, use a normal notification, widget, or a new user-authorized activity if supported; do not promise an always-present Dynamic Island.
- When the user arrives home, show `Paused at home` briefly, then end the current Live Activity if appropriate. A subsequent outing creates a **new** activity, not a permanent one.
- Do not show exact coordinates, substance use, alleged impairment, or sensitive reports on a visible Lock Screen by default.

**Feeling unsafe action**
1. Immediately show a prominent **Help requested** confirmation and offer an emergency call button; urgent local emergency services must remain directly accessible.
2. Send a high-priority alert to the user's opted-in Night Out members and trusted safety buddies, including only the user's consented current/last-known location and timestamp.
3. Ask recipients to **Acknowledge**, **Call**, **Come help**, or **Arrange a ride**. Show the requesting user who has acknowledged, without promising arrival.
4. If no one acknowledges within a configurable short interval, follow the user's preapproved backup-contact ladder and offer local verified assistance resources.
5. Keep the incident open until the user or an authorized human confirms resolution. **I'm fine** can mark the user's own status but must not silently erase a pending emergency or cancel a response already underway.
6. Support accidental-tap correction with a short, explicit cancel flow; preserve a minimal audit trail and notify already-alerted contacts that the request was canceled.

**Mutual-friend safety network (optional, later phase)**
- **No random nearby helpers.** Assistance matching is restricted to the user's current Night Out group, directly designated trusted contacts, and eligible **friends of friends (mutual connections)** who explicitly opt into the network. Official campus/venue safety staff and emergency services are shown separately as institutional resources, not social matches.
- **Trusted Circles controls:** Each user chooses whether to permit (a) Night Out group alerts, (b) named safety buddies, and (c) mutual-friend assistance offers. Mutual matching is off by default. Users can restrict eligible mutuals to connections through specific trusted friends, block individuals, and revoke access at any time.
- **Relationship verification:** A mutual is eligible only when the app has a confirmed, bidirectional friendship edge between the candidate and at least one user-approved intermediary friend. Phone contacts alone or shared group membership do not prove trust. Do not expose a user's full social graph.
- **Discovery:** When a user presses **Feeling unsafe**, notify authorized group members and buddies immediately. If further help is requested or the backup ladder is triggered, search only opted-in, available mutuals in a coarse radius. Do not expose the requester's exact position or identity to candidates during discovery.
- **Matching:** Prioritize approved mutual relationship strength (for example, two distinct confirmed mutual friends), availability, estimated travel time, accessibility needs, and user blocks. A candidate may self-report **I have not consumed alcohol or drugs tonight**, but this is **not verified sobriety** and must never be used to certify safe driving.
- **Two-sided consent:** Show the requester a candidate's limited profile, mutual-connection count, and approximate ETA. The requester chooses **Request help**; the candidate can **Accept** or **Decline**. Only after both consent may the app reveal a limited meeting location or temporary precise location if separately authorized. Prefer a staffed public meeting point and allow either side to terminate sharing instantly.
- **Example:** A student presses **Feeling unsafe** while separated from their group. Two group members acknowledge but are 15 minutes away. The app offers an opted-in mutual connected through two approved friends who is three minutes away. The requester selects **Request help**; the mutual accepts; Nemotron coordinates a public meeting point and checks on both parties. No nearby stranger is contacted.
- **Nemotron tools:** `get_trusted_circle`, `find_eligible_mutuals`, `request_mutual_assistance`, `accept_or_decline_offer`, `share_temporary_meeting_point`, `notify_group`, `check_assistance_status`, `close_incident`. The server enforces graph eligibility, consent, proximity limits, and rate limits independently of the model.
- **Abuse prevention:** No public helper directory, no browsing vulnerable users, no bulk SOS broadcasts, no unsolicited direct messages, no home-address disclosure, no automatic matching to strangers. Add blocking, reporting, identity/age safeguards, suspicious-pattern detection, request caps, minimal audit logs, and opt-out. Mutual connections are not guaranteed safe; provide an emergency-services path at all times.
- **Data model additions:** `friendships(user_a_id, user_b_id, confirmed_at)`, `trusted_circle_settings(user_id, allow_mutuals, approved_intermediary_ids, sharing_policy)`, `helper_availability(user_id, available_until, coarse_area, self_attested_no_consumption)`, `mutual_help_offers(incident_id, candidate_id, state, expires_at, consented_location_scope)`, `assistance_receipts(offer_id, action, actor_id, timestamp)`. Apply row-level security and short retention.
- **API additions:** `POST /friendships/confirm`, `PUT /trusted-circle`, `PUT /helpers/availability`, `POST /incidents/{id}/mutual-options`, `POST /incidents/{id}/mutual-offers`, `POST /mutual-offers/{id}/respond`, `POST /mutual-offers/{id}/revoke`. Server-side authorization is mandatory on every endpoint.
- **Demo acceptance test:** A non-mutual user near the requester is excluded; a mutual without opt-in is excluded; an eligible opted-in mutual receives only a coarse request; location sharing begins only after both accept; a block or revoke immediately terminates access.

**Auto-resume when leaving home**
- During onboarding, the user may save an approximate home geofence locally, grant **Always** location access where appropriate, and opt into **Automatically resume personal outing mode after I leave home** for a defined time window (e.g., that evening). All are optional and can be disabled.
- Core Location region monitoring can wake the app for an exit event in some circumstances, but delivery can be delayed or unavailable due to permissions, system conditions, disabled location, or device state. This is **best effort, not guaranteed instant detection**.
- Use a geofence with a buffer/dwell time to avoid repeated start/stop from GPS drift. Avoid storing the exact home address server-side unless necessary and explicitly permitted.
- When a departure event arrives: check the user's opt-in, time window, session status, revoked consents, and whether the outing is likely intentional. Resume **personal safety mode** automatically and notify the user. Re-enable group sharing only if the user explicitly preauthorized this specific still-active group and time window; otherwise ask them to confirm.
- If the user left home for a routine errand or no valid group exists, keep sharing private and allow a one-tap dismissal. Provide manual **Start outing** and **Resume outing** fallbacks.
- At the end of the authorized time window, end monitoring and group sharing; don't treat the user's home boundary as a permanent surveillance trigger.

**State and backend events**
- `outing.started`, `outing.paused_at_home`, `outing.home_exit_detected`, `outing.resume_requested`, `outing.resumed`, `outing.expired`.
- `checkin.fine`, `help.unsafe_pressed`, `help.alert_dispatched`, `help.acknowledged`, `help.backup_escalated`, `help.canceled`, `help.resolved`.
- `helper.available`, `helper.offer_sent`, `helper.offer_accepted`, `helper.location_consent_granted`, `helper.blocked`.
- Persist a state machine per user/outing with event deduplication, server timestamps, consent checks, and retry-safe push delivery. Treat missed geofence events and offline taps as explicit failure cases.

**New API routes (suggested)**
```http
POST /outings/start
POST /outings/{id}/pause-home
POST /outings/{id}/resume
POST /outings/{id}/end
POST /outings/{id}/checkins/fine
POST /outings/{id}/help/unsafe
POST /outings/{id}/help/cancel
POST /outings/{id}/home-exit-events
POST /live-activities/register-token
POST /live-activities/{id}/end
POST /helpers/availability
POST /help-requests/{id}/offers
POST /help-requests/{id}/acknowledge
```

**Acceptance criteria**
- A user can tap **Feeling unsafe** from an eligible Lock Screen or widget surface and see an acknowledged event; trusted recipients receive a real test alert with correct permission scoping.
- **I'm fine** records a check-in without broadcasting sensitive information or overwriting an unresolved assistance incident.
- A return home pauses the outing. A second departure within the opt-in window resumes personal outing mode when iOS delivers the event; outside that window it does not restart.
- Revoking group sharing prevents any subsequent auto-resume from re-enabling that sharing.
- If Live Activity is expired/removed, the user still has an accessible widget/app shortcut and the backend incident workflow continues.
- No stranger can discover a user's precise location from a nearby-help request without requester consent.

**Implementation priority:** Hackathon: basic Live Activity + two actions + trusted-group alerts + simulated home re-exit; beta: real geofencing and resumable outings; later: opt-in mutual-friend assistance network. Test iOS entitlements, OS-version support, APNs behavior, and background execution on physical devices.

## 4. NVIDIA Nemotron agent system

### 4.1 Agent mission

The **SafeNight Safety Coordination Agent** receives structured safety events, evaluates context within explicit permissions, chooses approved tools, tracks outcomes, and adapts until a person confirms resolution or the workflow times out/hands off.

It must not independently diagnose intoxication, determine someone is safe to drive, infer criminal behavior, or bypass permissions.

### 4.2 Architecture

```text
SwiftUI iPhone app + watchOS app
        |
        v
FastAPI backend + auth + consent service
        |
        +--> PostgreSQL / Supabase Realtime
        +--> Location + check-in event stream
        +--> Venue reports + moderation queue
        |
        v
Deterministic Safety Trigger Engine
        |  (immediate alerts and policy checks)
        v
LangGraph Incident Workflow
        |
        v
NVIDIA Nemotron reasoning / structured tool selection
        |
        +--> get_group_context
        +--> get_consent_and_contact_policy
        +--> get_recent_checkins
        +--> get_last_shared_location
        +--> get_verified_nearby_resources
        +--> get_transport_options
        +--> send_push_notification
        +--> send_approved_sms
        +--> initiate_approved_call
        +--> request_human_confirmation
        +--> schedule_followup
        +--> update_incident_state
        |
        v
Policy enforcement + human approval gates + audit log
```

### 4.3 Agent tool contracts

Every tool requires an authenticated session, a specific incident ID, authorization, validated arguments, and an idempotency key for side effects.

| Tool | Inputs | Output | Permission boundary |
|---|---|---|---|
| `get_group_context` | session ID | roles, statuses | session membership |
| `get_recent_checkins` | member ID, window | allowed check-ins | self or approved responder |
| `get_last_shared_location` | member ID | coordinates, age, accuracy | active opt-in sharing |
| `get_verified_nearby_resources` | area, type | sourced places, hours | location authorization |
| `get_transport_options` | pickup area | ride links, transit options | no autonomous purchase |
| `send_push_notification` | target, template | delivery ID | policy-approved target |
| `send_approved_sms` | target, template | delivery ID | explicit messaging consent |
| `initiate_approved_call` | target, script | call ID | no distracted-driving calls |
| `request_human_confirmation` | person, question | pending acknowledgment | approved contact |
| `schedule_followup` | incident, delay | job ID | bounded frequency |
| `update_incident_state` | incident, state | audit entry | validated transition |

### 4.4 Workflow A: possible impaired driving

**Trigger:** designated driver self-reports consuming alcohol/substances, or a trusted group member reports concern.

1. Save report and provenance; immediately show no-driving warning.
2. Validate group membership, contact permissions, and driver role.
3. Create incident `POSSIBLE_IMPAIRED_DRIVING`.
4. Nemotron reviews sanitized structured context and selects approved next actions.
5. Notify the driver's designated safety buddy with a minimally revealing message.
6. Offer taxi/rideshare/transit and replacement-driver coordination.
7. Wait for acknowledgment; if unavailable, contact preapproved backup buddy.
8. Reevaluate based on responses, avoiding repeated driver distraction.
9. Mark **transport arranged** only after human confirmation; **home confirmed** only after explicit check-in.
10. Close incident or hand off to human contacts with an audit trail.

### 4.5 Workflow B: missed check-in / missing friend

1. Timer fires for an agreed check-in.
2. Push a friendly prompt and wait a configurable grace period.
3. Check connection and last shared location age.
4. Ask the user to confirm status; if unanswered, notify their approved buddy.
5. Provide last shared location with timestamp only if previously authorized.
6. Offer a meetup point or resource lookup.
7. Stop escalation when user acknowledges or opts out, subject to clearly disclosed safety policy.

### 4.6 Workflow C: venue hazard synthesis

1. Receive a venue-level report.
2. Validate proximity eligibility without publishing exact reporter location.
3. Categorize and redact identifying details.
4. Detect duplicates and conflicts; send sensitive allegations to moderation.
5. Publish time-limited **unverified report** when policy permits.
6. Surface verified resources and optional opt-in notifications.
7. Reassess as reports expire or moderators act.

### 4.7 Workflow D: watch wellness prompt

1. Receive permitted activity/health context.
2. Apply conservative anomaly threshold and cooldown.
3. Prompt the user privately: **Are you feeling okay?**
4. If they request help, start the normal buddy-assistance workflow.
5. Do not label the user intoxicated or share raw health measurements.

### 4.8 Workflow E: ride and home-arrival coordination

1. User requests a ride or signals return-home intent.
2. Agent retrieves pickup area, group preferences, and available options.
3. Suggests links to ride providers or public transport; user books themselves.
4. Tracks user-confirmed booking and pickup details.
5. Sends agreed check-in prompts.
6. Marks arrival **suggested by location**, then **confirmed by person**.

### 4.9 Agent guardrails

- Structured JSON responses with schema validation and tool allowlists.
- Deterministic policy enforcement outside the model.
- No unrestricted arbitrary phone numbers, contacts, or web destinations.
- No autonomous purchases or emergency dispatch.
- Human approval for consequential outward messages beyond preauthorized templates.
- Tool-call budgets, timeouts, retries, idempotency, and dead-letter queue.
- Prompt-injection defenses for free-text reports and retrieved content.
- Explicit uncertainty and provenance in all generated messages.
- Persistent incident state so workflows resume after crashes.
- Observability: model latency, tool calls, policy denials, false alerts, resolution outcomes.

## 5. App screens and navigation

### 5.1 Primary tabs

1. **Night Out:** active group, status, check-ins, driver, help actions.
2. **Map:** approved friends, venue reports, verified help locations.
3. **Reports:** create/read venue-level safety observations.
4. **Inbox:** alerts, requests, incident updates, acknowledgments.
5. **Profile:** contacts, privacy, permissions, accessibility, history.

### 5.2 Required screens

- Welcome, authentication, privacy onboarding.
- Create Night Out, join via invite, session setup.
- Group roster and per-member sharing permissions.
- Designated driver acceptance and replacement flow.
- Live map with stale-location indicator.
- Wellness check-in and private consumption report.
- Trusted friend concern report.
- Venue page, hazard submission, report details and moderation status.
- Safer-place directory and route preview.
- SOS action sheet and contact escalation settings.
- Incident timeline and agent action receipts.
- Ride coordination and return-home confirmation.
- Apple Watch check-in and alert UI.
- Lock Screen Live Activity, Dynamic Island, Home Screen widget, unsafe/fine actions, and outing auto-resume settings.
- Trusted Circles, confirmed mutual connections, opt-in mutual helper availability, and two-sided assistance offers (later phase).
- Settings, delete/export data, block/report users, end sharing.
- Demo/simulation controls for hackathon judges.

### 5.3 Design language

- Dark-first interface with high-contrast safety accents.
- Large, clear status labels and timestamps.
- Calm copy for nonurgent situations; strong wording for urgent no-driving warnings.
- Never use green checkmarks to imply someone is medically safe or sober.
- Distinguish reported, confirmed, unavailable, and expired states.

## 6. Data model

Suggested PostgreSQL entities:

| Entity | Important fields |
|---|---|
| `users` | id, display_name, avatar, created_at |
| `trusted_contacts` | owner_id, contact_id/phone, role, verified, consent_scope |
| `night_sessions` | id, owner_id, name, starts_at, expires_at, status |
| `outings` | id, user_id, session_id_nullable, state, active_until, paused_at, resumed_at |
| `outing_preferences` | user_id, home_geofence_local_only, auto_resume_enabled, group_resume_scope, expires_at |
| `live_activity_tokens` | user_id, outing_id, token_encrypted, updated_at, revoked_at |
| `help_requests` | id, outing_id, requester_id, status, escalation_tier, created_at, resolved_at |
| `helper_offers` | request_id, helper_id, coarse_area, status, location_consent_at |
| `session_members` | session_id, user_id, role, joined_at, left_at |
| `consent_grants` | subject, recipient, data_scope, starts_at, expires_at, revoked_at |
| `location_updates` | user_id, session_id, coordinates, accuracy, recorded_at, expiry |
| `checkins` | user_id, session_id, type, created_at, visibility |
| `driver_assignments` | session_id, driver_id, accepted_at, ended_at |
| `concern_reports` | reporter_id, subject_id, category, visibility, created_at |
| `venues` | id, name, approximate_geometry, verification_source |
| `venue_reports` | venue_id, category, text_redacted, confidence_label, expires_at |
| `safety_resources` | id, type, coordinates, hours, source, verified_at |
| `incidents` | id, session_id, type, severity, status, opened_at, closed_at |
| `incident_actions` | incident_id, actor, tool, outcome, timestamp |
| `notifications` | recipient_id, channel, status, acknowledged_at |
| `ride_plans` | session_id, user_id, option, user_confirmed_status |
| `audit_events` | actor, action, resource, timestamp, policy_decision |

**Sensitive data handling:** Encrypt in transit and at rest, enforce row-level security, minimize raw location retention, restrict access to health-related reports, and keep audit logs separate from user-visible incident narratives. Define deletion and retention windows before launch; never promise a fixed period that the implementation does not enforce.

## 7. API design

Illustrative REST endpoints:

```text
POST   /auth/session
POST   /nights
GET    /nights/{id}
POST   /nights/{id}/invite
POST   /nights/{id}/join
POST   /nights/{id}/leave
POST   /nights/{id}/end
POST   /nights/{id}/driver/accept
POST   /nights/{id}/driver/reassign
POST   /nights/{id}/location
GET    /nights/{id}/members/locations
POST   /nights/{id}/checkins
POST   /nights/{id}/concerns
POST   /nights/{id}/help
POST   /nights/{id}/rides
POST   /venues/{id}/reports
GET    /venues/{id}/reports
GET    /safety-resources?lat=&lng=&type=
GET    /incidents/{id}
POST   /incidents/{id}/acknowledge
POST   /incidents/{id}/confirm-resolution
POST   /consents
DELETE /consents/{id}
POST   /webhooks/twilio
POST   /webhooks/push-status
```

All endpoints require authentication and resource-specific authorization, except carefully scoped public discovery endpoints. Never trust client-supplied role, location, or consent claims without server validation.

## 8. Technical stack and integrations

| Area | Recommended choice | Notes |
|---|---|---|
| iOS | SwiftUI | Native map, location, push UI |
| Lock Screen and widgets | ActivityKit, WidgetKit, App Intents | Finite Live Activities, supported interactive actions, fallback deep links |
| Home exit events | Core Location region monitoring | Permissioned, best-effort geofencing and user-controlled auto-resume |
| Watch | SwiftUI/watchOS | Check-ins, haptics, optional HealthKit |
| Backend | FastAPI/Python | Event ingestion, policy engine, agent tools |
| Database | Supabase PostgreSQL | RLS, storage, real-time updates |
| Agent workflow | LangGraph | Durable state, tool orchestration, human checkpoints |
| LLM | NVIDIA Nemotron through supported inference endpoint | Verify exact model availability and tool-call support |
| Maps | MapKit or Google Maps Platform | Places, directions, resource display |
| Messaging | APNs and Twilio | SMS/call consent and verification |
| Auth | Sign in with Apple / Supabase Auth | Minimize account friction |
| Monitoring | Structured logs, error tracking | Avoid raw sensitive payloads in logs |
| Hosting | Cloud service supporting background workers | Scheduled follow-ups and event queues |
| Transport | Provider deep links | Availability and booking confirmed by user |

**External integration caveats:** APIs, rate limits, background execution, ride-booking capabilities, and HealthKit access must be verified during implementation. A deep link is not the same as booking a ride. Apple Watch cannot reliably measure intoxication.

## 9. Safety, abuse prevention, and legal review

### 9.1 Threat model

- Stalking or coercive location sharing.
- Abusive group organizers monitoring members.
- False impairment allegations or coordinated false venue reports.
- Doxxing or identification through small venue cohorts.
- Notification spam and emergency-feature misuse.
- Account takeover and unauthorized access to contact/location data.
- False reassurance from stale GPS, health signals, or inaccurate venue reports.
- Model prompt injection from malicious report text.

### 9.2 Mitigations

- Revocable consent and persistent sharing indicator.
- Per-recipient access control, blocking, abuse reporting, and rate limits.
- Public reports aggregated at venue level with minimum group sizes where applicable.
- Redaction, moderation, expiration, and provenance labels.
- Strong authentication, encrypted storage, short-lived invite links.
- Safety-critical policy engine independent of Nemotron.
- Contact verification and opt-in for automated communications.
- No autonomous emergency calls, diagnoses, or sobriety certification.
- Privacy-preserving analytics and documented incident response process.

### 9.3 Compliance review before launch

Review applicable privacy, biometric/health data, consumer protection, telecommunications/SMS consent, emergency services representations, minors' data, venue defamation, and app store policies with qualified counsel. Avoid collecting data about minors without an appropriate, specifically designed compliance program. For an initial nightlife-focused MVP, restrict participation to adults.

## 10. Hackathon build plan

### 10.1 Goal

Show a working Nemotron-driven, multi-step safety coordination workflow with actual tool calls, real-time state, and user confirmations. Do not imply experimental features are production-ready.

### 10.2 Minimum demo scope

**Build for real**
1. SwiftUI or responsive web interface with four simulated/real demo users.
2. Create/join Night Out and assign a designated driver.
3. Consent-based session location sharing or clearly labeled simulated coordinates.
4. Self-report or trusted-friend concern trigger.
5. Deterministic initial no-driving warning.
6. Nemotron + LangGraph agent that calls group-context, messaging, transport lookup, and follow-up tools.
7. Twilio sandbox/test SMS or actual consented demo messaging.
8. Human acknowledgment and backup-buddy fallback.
9. Return-home check-in and incident timeline.
10. Simple venue report submission with moderation labels.

**Prototype only if time allows**
- Apple Watch one-tap check-in.
- Nearby verified help resources.
- Basic map and venue report overlays.

**Clearly future/experimental**
- Watch-based impairment research.
- Large-scale verified crowd intelligence.
- Production emergency dispatch integration.
- Automatic ride purchasing or booking.

### 10.3 Suggested 36-hour schedule

| Window | Deliverable |
|---|---|
| Hours 0-4 | Scope, screens, data model, auth, repo setup |
| Hours 4-10 | Night Out group, roles, consent, location/demo map |
| Hours 10-16 | Backend events, safety trigger engine, incident state |
| Hours 16-23 | Nemotron tool calls, LangGraph, messaging, follow-up |
| Hours 23-28 | Driver incident UI, ride alternatives, acknowledgments |
| Hours 28-32 | Venue reports, home confirmations, audit timeline |
| Hours 32-36 | Failure testing, polish, video/pitch, backup demo |

### 10.4 Live judge demo

1. Four friends join **Friday Night**; Sam accepts designated driver role.
2. Alex submits a concern that Sam may have consumed alcohol.
3. Rule engine immediately shows Sam a no-driving warning.
4. Nemotron retrieves approved group context and chooses contact/transport tools.
5. First buddy fails to respond; agent waits, then messages the approved backup.
6. Backup buddy acknowledges and opens a rideshare link.
7. Group confirms alternative transport was arranged.
8. A user confirms home arrival; incident timeline shows every tool call and outcome.
9. Optionally demonstrate a venue hazard report and private watch check-in.

### 10.5 Why it meets the hackathon rubric

- **Nemotron:** Performs meaningful contextual reasoning and tool selection.
- **Beyond chatbot:** Workflows begin from events without a user prompt to the AI.
- **Multi-step:** The agent checks context, selects actions, waits, adapts, and follows up.
- **Tools:** Messaging, maps/places, session database, check-ins, and transportation links.
- **Real-world:** Addresses group separation, transport coordination, and missed check-ins.

## 11. Test plan and acceptance criteria

### 11.1 Functional tests

- Users can join/leave a group; leaving immediately revokes future location access.
- Driver assignment requires explicit acceptance.
- Concern reports trigger a warning without declaring confirmed intoxication.
- Agent cannot message contacts outside the approved list.
- Buddy nonresponse causes bounded fallback to the approved backup.
- Repeated events do not duplicate SMS/calls.
- Offline/stale location is displayed as unavailable/stale.
- Arrival geofence never automatically marks a user safe.
- Public venue reports never reveal individual consumption or precise reporter location.
- Session expiration stops live sharing and scheduled follow-ups as defined by policy.

### 11.2 Safety tests

- Malicious reporter cannot force public intoxication labels.
- Prompt-injection text in reports cannot override tool permissions.
- Unauthorized users cannot fetch locations or incident histories.
- No automated call to a suspected active driver that creates distraction.
- HealthKit anomaly alone cannot trigger an intoxication accusation.
- SOS interface always provides direct emergency-service guidance when needed.

### 11.3 Reliability tests

- Duplicate webhook handling and idempotent tool execution.
- SMS provider timeout, maps failure, missing permissions, low battery.
- Agent timeout and deterministic fallback.
- Incident resume after backend restart.
- Load test for location updates and venue report ingestion.

## 12. Success metrics

**Activation:** group sessions created, invite acceptance rate, permission opt-in rate.  
**Engagement:** check-in completion, group sessions per active user, report usefulness feedback.  
**Safety workflow:** time to first warning, buddy acknowledgment time, alternative transport confirmations, unresolved incident rate.  
**Quality:** false/duplicate alert rate, location staleness, unauthorized access attempts blocked, report moderation turnaround.  
**Trust:** sharing revocations honored, privacy complaints, notification opt-outs, user-reported feeling of control.

Do not treat increased alerts as inherently successful. Favor timely, accurate, minimally intrusive interventions.

## 13. Roadmap

### Phase 0: Hackathon proof of concept

- Core groups, driver assignment, concern reporting, Nemotron workflow, SMS demo, home check-ins.

### Phase 1: Private campus beta

- Robust consent, location reliability, contact verification, notification controls, abuse reporting, resource directory, telemetry, deletion workflows.

### Phase 2: Community safety network

- Moderated venue reporting, verified venue/campus partners, hazard freshness, event safe zones, aggregation safeguards.

### Phase 3: Watch and advanced coordination

- Watch check-ins, optional private wellness signals, more transport integrations, accessible navigation, advanced incident workflows.

### Phase 4: Research and partnerships

- Validated wearable research only if ethically and scientifically justified, campus/event partnerships, safety impact evaluation.

## 14. Business model hypotheses

- Free group safety core to encourage adoption.
- Optional premium coordination features for power users, without paywalling SOS or critical safety actions.
- B2B subscriptions for event organizers or campuses for **aggregated, privacy-preserving** event operations and verified resource publishing.
- Never monetize personal location, consumption reports, or sensitive health signals through advertising or sale.

Validate willingness to pay separately from the hackathon demo.

## 15. Open product decisions

1. Should venue reports require a minimum number of independent observations before public display?
2. How long should the default Night Out session last?
3. Which contacts can receive location during escalation, and for how long?
4. What is the exact notification escalation timing and cooldown?
5. Which transportation providers have usable links or APIs in launch markets?
6. Which campus/venue resources can be verified and maintained?
7. Which Nemotron model and hosting endpoint meet latency and tool-use requirements?
8. What data retention policy is operationally enforceable?
9. How should the product behave when a member revokes sharing during an open incident?
10. What moderation capacity is required before opening community reports broadly?

## 16. One-paragraph pitch

**SafeNight** is an AI-powered nightlife safety network that helps friends stay connected, understand nearby reported hazards, coordinate designated drivers, and confirm everyone gets home. Users create temporary Night Out groups, share locations only with approved friends, and request help through quick check-ins. When a safety concern arises, a rules-based trigger engine and an NVIDIA Nemotron-powered agent coordinate approved contacts, transportation options, and follow-ups through real tools. SafeNight combines proactive assistance with strict consent, privacy, and human confirmation, turning disconnected safety information into coordinated action.

---

**Implementation priority:** Build the driver-intervention and group-return workflows first. They best demonstrate Nemotron's agentic value while preserving the broader SafeNight vision.
