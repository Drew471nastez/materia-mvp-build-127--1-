---
id: footer-big-type
title: Big type footer
category: footer
summary: An oversized wordmark or statement filling the footer width; fitting it responsively and keeping links usable.
intents: [design-footer, build-section]
tags: [footer, big-type, wordmark, oversized, statement]
components: [footer]
phases: [plan, build]
priority: 3
related: [style-typography-led, footer-editorial]
version: 1
---
**Pattern**: the brand name set across the full width at the bottom (often 15 to 25vw), with links and legal above it.

**Fitting the width**: size with viewport units and tune by the word length, or use an SVG `<text>` with `textLength` and `viewBox` so it always spans exactly.

```css
.wordmark { font-size: clamp(3rem, 19vw, 22rem); line-height: .8; letter-spacing: -.04em; white-space: nowrap; overflow: hidden; }
```

**Accessibility**: the giant wordmark is decorative if the brand name appears elsewhere: `aria-hidden="true"`.

**Don't**: crop letters so the name becomes unreadable unless the concept explicitly wants a cropped mark.
