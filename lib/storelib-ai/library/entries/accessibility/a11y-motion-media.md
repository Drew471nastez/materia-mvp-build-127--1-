---
id: a11y-motion-media
title: Motion, media and sensory accessibility
category: accessibility
summary: Vestibular safety, pausing moving content, flashing limits, captions and transcripts, and audio etiquette.
intents: [add-motion, review, fix-accessibility]
tags: [reduced-motion, vestibular, captions, transcripts, flashing, autoplay]
components: [media-player, carousel, marquee]
phases: [build, review]
priority: 4
related: [motion-principles, component-media-player, motion-marquee]
version: 1
---
- **prefers-reduced-motion**: remove parallax, large movement, zooms and auto advancing; keep instant state changes and fades under 200ms if needed.
- **Pause, stop, hide**: anything that moves, blinks or scrolls automatically for over 5 seconds (marquees, carousels, background video) needs a pause control.
- **Flashing**: nothing flashes more than three times per second; avoid strobe effects even for nightlife sites.
- **Video**: captions for speech; audio description or a text alternative for important visual information; transcripts for podcasts and long audio.
- **Autoplay**: never with sound. Muted background video only, paused under reduced motion, with a pause button.
- **Large scrolling effects**: provide a way to read the content without them (static fallback).
