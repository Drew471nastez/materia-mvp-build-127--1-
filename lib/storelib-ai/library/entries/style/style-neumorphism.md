---
id: style-neumorphism
title: Neumorphism (when it is asked for)
category: style
summary: Soft extruded surfaces made with paired light and dark shadows; low contrast by nature, so use sparingly and fix affordances.
intents: [choose-style, build-site, redesign]
tags: [neumorphism, soft-ui, embossed, extruded, soft-shadow]
styles: [neumorphism, soft-ui]
phases: [concept, plan, build]
priority: 3
related: [anti-slop-relative-judgement, color-contrast-rules]
version: 1
---
**Default stance**: rarely right for a whole site; its low contrast hurts readability and makes buttons hard to see. Use for one tactile element (a player control, a toggle) or when explicitly asked.

**Specs**: background and element share one colour (e.g. `#e8ebef`); shadows `8px 8px 16px #c5c8cc, -8px -8px 16px #ffffff`; pressed state uses inset shadows; radius 12 to 24px.

**Fix the affordance**: interactive elements need something beyond shadow: a text label with full contrast, an icon at 3:1, and a visible focus ring (2px solid accent with offset). Disabled must look different from enabled by more than shadow.

**Don't**: build forms with neumorphic inputs only (borders invisible), or rely on shadow alone for state.
