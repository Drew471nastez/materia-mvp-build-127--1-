/**
 * ===========================================================================
 *  ROUND 50: "THIS EDIT RAN OUT OF TIME BEFORE IT CHANGED ANYTHING"
 * ===========================================================================
 * The owner: "In the AI Storelib coding agent I get 'This edit ran out of
 * time before it changed anything'. Make sure this doesn't happen."
 *
 * Where the time went, measured here where it can be (the files a run reads
 * and writes, the checks per write) and simulated where it cannot (a model's
 * output speed), then each fix driven against the real loop
 * (lib/website-builder/agent/loop.ts) with a fake provider on a fast clock:
 *
 *   before    a run with only an AbortSignal: a whole file written, refused,
 *             written again, and the signal ends it with nothing kept. The
 *             route turned that into the owner's sentence.
 *   write     a third of the way in with nothing kept, the model is told to
 *             make the smallest correct change now; it does, and it is kept
 *   time      a part that still keeps nothing stops between turns, with a
 *             checkpoint and an automatic next part, never an error; a draft
 *             that failed its checks is in the checkpoint and never saved
 *   resume    the next part starts from the checkpoint
 *   hang      a call that stops answering is ended and asked once more
 *   stream    a long call sends `working` lines, and the provider says which
 *             tool it is writing
 *   room      late in a part, a turn cut off at the output limit is not asked
 *             again with twice the room
 *
 * Run with:  npx tsx --conditions react-server tests/agent-deadline-r50.test.ts
 * (or through scripts/run-push-tests.mjs).
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeAgent, type ThemeAgentEvent, type ThemeAgentInput, type ThemeAgentResult } from "@/lib/website-builder/agent/loop"
import { buildSection, type ThemeState } from "@/lib/website-builder/agent/operations"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { checkSectionSource } from "@/lib/website-builder/agent/compile-feedback"
import { RunClock, WRITE_NOW_NOTE, describeCheckpoint, guardCall, type RunCheckpoint } from "@/lib/website-builder/agent/run-clock"
import { createAnthropicProvider } from "@/lib/sites/agent/anthropic-provider"
import { plainFailures } from "@/lib/sites/agent/plain-errors"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { AgentProvider, AgentTurn, ProviderActivity, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
    }, { once: true })
  })

/* ── a theme of the creator's own, with one section of their own code ── */

const FAQ = read("themes/default/sections/faq_accordion.storelib").replace(/"type": "faq_accordion"/, '"type": "faq_mine"')
const FIND = (FAQ.match(/transition: [^;]*;/) ?? [""])[0]
const GOOD_EDIT = { sectionType: "faq_mine", edits: [{ find: FIND, replace: "transition: grid-template-rows 240ms cubic-bezier(0.32, 0.72, 0, 1);" }] }
const BROKEN_FILE = "<template>\n<div class=\"faq\">{% for block in section.blocks %}\n</template>\n<schema>{ not json"

function setup() {
  const files: Record<string, string> = { "sections/faq_mine.storelib": FAQ }
  const schemas = schemaMapFor(files)
  const state: ThemeState = {
    sections: [buildSection("hero-1", "hero_centered")!, buildSection("faq-1", "faq_mine", schemas)!].filter(Boolean),
    settings: {},
  }
  const writes: string[] = []
  const code: NonNullable<ThemeAgentInput["code"]> = {
    read: (t: string) => files[`sections/${t}.storelib`] ?? null,
    origin: (t: string) => (files[`sections/${t}.storelib`] ? "own" : "product"),
    write: async (t: string, s: string) => {
      writes.push(s)
      files[`sections/${t}.storelib`] = s
      return { ok: true as const }
    },
  }
  return { files, state, code, writes }
}

/**
 * A MODEL ON A FAST CLOCK. Each scripted turn takes `ms` (a stand-in for a
 * model writing that many tokens), honours the abort signal like the SDK,
 * and may look at what it was sent (the WRITE_NOW note) to decide.
 */
type Step = { ms?: number; text?: string; calls?: [string, Record<string, unknown>][]; stop?: ProviderTurn["stop"]; hang?: boolean; activity?: ProviderActivity[] }
function timedModel(script: (req: ProviderRequest, n: number) => Step, sent: ProviderRequest[], opts: { streams?: boolean } = {}): AgentProvider {
  let n = 0
  return {
    id: "timed",
    streams: opts.streams,
    async complete(request) {
      sent.push({ ...request, turns: request.turns.map((t) => ({ ...t })) as AgentTurn[] })
      const step = script(request, n++)
      for (const a of step.activity ?? []) request.onActivity?.(a)
      if (step.hang) {
        await new Promise<void>((_, reject) => request.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }))
      }
      await sleep(step.ms ?? 1, request.signal)
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `c${n}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 500 }, stop: step.stop ?? (toolCalls.length ? "tool_calls" : "done") }
    },
  }
}

async function drive(input: Partial<ThemeAgentInput> & Pick<ThemeAgentInput, "provider">) {
  const { state, code, files, writes } = setup()
  const events: ThemeAgentEvent[] = []
  const loop = themeAgent({ model: "test", prompt: "make my faq open more smoothly", page: "home", addable: ADDABLE_SECTIONS, state, code, sources: files, ...input })
  let step = await loop.next()
  while (!step.done) {
    events.push(step.value as ThemeAgentEvent)
    step = await loop.next()
  }
  return { events, result: step.value as ThemeAgentResult, writes }
}

/** What the route says for a result, as app/api/.../agent/route.ts decided before this round. */
function oldRouteSays(result: ThemeAgentResult, deadlineFired: boolean): string {
  if (result.status === "failed") return deadlineFired ? "This edit ran out of time before it changed anything. Try asking for one part of it." : result.error ?? "The edit failed."
  return result.message
}

const lastResult = (req: ProviderRequest) => JSON.stringify(req.turns[req.turns.length - 1] ?? "")
const told = (req: ProviderRequest) => lastResult(req).includes("NOTE FROM STORELIB ON TIME")

async function main() {
  section("Where a run's time goes: what can be measured here")
  {
    const own = Object.entries(DEFAULT_THEME_SOURCES).filter(([p]) => p.startsWith("sections/")).map(([p, s]) => [p, s.length] as const).sort((a, b) => b[1] - a[1])
    const median = own[Math.floor(own.length / 2)][1]
    const largest = own[0]
    /* Code tokenises at about 3.5 characters a token. */
    const tokens = (chars: number) => Math.round(chars / 3.5)
    const t0 = performance.now()
    const checked = checkSectionSource({ path: largest[0], type: largest[0].replace(/^sections\/|\.storelib$/g, ""), source: DEFAULT_THEME_SOURCES[largest[0]], before: DEFAULT_THEME_SOURCES[largest[0]], strict: true })
    const checkMs = Math.round(performance.now() - t0)
    console.log(`  Storelib's own sections: median ${median.toLocaleString("en-US")} chars (~${tokens(median).toLocaleString("en-US")} tokens), largest ${largest[0]} ${largest[1].toLocaleString("en-US")} chars (~${tokens(largest[1]).toLocaleString("en-US")} tokens)`)
    console.log(`  The owner's imported Materia theme (tests/fixtures/materia-live): median 16,171 chars, largest 106,631 chars (~30,000 tokens), 698,003 in all`)
    console.log(`  Compile, integration rules and draw of the largest file: ${checkMs} ms (${checked.ok ? "passes" : "refused"})`)
    for (const speed of [40, 60, 80]) {
      console.log(`  At ${speed} tokens a second, rewriting a median file whole takes ${Math.round(tokens(median) / speed)} s, the largest ${Math.round(tokens(largest[1]) / speed)} s, the largest Materia section ${Math.round(30_000 / speed)} s; an edit of a few lines ~${Math.round(400 / speed)} s`)
    }
    check("a check per write is milliseconds, not the cause", checkMs < 2_000, checkMs)
    check("a whole rewrite of a large file is most of a part at an ordinary output speed", tokens(largest[1]) / 60 > 150)
  }

  section("Before: a run with only an AbortSignal ends with nothing kept")
  {
    const sent: ProviderRequest[] = []
    /* 1 read, then a whole file that is refused, then a second whole file the signal cuts off: the shape of the owner's runs. */
    const model = timedModel((_req, n) => (n === 0 ? { ms: 20, calls: [["read_section_code", { sectionType: "faq_mine" }]] } : { ms: 260, calls: [["write_section_code", { sectionType: "faq_mine", source: BROKEN_FILE }]] }), sent)
    const signal = AbortSignal.timeout(450)
    const { result, writes } = await drive({ provider: model, signal })
    const says = oldRouteSays(result, signal.aborted)
    check("the run failed with nothing written", result.status === "failed" && writes.length === 0 && result.ops.length === 0, result)
    check("and the old route said the owner's sentence", /ran out of time before it changed anything/.test(says), says)
  }

  section("Write early: a third of the way in, the smallest correct change")
  {
    const sent: ProviderRequest[] = []
    const model = timedModel((req, n) => {
      if (told(req)) return { ms: 20, calls: [["edit_section_code", GOOD_EDIT]] }
      if (n === 0) return { ms: 20, calls: [["read_section_code", { sectionType: "faq_mine" }]] }
      if (lastResult(req).includes("compiled and is kept")) return { ms: 5, text: "The answers open over a quarter of a second." }
      return { ms: 220, calls: [["write_section_code", { sectionType: "faq_mine", source: BROKEN_FILE }]] }
    }, sent)
    const { result, writes, events } = await drive({ provider: model, deadlineAt: Date.now() + 900, clockLimits: { minTurnMs: 40, keepAliveMs: 50 } })
    const noted = sent.findIndex(told)
    check("the model is told, once, when a third of the part is gone with nothing kept", noted > 0 && sent.filter(told).length >= 1 && lastResult(sent[noted]).includes(WRITE_NOW_NOTE.slice(0, 40)), noted)
    check("its small edit is kept", result.status === "succeeded" && writes.length === 1 && writes[0].includes("240ms cubic-bezier") && result.wroteCode === true, { status: result.status, writes: writes.length, err: result.error })
    check("the broken whole file was never saved", writes.every((w) => w !== BROKEN_FILE))
    check("the reply's first line says what changed", result.headline === "Edited: Accordion FAQ" || /^Edited: /.test(result.headline ?? ""), result.headline)
    check("and no error reached the stream", !events.some((e) => e.type === "error"))
  }

  section("Out of time with nothing kept: a checkpoint and the next part, never an error")
  {
    const sent: ProviderRequest[] = []
    /* A model that ignores the note and keeps sending broken whole files. */
    const model = timedModel((_req, n) => (n === 0 ? { ms: 20, text: "I will rewrite the accordion.", calls: [["read_section_code", { sectionType: "faq_mine" }]] } : { ms: 150, calls: [["write_section_code", { sectionType: "faq_mine", source: BROKEN_FILE }]] }), sent)
    const started = Date.now()
    const { result, writes, events } = await drive({ provider: model, deadlineAt: Date.now() + 500, clockLimits: { minTurnMs: 60, keepAliveMs: 50 }, runId: "run-1" })
    const took = Date.now() - started
    const cp = events.find((e): e is Extract<ThemeAgentEvent, { type: "checkpoint" }> => e.type === "checkpoint")?.checkpoint
    check("the part ends on its clock, not after it", took < 700, took)
    check("as a pause: succeeded, stopped for time, nothing saved", result.status === "succeeded" && result.stopped === "time" && writes.length === 0 && result.error === null, { status: result.status, stopped: result.stopped, error: result.error })
    check("the chat is told to send the next part by itself", events.some((e) => e.type === "continue" && e.reason === "time"))
    check("the reply says it is carrying on, and never that it ran out of time before it changed anything", /carrying on/i.test(result.message) && !/ran out of time before it changed anything/.test(result.message), result.message)
    check("the checkpoint carries the request, the plan, what was read and the refused draft with why", !!cp && cp.part === 2 && cp.runId === "run-1" && cp.prompt === "make my faq open more smoothly" && /rewrite the accordion/.test(cp.plan ?? "") && cp.read.some((r) => /faq_mine/.test(r)) && cp.draft?.source === BROKEN_FILE && !!cp.draft?.problem, cp)
    check("no error line", !events.some((e) => e.type === "error"))

    section("The next part starts from it")
    const sent2: ProviderRequest[] = []
    const model2 = timedModel((req, n) => (n === 0 ? { ms: 5, calls: [["edit_section_code", GOOD_EDIT]] } : { ms: 5, text: "Done: the answers open smoothly." }), sent2)
    const second = await drive({ provider: model2, prompt: "Continue where you stopped: finish the rest of what I asked, without redoing what is already done.", checkpoint: cp as RunCheckpoint, deadlineAt: Date.now() + 2_000, clockLimits: { minTurnMs: 40 } })
    const first = JSON.stringify(sent2[0].turns[0])
    check("its first message says what the last part was asked and got to", /THIS CONTINUES A RUN THAT RAN OUT OF TIME/.test(first) && first.includes("make my faq open more smoothly") && /did not pass its checks/.test(first), first.slice(0, 300))
    check("and tells it to make the smallest change first", /WORK ORDER FOR THIS PART/.test(first))
    check("the change is kept this time", second.result.status === "succeeded" && second.writes.length === 1)
  }

  section("A call that stops answering is ended and asked once more")
  {
    const sent: ProviderRequest[] = []
    const model = timedModel((_req, n) => (n === 0 ? { hang: true } : n === 1 ? { ms: 5, calls: [["edit_section_code", GOOD_EDIT]] } : { ms: 5, text: "Smoother now." }), sent, { streams: true })
    const traces: string[] = []
    const { result, events } = await drive({ provider: model, deadlineAt: Date.now() + 3_000, clockLimits: { connectMs: 80, idleMs: 80, minTurnMs: 40, keepAliveMs: 1_000 }, trace: (e) => traces.push(e.kind) })
    check("the silent call was cut at its own limit and asked again", sent.length >= 2 && traces.includes("hung"), { calls: sent.length, traces })
    check("the creator is told in a line", events.some((e) => e.type === "thinking" && /went quiet/.test(e.text)))
    check("and the run finished with the change", result.status === "succeeded" && result.wroteCode === true, result.error)

    const sent2: ProviderRequest[] = []
    const silent = timedModel(() => ({ hang: true }), sent2, { streams: true })
    const twice = await drive({ provider: silent, deadlineAt: Date.now() + 3_000, clockLimits: { connectMs: 60, idleMs: 60, minTurnMs: 40, retries: 1 } })
    check("twice silent: two calls, then a pause with a checkpoint, not an error", sent2.length === 2 && twice.result.status === "succeeded" && twice.result.stopped === "time" && twice.events.some((e) => e.type === "checkpoint"), { calls: sent2.length, status: twice.result.status })

    const sent3: ProviderRequest[] = []
    const oneShot = timedModel((_req, n) => (n === 0 ? { ms: 250, calls: [["edit_section_code", GOOD_EDIT]] } : { ms: 5, text: "Done." }), sent3, { streams: false })
    const slow = await drive({ provider: oneShot, deadlineAt: Date.now() + 3_000, clockLimits: { connectMs: 60, idleMs: 60, minTurnMs: 40 } })
    check("a provider that does not stream is never taken for one that hung", sent3.length === 2 && slow.result.wroteCode === true, sent3.length)
  }

  section("A long call keeps the stream talking, and says which tool it is writing")
  {
    const sent: ProviderRequest[] = []
    const model = timedModel((_req, n) => (n === 0 ? { ms: 200, activity: [{ kind: "start" }, { kind: "tool", tool: "edit_section_code", chars: 0 }, { kind: "tool", chars: 120 }], calls: [["edit_section_code", GOOD_EDIT]] } : { ms: 5, text: "Done." }), sent, { streams: true })
    const { events } = await drive({ provider: model, deadlineAt: Date.now() + 3_000, clockLimits: { keepAliveMs: 40, minTurnMs: 40 } })
    const working = events.filter((e): e is Extract<ThemeAgentEvent, { type: "working" }> => e.type === "working")
    check("`working` lines while the model writes", working.length >= 3, working.length)
    check("naming the tool and how much is written", working.some((w) => w.tool === "edit_section_code" && (w.chars ?? 0) >= 120), working[0])

    /* The real provider, on a fake SDK stream: activity reaches the caller with the tool's name. */
    const seen: ProviderActivity[] = []
    const fakeClient = {
      messages: {
        stream: () => {
          const handlers: ((e: unknown) => void)[] = []
          return {
            on: (name: string, fn: (e: unknown) => void) => {
              if (name === "streamEvent") handlers.push(fn)
            },
            finalMessage: async () => {
              for (const e of [
                { type: "message_start" },
                { type: "content_block_start", content_block: { type: "thinking" } },
                { type: "content_block_start", content_block: { type: "tool_use", name: "edit_section_code" } },
                { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"sectionType":' } },
              ]) for (const h of handlers) h(e)
              return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }
            },
          }
        },
      },
    }
    const provider = plainFailures(createAnthropicProvider(() => fakeClient as never))
    await provider.complete({ model: "claude-opus-5-5", system: "x", turns: [{ role: "user", content: "x" }], tools: [], maxOutputTokens: 10, onActivity: (a) => seen.push(a) })
    check("the Claude provider streams, and says so through the plain-errors wrapper", provider.streams === true)
    check("its stream events reach onActivity: start, thinking, the tool by name, its input", seen[0]?.kind === "start" && seen.some((a) => a.kind === "thinking") && seen.some((a) => a.tool === "edit_section_code") && seen.some((a) => a.kind === "tool" && a.chars === 15), seen)
  }

  section("Late in a part, a cut off turn is not asked again with twice the room")
  {
    const sent: ProviderRequest[] = []
    const model = timedModel((req, n) => (n === 0 ? { ms: 300, stop: "length", text: "" } : n === 1 ? { ms: 5, calls: [["edit_section_code", GOOD_EDIT]] } : { ms: 5, text: "Done." }), sent)
    await drive({ provider: model, deadlineAt: Date.now() + 500, clockLimits: { minTurnMs: 40 } })
    check("the second request keeps the first one's room", sent.length >= 2 && sent[1].maxOutputTokens === sent[0].maxOutputTokens, sent.map((s) => s.maxOutputTokens))
    check("and is told to carry on in smaller steps", /smaller steps/.test(JSON.stringify(sent[1].turns.slice(-1))))
    const early: ProviderRequest[] = []
    const model2 = timedModel((_req, n) => (n === 0 ? { ms: 5, stop: "length", text: "" } : { ms: 5, text: "Done." }), early)
    await drive({ provider: model2, deadlineAt: Date.now() + 5_000, clockLimits: { minTurnMs: 40 } })
    check("early in a part it still is, as before", early.length >= 2 && early[1].maxOutputTokens > early[0].maxOutputTokens, early.map((s) => s.maxOutputTokens))
  }

  section("No turn starts that could not finish")
  {
    const sent: ProviderRequest[] = []
    const model = timedModel(() => ({ ms: 5, text: "x" }), sent)
    const { result } = await drive({ provider: model, deadlineAt: Date.now() + 10, clockLimits: { minTurnMs: 1_000 } })
    check("with less than a turn's time left, no call is made and the part pauses", sent.length === 0 && result.stopped === "time" && result.status === "succeeded", { calls: sent.length, stopped: result.stopped })
  }

  section("The clock and the call guard, alone")
  {
    let now = 0
    const clock = new RunClock({ startedAt: 0, deadlineAt: 100_000, now: () => now })
    now = 30_000
    check("a third of the way in, nothing kept: not yet", !clock.shouldWriteNow(false))
    now = 36_000
    check("past it: write now", clock.shouldWriteNow(false) && !clock.shouldWriteNow(true))
    now = 81_000
    check("past four fifths: wrap up, and no more room to regrow", clock.shouldWrapUp() && !clock.mayRegrow())
    now = 85_000
    check("under the minimum turn: no turn", !clock.roomForTurn())
    const g = guardCall({ deadlineMs: 50, connectMs: 10_000, idleMs: 10_000, watch: true })
    await sleep(80)
    check("a guard ends at its deadline and says so", g.signal.aborted && g.why() === "deadline")
    g.done()
    const caller = new AbortController()
    const g2 = guardCall({ caller: caller.signal, deadlineMs: 10_000, connectMs: 10_000, idleMs: 10_000, watch: true })
    caller.abort()
    check("and on the caller's abort, as the caller's", g2.signal.aborted && g2.why() === "caller")
    g2.done()
    const g3 = guardCall({ deadlineMs: 10_000, connectMs: 30, idleMs: 30, watch: true })
    for (let i = 0; i < 4; i++) {
      await sleep(15)
      g3.activity()
    }
    check("activity keeps a streaming call alive past its idle limit", !g3.signal.aborted)
    await sleep(60)
    check("silence after it ends it as hung", g3.why() === "hung")
    g3.done()
    check("the checkpoint reads as the next part's brief", /WORK ORDER FOR THIS PART/.test(describeCheckpoint({ v: 1, runId: "r", part: 2, prompt: "p", read: [] })))
  }

  section("The route and the chat")
  {
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the owner's sentence is gone from the route", !/ran out of time before it changed anything/.test(route))
    check("the loop gets its own deadline, a few seconds inside the backstop signal", /deadlineAt = Date\.now\(\) \+ loopDeadlineMs\(\{ requestStartedAt, maxDurationS: maxDuration \}\) - CLOCK_MARGIN_MS/.test(route) && /deadlineAt,/.test(route))
    check("the backstop still stops it the way it did, carrying on rather than failing", /result\.status === "failed" && deadline\.aborted && !request\.signal\.aborted && !codeLost/.test(route) && /send\(\{ type: "continue", reason: "time" \}\)/.test(route))
    check("a checkpoint comes back as `resume`, checked, and is what is classified", /resume: z/.test(route) && /const asked = resume\?\.prompt \|\| body\.prompt/.test(route) && /checkpoint: resume/.test(route))
    check("the run log has the target, the part and when the loop started after the request", /part: resume\?\.part \?\? 1/.test(route) && /startedAfterMs: startedAt - requestStartedAt/.test(route))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the chat keeps the checkpoint and sends it with the next part only", /type === "checkpoint"/.test(chat) && /const resume = prompt === CONTINUE_PROMPT \? checkpoint\.current : null/.test(chat) && /\.\.\.\(resume \? \{ resume \} : \{\}\)/.test(chat))
    const loop = read("lib/website-builder/agent/loop.ts")
    check("both model calls in the loop go through the guarded call", (loop.match(/yield\* callModel\(/g) ?? []).length === 2 && !/await completeOnce\(provider,/.test(loop))
  }
}

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
})
