---
id: debug-layout-shift
title: Layout shift and jumping content
category: debugging
summary: Why content jumps while loading (images without dimensions, late fonts, injected banners, lazy embeds) and how to fix each.
intents: [debug, repair, fix]
tags: [debugging, bug, cls, layout-shift, jumping, fonts, images]
phases: [repair, review]
priority: 3
related: [responsive-images, typography-loading]
version: 1
---
**Causes and fixes**
- Images without `width` and `height` (or `aspect-ratio`): add them; the browser reserves space.
- Web fonts swapping with different metrics: use fallback metric overrides (`size-adjust`, `ascent-override`) or `font-display: optional` for display faces.
- Banners or cookie bars inserted above content: reserve space or overlay them at the bottom.
- Embeds and iframes: wrap in an aspect ratio box.
- Skeletons that do not match the final size: match dimensions exactly.
- Animations of `height` or `top`: use transforms.

**Check**: Chrome performance panel "Layout shifts" track or the Web Vitals CLS value; aim below 0.1.
