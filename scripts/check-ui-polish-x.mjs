#!/usr/bin/env node
/**
 * ===========================================================================
 *  ROUND X3, MEASURED: THE LOOK SWITCH, THE TOP BAR'S CHIP, COPY, TRANSLATIONS
 * ===========================================================================
 * The real components (scripts/render-ui-polish-x-probe.tsx) in headless
 * Chromium with the app's stylesheet and Website Settings' light sheet:
 *
 *   Website Settings   every subject, dark and light: the lowest contrast of
 *                      any visible words against what is really behind them
 *                      (4.5:1 for text, 3:1 for large text); and the switch:
 *                      it writes the shared choice and the screen follows it
 *   top bar            the language and currency chip against its two round
 *                      neighbours: height, words' size, contrast, and fill
 *   sidebar            the language row's height, the list fading in, and
 *                      nothing under the row moving when it opens
 *   chat               Copy under the creator's message: where it sits, hidden
 *                      until hover with a mouse, there on a touch screen, and
 *                      what reaches the clipboard
 *   translations       a product's card at 390 and 1280: a short list, no
 *                      fields, and one language's fields in the sheet
 *
 *   node scripts/check-ui-polish-x.mjs
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  ;({ chromium } = require(join(globalRoot, "playwright")))
}

const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), "storelib-ui-polish-x-"))
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-ui-polish-x-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"', "--define:process.env={}", `--alias:@=${root}`, "--loader:.css=empty"], { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
const css = `${await appCss(root)}\n${readFileSync(join(root, "app/website-settings-light.css"), "utf8")}`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${script}</script></body></html>`

/* https, so the page is a secure context and has the clipboard API (the request never leaves the browser: every one is answered below). */
const ORIGIN = "https://probe.local"
const VIEW = {
  ready: true,
  defaultLanguage: "en",
  languages: [
    { code: "fr", published: true },
    { code: "de", published: true },
    { code: "it", published: false },
  ],
  showOriginal: false,
  keepName: false,
  showOriginalReady: true,
  canTranslate: true,
  fields: [
    { field: "title", source: "Washed linen apron", rich: false },
    { field: "description", source: "<p>Soft from the first wear.</p>", rich: true },
    { field: "seo_title", source: "Linen apron", rich: false },
    { field: "seo_description", source: "A washed linen apron.", rich: false },
  ],
  values: {
    fr: { title: { value: "Tablier en lin", status: "done", ai: false }, description: { value: "<p>Doux.</p>", status: "done", ai: true }, seo_title: { value: "Tablier", status: "done", ai: false }, seo_description: { value: "Un tablier.", status: "done", ai: false } },
    de: { title: { value: "Leinenschürze", status: "outdated", ai: false } },
  },
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" })
const results = []
let ok = true
const expect = (label, cond, got) => {
  results.push(`  ${cond ? "ok  " : "FAIL"}  ${label}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`)
  if (!cond) ok = false
}

async function open({ hash, width = 1280, height = 860, look = null, touch = false }) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, permissions: ["clipboard-read", "clipboard-write"] })
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: html })
    if (url.pathname === "/api/store/translations/product") {
      if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VIEW) })
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "done" }) })
    }
    /* Connections reads these by shape: no notes yet, and no database connected (a plain error, as a store without one gets). */
    if (url.pathname === "/api/ai-memory") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ memories: [], ready: true }) })
    if (url.pathname.startsWith("/api/website-builder/supabase") || url.pathname.endsWith("/github")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Not set up yet." }) })
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    return route.fulfill({ status: 404, body: "" })
  })
  if (look) await context.addInitScript((v) => window.localStorage.setItem("storelib:appearance", v), look)
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.goto(`${ORIGIN}/#${hash}`)
  await page.waitForTimeout(500)
  return { page, context, errors }
}

/* ── Contrast of every visible word against what is really behind it ─────── */
const CONTRAST = () => {
  /* Any colour the browser writes (rgb, oklch, lab), read back as the pixel it paints. */
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  const parse = (c) => {
    if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "rgba(0,0,0,0)"
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: a / 255 }
  }
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const behind = (el) => {
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor)
      if (bg && bg.a > 0) {
        layers.push(bg)
        if (bg.a >= 1) break
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (const l of layers.reverse()) base = over(l, base)
    return base
  }
  const worst = []
  for (const el of document.querySelectorAll("[data-ws-look] *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || s.visibility !== "visible" || el.closest("[aria-hidden=true], [inert], [data-search-preview], [data-tab-preview]")) continue
    if (el.closest("button:disabled, [aria-disabled=true]")) continue
    let opacity = 1
    for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
    if (opacity < 0.05) continue
    const bg = behind(el)
    const fg0 = parse(s.color)
    const fg = over({ ...fg0, a: fg0.a * opacity }, bg)
    const L1 = lum(fg)
    const L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(s.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    worst.push({ ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, text: el.textContent.trim().slice(0, 40), color: s.color })
  }
  worst.sort((a, b) => a.ratio - b.ratio)
  return { count: worst.length, min: worst[0] ?? null, under: worst.filter((w) => w.ratio < w.need) }
}

const SECTIONS = ["general", "domains", "seo", "pages", "navigation", "commerce", "policies", "apps", "publishing", "performance", "backups", "connections"]

console.log("\nWebsite Settings, every subject, dark and light")
for (const look of ["dark", "light"]) {
  let lowest = null
  let measured = 0
  const under = []
  for (const s of SECTIONS) {
    const { page, context, errors } = await open({ hash: `settings=${s}`, look })
    const drawn = await page.evaluate(() => ({ look: document.querySelector("[data-ws-look]")?.getAttribute("data-ws-look"), words: document.querySelector("[data-settings-page]")?.textContent.trim().length ?? 0 }))
    if (drawn.look !== look || drawn.words < 10) expect(`${look} ${s} is drawn`, false, { ...drawn, errors })
    /* SHOTS=<dir>: a picture of each subject, for the review by eye. */
    if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `settings-${look}-${s}.png`) })
    const c = await page.evaluate(CONTRAST)
    measured += c.count
    if (c.min && (!lowest || c.min.ratio < lowest.ratio)) lowest = { ...c.min, section: s }
    for (const u of c.under) under.push({ section: s, ...u })
    await context.close()
  }
  results.push(`        ${look}: ${measured} text elements across ${SECTIONS.length} subjects, lowest ${lowest?.ratio}:1 (${lowest?.section}: "${lowest?.text}")`)
  expect(`${look}: no words under 4.5:1 (3:1 when large)`, under.length === 0, under.slice(0, 8))
}

{
  const { page, context } = await open({ hash: "settings=general" })
  const before = await page.evaluate(() => ({ look: document.querySelector("[data-ws-look]").getAttribute("data-ws-look"), stored: localStorage.getItem("storelib:appearance") }))
  expect("never chose: Website Settings is dark, as it was", before.look === "dark" && before.stored === null, before)
  await page.evaluate(() => {
    window.__swap = false
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-theme-swap")) window.__swap = true
    }).observe(document.documentElement, { attributes: true })
  })
  await page.click("[data-ws-look-switch]")
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({ look: document.querySelector("[data-ws-look]").getAttribute("data-ws-look"), stored: localStorage.getItem("storelib:appearance"), swap: window.__swap, pressed: document.querySelector("[data-ws-look-switch]").getAttribute("aria-pressed"), page: getComputedStyle(document.querySelector("[data-settings-page]")).backgroundColor }))
  expect("the switch writes the shared choice and the screen follows it", after.look === "light" && after.stored === "light" && after.pressed === "false", after)
  expect("  through the one fade every look change uses (a View Transition)", after.swap === true)
  expect("  the light page is /app's #f8f9fa", after.page === "rgb(248, 249, 250)", after.page)
  await page.keyboard.press("Tab")
  await context.close()
}

console.log("\nThe top bar's language and currency chip")
{
  const { page, context } = await open({ hash: "topbar" })
  const m = await page.evaluate(() => {
    /* Any colour the browser writes (rgb, oklab), read back as the pixel it paints: [r, g, b, a]. */
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    const parse = (c) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "rgba(0,0,0,0)"
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bar = parse(getComputedStyle(document.querySelector("[data-probe-bar]")).backgroundColor)
    const ratio = (c) => {
      const [r, g, b, a = 1] = parse(c)
      const fg = [r * a + bar[0] * (1 - a), g * a + bar[1] * (1 - a), b * a + bar[2] * (1 - a)]
      const [l1, l2] = [lum(fg), lum(bar)]
      return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
    }
    const chip = document.querySelector("[data-preview-locale]")
    const n = document.querySelector("[data-probe-neighbour=size]")
    const cs = getComputedStyle(chip)
    const ns = getComputedStyle(n)
    const words = chip.querySelector("span")
    return {
      chip: { h: chip.getBoundingClientRect().height, w: Math.round(chip.getBoundingClientRect().width), font: parseFloat(getComputedStyle(words).fontSize), contrast: ratio(cs.color), fill: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius },
      neighbour: { h: n.getBoundingClientRect().height, contrast: ratio(ns.color), fill: ns.backgroundColor },
      centre: Math.abs(chip.getBoundingClientRect().top + chip.getBoundingClientRect().height / 2 - (n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2)),
    }
  })
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, "topbar.png"), clip: { x: 400, y: 0, width: 480, height: 56 } })
  results.push(`        chip ${m.chip.w}x${m.chip.h}px, words ${m.chip.font}px at ${m.chip.contrast}:1, fill ${m.chip.fill}; neighbours ${m.neighbour.h}px at ${m.neighbour.contrast}:1`)
  expect("the chip is the neighbours' height and on their centre line", m.chip.h === m.neighbour.h && m.centre < 0.5, m)
  expect("  no box at rest: no fill, no edge, fully round", /rgba\(0, 0, 0, 0\)|transparent/.test(m.chip.fill) && m.chip.border === "0px" && parseFloat(m.chip.radius) >= 16, m.chip)
  expect("  quieter than the neighbours' icons and still 4.5:1 on the bar", m.chip.contrast < m.neighbour.contrast && m.chip.contrast >= 4.5, { chip: m.chip.contrast, neighbour: m.neighbour.contrast })
  expect("  words of 11px", m.chip.font === 11, m.chip.font)
  await page.click("[data-preview-locale]")
  const frames = await page.evaluate(
    () =>
      new Promise((done) => {
        const out = []
        const step = () => {
          const p = document.querySelector("[data-preview-locale-menu]")?.closest(".wb-pages-menu")
          out.push(p ? Number(getComputedStyle(p).opacity) : -1)
          if (out.length < 14) requestAnimationFrame(step)
          else done(out)
        }
        step()
      }),
  )
  expect("the list fades in (it appeared at once)", frames[0] < 0.9 && frames[frames.length - 1] === 1, frames.map((f) => Math.round(f * 100) / 100))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(250)
  const closed = await page.evaluate(() => ({ state: document.querySelector(".wb-pages-menu")?.getAttribute("data-state"), focus: document.activeElement?.hasAttribute("data-preview-locale") }))
  expect("  Escape closes it and gives focus back to the chip", closed.state === "closed" && closed.focus, closed)
  await context.close()
}

console.log("\nThe sidebar's language row")
for (const width of [1280, 390]) {
  const { page, context } = await open({ hash: "sidebar", width, touch: width < 640 })
  const before = await page.evaluate(() => {
    const t = document.querySelector("[data-wb-locale-trigger]")
    const s = getComputedStyle(t)
    return { h: t.getBoundingClientRect().height, fill: s.backgroundColor, shadow: s.boxShadow, after: document.querySelector("[data-probe-after]").getBoundingClientRect().top }
  })
  expect(`${width}: a quiet row, no box at rest (it was a white card with a shadow)`, /rgba\(0, 0, 0, 0\)|transparent/.test(before.fill) && before.shadow === "none", before)
  expect(`  ${width < 640 ? "44px for a thumb" : "32px"} tall`, before.h === (width < 640 ? 44 : 32), before.h)
  await page.click("[data-wb-locale-trigger]")
  const frames = await page.evaluate(
    () =>
      new Promise((done) => {
        const out = []
        const step = () => {
          const p = document.querySelector("[data-preview-locale-menu]")?.closest(".wb-pages-menu")
          out.push({ o: p ? Math.round(Number(getComputedStyle(p).opacity) * 100) / 100 : -1, after: document.querySelector("[data-probe-after]").getBoundingClientRect().top })
          if (out.length < 14) requestAnimationFrame(step)
          else done(out)
        }
        step()
      }),
  )
  expect(`  ${width}: the list fades in`, frames[0].o < 0.9 && frames[frames.length - 1].o === 1, frames.map((f) => f.o))
  expect(`  ${width}: nothing under the row moves while it opens`, frames.every((f) => f.after === before.after), frames.map((f) => f.after))
  await context.close()
}

console.log("\nCopy under the creator's message")
{
  const { page, context } = await open({ hash: "chat" })
  const at = await page.evaluate(() => {
    const b = document.querySelector("[data-ask-prompt]").getBoundingClientRect()
    const c = document.querySelector("[data-ask-prompt-copy]").getBoundingClientRect()
    return { bubbleRight: b.right, copyRight: c.right, gap: Math.round(c.top - b.bottom), size: c.width, opacity: Number(getComputedStyle(document.querySelector("[data-ask-prompt-actions]")).opacity) }
  })
  results.push(`        under the bubble by ${at.gap}px, right edges ${at.bubbleRight} and ${at.copyRight}, ${at.size}px`)
  expect("under the bubble, on its right edge, the answer's 28px button", Math.abs(at.bubbleRight - at.copyRight) < 1 && at.gap >= 0 && at.gap <= 6 && at.size === 28, at)
  expect("  hidden at rest with a mouse", at.opacity === 0, at.opacity)
  await page.hover("[data-ask-prompt]")
  await page.waitForTimeout(250)
  expect("  shown while the message is under the pointer", (await page.evaluate(() => Number(getComputedStyle(document.querySelector("[data-ask-prompt-actions]")).opacity))) === 1)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(250)
  await page.keyboard.press("Tab")
  await page.waitForTimeout(250)
  const kb = await page.evaluate(() => ({ focused: document.activeElement?.hasAttribute("data-ask-prompt-copy"), opacity: Number(getComputedStyle(document.querySelector("[data-ask-prompt-actions]")).opacity) }))
  expect("  reached by Tab, and shown while it has focus", kb.focused && kb.opacity === 1, kb)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(200)
  const copied = await page.evaluate(async () => ({ clip: await navigator.clipboard.readText(), said: document.querySelector("[data-ask-copied]")?.textContent, label: document.querySelector("[data-ask-prompt-copy]").getAttribute("aria-label") }))
  const want = await page.evaluate(() => document.querySelector("[data-ask-prompt]").textContent)
  expect("  Enter copies the message exactly, spaces and line break included", copied.clip === want && want.includes("\n") && want.includes("  "), { clip: copied.clip })
  expect("  and says Copied", copied.said === "Copied" && copied.label === "Copied", copied)
  await context.close()
}
{
  const { page, context } = await open({ hash: "chat=phone", width: 390, touch: true })
  const phone = await page.evaluate(() => ({ opacity: Number(getComputedStyle(document.querySelector("[data-ask-prompt-actions]")).opacity), size: document.querySelector("[data-ask-prompt-copy]").getBoundingClientRect().width }))
  expect("on a touch screen it is always there, 36px with a 44px press area", phone.opacity === 1 && phone.size === 36, phone)
  await context.close()
}

console.log("\nA product's Translations card")
for (const width of [390, 1280]) {
  const { page, context, errors } = await open({ hash: "translations", width, touch: width < 640 })
  await page.waitForSelector("[data-product-translations]")
  const card = await page.evaluate(() => {
    const c = document.querySelector("[data-product-translations]")
    return {
      h: Math.round(c.getBoundingClientRect().height),
      fields: c.querySelectorAll("input, textarea, [contenteditable]").length,
      rows: [...c.querySelectorAll("[data-product-translation-language]")].map((r) => r.textContent.trim()),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `translations-${width}.png`) })
  results.push(`        ${width}: card ${card.h}px tall, rows ${JSON.stringify(card.rows)}`)
  expect(`${width}: one short list, no fields in the form`, card.fields === 0 && card.rows.length === 3 && card.h <= 340, card)
  expect(`  ${width}: each language says how far along it is`, /Translated/.test(card.rows[0]) && /Outdated/.test(card.rows[1]) && /Not translated/.test(card.rows[2]), card.rows)
  expect(`  ${width}: no sideways scroll`, !card.overflow)
  await page.click("[data-product-translation-language=de]")
  await page.waitForSelector("[data-product-translation-sheet=de]")
  await page.waitForTimeout(500)
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `translations-sheet-${width}.png`) })
  const sheet = await page.evaluate(() => {
    const s = document.querySelector("[data-product-translation-sheet]")
    const r = s.getBoundingClientRect()
    return {
      fields: s.querySelectorAll("input, textarea, [contenteditable=true]").length,
      outdated: s.querySelector("[data-product-translation=title]")?.getAttribute("data-translation-status"),
      auto: !!s.querySelector("[data-product-translate-auto]"),
      inView: r.left >= 0 && r.right <= window.innerWidth + 0.5,
      width: Math.round(r.width),
    }
  })
  expect(`  ${width}: one language's fields, Outdated marked, Translate automatically there`, sheet.fields === 4 && sheet.outdated === "outdated" && sheet.auto && sheet.inView, sheet)
  await page.click("[data-product-translation-done]")
  await page.waitForTimeout(500)
  expect(`  ${width}: Done closes it`, (await page.evaluate(() => !document.querySelector("[data-product-translation-sheet]"))) === true)
  expect(`  ${width}: no errors`, errors.length === 0, errors)
  await context.close()
}

await browser.close()
console.log(results.join("\n"))
console.log(ok ? "\nall measured as described\n" : "\nSOMETHING IS NOT AS DESCRIBED\n")
process.exit(ok ? 0 : 1)
