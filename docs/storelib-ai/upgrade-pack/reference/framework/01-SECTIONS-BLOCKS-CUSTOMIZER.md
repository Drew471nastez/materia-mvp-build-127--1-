# Section and block system with merchant controls

Every new section generated should expose **relevant** customization controls without making the sidebar unusable. Avoid hundreds of meaningless controls. Support global tokens + local overrides + responsive variants.

## Controls catalog — implement and surface when relevant
- **Identity/content**: title, rich text, captions, eyebrow, CTA labels/URLs/actions, linked routes, dynamic product/collection/object source, content visibility.
- **Layout**: container width, full bleed, columns/grid/gap, alignment, split ratios, order/direction, max widths, responsive wrap, padding per side, section margin, min height, sticky behavior, background media.
- **Typography**: heading/body font, size, weight, line height, letter spacing, casing, text balance/width, desktop/tablet/mobile variations.
- **Color**: scheme, solid/gradient backgrounds, text, borders, badges, buttons, overlays, opacity; guarantee text contrast.
- **Media**: image source/binding, mobile image, art direction/crop/focal point, aspect ratio, object-fit, overlay, video poster/autoplay/mute/controls, lazy/preload.
- **Buttons**: variant, size, radius, icon, hover/focus states, animation, dynamic action. Never fake button affordance.
- **Motion**: enter transitions, hover animations, scroll cues, duration/ease/delay, no-motion alternative, performance cap.
- **Content blocks**: add/remove/reorder/repeat/re-nest cards, testimonials (only real), FAQs, logos, product cards, image cards, pricing items, features, columns, icons.
- **Commerce**: catalog source, display card variants, price display, swatches, real variant selector, availability, add-to-cart/buy-now, cart drawer behavior if enabled.
- **Advanced**: accessible class hooks and contextual custom CSS/JS within platform guardrails, stateful component capabilities and action wiring.

## Lifecycle
Create section definition (render + schema + presets) at generation time. Schema validator ensures all referenced setting IDs declared; setting editor dynamically generated from schemas; CRUD save/load/undo; preview/publish parity; compatible with future versions. Build responsive settings without duplicated or conflicting values; sensible defaults.

## Blocks and composability
Allow repeatable nested blocks and layout containers where compiler supports. Add presets for quick variation but don't hardcode visual outcomes; let AI produce entirely new classes/structure. A section can be as simple as headline + photo or as rich as editorial product configurator. Can insert/remove/reorder in a page; global layout slots can be customized independently.

## Existing constraints and regressions
Don't ignore grammar. Validate closed `<template>` tags, JS syntax, asset manifest entries and file paths, template section registrations, setting key existence, background/button text visibility, stylesheet size caps (previous Storelib 128 KB error), all responsive and live parity. If these limits hamper design, extend compiler/asset pipeline with migrations/tests — do not delete the validators.
