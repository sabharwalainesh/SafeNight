# SafeNight: two-track requirements and implementation plan

Recorded November 7, 2026 from the user's supplied track requirements. Track labels below are descriptive; official track names and the organizer's full eligibility rules were not supplied. “Spacetime” is interpreted as SpacetimeDB.

**Status: required design targets, not implemented or verified qualification.** This document supersedes the original blueprint's FastAPI/Supabase-primary backend and mandatory LangGraph proposal wherever they conflict with these requirements. The original blueprint is preserved as reference.

## Track 1: NVIDIA Nemotron agentic application

The project must use Nemotron and satisfy all four supplied criteria:

| Requirement | SafeNight implementation commitment | Demonstration evidence |
|---|---|---|
| Beyond a chatbot: not just responding directly to prompts | A help request, driver concern, or agreed check-in timeout starts an incident workflow without a chat prompt. | Trigger an incident from a status action or timer and show autonomous workflow progression. |
| Multi-step workflows: agents plan and execute complex tasks | Nemotron assesses authorized structured context, proposes a tool plan, executes permitted steps, waits for responses, and revises the plan when circumstances change. | Show the selected plan, actual tool calls, first buddy nonresponse, backup acknowledgment, and subsequent transport coordination. |
| Tool integration: intelligent use of external APIs and services | Nemotron uses an allowlisted tool interface for approved group context, consented Twilio messaging, a maps/directions or transport-information API, and follow-up scheduling. | Show real API responses and delivery outcomes; label simulations. A static ride-provider link alone is not sufficient evidence of intelligent external tool use. |
| Real-world applicability | Help separated friends or a group with an unavailable designated driver coordinate an acknowledged helper, alternative transport, and explicit home check-ins. | Demonstrate a complete incident with human-confirmed outcomes and transparent failure states. |

Nemotron must perform meaningful contextual planning and adaptation, not merely generate notification wording. Immediate warnings and authorization checks remain deterministic and independent of the model. Persist a concise structured plan and action receipts; do not require or expose private model reasoning.

## Track 2: Spacetime-backed application

Supplied requirements:

- Build an app or game; SafeNight is the app submission.
- Submit a **public GitHub repository**.
- Build the **majority of the backend on Spacetime**.

SpacetimeDB will own the authoritative application state and the substantial majority of backend business logic, rather than serving as a secondary cache or demo-only integration. No organizer-defined percentage or measurement method was provided; do not invent one or claim qualification based on lines of code.

### Backend ownership

| Responsibility | Required owner |
|---|---|
| Night Out sessions, invitations, membership, driver acceptance | SpacetimeDB module |
| Consent grants, revocation, resource authorization, scoped client visibility | SpacetimeDB module |
| Location freshness, check-ins, outing state, session expiration | SpacetimeDB module |
| Immediate safety triggers, incident transitions, acknowledgment and resolution | SpacetimeDB module |
| Agent job state, saved plans, tool permissions, action receipts | SpacetimeDB module |
| Follow-up scheduling, backup escalation decisions, retry/deduplication state | SpacetimeDB module |
| Ride-plan confirmations and live client updates | SpacetimeDB module |
| Nemotron inference, SMS delivery, maps/directions data | External providers called through constrained integrations |

Prefer SpacetimeDB procedures for external HTTP operations where supported by the selected runtime and deployment. Reducers perform transactional application changes; external network calls must not run inside reducers. If a provider requires a separate integration worker, keep that worker a thin adapter: it must not become the primary API server, policy engine, incident scheduler, or authoritative state store. Validate authorization again before outward actions and when recording results.

SpacetimeDB's official documentation distinguishes [reducers and their network restrictions](https://spacetimedb.com/docs/functions/reducers/) from [procedures and other module functions](https://spacetimedb.com/docs/functions/). Confirm exact SDK, scheduling, procedure, secret-management, and client support during implementation.

FastAPI and Supabase are no longer the planned core backend. LangGraph is optional only if a limited integration genuinely needs it and does not move backend ownership away from SpacetimeDB. Nemotron remains required regardless of orchestration library.

## Shared end-to-end demo

1. Four participants join a Night Out; one explicitly accepts the driver role. SpacetimeDB records roles and consent and synchronizes the group UI.
2. A participant submits a driver concern or requests help. SpacetimeDB opens the incident and immediately applies the relevant deterministic warning.
3. A persisted agent job invokes Nemotron with minimal authorized context. Nemotron selects a plan and approved tools.
4. The workflow contacts the primary approved buddy through a real consented/test messaging integration and records the outcome.
5. The first buddy does not acknowledge. A scheduled state transition resumes the workflow; Nemotron adapts to the nonresponse and contacts the approved backup.
6. The backup acknowledges. Nemotron retrieves suitable transport/pickup information through an external API and proposes alternatives. A human chooses and books transportation.
7. Participants confirm transport arrangements and home arrival. SpacetimeDB updates the timeline and resolves the incident only under authorized human confirmation rules.
8. Show the plan, tool receipts, real-time UI changes, and consent enforcement to judges. Distinguish sent, acknowledged, booked, and completed states.

## Submission checklist

- [ ] Nemotron inference is connected and its exact model/endpoint is documented.
- [ ] An event initiates a workflow without a chat prompt.
- [ ] The agent executes multiple tool steps and adapts to an actual response or nonresponse.
- [ ] Real external integrations are demonstrated; simulations are explicitly labeled.
- [ ] SpacetimeDB contains the core state and business logic listed above.
- [ ] Tests cover consent revocation, unauthorized access, duplicate events, fallback escalation, and human-only resolution semantics.
- [ ] README explains setup, environment variables, architecture, demo steps, and both track mappings.
- [ ] The submitted GitHub repository is public and accessible without authentication.
- [ ] Repository and demo contain no API secrets or real participant-sensitive data.
- [ ] Full organizer rules are checked before claiming eligibility or submitting.

This documentation change does not publish the repository, implement the backend, or claim either track is already satisfied.
