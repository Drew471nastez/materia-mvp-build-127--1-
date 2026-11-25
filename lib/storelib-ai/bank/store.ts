import "server-only"

/**
 * ===========================================================================
 *  THE AI SOURCE BANK IN THE DATABASE (part 467, ai_template_bank)
 * ===========================================================================
 * One row per library website the Storelib admin put in the bank at
 * /admin/ai-bank: the snapshot (./snapshot.ts, the site with nothing of its
 * account's business left in it), its profile, and the admin's own tags.
 * Server only: the table has row level security on and no policy, so only
 * the service role (the admin behind its cookie, an AI job on the server)
 * reads or writes it.
 *
 * A snapshot is taken when the admin adds a site and again when they press
 * Refresh: a change to the source site after that does not reach the bank
 * until then, so a half-finished edit never becomes the AI's example.
 *
 * Without the table (part 467 not run) every read is empty and says so: the
 * agent builds from the built-in templates as before.
 */
import { snapshotSite, type BankProfile, type SnapshotInput } from "./snapshot"
import { listingOf, type BankListing } from "./fit"
import { uploadSnapshot, type UploadedFile } from "./upload"
import type { SiteTemplate } from "@/lib/storelib-ai/templates/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

export const BANK_TABLE = "ai_template_bank"
/** A bank this large is a library nobody curates: the admin removes one first. */
export const MAX_BANK_ENTRIES = 60
/** A snapshot over this many characters is refused (a site with thousands of sections is not an example). */
export const MAX_SNAPSHOT_CHARS = 6_000_000

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BankRow {
  id: string
  install_id: string | null
  template_id: string
  name: string
  kind: BankProfile["kind"]
  enabled: boolean
  industries: string[]
  keywords: string[]
  profile: BankProfile
  snapshot_at: string
  created_at: string
}

const ROW = "id, install_id, template_id, name, kind, enabled, industries, keywords, profile, snapshot_at, created_at"

export function isMissingBank(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /ai_template_bank|relation|schema cache|does not exist/i.test(error.message ?? ""))
}

/* ── the account's library ─────────────────────────────────────────────── */

export interface LibrarySite {
  installId: string
  name: string
  themeId: string
  status: string
  publishedAt: string | null
  imported: boolean
}

/** Every website in the library of the account with this email address (all its businesses). */
export async function accountSites(db: Db, email: string): Promise<{ sites: LibrarySite[]; found: boolean }> {
  const address = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { sites: [], found: false }
  const { data: people } = await db.from("profiles").select("id").eq("email", address).limit(3)
  const userIds = ((people ?? []) as { id: string }[]).map((p) => p.id)
  if (!userIds.length) return { sites: [], found: false }
  const { data: creators } = await db.from("creators").select("id").in("user_id", userIds).limit(50)
  const creatorIds = ((creators ?? []) as { id: string }[]).map((c) => c.id)
  if (!creatorIds.length) return { sites: [], found: true }
  const { data: installs } = await db.from("store_theme_installs").select("*").in("creator_id", creatorIds).limit(200)
  const rows = (installs ?? []) as Record<string, unknown>[]
  const ids = rows.map((r) => String(r.id))
  /* Which of them are imported themes: a compat layout file. */
  const imported = new Set<string>()
  if (ids.length) {
    const { data: layouts } = await db.from("store_theme_custom_files").select(await fileCols("path, install_id, content, draft_content")).in("install_id", ids).eq("path", "layout/theme.storelib")
    for (const l of await resolveRefs((layouts ?? []) as { path: string; install_id: string; content: string | null; draft_content: string | null }[])) {
      if (/<template[^>]*\bcompat\b/i.test(`${l.content ?? ""}${l.draft_content ?? ""}`)) imported.add(l.install_id)
    }
  }
  const sites = rows.map((r) => ({
    installId: String(r.id),
    name: typeof r.name === "string" && r.name ? r.name : "Untitled website",
    themeId: typeof r.theme_id === "string" ? r.theme_id : "",
    status: typeof r.status === "string" ? r.status : "",
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
    imported: imported.has(String(r.id)),
  }))
  sites.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.name.localeCompare(b.name))
  return { sites, found: true }
}

/* ── one website, read as it is live ───────────────────────────────────── */

const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === "object" && Object.keys(v as object).length > 0)

/**
 * The website as visitors see it: each page's published sections (its draft where it was never published), its
 * code files' published text (else the draft), its published Theme settings (else the draft).
 */
export async function readSiteForBank(db: Db, installId: string): Promise<SnapshotInput | null> {
  const { data: install } = await db.from("store_theme_installs").select("id, name").eq("id", installId).maybeSingle()
  if (!install) return null
  const [{ data: pageRows }, { data: fileRows }, { data: settingsRow }] = await Promise.all([
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
    db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId).then(async (r: { data: unknown; error: unknown }) => ({ ...r, data: r.error ? r.data : await resolveRefs(r.data as { path: string; content: string | null }[] | null) })),
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
  ])
  const pages = ((pageRows ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((p) => ({
    key: p.page_key,
    sections: ((nonEmpty(p.sections) ? p.sections : p.draft_sections) ?? []) as SectionInstance[],
  }))
  const files: Record<string, string> = {}
  for (const f of (fileRows ?? []) as { path: string; content: string | null; draft_content: string | null }[]) {
    const text = f.content ?? f.draft_content
    if (typeof text === "string" && text.trim()) files[f.path] = text
  }
  const s = settingsRow as { settings?: unknown; draft_settings?: unknown } | null
  const settings = ((nonEmpty(s?.settings) ? s?.settings : s?.draft_settings) ?? {}) as Record<string, unknown>
  return { installId, name: String((install as { name?: unknown }).name ?? ""), pages, files, settings }
}

/* ── the bank ──────────────────────────────────────────────────────────── */

export async function listBank(db: Db): Promise<{ rows: BankRow[]; missing: boolean }> {
  const { data, error } = await db.from(BANK_TABLE).select(ROW).order("created_at", { ascending: false }).limit(MAX_BANK_ENTRIES)
  if (error) return { rows: [], missing: isMissingBank(error) }
  return { rows: (data ?? []) as BankRow[], missing: false }
}

export type BankWrite = { ok: true; row: BankRow } | { ok: false; status: number; error: string }

/** Puts a library website in the bank, or takes a fresh snapshot of one already there. Tags and the switch are kept. */
export async function snapshotIntoBank(db: Db, installId: string): Promise<BankWrite> {
  const input = await readSiteForBank(db, installId)
  if (!input) return { ok: false, status: 404, error: "That website is not in any library." }
  if (!input.pages.some((p) => p.sections.length > 0)) return { ok: false, status: 422, error: "That website has no sections yet, so there is nothing to learn from." }
  const { template, profile } = snapshotSite(input)
  const snapshot = JSON.stringify(template)
  if (snapshot.length > MAX_SNAPSHOT_CHARS) return { ok: false, status: 413, error: "That website is too large to keep as an example. Remove unused pages first." }
  const { data: existing, error: readErr } = await db.from(BANK_TABLE).select("id").eq("install_id", installId).maybeSingle()
  if (readErr) return { ok: false, status: isMissingBank(readErr) ? 503 : 500, error: isMissingBank(readErr) ? "Run SQL part 467 (ai_template_bank) first." : "The bank could not be read just now." }
  if (!existing) {
    const { count } = await db.from(BANK_TABLE).select("id", { count: "exact", head: true })
    if ((count ?? 0) >= MAX_BANK_ENTRIES) return { ok: false, status: 409, error: `The bank holds ${MAX_BANK_ENTRIES} websites. Remove one first.` }
  }
  const now = new Date().toISOString()
  const values = { install_id: installId, template_id: template.id, name: template.name, kind: profile.kind, profile, snapshot: template, snapshot_at: now, updated_at: now }
  const q = existing
    ? db.from(BANK_TABLE).update(values).eq("id", (existing as { id: string }).id)
    : db.from(BANK_TABLE).insert({ ...values, enabled: true, industries: [], keywords: [] })
  const { data, error } = await q.select(ROW).single()
  if (error || !data) return { ok: false, status: 500, error: "The snapshot could not be saved." }
  return { ok: true, row: data as BankRow }
}

/**
 * A theme the admin uploaded (zip, HTML, CSS, any theme's files): a reference entry with no website behind it.
 * Needs part 468 (install_id may be empty).
 */
export async function uploadIntoBank(db: Db, name: string, files: UploadedFile[]): Promise<BankWrite> {
  const snap = uploadSnapshot(name, files, new Date().toISOString())
  if (!snap) return { ok: false, status: 422, error: "Nothing in that upload is a page, a style or a script the AI can read." }
  const { count, error: countErr } = await db.from(BANK_TABLE).select("id", { count: "exact", head: true })
  if (countErr) return { ok: false, status: isMissingBank(countErr) ? 503 : 500, error: isMissingBank(countErr) ? "Run SQL part 467 (ai_template_bank) first." : "The bank could not be read just now." }
  if ((count ?? 0) >= MAX_BANK_ENTRIES) return { ok: false, status: 409, error: `The bank holds ${MAX_BANK_ENTRIES} entries. Remove one first.` }
  const now = new Date().toISOString()
  const { data, error } = await db
    .from(BANK_TABLE)
    .insert({ install_id: null, template_id: snap.template.id, name: snap.template.name, kind: "reference", profile: snap.profile, snapshot: snap.template, snapshot_at: now, updated_at: now, enabled: true, industries: [], keywords: [] })
    .select(ROW)
    .single()
  if (error || !data) {
    const code = (error as { code?: string } | null)?.code
    if (code === "23502") return { ok: false, status: 503, error: "Run SQL part 468 (uploads in the AI source bank) first." }
    if (code === "23505") return { ok: false, status: 409, error: "That upload is already in the bank." }
    return { ok: false, status: 500, error: "The upload could not be saved." }
  }
  return { ok: true, row: data as BankRow }
}

const INDUSTRY = /^[a-z][a-z-]{1,30}$/
const KEYWORD = /^[\p{L}\p{N} &'-]{2,40}$/u

/** The admin's switch and tags. Unknown values are dropped, not stored. */
export async function updateBankEntry(db: Db, id: string, patch: { enabled?: unknown; industries?: unknown; keywords?: unknown }): Promise<BankWrite> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof patch.enabled === "boolean") values.enabled = patch.enabled
  if (Array.isArray(patch.industries)) values.industries = patch.industries.filter((x): x is string => typeof x === "string" && INDUSTRY.test(x)).slice(0, 6)
  if (Array.isArray(patch.keywords)) values.keywords = patch.keywords.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")).filter((x) => KEYWORD.test(x)).slice(0, 20)
  const { data, error } = await db.from(BANK_TABLE).update(values).eq("id", id).select(ROW).single()
  if (error || !data) return { ok: false, status: error && isMissingBank(error) ? 503 : 404, error: "That bank entry is not there." }
  return { ok: true, row: data as BankRow }
}

export async function removeBankEntry(db: Db, id: string): Promise<{ ok: boolean }> {
  const { error } = await db.from(BANK_TABLE).delete().eq("id", id)
  return { ok: !error }
}

/* ── what an AI job reads ──────────────────────────────────────────────── */

export interface BankSource {
  /** The enabled entries, without their snapshots. */
  list(): Promise<BankListing[]>
  /** One entry's snapshot and profile, by its template id. */
  load(templateId: string): Promise<{ template: SiteTemplate; profile: BankProfile } | null>
}

export function bankSource(db: Db): BankSource {
  return {
    async list() {
      const { data, error } = await db.from(BANK_TABLE).select("template_id, name, kind, industries, keywords, profile").eq("enabled", true).limit(MAX_BANK_ENTRIES)
      if (error) return []
      return ((data ?? []) as { template_id: string; name: string; kind: string; industries: string[] | null; keywords: string[] | null; profile: BankProfile }[])
        .filter((r) => r.profile && Array.isArray(r.profile.sections))
        .map((r) => listingOf(r.template_id, r.name, r.profile, { industries: r.industries ?? [], keywords: r.keywords ?? [] }))
    },
    async load(templateId) {
      const { data, error } = await db.from(BANK_TABLE).select("snapshot, profile, industries, keywords").eq("template_id", templateId).maybeSingle()
      if (error || !data) return null
      const row = data as { snapshot: SiteTemplate; profile: BankProfile; industries: string[] | null; keywords: string[] | null }
      if (!row.snapshot || !Array.isArray(row.snapshot.pages)) return null
      /* The admin's tags are the template's industries and words when given. */
      const template = { ...row.snapshot }
      if (row.industries?.length) template.industries = row.industries as SiteTemplate["industries"]
      if (row.keywords?.length) template.keywords = [...new Set([...template.keywords, ...row.keywords])]
      return { template, profile: row.profile }
    },
  }
}
