/**
 * ===========================================================================
 *  SCROLL-IN REVEALS: HOW FAR, HOW LONG, HOW LATE, AND NOTHING LEFT BEHIND (round 68)
 * ===========================================================================
 *   npx tsx scripts/check-reveal-r68.ts
 *     TEMPLATES=rail,outerwear   which Materia templates (default: every one)
 *     PAGES=/,/collections/all   which pages
 *     WIDTH=1440                 the screen
 *     OLD_FILES=<dir>            theme files a store installed earlier answer
 *                                by name (animation.css, animation.js,
 *                                footer.liquid is not a file the page asks for)
 *     OUT=<file>                 the numbers as JSON
 *
 * The owner: product cards come in "too exaggerated, keep it smooth and clean
 * but not that exaggerated, a fine line"; in Octavo "the footer comes animated
 * and leaves white background, empty space in the background as the
 * animation arrives". Each template's page is scrolled like a wheel, a screen
 * at a time, and every reveal that starts is read as it starts:
 *
 *   card      an element inside a section (a product card, a post): how far
 *             it travels (px), whether it scales, blurs or clips, how long it
 *             plays and how late it starts after the first of its row
 *   section   a section's own box: it must never move or fade as a block
 *             (its colour would arrive late and leave a band of the page)
 *   part      a part of a section (a heading, a picture): distance and time
 *
 * Then a fast scroll to the bottom and back, and a jump to each anchor: after
 * a second nothing that can be seen is left below full opacity or off its place.
 */
import { join } from "node:path"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import puppeteer, { type Page } from "puppeteer-core"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ALL = readdirSync("theme-packages/materia/templates").filter((d) => existsSync(join("theme-packages/materia/templates", d, "config")))
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : ALL
const PAGES = (process.env.PAGES ?? "/,/collections/all").split(",")
const WIDTH = Number(process.env.WIDTH ?? 1440)
const HEIGHT = WIDTH < 700 ? 844 : 900

/** The bar (round 68). */
export const BAR = { cardShift: 12, cardMs: [300, 450] as const, cardStagger: 45, sectionMoves: 0, partShift: 14, partMs: 650 }

type Start = { kind: "card" | "section" | "part" | "word"; name: string; shift: number; scale: number; filter: boolean; clip: boolean; opacity: number; ms: number; delay: number; bg: boolean; id: string }

const WATCH = () => {
  const w = window as unknown as { __rv: Start[] }
  w.__rv = []
  document.addEventListener("animationstart", (e) => {
    if (!/^reveal/i.test(e.animationName)) return
    const t = e.target as HTMLElement
    const cs = getComputedStyle(t)
    /* An element armed below the screen waits paused at its first frame: only the reveal that plays counts. */
    if (!/running/.test(cs.animationPlayState)) return
    const m = cs.transform
    let shift = 0, scale = 1
    if (m && m !== "none") {
      const v = m.match(/-?[\d.e]+/g)!.map(Number)
      if (v.length === 6) { shift = Math.hypot(v[4], v[5]); scale = Math.hypot(v[0], v[1]) } else { shift = Math.hypot(v[12], v[13]); scale = Math.hypot(v[0], v[1]) }
    }
    const a = t.getAnimations().find((x) => (x as CSSAnimation).animationName === e.animationName)
    const timing = a?.effect?.getComputedTiming()
    const inCard = !!t.closest(".scroll-trigger:not(.shopify-section)")
    const kind = t.matches(".shopify-section") ? "section" : !inCard && t.closest("[data-reveal-part], [data-reveal-zoom]") ? "part" : t.matches(".mt-word") ? "word" : t.hasAttribute("data-reveal-part") ? "part" : "card"
    /* A section's box carries a colour of its own (or its first child does, the section's band). */
    const box = t.getBoundingClientRect()
    const bgOf = (el: Element) => { if (/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(el).backgroundColor) && getComputedStyle(el).backgroundImage === "none") return false; const r = el.getBoundingClientRect(); return r.width >= box.width * 0.9 && r.height >= box.height * 0.5 }
    const bg = kind === "section" && [t, ...t.querySelectorAll("*")].slice(0, 40).some(bgOf)
    const sec = t.closest(".shopify-section")
    w.__rv.push({ kind, name: e.animationName, shift: Math.round(shift * 10) / 10, scale: Math.round(scale * 1000) / 1000, filter: cs.filter !== "none", clip: cs.clipPath !== "none", opacity: Math.round(parseFloat(cs.opacity) * 100) / 100, ms: Math.round(Number(timing?.duration) || 0), delay: Math.round(Number(timing?.delay) || 0), bg, id: (sec?.id ?? "").replace(/^shopify-section-(template--\d+__)?/, "") })
  }, true)
}

/** What is on screen and not at rest: below 0.99 opacity, or moved, by a reveal of the theme. */
const LEFT = () => {
  const out: string[] = []
  for (const el of document.querySelectorAll<HTMLElement>(".scroll-trigger, [data-reveal-part], .mt-word, .scroll-trigger--armed")) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none") continue
    /* Only what can be seen: the element (or something in it) is what lies on top at its middle (not a closed menu's, not a slide beyond its slider's edge). */
    const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)))
    if (!at || !(el.contains(at) || at.contains(el))) continue
    const moved = cs.transform !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(cs.transform)
    if (parseFloat(cs.opacity) < 0.99 || (moved && el.getAnimations().length)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} o=${cs.opacity} ${cs.transform}`)
  }
  return out
}

async function wheelDown(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += Math.round(HEIGHT * 0.6)) {
    await page.mouse.wheel({ deltaY: Math.round(HEIGHT * 0.6) })
    await sleep(380)
  }
  await sleep(1500)
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const report: Record<string, unknown> = {}
  let left = 0
  for (const template of TEMPLATES) {
    const imported = await importTemplate(`materia/${template}`)
    const built = auditSite(imported, template, false, { own: true })
    const { base, server } = await serve(built, join("scripts", "theme-templates", "products", template))
    for (const path of PAGES) {
      const page = await browser.newPage()
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, isMobile: WIDTH < 700, hasTouch: WIDTH < 700 })
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      await page.evaluateOnNewDocument(WATCH)
      /* OLD_FILES: an installed theme's older files by name. NO_HEAD_FIX=1: the page without round 68's head fix (theme-motion-fix.ts), as before this round. */
      if (process.env.OLD_FILES || process.env.NO_HEAD_FIX) {
        const dir = process.env.OLD_FILES ?? ""
        await page.setRequestInterception(true)
        page.on("request", (req) => {
          const name = decodeURIComponent(new URL(req.url()).pathname.split("/").pop() ?? "").replace(/\.[0-9a-f]{12}(\.\w+)$/, "$1")
          if (dir && name && existsSync(join(dir, name))) { void req.respond({ status: 200, contentType: name.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(join(dir, name)) }); return }
          if (process.env.NO_HEAD_FIX && req.resourceType() === "document") {
            void fetch(req.url()).then(async (r) => req.respond({ status: r.status, contentType: "text/html", body: (await r.text()).replace(/<style data-sl-motion-fix>[\s\S]*?<\/style>/, "").replace(/<script data-sl-popup-handoff>[\s\S]*?<\/script>/, "") })).catch(() => req.continue())
            return
          }
          void req.continue()
        })
      }
      await page.goto(base + path, { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
      await sleep(800)
      await page.mouse.move(WIDTH / 2, HEIGHT / 2)
      await wheelDown(page)
      const starts = (await page.evaluate(() => (window as unknown as { __rv: Start[] }).__rv)) as Start[]
      /* Stagger: within a section, how much later each card starts than the first of the cards that started with it. */
      const cards = starts.filter((s) => s.kind === "card")
      if (process.env.DEBUG) console.log(cards.filter((s) => Math.abs(s.scale - 1) > 0.001 || s.ms > 450).map((s) => `${s.name} ${s.id} ${s.ms}`).join("\n"))
      const sections = starts.filter((s) => s.kind === "section")
      const parts = starts.filter((s) => s.kind === "part" || s.kind === "word")
      const max = (l: Start[], f: (s: Start) => number) => (l.length ? Math.max(...l.map(f)) : 0)
      const min = (l: Start[], f: (s: Start) => number) => (l.length ? Math.min(...l.map(f)) : 0)
      const row = {
        cards: cards.length,
        cardShift: max(cards, (s) => s.shift),
        cardScale: cards.some((s) => Math.abs(s.scale - 1) > 0.001),
        cardFilter: cards.some((s) => s.filter),
        cardClip: cards.some((s) => s.clip),
        cardMs: [min(cards, (s) => s.ms), max(cards, (s) => s.ms)],
        cardDelay: max(cards, (s) => s.delay),
        sections: sections.length,
        sectionsWithColourMoved: sections.filter((s) => s.bg && (s.shift > 0.5 || s.opacity < 0.99 || s.clip || s.filter)).map((s) => s.id),
        sectionsMoved: sections.filter((s) => s.shift > 0.5 || s.opacity < 0.99 || Math.abs(s.scale - 1) > 0.001).map((s) => s.id),
        parts: parts.length,
        partShift: max(parts, (s) => s.shift),
        partMs: max(parts, (s) => s.ms),
        partDelay: max(parts, (s) => s.delay),
        footer: starts.filter((s) => /footer/.test(s.id) && (s.kind === "section")).length,
      }
      /* Nothing left behind: a fast scroll to the bottom and back to the top, and each anchor of the page jumped to. */
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await sleep(1200)
      const leftBottom = await page.evaluate(LEFT)
      await page.evaluate(() => scrollTo(0, 0))
      await sleep(1200)
      const leftTop = await page.evaluate(LEFT)
      const anchors = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".shopify-section[id]")].map((s) => s.id).filter((_, i) => i % 3 === 1).slice(0, 4))
      const leftAnchor: string[] = []
      for (const id of anchors) {
        await page.evaluate((x) => { location.hash = "#" + x }, id)
        await sleep(1100)
        leftAnchor.push(...(await page.evaluate(LEFT)).map((l) => `#${id}: ${l}`))
      }
      const stuck = [...leftBottom, ...leftTop, ...leftAnchor]
      left += stuck.length
      report[`${template}${path}`] = { ...row, stuck: stuck.slice(0, 6) }
      console.log(`${template}${path}  cards ${row.cards} shift ${row.cardShift}px${row.cardScale ? " scale" : ""}${row.cardFilter ? " blur" : ""}${row.cardClip ? " clip" : ""} ${row.cardMs.join("-")}ms delay<=${row.cardDelay}ms | sections ${row.sections} moved ${row.sectionsMoved.length} (colour ${row.sectionsWithColourMoved.length}${row.footer ? ", footer" : ""}) | parts ${row.parts} shift ${row.partShift}px ${row.partMs}ms delay<=${row.partDelay}ms | left ${stuck.length}${stuck.length ? " " + stuck.slice(0, 2).join(" ; ") : ""}`)
      await page.close()
    }
    server.close()
  }
  await browser.close()
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 1))
  console.log(left ? `\n${left} left unseen or moved` : "\nnothing left behind")
})()
