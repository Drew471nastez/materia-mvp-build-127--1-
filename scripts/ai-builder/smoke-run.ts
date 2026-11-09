/**
 * ===========================================================================
 *  THE SMOKE RUN: ONE NEW WEBSITE THROUGH THE REAL PATH, IN MEMORY (round M)
 * ===========================================================================
 * What production does for an agent job, with the database swapped for
 * memory and nothing else:
 *
 *   runAgentInvocation (lib/website-builder/ai-site/agent-runner.ts)
 *     claims the job, checks cancel and budgets before every call, asks the
 *     stepper for ONE model call at a time, saves the checkpoint after each,
 *     writes the events, and hands over to the next request when its time
 *     is up;
 *   sliceStepper (lib/website-builder/ai-site/agent-engine.ts)
 *     made fresh for every request, as the real factory does, so the only
 *     memory between requests is the checkpoint the runner saved;
 *   MemoryAgentStore (agent-memory-store.ts)
 *     the job row, with the checkpoint through JSON on every save;
 *   memoryStore (lib/ai-builder/agent/memory-store.ts)
 *     the website's files, pages and Theme settings.
 *
 * The old smoke called runAgentSlice in a loop with many iterations a call,
 * one object in memory the whole time: it could not have caught "no memory
 * between steps". This one goes through the seams that bug lived in.
 *
 * The models are given (scripts/ai-builder/live-smoke.ts: Anthropic for
 * real; tests/ai-builder-live-smoke.test.ts: a scripted model). Spend is
 * capped by the job's budget (the loop prices every call's worst case before
 * it starts it, the runner checks between calls) and again here between
 * requests; wall clock by the budget and by `wallMs` here.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { runAgentInvocation, type AgentJobRecord } from "@/lib/website-builder/ai-site/agent-runner"
import { sliceStepper } from "@/lib/website-builder/ai-site/agent-engine"
import { MemoryAgentStore } from "@/lib/website-builder/ai-site/agent-memory-store"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { verify } from "@/lib/ai-builder/agent/loop"
import { readCheckpoint } from "@/lib/ai-builder/agent/state"
import { evaluateSlop } from "@/lib/ai-builder/slop"
import type { AgentDeps, AgentJobInput, AgentModels } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET, type GenerationMode, type JobBudget, type StartCategory } from "@/lib/ai-builder/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"

export const SMOKE_JOB_ID = "00000000-0000-4000-8000-00000000500e"

export interface SmokeOptions {
  models: AgentModels
  capabilities: RuntimeCapabilities
  prompt: string
  mode?: GenerationMode
  category?: StartCategory
  /** Hard spend cap for the whole job, USD. */
  capUsd: number
  /** Hard wall clock for the whole run, ms (also the job's maxWallMs). */
  wallMs: number
  /** Each request's own time (the runner hands over after it). Production: 240 s. */
  perInvocationMs?: number
  maxIterations?: number
  maxOutputTokensPerCall?: number
  /** Requests at most, a guard against a chain that never ends. */
  maxInvocations?: number
  /** Where the generated files, pages and settings are written. Absent: not written. */
  outDir?: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
  /** Extra deps for the loop (a render check, features). */
  deps?: Partial<AgentDeps>
}

export interface SmokeReport {
  status: string
  error: string | null
  summary: string | null
  calls: number
  invocations: number
  /** Requests that ended by handing over to the next one. */
  chained: number
  checkpointSaves: number
  usd: number
  capUsd: number
  inputTokens: number
  outputTokens: number
  wallMs: number
  phases: string[]
  files: string[]
  pages: { key: string; sections: string[] }[]
  validation: { errors: number; warnings: number; codes: string[] }
  slop: { score: number; errors: number; warnings: number } | null
  refusedTools: number
  outDir: string | null
}

/** Whether a live run may start, by NAMES only: no value is read beyond presence, none is printed. */
export function smokeGate(env: Record<string, string | undefined>): { run: true; keyName: string } | { run: false; reason: string } {
  if (env.STORELIB_LIVE_AI_SMOKE !== "1") return { run: false, reason: "Skipped: set STORELIB_LIVE_AI_SMOKE=1 to run one real generation (it costs money)." }
  const keyName = ["ANTHROPIC_API_KEY"].find((k) => typeof env[k] === "string" && env[k]!.trim().length > 0)
  if (!keyName) return { run: false, reason: "Skipped: no provider key (ANTHROPIC_API_KEY) is set." }
  return { run: true, keyName }
}

/** The caps a live run uses, from the environment, bounded. Default $1 and 15 minutes. */
export function smokeLimits(env: Record<string, string | undefined>): { capUsd: number; wallMs: number; maxOutputTokensPerCall: number } {
  const usd = Number(env.AI_SMOKE_MAX_USD)
  const minutes = Number(env.AI_SMOKE_MAX_MINUTES)
  const out = Number(env.AI_SMOKE_MAX_OUTPUT_TOKENS)
  return {
    capUsd: Math.min(5, Math.max(0.05, Number.isFinite(usd) && usd > 0 ? usd : 1)),
    wallMs: Math.min(30, Math.max(1, Number.isFinite(minutes) && minutes > 0 ? minutes : 15)) * 60_000,
    maxOutputTokensPerCall: Math.min(DEFAULT_JOB_BUDGET.maxOutputTokensPerCall, Math.max(2_000, Number.isFinite(out) && out > 0 ? Math.floor(out) : 12_000)),
  }
}

export async function runSmoke(opts: SmokeOptions): Promise<{ report: SmokeReport; job: AgentJobRecord; project: ReturnType<typeof memoryStore>["project"] }> {
  const now = opts.now ?? Date.now
  const log = opts.log ?? (() => undefined)
  const started = now()
  const project = memoryStore({ pages: { home: [] }, settings: {} })
  const rows = new MemoryAgentStore(now)
  const mode = opts.mode ?? "blank"
  const budget: JobBudget = {
    ...DEFAULT_JOB_BUDGET,
    maxUsd: opts.capUsd,
    maxUsdOwnKey: opts.capUsd,
    maxWallMs: opts.wallMs,
    ...(opts.maxIterations ? { maxIterations: opts.maxIterations } : {}),
    ...(opts.perInvocationMs ? { perInvocationMs: opts.perInvocationMs } : {}),
    ...(opts.maxOutputTokensPerCall ? { maxOutputTokensPerCall: opts.maxOutputTokensPerCall } : {}),
  }
  rows.add({ id: SMOKE_JOB_ID, prompt: opts.prompt, mode, options: { generation: mode, ...(opts.category ? { category: opts.category } : {}) }, budget })
  const loopDeps: AgentDeps = { store: project, models: opts.models, capabilities: async () => opts.capabilities, features: { formPicker: true }, ...opts.deps }

  let invocations = 0
  let chained = 0
  let printed = 0
  const maxInvocations = opts.maxInvocations ?? 40
  const say = () => {
    for (const e of rows.events.slice(printed)) log(eventLine(e.kind, e.payload))
    printed = rows.events.length
  }
  for (;;) {
    const job = rows.jobs.get(SMOKE_JOB_ID)!
    if (["complete", "partial", "failed", "cancelled"].includes(job.status)) break
    /* Our own caps, between requests: the runner's are inside one. */
    if (now() - started >= opts.wallMs || job.run.usage.usd >= opts.capUsd || invocations >= maxInvocations) {
      log(`  (smoke: ${now() - started >= opts.wallMs ? "wall clock" : invocations >= maxInvocations ? "request" : "spend"} cap reached, cancelling)`)
      rows.cancel(SMOKE_JOB_ID)
    }
    invocations += 1
    const r = await runAgentInvocation(SMOKE_JOB_ID, {
      store: rows,
      /* A new stepper per request, as lib/website-builder/ai-site/agent-engine.ts's factory makes one per request. */
      stepperFor: async () => sliceStepper(loopDeps, now),
      now,
      ...(opts.sleep ? { sleep: opts.sleep } : {}),
      started: now(),
      kick: async () => true,
      log: (m) => log(`  [runner] ${m}`),
    })
    say()
    if (r.outcome === "chained") {
      chained += 1
      continue
    }
    if (r.outcome !== "ended") {
      log(`  (smoke: the request answered ${r.outcome}; stopping)`)
      break
    }
  }

  const job = rows.jobs.get(SMOKE_JOB_ID)!
  /* The same checks finish runs, once more on what is there now. */
  const cp = readCheckpoint(job.checkpoint)
  const input: AgentJobInput = { jobId: job.id, creatorId: job.creatorId, installId: job.installId, prompt: job.prompt, mode, options: { generation: mode, ...(opts.category ? { category: opts.category } : {}) }, budget, startedAt: started, spentUsd: job.run.usage.usd, lastEventSeq: job.lastEventSeq }
  const issues = cp ? await verify(input, loopDeps, cp).catch(() => []) : []
  const own = Object.entries(project.project.files).filter(([p]) => /^(sections|blocks|snippets)\/ai_/.test(p))
  const slop = own.length ? evaluateSlop({ sources: own.map(([path, content]) => ({ path, content })) }, cp?.concept ?? null) : null
  const phases: string[] = []
  for (const e of rows.events) if (e.kind === "phase") phases.push(String(e.payload.phase))

  let outDir: string | null = null
  if (opts.outDir) {
    outDir = opts.outDir
    mkdirSync(outDir, { recursive: true })
    for (const [p, text] of Object.entries(project.project.files)) {
      mkdirSync(dirname(join(outDir, p)), { recursive: true })
      writeFileSync(join(outDir, p), text)
    }
    writeFileSync(join(outDir, "pages.json"), JSON.stringify(project.project.pages, null, 2))
    writeFileSync(join(outDir, "settings.json"), JSON.stringify(project.project.settings, null, 2))
    writeFileSync(join(outDir, "events.json"), JSON.stringify(rows.events.map((e) => ({ seq: e.seq, kind: e.kind, ...e.payload })), null, 2))
  }

  const errors = issues.filter((i) => i.severity === "error")
  const report: SmokeReport = {
    status: job.status,
    error: job.run.errorCode,
    summary: job.run.summary,
    calls: job.run.usage.iterations,
    invocations,
    chained,
    checkpointSaves: rows.checkpointSaves,
    usd: Math.round(job.run.usage.usd * 10_000) / 10_000,
    capUsd: opts.capUsd,
    inputTokens: job.run.usage.inputTokens,
    outputTokens: job.run.usage.outputTokens,
    wallMs: now() - started,
    phases: phases.filter((p, i) => p !== phases[i - 1]),
    files: Object.keys(project.project.files).sort(),
    pages: Object.entries(project.project.pages).map(([key, sections]) => ({ key, sections: sections.map((s) => `${s.type}${s.group ? `(${s.group})` : ""}`) })),
    validation: { errors: errors.length, warnings: issues.length - errors.length, codes: [...new Set(errors.map((i) => i.code))].slice(0, 12) },
    slop: slop ? { score: slop.score, errors: slop.counts.error, warnings: slop.counts.warn } : null,
    refusedTools: rows.events.filter((e) => e.kind === "tool" && e.payload.ok === false).length,
    outDir,
  }
  return { report, job, project: project.project }
}

/** One event as a short line: never a file body, a prompt or a key. */
function eventLine(kind: string, p: Record<string, unknown>): string {
  switch (kind) {
    case "tool":
      return `  ${p.ok === false ? "REFUSED" : "ok     "} ${String(p.summary ?? p.tool)}`
    case "phase":
      return `  -- ${String(p.phase)}: ${String(p.label ?? "")}`
    case "file":
      return `  file ${String(p.action)} ${String(p.path)} (${String(p.bytes)} bytes)`
    case "page":
      return `  page ${String(p.action)} ${String(p.page)}`
    case "spend":
      return `  spend $${Number(p.usd ?? 0).toFixed(4)} (in ${String(p.inputTokens)}, out ${String(p.outputTokens)})`
    case "validation":
      return `  checks: ${String(p.errors)} errors, ${String(p.warnings)} warnings`
    case "finished":
      return `  finished: ${String(p.status)}${p.stopped ? ` (${String(p.stopped)})` : ""}`
    default:
      return `  ${kind}${p.message ? `: ${String(p.message).slice(0, 160)}` : p.text ? `: ${String(p.text).slice(0, 160)}` : ""}`
  }
}

/** The report as a few lines for a terminal. */
export function describeSmoke(r: SmokeReport): string {
  return [
    `Status: ${r.status}${r.error ? ` (${r.error})` : ""}`,
    `Calls: ${r.calls} model calls over ${r.invocations} requests (${r.chained} handed over), ${r.checkpointSaves} checkpoint saves`,
    `Cost: $${r.usd.toFixed(4)} of a $${r.capUsd.toFixed(2)} cap (${r.inputTokens} in, ${r.outputTokens} out), ${Math.round(r.wallMs / 1000)}s`,
    `Phases: ${r.phases.join(" > ") || "(none)"}`,
    `Files: ${r.files.join(", ") || "(none)"}`,
    `Pages: ${r.pages.map((p) => `${p.key} [${p.sections.join(", ")}]`).join("; ") || "(none)"}`,
    `Validation: ${r.validation.errors} errors, ${r.validation.warnings} warnings${r.validation.codes.length ? ` (${r.validation.codes.join(", ")})` : ""}`,
    `Slop score: ${r.slop ? `${r.slop.score} (${r.slop.errors} errors, ${r.slop.warnings} warnings)` : "n/a (no component written)"}`,
    `Refused tool calls: ${r.refusedTools}`,
    r.summary ? `Summary: ${r.summary}` : "",
    r.outDir ? `Files saved to: ${r.outDir}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
