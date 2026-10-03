/**
 * ===========================================================================
 *  WEBSITE SETTINGS: NAVIGATION, PAGES AND POLICIES, MEASURED
 * ===========================================================================
 * scripts/render-settings-polish.tsx mounts the real Website Settings on each
 * subject, at 390 wide with touch and at 1280 with a mouse:
 *
 *   NAVIGATION  the header's links and the menus as compact rows: 36px and
 *               13px type on a computer, 44px and 15px on a phone; nothing
 *               scrolls sideways; every target a thumb presses is 44px.
 *   MOTION      a row opens by its own height over about 200ms: the rows
 *               under it are carried down frame by frame, not jumped; with
 *               reduced motion it opens at once. A switch's knob slides on
 *               transform.
 *   PAGES       one line a page, the search result opening in place the
 *               same way.
 *   POLICIES    a card a policy; the rich text field at 15px (16px on a
 *               phone, so iOS does not zoom), 44px toolbar buttons on a
 *               phone, a toolbar that sticks under the Back bar while the
 *               policy scrolls; typing saves a draft through the sections
 *               route; Use template fills an empty policy and creates the
 *               shipping page.
 *
 *   node scripts/check-settings-polish.mjs      (PROBE_CSS=source without a build)
 *
 * Screenshots go to SHOTS_DIR, or a temporary folder.
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
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = (await appCss(root)) + "\n" + interFaces(root)

const out = mkdtempSync(join(tmpdir(), "storelib-settings-polish-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".settings-polish-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
try {
  execFileSync(
    "npx",
    [
      "--no-install", "esbuild", join(root, "scripts/render-settings-polish.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const page = (mouse) =>
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  /* Tailwind's hover: sits in @media (hover: hover), which headless answers no; a computer with a mouse answers yes. */
  `<style>${mouse ? css.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)/g, "@media all") : css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__errors=[];window.addEventListener("error",function(e){window.__errors.push(String(e.message))})</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(req.url.includes("mouse=1")))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const mouseBrowser = await puppeteer.launch({
  executablePath: CHROMIUM,
  defaultViewport: null,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
})

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(phone, section, { reduced = false } = {}) {
  const p = phone ? await browser.newPage() : await mouseBrowser.newPage()
  if (phone) await p.setViewport(PHONE)
  if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.goto(`${origin}/?section=${section}${phone ? "" : "&mouse=1"}`, { waitUntil: "load" })
  await p.waitForSelector("[role=dialog][aria-label='Website settings']")
  await sleep(500)
  return p
}

/** Sideways scroll anywhere: the document, the page, any scroller in it. */
const sideways = (p) => p.evaluate(() => {
  const main = document.querySelector("[data-settings-page]")
  return { doc: document.documentElement.scrollWidth - innerWidth, main: main.scrollWidth - main.clientWidth }
})

/** Every control in the open subject a thumb can press, smaller than 44px in either direction (a ::after band counts). */
const smallTargets = (p, picker = false) => p.evaluate((picker) => {
  const main = document.querySelector("[data-settings-page]")
  return [...main.querySelectorAll("button, a[href], input:not([type=hidden]), select, [contenteditable=true]")]
    .filter((e) => {
      const r = e.getBoundingClientRect()
      if (!r.width || !r.height || getComputedStyle(e).visibility === "hidden" || e.closest("[inert]")) return false
      /* The link picker is drawn by its own component (components/website-builder/link-picker.tsx) and measured on its own. */
      if (!!e.closest("[data-link-picker]") !== picker) return false
      return !e.matches(".sr-only") || !!e.closest("label")
    })
    .map((e) => {
      const host = e.matches(".sr-only") ? e.closest("label") : e
      const r = host.getBoundingClientRect()
      const after = getComputedStyle(host, "::after")
      let h = r.height
      let w = r.width
      if (after.content !== "none" && after.position === "absolute") {
        h = Math.max(h, r.height - parseFloat(after.top) - parseFloat(after.bottom))
        w = Math.max(w, r.width - parseFloat(after.left) - parseFloat(after.right))
      }
      return { what: (host.getAttribute("aria-label") || host.textContent || host.tagName).trim().slice(0, 30), h: Math.round(h), w: Math.round(w) }
    })
    .filter((t) => t.h < 44 || t.w < 44)
}, picker)

/**
 * A row opening, watched frame by frame: the top of what is under it, read
 * on every animation frame for 320ms after the press.
 */
async function watchOpen(p, pressSel, belowSel) {
  await p.evaluate((pressSel, belowSel) => {
    window.__track = []
    const below = document.querySelector(belowSel)
    const t0 = performance.now()
    const tick = () => {
      window.__track.push({ t: Math.round(performance.now() - t0), y: below.getBoundingClientRect().top })
      if (performance.now() - t0 < 320) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector(pressSel).click()
  }, pressSel, belowSel)
  await sleep(420)
  const track = await p.evaluate(() => window.__track)
  const start = track[0].y
  const end = track[track.length - 1].y
  const total = end - start
  const steps = track.slice(1).map((s, i) => s.y - track[i].y)
  const moving = track.filter((s) => s.y !== start && s.y !== end).length
  const settledAt = track.find((s) => Math.abs(s.y - end) < 0.5)?.t ?? null
  return { total: Math.round(total), moving, biggest: Math.round(Math.max(...steps)), settledAt, monotonic: steps.every((d) => d >= -0.5) }
}

/* ── Navigation ─────────────────────────────────────────────────────── */
for (const phone of [true, false]) {
  const label = phone ? "phone-390" : "desktop-1280"
  console.log(`\nnavigation, ${label}`)
  const p = await open(phone, "navigation")
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-nav-header-links] [data-link-row] > div > div:first-child")].map((b) => Math.round(b.getBoundingClientRect().height)))
  const font = await p.$eval("[data-nav-header-links] [data-link-label]", (e) => parseFloat(getComputedStyle(e).fontSize))
  expect(rows.length === 6 && rows.every((h) => h === (phone ? 44 : 36)), `every link row is ${phone ? 44 : 36}px`, rows)
  expect(font === (phone ? 15 : 13), `a link's name is ${phone ? 15 : 13}px`, font)
  const indent = await p.evaluate(() => {
    const kid = document.querySelector('[data-link-row="prints"] [data-link-grip]').getBoundingClientRect().left
    const parent = document.querySelector('[data-link-row="shop"] [data-link-grip]').getBoundingClientRect().left
    return Math.round(kid - parent)
  })
  expect(indent === 20, "a sub-link is one 20px step in", indent)
  const menuRow = await p.$eval("[data-menu-row] > button", (b) => Math.round(b.getBoundingClientRect().height))
  expect(menuRow === (phone ? 44 : 36), "a menu is a row of the same height", menuRow)
  expect((await sideways(p)).doc <= 0 && (await sideways(p)).main <= 0, "nothing scrolls sideways", await sideways(p))
  if (phone) expect((await smallTargets(p)).length === 0, "every target is 44px or more", await smallTargets(p))

  const move = await watchOpen(p, '[data-link-row="about"] [aria-expanded]', '[data-link-row="contact"]')
  expect(move.total > 100 && move.moving >= 6 && move.monotonic && move.biggest < move.total * 0.35, "opening a link carries the rows under it down, frame by frame", move)
  expect(move.settledAt !== null && move.settledAt >= 150 && move.settledAt <= 280, "and lands in about 200ms", move.settledAt)
  if (phone) {
    expect((await smallTargets(p)).length === 0, "opened, its fields and actions are 44px too", await smallTargets(p))
    /* Said, not judged: the picker is its own component, restyled elsewhere. */
    console.log(`  note  the link picker's own controls under 44px on a phone: ${JSON.stringify(await smallTargets(p, true))}`)
  }
  await p.screenshot({ path: join(shots, `navigation-${label}.png`), fullPage: false })
  await p.$eval("[data-menu-row] > button", (b) => b.scrollIntoView({ block: "center" }))
  await p.click("[data-menu-row] > button")
  await sleep(350)
  const menuRows = await p.evaluate(() => [...document.querySelectorAll("[data-nav-menus] [data-link-row] > div > div:first-child")].map((b) => Math.round(b.getBoundingClientRect().height)))
  expect(menuRows.length === 3 && menuRows.every((h) => h === (phone ? 44 : 36)), "a menu's links are the same rows as the header's", menuRows)
  expect((await sideways(p)).main <= 0, "still nothing sideways with a menu open", await sideways(p))
  await p.screenshot({ path: join(shots, `navigation-menus-${label}.png`), fullPage: false })
  const errs = await p.evaluate(() => window.__errors)
  expect(errs.length === 0, "no errors", errs)
  await p.close()
}

{
  console.log("\nnavigation, reduced motion")
  const p = await open(true, "navigation", { reduced: true })
  const move = await watchOpen(p, '[data-link-row="about"] [aria-expanded]', '[data-link-row="contact"]')
  expect(move.total > 100 && move.moving <= 1, "with reduced motion the row opens at once", move)
  await p.close()
}

/* ── Pages ──────────────────────────────────────────────────────────── */
for (const phone of [true, false]) {
  const label = phone ? "phone-390" : "desktop-1280"
  console.log(`\npages, ${label}`)
  const p = await open(phone, "pages")
  expect((await sideways(p)).doc <= 0 && (await sideways(p)).main <= 0, "nothing scrolls sideways, a long page name included", await sideways(p))
  const lines = await p.evaluate(() => [...document.querySelectorAll("[data-page-row] > div:first-child")].map((r) => Math.round(r.getBoundingClientRect().height)))
  expect(lines.every((h) => h >= 60 && h <= 72), "one line a page, its Edit beside it", lines)
  if (phone) expect((await smallTargets(p)).length === 0, "every target is 44px or more", await smallTargets(p))
  const move = await watchOpen(p, "button[aria-controls='wb-page-seo-about']", '[data-page-row="contact"]')
  expect(move.total > 150 && move.moving >= 6 && move.monotonic && move.biggest < move.total * 0.35, "a page's search result opens in place, carried frame by frame", move)
  /* The switch: its knob slides on transform. */
  const knob = "#wb-page-seo-about [data-toggle-knob]"
  const before = await p.$eval(knob, (k) => ({ m: (getComputedStyle(k).translate === "none" ? 0 : parseFloat(getComputedStyle(k).translate.split(" ")[0])), tp: getComputedStyle(k).transitionProperty, td: getComputedStyle(k).transitionDuration, w: k.parentElement.getBoundingClientRect().width, h: k.parentElement.getBoundingClientRect().height }))
  await p.$eval("#wb-page-seo-about input[type=checkbox]", (c) => c.click())
  await sleep(90)
  const midX = await p.$eval(knob, (k) => (getComputedStyle(k).translate === "none" ? 0 : parseFloat(getComputedStyle(k).translate.split(" ")[0])))
  await sleep(300)
  const endX = await p.$eval(knob, (k) => (getComputedStyle(k).translate === "none" ? 0 : parseFloat(getComputedStyle(k).translate.split(" ")[0])))
  expect(before.w === 38 && before.h === 22 && /translate/.test(before.tp) && before.td.startsWith("0.2s"), "the switch is the app's one switch: 38 by 22, 200ms on its translate", before)
  expect(before.m === 16 && midX > 0 && midX < 16 && endX === 0, "its knob slides, part way at 90ms", { before: before.m, midX, endX })
  await p.screenshot({ path: join(shots, `pages-${label}.png`), fullPage: false })
  await p.close()
}

/* ── Policies ───────────────────────────────────────────────────────── */
for (const phone of [true, false]) {
  const label = phone ? "phone-390" : "desktop-1280"
  console.log(`\npolicies, ${label}`)
  const p = await open(phone, "policies")
  const cards = await p.evaluate(() => [...document.querySelectorAll("[data-policy]")].map((c) => ({
    title: c.querySelector("h2").textContent,
    status: c.querySelector("[data-policy-status]").textContent,
    template: !!c.querySelector("[data-policy-template]"),
  })))
  expect(cards.map((c) => c.title).join("|") === "Refund Policy|Privacy Policy|Terms Of Service|Shipping Policy", "a card a policy, shipping last", cards.map((c) => c.title))
  expect(/^Edited/.test(cards[0].status) && /placeholders to fill in/.test(cards[0].status), "a card says when it was edited and what is left to fill in", cards[0].status)
  expect(cards[1].template && !cards[0].template, "Use template only where the policy is empty", cards.map((c) => c.template))
  expect(cards[3].status === "Not on your site yet" && cards[3].template, "shipping is offered, not made", cards[3])
  expect((await sideways(p)).doc <= 0 && (await sideways(p)).main <= 0, "nothing scrolls sideways", await sideways(p))
  if (phone) expect((await smallTargets(p)).length === 0, "every target is 44px or more", await smallTargets(p))

  /* Open the refund policy. */
  await p.click('[data-policy="refund-policy"] [data-policy-edit]')
  await sleep(350)
  const field = await p.evaluate(() => {
    const ed = document.querySelector('[data-policy-editor="refund-policy"] [contenteditable]')
    const buttons = [...document.querySelectorAll('[data-policy-editor="refund-policy"] [data-rich-text-bar] button[aria-pressed]')]
    return {
      font: parseFloat(getComputedStyle(ed).fontSize),
      labels: buttons.map((b) => b.getAttribute("aria-label")),
      sizes: [...new Set(buttons.map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`))],
      maxH: getComputedStyle(ed).maxHeight,
    }
  })
  expect(field.font === (phone ? 16 : 15), `the policy is written at ${phone ? "16px, so iOS does not zoom" : "15px"}`, field.font)
  expect(field.labels.join() === "Heading 2,Heading 3,Bold,Italic,Link,Bulleted list,Numbered list,Quote", "the toolbar: H2, H3, bold, italic, link, two lists, quote", field.labels)
  expect(field.sizes.join() === (phone ? "44x44" : "32x32"), `toolbar buttons are ${phone ? 44 : 32}px`, field.sizes)
  expect(field.maxH === "none", "the field has no ceiling: it grows and the page scrolls", field.maxH)
  expect((await sideways(p)).doc <= 0 && (await sideways(p)).main <= 0, "open, still nothing sideways", await sideways(p))
  /* A card clips, so the page not scrolling sideways is not enough: the field has to fit inside its card. */
  const fit = await p.evaluate(() => {
    const card = document.querySelector('[data-policy="refund-policy"]').closest("section").getBoundingClientRect()
    const box = document.querySelector('[data-policy-editor="refund-policy"] [data-builder-rich-text]').getBoundingClientRect()
    const row = document.querySelector('[data-policy-editor="refund-policy"] [data-rich-text-bar] [data-fade]')
    return { cardRight: Math.round(card.right), boxRight: Math.round(box.right), rowScrolls: row ? row.scrollWidth > row.clientWidth : null }
  })
  expect(fit.boxRight <= fit.cardRight - 16, "the field sits inside its card, with the card's padding", fit)
  if (phone) expect(fit.rowScrolls === true, "on a phone the toolbar scrolls sideways inside itself instead", fit.rowScrolls)

  /* Scroll the policy under the top: the toolbar stays. */
  const stuck = await p.evaluate(async () => {
    const main = document.querySelector("[data-settings-page]")
    const ed = document.querySelector('[data-policy-editor="refund-policy"] [contenteditable]')
    const bar = document.querySelector('[data-policy-editor="refund-policy"] [data-rich-text-bar]')
    main.scrollTop += ed.getBoundingClientRect().top - main.getBoundingClientRect().top + 400
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const back = document.querySelector("[data-settings-bar]")
    const backBottom = back && getComputedStyle(back).display !== "none" ? back.getBoundingClientRect().bottom : main.getBoundingClientRect().top
    return { bar: Math.round(bar.getBoundingClientRect().top), under: Math.round(backBottom), edTop: Math.round(ed.getBoundingClientRect().top) }
  })
  expect(stuck.edTop < stuck.under && stuck.bar === stuck.under, "scrolled into a long policy, the toolbar stays under the top bar", stuck)
  await p.screenshot({ path: join(shots, `policies-sticky-${label}.png`), fullPage: false })

  /* Type: a draft is saved through the sections route. */
  const puts = () => p.evaluate(() => window.__puts.length)
  const before = await puts()
  await p.evaluate(() => {
    const ed = document.querySelector('[data-policy-editor="refund-policy"] [contenteditable]')
    ed.scrollIntoView({ block: "center" })
    ed.focus()
    const sel = getSelection()
    sel.selectAllChildren(ed.querySelector("h3"))
    sel.collapseToEnd()
  })
  await p.keyboard.type(" and exchanges")
  await sleep(250)
  expect((await puts()) === before, "nothing is saved while typing", await puts())
  await sleep(800)
  const saved = await p.evaluate(() => {
    const last = window.__puts[window.__puts.length - 1]
    const body = last?.sections.find((s) => s.type === "rich_text")?.settings.body ?? ""
    return { key: last?.page_key, types: last?.sections.map((s) => s.type).join(), has: /Returns(&nbsp;| |\u00a0)and exchanges/.test(body), h3: (body.match(/<h3>[^<]*<\/h3>/) || [""])[0], status: document.querySelector('[data-policy-editor="refund-policy"] [data-policy-save]').textContent }
  })
  expect(saved.key === "refund-policy" && saved.types === "header,rich_text,footer" && saved.has, "a pause, then one draft save of the page, its header and footer kept", saved)
  expect(/Saved to your draft/.test(saved.status), "and the card says so", saved.status)

  /* Bold and H2 from the toolbar. */
  await p.evaluate(() => {
    const ed = document.querySelector('[data-policy-editor="refund-policy"] [contenteditable]')
    const sel = getSelection()
    sel.selectAllChildren(ed.querySelectorAll("p")[1])
  })
  const press = (name) => p.$eval(`[data-policy-editor="refund-policy"] [data-rich-text-bar] button[aria-label="${name}"]`, (b) => b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })))
  await press("Bold")
  await press("Heading 2")
  await sleep(900)
  const formatted = await p.evaluate(() => {
    const last = window.__puts[window.__puts.length - 1]
    const body = last.sections.find((s) => s.type === "rich_text").settings.body
    return { bold: /<(b|strong)>/.test(body), h2: /<h2>/.test(body), pressed: document.querySelector('[data-policy-editor="refund-policy"] button[aria-label="Heading 2"]').getAttribute("aria-pressed") }
  })
  expect(formatted.bold && formatted.h2 && formatted.pressed === "true", "Bold and Heading 2 format the selection, and H2 is lit", formatted)

  /* Use template, on the empty privacy policy and on shipping. */
  await p.$eval('[data-policy="privacy-policy"] [data-policy-template]', (b) => b.click())
  await sleep(500)
  const privacy = await p.evaluate(() => {
    const last = window.__puts.filter((x) => x.page_key === "privacy-policy").pop()
    const body = last?.sections.find((s) => s.type === "rich_text")?.settings.body ?? ""
    return { saved: /What we collect/.test(body), open: document.querySelector('[data-policy="privacy-policy"] [data-policy-edit]').getAttribute("aria-expanded"), template: !!document.querySelector('[data-policy="privacy-policy"] [data-policy-template]') }
  })
  expect(privacy.saved && privacy.open === "true" && !privacy.template, "Use template fills the empty policy, saves it, opens it, and goes away", privacy)
  await p.$eval('[data-policy="shipping-policy"] [data-policy-template]', (b) => b.click())
  await sleep(500)
  const ship = await p.evaluate(() => {
    const last = window.__puts.filter((x) => x.page_key === "shipping-policy").pop()
    return {
      types: last?.sections.map((s) => s.type).join(),
      words: /Where we ship/.test(last?.sections.find((s) => s.type === "rich_text")?.settings.body ?? ""),
      told: window.__saved.includes("shipping-policy"),
      status: document.querySelector('[data-policy="shipping-policy"] [data-policy-status]').textContent,
    }
  })
  expect(ship.types === "header,rich_text,footer" && ship.words && ship.told, "on shipping it makes the page, with the site's header and footer, and tells the builder", ship)
  expect(/^Edited today/.test(ship.status), "and the card says it was edited today", ship.status)
  expect((await sideways(p)).main <= 0, "with three editors open, nothing sideways", await sideways(p))
  if (phone) expect((await smallTargets(p)).length === 0, "and every target is still 44px", await smallTargets(p))
  await p.evaluate(() => document.querySelector("[data-settings-page]").scrollTo({ top: 0 }))
  await sleep(100)
  await p.screenshot({ path: join(shots, `policies-${label}.png`), fullPage: false })
  const errs = await p.evaluate(() => window.__errors)
  expect(errs.length === 0, "no errors", errs)
  await p.close()
}

await browser.close()
await mouseBrowser.close()
server.close()
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
