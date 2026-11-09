---
id: color-contrast-rules
title: Contrast rules that are not negotiable
category: color
summary: WCAG thresholds for text, large text, UI components and focus, common failures (grey on white, text on photos) and fixes.
intents: [choose-palette, review, fix-accessibility]
tags: [contrast, wcag, accessibility, legibility, overlay]
phases: [build, review, repair]
priority: 5
related: [a11y-checklist, color-palettes-by-mood]
version: 1
---
- Body text: at least **4.5:1**. Large text (24px regular or 18.66px bold and up): at least **3:1**.
- Interactive component boundaries and icons that convey meaning: **3:1** against adjacent colours.
- Focus indicator: **3:1** against both the component and the background.
- Placeholder text is still text: 4.5:1 if it carries information, and never the only label.
- Disabled controls are exempt, but must still look clearly disabled.

**Common failures and fixes**
- `#999` on white is 2.8:1. Use `#595959` (7:1) or `#6b6b6b` (5.3:1) for muted text.
- White text on a photo: add an overlay sized to the text area (`linear-gradient(to top, rgba(0,0,0,.6), transparent 60%)`) or a solid backing; check the brightest part of the image behind the text.
- Accent buttons: a light accent (yellow, mint) needs dark button text. Compute; do not guess.
- Dark mode muted text: `#8a8a8a` on `#0e0e10` passes; `#666` does not.

The Storelib theme has a contrast checker (lib/storelib-theme/contrast.ts); colour schemes must pass its read pairs.
