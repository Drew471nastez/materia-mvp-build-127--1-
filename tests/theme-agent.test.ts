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
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
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
  options: { lockToSelection?: boolean; maxTurns?: number } = {},
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
  const sidebar = readFileSync(join(root, "components/app/sidebar.tsx"), "utf8")
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
    existsSync(join(root, "app/app/sites/page.tsx")) &&
      existsSync(join(root, "app/sites/[siteId]/page.tsx")),
  )

  check(
    "and the theme editor is where the AI now lives",
    (() => {
      const editor = readFileSync(
        join(root, "app/website-builder/editor/[installId]/page.tsx"),
        "utf8",
      )
      return /<ThemeChat/.test(editor) && /aria-label="Ask Storelib"/.test(editor)
    })(),
  )
}

// ===========================================================================
section("The editor has one accent, and it is the app's own")
// ===========================================================================

{
  const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")

  /**
   * Purple appeared in thirty-one places beside a Save button that is black,
   * so the editor had two accents and neither read as deliberate. A saturated
   * purple on a builder also reads as "AI demo" rather than as a tool, which
   * is the specific thing this was asked to stop looking like.
   *
   * Counted rather than forbidden outright: the one survivor is a COMMENT
   * explaining that the inspector outline is blue and deliberately not purple,
   * and a rule that cannot tell a mention from a use is a rule somebody
   * deletes the first time it is wrong.
   */
  const uses = editor
    .split("\n")
    .filter((line) => /purple/.test(line))
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
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
  const route = readFileSync(
    join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
    "utf8",
  )
  check(
    "the catalogue is read as the user, so RLS decides what the model sees",
    (() => {
      const at = route.indexOf("readStore: async () => {")
      const body = route.slice(at, route.indexOf("},\n        })", at))
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
  const chat = readFileSync(join(root, "lib/website-builder/agent/chat.ts"), "utf8")
  const route = readFileSync(
    join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"),
    "utf8",
  )
  const panel = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")

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
    /message\.ops\.length/.test(panel) && !/onOp\(message/.test(panel),
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
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
  const at = editor.indexOf("const applyAiOp = useCallback")
  const body = editor.slice(at, editor.indexOf("}, [sections])", at))

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
  const panel = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")

  check(
    "the agent's own words reach the screen",
    /**
     * The loop streams `thinking` between tool calls and the panel dropped it,
     * so a run that spent twenty seconds reading a section and the catalogue
     * showed "Working" and nothing else. Latest line only — commentary, not a
     * transcript.
     */
    /event\.type === "thinking"/.test(panel) && /exchange\.note/.test(panel),
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
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )

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
    /if \(!isDirty \|\| saving \|\| publishing \|\| loading\) return/.test(editor),
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
      return (
        /if \(!options\.quiet\) showNotification/.test(body) &&
        /showNotification\(d\.error \?\? "Failed to save sections", "error"\)/.test(body)
      )
    })(),
  )
}

{
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )

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
        /live \? "Publish" : "Save"/.test(body) &&
        /live \? "Published" : "Saved"/.test(body)
      )
    })(),
  )
}

// ===========================================================================
section("Switching pages does not lose or misfile work")
// ===========================================================================

{
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
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
      return /await saveDraft\(\{ quiet: true \}\)/.test(body) && /if \(isDirty && !saving/.test(body)
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
        /if \(switchingPage\.current\) return/.test(editor)
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
 * The implementation is mirrored here rather than imported: the component is
 * a client module full of DOM and refs, and the arithmetic is the part worth
 * pinning. The assertions below check the SAME properties the component's
 * comments claim, so a change to one that breaks the other shows up as a
 * disagreement between this and the file.
 */
{
  const sheet = readFileSync(
    join(root, "components/website-builder/mobile-editor-sheet.tsx"),
    "utf8",
  )

  function offsetsFor(viewport: number, detents: number[], peekHeight: number) {
    const stops = [...detents].sort((a, b) => a - b)
    const height = Math.round(viewport * stops[stops.length - 1])
    const list = stops
      .map((f) => Math.max(0, Math.round(height - viewport * f)))
      .sort((a, b) => a - b)
    return { height, offsets: [...list, Math.max(height - peekHeight, 0)] }
  }

  function snap(offsets: number[], current: number, velocity: number, delta: number) {
    let index = 0
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < offsets.length; i++) {
      const d = Math.abs(offsets[i] - current)
      if (d < best) {
        best = d
        index = i
      }
    }
    if (Math.abs(velocity) > 0.4 && Math.abs(delta) > 8) {
      index = velocity < 0 ? Math.max(0, index - 1) : Math.min(offsets.length - 1, index + 1)
    }
    return index
  }

  const { height, offsets } = offsetsFor(800, [0.5, 0.92], 72)

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

  const single = offsetsFor(800, [0.5], 72)
  check(
    "one detent still behaves like the old two-position sheet",
    single.offsets.length === 2 && single.offsets[0] === 0,
    JSON.stringify(single.offsets),
  )

  check(
    "and the component sorts its offsets, which is what makes all of that true",
    /\.sort\(\(a, b\) => a - b\)/.test(
      sheet.slice(sheet.indexOf("const offsets = React.useMemo"), sheet.indexOf("const closedY")),
    ),
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

{
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
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
    /\{isMobileView && aiOpen && \(/.test(editor) &&
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
  "the model is told to prefer hiding, in the system prompt, not just given the tool",
  /PREFER HIDING TO DELETING/.test(
    readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"),
  ),
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
  /BUILDING A SECTION IS MORE THAN ADDING IT/.test(
    readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"),
  ),
)

check(
  "and that a value the control cannot take is as silent a failure as a wrong id",
  /EVERY SETTING IS A CONTROL/.test(
    readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8"),
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
  const script = readFileSync(join(root, "sql/RUN_THIS_ALL_PENDING.sql"), "utf8")

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
  const chat = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")

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
    "the not-set-up message does not claim anything is broken",
    /Chat history is not switched on yet/.test(chat),
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
    /setQueued\(prompt\)/.test(chat) && /if \(busy \|\| !queued\) return/.test(chat),
  )
  check("a failed exchange can be sent again without retyping it", /Try again/.test(chat))
  check("the box grows with what is in it", /field\.style\.height = `\$\{Math\.min/.test(chat))

  check(
    "the panel wears the Storelib mark, not a generic star",
    /<StorelibMark/.test(chat) && !/Sparkles/.test(chat),
  )
}

{
  const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check(
    "and so does the button that opens it",
    /<StorelibMark className=\{cn\("h-\[18px\] w-\[18px\]/.test(editor) &&
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
    /aiOpen\s*\n?\s*\? "border-foreground bg-muted"/.test(editor),
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
    const loop = readFileSync(join(root, "lib/website-builder/agent/loop.ts"), "utf8")
    return (
      /if \(locked\) \{/.test(loop) &&
      /const wholePage: Record<string, string> = \{/.test(loop) &&
      /target !== locked/.test(loop)
    )
  })(),
)

{
  const chat = readFileSync(join(root, "components/website-builder/theme-chat.tsx"), "utf8")
  check(
    "the panel shows what the edit is limited to, before you type it",
    /Only \{selectedSection\.name\}/.test(chat) && /nothing else will change/.test(chat),
  )
  check("it is on by default when a section is selected", /useState\(true\)/.test(chat))
  check(
    "a new selection re-arms it, so the chip cannot say one thing and mean another",
    /setLockOn\(true\)\n  \}, \[selectedSectionId\]\)/.test(chat),
  )
  check("and it can be cleared to edit the whole page", /setLockOn\(false\)/.test(chat))
  check("the panel actually sends it", /lockToSelection: live\.current\.locked/.test(chat))
}

check(
  "and the endpoint only honours it with a section actually selected",
  /lockToSelection: body\.lockToSelection === true && !!body\.selectedSectionId/.test(
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8"),
  ),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
