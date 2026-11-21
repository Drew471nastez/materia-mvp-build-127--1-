/**
 * Every section of the theme, alone on a page, drawn and measured.
 *
 *   npx tsx scripts/audit-theme-sections.ts [section ...] [--template default] [--browser] [--out DIR] [--empty] [--design]
 *
 * Each section is placed as Add section places it (its preset), after the
 * template's header and before a one line section and the footer
 * (scripts/theme-templates/sections.ts). Through the engine alone: did it
 * draw, did it throw, is template code left in the text, is its markup
 * whole. With --browser, in Chromium too: is the section after it still
 * its sibling, is the footer still there, what the scripts said, and a
 * picture of each in DIR.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer } from "../lib/storelib-theme/compat/site"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"
import { ALONE_ID, SENTINEL_ID, SENTINEL_TEXT, homeWith, sectionAsAdded, sectionMarkup, sectionTypesOf, unbalanced } from "./theme-templates/sections"

const args = process.argv.slice(2)
const value = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const template = value("--template") ?? "default"
const OUT = value("--out") ?? join("scripts", "theme-templates", ".out")
const names = args.filter((a, i) => !a.startsWith("--") && !["--out", "--template"].includes(args[i - 1]))
const visibleText = (html: string) => html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

async function main() {
  mkdirSync(OUT, { recursive: true })
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
  const built = auditSite(imported, template, args.includes("--empty"))
  /* As the builder's canvas draws it: the theme is told it is being edited, so a section may show its sample content. */
  if (args.includes("--design")) built.site.designMode = true
  const home = built.site.pages.home
  const types = names.length ? names : sectionTypesOf(imported)
  const rows: Record<string, unknown>[] = []
  const browser = args.includes("--browser") ? await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] }) : null
  const served = browser ? await serve(built, join("scripts", "theme-templates", "products", template), { eager: true }) : null
  try {
    for (const type of types) {
      const added = sectionAsAdded(imported, type)
      built.site.pages.home = homeWith(built, [added.section])
      const row: Record<string, unknown> = { type, addable: added.addable, schema: added.schema ? "ok" : added.errors.join("; ").slice(0, 200), fields: added.schema?.fields?.length ?? 0, blocks: added.schema?.blocks?.length ?? 0 }
      try {
        const out = await answer(built.site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
        const html = String(out.body)
        const own = sectionMarkup(html, ALONE_ID)
        const text = own ? visibleText(own) : ""
        row.status = out.status
        row.drawn = !!own
        row.bytes = own?.length ?? 0
        row.text = text.trim().length
        row.raw = (text.match(/.{0,30}(\{\{|\{%|Liquid error).{0,40}/) ?? [null])[0]
        row.open = own ? unbalanced(own) : []
        row.sentinel = html.includes(SENTINEL_TEXT)
        row.footer = html.includes('id="shopify-section-footer"')
      } catch (e) {
        row.threw = String(e).slice(0, 300)
      }
      if (browser && served) {
        const p = await browser.newPage()
        await p.setViewport({ width: 1440, height: 900 })
        const errors: string[] = []
        p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
        p.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`) })
        await p.evaluateOnNewDocument("window.__name = (f) => f")
        await p.goto(`${served.base}/`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => errors.push(String(e).slice(0, 100)))
        await p.addStyleTag({ content: ".scroll-trigger,motion-element,[data-motion]{opacity:1!important;transform:none!important;visibility:visible!important}" }).catch(() => undefined)
        await new Promise((r) => setTimeout(r, 300))
        const dom = await p.evaluate((alone, sentinel) => {
          const a = document.getElementById(`shopify-section-${alone}`)
          const s = document.getElementById(`shopify-section-${sentinel}`)
          const f = document.getElementById("shopify-section-footer")
          const r = a?.getBoundingClientRect()
          return {
            there: !!a, sibling: !!a && !!s && a.parentElement === s.parentElement, inside: !!a && !!s && a.contains(s), footerInside: !!a && !!f && a.contains(f),
            sentinelVisible: !!s && s.getBoundingClientRect().height > 0, height: Math.round(r?.height ?? 0), overflow: document.documentElement.scrollWidth - innerWidth,
            broken: [...(a?.querySelectorAll("img") ?? [])].filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute("src"))).length,
            words: (a?.innerText ?? "").trim().slice(0, 80),
          }
        }, ALONE_ID, SENTINEL_ID).catch(() => null)
        row.dom = dom
        row.scriptErrors = [...new Set(errors)]
        const el = await p.$(`#shopify-section-${ALONE_ID}`)
        if (el && dom && dom.height > 0) await el.screenshot({ path: join(OUT, `section-${type}.png`) as `${string}.png` }).catch(() => undefined)
        await p.close()
      }
      rows.push(row)
      const dom = row.dom as { sibling?: boolean; inside?: boolean; footerInside?: boolean; height?: number; overflow?: number; broken?: number } | null | undefined
      const bad = [
        row.threw ? `threw ${row.threw}` : "", row.status !== 200 && !row.threw ? `status ${row.status}` : "", row.drawn === false ? "not drawn" : "", row.schema !== "ok" ? `schema ${row.schema}` : "",
        row.raw ? `raw "${row.raw}"` : "", (row.open as string[] | undefined)?.length ? `left open ${(row.open as string[]).join(" ")}` : "", row.sentinel === false ? "the next section is gone" : "", row.footer === false ? "the footer is gone" : "",
        dom && dom.inside ? "the next section is inside it" : "", dom && dom.footerInside ? "the footer is inside it" : "", dom && dom.sibling === false && !dom.inside ? "the next section is not beside it" : "",
        dom && (dom.overflow ?? 0) > 1 ? `overflow ${dom.overflow}px` : "", dom && dom.broken ? `${dom.broken} broken pictures` : "", (row.scriptErrors as string[] | undefined)?.length ? `scripts ${JSON.stringify((row.scriptErrors as string[]).slice(0, 2))}` : "",
      ].filter(Boolean)
      row.bad = bad
      console.log(`${bad.length ? "LOOK" : "ok  "} ${type}${added.addable ? "" : " (no preset)"}: ${row.bytes} bytes, ${row.text} chars${dom ? `, ${dom.height}px` : ""}${bad.length ? `\n       ${bad.join("\n       ")}` : ""}`)
    }
  } finally {
    built.site.pages.home = home
    await browser?.close()
    served?.server.close()
    writeFileSync(join(OUT, `sections-${template}${args.includes("--empty") ? "-empty" : ""}.json`), JSON.stringify(rows, null, 1))
  }
  const bad = rows.filter((r) => (r.bad as string[]).length)
  console.log(`\n${rows.length} sections, ${rows.length - bad.length} clean, ${bad.length} to look at`)
}

main().catch((e) => { console.error(e); process.exit(1) })
