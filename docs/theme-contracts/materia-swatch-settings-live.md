# Materia theme: make the Variant swatches settings show instantly in the Storelib builder

You are editing the Materia Shopify-style theme (Liquid, `config/settings_schema.json`, `layout/theme.liquid`, `sections/`, `snippets/`, `assets/`). The theme runs on Storelib, which renders Shopify-style themes. Storelib's website builder shows the theme in a canvas (a sandboxed iframe) and changes it live as the owner edits Theme settings.

## The problem

The owner opens Theme settings › Variant swatches and switches the swatch fill between **colour** and **variant image** (and changes the swatch shape, size, border and sold out style). Storelib now redraws the canvas for these at once. How fast the owner sees it depends on where Materia uses the setting:

| Where Materia reads the setting | What the Storelib canvas does | What the owner sees |
| --- | --- | --- |
| In Liquid markup (a class, a style attribute, an `<img>` or not) | Writes the change into the page where it is | Instant (one frame) |
| In CSS (`{% style %}` in the layout, a CSS variable) | Writes the new rules in place | Instant |
| On a custom element's attribute that the element reads in `connectedCallback` | Swaps the section on the next frame | Instant |
| Only in JavaScript that reads `window.theme.settings` or a JSON `<script>` once at page start | Has to load the whole page again behind the one on screen | About half a second |

The last row is the slow one. Please make every Variant swatches setting fall into one of the first three rows, or listen for Storelib's event below.

## What to do

1. **Prefer Liquid.** Decide the swatch's fill in the snippet or section that prints the swatch, with the setting, so the markup itself differs:

   ```liquid
   {%- liquid
     assign fill_image = false
     if settings.swatch_fill == 'variant_image' and value.variant.featured_image
       assign fill_image = true
     endif
   -%}
   <span
     class="swatch swatch--{{ settings.swatch_shape }}{% unless value.available %} swatch--soldout-{{ settings.swatch_soldout_style }}{% endunless %}"
     {%- if fill_image %}
       style="background-image: url({{ value.variant.featured_image | image_url: width: 120 }})"
     {%- elsif value.swatch.color %}
       style="background-color: {{ value.swatch.color }}"
     {%- endif %}
   ></span>
   ```

   Use your own setting ids; `swatch_fill`, `swatch_shape` and `swatch_soldout_style` are examples. Put sizes and border widths in CSS variables in the layout's `{% style %}` block, for example `--swatch-size: {{ settings.swatch_size }}px;`.

2. **If JavaScript must apply it** (for example the product page's variant picker builds the swatches in JS), keep reading the value at start as you do now, and ALSO listen for Storelib's builder event and apply the new value where it is:

   ```js
   document.addEventListener("storelib:settings-change", (event) => {
     const changed = event.detail.settings // { setting_id: newValue, ... } only the settings that changed
     if (!("swatch_fill" in changed)) return
     window.theme.settings.swatchFill = changed.swatch_fill
     document.querySelectorAll("variant-swatches").forEach((el) => el.render?.())
   })
   ```

   - Dispatched on `document`, only inside the Storelib builder, never on the live site.
   - `event.detail.settings` holds the Theme settings that changed, by their `id` in `settings_schema.json`, with their new values: a select or radio is its option `value` (a string), a checkbox a boolean, a range a number, a colour a `#rrggbb` string.
   - `event.detail.live` is `true` while a slider or colour is still moving and `false` on the final value. Apply both.
   - Storelib still loads the page again behind for a setting printed in a start-up script, so the result is the same either way; the listener only makes it instant.

3. **Set swatches up again when a section is redrawn.** Storelib sends Shopify's `shopify:section:load` (on the section element, after it is swapped) and its own `storelib:section-load` (bubbling, `event.detail.sectionId`, also after an in-place change). If swatches are built by JS, re-run that setup for the section in either event.

## Data a swatch can read (Storelib's product objects)

- `option.values[]` (each a product option value): `value.name`, `value.available`, `value.selected`, `value.variant` (the variant this value makes with the other chosen values, or `nil`), `value.swatch` (`nil`, or `value.swatch.color` for a colour, or `value.swatch.image` for a picture when the seller chose "photo").
- `variant.featured_image` (with `image_url`), `variant.available`.
- Older themes' metafields also work: `variant.metafields.custom.swatch` (and `color_swatch`, `colour_swatch`), a colour or a picture, the same value as `value.swatch`.

## Edge cases

- A value with no variant image while the fill is "variant image": fall back to its colour (`value.swatch.color`), then to the value's name as text. Never an empty circle.
- A sold out value keeps its swatch drawn, with the sold out style on top (crossed out or faded), and stays focusable with `aria-disabled="true"`.
- Do not hide the swatches until JS runs: the Liquid markup must already look right without JS (Storelib draws the canvas before scripts settle, and search engines read it too).

## How to test

1. Push the theme. In Storelib, open the website builder on a product page that has a colour option with variant images.
2. Theme settings › Variant swatches: switch the fill between colour and variant image. The swatches in the canvas must change at once, with no blink of the whole page.
3. Change shape, size, border and sold out style: each must change at once.
4. Reload the builder: the canvas must look exactly as it did before the reload.
5. Open the live product page: the swatches must match the builder.
