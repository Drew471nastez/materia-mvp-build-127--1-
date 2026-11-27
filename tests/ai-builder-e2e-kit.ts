/**
 * ===========================================================================
 *  ROUND L, L7: THE KIT THE AI BUILDER'S END TO END SUITES SHARE
 * ===========================================================================
 * tests/ai-builder-journey.test.ts and tests/ai-builder-benchmarks.test.ts
 * drive the REAL pieces through tests/_journey (in memory PostgREST built
 * from the SQL files): the create route, the run route (L2's runner, the
 * agent store, the event RPC), L3's loop and tools on L3's Supabase project
 * store (saveThemeFile, the compiler, the sanitisers), L4's capabilities and
 * render check, the editor's save route, the publish route and the live
 * site's reader.
 *
 * WHAT IS SCRIPTED, SAID PLAINLY: the model. `scriptModels` plays a list of
 * tool calls in place of Claude, so these suites prove the plumbing (every
 * call the model makes is executed by the real loop against the real tools
 * and database) and NOTHING about what a real model would write. The
 * provider resolution (resolveForCreator) and the provider's HTTP are not
 * exercised: the stepper factory is the real one (agentDeps) with only
 * `models` swapped.
 *
 * TIME: the runner reads Date.now; `fakeClock` moves it forward by the time a
 * model call "takes" (default 70 s), so a slice of the runner fits a few
 * calls and hands over to the next request, as on Vercel.
 */
import type { ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { AgentModels } from "@/lib/ai-builder/agent/ports"
import type { Journey, Person } from "./_journey/harness"

/* ── time ─────────────────────────────────────────────────────────────── */

const RealDate = Date
let offsetMs = 0
let installed = false

/** Date.now and `new Date()` read the real clock plus an offset the suite moves forward. */
export function fakeClock(): { advance: (ms: number) => void; now: () => number } {
  if (!installed) {
    installed = true
    const realNow = RealDate.now.bind(RealDate)
    class ShiftedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(realNow() + offsetMs)
        else super(...(args as [string | number | Date]))
      }
      static now(): number {
        return realNow() + offsetMs
      }
    }
    ;(globalThis as { Date: DateConstructor }).Date = ShiftedDate as unknown as DateConstructor
  }
  return { advance: (ms) => void (offsetMs += ms), now: () => Date.now() }
}

/* ── the scripted model ───────────────────────────────────────────────── */

export type ScriptStep = { text?: string; calls?: [string, Record<string, unknown>][]; stop?: ProviderTurn["stop"]; throws?: string; usage?: { input: number; output: number } }
export type Script = (ScriptStep | ((req: ProviderRequest) => ScriptStep | Promise<ScriptStep>))[]

export interface ScriptRun {
  calls: number
  requests: ProviderRequest[]
  /** Tool names the model asked for, in order. */
  asked: string[]
}

/**
 * The three roles answered from ONE script (the plan model while the phase is
 * plan, the loop model after), each call taking `callMs` of the fake clock.
 * After the script ends it keeps calling finish.
 */
export function scriptModels(script: Script, opts: { callMs?: number; clock?: { advance: (ms: number) => void } } = {}): { models: AgentModels; run: ScriptRun } {
  let i = 0
  const run: ScriptRun = { calls: 0, requests: [], asked: [] }
  const provider = (id: string) => ({
    id,
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      run.requests.push({ ...req, turns: [...req.turns] })
      run.calls++
      opts.clock?.advance(opts.callMs ?? 70_000)
      const next = script[i++] ?? { calls: [["finish", { summary: "Done." }]] }
      const step = typeof next === "function" ? await next(req) : next
      if (step.throws) throw new Error(step.throws)
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], n) => ({ id: `call_${run.calls}_${n}`, name, argumentsJson: JSON.stringify(args) }))
      run.asked.push(...toolCalls.map((c) => c.name))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [{ type: "text", text: step.text ?? "" }, ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) }))],
        usage: { inputTokens: step.usage?.input ?? 4_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: step.usage?.output ?? 800 },
        stop: step.stop ?? (toolCalls.length ? "tool_calls" : "done"),
      }
    },
  })
  const plan = provider("scripted-plan")
  const loop = provider("scripted-loop")
  return { run, models: { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: loop, model: "claude-sonnet-5-5", effort: "low" }, small: { provider: loop, model: "claude-haiku-5-5" }, ownKey: false } }
}

/* ── the journey, set up for AI jobs ──────────────────────────────────── */

export interface AiWorld {
  j: Journey
  clock: ReturnType<typeof fakeClock>
  /** Run route kicks made by the server (the create route, a runner handing over, continue). */
  kicks: { jobId: string; token: string | null }[]
  /** The script for the next job the stepper factory is asked for, by job id (set before the job's first turn). */
  scripts: Map<string, { models: AgentModels; run: ScriptRun }>
}

/**
 * The journey with the run route's self call caught (the test drives each
 * turn itself), and L2's stepper factory replaced by the REAL one (agentDeps:
 * Supabase project store, L4 capabilities and render check) with scripted
 * models from `scripts`.
 */
export async function aiWorld(): Promise<AiWorld> {
  const { Journey } = await import("./_journey/harness")
  const j = await Journey.start()
  const clock = fakeClock()
  const kicks: AiWorld["kicks"] = []
  j.net.routes.push({
    match: (u) => /^\/api\/website-builder\/ai-jobs\/[0-9a-f-]+\/run$/.test(u.pathname),
    answer: (req) => {
      kicks.push({ jobId: new URL(req.url).pathname.split("/")[4], token: req.headers.get("x-ai-job-token") })
      return new Response(null, { status: 202 })
    },
  })
  const scripts: AiWorld["scripts"] = new Map()
  const { registerAgentStepper, sliceStepper } = await import("@/lib/website-builder/ai-site/agent-engine")
  const { agentDeps } = await import("@/lib/ai-builder/agent/server")
  /* Round P (P5): the scripted journeys compose their own whole sites, so no starting template (template-first: tests/ai-agent-quality-p5.test.ts). */
  const { NO_TEMPLATES } = await import("@/lib/ai-builder/agent/templates")
  registerAgentStepper(async (job) => {
    const s = scripts.get(job.id)
    if (!s) throw new Error(`no script for job ${job.id}`)
    try {
      return sliceStepper(await agentDeps({ creatorId: job.creatorId, ownerUserId: job.ownerUserId, installId: job.installId }, { models: s.models, templates: NO_TEMPLATES }))
    } catch (e) {
      console.error("[kit] the stepper could not be made", e)
      throw e
    }
  })
  return { j, clock, kicks, scripts }
}

/** A store owner with one published product, ready to make websites. */
export async function seller(w: AiWorld, slug: string, product: { title: string; priceCents: number; type?: string } = { title: "8 week strength block", priceCents: 12_000, type: "service" }): Promise<{ person: Person; creatorId: string; productId: string }> {
  const person = await w.j.signUp(`${slug}@example.com`, { name: slug })
  await w.j.call("POST /api/onboarding/finalize", { as: person, body: { role: "creator", creatorSlug: slug } })
  const creatorId = w.j.rows("creators").find((c) => c.user_id === person.id)?.id as string
  const [row] = w.j.db.insert("products", { creator_id: creatorId, title: product.title, slug: product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: "published", type: product.type ?? "service", price_cents: product.priceCents }, {})
  return { person, creatorId, productId: String(row.id) }
}

/**
 * Every turn of a job, as Vercel would run them: the run route called with
 * the server's own token for each hand over, until nobody asks for another
 * (the job ended) or `maxTurns`. Returns how many turns ran.
 */
export async function driveTurns(w: AiWorld, jobId: string, maxTurns = 12, stopWhen?: () => boolean): Promise<number> {
  const { jobToken } = await import("@/lib/website-builder/ai-site/server")
  let turns = 0
  for (; turns < maxTurns; ) {
    /*
      Changed on purpose (r69): the NEWEST hand over for this job, the older ones dropped. A hand over asked for
      before the job stopped (its working time spent) carries a token minted then; after Continue, 20 fake minutes
      later, it has expired (jobToken's 10 minutes) and the run route rightly answers 404, as Vercel would see it.
      The benchmark's H drove that stale one first and failed on base ("run route answered 404").
    */
    const mine = w.kicks.map((k, i) => (k.jobId === jobId ? i : -1)).filter((i) => i >= 0)
    if (!mine.length) break
    const kick = w.kicks[mine[mine.length - 1]]
    for (const i of mine.reverse()) w.kicks.splice(i, 1)
    const r = await w.j.call(`POST /api/website-builder/ai-jobs/${jobId}/run`, { headers: { "x-ai-job-token": kick.token ?? jobToken(jobId) ?? "" } })
    if (r.status !== 202) throw new Error(`run route answered ${r.status}`)
    turns++
    /* The lease is let go when a turn hands over; a little time passes before Vercel starts the next. */
    w.clock.advance(2_000)
    if (stopWhen?.()) break
  }
  return turns
}

/** The job row and its events, read straight from the database. */
export function jobRow(w: AiWorld, jobId: string): Record<string, any> {
  return w.j.rows("ai_site_jobs").find((r) => r.id === jobId) ?? {}
}
export function jobEvents(w: AiWorld, jobId: string): { seq: number; kind: string; payload: Record<string, any> }[] {
  return w.j
    .rows("ai_site_job_events")
    .filter((e) => e.job_id === jobId)
    .map((e) => ({ seq: Number(e.seq), kind: String(e.kind), payload: (e.payload ?? {}) as Record<string, any> }))
    .sort((a, b) => a.seq - b.seq)
}

/** The install's files (path → what the editor shows: draft when there is one). */
export function installFiles(w: AiWorld, installId: string): Record<string, { content: string | null; draft: string | null }> {
  return Object.fromEntries(w.j.rows("store_theme_custom_files").filter((f) => f.install_id === installId).map((f) => [String(f.path), { content: (f.content ?? null) as string | null, draft: (f.draft_content ?? null) as string | null }]))
}

export function installPages(w: AiWorld, installId: string): Record<string, { sections: any[]; draft: any[] | null }> {
  return Object.fromEntries(w.j.rows("store_theme_pages").filter((p) => p.install_id === installId).map((p) => [String(p.page_key), { sections: (p.sections ?? []) as any[], draft: (p.draft_sections ?? null) as any[] | null }]))
}

export function installSettings(w: AiWorld, installId: string): { settings: Record<string, any>; draft: Record<string, any> | null } {
  const r = w.j.rows("store_theme_settings").find((s) => s.install_id === installId) ?? {}
  return { settings: (r.settings ?? {}) as Record<string, any>, draft: (r.draft_settings ?? null) as Record<string, any> | null }
}

/** A tiny check runner the two suites share. */
export function checker() {
  let passed = 0
  let failed = 0
  const failures: string[] = []
  const check = (name: string, ok: boolean, detail?: unknown) => {
    if (ok) {
      passed++
      console.log(`  ok    ${name}`)
    } else {
      failed++
      failures.push(name)
      console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail)?.slice(0, 1500)}`}`)
    }
  }
  const done = () => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
      process.exit(1)
    }
    process.exit(0)
  }
  return { check, done, section: (t: string) => console.log(`\n${t}`) }
}
