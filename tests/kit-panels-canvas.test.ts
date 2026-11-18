/**
 * The chrome kit's drawers, carts and search windows in the builder's phone
 * preview (the canvas: a frame that contains fixed positioning, its own
 * scroller, inCanvas hooks), scrolled down the page as a creator is when
 * they open one. The owner's screenshot: a menu drawer that stopped well
 * short of the bottom of the phone, the page showing under it.
 *
 * Each kit page, each panel opened from the header's own button: a panel
 * that is a drawer or window (fixed) must lie inside the phone's frame and,
 * when it is meant to fill it (full screen menu, side sheet, side cart),
 * reach its bottom edge; nothing of it past the frame's edges; shut again,
 * nothing of it drawn.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/kit-panels-canvas.test.ts
 * KIT_CANVAS_SHOTS=<directory> keeps a screenshot of each open panel.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`) }
}
const root = process.cwd()

const card = (id: string, title: string, price: string, kind: string) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: `/img/${id}.jpg`, images: [], url: `/products/${id}`, slug: id, kind, available: true, tag: "", checkout_url: `/checkout/${id}`, variants: [] },
})
const PRODUCTS = [card("linen-shirt", "Linen shirt", "$48.00", "physical"), card("canvas-tote", "Canvas tote", "$22.00", "physical"), card("lookbook-pdf", "Lookbook PDF", "$12.00", "digital")]
const MENUS = {
  "main-menu": { title: "Main", links: [
    { title: "Shop", url: "/shop", links: [{ title: "Shirts", url: "/shop", links: [{ title: "Linen", url: "/shop", links: [] }] }, { title: "Bags", url: "/shop", links: [] }, { title: "Prints", url: "/shop", links: [] }] },
    { title: "Journal", url: "/about", links: [] },
    { title: "About", url: "/about", links: [] },
    { title: "Contact", url: "/contact", links: [] },
  ] },
  footer: { title: "Help", links: [{ title: "Contact", url: "/contact", links: [] }, { title: "About", url: "/about", links: [] }] },
}
const THEME = { site_chrome: "home", menus: MENUS } as unknown as ThemeSettingsValues
const DATA = storefrontData({ dynamic: { shop: { name: "Fieldwork Supply" }, creator: {} } as never, catalog: PRODUCTS as never, menus: MENUS as never })
const ROUTES = ["/about", "/shop", "/contact"]

/** The kit's files from disk, as the generator reads them. */
const DIR = join(root, "lib/storelib-ai/library/examples/chrome")
const disk = readdirSync(DIR).filter((f) => f.endsWith(".storelib")).sort().map((file) => ({ file, source: readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n") }))
const sourceOf = (id: string) => disk.find((d) => d.file === `${id}.storelib`)!.source
const schemaOf = (src: string) => JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(src)![1]) as { type: string; kind?: string; settings: { id?: string; type: string; default?: unknown }[]; blocks?: { type: string }[]; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[] }

/** A section instance of a kit file with its preset blocks and, where it takes products, the store's products chosen. */
function instanceOf(id: string): SectionInstance {
  const schema = schemaOf(sourceOf(id))
  const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}), ...(b.type === "products" ? { products: ["linen-shirt", "canvas-tote"] } : {}) } }))
  const settings: Record<string, unknown> = {}
  for (const s of schema.settings) if (s.type === "product_list" && s.id) settings[s.id] = PRODUCTS.map((p) => p.id)
  const group = schema.kind === "header" ? "header" : schema.kind === "footer" ? "footer" : undefined
  return { id, type: id, name: id, settings, blocks, ...(group ? { group } : {}) } as unknown as SectionInstance
}

function draw(id: string): { id: string; html: string; css: string; group?: string } {
  const inst = instanceOf(id)
  const out = renderStorelibSection(inst, THEME, { template: "index" }, { [`sections/${id}.storelib`]: sourceOf(id) }, PRODUCTS as never, DATA)
  if (out.ok === false) throw new Error(`${id} did not draw: ${JSON.stringify(out.errors)}`)
  /* Changed on purpose (round Q): the group goes with it, so the probe marks a Header group box as chrome, as SectionRenderer does, and a sticky header can stick. */
  const group = (inst as { group?: string }).group
  return { id, html: out.html, css: out.css, ...(group ? { group } : {}) }
}


const PAGES: { name: string; ids: string[] }[] = [
  { name: "overlay", ids: ["ai_chrome_header_overlay", "ai_chrome_menu_fullscreen", "ai_chrome_cart_side", "ai_chrome_search_full", "ai_chrome_footer_wordmark"] },
  { name: "split", ids: ["ai_chrome_header_split", "ai_chrome_menu_sheet", "ai_chrome_cart_minimal", "ai_chrome_search_drop", "ai_chrome_footer_newsletter"] },
  { name: "mega", ids: ["ai_chrome_header_mega", "ai_chrome_menu_bottom", "ai_chrome_cart_card", "ai_chrome_search_full", "ai_chrome_footer_columns"] },
  { name: "minimal", ids: ["ai_chrome_header_minimal", "ai_chrome_cart_side", "ai_chrome_search_drop", "ai_chrome_footer_line"] },
  { name: "announce", ids: ["ai_chrome_header_announce", "ai_chrome_menu_fullscreen", "ai_chrome_cart_card", "ai_chrome_search_drop", "ai_chrome_locale", "ai_chrome_footer_image"] },
  { name: "shop", ids: ["ai_chrome_header_shop", "ai_chrome_menu_sheet", "ai_chrome_cart_side", "ai_chrome_search_full", "ai_chrome_footer_sitemap"] },
]
/* Panels meant to fill the phone top to bottom (the rest are cards or drop downs, placed by their section). */
const FILLS = /menu_fullscreen|menu_sheet|cart_side|cart_minimal|search_full|header_minimal/
const HERO = { id: "hero", html: `<section style="min-height:2400px;background:#2a3b33;color:#fff;padding:120px 16px 40px"><h1 style="margin:0;font-size:48px">A page under the header</h1></section>`, css: "" }

async function main() {
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { check("Chromium is here", false, chrome); return done() }
  const stubs = join(root, ".kit-canvas-probe")
  mkdirSync(stubs, { recursive: true })
  try {
    writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
    writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
    const { build } = await import("esbuild")
    await build({
      entryPoints: [join(root, "tests/_headless/chrome-probe.tsx")], bundle: true, format: "iife", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.kit-canvas-probe/navigation.js", "next/link": "./.kit-canvas-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" }, outfile: join(stubs, "app.js"), logLevel: "error", absWorkingDir: root, nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    const htmlFor = (ids: string[]) => {
      const [header, ...rest] = ids.map(draw)
      const footer = rest.pop()!
      const probe = { sections: [header, ...rest, HERO, footer], canvas: true }
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--t-motion-duration:200ms;--t-motion-ease:ease-out;--t-motion-distance:24px;--t-motion-stagger:20ms;--t-motion-hover:120ms;--t-motion-ease-ui:ease}body{margin:0;font-family:Arial,sans-serif}</style></head><body><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
    }
    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const shots = process.env.KIT_CANVAS_SHOTS
    if (shots) mkdirSync(shots, { recursive: true })
    try {
      for (const pg of PAGES) {
        const p = await browser.newPage()
        await p.setViewport({ width: 1280, height: 900 })
        const errors: string[] = []
        p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
        await p.setRequestInterception(true)
        const html = htmlFor(pg.ids)
        p.on("request", (r) => {
          if (r.isNavigationRequest() && r.url() === "https://shop.example/") return void r.respond({ status: 200, contentType: "text/html", body: html })
          if (r.resourceType() === "image") return void r.respond({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="#998"/></svg>` })
          return void r.respond({ status: 204, body: "" })
        })
        await p.goto("https://shop.example/", { waitUntil: "load" })
        await p.evaluate("window.__name = (f) => f")
        await sleep(300)
        /* Down the page, then back up a little so the header is on screen. */
        await p.evaluate(() => { const s = document.getElementById("wb-preview-root")!; s.scrollTop = 900 })
        await sleep(250)
        await p.evaluate(() => { const s = document.getElementById("wb-preview-root")!; s.scrollTop = 700 })
        await sleep(450)
        const header = `[data-probe-section="${pg.ids[0]}"]`
        for (const [hook, panelSel] of [["data-storelib-menu", "[data-storelib-menu-panel]"], ["data-storelib-cart", "[data-storelib-cart-panel]"], ["data-storelib-search", "[data-storelib-search-panel]"]] as const) {
          const btn = `${header} [${hook}]`
          if (!(await p.$(btn))) continue
          const visibleBtn = await p.$eval(btn, (el) => (el as HTMLElement).getClientRects().length > 0)
          if (!visibleBtn) continue
          await p.click(btn)
          await sleep(650)
          const m = await p.evaluate((sel) => {
            const f = document.querySelector(".wb-canvas-frame")!.getBoundingClientRect()
            const panels = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getAttribute("data-open") === "true")
            const el = panels[0]
            if (!el) return null
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            /* The visible box: the panel, or its first child that paints (a sheet inside a full screen scrim). */
            const kids = [el, ...el.querySelectorAll<HTMLElement>("*")].filter((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return b.width > 80 && b.height > 80 && (c.backgroundColor !== "rgba(0, 0, 0, 0)" || c.backgroundImage !== "none") })
            const paint = kids[0]?.getBoundingClientRect() ?? r
            return { fixed: cs.position === "fixed", frame: [f.left, f.top, f.width, f.height].map(Math.round), panel: [r.left, r.top, r.width, r.height].map(Math.round), paint: [paint.left, paint.top, paint.right, paint.bottom].map(Math.round), id: el.closest("[data-probe-section]")?.getAttribute("data-probe-section") }
          }, panelSel)
          if (shots) await p.screenshot({ path: join(shots, `${pg.name}-${hook.replace("data-storelib-", "")}.png`) as `${string}.png` })
          if (!m) { check(`${pg.name}: ${hook} opens a panel`, false); continue }
          const [fx, fy, fw, fh] = m.frame
          const inside = m.paint[0] >= fx - 1 && m.paint[1] >= fy - 1 && m.paint[2] <= fx + fw + 1 && m.paint[3] <= fy + fh + 1
          check(`${pg.name}: ${m.id} inside the phone, scrolled down the page`, inside, m)
          if (m.fixed && FILLS.test(m.id ?? "")) check(`${pg.name}:   ${m.id} reaches the bottom of the phone`, Math.abs(m.paint[3] - (fy + fh)) <= 2 && m.paint[1] <= fy + 2, m)
          await p.keyboard.press("Escape")
          await p.evaluate((sel) => document.querySelectorAll<HTMLElement>(sel).forEach((el) => el.querySelector<HTMLElement>("[data-storelib-menu-close],[data-storelib-cart-close],[data-storelib-search-close]")?.click()), panelSel)
          await sleep(800)
          const left = await p.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0).length, panelSel)
          check(`${pg.name}:   shut again, not drawn`, left === 0, left)
        }
        check(`${pg.name}: no page error`, errors.length === 0, errors)
        await p.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
  done()
}

function done() {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main().catch((e) => { console.error(e); process.exit(1) })
