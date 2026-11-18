---
id: storelib-forms
title: Forms and email capture on Storelib
category: storelib
summary: Subscribe and contact forms that reach the creator, every field they send, published Storelib forms for files and bookings, and the states the form runtime sets.
intents: [forms, newsletter, contact, build-section]
tags: [forms, newsletter, subscribe, contact, enquiry, email-capture, lead]
components: [form, input]
phases: [plan, build]
priority: 4
related: [component-forms, state-form-validation, footer-newsletter]
version: 2
---
**Email sign up**: `<form data-storelib-form="subscribe">` with `<input type="email" name="email" placeholder="you@example.com">` (and `name="name"` if asked) and a visible label. No script, no action URL: submissions go to the creator's Subscribers. The runtime sets `data-state="sending" | "done" | "error"` on the form for styling, and an element marked `data-storelib-success` (hidden) is shown on success.

```css
form[data-state="sending"] button { opacity: .6; pointer-events: none; }
form[data-state="error"] .error { display: block; }
```

**Contact**: `<form data-storelib-form="contact">` with `name`, `email` (type email), `message` (a textarea), optional `subject` and an unticked `consent` box. The creator gets it by email and in Messages, Reply goes to the visitor. Any other named field (a phone, a date, a `<select>` of services, ticked boxes) is sent too, one line each under its label; a group of boxes under its `<legend>`. A contact form needs an email box and something beyond a name and an email.

**Never**: a file box in a contact or sign up form (they send words only), or a form with no hook, no action and no email box. The render check refuses both (`render.form`).

**Other mailing services**: set the action and `data-storelib-form="native"`.

**Enquiries with files, applications, bookings**: the creator builds these in Storelib Forms (with booking questions, uploads, rules, payment). The capabilities tell the agent how many published forms and booking forms exist. Place the real form with `<div data-storelib-native-form="{{ settings.form.id }}" data-presentation="inline"></div>`; do not imitate one with a fake form that posts nowhere.

**Search**: `<form role="search" action="/search">` with `<input type="search" name="q">` opens the site's search page.

**Copy**: say what happens after submitting and how often emails come.
