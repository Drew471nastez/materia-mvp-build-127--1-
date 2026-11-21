/**
 * Every page of every template, in Chromium, looked at and measured.
 *
 *   npx tsx scripts/audit-theme-templates.ts [template ...] --out DIR [--only page,page] [--state full|empty] [--no-shots]
 *
 * For each template and each of two shops (one with a catalogue, a blog and
 * policies; one with nothing yet: scripts/theme-templates/fixtures.ts) every
 * address a store answers is opened at 1440 and at 390 wide. Per page it
 * prints and writes to DIR/report.json: the status, how far the page runs
 * past the screen sideways, pictures that did not load, requests that
 * failed, what the console and the theme's scripts said, words too faint to
 * read against their background, template code left
 * in the text, the old platform's name, and every link that leads nowhere.
 * A PNG of each whole page goes to DIR for looking at.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer } from "../lib/storelib-theme/compat/site"
import { importTemplate, serve } from "./theme-templates/site"
import { auditCart, auditPaths, auditSite } from "./theme-templates/fixtures"
import { FAINT_TEXT_JS } from "./theme-templates/faint"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const args = process.argv.slice(2)
const value = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const OUT = value("--out") ?? join("scripts", "theme-templates", ".out")
const ONLY = value("--only")?.split(",")
const STATES = value("--state") ? [value("--state") as string] : ["full", "empty"]
const SHOTS = !args.includes("--no-shots")
const names = args.filter((a, i) => !a.startsWith("--") && !["--out", "--only", "--state"].includes(args[i - 1]))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))


/**
 * The whole page as one picture, a screen at a time, as a visitor scrolls
 * it (Chromium's own full page capture resizes the screen, and a theme's
 * carousels and reveals draw differently for it). What sticks or floats is
 * let go of after the first screen, so it is not in every one.
 */
async function wholePage(p: import("puppeteer-core").Page, width: number, height: number): Promise<Buffer> {
  const total = Math.min(await p.evaluate(() => document.documentElement.scrollHeight), 14000)
  const tiles: { input: Buffer; top: number; left: number }[] = []
  for (let y = 0; y < total; y += height) {
    const at = await p.evaluate(async (to) => { scrollTo(0, to); await new Promise((r) => setTimeout(r, 220)); return scrollY }, y)
    if (y === 0) {
      tiles.push({ input: Buffer.from((await p.screenshot({ type: "png" })) as Uint8Array), top: 0, left: 0 })
      await p.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
          const pos = getComputedStyle(el).position
          if (pos === "sticky") el.style.setProperty("position", "static", "important")
          else if (pos === "fixed" && el.offsetHeight > 0 && el.offsetHeight < innerHeight * 0.5) el.style.setProperty("display", "none", "important")
        }
      })
      continue
    }
    const shot = Buffer.from((await p.screenshot({ type: "png" })) as Uint8Array)
    const skip = Math.round(y - at)
    if (skip >= height) break
    tiles.push({ input: skip > 0 ? await sharp(shot).extract({ left: 0, top: skip, width, height: height - skip }).toBuffer() : shot, top: y, left: 0 })
  }
  const tall = Math.max(height, Math.min(total, (tiles[tiles.length - 1]?.top ?? 0) + height))
  return sharp({ create: { width, height: tall, channels: 3, background: "#ffffff" } }).composite(tiles).png().toBuffer()
}

/** The pages of one template, shop and screen side by side, small: one picture to look over. */
async function sheet(files: [string, string][], to: string, tile: number, cap: number) {
  const made: { input: Buffer; w: number; h: number }[] = []
  for (const [label, file] of files) {
    const img = await sharp(file).resize({ width: tile }).toBuffer().catch(() => null)
    if (!img) continue
    const meta = await sharp(img).metadata()
    const h = Math.min(meta.height ?? cap, cap)
    const cut = await sharp(img).extract({ left: 0, top: 0, width: tile, height: h }).toBuffer()
    const tag = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="22"><rect width="100%" height="100%" fill="#111"/><text x="6" y="16" font-family="sans-serif" font-size="14" fill="#fff">${label}</text></svg>`)
    made.push({ input: await sharp({ create: { width: tile, height: h + 22, channels: 3, background: "#fff" } }).composite([{ input: tag, top: 0, left: 0 }, { input: cut, top: 22, left: 0 }]).png().toBuffer(), w: tile, h: h + 22 })
  }
  const per = Math.max(1, Math.floor(2000 / (tile + 8)))
  for (let i = 0, n = 1; i < made.length; i += per * 2, n++) {
    const rows = [made.slice(i, i + per), made.slice(i + per, i + per * 2)].filter((r) => r.length)
    const heights = rows.map((r) => Math.max(...r.map((x) => x.h)))
    const parts = rows.flatMap((r, ri) => r.map((x, ci) => ({ input: x.input, left: ci * (tile + 8), top: heights.slice(0, ri).reduce((a, b) => a + b + 8, 0) })))
    await sharp({ create: { width: per * (tile + 8), height: heights.reduce((a, b) => a + b + 8, 0), channels: 3, background: "#888" } }).composite(parts).png().toFile(to.replace(".png", `-${n}.png`))
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
  const report: Record<string, unknown>[] = []
  try {
    for (const template of names.length ? names : CODE_TEMPLATES.map((t) => t.template)) {
      const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
      for (const state of STATES) {
        const built = auditSite(imported, template, state === "empty")
        const { base, server, missing } = await serve(built, join("scripts", "theme-templates", "products", template), { eager: true, cart: auditCart(built) })
        const hrefs = new Map<string, Set<string>>()
        for (const [name, path] of auditPaths(built).filter(([n]) => !ONLY || ONLY.includes(n))) {
          for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }]] as const) {
            const p = await browser.newPage()
            await p.setViewport(vp)
            const errors: string[] = []
            const failedRequests: string[] = []
            p.on("pageerror", (e) => errors.push(`error: ${String(e).slice(0, 200)}`))
            p.on("console", (m) => { if (m.type() === "error" && !(name === "404" && /status of 404/.test(m.text()))) errors.push(`console: ${m.text().slice(0, 200)}`) })
            p.on("requestfailed", (r) => failedRequests.push(`${r.failure()?.errorText ?? "failed"} ${r.url().slice(0, 140)}`))
            p.on("response", (r) => { if (r.status() >= 400 && r.url() !== `${base}${path}` && !r.url().endsWith("/favicon.ico")) failedRequests.push(`${r.status()} ${r.url().slice(0, 140)}`) })
            await p.evaluateOnNewDocument("window.__name = (f) => f")
            const res = await p.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => { errors.push(String(e).slice(0, 120)); return null })
            await p.evaluate(async () => {
              const step = Math.round(innerHeight * 0.8)
              for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
              scrollTo(0, 0)
            }).catch(() => undefined)
            /* What fades or slides in as it is scrolled to is shown arrived, so a photograph of the whole page has it. */
            await p.addStyleTag({ content: ".scroll-trigger,motion-element,[data-motion]{opacity:1!important;transform:none!important;visibility:visible!important}" }).catch(() => undefined)
            await sleep(500)
            const facts = await p.evaluate(() => {
              const text = document.body.innerText
              const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
                const r = el.getBoundingClientRect()
                return r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(el).position !== "fixed" && !el.closest("[class*='slider'],[class*='carousel'],[class*='swiper'],[class*='marquee'],[class*='scroll'],[class*='drawer'],[class*='offcanvas'],[class*='menu'],[class*='modal'],[class*='popup']")
              }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`)
              return {
                height: document.documentElement.scrollHeight,
                sections: [...document.querySelectorAll<HTMLElement>("[id^='shopify-section-']")].map((s) => ({ id: s.id.replace("shopify-section-", ""), h: Math.round(s.getBoundingClientRect().height), text: s.innerText.trim().length })),
                broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute("src"))).map((i) => (i.currentSrc || i.getAttribute("src") || "").slice(0, 120)),
                emptySrc: [...document.images].filter((i) => !i.getAttribute("src") && !i.getAttribute("srcset") && !i.getAttribute("data-src")).length,
                overflow: document.documentElement.scrollWidth - innerWidth,
                wide,
                vendor: (text.match(/.{0,30}shopify.{0,30}/i) ?? [null])[0],
                raw: (text.match(/.{0,30}(\{\{|\{%|Liquid error|translation missing).{0,40}/i) ?? [null])[0],
                old: (text.match(/.{0,20}(Prime ?Clarity|\\bmateria\\b|lorem ipsum).{0,20}/i) ?? [null])[0],
                links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => a.getAttribute("href") ?? ""),
                bareLinks: [...document.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => { const h = a.getAttribute("href"); return (h === null || h === "" || h === "#") && a.innerText.trim() && a.getBoundingClientRect().width > 0 && !a.getAttribute("role") && !a.closest("summary,[data-modal],[aria-haspopup],[aria-controls],[class*='tab'],[class*='drawer'],[class*='search']") }).map((a) => a.innerText.trim().slice(0, 40)),
                forms: [...document.forms].map((f) => `${(f.getAttribute("method") ?? "get").toLowerCase()} ${f.getAttribute("action") ?? ""}`),
                fonts: [...new Set([...document.querySelectorAll<HTMLElement>("h1,h2,p,a.button,button")].slice(0, 40).map((el) => getComputedStyle(el).fontFamily.split(",")[0].trim()))],
                fontsFailed: [...document.fonts].filter((f) => f.status === "error").map((f) => f.family),
              }
            }).catch(() => null)
            const faint = (await p.evaluate(FAINT_TEXT_JS).catch(() => null)) as { faint: string[] } | null
            if (facts) for (const h of facts.links) { if (!hrefs.has(h)) hrefs.set(h, new Set()); hrefs.get(h)!.add(name) }
            if (SHOTS) await wholePage(p, vp.width, vp.height).then((png) => writeFileSync(join(OUT, `${template}-${state}-${name}-${vpName}.png`), png)).catch(() => undefined)
            const row = { template, state, page: name, path, viewport: vpName, status: res?.status() ?? 0, ...(facts ?? {}), links: undefined, errors: [...new Set(errors)], failedRequests: [...new Set(failedRequests)] }
            report.push(row)
            const emptySections = (facts?.sections ?? []).filter((s) => s.h < 2 && !/mobile_navigation|back_to_top|cart-drawer|popup|cookie/.test(s.id) && !(name === "cart" && s.id === "heading")).map((s) => s.id)
            const bad = [
              row.status >= 400 && name !== "404" ? `status ${row.status}` : "",
              facts && facts.overflow > 1 ? `overflow ${facts.overflow}px ${facts.wide.join(" ")}` : "",
              facts?.broken.length ? `broken ${JSON.stringify(facts.broken.slice(0, 3))}` : "",
              facts?.vendor ? `vendor "${facts.vendor}"` : "", facts?.raw ? `raw "${facts.raw}"` : "", facts?.old ? `old "${facts.old}"` : "",
              facts?.bareLinks.length ? `bare links ${JSON.stringify(facts.bareLinks.slice(0, 5))}` : "",
              emptySections.length ? `empty sections ${emptySections.join(",")}` : "",
              faint?.faint.length ? `faint ${JSON.stringify(faint.faint)}` : "",
              facts?.fontsFailed.length ? `fonts failed ${facts.fontsFailed.join(",")}` : "",
              row.errors.length ? `errors ${JSON.stringify(row.errors.slice(0, 3))}` : "", row.failedRequests.length ? `requests ${JSON.stringify(row.failedRequests.slice(0, 3))}` : "",
            ].filter(Boolean)
            console.log(`${bad.length ? "LOOK" : "ok  "} ${template} ${state} ${name} ${vpName}: ${row.status}, ${facts?.sections.length} sections, ${facts?.height}px${bad.length ? `\n       ${bad.join("\n       ")}` : ""}`)
            await p.close()
          }
        }
        /* Every link any page carried, asked of the engine itself. */
        const dead: string[] = []
        for (const [href, on] of hrefs) {
          if (!href || href.startsWith("#") || /^(mailto:|tel:|sms:|javascript:)/i.test(href)) continue
          let url: URL
          try { url = new URL(href, base) } catch { dead.push(`${href} (not an address) on ${[...on].join(",")}`); continue }
          if (url.origin !== base) continue
          if (/^\/(__media|__asset|__product|_next|cdn|api)\//.test(url.pathname) || /^\/(account|checkout|cart)(\/|$)/.test(url.pathname)) continue
          const out = await answer(built.site, { method: "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] }).catch(() => ({ status: 500 }))
          if (out.status >= 400) dead.push(`${out.status} ${href} on ${[...on].slice(0, 4).join(",")}`)
        }
        console.log(`${dead.length ? "LOOK" : "ok  "} ${template} ${state} links: ${hrefs.size} different, ${dead.length} dead${dead.length ? `\n       ${dead.join("\n       ")}` : ""}`)
        report.push({ template, state, dead, missing: [...new Set(missing)] })
        if (SHOTS) for (const vpName of ["desktop", "phone"]) {
          const list = auditPaths(built).filter(([n]) => !ONLY || ONLY.includes(n)).map(([n]) => [n, join(OUT, `${template}-${state}-${n}-${vpName}.png`)] as [string, string])
          await sheet(list, join(OUT, `sheet-${template}-${state}-${vpName}.png`), vpName === "desktop" ? 480 : 240, vpName === "desktop" ? 1500 : 1900)
        }
        if (missing.length) console.log(`     asked for and not there: ${JSON.stringify([...new Set(missing)].slice(0, 12))}`)
        server.close()
      }
    }
  } finally {
    await browser.close()
    writeFileSync(join(OUT, `report-${names.join("-") || "all"}.json`), JSON.stringify(report, null, 1))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
