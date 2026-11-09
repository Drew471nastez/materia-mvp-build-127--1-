---
id: component-accordion
title: Accordions and FAQs
category: component
summary: Disclosure lists with details and summary, animation of height, icons, first item open and FAQ content rules.
intents: [build-component, build-section]
tags: [accordion, faq, details, summary, disclosure, collapse, expand]
components: [accordion, faq]
capabilities: []
phases: [build, review]
priority: 4
related: [state-interactive-matrix, faq, curriculum]
version: 1
---
**Native first**: `<details>` and `<summary>` are keyboard and screen reader accessible with no JS.

```html
<details class="faq" {% if forloop.first and settings.first_open %}open{% endif %}>
  <summary>{{ block.settings.question }}</summary>
  <div class="answer">{{ block.settings.answer }}</div>
</details>
```
```css
.faq summary { list-style: none; cursor: pointer; padding: 18px 0; display: flex; justify-content: space-between; gap: 16px; font-weight: 500; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: "+"; transition: transform .2s; }
.faq[open] summary::after { transform: rotate(45deg); }
.faq summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
```

**Animating height**: `interpolate-size: allow-keywords` with `::details-content` transitions where supported; otherwise animate the answer's opacity and translate only. Instant under reduced motion.

**States**: collapsed, expanded, hover, focus. The indicator must change shape, not only colour.

**FAQ content**: real questions people ask (delivery, refunds, level, access), answered in two or three sentences. Questions come from blocks so the creator can edit them.
