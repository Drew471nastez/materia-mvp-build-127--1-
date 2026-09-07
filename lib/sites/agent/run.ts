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
import { completeExchange, startExchange, type ChatStep } from "../chat"
import { listAssets } from "../assets"
import { describeManifest, mergeManifest, readManifest, writeManifest } from "../manifest"
import { describeProject } from "./context"
import { classifyIntent, intentInstruction } from "./intent"
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

  /**
   * THE PROMPT IS SAVED BEFORE ANYTHING IS ATTEMPTED.
   *
   * Not after the quota check, not after the files load, not at the end with
   * the reply — first. Everything below this line can fail, and on every one
   * of those paths the creator's sentence stays in the transcript where they
   * can see what they asked for and try again.
   */
  const userMessageId = await startExchange({ siteId, prompt })

  /**
   * Every early exit answers the question it just recorded, so the transcript
   * never holds a prompt with nothing after it. Written as a helper because
   * there are four such exits and one of them being forgotten is exactly how
   * a dangling prompt gets shipped.
   */
  const failEarly = async (message: string): Promise<AgentEvent> => {
    await completeExchange({
      siteId,
      userMessageId,
      runId: null,
      reply: "",
      steps: [],
      filesChanged: [],
      versionId: null,
      error: message,
    }).catch(() => {})
    return { type: "error", message }
  }

  const quota = await monthlyQuotaError(creatorId, plan)
  if (quota) {
    yield await failEarly(quota)
    return
  }

  const files = await readProject(siteId)
  if (Object.keys(files).length === 0) {
    yield await failEarly("This site has no files to edit.")
    return
  }

  const model = chooseModel(prompt, Object.keys(files).length)
  const admin = createAdminClient()

  const versionId = await snapshot(siteId, files, prompt)
  const runId = await openRun({ siteId, creatorId, versionId, prompt, provider: provider.id, model })
  if (!runId) {
    yield await failEarly("Could not start. Try again.")
    return
  }

  yield { type: "started", runId, versionId, model }

  const workspace = new ProjectWorkspace(files)

  /**
   * WHAT THE AGENT KNOWS BEFORE IT STARTS.
   *
   * Two halves, and the split is deliberate. The manifest holds what cannot be
   * read out of the code — the business, the audience, decisions already made.
   * The facts are derived from the files THIS RUN, so the palette and the
   * component list in the prompt are the real ones and cannot describe a
   * design that has since been changed.
   *
   * Reading the manifest is allowed to fail: it lives in a column added by a
   * migration this project applies by hand, so a database without it yet means
   * the agent works with derived facts alone — which is still far more than
   * the single sentence it used to get.
   */
  const [manifest, assets] = await Promise.all([
    readManifest(siteId).catch(() => null),
    listAssets(siteId).catch(() => []),
  ])
  const intent = classifyIntent(prompt)
  const context = {
    manifest: describeManifest(manifest),
    facts: describeProject(files, assets),
    intent: intentInstruction(intent),
  }

  // The loop's events are forwarded as they happen; its RETURN value is the
  // verdict. `for await` would discard the return, so the iterator is driven
  // by hand.
  //
  // The tool steps are collected on the way past, because the transcript has
  // to show what the model DID and not only what it said — "read Hero.tsx,
  // edited Hero.tsx, built the site" is the part a creator scrolls back for.
  const steps: ChatStep[] = []

  /**
   * STOP IS A ROW, NOT A SOCKET.
   *
   * The caller's `signal` used to be the browser's connection, so locking a
   * phone or switching apps aborted the run — and because the files are saved
   * in one go at the end, the work vanished. The connection is no longer
   * allowed to decide.
   *
   * Cancelling therefore has to survive leaving one request and arriving in
   * another: the Stop button writes `cancel_requested` and this reads it
   * between turns. A module-scope Map would work perfectly in development and
   * never in production, where the process that reads the flag is rarely the
   * one that wrote it.
   *
   * Between turns, not inside one: a turn is a single model call plus its
   * tools, and tearing that in half is how a half-written file happens.
   */
  const cancelled = new AbortController()
  const stopIfCancelled = async () => {
    const { data } = await admin
      .from("site_agent_runs")
      .select("cancel_requested")
      .eq("id", runId)
      .maybeSingle()
    if ((data as { cancel_requested: boolean } | null)?.cancel_requested) cancelled.abort()
  }

  // An external signal still stops the run — the route no longer passes the
  // request's, but a test or a future caller may pass a real one.
  if (signal) signal.addEventListener("abort", () => cancelled.abort(), { once: true })

  const loop = agentLoop({ provider, model, prompt, workspace, esbuild, context, signal: cancelled.signal })
  let step = await loop.next()
  while (!step.done) {
    if (step.value.type === "tool") steps.push({ name: step.value.name, detail: step.value.detail })
    yield step.value
    await stopIfCancelled()
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

    /**
     * Project memory is committed with the work, not before it.
     *
     * A run that failed or was stopped saved no files, and a note describing
     * changes that were never written would make the next run reason about a
     * site that does not exist. Failing to save the note is not worth failing
     * the run over — the edit is the thing the creator asked for.
     */
    if (status === "succeeded" && workspace.manifestUpdate) {
      await writeManifest(siteId, mergeManifest(manifest, workspace.manifestUpdate)).catch(() => false)
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
   *
   * If the save fails, the run is still recorded with its final status and
   * error — the files are written and paid for — but the user sees nothing
   * and the transcript will be there when they refresh. Still not good, but
   * it is not silent loss.
   */
  try {
    await completeExchange({
      siteId,
      userMessageId,
      runId,
      reply: result.message || (status === "failed" ? "" : "Done."),
      steps,
      filesChanged: changedFiles,
      versionId,
      error: status === "failed" ? error : null,
    })
  } catch (e) {
    /**
     * The exchange went unsaved. The run itself is recorded, so a refresh
     * will show the files written (proof it happened) even though the
     * transcript is missing. A rare failure at the database layer.
     */
    yield {
      type: "message",
      text: `(The conversation did not save, but the edit went through. Refresh the page to see the transcript and the changed files.)`,
    }
  }

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

  /**
   * A restore that only WRITES is not a restore.
   *
   * The snapshot is what the project looked like before the run. If the agent
   * created files, writing the snapshot back leaves them there — still on
   * disk, still imported by whatever referenced them, so "undo" hands back a
   * project that is neither the old one nor the new one. The build may even
   * fail on an import the old code never had.
   *
   * Deleted first, so the write below lands on a tree that matches the
   * snapshot exactly.
   */
  const supabaseForPaths = await createClient()
  const { data: currentRows } = await supabaseForPaths
    .from("site_files")
    .select("path")
    .eq("site_id", siteId)

  const orphans = ((currentRows as Array<{ path: string }> | null) ?? [])
    .map((row) => row.path)
    .filter((path) => files[path] === undefined)

  if (orphans.length > 0) {
    // RLS applies — a site the caller does not own has no rows to delete.
    await supabaseForPaths.from("site_files").delete().eq("site_id", siteId).in("path", orphans)
  }

  const saved = await saveFiles(siteId, files)
  if (!saved.ok) return { ok: false, error: saved.error }
  return { ok: true, paths: [...Object.keys(files), ...orphans] }
}
