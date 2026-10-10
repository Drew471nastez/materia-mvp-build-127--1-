# Website builder and Shopify import: October 2026 update

What changed, how it was checked, and what is still open. Live on `main` at
commit `b01b1fe`.

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
  blank, and kept its scroll. All pass on both themes.
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
