/**
 * ===========================================================================
 *  THE DESIGN KNOWLEDGE LIBRARY, THE ANTI-SLOP EVALUATOR AND THE REGISTRY
 * ===========================================================================
 * Round L, workstream L6:
 *   - the embedded index matches the markdown on disk and every entry is
 *     valid, non-empty, em dash free, and links only to things that exist;
 *   - retrieval returns the right entries for sample briefs, is
 *     deterministic, respects the token budget and never returns everything;
 *   - the search_knowledge tool speaks the contract's shapes;
 *   - the evaluator flags seeded slop and passes a clean page, relative to a
 *     declared concept;
 *   - the concept schema validates and gives two fitness coaches different
 *     directions;
 *   - every external library entry is complete and honest about licences.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { KNOWLEDGE_SOURCES } from "@/lib/storelib-ai/library/index.generated"
import {
  KNOWLEDGE_CATEGORIES,
  KIND_OF_CATEGORY,
  RESOURCES,
  SEARCH_KNOWLEDGE_TOOL,
  DIRECTIONS,
  allKnowledge,
  capabilitiesFromSite,
  conceptDistance,
  conceptFromDirection,
  contrastRatio,
  estimateTokens,
  formatKnowledge,
  knowledgeById,
  parseEntry,
  retrieveKnowledge,
  runSearchKnowledge,
  searchKnowledge,
  suggestDirections,
  validateConcept,
  type VisualConcept,
} from "@/lib/storelib-ai/library"
import { evaluateSlop, slopIssues, SLOP_RULES, type SlopInput } from "@/lib/ai-builder/slop"
import { ARCHETYPES } from "@/lib/storelib-ai/archetypes"
import { DESIGN_PATTERNS } from "@/lib/storelib-ai/patterns"
import { DESIGN_PRESETS } from "@/lib/website-builder/design-presets"
import { ALL_TOPICS } from "@/lib/storelib-ai/knowledge"
import { AGENT_TOOL_NAMES } from "@/lib/ai-builder/types"

const root = process.cwd()
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : n.endsWith(".md") ? [p] : []
    })
}

const ids = (r: { entries: { entry: { id: string } }[] }) => r.entries.map((e) => e.entry.id)

/* ── seeded pages ─────────────────────────────────────────────────────── */

const SLOP_HTML = `
<section class="hero text-center">
  <span class="badge rounded-full bg-purple-100 text-purple-700">New: AI powered</span>
  <h1 class="bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text">Unlock your potential with seamless coaching</h1>
  <p>Elevate your fitness journey with our powerful, cutting-edge programs.</p>
  <a class="btn btn-primary" href="#">Get started</a> <a class="btn btn-ghost" href="#">Learn more</a>
</section>
<section class="features text-center"><h2>Features</h2><p>Everything you need.</p>
  <div class="grid">
    <div class="card"><svg class="icon"><path d="M0"/></svg><h3>Fast</h3><p>Quick results.</p></div>
    <div class="card"><svg class="icon"><path d="M0"/></svg><h3>Smart</h3><p>Smart plans.</p></div>
    <div class="card"><svg class="icon"><path d="M0"/></svg><h3>Proven</h3><p>Proven methods.</p></div>
  </div>
</section>
<section class="stats text-center"><h2>Trusted by 10,000+ athletes</h2><p>98% satisfaction rate, rated 4.9/5 stars.</p></section>
<section class="testimonials text-center"><h2>What clients say</h2><blockquote>"This program completely changed my life and I feel amazing every day."</blockquote><p>Sarah J.</p></section>
<section class="pricing"><div class="pricing-card">Basic</div><div class="pricing-card">Pro <span class="rounded-full">Most popular</span></div><div class="pricing-card">Elite</div></section>
<div class="tags"><span class="chip rounded-full">Strength</span><span class="chip rounded-full">Cardio</span><span class="chip rounded-full">Mobility</span></div>
<img src="https://via.placeholder.com/600x400" alt="business team handshake">
`

const SLOP_CSS = `
.hero { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 37px 13px; }
.hero::before { content: ""; filter: blur(80px); background: #8b5cf6; }
.card { border-radius: 28px; box-shadow: 0 0 40px rgba(139, 92, 246, .5); backdrop-filter: blur(12px); padding: 27px 19px; margin: 11px; }
.btn { border-radius: 9999px; background: linear-gradient(90deg, #7c3aed, #4f46e5); padding: 14px 30px; transition: all 2s; }
.badge { border-radius: 9999px; padding: 6px 14px; }
.pricing-card { border-radius: 24px; background: radial-gradient(circle, #a78bfa, #6366f1); margin: 21px; }
.float { position: absolute; box-shadow: 0 10px 30px rgba(0,0,0,.2); animation: float 3s ease-in-out infinite; }
.float2 { position: absolute; box-shadow: 0 10px 30px rgba(0,0,0,.2); animation: float 4s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-10px); } }
@keyframes pulse { 50% { opacity: .5; } }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
h1 { font-family: "Poppins", sans-serif; font-size: 64px; } h2 { font-family: "Montserrat"; font-size: 42px; } h3 { font-family: "Raleway"; font-size: 22px; }
p { font-family: "Open Sans"; font-size: 17px; } .a { font-size: 13px; } .b { font-size: 15px; } .c { font-size: 19px; } .d { font-size: 21px; }
.e { font-size: 27px; } .f { font-size: 33px; } .g { font-size: 11px; } .h { font-size: 10px; } .wrap { width: 1200px; }
.x { padding: 7px 9px; margin: 3px 5px; gap: 17px; }
`

const CONCEPT: VisualConcept = {
  name: "Chalk and Iron",
  mood: ["exact", "warm", "unhurried"],
  styles: ["editorial", "industrial"],
  typeSystem: { display: "Fraunces", body: "Inter", mono: "IBM Plex Mono", scaleRatio: 1.25, rule: "labels in mono caps tracked 0.1em" },
  palette: { mode: "light", background: "#f4efe6", text: "#22201c", muted: "#5d574d", accent: "#4f5d2f", accentUse: "the booking button and session times" },
  layout: { principles: ["text hangs from a wide left margin", "photos bleed off the right edge"], density: "balanced", radius: 2 },
  motion: { stance: "subtle", moves: ["fade up on headings"] },
  imagery: { direction: "Chalk dusted hands and steel in side light, close crops", avoid: ["gym stock models"] },
  signatureMoves: ["session times set in mono like a training log"],
}

const CLEAN_HTML = `
<section class="intro">
  <div class="inner">
    <p class="label">Strength coaching in Leeds</p>
    <h1>Lift well for the next forty years</h1>
    <p>One to one sessions and a twelve week block for people coming back to training after injury.</p>
    <a class="btn" href="/pages/book">Book a first session</a>
  </div>
  <img src="/assets/coach.jpg" width="1200" height="1500" alt="Sam adjusting a client's deadlift setup">
</section>
<section class="how">
  <h2>How it works</h2>
  <ol>
    <li><h3>Assessment</h3><p>Sixty minutes on how you move and what hurts.</p></li>
    <li><h3>Plan</h3><p>Three sessions a week, written around your schedule.</p></li>
  </ol>
</section>
<section class="times">
  <table><caption>Typical week</caption><tr><th>Mon</th><td>07:00</td></tr></table>
</section>
`

const CLEAN_CSS = `
:root { --bg: #f4efe6; --text: #22201c; --accent: #4f5d2f; --step-0: 1rem; --step-3: clamp(1.8rem, 1.4rem + 2vw, 2.8rem); }
.intro { display: grid; gap: 32px; padding-block: clamp(48px, 8vw, 128px); }
.inner { max-width: 65ch; }
h1 { font-family: "Fraunces", serif; font-size: var(--step-3); }
body { font-family: "Inter", sans-serif; font-size: 1rem; }
.label { font-family: "IBM Plex Mono", monospace; font-size: 0.875rem; letter-spacing: .1em; }
.btn { background: var(--accent); color: #fff; border-radius: 2px; padding: 12px 20px; transition: background-color .15s; }
.btn:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
img { max-width: 100%; height: auto; }
@media (min-width: 900px) { .intro { grid-template-columns: 7fr 5fr; gap: 64px; } }
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
`

const CLEAN_STORELIB = `<template>
  <section class="s-quote" data-scheme="{{ settings.scheme }}">
    {% if settings.quote != "" %}
      <figure><blockquote>{{ settings.quote }}</blockquote><figcaption>{{ settings.name }}</figcaption></figure>
    {% elsif page.in_editor %}<p>Add a quote from a client</p>{% endif %}
  </section>
</template>
<style>
.s-quote { padding-block: clamp(48px, 8vw, 112px); }
.s-quote blockquote { font-family: "Fraunces", serif; font-size: clamp(1.5rem, 1.1rem + 2vw, 2.5rem); max-width: 30ch; }
@media (min-width: 900px) { .s-quote figure { margin-left: 16.6%; } }
</style>
<schema>
{ "name": "Quote", "settings": [ { "type": "textarea", "id": "quote", "label": "Quote", "default": "" }, { "type": "text", "id": "name", "label": "Name", "default": "" } ] }
</schema>`

async function main() {
  section("index: the embedded sources match the markdown and every entry is valid")
  {
    const dir = join(root, "lib/storelib-ai/library/entries")
    const files = walk(dir)
    const disk = files.map((f) => ({ file: relative(join(root, "lib/storelib-ai/library"), f).split("\\").join("/"), source: readFileSync(f, "utf8").replace(/\r\n/g, "\n") }))
    check("index.generated.ts is current (run node scripts/build-ai-knowledge.mjs)", JSON.stringify(disk) === JSON.stringify(KNOWLEDGE_SOURCES), `${disk.length} on disk, ${KNOWLEDGE_SOURCES.length} embedded`)
    const errors: string[] = []
    for (const s of KNOWLEDGE_SOURCES) {
      try {
        const e = parseEntry(s.source, s.file)
        const expectedFile = `entries/${e.category}/${e.id}.md`
        if (s.file !== expectedFile) errors.push(`${s.file} should be ${expectedFile}`)
      } catch (err) {
        errors.push((err as Error).message)
      }
    }
    check("every entry parses and validates (60+ words, metadata, no em dash, no placeholder)", errors.length === 0, errors.slice(0, 5).join(" | "))
    const all = allKnowledge()
    check("the runtime index has every entry", all.length === KNOWLEDGE_SOURCES.length, `${all.length}`)
    check("at least 120 entries", all.length >= 120, `${all.length}`)
    check("ids are unique", new Set(all.map((e) => e.id)).size === all.length)
    for (const c of KNOWLEDGE_CATEGORIES) check(`category ${c} has entries`, all.some((e) => e.category === c))
    check("every category maps to a contract kind", KNOWLEDGE_CATEGORIES.every((c) => !!KIND_OF_CATEGORY[c]))
    const styles = ["minimalism", "luxury", "editorial", "swiss", "brutalism", "neo-brutalism", "saas", "agency", "portfolio", "fashion", "wellness", "fitness", "dark-cinematic", "light-editorial", "contemporary-ecommerce", "typography-led", "experimental", "playful", "industrial", "organic", "glassmorphism", "neumorphism", "creator", "premium-personal-brand"]
    const missingStyles = styles.filter((s) => !knowledgeById(`style-${s}`))
    check("every requested visual style has an entry", missingStyles.length === 0, missingStyles.join(", "))
    const industries = ["fitness-coach", "wellness", "music-producer", "fashion", "portfolio", "photography", "agency", "saas", "digital-creator", "education", "membership-community", "coaching", "restaurant", "local-service", "luxury-brand"]
    const missingInd = industries.filter((s) => !knowledgeById(`industry-${s}`))
    check("every requested industry has an entry", missingInd.length === 0, missingInd.join(", "))
    const known = new Set<string>([...all.map((e) => e.id), ...ARCHETYPES.map((a) => a.id), ...DESIGN_PATTERNS.map((p) => p.id), ...DESIGN_PRESETS.map((p) => p.id), ...ALL_TOPICS.map((t) => t.id)])
    const dangling = all.flatMap((e) => e.related.filter((r) => !known.has(r)).map((r) => `${e.id} -> ${r}`))
    check("every related id is an entry, archetype, pattern, preset or Storelib topic", dangling.length === 0, dangling.slice(0, 8).join(", "))
    const slopEntries = new Set(all.map((e) => e.id))
    check("every slop rule links to an existing knowledge entry", evaluateSlop({ html: SLOP_HTML, css: SLOP_CSS }).findings.every((f) => slopEntries.has(f.knowledge)))
  }

  section("retrieval: sample briefs get relevant, selective, budgeted entries")
  {
    const fitness = retrieveKnowledge({ text: "premium personal training site for a strength coach, online programmes and booking a first call", industry: "fitness coach", styles: ["luxury", "minimalism"], phase: "plan", budgetTokens: 2500 })
    check("fitness coach premium: the fitness industry entry is first", ids(fitness)[0] === "industry-fitness-coach", ids(fitness).join(", "))
    check("fitness coach premium: luxury style is included", ids(fitness).includes("style-luxury"), ids(fitness).join(", "))
    check("fitness coach premium: no restaurant or music entries", !ids(fitness).some((i) => /restaurant|music/.test(i)), ids(fitness).join(", "))

    const fashion = retrieveKnowledge({ text: "editorial fashion label, a lookbook for the new collection and a shop", industry: "fashion", styles: ["editorial"], budgetTokens: 2500 })
    check("editorial fashion: fashion industry and editorial style both in the top four", ["industry-fashion", "style-editorial"].every((i) => ids(fashion).slice(0, 4).includes(i)), ids(fashion).join(", "))

    const music = retrieveKnowledge({ text: "music producer selling sample packs and drum kits with audio previews", industry: "music producer", budgetTokens: 2500 })
    check("music producer: the industry entry is first", ids(music)[0] === "industry-music-producer", ids(music).join(", "))
    check("music producer: media player or digital downloads included", ids(music).some((i) => i === "component-media-player" || i === "storelib-digital-downloads"), ids(music).join(", "))

    const portfolio = retrieveKnowledge({ text: "minimal portfolio for a product designer with case studies", industry: "portfolio", styles: ["minimalism"], budgetTokens: 2500 })
    check("minimal portfolio: portfolio and minimalism in the top three", ["industry-portfolio", "style-minimalism"].every((i) => ids(portfolio).slice(0, 3).includes(i)), ids(portfolio).join(", "))

    for (const budget of [400, 900, 2500, 6000]) {
      const r = retrieveKnowledge({ text: "fitness coach booking pricing hero mobile menu", industry: "fitness", budgetTokens: budget })
      const text = formatKnowledge(r)
      const sum = r.entries.reduce((n, e) => n + e.tokens, 0)
      check(`budget ${budget}: used tokens within budget`, r.usedTokens <= budget && sum === r.usedTokens, `${r.usedTokens}`)
      check(`budget ${budget}: formatted block stays near the budget`, estimateTokens(text) <= budget + 60 + r.omitted.length * 15, `${estimateTokens(text)}`)
    }
    const small = retrieveKnowledge({ text: "fitness coach booking pricing hero", industry: "fitness", budgetTokens: 400 })
    check("a tight budget falls back to summaries rather than losing relevant entries", small.entries.some((e) => e.mode === "summary") || small.omitted.length > 0)
    const broad = retrieveKnowledge({ text: "design a whole website with everything", budgetTokens: 12000, limit: 30 })
    check("never the whole library, even with a large budget", broad.entries.length < allKnowledge().length / 3, `${broad.entries.length}`)

    const a = JSON.stringify(ids(retrieveKnowledge({ text: "luxury jewellery brand", industry: "luxury" })))
    const b = JSON.stringify(ids(retrieveKnowledge({ text: "luxury jewellery brand", industry: "luxury" })))
    check("ranking is deterministic", a === b)
    const noMembers = retrieveKnowledge({ text: "membership pricing tiers join", capabilities: ["products"] })
    check("capability filter drops membership entries for a site without memberships", !ids(noMembers).includes("storelib-memberships"), ids(noMembers).join(", "))
    const withMembers = retrieveKnowledge({ text: "membership pricing tiers join", capabilities: ["products", "memberships"] })
    check("and keeps them for a site with memberships", ids(withMembers).includes("storelib-memberships"), ids(withMembers).join(", "))
    const caps = capabilitiesFromSite({ productTypes: { digital: 2, course: 1 }, communities: [], forms: { published: 1, bookings: 0 }, blog: { posts: 0 } })
    check("capabilitiesFromSite maps the AI builder's capabilities", ["products", "checkout", "digital", "courses", "forms", "newsletter"].every((c) => caps.includes(c as never)) && !caps.includes("bookings") && !caps.includes("memberships"), caps.join(", "))
    const onlyAnti = retrieveKnowledge({ categories: ["anti-slop"], limit: 30, budgetTokens: 12000 })
    check("a category alone lists that category", onlyAnti.entries.length > 5 && onlyAnti.entries.every((e) => e.entry.category === "anti-slop"))
    const pinned = retrieveKnowledge({ text: "restaurant menu", ids: ["motion-marquee"] })
    check("an entry asked for by id comes first", ids(pinned)[0] === "motion-marquee")
  }

  section("search_knowledge: the contract's tool")
  {
    check("the tool name is in the contract's tool list", (AGENT_TOOL_NAMES as readonly string[]).includes(SEARCH_KNOWLEDGE_TOOL.name))
    const params = SEARCH_KNOWLEDGE_TOOL.parameters as { required: string[]; additionalProperties: boolean }
    check("the schema requires query and is closed", params.required.includes("query") && params.additionalProperties === false)
    const out = runSearchKnowledge({ query: "sticky header that hides on scroll", kinds: ["layout"] })
    check("returns contract entries of the asked kind", out.entries.length > 0 && out.entries.every((e) => e.kind === "layout" && !!e.body && !!e.title), out.entries.map((e) => `${e.id}:${e.kind}`).join(", "))
    check("the best answer is header-sticky", out.entries[0]?.id === "header-sticky", out.entries.map((e) => e.id).join(", "))
    const res = runSearchKnowledge({ query: "accessible dialog primitives", kinds: ["resource"] })
    check("resource kind searches the external registry", res.entries.length > 0 && res.entries.every((e) => e.kind === "resource"), res.entries.map((e) => e.id).join(", "))
    const named = runSearchKnowledge({ query: "can I use aceternity ui" })
    check("naming a library finds its registry entry", named.entries.some((e) => e.id === "aceternity-ui"))
    const byId = searchKnowledge({ text: "full entry for typography-scale" })
    check("an entry id in the query returns that entry first", byId.entries[0]?.id === "typography-scale")
    const tokens = estimateTokens(JSON.stringify(runSearchKnowledge({ query: "pricing table for coaching packages" }, { industry: "coaching" })))
    check("one tool result is small (under about 2,300 tokens)", tokens < 2300, `${tokens}`)
  }

  section("anti-slop evaluator: seeded slop is flagged, a clean page passes")
  {
    const slop = evaluateSlop({ html: SLOP_HTML, css: SLOP_CSS })
    const rules = new Set(slop.findings.filter((f) => f.severity !== "info").map((f) => f.rule))
    const expected = ["gradients", "purple", "glow", "glass", "generic-hero", "identical-layout", "typography", "pills", "empty-words", "fake-proof", "stock-imagery", "weak-mobile", "animation", "floating-cards"]
    for (const r of expected) check(`flags ${r}`, rules.has(r as (typeof SLOP_RULES)[number]), [...rules].join(", "))
    check("the seeded page scores low", slop.score < 30, `${slop.score}`)
    check("every finding has a concrete fix and evidence", slop.findings.every((f) => f.fix.length > 30 && f.evidence.length > 0))
    const issues = slopIssues({ html: SLOP_HTML, css: SLOP_CSS })
    check("slopIssues returns contract ValidationIssues with slop.* codes", issues.length > 0 && issues.every((i) => i.code.startsWith("slop.") && (i.severity === "error" || i.severity === "warning")))

    const clean = evaluateSlop({ html: CLEAN_HTML, css: CLEAN_CSS }, CONCEPT)
    check("the clean page has no errors or warnings", clean.counts.error === 0 && clean.counts.warn === 0, clean.findings.map((f) => `${f.rule}:${f.severity}:${f.message}`).join(" | "))
    check("the clean page scores 95 or more", clean.score >= 95, `${clean.score}`)
    const cleanFile = evaluateSlop({ sources: [{ path: "sections/ai_quote.storelib", content: CLEAN_STORELIB }] }, CONCEPT)
    check("a clean .storelib section passes", cleanFile.counts.error === 0 && cleanFile.counts.warn === 0, cleanFile.findings.map((f) => `${f.rule}:${f.message}`).join(" | "))

    const wordy = CLEAN_STORELIB.replace('"default": ""', '"default": "Unlock a seamless, powerful way to transform your training"')
    const wordyReport = evaluateSlop({ sources: [{ path: "sections/ai_quote.storelib", content: wordy }] }, CONCEPT)
    check("empty words in schema defaults are found too", wordyReport.findings.some((f) => f.rule === "empty-words" && f.severity === "error"))

    const glassCss = `.panel { backdrop-filter: blur(16px); border-radius: 20px; } .b { border-radius: 24px; } .c { border-radius: 20px; } @media (min-width: 800px) { .panel { padding: 32px; } }`
    const glassHtml = `<section><h2>Night menu</h2><div class="panel"><p>Doors at nine.</p></div></section>`
    const plain = evaluateSlop({ html: glassHtml, css: glassCss }, CONCEPT)
    const glassy = evaluateSlop({ html: glassHtml, css: glassCss }, { ...CONCEPT, styles: ["glassmorphism", "dark-cinematic"], layout: { ...CONCEPT.layout, radius: 20 } })
    check("glass is a warning in an editorial concept", plain.findings.some((f) => f.rule === "glass" && f.severity === "warn"))
    check("and excused (info) in a declared glassmorphism concept", glassy.findings.some((f) => f.rule === "glass" && f.severity === "info" && f.excused))
    const fakeInGlass = evaluateSlop({ html: `<section><h2>Trusted by 5,000+ members</h2></section>`, css: "" }, { ...CONCEPT, allow: ["gradients", "glow", "pills"] })
    check("fabricated proof is never excused by a concept", fakeInGlass.findings.some((f) => f.rule === "fake-proof" && f.severity === "error"))
    const real = evaluateSlop({ html: `<section><h2>312 students since 2021</h2><p>Join 312 others.</p></section>`, css: "" }, CONCEPT, )
    check("a number with no marketing shape is not called fake", !real.findings.some((f) => f.rule === "fake-proof"))
    const supplied = evaluateSlop({ html: `<section><h2>5,000+ members</h2></section>`, css: "", facts: { numbers: ["5000"] } })
    check("a number the store supplied is not called fake", !supplied.findings.some((f) => f.rule === "fake-proof"), supplied.findings.map((f) => f.message).join(" | "))
    const repeated = evaluateSlop({ html: "", css: "", sections: [{ type: "ai_cards" }, { type: "ai_cards" }, { type: "ai_cards" }] })
    check("the same section type three times on a page is flagged", repeated.findings.some((f) => f.rule === "repetitive-structure"))
  }

  section("visual concept: schema, validation and diversity")
  {
    check("the sample concept validates", validateConcept(CONCEPT).length === 0, validateConcept(CONCEPT).join("; "))
    const bad = validateConcept({ ...CONCEPT, name: "Modern", mood: ["clean"], palette: { ...CONCEPT.palette, text: "#bbbbbb" }, signatureMoves: [] })
    check("a generic, low contrast, unsigned concept is refused with reasons", bad.length >= 4, bad.join("; "))
    const bad2 = validateConcept({ ...CONCEPT, allow: ["sparkles" as never] })
    check("an unknown allowance is refused", bad2.some((e) => e.includes("allow")))
    for (const d of DIRECTIONS) {
      const t = contrastRatio(d.palette.text, d.palette.background) ?? 0
      const m = contrastRatio(d.palette.muted, d.palette.background) ?? 0
      check(`direction ${d.id}: text and muted pass 4.5:1`, t >= 4.5 && m >= 4.5, `${t.toFixed(2)} / ${m.toFixed(2)}`)
      check(`direction ${d.id}: validates as a concept`, validateConcept(conceptFromDirection(d)).length === 0, validateConcept(conceptFromDirection(d)).join("; "))
    }
    const first = suggestDirections("fitness coach", { count: 3, seed: "creator-a" })
    check("three directions for a fitness coach", first.length === 3)
    check("the three are spread apart", first.every((x, i) => first.every((y, j) => i === j || conceptDistance(conceptFromDirection(x), conceptFromDirection(y)) >= 0.25)))
    const second = suggestDirections("fitness coach", { count: 1, avoid: [conceptFromDirection(first[0])], seed: "creator-b" })
    check("a second fitness coach gets a different direction from the first", second[0].id !== first[0].id, `${first[0].id} vs ${second[0].id}`)
    check("and a distant one", conceptDistance(conceptFromDirection(first[0]), conceptFromDirection(second[0])) >= 0.3)
    check("directions are deterministic", JSON.stringify(suggestDirections("fitness coach", { seed: "x" }).map((d) => d.id)) === JSON.stringify(suggestDirections("fitness coach", { seed: "x" }).map((d) => d.id)))
  }

  section("external registry: complete and honest")
  {
    const want = ["shadcn-ui", "radix-ui", "coss-ui", "tremor", "aceternity-ui", "magic-ui", "21st-dev", "code-ui", "shadow-ui"]
    check("every requested library has an entry", want.every((id) => RESOURCES.some((r) => r.id === id)), RESOURCES.map((r) => r.id).join(", "))
    for (const r of RESOURCES) {
      const complete = !!r.name && /^https:\/\//.test(r.url) && !!r.license && !!r.commercialUse && !!r.accessibility && !!r.what && typeof r.adapterSafe === "boolean"
      check(`${r.id}: complete`, complete)
      check(`${r.id}: an SPDX licence only when verified from a source`, r.license === "verify" || ((r.licenseStatus === "verified" || r.licenseStatus === "partial") && !!r.verifiedFrom && !!r.verifiedOn))
      check(`${r.id}: never imported (reference-only or not-allowed, adapterSafe false)`, (r.integration === "reference-only" || r.integration === "not-allowed") && r.adapterSafe === false)
      check(`${r.id}: unverified or partial licences say what to check`, r.licenseStatus === "verified" || !!r.toVerify)
      check(`${r.id}: no em dash`, !/\u2014/.test(JSON.stringify(r)))
    }
    check("unidentified libraries are not allowed", RESOURCES.filter((r) => r.licenseStatus === "unidentified").every((r) => r.integration === "not-allowed" && r.license === "verify"))
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    check("appDependency is true only when package.json really has it", RESOURCES.every((r) => !r.appDependency || Object.keys(deps).some((d) => d.startsWith(r.id === "shadcn-ui" ? "@radix-ui/" : r.id === "radix-ui" ? "@radix-ui/" : r.id))))
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
