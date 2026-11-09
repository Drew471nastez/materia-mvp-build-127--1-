---
id: component-media-player
title: Audio and video players
category: component
summary: Audio previews and video: native controls or custom ones that are accessible, one player at a time, no autoplay with sound.
intents: [build-component, build-section]
tags: [audio, video, player, preview, waveform, embed]
components: [media-player, audio, video]
capabilities: []
phases: [build, review]
priority: 4
related: [industry-music-producer, motion-performance]
version: 1
---
**Video**: `<video controls playsinline preload="metadata" poster="...">`. Background loops only muted, short (under 20s), compressed (under 3 to 5MB), paused when off screen and under reduced motion, with a visible pause button. Provide captions for speech.

**Audio previews** (sample packs, beats): a play button per track with the track name as its label, duration, progress that can be scrubbed by pointer and keyboard (`input type="range"` styled works well), and only one track playing at a time.

```js
root.querySelectorAll('audio').forEach(a => a.addEventListener('play', () => root.querySelectorAll('audio').forEach(o => o !== a && o.pause())));
```

**Custom controls**: `<button aria-pressed>` or label switch Play and Pause; announce state; keyboard Space toggles when focused.

**Embeds** (YouTube, Vimeo, SoundCloud): use Storelib's allowed embed path; lazy load with a click to load facade showing the poster to save weight; title attribute on iframes.

**Never** autoplay audio.
