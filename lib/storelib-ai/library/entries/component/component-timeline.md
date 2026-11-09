---
id: component-timeline
title: Timelines and process steps
category: component
summary: Sequential content as ordered lists: vertical timelines, step lists, schedules, numbering that means something.
intents: [build-component, build-section]
tags: [timeline, process, steps, history, roadmap, schedule]
components: [timeline, process]
capabilities: []
phases: [build, review]
priority: 2
related: [process, layout-sticky-storytelling]
version: 1
---
**Use for** genuinely sequential content: how working together goes, a course week by week, a brand history, an event day schedule.

**Markup**: an ordered list `<ol>` so order is announced; each item has a heading (or time) and text.

**Layout**: vertical with a 1 to 2px line connecting markers on the left; time or step label in a fixed width column; on desktop, alternating sides only for history timelines with images.

**Numbers**: step numbers only when order matters to the visitor. Use the real time for schedules ("19:00 Doors").

**Motion**: items can fade in as they enter; the line can draw with `scaleY` driven by scroll if the concept is expressive. Static under reduced motion.
