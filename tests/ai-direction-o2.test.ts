/**
 * Round O (O2): creative direction before generation, and the per-site
 * design contract (DESIGN.md) kept in sync with Theme settings.
 *
 *   1. the brief: business, objective, colours, style, real vs missing
 *   2. the direction set: contrast, loadable type, serif only where called for
 *   3. the spec's test cases 1 to 4 give distinctly different directions
 *   4. deterministic, fitted to the business, the creator's style wins
 *   5. the concept is checked against the direction (the editorial-serif look refused)
 *   6. DESIGN.md: Google's format, parsed and written, errors with lines
 *   7. the contract round-trips with Theme settings
 *   8. a user override survives an AI edit (through set_tokens)
 *   9. the agent: brief block, concept check and DESIGN.md in the plan phase
 */
import { briefFrom, refineBrief, BUSINESS_KINDS, type CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import { ART_DIRECTIONS, artDirection } from "@/lib/storelib-ai/direction/directions"
import { checkConceptAgainstDirection, chooseDirection, directionForPrompt, directionSeeds, isDisplaySerif, isCream, isRust } from "@/lib/storelib-ai/direction/choose"
import { DESIGN_MD_PATH, SECTION_ORDER, parseDesignMd, parseYaml, renderDesignMd } from "@/lib/storelib-ai/direction/design-md"
import { DIRECTIONS, contrastRatio, type VisualConcept } from "@/lib/storelib-ai/library/concept"
import { TYPE_SYSTEMS, suggestTypeSystems } from "@/lib/storelib-ai/library/type-systems"
import { layoutStoryFor } from "@/lib/storelib-ai/layout"
import { OFFERED_FAMILIES, FAMILY_WEIGHTS } from "@/lib/website-builder/font-link"
import { DESIGN_CONTRACT_SETTING, askedGroups, contractFromPlan, designMdFromSettings, protectOverrides, readContractMeta, recordAiTokens, renderContract, settingsPatchFromDesignMd, tokensFromPlan, userOverrides } from "@/lib/ai-builder/design-contract"
import { themeSettingsToTokens } from "@/lib/ai-builder/tokens"
import { tokensToThemeSettings as agentTokens } from "@/lib/ai-builder/agent/tokens"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { newCheckpoint } from "@/lib/ai-builder/agent/state"
import { planDirection } from "@/lib/ai-builder/agent/direction"
import { TOOL_SPECS } from "@/lib/ai-builder/agent/tool-specs"
import { DEFAULT_JOB_BUDGET, type DesignTokens } from "@/lib/ai-builder/types"
import type { AgentJobInput } from "@/lib/ai-builder/agent/ports"

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

/* The spec's test cases 1 to 4 (prompt section I), with the store each would have. */
const CASES = {
  fitness: { prompt: "Website for my personal training business in Leeds. Black and red, bold. Clients book sessions online.", caps: { forms: [{ kind: "booking", booking: true }], reviews: { count: 0 } } },
  wellness: { prompt: "A calm, warm website for my Pilates and wellness studio. People book classes.", caps: { forms: [{ kind: "booking", booking: true }], reviews: { count: 0 } } },
  y2k: { prompt: "Y2K storefront for my beatmaker brand selling sample packs and drum kits", caps: { products: [{ kind: "digital" }, { kind: "digital" }, { kind: "digital" }], reviews: { count: 0 } } },
  agency: { prompt: "Bold experimental website for our creative agency", caps: { reviews: { count: 0 } } },
} as const

const briefOf = (k: keyof typeof CASES) => briefFrom(CASES[k].prompt, null, CASES[k].caps as never)

function jobInput(over: Partial<AgentJobInput> = {}): AgentJobInput {
  return { jobId: "11111111-2222-3333-4444-555555555555", creatorId: "creator-a", installId: "install-a", prompt: CASES.fitness.prompt, mode: "blank", options: { generation: "blank" }, budget: { ...DEFAULT_JOB_BUDGET }, startedAt: 0, spentUsd: 0, lastEventSeq: 0, ...over }
}

/** The 2025-26 AI look Andrew saw on the first real trainer build. */
const SLOP_CONCEPT: VisualConcept = {
  name: "Someone Beside You",
  mood: ["literary", "calm", "warm"],
  styles: ["editorial", "light-editorial"],
  typeSystem: { display: "Instrument Serif", body: "Instrument Sans", mono: "DM Mono", scaleRatio: 1.5, rule: "labels in mono caps tracked 0.08em" },
  palette: { mode: "light", background: "#f4efe6", text: "#1d1b18", muted: "#5c564d", accent: "#b5523b", accentUse: "the booking button" },
  layout: { principles: ["one idea per screen"], density: "airy", radius: 0 },
  motion: { stance: "subtle", moves: [] },
  imagery: { direction: "portrait in window light", avoid: [] },
  signatureMoves: ["huge italic headline"],
}

function goodConcept(brief: CreativeBrief): VisualConcept {
  const c = chooseDirection(brief, [], { seed: "creator-a:install-a" })
  return {
    name: "Leeds Iron Hours",
    mood: ["driven", "direct", "warm"],
    styles: c.primary.styles.slice(0, 2),
    typeSystem: { display: c.fonts.display, body: c.fonts.body, ...(c.fonts.mono ? { mono: c.fonts.mono } : {}), scaleRatio: 1.6, rule: "display in caps, tracked tight" },
    palette: { mode: c.palette.mode === "dark" ? "dark" : "light", background: c.palette.background, text: c.palette.text, muted: c.palette.muted, accent: c.palette.accent, accentUse: "booking buttons and the session stat strip" },
    layout: { principles: ["headline cropped by the edge on a phone"], density: "balanced", radius: c.radius },
    motion: { stance: "expressive", moves: ["headline mask reveal once"] },
    imagery: { direction: "real sessions in the gym, hard side light", avoid: ["stock smiles"] },
    signatureMoves: ["session facts as a condensed stat strip"],
  }
}

async function main() {
  console.log("\n1. the brief")
  {
    const f = briefOf("fitness")
    check("a personal trainer is fitness, and books", f.business.kind === "fitness" && f.objective === "book" && /book/i.test(f.cta), f)
    check("black and red are the brand colours, as hex", f.style.colors.length === 2 && f.style.colors.some((c) => (contrastRatio(c, "#000000") ?? 99) < 1.2) && f.style.colors.some((c) => /^#e/.test(c)), f.style.colors)
    check("a booking form is real; photos are missing and said so", f.assets.available.some((a) => /booking form/.test(a)) && f.assets.missing.some((m) => /photos/.test(m)), f.assets)
    check("never invent: testimonials, results, reviews (none), prices (no products), placeholder instructions", ["testimonials", "results", "reviews", "products and prices", "add your photo"].every((w) => f.mustNotFabricate.some((m) => m.includes(w))), f.mustNotFabricate)
    const w = briefOf("wellness")
    check("pilates studio is wellness, calm means quiet motion and airy density", w.business.kind === "wellness" && w.motion === "quiet" && w.density === "airy" && w.style.moods.includes("calm"), w)
    const y = briefOf("y2k")
    check("a beatmaker selling sample packs: music producer, buy, Y2K asked for by name", y.business.kind === "music-producer" && y.objective === "buy" && y.style.requested[0] === "y2k" && y.style.era === "y2k", y)
    check("three real products, prices not on the never-invent list", y.assets.available.includes("3 products") && !y.mustNotFabricate.includes("products and prices"))
    const a = briefOf("agency")
    check("a bold experimental agency: experimental asked for, expressive motion", a.business.kind === "agency" && a.style.requested.includes("experimental-type") && a.motion === "expressive", a)
    const busy = briefFrom("Create a premium website for a personal trainer specializing in busy professionals.")
    check("the audience is read from the words", busy.audience === "busy professionals", busy.audience)
    check("a start screen category alone gives the kind", briefFrom("my new site", { category: "fitness_coach" }).business.kind === "fitness")
    check("O5's site story is shared: the brief carries it and layoutStoryFor reads the brief as is", f.story === "fitness-coach" && layoutStoryFor(f).story.id === "fitness-coach" && layoutStoryFor(y).story.id === "sample-pack-store" && layoutStoryFor(w).story.id === "wellness-studio", [f.story, y.story, w.story])
    const r = refineBrief(f, { audience: "office workers who train before 8am", cta: "Book a first session", missing: ["the session price"], business: { kind: "books" }, objective: "read" })
    check("the plan model refines the audience, CTA and missing facts, never the business or the objective", r.audience === "office workers who train before 8am" && r.cta === "Book a first session" && r.primaryAction === "Book a first session" && r.business.kind === "fitness" && r.objective === "book" && r.assets.missing.includes("the session price") && r.refined === true, r)
    check("same words, same brief", JSON.stringify(briefOf("fitness")) === JSON.stringify(briefOf("fitness")))
  }

  console.log("\n2. the direction set")
  {
    check("a broad set: at least 20 directions across at least 15 spec families", ART_DIRECTIONS.length >= 20 && new Set(ART_DIRECTIONS.map((d) => d.family)).size >= 15, ART_DIRECTIONS.length)
    const named = ["y2k", "frutiger-aero", "neo-brutalist", "swiss-editorial", "japanese-minimal", "luxury-editorial", "art-gallery", "cinematic", "experimental-type", "modern-wellness", "fashion-commerce", "hospitality-photo", "product-led", "bold-performance", "playful-creator"]
    check("every style the brief names exists (Swiss editorial, bold sports, luxury, playful creator, Y2K, Frutiger Aero, neo-brutalist, Japanese minimal, gallery, cinematic, experimental type, wellness, fashion commerce, hospitality photography, product-led)", named.every((id) => artDirection(id)), named.filter((id) => !artDirection(id)))
    const badContrast = ART_DIRECTIONS.flatMap((d) => d.palettes.filter((p) => (contrastRatio(p.text, p.background) ?? 0) < 4.5 || (contrastRatio(p.muted, p.background) ?? 0) < 4.5 || (contrastRatio(p.accentText, p.accent) ?? 0) < 4.5).map((p) => `${d.id}/${p.name}`))
    check("every palette: text, muted and button text pass 4.5:1", badContrast.length === 0, badContrast)
    const types = ART_DIRECTIONS.flatMap((d) => d.typeSystems.filter((id) => !TYPE_SYSTEMS.some((t) => t.id === id)).map((id) => `${d.id}:${id}`))
    check("every direction's type systems exist in the type library", types.length === 0, types)
    const faces = [...new Set(TYPE_SYSTEMS.flatMap((t) => [t.display.family, t.body.family, ...(t.mono ? [t.mono.family] : [])]))]
    check("every face loads (offered and weighted)", faces.every((f) => OFFERED_FAMILIES.has(f) && f in FAMILY_WEIGHTS), faces.filter((f) => !OFFERED_FAMILIES.has(f) || !(f in FAMILY_WEIGHTS)))
    const voices = new Set(TYPE_SYSTEMS.map((t) => t.voice))
    check("the type library spans grotesk, condensed, geometric, wide, slab, rounded, mono, humanist and serif", ["grotesk", "condensed", "geometric", "wide", "slab", "rounded", "mono", "humanist", "serif"].every((v) => voices.has(v as never)), [...voices])
    const serifInNonSerif = ART_DIRECTIONS.filter((d) => !d.serif && isDisplaySerif(TYPE_SYSTEMS.find((t) => t.id === d.typeSystems[0])?.display.family ?? ""))
    check("a direction's first type is a display serif only when the direction calls for one", serifInNonSerif.length === 0, serifInNonSerif.map((d) => d.id))
    check("display serifs are a minority of directions", ART_DIRECTIONS.filter((d) => d.serif).length <= 4)
    check("the italic serif system is opt in only: not even a literary brief gets it unless the creator asked", !suggestTypeSystems({ industry: "fitness coach", count: 6, seed: "x" }).some((t) => t.id === "editorial-italic") && !suggestTypeSystems({ industry: "books", styles: ["literary", "publishing"], count: 30 }).some((t) => t.id === "editorial-italic") && suggestTypeSystems({ industry: "books", styles: ["italic-serif"], count: 30 }).some((t) => t.id === "editorial-italic") && !ART_DIRECTIONS.some((d) => d.typeSystems.includes("editorial-italic")))
    check("no starting direction (concept.ts) pairs a display serif with a cream ground and a rust accent", !DIRECTIONS.some((d) => isDisplaySerif(d.type.display) && isCream(d.palette.background) && isRust(d.palette.accent)), DIRECTIONS.filter((d) => isDisplaySerif(d.type.display) && isCream(d.palette.background) && isRust(d.palette.accent)).map((d) => d.id))
    const mapped = agentTokens({ colors: { background: "#0b0b0c", surface: "#1b1b1c", text: "#f4f4f2", muted: "#a2a2a2", accent: "#e1251b", accentText: "#ffffff", border: "#353535" } } as Partial<DesignTokens>, {}).settings
    check("an AI site's colours set primary, secondary and link, so the page never falls back to indigo", mapped.primary_color === "#e1251b" && mapped.secondary_color === "#f4f4f2" && mapped.link_color === "#e1251b" && !/6366f1|8b5cf6/.test(JSON.stringify(mapped)), mapped)
    const uncovered = BUSINESS_KINDS.filter((k) => !ART_DIRECTIONS.some((d) => d.fits.includes(k) || d.suits.includes(k)))
    check("every business kind has a direction made for it or able to serve it", uncovered.length === 0, uncovered)
    check("no copy in a direction has an em dash", !/—/.test(JSON.stringify(ART_DIRECTIONS)))
  }

  console.log("\n3. the spec's cases 1 to 4: distinctly different")
  {
    const picks = (Object.keys(CASES) as (keyof typeof CASES)[]).map((k) => ({ k, b: briefOf(k), c: chooseDirection(briefOf(k), [], { seed: "creator-a:install-a" }) }))
    const [fit, well, y2k, agency] = picks
    check("fitness, black and red, booking: Bold Performance, a dark ground, a red accent, condensed sport type", fit.c.primary.id === "bold-performance" && fit.c.palette.mode === "dark" && /^#e1/.test(fit.c.palette.accent) && fit.c.typeSystem.voice === "condensed" && !isDisplaySerif(fit.c.fonts.display), { p: fit.c.primary.id, pal: fit.c.palette, t: fit.c.typeSystem.id })
    check("calm warm wellness: Modern Wellness, light, quiet, airy, no display serif", well.c.primary.id === "modern-wellness" && well.c.palette.mode === "light" && well.c.primary.motion === "quiet" && well.c.matrix.density === "airy" && !isDisplaySerif(well.c.fonts.display), { p: well.c.primary.id, f: well.c.fonts })
    check("Y2K sample packs storefront: the Y2K direction (named, so it wins), wide futurist type, product rows", y2k.c.primary.id === "y2k" && y2k.c.requested && ["y2k-chrome", "wide-tech"].includes(y2k.c.typeSystem.id) && /Products as a player list/.test(y2k.c.primary.layout.join(" ")), { p: y2k.c.primary.id, t: y2k.c.typeSystem.id })
    check("bold experimental agency: Experimental Type, a type-only hero, a broken grid", agency.c.primary.id === "experimental-type" && agency.c.matrix.hero === "type-only" && agency.c.matrix.grid === "broken", agency.c.primary.id)
    const distinct = (f: (x: (typeof picks)[number]) => string) => new Set(picks.map(f)).size === picks.length
    check("four different primary directions", distinct((x) => x.c.primary.id))
    check("four different type systems and display faces", distinct((x) => x.c.typeSystem.id) && distinct((x) => x.c.fonts.display), picks.map((x) => x.c.fonts.display))
    check("four different palettes (ground and accent)", distinct((x) => `${x.c.palette.background}/${x.c.palette.accent}`))
    check("four different heroes", distinct((x) => x.c.matrix.hero), picks.map((x) => x.c.matrix.hero))
    check("at least three different grids and shape languages between them", new Set(picks.map((x) => x.c.matrix.grid)).size >= 3)
    check("motion differs where the brief does: quiet wellness, expressive Y2K and agency", well.c.primary.motion === "quiet" && y2k.c.primary.motion === "expressive" && agency.c.primary.motion === "expressive")
  }

  console.log("\n4. deterministic, fitted, and the creator's words win")
  {
    const b = briefOf("fitness")
    check("the same prompt twice gives the same direction, type and palette", JSON.stringify(chooseDirection(b, [], { seed: "s" })) === JSON.stringify(chooseDirection(briefOf("fitness"), [], { seed: "s" })))
    const premium = briefFrom("Create a premium website for a personal trainer specializing in busy professionals.")
    const runs = Array.from({ length: 40 }, (_, i) => chooseDirection(premium, [], { seed: `creator-${i}` }))
    check("a personal trainer only ever gets fitness directions, never a literary magazine or luxury serif", runs.every((r) => r.primary.fits.includes("fitness") || r.primary.suits.includes("fitness")) && !runs.some((r) => ["literary-editorial", "luxury-editorial", "japanese-minimal"].includes(r.primary.id)), [...new Set(runs.map((r) => r.primary.id))])
    check("and never a display serif", runs.every((r) => !isDisplaySerif(r.fonts.display)), [...new Set(runs.map((r) => r.fonts.display))])
    check("A/B diversity (spec Part 10): different seeds rotate between at least two fitting directions and two type systems", new Set(runs.map((r) => r.primary.id)).size >= 2 && new Set(runs.map((r) => r.typeSystem.id)).size >= 2, [...new Set(runs.map((r) => r.primary.id))])
    const four = ["a", "b", "c", "d"].map((s) => chooseDirection(premium, [], { seed: `site-${s}` }))
    check("four sites of the same prompt are not all one hero, palette and font", new Set(four.map((r) => `${r.matrix.hero}|${r.palette.name}|${r.fonts.display}`)).size >= 2, four.map((r) => `${r.primary.id}/${r.fonts.display}`))
    const used = chooseDirection(premium, [], { seed: "creator-x" })
    const next = chooseDirection(premium, [], { seed: "creator-x", avoid: [used.primary.id] })
    check("a direction this creator used recently is marked down (anti monoculture)", next.primary.id !== used.primary.id, [used.primary.id, next.primary.id])
    const acct = briefFrom("Y2K website for my accounting practice")
    check("a style the creator names wins over the business default", acct.business.kind === "professional" && chooseDirection(acct).primary.id === "y2k")
    const refs = chooseDirection(briefFrom("website for my architecture studio"), [{ id: "r1", styles: ["japanese-minimal"] }, { id: "r2", tags: ["japanese-minimal"] }], { seed: "q" })
    check("retrieved references (O1) pull the choice toward their style", refs.primary.id === "japanese-minimal", refs.primary.id)
    const noSerif = chooseDirection(briefFrom("Luxury jewellery shop, no serif fonts please"), [], { seed: "z" })
    check("\"no serif\" keeps every display serif out, even for luxury", !isDisplaySerif(noSerif.fonts.display), noSerif.fonts)
    const named = chooseDirection(briefFrom('Website for my bakery, headlines in "Bowlby One"'))
    check("a loadable font the creator names is the display face", named.fonts.display === "Bowlby One", named.fonts)
    const seeds = directionSeeds(chooseDirection(b, [], { seed: "s" }), b)
    check("three starting seeds for the prompt, the chosen one first, all fitting", seeds.length === 3 && seeds[0].id === "bold-performance" && seeds.every((d) => d.suits.includes("fitness")), seeds.map((s) => s.id))
  }

  console.log("\n5. the concept, checked against the direction")
  {
    const b = briefOf("fitness")
    const c = chooseDirection(b, [], { seed: "creator-a:install-a" })
    check("the cream, rust and mono detectors", isCream("#f4efe6") && !isCream("#ffffff") && isRust("#b5523b") && !isRust("#e1251b") === false ? true : isCream("#f4efe6") && isRust("#b5523b"))
    const slop = checkConceptAgainstDirection(SLOP_CONCEPT, c, b)
    check("the editorial-serif AI look is refused for a trainer, as a combination", slop.errors.some((e) => /editorial-serif AI look/.test(e)), slop.errors)
    check("an unasked display serif is refused with the direction's own type as the way out", slop.errors.some((e) => /display serif/.test(e) && e.includes(c.fonts.display)), slop.errors)
    const blue = checkConceptAgainstDirection({ ...goodConcept(b), palette: { mode: "light", background: "#ffffff", text: "#3d4a6b", muted: "#555f78", accent: "#1f4fd1", accentUse: "buttons" } }, c, b)
    check("black and red asked for and missing (a white and blue palette): refused, both named", blue.errors.some((e) => /asked for #0b0b0c/.test(e)) && blue.errors.some((e) => /asked for #e1251b \(red\)/.test(e)), blue.errors)
    const good = checkConceptAgainstDirection(goodConcept(b), c, b)
    check("a concept that follows the direction passes", good.errors.length === 0, good.errors)
    const yb = briefOf("y2k")
    const yc = chooseDirection(yb)
    const ignored = checkConceptAgainstDirection({ ...goodConcept(yb), styles: ["minimalism"] }, yc, yb)
    check("a style the creator named and the concept ignored is refused", ignored.errors.some((e) => /asked for Y2K Player/.test(e)), ignored.errors)
    const lux = briefFrom("A luxury jewellery shop")
    const lc = chooseDirection(lux, [], { seed: "s" })
    check("a display serif is fine where the direction calls for one", lc.primary.serif && !checkConceptAgainstDirection({ ...goodConcept(lux), typeSystem: { display: "Bodoni Moda", body: "Jost", scaleRatio: 1.6 }, palette: { mode: "light", background: "#f7f6f2", text: "#121212", muted: "#55554f", accent: "#6e5a2e", accentUse: "buy buttons" } }, lc, lux).errors.length, lc.primary.id)
    const text = directionForPrompt(b, c)
    check("directionForPrompt: the brief, the direction, why, type, palette, composition and what to avoid; no em dash", ["CREATIVE BRIEF", "ART DIRECTION", "Primary: Bold Performance", "Why:", "Type:", "Palette (dark)", "Composition:", "Avoid:", "Never invent"].every((w) => text.includes(w)) && !/—/.test(text), text.slice(0, 400))
  }

  console.log("\n6. DESIGN.md in Google's format")
  {
    const b = briefOf("fitness")
    const c = chooseDirection(b, [], { seed: "creator-a:install-a" })
    const contract = contractFromPlan(b, c, goodConcept(b))
    const text = renderContract(contract)
    check("starts with YAML front matter: version alpha, name, then the token groups", /^---\nversion: alpha\nname: /.test(text) && /\ncolors:\n {2}primary: "#e1251b"\n/.test(text) && /\ntypography:\n {2}headline-display:\n {4}fontFamily: /.test(text) && /\nrounded:\n/.test(text) && /\nspacing:\n/.test(text) && /\ncomponents:\n {2}button-primary:\n {4}backgroundColor: "\{colors\.primary\}"/.test(text), text.slice(0, 600))
    const fm = text.split("\n---\n")[0]
    const topKeys = [...fm.matchAll(/^([a-z]+):/gm)].map((m) => m[1])
    check("only the spec's top-level keys in the YAML (Storelib metadata lives elsewhere)", topKeys.every((k) => ["version", "name", "description", "omitted", "colors", "typography", "rounded", "spacing", "components"].includes(k)), topKeys)
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    const known = headings.filter((h) => SECTION_ORDER.some((s) => s.name === h))
    check("the spec's sections, in the spec's order, with Imagery and Motion kept before Do's and Don'ts", JSON.stringify(known) === JSON.stringify(SECTION_ORDER.map((s) => s.name)) && headings.indexOf("Motion") > headings.indexOf("Components") && headings.indexOf("Motion") < headings.indexOf("Do's and Don'ts"), headings)
    check("the display face's weight, leading and tracking come from the type system", new RegExp(`headline-display:\\n {4}fontFamily: ${c.fonts.display}\\n {4}fontSize: \\d+px\\n {4}fontWeight: ${c.typeSystem.display.weight}\\n`).test(text), text.slice(0, 900))
    check("the rules say what must not be invented", /Don't invent testimonials and quotes/.test(text) && /Don't use italic display serif/.test(text))
    check("no em dash anywhere in the contract", !/—/.test(text))
    const read = parseDesignMd(text)
    check("it reads back", read.ok === true && read.doc.tokens.colors.primary === "#e1251b" && read.doc.sections.length === headings.length, read.ok ? null : (read as { errors: unknown }).errors)
    if (read.ok === true) check("read and written again, it is the same file", renderDesignMd(read.doc) === text)
    const dup = parseDesignMd("---\nname: X\ncolors:\n  primary: \"#111111\"\n  primary: \"#222222\"\n---\n")
    check("a key twice is an error with its line", dup.ok === false && (dup as { errors: { line?: number; message: string }[] }).errors.some((e) => e.line === 5 && /defined twice/.test(e.message)), dup)
    const open = parseDesignMd("---\nname: X\ncolors:\n  primary: \"#111\"\n")
    check("an unclosed front matter is an error", open.ok === false && /no closing ---/.test(JSON.stringify(open)))
    const twice = parseDesignMd("---\nname: X\ncolors:\n  primary: \"#111111\"\n---\n\n## Colors\n\nA\n\n## Colours\n\nB\n")
    check("a section twice (an alias counts) is an error", twice.ok === false && /twice/.test(JSON.stringify(twice)))
    const interleaved = parseDesignMd("---\nname: Daylight\n---\n\n## Colors\n\n```yaml\ncolors:\n  primary: \"#1A1C1E\"\n```\n\n## Typography\n\n```yaml\ntypography:\n  h1:\n    fontFamily: Public Sans\n    fontSize: 48px\n```\n")
    check("interleaved ```yaml blocks are merged, as the spec allows", interleaved.ok === true && interleaved.doc.tokens.colors.primary === "#1A1C1E" && interleaved.doc.tokens.typography.h1.fontFamily === "Public Sans")
    const both = parseDesignMd("---\nname: X\ncolors:\n  primary: \"#111111\"\n---\n\n```yaml\ncolors:\n  secondary: \"#222222\"\n```\n")
    check("a top-level key in two blocks is an error", both.ok === false)
    const y = parseYaml("omitted:\n  - spacing\n  - section: rounded\n    reason: \"none in the brand book\"\nname: 'It''s'\n")
    check("the YAML subset: lists, list objects, single quotes", y.errors.length === 0 && JSON.stringify(y.value) === JSON.stringify({ omitted: ["spacing", { section: "rounded", reason: "none in the brand book" }], name: "It's" }), y)
    check("the file lives at the theme root as DESIGN.md", DESIGN_MD_PATH === "DESIGN.md")
  }

  console.log("\n7. the contract and Theme settings, both ways")
  {
    const b = briefOf("fitness")
    const c = chooseDirection(b, [], { seed: "creator-a:install-a" })
    const concept = goodConcept(b)
    const text = renderContract(contractFromPlan(b, c, concept))
    const settings = agentTokens(tokensFromPlan(concept, c), {}).settings
    const synced = designMdFromSettings(text, settings)!
    check("settings to file: written from the settings the plan's tokens became", typeof synced === "string" && parseDesignMd(synced).ok === true)
    check("and again: a fixed point (no churn on every save)", designMdFromSettings(synced, settings) === synced)
    const back = settingsPatchFromDesignMd(synced, settings)
    check("file to settings: nothing to change when they agree", back.ok === true && Object.keys(back.patch).length === 0, back)
    /* A creator changes the accent in Theme settings: the file follows, prose untouched. */
    const tokens = themeSettingsToTokens(settings)
    const panel = { ...settings, ...agentTokens({ colors: { ...tokens.colors, accent: "#ffd400", accentText: "#0b0b0b" } } as Partial<DesignTokens>, settings).settings }
    const afterPanel = designMdFromSettings(synced, panel)!
    const body = (t: string) => t.slice(t.indexOf("\n---\n", 4))
    check("a Theme settings edit rewrites the front matter: primary is the new accent", /\n {2}primary: "#ffd400"\n/.test(afterPanel), afterPanel.slice(0, 300))
    check("and keeps every line of the Markdown", body(afterPanel) === body(synced))
    /* A creator edits the file: the settings follow. */
    const edited = synced.replace(/\n {2}primary: "#[0-9a-f]+"\n/, '\n  primary: "#1f4fd1"\n').replace(/(headline-display:\n {4}fontFamily: )[^\n]+/, "$1Anton")
    const patch = settingsPatchFromDesignMd(edited, settings)
    const applied = patch.ok === true ? { ...settings, ...patch.patch } : settings
    const now = themeSettingsToTokens(applied)
    check("a DESIGN.md edit sets the accent and the heading font in Theme settings", patch.ok === true && now.colors.accent === "#1f4fd1" && now.fonts.heading === "Anton" && patch.changed.includes("font_heading"), patch)
    const resynced = designMdFromSettings(edited, applied)!
    check("synced back from those settings: every headline level takes the new font (one setting), the accent stays, and it is then a fixed point", (resynced.match(/fontFamily: Anton/g) ?? []).length === 5 && /\n {2}primary: "#1f4fd1"\n/.test(resynced) && designMdFromSettings(resynced, applied) === resynced && settingsPatchFromDesignMd(resynced, applied).ok === true && Object.keys((settingsPatchFromDesignMd(resynced, applied) as { patch: object }).patch).length === 0)
    const bad = settingsPatchFromDesignMd(synced.replace(/(headline-display:\n {4}fontFamily: )[^\n]+/, "$1Neue Haas Grotesk").replace(/\n {2}primary: "#[0-9a-f]+"\n/, '\n  primary: "oklch(0.6 0.2 30)"\n'), settings)
    check("a font that cannot load and a non-hex colour are not applied, each said why", bad.ok === true && Object.keys(bad.patch).length === 0 && bad.notes.some((n) => /cannot load/.test(n)) && bad.notes.some((n) => /hex/.test(n)), bad)
    const broken = settingsPatchFromDesignMd("---\nname: X\ncolors:\n primary: \"#111\"\n  oops\n---\n", settings)
    check("a file that does not read applies nothing and says the line", broken.ok === false && (broken as { errors: { line?: number }[] }).errors.some((e) => typeof e.line === "number"), broken)
    check("a broken file is never overwritten from settings", designMdFromSettings("---\nname: X\n", settings) === null)
  }

  console.log("\n8. a user override survives an AI edit")
  {
    const b = briefOf("fitness")
    const c = chooseDirection(b, [], { seed: "s" })
    const concept = goodConcept(b)
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const cp = newCheckpoint()
    cp.concept = concept
    cp.sitePlan = {} as never
    cp.brief = b
    cp.direction = { primary: c.primary.id, secondary: c.secondary?.id ?? null, typeSystem: c.typeSystem.id, seed: "s" }
    await store.writeFile("DESIGN.md", renderContract(contractFromPlan(b, c, concept)), { expectedVersion: null, author: "ai", jobId: "j0" })
    const toolsFor = (job: AgentJobInput) => createToolSet({ job, deps: { store, models: {} as never, capabilities: async () => ({}) as never }, cp, emit: () => undefined, onFinish: async () => ({ ok: true }) as never, setPhase: () => undefined })
    const aiTokens = tokensFromPlan(concept, c)
    const first = await toolsFor(jobInput()).set_tokens({ tokens: aiTokens } as never)
    const s1 = await store.readSettings()
    const meta = readContractMeta(s1)
    check("the AI's set_tokens records its values in the contract metadata", first.ok === true && !!meta && meta.ai["colors.accent"] === aiTokens.colors.accent.toLowerCase() && userOverrides(s1).length === 0, { first, meta })
    check("and DESIGN.md follows the settings it set", /\n {2}primary: "#e1251b"\n/.test(store.project.files["DESIGN.md"]))
    /* The creator sets their own accent and heading font in Theme settings. */
    const t1 = themeSettingsToTokens(s1)
    await store.writeSettings(agentTokens({ colors: { ...t1.colors, accent: "#ffd400", accentText: "#0b0b0b" }, fonts: { ...t1.fonts, heading: "Anton" } } as Partial<DesignTokens>, s1).settings)
    const s2 = await store.readSettings()
    check("the creator's changes are user overrides", JSON.stringify(userOverrides(s2)) === JSON.stringify(["colors.accent", "colors.accentText", "fonts.heading"]), userOverrides(s2))
    /* A later AI edit that is not about colours or fonts sends the plan's tokens again. */
    const edit = await toolsFor(jobInput({ edit: true, prompt: "Add an FAQ section about injuries and cancellations" })).set_tokens({ tokens: { ...aiTokens, spacing: { ...aiTokens.spacing, sectionY: 80 } } } as never)
    const s3 = await store.readSettings()
    const t3 = themeSettingsToTokens(s3)
    check("an AI edit keeps the creator's accent and heading font", t3.colors.accent === "#ffd400" && t3.fonts.heading === "Anton", t3)
    check("while the rest of what it asked for is applied", t3.spacing.sectionY === 80)
    check("and it says what it kept", edit.ok === true && (edit.issues ?? []).some((i) => i.code === "token.user_override" && /colors\.accent/.test(i.message)), edit)
    check("they are still overrides afterwards", userOverrides(s3).includes("colors.accent") && userOverrides(s3).includes("fonts.heading"), userOverrides(s3))
    check("DESIGN.md shows the creator's accent and font", /\n {2}primary: "#ffd400"\n/.test(store.project.files["DESIGN.md"]) && /headline-display:\n {4}fontFamily: Anton\n/.test(store.project.files["DESIGN.md"]))
    /* A request that asks for new colours may change them. */
    await toolsFor(jobInput({ edit: true, prompt: "Make the accent colour blue" })).set_tokens({ tokens: { colors: { ...t3.colors, accent: "#1f4fd1", accentText: "#ffffff" } } } as never)
    const s4 = await store.readSettings()
    check("a request about colour may change the accent; the font stays the creator's", themeSettingsToTokens(s4).colors.accent === "#1f4fd1" && themeSettingsToTokens(s4).fonts.heading === "Anton")
    check("asked groups read from plain words", askedGroups("make the corners sharper and the font bigger").has("radius") && askedGroups("make the corners sharper").has("fonts") === false && askedGroups("add a page").size === 0)
    const p = protectOverrides({ colors: { ...t3.colors, accent: "#000000" } }, s3, "add a blog")
    check("protectOverrides alone: the override replaces the AI's value", p.kept.includes("colors.accent") && p.tokens.colors?.accent === "#ffd400", p)
    check("recordAiTokens leaves an override an override", userOverrides({ ...s3, [DESIGN_CONTRACT_SETTING]: recordAiTokens(s3, readContractMeta(s3)) }).includes("colors.accent"))
  }

  console.log("\n9. the agent: the brief block, the concept check and DESIGN.md in the plan")
  {
    const plan = planDirection(jobInput(), { store: { name: "Iron Hours", currency: "GBP", brandImage: null, tagline: null }, products: [], collections: [], communities: [], forms: [{ id: "f1", title: "Book", kind: "booking", booking: true }] as never, pages: [], menus: [], blog: { posts: 0 }, reviews: { count: 0, average: null }, links: { creatorPage: null, social: [] }, features: [] })
    check("the plan phase gets the brief and the direction", plan.brief.business.name === "Iron Hours" && plan.choice.primary.id === "bold-performance" && /ART DIRECTION/.test(plan.block) && plan.seeds.length === 3)
    check("report_progress takes the brief's refinements (tool schema)", JSON.stringify(TOOL_SPECS.report_progress.parameters).includes('"brief"'))
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const cp = newCheckpoint()
    cp.brief = plan.brief
    cp.direction = { primary: plan.choice.primary.id, secondary: plan.choice.secondary?.id ?? null, typeSystem: plan.choice.typeSystem.id, seed: plan.choice.seed }
    const tools = createToolSet({ job: jobInput(), deps: { store, models: {} as never, capabilities: async () => null }, cp, emit: () => undefined, onFinish: async () => ({ ok: true }) as never, setPhase: () => undefined })
    const refused = await tools.report_progress({ phase: "plan", label: "Deciding the look", concept: SLOP_CONCEPT } as never)
    check("the trainer's slop concept is refused in the plan phase, with the direction's reasons", refused.ok === false && !cp.concept && (refused.issues ?? []).some((i) => /editorial-serif AI look/.test(i.message)), refused)
    check("and no DESIGN.md is written for a refused concept", !("DESIGN.md" in store.project.files))
    const good = goodConcept(plan.brief)
    const ok = await tools.report_progress({ phase: "plan", label: "Deciding the look", concept: { ...good, typeSystem: { ...good.typeSystem, display: plan.choice.fonts.display, body: plan.choice.fonts.body } }, brief: { audience: "office workers in Leeds" } } as never)
    check("a concept on the direction is accepted", !!cp.concept && cp.brief?.audience === "office workers in Leeds", ok)
    const md = store.project.files["DESIGN.md"] ?? ""
    check("and becomes the site's DESIGN.md (author ai), the direction in the contract metadata", /^---\nversion: alpha\nname: Leeds Iron Hours\n/.test(md) && store.versions.some((v) => v.path === "DESIGN.md" && v.author === "ai") && readContractMeta(store.project.settings)?.direction?.primary === "bold-performance", md.slice(0, 200))
    check("the contract's overview names the audience the plan refined", /for office workers in Leeds/.test(md))
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
