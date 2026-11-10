---
id: component-inputs
title: Text inputs and fields
category: component
summary: Field anatomy (label, control, hint, error), sizes, every state, input types and autocomplete for fast entry.
intents: [build-component, build-section]
tags: [input, text-field, select, checkbox, radio, textarea, field]
components: [input, select, checkbox, radio, textarea]
capabilities: []
phases: [build, review]
priority: 5
related: [component-forms, state-form-validation]
version: 1
---
**Anatomy**: visible label above, the control, optional hint, error message slot. Placeholder is an example, not the label.

```html
<div class="field">
  <label for="email-{{ section.id }}">Email</label>
  <input id="email-{{ section.id }}" name="email" type="email" autocomplete="email" inputmode="email" required aria-describedby="email-hint-{{ section.id }}" placeholder="you@example.com">
  <p id="email-hint-{{ section.id }}" class="hint">We only use it to send your booking.</p>
</div>
```

**Specs**: height 44 to 48px; font 16px minimum (smaller zooms the page on iOS); border 1px at 3:1 contrast; radius matching buttons.

**States**: hover (border darker), focus-visible (2px ring), filled, disabled (muted background, not just lower opacity), invalid (`aria-invalid="true"`, red border plus icon plus message; never colour alone), read only.

**Types**: `email`, `tel`, `url`, `number` only for quantities (not phone numbers or card numbers), `date` where native pickers are acceptable. Use `autocomplete` tokens (name, email, tel, street-address, postal-code).

**Choices**: radios for 2 to 5 options visible at once; a select for longer lists; checkboxes for independent options. Group with `<fieldset>` and `<legend>`.
