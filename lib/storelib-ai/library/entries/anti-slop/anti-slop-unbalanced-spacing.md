---
id: anti-slop-unbalanced-spacing
title: Unbalanced spacing
category: anti-slop
summary: Arbitrary spacing values, random section padding, cramped groups next to huge gaps; signals and fixes.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, spacing, padding, margins, whitespace, arbitrary-values]
phases: [concept, build, review]
priority: 3
related: [layout-spacing-rhythm]
version: 1
---
**Signals**: many unique margin and padding values (13px, 27px, 42px, 70px), sections with wildly different padding for no reason, related items far apart and unrelated ones close, padding on phones equal to desktop.

**Evaluator checks**: unique spacing values in CSS and how many are off the 4px grid; section padding variance; absence of smaller spacing in phone media queries.

**Fix**: a spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128) as tokens; fluid section padding with clamp; proximity rules (closer inside a group, larger between groups). Deliberate variation (a tight band, a spacious hero) is fine when named in the concept.
