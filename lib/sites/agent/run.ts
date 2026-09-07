import "server-only"

/**
 * One agent run, end to end: quota, snapshot, the loop, the save, the record.
 *
 * The DECISIONS are all in ./loop — the turn cap, the build gate, what counts
 * as a refusal — so they can be driven by a test with a scripted provider.
 * What is left here is the order things happen in, and that order is itself
 * the safety story:
 *
 *   1. QUOTA, before any token is spent. A limit enforced after the request is
 *      a limit that bills you for the request it refused.
 *   2. SNAPSHOT, before the first edit. Taken after, it has already lost the
 *      version somebody wants back.
 *   3. THE LOOP.
 *   4. SAVE, only what changed, through the same validation and RLS a human
 *      edit uses — and only if the loop succeeded.
 *   5. RECORD, with tokens as the provider reported them.
 *
 * Step 5 runs even when 3 or 4 fail. A run that cost money and left no row is
 * a bill nobody can explain.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { appendExchange, type ChatStep } from "../chat"
import { siteLimits, type SitePlan } from "../plan"
import { readProject, saveFiles } from "../projects"
import type { ProjectFiles } from "../types"
import { agentLoop } from "./loop"
import { chooseModel, costOf } from "./models"
import { ProjectWorkspace } from "./tools"
import type { AgentEvent, AgentProvider } from "./types"

export interface RunInput {
  siteId: string
  creatorId: string
  plan: SitePlan
  prompt: string
  provider: AgentProvider
  /** esbuild for `run_build`. Injected — the route owns initialisation. */
  esbuild: unknown
  signal?: AbortSignal
}

/** Null when another edit is allowed, otherwise why not — in the user's words. */
export async function monthlyQuotaError(creatorId: string, plan: SitePlan): Promise<string | null> {
  const limit = siteLimits(plan).aiEditsPerMonth
  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)

  // The admin client, because site_agent_runs has no INSERT/UPDATE policy and
  // a creator counting their own usage through RLS could not see runs on a
  // site they have since deleted — which is exactly the loophole.
  const admin = createAdminClient()
  const { count } = await admin
    .from("site_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .gte("created_at", since.toISOString())

  if ((count ?? 0) < limit) return null
  return `You have used all ${limit} AI edits this month on your plan. They reset on the 1st.`
}

export async function* runAgent(input: RunInput): AsyncGenerator<AgentEvent> {
  const { siteId, creatorId, plan, prompt, provider, esbuild, signal } = input

  const quota = await monthlyQuotaError(creatorId, plan)
  if (quota) {
    yield { type: "error", message: quota }
    return
  }

  const files = await readProject(siteId)
  if (Object.keys(files).length === 0) {
    yield { type: "error", message: "This site has no files to edit." }
    return
  }

  const model = chooseModel(prompt, Object.keys(files).length)
  const admin = createAdminClient()

  const versionId = await snapshot(siteId, files, prompt)
  const runId = await openRun({ siteId, creatorId, versionId, prompt, provider: provider.id, model })
  if (!runId) {
    yield { type: "error", message: "Could not start. Try again." }
    return
  }

  yield { type: "started", runId, versionId, model }

  const workspace = new ProjectWorkspace(files)

  // The loop's events are forwarded as they happen; its RETURN value is the
  // verdict. `for await` would discard the return, so the iterator is driven
  // by hand.
  //
  // The tool steps are collected on the way past, because the transcript has
  // to show what the model DID and not only what it said — "read Hero.tsx,
  // edited Hero.tsx, built the site" is the part a creator scrolls back for.
  const steps: ChatStep[] = []
  const loop = agentLoop({ provider, model, prompt, workspace, esbuild, signal })
  let step = await loop.next()
  while (!step.done) {
    if (step.value.type === "tool") steps.push({ name: step.value.name, detail: step.value.detail })
    yield step.value
    step = await loop.next()
  }
  const result = step.value

  let status = result.status
  let error = result.error
  let changedFiles: string[] = []

  if (status === "succeeded") {
    const changed = workspace.changedFiles()
    if (Object.keys(changed).length > 0) {
      const saved = await saveFiles(siteId, changed)
      if (!saved.ok) {
        status = "failed"
        error = saved.error
      } else {
        changedFiles = [...workspace.changed]
        yield { type: "files", paths: changedFiles }
      }
    }
  }

  const cost = costOf(model, result.usage)

  await admin
    .from("site_agent_runs")
    .update({
      status,
      input_tokens: result.usage.inputTokens,
      cached_input_tokens: result.usage.cachedInputTokens,
      cache_write_tokens: result.usage.cacheWriteTokens,
      output_tokens: result.usage.outputTokens,
      cost_usd: cost.usd,
      turns: result.turns,
      files_changed: changedFiles,
      error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)

  /**
   * The transcript is written on EVERY path out, including failures.
   *
   * A conversation that silently drops its failed exchanges is one where
   * nobody can see the model got the same thing wrong three times — and the
   * creator reopening the site would find their question missing entirely.
   */
  await appendExchange({
    siteId,
    runId,
    prompt,
    reply: result.message || (status === "failed" ? "" : "Done."),
    steps,
    filesChanged: changedFiles,
    versionId,
    error: status === "failed" ? error : null,
  })

  if (status === "failed") {
    yield { type: "error", message: error ?? "The edit failed." }
    return
  }

  if (result.message) yield { type: "message", text: result.message }
  yield { type: "done", runId, costUsd: cost.usd, turns: result.turns, filesChanged: changedFiles }
}

/**
 * The whole project, before anything is touched.
 *
 * A failure here is not fatal to the run — a missing snapshot costs undo, not
 * the edit — but the run row records `version_id: null` so it is visible that
 * this one cannot be rolled back.
 */
async function snapshot(siteId: string, files: ProjectFiles, label: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await createAdminClient()
    .from("site_versions")
    .insert({
      site_id: siteId,
      snapshot: files,
      label: label.slice(0, 120),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single()

  return (data as { id: string } | null)?.id ?? null
}

async function openRun(row: {
  siteId: string
  creatorId: string
  versionId: string | null
  prompt: string
  provider: string
  model: string
}): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("site_agent_runs")
    .insert({
      site_id: row.siteId,
      creator_id: row.creatorId,
      version_id: row.versionId,
      prompt: row.prompt,
      provider: row.provider,
      model: row.model,
      status: "running",
    })
    .select("id")
    .single()

  return (data as { id: string } | null)?.id ?? null
}

/**
 * Put a site back the way a snapshot found it.
 *
 * Snapshots without a restore are a promise nobody can collect on: "the AI
 * broke my site" needs a button, not a row in a table. Every file in the
 * snapshot is written back through `saveFiles`, so the restore obeys the same
 * validation and the same RLS an ordinary edit does.
 */
export type RestoreResult = { ok: true; paths: string[] } | { ok: false; error: string }

export async function restoreVersion(siteId: string, versionId: string): Promise<RestoreResult> {
  const supabase = await createClient()

  // Read through the USER's client, not the admin one: RLS is what proves the
  // caller owns this version, and the admin client would restore anybody's.
  const { data } = await supabase
    .from("site_versions")
    .select("id, site_id, snapshot")
    .eq("id", versionId)
    .eq("site_id", siteId)
    .maybeSingle()

  const row = data as { snapshot: ProjectFiles } | null
  if (!row?.snapshot) return { ok: false, error: "That version is not available." }

  const files = row.snapshot
  if (typeof files !== "object" || Array.isArray(files) || Object.keys(files).length === 0) {
    return { ok: false, error: "That version is empty and cannot be restored." }
  }

  const saved = await saveFiles(siteId, files)
  if (!saved.ok) return { ok: false, error: saved.error }
  return { ok: true, paths: Object.keys(files) }
}
