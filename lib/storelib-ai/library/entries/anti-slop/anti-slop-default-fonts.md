---
id: anti-slop-default-fonts
title: Default fonts and fixed type sizes
category: anti-slop
summary: Inter, Poppins or Montserrat as the headline face, three fixed pixel sizes and browser tracking are the first sign a site was generated; pick a type system and a fluid scale.
intents: [choose-fonts, review, fix-design]
tags: [fonts, inter, poppins, montserrat, roboto, system-ui, type-scale, clamp, tracking, default]
components: [typography]
phases: [concept, build, review, repair]
priority: 5
related: [typography-type-library, typography-scale, typography-tracking-measure]
version: 1
---
**The habit**: headings in Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Arial, Helvetica or plain system-ui; sizes like 48px, 32px, 18px written as fixed pixels; letter spacing and line height left at the browser default; bold everywhere because nobody chose a weight.

**Why it reads as slop**: these are what every template and every model reaches for first, so the site looks like everything else before a visitor reads a word. Fixed sizes break on phones (a 64px headline wraps into five lines) or look timid on wide screens.

**Checked**: the anti-slop check flags a default display face as an error (slop.default-fonts), fixed display sizes with nothing fluid as an error and default tracking on big type as a warning (slop.type-scale). The concept check refuses a default display face unless allow includes "default-fonts", which is only for a creator who asked for that face by name.

**Fix**: choose a system from typography-type-library for the concept's voice, set it with set_tokens fonts, put a clamp() scale on the section root, give display type its own tracking (-0.01em to -0.045em lowercase, +0.06em to +0.2em caps and small labels) and leading (0.86 to 1.05), and choose weights on purpose. A default face can stay as the body text.
