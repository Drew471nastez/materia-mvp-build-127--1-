/**
 * ===========================================================================
 *  A TOGGLE AND THE ICON IT DESCRIBES
 * ===========================================================================
 * Two of the four Header elements toggles did nothing. The panel wrote
 * `show_search` and `show_cart`; the header reads `show_search_icon` and
 * `show_cart_icon`, which is what the section's schema declares. Turning
 * either off changed a setting nothing looks at.
 *
 * All four also DREW the wrong state. `value={s.show_x}` is undefined on a
 * header nobody has touched, which a toggle shows as off, while the icon it
 * describes was on: every one of them opened by contradicting the header
 * beside it.
 *
 * The rule is one function now. These tests execute it, and then check that
 * both sides actually call it, because "both spell the key correctly" is not
 * an arrangement that holds.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolveEditorHref } from "../lib/website-builder/editor-navigation"
import { join } from "node:path"
import { HEADER_ICON_KEYS, headerIconOn } from "../lib/website-builder/header-icons"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\n  what the rule answers")

  check("a header nobody has touched shows every icon",
    headerIconOn(undefined, undefined) === true && headerIconOn(undefined) === true)

  check("off is off", headerIconOn(false) === false)
  check("on is on", headerIconOn(true) === true)

  check("a creator who turned it off under the old name keeps it off",
    headerIconOn(undefined, false) === false)

  check("and setting it now wins over that", headerIconOn(true, false) === true)

  check("a value that is not a boolean is not an answer",
    headerIconOn("false") === true && headerIconOn(0) === true && headerIconOn(null, "false") === true)

  console.log("\n  and both sides ask it")

  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")

  /* The keys are written out on both sides rather than reached through the
     constant, because the panel-coverage test reads these files for the
     setting names a section honours and an indirection hides them from it.
     What is shared is the RULE, which is where the bug was. */
  for (const [name, entry] of Object.entries(HEADER_ICON_KEYS)) {
    check(`the header reads ${name} through the rule`,
      new RegExp(`headerIconOn\\(s\\.${entry.key}`).test(header))
    check(`and the panel draws ${name} from it`,
      new RegExp(`headerIconOn\\(s\\.${entry.key}`).test(editor))
    check(`and writes the key the header reads for ${name}`,
      new RegExp(`onUpdateSetting\\("${entry.key}"`).test(editor))
  }

  check("no toggle writes a key the header does not read",
    !/onUpdateSetting\("show_search",/.test(editor) && !/onUpdateSetting\("show_cart",/.test(editor))

  check("and none of them reads a bare setting again",
    !/value=\{s\.show_(search|cart|account_icon|wishlist_icon)\}/.test(editor))

  console.log("\n  search opens where it was clicked, or on a page, and the creator picks")

  const schema = read("themes/default/sections/header.json")

  check("the choice is a control, not a guess",
    /"id": "search_behaviour"/.test(schema) && /"default": "header"/.test(schema))
  check("both answers are offered",
    /"value": "header"/.test(schema) && /"value": "page"/.test(schema))
  check("and the panel draws it",
    /onUpdateSetting\("search_behaviour"/.test(editor) && /Open it in the header/.test(editor))

  check("opening in the header is what a header that says nothing does",
    /str\(s\.search_behaviour, "header"\) !== "page"/.test(header))
  check("the icon becomes a button when it opens a field, and stays a link when it does not",
    /searchOpensInHeader \? \(/.test(header) && /href="\/search"/.test(header))
  check("the field is a form that works without any of this running",
    /action="\/search"/.test(header) && /method="get"/.test(header) && /name="q"/.test(header))
  check("and the menu's Search row opens the same field rather than leaving",
    /onOpenSearch/.test(header) && /window\.setTimeout\(onOpenSearch, CLOSE_MS\)/.test(header))
  check("the placeholder is the creator's",
    /"id": "search_placeholder"/.test(schema) && /str\(s\.search_placeholder, "Search"\)/.test(header))

  console.log("\n  what matches, while they are still typing")

  check("the field asks the site's own endpoint, which exists",
    /\/api\/website-builder\/search\?\$\{askAs\}/.test(header) && existsSync("app/api/website-builder/search/route.ts"))
  check("and the endpoint answers the same question the search page does",
    /productMatchesQuery/.test(read("app/api/website-builder/search/route.ts")))
  check("a request is debounced and the previous one is abandoned",
    /window\.setTimeout\(async \(\) =>/.test(header) && /ctrl\.abort\(\)/.test(header))
  check("View all goes to the search page with the words",
    /`\/search\?q=\$\{encodeURIComponent\(q\.trim\(\)\)\}`/.test(header))
  /* `items-center` now, not `items-stretch`: stretching the field and then
     capping it is what left it at the top of a tall header with its own
     magnifier below it. See tests/header-search.test.ts. The cap on the
     width, which is what this check is about, is unchanged. */
  check("the field is not as wide as a full-width header",
    /max-w-\[720px\] items-center gap-2/.test(header))
  check("published it asks by creator, in the editor by install, and with neither it says nothing",
    /creatorId \? `creator=/.test(header) && /installId \? `install=/.test(header) && /if \(!askAs \|\| !term\)/.test(header) &&
      /searchParams\.get\("install"\)/.test(read("app/api/website-builder/search/route.ts")))

  console.log("\n  padding is pixels, one number per device")

  const spacing = read("lib/website-builder/header-spacing.ts")
  /* The drawers are still `w-[85vw]`, which is right: a drawer's width IS a
     share of the screen. What must be gone is a SETTING expressed in a
     viewport unit and a template string that writes one into a style. */
  check("no setting is a viewport unit any more",
    !/`\$\{\w+\}vw`/.test(header) && !/"unit": "v[wh]"/.test(schema) && !/\bpaddingVw\b|\blinkSpacingVw\b/.test(header))
  check("the desktop shell and the phone shell each carry their own",
    /className="hidden md:flex w-full" style=\{\{ paddingTop: padDesktop/.test(header) &&
      /className="flex md:hidden w-full" style=\{\{ paddingTop: padMobile/.test(header))
  check("and the editor draws the one for the device it is showing",
    /forceMobile \? padMobile : padDesktop/.test(header))
  check("a vw somebody set is translated, not dropped",
    /headerPad\(s\.vertical_padding, s\.vertical_padding_vw/.test(header) && /PHONE_WIDTH = 390/.test(spacing))
  check("the panel offers desktop and phone separately, in px",
    /label="Vertical padding, desktop"/.test(editor) && /label="Vertical padding, phone"/.test(editor) &&
      (editor.match(/unit="px"/g) ?? []).length >= 3)

  console.log("\n  the link picker on a phone")

  /**
   * The nav's own picker (a fixed popover on a desktop, a list in the flow on
   * a phone) is gone: nav links and the call to action use the one link
   * field every other link uses.
   *
   * CHANGED ON PURPOSE. That field's list was in the flow at every width.
   * The owner asked for Shopify's: at a computer it now hangs from the field
   * (FieldPopover's `float`, measured and followed through the sidebar's
   * scroll in field-popover.tsx, scripts/check-link-field.mjs). On a phone
   * it is still in the flow, for the reason it always was: nothing there is
   * measured against a viewport iOS has scrolled under the keyboard.
   */
  const linkField = read("components/website-builder/link-picker.tsx")
  const fieldPopover = read("components/website-builder/field-popover.tsx")
  check("the link field's list goes through FieldPopover, floating only at a computer",
    !/function NavLinkPicker/.test(editor) && /<FieldPopover\s+float/.test(linkField) && /if \(float && !phone\) \{/.test(fieldPopover))
  check("and on a phone it is in the flow, neither portalled nor fixed",
    /function InFlowPanel\(/.test(fieldPopover) && !/position: ?"?fixed|createPortal/.test(fieldPopover.slice(fieldPopover.indexOf("function InFlowPanel("), fieldPopover.indexOf("export const FIELD_FLOAT_Z"))) && !/nav-link-picker-popup/.test(editor))

  console.log("\n  the page behind a drawer")

  const frame = read("components/website-builder/drawer-frame.ts")
  check("the document's scrollbar goes while a drawer is open",
    /root\.overflow = "hidden"/.test(frame))
  check("and its width is given back as padding, so nothing shifts",
    /body\.paddingRight = `\$\{barWidth\}px`/.test(frame))
  /*
    THE PACE IS NOW CHOSEN ONCE, NOT ONCE PER DRAWER.

    This used to count `drawerSlide(open)` and `drawerFade(open)` twice each
    in the header: the menu and the bag each wrote the transition into their
    own style prop. That is where they were, and it was also why the motion
    was not smooth — a transition set during a React commit starts counting
    from inside that commit and runs unpainted for as long as it takes (see
    useDrawerMotion in components/website-builder/drawer-frame.ts, and the
    frame counts in scripts/check-header-motion.mjs).

    Both drawers hand their panel and their backdrop to that one hook now, so
    the claim is stronger than it was: the two cannot disagree about the pace
    because neither of them names it. It is named in the hook, once.
  */
  check("both drawers move at the one pace",
    (header.match(/useDrawerMotion\(\s*open,\s*"transform"/g) ?? []).length === 2
      && (header.match(/useDrawerMotion\(open, "opacity", "0", "1"\)/g) ?? []).length === 2
      && (frame.match(/drawerSlide\(open\)/g) ?? []).length === 1
      && (frame.match(/drawerFade\(open\)/g) ?? []).length === 1)
  check("and the lists inside them have the slim bar",
    (header.match(/site-slim-scroll/g) ?? []).length >= 3)

  console.log("\n  the shop and the search page are pages the editor can open")

  const sectionsRoute = read("app/api/website-builder/themes/[installId]/sections/route.ts")
  const sitePages = read("lib/website-builder/site-pages.ts")
  /* The shop, the search page and the 404 page, and the account pages and
     contact (lib/website-builder/account-pages), named in one set. */
  /* And the collections page, Shopify's list-collections (lib/website-builder/shop-page). */
  check("the generated keys are named once",
    /GENERATED_PAGE_KEYS: ReadonlySet<string> = new Set\(\["products", "search", "404", "account", "login", "wishlist", "contact", "password", "collections", "collection"\]\)/.test(sitePages))
  check("and are built in, so they are not listed as pages somebody made",
    /BUILT_IN_PAGE_KEYS[^\n]*"products", "search"/.test(sitePages))
  check("the sections route generates them from the same builders the live site uses",
    /GENERATED_PAGE_KEYS\.has\(pageKey\)/.test(sectionsRoute) && /shopSections\(homeSections, theme\)/.test(sectionsRoute) && /searchSections\(homeSections\)/.test(sectionsRoute))
  /* Asked of the routing itself rather than of the editor's source: it is a
     function now, so "does /products open the shop" has an answer that does
     not depend on how the call happens to be written. */
  check("the canvas navigates to both",
    (() => {
      const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: true, shopPath: "/products", customPageKeys: [] }
      const shop = resolveEditorHref("/products", ctx)
      const search = resolveEditorHref("/search", ctx)
      return shop.kind === "page" && shop.key === "products" && search.kind === "page" && search.key === "search"
    })())
  /* One list of the site's pages now feeds the bar's page switcher and the Pages tab alike
     (sitePages, from PAGE_META), where the shop and its search are grouped under Shop. */
  check("and both are in the page lists",
    /products: \{ label: "Shop"/.test(read("lib/website-builder/types.ts")) && /search: \{ label: "Search"/.test(read("lib/website-builder/types.ts")) &&
      /* The collections page is filtered out while collections are off; every other key is listed. */
      /\.\.\.\(Object\.keys\(PAGE_META\) as PageKey\[\]\)(\.filter\(\(k\) => \(k !== "collections" && k !== "collection"\) \|\| builderCollections !== null\))?\.map\(\(k\) => \(\{ key: k, name: PAGE_META\[k\]\.label, path: pagePath\(k\) \}\)\)/.test(editor) &&
      /<PageSwitcher\s*\n\s*pages=\{sitePages\}/.test(editor) && /pages=\{sitePages\}/.test(editor.slice(editor.indexOf("const renderPageBrowser"))))
  check("the live shop and search prefer what the creator saved",
    /site\.pages\.products/.test(read("app/(site)/w/[username]/products/page.tsx")) && /site\.pages\.search/.test(read("app/(site)/w/[username]/search/page.tsx")))
  check("the canvas tells the field which site it is, so it can ask",
    /* Changed on purpose (round AE): the shop's words in the language previewed. */ /* Changed on purpose (the owner: currency in the builder like the live site): and the market previewed, and the theme switch as a preview. */ /const storefront = useMemo\(\(\) => \(\{ inEditor: true, installId(, words)?(, display, language, preview: languagePreview)? \}\), \[installId(, words)?(, display, language, languagePreview)?\]\)/.test(editor) && /storefront=\{storefront\}/.test(editor)
      && /install=\$\{encodeURIComponent\(installId\)\}/.test(header))

  console.log("\n  the field draws nothing native")

  const css = read("app/globals.css")
  check("the browser's clear control is gone", /\.hdr-search-field::-webkit-search-cancel-button/.test(css) && /hdr-search-field/.test(header))
  check("and the accent colour is the scheme's", /accentColor: scheme\.heading/.test(header))
  /* Still exactly the header row. The clip that enforces it moved onto the
     row itself, because on the box around it it was also cutting the
     suggestions that hang below the header. See below. */
  /* The `py-2` is gone: the header's own vertical padding was landing on
     this row as an inline style and beating it, and the two were a
     different number published from in the editor. The field is centred and
     capped instead, which needs no padding here at all. */
  check("the panel is exactly the header row, so it cannot hang below it",
    /className="absolute inset-0 z-\[70\]"/.test(header)
      && /"flex h-full w-full items-center overflow-hidden"/.test(header))

  console.log("\n  a card's picture fills its box")

  for (const f of ["product_grid", "product_featured", "product_spotlight", "search"]) {
    check(`${f} draws the image at the box's height`,
      /\.card__media img \{ display: block; width: 100%; height: 100%; object-fit: cover; \}/.test(read(`themes/default/sections/${f}.storelib`)))
  }
  check("the search page's own padding is 60 and 60",
    /"id": "padding_top",\s*"label": "Padding top",\s*"default": 60/.test(read("themes/default/sections/search.storelib")))

  console.log("\n  the gradient is made by looking at it")

  const panels = read("components/website-builder/editor/design-panels.tsx")
  check("the text field is gone", !/placeholder="linear-gradient\(135deg, #000 0%, #333 100%\)"/.test(panels))
  check("and the editor is in its place", /<GradientEditor value=\{current\.gradient\}/.test(panels) && existsSync("components/website-builder/editor/gradient-editor.tsx"))

  console.log("\n  the field, and the way out of it")

  /* What counts as "past the panel" changed: the panel is the whole header,
     and the empty band around the field is the most natural place to press
     to dismiss it. See tests/header-search.test.ts. */
  check("pressing past the search closes it, on the press",
    /document\.addEventListener\("pointerdown", onDown\)/.test(header)
      && /barRef\.current\?\.contains\(el\)/.test(header)
      && /listRef\.current\?\.contains\(el\)/.test(header))
  check("and the listener is taken off again",
    /document\.removeEventListener\("pointerdown", onDown\)/.test(header))
  /*
    THIS CHECK USED TO PIN THE BUG.

    It required `self-stretch` and `maxHeight: 44` and forbade
    `height: min(44px...)`, because an earlier `min(44px, 100%)` had fallen
    through to a floor: the percentage could not resolve inside a form that
    was itself sized by a percentage on a flex item.

    The percentage was never the problem — the indefinite parent was. The
    form has a definite height now, so the field can simply fill it, and the
    stretch-then-cap that this pinned is exactly what put the field at the
    top of a 104px header with its magnifier floating below it on a
    published site. What the check is really for is that the field has ONE
    definite height, so that is what it says now.
  */
  check("the field's height is the form's, capped, and resolves against something definite",
    /style=\{\{ height: "min\(44px, calc\(100% - 8px\)\)" \}\}/.test(header)
      && /className="hdr-search-field h-full w-full/.test(header)
      && !/self-stretch/.test(header.replace(/\/\*[\s\S]*?\*\//g, ""))
      && !/maxHeight: 44,/.test(header))

  console.log("\n  a field in the canvas can be typed in")

  const intercept = read("lib/website-builder/canvas-intercept.ts")
  check("the canvas knows what a typing control is",
    /export function isTypingTarget/.test(intercept) && /contenteditable/.test(intercept))
  check("and stops cancelling the press on one",
    /if \(isTypingTarget\(target\)\) return/.test(editor)
      && /if \(inspectorEnabled \|\| isCanvasNavigationLink\(target\)\) e\.preventDefault\(\)/.test(editor))

  console.log("\n  the wordmark is a font somebody chose")

  /*
    The logo sits inside an <a href="/">, and the theme's typography
    stylesheet gives every anchor in a section the BUTTON role's face, so the
    site's own name was drawn in whatever the buttons use. `logo_font`, the
    only thing that could have overridden it, is declared by no schema and
    offered by no panel, so it was never set and the value was always the
    word "inherit".

    Measured in scripts/check-logo-font.mjs, which renders one theme through
    ThemePage as a published page and as the canvas and reads the font off
    the logo in both: on a theme set to Playfair Display for headings, the
    wordmark came out in DM Sans.
  */
  /* The stack is a rule in lib/website-builder/header-settings.ts now, which
     also skips the schema's "inherit": inside a list it voided the whole
     declaration. */
  const headerRules = read("lib/website-builder/header-settings.ts")
  check("the wordmark names the heading face rather than inheriting one",
    /const logoFontStack = wordmarkFont\(s\.logo_font\)/.test(header) && /"var\(--theme-font-heading\)"/.test(headerRules))
  check("with a fallback that is the site's own type, not the browser's serif",
    /"var\(--theme-font-heading\)", "ui-sans-serif", "system-ui", "sans-serif"/.test(headerRules))
  check("and nothing inherits the anchor's font any more",
    !/fontFamily: str\(s\.logo_font, "inherit"\)/.test(header))
  check("measured on both surfaces rather than argued about",
    existsSync("scripts/check-logo-font.mjs") && existsSync("scripts/render-logo-font.tsx"))

  console.log("\n  the suggestions are not inside the box that clips the header")

  /*
    The panel is the header's own box and the row inside it clips, so the
    field can never make the header taller. The suggestions hang BELOW that
    row, so as a child of it every pixel was cut and all that reached the
    screen was the top hairline of a card under the field.

    Caught by scripts/check-nav-drawer.mjs, which asks the page what is at
    three points down the middle of the card rather than trusting its
    rectangle: with the clip back the card still measures 235px at the same
    place and none of those points reach it.
  */
  check("the panel itself clips nothing",
    /data-self-nav=""[\s\S]{0,2200}?className="absolute inset-0 z-\[70\]"/.test(header))
  check("the row it contains is what clips",
    /cn\(widthClass, paddingClass, "flex h-full w-full items-center overflow-hidden"\)/.test(header))
  check("and the suggestions are hung off the panel, under the field",
    /cn\(widthClass, paddingClass, "absolute left-0 right-0 top-full w-full"\)/.test(header)
      && /className="relative mx-auto w-full max-w-\[720px\] pr-11"/.test(header))
  check("nothing positions them inside the row any more",
    !/absolute left-0 right-11 top-full/.test(header))

  console.log("\n  the line under the header darkens, so it is never a white line")

  /*
    Twice reported as "what is that white line under the header". First it was
    the scheme's divider colour, which is light; then the header's own text
    colour, which on a dark header is white. A separator is a shadow, and a
    shadow is darker than what it falls on, so this one only ever darkens.
    Pure black rather than the slate tint used elsewhere, because a tenth of
    #0f172a laid over #000000 comes out LIGHTER than black, which
    scripts/check-header-seam.mjs photographed and measured at two levels.
  */
  check("it darkens rather than lightening, and in pure black",
    /inset 0 -1px 0 rgba\(0, 0, 0, \$\{borderStyleRaw === "subtle" \? 0\.05 : 0\.1\}\)/.test(header))
  check("no light colour is mixed into it any more",
    !/inset 0 -1px 0 color-mix/.test(header) && !/inset 0 -1px 0 \$\{borderColor\}/.test(header))
  check("and the depth shadow under it is black for the same reason",
    /0 1px 0 rgba\(0, 0, 0, 0\.04\), 0 4px 12px -6px rgba\(0, 0, 0, 0\.08\)/.test(header))
  check("measured in pixels rather than argued about",
    existsSync("scripts/check-header-seam.mjs") && existsSync("scripts/render-header-seam.tsx"))

  console.log("\n  no scrollbar behind an open drawer")

  check("the page is told a drawer is open",
    /setAttribute\("data-drawer-open", ""\)/.test(frame) && /removeAttribute\("data-drawer-open"\)/.test(frame))
  check("and while it is, neither the document nor the body draws one",
    /html\[data-drawer-open\],\s*\n\s*html\[data-drawer-open\] body \{/.test(read("app/globals.css")))

  console.log("\n  the call to action reaches a phone")

  check("the drawer is given one", /cta=\{/.test(header) && /interface DrawerCta/.test(header))
  check("gated by the same toggle the desktop button uses",
    /s\.show_cta_button !== false && str\(s\.cta_text/.test(header))
  check("in the same colours as the desktop button: the header's scheme, its own Advanced colors, hover included",
    /style: ctaButton\.style/.test(header) && /data-sl-button="primary"\s*data-button=""\s*style=\{cta\.style\}/.test(header))
  check("the desktop button reads the header's scheme after its overrides, never an unrelated theme colour",
    /const scheme = sectionColors\(\{ \.\.\.section, settings: \{ \.\.\.s, color_scheme: schemeKey \} \}, theme\)/.test(header)
      && /const ctaButton = schemeButton\(scheme, "primary", \{ background: str\(s\.cta_color\), text: str\(s\.cta_text_color\) \}\)/.test(header)
      && !/theme\.primary_color \|\| "#6366f1"/.test(header))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
