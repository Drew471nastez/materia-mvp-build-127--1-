/**
 * ===========================================================================
 *  THE AGENT ENGINE IN THE DURABLE RUNNER (round L, L2 x L3)
 * ===========================================================================
 * L3's loop (runAgentSlice) driven by L2's runner through sliceStepper
 * (lib/website-builder/ai-site/agent-engine.ts): one model call per step,
 * the runner's budgets, cancel, checkpoint, fenced row and events. The same
 * scripted fitness coach website as tests/ai-builder-agent.test.ts, in a
 * project held in memory; no network, no model.
 *
 * Run with:  npm run test:push
 */
import { NO_TEMPLATES } from "@/lib/ai-builder/agent/templates"
import { runAgentInvocation, emptyRunState, type AgentJobPatch, type AgentJobRecord, type AgentStore, type EventRow } from "@/lib/website-builder/ai-site/agent-runner"
import { previewErrorsFromEvents } from "@/lib/website-builder/ai-site/agent-view"
import { scopedStore, sliceStepper } from "@/lib/website-builder/ai-site/agent-engine"
import { editJobOptions, editJobPrompt, parseEditRequest } from "@/lib/website-builder/ai-site/edit-job"
import { editScopeOf } from "@/lib/ai-builder/agent-step"
import { jobBrief } from "@/lib/website-builder/ai-site/job"
import { readFileSync } from "node:fs"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import type { AgentDeps } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest } from "@/lib/sites/agent/types"
import { ABOUT, CAPS, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS, scripted, type Step, PROGRAM_BLOCKS } from "./ai-builder-agent-fixtures"
/* Round N (N3): the site plan with the concept, and a whole site before finish. */
import { homeSections, pageSections, sitePlan, templateCalls, writeWholeSite } from "./ai-builder-whole-site-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}

const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)

/** The job row and its events, with the database's rules (lease, fence, numbering under the job's lock). */
class Rows implements AgentStore {
  jobs = new Map<string, AgentJobRecord>()
  events: (EventRow & { jobId: string; seq: number; at: string })[] = []
  constructor(private now: () => number) {}
  add(job: Partial<AgentJobRecord> & { id: string }) {
    const j: AgentJobRecord = { creatorId: "creator-a", ownerUserId: "u", installId: "install-a", prompt: "A website for my strength coaching: small group classes and an 8 week program.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, status: "queued", phase: null, iteration: 0, checkpoint: null, budget: null, cancelRequestedAt: null, lastEventSeq: 0, attempts: 0, leaseUntil: null, createdAt: new Date(this.now()).toISOString(), run: emptyRunState(), ...job }
    this.jobs.set(j.id, j)
    return j
  }
  async load(id: string) {
    const j = this.jobs.get(id)
    return j ? structuredClone(j) : null
  }
  async claim(job: AgentJobRecord, now: number, leaseMs: number) {
    const j = this.jobs.get(job.id)
    if (!j || j.attempts !== job.attempts || !["queued", "running"].includes(j.status) || (j.leaseUntil && Date.parse(j.leaseUntil) >= now)) return false
    j.leaseUntil = new Date(now + leaseMs).toISOString()
    j.attempts += 1
    j.status = "running"
    return true
  }
  async save(id: string, fence: number, p: AgentJobPatch) {
    const j = this.jobs.get(id)
    if (!j || j.attempts !== fence) return false
    Object.assign(j, Object.fromEntries(Object.entries({ status: p.status, phase: p.phase, iteration: p.iteration, checkpoint: p.checkpoint === undefined ? undefined : structuredClone(p.checkpoint), run: p.run === undefined ? undefined : structuredClone(p.run), leaseUntil: p.leaseUntil }).filter(([, v]) => v !== undefined)))
    if (p.leaseUntil === null) j.leaseUntil = null
    return true
  }
  async appendEvents(jobId: string, _c: string, rows: EventRow[]) {
    const j = this.jobs.get(jobId)
    if (!j || !["queued", "running"].includes(j.status)) return { ok: true, last: 0 }
    let seq = Math.max(j.lastEventSeq, ...this.events.filter((e) => e.jobId === jobId).map((e) => e.seq), 0)
    for (const r of rows) this.events.push({ ...r, jobId, seq: ++seq, at: new Date(this.now()).toISOString() })
    j.lastEventSeq = seq
    return { ok: true, last: seq }
  }
  async flags(jobId: string) {
    return { cancelRequested: !!this.jobs.get(jobId)?.cancelRequestedAt }
  }
  async previewErrors(jobId: string) {
    return previewErrorsFromEvents(this.events.filter((e) => e.jobId === jobId && e.kind === "error").map((e) => ({ payload: e.payload, created_at: e.at })))
  }
  async liveCount() {
    return 0
  }
  async park() {}
}

function depsFor(store: ReturnType<typeof memoryStore>, steps: Step[], extra: Partial<AgentDeps> = {}) {
  /* One script across both roles: the plan model answers while the phase is "plan", the loop model after. Each role records what it was sent. */
  let i = 0
  const role = (id: string) => {
    const rec = {
      id,
      requests: [] as ProviderRequest[],
      calls: 0,
      async complete(req: ProviderRequest) {
        rec.requests.push({ ...req, turns: [...req.turns] })
        rec.calls++
        return scripted([steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }]).complete(req)
      },
    }
    return rec
  }
  const plan = role("plan")
  const loop = role("loop")
  const clock = { t: T0 }
  const deps: AgentDeps = {
    store,
    models: { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: loop, model: "claude-sonnet-5-5", effort: "low" }, small: { provider: loop, model: "claude-haiku-5-5" }, ownKey: false },
    templates: NO_TEMPLATES,
    capabilities: async () => CAPS,
    now: () => (clock.t += 1_000),
    ...extra,
  }
  return { deps, plan, loop, clock }
}

/* The fitness coach website, as a model would build it. */
function fitnessSteps(store: ReturnType<typeof memoryStore>): Step[] {
  return [
    /* 1 (plan model): a write before the concept is refused; then the concept. */
    { text: "Planning the look first.", calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }], ["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, pages: sitePlan(["programs", "about"]), tasks: ["Header and footer", "Home: hero and programs", "Programs page", "About page"] }]] },
    /* 2: real data and tokens. */
    { calls: [["list_capabilities", {}], ["set_tokens", { tokens: { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" }, radius: { small: 2, medium: 4, large: 0 }, spacing: { scale: 1.1, sectionY: 96, pageWidth: 1240, gutter: 24 }, motion: { level: "subtle", style: "rise", durationMs: 500 }, custom: { radius: "2px", grain: "0.06" } } }]] },
    /* 3: five original components. */
    {
      calls: [
        ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }],
        ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }],
        ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }],
        ["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }],
        ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }],
      ],
    },
    /* 3b (round N): the rest of a whole site, the templates' components among them. */
    ...writeWholeSite().map((calls) => ({ calls })),
    /* 4: pages. */
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About", seo: { description: "Who coaches you." } }]] },
    /* 5: compose. */
    {
      calls: [
        [
          "set_page_sections",
          {
            page: "home",
            sections: homeSections([
              { type: "ai_coach_hero", settings: { heading: "Lift with a plan", cta_url: "/programs" } },
              { type: "ai_program_list", blocks: PROGRAM_BLOCKS },
            ]),
          },
        ],
        ["set_page_sections", { page: "programs", sections: pageSections({ type: "ai_program_list", settings: { heading: "All programs" } }) }],
        ["set_page_sections", { page: "about", sections: pageSections({ type: "ai_coach_story" }) }],
        ...templateCalls(),
      ],
    },
    /* 6: bind a real product (and try an invented one). */
    () => {
      const id = store.project.pages.home.find((s) => s.type === "ai_program_list")?.id ?? ""
      return { calls: [["list_pages", {}], ["bind_data", { page: "home", sectionId: id, prop: "product", kind: "product", ids: ["prod_invented"] }], ["bind_data", { page: "home", sectionId: id, prop: "product", kind: "product", ids: ["prod_8week"] }]] }
    },
    /* 7: checks. */
    { calls: [["validate", {}], ["render_check", { page: "home" }], ["render_check", { page: "programs" }]] },
    /* 8: done. */
    { calls: [["finish", { summary: "A three page site for Iron & Chalk with its own header and footer. Fill in your class times and story." }]] },
  ]
}


async function main() {
  console.log("\n1. the fitness coach website, through the runner")
  const store = memoryStore({ pages: { home: [] }, settings: {} })
  const { deps, plan, loop } = depsFor(store, fitnessSteps(store))
  const clock = { t: T0 }
  const now = () => clock.t
  const rows = new Rows(now)
  rows.add({ id: "job-1" })
  const stepper = sliceStepper(deps, () => (clock.t += 1_000))
  let kicks = 0
  const outcomes: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = await runAgentInvocation("job-1", { store: rows, stepperFor: async () => stepper, now, sleep: async (ms) => void (clock.t += ms), started: clock.t, kick: async () => (kicks++, true), log: () => {} })
    outcomes.push(r.outcome)
    if (r.outcome !== "chained") break
    clock.t += 2_000
  }
  const job = rows.jobs.get("job-1")!
  const ev = rows.events.filter((e) => e.jobId === "job-1")
  check("the job completes through the runner", job.status === "complete", { status: job.status, code: job.run.errorCode, summary: job.run.summary, outcomes, tail: ev.slice(-6).map((e) => [e.kind, e.payload]) })
  check("one runner iteration per model call", job.run.usage.iterations === plan.calls + loop.calls, { iterations: job.run.usage.iterations, calls: plan.calls + loop.calls })
  check("the agent's own spend is the job's", job.run.usage.usd > 0 && job.run.usage.outputTokens > 0)
  const seqs = ev.map((e) => e.seq)
  check("every event has its own number, in order", seqs.every((s, i) => s === i + 1) && job.lastEventSeq === seqs.length)
  check("one finished event, and it is the last", ev.filter((e) => e.kind === "finished").length === 1 && ev[ev.length - 1].kind === "finished", ev.slice(-3).map((e) => e.kind))
  check("the loop's phases are not repeated by the runner", ev.filter((e) => e.kind === "phase" && e.payload.phase === "brief").length === 1, ev.filter((e) => e.kind === "phase").map((e) => e.payload.phase))
  check("files and pages made reach the view's counts", (job.run.counts.componentsWritten ?? 0) >= 5 && (job.run.counts.pagesDone ?? 0) >= 2, job.run.counts)
  check("the checkpoint is the loop's (concept kept for the next slice)", !!(job.checkpoint as { concept?: unknown } | null)?.concept)
  check("files are drafts in the project", Object.keys(store.project.files).some((p) => p.startsWith("sections/ai_")))

  console.log("\n2. chained across requests, cancel between calls")
  const store2 = memoryStore({ pages: { home: [] }, settings: {} })
  const d2 = depsFor(store2, fitnessSteps(store2))
  const clock2 = { t: T0 }
  const rows2 = new Rows(() => clock2.t)
  rows2.add({ id: "job-2" })
  /* Each model call takes 70 s of this request: three fit in 240 s with 60 s kept back. */
  const slow = sliceStepper(d2.deps, () => clock2.t)
  const slowStep = { ...slow, step: async (cp: Parameters<typeof slow.step>[0], ctx: Parameters<typeof slow.step>[1]) => { clock2.t += 70_000; return slow.step(cp, ctx) } }
  const first = await runAgentInvocation("job-2", { store: rows2, stepperFor: async () => slowStep, now: () => clock2.t, started: clock2.t, kick: async () => true, log: () => {} })
  check("a request runs the calls that fit, then hands over", first.outcome === "chained" && rows2.jobs.get("job-2")!.run.usage.iterations === 3, { first, it: rows2.jobs.get("job-2")!.run.usage.iterations })
  rows2.jobs.get("job-2")!.cancelRequestedAt = new Date(clock2.t).toISOString()
  clock2.t += 1_000
  const second = await runAgentInvocation("job-2", { store: rows2, stepperFor: async () => slowStep, now: () => clock2.t, started: clock2.t, kick: async () => true, log: () => {} })
  const j2 = rows2.jobs.get("job-2")!
  check("cancel pressed between requests: ended cancelled before another call, drafts kept", second.outcome === "ended" && j2.status === "cancelled" && j2.run.usage.iterations === 3 && Object.keys(store2.project.files).length > 0, { second, status: j2.status })

  console.log("\n3. Edit with AI on one component (themes/[id]/ai-edit)")
  const body = { mode: "edit", path: "sections/ai_coach_hero.storelib", sectionId: "ai_coach_hero-1", page: "home", prompt: "Make the heading calmer", expectedVersion: null }
  const parsed = parseEditRequest(body)
  check("the request is read", parsed.ok && parsed.edit.path === body.path && parsed.edit.page === "home")
  check("paths outside the section files, empty words and odd versions are refused", !parseEditRequest({ ...body, path: "layout/theme.storelib" }).ok && !parseEditRequest({ ...body, path: "../x.storelib" }).ok && !parseEditRequest({ ...body, prompt: "  " }).ok && !parseEditRequest({ ...body, expectedVersion: "abc" }).ok && !parseEditRequest({ ...body, mode: "new" }).ok)
  const ok = parsed.ok ? parsed.edit : null!
  const prompt = editJobPrompt({ ...ok, prompt: "x".repeat(5_000) })
  check("the job's prompt keeps their words first, names the file, fits the row", editJobPrompt(ok).startsWith("Make the heading calmer\n\n(About sections/ai_coach_hero.storelib, section ai_coach_hero-1 on the home page") && prompt.length <= 2_000 && prompt.endsWith("Change only this file.)"))
  const opts = editJobOptions(ok)
  check("its options carry the scope, read back the same", JSON.stringify(editScopeOf(opts)) === JSON.stringify({ path: ok.path, sectionId: "ai_coach_hero-1", page: "home" }) && editScopeOf({ generation: "theme" }) === null && editScopeOf({ edit: { path: "../../etc" } }) === null)
  check("an edit's brief is its words, not how a new website starts", jobBrief({ prompt: "p", options: opts }) === "p")
  const store3 = memoryStore({ pages: { home: [] }, settings: {}, files: { "sections/ai_coach_hero.storelib": HERO } })
  const scoped = scopedStore(store3, "sections/ai_coach_hero.storelib")
  const other = await scoped.writeFile("sections/ai_other.storelib", HERO, { expectedVersion: null, author: "ai", jobId: "j" })
  const del = await scoped.deleteFile("sections/ai_coach_hero.storelib", { author: "ai", jobId: "j" })
  check("an edit job cannot write or delete any other file, nor delete its own", !other.ok && !del.ok && !Object.keys(store3.project.files).includes("sections/ai_other.storelib"))
  const route = readFileSync("app/api/website-builder/themes/[installId]/ai-edit/route.ts", "utf8")
  check("the route: owner only, rate limited, this creator's website, 501 when the agent is off, a version conflict refused, an agent job on step agent", /if \(!site\.isOwner\)/.test(route) && /rateLimit\(/.test(route) && /\.eq\("creator_id", site\.creatorId\)/.test(route) && /* Changed on purpose (round M): the switch is per account now (agent-access.ts agentEnabledFor), the global flag one of its two inputs. */ /agentEnabledFor\(admin, \{ ownerUserId: site\.ownerUserId, creatorId: site\.creatorId \}\)\)\) return NextResponse\.json\(\{ error: "Not available" \}, \{ status: 501 \}\)/.test(route) && /expectedVersion !== current/.test(route) && /engine: "agent"/.test(route) && /step: "agent"/.test(route))
}

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:\n" + failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
})
