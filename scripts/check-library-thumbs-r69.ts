/**
 * ===========================================================================
 *  EVERY CARD IN ADD A SECTION, EVERY THEME: NO BROKEN PICTURE (round 69)
 * ===========================================================================
 *   npx tsx scripts/check-library-thumbs-r69.ts
 *     TEMPLATES=digital,rail     which Materia templates (default: every one)
 *     MODE=library|canvas        which address rules the theme is made with:
 *                                the library's cards (compat-section-preview)
 *                                or the canvas and live site (compat-canvas,
 *                                compat-site). Default: both.
 *     OUT=<file>                 the counts as JSON
 *     SHOTS=<dir>                a screenshot of each card that is not clean
 *
 * The owner (round 69, digital products theme): in Add a section, "Hero
 * Benefits" and a lookbook ("See it worn, then make it yours") showed broken
 * image icons on grey boxes instead of the theme's placeholder, and the same
 * once added. This draws every preset of every section of every Materia
 * template exactly as a card does (sheetDocument + sectionMarkup, the theme
 * made with the library's own address rules), all in one document per
 * template as the library's sheet holds them, loads it in Chromium with every
 * picture eager, and counts:
 *
 *   broken   a visible <img> that finished loading with no picture
 *            (naturalWidth 0): the browser's broken image icon
 *   empty    a visible <img> with no src at all, or an src of "" or "#"
 *   blank    a card whose section draws nothing: no box taller than 8px with
 *            a picture, a field or words in it
 *   words    a card that shows a Liquid error, a missing translation or a
 *            tag left in its text
 *
 * Exits 1 when any card of any theme is broken, empty or shows broken words.
 */
import { mkdirSync, readdirSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { importTemplate, serve, type ImportedTemplate } from "./theme-templates/site"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { assetAddresses, templateOfPage } from "../lib/storelib-theme/compat/install"
import type { CompatPage, CompatTheme } from "../lib/storelib-theme/compat/theme"
import { sheetDocument, sectionMarkup, previewSectionFor, libraryThemeOptions } from "../components/website-builder/compat/compat-section-preview"
import type { SectionSchema } from "../lib/website-builder/types"
import { siteFor } from "./theme-templates/site"
import { shopImageName } from "../lib/website-builder/picture-address"

const ROOT = "theme-packages/materia/templates"
const ALL = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "config")))
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : ALL
const MODES = (process.env.MODE ?? "library,canvas").split(",") as ("library" | "canvas")[]
const WIDTH = 1200
const HEIGHT = 800

const page: CompatPage = {
  template: templateOfPage("home").template,
  path: "/",
  designMode: true,
  host: "",
  products: [],
  collections: [],
  menus: {},
  shop: { name: "My store", currency: "USD", moneyFormat: "${{amount}}" },
  product: null,
  collection: null,
  search: null,
  pageObject: null,
  groups: { header: [], footer: [] },
} as unknown as CompatPage

function themeFor(t: ImportedTemplate, mode: "library" | "canvas"): CompatTheme {
  const rows = t.files
  const media = assetAddresses(rows)
  if (mode === "library") return themeOfInstall(rows, t.theme.settings, libraryThemeOptions("probe", rows, () => "probe"))
  return themeOfInstall(rows, t.theme.settings, {
    assetUrl: (name) => media[name] ?? `/api/site-theme/assets/probe/probe/${encodeURIComponent(name)}`,
    assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : media[shopImageName(v) ?? ""] ?? ""),
  })
}

/** Every section a creator can add, and each of its presets: what the library lists. */
function addable(theme: CompatTheme, rows: Record<string, string>): { type: string; preset: number; name: string; schema: SectionSchema }[] {
  const types = new Set<string>()
  for (const path of Object.keys(rows)) {
    const m = path.match(/^(?:shopify\/)?sections\/([^/]+)\.(?:liquid|storelib)$/)
    if (m) types.add(m[1])
  }
  const out: { type: string; preset: number; name: string; schema: SectionSchema }[] = []
  for (const type of [...types].sort()) {
    const schema = theme.schemaOf("sections", type) as unknown as SectionSchema & { presets?: { name?: string }[]; enabled_on?: unknown }
    const presets = schema.presets ?? []
    presets.forEach((p, i) => out.push({ type, preset: i, name: String(p?.name ?? schema.name ?? type), schema }))
  }
  return out
}

type Card = { key: string; name: string; broken: string[]; empty: number; blank: boolean; words: string[]; height: number }

async function main() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const results: Record<string, Record<string, { cards: number; broken: number; empty: number; blank: number; words: number; bad: Card[] }>> = {}
  let failing = 0
  for (const id of TEMPLATES) {
    const t = await importTemplate(`materia/${id}`)
    const built = siteFor(t, { name: "My store", products: [] })
    const { base, server } = await serve(built, "scripts/theme-templates/products")
    results[id] = {}
    for (const mode of MODES) {
      const theme = themeFor(t, mode)
      const cards = addable(theme, t.files)
      const { html: sheet, main } = sheetDocument(theme, page, t.files, WIDTH, HEIGHT)
      let body = ""
      cards.forEach((c, i) => {
        let markup = ""
        try {
          markup = sectionMarkup(theme, page, previewSectionFor(c.type, c.preset, c.schema, false), t.files, WIDTH, HEIGHT)
        } catch (e) {
          markup = `<p>Liquid error: ${String(e).slice(0, 120)}</p>`
        }
        body += `<div data-r3-card="${i}" style="position:relative;width:${WIDTH}px;overflow:hidden;contain:layout paint">${main || "<main>"}${markup}</main></div>`
      })
      /* The sheet's own rules are for <sl-card>; here the cards stack in the body's flow, each its own box. */
      const doc = sheet.replace(/(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i, (_m, a: string, _b: string, z: string) => `${a}${body}${z}`).replace(/\sloading=(["'])lazy\1/g, ' loading="eager"')
      const tab = await browser.newPage()
      await tab.setViewport({ width: WIDTH, height: HEIGHT })
      /* tsx names the functions it hands the page (esbuild keepNames): the page needs the helper it calls. */
      await tab.evaluateOnNewDocument("globalThis.__name = (f) => f")
      await tab.setRequestInterception(true)
      tab.on("request", (r) => {
        const u = new URL(r.url())
        if (u.pathname === "/__r3") return void r.respond({ status: 200, contentType: "text/html", body: doc })
        /* The editor's asset route, answered by the probe server's own. */
        const m = u.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
        if (m && u.origin === base) return void r.continue({ url: `${base}/__asset/${m[1]}` })
        if (u.origin !== base && !u.protocol.startsWith("data")) return void r.respond({ status: 404, body: "" })
        r.continue()
      })
      await tab.goto(`${base}/__r3`, { waitUntil: "load", timeout: 120_000 }).catch(() => {})
      await tab.evaluate(async () => {
        const imgs = Array.from(document.images)
        await Promise.race([Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }) })))), new Promise((r) => setTimeout(r, 15_000))])
      })
      const found: Card[] = await tab.evaluate((names: string[]) => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect()
          if (r.width < 2 || r.height < 2) return false
          for (let e: Element | null = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e)
            if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false
          }
          return true
        }
        return Array.from(document.querySelectorAll<HTMLElement>("[data-r3-card]")).map((card) => {
          const i = Number(card.dataset.r3Card)
          const broken: string[] = []
          let empty = 0
          for (const img of Array.from(card.querySelectorAll("img"))) {
            if (!visible(img)) continue
            const src = img.getAttribute("src")
            if (src === null || src.trim() === "" || src.trim() === "#") { if (!img.currentSrc) { empty++; continue } }
            if (img.complete && img.naturalWidth === 0) broken.push((img.currentSrc || src || "").slice(0, 140))
          }
          const text = card.innerText || ""
          const words = (text.match(/Liquid (syntax )?error[^\n]{0,80}|translation missing[^\n]{0,60}|\{\{[^\n]{0,40}|\{%[^\n]{0,40}/gi) ?? []).slice(0, 3)
          const r = card.getBoundingClientRect()
          const shows = Array.from(card.querySelectorAll("img, svg, video, picture, canvas, iframe, input, textarea, select, button")).some(visible) || text.trim().length > 0
          return { key: String(i), name: names[i], broken, empty, blank: r.height < 8 || !shows, words, height: Math.round(r.height) }
        })
      }, cards.map((c) => `${c.type}#${c.preset} ${c.name}`))
      if (process.env.SHOTS) {
        mkdirSync(process.env.SHOTS, { recursive: true })
        const named = process.env.SHOT_TYPES ? new RegExp(process.env.SHOT_TYPES) : null
        for (const c of found.filter((x) => (named ? named.test(x.name) : x.broken.length || x.empty)).slice(0, named ? 40 : 6)) {
          const el = await tab.$(`[data-r3-card="${c.key}"]`)
          await el?.screenshot({ path: join(process.env.SHOTS, `${id}-${mode}-${c.key}.png`) }).catch(() => {})
        }
      }
      await tab.close()
      const bad = found.filter((c) => c.broken.length || c.empty || c.blank || c.words.length)
      const row = { cards: found.length, broken: found.filter((c) => c.broken.length).length, empty: found.filter((c) => c.empty).length, blank: found.filter((c) => c.blank).length, words: found.filter((c) => c.words.length).length, bad }
      results[id][mode] = row
      failing += row.broken + row.empty + row.words
      console.log(`${id.padEnd(14)} ${mode.padEnd(8)} cards ${String(row.cards).padStart(3)}  broken ${String(row.broken).padStart(3)}  empty ${String(row.empty).padStart(3)}  blank ${String(row.blank).padStart(3)}  words ${row.words}`)
      for (const c of bad.slice(0, Number(process.env.LIST ?? 8))) console.log(`    ${c.name}: ${c.broken.length ? `${c.broken.length} broken (${c.broken[0].slice(0, 70)})` : ""}${c.empty ? ` ${c.empty} empty` : ""}${c.blank ? " blank" : ""}${c.words.length ? ` words: ${c.words[0]}` : ""}`)
    }
    server.close()
  }
  await browser.close()
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 1))
  const sum = (k: "cards" | "broken" | "empty" | "blank" | "words") => Object.values(results).flatMap((r) => Object.values(r)).reduce((n, r) => n + r[k], 0)
  console.log(`\nALL  cards ${sum("cards")}  broken ${sum("broken")}  empty ${sum("empty")}  blank ${sum("blank")}  words ${sum("words")}`)
  process.exit(failing ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
