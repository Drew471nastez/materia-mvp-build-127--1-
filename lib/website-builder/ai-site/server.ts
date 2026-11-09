import "server-only"

/**
 * ===========================================================================
 *  START WITH AI ON THE SERVER: WHERE A JOB LIVES AND HOW IT KEEPS GOING
 * ===========================================================================
 *   • THE JOB ROW (ai_site_jobs, SQL part 380): saved after every step and
 *     every wave of sections, read by the editor's progress view through the
 *     owner's own client (row level security), written only here, with the
 *     service role.
 *   • THE WEBSITE: read from and written to its DRAFT columns
 *     (store_theme_pages.draft_sections, store_theme_settings.draft_settings)
 *     through the editor's own sanitisers, for this install only. Nothing a
 *     visitor sees changes until the creator publishes.
 *   • KEEPING GOING: each request runs steps until its deadline (well inside
 *     Vercel's 300 seconds), then calls the run route again with a signed,
 *     short lived token for this job only (`jobToken`), so closing the tab
 *     does not stop it. A lease on the row keeps two runners off one job; a
 *     runner that died lets the lease run out and the next poll from the
 *     editor starts it again.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { downloadExternalImage } from "@/lib/blog/copy-image"
import type { SectionInstance } from "@/lib/website-builder/types"
import { emptyState, type Job, type JobState, type SiteIO } from "./job"
import type { ImageDeps } from "./images"
import { openverseSearch } from "./images"
import type { SiteState } from "./apply"
import { CODED_PATH } from "./code"
import { recordVersion, saveDraft } from "@/lib/website-builder/theme-file-drafts"
import { readStoreMenus, writeStoreMenus } from "@/lib/website-builder/store-menus-server"
import { MENU_LIMITS } from "@/lib/storelib-theme/values"

type Db = { from: (table: string) => any; storage?: any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const JOBS_TABLE = "ai_site_jobs"
/** How long one runner holds a job. A little over one request's own deadline. */
export const LEASE_MS = 295_000
/** When a request stops starting new work and hands over: before Vercel's 300 seconds, with room to save and chain. */
export const RUN_BUDGET_MS = 240_000

/* ── the table may not be there yet ──────────────────────────────────── */

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || (/ai_site_jobs/i.test(error.message ?? "") && /does not exist|could not find|schema cache/i.test(error.message ?? ""))
}

/* ── the signed hand over ─────────────────────────────────────────────── */

function key(): string | null {
  const k = process.env.AI_JOB_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return k.length >= 16 ? k : null
}
const sig = (k: string, id: string, exp: string) => createHmac("sha256", k).update(`ai-site-job.${id}.${exp}`).digest("hex").slice(0, 40)

/** A token that lets the run route run THIS job for the next ten minutes. Null without a server key. */
export function jobToken(jobId: string, now = Date.now(), ttl = 10 * 60_000): string | null {
  const k = key()
  if (!k || !/^[0-9a-f-]{36}$/i.test(jobId)) return null
  const exp = (now + ttl).toString(36)
  return `${exp}.${sig(k, jobId.toLowerCase(), exp)}`
}

export function verifyJobToken(jobId: string, token: string | null | undefined, now = Date.now()): boolean {
  const k = key()
  if (!k || !token || token.length > 80 || !/^[0-9a-f-]{36}$/i.test(jobId)) return false
  const [exp, given] = token.split(".")
  if (!exp || !given || !/^[0-9a-z]{1,12}$/.test(exp) || !/^[0-9a-f]{40}$/.test(given)) return false
  if (parseInt(exp, 36) < now) return false
  const want = Buffer.from(sig(k, jobId.toLowerCase(), exp), "hex")
  const got = Buffer.from(given, "hex")
  return got.length === want.length && timingSafeEqual(got, want)
}

/* ── the job row ───────────────────────────────────────────────────────── */

interface Row {
  id: string
  creator_id: string
  owner_user_id: string | null
  install_id: string
  status: Job["status"]
  step: Job["step"]
  progress: number
  prompt: string
  plan: Job["plan"]
  state: Partial<JobState> | null
  error: string | null
  attempts: number
  lease_until: string | null
  engine?: string | null
  options?: unknown
}

export function jobFromRow(r: Row): Job {
  return {
    id: r.id,
    creatorId: r.creator_id,
    ownerUserId: r.owner_user_id,
    installId: r.install_id,
    status: r.status,
    /* The code step is stored as "build" with state.coding (saveJob): part 380's step check predates it. */
    step: r.step === "build" && r.state?.coding ? "code" : r.step,
    progress: r.progress,
    prompt: r.prompt,
    plan: r.plan,
    state: { ...emptyState(), ...(r.state ?? {}) },
    error: r.error,
    attempts: r.attempts,
    ...(r.engine === "agent" ? { engine: "agent" as const } : {}),
    ...(r.options && typeof r.options === "object" && !Array.isArray(r.options) ? { options: r.options as Job["options"] } : {}),
  }
}

export async function loadJob(db: Db, id: string): Promise<Job | null> {
  const { data, error } = await db.from(JOBS_TABLE).select("*").eq("id", id).maybeSingle()
  if (error || !data) return null
  return jobFromRow(data as Row)
}

export async function saveJob(admin: Db, job: Job): Promise<void> {
  const done = job.step === "done" || job.status === "failed"
  const { error } = await admin
    .from(JOBS_TABLE)
    .update({
      status: job.status,
      /* Part 380 (and 401) only allow plan/build/write/photos/check/agent/done in step, so the code step is kept as
         "build" with state.coding and read back as "code" (jobFromRow). No SQL change is needed for it. */
      step: job.step === "code" ? "build" : job.step,
      progress: job.progress,
      plan: job.plan,
      state: { ...job.state, coding: job.step === "code" },
      cost_usd: job.state.spend.usd,
      error: job.error,
      updated_at: new Date().toISOString(),
      ...(done ? { finished_at: new Date().toISOString(), lease_until: null } : {}),
    })
    .eq("id", job.id)
  if (error) console.error("[ai-site] could not save the job", { job: job.id, code: error.code })
}

/** Takes the job for one runner: only when nobody holds it. True when this runner has it. */
export async function claimJob(admin: Db, job: Job, now = Date.now()): Promise<boolean> {
  const until = new Date(now + LEASE_MS).toISOString()
  const { data, error } = await admin
    .from(JOBS_TABLE)
    .update({ lease_until: until, attempts: job.attempts + 1, status: job.status === "queued" ? "running" : job.status })
    .eq("id", job.id)
    .or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
    .select("id")
  return !error && Array.isArray(data) && data.length === 1
}

export async function releaseJob(admin: Db, id: string): Promise<void> {
  await admin.from(JOBS_TABLE).update({ lease_until: null }).eq("id", id)
}

/** Whether the job's runner is gone (its lease ran out while it was not done). */
export function leaseLapsed(row: { lease_until: string | null; step: string; status: string }, now = Date.now()): boolean {
  if (row.step === "done" || row.status === "failed") return false
  return !row.lease_until || Date.parse(row.lease_until) < now
}

/* ── the website ──────────────────────────────────────────────────────── */

export function siteIO(admin: Db, installId: string, creatorId?: string): SiteIO {
  return {
    /*
      FREE DESIGN (./code.ts): a coded section into THIS install's own files, in the draft half, with a version row,
      exactly as the code editor saves one. The path is checked again here, whatever the caller checked: one folder,
      one name, never another install's.
    */
    async writeFile(path, source) {
      if (!CODED_PATH.test(path) || !installId) throw new Error("not a section file")
      const saved = await saveDraft(admin, installId, path, source)
      if (saved.ok === false) throw new Error("the file could not be saved")
      await recordVersion(admin, installId, path, source, "save")
    },
    /*
      This website's own menu, under a handle of its own: the store's menus when the store keeps them, else the
      site's own settings. Never another menu, never another website's.
    */
    async ensureMenu(handle, menu) {
      if (!creatorId || !/^site-[a-z0-9]{1,16}$/.test(handle)) return null
      const read = await readStoreMenus(admin, creatorId)
      if (read.kind !== "stored") return "theme"
      if (!(handle in read.menus) && Object.keys(read.menus).length >= MENU_LIMITS.menus) return null
      const wrote = await writeStoreMenus(admin, creatorId, { ...read.menus, [handle]: menu })
      return wrote.ok ? "store" : null
    },
    async read(): Promise<SiteState> {
      const [pages, settings] = await Promise.all([
        admin.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
        admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
      ])
      if (pages.error) throw new Error("the pages could not be read")
      const out: SiteState = { settings: {}, pages: {} }
      for (const row of (pages.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]) {
        const raw = row.draft_sections ?? row.sections
        out.pages[row.page_key] = sanitizeSections(Array.isArray(raw) ? (raw as SectionInstance[]) : [])
      }
      const s = (settings.data ?? {}) as { settings?: unknown; draft_settings?: unknown }
      out.settings = ((s.draft_settings ?? s.settings ?? {}) as Record<string, unknown>) || {}
      return out
    },
    async write(site, pages, settings) {
      const { data: existing } = await admin.from("store_theme_pages").select("page_key").eq("install_id", installId)
      const have = new Set(((existing ?? []) as { page_key: string }[]).map((r) => r.page_key))
      for (const key of pages) {
        const sections = sanitizeSections(site.pages[key] ?? [])
        const write = have.has(key)
          ? await admin.from("store_theme_pages").update({ draft_sections: sections }).eq("install_id", installId).eq("page_key", key)
          : await admin.from("store_theme_pages").insert({ install_id: installId, page_key: key, sections: [], draft_sections: sections })
        if (write?.error) throw new Error(`the page ${key} could not be saved`)
      }
      if (settings) {
        const { error } = await admin.from("store_theme_settings").update({ draft_settings: sanitizeThemeSettings(site.settings) }).eq("install_id", installId)
        if (error) throw new Error("the theme settings could not be saved")
      }
    },
  }
}

/* ── photos into the creator's media ──────────────────────────────────── */

const MEDIA_BUCKET = "store-builder-images"

/** Openverse search, and a copy into store-builder-images/<owner>/sections/ under Copy to Storelib's download rules. */
export function imageDeps(admin: Db, ownerUserId: string | null): ImageDeps {
  return {
    search: openverseSearch(),
    async copy(url) {
      if (!ownerUserId) return { ok: false, error: "no owner" }
      const picture = await downloadExternalImage(url)
      if ("error" in picture) return { ok: false, error: picture.error }
      const path = `${ownerUserId}/sections/ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${picture.ext}`
      const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
      if (error) return { ok: false, error: "the photo could not be stored" }
      const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path)
      return { ok: true, url: data.publicUrl as string }
    },
  }
}
