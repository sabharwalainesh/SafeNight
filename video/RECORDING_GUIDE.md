# SafeNight: reference-matched recording guide

Runtime **2:59**, matching the reference's chapter boundaries exactly: **0:00 / 0:18 / 0:48 / 1:18 / 2:00 / 2:24 / 2:59**. This follows the reference's narrative functions, not its unrelated wildfire content or claims.

No existing SafeNight footage was supplied or found in the project's media folders. Every missing shot is a plain black instruction card. There are no recreated app screens or repeated opening shots. Statistics and rationale cards are included; the proposed call/handoff footage must retain simulation labels. The app was inspected in mock mode; its actual screens must be recorded before replacing the cards.

## Drop-in workflow

1. Put the listed clips in `public/clips/`. Every filename is unique and used only once.
2. Put five spoken chapter mixes (02–06); chapter 01 uses the included music and ambience. Save audio in `public/audio/`, using the chapter filenames below (WAV, MP3, or M4A). Alternatively use one continuous `voiceover.wav`.
3. Follow each shot's timed reading window. Subtitles are burned in and also exported as SRT/VTT. Current cue times are a script-timed draft, not audio-aligned captions. After recording, edit `src/subtitles.json` to align them with speech, then run `npm run guide` to refresh SRT/VTT without overwriting timings.
4. Double-click `Preview.command` to review, then `Render.command` to export once footage and narration are complete. `npm run preview` renders a review copy with any missing shots left as instruction cards.

Clips start at their first frame, never loop, and are contained without cropping. Capture at least each slot's duration; extra footage is trimmed. All source video audio is muted, so narration comes from the voiceover files. If using an interview's original audio, include it in the edited chapter voiceover and replace that section's script and captions with the speaker's actual words. Do not invent interviews or quotes.

## 0:00–0:18 · A night changes

Reference section: **Anthony Mitchell and the Eaton Fire**. Voiceover file: `01-story.wav` (18 seconds maximum). No narration is needed for this chapter; score and ambience are included.

### Read aloud

**0:00–0:09**

[No narration. [Upbeat music]]

**0:09–0:18**

[No narration. [Music stops. Quiet night ambience.]]

### Footage

- **0:00–0:09:** Film Maya laughing with friends indoors. Establish her face and a distinctive jacket. Warm light; 2–3 short shots within this single 9-second clip. Original upbeat music is included. Save as `01-friends.mp4` (9s, landscape).
- **0:09–0:18:** Hard cut to the SAME actor in the SAME jacket outside. Cool light, quiet surroundings, glance at phone. Use a controlled filming location. No repeated party footage. Save as `02-outside.mp4` (9s, landscape).

## 0:18–0:48 · Why SafeNight

Reference section: **What firefighters told us**. Voiceover file: `02-context.wav` (30 seconds maximum).

### Read aloud

**0:18–0:30**

In a 2019 survey across thirty-three universities, thirteen percent of student respondents reported nonconsensual sexual contact involving force or inability to consent since enrolling.

**0:30–0:40**

In a separate 2024 survey, one in four full-time college students aged eighteen to twenty-five reported binge drinking in the past month.

**0:40–0:48**

These figures describe different risks, not a causal link. SafeNight is designed to turn a request for help into an acknowledged response.

### Footage

- **0:18–0:30:** Included animated statistic. Source and population stay visible.
- **0:30–0:40:** Included statistic. Separate population and timeframe; do not imply drinking causes victimization.
- **0:40–0:48:** Included animated design rationale. This is the product goal, not an effectiveness claim.

## 0:48–1:18 · Maya asks for help

Reference section: **A warning call from Standard Response**. Voiceover file: `03-request.wav` (30 seconds maximum).

### Read aloud

**0:48–0:54**

Back outside, Maya opens SafeNight and taps, I feel unsafe.

**0:54–0:58**

In this proposed flow, SafeNight calls her.

**0:58–1:08**

SafeNight: Maya, this is SafeNight responding to your request. You shared the east entrance. Is that correct, and are you safe?

**1:08–1:13**

Maya: That’s right. I don’t feel safe. Please contact campus safety.

**1:13–1:18**

SafeNight: I’ll send your confirmed location and request. I’m waiting for their acknowledgment.

### Footage

- **0:48–0:54:** Same actor and exterior. Over-shoulder shot opening SafeNight and tapping the unsafe/help action. If exact wording is unavailable, use a labeled prototype; never pass it off as the implemented UI. Save as `06-unsafe.mp4` (6s, landscape).
- **0:54–0:58:** Film the same actor answering a staged call. Use only test devices. Proposed voice integration; label simulation. Save as `07-incoming-call.mp4` (4s, landscape).
- **0:58–1:08:** Film Maya listening on the phone. Record the AI lines in the chapter audio. Use fictional name and location, with the actor’s response next. Save as `08-call-check.mp4` (10s, landscape).
- **1:08–1:13:** Same actor answers naturally. This explicitly authorizes the staged campus-safety request; no real service is contacted. Save as `09-call-reply.mp4` (5s, landscape).
- **1:13–1:18:** Hold on the same actor listening. Do not imply help has arrived or an institution has accepted the request. Save as `10-call-confirm.mp4` (5s, landscape).

## 1:18–2:00 · Handoff, then inside the app

Reference section: **Calling every home at once**. Voiceover file: `04-workflow.wav` (42 seconds maximum).

### Read aloud

**1:18–1:26**

The proposed handoff sends the confirmed details to an authorized campus-safety channel. This demonstration uses a simulated receiver.

**1:26–1:38**

Now let’s look inside SafeNight. A Night Out connects the group. Each person chooses their sharing permissions and approved contacts before the night begins.

**1:38–1:50**

The incident timeline brings requests, responses, plans, and tool receipts together. Simulated actions stay labeled, so the demo separates the working interface from proposed integrations.

**1:50–2:00**

An approved friend can acknowledge the request. The group can see the difference between a message being sent and someone agreeing to help.

### Footage

- **1:18–1:26:** Add a staged test-receiver capture: Maya requested help; east entrance confirmed; timestamp; callback; acknowledgment pending. Mark SIMULATED throughout. No live police, dispatch, or campus-safety messages. Save as `11-handoff.mp4` (8s, landscape).
- **1:26–1:38:** Record the actual Night Out group, membership, and approved buddies. Maya is the protagonist throughout. Preserve mock-data labels. Save as `12-app-group.mp4` (12s, portrait).
- **1:38–1:50:** Record the real incident panel with plan versions and tool receipts. Keep simulated labels. Do not imply the staged phone call is implemented. Save as `13-app-incident.mp4` (12s, landscape).
- **1:50–2:00:** Record the actual approved-buddy acknowledgment, with the same Maya incident if supported. If unavailable, leave this card until recorded. Save as `14-app-response.mp4` (10s, portrait).

## 2:00–2:24 · Permissions and coordination

Reference section: **Languages and fire-aware routing**. Voiceover file: `05-capabilities.wav` (24 seconds maximum).

### Read aloud

**2:00–2:12**

Location sharing stays scoped and visible. The response uses information the person chose to share, and keeps stale updates distinct from confirmed details.

**2:12–2:24**

Nemotron is intended to interpret context and coordinate permitted tools. SpacetimeDB owns the durable state, permissions, and follow-up logic. Immediate alerts stay independent of AI.

### Footage

- **2:00–2:12:** Record actual per-person consent controls and update timestamps. Do not revoke consent during an active recording unless demonstrating that behavior. Save as `15-permissions.mp4` (12s, portrait).
- **2:12–2:24:** Record actual permitted tool receipts and follow-up state. Label the simulated planner unless live Nemotron is verified. Save as `16-coordination.mp4` (12s, landscape).

## 2:24–2:59 · Human-confirmed outcome

Reference section: **Dispatch and results**. Voiceover file: `06-outcome.wav` (35 seconds maximum).

### Read aloud

**2:24–2:36**

A sent message is not a completed handoff. The workflow tracks acknowledgment and keeps unresolved needs visible until a person confirms who is taking responsibility.

**2:36–2:48**

When Maya can confirm her status, she checks in explicitly. The incident closes through human confirmation, rather than assuming a location update means everything is okay.

**2:48–2:55**

One timeline: the request, the response, the handoff, and the confirmed outcome.

**2:55–2:59**

SafeNight. Go out together. Get home together.

### Footage

- **2:24–2:36:** Record the actual approved-buddy response or a clearly simulated institutional acknowledgment. Do not equate message delivery with responder acceptance. Save as `17-human-handoff.mp4` (12s, portrait).
- **2:36–2:48:** Film the same actor with an approved friend, then the actual human-confirmation action. Use the UI’s real wording; preserve prototype labels if needed. Save as `18-resolution.mp4` (12s, landscape).
- **2:48–2:55:** Record the actual timeline. Avoid invented response-time or safety-improvement numbers. Save as `19-evidence.mp4` (7s, landscape).
- **2:55–2:59:** Included closing card.

## Accuracy before submission

Keep mock and simulated labels visible in app recordings. The opening follows one actor, Maya, from a happy gathering to an exterior help request. The voice call and institutional handoff are PROPOSED and SIMULATED, not verified capabilities. Use a simulated receiver, never real dispatch, for filming. The app walkthrough begins at 1:26. Only claim live Nemotron/API execution when your footage proves it. No results statistics are invented. The last section shows observable workflow outcomes.

Included original score: `opening-happy.wav` plays from 0:00–0:09 and cuts instantly; `outside-ambience.wav` plays from 0:09–0:18. Regenerate with `npm run music`. Optional `music.mp3` starts at 1:26, never over the staged call. Spoken captions are editable in `src/subtitles.json`; `npm run subtitles:reset` deliberately resets all cue timings from the script.
