/**
 * ===========================================================================
 *  ROUND 29: THE INTEGRATIONS PILLS, MEASURED
 * ===========================================================================
 * The real sidebar beside the real Integrations page (scripts/render-sidebar-
 * round29.tsx), in headless Chromium. The sidebar's collapse control and its
 * motion are measured by scripts/check-sidebar-round31.mjs since round 30 (round 31 moved the control to a row).
 *
 *   the pills    each pill's number is the cards it shows, no card twice,
 *                 each category holds exactly its integrations, working ones
 *                 before Coming soon; a switch crossfades (the two layers add
 *                 up to one every frame), the height eases instead of
 *                 jumping, and no logo is loaded or mounted again
 *
 *   PROBE_CSS=source node scripts/check-sidebar-round29.mjs
 *
 * Pictures go to SHOTS_DIR (.round29-shots) to look at.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".sidebar-round29-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round29-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* What the store has, for the stubbed /api answers, and so what Installed must hold. */
const API = {
  "/api/store/integrations/installed": { installed: [] },
  "/api/store/integrations": { tracking: { ga4: "G-TEST123" }, ready: true },
  "/api/physical/integrations": {
    integrations: [
      { provider: "printful", status: "connected", url: null, keyHint: "1234", secretHint: null, lastSyncAt: null, lastError: null },
      { provider: "custom_webhook", status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null },
    ],
  },
  "/api/store/integrations/marketing": { marketing: [{ provider: "klaviyo", connected: true, keyHint: "abcd", account: "Mara", listId: "L1", listName: "News", lastError: null }] },
  "/api/store/integrations/apps": { states: { "storelib-email-marketing": "on", "storelib-markets": "setup", "storelib-code": "off", "storelib-bundles": "on", "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} },
  "/api/store/integrations/catalog": { overrides: [] },
  "/api/store/reviews-app": { settings: { enabled: true } },
  "/api/store/tracking-app": { tracking: { own: { provider: "aftership", providerName: "AfterShip" } } },
}
const EXPECTED_INSTALLED = ["storelib-reviews", "courier-tracking", "storelib-email-marketing", "storelib-bundles", "google-analytics", "klaviyo", "aftership", "printful"].sort()
/* Storelib's own apps that fit a category (the rest only under Storelib apps and All). */
const APP_IN = { "storelib-email-marketing": "email" }

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }
  return {
    channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const common = {
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.sidebar-round29-probe/navigation.js", "next/link": "./.sidebar-round29-probe/link.jsx", "next/image": "./.sidebar-round29-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    loader: { ".css": "empty" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  }
  await build({ ...common, entryPoints: [join(root, "scripts/render-sidebar-round29.tsx")], format: "iife", outfile: join(stubs, "page.js"), banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" } })
  /* The catalog itself, for what each category must hold. */
  writeFileSync(join(stubs, "catalog-entry.ts"), `export { visibleIntegrations, CATEGORY_ORDER, CATEGORY_NAMES } from "@/lib/integrations/catalog"\nexport { storelibApps } from "@/lib/integrations/storelib-apps"\nexport { hasBuiltInArt } from "@/components/app/settings/integration-mark"\n`)
  await build({ ...common, entryPoints: [join(stubs, "catalog-entry.ts")], format: "esm", platform: "node", outfile: join(stubs, "catalog.mjs"), external: ["react", "react-dom", "lucide-react"] })
  const catalog = await import(pathToFileURL(join(stubs, "catalog.mjs")).href)

  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  /* The harness draws the shell with the layout's own classes. */
  console.log("\nThe harness is the layout\n")
  {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-sidebar-round29.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    const mainL = cls(layout, /<main className="([^"]+)"/)
    const mainH = cls(harness, /MAIN_CLASS =\s*"([^"]+)"/)
    const rootL = cls(layout, /<div className="([^"]+)" data-app-rail=\{rail\}/)
    const rootH = cls(harness, /ROOT_CLASS = "([^"]+)"/)
    expect(!!mainL && mainL === mainH, "the page's <main> has app/app/layout.tsx's classes", mainL === mainH ? undefined : { mainL, mainH })
    expect(!!rootL && rootL === rootH, "and so has the shell's root", rootL === rootH ? undefined : { rootL, rootH })
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, { vp = DESK, mac = false, reducedMotion = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    if (mac) await p.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" })
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "macOS" }) })
    })
    else await p.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "Linux x86_64" })
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "Linux" }) })
    })
    if (reducedMotion) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "").split("?")[0]
        const body = API[short] ?? {}
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      /* The logos are the real files in /public. */
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const ext = file.split(".").pop()
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[ext] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file), headers: { "cache-control": "max-age=3600" } })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    if (!(await p.$("[data-rail-aside]"))) throw new Error(`the shell did not draw: ${errors.join(" | ") || (await p.evaluate(() => document.body.innerHTML.slice(0, 400)))}`)
    return { p, errors }
  }

  /*
    The sidebar's collapse control and its motion moved to
    scripts/check-sidebar-round31.mjs. Changed on purpose (the owner: "I don't
    like that you put the collapsible sidebar icon above the Dashboard and
    created that empty space above the Dashboard menu link"): the control is
    a row above the Upgrade card since round 31, the collapsed width is 63px and the
    icons never move, so the expectations here (an icon in the top corner,
    68px, a 2.5px slide) no longer describe the product.
  */
  // ── The pills ──────────────────────────────────────────────────────────────
  console.log("\nThe Integrations pills\n")
  {
    const { p, errors } = await open("/app/integrations")
    await sleep(600)
    const all = catalog.visibleIntegrations(true)
    const apps = catalog.storelibApps(true).filter((a) => !a.core)
    const own = (id) => catalog.hasBuiltInArt(id)
    const expected = {
      all: [...all.map((i) => i.id), ...apps.map((a) => a.id)],
      storelib: [...all.filter((i) => own(i.id)).map((i) => i.id), ...apps.map((a) => a.id)],
      installed: EXPECTED_INSTALLED,
    }
    for (const c of catalog.CATEGORY_ORDER) expected[c] = [...all.filter((i) => i.category === c).map((i) => i.id), ...apps.filter((a) => APP_IN[a.id] === c).map((a) => a.id)]
    const soon = new Set(all.filter((i) => i.comingSoon).map((i) => i.id))
    const pills = await p.evaluate(() => [...document.querySelectorAll("[data-integration-pill]")].map((b) => ({ id: b.getAttribute("data-integration-pill"), label: b.textContent, count: Number(b.lastElementChild.textContent) })))
    report.pills = {}
    const seenPills = pills.map((x) => x.id)
    const shouldHave = ["all", "installed", "storelib", ...catalog.CATEGORY_ORDER.filter((c) => expected[c].length > 0)]
    expect(seenPills.join() === shouldHave.join(), "a pill for All, Installed, Storelib apps and every category with something in it", seenPills)
    for (const pill of pills) {
      await p.evaluate((id) => document.querySelector(`[data-integration-pill="${id}"]`).click(), pill.id)
      await sleep(450)
      const shown = await p.evaluate(() => ({
        ids: [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden && li.offsetParent !== null).map((li) => li.querySelector("[data-integration-card]").getAttribute("data-integration-card")),
        stills: document.querySelectorAll("[data-integration-still]").length,
        badges: [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden).map((li) => li.textContent.includes("Coming soon")),
      }))
      const want = expected[pill.id] ?? []
      const dupes = shown.ids.filter((id, i) => shown.ids.indexOf(id) !== i)
      const missing = want.filter((id) => !shown.ids.includes(id))
      const extra = shown.ids.filter((id) => !want.includes(id))
      /* Working before Coming soon among the services (Storelib's own first, none of them coming soon). */
      const services = shown.ids.filter((id) => !own(id) && !apps.some((a) => a.id === id))
      const firstSoon = services.findIndex((id) => soon.has(id))
      const workingAfterSoon = firstSoon < 0 ? [] : services.slice(firstSoon).filter((id) => !soon.has(id))
      const ownFirst = shown.ids.findIndex((id) => !own(id) && !apps.some((a) => a.id === id))
      const ownAfter = ownFirst < 0 ? [] : shown.ids.slice(ownFirst).filter((id) => own(id) || apps.some((a) => a.id === id))
      report.pills[pill.id] = { count: pill.count, shown: shown.ids.length, order: shown.ids }
      expect(
        pill.count === shown.ids.length && dupes.length === 0 && missing.length === 0 && extra.length === 0 && shown.stills === 0,
        `${pill.label.replace(/\d+$/, "").padEnd(16)} ${String(pill.count).padStart(2)} on the pill, ${String(shown.ids.length).padStart(2)} cards, exactly its own`,
        missing.length || extra.length || dupes.length ? { missing, extra, dupes } : undefined,
      )
      expect(workingAfterSoon.length === 0 && ownAfter.length === 0, `${" ".repeat(19)}Storelib's own first, working services before Coming soon`, workingAfterSoon.length || ownAfter.length ? { workingAfterSoon, ownAfter } : undefined)
    }
    /* All in category order among the working services. */
    await p.evaluate(() => document.querySelector('[data-integration-pill="all"]').click())
    await sleep(450)
    const allOrder = report.pills.all.order.filter((id) => !own(id) && !apps.some((a) => a.id === id) && !soon.has(id)).map((id) => catalog.CATEGORY_ORDER.indexOf(all.find((i) => i.id === id).category))
    expect(allOrder.every((c, i) => i === 0 || c >= allOrder[i - 1]), "All: the working services run category by category", allOrder.join(""))

    /* A switch, frame by frame: scrolled to the bottom of All, then Reviews (much shorter). */
    await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll]")
      /* Scrolled down until the pills are near the top, where a thumb on them would be, with All's cards filling the screen under them. */
      const pills = document.querySelector("[data-integration-pills]")
      box.scrollTop += pills.getBoundingClientRect().top - box.getBoundingClientRect().top - 80
      window.__imgs = [...document.querySelectorAll("[data-integration-grid] img")]
      window.__loads = 0
      document.addEventListener("load", (e) => { if (e.target.tagName === "IMG" && e.target.closest("[data-integration-grid]")) window.__loads++ }, true)
    })
    await sleep(200)
    const film = await p.evaluate(
      (pillId) =>
        new Promise((res) => {
          const scroller = document.querySelector("[data-integrations-scroll]")
          const box = document.querySelector("[data-integration-grid-box]")
          const pills = document.querySelector("[data-integration-pills]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; document.querySelector(`[data-integration-pill="${pillId}"]`).click() }
            const still = box.querySelector("[data-integration-still]")
            const live = box.querySelector("[data-integration-grid]")
            /* The layer the new cards are in: the list, or the empty card when nothing matches. */
            const layer = [live, box.querySelector("[data-integration-empty]")].find((el) => !el.hidden)
            frames.push({ t: Math.round(t - t0), h: box.getBoundingClientRect().height, still: still ? +getComputedStyle(still).opacity : null, live: +getComputedStyle(layer).opacity, top: scroller.scrollTop, pills: pills.getBoundingClientRect().top })
            if (t - t0 < 420) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
      "reviews",
    )
    if (process.env.DEBUG_FILM) console.log(film)
    const during = film.filter((f) => f.still !== null)
    const sums = during.map((f) => f.still + f.live)
    const hBack = film.slice(1).some((f, i) => f.h > film[i].h + 0.01)
    const hSteps = film.slice(1).map((f, i) => film[i].h - f.h)
    const hTotal = film[0].h - film.at(-1).h
    const pillSteps = film.slice(1).map((f, i) => Math.abs(f.pills - film[i].pills))
    const kept = await p.evaluate(() => window.__imgs.every((img) => img.isConnected) && document.querySelectorAll("[data-integration-grid] img").length === window.__imgs.length)
    const loads = await p.evaluate(() => window.__loads)
    report.crossfade = { frames: film.length, fadeFrames: during.length, first: film[0], last: film.at(-1), minSum: Math.min(...sums), maxSum: Math.max(...sums), heightFrom: film[0].h, heightTo: film.at(-1).h, biggestHeightShare: hTotal ? +(Math.max(...hSteps) / hTotal).toFixed(2) : 0, biggestPillsStep: Math.max(...pillSteps) }
    /* Frame 0 is the press itself, before React has drawn anything: the first frame drawn after it is the one the eye sees. */
    const firstDrawn = during[0]
    expect(during.length >= 8 && Math.abs(firstDrawn.still - 1) < 0.05 && firstDrawn.live < 0.05, "the first frame after the press still shows the old cards whole: no flash, no drop to half", firstDrawn)
    expect(sums.every((s) => Math.abs(s - 1) <= 0.02), "old out, new in, adding up to one every frame", { min: Math.min(...sums).toFixed(3), max: Math.max(...sums).toFixed(3) })
    expect(!hBack && hTotal > 100 && Math.max(...hSteps) / hTotal <= 0.3 && film.at(-1).still === null, "the height eases down, never all at once, and the still is gone after", { from: film[0].h, to: film.at(-1).h, biggestShare: report.crossfade.biggestHeightShare })
    expect(Math.max(...pillSteps) <= 0.5 && film.every((f) => f.top === film[0].top), "the pills and the page do not move at all under the thumb (the scroll never clamps)", { biggestPillsStep: Math.max(...pillSteps), scrollTops: [...new Set(film.map((f) => f.top))] })
    expect(kept && loads === 0, "no card mounted again, no logo loaded again", { kept, loads })
    /* The room left under the short category goes as the page is scrolled back up, with nothing seen to move. */
    const up = await p.evaluate(
      () =>
        new Promise((res) => {
          const scroller = document.querySelector("[data-integrations-scroll]")
          const pills = document.querySelector("[data-integration-pills]")
          const box = document.querySelector("[data-integration-grid-box]")
          const out = []
          const tick = () => {
            out.push({ top: scroller.scrollTop, sum: pills.getBoundingClientRect().top + scroller.scrollTop, h: box.getBoundingClientRect().height, min: box.style.minHeight })
            if (scroller.scrollTop > 0) {
              scroller.scrollTop -= 40
              requestAnimationFrame(() => requestAnimationFrame(tick))
            } else res(out)
          }
          tick()
        }),
    )
    const drift = Math.max(...up.map((f) => Math.abs(f.sum - up[0].sum)))
    report.scrollUp = { steps: up.length, drift, heightFrom: up[0].h, heightTo: up.at(-1).h, minHeightAtTop: up.at(-1).min }
    expect(drift <= 0.5 && up.at(-1).min === "" && up.at(-1).h < up[0].h, "scrolled back up, the room under the cards goes and nothing on screen shifts", report.scrollUp)
    /* And back to All: taller, the new cards fade in where they land. */
    const back = await p.evaluate(
      () =>
        new Promise((res) => {
          const box = document.querySelector("[data-integration-grid-box]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; document.querySelector('[data-integration-pill="all"]').click() }
            const still = box.querySelector("[data-integration-still]")
            const live = box.querySelector("[data-integration-grid]")
            frames.push({ t: Math.round(t - t0), still: still ? +getComputedStyle(still).opacity : null, live: +getComputedStyle(live).opacity })
            if (t - t0 < 300) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
    )
    const backSums = back.filter((f) => f.still !== null).map((f) => f.still + f.live)
    expect(backSums.length >= 8 && backSums.every((s) => Math.abs(s - 1) <= 0.02) && back.at(-1).still === null, "back to All the same way", { frames: backSums.length })

    /* Stopped halfway through a crossfade, to look at. */
    await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = 520 })
    await sleep(200)
    await p.evaluate(() => document.querySelector('[data-integration-pill="analytics"]').click())
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => { document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => { a.pause(); a.currentTime = 90 }); r() })))
    await sleep(60)
    await p.screenshot({ path: join(shots, "pills-crossfade-midway.png"), captureBeyondViewport: false })
    await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "paused").forEach((a) => a.play()))
    await sleep(600)
    await p.screenshot({ path: join(shots, "pills-analytics.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* A phone: one card of rows, a hairline between the rows shown, none above the first. */
  {
    const { p } = await open("/app/integrations", { vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } })
    await sleep(400)
    const check = async (pill) => {
      await p.evaluate((id) => document.querySelector(`[data-integration-pill="${id}"]`).click(), pill)
      await sleep(450)
      return p.evaluate(() => {
        const lis = [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden)
        return lis.map((li) => parseFloat(getComputedStyle(li).borderTopWidth))
      })
    }
    const a = await check("all")
    const r = await check("shipping")
    expect(a[0] === 0 && a.slice(1).every((w) => w === 1) && r[0] === 0 && r.slice(1).every((w) => w === 1), "phone: a hairline between the rows shown, none above the first, in every pill", { all: a.length, shipping: r })
    await p.screenshot({ path: join(shots, "phone-shipping.png") })
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${JSON.stringify(report, (k, v) => (k === "order" ? undefined : v), 1).slice(0, 4000)}\n`)
console.log(broken ? `${broken} FAILED` : "all ok")
process.exit(broken ? 1 : 0)
