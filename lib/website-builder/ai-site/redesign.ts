/**
 * ===========================================================================
 *  REDESIGN WITH AI, AS DATA (round M, M1)
 * ===========================================================================
 * Pure helpers for POST/GET themes/[installId]/redesign and the AI job's
 * Undo (ai-jobs/[jobId]/undo): the request checked, what the job keeps in
 * `options.redesign` (the scope and the backup taken before it ran), and
 * what the editor is told about a job's undo (kept in `state.undo` once it
 * was undone; Continue and Start over drop it).
 */
import { redesignOf, type RedesignScope } from "@/lib/ai-builder/agent-step"
import { START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"

export interface RedesignRequest {
  prompt: string
  key: string
  scope: RedesignScope
}

export type ParsedRedesign = { ok: true; request: RedesignRequest } | { ok: false; error: string; code: string }

export function parseRedesignRequest(raw: unknown): ParsedRedesign {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Bad request", code: "bad_request" }
  const r = raw as Record<string, unknown>
  /* The words exactly as written, as Start with AI keeps them; only an empty description is refused. */
  const prompt = typeof r.prompt === "string" ? r.prompt : ""
  if (!prompt.trim()) return { ok: false, error: "Say what to change first.", code: "prompt_required" }
  if (prompt.length > START_PROMPT_MAX) return { ok: false, error: `Keep it under ${START_PROMPT_MAX.toLocaleString("en-US")} characters.`, code: "prompt_too_long" }
  if (r.scope !== undefined && r.scope !== "changes" && r.scope !== "full") return { ok: false, error: "scope must be changes or full", code: "bad_scope" }
  return { ok: true, request: { prompt, key: typeof r.key === "string" ? r.key : "", scope: r.scope === "full" ? "full" : "changes" } }
}

/** A theme job (the website's own theme stays) with its scope and its backup. */
export function redesignJobOptions(scope: RedesignScope, backupId: string): { generation: "theme"; redesign: { scope: RedesignScope; backupId: string } } {
  return { generation: "theme", redesign: { scope, backupId } }
}

export interface UndoRecord {
  at: string
  backupId: string
  removed: number
  kept: number
}

export function undoRecordOf(v: unknown): UndoRecord | null {
  if (!v || typeof v !== "object") return null
  const u = v as Record<string, unknown>
  return typeof u.at === "string" && typeof u.backupId === "string" ? { at: u.at, backupId: u.backupId, removed: Number(u.removed) || 0, kept: Number(u.kept) || 0 } : null
}

/** What the editor needs about a redesign job: its scope, its backup, and whether it was undone. Null for any other job. */
export function redesignState(options: unknown, undo: unknown): { scope: RedesignScope; backupId: string | null; undone: UndoRecord | null } | null {
  const r = redesignOf(options)
  if (!r) return null
  return { scope: r.scope, backupId: r.backupId, undone: undoRecordOf(undo) }
}
