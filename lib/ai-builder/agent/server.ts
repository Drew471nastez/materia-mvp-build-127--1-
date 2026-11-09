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
 *   capabilities  readCapabilities (ai-site/capabilities.ts) with ids, as the
 *                 contract's RuntimeCapabilities.
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
import { readStoreFacts } from "@/lib/website-builder/agent/store-facts-server"
import { readCapabilities, type Capabilities } from "@/lib/website-builder/ai-site/capabilities"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL } from "@/lib/website-builder/ai-site/models"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { AgentDeps, AgentModels, ProjectStore, StoredFile, StoredPage, StoreWriteResult } from "./ports"
import { versionOf } from "./version"

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

/** ai-site's capability read, as the contract's shape: ids for everything bindable. Pure. */
export function toRuntimeCapabilities(c: Capabilities): RuntimeCapabilities {
  const currency = c.facts?.currency || "USD"
  const money = (cents: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100)
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`
    }
  }
  const features = new Set<string>()
  if (c.facts?.publishedProducts) features.add("shop")
  if (c.communities.length) features.add("communities")
  if (c.blog.posts) features.add("blog")
  if (c.forms.bookings) features.add("bookings")
  if (Object.keys(c.productTypes).some((t) => /member/i.test(t))) features.add("memberships")
  return {
    store: { name: c.brand.name, currency, brandImage: c.brand.avatarUrl, tagline: c.brand.tagline },
    products: (c.facts?.products ?? []).filter((p) => p.published && p.id).map((p) => ({ id: p.id!, title: p.title, kind: p.type || "product", price: p.payWhatYouWant ? "Pay what you want" : money(p.priceCents), url: p.url && p.url.startsWith("/") ? p.url : "" })),
    collections: (c.facts?.collections ?? []).filter((x) => x.published).map((x) => ({ id: x.id, title: x.title, url: `/collections/${x.handle}`, products_count: 0 })),
    /* A community is bound by id (community_picker); its own address is resolved by the renderer. */
    communities: c.communities.map((x) => ({ id: x.id, name: x.name, url: "" })),
    /* TODO(L4): published forms with ids once form_picker exists; counts only until then. */
    forms: [],
    pages: [],
    menus: [],
    blog: { posts: c.blog.posts },
    reviews: { count: c.facts?.reviews?.count ?? 0, average: c.facts?.reviews?.average ?? null },
    features: [...features],
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
    loop: { provider: loop.provider, model: loop.model, effort: "low" },
    small: { provider: small.provider, model: small.model, effort: "low" },
    ownKey: loop.own !== null,
  }
}

/**
 * Everything runAgentSlice needs for one job, on the real services. L2 adds
 * `emit` (ai_site_job_events), `cancelled` (cancel_requested_at) and
 * `previewErrors` (the editor bridge) from the job row it holds.
 */
export async function agentDeps(job: { creatorId: string; ownerUserId: string | null; installId: string }, extra: Partial<AgentDeps> = {}): Promise<AgentDeps> {
  const admin = createAdminClient() as unknown as Db
  return {
    store: supabaseProjectStore(admin, job.installId),
    models: await agentModels(job.creatorId),
    capabilities: async () => toRuntimeCapabilities(await readCapabilities(admin, { creatorId: job.creatorId, ownerUserId: job.ownerUserId }, readStoreFacts)),
    ...extra,
  }
}

