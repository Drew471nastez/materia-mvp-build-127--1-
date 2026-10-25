# Materia theme: show each product's own FAQs from Storelib

You are editing the Materia theme in its GitHub repository (the "storelib-repo/1" format: `sections/*.storelib`, `snippets/*.storelib`, `templates/*.json`, `config/settings.json`; Liquid between `<template compat="shopify">` and `</template>`, the schema in `<schema>`). Storelib renders it with a Shopify compatible Liquid engine. A push to `main` comes back as a draft within seconds. Read `AGENTS.md` first.

## What Storelib gives the theme (the contract)

A seller writes questions and answers for each product in the Storelib product editor (the FAQ card), in an order they choose. Every `product` object carries them, in **every** place: the product page's `product`, a Featured product's `section.settings.product`, `closest.product`, the products of collections, `all_products[...]`. Same in the builder's canvas and on the live site.

```
product.metafields.storelib.faqs           prints as how many there are; blank when the product has none
product.metafields.storelib.faqs.value     a list, in the seller's order, of:
```

| Key | Type | What it is |
| --- | --- | --- |
| `question` | string | Plain text, up to 300 characters. Escape it: `{{ faq.question | escape }}`. |
| `answer` | string | Plain text, up to 3000 characters, may contain newlines. Escape it if you print it. |
| `answer_html` | string | The answer already escaped with a `<br>` for each line. Safe to print as is: `{{ faq.answer_html }}`. Use this one. |

At most 30 questions. Unanswered ones never arrive.

```liquid
{%- assign pfaqs = product.metafields.storelib.faqs.value -%}
{%- if pfaqs != blank -%}
  {%- for faq in pfaqs -%}
    <details><summary>{{ faq.question | escape }}</summary><div>{{ faq.answer_html }}</div></details>
  {%- endfor -%}
{%- endif -%}
```

**What Storelib does today without the theme, and why that changes.** While no file in the theme contains `metafields.storelib.faqs`, Storelib puts the questions into the theme's own collapsible rows itself: an empty row headed "FAQ" (or "Questions", "Q&A") is filled; otherwise a new row like the section's last collapsible row is added, headed "FAQ"; with no rows, a plain block goes under the description. It does this in the main product section and in any Featured product. **As soon as the theme reads `metafields.storelib.faqs` anywhere, Storelib stops doing that everywhere**, so the theme must then cover every place below in the same push.

## What to change

1. Main product and Featured product: a block type `product_faq` ("Product FAQ") in both `sections/main-product.storelib` and `sections/featured-product.storelib` schemas, drawn with the theme's own collapsible row look (reuse the markup and classes of `collapsible_row` / `modern_collapsible_row`, `details.mt-acc` opened by product-page-ui), with settings `heading` (text, default "FAQ"), `open_first` (checkbox, default false) and the same style settings as the collapsible rows. It renders `product.metafields.storelib.faqs.value` for the section's product (Featured product: `section.settings.product`, never the global `product`). On the live site it renders nothing when the product has no questions; in the editor (`request.design_mode`) a one line hint: "This product's questions show here, from its FAQ in Storelib".
   Add it to `templates/product.json` main section after the collapsible rows, and to the home Featured product.

2. Collapsible rows: add a checkbox `use_product_faqs` ("Show this product's FAQs", default false) to `collapsible_row` and `modern_collapsible_row`. When on and the product has questions, the row's body is the questions (each a nested question with its answer) instead of its own content; with no questions it keeps its own content.

3. FAQ sections (`faq-pro`, `faq`, `faq-tabs`, `faq-side-image`, `faq-floating`, `faq1`, `faq5`): add a select `faq_source` ("Questions from") with `section` ("These questions", default), `product` ("This product's FAQs"), `product_then_section` ("This product's FAQs, else these"). On a product page (`request.page_type == 'product'`) use `product.metafields.storelib.faqs.value` per the option; elsewhere the section's own blocks. Draw product questions with exactly the same markup as the section's `faq_item` blocks (so styles, first item open, multiple open all keep working). Section blocks are `block.settings.question` / `answer` (rich text, printed raw); product answers come from `answer_html`.
   Also add an optional product picker `faq_product` (type `product`): when set, that product's FAQs are used on any page (a home page FAQ about one product).

4. Quick view (if present): when the product has questions, an "FAQ" collapsible under the description, for the card's product.

5. No FAQ structured data (JSON-LD FAQPage): Google no longer shows it for sellers.

## Live preview

A change in the builder draws the section again and fires `storelib:section-load` (detail `{ sectionId }`) on the section element. Set accordion scripts up again for that section on that event. A product's FAQ edited in Storelib shows in the canvas when the builder tab is focused again, and on the live site at the next visit.

## Edge cases

- Product with no FAQs: nothing on the live site (no empty heading), a hint in the editor.
- Seller text with `<b>`, `<script>`, quotes: shown as typed (escape questions; use `answer_html`).
- Answers with several lines: keep the line breaks (`answer_html` has `<br>`).
- The same product twice on a page (main product and a Featured product): unique ids for each `details` and aria pair (use `section.id` and `block.id`).
- Order: always the seller's order; never sort.
- 390px wide: no sideways overflow; tap targets at least 44px tall.

## How to test

1. In Storelib, give product A three questions (one answer with two lines, one question containing `<b>bold</b>`), product B none.
2. Product page A: the Product FAQ block shows the three in order, the two line answer keeps its line, `<b>bold</b>` shows as text. Product page B: nothing (live), a hint (editor).
3. Home: the Featured product set to A shows A's questions; set to B shows none.
4. A `faq-pro` section on the product template with "This product's FAQs, else these": A shows A's, B shows the section's own.
5. Change an answer in Storelib and reload: the new text shows.
