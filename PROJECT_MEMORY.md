# SafeNight project memory

Saved November 7, 2026 at the user's request from `/Users/aineshsab/Downloads/SafeNight_Complete_App_Blueprint_v2.md`. A complete copy is in `docs/SafeNight_Complete_App_Blueprint_v2.md`. The filename says v2; the document's internal version is 1.1, dated November 7, 2026.

## Product

**Tagline:** Go out together. Get home together.

SafeNight is a consent-based nightlife safety and coordination app for friends attending parties, bars, concerts, festivals, and campus events. Its journey is plan → stay connected → identify concerns → coordinate help → explicitly confirm everyone is accounted for. Initial nightlife MVP participation is intended for adults.

## Planned experience

- Create temporary Night Out groups through expiring invitations. Members choose location-sharing scope, safety buddies, check-in cadence, destinations, and transportation plans. A designated driver explicitly accepts the role.
- Show consented friend locations with timestamps, accuracy, and stale/offline states. Provide I'm okay, Need a friend, Need a ride, Feeling unwell, and Emergency help actions.
- Support private optional consumption self-reports and trusted-friend concern reports. A driver concern immediately triggers a deterministic no-driving warning, then approved buddy outreach and alternative transportation coordination.
- Provide time-limited, moderated venue-level hazard observations and verified staffed resources, with source, freshness, and uncertainty labels.
- Feeling unsafe alerts approved group members/buddies, requests acknowledgment, and follows a preapproved backup ladder. Human confirmation resolves incidents. I'm fine does not silently cancel pending assistance.
- Coordinate rides through provider links and explicit user booking/transport confirmations. Location can suggest arrival; the person must confirm home/safe status.
- iPhone Live Activities, Dynamic Island, widgets, and an Apple Watch companion offer quick check-ins/help actions where supported. Live Activities have finite lifetimes and fallback entry points.
- An outing can pause at home and optionally resume personal mode after another departure within a chosen window. Geofencing is best effort; group sharing needs still-valid scoped consent and never overrides revocation.
- Later Trusted Circles may offer assistance through verified, opted-in mutual friends, with two-sided consent and separately authorized location disclosure. No random nearby helpers or public vulnerable-user discovery.

## AI and architecture proposal

NVIDIA Nemotron chooses approved tools and coordinates multi-step incident follow-ups. SpacetimeDB owns durable workflow state, immediate deterministic warnings, and permission enforcement. The agent retrieves group context, contacts approved buddies, offers transport options, waits for replies, escalates to approved backups, and records outcomes. LangGraph is optional, not a core requirement.

Updated stack: SwiftUI iOS/watchOS; ActivityKit, WidgetKit, App Intents, Core Location; SpacetimeDB as the primary backend and authoritative state store; NVIDIA Nemotron endpoint; MapKit or Google Maps; APNs and consented Twilio messaging. SpacetimeDB owns the majority of backend business logic, consent enforcement, incident transitions, scheduling state, and real-time synchronization. External HTTP integrations use supported procedures or thin adapters. This supersedes the blueprint's FastAPI/Supabase-primary proposal. Exact model, APIs, platform behavior, and integrations need verification at implementation time.

### Substantive Nemotron capability

The user challenged simple messaging/fallback tasks as too trivial to justify an intelligent model. The refined AI role is **adaptive group return-home planning under changing constraints**: interpret ambiguous human replies, identify missing information, selectively query transport/maps tools, propose coordinated plans, and replan after disruptions while preserving accepted commitments.

Example: six friends at different concert exits, stale GPS, an unavailable driver, an accessible pickup requirement, a transit deadline, limited accompaniment/capacity, and a reported entrance closure. Nemotron extracts tentative constraints and asks targeted questions; external tools supply facts; a deterministic planner/checker validates capacity, timing, accessibility, consent, and accepted accompaniment. SpacetimeDB remains authoritative for constraints, plan versions, permissions, commitments, and execution. Humans accept changed responsibilities, book transport, and confirm outcomes. Unknown facts remain unknown; infeasible plans require clarification or human assistance rather than silently relaxed constraints.

The stronger demo introduces “the pickup entrance is closed and our helper can't come” after a plan is accepted, then shows tool-informed, validated replanning. Evaluate unseen constraint combinations against a rules-based baseline for violations, unnecessary questions/tool calls, time/user effort, and preserved commitments. Simple timers and notifications remain deterministic infrastructure. See `docs/HACKATHON_TRACK_REQUIREMENTS.md` for the detailed design; capability and benefits are planned, not demonstrated.

## Mandatory hackathon tracks

The user's November 7 requirements are recorded in `docs/HACKATHON_TRACK_REQUIREMENTS.md`:

- Nemotron is mandatory, with event-driven behavior beyond chatbot responses, multi-step planning/execution, intelligent external API/tool use, and a real-world safety-coordination workflow.
- The majority of the backend must be built on Spacetime (interpreted as SpacetimeDB), and submission requires a public GitHub repository.
- Demonstrate an event-triggered incident, Nemotron plan/tool execution, buddy nonresponse and adaptive fallback, transport coordination, and explicit home confirmation, backed by SpacetimeDB state and logic.
- These are implementation and submission targets, not a claim of completed eligibility. Exact official track names and full organizer rules remain unspecified.

Primary tabs: Night Out, Map, Reports, Inbox, Profile. Visual direction: dark-first, high contrast, large controls, clear timestamps, calm routine copy and clear urgent warnings.

## Essential boundaries

- Sharing is opt-in, visible, revocable, time-limited, and enforced per recipient. No covert tracking or permanent movement history.
- Private consumption/health data and exact personal locations never become public venue information.
- No intoxication diagnosis, BAC inference from wearables, sobriety certification, guaranteed safe routes, or assumption that arrival/crowds mean safety.
- Watch wellness signals are experimental private prompts, not proof of impairment.
- No autonomous purchases, emergency dispatch, or outreach outside approved permissions. Delivery, acknowledgment, transport booking, arrival suggestion, and human confirmation are distinct states.
- Missing permissions, stale data, offline taps, and failed integrations must be visible. Avoid distracting repeated notifications to a suspected active driver.
- Use durable incident state, idempotent actions, bounded retries, audit trails, moderation, deletion/retention enforcement, and human control.

## Priorities and roadmap

Build driver intervention and group return-home workflows first. Hackathon demo: four users, group/driver acceptance, consented or clearly simulated locations, concern trigger, immediate warning, real Nemotron tool calls, test/consented messaging, primary-buddy nonresponse and backup acknowledgment, alternative transport confirmation, home check-in, incident timeline, and simple labeled venue reports. Basic Live Activity with unsafe/fine actions and simulated home re-exit is also prioritized in the added surface requirements.

Later stages: private campus beta and reliability/privacy controls; moderated community safety network and verified partners; Watch and advanced coordination; validated research/partnerships. Mutual-friend assistance is later phase.

Business hypotheses: free core safety; optional premium coordination without paywalling critical help; privacy-preserving campus/event operations subscriptions. No sale or advertising monetization of personal location, consumption, or health signals.

Open decisions include session duration, escalation timings, location access during incidents, retention windows, venue moderation thresholds/capacity, launch-market transport/resources, Nemotron endpoint, and revocation during active incidents.

## Implementation status at capture

The repository contained only README.md and LICENSE before this reference was saved. The blueprint describes intended functionality; no app implementation was verified or created as part of this memory request.
