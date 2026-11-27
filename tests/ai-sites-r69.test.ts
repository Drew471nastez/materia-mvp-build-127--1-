/**
 * ===========================================================================
 *  ROUND 69: AI WEBSITES FROM A TEMPLATE AND FROM SCRATCH, NEVER THE OLD DEFAULT
 * ===========================================================================
 * The owner: a site started "from a proven template" came out as that template
 * with new words; from scratch should understand the themes too; the AI should
 * never start from the old Storelib Default. What this proves, with no model:
 *
 *   1. THE COMPOSER (lib/storelib-ai/materia/compose.ts): for ten different
 *      businesses, a blueprint of ten or more home sections drawn from every
 *      template, honest (no reviews: no testimonials; no products: no shelves),
 *      in faces Materia loads (never an AI default display face), in palettes
 *      whose text passes 4.5:1, deterministic per brief.
 *   2. NOVELTY (lib/ai-builder/novelty.ts materiaLikeness): every blueprint,
 *      placed on its base template's settings, is under TEMPLATE_LIKENESS_MAX
 *      against that template and under SIBLING_LIKENESS_MAX against every
 *      other brief's site; a "lazy" site (the template's home with its words)
 *      is refused at finish (template.likeness, template.sample_copy).
 *   3. THE JOB (lib/ai-builder/agent/loop.ts + blueprint.ts) on the real
 *      trainer template converted as the import converts it, with a scripted
 *      model: home and the look are the blueprint's before the first turn, the
 *      model reads the plan (not the template's running order), finish refuses
 *      while sample words remain and passes once they are rewritten.
 *   4. NEVER THE OLD DEFAULT: no prompt (not even "a candle shop") chooses
 *      Storelib Default, and the create route frames by chooseBase. From
 *      scratch stays the free start (nothing of any theme drawn) and reads the
 *      same composed plan and what the templates do well, as its guide.
 *
 * WHAT THIS DOES NOT MEASURE: what a real model writes into the plan. The
 * likeness numbers are of the deterministic blueprint and of scripted sites.
 *
 * Run: node scratchpad/r65/m4/run-some.mjs tests/ai-sites-r69.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { BLUEPRINT_MIN_DISTINCT, BLUEPRINT_MIN_SECTIONS, blueprintHome, blueprintSettings, blueprintText, chooseBase, composeMateriaSite, MATERIA_FONTS, materiaDesignKnowledge, PALETTES, schemeKeys, TYPE_PAIRS, type SiteBlueprint } from "@/lib/storelib-ai/materia/compose"
import { materiaSection } from "@/lib/storelib-ai/materia/catalogue"
import { AI_NEVER_STARTS_FROM, chooseMateriaTemplate, materiaTemplate } from "@/lib/storelib-ai/materia/reference"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import { copyPhrases, materiaLikeness, materiaSignature, SIBLING_LIKENESS_MAX, TEMPLATE_LIKENESS_MAX, templateNoveltyIssues, templateSignature } from "@/lib/ai-builder/novelty"
import { blueprintIssues } from "@/lib/ai-builder/agent/blueprint"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { NO_TEMPLATES } from "@/lib/ai-builder/agent/templates"
import type { AgentDeps, AgentJobInput } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import { BANNED_WORDS } from "@/lib/ai-builder/agent/prompts"
import { composeTemplateZip } from "@/lib/themes/template-packages"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { CAPS, scripted } from "./ai-builder-agent-fixtures"

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
const EM_DASH = "—"

/* ── contrast ─────────────────────────────────────────────────────────── */
function lum(hex: string): number {
  const h = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const BRIEFS: { prompt: string; category?: string }[] = [
  { prompt: "An online shop for my hand-poured soy candles, with a warm and calm look, best sellers on the home page and the story of how they are made.", category: "candle_shop" },
  { prompt: "A website for my personal training business with my programs, client results, prices and a way to book a free first call.", category: "fitness_coach" },
  { prompt: "A portfolio for my wedding and portrait photography with galleries, packages and prices, and a contact form.", category: "photographer" },
  { prompt: "A website that sells my watercolor course for beginners, with what is inside, reviews, an FAQ and a clear buy button.", category: "online_course" },
  { prompt: "A dental clinic in Leeds where patients book appointments and read about treatments." },
  { prompt: "Streetwear label from Berlin, limited drops of heavyweight hoodies and caps." },
  { prompt: "Lo-fi beat packs and drum samples for bedroom producers." },
  { prompt: "Notion planner templates for university students." },
  { prompt: "A small bakery selling sourdough loaves and pastries for local pickup." },
  { prompt: "A launch page for my business masterclass with a video, bonuses and a guarantee." },
]

/** A blueprint placed on its base template: home's sections with the site's scheme keys, the look in its settings. */
function placed(bp: SiteBlueprint, shopify: Record<string, unknown>) {
  const values = blueprintSettings(bp, shopify)
  const home = blueprintHome(bp, schemeKeys(shopify)).map((s, i) => ({ id: `s${i}`, type: s.type, settings: s.settings }))
  return { home, values }
}

async function convertTemplate(id: string) {
  const converted = await convertShopifyTheme(await JSZip.loadAsync(await composeTemplateZip(`materia/${id}`)), { fallbackName: "AI website" })
  if (converted.ok === false) throw new Error(`${id} did not convert`)
  return converted.theme
}

async function main() {
  /* ── 1. the composer ───────────────────────────────────────────────── */
  console.log("\n1. the composer: a blueprint per business, from every template")
  const plans = BRIEFS.map((b) => composeMateriaSite({ prompt: b.prompt, category: b.category ?? null }))
  const usedTemplates = new Set(plans.flatMap((p) => p.home.map((s) => s.from)))
  for (const [i, bp] of plans.entries()) {
    const types = bp.home.map((s) => s.type)
    check(`${i + 1} (${bp.archetype}): ${BLUEPRINT_MIN_SECTIONS} or more sections, ${BLUEPRINT_MIN_DISTINCT} or more kinds`, types.length >= BLUEPRINT_MIN_SECTIONS && new Set(types).size >= BLUEPRINT_MIN_DISTINCT, types)
    check(`  every section is a Materia section Add section offers`, types.every((t) => materiaSection(t)?.addable), types.filter((t) => !materiaSection(t)?.addable))
    check(`  opens with an opening`, bp.home[0]?.role === "opening", bp.home[0])
    check(`  its frame is never Storelib Default`, !AI_NEVER_STARTS_FROM.includes(bp.base), bp.base)
    check(`  the same words give the same blueprint`, JSON.stringify(bp) === JSON.stringify(composeMateriaSite({ prompt: BRIEFS[i].prompt, category: BRIEFS[i].category ?? null })))
  }
  check("the ten blueprints draw on many templates' sections (12 or more templates)", usedTemplates.size >= 12, [...usedTemplates])
  check("  and on four or more type pairs and four or more palettes", new Set(plans.map((p) => p.type.display)).size >= 4 && new Set(plans.map((p) => p.palette.id)).size >= 4, plans.map((p) => `${p.type.display}/${p.palette.id}`))
  const noReviews = composeMateriaSite({ prompt: BRIEFS[3].prompt, category: "online_course", reviews: 0, products: [{ title: "Watercolor for beginners", kind: "course" }] })
  const withReviews = composeMateriaSite({ prompt: BRIEFS[3].prompt, category: "online_course", reviews: 12, products: [{ title: "Watercolor for beginners", kind: "course" }] })
  check("honest: no reviews, no testimonial section", !noReviews.home.some((s) => s.role === "proof"), noReviews.home.map((s) => s.role))
  check("  with reviews, the course may show them", withReviews.home.length >= BLUEPRINT_MIN_SECTIONS)
  const noProducts = composeMateriaSite({ prompt: "A coaching practice for new managers", products: [], reviews: 0 })
  check("  no products, no shelves or collections", !noProducts.home.some((s) => ["products", "collections", "feature"].includes(s.role)), noProducts.home.map((s) => s.role))
  check("a different job for the same words may differ (the seed takes the job)", [1, 2, 3, 4, 5].some((n) => JSON.stringify(composeMateriaSite({ prompt: BRIEFS[0].prompt, salt: `job-${n}` }).home) !== JSON.stringify(plans[0].home)))

  /* Type and colour. */
  const liquid = readFileSync(join(process.cwd(), "theme-packages/materia/base/snippets/font-variables.liquid"), "utf8")
  const loads = new Set((/assign mt_fonts = '([^']+)'/.exec(liquid)?.[1] ?? "").split("|").map((r) => r.split(":")[0]))
  check("MATERIA_FONTS is exactly the families Materia's More fonts loads (font-variables.liquid)", MATERIA_FONTS.every((f) => loads.has(f)) && [...loads].filter((f) => f !== "Helvetica" && f !== "Georgia").every((f) => (MATERIA_FONTS as readonly string[]).includes(f)), [...loads].filter((f) => !(MATERIA_FONTS as readonly string[]).includes(f)))
  check("every type pair loads on Materia", TYPE_PAIRS.every((p) => loads.has(p.display) && loads.has(p.body)), TYPE_PAIRS.filter((p) => !loads.has(p.display) || !loads.has(p.body)))
  check("  no pair sets an AI default face as display", TYPE_PAIRS.every((p) => !isSlopDisplayFont(p.display)), TYPE_PAIRS.filter((p) => isSlopDisplayFont(p.display)).map((p) => p.display))
  const weak: string[] = []
  for (const p of PALETTES)
    for (const [i, s] of p.schemes.entries()) {
      if (contrast(s.text, s.background) < 4.5) weak.push(`${p.id}[${i}] text ${contrast(s.text, s.background).toFixed(2)}`)
      if (contrast(s.heading, s.background) < 4.5) weak.push(`${p.id}[${i}] heading ${contrast(s.heading, s.background).toFixed(2)}`)
      if (contrast(s.buttonText, s.button) < 4.5) weak.push(`${p.id}[${i}] button ${contrast(s.buttonText, s.button).toFixed(2)}`)
    }
  check("every palette's text, headings and buttons pass 4.5:1 on their scheme", weak.length === 0, weak)

  /* Copy and size. */
  const words = [...plans.map((p) => blueprintText(p, { mode: "template" })), materiaDesignKnowledge()].join("\n")
  check("the plan and the knowledge the model reads use none of the banned words, and no em dash", !BANNED_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(words)) && !words.includes(EM_DASH))
  const longest = Math.max(...plans.map((p) => blueprintText(p, { mode: "template" }).length))
  check("  a plan is compact (under 2,800 characters) and the knowledge under 2,600", longest < 2_800 && materiaDesignKnowledge().length < 2_600, { longest, knowledge: materiaDesignKnowledge().length })

  /* ── 2. novelty ───────────────────────────────────────────────────── */
  console.log("\n2. novelty: against the source template and against each other")
  const bases = [...new Set(plans.map((p) => p.base))]
  const themes = new Map<string, Awaited<ReturnType<typeof convertTemplate>>>()
  for (const b of bases) themes.set(b, await convertTemplate(b))
  const sites = plans.map((bp) => {
    const theme = themes.get(bp.base)!
    const shopify = (theme.settings as { shopify: Record<string, unknown> }).shopify
    const { home, values } = placed(bp, shopify)
    return { bp, sig: materiaSignature({ home, shopify: values }), source: templateSignature(materiaTemplate(bp.base)!) }
  })
  const vsTemplate = sites.map((s) => materiaLikeness(s.sig, s.source).score)
  check(`every site is under ${TEMPLATE_LIKENESS_MAX} like its source template`, vsTemplate.every((x) => x <= TEMPLATE_LIKENESS_MAX), vsTemplate)
  const pairs: number[] = []
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) pairs.push(materiaLikeness(sites[i].sig, sites[j].sig).score)
  check(`every two sites for two businesses are under ${SIBLING_LIKENESS_MAX} alike`, pairs.every((x) => x <= SIBLING_LIKENESS_MAX), pairs)
  const stat = (xs: number[]) => ({ min: Math.min(...xs).toFixed(3), mean: (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3), max: Math.max(...xs).toFixed(3) })
  console.log(`  likeness to the source template: ${JSON.stringify(stat(vsTemplate))}; between briefs (${pairs.length} pairs): ${JSON.stringify(stat(pairs))}`)

  /* The lazy site the owner saw: the template's own home with its words, settings and look. */
  const trainer = themes.get("trainer") ?? (await convertTemplate("trainer"))
  const trainerShopify = (trainer.settings as { shopify: Record<string, unknown> }).shopify
  const trainerPages = trainer.pages.map((p) => ({ key: p.page_key, sections: p.sections as never as { id: string; type: string; group?: string; settings: Record<string, unknown>; blocks?: { type: string; settings: Record<string, unknown> }[] }[] }))
  const trainerHome = trainerPages.find((p) => p.key === "home")!.sections
  const samples = [...new Set(copyPhrases(trainerPages).map((c) => c.hash))]
  check("the trainer template's pages carry sample phrases to hold a site to (40 or more)", samples.length >= 40, samples.length)
  const lazy = materiaSignature({ home: trainerHome, shopify: trainerShopify, pages: trainerPages })
  const lazyLike = materiaLikeness(lazy, templateSignature(materiaTemplate("trainer")!, samples))
  check("the template shipped as it came is 0.8 or more like itself (the catalogue summarises its home)", lazyLike.score >= 0.8, lazyLike)
  const lazyIssues = templateNoveltyIssues({ site: lazy, source: templateSignature(materiaTemplate("trainer")!, samples), pages: trainerPages, samples, templateName: "Trainer" })
  check("  finish refuses it: too like the template, and its sample words", lazyIssues.some((i) => i.code === "template.likeness" && i.severity === "error") && lazyIssues.some((i) => i.code === "template.sample_copy" && i.severity === "error"), lazyIssues.map((i) => i.code))
  /* The template's home with only its words rewritten: still the template. */
  let n = 0
  const reworded = trainerHome.map((s) => ({ ...s, settings: Object.fromEntries(Object.entries(s.settings ?? {}).map(([k, v]) => [k, typeof v === "string" && v.split(" ").length >= 4 ? `Iron and Chalk line number ${++n} for this gym` : v])) }))
  const rewordedIssues = templateNoveltyIssues({ site: materiaSignature({ home: reworded, shopify: trainerShopify }), source: templateSignature(materiaTemplate("trainer")!, samples), pages: [{ key: "home", sections: reworded }], samples, templateName: "Trainer" })
  check("  new words on the template's own composition and look are still refused (template.likeness)", rewordedIssues.some((i) => i.code === "template.likeness"), rewordedIssues.map((i) => i.code))

  /* ── 3. the job, on the real template, with a scripted model ─────── */
  console.log("\n3. a job from the trainer template, scripted model")
  const store = memoryStore({
    files: Object.fromEntries(Object.entries(trainer.files).filter(([p]) => p.endsWith(".storelib"))),
    pages: Object.fromEntries(trainer.pages.map((p) => [p.page_key, p.sections as never])),
    settings: JSON.parse(JSON.stringify(trainer.settings)),
  })
  const model = scripted([{ calls: [["list_pages", {}]] }], { id: "plan" })
  const T0 = Date.UTC(2026, 10, 27, 12, 0, 0)
  const job: AgentJobInput = {
    jobId: "69696969-1111-2222-3333-444444444444",
    creatorId: "creator-r69",
    installId: "install-r69",
    prompt: BRIEFS[1].prompt,
    mode: "theme",
    options: { generation: "theme", category: "fitness_coach", template: "trainer" },
    budget: DEFAULT_JOB_BUDGET,
    startedAt: T0,
    spentUsd: 0,
    lastEventSeq: 0,
  }
  const deps: AgentDeps = {
    store,
    templates: NO_TEMPLATES,
    models: { plan: { provider: model, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: model, model: "claude-sonnet-5-5" }, small: { provider: model, model: "claude-haiku-5-5" }, ownKey: false },
    capabilities: async () => CAPS,
    now: (() => {
      let t = T0
      return () => (t += 1_000)
    })(),
  }
  const r = await runAgentSlice(job, null, deps, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
  const bpState = r.checkpoint.blueprint
  const turnText = (m: typeof model) => { const t = m.requests[0]?.turns[0] as { text?: string; content?: unknown } | undefined; return String(t?.text ?? (typeof t?.content === "string" ? t.content : JSON.stringify(t?.content ?? ""))) }
  const first = turnText(model)
  const homeNow = (await store.listPages()).find((p) => p.key === "home")!.sections
  const bodyNow = homeNow.filter((s) => !s.group).map((s) => s.type)
  check("the job composed a blueprint before the first turn, framed in the trainer template", bpState?.mode === "template" && bpState.base === "trainer" && (bpState.types.length ?? 0) >= BLUEPRINT_MIN_SECTIONS, bpState && { ...bpState, samples: bpState.samples.length })
  check("  home is the blueprint's sections in its order, the template's header and footer kept", JSON.stringify(bodyNow) === JSON.stringify(bpState?.types.filter((t) => store.project.files[`sections/${t}.storelib`])) && homeNow.some((s) => s.group === "header") && homeNow.some((s) => s.group === "footer"), { bodyNow, plan: bpState?.types })
  check("  home is no longer the template's (different sections, different order)", JSON.stringify(bodyNow) !== JSON.stringify(trainerHome.filter((s) => !s.group).map((s) => s.type)))
  const sh = (await store.readSettings()).shopify as Record<string, unknown>
  check("  the look is the blueprint's: its fonts and motion in the theme's own settings", `${sh.font_heading_google_family}/${sh.font_body_google_family}` === bpState?.type && typeof sh.scroll_animation === "string" && sh.scroll_animation !== "none", { fonts: `${sh.font_heading_google_family}/${sh.font_body_google_family}`, plan: bpState?.type, motion: sh.scroll_animation })
  check("  the first turn carries the site plan, not the template's running order", /THE SITE PLAN FOR THIS BUSINESS/.test(first) && !/REFERENCE TEMPLATE: "/.test(first) && /STARTS IN STORELIB'S "/.test(first), first.slice(0, 400))
  check("  one model call, to the stub", model.calls === 1)
  const before = blueprintIssues(bpState, await store.listPages(), await store.readSettings())
  check("finish refuses the draft while the template's and presets' sample words remain", before.some((i) => i.code === "template.sample_copy" && i.severity === "error"), before.map((i) => i.code))
  check("  but not for likeness: the composed home is already its own", !before.some((i) => i.code === "template.likeness"), before)
  const placedLike = materiaLikeness(materiaSignature({ home: homeNow, shopify: sh, pages: await store.listPages() }), templateSignature(materiaTemplate("trainer")!, bpState?.samples ?? [])).score
  /* The scripted model writes every word for the business (what set_section_settings would store). */
  let k = 0
  const rewrite = (v: unknown) => (typeof v === "string" && v.replace(/<[^>]*>/g, " ").trim().split(/\s+/).length >= 4 ? `Iron and Chalk strength block note ${++k} for lifters in Leeds` : v)
  const pagesNow = await store.listPages()
  await store.writePages(pagesNow.map((p) => ({ ...p, sections: p.sections.map((s) => ({ ...s, settings: Object.fromEntries(Object.entries(s.settings ?? {}).map(([key, v]) => [key, rewrite(v)])), blocks: (s.blocks ?? []).map((b) => ({ ...b, settings: Object.fromEntries(Object.entries(b.settings ?? {}).map(([key, v]) => [key, rewrite(v)])) })) })) })))
  const after = blueprintIssues(bpState, await store.listPages(), await store.readSettings())
  check("  once every word is the business's, the novelty checks pass", after.length === 0, after)
  console.log(`  the job's draft vs the trainer template: ${placedLike.toFixed(3)} (max ${TEMPLATE_LIKENESS_MAX})`)

  /* ── 4. never the old default; from scratch on Materia ───────────── */
  console.log("\n4. never the old Storelib Default")
  const prompts = ["zzqx", "A general store", "An online shop for candles and soap", "home goods and gifts", "A shop for my mugs and ceramics", ...BRIEFS.map((b) => b.prompt)]
  const chosen = prompts.flatMap((p) => [chooseMateriaTemplate({ prompt: p }).template.template, chooseBase({ prompt: p }), composeMateriaSite({ prompt: p }).base])
  check("no prompt starts the AI from Storelib Default (chooseMateriaTemplate, chooseBase, the blueprint)", !chosen.includes("default"), chosen)
  check("  a candle shop example starts in a shop frame", chooseBase({ prompt: BRIEFS[0].prompt, category: "candle_shop" }) === "podshop")
  check("  a coach starts in a coaching frame", ["trainer", "fitness", "coach", "coachpro"].includes(chooseBase({ prompt: BRIEFS[1].prompt, category: "fitness_coach" })))
  const route = readFileSync(join(process.cwd(), "app/api/website-builder/themes/create/route.ts"), "utf8")
  check("the create route chooses the frame by chooseBase, never chooseMateriaTemplate's old fallback", /\? chooseBase\(\{ prompt, category: options\.category \?\? null \}\) : null/.test(route) && !/chooseMateriaTemplate/.test(route))

  /* From scratch: the free start (nothing of any theme drawn), with the plan composed from every template as its guide. */
  const scratchStore = memoryStore({ pages: { home: [] } })
  const scratchModel = scripted([{ calls: [["list_pages", {}]] }], { id: "plan" })
  const sr = await runAgentSlice({ ...job, jobId: "69696969-5555-2222-3333-444444444444", mode: "blank", options: { generation: "blank", category: "fitness_coach" } }, null, { ...deps, store: scratchStore, models: { ...deps.models, plan: { provider: scratchModel, model: "claude-opus-5-5", effort: "medium" } } }, { deadline: T0 + 10 * 60_000, maxIterations: 1 })
  const scratchFirst = turnText(scratchModel)
  check("from scratch: a blueprint as the guide, nothing placed, no settings written", sr.checkpoint.blueprint?.mode === "scratch" && !AI_NEVER_STARTS_FROM.includes(sr.checkpoint.blueprint.base) && ((await scratchStore.listPages()).find((p) => p.key === "home")?.sections.length ?? -1) === 0 && Object.keys(await scratchStore.readSettings()).length === 0, sr.checkpoint.blueprint && { ...sr.checkpoint.blueprint, samples: sr.checkpoint.blueprint.samples.length })
  check("  told to write each section on its Materia model, with the plan and what the templates do well", /ON THE MATERIA PATTERN/.test(scratchFirst) && /WHAT STORELIB'S TEMPLATES DO WELL/.test(scratchFirst) && /THE SITE PLAN FOR THIS BUSINESS/.test(scratchFirst) && /write each as your own component on that pattern/.test(scratchFirst), scratchFirst.slice(0, 400))
  check("  finish holds a from scratch site to no template (it started from none)", blueprintIssues(sr.checkpoint.blueprint, await scratchStore.listPages(), {}).length === 0)
  if (process.env.PARTS) for (const part of first.split("\n\n")) console.log("PART", part.length, JSON.stringify(part.slice(0, 70)))
  check("  the first turns stay within budget (under 30,000 characters)", scratchFirst.length < 30_000 && first.length < 30_000, { scratch: scratchFirst.length, template: first.length })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
