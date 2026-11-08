#!/usr/bin/env python3
"""Build VIDEO_SCRIPT.md and SafeNight-demo.srt from captions.json (recorded timings).
Usage: gen_script.py <captions.json> <out_dir>"""
import json, sys, pathlib

caps = json.load(open(sys.argv[1]))["caps"]
out = pathlib.Path(sys.argv[2])

# Post-recording caption text fixes (index -> text).
FIX = {
    "This is the real plan from tonight's run, with the model name and receipts.":
        "This is the real plan from tonight's run, with its validated tool receipts.",
}
for c in caps:
    c["text"] = FIX.get(c["text"], c["text"])

def ts(s):
    h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")

srt = []
for i, c in enumerate(caps, 1):
    end = max(c["end"], c["start"] + 1.5)
    srt.append(f"{i}\n{ts(c['start'])} --> {ts(end)}\n{c['text']}\n")
(out / "SafeNight-demo.srt").write_text("\n".join(srt))

# Suggested voiceover per caption, conversational, product first then technical.
VO = [
 "This is SafeNight.",
 "It's a consent-based safety app for friends on a night out, built for HackUTD on NVIDIA Nemotron and SpacetimeDB.",
 "Here's the gap we're closing. Nights out are fun right up until something goes a little wrong, and then nobody is quite sure who's handling it.",
 "Friends split up. The person who said they'd drive has a drink. Everyone notices; nobody wants to be the one to say it.",
 "Location sharing doesn't fix that. A pin tells you where someone is. It doesn't tell you that anyone is actually coming.",
 "SafeNight is for groups of friends, for the designated driver, and for the one or two people you'd actually want called.",
 "Every role in SafeNight is accepted on purpose. Nobody gets volunteered silently.",
 "The loop is simple. Plan the night, stay connected, notice a concern, coordinate help, and confirm that everyone got home.",
 "A Night Out is a temporary group. It expires. SafeNight is not a tracker and it is not an emergency dispatcher.",
 "Trust is the whole product, so the rules are strict. Sharing is opt-in, scoped per person, time-limited, and you can revoke it any time.",
 "We never detect intoxication and we never declare anyone sober or safe to drive. A concern is a concern, not a verdict.",
 "People confirm every outcome. The agent can propose and coordinate, but it never acts alone.",
 "What makes it different: explicit driver acceptance, and an instant deterministic warning that doesn't wait for any AI.",
 "And an agent that actually adapts: it asks the right buddy, waits, escalates to the backup, and proposes a ride.",
 "Let's watch it live. Four phones, four separate identities, one SpacetimeDB database. Nothing here is mocked.",
 "Each phone registered itself with the server. Alex, the organizer, sets up tonight's group with one tap.",
 "Here's the roster. Alex organizes. Sam volunteered to drive and then explicitly accepted that role.",
 "Consent is granular: each person grants each friend specific things, like approximate location or check-ins, for a limited time.",
 "The map only shows people who consented, at the scope they chose. Tonight the coordinates are simulated and labeled as such.",
 "Alex is worried. Sam, the driver, may have been drinking. Alex reports it.",
 "Sam's phone shows 'Do not drive' instantly. That's a deterministic rule inside the database, in the same transaction as the report. No AI in the loop.",
 "The report also opened an incident and woke the agent. Plan version one comes from Nemotron running on NVIDIA NIM, and the model name is right there.",
 "Every tool call is validated against consent and the incident state before it runs, and each one leaves a receipt. The messages are simulated tonight, and the UI says so.",
 "Maya is Sam's primary buddy. She gets the request. And she doesn't respond.",
 "The follow-up timer lives in SpacetimeDB, not in the model. For the demo we advance it instead of waiting the full two minutes.",
 "No reply, so the agent escalates. Plan version two messages Jordan, the backup buddy, with a new confirmation request.",
 "Jordan taps 'I'm on it'. Notice the states stay distinct: sent is not acknowledged, and acknowledged is not resolved.",
 "Now the agent looks up transport and proposes a ride. That takes two tool rounds: it reads the lookup result, then proposes.",
 "Our routing provider was unreachable from this machine, so the plan says 'Provider link only'. The system never invents a route.",
 "Sam picks a ride. The app opens a provider link; a person does the booking. There are no autonomous purchases.",
 "Sam confirms the booking. The agent tells Jordan and waits for pickup.",
 "Pickup confirmed. And only Sam can close this. The agent is not allowed to resolve an incident.",
 "Sam is home, confirmed by Sam. The incident resolves for everyone, and the timeline shows every step and who did it.",
 "Now the technical side. SpacetimeDB is the entire backend. There is no API server.",
 "Sessions, consent, incidents, timers, and agent state are all tables and reducers in a single TypeScript module.",
 "The warning is an event table with row-level security, so only Sam's connection receives it.",
 "Safety rules run first, in one transaction, before any model is called.",
 "Views are consent-scoped. 'I'm okay' never closes an incident. Humans resolve.",
 "The agent itself is a scheduled procedure that calls Nemotron 3.5 Super with a strict tool allowlist.",
 "Tool results are fed back for up to three rounds, and every call is validated before it executes.",
 "Each receipt says who proposed the step: the model, a policy rule, or a simulation.",
 "This is the real plan from tonight's run, with its validated tool receipts.",
 "We tested this. 81 module tests, 93 web tests, and a live four-identity end-to-end run.",
 "Consent revocation, unauthorized access, duplicate events, escalation, prompt injection: all covered.",
 "Nemotron and SpacetimeDB are live today. SMS is simulated until we add Twilio keys.",
 "Adding keys changes nothing in the data model. It only changes who writes the plan.",
 "SafeNight: an NVIDIA Nemotron agentic workflow on a SpacetimeDB backend.",
 "The repo is github.com slash sabharwalainesh slash SafeNight. Thank you.",
]
assert len(VO) == len(caps), (len(VO), len(caps))

def mmss(s): return f"{int(s//60):02d}:{int(s%60):02d}"
rows = ["| Time | On screen (caption) | Suggested voiceover |", "|---|---|---|"]
for c, v in zip(caps, VO):
    rows.append(f"| {mmss(c['start'])} | {c['text']} | {v} |")

md = f"""# SafeNight demo video: narration script

Video: `~/Downloads/SafeNight-demo.mp4` (1920x1080, 30 fps, no audio, burned-in captions). Subtitles: `SafeNight-demo.srt`.
Record your voiceover against the timestamps below; captions are the on-screen text, the right column is a suggested line (1-3 sentences, speak naturally, cut what you don't need).

## Intro to record before the first slide (optional, ~15 s)

1. Hi, we're the SafeNight team.
2. SafeNight helps groups of friends get home together on a night out.
3. It's built on SpacetimeDB as the whole backend, with an NVIDIA Nemotron agent that coordinates real people through real tools.
4. First the product, then a live run with four phones, then how it works under the hood.
5. Everything you'll see runs against a live database; anything simulated is labeled on screen.

## Script

{chr(10).join(rows)}

## Sections

- 00:00 Product: problem, audience, loop, principles, differentiation.
- {mmss(caps[14]['start'])} Live demo: four personas, concern → warning → agent plan → nonresponse → backup → ride → home.
- {mmss(caps[33]['start'])} Technical: architecture, safety engine, agent loop, evidence, what is real vs simulated.
- {mmss(caps[46]['start'])} Close.
"""
(out / "VIDEO_SCRIPT.md").write_text(md)
print(f"wrote {out/'VIDEO_SCRIPT.md'} and {out/'SafeNight-demo.srt'} ({len(caps)} captions)")
