/**
 * ===========================================================================
 *  ROUND 27 (J27), MEASURED: THE SETUP PILL AND THE BOTTOM BARS, THE CREATE
 *  WIZARD, A COMMUNITY'S ANALYTICS
 * ===========================================================================
 * The real /app shell and pages (scripts/render-j27.tsx) and the real
 * Analytics section (scripts/render-community-analytics-round31.tsx) in
 * headless Chromium, every /api request answered by the page itself.
 *
 *   PILL      at 1440, 1024 and 820 (and 390, where it is not drawn): on New
 *             community, and on a community page whose save bar comes up and
 *             goes, no Setup pill that can be seen or pressed ever overlaps a
 *             bar or its buttons; with no bar the pill is there as it was
 *   WIZARD    at 1440, 1024, 820, 390 (touch, 4x CPU) and at 1440 zoomed to
 *             150% and 200% (960 and 720 wide): every step inside the screen,
 *             nothing in a step wider than its card, the cover as wide as
 *             the card and its button inside it, the hint on at most two
 *             lines; Create sends no welcome fields; the welcome step is the
 *             feed's composer, opened with the welcome in Announcements, and
 *             Post sends it, pins it and opens the Overview
 *   ANALYTICS at 1440, 1024, 820 and 390: the sections are a row of tabs with
 *             a line under them, 24px or more below the overview and 16 to
 *             24px above their panel; each section chosen draws its own
 *
 *   node scripts/check-j27.mjs [PILL WIZARD ANALYTICS]
 *   SHOTS_DIR=dir keeps the pictures (a temp dir by default, printed at the end)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-j27-")), "shots")
mkdirSync(shots, { recursive: true })
const dir = join(root, ".j27-probe")
mkdirSync(dir, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWS = {
  1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
  1024: { width: 1024, height: 768, deviceScaleFactor: 1 },
  820: { width: 820, height: 1180, deviceScaleFactor: 1, hasTouch: true },
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "zoom150": { width: 960, height: 600, deviceScaleFactor: 1 },
  "zoom200": { width: 720, height: 450, deviceScaleFactor: 1 },
}

writeFileSync(join(dir, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, refresh() {}, back() {}, forward() {} }
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault(); (window.__router ||= []).push(["link", href]) } }, children)
})
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
writeFileSync(join(dir, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) {
  return function Dynamic(props) {
    const [C, setC] = React.useState(null)
    React.useEffect(() => { let live = true; Promise.resolve(load()).then((m) => live && setC(() => (m && m.default) || m)); return () => { live = false } }, [])
    return C ? React.createElement(C, props) : null
  }
}
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "user-1", user_metadata: {} } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => ({}) }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
export async function nativeLogOut() {}
`)

function bundle(entry, out) {
  execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, out)}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
}

/* What overlaps what: the setup pills that can be seen and pressed, and every bottom bar that is up, with its buttons. */
const PILL_LOOK = () => {
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }
  }
  const pills = [...document.querySelectorAll("[data-setup-pill],[data-community-setup]")].map((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { which: el.hasAttribute("data-setup-pill") ? "store" : "community", shown: cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.02 && r.width > 0, press: cs.pointerEvents !== "none", away: el.hasAttribute("data-away"), ...box(el) }
  })
  const bars = [...document.querySelectorAll('[data-app-foot="up"]')].filter((el) => el.getClientRects().length > 0).map((el) => {
    const face = el.querySelector("[data-foot-bar]") || el
    return { ...box(face), buttons: [...face.querySelectorAll("button,a")].filter((b) => b.getClientRects().length > 0).map(box) }
  })
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
  const overlaps = []
  for (const p of pills) if (p.shown) for (const bar of bars) if (hit(p, bar) || bar.buttons.some((x) => hit(p, x))) overlaps.push({ pill: p, bar })
  return { pills, bars, overlaps, scrollW: document.scrollingElement.scrollWidth, vw: innerWidth }
}

/* The wizard's step on screen: the card, anything in it wider than it, the cover and its button, the hint's lines. */
const STEP_LOOK = () => {
  const r = (el) => el && el.getBoundingClientRect()
  const card = document.querySelector("[data-wizard-step-body] [data-editor-card]") || document.querySelector("[data-wizard-welcome]")
  const c = r(card)
  const out = []
  if (card)
    for (const el of card.querySelectorAll("*")) {
      const b = el.getBoundingClientRect()
      if (!b.width || getComputedStyle(el).position === "fixed") continue
      if (b.right > c.right + 1 || b.left < c.left - 1) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), l: Math.round(b.left), r: Math.round(b.right) })
    }
  const cover = r(document.querySelector("[data-wizard-cover]"))
  const coverBtn = r(document.querySelector("[data-wizard-cover-button]"))
  const hint = document.querySelector("[data-wizard-look-hint]")
  const lh = hint ? parseFloat(getComputedStyle(hint).lineHeight) : 0
  const scrollers = [...document.querySelectorAll("[data-create-community]")].map((el) => el.scrollWidth - el.clientWidth)
  return {
    at: document.querySelector("[data-create-community]")?.getAttribute("data-wizard-at"),
    card: c ? { l: Math.round(c.left), r: Math.round(c.right), w: Math.round(c.width) } : null,
    outside: out.slice(0, 5),
    cover: cover ? { w: Math.round(cover.width), h: Math.round(cover.height) } : null,
    coverBtnInside: cover && coverBtn ? coverBtn.left >= cover.left && coverBtn.right <= cover.right && coverBtn.top >= cover.top && coverBtn.bottom <= cover.bottom : null,
    hintLines: hint ? Math.round(hint.getBoundingClientRect().height / lh) : null,
    sideways: Math.max(document.scrollingElement.scrollWidth - innerWidth, ...scrollers),
  }
}

let server
let browser
try {
  const css = `${await appCss(root)}\n${interFaces(root)}`
  bundle("scripts/render-j27.tsx", "app.js")
  if (want("ANALYTICS")) bundle("scripts/render-community-analytics-round31.tsx", "analytics.js")
  const page = (js) => `<!doctype html><html class="app-layout light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/${js}"></script></body></html>`
  server = createServer((req, res) => {
    const p = req.url.split("?")[0]
    if (p === "/app.js" || p === "/analytics.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      return res.end(readFileSync(join(dir, p.slice(1))))
    }
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(page(p.startsWith("/analytics") ? "analytics.js" : "app.js"))
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 240_000 })

  async function open(path, view, { clear = true } = {}) {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(VIEWS[view])
    if (view === "390") await p.emulateCPUThrottling(4)
    if (clear) await p.evaluateOnNewDocument(() => { try { localStorage.clear() } catch {} })
    await p.goto(origin + path, { waitUntil: "load" })
    await sleep(900)
    return { p, errors }
  }

  if (want("PILL")) {
    for (const view of ["1440", "1024", "820", "390"]) {
      console.log(`\nPILL ${view}: a community page, its save bar down then up`)
      const { p, errors } = await open("/app/community/makers/members", view)
      await sleep(400)
      let look = await p.evaluate(PILL_LOOK)
      const community = look.pills.find((x) => x.which === "community")
      if (view === "390") expect(!look.pills.some((x) => x.shown), "a phone draws no pill (its Overview card is the phone's)", look.pills)
      else expect(!!community?.shown && community.press, "no bar up: the community's pill is there, at the bottom right", community)
      await p.evaluate(() => window.__dirty(true))
      await sleep(600)
      look = await p.evaluate(PILL_LOOK)
      expect(look.bars.length === 1, "the save bar is up", look.bars.map((b) => [b.l, b.t, b.r, b.b]))
      expect(look.overlaps.length === 0, "no pill that can be seen overlaps the bar or its buttons", look.overlaps)
      if (view !== "390") expect(look.pills.every((x) => !x.shown && !x.press), "the pill steps aside: not seen, not pressed", look.pills)
      await p.screenshot({ path: join(shots, `pill-${view}-community-bar-up.png`) })
      await p.evaluate(() => window.__dirty(false))
      await sleep(700)
      look = await p.evaluate(PILL_LOOK)
      if (view !== "390") expect(look.pills.some((x) => x.which === "community" && x.shown && x.press), "the bar gone: the pill comes back", look.pills)
      expect(errors.length === 0, "no error on the page", errors)
      await p.close()

      console.log(`\nPILL ${view}: Products, no bottom bar`)
      const plain = await open("/app/products", view)
      look = await plain.p.evaluate(PILL_LOOK)
      if (view !== "390") expect(look.pills.some((x) => x.which === "store" && x.shown && x.press) && look.bars.length === 0, "the store's Setup pill as it was", look.pills)
      if (view === "1440") await plain.p.screenshot({ path: join(shots, `pill-${view}-products.png`) })
      await plain.p.close()
    }
  }

  if (want("WIZARD")) {
    for (const view of ["1440", "1024", "820", "390", "zoom150", "zoom200"]) {
      console.log(`\nWIZARD ${view}`)
      const { p, errors } = await open("/app/community/new", view)
      const press = async (sel) => {
        const els = await p.$$(sel)
        for (const el of els) {
          const box = await el.boundingBox()
          if (box && box.width > 0) {
            await el.click()
            return true
          }
        }
        return false
      }
      const next = () => press("[data-wizard-next]")
      const step = async (name) => {
        await sleep(450)
        const s = await p.evaluate(STEP_LOOK)
        const pill = await p.evaluate(PILL_LOOK)
        expect(s.at === name, `${name}: on screen`, s.at)
        expect(s.outside.length === 0, `${name}: nothing in the step wider than its card`, s.outside)
        expect(s.sideways <= 0, `${name}: no sideways scroll`, s.sideways)
        expect(pill.overlaps.length === 0, `${name}: no Setup pill over Back, Next or the bar`, pill.overlaps.map((o) => o.pill))
        await p.screenshot({ path: join(shots, `wizard-${view}-${name}.png`) })
        return s
      }
      await p.type("#c-name", "The Morning Writers")
      const first = await step("name")
      if (view === "1440" || view === "1024") {
        const pill = await p.evaluate(PILL_LOOK)
        expect(pill.bars.length === 1 && pill.pills.every((x) => !x.shown), "from 1024px the foot bar is up and the store's pill steps aside", pill.pills)
      }
      if (["1440", "1024"].includes(view)) expect(first.card && first.card.w <= 681 && first.card.w >= 600, "one column, 680px at most, nothing beside it", first.card)
      await next()
      const look = await step("look")
      expect(look.cover && look.card && look.cover.w >= look.card.w - 64, "the cover is as wide as the card", { cover: look.cover, card: look.card })
      expect(look.cover && Math.abs(look.cover.w / look.cover.h - 3) < 0.05, "at 3 to 1", look.cover)
      expect(look.coverBtnInside === true, "its button inside it, whole", look.coverBtnInside)
      expect(look.hintLines !== null && look.hintLines <= 2, "the hint on two lines at most", look.hintLines)
      await p.click('[data-palette="forest"]')
      await next()
      await step("access")
      await next()
      await step("review")
      if (view === "390") {
        await press("[data-create-submit]")
        await p.waitForSelector("[data-wizard-composer] [data-composer]", { timeout: 20000 }).catch(() => {})
        await sleep(1200)
        await step("welcome")
        const host = await p.evaluate(() => !!document.querySelector("[data-wizard-composer] [data-composer]"))
        expect(host, "on a phone too the welcome step is the feed's composer, its card in the column", host)
      }
      if (view !== "1440") {
        expect(errors.length === 0, "no error on the page", errors)
        await p.close()
        continue
      }
      await press("[data-create-submit]")
      await p.waitForFunction(() => window.__sent.some((x) => x.url === "/api/app/community" && x.method === "POST"), { timeout: 20000 }).catch(() => {})
      const sent = await p.evaluate(() => window.__sent.find((x) => /^\/api\/app\/community(\?|$)/.test(x.url) && x.method === "POST")?.body ?? window.__sent.map((x) => [x.method, x.url]))
      expect(!!sent && !Array.isArray(sent) && sent.name === "The Morning Writers" && sent.slug === null && !("welcomeTitle" in sent) && !("spaceName" in sent), "Create sends the community, no welcome fields", sent)
      await p.waitForSelector("[data-wizard-composer] [data-composer]", { timeout: 15000 }).catch(() => {})
      await sleep(1200)
      const w = await step("welcome")
      const composer = await p.evaluate(() => {
        const host = document.querySelector("[data-wizard-composer]")
        const title = [...(host?.querySelectorAll("input:not([type=file])") ?? [])].find((i) => i.getClientRects().length)
        return { host: !!host, composer: !!host?.querySelector("[data-composer]"), title: title?.value ?? null, text: host?.textContent?.slice(0, 160) ?? "" }
      })
      expect(composer.composer, "the welcome step is the feed's composer", composer)
      expect(composer.title === "Welcome to The Morning Writers", "opened with the welcome written for them", composer.title)
      expect(/Announcements/.test(composer.text), "in Announcements", composer.text)
      const back = await p.evaluate(() => [...document.querySelectorAll("[data-wizard-back]")].filter((b) => b.getClientRects().length).length)
      expect(back === 0 && (await p.$("[data-wizard-skip]")) !== null, "no Back once it is made; Skip instead", back)
      const reload = await open("/app/community/new", view, { clear: false })
      await sleep(1500)
      const again = await reload.p.evaluate(() => document.querySelector("[data-create-community]")?.getAttribute("data-wizard-at"))
      expect(again === "welcome", "a reload comes back on the welcome step of the community made", again)
      await reload.p.close()
      /* Post: the composer's own button. */
      const posted = await p.evaluate(() => {
        const b = [...document.querySelectorAll("[data-wizard-composer] button")].find((x) => /^Post$/.test(x.textContent.trim()))
        b?.click()
        return !!b
      })
      await sleep(2500)
      const after = await p.evaluate(() => ({ sent: window.__sent.map((x) => [x.method, x.url]), router: window.__router ?? [] }))
      expect(posted && after.sent.some(([m, u]) => m === "POST" && /\/api\/community\/[^/]+\/posts$/.test(u)), "Post sends it through the member route", after.sent.slice(-4))
      expect(after.sent.some(([m, u]) => m === "POST" && /\/moderation$/.test(u)), "it is pinned", after.sent.slice(-3))
      expect(after.router.some(([k, h]) => k === "push" && h === "/app/community/morning-writers?created=1"), "and the Overview opens", after.router)
      void w
      expect(errors.length === 0, "no error on the page", errors)
      await p.close()
    }
  }

  if (want("ANALYTICS")) {
    for (const view of ["1440", "1024", "820", "390"]) {
      console.log(`\nANALYTICS ${view}`)
      const { p, errors } = await open("/analytics?case=full", view)
      await p.waitForSelector("[data-analytics-sections]", { timeout: 10000 }).catch(() => {})
      await sleep(900)
      const geo = await p.evaluate(() => {
        const r = (el) => el.getBoundingClientRect()
        const nav = document.querySelector("[data-analytics-sections]")
        const overview = document.querySelector("[data-overview]")
        const panel = document.querySelector("[data-analytics-panel]")
        const lineBox = nav.querySelector("[data-tab-line]") ? r(nav.querySelector("[data-tab-line]")) : null
        const tabs = [...nav.querySelectorAll("[role=tab]")].map((t) => {
          const word = r(t.querySelector("[data-tab-word]") || t)
          return { label: t.textContent.trim(), h: Math.round(r(t).height), selected: t.getAttribute("aria-selected") === "true", line: !!lineBox && Math.abs(lineBox.left - word.left) < 1.5 && Math.abs(lineBox.right - word.right) < 1.5 && lineBox.height === 2 }
        })
        return { above: Math.round(r(nav).top - r(overview).bottom), below: Math.round(r(panel).top - r(nav).bottom), rule: getComputedStyle(nav).borderBottomWidth, tabs, sideways: document.scrollingElement.scrollWidth - innerWidth }
      })
      expect(geo.above >= 24, "24px or more between the overview and the sections", geo.above)
      expect(geo.below >= 16 && geo.below <= 24, "16 to 24px from the sections to their panel", geo.below)
      expect(geo.rule === "1px" && geo.tabs.filter((t) => t.selected && t.line).length === 1, "tabs on a hairline, the chosen one underlined", { rule: geo.rule, tabs: geo.tabs })
      expect(geo.tabs.every((t) => t.h >= (view === "390" ? 44 : 40)), "each tab tall enough to press", geo.tabs.map((t) => t.h))
      expect(geo.sideways <= 0, "no sideways scroll", geo.sideways)
      await p.screenshot({ path: join(shots, `analytics-${view}-growth.png`), fullPage: view !== "390" })
      if (view === "1440") {
        /* The line's slide, frame by frame: Growth to Content, the tabs row only. */
        const nav = await p.$eval("[data-analytics-sections]", (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: Math.min(560, b.width), height: b.height + 2 } })
        await p.click('[data-section-tab="content"]')
        for (let i = 0; i < 6; i++) await p.screenshot({ path: join(shots, `analytics-slide-${i}.png`), clip: nav })
        await p.click('[data-section-tab="growth"]')
        await sleep(500)
      }
      for (const s of ["traffic", "engagement", "content", "revenue"]) {
        await p.click(`[data-section-tab="${s}"]`)
        await sleep(500)
        const on = await p.evaluate(() => {
          const t = document.querySelector("[data-section-tab][aria-selected=true] [data-tab-word]").getBoundingClientRect()
          const l = document.querySelector("[data-tab-line]").getBoundingClientRect()
          return { section: document.querySelector("[data-analytics]")?.getAttribute("data-section"), under: Math.abs(l.left - t.left) < 1.5 && Math.abs(l.right - t.right) < 1.5 }
        })
        expect(on.section === s && on.under, `${s}: chosen and drawn, the line under its word`, on)
        if (view === "1440" || view === "390") await p.screenshot({ path: join(shots, `analytics-${view}-${s}.png`), fullPage: view !== "390" })
      }
      expect(errors.length === 0, "no error on the page", errors)
      await p.close()
    }
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall measured")
