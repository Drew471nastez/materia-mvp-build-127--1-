import "server-only"

/**
 * ===========================================================================
 *  THE ENGINE'S REAL DEPENDENCIES: SUPABASE, THE CREATOR'S MODELS, THE STORE
 * ===========================================================================
 * What L2's runner hands runAgentSlice for an `engine = 'agent'` job:
 *
 *   store         supabaseProjectStore(admin, installId): the install's
 *                 store_theme_custom_files (drafts, through saveThemeFile, so
 *                 an agent's file is held to everything a person's is: path,
 *                 size, compiler, names, one header, file count), the pages'
 *                 draft_sections and the draft Theme settings. Every version
 *                 row says author "ai" and the job id (part 401).
 *   models        resolveForCreator, exactly as jobModels: the creator's own
 *                 Claude key first, the platform's otherwise; Claude models
 *                 by default (plan claude-opus-5-5, loop claude-sonnet-5-5,
 *                 small claude-haiku-5-5).
 *   capabilities  L4's readRuntimeCapabilities: creator scoped, real ids.
 *   renderCheck   L4's renderCheckForInstall: the page as a preview draws it.
 *   references    O1's visual reference library with the admin's screenshots.
 *
 * The admin (service role) client is used only for this job's install: the
 * runner checked ownership when it claimed the job; nothing here takes an id
 * from the model.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveForCreator } from "@/lib/sites/agent/provider"
import { sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { readRuntimeCapabilities } from "../capabilities"
import { renderCheckForInstall } from "../render-check-server"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL } from "@/lib/website-builder/ai-site/models"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { AgentDeps, AgentModels, ProjectStore, StoredFile, StoredPage, StoreWriteResult } from "./ports"
import { versionOf } from "./version"
import { createVisualCritic } from "../visual-critic/critic"
import { keepReviewShot } from "../visual-critic/storage"
import { readFingerprints, type SiteFingerprint } from "../novelty"
import { findReferencesIn, referenceImagesFrom } from "@/lib/storelib-ai/references/store"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

const FILES = "store_theme_custom_files"

export function supabaseProjectStore(db: Db, installId: string): ProjectStore {
  const toFile = (r: { path: string; content: string | null; draft_content?: string | null; updated_at?: string | null }): StoredFile => ({ path: r.path, text: editorContent({ content: r.content ?? "", draft_content: r.draft_content ?? null }), updatedAt: r.updated_at ?? null })
  async function row(path: string) {
    const { data, error } = await db.from(FILES).select("path, content, draft_content, updated_at").eq("install_id", installId).eq("path", path).maybeSingle()
    if (error) throw new Error("the file could not be read")
    return (data ?? null) as { path: string; content: string | null; draft_content: string | null; updated_at: string | null } | null
  }
  return {
    async listFiles() {
      const { data, error } = await db.from(FILES).select("path, content, draft_content, updated_at").eq("install_id", installId).order("path").limit(2_000)
      if (error) throw new Error("the files could not be read")
      return ((data ?? []) as Parameters<typeof toFile>[0][]).map(toFile)
    },
    async readFile(path) {
      const r = await row(path)
      return r ? toFile(r) : null
    },
    async writeFile(path, text, meta): Promise<StoreWriteResult> {
      const current = await row(path)
      const currentVersion = current ? versionOf(toFile(current).text) : null
      if (currentVersion !== meta.expectedVersion) return { ok: false, error: "The file changed since it was read.", conflict: true }
      const saved = await saveThemeFile(db, installId, path, text, { ...(current?.updated_at ? { baseUpdatedAt: current.updated_at } : {}), author: meta.author, jobId: meta.jobId })
      if (saved.ok === false) return { ok: false, error: saved.error, conflict: saved.status === 409 && "conflict" in saved }
      return { ok: true, updatedAt: (saved.row as { updated_at?: string | null }).updated_at ?? null, created: saved.created }
    },
    async deleteFile(path) {
      const { error } = await db.from(FILES).delete().eq("install_id", installId).eq("path", path)
      return error ? { ok: false, error: "the file could not be deleted" } : { ok: true }
    },
    async listPages() {
      const { data, error } = await db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId)
      if (error) throw new Error("the pages could not be read")
      return ((data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((r) => {
        const raw = r.draft_sections ?? r.sections
        return { key: r.page_key, sections: sanitizeSections(Array.isArray(raw) ? (raw as SectionInstance[]) : []) }
      })
    },
    async writePages(pages: StoredPage[]) {
      const { data: existing } = await db.from("store_theme_pages").select("page_key").eq("install_id", installId)
      const have = new Set(((existing ?? []) as { page_key: string }[]).map((r) => r.page_key))
      for (const p of pages) {
        const sections = sanitizeSections(p.sections)
        const write = have.has(p.key)
          ? await db.from("store_theme_pages").update({ draft_sections: sections }).eq("install_id", installId).eq("page_key", p.key)
          : await db.from("store_theme_pages").insert({ install_id: installId, page_key: p.key, sections: [], draft_sections: sections })
        if (write?.error) throw new Error(`the page ${p.key} could not be saved`)
      }
    },
    async readSettings() {
      const { data } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
      const s = (data ?? {}) as { settings?: unknown; draft_settings?: unknown }
      return ((s.draft_settings ?? s.settings ?? {}) as Record<string, unknown>) || {}
    },
    async writeSettings(patch) {
      const { data } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
      const s = (data ?? {}) as { settings?: unknown; draft_settings?: unknown }
      const next = sanitizeThemeSettings({ ...((s.draft_settings ?? s.settings ?? {}) as Record<string, unknown>), ...patch })
      const { error } = data
        ? await db.from("store_theme_settings").update({ draft_settings: next }).eq("install_id", installId)
        : await db.from("store_theme_settings").insert({ install_id: installId, settings: {}, draft_settings: next })
      if (error) throw new Error("the theme settings could not be saved")
    },
  }
}

/**
 * ROUND O (spec 8.4): the fingerprints of the platform's recent finished agent sites, for the soft novelty warning.
 * One small query per job (memoised), reading only checkpoint->fingerprint: a handful of words per site (section
 * roles, hero shape, palette and type buckets), no copy, no names, no ids, so nothing of another creator's site
 * reaches this job. Live jobs (this one included) are not compared. Fails quiet: no comparison, never a blocked job.
 */
export function recentAgentFingerprints(db: Db, limit = 40): () => Promise<SiteFingerprint[]> {
  let memo: Promise<SiteFingerprint[]> | null = null
  return () => {
    memo ??= (async () => {
      try {
      const { data, error } = await db
        .from("ai_site_jobs")
        .select("fp:checkpoint->fingerprint")
        .eq("engine", "agent")
        .in("status", ["complete", "partial"])
        .not("checkpoint->fingerprint", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error) return []
      return readFingerprints(((data ?? []) as { fp: unknown }[]).map((r) => r.fp), limit)
      } catch {
        return []
      }
    })()
    return memo
  }
}

/** The three models, answered on the creator's own Claude key when they connected one (as ai-site/runner.ts jobModels). */
export async function agentModels(creatorId: string): Promise<AgentModels> {
  const [plan, loop, small] = await Promise.all([
    resolveForCreator(creatorId, { requested: "anthropic", tier: "strong", model: PLAN_MODEL }),
    resolveForCreator(creatorId, { requested: "anthropic", tier: "fast", model: WRITE_MODEL }),
    resolveForCreator(creatorId, { requested: "anthropic", tier: "fast", model: SMALL_MODEL }),
  ])
  return {
    plan: { provider: plan.provider, model: plan.model, effort: "medium" },
    loop: { provider: loop.provider, model: loop.model, effort: "medium" /* round N: agent coding wants medium; low wrote thinner sites */ },
    /*
      Round P (P5): the build phase (writing the components, the quality-critical calls) on the strong model at
      effort high, on the same key as plan. Routed by phase, not per turn (./model-routing.ts: caches are per
      model). Typical site estimate there: about $13.50 against $7.30 before, inside the raised JobBudget cap.
    */
    write: { provider: plan.provider, model: plan.model, effort: "high" },
    small: { provider: small.provider, model: small.model, effort: "low" },
    /* Round O (O4): the design review looks at the rendered draft with the strong model (claude-opus-5-5), on the same key. */
    review: { provider: plan.provider, model: plan.model, effort: "medium" },
    ownKey: loop.own !== null,
  }
}

/**
 * Everything runAgentSlice needs for one job, on the real services. L2 adds
 * `emit` (ai_site_job_events), `cancelled` (cancel_requested_at) and
 * `previewErrors` (the editor bridge) from the job row it holds.
 */
export async function agentDeps(job: { creatorId: string; ownerUserId: string | null; installId: string; jobId?: string }, extra: Partial<AgentDeps> = {}): Promise<AgentDeps> {
  const admin = createAdminClient() as unknown as Db
  /* Given models (a scripted run, tests/ai-builder-e2e-kit.ts) are used as they are: no key is looked up for them. */
  const models = extra.models ?? (await agentModels(job.creatorId))
  return {
    store: supabaseProjectStore(admin, job.installId),
    models,
    /*
      Round O (O4): the visual critic. The draft drawn from this install's own project in headless Chromium with
      JavaScript off, measured, and looked at by models.review (absent for scripted models: measured only). No
      browser here: "not visually checked". The newest first-screen photograph is kept privately for the panel.
    */
    visualCritic: createVisualCritic({
      review: models.review ?? null,
      ...(job.jobId ? { keepShot: (jpeg: string) => keepReviewShot(admin as never, { installId: job.installId, jobId: job.jobId as string }, jpeg) } : {}),
    }),
    /* L4: this creator's real data with ids (products with variants and Buy now links, collections, communities, forms, pages, menus). */
    capabilities: () => readRuntimeCapabilities(admin, { creatorId: job.creatorId, ownerUserId: job.ownerUserId, installId: job.installId }),
    /* L4: the page as a preview link draws it (draft page in home's chrome, saved files, this creator's data), rendered by the template engine. */
    renderCheck: async ({ page, capabilities }) => {
      const r = await renderCheckForInstall(admin, { creatorId: job.creatorId, installId: job.installId, page, ...(capabilities ? { capabilities } : {}) })
      return { ok: r.ok, issues: r.issues, htmlBytes: r.htmlBytes, ...(r.drawn ? { drawn: r.drawn } : {}) }
    },
    features: { formPicker: true },
    recentFingerprints: recentAgentFingerprints(admin),
    /* O1: the built in references and the admin's screenshots (design_references, part 431); their pictures for the plan phase. */
    references: {
      search: ({ query, industry, limit }) => findReferencesIn(admin as unknown as Parameters<typeof findReferencesIn>[0], { text: query, industry }, { limit: limit ?? 4 }),
      images: (ids) => referenceImagesFrom(admin as unknown as Parameters<typeof referenceImagesFrom>[0], ids),
    },
    ...extra,
  }
}

