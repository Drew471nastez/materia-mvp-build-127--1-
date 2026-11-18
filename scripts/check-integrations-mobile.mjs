/**
 * ===========================================================================
 *  AN INTEGRATION'S PAGE ON A PHONE: A SETTINGS SCREEN, NOT A WEB PAGE
 * ===========================================================================
 * The real Integrations page in the /app shell (scripts/render-integrations-y2.tsx),
 * in headless Chromium at 375x812 and 390x844 (touch, a phone) and 1280x800
 * (a mouse), on one page of each kind: a pixel to connect, Google Analytics
 * connected, Klaviyo (its ID and its sync), a shipping provider's key, a
 * Coming soon service, Courier tracking and Brevo (Storelib apps) and AfterShip.
 *
 *   W   no sideways scroll, the document's or the page's scroller
 *   T   every press on the page (buttons, links, the How it works row, the
 *       tabs, the fields) is at least 44px tall, and at least 44px wide
 *   S   the phone sheets (How to set it up, Details, Disconnect) keep their
 *       presses at 44px too
 *   M   the page's own transitions are 200ms or less and none under
 *       prefers-reduced-motion
 *
 *   node scripts/check-integrations-mobile.mjs     (wrap in flock /tmp/v-heavy.lock)
 *
 * Pictures go to SHOTS_DIR (.im-shots).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations-mobile-probe")
const shots = process.env.SHOTS_DIR || join(root, ".im-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 600)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function answer(url) {
  const p = new URL(url).pathname
  if (p === "/api/store/integrations/installed") return { installed: [] }
  if (p === "/api/store/integrations") return { tracking: { ga4: "G-TEST123" }, ready: true, ga: null }
  if (p === "/api/physical/integrations") return { integrations: [] }
  if (p === "/api/store/integrations/marketing") return { marketing: [] }
  if (p === "/api/store/integrations/apps") return { states: { "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} }
  if (p === "/api/store/integrations/catalog") return { overrides: [] }
  if (p === "/api/store/reviews-app") return { ready: true, counts: { pending: 0, published: 0, asked: 0 }, settings: { enabled: true } }
  if (p === "/api/store/tracking-app") return { tracking: { platform: { on: true, providerName: "17TRACK", webhooks: true }, ready: true, own: null, following: 0, lastCheckedAt: null } }
  return {}
}

/* Storelib Reviews is not here: its page is /app/reviews (the directory's `only`). */
const PAGES = ["meta-pixel", "google-analytics", "klaviyo", "shipstation", "easyship", "courier-tracking", "brevo", "aftership"]

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useMemo, useSyncExternalStore } from "react"
const subs = new Set()
const ping = () => { for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
for (const name of ["pushState", "replaceState"]) {
  const orig = history[name].bind(history)
  history[name] = (...a) => { orig(...a); ping() }
}
addEventListener("popstate", () => setTimeout(ping, 0))
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => location.search); return useMemo(() => new URLSearchParams(s), [s]) }
const router = { push(href) { history.pushState(null, "", href) }, replace(href) { history.replaceState(null, "", href) }, prefetch() {}, back() { history.back() }, refresh() {} }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
import { useRouter } from "next/navigation"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) {
  const router = useRouter()
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented) return; e.preventDefault(); router.push(href) } }, children)
})
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
  const nav = join(stubs, "navigation.js")
  await build({
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.integrations-mobile-probe/navigation.js", "next/link": "./.integrations-mobile-probe/link.jsx", "next/image": "./.integrations-mobile-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: nav })) } }],
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    entryPoints: [join(root, "scripts/render-integrations-y2.tsx")],
    format: "iife",
    outfile: join(stubs, "page.js"),
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  })
  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const mouseCss = css.replace(/\(hover: hover\) and \(pointer: fine\)/g, "all").replace(/\(hover: hover\)/g, "all").replace(/\(hover: none\)/g, "not all")
  const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 }
  const P375 = { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const P390 = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const isPhone = (vp) => vp.width < 768
  const htmlFor = (vp) => (isPhone(vp) ? page(css) : page(mouseCss))
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })

  async function open(path, vp, reduce = false) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(url)) }).catch(() => {}), 40)
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[file.split(".").pop()] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file) })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: htmlFor(vp) })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    return { p, errors }
  }

  /* Every press inside `scope` that is drawn and reachable: its size, and what it is. */
  const presses = (p, scope) =>
    p.evaluate((scope) => {
      /* The dialog that is open: on a phone the sheet that says so (kept sheets wait at rest, aria-hidden, the same size). */
      const host = scope === "[role=dialog]" ? (document.querySelector("[data-app-sheet=open]") ?? document.querySelector("[role=dialog]:not([aria-hidden=true])")) : document.querySelector(scope)
      if (!host) return { missing: scope }
      const sel = "button, a[href], summary, [role=tab], [role=switch], input:not([type=hidden]), select, textarea"
      const out = []
      for (const el of host.querySelectorAll(sel)) {
        /* Hidden inside the scope (the following bar while away): skipped. A layer around the whole scope does not count. */
        const hidden = el.closest("[inert], [aria-hidden=true]")
        if (hidden && host.contains(hidden)) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.display === "none") continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) {
          const l = el.closest("label").getBoundingClientRect()
          out.push({ what: `label>${el.type}`, text: (el.closest("label").textContent || "").trim().slice(0, 40), w: Math.round(l.width), h: Math.round(l.height) })
          continue
        }
        /* A press grown with a ::before/::after hit area counts at that size. */
        let w = r.width, h = r.height
        for (const pseudo of ["::before", "::after"]) {
          const ps = getComputedStyle(el, pseudo)
          if (ps.content !== "none" && ps.position === "absolute") {
            const t = parseFloat(ps.top), b = parseFloat(ps.bottom), lft = parseFloat(ps.left), rt = parseFloat(ps.right)
            if ([t, b].every(Number.isFinite)) h = Math.max(h, r.height - t - b)
            if ([lft, rt].every(Number.isFinite)) w = Math.max(w, r.width - lft - rt)
          }
        }
        out.push({ what: el.tagName.toLowerCase() + (el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""), text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40), w: Math.round(w), h: Math.round(h), inline: !!el.closest("p") && el.tagName === "A" })
      }
      return out
    }, scope)

  const wideOf = (p) =>
    p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll]")
      return { doc: document.documentElement.scrollWidth - innerWidth, box: box ? box.scrollWidth - box.clientWidth : 0 }
    })

  /* 44px on a phone (touch); a computer keeps /app's 40px buttons (FIELD and the buttons are h-11 sm:h-10 across /app), so 40 there. */
  let MIN = 44
  const shortOnes = (list) => (Array.isArray(list) ? list : [list]).filter((x) => x.missing || (!x.inline && (x.h < MIN || x.w < MIN)))

  async function pageCase(vp, id) {
    MIN = isPhone(vp) ? 44 : 40
    const tag = `${id} ${vp.width}`
    const { p, errors } = await open(`/app/integrations?integration=${id}`, vp)
    await p.waitForSelector("[data-integration-page]", { timeout: 5000 }).catch(() => {})
    await sleep(500)
    const wide = await wideOf(p)
    expect(wide.doc <= 0 && wide.box <= 0, `W ${tag}: no sideways scroll`, wide)
    const list = await presses(p, "[data-integration-page]")
    const short = shortOnes(list)
    report[tag] = { presses: list }
    expect(short.length === 0, `T ${tag}: ${list.length} presses, every one at least ${MIN}x${MIN}`, short)
    const geo = await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll]")
      const r = (s) => document.querySelector(s)?.getBoundingClientRect()
      const head = r("[data-integration-header]"), pageEl = r("[data-integration-page]")
      return { pageLeft: pageEl && Math.round(pageEl.left), pageRight: pageEl && Math.round(innerWidth - pageEl.right), headerTop: head && Math.round(head.top - box.getBoundingClientRect().top), height: box.scrollHeight }
    })
    report[tag].geo = geo
    console.log(`        ${tag}: gutters ${geo.pageLeft}/${geo.pageRight}px, header at ${geo.headerTop}px, page ${geo.height}px tall`)
    await p.screenshot({ path: join(shots, `${id}-${vp.width}.png`), fullPage: false })
    /* Scrolled: the following bar, its back arrow and its action. */
    await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 700))
    await sleep(500)
    const bar = await presses(p, "[data-integration-pin]")
    if (Array.isArray(bar) && bar.length) {
      const shortBar = shortOnes(bar)
      expect(shortBar.length === 0, `T ${tag}: the following bar's ${bar.length} presses reach ${MIN}x${MIN}`, shortBar)
    }
    await p.screenshot({ path: join(shots, `${id}-${vp.width}-scrolled.png`), fullPage: false })
    await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 0))
    await sleep(300)
    /* The whole page, the scroller unrolled (phones only: a computer's is the window's picture above). */
    if (!isPhone(vp)) {
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      await p.close()
      return
    }
    await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll]")
      const h = box.scrollHeight + 120
      /* The floating navigation would land mid page once the scroller is unrolled. */
      for (const el of document.querySelectorAll("body *")) if (getComputedStyle(el).position === "fixed" && !el.closest("[data-integrations-scroll]")) el.style.display = "none"
      for (const el of [document.documentElement, document.body, ...document.querySelectorAll(".h-svh, .app-content-scroll, [data-integrations-scroll]")]) {
        el.style.height = `${h}px`
        el.style.overflow = "visible"
      }
    })
    await sleep(150)
    await p.screenshot({ path: join(shots, `${id}-${vp.width}-full.png`), fullPage: true })
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()
  }

  async function sheetCase(vp, id, opener, label) {
    MIN = 44
    const tag = `${id} ${label} ${vp.width}`
    const { p, errors } = await open(`/app/integrations?integration=${id}`, vp)
    await p.waitForSelector("[data-integration-page]", { timeout: 5000 }).catch(() => {})
    const found = await p.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return false
      el.click()
      return true
    }, opener)
    if (!found) {
      expect(false, `S ${tag}: ${opener} is there`)
      await p.close()
      return
    }
    await sleep(700)
    const list = await presses(p, "[role=dialog]")
    const short = Array.isArray(list) ? shortOnes(list) : [list]
    expect(Array.isArray(list) && list.length > 0 && short.length === 0, `S ${tag}: the sheet's ${Array.isArray(list) ? list.length : 0} presses are at least 44x44`, short)
    const wide = await wideOf(p)
    expect(wide.doc <= 0, `W ${tag}: no sideways scroll with the sheet open`, wide)
    await p.screenshot({ path: join(shots, `${id}-${label}-${vp.width}.png`) })
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()
  }

  async function motionCase(vp, id, reduce) {
    const tag = `${id} ${vp.width}${reduce ? " reduced motion" : ""}`
    const { p } = await open(`/app/integrations?integration=${id}`, vp, reduce)
    await p.waitForSelector("[data-integration-page]", { timeout: 5000 }).catch(() => {})
    const runs = await p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("[data-integration-page] *, [data-integration-pin], [data-integration-pin] *")) {
        const cs = getComputedStyle(el)
        const d = cs.transitionDuration.split(",").map((s) => parseFloat(s) * (s.trim().endsWith("ms") ? 1 : 1000))
        const max = Math.max(...d)
        if (max > 0) out.push({ el: el.tagName.toLowerCase() + (el.dataset ? Object.keys(el.dataset).slice(0, 1).map((k) => `[${k}]`).join("") : ""), ms: max, props: cs.transitionProperty })
      }
      return out
    })
    if (reduce) {
      /* Colour on a press is not motion; anything that moves or fades is. */
      const moving = runs.filter((r) => /all|opacity|transform|translate|scale|rotate|height|width|top|left/.test(r.props))
      expect(moving.length === 0, `M ${tag}: nothing moves or fades`, moving.slice(0, 8))
    } else {
      const slow = runs.filter((r) => r.ms > 200)
      expect(slow.length === 0, `M ${tag}: ${runs.length} transitions, none over 200ms`, slow.slice(0, 8))
    }
    await p.close()
  }

  for (const vp of [P375, P390, DESK]) {
    console.log(`\n${vp.width}x${vp.height}\n`)
    for (const id of PAGES) await pageCase(vp, id)
  }
  for (const vp of [P375, P390]) {
    console.log(`\nsheets ${vp.width}\n`)
    await sheetCase(vp, "meta-pixel", "[data-integration-steps-open]", "steps")
    await sheetCase(vp, "meta-pixel", "[data-integration-details-open]", "details")
    await sheetCase(vp, "google-analytics", "[data-integration-uninstall], [data-integration-remove] button", "remove")
  }
  console.log("\nmotion\n")
  await motionCase(P390, "meta-pixel", false)
  await motionCase(P390, "google-analytics", false)
  await motionCase(P390, "meta-pixel", true)
  await motionCase(P390, "google-analytics", true)

  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures and report.json in ${shots})\n`)
process.exit(broken ? 1 : 0)
