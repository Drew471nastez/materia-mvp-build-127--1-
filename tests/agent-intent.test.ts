/**
 * ===========================================================================
 *  STORELIB AI AS AN AGENT: INTENT, PLAN, CHECKS, MEMORY, REPAIR
 * ===========================================================================
 * The layer on top of the theme agent (lib/website-builder/agent/loop.ts):
 *
 *   intent.ts         what kind of request, before the model sees the page
 *   creative-plan.ts  the brief a redesign is built to, checked in code
 *   project-check.ts  the whole page, as it will be saved, before "done"
 *   scheme-edit.ts    the palette, changed where it lives
 *   project-state.ts  what the assistant remembers between messages
 *   create_section    a section of its own, compiled, kept, placed
 *
 * Driven against a scripted provider with the real schemas, the real
 * compiler and the real operation applier, so each check here is about what
 * the run actually does, not about what the prompt says it should.
 *
 * The browser check (visual-check.ts) is injected as a fake in the runs: it
 * needs Chromium. With CHROMIUM_PATH set, the last section runs the real one:
 * every built-in section must come out clean at both widths, and a section
 * that scrolls sideways and draws text over text must be caught.
 *
 * Run with:  npm run test:push
 */

import { themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult, type VisualCheckReport } from "@/lib/website-builder/agent/loop"
import { applyOps, buildSection, type ThemeOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { classifyIntent, intentGuidance, type IntentKind } from "@/lib/website-builder/agent/intent"
import { MAX_NEW_SECTIONS, extractJson, readCreativePlan } from "@/lib/website-builder/agent/creative-plan"
import { checkProject, THEME_FINDING } from "@/lib/website-builder/agent/project-check"
import { setColorScheme } from "@/lib/website-builder/agent/scheme-edit"
import { BRIEF_KEY, describeProject, readBrief, updateBrief } from "@/lib/website-builder/agent/project-state"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { composePageDocument } from "@/lib/website-builder/agent/page-document"
import { visualCheck } from "@/lib/website-builder/agent/visual-check"
import { ARCHETYPES, matchArchetypes } from "@/lib/storelib-ai/archetypes"
import { DESIGN_PATTERNS, patternById } from "@/lib/storelib-ai/patterns"
import { CREATIVE_EXAMPLE } from "@/lib/website-builder/agent/creative-section"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { agentRulesText, builderAgentRules } from "@/lib/agent-rules"
import { selectSkills } from "@/lib/agent-skills"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i

/* ── fixtures ─────────────────────────────────────────────────────────── */

const make = (id: string, type: string): SectionInstance => {
  const built = buildSection(id, type)
  if (!built) throw new Error(`no section type ${type}`)
  return built
}

/** A generic page: header, centred hero, feature cards, FAQ, CTA, footer. */
function genericPage(): ThemeState {
  return {
    sections: [
      make("header-1", "header"),
      make("hero-1", "hero_centered"),
      make("cards-1", "features_cards"),
      make("faq-1", "faq_accordion"),
      make("cta-1", "cta_simple"),
      make("footer-1", "footer"),
    ],
    settings: { brand_name: "Bandidos" },
  }
}

/** A section file of the model's own: the worked example under a new type. */
const POSTER = CREATIVE_EXAMPLE.replace('"type": "flag_feature"', '"type": "event_poster"').replace('"name": "Flag feature"', '"name": "Event poster"')
const BROKEN = POSTER.replace("</template>", "{% if settings.heading %}\n</template>")

type Step = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

function scripted(script: Step[], sent: ProviderRequest[]): AgentProvider {
  let n = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })))
      const step = script[n++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 },
        stop: toolCalls.length ? "tool_calls" : "done",
      }
    },
  }
}

function fakeCode(files: Record<string, string>) {
  return {
    files,
    read: (t: string) => files[`sections/${t}.storelib`] ?? (DEFAULT_THEME_SOURCES as Record<string, string>)[`sections/${t}.storelib`] ?? null,
    origin: (t: string) => (files[`sections/${t}.storelib`] ? ("own" as const) : (DEFAULT_THEME_SOURCES as Record<string, string>)[`sections/${t}.storelib`] ? ("builtin" as const) : ("product" as const)),
    async write(t: string, source: string, opts: { create?: boolean } = {}) {
      const path = `sections/${t}.storelib`
      if (opts.create && files[path]) return { ok: false as const, error: "exists" }
      files[path] = source
      return { ok: true as const }
    },
  }
}

async function drive(input: Partial<ThemeAgentInput> & { script: Step[]; prompt: string; state: ThemeState }) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  let id = 0
  const gen = themeAgent({
    provider: scripted(input.script, sent),
    model: "test",
    page: "home",
    addable: ADDABLE_SECTIONS,
    newId: (t) => `${t}-n${++id}`,
    ...input,
  } as ThemeAgentInput)
  for (;;) {
    const step = await gen.next()
    if (step.done === true) return { result: step.value as ThemeAgentResult, events, sent }
    events.push(step.value as ThemeAgentEvent)
  }
}

const userTexts = (sent: ProviderRequest[]) =>
  sent.flatMap((r) => r.turns.filter((t) => t.role === "user").map((t) => (t as { content: string }).content))

/** Every tool result, once: the last request replays all of them in order. */
const toolOutputs = (sent: ProviderRequest[]) =>
  (sent[sent.length - 1]?.turns ?? []).filter((t) => t.role === "tool").flatMap((t) => (t as { results: { output: string }[] }).results.map((x) => x.output))

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The kind of request is decided first, and errs toward preserving work")
  // ═══════════════════════════════════════════════════════════════════════
  const table: [string, Parameters<typeof classifyIntent>[1], IntentKind][] = [
    ["Make this whole website into a complete smooth modern interactive website for Bandidos, a bachata club and party.", { bodySections: 4 }, "FULL_SITE_REDESIGN"],
    ["Build me a premium dark website for selling a photography course. Editorial, minimal, image-heavy, not AI-looking.", { bodySections: 0 }, "NEW_SITE_GENERATION"],
    ["Build me a premium dark website for selling a photography course.", { bodySections: 4 }, "FULL_SITE_REDESIGN"],
    ["redesign everything", { bodySections: 4 }, "FULL_SITE_REDESIGN"],
    ["make this look like a real premium fashion brand website", { bodySections: 4 }, "FULL_SITE_REDESIGN"],
    ["build me a complete website", { bodySections: 4 }, "FULL_SITE_REDESIGN"],
    ["redesign the home page", { bodySections: 4 }, "PAGE_REDESIGN"],
    ["Make this section better.", { bodySections: 4, selected: true }, "SECTION_REDESIGN"],
    ["make the hero more premium", { bodySections: 4 }, "SECTION_REDESIGN"],
    ["Make the events part more aggressive and give it a countdown", { bodySections: 8, hasHistory: true }, "SECTION_REDESIGN"],
    ["make that button bigger", { bodySections: 4, hasHistory: true }, "STYLE_CHANGE"],
    ["the previous one was better", { bodySections: 4, hasHistory: true }, "LOCAL_EDIT"],
    ["change the heading to Summer drop", { bodySections: 4 }, "CONTENT_CHANGE"],
    ["add a pricing section", { bodySections: 4 }, "LOCAL_EDIT"],
    ["make the whole site darker", { bodySections: 4 }, "STYLE_CHANGE"],
    ["Give the FAQ a smoother opening animation", { bodySections: 4 }, "FUNCTIONAL_CHANGE"],
    ["what can you do?", { bodySections: 4 }, "QUESTION"],
    ["make the site look premium", { bodySections: 4, locked: true, selected: true }, "SECTION_REDESIGN"],
  ]
  for (const [prompt, ctx, kind] of table) {
    const got = classifyIntent(prompt, ctx)
    check(`"${prompt.slice(0, 60)}" is ${kind}`, got.kind === kind, got.kind)
  }
  const bandidos = classifyIntent(table[0][0], { bodySections: 4 })
  check("a new direction is planned and does not preserve structure", bandidos.plan && !bandidos.preserveStructure && bandidos.scope === "site")
  check("\"smooth\" and \"interactive\" make motion a requirement", bandidos.wantsMotion && bandidos.also.includes("FUNCTIONAL_CHANGE"))
  check("a small change preserves structure and is not planned", !classifyIntent("make that button bigger", { hasHistory: true }).plan && classifyIntent("make that button bigger", { hasHistory: true }).preserveStructure)
  const guide = intentGuidance(bandidos)
  check("the redesign guidance says the old sections are not worth preserving", /NOT worth preserving/.test(guide) && /remove weak or generic sections/.test(guide))
  check("and asks the designer's question before finishing", /would I choose this structure and this design/.test(guide))
  check("the local edit guidance preserves everything unrelated", /preserve everything unrelated/.test(intentGuidance(classifyIntent("add a pricing section"))))
  check("the guidance never names the labels to the creator", /never say these words to the creator/.test(guide))

  // ═══════════════════════════════════════════════════════════════════════
  section("The knowledge: archetypes and patterns that point at real things")
  // ═══════════════════════════════════════════════════════════════════════
  check("a bachata club is nightlife", matchArchetypes("Bandidos, a bachata club and party")[0]?.id === "nightlife")
  check("a photography course is a photographer site first, a course second", matchArchetypes("a premium website for selling a photography course").map((a) => a.id).join(",") === "photographer,course" || matchArchetypes("a premium website for selling a photography course").map((a) => a.id).join(",") === "course,photographer")
  const ids = new Set(DESIGN_PATTERNS.map((p) => p.id))
  const unknownPatterns = ARCHETYPES.flatMap((a) => a.architecture.map((line) => line.split(":")[0].split(/ or /).map((x) => x.trim()))).flat().filter((id) => !ids.has(id))
  check("every archetype's page is made of patterns that exist", unknownPatterns.length === 0, unknownPatterns.join(", "))
  const missingTypes = DESIGN_PATTERNS.flatMap((p) => p.builtIn.map((b) => b.type)).filter((t) => !ADDABLE_SECTIONS.includes(t))
  check("every pattern's built-in type is a type a page can add", missingTypes.length === 0, missingTypes.join(", "))
  const knowledgeText = JSON.stringify([ARCHETYPES, DESIGN_PATTERNS])
  check("no banned words and no em dash in the knowledge", !BANNED.test(knowledgeText.replace(/opacity and transform/g, "")) && !/—/.test(knowledgeText), (knowledgeText.match(BANNED) ?? [""])[0])

  // ═══════════════════════════════════════════════════════════════════════
  section("A plan is checked in code before anything is built to it")
  // ═══════════════════════════════════════════════════════════════════════
  const page = genericPage()
  const schemas = schemaMapFor({})
  const raw = {
    brand: { name: "Bandidos", tagline: "Bachata until late", logo: "a condensed wordmark" },
    archetype: "nightlife",
    purpose: "sell tickets to the next party",
    palette: { direction: "near black with a hot red", colors: { background: "#0b0b0f", accent: "#e11d48", text: "notacolour" } },
    typography: { heading: "Fraunces", body: "DM Sans" },
    sections: [
      { pattern: "hero_immersive", use: "new:bandidos_hero", content: "the party name huge" },
      { pattern: "marquee", use: "new:date_marquee" },
      { pattern: "event_spotlight", use: "new:next_party" },
      { pattern: "schedule", use: "new:party_schedule" },
      { pattern: "gallery", use: "media_collage" },
      { pattern: "faq", use: "keep:faq-1" },
      { pattern: "tickets", use: "keep:does-not-exist" },
      { pattern: "header", use: "header" },
      { pattern: "cta_final", use: "hero_made_up" },
    ],
    remove: ["hero-1", "cards-1", "cta-1", "header-1", "nope"],
  }
  const plan = readCreativePlan(raw, { state: page, schemas, addable: ADDABLE_SECTIONS, prompt: "bachata club" })!
  check("a plan reads", !!plan)
  check(`at most ${MAX_NEW_SECTIONS} sections of its own, the rest become a built-in type`, plan.sections.filter((s) => s.use.startsWith("new:")).length === MAX_NEW_SECTIONS && plan.sections.some((s) => s.pattern === "schedule" && !s.use.startsWith("new:")))
  check("a kept id that is not on the page becomes the pattern's built-in type", plan.sections.some((s) => s.pattern === "tickets" && s.use === "pricing_table"))
  check("a header is never a planned section", !plan.sections.some((s) => s.use === "header"))
  check("a type that does not exist becomes the pattern's built-in one", plan.sections.some((s) => s.pattern === "cta_final" && s.use === "cta_banner"))
  check("a font the theme cannot load is replaced, and the change is said", plan.typography.heading === "Bebas Neue" && plan.corrections.some((c) => /Fraunces/.test(c)))
  check("a colour that is not a colour is dropped", plan.palette.colors.text === undefined && plan.palette.colors.accent === "#e11d48")
  check("only real body sections can be removed", JSON.stringify(plan.remove) === JSON.stringify(["hero-1", "cards-1", "cta-1"]))
  check("JSON is read out of a fenced reply", (extractJson('Here:\n```json\n{"a":1}\n```') as { a: number }).a === 1)
  check("and a reply with no JSON is no plan", readCreativePlan(extractJson("I would build a hero."), { state: page, schemas, addable: ADDABLE_SECTIONS, prompt: "" }) === null)

  // ═══════════════════════════════════════════════════════════════════════
  section("The whole page is checked before a run may finish")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* A section file rewritten so a setting the page holds is no longer declared. */
    const own = POSTER
    const sources = { "sections/event_poster.storelib": own }
    const ownSchemas = schemaMapFor(sources)
    const poster = buildSection("poster-1", "event_poster", ownSchemas)!
    const before: ThemeState = { sections: [make("header-1", "header"), poster, make("footer-1", "footer")], settings: {} }
    const withoutHeading = own.replace(/\s*\{ "type": "text", "id": "heading", "label": "Heading", "default": "A heading about this" \},/, "").replace("{{ settings.heading }}", "")
    const after = { ...before, sections: before.sections.map((s) => (s.id === "poster-1" ? { ...s, settings: { ...s.settings, heading: "Bandidos" } } : s)) }
    const f1 = checkProject({ before, after, schemas: schemaMapFor({ "sections/event_poster.storelib": withoutHeading }), rewrittenTypes: ["event_poster"], touched: ["poster-1"], added: [] })
    check("a setting the rewritten schema no longer declares is caught", f1.some((f) => f.sectionId === "poster-1" && /"heading"/.test(f.message) && /schema/.test(f.message)), JSON.stringify(f1))
    const f2 = checkProject({ before, after, schemas: ownSchemas, rewrittenTypes: ["event_poster"], touched: ["poster-1"], added: [] })
    check("and the same page with the setting declared is clean", f2.length === 0, JSON.stringify(f2))

    const schemeBad = { ...after, sections: after.sections.map((s) => (s.id === "poster-1" ? { ...s, settings: { ...s.settings, color_scheme: "midnight" } } : s)) }
    check("a colour scheme the theme does not have is caught", checkProject({ before, after: schemeBad, schemas: ownSchemas, touched: ["poster-1"], added: [] }).some((f) => /"midnight"/.test(f.message)))
    const fontBad = { ...after, settings: { font_heading: "Comic Sans MS" } }
    check("a font the theme cannot load is caught", checkProject({ before, after: fontBad, schemas: ownSchemas, touched: [], added: [] }).some((f) => f.sectionId === THEME_FINDING && /Comic Sans MS/.test(f.message)))
    const assetBad = { ...after, sections: after.sections.map((s) => (s.id === "poster-1" ? { ...s, settings: { ...s.settings, portrait: "asset://made-up-hash" } } : s)) }
    check("a picture pointing at an upload nobody made is caught", checkProject({ before, after: assetBad, schemas: ownSchemas, touched: ["poster-1"], added: [] }).some((f) => /asset:\/\/made-up-hash/.test(f.message)))
    const placeholder = { ...after, sections: after.sections.map((s) => (s.id === "poster-1" ? { ...s, settings: { ...s.settings, portrait: "https://via.placeholder.com/600" } } : s)) }
    check("and a placeholder address", checkProject({ before, after: placeholder, schemas: ownSchemas, touched: ["poster-1"], added: [] }).some((f) => /placeholder/.test(f.message)))
    const untouchedBad = { ...before, sections: before.sections.map((s) => (s.id === "poster-1" ? { ...s, settings: { ...s.settings, legacy_thing: 1 } } : s)) }
    check("a fault somebody left before this run is not this run's to argue about", checkProject({ before: untouchedBad, after: untouchedBad, schemas: ownSchemas, touched: [], added: [] }).length === 0)
  }
  {
    const intent = classifyIntent("make this whole website into a site for Bandidos, a bachata club", { bodySections: 4 })
    const recoloured = { ...page, sections: page.sections.map((s) => (s.id === "hero-1" ? { ...s, settings: { ...s.settings, heading: "Bandidos" } } : s)) }
    const f = checkProject({ before: page, after: recoloured, schemas, touched: ["hero-1"], added: [], intent, plan: null })
    check("a redesign that kept the old page and changed its words is refused", f.some((x) => /old sections are still showing/.test(x.message)), JSON.stringify(f))
    const fp = checkProject({ before: page, after: recoloured, schemas, touched: ["hero-1"], added: [], intent, plan })
    check("against a plan: what is missing is named, in order", fp.some((x) => /The plan is not built yet/.test(x.message) && /bandidos_hero/.test(x.message)))
    check("and old sections not in the plan that still show are named", fp.some((x) => /still showing and are not in the plan/.test(x.message) && /hero-1/.test(x.message)))
    check("a small edit is never judged as a redesign", checkProject({ before: page, after: recoloured, schemas, touched: ["hero-1"], added: [], intent: classifyIntent("change the heading to Bandidos"), plan: null }).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The palette is set where it lives, and must be readable")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const state: ThemeState = { sections: [], settings: { color_schemes: { white: { name: "Light", background: "#ffffff" } } } }
    const ok = setColorScheme(JSON.stringify({ scheme: "night", name: "Night", colorsJson: JSON.stringify({ background: "#0b0b0f", text: "#d4d4d8", text_muted: "#a1a1aa", heading: "#fafafa", primary_button_background: "#e11d48", primary_button_text: "#ffffff", secondary_button_background: "transparent", secondary_button_text: "#fafafa", input_background: "#18181b", input_text: "#fafafa" }) }), state)
    const schemesAfter = ok.op?.kind === "update_theme" ? (ok.op.settings.color_schemes as Record<string, Record<string, string>>) : {}
    check("a new scheme is added", !!ok.op && schemesAfter.night?.background === "#0b0b0f", ok.output)
    check("and the schemes already there are kept, not replaced", schemesAfter.white?.name === "Light")
    check("its hovers are derived like the editor derives them", typeof schemesAfter.night?.primary_button_hover_background === "string" && schemesAfter.night.primary_button_hover_background !== "")
    const grey = setColorScheme(JSON.stringify({ scheme: "dark", name: "", colorsJson: JSON.stringify({ background: "#111111", text: "#333333" }) }), state)
    check("grey text on near black is refused, with the ratio", !grey.op && /text on the background is \d\.\d\d:1/.test(grey.output), grey.output)
    check("a key a scheme does not have is refused", !setColorScheme(JSON.stringify({ scheme: "dark", name: "", colorsJson: JSON.stringify({ glow: "#ffffff" }) }), state).op)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Memory: small, cleaned, and about what the page cannot say")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const dirty = readBrief({ [BRIEF_KEY]: { business: "Bandidos", roles: { "events-1": "events", "bad id!": "x" }, decisions: ["no gradients", 42], palette: { colors: { accent: "#e11d48", bad: "red" } } } })
    check("a stored brief is cleaned: bad ids, bad colours and non strings dropped", dirty.business === "Bandidos" && dirty.roles?.["events-1"] === "events" && !dirty.roles?.["bad id!"] && JSON.stringify(dirty.decisions) === JSON.stringify(["no gradients"]) && !dirty.palette?.colors?.bad)
    const state: ThemeState = { sections: [make("header-1", "header"), make("events-1", "promo_countdown"), make("footer-1", "footer")], settings: {} }
    const text = describeProject(state, dirty)
    check("the project state says what each section is for", /\[events-1\] is the events/.test(text) && /no gradients/.test(text))
    const next = updateBrief(dirty, { request: "give the events part a countdown", intent: classifyIntent("give the events part a countdown"), changed: ["Countdown Offer"], state, added: [], page: "home" })!
    check("each change is remembered, briefly", next.recent?.[next.recent.length - 1]?.request === "give the events part a countdown")
    check("nothing is written when nothing changed", updateBrief(dirty, { request: "what can you do?", intent: classifyIntent("what can you do?"), changed: [], state, added: [], page: "home" }) === null)
    let big = readBrief({})
    for (let i = 0; i < 40; i++) big = updateBrief(big, { request: `change ${i} `.repeat(20), intent: classifyIntent("x"), changed: ["Hero"], state, added: [], page: "home" })!
    check("it never grows past its size", JSON.stringify(big).length <= 8_000 && (big.recent?.length ?? 0) <= 6)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A full redesign, end to end: planned, rebuilt, checked, repaired, remembered")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const prompt = "Make this whole website into a complete smooth modern interactive website for Bandidos, a bachata club and party."
    const state = genericPage()
    const intent = classifyIntent(prompt, { bodySections: 4 })
    const planJson = {
      brand: { name: "Bandidos", tagline: "Bachata until late" },
      archetype: "nightlife",
      purpose: "sell tickets to the next party",
      palette: { direction: "near black with a hot red", colors: { background: "#0b0b0f", accent: "#e11d48" } },
      typography: { heading: "Bebas Neue", body: "DM Sans" },
      sections: [
        { pattern: "event_spotlight", use: "promo_countdown", content: "the next party" },
        { pattern: "gallery", use: "media_collage" },
        { pattern: "pricing", use: "pricing_table" },
        { pattern: "faq", use: "keep:faq-1" },
      ],
      remove: ["hero-1", "cards-1", "cta-1"],
    }
    const visualCalls: boolean[] = []
    const visualCheck = async (_s: ThemeState, _src: Record<string, string>, opts: { shots: boolean }): Promise<VisualCheckReport> => {
      visualCalls.push(opts.shots)
      return visualCalls.length === 1
        ? { findings: [{ sectionId: "promo_countdown-n1", width: 390, kind: "overflow", message: "a h2 sticks out 40px past the screen" }], shots: [{ mediaType: "image/jpeg", data: "AAAA" }], ms: 5 }
        : { findings: [], shots: [], ms: 5 }
    }
    const { result, events, sent } = await drive({
      prompt,
      state,
      intent,
      plan: true,
      memory: true,
      projectCheck: true,
      maxReviews: 3,
      maxTurns: 20,
      visualCheck,
      script: [
        { text: "```json\n" + JSON.stringify(planJson) + "\n```" },
        {
          text: "Building the Bandidos site from the plan.",
          calls: [
            ["set_color_scheme", { scheme: "black", name: "Night", colorsJson: JSON.stringify({ background: "#0b0b0f", heading: "#fafafa", text: "#d4d4d8", primary_button_background: "#e11d48", primary_button_text: "#ffffff" }) }],
            ["update_theme", { settingsJson: JSON.stringify({ font_heading: "Bebas Neue", font_body: "DM Sans" }) }],
            ["remove_section", { id: "hero-1" }],
            ["remove_section", { id: "cards-1" }],
            ["remove_section", { id: "cta-1" }],
            ["add_section", { sectionType: "promo_countdown", index: 1, settingsJson: JSON.stringify({ heading: "Saturday at Sala Luna" }) }],
          ],
        },
        /* It stops early: the plan is not built. The check must send it back. */
        { text: "Done." },
        {
          calls: [
            ["add_section", { sectionType: "media_collage", index: 2, settingsJson: JSON.stringify({ heading: "Saturday nights at Sala Luna" }) }],
            ["add_section", { sectionType: "pricing_table", index: 3, settingsJson: JSON.stringify({ heading: "Entry" }) }],
            ["update_block", { sectionId: "media_collage-n2", blockId: "media_collage-n2-b1", settingsJson: JSON.stringify({ alt: "Couples dancing bachata under red light" }) }],
            ["update_block", { sectionId: "pricing_table-n3", blockId: "pricing_table-n3-b1", settingsJson: JSON.stringify({ name: "Party only", price: "€15", summary: "From 22:00 until close." }) }],
          ],
        },
        { text: "Built it." },
        /* The browser found an overflow on the phone. */
        { calls: [["update_section", { id: "promo_countdown-n1", settingsJson: JSON.stringify({ heading: "Saturday" }) }]] },
        { text: "Rebuilt the site for Bandidos: a countdown to the next party, a gallery, tickets and the FAQ, on a near black palette." },
      ],
    })
    const users = userTexts(sent)
    check("the planner is called first, with no tools and its own instructions", sent[0].tools.length === 0 && /creative director/.test(sent[0].system))
    check("and is given the archetype for this kind of business", /NIGHTLIFE, DANCE CLUB OR PARTY/.test(users[0]))
    check("the plan is shown in the chat before any change", events.findIndex((e) => e.type === "plan") < events.findIndex((e) => e.type === "op"))
    check("the build turn carries the plan and the redesign guidance", /CREATIVE PLAN/.test(users[1]) && /NEW CREATIVE DIRECTION/.test(users[1]))
    check("stopping early is refused: the missing planned sections are named", users.some((u) => /The plan is not built yet/.test(u) && /media_collage/.test(u)))
    check("the page is drawn in a browser, with pictures the first time", visualCalls[0] === true)
    check("and what it found goes back to the model with the pictures", sent.some((r) => r.turns.some((t) => t.role === "user" && (t as { images?: unknown[] }).images?.length && /sticks out 40px/.test((t as { content: string }).content))))
    check("the run ends healthy", result.status === "succeeded" && (result.unresolved ?? []).length === 0, JSON.stringify(result.unresolved))
    const final = applyOps(state, result.ops)
    const types = final.sections.map((s) => s.type)
    check("the old generic sections are gone", !types.includes("hero_centered") && !types.includes("features_cards") && !types.includes("cta_simple"))
    check("the planned ones are on the page, in order", JSON.stringify(types) === JSON.stringify(["header", "promo_countdown", "media_collage", "pricing_table", "faq_accordion", "footer"]), types.join(","))
    check("the palette and the fonts were set where they live", (final.settings.color_schemes as Record<string, { background: string }>).black.background === "#0b0b0f" && final.settings.font_heading === "Bebas Neue")
    const memoryOp = events.find((e): e is Extract<ThemeAgentEvent, { type: "op" }> => e.type === "op" && e.op.kind === "update_theme" && BRIEF_KEY in (e.op as { settings: Record<string, unknown> }).settings)
    check("the project's memory is written at the end, as an ordinary operation", !!memoryOp)
    const memory = readBrief(memoryOp ? (memoryOp.op as { settings: Record<string, unknown> }).settings : {})
    check("and it knows what each new section is for", Object.values(memory.roles ?? {}).includes("Event spotlight") && memory.brand?.name === "Bandidos", JSON.stringify(memory.roles))
    check("the memory is not recorded as one of the run's changes", !result.ops.some((op) => op.kind === "update_theme" && BRIEF_KEY in op.settings))

    /* The next message, about the events part, sees that memory and the section it means. */
    const later: ThemeState = { sections: final.sections, settings: { ...final.settings, [BRIEF_KEY]: memory } }
    const second = await drive({
      prompt: "Make the events part more aggressive and give it a countdown",
      state: later,
      intent: classifyIntent("Make the events part more aggressive and give it a countdown", { bodySections: 4, hasHistory: true }),
      memory: true,
      projectCheck: true,
      script: [{ text: "Done." }],
    })
    const turn = userTexts(second.sent)[0]
    check("a follow up is told which section is the events part", /\[promo_countdown-n1\] is the Event spotlight/.test(turn), turn.slice(0, 600))
    check("and is a section redesign, not a new site", /ONE SECTION is to be rethought/.test(turn) && !/CREATIVE PLAN/.test(turn))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A section of its own: a compile error is repaired, then it is placed")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const files: Record<string, string> = {}
    const code = fakeCode(files)
    const state = genericPage()
    const { result, sent, events } = await drive({
      prompt: "add an event poster for Saturday",
      state,
      sources: {},
      code,
      projectCheck: true,
      script: [
        { calls: [["create_section", { sectionType: "event_poster", source: BROKEN, index: 1, settingsJson: "{}" }]] },
        { calls: [["create_section", { sectionType: "event_poster", source: POSTER, index: 1, settingsJson: JSON.stringify({ heading: "Saturday at Sala Luna", nope: 1 }) }]] },
        { calls: [["create_section", { sectionType: "event_poster", source: POSTER, index: 1, settingsJson: JSON.stringify({ heading: "Saturday at Sala Luna" }) }]] },
        { text: "Added an event poster for Saturday." },
      ],
    })
    const outs = toolOutputs(sent)
    check("the broken file is refused with the compiler's words and nothing is kept", /did not compile/.test(outs[0] ?? "") && /Nothing was saved/.test(outs[0] ?? ""), outs[0])
    check("a setting the new schema does not declare is refused before anything is kept", /no field called "nope"/.test(outs[1] ?? ""), outs[1])
    check("the third try is kept and placed", !!files["sections/event_poster.storelib"] && result.ops.some((op) => op.kind === "add_section" && op.sectionType === "event_poster"))
    check("its source reaches the editor before the section does", events.findIndex((e) => e.type === "code") < events.findIndex((e) => e.type === "op"))
    /* The editor applies the add with its schema lookup a render behind: the shipped section is what lands. */
    const inEditor = applyOps(state, result.ops)
    const placed = inEditor.sections.find((s) => s.type === "event_poster")
    check("the editor can place a type it has not learned yet", !!placed && placed.settings.heading === "Saturday at Sala Luna")
    check("and nothing else on the page moved", JSON.stringify(inEditor.sections.filter((s) => s.type !== "event_poster")) === JSON.stringify(state.sections))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("An invalid setting reference cannot survive to the end")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const files: Record<string, string> = { "sections/event_poster.storelib": POSTER }
    const code = fakeCode(files)
    const own = buildSection("poster-1", "event_poster", schemaMapFor(files))!
    own.settings.heading = "Saturday"
    const state: ThemeState = { sections: [make("header-1", "header"), own, make("footer-1", "footer")], settings: {} }
    const withoutHeading = POSTER.replace(/\s*\{ "type": "text", "id": "heading", "label": "Heading", "default": "A heading about this" \},/, "").replace('<h2 class="fx__h">{{ settings.heading }}</h2>', '<h2 class="fx__h">{{ settings.title }}</h2>').replace('{ "type": "text", "id": "text",', '{ "type": "text", "id": "title", "label": "Title", "default": "Title" },\n    { "type": "text", "id": "text",')
    const { result, sent } = await drive({
      prompt: "rename the heading setting to title",
      state,
      sources: { ...files },
      code,
      projectCheck: true,
      script: [
        { calls: [["update_section", { id: "poster-1", settingsJson: JSON.stringify({ align: "center" }) }]] },
        { calls: [["write_section_code", { sectionType: "event_poster", source: withoutHeading }]] },
        { text: "Renamed it." },
        { calls: [["update_section", { id: "poster-1", settingsJson: JSON.stringify({ title: "Saturday", heading: null }) }]] },
        { text: "Renamed the heading setting to title." },
      ],
    })
    const outs = toolOutputs(sent)
    check("a setting that does not exist is refused at the door, with the list", /has no field called "align"/.test(outs[0] ?? ""), outs[0])
    const told = userTexts(sent).find((u) => /BEFORE YOU FINISH/.test(u)) ?? ""
    check("after the code change, the page's leftover \"heading\" is found and handed back", /"heading"/.test(told) && /has no setting called that/.test(told), told.slice(0, 400))
    check("the stale value is moved and cleared, on the server and in the editor alike", !("heading" in (applyOps(state, result.ops).sections.find((x) => x.id === "poster-1")?.settings ?? {})) && applyOps(state, result.ops).sections.find((x) => x.id === "poster-1")?.settings.title === "Saturday")
    check("and the run only finishes once it is answered", result.status === "succeeded" && sent.length === 5, `${result.status} ${sent.length} ${JSON.stringify(result.unresolved)} ${toolOutputs(sent).join(" || ").slice(0, 900)}`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A small change stays small")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const state = genericPage()
    const { result, sent } = await drive({
      prompt: "change the heading to Summer drop",
      state,
      intent: classifyIntent("change the heading to Summer drop", { bodySections: 4 }),
      plan: true,
      memory: true,
      projectCheck: true,
      script: [
        { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Summer drop" }) }]] },
        { text: "Changed the hero heading to Summer drop." },
      ],
    })
    check("no plan is made for it", !sent.some((r) => r.tools.length === 0))
    const after = applyOps(state, result.ops)
    check("only the hero changed", after.sections.every((s, i) => s.id === "hero-1" || JSON.stringify(s) === JSON.stringify(state.sections[i])))
    check("and the theme's own settings are untouched", JSON.stringify(after.settings) === JSON.stringify(state.settings))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The page as a document a browser can measure")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const doc = composePageDocument(genericPage(), {}, schemas)
    check("every .storelib section on the page is drawn", ["hero-1", "cards-1", "faq-1", "cta-1"].every((id) => doc.drawn.includes(id)), doc.drawn.join(","))
    check("with the theme's own root and stylesheet", /data-storelib-theme/.test(doc.html) && /container-type:inline-size/.test(doc.html))
    check("and the product's own header and footer as stand-ins of their height", /data-check-standin="header"/.test(doc.html) && /data-check-standin="footer"/.test(doc.html))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Agents outside the builder read the same rules")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const outside = agentRulesText()
    check("MCP and GitHub agents are told to decide small change or new direction", /Small change or new direction/.test(outside) && /would a designer hired for this brief choose/.test(outside))
    check("and so is Storelib AI, in its own prompt", /SMALL CHANGE OR NEW DIRECTION:/.test(builderAgentRules()))
    check("a redesign request selects the redesign skill", selectSkills("make this whole website look like a real premium fashion brand")[0]?.id === "redesign-site")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The browser check, for real (needs CHROMIUM_PATH)")
  // ═══════════════════════════════════════════════════════════════════════
  if (!process.env.CHROMIUM_PATH) {
    console.log("  skip  no CHROMIUM_PATH: the real browser check was not run")
  } else {
    const library: ThemeState = { sections: ADDABLE_SECTIONS.map((t, i) => make(`${t}-${i}`, t)), settings: {} }
    const clean = await visualCheck({ state: library, sources: {}, shots: true, timeoutMs: 60_000 })
    check("every built-in section is drawn clean at 1440 and 390", !!clean && clean.findings.length === 0, JSON.stringify(clean?.findings.slice(0, 5)))
    check("and both photographs are taken", clean?.shots.length === 2 && clean.shots.every((x) => x.mediaType === "image/jpeg" && x.data.length > 1000))
    const wide = POSTER.replace(".fx__in { display: grid;", ".fx__in { min-width: 1900px; display: grid;")
    const sources = { "sections/event_poster.storelib": wide }
    const bad = await visualCheck({ state: { sections: [make("hero-1", "hero_centered"), buildSection("poster-1", "event_poster", schemaMapFor(sources))!], settings: {} }, sources, schemas: schemaMapFor(sources), timeoutMs: 60_000 })
    check("a section that scrolls the page sideways is caught at both widths", !!bad && bad.findings.filter((f) => f.sectionId === "poster-1" && f.kind === "overflow").length === 2, JSON.stringify(bad?.findings))
    check("and the section beside it is not blamed", !!bad && !bad.findings.some((f) => f.sectionId === "hero-1"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void patternById
void ({} as ThemeOp)
await main()
