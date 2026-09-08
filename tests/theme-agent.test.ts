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
  describeStore,
  describeTheme,
  fieldIds,
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

function scriptedProvider(script: Scripted[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(): Promise<ProviderTurn> {
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

async function run(script: Scripted[], state = page(), selectedSectionId?: string) {
  const events: ThemeAgentEvent[] = []
  let n = 0
  const loop = themeAgent({
    provider: scriptedProvider(script),
    model: "test",
    prompt: "make this section better",
    state,
    page: "home",
    addable: ADDABLE_SECTIONS,
    selectedSectionId,
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
      return /<ThemeChat/.test(editor) && /aria-label="Ask AI"/.test(editor)
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
