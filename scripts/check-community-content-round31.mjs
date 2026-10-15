/**
 * ===========================================================================
 *  ROUND 31: THE COMMUNITY'S CONTENT SECTIONS IN /app, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-content-round31.tsx) in
 * headless Chromium, at 1440 and at 390 with touch:
 *
 *   ICON      the space's Icon is a button (no caret), opens the emoji
 *             picker; a picked emoji and a pasted one of the admin's own are
 *             what the form saves; three letters are refused; a family emoji
 *             and "AI" are drawn whole in the list, an old word name as its
 *             kind's emoji
 *   ROWS      pressing a space, a course or an event row opens its editor; its
 *             menu opens the menu and not the editor; Enter on the row's
 *             button opens it from the keyboard
 *   SHEET     on a phone New space is the composer's sheet: it rises on the
 *             compositor, its Cancel and Add space sit in its top row, and
 *             with a 336px keyboard (a fake visualViewport, iOS's shape of it)
 *             the field being typed in, Cancel and Add space are all above
 *             the keys, with no band of nothing between the sheet and them
 *   WRITER    the Feed's writer is the member composer: its card, its
 *             toolbar (files, link, video, poll, emoji, GIF), its space
 *             picker; a post written in it arrives as the list's first row
 *   FEED      rows show pictures (with +2), a video's still, a poll, files
 *             and the counts; a press on a row opens the post; the menu has
 *             pin, move, edit and delete for one's own post; Move sends move
 *
 * Pictures go to SHOTS_DIR (.round31-shots by default).
 *
 *   node scripts/check-community-content-round31.mjs [ICON ROWS SHEET WRITER FEED SHOTS]
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".community-round31-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round31-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"

/* A fake visualViewport the probe drives (iOS's shape of a keyboard: the layout stays, the visible part shrinks). */
const PRELUDE = `
(function () {
  var vv = new EventTarget();
  var state = { height: window.innerHeight, offsetTop: 0 };
  Object.defineProperty(vv, "height", { get: function () { return state.height } });
  Object.defineProperty(vv, "width", { get: function () { return window.innerWidth } });
  Object.defineProperty(vv, "offsetTop", { get: function () { return state.offsetTop } });
  Object.defineProperty(vv, "offsetLeft", { get: function () { return 0 } });
  Object.defineProperty(vv, "pageTop", { get: function () { return state.offsetTop + window.scrollY } });
  Object.defineProperty(vv, "scale", { get: function () { return 1 } });
  Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return vv } });
  window.__keyboard = function (keys, pan) {
    state.height = window.innerHeight - keys;
    state.offsetTop = pan || 0;
    vv.dispatchEvent(new Event("resize"));
    vv.dispatchEvent(new Event("scroll"));
  };
  window.__sent = [];
})();
`

/* A post as the member route answers it. */
const postView = (over = {}) => ({
  id: "99999999-0000-4000-8000-000000000099",
  communityId: ID,
  space: { id: "s1", slug: "general", name: "General", icon: "✍️", kind: "feed" },
  kind: "post",
  title: "Glaze test results",
  body: "<p>Three tiles, one shelf.</p>",
  bodyText: "Three tiles, one shelf.",
  media: [],
  pinned: false,
  featured: false,
  locked: false,
  status: "published",
  author: { id: ME, name: "Ana Popescu", username: "ana", avatarUrl: null, role: "owner", level: 3 },
  reactionCount: 0,
  commentCount: 0,
  reacted: false,
  bookmarked: false,
  poll: null,
  createdAt: new Date().toISOString(),
  editedAt: null,
  lastActivityAt: new Date().toISOString(),
  canEdit: true,
  canModerate: true,
  ...over,
})

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "${ME}" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-content-round31.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-round31-probe/navigation.js", "next/link": "./.community-round31-probe/link.jsx", "next/image": "./.community-round31-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(caseName, vp, extra = "") {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(PRELUDE)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        const method = r.method()
        let body = {}
        let status = 200
        let sent = null
        try {
          sent = r.postData() ? JSON.parse(r.postData()) : null
        } catch {
          sent = r.postData()
        }
        if (method !== "GET") p.evaluate((x) => window.__sent.push(x), { short, method, sent }).catch(() => {})
        if (short.includes(`/api/app/community/${ID}/spaces`) && method === "GET") body = { spaces: [] }
        else if (short.includes(`/api/app/community/${ID}/spaces`)) body = { ok: true }
        else if (short.includes(`/api/app/community/${ID}/moderation`)) body = { status: "ok" }
        else if (short.includes(`/api/app/community/${ID}/posts`)) body = { rows: [], next: null }
        else if (short.includes(`/api/app/community/${ID}/classroom`)) body = { attached: [], available: [] }
        else if (short.includes(`/api/app/community/${ID}/events`)) body = { upcoming: [], past: [], tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null } }
        else if (new RegExp(`/api/community/${ID}/posts/[^/]+$`).test(short.split("?")[0]) && method === "GET") body = { post: postView({ id: short.split("/").pop(), title: "Prompt deck, March", bodyText: "Thirty prompts, one for each morning." }) }
        else if (short.startsWith(`/api/community/${ID}/posts`) && method === "POST") {
          status = 201
          body = { post: postView({ title: sent?.title ?? "", bodyText: sent?.body ?? "", space: { id: sent?.spaceId ?? "s1", slug: "general", name: sent?.spaceId === "s2" ? "Announcements" : "General", icon: null, kind: sent?.spaceId === "s2" ? "announcements" : "feed" } }) }
        }
        return void r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}?case=${caseName}${extra}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(600)
    return { p, errors }
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : null
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 }
    }, sel)
  const clickAt = async (p, sel, dx = 0.5, dy = 0.5) => {
    const b = await box(p, sel)
    if (!b) return false
    await p.mouse.click(b.x + b.w * dx, b.y + b.h * dy)
    return true
  }
  const tapAt = async (p, sel, dx = 0.5, dy = 0.5) => {
    const b = await box(p, sel)
    if (!b) return false
    await p.touchscreen.tap(b.x + b.w * dx, b.y + b.h * dy)
    return true
  }
  const sent = (p) => p.evaluate(() => window.__sent.slice())
  const routed = (p) => p.evaluate(() => (window.__router || []).slice())

  /* ── ICON ─────────────────────────────────────────────────────────────── */
  if (want("ICON")) {
    console.log("\nICON: a picker, not a text box")
    const { p, errors } = await open("spaces", DESK)
    const glyphs = await p.evaluate(() => [...document.querySelectorAll("[data-space-row] [data-space-glyph]")].map((g) => g.textContent))
    expect(glyphs[0] === "💬" && glyphs[1] === "📣", "an old word name shows its kind's emoji", glyphs.slice(0, 2))
    expect(glyphs[3] === "👨‍👩‍👧", "a family emoji is drawn whole (one grapheme, never cut)", glyphs[3])
    expect(glyphs[4] === "AI", "two letters of the admin's own are drawn as they are", glyphs[4])
    await p.click("[data-space-new]")
    await sleep(500)
    const tile = await p.evaluate(() => { const t = document.getElementById("sp-icon"); return t ? { tag: t.tagName, value: t.getAttribute("data-space-icon"), caret: getComputedStyle(t).caretColor } : null })
    expect(tile?.tag === "BUTTON", "the Icon is a button, so no caret sits over the emoji", tile)
    await p.click("#sp-icon")
    await sleep(400)
    const picker = await box(p, "[data-space-icon-picker]")
    expect(!!picker?.shown && picker.w >= 300, "pressing it opens the emoji picker as a popover", picker)
    await p.screenshot({ path: join(shots, "icon-picker-1440.png") })
    const firstEmoji = await p.evaluate(() => document.querySelector("[data-space-icon-picker] [data-emoji]")?.getAttribute("data-emoji"))
    await p.click("[data-space-icon-picker] [data-emoji]")
    await sleep(400)
    const afterPick = await p.evaluate(() => ({ value: document.getElementById("sp-icon")?.getAttribute("data-space-icon"), open: !!document.querySelector("[data-space-icon-picker]") }))
    expect(afterPick.value === firstEmoji && !afterPick.open, "a picked emoji becomes the icon and the picker closes", { firstEmoji, ...afterPick })
    await p.click("#sp-icon")
    await sleep(350)
    await p.click("[data-icon-input]")
    await p.keyboard.type("ABC")
    const refused = await p.evaluate(() => ({ hint: document.querySelector("[data-icon-hint]")?.getAttribute("data-icon-hint"), use: document.querySelector("[data-icon-use]")?.disabled }))
    expect(refused.hint === "error" && refused.use === true, "three letters are refused, and Use waits", refused)
    await p.evaluate(() => {
      const i = document.querySelector("[data-icon-input]")
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
      set.call(i, " 👩🏽‍💻 ")
      i.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await sleep(100)
    const preview = await p.evaluate(() => document.querySelector("[data-icon-preview]")?.getAttribute("data-icon-preview"))
    expect(preview === "👩🏽‍💻", "a pasted emoji with a skin tone and a joiner is one icon, its spaces taken off", preview)
    await p.click("[data-icon-use]")
    await sleep(350)
    const own = await p.evaluate(() => document.getElementById("sp-icon")?.getAttribute("data-space-icon"))
    expect(own === "👩🏽‍💻", "Use makes it the icon", own)
    await p.type("#sp-name", "Wins")
    await p.click("[data-space-save]")
    await sleep(500)
    const posted = (await sent(p)).find((x) => x.short.endsWith("/spaces") && x.method === "POST")
    expect(posted?.sent?.icon === "👩🏽‍💻" && posted?.sent?.name === "Wins", "Add space sends that icon", posted?.sent && { icon: posted.sent.icon, name: posted.sent.name })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── ROWS ─────────────────────────────────────────────────────────────── */
  if (want("ROWS")) {
    console.log("\nROWS: a row opens what it is")
    for (const [name, rowSel, sheet] of [
      ["spaces", "[data-space-row]", "space"],
      ["classroom", "[data-course-row]", "course"],
      ["events", "[data-event-row]", "event"],
    ]) {
      const { p, errors } = await open(name, DESK)
      /* Pressed on the far right of the words, away from the title itself. */
      await clickAt(p, rowSel, 0.62, 0.5)
      await sleep(450)
      const opened = await p.evaluate((s) => !!document.querySelector(`[data-form-sheet="${s}"]`), sheet)
      expect(opened, `${name}: pressing the row opens its editor`)
      await p.keyboard.press("Escape")
      await sleep(400)
      await p.click(`${rowSel} [data-row-control] > button:last-of-type`)
      await sleep(400)
      const menu = await p.evaluate((s) => ({ menu: !!document.querySelector("[role=menu]"), editor: !!document.querySelector(`[data-form-sheet="${s}"]`) }), sheet)
      expect(menu.menu && !menu.editor, `${name}: its menu opens the menu, not the editor`, menu)
      await p.keyboard.press("Escape")
      await sleep(300)
      await p.focus(`${rowSel} [data-row-open]`)
      await p.keyboard.press("Enter")
      await sleep(450)
      const keyed = await p.evaluate((s) => !!document.querySelector(`[data-form-sheet="${s}"]`), sheet)
      expect(keyed, `${name}: Enter on the row's button opens it from the keyboard`)
      await p.screenshot({ path: join(shots, `${name}-editor-1440.png`) })
      await p.keyboard.press("Escape")
      await sleep(400)
      await p.screenshot({ path: join(shots, `${name}-1440.png`) })
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── SHEET ────────────────────────────────────────────────────────────── */
  if (want("SHEET")) {
    console.log("\nSHEET: New space on a phone, with the keyboard up")
    const { p, errors } = await open("spaces", PHONE)
    await p.screenshot({ path: join(shots, "spaces-390.png") })
    await p.evaluate(() => {
      window.__frames = []
      const t0 = performance.now()
      const sample = () => {
        /* Where the eye sees the sheet: its top row, through every transform above it, while the sheet is shown (primed, it waits unseen). */
        const bar = document.querySelector('[data-form-sheet="space"] [data-form-sheet-bar]')
        const dialog = bar?.closest("[role=dialog]")
        if (bar && dialog && Number(getComputedStyle(dialog).opacity) > 0.5) window.__frames.push({ t: Math.round(performance.now() - t0), top: Math.round(bar.getBoundingClientRect().top) })
        if (performance.now() - t0 < 1400) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await tapAt(p, "[data-space-new]")
    await sleep(1500)
    const frames = await p.evaluate(() => window.__frames)
    const moving = frames.filter((f, i) => i > 0 && f.top !== frames[i - 1].top)
    const tops = frames.map((f) => f.top)
    const monotonic = tops.every((t, i) => i === 0 || t <= tops[i - 1] + 1)
    const gaps = moving.map((f, i) => (i ? f.t - moving[i - 1].t : 0)).slice(1)
    expect(moving.length >= 8 && monotonic, "it rises over many frames, only ever upward", { frames: moving.length, monotonic, from: tops[0], to: tops[tops.length - 1] })
    const landed = frames.findIndex((f) => f.top === tops[tops.length - 1])
    expect(landed > 0 && frames.slice(landed).every((f) => f.top === tops[tops.length - 1]), "and once it lands it stays: one rise, no second move", { landedAt: frames[landed]?.t })
    console.log(`        frame gaps while rising (ms): ${JSON.stringify(gaps)}`)
    if (process.env.FRAMES) console.log(JSON.stringify(frames))
    const kind = await p.evaluate(() => document.querySelector("[data-form-sheet]")?.getAttribute("data-form-kind"))
    expect(kind === "sheet", "it is the composer's sheet, not the old dialog", kind)
    const bar = await box(p, "[data-form-sheet-bar]")
    const cancel = await box(p, "[data-form-sheet] [data-form-cancel]")
    const add = await box(p, "[data-form-sheet] [data-space-save]")
    const addText = await p.evaluate(() => document.querySelector("[data-form-sheet] [data-space-save]")?.textContent)
    expect(!!bar && !!cancel && !!add && Math.abs(cancel.y - add.y) <= 2 && add.x > cancel.x, "Cancel and Add space sit in one row at the top of the sheet", { cancel, add, addText })
    await p.screenshot({ path: join(shots, "space-sheet-390.png") })
    /* The keyboard: 336px, as an iPhone's with its bar, the page not panned. */
    await p.focus("#sp-desc")
    await p.evaluate(() => window.__keyboard(336, 0))
    await sleep(900)
    const visibleBottom = 844 - 336
    const field = await box(p, "#sp-desc")
    const scroller = await box(p, "[data-form-sheet] [data-form-scroll]")
    const addK = await box(p, "[data-form-sheet] [data-space-save]")
    const cancelK = await box(p, "[data-form-sheet] [data-form-cancel]")
    const kb = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kb-inset"))
    expect(!!field && field.bottom <= visibleBottom && field.y >= 0, "the field typed in is above the keyboard", { field, visibleBottom, kb })
    expect(!!addK && addK.y >= 0 && addK.bottom <= visibleBottom && !!cancelK && cancelK.y >= 0, "Cancel and Add space are on screen, above the keys", { cancelK, addK })
    expect(!!scroller && visibleBottom - scroller.bottom <= 40 && scroller.bottom <= visibleBottom + 1, "the sheet's content ends at the keys: no band between them", { scrollerBottom: scroller?.bottom, visibleBottom })
    await p.screenshot({ path: join(shots, "space-sheet-keyboard-390.png") })
    /* The icon from inside the sheet: the shared sheet over it. */
    await p.evaluate(() => window.__keyboard(0, 0))
    await p.evaluate(() => document.activeElement?.blur())
    await sleep(500)
    await tapAt(p, "#sp-icon")
    await sleep(700)
    const iconSheet = await p.evaluate(() => { const el = document.querySelector("[data-icon-picker]"); if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height) } })
    expect(!!iconSheet && iconSheet.y > 100 && iconSheet.h > 300, "on a phone the icon picker is the shared bottom sheet", iconSheet)
    await p.screenshot({ path: join(shots, "icon-sheet-390.png") })
    await tapAt(p, "[data-icon-picker] [data-emoji]")
    await sleep(700)
    const v = await p.evaluate(() => document.getElementById("sp-icon")?.getAttribute("data-space-icon"))
    expect(!!v, "a tapped emoji becomes the icon", v)
    /* Cancel: the sheet goes down and leaves the page. */
    await tapAt(p, "[data-form-sheet] [data-form-cancel]")
    await sleep(900)
    const gone = await p.evaluate(() => !document.querySelector("[data-form-sheet]"))
    expect(gone, "Cancel takes the sheet down and out of the page")
    expect(errors.length === 0, "no page errors", errors)
    await p.close()

    console.log("\nSHEET: Schedule an event on a phone")
    const ev = await open("events", PHONE)
    await tapAt(ev.p, "[data-event-new]")
    await sleep(1200)
    await ev.p.focus("#ev-desc")
    await ev.p.evaluate(() => window.__keyboard(336, 0))
    await sleep(900)
    const evField = await box(ev.p, "#ev-desc")
    const evSave = await box(ev.p, "[data-form-sheet] [data-event-save]")
    expect(!!evField && evField.bottom <= 844 - 336 && evField.y >= 0, "a field far down the form is scrolled above the keys", evField)
    expect(!!evSave && evSave.y >= 0, "Schedule stays on screen at the top", evSave)
    await ev.p.screenshot({ path: join(shots, "event-sheet-keyboard-390.png") })
    expect(ev.errors.length === 0, "no page errors", ev.errors)
    await ev.p.close()
  }

  /* ── WRITER ───────────────────────────────────────────────────────────── */
  if (want("WRITER")) {
    console.log("\nWRITER: the member composer, here")
    const { p, errors } = await open("feed", DESK)
    const closed = await p.evaluate(() => {
      const c = document.querySelector("[data-feed-writer] [data-composer]")
      return c ? { state: c.getAttribute("data-composer"), text: c.querySelector("[data-composer-open]")?.textContent?.trim() } : null
    })
    expect(closed?.state === "closed" && /Share something/.test(closed.text || ""), "the Feed's writer is the member composer's card", closed)
    await p.click("[data-feed-writer] [data-composer-open]")
    await sleep(700)
    const tools = await p.evaluate(() => ({
      open: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"),
      tools: document.querySelectorAll("[data-feed-writer] [data-composer-tool]").length,
      emoji: !!document.querySelector("[data-feed-writer] [data-emoji-trigger]"),
      space: !!document.querySelector("[data-feed-writer] [data-composer-space]"),
      title: !!document.querySelector("[data-feed-writer] [data-composer-title]"),
    }))
    expect(tools.open === "open" && tools.tools >= 4 && tools.emoji && tools.space && tools.title, "it opens in place with its title, toolbar, emoji and space picker", tools)
    await p.screenshot({ path: join(shots, "writer-open-1440.png") })
    await p.type("[data-feed-writer] [data-composer-title]", "Glaze test results")
    await p.click("[data-feed-writer] textarea")
    await p.keyboard.type("Three tiles, one shelf.")
    await p.click("[data-feed-writer] [data-composer-space] , [data-feed-writer] button[data-composer-space]")
    await sleep(400)
    const general = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((x) => /General/.test(x.textContent || ""))?.textContent)
    if (general) {
      await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((x) => /General/.test(x.textContent || ""))?.click())
      await sleep(300)
    }
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(2600)
    const post = (await sent(p)).find((x) => x.short === `/api/community/${ID}/posts` && x.method === "POST")
    expect(!!post && post.sent?.title === "Glaze test results" && post.sent?.spaceId === "s1", "Post goes through the member route, as the composer posts", post?.sent && { title: post.sent.title, spaceId: post.sent.spaceId })
    const first = await p.evaluate(() => document.querySelector("[data-feed-row]")?.textContent?.slice(0, 80))
    expect(/Glaze test results/.test(first || ""), "the post arrives as the list's first row", first)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()

    const ph = await open("feed", PHONE)
    await ph.p.screenshot({ path: join(shots, "feed-390.png") })
    const card = await box(ph.p, "[data-feed-writer] [data-composer]")
    const list = await box(ph.p, "[data-feed] > section")
    const radius = await ph.p.evaluate(() => getComputedStyle(document.querySelector("[data-feed-writer] [data-composer]")).borderTopLeftRadius)
    expect(!!card && !!list && card.x === list.x && card.w === list.w && parseFloat(radius) >= 12, "on a phone the writer is a card in the page's gutter, lined up with the list (not a full width row)", { card, list, radius })
    await tapAt(ph.p, "[data-feed-writer] [data-composer-open]")
    await sleep(1400)
    const sheet = await ph.p.evaluate(() => { const s = document.querySelector('[data-composer="sheet"]'); if (!s) return null; const b = s.getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height) } })
    expect(!!sheet && sheet.y < 200, "on a phone it is the composer's own sheet", sheet)
    await ph.p.screenshot({ path: join(shots, "writer-sheet-390.png") })
    expect(ph.errors.length === 0, "phone: no page errors", ph.errors)
    await ph.p.close()

    const w = await open("feed-welcome", DESK)
    await sleep(600)
    const welcome = await w.p.evaluate(() => ({ state: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), title: document.querySelector("[data-feed-writer] [data-composer-title]")?.value, space: document.querySelector("[data-feed-writer] [data-composer-space]")?.getAttribute("data-composer-space") }))
    expect(welcome.state === "open" && /Welcome to The Morning Writers/.test(welcome.title || "") && welcome.space === "s2", "?compose=welcome opens it with the welcome title, in Announcements", welcome)
    expect(w.errors.length === 0, "welcome: no page errors", w.errors)
    await w.p.close()
  }

  /* ── FEED ─────────────────────────────────────────────────────────────── */
  if (want("FEED")) {
    console.log("\nFEED: rows as the feed shows them")
    const { p, errors } = await open("feed", DESK)
    const rows = await p.evaluate(() =>
      [...document.querySelectorAll("li[data-feed-row]")].map((r) => ({
        media: r.querySelector("[data-feed-media]")?.getAttribute("data-feed-media") ?? null,
        more: r.querySelector("[data-feed-media-more]")?.textContent ?? null,
        thumb: r.querySelector("[data-post-thumb]")?.getAttribute("data-post-thumb") ?? null,
        img: !!r.querySelector("[data-post-thumb] img"),
        poll: r.querySelector("[data-feed-poll]")?.textContent ?? null,
        files: r.querySelector("[data-feed-files]")?.getAttribute("data-feed-files") ?? null,
        counts: r.querySelector("[data-feed-counts]")?.textContent ?? null,
        pinned: !!r.querySelector("[data-feed-pinned]"),
        glyph: r.querySelector("[data-space-glyph]")?.textContent ?? null,
      })),
    )
    expect(rows[0]?.pinned && rows[0]?.glyph === "📣", "a pinned announcement says Pinned, with its space's icon", rows[0])
    expect(rows[1]?.media === "3" && rows[1]?.more === "+2" && rows[1]?.img, "three pictures: the first as the thumbnail, +2", rows[1])
    expect(rows[2]?.thumb === "video" && rows[2]?.img, "a video shows its still with the play mark", rows[2])
    expect(/Which evening works best/.test(rows[3]?.poll || "") && /37 votes/.test(rows[3]?.poll || ""), "a poll shows its question and its votes", rows[3]?.poll)
    expect(rows[4]?.files === "2", "files show the first name and how many more", rows[4])
    expect(/21/.test(rows[1]?.counts || "") && /4/.test(rows[1]?.counts || ""), "likes and comments are counted", rows[1]?.counts)
    await p.screenshot({ path: join(shots, "feed-1440.png") })
    await clickAt(p, "li[data-feed-row]:nth-child(2)", 0.45, 0.85)
    await sleep(300)
    const went = (await routed(p)).pop()
    expect(!!went && went[0] === "push" && /^\/community\/morning-writers\/post\//.test(went[1]), "a press on the row opens the post", went)
    /* The menu of one's own post, then somebody else's. */
    await p.click("li[data-feed-row]:nth-child(5) [data-row-control] button")
    await sleep(400)
    const mine = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((x) => x.textContent.trim()))
    expect(["Open post", "Edit post", "Pin to the top", "Move to another space", "Delete post"].every((x) => mine.includes(x)), "one's own post: open, edit, pin, move, delete", mine)
    await p.screenshot({ path: join(shots, "feed-menu-1440.png") })
    await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((x) => /Edit post/.test(x.textContent || ""))?.click())
    await sleep(900)
    const editing = await p.evaluate(() => ({ row: !!document.querySelector("li[data-feed-editing] [data-composer='edit']"), title: document.querySelector("li[data-feed-editing] [data-composer-title]")?.value }))
    expect(editing.row && editing.title === "Prompt deck, March", "Edit post opens the composer in the row, with the post in it", editing)
    await p.screenshot({ path: join(shots, "feed-edit-1440.png") })
    await p.click("li[data-feed-editing] [data-composer-cancel]")
    await sleep(700)
    /* Round 32: the card has a toolbar and a foot now, so after the edit the row can sit under the sticky header; bring it to the middle first. */
    await p.evaluate(() => document.querySelector("li[data-feed-row]:nth-child(2)")?.scrollIntoView({ block: "center" }))
    await sleep(200)
    await p.click("li[data-feed-row]:nth-child(2) [data-row-control] button")
    await sleep(400)
    const theirs = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((x) => x.textContent.trim()))
    expect(theirs.includes("Remove") && !theirs.includes("Edit post") && theirs.includes("Move to another space"), "somebody else's: remove and move, no edit", theirs)
    await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((x) => /Move to another space/.test(x.textContent || ""))?.click())
    await sleep(500)
    await p.click('[data-move-space="s2"]')
    await p.click("[data-move-save]")
    await sleep(500)
    const move = (await sent(p)).find((x) => x.short.endsWith("/moderation") && x.sent?.action === "move")
    const moved = await p.evaluate(() => document.querySelector("li[data-feed-row]:nth-child(2)")?.textContent)
    expect(move?.sent?.spaceId === "s2" && /Announcements/.test(moved || ""), "Move sends move to the space picked, and the row says where it is now", move?.sent)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── SHOTS ────────────────────────────────────────────────────────────── */
  if (want("SHOTS")) {
    console.log("\nSHOTS")
    for (const name of ["classroom", "events", "spaces", "feed-empty"]) {
      const { p, errors } = await open(name, PHONE)
      await p.screenshot({ path: join(shots, `${name}-390.png`) })
      expect(errors.length === 0, `${name} 390: no page errors`, errors)
      await p.close()
    }
    console.log(`  pictures: ${shots}`)
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
