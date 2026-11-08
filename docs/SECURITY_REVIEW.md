# SafeNight security review (module 0.8.0-sec)

Date: 2026-11-07. Scope: the whole SpacetimeDB module in `spacetimedb/src` (tables, reducers, views, scheduled procedures, HTTP handlers, RLS filters) as published to the local database after C5/C3-A.2. Method: read every file against the checklist below, confirm each claim with a unit test where cheap, fix defects with the smallest correct change, then republish and re-run the live checks (`npm run check:rls`, `npm run demo` with the real Nemotron key in the database environment). Result: **96/96 module tests, automatic migration (no reset), RLS check PASS, live demo PASS.**

Checklist: authorization on every client-callable function; views leak nothing; public tables and RLS; consent semantics; incident and agent invariants; injection and parsing; secrets and logging; rate limits; retention and erasure.

## Findings and fixes

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| 1 | **High** | `tables/nightout.ts` `user_profile.phoneE164` | Phone numbers sat on the **public** `user_profile` table, so every client subscribing to profiles (the web app does) received everyone's number. | New private table `user_phone`; `set_phone` writes there and clears the public column; `set_profile` migrates any number still on the public row; SMS delivery and the executor read `user_phone`; owner-only view `my_phone`. The public column stays (removing a column is not an automatic migration) and is always `''`. Tests: `security.test.ts` "phone numbers are private". |
| 2 | **Medium** | `lib/agent/executor.ts`, `tools.ts`, `templates.ts` | Model-supplied template variables were interpolated into message bodies, and the `incident_update` / `organizer_handoff` templates have free-text slots, so model output could reach an SMS. | Planner may only select `buddy_alert`, `backup_alert`, `ack_request`, `ride_booked`, `ride_options_ready` (`MODEL_TEMPLATE_NAMES`); model vars are discarded; every slot (`subjectName`, `helperName`, `previousContactName`/`primaryName`, `organizerName`) is filled from the database; an unfillable slot renders as "a friend", never "…" or `{x}`. Tests: "model-supplied template vars are ignored", "backup_alert names the contact who did not respond". |
| 3 | **Medium** | `views/safety.ts` | The person an incident is about could see who reported them (`openedBy`, participant role `reporter`, event `actorName`). The blueprint forbids turning reports into accusations and the threat model lists retaliation. | For the subject only, `my_incidents.openedBy` is `Identity.zero()`, the reporter's participant role shows as `buddy`, and events written by the reporter are attributed to "A group member". Other participants see the real reporter. Test: "masks the reporter … for the subject only". |
| 4 | **Medium** | `lib/agent/executor.ts` `hand_off` | Nemotron called `hand_off` after `pickup_confirmed` ("no eligible contact needed"); the executor accepted it, closed the job and told the organizer to take over while a ride was in progress. | `hand_off` executes only for `incident_opened` / `buddy_nonresponse` / `buddy_declined` **and** when no participant with messaging consent is left uncontacted; otherwise `rejected: hand_off_not_applicable` and the job state is kept. New `no_action` tool records "No action needed" for the quiet events; prompt and hints updated. Tests: "rejects hand_off outside the contact-seeking events", "rejects hand_off while an eligible contact remains". |
| 5 | **Medium** | `rls.ts` `session_member` filter | A member who left kept receiving the session's membership rows (sharing-scope changes of others). | Filter now requires `me.active = true`. Verified live: the departed member's cache drops to 0 rows. |
| 6 | **Medium** | `lib/agent/executor.ts` `get_last_shared_location`, `lib/agent/transport.ts` | Rounded coordinates of the subject were written into agent receipts (readable by every participant, including ones without location consent), and a failed OSRM call copied the request URL (with pickup coordinates) into the receipt. | The location tool returns `available`, `ageMinutes`, `accuracyM` only; transport failures are reduced to codes (`osrm_request_failed`, `nominatim_request_failed`, `venue_not_geocoded`, `osrm_http_###`). Test: "get_last_shared_location returns age and accuracy only". |
| 7 | **Medium** | reducers | No per-caller abuse limits beyond concern dedupe. | `lib/limits.ts`: check-ins 10/min, location posts 30/min, concern reports 5/hour per reporter per session, venue reports 8/hour per author, venues 5/hour per creator, open invites 10 per session. Tests: "rate limits". |
| 8 | **Low** | `reducers/demo.ts` | Any identity outside production could call `demo_setup_group` / `demo_reset_group`, which create consent grants on behalf of the four personas. | Caller must be one of the registered personas (or the owner). Test: "only a registered demo persona…". |
| 9 | **Low** | `reducers/community.ts` `delete_my_data` | Erasure left the private phone and the `demo_persona` row (whose identity is in the public `demo_personas` view). | Both removed; test counts zero rows keyed by the identity across every personal table. |
| 10 | **Low** | `http/handlers.ts` | Webhook body unbounded; malformed percent-escapes threw inside the handler. | 413 above 64 KiB; tolerant `parseForm` in `lib/http.ts` returns 400 on malformed input. Signature check already used constant-time comparison. |
| 11 | **Low** | `procedures/agent.ts` `deliver_notification` | Raw Twilio error text (which can include the request URL) was written to the incident timeline. | Only `twilio_http_###` or `twilio_request_failed` is recorded. |
| 12 | Info | `lib/demo.ts`, `lib/community.ts` | Demo persona coordinates were in New York while the demo venue is in Dallas, so routing was implausible. | Personas and demo resources now sit around Deep Ellum, Dallas (fictional spots). |
| 13 | Info | `views/nightout.ts` | B's contact picker lists every profile because `user_profile` is public. | New per-user view `known_people` (profiles sharing an active session with the caller, plus the caller). `user_profile` stays public for B's existing reads. |

Verified and left as is: every client-callable reducer checks `ctx.sender` (self-only, active member, organizer, participant, owner or moderator, demo guard); scheduled reducers and procedures are private; the scheduler can never resolve an incident (`senderAuth.isInternal`); `okay` never closes an incident; `cancel_incident` is subject-only within 2 minutes; consent grants are created only with `subject = ctx.sender`, honor expiry and revocation everywhere they are read, and are revoked on leave/end/expire; the executor validates tool names, argument types and bounds, participant membership, messaging consent, plan version and idempotency keys before any effect; policy receipts go through the same executor; the subject of an impaired-driving incident is never messaged; untrusted notes are truncated to 280 chars and passed as data; `reasoning_content` is never read; `hand_off` never targets the subject; ride deep links are allowlisted; `health` returns no secret values; no `console` call prints env values, keys, phones, notes or coordinates; secrets scan found no key-like strings and `spacetime.local.json` / `.env*` are git-ignored.

## Public surface

| Public table / anonymous view | Contents | Why acceptable |
|---|---|---|
| `user_profile` | identity, display name, emoji, `phoneVerified`, `phoneE164` (always empty) | Display identity only. Use `known_people` to scope lists. |
| `night_session` | organizer, name, venue hint, times, status | Needed for subscriptions; no RLS join supported by the planner (see below). Residual: anyone can enumerate sessions and organizer identities. |
| `session_member` (RLS) | roles, sharing scope, active flag | Filtered to sessions the caller is an active member of. |
| `driver_assignment` | driver identity per session | Residual as above; clients use `my_rosters.driverStatus`. |
| `safety_alert` (event, RLS) | recipient-addressed alerts | Filter `recipient = :sender`, verified live. |
| `venue`, `safety_resource` | approximate venue points, demo resources | No personal data. |
| `client_presence` | identity, online, last seen | Opaque identities; presence only. |
| `online_members`, `runtime_status`, `published_venue_reports`, `demo_personas` | presence; live/simulated modes and model name; published reports without authors; demo persona ↔ identity (demo only) | No secrets; reporter identity never leaves the private author table. |

Everything else is private and reachable only through per-user views that filter by `ctx.sender` (`my_*`, `visible_locations`, `known_people`).

## Residual risks

- **`night_session` and `driver_assignment` are world-readable.** Equivalent RLS join filters publish but break every subscription with "Subscriptions require indexes on join columns" on 2.14.1 (verified). Revisit when the planner supports them.
- **Self-join RLS and live updates.** Under the `session_member` filter, rows other members insert later were not pushed incrementally to an existing subscriber in the live check (a fresh subscription sees them). Not a leak, but clients must read live rosters from `my_rosters`, which does update. `scripts/check_rls.mts` documents this.
- **No external auth provider yet.** Identities are SpacetimeDB-issued per browser; anyone can create one. Fine for the demo; production needs OIDC/SpacetimeAuth plus the `clientConnected` issuer/audience check.
- **Data leaves the host when live.** Nemotron receives participant display names, roles, consent flags, check-in kinds, location age and truncated notes (no coordinates); Nominatim receives the venue hint; OSRM receives the venue and the subject's pickup rounded to ~100 m; Twilio receives message bodies and phone numbers. All documented in `docs/ARCHITECTURE.md` §3.
- **OSRM is blocked by a TLS handshake failure from this host**, so routes never appear; receipts show `partial` with provider links.
- **Demo reducers** (`reset_demo`, `demo_*`) are open to registered personas / anyone outside production by design; `APP_ENV=production` disables them except for the owner.
- **Receipts are visible to every participant** (`my_agent_actions`), including recipient identities and templates. Coordinates and notes are excluded; message bodies live in `my_notifications` for the recipient only.
- **Venue report labels and `kind`/`label` strings in model-proposed ride options** are free text (bounded), shown in the UI; the allowlist bounds URLs but not labels.

## Binding changes for the web client

- New view `tables.myPhone` (`UserPhone { identity, phoneE164, updatedAt }`, at most one row): read the caller's own number here. `user_profile.phoneE164` is always `''` now.
- New view `tables.knownPeople` (`UserProfile` rows): people sharing an active session with the caller; use it for contact pickers instead of all of `user_profile`.
- `my_incidents.openedBy` is `Identity.zero()` and the reporter's role reads `buddy` when the viewer is the subject; `my_incident_events.actor`/`actorName` are masked the same way.
- `agent_action.tool` can now be `no_action`; `rejectReason` can be `hand_off_not_applicable` or `template_not_allowed`.
- Rate-limit `SenderError` messages (verbatim, show them inline): "Too many check-ins in a minute; take a breath", "Too many location updates; slow down", "You have reported several concerns this hour; please talk to the organizer directly", "Too many open invites; revoke one first", "You filed several reports this hour; please wait before filing more", "You created several venues this hour; try again later".
- `demo_setup_group` / `demo_reset_group` require the caller to be a registered persona: "Register as a demo persona first".

## Re-check before any launch beyond the hackathon

1. Replace anonymous identities with an OIDC provider and enforce issuer/audience in `clientConnected`.
2. Decide whether `night_session`/`driver_assignment` can move behind views once RLS joins subscribe correctly; re-test the self-join incremental delivery.
3. Review data sent to Nemotron, Nominatim, OSRM and Twilio with counsel (names, notes, approximate location, phone numbers); add a data-processing notice.
4. Rotate the Nemotron key before publishing the repository and keep it only in the database environment.
5. Load-test the sweeps (`sweep_locations`, `sweep_retention`, `expire_venue_reports`) and the per-caller limits; consider moving counters to dedicated tables if row scans grow.
6. Add abuse reporting and blocking between members (not implemented).
