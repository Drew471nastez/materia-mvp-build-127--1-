/**
 * ===========================================================================
 *  THE BUILDER'S AI, V ROUND: WHAT IT KNOWS, WHAT IT REFUSES, WHAT IT COSTS
 * ===========================================================================
 * Every check runs the real code against scripted models (no network):
 *
 *   the theme brief is read once per theme version, cached and bounded;
 *   a schema key Storelib does not read is refused, with the fix;
 *   a setting the markup never reads, and a heading or link label typed in,
 *   are refused;
 *   a layout that cannot fit a phone is refused before any browser looks;
 *   the repair loop fixes a refused file and then succeeds, and says plainly
 *   when it could not;
 *   a follow up changes the last section and nothing else;
 *   a landing page is N sections and a menu change, and one Undo step;
 *   the tool calls and tokens of two everyday runs stay inside a budget.
 *
 * Run with:  npx tsx tests/ai-quality-v.test.ts   (or npm run test:push)
 */
import { validateSection } from "@/lib/storelib-ai"
import { checkSchemaKeys } from "@/lib/storelib-ai/schema-keys"
import { checkSettingsCoverage } from "@/lib/storelib-ai/settings-coverage"
import { checkRenderedSection, checkResponsiveStructure, columnCount } from "@/lib/storelib-ai/structural"
import { describeThemeForAuthoring } from "@/lib/storelib-ai/theme-context"
import { MAX_BRIEF_CHARS, themeBrief, themeBriefStats, themeVersion } from "@/lib/website-builder/agent/theme-brief"
import { writeSection } from "@/lib/website-builder/agent/write-section"
import { themeAgent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { applyOp, buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { followUpTarget } from "@/lib/website-builder/agent/follow-up"
import { BRIEF_KEY, readBrief, updateBrief } from "@/lib/website-builder/agent/project-state"
import { CREATIVE_EXAMPLE, DESIGN_RUBRIC, reviewRequest } from "@/lib/website-builder/agent/creative-section"
import { checkSectionSource } from "@/lib/website-builder/agent/compile-feedback"
import { createUndoRun } from "@/lib/website-builder/undo-run"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import { FIXED_GRID, FIXED_WIDTH, GOOD, OWN_PATH, OWN_SOURCE, OWN_TYPE, codeFocusRun, codeStub, followUpRun } from "./_ai-quality-v-runs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]>; stop?: ProviderTurn["stop"] }
function scripted(script: Scripted[], sent: ProviderRequest[]): AgentProvider {
  let n = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })) as ProviderRequest)
      const step = script[n++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }, stop: step.stop ?? (toolCalls.length ? "tool_calls" : "done") }
    },
  }
}
async function drain(input: ThemeAgentInput): Promise<ThemeAgentResult> {
  const loop = themeAgent(input)
  for (;;) {
    const next = await loop.next()
    if (next.done) return next.value
  }
}
const userText = (r: ProviderRequest) => r.turns.filter((t) => t.role === "user").map((t) => String((t as { content?: unknown }).content ?? "")).join("\n")
const toolText = (r: ProviderRequest) => JSON.stringify(r.turns.filter((t) => t.role === "tool"))
const s = (id: string, type: string) => buildSection(id, type)!


const strict = (src: string, type = "good_list") => validateSection(src, { path: `sections/${type}.storelib`, expectType: type, strict: true })
const feedbackOf = (v: ReturnType<typeof validateSection>) => (v.ok === false ? (v as { feedback: string }).feedback : "")

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The theme brief: read once per theme version, cached, bounded")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const settings = { font_heading: "Fraunces", font_body: "Inter", button_shape: "rounded", button_border_radius: 6, page_width: 1200, animations_enabled: true, animation_style: "fade_up" }
    const input = { settings, sources: { [OWN_PATH]: OWN_SOURCE }, sections: [s("hero-1", "hero_centered"), s("grid-2", "product_grid")] }
    const before = themeBriefStats()
    const first = themeBrief(input)
    const again = themeBrief({ ...input, settings: { ...settings } })
    const after = themeBriefStats()
    check("the second read of an unchanged theme is the cached one", again === first && after.hits === before.hits + 1 && after.misses === before.misses + 1, JSON.stringify({ before, after }))
    check("a design change is a new version", themeVersion({ ...input, settings: { ...settings, button_border_radius: 12 } }) !== first.version)
    check("the AI's own notes are not a design change", themeVersion({ ...input, settings: { ...settings, [BRIEF_KEY]: { v: 1, decisions: ["no gradients"] } } }) === first.version)
    check("it says what the tokens are on this site", /TOKENS ON THIS SITE/.test(first.text) && /page width 1200px/.test(first.text) && /buttons /.test(first.text) && /Type scale, desktop\/phone: h1 \d+\/\d+px/.test(first.text), first.text)
    check("and the motion", /Theme entrance animation: on, fade_up/.test(first.text))
    check("and the sections the creator wrote, with their controls", new RegExp(`${OWN_TYPE} "`).test(first.text) && /controls/.test(first.text))
    check("and which sections on the page show the store", /show the store's products/.test(first.text))
    check("the fonts line is said at last (fonts are names, not { family })", /TYPE ON THIS SITE: heading Fraunces, body Inter/.test(describeThemeForAuthoring({ settings })), describeThemeForAuthoring({ settings }))
    check("and the buttons from the keys Theme settings saves", /BUTTONS ON THIS SITE: shape rounded, radius 6px/.test(describeThemeForAuthoring({ settings })))
    const many: Record<string, string> = {}
    for (let i = 0; i < 60; i++) many[`sections/own_${i}.storelib`] = OWN_SOURCE.replace(`"type": "${OWN_TYPE}"`, `"type": "own_${i}"`)
    const big = themeBrief({ settings, sources: many, sections: Array.from({ length: 200 }, (_, i) => s(`faq-${i}`, "faq_accordion")) })
    check(`bounded: 60 files and 200 sections stay under ${MAX_BRIEF_CHARS} characters`, big.text.length <= MAX_BRIEF_CHARS && /and 50 more/.test(big.text), `${big.text.length}`)
    for (let i = 0; i < 80; i++) themeBrief({ settings: { ...settings, page_width: 900 + i } })
    check("and the cache itself is bounded", themeBriefStats().size <= 64)

    /* The section writer is handed it. */
    const sent: ProviderRequest[] = []
    await writeSection({ provider: scripted([{ text: "REPLY: Which plans?" }], sent), model: "m", prompt: "a pricing section", takenTypes: [], takenNames: [], theme: { settings, sources: { [OWN_PATH]: OWN_SOURCE } } })
    check("the section writer reads the brief before the request", /TOKENS ON THIS SITE/.test(userText(sent[0])) && userText(sent[0]).indexOf("TOKENS ON THIS SITE") < userText(sent[0]).indexOf("REQUEST"))
    /* The page agent, where it can write code, is handed the part it was not already shown. */
    const pageSent: ProviderRequest[] = []
    const stub = codeStub({ [OWN_PATH]: OWN_SOURCE })
    await drain({ provider: scripted([{ text: "Nothing to change." }], pageSent), model: "m", prompt: "what fonts do I use?", state: { sections: [s("hero-1", "hero_centered")], settings }, page: "home", addable: ADDABLE_SECTIONS, code: stub.code, sources: { [OWN_PATH]: OWN_SOURCE } })
    check("the page agent with the code tools gets the tokens and the creator's own sections", /TOKENS ON THIS SITE/.test(userText(pageSent[0])) && /SECTIONS THE CREATOR WROTE/.test(userText(pageSent[0])))
    check("and not the colour schemes twice", !/COLOUR SCHEMES ON THIS SITE/.test(userText(pageSent[0])))
    const plainSent: ProviderRequest[] = []
    await drain({ provider: scripted([{ text: "Nothing to change." }], plainSent), model: "m", prompt: "what fonts do I use?", state: { sections: [s("hero-1", "hero_centered")], settings }, page: "home", addable: ADDABLE_SECTIONS })
    check("without the code tools it is not sent at all", !/TOKENS ON THIS SITE/.test(userText(plainSent[0])))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A schema key Storelib does not read is refused, with the fix")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a good section passes the strict gate", strict(GOOD).ok, feedbackOf(strict(GOOD)))
    const invented = GOOD.replace('"label": "Heading", "default": "What you get" }', '"label": "Heading", "default": "What you get", "required": true, "responsive_size": true }').replace('"name": "Good list",', '"name": "Good list",\n  "animations": { "entrance": "fade" },\n  "capabilities": ["network"],')
    const v = strict(invented)
    const fb = feedbackOf(v)
    check("invented keys are refused", v.ok === false && (v as { reason: string }).reason === "quality")
    check("each one named, where it is, as its own line", /"required"/.test(fb) && /"responsive_size"/.test(fb) && /"animations"/.test(fb) && fb.split("\n").filter((l) => l.startsWith("- ")).length >= 4, fb)
    check("with the fix in plain words", /never required: give it a default/.test(fb) && /"responsive": true/.test(fb) && /"id": "animation"/.test(fb))
    check("and a capability the sandbox does not have", /"network" is not a capability/.test(fb))
    check("a person saving in the code editor is not held to it", validateSection(invented, { path: "sections/good_list.storelib", expectType: "good_list" }).ok)
    const keyFindings = Object.entries(DEFAULT_THEME_SOURCES).filter(([p]) => p.startsWith("sections/")).flatMap(([p, src]) => checkSchemaKeys(src).map((f) => `${p}: ${f.id}`))
    check("every built-in section uses only keys Storelib reads", keyFindings.length === 0, keyFindings.slice(0, 4).join("; "))
    const anim = GOOD.replace('{ "type": "url", "id": "button_url", "label": "Button link" },', '{ "type": "url", "id": "button_url", "label": "Button link" },\n    { "type": "select", "id": "animation", "label": "Animation", "options": [{ "label": "Spin", "value": "spin" }, { "label": "Fade", "value": "fade" }], "default": "fade" },')
    check("an entrance animation the page cannot play is refused", /"spin", which the page has no animation for/.test(feedbackOf(strict(anim))), feedbackOf(strict(anim)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every setting drives the markup, and what the creator owns is a setting")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const unread = GOOD.replace('{ "type": "url", "id": "button_url", "label": "Button link" },', '{ "type": "url", "id": "button_url", "label": "Button link" },\n    { "type": "text", "id": "subheading", "label": "Subheading", "default": "Every week" },').replace('{ "type": "text", "id": "text", "label": "Text", "default": "A new lesson every Monday." }', '{ "type": "text", "id": "text", "label": "Text", "default": "A new lesson every Monday." },\n      { "type": "image_picker", "id": "icon", "label": "Icon" }')
    const fb = feedbackOf(strict(unread))
    check("a section setting the template never reads is refused", /"subheading" \(a text setting\) is in the sidebar, but the template never reads settings\.subheading/.test(fb), fb)
    check("and a block's", /The "item" block has a "icon" setting that the template never reads/.test(fb), fb)
    const typed = GOOD.replace("<h2 class=\"gd__h\">{{ settings.heading }}</h2>", "<h2 class=\"gd__h\">What you get</h2>").replace("{{ settings.button_label }}</a>", "See the plans</a>")
    const typedFb = feedbackOf(strict(typed))
    check("a heading typed into the markup is refused, with the setting to add", /The heading "What you get" is typed into the markup/.test(typedFb) && /"type": "text", "id": "heading"/.test(typedFb), typedFb)
    check("and a link whose address is a setting but whose words are typed", /The link "See the plans" takes its address from a setting/.test(typedFb))
    const editorOnly = GOOD.replace("<ul class=\"gd__list\">", "{% if section.blocks.size == 0 and page.in_editor %}<h3>Add your first item</h3>{% endif %}<ul class=\"gd__list\">")
    check("a line shown only in the editor is not the creator's copy", !checkSettingsCoverage(editorOnly).some((f) => f.id.startsWith("setting-missing")), JSON.stringify(checkSettingsCoverage(editorOnly)))
    check("a header's own interface words are not refused", !checkSettingsCoverage(typed, { frame: true }).some((f) => f.id.startsWith("setting-missing")))
    const builtIn = Object.entries(DEFAULT_THEME_SOURCES).filter(([p]) => p.startsWith("sections/")).flatMap(([p, src]) => checkSettingsCoverage(src).map((f) => `${p}: ${f.id}`))
    check("no built-in section has a setting it does not read, or copy typed in", builtIn.length === 0, builtIn.slice(0, 4).join("; "))
    check("the worked example the writer is shown passes every check", strict(CREATIVE_EXAMPLE, "flag_feature").ok, feedbackOf(strict(CREATIVE_EXAMPLE, "flag_feature")))
    /* An edit is refused only for what it adds. */
    const had = checkSectionSource({ path: "sections/good_list.storelib", type: "good_list", source: unread.replace("Every week", "Each week"), before: unread, strict: true })
    check("an edit to a file that already had an unread setting is not refused over it", had.ok, had.ok ? "" : (had as { feedback: string }).feedback)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A layout that cannot fit a phone is caught without a browser")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const fixed = GOOD.replace(/@container \(min-width: 760px\) \{[^\n]*\n/, "").replace(".gd__list { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; }", ".gd__list { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; width: 960px; grid-template-columns: repeat(3, 1fr); }")
    const found = checkResponsiveStructure(fixed.match(/<style scoped>([\s\S]*?)<\/style>/)![1])
    check("a 960px box with no rule for a narrow screen is an error", found.some((f) => f.id === "structure-fixed-width" && f.severity === "error"))
    check("and three columns at every width", found.some((f) => f.id === "structure-grid-columns" && /3 columns/.test(f.message) && /about 113px/.test(f.message)))
    check("the strict gate refuses it", strict(fixed).ok === false && /wider than a phone/.test(feedbackOf(strict(fixed))))
    check("and the three column grid alone (scripts/check-ai-structure-v.ts draws both at 390px)", strict(FIXED_GRID).ok === false && /about 113px wide/.test(feedbackOf(strict(FIXED_GRID))) && strict(FIXED_WIDTH).ok === false)
    check("the same layout inside @container is fine", checkResponsiveStructure(".a { display: grid; } @container (min-width: 760px) { .a { grid-template-columns: repeat(3, 1fr); width: 960px; } }").length === 0)
    check("columns from a setting count as many", columnCount("repeat({{ settings.columns }}, 1fr)") === Infinity && columnCount("repeat(auto-fit, minmax(200px, 1fr))") === 0 && columnCount("minmax(0, 1fr) 2fr") === 2)
    check("min(100%, 960px) is a width that shrinks", checkResponsiveStructure(".a { width: min(100%, 960px); }").length === 0)
    check("a container rule for something else does not excuse a fixed box", checkResponsiveStructure(".a { width: 980px; } .b { display: grid; } @container (min-width: 760px) { .b { grid-template-columns: 1fr 1fr; } }").some((f) => f.id === "structure-fixed-width"))
    check("one that sets that box again does", checkResponsiveStructure(".a { width: 980px; } @container (max-width: 760px) { .a { width: 100%; } }").length === 0)
    const shipped = Object.entries(DEFAULT_THEME_SOURCES).filter(([p]) => p.startsWith("sections/")).flatMap(([p, src]) => checkResponsiveStructure(src.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "").map((f) => `${p}: ${f.id}`))
    check("no built-in section has a layout that cannot fit a phone", shipped.length === 0, shipped.slice(0, 4).join("; "))
    const notes = checkRenderedSection({ html: '<section><h2>Hi</h2><img src="/a.jpg"></section>', css: ".x{}", schemaSettings: [{ type: "color_scheme", id: "color_scheme", default: "white" }, { type: "color", id: "heading_color", default: "#eeeeee" }], theme: {} })
    check("drawn: a picture with no size or alt, and a heading colour unreadable on its scheme, are noted", notes.some((n) => n.id === "render-image-size") && notes.some((n) => n.id === "render-image-alt") && notes.some((n) => /heading_color/.test(n.id) && /:1 on the "white" scheme/.test(n.message)), JSON.stringify(notes.map((n) => n.id)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Repair: a refused file is fixed and kept, and a run that cannot is honest")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const fixed = FIXED_WIDTH
    const sent: ProviderRequest[] = []
    const written = await writeSection({
      provider: scripted([{ text: "NAME: Good list\nELEMENTS:\n- a heading\n- a list\nBUILD: a split" }, { text: fixed }, { text: GOOD }, { text: "OK. The heading is the h2, the list is the ul." }], sent),
      model: "m",
      prompt: "a list of what members get",
      takenTypes: [],
      takenNames: [],
    })
    check("the writer is refused the fixed width and told why", /wider than a phone/.test(userText(sent[2])), userText(sent[2]).slice(-600))
    check("then keeps the repaired file", written.ok === true && (written as { value: { source: string } }).value.source === GOOD)
    check("after one plan, two writes and the review: four calls", sent.length === 4, `${sent.length}`)
    check("the review scores it against the design rubric", userText(sent[3]).includes(DESIGN_RUBRIC))
    check("and is told what the drawn section still shows", /THE CHECKS ALSO FOUND/.test(reviewRequest(null, false, ["A picture is drawn with no width"])))
    const never: ProviderRequest[] = []
    const gave = await writeSection({ provider: scripted([{ text: "NAME: Good list\nELEMENTS:\n- a list" }, { text: fixed }, { text: fixed }, { text: fixed }], never), model: "m", prompt: "a list", takenTypes: [], takenNames: [] })
    check("three refusals and the writer says it did not work", gave.ok === false && !(gave as { reply?: string }).reply, JSON.stringify(gave).slice(0, 200))

    /* The page agent: the code edit refused three times, nothing else done, and it claims it is done anyway. */
    const files = { [OWN_PATH]: OWN_SOURCE }
    const stub = codeStub(files)
    /* A width no narrow screen rule touches, in a file that has container rules for other things. */
    const bad = { sectionType: OWN_TYPE, edits: [{ find: "</style>", replace: ".v7-wide { width: 980px; }\n</style>" }] }
    const state: ThemeState = { sections: [s("header-0", "header"), { ...s("faq-1", "faq_accordion"), type: OWN_TYPE }, s("footer-2", "footer")], settings: {} }
    const lying = await drain({
      provider: scripted([{ calls: [["edit_section_code", bad]] }, { calls: [["edit_section_code", bad]] }, { calls: [["edit_section_code", bad]] }, { text: "The FAQ now has a wide four column layout." }], []),
      model: "m",
      prompt: "make the FAQ a wide four column grid",
      state,
      page: "home",
      addable: ADDABLE_SECTIONS,
      code: stub.code,
      sources: files,
      selectedSectionId: "faq-1",
    })
    check("a run whose only change never passed its checks is a failure", lying.status === "failed" && lying.ops.length === 0 && !lying.wroteCode, `${lying.status} ${lying.error}`)
    check("said in plain words, with what was wrong", /Nothing was saved/.test(lying.error ?? "") && /did not pass/.test(lying.error ?? "") && /wider than a phone|columns/.test(lying.error ?? ""), lying.error ?? "")
    check("and nothing was written to the file", stub.writes.length === 0)
    const partial = await drain({
      provider: scripted([{ calls: [["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "Questions before you buy" }) }], ["edit_section_code", bad]] }, { text: "Updated the FAQ." }], []),
      model: "m",
      prompt: "make the FAQ a wide grid and rename it",
      state,
      page: "home",
      addable: ADDABLE_SECTIONS,
      code: codeStub({ [OWN_PATH]: OWN_SOURCE }).code,
      sources: { [OWN_PATH]: OWN_SOURCE },
      selectedSectionId: "faq-1",
    })
    check("with other work done, the reply says what is still not right", partial.status === "succeeded" && /One thing is still not right: .*did not pass its checks/.test(partial.message), partial.message)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A follow up changes the last section, and nothing else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check('"make it cleaner" after a change is a follow up', classifyIntent("make it cleaner", { hasHistory: true, bodySections: 3 }).followUp)
    check('so are "change the layout" and "add more settings"', classifyIntent("change the layout", { hasHistory: true }).followUp && classifyIntent("add more settings", { hasHistory: true }).followUp)
    check("and its kind stays what the words say", classifyIntent("make it cleaner", { hasHistory: true }).kind === "STYLE_CHANGE")
    check("a first message is not", !classifyIntent("make it cleaner", { hasHistory: false }).followUp)

    const { result, sent, numbers } = await followUpRun()
    const first = userText(sent[0])
    check("the run is shown the last section in full and told it is about it", /THIS MESSAGE IS ABOUT YOUR LAST CHANGE, to .*\[testimonials-new-1\]/.test(first) && /CONTROLS THIS SECTION HAS/.test(first))
    const touched = new Set(result.ops.flatMap((op) => ("id" in op ? [op.id] : "sectionId" in op ? [op.sectionId] : [])))
    check("only that section changed", touched.size === 1 && touched.has("testimonials-new-1"), [...touched].join(","))
    check("the write to the hero was refused, in words about the follow up", /This message follows your last change, to .*\[testimonials-new-1\]/.test(toolText(sent[1])), toolText(sent[1]).slice(0, 400))
    check("and the run succeeded in two calls", result.status === "succeeded" && numbers.calls === 2, `${result.status} ${numbers.calls}`)

    const brief = { v: 1 as const, recent: [{ request: "add a testimonials section", kind: "LOCAL_EDIT", changed: ["Testimonials"], ids: ["t-1"] }] }
    const sections = [s("hero-1", "hero_centered"), { ...s("t-1", "testimonials") }]
    const intent = classifyIntent("make it cleaner", { hasHistory: true })
    check("the target is the section the last run changed", followUpTarget({ intent, prompt: "make it cleaner", brief, sections })?.id === "t-1")
    check("not when the message reaches wider", !followUpTarget({ intent: classifyIntent("make the whole page cleaner", { hasHistory: true }), prompt: "make the whole page cleaner", brief, sections }))
    check("not when it names another section", !followUpTarget({ intent: classifyIntent("make the hero cleaner", { hasHistory: true }), prompt: "make the hero cleaner", brief, sections }))
    check("not when a section is selected", !followUpTarget({ intent, prompt: "make it cleaner", brief, sections, selectedSectionId: "hero-1" }))
    const next = updateBrief(readBrief({}), { request: "add a testimonials section", intent: classifyIntent("add a testimonials section"), changed: ["Testimonials"], state: { sections, settings: {} }, added: ["t-1"], page: "home", ids: ["t-1"], decided: "One large quote, two small beside it." })!
    check("the memory keeps which section, and what was decided", JSON.stringify(readBrief({ [BRIEF_KEY]: next }).recent?.[0]) === JSON.stringify({ request: "add a testimonials section", kind: "LOCAL_EDIT", changed: ["Testimonials"], ids: ["t-1"], decided: "One large quote, two small beside it." }))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A landing page: N sections and the menu, as one Undo step")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const prompt = "Redesign this page as a landing page for my yoga course"
    const state: ThemeState = { sections: [s("header-1", "header"), s("hero-1", "hero_centered"), s("cta-1", "cta_simple"), s("footer-1", "footer")], settings: { brand_name: "Still Yoga" } }
    const intent = classifyIntent(prompt, { bodySections: 2 })
    const planJson = {
      brand: { name: "Still Yoga", tagline: "Ten weeks to a daily practice" },
      archetype: "course",
      palette: { direction: "warm white with a deep green", colors: { background: "#fbfaf7", text: "#2b2b2b", heading: "#1f3d2b", accent: "#1f3d2b", button: "#1f3d2b", button_text: "#ffffff" } },
      typography: { heading: "Fraunces", body: "Inter" },
      sections: [
        { pattern: "hero_split", use: "hero_centered" },
        { pattern: "features", use: "features_grid" },
        { pattern: "pricing", use: "pricing_table" },
        { pattern: "faq", use: "faq_accordion" },
      ],
      remove: ["hero-1", "cta-1"],
    }
    const sent: ProviderRequest[] = []
    const result = await drain({
      provider: scripted(
        [
          { text: JSON.stringify(planJson) },
          { text: "Linking the pricing.", calls: [["edit_menu", { menu: "main-menu", action: "add", link: "", title: "Pricing", url: "/#pricing", index: -1 }]] },
          { text: "Built the landing page." },
        ],
        sent,
      ),
      model: "m",
      prompt,
      state,
      page: "home",
      addable: ADDABLE_SECTIONS,
      intent,
      plan: true,
      maxReviews: 0,
      newId: (() => {
        let n = 0
        return (t: string) => `${t}-n${++n}`
      })(),
    })
    const adds = result.ops.filter((op) => op.kind === "add_section").length
    const menu = result.ops.some((op) => op.kind === "update_theme" && "menus" in op.settings)
    check(`"this page as a landing page" is this page rethought, not the whole site (${intent.kind})`, intent.kind === "PAGE_REDESIGN" && intent.plan)
    check("while the whole site still reads as the site", classifyIntent("Redesign my website as a landing page for my yoga course", { bodySections: 2 }).kind === "FULL_SITE_REDESIGN")
    check("the planned sections are built: one add per planned section", adds === planJson.sections.length, `${adds}`)
    check("and the Main menu links to it", menu)
    let final = state
    for (const op of result.ops) final = applyOp(final, op)
    check("the page is the plan, in order, between the header and footer", JSON.stringify(final.sections.map((x) => x.type)) === JSON.stringify(["header", "hero_centered", "features_grid", "pricing_table", "faq_accordion", "footer"]), final.sections.map((x) => x.type).join(","))

    /* The editor, applying the run's operations as they stream, seconds apart. */
    let clock = 0
    let steps = 0
    const run = createUndoRun(() => steps++, 500, 600_000, () => clock)
    steps++ /* startAiRun: the snapshot before the run */
    run.hold()
    for (const _op of result.ops) {
      clock += 3_000
      run.aiStep()
    }
    run.release()
    check(`${result.ops.length} operations over ${clock / 1000}s are one Undo step`, steps === 1, `${steps}`)
    let oldSteps = 0
    const old = createUndoRun(() => oldSteps++, 500, 600_000, () => clock)
    /* Before: no hold, and a real clock between turns would end the quiet window each time. */
    for (const _op of result.ops) {
      old.end()
      old.step()
    }
    check("where without the hold each streamed turn was a step of its own", oldSteps === result.ops.length)
    run.aiStep()
    check("after the run, the assistant's next change is a step of its own", steps === 2)
    let held = 0
    const stuck = createUndoRun(() => held++, 500, 1_000, () => clock)
    stuck.hold()
    clock += 2_000
    stuck.aiStep()
    check("a hold whose run was never heard ending lapses", held === 1 && !stuck.held())
    let byHand = 0
    const during = createUndoRun(() => byHand++, 500, 600_000, () => clock)
    during.hold()
    during.step()
    check("and a person's own edit during a run is always a step", byHand === 1 && during.held())
    during.end()
    check("and the history moving (Undo, a page change) ends the hold", !during.held())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What two everyday runs cost: calls, tool calls and tokens")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /*
      Measured before this round with the same scripted models
      (scripts/measure-ai-quality-v.ts): the code edit took 3 model calls,
      2 tool calls and ~75,000 input tokens (read_section_code first, then
      the edit); the follow up 3 calls, 3 tool calls and ~65,700 tokens, and
      it changed the hero as well. Now the open file goes with the request
      and the follow up is shown its section in full.
    */
    const code = await codeFocusRun()
    check("the code edit: two model calls, one tool call", code.numbers.calls === 2 && code.numbers.toolCalls === 1, JSON.stringify(code.numbers))
    check("no read of a file that was sent with the request", !code.sent.some((r) => r.turns.some((t) => t.role === "assistant" && (t.toolCalls ?? []).some((c) => c.name === "read_section_code"))))
    check("and the edit is kept", code.result.status === "succeeded" && code.writes.length === 1 && /v7-slide/.test(code.writes[0].source))
    check("inside the token budget (~75,000 before)", code.numbers.inputTokens <= 60_000, `${code.numbers.inputTokens}`)
    const follow = await followUpRun()
    check("the follow up: two model calls, two tool calls (one refused)", follow.numbers.calls === 2 && follow.numbers.toolCalls === 2, JSON.stringify(follow.numbers))
    check("inside the token budget (~65,700 before)", follow.numbers.inputTokens <= 50_000, `${follow.numbers.inputTokens}`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
