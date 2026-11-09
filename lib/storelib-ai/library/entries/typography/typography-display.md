---
id: typography-display
title: Display type and big headlines
category: typography
summary: Using oversized type safely: fitting long words, mixed styles in a heading, outlined text, and keeping the action in view on phones.
intents: [design-hero, fix-typography, choose-style]
tags: [display, headline, big-type, hero-type, oversized, outline-text]
components: [hero, typography]
phases: [build, review]
priority: 4
related: [style-typography-led, typography-scale]
version: 1
---
**Size**: big type works when the words are few. A five word heading can be 12vw; a fourteen word heading cannot. Write the heading first, then size it.

**Fitting**: check the longest word at 320px. German, Dutch and product names break layouts. Use `overflow-wrap: anywhere` as a safety net and lower the clamp minimum until the longest word fits.

**Mixed styles**: one line can mix a serif italic and a grotesk, or two weights. Mark it with real elements so it stays editable:

```html
<h1 class="display">Strength for <em>the long run</em></h1>
```
```css
.display em { font-family: var(--font-serif); font-style: italic; font-weight: 400; }
```

**Outlined text**: `-webkit-text-stroke: 1.5px currentColor; color: transparent;` fails contrast for reading; use it for one decorative word next to solid text, never for content people must read.

**Phones**: a giant heading must not push the primary action below the first screen. Measure: heading plus subline plus button within about 560px of height at 375px wide.

**Don't**: gradient text by default, all caps sentences longer than four words, letter spacing above 0 on large display lowercase.
