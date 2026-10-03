/**
 * ===========================================================================
 *  SHOWING THE WORK
 * ===========================================================================
 * "I want when the Storelib AI writes in the chat to be things like a modal
 * showing the code coding in real time, task toggle, realtime things, plan."
 *
 * A run used to show one line of commentary that the next line replaced. You
 * could watch it for twenty seconds and learn nothing except that it was
 * still going.
 *
 * The thing worth guarding here is that none of it is theatre. Every step is
 * a tool call the model actually made, each arrives twice — once running,
 * once settled, under the SAME id, which is what makes a line tick instead
 * of appearing twice — and each is named against the page as it stood when
 * the call was made, because afterwards a section it removed has no name
 * left to be called by.
 *
 * Run with:  npm run test:push
 */

import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { activityLine, changeCount, EMPTY_ACTIVITY, finishedSteps, reduceActivity } from "@/lib/website-builder/ask-activity"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { readFileSync } from "node:fs"
import { join } from "node:path"

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

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]> }

function scripted(script: Scripted[]): AgentProvider {
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
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2 },
        stop: toolCalls.length > 0 ? "tool_calls" : "done",
      }
    },
  }
}

function make(id: string, type: string): SectionInstance {
  return { id, type, name: SECTION_SCHEMAS[type]?.name ?? type, settings: {}, blocks: [] }
}

async function run(script: Scripted[]) {
  const events: ThemeAgentEvent[] = []
  const loop = themeAgent({
    provider: scripted(script),
    model: "test",
    prompt: "make the page better",
    state: {
      sections: [make("header-1", "header"), make("faq-1", "faq_accordion"), make("footer-1", "footer")],
      settings: {},
    },
    page: "home",
    addable: ADDABLE_SECTIONS,
    maxReviews: 0,
    newId: (type) => `${type}-new`,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done) return events
    events.push(step.value as ThemeAgentEvent)
  }
}

// ---------------------------------------------------------------------------
section("The plan is the first thing it says, and it stays said")
// ---------------------------------------------------------------------------

{
  const events = await run([
    { text: "I'll read the FAQ and give it better questions.", calls: [["read_section", { id: "faq-1" }]] },
    { text: "Now writing them in.", calls: [["update_section", { id: "faq-1", settingsJson: '{"heading":"Questions"}' }]] },
    { text: "Done." },
  ])

  const plans = events.filter((e) => e.type === "plan")
  check(
    "the opening turn arrives as the plan, once",
    plans.length === 1 && plans[0].type === "plan" && /read the FAQ/.test(plans[0].text),
    JSON.stringify(plans),
  )
  check(
    "and the commentary after it is still commentary, not a second plan",
    events.some((e) => e.type === "thinking" && /Now writing them in/.test(e.text)),
  )
  check(
    "the plan comes before the first step",
    events.findIndex((e) => e.type === "plan") < events.findIndex((e) => e.type === "step"),
  )
}

{
  /** A run that starts straight into a tool call has no plan to show. */
  const events = await run([{ calls: [["read_section", { id: "faq-1" }]] }, { text: "Done." }])
  check(
    "a run that says nothing first shows no plan rather than an empty one",
    events.every((e) => e.type !== "plan"),
  )
}

// ---------------------------------------------------------------------------
section("Every step is a call that really happened")
// ---------------------------------------------------------------------------

{
  const events = await run([
    {
      text: "Reading first.",
      calls: [
        ["read_section", { id: "faq-1" }],
        ["update_section", { id: "faq-1", settingsJson: '{"heading":"Questions"}' }],
      ],
    },
    { text: "Done." },
  ])
  const steps = events.filter((e) => e.type === "step") as Extract<ThemeAgentEvent, { type: "step" }>[]

  check("one step per tool call, twice each", steps.length === 4, `${steps.length} step events`)
  check(
    "each arrives running first and settled second, under the SAME id",
    (() => {
      const ids = [...new Set(steps.map((s) => s.id))]
      return (
        ids.length === 2 &&
        ids.every((id) => {
          const mine = steps.filter((s) => s.id === id)
          return mine.length === 2 && mine[0].state === "running" && mine[1].state !== "running"
        })
      )
    })(),
    JSON.stringify(steps.map((s) => `${s.id}:${s.state}`)),
  )
  check(
    "the label does not change between the two, so the line ticks rather than rewrites itself",
    (() => {
      const byId = new Map<string, string[]>()
      for (const s of steps) byId.set(s.id, [...(byId.get(s.id) ?? []), s.label])
      return [...byId.values()].every((labels) => labels[0] === labels[1])
    })(),
  )
  check(
    "steps are named in words, not by their tool name",
    steps.every((s) => !/_/.test(s.label)) &&
      steps.some((s) => /^Reading /.test(s.label)) &&
      steps.some((s) => /^Changing /.test(s.label)),
    JSON.stringify([...new Set(steps.map((s) => s.label))]),
  )
  check(
    "and they are named after the section, not its id",
    steps.every((s) => !/faq-1/.test(s.label)),
    JSON.stringify(steps.map((s) => s.label)),
  )
}

{
  /**
   * THE ORDERING THAT MATTERS. A step is named BEFORE its call runs, because
   * after a remove_section the section it removed is no longer on the page to
   * be looked up — the label would come out as "a section".
   */
  const events = await run([
    { calls: [["remove_section", { id: "faq-1" }]] },
    { text: "Done." },
  ])
  const steps = events.filter((e) => e.type === "step") as Extract<ThemeAgentEvent, { type: "step" }>[]
  check(
    "a section that was removed is still named in the step that removed it",
    steps.length === 2 && /^Removing the /.test(steps[0].label) && !/a section/.test(steps[0].label),
    JSON.stringify(steps.map((s) => s.label)),
  )
}

{
  const events = await run([
    { calls: [["read_section", { id: "no-such-section" }]] },
    { text: "Done." },
  ])
  const steps = events.filter((e) => e.type === "step") as Extract<ThemeAgentEvent, { type: "step" }>[]
  check(
    "a call that did not land settles as failed rather than as a tick",
    steps.length === 2 && steps[1].state === "failed",
    JSON.stringify(steps.map((s) => `${s.label}:${s.state}`)),
  )
  check(
    "and a section that is not there is not called 'the a section'",
    steps.every((s) => !/ the a /.test(s.label)),
    JSON.stringify(steps.map((s) => s.label)),
  )
}

{
  /**
   * A WRITE THAT WROTE NOTHING IS NOT A TICK. update_section against a field
   * the schema does not have is refused, and the run carries on — but the
   * step that claimed to change something did not.
   */
  const events = await run([
    { calls: [["update_section", { id: "faq-1", settingsJson: '{"not_a_real_field":"x"}' }]] },
    { text: "Done." },
  ])
  const steps = events.filter((e) => e.type === "step") as Extract<ThemeAgentEvent, { type: "step" }>[]
  check(
    "a write that changed nothing does not show a tick",
    steps.length === 2 && steps[1].state === "failed",
    JSON.stringify(steps.map((s) => `${s.label}:${s.state}`)),
  )
}

{
  const loop = read("lib/website-builder/agent/loop.ts")
  check(
    "whether a step failed is set by the code that refused, not read off its wording",
    /failed\?: true/.test(loop) &&
      /const changedNothing = !op && WRITE_TOOLS\.has\(call\.name\)/.test(loop) &&
      !/\/\^\(Refused\|Unknown\|No such/.test(loop),
  )
}

// ---------------------------------------------------------------------------
section("The panel shows the run and does not invent one")
// ---------------------------------------------------------------------------

{
  /*
    The chat shows a run as one line that changes, the finished steps folded
    under a toggle, and the answer (lib/website-builder/ask-activity.ts reads
    the stream, components/website-builder/ask-activity.tsx draws it). The
    old panel, with its spinner, "Working" and ticks, is gone.
  */
  const lib = read("lib/website-builder/ask-activity.ts")
  const view = read("components/website-builder/ask-activity.tsx")
  let a = EMPTY_ACTIVITY
  a = reduceActivity(a, { type: "step", id: "c1", label: "Reading the FAQ", state: "running" })
  a = reduceActivity(a, { type: "step", id: "c1", label: "Reading the FAQ", state: "done" })
  check("the same id replaces its line instead of adding a second", a.steps.length === 1 && a.steps[0].state === "done", JSON.stringify(a.steps))
  check("while it runs, the line is the step it is on", activityLine(reduceActivity(EMPTY_ACTIVITY, { type: "step", id: "c2", label: "Changing the Hero", state: "running" }), 0) === "Changing the Hero")
  check("an empty run has nothing to fold away", finishedSteps(EMPTY_ACTIVITY).length === 0 && changeCount(EMPTY_ACTIVITY) === null)
  check(
    "there is no timer in the reading of it, so nothing can be paced to look busy",
    !/setInterval|setTimeout/.test(lib),
  )
  /*
    The owner asked for the steps back on screen while a run works, with a
    check that settles as each is done (T round). Still no spinner and no
    "3/5" counter: the mark is a dot that breathes, then a check.
  */
  check(
    "the steps are a list of rows with a check when done: no spinner, no counter",
    /<Check className="h-3 w-3"/.test(view.slice(view.indexOf("export function StepsTimeline"), view.indexOf("export function CodePreview"))) &&
      !/Loader2/.test(view.slice(view.indexOf("export function StepsTimeline"), view.indexOf("export function CodePreview"))) &&
      !/\/\{steps\.length\}|done\}\/\{/.test(view),
  )
  check(
    "code it wrote is capped in height rather than filling the thread",
    /max-h-44 max-w-full overflow-auto/.test(view),
  )
}

{
  const loop = read("lib/website-builder/agent/loop.ts")
  check(
    "the loop names a step before running the call, not after",
    (() => {
      const body = loop.slice(loop.indexOf("for (const call of turn.toolCalls)"))
      const named = body.indexOf("const stepLabel = toolStepLabel(")
      const ran = body.indexOf("} = execute(")
      return named > 0 && ran > 0 && named < ran
    })(),
  )
  /**
   * The source sent is the file as it was kept: for a whole-file write the
   * model's own string untouched, for a patch (edit_section_code) the file
   * with the edits applied, and only once it compiled and was kept.
   */
  check(
    "and the source of a section it wrote is sent as it was written",
    (() => {
      const kept = loop.indexOf("const kept = await code.write(codeType, prepared.source)")
      const sent = loop.indexOf('yield { type: "code", path, source: prepared.source }')
      return kept > 0 && sent > kept && /const source = typeof args\.source === "string" \? args\.source : ""/.test(loop)
    })(),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
