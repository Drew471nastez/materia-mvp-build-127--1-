---
id: layout-full-bleed
title: Full bleed sections
category: layout
summary: Edge to edge images and bands: when to use them, safe text placement, height rules with svh, and the content grid inside.
intents: [design-hero, build-section, layout]
tags: [full-bleed, edge-to-edge, full-width, hero, banner, immersive]
components: [hero, banner, image]
phases: [plan, build]
priority: 4
related: [hero_immersive, layout-split]
version: 1
---
**Use for**: an opening image that is the experience (venues, fashion campaigns, landscapes), a rhythm break between dense sections, a closing call to action.

**Height**: avoid `100vh` on phones (browser bars change it). Use `min-height: 100svh` for a full first screen, or 70 to 85svh to hint there is more below. Never fixed pixel heights that crop on tall phones.

**Text on images**: place text where the image is calm (art direction), add a gradient scrim only behind the text area, and keep it inside the content grid so it aligns with the rest of the page.

```css
.bleed { position: relative; min-height: 85svh; display: grid; align-items: end; }
.bleed img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.bleed .inner { position: relative; padding: clamp(24px, 5vw, 64px); max-width: 1200px; margin-inline: auto; width: 100%; }
.bleed::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.55), transparent 55%); }
.bleed .inner { z-index: 1; }
```

**Art direction**: provide a different crop for phones with `<picture>` when the subject would be lost in a portrait crop. Use `object-position` to keep faces in frame.
