/**
 * ===========================================================================
 *  THE HEADER'S SEARCH FIELD IS THE HERO'S, AND BOTH CARRY THE CATEGORIES ICON
 * ===========================================================================
 * Round 6. Renders the real PlatformHeaderClient over the real Explore page
 * (scripts/render-explore-header.tsx) and checks, as numbers:
 *
 *   THE HERO'S ICON   the Categories control in Explore's own field is an
 *                     icon alone: no word, a grid, named Categories, a
 *                     tooltip on hover; it opens the category panel.
 *   THE HEADER FIELD  once the hero's field has gone under the header, the
 *                     header's field has the hero's corner, hairline,
 *                     background and depth (round 10: the depth scaled to
 *                     end inside the bar, so it is never cut at its edge),
 *                     resting and focused, and is not a pill; its height is the bar's (44px, not the hero's
 *                     62), and the bar does not grow for it.
 *   THE HEADER ICON   the same grid icon at its right end, named
 *                     Categories, with the same tooltip; it opens the same
 *                     panel under it, lined up with its right edge, and a
 *                     pick in it is the page's pick (the pill row follows);
 *                     with the search results open, pressing it closes them
 *                     first.
 *   ELSEWHERE         a page without Explore's hero keeps the hero look and
 *                     has no icon (there is no menu to open).
 *   PHONE             at 390px the computer's field and its icon are not
 *                     drawn (the phone header is left as it was); the
 *                     hero's icon is a 40px square that opens the sheet.
 *
 *   PROBE_CSS=source node scripts/check-explore-search-icon.mjs
 *
 * Screenshots go to SHOTS_DIR (a temporary folder by default).
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { cropPng } from "./probe-crop.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".explore-search-icon-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-search-icon-")), "shots")
mkdirSync(shots, { recursive: true })

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({ category: window.__category })`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  "supabase-client": `const done = { data: null, error: null }
const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(done) : chain(), apply: () => chain() })
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: () => chain(),
    rpc: () => chain(),
    channel: () => chain(),
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-explore-header.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
/* As storelib.com runs: Explore on (the header hands its search to the hero) and the light bar; DARK=1 for the dark bar. */
const LIVE = process.env.DARK ? "?live=1&dark=1" : "?live=1"
async function open(vp, view = "explore") {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}${LIVE}#${view}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(600)
  p.__errors = errors
  return p
}

/* The look of a field, as computed: what the owner asked to be the same. */
const LOOK = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return null
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  /* Layers that draw nothing (no offset, blur or spread: Tailwind's empty ring slots) are left out, so what is compared is what shows. */
  const shadow = cs.boxShadow.split(/,(?![^(]*\\))/).map((l) => l.trim()).filter((l) => !/ 0px 0px 0px 0px$/.test(l)).join(", ")
  return { radius: cs.borderTopLeftRadius + " " + cs.borderBottomRightRadius, shadow, border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor, bg: cs.backgroundColor, height: Math.round(r.height), top: Math.round(r.top), right: Math.round(r.right), shown: r.width > 0 && cs.visibility !== "hidden" }
})()`
const HERO = "main form[role=search] input"
const HEAD = "#platform-header-root [data-header-search-field] input"
const ICON = (sel) => `(() => {
  const b = document.querySelector(${JSON.stringify(sel)})
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { text: b.textContent.trim(), label: b.getAttribute("aria-label"), svg: !!b.querySelector("svg"), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), mid: Math.round(r.top + r.height / 2), visible: r.width > 0 && getComputedStyle(b).visibility !== "hidden" }
})()`
const PANEL = `(() => { const d = document.querySelector("[data-category-panel]"); if (!d) return null; const r = d.getBoundingClientRect(); return { right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height), rows: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 4) } })()`
const headerH = (p) => p.evaluate(() => Math.round(document.getElementById("platform-header-root").getBoundingClientRect().height))
/* Waits out a transition: the field fades in over 200ms, focus eases its shadow. */
const settle = (ms = 500) => sleep(ms)

const WIDE = { width: 1440, height: 900, deviceScaleFactor: 1 }
/* The top of the window, wherever it is scrolled: puppeteer's clip is in page coordinates. */
const shotTop = async (p, name, width, height) => {
  const y = await p.evaluate(() => scrollY)
  await p.screenshot({ path: join(shots, name), clip: { x: 0, y, width, height } })
}

/*
  ROUND 10: NOTHING CUTS THE HERO FIELD'S DEPTH. No ancestor clips (overflow,
  clip-path, paint containment) and nothing with a ground of its own is drawn
  over the 20px of shadow under it or the 11px at its sides.
*/
const UNCUT = `(() => {
  const input = document.querySelector("main form[role=search] input")
  if (!input) return null
  const r = input.getBoundingClientRect()
  const clippers = []
  for (let el = input.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none" || /paint|strict|content/.test(cs.contain)) clippers.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 50))
  }
  const covers = []
  const points = [[r.left + r.width / 2, r.bottom + 6], [r.left + r.width / 2, r.bottom + 16], [r.left + 24, r.bottom + 10], [r.right - 24, r.bottom + 10], [r.left - 5, r.top + r.height / 2], [r.right + 5, r.top + r.height / 2]]
  for (const [x, y] of points) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === document.body || el === document.documentElement || el.contains(input)) break
      const bg = getComputedStyle(el).backgroundColor
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") { covers.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 50) + " " + bg); break }
    }
  }
  return { clippers, covers }
})()`

console.log("\ncomputer: the hero's field")
{
  const p = await open(WIDE)
  const icon = await p.evaluate(ICON("[data-search-categories]"))
  expect(!!icon && icon.text === "" && icon.svg && icon.label === "Categories", "an icon alone, named Categories", icon)
  expect(!!icon && icon.w === icon.h && icon.h === 44, "a 44px square", icon && { w: icon.w, h: icon.h })
  const uncut = await p.evaluate(UNCUT)
  expect(!!uncut && uncut.clippers.length === 0 && uncut.covers.length === 0, "ROUND 10: nothing clips or covers the field's depth", uncut)
  await p.hover("[data-search-categories]")
  await sleep(700)
  const tip = await p.evaluate(() => (document.querySelector("[data-categories-tooltip]") ? document.querySelector("[role=tooltip]")?.textContent.trim() : null) ?? null)
  expect(tip === "Categories", "hover shows Categories", tip)
  await p.screenshot({ path: join(shots, "desktop-hero-tooltip.png"), clip: { x: 300, y: 120, width: 840, height: 220 } })
  await p.click("[data-search-categories]")
  await sleep(500)
  const panel = await p.evaluate(PANEL)
  const tipGone = await p.evaluate(() => !document.querySelector("[data-categories-tooltip]"))
  expect(!!panel && Math.abs(panel.right - icon.right) <= 2 && panel.top >= icon.bottom && panel.rows.length > 2, "it opens the category panel under it, lined up with its right edge", panel)
  expect(tipGone, "the tooltip is gone while the panel is open")
  await p.screenshot({ path: join(shots, "desktop-hero-open.png") })
  await p.keyboard.press("Escape")
  await sleep(500)
  expect(await p.evaluate(() => !document.querySelector("[data-category-panel]")), "Escape closes it")
  await sleep(300)
  const tipAfter = await p.evaluate(() => !!document.querySelector("[data-categories-tooltip]"))
  expect(!tipAfter, "and focus coming back does not raise the tooltip")
  await p.close()
}

console.log("\ncomputer: the header's field, after scrolling past the hero")
{
  const p = await open(WIDE)
  const barTop = await headerH(p)
  const hero = await p.evaluate(LOOK(HERO))
  const heroIcon = await p.evaluate(ICON("[data-search-categories]"))
  const before = await p.evaluate(() => { const w = document.querySelector("#platform-header-root [data-header-search]"); return w ? { state: w.getAttribute("data-header-search"), opacity: getComputedStyle(w).opacity, visibility: getComputedStyle(w).visibility } : null })
  expect(!!before && before.state === "hidden" && before.visibility === "hidden", "at the top the header has no field (the hero has it)", before)
  await p.evaluate(() => scrollTo(0, 1400))
  await settle(700)
  const head = await p.evaluate(LOOK(HEAD))
  expect(!!head && head.shown, "scrolled past the hero, the header shows its field", head && { shown: head.shown })
  expect(!!head && head.radius === hero.radius && head.radius === "10px 10px", "the same 10px corner, not a pill", { hero: hero.radius, header: head?.radius })
  /*
    ROUND 10: THE SAME LIGHT, SIZED TO THE BAR. The hero's depth reaches 20px
    under its field; the header's field ends 13px above the bar's foot, and
    the same shadow ran over the bar's hairline onto the page and read as cut
    off. In the bar it is scaled to end inside it (lib/explore/search-field-look).
  */
  const reach = (shadow) => Math.max(0, ...shadow.split(/,(?![^(]*\))/).map((one) => { const n = one.replace(/rgba?\([^)]*\)/, "").trim().split(/\s+/).map(parseFloat); return (n[1] || 0) + (n[2] || 0) + (n[3] || 0) }))
  const barFoot = await p.evaluate(() => document.getElementById("platform-header-root").getBoundingClientRect().bottom)
  const room = barFoot - (head.top + head.height)
  expect(!!head && reach(head.shadow) <= room - 1 && reach(hero.shadow) === 20, "the bar's depth ends inside the bar (the hero's reaches 20px)", { headerReach: reach(head.shadow), room: Math.round(room), heroReach: reach(hero.shadow), header: head?.shadow })
  expect(!!head && /rgba\(15, 23, 42/.test(head.shadow) && head.shadow.split(/,(?![^(]*\))/).length === hero.shadow.split(/,(?![^(]*\))/).length, "the same two layers, the same ink", { hero: hero.shadow, header: head?.shadow })
  expect(!!head && head.border === hero.border && head.bg === hero.bg, "the same hairline and ground", { hero: [hero.border, hero.bg], header: head && [head.border, head.bg] })
  expect(!!head && head.height === 44 && hero.height === 62, "height: 44px in the bar, 62 under the heading (the bar's buttons are 42)", { hero: hero.height, header: head?.height })
  const barScrolled = await headerH(p)
  expect(barScrolled === barTop, "the bar keeps its height with the field in it", { top: barTop, scrolled: barScrolled })

  const icon = await p.evaluate(ICON("[data-header-search-categories]"))
  expect(!!icon && icon.visible && icon.text === "" && icon.svg && icon.label === "Categories", "the same grid icon at its right end, named Categories", icon)
  expect(!!icon && head.right - icon.right >= 2 && head.right - icon.right <= 8 && Math.abs(icon.mid - (head.top + head.height / 2)) <= 1, "at the right end, centred in the field", icon && { gap: head.right - icon.right, mid: icon.mid, fieldMid: head.top + head.height / 2 })
  const pad = await p.evaluate((sel) => parseFloat(getComputedStyle(document.querySelector(sel)).paddingRight), HEAD)
  expect(!!icon && pad >= head.right - (icon.right - icon.w) + 4, "the typed text stops before it", { pad, needs: icon && head.right - (icon.right - icon.w) + 4 })
  const iconPaths = await p.evaluate(() => [document.querySelector("[data-search-categories] svg"), document.querySelector("[data-header-search-categories] svg")].map((s) => s?.innerHTML))
  expect(iconPaths[0] && iconPaths[0] === iconPaths[1], "the very same icon as the hero's")
  await shotTop(p, "desktop-header-field.png", 1440, 120)
  /* Close looks, four times: the field's foot against the bar's edge, and the icon. */
  {
    const full = join(shots, "desktop-header-full.png")
    await p.screenshot({ path: full, captureBeyondViewport: false })
    await cropPng(browser, full, join(shots, "desktop-header-field-foot.png"), { x: head.right - 640, y: 0, width: 640, height: Math.round(barFoot) + 24 }, 2)
    await cropPng(browser, full, join(shots, "desktop-header-icon.png"), { x: icon.right - 48, y: head.top - 4, width: 52, height: head.height + 8 }, 6)
  }

  await p.hover("[data-header-search-categories]")
  await sleep(700)
  const tip = await p.evaluate(() => (document.querySelector("[data-categories-tooltip]") ? document.querySelector("[role=tooltip]")?.textContent.trim() : null) ?? null)
  expect(tip === "Categories", "hover shows Categories", tip)
  await shotTop(p, "desktop-header-tooltip.png", 1440, 160)

  await p.click("[data-header-search-categories]")
  await sleep(500)
  const panel = await p.evaluate(PANEL)
  expect(!!panel && Math.abs(panel.right - icon.right) <= 2 && panel.top >= icon.bottom && panel.rows.join() === "All categories,Design,Tech,Marketing", "it opens the same panel under it, lined up with its right edge", panel)
  await p.screenshot({ path: join(shots, "desktop-header-open.png") })
  const picked = await p.evaluate(async () => {
    const host = document.querySelector("[data-category-panel]")
    ;[...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Design")?.click()
    await new Promise((r) => setTimeout(r, 400))
    const inner = document.querySelector("[data-category-panel]")
    /* Design has subcategories: its level opens; "All Design" or the first row is the pick. */
    const row = inner && [...inner.querySelectorAll("button")].find((b) => /^All\b/.test(b.textContent.trim()) && /Design/.test(b.textContent))
    row?.click()
    await new Promise((r) => setTimeout(r, 800))
    const on = document.querySelector('[data-category-pills-row] [aria-pressed="true"]')
    return { open: !!document.querySelector("[data-category-panel]"), pressed: on?.textContent.trim() ?? null, replaced: (window.__router || []).filter(([k]) => k === "replace").map(([, h]) => h).slice(-1)[0] ?? null }
  })
  expect(!picked.open && /Design/.test(picked.pressed ?? ""), "a pick there is the page's pick: the panel closes, Design is pressed in the pill row", picked)

  expect(p.__errors.length === 0, "no errors", p.__errors.slice(0, 3))
  await p.close()
}

console.log("\ncomputer: the header's field with its search results open")
{
  /* A fresh page: after the pick above the list is shorter and the window may no longer be past the hero. */
  const p = await open(WIDE)
  await p.evaluate(() => scrollTo(0, 1400))
  await settle(700)
  await p.click(HEAD)
  await sleep(500)
  const modalOpen = await p.evaluate(() => document.querySelector("[data-header-search-modal]")?.getAttribute("data-state"))
  await shotTop(p, "desktop-header-focused.png", 1440, 160)
  const focused = await p.evaluate(LOOK(HEAD))
  await p.click("[data-header-search-categories]")
  await sleep(600)
  const after = await p.evaluate(() => ({ modal: document.querySelector("[data-header-search-modal]")?.getAttribute("data-state") ?? "gone", panel: !!document.querySelector("[data-category-panel]") }))
  expect(modalOpen === "open" && after.modal !== "open" && after.panel, "with the results open, pressing it closes them and opens the panel", { before: modalOpen, after })
  await p.keyboard.press("Escape")
  await sleep(400)

  /* Focused, both fields: the same darker hairline and deeper shadow. */
  await p.evaluate(() => scrollTo(0, 0))
  await settle(500)
  await p.focus(HERO)
  await settle(500)
  const heroFocused = await p.evaluate(LOOK(HERO))
  expect(focused.border === heroFocused.border && focused.shadow !== heroFocused.shadow, "focused, the same darker hairline; the bar's deeper shadow is its own size", { hero: [heroFocused.border, heroFocused.shadow], header: [focused.border, focused.shadow] })
  expect(p.__errors.length === 0, "no errors", p.__errors.slice(0, 3))
  await p.close()
}

console.log("\ncomputer: a page without Explore's hero")
{
  const p = await open(WIDE, "product")
  const head = await p.evaluate(LOOK(HEAD))
  const icon = await p.evaluate(ICON("[data-header-search-categories]"))
  expect(!!head && head.shown && head.radius === "10px 10px" && head.height === 44, "the field is there, with the hero's corner", head)
  expect(!icon, "no categories icon: this page has no menu to open")
  await shotTop(p, "desktop-product-header.png", 1440, 120)
  expect(p.__errors.length === 0, "no errors", p.__errors.slice(0, 3))
  await p.close()
}

console.log("\nphone")
{
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  /* A page with the Storelib header on a phone: its search is still the icon that opens the full screen search. */
  const q = await open(PHONE, "product")
  const search = await q.evaluate(() => [...document.querySelectorAll("#platform-header-root button, #platform-header-root a")].filter((b) => /search/i.test(b.getAttribute("aria-label") || "") && b.getBoundingClientRect().width > 0).map((b) => ({ label: b.getAttribute("aria-label"), w: Math.round(b.getBoundingClientRect().width) })))
  const deskQ = await q.evaluate(() => getComputedStyle(document.querySelector("#platform-header-root [data-header-search]")).display)
  expect(deskQ === "none", "the computer's field is not drawn in a phone's header", { deskQ })
  console.log(`  note  the phone header's own search controls here: ${JSON.stringify(search)} (not changed by this round)`)
  await shotTop(q, "phone-product-header.png", 390, 120)
  await q.close()
  const p = await open(PHONE)
  await p.evaluate(() => scrollTo(0, 1400))
  await settle(600)
  const desk = await p.evaluate(() => { const f = document.querySelector("#platform-header-root [data-header-search]"); return f ? getComputedStyle(f).display : null })
  const icon = await p.evaluate(ICON("[data-header-search-categories]"))
  expect(desk === "none" && (!icon || !icon.visible || icon.w === 0), "the computer's field and its icon are not drawn", { desk, icon })
  await p.screenshot({ path: join(shots, "phone-explore-scrolled.png") })
  await p.evaluate(() => scrollTo(0, 0))
  await settle(400)
  const heroIcon = await p.evaluate(ICON("[data-search-categories]"))
  expect(!!heroIcon && heroIcon.w === 40 && heroIcon.h === 40 && heroIcon.text === "", "the hero's icon is a 40px square on a phone", heroIcon)
  const uncutPhone = await p.evaluate(UNCUT)
  expect(!!uncutPhone && uncutPhone.clippers.length === 0 && uncutPhone.covers.length === 0, "ROUND 10: on a phone too, nothing clips or covers the field's depth", uncutPhone)
  await p.tap("[data-search-categories]")
  await sleep(700)
  expect(await p.evaluate(() => !!document.querySelector("[data-category-sheet]")), "and opens the sheet")
  await p.screenshot({ path: join(shots, "phone-hero-sheet.png") })
  const side = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }))
  expect(side.doc <= side.win && p.__errors.length === 0, "nothing sideways, no errors", { side, errors: p.__errors.slice(0, 3) })
  await p.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall good")
process.exit(broken ? 1 : 0)
