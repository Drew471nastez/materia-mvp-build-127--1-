/**
 * ===========================================================================
 *  THE BRAIN OF EVERY AI THAT BUILDS A STORELIB SITE, WITHOUT A MODEL
 * ===========================================================================
 * Ask Storelib in the builder, and Claude Code or Codex over MCP and GitHub,
 * are "trained" by what they are sent: the rulebook, the skills, the context
 * and the checks. Nothing here calls a model. The builder agent is run
 * against a scripted provider that records every request it would have sent,
 * and the assertions are about those requests:
 *
 *   one rulebook, versioned, the same on every surface;
 *   skills chosen by intent, short, and reading the docs rather than copies;
 *   the context a request needs is in it, and what it does not need is not;
 *   the questions policy, enforced in code as well as said;
 *   token budgets, so a prompt cannot grow unnoticed;
 *   progress events at each real step, in order;
 *   a patch to a file instead of the whole file;
 *   the image content block each provider reads;
 *   the product data API, the product page, and checkout's way back to the
 *   creator's own site, which is never an open redirect.
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  AGENT_RULE_GROUPS,
  RULEBOOK_VERSION,
  agentRulesBrief,
  agentRulesText,
  builderAgentRules,
  ruleGroupsFor,
} from "@/lib/agent-rules"
import { SKILLS, selectSkills, skillContext, skillsForRequest } from "@/lib/agent-skills"
import { docSection } from "@/lib/developers/doc-sections"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { buildSection, describeStore, type StoreFacts, type ThemeState } from "@/lib/website-builder/agent/operations"
import { applySourceEdits } from "@/lib/website-builder/agent/code-edits"
import { readAsk, questionText, MAX_BUILDER_ASKS } from "@/lib/website-builder/agent/ask"
import { describeRecent, lastQuestion } from "@/lib/website-builder/agent/memory"
import { copyProblem, reviewSections } from "@/lib/website-builder/agent/review"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { ENGINES, STRENGTHS } from "@/lib/website-builder/ask-engines"
import { requestMessages, toMessages } from "@/lib/sites/agent/anthropic-provider"
import { toInput } from "@/lib/sites/agent/openai-provider"
import { describeImages, reviewImages, type AgentImage } from "@/lib/sites/agent/attachments"
import { imageInfo } from "@/lib/sites/agent/image-info"
import { checkoutReturnTarget, paidReturnUrl, returnHostLabel } from "@/lib/checkout/return-url"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { checkoutHrefWithOrigin } from "@/lib/orders/checkout-origin"
import { toCard, toProductPage, type VariantRow } from "@/lib/website-builder/shop-products"
import { renderStorelibSection, withPageProduct } from "@/lib/website-builder/storelib-runtime"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { briefFrom } from "@/lib/agent-access/site-brief"
import { handleMcp, PROJECT_TOOLS, TOOLS, type BoundOps } from "@/lib/agent-access/mcp"
import { agentsGuide, CLAUDE_MD } from "@/lib/github-sync/core"
import { checkSectionQuality, qualityErrors, validateSection } from "@/lib/storelib-ai"
import { compileSection } from "@/lib/storelib-theme"
import { DEVELOPER_EXAMPLES } from "@/lib/developers/content.generated"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** The estimate scripts/measure-agent-tokens.ts reports: four characters a token. */
const tokens = (s: string) => Math.ceil(s.length / 4)
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i

/* ── a scripted model, recording what it was sent ─────────────────────── */

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

function scripted(script: Scripted[], sent: ProviderRequest[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })) as ProviderRequest)
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `toolu_${turn}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [
          ...(step.text ? [{ type: "text", text: step.text }] : []),
          ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) })),
        ],
        usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
        stop: toolCalls.length ? "tool_calls" : "done",
      }
    },
  }
}

function page(): ThemeState {
  const types = ["header", "hero_centered", "product_grid", "faq_accordion", "footer"]
  return {
    sections: types.map((t, i) => buildSection(`${t}-${i}`, t)!).filter(Boolean),
    settings: { brand_name: "Northlight Presets", heading_font: "Inter", body_font: "Inter", button_style: "solid", custom_css: "" },
  }
}

const STORE: StoreFacts = {
  storeName: "northlight",
  live: true,
  totalProducts: 3,
  publishedProducts: 3,
  address: "https://northlight.storelib.com",
  products: [
    { id: "p1", title: "Film Presets Vol. 1", type: "digital", priceCents: 2900, published: true, url: "/products/film-presets", compareAtCents: 3900 },
    { id: "p2", title: "Portrait Pack", type: "digital", priceCents: 3900, published: true, url: "/products/portrait-pack", options: [{ name: "Personal", priceCents: 3900 }, { name: "Commercial", priceCents: 7900 }] },
    { id: "p3", title: "Editing Course", type: "course", priceCents: 12900, published: true, url: "/products/editing-course" },
  ],
}
const ONE_PRODUCT: StoreFacts = { ...STORE, totalProducts: 1, publishedProducts: 1, products: [STORE.products[0]] }

async function run(prompt: string, script: Scripted[], extra: Partial<Parameters<typeof themeAgent>[0]> = {}) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  let n = 0
  let storeReads = 0
  const loop = themeAgent({
    provider: scripted(script, sent),
    model: "test",
    prompt,
    state: page(),
    page: "home",
    addable: ADDABLE_SECTIONS,
    readStore: async () => {
      storeReads++
      return STORE
    },
    newId: (t) => `${t}-new-${++n}`,
    ...extra,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done === true) return { sent, events, result: step.value, storeReads: () => storeReads }
    events.push(step.value as ThemeAgentEvent)
  }
}

/* Headers only: enough for a picture's size to be read. */
function b64(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64")
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16be = (n: number) => [(n >> 8) & 255, n & 255]
const u16le = (n: number) => [n & 255, (n >> 8) & 255]
const u24le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]
const png = (w: number, h: number): AgentImage => ({ mediaType: "image/png", data: b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]) })
const jpeg = (w: number, h: number): AgentImage => ({
  mediaType: "image/jpeg",
  data: b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, ...u16be(h), ...u16be(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0, 0]),
})
const gif = (w: number, h: number): AgentImage => ({ mediaType: "image/gif", data: b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16le(w), ...u16le(h), 0, 0, 0, 0]) })
const webp = (w: number, h: number): AgentImage => ({
  mediaType: "image/webp",
  data: b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1), 0, 0]),
})

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("One rulebook, versioned, read by every agent")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ids = AGENT_RULE_GROUPS.map((g) => g.id)
    for (const id of ["context", "questions", "commerce", "images", "copy", "accessibility", "performance", "economy", "design", "responsive", "security"]) {
      check(`the rulebook has ${id}`, ids.includes(id))
    }
    const full = agentRulesText()
    const builder = builderAgentRules()
    check("it carries its version on every surface", full.includes(RULEBOOK_VERSION) && builder.includes(RULEBOOK_VERSION) && agentsGuide({ siteName: "A", branch: "main", root: "" }).includes(RULEBOOK_VERSION))
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const whole = (rule: string) => new RegExp(rule.split(/storelib_[a-z_]+/).map(escape).join(".+?"))
    check("the builder reads every group meant for it, whole, tool names swapped for its own", ruleGroupsFor("builder").every((g) => builder.includes(`${g.title.toUpperCase()}:`) && g.rules.every((r) => whole(r).test(builder))))
    check("and the groups about connections and files are for the agents outside it", !builder.includes("EDITING BOUNDARIES:") && agentRulesText().includes("## Editing boundaries"))
    check("and the same rules for the groups both share, word for word", ruleGroupsFor("builder").filter((g) => g.rules.every((r) => !/storelib_/.test(r))).every((g) => g.rules.every((r) => builder.includes(r))))
    check("the builder's copy names its own tools, never the MCP ones", !/storelib_[a-z_]+/.test(builder))
    check("context first: never guess what is on a page", /Never guess what is on a page/.test(full) && /Never guess what is on a page/.test(builder))
    check("the questions policy is one question with options, only when nothing answers it", /one short question with two to four options/.test(full) && /Never ask what the page, the theme, the store or the conversation already answers/.test(full))
    check("commerce names the product fields and the buy link", /checkout_url/.test(full) && /page\.product/.test(full) && /sends the buyer back to this site/.test(full))
    check("a picture is the brief for layout, never a source of another brand's words", /brief for layout, hierarchy and style/.test(full) && /Never copy another brand's words, logo/.test(full))
    check("accessibility names contrast, alt text, heading order and focus", /4\.5:1/.test(full) && /alt text/.test(full) && /Headings go in order/.test(full) && /focus-visible/.test(full))
    check("performance names sizes, lazy loading and layout shift", /aspect-ratio/.test(full) && /loading="lazy"/.test(full) && /No layout shift/.test(full))
    check("economy names patches and the step budget", /storelib_patch_section/.test(full) && /step budget/.test(full))
    const withoutTheList = full.replace(/Never write unlock[^.]*\./, "").replace(/opacity and transform/g, "")
    check("no banned word outside the one sentence that lists them", !BANNED.test(withoutTheList), (withoutTheList.match(BANNED) ?? [""])[0])
    check("no em dash anywhere an agent reads", !/—/.test(full + builder + agentRulesBrief({ siteName: "A", agentName: "B" })))
    const brief = agentRulesBrief({ siteName: "Astrid", agentName: "Codex" })
    check("the MCP brief asks rather than guesses, and stays short", /ASK, DON'T GUESS/.test(brief) && brief.length < 2_200, `${brief.length}`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The trainer: skills chosen by intent, short, reading the docs")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ids = SKILLS.map((s) => s.id)
    for (const id of ["selling", "schema-design", "image-to-section", "copywriting", "accessibility", "performance", "questions", "edit-section"]) {
      check(`there is a ${id} skill`, ids.includes(id))
    }
    check("every skill is short: six steps and four pitfalls at most", SKILLS.every((s) => s.steps.length <= 6 && s.pitfalls.length <= 4), SKILLS.filter((s) => s.steps.length > 6 || s.pitfalls.length > 4).map((s) => s.id).join(","))
    const pick = (text: string, opts = {}) => selectSkills(text, opts).map((s) => s.id)
    check("a product page with buy buttons is the selling skill", pick("build a product page with buy buttons for my presets").includes("selling"))
    check("a punchier headline is copywriting", pick("make the headline punchier").includes("copywriting"))
    check("letting the creator choose the columns is schema design", pick("let me choose how many columns it has").includes("schema-design"))
    check("a slow page whose pictures jump is performance", pick("the page loads slowly and the images jump").includes("performance"))
    check("which product to feature is the questions skill", pick("feature my product in the hero, not sure which").includes("questions"))
    check("an attached picture is the image skill, first, whatever the words", pick("", { images: true })[0] === "image-to-section" && pick("make it like this", { images: true })[0] === "image-to-section")
    const mcp = skillsForRequest("add a buy button for my preset pack")
    check("an MCP agent's selling skill quotes the docs, not a copy of them", mcp.includes(docSection("selling", "Buy buttons and checkout")) && /block\.settings\.checkout_url/.test(mcp))
    check("and the docs sections it names exist", SKILLS.every((s) => (s.docs ?? []).every((d) => docSection(d.page, d.heading) !== "")))
    check("the builder gets short notes: a headline edit carries almost nothing", tokens(skillContext("make the headline shorter")) <= 150, `${tokens(skillContext("make the headline shorter"))}`)
    check("and a request that matches nothing carries nothing", skillContext("hello there") === "")
    check("a product request in the builder carries its notes and no template reference", /read_store lists each product/.test(skillContext("show my products")) && !/STORELIB REFERENCE/.test(skillContext("show my products")))
    check("a code request in the builder carries the reference it writes against", /STORELIB REFERENCE/.test(skillContext("make the accordion animation smoother")))
    const skillWords = SKILLS.map((s) => [s.summary, ...s.steps, ...s.pitfalls, ...(s.builder ?? [])].join(" ")).join(" ").replace(/opacity and transform/g, "")
    check("no banned words or em dashes in the skills", !BANNED.test(skillWords) && !/—/.test(skillWords), (skillWords.match(BANNED) ?? [""])[0])
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What Ask Storelib is sent, for fixture requests")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const { sent } = await run("make the headline shorter", [{ calls: [["update_section", { id: "hero_centered-1", settingsJson: JSON.stringify({ heading: "Film looks for real shoots" }) }]] }, { text: "Shortened the hero headline." }], { selectedSectionId: "hero_centered-1" })
    const first = sent[0]
    check("the system prompt carries the builder's rules and the shared rulebook", first.system.includes(builderAgentRules()) && first.system.includes(RULEBOOK_VERSION))
    check("and the rule to ask only what cannot be read", /ASK ONLY WHAT YOU CANNOT READ/.test(first.system))
    check("it is the same text on every turn, so it is cached", sent.every((r) => r.system === first.system))
    const tools = first.tools.map((t) => t.name)
    check("ask_creator is offered, last, so the tools before it keep their cached place", tools[tools.length - 1] === "ask_creator")
    check("every tool is strict-shaped: required and no extra properties", first.tools.every((t) => (t.parameters as { additionalProperties?: boolean }).additionalProperties === false && Array.isArray((t.parameters as { required?: unknown }).required)))
    const turn = first.turns[0] as { content: string }
    check("the first turn has the page, the house style, the settings, the selection and the request", /PAGE: home/.test(turn.content) && /THEME SETTINGS/.test(turn.content) && /SELECTED AND OPEN/.test(turn.content) && /REQUEST\nmake the headline shorter/.test(turn.content))
    check("the theme settings are compact, not pretty-printed", !/THEME SETTINGS\n\{\n  "/.test(turn.content) && /THEME SETTINGS\n\{"brand_name":"Northlight Presets"/.test(turn.content))
    check("and an empty setting is not sent", !/"custom_css"/.test(turn.content))
    check("a headline is about the business, so the store is read for it, once", /STORE, read for you just now/.test(turn.content) && /Film Presets Vol\. 1 \[id p1, \/products\/film-presets\]/.test(turn.content))
    /*
      The system prompt grew by the section framework, a checklist and two
      built-in sections (lib/storelib-ai/reference.ts, pageAgentReference),
      about 5.6k tokens of stable text that is cached and read at a tenth of
      the price on every turn after the first. The budget grows by that and
      no more; tests/ai-reference.test.ts holds the reference to its own.
      12,300 until the header rule said to connect to the built-in header
      (and when a section of kind header is right), and the shared rules said
      which type a picture, a menu and a colour per element are: about 550
      tokens, the cost of an AI that stops coding a second header.
      13,400 when the U round told it what a section can draw (inline SVG,
      keyframes, layers, a photo slot) and to read a picture closely
      (lib/website-builder/agent/creative-section.ts, CREATIVE_BRIEF and
      IMAGE_FIDELITY_RULES): about 400 tokens of cached text, the cost of a
      flag that is drawn instead of left out. The T rounds had already put
      it at 12,905. ask_creator's picture fields: about 170 on the tools.
      13,600 with the rule that the header's navigation is the Main menu
      (edit_menu, never nav_link blocks), and read_menus and edit_menu add
      about 400 to the tools. Tools 6,000: with every T and U round tool
      merged (copy_section_to_code, read_menus, edit_menu, the picture
      fields) they measured 5,935.
      14,000 with the rulebook's "Small change or new direction" group, the
      rule every agent reads before deciding how much of a site may change
      (lib/agent-rules, scope): about 300 tokens, cached. Tools 6,400:
      set_color_scheme, read_design_patterns and read_storelib_docs add
      about 300 to a list main already measured at the old 6,000 once the
      cookie banner and the branded intro joined Theme settings.
    */
    /* System 14,000 until round 25: the build recipe says when to write a section of its own, and the reference it carries quotes sections that read more of the theme (about 150 tokens). */
    /* Tools 6,450 since Storelib Reviews: its four sections (reviews_product, reviews_badge, reviews_carousel, reviews_all) are in the list of section types the tools name, about 5 tokens. */
    /* Tools 6,600: update_theme names the settings the sidebar writes outside the schema (typography_styles, the phone logo, default_color_scheme) and set_color_scheme its gradient, about 105 tokens (agent/theme-extras.ts). */
    check("the first request stays inside its budget", tokens(first.system) <= 14_200 && tokens(JSON.stringify(first.tools)) <= 6_600 && tokens(turn.content) <= 2_000, `system ${tokens(first.system)}, tools ${tokens(JSON.stringify(first.tools))}, turn ${tokens(turn.content)}`)
    check("every request carries a cache breakpoint on its last block, so the transcript is read back cheaply", sent.every((r) => {
      const msgs = requestMessages(r.turns) as Array<{ content: unknown }>
      const last = msgs[msgs.length - 1].content as Array<{ cache_control?: unknown }>
      return Array.isArray(last) && !!last[last.length - 1].cache_control
    }))
    check("and toMessages itself keeps the plain shape the providers' tests pin", typeof toMessages([{ role: "user", content: "Hello" }])[0].content === "string")
    const anthropicSource = read("lib/sites/agent/anthropic-provider.ts")
    check("the provider sends requestMessages, beside the system block's own breakpoint", /messages: requestMessages\(request\.turns\)/.test(anthropicSource) && /text: request\.system,\s*cache_control: \{ type: "ephemeral" as const \}/.test(anthropicSource))
  }
  {
    const { sent, storeReads } = await run("move the FAQ up one place", [{ calls: [["move_section", { id: "faq_accordion-3", index: 2 }]] }, { text: "Moved the FAQ up one place." }])
    check("a layout request is not about the business: no store read, no store text", storeReads() === 0 && !/STORE, read for you/.test((sent[0].turns[0] as { content: string }).content))
  }
  {
    const history = [
      { role: "user" as const, content: "make the hero sell one product" },
      { role: "assistant" as const, content: "Which product should the hero show?\n- Film Presets Vol. 1\n- Portrait Pack", changed: [] },
    ]
    const { sent } = await run("Portrait Pack", [{ text: "Done." }], { history })
    const turn = (sent[0].turns[0] as { content: string }).content
    check("a tapped answer arrives with the question it answers", /EARLIER IN THIS CONVERSATION/.test(turn) && /YOU: Which product should the hero show\?/.test(turn) && /REQUEST\nPortrait Pack/.test(turn))
    check("the last question is recognised as one", lastQuestion(history) === "Which product should the hero show?")
    check("and a conversation with nothing before it adds nothing", describeRecent([]) === "")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The questions policy, in code")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ask = { question: "Which product should the hero show?", options: ["Film Presets Vol. 1", "Portrait Pack", "Editing Course"], why: "The hero sells one product." }
    const { sent, events, result } = await run("make the hero sell one of my products", [
      { calls: [["ask_creator", ask]] },
      { text: "this should never be reached" },
    ])
    const question = events.find((e) => e.type === "question") as Extract<ThemeAgentEvent, { type: "question" }> | undefined
    check("a question is an event with the choices to tap", !!question && question.options.length === 3 && question.why === "The hero sells one product.")
    check("and the run stops there: no further request", sent.length === 1)
    check("the reply is the question as text, for the transcript", result.status === "succeeded" && result.message === questionText(result.asked!) && /^Which product should the hero show\?\n- Film Presets Vol\. 1/.test(result.message))
    check("no Done after a question", !events.some((e) => e.type === "progress" && e.phase === "done"))

    const twice = readAsk(JSON.stringify(ask), "q2", { products: 3, asked: MAX_BUILDER_ASKS })
    check("a second question in a run is refused, with what to do instead", "refused" in twice && /Decide this yourself/.test(twice.refused))
    const oneOption = readAsk(JSON.stringify({ ...ask, options: ["Film Presets Vol. 1"] }), "q3", { products: 3, asked: 0 })
    check("a question needs two to four choices", "refused" in oneOption)
    const answered = readAsk(JSON.stringify(ask), "q4", { products: 3, asked: 0, previousQuestion: "Which product should the hero show?\n- A\n- B" })
    check("the same question as last time is refused: the message is the answer", "refused" in answered && /answered/.test(answered.refused))

    const { sent: sent1, events: events1 } = await run("make the hero sell one of my products", [
      { calls: [["ask_creator", ask]] },
      { calls: [["update_section", { id: "hero_centered-1", settingsJson: JSON.stringify({ heading: "Film Presets Vol. 1" }) }]] },
      { text: "Put Film Presets Vol. 1 in the hero." },
    ], { readStore: async () => ONE_PRODUCT })
    check("asking which product in a one-product store is refused, and the run builds instead", !events1.some((e) => e.type === "question") && sent1.length >= 3 && /The store has one product/.test(JSON.stringify(sent1[1].turns)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Progress, at each real step, in order")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const { events, result } = await run("add a features section about my presets", [
      { text: "I will add a features section about the three packs.", calls: [["add_section", { sectionType: "features_cards", index: 2, settingsJson: JSON.stringify({ heading: "What each pack does" }) }]] },
      { text: "Added a features section about the three packs." },
    ])
    const progress = events.filter((e): e is Extract<ThemeAgentEvent, { type: "progress" }> => e.type === "progress")
    const phases = progress.map((p) => p.phase)
    check("reading, products, planning, writing, checking, done", JSON.stringify(phases.filter((p, i) => phases.indexOf(p) === i)) === JSON.stringify(["reading", "products", "planning", "writing", "checking", "done"]), phases.join(","))
    check("the labels say what is happening", progress[0].label === "Reading the page" && progress.some((p) => p.label === "Looking at your products") && progress.some((p) => /^Writing the /.test(p.label)))
    const done = progress[progress.length - 1]
    check("done says what changed, in a sentence, and which sections", done.phase === "done" && done.detail === result.message && (done.sections ?? []).length === 1)
    check("every event has a label a client can draw", progress.every((p) => typeof p.label === "string" && p.label.length > 0 && !/—/.test(p.label)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A change to part of a file is a patch")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const base = "<template>\n<p>{{ settings.heading }}</p>\n</template>\n<style>\n.a { transition: opacity 200ms ease; }\n.a { color: red; }\n</style>"
    check("a find that is there once is replaced", (() => { const r = applySourceEdits(base, [{ find: "200ms", replace: "240ms" }]); return r.ok === true && r.source.includes("240ms") && !r.source.includes("200ms") })())
    check("a find that is not there is refused", applySourceEdits(base, [{ find: "300ms", replace: "x" }]).ok === false)
    check("a find that is there twice is refused, with how to fix it", (() => { const r = applySourceEdits(base, [{ find: ".a {", replace: ".b {" }]); return r.ok === false && /more than once/.test(r.error) })())
    check("edits apply in order, each to the result of the one before", applySourceEdits(base, [{ find: "200ms", replace: "240ms" }, { find: "240ms ease", replace: "240ms linear" }]).ok === true)
    check("edits that change nothing save nothing", applySourceEdits(base, [{ find: "200ms", replace: "200ms" }]).ok === false)

    const files: Record<string, string> = {}
    const faq = read("themes/default/sections/faq_accordion.storelib").replace(/"type": "faq_accordion"/, '"type": "faq_mine"')
    files["sections/faq_mine.storelib"] = faq
    const writes: string[] = []
    const code = { read: (t: string) => files[`sections/${t}.storelib`] ?? null, write: async (t: string, s: string) => { writes.push(s); files[`sections/${t}.storelib`] = s; return { ok: true as const } } }
    const find = (faq.match(/transition: [^;]*;/) ?? [""])[0]
    const { sent, events, result } = await run("make my faq open more smoothly", [
      { calls: [["read_section_code", { sectionType: "faq_mine" }]] },
      { calls: [["read_section_code", { sectionType: "faq_mine" }]] },
      { calls: [["edit_section_code", { sectionType: "faq_mine", edits: [{ find, replace: "transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);" }] }]] },
      { text: "The answers now open over a quarter of a second." },
    ], { code, sources: files })
    check("the patch tool is offered when there is code to edit", sent[0].tools.some((t) => t.name === "edit_section_code"))
    check("a second read of an unchanged file is a note, not the file again", /You read this earlier in this run/.test(JSON.stringify(sent[2].turns[sent[2].turns.length - 1])))
    check("the patched file is what is saved, and it is the whole file", writes.length === 1 && writes[0].includes("240ms cubic-bezier(0.32, 0.72, 0, 1)") && writes[0].length > faq.length - 200)
    check("the panel is shown the saved file, and told to reload", events.some((e) => e.type === "code" && e.source === writes[0]) && result.wroteCode === true)
    check("saving is a progress step", events.some((e) => e.type === "progress" && e.phase === "saving"))
    check("a patch costs a small fraction of the file it changes", JSON.stringify([{ find, replace: "x".repeat(70) }]).length * 20 < faq.length)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Copy the rules ban is caught in what the run wrote")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("an em dash is caught", copyProblem("Presets — made on real shoots") === "an em dash")
    check("a banned word is caught", copyProblem("Unlock your best edits") === '"Unlock"')
    check("plain copy passes", copyProblem("Presets made on real shoots.") === null)
    const state = page()
    state.sections[1].settings.heading = "Elevate every photo"
    const findings = reviewSections({ state, touched: [state.sections[1].id], added: [], written: { [state.sections[1].id]: ["heading"] } })
    check("the review hands it back to be rewritten", findings.some((f) => /copy rules/.test(f.message)))
    const untouched = reviewSections({ state, touched: [state.sections[1].id], added: [], written: {} })
    check("but not a creator's own words the run did not write", !untouched.some((f) => /copy rules/.test(f.message)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A picture, as each provider reads it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a PNG's size is read from its header", JSON.stringify(imageInfo(png(1440, 900))) === JSON.stringify({ width: 1440, height: 900, shape: "desktop" }))
    check("so is a JPEG's, past its metadata", imageInfo(jpeg(390, 844))?.width === 390 && imageInfo(jpeg(390, 844))?.shape === "phone")
    check("a GIF's and a WebP's", imageInfo(gif(800, 800))?.shape === "square" && imageInfo(webp(1200, 675))?.width === 1200 && imageInfo(webp(1200, 675))?.height === 675)
    check("a whole scrolled page is recognised as one", imageInfo(png(1440, 9000))?.shape === "tall page")
    check("a header claiming a size no screen has is refused", reviewImages([png(40_000, 100)]).images.length === 0 && reviewImages([png(40_000, 100)]).rejected.length === 1)
    check("and an ordinary screenshot goes through", reviewImages([png(1440, 900)]).images.length === 1)
    const text = describeImages([png(1440, 9000)], false)
    check("the model is told the size and what it means", /1440 x 9000, a whole page/.test(text))
    check("and to describe it, then build it closely, its words read off it and another brand swapped for this site's", /reference for layout, hierarchy and style/.test(text) && /DESCRIBE IT BEFORE YOU BUILD IT/.test(text) && /NEVER ANOTHER BRAND'S NAME, LOGO OR CLAIMS/.test(text) && /THEY TYPED NOTHING/.test(text))
    const turns = [{ role: "user" as const, content: "Build this.", images: [png(1440, 900)] }]
    const anthropic = requestMessages(turns)[0].content as Array<Record<string, any>>
    check("Anthropic: an image block with a base64 source and its media type, before the words", anthropic[0].type === "image" && anthropic[0].source.type === "base64" && anthropic[0].source.media_type === "image/png" && anthropic[1].type === "text")
    const openai = (toInput(turns) as Array<Record<string, any>>)[0].content
    check("OpenAI: an input_image as a data URL, before the words", openai[0].type === "input_image" && openai[0].image_url.startsWith("data:image/png;base64,") && openai[1].type === "input_text")
    const { sent, events } = await run("", [{ text: "Built it." }], { images: [png(1440, 900)] })
    check("a picture with nothing typed is sent as the request, with the image skill and the store", (sent[0].turns[0] as { images?: unknown[] }).images?.length === 1 && /A section from a picture/.test((sent[0].turns[0] as { content: string }).content) && /STORE, read for you/.test((sent[0].turns[0] as { content: string }).content))
    check("and the creator is told the picture is being read", events.some((e) => e.type === "progress" && e.label === "Looking at your picture"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The product data API, and the product page that reads it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const row = { id: "p2", title: "Portrait Pack", slug: "portrait-pack", price_cents: 3900, compare_at_cents: 4900, thumbnail_url: "https://cdn.test/a.jpg", gallery_urls: ["https://cdn.test/b.jpg"], status: "published", type: "digital", description: "<p>Twelve looks.</p><p>Made for skin.</p>" }
    const variants: VariantRow[] = [
      { id: "v1", product_id: "p2", name: "Personal", price_cents: 3900, position: 0 },
      { id: "v2", product_id: "p2", name: "Commercial", price_cents: 7900, position: 1 },
    ]
    const product = toProductPage(row, variants)
    check("the product page's product has the card's fields and its description as text", product.settings.title === "Portrait Pack" && product.settings.description === "Twelve looks.\nMade for skin.")
    const theme = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as unknown as ThemeSettingsValues
    const src = DEVELOPER_EXAMPLES.product_page
    const sources = { "sections/product_page.storelib": src }
    const instance = { id: "pp-1", type: "product_page", name: "Product page", settings: {}, blocks: [] }
    const out = renderStorelibSection(instance, theme, { template: "product", product }, sources)
    const html = out.ok ? out.html : ""
    check("the product page example renders the real product", out.ok && html.includes("Portrait Pack") && html.includes("<h1"))
    check("with both options and a buy button to checkout for each", html.includes("Personal") && html.includes("Commercial") && html.includes("/checkout?productId=p2&amp;variantId=v1&amp;src=website") && html.includes("/checkout?productId=p2&amp;variantId=v2&amp;src=website"))
    check("with every picture, the first loaded first and the rest lazily", html.includes("https://cdn.test/a.jpg") && html.includes("https://cdn.test/b.jpg") && /fetchpriority="high"/.test(html) && /loading="lazy"/.test(html))
    check("each option says its own price", html.includes("$39.00") && html.includes("$79.00"))
    check("and the description as escaped text", html.includes("Twelve looks.") && !html.includes("<p>Twelve"))
    const soldOut = toProductPage({ ...row, inventory_count: 0 } as never, [])
    const soldHtml = (() => { const r = renderStorelibSection(instance, theme, { template: "product", product: soldOut }, sources); return r.ok ? r.html : "" })()
    check("a product that cannot be bought shows its tag and no buy link", soldHtml.includes("Sold out") && !soldHtml.includes("/checkout?"))
    const single = toProductPage({ ...row, id: "p3" }, [])
    const singleHtml = (() => { const r = renderStorelibSection(instance, theme, { template: "product", product: single }, sources); return r.ok ? r.html : "" })()
    check("a product without options has one buy button to its own checkout", singleHtml.includes("/checkout?productId=p3&amp;src=website") && !singleHtml.includes("variantId"))
    check("and its sale price struck through beside the price", /\$39\.00[\s\S]*<s class="pp__was">\$49\.00<\/s>/.test(singleHtml))
    const visitor = renderStorelibSection(instance, theme, { template: "product" }, sources)
    check("a page with no product draws nothing for a visitor", visitor.ok && !visitor.html.includes("Your product appears here") && !visitor.html.includes("/checkout?"))
    const card = toCard(row, variants)
    check("in the builder, the product template borrows the newest product", (withPageProduct({ template: "product", in_editor: true }, [card]).product as { id?: string } | undefined)?.id === "p2")
    check("but never on a visitor's page, and never on another template", withPageProduct({ template: "product" }, [card]).product === undefined && withPageProduct({ template: "index", in_editor: true }, [card]).product === undefined && withPageProduct({ template: "page.about", in_editor: true }, [card]).product === undefined)
    /* The builder names the product page "page.product" (site-pages.ts templateForPage), the live route "product". */
    const inBuilder = renderStorelibSection(instance, theme, { template: "page.product", in_editor: true }, sources, [card])
    check("the builder's own name for the product page draws the newest product too, not the empty note", inBuilder.ok && inBuilder.html.includes("Portrait Pack") && !inBuilder.html.includes("Your product appears here"))
    check("and the stand-in has every field page.product has, its description empty", ((withPageProduct({ template: "page.product", in_editor: true }, [card]).product as { settings?: { description?: string } } | undefined)?.settings?.description) === "" && inBuilder.ok && !inBuilder.html.includes('class="pp__desc"'))
    check("the example compiles with no warnings and passes the checks every AI-written section must", (() => { const c = compileSection(src, { file: "sections/product_page.storelib" }); return c.ok === true && (c.warnings ?? []).length === 0 })() && qualityErrors(checkSectionQuality(src)).length === 0 && validateSection(src, { path: "sections/product_page.storelib", expectType: "product_page", strict: true }).ok === true)
    const facts = describeStore(STORE)
    check("the builder's store facts carry ids, addresses, sale prices and options", /\[id p1, \/products\/film-presets\]/.test(facts) && /was 39\.00/.test(facts) && /options: Personal 39\.00, Commercial 79\.00/.test(facts))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Checkout comes back to the creator's own site, and nowhere else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const rules: Parameters<typeof checkoutReturnTarget>[1] = { hosts: ["northlight.storelib.com", "shop.northlight.co", "www.shop.northlight.co"], mainDomain: "storelib.com", base: "northlight.storelib.com" }
    const to = (v: unknown, r = rules) => checkoutReturnTarget(v, r)
    check("their storelib address", to("https://northlight.storelib.com/products/film") === "https://northlight.storelib.com/products/film")
    check("their verified domain, fragment dropped", to("https://shop.northlight.co/thank-you?x=1#top") === "https://shop.northlight.co/thank-you?x=1")
    check("a path, on the site the buyer came from", to("/thank-you") === "https://northlight.storelib.com/thank-you")
    check("a host in capitals is the same host", to("https://NorthLight.storelib.com/") === "https://northlight.storelib.com/")
    check("a result a previous checkout left is not carried again", to("https://northlight.storelib.com/?checkout=paid") === "https://northlight.storelib.com/")
    const refused: Array<[string, unknown]> = [
      ["another site", "https://evil.com/"],
      ["a protocol-relative address", "//evil.com/"],
      ["a backslash for a slash", "/\\evil.com"],
      ["backslashes after the scheme", "https:\\\\evil.com"],
      ["plain http", "http://northlight.storelib.com/"],
      ["a port", "https://northlight.storelib.com:8443/"],
      ["our host as a user name in front of theirs", "https://northlight.storelib.com@evil.com/"],
      ["a user name in front of ours", "https://evil@northlight.storelib.com/"],
      ["another creator's storelib site", "https://other.storelib.com/"],
      ["the platform itself", "https://storelib.com/"],
      ["our host as a prefix of theirs", "https://northlight.storelib.com.evil.com/"],
      ["a look-alike", "https://evilnorthlight.storelib.com/"],
      ["an unverified or unknown domain", "https://northlight.co/"],
      ["a script address", "javascript:alert(1)"],
      ["a data address", "data:text/html,<script>alert(1)</script>"],
      ["a space inside", "https://northlight.storelib.com/a b"],
      ["a tab inside", "https://northlight.storelib.com/\tx"],
      ["a newline inside", "https://evil.com\n.northlight.storelib.com/"],
      ["an address that is not text", { href: "https://northlight.storelib.com/" }],
      ["nothing at all", ""],
      ["an address longer than any page needs", `https://northlight.storelib.com/${"a".repeat(3000)}`],
      ["a look-alike in other letters", "https://nörthlight.storelib.com/"],
    ]
    for (const [what, value] of refused) check(`refused: ${what}`, to(value) === null, String(to(value)))
    check("refused: a path when the site it came from is not theirs", to("/thank-you", { ...rules, base: "evil.com" }) === null && to("/thank-you", { ...rules, base: null }) === null)
    check("a developer's machine, only when the platform is one", to("http://localhost:3000/w/northlight", { hosts: ["localhost"], mainDomain: "localhost:3000", base: null }) === "http://localhost:3000/w/northlight" && to("http://localhost:3000/w/northlight", { hosts: ["localhost"], mainDomain: "storelib.com", base: null }) === null)
    check("after paying, the site is told so", paidReturnUrl("https://northlight.storelib.com/products/film?ref=ig") === "https://northlight.storelib.com/products/film?ref=ig&checkout=paid")
    check("and the overlay names the site without www", returnHostLabel("https://www.shop.northlight.co/") === "shop.northlight.co")

    const href = checkoutHrefWithOrigin("/checkout?productId=p1&src=website", { site: "northlight.storelib.com" }, "https://northlight.storelib.com/products/film#reviews")
    const q = new URL(href, "https://x.invalid").searchParams
    check("a buy link on the site comes back to the page it was on", q.get("return") === "https://northlight.storelib.com/products/film" && q.get("cancel") === "https://northlight.storelib.com/products/film" && q.get("site") === "northlight.storelib.com")
    const own = new URL(checkoutHrefWithOrigin("/checkout?productId=p1&src=website&return=/thank-you", null, "https://northlight.storelib.com/"), "https://x.invalid").searchParams
    check("a section's own return path is made absolute on the site", own.get("return") === "https://northlight.storelib.com/thank-you")
    check("and without a page nothing is added, as before", checkoutHrefWithOrigin("/checkout?productId=1", null) === "/checkout?productId=1")

    const db = {
      from: (table: string) => {
        const rowsFor: Record<string, unknown> = {
          creators: { slug: "northlight", user_id: "u1" },
          profiles: { username: "anna" },
          custom_domains: [{ domain: "northlight.co", status: "active" }, { domain: "pending.co", status: "pending" }],
          website_addresses: [{ handle: "nl-presets" }],
          website_address_history: [{ handle: "old-name" }],
        }
        const result = { data: rowsFor[table] ?? null, error: null }
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.maybeSingle = () => Promise.resolve(result)
        chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok)
        return chain
      },
    }
    const hosts = await siteHostsFor("c1", db as never)
    check("their hosts: username, slug, the website's names now and before, and verified domains with www", ["anna.storelib.com", "northlight.storelib.com", "nl-presets.storelib.com", "old-name.storelib.com", "northlight.co", "www.northlight.co"].every((h) => hosts.includes(h)), hosts.join(","))
    check("a domain still being verified is not one of them", !hosts.some((h) => h.includes("pending.co")))

    const page = read("app/checkout/page.tsx")
    const client = read("app/checkout/checkout-client.tsx")
    check("the checkout page checks the addresses on the server, for this product's creator", /checkoutReturns\(\{ creatorId: product\.creator_id, success: returnTo, cancel, site \}\)/.test(page))
    check("the client goes back only to what the server passed it, else the receipt", /window\.location\.replace\(paidReturnUrl\(returnTo\)\)/.test(client) && /router\.replace\(receiptHref\(receiptToken\)\)/.test(client) && /const receiptHref = \(receiptToken: string\) => `\/receipt\/\$\{encodeURIComponent\(receiptToken\)\}`/.test(client))
    const cart = read("app/api/checkout/cart/route.ts")
    check("a basket's way back is held to the creator's own sites too, not any storelib subdomain", /siteHostsFor\(creatorId\)/.test(cart) && !/endsWith\(`\.\$\{main\}`\)/.test(cart))
    check("and its completion checks the return again before following it", /checkoutReturnTarget\(searchParams\.get\("return"\)/.test(read("app/api/checkout/cart/complete/route.ts")))
    check("the site says the payment went through when the buyer lands back", /<CheckoutReturnNotice \/>/.test(read("app/(site)/layout.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The same for outside agents: MCP and GitHub")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("MCP offers the patch tool", [...TOOLS, ...PROJECT_TOOLS].some((t) => t.name === "storelib_patch_section"))
    const brief = briefFrom({
      name: "Northlight",
      address: "https://northlight.storelib.com",
      live: true,
      settings: {},
      pages: [],
      products: [toCard({ id: "p2", title: "Portrait Pack", slug: "portrait-pack", price_cents: 3900, compare_at_cents: null, thumbnail_url: null, status: "published" }, [{ id: "v1", product_id: "p2", name: "Personal", price_cents: 3900 }])],
    })
    check("storelib_site carries the product data API: checkout links and options", brief.products[0].checkout_url === "/checkout?productId=p2&src=website" && brief.products[0].variants[0].checkout_url === "/checkout?productId=p2&variantId=v1&src=website" && brief.products[0].currency === "USD")
    const fake: BoundOps = {
      siteName: "Northlight", agentName: "Codex",
      list: async () => ({ ok: true, value: { framework: { engine: 1, schema: 1 }, docs: "", writable: "", files: [] } }),
      read: async () => ({ ok: false, status: 404, error: "" }),
      compile: () => ({ ok: false, status: 400, error: "" }),
      write: async () => ({ ok: false, status: 403, error: "" }),
      guide: () => "GUIDE",
    }
    const init = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, fake)) as { result?: { instructions?: string } }
    check("the rules arrive on connect, with the questions policy and the version", /ASK, DON'T GUESS/.test(init.result?.instructions ?? "") && (init.result?.instructions ?? "").includes(RULEBOOK_VERSION))
    const agents = agentsGuide({ siteName: "Northlight", branch: "main", root: "" })
    check("a linked repository's AGENTS.md carries the full rulebook", ruleGroupsFor("outside").every((g) => agents.includes(`### ${g.title}`)) && agents.includes(agentRulesText().split("\n").find((l) => /one short question with two to four options/.test(l))!.replace(/^- /, "")))
    check("and the product data API and the way back from checkout", /checkout_url/.test(agents) && /page\.product/.test(agents) && /back to this site/.test(agents))
    check("and CLAUDE.md sends Claude Code to it", /@AGENTS\.md/.test(CLAUDE_MD))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The model picker maps to providers that exist")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    const provider = read("lib/sites/agent/provider.ts")
    /* Storelib AI runs on ChatGPT only for now: two models, each with what it is best for. */
    check("the picker offers the two ChatGPT models", JSON.stringify(ENGINES.map((e) => e.label)) === JSON.stringify(["GPT-5.6 Luna", "GPT-5.6 Terra"]), JSON.stringify(ENGINES.map((e) => e.label)))
    check("each says in one line what it is best for", ENGINES.every((e) => /^Best for /.test(e.detail) && e.detail.length <= 48 && !/—/.test(e.detail)))
    check("each is a provider and tier the route accepts", ENGINES.every((e) => /provider: z\.enum\(\["anthropic", "openai"\]\)/.test(route) && e.provider === "openai" && ["fast", "strong"].includes(e.tier)))
    check("and the resolver has a model for each, on OpenAI's provider", /openai: \{\s*fast: DEFAULT_MODEL,\s*strong: STRONG_MODEL/.test(provider) && /openAIProvider/.test(provider) && !/anthropicProvider/.test(provider))
    check("Strength is Light, Standard and Deep, which are low, medium and high", STRENGTHS.map((s) => `${s.label}:${s.effort}`).join(",") === "Light:low,Standard:medium,Deep:high")
    check("and the route takes only those, from a browser", /effort: z\.enum\(EFFORTS as \[Effort, \.\.\.Effort\[\]\]\)\.optional\(\)/.test(route) && /effort: body\.effort \?\?/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The route gives the agent what it needs, safely")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the conversation is read before this request is recorded, so it is never in its own history", route.indexOf("await recentMessages(") > 0 && route.indexOf("await recentMessages(") < route.indexOf("await startThemeExchange("))
    check("through the creator's own client", /recentMessages\(supabase as never, installId, conversationId\)/.test(route))
    check("and handed to the agent", /\n\s*history,\n/.test(route))
    check("the store is read through the creator's own client, with options, and an older database still answers", /\.from\("product_variants"\)/.test(route) && /first\.error \? await productQuery\(/.test(route) && !/createAdminClient/.test(route))
    check("no em dash in what the route says to a creator", !/"[^"\n]*—[^"\n]*"/.test(route))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
