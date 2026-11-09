---
id: color-dark-mode
title: Dark palettes and dark sections
category: color
summary: Building dark surfaces with layered greys, reducing saturation of accents, image treatment and contrast pitfalls on dark backgrounds.
intents: [choose-palette, build-section]
tags: [dark-mode, dark, night, surfaces, elevation]
styles: [dark-cinematic]
phases: [plan, build]
priority: 3
related: [style-dark-cinematic, color-contrast-rules]
version: 1
---
- **Not pure black** for large areas: `#0e0e10` to `#161618`. Pure black next to white text causes halation for many readers.
- **Elevation by lightness**, not shadow: background `#0e0e10`, surface `#18181b`, raised `#222226`. Shadows barely show on dark.
- **Text**: off white `#ecebe8` for body, `#a1a1a6` for muted (check 4.5:1).
- **Accents**: desaturate slightly; fully saturated colours vibrate on dark. Pastels or warm metallics read better.
- **Borders**: `rgba(255,255,255,.08)` to `.14`.
- **Images**: reduce the brightness of very bright photos a little (`filter: brightness(.92)`) so they do not overpower; never invert.
- **Mixed pages**: alternating light and dark sections creates rhythm (the Storelib presets' sectionRhythm does this). Two dark sections in a row are fine; switching every section is tiring.
