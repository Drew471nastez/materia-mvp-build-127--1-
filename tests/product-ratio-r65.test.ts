/**
 * ROUND 65 (m1): A PRODUCT PICTURE IS NEVER CUT.
 *
 *   FIT       lib/images/pic-fit.ts: in a product frame (a Materia card or gallery picture, anything marked
 *             data-pic-frame) the picture sits whole (object-fit: contain), and the frame either side of it is
 *             painted from the picture's own edge colours; a picture of the frame's shape fills it.
 *   (r68)     the owner asked for cover: a picture covers its frame; only a cut out product of another shape sits
 *             whole (tests/product-pictures-r68.test.ts). The FIT checks below say so.
 *   PAGES     the fit runs in every page's head with the trim (COVER_TRIM_SCRIPT), after it, and a padded copy the
 *             trim found nothing to cut on is painted as it is.
 *   THEMES    Materia's frames carry the classes the fit looks for; the native theme's cards and gallery, and
 *             Storelib's own product gallery, are marked data-pic-frame and draw contain from the first paint.
 *   EDITOR    a photo after the first is saved as uploaded, never as the grey padded copy.
 *
 * scripts/check-product-ratio-r65.mjs measures it in Chromium (visible 100%, distortion 0, not shrunk).
 *
 *   npx tsx tests/product-ratio-r65.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { installPicFit, PIC_FRAMES, PIC_FIT_SCRIPT } from "@/lib/images/pic-fit"
import { COVER_TRIM_HEAD, COVER_TRIM_SCRIPT } from "@/lib/images/cover-trim"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* Changed on purpose (r68): the fit's parts are the cut out test and the shape test; no bands, no row shapes. */
type Parts = {
  seeThrough: (px: ArrayLike<number>, w: number, h: number) => boolean
  offShape: (nr: number, br: number) => boolean
}

/* A picture's pixels: `fill(x, y)` gives [r, g, b, a]. */
function pixels(w: number, h: number, fill: (x: number, y: number) => number[]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4)
  return px
}

/* A page with the fit installed: a document with one frame holding one loaded picture. */
function page(opts: { natural: [number, number]; box: [number, number]; src?: string; px?: Uint8ClampedArray; inFrame?: boolean; trim?: string }) {
  const attrs: Record<string, string> = opts.trim ? { "data-cover-trim": opts.trim } : {}
  const props: Record<string, string> = {}
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const styles: { textContent: string }[] = []
  const src = opts.src ?? "https://shop.test/_next/image?url=poster.jpg&w=640&q=90"
  const img = {
    tagName: "IMG",
    currentSrc: src,
    src,
    complete: true,
    naturalWidth: opts.natural[0],
    naturalHeight: opts.natural[1],
    clientWidth: opts.box[0],
    clientHeight: opts.box[1],
    style: { setProperty: (k: string, v: string) => (props[k] = v) },
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    hasAttribute: (k: string) => k in attrs,
    closest: (sel: string) => (sel.includes("data-cover-padded") ? null : opts.inFrame === false ? null : {}),
  }
  const px = opts.px ?? pixels(48, 48, () => [10, 20, 30, 255])
  const doc = {
    readyState: "complete",
    baseURI: "https://shop.test/",
    location: { origin: "https://shop.test" },
    head: { appendChild: (s: { textContent: string }) => styles.push(s) },
    documentElement: { classList: { add: () => {} } },
    images: [img],
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] ??= []).push(f),
    createElement: (tag: string) =>
      tag === "canvas"
        ? { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: px.length === w * h * 4 ? px : pixels(w, h, () => [px[0], px[1], px[2], px[3]]) }) }) }
        : { setAttribute: () => {}, textContent: "" },
  }
  const win: Record<string, unknown> = {}
  installPicFit(doc as unknown as Document, win as unknown as Window)
  return { img, attrs, props, styles, win, parts: win.__slPicFitParts as Parts, load: () => listeners.load?.forEach((f) => f({ target: img })) }
}

/*
 * Changed on purpose (r68): the owner asked for cover. A picture covers its frame (every theme's own CSS), and the fit
 * only marks a cut out product of another shape (see-through edges) to sit whole (data-pic-fit="cutout"). No bands,
 * no contain from the first paint. tests/product-pictures-r68.test.ts holds the new rules.
 */
console.log("\nFIT")
{
  const PNG = "https://shop.test/_next/image?url=shoe.png&w=640&q=90"
  const photo = page({ natural: [700, 1000], box: [400, 400] })
  check("a photo (JPEG) in a frame of another shape is left to cover it", !("data-pic-fit" in photo.attrs) && !photo.props["--pf-bg"])
  const opaque = page({ natural: [1920, 1080], box: [400, 400], src: PNG })
  check("an opaque PNG covers its frame too", !("data-pic-fit" in opaque.attrs))
  const cut = page({ natural: [1920, 1080], box: [400, 400], src: PNG, px: pixels(48, 48, () => [0, 0, 0, 0]) })
  check("a cut out product of another shape sits whole", cut.attrs["data-pic-fit"] === "cutout")
  const near = page({ natural: [1000, 1000], box: [400, 410], src: PNG, px: pixels(48, 48, () => [0, 0, 0, 0]) })
  check("a cut out product near its frame's shape covers it", !("data-pic-fit" in near.attrs))
  const outside = page({ natural: [1920, 1080], box: [400, 400], src: PNG, px: pixels(48, 48, () => [0, 0, 0, 0]), inFrame: false })
  check("a picture outside a product frame is left alone", !("data-pic-fit" in outside.attrs))
  const css = photo.styles.map((s) => s.textContent).join("")
  check("no picture is contained from the first paint; only a cut out one is", !/img:not\(\[data-pic-fit="off"\]\)\{object-fit:contain/.test(css) && /img\[data-pic-fit="cutout"\]\{object-fit:contain!important\}/.test(css) && css.includes(PIC_FRAMES))
  check("PIC_FRAMES is the list the script carries", PIC_FIT_SCRIPT.includes(JSON.stringify(PIC_FRAMES)))
  const parts = photo.parts
  check("see-through edges are told", parts.seeThrough(pixels(8, 8, () => [0, 0, 0, 0]), 8, 8) && !parts.seeThrough(pixels(8, 8, () => [9, 9, 9, 255]), 8, 8))
  check("within 8% of the frame's shape is not off", !parts.offShape(0.72, 0.75) && parts.offShape(16 / 9, 0.75))
}

console.log("\nPAGES")
{
  const PNG = "https://shop.test/_next/image?url=a_processed.jpg&w=640&q=90"
  const busy = page({ natural: [1280, 720], box: [400, 400], src: PNG, trim: "busy", px: pixels(48, 48, () => [0, 0, 0, 0]) })
  check("a padded copy is the trim's first: not looked at while it is cut", !("data-pic-fit" in busy.attrs))
  check("the trim tells the fit when it found nothing to cut", /__slPicFitPaint[\s\S]{0,80}if \(fit\) fit\(img\)/.test(read("lib/images/cover-trim.ts")))
  check("every page's head script runs the trim, then the fit", COVER_TRIM_SCRIPT.indexOf("installCoverTrim") < COVER_TRIM_SCRIPT.indexOf("installPicFit") && COVER_TRIM_SCRIPT.endsWith(PIC_FIT_SCRIPT) && COVER_TRIM_HEAD.includes(PIC_FIT_SCRIPT))
  check("the script parses", (() => { try { new Function(COVER_TRIM_SCRIPT); return true } catch { return false } })())
  check("no word naming another platform in it", !/shopify|liquid/i.test(PIC_FIT_SCRIPT))
  const twice = page({ natural: [700, 1000], box: [400, 400] })
  const styles = twice.styles.length
  installPicFit({} as Document, twice.win as unknown as Window)
  check("installing twice does nothing the second time", twice.styles.length === styles)
}

console.log("\nTHEMES")
{
  const item = read("theme-packages/materia/base/snippets/product-item.liquid")
  const layout = read("theme-packages/materia/base/snippets/product-media-layout.liquid")
  check("Materia's cards are .product-item__media--ratio frames", /class="product__media product-item__media--ratio/.test(item))
  check("Materia's gallery pictures are .media-gallery__image frames", /class="media-gallery__image /.test(layout))
  check("the merchant's Image ratio setting still sets the frame (square 1/1, portrait 3/4, landscape 4/3, custom)", /when 'square'\s+assign ratio = '1\/1'[\s\S]*when 'landscape'\s+assign ratio = '4\/3'[\s\S]*when 'portrait'\s+assign ratio = '3\/4'[\s\S]*product_custom_ratio/.test(item))
  for (const f of ["product_grid", "collection_featured", "product_featured", "main_wishlist", "not_found", "search"]) {
    const src = read(`themes/default/sections/${f}.storelib`)
    /* Changed on purpose (r68): the picture covers the card's frame. */
    check(`native ${f}: every card frame is marked, its picture covers it`, !/class="card__media"(?![^>]*data-pic-frame)/.test(src) && /\.card__media img \{[^}]*object-fit: cover;/.test(src))
  }
  const media = read("components/website-builder/sections/renderers/product/product-media.tsx")
  /* Changed on purpose (r68): a picture in a frame of another shape covers it; the one that sets the row's height keeps its own shape. */
  check("native gallery: frames marked, framed photos and thumbnails cover", /data-media-item=\{i\}\s+data-pic-frame=""/.test(media) && /h-full object-cover" : naturalFit/.test(media) && /const COVER = "absolute inset-0 h-full w-full object-cover"/.test(media) && /thumbnail \$\{pos \+ 1\}`\} className="h-full w-full object-cover"/.test(media))
  const gallery = read("components/product/product-gallery.tsx")
  /* Changed on purpose (r68): covers unless a caller asks for contain (Storelib's own product page does). */
  check("Storelib's product gallery: covers unless a caller asks for contain, frame marked", /const whole = fit === "contain"/.test(gallery) && /data-gallery-index=\{currentIndex\}\s+data-pic-frame=""/.test(gallery))
  check("Explore's 16:9 card is still left as the owner set it (kept from the trim and the fit)", /data-cover-trim="keep"/.test(read("components/explore/product-card.tsx")) && PIC_FIT_SCRIPT.includes('[data-cover-padded="keep"]'))
}

console.log("\nEDITOR")
{
  const editor = read("app/(storelib)/app/products/new/product-editor.tsx")
  check("a photo after the first is saved as uploaded (its original), the cover stays the shop's copy", /const photoUrls = mediaItems\.filter\([^)]*\)\.map\(m => \(m !== mediaItems\[0\] && m\.type === "image" && m\.original \? m\.original : m\.url\)\)/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
