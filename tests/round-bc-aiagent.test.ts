/**
 * ===========================================================================
 *  ROUND BC: STORELIB AI KEEPS GOING, READS WHAT IS MEANT, REMEMBERS
 * ===========================================================================
 * The builder's assistant ended runs on "Edit failed, try again" for things
 * it could have repaired itself: an edit whose find differed from the file
 * by spaces, settings sent with a trailing comma or as an object, a
 * conversation grown longer than the model takes, the provider dropping out
 * on turn twelve of a build. Each failure class is driven here against a
 * fake provider that returns recorded shapes of model output (no model is
 * called), and each now ends in the change, or in a pause the chat carries on
 * from by itself.
 *
 * Also: with a section open, "add a testimonials section below this" is a new
 * section beside it, not the open one edited; a request with several parts is
 * a list of steps done in order; what the creator says in passing that stays
 * true ("I never want gradients") is kept in AI Memory.
 *
 * Run with:  npx tsx --conditions react-server tests/round-bc-aiagent.test.ts
 * (or through scripts/run-push-tests.mjs).
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeAgent, editRefusal, WHOLE_FILE_ON_MISS, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import type { ThemeState } from "@/lib/website-builder/agent/operations"
import { applySourceEdits, looseLocate, nearestLines } from "@/lib/website-builder/agent/code-edits"
import { lenientParse, lenientSettings, repairArguments } from "@/lib/website-builder/agent/lenient-json"
import { shortenTurns, transcriptSize } from "@/lib/website-builder/agent/run-repair"
import { readSelection, selectedShapeOf, selectionGuidance, type SelectedShape } from "@/lib/website-builder/agent/selection-intent"
import { openTasksNote, readTaskDone, splitTasks, taskGuidance, tasksForCreator } from "@/lib/website-builder/agent/task-list"
import { durableFacts } from "@/lib/website-builder/agent/durable-facts"
import { stoppedSentence } from "@/lib/website-builder/agent/limits"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { isContextOverflow, plainFailures, PlainError } from "@/lib/sites/agent/plain-errors"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, AgentTurn, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── a fake model: recorded turns, a thrown error, or raw argument text ── */

type Call = [string, Record<string, unknown> | string]
type Scripted = { text?: string; calls?: Call[]; stop?: ProviderTurn["stop"]; fail?: () => unknown }

function scripted(script: Scripted[], sent: ProviderRequest[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push({ ...request, turns: request.turns.map((t) => ({ ...t })) as AgentTurn[] })
      const step = script[turn++] ?? { text: "Done." }
      if (step.fail) throw step.fail()
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `call_${turn}_${i}`, name, argumentsJson: typeof args === "string" ? args : JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 },
        stop: step.stop ?? (toolCalls.length > 0 ? "tool_calls" : "done"),
      }
    },
  }
}

function make(id: string, type: string, blocks: SectionInstance["blocks"] = []): SectionInstance {
  return { id, type, name: SECTION_SCHEMAS[type]?.name ?? type, settings: {}, blocks }
}
function page(): ThemeState {
  return {
    sections: [
      make("header-1", "header"),
      make("hero-1", "hero"),
      make("faq-1", "faq", [{ id: "f1", type: "faq_item", settings: { question: "What is your return policy?", answer: "<p>30 days.</p>" } }]),
      make("footer-1", "footer"),
    ],
    settings: {},
  }
}

async function run(prompt: string, script: Scripted[], extra: Partial<Parameters<typeof themeAgent>[0]> = {}) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  let n = 0
  const loop = themeAgent({
    provider: scripted(script, sent),
    model: "test",
    prompt,
    state: page(),
    page: "home",
    addable: ADDABLE_SECTIONS,
    maxReviews: 0,
    newId: (t) => `${t}-new-${++n}`,
    ...extra,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done === true) return { sent, events, result: step.value }
    events.push(step.value as ThemeAgentEvent)
  }
}
const toolOutputs = (req: ProviderRequest) => req.turns.flatMap((t) => (t.role === "tool" ? t.results.map((r) => r.output) : []))
const lastOutputs = (sent: ProviderRequest[]) => toolOutputs(sent[sent.length - 1])

async function main() {
// ===========================================================================
section("An edit whose find differs from the file by spacing still lands")
// ===========================================================================
{
  const file = "<template>\n  <div class=\"faq\">\n    <p>{{ settings.heading }}</p>\n  </div>\n</template>\n<style>\n  .faq {\n    transition: opacity 200ms ease;\n  }\n</style>"
  const indented = applySourceEdits(file, [{ find: ".faq {\n  transition: opacity 200ms ease;\n}", replace: ".faq {\n    transition: opacity 320ms ease;\n  }" }])
  check("re-indented find is matched and applied", indented.ok === true && indented.source.includes("320ms") && !indented.source.includes("200ms"), indented)
  check("and the note says it matched with different spacing", indented.ok === true && (indented.notes ?? []).some((n) => /different spacing/.test(n)))
  const squeezed = applySourceEdits(file, [{ find: ".faq{transition:opacity 200ms ease;}", replace: ".faq { transition: opacity 90ms ease; }" }])
  check("missing spaces around symbols still match", squeezed.ok === true && squeezed.source.includes("90ms"), squeezed)
  check("words are never run together by the loosening (\"200 ms\" is not \"200ms\")", looseLocate(file, "opacity 200 ms") === "none")
  const crlf = file.replace(/\n/g, "\r\n")
  const windows = applySourceEdits(crlf, [{ find: "<p>{{ settings.heading }}</p>\n  </div>", replace: "<h2>{{ settings.heading }}</h2>\n  </div>" }])
  check("a file with Windows line ends takes an edit typed with plain ones", windows.ok === true && windows.source.includes("<h2>") && windows.source.includes("\r\n"), windows)
  const edit = { find: "transition: opacity 200ms ease;", replace: "transition: opacity 240ms ease-out;" }
  const twice = applySourceEdits(file, [edit])
  const again = twice.ok ? applySourceEdits(twice.source, [edit]) : null
  check("the same edit sent twice says it is already there, not that the file is wrong", again !== null && again.ok === false && /already in the file/.test(again.error), again)
  const ambiguous = applySourceEdits("a { color: red; }\nb { color: red; }", [{ find: "color:red;", replace: "color: blue;" }])
  check("a loosened find that names two places is refused, never guessed", ambiguous.ok === false && /more than once/.test(ambiguous.error))
  const miss = applySourceEdits(file, [{ find: "transition: opacity 250ms linear;", replace: "x" }])
  check("a find that is not there comes back with the closest lines, numbered", miss.ok === false && !!miss.near && /\|\s+transition: opacity 200ms ease;/.test(miss.near), miss)
  check("the closest lines are found by likeness, not the file's first lines", /transition/.test(nearestLines(file, "transition: opacity 250ms linear;")))
  const exact = applySourceEdits(file, [{ find: "200ms", replace: "240ms" }])
  check("an exact find still works exactly as before", exact.ok === true && exact.notes === undefined)

  const small = editRefusal("faq_mine", file, "Edit 1: the text to find is not in the file.")
  check("a small file's refusal carries the whole file to edit against", small.includes(file) && /write_section_code/.test(small))
  const big = "x\n".repeat(WHOLE_FILE_ON_MISS)
  const large = editRefusal("faq_mine", big, "Edit 1: the text to find is not in the file.", "   1| x")
  check("a large file's refusal carries the nearest lines and not the whole file", large.length < 2_000 && /closest lines/.test(large))
}

// ===========================================================================
section("Through the loop: a missed edit is repaired in the next turn")
// ===========================================================================
{
  const files: Record<string, string> = {}
  const faq = code("themes/default/sections/faq_accordion.storelib").replace(/"type": "faq_accordion"/, '"type": "faq_mine"')
  files["sections/faq_mine.storelib"] = faq
  const writes: string[] = []
  const codeTools = { read: (t: string) => files[`sections/${t}.storelib`] ?? null, write: async (t: string, s: string) => { writes.push(s); files[`sections/${t}.storelib`] = s; return { ok: true as const } } }
  const transition = (faq.match(/transition: [^;]*;/) ?? [""])[0]
  const { sent, result, events } = await run("make my faq open more smoothly", [
    { calls: [["read_section_code", { sectionType: "faq_mine" }]] },
    /* A recorded miss: the model misremembered the value. */
    { calls: [["edit_section_code", { sectionType: "faq_mine", edits: [{ find: "transition: grid-template-rows 999ms linear;", replace: "x" }] }]] },
    /* And a recorded near miss: the right line, typed with extra spaces. */
    { calls: [["edit_section_code", { sectionType: "faq_mine", edits: [{ find: `  ${transition.replace(/: /, ":   ")}  `, replace: "transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);" }] }]] },
    { text: "The answers now open over a quarter of a second." },
  ], { code: codeTools, sources: files })
  const afterMiss = toolOutputs(sent[2]).pop() ?? ""
  check("the miss says nothing was saved and shows the closest lines", /Nothing was saved/.test(afterMiss) && /closest lines/.test(afterMiss), afterMiss.slice(0, 300))
  check("the near miss is applied and kept", writes.length === 1 && writes[0].includes("240ms cubic-bezier(0.32, 0.72, 0, 1)"))
  check("the run succeeds with code written", result.status === "succeeded" && result.wroteCode === true, result.error)
  check("the missed step is shown as not done, and the kept one as done", events.filter((e) => e.type === "step" && e.state === "failed").length >= 1 && events.some((e) => e.type === "code"))
}

// ===========================================================================
section("Almost-JSON tool calls are read, not refused")
// ===========================================================================
{
  check("a fenced object is read", JSON.stringify(lenientParse('```json\n{"a":1}\n```')) === '{"a":1}')
  check("a trailing comma is dropped", JSON.stringify(lenientParse('{"a": [1, 2,], "b": "x",}')) === '{"a":[1,2],"b":"x"}')
  check("a comma inside someone's copy is kept", (lenientParse('{"t": "one, two,}",}') as { t: string }).t === "one, two,}")
  check("curly quotes used as the JSON's quotes are straightened", (lenientParse("{“heading”: “Hi”}") as { heading: string })?.heading === "Hi")
  check("JSON that stops part way is not guessed at", repairArguments('{"id": "hero-1", "settingsJson": "{\\"heading\\": \\"Fre') === null)
  check("arguments that already parse are left byte for byte", repairArguments('{ "a" : 1 }') === '{ "a" : 1 }')
  check("settings sent as an object are taken", JSON.stringify(lenientSettings({ heading: "Hi" })) === '{"heading":"Hi"}')
  check("settings that are not an object are still refused", lenientSettings("[1,2]") === null && lenientSettings(42) === null)

  const { result } = await run("change the hero heading to Fresh bread daily", [
    { calls: [["update_section", '```json\n{"id": "hero-1", "settingsJson": "{\\"heading\\": \\"Fresh bread daily\\",}"}\n```']] },
    { text: "Changed the hero heading." },
  ])
  const op = result.ops.find((o) => o.kind === "update_section") as { settings?: Record<string, unknown> } | undefined
  check("a fenced call with a trailing comma in its settings changes the page", result.status === "succeeded" && op?.settings?.heading === "Fresh bread daily", result.ops)

  const objectSettings = await run("change the hero heading", [
    { calls: [["update_section", { id: "hero-1", settingsJson: { heading: "Open every day" } }]] },
    { text: "Changed it." },
  ])
  const op2 = objectSettings.result.ops.find((o) => o.kind === "update_section") as { settings?: Record<string, unknown> } | undefined
  check("settings sent as an object rather than a string change the page", op2?.settings?.heading === "Open every day", objectSettings.result.ops)
}

// ===========================================================================
section("A reply cut off at the output limit is asked for again, not applied")
// ===========================================================================
{
  const { sent, result } = await run("change the hero heading", [
    { stop: "length", calls: [["update_section", '{"id": "hero-1", "settingsJson": "{\\"heading\\": \\"Hal']] },
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Whole" }) }]] },
    { text: "Changed it." },
  ])
  check("nothing of the cut off turn ran, the retry did", result.ops.length === 1 && (result.ops[0] as { settings?: Record<string, unknown> }).settings?.heading === "Whole")
  check("the retry had more room", sent[1].maxOutputTokens > sent[0].maxOutputTokens, [sent[0].maxOutputTokens, sent[1].maxOutputTokens])
}

// ===========================================================================
section("A conversation too long for the model is shortened and sent again")
// ===========================================================================
{
  check("the overflow sentence of each provider is recognised", isContextOverflow({ status: 400, message: "400 prompt is too long: 212000 tokens > 200000 maximum" }) && isContextOverflow({ status: 400, message: "This model's maximum context length is 128000 tokens", code: "context_length_exceeded" }))
  check("a busy provider is not an overflow", !isContextOverflow({ status: 529, message: "Overloaded" }))
  /* Through the wrapper every provider is handed out in: the flag survives being made plain. */
  const plain = plainFailures({ id: "x", complete: async () => { throw Object.assign(new Error("400 prompt is too long"), { status: 400 }) } })
  let thrown: unknown = null
  await plain.complete({} as ProviderRequest).catch((e) => (thrown = e))
  check("a plain error keeps that it was an overflow", thrown instanceof PlainError && isContextOverflow(thrown) && thrown.message === "That did not go through. Try again.")

  const turns: AgentTurn[] = [{ role: "user", content: "REQUEST" }]
  for (let i = 0; i < 6; i++) {
    turns.push({ role: "assistant", content: "", toolCalls: [{ id: `c${i}`, name: "read_section", argumentsJson: "{}" }] })
    turns.push({ role: "tool", results: [{ id: `c${i}`, output: "x".repeat(5_000) }] })
  }
  turns.push({ role: "user", content: "look", images: [{ mediaType: "image/png", data: "AAAA" }] })
  turns.push({ role: "assistant", content: "", toolCalls: [] })
  const short = shortenTurns(turns)
  check("old long results are shortened, every call keeps a result", short.saved > 0 && short.turns.length === turns.length && short.turns.every((t, i) => t.role !== "tool" || (turns[i].role === "tool" && t.results.length === (turns[i] as { results: unknown[] }).results.length)))
  check("the first message and the latest turns are kept as they were", short.turns[0] === turns[0] && short.turns[short.turns.length - 1] === turns[turns.length - 1])
  check("shortening twice changes nothing more", shortenTurns(short.turns).saved === 0)
  check("the size counts pictures", transcriptSize([{ role: "user", content: "", images: [{ mediaType: "image/png", data: "" }] }]) > 0)

  const overflow = () => Object.assign(new Error("400 prompt is too long: 230000 tokens > 200000 maximum"), { status: 400 })
  const { sent, result } = await run("tell me about the hero, then change its heading", [
    { calls: [["read_section", { id: "hero-1" }]] },
    { calls: [["read_section_type", { sectionType: "faq" }]] },
    { calls: [["read_section_type", { sectionType: "testimonials" }]] },
    { calls: [["read_section_type", { sectionType: "pricing" }]] },
    { fail: overflow },
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Still here" }) }]] },
    { text: "Changed the hero heading." },
  ])
  check("the run does not end on the overflow", result.status === "succeeded" && result.ops.length === 1, result.error)
  const retried = sent[5]
  check("the request after it carries shortened results", toolOutputs(retried).some((o) => o.startsWith("[shortened] ")))
}

// ===========================================================================
section("The provider failing part way is a pause, picked up by itself")
// ===========================================================================
{
  const refused = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"tool_use ids"}}'), { status: 400 })
  const { events, result } = await run("change the hero heading and the faq heading", [
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "One" }) }]] },
    { fail: refused },
  ])
  check("work already done stands: the run is not a failure", result.status === "succeeded" && result.ops.length === 1, result.error)
  check("it is marked interrupted, and the chat is told to carry on", result.stopped === "interrupted" && events.some((e) => e.type === "continue" && e.reason === "interrupted"))
  check("the reply says it is picking the rest up", /picking up the rest/.test(result.message), result.message)
  check("the chat sends the next part by itself for any reason but the cost ceiling", /if \(event\.reason === "budget"\) patch\(\(e\) => \(\{ \.\.\.e, canContinue: true \}\)\)\s*\n\s*else carryOn = true/.test(code("components/website-builder/theme-chat.tsx")))
  check("the sentence is plain, with no em dash", !/—/.test(stoppedSentence(true, "interrupted")))

  const nothingYet = await run("change the hero heading", [{ fail: refused }])
  check("with nothing done yet it is still a failure, in plain words", nothingYet.result.status === "failed" && !!nothingYet.result.error && !/invalid_request_error|\{/.test(nothingYet.result.error), nothingYet.result.error)

  const unavailable = () => Object.assign(new Error("400 Your credit balance is too low"), { status: 400 })
  const billing = await run("change the hero heading", [
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "One" }) }]] },
    { fail: unavailable },
  ])
  check("billing is not picked up again and again", billing.result.stopped !== "interrupted" && !billing.events.some((e) => e.type === "continue"))

  const started = Date.now()
  const network = () => Object.assign(new Error("Connection error."), { name: "APIConnectionError" })
  const busy = await run("change the hero heading", [
    { fail: network },
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Back" }) }]] },
    { text: "Changed it." },
  ])
  check("a dropped connection is tried again after a short wait", busy.result.status === "succeeded" && busy.result.ops.length === 1 && Date.now() - started >= 1_000, busy.result.error)
}

// ===========================================================================
section("A section open is not always the subject")
// ===========================================================================
{
  const hero: SelectedShape = { id: "hero-1", type: "hero", name: "Hero", position: 1, total: 4, blockTypes: [] }
  const faq: SelectedShape = { id: "faq-1", type: "faq", name: "FAQ", position: 2, total: 4, blockTypes: ["faq_item"] }
  const cases: Array<[string, SelectedShape, string, number?]> = [
    ["make this bolder", hero, "edit"],
    ["add a button", hero, "edit"],
    ["change the heading to Fresh bread", hero, "edit"],
    ["add two more questions", faq, "edit"],
    ["add a testimonials section below this", hero, "new", 2],
    ["add a pricing section above this", hero, "new", 1],
    ["I need another section with a map", hero, "new", 2],
    ["create a new section for our opening hours", hero, "new", 2],
    ["add testimonials", hero, "new", 2],
    ["add a FAQ at the bottom of the page", hero, "new", 3],
    ["add more FAQ entries", faq, "edit"],
    ["add testimonials", faq, "ask"],
    ["add testimonials to this", faq, "edit"],
    ["turn this into a pricing table", hero, "replace", 1],
    ["replace this with a gallery", faq, "replace", 2],
    ["make this section look better", hero, "edit"],
    ["add a section", hero, "new", 2],
  ]
  for (const [prompt, selected, aim, index] of cases) {
    const read = readSelection(prompt, selected)
    check(`"${prompt}" with ${selected.name} open: ${aim}${index !== undefined ? ` at ${index}` : ""}`, read.aim === aim && (index === undefined || read.index === index), read)
  }
  const shape = selectedShapeOf(page().sections, "faq-1", (t) => (t === "faq" ? ["faq_item"] : []))
  check("the open section's shape is read from the page", shape?.position === 2 && shape.total === 4 && shape.blockTypes?.includes("faq_item") === true, shape)
  check("an id not on the page is no open section", selectedShapeOf(page().sections, "nope") === null)
  const told = selectionGuidance(readSelection("add a testimonials section below this", hero), hero, "(hero)")
  check("the model is told it is a new section, where, and to leave the open one", /NEW SECTION/.test(told) && /index 2/.test(told) && /do not change Hero/.test(told) && /overrides/.test(told))
  const ask = selectionGuidance(readSelection("add testimonials", faq), faq, "(faq)")
  check("a real doubt is one question with two answers", /ask_creator once/.test(ask) && /"Inside FAQ"/.test(ask) && /"As a new section"/.test(ask))

  const { sent } = await run("add a testimonials section below this", [{ text: "Added." }], { selectedSectionId: "hero-1" })
  const first = (sent[0].turns[0] as { content: string }).content
  check("through the loop: the first turn says new section at index 2", /BUT THIS REQUEST IS FOR A NEW SECTION/.test(first) && /index 2/.test(first), first.slice(0, 400))
  const editing = await run("make the heading bigger", [{ text: "Done." }], { selectedSectionId: "hero-1" })
  check("and an edit of the open section reads as before", /THE CREATOR HAS THIS SECTION SELECTED AND OPEN/.test((editing.sent[0].turns[0] as { content: string }).content))
  const lockedRun = await run("add a testimonials section below this", [{ text: "Done." }], { selectedSectionId: "hero-1", lockToSelection: true })
  check("under the lock the open section stays the only subject", !/BUT THIS REQUEST IS FOR A NEW SECTION/.test((lockedRun.sent[0].turns[0] as { content: string }).content))

  check("a new section asked for with one open is not classed as the open one rethought", classifyIntent("add a modern pricing section below this", { selected: false }).kind !== "SECTION_REDESIGN" && classifyIntent("add a modern pricing section below this", { selected: true }).kind === "SECTION_REDESIGN")
  const route = code("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the route reads the open section before classifying the request", /const asksForNew = !!openShape && readSelection\(body\.prompt, openShape\)\.aim === "new"/.test(route) && /selected: !!body\.selectedSectionId && !asksForNew/.test(route))
}

// ===========================================================================
section("Several parts are a list, done in order, each ticked")
// ===========================================================================
{
  check("parts joined by and", JSON.stringify(splitTasks("Add a FAQ section and change the hero heading to Fresh bread daily")) === JSON.stringify(["Add a FAQ section", "change the hero heading to Fresh bread daily"]), splitTasks("Add a FAQ section and change the hero heading to Fresh bread daily"))
  check("a numbered list", splitTasks("1. Add a pricing section\n2. Make the hero darker\n3. Remove the newsletter").length === 3)
  check("sentences and then", splitTasks("Make the header sticky. Then add a countdown to our launch, and also rewrite the about copy.").length === 3, splitTasks("Make the header sticky. Then add a countdown to our launch, and also rewrite the about copy."))
  check("one change with two adjectives is one change", splitTasks("make the hero bold and bigger").length === 0)
  check("a brief is one task", splitTasks("Build me a website for my bakery with fresh bread and cakes").length === 0)
  check("one sentence is not a list", splitTasks("Change the heading").length === 0)
  check("a list is capped", splitTasks(Array.from({ length: 12 }, (_, i) => `- add section ${i}`).join("\n")).length === 8)
  check("the plan shows them numbered", tasksForCreator(["add a FAQ", "change the hero"]) === "1. Add a FAQ\n2. Change the hero")
  check("the guidance names task_done", /task_done/.test(taskGuidance(["a", "b"])))
  check("task_done reads its part", readTaskDone('{"part": 2}', 3) === 2 && readTaskDone('{"part": 9}', 3) === null && readTaskDone("nope", 3) === null)
  check("an open part is named in the note", /2\. change the hero/.test(openTasksNote(["add", "change the hero"], [2])))

  const { sent, events, result } = await run("Add a FAQ section and change the hero heading to Fresh bread daily", [
    { calls: [["add_section", { sectionType: "faq", index: 2, settingsJson: "{}" }], ["task_done", { part: 1 }]] },
    { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Fresh bread daily" }) }]] },
    /* A recorded early close: it forgot to say part 2 was done. */
    { text: "Added a FAQ." },
    { calls: [["task_done", { part: 2 }]] },
    { text: "Added a FAQ and changed the hero heading." },
  ])
  const plan = events.find((e) => e.type === "plan") as { text: string } | undefined
  check("the parts are the plan, from the start", plan?.text === "1. Add a FAQ section\n2. Change the hero heading to Fresh bread daily", plan)
  check("the tick tool is offered", sent[0].tools.some((t) => t.name === "task_done"))
  const steps = events.filter((e): e is Extract<ThemeAgentEvent, { type: "step" }> => e.type === "step" && e.id.startsWith("task:"))
  check("part 1 runs, is ticked, then part 2 runs and is ticked", steps.map((s) => `${s.id}:${s.state}`).join(",") === "task:1:running,task:1:done,task:2:running,task:2:done", steps.map((s) => `${s.id}:${s.state}`))
  check("a close with a part open is sent back, naming the part", sent[3].turns.some((t) => t.role === "user" && /NOT FINISHED/.test(t.content) && /change the hero heading/.test(t.content)))
  check("both changes are made and the run closes once all parts are ticked", result.status === "succeeded" && result.ops.length === 2 && result.message === "Added a FAQ and changed the hero heading.", result)
  const single = await run("change the hero heading", [{ text: "Done." }])
  check("a one part request has no list and no tick tool", !single.events.some((e) => e.type === "step" && e.id.startsWith("task:")) && !single.sent[0].tools.some((t) => t.name === "task_done"))
}

// ===========================================================================
section("What the creator says in passing that stays true is remembered")
// ===========================================================================
{
  const cases: Array<[string, string[]]> = [
    ["Make the hero darker, I never want gradients", ["Never use gradients."]],
    ["we don't like stock photos. change the gallery", ["Does not like stock photos."]],
    ["always use rounded buttons", ["Always use rounded buttons."]],
    ["Our brand colour is #1f3a2b, make the header match", ["Brand colours: #1f3a2b."]],
    ["the shop is called Bandidos", ["The business is called Bandidos."]],
    ["remember that prices are in euros", ["Prices are in euros."]],
    ["We sell handmade candles", ["Sells handmade candles."]],
    ["I like this, make it bigger", []],
    ["I don't like it", []],
    ["make the heading bigger", []],
    ["do you think we never want gradients?", []],
  ]
  for (const [prompt, want] of cases) {
    const got = durableFacts(prompt)
    check(`"${prompt}" keeps ${want.length ? want.join(" ") : "nothing"}`, JSON.stringify(got) === JSON.stringify(want), got)
  }
  check("at most three a run", durableFacts("I never want gradients. Always use serif headings. Our brand colour is red. We sell candles. My font is Fraunces.").length === 3)
  const route = code("app/api/website-builder/themes/[installId]/agent/route.ts")
  check("the route keeps them for this website after a run that went through, never twice", /durableFacts\(body\.prompt\)\.filter\(\(note\) => !known\.some\(\(k\) => sameMemory\(k, note\)\)\)/.test(route) && /result\.status === "succeeded"/.test(route) && /result\.rememberedSite = \[\.\.\.\(result\.rememberedSite \?\? \[\]\), \.\.\.said\]/.test(route))
  const loop = code("lib/website-builder/agent/loop.ts")
  check("the remember tool asks for brand facts without being asked", /Call it without being asked whenever you learn one/.test(loop))
}

// ===========================================================================
section("Storelib's section format is said to a run that may write one")
// ===========================================================================
{
  const loop = code("lib/website-builder/agent/loop.ts")
  check("the craft note names schemes, type, spacing, blocks, live data and clean settings", /color_scheme setting and var\(--s-\*\)/.test(loop) && /theme's fonts and type scale/.test(loop) && /repeated content as blocks/.test(loop) && /products, collections and menus read live/.test(loop) && /Its settings stay clean/.test(loop))
  const files: Record<string, string> = { "sections/faq_mine.storelib": code("themes/default/sections/faq_accordion.storelib").replace(/"type": "faq_accordion"/, '"type": "faq_mine"') }
  const codeTools = { read: (t: string) => files[`sections/${t}.storelib`] ?? null, write: async () => ({ ok: true as const }) }
  const build = await run("redesign the faq completely, from scratch", [{ text: "Done." }], { code: codeTools, sources: files, intent: classifyIntent("redesign the faq completely, from scratch") })
  check("and it is in the turn of a redesign", /A SECTION YOU WRITE IS A STORELIB SECTION/.test((build.sent[0].turns[0] as { content: string }).content))
  const tweak = await run("change the hero heading", [{ text: "Done." }], { code: codeTools, sources: files, intent: classifyIntent("change the hero heading") })
  check("but not in the turn of a heading change, or in the system prompt", !/A SECTION YOU WRITE IS A STORELIB SECTION/.test((tweak.sent[0].turns[0] as { content: string }).content) && !/A SECTION YOU WRITE IS A STORELIB SECTION/.test(tweak.sent[0].system))
}

}

main().then(
  () => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      console.log(`Failing: ${failures.join(", ")}`)
      process.exit(1)
    }
  },
  (thrown) => {
    console.log(thrown)
    process.exit(1)
  },
)
