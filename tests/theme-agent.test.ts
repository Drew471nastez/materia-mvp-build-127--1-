/**
 * ===========================================================================
 *  THE THEME EDITOR'S AGENT, RUN
 * ===========================================================================
 * The loop is driven against a scripted provider, with the real section
 * schemas and the real operation applier. Nothing is mocked except the model.
 *
 * The interesting behaviour is all sequencing and validation, and neither can
 * be checked by reading the file: does an unknown field really get refused
 * rather than silently merged, does the header really refuse to move, does the
 * browser's applier really produce what the server produced.
 *
 * Run with:  npm run test:push
 */

import { untt } from "./i18n-source"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import {
  applyOps,
  buildSection,
  describeFields,
  describeSection,
  describeStore,
  describeTheme,
  describeThemeSettings,
  fieldIds,
  themeFieldIds,
  type ThemeOp,
  type ThemeState,
} from "@/lib/website-builder/agent/operations"
import {
  colorDistance,
  describeHouseStyle,
  readHouseStyle,
} from "@/lib/website-builder/agent/house-style"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { AGENT_LIMITS } from "@/lib/website-builder/agent/limits"
/**
 * The generic half of this prompt moved into the shared brain, which both
 * providers and all four surfaces compose. Asserting against the composed
 * text rather than against loop.ts is the point: the rule has to be in what
 * the model is SENT, not in one file that happens to mention it.
 */
import { pageAgentRules } from "@/lib/storelib-ai"
import { contrastRatio, parseColor, reviewSections } from "@/lib/website-builder/agent/review"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import {
  RUBBER_BAND_LIMIT_PX,
  SNAP_CURVE,
  coastDistance,
  coastVelocity,
  curveSlopes,
  dragIntent,
  isTap,
  tapTarget,
  VELOCITY_THRESHOLD,
  FLICK_MIN_DISTANCE,
  BAR_GAP_PX,
  keyboardCeiling,
  dragPosition,
  expandCarry,
  handOffToSheet,
  isCompatibilityMouse,
  offsetsFor,
  releaseVelocity,
  rubberBand,
  rubberBandSlope,
  sheetVelocityAt,
  snapDuration,
  snapMotion,
  snapStartSpeed,
  snapTarget,
} from "@/components/website-builder/sheet-gestures"
import type { AgentProvider, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The repository root. The compiled suite runs from a temp directory, so a
 * relative path would look for the app beside the JavaScript.
 */
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

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

/**
 * Every tool result the model was handed, most recent last.
 *
 * Without this a test can only see the OPERATIONS a run produced, and two of
 * the checks below were passing on the op count while the thing they described
 * — what the model was told when it looked at another section — was not being
 * observed at all. A break-test proved it: blocking reads entirely changed
 * nothing the suite could see.
 */
const toolOutputs: string[] = []

function scriptedProvider(script: Scripted[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      for (const t of request.turns) {
        if (t.role === "tool") {
          for (const r of t.results ?? []) toolOutputs.push(r.output)
        }
      }
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({
        id: `call_${turn}_${i}`,
        name,
        argumentsJson: JSON.stringify(args),
      }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 },
        stop: toolCalls.length > 0 ? "tool_calls" : "done",
      }
    },
  }
}

function make(id: string, type: string, blocks: SectionInstance["blocks"] = []): SectionInstance {
  return {
    id,
    type,
    name: SECTION_SCHEMAS[type]?.name ?? type,
    settings: {},
    blocks,
  }
}

function page(): ThemeState {
  return {
    sections: [make("header-1", "header"), make("hero-1", "hero"), make("footer-1", "footer")],
    settings: {},
  }
}

/**
 * The page from the report: a FAQ, selected, with its questions in BLOCKS.
 *
 * This is the shape that made "make this section better" do nothing visible —
 * a FAQ's content is not in its settings, so an agent with only section tools
 * could change the heading and the padding and nothing anybody would notice.
 */
function pageWithFaq(): ThemeState {
  return {
    sections: [
      make("header-1", "header"),
      make("faq-1", "faq", [
        { id: "f1", type: "faq_item", settings: { question: "What is your return policy?", answer: "<p>30 days.</p>" } },
        { id: "f2", type: "faq_item", settings: { question: "How long does shipping take?", answer: "<p>A while.</p>" } },
      ]),
      make("footer-1", "footer"),
    ],
    settings: {},
  }
}

/**
 * Two editable sections, so "only this one" has something to be only — and the
 * second one is ALSO A FAQ on purpose.
 *
 * With a hero as the other section, "a block written to the wrong section is
 * refused" passed whether the lock worked or not: a hero takes no faq_item, so
 * the block-type check refused it first. The property was never observed. Two
 * sections of the same type is what makes the lock the only thing that can be
 * doing the refusing.
 */
function pageWithHeroAndFaq(): ThemeState {
  return {
    sections: [
      make("header-1", "header"),
      make("hero-1", "hero"),
      make("faq-1", "faq", [
        { id: "f1", type: "faq_item", settings: { question: "What is your return policy?", answer: "<p>30 days.</p>" } },
      ]),
      make("faq-2", "faq", [
        { id: "g1", type: "faq_item", settings: { question: "Somebody else's question", answer: "<p>No.</p>" } },
      ]),
      make("footer-1", "footer"),
    ],
    settings: {},
  }
}

async function run(
  script: Scripted[],
  state = page(),
  selectedSectionId?: string,
  options: { lockToSelection?: boolean; maxTurns?: number; maxReviews?: number } = {},
) {
  const events: ThemeAgentEvent[] = []
  toolOutputs.length = 0
  let n = 0
  const loop = themeAgent({
    provider: scriptedProvider(script),
    model: "test",
    prompt: "make this section better",
    state,
    page: "home",
    addable: ADDABLE_SECTIONS,
    selectedSectionId,
    lockToSelection: options.lockToSelection,
    maxTurns: options.maxTurns,
    maxReviews: options.maxReviews,
    newId: (type) => `${type}-new-${++n}`,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done) return { events, result: step.value }
    events.push(step.value as ThemeAgentEvent)
  }
}

// ===========================================================================
section("It edits the same state the panels edit")
// ===========================================================================

{
  const { result } = await run([
    { calls: [["add_section", { sectionType: "faq", index: 2, settingsJson: "{}" }]] },
    { text: "Added an FAQ." },
  ])
  check("a section is added", result.status === "succeeded" && result.ops.length === 1, result.error ?? "")

  /**
   * THE PROPERTY THE WHOLE DESIGN RESTS ON. The browser replays these
   * operations with the same applier, so what it ends up with must be what the
   * server ended up with — otherwise the preview and the save disagree, which
   * is the most confusing bug this editor could have.
   */
  const replayed = applyOps(page(), result.ops)
  check(
    "and the browser's replay lands in the same place",
    replayed.sections.map((s) => s.type).join(",") === "header,hero,faq,footer",
    replayed.sections.map((s) => s.type).join(","),
  )
}

{
  /**
   * An unknown field id is MERGED and then ignored by the renderer, so without
   * this the tool reports success, the model reports success, and nothing on
   * the page changes. Refusing it is the only place anybody finds out.
   */
  const { result } = await run([
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ nonsense_field: "x" }) }]] },
    { text: "Done." },
  ])
  check("an unknown field is refused, not silently merged", result.ops.length === 0)
}

{
  const allowed = fieldIds("hero")
  const { result } = await run([
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ [allowed[0]]: "Real heading" }) }]] },
    { text: "Done." },
  ])
  check("a real field is written", result.ops.length === 1 && result.ops[0].kind === "update_section")
  const replayed = applyOps(page(), result.ops)
  check(
    "and reaches the section",
    replayed.sections[1].settings[allowed[0]] === "Real heading",
  )
}

{
  /**
   * The header and footer are structure: the editor pins them and syncs them
   * across every page. A page whose navigation is halfway down it is not a
   * layout choice.
   */
  const { result } = await run([
    { calls: [["remove_section", { id: "header-1" }]] },
    { calls: [["move_section", { id: "footer-1", index: 0 }]] },
    { text: "Done." },
  ])
  check("the header cannot be removed and the footer cannot be moved", result.ops.length === 0)
}

{
  const { result } = await run([
    { calls: [["add_section", { sectionType: "faq", index: 0, settingsJson: "{}" }]] },
    { text: "Done." },
  ])
  const replayed = applyOps(page(), result.ops)
  check(
    "an insert above the header is clamped below it",
    replayed.sections[0].type === "header" && replayed.sections[1].type === "faq",
    replayed.sections.map((s) => s.type).join(","),
  )
}

{
  const { result } = await run([
    { calls: [["add_section", { sectionType: "not_a_real_section", index: 1, settingsJson: "{}" }]] },
    { text: "Done." },
  ])
  check("an invented section type is refused", result.ops.length === 0)
}

{
  const { result } = await run([
    { calls: [["update_section", { id: "does-not-exist", settingsJson: "{}" }]] },
    { text: "Done." },
  ])
  check("an invented id is refused", result.ops.length === 0)
}

{
  /**
   * Settings travel as a JSON string because strict mode leaves no legal way
   * to declare a free-form object. That moves one failure from the schema to
   * the parser, so the parser has to be told-not-thrown like every other tool
   * error — a model that sends slightly wrong JSON gets to correct it.
   */
  const { result } = await run([
    { calls: [["update_section", { id: "hero-1", settingsJson: "{not json" }]] },
    { text: "Done." },
  ])
  check("malformed settings JSON is refused, not thrown", result.ops.length === 0)

  const allowed = fieldIds("hero")
  const typed = await run([
    {
      calls: [
        ["update_section", { id: "hero-1", settingsJson: JSON.stringify({ [allowed[0]]: "x" }) }],
      ],
    },
    { text: "Done." },
  ])
  check(
    "and a value keeps the type JSON gave it",
    /**
     * The reason a string beats a list of key/value pairs: numbers stay
     * numbers and booleans stay booleans through one JSON.parse, where a
     * flattened pair list would hand every setting to the renderer as text.
     */
    typeof applyOps(page(), typed.result.ops).sections[1].settings[allowed[0]] === "string",
  )
}

{
  /**
   * A run that changed nothing and said nothing did not do what was asked,
   * whatever the model believes. An empty success is worse than a failure —
   * it tells somebody their change was made when it was not.
   */
  const { result } = await run([{ text: "" }])
  check("silence with no changes is a failure, not a success", result.status === "failed")
}

{
  const { events } = await run([
    { calls: [["add_section", { sectionType: "faq", index: 2, settingsJson: "{}" }]] },
    { text: "Done." },
  ])
  /**
   * The operation reaches the browser as it is made rather than at the end.
   * That is what makes the preview move while the model works.
   */
  const op = events.find((e) => e.type === "op")
  check("each change is streamed the moment it is made", !!op)
  check(
    "and carries a label a person can read",
    op?.type === "op" && /^Added /.test(op.label),
    op?.type === "op" ? op.label : "",
  )
}

{
  /**
   * THE APPLIER'S OWN GUARDS, tested directly.
   *
   * The loop refuses these before an operation is ever produced, so a test
   * that only drives the loop leaves this half completely unexercised — and
   * this is the half the BROWSER runs. The browser replays whatever arrives
   * over the wire; if it trusted it, a bad operation would take the header off
   * the page in front of somebody.
   */
  const before = page()
  const removeHeader: ThemeOp = { kind: "remove_section", id: "header-1" }
  const moveFooter: ThemeOp = { kind: "move_section", id: "footer-1", index: 0 }
  const insertAboveHeader: ThemeOp = { kind: "add_section", id: "x", sectionType: "faq", index: 0 }

  check(
    "the applier refuses to remove the header, whatever it is sent",
    applyOps(before, [removeHeader]).sections.length === before.sections.length,
  )
  check(
    "and refuses to move the footer off the bottom",
    applyOps(before, [moveFooter]).sections[0].type === "header",
  )
  check(
    "and clamps an insert below the header",
    applyOps(before, [insertAboveHeader]).sections[0].type === "header",
  )
  check(
    "an operation naming a section that is gone changes nothing, rather than throwing",
    /**
     * The browser is replaying what the server did, and somebody may have
     * deleted that section by hand a second earlier. A throw here would take
     * down the editor over a race.
     */
    applyOps(before, [{ kind: "update_section", id: "nope", settings: { a: 1 } }]).sections.length ===
      before.sections.length,
  )
}

// ===========================================================================
section('"Make this section better", on a real FAQ')
// ===========================================================================

/**
 * THE REPORTED FAILURE, reproduced. A FAQ was selected, the request was "make
 * this section better", and nothing visible happened.
 *
 * Two causes, and each alone was enough:
 *
 *   THE SELECTION WAS NEVER SENT. "This section" reached a model holding a
 *   list of nine sections and a demonstrative pronoun.
 *
 *   THERE WERE NO BLOCK TOOLS. Twenty-four of the fifty section types keep
 *   their content in blocks — a FAQ's questions among them — so the only
 *   things the agent could touch on a FAQ were its heading, its padding and
 *   its accordion style. It could report success having changed nothing
 *   anybody would notice.
 */
{
  const { result } = await run(
    [
      { calls: [["read_section", { id: "faq-1" }]] },
      {
        calls: [
          [
            "update_block",
            {
              sectionId: "faq-1",
              blockId: "f1",
              settingsJson: JSON.stringify({ answer: "<p>Thirty days, no questions asked.</p>" }),
            },
          ],
        ],
      },
      {
        calls: [
          [
            "add_block",
            {
              sectionId: "faq-1",
              blockType: "faq_item",
              index: -1,
              settingsJson: JSON.stringify({
                question: "Do you ship worldwide?",
                answer: "<p>Yes, everywhere we can.</p>",
              }),
            },
          ],
        ],
      },
      { text: "Rewrote an answer and added a question." },
    ],
    pageWithFaq(),
    "faq-1",
  )

  check("the run succeeds", result.status === "succeeded", result.error ?? "")

  const after = applyOps(pageWithFaq(), result.ops)
  const faq = after.sections.find((s) => s.id === "faq-1")

  check(
    "an existing answer is actually rewritten",
    faq?.blocks?.[0].settings.answer === "<p>Thirty days, no questions asked.</p>",
  )
  check(
    "and a new question is added to the section",
    faq?.blocks?.length === 3 && faq.blocks[2].settings.question === "Do you ship worldwide?",
  )
  check(
    "a new block starts from its schema's defaults, not empty",
    /**
     * A block added with nothing in it renders as a blank row — an FAQ entry
     * with no answer — which reads as the editor being broken rather than as
     * something waiting to be filled.
     */
    Object.keys(faq?.blocks?.[2].settings ?? {}).length > 2,
    JSON.stringify(faq?.blocks?.[2].settings ?? {}),
  )
}

{
  /**
   * The selected section is put in front of the model IN FULL — settings and
   * blocks — rather than left for a read_section round trip. It is what the
   * request is about far more often than not.
   */
  let firstTurn = ""
  const capturing: AgentProvider = {
    id: "capturing",
    async complete(request) {
      const first = request.turns[0]
      firstTurn = first.role === "user" ? first.content : ""
      return {
        text: "Done.",
        toolCalls: [],
        raw: [],
        usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
        stop: "done",
      }
    },
  }
  const loop = themeAgent({
    provider: capturing,
    model: "test",
    prompt: "make this section better",
    state: pageWithFaq(),
    page: "home",
    addable: ADDABLE_SECTIONS,
    selectedSectionId: "faq-1",
  })
  for (;;) {
    const step = await loop.next()
    if (step.done) break
  }

  check(
    "the selected section is named as what 'this' means",
    /THE CREATOR HAS THIS SECTION SELECTED/.test(firstTurn) && firstTurn.includes("[faq-1]"),
  )
  check(
    "and its blocks are in front of the model, not just its settings",
    /**
     * Without this the model can only see that a FAQ has a heading and a
     * style, so it edits those and reports success — which is precisely the
     * bug.
     */
    firstTurn.includes("What is your return policy?") &&
      /BLOCK TYPES THIS SECTION TAKES/.test(firstTurn),
  )
}

{
  /**
   * A block field that does not exist is merged and then ignored by the
   * renderer, so the tool would report success and nothing would change —
   * the same silent failure the section fields already guard against.
   */
  const { result } = await run(
    [
      {
        calls: [
          ["update_block", { sectionId: "faq-1", blockId: "f1", settingsJson: '{"nope":"x"}' }],
        ],
      },
      { text: "Done." },
    ],
    pageWithFaq(),
    "faq-1",
  )
  check("an unknown block field is refused", result.ops.length === 0)
}

{
  const { result } = await run(
    [
      {
        calls: [
          ["add_block", { sectionId: "hero-1", blockType: "faq_item", index: -1, settingsJson: "{}" }],
        ],
      },
      { text: "Done." },
    ],
    pageWithFaq(),
  )
  check(
    "a block type the section does not take is refused",
    // The hero is not in this fixture, so this also covers a bad section id.
    result.ops.length === 0,
  )
}

{
  /**
   * The schema's own ceiling. A slideshow that declares four slides means
   * four; a fifth is a section that renders wrong rather than one with more in
   * it.
   */
  const capped = Object.entries(SECTION_SCHEMAS).find(
    ([, schema]) => typeof schema.max_blocks === "number" && (schema.blocks?.length ?? 0) > 0,
  )
  if (capped) {
    const [type, schema] = capped
    const full = Array.from({ length: schema.max_blocks as number }, (_, i) => ({
      id: `b${i}`,
      type: schema.blocks![0].type,
      settings: {},
    }))
    const { result } = await run(
      [
        {
          calls: [
            [
              "add_block",
              { sectionId: "s1", blockType: schema.blocks![0].type, index: -1, settingsJson: "{}" },
            ],
          ],
        },
        { text: "Done." },
      ],
      { sections: [make("s1", type, full)], settings: {} },
    )
    check(`a full ${type} refuses another block`, result.ops.length === 0)
  } else {
    check("a full section refuses another block", true, "no capped section type in the library")
  }
}

// ===========================================================================
section("The tool schemas are legal, or nothing works at all")
// ===========================================================================

{
  /**
   * THE BUG THIS EXISTS FOR, and it shipped.
   *
   *   400 Invalid schema for function 'update_section':
   *   In context=('properties', 'settings'), 'additionalProperties' is
   *   required to be supplied and to be false.
   *
   * `settings` was declared as a nested free-form object. The provider sends
   * every tool with strict: true, and strict mode applies to EVERY object in
   * the schema — not the outermost one. OpenAI refused the whole request, so
   * the feature never ran once.
   *
   * The sites agent's version of this check only looked at the top level,
   * which is precisely why nothing caught it. This one recurses.
   */
  function strictLegal(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") return true
    const node = schema as {
      type?: string
      properties?: Record<string, unknown>
      required?: string[]
      additionalProperties?: unknown
      items?: unknown
    }
    if (node.type === "object") {
      if (node.additionalProperties !== false) return false
      const declared = Object.keys(node.properties ?? {})
      if (!declared.every((key) => (node.required ?? []).includes(key))) return false
      if (!declared.every((key) => strictLegal((node.properties ?? {})[key]))) return false
    }
    if (node.items && !strictLegal(node.items)) return false
    return true
  }

  /**
   * Captured from a real run rather than imported, so this checks what is
   * actually SENT — including anything the loop assembles at call time.
   */
  let sent: Array<{ name: string; parameters: unknown }> = []
  const capturing: AgentProvider = {
    id: "capturing",
    async complete(request) {
      sent = request.tools.map((t) => ({ name: t.name, parameters: t.parameters }))
      return {
        text: "Done.",
        toolCalls: [],
        raw: [],
        usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
        stop: "done",
      }
    },
  }

  const probe = themeAgent({
    provider: capturing,
    model: "test",
    prompt: "hello",
    state: page(),
    page: "home",
    addable: ADDABLE_SECTIONS,
  })
  for (;;) {
    const step = await probe.next()
    if (step.done) break
  }

  check("the tools were sent at all", sent.length > 0)
  const illegal = sent.filter((t) => !strictLegal(t.parameters)).map((t) => t.name)
  check(
    "and every one is strict-mode legal, at every depth",
    illegal.length === 0,
    illegal.join(", "),
  )
}

// ===========================================================================
section("What the model is told")
// ===========================================================================

{
  const described = describeTheme(page(), "home")
  check(
    "the page listing carries the ids every operation needs",
    described.includes("[header-1]") && described.includes("[hero-1]"),
  )
  /**
   * Forty-nine section types with dozens of fields each would fill the context
   * before the model had read the request. It asks for the ones it needs.
   */
  check("but not every setting of every section", !described.includes("CURRENT SETTINGS"))
}

{
  check(
    "the section vocabulary is the editor's own, not a second list",
    ADDABLE_SECTIONS.length > 20 && ADDABLE_SECTIONS.every((t) => !!SECTION_SCHEMAS[t]),
    `${ADDABLE_SECTIONS.length} addable`,
  )
}

{
  const built = buildSection("x", "faq")
  const schema = SECTION_SCHEMAS.faq
  check(
    "a new section starts from the schema's own preset, as the editor's Add does",
    built?.name === schema.name &&
      JSON.stringify(built?.settings) === JSON.stringify(schema.presets?.[0]?.settings ?? {}),
  )
}

// ===========================================================================
section("One door to the AI, not two")
// ===========================================================================

{
  const sidebar = untt(readFileSync(join(root, "components/app/sidebar.tsx"), "utf8"), "components/app/sidebar.tsx")
  /**
   * The AI moved into the theme editor, where it edits the sections somebody
   * is already looking at. Two menu entries for "build my website with AI",
   * each leading somewhere different, is a choice nobody can make correctly on
   * their first visit.
   */
  check(
    "the AI code builder is not in the menu",
    !/href: "\/app\/sites"/.test(sidebar) && !/href="\/app\/sites"/.test(sidebar),
  )

  /**
   * HIDDEN, NOT DELETED — and the difference matters, because deleting the
   * routes would take somebody's existing projects, transcripts and published
   * sites with them. Going to the address still works.
   */
  check(
    "but the code builder still exists and still answers",
    existsSync(join(root, "app/(storelib)/app/sites/page.tsx")) &&
      existsSync(join(root, "app/(storelib)/sites/[siteId]/page.tsx")),
  )

  check(
    "and the theme editor is where the AI now lives",
    (() => {
      const editor = untt(readFileSync(
        join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
        "utf8",
      ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
      return /<ThemeChat/.test(editor) && /aria-label="Ask Storelib"/.test(editor)
    })(),
  )
}

// ===========================================================================
section("The editor has one accent, and it is the app's own")
// ===========================================================================

{
  const editor = untt(readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/(storelib)/website-builder/editor/[installId]/page.tsx")

  /**
   * Purple appeared in thirty-one places beside a Save button that is black,
   * so the editor had two accents and neither read as deliberate. A saturated
   * purple on a builder also reads as "AI demo" rather than as a tool, which
   * is the specific thing this was asked to stop looking like.
   *
   * Counted rather than forbidden outright: the survivors are COMMENTS
   * explaining that the inspector outline is blue and deliberately not purple,
   * and that the canvas's insert line is grey for the same reason. A rule that
   * cannot tell a mention from a use is a rule somebody deletes the first time
   * it is wrong — which is why `{/*` is in the exemption beside `//` and `/*`.
   * A JSX comment is a comment, and this file is mostly JSX.
   */
  const uses = editor
    .split("\n")
    .filter((line) => /purple/.test(line))
    .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
  check("no purple is actually applied anywhere", uses.length === 0, uses.slice(0, 3).join(" | "))

  /**
   * One control size and one icon size across the top bar. Four icon sizes and
   * three button heights in one strip is what made it read as unfinished, and
   * it is the kind of thing that creeps back one control at a time.
   */
  const header = editor.slice(
    editor.indexOf('<header className="relative h-12 bg-background'),
    editor.indexOf("</header>"),
  )
  const literals = [...header.matchAll(/(?:text|bg|border)-neutral-\d+/g)].map((m) => m[0])
  check(
    "and the top bar uses theme tokens, not colour literals",
    // The Save button's solid black is the one intentional literal.
    literals.every((l) => l.startsWith("bg-neutral-900")),
    [...new Set(literals)].join(", "),
  )
}

// ===========================================================================
section("Theme settings are checked like everything else")
// ===========================================================================

{
  /**
   * THE LAST PLACE THE SILENT FAILURE SURVIVED.
   *
   * Section writes and block writes both refuse an id the schema does not
   * have, because an unknown key merges into the settings and is then ignored
   * by the renderer: success reported, nothing changed. Theme settings live in
   * a different schema and were missed, so "give the whole site a warmer
   * palette" — the panel's own suggested prompt — was the model guessing at
   * what a colour field might be called.
   */
  const real = themeFieldIds()
  check("the theme's own field ids are known", real.length > 40, `${real.length} fields`)

  const { result: refused } = await run(
    [
      { calls: [["update_theme", { settingsJson: '{"not_a_theme_setting":"#fff"}' }]] },
      { text: "Done." },
    ],
    page(),
  )
  check("an id the theme does not have is refused", refused.ops.length === 0)

  const { result: accepted } = await run(
    [
      { calls: [["update_theme", { settingsJson: JSON.stringify({ [real[0]]: "x" }) }]] },
      { text: "Done." },
    ],
    page(),
  )
  check(
    "a real one is written",
    accepted.ops.length === 1 && accepted.ops[0].kind === "update_theme",
  )
  check(
    "and reaches the theme",
    applyOps(page(), accepted.ops).settings[real[0]] === "x",
  )

  check(
    "the model is told which ids exist, grouped",
    (() => {
      /**
       * Seventy-two fields across twelve groups. Shown the current VALUES and
       * not the ids, a model has to guess — and a guess here is the silent
       * failure above rather than an error it can recover from.
       */
      const described = describeThemeSettings()
      return (
        described.includes("Typography") &&
        described.includes("Layout") &&
        real.every((id) => described.includes(id))
      )
    })(),
  )
}

// ===========================================================================
section("It knows what the store sells")
// ===========================================================================

{
  const facts = {
    storeName: "andrewullz",
    live: true,
    totalProducts: 42,
    publishedProducts: 2,
    products: [
      { title: "Lightroom Presets", type: "digital", priceCents: 1900, published: true },
      { title: "Free Starter Pack", type: "digital", priceCents: 0, published: true },
      { title: "Draft Course", type: "course", priceCents: 9900, published: false },
    ],
  }

  let seen = ""
  const { result } = await (async () => {
    const loop = themeAgent({
      provider: scriptedProvider([
        { calls: [["read_store", {}]] },
        {
          calls: [
            ["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "x" }) }],
          ],
        },
        { text: "Done." },
      ]),
      model: "test",
      prompt: "write a better headline",
      state: page(),
      page: "home",
      addable: ADDABLE_SECTIONS,
      readStore: async () => facts,
    })
    for (;;) {
      const step = await loop.next()
      if (step.done) return { result: step.value }
    }
  })()

  check("the run completes with the catalogue read", result.status === "succeeded", result.error ?? "")

  seen = describeStore(facts)
  check(
    "the catalogue names the real products and their prices",
    seen.includes("Lightroom Presets") && seen.includes("19.00") && seen.includes("andrewullz"),
    seen.slice(0, 120),
  )
  check("a free product is called free, not 0.00", seen.includes("free"))
  check("a draft is marked as one", seen.includes("(draft)"))
  check(
    "and a truncated list says how many are missing",
    // Thirty are fetched; forty-two exist. A model told three products exist
    // will write "our three products", which is wrong on the page.
    seen.includes("39 more"),
    seen,
  )

  check(
    "an empty store is told not to promise a catalogue",
    (() => {
      const empty = describeStore({
        storeName: "new-shop",
        live: false,
        totalProducts: 0,
        publishedProducts: 0,
        products: [],
      })
      return /no products yet/.test(empty) && /would render empty/.test(empty)
    })(),
  )
}

{
  /**
   * No reader at all — a caller that cannot reach a catalogue. The model must
   * be told rather than left to invent one, and the run must still finish.
   */
  const { result } = await run(
    [
      { calls: [["read_store", {}]] },
      { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "x" }) }]] },
      { text: "Done." },
    ],
    page(),
  )
  check("no catalogue means told, not hung", result.status === "succeeded", result.error ?? "")
}

{
  const route = untt(readFileSync(
    join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
    "utf8",
  ), "app/api/website-builder/themes/[installId]/agent/route.ts")
  check(
    "the catalogue is read as the user, so RLS decides what the model sees",
    (() => {
      /* The read itself lives in lib/website-builder/agent/store-facts-server.ts now (shared with Start with AI): the route hands it the creator's own client. */
      const handed = /readStore: \(\) => readStoreFacts\(supabase, /.test(route)
      const body = readFileSync(join(root, "lib/website-builder/agent/store-facts-server.ts"), "utf8")
      const at = handed ? 1 : -1
      /**
       * The service role would read every creator's catalogue and rely on this
       * route's filter being correct — one mistake and somebody else's
       * products are in a model's context. The user's own client cannot make
       * that mistake, because the policy is the check.
       */
      return (
        at > 0 &&
        /supabase\n?\s*\.from\("products"\)/.test(body) &&
        !/createAdminClient/.test(body) &&
        // and it is scoped to this creator as well, belt and braces
        /\.eq\("creator_id"/.test(body)
      )
    })(),
  )
}

// ===========================================================================
section("The conversation survives a refresh")
// ===========================================================================

{
  const chat = untt(readFileSync(join(root, "lib/website-builder/agent/chat.ts"), "utf8"), "lib/website-builder/agent/chat.ts")
  const route = untt(readFileSync(
    join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
    "utf8",
  ), "app/api/website-builder/themes/[installId]/agent/route.ts")
  const panel = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")

  check(
    "the question is recorded before the model is reached",
    /**
     * So a run that dies — a crash, a timeout, a closed tab — still leaves the
     * request in the transcript. One that only records what succeeded is one
     * where nobody can see the model was asked the same thing three times.
     */
    route.indexOf("await startThemeExchange(") < route.indexOf("themeAgent({"),
  )

  check(
    "and the transcript is written server-side, never posted by the client",
    /**
     * A client that writes its own transcript can write one that never
     * happened, and this is the record somebody consults to find out why their
     * page looks like it does.
     */
    /completeThemeExchange\(/.test(route) &&
      !/method: "POST"[\s\S]{0,200}\/chat/.test(panel) &&
      /createAdminClient/.test(chat),
  )

  check(
    "reading it uses the user's client, so RLS decides",
    (() => {
      const at = chat.indexOf("export async function readThemeChat")
      const body = chat.slice(at, chat.indexOf("export async function startThemeExchange"))
      return /await createClient\(\)/.test(body) && !/createAdminClient/.test(body)
    })(),
  )

  check(
    "a failed read is not shown as an empty conversation",
    /**
     * Swallowing the error would show somebody a blank panel and let them
     * believe their history was gone when it is sitting in the table.
     */
    /throw new ThemeChatUnavailableError/.test(chat) && /historyError/.test(panel),
  )

  check(
    "and restoring does not replay the operations",
    /**
     * Replaying them would apply the same edits a second time to a page that
     * already has them. The transcript is a record, not a script.
     */
    /* Read back by lib/website-builder/ask-restore.ts, which the panel draws from. */
    /const counted = activityFromOps\(Array\.isArray\(message\.ops\) \? message\.ops : \[\]\)/.test(untt(readFileSync(join(root, "lib/website-builder/ask-restore.ts"), "utf8"), "lib/website-builder/ask-restore.ts")) &&
      /open\.activity = question \? \{ \.\.\.counted, question \} : counted/.test(untt(readFileSync(join(root, "lib/website-builder/ask-restore.ts"), "utf8"), "lib/website-builder/ask-restore.ts")) &&
      /restoreExchanges\(body\.messages\)/.test(panel) &&
      !/onOp\(message/.test(panel),
  )
}

// ===========================================================================
section("An AI edit behaves exactly like an edit made by hand")
// ===========================================================================

/**
 * The AI writes the same state the panels write, which is the whole design —
 * but "the same state" is not the same as "the same code path". Every hand-edit
 * handler in the editor does things BESIDE calling setSections, and each one it
 * skipped was a real defect that looked, on screen, like the edit had worked.
 */
{
  const editor = untt(readFileSync(
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const at = editor.indexOf("const applyAiOp = useCallback")
  const body = editor.slice(at, editor.indexOf("}, [librarySchemas])", at))

  check(
    "an AI edit marks the editor dirty",
    /**
     * THE WORST OF THE THREE. `isDirty` is a manual flag — every hand-edit
     * handler sets it and this one did not, so the AI changed the page, the
     * preview updated, and Save stayed greyed out reading "Saved". The work
     * could not be saved and leaving the tab gave no warning: the entire AI
     * edit was lost on reload while looking like it had worked.
     */
    /setIsDirty\(true\)/.test(body),
  )

  check(
    "a section the AI deletes does not stay selected",
    /**
     * `removeSection` clears the selection when it deletes the open section.
     * Without this the inspector points at a section that no longer exists —
     * a blank settings panel beside a page that just changed, which reads as
     * the editor having broken.
     */
    /op\.kind === "remove_section"/.test(body) && /setSelectedPanel\(/.test(body),
  )

  check(
    "and a header logo written by the AI reaches the theme too",
    (() => {
      /**
       * The logo lives in two places: the header section and the theme
       * settings. `updateSectionSetting` mirrors one into the other. An AI
       * edit that skipped the mirror leaves them disagreeing, which surfaces
       * later as the logo reverting on another page.
       */
      return /LOGO_SYNC_HEADER_TO_THEME/.test(body) && /setSettingsDraft/.test(body)
    })(),
  )
}

{
  /**
   * Header nav links nest: a submenu item carries `parent_id` pointing at the
   * link it sits under. The editor's own delete cascades; an AI delete that did
   * not would leave blocks whose parent is gone, rendering as stray top-level
   * links in a navigation nobody thought they had touched.
   */
  const withNav: ThemeState = {
    sections: [
      {
        id: "header-1",
        type: "header",
        name: "Header",
        settings: {},
        blocks: [
          { id: "n1", type: "nav_link", settings: { label: "Shop" } },
          { id: "n2", type: "nav_link", settings: { label: "Shoes", parent_id: "n1" } },
          { id: "n3", type: "nav_link", settings: { label: "About" } },
        ],
      },
    ],
    settings: {},
  }

  const after = applyOps(withNav, [
    { kind: "remove_block", sectionId: "header-1", blockId: "n1" },
  ])

  check(
    "removing a parent link takes its children with it",
    after.sections[0].blocks?.map((b) => b.id).join() === "n3",
    after.sections[0].blocks?.map((b) => b.id).join(),
  )
}

// ===========================================================================
section("The panel does not drop what the run tells it")
// ===========================================================================

{
  const panel = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")

  check(
    "the agent's own words reach the screen",
    /**
     * The loop streams `thinking` between tool calls and the panel dropped it,
     * so a run that spent twenty seconds reading a section and the catalogue
     * showed "Working" and nothing else. Latest line only — commentary, not a
     * transcript.
     */
    (() => {
      /* Every progress line goes to the activity reader, which keeps the latest commentary and says it as the line. */
      const reader = untt(readFileSync(join(root, "lib/website-builder/ask-activity.ts"), "utf8"), "lib/website-builder/ask-activity.ts")
      return (
        /const next = reduceActivity\(e\.activity, event\)/.test(panel) &&
        /if \(type === "thinking"\) \{/.test(reader) &&
        /if \(activity\.last === "note" && activity\.note\) return firstSentence\(activity\.note\)/.test(reader)
      )
    })(),
  )

  check(
    "a run stops if you move to another page",
    (() => {
      /**
       * Switching pages swaps `sections` for a different page's, and the
       * operations coming back address the OLD page by id. Update, move and
       * remove all no-op on an id that is not there — but `add_section` names
       * no existing id and would land a new section on whichever page is open.
       * Somebody would find a pricing table on their About page with no idea
       * where it came from.
       */
      return (
        /const startedOn = live\.current\.page/.test(panel) &&
        /live\.current\.page !== startedOn/.test(panel) &&
        /controller\.abort\(\)/.test(panel)
      )
    })(),
  )

  check(
    "and the page is checked before an operation is applied, not after",
    (() => {
      const guard = panel.indexOf("live.current.page !== startedOn")
      const apply = panel.indexOf("onOp(event.op)")
      // A check that runs after the apply is a check that has already lost.
      return guard > 0 && apply > guard
    })(),
  )
}

// ===========================================================================
section("Autosave writes the draft, never the live site")
// ===========================================================================

{
  const editor = untt(readFileSync(
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")

  check(
    "autosave calls saveDraft, not handleSave",
    (() => {
      /**
       * THE TRAP THIS AVOIDS. `handleSave` PUBLISHES when the theme is live, so
       * an autosave wired to it would push every keystroke to the public
       * site — a half-written headline visible to customers, and no way to work
       * on something without shipping it.
       */
      const at = editor.indexOf("AUTOSAVE_DELAY_MS)")
      const effect = editor.slice(editor.lastIndexOf("useEffect(", at), at)
      return /saveDraft\(\{ quiet: true \}\)/.test(effect) && !/handleSave/.test(effect)
    })(),
  )

  check(
    "it is debounced, not fired on every change",
    /**
     * A drag produces a change per frame. A request per frame is a request
     * storm that arrives out of order, and the last one to land is not
     * necessarily the last one sent.
     */
    /setTimeout\(/.test(editor) && /clearTimeout\(timer\)/.test(editor),
  )

  check(
    "and it holds off while a save or a publish is already going",
    /if \(!isDirty \|\| saving \|\| publishing \|\| loading( \|\| syncConflict)?\) return/.test(editor),
  )

  check(
    "a failed autosave is not silent",
    (() => {
      /**
       * Quiet on success, loud on failure. Silence on a failed write is how
       * somebody keeps working for an hour against a server that stopped
       * accepting them.
       */
      const at = editor.indexOf("const saveDraft = async")
      const body = editor.slice(at, editor.indexOf("const publishChanges", at))
      /* Changed on purpose (round 34): the write is sendDraft's, which says why it failed; saveDraft puts that up, and tries again on its own when the reason passes. */
      const send = editor.slice(editor.indexOf("const sendDraft = async"), editor.indexOf("const sendDraftLatest"))
      return (
        /if \(!options\.quiet\) showNotification/.test(body) &&
        /* A failed save puts up the save banner, with what happened and what to do (lib/website-builder/save-problem.ts). */
        /problem: explainSaveProblem\(sectionsRes\.status, d, sent\)/.test(send) &&
        /setSaveProblem\(result\.problem\)\s*\n\s*scheduleRetry\(result\.problem\)/.test(body)
      )
    })(),
  )
}

{
  const editor = untt(readFileSync(
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")

  check(
    "'saved' and 'published' are two different facts",
    (() => {
      /**
       * One flag served both questions, and could — right up until autosave.
       * With drafts written every second `isDirty` is false almost always, so
       * a button reading it would say "Saved" on a published theme whose
       * visitors were still seeing last week's page.
       */
      return (
        /const \[unpublished, setUnpublished\] = useState\(false\)/.test(editor) &&
        // cleared by publishing, and by nothing else
        /setUnpublished\(false\)/.test(editor) &&
        (editor.match(/setUnpublished\(false\)/g) ?? []).length === 1
      )
    })(),
  )

  check(
    "and the live state survives a reload rather than resetting to comfortable",
    /**
     * Seeded from the server's own answer: `has_draft` is `draft_sections IS
     * NOT NULL`, and publishing nulls it. Starting at false would tell somebody
     * their site was up to date every time they opened the editor.
     */
    /if \(data\.has_draft\) setUnpublished\(true\)/.test(editor),
  )

  check(
    "the button offers Publish on a live theme and Save on a draft one",
    (() => {
      const at = editor.indexOf("const live = install?.status === \"published\"")
      const body = editor.slice(at, editor.indexOf("})()}", at))
      return (
        at > 0 &&
        /const pending = live \? unpublished : isDirty/.test(body) &&
        // Live: the button reads Publish and OPENS THE PANEL, whatever is
        // pending, because the panel is where the answer to "what is pending"
        // lives. Draft: Save while dirty, Saved once written, no panel.
        /* Changed on purpose (r67): a website not live yet has Publish beside Save on a computer, and one Publish key on a phone; Save is as it was. */
        /asPublish \? \(busyNow \? publishWords : "Publish"\) : saving \? "Saving" : pending \? "Save" : "Saved"/.test(body) &&
        /if \(!live\) \{ void handleSave\(\); return \}\s*setPublishOpen\(\(v\) => !v\)/.test(body) &&
        /\{!live && !isMobileView && \(/.test(body)
      )
    })(),
  )
}

// ===========================================================================
section("Switching pages does not lose or misfile work")
// ===========================================================================

{
  const editor = untt(readFileSync(
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const at = editor.indexOf("const handlePageChange = async (page: PageKey)")
  const body = editor.slice(at, editor.indexOf("\n  }", editor.indexOf("switchingPage.current = false", at)))

  check(
    "the page you are leaving is saved before you leave it",
    (() => {
      /**
       * This function replaces `sections` with the new page's, so anything not
       * yet written was simply gone — no warning, no save. Autosave narrowed
       * the window to a second and a half; it did not close it, and that is
       * exactly long enough to change a heading and click another page.
       *
       * AWAITED, so the write lands while `currentPage` and `sections` still
       * agree about which page they describe.
       */
      /* Round 25 (tests/builder25.test.ts): started as the switch starts, beside the read of the next page, and awaited before the next page is put in. */
      return /const leavingDirty = isDirty && !saving/.test(body) && /leavingDirty \? saveDraft\(\{ quiet: true \}\)/.test(body) && /const \[loaded, homeHF, savedOk\] = await Promise\.all\(\[[\s\S]*?saved,\s*\]\)/.test(body)
    })(),
  )

  check(
    "and an autosave cannot fire into the middle of the switch",
    (() => {
      /**
       * THE CORRUPTION AUTOSAVE CREATED. `currentPage` is set to the new page
       * BEFORE the new sections are awaited, so for a few hundred milliseconds
       * `currentPage` says "about" while `sections` still holds home's. An
       * autosave firing there writes HOME'S SECTIONS UNDER THE ABOUT KEY.
       */
      return (
        /switchingPage\.current = true/.test(body) &&
        /* Round Z4: a running restore holds autosave too. */
        /if \(switchingPage\.current(?: \|\| restoreHold\.current)?\) return/.test(editor)
      )
    })(),
  )

  check(
    "the guard is read when the timer fires, not when it was scheduled",
    (() => {
      /**
       * A ref, not state. State captured at schedule time would be false —
       * the switch had not started yet — which is precisely the case that
       * matters.
       */
      return /const switchingPage = useRef\(false\)/.test(editor)
    })(),
  )

  check(
    "and a failed switch does not turn autosave off forever",
    (() => {
      /**
       * The fetches can reject — a dropped connection, a 500 — and a flag left
       * true would switch autosave off for the rest of the session. Every
       * change after that would sit unsaved behind a guard nobody can see.
       */
      return /\} finally \{\s*switchingPage\.current = false/.test(body)
    })(),
  )
}

// ===========================================================================
section("The mobile sheet snaps where it should")
// ===========================================================================

/**
 * The detent maths, driven. Getting it wrong is a sheet that snaps to the
 * wrong stop — not something a type checker can see, and not something a
 * screenshot catches either, because it only shows up under a finger.
 *
 * THIS USED TO BE A MIRROR. The arithmetic was copied into this file with a
 * comment explaining that the component was "full of DOM and refs" and so
 * could not be imported. A mirror passes while the original changes; the only
 * thing it really pinned was itself. The maths now lives in a pure module —
 * components/website-builder/sheet-gestures — and both the component and this
 * file import the same functions.
 */
{
  const sheet = untt(readFileSync(
    join(root, "components/website-builder/mobile-editor-sheet.tsx"),
    "utf8",
  ), "components/website-builder/mobile-editor-sheet.tsx")

  const snap = (offsets: number[], current: number, velocity: number, totalDelta: number) =>
    snapTarget({ offsets, current, velocity, totalDelta })

  const { height, offsets } = offsetsFor({ viewport: 800, detents: [0.5, 0.92], peekHeight: 72 })

  check(
    "the offsets ascend, so index order is screen order",
    /**
     * THE BUG THIS CAUGHT, in code written minutes earlier. A larger fraction
     * is a SMALLER offset, so mapping ascending fractions produces descending
     * offsets — [336, 0], and with the peek appended, [336, 0, 664]. The flick
     * logic moves by index assuming the array is monotonic, so a flick down
     * from full went to half's index and then jumped straight to the peek.
     */
    offsets.every((v, i) => i === 0 || v > offsets[i - 1]),
    JSON.stringify(offsets),
  )

  check("the sheet is as tall as its tallest stop", height === 736, String(height))
  check("the peek leaves exactly peekHeight showing", height - offsets[offsets.length - 1] === 72)

  check("a slow drag from the peek stays at the peek", snap(offsets, 640, 0.01, 24) === 2)
  check("a flick up from the peek reaches half", snap(offsets, 640, -1.2, 40) === 1)
  check("a flick up from half reaches full", snap(offsets, 330, -1.2, 40) === 0)
  check(
    "a flick down from full lands on half, not shut",
    /**
     * The one that failed. Somebody nudging a full sheet down expects the next
     * stop, not the sheet disappearing.
     */
    snap(offsets, 10, 1.2, 40) === 1,
  )
  check("released between stops it takes the nearest", snap(offsets, 200, 0, 0) === 1)

  /**
   * HOW HARD YOU THREW IT DECIDES HOW FAR IT GOES.
   *
   * "Nearest stop, then one further if it was a flick" is the standard cheap
   * answer and feels like one: two stops is all it can express, so a hard
   * flick from the peek and a gentle one both move exactly one detent. Throw
   * the sheet at the top of the screen and it stops halfway, and you throw it
   * again.
   *
   * The release is projected instead — carry on from where the finger left, at
   * the speed it left, decelerating — so the distance is proportional to the
   * effort.
   */
  check(
    "a hard flick from the peek carries all the way to full",
    snap(offsets, 640, -2.6, 60) === 0,
    String(snap(offsets, 640, -2.6, 60)),
  )
  check(
    "and a gentle one from the same place only reaches half",
    snap(offsets, 640, -0.9, 30) === 1,
    String(snap(offsets, 640, -0.9, 30)),
  )
  check(
    "a deliberate flick never leaves the sheet where it was",
    // Projecting alone can land back on the stop it started at, and a flick
    // that changes nothing reads as the sheet ignoring you.
    snap(offsets, 336, -0.5, 12) === 0 && snap(offsets, 336, 0.5, 12) === 2,
  )
  check(
    "a resting finger's jitter does not carry it anywhere",
    // A pixel over four milliseconds reads as 0.25 px/ms. Without a floor on
    // what counts as a flick, that alone would move the sheet 40px off its stop.
    snap(offsets, 336, 0.25, 3) === 1,
  )

  check(
    "the snap is timed by how far it goes, not by a constant",
    /**
     * A fixed 360ms made closing from the peek — seventy pixels — take exactly
     * as long as opening from shut, and turned a fast flick into a slow crawl
     * the moment the finger lifted.
     */
    snapDuration(70, 0.4) < snapDuration(664, 0.4) &&
      snapDuration(400, 2.5) < snapDuration(400, 0.4),
    JSON.stringify([snapDuration(70, 0.4), snapDuration(664, 0.4), snapDuration(400, 2.5)]),
  )
  check(
    "and never so fast it reads as a jump, nor so slow it reads as lag",
    snapDuration(2, 5) >= 130 && snapDuration(2000, 0.01) <= 460,
    JSON.stringify([snapDuration(2, 5), snapDuration(2000, 0.01)]),
  )

  /**
   * THE SHEET LEAVES AT THE FINGER'S SPEED.
   *
   * The snap's curve leaves at 2.25 times its mean speed, and its duration
   * was distance / speed, so a sheet let go at 1 px/ms left at 2.25: a kick
   * the moment the finger came up. `snapMotion` picks the duration and the
   * first control point together so the opening slope IS the release speed,
   * across the range a thumb produces, and without ever overshooting.
   */
  {
    const cases: [number, number][] = [
      [-160, -1.0], // half-way up, released at a steady push
      [300, 1.2], // a firm pull towards the peek
      [60, 3], // a hard flick with little left, where the duration clamps short
      [400, 0.5], // a slow release far from the stop, where it clamps long
      [-40, -0.2], // barely moving
    ]
    const worst = Math.max(
      ...cases.map(([d, v]) => Math.abs(snapStartSpeed(d, snapMotion(d, v)) - Math.abs(v)) / Math.abs(v)),
    )
    check(
      "a release is carried on at the speed it was let go, within 1%",
      worst < 0.01,
      JSON.stringify(cases.map(([d, v]) => [d, v, snapMotion(d, v)])),
    )
    const oldKick = (() => {
      // The old pairing: the house curve over distance / speed.
      const d = 160, v = 1.0
      const ms = Math.max(130, Math.min(460, d / Math.max(v, 0.35)))
      return (d / ms) * (SNAP_CURVE[1] / SNAP_CURVE[0])
    })()
    check(
      "which the old duration did not: it left at 2.25 times the finger",
      Math.abs(oldKick - 2.25) < 0.01,
      String(oldKick),
    )
    check(
      "the curve never passes its end, so a sheet can never overshoot its stop",
      cases.every(([d, v]) => {
        const [x1, y1, x2, y2] = snapMotion(d, v).curve
        return x1 > 0 && x1 <= 1 && y1 >= 0 && y1 <= 1 && x2 >= 0 && x2 <= 1 && y2 === 1
      }),
    )
    check(
      "a finger that had stopped starts the sheet from rest, not with a lurch",
      snapMotion(200, 0).curve[1] === 0 && snapMotion(200, -0.8).curve[1] === 0,
      JSON.stringify([snapMotion(200, 0), snapMotion(200, -0.8)]),
    )
    /**
     * AND ONLY SLOWS FROM THERE. The house curve does not: its second
     * control point sits behind its first, and it speeds up to nearly twice
     * its opening slope a third of the way in. Handed a finger's speed at
     * the start, it pulled away from the finger two frames later, which the
     * feel probe measured before this was fixed.
     */
    const house = curveSlopes(SNAP_CURVE)
    check(
      "the house curve speeds up after it starts, which is why a release does not use it",
      Math.max(...house) > house[0] * 1.5,
      `${house[0].toFixed(2)} at the start, ${Math.max(...house).toFixed(2)} at most`,
    )
    const decelerates = (d: number, v: number) => {
      const p = curveSlopes(snapMotion(d, v).curve)
      return p.every((x, i) => i === 0 || x <= p[i - 1] + 1e-3)
    }
    check(
      "a release that starts at the finger's speed only slows from there",
      decelerates(-160, -1.0) && decelerates(300, 1.2) && decelerates(60, 3) && decelerates(120, 0.6),
      JSON.stringify([snapMotion(-160, -1.0), snapMotion(300, 1.2), snapMotion(60, 3), snapMotion(120, 0.6)]),
    )
  }

  /**
   * PAST THE TALLEST STOP IT GIVES, IT DOES NOT STOP DEAD.
   *
   * The old drag worked out a third of the overshoot and then clamped it
   * away, so the top stop was a wall. The band follows the finger at a
   * falling rate, never passes its limit, and says how fast the sheet itself
   * is moving so the spring back leaves at that speed.
   */
  check(
    "pulled past the top stop, the sheet follows at a falling rate",
    dragPosition(-40, 0, 664) < 0 &&
      dragPosition(-40, 0, 664) > -40 &&
      dragPosition(-200, 0, 664) < dragPosition(-40, 0, 664) &&
      dragPosition(-100000, 0, 664) > -RUBBER_BAND_LIMIT_PX,
    JSON.stringify([dragPosition(-40, 0, 664), dragPosition(-200, 0, 664), dragPosition(-100000, 0, 664)]),
  )
  check(
    "between the stops it is exactly the finger",
    dragPosition(123, 0, 664) === 123 && dragPosition(0, 0, 664) === 0,
  )
  check(
    "and below the closed position it stops, so the canvas's reserve never shows",
    dragPosition(700, 0, 664) === 664,
  )
  check(
    "the band is continuous at the stop and its slope is the finger's share",
    rubberBand(0) === 0 &&
      Math.abs(rubberBandSlope(1e-6) - 0.55) < 1e-6 &&
      Math.abs((rubberBand(1e-3) - rubberBand(0)) / 1e-3 - 0.55) < 1e-3 &&
      rubberBandSlope(200) < rubberBandSlope(20),
  )
  check(
    "a release in the band leaves at the sheet's speed, not the finger's",
    sheetVelocityAt(-100, 0, -2) > -2 && sheetVelocityAt(-100, 0, -2) < 0 && sheetVelocityAt(50, 0, -2) === -2,
  )

  /**
   * HOLD STILL, THEN LIFT: NOT A FLICK.
   *
   * Browsers send no touchmove for a finger that is not moving, so the last
   * samples before a pause are the fast ones. The release time says the
   * pause happened; a lift straight off a moving finger is left alone.
   */
  {
    const fast = [
      { y: 400, t: 0 },
      { y: 380, t: 16 },
      { y: 360, t: 32 },
      { y: 340, t: 48 },
    ]
    check(
      "a quick drag held still for half a second before lifting is not a flick",
      Math.abs(releaseVelocity(fast)) > 1 && Math.abs(releaseVelocity(fast, 548)) < 0.4,
      JSON.stringify([releaseVelocity(fast), releaseVelocity(fast, 548)]),
    )
    check(
      "and a lift a frame after the last move keeps its speed",
      releaseVelocity(fast, 56) === releaseVelocity(fast),
    )
  }

  /** The coast a list gets when the sheet was feeding it by hand. */
  check(
    "a list let go mid-push glides and slows, the way a scroll view does",
    coastVelocity(2, 0) === 2 &&
      coastVelocity(2, 500) < 2 * 0.4 &&
      coastDistance(2, 16) > 30 &&
      coastDistance(2, 16) < 32 &&
      coastDistance(2, 3000) < 2 / -Math.log(0.998) + 1e-6,
    JSON.stringify([coastVelocity(2, 500), coastDistance(2, 16), coastDistance(2, 3000)]),
  )

  const single = offsetsFor({ viewport: 800, detents: [0.5], peekHeight: 72 })
  check(
    "one detent still behaves like the old two-position sheet",
    single.offsets.length === 2 && single.offsets[0] === 0,
    JSON.stringify(single.offsets),
  )

  check(
    "and the component gets its offsets from the module the assertions above drive",
    /**
     * This used to grep the component for `.sort(...)`, because the component
     * did the sorting. It does not any more — `offsetsFor` does, and the check
     * above drives `offsetsFor` directly. What is worth pinning now is that
     * the component has not gone back to computing its own.
     */
    /offsetsFor\(\{ viewport, detents: stops, peekHeight: peek, safeTop, barBottom: barEdge \}\)\.offsets/.test(sheet) &&
      !/const list = stops$/m.test(sheet),
  )

  check(
    "the sheet measures the visual viewport, not the window",
    /**
     * `window.innerHeight` does not change when the keyboard opens on iOS, so
     * a sheet measured against it puts its text box behind the keyboard. That
     * is the difference between a chat you can use on a phone and one you
     * cannot.
     */
    /window\.visualViewport/.test(sheet) && /vv\?\.addEventListener\("scroll", update\)/.test(sheet),
  )
}

// ===========================================================================
section("What a touch on the sheet is FOR")
// ===========================================================================

/**
 * The hard part of a bottom sheet, and the thing that was missing entirely.
 *
 * Before this, only a 28px grab bar carried touch handlers. A drag anywhere
 * else — the tabs, the section list, the settings, the ninety-odd percent of
 * the sheet a thumb actually lands on — did nothing at all. "The dragging is
 * not accurate" is not an imprecise drag; it is an absent one.
 *
 * Handing every touch to the sheet instead is the opposite failure: a list you
 * cannot scroll. So the same downward drag has to mean "close the sheet" when
 * the content is at its top and "scroll" when it is not, decided once per
 * gesture.
 */
{
  const sheet = untt(readFileSync(
    join(root, "components/website-builder/mobile-editor-sheet.tsx"),
    "utf8",
  ), "components/website-builder/mobile-editor-sheet.tsx")

  check(
    "a touch that has barely moved is a tap, and moves nothing",
    dragIntent({ deltaX: 2, deltaY: 3, scrollTop: 0, hasScroller: false }) === "undecided",
  )
  check(
    "a sideways swipe belongs to whatever is underneath",
    dragIntent({ deltaX: 40, deltaY: 10, scrollTop: 0, hasScroller: true }) === "scroll",
  )
  check(
    "where nothing scrolls, every vertical drag is the sheet's",
    dragIntent({ deltaX: 0, deltaY: 30, scrollTop: 0, hasScroller: false }) === "sheet" &&
      dragIntent({ deltaX: 0, deltaY: -30, scrollTop: 0, hasScroller: false }) === "sheet",
  )
  check(
    "pulling down from the top of a list closes the sheet",
    /** The content cannot go further that way, so it can only mean the sheet. */
    dragIntent({ deltaX: 0, deltaY: 30, scrollTop: 0, hasScroller: true }) === "sheet",
  )
  check(
    "but pulling down mid-list scrolls, which is the whole point",
    dragIntent({ deltaX: 0, deltaY: 30, scrollTop: 220, hasScroller: true }) === "scroll",
  )
  check(
    "and pushing up in a list scrolls even at the top",
    dragIntent({ deltaX: 0, deltaY: -30, scrollTop: 0, hasScroller: true }) === "scroll",
  )
  check(
    "at the half stop too: a push up inside the list scrolls the list, it does not grow the sheet first",
    /**
     * The rule this replaced grew the sheet to full before a single row
     * scrolled. The owner reads the Sections list at half with the canvas
     * above it, so the list scrolls at every stop now, the iOS medium detent
     * whose content scrolls (prefersScrollingExpandsWhenScrolledToEdge =
     * false). The sheet moves from what does not scroll: the grab bar, the
     * tabs, a pull down at the top of the list.
     */
    dragIntent({ deltaX: 0, deltaY: -30, scrollTop: 0, hasScroller: true }) === "scroll" &&
      dragIntent({ deltaX: 0, deltaY: -30, scrollTop: 220, hasScroller: true }) === "scroll" &&
      dragIntent({ deltaX: 0, deltaY: 30, scrollTop: 220, hasScroller: true }) === "scroll" &&
      dragIntent({ deltaX: 40, deltaY: -10, scrollTop: 0, hasScroller: true }) === "scroll",
  )
  check(
    "and the component no longer asks whether the sheet could grow",
    !/canExpand/.test(sheet) && !/canExpand/.test(untt(readFileSync(join(root, "components/website-builder/sheet-gestures.ts"), "utf8"), "components/website-builder/sheet-gestures.ts")),
  )
  check(
    "a hand-off that turns back up gives the rest of the push to the list, and the sheet keeps its place",
    JSON.stringify(expandCarry(40, 0)) === JSON.stringify({ sheetY: 40, scrollBy: 0 }) &&
      JSON.stringify(expandCarry(-25, 0)) === JSON.stringify({ sheetY: 0, scrollBy: 25 }),
  )
  /**
   * A TAP ON THE GRAB BAR STEPS THE SHEET. Closed to half, half to full,
   * full to half, so full is one tap away and never a gesture to discover.
   */
  {
    const { offsets: stops } = offsetsFor({ viewport: 844, detents: [0.5, 0.92], peekHeight: 72 })
    const [full, half, closed] = stops
    check(
      "a tap on the grab bar: closed opens to half, half goes to full, full comes back to half",
      tapTarget(stops, closed) === 1 && tapTarget(stops, half) === 0 && tapTarget(stops, full) === 1,
      JSON.stringify(stops),
    )
    check(
      "caught between stops it steps from the nearest one",
      tapTarget(stops, half - 20) === 0 && tapTarget(stops, closed - 30) === 1,
    )
    check(
      "a content-fit sheet, open, has nowhere to step and stays",
      tapTarget([0, 500], 0) === 0 && tapTarget([0, 500], 500) === 0,
    )
    check(
      "a tap is short and still; a press or a drag is not",
      isTap({ distance: 3, ms: 120 }) && !isTap({ distance: 9, ms: 120 }) && !isTap({ distance: 2, ms: 600 }),
    )
    check(
      "a touch the system cancelled, or a second finger joined, is never a tap",
      !isTap({ distance: 0, ms: 40, cancelled: true }) && isTap({ distance: 0, ms: 40, cancelled: false }),
    )
    check(
      "the component answers a grab bar tap with that step, and cancels the browser's mouse copy of it",
      /const tapped = drag\.current\.onHandle && isTap\(\{ distance: drag\.current\.travel, ms: now - drag\.current\.downTime, cancelled \}\)/.test(sheet) &&
        /tapped \? tapTarget\(list, tapFrom\)/.test(sheet) &&
        /if \(endDrag\(eventTime\(e\), e\.type === "touchcancel"\) && e\.cancelable\) e\.preventDefault\(\)/.test(sheet) &&
        /window\.addEventListener\("touchcancel", onEnd\)/.test(sheet),
    )
    check(
      "a second finger ends a drag as cancelled, not as a tap",
      /if \(e\.touches\.length !== 1\) \{\s*if \(drag\.current\.active\) endDrag\(eventTime\(e\), true\)/.test(sheet),
    )
    /**
     * THE BROWSER'S MOUSE COPY OF A TAP IS IGNORED, A REAL MOUSE NEVER IS.
     * It was every mousedown within 800ms of any touch anywhere, which on a
     * laptop with a touchscreen swallowed a real click on the grab bar.
     */
    check(
      "a mouse press is the copy of a touch only where the browser says so, or soon after it and where it was",
      isCompatibilityMouse({ firesTouchEvents: true, msSinceTouch: 5000, distanceFromTouch: 300 }) &&
        !isCompatibilityMouse({ firesTouchEvents: false, msSinceTouch: 10, distanceFromTouch: 0 }) &&
        isCompatibilityMouse({ msSinceTouch: 30, distanceFromTouch: 2 }) &&
        !isCompatibilityMouse({ msSinceTouch: 150, distanceFromTouch: 300 }) &&
        !isCompatibilityMouse({ msSinceTouch: 900, distanceFromTouch: 0 }),
    )
    check(
      "the grab bar's mousedown asks that, and takes the primary button only",
      /if \(e\.button !== 0\) return/.test(sheet) &&
        /isCompatibilityMouse\(\{\s*firesTouchEvents: source\?\.firesTouchEvents,/.test(sheet) &&
        !/lastTouchAt/.test(sheet),
    )
    /**
     * A CONTROL THAT HANDLES ITS OWN TOUCH KEEPS IT. The section rows' reorder
     * grip is `touch-none` and was not marked, so a long press and a pull
     * down reordered a row inside a sheet that was closing under it.
     */
    check(
      "a touch on data-sheet-no-drag, a range input, a role=slider or anything touch-action: none never arms the sheet",
      /if \(ownsItsTouch\(e\.target, sheet, handleRef\.current\)\) return/.test(sheet) &&
        /node\.hasAttribute\("data-sheet-no-drag"\)/.test(sheet) &&
        /node instanceof HTMLInputElement && node\.type === "range"/.test(sheet) &&
        /node\.getAttribute\("role"\) === "slider"/.test(sheet) &&
        /getComputedStyle\(node\)\.touchAction === "none"/.test(sheet) &&
        /if \(node === handle\) return false/.test(sheet),
    )
  }
  /**
   * EASIER TO FLICK. 0.25 px/ms over more than 8px from touchdown (it was
   * 0.4 over 8px from where the sheet took the gesture, 14px and more): a
   * short deliberate nudge leaves at 0.35 to 0.5 px/ms, a placed release
   * under 0.15.
   */
  {
    const { offsets: stops } = offsetsFor({ viewport: 844, detents: [0.5, 0.92], peekHeight: 72 })
    check(
      "a short flick up from half, 0.35 px/ms over 10px, reaches full",
      snapTarget({ offsets: stops, current: stops[1] - 10, velocity: -0.35, totalDelta: -10 }) === 0,
    )
    check(
      "the same from closed opens to half, not straight past it",
      snapTarget({ offsets: stops, current: stops[2] - 10, velocity: -0.35, totalDelta: -10 }) === 1,
    )
    check(
      "a placed release, 0.12 px/ms, stays where it was put",
      snapTarget({ offsets: stops, current: stops[1] - 60, velocity: -0.12, totalDelta: -60 }) === 1,
    )
    check("the thresholds are the ones argued for", VELOCITY_THRESHOLD === 0.25 && FLICK_MIN_DISTANCE === 8)
    check(
      "and the distance is the finger's from touchdown, so a flick the browser held back its first moves of still counts",
      /const totalDelta = tapped \? 0 : drag\.current\.lastY - drag\.current\.downY/.test(sheet),
    )
  }
  check(
    "a scroll that runs out of list going down hands the finger to the sheet",
    /**
     * Decided once is right for most of a gesture and wrong for this one: a
     * finger scrolling a list back to its top and carrying on. The list has
     * nothing left, so the sheet takes the rest of the same gesture.
     */
    handOffToSheet({ scrollTop: 0, stepY: 4, horizontal: false }) &&
      !handOffToSheet({ scrollTop: 12, stepY: 4, horizontal: false }) &&
      !handOffToSheet({ scrollTop: 0, stepY: -4, horizontal: false }) &&
      !handOffToSheet({ scrollTop: 0, stepY: 4, horizontal: true }),
  )

  /**
   * A thumb travelling up a phone drifts sideways. A sheet that refuses to
   * open because the arc was not vertical enough is infuriating in a way
   * nobody can describe, so the horizontal test is biased, not a tie-break.
   */
  check(
    "a mostly-vertical drag with some sideways drift still opens the sheet",
    dragIntent({ deltaX: 14, deltaY: -30, scrollTop: 0, hasScroller: false }) === "sheet",
  )

  check(
    "the release speed is the speed at RELEASE, not the average of the drag",
    /**
     * THE BUG. The old calculation was (lastY - startY) / (lastTime -
     * startTime) — the mean over the whole gesture. Pull a sheet slowly for
     * two seconds and then flick, and that reads as slow: the flick is
     * averaged away and the sheet settles where it was.
     *
     * Same samples, both ways. The mean is ~0.06 px/ms, under the 0.4
     * threshold; the last 100ms is 1.0 and carries the sheet on.
     */
    (() => {
      const samples = [
        { y: 400, t: 0 },
        { y: 380, t: 900 },
        { y: 360, t: 1800 },
        { y: 300, t: 1850 },
        { y: 250, t: 1900 },
      ]
      const mean = (samples[4].y - samples[0].y) / (samples[4].t - samples[0].t)
      return Math.abs(mean) < 0.4 && Math.abs(releaseVelocity(samples)) > 0.4
    })(),
  )
  check(
    "a gesture that stops before the finger lifts is not a flick",
    releaseVelocity([
      { y: 400, t: 0 },
      { y: 200, t: 40 },
      { y: 198, t: 120 },
      { y: 198, t: 200 },
    ]) < 0.4,
  )
  check(
    "one sample is no speed at all, rather than a division by zero",
    releaseVelocity([{ y: 10, t: 5 }]) === 0 &&
      Number.isFinite(releaseVelocity([{ y: 10, t: 5 }, { y: 90, t: 5 }])),
  )

  // ── and that the component actually uses all of it ──────────────────────

  check(
    "the whole sheet takes touches, not a 28px handle",
    /**
     * Anchored on `sheetRef` inside the listener registration: asserting on
     * `addEventListener\("touchstart"` alone would pass if it were attached to
     * the grab bar, which is the defect.
     */
    /sheet\.addEventListener\("touchstart", onStart/.test(sheet) &&
      /const sheet = sheetRef\.current/.test(
        sheet.slice(sheet.indexOf("TOUCH, ON THE WHOLE SHEET"), sheet.indexOf("Global mouse listeners")),
      ),
  )
  check(
    "touchmove is registered non-passively, or preventDefault is a no-op",
    /**
     * React attaches touchmove PASSIVELY at the root, so an onTouchMove that
     * calls preventDefault does nothing but log a warning — and the browser
     * keeps its own overscroll and pull-to-refresh while the sheet is being
     * dragged. Hence the hand-registered listener.
     */
    /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(sheet) &&
      !/onTouchMove=/.test(sheet),
  )
  check(
    "and it only preventDefaults once the sheet owns the gesture",
    // Doing it unconditionally kills scrolling inside the sheet entirely.
    /if \(drag\.current\.intent === "sheet" && e\.cancelable\) e\.preventDefault\(\)/.test(sheet),
  )
  check(
    "and React really does register touchmove passively, which is why",
    /**
     * NOT FROM MEMORY. Read out of the installed React: it registers
     * touchstart, touchmove and wheel with `passive: true` on the root
     * container, so `preventDefault` inside an `onTouchMove` prop is ignored.
     *
     * If a React upgrade ever changes that, this goes red and the
     * hand-registered listener above can be simplified back to a prop. Until
     * then it is load-bearing.
     */
    (() => {
      const path = join(root, "node_modules/react-dom/cjs/react-dom-client.development.js")
      if (!existsSync(path)) return false
      const react = untt(readFileSync(path, "utf8"), path)
      return /passiveBrowserEventsSupported \|\|\s*\("touchstart" !== domEventName &&\s*"touchmove" !== domEventName/.test(
        react,
      )
    })(),
  )
  check(
    "touch-action is pan-y, so children still scroll on the compositor",
    /touchAction: "pan-y"/.test(sheet) && !/touchAction: "none"/.test(sheet),
  )
  check(
    "except on the grab bar, where a touch can only mean the sheet",
    /**
     * With `pan-y` inherited, a browser could start a pan of its own from
     * the handle before the first move reached the sheet, and every move
     * after that arrives uncancellable.
     */
    /ref=\{handleRef\}\s*\n\s*className="[^"]*\btouch-none\b/.test(sheet),
  )
  check(
    "a finger is timed by when it moved, not by when the handler ran",
    /moveDrag\(touch\.clientY, touch\.clientX, eventTime\(e\), e\.cancelable\)/.test(sheet) &&
      /endDrag\(eventTime\(e\)\)/.test(sheet),
  )
  check(
    "the decision is made once and kept for the rest of the gesture",
    /if \(drag\.current\.intent === "undecided"\) \{/.test(sheet) &&
      /drag\.current\.intent = dragIntent\(\{/.test(sheet),
  )
  check(
    "the drag starts where the finger is now, so the sheet does not jump",
    // The threshold has already been travelled; counting it would snap the
    // sheet six pixels the instant it takes over.
    /if \(drag\.current\.intent === "sheet"\) \{\s*drag\.current\.startY = clientY/.test(sheet),
  )
  check(
    "a gesture the sheet never took does not snap it",
    /if \(!wasDragging\) \{/.test(sheet),
  )
  check(
    "and that gesture gives the overlay back its taps",
    /**
     * `startDrag` deafens the overlay at touchdown, before anyone knows what
     * the gesture is. A scroll that did not restore it leaves an overlay that
     * no longer closes the sheet when tapped.
     *
     * The restore goes through `settleOverlay` now, which hands back the
     * opacity in the same breath. Handing back only the taps is what left a
     * backdrop at opacity 0 with `pointer-events: auto` — invisible, over the
     * whole screen, and swallowing every touch. The rule here is unchanged;
     * what it points at is the one place allowed to do it.
     */
    /settleOverlay\(openRef\.current\)/.test(
      sheet.slice(sheet.indexOf("if (!wasDragging) {")),
    ),
  )
  check(
    "a pinch is not a drag",
    /if \(e\.touches\.length !== 1\)/.test(sheet),
  )
  check(
    "the listeners attach once the sheet is in the DOM, not before it exists",
    // `mounted` gates the render; an effect with [] would attach to null and
    // never try again.
    /\}, \[mounted\]\)/.test(sheet),
  )
  check(
    "one transform write per frame, not one per touch event",
    /**
     * `touchmove` fires more than once between paints on a 120Hz panel, and
     * every extra write to `style.transform` in the same frame is a style
     * recalculation the compositor then throws away.
     */
    /requestAnimationFrame\(\(\) => \{/.test(sheet) && /pendingY\.current = y/.test(sheet),
  )
  check(
    "but the snap writes straight through",
    /**
     * A queued frame carrying the last DRAG position would fire after the
     * transition was turned on and animate the sheet back to the finger.
     */
    /cancelAnimationFrame\(rafId\.current\)/.test(sheet) &&
      /applyTransformNow\(targetY\)/.test(sheet),
  )
  check(
    "the maths is imported by the component, not copied into it",
    /from "\.\/sheet-gestures"/.test(sheet) &&
      /snapTarget\(\{ offsets: list, current, velocity, totalDelta \}\)/.test(sheet),
  )
}

// ===========================================================================
section("Ask Storelib on a phone: the keyboard, and nothing sideways")
// ===========================================================================
/**
 * Two iPhone screenshots: with the keyboard up the header sat under the
 * clock and a band of white sat between the composer and the keys; and the
 * thread scrolled sideways with every message cut off on the left.
 * scripts/check-chat-keyboard.mjs measures both on the real components; this
 * pins the source that the measurement depends on.
 */
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const chat = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")
  /* The run's code preview lives with the live activity now (the old work panel is gone). */
  const panel = untt(readFileSync(join(root, "components/website-builder/ask-activity.tsx"), "utf8"), "components/website-builder/ask-activity.tsx")
  const parts = untt(readFileSync(join(root, "components/website-builder/ask-parts.tsx"), "utf8"), "components/website-builder/ask-parts.tsx")
  const picker = untt(readFileSync(join(root, "components/website-builder/ask-model-picker.tsx"), "utf8"), "components/website-builder/ask-model-picker.tsx")
  const sheet = untt(readFileSync(join(root, "components/website-builder/mobile-editor-sheet.tsx"), "utf8"), "components/website-builder/mobile-editor-sheet.tsx")
  const editor = untt(readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const css = untt(readFileSync(join(root, "app/globals.css"), "utf8"), "app/globals.css")

  check(
    "a new message scrolls the thread itself, never scrollIntoView, which also moved the sheet and the document",
    !/scrollIntoView\(/.test(strip(chat)) && /thread\.scrollTo\(\{ top: end, behavior: "smooth" \}\)/.test(chat),
  )
  /**
   * A RUN STREAMING IN DOES NOT PULL A READER DOWN. Every streamed line is a
   * new `exchanges` and each one scrolled to the end; somebody reading an
   * earlier answer was dragged back on every step. The thread follows only
   * while pinned to its end, and a new exchange (a message sent) pins it.
   * Measured by scripts/check-chat-keyboard.mjs (STREAMING).
   */
  check(
    "the thread follows a run only while its reader is at the end",
    /pinned\.current = thread\.scrollHeight - thread\.scrollTop - thread\.clientHeight <= PIN_SLACK_PX/.test(chat) &&
      /if \(added\) pinned\.current = true\s*\n\s*if \(!pinned\.current\) return/.test(chat) &&
      /\}, \[exchanges, queued\]\)/.test(chat),
  )
  check(
    "a smooth scroll of its own does not unpin it, unless a finger or a wheel takes over",
    /if \(performance\.now\(\) < autoScrollUntil\.current\) return/.test(chat) &&
      /thread\.addEventListener\("touchstart", onReader/.test(chat) &&
      /thread\.addEventListener\("wheel", onReader/.test(chat),
  )
  check(
    "and every listener and the observer it adds, it removes",
    /thread\.removeEventListener\("scroll", onScroll\)/.test(chat) &&
      /thread\.removeEventListener\("touchstart", onReader\)/.test(chat) &&
      /thread\.removeEventListener\("wheel", onReader\)/.test(chat) &&
      /thread\.removeEventListener\("pointerdown", onReader\)/.test(chat) &&
      /ro\.disconnect\(\)/.test(chat),
  )
  check(
    "the composer wraps a long path or URL instead of running past the clipped edge",
    /<div data-ask-tray="" className=\{cn\("min-w-0 \[overflow-wrap:anywhere\]"/.test(chat),
  )
  /* On a phone the header's and the composer's buttons ARE 44px now, not
     28px ones with an invisible press area around them. The small crosses
     (a picture's, the scope chip's) keep a 44px `after` box. */
  check(
    "the composer's and the header's buttons answer a 44px thumb",
    /phone \? "h-11 w-11" : "h-8 w-8"/.test(chat) &&
      /phone \? "h-11 w-11" : "h-9 w-9"/.test(chat) &&
      /phone \? "h-11 pl-3 pr-2\.5" : "h-9 pl-2\.5 pr-2"/.test(picker) &&
      (chat.match(/after:absolute after:-inset-3 after:content-\[''\]/g) ?? []).length >= 2 &&
      /after:absolute after:-inset-3 after:content-\[''\]/.test(parts),
  )
  check(
    "the thread scrolls up and down only: x hidden, long words broken, a vertical pan",
    /data-chat-thread=""\s*\n\s*className="[^"]*\boverflow-x-hidden\b[^"]*\[overflow-wrap:anywhere\][^"]*\[touch-action:pan-y\]/.test(chat),
  )
  check(
    "the chat column is never wider than the panel, and fills the sheet above its padding",
    /className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background \[overflow-x:clip\]"/.test(chat),
  )
  check(
    "the scope chip and the whole-page button truncate instead of pushing the row wider",
    /<span className="min-w-0 truncate">\s*<span className="text-\[#6b7280\]">Editing:<\/span> \{name\}\s*<\/span>/.test(parts) &&
      /<span className="min-w-0 truncate">Limit to \{name\}<\/span>/.test(parts) &&
      /data-ask-scope-row="" className="mb-2 flex min-w-0 flex-nowrap items-center gap-2"/.test(chat),
  )
  check(
    "a code block scrolls sideways inside itself, and only it",
    /<pre\s*\n\s*data-code-scroll=""\s*\n(\s*aria-label=[^\n]*\n)?\s*className="(mt-1\.5 )?max-h-44 max-w-full overflow-auto[^"]*\[touch-action:pan-x_pan-y\]/.test(panel),
  )
  check(
    "the sheet clips rather than hides, so no script can scroll its content out of place",
    /overflow: "clip",/.test(sheet),
  )
  check(
    "a sheet opened over the page puts back a document the browser scrolled to show a field",
    /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(sheet) && /if \(window\.scrollY !== y\) window\.scrollTo\(0, y\)/.test(sheet),
  )
  check(
    "a field typed into inside the sheet stands it at its tallest stop until the keyboard goes",
    /const lifted = expanders\.length > 0 \|\| keyboardHere/.test(sheet) &&
      /setKeyboardHere\(/.test(sheet) &&
      /sheetRef\.current\?\.contains\(active\)/.test(sheet),
  )
  check(
    /* Round 24: 80% of the screen ("reduce the sheet height ... like 20%"); the stops' arithmetic below is unchanged. */
    "the AI sheet's tallest stop is 80% of the screen",
    /const AI_SHEET_DETENTS = \[0\.5, 0\.8\]/.test(editor) &&
      /<MobileEditorSheet open=\{aiOpen\}[\s\S]{0,200}?detents=\{AI_SHEET_DETENTS\}[^>\n]*>/.test(editor) &&
      /offsetsFor\(\{ viewport, detents: stops, peekHeight: peek, safeTop, barBottom: barEdge \}\)/.test(sheet),
  )
  /**
   * THE TALLEST STOP COVERS THE BAR OR CLEARS IT. At 92% of 844 the top edge
   * is 68px, and with a 59px status bar the editor's bar runs to 107 with its
   * buttons from 67: one violet pixel row of Ask AI at the sheet's corners.
   */
  {
    const at = (detents: number[], safeTop: number, barBottom: number) =>
      844 - offsetsFor({ viewport: 844, detents, peekHeight: 72, safeTop, barBottom }).height
    check(
      "a 92% stop on a notched phone clears the whole bar with a gap, instead of cutting across its buttons",
      at([0.5, 0.92], 59, 107) === 107 + BAR_GAP_PX,
      String(at([0.5, 0.92], 59, 107)),
    )
    check(
      "in a browser, where the bar ends at 48, the 92% stop is already clear and stays at 68",
      at([0.5, 0.92], 0, 48) === 68,
    )
    check("a stop of 1 still covers the bar, at the status bar", at([0.5, 1], 59, 107) === 59 && at([0.5, 1], 0, 48) === 0)
    check("with no bar marked the stops are what they were", at([0.5, 0.92], 59, 0) === 68 && at([0.92], 0, 0) === 68)
    check(
      "the half stop does not move",
      [[59, 107], [0, 48], [59, 0]].every(([s, b]) => {
        const g = offsetsFor({ viewport: 844, detents: [0.5, 0.92], peekHeight: 72, safeTop: s, barBottom: b })
        return 844 - g.height + g.offsets[1] === 422
      }),
    )
    check(
      "and a keyboard does not lift a 92% sheet into the bar either",
      844 - keyboardCeiling({ viewport: 844, tallestHeight: 844 - at([0.5, 0.92], 59, 107), safeTop: 59, visibleTop: 0, barBottom: 107 }) === 107 + BAR_GAP_PX &&
        844 - keyboardCeiling({ viewport: 844, tallestHeight: Math.round(844 * 0.78), safeTop: 59, visibleTop: 0, barBottom: 107 }) === 107 + BAR_GAP_PX,
    )
    check(
      "the editor's bar is what is marked, and the sheet measures it off the element",
      /<header className="wb-editor-topbar[^"]*" data-sheet-clear="">/.test(editor) &&
        /document\.querySelectorAll<HTMLElement>\("\[data-sheet-clear\]"\)/.test(sheet) &&
        /keyboardCeiling\(\{ viewport, tallestHeight: natural, safeTop, visibleTop, barBottom: barEdge \}\)/.test(sheet),
    )
  }
  check(
    "the panels that scroll inside the Sections sheet carry the room themselves",
    /* The Pages tab's scroller is the page list's own now (components/website-builder/page-switcher.tsx). */
    (editor.match(/<div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll/g) || []).length >= 5 &&
      /data-page-list-scroll=""\s*\n\s*data-sheet-scroll=""/.test(untt(readFileSync(join(root, "components/website-builder/page-switcher.tsx"), "utf8"), "components/website-builder/page-switcher.tsx")) &&
      /\[data-mobile-bottom-sheet\] \[data-sheet-scroll\]:has\(\[data-sheet-scroll\]:last-child\)::after \{\s*height: 0;/.test(css),
  )
}

{
  const editor = untt(readFileSync(
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  ), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check(
    "the AI exists on a phone",
    /**
     * It was `!isMobileView`, and its button was `hidden sm:flex` — so the
     * device most likely to want to describe a change rather than hunt for a
     * control had no way to.
     */
    /**
     * Anchored on the opening brace. `/isMobileView && aiOpen/` also matches
     * the DESKTOP branch's `!isMobileView && aiOpen`, so the assertion passed
     * with the mobile one deleted — a test that could not tell the two apart
     * was checking that the desktop panel existed.
     */
    // Mounted on first open and kept, so closing it is a slide and not a
    // vanish; `open` follows aiOpen.
    /\{isMobileView && aiMounted && !teamMember && \(\s*<MobileEditorSheet open=\{aiOpen\}/.test(editor) &&
      // and the button is no longer hidden below the `sm` breakpoint
      !/"h-8 w-8 hidden sm:flex items-center justify-center rounded-lg border transition-colors/.test(
        editor,
      ),
  )
  check(
    "and the two sheets do not fight over the bottom of the screen",
    /if \(isMobileView\) setMobileSidebarOpen\(false\)/.test(editor) &&
      /if \(next\) setAiOpen\(false\)/.test(editor),
  )
}

// ===========================================================================
section("Hiding a section is not deleting it")
// ===========================================================================

/**
 * The agent had exactly one way to take something off a page, and it was
 * destructive. "Take the FAQ off for now" and "delete the FAQ" reached the
 * same tool, so the questions somebody had written were gone and the only way
 * back was Undo — in that session, before a reload, if they noticed.
 *
 * The editor's own eye toggle has always done this properly. The agent writes
 * through the same flag now.
 */
{
  const { result } = await run(
    [
      { calls: [["set_section_visibility", { id: "faq-1", hidden: true }]] },
      { text: "Hidden for now." },
    ],
    pageWithFaq(),
  )
  const after = applyOps(pageWithFaq(), result.ops)
  const faq = after.sections.find((s) => s.id === "faq-1")

  check("a section can be hidden", faq?.hidden === true, JSON.stringify(result.ops))
  check("it is still on the page", after.sections.length === 3)
  check(
    "and its content is untouched, which is the whole point",
    faq?.blocks?.length === 2 &&
      faq?.blocks?.[0]?.settings.question === "What is your return policy?",
  )
}

{
  const hiddenPage = applyOps(pageWithFaq(), [
    { kind: "set_section_visibility", id: "faq-1", hidden: true },
  ])
  const { result } = await run(
    [
      { calls: [["set_section_visibility", { id: "faq-1", hidden: false }]] },
      { text: "Back." },
    ],
    hiddenPage,
  )
  const after = applyOps(hiddenPage, result.ops)
  check(
    "and shown again in one call, with everything still in it",
    after.sections.find((s) => s.id === "faq-1")?.hidden === false &&
      after.sections.find((s) => s.id === "faq-1")?.blocks?.length === 2,
  )
}

{
  /**
   * Hiding what is already hidden must not count as a change. It would stream
   * to the browser, land in the transcript as work that was done, and satisfy
   * the "did anything actually happen" check with nothing to show.
   */
  const hiddenPage = applyOps(pageWithFaq(), [
    { kind: "set_section_visibility", id: "faq-1", hidden: true },
  ])
  const { result } = await run(
    [
      { calls: [["set_section_visibility", { id: "faq-1", hidden: true }]] },
      { text: "Already hidden." },
    ],
    hiddenPage,
  )
  check("hiding a hidden section is not reported as a change", result.ops.length === 0)
}

{
  const { result } = await run([
    { calls: [["set_section_visibility", { id: "nope-1", hidden: true }]] },
    { text: "Could not find it." },
  ])
  check("an id that is not there changes nothing", result.ops.length === 0)
}

{
  const { result } = await run([
    { calls: [["set_section_visibility", { id: "hero-1" }]] },
    { text: "Asked again." },
  ])
  check("and `hidden` has to be a boolean, not left to a default", result.ops.length === 0)
}

check(
  "the model is told delete means delete (every match), and hiding is for when they say hide, in the system prompt",
  /DELETE MEANS DELETE/.test(untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")) &&
    /every one that matches/.test(untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")) &&
    /set_section_visibility/.test(untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")),
)

/**
 * The applier is tested DIRECTLY as well as through the loop. The loop refuses
 * things before the applier sees them, so a loop-only test passes whether or
 * not the applier does the right thing — and the applier is the half that also
 * runs in the browser.
 */
{
  const direct = applyOps(pageWithFaq(), [
    { kind: "set_section_visibility", id: "faq-1", hidden: true },
  ])
  check(
    "the browser's applier hides the same section the server did",
    direct.sections.find((s) => s.id === "faq-1")?.hidden === true &&
      direct.sections.length === 3,
  )
  const untouched = applyOps(pageWithFaq(), [
    { kind: "set_section_visibility", id: "missing", hidden: true },
  ])
  check(
    "and an id it has never heard of leaves the page alone rather than throwing",
    untouched.sections.length === 3 &&
      untouched.sections.every((s) => !s.hidden),
  )
}

// ===========================================================================
section("The model can see the controls, not just their names")
// ===========================================================================

/**
 * EVERY SETTING IN THIS EDITOR IS A CONTROL — a slider with a range, a picker
 * with a list, a colour well, a toggle. The model was shown field IDS and
 * nothing else, so it wrote values blind: "rounded" into a select whose
 * choices are accordion | boxed | minimal, 500 into a slider that stops at
 * 120, "yes" into a toggle, "warm beige" into a colour.
 *
 * Every one of those merges cleanly and is then ignored by the renderer. The
 * tool says it worked and the page does not move — the same silent failure as
 * an unknown id, one level down.
 */
{
  const controls = describeFields("faq")
  check(
    "a select lists its actual choices",
    controls.includes("accordion | boxed | minimal"),
    controls.slice(0, 200),
  )
  check("a slider carries its range and step", /padding_top[^\n]*0-120 step 4/.test(controls))
  check("a toggle says what it takes", /show_count[^\n]*true or false/.test(controls))
  check("a colour says it wants a hex value", /bg_color[^\n]*hex colour/.test(controls))
  check(
    "and the label is there, so the model knows what the control is FOR",
    controls.includes("— Style:") && controls.includes("— Padding top:"),
  )
}

{
  /**
   * `header` and `paragraph` are the editor's own furniture — a group title
   * and a note. 163 of the schema's fields are `header`. Offering them as
   * writable is an invitation to write one, and a write to one merges a key
   * nothing reads.
   */
  const everyId = Object.keys(SECTION_SCHEMAS).flatMap((type) => fieldIds(type))
  const schemaFields = Object.values(SECTION_SCHEMAS).flatMap((schema) => schema.fields ?? [])
  const furniture = schemaFields.filter((f) => f.type === "header" || f.type === "paragraph")
  check("the schema really does contain that furniture", furniture.length > 100)
  check(
    "and none of it is offered as a setting the model may write",
    furniture.every((f) => !everyId.includes(f.id)),
  )
}

// ===========================================================================
section("A value the control cannot take is refused, not merged")
// ===========================================================================

{
  const { result } = await run(
    [
      { calls: [["update_section", { id: "faq-1", settingsJson: JSON.stringify({ style: "rounded" }) }]] },
      { text: "Tried." },
    ],
    pageWithFaq(),
  )
  check("a choice that is not on the picker changes nothing", result.ops.length === 0)
}

{
  const outputs: string[] = []
  const { result } = await run(
    [
      { calls: [["update_section", { id: "faq-1", settingsJson: JSON.stringify({ style: "rounded" }) }]] },
      { calls: [["update_section", { id: "faq-1", settingsJson: JSON.stringify({ style: "boxed" }) }]] },
      { text: "Fixed." },
    ],
    pageWithFaq(),
  )
  void outputs
  check(
    "and the model can recover, because it was told what the choices are",
    result.ops.length === 1 &&
      result.ops[0].kind === "update_section" &&
      (result.ops[0] as { settings: Record<string, unknown> }).settings.style === "boxed",
  )
}

{
  const { result } = await run(
    [
      {
        calls: [
          ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ bg_color: "warm beige" }) }],
        ],
      },
      { text: "Tried." },
    ],
    pageWithFaq(),
  )
  check("a colour that is not a colour changes nothing", result.ops.length === 0)
}

{
  const { result } = await run(
    [
      {
        calls: [
          ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ show_count: "yes" }) }],
        ],
      },
      { text: "Tried." },
    ],
    pageWithFaq(),
  )
  check("a toggle given a word that is not true or false changes nothing", result.ops.length === 0)
}

{
  /**
   * Coerced, not refused. "60" into a slider is a quoting slip and its meaning
   * is not in doubt; spending a round trip on it helps nobody.
   */
  const { result } = await run(
    [
      {
        calls: [
          [
            "update_section",
            { id: "faq-1", settingsJson: JSON.stringify({ padding_top: "40", show_count: "true" }) },
          ],
        ],
      },
      { text: "Done." },
    ],
    pageWithFaq(),
  )
  const settings = (result.ops[0] as { settings: Record<string, unknown> } | undefined)?.settings
  check(
    'a number sent as "40" is read as 40',
    settings?.padding_top === 40,
    JSON.stringify(settings),
  )
  check('and "true" is read as true', settings?.show_count === true)
}

{
  /**
   * CLAMPED, not refused. A slider that stops at 120 and a model that asked
   * for 500 agree about the direction; the control's own maximum is the
   * answer, and it is what the editor's slider would produce from the same
   * drag.
   */
  const { result } = await run(
    [
      {
        calls: [
          ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ padding_top: 500 }) }],
        ],
      },
      { text: "Done." },
    ],
    pageWithFaq(),
  )
  const settings = (result.ops[0] as { settings: Record<string, unknown> } | undefined)?.settings
  check("a slider is held to its maximum rather than written past it", settings?.padding_top === 120)
}

{
  const { result } = await run(
    [
      {
        calls: [
          [
            "add_block",
            {
              sectionId: "faq-1",
              blockType: "faq_item",
              index: -1,
              settingsJson: JSON.stringify({ question: "Do you ship?", open_by_default: "nope" }),
            },
          ],
        ],
      },
      { text: "Tried." },
    ],
    pageWithFaq(),
  )
  check("blocks are checked the same way sections are", result.ops.length === 0)
}

{
  const { result } = await run([
    {
      calls: [
        ["update_theme", { settingsJson: JSON.stringify({ logo_width: 9_000 }) }],
      ],
    },
    { text: "Done." },
  ])
  const settings = (result.ops[0] as { settings: Record<string, unknown> } | undefined)?.settings
  check(
    "and so are the theme's own controls",
    settings?.logo_width === 300,
    JSON.stringify(settings),
  )
}

// ===========================================================================
section("Building a section, with everything it needs to build it properly")
// ===========================================================================

{
  const { events } = await run([
    { calls: [["read_section_type", { sectionType: "pricing" }]] },
    { text: "Looked." },
  ])
  void events
  check(
    "a type can be read before it is added — the controls exist without a section",
    describeFields("pricing").includes("— "),
  )
}

{
  /**
   * A section arrives filled from somebody else's preset, and the whole point
   * of adding one is then to make it this store's. Handing back its controls
   * with the id saves a round trip and, more to the point, stops the model
   * writing from memory and being refused.
   */
  const { result } = await run([
    { calls: [["add_section", { sectionType: "faq", index: 1, settingsJson: "{}" }]] },
    { text: "Added." },
  ])
  const added = applyOps(page(), result.ops).sections.find((s) => s.type === "faq")
  check("a new section is described in full when it is added", added !== undefined)
  check(
    "and that description carries the controls and the blocks it takes",
    added !== undefined &&
      describeSection(added).includes("CONTROLS THIS SECTION HAS") &&
      describeSection(added).includes("BLOCK TYPES THIS SECTION TAKES"),
  )
}

check(
  "the model is told that adding a section is not finishing one",
  (() => {
    const loop = untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
    return (
      /Adding the section is the first of them, not the job/.test(loop) &&
      /DO NOT STOP EARLY/.test(loop) &&
      /needs them FULL/.test(loop)
    )
  })(),
)

check(
  "and that a value the control cannot take is as silent a failure as a wrong id",
  /EVERY SETTING IS A CONTROL/.test(
    untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts"),
  ),
)

// ===========================================================================
section("There is one script to run, and it survives being run twice")
// ===========================================================================

/**
 * The panel's "we could not load this conversation" has one cause on a fresh
 * deployment: theme_chat_messages does not exist yet. Five migrations were
 * outstanding and spread across five files, which is five chances to run four.
 *
 * VERIFIED ON POSTGRES 16, not read: run on an empty database every part
 * skips itself and the script still completes; run on a realistic schema it
 * creates everything; run a second time it is a clean no-op with ONE policy,
 * not two. The RLS policy was then driven with two creators — each sees only
 * their own conversation, naming somebody else's install id returns nothing,
 * and writing into it is refused by the policy.
 *
 * ---------------------------------------------------------------------------
 *  TWO THINGS THE FIRST VERSION GOT WRONG, ON A REAL DATABASE
 * ---------------------------------------------------------------------------
 * It hard-coded the products vocabulary as ('draft','published','unpublished')
 * and a live catalogue had other statuses in it, so:
 *
 *   ERROR: 23514: check constraint "products_status_check" of relation
 *   "products" is violated by some row
 *
 * The fixture here had only the three values, so the test passed and the
 * database did not. The constraint is now BUILT FROM the statuses actually
 * present, unioned with the three the code needs — no row is rewritten.
 *
 * And worse than the error: the SQL editor runs a script as ONE TRANSACTION,
 * so that failure rolled back everything behind it. Nothing was created at
 * all — including the theme-chat table the whole script exists for. Every part
 * now has its own exception block. Break-tested with a products.status of type
 * integer, where the check cannot be built at any vocabulary: part 2b reported
 * "did not apply: invalid input syntax for type integer" and theme_chat_
 * messages, site_agent_questions and admin_moderation_log all still landed.
 */
{
  const script = untt(readFileSync(join(root, "sql/RUN_THIS_ALL_PENDING.sql"), "utf8"), "sql/RUN_THIS_ALL_PENDING.sql")

  for (const [name, needle] of [
    ["sites.document", "add column if not exists document jsonb"],
    ["creator bans", "add column if not exists banned_at"],
    ["the products status a ban writes", "'draft', 'published', 'unpublished'"],
    ["chat questions", "add column if not exists questions jsonb"],
    ["agent questions", "create table if not exists public.site_agent_questions"],
    ["the theme conversation", "create table if not exists public.theme_chat_messages"],
  ] as const) {
    check(`the one script carries ${name}`, script.includes(needle))
  }

  /**
   * Guarded, because a script that aborts halfway leaves a database with some
   * migrations applied and no way to tell which — worse than one that refuses
   * to start.
   */
  check(
    "and every part checks its table exists rather than aborting the script",
    (script.match(/to_regclass\(/g) ?? []).length >= 6,
  )

  /**
   * The products vocabulary is READ, not asserted. Hard-coding it is what
   * failed on a real catalogue, and hard-coding a longer guess would only move
   * the failure.
   */
  check(
    "the products constraint is built from the statuses already in the table",
    script.includes("select coalesce(array_agg(distinct status), '{}')") &&
      script.includes("execute format(") &&
      !/check \(status in \('draft', 'published', 'unpublished'\)\)/.test(script),
  )
  check(
    "and it says which values it kept, rather than changing them quietly",
    script.includes("raise notice 'products.status now allows: %', quoted"),
  )

  /**
   * The SQL editor runs the whole script as one transaction. Without a handler
   * per part, the first failure takes every part behind it with it — which is
   * how a run produced no theme-chat table and no error anybody could act on.
   */
  check(
    "one part failing cannot roll back the parts behind it",
    (script.match(/exception when others then/g) ?? []).length >= 7,
  )
  check(
    "and a part that could not apply says so",
    (script.match(/raise notice '[^']*did not apply: %', sqlerrm/g) ?? []).length >= 6,
  )
  check(
    "it can be run twice",
    script.includes("add column if not exists") &&
      script.includes("create table if not exists") &&
      script.includes("where schemaname = 'public' and tablename = 'theme_chat_messages'"),
  )
}

// ===========================================================================
section("The panel says the true thing, and does not make you wait to type")
// ===========================================================================

{
  const chat = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")

  /**
   * "We could not load this conversation" is right about a read that failed
   * and wrong about a migration nobody has run — one is a fault to report,
   * the other is a step to take, and a 503 alone cannot tell them apart.
   */
  check(
    "a missing table and a failed read are different messages",
    /historyError === "not_set_up"/.test(chat) && /historyError === "read_failed"/.test(chat),
  )
  check(
    "the not-set-up message does not claim anything is broken: it says what turns it on",
    /History turns on once the database update is run\. Until then your messages here are kept as one chat\./.test(chat) &&
      /History turns on once the database update is run\./.test(untt(readFileSync(join(root, "components/website-builder/ask-history.tsx"), "utf8"), "components/website-builder/ask-history.tsx")),
  )

  /**
   * The box was `disabled` for the whole run. Waiting for a spinner before you
   * are allowed to type your next thought is the difference between a
   * conversation and a form.
   */
  /**
   * Anchored on the TEXTAREA. A looser search for `disabled={busy}` passes or
   * fails on the Try-again button, which is a different control and is
   * supposed to be disabled mid-run — the check would have been reading the
   * wrong element and reporting on the right one.
   */
  const composer = chat.slice(chat.indexOf("<textarea"), chat.indexOf("<textarea") + 900)
  check(
    "the composer is not disabled while a run is going",
    composer.includes("<textarea") && !/disabled/.test(composer),
    composer.slice(0, 300),
  )
  check(
    "and a message typed during a run is queued rather than dropped",
    /setQueued\(\{ text: prompt \}\)/.test(chat) && /if \(busy \|\| writing \|\| routingNow \|\| !queued\) return/.test(chat),
  )
  check("a failed exchange can be sent again without retyping it", /Try again/.test(chat))
  /* Round Z3: eased to its new height by lib/website-builder/ask-composer.ts. */
  check("the box grows with what is in it", /easeFieldHeight\(field\)/.test(chat) && /Math\.min\(field\.scrollHeight, max\)/.test(readFileSync(join(root, "lib/website-builder/ask-composer.ts"), "utf8")))

  check(
    "the panel wears the Storelib mark, not a generic star",
    /<StorelibLogo/.test(chat) && !/Sparkles/.test(chat),
  )
}

{
  const editor = untt(readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check(
    "and so does the button that opens it",
    // One button at every size: the mark, with its own glow.
    /<StorelibLogo size=\{18\}/.test(editor) &&
      !/Sparkles/.test(editor),
  )
  /**
   * Measured in Chromium: 32x32 button, an 18x18 mark, painted rgb(139, 86,
   * 250). Inverting the button to solid black was fine for a line-art sparkle
   * and is not for a logo — a brand mark on a black tile reads as a different
   * brand.
   */
  check(
    "the mark keeps its own colour in both states",
    // Open or closed, only the mark's opacity moves. The tile under it has
    // depth of its own now and never inverts.
    /<StorelibLogo size=\{18\} alt="" className=\{cn\("transition-opacity", aiOpen \? "opacity-100" : "opacity-80"\)\}/.test(
      editor,
    ) && !/aiOpen\s*\n?\s*\? "border-foreground bg-muted"/.test(editor),
  )
}

// ===========================================================================
section("\"The edit did not finish.\" was never true")
// ===========================================================================

/**
 * That message came from a run hitting the turn ceiling — and by then the page
 * had usually ALREADY CHANGED, because operations are applied and streamed as
 * they happen. So somebody watched their page get better and was then told the
 * edit failed. Nothing had failed. The model had not got round to writing its
 * closing sentence.
 */
{
  /** A model that keeps working and never says it is done. */
  const relentless: Scripted[] = Array.from({ length: 30 }, () => ({
    calls: [
      ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "Questions" }) }],
    ] as Array<[string, Record<string, unknown>]>,
  }))

  const { result } = await run(relentless, pageWithFaq(), undefined, { maxTurns: 4 })

  check("a run that ran out of turns having done work is a success", result.status === "succeeded")
  check("it carries no error at all", result.error === null, String(result.error))
  check("the operations are all there", result.ops.length === 4)
  check(
    "and it writes its own closing sentence from what it did",
    result.message.length > 0 && /FAQ/i.test(result.message),
    result.message,
  )
}

{
  /** Out of turns having done nothing: a real failure, but a useful one. */
  const useless: Scripted[] = Array.from({ length: 30 }, () => ({
    calls: [["read_section", { id: "faq-1" }]] as Array<[string, Record<string, unknown>]>,
  }))
  const { result } = await run(useless, pageWithFaq(), undefined, { maxTurns: 3 })

  check("a run that did nothing is still a failure", result.status === "failed")
  check(
    "but it says something a person can act on",
    typeof result.error === "string" && /Say which section/.test(result.error),
    String(result.error),
  )
}

{
  /**
   * Counting the string in the source would pass on a comment and fail on a
   * rename. Every exit the loop has is DRIVEN instead, and none of them may
   * hand that sentence to anybody.
   */
  const exits: Array<[string, () => Promise<{ error: string | null }>]> = [
    [
      "out of turns, work done",
      async () =>
        (
          await run(
            Array.from({ length: 9 }, () => ({
              calls: [
                ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "H" }) }],
              ] as Array<[string, Record<string, unknown>]>,
            })),
            pageWithFaq(),
            undefined,
            { maxTurns: 2 },
          )
        ).result,
    ],
    [
      "out of turns, nothing done",
      async () =>
        (
          await run(
            Array.from({ length: 9 }, () => ({
              calls: [["read_section", { id: "faq-1" }]] as Array<[string, Record<string, unknown>]>,
            })),
            pageWithFaq(),
            undefined,
            { maxTurns: 2 },
          )
        ).result,
    ],
    ["an empty reply", async () => (await run([{ text: "" }])).result],
    ["a plain reply", async () => (await run([{ text: "Nothing needed changing." }])).result],
    [
      "a refused tool call",
      async () =>
        (
          await run([
            { calls: [["update_section", { id: "nope", settingsJson: "{}" }]] },
            { text: "" },
          ])
        ).result,
    ],
  ]

  const leaked: string[] = []
  for (const [name, exit] of exits) {
    const { error } = await exit()
    if (error === "The edit did not finish.") leaked.push(name)
  }
  check(
    "no exit the loop has can hand somebody that sentence",
    leaked.length === 0,
    leaked.join(", "),
  )
}

{
  /** The token budget is the other way a run stops mid-thought. */
  const { result } = await run(
    [
      { calls: [["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "H" }) }]] },
      { text: "Done." },
    ],
    pageWithFaq(),
  )
  check("a normal run still reports the model's own sentence", result.message === "Done.")
}

// ===========================================================================
section("A locked section is the only thing that changes")
// ===========================================================================

/**
 * Selecting a section and asking for "a bit more space" should not come back
 * with a reworded hero and a new palette. The prompt asked for that; this
 * enforces it, at the one place every operation passes through — so a tool
 * added later cannot quietly escape it.
 */
{
  const { result } = await run(
    [
      {
        calls: [
          ["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "New" }) }],
        ],
      },
      { text: "Tried." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check("another section cannot be written", result.ops.length === 0)
}

{
  const { result } = await run(
    [
      {
        calls: [
          ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "New" }) }],
        ],
      },
      { text: "Done." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check("the locked one can", result.ops.length === 1)
}

{
  const { result } = await run(
    [
      { calls: [["add_section", { sectionType: "pricing", index: 2, settingsJson: "{}" }]] },
      { calls: [["update_theme", { settingsJson: JSON.stringify({ primary_color: "#ff0000" }) }]] },
      { calls: [["remove_section", { id: "hero-1" }]] },
      { calls: [["move_section", { id: "hero-1", index: 2 }]] },
      { calls: [["set_section_visibility", { id: "hero-1", hidden: true }]] },
      { text: "None of that was available." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check(
    "and nothing that reshapes the page or the theme is available at all",
    result.ops.length === 0,
    JSON.stringify(result.ops),
  )
}

{
  const { result } = await run(
    [
      {
        calls: [
          [
            "add_block",
            {
              sectionId: "faq-2",
              blockType: "faq_item",
              index: -1,
              settingsJson: JSON.stringify({ question: "?" }),
            },
          ],
        ],
      },
      { text: "Tried." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check("blocks are scoped too, not just settings", result.ops.length === 0)
  check(
    "and the refusal is the LOCK, not the block type being wrong for that section",
    toolOutputs.some((o) => /only section you may change/.test(o)),
    toolOutputs.join(" | ").slice(0, 200),
  )
}

{
  const { result } = await run(
    [
      {
        calls: [
          [
            "add_block",
            {
              sectionId: "faq-1",
              blockType: "faq_item",
              index: -1,
              settingsJson: JSON.stringify({ question: "Do you ship worldwide?" }),
            },
          ],
        ],
      },
      { text: "Added one." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check("and the locked section's own blocks still work", result.ops.length === 1)
}

{
  /**
   * READS ARE NOT RESTRICTED. Matching the header's type scale changes
   * nothing, and a model that cannot look produces a section that matches
   * nothing.
   */
  const { result } = await run(
    [
      { calls: [["read_section", { id: "hero-1" }]] },
      {
        calls: [
          ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "Matched" }) }],
        ],
      },
      { text: "Matched the hero." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
    { lockToSelection: true },
  )
  check("it can still read the rest of the page to match it", result.ops.length === 1)
  check(
    "and the read really returned the other section, rather than a refusal",
    toolOutputs.some((o) => /^hero \[hero-1\]/.test(o)) &&
      !toolOutputs.some((o) => /only section you may change/.test(o)),
    toolOutputs.join(" | ").slice(0, 200),
  )
}

{
  /** Without the lock, nothing changes about how it behaves. */
  const { result } = await run(
    [
      { calls: [["add_section", { sectionType: "pricing", index: 2, settingsJson: "{}" }]] },
      { text: "Added." },
    ],
    pageWithHeroAndFaq(),
    "faq-1",
  )
  check("with the lock off, the whole page is editable again", result.ops.length === 1)
}

check(
  "the lock is enforced in code, not requested in the prompt",
  (() => {
    const loop = untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
    return (
      /if \(locked\) \{/.test(loop) &&
      /const wholePage: Record<string, string> = \{/.test(loop) &&
      /target !== locked/.test(loop)
    )
  })(),
)

{
  const chat = untt(readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")
  check(
    "the panel shows what the edit is limited to, before you type it, in two words and a title rather than a sentence",
    /<ScopeChip\s*\n\s*name=\{scopeLabel\}\s*\n\s*locked=\{locked\}/.test(chat) &&
      /const scopeLabel = selectedSection \? scopeName\(/.test(chat) &&
      /Editing:<\/span> \{name\}/.test(untt(readFileSync(join(root, "components/website-builder/ask-parts.tsx"), "utf8"), "components/website-builder/ask-parts.tsx")) &&
      /title=\{`Only \$\{name\} will change`\}/.test(untt(readFileSync(join(root, "components/website-builder/ask-parts.tsx"), "utf8"), "components/website-builder/ask-parts.tsx")),
  )
  check("it is on by default when a section is selected", /useState\(true\)/.test(chat))
  check(
    "a new selection re-arms it, so the chip cannot say one thing and mean another",
    /setLockOn\(true\)\n  \}, \[selectedSectionId\]\)/.test(chat),
  )
  check("and it can be cleared to edit the whole page", /setLockOn\(false\)/.test(chat))
  check("the panel actually sends it, or what the router widened it to", /const lockNow = \(opts\.lock \?\? live\.current\.locked\) && opts\.aim\?\.kind !== "new"/.test(chat) && /lockToSelection: lockNow && opts\.aim\?\.kind !== "new"/.test(chat)) /* Changed on purpose (r69): a new section or a replacement is never sent locked. */
}

check(
  "and the endpoint only honours it with a section actually selected, one that is on the page",
  /lockToSelection: body\.lockToSelection === true && !!selected/.test(
    untt(readFileSync(join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/agent/route.ts"),
  ),
)

// ===========================================================================
section("The agent reads its own work back")
// ===========================================================================

/**
 * The loop applied operations and stopped. Whatever came out came out — a
 * colour change that left body text at 1.4:1 against its background was
 * reported as a success, and somebody found the unreadable section later.
 *
 * The code agent bundles, typechecks and renders before it will admit to being
 * finished. A theme has nothing to compile, so the idea was dropped. That was
 * the wrong conclusion: a theme has plenty that can be wrong, it just is not a
 * compiler that knows it.
 */
{
  /**
   * The published WCAG numbers, not a plausible-looking approximation. #767676
   * on white is the well-known smallest passing grey and #777777 the one just
   * under it — if the maths drifts, those two are where it shows.
   */
  const table: Array<[string, string, number]> = [
    ["#000000", "#ffffff", 21],
    ["#ffffff", "#ffffff", 1],
    ["#777777", "#ffffff", 4.478],
    ["#767676", "#ffffff", 4.542],
    ["#0000ff", "#ffffff", 8.592],
    ["#595959", "#ffffff", 7.005],
  ]
  const wrong = table.filter(([a, b, expected]) => {
    const got = contrastRatio(a, b)
    return got === null || Math.abs(got - expected) > 0.01
  })
  check("the contrast maths matches the published values", wrong.length === 0, JSON.stringify(wrong))

  check("shorthand hex expands", JSON.stringify(parseColor("#abc")) === "[170,187,204]")
  check("rgb() parses", JSON.stringify(parseColor("rgb(17, 24, 39)")) === "[17,24,39]")
  check("and a colour name that is not a colour is refused", parseColor("warm beige") === null)
}

{
  /**
   * THE CHECK THAT KEEPS THIS FROM MAKING THINGS WORSE.
   *
   * The first version reported a problem on nine of the fifty shipped presets:
   * the product's own indigo button is white on #6366f1, which is 4.47:1 —
   * three hundredths under AA — and several image-overlay sections declare
   * white text beside a pale bg_color the reader never sees behind it.
   *
   * A run asked to shorten a heading would have been handed all of that and
   * sent off to "fix" colours nobody complained about. Every check is now
   * scoped to the fields the model itself wrote.
   */
  const noisy: string[] = []
  for (const type of Object.keys(SECTION_SCHEMAS)) {
    const built = buildSection(`${type}-1`, type)
    if (!built) continue
    const findings = reviewSections({
      state: { sections: [built], settings: {} },
      touched: [built.id],
      added: [],
      written: { [built.id]: ["heading"] },
    })
    if (findings.length > 0) noisy.push(`${type}: ${findings[0].message.slice(0, 60)}`)
  }
  check(
    "not one of the fifty shipped presets is reported as broken",
    noisy.length === 0,
    noisy.slice(0, 3).join(" | "),
  )
}

{
  const hero = buildSection("hero-1", "hero")!
  hero.settings.text_color = "#cccccc"
  hero.settings.bg_color = "#ffffff"
  const state = { sections: [hero], settings: {} }

  const chosen = reviewSections({
    state,
    touched: ["hero-1"],
    added: [],
    written: { "hero-1": ["text_color", "bg_color"] },
  })
  check(
    "a colour the model chose that nobody can read is caught",
    chosen.length === 1 && /1\.61:1/.test(chosen[0].message),
    JSON.stringify(chosen),
  )

  const inherited = reviewSections({
    state,
    touched: ["hero-1"],
    added: [],
    written: { "hero-1": ["heading"] },
  })
  check(
    "and the same page is silent when the colour was not this run's doing",
    inherited.length === 0,
  )
}

{
  const faq = buildSection("faq-1", "faq")!
  faq.blocks = [
    { id: "a", type: "faq_item", settings: { question: "Do you ship worldwide?", answer: "<p>Yes.</p>" } },
    { id: "b", type: "faq_item", settings: { question: "Do you ship worldwide?", answer: "<p>We do.</p>" } },
  ]
  const findings = reviewSections({
    state: { sections: [faq], settings: {} },
    touched: ["faq-1"],
    added: [],
  })
  check(
    "the same question asked twice is caught",
    findings.some((f) => /same entry more than once/.test(f.message)),
    JSON.stringify(findings),
  )
}

{
  /**
   * The duplicate check used to compare "the first string in the object",
   * which on a counter is its `unit` — every counter block on the shipped
   * preset has "k" in it, so a perfectly good stats section reported all of
   * its entries as repeats. It identifies a block by NAME now.
   */
  const counter = buildSection("counter-1", "counter")!
  const findings = reviewSections({
    state: { sections: [counter], settings: {} },
    touched: ["counter-1"],
    added: [],
  })
  check(
    "but two counters that share a unit are not the same counter",
    findings.length === 0,
    JSON.stringify(findings),
  )
}

{
  const hero = buildSection("hero-2", "hero")!
  hero.settings.heading = ""
  const findings = reviewSections({
    state: { sections: [hero], settings: {} },
    touched: ["hero-2"],
    added: [],
    written: { "hero-2": ["heading"] },
  })
  check(
    "blanking a heading is caught — it renders as a gap",
    findings.some((f) => /is now empty/.test(f.message)),
  )
}

{
  /**
   * Added and left exactly as it shipped.
   *
   * THE CONTENT IS IN THE BLOCKS: a FAQ has two text fields of its own and
   * five actual questions, and the first version of this check compared only
   * the two. "Add an FAQ about my course" answered with the shipped "Do you
   * offer discounts for bulk orders?" would have passed it.
   */
  const added = buildSection("faq-9", "faq")!
  const findings = reviewSections({
    state: { sections: [added], settings: {} },
    touched: ["faq-9"],
    added: ["faq-9"],
  })
  check(
    "a section added with the preset's questions still in it is caught",
    findings.some((f) => /all 5 of its entries exactly as the preset/.test(f.message)),
    JSON.stringify(findings),
  )

  const edited = reviewSections({
    state: { sections: [added], settings: {} },
    touched: ["faq-9"],
    added: [],
  })
  check(
    "but editing an existing section is not a promise to rewrite every word in it",
    edited.length === 0,
    JSON.stringify(edited),
  )

  /** One real question written is enough to show somebody was home. */
  const worked = buildSection("faq-8", "faq")!
  worked.blocks = [
    { id: "x", type: "faq_item", settings: { question: "How long is the course?", answer: "<p>Six weeks.</p>" } },
    ...(worked.blocks ?? []).slice(1),
  ]
  check(
    "and a section whose content was actually written is left alone",
    reviewSections({
      state: { sections: [worked], settings: {} },
      touched: ["faq-8"],
      added: ["faq-8"],
    }).length === 0,
  )
}

// ===========================================================================
section("And it does not get to call that finished")
// ===========================================================================

{
  /**
   * The model sets an unreadable colour, says it is done, is handed the
   * finding, fixes it, and only then finishes. Two operations, no error, and
   * the creator never sees the bad state as a final answer.
   */
  const { result, events } = await run(
    [
      {
        calls: [
          [
            "update_section",
            { id: "hero-1", settingsJson: JSON.stringify({ text_color: "#cccccc", bg_color: "#ffffff" }) },
          ],
        ],
      },
      { text: "Made the text lighter." },
      {
        calls: [
          ["update_section", { id: "hero-1", settingsJson: JSON.stringify({ text_color: "#4b5563" }) }],
        ],
      },
      { text: "Lightened the text, keeping it readable." },
    ],
    pageWithHeroAndFaq(),
  )

  check("the run does not stop at the unreadable version", result.ops.length === 2)
  check("it finishes cleanly once the finding is answered", result.status === "succeeded")
  check("with no error", result.error === null)
  check(
    "and the final colour is the readable one",
    (result.ops[1] as { settings: Record<string, unknown> }).settings.text_color === "#4b5563",
  )
  check(
    "the panel is told a check is happening, rather than going quiet",
    events.some((e) => e.type === "thinking" && /Checking the change/.test(e.text)),
  )
}

{
  /** A model that will not fix it is not held for ever. */
  const stubborn: Scripted[] = [
    {
      calls: [
        [
          "update_section",
          { id: "hero-1", settingsJson: JSON.stringify({ text_color: "#cccccc", bg_color: "#ffffff" }) },
        ],
      ],
    },
    ...Array.from({ length: 12 }, () => ({ text: "It looks fine to me." })),
  ]
  const { result } = await run(stubborn, pageWithHeroAndFaq(), undefined, { maxReviews: 2 })
  check(
    "the review budget is spent rather than looping for ever",
    result.status === "succeeded" && result.ops.length === 1,
    `${result.status} ${result.ops.length}`,
  )
}

{
  /** Nothing changed, nothing to review — it must not invent a round trip. */
  const { result } = await run([{ text: "Your FAQ already covers that." }])
  check(
    "a run that changed nothing is not sent back to check its work",
    result.status === "succeeded" && result.message === "Your FAQ already covers that.",
  )
}

// ===========================================================================
section("The page's own design system, read off the page")
// ===========================================================================

/**
 * The tools people compare this to do not produce coherent pages because their
 * models have better taste. They produce them because the model is given a
 * SYSTEM: a fixed palette, a spacing scale. The output looks designed because
 * the vocabulary is small and shared.
 *
 * This editor had that system and was not using it — the model was handed raw
 * colour fields with no idea what the rest of the page had chosen, so it
 * invented a fourth near-identical grey and a padding of 37 on a page of 60s.
 * Nobody can name what is wrong with a page like that, which is exactly why it
 * reads as machine-made.
 */
function realPage(): ThemeState {
  return {
    sections: ["header", "hero", "feature_grid", "testimonials", "faq", "cta", "footer"]
      .map((type) => buildSection(`${type}-1`, type))
      .filter((s): s is NonNullable<typeof s> => s !== null),
    settings: {},
  }
}

const drifted = (change: (section: SectionInstance) => void): ThemeState => {
  const state = realPage()
  const faq = state.sections.find((s) => s.id === "faq-1")!
  change(faq)
  return state
}

const reviewOf = (state: ThemeState, written: string[]) =>
  reviewSections({ state, touched: ["faq-1"], added: [], written: { "faq-1": written } })

{
  const style = readHouseStyle(realPage())
  check("the palette is read from what the page actually uses", style.palette.length >= 3)
  check("so is the spacing rhythm", style.spacing.includes(60))
  const described = describeHouseStyle(style)
  check(
    "the description names the colours and the padding",
    /Colours already in use/.test(described) && /Vertical padding in use/.test(described),
    described.slice(0, 120),
  )
}

{
  /** A page of one section has decided nothing. Inventing a rule from it and
   *  calling it the creator's would be worse than staying quiet. */
  const thin: ThemeState = { sections: [buildSection("hero-1", "hero")!], settings: {} }
  check("a page too small to have a system yields no rules", describeHouseStyle(readHouseStyle(thin)) === "")
}

{
  const findings = reviewOf(drifted((s) => (s.settings.bg_color = "#f9fafb")), ["bg_color"])
  check(
    "a grey three shades off the page's grey is caught",
    findings.some((f) => /already uses #f8fafc/.test(f.message)),
    JSON.stringify(findings),
  )
}

{
  /**
   * THE BUG THIS ALMOST SHIPPED WITH.
   *
   * The baseline was read from the state AFTER the change, so the model's own
   * drift voted on what the page's convention is: write #f9fafb onto a page of
   * #f8fafc and #f9fafb is now "in use", so the check written to catch exactly
   * that returned nothing. Driven here rather than read.
   */
  const state = drifted((s) => (s.settings.bg_color = "#f9fafb"))
  const withTouched = readHouseStyle(state, ["faq-1"])
  const withoutTouched = readHouseStyle(state)
  check(
    "the baseline is the page BEFORE this edit, not including it",
    !withTouched.palette.some((p) => p.color === "#f9fafb") ||
      withoutTouched.palette.length !== withTouched.palette.length,
  )
}

{
  const findings = reviewOf(drifted((s) => (s.settings.bg_color = "#1a1a2e")), ["bg_color"])
  check(
    "a colour that is clearly a different colour is not called drift",
    !findings.some((f) => /same colour to anybody/.test(f.message)),
    JSON.stringify(findings),
  )
  check(
    "though a dark background under dark text is still unreadable, and still reported",
    /**
     * 2.54:1, not the 1.04:1 this asked for before. The number moved because
     * the FAQ's text colour moved: its preset used to bake #111827 and now it
     * names a colour scheme, so the text is the scheme's #5c5b63. Both are
     * unreadable on #1a1a2e and both are reported; the check is that the
     * reviewer reads the colour the page actually draws.
     */
    findings.some((f) => /2\.54:1/.test(f.message)),
    JSON.stringify(findings),
  )
}

check(
  "the threshold only covers colours nobody would call different",
  (colorDistance("#f9fafb", "#f8fafc") ?? 99) < 8 && (colorDistance("#ffffff", "#f8fafc") ?? 0) > 8,
)

{
  const odd = reviewOf(drifted((s) => (s.settings.padding_top = 37)), ["padding_top"])
  check(
    "padding off the page's rhythm is caught",
    odd.some((f) => /breaks the vertical rhythm/.test(f.message)),
    JSON.stringify(odd),
  )
  const fine = reviewOf(drifted((s) => (s.settings.padding_top = 80)), ["padding_top"])
  check("padding the page already uses is not", fine.length === 0, JSON.stringify(fine))
}

{
  /**
   * The product's own button is white on #6366f1 — 4.47:1, three hundredths
   * under AA. A model that reuses it is being consistent, which is what it was
   * asked to be, and telling it to fix the brand colour is an argument it
   * cannot win and should not be having.
   */
  const state = realPage()
  const second = buildSection("hero-2", "hero")!
  state.sections.splice(2, 0, second)
  const reused = reviewSections({
    state,
    touched: ["hero-2"],
    added: [],
    written: { "hero-2": ["button_color", "button_text_color"] },
  })
  check("a pair the rest of the page already uses is this site's standard", reused.length === 0, JSON.stringify(reused))

  const lone: ThemeState = {
    sections: [buildSection("hero-3", "hero")!, buildSection("faq-3", "faq")!, buildSection("cta-3", "cta")!],
    settings: {},
  }
  lone.sections[0].settings.button_color = "#7c7cf5"
  lone.sections[0].settings.button_text_color = "#ffffff"
  const fresh = reviewSections({
    state: lone,
    touched: ["hero-3"],
    added: [],
    written: { "hero-3": ["button_color", "button_text_color"] },
  })
  check("but a low-contrast pair this run invented is still reported", fresh.length === 1, JSON.stringify(fresh))
}

{
  /** The regression guard: an ordinary copy edit, on every section type. */
  const noisy: string[] = []
  for (const type of Object.keys(SECTION_SCHEMAS)) {
    const built = buildSection(`${type}-x`, type)
    if (!built) continue
    const state = realPage()
    state.sections.push(built)
    const findings = reviewSections({
      state,
      touched: [built.id],
      added: [],
      written: { [built.id]: ["heading"] },
    })
    if (findings.length > 0) noisy.push(`${type}: ${findings[0].message.slice(0, 60)}`)
  }
  check(
    "and an ordinary copy edit is silent on all fifty types",
    noisy.length === 0,
    noisy.slice(0, 3).join(" | "),
  )
}

check(
  "the model is shown the page's system before it decides anything",
  (() => {
    const loop = untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
    // The call carries this install's own section types now: see ./schemas.
    const at = loop.indexOf("describeHouseStyle(readHouseStyle(state, [], schemas))")
    const settings = loop.indexOf("`THEME SETTINGS")
    /**
     * `at >= 0` FIRST. Without it, deleting the call entirely made indexOf
     * return -1 and "-1 < settings" true — the check passed BECAUSE the thing
     * it was checking for was gone, and a break-test caught it doing so.
     */
    return at >= 0 && settings >= 0 && at < settings && /MATCH THE PAGE YOU ARE ON/.test(loop)
  })(),
)

// ===========================================================================
section("Asking for something good has to get the good model")
// ===========================================================================

/**
 * "I ask him to build me a very good complex section and he does small work."
 *
 * The theme editor was calling the CODE agent's classifier, which reads a
 * vocabulary this editor never uses — files, dashboards, authentication.
 * Measured against the real phrasings, it produced exactly the wrong answer:
 * the words that mean AMBITION got the cheap model and the small budget, and
 * the most ordinary request in the product got the expensive one.
 */
{
  const build = [
    "build me a very good complex section",
    "build a very good clean complex section",
    "design a complete FAQ section",
    "make me a great pricing section",
    "add a pricing section",
    "make this section better",
    "build out this page properly",
  ]
  const weak = build.filter((p) => !classifyRequest(p).strong)
  check("every request to build something reaches for the good model", weak.length === 0, weak.join(" | "))

  const ambitious = build.filter((p) => /complex|complete|great|properly/.test(p))
  const cramped = ambitious.filter((p) => classifyRequest(p).maxTurns < 24)
  check(
    "and an ambitious one gets the room to do it — building properly is a dozen calls",
    cramped.length === 0,
    cramped.join(" | "),
  )
}

{
  /**
   * The cheap model still exists, for what it is actually good at. Recognising
   * a TWEAK is the safe direction: a missed tweak costs a fraction of a cent,
   * a missed build costs somebody their opinion of the product.
   */
  const tiny = ["change the heading to Hello", "set the background to #ffffff", "rename this section to Pricing"]
  const escalated = tiny.filter((p) => classifyRequest(p).strong)
  check("a one-thing change is still a cheap eight-turn tweak", escalated.length === 0, escalated.join(" | "))

  check(
    "but two things in one sentence is not a tweak",
    classifyRequest("make the heading shorter and add three tiers").scope === "build",
  )
}

/**
 * ===========================================================================
 *  A BUILD GETS THE BETTER MODEL, THE CATALOGUE AND ROOM TO WRITE
 * ===========================================================================
 * "Make sure the AI is very smart, to have the best output." Three things
 * were being left on the table on exactly the runs that needed them:
 *
 *   the model   `strong` was computed and nothing read it, so "build me a
 *               proper pricing section" ran on the everyday model.
 *   the shop    the catalogue was fetched only when the sentence tripped
 *               STORE_WORDS, and "add a testimonials section" does not.
 *   the room    8,000 output tokens is where six blocks of real copy in one
 *               turn gets cut off, and that arrives as a half-written
 *               section rather than as an error.
 */
{
  const ambitious = ["build me a proper pricing section", "design a complete FAQ section", "make me a great hero"]
  const missed = ambitious.filter((p) => !classifyRequest(p).ambitious)
  check("an ask that plainly says build is marked ambitious", missed.length === 0, missed.join(" | "))

  const chat = ["what can you do?", "why is my header dark?", "change the heading to Hello"]
  const overreach = chat.filter((p) => classifyRequest(p).ambitious)
  check("a question or a one-thing change is not", overreach.length === 0, overreach.join(" | "))

  const pages = ["build me a landing page for my sample packs", "make the whole website", "design a home page from scratch"]
  const short = pages.filter((p) => classifyRequest(p).maxTurns < 36 || !classifyRequest(p).wholePage)
  check("a whole page is recognised and gets the turns six sections take", short.length === 0, short.join(" | "))
  /* 32 since the U round: a section's worth of turns, plus room to read the work back against the request and fix what it finds (SELF_CHECK). */
  check("and one section is still one section's worth of turns", classifyRequest("design a complete FAQ section").maxTurns === 32)

  const loop = untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
  check(
    "an ambitious run reads the catalogue up front, whatever the sentence says",
    /const aboutTheBusiness = STORE_WORDS\.test\(prompt\) \|\| images\.length > 0 \|\| !!input\.ambitious/.test(loop),
  )
  check(
    "and is given room to write a filled section in one turn",
    /* Round Z3: the model's working size for every turn (lib/website-builder/agent/limits.ts), raised again for a turn that was cut off. */
    /maxOutputTokens: outputCap,/.test(loop) && /let outputCap = limits\.turnOutputTokens/.test(loop) && AGENT_LIMITS.turnOutputTokens >= 24_000 && AGENT_LIMITS.retryOutputTokens > AGENT_LIMITS.turnOutputTokens,
  )
  check(
    "a type says how many entries finished means, before its controls are listed",
    /FINISHED MEANS \$\{expected\} ENTRIES/.test(loop) && /finishedLooksLike\(wanted, schemas\)/.test(loop),
  )
  check(
    "and a whole page is built in a running order, not as a pile",
    /A WHOLE PAGE IS AN ORDER, NOT A PILE/.test(loop),
  )

  const route = untt(readFileSync(join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/agent/route.ts")
  check(
    "the endpoint lifts an ambitious run to the stronger model, never lowers their choice, and says so",
    /\(shape\.ambitious \|\| bigIntent \|\| intent\.kind === "SECTION_REDESIGN"\) && body\.tier !== "strong" \? "strong" : body\.tier/.test(route) &&
      /wantsTier !== body\.tier/.test(route) &&
      /Using the stronger model for this one/.test(route),
  )
  check("and hands the run its ambition, and medium thinking with no switch", /ambitious: shape\.ambitious \|\| bigIntent/.test(route) && /effort: EFFORT,/.test(route))
}

check(
  "the endpoint uses this editor's classifier, not the code agent's",
  (() => {
    const route = untt(readFileSync(
      join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
      "utf8",
    ), "app/api/website-builder/themes/[installId]/agent/route.ts")
    return (
      /classifyRequest\(body\.prompt\)/.test(route) &&
      /* Round Z3: no per edit turn cap; the run is held by cost and time (lib/website-builder/agent/limits.ts). */
      /maxTurns: AGENT_LIMITS\.maxTurns,/.test(route) && /limits: AGENT_LIMITS,/.test(route) &&
      !/chooseModel/.test(route)
    )
  })(),
)

// ===========================================================================
section("A section that came out thin is not finished")
// ===========================================================================

/**
 * The model stops when the request is technically answered, and a pricing
 * table with one tier technically answers "add a pricing section". The bar is
 * the preset's own block count, HALVED — a type that ships three tiers is
 * telling you what finished looks like, and halving it leaves room for "two
 * plans, not three" to be a real request rather than an argument.
 */
{
  const thin = (type: string, keep: number) => {
    const built = buildSection(`${type}-1`, type)!
    built.blocks = (built.blocks ?? []).slice(0, keep)
    return reviewSections({
      state: { sections: [built], settings: {} },
      touched: [built.id],
      added: [built.id],
    }).filter((f) => /entr(y|ies) in it/.test(f.message))
  }

  check("a pricing section with one tier is caught", thin("pricing", 1).length === 1)
  check("two is left alone — that is a request somebody makes", thin("pricing", 2).length === 0)
  check("an FAQ with one question is caught", thin("faq", 1).length === 1)
  check("and a full one is not", thin("faq", 5).length === 0)
}

{
  /** The same bar for "make this section complex" on a section that exists. */
  const existing = buildSection("faq-1", "faq")!
  existing.blocks = (existing.blocks ?? []).slice(0, 1)
  const worked = reviewSections({
    state: { sections: [existing], settings: {} },
    touched: ["faq-1"],
    added: [],
    filled: ["faq-1"],
  })
  check(
    "answering 'make this complex' with one entry is the same failure",
    worked.some((f) => /entr(y|ies) in it/.test(f.message)),
    JSON.stringify(worked),
  )

  const untouched = reviewSections({
    state: { sections: [existing], settings: {} },
    touched: ["faq-1"],
    added: [],
  })
  check(
    "but editing a heading on a short section is not an occasion to argue about its length",
    !untouched.some((f) => /entr(y|ies) in it/.test(f.message)),
  )
}

{
  const gappy = buildSection("faq-2", "faq")!
  gappy.blocks = [
    { id: "a", type: "faq_item", settings: { question: "Real question?", answer: "<p>Yes.</p>" } },
    { id: "b", type: "faq_item", settings: { question: "", answer: "" } },
    { id: "c", type: "faq_item", settings: { question: "Another?", answer: "<p>No.</p>" } },
  ]
  check(
    "an entry with nothing in it renders as a gap, and is caught",
    reviewSections({
      state: { sections: [gappy], settings: {} },
      touched: ["faq-2"],
      added: [],
    }).some((f) => /no text in them/.test(f.message)),
  )
}

{
  /** The regression guard: every type, added complete, must be silent. */
  const noisy: string[] = []
  for (const type of Object.keys(SECTION_SCHEMAS)) {
    const built = buildSection(`${type}-1`, type)
    if (!built) continue
    const findings = reviewSections({
      state: { sections: [built], settings: {} },
      touched: [built.id],
      added: [built.id],
    }).filter((f) => /entr(y|ies) in it|no text in them/.test(f.message))
    if (findings.length > 0) noisy.push(type)
  }
  check(
    "and a section added at its full preset size is never called thin",
    noisy.length === 0,
    noisy.join(", "),
  )
}

check(
  "the model is told what building properly involves, in order",
  (() => {
    const loop = untt(readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
    return (
      /WHEN THE ASK IS TO BUILD, DESIGN OR MAKE SOMETHING GOOD/.test(loop) &&
      /"COMPLEX" AND "COMPLETE" MEAN CONTENT, NOT DECORATION/.test(loop) &&
      // and the old rule that read as "do the minimum" is gone
      !/Make the change that was asked for and nothing else/.test(loop)
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

// ===========================================================================
section("A setting is one way to make a change, not the limit of what is possible")
// ===========================================================================
{
  /**
   * "Make the FAQ opening smoother" came back as "this section exposes no
   * animation control, and theme settings are locked". The section is a file:
   * markup, CSS, a script and a schema. What the assistant lacked was a way
   * in, so it answered from the only thing it could see.
   */
  const loop = untt(readFileSync(join(process.cwd(), "lib/website-builder/agent/loop.ts"), "utf8"), "lib/website-builder/agent/loop.ts")
  const route = untt(readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8"), "app/api/website-builder/themes/[installId]/agent/route.ts")

  check(
    "it can read a section's source and write a new one",
    /name: "read_section_code"/.test(loop) && /name: "write_section_code"/.test(loop),
  )
  check(
    "the code tools are offered whenever the run is given a way to read sections, and the route always gives one",
    /* Round Z3: built once per run (runTools) so every turn's request is a prefix of the next. */
    /const runTools = toolSpecs\(addable, schemas, !!input\.code(, \{[^}]*\})?\)/.test(loop) && /tools: runTools,/.test(loop) &&
      /code\?: \{[\s\S]{0,200}read\(sectionType: string\): string \| null/.test(loop) &&
      /const code = \{\s*\n\s*read\(sectionType: string\): string \| null/.test(route),
  )
  check(
    "the prompt no longer says there is no file to write",
    !/there is no code and no file to write/.test(loop) &&
      /each KIND of section is a file you can read and rewrite/.test(loop),
  )
  check(
    "and it says to go to the code when no setting covers the request",
    /A SETTING IS ONE WAY TO MAKE A CHANGE\. IT IS NOT THE EDGE OF WHAT YOU CAN DO/.test(pageAgentRules()) &&
      /read_section_code on that section's type/.test(loop) &&
      /write_section_code with the whole file/.test(loop),
  )
  check(
    "a setting is added only for something somebody would change again",
    /DO NOT ADD A SETTING FOR EVERY ONE-OFF/.test(pageAgentRules()),
  )
  check(
    "a follow-up is read as a correction, not as licence to rename things",
    /A SHORT MESSAGE AFTER A CHANGE IS ABOUT THAT CHANGE/.test(pageAgentRules()),
  )
  check(
    "a source that does not compile is refused, and nothing is stored",
    /const compiled = compileSection\(source, \{ file: path[^}]*\}\)/.test(route) &&
      /did not compile/.test(route) &&
      /A refused write did not happen/.test(loop),
  )
  check(
    "a write goes through the code editor's own save: a draft with a version, never the live site",
    /await saveThemeFile\(supabase, installId, path, source, \{ author: "ai" \}\)/.test(route) && !/\.update\(\{ content: source, draft_content: null/.test(route),
  )
  check(
    "the next turn reads what was just written",
    /agentSources\[path\] = source/.test(route),
  )
  check(
    "and the canvas is told, so it stops drawing the old source",
    /if \(result\.wroteCode \|\| codeLost\) send\(\{ type: "sources-changed" \}\)/.test(route) &&
      /\{ type: "sources-changed" \}/.test(loop) &&
      /onSourcesChanged\?\.\(\)/.test(untt(readFileSync(join(process.cwd(), "components/website-builder/theme-chat.tsx"), "utf8"), "components/website-builder/theme-chat.tsx")) &&
      /* A stable callback now, so the memoised chat is not re-rendered by a new arrow every edit. */
      /* Changed on purpose (the owner: GitHub and AI schema edits reach the sidebar): an imported theme's canvas files and Theme settings are read again too. */
      /* Changed on purpose (a run's files show without a refresh): the copy read when the editor opened is dropped first (compatFilesChanged). */
      ((editor: string) =>
        /const reloadAiSources = useCallback\(async \(\)/.test(editor) &&
        /await loadStorelibSources\(\{ hold: true \}\)/.test(editor) &&
        /compatFilesChanged\(installId\)/.test(editor) &&
        /setCompatPanelVersion\(\(n\) => n \+ 1\)/.test(editor) &&
        (editor.match(/onSourcesChanged=\{reloadAiSources\}/g) ?? []).length === 2)(
        untt(readFileSync(join(process.cwd(), "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
      ),
  )
  check(
    "the section's own button says Ask AI",
    /<Item label="Ask AI" onClick=\{onAskAi\}>/.test(untt(readFileSync(join(process.cwd(), "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/(storelib)/website-builder/editor/[installId]/page.tsx")),
  )
}
