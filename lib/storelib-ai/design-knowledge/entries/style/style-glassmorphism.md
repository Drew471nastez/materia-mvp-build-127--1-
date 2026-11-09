---
id: style-glassmorphism
title: Glassmorphism (when it is asked for)
category: style
summary: Frosted translucent panels over rich backgrounds; only when the concept calls for it, with readable contrast and a solid fallback.
intents: [choose-style, build-site, redesign]
tags: [glassmorphism, glass, frosted, blur, translucent, backdrop]
styles: [glassmorphism, glass, frosted]
phases: [concept, plan, build]
priority: 3
related: [anti-slop-relative-judgement, style-dark-cinematic]
version: 1
---
**Default stance**: avoided unless the brief or concept asks, because it is one of the most common machine defaults. When it is chosen, do it well.

**Needs a real background**: glass only reads over a photo, video or a colourful field. Over a flat grey it is just a faint box.

**Specs**: `backdrop-filter: blur(16px) saturate(140%)`, background `rgba(255,255,255,.12)` to `.2` on dark or `rgba(255,255,255,.55)` to `.7` on light, 1px border `rgba(255,255,255,.25)`, radius 12 to 20px.

**Contrast**: test text against the busiest part of the background behind the panel. Increase panel opacity until body text passes 4.5:1.

**Fallback and performance**: `@supports not (backdrop-filter: blur(1px))` gives a solid background; avoid more than two or three blurred layers on screen (blur is costly on phones); never animate the blur radius.

```css
.glass { background: rgba(255,255,255,.6); }
@supports (backdrop-filter: blur(1px)) { .glass { background: rgba(255,255,255,.18); backdrop-filter: blur(16px) saturate(140%); } }
```
