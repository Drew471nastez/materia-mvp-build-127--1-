---
id: core-links-and-actions
title: Every link and button goes somewhere real
category: core
summary: Calls to action, menu links and commerce buttons need real destinations or hooks; placeholders block finish. Which links may stay plain and how in-page anchors pass.
intents: [build-site, generate-page, review, repair]
tags: [links, cta, buttons, navigation, commerce, bindings, anchors, checks]
phases: [build, review, repair]
priority: 5
related: [core-self-review, debug-common-markup, core-agent-loop]
version: 1
---
The render check reads every link and button on a drawn page. A link with a job is held to a real destination, and a broken one blocks finish until it is fixed.

**Links with a job** (an error when they go nowhere, to a page that does not exist, or to an id that is not on the page):
- calls to action: a link dressed as a button (a class with btn, button, cta, buy, shop, book, join...) or whose words ask for something (Book a class, Shop the program, Get started, Contact);
- every link in a `<nav>`, and every link in the site's own header and footer;
- commerce: add to cart, checkout, Buy now.

**How to give them a destination**
- A url setting with a real default from list_capabilities: a page (`/about`), a product's url, a collection, a form's page. Print it with `| url`. Do not fall back to `'#'`.
- A button whose setting may be empty is hidden while it is empty: `{% if settings.cta_url and settings.cta_label %}<a class="cta" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>{% endif %}`.
- Buy now is the product's `checkout_url`; add to cart is `data-storelib-add-to-cart="{{ block.id }}"` inside a product_list loop or `"{{ settings.product.id }}"` for a product_picker. A `<button>` needs a hook (`data-storelib-add-to-cart`, `data-storelib-cart`, `data-storelib-menu`, `data-storelib-checkout`), a form, or the section's own script; otherwise make it a link.
- A bound product list prints `block.settings.title`, `block.settings.price`, `block.settings.url` and `block.id`. Printing `product.title` inside `{% for block in settings.products %}` draws empty titles and prices, which the check reports as `binding.empty`.

**Allowed**
- In-page anchors to an id that is on the page: `href="#classes"` with a section that has `id="classes"`, or `#section-<section id>`. They pass.
- `href="#"` on an element with a hook (`data-storelib-cart`, `aria-controls`, `role="button"`).
- A plain link inside running text with a problem is only a warning, but fix it anyway.

Never: `javascript:` addresses, `href=""`, an `<a>` with no href styled as a button, or a CTA that says something the store cannot do.
