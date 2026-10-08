/**
 * ===========================================================================
 *  WHAT EACH STORELIB AI RUN DID, KEPT
 * ===========================================================================
 * The server log has every run, but a log is read by whoever has the
 * server; nothing in the product could say how often a whole site build
 * finished, how many pages it built, or which checks were still failing
 * when it stopped. One row per run, in storelib_ai_runs
 * (supabase/sql/RUN_STORELIB_AI_BUILDER.sql), written through the creator's
 * own client so row-level security decides whose site it is.
 *
 * Facts, never the conversation: the request's kind and flags, how many
 * operations, which pages, which checks still failed, how long, which model.
 * The words of the request stay in the chat history, where they already are.
 *
 * NEVER IN THE WAY. A database without the table, or a write that fails, is
 * a line in the server log and nothing else: the run has already happened.
 */
import "server-only"

import type { Intent } from "./intent"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RunRecord {
  installId: string
  creatorId: string
  pageKey: string
  status: string
  intent: Intent | null | undefined
  ops: number
  wroteCode: boolean
  pages: string[]
  unresolved: string[]
  ms: number
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
}

/** The row, as the table takes it. Pure, so the shape has a test. */
export function runRow(r: RunRecord): Record<string, unknown> {
  return {
    install_id: r.installId,
    creator_id: r.creatorId,
    page_key: r.pageKey.slice(0, 64),
    status: r.status === "succeeded" || r.status === "refused" ? r.status : "failed",
    intent_kind: r.intent?.kind ?? null,
    intent_flags: r.intent
      ? {
          scope: r.intent.scope,
          rebuild: !!r.intent.rebuild,
          light: !!r.intent.light,
          new_page: !!r.intent.newPage,
          global: !!r.intent.global,
          keep: (r.intent.keep ?? []).slice(0, 6),
          motion: r.intent.wantsMotion,
        }
      : {},
    ops_count: Math.max(0, Math.floor(r.ops)),
    wrote_code: r.wroteCode,
    pages_built: r.pages.slice(0, 60),
    unresolved: r.unresolved.slice(0, 20).map((u) => u.slice(0, 300)),
    duration_ms: Math.max(0, Math.round(r.ms)),
    model: r.model.slice(0, 80),
    provider: r.provider.slice(0, 40),
    input_tokens: Math.max(0, Math.floor(r.inputTokens)),
    output_tokens: Math.max(0, Math.floor(r.outputTokens)),
  }
}

export async function recordRun(db: Db, r: RunRecord): Promise<void> {
  try {
    const { error } = await db.from("storelib_ai_runs").insert(runRow(r))
    if (error) console.info("[storelib ai] run not recorded", String(error.message ?? error).slice(0, 200))
  } catch (e) {
    console.info("[storelib ai] run not recorded", e instanceof Error ? e.message.slice(0, 200) : "unknown")
  }
}
