---
id: style-neo-brutalism
title: Neo brutalism
category: style
summary: Bright flat colour, thick black outlines, hard offset shadows and chunky type; friendly and loud.
intents: [choose-style, build-site, redesign]
tags: [neo-brutalism, neobrutalism, bold, offset-shadow, flat-colour, playful-brutal]
styles: [neo-brutalism, neobrutalism]
phases: [concept, plan, build]
priority: 3
related: [style-brutalism, style-playful, bold_signal]
version: 1
---
**Signals**: 2 to 3px black borders on everything interactive, hard offset shadows (`4px 4px 0 #000`, no blur), saturated flat fills (yellow `#ffd84d`, pink `#ff7ab6`, cyan `#5ce1e6`), chunky grotesk or rounded display, slight radius (0 to 8px).

**Interaction**: buttons press down: on active, move by the shadow offset and remove the shadow. Hover can lift by 2px. This makes it feel physical.

```css
.btn { border: 3px solid #111; box-shadow: 4px 4px 0 #111; transition: transform .12s, box-shadow .12s; }
.btn:hover { transform: translate(-1px,-1px); box-shadow: 5px 5px 0 #111; }
.btn:active { transform: translate(4px,4px); box-shadow: 0 0 0 #111; }
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
```

**Use for**: creators with playful brands, indie products, kids and education, zines.

**Limits**: two or three fill colours, not seven. Body text stays on a calm background. Offset shadows on everything becomes noise; reserve them for interactive elements and one or two feature panels.
