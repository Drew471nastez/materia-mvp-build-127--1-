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
import { headerScrollCss, panelCss, prefs, scrollSetting, targetOf, toolButton, withImages } from "@/lib/storelib-ai/templates/kit-b"
import { SITE_TEMPLATES } from "@/lib/storelib-ai/templates/registry"
import { MOTION_ISLAND_KINDS, motionFindings } from "@/lib/storelib-theme/motion-islands"
import { validateSite, errorsOf } from "@/lib/ai-builder/agent/validate"
import { completenessIssues, readSitePlan } from "@/lib/ai-builder/agent/site-plan"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import { BUSINESS_KINDS } from "@/lib/storelib-ai/direction/brief"
import { SITE_STORIES } from "@/lib/storelib-ai/layout"
import { CAPS, PIXEL, PRODUCTS, SVG, dataFor, filled, pageHtml, schemaOf, templateFor, themeOf } from "./ai-templates-p2b-kit"
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types"
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

/**
 * The inner elements P3's runtime reads (components/website-builder/motion-islands/islands.ts):
 * pin-horizontal a [data-motion-stage] and a [data-motion-track]; scroll-scrub [data-motion-frame]s
 * or a video[data-motion-video]; parallax-depth layers marked [data-motion-depth]; image-trail a
 * [data-motion-images] holding pictures (a marquee falls back to its first child). Read from the drawn markup,
 * each island to its own closing tag.
 */
function islandStructure(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\sdata-storelib-motion="([a-z0-9-]+)"[^>]*>/gi)) {
    const tag = m[1].toLowerCase()
    const kind = m[2]
    const start = (m.index ?? 0) + m[0].length
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
    re.lastIndex = start
    let depth = 1
    let end = html.length
    for (let x = re.exec(html); x; x = re.exec(html)) {
      depth += x[1] ? -1 : 1
      if (depth === 0) { end = x.index; break }
    }
    const inner = html.slice(start, end)
    const has = (attr: string) => new RegExp(`\\s${attr}(?=[\\s=>])`).test(inner)
    const where = `${kind} (${/class="([^"]*)"/.exec(m[0])?.[1] ?? tag})`
    if (kind === "pin-horizontal" && !(has("data-motion-stage") && has("data-motion-track"))) out.push(`${where}: no [data-motion-stage] with a [data-motion-track]`)
    if (kind === "scroll-scrub" && !(has("data-motion-frame") || /<video\b[^>]*data-motion-video/.test(inner))) out.push(`${where}: no [data-motion-frame] or video[data-motion-video]`)
    if (kind === "parallax-depth" && !has("data-motion-depth")) out.push(`${where}: no layer marked [data-motion-depth]`)
    if (kind === "image-trail" && !(has("data-motion-images") && /<img\b/.test(inner))) out.push(`${where}: no [data-motion-images] holding pictures`)
  }
  return out
}

/** Run in the page (as a string: no bundler helpers reach the browser): visible media boxes that are painted and hold nothing. */
const EMPTY_MEDIA = `(function(){
      const out = []
      const visible = (el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 && !el.closest("[popover],[hidden],[data-storelib-cart-panel],[data-storelib-search-panel],[data-storelib-cart-line],[data-storelib-search-result]") }
      for (const img of document.querySelectorAll("[data-p2b] img")) if (!(img.getAttribute("src") ?? "").trim() && visible(img)) out.push(\`img no src: \${(img).className}\`)
      for (const el of document.querySelectorAll("[data-p2b] *")) {
        if (!visible(el)) continue
        const cls = typeof (el).className === "string" ? (el).className : ""
        if (!/media|frame|fig|stand|still|empty|none|photo|pic|image|img|cover|mat|stage|dial|ring|blank|shot|visual/i.test(cls)) continue
        const b = el.getBoundingClientRect()
        if (b.width < 48 || b.height < 48) continue
        if (el.querySelector("img[src]:not([src='']),video,svg,canvas,picture")) continue
        if ((el.textContent ?? "").trim()) continue
        { const cs = getComputedStyle(el); const painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || cs.outlineStyle !== 'none'; if (!painted) continue; if (cs.backgroundImage !== 'none') continue; if ([...el.querySelectorAll('*')].some((c) => { const d = getComputedStyle(c); return d.backgroundColor !== 'rgba(0, 0, 0, 0)' || d.backgroundImage !== 'none' })) continue; const before = getComputedStyle(el, '::before'), after = getComputedStyle(el, '::after'); if ([before, after].some((d) => d.content !== 'none' && (d.backgroundImage !== 'none' || d.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(d.borderTopWidth) > 0))) continue }
        if (el.children.length && [...el.querySelectorAll("*")].some((c) => getComputedStyle(c).borderStyle !== "none" && c.getBoundingClientRect().width > 20)) continue
        out.push(\`empty frame: \${el.tagName.toLowerCase()}.\${cls.split(" ")[0]} \${Math.round(b.width)}x\${Math.round(b.height)}\`)
      }
      return [...new Set(out)]
})()`

const MOTION_KINDS: readonly string[] = MOTION_ISLAND_KINDS

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
    check(`${t.id}: its plan is a valid site plan`, plan.ok === true, plan.ok ? undefined : (plan as { missing?: string[] }).missing)
    const complete = errorsOf(completenessIssues({ pages: t.pages, sources: t.files, settings, caps: CAPS, mode: "blank", plan: plan.ok ? plan.plan : null }))
    check(`${t.id}: complete by the finish rules (home, pages, templates, own header and footer, every page reachable)`, complete.length === 0, complete)
    check(`${t.id}: every file carries the template's prefix`, Object.keys(t.files).every((p) => p.startsWith(`sections/ai_${t.prefix}_`)))
    check(`${t.id}: its fonts are offered and the display face is not a default`, [t.tokens.fonts.heading, t.tokens.fonts.body].every((f) => OFFERED_FAMILIES.has(f)) && !isSlopDisplayFont(t.tokens.fonts.heading))
    check(`${t.id}: industries are O2 business kinds, stories are O5 stories`, t.industries.every((k) => (BUSINESS_KINDS as readonly string[]).includes(k)) && t.stories.every((x) => SITE_STORIES.some((st) => st.id === x)), { industries: t.industries, stories: t.stories })
    check(`${t.id}: design intent is written`, !!t.design.thesis && t.design.signature.length > 0 && t.design.avoid.length > 0 && t.design.layout.length > 0)

    /* 9. motion */
    const allSrc = Object.values(t.files).join("\n")
    const kinds = new Set([...allSrc.matchAll(/data-storelib-motion="([a-z0-9-]+)"/g)].map((m) => m[1]))
    check(`${t.id}: uses at least three kinds of P3 motion island`, kinds.size >= 3, [...kinds])
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

  /* 10b. P3's contract: every island on every drawn page of every template in the library (P2a's and P2b's) has only real params in range, and no page over the showcase or WebGL limits. */
  for (const t of SITE_TEMPLATES) {
    for (const p of withImages(t, Object.fromEntries(t.imageSlots.map((s) => [s.key, PIXEL])))) {
      const { html } = pageHtml(t, p.sections, p.key)
      const found = motionFindings(html)
      check(`${t.id}: ${p.key} has no motion island findings (P3 motionFindings)`, found.length === 0, found)
      const missing = islandStructure(html)
      check(`${t.id}: ${p.key}: every island has the inner elements its runtime reads`, missing.length === 0, missing)
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
      /*
        Untouched templates (round P, P5's render.empty_media and the critic's image-missing): every
        template in the library, before any picture is made and with a store whose products have no
        pictures, draws no <img> without an address and no visibly empty media box. A designed
        fallback (drawn art, words) is fine; a painted empty frame is not.
      */
      for (const t of SITE_TEMPLATES) {
        for (const p of t.pages) {
          const { html } = pageHtml(t, p.sections, p.key, { bare: true })
          const noSrc = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/data-(?:line|result)-image/.test(tag) && !/\ssrc="[^"]+"/.test(tag))
          check(`${t.id}: ${p.key} with no pictures draws no <img> without an address`, noSrc.length === 0, noSrc.slice(0, 3))
          for (const width of [390, 1440]) {
            const page = await browser.newPage()
            await page.setViewport({ width, height: 900 })
            await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
            await page.setRequestInterception(true)
            page.on("request", (req) => (req.url().startsWith("data:") ? req.continue() : req.abort()))
            await page.setContent(html, { waitUntil: "load" })
            const empty = (await page.evaluate(EMPTY_MEDIA)) as string[]
            check(`${t.id}: ${p.key} at ${width} with no pictures shows no empty media box`, empty.length === 0, empty)
            await page.close()
          }
        }
      }
    } finally {
      await browser.close()
    }
  }


  console.log("\n── round Q2: the P2b chrome helpers")
  {
    const chip = prefs("zz")
    check("prefs is one compact chip: a button with the current language and currency opening a panel with both lists", /class="zz-loc__chip"[^>]*popovertarget="zz-loc-\{\{ section\.id \}\}"/.test(chip) && /data-storelib-locale-current/.test(chip) && /data-storelib-currency-current/.test(chip) && /popover>[\s\S]*data-storelib-locale-list[\s\S]*data-storelib-currency-list/.test(chip), chip.slice(0, 300))
    check("  a second chip in the same section gets its own id, and can open upwards", prefs("zz", { where: "d", up: true }).includes('id="zz-loc-d-{{ section.id }}"') && prefs("zz", { up: true }).includes("zz-loc--up"))
    for (const kind of ["search", "account", "cart", "menu"] as const) {
      const b = toolButton("zz", kind, { target: "zz-d" })
      check(`toolButton ${kind}: an icon (host set, inline fallback) with its words as aria-label, no visible word`, /data-storelib-icon="[a-z-]+"/.test(b) && /<svg[^>]*stroke-width="1\.6"/.test(b) && /aria-label="\{\{ settings\.\w+_label \}\}"/.test(b) && !/>\{\{ settings\.\w+_label \}\}</.test(b), b.slice(0, 200))
    }
    check("  the cart button carries the count badge", toolButton("zz", "cart").includes('class="zz-badge" data-storelib-cart-count'))
    const sc = scrollSetting("hide") as { default?: string; options?: { value: string }[] }
    check("scrollSetting: static, sticky, shrink, hide", sc.default === "hide" && JSON.stringify(sc.options?.map((o) => o.value)) === JSON.stringify(["static", "sticky", "shrink", "hide"]))
    const css = headerScrollCss("zz", "zz__notice")
    const kf = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join(" ")
    check("headerScrollCss: reads the host's data-scrolled / data-scroll-dir / data-over-hero, keyframes move only opacity and transform", /data-scrolled/.test(css) && /data-scroll-dir="down"/.test(css) && /data-over-hero="true"/.test(css) && [...kf.matchAll(/([a-z-]+)\s*:/g)].every((m) => ["opacity", "transform"].includes(m[1])))
    check("  never a transform on the header root (it would trap the fixed cart and search panels)", [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /(^|;|\s)transform\s*:/.test(m[2])).flatMap((m) => m[1].split(",")).map((sel) => { let x = sel.trim(); for (let i = 0; i < 4; i++) x = x.replace(/:(?:is|not|has)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, ""); return x }).every((x) => !/^\.zz(--[a-z]+)?$/.test(x)) && /animation-timeline: scroll\(root\)/.test(css))
    const pc = panelCss("zz")
    check("panelCss: round icon buttons and the chip's look, no outlined option buttons", pc.includes(".zz-ib {") && pc.includes(".zz-loc__panel") && !/\.zz-pref__opt\s*\{[^}]*border:\s*1px solid/.test(pc))
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
