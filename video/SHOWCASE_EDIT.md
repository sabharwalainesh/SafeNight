# SafeNight product showcase — 3:00

Current deliverable: `out/SafeNight-product-showcase-review.mp4`, 1920×1080, 30 fps. Your voiceover is pending. Music and scripted subtitles are included to review the timing; they do not substitute for a recorded voice.

## Edit

| Time | On screen |
|---|---|
| 0:00–0:27.3 | Original party-to-outside skit; original dialogue |
| 0:27.3–0:40 | Friendly festival connectivity statistics: group chats, phone calls, live location |
| 0:40–0:47 | Actual group roster and check-in timeline; pause, play scroll, pause |
| 0:47–0:52 | Invite share, Come to me, Driver concern and Venue reports cards; held close-up |
| 0:52–0:57 | Actual group messages and help alert |
| 0:57–1:04 | Help screen and contextual agent summary; held close-up |
| 1:04–1:12 | Proposed response, accept control and backup-call option |
| 1:12–2:00.8 | Original incoming call, Alex's response and Jordan's alert skit |
| 2:00.8–2:07 | Dijkstra shortest-path search animation; match transition into recorded map |
| 2:07–2:18 | Group map, walking route, turn list and full-screen map |
| 2:18–2:25 | Compass, direction, distance and pause-walking control |
| 2:25–2:34 | Group acknowledgment followed by the direct conversation with Maya |
| 2:34–2:47 | Animated technology stack |
| 2:47–2:55 | Position and distance updating along the walking route |
| 2:55–3:00 | Closing tagline |

## Product footage

All product shots come from `/Users/aineshsab/Downloads/ScreenRecording_11-08-2026 07-38-03_1.mov`. The earlier simulator footage is no longer used. The recording is 69.42 seconds, 1206×2622, and contains a labeled demo with simulated friends and scripted agent output. These labels remain visible; the edit does not claim this recording proves a live model invocation.

The device view and enlarged detail play the same prepared video in sync. The group shot holds the roster, plays the scroll, then holds the timeline. The quick-actions, messages, plan, acceptance and compass shots include held frames so the narration can explain the visible control. The map and walking-progress shots retain movement. No product UI was drawn or fabricated.

Coverage includes every feature visibly demonstrated in the recording: group/status sharing, timeline, quick-action entry points, alerts, group and direct conversations, contextual help plan, acceptance, map/route, expanded map, turn list, compass, pause control and moving location/distance. Unopened quick-action cards are shown as entry points, not presented as fully demonstrated flows. The footage does not show a completed arrival or safe/home confirmation, so the ending says “close the distance,” not “confirmed safe.”

The animated graph actually computes Dijkstra distances and a shortest path on a small illustrative street graph. It represents route search visually; it is not a claim that the app's routing provider uses that exact implementation. The animation is labeled “Route-search illustration.” The recorded map retains OpenStreetMap attribution.

## Voice and audio

Read [SHOWCASE_VOICEOVER.md](SHOWCASE_VOICEOVER.md). There are about 270 words covering all 104 seconds outside the skits. Record one continuous take with pauses between sections, or separate clips. Your recording will replace the pending narration; no synthetic version of your voice is included. Narration captions are script-timed until then. The skits keep their original recorded dialogue and timed captions.

For export, the thirteen narration sections are normalized WAV files in `public/audio/narration/`, named after the IDs in `src/narration.json`. Final export fails if one is missing or too long. `public/audio/statistics.wav` from the old edit is no longer loaded.

## Editing and checks

- `src/showcase.json`: scene timing and enlarged-detail crop coordinates.
- `src/Showcase.tsx`, `product.css`, `showcase.css`: footage composition and animations.
- `src/RouteSearch.tsx`: Dijkstra illustration and transition.
- `src/narration.json`: voiceover slots and script.
- `src/showcase-captions.json`, `SHOWCASE_SUBTITLES.srt`: burned-in captions and editable sidecar.
- `scripts/product-assets.py`: prepare clips and freeze frames from your recording.

Run `npm run typecheck`, `npm run check`, and `npm run preview`. After adding the narration and aligning captions, run `npm run render`. Original files in Downloads are unchanged. No outbound calls or messages were initiated for this revision.
