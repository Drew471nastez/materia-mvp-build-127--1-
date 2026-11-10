/**
 * ===========================================================================
 *  AN AGENT JOB'S PROGRESS, IN PLAIN WORDS (round L, L2)
 * ===========================================================================
 * Pure and shared by the server (what the runner and the loop write into
 * events) and the browser (what the progress view draws). No percentages:
 * a phase, the real things done (a page made, a section written, a check
 * passed) and real counts only when the job knows them.
 *
 *   toolSummary     one tool call as the creator would say it
 *                   ("Writing the hero section", "Checking for errors").
 *   componentName   sections/ai_hero_banner.storelib → "hero banner".
 *   stopReason      why a job stopped, its words and what can be done next
 *                   (Continue, Try again, Start over).
 *   AgentJobView    what GET /api/website-builder/ai-jobs/<id> answers for
 *                   an agent job.
 */
import type { AgentErrorCode, AgentCounts } from "@/lib/ai-builder/agent-step"
import type { AgentEvent, AgentJobStatus, AgentPhase, AgentToolName, BudgetStop } from "@/lib/ai-builder/types"

/** The phase line of the progress view (also the `label` of phase events). English; the view translates with tt. */
export const PHASE_LABEL: Record<AgentPhase, string> = {
  brief: "Reading your description",
  plan: "Planning pages",
  build: "Building your website",
  verify: "Checking for errors",
  repair: "Fixing problems",
  finish: "Finishing up",
}

/** "sections/ai_hero_banner.storelib" → "hero banner". Anything else: the file name without its folder. */
export function componentName(path: string): string {
  const file = path.split("/").pop() ?? path
  const bare = file.replace(/\.storelib$/, "").replace(/^ai_/, "")
  return bare.replace(/[_-]+/g, " ").trim() || file
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * One tool call in plain words, for `tool` events. The loop may pass its own
 * summary; this is the default. Never includes file bodies or settings.
 */
export function toolSummary(tool: AgentToolName, input: Record<string, unknown> = {}): string {
  const path = str(input.path)
  const name = path ? componentName(path) : ""
  const page = str(input.page) || str(input.key)
  const pageWords = page === "home" ? "the home page" : page ? `the ${page.replace(/[-_]+/g, " ")} page` : "a page"
  switch (tool) {
    case "list_files":
      return "Looking at the website's files"
    case "read_file":
      return name ? `Reading the ${name} section` : "Reading a file"
    case "write_file":
      return name ? `Writing the ${name} section` : "Writing a section"
    case "edit_file":
      return name ? `Changing the ${name} section` : "Changing a section"
    case "delete_file":
      return name ? `Removing the ${name} section` : "Removing a section"
    case "list_pages":
      return "Looking at the pages"
    case "add_page":
      return `Adding ${str(input.title) ? `the ${str(input.title)} page` : pageWords}`
    case "set_page_sections":
      return `Laying out ${pageWords}`
    case "set_section_settings":
      return `Filling in a section on ${pageWords}`
    case "set_tokens":
      return "Choosing colors and fonts"
    case "list_capabilities":
      return "Looking at your products and pages"
    case "bind_data":
      return `Connecting your store's data on ${pageWords}`
    case "search_knowledge":
      return "Looking up design ideas"
    case "validate":
      return name ? `Checking the ${name} section for errors` : "Checking for errors"
    case "render_check":
      return `Checking how ${pageWords} looks`
    case "report_progress":
      return str(input.label) || "Working"
    case "finish":
      return "Finishing up"
    /* Round P (P1): pictures, by what they are for. */
    case "generate_image":
    case "find_photo": {
      const purpose = str(input.purpose).replace(/\b(photo|picture|image)\b/gi, "").trim().toLowerCase()
      return `Making ${purpose ? `the ${purpose} photo` : "a photo"}`
    }
  }
}

/* ── how a job ended, and what can be done next ─────────────────────────── */

export type RecoveryAction = "continue" | "retry" | "start_over"

export interface StopReason {
  title: string
  message: string
  actions: RecoveryAction[]
}

/** The words for an error code, and what to offer. English; the view translates. */
export function stopReason(code: AgentErrorCode | null | undefined): StopReason {
  switch (code) {
    case "budget_time":
      return { title: "Out of time", message: "This build used all the time it had. What it made is saved as a draft.", actions: ["continue", "start_over"] }
    case "budget_iterations":
      return { title: "Reached its step limit", message: "This build took as many steps as one build may. What it made is saved as a draft.", actions: ["continue", "start_over"] }
    case "budget_spend":
      return { title: "Reached its AI spending limit", message: "This build used the AI spend one build may. What it made is saved as a draft.", actions: ["continue", "start_over"] }
    case "budget_repairs":
      return { title: "Some problems could not be fixed", message: "It tried a few times and stopped. What it made is saved as a draft.", actions: ["continue", "start_over"] }
    case "model_busy":
      return { title: "The AI is busy", message: "The AI did not answer after a few tries. Nothing was lost.", actions: ["retry"] }
    case "model_key":
      return { title: "Your AI key was refused", message: "Check the key in Settings, then try again.", actions: ["retry"] }
    case "too_long":
      return { title: "This build stalled", message: "It stopped making progress. What it made is saved as a draft.", actions: ["continue", "start_over"] }
    case "not_available":
      return { title: "AI building is not on yet", message: "This kind of build is not available right now.", actions: ["start_over"] }
    case "internal":
    default:
      return { title: "Something went wrong", message: "What was made so far is saved as a draft.", actions: ["retry", "start_over"] }
  }
}

/** The error code a budget stop gives. */
export function stopCode(stop: BudgetStop): AgentErrorCode | null {
  return stop === "wall_clock" ? "budget_time" : stop === "iterations" ? "budget_iterations" : stop === "spend" ? "budget_spend" : stop === "repairs" ? "budget_repairs" : null
}

/* ── the view the editor polls ──────────────────────────────────────────── */

export interface AgentJobView {
  id: string
  installId: string
  engine: "agent"
  status: AgentJobStatus
  phase: AgentPhase | null
  /** The last event number on the server: the next poll asks after it. */
  seq: number
  /** Events after the cursor asked for, in seq order (a page at a time). */
  events: AgentEvent[]
  /** True when there are more events after the last one sent (a long backlog). */
  more: boolean
  counts: AgentCounts
  error: { code: AgentErrorCode; message: string; actions: RecoveryAction[] } | null
  cancelRequested: boolean
  /** What the agent said when it finished (summary and gaps). */
  summary: string | null
  notes: string[]
  /** Continues used so far, and how many are allowed. */
  continues: { used: number; max: number }
  /** A Redesign with AI job (round M): its scope, and its Undo (restores the backup taken before it ran). */
  redesign?: { scope: "changes" | "full"; undo: "available" | "done" | "none" }
}

export const AGENT_TERMINAL: readonly AgentJobStatus[] = ["complete", "partial", "failed", "cancelled"]

export function agentSettled(view: Pick<AgentJobView, "status"> | null): boolean {
  return !!view && AGENT_TERMINAL.includes(view.status)
}

/** Events as one row of ai_site_job_events gives them. */
export function eventFromRow(row: { seq: number; kind: string; payload: unknown; created_at: string }): AgentEvent {
  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>
  return { ...payload, kind: row.kind, seq: Number(row.seq), at: row.created_at } as AgentEvent
}
