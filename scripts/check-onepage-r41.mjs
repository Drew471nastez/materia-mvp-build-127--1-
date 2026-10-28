/**
 * ===========================================================================
 *  ROUND 41, MEASURED: A BLOCK'S SETTINGS CLOSING, AND THE PAGE'S HOVER
 * ===========================================================================
 * The real components (scripts/render-onepage-r41.tsx) in headless Chromium
 * at 390x844:
 *
 *   SETTINGS  a press on an open card's title closes its settings: the panel's
 *             height falls every frame to 0 over about 240ms with no frame's
 *             step a jump, the card under it glides up by the same amount,
 *             focus inside goes back to the title, and the editor is let go
 *             once shut; opening another card while one closes works the same
 *   HOVER     on a Pill, Large, Glow page: Open in Maps, Send and a lead
 *             magnet are `.op-btn` with the glow, their frames stop at 22px,
 *             and a map inside a group keeps still
 *
 *   node scripts/check-onepage-r41.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".onepage-r41-probe")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
try {
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return { from: () => q, auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }\nexport const isNativePlatform = () => false\n`)
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} }\nexport const usePathname = () => location.pathname\nexport const useRouter = () => router\nexport const useSearchParams = () => new URLSearchParams(location.search)\n`)
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-onepage-r41.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.onepage-r41-probe/navigation.js" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty", ".webp": "dataurl", ".png": "dataurl" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  /* Headless Chromium answers no to (hover: hover) whatever it is told (scripts/check-account-film.mjs), so the computer's page gets the stylesheet with that query answered yes, as a mouse answers. */
  const mouseCss = css.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all")
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"], protocolTimeout: 240_000, timeout: 180_000 })
  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: url.includes("view=blocks") ? page(mouseCss) : html })
      if (url.startsWith("data:") || url.startsWith("about:")) return void r.continue()
      return void r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await sleep(500)
    return { p, errors }
  }

  console.log("\nA card's settings closing")
  {
    const { p, errors } = await open("/probe?view=settings", { width: 390, height: 844, deviceScaleFactor: 2 })
    const m = await p.evaluate(async () => {
      const panel = () => document.querySelector('[data-block-id="a"] [data-reveal]')
      const next = () => document.querySelector('[data-block-id="b"]').getBoundingClientRect().top
      document.querySelector('[data-block-id="a"] [data-field]').focus()
      const h0 = panel().getBoundingClientRect().height
      const top0 = next()
      const frames = []
      const t0 = performance.now()
      document.querySelector('[data-block-open="a"]').click()
      await new Promise((resolve) => {
        const tick = () => {
          frames.push({ t: performance.now() - t0, h: panel().getBoundingClientRect().height, top: next() })
          if (performance.now() - t0 < 600) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      /* Per 60Hz frame, so a frame headless Chromium drops is not read as a jump. */
      const steps = frames.slice(1).map((f, i) => ((frames[i].h - f.h) * (1000 / 60)) / Math.max(f.t - frames[i].t, 1000 / 60))
      const doneAt = frames.find((f) => f.h < 0.5)?.t ?? null
      return {
        h0: Math.round(h0),
        doneAt: doneAt && Math.round(doneAt),
        falling: steps.every((s) => s >= -0.5),
        biggestStep: Math.round(Math.max(...steps)),
        moving: frames.filter((f) => f.h > 0.5 && f.h < h0 - 0.5).length,
        glide: Math.round(top0 - frames[frames.length - 1].top),
        followed: frames.every((f) => Math.abs(top0 - f.top - (h0 - f.h)) < 1.5),
        focus: document.activeElement?.getAttribute("data-block-open"),
        letGo: !document.querySelector('[data-block-id="a"] [data-block-settings]'),
        hidden: panel().getAttribute("aria-hidden"),
        frames: frames.slice(0, 16).map((f) => `${Math.round(f.t)}:${Math.round(f.h)}`).join(" "),
      }
    })
    expect(errors.length === 0, "no page errors", errors.slice(0, 2))
    expect(m.h0 > 200, "the settings were open, tall", m.h0)
    expect(m.doneAt !== null && m.doneAt >= 180 && m.doneAt <= 420, "they close over about a quarter second", m.doneAt)
    expect(m.falling && m.moving >= 8, "the height falls every frame, through many frames", { moving: m.moving })
    expect(m.biggestStep < m.h0 / 6, "no frame's step is a jump (under a sixth of the panel per 60Hz frame)", { step: m.biggestStep, frames: m.frames })
    expect(m.followed && Math.abs(m.glide - m.h0) <= 1, "the card under it glides up by the same height, frame by frame", m.glide)
    expect(m.focus === "a", "focus inside goes back to the card's title", m.focus)
    expect(m.letGo && m.hidden === "true", "once shut, the editor is let go and the box is hidden", { letGo: m.letGo, hidden: m.hidden })

    const n = await p.evaluate(async () => {
      document.querySelector('[data-block-open="b"]').click()
      await new Promise((r) => setTimeout(r, 80))
      document.querySelector('[data-block-open="c"]').click()
      await new Promise((r) => setTimeout(r, 30))
      const closing = document.querySelectorAll("[data-reveal-closing]").length
      await new Promise((r) => setTimeout(r, 600))
      const b = document.querySelector('[data-block-id="b"] [data-reveal]').getBoundingClientRect().height
      const c = document.querySelector('[data-block-id="c"] [data-reveal]').getBoundingClientRect().height
      return { closing, b: Math.round(b), c: Math.round(c), cStyle: document.querySelector('[data-block-id="c"] [data-reveal]').style.height }
    })
    expect(n.closing === 1, "while one closes and the next opens, the closing one says so", n.closing)
    expect(n.b === 0 && n.c > 200 && n.cStyle === "auto", "then the first is shut and the second open, its height let go to auto", n)
    await p.close()
  }

  console.log("\nThe page's hover on the blocks that are not links")
  {
    const { p, errors } = await open("/probe?view=blocks", { width: 1280, height: 900, deviceScaleFactor: 1 })
    const read = (sel) => p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { cls: el.className, hover: el.getAttribute("data-hover"), radius: cs.borderTopLeftRadius, before: getComputedStyle(el, "::before").opacity, pad: cs.paddingTop }
    }, sel)
    const mapSel = '[data-probe="map"] a.op-btn'
    const rest = await read(mapSel)
    await p.hover(mapSel)
    await sleep(350)
    const over = await read(mapSel)
    const frame = await p.evaluate(() => getComputedStyle(document.querySelector('[data-probe="map"] [data-onepage-map] > div')).borderTopLeftRadius)
    const send = await read('[data-probe="contact"] button[type="submit"]')
    const magnet = await read('[data-probe="magnet"] [data-onepage-magnet]')
    const still = await read('[data-probe="still"] a.op-btn')
    expect(errors.length === 0, "no page errors", errors.slice(0, 2))
    expect(rest?.hover === "glow" && rest.before === "0" && over?.before === "1", "Open in Maps glows under the pointer, as a link does", { rest: rest?.before, over: over?.before })
    expect(rest?.pad === "16.8px", "Large gives it the larger padding", rest?.pad)
    expect(rest?.radius === "999px" && frame === "22px", "the button keeps the pill, the map frame stops at 22px", { button: rest?.radius, frame })
    expect(send?.hover === "glow" && /op-btn/.test(send.cls), "Send is the page's button too", send?.hover)
    expect(magnet?.hover === "glow" && /op-btn/.test(magnet.cls), "and a lead magnet", magnet?.hover)
    expect(still?.hover === "none", "inside a group the map's button keeps still", still?.hover)
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} broken` : "\nall measured")
process.exit(broken ? 1 : 0)
