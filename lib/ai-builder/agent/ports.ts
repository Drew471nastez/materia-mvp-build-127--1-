/**
 * ===========================================================================
 *  WHAT THE AGENT ENGINE NEEDS FROM THE WORLD, AS INTERFACES
 * ===========================================================================
 * The loop (./loop.ts) and the tools (./tools-impl.ts) never touch Supabase,
 * a vendor SDK or another workstream's module directly. They get:
 *
 *   ProjectStore   the install's files, pages and draft Theme settings
 *                  (./supabase-store.ts for real, ./memory-store.ts in tests)
 *   models         provider + model per role, through resolveForCreator
 *                  (./server.ts) or a scripted fake
 *   capabilities   this creator's real data, ids included
 *   knowledge      L6's retrieval (./knowledge.ts by default)
 *   slop           L6's anti slop evaluator (./knowledge.ts by default)
 *   renderCheck    L4's render check, or ./render-check.ts
 *
 * so the whole engine runs in a test with a scripted provider and an
 * in-memory website, and every collaborator another lane is still building
 * is one function to swap.
 */
import type { AgentProvider } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { VisualCriticRunner } from "../visual-critic/critic"
import type { AgentEvent, DesignTokens, FileAuthor, GenerationMode, JobBudget, KnowledgeEntry, KnowledgeKind, StartOptions, ValidationIssue } from "../types"

/* ── the website ──────────────────────────────────────────────────────── */

export interface StoredFile {
  path: string
  /** What the editor shows: the draft when there is one, else what is live. */
  text: string
  updatedAt: string | null
}

export interface StoredPage {
  key: string
  sections: SectionInstance[]
}

export type StoreWriteResult = { ok: true; updatedAt: string | null; created: boolean } | { ok: false; error: string; conflict?: boolean }

/**
 * One install's project. Every write is to the DRAFT half. Implementations
 * are bound to one install: nothing here takes an install id.
 */
export interface ProjectStore {
  listFiles(): Promise<StoredFile[]>
  readFile(path: string): Promise<StoredFile | null>
  /**
   * `expectedVersion` is sha256 (hex) of the text the writer last read, null
   * for a new file (ProjectFileWrite.expectedVersion). The store refuses with
   * `conflict` when the draft moved since: somebody else wrote in between.
   */
  writeFile(path: string, text: string, meta: { expectedVersion: string | null; author: FileAuthor; jobId: string }): Promise<StoreWriteResult>
  deleteFile(path: string, meta: { author: FileAuthor; jobId: string }): Promise<{ ok: boolean; error?: string }>
  listPages(): Promise<StoredPage[]>
  /** Writes the drafts of the pages given; other pages are not touched. */
  writePages(pages: StoredPage[]): Promise<void>
  readSettings(): Promise<Record<string, unknown>>
  /** Merges these keys into the draft Theme settings. Other keys are not touched. */
  writeSettings(patch: Record<string, unknown>): Promise<void>
}

/* ── models ───────────────────────────────────────────────────────────── */

export interface ModelRole {
  provider: AgentProvider
  model: string
  effort?: "low" | "medium" | "high"
}

/** plan/review: the strong model; loop: the tool loop's; small: tiny follow ups. */
export interface AgentModels {
  plan: ModelRole
  loop: ModelRole
  small: ModelRole
  /**
   * The vision model the design review looks at the rendered draft with (round O, O4: claude-opus-5-5 through
   * resolveForCreator). Absent: the review measures in the browser only, and says so.
   */
  review?: ModelRole
  /** The creator's own key answers (a higher spend cap, D5). */
  ownKey: boolean
}

/* ── collaborators other lanes own ────────────────────────────────────── */

export interface KnowledgeHit {
  id: string
  kind: KnowledgeKind
  title: string
  body: string
  examples?: string[]
}

export type KnowledgeSearch = (q: { query: string; kinds?: KnowledgeKind[]; industry?: string; limit?: number }) => Promise<Pick<KnowledgeEntry, "id" | "kind" | "title" | "body" | "examples">[]>

/** Anti slop review of the files the job wrote. `slop.*` issues; error severity is "high". */
export type SlopEvaluator = (input: { files: { path: string; text: string }[]; concept: unknown; capabilities: RuntimeCapabilities | null }) => Promise<ValidationIssue[]>

/** A page drawn with the template engine (interpretation only) and checked. */
export type RenderChecker = (input: {
  page: string
  sections: SectionInstance[]
  settings: Record<string, unknown>
  sources: Record<string, string>
  routes: Set<string>
  capabilities?: RuntimeCapabilities | null
}) => Promise<{ ok: boolean; issues: ValidationIssue[]; htmlBytes: number }>

/** Turns tokens into Theme settings keys (L5 owns the real one). */
export type TokensMapper = (tokens: Partial<DesignTokens>, current: Record<string, unknown>) => { settings: Record<string, unknown>; changed: string[]; issues: ValidationIssue[] }

/* ── the job, as the engine sees it ───────────────────────────────────── */

export interface AgentJobInput {
  jobId: string
  creatorId: string
  installId: string
  /** The person's words, exactly. */
  prompt: string
  mode: GenerationMode
  options?: StartOptions
  /**
   * EDIT MODE: the site already exists and this is a change to it ("make the
   * hero calmer", "add a pricing page"). Only what is asked is touched.
   */
  edit?: boolean
  /**
   * REDESIGN (round M): a whole-site job on an existing website. "changes": what was asked, across the site,
   * keeping every other page, section, binding and word; "full": a new look for the whole site, still with
   * the site's own words, products and bindings. The job's backup is the way back.
   */
  redesign?: "changes" | "full"
  budget: JobBudget
  /** When the job first started running (ms), for the total wall clock. */
  startedAt: number
  /** Spend before this slice, USD. */
  spentUsd: number
  /** The last event number written for this job (ai_site_jobs.last_event_seq). */
  lastEventSeq: number
}

export interface AgentDeps {
  store: ProjectStore
  models: AgentModels
  capabilities: () => Promise<RuntimeCapabilities | null>
  knowledge?: KnowledgeSearch
  slop?: SlopEvaluator
  renderCheck?: RenderChecker
  tokensToSettings?: TokensMapper
  /**
   * THE VISUAL CRITIC (round O, O4, lib/ai-builder/visual-critic): before finish, the pages the job made are
   * drawn in a headless browser with JavaScript off, measured and reviewed by a vision model; its defects come
   * back as repair work. Absent: no design review (and nothing is claimed about one).
   */
  visualCritic?: VisualCriticRunner
  /** Whether the editor draws form_picker (L4 landed it; default: whether the control registry has it). */
  features?: { formPicker?: boolean }
  /** Each event as it happens (L2 writes ai_site_job_events). Never throws into the loop. */
  emit?: (event: AgentEvent) => Promise<void> | void
  /** Checked before every model call and every tool: true stops the job as cancelled. */
  cancelled?: () => Promise<boolean>
  /** Runtime errors the editor canvas reported since the last slice (RuntimePreviewError, via L2). */
  previewErrors?: () => Promise<{ page: string; sectionId: string; message: string }[]>
  now?: () => number
}

export type { SectionInstance }
