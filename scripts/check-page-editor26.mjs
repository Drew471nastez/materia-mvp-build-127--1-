/**
 * ===========================================================================
 *  ROUND 26 (W5), MEASURED: THE REBUILT PAGE EDITOR
 * ===========================================================================
 * Over the real editor in the real community admin shell (scripts/render-page-editor26.tsx) in headless Chromium:
 *
 *   LAYOUT   at 1440, 1280 (laptop), 820 (tablet, touch) and 390 (phone, touch, CPU slowed 4x), light and dark: the
 *            stage (the preview card) and its share of the screen, the panel or the drawer, no sideways scroll on the
 *            page, the pane, the row of controls or the panel; one screenshot each
 *   CONTROLS at 1440: the panel hides and the preview takes its width; full screen covers the window and Escape leaves
 *            it; As a visitor takes the outlines, badges and empty placeholders away, a question opens, a link does not
 *            leave; the dark look reaches the frame; Phone draws the page at 390
 *   SAVE     at 1440, a draft: every field changed through its control (name, tagline, short description, the rich
 *            description, logo removed, a gallery picture removed, the cover moved, What's inside, a question, a social
 *            link, member links added, renamed, readdressed, reordered, hidden and removed, the button's words, style
 *            and line, search title and line, Explore), one Save, and the PATCH carries each, with the values; a price
 *            in the button's words is refused before anything is sent; Publish sends { publish: true } after the save
 *   PHONE    at 390: a tap on a part opens the drawer at its group, the page still above it; typing changes the page;
 *            Save in the drawer sends it
 *
 *   node scripts/check-page-editor26.mjs [LAYOUT CONTROLS SAVE PHONE]
 *   SHOTS_DIR=dir to keep the pictures (.page-editor26-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".page-editor26-probe")
const shots = process.env.SHOTS_DIR || join(root, ".page-editor26-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const listeners = new Set()
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
history.pushState = (s, u, url) => { push0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { replace0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => log("refresh", ""), back: () => history.back(), forward: () => history.forward() }
export const usePathname = () => useSyncExternalStore(window.__probeRouter.subscribe, () => state.pathname, () => state.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(window.__probeRouter.subscribe, () => state.search, () => state.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => router
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-page-editor26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.page-editor26-probe/navigation.js", "next/link": "./.page-editor26-probe/link.jsx", "next/image": "./.page-editor26-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 300_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const LAPTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }
  const TABLET = { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

  async function open(path, vp, { cpu = 1 } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (cpu > 1) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    }
    const errors = []
    const api = []
    p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 1200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        api.push({ url: url.replace(ORIGIN, ""), method: r.method(), body: r.postData() ?? null })
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, questions: [], status: "published" }) })
      }
      if (url.startsWith(`${ORIGIN}/_next/image`)) return r.respond({ status: 404, body: "" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load", timeout: 120_000 })
    await p.evaluate(() => document.fonts.ready)
    await sleep(cpu > 1 ? 2500 : 900)
    /* The bar with the community's name scrolls away, as it does once a creator starts working (the tabs stay). */
    return { p, errors, api }
  }
  const frameOf = async (p) => (await p.$("iframe[data-page-preview]"))?.contentFrame()
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })
  const facts = (p) =>
    p.evaluate(() => {
      const b = (el) => (el ? (({ left, top, width, height }) => ({ x: Math.round(left), y: Math.round(top), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect()) : null)
      const over = (el) => (el ? el.scrollWidth - el.clientWidth : null)
      const pane = document.querySelector(".orders-pane")
      const card = document.querySelector("[data-page-preview-card]")
      const side = document.querySelector("[data-page-side]")
      const body = document.querySelector("[data-community-body]")
      const pad = body ? parseFloat(getComputedStyle(body).paddingLeft) + parseFloat(getComputedStyle(body).paddingRight) : 0
      const prev = document.querySelector("[data-preview-pane]")
      const tb = document.querySelector("[data-page-toolbar]")
      /* Everything in the toolbar inside its box: nothing cut at its right edge. */
      const tbr = tb?.getBoundingClientRect()
      const clipped = tb ? [...tb.querySelectorAll("button, [role=radiogroup], p")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > tbr.right + 0.5).length : null
      return {
        page: document.documentElement.scrollWidth - innerWidth,
        pane: over(pane),
        toolbar: over(tb),
        toolbarClipped: clipped,
        side: over(side),
        card: b(card),
        sideBox: side ? b(side) : null,
        content: body ? { ...b(body), w: Math.round(body.clientWidth - pad) } : null,
        scale: Number(prev?.getAttribute("data-preview-scale")),
        device: prev?.getAttribute("data-preview-pane"),
        panel: document.querySelector("[data-page-editor]")?.getAttribute("data-panel"),
        bar: b(document.querySelector("[data-page-phone-bar] [role=region]")),
        vh: innerHeight,
        vw: innerWidth,
      }
    })
  /* A point on a part inside the frame, in the editor's own coordinates (the frame is scaled): brought into view first. */
  async function pointIn(p, f, sel) {
    const r = await f.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0)
      if (!el) return null
      const r0 = el.getBoundingClientRect()
      scrollTo(0, Math.max(0, scrollY + r0.top - Math.max(80, (innerHeight - r0.height) / 2)))
      const b = el.getBoundingClientRect()
      return { x: b.left + Math.min(b.width / 2, 60), y: b.top + Math.min(b.height / 2, 16) }
    }, sel)
    if (!r) return null
    await sleep(200)
    const fb = await p.evaluate(() => { const fr = document.querySelector("iframe[data-page-preview]"); const b = fr.getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / fr.offsetWidth } })
    return { x: fb.x + r.x * fb.s, y: fb.y + r.y * fb.s }
  }
  const openGroup = async (p, g) => {
    const open = await p.evaluate((g) => document.querySelector(`[data-page-group=${g}]`)?.hasAttribute("data-open"), g)
    if (!open) await p.click(`[data-page-side] [data-page-group-button=${g}], [data-page-sheet] [data-page-group-button=${g}]`)
    await sleep(250)
  }
  const typeInto = async (p, sel, text, { replace = true } = {}) => {
    await p.$eval(sel, (el) => el.scrollIntoView({ block: "center" }))
    await p.click(sel, replace ? { count: 3 } : undefined)
    if (replace) {
      await p.keyboard.down("Control")
      await p.keyboard.press("A")
      await p.keyboard.up("Control")
      await p.keyboard.press("Backspace")
    }
    await p.keyboard.type(text)
    await sleep(120)
  }

  /* ── LAYOUT ─────────────────────────────────────────────────────────── */
  if (want("LAYOUT")) {
    console.log("\nLAYOUT")
    for (const [name, vp, cpu] of [["1440", DESK, 1], ["1280", LAPTOP, 1], ["820", TABLET, 1], ["390", PHONE, 4]]) {
      for (const theme of ["light", "dark"]) {
        const { p, errors } = await open(`/app/community/salajanywood/page${theme === "dark" ? "?dark=1" : ""}`, vp, { cpu })
        /* The name's bar scrolled away, the tabs stuck: how the editor is worked in. */
        if (vp.width >= 1280) await p.evaluate(() => document.querySelector(".orders-pane")?.scrollTo(0, document.querySelector("[data-community-header]")?.offsetHeight ?? 0))
        await sleep(500)
        const f = await facts(p)
        const tag = `${name} ${theme}`
        expect(f.page <= 0 && (f.pane ?? 0) <= 0, `${tag}: no sideways scroll on the page or the pane`, { page: f.page, pane: f.pane })
        expect((f.toolbar ?? 0) <= 0 && f.toolbarClipped === 0, `${tag}: the row of controls fits, nothing cut`, { over: f.toolbar, clipped: f.toolbarClipped })
        const share = f.card && f.content ? (f.card.w * f.card.h) / (f.content.w * Math.min(f.vh, f.content.h)) : 0
        if (vp.width >= 1280) {
          expect(f.panel === "open" && f.sideBox && f.sideBox.w >= 360 && (f.side ?? 0) <= 0, `${tag}: the panel beside the stage, nothing sideways in it`, { side: f.sideBox, over: f.side })
          expect(f.card.w >= f.content.w - f.sideBox.w - 24 && f.card.h >= f.vh - 222, `${tag}: the preview takes the rest of the width and the height under the tabs`, { card: f.card, vh: f.vh })
        } else {
          expect(f.panel === "drawer" && !!f.bar, `${tag}: the panel is a drawer, the bar at the foot opens it`, { panel: f.panel, bar: f.bar })
          expect(f.card.w >= f.content.w - 2 && f.card.y + f.card.h <= f.bar.y - 4, `${tag}: the preview spans the width and ends above the bar`, { card: f.card, bar: f.bar })
        }
        console.log(`        stage ${f.card?.w}x${f.card?.h}, ${(share * 100).toFixed(0)}% of the content area on screen, preview scale ${f.scale}, device ${f.device}`)
        await shot(p, `layout-${name}-${theme}`)
        if (theme === "dark") {
          const frameDark = await (await frameOf(p))?.evaluate(() => document.documentElement.hasAttribute("data-sl-dark"))
          expect(frameDark === true, `${tag}: the page in the frame follows the dark look`)
        }
        expect(errors.length === 0, `${tag}: no errors`, errors.slice(0, 2))
        await p.close()
      }
    }
  }

  /* ── CONTROLS ───────────────────────────────────────────────────────── */
  if (want("CONTROLS")) {
    console.log("\nCONTROLS 1440")
    const { p, errors } = await open("/app/community/salajanywood/page", DESK)
    const before = await facts(p)
    await p.click("[data-page-panel-toggle]")
    await sleep(400)
    const hidden = await facts(p)
    expect(hidden.panel === "hidden" && !hidden.sideBox && hidden.card.w >= before.card.w + 300, "hiding the panel gives the preview its width", { before: before.card.w, after: hidden.card.w, scale: [before.scale, hidden.scale] })
    await shot(p, "controls-1440-panel-hidden")
    await p.click("[data-page-panel-toggle]")
    await sleep(300)
    await p.click("[data-page-full-toggle]")
    await sleep(500)
    const full = await p.evaluate(() => { const s = document.querySelector("[data-page-stage][data-page-full]"); const b = s?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height, scale: document.querySelector("[data-preview-pane]")?.getAttribute("data-preview-scale") } : null })
    expect(!!full && full.x === 0 && full.y === 0 && full.w === 1440 && full.h === 900, "full screen covers the window", full)
    await shot(p, "controls-1440-full")
    await p.keyboard.press("Escape")
    await sleep(400)
    expect(!(await p.$("[data-page-stage][data-page-full]")), "Escape leaves full screen")

    let f = await frameOf(p)
    const editingMarks = await f.evaluate(() => ({ placeholders: document.querySelectorAll("[data-page-placeholder]").length, hotspots: !!document.querySelector("[data-preview-hotspots]") }))
    await p.click("[data-page-visitor]")
    await sleep(500)
    f = await frameOf(p)
    const vis = await f.evaluate(() => ({ hotspots: !!document.querySelector("[data-preview-hotspots]"), placeholders: document.querySelectorAll("[data-page-placeholder]").length, visitor: document.body.hasAttribute("data-visitor") }))
    expect(editingMarks.hotspots && !vis.hotspots && vis.visitor, "As a visitor: no outlines or Edit badges", { editing: editingMarks, visitor: vis })
    /* A question opens for a visitor; a link does not leave the page. */
    const q = await pointIn(p, f, "[data-page-block=faq] summary")
    await p.mouse.click(q.x, q.y)
    await sleep(300)
    const opened = await f.evaluate(() => document.querySelector("[data-page-block=faq] details")?.open)
    expect(opened === true, "As a visitor a question opens", opened)
    const link = await pointIn(p, f, "[data-community-link]")
    const href0 = await f.evaluate(() => location.href)
    if (link) await p.mouse.click(link.x, link.y)
    await sleep(300)
    const pages = (await browser.pages()).length
    const href1 = await f.evaluate(() => location.href)
    expect(href0 === href1, "As a visitor a link does not leave the preview", { href0, href1, pages })
    await shot(p, "controls-1440-visitor")
    await p.click("[data-page-visitor]")
    await sleep(300)
    await p.click("[data-page-look]")
    await sleep(400)
    f = await frameOf(p)
    const darkLook = await f.evaluate(() => ({ attr: document.documentElement.hasAttribute("data-sl-dark"), bg: getComputedStyle(document.querySelector("[data-community-sheet]")).backgroundColor }))
    expect(darkLook.attr && darkLook.bg !== "rgb(255, 255, 255)", "the dark look reaches the page in the frame", darkLook)
    await shot(p, "controls-1440-dark-look")
    await p.click("[data-page-look]")
    await p.click("[data-page-device-option=phone]")
    await sleep(500)
    f = await frameOf(p)
    const phone = await f.evaluate(() => innerWidth)
    expect(phone === 390, "Phone draws the page at 390", phone)
    await shot(p, "controls-1440-phone")
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }

  /* ── SAVE ───────────────────────────────────────────────────────────── */
  if (want("SAVE")) {
    console.log("\nSAVE 1440, a draft")
    const { p, errors, api } = await open("/app/community/salajanywood/page?draft=1", DESK)
    const f = await frameOf(p)
    /* basics */
    await openGroup(p, "basics")
    await typeInto(p, "#pe-name", "Oak and Ash Club")
    await typeInto(p, "#pe-tagline", "Make one thing a week, together. Every level welcome.")
    await typeInto(p, "#pe-summary", "Weekly prompts, Saturday calls and plans for every build, for people who make things from wood.")
    const live = await f.evaluate(() => document.querySelector("h1[data-page-block=name]")?.textContent)
    expect(live === "Oak and Ash Club", "the name changes on the page as it is typed", live)
    const n = await p.$eval("[data-panel=summary]", (e) => e.textContent)
    expect(/\d+\/160/.test(n), "the short description counts to 160", n.match(/\d+\/160/)?.[0])
    await p.click('[data-panel=logo] button[aria-label^="Remove"]')
    /* media: move the cover, take a gallery picture away */
    await openGroup(p, "media")
    const fb = await (await p.$("[data-cover-focus-frame]")).boundingBox()
    await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await p.mouse.down()
    await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2 + 30, { steps: 5 })
    await p.mouse.up()
    /* A gallery picture taken away through its tile's menu (../components/community/creator/gallery-tiles.tsx). */
    await p.$eval("[data-panel=gallery] [data-tile-menu]", (el) => el.scrollIntoView({ block: "center" }))
    await p.click("[data-panel=gallery] [data-tile-menu]")
    await sleep(300)
    const removed = await p.evaluate(() => {
      const item = [...document.querySelectorAll('[role="menuitem"], [data-action-item], button')].find((b) => b.textContent?.trim() === "Remove" && b.getClientRects().length)
      item?.click()
      return item ? item.outerHTML.slice(0, 160) : null
    })
    await sleep(400)
    const galleryNow = await f.evaluate(() => document.querySelectorAll("[data-gallery-slide], [data-page-block=gallery] img").length)
    expect(!!removed && errors.length === 0 && !!(await p.$("[data-page-side]")), "a gallery picture taken away: the editor and the preview carry on (round 33's editor fell over here)", { removed: !!removed, errors: errors.slice(0, 1), galleryNow })
    /* about: the rich description, a line, a question */
    await openGroup(p, "about")
    await p.click("[data-panel=description] [contenteditable=true]")
    await p.keyboard.press("End")
    await p.keyboard.type(" New members start with a bench hook.")
    await p.evaluate(() => { const b = document.querySelector('[data-panel=benefits] button:not([aria-label])'); b?.click() })
    await sleep(150)
    const lines = await p.$$("[data-panel=benefits] input")
    await lines[lines.length - 1].type("A plans library")
    await p.evaluate(() => { const b = [...document.querySelectorAll("[data-panel=faq] button")].find((x) => !x.getAttribute("aria-label")); b?.click() })
    await sleep(150)
    const qs = await p.$$("[data-panel=faq] input")
    await qs[qs.length - 1].type("Is there a call every week?")
    const as = await p.$$("[data-panel=faq] textarea")
    await as[as.length - 1].type("Every Saturday at ten.")
    /* links: a social link; member links added, renamed, readdressed, reordered, hidden, removed */
    await openGroup(p, "links")
    await p.click("[data-link-network=tiktok]")
    await sleep(100)
    await p.keyboard.type("@woodclub")
    await p.click("[data-member-link-add]")
    await sleep(150)
    await p.keyboard.type("Saturday call")
    const urls = await p.$$("[data-member-link-url]")
    await urls[urls.length - 1].type("javascript:alert(1)")
    await p.click("[data-page-side] h2")
    await sleep(150)
    const bad = await p.evaluate(() => document.querySelector("[data-member-link-error]")?.textContent)
    expect(!!bad, "a javascript: address is refused under its row", bad)
    await typeInto(p, `[data-member-link-row]:last-child [data-member-link-url]`, "zoom.us/j/123")
    await typeInto(p, `[data-member-link-row="shop00002"] [data-member-link-name]`, "Plans and patterns")
    await p.click(`[data-member-link-row="shop00002"] [data-member-link-up]`)
    await p.click(`[data-member-link-row="start0001"] [data-member-link-toggle]`)
    await p.click(`[data-member-link-row="start0001"] [data-member-link-icon-button]`)
    await sleep(100)
    await p.click(`[data-member-link-row="start0001"] [data-member-link-icons] [aria-label="Course"]`)
    await sleep(100)
    await shot(p, "save-1440-member-links")
    /* join: a price is refused, then words, style, line */
    await openGroup(p, "join")
    await typeInto(p, "#pe-join-label", "Join for $5/month")
    const money = await p.evaluate(() => document.querySelector("[data-join-problem]")?.getAttribute("data-join-problem"))
    expect(money === "money", "a price in the button's words is said under the field", money)
    const sentBefore = api.filter((a) => a.method === "PATCH").length
    await p.click("[data-page-save-button]")
    await sleep(400)
    const status = await p.evaluate(() => ({ tone: document.querySelector("[data-page-status]")?.getAttribute("data-page-status"), text: document.querySelector("[data-page-status]")?.textContent }))
    expect(api.filter((a) => a.method === "PATCH").length === sentBefore && status.tone === "error", "Save refuses a price on the button, says why, sends nothing", status)
    await shot(p, "save-1440-money")
    await typeInto(p, "#pe-join-label", "Get access")
    await p.click("[data-join-style-option=outline]")
    await typeInto(p, "#pe-join-note", "Leave whenever you like")
    /* search */
    await openGroup(p, "search")
    await typeInto(p, "#pe-seo-title", "Oak and Ash Club: woodworking together")
    await typeInto(p, "#pe-seo-line", "Weekly build prompts, Saturday calls and a plans library.")
    await p.click("[data-page-field=explore] [role=switch]")
    /* At the very end of the panel the stage is still under the tabs, not pushed up beneath them. */
    await p.evaluate(() => { const pane = document.querySelector(".orders-pane"); pane.scrollTo(0, pane.scrollHeight) })
    await sleep(300)
    const stuck = await p.evaluate(() => ({ tabs: Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().bottom), toolbar: Math.round(document.querySelector("[data-page-toolbar]").getBoundingClientRect().top) }))
    expect(stuck.toolbar >= stuck.tabs, "scrolled to the end of the panel, the controls and the preview stay below the tabs", stuck)
    const serp = await p.evaluate(() => ({ title: document.querySelector("[data-search-preview-title]")?.textContent, line: document.querySelector("[data-search-preview-line]")?.textContent }))
    expect(serp.title === "Oak and Ash Club: woodworking together" && /plans library/.test(serp.line), "the search result is drawn as typed", serp)
    await shot(p, "save-1440-search")
    const dirty = await p.evaluate(() => document.querySelector("[data-page-status]")?.getAttribute("data-page-status"))
    expect(dirty === "dirty", "Unsaved changes is said beside Save", dirty)
    await p.click("[data-page-save-button]")
    await sleep(800)
    const patch = api.filter((a) => a.method === "PATCH").at(-1)
    const body = patch ? JSON.parse(patch.body) : {}
    const keys = Object.keys(body).sort()
    const wantKeys = ["benefits", "descriptionHtml", "discoveryEnabled", "faq", "gallery", "links", "logoUrl", "memberLinks", "name", "pageLook", "seoDescription", "seoTitle", "summary", "tagline"].sort()
    expect(JSON.stringify(keys) === JSON.stringify(wantKeys), "one Save sends every field that changed", { keys, missing: wantKeys.filter((k) => !keys.includes(k)) })
    const ml = body.memberLinks ?? []
    expect(
      ml.length === 3 && ml[0].id === "shop00002" && ml[0].label === "Plans and patterns" && ml[1].id === "start0001" && ml[1].hidden === true && ml[1].icon === "graduation-cap" && ml[2].label === "Saturday call" && ml[2].url === "https://zoom.us/j/123",
      "member links: renamed, moved up, hidden, an icon, a new one with its address made https",
      ml,
    )
    expect(body.name === "Oak and Ash Club" && body.summary.startsWith("Weekly prompts") && body.logoUrl === null && /bench hook/.test(body.descriptionHtml) && body.benefits.includes("A plans library") && body.faq.some((x) => x.q === "Is there a call every week?") && body.links.some((l) => l.url === "https://www.tiktok.com/@woodclub"), "the values: name, short description, logo removed, description, a line, a question, a link", { name: body.name, logo: body.logoUrl, faq: body.faq?.length, links: body.links?.length })
    expect(body.pageLook?.joinLabel === "Get access" && body.pageLook?.joinStyle === "outline" && body.pageLook?.joinNote === "Leave whenever you like" && body.pageLook?.coverY !== 30, "the button's words, style and line, the cover moved", body.pageLook)
    expect(body.seoTitle === "Oak and Ash Club: woodworking together" && body.discoveryEnabled === false && (removed ? body.gallery.length === 1 : true), "search title, Explore off, a gallery picture removed", { seo: body.seoTitle, explore: body.discoveryEnabled, gallery: body.gallery?.length })
    const after = await p.evaluate(() => ({ tone: document.querySelector("[data-page-status]")?.getAttribute("data-page-status"), save: document.querySelector("[data-page-save-button]")?.textContent }))
    expect(after.tone === "saved" && after.save === "Saved", "Saved is said after the save", after)
    await shot(p, "save-1440-saved")
    await p.click("[data-page-publish]")
    await sleep(600)
    const pub = api.filter((a) => a.method === "PATCH").at(-1)
    expect(pub && JSON.parse(pub.body).publish === true, "Publish sends { publish: true }", pub?.body)
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }

  /* ── PHONE ──────────────────────────────────────────────────────────── */
  if (want("PHONE")) {
    console.log("\nPHONE 390, touch, CPU 4x")
    const { p, errors, api } = await open("/app/community/salajanywood/page", PHONE, { cpu: 4 })
    const f = await frameOf(p)
    const badges = await f.evaluate(() => document.querySelectorAll("[data-edit-badge]").length)
    expect(badges >= 3, "the parts show a small pencil on a touch screen", badges)
    const at = await pointIn(p, f, "[data-page-block=tagline]")
    const t0 = Date.now()
    await p.touchscreen.tap(at.x, at.y)
    await sleep(1200)
    const sheet = await p.evaluate(() => {
      const s = document.querySelector("[data-page-sheet]")
      const b = s?.closest("[data-sheet-panel]")?.getBoundingClientRect() ?? s?.getBoundingClientRect()
      const card = document.querySelector("[data-page-preview-card]")?.getBoundingClientRect()
      return s ? { open: document.querySelector("[data-page-group=basics]")?.hasAttribute("data-open"), top: Math.round(b.top), bottom: Math.round(b.bottom), h: innerHeight, card: card && { top: Math.round(card.top), bottom: Math.round(card.bottom) }, over: s.querySelector("[data-page-sheet-body]").scrollWidth - s.querySelector("[data-page-sheet-body]").clientWidth } : null
    })
    expect(!!sheet && sheet.open && sheet.top > 350 && sheet.over <= 0 && sheet.card && sheet.card.bottom <= sheet.top && sheet.card.bottom - sheet.card.top >= 200, "a tap on the tagline opens the drawer at its group, the page above it whole, nothing sideways", { ...sheet, ms: Date.now() - t0 })
    const inView = await f.evaluate(() => { const r = document.querySelector("[data-page-block=tagline]").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
    expect(inView, "the tagline is in the part of the page above the drawer", inView)
    const field = await p.evaluate(() => { const box = document.querySelector("[data-page-sheet-body]").getBoundingClientRect(); const r = document.querySelector("#pe-tagline").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), box: [Math.round(box.top), Math.round(box.bottom)] } })
    expect(field.top >= field.box[0] && field.bottom <= field.box[1], "the drawer opens on the tagline's field", field)
    await p.type("#pe-tagline", " Every Saturday.")
    await sleep(400)
    const live = await f.evaluate(() => document.querySelector("[data-page-block=tagline]")?.textContent)
    expect(/Every Saturday\.$/.test(live || ""), "the tagline changes on the page behind the drawer", live)
    await shot(p, "phone-390-drawer")
    await p.click("[data-page-sheet-save]")
    await sleep(1200)
    const patch = api.filter((a) => a.method === "PATCH").at(-1)
    expect(patch && JSON.parse(patch.body).tagline?.endsWith("Every Saturday."), "Save in the drawer sends it", patch?.body)
    await p.click("[data-page-sheet-done]")
    await sleep(1200)
    const back = await p.evaluate(() => ({ scroll: document.querySelector(".orders-pane").scrollTop, toolbar: !!document.querySelector("[data-page-toolbar]") }))
    expect(back.scroll === 0 && back.toolbar, "closing the drawer brings the page and its controls back", back)
    await shot(p, "phone-390-after")
    await p.click("[data-page-full-toggle]")
    await sleep(800)
    const full = await p.evaluate(() => { const b = document.querySelector("[data-page-stage][data-page-full] [data-page-preview-card]")?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null })
    expect(!!full && full.w >= 360 && full.h >= 700, "full screen on a phone: the page across the screen", full)
    await shot(p, "phone-390-full")
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures in ${shots})`)
process.exit(broken ? 1 : 0)
