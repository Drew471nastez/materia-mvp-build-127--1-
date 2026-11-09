/**
 * ===========================================================================
 *  THE LIVE SMOKE, WITH A SCRIPTED MODEL (round M)
 * ===========================================================================
 * scripts/ai-builder/live-smoke.ts runs one real generation through the
 * production runner and stepper (scripts/ai-builder/smoke-run.ts). This runs
 * the SAME smoke run with a scripted model on a fake clock, so the script
 * keeps working without spending anything:
 *
 *   • one model call per step, requests handed over when their time is up,
 *     a fresh stepper per request: the only memory between requests is the
 *     checkpoint, saved through JSON
 *   • the model's next step depends on what its last tool answered, across a
 *     hand over (the "no memory between steps" bug would fail it)
 *   • the spend cap and the wall clock cap stop the job honestly
 *   • the report (calls, cost, phases, files, validation, slop score) and the
 *     files saved to a scratch folder
 *   • the gate: nothing runs without STORELIB_LIVE_AI_SMOKE=1 and a key, and
 *     the key's value is never printed
 *
 * Run with:  npm run test:push
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describeSmoke, runSmoke, smokeGate, smokeLimits } from "../scripts/ai-builder/smoke-run"
import { SMOKE_CAPABILITIES, SMOKE_PROMPT, liveSmoke } from "../scripts/ai-builder/live-smoke"
import type { AgentModels } from "@/lib/ai-builder/agent/ports"
import type { ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import { ABOUT, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS, type PlainStep } from "./ai-builder-agent-fixtures"
/* Round N (N3): the site plan with the concept, and a whole site before finish. */
import { WHOLE_SITE_FILES, homeSections, pageSections, sitePlan, templateCalls } from "./ai-builder-whole-site-fixtures"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}

const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)
const PRODUCT = SMOKE_CAPABILITIES.products[0].id
type Step = PlainStep | ((req: ProviderRequest) => PlainStep)

/** One script for both roles; every call takes `callMs` of the fake clock. Records each request. */
function scriptedModels(steps: Step[], clock: { t: number }, callMs = 70_000) {
  let i = 0
  const requests: ProviderRequest[] = []
  const provider = (id: string) => ({
    id,
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      requests.push({ ...req, turns: [...req.turns] })
      clock.t += callMs
      const next = steps[i++] ?? { calls: [["finish", { summary: "Done." }]] }
      const step = typeof next === "function" ? next(req) : next
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], n) => ({ id: `call_${requests.length}_${n}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: step.text ?? "",
        toolCalls,
        raw: [{ type: "text", text: step.text ?? "" }, ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.argumentsJson) }))],
        usage: { inputTokens: step.usage?.input ?? 4_000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: step.usage?.output ?? 800 },
        stop: toolCalls.length ? "tool_calls" : "done",
      }
    },
  })
  const plan = provider("scripted-plan")
  const loop = provider("scripted-loop")
  const models: AgentModels = { plan: { provider: plan, model: "claude-opus-5-5", effort: "medium" }, loop: { provider: loop, model: "claude-sonnet-5-5", effort: "low" }, small: { provider: loop, model: "claude-haiku-5-5" }, ownKey: false }
  return { models, requests }
}

/** Every tool answer the model was sent in this request, newest last. */
function toolAnswers(req: ProviderRequest): string[] {
  const out: string[] = []
  for (const t of req.turns) {
    if (t.role === "tool") for (const r of t.results) out.push(r.output)
    else if (t.role === "user") out.push(typeof t.content === "string" ? t.content : JSON.stringify(t.content ?? ""))
  }
  return out
}

/** The strength coach website, as a model would build it. Three calls fit a request (70 s each, 240 s, 60 s kept back). */
function coachSteps(seen: { bindFrom: string | null }): Step[] {
  return [
    /* request 1 */
    { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, pages: sitePlan(["programs", "about"]), tasks: ["Header and footer", "Home", "Programs", "About"] }]] },
    { calls: [["list_capabilities", {}], ["set_tokens", { tokens: { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd" }, fonts: { heading: "Oswald", body: "Inter" } } }]] },
    {
      calls: [
        ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }],
        ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }],
        ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }],
        ["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }],
        ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }],
        ...Object.entries(WHOLE_SITE_FILES).map(([path, content]) => ["write_file", { path, content }] as [string, Record<string, unknown>]),
      ],
    },
    /* request 2: the concept must have survived the hand over, or these are refused */
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About" }]] },
    {
      calls: [
        ["set_page_sections", { page: "home", sections: homeSections([{ type: "ai_coach_hero", settings: { heading: "Lift with a plan", cta_url: "/programs" } }, { type: "ai_program_list", blocks: [{ type: "program", settings: { name: "Small group strength", when: "Mon Wed Fri 7am" } }] }]) }],
        ["set_page_sections", { page: "programs", sections: pageSections({ type: "ai_program_list", settings: { heading: "All programs" } }) }],
        ["set_page_sections", { page: "about", sections: pageSections({ type: "ai_coach_story" }) }],
        ...templateCalls(),
      ],
    },
    { calls: [["list_pages", {}]] },
    /* request 3: the section id comes from what list_pages answered, read from THIS request's turns (the resume digest) */
    (req) => {
      const answers = toolAnswers(req)
      const id = answers.map((a) => a.match(/"id":"(ai_program_list-[a-z0-9-]+)","type":"ai_program_list"/)?.[1]).filter(Boolean).at(-1) ?? null
      seen.bindFrom = id
      return { calls: [["bind_data", { page: "home", sectionId: id ?? "not-seen", prop: "product", kind: "product", ids: [PRODUCT] }]] }
    },
    { calls: [["validate", {}], ["render_check", { page: "home" }], ["render_check", { page: "programs" }], ["render_check", { page: "about" }]] },
    { calls: [["finish", { summary: "A three page site for Iron & Chalk with its own header and footer. Fill in your class times and story." }]] },
  ]
}

async function main() {
  console.log("\n1. the smoke run through the real runner and stepper, scripted model")
  const clock = { t: T0 }
  const seen = { bindFrom: null as string | null }
  const s = scriptedModels(coachSteps(seen), clock)
  const out = mkdtempSync(join(tmpdir(), "storelib-smoke-test-"))
  const lines: string[] = []
  const { report, job, project } = await runSmoke({ models: s.models, capabilities: SMOKE_CAPABILITIES, prompt: SMOKE_PROMPT, mode: "blank", category: "fitness_coach", capUsd: 1, wallMs: 15 * 60_000, outDir: out, now: () => clock.t, sleep: async (ms) => void (clock.t += ms), log: (l) => lines.push(l) })
  check("the job completes", report.status === "complete", { report, tail: lines.slice(-8) })
  check("one model call per runner step, every call counted", report.calls === s.requests.length && report.calls === 9, { calls: report.calls, requests: s.requests.length })
  check("the work crossed requests: three handed over, a fresh stepper each", report.invocations === 3 && report.chained === 2, { invocations: report.invocations, chained: report.chained })
  check("the checkpoint was saved after every call, through JSON", report.checkpointSaves >= report.calls && !!(job.checkpoint as { concept?: { name?: string } } | null)?.concept?.name)
  check("memory between requests: the model's step after a hand over saw what list_pages answered before it", !!seen.bindFrom && project.pages.home.some((x) => x.id === seen.bindFrom && x.settings.product === PRODUCT), { bindFrom: seen.bindFrom })
  check("every request starts from the brief (the creator's words) and the store's real product", s.requests.every((r) => r.turns[0]?.role === "user" && JSON.stringify(r.turns[0]).includes("REQUEST (the creator's words)") && JSON.stringify(r.turns[0]).includes(PRODUCT)))
  check("no write was refused after a hand over (the concept came through)", report.refusedTools === 0, lines.filter((l) => l.includes("REFUSED")))
  check("the report: cost under the cap, tokens counted", report.usd > 0 && report.usd <= report.capUsd && report.inputTokens === 9 * 4_000 && report.outputTokens === 9 * 800, report)
  check("the report: phases in order", JSON.stringify(report.phases) === JSON.stringify(["brief", "plan", "build", "verify", "finish"]), report.phases)
  /* Changed on purpose (round N, N3): a whole site, with the product and collection templates. */
  check("the report: files and pages", report.files.length === 15 && report.files.every((f) => f.startsWith("sections/ai_")) && report.pages.map((p) => p.key).sort().join(",") === "about,collection,home,product,products,programs,search", { files: report.files, pages: report.pages })
  check("the report: validation run again on the result, no errors", report.validation.errors === 0, report.validation)
  check("the report: a slop score", !!report.slop && report.slop.score > 0 && report.slop.score <= 100, report.slop)
  check("the files, pages, settings and events are saved to the scratch folder", report.outDir === out && existsSync(join(out, "sections/ai_coach_hero.storelib")) && readFileSync(join(out, "sections/ai_coach_hero.storelib"), "utf8") === project.files["sections/ai_coach_hero.storelib"] && existsSync(join(out, "pages.json")) && existsSync(join(out, "events.json")))
  const text = describeSmoke(report)
  check("the printed report names calls, cost, phases, files, validation and slop", /Calls: 9 model calls over 3 requests/.test(text) && /Cost: \$/.test(text) && /Phases: brief > plan > build > verify > finish/.test(text) && /Files: sections\/ai_/.test(text) && /Validation: 0 errors/.test(text) && /Slop score: \d+/.test(text), text)
  check("progress lines never carry a file body", !lines.some((l) => l.includes("<template>") || l.includes("<schema>")))
  rmSync(out, { recursive: true, force: true })

  console.log("\n2. the caps")
  {
    const c = { t: T0 }
    const m = scriptedModels(coachSteps({ bindFrom: null }), c)
    const { report: r } = await runSmoke({ models: m.models, capabilities: SMOKE_CAPABILITIES, prompt: SMOKE_PROMPT, capUsd: 0.15, maxOutputTokensPerCall: 2_000, wallMs: 15 * 60_000, now: () => c.t, sleep: async (ms) => void (c.t += ms) })
    check("a spend cap ends the job before a call could pass it, and never above it", ["partial", "failed"].includes(r.status) && r.error === "budget_spend" && r.usd <= 0.15 && r.calls < 9, r)
  }
  {
    const c = { t: T0 }
    const m = scriptedModels(coachSteps({ bindFrom: null }), c)
    const { report: r } = await runSmoke({ models: m.models, capabilities: SMOKE_CAPABILITIES, prompt: SMOKE_PROMPT, capUsd: 1, wallMs: 150_000, now: () => c.t, sleep: async (ms) => void (c.t += ms) })
    check("a wall clock cap ends the job with what was made", ["partial", "failed", "cancelled"].includes(r.status) && r.calls <= 3 && r.wallMs < 15 * 60_000, r)
  }
  {
    const c = { t: T0 }
    const never: Step = { calls: [["list_pages", {}]] }
    const m = scriptedModels(Array.from({ length: 200 }, () => never), c)
    const { report: r } = await runSmoke({ models: m.models, capabilities: SMOKE_CAPABILITIES, prompt: SMOKE_PROMPT, capUsd: 5, wallMs: 60 * 60_000, maxInvocations: 4, now: () => c.t, sleep: async (ms) => void (c.t += ms) })
    check("a chain that never ends is stopped by the request cap (cancelled, said so)", r.status === "cancelled" && r.invocations <= 5, r)
  }
  const lim = smokeLimits({})
  check("default caps: $1, 15 minutes, 12000 output tokens a call", lim.capUsd === 1 && lim.wallMs === 15 * 60_000 && lim.maxOutputTokensPerCall === 12_000, lim)
  const high = smokeLimits({ AI_SMOKE_MAX_USD: "50", AI_SMOKE_MAX_MINUTES: "600", AI_SMOKE_MAX_OUTPUT_TOKENS: "99999" })
  check("caps are bounded: at most $5, 30 minutes, the job's own output cap", high.capUsd === 5 && high.wallMs === 30 * 60_000 && high.maxOutputTokensPerCall === 24_000, high)

  console.log("\n3. the gate")
  const secret = "sk-ant-test-THIS-MUST-NOT-PRINT"
  check("off unless STORELIB_LIVE_AI_SMOKE=1", smokeGate({ ANTHROPIC_API_KEY: secret }).run === false)
  check("off without a provider key", smokeGate({ STORELIB_LIVE_AI_SMOKE: "1" }).run === false && smokeGate({ STORELIB_LIVE_AI_SMOKE: "1", ANTHROPIC_API_KEY: "  " }).run === false)
  const on = smokeGate({ STORELIB_LIVE_AI_SMOKE: "1", ANTHROPIC_API_KEY: secret })
  check("on with both, naming the key by its name only", on.run === true && "keyName" in on && on.keyName === "ANTHROPIC_API_KEY" && !JSON.stringify(on).includes(secret))
  const said: string[] = []
  const off = await liveSmoke({ ANTHROPIC_API_KEY: secret }, (l) => said.push(l))
  check("the script itself does nothing without the switch", off === null && /Skipped: set STORELIB_LIVE_AI_SMOKE=1/.test(said.join("\n")), said)
  const noKey = await liveSmoke({ STORELIB_LIVE_AI_SMOKE: "1" }, (l) => said.push(l))
  check("nor with the switch and no key", noKey === null && /no provider key/.test(said.join("\n")), said)
  check("and never prints the key's value", !said.join("\n").includes(secret))
  const src = readFileSync("scripts/ai-builder/live-smoke.ts", "utf8")
  check("the live script goes through runSmoke (runner + stepper), never runAgentSlice directly, and prints no key value", /runSmoke\(/.test(src) && !/runAgentSlice/.test(src) && !/print\([^)]*\$\{key\}/.test(src) && !/console\.log\([^)]*\bkey\b/.test(src))
}

main()
  .catch((e) => {
    console.error(e)
    failed++
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
      process.exit(1)
    }
  })
