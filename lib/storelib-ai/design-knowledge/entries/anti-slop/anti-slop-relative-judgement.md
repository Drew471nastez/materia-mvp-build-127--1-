---
id: anti-slop-relative-judgement
title: Judging slop relative to the concept
category: anti-slop
summary: Slop is a choice made by default, not a banned technique; how the evaluator and the agent weigh a finding against the declared visual concept.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, concept, relative, allowances, judgement]
phases: [concept, build, review]
priority: 5
related: [core-visual-concept-first, style-combining]
version: 1
---
Nothing on these lists is forbidden. A gradient, a pill button, glass panels, a bento grid or a marquee can all be right. They become slop when they appear **because they are the default**, not because the concept chose them.

**How judgement works**
- The visual concept declares styles, signature moves and explicit allowances (`allow: ["gradients", "glass"]`). A finding that matches an allowance is downgraded to info.
- Style implies allowances: glassmorphism allows blur; neo brutalism allows offset shadows and thick borders; playful allows pills and larger radius; dark cinematic allows dark backgrounds and a single soft light; experimental allows unusual layout and motion.
- What the creator explicitly asked for always wins.
- Some findings are never excused by a concept: fabricated proof, weak mobile, missing reduced motion, empty marketing words, contrast failures.

**When reviewing**: for each finding, ask "did the concept choose this?" If yes, check it is executed well (see the style entry). If no, apply the fix.

The evaluator lives at `lib/storelib-ai/design-knowledge/slop.ts` (`evaluateSlop`).
