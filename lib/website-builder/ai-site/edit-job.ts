/**
 * ===========================================================================
 *  "EDIT WITH AI" ON ONE COMPONENT, AS AN AGENT JOB (round L, L2 for L5)
 * ===========================================================================
 * The editor's Edit with AI (L5, lib/ai-builder/edit-request.ts) posts a
 * ComponentEditRequest to POST /api/website-builder/themes/[id]/ai-edit:
 * the file, the section the person had open, their words and the version
 * of the draft they hold. That becomes an agent job in edit mode
 * (ai_site_jobs.options.edit): the loop may write only that file
 * (agent-engine.ts scopedStore), and the editor follows it like any job
 * (GET ai-jobs/<id>, Cancel, Continue).
 *
 * Pure: the request checked and the job's prompt and options. The route does
 * the rest.
 */
import type { AgentEditScope } from "@/lib/ai-builder/agent-step"

/** The shape L5 sends (lib/ai-builder/types.ts ComponentEditRequest on its branch). */
export interface EditRequestBody {
  mode: "edit"
  path: string
  sectionId?: string
  page?: string
  prompt: string
  expectedVersion: string | null
}

export const EDIT_PROMPT_MAX = 2_000
const PATH = /^(sections|blocks|snippets)\/[a-z0-9_-]{1,80}\.storelib$/

export type ParsedEdit = { ok: true; edit: EditRequestBody } | { ok: false; error: string }

export function parseEditRequest(raw: unknown): ParsedEdit {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Bad request" }
  const r = raw as Record<string, unknown>
  if (r.mode !== "edit") return { ok: false, error: "mode must be edit" }
  if (typeof r.path !== "string" || !PATH.test(r.path)) return { ok: false, error: "That file cannot be edited this way." }
  const prompt = typeof r.prompt === "string" ? r.prompt.trim() : ""
  if (!prompt) return { ok: false, error: "Say what to change." }
  if (prompt.length > EDIT_PROMPT_MAX) return { ok: false, error: "That is too long. Keep it under 2,000 characters." }
  if (r.expectedVersion !== null && (typeof r.expectedVersion !== "string" || !/^[0-9a-f]{64}$/.test(r.expectedVersion))) return { ok: false, error: "expectedVersion must be a sha256 or null" }
  const sectionId = typeof r.sectionId === "string" && r.sectionId.length <= 120 ? r.sectionId : undefined
  const page = typeof r.page === "string" && /^[a-z0-9_-]{1,80}$/.test(r.page) ? r.page : undefined
  return { ok: true, edit: { mode: "edit", path: r.path, prompt, expectedVersion: (r.expectedVersion as string | null) ?? null, ...(sectionId ? { sectionId } : {}), ...(page ? { page } : {}) } }
}

/** The job's prompt: the person's words as written, then which file and section they mean. Within the 2,000 the row allows. */
export function editJobPrompt(edit: EditRequestBody): string {
  const where = `(About ${edit.path}${edit.sectionId ? `, section ${edit.sectionId}` : ""}${edit.page ? ` on the ${edit.page} page` : ""}. Change only this file.)`
  const room = EDIT_PROMPT_MAX - where.length - 2
  return `${edit.prompt.slice(0, room)}\n\n${where}`
}

/** What the job keeps in options: a theme job whose scope is this one file. */
export function editJobOptions(edit: EditRequestBody): { generation: "theme"; edit: AgentEditScope } {
  return { generation: "theme", edit: { path: edit.path, ...(edit.sectionId ? { sectionId: edit.sectionId } : {}), ...(edit.page ? { page: edit.page } : {}) } }
}
