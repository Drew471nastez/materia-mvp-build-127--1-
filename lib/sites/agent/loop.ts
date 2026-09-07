/**
 * The agent loop, with no database in it.
 *
 * Split out of run.ts so it can be RUN in a test rather than pattern-matched.
 * Everything that decides whether an edit is correct lives here — the turn
 * cap, the build gate, what counts as a refusal, which errors are fatal — and
 * all of it used to be interleaved with Supabase calls, which meant the only
 * way to check any of it was to read the file and believe it.
 *
 * With the persistence one level up, tests/sites.test.ts drives this with a
 * scripted provider and a real esbuild: the model writes a file that does not
 * compile, sees the error it will actually see, fixes it, and the loop reports
 * what it will actually report.
 *
 * Deliberately not `server-only`: it touches no key, no client and no request.
 * The provider it is handed is what talks to a network, and in a test that is
 * an object literal.
 */

import type { ProjectWorkspace } from "./tools"
import { TOOL_SPECS } from "./tools"
import {
  ZERO_USAGE,
  addUsage,
  type AgentEvent,
  type AgentProvider,
  type AgentTurn,
  type TokenUsage,
} from "./types"

/**
 * The model gets this many round trips.
 *
 * Twelve is enough for read-a-few-files, edit, build, fix, build. A model
 * still going at thirteen is looping, and every extra turn resends the whole
 * history — the cost of not stopping grows as it goes.
 */
export const MAX_TURNS = 12

export const SYSTEM_PROMPT = `You edit a small React website that is a real Vite project. The files ARE the site — there is no other representation of it.

Rules:
- Call list_files first. Never guess a path.
- read_file before you rewrite a file. write_file replaces the WHOLE file — send complete contents, never a fragment or a diff.
- You may import ONLY react, react-dom and react-dom/client. No other package is available and none can be installed. Write what you need by hand.
- Styling is plain CSS in src/styles.css, which defines design tokens at the top (--bg, --text, --primary, --radius, …). Change a token to restyle the whole site; add rules for anything new. There is no Tailwind and no CSS framework.
- After you finish editing, call run_build. If it reports errors, fix them and build again. Do not finish on a failing build.
- When you are done, reply with one or two plain sentences saying what you changed. No preamble, no markdown headings, no code in the reply.`

export interface LoopResult {
  status: "succeeded" | "failed" | "refused"
  /** What to show the creator. Prose, never a stack trace. */
  message: string
  /** Developer detail, recorded on the run. Null on success. */
  error: string | null
  usage: TokenUsage
  turns: number
}

export interface LoopInput {
  provider: AgentProvider
  model: string
  prompt: string
  workspace: ProjectWorkspace
  /** esbuild for `run_build` — browser wasm or the Node build, either works. */
  esbuild: unknown
  signal?: AbortSignal
  maxTurns?: number
}

export async function* agentLoop(input: LoopInput): AsyncGenerator<AgentEvent, LoopResult> {
  const { provider, model, prompt, workspace, esbuild, signal } = input
  const maxTurns = input.maxTurns ?? MAX_TURNS

  const turns: AgentTurn[] = [{ role: "user", content: prompt }]
  let usage: TokenUsage = ZERO_USAGE
  let turnCount = 0
  let message = ""
  let status: LoopResult["status"] = "failed"
  let error: string | null = "The edit did not finish."

  try {
    for (let attempt = 1; attempt <= maxTurns; attempt++) {
      /**
       * Assigned INSIDE the body, not by the for-header.
       *
       * `for (turnCount = 1; turnCount <= max; turnCount++)` leaves turnCount
       * at max+1 when the loop runs to exhaustion, so a run capped at 12
       * recorded 13 turns — a number that is wrong in the one row anybody
       * would look at to find out why a run cost what it did.
       */
      turnCount = attempt
      const turn = await provider.complete({
        model,
        system: SYSTEM_PROMPT,
        /**
         * A COPY. The loop keeps appending to `turns`, and handing over the
         * live array means the provider's view of the conversation changes
         * under it — fine for one that serialises synchronously, wrong for
         * one that retries, logs, or defers. The array is a few dozen small
         * objects and the strings are shared, so the copy costs nothing.
         */
        turns: [...turns],
        tools: TOOL_SPECS,
        maxOutputTokens: 32_000,
        signal,
      })

      // Accumulated FIRST. A turn that then throws still cost money, and the
      // record has to say so.
      usage = addUsage(usage, turn.usage)

      if (turn.stop === "refusal") {
        status = "refused"
        message = turn.text || "I can't help with that."
        error = null
        break
      }

      turns.push({
        role: "assistant",
        content: turn.text,
        toolCalls: turn.toolCalls,
        raw: turn.raw,
      })

      if (turn.toolCalls.length === 0) {
        /**
         * A turn with no tool calls is the model saying it is done — which it
         * can do at any point, including before it has changed anything. That
         * is a finished run with nothing in it, not a failure.
         */
        message = turn.text.trim()
        status = "succeeded"
        error = null
        break
      }

      if (turn.text.trim()) yield { type: "thinking", text: turn.text.trim() }

      const results = []
      for (const call of turn.toolCalls) {
        const output = await workspace.execute(call.name, call.argumentsJson, esbuild)
        results.push({ id: call.id, output })
        yield { type: "tool", name: call.name, detail: describeCall(call.argumentsJson) }
      }
      turns.push({ role: "tool", results })

      if (attempt === maxTurns) {
        status = "failed"
        error = `The edit took more than ${maxTurns} steps and was stopped.`
      }
    }

    /**
     * NOTHING IS SAVED ON A RED BUILD.
     *
     * The prompt tells the model not to finish on a failing build. This is
     * what happens when it does anyway: saving a project that does not compile
     * replaces a working site with an error overlay, and the creator's next
     * look at their own page is the failure.
     *
     * Checked after the loop rather than inside it, because the model is
     * allowed to leave the tree broken mid-run — it is the FINAL state that
     * has to compile.
     */
    if (status === "succeeded") {
      const build = workspace.buildResult
      if (build && !build.ok) {
        status = "failed"
        error = "The edit did not compile, so nothing was changed."
      } else if (!build && workspace.changed.size > 0) {
        /**
         * Files changed and the model never built. Believing it here is how a
         * broken site gets saved by a model that simply forgot the last step,
         * so the loop builds for itself rather than trusting the omission.
         */
        yield { type: "tool", name: "run_build", detail: "" }
        const verdict = await workspace.execute("run_build", "{}", esbuild)
        if (verdict.startsWith("Build FAILED")) {
          status = "failed"
          error = "The edit did not compile, so nothing was changed."
        }
      }
    }
  } catch (thrown) {
    // An abort is the user leaving, not a fault. Everything else is.
    status = "failed"
    error =
      thrown instanceof Error && thrown.name === "AbortError"
        ? "Cancelled."
        : thrown instanceof Error
          ? thrown.message
          : "The edit failed."
  }

  return { status, message, error, usage, turns: turnCount }
}

/** A one-line description of a call, for the UI. Never the file contents. */
export function describeCall(argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || "{}")
    if (typeof args.path === "string") return args.path
  } catch {
    /* a malformed call is still worth showing by name */
  }
  return ""
}
