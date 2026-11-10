/**
 * Round R (R4): one scenario through the NATIVE engine, the real way.
 *
 * Start with AI's create route with the agent switched off
 * (AI_BUILDER_AGENT=0: the classic job, "Use the theme" as that path
 * requires), then the job's own steps (lib/website-builder/ai-site/job.ts
 * runUntil) with the deps the runner builds (./runner.ts jobDeps): the real
 * SiteIO writing drafts to this install, the real capabilities reader, the
 * real section schemas and library, and, behind AI_NATIVE_ENGINE (on by
 * default, R2), the native engine with its real readers. Only the model is
 * scripted (./native-answers.ts) and the photo search answers on the eval
 * host (./images.ts). The visual check of the classic job is left out (it
 * needs its own browser; the eval's browser looks instead).
 *
 * With AI_NATIVE_ENGINE=0 the same decisions go through the classic planner
 * and writer, so the two pipelines can be compared.
 */
import type { AiWorld } from "../ai-builder-e2e-kit"
import { installFiles, installPages, installSettings, jobRow, seller } from "../ai-builder-e2e-kit"
import { DECKS } from "./decks"
import { evalOpenverse } from "./images"
import { classicPlan, classicWords, nativeAnswer } from "./native-answers"
import type { EvalScenario } from "@/lib/ai-builder/eval/scenarios"
import type { EvalSite } from "@/lib/ai-builder/eval/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import type { Models } from "@/lib/website-builder/ai-site/models"

const tokens = (s: string) => Math.ceil(s.length / 4)

/** The scripted model of the classic job: the native site, the classic plan, or a section's words. */
export function nativeProvider(answer: () => Record<string, unknown>, plan: () => Record<string, unknown>, words: (user: string, n: number) => string): AgentProvider & { calls: { kind: string }[] } {
  const calls: { kind: string }[] = []
  let writes = 0
  return {
    id: "scripted-native",
    calls,
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      const user = String((req.turns[0] as { content?: string }).content ?? "")
      const tool = req.tools.find((t) => t.name === "submit_native_site" || t.name === "submit_site_plan")
      let toolCalls: ProviderTurn["toolCalls"] = []
      let text = ""
      if (tool) {
        const args = JSON.stringify(tool.name === "submit_native_site" ? answer() : plan())
        toolCalls = [{ id: `t${calls.length + 1}`, name: tool.name, argumentsJson: args }]
        calls.push({ kind: tool.name })
      } else {
        text = words(user, writes++)
        calls.push({ kind: "write" })
      }
      return { text, toolCalls, raw: null, usage: { inputTokens: tokens(req.system) + tokens(user), cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: tokens(text) + tokens(toolCalls[0]?.argumentsJson ?? "") }, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
}

export interface NativeRunOptions {
  /** Live mode: real models. */
  models?: Models
  /** Before the job's photos and check (the site as first placed), the harness may look at it. */
  afterBuild?: (state: { installId: string; jobId: string }) => Promise<void>
}

export async function runNativeScenario(w: AiWorld, sc: EvalScenario, opts: NativeRunOptions = {}): Promise<EvalSite & { person: Awaited<ReturnType<typeof seller>>["person"] }> {
  const deck = DECKS[sc.id]
  const slug = `eval${sc.id}native`
  const owner = await seller(w, slug, sc.products[0])
  for (const extra of sc.products.slice(1)) w.j.db.insert("products", { creator_id: owner.creatorId, title: extra.title, slug: extra.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: "published", type: extra.type, price_cents: extra.priceCents }, {})
  const products = w.j.rows("products").filter((p) => p.creator_id === owner.creatorId).map((p) => ({ id: String(p.id), url: `/products/${String(p.slug)}` }))

  const before = process.env.AI_BUILDER_AGENT
  process.env.AI_BUILDER_AGENT = "0"
  const key = `1b7c1e2a-0000-4000-8000-${String(200000000000 + sc.id.length * 1000 + sc.id.charCodeAt(0)).slice(-12)}`
  const options = { generation: "theme", ...(sc.category ? { category: sc.category } : {}) }
  const made = await w.j.call("POST /api/website-builder/themes/create", { as: owner.person, body: { mode: "ai", prompt: sc.prompt, key, options } })
  process.env.AI_BUILDER_AGENT = before
  if (made.status !== 200 || !made.json?.job?.id) throw new Error(`${sc.id}: create answered ${made.status} ${JSON.stringify(made.json).slice(0, 300)}`)
  const installId = String(made.json.install.id)
  const jobId = String(made.json.job.id)
  /* The create route asked the run route to start; this harness runs the job's steps itself. */
  w.kicks.splice(0, w.kicks.length, ...w.kicks.filter((k) => k.jobId !== jobId))

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { loadJob, saveJob, siteIO } = await import("@/lib/website-builder/ai-site/server")
  const { runStep } = await import("@/lib/website-builder/ai-site/job")
  const { readCapabilities } = await import("@/lib/website-builder/ai-site/capabilities")
  const { readStoreFacts } = await import("@/lib/website-builder/agent/store-facts-server")
  const { ADDABLE_SECTIONS, SECTION_SCHEMAS } = await import("@/lib/website-builder/section-schemas")
  const { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL } = await import("@/lib/website-builder/ai-site/models")
  const { nativeEngineEnabled } = await import("@/lib/website-builder/ai-site/native/flag")
  const { nativeServerDeps } = await import("@/lib/website-builder/ai-site/native/server")
  const { nativeRegistry } = await import("@/lib/website-builder/ai-site/native/registry")
  const admin = createAdminClient() as never

  const native = nativeEngineEnabled()
  const provider = nativeProvider(
    () => nativeAnswer(deck, nativeRegistry(), products),
    () => classicPlan(deck),
    (user, n) => classicWords(deck, user, n),
  )
  const models: Models = opts.models ?? { plan: { provider, model: PLAN_MODEL, effort: "medium" }, write: { provider, model: WRITE_MODEL, effort: "low" }, small: { provider, model: SMALL_MODEL, effort: "low" } }
  let job = await loadJob(admin, jobId)
  if (!job) throw new Error(`${sc.id}: the job was not saved`)
  const deps = {
    models,
    site: siteIO(admin, installId, owner.creatorId),
    capabilities: () => readCapabilities(admin, { creatorId: owner.creatorId, ownerUserId: owner.person.id }, readStoreFacts),
    images: { search: evalOpenverse(sc.id), copy: async (url: string) => ({ ok: true as const, url }) },
    schemas: SECTION_SCHEMAS,
    addable: [...ADDABLE_SECTIONS],
    ...(native ? { native: nativeServerDeps(admin, { creatorId: owner.creatorId, ownerUserId: owner.person.id, installId }) } : {}),
    save: (j: typeof job) => saveJob(admin, j!),
  }
  job = { ...job, status: "running" }
  const steps: string[] = []
  let looked = false
  while (job.step !== "done" && steps.length < 14) {
    if (!looked && job.step === "photos" && opts.afterBuild) {
      looked = true
      await opts.afterBuild({ installId, jobId })
    }
    steps.push(job.step)
    job = await runStep(job, deps as never)
    await saveJob(admin, job)
    if (job.status === "failed") break
  }
  const row = jobRow(w, jobId)
  const pages = Object.entries(installPages(w, installId)).map(([k, p]) => ({ key: k, sections: (p.draft ?? p.sections) as SectionInstance[] }))
  const settings = installSettings(w, installId).draft ?? installSettings(w, installId).settings
  const sources = Object.fromEntries(Object.entries(installFiles(w, installId)).map(([p, f]) => [p, f.draft ?? f.content ?? ""]))
  const caps = await (await import("@/lib/ai-builder/capabilities")).readRuntimeCapabilities(admin, { creatorId: owner.creatorId, ownerUserId: owner.person.id, installId })
  const record = (job.state as { native?: { attempts?: number; sections?: number; issues?: string[]; mapped?: unknown[]; fallback?: string } | null }).native
  const label = native ? (record?.fallback ? "native, R2 engine fell back to the classic planner" : "native, R2 JSON engine (scripted model)") : "native, classic planner and writer (scripted model)"
  return {
    person: owner.person,
    engine: "native",
    engineLabel: opts.models ? `${label.replace(" (scripted model)", "")} (live model)` : label,
    scenario: sc,
    status: job.status === "complete" ? "complete" : job.status === "failed" ? "failed" : "partial",
    installId,
    jobId,
    pages,
    sources,
    settings,
    concept: null,
    template: null,
    capabilities: caps,
    mode: "theme",
    costUsd: Number(row.cost_usd ?? 0) || undefined,
    modelCalls: provider.calls.length,
    notes: [
      `steps ${steps.join(" → ")}; ${provider.calls.filter((c) => c.kind === "write").length} writer calls`,
      ...(record ? [`native: ${record.sections ?? 0} sections in ${record.attempts ?? 0} call(s)${record.issues?.length ? `; ${record.issues.length} issues taken out: ${record.issues.slice(0, process.env.R4_DEBUG ? 20 : 3).join(" | ")}` : ""}${record.mapped?.length ? `; ${record.mapped.length} mapped` : ""}${record.fallback ? `; FELL BACK: ${record.fallback}` : ""}`] : []),
      ...(job.error ? [`error: ${job.error}`] : []),
      ...((job.state as { findings?: { message?: string }[] }).findings ?? []).slice(0, 4).map((f) => `finding: ${String(f.message ?? JSON.stringify(f)).slice(0, 200)}`),
    ],
  }
}
