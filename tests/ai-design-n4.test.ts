/**
 * Round N (N4): design intelligence for the AI builder.
 *
 *   1. Fonts: a curated type library whose every face loads on Storelib (in
 *      the Typography lists and font-link's weights); the concept check
 *      refuses a default display face (Inter, Poppins...) unless the creator
 *      asked for it, and a face that cannot load; directions use loadable,
 *      non-default faces.
 *   2. The anti-slop evaluator's type and layout rules: default display
 *      fonts, fixed type with no fluid scale and default tracking, equal card
 *      grids, the centred hero over cards, one rhythm everywhere, emoji as
 *      icons, stock copy, gradient blobs, rounded-everything; a clean page
 *      stays clean.
 *   3. The interactive examples: every one compiles and passes the agent's
 *      own file check (validateFile, strict) and the render check with its
 *      preset blocks, has no anti-slop error, respects reduced motion, and the
 *      header and footer use the shared hook names; search_knowledge hands
 *      one over by id; the generated module is current.
 *   4. Directions and knowledge for many subjects; the brief and the system
 *      prompt teach a free site's own chrome, 10+ sections, type systems and
 *      restrained interactions.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-design-n4.test.ts
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { OFFERED_FAMILIES, FAMILY_WEIGHTS } from "@/lib/website-builder/font-link"
import { HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS, TYPE_LIBRARY_FAMILIES } from "@/lib/website-builder/font-options"
import {
  TYPE_SYSTEMS,
  SLOP_DISPLAY_FONTS,
  isSlopDisplayFont,
  fluidTypeScale,
  typeSystemCss,
  suggestTypeSystems,
} from "@/lib/storelib-ai/library/type-systems"
import {
  DIRECTIONS,
  allExamples,
  allKnowledge,
  conceptFromDirection,
  contrastRatio,
  exampleById,
  knowledgeById,
  matchExamples,
  runSearchKnowledge,
  suggestDirections,
  validateConcept,
  type VisualConcept,
} from "@/lib/storelib-ai/library"
import { EXAMPLE_SOURCES } from "@/lib/storelib-ai/library/examples.generated"
import { evaluateSlop, slopIssues, SLOP_RULES } from "@/lib/ai-builder/slop"
import { validateFile } from "@/lib/ai-builder/agent/validate"
import { renderCheck, esbuildScriptParser } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { storefrontData } from "@/lib/website-builder/storefront-data"
import { AGENT_SYSTEM, briefMessage } from "@/lib/ai-builder/agent/prompts"
import { HEADLESS_HOOK_GUIDE } from "@/lib/ai-builder/runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const fam = (v: string) => v.split(",")[0].replace(/["']/g, "").trim()

const CONCEPT: VisualConcept = {
  name: "Kiln Register",
  mood: ["earthy", "exact", "warm"],
  styles: ["organic", "editorial"],
  typeSystem: { display: "Gloock", body: "Spectral", mono: "DM Mono", scaleRatio: 1.333, rule: "labels in mono caps tracked 0.1em" },
  palette: { mode: "light", background: "#efe3d6", text: "#2b2522", muted: "#5e534c", accent: "#9c4f2e", accentUse: "the buy button and batch numbers" },
  layout: { principles: ["process as a sideways strip", "one huge photo per firing"], density: "balanced", radius: 0 },
  motion: { stance: "subtle", moves: ["photos reveal on scroll"] },
  imagery: { direction: "Hands, clay and kiln light, close crops", avoid: ["white cut outs"] },
  signatureMoves: ["batch numbers on every piece"],
}

const section = (n: number, css: string, html: string, schema = `{ "name": "S${n}", "settings": [] }`) => ({ path: `sections/ai_s${n}.storelib`, content: `<template>\n${html}\n</template>\n<style scoped>\n${css}\n</style>\n<schema>\n${schema}\n</schema>` })

async function main() {
  console.log("\n1. fonts: a type library that loads, and no default display face")
  {
    const offered = new Set([...OFFERED_FAMILIES])
    const systemFaces = TYPE_SYSTEMS.flatMap((t) => [t.display.family, t.body.family, ...(t.mono ? [t.mono.family] : [])])
    const missing = [...new Set(systemFaces)].filter((f) => !offered.has(f) || !(f in FAMILY_WEIGHTS))
    check("every face in every type system is offered by the Typography lists and has its weights", missing.length === 0, missing)
    check("the library's faces are in the heading and body lists (a creator can pick them too)", TYPE_LIBRARY_FAMILIES.every((f) => HEADING_FONT_OPTIONS.some((o) => o.value === f) && BODY_FONT_OPTIONS.some((o) => o.value === f)))
    check("no family is offered twice", new Set(HEADING_FONT_OPTIONS.map((o) => o.value)).size === HEADING_FONT_OPTIONS.length)
    check("no type system uses a default face as its display", TYPE_SYSTEMS.every((t) => !isSlopDisplayFont(t.display.family)), TYPE_SYSTEMS.filter((t) => isSlopDisplayFont(t.display.family)).map((t) => t.id))
    check("at least 18 systems, across six voices", TYPE_SYSTEMS.length >= 18 && new Set(TYPE_SYSTEMS.map((t) => t.voice)).size === 6)
    check("the overused defaults are on the slop list", ["inter", "roboto", "open sans", "lato", "montserrat", "poppins", "arial", "helvetica", "system-ui"].every((f) => SLOP_DISPLAY_FONTS.includes(f)))
    check("isSlopDisplayFont reads a CSS stack by its first family", isSlopDisplayFont(`"Poppins", sans-serif`) && isSlopDisplayFont("system-ui, -apple-system") && !isSlopDisplayFont(`"Fraunces", Inter, serif`))
    const scale = fluidTypeScale(1.333)
    check("the fluid scale is clamp() from step 1 up, step 0 is 1rem", scale["--step-0"] === "1rem" && [1, 2, 3, 4, 5, 6].every((s) => /^clamp\(/.test(scale[`--step-${s}`])), scale)
    const big = /clamp\(([\d.]+)rem, [^,]+, ([\d.]+)rem\)/.exec(scale["--step-6"])
    check("the largest step is smaller on a phone than on a wide screen", !!big && Number(big[1]) < Number(big[2]) && Number(big[1]) <= 3.2, scale["--step-6"])
    check("a system's CSS carries the scale, tracking and leading", /--step-6: clamp\(/.test(typeSystemCss(TYPE_SYSTEMS[0])) && /--display-tracking: -0\.02em/.test(typeSystemCss(TYPE_SYSTEMS[0])))
    const fit = suggestTypeSystems({ industry: "fitness coach", count: 3, seed: "a" })
    check("type systems for a brief: three, three different voices, one made for fitness among them", fit.length === 3 && new Set(fit.map((t) => t.voice)).size === 3 && fit.some((t) => t.suits.some((s) => s.startsWith("fitness"))), fit.map((t) => t.id))
    const entry = knowledgeById("typography-type-library")
    check("the type library entry names every system's display face", !!entry && TYPE_SYSTEMS.every((t) => entry.body.includes(t.display.family)), TYPE_SYSTEMS.filter((t) => !entry?.body.includes(t.display.family)).map((t) => t.display.family))

    check("a concept with a characterful display face validates", validateConcept(CONCEPT).length === 0, validateConcept(CONCEPT))
    const inter = validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: "Inter" } })
    check("Inter as the display face is refused, with the way out", inter.some((e) => /typeSystem\.display: "Inter" is the face every generated site uses/.test(e) && /default-fonts/.test(e)), inter)
    check("Poppins and system-ui too", validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: "Poppins" } }).length > 0 && validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: "system-ui" } }).length > 0)
    check("allowed when the creator asked for it (allow default-fonts)", validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: "Inter", body: "Inter" }, allow: ["default-fonts"] }).length === 0)
    check("Inter as body text is fine", validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, body: "Inter" } }).length === 0)
    const ghost = validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: "Neue Haas Grotesk", mono: "Comic Mono" } })
    check("a face that cannot load on Storelib is refused, display and mono", ghost.some((e) => /typeSystem\.display: "Neue Haas Grotesk" cannot load/.test(e)) && ghost.some((e) => /typeSystem\.mono/.test(e)), ghost)
    check("a stack is read by its first family", validateConcept({ ...CONCEPT, typeSystem: { ...CONCEPT.typeSystem, display: `"Gloock", serif` } }).length === 0)
  }

  console.log("\n2. directions: many subjects, loadable type, contrast")
  {
    check("at least 30 directions", DIRECTIONS.length >= 30, DIRECTIONS.length)
    const bad = DIRECTIONS.filter((d) => isSlopDisplayFont(d.type.display) || ![d.type.display, d.type.body].every((f) => OFFERED_FAMILIES.has(f)))
    check("every direction's faces load and none displays in a default face", bad.length === 0, bad.map((d) => `${d.id}: ${d.type.display}/${d.type.body}`))
    check("every direction validates as a concept", DIRECTIONS.every((d) => validateConcept(conceptFromDirection(d)).length === 0), DIRECTIONS.filter((d) => validateConcept(conceptFromDirection(d)).length).map((d) => `${d.id}: ${validateConcept(conceptFromDirection(d)).join("; ")}`))
    check("text and muted pass 4.5:1 on every background", DIRECTIONS.every((d) => (contrastRatio(d.palette.text, d.palette.background) ?? 0) >= 4.5 && (contrastRatio(d.palette.muted, d.palette.background) ?? 0) >= 4.5))
    check("the new ones carry layout moves", DIRECTIONS.filter((d) => d.layout).length >= 30)
    const subjects = ["architecture", "bakery", "wine", "hotel", "outdoor", "tattoo", "books", "film", "non-profit", "skincare", "furniture", "jewellery", "record-label", "dance", "consulting", "plants", "saas", "course", "wedding", "podcast"]
    const uncovered = subjects.filter((s) => !DIRECTIONS.some((d) => d.suits.includes(s)))
    check("subjects from a gallery's taxonomy each have a direction", uncovered.length === 0, uncovered)
    check("an architecture studio opens with Plan and Section", suggestDirections("architecture studio", { seed: "x" })[0].id === "plan-and-section", suggestDirections("architecture studio", { seed: "x" }).map((d) => d.id))
    const bakery = suggestDirections("A small bakery in Leeds that sells sourdough", { seed: "y" }).map((d) => d.id)
    check("a brief as the industry still finds the bakery directions", bakery.includes("morning-crumb") || bakery.includes("mise-en-place"), bakery)
    const photog = suggestDirections("wedding photographer", { seed: "z" }).map((d) => d.id)
    check("photographer matches photography directions", photog.includes("wedding-light"), photog)
    check("a one letter word matches nothing (\"a\" is not \"agency\")", suggestDirections("a", { seed: "q", count: 3 }).length === 3)
    const industries = allKnowledge().filter((e) => e.category === "industry").map((e) => e.id)
    check("industry knowledge for the new subjects", ["industry-architecture", "industry-cafe-bakery", "industry-hotel-travel", "industry-beauty-skincare", "industry-furniture-interior", "industry-publishing-books", "industry-non-profit", "industry-film-video", "industry-craft-ceramics", "industry-wine-drinks", "industry-jewellery", "industry-record-label", "industry-dance-studio", "industry-professional-services", "industry-plants-florist", "industry-podcast-media", "industry-wedding-photography", "industry-tattoo-barber", "industry-outdoor-gear"].every((id) => industries.includes(id)))
    check("the inspiration lessons and the gallery styles are entries", ["core-inspiration", "style-unusual-layout", "style-grid-led", "style-photographic", "style-colourful-flat", "style-illustrative"].every((id) => !!knowledgeById(id)))
    const noIo = allKnowledge().filter((e) => /new IntersectionObserver/.test(e.body)).map((e) => e.id)
    check("no entry teaches IntersectionObserver code (a section script cannot observe the page)", noIo.length === 0, noIo)
  }

  console.log("\n3. anti-slop: type and layout")
  {
    check("the new rules are listed", ["default-fonts", "type-scale", "card-grid", "hero-three-cards", "layout-rhythm", "emoji-icons", "stock-copy"].every((r) => (SLOP_RULES as readonly string[]).includes(r)))
    const rule = (r: ReturnType<typeof evaluateSlop>, name: string, sev?: string) => r.findings.some((f) => f.rule === name && (!sev || f.severity === sev))

    const poppins = evaluateSlop({ html: `<section><h1>Fresh bread</h1></section>`, css: `h1 { font-family: "Poppins", sans-serif; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -0.02em; }` })
    check("a heading in Poppins is a default-fonts error", rule(poppins, "default-fonts", "error"))
    const sys = evaluateSlop({ html: `<section><h2>Menu</h2></section>`, css: `body { font-family: system-ui, sans-serif; } .x { font-family: Arial; }` })
    check("system-ui alone everywhere is an error too", rule(sys, "default-fonts", "error"))
    check("the heading token in Inter is caught", rule(evaluateSlop({ tokens: { fonts: { heading: "Inter", body: "Inter" } } as never }), "default-fonts", "error"))
    check("excused when the concept allows default fonts", rule(evaluateSlop({ html: `<section><h1>Index</h1></section>`, css: `h1 { font-family: Inter; }` }, { ...CONCEPT, allow: ["default-fonts"] }), "default-fonts", "info"))
    check("body text in Inter beside a real display face is fine", !rule(evaluateSlop({ html: `<section><h1>Index</h1><p>x</p></section>`, css: `h1 { font-family: "Gloock", serif; font-size: clamp(2rem, 6vw, 5rem); letter-spacing: -0.02em; } p { font-family: Inter, sans-serif; }` }), "default-fonts"))
    check("reading the theme's font (var) is never called a default", !rule(evaluateSlop({ html: `<section><h1>x</h1></section>`, css: `h1 { font-family: var(--theme-font-heading), serif; }` }), "default-fonts"))

    const fixed = evaluateSlop({ html: `<section><h1>Big</h1></section>`, css: `h1 { font-family: "Anton"; font-size: 72px; } h2 { font-size: 48px; }` })
    check("fixed display sizes with nothing fluid are a type-scale error", rule(fixed, "type-scale", "error"))
    const tracking = evaluateSlop({ html: `<section><h1>Big</h1></section>`, css: `h1 { font-family: "Anton"; font-size: clamp(3rem, 8vw, 8rem); font-weight: 400; }` })
    check("huge display type at default tracking is a warning", rule(tracking, "type-scale", "warn") && !rule(tracking, "type-scale", "error"))
    const fluid = evaluateSlop({ html: `<section><h1>Big</h1></section>`, css: `h1 { font-family: "Anton"; font-size: var(--step-6); letter-spacing: -0.01em; font-weight: 400; }` })
    check("a scale token counts as fluid", !rule(fluid, "type-scale"))

    const cardsHtml = `<section class="s"><h2>Things</h2><div class="g">{% for block in section.blocks %}<div class="card"><h3>{{ block.settings.t }}</h3><p>{{ block.settings.p }}</p></div>{% endfor %}</div></section>`
    const cardsCss = `.g { display: grid; grid-template-columns: repeat(3, 1fr); } @media (min-width: 1px) { .g { gap: 16px; } }`
    const three = evaluateSlop({ sources: [1, 2, 3].map((n) => section(n, cardsCss, cardsHtml)) })
    check("three sections that are the same grid of cards are an error", rule(three, "card-grid", "error"), three.findings.map((f) => f.rule))
    check("two are a warning", rule(evaluateSlop({ sources: [1, 2].map((n) => section(n, cardsCss, cardsHtml)) }), "card-grid", "warn"))
    const products = cardsHtml.replace("for block in section.blocks", "for block in settings.products")
    check("product grids are not called card slop", !rule(evaluateSlop({ sources: [1, 2, 3].map((n) => section(n, cardsCss, products)) }), "card-grid"))

    const heroHtml = `<section class="hero text-center"><h1>We help you grow</h1><a class="btn" href="/a">Start</a></section><section class="f"><div class="feature-card"><h3>A</h3><p>a</p></div><div class="feature-card"><h3>B</h3><p>b</p></div><div class="feature-card"><h3>C</h3><p>c</p></div></section>`
    const hero = evaluateSlop({ html: heroHtml, css: `.hero { text-align: center; } .f { display: grid; grid-template-columns: repeat(3, 1fr); } @media (min-width: 700px) { .f { gap: 24px; } }` })
    check("a centred hero followed by a row of cards is an error", rule(hero, "hero-three-cards", "error"), hero.findings.map((f) => f.rule))
    check("excused only when the concept chose a centred hero", rule(evaluateSlop({ html: heroHtml, css: `.hero { text-align: center; } .f { display: grid; grid-template-columns: repeat(3, 1fr); }` }, { ...CONCEPT, allow: ["centered-hero"] }), "hero-three-cards", "info"))

    const same = [1, 2, 3, 4, 5].map((n) => section(n, `.s${n} { max-width: 1200px; margin: 0 auto; padding: 96px 24px; text-align: center; }`, `<section class="s${n}"><h2>Part ${n}</h2><p>Words for part ${n}.</p></section>`, `{ "name": "S${n}", "settings": [{ "type": "range", "id": "padding_top", "label": "Top", "min": 0, "max": 200, "step": 8, "default": 96 }, { "type": "range", "id": "padding_bottom", "label": "Bottom", "min": 0, "max": 200, "step": 8, "default": 96 }] }`))
    const rhythm = evaluateSlop({ sources: same })
    check("five sections with one width, spacing and alignment are a layout-rhythm warning", rule(rhythm, "layout-rhythm", "warn"), rhythm.findings.map((f) => `${f.rule}:${f.severity}`))
    const varied = [
      section(1, `.a { min-height: 90svh; }`, `<section class="a"><h1>Open</h1></section>`),
      section(2, `.b { max-width: 64ch; padding: 48px 16px; }`, `<section class="b"><p>Story</p></section>`),
      section(3, `.c { overflow-x: auto; }`, `<section class="c"><p>Strip</p></section>`),
      section(4, `.d { position: sticky; top: 0; }`, `<section class="d"><p>Stack</p></section>`),
      section(5, `.e { display: grid; grid-template-columns: minmax(0, 1fr); padding: 160px 16px; }`, `<section class="e"><p>Table</p></section>`),
    ]
    check("varied widths and densities pass", !rule(evaluateSlop({ sources: varied }), "layout-rhythm"))

    const emoji = evaluateSlop({ html: `<section><ul><li><span>🚀</span> Fast</li><li><span>💡</span> Smart</li></ul></section>`, css: "" })
    check("emoji used as icons are an error", rule(emoji, "emoji-icons", "error"))
    const stock = evaluateSlop({ html: `<section><h2>Welcome to our website</h2><p>We are passionate about quality you can trust. Get started today!</p></section>`, css: "" })
    check("stock copy is flagged", rule(stock, "stock-copy", "error"), stock.findings.map((f) => `${f.rule}:${f.severity}`))
    const generic = evaluateSlop({ html: `<section><h2>Our services</h2></section><section><h2>Why choose us</h2></section><section><h2>About us</h2></section>`, css: "" })
    check("three slot headings (Our services, Why choose us, About us) are flagged", rule(generic, "stock-copy"))
    const blobs = evaluateSlop({ html: `<section><div class="blob-a"></div><h2>x</h2></section>`, css: `.bg { background: radial-gradient(circle at 20% 20%, #ff7a59 0%, transparent 60%); }` })
    check("gradient blobs and orbs are a glow finding", rule(blobs, "glow"))
    const round = evaluateSlop({ html: `<section><div class="rounded-2xl"></div><div class="rounded-2xl"></div><div class="rounded-3xl"></div><div class="rounded-2xl"></div><div class="rounded-xl"></div><div class="rounded-2xl"></div><div class="rounded-2xl"></div></section>`, css: "" })
    check("rounded-2xl on everything is a radius warning", rule(round, "radius", "warn"), round.findings.map((f) => `${f.rule}:${f.severity}`))
    check("every new rule links to an existing entry", evaluateSlop({ html: heroHtml + `<ul><li><span>🚀</span>a</li><li><span>💡</span>b</li></ul><h2>Welcome to our website</h2>`, css: `h1 { font-family: Poppins; font-size: 72px; }` }).findings.every((f) => !!knowledgeById(f.knowledge)))
  }

  console.log("\n4. the interactive examples run in Storelib's runtime")
  {
    const dir = join(root, "lib/storelib-ai/library/examples")
    const disk = readdirSync(dir).filter((f) => f.endsWith(".storelib")).sort().map((file) => ({ file, source: readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n") }))
    check("examples.generated.ts is current (node scripts/build-ai-knowledge.mjs)", JSON.stringify(disk) === JSON.stringify(EXAMPLE_SOURCES))
    const ex = allExamples()
    const wanted = ["ai_scroll_reveal", "ai_marquee", "ai_sticky_stack", "ai_hscroll_gallery", "ai_hover_reveal_list", "ai_split_text", "ai_before_after", "ai_tabs", "ai_faq_accordion", "ai_counters", "ai_parallax_media", "ai_video_hero", "ai_site_header", "ai_site_footer"]
    check("every asked for interaction has an example", wanted.every((id) => !!exampleById(id)), ex.map((e) => e.id))
    const parse = await esbuildScriptParser()
    const menus = { "main-menu": { title: "Main", links: [{ title: "Shop", url: "/shop", links: [{ title: "Bread", url: "/shop", links: [] }, { title: "Cakes", url: "/about", links: [] }] }, { title: "About", url: "/about", links: [] }] }, footer: { title: "Help", links: [{ title: "Contact", url: "/contact", links: [] }] } }
    const data = storefrontData({ dynamic: { shop: { name: "Crumb & Co" }, creator: {} } as never, catalog: [], menus: menus as never })
    const theme = { site_chrome: "home" } as unknown as ThemeSettingsValues
    for (const e of ex) {
      const path = `sections/${e.id}.storelib`
      const schema = JSON.parse(/<schema>([\s\S]*?)<\/schema>/.exec(e.source)![1]) as { type: string; presets?: { blocks?: { type: string; settings?: Record<string, unknown> }[] }[] }
      const blocks = (schema.presets?.[0]?.blocks ?? []).map((b, i) => ({ id: `b${i}`, type: b.type, settings: b.settings ?? {} }))
      const group = /"kind": "header"/.test(e.source) ? "header" : /"kind": "footer"/.test(e.source) ? "footer" : undefined
      const instance = { id: `s-${e.id}`, type: e.id, name: e.title, settings: {}, blocks, ...(group ? { group } : {}) } as unknown as SectionInstance
      check(`${e.id}: its schema type is its file name`, schema.type === e.id)
      const errors = validateFile(path, e.source, { instances: [instance], theme: theme as never }).filter((i) => i.severity === "error")
      check(`${e.id}: passes the agent's file check (compile, strict rules, draw, manifest, no remote code)`, errors.length === 0, errors)
      const drawn = renderStorelibSection(instance, theme, { template: "index" }, { [path]: e.source }, undefined, data)
      check(`${e.id}: draws with its preset blocks`, drawn.ok === true && drawn.html.length > 200, drawn.ok ? drawn.html.length : drawn.errors)
      const r = await renderCheck({ page: "home", sections: [instance], sources: { [path]: e.source }, theme, template: "index", data, parseScript: parse ?? undefined, extraRoutes: ["/about", "/shop", "/contact"] })
      const rErrors = r.issues.filter((i) => i.severity === "error")
      check(`${e.id}: the render check finds no error (links, buttons, script, overflow)`, rErrors.length === 0, rErrors)
      const slop = slopIssues({ sources: [{ path, content: e.source }] }, CONCEPT).filter((i) => i.severity === "error")
      check(`${e.id}: no anti-slop error`, slop.length === 0, slop)
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(e.source)?.[1] ?? ""
      const moves = /@keyframes|transition\s*:|animation\s*:/.test(style)
      check(`${e.id}: motion only with prefers-reduced-motion handled`, !moves || /prefers-reduced-motion/.test(style))
      check(`${e.id}: no focus outline removed, no positive tabindex`, !/outline\s*:\s*(?:none|0)\b/.test(style) && !/tabindex="[1-9]/.test(e.source))
      check(`${e.id}: no em dash`, !/—/.test(e.source))
    }
    const header = exampleById("ai_site_header")!.source
    const footer = exampleById("ai_site_footer")!.source
    const shared = ["data-storelib-search-panel", "data-storelib-search-input", "data-storelib-search-results", "data-storelib-search-result", "data-result-title", "data-result-price", "data-result-image", "data-result-url", "data-storelib-search-empty", "data-storelib-search-loading", "data-storelib-search-close", "data-storelib-locale-list", "data-storelib-locale-option", "data-option-label", "data-storelib-currency-list", "data-storelib-currency-option", "data-storelib-cart-panel", "data-storelib-cart-lines", "data-storelib-cart-line", "data-line-inc", "data-line-dec", "data-line-remove", "data-storelib-cart-subtotal", "data-storelib-checkout", "data-storelib-cart-close", "data-storelib-cart-count"]
    check("the own header uses the shared hook names for search, cart, language and currency", shared.every((h) => header.includes(h)), shared.filter((h) => !header.includes(h)))
    check("the own footer has a sign up and the current language and currency", /data-storelib-form="subscribe"/.test(footer) && /data-storelib-locale-current/.test(footer) && /data-storelib-currency-current/.test(footer))
    check("each pattern element is hidden for the page to copy", /data-storelib-cart-line hidden/.test(header) && /data-storelib-search-result hidden/.test(header) && /data-storelib-locale-option hidden/.test(header))
    check("the mega menu and mobile menu are popovers (Escape and light dismiss from the browser)", /popovertarget="mm-\{\{ section\.id \}\}/.test(header) && /id="mob-\{\{ section\.id \}\}" popover/.test(header))
    check("the before and after script only sets a style, as the sandbox allows", /style\.setProperty\("--pos"/.test(exampleById("ai_before_after")!.source) && !/innerHTML|document|window/.test(exampleById("ai_before_after")!.source))
    check("counters print only a number the creator typed", /block\.settings\.value != 0/.test(exampleById("ai_counters")!.source) && !/"default": \d/.test(/"id": "value"[^}]*/.exec(exampleById("ai_counters")!.source)![0]))

    const byId = runSearchKnowledge({ query: "ai_site_header" })
    check("search_knowledge hands over an example by id, in full", byId.entries[0]?.id === "ai_site_header" && byId.entries[0].body.includes("<schema>") && byId.entries[0].body.includes("data-storelib-cart-panel"))
    check("and by \"example\" with what it does", matchExamples("example of a marquee")[0]?.id === "ai_marquee" && matchExamples("example tabs keyboard")[0]?.id === "ai_tabs" && matchExamples("example before after slider")[0]?.id === "ai_before_after")
    check("an ordinary search is not crowded by source code", !runSearchKnowledge({ query: "pricing table for coaching packages" }).entries.some((e) => e.id.startsWith("ai_")))
    const lib = knowledgeById("component-interactive-library")
    check("the library entry lists every example", !!lib && ex.every((e) => lib.body.includes(e.id)))
  }

  console.log("\n5. what the agent is told")
  {
    const sys = AGENT_SYSTEM
    check("a senior designer-developer free of any theme", /senior designer-developer/.test(sys) && /free of any theme/.test(sys))
    check("its own header, footer, cart drawer, search and switches with the shared hooks", ["data-storelib-cart-panel", "data-storelib-search-panel", "data-storelib-search-result", "data-storelib-locale-list", "data-storelib-currency-list", "data-storelib-locale-current"].every((h) => sys.includes(h)) && sys.includes(HEADLESS_HOOK_GUIDE) && /NO built-in header, footer/.test(sys))
    check("10 or more sections on home, every page complete", /10 or more sections/.test(sys) && /No page is a single heading/.test(sys))
    check("no default display face, a clamp scale and tracking", /never the display face unless the creator named one/.test(sys) && /clamp\(\) on every heading/.test(sys) && /tracking/.test(sys))
    check("no template layouts and restrained interactions, CSS first, sandbox limits", /centred hero over a row of three cards/.test(sys) && /two or three kinds per site/.test(sys) && /animation-timeline: view\(\)/.test(sys) && /cannot measure the page/.test(sys))
    const ids = [...sys.matchAll(/\bai_[a-z_]+\b/g)].map((m) => m[0]).filter((id) => !/^ai_(?:slug)$/.test(id))
    check("every example the prompt names exists", ids.length >= 14 && ids.every((id) => !!exampleById(id)), ids.filter((id) => !exampleById(id)))
    check("rounds L and M rules kept: concept refusal, real data, links, mobile first, no em dash", /refused concept comes back ok: false/.test(sys) && /ONLY ids from list_capabilities/.test(sys) && /Never href="#"/.test(sys) && /design at 375px wide/.test(sys) && /No em dashes/.test(sys) && !/—/.test(sys))
    const brief = briefMessage({ job: { jobId: "j", installId: "i", creatorId: "c1", prompt: "A ceramics studio selling small batches of mugs", mode: "blank", options: { generation: "blank", category: "fitness_coach" } } as never, caps: null, pages: [{ key: "home", sections: [] }], files: [], knowledge: [], directions: suggestDirections("ceramics", { seed: "c1" }) })
    check("the brief carries type systems that fit, and directions with layout moves", /TYPE SYSTEMS THAT FIT/.test(brief) && /layout: /.test(brief) && (brief.match(/^\* /gm) ?? []).length === 3)
    check("a blank site is told to write its own header and footer with cart, search and switches", /the site's own header and footer included/.test(brief))
    check("the brief still ends on the order of work", /render_check on every page, finish\.$/.test(brief))
  }

  console.log("\n6. the render check knows the cart line's own buttons")
  {
    const src = `<template>\n<section><h2>{{ settings.h }}</h2><aside data-storelib-cart-panel><ul data-storelib-cart-lines><li data-storelib-cart-line hidden><span data-line-title></span><button type="button" data-line-dec>-</button><button type="button" data-line-inc>+</button><button type="button" data-line-remove>Remove</button></li></ul></aside></section>\n</template>\n<schema>\n{ "type": "ai_bag", "name": "Bag", "settings": [{ "type": "text", "id": "h", "label": "H", "default": "Bag" }] }\n</schema>\n`
    const r = await renderCheck({ page: "home", sections: [{ id: "bag", type: "ai_bag", name: "Bag", settings: {} } as unknown as SectionInstance], sources: { "sections/ai_bag.storelib": src }, theme: { site_chrome: "home" } as unknown as ThemeSettingsValues, template: "index" })
    check("data-line-inc, -dec and -remove are not dead buttons", !r.issues.some((i) => i.code === "render.dead_button"), r.issues)
    const dead = await renderCheck({ page: "home", sections: [{ id: "bag", type: "ai_bag", name: "Bag", settings: {} } as unknown as SectionInstance], sources: { "sections/ai_bag.storelib": src.replace(/data-line-remove/, "data-nothing") }, theme: { site_chrome: "home" } as unknown as ThemeSettingsValues, template: "index" })
    check("a button with nothing behind it still is", dead.issues.some((i) => i.code === "render.dead_button"))
    check("the change is the one line in BUTTON_WIRED", /data-line-\(\?:inc\|dec\|remove\)/.test(read("lib/ai-builder/render-check.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
