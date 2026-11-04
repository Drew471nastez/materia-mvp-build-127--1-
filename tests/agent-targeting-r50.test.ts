/**
 * ===========================================================================
 *  ROUND 50: WHICH SECTION STORELIB AI CHANGES, OR WHETHER IT ADDS ONE
 * ===========================================================================
 * The owner: "When I select a section, or I don't select it, it should be
 * smart, and learn when to code a new section or edit a current existing
 * section."
 *
 * An evaluation set of requests, each with the page, the selection and the
 * right answer, run through the deterministic pre-step
 * (lib/website-builder/agent/targeting.ts resolveTarget) and through what
 * decided before it (./selection-intent.ts readSelection with a section open,
 * ./follow-up.ts and ./router.ts with none), and the accuracy of both is
 * printed. No model is called: the cheap model call is a fake here.
 *
 * Then: the decision reaches the run's first message, the reply's first line
 * says what was changed ("Edited: Hero", "Added: Testimonials, after Hero")
 * from what the run did, and a guess says it is one.
 *
 * Run with:  npx tsx --conditions react-server tests/agent-targeting-r50.test.ts
 * (or through scripts/run-push-tests.mjs).
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { changeHeadline, decideTarget, describeTarget, normalizeWords, readTargetAnswer, resolveTarget, targetClassifierPrompt, targetGuidance, type TargetDecision, type TargetInput, type TargetPageSection } from "@/lib/website-builder/agent/targeting"
import { readSelection, selectedShapeOf } from "@/lib/website-builder/agent/selection-intent"
import { followUpTarget } from "@/lib/website-builder/agent/follow-up"
import { routeByRules } from "@/lib/website-builder/agent/router"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, AgentTurn, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)

/* ── the page every case runs on ───────────────────────────────────────── */

const PAGE: TargetPageSection[] = [
  { id: "header", type: "header", name: "Header", settings: {} },
  { id: "hero-1", type: "hero_centered", name: "Centered Hero", settings: { heading: "Fresh bread every morning", subheading: "Baked in Leith since 1998", button_label: "Order now" } },
  { id: "products-1", type: "product_featured", name: "Featured Products", settings: { heading: "Our loaves" } },
  { id: "proof-1", type: "proof_testimonials", name: "Testimonials Grid", label: "What customers say", settings: { heading: "Loved by Edinburgh" }, blocks: [{ type: "testimonial", settings: { quote: "The sourdough is unreal", author: "Mhairi" } }] },
  { id: "faq-1", type: "faq_accordion", name: "Accordion FAQ", settings: { heading: "Questions" }, blocks: [{ type: "question", settings: { question: "Do you deliver?", answer: "Within the city, every morning." } }] },
  { id: "news-1", type: "promo_newsletter", name: "Newsletter Signup", settings: { heading: "Join the bread club" } },
  { id: "footer", type: "footer", name: "Footer", settings: {} },
]
const addable = ADDABLE_SECTIONS.map((type) => ({ type, name: SECTION_SCHEMAS[type]?.name }))
const schema: TargetInput["schema"] = (type) => {
  const s = SECTION_SCHEMAS[type]
  return s ? { name: s.name, fields: s.fields as never, blocks: s.blocks as never } : undefined
}
const base = (prompt: string, selectedId?: string, extra: Partial<TargetInput> = {}): TargetInput => ({ prompt, sections: PAGE, selectedId, addable, schema, ...extra })

/* ── the evaluation set ────────────────────────────────────────────────── */

interface Expected {
  action: TargetDecision["action"]
  ids?: string[]
  /** For an add: the kind of section, by a part of its type. */
  kind?: RegExp
  index?: number
}
interface Case {
  group: "selected-edit" | "selected-new" | "unselected-edit" | "unselected-new" | "ambiguous" | "multi" | "language" | "wide"
  prompt: string
  selected?: string
  lastChanged?: string[]
  locked?: boolean
  want: Expected
}

const CASES: Case[] = [
  /* A section open, the request about it. */
  { group: "selected-edit", prompt: "make this bigger", selected: "hero-1", want: { action: "edit", ids: ["hero-1"] } },
  { group: "selected-edit", prompt: "change the colour", selected: "proof-1", want: { action: "edit", ids: ["proof-1"] } },
  { group: "selected-edit", prompt: "add a button here", selected: "hero-1", want: { action: "edit", ids: ["hero-1"] } },
  { group: "selected-edit", prompt: "add two more questions", selected: "faq-1", want: { action: "edit", ids: ["faq-1"] } },
  { group: "selected-edit", prompt: "rewrite the heading so it sounds warmer", selected: "products-1", want: { action: "edit", ids: ["products-1"] } },
  { group: "selected-edit", prompt: "make the cards slide in when you scroll", selected: "proof-1", want: { action: "edit", ids: ["proof-1"] } },
  { group: "selected-edit", prompt: "add a testimonial from Mhairi", selected: "proof-1", want: { action: "edit", ids: ["proof-1"] } },
  { group: "selected-edit", prompt: "more padding please", selected: "news-1", locked: true, want: { action: "edit", ids: ["news-1"] } },
  /* A section open, the request for something new beside it. */
  { group: "selected-new", prompt: "add a testimonials section below", selected: "hero-1", want: { action: "add", kind: /testimonial|proof/, index: 2 } },
  { group: "selected-new", prompt: "add a pricing section above this", selected: "faq-1", want: { action: "add", kind: /pricing/, index: 4 } },
  { group: "selected-new", prompt: "I need another section with a map", selected: "hero-1", want: { action: "add", kind: /map/, index: 2 } },
  { group: "selected-new", prompt: "create a new FAQ section, something completely different", selected: "faq-1", want: { action: "add", kind: /faq/ } },
  { group: "selected-new", prompt: "turn this into a gallery", selected: "products-1", want: { action: "replace", ids: ["products-1"] } },
  { group: "selected-new", prompt: "add a countdown below the hero", selected: "faq-1", want: { action: "add", kind: /countdown/, index: 2 } },
  /* A section open, the words naming another. */
  { group: "selected-edit", prompt: "make the footer darker", selected: "hero-1", want: { action: "edit", ids: ["footer"] } },
  { group: "selected-edit", prompt: "shorten the FAQ answers", selected: "hero-1", want: { action: "edit", ids: ["faq-1"] } },
  /* Nothing open, an existing section meant. */
  { group: "unselected-edit", prompt: "make the hero image taller", want: { action: "edit", ids: ["hero-1"] } },
  { group: "unselected-edit", prompt: "change the footer background to black", want: { action: "edit", ids: ["footer"] } },
  { group: "unselected-edit", prompt: "the section with pricing... I mean the FAQ: add a question about gluten", want: { action: "edit", ids: ["faq-1"] } },
  { group: "unselected-edit", prompt: 'change the section that says "Join the bread club" to say "Get fresh news"', want: { action: "edit", ids: ["news-1"] } },
  { group: "unselected-edit", prompt: "make the second section's heading bigger", want: { action: "edit", ids: ["products-1"] } },
  { group: "unselected-edit", prompt: "make the last section green", want: { action: "edit", ids: ["news-1"] } },
  { group: "unselected-edit", prompt: "rename the What customers say section to Kind words", want: { action: "edit", ids: ["proof-1"] } },
  { group: "unselected-edit", prompt: "add a button to the hero", want: { action: "edit", ids: ["hero-1"] } },
  { group: "unselected-edit", prompt: "remove the button from the hero", want: { action: "edit", ids: ["hero-1"] } },
  { group: "unselected-edit", prompt: "delete the testimonials", want: { action: "remove", ids: ["proof-1"] } },
  { group: "unselected-edit", prompt: "make it bigger", lastChanged: ["faq-1"], want: { action: "edit", ids: ["faq-1"] } },
  { group: "unselected-edit", prompt: "make the section below the hero darker", want: { action: "edit", ids: ["products-1"] } },
  { group: "unselected-edit", prompt: "the newsletter signup should be centred", want: { action: "edit", ids: ["news-1"] } },
  /* Nothing open, something new. */
  { group: "unselected-new", prompt: "add a pricing section", want: { action: "add", kind: /pricing/, index: 6 } },
  { group: "unselected-new", prompt: "add a video below the hero", want: { action: "add", kind: /video/, index: 2 } },
  { group: "unselected-new", prompt: "add another testimonials section at the top", want: { action: "add", kind: /testimonial|proof/, index: 1 } },
  { group: "unselected-new", prompt: "add a contact form above the footer", want: { action: "add", kind: /contact/, index: 6 } },
  { group: "unselected-new", prompt: "create a new section with our opening hours", want: { action: "add", index: 6 } },
  { group: "unselected-new", prompt: "I want a map", want: { action: "add", kind: /map/ } },
  { group: "unselected-new", prompt: "add a gallery after the products", want: { action: "add", kind: /gallery|collage/, index: 3 } },
  /* Ambiguous: the likeliest reading, said as a guess. */
  { group: "ambiguous", prompt: "add testimonials", selected: "faq-1", want: { action: "add", kind: /testimonial|proof/, index: 5 } },
  { group: "ambiguous", prompt: "add more reviews", want: { action: "edit", ids: ["proof-1"] } },
  { group: "ambiguous", prompt: "add a button", want: { action: "edit", ids: ["hero-1"] } },
  { group: "ambiguous", prompt: "make the sourdough quote stand out", want: { action: "edit", ids: ["proof-1"] } },
  /* Several sections. */
  { group: "multi", prompt: "make the hero and the footer darker", want: { action: "edit", ids: ["hero-1", "footer"] } },
  { group: "multi", prompt: "use the same heading size in the FAQ and the newsletter", want: { action: "edit", ids: ["faq-1", "news-1"] } },
  { group: "multi", prompt: "make the order button in the hero bigger", want: { action: "edit", ids: ["hero-1"] } },
  /* Other languages. */
  { group: "language", prompt: "añade una sección de testimonios debajo del hero", want: { action: "add", kind: /testimonial|proof/, index: 2 } },
  { group: "language", prompt: "haz el pie de página más oscuro", want: { action: "edit", ids: ["footer"] } },
  { group: "language", prompt: "ajoute une section FAQ en bas de la page", want: { action: "add", kind: /faq/, index: 6 } },
  { group: "language", prompt: "rends la bannière plus grande", want: { action: "edit", ids: ["hero-1"] } },
  { group: "language", prompt: "füge einen neuen Abschnitt mit Preisen unter dem Hero hinzu", want: { action: "add", kind: /pricing/, index: 2 } },
  { group: "language", prompt: "mach die Fußzeile dunkler", want: { action: "edit", ids: ["footer"] } },
  { group: "language", prompt: "adicione uma seção de perguntas frequentes", want: { action: "add", kind: /faq/ } },
  { group: "language", prompt: "aggiungi una nuova sezione con la mappa", want: { action: "add", kind: /map/ } },
  { group: "language", prompt: "maak de nieuwsbrief groter", want: { action: "edit", ids: ["news-1"] } },
  { group: "language", prompt: "cambia el color de esta sección", selected: "faq-1", want: { action: "edit", ids: ["faq-1"] } },
  /* The whole page or site: nothing narrowed. */
  { group: "wide", prompt: "make the whole page feel more premium", want: { action: "wide" } },
  { group: "wide", prompt: "change the fonts to something more elegant", want: { action: "wide" } },
]

/*
  HELD OUT: written after the set above was passing and before any of these
  were run, so its first score is the honest one for requests the rules were
  not tuned on. Scored and printed on its own.
*/
const HELD_OUT: Case[] = [
  { group: "selected-edit", prompt: "make the heading font smaller", selected: "hero-1", want: { action: "edit", ids: ["hero-1"] } },
  { group: "selected-edit", prompt: "put a picture next to the form", selected: "news-1", want: { action: "edit", ids: ["news-1"] } },
  { group: "selected-new", prompt: "add a newsletter section after this one", selected: "products-1", want: { action: "add", kind: /newsletter/, index: 3 } },
  { group: "selected-new", prompt: "replace this with a logo strip", selected: "proof-1", want: { action: "replace", ids: ["proof-1"] } },
  { group: "selected-edit", prompt: "make the hero background blue", selected: "faq-1", want: { action: "edit", ids: ["hero-1"] } },
  { group: "unselected-edit", prompt: "change the headline in the hero to Warm bread daily", want: { action: "edit", ids: ["hero-1"] } },
  { group: "unselected-edit", prompt: "hide the newsletter", want: { action: "edit", ids: ["news-1"] } },
  { group: "unselected-edit", prompt: "remove the FAQ section", want: { action: "remove", ids: ["faq-1"] } },
  { group: "unselected-new", prompt: "add a team section", want: { action: "add", index: 6 } },
  { group: "unselected-new", prompt: "add a section showing our three best sellers below the testimonials", want: { action: "add", kind: /product/, index: 4 } },
  { group: "unselected-edit", prompt: "make the third section wider", want: { action: "edit", ids: ["proof-1"] } },
  { group: "unselected-edit", prompt: "the footer links should be white", want: { action: "edit", ids: ["footer"] } },
  { group: "unselected-edit", prompt: "can you make the products grid 4 columns", want: { action: "edit", ids: ["products-1"] } },
  { group: "multi", prompt: "make the testimonials and the FAQ use the same background", want: { action: "edit", ids: ["proof-1", "faq-1"] } },
  { group: "language", prompt: "elimina la sección de preguntas frecuentes", want: { action: "remove", ids: ["faq-1"] } },
  { group: "language", prompt: "change le titre de la bannière", want: { action: "edit", ids: ["hero-1"] } },
  { group: "language", prompt: "füge eine Galerie über dem Footer hinzu", want: { action: "add", kind: /gallery|collage/, index: 6 } },
  { group: "language", prompt: "deixe o rodapé mais escuro", want: { action: "edit", ids: ["footer"] } },
  { group: "language", prompt: "rendi più grande il titolo della newsletter", want: { action: "edit", ids: ["news-1"] } },
  { group: "language", prompt: "voeg een nieuwe sectie met reviews toe onder de hero", want: { action: "add", kind: /testimonial|proof|review/, index: 2 } },
  { group: "wide", prompt: "redesign the entire site in a darker style", want: { action: "wide" } },
  { group: "ambiguous", prompt: "add an FAQ", want: { action: "add", kind: /faq/, index: 6 } },
  { group: "unselected-edit", prompt: "write a better subheading for the top section", want: { action: "edit", ids: ["hero-1"] } },
  { group: "selected-new", prompt: "add a testimonial carousel underneath", selected: "hero-1", want: { action: "add", kind: /testimonial|proof|review/, index: 2 } },
]

/* ── what decided before this round ────────────────────────────────────── */

/**
 * The deterministic layer as it stood: with a section open, readSelection
 * (a doubt is a question back, which the owner does not want), the selection
 * edited even when the words named another; with none, a follow up to the
 * last change, the router's "add a section" rules, and otherwise nothing:
 * the model searched the page itself.
 */
function legacy(c: Case): TargetDecision {
  const none: TargetDecision = { action: "edit", sections: [], confidence: "guess", via: "default", reason: "none" }
  const blockTypes = (type: string) => (SECTION_SCHEMAS[type]?.blocks ?? []).map((b) => String((b as { type?: unknown }).type ?? ""))
  if (c.selected) {
    const sel = PAGE.find((s) => s.id === c.selected)!
    const t = { id: sel.id, type: sel.type, name: sel.name ?? sel.type }
    if (c.locked) return { ...none, sections: [t], confidence: "sure", via: "lock" }
    const shape = selectedShapeOf(PAGE as never, sel.id, blockTypes)!
    const read = readSelection(c.prompt, shape)
    if (read.aim === "edit") return { ...none, sections: [t], via: "selection" }
    if (read.aim === "replace") return { ...none, action: "replace", sections: [t], via: "selection" }
    if (read.aim === "new") return { ...none, action: "add", placement: { index: read.index ?? 0, where: "after" }, ...(read.named ? { kindWord: read.named } : {}) }
    return { ...none, action: "question" }
  }
  const intent = classifyIntent(c.prompt, { selected: false, bodySections: 5, hasHistory: !!c.lastChanged })
  const follow = followUpTarget({ intent: { ...intent, followUp: intent.followUp || !!c.lastChanged }, prompt: c.prompt, brief: c.lastChanged ? ({ recent: [{ ids: c.lastChanged }] } as never) : null, sections: PAGE as never })
  if (follow) {
    const s = PAGE.find((x) => x.id === follow.id)!
    return { ...none, sections: [{ id: s.id, type: s.type, name: s.name ?? "" }], via: "follow-up" }
  }
  const routed = routeByRules({ prompt: c.prompt, images: 0, selection: null, scoped: false, bodySections: 5, addable, onPage: PAGE.map((s) => ({ type: s.type, name: s.name ?? undefined })) })
  if (routed.target === "page" || routed.target === "theme") return { ...none, action: "wide" }
  if (/section the theme has|section of its own|a new one beside|something to add/.test(routed.reason)) return { ...none, action: "add" }
  return none
}

function score(d: TargetDecision, want: Expected): { ok: boolean; why: string } {
  if (d.action !== want.action) return { ok: false, why: `action ${d.action}` }
  if (want.ids) {
    const got = d.sections.map((s) => s.id).sort().join(",")
    if (got !== [...want.ids].sort().join(",")) return { ok: false, why: `sections [${got}]` }
  }
  if (want.kind && !(d.kind && want.kind.test(d.kind))) return { ok: false, why: `kind ${d.kind ?? "none"}` }
  if (want.index !== undefined && d.placement?.index !== want.index) return { ok: false, why: `index ${d.placement?.index ?? "none"}` }
  return { ok: true, why: "" }
}

/* ── the decision in a real run ────────────────────────────────────────── */

type Call = [string, Record<string, unknown>]
function scripted(script: { text?: string; calls?: Call[] }[], sent: ProviderRequest[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push({ ...request, turns: request.turns.map((t) => ({ ...t })) as AgentTurn[] })
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${turn}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
}

async function main() {
section(`The evaluation set: ${CASES.length} requests`)
{
  check("at least 40 cases", CASES.length >= 40, CASES.length)
  const groups = new Set(CASES.map((c) => c.group))
  check("selected and unselected, edit and new, ambiguous, multi section, other languages, the whole page", ["selected-edit", "selected-new", "unselected-edit", "unselected-new", "ambiguous", "multi", "language", "wide"].every((g) => groups.has(g as Case["group"])))
  const languages = CASES.filter((c) => c.group === "language").length
  check("five languages besides English, ten cases or more", languages >= 10, languages)

  let before = 0
  let after = 0
  const perGroup = new Map<string, { n: number; before: number; after: number }>()
  for (const c of CASES) {
    const now = resolveTarget(base(c.prompt, c.selected, { lastChanged: c.lastChanged, locked: c.locked }))
    const then = legacy(c)
    const a = score(now, c.want)
    const b = score(then, c.want)
    if (a.ok) after++
    if (b.ok) before++
    const g = perGroup.get(c.group) ?? { n: 0, before: 0, after: 0 }
    g.n++
    if (a.ok) g.after++
    if (b.ok) g.before++
    perGroup.set(c.group, g)
    check(`${c.selected ? `[${c.selected}] ` : ""}"${c.prompt}": ${describeTarget(now)}`, a.ok, a.why)
  }
  const pct = (n: number) => `${Math.round((n / CASES.length) * 100)}%`
  console.log(`\n  ACCURACY  before ${before}/${CASES.length} (${pct(before)})   after ${after}/${CASES.length} (${pct(after)})`)
  for (const [g, v] of perGroup) console.log(`            ${g.padEnd(16)} before ${v.before}/${v.n}   after ${v.after}/${v.n}`)
  check("the new layer is right on 95% of the set or more", after / CASES.length >= 0.95, { after, of: CASES.length })
  check("and better than what decided before", after > before, { before, after })
}

section(`Held out: ${HELD_OUT.length} requests the rules were not tuned on`)
{
  let before = 0
  let after = 0
  for (const c of HELD_OUT) {
    const now = resolveTarget(base(c.prompt, c.selected, { lastChanged: c.lastChanged, locked: c.locked }))
    const a = score(now, c.want)
    if (a.ok) after++
    if (score(legacy(c), c.want).ok) before++
    console.log(`  ${a.ok ? "right" : "WRONG"} ${c.selected ? `[${c.selected}] ` : ""}"${c.prompt}": ${describeTarget(now)}${a.ok ? "" : ` (${a.why})`}`)
  }
  console.log(`\n  HELD OUT ACCURACY  before ${before}/${HELD_OUT.length} (${Math.round((before / HELD_OUT.length) * 100)}%)   after ${after}/${HELD_OUT.length} (${Math.round((after / HELD_OUT.length) * 100)}%)`)
  check("held out: right on 80% or more", after / HELD_OUT.length >= 0.8, { after, of: HELD_OUT.length })
  check("held out: better than before", after > before, { before, after })
}

section("A doubt is settled, never asked")
{
  const d = resolveTarget(base("add testimonials", "faq-1"))
  check("with the FAQ open, \"add testimonials\" is a new section beside it, said as a guess", d.action === "add" && d.confidence === "guess", d)
  const g = targetGuidance(d, { selectedId: "faq-1" })
  check("the run is told the likeliest reading and that it may correct it", /likeliest reading/.test(g) && !/ask_creator/.test(g), g)
}

section("Settings before code")
{
  const d = resolveTarget(base("make the hero background darker", "hero-1"))
  check("a colour asked for: the section's colour settings are named", (d.settings ?? []).some((s) => /colou?r|scheme|background/i.test(s)), d.settings)
  const g = targetGuidance(d, {})
  check("and the run is told to change those first", /SETTINGS BEFORE CODE/.test(g), g)
}

section("A large file is edited, never rewritten whole")
{
  const d = resolveTarget(base("make the cards slide in", "proof-1"))
  const g = targetGuidance(d, { fileSize: () => 34_000 })
  check("the run is told the file's size and to use edit_section_code", /34,000 characters/.test(g) && /edit_section_code/.test(g), g)
}

section("The cheap model is asked only for a guess, and a fake one settles it")
{
  let asked = 0
  const fake = async (_p: string, ctx: { sections: { id: string }[] }) => {
    asked++
    return { action: "edit" as const, ids: [ctx.sections.find((s) => s.id === "news-1")!.id] }
  }
  const sure = await decideTarget(base("make the hero darker"), fake)
  check("a reading the rules are sure of is not sent to a model", asked === 0 && sure.sections[0]?.id === "hero-1", { asked, sure })
  const guessed = await decideTarget(base("make the club bit pop more"), fake)
  check("a guess is, and the answer is used", asked === 1 && guessed.via === "model" && guessed.sections[0]?.id === "news-1", guessed)
  const failing = await decideTarget(base("make the club bit pop more"), async () => {
    throw new Error("timeout")
  })
  check("a model that fails leaves the rules' answer", failing.via !== "model", failing)
  check("its answer is read strictly", JSON.stringify(readTargetAnswer("EDIT faq-1", ["faq-1", "hero-1"])) === JSON.stringify({ action: "edit", ids: ["faq-1"] }) && readTargetAnswer("EDIT nothing", ["faq-1"]) === null && readTargetAnswer("ADD", [])?.action === "add")
  check("its prompt lists the page by id", /id=faq-1/.test(targetClassifierPrompt("x", [{ id: "faq-1", name: "FAQ", type: "faq_accordion" }])))
}

section("Words are read without accents or case")
check("normalised", normalizeWords("Añade una SECCIÓN, ¿vale?") === " anade una seccion vale ")

section("The reply's first line, from what the run did")
{
  const name = (s: TargetPageSection) => s.label || s.name || s.type
  const after = [...PAGE.slice(0, 2), { id: "new-1", type: "proof_testimonials", name: "Testimonials" }, ...PAGE.slice(2)]
  check("an add after the hero", changeHeadline({ before: PAGE, after, added: ["new-1"], touched: ["new-1"], removed: [], name }) === "Added: Testimonials, after Centered Hero")
  check("an edit", changeHeadline({ before: PAGE, after: PAGE, added: [], touched: ["hero-1"], removed: [], name }) === "Edited: Centered Hero")
  check("a removal", changeHeadline({ before: PAGE, after: PAGE.filter((s) => s.id !== "faq-1"), added: [], touched: [], removed: ["faq-1"], name }) === "Removed: Accordion FAQ")
  const guess = resolveTarget(base("add a button"))
  check("a guess says so, with Undo", /best reading.*Undo/.test(changeHeadline({ before: PAGE, after: PAGE, added: [], touched: ["hero-1"], removed: [], name, decision: guess })))
  check("nothing changed, no line", changeHeadline({ before: PAGE, after: PAGE, added: [], touched: [], removed: [], name }) === "")
}

section("In a run: the target reaches the first message, and the headline comes back")
{
  const state = {
    sections: PAGE.filter((s) => s.type !== "header" && s.type !== "footer").map((s) => ({ id: s.id, type: s.type, name: s.name ?? "", settings: s.settings ?? {}, blocks: [] })) as never,
    settings: {},
  }
  const target = resolveTarget(base("make the newsletter heading say Join us"))
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  const loop = themeAgent({
    provider: scripted([{ calls: [["update_section", { id: "news-1", settingsJson: JSON.stringify({ heading: "Join us" }) }]] }, { text: "Changed the heading." }], sent),
    model: "test",
    prompt: "make the newsletter heading say Join us",
    page: "home",
    addable: ADDABLE_SECTIONS,
    state,
    target,
  })
  let step = await loop.next()
  while (!step.done) {
    events.push(step.value as ThemeAgentEvent)
    step = await loop.next()
  }
  const first = String((sent[0]?.turns[0] as { content?: string } | undefined)?.content ?? "")
  check("the first message names the target", /TARGET, decided from the request: edit Newsletter Signup \[news-1\]/.test(first), first.slice(0, 400))
  check("and carries the section, read for it", /Newsletter Signup \[news-1\], read for you/.test(first))
  check("the run ends with the headline", step.value.headline === "Edited: Newsletter Signup", { headline: step.value.headline, status: step.value.status, ops: step.value.ops, err: step.value.error })
  const route = readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8")
  check("the route decides the target before the run and passes it in", /decideTarget\(/.test(route) && /target,/.test(route))
  check("and puts the headline first in the reply", /result\.headline/.test(route))
}

section("Nothing selected, a change to a section's code: its file goes with the request")
{
  const faq = readFileSync(join(process.cwd(), "themes/default/sections/faq_accordion.storelib"), "utf8").replace(/"type": "faq_accordion"/, '"type": "faq_mine"')
  const files: Record<string, string> = { "sections/faq_mine.storelib": faq }
  const state = {
    sections: [
      { id: "hero-1", type: "hero_centered", name: "Hero", settings: {}, blocks: [] },
      { id: "faq-1", type: "faq_mine", name: "FAQ", settings: {}, blocks: [] },
    ] as never,
    settings: {},
  }
  const prompt = "make the faq answers slide open with an animation"
  const target = resolveTarget({ prompt, sections: state.sections, addable, schema })
  const sent: ProviderRequest[] = []
  const loop = themeAgent({
    provider: scripted([{ text: "Done." }], sent),
    model: "test",
    prompt,
    page: "home",
    addable: ADDABLE_SECTIONS,
    state,
    sources: files,
    code: { read: (t: string) => files[`sections/${t}.storelib`] ?? null, origin: (t: string) => (files[`sections/${t}.storelib`] ? "own" : "product"), write: async () => ({ ok: true as const }) },
    intent: classifyIntent(prompt, { selected: false, bodySections: 2 }),
    target,
  })
  let step = await loop.next()
  while (!step.done) step = await loop.next()
  const first = String((sent[0]?.turns[0] as { content?: string } | undefined)?.content ?? "")
  check("the target is the FAQ", target.action === "edit" && target.sections[0]?.id === "faq-1", target)
  check("and its whole file is in the first message, so the first turn can edit it", /THE TARGET SECTION'S FILE, the whole of sections\/faq_mine\.storelib/.test(first), first.slice(0, 200))
}

}

main().then(() => {
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailed:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
})
