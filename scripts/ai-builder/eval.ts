/**
 * ===========================================================================
 *  THE AI WEBSITE EVALUATION, ON DEMAND (round R, R4)
 * ===========================================================================
 * Six businesses (lib/ai-builder/eval/scenarios.ts) through both engines,
 * every site held to the same checks (lib/ai-builder/eval/checks.ts), and a
 * report page with desktop and phone screenshots (lib/ai-builder/eval/
 * report.ts). The database is the in-memory one the journey suites use
 * (tests/_journey): nothing real is written, nothing is published anywhere.
 *
 *   node scripts/ai-builder/eval.mjs [--out DIR] [--scenarios a,b] [--engines agent,native]
 *       SCRIPTED (default): the model is a script (tests/_eval). Free, no key.
 *       Measures the system, not model quality.
 *
 *   STORELIB_LIVE_AI_EVAL=1 ANTHROPIC_API_KEY=... node scripts/ai-builder/eval.mjs --live [--out DIR]
 *       LIVE: the same scenarios on the real provider (Claude: plan and build
 *       on claude-opus-5-5, loop on claude-sonnet-5-5, small on
 *       claude-haiku-5-5, as production routes them). It refuses unless both
 *       are set, and it never runs in CI (CI set). Spend caps, enforced
 *       before every model call by the wrapper below, counted from the
 *       provider's reported tokens at the platform's prices
 *       (lib/sites/agent/models.ts costOf):
 *         AI_EVAL_MAX_USD           the whole run (default 20, at most 150)
 *         AI_EVAL_MAX_USD_PER_SITE  one site (default 15, at most 40)
 *       A cap reached ends that site's job where it is (reported as such)
 *       and the rest of the run is "not run: spend cap". Pictures stay the
 *       eval's stand-ins (no image spend). The key is read from the
 *       environment by name and never printed.
 *
 * The launcher (./eval.mjs) compiles this file with the project's tsc and
 * runs it with the push suites' loader (scripts/push-test-loader.mjs), as the
 * journey suites run: the route handlers need its next/headers stand-in.
 */
const realFetch = globalThis.fetch
import "../../tests/_journey/env"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync } from "node:fs"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import type { AgentModels } from "@/lib/ai-builder/agent/ports"
import type { Models } from "@/lib/website-builder/ai-site/models"
import type { EvalEngine } from "@/lib/ai-builder/eval/types"
import type { EvalScenarioId } from "@/lib/ai-builder/eval/scenarios"

process.env.AI_JOB_SECRET = process.env.AI_JOB_SECRET || "eval-ai-job-secret-local-only"
/* The agent's own visual critic stays off inside the job (the eval's browser looks at every site instead). */
process.env.CHROMIUM_PATH = "/nonexistent/chromium-for-the-agent"

export interface LiveGate {
  ok: boolean
  reason: string
}

/** Whether a live run may start, by name only (no value is read out loud). */
export function liveGate(env: Record<string, string | undefined>): LiveGate {
  if (env.CI) return { ok: false, reason: "Refused: a live evaluation never runs in CI (CI is set)." }
  if (env.STORELIB_LIVE_AI_EVAL !== "1") return { ok: false, reason: "Refused: set STORELIB_LIVE_AI_EVAL=1 to run the live evaluation (it costs money)." }
  if (!(env.ANTHROPIC_API_KEY ?? "").trim()) return { ok: false, reason: "Refused: no provider key (ANTHROPIC_API_KEY) is set." }
  return { ok: true, reason: "" }
}

export function liveCaps(env: Record<string, string | undefined>): { totalUsd: number; perSiteUsd: number } {
  const n = (v: string | undefined, d: number, max: number) => {
    const x = Number(v)
    return Math.min(max, Math.max(0.5, Number.isFinite(x) && x > 0 ? x : d))
  }
  return { totalUsd: n(env.AI_EVAL_MAX_USD, 20, 150), perSiteUsd: n(env.AI_EVAL_MAX_USD_PER_SITE, 15, 40) }
}

/** A provider that refuses a call once a cap is reached, and counts what each call cost. */
export function capped(inner: AgentProvider, meter: { total: number; site: number; caps: { totalUsd: number; perSiteUsd: number } }, costOf: (model: string, req: ProviderRequest, turn: ProviderTurn) => number): AgentProvider {
  return {
    id: inner.id,
    async complete(req) {
      if (meter.total >= meter.caps.totalUsd) throw new Error(`The evaluation's spend cap ($${meter.caps.totalUsd}) is reached.`)
      if (meter.site >= meter.caps.perSiteUsd) throw new Error(`This site's spend cap ($${meter.caps.perSiteUsd}) is reached.`)
      const turn = await inner.complete(req)
      const usd = costOf(req.model, req, turn)
      meter.total += usd
      meter.site += usd
      return turn
    },
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const live = process.argv.includes("--live")
  const out = arg("--out") ?? join(tmpdir(), `storelib-ai-eval-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`)
  const scenarios = arg("--scenarios")?.split(",") as EvalScenarioId[] | undefined
  const engines = arg("--engines")?.split(",") as EvalEngine[] | undefined
  mkdirSync(out, { recursive: true })
  let liveOpts: NonNullable<Parameters<typeof import("../../tests/_eval/run").runEval>[0]>["live"]
  if (live) {
    const gate = liveGate(process.env)
    if (!gate.ok) {
      console.log(gate.reason)
      process.exit(2)
    }
    const caps = liveCaps(process.env)
    const meter = { total: 0, site: 0, caps }
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const { createAnthropicProvider } = await import("@/lib/sites/agent/anthropic-provider")
    const { costOf } = await import("@/lib/sites/agent/models")
    const { PLAN_MODEL, WRITE_MODEL, SMALL_MODEL } = await import("@/lib/website-builder/ai-site/models")
    /* The real fetch, taken before the journey fences the network: only the provider's calls go out. */
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: realFetch, maxRetries: 1 })
    const provider = capped(createAnthropicProvider(() => client), meter, (model, _req, turn) => costOf(model, turn.usage).usd)
    console.log(`LIVE: caps $${caps.totalUsd} for the run, $${caps.perSiteUsd} per site.`)
    liveOpts = {
      maxUsd: caps.totalUsd,
      spent: () => meter.total,
      agent: async (): Promise<AgentModels> => {
        meter.site = 0
        return { plan: { provider, model: PLAN_MODEL, effort: "medium" }, loop: { provider, model: WRITE_MODEL, effort: "medium" }, write: { provider, model: PLAN_MODEL, effort: "high" }, small: { provider, model: SMALL_MODEL, effort: "low" }, ownKey: false }
      },
      native: async (): Promise<Models> => {
        meter.site = 0
        return { plan: { provider, model: PLAN_MODEL, effort: "medium" }, write: { provider, model: WRITE_MODEL, effort: "low" }, small: { provider, model: SMALL_MODEL, effort: "low" } }
      },
    }
  }
  const { runEval } = await import("../../tests/_eval/run")
  const t0 = Date.now()
  const r = await runEval({ outDir: out, ...(scenarios ? { scenarios } : {}), ...(engines ? { engines } : {}), ...(liveOpts ? { live: liveOpts } : {}) })
  const counts = { pass: 0, warn: 0, fail: 0, pending: 0 } as Record<string, number>
  for (const x of r.results) for (const c of x.checks) counts[c.status] = (counts[c.status] ?? 0) + 1
  console.log(`\n${r.results.length} sites, ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail, ${counts.pending} not run, in ${Math.round((Date.now() - t0) / 1000)} s (wall clock, fake job clock aside).`)
  for (const x of r.results) for (const c of x.checks) if (c.status === "fail") console.log(`  FAIL ${x.site.engine} ${x.site.scenario.id} ${c.id}: ${c.detail.slice(0, 300)}`)
  console.log(`Report: ${r.reportPath}`)
  if (r.serverErrors.length) console.log(`Server errors: ${JSON.stringify(r.serverErrors).slice(0, 600)}`)
  process.exit(0)
}

if (process.argv[1] && /eval\.(?:js|ts)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
