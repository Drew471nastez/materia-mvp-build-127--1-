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
import {
  describeManifest,
  manifestIsThin,
  mergeManifest,
  readManifest,
  seedManifest,
  writeManifest,
} from "../manifest"
import { describeProject } from "./context"
import { classifyIntent, intentInstruction } from "./intent"
import { budgetInstruction, classifyComplexity } from "./complexity"
import { formatTypeErrors, typecheckProject } from "../typecheck"
import { formatRenderFailure, renderCheck } from "../render-check"
import { siteLimits, type SitePlan } from "../plan"
import { readProject, saveFiles } from "../projects"
import { readDocument, writeDocument } from "../document/store"
import { isGenerated } from "../document/render"
import type { ProjectFiles } from "../types"
import { agentLoop, isEmptySite } from "./loop"
import { createAsker } from "./asking"
import { chooseModel, costOf } from "./models"
import { ProjectWorkspace } from "./tools"
import type { AgentEvent, AgentProvider } from "./types"
import { routeUser } from "@/lib/auth/route-user"

export interface RunInput {
  siteId: string
  creatorId: string
  plan: SitePlan
  prompt: string
  provider: AgentProvider
  /**
   * The model id, in that provider's vocabulary.
   *
   * A FUNCTION, not a string, because the two inputs to that decision live in
   * different places: which VENDOR is answering is the route's business, and
   * how big the project is, is only known here — the files are loaded a few
   * lines below. Passing a plain id would have meant the route calling
   * `chooseTier(prompt, 0)` and silently dropping the rule that a change in a
   * thirty-file project is unlikely to stay in one file.
   */
  pickModel?: (fileCount: number) => string
  /** esbuild for `run_build`. Injected — the route owns initialisation. */
  esbuild: unknown
  signal?: AbortSignal
  /** When the route was asked (ms since the epoch): the platform's 300 seconds count from there, not from here. */
  requestStartedAt?: number
}

/** Null when another edit is allowed, otherwise why not — in the user's words. */
/**
 * What the agent route gives a run, matching its `maxDuration = 300`. Written
 * here as well because this is where it is spent, and a wait computed against
 * a number nobody updated is a wait that outlives its own function.
 */
const RUN_BUDGET_MS = 300_000

/**
 * Held back from any wait, for the part that cannot be skipped: finishing the
 * edits, building, typechecking, rendering and writing the files. A run killed
 * during this saves nothing, so it is reserved rather than borrowed against.
 */
const BUILD_RESERVE_MS = 120_000

/** A model call still in flight this long before the end is given up on (its turn has written nothing yet). */
const TURN_HARD_STOP_MS = 60_000

export async function monthlyQuotaError(creatorId: string, plan: SitePlan, providerId = ""): Promise<string | null> {
  /* On their own AI there is no monthly allowance to run out of: the plan's AI edits are Storelib's. */
  if (providerId.startsWith("own:")) return null
  const limit = siteLimits(plan).aiEditsPerMonth
  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)

  // The admin client, because site_agent_runs has no INSERT/UPDATE policy and
  // a creator counting their own usage through RLS could not see runs on a
  // site they have since deleted — which is exactly the loophole.
  const admin = createAdminClient()
  /* Runs on the creator's own AI (provider "own:…") are theirs to pay for and do not count. */
  const { count } = await admin
    .from("site_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .gte("created_at", since.toISOString())
    .not("provider", "like", "own:%")

  if ((count ?? 0) < limit) return null
  return `You have used all ${limit} AI edits this month on your plan. They reset on the 1st, or connect your own AI (Website settings, Connections) to keep going on your account.`
}

export async function* runAgent(input: RunInput): AsyncGenerator<AgentEvent> {
  const { siteId, creatorId, plan, prompt, provider, esbuild, signal, requestStartedAt } = input

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
      questions: [],
      filesChanged: [],
      versionId: null,
      error: message,
    }).catch(() => {})
    return { type: "error", message }
  }

  const quota = await monthlyQuotaError(creatorId, plan, provider.id)
  if (quota) {
    yield await failEarly(quota)
    return
  }

  const files = await readProject(siteId)
  if (Object.keys(files).length === 0) {
    yield await failEarly("This site has no files to edit.")
    return
  }

  /**
   * FROM THE CALLER when it has an opinion, which it does now that there are
   * two vendors: a model id is one vendor's name for a difficulty, and
   * `chooseModel` only knows OpenAI's. Handing an OpenAI id to Anthropic is a
   * 404 at the first call, after the snapshot and the run row are already
   * written.
   *
   * The fallback keeps this file vendor-free — no provider import reaches
   * here — and keeps every existing caller working unchanged.
   */
  const model =
    input.pickModel?.(Object.keys(files).length) ??
    chooseModel(prompt, Object.keys(files).length)
  const admin = createAdminClient()

  const versionId = await snapshot(siteId, files, prompt)
  const runId = await openRun({ siteId, creatorId, versionId, prompt, provider: provider.id, model })

  /**
   * When this run has to be building rather than waiting.
   *
   * Taken AFTER the run is opened, not at the top of the function: everything
   * before this point — the ownership check, the quota, the snapshot — has
   * already spent wall-clock time the route's budget was measured from, and a
   * deadline that ignored it would promise time that is not there.
   */
  const startedAt = Date.now()
  if (!runId) {
    yield await failEarly("Could not start. Try again.")
    return
  }

  yield { type: "started", runId, versionId, model }

  /**
   * The site's canonical layout, when it has one.
   *
   * Null for every site built before documents existed. Those keep working as
   * code projects — the agent simply does not see the structured tools, which
   * is better than offering edits that cannot apply.
   */
  const document = await readDocument(siteId).catch(() => null)

  const workspace = new ProjectWorkspace(files, document)

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
  const [stored, assets] = await Promise.all([
    readManifest(siteId).catch(() => null),
    listAssets(siteId).catch(() => []),
  ])

  /**
   * A PROJECT THAT HAS NEVER BEEN DESCRIBED GETS A FIRST DRAFT, FREE.
   *
   * The manifest only ever filled in when the model volunteered a call to
   * `update_manifest`, so a site built before this existed — or one where it
   * never came up — had no understanding recorded at all, permanently. That is
   * the state most projects were actually in.
   *
   * The seed reads the first thing the creator ever said, which for a site
   * built from "a barber shop in Frankfurt" IS its purpose, more accurately
   * than anything inferred from the code. One indexed query, no model call.
   *
   * It is not written back here. A seed is a starting point for THIS run's
   * prompt; persisting a guess before the model has looked at the project
   * would put low-confidence text somewhere future runs would trust.
   */
  const manifest = stored ?? (await seedManifest(siteId).catch(() => null))
  const intent = classifyIntent(prompt)
  /**
   * How much room this request gets. A flat twelve turns for everything is
   * what made a broad ask produce one small edit: a model that senses it is
   * running out of room stops early, rationally.
   *
   * The site's own state is passed as well as the sentence, because the
   * sentence cannot say "this site is empty" and that is the single fact that
   * most changes how much room a run needs.
   */
  const budget = classifyComplexity(prompt, isEmptySite(document))
  const context = {
    manifest: describeManifest(manifest),
    facts: describeProject(files, assets),
    intent: `${intentInstruction(intent)}\n\n${budgetInstruction(budget)}`,
    // A thin brain asks this run to fill it in — it is reading the code anyway.
    thin: manifestIsThin(manifest),
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

  const loop = agentLoop({
    provider,
    model,
    prompt,
    workspace,
    esbuild,
    context,
    budget,
    /**
     * The project, not the person. Every turn of every run on this site shares
     * a long identical prefix — the rules, the map, the tokens — and this is
     * what lets the provider recognise it as the same prefix next time.
     */
    cacheKey: `site:${siteId}`,
    /**
     * The agent's build typechecks; the editor's preview does not. This is the
     * one place with Node and the compiler, so it is the one place the check
     * can happen — and it happens before a run is allowed to call itself done.
     */
    typecheck: async (projectFiles) => {
      const result = await typecheckProject(projectFiles)
      if (!result.ran) return null
      return { ok: result.ok, report: formatTypeErrors(result) }
    },
    /**
     * And the last thing between a green run and a white page: the project is
     * RENDERED, in a sandboxed process with no environment and a timeout. A
     * site that compiles and throws on open is the failure a creator actually
     * experiences, and it is the one nothing here could see until now.
     */
    render: async (projectFiles) => {
      const result = await renderCheck(projectFiles)
      if (!result.ran) return null
      return { ok: result.ok, report: formatRenderFailure(result) }
    },
    /**
     * ASKING, WITH A DEADLINE MADE OF WHAT THE RUN CAN AFFORD.
     *
     * The route runs with maxDuration 300. A wait that ignored that would not
     * wait forever — it would be killed mid-build with everything unsaved. So
     * the asker is told when the run must be building again rather than being
     * given a fixed window, and it declines to ask at all once too little time
     * remains to both answer and finish.
     */
    ask: createAsker({
      siteId,
      runId,
      deadline: startedAt + RUN_BUDGET_MS - BUILD_RESERVE_MS,
      signal: cancelled.signal,
    }),
    signal: cancelled.signal,
    /*
      THE LOOP ENDS IN TIME TO SAVE. No new turn once only BUILD_RESERVE_MS
      is left of the platform's 300 seconds, counted from the request, and a
      model call still going TURN_HARD_STOP_MS before the end is given up on.
      Before, only turns and tokens stopped it, and a long run was killed
      with nothing saved and its row left "running".
    */
    deadlineAt: (requestStartedAt ?? startedAt) + RUN_BUDGET_MS - BUILD_RESERVE_MS,
    hardDeadlineAt: (requestStartedAt ?? startedAt) + RUN_BUDGET_MS - TURN_HARD_STOP_MS,
  })
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

    /**
     * CUSTOM FILES FIRST, THEN THE DOCUMENT.
     *
     * A run can touch both: a section prop AND a component the library cannot
     * express. The generated files are the document's output and are written
     * by `writeDocument` from the document itself, so writing them here as
     * well would be the same bytes twice — and would make the file save the
     * thing that defines the site, which is the split this whole layer exists
     * to remove.
     *
     * The custom ones go first because `writeDocument` renders over whatever
     * is stored, and a custom section the agent has just written has to be
     * stored before that render can preserve it.
     */
    const custom: ProjectFiles = {}
    for (const [path, content] of Object.entries(changed)) {
      if (workspace.hasDocument && isGenerated(path)) continue
      custom[path] = content
    }

    if (Object.keys(custom).length > 0) {
      const saved = await saveFiles(siteId, custom)
      if (!saved.ok) {
        status = "failed"
        error = saved.error
      }
    }

    if (status === "succeeded" && workspace.documentChanged && workspace.document) {
      const stored = await writeDocument(siteId, workspace.document)
      if (!stored.ok) {
        status = "failed"
        error = stored.error
      }
    }

    if (status === "succeeded" && Object.keys(changed).length > 0) {
      changedFiles = [...workspace.changed]
      yield { type: "files", paths: changedFiles }
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
      await writeManifest(siteId, mergeManifest(stored, workspace.manifestUpdate)).catch(() => false)
    }
  }

  /* Zero on the creator's own account: Storelib's AI spend is what this column adds up to, and this run was not ours. */
  const cost = provider.id.startsWith("own:") ? { usd: 0, priced: true } : costOf(model, result.usage)

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
      /**
       * From the workspace, not from the events: the stream and the transcript
       * must not be able to disagree about what was asked. A creator who
       * reloads has to see the same four questions they saw live.
       */
      questions: workspace.questions,
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
  const who = await routeUser()
  const user = who.kind === "user" ? who.user : null

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
   * ═══════════════════════════════════════════════════════════════════════
   *  A RESTORE IS AN EDIT, AND EVERY EDIT HERE IS UNDOABLE EXCEPT THIS ONE
   * ═══════════════════════════════════════════════════════════════════════
   * Below, this deletes the files the snapshot does not have and overwrites
   * the ones it does. Until now it did that on top of the current project
   * without keeping a copy of it, so restoring the wrong version — easy,
   * since the list shows a prompt and a time and not a diff — threw away
   * everything since the last agent run with nothing to go back to.
   *
   * So the state being replaced becomes a version of its own first, and it
   * appears in the same History list. A failure to take it is fatal to the
   * restore, unlike the snapshot before an agent run: there, a missing
   * snapshot costs undo on a change the person asked for and watched happen;
   * here it would cost them the project.
   */
  const current = await readProject(siteId)
  if (Object.keys(current).length > 0) {
    const kept = await snapshot(siteId, current, "Before restoring an earlier version")
    if (!kept) {
      return {
        ok: false,
        error: "Could not keep a copy of the current version, so nothing was changed. Try again.",
      }
    }
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
