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
import { applyOps, buildSection, describeTheme, fieldIds, type ThemeOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"

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

function page(): ThemeState {
  const make = (id: string, type: string): SectionInstance => ({
    id,
    type,
    name: SECTION_SCHEMAS[type]?.name ?? type,
    settings: {},
    blocks: [],
  })
  return {
    sections: [make("header-1", "header"), make("hero-1", "hero"), make("footer-1", "footer")],
    settings: {},
  }
}

async function run(script: Scripted[], state = page()) {
  const events: ThemeAgentEvent[] = []
  let n = 0
  const loop = themeAgent({
    provider: scriptedProvider(script),
    model: "test",
    prompt: "do the thing",
    state,
    page: "home",
    addable: ADDABLE_SECTIONS,
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
    { calls: [["add_section", { sectionType: "faq", index: 2, settings: {} }]] },
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
    { calls: [["update_section", { id: "hero-1", settings: { nonsense_field: "x" } }]] },
    { text: "Done." },
  ])
  check("an unknown field is refused, not silently merged", result.ops.length === 0)
}

{
  const allowed = fieldIds("hero")
  const { result } = await run([
    { calls: [["update_section", { id: "hero-1", settings: { [allowed[0]]: "Real heading" } }]] },
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
    { calls: [["add_section", { sectionType: "faq", index: 0, settings: {} }]] },
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
    { calls: [["add_section", { sectionType: "not_a_real_section", index: 1, settings: {} }]] },
    { text: "Done." },
  ])
  check("an invented section type is refused", result.ops.length === 0)
}

{
  const { result } = await run([
    { calls: [["update_section", { id: "does-not-exist", settings: {} }]] },
    { text: "Done." },
  ])
  check("an invented id is refused", result.ops.length === 0)
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
    { calls: [["add_section", { sectionType: "faq", index: 2, settings: {} }]] },
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
