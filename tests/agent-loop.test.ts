/**
 * ===========================================================================
 *  THE AGENT LOOP, RUN — NOT PATTERN-MATCHED
 * ===========================================================================
 *
 * Every other guard on this feature reads source and asserts a shape. This one
 * drives the real loop, with the real tools, the real path rules and a REAL
 * esbuild, against a scripted provider that returns the tool calls a model
 * would return. Nothing is mocked except the network.
 *
 * That matters because the interesting behaviour is all sequencing, and
 * sequencing is exactly what reading a file cannot check: does a red build
 * really stop the save, does a model that forgets to build really get built
 * for, does an unparseable tool call really become a message the model can
 * recover from rather than a dead run.
 *
 * Run with:  npm run test:push
 */

// NATIVE esbuild, because that is what the agent's run_build uses in
// production. The browser worker uses esbuild-wasm at the same pinned version;
// testing against the one the server does not run would prove the wrong thing.
import * as esbuild from "esbuild"

import { agentLoop } from "@/lib/sites/agent/loop"
import {
  type AgentQuestion,
  type AnswerOutcome,
  MAX_ASKS_PER_RUN,
} from "@/lib/sites/agent/questions"
import { compactTurns, transcriptBytes } from "@/lib/sites/agent/compaction"
import {
  formatRenderFailure,
  permissionFlag,
  renderCheck,
  renderFailure,
  rootComponent,
} from "@/lib/sites/render-check"
import { ProjectWorkspace, toolsFor } from "@/lib/sites/agent/tools"
import { emptyDocument, type SiteDocument } from "@/lib/sites/document/schema"
import { renderDocument } from "@/lib/sites/document/render"
import { blankProject } from "@/lib/sites/starter"
import type { LoopResult } from "@/lib/sites/agent/loop"
import type {
  AgentEvent,
  AgentProvider,
  AgentTurn,
  ProviderRequest,
  ProviderTurn,
  ToolCall,
} from "@/lib/sites/agent/types"

/**
 * Drain a loop into its events and its verdict.
 *
 * The casts are not laziness. The push-test harness compiles with
 * `strictNullChecks: false`, and without it TypeScript cannot use the
 * optional `done?: false` on IteratorYieldResult as a discriminant — so
 * `if (step.done)` narrows nothing here even though it narrows fine under the
 * project's own config.
 */
async function drain(
  loop: AsyncGenerator<AgentEvent, LoopResult>,
): Promise<{ events: AgentEvent[]; result: LoopResult }> {
  const events: AgentEvent[] = []
  for (;;) {
    const step = await loop.next()
    if (step.done) return { events, result: step.value as LoopResult }
    events.push(step.value as AgentEvent)
  }
}

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

// ---------------------------------------------------------------------------
//  A provider that returns a script, and records what it was asked
// ---------------------------------------------------------------------------

/**
 * Is this schema legal under OpenAI strict mode, at every depth?
 *
 * Two rules, and they apply to every object in the tree: `additionalProperties`
 * must be present and false, and every declared property must appear in
 * `required`. A schema that breaks either is refused at request time with a
 * 400, so this is the difference between a tool that works and a feature that
 * has never once run.
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

  // An array's item schema is a schema too, and a free-form object hiding
  // inside one is refused for exactly the same reason.
  if (node.items && !strictLegal(node.items)) return false

  return true
}

type Scripted = { text?: string; calls?: Array<[string, Record<string, unknown>]>; stop?: ProviderTurn["stop"] }

function scriptedProvider(script: Scripted[]): AgentProvider & { requests: ProviderRequest[] } {
  let turn = 0
  const requests: ProviderRequest[] = []
  return {
    id: "scripted",
    requests,
    async complete(request: ProviderRequest): Promise<ProviderTurn> {
      requests.push(request)
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
        // Deliberately non-zero and different each turn, so a loop that only
        // counts the last one is visible in the total.
        usage: {
          inputTokens: 1000 + turn,
          cachedInputTokens: 100,
          cacheWriteTokens: 0,
          outputTokens: 50 + turn,
        },
        stop: step.stop ?? (toolCalls.length > 0 ? "tool_calls" : "done"),
      }
    },
  }
}

async function run(
  script: Scripted[],
  files = blankProject("Test Site"),
  maxTurns?: number,
  extra: {
    maxTokens?: number
    compactBytes?: number
    prompt?: string
    ask?: (question: AgentQuestion) => Promise<AnswerOutcome>
  } = {},
) {
  const workspace = new ProjectWorkspace(files)
  const provider = scriptedProvider(script)
  const loop = agentLoop({
    provider,
    model: "test-model",
    prompt: extra.prompt ?? "do the thing",
    workspace,
    esbuild,
    maxTurns,
    maxTokens: extra.maxTokens,
    compactBytes: extra.compactBytes,
    ask: extra.ask,
  })
  const { events, result } = await drain(loop)
  return { result, events, workspace, provider }
}

const GOOD_APP = `export default function App() {
  return <h1>Rebuilt</h1>
}
`
const BROKEN_APP = `export default function App() { return <div> }`

// ---------------------------------------------------------------------------
section("A normal edit, driven end to end")
// ---------------------------------------------------------------------------

{
  const { result, events, workspace } = await run([
    { calls: [["list_files", {}]] },
    { calls: [["read_file", { path: "src/App.tsx" }]] },
    { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
    { calls: [["run_build", {}]] },
    { text: "Rewrote the heading." },
  ])

  check("it succeeds", result.status === "succeeded", `status=${result.status} error=${result.error}`)
  check("the file is actually changed in the workspace", workspace.files["src/App.tsx"] === GOOD_APP)
  check("only the touched file is marked changed", [...workspace.changed].join() === "src/App.tsx")
  check("the reply is the model's prose", result.message === "Rewrote the heading.")
  check("no error is recorded on a success", result.error === null)

  /**
   * Five turns, each reporting its own tokens. A loop that overwrote instead
   * of accumulating would report the last turn's numbers and undercount the
   * bill by four fifths.
   */
  check(
    "tokens are summed across every turn, not overwritten",
    result.usage.inputTokens === 1001 + 1002 + 1003 + 1004 + 1005 &&
      result.usage.outputTokens === 51 + 52 + 53 + 54 + 55 &&
      result.usage.cachedInputTokens === 500,
    `input=${result.usage.inputTokens} output=${result.usage.outputTokens}`,
  )
  check("the turn count is the real number of round trips", result.turns === 5)

  const toolEvents = events.filter((e) => e.type === "tool")
  check(
    "every tool call is reported as it happens",
    toolEvents.length === 4 &&
      toolEvents.map((e) => (e as { name: string }).name).join() ===
        "list_files,read_file,write_file,run_build",
  )
  check(
    "the file path rides along so the UI can name it",
    toolEvents.some((e) => (e as { detail: string }).detail === "src/App.tsx"),
  )
}

// ---------------------------------------------------------------------------
section("A red build stops everything")
// ---------------------------------------------------------------------------

{
  // The model writes something that does not compile, builds, SEES the error,
  // and finishes anyway — which the prompt tells it not to do.
  const { result, workspace } = await run([
    { calls: [["write_file", { path: "src/App.tsx", content: BROKEN_APP }]] },
    { calls: [["run_build", {}]] },
    { text: "All done!" },
  ])

  check("the run fails even though the model said it was done", result.status === "failed")
  check(
    "and the reason is the one a creator can act on",
    result.error === "The edit did not compile, so nothing was changed.",
    `error=${result.error}`,
  )
  // The workspace still holds the bad edit — refusing to SAVE is run.ts's job,
  // and it keys off exactly this status.
  check("the broken content never becomes the saved state", result.status !== "succeeded")
  check("the build result is available to explain why", workspace.buildResult?.ok === false)
}

// ---------------------------------------------------------------------------
section("A model that forgets to build gets built for")
// ---------------------------------------------------------------------------

{
  // Writes a broken file and never calls run_build at all. Believing it here
  // is how a broken site gets saved by a model that simply skipped a step.
  const { result, events } = await run([
    { calls: [["write_file", { path: "src/App.tsx", content: BROKEN_APP }]] },
    { text: "Changed the hero." },
  ])

  check("the loop builds for itself when the model did not", result.status === "failed", `status=${result.status}`)
  check(
    "and says so",
    result.error === "The edit did not compile, so nothing was changed.",
    `error=${result.error}`,
  )
  check(
    "the extra build is visible in the stream, not silent",
    events.filter((e) => e.type === "tool" && (e as { name: string }).name === "run_build").length === 1,
  )
}

{
  // The same shape, but the edit is fine. The safety build must not turn a
  // good run into a failure.
  const { result } = await run([
    { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
    { text: "Changed the hero." },
  ])
  check("a good edit with no build still succeeds", result.status === "succeeded", `error=${result.error}`)
}

{
  // Nothing changed at all — the model just answered. There is nothing to
  // build and nothing to save, and that is a finished run, not a failure.
  const { result, workspace } = await run([{ text: "Your site already does that." }])
  check("answering without editing is a success", result.status === "succeeded")
  check("and nothing is marked as changed", workspace.changed.size === 0)
}

// ---------------------------------------------------------------------------
section("The model cannot get outside the project")
// ---------------------------------------------------------------------------

{
  const { result, workspace } = await run([
    { calls: [["write_file", { path: "../../../etc/passwd", content: "root:x:0:0" }]] },
    { calls: [["create_file", { path: "/etc/shadow", content: "x" }]] },
    { calls: [["create_file", { path: "deploy.sh", content: "rm -rf /" }]] },
    { calls: [["delete_file", { path: "index.html" }]] },
    { text: "Done." },
  ])

  check("no traversal, no absolute path, no shell script, no deleting index.html", workspace.changed.size === 0)
  check(
    "the project is untouched",
    Object.keys(workspace.files).sort().join() === Object.keys(blankProject("Test Site")).sort().join(),
  )
  check("and the run still completes rather than crashing", result.status === "succeeded")
}

{
  // Every refusal must come back as something the model can read and act on.
  const workspace = new ProjectWorkspace(blankProject("T"))
  const outputs = await Promise.all([
    workspace.execute("write_file", JSON.stringify({ path: "../x.ts", content: "" }), esbuild),
    workspace.execute("read_file", JSON.stringify({ path: "nope.tsx" }), esbuild),
    workspace.execute("write_file", JSON.stringify({ path: "src/New.tsx", content: "" }), esbuild),
    workspace.execute("create_file", JSON.stringify({ path: "src/App.tsx", content: "" }), esbuild),
    workspace.execute("read_file", "{not json", esbuild),
    workspace.execute("wander_off", "{}", esbuild),
  ])
  check(
    "every refusal is a sentence the model can recover from",
    outputs.every((o) => typeof o === "string" && o.length > 0) &&
      outputs[1].includes("does not exist") &&
      outputs[2].includes("create_file") &&
      outputs[3].includes("already exists") &&
      outputs[4].includes("valid JSON") &&
      outputs[5].includes("no tool called"),
  )
}

// ---------------------------------------------------------------------------
section("A run cannot go on forever, and a refusal is not a failure")
// ---------------------------------------------------------------------------

{
  // A model that keeps calling tools and never finishes.
  const forever: Scripted[] = Array.from({ length: 30 }, () => ({ calls: [["list_files", {}]] as Array<[string, Record<string, unknown>]> }))
  const { result } = await run(forever, blankProject("T"), 4)

  check("the cap stops it", result.status === "failed" && result.turns === 4, `turns=${result.turns}`)
  check(
    "and says how",
    /limit of 4 steps/.test(result.error ?? "") && /Nothing was changed/.test(result.error ?? ""),
    `error=${result.error}`,
  )
  check("the tokens it burned are still counted", result.usage.inputTokens > 0)
}

{
  const { result } = await run([{ text: "I can't help with that.", stop: "refusal" }])
  check("a refusal is its own status", result.status === "refused")
  check("it is not recorded as an error", result.error === null)
  check("and the model's words are what the creator sees", result.message === "I can't help with that.")
}

{
  // A provider that throws mid-run — a 500, a dropped connection.
  const exploding: AgentProvider = {
    id: "exploding",
    async complete() {
      throw new Error("upstream 503")
    },
  }
  const workspace = new ProjectWorkspace(blankProject("T"))
  const { result } = await drain(agentLoop({ provider: exploding, model: "m", prompt: "p", workspace, esbuild }))

  check("a thrown provider fails the run instead of the process", result.status === "failed")
  /* The provider's own words go to the server log, never to the creator (lib/sites/agent/plain-errors). */
  check("and the creator reads a plain sentence, not the provider's words", result.error === "The edit failed. Try again.", result.error ?? "")
  const shaped: AgentProvider = { id: "exploding", async complete() { throw Object.assign(new Error("503 Service Unavailable"), { status: 503 }) } }
  const again = await drain(agentLoop({ provider: shaped, model: "m", prompt: "p", workspace: new ProjectWorkspace(blankProject("T")), esbuild }))
  check("a provider's 503 says Storelib AI is busy", again.result.error === "Storelib AI is busy right now. Wait a moment and send it again.", again.result.error ?? "")
}

// ---------------------------------------------------------------------------
section("What the model is told")
// ---------------------------------------------------------------------------

{
  const { provider } = await run([{ text: "ok" }])
  const first = provider.requests[0]

  check(
    "the tool list handed to the provider is the closed set",
    first.tools.map((t) => t.name).join() ===
      "list_files,read_file,write_file,create_file,delete_file,update_manifest,search_code,find_usages,replace_in_file,set_plan,complete_step,run_build,read_build_errors,ask_creator",
  )
  check(
    "every tool schema is strict-mode legal",
    first.tools.every((tool) => {
      const p = tool.parameters as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }
      const properties = Object.keys(p.properties ?? {})
      // OpenAI strict mode requires additionalProperties:false and EVERY
      // property listed in `required` — a schema that misses this is rejected
      // at request time, which would be a 400 on the first real prompt.
      return p.additionalProperties === false && properties.every((key) => (p.required ?? []).includes(key))
    }),
  )
  check(
    "the system prompt states the dependency limit the bundler enforces",
    /ONLY react, react-dom and react-dom\/client/.test(first.system),
  )
  check("and tells it not to finish on a failing build", /Do not finish on a failing build/.test(first.system))
  check("the user's prompt is the first turn", first.turns[0].role === "user")
}

{
  /**
   * The history has to accumulate, or the model re-reads the same file forever.
   *
   * The scenario writes and builds rather than only reading, because a run
   * that was TOLD to do something and changed nothing is now refused — the
   * completion gate would add a turn and this test would be measuring the
   * gate instead of the history.
   */
  const { provider } = await run([
    { calls: [["list_files", {}]] },
    {
      calls: [
        ["read_file", { path: "src/App.tsx" }],
        ["write_file", { path: "src/App.tsx", content: GOOD_APP }],
        ["run_build", {}],
      ],
    },
    { text: "done" },
  ])
  const lengths = provider.requests.map((r) => r.turns.length)
  check(
    "each turn is sent the whole conversation so far",
    lengths.length === 3 && lengths[0] < lengths[1] && lengths[1] < lengths[2],
    `turn counts: ${lengths.join(" -> ")}`,
  )
  const last = provider.requests[2].turns
  check(
    "tool results are in the history the model sees",
    last.some((t) => t.role === "tool" && t.results.some((r) => r.output.includes("src/App.tsx"))),
  )
}


// ---------------------------------------------------------------------------
section("A build verdict stops being true the moment a file changes")
// ---------------------------------------------------------------------------

{
  /**
   * BUILD GREEN, THEN EDIT, THEN GO QUIET.
   *
   * The verdict used to be a plain field that nothing reset, so this sequence
   * passed the completion gate on an answer about a tree that no longer
   * existed — and saved an unbuilt project over a working site while reporting
   * success. The last write here does not compile, so if the stale green were
   * still believed the run would succeed.
   */
  const { result, workspace } = await run([
    { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
    { calls: [["run_build", {}]] },
    { calls: [["write_file", { path: "src/App.tsx", content: BROKEN_APP }]] },
    { text: "All done." },
  ])

  check(
    "an edit after a build makes the verdict unknown again, not green",
    result.status === "failed",
    `status=${result.status} error=${result.error}`,
  )
  check(
    "and nothing is saved on it",
    /did not compile/.test(result.error ?? ""),
    `error=${result.error}`,
  )
  check(
    "the loop built for itself rather than trusting the stale green",
    workspace.buildOk === false,
    `buildOk=${workspace.buildOk}`,
  )
}

{
  // The same shape, but the edit after the build is fine. Nothing should be
  // refused — the guard must not turn every post-build touch into a failure.
  const { result } = await run([
    { calls: [["write_file", { path: "src/App.tsx", content: BROKEN_APP }]] },
    { calls: [["run_build", {}]] },
    { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
    { text: "Fixed it." },
  ])
  check(
    "a good edit after a red build is rebuilt and accepted",
    result.status === "succeeded",
    `status=${result.status} error=${result.error}`,
  )
}

// ---------------------------------------------------------------------------
section("Running out of room keeps work that compiles")
// ---------------------------------------------------------------------------

{
  /**
   * Reaching the step limit used to set `failed` outright, which threw the run
   * away: a model that had done real, compiling work and simply had more to do
   * lost all of it, and the creator was told the edit failed.
   */
  const { result, workspace } = await run(
    [
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { calls: [["list_files", {}]] },
      { calls: [["list_files", {}]] },
    ],
    blankProject("T"),
    4,
  )

  check(
    "work that builds survives the step limit",
    result.status === "succeeded",
    `status=${result.status} error=${result.error}`,
  )
  check("and the file really is in the change set", workspace.changed.has("src/App.tsx"))
  check(
    "and the creator is told it stopped early",
    /limit of 4 steps/.test(result.message),
    `message=${result.message}`,
  )
}

{
  // Ran out having written nothing. That is not half a job — it is no job, and
  // calling it a success is exactly what the completion gate exists to stop.
  const { result } = await run(
    Array.from({ length: 6 }, () => ({ calls: [["list_files", {}]] as Array<[string, Record<string, unknown>]> })),
    blankProject("T"),
    3,
  )
  check(
    "a run that changed nothing still fails",
    result.status === "failed" && /Nothing was changed/.test(result.error ?? ""),
    `status=${result.status} error=${result.error}`,
  )
}

{
  /**
   * The token ceiling. The scripted provider reports ~1050 tokens a turn, so a
   * cap of 3000 is reached after three of them — and it must be noticed BEFORE
   * a turn rather than inside one, because a turn is a model call plus its
   * tools and tearing that in half leaves a file written and its import never
   * added.
   */
  const { result, provider } = await run(
    [
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { calls: [["list_files", {}]] },
      { calls: [["list_files", {}]] },
      { calls: [["list_files", {}]] },
      { calls: [["list_files", {}]] },
    ],
    blankProject("T"),
    20,
    { maxTokens: 3000 },
  )

  check(
    "the token ceiling stops the run well before the step limit",
    provider.requests.length < 6 && provider.requests.length >= 2,
    `turns=${provider.requests.length}`,
  )
  check(
    "and it says so in tokens, not steps",
    result.status === "succeeded" && /budget of 3k tokens/.test(result.message),
    `status=${result.status} message=${result.message}`,
  )
  check(
    "every request the provider saw was a complete turn",
    provider.requests.every((r) => r.turns.length > 0),
  )
}

{
  // The warning arrives once, before the cutoff, and reads as an instruction.
  const { provider } = await run(
    Array.from({ length: 10 }, () => ({ calls: [["list_files", {}]] as Array<[string, Record<string, unknown>]> })),
    blankProject("T"),
    20,
    { maxTokens: 6000 },
  )
  const warnings = provider.requests[provider.requests.length - 1].turns.filter(
    (t) => t.role === "user" && /close to this run's budget/.test(t.content),
  )
  check("the model is warned it is running out, exactly once", warnings.length === 1, `warnings=${warnings.length}`)
}

// ---------------------------------------------------------------------------
section("Compaction: the transcript stays inside a budget without losing the run")
// ---------------------------------------------------------------------------

/** A project big enough that reading a file is worth compacting. */
function bulkyProject(): Record<string, string> {
  const files: Record<string, string> = { ...blankProject("Bulky") }
  for (let i = 0; i < 6; i++) {
    files[`src/components/Big${i}.tsx`] =
      `export default function Big${i}() {\n  return (\n    <section>\n` +
      Array.from({ length: 90 }, (_, l) => `      <p>Big ${i} line ${l} with enough prose to be worth bytes.</p>`).join("\n") +
      `\n    </section>\n  )\n}\n`
  }
  return files
}

{
  // Under budget, nothing is touched — which is what keeps ordinary runs
  // cacheable. A compactor that rewrites every turn destroys the prefix it is
  // meant to be saving money on.
  const { provider, events } = await run([
    { calls: [["read_file", { path: "src/App.tsx" }]] },
    { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
    { calls: [["run_build", {}]] },
    { text: "done" },
  ])

  const anyElided = provider.requests.some((r) =>
    r.turns.some((t) => t.role === "tool" && t.results.some((x) => x.output.startsWith("[elided]"))),
  )
  check("a short run is never rewritten", !anyElided)
  check(
    "and nothing claims it was compacted",
    !events.some((e) => e.type === "tool" && e.name === "compact_context"),
  )
}

{
  /**
   * THE STALE READ GOES FIRST, AND IT IS NOT THE OLDEST.
   *
   * Big0 is read first and rewritten later, so by the end its copy in the
   * transcript describes a file that no longer exists in that form. Big1 is
   * read second and never touched, so its copy is still true. Age would evict
   * Big0 then Big1; correctness evicts Big0 and leaves Big1 alone.
   */
  const { provider, events, result } = await run(
    [
      { calls: [["read_file", { path: "src/components/Big0.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big1.tsx" }]] },
      { calls: [["write_file", { path: "src/components/Big0.tsx", content: "export default function Big0() {\n  return <p>small</p>\n}\n" }]] },
      { calls: [["read_file", { path: "src/components/Big2.tsx" }]] },
      { calls: [["run_build", {}]] },
      { calls: [["list_files", {}]] },
      { text: "Shrank Big0." },
    ],
    bulkyProject(),
    20,
    { compactBytes: 12_000 },
  )

  check("the run still succeeds", result.status === "succeeded", `error=${result.error}`)

  const last = provider.requests[provider.requests.length - 1].turns
  const outputs = last.flatMap((t) => (t.role === "tool" ? t.results.map((r) => r.output) : []))

  const staleNote = outputs.find((o) => o.startsWith("[elided]") && o.includes("Big0.tsx"))
  check(
    "the read whose file was rewritten is the one removed",
    !!staleNote && /CHANGED since/.test(staleNote),
    `note=${staleNote?.slice(0, 90)}`,
  )
  check(
    "and the note tells the model how to get it back",
    !!staleNote && /read_file/.test(staleNote),
  )
  check(
    "the run reports that it compacted",
    events.some((e) => e.type === "tool" && e.name === "compact_context"),
  )
}

{
  /**
   * STRUCTURE SURVIVES. The provider replays assistant turns verbatim and
   * every tool result has to answer a call_id from one of them. Dropping a
   * turn — or one result out of a turn — is a malformed conversation, not a
   * shorter one, and the provider rejects it.
   */
  const { provider } = await run(
    [
      { calls: [["read_file", { path: "src/components/Big0.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big1.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big2.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big3.tsx" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "done" },
    ],
    bulkyProject(),
    20,
    { compactBytes: 10_000 },
  )

  const first = provider.requests[0].turns.filter((t) => t.role === "tool").length
  const last = provider.requests[provider.requests.length - 1].turns
  const toolTurns = last.filter((t) => t.role === "tool")
  check("no tool turn was removed", toolTurns.length >= first + 4, `tool turns=${toolTurns.length}`)
  check(
    "every result still carries the id it must echo",
    toolTurns.every((t) => t.role === "tool" && t.results.every((r) => typeof r.id === "string" && r.id.length > 0)),
  )
  check(
    "and every result still has something in it",
    toolTurns.every((t) => t.role === "tool" && t.results.every((r) => r.output.length > 0)),
  )
}

{
  /**
   * The recap is what stops compaction from being amnesia: decisions, files
   * touched, the build's verdict and the steps still open, restated from state
   * that is known to be true rather than summarised by a second model call.
   */
  const { provider } = await run(
    [
      { calls: [["set_plan", { steps: ["Shrink Big0", "Shrink Big1", "Check the build"] }]] },
      { calls: [["read_file", { path: "src/components/Big0.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big1.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big2.tsx" }]] },
      { calls: [["write_file", { path: "src/components/Big0.tsx", content: "export default function Big0() {\n  return <p>x</p>\n}\n" }]] },
      { calls: [["complete_step", { step: "Shrink Big0" }]] },
      { calls: [["read_file", { path: "src/components/Big3.tsx" }]] },
      { calls: [["run_build", {}]] },
      { text: "done" },
    ],
    bulkyProject(),
    20,
    { compactBytes: 9_000 },
  )

  const last = provider.requests[provider.requests.length - 1].turns
  const note = last.find((t) => t.role === "user" && /HAS BEEN COMPACTED/.test(t.content))
  check("a recap goes in when anything is dropped", !!note)
  check(
    "it names what has already been written",
    !!note && /Big0\.tsx/.test(note.role === "user" ? note.content : ""),
  )
  check(
    "it names the steps still open",
    !!note && /Shrink Big1/.test(note.role === "user" ? note.content : "") &&
      !/STILL TO DO:[^]*Shrink Big0/.test(note.role === "user" ? note.content : ""),
  )
  check(
    "it says where the build stands",
    !!note && /build/i.test(note.role === "user" ? note.content : ""),
  )
  check(
    "the plan's own result is never evicted — it is the record of the decision",
    last.some((t) => t.role === "tool" && t.results.some((r) => /Shrink Big1/.test(r.output) && !r.output.startsWith("[elided]"))),
  )
}

{
  /**
   * IDEMPOTENCE. Compaction runs again on every turn once a run is big; a pass
   * that re-elides what it already elided would move the cache prefix every
   * turn and undo the reason for the budget in the first place.
   */
  const { provider } = await run(
    [
      { calls: [["read_file", { path: "src/components/Big0.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big1.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big2.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big3.tsx" }]] },
      { calls: [["read_file", { path: "src/components/Big4.tsx" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "done" },
    ],
    bulkyProject(),
    20,
    { compactBytes: 9_000 },
  )

  const doubled = provider.requests.some((r) =>
    r.turns.some((t) => t.role === "tool" && t.results.some((x) => x.output.indexOf("[elided]") !== x.output.lastIndexOf("[elided]"))),
  )
  check("nothing is elided twice", !doubled)

  const notes = provider.requests[provider.requests.length - 1].turns.filter(
    (t) => t.role === "user" && /HAS BEEN COMPACTED/.test(t.content),
  ).length
  check(
    "and the recap is not repeated on every turn once it fires",
    notes <= 3,
    `recaps=${notes}`,
  )
}



// ---------------------------------------------------------------------------
section("Compaction, driven directly: worst first, not oldest first")
// ---------------------------------------------------------------------------

{
  /**
   * The ordering rule, on a transcript built by hand so exactly one eviction
   * is needed. Through the loop this is hard to pin down — the budget either
   * evicts nothing or evicts several — and the property that matters is which
   * ONE goes when only one has to.
   *
   * A is read and later rewritten, so its copy is a lie. B is read and never
   * touched, so its copy is still true and is also OLDER than the read of C.
   * Age would take A then B; correctness takes A and stops.
   */
  /**
   * B AND C ARE BIGGER THAN A ON PURPOSE.
   *
   * Within a tier the compactor takes the biggest saving first, so if the
   * stale read did not outrank them by REASON it would survive on size and
   * this would pass for the wrong cause. It did, the first time this was
   * written: every body was the same length, so the age tie-break picked A
   * anyway and the priority could be deleted without a failure.
   */
  const body = (name: string, times: number) => `contents of ${name} `.repeat(times)

  const turns: AgentTurn[] = [
    { role: "user", content: "do it" },
    { role: "assistant", content: "", toolCalls: [{ id: "a", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "a", output: body("A", 100) }] },
    { role: "assistant", content: "", toolCalls: [{ id: "b", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "b", output: body("B", 400) }] },
    { role: "assistant", content: "", toolCalls: [{ id: "w", name: "write_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "w", output: "Wrote src/A.tsx (12 chars)." }] },
    { role: "assistant", content: "", toolCalls: [{ id: "c", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "c", output: body("C", 400) }] },
    { role: "assistant", content: "", toolCalls: [{ id: "d", name: "run_build", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "d", output: "Build succeeded." }] },
    { role: "assistant", content: "", toolCalls: [{ id: "e", name: "run_build", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "e", output: "Build succeeded." }] },
  ]

  const calls = new Map([
    ["a", { name: "read_file", path: "src/A.tsx" }],
    ["b", { name: "read_file", path: "src/B.tsx" }],
    ["w", { name: "write_file", path: "src/A.tsx" }],
    ["c", { name: "read_file", path: "src/C.tsx" }],
    ["d", { name: "run_build", path: "" }],
    ["e", { name: "run_build", path: "" }],
  ])

  const before = transcriptBytes(turns)
  // Just under, so exactly one result has to go — and A is the smallest of
  // the three, which is the point: only its staleness gets it chosen.
  const outcome = compactTurns({ turns, calls, budgetBytes: before - 100, keepRecentTurns: 1 })

  const out = (id: string) =>
    outcome.turns.flatMap((t) => (t.role === "tool" ? t.results : [])).find((r) => r.id === id)?.output ?? ""

  check("the stale read is the one that goes", out("a").startsWith("[elided]"))
  check("the accurate older read survives it", !out("b").startsWith("[elided]"))
  check("so does the newer one", !out("c").startsWith("[elided]"))
  check("it is reported as stale, not as making room", outcome.stalePaths.includes("src/A.tsx"))
  check("the write's own result is never touched", out("w") === "Wrote src/A.tsx (12 chars).")
  check("and it actually came under budget", outcome.bytesAfter < before)

  // A second pass with the same budget must be a no-op, or the cache prefix
  // moves on every turn and the budget costs more than it saves.
  const again = compactTurns({ turns: outcome.turns, calls, budgetBytes: before - 100, keepRecentTurns: 1 })
  check("running it again changes nothing", !again.compacted)

  /**
   * And under a budget nothing can satisfy, the pass that CANNOT return early
   * still must not re-elide what it already elided — a stub wrapped in a stub
   * is a prefix that moves every turn, which is the cost this whole file
   * exists to avoid.
   */
  const desperate = compactTurns({ turns: outcome.turns, calls, budgetBytes: 0, keepRecentTurns: 0 })
  const stubs = desperate.turns
    .flatMap((t) => (t.role === "tool" ? t.results : []))
    .map((r) => r.output)
  check(
    "and a pass that cannot come under budget never elides an elision",
    stubs.every((x) => x.indexOf("[elided]") === x.lastIndexOf("[elided]")),
    stubs.find((x) => x.indexOf("[elided]") !== x.lastIndexOf("[elided]"))?.slice(0, 80),
  )
}

{
  /**
   * An elision is never elided again, whatever size it is.
   *
   * The size floor happens to exclude the stubs this file writes today, which
   * made the guard look unnecessary — but "today's stubs are short" is a
   * coupling nobody would remember, and a stub wrapped in a stub is a prefix
   * that moves on every turn. Asserted directly, with a stub long enough that
   * only the guard can save it.
   */
  const long = "[elided] " + "x".repeat(4000)
  const turns: AgentTurn[] = [
    { role: "user", content: "go" },
    { role: "assistant", content: "", toolCalls: [{ id: "a", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "a", output: long }] },
    { role: "assistant", content: "", toolCalls: [{ id: "b", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "b", output: "y".repeat(4000) }] },
  ]
  const outcome = compactTurns({
    turns,
    calls: new Map([
      ["a", { name: "read_file", path: "src/A.tsx" }],
      ["b", { name: "read_file", path: "src/B.tsx" }],
    ]),
    budgetBytes: 0,
    keepRecentTurns: 0,
  })
  const kept = outcome.turns.flatMap((t) => (t.role === "tool" ? t.results : []))
  check(
    "an existing elision is left exactly as it was",
    kept.find((r) => r.id === "a")?.output === long,
  )
  check(
    "while the real content beside it is taken",
    kept.find((r) => r.id === "b")?.output.startsWith("[elided]") === true,
  )
}

{
  // Under budget: not one byte is rewritten. This is what keeps ordinary runs
  // byte-identical turn to turn, which is the whole reason they cache.
  const turns: AgentTurn[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "", toolCalls: [{ id: "a", name: "read_file", argumentsJson: "{}" }] },
    { role: "tool", results: [{ id: "a", output: "x".repeat(5000) }] },
  ]
  const outcome = compactTurns({
    turns,
    calls: new Map([["a", { name: "read_file", path: "src/A.tsx" }]]),
    budgetBytes: 100_000,
  })
  check("a transcript inside its budget is returned untouched", !outcome.compacted && outcome.turns === turns)
}



// ---------------------------------------------------------------------------
section("find_usages, through the real workspace")
// ---------------------------------------------------------------------------

{
  const files = { ...blankProject("Usages") }
  // Imported and never rendered — the shape of "why isn't my section showing".
  files["src/components/Reviews.tsx"] = `export default function Reviews() {
  return <section>Reviews</section>
}
`
  files["src/App.tsx"] = `import Hero from "./components/Hero"
import Reviews from "./components/Reviews"

export default function App() {
  return <Hero />
}
`

  const workspace = new ProjectWorkspace(files)
  const hero = await workspace.execute("find_usages", JSON.stringify({ name: "Hero" }), esbuild)
  const reviews = await workspace.execute("find_usages", JSON.stringify({ name: "Reviews" }), esbuild)
  const nothing = await workspace.execute("find_usages", JSON.stringify({ name: "Ghost" }), esbuild)

  check(
    "it answers where a component is defined, imported and rendered",
    /Defined in: src\/components\/Hero\.tsx/.test(hero) &&
      /Imported by: src\/App\.tsx/.test(hero) &&
      /Rendered in: src\/App\.tsx/.test(hero),
    hero,
  )
  check(
    "and states the imported-but-never-rendered case outright",
    /never renders it/.test(reviews),
    reviews,
  )
  check(
    "an unknown name is a sentence, not an empty answer",
    /Nothing exports or renders/.test(nothing) && /search_code/.test(nothing),
    nothing,
  )

  /**
   * The map is rebuilt per call rather than cached: a project changes under a
   * run, and an answer from three edits ago is a confident lie.
   */
  await workspace.execute(
    "write_file",
    JSON.stringify({ path: "src/App.tsx", content: `import Reviews from "./components/Reviews"\n\nexport default function App() {\n  return <Reviews />\n}\n` }),
    esbuild,
  )
  const after = await workspace.execute("find_usages", JSON.stringify({ name: "Reviews" }), esbuild)
  check(
    "and it sees edits the run has already made",
    /Rendered in: src\/App\.tsx/.test(after) && !/never renders it/.test(after),
    after,
  )
}



// ---------------------------------------------------------------------------
section("Does it RENDER, or does it only compile?")
// ---------------------------------------------------------------------------

/**
 * esbuild proves a project parses. TypeScript proves the types line up.
 * Neither runs a line of it, so neither has an opinion about `const items =
 * null` followed by `items.map(…)` — which bundles, typechecks, and shows a
 * blank page the moment it is opened. The creator's first look at their own
 * site is a white screen and the run that produced it reported success.
 */

const RENDER_BASE = blankProject("Render Test")

/**
 * A declaration rather than `const withApp = (app) => ({…})`.
 *
 * This file has no semicolons, and an arrow whose body is a parenthesised
 * object literal followed by a bare `{` block parses as neither — TS1005,
 * "'=>' expected", pointing at the block rather than at the line that caused
 * it. A declaration cannot be continued by the next line.
 */
function withApp(app: string) {
  return { ...RENDER_BASE, "src/App.tsx": app }
}

{
  const found = rootComponent(RENDER_BASE)
  check(
    "the component the page mounts is read out of the project, not assumed",
    found?.module === "src/App.tsx" && found?.name === "default",
    JSON.stringify(found),
  )
  check(
    "a project with no entry is 'could not tell', not a guess",
    rootComponent({ "src/Thing.tsx": "export default function Thing() { return null }" }) === null,
  )
}

{
  const clean = await renderCheck(RENDER_BASE)
  check(
    "the shipped starter renders",
    clean.ran === true && clean.ok === true,
    JSON.stringify(clean),
  )
}

{
  /**
   * THE OBJECTION TO SERVER-RENDERING A BROWSER PAGE is that half of it
   * touches `window`. Two things answer it, and both are asserted rather than
   * assumed — a false alarm here would refuse a run that was correct.
   *
   * `renderToStaticMarkup` does not run effects, so the usual home of browser
   * APIs never executes. What is left is module scope and render bodies, and
   * those get a small shim.
   */
  const cases: Array<[string, string]> = [
    [
      "window in a render body",
      `export default function App() {\n  const wide = window.innerWidth > 700\n  return <p>{wide ? "w" : "n"}</p>\n}\n`,
    ],
    [
      "window inside useEffect",
      `import { useEffect, useState } from "react"\nexport default function App() {\n  const [w, setW] = useState(0)\n  useEffect(() => setW(window.innerWidth), [])\n  return <p>{w}</p>\n}\n`,
    ],
    [
      /**
       * This one failed the first implementation. The shim was written beside
       * the imports in the entry file, and ESM hoists imports above anything
       * written next to them — so it ran AFTER every module's top-level code.
       * It is emitted as a banner now: the first bytes of the file.
       */
      "document at module scope",
      `const root = document.documentElement\nexport default function App() { return <p>{root ? "y" : "n"}</p> }\n`,
    ],
    [
      "localStorage in a render body",
      `export default function App() { return <p>{localStorage.getItem("x") ?? "none"}</p> }\n`,
    ],
    [
      "matchMedia in a render body",
      `export default function App() { return <p>{window.matchMedia("(max-width: 600px)").matches ? "s" : "l"}</p> }\n`,
    ],
  ]

  for (const [label, app] of cases) {
    const result = await renderCheck(withApp(app))
    check(
      `a browser API is not a false alarm — ${label}`,
      result.ran === true && result.ok === true,
      JSON.stringify(result),
    )
  }
}

{
  const crash = await renderCheck({
    ...RENDER_BASE,
    "src/components/Hero.tsx": `const items = null\nexport default function Hero() {\n  return <section>{items.map(String)}</section>\n}\n`,
  })
  check(
    "a page that compiles and throws is caught",
    crash.ran === true && crash.ok === false && /reading 'map'/.test(renderFailure(crash)?.message ?? ""),
    JSON.stringify(crash),
  )
  check(
    "and the report names the component rather than React's internals",
    renderFailure(crash)?.where === "Hero",
    renderFailure(crash)?.where ?? "",
  )
  check(
    "the words handed to the model say what to do about it",
    /THE PAGE THREW WHILE RENDERING/.test(formatRenderFailure(crash)) &&
      /Fix this before you finish/.test(formatRenderFailure(crash)),
  )
}

{
  const undefinedComponent = await renderCheck(
    withApp(`import Hero from "./components/Hero"\nconst Missing = undefined\nexport default function App() { return <><Hero /><Missing /></> }\n`),
  )
  check(
    "so is a component that turns out to be undefined",
    undefinedComponent.ran === true && undefinedComponent.ok === false,
    JSON.stringify(undefinedComponent),
  )
}

// ---------------------------------------------------------------------------
section("Rendering a model's code is sandboxed, or it does not happen")
// ---------------------------------------------------------------------------

{
  /**
   * THE ENVIRONMENT IS EMPTY.
   *
   * Everywhere else, generated code runs in the creator's browser or in an
   * opaque-origin iframe. This is the first place it runs on our own machine,
   * and the machine holds a service-role key. The child process is given a
   * bare environment; this asserts it by planting a variable and throwing if
   * the render can see it.
   */
  process.env.STORELIB_SANDBOX_PROBE = "leaked"
  const probe = await renderCheck(
    withApp(
      `export default function App() {\n  if (process.env.STORELIB_SANDBOX_PROBE) throw new Error("the environment leaked in")\n  return <p>sealed</p>\n}\n`,
    ),
  )
  delete process.env.STORELIB_SANDBOX_PROBE
  check(
    "not one of this process's environment variables is visible to it",
    probe.ran === true && probe.ok === true,
    JSON.stringify(probe),
  )
}

{
  /**
   * AND IT CANNOT READ THE DISK. The bundler already refuses a project that
   * imports `node:fs`, so this is defence behind a door that is already shut —
   * which is the point of asserting it, because the day something gets past
   * the first door this is what is left.
   */
  const nosy = await renderCheck(
    withApp(
      `export default function App() {\n  const fs = require("node:fs")\n  return <p>{fs.readFileSync("/etc/hostname", "utf8")}</p>\n}\n`,
    ),
  )
  check(
    "reaching for the filesystem is refused by the runtime, not by luck",
    nosy.ran === true && nosy.ok === false && /permission|restricted|not allowed/i.test(renderFailure(nosy)?.message ?? ""),
    JSON.stringify(nosy),
  )
}

{
  /**
   * THE SANDBOX IS NAMED BY THE RUNTIME, NOT BY US.
   *
   * The permission model is `--experimental-permission` on Node 20 and
   * `--permission` from 22. Guessing wrong makes the child exit before it
   * prints anything, which reads as "could not check" — so the feature would
   * be quietly dead on half the runtimes it might be deployed to. The checks
   * above prove it is alive on THIS Node; this one proves it was alive because
   * a flag was found rather than because a guess happened to match.
   */
  const flag = await permissionFlag()
  check(
    "a working permission flag was found for this Node",
    flag === "--permission" || flag === "--experimental-permission",
    String(flag),
  )
}

{
  /**
   * `while (true) {}` is a thing a model writes. Without a timeout it is a run
   * that never ends and a request that never answers.
   */
  const started = Date.now()
  const stuck = await renderCheck(withApp(`export default function App() { while (true) {} }\n`))
  const elapsed = Date.now() - started
  check(
    "a page stuck in a loop is stopped rather than waited for",
    stuck.ran === true && stuck.ok === false && /stuck in a loop/.test(renderFailure(stuck)?.message ?? ""),
    JSON.stringify(stuck),
  )
  check("and it is stopped in seconds, not minutes", elapsed < 20_000, `${elapsed}ms`)
}

// ---------------------------------------------------------------------------
section("A run may not finish on a page that does not render")
// ---------------------------------------------------------------------------

{
  /**
   * End to end, through the real loop: the model writes something that
   * compiles and throws, builds, and goes quiet. The build gate has to see it.
   */
  const CRASHES = `const items = null

export default function App() {
  return <main>{items.map(String)}</main>
}
`
  const workspace = new ProjectWorkspace(blankProject("Gate"))
  const provider = {
    id: "scripted",
    calls: 0,
    async complete() {
      this.calls++
      if (this.calls === 1) {
        return {
          text: "",
          toolCalls: [
            { id: "w", name: "write_file", argumentsJson: JSON.stringify({ path: "src/App.tsx", content: CRASHES }) },
            { id: "b", name: "run_build", argumentsJson: "{}" },
          ],
          raw: [],
          usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
          stop: "tool_calls" as const,
        }
      }
      return {
        text: "Rebuilt the page.",
        toolCalls: [],
        raw: [],
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
        stop: "done" as const,
      }
    },
  }

  const loop = agentLoop({
    provider: provider as never,
    model: "test-model",
    prompt: "rebuild the page",
    workspace,
    esbuild,
    maxTurns: 6,
    render: async (files) => {
      const result = await renderCheck(files)
      if (!result.ran) return null
      return { ok: result.ok, report: formatRenderFailure(result) }
    },
  })
  const { result } = await drain(loop)

  check(
    "the build is red on a page that throws, even though it compiles",
    workspace.buildOk === false,
    `buildOk=${workspace.buildOk}`,
  )
  check(
    "so the run does not succeed",
    result.status === "failed",
    `status=${result.status} error=${result.error}`,
  )
  check(
    "and nothing is saved over the working site",
    /nothing was changed/.test(result.error ?? ""),
    `error=${result.error}`,
  )
  check(
    "and the creator is told it rendered badly, not that it did not compile",
    /threw when it was rendered/.test(result.error ?? "") && !/did not compile/.test(result.error ?? ""),
    `error=${result.error}`,
  )
}



// ---------------------------------------------------------------------------
section("The agent edits the same state the visual editor does")
// ---------------------------------------------------------------------------

/**
 * A model asked to make a hero black CAN edit src/sections/Hero.tsx, and the
 * result looks right and is wrong: the colour becomes a literal in a component
 * instead of a prop, so the creator's colour picker shows the old value, they
 * change it back, and nothing happens. The site and its controls have come
 * apart and nobody can see where.
 *
 * Going through a prop keeps one state — the picker reads what the agent
 * wrote, because there is only one thing to read.
 */

function docFixture(): SiteDocument {
  const base = emptyDocument()
  return {
    ...base,
    pages: [
      {
        id: "home",
        path: "/",
        name: "Home",
        sections: [
          { id: "n1", type: "navbar", props: { brand: "Fade & Blade" } },
          { id: "h1", type: "hero", props: { heading: "Sharper than your last cut." } },
          { id: "ft1", type: "footer", props: { brand: "Fade & Blade" } },
        ],
      },
    ],
  }
}

{
  const withDoc = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  const withoutDoc = new ProjectWorkspace(blankProject("Plain"))

  check("a site with a layout gets the structured tools", withDoc.hasDocument === true)
  check(
    "and they come first, where a model actually reaches",
    toolsFor(true)[0].name === "get_layout",
    toolsFor(true)[0].name,
  )
  check(
    "a plain code project never sees them",
    withoutDoc.hasDocument === false &&
      !toolsFor(false).some((tool) => tool.name === "update_section"),
  )
}

{
  const workspace = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  const before = workspace.files["src/App.tsx"]

  const output = await workspace.execute(
    "update_section",
    JSON.stringify({ id: "h1", props: { background: "#000000", heading: "Sharper." } }),
    esbuild,
  )

  check("a prop edit is accepted", /Updated h1/.test(output), output)
  check(
    "the document carries it",
    workspace.document?.pages[0].sections[1].props.background === "#000000",
    JSON.stringify(workspace.document?.pages[0].sections[1].props),
  )
  check(
    "the generated code follows in the same call",
    workspace.files["src/App.tsx"].includes('background="#000000"') && before !== workspace.files["src/App.tsx"],
  )
  check(
    "and the file is marked changed, so the run saves it",
    workspace.changed.has("src/App.tsx"),
    [...workspace.changed].join(", "),
  )
  /**
   * The verdict has to describe what will be SAVED. Re-rendering without
   * invalidating the build would gate on the project as it was before the
   * edit — green on code nobody is going to ship.
   *
   * BUILT FIRST, then edited. The first version asserted null on a workspace
   * that had never built, where null is the starting value — so it passed with
   * the invalidation deleted.
   */
  const built = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  await built.execute("run_build", "{}", esbuild)
  const green = built.buildOk
  await built.execute("update_section", JSON.stringify({ id: "h1", props: { heading: "Later" } }), esbuild)
  check(
    "and a structured edit sends the build verdict back to unknown",
    green === true && built.buildOk === null,
    `green=${green} after=${built.buildOk}`,
  )
}

{
  const workspace = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  const output = await workspace.execute(
    "update_section",
    JSON.stringify({ id: "h1", props: { backgroundColor: "#000" } }),
    esbuild,
  )
  check(
    "an unknown prop is refused in words the model can act on",
    /no prop called "backgroundColor"/.test(output) && /did you mean "background"/.test(output),
    output,
  )
  check(
    "and nothing changed",
    workspace.document?.pages[0].sections[1].props.backgroundColor === undefined &&
      workspace.changed.size === 0,
  )
}

{
  const workspace = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  const layout = await workspace.execute("get_layout", "{}", esbuild)
  check(
    "the layout reads as pages, sections and props",
    /h1 \(hero\)/.test(layout) && /THEME/.test(layout) && /SECTION TYPES AVAILABLE/.test(layout),
    layout.slice(0, 120),
  )
}

{
  /**
   * The whole point of the structured layer is that its output is a real
   * project. A theme write touches every section at once — which is what makes
   * "make the whole site feel more premium" one coherent change rather than a
   * drift across a dozen files — and the result still has to build.
   */
  const workspace = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  await workspace.execute("update_theme", JSON.stringify({ primary: "#c8a24a", radius: 2 }), esbuild)
  await workspace.execute(
    "add_section",
    JSON.stringify({ page: "/", type: "cta", id: "c1", index: 2, props: { heading: "Chairs go quickly" } }),
    esbuild,
  )
  const verdict = await workspace.execute("run_build", "{}", esbuild)

  check("a themed, restructured site still compiles", !/Build FAILED/.test(verdict), verdict.slice(0, 200))
  check(
    "the theme reached the stylesheet",
    workspace.files["src/styles.css"].includes("--primary: #c8a24a"),
  )
  check(
    "and the new section reached the page",
    workspace.files["src/App.tsx"].includes("<Cta") &&
      workspace.document?.pages[0].sections[2].id === "c1",
  )
}

{
  const workspace = new ProjectWorkspace(renderDocument(docFixture()), docFixture())
  /**
   * The escape hatch. A request the section library cannot express is written
   * as a file, and it must survive every later render — otherwise one unusual
   * ask costs a creator the editable parts of their site.
   */
  await workspace.execute(
    "create_file",
    JSON.stringify({ path: "src/custom/RoiCalculator.tsx", content: "export default function RoiCalculator() {\n  return <div />\n}\n" }),
    esbuild,
  )
  await workspace.execute("update_section", JSON.stringify({ id: "h1", props: { heading: "New" } }), esbuild)

  check(
    "custom code survives a re-render",
    workspace.files["src/custom/RoiCalculator.tsx"]?.includes("RoiCalculator") === true,
  )
}

// ===========================================================================
//  ASKING, DRIVEN — the loop actually stops and actually carries on
// ===========================================================================
/**
 * The sequencing here is the whole feature and it is exactly what reading the
 * source cannot check: does the question reach the screen BEFORE the wait,
 * does an answer really come back as a tool result the model can act on, and
 * does the run carry on afterwards rather than ending on the question.
 */
{
  const seen: string[] = []
  const { result, events, workspace } = await run(
    [
      {
        calls: [
          [
            "ask_creator",
            {
              question: "What is the shop called?",
              why: "It goes in the header",
              suggestions: ["Not decided"],
              placeholder: "e.g. Ferro",
            },
          ],
        ],
      },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Built it." },
    ],
    blankProject("Test Site"),
    undefined,
    {
      ask: async (question) => {
        seen.push(question.question)
        return { kind: "answered", answer: "Ferro Barbers" }
      },
    },
  )

  check("the run succeeds after waiting", result.status === "succeeded", result.error ?? "")
  check("the asker was actually called", seen.join() === "What is the shop called?")

  const questionAt = events.findIndex((e) => e.type === "question")
  const answeredAt = events.findIndex((e) => e.type === "answered")
  check("the question is emitted", questionAt >= 0)
  check(
    "and the answer event comes after it, never before",
    answeredAt > questionAt,
    `question ${questionAt}, answered ${answeredAt}`,
  )
  check(
    "the run says it is waiting while it waits",
    events.some((e) => e.type === "state" && e.state === "asking"),
  )
  check(
    "and goes back to executing afterwards",
    (() => {
      const asking = events.findIndex((e) => e.type === "state" && e.state === "asking")
      const after = events.findIndex(
        (e, i) => i > asking && e.type === "state" && e.state === "executing",
      )
      return asking >= 0 && after > asking
    })(),
  )
  check(
    "the answer reaches the model as the tool's result",
    (() => {
      // The turn AFTER the ask must carry the answer back, or the model is
      // being asked to act on something it was never told.
      const sent = JSON.stringify(workspace.questions)
      return sent.includes("Ferro Barbers")
    })(),
  )
  check(
    "and the question is recorded with how it ended",
    workspace.questions.length === 1 &&
      workspace.questions[0].outcome === "answered" &&
      workspace.questions[0].answer === "Ferro Barbers",
  )
}

{
  /**
   * THE PROPERTY THE WHOLE FEATURE RESTS ON: the question is on screen BEFORE
   * anything waits for it.
   *
   * Get this backwards and the run blocks on a question nobody has been shown,
   * which looks exactly like a hang and ends in a timeout every time. It is
   * also invisible to the tests above — they check that the `answered` event
   * follows the `question` event, and that stays true when both are emitted
   * after the wait.
   *
   * So the loop is driven by hand and the asker looks at what has actually
   * been yielded at the moment it is called.
   */
  const events: AgentEvent[] = []
  let sawQuestionBeforeWaiting: boolean | null = null

  const workspace = new ProjectWorkspace(blankProject("Test Site"))
  const loop = agentLoop({
    provider: scriptedProvider([
      { calls: [["ask_creator", { question: "Which town?", why: "w", suggestions: [], placeholder: "" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Done." },
    ]),
    model: "test-model",
    prompt: "build me a site",
    workspace,
    esbuild,
    ask: async () => {
      sawQuestionBeforeWaiting = events.some((e) => e.type === "question")
      return { kind: "answered", answer: "Cluj" }
    },
  })

  for (;;) {
    const step = await loop.next()
    if (step.done) break
    events.push(step.value as AgentEvent)
  }

  check(
    "the question is on screen before anything waits for it",
    sawQuestionBeforeWaiting === true,
    `saw: ${sawQuestionBeforeWaiting}`,
  )
}

{
  /**
   * A skip is a decision and has to move the run on exactly as an answer does.
   * The failure this guards is a run that treats "skipped" as "not answered
   * yet" and waits again, or ends.
   */
  const { result, workspace } = await run(
    [
      { calls: [["ask_creator", { question: "Which town?", why: "w", suggestions: [], placeholder: "" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Done." },
    ],
    blankProject("Test Site"),
    undefined,
    { ask: async () => ({ kind: "skipped" }) },
  )
  check("a skip carries the run on", result.status === "succeeded", result.error ?? "")
  check("and is recorded as a skip, not as an empty answer", workspace.questions[0].outcome === "skipped")
}

{
  /**
   * NOBODY THERE. The tab was closed, or the deadline passed. The run must
   * finish the site anyway — a build thrown away because a question went
   * unanswered is the worst outcome available.
   */
  const { result } = await run(
    [
      { calls: [["ask_creator", { question: "Which town?", why: "w", suggestions: [], placeholder: "" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Done." },
    ],
    blankProject("Test Site"),
    undefined,
    { ask: async () => ({ kind: "timeout" }) },
  )
  check("silence does not lose the work", result.status === "succeeded", result.error ?? "")
}

{
  /**
   * A caller with no way to ask anybody — the preview worker. The model must
   * be told rather than the run hanging on a promise nothing will settle.
   */
  const { result } = await run(
    [
      { calls: [["ask_creator", { question: "Which town?", why: "w", suggestions: [], placeholder: "" }]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Done." },
    ],
    blankProject("Test Site"),
  )
  check("no asker means told, not hung", result.status === "succeeded", result.error ?? "")
}

{
  /**
   * The cap, driven. Asking four times must not stop four times — the fourth
   * gets a refusal it can act on, and the run continues.
   */
  let asked = 0
  const ask = async () => {
    asked += 1
    return { kind: "skipped" } as const
  }
  const question = { question: "Which town?", why: "w", suggestions: [], placeholder: "" }
  const { result } = await run(
    [
      { calls: [["ask_creator", question]] },
      { calls: [["ask_creator", question]] },
      { calls: [["ask_creator", question]] },
      { calls: [["ask_creator", question]] },
      { calls: [["write_file", { path: "src/App.tsx", content: GOOD_APP }]] },
      { calls: [["run_build", {}]] },
      { text: "Done." },
    ],
    blankProject("Test Site"),
    undefined,
    { ask },
  )
  check("a run cannot be turned into an interview", asked === MAX_ASKS_PER_RUN, `asked ${asked}`)
  check("and the run still finishes", result.status === "succeeded", result.error ?? "")
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
