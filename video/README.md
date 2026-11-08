# SafeNight cinematic story cut

**2:59 · 30fps · 1080p final · subtitles included.** Keeps the reference chapter boundaries while following the updated single-person story.

| Time | Picture | Sound |
|---|---|---|
| 0:00–0:09 | Maya laughing with friends, warm interior | Included original upbeat instrumental; no narration |
| 0:09–0:18 | Hard cut: SAME Maya, SAME jacket, outside in darkness | Music stops instantly; included quiet exterior texture |
| 0:18–0:40 | Two sourced, animated statistics | Narrator; source years and populations visible |
| 0:40–0:48 | Why SafeNight: request → confirmation → coordinated response | Narrator; no effectiveness claim |
| 0:48–0:58 | Back to Maya, unsafe action, incoming call | Narrator introduces the proposed call |
| 0:58–1:18 | Call confirms location and safety; Maya asks for campus-safety help | Alternating SafeNight/Maya dialogue; simulation label |
| 1:18–1:26 | Message to a simulated campus-safety receiver | Narrator; acknowledgment still pending |
| 1:26–2:24 | Full app walkthrough: group, timeline, buddy response, consent, agent/backend | Narrator |
| 2:24–2:55 | Handoff, Maya's explicit confirmation, completed timeline | Narrator |
| 2:55–2:59 | Closing card | Tagline |

No filming or actual app recordings have been supplied. Those slots remain plain black instruction cards with unique filenames, duration, and exact shot directions. Statistics, rationale, closing graphics, music, and subtitle timing are included. The call and authority messaging are **proposed, simulated functionality**, not verified features. No external messages are sent by this video project.

## Add your footage and voices

1. Read [RECORDING_GUIDE.md](RECORDING_GUIDE.md). Use the **same actor, outfit, phone, and exterior location** throughout the story. Film the scene safely with your crew; the character is alone, not the actor.
2. Add the 16 unique clip files to `public/clips/`. Capture at least each slot's duration. Clips never loop; extra footage is trimmed.
3. Add five chapter audio mixes (`02-context`, `03-request`, `04-workflow`, `05-capabilities`, `06-outcome`) as WAV/MP3/M4A in `public/audio/`. The first chapter has music/ambience only. For the call chapter, record both speakers in the guide's time windows. Or supply one continuous `voiceover.wav` with the first 18 seconds silent.
4. Source-video audio is muted. Put the actors' dialogue into the chapter audio mix. The supplied score stops at 0:09; optional `music.mp3` begins only at 1:26.
5. Review in `Preview.command`; export with `Render.command` after assets are complete.

```sh
cd /Users/aineshsab/SafeNight/video
npm ci                   # fresh setup only
npm run music            # regenerate included original score and ambience
npm run dev              # interactive timeline
npm run preview          # review copy with missing-footage cards
npm run render           # full 1080p export; requires clips and spoken audio
npm run check            # media/duration check
npm run typecheck
npm test                 # timing, unique clips, subtitle/script coverage
```

New outputs: `out/SafeNight-story-cut-preview.mp4` and `out/SafeNight-story-cut-final.mp4`. Previous reference-cut/animation previews are superseded.

## Subtitles and source data

Subtitles are burned in, with speaker labels for the staged call and accessible sound cues for the opening. `SafeNight-subtitles.srt` and `.vtt` are included. Times currently follow the script, not recorded speech. Edit `src/subtitles.json` to align with your audio, then run `npm run guide` to refresh exports without replacing timings. `npm run subtitles:reset` deliberately regenerates cues from `src/film.json` and overwrites manual alignment.

[SOURCES.md](SOURCES.md) documents the statistics and limitations. Preserve the study year, population, and measurement period. These are context for the design, not evidence of product effectiveness. Keep the proposed-call/handoff labels; only replace them after those integrations are implemented and demonstrated through authorized test channels.

The original score is synthesized by `scripts/music.py` without samples. Regenerate it if copying the project, because media and exports are git-ignored. Node 22+ and FFmpeg/ffprobe are required for export/checks. Fonts are local. Remotion license: https://www.remotion.dev/docs/license
