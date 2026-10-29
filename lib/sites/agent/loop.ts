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
import type { ToolCall } from "./types"
import { looksLikeQuestion, openSteps, refuseToFinish, type SiteScope } from "./plan"
/**
 * THE SAME TASTE AS THE THEME EDITOR, AND NOTHING ELSE FROM IT.
 *
 * This agent writes React against a Vite project: it has no schema, no colour
 * scheme and no Storelib compiler, so the section contract would be rules
 * about a format it cannot produce. What it shares is the part that is about
 * design rather than about format. See lib/storelib-ai.
 */
import { sitesAgentRules } from "@/lib/storelib-ai"
import { plainRunError } from "./plain-errors"
import { type CallInfo, compactTurns, compactionNote } from "./compaction"
import type { Budget } from "./complexity"
import type { ProjectFiles } from "../types"
import type { SiteDocument } from "../document/schema"
import {
  type AgentQuestion,
  type AnswerOutcome,
  answerNote,
  MAX_ASKS_PER_RUN,
  parseQuestion,
  tooManyAsksNote,
} from "./questions"
import { toolsFor } from "./tools"
import {
  ZERO_USAGE,
  addUsage,
  type AgentEvent,
  type AgentProvider,
  type AgentTurn,
  type TokenUsage,
} from "./types"
import { merged } from "@/lib/net/deadline"

/**
 * The model gets this many round trips when no budget says otherwise.
 *
 * This was twelve, on the reasoning that twelve is enough for
 * read-a-few-files, edit, build, fix, build — and it is, for that. It is
 * nowhere near enough for building a website, which is what a first prompt
 * actually asks for, and a run that hit it stopped with "reached its limit of
 * 12 steps" halfway through a site.
 *
 * THE TURN COUNT IS NOT THE BOUND ON COST, and treating it as one is what kept
 * it low. A turn on a large project sends far more than a turn on a small one,
 * so the honest ceiling is tokens — which is enforced separately and is what
 * actually stops a runaway. The turn count only needs to be high enough that
 * no real run reaches it and low enough that a model stuck in a loop is not
 * left there indefinitely.
 *
 * The tiers in ./complexity are what actually shape a run; this is the
 * fallback for a caller that has no budget, such as a test.
 */
export const MAX_TURNS = 30

/**
 * Tokens for a run with no budget attached — a test, or a caller that predates
 * the tiers. Generous, because its job is to stop a runaway rather than to
 * shape a run: the tiers in ./complexity are what actually decide.
 */
export const MAX_TOKENS = 400_000

/**
 * The point at which the model is told it is running out.
 *
 * Warned rather than cut off, and warned once. A model that knows it has
 * little room left finishes the important step and builds; a model cut off
 * without warning leaves the project mid-edit, which is the state that costs
 * a creator their work.
 */
const BUDGET_WARNING_FRACTION = 0.75
/** Time left when the run is told to finish up, as it is near its token budget. */
const TIME_WARNING_MS = 45_000

export const SYSTEM_PROMPT = `You edit a small React website that is a real Vite project. The files ARE the site — there is no other representation of it.

Rules:
- Call list_files first. Never guess a path.
- read_file before you rewrite a file. write_file replaces the WHOLE file — send complete contents, never a fragment or a diff.
- IMAGES AND MEDIA are referenced by URL. Never inline a picture, a video or a font as a base64 data: URI — a file has a size limit and an inlined image blows through it, which used to discard a whole edit at the last step. If the creator has not given you a URL, use a real one from a stock source or leave a clearly-marked placeholder and say so in your reply.
- You may import ONLY react, react-dom and react-dom/client. No other package is available and none can be installed. Write what you need by hand.
- Styling is plain CSS in src/styles.css, which defines design tokens at the top (--bg, --text, --primary, --radius, …). Change a token to restyle the whole site; add rules for anything new. There is no Tailwind and no CSS framework.
- THE PAGE MUST REACH ALL FOUR EDGES. No white line or empty band above the header or below the footer. A section that has a background must have padding of its own rather than relying on its children's margins — a first child's top margin escapes its parent and leaves a strip of the page background showing, which is the single most common way a generated site looks broken. Keep "margin: 0" on body, give the page a background, and never put a top margin on the outermost element.
- After you finish editing, call run_build. If it reports errors, fix them and build again. Do not finish on a failing build.
- Use search_code to find where something lives instead of reading files one by one. Prefer replace_in_file over write_file for a small change — write_file replaces the whole file, and every full rewrite is a chance to drop something that was already right.
- A SUCCESSFUL TOOL CALL IS NOT A COMPLETED TASK. Before you stop, compare the project as it now stands against what was actually asked for. If the request was broad, one edited component is not an answer to it.
- Do not ask the creator for anything you could find out by reading the project. Look first.
- ASK ABOUT THE BUSINESS, NEVER ABOUT THE CODE. ask_creator asks ONE question and STOPS THE RUN until they answer or skip. Use it when a detail would genuinely change what you build and you cannot work it out — the name, the town, what they charge, when they are open, who it is for.
- ASK AT THE MOMENT YOU NEED TO KNOW, not all at the start. You are about to write the header: that is when to ask what the place is called. Each answer should make the next question sharper — once you know it is a barber shop in Cluj, ask whether they take walk-ins, not "what industry are you in".
- MAKE EACH QUESTION EARN ITS STOP. At most three in a run, and fewer is better. A question whose answer you could have inferred, or that changes one word nobody reads, is worse than a guess: it costs somebody their attention and the run its time. Never ask something you have already been told.
- WRITE THEM LIKE A PERSON. One short sentence, specific to this business, with a line saying what it changes. Offer a few tappable answers where real guesses exist — price ranges, days of the week, styles — and none where they do not, such as a name. They can always skip, and a skip means decide it yourself and do not ask again in another form.
- When you are done, reply with one or two plain sentences saying what you changed. No preamble, no markdown (no ** bold, no # headings, no numbered lists), no code in the reply.

BUILDING A SITE FROM NOTHING
When the site is empty, you are not writing a landing page. You are building a
website, and a website has several pages that link to each other.

- Four pages is the floor, not the target. For most businesses that is a home
  page, a page for what they offer, a page about them, and a way to get in
  touch. Add more when the business has more: a menu, a portfolio, locations,
  a booking page.
- Every page carries the SAME navigation and the SAME footer, and the nav links
  to every page. A page nothing links to does not exist.
- Fill the pages. A page holding a heading and one paragraph is a placeholder,
  not a page. Real headings, real body copy, real prices, real hours, real
  names — written for THIS business, never "Lorem ipsum" and never "Your
  headline here".
- Use the section types the site already has rather than writing components by
  hand. There is a section for prices, for opening hours, for a gallery, for a
  team, for questions and answers, for a contact form. Ask for the layout
  first and read what is available.
- Write the copy as somebody who knows the trade. A barber shop has skin
  fades, beard trims and hot-towel shaves at real prices, not "Service One" at
  "$00".

${sitesAgentRules()}`

/**
 * THE RULES THAT MAKE AN EXISTING PROJECT A PROJECT, RATHER THAN A PROMPT.
 *
 * Added only when the site already has files. A brand-new site has nothing to
 * preserve, and telling a model to match a design language that does not exist
 * yet produces a timid first generation.
 *
 * These are written as prohibitions with reasons attached, because "be
 * consistent" is agreeable and unactionable — a model will accept it and then
 * still reach for a font it likes. Naming the specific failure ("do not
 * introduce a second way of doing something the project already does") is what
 * changes the output.
 */
const PRESERVATION_RULES = `
YOU ARE CONTINUING AN EXISTING PROJECT.

This site already exists and someone has already made decisions about it. You
are the developer who has been working on it since the first day, not a new one
seeing it for the first time. The project is the source of truth; the request
is a change to it.

PRESERVE EVERYTHING THAT WAS NOT ASKED ABOUT. Before you change anything,
read enough to know what is already there — what the site is, how it is built,
what its components are and how they are styled. Then make the SMALLEST change
that satisfies the request.

Never do any of these unless the request actually requires it:
- change fonts, colours, spacing, radii or any other token
- restyle or rewrite a component that works
- reorganise files, rename things, or "clean up" code you happened to read
- remove functionality, change page structure, or alter responsive behaviour
- replace a working approach with one you would have chosen

Reuse before you invent. If the project has a button style, a card, a
container width, a section rhythm — use it. New content must be
indistinguishable in style from what is already there. Introducing a second way
of doing something the project already does is the specific failure to avoid:
it is how a site ends up with two button styles and three spacing scales.

If you believe something existing is wrong, say so in your reply. Do not
silently fix it.
`

export interface ProjectContext {
  /** Nothing durable has been recorded about this project yet. */
  thin?: boolean
  /** Stated intent that cannot be read out of the code. */
  manifest: string
  /** Facts derived from the files themselves, fresh this run. */
  facts: string
  /** How much of the project this request is permission to touch. */
  intent: string
}

/**
 * The system prompt for one run.
 *
 * The base rules are constant; everything after them is this project, this
 * request. An empty project gets the base prompt unchanged — see
 * PRESERVATION_RULES for why a first generation should not be told to preserve
 * anything.
 */
export function buildSystemPrompt(context: ProjectContext | null): string {
  if (!context || !context.facts) return SYSTEM_PROMPT

  const sections = [SYSTEM_PROMPT, PRESERVATION_RULES]

  if (context.manifest) {
    sections.push(`WHAT THIS PROJECT IS\n${context.manifest}`)
  }

  sections.push(`WHAT IS ALREADY BUILT\n${context.facts}`)
  sections.push(`THIS REQUEST\n${context.intent}`)

  /**
   * Recording durable facts is opt-in and explicitly narrow. An agent invited
   * to "keep notes" writes a paragraph after every run, and a decision list
   * full of "changed the button colour" is noise that crowds out the entries
   * that matter.
   */
  /**
   * WHICH SOURCE WINS WHEN THEY DISAGREE.
   *
   * The recorded understanding is a summary, and a summary drifts: somebody
   * changes a palette by hand, or an earlier run described the site before it
   * became something else. A model that trusts the note over the file will
   * "match the existing style" against a style that is no longer there.
   *
   * Stated as an order rather than a warning, because "be careful" is not
   * something a model can act on and a ranking is.
   */
  sections.push(
    `WHEN SOURCES DISAGREE, in this order:\n` +
      `  1. What the creator just asked for.\n` +
      `  2. The code as it is now — this is the site, and it is always right about itself.\n` +
      `  3. The recorded understanding above.\n` +
      `  4. Anything else you infer.\n` +
      `If the record contradicts the files, the files win and you say so in your reply.`,
  )

  if (context.thin) {
    /**
     * Asked only when there is nothing recorded, and only on a run that is
     * already reading the project — so establishing what the site IS costs no
     * extra call and no extra turn. Asking every run would spend a tool call
     * restating what is already written down.
     */
    sections.push(
      `NOTHING DURABLE IS RECORDED ABOUT THIS PROJECT YET.\nYou are reading its code regardless. Before you finish, call update_manifest ONCE with what the project plainly is — the business, who it is for, what kind of site it is, and the design direction in a few words. State only what the project actually shows you; leave a field out rather than guessing at it.`,
    )
  }

  sections.push(
    `PROJECT MEMORY\nIf this conversation established something durable about the project — what the business is, who it is for, the design direction, what the site is FOR, how it should sound, or a decision the creator should never have to repeat — call update_manifest once with just that. Do not call it for ordinary edits; "made the hero bigger" is not a project decision.`,
  )

  return sections.join("\n\n")
}

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
  /**
   * What this project is and how much of it this request may touch. Null for a
   * brand-new site, which has nothing to preserve yet.
   */
  context?: ProjectContext | null
  /** esbuild for `run_build` — browser wasm or the Node build, either works. */
  esbuild: unknown
  /** Injected so the browser preview, which has no compiler, simply skips it. */
  typecheck?: (files: ProjectFiles) => Promise<{ ok: boolean; report: string } | null>
  /**
   * Renders the project once to catch what compiling cannot: a page that
   * builds and then throws. Injected for the same reason — it needs a Node
   * process it can sandbox, which the preview worker does not have.
   */
  render?: (files: ProjectFiles) => Promise<{ ok: boolean; report: string } | null>
  /**
   * PUTS A QUESTION IN FRONT OF THE CREATOR AND WAITS FOR THE ANSWER.
   *
   * Injected for the same reason the others are: waiting needs a row in a
   * table that a different request can write to, and the loop has no database.
   * A test injects an instant answerer; a caller with no way to ask leaves it
   * out and the model is told nobody is there.
   */
  ask?: (question: AgentQuestion) => Promise<AnswerOutcome>
  signal?: AbortSignal
  /**
   * When no new turn may start (ms since the epoch), and the turn in flight
   * is given up on at `hardDeadlineAt`. The route lives 300 seconds and the
   * files are saved only after the loop, so a loop held only by turns and
   * tokens was killed by the platform with nothing saved, and its run row
   * stayed "running", which refused every edit to that site for the fifteen
   * minutes site_active_run waits. Out of time is out of room, like the
   * token budget: what builds is kept and the rest is said.
   */
  deadlineAt?: number
  hardDeadlineAt?: number
  maxTurns?: number
  /** Tokens, input plus output, for the whole run. A ceiling, not a target. */
  maxTokens?: number
  /**
   * Bytes of conversation before older tool output starts being replaced with
   * a note. Overridable so a test can reach compaction without a 120KB
   * fixture — production uses the default in ./compaction.
   */
  compactBytes?: number
  /** How much room this request gets, and what is expected in it. */
  budget?: Budget
  /** Groups this project's requests for the provider's prompt cache. */
  cacheKey?: string
}

export async function* agentLoop(input: LoopInput): AsyncGenerator<AgentEvent, LoopResult> {
  const { provider, model, prompt, workspace, esbuild, signal, context, typecheck, render } = input
  const maxTurns = input.maxTurns ?? input.budget?.maxTurns ?? MAX_TURNS
  const maxTokens = input.maxTokens ?? input.budget?.maxTokens ?? MAX_TOKENS

  /**
   * WHAT THE SITE LOOKED LIKE BEFORE THIS RUN TOUCHED IT.
   *
   * Taken here and never recomputed, because "was this a first generation" is
   * a fact about the run's starting point. Reading it later would answer a
   * different question: once the model has added a page, the site is no longer
   * empty and the floor would switch itself off exactly when it started
   * applying.
   *
   * A site with no document — a code project — has no countable pages, so it
   * gets no scope and the floor simply does not apply. Guessing a page count
   * from filenames would refuse runs on projects this knows nothing about.
   */
  const startedEmpty = isEmptySite(workspace.document)

  let turns: AgentTurn[] = [{ role: "user", content: prompt }]
  let usage: TokenUsage = ZERO_USAGE
  let turnCount = 0
  let refusals = 0
  let message = ""
  let status: LoopResult["status"] = "failed"
  let error: string | null = "The edit did not finish."

  /**
   * What produced each tool result, so the compactor can tell a file read from
   * a build report without reading the text of either. Recorded as the calls
   * go out; a compactor that string-matches model-facing prose stops
   * recognising anything the day somebody rewords a message.
   */
  const calls = new Map<string, CallInfo>()

  /** How many times this run has already stopped to ask. Capped. */
  let asks = 0

  /** Why the run stopped early, when it did. Not in itself a failure. */
  let ranOut: string | null = null
  let warnedAboutBudget = false
  const OUT_OF_TIME = "The edit ran out of time and was stopped."

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

      /**
       * OUT OF TOKENS — CHECKED BEFORE A TURN, NEVER INSIDE ONE.
       *
       * A turn is one model call plus the tools it asks for, and stopping
       * halfway through leaves a file written and its import never added. The
       * only safe place to stop is between turns.
       */
      const spent = usage.inputTokens + usage.outputTokens
      if (spent >= maxTokens) {
        ranOut = `The edit reached its budget of ${Math.round(maxTokens / 1000)}k tokens and was stopped.`
        break
      }
      /* OUT OF TIME, checked at the same safe place: between turns. */
      if (input.deadlineAt !== undefined && Date.now() >= input.deadlineAt) {
        ranOut = OUT_OF_TIME
        break
      }

      const nearDeadline = input.deadlineAt !== undefined && input.deadlineAt - Date.now() < TIME_WARNING_MS
      if (!warnedAboutBudget && (spent >= maxTokens * BUDGET_WARNING_FRACTION || nearDeadline)) {
        warnedAboutBudget = true
        turns.push({
          role: "user",
          content:
            "You are close to this run's budget and will be stopped shortly. Finish the most important outstanding step, call run_build, and reply saying plainly what you did and what is still outstanding. Do not start anything new.",
        })
      }

      /**
       * KEEPING THE CONVERSATION INSIDE ITS BUDGET.
       *
       * Only when it is over — a run that stays under is never rewritten, so
       * its prefix is byte-identical turn to turn and caches normally. See
       * ./compaction for why that matters more than compacting eagerly would.
       */
      const compaction = compactTurns({ turns, calls, budgetBytes: input.compactBytes })
      if (compaction.compacted) {
        turns = compaction.turns
        turns.push({
          role: "user",
          content: compactionNote({
            outcome: compaction,
            planSteps: workspace.plan.steps,
            changed: [...workspace.changed],
            deleted: [...workspace.deleted],
            buildOk: workspace.buildOk,
          }),
        })
        yield {
          type: "tool",
          name: "compact_context",
          detail: `${Math.round(compaction.bytesBefore / 1000)}k → ${Math.round(
            compaction.bytesAfter / 1000,
          )}k`,
        }
      }

      /*
        The turn in flight ends at the hard deadline: a model call cut off has
        written no file (tools run after it answers), so stopping here is as
        safe as stopping between turns.
      */
      const hardLeft = input.hardDeadlineAt !== undefined ? input.hardDeadlineAt - Date.now() : null
      const turnTimer = hardLeft !== null ? AbortSignal.timeout(Math.max(1_000, hardLeft)) : null
      const turnSignal = turnTimer ? merged(signal, turnTimer) : signal
      let turn: Awaited<ReturnType<typeof provider.complete>>
      try {
        turn = await provider.complete({
          model,
          system: buildSystemPrompt(context ?? null),
          /**
           * A COPY. The loop keeps appending to `turns`, and handing over the
           * live array means the provider's view of the conversation changes
           * under it — fine for one that serialises synchronously, wrong for
           * one that retries, logs, or defers. The array is a few dozen small
           * objects and the strings are shared, so the copy costs nothing.
           */
          turns: [...turns],
          tools: toolsFor(workspace.hasDocument),
          maxOutputTokens: 32_000,
          cacheKey: input.cacheKey,
          signal: turnSignal,
        })
      } catch (thrown) {
        if (turnTimer?.aborted && !signal?.aborted) {
          ranOut = OUT_OF_TIME
          break
        }
        throw thrown
      }

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
         * A TURN WITH NO TOOL CALLS IS A CLAIM, NOT A FACT.
         *
         * This used to be taken at face value: the model went quiet, the run
         * was recorded as succeeded, and that was that. It could happen at any
         * point — after one edit, after none — which is exactly how "make this
         * much more complete and premium" turned into a single CSS change and
         * a confident summary.
         *
         * The claim is now checked against what the agent itself said it would
         * do and against whether the project builds. If it does not hold up,
         * the reason goes back in as a turn and the run continues.
         */
        const refusal = refuseToFinish({
          plan: workspace.plan,
          requiresPlan: input.budget?.requiresPlan ?? false,
          minSteps: input.budget?.minSteps ?? 0,
          buildOk: workspace.buildOk,
          changedAnything: workspace.changed.size > 0 || workspace.deleted.size > 0,
          isQuestion: looksLikeQuestion(prompt),
          refusals,
          scope: siteScope(workspace.document, startedEmpty),
        })

        if (refusal) {
          refusals += 1
          yield { type: "state", state: "verifying" }
          turns.push({ role: "user", content: refusal })
          continue
        }

        message = turn.text.trim()
        status = "succeeded"
        error = null
        break
      }

      if (turn.text.trim()) yield { type: "thinking", text: turn.text.trim() }

      const results = []
      for (const call of turn.toolCalls) {
        calls.set(call.id, { name: call.name, path: pathOf(call.argumentsJson) })

        /**
         * ASKING IS THE ONE TOOL THE WORKSPACE CANNOT RUN.
         *
         * Everything else is a function of the project: it takes arguments,
         * changes files, returns a string. This one has to reach the screen
         * FIRST and then block until a person acts, so the order is emit,
         * wait, answer — which only the loop can do, because only the loop can
         * yield.
         */
        if (call.name === "ask_creator") {
          const output = yield* askCreator({
            call,
            asks,
            ask: input.ask,
            workspace,
          })
          asks += 1
          results.push({ id: call.id, output })
          continue
        }

        const output = await workspace.execute(call.name, call.argumentsJson, esbuild, typecheck, render)
        results.push({ id: call.id, output })
        yield { type: "tool", name: call.name, detail: describeCall(call.argumentsJson) }

        /**
         * The plan is re-sent whenever it moves, so the editor's checklist is
         * the run's real state rather than a guess assembled from tool names.
         */
        if (call.name === "set_plan" || call.name === "complete_step") {
          yield {
            type: "plan",
            steps: workspace.plan.steps.map((step) => ({ title: step.title, done: step.done })),
          }
        }

        /**
         * State follows what the agent is actually doing. Reading and
         * searching is inspecting; building is verifying; building AFTER a red
         * build is repairing, which is the one a creator most wants to see —
         * it is the difference between "it broke" and "it is fixing it".
         */
        if (call.name === "run_build" || call.name === "read_build_errors") {
          yield { type: "state", state: workspace.buildOk === false ? "repairing" : "verifying" }
        } else if (call.name === "set_plan") {
          yield { type: "state", state: "planning" }
        } else if (call.name === "list_files" || call.name === "read_file" || call.name === "search_code") {
          yield { type: "state", state: "inspecting" }
        } else {
          yield { type: "state", state: "executing" }
        }
      }
      turns.push({ role: "tool", results })

      /**
       * OUT OF STEPS.
       *
       * This used to set `failed` outright, which threw away the run: a model
       * that had done thirty turns of correct, compiling work and simply had
       * more to do lost all of it, and the creator was told the edit failed.
       * Running out of room is not the same as being wrong — what compiles is
       * kept, and what is outstanding is said out loud. See below.
       */
      if (attempt === maxTurns) {
        ranOut = `The edit reached its limit of ${maxTurns} steps and was stopped.`
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
    /**
     * A RUN THAT RAN OUT STILL DID WORK.
     *
     * Treated as a provisional success so the checks below apply to it exactly
     * as they do to a run that finished: if the project compiles, the edits are
     * saved and the creator is told what is left; if it does not, nothing is
     * saved, which is the same rule as everywhere else. The one thing that is
     * never done is discarding work that builds.
     */
    if (ranOut && status === "failed" && error === "The edit did not finish.") {
      /**
       * ONLY WORK IS SALVAGED. A run that ran out having written nothing has
       * not half-done the job — it has not started it, and calling that a
       * success is the exact behaviour the completion gate exists to stop.
       */
      if (workspace.changed.size > 0 || workspace.deleted.size > 0) {
        status = "succeeded"
        error = null
        const outstanding = openSteps(workspace.plan)
        message = [
          message.trim(),
          ranOut,
          outstanding.length > 0
            ? `Still to do: ${outstanding.map((step) => step.title).join("; ")}. Ask again to carry on.`
            : "Ask again if there is more you want changed.",
        ]
          .filter(Boolean)
          .join(" ")
      } else {
        error = `${ranOut} Nothing was changed.`
      }
    }

    if (status === "succeeded") {
      const changedAnything = workspace.changed.size > 0 || workspace.deleted.size > 0

      /**
       * Files changed and no verdict describes them — the model never built,
       * or it built and then edited again. Believing that is how a broken site
       * gets saved by a model that simply forgot the last step, so the loop
       * builds for itself rather than trusting the omission.
       */
      if (changedAnything && workspace.buildOk === null) {
        yield { type: "tool", name: "run_build", detail: "" }
        await workspace.execute("run_build", "{}", esbuild, typecheck, render)
      }

      /**
       * THE COMPOSITE VERDICT, not the bundler's.
       *
       * This used to read `workspace.buildResult.ok` — esbuild's answer alone —
       * and then string-match "Build FAILED" on the rebuild. Both looked only
       * at whether the project PARSED. So a project that failed its typecheck
       * or threw on render passed the last gate before saving, and once the
       * refusal cap was reached it was written over the creator's working
       * site. The net that catches what the model got wrong has to check at
       * least as much as the gate the model was held to.
       */
      if (workspace.buildOk === false) {
        status = "failed"
        error = workspace.buildProblem
      }
    }
  } catch (thrown) {
    // An abort is the user leaving, not a fault. Everything else is, and
    // is said in plain words: the provider's own go to the log (./plain-errors).
    status = "failed"
    error =
      thrown instanceof Error && thrown.name === "AbortError"
        ? "Cancelled."
        : plainRunError(thrown, "code agent loop", "The edit failed. Try again.")
  }

  return { status, message, error, usage, turns: turnCount }
}

/**
 * Ask one question and wait, as a generator so it can emit before it blocks.
 *
 * The whole sequence is here rather than inline because it has four exits —
 * over the cap, unparseable, nobody to ask, and a real answer — and inlining
 * four exits inside the tool loop is how one of them ends up not pushing a
 * result and stranding a tool call the provider is waiting on.
 */
async function* askCreator(input: {
  call: ToolCall
  asks: number
  ask?: (question: AgentQuestion) => Promise<AnswerOutcome>
  workspace: ProjectWorkspace
}): AsyncGenerator<AgentEvent, string> {
  const { call, asks, ask, workspace } = input

  if (asks >= MAX_ASKS_PER_RUN) return tooManyAsksNote()

  let args: Record<string, unknown>
  try {
    args = call.argumentsJson.trim() ? JSON.parse(call.argumentsJson) : {}
  } catch {
    return "Your arguments were not valid JSON. Send them again as a JSON object."
  }

  const question = parseQuestion(args, `q${asks + 1}`)
  if (!question) {
    return "That is not a question anybody can answer. Send one plain sentence about the business — its name, its town, its prices, its hours."
  }

  /**
   * No asker at all: a caller that cannot show a question to anybody, such as
   * the preview worker. Told rather than hung, and told as a timeout because
   * that is what it amounts to — there is nobody there.
   */
  if (!ask) return answerNote(question, { kind: "timeout" })

  yield { type: "tool", name: "ask_creator", detail: question.question }

  /**
   * ON SCREEN BEFORE THE WAIT, which is the entire reason this is a generator.
   * A question that is asked and answered before anybody saw it is not a
   * question.
   */
  yield { type: "question", question }
  yield { type: "state", state: "asking" }

  const outcome = await ask(question)

  yield {
    type: "answered",
    questionId: question.id,
    answer: outcome.kind === "answered" ? outcome.answer : "",
    outcome: outcome.kind,
  }
  yield { type: "state", state: "executing" }

  /**
   * Recorded AFTER the wait, with how it ended. Pushing it beforehand would
   * write a question to the transcript that the run may never have got an
   * answer to, shown tomorrow as though somebody had chosen to leave it blank.
   */
  workspace.questions.push({
    ...question,
    answer: outcome.kind === "answered" ? outcome.answer : undefined,
    outcome: outcome.kind,
  })

  return answerNote(question, outcome)
}

/**
 * Was there effectively nothing here when the run began?
 *
 * "One page holding nothing" is what a brand-new site is, and it is also what
 * a site looks like after somebody deletes everything — both are a build from
 * scratch, so both get the floor. A site with real pages does not.
 */
export function isEmptySite(document: SiteDocument | null): boolean {
  if (!document) return false
  const sections = document.pages.reduce((total, page) => total + page.sections.length, 0)
  return document.pages.length <= 1 && sections <= 2
}

/** The site as it now stands, for the completion gate. */
function siteScope(document: SiteDocument | null, startedEmpty: boolean): SiteScope | undefined {
  if (!document) return undefined
  return {
    firstGeneration: startedEmpty,
    pages: document.pages.length,
    sections: document.pages.reduce((total, page) => total + page.sections.length, 0),
  }
}

/** The `path` argument of a call, or "" — for the compactor's provenance map. */
function pathOf(argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || "{}")
    return typeof args.path === "string" ? args.path : ""
  } catch {
    return ""
  }
}

/**
 * A one-line description of a call, for the UI. Never the file contents.
 *
 * Only `path` used to be read, so half the tools showed as a bare verb:
 * "Searched for" with nothing after it, "Finished" without saying what. Each
 * of these fields is the one thing worth seeing beside its own tool's name,
 * and they are tried in the order that a call can only have one of them.
 */
export function describeCall(argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || "{}")
    for (const field of ["path", "query", "name", "step"]) {
      const value = args[field]
      // Truncated: a step title is the creator's own sentence and can be long,
      // and this sits on one line in a narrow pane.
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80)
    }
  } catch {
    /* a malformed call is still worth showing by name */
  }
  return ""
}
