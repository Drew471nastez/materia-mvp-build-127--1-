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
import { ProjectWorkspace } from "@/lib/sites/agent/tools"
import { blankProject } from "@/lib/sites/starter"
import type { LoopResult } from "@/lib/sites/agent/loop"
import type {
  AgentEvent,
  AgentProvider,
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

async function run(script: Scripted[], files = blankProject("Test Site"), maxTurns?: number) {
  const workspace = new ProjectWorkspace(files)
  const provider = scriptedProvider(script)
  const loop = agentLoop({ provider, model: "test-model", prompt: "do the thing", workspace, esbuild, maxTurns })
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
  check("and says how", /more than 4 steps/.test(result.error ?? ""), `error=${result.error}`)
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
  check("and the reason survives", result.error === "upstream 503")
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
      "list_files,read_file,write_file,create_file,delete_file,update_manifest,run_build,read_build_errors",
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
  // The history has to accumulate, or the model re-reads the same file forever.
  const { provider } = await run([
    { calls: [["list_files", {}]] },
    { calls: [["read_file", { path: "src/App.tsx" }]] },
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
