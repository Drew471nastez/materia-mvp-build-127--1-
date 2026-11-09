---
id: debug-css-scoping
title: Styles leaking or not applying
category: debugging
summary: Section CSS that leaks to the page or loses to theme styles; scoping, specificity and custom properties.
intents: [debug, repair, fix]
tags: [debugging, bug, css, scoping, specificity, leaking-styles, theme-css]
phases: [repair, review]
priority: 4
related: [debug-common-markup, color-scheme]
version: 1
---
**Leaking**: selectors like `h2 { ... }` or `.button { ... }` in a section affect the whole page. Prefix every rule with the section's own class or root, and keep generic element selectors inside it (`.s-hero h2`).

**Not applying**: theme styles with higher specificity win. Raise specificity within the section's scope (`.s-hero .s-hero__title`), not with `!important`. Check that the class names in the template match the CSS (typos are common).

**Colours**: read scheme colours from the section's custom properties so the creator's scheme applies; a hard coded colour does not follow the scheme.

**Order**: a media query written before the base rule it overrides loses. Write base first, then breakpoints ascending.

**Debug**: devtools "Computed" panel shows which rule wins and where it comes from.
