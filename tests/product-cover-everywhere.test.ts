/**
 * ===========================================================================
 *  ROUND AL: A PRODUCT'S PICTURE IN ITS OWN SHAPE EVERYWHERE BUT EXPLORE
 * ===========================================================================
 * The owner: a portrait cover shows with grey bars (the product editor's 16:9 padding) in places where it should not.
 * Only Explore and the marketplace keep the padded 16:9 card. What scripts/check-product-cover-ratio.mjs measures in
 * a browser, held here:
 *
 *   TRIM      the page's own trim (lib/images/cover-trim) finds the padding as lib/images/letterbox does, is in the
 *             head of Storelib's pages, its themes' websites and an imported theme's documents, and leaves Explore
 *             and FramedPicture's own pictures alone
 *   ROWS      the cover as uploaded (products.cover_original_url, SQL part 377) is read in a request of its own and
 *             laid over the rows; a database without it, or a failed read, leaves them as they were
 *   PLACES    a website's cards and product page, the store's grid, the library, the website checkout, the builder's
 *             product list and the editor's tiles use it; Explore's cards do not
 *   UPLOAD    the editor still keeps both files, and an import's pictures are never padded
 *
 *   npx tsx tests/product-cover-everywhere.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COVER_TRIM_HEAD, COVER_TRIM_SCRIPT, PADDED_COPY, installCoverTrim } from "@/lib/images/cover-trim"
import { findLetterbox } from "@/lib/images/letterbox"
import { originalCoversOf, productCover, rowsWithOriginalCovers, withOriginalCoverRow } from "@/lib/products/cover"
import { toCard } from "@/lib/website-builder/shop-products"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

type Box = { x: number; y: number; w: number; h: number } | null
/* The trim's own detector, taken from a run of it on a page that is not there (it hangs it on the window). */
function trimDetector(): (px: ArrayLike<number>, w: number, h: number) => Box {
  const win: Record<string, unknown> = {}
  const doc = {
    createElement: () => ({ setAttribute() {}, textContent: "" }),
    head: { appendChild() {} },
    documentElement: { classList: { add() {} }, appendChild() {} },
    addEventListener() {},
    readyState: "complete",
    images: [],
  }
  installCoverTrim(doc as unknown as Document, win as unknown as Window)
  return win.__slCoverBox as (px: ArrayLike<number>, w: number, h: number) => Box
}

/* A picture `W` x `H`, RGBA: `fill(x, y)` gives each pixel. */
function picture(W: number, H: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fill(x, y)
      const o = (y * W + x) * 4
      px[o] = r
      px[o + 1] = g
      px[o + 2] = b
      px[o + 3] = 255
    }
  return px
}
const stripes = (x: number, y: number): [number, number, number] => (y % 9 < 2 ? [184, 51, 106] : [127, 36, 80])
const grey = (x: number, y: number, W: number, H: number): [number, number, number] => {
  const t = (x / W + y / H) / 2
  const v = Math.round(248 - 16 * t)
  return [v, v, v]
}

console.log("TRIM")
{
  const find = trimDetector()
  check("the trim hangs its detector on the window once installed", typeof find === "function")
  const W = 128
  const H = 72
  /* The editor's padding: a 4:5 cover fit by height in the middle of 16:9, on the grey gradient. */
  const coverW = Math.round(H * 0.8)
  const left = Math.round((W - coverW) / 2)
  const padded = picture(W, H, (x, y) => (x >= left && x < left + coverW ? stripes(x, y) : grey(x, y, W, H)))
  const a = find(padded, W, H)
  const b = findLetterbox(padded, W, H)
  check("it finds the editor's padding, as findLetterbox does", !!a && JSON.stringify(a) === JSON.stringify(b), { a, b })
  /* Bars above and below (a panorama), a one-sided white margin, a picture with no bars. */
  const wide = picture(W, H, (x, y) => (y >= 14 && y < H - 14 ? stripes(x, y) : [240, 240, 240]))
  check("bars above and below, the same as findLetterbox", JSON.stringify(find(wide, W, H)) === JSON.stringify(findLetterbox(wide, W, H)) && !!find(wide, W, H))
  const oneSide = picture(W, H, (x, y) => (x < 20 ? [255, 255, 255] : stripes(x, y)))
  check("a white margin on one side only is the picture's own: nothing found", find(oneSide, W, H) === null && findLetterbox(oneSide, W, H) === null)
  const full = picture(W, H, stripes)
  check("a picture with no bars: nothing found", find(full, W, H) === null)
  check("a blank picture is not bars", find(picture(W, H, () => [244, 244, 244]), W, H) === null)
  check("too small a copy: nothing", find(new Uint8ClampedArray(4 * 4 * 4), 4, 4) === null)

  check("the script parses", (() => { try { new Function(COVER_TRIM_SCRIPT); return true } catch { return false } })())
  check("it is self contained: run as its own source", /^try\{\(function installCoverTrim\(|^try\{\(function\s*\(/.test(COVER_TRIM_SCRIPT) && COVER_TRIM_HEAD === `<script data-sl-cover-trim>${COVER_TRIM_SCRIPT}</script>`)
  check("no word naming another platform in it (an imported theme's page keeps it whole)", !/shopify|liquid/i.test(COVER_TRIM_HEAD))
  check("a padded copy is known by the name the editor gives it", PADDED_COPY.test("https://x.supabase.co/storage/v1/object/public/product-images/c/p/1767225600000_cover_processed.jpg") && PADDED_COPY.test("/_next/image?url=%2Fmedia%2Fproduct-images%2Fc%2F1_cover_processed.jpg&w=640&q=75") && !PADDED_COPY.test("https://x/1_original_cover.jpg"))
  check("  and the editor still names it so", /_processed\.jpg/.test(read("app/(storelib)/app/products/new/product-editor.tsx")))
  check("Storelib's own pages run it in <head>, beside the picture fallback", /__html: IMAGE_FALLBACK_SCRIPT \}\} \/>[\s\S]{0,300}__html: COVER_TRIM_SCRIPT/.test(read("app/(storelib)/layout.tsx")))
  check("a Storelib theme's website runs it in <head>", /__html: COVER_TRIM_SCRIPT/.test(read("app/(site)/layout.tsx")))
  const theme = read("lib/storelib-theme/compat/theme.ts")
  check("an imported theme's every document has it, live and on the canvas", /html\.replace\(\/<\\\/head>\/i, `\$\{COVER_TRIM_HEAD\}<\/head>`\)/.test(theme) && /\$\{BUSY_BUTTON_FIX\}\$\{COVER_TRIM_HEAD\}/.test(theme))
  const trim = read("lib/images/cover-trim.ts")
  check("Explore's pictures are left alone: data-cover-trim=keep or inside [data-cover-padded=keep]", /state === "keep"/.test(trim) && /closest\('\[data-cover-padded="keep"\]'\)/.test(trim))
  check("a padded picture is held unseen while it is read, never one in Explore", /img\[src\*="_processed\."\]:not\(\[data-cover-trim\]\):not\(\[data-cover-padded="keep"\] img\)/.test(trim) && /\{opacity:0\}/.test(trim))
  check("it is cut from the full 1280x720 copy behind an optimizer address", /u\.pathname === "\/_next\/image"/.test(trim) && /searchParams\.get\("url"\)/.test(trim))
  check("one that cannot be read, or has no bars, is shown as it is", /settle\(key, ""\)/.test(trim) && /"data-cover-trim", "none"/.test(trim))
  check("its srcset goes with it, so the browser does not pick the padded size back", /removeAttribute\("srcset"\)/.test(trim) && /removeAttribute\("sizes"\)/.test(trim))
  const card = read("components/explore/product-card.tsx")
  check("Explore's card keeps its 16:9 copy; the store's own grid does not", /data-cover-trim=\{discoverLayout \? "keep" : undefined\}/.test(card) && /\(!discoverLayout && product\?\.cover_original_url\) \|\| product\?\.thumbnail_url/.test(card))
  check("Explore's featured banner keeps its copy", /data-cover-trim="keep"/.test(read("components/explore/featured-banner-carousel.tsx")))
  check("FramedPicture's pictures are framed by it, not trimmed twice", (read("components/ui/framed-picture.tsx").match(/data-cover-trim="framed"/g) ?? []).length === 2)
}

console.log("ROWS")
{
  const thumb = "https://x.supabase.co/storage/v1/object/public/product-images/c/p/1767225600000_cover_processed.jpg"
  const orig = "https://x.supabase.co/storage/v1/object/public/product-images/c/p/1767225600000_original_cover.png"
  const other = "https://x.supabase.co/storage/v1/object/public/product-images/c/p/1767225699999_original_old.png"
  const row = { id: "p1", thumbnail_url: thumb, gallery_urls: [thumb, "b", thumb] }
  const laid = withOriginalCoverRow(row, orig)
  check("the cover as uploaded becomes the row's picture", laid.thumbnail_url === orig && laid.cover_original_url === orig)
  check("  and takes the copy's place in the gallery, each picture once", JSON.stringify(laid.gallery_urls) === JSON.stringify([orig, "b"]))
  check("  the row it was given is not changed", row.thumbnail_url === thumb && row.gallery_urls.length === 3)
  check("the row's own column is used when no original is handed in", withOriginalCoverRow({ thumbnail_url: thumb, cover_original_url: orig }).thumbnail_url === orig)
  check("no original: the row as it is (the page's trim still keeps the bars off)", withOriginalCoverRow(row, null) === row && withOriginalCoverRow(row, "  ") === row)
  check("an original from another upload than the cover in place is not drawn for it", withOriginalCoverRow(row, other) === row)
  check("a picture that is its own original (an import) is left as it is", withOriginalCoverRow({ thumbnail_url: orig }, orig).thumbnail_url === orig)
  check("productCover is unchanged: the original, else the copy", productCover({ thumbnail_url: thumb, cover_original_url: orig }) === orig && productCover({ thumbnail_url: thumb }) === thumb)

  type Answer = { data: unknown[] | null; error: unknown }
  const asked: string[][] = []
  const db = (answer: (ids: string[]) => Answer | Promise<Answer>) => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        in: (col: string, ids: string[]) => {
          asked.push(ids)
          if (table !== "products" || cols !== "id, cover_original_url" || col !== "id") throw new Error("asked the wrong thing")
          return Promise.resolve(answer(ids))
        },
      }),
    }),
  })
  const ids = Array.from({ length: 170 }, (_, i) => `id${i}`)
  const all = await originalCoversOf(db((list) => ({ data: list.map((id) => ({ id, cover_original_url: id === "id3" || id === "id150" ? `https://x/${id}.png` : null })), error: null })), [...ids, "id3", null, ""])
  check("originals are read by id, in batches of 80, each id once", asked.length === 3 && asked[0].length === 80 && asked[2].length === 10 && new Set(asked.flat()).size === 170)
  check("  only the products that have one", all.size === 2 && all.get("id3") === "https://x/id3.png" && all.get("id150") === "https://x/id150.png")
  check("before part 377 (an error): nothing to lay over", (await originalCoversOf(db(() => ({ data: null, error: { code: "42703", message: "column products.cover_original_url does not exist" } })), ["a"])).size === 0)
  check("a read that throws: nothing, never an error", (await originalCoversOf(db(() => { throw new Error("down") }), ["a"])).size === 0)
  check("a client without .in, or no client: nothing", (await originalCoversOf({ from: () => ({ select: () => ({}) }) }, ["a"])).size === 0 && (await originalCoversOf(null, ["a"])).size === 0)
  check("no ids: no read", (await originalCoversOf(db(() => { throw new Error("asked") }), [])).size === 0)
  const rows = await rowsWithOriginalCovers(db(() => ({ data: [{ id: "p1", cover_original_url: orig }], error: null })), [row, { id: "p2", thumbnail_url: "https://x/2.jpg" }])
  check("rows with their originals laid over, the others as they were", rows[0].thumbnail_url === orig && rows[1].thumbnail_url === "https://x/2.jpg")

  /* A website's card, as a section reads it. */
  const base = { id: "p1", title: "Guide", slug: "guide", price_cents: 900, compare_at_cents: null, status: "published", type: "digital" }
  const card = toCard({ ...withOriginalCoverRow({ ...base, thumbnail_url: thumb, gallery_urls: [thumb, "https://x/2.jpg"] }, orig) } as never)
  check("a website's card: `image` is the cover as uploaded, first in `images`, the copy nowhere", card.settings.image.endsWith("1767225600000_original_cover.png") && card.settings.images[0] === card.settings.image && !card.settings.images.some((u) => /_processed/.test(u)) && card.settings.images.length === 2, card.settings)
}

console.log("PLACES")
{
  const shop = read("lib/website-builder/shop-products.ts")
  check("a website's cards (every section, an imported theme's product.featured_image) read the originals beside the rows", /originalCoversOf\(db, ids\)/.test(shop) && /toCard\(originals\.has\(r\.id\) \? withOriginalCoverRow\(r, originals\.get\(r\.id\)\) : r/.test(shop))
  check("a product page (website, imported theme, builder) draws the original first in its gallery", /const row = withOriginalCoverRow\(given\)/.test(read("lib/products/product-section-data.ts")))
  check("the builder's product list carries the originals", /rowsWithOriginalCovers\(supabase, rows\)/.test(read("app/api/website-builder/products/route.ts")))
  const store = read("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("the store's grid and sections draw the originals", /originalCoversOf\(createAdminClient\(\), \(products \?\? \[\]\)\.map\(\(p\) => p\.id\)\)/.test(store) && /\.\.\.withOriginalCoverRow\(\{ thumbnail_url: p\.thumbnail_url, gallery_urls: p\.gallery_urls \}, originals\.get\(p\.id\)\)/.test(store))
  check("the store card passes the original on", /cover_original_url: product\.cover_original_url \?\? null/.test(read("components/storefront/storefront-product-card.tsx")))
  check("the library's list and a product's own library page", /originalCoversOf\(admin, productIds\)/.test(read("lib/library/get-library-downloads.ts")) && /withOriginalCoverRow\(\{ thumbnail_url: product\.thumbnail_url \?\? null, cover_original_url: product\.cover_original_url \?\? null \}\)/.test(read("app/(storelib)/account/library/products/[id]/page.tsx")))
  check("a website's checkout lines", /originalCoversOf\(db, priced\.lines\.map\(\(l\) => l\.item\.productId\)\)/.test(read("lib/checkout/site-quote-server.ts")))
  {
    const page = read("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("the product page reached from Explore keeps Explore's 16:9 card with its bars, and the trim leaves it alone", /const fromExplore = layout === "discover"/.test(page) && /fromExplore\s*\?\s*storedGallery\s*:\s*withOriginalCover\(/.test(page) && /data-cover-padded=\{fromExplore \? "keep" : undefined\}/.test(page))
  }
  check("checkout, the product page and the OnePage keep theirs (round AK)", /thumbnail_url: productCover\(product\)/.test(read("app/(storelib)/checkout/page.tsx")) && /withOriginalCover\(/.test(read("app/(storelib)/(marketing)/p/[slug]/page.tsx")) && /withOriginalCover\(/.test(read("app/api/onepage/product/route.ts")))
  const tile = read("app/(storelib)/app/products/new/media-grid.tsx")
  check("the editor's tile shows the picture as uploaded, filling the tile", /: item\.original \|\| item\.url/.test(tile) && /square && item\.type === "image" \? "object-contain" : "object-cover"/.test(tile))
  check("  its number, its Thumbnail badge and its drag handle stay", /\{index \+ 1\}/.test(tile) && /tt\("Thumbnail"\)/.test(tile) && /data-media-handle=""/.test(tile))
  const explore = read("app/(storelib)/(marketing)/explore/page.tsx")
  check("Explore still reads the 16:9 copy", /thumbnail_url, type, category/.test(explore) && !/cover_original_url|originalCoversOf/.test(explore))
}

console.log("UPLOAD")
{
  const editor = read("app/(storelib)/app/products/new/product-editor.tsx")
  check("the editor still makes the 1280x720 copy and keeps the file as chosen beside it", /const targetWidth = 1280/.test(editor) && /if \(padded\) \{[\s\S]{0,200}_original_/.test(editor))
  check("  the cover's original is saved, the card copy stays thumbnail_url", /update\(\{ cover_original_url: cover \}\)/.test(editor) && /thumbnail_url: determinedThumbnailUrl/.test(editor))
  const imports = ["lib/products/import/gumroad-server.ts", "lib/products/import/gumroad.ts", "lib/products/import/product-link.ts", "lib/products/import/product-link-server.ts"].map(read).join("\n")
  check("an import copies each picture as it is: never padded, so its picture is its own original", !/_processed|processImageToWidescreen|1280/.test(imports) && /thumbnail_url: gallery\[0\] \?\? null/.test(imports))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
