---
id: typography-loading
title: Web font loading and performance
category: typography
summary: How many font files to load, font-display, preloading, fallbacks with matched metrics, and avoiding layout shift.
intents: [performance, build-site, debug]
tags: [font-loading, performance, font-display, cls, fallback, preload]
components: [typography]
phases: [build, repair]
priority: 3
related: [debug-layout-shift, typography-pairings]
version: 1
---
- **Budget**: at most 4 font files on first load (for example display 600, body 400, body 400 italic, body 700). A variable font counts as one file per axis set.
- **font-display**: `swap` for body text so text shows immediately; `optional` for decorative display faces on slow connections.
- **Preload** only the one or two files used above the fold: `<link rel="preload" as="font" type="font/woff2" href="..." crossorigin>`.
- **Fallback metrics**: define a fallback with adjusted metrics to avoid layout shift when the web font arrives.

```css
@font-face { font-family: "Body Fallback"; src: local("Arial"); size-adjust: 104%; ascent-override: 92%; descent-override: 24%; }
body { font-family: "Inter", "Body Fallback", system-ui, sans-serif; }
```

- **Subsetting**: use the Latin subset unless the site needs other scripts; check the creator's language.
- In Storelib sections, use the theme's font settings or families the theme loads; do not add arbitrary remote font URLs from section code.
