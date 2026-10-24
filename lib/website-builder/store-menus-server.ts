/**
 * ===========================================================================
 *  THE STORE'S MENUS, ONE SET FOR EVERY THEME
 * ===========================================================================
 * Shopify keeps menus in the store's Navigation, and every theme reads the
 * same ones. Storelib kept them inside a theme's settings (`menus`), so a
 * second theme started with none and an edit in one theme changed nothing
 * in the others. Asked for directly: "the navigation should not be at the
 * website settings level specifically for a theme, it should be at a level
 * Shopify has."
 *
 * So they live in `store_menus` (supabase/sql/run-now/93_store_menus.sql),
 * one row per creator, in the shape the theme setting already had. Whatever
 * reads a theme's settings to draw a page lays the store's menus over them
 * (`withStoreMenus`), so the header, the footer and every `link_list` keep
 * reading `theme.menus` and never learn where it came from.
 *
 * MOVED OVER, NOT MOVED. Until a store has a row, each theme keeps drawing
 * its own menus exactly as before, and the editor offers the LIVE theme's
 * menus as the store's (`storeMenusFor`). The first edit writes the row.
 * Where the table is missing (the SQL part not run yet) nothing changes at
 * all and the editor goes on saving menus with the theme.
 */
import { cleanMenus, type Menu } from "@/lib/storelib-theme/values"
import { siteMenus } from "./storefront-data"
import type { SectionInstance } from "./types"

type Db = { from: (table: string) => any }

const TABLE = "store_menus"

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || /store_menus/i.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? "")
}

export type StoreMenusRead =
  /** The store's own menus. */
  | { kind: "stored"; menus: Record<string, Menu> }
  /** No row yet: each theme still has its own. */
  | { kind: "none" }
  /** The table is not there, or could not be read: menus stay with the theme. */
  | { kind: "unavailable" }

export async function readStoreMenus(db: Db, creatorId: string): Promise<StoreMenusRead> {
  const { data, error } = await db.from(TABLE).select("menus").eq("creator_id", creatorId).maybeSingle()
  if (error) {
    if (!missingTable(error)) console.error("[store-menus] read failed", { code: error.code })
    return { kind: "unavailable" }
  }
  if (!data) return { kind: "none" }
  return { kind: "stored", menus: cleanMenus((data as { menus?: unknown }).menus) }
}

/** The menus a page is drawn with, or null to keep the theme's own. Never throws. */
export async function storeMenusOrNull(db: Db, creatorId: string): Promise<Record<string, Menu> | null> {
  try {
    const read = await readStoreMenus(db, creatorId)
    return read.kind === "stored" ? read.menus : null
  } catch {
    return null
  }
}

/** A theme's settings with the store's menus in place of its own. Unchanged when there are none. */
export function withStoreMenus<T extends Record<string, unknown>>(settings: T, menus: Record<string, Menu> | null): T {
  if (!menus) return settings
  return { ...settings, menus }
}

export async function writeStoreMenus(
  db: Db,
  creatorId: string,
  menus: unknown,
): Promise<{ ok: true; menus: Record<string, Menu> } | { ok: false; unavailable: boolean }> {
  const clean = cleanMenus(menus)
  const { error } = await db
    .from(TABLE)
    .upsert({ creator_id: creatorId, menus: clean, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (error) {
    const unavailable = missingTable(error)
    if (!unavailable) console.error("[store-menus] write failed", { code: error.code })
    return { ok: false, unavailable }
  }
  return { ok: true, menus: clean }
}

/**
 * The menus the editor shows as the store's: the stored ones, or until there
 * are any, the live theme's (the ones visitors see today), or the theme
 * being edited when nothing is live yet.
 */
export async function storeMenusFor(
  db: Db,
  creatorId: string,
  fallbackInstallId?: string | null,
): Promise<{ available: boolean; stored: boolean; menus: Record<string, Menu> }> {
  const read = await readStoreMenus(db, creatorId)
  if (read.kind === "stored") return { available: true, stored: true, menus: read.menus }
  if (read.kind === "unavailable") return { available: false, stored: false, menus: {} }

  const { data: live } = await db
    .from("store_theme_installs")
    .select("id, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  let row = live as { store_theme_settings?: unknown } | null
  if (!row && fallbackInstallId) {
    const { data } = await db
      .from("store_theme_installs")
      .select("id, store_theme_settings ( settings, draft_settings )")
      .eq("id", fallbackInstallId)
      .eq("creator_id", creatorId)
      .maybeSingle()
    row = data as typeof row
  }
  const settingsRow = row
    ? ((Array.isArray(row.store_theme_settings) ? row.store_theme_settings[0] : row.store_theme_settings) as
        | { settings?: Record<string, unknown> | null; draft_settings?: Record<string, unknown> | null }
        | null
        | undefined)
    : null
  /* The live menus are what visitors see; a theme never published offers its draft. */
  const source = live ? settingsRow?.settings : settingsRow?.draft_settings ?? settingsRow?.settings
  return { available: true, stored: false, menus: cleanMenus(source?.menus) }
}

/**
 * ===========================================================================
 *  A NEW WEBSITE, OR A NEW ONE LIVE, KEEPS THE STORE'S MENUS
 * ===========================================================================
 * Until a store had a `store_menus` row, its menus were the live theme's.
 * Adding a second website and publishing it swapped them for the new
 * theme's own (a starter header, an empty footer), and an imported theme
 * drew a made up Home, Shop, Contact (compat/menus.ts) instead of the
 * navigation the creator had built. Asked for: menus are the store's, and a
 * new theme reuses them.
 *
 * So before a website is added and before one goes live, the menus visitors
 * see now are written down as the store's, once: the live website's menus,
 * with its header's own links as the Main menu when it has no Main menu of
 * its own (storefront-data siteMenus), or, with nothing live yet, those of
 * the first website in the library that has any. A store that already has
 * its row is left alone. Where the table is missing nothing is written and
 * the answer says so (`stored: false`), so a new website can be given a
 * copy. Never throws: a theme is added or published whatever happens here.
 */
export async function ensureStoreMenus(
  db: Db,
  creatorId: string,
  /** `names: false` skips reading which menus the live header and footer name, which only a new website needs. */
  opts: { excludeInstallId?: string | null; preferInstallId?: string | null; names?: boolean } = {},
): Promise<(CurrentMenus & { stored: boolean }) | null> {
  try {
    const read = await readStoreMenus(db, creatorId)
    if (read.kind === "stored" && opts.names === false) return { menus: read.menus, header: null, footer: null, stored: true }
    const source = await currentMenus(db, creatorId, opts.excludeInstallId ?? null, opts.preferInstallId ?? null)
    if (read.kind === "stored") return { menus: read.menus, header: source?.header ?? null, footer: source?.footer ?? null, stored: true }
    if (!source || Object.keys(source.menus).length === 0) return null
    /* No table yet: nothing is written, and the caller gives the new website its own copy, as menus were kept before. */
    if (read.kind === "unavailable") return { ...source, stored: false }
    const saved = await writeStoreMenus(db, creatorId, source.menus)
    return saved.ok ? { ...source, menus: saved.menus, stored: true } : { ...source, stored: false }
  } catch {
    return null
  }
}

/** The store's menus, and the settings of the header and footer that showed them (which menus they named). */
export type CurrentMenus = { menus: Record<string, Menu>; header: Record<string, unknown> | null; footer: Record<string, unknown> | null }

type InstallMenusRow = {
  id: string
  status?: string | null
  store_theme_settings?: unknown
  store_theme_pages?: { page_key?: string; sections?: unknown; draft_sections?: unknown }[] | null
}

/** The menus visitors see now (the live website's), or with nothing live the first website's in the library that has menus; and that website's footer settings. */
async function currentMenus(db: Db, creatorId: string, excludeInstallId: string | null, preferInstallId: string | null): Promise<CurrentMenus | null> {
  const { data } = await db
    .from("store_theme_installs")
    .select("id, status, store_theme_settings ( settings, draft_settings ), store_theme_pages ( page_key, sections, draft_sections )")
    .eq("creator_id", creatorId)
    .order("sort_order", { ascending: true })
    .limit(12)
  const rows = ((data ?? []) as InstallMenusRow[]).filter((r) => r.id !== excludeInstallId)
  const published = rows.find((r) => r.status === "published")
  /* Nothing live: the website about to go live first (a first publish keeps its own menus), then the library in order. */
  const preferred = rows.filter((r) => r.id === preferInstallId)
  const candidates = published ? [published] : [...preferred, ...rows.filter((r) => r.id !== preferInstallId)]
  for (const row of candidates) {
    const found = menusOf(row)
    if (Object.keys(found.menus).length > 0 || published) return found
  }
  return null
}

function menusOf(row: InstallMenusRow): CurrentMenus {
  const live = row.status === "published"
  const settingsRow = (Array.isArray(row.store_theme_settings) ? row.store_theme_settings[0] : row.store_theme_settings) as
    | { settings?: Record<string, unknown> | null; draft_settings?: Record<string, unknown> | null }
    | null
    | undefined
  const settings = (live ? settingsRow?.settings : settingsRow?.draft_settings ?? settingsRow?.settings) ?? {}
  const home = (row.store_theme_pages ?? []).find((p) => p.page_key === "home")
  const sectionsRaw = live ? home?.sections : home?.draft_sections ?? home?.sections
  const sections = (Array.isArray(sectionsRaw) ? sectionsRaw : []) as SectionInstance[]
  const header = sections.find((s) => s?.type === "header")
  const footer = sections.find((s) => s?.type === "footer")
  return { menus: siteMenus(settings, sections), header: header?.settings ?? null, footer: footer?.settings ?? null }
}
