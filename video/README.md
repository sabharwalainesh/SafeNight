# SafeNight — product showcase

A three-minute edit using the seven skit clips and the supplied iPhone app screen recording. Product sections use synchronized close-ups, freeze frames and an animated route-search transition. Your voiceover is pending.

- [Watch the timeline / edit notes](SHOWCASE_EDIT.md)
- [Record your complete voiceover](SHOWCASE_VOICEOVER.md)
- [Editable subtitles](SHOWCASE_SUBTITLES.srt)
- [Friendly statistic sources](SOURCES.md)

```sh
npm ci
npm run typecheck
npm run check
npm run preview
```

Review: `out/SafeNight-product-showcase-review.mp4`, 1920×1080, 30 fps, 180 seconds. Final: `npm run render` after narration files are present in `public/audio/narration/` and captions are aligned. `npm run dev` opens the editable timeline.

The original footage remains unchanged in Downloads. Media and outputs are local and git-ignored. Older instructions in `LEGACY_README.md` do not describe this cut.
