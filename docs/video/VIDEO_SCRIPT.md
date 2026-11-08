# SafeNight demo video: narration script

Video: `~/Downloads/SafeNight-demo.mp4` (1920x1080, 30 fps, no audio, burned-in captions). Subtitles: `SafeNight-demo.srt`.
Record your voiceover against the timestamps below; captions are the on-screen text, the right column is a suggested line (1-3 sentences, speak naturally, cut what you don't need).

## Intro to record before the first slide (optional, ~15 s)

1. Hi, we're the SafeNight team.
2. SafeNight helps groups of friends get home together on a night out.
3. It's built on SpacetimeDB as the whole backend, with an NVIDIA Nemotron agent that coordinates real people through real tools.
4. First the product, then a live run with four phones, then how it works under the hood.
5. Everything you'll see runs against a live database; anything simulated is labeled on screen.

## Script

| Time | On screen (caption) | Suggested voiceover |
|---|---|---|
| 00:00 | SafeNight. Go out together. Get home together. | This is SafeNight. |
| 00:05 | A consent-based safety app for friends on a night out. | It's a consent-based safety app for friends on a night out, built for HackUTD on NVIDIA Nemotron and SpacetimeDB. |
| 00:10 | Nights out have a gap nobody owns. | Here's the gap we're closing. Nights out are fun right up until something goes a little wrong, and then nobody is quite sure who's handling it. |
| 00:14 | Friends split up. The designated driver has a drink. | Friends split up. The person who said they'd drive has a drink. Everyone notices; nobody wants to be the one to say it. |
| 00:19 | A location pin says where someone is, not that anyone is coming. | Location sharing doesn't fix that. A pin tells you where someone is. It doesn't tell you that anyone is actually coming. |
| 00:24 | Built for groups of friends, designated drivers, and safety buddies. | SafeNight is for groups of friends, for the designated driver, and for the one or two people you'd actually want called. |
| 00:29 | Roles are accepted on purpose, never assigned silently. | Every role in SafeNight is accepted on purpose. Nobody gets volunteered silently. |
| 00:34 | Plan. Stay connected. Notice a concern. Coordinate help. Confirm home. | The loop is simple. Plan the night, stay connected, notice a concern, coordinate help, and confirm that everyone got home. |
| 00:40 | A temporary group that expires. Not a tracker, not a dispatcher. | A Night Out is a temporary group. It expires. SafeNight is not a tracker and it is not an emergency dispatcher. |
| 00:45 | Sharing is opt-in, scoped per person, time-limited, revocable. | Trust is the whole product, so the rules are strict. Sharing is opt-in, scoped per person, time-limited, and you can revoke it any time. |
| 00:50 | No intoxication detection. Nobody is ever declared sober. | We never detect intoxication and we never declare anyone sober or safe to drive. A concern is a concern, not a verdict. |
| 00:55 | People confirm every outcome. The agent never acts alone. | People confirm every outcome. The agent can propose and coordinate, but it never acts alone. |
| 01:00 | Explicit driver acceptance. Instant deterministic warnings. | What makes it different: explicit driver acceptance, and an instant deterministic warning that doesn't wait for any AI. |
| 01:05 | And an agent that adapts when a buddy does not answer. | And an agent that actually adapts: it asks the right buddy, waits, escalates to the backup, and proposes a ride. |
| 01:10 | Live demo. Four phones, four identities, one SpacetimeDB database. | Let's watch it live. Four phones, four separate identities, one SpacetimeDB database. Nothing here is mocked. |
| 01:13 | Each phone registered its identity. Alex sets up the demo group. | Each phone registered itself with the server. Alex, the organizer, sets up tonight's group with one tap. |
| 01:14 | The roster: Alex organizes, Sam explicitly accepted the driver role. | Here's the roster. Alex organizes. Sam volunteered to drive and then explicitly accepted that role. |
| 01:19 | Each person grants each friend specific scopes, for a limited time. | Consent is granular: each person grants each friend specific things, like approximate location or check-ins, for a limited time. |
| 01:24 | The map shows only consented, approximate locations. Simulated tonight. | The map only shows people who consented, at the scope they chose. Tonight the coordinates are simulated and labeled as such. |
| 01:29 | Alex reports a concern: Sam, the driver, may have been drinking. | Alex is worried. Sam, the driver, may have been drinking. Alex reports it. |
| 01:32 | Sam sees "Do not drive" instantly. A deterministic rule, no AI in the loop. | Sam's phone shows 'Do not drive' instantly. That's a deterministic rule inside the database, in the same transaction as the report. No AI in the loop. |
| 01:39 | The incident opened the agent. Plan v1 comes from Nemotron on NVIDIA NIM. | The report also opened an incident and woke the agent. Plan version one comes from Nemotron running on NVIDIA NIM, and the model name is right there. |
| 01:45 | Every tool call is validated, then recorded as a receipt. Messages are SIMULATED. | Every tool call is validated against consent and the incident state before it runs, and each one leaves a receipt. The messages are simulated tonight, and the UI says so. |
| 01:51 | Maya, the primary buddy, gets the request. She does not respond. | Maya is Sam's primary buddy. She gets the request. And she doesn't respond. |
| 01:56 | The follow-up timer lives in SpacetimeDB. We advance it instead of waiting two minutes. | The follow-up timer lives in SpacetimeDB, not in the model. For the demo we advance it instead of waiting the full two minutes. |
| 02:04 | No reply. The agent escalates: Nemotron plan v2 messages Jordan, the backup. | No reply, so the agent escalates. Plan version two messages Jordan, the backup buddy, with a new confirmation request. |
| 02:10 | Jordan acknowledges. Sent is not acknowledged: the states stay distinct. | Jordan taps 'I'm on it'. Notice the states stay distinct: sent is not acknowledged, and acknowledged is not resolved. |
| 02:13 | Now the agent looks up transport and proposes a ride. Two tool rounds. | Now the agent looks up transport and proposes a ride. That takes two tool rounds: it reads the lookup result, then proposes. |
| 02:25 | Routing was unreachable, so it says "Provider link only". Nothing is invented. | Our routing provider was unreachable from this machine, so the plan says 'Provider link only'. The system never invents a route. |
| 02:31 | Sam picks a ride. The app opens a link; a person books. No autonomous purchases. | Sam picks a ride. The app opens a provider link; a person does the booking. There are no autonomous purchases. |
| 02:33 | Booked by a person. The agent tells Jordan and waits for pickup. | Sam confirms the booking. The agent tells Jordan and waits for pickup. |
| 02:38 | Pickup confirmed. Only Sam can close this: the agent never resolves an incident. | Pickup confirmed. And only Sam can close this. The agent is not allowed to resolve an incident. |
| 02:43 | Home, confirmed by the person. The incident resolves for everyone. | Sam is home, confirmed by Sam. The incident resolves for everyone, and the timeline shows every step and who did it. |
| 02:50 | Under the hood: SpacetimeDB is the whole backend. No API server. | Now the technical side. SpacetimeDB is the entire backend. There is no API server. |
| 02:56 | Sessions, consent, incidents, timers, agent state: all tables and reducers. | Sessions, consent, incidents, timers, and agent state are all tables and reducers in a single TypeScript module. |
| 03:01 | An event table with row-level security delivers the warning only to Sam. | The warning is an event table with row-level security, so only Sam's connection receives it. |
| 03:06 | Safety rules run first, in one transaction, before any model is called. | Safety rules run first, in one transaction, before any model is called. |
| 03:12 | Consent-scoped views. "I'm okay" never closes an incident. Humans resolve. | Views are consent-scoped. 'I'm okay' never closes an incident. Humans resolve. |
| 03:18 | The agent is a scheduled procedure calling Nemotron 3.5 Super with a tool allowlist. | The agent itself is a scheduled procedure that calls Nemotron 3.5 Super with a strict tool allowlist. |
| 03:23 | Tool results are fed back for up to three rounds. Every call is validated first. | Tool results are fed back for up to three rounds, and every call is validated before it executes. |
| 03:29 | Receipts say who proposed each step: the model, a policy rule, or a simulation. | Each receipt says who proposed the step: the model, a policy rule, or a simulation. |
| 03:34 | This is the real plan from tonight's run, with its validated tool receipts. | This is the real plan from tonight's run, with its validated tool receipts. |
| 03:41 | 81 module tests and 93 web tests, plus a live four-identity end-to-end run. | We tested this. 81 module tests, 93 web tests, and a live four-identity end-to-end run. |
| 03:47 | Revocation, unauthorized access, duplicates, escalation, injection: all covered. | Consent revocation, unauthorized access, duplicate events, escalation, prompt injection: all covered. |
| 03:52 | Nemotron and SpacetimeDB are live. SMS is simulated until Twilio keys exist. | Nemotron and SpacetimeDB are live today. SMS is simulated until we add Twilio keys. |
| 03:58 | Adding keys changes nothing in the data model, only who writes the plan. | Adding keys changes nothing in the data model. It only changes who writes the plan. |
| 04:03 | SafeNight. NVIDIA Nemotron agentic workflow on a SpacetimeDB backend. | SafeNight: an NVIDIA Nemotron agentic workflow on a SpacetimeDB backend. |
| 04:08 | github.com/sabharwalainesh/SafeNight | The repo is github.com slash sabharwalainesh slash SafeNight. Thank you. |

## Sections

- 00:00 Product: problem, audience, loop, principles, differentiation.
- 01:10 Live demo: four personas, concern → warning → agent plan → nonresponse → backup → ride → home.
- 02:50 Technical: architecture, safety engine, agent loop, evidence, what is real vs simulated.
- 04:03 Close.
