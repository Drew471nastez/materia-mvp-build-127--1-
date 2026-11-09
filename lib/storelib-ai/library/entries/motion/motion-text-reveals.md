---
id: motion-text-reveals
title: Text reveals
category: motion
summary: Line and word reveals for headlines with accessible markup, timing, and when not to animate text.
intents: [add-motion, build-section, animation]
tags: [motion, animation, text, reveal, split-text, headline, typewriter, mask]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-stagger, typography-display]
version: 1
---
**Line mask reveal**: each line slides up from behind a mask (`overflow: clip` on a line wrapper, inner span from translateY(100%) to 0), 600 to 800ms, 60 to 90ms stagger.

**Accessibility**: splitting text into spans can make screen readers read word by word. Keep the real text in the heading and hide the split copy from assistive tech:

```html
<h2 class="reveal"><span class="sr-only">Built for the long run</span><span aria-hidden="true" class="lines">...</span></h2>
```

**Limits**: headlines only (up to about 10 words). Never animate body text, prices, dates or legal copy. No typewriter effects for important information; they delay reading.

**Editor**: text inside a reveal must still come from settings so the creator can edit it.
