/**
 * ROUND 67 (p3): THE SHOP PARTS OF EVERY THEME.
 *
 *   WISHLIST    a header of words shows "Wishlist (N)" (the count's box at the label's size, not the icon's 0), a
 *               count bubble's number is worked out from its own fill with the line at a luminance of 0.31 (white on
 *               Redline's red), both in the head of every installed theme's page (shop-calm.ts) and in Materia's
 *               own stylesheets for new installs.
 *   WISHLIST    /pages/wishlist and /wishlist draw the theme's own Wishlist template (Materia's search.wishlist),
 *   PAGE        which reads the list the theme's hearts write, live, in a preview link and in the builder's
 *               canvas; a theme without one keeps Storelib's page.
 *   PICTURES    lib/images/pic-fit.ts: a picture within 8% of its frame's shape fills it; a row whose pictures are
 *               mostly another shape takes theirs (snapped to 16:9, 3:2, 4:3, 1:1, 4:5, 3:4, 2:3).
 *   ROWS        Recently viewed never shows the page's product or one the related row shows, waits for the related
 *               row, and hides itself whole when nothing is left (shop-rows.ts, in every installed theme's head).
 *   ABOUT       a website the admin console built before round 66, whose menu links /pages/about and which has no
 *               About page, is drawn with the About page tailor.ts writes now (about-fallback.ts).
 *   REDLINE     the product page is Materia's main product section with its gallery on the section's own settings.
 *
 * Chromium: scripts/serve-template-r67.ts with the probes listed in the round's report.
 *
 *   npx tsx tests/commerce-r67.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SHOP_CALM_CSS } from "@/lib/storelib-theme/compat/shop-calm"
import { SHOP_ROWS_HEAD, installShopRows } from "@/lib/storelib-theme/compat/shop-rows"
import { installPicFit } from "@/lib/images/pic-fit"
import { aboutFallbackSections, looksAdminBuilt } from "@/lib/admin/creator-site/about-fallback"
import { isWishlistPath, themeWishlistTemplate } from "@/lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWISHLIST")
{
  check("a header of words: the count's box takes the label's size", /\.header\[data-actions-text\] \.header__action \.header__wishlist h-count\{[^}]*font-size:inherit!important/.test(SHOP_CALM_CSS))
  check("a bubble's number: white under a luminance of 0.31, one class over Materia's rule", /html body \.h-count\.h-count:not\(\.header-action-text \.h-count\)[^{]*\{--cb-auto:clamp\(0,\(0\.31 - /.test(SHOP_CALM_CSS))
  check("Materia's own stylesheet: the same line, for new installs", /--cb-auto: clamp\(0, \(0\.31 - /.test(read("theme-packages/materia/base/assets/header-section.css")))
  check("Materia's own stylesheet: the count's box in text mode", /\.header__wishlist h-count \{[\s\S]{0,200}font-size: inherit !important/.test(read("theme-packages/materia/base/assets/header-layout.css")))
  /* The line itself: Redline's red takes white, yellow and white take black. */
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255) }
  const white = (hex: string) => lum(hex) < 0.31
  check("white on Redline's red #f01a10, orange #ff5722, blue #2196f3, mid grey #888888", ["#f01a10", "#ff5722", "#2196f3", "#888888"].every(white))
  check("black on yellow #ffd400, light green #8ee28e, white, pastel pink #f8c8dc", !["#ffd400", "#8ee28e", "#ffffff", "#f8c8dc"].some(white))
}

console.log("\nWISHLIST PAGE")
{
  check("/wishlist and /pages/wishlist are the wishlist, nothing else is", isWishlistPath("/wishlist") && isWishlistPath("/pages/wishlist/") && isWishlistPath("/pages/wishlist?x=1") && !isWishlistPath("/pages/wishlisted") && !isWishlistPath("/account"))
  check("Materia's search.wishlist is the theme's own template", themeWishlistTemplate({ files: { "templates/search.wishlist.json": "{}", "templates/page.wishlist.json": "{}" } }) === "search")
  check("a page.wishlist alone is used", themeWishlistTemplate({ files: { "templates/page.wishlist.liquid": "" } }) === "page")
  check("a theme with neither keeps Storelib's page", themeWishlistTemplate({ files: {} }) === null)
  const site = read("lib/storelib-theme/compat/site.ts")
  check("both addresses draw the theme's own before Storelib's", /return themeWishlist\(site, req, path\) \?\? accountShell\(site, req, path\)/.test(site) && /path === "\/pages\/wishlist" && !site\.pages\.wishlist\) return themeWishlist\(site, req, path\) \?\? accountShell/.test(site))
  check("the builder's canvas draws it (canvasAccountPage) when the theme has one", /if \(isWishlistPath\(clean\)\)[\s\S]{0,300}themeWishlist\(/.test(site) && /isWishlistPath\(to\) && compatTheme && themeWishlistTemplate\(compatTheme\) !== null/.test(read("components/website-builder/compat/compat-canvas.tsx")))
  check("the tab says Wishlist, not Search", /t === "search" && page\.suffix === "wishlist"/.test(site))
  check("Materia ships search.wishlist.json", !!read("theme-packages/materia/base/templates/search.wishlist.json"))
}

console.log("\nPICTURES")
{
  type Parts = { axisOf: (n: number, b: number) => "x" | "y" | null; shapeOf: (r: number[], f: number) => number | null; snap: (r: number) => number }
  const win: Record<string, unknown> = {}
  const doc = {
    readyState: "complete",
    baseURI: "https://shop.test/",
    location: { origin: "https://shop.test" },
    head: { appendChild: () => {} },
    documentElement: { classList: { add: () => {} } },
    images: [],
    addEventListener: () => {},
    createElement: () => ({ setAttribute: () => {}, textContent: "" }),
  }
  installPicFit(doc as unknown as Document, win as unknown as Window)
  const p = win.__slPicFitParts as Parts
  check("a 4:5 photo in a 3:4 card fills it (6% off)", p.axisOf(0.8, 0.75) === null)
  check("a 16:9 banner in a 3:4 card is not cut: bands", p.axisOf(16 / 9, 0.75) === "y")
  check("a row of 16:9 banners in 3:4 cards takes 16:9", Math.abs((p.shapeOf([1.78, 1.77, 1.78], 0.75) ?? 0) - 16 / 9) < 0.001)
  check("a row of 4:3 photos in square cards takes 4:3", Math.abs((p.shapeOf([1.33, 1.33, 1.34], 1) ?? 0) - 4 / 3) < 0.001)
  check("a row of 2:3 posters in 3:4 cards takes 2:3 (11% off is a cut)", Math.abs((p.shapeOf([0.667, 0.667], 0.75) ?? 0) - 2 / 3) < 0.001)
  check("a row whose pictures are near the frame keeps the theme's shape", p.shapeOf([0.8, 0.75, 0.78], 0.75) === null)
  check("a mixed row takes its middle picture's shape", Math.abs((p.shapeOf([1.78, 1.33, 1, 0.67, 0.67], 0.75) ?? 0) - 1) < 0.001)
  check("snapped: 1500x1000 is 3:2, a 0.7 poster is 2:3, a 21:9 banner is 16:9", p.snap(1.5) === 3 / 2 && p.snap(0.7) === 2 / 3 && p.snap(21 / 9) === 16 / 9)
  check("the fill is drawn as cover", /img\[data-pic-fit="fill"\]\{object-fit:cover!important\}/.test(read("lib/images/pic-fit.ts").replace(/'\s*\+\s*\n\s*"/g, "")) || read("lib/images/pic-fit.ts").includes(`img[data-pic-fit="fill"]{object-fit:cover!important}`))
  const fit = read("lib/images/pic-fit.ts")
  check("a frame on screen never changes shape: shapes are placed only as a frame is put in the page, from shapes kept before", /new MutationObserver[\s\S]{0,900}place\(found\[q\]/.test(fit) && !/setShape\(/.test(fit.slice(fit.indexOf("var learn"), fit.indexOf("var place"))) && /var v = seen\[keyOf\(pic, own\)\]\s*if \(v > 0\) setShape\(frame, v\)/.test(fit))
  check("a theme whose frames already differ (Adapt) is left as it is", /if \(own\.length !== 1 \|\| !ratios\.length\) return/.test(read("lib/images/pic-fit.ts")))
}

console.log("\nROWS")
{
  check("in the head of every installed theme's page", read("lib/storelib-theme/compat/theme.ts").includes("SHOP_ROWS_HEAD"))
  check("the script parses", (() => { try { new Function(SHOP_ROWS_HEAD.replace(/^<script[^>]*>|<\/script>$/g, "")); return true } catch { return false } })())
  check("no word naming another platform in it (a .shopify-section class is the page's own markup)", !/liquid|Shopify\./.test(installShopRows.toString()))
  /* A page in a small DOM: the related row shows B and C, Recently viewed A, B and the page's own product D. */
  type El = { tag: string; attrs: Record<string, string>; children: El[]; parent: El | null; hidden?: boolean; style: Record<string, string> & { display?: string } }
  const el = (tag: string, attrs: Record<string, string> = {}, children: El[] = []): El => { const e: El = { tag, attrs, children, parent: null, style: {} }; children.forEach((c) => (c.parent = e)); return e }
  const card = (h: string) => el("li", { class: "r7rv__item" }, [el("a", { href: `/products/${h}` })])
  const relCards = el("div", { class: "products-grid__items" }, [el("div", { class: "product-item" }, [el("a", { href: "/products/b" })]), el("div", { class: "product-item" }, [el("a", { href: "/products/c" })])])
  const related = el("product-recommendations", {}, [relCards])
  const track = el("ul", { "data-r7k-track": "" }, [card("a"), card("b"), card("d")])
  const rv = el("div", { "data-r7k-root": "recently-viewed" }, [track])
  const rvSection = el("div", { class: "shopify-section" }, [rv])
  const body = el("body", {}, [el("div", { class: "shopify-section" }, [related]), rvSection])
  const all = (root: El): El[] => [root, ...root.children.flatMap(all)]
  const matches = (e: El, sel: string): boolean =>
    sel.split(",").some((s) => {
      s = s.trim()
      if (s === "product-recommendations") return e.tag === "product-recommendations"
      if (s.startsWith('[data-r7k-root="recently-viewed"]')) return e.attrs["data-r7k-root"] === "recently-viewed"
      if (s.startsWith("a[href")) return e.tag === "a" && /\/products\//.test(e.attrs.href ?? "")
      if (s === ".shopify-section") return /shopify-section/.test(e.attrs.class ?? "")
      if (s === "ul") return e.tag === "ul"
      if (s === "[data-r7k-track]") return "data-r7k-track" in e.attrs
      return false
    })
  const wrapped = new Map<El, unknown>()
  const wrap = (e: El): unknown => wrapped.get(e) ?? (wrapped.set(e, wrapOnce(e)), wrapped.get(e))
  const wrapOnce = (e: El): unknown => ({
    get hidden() { return !!e.hidden }, set hidden(v: boolean) { e.hidden = v },
    style: e.style,
    get parentElement() { return e.parent ? wrap(e.parent) : null },
    get parentNode() { const up = e.parent; return up ? { removeChild: (c: { __el: El }) => { up.children = up.children.filter((x) => x !== c.__el) } } : null },
    __el: e,
    getAttribute: (k: string) => e.attrs[k] ?? null,
    setAttribute: (k: string, v: string) => (e.attrs[k] = v),
    hasAttribute: (k: string) => k in e.attrs,
    removeAttribute: (k: string) => delete e.attrs[k],
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    querySelector: (sel: string) => { const f = all(e).slice(1).find((x) => matches(x, sel)); return f ? wrap(f) : null },
    querySelectorAll: (sel: string) => all(e).slice(1).filter((x) => matches(x, sel)).map(wrap),
    closest: (sel: string) => { let at: El | null = e; while (at) { if (matches(at, sel)) return wrap(at); at = at.parent } return null },
  })
  const page = wrap(body) as { querySelector: (s: string) => unknown; querySelectorAll: (s: string) => unknown[] }
  const doc = {
    readyState: "complete",
    baseURI: "https://shop.test/products/d",
    location: { href: "https://shop.test/products/d" },
    documentElement: { classList: { add: () => {}, remove: () => {} } },
    head: { appendChild: () => {} },
    body: page,
    createElement: () => ({ setAttribute: () => {}, textContent: "" }),
    addEventListener: () => {},
    querySelector: page.querySelector,
    querySelectorAll: page.querySelectorAll,
  }
  const win = { setTimeout: () => 0, requestAnimationFrame: () => 0 } as unknown as Window
  installShopRows(doc as unknown as Document, win)
  const left = track.children.map((c) => c.children[0].attrs.href)
  check("Recently viewed keeps A only: B is in the related row, D is this page", JSON.stringify(left) === JSON.stringify(["/products/a"]), left)
  check("the related row is untouched", relCards.children.length === 2)
  /* Nothing new: A viewed and also related. */
  track.children = [card("b")]
  track.children.forEach((c) => (c.parent = track))
  delete (win as unknown as { __slShopRows?: unknown }).__slShopRows
  installShopRows(doc as unknown as Document, win)
  check("nothing new left: the row and its section are hidden whole", track.children.length === 0 && rv.hidden === true && rvSection.style.display === "none")
}

console.log("\nABOUT")
{
  const liam = {
    settings: {},
    themeValues: { instagram: "" },
    pages: {
      home: [
        { id: "header", type: "header", group: "header" },
        { id: "hero", type: "hero-image1", settings: {} },
        { id: "products", type: "products-listing", settings: {}, blocks: [{ id: "heading", type: "heading", settings: { text: "Gym Programmes" } }] },
        { id: "footer", type: "footer", group: "footer" },
      ],
      product: [],
    },
    menuLinks: ["/", "/collections/all", "/pages/about"],
    products: [{ id: "p1", title: "The Skinny To Strong Programme" }, { id: "p2", title: "Gym Beginner Program" }],
    shopName: "liam bailey",
    avatar: "https://storelib.com/media/avatars/liam.jpg",
    typeOf: (t: string) => t,
    hasSection: () => true,
  }
  const page = aboutFallbackSections(liam)
  check("liam-bailey.storelib.com as measured (tailored home, menu to /pages/about, no About): an About page", !!page && page.length === 3, page)
  check("  his photo, 'About', his name as the h1, a button to the products", page?.[0].type === "Image-and-video-text" && page[0].settings?.image === liam.avatar && page[0].blocks?.some((b) => b.type === "heading" && b.settings?.text === "liam bailey" && b.settings?.tag === "h1") === true && page[0].blocks?.some((b) => b.type === "button") === true)
  check("  his products under his heading", page?.[1].type === "products-listing" && page[1].blocks?.[0]?.settings?.text === "Gym Programmes" && page[1].settings?.items_to_show === 2)
  check("  a way to write to him", page?.[2].type === "text-columns" && JSON.stringify(page[2].blocks).includes("/pages/contact"))
  check("  no bio written for him (he wrote none)", !JSON.stringify(page).includes("subheading"))
  check("without a photo: his name over the page, no stock photograph", aboutFallbackSections({ ...liam, avatar: null })?.[0].type === "text-columns")
  check("an About page of his own is drawn instead", aboutFallbackSections({ ...liam, pages: { ...liam.pages, about: [{ id: "x", type: "page-default" }] } }) === null)
  check("a menu without About: nothing added", aboutFallbackSections({ ...liam, menuLinks: ["/"] }) === null)
  check("a website the admin console did not build: nothing added", aboutFallbackSections({ ...liam, pages: { ...liam.pages, home: [{ id: "slideshow", type: "slideshow" }] } }) === null)
  check("the admin console's mark is enough", looksAdminBuilt({ storelib_admin_built: { by: "admin", at: "x" } }, []))
  check("a theme without the sections: nothing added", aboutFallbackSections({ ...liam, hasSection: (t: string) => t !== "text-columns" }) === null)
  check("drawn into the site when it is read, never written", /aboutFallbackSections\(\{[\s\S]{0,900}if \(about\) pages\.about = /.test(read("lib/website-builder/compat-site.ts")))
}

console.log("\nREDLINE")
{
  const tree = JSON.parse(read("theme-packages/materia/templates/rail/templates/product.json").replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)+/, "")) as { sections: Record<string, { type: string; settings: Record<string, unknown>; block_order?: string[] }> }
  const main = tree.sections.main
  check("the product page is Materia's main product section", main.type === "main-product")
  check("its gallery is the section's own (no layout, width or media settings of the template's own)", !["desktop_layout", "desktop_media_width", "media_square", "mobile_options", "mobile_slides_per_view", "enable_nav_dots_mobile", "image_zoom"].some((k) => k in main.settings), main.settings)
  check("its content is kept (title, price, options, buttons, details)", ["title_1", "price_1", "variant_picker_1", "buy_buttons_1", "collapsible_row_1"].every((b) => main.block_order?.includes(b)))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
