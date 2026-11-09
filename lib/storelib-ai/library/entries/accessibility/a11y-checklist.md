---
id: a11y-checklist
title: Accessibility checklist for generated sites
category: accessibility
summary: The minimum every generated page meets: landmarks, headings, alt text, contrast, keyboard, focus, forms, motion, language and zoom.
intents: [review, fix-accessibility, build-site]
tags: [accessibility, a11y, wcag, checklist, screen-reader]
phases: [build, review]
priority: 5
related: [color-contrast-rules, a11y-keyboard-focus, a11y-semantics]
version: 1
---
1. `lang` on html; one `h1` per page; headings in order without skipping levels for style.
2. Landmarks: `header`, `nav` (labelled when more than one), `main`, `footer`. A skip link to main.
3. Images: meaningful `alt`, empty alt for decoration, no text baked into images without an alternative.
4. Contrast: 4.5:1 text, 3:1 large text and UI, including on images and hover states.
5. Keyboard: everything interactive reachable and operable in a logical order; no traps; visible focus.
6. Forms: labels, error messages linked to fields, no placeholder only labels.
7. Motion: reduced motion respected; anything moving over 5 seconds can be paused; nothing flashes more than 3 times per second.
8. Media: captions for video with speech, no autoplay with sound.
9. Zoom: page works at 200% zoom and 320px width without horizontal scroll.
10. Links: say where they go ("Read the menu", not "Click here"); external links that open new tabs say so.
11. Names: icon buttons have accessible names; dynamic updates announced via live regions.
