# Website builder and Shopify import: October 2026 update

What changed, how it was checked, and what is still open. The first round
went live at commit `b01b1fe`; the second round (10 October) is listed under
its own heading below.

## Importing a Shopify theme

- A whole theme ZIP (Dawn, Horizon and others built the same way) imports
  through Import theme. Its files, sections, blocks, settings and pages are
  kept, and it draws on Storelib's own engine with no Shopify connection.
- Products, collections, variants, cart, checkout, search, filters and
  product recommendations all come from the creator's own shop.
- Anything that cannot be used is listed in `shopify/import-report.json`,
  never dropped without a word.
- Older themes whose header and footer are placed directly in the layout now
  import them as normal sections, which can be selected and edited.
- Other Shopify section groups (overlay, aside, custom) import into the new
  Overlay group. Exporting the theme puts each one back where it came from.
- Header group sections carry the class Shopify uses
  (`shopify-section-group-header-group`), which Dawn's sticky header needs.
- Default words written as translation keys (`t:sections...`) show as real
  words.

## Editing an imported theme in the builder

- Saves work. Sections from Shopify's header and footer groups had no name,
  and every save of such a page was refused as "Invalid body". They are named
  on import, and the save routes accept a section without a name.
- A save that does not go through shows a small banner under the top bar:
  what happened and one button that fixes it (try again, undo, reload, sign
  in). It stays until a save succeeds.
- No flashing and no blank canvas. Editing, adding, hiding, deleting, moving
  and undoing a section, and changing a theme colour, all change the page in
  place without reloading it. When a full reload is needed, the new page
  loads hidden behind the current one and swaps in once it is ready.
- The toolbar over the canvas (move, duplicate, hide, delete) works on
  imported sections.
- Add section shows each of the theme's sections drawn by the theme itself,
  with its own fonts and stylesheets.
- The store's menus show in the theme's header and footer in the builder, as
  they do on the live site.
- Clicking a link in the header or footer opens that page in the builder.
- On the live site, `/products` goes to all products (`/collections/all`), as
  on Shopify.
- Theme settings include each colour scheme (Dawn) and the colour palette
  (Horizon). A change shows on the page straight away.

## For every theme, Storelib's own included

- **Overlay group.** A new group in the sidebar, after Footer, for what
  floats over the page: popups, a bar fixed to the bottom of a phone, back to
  top. It shows when the theme has such a section, and its sections are on
  every page, as the header and footer are.
- **Two default collections.** Every store starts with All products (it holds
  every product automatically) and Home page (pick products for it). A
  default that is deleted stays deleted.

## Security of imported themes

- A theme's own code runs only on the creator's website address, never on
  storelib.com, where people are signed in.
- The page that draws an imported site answers only requests the platform
  forwards to it. Each forwarded request is signed, and a request typed in
  directly gets "not found".
- Theme files are served so that nothing inside them can run on
  storelib.com.
- In the builder, the theme runs in a sealed frame that cannot reach the
  builder or the account.

## Second round, 10 October

### Imported themes

- **Hover and focus.** Theme settings has a new group, Hover and focus, on
  every imported theme: button colour, text and border on hover, a hover
  effect (the theme's own, none, lift, darken, underline), link colour on
  hover, and the border, focus colour and corners of input boxes. Empty
  means the theme's own.
- **Selection outline.** The outline around a hovered or selected section
  in the canvas is drawn in one piece over the page, so it has no gaps,
  cuts or seams where the theme clips or overlaps its sections.
- **Add section cards.** No card is empty: blocks a section keeps fixed
  (Horizon's carousel) are drawn, theme styles that load late are turned
  on, and each card fades in once it is ready instead of popping in.
- **Section names.** A section is called what the theme calls it (Image
  banner, Featured collection), not by a generic word or a translation key.
- **Product data.** A featured product, a featured collection or a
  product tab left on the theme's placeholder shows the shop's own products
  (All products, or its first product) on the canvas and the live site.
- **Policy pages.** `/policies/refund-policy` and the other three draw the
  store's own policy inside the theme's header and footer. On a Storelib
  theme the same addresses go to the store's own policy pages.
- **Account pages.** Sign in, sign up, account and wishlist pages on an
  imported theme keep the theme's header and footer, with the account form
  in between.

### Every theme

- **Overlay group, with three sections.** The Overlay group is always in
  the sidebar after Footer, and its Add section offers:
  - Back to top: a button in a corner, shown once the page is scrolled.
  - Phone tab bar: up to five links fixed to the bottom of a phone (home,
    shop, search, cart, account and more). A tab can open the cart, search
    or the menu. Not shown on wider screens.
  - Popup: opens after a few seconds with an email sign-up (into
    Subscribers) or a button. Closed once, it stays closed for that visitor.
  In the builder each is drawn in the page and visible so it can be edited.
  On the live site they float over the page and above the header, and back
  to top and a corner popup sit above the tab bar rather than under it.

### Live sites stay up

- A slow or failing database read is tried again once within a few seconds.
- If it still fails, the site keeps serving the last good copy it had
  instead of an error. A site that has never been read shows a short "back
  in a moment" page that refreshes itself, never a "not found".
- A custom domain whose lookup fails is answered the same way, never sent
  to the wrong page.

### SQL

The three files in `supabase/sql/all-in-three/` hold every part, 01 to 108:

- `1_of_3_core_library_checkout.sql`
- `2_of_3_latest.sql`
- `3_of_3_storage_policies_and_check.sql`

Run them in that order in the Supabase SQL editor. Each part is safe to run
again.

## Third round

### Imported themes

- **Picked products show.** A product picked in a section's sidebar
  (Featured product and the like) is the product the canvas and the live
  site draw, memberships included. It was saved as the product's address
  and read only as an id, so the theme fell back to its "Example product
  title".
- **Cart drawers.** After an add to cart, the theme's drawer or notification
  shows the new line, as on Shopify. Horizon's drawer said "Your cart is
  empty" after every add, because its contents were drawn for the cart page.
  Also supported now:
  - `/cart?view=drawer` and other alternate templates that older themes
    fetch for their drawers and quick views
  - add-to-cart links (`/cart/add?id=…&quantity=…`)
  - cart permalinks (`/cart/<variant>:<quantity>`), straight to checkout
- **Headers in every kind of theme.**
  - Shopify's newest themes (Skeleton) place the header and footer as
    blocks in the layout and have no sections at all. They were refused at
    import; they import and draw now, header first, on the live site and in
    the builder.
  - Older themes (Timber, Debut, Brooklyn and others) keep their stylesheet
    as SCSS that Shopify compiled. It is compiled now, so they no longer
    draw unstyled.
- **Pages of an imported theme stay its own.** A page with no sections (one
  the theme draws from a Liquid template) is no longer given Storelib's
  header, footer and product section in the builder.

### The builder

- **Product pages.** Opening one product page after another always shows
  the product opened, even when two products share a name. On an imported
  theme the product page shows the product opened, not the shop's first.
- **Page changes.** Another page fades in rather than replacing the last in
  a single frame, on Storelib themes and imported ones.

### Live sites

- **Faster page changes.** A link is fetched while the pointer rests on it,
  so the page is ready by the click. Cart, checkout and account links are
  never fetched ahead.
- **No flash between pages.** The page being left stays on screen until the
  next one is drawn, then the two cross-fade in 160ms, so the header and
  logo do not blink. Off for visitors who ask for less motion, and ignored by
  browsers that do not support it.

## How it was checked

- **Browser tests on Dawn and Horizon**
  (`scripts/check-compat-editor.ts`, `scripts/check-shopify-theme.ts`).
  These drive the real builder and the live site handler in Chromium and
  cover:
  - selecting and editing a section
  - hide, show, delete, undo and move
  - adding a section from Add section
  - changing a colour scheme or palette colour
  - clicking a header link
  - a refused save showing the banner
  - every page type of the live site, add to cart, options, search and
    filters

  After each edit they confirm the canvas showed the same page, never went
  blank, and kept its scroll. All pass on both themes. Since the second
  round they also measure the selection outline, the hover and focus
  settings on a hovered button, every Add section card, policy pages and
  account pages.
- **Overlay sections.** `scripts/check-overlay-sections.mjs` adds each one
  through the real builder and measures it in the canvas and in its card;
  `scripts/check-overlay-live.ts` measures them on a visitor's page at
  phone and computer widths (scroll, delay, close, remembered, fixed
  positions). All pass.
- **Live site resilience.** `tests/site-resilience.test.ts`.
- **Third round.**
  - `scripts/check-product-switch.mjs`: product pages opened one after
    another, including two with the same name.
  - `scripts/check-live-navigation.ts`: fetched ahead, the view transition,
    reduced motion.
  - `scripts/check-shopify-theme.ts` now opens the cart drawer after an add
    (Dawn as a notification and as a drawer, Horizon from the header and
    opening on add), and was run on Shopify's Skeleton and Timber themes.
  - `tests/compat-engine.test.ts` and `tests/shopify-import.test.ts` cover
    picked products, `?view=`, cart links, `{% block %}`, `{% partial %}`
    and SCSS.
- **Unit tests.** `tests/editor-groups-saves.test.ts`,
  `tests/compat-engine.test.ts`, `tests/shopify-import.test.ts`,
  `tests/section-groups.test.ts` and the other related suites pass.
- **Whole test suite.** No test fails that did not already fail on `main`
  before this work.
- **Production build.** Passes.

## Still open

- **Database part to run.** `supabase/sql/run-now/108_default_collections.sql`
  should be run in Supabase as usual. Until then the app creates the default
  collections itself.
- **Not yet tried on the real store.** Everything above was checked on copies
  of Dawn and Horizon with test data. A real import on the live store is the
  next step.
- **Things a Shopify theme can have that Storelib cannot use yet:**
  - blog posts (Storelib has no blog yet)
  - Shopify app blocks
  - alternate templates such as `product.preorder`, which are kept but
    cannot be assigned to a product
- **"Artha".** No AI model, theme or preset by that name exists anywhere in
  the code or its history. The AI picker has Luna (the default) and Terra.
  Waiting on where it was seen.
