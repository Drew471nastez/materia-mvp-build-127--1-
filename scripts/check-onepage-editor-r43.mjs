/**
 * ===========================================================================
 *  ROUND 43, MEASURED: THE ONEPAGE EDITOR'S SHEETS, A BLOCK'S FOOT, ITS
 *  STATS, THE HEADER'S FRAME AND TYPE, AND WINDOWS OVER THE LIVE PAGE
 * ===========================================================================
 * The real editor (scripts/render-onepage-editor.tsx) and the real live page
 * (?live, and scripts/render-onepage-public-r41.tsx) in headless Chromium at
 * 390 and 1280:
 *
 *   FONTS     the font sheet on a phone: its height against the screen (75%
 *             at most), the search where it was after the list is scrolled,
 *             a row's height, and the room kept while a search narrows it
 *   OFF       a block turned off: its picture and name at half, its open
 *             settings and Remove's question at full opacity (the product
 *             of every ancestor's opacity)
 *   FOOT      Remove, Cancel, Archive and Delete: each key's height
 *   STATS     a block's stats: the dialog's height before and with the period
 *             open (must not change), the period's panel on top of what is
 *             under it, and where "See in Analytics" goes
 *   HEADER    the header set Left over a cover: how many round things the
 *             header draws and where the ring is against the picture; the
 *             picture's ring by default (1.5px) and as set (shape, size,
 *             border, colour); the name's and bio's weight, spacing, case
 *   WINDOWS   at 1280 with a classic 15px scrollbar: the product sheet (a
 *             Radix dialog), the checkout window, Share and Subscribe: the
 *             page's width, a block's left edge and the fixed Share button's
 *             left edge before and while open
 *
 *   node scripts/check-onepage-editor-r43.mjs      SHOTS=dir
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

/* The stylesheet from this tree's sources (./probe-css.mjs): a built one from before this round has none of its new classes. */
process.env.PROBE_CSS ??= "source"
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join(tmpdir(), "onepage-r43-shots")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 }
const SCROLLBAR = "html::-webkit-scrollbar{width:15px;background:#888}html::-webkit-scrollbar-thumb{background:#444}"

const LIVE_THEME = {
  header_align: "left",
  background_type: "solid",
  background_color: "#f4efe9",
  text_color: "#1a1a2e",
  cover_image_url: "https://example.com/cover.jpg",
}
const editor = await serveEditorProbe({ root, liveTheme: LIVE_THEME, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], ignoreDefaultArgs: ["--hide-scrollbars"] })

async function open(base, vp, path, { scrollbar = false, globals = null } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u === "https://example.com/cover.jpg") return void r.respond({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#335"/></svg>` })
    if (u.startsWith(base) || u.startsWith("data:")) return void r.continue()
    return void r.abort()
  })
  await p.evaluateOnNewDocument((css, g) => {
    if (g) Object.assign(window, g)
    try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}
    if (!css) return
    const add = () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st) }
    if (document.head) add()
    else document.addEventListener("DOMContentLoaded", add)
  }, scrollbar ? SCROLLBAR : "", globals)
  const errors = []
  p.on("pageerror", (e) => { if (!/Stripe/.test(String(e))) errors.push(String(e)) })
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  if (scrollbar) {
    /* Served as /app: the app's own html rules come off, and the live page's pointer rules apply (headless has no fine pointer). */
    await p.evaluate(() => document.documentElement.classList.remove("app-layout"))
    await p.evaluate(() => document.querySelectorAll("style").forEach((s) => { s.textContent = s.textContent.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all") }))
  }
  await sleep(1200)
  return { p, errors }
}
const shown = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)

/* ── FONTS ─────────────────────────────────────────────────────────────── */
{
  console.log("\nphone-390: the font sheet")
  const { p, errors } = await open(editor.base, PHONE, "/app/onepage#design")
  await p.waitForSelector("[data-scroll-container]")
  await p.click('[data-nav-row="text"]')
  await sleep(600)
  await p.click('[data-font-picker="Page font"]')
  await sleep(900)
  const read = () => p.evaluate(() => {
    const sheet = document.querySelector("[data-font-sheet]")?.closest("[data-sheet-panel]")
    const list = document.querySelector("[data-font-sheet] [role=listbox]")
    const search = document.querySelector("[data-font-sheet] input")
    const row = list?.querySelector("[data-font-option]")
    return {
      sheet: sheet ? Math.round(sheet.getBoundingClientRect().height) : null,
      top: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
      screen: innerHeight,
      search: search ? Math.round(search.getBoundingClientRect().top) : null,
      row: row ? Math.round(row.getBoundingClientRect().height) : null,
      scrolls: list ? list.scrollHeight > list.clientHeight : null,
    }
  })
  const a = await read()
  expect(a.sheet !== null && a.sheet <= Math.round(a.screen * 0.75) + 1, "the sheet is three quarters of the screen at most", a)
  expect(a.sheet !== null && a.sheet < Math.round(a.screen * 0.8) - 20, "and shorter than the fixed 80% it was", { sheet: a.sheet, was: Math.min(Math.round(a.screen * 0.8), 640) })
  expect(a.row >= 56, "a row is at least 56px to press", a.row)
  await p.evaluate(() => { const l = document.querySelector("[data-font-sheet] [role=listbox]"); l.scrollTop = 400; l.dispatchEvent(new Event("scroll")) })
  await sleep(200)
  const b = await read()
  expect(a.scrolls && b.search === a.search, "the search stays put while the list scrolls under it", { before: a.search, after: b.search })
  await p.type("[data-font-sheet] input", "zzzz")
  await sleep(400)
  const c = await read()
  expect(c.sheet >= 300, "a search with no match keeps room in the sheet", c)
  await p.screenshot({ path: join(SHOTS, "fonts-390.png") })
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await p.close()
}

/* ── OFF, FOOT, STATS ──────────────────────────────────────────────────── */
for (const [label, vp] of [["phone-390", PHONE], ["desktop-1280", DESK]]) {
  console.log(`\n${label}: a block turned off, its foot, its stats`)
  const { p, errors } = await open(editor.base, vp, "/app/onepage#links")
  await p.waitForSelector('[data-block-id="b1"]')
  await p.evaluate(() => [...document.querySelectorAll('[data-block-id="b1"] [data-switch]')].find((e) => e.getClientRects().length)?.click())
  await sleep(500)
  await p.evaluate(() => [...document.querySelectorAll('[data-block-open="b1"]')].find((e) => e.getClientRects().length)?.click())
  await sleep(700)
  await p.evaluate(() => [...document.querySelectorAll('[data-block-id="b1"] [data-block-remove]')].find((e) => e.getClientRects().length)?.click())
  await sleep(700)
  const seen = await p.evaluate(() => {
    const effective = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return Math.round(o * 100) / 100 }
    const card = document.querySelector('[data-block-id="b1"]')
    const q = card?.querySelector("[data-delete-question]")
    const keys = ["[data-block-remove]", "[data-block-remove-cancel]", "[data-block-archive]", "[data-block-delete]"].map((s) => { const e = card?.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null })
    return {
      off: !!card?.querySelector("[data-block-off]"),
      name: card ? effective(card.querySelector("[data-block-open]")) : null,
      settings: card?.querySelector("[data-block-settings]") ? effective(card.querySelector("[data-block-settings]")) : null,
      question: q ? effective(q) : null,
      toggle: card ? effective([...card.querySelectorAll("[data-switch]")][0]) : null,
      keys,
      questionHeight: q ? Math.round(q.getBoundingClientRect().height) : null,
    }
  })
  expect(seen.off && seen.name === 0.5, "an off block's name is faded", seen)
  expect(seen.settings === 1 && seen.question === 1 && seen.toggle === 1, "its settings, Remove's question and its toggle are not", seen)
  expect(seen.keys.every((h) => h === 32), "Remove, Cancel, Archive and Delete are 32px keys", seen.keys)
  expect(seen.questionHeight !== null && seen.questionHeight <= (vp.width < 640 ? 96 : 52), "the question is one compact line (two on a phone)", seen.questionHeight)
  await p.screenshot({ path: join(SHOTS, `foot-${label}.png`) })

  /* The stats of a block that is on (b3 is a heading, so b2). */
  await p.evaluate(() => [...document.querySelectorAll('[data-block-id="b2"] button[title="View Stats"]')].find((e) => e.getClientRects().length)?.click())
  await p.waitForSelector("[data-link-stats]")
  await sleep(1300)
  const box = () => p.evaluate(() => {
    const stats = [...document.querySelectorAll("[data-link-stats]")].find((e) => e.getClientRects().length)
    const frame = stats?.closest("[data-sheet-panel], [role=dialog]")
    const r = frame?.getBoundingClientRect()
    return r ? { top: Math.round(r.top), height: Math.round(r.height) } : null
  })
  const before = await box()
  await p.evaluate(() => [...document.querySelectorAll("[data-stats-head] button[data-filter-set]")].find((e) => e.getClientRects().length)?.click())
  await sleep(600)
  const after = await box()
  const pop = await p.evaluate(() => {
    const el = [...document.querySelectorAll("[data-drp-overlay]")].find((e) => e.getClientRects().length)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height - 4, 40))
    return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), onTop: !!hit && el.contains(hit), screen: innerHeight }
  })
  expect(!!before && !!after && before.height === after.height && before.top === after.top, "the stats keep their height and place while the period is open", { before, after })
  expect(!!pop && pop.onTop && pop.bottom <= pop.screen, "the period opens over them, on top, inside the screen", pop)
  await p.screenshot({ path: join(SHOTS, `stats-${label}.png`) })
  await p.keyboard.press("Escape")
  await sleep(300)
  const href = await p.evaluate(() => [...document.querySelectorAll("[data-stats-analytics]")].find((e) => e.getClientRects().length)?.getAttribute("href"))
  expect(/^\/app\/analytics\?/.test(href || "") && /property=onepage/.test(href) && /report=links/.test(href), "See in Analytics opens the OnePage's Top links", href)
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await p.close()
}

/* ── HEADER ────────────────────────────────────────────────────────────── */
const header = (p) => p.evaluate(() => {
  const h = [...document.querySelectorAll("[data-op-header]")].find((e) => e.getClientRects().length)
  const avatar = h?.querySelector("[data-page-avatar]")
  const round = [...(h?.querySelectorAll("*") ?? [])].filter((e) => {
    if (avatar && (avatar === e || avatar.contains(e))) return false
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return r.width > 40 && Math.abs(r.width - r.height) < 12 && parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 1
  }).length
  const ring = avatar?.querySelector("[data-slot=avatar]")
  const rs = ring ? getComputedStyle(ring) : null
  const ar = avatar?.getBoundingClientRect()
  const h1 = h?.querySelector("h1")
  const bio = h?.querySelector("p")
  const t = h1 ? getComputedStyle(h1) : null
  const b = bio ? getComputedStyle(bio) : null
  return {
    roundOutside: round,
    avatar: ar ? { left: Math.round(ar.left), w: Math.round(ar.width), shadow: getComputedStyle(avatar).boxShadow.slice(0, 40), shape: avatar.getAttribute("data-avatar-shape") } : null,
    ring: rs ? { width: rs.borderTopWidth, color: rs.borderTopColor, radius: rs.borderTopLeftRadius } : null,
    title: t ? { weight: t.fontWeight, spacing: t.letterSpacing, case: t.textTransform, size: t.fontSize } : null,
    bio: b ? { weight: b.fontWeight, spacing: b.letterSpacing, case: b.textTransform, size: b.fontSize } : null,
  }
})
for (const [label, vp] of [["phone-390", PHONE], ["desktop-1280", DESK]]) {
  console.log(`\n${label}: the header, left, over a cover`)
  const { p, errors } = await open(editor.base, vp, "/app/onepage?live")
  const h = await header(p)
  expect(h.roundOutside === 0, "no second circle beside the picture", h)
  expect(/0px 0px 0px 4px/.test(h.avatar?.shadow || "") || /rgb\(244, 239, 233\) 0px 0px 0px 4px/.test(h.avatar?.shadow || ""), "the ring of the page's colour is the picture's own", h.avatar)
  expect(h.ring?.width === "1px", "the default ring is 1px (was 2px)", h.ring)
  expect(h.title?.weight === "700" && h.title?.case === "none" && h.bio?.weight === "400", "an unset name and bio draw as they always did", { title: h.title, bio: h.bio })
  await p.screenshot({ path: join(SHOTS, `header-left-${label}.png`) })
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await p.close()
}
{
  console.log("\nphone-390: the header as set")
  const set = await serveEditorProbe({
    root,
    fail,
    liveTheme: {
      ...LIVE_THEME,
      avatar_shape: "rounded",
      avatar_radius: 20,
      avatar_size: "large",
      avatar_border_width: 0,
      title_weight: 500,
      title_tracking: "wide",
      title_case: "upper",
      title_size: "small",
      bio_weight: 600,
      bio_size: "large",
      bio_tracking: "tight",
    },
  })
  const { p, errors } = await open(set.base, PHONE, "/app/onepage?live")
  const h = await header(p)
  expect(h.avatar?.w === 140 && h.avatar?.shape === "rounded" && h.ring?.radius === "20px" && h.ring?.width === "0px", "large, a rounded square at 20px, no ring", { avatar: h.avatar, ring: h.ring })
  expect(h.title?.weight === "500" && h.title?.case === "uppercase" && h.title?.spacing !== "normal" && h.title?.size === "25px", "the name: medium, capitals, wide, small", h.title)
  expect(h.bio?.weight === "600" && h.bio?.size === "16px" && h.bio?.spacing !== "normal", "the bio: semibold, large, tight", h.bio)
  await p.screenshot({ path: join(SHOTS, "header-set-390.png") })
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await p.close()
  set.server.close()
}

/* ── WINDOWS OVER THE LIVE PAGE ────────────────────────────────────────── */
{
  console.log("\ndesktop-1280: windows over the live page, with a 15px scrollbar")
  const live = await serveEditorProbe({ root, entry: "scripts/render-onepage-public-r41.tsx", fail })
  const { p, errors } = await open(live.base, DESK, "/app/r41?theme=astrid", { scrollbar: true })
  const read = () => p.evaluate(() => {
    const block = [...document.querySelectorAll("[data-product-block]")].find((e) => e.getBoundingClientRect().width > 0)
    const share = [...document.querySelectorAll("[data-onepage-share-button]")].find((e) => e.getBoundingClientRect().width > 0)
    const bell = [...document.querySelectorAll("[data-onepage-bell]")].find((e) => e.getBoundingClientRect().width > 0)
    /*
      The width things are laid out in: the body's, and the right edge of the
      bell (fixed to the right). Not html.clientWidth: with the gutter kept and
      the page held, Chromium reports the whole window there although
      everything is still laid out a scrollbar narrower.
    */
    return { cw: document.documentElement.clientWidth, body: Math.round(document.body.getBoundingClientRect().width * 10) / 10, bell: bell ? Math.round(bell.getBoundingClientRect().right * 10) / 10 : null, block: block ? Math.round(block.getBoundingClientRect().left * 10) / 10 : null, share: share ? Math.round(share.getBoundingClientRect().left * 10) / 10 : null, y: Math.round(scrollY) }
  })
  const was = await read()
  expect(was.cw < DESK.width, "the page has a classic scrollbar that takes room", was)
  const windows = [
    ["share", async () => p.click("[data-onepage-share-button]"), "[data-onepage-share-sheet]"],
    ["subscribe", async () => p.click("[data-onepage-bell]"), "[data-onepage-subscribe-sheet]"],
    ["product sheet", async () => p.evaluate(() => [...document.querySelectorAll('[data-product-tap="sheet"]')].find((e) => e.getBoundingClientRect().width > 0)?.click()), "[role=dialog]"],
  ]
  for (const [name, openIt, sel] of windows) {
    /* The Share and bell buttons hide while the page is scrolled down. */
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(300)
    await openIt()
    await sleep(700)
    const now = await read()
    const there = await p.evaluate((s) => !!document.querySelector(s), sel)
    expect(there && now.body === was.body && now.bell === was.bell && now.block === was.block && now.share === was.share && now.y === was.y, `${name}: the page's width, its blocks, Share and the bell stay put`, { was, now, there })
    if (name === "product sheet") {
      /* From the sheet to the checkout window: its own hold over the dialog's. */
      await p.evaluate(() => [...document.querySelectorAll("[data-product-sheet-buy]")].find((b) => b.getClientRects().length)?.click())
      await sleep(900)
      const inWindow = await read()
      const windowThere = await p.evaluate(() => !!document.querySelector("[data-instant-checkout]"))
      expect(windowThere && (inWindow.body === was.body && inWindow.bell === was.bell && inWindow.block === was.block && inWindow.share === was.share), "checkout window: the same", { windowThere, now: inWindow })
      await p.screenshot({ path: join(SHOTS, "windows-checkout-1280.png") })
    }
    await p.keyboard.press("Escape")
    await sleep(500)
    await p.keyboard.press("Escape")
    await sleep(600)
    const back = await read()
    const held = await p.evaluate(() => document.documentElement.hasAttribute("data-op-hold") || !!document.documentElement.style.overflow)
    expect(back.body === was.body && back.bell === was.bell && back.block === was.block && !held, `${name}: and after it closes, nothing is left held`, { back, held })
  }
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await p.close()
  live.server.close()
}

await browser.close()
editor.server.close()
console.log(failed ? `\n${failed} failed (pictures in ${SHOTS})\n` : `\nall passed (pictures in ${SHOTS})\n`)
process.exit(failed ? 1 : 0)
