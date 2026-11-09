---
id: footer-newsletter
title: Newsletter footer
category: footer
summary: A footer led by an email sign up: one field, honest promise of frequency, real form handling and states.
intents: [design-footer, build-section]
tags: [footer, newsletter, email, signup, subscribe]
components: [footer]
capabilities: [newsletter, forms]
phases: [plan, build]
priority: 3
related: [storelib-forms, component-forms]
version: 1
---
**Promise**: say what people get and how often ("A letter when a new pack is out, about once a month"). No "Join 10k subscribers" unless real.

**Form**: one email field with a visible label (can be visually small), a button, privacy note link. States: submitting (button disabled with text "Signing up"), success (replace the form with a confirmation), error (message under the field, focus moved to it).

**Storelib**: use `data-storelib-form="subscribe"` so the email reaches the creator's real list; never a form posting nowhere.

**Layout**: heading and promise in 6 columns, form in the other 6 on desktop; stacked on phones with the button full width.
