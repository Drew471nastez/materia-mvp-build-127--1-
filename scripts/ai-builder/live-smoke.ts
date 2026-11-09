/**
 * ONE REAL GENERATION, OPT IN, WITH A HARD SPEND CAP.
 *
 * Runs the agent engine (lib/ai-builder/agent) against Anthropic for real,
 * on an in-memory website (no database is touched), with a fitness coach
 * brief, and prints what it made, what it cost and every check result.
 *
 * It does nothing unless BOTH are true:
 *   STORELIB_LIVE_AI_SMOKE=1
 *   ANTHROPIC_API_KEY is set (never printed)
 *
 *   STORELIB_LIVE_AI_SMOKE=1 ANTHROPIC_API_KEY=... \
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/ai-builder/live-smoke.ts [outDir]
 *
 * Caps: AI_SMOKE_MAX_USD (default 1.50, never above 5), 40 model calls,
 * 15 minutes. A budget hit ends the run partial, which is a valid result.
 * outDir (optional) receives the generated files, pages and settings as JSON.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createAnthropicProvider, anthropicClientFor } from "@/lib/sites/agent/anthropic-provider"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import type { LoopCheckpoint } from "@/lib/ai-builder/agent/state"
import type { AgentDeps } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"

async function main() {
  if (process.env.STORELIB_LIVE_AI_SMOKE !== "1") {
    console.log("Skipped: set STORELIB_LIVE_AI_SMOKE=1 to run one real generation (it costs money).")
    return
  }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.log("Skipped: ANTHROPIC_API_KEY is not set.")
    return
  }
  const cap = Math.min(5, Math.max(0.1, Number(process.env.AI_SMOKE_MAX_USD) || 1.5))
  const provider = createAnthropicProvider(() => anthropicClientFor(key))
  const caps: RuntimeCapabilities = {
    store: { name: "Iron & Chalk", currency: "GBP", brandImage: null, tagline: null },
    products: [{ id: "prod_smoke_8week", title: "8 week strength block", kind: "service", price: "£120", url: "/products/8-week-strength-block" }],
    collections: [],
    communities: [],
    forms: [],
    pages: [],
    menus: [],
    blog: { posts: 0 },
    reviews: { count: 0, average: null },
    features: ["shop"],
  }
  const store = memoryStore({ pages: { home: [] } })
  const deps: AgentDeps = {
    store,
    models: { plan: { provider, model: "claude-opus-5-5", effort: "medium" }, loop: { provider, model: "claude-sonnet-5-5", effort: "low" }, small: { provider, model: "claude-haiku-5-5", effort: "low" }, ownKey: false },
    capabilities: async () => caps,
    emit: (e) => console.log(`  [${e.seq}] ${e.kind}${"tool" in e ? ` ${e.tool} ${e.ok ? "ok" : "REFUSED"}: ${e.summary}` : "phase" in e ? ` ${e.phase}: ${e.label}` : "path" in e ? ` ${e.path}` : "usd" in e ? ` $${e.usd.toFixed(4)}` : ""}`),
  }
  const startedAt = Date.now()
  const budget = { ...DEFAULT_JOB_BUDGET, maxUsd: cap, maxUsdOwnKey: cap, maxIterations: 40, maxWallMs: 15 * 60_000 }
  let checkpoint: LoopCheckpoint | null = null
  let spent = 0
  let seq = 0
  for (let slice = 0; slice < 10; slice++) {
    const r = await runAgentSlice(
      { jobId: "00000000-0000-4000-8000-000000000001", creatorId: "smoke", installId: "smoke", prompt: "A website for my strength coaching studio in Leeds: small group classes, an 8 week program people can buy, and a page about me.", mode: "blank", options: { generation: "blank", category: "fitness_coach" }, budget, startedAt, spentUsd: spent, lastEventSeq: seq },
      checkpoint,
      deps,
      { deadline: Date.now() + budget.perInvocationMs },
    )
    spent = r.totalUsd
    seq = r.events.at(-1)?.seq ?? seq
    checkpoint = r.checkpoint
    if (r.status !== "running") {
      console.log(`\nStatus: ${r.status}${r.stopped ? ` (stopped: ${r.stopped})` : ""}\nSummary: ${r.summary}\nSpent: $${spent.toFixed(4)} of $${cap}, ${checkpoint.iteration} calls, ${Math.round((Date.now() - startedAt) / 1000)}s`)
      break
    }
  }
  console.log(`Files: ${Object.keys(store.project.files).join(", ")}`)
  console.log(`Pages: ${Object.entries(store.project.pages).map(([k, v]) => `${k} (${v.map((s) => s.type).join(", ")})`).join("; ")}`)
  const out = process.argv[2]
  if (out) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, "project.json"), JSON.stringify(store.project, null, 2))
    for (const [p, t] of Object.entries(store.project.files)) {
      mkdirSync(join(out, p, ".."), { recursive: true })
      writeFileSync(join(out, p), t)
    }
    console.log(`Written to ${out}`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
