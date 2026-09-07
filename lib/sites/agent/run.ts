import "server-only"

/**
 * The agent loop.
 *
 * Provider-independent by construction: it speaks only the types in ./types
 * and is handed an `AgentProvider`. Swapping models or vendors touches
 * ./openai-provider and ./models, never this file.
 *
 * The order below is the whole safety story, and each step is before the next
 * for a reason:
 *
 *   1. QUOTA, before any token is spent. A limit enforced after the request is
 *      a limit that bills you for the request it refused.
 *   2. SNAPSHOT, before the first edit. Taken after, it has already lost the
 *      version somebody wants back.
 *   3. THE LOOP, with a hard turn cap. A model that will not stop is a bill.
 *   4. SAVE, only what changed, through the same validation and RLS a human
 *      edit uses.
 *   5. RECORD, with tokens as the provider reported them.
 *
 * Step 5 runs even when 3 or 4 fail. A run that cost money and left no row is
 * a bill nobody can explain.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { siteLimits, type SitePlan } from "../plan"
import { readProject, saveFiles } from "../projects"
import type { ProjectFiles } from "../types"
import { chooseModel, costOf } from "./models"
import { TOOL_SPECS, ProjectWorkspace } from "./tools"
import {
  ZERO_USAGE,
  addUsage,
  type AgentEvent,
  type AgentProvider,
  type AgentTurn,
  type TokenUsage,
} from "./types"

/**
 * The model gets this many round trips. Reached, the run stops and says so.
 *
 * Twelve is enough for read-a-few-files, edit, build, fix, build; a model still
 * going at thirteen is looping, and every extra turn resends the whole history.
 */
const MAX_TURNS = 12

const SYSTEM_PROMPT = `You edit a small React website that is a real Vite project. The files ARE the site — there is no other representation of it.

Rules:
- Call list_files first. Never guess a path.
- read_file before you rewrite a file. write_file replaces the WHOLE file — send complete contents, never a fragment or a diff.
- You may import ONLY react, react-dom and react-dom/client. No other package is available and none can be installed. Write what you need by hand.
- Styling is plain CSS in src/styles.css, which defines design tokens at the top (--bg, --text, --primary, --radius, …). Change a token to restyle the whole site; add rules for anything new. There is no Tailwind and no CSS framework.
- After you finish editing, call run_build. If it reports errors, fix them and build again. Do not finish on a failing build.
- When you are done, reply with one or two plain sentences saying what you changed. No preamble, no markdown headings, no code in the reply.`

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

  yield { type: "started", runId, model }

  const workspace = new ProjectWorkspace(files)
  const turns: AgentTurn[] = [{ role: "user", content: prompt }]
  let usage: TokenUsage = ZERO_USAGE
  let turnCount = 0
  let finalMessage = ""
  let status: "succeeded" | "failed" | "refused" = "failed"
  let error: string | null = null

  try {
    for (turnCount = 1; turnCount <= MAX_TURNS; turnCount++) {
      const turn = await provider.complete({
        model,
        system: SYSTEM_PROMPT,
        turns,
        tools: TOOL_SPECS,
        maxOutputTokens: 32_000,
        signal,
      })

      // Accumulated FIRST. A turn that then throws still cost money, and the
      // record has to say so.
      usage = addUsage(usage, turn.usage)

      if (turn.stop === "refusal") {
        status = "refused"
        finalMessage = turn.text || "I can't help with that."
        break
      }

      turns.push({
        role: "assistant",
        content: turn.text,
        toolCalls: turn.toolCalls,
        raw: turn.raw,
      })

      if (turn.text.trim()) yield { type: "thinking", text: turn.text.trim() }

      if (turn.toolCalls.length === 0) {
        finalMessage = turn.text.trim()
        status = "succeeded"
        break
      }

      const results = []
      for (const call of turn.toolCalls) {
        const output = await workspace.execute(call.name, call.argumentsJson, esbuild)
        results.push({ id: call.id, output })
        yield { type: "tool", name: call.name, detail: describe(call.name, call.argumentsJson) }
      }
      turns.push({ role: "tool", results })

      if (turnCount === MAX_TURNS) {
        error = "The edit took too many steps and was stopped."
        status = "failed"
      }
    }

    /**
     * Nothing is written if the last build failed.
     *
     * The prompt tells the model not to finish on a red build; this is what
     * happens when it does anyway. Saving a project that does not compile
     * replaces a working site with a broken one, and the creator's next view
     * of their own page is an error overlay.
     */
    const build = workspace.buildResult
    if (status === "succeeded" && build && !build.ok) {
      status = "failed"
      error = "The edit did not compile, so nothing was changed."
    }

    if (status === "succeeded") {
      const changed = workspace.changedFiles()
      if (Object.keys(changed).length > 0) {
        const saved = await saveFiles(siteId, changed)
        if (!saved.ok) {
          status = "failed"
          error = saved.error
        } else {
          yield { type: "files", paths: [...workspace.changed] }
        }
      }
    }
  } catch (thrown) {
    status = "failed"
    error = thrown instanceof Error ? thrown.message : "The edit failed."
  }

  const cost = costOf(model, usage)
  const changedFiles = status === "succeeded" ? [...workspace.changed] : []

  await admin
    .from("site_agent_runs")
    .update({
      status,
      input_tokens: usage.inputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      cache_write_tokens: usage.cacheWriteTokens,
      output_tokens: usage.outputTokens,
      cost_usd: cost.usd,
      turns: turnCount,
      files_changed: changedFiles,
      error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)

  if (status === "succeeded") {
    if (finalMessage) yield { type: "message", text: finalMessage }
    yield { type: "done", runId, costUsd: cost.usd, turns: turnCount, filesChanged: changedFiles }
  } else if (status === "refused") {
    yield { type: "message", text: finalMessage }
    yield { type: "done", runId, costUsd: cost.usd, turns: turnCount, filesChanged: [] }
  } else {
    yield { type: "error", message: error ?? "The edit failed." }
  }
}

/** A one-line description of a call, for the UI. Never the file contents. */
function describe(name: string, argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || "{}")
    if (typeof args.path === "string") return args.path
  } catch {
    /* a malformed call is still worth showing by name */
  }
  return ""
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
