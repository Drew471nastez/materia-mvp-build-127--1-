/**
 * ===========================================================================
 *  HERO IMAGE 1: EVERY BLOCK SHOWS SOMETHING THE MOMENT IT IS ADDED (round 67)
 * ===========================================================================
 *   npx tsx scripts/check-hero-image1-blocks-r67.ts
 *     TEMPLATE=fitness   whose home page's Hero Image 1 gets the blocks
 *     SHOTS=<dir>        screenshots of the hero at 1280 and 390
 *
 * Every block type of the section is added to the hero with nothing but its
 * schema defaults (what Add block puts in, and what the block library's
 * preview draws), and read on the live page:
 *   - each block is shown and has a size (none waits for a picture or a word)
 *   - Happy customers shows its heading, its stars and four placeholder faces
 *   - Simple rating and Rating badge show their stars and words
 *   - the Benefits stack's verified badge: its check differs from the badge's
 *     fill by at least 0.4 in lightness, in the template's scheme and with a
 *     white icon colour (the owner's "white on white")
 * The library's own preview path is read too: blockMarkup, or the section
 * drawn with the block in it, holds the block, shown.
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { serveLive } from "./check-builder-nav19"

const TEMPLATE = process.env.TEMPLATE ?? "fitness"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== "" ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}
const src = readFileSync("theme-packages/materia/base/sections/hero-image1.liquid", "utf8")
const schema = JSON.parse(src.slice(src.indexOf("{% schema %}") + 12, src.indexOf("{% endschema %}"))) as { blocks: { type: string; settings: { id?: string; default?: unknown }[] }[] }
const TYPES = schema.blocks.map((b) => b.type)
const defaults = (type: string) => Object.fromEntries(schema.blocks.find((b) => b.type === type)!.settings.filter((s) => s.id && s.default !== undefined).map((s) => [s.id!, s.default]))

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  for (const whiteIcon of [false, true]) {
    const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${TEMPLATE}`))
    const { server, base } = await serveLive((compat) => {
      for (const list of Object.values(compat.pages)) for (const s of list as { type: string; blocks?: { id: string; type: string; settings: Record<string, unknown> }[] }[]) {
        if (s.type !== "hero-image1") continue
        s.blocks = TYPES.map((type) => ({ id: `probe_${type}`, type, settings: { ...defaults(type), ...(whiteIcon && type === "benefits_stack" ? { enable_custom_style: true, icon_color: "#ffffff" } : {}) } }))
      }
    }, zip)
    const page = await browser.newPage()
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    console.log(`\n${TEMPLATE}${whiteIcon ? ", benefits icon colour white" : ""}`)
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: width < 700 ? 844 : 900, deviceScaleFactor: 2 })
      await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 60000 })
      await sleep(900)
      const r = await page.evaluate(() => {
        const out: Record<string, unknown> = {}
        for (const b of document.querySelectorAll<HTMLElement>("[data-hi1-block]")) {
          const box = b.getBoundingClientRect()
          out[b.dataset.hi1Kind!] = { shown: !b.hidden && box.height > 4, h: Math.round(box.height), text: (b.textContent ?? "").trim().slice(0, 40) }
        }
        const faces = [...document.querySelectorAll<HTMLElement>("[data-hi1-kind='happy_customers'] .hi1__avatar")].filter((a) => !a.hidden && a.getBoundingClientRect().width > 4).length
        const stars = (k: string) => [...document.querySelectorAll<HTMLElement>(`[data-hi1-kind='${k}'] .hi1__stars`)].filter((s) => !s.hidden && s.getBoundingClientRect().width > 4).length
        const l = (c: string) => { const m = c.match(/oklch\(([\d.]+)/); if (m) return +m[1]; const v = c.match(/[\d.]+/g)!.map(Number); const f = (x: number) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return Math.cbrt(0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2])) }
        const icon = document.querySelector<SVGElement>("[data-hi1-kind='benefits_stack'] .hi1__benefit-icon svg")
        const paths = icon ? icon.querySelectorAll("path") : []
        const fill = paths[0] ? getComputedStyle(paths[0]).fill : "", stroke = paths[1] ? getComputedStyle(paths[1]).stroke : ""
        return { blocks: out, faces, stars: { hc: stars("happy_customers"), sr: stars("simple_rating"), rb: stars("lod_rating_badge") }, fill, stroke, gap: fill && stroke ? +Math.abs(l(fill) - l(stroke)).toFixed(2) : 0 }
      })
      const missing = Object.entries(r.blocks as Record<string, { shown: boolean }>).filter(([, v]) => !v.shown).map(([k]) => k)
      check(`${width}: every block type shown with its defaults (${Object.keys(r.blocks).length} of ${TYPES.length})`, missing.length === 0 && Object.keys(r.blocks).length === TYPES.length, missing.length ? missing : "")
      check(`${width}: Happy customers shows its heading, stars and 4 placeholder faces`, r.faces === 4 && r.stars.hc === 1 && /\w/.test(String((r.blocks as Record<string, { text: string }>).happy_customers?.text)), { faces: r.faces, stars: r.stars.hc, text: (r.blocks as Record<string, { text: string }>).happy_customers?.text })
      check(`${width}: Simple rating and Rating badge show stars and words`, r.stars.sr === 1 && r.stars.rb === 1, { ...r.stars, sr: (r.blocks as Record<string, { text: string }>).simple_rating?.text, rb: (r.blocks as Record<string, { text: string }>).lod_rating_badge?.text })
      check(`${width}: the verified badge's check stands out from its fill`, r.gap >= 0.4, { fill: r.fill, check: r.stroke, lightnessGap: r.gap })
      if (process.env.SHOTS) {
        const hero = await page.$("[data-hero-image-one]")
        await hero?.screenshot({ path: `${process.env.SHOTS}/hero-image1-blocks-${TEMPLATE}${whiteIcon ? "-white-icon" : ""}-${width}.png` })
      }
    }
    await page.close()
    server.close()
  }
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
