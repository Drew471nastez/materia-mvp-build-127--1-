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
import type { SiteFingerprint } from "../novelty"
import type { AgentImage } from "@/lib/sites/agent/attachments"
import type { AgentProvider } from "@/lib/sites/agent/types"
import type { DesignReference } from "@/lib/storelib-ai/references/types"
import type { GenerateImageInput, ImageAspect, ImageOutcome, ImageProviderId } from "@/lib/storelib-ai/images/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { VisualCriticRunner } from "../visual-critic/critic"
import type { SiteTemplate } from "@/lib/storelib-ai/templates"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
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
  /**
   * Round P (P5): the build phase, where the components are written (the quality-critical calls):
   * claude-opus-5-5 at effort high (./models.ts routeFor). Absent: the build runs on `loop`.
   */
  write?: ModelRole
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

/**
 * Anti slop review of the files the job wrote. `slop.*` issues; error severity is "high".
 * Round O: also the creator's own words (`brief`, so only they can ask for the editorial serif
 * or purple look), the Theme settings (the tokens a visitor sees) and the pages as drawn.
 */
export type SlopEvaluator = (input: {
  files: { path: string; text: string }[]
  concept: unknown
  capabilities: RuntimeCapabilities | null
  brief?: string
  settings?: Record<string, unknown>
  rendered?: { page: string; html: string; css?: string }[]
  /** Home's sections in order, for the page-level rules (template skeleton). */
  sections?: { type: string }[]
  /** Round 56: the P1 rules the starting template shipped with: reported, tagged, not counted against the budget. */
  baseline?: string[]
}) => Promise<ValidationIssue[]>

/** A page drawn with the template engine (interpretation only) and checked. */
export type RenderChecker = (input: {
  page: string
  sections: SectionInstance[]
  settings: Record<string, unknown>
  sources: Record<string, string>
  routes: Set<string>
  capabilities?: RuntimeCapabilities | null
}) => Promise<{ ok: boolean; issues: ValidationIssue[]; htmlBytes: number; drawn?: { html: string; css: string } }>

/**
 * Round O (O1): the visual reference library. `search` picks the few
 * references for this brief (lib/storelib-ai/references searchReferences,
 * with the admin's screenshots on the server); `images` loads the pictures
 * of those that have one, as base64 for a multimodal turn.
 */
export interface ReferenceSource {
  search: (brief: { query: string; industry?: string; limit?: number }) => Promise<DesignReference[]>
  images: (ids: string[]) => Promise<{ id: string; image: AgentImage }[]>
}

/**
 * Round P (P2 + P5): the starting templates (lib/storelib-ai/templates, P2's). The agent starts a new website
 * from the closest one, then adapts it. ./templates.ts defaultTemplates adapts P2's module to this shape.
 */
export interface TemplateLibrary {
  /** The closest template for the job's creative brief and chosen direction, or null. */
  choose(brief: CreativeBrief, choice: DirectionChoice | null): SiteTemplate | null | Promise<SiteTemplate | null>
  byId(id: string): SiteTemplate | null
  /** Writes the template into the install (drafts). `files` and `pages` are what it wrote; `next` its adaptation notes. */
  apply(store: ProjectStore, template: SiteTemplate, brief: CreativeBrief, meta: { jobId: string; choice: DirectionChoice | null }): Promise<{ ok: boolean; files: string[]; pages: string[]; next?: string; problems?: string[] }>
  /** What is still the template's own: copy (files and placed sections, named) and picture slots still empty. */
  untouched(project: { files: Record<string, string>; pages: StoredPage[] }, template: SiteTemplate): { copy: string[]; images: string[] }
  /**
   * Round AZ: worked examples from the AI source bank for the first brief (./bank-templates.ts), "" when none.
   * `chosen` is the template poured in, or null.
   */
  patterns?(brief: CreativeBrief, chosen: SiteTemplate | null): Promise<string>
}

/**
 * Round P (P1): pictures for the job, bound to its creator and store owner
 * (lib/storelib-ai/images generateImage / findPhoto; ./server.ts). The tools
 * add the art direction, keep to the job's picture limit and spend, and run
 * several side by side.
 */
export interface ImageService {
  /** What this environment can do: a generator (OpenAI, else Gemini) and/or stock (Pexels). */
  available: () => Promise<{ generate: ImageProviderId | null; stock: boolean }>
  generate: (input: Omit<GenerateImageInput, "creatorId" | "ownerUserId" | "jobId">) => Promise<ImageOutcome>
  find: (input: { query: string; aspect?: ImageAspect; alt?: string; purpose?: string }) => Promise<ImageOutcome>
  /** The most one picture can cost here (USD), checked against the spend left before it starts. */
  ceiling: (aspect: ImageAspect) => number
  /** Overrides the job budget's maxImages (AI_BUILDER_MAX_IMAGES). */
  maxImages?: number
}

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
  /** O1's visual references (./knowledge.ts libraryReferences by default: the built in library, no pictures). */
  references?: ReferenceSource
  slop?: SlopEvaluator
  /**
   * Round O (spec 8.4): fingerprints of the platform's recent agent-built sites, for the soft
   * novelty warning at verify. Absent or failing: no comparison (never blocks a job).
   */
  recentFingerprints?: () => Promise<SiteFingerprint[]>
  /**
   * Round 56: the art directions and design brain recipes the platform's most recent sites used (both engines), so
   * the next site leans away from them. Ids only, never another creator's content. Absent: no pressure.
   */
  recentDesigns?: () => Promise<{ directions: string[]; recipes: string[] }>
  renderCheck?: RenderChecker
  tokensToSettings?: TokensMapper
  /**
   * THE VISUAL CRITIC (round O, O4, lib/ai-builder/visual-critic): before finish, the pages the job made are
   * drawn in a headless browser with JavaScript off, measured and reviewed by a vision model; its defects come
   * back as repair work. Absent: no design review (and nothing is claimed about one).
   */
  visualCritic?: VisualCriticRunner
  /** Round P (P5): the starting templates. Absent: lib/storelib-ai/templates (./templates.ts defaultTemplates). */
  templates?: TemplateLibrary
  /**
   * Round P (P5): overrides whether this job can make or find pictures (default: `images.available()`, a
   * generator or stock search). True: every image slot the design has must hold a picture before finish.
   * False: sections are made text-forward instead (never an empty frame to visitors).
   */
  imageProvider?: () => boolean | Promise<boolean>
  /** Round P (P1): pictures. Absent: the tools refuse and the brief says to design text-forward. */
  images?: ImageService
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
