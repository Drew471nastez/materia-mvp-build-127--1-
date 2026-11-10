---
id: motion-recipes
title: Motion primitives with editable params
category: motion
summary: The reusable motion recipes (reveal and stagger, masked line reveal, image curtain and scale-in, sticky storytelling, sideways gallery, marquee with pause, hover lift and press, counters from real numbers, cursor-aware tilt, page transitions), each a working example with its params as schema settings, mobile and low-power behaviour.
intents: [add-motion, add-interaction, animation, build-section]
tags: [motion, recipes, primitives, reveal, stagger, masked reveal, mask reveal, image reveal, curtain, scale in, sticky story, scrollytelling, horizontal scroll, marquee, pause, hover lift, press, counter, page transition, cursor, tilt, editable motion]
components: [motion, hero, gallery]
phases: [plan, build, review]
priority: 5
related: [motion-tiers, component-interactive-library, motion-in-storelib-runtime, motion-principles]
version: 1
---
Every recipe is a complete section you can ask search_knowledge for by id. Each reads the site's motion feel (motion-tiers) and puts its knobs in the schema, so the creator edits motion in the sidebar like any other setting: a `motion` select ("site" follows the site, "off" is still), a `motion_strength` range (0 to 150%, printed as `--m-k: calc({{ settings.motion_strength }} / 100)`) and its own where they matter.

| Recipe | Example | Params | Phone | Reduced motion |
| --- | --- | --- | --- | --- |
| Reveal with stagger | ai_scroll_reveal | motion, motion_strength | 60% travel | visible, still |
| Masked line reveal | ai_mask_reveal | motion, motion_strength, stagger | shorter travel, faster stagger | the whole heading |
| Staggered headline | ai_split_text | motion, motion_strength | same | still |
| Image curtain and scale-in | ai_image_reveal | motion, curtain, motion_strength | scale only, no curtain | the whole photo |
| Slow image drift | ai_parallax_media | strength | same small travel | still photo |
| Sticky storytelling | ai_sticky_story | motion, layout | plain steps, each with its picture | plain steps |
| Horizontal scroll section | ai_hscroll_gallery | | native swipe and snap | no snap |
| Marquee with pause | ai_marquee | speed, pause_label | same | a wrapped still line |
| Hover lift and press | ai_hover_lift | motion, motion_strength | press only | colour and underline only |
| Cursor-aware tilt | ai_cursor_tilt | motion, tilt | flat (no hover) | flat |
| Counter from real numbers | ai_counters | | same | the final number |
| Page transitions | Theme setting Animations › Between pages | page_transition | same | none |

**Hard rules**: transform and opacity only (clip-path for masks); never width, height, top, left, box-shadow, or `transition: all`. Native scrolling always: no scroll hijacking, no smooth-scroll library, no preloader, nothing essential hidden until a script runs. One motion signature per site and at most one or two scroll-linked showcases per page. Hover effects only inside `@media (hover: hover) and (pointer: fine)`.

**Low power**: scroll-driven CSS (`animation-timeline: view()`) runs on the compositor with no script and no observers; loops (the marquee) pause on hover, focus and their own switch; nothing animates continuously off screen. A section script cannot read the pointer or the scroll position, which is why cursor-aware effects use CSS hover zones.
