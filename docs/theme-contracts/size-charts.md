# Materia theme: make every size chart block use the product's Storelib size chart

You are editing the Materia theme in its GitHub repository (the "storelib-repo/1" format: `sections/*.storelib`, `snippets/*.storelib`, `blocks/*.storelib`, `templates/*.json`, `config/settings.json`; Liquid lives between `<template compat="shopify">` and `</template>`, the schema in `<schema>`). Storelib renders this theme with a Shopify compatible Liquid engine. A push to `main` comes back into the store as a draft within seconds; nothing goes live until the creator presses Publish. Read `AGENTS.md` first.

## What Storelib gives the theme (the contract)

Every `product` object has the size chart Storelib picked for that product, in **every** place a product appears: the product page's `product`, a Featured product section's `section.settings.product`, `closest.product`, the products of `collections[...]`, `all_products[...]` and any product setting. It is the same in the builder's canvas and on the live site.

```
product.metafields.storelib.size_chart          prints as the chart's name; blank when the product has no chart
product.metafields.storelib.size_chart.value    the chart, an object:
```

| Key | Type | What it is |
| --- | --- | --- |
| `name`, `title` | string | The chart's name ("Tees"). Plain text: escape it. |
| `unit` | `"cm"` or `"in"` | The unit the seller typed the numbers in. |
| `unit_label` | string | That unit as it is printed. |
| `units` | list | The units the chart can be read in: `["cm", "in"]` when a measurement column has a number, else only its own. |
| `has_measurements` | boolean | Whether the cm / in switch means anything. |
| `columns` | list of `{ name, measure, unit }` | `name` plain text; `measure` true for a measurement (Chest, Waist), false for a label (Size, EU); `unit` the measurement's unit, nil for a label. The first column is always the size. |
| `rows` | list of lists of strings | One row per size, one cell per column, as typed. The first cell is the size. A cell may be empty (`""`). |
| `rows_cm` | list of lists | The same rows with measurement columns in cm (labels untouched). |
| `rows_in` | list of lists | The same rows in inches, one decimal ("86-91" becomes "33.9-35.8"). |
| `tables` | object | `{ cm: { unit, unit_label, rows }, in: { ... } }`, one entry per unit in `units`: loop it to draw one table per unit. |
| `notes` | string | The line under the table, plain text, may hold newlines. Escape it. |
| `notes_html` | string | The same note already escaped, a `<br>` per line. Safe to print as is. |
| `image` | string or nil | An https address of a "how to measure" picture. It is a plain URL string, not an image object: print it as `src="{{ slc.image }}"`, or `{{ slc.image | image_url: width: 1200 }}` (Storelib keeps the address). It has no `.width` / `.height`. |
| `measuring_guide` | `{ text, image }` | The note and the picture again, for a "How to measure" tab. |
| `source` | `"product"`, `"collection"` or `"category"` | Where the chart came from: picked on the product, set for a collection the product is in, or set for its category. Informational. |

Which chart: the one picked on the product in Products › Size charts, else one the seller set for a collection the product is in, else one set for the product's category. When none applies the metafield is blank, and the block's own content (its table data, its page, its HTML) must be used. Never draw a made up chart.

The same chart is also `product.metafields.custom.size_chart` (unless the product has a custom field of that name), shaped like a page: `.value.title`, and `.value.content`, the table already drawn as HTML in the chart's own unit, with every key above beside them. Prefer `storelib.size_chart` in Materia's own code.

Limits: up to 10 columns and 40 rows. Values are plain text: always `| escape` cells, names and notes.

**Important.** Storelib looks at the theme's code: when any file contains `metafields.storelib.size_chart`, Storelib adds nothing of its own (no automatic "Size guide" link beside the size option). Materia already reads it, so Materia must draw the chart everywhere a buyer might look for it: the main product, the Featured product, and quick view. That is this task.

## What to change

1. `snippets/product-size-chart-content.storelib` (already reads the metafield; keep it as the one place that draws the Storelib chart):
   - Keep the cm / in switch when both `rows_cm` and `rows_in` exist, and default it to `slc.unit`.
   - Columns: print the unit in brackets after a column whose `measure` is true; never after a label column.
   - Print `slc.notes_html` (already safe) instead of `slc.notes | escape | newline_to_br`.
   - Image: treat `slc.image` as a URL string; drop the `.width`/`.height` attributes.
   - Wrap each table in a box that scrolls sideways (`overflow-x: auto; -webkit-overflow-scrolling: touch`) and make the first column sticky (`position: sticky; left: 0; background: var(--color-background)`), so a 6 column chart is readable at 390px wide without the page scrolling sideways.
   - The unit switch radios need unique `name`s per instance (the same product can appear twice on a page: main product and a Featured product). Use `chart_id` (the caller's `block.id`) plus `section.id`.

2. `size_guide` block (`snippets/size-guide-block.storelib`, in `main-product` and `featured-product`): today it only shows its own inline content, which is why "the size guide block doesn't pull product size charts". Add a checkbox setting `use_storelib_chart` ("Use assigned Storelib size chart", default true, info "The chart assigned in Storelib > Products > Size charts is used first. This block's own content is the fallback.") to the block schema in both sections. In the snippet: when it is not false and `product.metafields.storelib.size_chart != blank`, render `{% render 'product-size-chart-content', product: product, chart_id: block.id %}` as the modal's table; else the block's existing content. When neither exists, draw nothing on the live site (no empty trigger); in the editor (`request.design_mode`) draw a short hint.

3. `size_table` block (`snippets/size-table-render.storelib`): already prefers the Storelib chart when `use_storelib_chart != false`. Keep it. Use the table data only when the metafield is blank; when both are blank, render nothing on the live site.

4. `size_chart_popup` block (`snippets/size-chart-popup-import.storelib`): today the block's own "Size chart" rich text wins over the product's chart. Add the same `use_storelib_chart` checkbox (default true) and change the order to: the Storelib chart (checkbox on and metafield not blank), then the block's own `sizes_content`, then `sizes_page`. Treat `sizes_content` of only `<br />` or spaces as empty (it is, in the current product template).

5. Variant picker "Size guide" link (`snippets/size-guide-sheet.storelib`, `show_size_guide`): keep reading `product-size-chart-content` first. Show the link only when there is something to show (chart, content or page). Keep it hidden when the section already has a size_guide, size_table or size_chart_popup block, as now.

6. `featured-product` section: everything above must work there too. Its product is `section.settings.product`; pass it as `product:` to every snippet render. Never use the global `product` there (on the home page it is nil).

7. Quick view / quick add (if Materia draws a variant picker there): the same Size guide link, for the product of that card.

## Live preview

In the builder a change draws the section again and fires `storelib:section-load` on the section element (detail `{ sectionId }`). Any script that wires the size sheet or the unit switch must set itself up again on that event. Prefer CSS only (`:has(input:checked)`) for the unit switch, as the snippet does now.

## Edge cases

- Product with no chart and a block with no content: nothing drawn on the live site.
- A chart with only label columns: no unit switch (`rows_cm` and `rows_in` equal `rows`; draw `rows` once).
- Empty cells: a dash, never "undefined".
- Seller text with `<b>` or quotes: shown as typed (escaped).
- Two charts on one page (main product and a Featured product of another product): each shows its own product's chart; ids and radio names never clash.
- Long column names: no overflow outside the scroll box.

## How to test

1. In Storelib: Products › Size charts, make "Tees" (Size, Chest, Length; cm), pick it on one product. Make "Shirts" and under "Also show it on" tap a collection; put a second product in that collection with no chart of its own. Leave a third product with none.
2. Product page of each: the Size Chart Popup, the Size guide link, the Size Table and the Size guide block show "Tees", "Shirts", and their own fallback (or nothing). Switch cm / in.
3. Home page Featured product set to each product in turn: the same results.
4. Edit the chart in Storelib and reload the live page: the new numbers show. In the builder, come back to its tab: the canvas shows them.
5. At 390px wide: the table scrolls sideways inside its box, the size column stays put, the page itself never scrolls sideways.
