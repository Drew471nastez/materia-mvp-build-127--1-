---
id: component-forms
title: Forms
category: component
summary: Short forms that work: field count, layout, submit behaviour, success and error states, spam and Storelib form binding.
intents: [build-component, build-section]
tags: [form, contact-form, enquiry, signup, booking-form, multi-step]
components: [form]
capabilities: [forms]
phases: [build, review]
priority: 5
related: [component-inputs, state-form-validation, storelib-forms]
version: 1
---
**Fewer fields**: every field costs completions. Contact: name, email, message. Enquiry: add one question that routes the request. Ask for phone only if you will call.

**Layout**: one column. Two short related fields side by side only on desktop (first and last name). Labels above fields. Submit button aligned with the fields, full width on phones.

**Submit flow**
1. Validate on submit, then live once a field has been touched and is invalid.
2. Submitting: disable the button, label "Sending", `aria-busy` on the form.
3. Success: replace the form with a confirmation that says what happens next ("Thanks, Maya will reply within two days"), move focus to it.
4. Error: keep all values, show a message at the top listing problems with links to fields, plus messages under each field.

**Multi step**: only for long forms (booking with options). Show step count, keep back navigation, save progress.

**Storelib**: forms are real Storelib forms (`data-storelib-form`, or a form picker); submissions reach the creator's responses. Never a `<form action="#">` that goes nowhere, never a mailto as the only route. Honeypot and rate limits are handled by the form engine.
