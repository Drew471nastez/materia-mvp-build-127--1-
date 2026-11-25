/**
 * Round 26: the AI website builder builds like Storelib's templates, on the Materia theme.
 *
 *   1. The catalogue is BUILT from the theme's own schemas (theme-packages/materia/base) and the templates, the
 *      generated module is not stale, it is indexed once, and its text fits its budget.
 *   2. The closest template is SELECTED from the creator's words (and the example they picked), and written as a
 *      pattern: page set, section order, settings style, fonts, with AI default faces flagged.
 *   3. Unknown section types are REJECTED (with the closest named) and near misses REPAIRED: the catalogue check,
 *      the site plan's materia:<type> citations, the agent's set_page_sections and the editor's add_section.
 *   4. The PROMPTS carry the rules (Materia first, no AI default fonts, real photographs, no fake metrics, honest
 *      copy, the template briefs) on every path: Start with AI (the agent's first turn, with a scripted model
 *      stub), the classic planner, Ask AI on a Materia site, and MCP's rulebook and component search.
 *
 * No network and no paid model: the agent runs on tests/ai-builder-agent-fixtures.ts `scripted`.
 * Run: scratchpad/rtc.sh tests/ai-materia-catalogue.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildMateriaCatalogue, catalogueModuleText, liquidSchema, parseCommentedJson, purposeOf } from "@/lib/storelib-ai/materia/build"
import { readCatalogueInput } from "@/lib/storelib-ai/materia/read-files"
import {
  catalogueOverview,
  catalogueText,
  checkMateriaSections,
  chooseMateriaTemplate,
  materiaCatalogue,
  materiaSection,
  materiaTemplate,
  MATERIA_BANNED_WORDS,
  MATERIA_EDIT_RULES,
  MATERIA_RULES,
  planCitationIssues,
  plannerReference,
  referenceFocus,
  resolveSectionType,
  sectionDetail,
  templateReferenceText,
} from "@/lib/storelib-ai/materia"
import { CODE_TEMPLATES } from "@/lib/themes/marketplace-shared"
import { AGENT_SYSTEM } from "@/lib/ai-builder/agent/prompts"
import { MATERIA_BRIEF_CHARS, materiaBrief, repairPlanCitations } from "@/lib/ai-builder/agent/materia"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { newCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"
import { NO_TEMPLATES } from "@/lib/ai-builder/agent/templates"
import type { AgentDeps, AgentJobInput, AgentModels } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import { materiaEditContext, repairAddableType, MATERIA_EDIT_CHARS } from "@/lib/website-builder/agent/materia-context"
import { sitePlanTurn } from "@/lib/website-builder/agent/site-plan"
import { EMPTY_CAPABILITIES } from "@/lib/website-builder/ai-site/capabilities"
import { agentRulesText, builderAgentRules } from "@/lib/agent-rules"
import { searchComponents } from "@/lib/agent-access/components"
import { purposeOfType } from "@/lib/storelib-ai/materia/catalogue"
import { CAPS, CONCEPT, HERO, scripted } from "./ai-builder-agent-fixtures"
import JSZip from "jszip"
import { composeTemplateZip } from "@/lib/themes/template-packages"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { completenessIssues } from "@/lib/ai-builder/agent/site-plan"
import { sitePlan } from "./ai-builder-whole-site-fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    if (process.env.VERBOSE) console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1600) : JSON.stringify(detail).slice(0, 1600)}`}`)
  }
}

const T0 = Date.UTC(2026, 10, 25, 12, 0, 0)
const job = (over: Partial<AgentJobInput> = {}): AgentJobInput => ({
  jobId: "26262626-1111-2222-3333-444444444444",
  creatorId: "creator-a",
  installId: "install-a",
  prompt: "A website for my personal training business with my programs, client results, prices and a way to book a free first call.",
  mode: "blank",
  options: { generation: "blank", category: "fitness_coach" },
  budget: { ...DEFAULT_JOB_BUDGET },
  startedAt: T0,
  spentUsd: 0,
  lastEventSeq: 0,
  ...over,
})
const EM_DASH = String.fromCharCode(0x2014)

/** Twelve-plus Materia sections as an imported template stores them: compat source, the real type names. */
function materiaFiles(): Record<string, string> {
  const types = ["hero-image1", "Image-and-video-text", "marquee-bar", "products-listing", "image-with-text-multirow", "steps", "testimonials", "gallery-grid1", "faq-side-image", "banner3", "text-columns", "newsletter", "faq-tabs", "pricing-cards"]
  const out: Record<string, string> = { "layout/theme.storelib": `<template compat="shopify">{{ content_for_layout }}</template>` }
  for (const t of types) out[`sections/${t}.storelib`] = `<template compat="shopify"><section>{{ section.settings.heading }}</section></template>\n<schema>{"name":"${t}","settings":[]}</schema>`
  return out
}

async function main() {
  console.log("\n1. The catalogue, built from the theme's own schemas")
  {
    const input = readCatalogueInput()
    const rebuilt = buildMateriaCatalogue(input)
    const onDisk = readFileSync(join(process.cwd(), "lib/storelib-ai/materia/catalogue.generated.ts"), "utf8")
    check("the generated module is exactly what the theme's files build today (scripts/build-materia-catalogue.mjs, run before build, dev and the push tests, regenerates it)", catalogueModuleText(rebuilt) === onDisk)
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> }
    const runner = readFileSync(join(process.cwd(), "scripts/run-push-tests.mjs"), "utf8")
    check("it is regenerated before every build, dev server and push test run, so a template edit cannot leave it stale",
      pkg.scripts.build.indexOf("node scripts/build-materia-catalogue.mjs") > 0 && pkg.scripts.build.indexOf("node scripts/build-materia-catalogue.mjs") < pkg.scripts.build.indexOf("scripts/build-next.mjs") &&
        pkg.scripts.dev.indexOf("node scripts/build-materia-catalogue.mjs") >= 0 && pkg.scripts.dev.indexOf("node scripts/build-materia-catalogue.mjs") < pkg.scripts.dev.indexOf("next dev") &&
        runner.indexOf('"scripts/build-materia-catalogue.mjs"') > 0 && runner.indexOf('"scripts/build-materia-catalogue.mjs"') < runner.indexOf('execFileSync("pnpm", ["exec", "tsc"'))
    check("  the pre-step writes only when the catalogue changed", /readFileSync\(out, "utf8"\) === text/.test(readFileSync(join(process.cwd(), "scripts/build-materia-catalogue.ts"), "utf8")))
    const withSchema = Object.entries(input.sections).filter(([, text]) => liquidSchema(text))
    check("every base section with a {% schema %} is in it, under its file name", withSchema.length >= 300 && withSchema.every(([f]) => !!materiaSection(f.replace(/\.liquid$/, ""))), { sections: withSchema.length })
    check("the theme blocks too", rebuilt.blocks.length >= 20 && rebuilt.blocks.some((b) => b.type === "variant_picker"))
    const hero = materiaSection("hero-image1")!
    check("a section keeps its key settings with a select's values, every setting id and its blocks", /content_align=left\|center\|right/.test(sectionDetail("hero-image1")) && hero.ids.split(" ").includes("overlay_opacity") && /heading\(/.test(sectionDetail("hero-image1")) && hero.purpose === "hero" && hero.addable)
    check("which templates use it (proven sections first)", hero.usedBy.includes("fitness") && hero.usedBy.includes("coach"))
    check("a section made for one template says so", materiaSection("course2-curriculum")?.madeFor === "course2")
    check("purposes read from type and name", purposeOf("faq-side-image", "FAQ with image") === "faq" && purposeOf("products-grid", "Products grid") === "products" && purposeOf("testimonials", "Testimonials Grid") === "testimonials and reviews" && purposeOf("Image-and-video-text", "Image & Video with Text") === "image with text")
    check("every CODE_TEMPLATES entry is a template, with its brief, fonts and home page", rebuilt.templates.length === CODE_TEMPLATES.length && rebuilt.templates.every((t) => t.brief.length > 10 && t.pages.some((p) => p.key === "home") && !!t.fonts.heading), rebuilt.templates.filter((t) => !t.pages.some((p) => p.key === "home")).map((t) => t.template))
    const unknownOnHome = rebuilt.templates.flatMap((t) => (t.pages.find((p) => p.key === "home")?.sections ?? []).filter((s) => !materiaSection(s.type)).map((s) => `${t.template}:${s.type}`))
    check("every section a template's home places is a catalogue section", unknownOnHome.length === 0, unknownOnHome)
    check("template briefs come from the comments on CODE_TEMPLATES, without the bookkeeping", /video sales letter/.test(materiaTemplate("vsl")!.brief) && !/Templates round|owner's reference/.test(rebuilt.templates.map((t) => t.brief).join(" ")))
    check("Shopify JSON with comments parses", (parseCommentedJson(`/* a "quoted" note */\n{ "a": "x /* not a comment */", "b": 1 }`) as { a: string }).a === "x /* not a comment */")
    check("indexed once per process (the module is the cache)", materiaCatalogue() === materiaCatalogue())
    const text = catalogueText({ focus: ["hero-image1", "steps", "testimonials"], budget: 6_000 })
    check("the catalogue text fits its budget, details first, then every purpose", text.length <= 6_000 && /IN DETAIL:\nhero-image1 "Hero Image 1"/.test(text) && /- faq: /.test(text) && /- testimonials and reviews: /.test(text), text.length)
    check("popups, store pages and plumbing are not offered for a page body", !/- popup:|- store pages:|- utility:/.test(catalogueOverview()))
    check("a tight budget is honoured at a whole line", catalogueText({ budget: 900 }).length <= 900)
  }

  console.log("\n2. The closest template, selected and written as a pattern")
  {
    const pick = (prompt: string, category?: string) => chooseMateriaTemplate({ prompt, category }).template.template
    check("a personal trainer (the Fitness coach example) gets a coaching or fitness template", ["trainer", "fitness", "coach"].includes(pick(job().prompt, "fitness_coach")), pick(job().prompt, "fitness_coach"))
    check("a running coach gets the running coach", pick("Marathon and half marathon plans from a running coach") === "coach")
    check("sample packs get a sample pack store", ["samples", "soundpacks"].includes(pick("I sell sample packs and drum loops for producers")))
    check("Notion templates get a Notion template store", ["workspace", "notionsite", "notionpage"].includes(pick("I sell Notion templates for students")))
    check("a cookbook gets the cookbook", pick("My cookbook of sourdough and broth recipes, in print and as ebooks") === "ebooks")
    check("a streetwear label gets a streetwear template", ["streetwear", "rail"].includes(pick("A streetwear label dropping hoodies and cargo pants")))
    check("the Online course example gets a course template", ["courselanding", "course2", "landing", "vslfunnel"].includes(pick("A website that sells my watercolor course for beginners", "online_course")))
    const none = chooseMateriaTemplate({ prompt: "zzqx" })
    check("nothing matched: Storelib Default, said with score 0", none.template.template === "default" && none.score === 0)
    const coach = chooseMateriaTemplate({ prompt: "Marathon plans from a running coach" })
    const ref = templateReferenceText(coach.template, { why: coach.matched })
    check("the reference has the page structure in order, each section's purpose, style and blocks", /HOME, in order/.test(ref) && /^1\. hero-image1 \[hero\]: /m.test(ref) && /faq-side-image \[faq\]/.test(ref) && /PAGE about: /.test(ref) && /testimonial x5/.test(ref))
    check("its fonts and colour schemes", /Fonts: Barlow/.test(ref) && /Colour schemes: default #ffffff/.test(ref))
    check("a pattern, never its words, names, products or pictures", /never its words, names, products or pictures/.test(ref))
    check("the reference names why it was chosen", /matched on: .*coach/.test(ref))
    const creatorpro = templateReferenceText(materiaTemplate("creatorpro")!)
    check("an AI default display face in a template is flagged, not copied", /Montserrat is an AI default face/.test(creatorpro), creatorpro.slice(0, 600))
    check("referenceFocus is the template's home in order", referenceFocus(coach.template)[0] === "hero-image1" && referenceFocus(coach.template).length >= 8)
    check("within its budget", templateReferenceText(materiaTemplate("rail")!, { budget: 1_200 }).length <= 1_200)
  }

  console.log("\n3. Unknown sections rejected, near misses repaired")
  {
    check("the same type written another way resolves", resolveSectionType("hero_image1")?.type === "hero-image1" && resolveSectionType("sections/hero-image1.liquid")?.type === "hero-image1" && resolveSectionType("image-and-video-text")?.type === "Image-and-video-text")
    check("its display name resolves", resolveSectionType("Hero Image 1")?.type === "hero-image1")
    check("one letter of plural resolves to the plural, not a numbered variant", resolveSectionType("testimonial")?.type === "testimonials")
    check("an invented type does not", resolveSectionType("mega-pricing-wall") === null && resolveSectionType("hero") === null)
    const r = checkMateriaSections([
      { type: "hero_image1", settings: { content_align: "Left", bogus: 1, image_alt: "A coach on the track" }, blocks: [{ type: "heading", settings: { text: "Run your first marathon" } }, { type: "confetti" }] },
      { type: "mega-pricing-wall", settings: {} },
      { type: "steps", settings: { step_style: "zigzag" } },
    ])
    const [hero, steps] = r.sections
    check("an unknown type is refused with the closest named, the list is not ok", !r.ok && r.issues.some((i) => i.code === "materia.unknown_type" && /pricing-/.test(i.message)) && r.sections.length === 2, r.issues)
    check("a near miss is repaired and said", hero.type === "hero-image1" && r.issues.some((i) => i.code === "materia.type_repaired"))
    check("an unknown setting is dropped, a select value in another case repaired", hero.settings?.bogus === undefined && hero.settings?.content_align === "left" && hero.settings?.image_alt === "A coach on the track")
    check("a value a select never had is dropped (its default stays)", steps.type === "steps" && steps.settings?.step_style === undefined && r.issues.some((i) => i.code === "materia.bad_option"))
    check("an unknown block is dropped, a known one kept", hero.blocks?.length === 1 && hero.blocks[0].type === "heading" && r.issues.some((i) => i.code === "materia.unknown_block"))

    const cites = planCitationIssues(["ai_opening: materia:hero_image1, the promise", "ai_wall: materia:mega-wall, proof", "ai_story: custom, the founder"])
    check("plan citations: a near miss rewritten, an unknown refused, uncited lines left alone", cites.lines[0] === "ai_opening: materia:hero-image1, the promise" && cites.issues.some((i) => i.severity === "error" && /mega-wall/.test(i.message)) && cites.cited === 2 && cites.lines[2] === "ai_story: custom, the founder")

    /* The agent's tools on a memory store, no model. */
    const plan = sitePlan([])
    plan[0].sections = ["ai_coach_hero: materia:hero_image1, the promise", ...plan[0].sections.slice(1)]
    const repaired = repairPlanCitations(plan)
    check("repairPlanCitations rewrites the plan in place", (repaired.pages as typeof plan)[0].sections[0] === "ai_coach_hero: materia:hero-image1, the promise" && repaired.issues.every((i) => i.severity === "warning"))
    const store = memoryStore({ pages: { home: [] }, files: { "sections/hero-image1.storelib": HERO.replace('"type": "ai_coach_hero"', '"type": "hero-image1"') } })
    const cp: LoopCheckpoint = { ...newCheckpoint(), concept: CONCEPT as never }
    const deps: AgentDeps = { store, models: {} as AgentModels, capabilities: async () => CAPS }
    const tools = createToolSet({ job: job(), deps, cp, emit: () => undefined, onFinish: async () => ({ ok: true }), setPhase: () => undefined })
    const bad = sitePlan([])
    bad[0].sections = ["ai_coach_hero: materia:mega-pricing-wall, the promise", ...bad[0].sections.slice(1)]
    const refused = (await tools.report_progress({ phase: "plan", label: "Plan", pages: bad } as never)) as { ok: boolean; issues?: { code: string; message: string }[] }
    check("report_progress refuses a plan citing a Materia section that does not exist, naming the closest", refused.ok === false && !!refused.issues?.some((i) => i.code === "plan.materia_unknown" && /Closest: /.test(i.message)), refused)
    const accepted = (await tools.report_progress({ phase: "plan", label: "Plan", pages: plan } as never)) as { ok: boolean; note?: string }
    check("and accepts the repaired one, saying what it read", accepted.ok === true && /materia:hero-image1/.test(accepted.note ?? "") && cp.sitePlan?.pages[0].sections[0] === "ai_coach_hero: materia:hero-image1, the promise", accepted)

    const themeJob = job({ mode: "theme", options: { generation: "theme" } })
    const themeTools = createToolSet({ job: themeJob, deps, cp: { ...newCheckpoint(), concept: CONCEPT as never, sitePlan: { pages: [] } as never }, emit: () => undefined, onFinish: async () => ({ ok: true }), setPhase: () => undefined })
    const placed = (await themeTools.set_page_sections({ page: "home", sections: [{ type: "hero_image1" }] } as never)) as { ok: boolean; issues?: { code: string; message: string }[] }
    const home = store.project.pages.home ?? []
    check("set_page_sections repairs a theme section's type written another way, and places it", placed.ok && home.some((s) => s.type === "hero-image1") && !!placed.issues?.some((i) => i.code === "page.type_repaired"), placed)
    const refusedType = (await themeTools.set_page_sections({ page: "home", sections: [{ type: "hero-image1" }, { type: "mega-pricing-wall" }] } as never)) as { ok: boolean; issues?: { code: string; message: string }[] }
    check("  and refuses one the site does not have, naming what it has", !refusedType.ok && !!refusedType.issues?.some((i) => i.code === "page.unknown_type" && /mega-pricing-wall/.test(i.message) && /This site has hero-image1/.test(i.message)) && !(store.project.pages.home ?? []).some((s) => s.type === "mega-pricing-wall"), refusedType)

    const addable = ["hero-image1", "testimonials", "faq-tabs"]
    const fix = repairAddableType("Hero Image 1", addable)
    const no = repairAddableType("mega-pricing-wall", addable)
    check("Ask AI's add_section: a type written another way is the one the site has, else the closest are named", "type" in fix && fix.type === "hero-image1" && "closest" in no && no.closest.length > 0)
  }

  console.log("\n4. Every path is told the rules")
  {
    check("MATERIA_RULES: Materia first, a small edge, never an invented type, setting or block", /Original sections first/.test(MATERIA_RULES) && /at most two or three sections of your own/.test(MATERIA_RULES) && /Never invent a section type, a setting id or a block type/.test(MATERIA_RULES))
    check("  no AI default display fonts", /Inter, Roboto, Open Sans, Lato, Montserrat, Poppins/.test(MATERIA_RULES) && /never the display face/.test(MATERIA_RULES))
    check("  real photographs, no fake metrics, honest copy, the banned words, no em dashes", /real photographs/.test(MATERIA_RULES) && /No fake metrics/.test(MATERIA_RULES) && MATERIA_BANNED_WORDS.every((w) => MATERIA_RULES.includes(w)) && /No em dashes/.test(MATERIA_RULES))
    check("  the template briefs: every page designed, header icons that fit, product pages that sell", /every link opens a page that exists/.test(MATERIA_RULES) && /Header icons fit the business/.test(MATERIA_RULES) && /A product page sells/.test(MATERIA_RULES))
    check("  the template is a pattern, not content", /a pattern, not content/.test(MATERIA_RULES))
    const allText = [MATERIA_RULES, MATERIA_EDIT_RULES, templateReferenceText(materiaTemplate("coach")!), catalogueText()].join("\n")
    check("no rule text carries an em dash", !allText.includes(EM_DASH))
    check("the agent's shared (cached) prefix carries the rules and the Materia direction", AGENT_SYSTEM.includes(MATERIA_RULES) && /Materia theme's sections and blocks/.test(AGENT_SYSTEM))

    /* Start with AI, with a scripted stub as the model: the first turn it is sent. */
    const plan = scripted([{ calls: [["list_pages", {}]] }], { id: "plan" })
    const deps: AgentDeps = {
      store: memoryStore({ pages: { home: [] } }),
      templates: NO_TEMPLATES,
      models: { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: plan, model: "claude-sonnet-5-5" }, small: { provider: plan, model: "claude-haiku-5-5" }, ownKey: false },
      capabilities: async () => CAPS,
      now: (() => {
        let t = T0
        return () => (t += 1_000)
      })(),
    }
    const r = await runAgentSlice(job(), null, deps, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
    const first = String((plan.requests[0]?.turns[0] as { text?: string; content?: string })?.text ?? (plan.requests[0]?.turns[0] as { content?: string })?.content ?? "")
    check("Start with AI: the reference template is chosen and kept in the checkpoint", !!r.checkpoint.materia && ["trainer", "fitness", "coach"].includes(r.checkpoint.materia.template) && r.checkpoint.materia.install === false, r.checkpoint.materia)
    check("  the first turn carries the reference, the catalogue and how to use them on this site", /REFERENCE TEMPLATE: "/.test(first) && /MATERIA SECTIONS/.test(first) && /ON THE MATERIA PATTERN/.test(first) && /materia:<type>/.test(first), first.slice(0, 300))
    check("  the rules are not repeated in the turn (they are in the cached prefix)", !first.includes(MATERIA_RULES.slice(0, 80)))
    check("  one model call, made to the stub: no paid call", plan.calls === 1)
    const brief = materiaBrief({ job: job(), files: [], pages: [], caps: CAPS })
    check("  the block fits MATERIA_BRIEF_CHARS with the rules in it", brief.text.length <= MATERIA_BRIEF_CHARS && brief.text.includes(MATERIA_RULES.slice(0, 60)))

    const files = Object.entries(materiaFiles()).map(([path, text]) => ({ path, text, updatedAt: null }))
    const pages = [{ key: "home", sections: [{ id: "h1", type: "hero-image1", settings: {}, blocks: [] }, { id: "q1", type: "faq-tabs", settings: {}, blocks: [] }] }]
    const onMateria = materiaBrief({ job: job({ mode: "theme", redesign: "full" }), files, pages: pages as never, caps: CAPS })
    check("AI from a chosen template (a Materia site): told to PLACE Materia's own sections", onMateria.install && /THIS WEBSITE RUNS ON MATERIA/.test(onMateria.text) && /set_page_sections with their types/.test(onMateria.text))
    const edit = materiaBrief({ job: job({ edit: true }), files, pages: pages as never })
    check("Edit with AI on a Materia site: the short rules, the site's sections by purpose, what it can add", /THIS SITE IS BUILT ON MATERIA/.test(edit.text) && /home: hero-image1 \[hero\], faq-tabs \[faq\]/.test(edit.text) && /BY WHAT THEY DO/.test(edit.text) && edit.choice === null)
    check("Edit with AI on a site that is not Materia: nothing added", materiaBrief({ job: job({ edit: true }), files: [], pages: pages as never }).text === "")

    /* Start with AI from a template: the real "trainer" template, converted as the import converts it, is the website the agent starts on. */
    const converted = await convertShopifyTheme(await JSZip.loadAsync(await composeTemplateZip("materia/trainer")), { fallbackName: "AI website" })
    if (converted.ok === false) throw new Error("the trainer template did not convert")
    const tplFiles = Object.fromEntries(Object.entries(converted.theme.files).filter(([p]) => p.endsWith(".storelib")))
    const tplPages = Object.fromEntries(converted.theme.pages.map((p) => [p.page_key, p.sections as never]))
    const onTemplate = memoryStore({ files: tplFiles, pages: tplPages })
    const tplModel = scripted([{ calls: [["list_pages", {}]] }], { id: "plan" })
    const tplJob = job({ mode: "theme", options: { generation: "theme", category: "fitness_coach", template: "trainer" } })
    const tr = await runAgentSlice(tplJob, null, { ...deps, store: onTemplate, models: { ...deps.models, plan: { provider: tplModel, model: "claude-opus-5-5", effort: "medium" } } }, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
    const tplFirst = String((tplModel.requests[0]?.turns[0] as { text?: string; content?: string })?.text ?? (tplModel.requests[0]?.turns[0] as { content?: string })?.content ?? "")
    check("Start with AI on the imported template: the agent follows THAT template and knows Materia is installed", tr.checkpoint.materia?.template === "trainer" && tr.checkpoint.materia?.install === true, tr.checkpoint.materia)
    check("  told it is the template, already imported, to adapt (never ship), and to place Materia's own sections", /NEW WEBSITE FROM A STORELIB TEMPLATE/.test(tplFirst) && /TEMPLATE, ALREADY IMPORTED/.test(tplFirst) && /THIS WEBSITE RUNS ON MATERIA/.test(tplFirst) && !/NEW WEBSITE INSIDE A THEME/.test(tplFirst), tplFirst.slice(0, 600))
    check("  no AI-own starter template is poured over it", !tr.checkpoint.template)
    const homeBody = (onTemplate.project.pages.home ?? []).filter((x) => !(x as { group?: string }).group && !x.hidden)
    const done = completenessIssues({ pages: await onTemplate.listPages(), sources: onTemplate.project.files, settings: {}, caps: CAPS, mode: "theme", plan: { pages: [{ key: "home", sections: homeBody.map((x) => x.type) }] }, materia: true })
    check("  finish reads its Materia sections as the site's own (no 'none of your own' on the template's home)", !done.some((i) => i.code === "site.home_sections" || i.code === "site.template_product" || i.code === "site.unreachable"), done.map((i) => i.code))

    /* The classic planner. */
    const turn = sitePlanTurn({ prompt: "A running coach", caps: EMPTY_CAPABILITIES, capsText: "", addable: [], presets: [], reference: plannerReference({ prompt: "Marathon plans from a running coach" }) })
    check("the classic planner is given the closest template as its pattern, mapped onto its own types", /HOW STORELIB'S TEMPLATES ARE BUILT/.test(turn) && /REFERENCE TEMPLATE: "Running coach"/.test(turn) && /give each slot the listed section type that does that job/.test(turn))

    /* Ask AI in the editor. */
    const sections = [{ id: "header", type: "header", settings: {} }, { id: "h1", type: "hero-image1", settings: {} }, { id: "t1", type: "testimonials", settings: {} }, { id: "footer", type: "footer", settings: {} }]
    const broad = materiaEditContext({ sources: materiaFiles(), sections: sections as never, addable: ["hero-image1", "testimonials", "faq-tabs", "pricing-cards", "steps"], broad: true })
    const narrow = materiaEditContext({ sources: materiaFiles(), sections: sections as never, addable: ["hero-image1", "testimonials", "faq-tabs"], broad: false })
    check("Ask AI on a Materia site: the rules and this page's sections by what they do", broad.startsWith(MATERIA_EDIT_RULES) && /\[h1\] hero-image1 \[hero\]/.test(broad) && /\[t1\] testimonials \[testimonials and reviews\]/.test(broad) && !/\[header\]/.test(broad))
    check("  a broad request also gets the sections it can add, by purpose, within budget", /MATERIA SECTIONS YOU CAN ADD/.test(broad) && /- faq: faq-tabs/.test(broad) && broad.length <= MATERIA_EDIT_CHARS)
    check("  a narrow edit pays only for the rules and the page", !/YOU CAN ADD/.test(narrow) && narrow.length < 1_400, narrow.length)
    check("  a site that is not Materia gets nothing (its turn stays the size it was)", materiaEditContext({ sources: { "sections/hero_centered.storelib": "<template></template>" }, sections: sections as never, addable: ["hero_centered"], broad: true }) === "")

    /* MCP and every outside agent. */
    check("MCP's rulebook tells outside agents to build on Materia's sections and never invent types", /runs on the Materia theme/.test(agentRulesText()) && /storelib_search_components finds them by what they do/.test(agentRulesText()))
    check("  the builder's cached rules do not grow for every site (it is told in the run, on a Materia site)", !/runs on the Materia theme/.test(builderAgentRules()))
    const schemas = { quotebanner: { type: "quotebanner", name: "Quote Banner", fields: [], blocks: [] } } as never
    const found = searchComponents(schemas, "reviews", { purpose: purposeOfType })
    const without = searchComponents(schemas, "reviews", {})
    check("  storelib_search_components finds a Materia section by what it does", found[0]?.type === "quotebanner" && found[0].category === "testimonials and reviews" && without.length === 0, { found, without })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
