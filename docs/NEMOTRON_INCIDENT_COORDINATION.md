# Nemotron incident coordination

Recorded November 7, 2026. Status: product design, not implemented functionality.

## Purpose

Nemotron is SafeNight's proposed incident coordination agent. It turns a person's request and incoming responses into an accurate briefing, identifies unmet assistance needs, and coordinates approved people until an authorized human confirms the outcome.

Product promise: **Request help once. SafeNight helps your approved support network understand the situation, agree on who is doing what, and stay updated.**

This is the current primary Nemotron direction. Adaptive return-home planning remains a supporting capability. Basic alerts, contact matching, timers, and delivery do not themselves justify an LLM; the substantive work is interpreting unstructured accounts, understanding partial offers, reconciling conflicting updates, and adapting accepted responsibilities.

## 1. Understand the SOS and prepare a briefing

An SOS can include a button press, written explanation, or transcribed voice message:

> I'm outside the venue. My friends left, someone keeps following me, and my phone is almost dead. Please contact Maya.

SpacetimeDB immediately records the request and initiates the configured alert flow. Initial alerts and direct emergency controls must not wait for the model.

Nemotron extracts the reported concern, requested assistance, communication preferences, known facts, uncertainties, and material missing information. It distinguishes “the user reports being followed” from an independently verified event. Location comes from authorized device data with timestamps and accuracy, not model inference.

## 2. Generate recipient-specific reports

Detailed reports mean actionable information, not everything stored about the requester. The backend scopes the information available for each summary and validates disclosure before delivery; prompting the model alone is not an access-control mechanism.

| Recipient | Permitted report scope |
|---|---|
| Approved friends and safety buddies | Reported concern, requested assistance, authorized location with timestamp/accuracy, relevant context, and available response actions. |
| Eligible nearby mutual before acceptance | Coarse area, assistance category, and permitted mutual-connection context. No exact location, requester identity, or sensitive narrative during discovery. |
| Requester-selected mutual after both parties accept | Necessary briefing and an agreed meeting point; temporary precise location requires separate authorization. |
| Participating help center | Authorized callback information, requester/reporter attribution, reported concern, location provenance, actions already taken, and outstanding needs through its supported channel. |

Example buddy update:

> Alex requests help leaving the venue and asks you to call. Last shared location was near the east entrance one minute ago. Alex reports low battery.

Avoid unrelated health details, private message history, home addresses, or public disclosure of allegations. An available mutual is not automatically trusted or entitled to the full report.

## 3. Clarify only material unknowns

Ask focused questions when the answer affects action: “Are you at the east entrance or the ticket office?”, “Would calling or messaging be easier?”, or “Do you want to see offers from opted-in mutual friends?”

Do not delay initial help with a long questionnaire. Unanswered questions remain unknown. An ambiguous preference is not a new permission grant.

## 4. Interpret incoming offers

Example responses:

- Maya: “I can call now, but I'm half an hour away.”
- Jordan: “I'm nearby. I can walk over, but I can't drive.”
- Sam: “I can help arrange a ride once someone is with Alex.”

Nemotron separates remote contact, in-person accompaniment, and transportation coordination. It recognizes dependencies and unmet needs: nobody has yet confirmed reaching Alex, and Sam's offer is conditional.

SpacetimeDB determines mutual eligibility using confirmed relationships through approved intermediaries, opt-in availability, coarse proximity, blocks, and consent. No random nearby helpers, public vulnerable-user browsing, or model-selected expansion of the audience. The requester selects a candidate and both sides accept before authorized details are shared.

## 5. Propose and confirm responsibilities

Nemotron proposes a coordinated response:

> Maya, can you stay in contact with Alex? Jordan, can you meet Alex at the agreed location? Sam, can you help with transport once Alex confirms the pickup plan?

Each person accepts or declines. Proposed, accepted, in progress, and completed actions are distinct. The requester approves mutual assistance and any precise-location disclosure. An offer or message acknowledgment is not arrival or completion.

## 6. Execute approved tools

Possible tools include scoped incident/group lookup, eligible assistance offers, directions to an agreed meeting point, verified resource lookup, consented messaging/calling, follow-up scheduling, and acknowledgment/status lookup.

Nemotron chooses among permitted tools. Before execution, code validates arguments, recipient authorization, current consent, incident/plan version, limits, and duplication risk. Store concise action receipts and source references, not private model reasoning. Treat messages and retrieved content as untrusted inputs that cannot override policy.

Automated text or voice contact is limited to supported, authorized recipients. Automated calls identify SafeNight, the authorized requester attribution, incident reference, and callback path, and request explicit acknowledgment. Public-authority outreach requires a supported and explicitly authorized integration; never assume a generic messaging API reaches emergency dispatch. Direct emergency-call controls remain independent. Use simulated help-center dashboards and consented test recipients for demos, never real emergency lines.

## 7. Maintain the evolving briefing

> Maya has confirmed phone contact with Alex. Jordan accepted the accompaniment request but has not confirmed arrival. Sam is helping compare transport options. Alex's latest shared location is four minutes old.

Nemotron flags conflicts rather than silently choosing a convenient account:

> Jordan reports being at the east entrance; Alex says they moved to the front desk. The meeting location needs reconfirmation.

Each recipient receives only authorized updates. Preserve provenance and location freshness. Delivered, acknowledged, responsibility accepted, assistance started, and assistance completed must remain distinct.

## 8. Adapt to failure and changed circumstances

If Jordan cannot reach the entrance, Nemotron identifies accompaniment as unresolved, investigates a suitable alternative meeting point, asks whether Jordan can reach it, or presents another eligible offer for requester acceptance. Preserve unaffected accepted commitments, such as Maya's ongoing phone contact.

Nonresponse follows a bounded, preapproved escalation policy enforced by SpacetimeDB. Nemotron cannot broadcast precise location, contact arbitrary people, or create new permissions. Revocation prevents future disclosure and pending actions must recheck consent. A timeout must not be interpreted as consent or safety.

## 9. Handoff and human-confirmed closure

For an authorized participating help center, prepare a concise handoff with the original request, current known location and freshness, who is in contact or present, accepted actions and their status, and unresolved questions.

The requester or an authorized human confirms resolution. Nemotron may produce a final factual summary after that confirmation. Silence, arrival GPS, a positive-sounding reply, or a sent report never proves safety or that help is coming. An explicit cancellation follows the cancellation policy and informs already-alerted recipients; it must not silently erase a response underway.

## Accountability and misuse prevention

- Authenticate the submitting account and verify callback contact where applicable; distinguish this from verified legal identity.
- Record separately who submitted a report and who needs assistance.
- Use incident IDs, timestamps, minimal audit records, duplicate suppression, controlled retries, and restricted report access.
- Verify participating institutional recipients and their accepted delivery channels.
- Do not assume identity attribution prevents abuse or use an AI truthfulness score to deny urgent assistance.
- Apply configured retention/deletion policies to reports and sensitive location data.

## Architecture and multi-step lifecycle

**SOS event → immediate deterministic alert → scoped briefing → targeted clarification → interpret offers → propose responsibilities → human acceptance → tool execution → updated briefing → follow-up/replanning → human-confirmed handoff or resolution.**

SpacetimeDB owns the majority of the backend: authoritative incident state, permissions, mutual eligibility, commitments, timers, workflow wakeups, delivery records, and enforcement. Nemotron supplies interpretations, structured proposals, summaries, and permitted tool selections. External services supply messaging, directions, and resource information. Workflows pause durably while waiting for events; the model need not run continuously.

A simple SOS can use templated alerts. Invoke Nemotron when interpretation or coordination adds value. The workflow is event-driven and produces real accepted actions, rather than only conversational responses; model value still needs measurement against a deterministic baseline.

## Demo and acceptance evidence

1. A demo user activates SOS; immediate permitted alerts appear before AI completion.
2. Nemotron produces scoped briefings from an unstructured account without changing allegations into facts.
3. Approved friends provide distinct, partly conditional offers; the agent identifies the remaining gaps and requests accepted responsibilities.
4. Demonstrate a mutual discovery request with coarse information, two-sided acceptance, and separately authorized meeting-location sharing. A nearby stranger and an unapproved mutual remain excluded.
5. Introduce a changed meeting location or withdrawn offer. Show grounded clarification and replanning while preserving valid commitments.
6. Demonstrate a consented messaging integration and a simulated institutional handoff, clearly labeled.
7. Show human-confirmed resolution, action receipts, and distinct delivery/acknowledgment/completion states.

Evaluate factual accuracy and provenance, recipient privacy boundaries, interpretations of conditional offers, unresolved-need tracking, unnecessary questions/messages, and handling of stale data, conflicting updates, duplicate events, revocation, and model/API failures. No effectiveness or emergency-dispatch capability is claimed by this design.
