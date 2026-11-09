---
id: state-form-validation
title: Form validation, submitted and error states
category: state
summary: When to validate, how errors look and are announced, error summaries, success and submitted states, and preserving input.
intents: [build-component, forms, fix-states]
tags: [validation, error, success, submitted, invalid, required, form-states]
components: [form, input]
capabilities: [forms]
phases: [build, review]
priority: 4
related: [component-forms, component-inputs]
version: 1
---
**Timing**: validate on submit first. After a field has been submitted invalid, re-validate it as the user types so the error clears as soon as it is fixed. Do not show errors on fields the user has not reached.

**Error state of a field**
```html
<input id="email" aria-invalid="true" aria-describedby="email-error">
<p id="email-error" class="error">Enter an email like name@example.com</p>
```
Messages say how to fix it, not just "Invalid". Red border plus an icon plus the text; colour alone is not enough.

**Error summary**: on submit with errors, show a box at the top ("There are 2 problems") with links to each field, move focus to it (`tabindex="-1"` then `.focus()`).

**Required**: mark optional fields instead when most are required; or mark required with text, not just an asterisk.

**Submitting**: button disabled with "Sending", inputs readonly, `aria-busy` on the form. Guard against double submit.

**Submitted / success**: replace the form or show a confirmation panel with what happens next; move focus to it; offer a way to submit another if relevant.

**Server error**: keep everything typed; show a retry; never clear the form.
