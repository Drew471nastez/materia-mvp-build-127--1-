/**
 * ===========================================================================
 *  START A NEW WEBSITE: WITH AI, OR FROM BLANK
 * ===========================================================================
 * The Website page's "Create a website" doors (Start with AI, Start from
 * blank) make a new native website in the current builder: a Storelib
 * Default install the visual editor opens like any other, never a code
 * project (that is /app/sites, a different product).
 *
 * Add theme (app/api/website-builder/themes/add) cannot be used for this:
 * every account already has Storelib Default (lib/website-builder/
 * starter-website.ts) and Add refuses a theme already in the library. So
 * this is its own path, built from the same parts, and Add is left exactly
 * as it is:
 *
 *   • the same library limit, asked before anything is written and counted
 *     again after the insert (library-limit.ts), with the same refusal;
 *   • the catalogue row made sure of (themeCatalogRow);
 *   • the theme's preset for settings, header, footer and product page
 *     (buildThemePreset, unchanged: tests pin it);
 *   • the store's menus written down first and named by the new header and
 *     footer (ensureStoreMenus, pointAtStoreMenus);
 *   • settings and pages, or nothing: a half-built install is removed.
 *
 * WHAT IS DIFFERENT. The home page has only the header and footer, no body
 * sections. A blank start is truly blank, and an AI start is a page the
 * website agent reads as empty, so it builds a new site from the brief
 * (lib/website-builder/agent/intent.ts: NEW_SITE_GENERATION when the home
 * page has one body section or none) rather than redesigning a sample shop.
 * And there is no one-copy check: a creator may start as many websites as
 * the library has room for.
 *
 * START WITH AI FROM A BLANK PAGE (round L, chrome "none"). Every new
 * website used to get Storelib Default's header and footer, whatever was
 * asked: startRows() had no other shape, so an AI build that should design
 * its own frame was handed this one and kept it (the job copies home's
 * header and footer to every page). With chrome "none" the home page has no
 * sections at all, the product page only the section that draws the product
 * (product-page.ts: without it every product reads "Product name"), and the
 * settings are a neutral black on white with no brand name (the store's
 * name is used), so nothing of the Default look is left for the AI to work
 * around. The Start from blank door and Start with AI inside the theme keep
 * "theme", exactly as before.
 *
 * Server only: it writes with the service role. The creator comes from the
 * signed-in caller (lib/team/website websiteCaller), never from a request.
 */
import { SITE_CHROME_HOME_ONLY, SITE_CHROME_SETTING } from "./universal-chrome"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isLibraryFullError, keptWithinLimit, librarySlotsLeft, nextSortOrder, LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE } from "./library-limit"
import { buildThemePreset, getThemeDefinition, STORELIB_DEFAULT_ID, themeCatalogRow } from "./theme-registry"
import { ensureStoreMenus } from "./store-menus-server"
import { pointAtStoreMenus } from "./main-menu"
import { mainProductSection } from "./product-page"
import type { SectionInstance, ThemeSettingsValues } from "./types"

/** How a new website starts. */
export type StartMode = "ai" | "blank"

export function isStartMode(value: unknown): value is StartMode {
  return value === "ai" || value === "blank"
}

/** The longest name a creator can give a new website here. */
export const START_NAME_MAX = 60

/** The name a website gets when none is given, before a number makes it unique. */
export function defaultStartName(mode: StartMode): string {
  return mode === "ai" ? "AI website" : "New website"
}

/**
 * The new website's name. A name given is the creator's: trimmed, its
 * spaces folded, at most START_NAME_MAX characters, kept even when another
 * website has it. With none, "New website" (or "AI website"), then
 * "New website 2", "New website 3" and on, the first one no website in the
 * library already has (compared without case).
 */
export function pickStartName(given: unknown, mode: StartMode, taken: readonly string[]): string {
  const own = typeof given === "string" ? given.replace(/\s+/g, " ").trim().slice(0, START_NAME_MAX).trim() : ""
  if (own) return own
  const base = defaultStartName(mode)
  const used = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; n < 1000; n++) {
    const next = `${base} ${n}`
    if (!used.has(next.toLowerCase())) return next
  }
  return `${base} ${Date.now()}`
}

/** The site's frame, the part of a page every page shares: its header and footer, and anything grouped with them. */
export function isChromeSection(s: Pick<SectionInstance, "type"> & { group?: unknown }): boolean {
  return s.type === "header" || s.type === "footer" || !!s.group
}

export interface StartRows {
  settings: ThemeSettingsValues
  pages: { page_key: "home" | "product"; sections: SectionInstance[] }[]
}

/** theme: Storelib Default's header and footer on a blank home page. none: no sections from the theme at all. */
export type StartChrome = "theme" | "none"

/** A blank page's settings: neutral, no brand name (the store's is used), Inter, small corners. */
export const BLANK_SETTINGS: ThemeSettingsValues = {
  primary_color: "#111111",
  secondary_color: "#4b5563",
  accent_color: "#111111",
  background_color: "#ffffff",
  surface_color: "#f6f6f6",
  text_color: "#111111",
  text_secondary_color: "#5f6368",
  border_color: "#e5e7eb",
  font_heading: "Inter",
  font_body: "Inter",
  font_size_base: 16,
  button_style: "rounded",
  border_radius: 6,
}

/**
 * The rows a new website is made of, from Storelib Default's preset: its
 * settings, a home page with only the header and footer, and its product
 * page. With chrome "none": neutral settings, an empty home page and the
 * product section alone. Pure, so a test can see what each page holds.
 */
export function startRows(chrome: StartChrome = "theme"): StartRows | null {
  const def = getThemeDefinition(STORELIB_DEFAULT_ID)
  if (!def) return null
  if (chrome === "none") {
    return {
      /* site_chrome "home" (lib/website-builder/universal-chrome.ts): home's chrome, none here, is the whole site's, so no page draws a stored copy of a theme header. */
      settings: { ...BLANK_SETTINGS, [SITE_CHROME_SETTING]: SITE_CHROME_HOME_ONLY },
      pages: [
        { page_key: "home", sections: [] },
        { page_key: "product", sections: [mainProductSection()] },
      ],
    }
  }
  const preset = buildThemePreset(def)
  return {
    settings: preset.settings,
    pages: [
      { page_key: "home", sections: preset.pages.home.filter(isChromeSection) },
      { page_key: "product", sections: preset.pages.product },
    ],
  }
}

export type StartResult =
  | { ok: true; install: Record<string, unknown> & { id: string } }
  | { ok: false; status: number; error: string; code?: string }

const FAILED = "Could not create the website. Try again."
const full = (): StartResult => ({ ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE })
const failed = (): StartResult => ({ ok: false, status: 500, error: FAILED })

/**
 * Makes the website, or nothing. `supabase` is the caller's own client (the
 * limit is counted with it, as Add does); `admin` writes. `menus` is
 * ensureStoreMenus, passed in so a test can stand in for it.
 */
export async function createStartWebsite(
  db: { supabase: SupabaseClient; admin: SupabaseClient },
  input: { creatorId: string; mode: StartMode; name?: unknown; chrome?: StartChrome },
  deps: { menus?: typeof ensureStoreMenus } = {},
): Promise<StartResult> {
  const { supabase, admin } = db
  const { creatorId, mode } = input
  const menus = deps.menus ?? ensureStoreMenus

  const def = getThemeDefinition(STORELIB_DEFAULT_ID)
  const rows = startRows(input.chrome ?? "theme")
  if (!def || !rows) return failed()

  if ((await librarySlotsLeft(supabase, creatorId)) === 0) return full()

  /* The catalogue row is the install's foreign key, as in the add route. */
  const { data: catalogRow } = await admin.from("themes").select("id").eq("id", def.id).maybeSingle()
  if (!catalogRow) {
    const { error: seedErr } = await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
    if (seedErr) {
      /* The database's own words go to the server log, never into a toast. */
      console.error("[themes/create] could not register the catalogue row", { code: seedErr.code })
      return failed()
    }
  }

  const { data: named } = await supabase.from("store_theme_installs").select("name").eq("creator_id", creatorId)
  const taken = ((named ?? []) as { name?: unknown }[]).map((r) => (typeof r.name === "string" ? r.name : "")).filter(Boolean)
  const name = pickStartName(input.name, mode, taken)
  const sortOrder = await nextSortOrder(admin, creatorId)

  const { data: newInstall, error: installErr } = await admin
    .from("store_theme_installs")
    .insert({
      creator_id: creatorId,
      theme_id: def.id,
      name,
      status: "draft",
      is_custom: false,
      // After the websites already there.
      sort_order: sortOrder,
    })
    .select()
    .single()

  /* Two at once: the database refuses the second, or the recount backs it out. See library-limit.ts. */
  if (isLibraryFullError(installErr)) return full()
  if (installErr || !newInstall?.id) {
    console.error("[themes/create] could not create the install", { code: installErr?.code })
    return failed()
  }
  const installId = newInstall.id as string
  if (!(await keptWithinLimit(admin, creatorId, installId))) return full()

  /* The store's menus, not new ones: see the add route. */
  const carried = await menus(admin, creatorId, { excludeInstallId: installId })
  const pages = rows.pages.map((p) => ({
    install_id: installId,
    page_key: p.page_key,
    sections: carried ? pointAtStoreMenus(p.sections, carried.menus, carried) : p.sections,
  }))
  const settings = carried && !carried.stored ? { ...rows.settings, menus: carried.menus } : rows.settings

  const [{ error: settingsErr }, { error: pagesErr }] = await Promise.all([
    admin.from("store_theme_settings").insert({ install_id: installId, settings }),
    admin.from("store_theme_pages").insert(pages),
  ])
  if (settingsErr || pagesErr) {
    await admin.from("store_theme_installs").delete().eq("id", installId)
    console.error("[themes/create] could not write the pages or settings", { code: settingsErr?.code ?? pagesErr?.code })
    return failed()
  }

  return { ok: true, install: newInstall as Record<string, unknown> & { id: string } }
}
