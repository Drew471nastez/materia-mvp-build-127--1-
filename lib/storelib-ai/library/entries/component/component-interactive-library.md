---
id: component-interactive-library
title: Interactive components that run in Storelib, ready to adapt
category: component
summary: Fourteen complete .storelib sections for the interactions sites keep asking for (reveals, marquee, sticky stack, sideways gallery, hover index, staggered text, before and after, tabs, accordion, counters, parallax, video opening, own header and footer); ask search_knowledge for one by id.
intents: [build-section, add-motion, add-interaction, build-header, build-footer, build-site]
tags: [interactive, example, examples, components, working code, marquee, tabs, accordion, faq, slider, before after, gallery, sticky, parallax, counters, video, mega menu, mobile menu, cart drawer, search, popover, scroll reveal]
components: [header, footer, tabs, accordion, carousel, gallery, hero, stats]
phases: [plan, build]
priority: 5
related: [motion-in-storelib-runtime, storelib-own-chrome, motion-principles, component-tabs, component-accordion]
version: 1
---
Ask search_knowledge with the id to get the whole file (template, scoped style, script when needed, schema). Each one compiles, draws and passes the checks your files are held to. Adapt type, colour, spacing, words and the ai_ name to the concept; never paste one unchanged, and never use more than two or three kinds of motion on a page.

| Id | What it is | How it works |
| --- | --- | --- |
| ai_scroll_reveal | chapters that rise into view | CSS view timeline, still without support |
| ai_marquee | a running line of real words | CSS loop, paused on hover and focus, wraps still for reduced motion |
| ai_sticky_stack | panels that stick and stack | position sticky with a growing top |
| ai_hscroll_gallery | sideways gallery with a progress line | scroll snap, focusable track, named scroll timeline |
| ai_hover_reveal_list | text index, image of the hovered row | :hover, :focus-within and :has() |
| ai_split_text | staggered headline, one line per block | CSS delays per line |
| ai_before_after | compare two photos | a real range input and a three line script |
| ai_tabs | tabs with arrow keys and no script | a radio group and :has() |
| ai_faq_accordion | questions, one open at a time | details name and ::details-content |
| ai_counters | figures that count up | @property integer and a view timeline, real numbers only |
| ai_parallax_media | a full bleed photo that drifts | view timeline on a transform |
| ai_video_hero | an opening over the creator's video | native controls so it can be paused |
| ai_site_header | own header: mega menu, mobile menu, search window, cart drawer, language and currency | popover API and the page's hooks |
| ai_site_footer | own footer: sign up, two menus, language and currency, the name set huge | data-storelib-form subscribe and the page's hooks |

**Why these techniques**: a section's script runs in a sandbox on a copy of its markup, so it cannot measure the page, observe intersections, focus elements or play a video. Scroll-driven CSS, :has(), details, popover and sticky run on the real page with no script, work by keyboard, and are easy to switch off under prefers-reduced-motion.
