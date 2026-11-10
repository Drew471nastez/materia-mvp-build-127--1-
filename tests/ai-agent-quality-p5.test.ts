/**
 * ===========================================================================
 *  ROUND P (P5): THE WEBSITE AGENT'S OWN QUALITY
 * ===========================================================================
 *   1. Blocks: a placement that sends no blocks gets its schema's preset items
 *      (fresh ids, the preset's words); blocks the agent sends are kept; a
 *      section whose item types have no filled preset is refused at write;
 *      finish refuses too few items, placeholder items and copies (min_blocks,
 *      3 for a repeating list, fewer when the store's real data has fewer).
 *   2. Template first, with a scripted model and a stub template: applied in
 *      the brief phase, its block and one or two of its components in the
 *      first turn (few-shot), finish refuses untouched copy (and imagery when
 *      pictures can be made), adapting it clears the refusal.
 *   3. Pictures: an empty image slot is an error when pictures can be made, a
 *      text-forward warning when not; an empty frame drawn to visitors is
 *      refused (render.empty_media made an error on a new site); the critic
 *      flags empty slots, empty item lists, empty sections and empty <img> as
 *      hard gates.
 *   4. Models: plan on plan, build on write (opus high), repair on loop; the
 *      typical site's cost estimate fits the raised cap.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-agent-quality-p5.test.ts
 */
import { readFileSync } from "node:fs"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { newCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"
import { blockIssues, blockRules, emptyImageSlots, imageSlotIssues, isPlaceholderText, presetBlockIssues, rawSchemaOf } from "@/lib/ai-builder/agent/content-check"
import { runAgentSlice, verify, picturesAvailable } from "@/lib/ai-builder/agent/loop"
import { AGENT_SYSTEM, COMPLETE_SECTIONS, TEMPLATE_FIRST } from "@/lib/ai-builder/agent/prompts"
import { defaultTemplates, fewShotExamples, templateSlotSkip } from "@/lib/ai-builder/agent/templates"
import { estimateSiteUsd, roleFor } from "@/lib/ai-builder/agent/model-routing"
import { worstCaseUsd } from "@/lib/ai-builder/agent/loop"
import { emptyMediaFrame, renderCheck } from "@/lib/ai-builder/render-check"
import { manifestToSchema, schemaToManifest } from "@/lib/ai-builder/manifest"
import { measuredDefects, type Measurements } from "@/lib/ai-builder/visual-critic/measure"
import { structuralDefects } from "@/lib/ai-builder/visual-critic/critic"
import { chooseTemplate, untouchedTemplateParts, type SiteTemplate } from "@/lib/storelib-ai/templates"
import { briefFrom } from "@/lib/storelib-ai/direction/brief"
import type { AgentDeps, AgentJobInput, AgentModels, TemplateLibrary } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest } from "@/lib/sites/agent/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { ComponentManifest } from "@/lib/ai-builder/types"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { DEFAULT_JOB_BUDGET, type AgentEvent } from "@/lib/ai-builder/types"
import { CAPS, CONCEPT, FOOTER, HEADER, scripted, type Step } from "./ai-builder-agent-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail)?.slice(0, 1500)}`}`)
  }
}

const JOB_ID = "55555555-2222-3333-4444-555555555555"
const T0 = Date.UTC(2026, 10, 10, 12, 0, 0)
const job = (over: Partial<AgentJobInput> = {}): AgentJobInput => ({ jobId: JOB_ID, creatorId: "creator-a", installId: "install-a", prompt: "A website for my strength coaching: small group classes and an 8 week program.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget: { ...DEFAULT_JOB_BUDGET }, startedAt: T0, spentUsd: 0, lastEventSeq: 0, ...over })

const SCHEME = `{ "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "site" }`

/** A FAQ: a repeating list. `presets` is the schema's presets JSON (or none). */
function faq(presets: string | null, extraBlock = ""): string {
  return `<template>
<section class="fq" data-scheme="{{ settings.color_scheme }}">
  <h2 class="fq__h">{{ settings.heading }}</h2>
  {% for block in section.blocks %}<details class="fq__item" {{ block.shopify_attributes }}><summary>{{ block.settings.question }}</summary><div class="fq__a">{{ block.settings.answer }}</div></details>{% endfor %}
</section>
</template>

<style scoped>
.fq { padding: 64px var(--theme-padding-x, 24px); background: var(--s-bg, {{ scheme.bg }}); color: var(--s-text, {{ scheme.text }}); }
.fq__h { margin: 0 0 20px; font-size: clamp(28px, 4vw, 44px); }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_questions",
  "name": "Questions",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Questions people ask" },
    ${SCHEME}
  ],
  "blocks": [
    { "type": "question", "name": "Question", "settings": [
      { "type": "text", "id": "question", "label": "Question", "default": "Do I need to be fit already?" },
      { "type": "textarea", "id": "answer", "label": "Answer", "default": "No. Every plan starts from where you are today." }
    ] }${extraBlock}
  ]${presets ? `,\n  "presets": ${presets}` : ""}
}
</schema>
`
}

const FILLED = JSON.stringify([
  {
    name: "Questions",
    blocks: [
      { type: "question", settings: { question: "Do I need to be fit already?", answer: "No. Every plan starts from where you are today." } },
      { type: "question", settings: { question: "How big are the groups?", answer: "Six people at most, so the coach sees every lift." } },
      { type: "question", settings: { question: "What do I bring?", answer: "Flat shoes, water and a notebook for your numbers." } },
    ],
  },
])
const PLACEHOLDERS = JSON.stringify([{ name: "Questions", blocks: [{ type: "question", settings: { question: "Question 1", answer: "Answer" } }, { type: "question", settings: { question: "Question 2", answer: "Answer" } }, { type: "question", settings: { question: "Question 3", answer: "Answer" } }] }])

/** A hero with a picture slot and a toggle; draws the frame only when a picture is set unless `frameAlways`. */
function hero(frameAlways = false): string {
  const img = frameAlways ? `<div class="hp__photo"></div>` : `{% if settings.photo %}<img class="hp__img" src="{{ settings.photo | asset }}" alt="{{ settings.photo_alt }}">{% endif %}`
  return `<template>
<section class="hp" data-scheme="{{ settings.color_scheme }}">
  <h1 class="hp__h">{{ settings.heading }}</h1>
  {% if settings.show_photo %}${img}{% endif %}
  <a class="hp__cta" href="{{ settings.cta_url | url }}">{{ settings.cta_label }}</a>
</section>
</template>

<style scoped>
.hp { padding: 80px var(--theme-padding-x, 24px); background: var(--s-bg, {{ scheme.bg }}); color: var(--s-text, {{ scheme.text }}); }
.hp__h { font-size: clamp(40px, 8vw, 96px); margin: 0; }
.hp__photo { aspect-ratio: 4 / 5; background: var(--s-border, {{ scheme.border }}); }
</style>

<schema>
{
  "schema_version": 1,
  "type": "ai_coach_opening",
  "name": "Opening",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Lift with a plan" },
    { "type": "checkbox", "id": "show_photo", "label": "Show photo", "default": true },
    { "type": "image_picker", "id": "photo", "label": "Photo" },
    { "type": "text", "id": "photo_alt", "label": "Photo description", "default": "A coach spotting a deadlift" },
    { "type": "text", "id": "cta_label", "label": "Button", "default": "See the programs" },
    { "type": "url", "id": "cta_url", "label": "Button link", "default": "/products/8-week-strength-block" },
    ${SCHEME}
  ]
}
</schema>
`
}

const TOOL_CTX = (store: ReturnType<typeof memoryStore>, cp: LoopCheckpoint, deps: Partial<AgentDeps> = {}) => {
  const events: unknown[] = []
  const d: AgentDeps = { store, models: {} as AgentModels, capabilities: async () => CAPS, ...deps }
  return { tools: createToolSet({ job: job(), deps: d, cp, emit: (e) => void events.push(e), onFinish: async () => ({ ok: true }), setPhase: () => undefined }), events }
}
const readyCheckpoint = (): LoopCheckpoint => ({ ...newCheckpoint(), concept: CONCEPT as never, sitePlan: { pages: [] } as never })

async function main() {
  console.log("\n1. Blocks: presets, the write gate, the finish gate")
  {
    const noPreset = presetBlockIssues("sections/ai_coach_questions.storelib", faq(null))
    check("a repeating list with no filled preset items is refused at write (manifest.preset_blocks)", noPreset.some((i) => i.code === "manifest.preset_blocks" && /at least 3/.test(i.message)), noPreset)
    check("  three filled preset items pass", presetBlockIssues("sections/ai_coach_questions.storelib", faq(FILLED)).length === 0, presetBlockIssues("sections/ai_coach_questions.storelib", faq(FILLED)))
    check("  three placeholder items (\"Question 1\", \"Answer\") are refused", presetBlockIssues("sections/ai_coach_questions.storelib", faq(PLACEHOLDERS)).some((i) => i.code === "manifest.preset_blocks"))
    const optional = faq(FILLED, `,\n    { "type": "note", "name": "Note", "min_blocks": 0, "settings": [{ "type": "text", "id": "text", "label": "Note", "default": "Ask us anything at the front desk." }] }`)
    check("  an item type with min_blocks 0 is optional", presetBlockIssues("sections/ai_coach_questions.storelib", optional).length === 0, presetBlockIssues("sections/ai_coach_questions.storelib", optional))
    const single = faq(FILLED, `,\n    { "type": "badge", "name": "Badge", "settings": [{ "type": "text", "id": "text", "label": "Badge", "default": "New" }] }`)
    check("  any other declared item type needs at least one item", presetBlockIssues("sections/ai_coach_questions.storelib", single).some((i) => /badge/.test(i.message) && /at least 1/.test(i.message)))

    const schema = rawSchemaOf(faq(FILLED), "sections/ai_coach_questions.storelib")!
    check("blockRules: a FAQ needs 3", blockRules(schema, CAPS)[0]?.min === 3, blockRules(schema, CAPS))
    const plans = { ...schema, type: "ai_plans", name: "Plans", blocks: [{ type: "plan", name: "Plan", settings: [{ id: "product", type: "product_picker", label: "Plan" }] }] }
    check("  a list bound to products needs no more than the store has (1)", blockRules(plans as never, CAPS)[0]?.min === 1, blockRules(plans as never, CAPS))
    const quotes = { ...schema, type: "ai_quotes", name: "Kind words", blocks: [{ type: "testimonial", name: "Testimonial", settings: [{ id: "quote", type: "textarea", label: "Quote" }] }] }
    const header = { ...schema, kind: "header", name: "Site header", blocks: [{ type: "feature", name: "Featured card", settings: [{ id: "title", type: "text", label: "Title" }] }] }
    check("  a header's or footer's items are navigation: one is enough (not a repeating list)", blockRules(header as never, CAPS)[0]?.min === 1)
    check("  testimonials need none when the store has no reviews (never invented)", blockRules(quotes as never, CAPS)[0]?.min === 0)
    check("isPlaceholderText: generic and instruction words", isPlaceholderText("Item 2") && isPlaceholderText("Write your answer here") && isPlaceholderText("") && !isPlaceholderText("Six people at most"))

    /* Andrew's case: "Who it is for and not for" with one block. */
    const sources = { "sections/ai_coach_questions.storelib": faq(FILLED) }
    const section = (blocks: { type: string; settings: Record<string, unknown> }[]) => [{ key: "home", sections: [{ id: "q1", type: "ai_coach_questions", settings: {}, blocks: blocks.map((b, i) => ({ id: `b${i}`, ...b })) }] }]
    const one = blockIssues({ pages: section([{ type: "question", settings: { question: "Who is it for?", answer: "People who want a plan." } }]), sources, caps: CAPS })
    check("finish: one item of a repeating list is blocks.too_few", one.length === 1 && one[0].code === "blocks.too_few" && one[0].sectionId === "q1", one)
    const ph = blockIssues({ pages: section([1, 2, 3].map((n) => ({ type: "question", settings: { question: `Question ${n}`, answer: "Answer" } }))), sources, caps: CAPS })
    check("  three placeholder items are blocks.placeholder", ph.length === 1 && ph[0].code === "blocks.placeholder", ph)
    const copies = blockIssues({ pages: section([1, 2, 3].map(() => ({ type: "question", settings: { question: "How big are the groups?", answer: "Six." } }))), sources, caps: CAPS })
    check("  three copies of one item count once", copies.length === 1 && copies[0].code === "blocks.placeholder", copies)
    const defaults = blockIssues({ pages: section([{ type: "question", settings: {} }, { type: "question", settings: { question: "How big are the groups?" } }, { type: "question", settings: { question: "What do I bring?" } }]), sources, caps: CAPS })
    check("  an item with no settings reads its schema defaults (real words count)", defaults.length === 0, defaults)

    /* The tools. */
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const cp = readyCheckpoint()
    const { tools } = TOOL_CTX(store, cp)
    const refused = await tools.write_file({ path: "sections/ai_coach_questions.storelib", content: faq(null) })
    check("write_file refuses a FAQ with no filled preset items", refused.ok === false && JSON.stringify(refused).includes("manifest.preset_blocks"), refused)
    const wrote = await tools.write_file({ path: "sections/ai_coach_questions.storelib", content: faq(FILLED) })
    check("  and saves it with three", wrote.ok === true, wrote)
    const placed = await tools.set_page_sections({ page: "home", sections: [{ type: "ai_coach_questions" }, { type: "ai_coach_questions", blocks: [{ type: "question", settings: { question: "Is there parking?", answer: "Yes, behind the gym." } }] }] })
    const home = (await store.listPages()).find((p) => p.key === "home")!.sections
    check("set_page_sections with no blocks copies the preset's three items", placed.ok === true && home[0].blocks?.length === 3 && (home[0].blocks ?? []).map((b) => b.settings.question).join("|") === "Do I need to be fit already?|How big are the groups?|What do I bring?", { placed, blocks: home[0]?.blocks })
    check("  with ids of their own (not the preset's), different per block", new Set((home[0].blocks ?? []).map((b) => b.id)).size === 3 && (home[0].blocks ?? []).every((b) => b.id.includes(JOB_ID.replace(/-/g, "").slice(0, 8))), (home[0].blocks ?? []).map((b) => b.id))
    check("  the agent is told it was placed with the preset's items", JSON.stringify(placed).includes("blocks.from_preset"))
    check("  blocks the agent sends are kept as sent", home[1].blocks?.length === 1 && home[1].blocks?.[0]?.settings.question === "Is there parking?")
    const fin = blockIssues({ pages: await store.listPages(), sources: Object.fromEntries((await store.listFiles()).map((f) => [f.path, f.text])), caps: CAPS })
    check("  and finish counts that one-item placement as too few", fin.length === 1 && fin[0].code === "blocks.too_few" && fin[0].sectionId === home[1].id, fin)

    /* A manifest's preset and min are written into the schema and read back. */
    const manifest: ComponentManifest = { type: "ai_coach_questions", name: "Questions", runtime: "storelib", props: [{ kind: "text", id: "heading", label: "Heading", default: "Questions people ask" }, { kind: "color_scheme", id: "color_scheme", label: "Colour scheme", default: "site" }], items: [{ type: "question", name: "Question", min: 3, props: [{ kind: "text", id: "question", label: "Question", default: "Do I need to be fit already?" }, { kind: "textarea", id: "answer", label: "Answer", default: "No. Every plan starts from where you are today." }] }], preset: { blocks: [{ type: "question", settings: { question: "A" } }] }, placement: { groups: ["body"] }, capabilities: [] }
    const sch = manifestToSchema(manifest) as { presets?: { blocks: unknown[] }[]; blocks: { min_blocks?: number }[] }
    const back = schemaToManifest(sch as never)?.manifest
    check("a manifest's preset and min become presets and min_blocks, and read back", sch.presets?.[0]?.blocks.length === 1 && sch.blocks[0].min_blocks === 3 && back?.preset?.blocks.length === 1 && back?.items?.[0]?.min === 3, { sch, back })
    const viaManifest = await tools.write_file({ path: "sections/ai_coach_questions.storelib", content: (await store.readFile("sections/ai_coach_questions.storelib"))!.text, manifest: { ...manifest, preset: undefined } })
    await tools.read_file({ path: "sections/ai_coach_questions.storelib" })
    const after = (await store.readFile("sections/ai_coach_questions.storelib"))!.text
    check("  write_file with a manifest keeps the file's own presets (merged, not replaced)", viaManifest.ok === true && /"presets"/.test(after) && /How big are the groups\?/.test(after), viaManifest)
  }

  console.log("\n2. Pictures: slots, text-forward, empty frames")
  {
    const sources = { "sections/ai_coach_opening.storelib": hero() }
    const pages = [{ key: "home", sections: [{ id: "h1", type: "ai_coach_opening", settings: {}, blocks: [] }] }]
    const slots = emptyImageSlots({ pages, sources })
    check("an empty image setting is a slot", slots.length === 1 && slots[0].setting === "photo", slots)
    check("  switched off with its toggle it is not", emptyImageSlots({ pages: [{ key: "home", sections: [{ ...pages[0].sections[0], settings: { show_photo: false } }] }], sources }).length === 0)
    check("  filled it is not", emptyImageSlots({ pages: [{ key: "home", sections: [{ ...pages[0].sections[0], settings: { photo: "storelib://media/abc.jpg" } }] }], sources }).length === 0)
    const withProvider = imageSlotIssues({ pages, sources, picturesAvailable: true })
    const without = imageSlotIssues({ pages, sources, picturesAvailable: false })
    check("with a picture source an empty slot is an error (image.slot_empty)", withProvider.length === 1 && withProvider[0].severity === "error" && withProvider[0].code === "image.slot_empty" && /generate_image/.test(withProvider[0].message), withProvider)
    check("  without one it is a text-forward warning, never an error", without.length === 1 && without[0].severity === "warning" && without[0].code === "image.text_forward" && /text-forward/.test(without[0].message), without)
    check("picturesAvailable: absent, false, throwing all read as none", (await picturesAvailable({})) === false && (await picturesAvailable({ imageProvider: () => false })) === false && (await picturesAvailable({ imageProvider: () => { throw new Error("x") } })) === false && (await picturesAvailable({ imageProvider: async () => true })) === true)
    check("  P1's image service counts: a generation provider or stock search", (await picturesAvailable({ images: { available: async () => ({ generate: "openai", stock: false }) } } as never)) === true && (await picturesAvailable({ images: { available: async () => ({ generate: null, stock: true }) } } as never)) === true && (await picturesAvailable({ images: { available: async () => ({ generate: null, stock: false }) } } as never)) === false)

    check("emptyMediaFrame: an <img> with no address", emptyMediaFrame(`<img class="a" src="" alt="">`) !== null)
    check("  an empty frame named for a picture, drawn as a box (a shape, a fill)", /hp__photo/.test(emptyMediaFrame(`<div class="hp__photo"></div>`, `.hp__photo { aspect-ratio: 4 / 5; background: #ddd; }`) ?? ""))
    check("  an empty wrapper with no box of its own is not a frame (it collapses: a product with no pictures)", emptyMediaFrame(`<div class="pp__media"></div>`, `.pp__media { display: grid; gap: 8px; }`) === null)
    check("  not an overlay, not a hook's template picture, not a class that paints a background", emptyMediaFrame(`<span class="hero__image-overlay"></span><img data-result-image alt=""><div class="cover__media"></div>`, `.cover__media { background-image: url(/x.jpg) }`) === null)

    /* A section drawing an empty frame: the render check says so, and a new site's verify makes it an error. */
    const store = memoryStore({ files: { "sections/ai_coach_opening.storelib": hero(true), "sections/ai_coach_header.storelib": HEADER, "sections/ai_coach_footer.storelib": FOOTER }, pages: { home: [{ id: "h1", name: "Opening", type: "ai_coach_opening", settings: {}, blocks: [] }] }, settings: {} })
    const r = await renderCheck({ page: "home", sections: [{ id: "h1", type: "ai_coach_opening", settings: {}, blocks: [] }], sources: { "sections/ai_coach_opening.storelib": hero(true) }, theme: {} as ThemeSettingsValues, template: "index" } as never)
    check("render check: an empty picture frame is render.empty_media", r.issues.some((i) => i.code === "render.empty_media" && i.sectionId === "h1"), r.issues.map((i) => i.code))
    const cp = { ...readyCheckpoint(), filesTouched: ["sections/ai_coach_opening.storelib"], pagesTouched: ["home"], caps: CAPS }
    const deps: AgentDeps = { store, models: {} as AgentModels, capabilities: async () => CAPS }
    const issues = await verify(job(), deps, cp)
    check("  a new website's verify refuses it (error)", issues.some((i) => i.code === "render.empty_media" && i.severity === "error"), issues.filter((i) => i.code.startsWith("render.")))
    check("  and, with no picture source, says text-forward for the slot", issues.some((i) => i.code === "image.text_forward"))
    const withPics = await verify(job(), { ...deps, imageProvider: () => true }, cp)
    check("  with a picture source, the empty slot itself blocks finish", withPics.some((i) => i.code === "image.slot_empty" && i.severity === "error"))
    const viaP1 = await verify(job(), { ...deps, images: { available: async () => ({ generate: "openai", stock: false }) } as never }, cp)
    check("  P1's image service with a generator is a picture source: the slot is enforced", viaP1.some((i) => i.code === "image.slot_empty" && i.severity === "error"))
    const edit = await verify(job({ edit: true }), deps, { ...cp, filesTouched: [], pagesTouched: [] })
    check("  an edit job answers only for what it touched", !edit.some((i) => i.code === "render.empty_media" || i.code.startsWith("image.") || i.code.startsWith("blocks.")), edit.map((i) => i.code))
  }

  console.log("\n3. Template first, with a scripted model and P2a's real templates")
  {
    const brief = briefFrom(job().prompt, { category: "fitness_coach" })
    const pick = chooseTemplate(brief)
    check("chooseTemplate picks a fitness template for a strength coach", !!pick.template && pick.template.industries[0] === "fitness", { id: pick.template?.id, score: pick.score })
    const TEMPLATE = pick.template as SiteTemplate
    const examples = fewShotExamples(TEMPLATE)
    check("few-shot: one or two of its components, compact", examples.length === 2 && examples.every((e) => e.path.startsWith("sections/") && e.text.length <= 5_100) && examples[0].path !== examples[1].path, examples.map((e) => [e.path, e.text.length]))

    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const plan = scripted([{ calls: [["list_pages", {}]] }], { id: "plan" })
    /* No `templates` given: the default library (P2a's module) through the agent's one adapter. */
    const deps: AgentDeps = { store, models: { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: plan, model: "claude-sonnet-5-5" }, small: { provider: plan, model: "claude-haiku-5-5" }, ownKey: false }, capabilities: async () => CAPS, now: (() => { let t = T0; return () => (t += 1_000) })() }
    const r = await runAgentSlice(job(), null, deps, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
    const first = String((plan.requests[0]?.turns[0] as { text?: string; content?: string })?.text ?? (plan.requests[0]?.turns[0] as { content?: string })?.content ?? "")
    const files = Object.keys(TEMPLATE.files)
    check("the brief phase applies the chosen template: its files and home are in the store", files.every((f) => store.project.files[f] === TEMPLATE.files[f]) && (store.project.pages.home ?? []).length === TEMPLATE.pages.find((p) => p.key === "home")!.sections.length, { want: files.length, have: Object.keys(store.project.files).length })
    check("  the checkpoint knows it, and its files and pages are the job's", r.checkpoint.template?.id === TEMPLATE.id && files.every((f) => r.checkpoint.filesTouched.includes(f)) && r.checkpoint.pagesTouched.includes("home"), r.checkpoint.template)
    check("  the progress says it, plainly", r.events.some((e: AgentEvent) => e.kind === "note" && (e as { text: string }).text.includes(`${TEMPLATE.name} template`)))
    check("  the first turn carries TEMPLATE_FIRST, the adaptation notes, the slots and the few-shot components", first.includes(TEMPLATE_FIRST.slice(0, 40)) && first.includes(`STARTING TEMPLATE: "${TEMPLATE.name}"`) && first.includes(TEMPLATE.imageSlots[0].key) && first.includes(`--- ${examples[0].path} ---`), first.slice(0, 400))
    check("  the shared prefix does not change per job (TEMPLATE_FIRST is not in it, COMPLETE_SECTIONS is)", !AGENT_SYSTEM.includes(TEMPLATE_FIRST.slice(0, 40)) && AGENT_SYSTEM.includes(COMPLETE_SECTIONS))
    check("  its sections arrive complete: no placed section of the template is short of items", blockIssues({ pages: await store.listPages(), sources: store.project.files, caps: CAPS }).length === 0, blockIssues({ pages: await store.listPages(), sources: store.project.files, caps: CAPS }).slice(0, 3))

    const cp = { ...r.checkpoint, concept: CONCEPT as never }
    const before = await verify(job(), deps, cp)
    const copy = before.find((i) => i.code === "template.untouched_copy")
    check("finish refuses the template as shipped: untouched copy, named", copy?.severity === "error" && copy.message.includes(files[0]), copy?.message.slice(0, 300))
    const img = before.find((i) => i.code === "template.untouched_image")
    check("  its empty picture slots are a warning when no picture can be made (text-forward)", img?.severity === "warning" && img.message.includes(TEMPLATE.imageSlots[0].key), img)
    const withPics = await verify(job(), { ...deps, imageProvider: () => true }, cp)
    check("  and an error when one can", withPics.find((i) => i.code === "template.untouched_image")?.severity === "error")

    /* The agent adapts it: every file rewritten for this business, every picture slot filled. */
    for (const f of files) store.project.files[f] = TEMPLATE.files[f].replace(/<\/template>/, "<!-- Iron & Chalk -->\n</template>")
    for (const slot of TEMPLATE.imageSlots)
      for (const t of slot.targets) {
        const section = store.project.pages[t.page]?.find((x) => x.id === t.section)
        const holder = t.block ? section?.blocks?.find((b) => b.id === t.block) : section
        if (holder) holder.settings = { ...holder.settings, [t.setting]: `storelib://media/${slot.key}.jpg` }
      }
    const all = emptyImageSlots({ pages: TEMPLATE.pages, sources: TEMPLATE.files })
    const enforced = emptyImageSlots({ pages: TEMPLATE.pages, sources: TEMPLATE.files, skip: templateSlotSkip(TEMPLATE) })
    const targets = TEMPLATE.imageSlots.reduce((n, sl) => n + sl.targets.length, 0)
    check("on a template's own sections only its declared picture slots are enforced (not a per-step extra, a header card or a phone crop)", enforced.length <= targets && enforced.length < all.length + 1 && enforced.every((e) => !/mobile/.test(e.setting)) && TEMPLATE.imageSlots.length <= DEFAULT_JOB_BUDGET.maxImages!, { all: all.length, enforced: enforced.length, targets, slots: TEMPLATE.imageSlots.length })
    const left = untouchedTemplateParts(TEMPLATE, { files: store.project.files, pages: await store.listPages() })
    const after = await verify(job(), { ...deps, imageProvider: () => true }, cp)
    check("adapted: nothing untouched, finish no longer refuses for the template", left.files.length === 0 && left.sections.length === 0 && left.emptyImageSlots.length === 0 && !after.some((i) => i.code.startsWith("template.")), { left: { f: left.files.length, s: left.sections.length, i: left.emptyImageSlots }, codes: after.filter((i) => i.code.startsWith("template.")) })

    const none: TemplateLibrary = { ...defaultTemplates, choose: () => null }
    const scratch = memoryStore({ pages: { home: [] } })
    const r2 = await runAgentSlice(job(), null, { ...deps, store: scratch, templates: none, models: { ...deps.models, plan: { provider: scripted([{ calls: [["list_pages", {}]] }]), model: "claude-opus-5-5" } } }, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
    check("no close template: the job builds from zero, nothing written, nothing claimed", !r2.checkpoint.template && Object.keys(scratch.project.files).length === 0 && !r2.events.some((e) => e.kind === "note" && /template/.test((e as { text: string }).text)))
    const editJob = await runAgentSlice(job({ edit: true, jobId: "66666666-2222-3333-4444-555555555555" }), null, { ...deps, store: memoryStore({ pages: { home: [] } }), models: { ...deps.models, plan: { provider: scripted([{ calls: [["list_pages", {}]] }]), model: "claude-opus-5-5" }, loop: { provider: scripted([{ calls: [["list_pages", {}]] }]), model: "claude-sonnet-5-5" } } }, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
    check("an edit job never applies a template", !editJob.checkpoint.template)
  }

  console.log("\n4. The critic: empty slots, empty item lists, empty sections and empty <img> are hard gates")
  {
    const sources = { "sections/ai_coach_questions.storelib": faq(FILLED), "sections/ai_coach_opening.storelib": hero() }
    const project = { pages: [{ key: "home", sections: [{ id: "h1", type: "ai_coach_opening", settings: {}, blocks: [] }, { id: "q1", type: "ai_coach_questions", settings: {}, blocks: [{ id: "b1", type: "question", settings: {} }] }] }], settings: {}, sources, capabilities: CAPS as RuntimeCapabilities }
    const d = structuralDefects({ project: project as never, picturesAvailable: true }, ["home"])
    check("one item in a FAQ: an empty-blocks gate on its section", d.some((x) => x.kind === "empty-blocks" && x.gate && x.sectionId === "q1" && x.sectionType === "ai_coach_questions"), d)
    check("  an empty picture slot: an image-slot-empty gate (pictures can be made)", d.some((x) => x.kind === "image-slot-empty" && x.gate && x.sectionId === "h1"))
    check("  no picture source: the slot is not a gate (text-forward instead)", !structuralDefects({ project: project as never, picturesAvailable: false }, ["home"]).some((x) => x.kind === "image-slot-empty"))
    const base: Measurements = { viewport: "mobile", width: 390, foldHeight: 844, scrollOverflow: 0, widest: null, headings: [], smallTargets: [], contrast: [], brokenImages: [], missingImages: [{ sectionId: "h1", sectionType: "ai_coach_opening", selector: "img.hp__img" }], foldCtas: [{ sectionId: "h1", sectionType: "ai_coach_opening", selector: "a.hp__cta", href: "/x", tag: "a", hooked: false }], placeholders: [], emptySections: [{ sectionId: "q2", sectionType: "ai_list", selector: "section.l" }], pageHeight: 2000 }
    const m = measuredDefects("home", base)
    check("measured: an <img> with no address is a gate now", m.some((x) => x.kind === "image-missing" && x.gate))
    check("  a drawn section with nothing in it is an empty-section gate", m.some((x) => x.kind === "empty-section" && x.gate && x.sectionId === "q2"))
    const critic = readFileSync("lib/ai-builder/visual-critic/critic.ts", "utf8")
    check("  the critic puts the structural facts first, with the browser's", /structuralDefects\(req, docs\.map/.test(critic))
    const loopSrc = readFileSync("lib/ai-builder/agent/loop.ts", "utf8")
    check("  the loop tells the critic whether pictures can be made", /picturesAvailable: await picturesAvailable\(deps\)/.test(loopSrc))
  }

  console.log("\n5. Models by phase, and the money")
  {
    const p = (id: string) => ({ provider: scripted([], { id }), model: id })
    const models: AgentModels = { plan: p("claude-opus-5-5"), loop: p("claude-sonnet-5-5"), small: p("claude-haiku-5-5"), write: { ...p("claude-opus-5-5"), effort: "high" }, ownKey: false }
    check("plan → plan, build → write (opus, high), verify/repair → loop", roleFor("plan", models) === models.plan && roleFor("build", models) === models.write && roleFor("build", models).effort === "high" && roleFor("repair", models) === models.loop && roleFor("verify", models) === models.loop)
    check("  no write role (a scripted run): the build runs on loop", roleFor("build", { ...models, write: undefined }) === models.loop)
    const server = readFileSync("lib/ai-builder/agent/server.ts", "utf8")
    check("  the real models: write is the strong model at effort high on the plan key", /write: \{ provider: plan\.provider, model: plan\.model, effort: "high" \}/.test(server))

    /* A scripted job: the plan turn on plan, the build turns on write, the repair turns on loop. */
    const asked: string[] = []
    const prov = (id: string, steps: Step[]) => {
      const s = scripted(steps, { id })
      return { ...s, id, async complete(req: ProviderRequest) { asked.push(id); return s.complete(req) } }
    }
    const store = memoryStore({ pages: { home: [] }, settings: {} })
    const { sitePlan } = await import("./ai-builder-whole-site-fixtures")
    const planP = prov("plan", [{ calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT }], ["report_progress", { phase: "plan", label: "Plan", pages: sitePlan([]) }]] }])
    const writeP = prov("write", [{ calls: [["write_file", { path: "sections/ai_coach_questions.storelib", content: faq(FILLED) }]] }, { calls: [["finish", { summary: "Done." }]] }])
    const loopP = prov("loop", [{ calls: [["list_pages", {}]] }])
    const deps: AgentDeps = { store, models: { plan: { provider: planP, model: "claude-opus-5-5", effort: "medium" }, write: { provider: writeP, model: "claude-opus-5-5", effort: "high" }, loop: { provider: loopP, model: "claude-sonnet-5-5", effort: "medium" }, small: { provider: loopP, model: "claude-haiku-5-5" }, ownKey: false }, capabilities: async () => CAPS, now: (() => { let t = T0; return () => (t += 1_000) })() }
    await runAgentSlice(job(), null, deps, { deadline: T0 + 30 * 60_000, maxIterations: 4 })
    check("a job's turns: plan, then write while building, then loop once finish sends it to repair", asked.join(",") === "plan,write,write,loop", asked)
    const efforts = [...planP.requests, ...writeP.requests, ...loopP.requests].map((r) => `${r.model}:${r.effort}`)
    check("  each request carries its role's model and effort", efforts.join(",") === "claude-opus-5-5:medium,claude-opus-5-5:high,claude-opus-5-5:high,claude-sonnet-5-5:medium", efforts)

    const before = estimateSiteUsd({ plan: "claude-opus-5-5", write: "claude-sonnet-5-5", loop: "claude-sonnet-5-5", review: "claude-opus-5-5" })
    const after = estimateSiteUsd({ plan: "claude-opus-5-5", write: "claude-opus-5-5", loop: "claude-sonnet-5-5", review: "claude-opus-5-5" }, { write: "high" })
    console.log(`        typical site: before $${before.total} (${JSON.stringify(before.byPhase)}), after $${after.total} (${JSON.stringify(after.byPhase)})`)
    check("cost: the build on opus high costs more than on sonnet, and the estimate is priced from the same table", after.total > before.total && after.byPhase.build > before.byPhase.build && after.byPhase.plan === before.byPhase.plan)
    check("  the typical site fits the raised cap with room for pictures and repairs ($20; own key $40)", DEFAULT_JOB_BUDGET.maxUsd === 20 && DEFAULT_JOB_BUDGET.maxUsdOwnKey === 40 && after.total < DEFAULT_JOB_BUDGET.maxUsd * 0.75, { after, cap: DEFAULT_JOB_BUDGET.maxUsd })
    check("  one build call's worst case is a small part of the cap", worstCaseUsd("claude-opus-5-5", 400_000, DEFAULT_JOB_BUDGET.maxOutputTokensPerCall) < DEFAULT_JOB_BUDGET.maxUsd / 10)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
