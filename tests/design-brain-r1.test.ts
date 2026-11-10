/**
 * ===========================================================================
 *  ROUND R, R1: THE DESIGN BRAIN (techniques, patterns, recipes, standards)
 * ===========================================================================
 * lib/storelib-ai/library/brain:
 *   1. every record is valid, versioned, Storelib's wording (no em dash, no
 *      brand, no third party URL), and links only to things that exist:
 *      O5 compositions, native section types (ADDABLE_SECTIONS), O2 art
 *      directions, type systems whose families load, pattern ids;
 *   2. licences: every idea learned from Loupe names the project, MIT, the
 *      commit and the file; NOTICE.md carries the licence; the study note
 *      says what was adopted and what was not;
 *   3. recipes' palettes pass contrast and none is the cream plus rust look;
 *   4. ranking is deterministic and cached (a caller cannot corrupt the
 *      cache), MMR picks different things, business fit pushes misfits down;
 *   5. six scenarios (premium fitness coach, contemporary clothing,
 *      editorial photography, luxury skincare, architecture studio,
 *      consulting) get six different recipes, different craft moves and
 *      diverse references;
 *   6. hints map to real tokens: Theme settings through tokensToThemeSettings
 *      and back, loadable fonts, a real motion tier, custom tokens the page
 *      prints, native sections the editor can add;
 *   7. the agent engine: the job's design brief carries the brain (within
 *      its budget, references kept), planDirection prefers the recipe's
 *      directions and the checkpoint replays the same choice, an edit gets
 *      no brain, PROMPT_VERSION is exported;
 *   8. the brain stays out of client bundles (server-only, no client import).
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/design-brain-r1.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  BRAIN_BLOCK_MAX_CHARS,
  BRAIN_VERSION,
  LOUPE,
  PATTERNS,
  RECIPES,
  STANDARDS,
  TECHNIQUES,
  brainProblems,
  brainRecordById,
  designBrainFor,
  jaccard,
  mmr,
  rankBrain,
  type BrainRecord,
} from "@/lib/storelib-ai/library/brain"
import { LAYOUT_COMPOSITIONS } from "@/lib/storelib-ai/layout"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { ART_DIRECTIONS } from "@/lib/storelib-ai/direction/directions"
import { briefFrom } from "@/lib/storelib-ai/direction/brief"
import { chooseDirection, isCream, isRust } from "@/lib/storelib-ai/direction/choose"
import { contrastRatio } from "@/lib/storelib-ai/library/concept"
import { TYPE_SYSTEMS } from "@/lib/storelib-ai/library/type-systems"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { MOTION_TIERS } from "@/lib/storelib-ai/motion"
import { TOKEN_NAME, cleanTokenValue, customTokens, themeSettingsToTokens, tokensToThemeSettings } from "@/lib/ai-builder/tokens"
import { selectReferences } from "@/lib/storelib-ai/references"
import { MAX_DESIGN_BRIEF_CHARS, jobDesignBrief } from "@/lib/ai-builder/agent/design-brief"
import { choiceOf, planDirection } from "@/lib/ai-builder/agent/direction"
import { PROMPT_VERSION } from "@/lib/ai-builder/agent/prompts"
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
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(p, "utf8")

const ALL: BrainRecord[] = [...TECHNIQUES, ...PATTERNS, ...RECIPES, ...STANDARDS]

section("1. Records: valid, versioned, Storelib's wording, links that exist")
{
  const problems = ALL.flatMap((r) => brainProblems(r).map((p) => `${r.id}: ${p}`))
  check("every record validates (ids, versions, fields, no em dash)", problems.length === 0, problems.slice(0, 6))
  check("ids are unique across the four layers", new Set(ALL.map((r) => r.id)).size === ALL.length)
  check("the brain has a version and every record a version from 1", /^r\d+\.\d+$/.test(BRAIN_VERSION) && ALL.every((r) => Number.isInteger(r.version) && r.version >= 1))
  check("enough of each layer to choose from", TECHNIQUES.length >= 20 && PATTERNS.length >= 15 && RECIPES.length >= 10 && STANDARDS.length >= 20, { t: TECHNIQUES.length, p: PATTERNS.length, r: RECIPES.length, s: STANDARDS.length })
  const compIds = new Set(LAYOUT_COMPOSITIONS.map((c) => c.id))
  const addable = new Set(ADDABLE_SECTIONS)
  const badComp = PATTERNS.flatMap((p) => p.compositions.filter((c) => !compIds.has(c)).map((c) => `${p.id}:${c}`))
  const badNative = PATTERNS.flatMap((p) => p.nativeSections.filter((c) => !addable.has(c)).map((c) => `${p.id}:${c}`))
  check("patterns name only real O5 compositions", badComp.length === 0, badComp)
  check("patterns name only native sections the editor can add (ADDABLE_SECTIONS)", badNative.length === 0, badNative)
  const dirIds = new Set(ART_DIRECTIONS.map((d) => d.id))
  const patIds = new Set(PATTERNS.map((p) => p.id))
  check("recipes name only real O2 art directions", RECIPES.every((r) => r.directions.every((d) => dirIds.has(d))), RECIPES.map((r) => r.directions.filter((d) => !dirIds.has(d))).flat())
  check("recipes name only patterns that exist, starting with an opening", RECIPES.every((r) => r.sections.every((s) => patIds.has(s)) && PATTERNS.find((p) => p.id === r.sections[0])!.role === "hero"))
  check("recipes keep to two splits at most", RECIPES.every((r) => r.sections.filter((s) => s === "pat_split-discipline").length <= 1))
  const ts = (id: string) => TYPE_SYSTEMS.find((t) => t.id === id)
  check("every recipe's type system exists and all its families load", RECIPES.every((r) => { const t = ts(r.typeSystem); return !!t && OFFERED_FAMILIES.has(t.display.family) && OFFERED_FAMILIES.has(t.body.family) && (!t.mono || OFFERED_FAMILIES.has(t.mono.family)) }), RECIPES.filter((r) => !ts(r.typeSystem)).map((r) => r.id))
  check("no recipe uses the opt in italic serif system", RECIPES.every((r) => r.typeSystem !== "editorial-italic"))
  const text = JSON.stringify(ALL.map((r) => ({ ...r, provenance: null })))
  check("no URL in any record outside provenance", !/https?:\/\//.test(text))
  /* Loupe's recipes analyse real sites by name; none of those subjects is in Storelib's records. */
  const brands = ["veed", "quietcubes", "quiet cubes", "oryzo", "sutera", "jesko", "lando", "madbox", "happyrobot", "hubtown", "sondaven", "cipher digital", "fifth and dune", "igloo", "bruno simon", "chartogne", "figma", "awwwards", "webild"]
  check("no third party site or brand named in any record", brands.every((b) => !text.toLowerCase().includes(b)), brands.filter((b) => text.toLowerCase().includes(b)))
}

section("2. Licences and attribution")
{
  const adapted = ALL.filter((r) => r.provenance.origin === "adapted")
  check("ideas learned from Loupe say so (some records do)", adapted.length >= 10, adapted.length)
  check("each names Loupe, MIT, the commit read and a file in its library or agents", adapted.every((r) => r.provenance.inspiredBy!.project === LOUPE.project && r.provenance.inspiredBy!.licence === "MIT" && /^[0-9a-f]{40}$/.test(r.provenance.inspiredBy!.commit) && /^(baseline\/library|app\/agents|app\/electron)\//.test(r.provenance.inspiredBy!.path)))
  check("Storelib's own records claim no source", ALL.filter((r) => r.provenance.origin === "storelib").every((r) => r.provenance.inspiredBy === null))
  const notice = "lib/storelib-ai/library/brain/NOTICE.md"
  check("NOTICE.md carries Loupe's MIT licence and the commit", existsSync(notice) && /MIT License/.test(read(notice)) && read(notice).includes(LOUPE.commit) && /Copyright \(c\) 2026 winchxyz/.test(read(notice)))
  const study = "docs/ai-builder/loupe-study.md"
  check("the study note exists and covers licences, what was adopted and what was not", existsSync(study) && /licen[cs]e/i.test(read(study)) && /adopt/i.test(read(study)) && /not adopt|do not take|did not take|leave out|left out/i.test(read(study)))
}

section("3. Recipes: palettes that read, not the 2025 AI look")
{
  const bad: string[] = []
  for (const r of RECIPES) {
    const p = r.palette
    if (contrastRatio(p.text, p.background) < 7) bad.push(`${r.id} text ${contrastRatio(p.text, p.background).toFixed(2)}`)
    if (contrastRatio(p.muted, p.background) < 4.5) bad.push(`${r.id} muted ${contrastRatio(p.muted, p.background).toFixed(2)}`)
    if (contrastRatio(p.accentText, p.accent) < 4.5) bad.push(`${r.id} accentText ${contrastRatio(p.accentText, p.accent).toFixed(2)}`)
    if (contrastRatio(p.inverse.text, p.inverse.background) < 4.5) bad.push(`${r.id} inverse ${contrastRatio(p.inverse.text, p.inverse.background).toFixed(2)}`)
    if (contrastRatio(p.text, p.surface) < 4.5) bad.push(`${r.id} surface ${contrastRatio(p.text, p.surface).toFixed(2)}`)
  }
  check("text 7:1, muted 4.5:1, action text 4.5:1, inverse 4.5:1, text on surface 4.5:1", bad.length === 0, bad)
  check("no recipe is a cream ground or a rust accent", RECIPES.every((r) => !isCream(r.palette.background) && !isRust(r.palette.accent)), RECIPES.filter((r) => isCream(r.palette.background) || isRust(r.palette.accent)).map((r) => r.id))
  check("recipes span light and dark grounds", RECIPES.some((r) => r.palette.mode === "dark") && RECIPES.filter((r) => r.palette.mode === "light").length >= 4)
  check("recipes span the three motion tiers", MOTION_TIERS.every((t) => RECIPES.some((r) => r.motionTier === t)))
}

section("4. Ranking: deterministic, cached, diverse, fitted to the business")
{
  const brief = "Website for my premium personal training business, people book a session."
  const a = designBrainFor(brief)
  const b = designBrainFor(brief)
  check("the same brief gives the same brain, byte for byte", JSON.stringify(a) === JSON.stringify(b))
  a.hints.tokens.colors.accent = "#000000"
  a.hints.sectionStrategy.home.length = 0
  const c = designBrainFor(brief)
  check("a caller changing its copy does not change the cache", c.hints.tokens.colors.accent !== "#000000" && c.hints.sectionStrategy.home.length > 0)
  const q = { text: "dark training floor booking photography", business: "fitness" }
  check("rankBrain is deterministic", JSON.stringify(rankBrain(TECHNIQUES, q).map((s) => [s.record.id, s.score])) === JSON.stringify(rankBrain(TECHNIQUES, q).map((s) => [s.record.id, s.score])))
  /* MMR: the top six by relevance alone against the top six by MMR: MMR covers more areas. */
  const ranked = rankBrain(TECHNIQUES, { text: "typography type tracking leading measure scale headline", business: "general" })
  const areas = (xs: { record: { kind: string } }[]) => new Set(xs.map((x) => (x.record as { area: string }).area)).size
  const pure = ranked.slice(0, 6)
  const div = mmr(ranked, 6, 0.65)
  check("MMR picks six craft moves over more areas than relevance alone", areas(div) > areas(pure), { pure: areas(pure), mmr: areas(div) })
  check("MMR keeps the most relevant first", div[0].record.id === ranked[0].record.id)
  check("jaccard is 1 for equal sets and 0 for disjoint ones", jaccard(new Set(["a", "b"]), new Set(["a", "b"])) === 1 && jaccard(new Set(["a"]), new Set(["b"])) === 0)
  const fit = rankBrain(RECIPES, { text: "luxury premium", business: "fitness" })
  check("business fit: a fitness brief ranks the fitness recipe over luxury words", fit[0].record.id === "rcp_performance-floor", fit.slice(0, 3).map((x) => x.record.id))
  check("a recipe that fits the business poorly is pushed down", fit.findIndex((x) => x.record.id === "rcp_mineral-luxe") > 2)
  check("avoidRecipes moves a recently used recipe aside", designBrainFor(brief, { avoidRecipes: ["rcp_performance-floor"] }).recipe.id !== "rcp_performance-floor")
  const small = designBrainFor(brief, { maxChars: 1_200 })
  check("the block keeps to its cap and keeps the recipe and the blockers' heading", small.block.length <= 1_200 && small.block.startsWith(`DESIGN BRAIN (${BRAIN_VERSION})`), small.block.length)
  check("the default block keeps to BRAIN_BLOCK_MAX_CHARS", c.block.length <= BRAIN_BLOCK_MAX_CHARS)
  check("every blocker standard is among the checks", STANDARDS.filter((s) => s.severity === "blocker").every((s) => c.ids.standards.includes(s.id)))
}

const SCENARIOS: { name: string; prompt: string; recipe: string; kind: string }[] = [
  { name: "premium fitness coach", prompt: "Website for my premium personal training business. One to one strength coaching in London, people book a session.", recipe: "rcp_performance-floor", kind: "fitness" },
  { name: "contemporary clothing brand", prompt: "Online store for our contemporary clothing brand, new drops every month, oversized tees and outerwear.", recipe: "rcp_apparel-drop", kind: "fashion" },
  { name: "editorial photography portfolio", prompt: "Portfolio for my editorial photography: magazine features, campaigns and portraits.", recipe: "rcp_gallery-white", kind: "photography" },
  { name: "luxury skincare", prompt: "Luxury skincare brand selling serums, oils and creams made with botanical ingredients.", recipe: "rcp_mineral-luxe", kind: "beauty" },
  { name: "modern architecture studio", prompt: "Website for a modern architecture studio: our built projects, our approach and how to commission us.", recipe: "rcp_architect-grid", kind: "architecture" },
  { name: "professional consulting", prompt: "Professional consulting firm helping mid sized companies with operations strategy. Clients enquire for a proposal.", recipe: "rcp_advisory-clear", kind: "professional" },
]

section("5. Six scenarios: six recipes, different craft, diverse references")
{
  const out = SCENARIOS.map((s) => {
    const brief = briefFrom(s.prompt, null, null)
    const pre = designBrainFor(brief)
    const choice = chooseDirection(brief, [], { seed: `creator:${s.name}`, prefer: pre.directions, preferType: pre.typeSystem })
    const brain = designBrainFor(brief, { direction: choice })
    const refs = selectReferences(brief, { limit: 4 })
    return { s, brief, choice, brain, refs }
  })
  for (const o of out) check(`${o.s.name}: classified ${o.brief.business.kind}, recipe ${o.brain.recipe.id}`, o.brief.business.kind === o.s.kind && o.brain.recipe.id === o.s.recipe, { kind: o.brief.business.kind, recipe: o.brain.recipe.id, why: o.brain.recipe.why })
  check("six scenarios, six different recipes", new Set(out.map((o) => o.brain.recipe.id)).size === 6)
  check("the chosen art direction is one the recipe realises in at least five of six", out.filter((o) => o.brain.directions.includes(o.choice.primary.id)).length >= 5, out.map((o) => [o.choice.primary.id, o.brain.directions]))
  check("six different section spines", new Set(out.map((o) => o.brain.hints.sectionStrategy.home.map((h) => h.patternId).join())).size === 6)
  check("six different token sets", new Set(out.map((o) => JSON.stringify(o.brain.hints.tokens))).size === 6)
  check("at least four different motion tier and spacing combinations", new Set(out.map((o) => `${o.brain.hints.motionTier}:${o.brain.hints.spacing.sectionY}:${o.brain.hints.spacing.pageWidth}`)).size >= 4)
  const techSets = out.map((o) => o.brain.ids.techniques.join())
  check("craft moves differ between scenarios (at least four different sets)", new Set(techSets).size >= 4, techSets)
  check("within a scenario the six craft moves cover at least four areas (MMR)", out.every((o) => new Set(o.brain.ids.techniques.map((id) => (brainRecordById(id) as { area: string }).area)).size >= 4))
  check("every scenario's spine has six or more sections and at most one split pattern", out.every((o) => o.brain.hints.sectionStrategy.home.length >= 6 && o.brain.hints.sectionStrategy.home.filter((h) => h.patternId === "pat_split-discipline").length <= 1))
  check("the photographer and the architect get a work index; the coach and the consultant numbered steps", ["editorial photography portfolio", "modern architecture studio"].every((n) => out.find((o) => o.s.name === n)!.brain.hints.sectionStrategy.home.some((h) => h.patternId === "pat_work-index")) && ["premium fitness coach", "professional consulting"].every((n) => out.find((o) => o.s.name === n)!.brain.hints.sectionStrategy.home.some((h) => h.patternId === "pat_numeral-steps")))
  /* References: each set has no repeated subject, and the sets differ between businesses. */
  check("each scenario gets references", out.every((o) => o.refs.length >= 2), out.map((o) => o.refs.length))
  check("no scenario's references repeat a subject or a record", out.every((o) => new Set(o.refs.map((r) => r.ref.id)).size === o.refs.length && new Set(o.refs.map((r) => r.ref.source.subject).filter(Boolean)).size === o.refs.map((r) => r.ref.source.subject).filter(Boolean).length))
  let maxOverlap = 0
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) maxOverlap = Math.max(maxOverlap, jaccard(new Set(out[i].refs.map((r) => r.ref.id)), new Set(out[j].refs.map((r) => r.ref.id))))
  check("reference sets of different businesses overlap little (Jaccard at most 0.5)", maxOverlap <= 0.5, maxOverlap)
  check("the fitness coach's references are not the skincare brand's", out[0].refs.map((r) => r.ref.id).join() !== out[3].refs.map((r) => r.ref.id).join())
}

section("6. Hints map to real tokens and real sections")
{
  const addable = new Set(ADDABLE_SECTIONS)
  for (const s of SCENARIOS) {
    const brief = briefFrom(s.prompt, null, null)
    const brain = designBrainFor(brief)
    const h = brain.hints
    const settings = tokensToThemeSettings(h.tokens)
    const back = themeSettingsToTokens(settings)
    const custom = customTokens(settings)
    const ok =
      h.recipeId === brain.recipe.id &&
      OFFERED_FAMILIES.has(h.tokens.fonts.heading) &&
      OFFERED_FAMILIES.has(h.tokens.fonts.body) &&
      TYPE_SYSTEMS.some((t) => t.id === h.typePairing.typeSystemId) &&
      (MOTION_TIERS as readonly string[]).includes(h.motionTier) &&
      h.tokens.motion.tier === h.motionTier &&
      back.colors.accent.toLowerCase() === h.tokens.colors.accent.toLowerCase() &&
      back.colors.background.toLowerCase() === h.tokens.colors.background.toLowerCase() &&
      back.fonts.heading === h.tokens.fonts.heading &&
      back.radius.medium === h.tokens.radius.medium &&
      back.spacing.sectionY === h.tokens.spacing.sectionY &&
      Object.keys(h.tokens.custom ?? {}).every((k) => TOKEN_NAME.test(k) && cleanTokenValue(h.tokens.custom![k]) !== null && custom[k] === h.tokens.custom![k]) &&
      h.sectionStrategy.home.every((step) => step.nativeSections.length > 0 && step.nativeSections.every((n) => addable.has(n))) &&
      h.spacing.steps.every((x) => x % 4 === 0) &&
      h.imageDirection.ratios.length > 0
    check(`${s.name}: tokens round-trip through Theme settings; fonts load; tier, custom tokens and native sections are real`, ok, { fonts: h.tokens.fonts, back: back.colors, custom, tier: h.motionTier })
  }
  const asked = designBrainFor(briefFrom('Personal trainer site, black and #ff0044 please, font "Anton"', null, null))
  check("the creator's colours and named font are kept when there is no direction", asked.hints.tokens.colors.accent.toLowerCase() === "#ff0044" && asked.hints.tokens.fonts.heading === "Anton" && asked.hints.typePairing.source === "creator", { colors: asked.hints.tokens.colors, fonts: asked.hints.tokens.fonts })
  const fit = briefFrom(SCENARIOS[0].prompt, null, null)
  const dir = chooseDirection(fit, [], { seed: "x" })
  const withDir = designBrainFor(fit, { direction: dir })
  check("with an art direction, the direction owns palette and fonts; the recipe the system", withDir.hints.tokens.colors.background === dir.palette.background && withDir.hints.tokens.fonts.heading === dir.fonts.display && withDir.hints.typePairing.source === "direction" && withDir.hints.tokens.spacing.sectionY === RECIPES.find((r) => r.id === withDir.recipe.id)!.spacing.sectionY)
  const noProducts = designBrainFor(briefFrom("Online store for my clothing brand, people buy the drops", null, { products: [] }))
  check("a store without products gets no shop pattern in its spine", !noProducts.hints.sectionStrategy.home.some((h) => h.patternId === "pat_shop-edit") || !noProducts.hints.sectionStrategy.home.length, noProducts.hints.sectionStrategy.home.map((h) => h.patternId))
}

async function agentSection() {
section("7. The agent engine carries the brain")
{
  const job = (over: Partial<AgentJobInput> = {}): AgentJobInput => ({ jobId: "job_r1", creatorId: "creator_r1", installId: "install_r1", prompt: SCENARIOS[0].prompt, options: null, ...over }) as AgentJobInput
  const plan = planDirection(job(), null, [])
  check("planDirection prefers the recipe's directions and type system, and says so", plan.prefer.length > 0 && plan.prefer.includes(plan.choice.primary.id) && typeof plan.preferType === "string")
  const cp = { brief: plan.brief, direction: { primary: plan.choice.primary.id, secondary: plan.choice.secondary?.id ?? null, typeSystem: plan.choice.typeSystem.id, seed: plan.choice.seed, prefer: plan.prefer, preferType: plan.preferType } }
  const again = choiceOf(cp)
  check("the checkpoint replays the same choice (concept checks see the direction the model saw)", !!again && again.primary.id === plan.choice.primary.id && again.typeSystem.id === plan.choice.typeSystem.id && again.palette.background === plan.choice.palette.background)
  const { SEED_REFERENCES } = await import("@/lib/storelib-ai/references/seed")
  const brief = await jobDesignBrief({ job: job(), caps: null, files: [], references: { list: SEED_REFERENCES.slice(0, 2) }, direction: { brief: plan.brief, choice: plan.choice } })
  check("the first turn carries the brain block with its version and recipe", brief.text.includes(`DESIGN BRAIN (${BRAIN_VERSION})`) && brief.brain?.recipeId === "rcp_performance-floor" && brief.text.includes("Starting tokens (send as set_tokens"))
  check("and still the art direction and the references", /ART DIRECTION/.test(brief.text) && /\[R1\]/.test(brief.text) && brief.referenceIds.length === 2)
  check("the brain's hints come back for the engine to apply", !!brief.brain && brief.brain.hints.tokens.fonts.heading === plan.choice.fonts.display && brief.brain.version === BRAIN_VERSION)
  check("the design brief stays within its budget", brief.text.length <= MAX_DESIGN_BRIEF_CHARS + 20, brief.text.length)
  check("the brief says which prompts it was written for", brief.promptVersion === PROMPT_VERSION && /^\d{4}-\d{2}-r\d+$/.test(PROMPT_VERSION))
  const edit = await jobDesignBrief({ job: job({ edit: true } as Partial<AgentJobInput>), caps: null, files: [] })
  check("an edit gets no brain (the site's own DESIGN.md leads)", !edit.brain && !edit.text.includes("DESIGN BRAIN"))
  const designBrief = read("lib/ai-builder/agent/design-brief.ts")
  check("design-brief exports designBrainFor for the native engine (R2)", /export \{ designBrainFor, type DesignBrain \}/.test(designBrief))
}

}

async function main() {
await agentSection()
section("8. Build memory: the brain stays on the server")
{
  check("brain/index.ts is server-only", read("lib/storelib-ai/library/brain/index.ts").startsWith('import "server-only"'))
  check("the library's browser safe index does not re-export the brain", !/brain/.test(read("lib/storelib-ai/library/index.ts")))
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "node_modules" ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [] })
  const clients = [...walk("app"), ...walk("components")].filter((f) => /^["']use client["']/m.test(read(f).slice(0, 200)))
  check("no client component imports the brain", clients.every((f) => !/library\/brain/.test(read(f))), clients.filter((f) => /library\/brain/.test(read(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
