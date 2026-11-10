---
id: component-interactive-library
title: Interactive components that run in Storelib, ready to adapt
category: component
summary: Twenty-four complete .storelib sections for the interactions sites keep asking for (3D product hero, scroll scrubbed story, pinned sideways run, living gradient with a velocity marquee, image trail, reveals, masked headline, image curtain, sticky story, marquee, sticky stack, sideways gallery, hover index, hover lift, cursor tilt, staggered text, before and after, tabs, accordion, counters, parallax, video opening, own header and footer); ask search_knowledge for one by id.
intents: [build-section, add-motion, add-interaction, build-header, build-footer, build-site]
tags: [interactive, example, examples, motion islands, 3d, scroll scrub, pinned, webgl gradient, image trail, components, working code, motion primitives, masked reveal, image reveal, sticky story, hover lift, cursor tilt, marquee, tabs, accordion, faq, slider, before after, gallery, sticky, parallax, counters, video, mega menu, mobile menu, cart drawer, search, popover, scroll reveal]
components: [header, footer, tabs, accordion, carousel, gallery, hero, stats]
phases: [plan, build]
priority: 5
related: [chrome-kit, motion-in-storelib-runtime, storelib-own-chrome, motion-principles, component-tabs, component-accordion]
version: 1
---
Ask search_knowledge with the id to get the whole file (template, scoped style, script when needed, schema). Each one compiles, draws and passes the checks your files are held to. Adapt type, colour, spacing, words and the ai_ name to the concept; never paste one unchanged, and never use more than two or three kinds of motion on a page.

| Id | What it is | How it works |
| --- | --- | --- |
| ai_scroll_reveal | chapters that rise into view | CSS view timeline, still without support |
| ai_mask_reveal | an opening statement whose lines rise out of masks | CSS delays per line, the site's motion feel |
| ai_image_reveal | one key photo that opens like a curtain and settles | view timeline on clip-path and transform |
| ai_sticky_story | a method: the picture stays while steps pass | sticky column and named view timelines; plain steps on phones |
| ai_hover_lift | offers that lift, pan and press under the pointer | transitions on transform, hover only on a fine pointer |
| ai_cursor_tilt | one showcase picture that leans toward the pointer | nine hover zones and :has(), no script |
| ai_marquee | a running line of real words | CSS loop, paused on hover, focus and its own Pause switch, wraps still for reduced motion |
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
| ai_object_hero | a launch hero: the product photo on a lit 3D card turning with the scroll | the 3d-object motion island (three.js only on that page); the photo is the still state |
| ai_scrub_story | frames scrubbed by the scroll on a pinned stage, captions per chapter | the scroll-scrub motion island and var(--motion-progress) |
| ai_pin_gallery | the section pins and a collection runs sideways | the pin-horizontal motion island; a native swipe on phones |
| ai_gradient_marquee | a living shader gradient band with a giant running line that answers the scroll | the webgl-gradient and marquee motion islands |
| ai_image_trail | a project index: photos trail the mouse, a View label follows it | the image-trail and cursor-follow motion islands; a still row on touch |

**Motion islands** (the last five): Storelib's own effects, asked for with data-storelib-motion and tuned with data-motion-* params from schema settings; see motion-islands. Use them for 3D, scroll scrubbing, pinned runs and shader backgrounds, which a section's own script cannot do.

**The chrome kit** (see chrome-kit): six headers (ai_chrome_header_overlay, ai_chrome_header_split, ai_chrome_header_mega, ai_chrome_header_minimal, ai_chrome_header_announce, ai_chrome_header_shop), three menu drawers (ai_chrome_menu_fullscreen, ai_chrome_menu_sheet, ai_chrome_menu_bottom), three carts (ai_chrome_cart_side, ai_chrome_cart_minimal, ai_chrome_cart_card), two search windows (ai_chrome_search_full, ai_chrome_search_drop), the switches (ai_chrome_locale) and six footers (ai_chrome_footer_wordmark, ai_chrome_footer_newsletter, ai_chrome_footer_columns, ai_chrome_footer_line, ai_chrome_footer_image, ai_chrome_footer_sitemap). Prefer them to ai_site_header and ai_site_footer for a new site.

**Why these techniques**: a section's script runs in a sandbox on a copy of its markup, so it cannot measure the page, observe intersections, focus elements or play a video. Scroll-driven CSS, :has(), details, popover and sticky run on the real page with no script, work by keyboard, and are easy to switch off under prefers-reduced-motion.

**Motion params**: the moving ones read the site's motion feel (`var(--t-motion-duration)`, `--t-motion-ease`, `--t-motion-distance`, `--t-motion-stagger`, `--t-motion-hover`, `--t-motion-lift`, `--t-motion-scale`; see motion-tiers) and expose a `motion` select (follow the site, or still) and a `motion_strength` range in their schema, so the creator tunes them in the sidebar.
