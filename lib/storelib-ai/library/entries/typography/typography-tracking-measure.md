---
id: typography-tracking-measure
title: Tracking, measure and line height
category: typography
summary: Letter spacing by size and case, comfortable line lengths, paragraph spacing and wrapping rules with exact values.
intents: [fix-typography, build-section]
tags: [tracking, letter-spacing, measure, line-length, line-height, wrapping, kerning]
components: [typography]
phases: [build, review]
priority: 4
related: [typography-scale]
version: 1
---
**Tracking (letter-spacing)**
- Display 48px and up: -0.01 to -0.04em (tighter as it grows; condensed faces need less).
- Body 15 to 20px: 0 (never track body text out).
- Small caps and uppercase labels 11 to 14px: +0.06 to +0.16em. Uppercase always needs positive tracking.
- Monospace: 0 or slightly negative at display sizes.

**Measure**: 45 to 75 characters per line for body, 60 to 68 ideal. Set with `max-width: 65ch` on the text block, not on the section.

**Line height**: body 1.5 to 1.7 (longer measure needs more); headings 1.0 to 1.25; captions 1.4.

**Paragraph spacing**: margin equal to about one line (1em to 1.5em). No first line indent on the web unless it is a book style concept.

**Wrapping**: `text-wrap: balance` on headings of up to about 6 lines; `text-wrap: pretty` on paragraphs to avoid single word last lines; `hyphens: auto` only with a `lang` attribute and narrow columns.

**Numbers**: `font-variant-numeric: tabular-nums` in prices, tables, schedules and counters so columns align and counters do not jitter.
