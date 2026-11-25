/**
 * ===========================================================================
 *  AI WEBSITE BUILDER AS A CODING AGENT: THE SHARED CONTRACT (round L, L0)
 * ===========================================================================
 * Types only, plus a few constants every workstream must agree on. No
 * implementation lives here. See docs/ai-builder/architecture.md.
 *
 * The one decision everything else follows (architecture D1): a code
 * component is a `.storelib` section file, `sections/ai_<slug>.storelib`, in
 * `store_theme_custom_files`. Its `<schema>` is the manifest the editor
 * already draws; the live site renders it on the server with Storelib's own
 * template interpreter (no generated code runs on the server); its
 * `<script>`, if any, runs in the opaque-origin sandbox.
 *
 * Owners: types are L0's; extend minimally and say so in your report.
 */
import type { SchemaFieldType, SectionInstance } from "@/lib/website-builder/types"

/* ── components and files ─────────────────────────────────────────────── */

/** Every AI component type starts with this, so it can never shadow a theme section. */
export const AI_COMPONENT_PREFIX = "ai_"

/** `ai_` and 1 to 60 lowercase letters, digits or underscores. */
export type AiComponentType = `ai_${string}`

export function isAiComponentType(type: unknown): type is AiComponentType {
  return typeof type === "string" && /^ai_[a-z0-9_]{1,60}$/.test(type)
}

/** Where a component's source lives in the install's files. */
export function componentPath(type: AiComponentType, kind: "section" | "block" = "section"): string {
  return `${kind === "section" ? "sections" : "blocks"}/${type}.storelib`
}

/**
 * The runtime a component is written for. Only "storelib" exists this round.
 * "tsx_island" is reserved (architecture D1): compiled in the browser, run in
 * the section sandbox, with a server rendered .storelib fallback.
 */
export type ComponentRuntime = "storelib" | "tsx_island"

/** One file of a website's project, as the agent and the editor see it (a row of store_theme_custom_files). */
export interface ProjectFile {
  path: string
  /** What is live. "" for a file never published. */
  content: string
  /** What the editor shows and the agent edits. Null when the draft is the live text. */
  draftContent: string | null
  updatedAt: string | null
}

/** A write the agent or the editor asks for. Always to the DRAFT half. */
export interface ProjectFileWrite {
  path: string
  content: string
  /**
   * sha256 (hex) of the draft text the writer last read, or null for a new
   * file. A mismatch means somebody else wrote in between: the write is
   * refused with `conflict` and the writer must read again.
   */
  expectedVersion: string | null
  author: FileAuthor
  jobId?: string
}

export type FileAuthor = "creator" | "ai" | "import" | "restore"

export type FileWriteResult =
  | { ok: true; path: string; version: string }
  | { ok: false; path: string; reason: "conflict" | "invalid" | "too_large" | "forbidden_path"; issues?: ValidationIssue[] }

/* ── the manifest: what the editor lets a person change ────────────────── */

/** Settings shared by every editable prop. `id` is the setting id in the `<schema>`. */
interface PropBase {
  id: string
  label: string
  info?: string
  /** A different value per breakpoint (desktop, tablet, mobile): the existing responsive values. */
  responsive?: boolean
  /** The panel group heading it sits under (a `header` field before it). */
  group?: string
  /** lib/storelib-theme/visible-if.ts expression. */
  visibleIf?: string
}

/**
 * One editable prop. Each kind maps to an existing control type
 * (lib/storelib-theme/controls/registry.ts); see lib/ai-builder/manifest.ts
 * PROP_CONTROL. Bindings hold ids that MUST come from list_capabilities.
 */
export type EditableProp =
  | (PropBase & { kind: "text"; default?: string; placeholder?: string })
  | (PropBase & { kind: "textarea"; default?: string })
  | (PropBase & { kind: "richtext"; default?: string; inline?: boolean })
  | (PropBase & { kind: "image"; default?: string; altId?: string; focalPoint?: boolean })
  | (PropBase & { kind: "video"; default?: string; source: "upload" | "url" })
  | (PropBase & { kind: "color"; default?: string })
  | (PropBase & { kind: "color_scheme"; default?: string })
  | (PropBase & { kind: "font"; default?: string })
  | (PropBase & { kind: "spacing"; default?: number; min: number; max: number; step?: number })
  | (PropBase & { kind: "number"; default?: number; min?: number; max?: number; step?: number; unit?: string; slider?: boolean })
  | (PropBase & { kind: "select"; default?: string; options: { label: string; value: string }[]; style?: "dropdown" | "radio" })
  | (PropBase & { kind: "boolean"; default?: boolean })
  | (PropBase & { kind: "link"; default?: string })
  | (PropBase & { kind: "icon"; default?: string })
  | (PropBase & { kind: "alignment"; default?: "left" | "center" | "right" })
  /**
   * The section's entrance animation. With id "animation" it is the one the
   * page plays (SectionRenderer data-animation, lib/website-builder/
   * section-motion.ts) and the section's own panel shows it instead of the
   * generic one. `timing` adds `<id>_duration` and `<id>_delay` (ms). Values
   * are SECTION_ANIMATIONS; the older ANIMATION_STYLES names are read too.
   */
  | (PropBase & { kind: "animation"; default?: AnimationStyle | SectionAnimationValue; timing?: boolean })
  | (PropBase & { kind: "binding"; binding: DataBindingKind; limit?: number })
  /* Round L (L5): the style groups the sidebar draws with the existing controls. */
  /** A corner radius in px (range). Empty in the template means the token: `var(--t-radius-md)`. */
  | (PropBase & { kind: "radius"; default?: number; max?: number })
  /** A width or height with a unit (range). */
  | (PropBase & { kind: "size"; default?: number; min: number; max: number; step?: number; unit: SizeUnit })
  /** A shadow level, read as `var(--t-shadow-{{ settings.x }}, none)`. */
  | (PropBase & { kind: "shadow"; default?: ShadowLevel })
  /** A border: its width (range px) and `<id>_color` (colour, empty = the scheme's border). */
  | (PropBase & { kind: "border"; default?: number; colorDefault?: string })
  /** A background: a colour or a gradient (color_background). */
  | (PropBase & { kind: "background"; default?: string })
  /** Where an element shows: both, desktop or phone. Put it on an element as `data-show-on="{{ settings.x }}"`. */
  | (PropBase & { kind: "visibility"; default?: Visibility })

export type EditablePropKind = EditableProp["kind"]
export type BindingProp = Extract<EditableProp, { kind: "binding" }>

/** The section Animation values the theme already offers (lib/website-builder/theme-settings-schema.ts animation_style). */
import type { MotionTier } from "@/lib/storelib-ai/motion"

export const ANIMATION_STYLES = ["fade-up", "fade-in", "rise", "blur-in", "zoom-in", "slide-left", "slide-right"] as const
export type AnimationStyle = (typeof ANIMATION_STYLES)[number]

/**
 * The values the page plays for a section's `animation` setting
 * (lib/website-builder/section-anchors.ts SECTION_ANIMATIONS). "theme"
 * follows Theme settings › Animations. Added in round L (L5): the
 * ANIMATION_STYLES names above are Theme settings' own spelling and played as
 * "theme" when a section stored them.
 */
export const SECTION_ANIMATION_VALUES = ["theme", "none", "fade", "fade_up", "zoom", "slide_left", "slide_right", "blur", "rise"] as const
export type SectionAnimationValue = (typeof SECTION_ANIMATION_VALUES)[number]

export type SizeUnit = "px" | "%" | "vw" | "vh" | "rem"
export const SHADOW_LEVELS = ["none", "sm", "md", "lg"] as const
export type ShadowLevel = (typeof SHADOW_LEVELS)[number]
export const VISIBILITY_VALUES = ["both", "desktop", "mobile"] as const
export type Visibility = (typeof VISIBILITY_VALUES)[number]

/**
 * Native Storelib data a prop can hold a reference to. Resolved on the server,
 * tenant scoped: an id that is not this creator's renders empty
 * (lib/storelib-theme/resolve.ts). `form` needs the new `form_picker`
 * control (L4 resolves, L5 draws).
 */
export type DataBindingKind = "product" | "products" | "collection" | "collections" | "community" | "page" | "menu" | "form"

/** Repeating items: a block type the component declares, each item editable with its own props. */
export interface ItemManifest {
  type: string
  name: string
  props: EditableProp[]
  /** How many of this type at most. */
  limit?: number
  /**
   * How many of this type a placed section needs at least (schema `min_blocks`, round P). Absent: 3 for a
   * repeating list (FAQ, programme, team, steps, plans), 1 otherwise; 0 for an optional item type.
   */
  min?: number
}

/** The items (and settings) a component arrives with when placed or added: its schema's first preset (round P). */
export interface ComponentPreset {
  settings?: Record<string, unknown>
  blocks: { type: string; settings?: Record<string, unknown> }[]
}

/** Where a component may be placed. */
export interface ComponentPlacement {
  /** "body" is a page; the rest are section groups (lib/storelib-theme/section-groups.ts). */
  groups: ("body" | "header" | "footer" | "overlay")[]
  /** A component that replaces the built-in header or footer. */
  kind?: "header" | "footer"
}

/** Script capabilities, as lib/storelib-theme/storelib/script.ts CAPABILITIES. */
export type ScriptCapability = "navigation" | "commerce" | "analytics" | "forms" | "timers" | "embed" | "database"

/**
 * What the agent writes about a component and what the editor shows. The
 * FILE is the truth: this is turned into the file's `<schema>`
 * (manifestToSchema) and read back from it (schemaToManifest, L5),
 * never stored apart from the file.
 */
export interface ComponentManifest {
  type: AiComponentType
  name: string
  description?: string
  /** Add section category (lib/website-builder/section-categories.ts). */
  category?: string
  runtime: ComponentRuntime
  props: EditableProp[]
  items?: ItemManifest[]
  maxItems?: number
  /** Filled items for every item type (round P): what a placement and the editor's Add section start with. */
  preset?: ComponentPreset
  placement: ComponentPlacement
  capabilities: ScriptCapability[]
  /** Token CSS variables it reads, for the token panel's "used by". */
  tokens?: string[]
}

/** A placed component: an ordinary section instance whose type is an AI component. Stable `id`, never reused. */
export type CodeSectionInstance = SectionInstance & { type: AiComponentType }

/* ── design tokens ────────────────────────────────────────────────────── */

/**
 * A website's design tokens as the agent sets them. Written into Theme
 * settings (colour schemes, typography, radius, spacing, motion) so every one
 * is editable in Theme settings; what has no Theme setting goes to
 * `custom_tokens` and is emitted as `--t-<name>` (architecture D3).
 */
export interface DesignTokens {
  colors: {
    background: string
    surface: string
    text: string
    muted: string
    accent: string
    accentText: string
    border: string
    /** A dark band, for contrast sections. */
    inverse?: { background: string; text: string; accent: string }
  }
  fonts: { heading: string; body: string; accent?: string }
  /**
   * The type scale (round L, L5): body size in px and the ratio each heading
   * step grows by. Written to Theme settings › Typography's text styles, so
   * every one is still editable there. Absent keeps the theme's.
   */
  typeScale?: { base: number; ratio: number }
  /** The card shadow every component reads as var(--t-shadow): a level (round L, L5). */
  shadow?: ShadowLevel
  /** Pixels. */
  radius: { small: number; medium: number; large: number }
  spacing: { scale: number; sectionY: number; pageWidth: number; gutter: number }
  /** `tier` is the site's motion feel (round O, O5, lib/storelib-ai/motion): Theme setting motion_tier, the --t-motion-* variables. Absent follows `level`. */
  motion: { level: "none" | "subtle" | "expressive"; style?: AnimationStyle; durationMs?: number; tier?: MotionTier }
  /** CSS custom properties without a Theme setting: name (no `--t-`) to value. Checked: no url(), no expression. */
  custom?: Record<string, string>
}

/** The Theme setting key `custom` tokens are stored under. */
export const CUSTOM_TOKENS_SETTING = "custom_tokens"
export const CUSTOM_TOKEN_PREFIX = "--t-"

/* ── starting a website ───────────────────────────────────────────────── */

/** Start from nothing (no theme sections, no header or footer) or work inside an existing website. */
export type GenerationMode = "blank" | "theme"

/** The example chips on Describe your website, by id. The chip's TEXT is still the prompt. */
export const START_CATEGORIES = ["candle_shop", "fitness_coach", "photographer", "online_course"] as const
export type StartCategory = (typeof START_CATEGORIES)[number]

export interface StartOptions {
  generation: GenerationMode
  category?: StartCategory
  /** A design preset id (lib/website-builder/design-presets.ts) the person picked, if any. */
  preset?: string
  preferences?: {
    pages?: string[]
    tone?: string
    /** Brand colours the person gave, hex. */
    colors?: string[]
    language?: string
  }
  /**
   * Round 26: the Materia template (CODE_TEMPLATES `template`, e.g. "trainer") the new website was made from,
   * chosen and imported by the server before the job runs (lib/themes/template-install.ts). Never taken from the
   * browser: parseStartOptions does not read it.
   */
  template?: string
}

/** POST /api/website-builder/themes/create body for Start with AI. */
export interface StartRequest {
  mode: "ai"
  prompt: string
  /** The press's idempotency key (lib/website-builder/ai-site/start.ts isStartKey). */
  key: string
  options?: StartOptions
}

/* ── the job ──────────────────────────────────────────────────────────── */

/** classic: today's five step pipeline (lib/website-builder/ai-site/job.ts). agent: the tool loop. */
export type JobEngine = "classic" | "agent"

/** ai_site_jobs.status after SQL part 401 (adds `cancelled`). */
export type AgentJobStatus = "queued" | "running" | "complete" | "partial" | "failed" | "cancelled"

/** What the agent is doing, for the progress view. ai_site_jobs.phase. */
export type AgentPhase = "brief" | "plan" | "build" | "verify" | "repair" | "finish"

export interface JobBudget {
  /** Total wall clock across every invocation. */
  maxWallMs: number
  /** Model turns. */
  maxIterations: number
  /** Platform spend, USD. */
  maxUsd: number
  /** When the creator's own key answers. */
  maxUsdOwnKey: number
  maxOutputTokensPerCall: number
  /** One serverless invocation's working time before it checkpoints and chains (server.ts RUN_BUDGET_MS). */
  perInvocationMs: number
  /** Stop starting a model call when less than this is left in the invocation. */
  callReserveMs: number
  /** Compile/validate repair attempts per file. */
  maxRepairsPerFile: number
  /** Whole-site verify then repair cycles. */
  maxVerifyCycles: number
  /**
   * Round P (P1): pictures per job (generate_image + find_photo that worked). Their cost is counted in
   * maxUsd like a model call. Optional so a budget saved before round P still reads; absent is 16.
   */
  maxImages?: number
}

export const DEFAULT_JOB_BUDGET: JobBudget = {
  /* Round N: a whole site (10+ home sections, every page and template) is 25 to 40 components. */
  /* Round BB: a job is never stopped part way by its own caps on a normal site; these are runaway guards only. */
  maxWallMs: 120 * 60_000,
  maxIterations: 400,
  /*
    Round P (P5): the build phase writes on claude-opus-5-5 at effort high and pictures are made (P1, counted in
    the same spend). lib/ai-builder/agent/model-routing.ts estimateSiteUsd puts a typical whole site at about
    $13.50 of model calls (it was about $7.30, close to the old $10 cap); $20 leaves room for pictures and
    repairs. The cap is still checked before every call with that call's worst case.
  */
  maxUsd: 200,
  maxUsdOwnKey: 400,
  maxOutputTokensPerCall: 24_000,
  perInvocationMs: 240_000,
  callReserveMs: 60_000,
  maxRepairsPerFile: 3,
  maxVerifyCycles: 3,
  maxImages: 16,
}

/** Why a job stopped early. */
export type BudgetStop = "wall_clock" | "iterations" | "spend" | "repairs" | "cancelled"

/**
 * The resumable state of the loop, saved to ai_site_jobs.checkpoint after
 * every iteration (bounded, see MAX_CHECKPOINT_BYTES). Files are never kept
 * here: they are in the database.
 */
export interface AgentCheckpoint {
  version: 1
  iteration: number
  phase: AgentPhase
  /** The compacted conversation: provider-neutral turns. Old tool results become one line summaries. */
  turns: CheckpointTurn[]
  /** What was decided so far, rewritten on compaction. */
  summary: string
  openTasks: string[]
  filesTouched: string[]
  pagesTouched: string[]
  repairs: Record<string, number>
  verifyCycles: number
  stopped?: BudgetStop
}

export interface CheckpointTurn {
  role: "user" | "assistant" | "tool"
  text?: string
  toolCalls?: { id: string; name: string; argumentsJson: string }[]
  toolCallId?: string
}

export const MAX_CHECKPOINT_BYTES = 256 * 1024

/* ── progress events (ai_site_job_events) ─────────────────────────────── */

interface EventBase {
  seq: number
  at: string
}

/**
 * One row of ai_site_job_events, in `payload` with `kind`. The progress view
 * draws these; nothing private (no prompt text beyond the job's own, no keys,
 * no full file bodies) goes in an event.
 */
export type AgentEvent =
  | (EventBase & { kind: "phase"; phase: AgentPhase; label: string })
  | (EventBase & { kind: "tool"; tool: AgentToolName; summary: string; ok: boolean; ms: number })
  | (EventBase & { kind: "file"; path: string; action: "created" | "updated" | "deleted"; bytes: number })
  | (EventBase & { kind: "page"; page: string; title: string; action: "created" | "updated" | "removed"; sections: number })
  | (EventBase & { kind: "tokens"; changed: string[] })
  | (EventBase & { kind: "validation"; path?: string; errors: number; warnings: number })
  | (EventBase & { kind: "repair"; path: string; attempt: number })
  /* `shot` (round O, O4): the design review kept a photograph of the draft's first screen for this job (GET .../ai-jobs/[id]/review-shot). */
  | (EventBase & { kind: "note"; text: string; shot?: boolean })
  | (EventBase & { kind: "spend"; usd: number; inputTokens: number; outputTokens: number; iteration: number })
  | (EventBase & { kind: "error"; message: string; retryable: boolean })
  | (EventBase & { kind: "finished"; status: AgentJobStatus; stopped?: BudgetStop })

export type AgentEventKind = AgentEvent["kind"]

/** The event kinds SQL part 401 allows in ai_site_job_events.kind. Keep in sync (tests/ai-builder-contracts.test.ts). */
export const AGENT_EVENT_KINDS: readonly AgentEventKind[] = ["phase", "tool", "file", "page", "tokens", "validation", "repair", "note", "spend", "error", "finished"]

/* ── validation ───────────────────────────────────────────────────────── */

export interface ValidationIssue {
  severity: "error" | "warning"
  /** compile.*, schema.*, script.*, manifest.*, token.*, import.*, binding.*, render.*, runtime.*, slop.*, a11y.* */
  code: string
  message: string
  path?: string
  line?: number
  sectionId?: string
}

/** A runtime error the editor canvas saw in the sandbox, posted to the job (POST .../ai-jobs/[id]/events). */
export interface RuntimePreviewError {
  installId: string
  page: string
  sectionId: string
  type: string
  message: string
  at: string
}

/* ── tools ────────────────────────────────────────────────────────────── */

export const AGENT_TOOL_NAMES = [
  "list_files",
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "list_pages",
  "add_page",
  "set_page_sections",
  "set_section_settings",
  "set_tokens",
  "list_capabilities",
  "bind_data",
  "search_knowledge",
  "validate",
  "render_check",
  "report_progress",
  "finish",
  /* Round P (P1): pictures made or found, kept in the creator's files (lib/storelib-ai/images). */
  "generate_image",
  "find_photo",
  /* Round P (P2a + P5): the starting templates, browsable. */
  "list_templates",
] as const
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number]

/* ── knowledge ────────────────────────────────────────────────────────── */

/**
 * L6 extended this with "core" (how the agent works a brief), "storelib" (presenting real store data) and
 * "debugging" (repairing generated code): the library has entries of those kinds that fit none of the others.
 * Typography and colour map to "style"; headers, footers and responsive to "layout"; states and accessibility
 * to "component" (lib/storelib-ai/library/types.ts, KIND_OF_CATEGORY).
 */
export type KnowledgeKind = "style" | "layout" | "component" | "motion" | "industry" | "anti_slop" | "resource" | "core" | "storelib" | "debugging"

export interface KnowledgeEntry {
  id: string
  kind: KnowledgeKind
  title: string
  tags: string[]
  industries?: string[]
  /** Short, imperative, specific. Ships to the model. */
  body: string
  /** .storelib snippets that compile (tests check). */
  examples?: string[]
  avoid?: string[]
}

export interface KnowledgeQuery {
  text: string
  kinds?: KnowledgeKind[]
  industry?: string
  limit?: number
}

/** An external component library the agent may learn a pattern from. Never imported at runtime. */
export interface ResourceEntry {
  id: string
  name: string
  url: string
  /** SPDX id, or "verify" when not confirmed from the source. */
  license: string
  /** True only when a .storelib re-implementation exists in the library. */
  adapterSafe: boolean
  patterns: string[]
  notes?: string
}

/** A control type id the manifest maps to (re-exported for the mapper and its test). */
export type ManifestControlType = SchemaFieldType | "form_picker"

/* ── editing one component (round L, L5) ─────────────────────────────── */

/**
 * "Edit with AI" on one placed component: a scoped request for the agent, in
 * edit mode, on that file only. L2 owns the route that turns it into a job
 * (engine "agent", options.edit); until it answers, the editor hands the
 * same request to the page assistant with the section selected, which edits
 * the file through edit_section_code.
 */
export interface ComponentEditRequest {
  mode: "edit"
  /** sections/ai_<slug>.storelib (or any section file the creator owns). */
  path: string
  /** The placed instance the person had open, so the agent can read its settings. */
  sectionId?: string
  page?: string
  prompt: string
  /** sha256 of the draft the editor holds (fileVersion), so an edit made since is never overwritten. */
  expectedVersion: string | null
}

/** Where ComponentEditRequest is POSTed. 404 or 501 means the agent route is not there yet. */
export function componentEditEndpoint(installId: string): string {
  return `/api/website-builder/themes/${encodeURIComponent(installId)}/ai-edit`
}

/** One saved version of a file, as the history lists it (store_theme_file_versions, author from SQL part 401). */
export interface FileVersionEntry {
  id: string
  path: string
  content: string
  kind: "save" | "publish" | "restore" | string
  /** Null before part 401, or for a row written before it. */
  author: FileAuthor | null
  jobId: string | null
  created_at: string
}
