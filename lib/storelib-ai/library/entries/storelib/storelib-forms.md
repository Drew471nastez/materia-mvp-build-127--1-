---
id: storelib-forms
title: Forms and email capture on Storelib
category: storelib
summary: Subscribe forms that reach the creator's subscribers, published Storelib forms for enquiries, and the states the form runtime sets.
intents: [forms, newsletter, contact, build-section]
tags: [forms, newsletter, subscribe, contact, enquiry, email-capture, lead]
components: [form, input]
phases: [plan, build]
priority: 4
related: [component-forms, state-form-validation, footer-newsletter]
version: 1
---
**Email sign up**: `<form data-storelib-form="subscribe">` with `<input type="email" name="email">` (and `name="name"` if asked) and a visible label. No script, no action URL: submissions go to the creator's Subscribers. The runtime sets `data-state="sending" | "done" | "error"` on the form for styling, and an element marked `data-storelib-success` (hidden) is shown on success.

```css
form[data-state="sending"] button { opacity: .6; pointer-events: none; }
form[data-state="error"] .error { display: block; }
```

**Other mailing services**: set the action and `data-storelib-form="native"`.

**Enquiries, applications, bookings**: the creator builds these in Storelib Forms (with booking questions, rules, payment). The capabilities tell the agent how many published forms and booking forms exist. Link or place the real form; do not imitate one with a fake form that posts nowhere.

**Copy**: say what happens after submitting and how often emails come.
