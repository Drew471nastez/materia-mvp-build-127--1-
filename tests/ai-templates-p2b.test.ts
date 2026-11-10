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
import { targetOf } from "@/lib/storelib-ai/templates/kit-b"
import { validateSite, errorsOf } from "@/lib/ai-builder/agent/validate"
import { completenessIssues, readSitePlan } from "@/lib/ai-builder/agent/site-plan"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import { BUSINESS_KINDS } from "@/lib/storelib-ai/direction/brief"
import { SITE_STORIES } from "@/lib/storelib-ai/layout"
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
    check(`${t.id}: home, product, collection, shop, search, about and contact`, ["home", "product", "collection", "products", "search", "about", "contact"].every((k) => keys.includes(k)) && keys[0] === "home", keys)
    const home = t.pages.find((p) => p.key === "home")!
    const own = home.sections.filter((s) => !s.group)
    check(`${t.id}: home has 10 to 14 sections of its own, six or more kinds`, own.length >= 10 && own.length <= 14 && new Set(own.map((x) => x.type)).size >= 6, own.length)
    for (const p of t.pages) {
      const h = p.sections.find((s) => s.group === "header")
      const f = p.sections.find((s) => s.group === "footer")
      check(`${t.id}: ${p.key} has the template's own header first and footer last`, !!h && !!f && !!t.files[`sections/${h.type}.storelib`] && !!t.files[`sections/${f.type}.storelib`] && p.sections[0] === h && p.sections[p.sections.length - 1] === f)
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
    /* The store has two published reviews (CAPS.reviews): a section that prints them shows real proof. */
    const slop = slopIssues({ sources, rendered: drawn, tokens: t.tokens, facts: { reviews: CAPS.reviews.count > 0 } })
    check(`${t.id}: no anti-slop P0 and the warning budget holds`, slop.filter((i) => i.severity === "error").length === 0, slop.filter((i) => i.severity === "error"))
    if (process.env.VERBOSE) for (const w of slop.filter((i) => i.severity === "warning")) console.log(`        slop warn ${w.code}: ${w.message.slice(0, 140)}`)

    /* 8. image slots: P2a's shape (6 to 16, alt, an allowed aspect, P1's generate call, every target an image setting) */
    const ASPECTS = new Set(["1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9", "21:9", "9:16"])
    check(`${t.id}: 6 to 16 image slots`, t.imageSlots.length >= 6 && t.imageSlots.length <= 16, t.imageSlots.length)
    const targeted = new Set<string>()
    for (const s of t.imageSlots) {
      check(`${t.id}: slot ${s.key} has a photographic prompt, an allowed aspect, alt text and a target`, s.prompt.length >= 60 && ASPECTS.has(s.aspect) && s.alt.length > 5 && s.targets.length > 0 && !/lorem|placeholder/i.test(s.prompt), s)
      check(`${t.id}: slot ${s.key} carries P1's generate_image call`, !!s.generate && ["landscape", "portrait", "square"].includes(s.generate.aspect) && !!s.generate.purpose && !!s.generate.style, s.generate)
      for (const target of s.targets) {
        const hit = targetOf(t, target)
        const schema = hit ? schemaOf(t.files[`sections/${hit.section.type}.storelib`]) : null
        const setting = hit && schema ? (hit.block ? schema.blocks?.find((d) => d.type === hit.block!.type)?.settings : schema.settings)?.find((x) => x.id === target.setting) : null
        check(`${t.id}: slot ${s.key} › ${target.page}/${target.section}${target.block ? `/${target.block}` : ""}.${target.setting} is an image setting`, setting?.type === "image_picker")
        targeted.add(`${target.page}/${target.section}/${target.block ?? ""}/${target.setting}`)
      }
    }
    check(`${t.id}: slot keys are unique`, new Set(t.imageSlots.map((s) => s.key)).size === t.imageSlots.length)
    /* Imagery is mandatory where the design calls for it: every picture setting placed anywhere has a slot. */
    for (const p of t.pages) {
      for (const s of p.sections) {
        const schema = schemaOf(t.files[`sections/${s.type}.storelib`])
        for (const x of schema.settings ?? []) if (x.type === "image_picker") check(`${t.id}: ${p.key} › ${s.id}.${x.id} has an image slot`, targeted.has(`${p.key}/${s.id}//${x.id}`))
        for (const b of s.blocks ?? []) for (const x of schema.blocks?.find((d) => d.type === b.type)?.settings ?? []) if (x.type === "image_picker") check(`${t.id}: ${p.key} › ${s.id}/${b.id}.${x.id} has an image slot`, targeted.has(`${p.key}/${s.id}/${b.id}/${x.id}`))
      }
    }

    /* 8b. bindings: real picker settings of placed sections */
    check(`${t.id}: at least two bindings`, t.bindings.length >= 2)
    for (const bnd of t.bindings) {
      const section = t.pages.find((p) => p.key === bnd.page)?.sections.find((x) => x.id === bnd.section)
      const setting = section ? schemaOf(t.files[`sections/${section.type}.storelib`]).settings?.find((x) => x.id === bnd.setting) : null
      const want: Record<string, string[]> = { product: ["product_picker"], products: ["product_list"], collection: ["collection_picker", "collection_list"], form: ["form_picker"], menu: ["link_list"] }
      check(`${t.id}: binding ${bnd.page}/${bnd.section}.${bnd.setting} is a ${bnd.kind} picker`, !!setting && want[bnd.kind].includes(setting.type) && bnd.why.length > 10)
    }

    /* 8c. the site as the agent's finish gate reads it (the plan the way P2a's templatePlan writes one) */
    const settings = { menus: t.menus }
    const siteErrors = errorsOf(validateSite({ pages: t.pages, sources: t.files, settings, caps: CAPS, mode: "blank" }))
    check(`${t.id}: the site validates (types, bindings, links, menus, own chrome)`, siteErrors.length === 0, siteErrors)
    const rawPlan = [...t.pages.map((p) => ({ key: p.key, sections: p.sections.filter((x) => !x.group).map((x) => `${x.type}: ${x.name}`) })), ...["cart", "404"].map((key) => ({ key, sections: [], reason: "The platform's working layout in the site's tokens is enough here." }))]
    const plan = readSitePlan(rawPlan, CAPS, null)
    check(`${t.id}: its plan is a valid site plan`, plan.ok === true, plan.ok ? undefined : plan.missing)
    const complete = errorsOf(completenessIssues({ pages: t.pages, sources: t.files, settings, caps: CAPS, mode: "blank", plan: plan.ok ? plan.plan : null }))
    check(`${t.id}: complete by the finish rules (home, pages, templates, own header and footer, every page reachable)`, complete.length === 0, complete)
    check(`${t.id}: every file carries the template's prefix`, Object.keys(t.files).every((p) => p.startsWith(`sections/ai_${t.prefix}_`)))
    check(`${t.id}: its fonts are offered and the display face is not a default`, [t.tokens.fonts.heading, t.tokens.fonts.body].every((f) => OFFERED_FAMILIES.has(f)) && !isSlopDisplayFont(t.tokens.fonts.heading))
    check(`${t.id}: industries are O2 business kinds, stories are O5 stories`, t.industries.every((k) => (BUSINESS_KINDS as readonly string[]).includes(k)) && t.stories.every((x) => SITE_STORIES.some((st) => st.id === x)), { industries: t.industries, stories: t.stories })
    check(`${t.id}: design intent is written`, !!t.design.thesis && t.design.signature.length > 0 && t.design.avoid.length > 0 && t.design.layout.length > 0)

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
