/**
 * ===========================================================================
 *  THE CANVAS NEVER STAYS ON ITS GREY OUTLINE
 * ===========================================================================
 *   npx tsx scripts/check-canvas-loading.ts <theme.zip>
 *
 * "Sometimes the website builder editor doesn't load the theme at all": the
 * canvas sat on the outline of a page for good, on a computer and on a phone.
 * The real editor (scripts/render-editor-probe.tsx, bundled by
 * scripts/editor-probe-harness.mjs) is opened on an imported theme, with the
 * network made to misbehave in each of the ways that used to hold it there:
 *
 *   the theme's files answer 500 twice, then answer: the page is drawn, and
 *     nothing is said (the retries are quiet)
 *   the theme's files always answer 500: the canvas says so, with Try again,
 *     and Try again draws the page once they answer
 *   one of the theme's deferred scripts never answers, which holds the
 *     page's DOMContentLoaded back for good: the page is shown anyway, and a
 *     click in it still selects its section
 *   on a phone (390 wide): the page is drawn
 *   another page opened from the switcher: at no frame is the canvas without
 *     a page (no white, no outline), and the page changes
 *
 * And the builder's own theme (no imported theme), with its sections answered
 * slowly: a page opened from the switcher is held under the page it replaces
 * and crossfaded (lib/website-builder/canvas-still.ts), never faded up from
 * white; and a page whose sections answer 500 says so and leaves the page on
 * screen.
 *
 * Prints what it measured. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer, { type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-canvas-loading.ts <theme.zip>"); process.exit(2) }
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const r = await convertShopifyTheme(await JSZip.loadAsync(readFileSync(zipPath)))
  if (!r.ok) throw new Error(r.error)
  const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: r.theme.settings, pages, sources, files }
  /* The first deferred script the theme's layout asks for: the one made to stall. */
  const layout = String(Object.entries(r.theme.files).find(([p]) => /(^|\/)layout\/theme\.(liquid|storelib)$/.test(p))?.[1] ?? "")
  const stallName = /['"]([\w.-]+\.js)['"]\s*\|\s*asset_url[^>]*>\s*<\/script>/.exec(layout)?.[1] ?? /['"]([\w.-]+\.js)['"]\s*\|\s*asset_url/.exec(layout)?.[1] ?? null
  console.log(`${r.theme.name}: the canvas through a bad network${stallName ? ` (stalled script: ${stallName})` : ""}`)

  let stall: string | null = null
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/" || url.pathname === "/native") {
      const head = url.pathname === "/native" ? "" : `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};`
      const extra = url.searchParams.get("g") ?? ""
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${head}${extra}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      /* Never answered: the browser waits on it for as long as the page is open. */
      if (stall && name === stall) return
      const text = r.theme.files[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"], protocolTimeout: 300_000 })

  const open = async (globals: string, view = { width: 1440, height: 900 }, path = "/"): Promise<Page> => {
    const page = await browser.newPage()
    await page.setViewport(view)
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    await page.goto(`${base}${path}?g=${encodeURIComponent(globals)}`, { waitUntil: "domcontentloaded" })
    return page
  }
  /* What the canvas shows: the outline, a problem, or a page (the front frame). */
  const state = (page: Page) =>
    page.evaluate(() => ({
      outline: document.querySelector("[data-canvas-placeholder]")?.getAttribute("data-canvas-placeholder") ?? null,
      problem: document.querySelector("[data-canvas-problem]")?.getAttribute("data-canvas-problem") ?? null,
      frame: !!document.querySelector("[data-compat-frame='front']"),
      loader: !!document.querySelector(".wb-canvas-loader:not([data-leaving='true'])"),
    }))
  const until = async (page: Page, ok: (s: Awaited<ReturnType<typeof state>>) => boolean, ms: number) => {
    const t0 = Date.now()
    let s = await state(page)
    while (!ok(s) && Date.now() - t0 < ms) {
      await sleep(150)
      s = await state(page)
    }
    return { s, ms: Date.now() - t0 }
  }
  const drawn = (s: Awaited<ReturnType<typeof state>>) => s.frame && s.outline === "gone"

  /* ONLY=compat or ONLY=native runs the one half. */
  const only = process.env.ONLY ?? ""
  try {
    if (only !== "native") {
    {
      const page = await open("window.PROBE_FILES_FAIL=2;")
      const { s, ms } = await until(page, drawn, 20_000)
      check("the theme's files fail twice, then answer: the page is drawn", drawn(s), `${ms}ms`)
      check("  and nothing is said about it", s.problem === null)
      await page.close()
    }
    {
      const page = await open("window.PROBE_FILES_FAIL=1000;")
      const { s, ms } = await until(page, (x) => x.problem !== null, 20_000)
      check("the theme's files always fail: the canvas says so, with Try again", s.problem === "files", `${s.problem ?? "nothing"} after ${ms}ms`)
      const words = await page.evaluate(() => document.querySelector("[data-canvas-problem]")?.textContent ?? "")
      check("  in words", /didn't load/.test(words) && /Try again/.test(words), words)
      check("  over the canvas, not under the editor's loader", !s.loader)
      await page.evaluate(() => { (window as unknown as { PROBE_FILES_FAIL: number }).PROBE_FILES_FAIL = 0 })
      await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("[data-canvas-problem] button")].find((b) => /Try again/.test(b.textContent ?? ""))?.click())
      const after = await until(page, drawn, 20_000)
      check("  and Try again draws the page once they answer", drawn(after.s) && after.s.problem === null, `${after.ms}ms`)
      await page.close()
    }
    if (stallName) {
      stall = stallName
      const page = await open("")
      const { s, ms } = await until(page, drawn, 15_000)
      check("a script of the theme's never answers: the page is shown anyway", drawn(s), `${ms}ms`)
      /* A click in it still selects its section: the bridge said it was ready. */
      const frame = page.frames().find((f) => f !== page.mainFrame() && f.url() === "about:srcdoc")
      const target = frame ? await frame.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLElement>(".shopify-section:not(.shopify-section-group-header-group) h1, .shopify-section:not(.shopify-section-group-header-group) h2, .shopify-section:not(.shopify-section-group-header-group) p")].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top > 0 && r.top < innerHeight })
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2, id: el.closest(".shopify-section")?.getAttribute("data-section-id") ?? "" }
      }).catch(() => null) : null
      if (target) {
        await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.getAttribute("aria-label")?.match(/inspector/i) && b.getAttribute("aria-pressed") === "false")?.click())
        const box = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
        await page.mouse.click(box!.x + target.x, box!.y + target.y)
        await sleep(800)
        const picked = await page.evaluate(() => document.body.innerText.includes("Back") || !!document.querySelector("[data-panel-back]"))
        check("  and a click in it still selects its section", picked, target.id)
      } else check("  and a click in it still selects its section", false, "nothing to click")
      stall = null
      await page.close()
    }
    {
      const page = await open("", { width: 390, height: 844 })
      const { s, ms } = await until(page, drawn, 20_000)
      check("on a phone, the page is drawn", drawn(s), `${ms}ms`)
      await page.close()
    }
    {
      const page = await open("")
      await until(page, drawn, 20_000)
      await sleep(1200)
      /* Every frame across the switch: is there a page on screen, and which. */
      await page.evaluate(() => {
        const w = window as unknown as { probeFrames: { front: boolean; outline: string | null; frames: number; title: string }[]; probeStop: boolean }
        w.probeFrames = []
        w.probeStop = false
        const tick = () => {
          const fronts = document.querySelectorAll("[data-compat-frame]")
          w.probeFrames.push({
            front: !!document.querySelector("[data-compat-frame='front']"),
            outline: document.querySelector("[data-canvas-placeholder]")?.getAttribute("data-canvas-placeholder") ?? null,
            frames: fronts.length,
            title: [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()).find((t) => /^(Home|Collection|Products|All products|Search|Cart|Collections)( page)?$/i.test(t)) ?? "",
          })
          if (!w.probeStop) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const before = await page.evaluate(() => (document.querySelector("[data-compat-frame='front']") as HTMLIFrameElement | null)?.srcdoc.length ?? 0)
      /* The switcher, then another page in it. */
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => /^Home( page)?$/i.test((b.textContent ?? "").trim()))?.click())
      await sleep(500)
      const picked = await page.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], button")].find((b) => /^(Collection|Products|All products|Search|Cart|Collections)( page)?$/i.test((b.textContent ?? "").trim()))
        el?.click()
        return el?.textContent?.trim() ?? null
      })
      await sleep(3500)
      const frames = await page.evaluate(() => { const w = window as unknown as { probeFrames: { front: boolean; outline: string | null; frames: number }[]; probeStop: boolean }; w.probeStop = true; return w.probeFrames })
      const after = await page.evaluate(() => (document.querySelector("[data-compat-frame='front']") as HTMLIFrameElement | null)?.srcdoc.length ?? 0)
      const bare = frames.filter((f) => !f.front || f.outline === "up").length
      check("an imported theme's page opened from the switcher: the page changes", !!picked && after > 0 && after !== before, `${picked ?? "no page to open"}`)
      check("  and no frame shows the canvas without a page", bare === 0, `${bare} of ${frames.length} frames`)
      check("  the page it replaced stays under it while it fades in", frames.some((f) => f.frames >= 2), `${Math.max(...frames.map((f) => f.frames))} frames at most`)
      await page.close()
    }

    }

    /* ── The builder's own theme ── */
    if (only !== "compat") {
      const pagesGlobals = `window.PROBE_PAGES={home:["hero_centered","features_grid","footer"],about:["about_image","about_timeline","footer"]};window.PROBE_PAGE_DELAY_MS=400;`
      const page = await open(pagesGlobals, { width: 1440, height: 900 }, "/native")
      const logged: string[] = []
      page.on("console", (m) => logged.push(m.text()))
      for (let i = 0; i < 60; i++) {
        if (await page.evaluate(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length > 0)) break
        await sleep(200)
      }
      await sleep(1200)
      await page.evaluate(() => {
        const w = window as unknown as { probeFrames: { still: boolean; stillOpacity: number; pageOpacity: number; types: string; t: number }[]; probeStop: boolean }
        w.probeFrames = []
        w.probeStop = false
        const tick = () => {
          const still = document.querySelector<HTMLElement>("[data-canvas-still]")
          const root = document.getElementById("wb-preview-root")
          const page = root?.firstElementChild as HTMLElement | null
          w.probeFrames.push({
            still: !!still,
            stillOpacity: still ? Number(getComputedStyle(still).opacity) : 0,
            pageOpacity: page ? Number(getComputedStyle(page).opacity) : 0,
            types: [...(root?.querySelectorAll("[data-section-box]") ?? [])].map((b) => b.getAttribute("data-section-type")).join(","),
            t: performance.now(),
          })
          if (!w.probeStop) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => /^Home( page)?$/i.test((b.textContent ?? "").trim()))?.click())
      await sleep(400)
      /* A page's row says which page it is (page-switcher.tsx): the Add section library's own "About" category is mounted behind its closed dialog. */
      const picked = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[data-page-row='about']")
        el?.click()
        return el ? "About" : null
      })
      await sleep(3500)
      const frames = await page.evaluate(() => { const w = window as unknown as { probeFrames: { still: boolean; stillOpacity: number; pageOpacity: number; types: string; t: number }[]; probeStop: boolean }; w.probeStop = true; return w.probeFrames })
      const first = frames[0]?.types ?? ""
      const last = frames[frames.length - 1]?.types ?? ""
      const switched = frames.findIndex((f) => f.types !== first)
      const heldAtSwitch = switched >= 0 && frames[switched].still && frames[switched].stillOpacity > 0.95
      /* What is seen through: the copy over the page, or the page itself. White shows where both are faint. */
      const faintest = Math.min(...frames.slice(Math.max(0, switched)).map((f) => (f.still ? 1 - (1 - f.stillOpacity) * (1 - f.pageOpacity) : f.pageOpacity)))
      check("the builder's own theme: a page opened from the switcher changes the page", !!picked && last !== first && /about_image/.test(last), `${picked ?? "nothing"}: ${first} to ${last}`)
      check("  the page being left is held over it, whole, on the frame it changes", heldAtSwitch, switched >= 0 ? JSON.stringify(frames[switched]) : "never switched")
      check("  the canvas is never faded toward white", faintest > 0.95, `least opaque frame ${faintest.toFixed(2)}`)
      const held = frames.filter((f) => f.still)
      const heldMs = held.length ? Math.round(held[held.length - 1].t - held[0].t) : 0
      check("  and the copy is gone afterwards", !frames[frames.length - 1].still, `held for ${heldMs}ms`)
      /* A page whose sections answer 500: said, and the page on screen stays. */
      await page.evaluate(() => { (window as unknown as { PROBE_PAGES: Record<string, string[]> }).PROBE_PAGES.contact = ["about_image"] })
      await page.setRequestInterception(false)
      await page.evaluate(() => {
        const real = window.fetch
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const u = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
          if (/sections\?page=home/.test(u)) return Promise.resolve(new Response("{}", { status: 500 }))
          return real(input, init)
        }
      })
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => /^About( page| us)?$/i.test((b.textContent ?? "").trim()))?.click())
      await sleep(400)
      await page.evaluate(() => document.querySelector<HTMLElement>("[data-page-row='home']")?.click())
      await sleep(1500)
      /* The toast is the editor layout's (EditorToaster), which the probe does not mount: what it is told is read from the log beside it. */
      const said = logged.some((t) => /a page could not be opened/.test(t))
      const still = await page.evaluate(() => [...document.querySelectorAll("#wb-preview-root [data-section-box]")].map((b) => b.getAttribute("data-section-type")).join(","))
      const skeleton = await page.evaluate(() => !!document.querySelector("[aria-busy='true'].skeleton-deferred"))
      check("  a page whose sections answer 500 is said, not drawn empty", said && /about_image/.test(still), still)
      check("  and the sidebar does not wait on it", !skeleton)
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
