/**
 * ROUND 65 (m1): A PRODUCT PICTURE IS NEVER CUT.
 *
 *   FIT       lib/images/pic-fit.ts: in a product frame (a Materia card or gallery picture, anything marked
 *             data-pic-frame) the picture sits whole (object-fit: contain), and the frame either side of it is
 *             painted from the picture's own edge colours; a picture of the frame's shape fills it.
 *   EDGES     the bands' colours are each edge's median, so a mark in a corner does not tint a band; a see-through
 *             edge leaves the frame's own colour; under half a percent off the frame's shape is a fill.
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

type Parts = {
  edgesOf: (px: ArrayLike<number>, w: number, h: number) => { l: string[]; r: string[]; t: string[]; b: string[]; clear: boolean }
  backdrop: (e: unknown, axis: "x" | "y") => string
  axisOf: (nr: number, br: number) => "x" | "y" | null
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
        ? { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: w === 48 && h === 48 ? px : pixels(w, h, () => [10, 20, 30, 255]) }) }) }
        : { setAttribute: () => {}, textContent: "" },
  }
  const win: Record<string, unknown> = {}
  installPicFit(doc as unknown as Document, win as unknown as Window)
  return { img, attrs, props, styles, win, parts: win.__slPicFitParts as Parts, load: () => listeners.load?.forEach((f) => f({ target: img })) }
}

console.log("\nFIT")
{
  const poster = page({ natural: [700, 1000], box: [400, 400] })
  check("a poster 0.7 wide in a square frame: bands left and right, painted", poster.attrs["data-pic-fit"] === "band" && /left top\/50\.5% 100%/.test(poster.props["--pf-bg"] ?? ""), poster.attrs)
  check("the band's colours are the picture's edge (rgb(10,20,30))", (poster.props["--pf-bg"] ?? "").includes("rgb(10,20,30)"))
  const wide = page({ natural: [1920, 1080], box: [400, 400] })
  check("a 16:9 picture in a square frame: bands top and bottom", /left top\/100% 50\.5%/.test(wide.props["--pf-bg"] ?? "") && wide.attrs["data-pic-fit"] === "band")
  const square = page({ natural: [1600, 1600], box: [400, 400] })
  check("a square picture in a square frame fills it, no bands", square.attrs["data-pic-fit"] === "fill" && !square.props["--pf-bg"])
  const outside = page({ natural: [700, 1000], box: [400, 400], inFrame: false })
  check("a picture outside a product frame is left alone", !("data-pic-fit" in outside.attrs))
  const css = poster.styles.map((s) => s.textContent).join("")
  check("the frames' pictures are contained and centred from the first paint, !important over a theme's cover", /object-fit:contain!important;object-position:50% 50%!important/.test(css) && css.includes(PIC_FRAMES))
  check("the band background beats a theme's own (a grey placeholder)", /img\[data-pic-fit="band"\]\{background:var\(--pf-bg\)!important\}/.test(css))
  check("PIC_FRAMES is the list the script carries", PIC_FIT_SCRIPT.includes(JSON.stringify(PIC_FRAMES)))
}

console.log("\nEDGES")
{
  const { parts } = page({ natural: [700, 1000], box: [400, 400] })
  check("under half a percent off the frame's shape is a fill", parts.axisOf(0.749, 0.75) === null && parts.axisOf(0.7, 0.75) === "x" && parts.axisOf(16 / 9, 1) === "y")
  /* A dark poster, a magenta mark in its top left corner (4% of it). */
  const marked = parts.edgesOf(pixels(48, 48, (x, y) => (x < 2 && y < 2 ? [255, 0, 255, 255] : [16, 50, 79, 255])), 48, 48)
  check("a mark in a corner does not tint the band (median)", marked.l[0] === "rgb(16,50,79)" && marked.t[0] === "rgb(16,50,79)", marked.l[0])
  const graded = parts.edgesOf(pixels(48, 48, (_x, y) => [Math.round((y / 47) * 255), 0, 0, 255]), 48, 48)
  check("the band runs through the edge's colours top to bottom", graded.l.length === 6 && graded.l[0] !== graded.l[5] && /^rgb\(\d+,0,0\)$/.test(graded.l[5]))
  const clear = parts.edgesOf(pixels(48, 48, () => [255, 255, 255, 0]), 48, 48)
  check("a see-through edge is told (the frame's own colour shows)", clear.clear === true && marked.clear === false)
  const cut = page({ natural: [700, 1000], box: [400, 400], px: pixels(48, 48, () => [0, 0, 0, 0]) })
  check("a cut out product on a see-through background gets no band", cut.attrs["data-pic-fit"] === "clear" && !cut.props["--pf-bg"])
}

console.log("\nPAGES")
{
  const busy = page({ natural: [1280, 720], box: [400, 400], src: "https://shop.test/_next/image?url=a_processed.jpg&w=640&q=90", trim: "busy" })
  check("a padded copy is the trim's first: not painted while it is cut", !("data-pic-fit" in busy.attrs))
  const none = page({ natural: [1280, 720], box: [400, 400], src: "https://shop.test/_next/image?url=a_processed.jpg&w=640&q=90", trim: "none" })
  check("a padded copy the trim found nothing to cut on is painted as it is", none.attrs["data-pic-fit"] === "band")
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
    check(`native ${f}: every card frame is marked, its picture contained`, !/class="card__media"(?![^>]*data-pic-frame)/.test(src) && /\.card__media img \{[^}]*object-fit: contain;/.test(src))
  }
  const media = read("components/website-builder/sections/renderers/product/product-media.tsx")
  check("native gallery: frames marked, no photo drawn with object-cover (videos keep theirs)", /data-media-item=\{i\}\s+data-pic-frame=""/.test(media) && !/(h-full object-cover" : naturalFit|@\[768px\]:object-cover|const COVER = "[^"]*object-cover)/.test(media) && /thumbnail \$\{pos \+ 1\}`\} className="h-full w-full object-contain"/.test(media))
  const gallery = read("components/product/product-gallery.tsx")
  check("Storelib's product gallery: whole unless a caller asks for cover, frame marked", /const whole = fit !== "cover"/.test(gallery) && /data-gallery-index=\{currentIndex\}\s+data-pic-frame=""/.test(gallery))
  check("Explore's 16:9 card is still left as the owner set it (kept from the trim and the fit)", /data-cover-trim="keep"/.test(read("components/explore/product-card.tsx")) && PIC_FIT_SCRIPT.includes('[data-cover-padded="keep"]'))
}

console.log("\nEDITOR")
{
  const editor = read("app/(storelib)/app/products/new/product-editor.tsx")
  check("a photo after the first is saved as uploaded (its original), the cover stays the shop's copy", /const photoUrls = mediaItems\.filter\([^)]*\)\.map\(m => \(m !== mediaItems\[0\] && m\.type === "image" && m\.original \? m\.original : m\.url\)\)/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
