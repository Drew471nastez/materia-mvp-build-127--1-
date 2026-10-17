#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE SIDEBAR SWITCHED TO ANOTHER LANGUAGE, MEASURED
 * ===========================================================================
 * Round V8. The builder's sidebar for one section (scripts/render-
 * translation-switch-probe.tsx: the real hook, the theme editor's own
 * editing state, scope and translated field, and the rich text box) in
 * headless Chromium, against a
 * server that answers /api/store/translations as the real route does and
 * keeps every save it is sent. It reports what the controls show:
 *
 *   in English      the section's own words, nothing locked
 *   in French       French's values in the text controls, the English as
 *                   their placeholder and under them, Original changed where
 *                   the English changed after it was translated, the colour
 *                   and the padding the same in every language and out of
 *                   reach, the canvas in French
 *   typing          the canvas shows it before anything is saved, and the
 *                   save sent holds French and that one key only
 *   back in English the originals, as they were
 *
 *   node scripts/check-translation-switch.mjs
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

/* lib/markets/translate.ts sourceHash, the same FNV-1a. */
const hash = (text) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

const dir = mkdtempSync(join(tmpdir(), "storelib-translation-switch-"))
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-translation-switch-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"], { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${script}</script></body></html>`

/* French as the store saved it: the heading done, the text written for an older English (Outdated), the alt text not translated yet. */
const FR = {
  "section:s1:heading": { v: "Soldes de printemps", h: hash("Spring sale") },
  "section:s1:text": { v: "<p>Lin lavé.</p>", h: hash("<p>Linen.</p>") },
}
const saves = []

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" })
const results = []
let ok = true
const expect = (label, cond, got) => {
  results.push(`  ${cond ? "ok  " : "FAIL"}  ${label}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`)
  if (!cond) ok = false
}
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  await page.route("http://probe.test/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html })
    if (url.pathname === "/api/store/translations" && route.request().method() === "GET") {
      const locale = url.searchParams.get("locale")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ locale: locale ?? "en", defaultLanguage: "en", languages: ["en", "fr", "de"], published: ["fr"], values: locale === "fr" ? FR : {}, originals: [] }) })
    }
    if (url.pathname === "/api/store/translations" && route.request().method() === "PUT") {
      saves.push(JSON.parse(route.request().postData() ?? "{}"))
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ saved: 1, removed: 0 }) })
    }
    return route.fulfill({ status: 404, body: "" })
  })
  await page.goto("http://probe.test/")
  await page.waitForSelector("#wb-edit-language")

  const read = () =>
    page.evaluate(() => {
      const box = (id) => document.querySelector(`[data-translated-field="section:s1:${id}"] input, [data-setting="${id}"] input`)
      const rich = (id) => document.querySelector(`[data-translated-field="section:s1:${id}"] [contenteditable], [data-setting="${id}"] [contenteditable]`)
      const status = (id) => document.querySelector(`[data-translated-field="section:s1:${id}"]`)?.getAttribute("data-translation-state") ?? null
      return {
        language: document.querySelector("#wb-edit-language").value,
        heading: box("heading")?.value ?? null,
        headingPlaceholder: box("heading")?.getAttribute("placeholder") ?? null,
        headingStatus: status("heading"),
        text: rich("text")?.innerHTML ?? null,
        textStatus: status("text"),
        outdatedMarks: document.querySelectorAll('[data-translation-badge="outdated"]').length,
        alt: box("image_alt")?.value ?? null,
        altPlaceholder: box("image_alt")?.getAttribute("placeholder") ?? null,
        locked: [...document.querySelectorAll("[data-shared-setting]")].map((el) => el.querySelector("[data-probe-control]")?.getAttribute("data-probe-control") ?? el.querySelector("label")?.textContent),
        lockedOpacity: [...document.querySelectorAll("[data-shared-setting] [inert]")].map((el) => getComputedStyle(el).opacity),
        lockedInert: [...document.querySelectorAll("[data-shared-setting]")].every((el) => el.querySelector("[inert]")?.inert === true),
        originalLine: document.querySelector('[data-translated-field="section:s1:heading"] [data-translation-source]')?.textContent ?? null,
        canvasHeading: document.querySelector("[data-canvas-heading]").textContent,
        canvasText: document.querySelector("[data-canvas-text]").innerHTML,
        canvasAlt: document.querySelector("[data-canvas-image]").getAttribute("alt"),
        options: [...document.querySelectorAll("#wb-edit-language option")].map((o) => o.textContent),
      }
    })

  const en = await read()
  console.log("\nIn English (the original):", JSON.stringify(en, null, 1))
  expect("the switch offers the website's languages", en.options.join("|") === "en|fr|de", en.options)
  expect("English: the section's own words in the controls", en.heading === "Spring sale" && en.alt === "A folded apron", { heading: en.heading, alt: en.alt })
  expect("English: nothing locked", en.locked.length === 0, en.locked)

  await page.selectOption("#wb-edit-language", "fr")
  await page.waitForSelector('[data-translated-field="section:s1:heading"]')
  await page.waitForFunction(() => document.querySelector("[data-canvas-heading]")?.textContent === "Soldes de printemps", null, { timeout: 3000 }).catch(() => undefined)
  const fr = await read()
  console.log("\nIn French:", JSON.stringify(fr, null, 1))
  expect("French: the heading shows French's value, the merchant's own", fr.heading === "Soldes de printemps" && fr.headingStatus === "edited", { heading: fr.heading, status: fr.headingStatus })
  expect("French: the English as the placeholder and under the field", fr.headingPlaceholder === "Spring sale" && fr.originalLine === "English: Spring sale", { placeholder: fr.headingPlaceholder, line: fr.originalLine })
  expect("French: the text written for an older English reads Original changed, its translation kept", fr.textStatus === "outdated" && fr.outdatedMarks === 1 && /Lin lavé/.test(fr.text ?? ""), { status: fr.textStatus, marks: fr.outdatedMarks, text: fr.text })
  expect("French: the alt text has no translation yet, so an empty box with the English as its placeholder", fr.alt === "" && fr.altPlaceholder === "A folded apron", { alt: fr.alt, placeholder: fr.altPlaceholder })
  expect("French: the colour and the padding the same in every language, dimmed and inert", fr.locked.join() === "accent,padding" && fr.lockedOpacity.length === 2 && fr.lockedOpacity.every((o) => Number(o) < 0.6) && fr.lockedInert, { locked: fr.locked, opacity: fr.lockedOpacity })
  expect("French: the canvas in French, the alt text falling back to English", fr.canvasHeading === "Soldes de printemps" && fr.canvasAlt === "A folded apron", { heading: fr.canvasHeading, alt: fr.canvasAlt })

  const t0 = Date.now()
  await page.fill('[data-translated-field="section:s1:image_alt"] input', "Un tablier plié")
  const typed = await read()
  const instantMs = Date.now() - t0
  expect("typing: the canvas shows it before it is saved", typed.canvasAlt === "Un tablier plié" && saves.length === 0, { alt: typed.canvasAlt, savesSoFar: saves.length, ms: instantMs })
  await page.waitForTimeout(1400)
  const sent = saves.flatMap((s) => (s.items ?? []).map((i) => ({ locale: s.locale, key: i.key, value: i.value, source: i.source })))
  console.log("\nSaves sent:", JSON.stringify(sent))
  expect("the save holds French and that one key, with the English it was written for", sent.length === 1 && sent[0].locale === "fr" && sent[0].key === "section:s1:image_alt" && sent[0].value === "Un tablier plié" && sent[0].source === "A folded apron", sent)

  await page.selectOption("#wb-edit-language", "en")
  await page.waitForFunction(() => document.querySelector("[data-canvas-heading]")?.textContent === "Spring sale", null, { timeout: 3000 }).catch(() => undefined)
  const back = await read()
  console.log("\nBack in English:", JSON.stringify(back, null, 1))
  expect("back in English: the originals, as they were", back.heading === "Spring sale" && back.alt === "A folded apron" && back.text === "<p>Linen, washed soft.</p>" && back.locked.length === 0, { heading: back.heading, alt: back.alt, text: back.text, locked: back.locked })
  expect("back in English: the canvas in English", back.canvasHeading === "Spring sale" && back.canvasAlt === "A folded apron", { heading: back.canvasHeading, alt: back.canvasAlt })
  expect("no save touched English", !saves.some((s) => s.locale === "en"), saves.map((s) => s.locale))
} finally {
  await browser.close()
}
console.log("\n" + results.join("\n"))
if (!ok) fail("the sidebar does not do what it should in another language")
console.log("\nall measured")
