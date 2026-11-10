/**
 * ===========================================================================
 *  THE AGENT'S TOOLS: NAMES, INPUTS AND RESULTS (round L contract)
 * ===========================================================================
 * The shapes the loop (L3) implements and the progress view (L2) and the
 * tests (L7) read. JSON schemas for the provider are built from these by L3
 * (lib/ai-builder/agent/tools-impl.ts); keep the two in step.
 *
 * Every write is to DRAFT halves, through the existing sanitisers, for the
 * job's own install only. A tool never takes an install id, creator id or
 * path outside the install: the loop binds those from the job row.
 */
import type {
  AgentPhase,
  AgentToolName,
  ComponentManifest,
  DataBindingKind,
  DesignTokens,
  FileWriteResult,
  KnowledgeEntry,
  KnowledgeKind,
  ProjectFile,
  ValidationIssue,
} from "./types"
import type { RuntimeCapabilities } from "./runtime-contract"
import type { DesignGroupInput } from "./site-settings"

/** A section on a page, as the agent sets it: native type or an ai_ component. */
export interface PlacedSectionInput {
  /** Keep to update in place; omit to create (the loop mints a stable id). */
  id?: string
  type: string
  settings?: Record<string, unknown>
  blocks?: { id?: string; type: string; settings?: Record<string, unknown> }[]
  group?: "header" | "footer" | "overlay"
  hidden?: boolean
}

export interface AgentToolInputs {
  list_files: { prefix?: string }
  read_file: { path: string }
  /** Whole file. `manifest`, when given, is written into the file's <schema> (manifestToSchema) before compiling. */
  write_file: { path: string; content: string; manifest?: ComponentManifest }
  /** Exact string replacement, as the code editor's agent does. `old` must occur exactly once. */
  edit_file: { path: string; old: string; new: string }
  delete_file: { path: string }
  list_pages: Record<string, never>
  /** `key` is a page key: lowercase letters, digits and dashes; served at pagePath(key). */
  add_page: { key: string; title: string; seo?: { title?: string; description?: string } }
  /** Replaces the page's body sections in order. Header/footer only with `group`. */
  set_page_sections: { page: string; sections: PlacedSectionInput[] }
  set_section_settings: { page: string; sectionId: string; settings: Record<string, unknown> }
  /**
   * `settings` (round N, N5): the site's own Theme settings, labelled and grouped as its designer would
   * (lib/ai-builder/site-settings.ts). Sent: replaces the declared groups. Left out: they stay as they are.
   */
  set_tokens: { tokens: Partial<DesignTokens>; settings?: DesignGroupInput[] }
  list_capabilities: Record<string, never>
  /** Sets a binding prop to a real id. Refused when the id is not in list_capabilities. */
  bind_data: { page: string; sectionId: string; prop: string; kind: DataBindingKind; ids: string[] }
  search_knowledge: { query: string; kinds?: KnowledgeKind[]; limit?: number }
  /** No path: every file the job touched and every page. */
  validate: { path?: string }
  render_check: { page: string }
  /**
   * `concept` (L3 extension): the visual concept, required once with phase
   * "plan" before a new website's first write (lib/ai-builder/agent/concept.ts).
   * `tasks`: the plan as short lines, shown as open tasks.
   * `pages` (round N, N3): the site plan, every page and template with its
   * sections ({ key, sections: string[], reason? }[]), required with the
   * concept before a new website's first write (lib/ai-builder/agent/site-plan.ts).
   */
  /** `brief` (round O, O2): the plan model's refinements to the creative brief (lib/storelib-ai/direction/brief.ts refineBrief). */
  report_progress: { phase: AgentPhase; label: string; concept?: unknown; tasks?: string[]; pages?: unknown; brief?: unknown }
  finish: { summary: string; notes?: string[] }
  /**
   * Round P (P1): an original picture (lib/storelib-ai/images generateImage), kept in the creator's files.
   * `prompt` is the subject in plain words; the site's art direction, light and palette are added for it.
   * `purpose`: hero, product, portrait, people, place, detail, gallery, background... `style`: photo (default), studio, editorial, illustration, render.
   */
  generate_image: { prompt: string; aspect?: "square" | "landscape" | "portrait"; purpose?: string; alt?: string; style?: string }
  /** Round P (P1): a licensed stock photo (Pexels), kept in the creator's files with its photographer's credit. */
  find_photo: { query: string; aspect?: "square" | "landscape" | "portrait"; purpose?: string; alt?: string }
}

/** What generate_image and find_photo answer: the picture to put in an image_picker setting, or why there is none. */
export type AgentImageOutput =
  | { ok: true; url: string; alt: string; width: number; height: number; mediaId: string; source: "ai" | "stock"; credit?: string; left: number }
  | { ok: false; reason: string; left?: number }

export interface AgentToolOutputs {
  list_files: { files: Pick<ProjectFile, "path" | "updatedAt">[] }
  read_file: { path: string; content: string; version: string } | { path: string; missing: true }
  write_file: FileWriteResult
  edit_file: FileWriteResult
  /** `reason` (round M): why a delete was refused, so the model can act on it. */
  delete_file: { ok: boolean; reason?: string }
  /** Round N (N3): templates are listed too, stored or not (`template`, `stored`, `url`, `reads`). */
  list_pages: { pages: { key: string; title: string; sections: { id: string; type: string; group?: string }[]; template?: boolean; stored?: boolean; url?: string; reads?: string }[] }
  add_page: { ok: boolean; key: string; error?: string }
  set_page_sections: { ok: boolean; ids: string[]; issues?: ValidationIssue[] }
  set_section_settings: { ok: boolean; issues?: ValidationIssue[] }
  set_tokens: { ok: boolean; changed: string[]; issues?: ValidationIssue[] }
  list_capabilities: RuntimeCapabilities
  bind_data: { ok: boolean; issues?: ValidationIssue[] }
  search_knowledge: { entries: Pick<KnowledgeEntry, "id" | "kind" | "title" | "body" | "examples">[] }
  validate: { ok: boolean; issues: ValidationIssue[] }
  render_check: { ok: boolean; issues: ValidationIssue[]; htmlBytes: number }
  /**
   * `note` (L3 extension): that a concept was accepted, and what to keep to.
   * Round M: a REFUSED report is `ok: false` with `reason` and `issues` (a concept
   * that fails validateConcept, or a phase move before the concept), never
   * `ok: true` with a note, so the model and the progress events both see the refusal.
   */
  report_progress: { ok: boolean; note?: string; reason?: string; issues?: ValidationIssue[] }
  /** Refused (ok false) while validate has errors and repairs remain. */
  finish: { ok: boolean; reason?: string }
  generate_image: AgentImageOutput
  find_photo: AgentImageOutput
}

/** Compile-time check that every tool name has an input and an output shape. */
export type ToolsCovered = [AgentToolName] extends [keyof AgentToolInputs & keyof AgentToolOutputs] ? true : never
export const TOOLS_COVERED: ToolsCovered = true

/** Tools that change the website (counted against the write budget and logged as events). */
export const WRITE_TOOLS: readonly AgentToolName[] = ["write_file", "edit_file", "delete_file", "add_page", "set_page_sections", "set_section_settings", "set_tokens", "bind_data"]

/** Paths the agent may write: section and block files, its own snippets and assets text. Nothing else in the install. */
export const WRITABLE_PATH = /^(sections|blocks|snippets)\/ai_[a-z0-9_]{1,60}\.storelib$/

/** An implementation of one tool, bound to a job. L3 implements; L7 fakes. */
export type ToolImpl<N extends AgentToolName> = (input: AgentToolInputs[N]) => Promise<AgentToolOutputs[N]>
export type ToolSet = { [N in AgentToolName]: ToolImpl<N> }
