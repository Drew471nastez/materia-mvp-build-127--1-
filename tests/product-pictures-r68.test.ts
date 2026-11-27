/**
 * ROUND 68 (q3): A PRODUCT PICTURE COVERS ITS FRAME, IN EVERY THEME.
 *
 * The owner, on a Notion template's cards and product page: "the images should be displaying in the whole product
 * card image, cover fit ... come up with a universal solution. It's the same thing in the featured product and the
 * main product information sections." Rounds 65 to 67 drew each picture whole (contain) on bands painted from its
 * edge, and learned a row's shape in localStorage.
 *
 *   FIT       lib/images/pic-fit.ts (in every page's head with the trim, so installed themes have it at once): no
 *             picture is contained, no band, no shape learned or placed; a cut out product (see-through edges) of
 *             another shape than its frame sits whole on the frame's own background (data-pic-fit="cutout").
 *   MATERIA   cards, featured product and main product gallery cover their frame of the theme's ratio, on the
 *             picture's focal point (--point); Octavo's product picture covers its 8:5 frame.
 *   NATIVE    the default theme's cards, the product section's gallery and a website's product gallery cover.
 *   MEASURED  scripts/check-product-pictures-r68.mjs: every frame on eight templates at 390 and 1440, first visit.
 *
 *   npx tsx tests/product-pictures-r68.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { installPicFit, PIC_FIT_SCRIPT, PIC_ROW_KEY } from "@/lib/images/pic-fit"
import { COVER_TRIM_HEAD, COVER_TRIM_SCRIPT } from "@/lib/images/cover-trim"
import { SHOP_CALM_CSS } from "@/lib/storelib-theme/compat/shop-calm"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* A page with the fit installed: one loaded picture of `natural` size in a box of `box`, its pixels `alpha` everywhere. */
function page(opts: { natural: [number, number]; box: [number, number]; src: string; alpha: number; inFrame?: boolean }) {
  const attrs: Record<string, string> = {}
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const styles: { textContent: string }[] = []
  const storage: Record<string, string> = { [PIC_ROW_KEY]: '{"a@75":1.7778}' }
  const img = {
    tagName: "IMG",
    currentSrc: opts.src,
    src: opts.src,
    complete: true,
    naturalWidth: opts.natural[0],
    naturalHeight: opts.natural[1],
    clientWidth: opts.box[0],
    clientHeight: opts.box[1],
    style: { setProperty: () => {} },
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    removeAttribute: (k: string) => delete attrs[k],
    hasAttribute: (k: string) => k in attrs,
    closest: (sel: string) => (sel.includes("data-cover-padded") ? null : opts.inFrame === false ? null : {}),
  }
  let read = 0
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
        ? {
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: () => {},
              getImageData: (_x: number, _y: number, w: number, h: number) => {
                read++
                const px = new Uint8ClampedArray(w * h * 4)
                for (let i = 0; i < w * h; i++) px.set([20, 20, 20, opts.alpha], i * 4)
                return { data: px }
              },
            }),
          }
        : { setAttribute: () => {}, textContent: "" },
  }
  const win: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => (storage[k] = v), removeItem: (k: string) => delete storage[k] },
  }
  installPicFit(doc as unknown as Document, win as unknown as Window)
  return { attrs, styles, storage, reads: () => read }
}

const PNG = "https://shop.test/_next/image?url=https%3A%2F%2Fcdn.test%2Fshoe.png&w=640&q=90"
const JPG = "https://shop.test/_next/image?url=https%3A%2F%2Fcdn.test%2Fpants.jpg&w=640&q=90"

console.log("\nFIT")
{
  const photo = page({ natural: [1920, 1080], box: [300, 400], src: JPG, alpha: 255 })
  check("a 16:9 photo in a 3:4 card: not marked, so it covers (the theme's own cover)", !("data-pic-fit" in photo.attrs))
  check("a JPEG's pixels are not even read (it has no see-through pixels)", photo.reads() === 0)
  const css = photo.styles.map((s) => s.textContent).join("")
  check("Materia's frames cover, over a template's own contain, except a marked or Explore picture", css.includes('html.sl-pic-fit :is(.product-item__media--ratio,.media-gallery__image) img:not([data-pic-fit]):not([data-cover-padded="keep"] *){object-fit:cover!important}'), css)
  check("the only contain written is the cut out product's", (css.match(/contain/g) ?? []).length === 1 && css.includes('html.sl-pic-fit :is(.product-item__media--ratio,.media-gallery__image,[data-pic-frame]) img[data-pic-fit="cutout"]{object-fit:contain!important}'))
  check("no object-position forced: the theme's focal point (--point) stays", !/object-position/.test(PIC_FIT_SCRIPT))
  const opaque = page({ natural: [1920, 1080], box: [300, 400], src: PNG, alpha: 255 })
  check("an opaque PNG covers too", !("data-pic-fit" in opaque.attrs) && opaque.reads() === 1)
  const cut = page({ natural: [1600, 1000], box: [300, 400], src: PNG, alpha: 0 })
  check("a cut out product of another shape sits whole on the frame's background", cut.attrs["data-pic-fit"] === "cutout")
  const square = page({ natural: [1000, 1000], box: [400, 400], src: PNG, alpha: 0 })
  check("a cut out product of the frame's shape covers it", !("data-pic-fit" in square.attrs))
  const outside = page({ natural: [1600, 1000], box: [300, 400], src: PNG, alpha: 0, inFrame: false })
  check("a picture outside a product frame is never touched", !("data-pic-fit" in outside.attrs) && outside.reads() === 0)
  check("round 67's learned row shapes are cleared and never read", !(PIC_ROW_KEY in photo.storage) && !/getItem|setItem/.test(PIC_FIT_SCRIPT))
  check("no frame is reshaped: no aspect ratio written, no data-pic-shape", !/aspectRatio|--aspect-ratio|data-pic-shape|MutationObserver|ResizeObserver/.test(PIC_FIT_SCRIPT))
  check("no band painted from the picture's edge", !/--pf-bg|linear-gradient|"band"/.test(PIC_FIT_SCRIPT))
}

console.log("\nEVERY PAGE")
{
  check("the fit runs after the trim in every page's head script", COVER_TRIM_SCRIPT.endsWith(PIC_FIT_SCRIPT) && COVER_TRIM_HEAD.includes(PIC_FIT_SCRIPT))
  check("the script parses", (() => { try { new Function(COVER_TRIM_SCRIPT); return true } catch { return false } })())
  const theme = read("lib/storelib-theme/compat/theme.ts")
  check("an installed theme's every page carries it (renderDocument), so no reinstall is needed", /\$\{COVER_TRIM_HEAD\}<\/head>/.test(theme))
  check("the shop's head style contains no product picture", !/object-fit:\s*contain/.test(SHOP_CALM_CSS.replace(/:where\(\[class\*=logo\] img,img\[class\*=logo\],\.store-info-content img\)\{object-fit:contain\}/, "")))
}

console.log("\nMATERIA")
{
  const base = read("theme-packages/materia/base/assets/base.css")
  check("a card's picture covers its frame", /\.product-item__media--ratio :is\(img, picture, video, motion-element\) \{[^}]*object-fit: cover;/.test(base))
  check("a framed picture (featured product, gallery) covers it", /:where\(\[style\*='--aspect-ratio'\] > :is\(\*:first-child, \.secondary-image\)\),[\s\S]{0,140}picture \{[^}]*object-fit: cover;/.test(base))
  check("on the picture's focal point when it has one", /\[style\*='--point'\] :is\(img, picture\) \{\s*object-position: var\(--point\);/.test(base))
  const item = read("theme-packages/materia/base/snippets/product-item.liquid")
  check("one frame per grid: the theme's Image ratio setting", /when 'square'\s+assign ratio = '1\/1'/.test(item) && /style="--aspect-ratio: \{% if search_thumb %\}1\{% else %\}\{\{ ratio \}\}\{% endif %\};"/.test(item))
  check("Octavo's product picture covers its 8:5 frame", /\.media-gallery__image img \{ object-fit: cover !important; \}/.test(read("theme-packages/materia/templates/newleaf/sections/header-group.json")))
}

console.log("\nNATIVE")
{
  for (const f of ["product_grid", "collection_featured", "product_featured", "main_wishlist", "not_found", "search"]) {
    check(`default theme ${f}: the card's picture covers its frame`, /\.card__media img \{ display: block; width: 100%; height: 100%; object-fit: cover; \}/.test(read(`themes/default/sections/${f}.storelib`)))
  }
  check("the generated sources say the same", !/\.card__media img \{ display: block; width: 100%; height: 100%; object-fit: contain; \}/.test(read("themes/default/sources.generated.ts")))
  const media = read("components/website-builder/sections/renderers/product/product-media.tsx")
  check("product section gallery: a chosen ratio's frame, the pictures beside the first, and thumbnails cover", /aspect \? "h-full object-cover" : naturalFit\(pos\)/.test(media) && /const COVER = "absolute inset-0 h-full w-full object-cover"/.test(media) && /thumbnail \$\{pos \+ 1\}`\} className="h-full w-full object-cover"/.test(media))
  const gallery = read("components/product/product-gallery.tsx")
  check("a website's product gallery covers; only a caller asking for contain (storelib.com's page) is whole", /const whole = fit === "contain"/.test(gallery) && /<ProductGallery[\s\S]{0,600}fit="contain"/.test(read("app/(storelib)/(marketing)/p/[slug]/page.tsx")))
}

console.log("\nMEASURED")
{
  const probe = read("scripts/check-product-pictures-r68.mjs")
  check("scripts/check-product-pictures-r68.mjs: eight templates, 390 and 1440, cover, column, stretch and CLS on a first visit", /notion-creator[\s\S]*streetwear-drop[\s\S]*ebooks/.test(probe) && /for \(const width of \[390, 1440\]\)/.test(probe) && /layout-shift/.test(probe) && /deviceScaleFactor: 2/.test(probe))
  check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/product-pictures-r68.test.ts"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
