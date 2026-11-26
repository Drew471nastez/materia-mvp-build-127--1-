/**
 * ROUND 64: product pictures on creators' own hosts, and the admin built site's cards and footer.
 *
 *   HOSTS     the page's trim reads a padded copy's pixels through the page's own /_next/image, so a creator's
 *             subdomain or custom domain (another origin than storelib.com/media, which sends no CORS header) can
 *             read them; a picture already on the page's origin is read where it is.
 *   ONE AXIS  the editor pads on one axis only; bars found on both (a poster's black top rows beside the grey
 *             padding) take off the padding alone, in the trim and in findLetterbox alike.
 *   SITE      the admin built Storelib Default site: three cards across for two products, a newsletter in the
 *             footer posted as a subscriber, social icons shown (only links the creator has draw).
 *
 *   npx tsx tests/cover-trim-hosts-r64.test.ts
 */
import { installCoverTrim } from "@/lib/images/cover-trim"
import { findLetterbox } from "@/lib/images/letterbox"
import { FOOTER_NEWSLETTER, footerGroup, perRow } from "@/lib/admin/creator-site/tailor"
import type { CreatorSiteContent } from "@/lib/admin/creator-site/content"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}

type Box = { x: number; y: number; w: number; h: number } | null

/* The trim run on a page at `origin` holding one loaded picture at `src`: the address it reads the pixels from. */
function readAddress(origin: string, src: string): string | null {
  const made: { src?: string; crossOrigin?: string }[] = []
  const g = globalThis as unknown as { Image?: unknown; setTimeout: typeof setTimeout }
  const before = g.Image
  g.Image = class {
    crossOrigin = ""
    decoding = ""
    onload: unknown = null
    onerror: unknown = null
    src = ""
    constructor() {
      made.push(this as unknown as { src?: string })
    }
  }
  try {
    const attrs: Record<string, string> = {}
    const img = {
      tagName: "IMG",
      currentSrc: src,
      src,
      complete: true,
      naturalWidth: 1280,
      naturalHeight: 720,
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => {
        attrs[k] = v
      },
      removeAttribute: (k: string) => {
        delete attrs[k]
      },
      closest: () => null,
    }
    const doc = {
      baseURI: origin + "/products/a",
      location: { origin },
      createElement: () => ({ setAttribute() {}, textContent: "" }),
      head: { appendChild() {} },
      documentElement: { classList: { add() {} }, appendChild() {} },
      addEventListener() {},
      readyState: "complete",
      images: [img],
    }
    installCoverTrim(doc as unknown as Document, {} as unknown as Window)
    return made[0]?.src ?? null
  } finally {
    g.Image = before
  }
}

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

function picture(W: number, H: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, gg, b] = fill(x, y)
      const o = (y * W + x) * 4
      px[o] = r
      px[o + 1] = gg
      px[o + 2] = b
      px[o + 3] = 255
    }
  return px
}

console.log("HOSTS")
{
  const media = "https://storelib.com/media/product-images/c/p/1793881342192_Gym_Beginner_Programme_Poster_processed.jpg"
  const sub = readAddress("https://liam-bailey.storelib.com", "/_next/image?url=" + encodeURIComponent(media) + "&w=750&q=90")
  check(
    "on a creator's subdomain the pixels are read through that host's own /_next/image at full size",
    sub === "https://liam-bailey.storelib.com/_next/image?url=" + encodeURIComponent(media) + "&w=1920&q=90",
    sub,
  )
  const custom = readAddress("https://shop.example.com", media)
  check("a picture drawn straight from storelib.com/media on a custom domain: read the same way", custom === "https://shop.example.com/_next/image?url=" + encodeURIComponent(media) + "&w=1920&q=90", custom)
  const home = readAddress("https://storelib.com", media)
  check("on storelib.com itself the copy is read where it is", home === media, home)
}

console.log("ONE AXIS")
{
  const find = trimDetector()
  const W = 128
  const H = 72
  /* Liam's Skinny to Strong cover: a 0.7 wide poster with near black rows at its top and bottom, centred on the grey. */
  const coverW = Math.round(H * 0.7)
  const left = Math.round((W - coverW) / 2)
  const poster = picture(W, H, (x, y) => {
    if (x < left || x >= left + coverW) {
      const v = Math.round(248 - 16 * ((x / W + y / H) / 2))
      return [v, v, v]
    }
    if (y < 6 || y >= H - 6) return [12, 12, 12]
    return y % 9 < 2 ? [200, 30, 40] : [90, 20, 25]
  })
  const a = find(poster, W, H)
  const b = findLetterbox(poster, W, H)
  check("the grey sides are taken off, the poster's own black top and bottom are kept", !!a && a.y === 0 && a.h === 1 && a.w < 0.6, a)
  check("findLetterbox agrees", JSON.stringify(a) === JSON.stringify(b), { a, b })
}

console.log("SITE")
{
  check("two products: three across on a computer, not two posters the height of the screen", perRow(2) === 3 && perRow(1) === 3 && perRow(3) === 3 && perRow(4) === 4 && perRow(8) === 4)
  const g = JSON.parse(readFileSync(join(process.cwd(), "theme-packages/materia/templates/default/sections/footer-group.json"), "utf8"))
  const c = { name: "liam bailey", bio: "", socials: {} } as unknown as CreatorSiteContent
  const out = footerGroup(g, c) as { sections: Record<string, { type: string; settings: Record<string, unknown>; blocks: Record<string, { type: string }>; block_order: string[] }> }
  const footer = Object.values(out.sections).find((s) => s.type === "footer")!
  const order = footer.block_order.map((id) => footer.blocks[id]?.type)
  check("the footer has a newsletter sign up, before the payment badges", order.includes("newsletter") && order.indexOf("newsletter") < order.indexOf("payment_badges"), order)
  check("its words are plain and short", FOOTER_NEWSLETTER.settings.button_label === "Join" && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(JSON.stringify(FOOTER_NEWSLETTER)))
  check("social icons are switched on (only links the creator has are drawn)", footer.settings.show_social === true)
  const again = footerGroup(out as never, c) as typeof out
  const f2 = Object.values(again.sections).find((s) => s.type === "footer")!
  check("built twice: one newsletter, not two", f2.block_order.filter((id) => f2.blocks[id]?.type === "newsletter").length === 1)
  const footerLiquid = readFileSync(join(process.cwd(), "theme-packages/materia/base/sections/footer.liquid"), "utf8")
  check("the theme's newsletter form posts as a subscriber (form 'customer', tag newsletter)", /form 'customer'[^%]*data-storelib-form: 'subscribe'/.test(footerLiquid) && footerLiquid.includes('name="contact[tags]" value="newsletter"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
