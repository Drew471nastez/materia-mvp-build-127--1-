---
id: anti-slop-pill-badges
title: Pill badge overuse
category: anti-slop
summary: Rounded chips above headings, on cards and in heroes that carry no information; when a badge is useful.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, pills, badges, chips, eyebrow, tags]
phases: [concept, build, review]
priority: 3
related: [typography-hierarchy-labels, anti-slop-excessive-radius]
version: 1
---
**The pattern**: a pill above every heading ("Features", "Pricing", "Why us"), badges on every card ("New", "Popular") without data, rows of tag chips as decoration, numbered chips 01 02 03.

**Evaluator checks**: elements with `border-radius` of 999px or 9999px or `rounded-full` with short text and a background, counted per page and per section.

**Fix**: delete badges that repeat the heading. Keep badges that show real state from data (Sold out, In stock, a real category filter). Labels that carry information can stay as plain small text (no pill).

**Allowed by**: playful and creator concepts where pills are a declared system element, used consistently.
