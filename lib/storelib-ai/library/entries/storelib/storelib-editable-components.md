---
id: storelib-editable-components
title: Code backed components that stay editable
category: storelib
summary: How AI written custom components expose every word, link, image and choice as editable settings or blocks so creators can change them in the visual editor without code.
intents: [build-component, build-section, edit]
tags: [editable, settings, schema, manifest, blocks, custom-component, props, visual-editor]
components: [section, schema]
phases: [plan, build, review]
priority: 5
related: [core-iteration, storelib-honest-data, blocks]
version: 1
---
A generated component is only useful if the creator can keep editing it. Its source is preserved; its content lives in settings.

**Expose as settings** (one per thing a creator would change): headings and body text (text or richtext), images (image_picker), links (url), menus (link_list), products (product_picker, product_list, collection_picker), community (community_picker), colours that should be changeable (color defaulting to a scheme colour), layout choices (select with named options), sizes and speeds (range with sensible min, max, step).

**Expose as blocks**: any list the creator grows: questions, quotes, slides, team members, timeline steps. Never `question_1`, `question_2` settings.

**Defaults and presets**: fill them so the component looks finished when added; defaults are content the creator would plausibly have (from the brief), never fake proof.

**Keep design decisions in code**: exact spacing, easing, grid tracks. A setting is a merchant choice ("Image position: left or right"), not a CSS property ("flex-direction").

**On edit**: a follow up that changes content edits setting values, not source; a structural change keeps existing setting ids so the creator's values survive.
