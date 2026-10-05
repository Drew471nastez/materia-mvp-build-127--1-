/**
 * ===========================================================================
 *  A NEW ACCOUNT ALREADY HAS A WEBSITE TO OPEN
 * ===========================================================================
 * The first visit to /app/website-builder used to call the database's
 * `initialize_creator_themes`, which installed three themes with sections
 * written by hand in 2026's first migration, and PUBLISHED one of them. On a
 * database where that function was missing or failed, the page drew
 * "Nothing is live" over an empty library: a dead end with nothing to open.
 *
 * Now the first visit installs Storelib Default the same way Add theme does
 * (app/api/website-builder/themes/add): the install row, its settings, and
 * a home and product page built by the theme's preset. As a DRAFT. Nothing
 * goes live until the creator presses Publish.
 *
 * WHEN. Only while the creator's library is empty. That is a new account, an
 * account from before this existed whose seed never ran, and a library whose
 * every website was removed; all three get the same starting point on their
 * next visit. A library with anything in it is never touched.
 *
 * NEVER TWICE. Two visits at once (two tabs, a prefetch beside a click) can
 * both find the library empty and both insert. Each then reads the starter
 * installs back, oldest first, and the one that is not first removes itself
 * before writing anything else. Both answer with the same keeper.
 *
 * NEVER BREAKS THE PAGE. Every failure is logged by code and answered with
 * `created: false`; the page then draws what the database has, which for an
 * empty library is the Add theme way in.
 *
 * Server only: it writes with the service role. The creator id comes from the
 * signed-in user's own creator row, never from a request.
 */
import { buildThemePreset, getThemeDefinition, STORELIB_DEFAULT_ID, themeCatalogRow } from "./theme-registry"
import type { SectionInstance, ThemeSettingsValues } from "./types"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The theme a new account starts with. */
export const STARTER_THEME_ID = STORELIB_DEFAULT_ID

export interface StarterRows {
  install: { creator_id: string; theme_id: string; name: string; status: "draft"; is_custom: false; sort_order: number }
  settings: ThemeSettingsValues
  pages: { page_key: "home" | "product"; sections: SectionInstance[] }[]
}

/**
 * The rows a starter website is made of, from the registry. Pure, so a test
 * can see that the status is a draft and the pages are the preset's.
 */
export function starterRows(creatorId: string): StarterRows | null {
  const def = getThemeDefinition(STARTER_THEME_ID)
  if (!def) return null
  const preset = buildThemePreset(def)
  return {
    install: { creator_id: creatorId, theme_id: def.id, name: def.name, status: "draft", is_custom: false, sort_order: 0 },
    settings: preset.settings,
    pages: [
      { page_key: "home", sections: preset.pages.home },
      { page_key: "product", sections: preset.pages.product },
    ],
  }
}

/** Whether a library of this size gets a starter: empty only, and never on a count that could not be read. */
export function needsStarter(count: number | null | undefined): boolean {
  return count === 0
}

/**
 * Of the starter installs that exist for a creator, the one that stays: the
 * oldest, and the smaller id when two were made in the same instant. Every
 * concurrent request computes the same answer from the same rows.
 */
export function starterKeeper(rows: { id: string; created_at?: string | null }[]): string | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at ?? "") || 0
    const tb = Date.parse(b.created_at ?? "") || 0
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted[0].id
}

export interface StarterResult {
  created: boolean
  installId: string | null
}

const NONE: StarterResult = { created: false, installId: null }

/**
 * Installs Storelib Default as a draft when the creator has no website.
 * Idempotent; see the note at the top of this file.
 */
export async function ensureStarterWebsite(db: Db, creatorId: string): Promise<StarterResult> {
  if (!creatorId) return NONE
  try {
    const { count, error: countErr } = await db
      .from("store_theme_installs")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creatorId)
    if (countErr || !needsStarter(count)) return NONE

    const rows = starterRows(creatorId)
    if (!rows) return NONE

    /* The catalogue row is the install's foreign key, as in the add route. */
    const def = getThemeDefinition(STARTER_THEME_ID)!
    const { data: catalogRow } = await db.from("themes").select("id").eq("id", def.id).maybeSingle()
    if (!catalogRow) {
      const { error: seedErr } = await db.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
      if (seedErr) {
        console.error("[starter-website] could not register the catalogue row", { code: seedErr.code })
        return NONE
      }
    }

    const { data: made, error: installErr } = await db.from("store_theme_installs").insert(rows.install).select("id").single()
    if (installErr || !made?.id) {
      console.error("[starter-website] could not create the install", { code: installErr?.code })
      return NONE
    }
    const installId = made.id as string

    /* Another request made one at the same moment: the older one stays. */
    const { data: twins } = await db
      .from("store_theme_installs")
      .select("id, created_at")
      .eq("creator_id", creatorId)
      .eq("theme_id", rows.install.theme_id)
      .order("created_at", { ascending: true })
      .limit(10)
    const keeper = starterKeeper((twins ?? []) as { id: string; created_at?: string | null }[]) ?? installId
    if (keeper !== installId) {
      await db.from("store_theme_installs").delete().eq("id", installId)
      return { created: false, installId: keeper }
    }

    /* Settings and pages, or nothing: a half-built website opens to an empty editor. */
    const [{ error: settingsErr }, { error: pagesErr }] = await Promise.all([
      db.from("store_theme_settings").insert({ install_id: installId, settings: rows.settings }),
      db.from("store_theme_pages").insert(rows.pages.map((p) => ({ install_id: installId, page_key: p.page_key, sections: p.sections }))),
    ])
    if (settingsErr || pagesErr) {
      await db.from("store_theme_installs").delete().eq("id", installId)
      console.error("[starter-website] could not write the pages or settings", { code: settingsErr?.code ?? pagesErr?.code })
      return NONE
    }
    return { created: true, installId }
  } catch (e) {
    console.error("[starter-website] failed", { message: e instanceof Error ? e.name : "unknown" })
    return NONE
  }
}
