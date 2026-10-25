# Personalization fields and custom fields: the contract for a theme

This is the prompt for the session that writes the Materia theme (a Shopify-format Liquid theme, synced to Storelib from GitHub). Paste everything below the line. It is also the contract any imported theme can follow. The platform side is in `lib/products/personalization.ts`, `lib/storelib-theme/compat/personalization.ts` and `lib/storelib-theme/compat/site.ts`; `tests/personalization-r13.test.ts` and `tests/e2e-personalization.test.ts` hold it to this page.

---

## Task: personalization fields and custom fields in the Materia theme

Storelib now lets a seller ask the buyer for things when they buy a product that ships: a name to engrave, a gift message, a photo to print. The seller sets them in the product editor (Products, the product, Personalization card). Each product can have up to 5 fields. Storelib's platform already does all the server work: it stores the fields, checks the answers, uploads photos to private storage, keeps the answers on the order, shows them to the seller, puts them in emails, packing slips and exports. Your job is the theme: draw the fields well on the product page (main product section and the featured product section), send the answers with Add to cart and Buy it now, and show them on cart lines. Also make sure custom fields (below) are shown where they belong.

Do not change anything on the platform. Do not invent new endpoints. Everything you need is listed here.

### 1. What you get: the data

On any page that has a `product` object:

```liquid
{% assign pz = product.metafields.storelib.personalization.value %}
```

`pz` is a list (empty or missing when the product asks nothing). `{{ product.metafields.storelib.personalization }}` prints how many fields there are. Each field:

| key | what it is |
| --- | --- |
| `id` | stable id of the field, letters and digits. Use it in element ids and when uploading a photo. |
| `product_id` | the product's id (a UUID). |
| `position` | 1, 2, 3 in the seller's order. Draw them in this order. |
| `label` | exactly what the seller typed, like `Name to engrave`. Show it as is. Never change its case or words. |
| `type` | `text` (one line), `textarea` (a few lines, keep line breaks) or `image` (a photo upload). |
| `required` | `true` or `false`. |
| `max_length` | a number for `text` and `textarea` (1 to 250), `null` for `image`. |
| `placeholder` | a hint inside the box, may be empty. |
| `help_text` | a line under the field, may be empty. |
| `name` | the input name to post: `properties[<label>]`, for example `properties[Name to engrave]`. Use this exactly. |
| `accept` | for `image`: `image/jpeg,image/png,image/webp`. |
| `max_size` | for `image`: `10485760` (10 MB). |

`/products/<handle>.js` also returns `personalization_fields`, the same list, for quick add and for JavaScript.

### 2. How answers travel

Answers are Shopify line item properties. Post each answer as `properties[<label>]` inside the product form (`<form action="/cart/add">`), the way every Shopify theme already does. Storelib keeps them on the cart line, on the order, in the emails and in the seller's exports.

- `fetch('/cart/add.js', { method: 'POST', body: formData })` works, and so does a JSON body `{ items: [{ id, quantity, properties: { "Name to engrave": "Ana" } }] }`.
- The same variant with different answers becomes a separate cart line. Two mugs for Ana and Bob are two lines.
- Answers are trimmed. Line breaks are kept for `textarea`. Each answer is at most `max_length` characters (never more than 250).
- A property name that starts with `_` is hidden from the buyer on Shopify, so seller labels never start with `_`. Do not add `_` properties of your own for these fields.

If an answer is missing, too long, or a photo link is not a real Storelib upload, `/cart/add.js` answers **422** with JSON `{ "status": 422, "message": "...", "description": "Mug: Fill in Name to engrave" }` and adds nothing. A plain form post (not ajax) is sent back to `/cart`. Show `description` the way the theme already shows a 422 (the cart error area or the product form's error message). The checkout checks everything again on the server, so the theme check is for the buyer's comfort, not for safety.

### 3. Uploading a photo

A photo is one of Storelib's cart uploads: kept privately for this browser and this store, checked by its bytes (a real JPEG, PNG or WebP, 10 MB at most, 16 to 12000 pixels a side; HEIC, GIF and SVG are refused), drawn again without its metadata. Two ways, both on the shop's own host:

1. **Upload at once (recommended).** When the buyer picks a file, `POST /cart/upload` with a `FormData` body holding the file under `file`. Answer 200: `{ "upload": { "value": "/api/cart/uploads/<id>.<sig>/<name>", "name": "pet.jpg", "type", "size", "width", "height" }, "uploads": [...] }`. Refusals: `{ "status", "message", "description" }` with 400 (empty, unreadable, too small), 413 (over 10 MB), 415 (not a picture), 429 (too many). Show `description` under the field. Put `upload.value` in the hidden input `properties[<label>]`.
2. **Or post the file with the form.** A product form sent as `multipart/form-data` with `<input type="file" name="properties[<label>]">` to `/cart/add` works too: the file is kept and its value put in its place before the cart reads the form. A refused file refuses the add with a 422 naming the file.

Way 1 is better: the buyer sees the photo before adding, and a bad file is said at once.

The value is a path on the shop's host. It opens the picture (`GET` it, a 302 to a ten minute link) only in the browser that uploaded it, on that store; anybody else gets 404. Once the order is paid the photo belongs to the order and the store downloads it from the order page. Never build or change these values yourself; the checkout refuses one from another browser or store.

Check type and size in the browser before uploading too, so the buyer hears about it at once. Ask the file picker for `accept="image/jpeg,image/png,image/webp"` so an iPhone sends a JPEG.

### 4. The easy way: let Storelib draw the fields

If you do nothing, Storelib already draws the fields inside the main product form, above the buy buttons, with its own small script. You can choose where they go instead:

- `{% render 'storelib-personalization' %}` inside the product form, or
- `{{ product | storelib_personalization }}`, or
- the app block `shopify://apps/storelib-personalization/blocks/personalization/storelib` (it shows as "Personalization" under Apps in the theme editor, in any section with `@app`).

When Storelib sees your code read `product.metafields.storelib.personalization`, it stops drawing its own fields and only adds its script. So if you draw your own, follow the markup contract below exactly, and the upload, the hold on Add to cart and the error messages all work with no script of yours. You may also write your own script, as long as it does the same things.

### 5. The markup contract (for fields you draw yourself)

```html
<div class="your-class" data-storelib-personalization data-product-id="{{ product.id }}"
     data-words='{"uploading":"...","photo_added":"...","photo_failed":"...","photo_wait":"...","fill_in":"Fill in {label}"}'>
  <!-- one per field, in position order -->
  <div data-storelib-pz-field="{{ f.id }}" data-label="{{ f.label | escape }}" data-type="{{ f.type }}" {% if f.required %}data-required{% endif %}>
    <!-- text / textarea -->
    <label for="pz-{{ f.id }}">{{ f.label }}</label>
    <input class="sl-pz__i" id="pz-{{ f.id }}" type="text" name="{{ f.name | escape }}" maxlength="{{ f.max_length }}" ...>
    <!-- image -->
    <input type="hidden" name="{{ f.name | escape }}" value="" data-storelib-upload-value>
    <input class="sl-pz__file" type="file" id="pz-{{ f.id }}" accept="{{ f.accept }}" data-storelib-upload>   <!-- NO name -->
    <label class="sl-pz__drop" for="pz-{{ f.id }}" tabindex="0" role="button">Upload a photo</label>
    <div class="sl-pz__ph" hidden><img alt=""><span>Photo added</span><button type="button" data-storelib-upload-remove>Remove photo</button></div>
    <!-- both -->
    <p class="sl-pz__err" role="alert" hidden></p>
  </div>
</div>
```

Rules:

- The wrapper has `data-storelib-personalization` and `data-product-id`. `data-words` is optional; without it English is used.
- Each field has `data-storelib-pz-field="<id>"`, `data-label`, `data-type`, and `data-required` when required.
- The file input has `data-storelib-upload` and **no `name`** (the file itself is never posted). The hidden input with `data-storelib-upload-value` carries the link.
- The script sets `data-state="uploading"` then `"done"` on the field, `data-invalid` when it shows an error, and fills `.sl-pz__err`. Style those states. `.sl-pz__ph` (preview) and `.sl-pz__drop` (pick a photo) swap with `hidden`.
- Place the wrapper inside the product form. If it has to sit outside, give the form an `id` and every named input `form="<that id>"`.
- While a required answer is missing or a photo is still uploading, Add to cart and Buy it now are held back and the field says why. If you have your own ajax Add to cart, do the same check before posting.

### 6. Where to draw them

- **Main product section** (`sections/main-product.liquid` or Materia's equivalent): above the quantity and buy buttons, inside the product form. Add a "Personalization" block type to the section schema so the seller can move it; when the block is not in the section, draw the fields above the buy buttons anyway (the seller turned them on in the product editor, they must always show).
- **Featured product section**: the same fields, the same form, the same rules. Make ids unique per section (`pz-{{ section.id }}-{{ f.id }}`), since one page can show the product twice.
- **Quick add / quick view**: if the product has a required field, do not add from the card. Send the buyer to the product page instead (Storelib already points `checkout_url` for such cards at the product page). Show the button as "Choose options" or the theme's equivalent.
- **Product cards in collections and search**: nothing to draw.

### 7. Cart lines

Show each line's properties under the item, in the cart drawer, the cart page and any mini cart: `{% for p in item.properties %}{% unless p.first starts_with '_' or p.last == blank %}...{% endunless %}{% endfor %}`.

- A text answer: `Label: answer`, keep line breaks (`| newline_to_br` after `| escape`).
- A photo answer: the value contains `/api/cart/uploads/`. Show a small thumbnail (`<img src="{{ p.last }}" width="48" height="48" loading="lazy" alt="">`, it opens in the buyer's own browser) and the file name, the last part of the value (`{{ p.last | split: '/' | last }}`), never the whole path.
- `/cart.js` returns `items[].properties` for drawers that redraw with JavaScript.

### 8. Words to translate

Add to `locales/*.json` (English and every locale Materia ships): `products.personalization.optional` ("Optional"), `upload_photo` ("Upload a photo"), `change_photo` ("Change photo"), `remove_photo` ("Remove photo"), `uploading` ("Uploading"), `photo_added` ("Photo added"), `photo_types` ("JPG, PNG or WEBP, up to 10 MB"), `photo_failed` ("The photo could not be uploaded. Try again."), `photo_wait` ("Wait for the photo to finish uploading."), `fill_in` ("Fill in {{ label }}"), `characters_left` ("{{ count }} characters left"). Pass them in `data-words`. The seller's labels, hints and help text are never translated by the theme; show them as given.

### 9. Look and feel

- Use the theme's own inputs (same height, border, radius, font). Inputs are at least 16px font on phones so iOS does not zoom.
- "Optional" next to fields that are not required, in a lighter tone. Never a red star.
- A character counter only when `max_length` is set and the buyer is within 20 characters of it.
- Errors under the field, in the theme's error colour, focus the first wrong field and scroll it into view.
- Motion only with transform and opacity. No hover effects on touch screens.
- The photo picker is a full-width button with an icon and the "JPG, PNG or WEBP, up to 10 MB" line; after upload, a 56px square preview with Remove photo.

### 10. Edge cases

- No fields: draw nothing, not even an empty wrapper.
- A variant change that redraws the section: answers already typed should stay (keep the inputs outside the part you redraw, or copy their values over). The Storelib script is delegated, so redrawn fields keep working.
- A label with quotes or `&`: always `| escape` in attributes; `name` must post exactly `properties[<label>]`.
- Digital products never have personalization; only products that ship do.
- The seller can change fields after orders were placed. Old orders keep what was asked then; never read fields from the order side.
- Do not store answers in local storage; the cart holds them.

### 11. Custom fields (product.metafields.custom)

The seller's custom fields (Products, the product, Custom fields card) reach the theme as `product.metafields.custom.<key>`, where `<key>` is the field name in lower case with `_` for spaces (`Care instructions` is `care_instructions`). Each prints as its value and has `.value`, `.key`, `.type` (`single_line_text_field`, or `multi_line_text_field` when the value has line breaks). In Storelib's own themes the same values are `product.fields.<key>`.

- Add a "Custom field" block to the main product section with a setting for the key and an optional heading, printing `product.metafields.custom[block.settings.key]`, multi-line values with `| newline_to_br`. Hide the block when the value is blank.
- If the theme has a details or specifications area, list the fields the seller asked to show there. Link values starting with `https://` as links.
- Never print a custom field's raw value unescaped.

### 12. Test plan (do all of it on a Storelib test store)

1. A mug with no fields: the product page looks exactly as before.
2. Add a required text field "Name to engrave" with limit 12, an optional long text "Gift message", and an optional photo field "Your photo".
3. Product page, desktop and phone (390px): the fields show above the buy buttons, in order, labels exactly as typed, Optional on the two optional ones.
4. Press Add to cart with the name empty: nothing is added, the field says "Fill in Name to engrave" and has focus.
5. Type 13 characters: the input stops at 12.
6. Upload a 12 MB photo: refused at once with the size message. Upload a PDF renamed .jpg: refused by `/cart/upload` with Storelib's message, shown under the field.
7. Upload a real JPG: a preview shows, "Photo added". Press Add to cart while it is still uploading: held with "Wait for the photo to finish uploading."
8. Add with "Ana", then again with "Bob": two cart lines, each showing its name; the photo line shows a thumbnail, not the link.
9. Buy it now with the fields filled: the checkout shows the answers under the item.
10. Place the order: the seller's order page shows the answers and the photo with Download (Notes, On the items); the buyer's email shows the answers, the photo by its file name.
11. Featured product section on the home page with the same mug: the same behaviour, and the ids do not clash with a quick view on the same page.
12. A custom field "Material" set to "Stoneware" and shown: it appears in the Custom field block and the details list; a multi-line "Care instructions" keeps its lines.

When done, report what you changed (files), screenshots of steps 3, 4, 7 and 8 on phone and desktop, and anything that did not work as this page says.
