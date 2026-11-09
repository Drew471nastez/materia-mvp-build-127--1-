---
id: layout-editorial-columns
title: Editorial columns and long reads
category: layout
summary: Magazine style text layouts: a reading column, side notes, pull quotes, inset and breakout images, and multi column text where it helps.
intents: [build-section, layout, blog]
tags: [editorial, columns, long-read, article, pull-quote, sidenotes, breakout]
components: [article, typography]
capabilities: []
phases: [build]
priority: 3
related: [style-editorial, typography-tracking-measure]
version: 1
---
**The named grid pattern** gives a reading column with breakout options:

```css
.article { display: grid; grid-template-columns: [full-start] minmax(16px, 1fr) [wide-start] minmax(0, 120px) [text-start] min(65ch, 100% - 32px) [text-end] minmax(0, 120px) [wide-end] minmax(16px, 1fr) [full-end]; }
.article > * { grid-column: text; }
.article > .wide { grid-column: wide; }
.article > .full { grid-column: full; }
```

**Pull quotes**: set at 1.5 to 2x body, in italic or the display face, pulled into the margin on desktop; only real sentences from the text, never invented quotes.

**Side notes**: on desktop, float notes into the right margin (`float: right; margin-right: -14rem; width: 12rem;`); on phones, render inline in a muted box.

**Multi column text** (`columns: 2`) only for short, self contained text like an introduction or a menu; never for long text people must scroll up and down to read.

Blog posts in Storelib come from the blog (`article.content`); style the content with element selectors scoped to the section.
