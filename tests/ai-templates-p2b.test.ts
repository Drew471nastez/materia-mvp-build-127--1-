/**
 * Round P (P2b): six more whole-site templates for the template library.
 *
 * Every template:
 *   1. has the brief's shape (id, name, industries, styles, directionIds, files, pages, tokens, imageSlots)
 *   2. every file compiles and passes the agent's own file check (validateFile, the strict gate)
 *   3. every section's declared block types are in its FILLED presets, and every placed section has blocks with content
 *   4. home has 10 to 14 sections of its own; product, collection, about and contact exist; each page has the template's own header and footer
 *   5. its header carries its own menu drawer, search panel with live results, cart drawer, language and currency lists (round N2 hooks)
 *   6. every page passes the render check with a real store's data (no error)
 *   7. no anti-slop P0 across its files and drawn pages, and the warning budget holds
 *   8. image slots name real image settings, every picture setting on home has one, prompts are photographic
 *   9. motion: round O5 variables and P3 islands by data attributes; transform/opacity only, reduced motion handled
 *  10. in Chromium (/opt/pw-browsers/chromium): every page at 390 and 1440 wide, nothing scrolls sideways
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-templates-p2b.test.ts
 */
import { existsSync } from "node:fs"
import { TEMPLATES_B } from "@/lib/storelib-ai/templates/registry-b"
import { templateImageTarget } from "@/lib/storelib-ai/templates/kit-b"
import { CAPS, PIXEL, PRODUCTS, SVG, dataFor, filled, pageHtml, schemaOf, templateFor, themeOf } from "./ai-templates-p2b-kit"
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types-b"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { renderCheck, esbuildScriptParser } from "@/lib/ai-builder/render-check"
import { slopIssues } from "@/lib/ai-builder/slop"
import { ART_DIRECTION_IDS } from "@/lib/storelib-ai/direction/directions"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    if (process.env.VERBOSE) console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1600) : JSON.stringify(detail).slice(0, 1600)}`}`)
  }
}

const MOTION_KINDS = ["scroll-scrub", "pin-horizontal", "parallax-depth", "3d-object", "3d-tilt", "webgl-gradient", "marquee", "text-scramble", "reveal-stagger", "smooth-scroll", "image-trail", "cursor-follow"]

async function main() {
  const parse = await esbuildScriptParser()
  console.log(`\n${TEMPLATES_B.length} templates`)
  check("six templates", TEMPLATES_B.length === 6, TEMPLATES_B.map((t) => t.id))
  check("ids are unique", new Set(TEMPLATES_B.map((t) => t.id)).size === TEMPLATES_B.length)
  const allTypes = TEMPLATES_B.flatMap((t) => Object.keys(t.files))
  check("no two templates share a section file (each is its own)", new Set(allTypes).size === allTypes.length)

  for (const t of TEMPLATES_B) {
    console.log(`\n── ${t.id}`)
    const theme = themeOf(t)
    const data = dataFor(t)
    const pages = filled(t)

    /* 1. shape */
    check(`${t.id}: shape`, !!t.name && t.industries.length > 0 && t.styles.length > 0 && t.directionIds.length > 0 && Object.keys(t.files).length > 0 && t.pages.length > 0 && !!t.tokens?.colors && t.imageSlots.length > 0)
    const dirIds = new Set(ART_DIRECTION_IDS)
    check(`${t.id}: direction ids are real`, t.directionIds.every((d) => dirIds.has(d)), t.directionIds.filter((d) => !dirIds.has(d)))

    /* 2. files */
    for (const [path, source] of Object.entries(t.files)) {
      const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
      const instances = pages.flatMap((p) => p.sections).filter((s) => s.type === type)
      const errors = validateFile(path, source, { instances, theme: theme as never, sources: t.files }).filter((i) => i.severity === "error")
      check(`${t.id}: ${path} passes the agent's file check`, errors.length === 0, errors)
      check(`${t.id}: ${path} type is ai_ and matches`, /^ai_[a-z0-9_]+$/.test(type) && schemaOf(source).type === type)
      check(`${t.id}: ${path} is placed on a page`, instances.length > 0)
    }

    /* 3. blocks */
    for (const [path, source] of Object.entries(t.files)) {
      const schema = schemaOf(source)
      const declared = (schema.blocks ?? []).map((b) => b.type)
      if (schema.kind) continue
      check(`${t.id}: ${path} declares blocks`, declared.length > 0)
      const preset = schema.presets?.[0]?.blocks ?? []
      check(`${t.id}: ${path} presets use every declared block type`, declared.every((d) => preset.some((b) => b.type === d)), { declared, preset: preset.map((b) => b.type) })
      check(`${t.id}: ${path} preset blocks are filled`, preset.length > 0 && preset.every((b) => Object.values(b.settings ?? {}).some((v) => typeof v === "string" && v.trim().length > 1)))
    }
    for (const p of t.pages) {
      for (const s of p.sections) {
        if (s.group) continue
        const blocks = s.blocks ?? []
        check(`${t.id}: ${p.key} › ${s.id} has blocks with content`, blocks.length > 0 && blocks.every((b) => Object.values(b.settings).some((v) => typeof v === "string" && v.trim().length > 1)), blocks)
      }
    }

    /* 4. pages */
    const keys = t.pages.map((p) => p.key)
    check(`${t.id}: home, product, collection, about and contact`, ["home", "product", "collection", "about", "contact"].every((k) => keys.includes(k)), keys)
    const home = t.pages.find((p) => p.key === "home")!
    const own = home.sections.filter((s) => !s.group)
    check(`${t.id}: home has 10 to 14 sections of its own`, own.length >= 10 && own.length <= 14, own.length)
    for (const p of t.pages) {
      const h = p.sections.find((s) => s.group === "header")
      const f = p.sections.find((s) => s.group === "footer")
      check(`${t.id}: ${p.key} has the template's own header and footer`, !!h && !!f && !!t.files[`sections/${h.type}.storelib`] && !!t.files[`sections/${f.type}.storelib`])
      check(`${t.id}: ${p.key} section ids are unique`, new Set(p.sections.map((s) => s.id)).size === p.sections.length)
    }

    /* 5. chrome */
    const head = home.sections.find((s) => s.group === "header")!
    const headSrc = t.files[`sections/${head.type}.storelib`]
    for (const hook of ["data-storelib-search-panel", "data-storelib-search-input", "data-storelib-search-result", "data-storelib-cart-panel", "data-storelib-cart-line", "data-storelib-checkout", "data-storelib-locale-list", "data-storelib-locale-option", "data-storelib-currency-list", "data-storelib-currency-option", "data-storelib-cart-count"]) {
      check(`${t.id}: header has ${hook}`, headSrc.includes(hook))
    }
    check(`${t.id}: header has its own menu drawer`, /popover\b/.test(headSrc) && /popovertarget=/.test(headSrc))
    check(`${t.id}: header reads the menu (link_list)`, /"link_list"/.test(headSrc))

    /* 6. render check */
    const drawn: { page: string; html: string; css: string }[] = []
    for (const p of pages) {
      const rc = await renderCheck({ page: p.key, sections: p.sections, sources: t.files, theme, template: templateFor(p.key), products: PRODUCTS as never, data, capabilities: CAPS, parseScript: parse ?? undefined, extraRoutes: ["/about", "/contact"] })
      const errs = rc.issues.filter((i) => i.severity === "error")
      check(`${t.id}: ${p.key} passes the render check`, errs.length === 0, errs)
      const warns = rc.issues.filter((i) => i.severity === "warning")
      if (warns.length && process.env.VERBOSE) console.log(`        ${p.key} warnings: ${warns.map((w) => `${w.code} ${w.sectionId ?? ""} ${w.message.slice(0, 90)}`).join(" | ")}`)
      check(`${t.id}: ${p.key} has one h1`, (rc.drawn?.html.match(/<h1\b/g) ?? []).length === 1)
      if (rc.drawn) drawn.push({ page: p.key, html: rc.drawn.html, css: rc.drawn.css })
    }

    /* 7. slop */
    const sources = Object.entries(t.files).map(([path, content]) => ({ path, content }))
    const slop = slopIssues({ sources, rendered: drawn, tokens: t.tokens })
    check(`${t.id}: no anti-slop P0 and the warning budget holds`, slop.filter((i) => i.severity === "error").length === 0, slop.filter((i) => i.severity === "error"))
    if (process.env.VERBOSE) for (const w of slop.filter((i) => i.severity === "warning")) console.log(`        slop warn ${w.code}: ${w.message.slice(0, 140)}`)

    /* 8. image slots */
    for (const s of t.imageSlots) {
      const hit = templateImageTarget(t, s.key)
      const schema = hit ? schemaOf(t.files[`sections/${hit.section.type}.storelib`]) : null
      const setting = hit && schema ? (hit.blockId ? schema.blocks?.find((b) => b.type === hit.block!.type)?.settings : schema.settings)?.find((x) => x.id === hit.setting) : null
      check(`${t.id}: slot ${s.key} names an image setting`, setting?.type === "image_picker", s.key)
      check(`${t.id}: slot ${s.key} has a photographic prompt and an aspect`, s.prompt.length >= 60 && /^\d+:\d+$/.test(s.aspect) && !/lorem|placeholder/i.test(s.prompt))
    }
    check(`${t.id}: slot keys are unique`, new Set(t.imageSlots.map((s) => s.key)).size === t.imageSlots.length)
    const slotKeys = new Set(t.imageSlots.map((s) => s.key))
    for (const s of home.sections) {
      const schema = schemaOf(t.files[`sections/${s.type}.storelib`])
      for (const x of schema.settings ?? []) if (x.type === "image_picker") check(`${t.id}: home › ${s.id}.${x.id} has an image slot`, slotKeys.has(`home/${s.id}/${x.id}`))
      for (const b of s.blocks ?? []) for (const x of schema.blocks?.find((d) => d.type === b.type)?.settings ?? []) if (x.type === "image_picker") check(`${t.id}: home › ${s.id}/${b.id}.${x.id} has an image slot`, slotKeys.has(`home/${s.id}/${b.id}/${x.id}`))
    }

    /* 9. motion */
    const allSrc = Object.values(t.files).join("\n")
    const kinds = new Set([...allSrc.matchAll(/data-storelib-motion="([a-z0-9-]+)"/g)].map((m) => m[1]))
    check(`${t.id}: uses at least four P3 motion islands`, kinds.size >= 4, [...kinds])
    check(`${t.id}: every motion island is a known kind`, [...kinds].every((k) => MOTION_KINDS.includes(k)), [...kinds])
    check(`${t.id}: reads the O5 motion variables`, /var\(--t-motion-(duration|distance|ease|stagger)/.test(allSrc))
    for (const [path, source] of Object.entries(t.files)) {
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ""
      const keyframes = [...style.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join(" ")
      const moved = [...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]).filter((p) => !p.startsWith("--"))
      check(`${t.id}: ${path} keyframes move only transform, opacity or clip-path`, moved.every((p) => ["transform", "opacity", "clip-path"].includes(p)), moved)
      const transitions = [...style.matchAll(/transition\s*:\s*([^;]+);/g)].map((m) => m[1])
      check(`${t.id}: ${path} no transition: all, no layout transition`, transitions.every((x) => !/\ball\b|\b(?:width|height|top|left|margin|padding)\b/.test(x)), transitions)
      check(`${t.id}: ${path} motion only where reduced motion is handled`, !/@keyframes|animation\s*:/.test(style) || /prefers-reduced-motion/.test(style))
      if (/data-storelib-motion=/.test(source) && !schemaOf(source).kind) check(`${t.id}: ${path} has the motion and strength settings`, /"id": "motion"/.test(source) && /"id": "motion_strength"/.test(source) && /data-motion="\{\{ settings\.motion \}\}"/.test(source))
    }

    /* 10. no image, still designed: the pages draw with every picture empty, nothing blank or broken */
    for (const p of t.pages) {
      const { failed: bad } = pageHtml(t, p.sections, p.key)
      check(`${t.id}: ${p.key} draws with no pictures yet`, bad.length === 0, bad)
    }
  }

  /* 11. Chromium */
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("\n  --    no Chromium here: overflow unverified in a browser")
  } else {
    console.log("\nChromium: every page at 390 and 1440")
    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    try {
      for (const t of TEMPLATES_B) {
        for (const p of filled(t)) {
          const { html } = pageHtml(t, p.sections, p.key)
          for (const width of [390, 1440]) {
            for (const reduce of [false, true]) {
              const page = await browser.newPage()
              await page.setViewport({ width, height: 900 })
              await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }])
              await page.setRequestInterception(true)
              page.on("request", (req) => (req.url() === PIXEL ? req.respond({ status: 200, contentType: "image/svg+xml", body: SVG }) : req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort()))
              await page.setContent(html, { waitUntil: "load" })
              const r = await page.evaluate(() => {
                const vw = document.documentElement.clientWidth
                const wide = [...document.querySelectorAll("[data-p2b] *")]
                  .filter((el) => {
                    const cs = getComputedStyle(el)
                    if (cs.position === "fixed" || cs.visibility === "hidden" || cs.display === "none") return false
                    if ((el as HTMLElement).closest("[popover], [data-storelib-cart-panel], [data-storelib-search-panel]")) return false
                    let a: Element | null = el.parentElement
                    while (a) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return false; a = a.parentElement }
                    const b = el.getBoundingClientRect()
                    return b.width > 0 && (b.right > vw + 1 || b.left < -1)
                  })
                  .slice(0, 5)
                  .map((el) => `${(el as HTMLElement).className || el.tagName} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`)
                const h1 = document.querySelector("h1")
                const h1Box = h1?.getBoundingClientRect()
                return { scrollWidth: document.documentElement.scrollWidth, vw, wide, h1: h1Box ? { w: h1Box.width, h: h1Box.height } : null, text: document.body.innerText.length }
              })
              check(`${t.id}: ${p.key} at ${width}${reduce ? " (reduced motion)" : ""}: nothing scrolls sideways`, r.scrollWidth <= width && r.wide.length === 0, r)
              check(`${t.id}: ${p.key} at ${width}${reduce ? " (reduced motion)" : ""}: the h1 is drawn`, !!r.h1 && r.h1.w > 0 && r.h1.h > 0 && r.text > 200, r)
              await page.close()
            }
          }
        }
      }
    } finally {
      await browser.close()
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.slice(0, 60).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
