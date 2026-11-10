---
id: motion-islands
title: Motion islands: 3D objects, scroll scrubbing, pinned runs and shader backgrounds, configured not scripted
category: motion
summary: Storelib's own interactive effects a section asks for with data-storelib-motion and tunes with data-motion-* params from schema settings (3d-object, scroll-scrub, pin-horizontal, webgl-gradient, marquee, parallax-depth, 3d-tilt, text-scramble, reveal-stagger, smooth-scroll, image-trail, cursor-follow); when to use each, the markup each reads, its still state.
intents: [add-motion, add-interaction, build-section, build-site, design-hero]
tags: [motion islands, data-storelib-motion, 3d, three.js, webgl, 3d object, 3d product, rotating, rotate on scroll, scroll scrub, scrub video, image sequence, pinned, pin, horizontal scroll, sideways gallery, parallax, depth, tilt, shader, gradient background, webgl gradient, marquee, velocity, text scramble, decode, reveal, stagger, smooth scroll, image trail, cursor follow, cursor label, awwwards, immersive, expressive]
components: [motion, hero, gallery]
phases: [plan, build, review]
priority: 5
related: [motion-tiers, motion-in-storelib-runtime, component-interactive-library, motion-principles]
version: 1
---
**Why they exist**: your section's `<script>` runs in a sandbox on a copy of its markup. It cannot read the scroll or the pointer, measure the page or draw WebGL. Storelib ships those effects itself as motion islands: reviewed code on the page that YOU configure with attributes. Mark an element `data-storelib-motion="<island>"`, print each param from a schema setting as `data-motion-<param>="{{ settings.motion_<param> }}"`, and the creator tunes it in the sidebar. Never script these yourself.

**Rules**
- The island's markup is its still state: complete without JavaScript, with reduced motion, on low-power phones, without WebGL. Put the real content inside (the product photo, the frames, the panels, the words). Never an empty div waiting for an effect.
- Pictures are `<img>` from an image_picker (`| asset`, with alt). No param is a URL.
- One showcase per page (scroll-scrub, pin-horizontal or 3d-object; two on an expressive site). At most two WebGL islands per page (3d-object, webgl-gradient); a third stays still. smooth-scroll once, on expressive sites.
- Fit the business: 3D card or object for a product, app, drink or watch launch; scrub for a product turning or a process on film; pinned run for collections and work; living gradient for software and music; marquee for real dates, names or a line of the brand's own; trail and cursor label for playful brands and portfolios. A quiet tier site (accountant, clinic) uses at most reveal-stagger.
- Write a section's own layout around it: an island never decides the type, colour or grid. Read `var(--motion-progress)` (0 to 1, set on scroll islands) to move a caption with the scrub; style `[data-motion-ready]` for the running state.
- Settings: one per param, id `motion_<param>`: a range for a number (min, max, step from the list below), a select for a word, a checkbox for yes or no, a text for a palette or label. Label them plainly ("Turn", "Scroll length", "Speed").

**The islands** (root attributes; params with range and default are in the prompt's MOTION ISLANDS block)
- `3d-object`: a product photo on a real lit 3D card (`<img data-motion-fallback>` inside is the face and the still state) or a generated shape (shape card, sphere, torus, knot, box, blob, coin) in the palette, turning with the scroll and leaning to the pointer. Root: `data-storelib-motion="3d-object" data-motion-shape data-motion-rotate (scroll|pointer|both|auto) data-motion-speed data-motion-intensity data-motion-finish (matte|satin|gloss|metal) data-motion-light (studio|soft|dramatic) data-motion-color (accent|scheme|mono|#hex) data-motion-float`. Give the island a height (the canvas fills it).
- `scroll-scrub`: frames or a video scrubbed by the scroll, the stage pinned. Inside: one `[data-motion-stage]` with `<img data-motion-frame>` in order (8 to 60) or `<video data-motion-video muted playsinline preload="auto">`. Params: length (1 to 6 screens), still (first|middle|last), mobile (scrub|still).
- `pin-horizontal`: the stage pins and a row of panels runs sideways. Inside: `[data-motion-stage]` > `[data-motion-track]` > panels (fixed widths). Params: speed, direction (left|right), mobile (swipe|stack). Still: a native swipe with snap points.
- `webgl-gradient`: a slow grainy shader gradient behind the island's content. Params: palette (scheme|accent|mono|up to five #hex), speed, intensity, grain. Still: the same colours as CSS.
- `marquee`: a running line that speeds up with the scroll and turns with its direction. Inside: one `[data-motion-track]` with the items (hidden copies are added, inert). Params: speed (px/s), direction, reactive, flip, pause. Still: write CSS so the track wraps.
- `parallax-depth`: children with `data-motion-depth="-1..1"` drift at their own speed with the scroll and the pointer. Params: intensity, pointer, axis.
- `3d-tilt`: the element leans toward the pointer in CSS 3D with a glare. Params: intensity (deg), glare, scale, perspective. Mouse only.
- `text-scramble`: the element's words decode from random characters. Params: trigger (view|hover|both|load), duration, chars (letters|digits|symbols|binary), once. Labels and one headline, never body text.
- `reveal-stagger`: children (or `[data-motion-item]`) arrive in order when the island is reached; what is already on screen never hides. Params: effect (rise|fade|scale|slide-left|slide-right), stagger, distance, duration, once.
- `smooth-scroll`: page level, never a takeover (the page scrolls natively): scroll islands glide, anchor links travel. Params: damping, anchors.
- `image-trail`: pictures in `[data-motion-images]` (a list of `<img>`) appear under the moving pointer and fade. Give the island a min-height. Params: threshold, lifetime, max, size, rotate. On touch they are a still row: style the list as one.
- `cursor-follow`: a round label (View, Play, Drag) follows the pointer over the island; the system cursor stays. Params: label, size, lag, blend (normal|difference).

**Example settings for a 3D object hero**: `{ "type": "select", "id": "motion_shape", "label": "Shape", "options": [{ "value": "card", "label": "Card" }, { "value": "sphere", "label": "Sphere" }, { "value": "blob", "label": "Blob" }], "default": "card" }, { "type": "select", "id": "motion_rotate", "label": "Turns with", "options": [{ "value": "scroll", "label": "Scroll" }, { "value": "pointer", "label": "Pointer" }, { "value": "both", "label": "Scroll and pointer" }, { "value": "auto", "label": "On its own" }], "default": "both" }, { "type": "range", "id": "motion_intensity", "label": "Turn", "min": 0, "max": 100, "step": 5, "unit": "%", "default": 50 }, { "type": "checkbox", "id": "motion_float", "label": "Float", "default": true }`.

**Working examples** (search_knowledge by id): ai_object_hero (3d-object card with the product photo, text-scramble label), ai_scrub_story (scroll-scrub frames with captions on --motion-progress), ai_pin_gallery (pin-horizontal collection run), ai_gradient_marquee (webgl-gradient band with a velocity marquee), ai_image_trail (image-trail and cursor-follow over a project index).
