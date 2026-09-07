/**
 * Storelib Sites — a site is a code project.
 *
 * Files are the source of truth. There is no section model here and there must
 * not become one: the moment a second representation of "what the page says"
 * exists, the visual editor and the AI start disagreeing about which is
 * current, and the answer is always whichever one the user did not just edit.
 *
 * See docs/storelib-sites.md.
 */

export type SiteStatus = "draft" | "published" | "unpublished"
export type DeploymentStatus = "queued" | "building" | "ready" | "failed"

export interface SiteSettings {
  faviconUrl?: string
  seo?: { title?: string; description?: string; socialImageUrl?: string }
  /** Pro only. Free sites carry "Built with Storelib". */
  hideBranding?: boolean
}

export interface Site {
  id: string
  creatorId: string
  name: string
  /** `{slug}.storelib.site`. Null until the first publish. */
  slug: string | null
  status: SiteStatus
  templateId: string | null
  settings: SiteSettings
  publishedDeploymentId: string | null
  createdAt: string
  updatedAt: string
}

/** One text file. Binary lives in Storage with a row in `site_assets`. */
export interface SiteFile {
  path: string
  content: string
}

/** A whole project, as the bundler and the agent see it. */
export type ProjectFiles = Record<string, string>

export interface SiteDeployment {
  id: string
  siteId: string
  status: DeploymentStatus
  outputPath: string | null
  /** Developer detail. Never shown to a creator without them asking for it. */
  error: string | null
  createdAt: string
  finishedAt: string | null
}

/**
 * What the agent is allowed to do, named once.
 *
 * This is a closed list on purpose: "the AI can edit your website" is a
 * sentence that has to mean something bounded, and the bound is here rather
 * than in a prompt. Nothing in it reaches a database, a shell or a network.
 */
export type AgentTool =
  | "list_files"
  | "read_file"
  | "search_files"
  | "write_file"
  | "create_file"
  | "delete_file"
  | "apply_patch"
  | "run_build"
  | "read_build_errors"

export interface BuildError {
  file?: string
  line?: number
  column?: number
  message: string
}

export interface BuildResult {
  ok: boolean
  /** The bundled ESM module, when it built. */
  code?: string
  errors: BuildError[]
  warnings: BuildError[]
  durationMs: number
}
