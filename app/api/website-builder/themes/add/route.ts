import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, isLibraryFullError, keptWithinLimit, librarySlotsLeft, nextSortOrder } from "@/lib/website-builder/library-limit"
import {
  buildThemePreset,
  getThemeDefinition,
  isThemeId,
  themeCatalogRow,
  BROWSABLE_THEME_IDS,
} from "@/lib/website-builder/theme-registry"
import { coverForNewWebsite, renderOrigin } from "@/lib/website-builder/cover-take"
import { ensureStoreMenus } from "@/lib/website-builder/store-menus-server"
import { pointAtStoreMenus } from "@/lib/website-builder/main-menu"

export const runtime = "nodejs"
/** The theme is added at once, and photographed within QUICK_COVER_MS when a browser is that quick. */
export const maxDuration = 60

/**
 * POST /api/website-builder/themes/add   body: { theme_id }
 *
 * Installs a theme from the registry as a new draft website: the install row,
 * its global settings, and a home and product page built by the theme's
 * preset. The creator's own websites are capped at THEME_INSTALL_LIMIT (lib/website-builder/library-limit.ts).
 *
 * The registry (`lib/website-builder/theme-registry.ts`) is the catalogue.
 * The `themes` table mirrors it, and if a registry theme is missing there —
 * a theme added in code before the seed SQL ran — the row is inserted here
 * from the same definition, so "Add" never 404s on a theme the page offered.
 */
export async function POST(req: Request) {
  /* The owner, or a team member with Website working in the store (lib/team/website): the new website is the store's. */
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, user, creator } = site

  const body = await req.json().catch(() => ({}))
  const themeId: unknown = body?.theme_id

  if (!isThemeId(themeId)) {
    return NextResponse.json({ error: "theme_id must be a theme id" }, { status: 400 })
  }

  const def = getThemeDefinition(themeId)
  if (!def) return NextResponse.json({ error: "Theme not found in catalog" }, { status: 404 })
  /* Only what Browse themes offers can be added; the others stay for the websites already made from them. */
  if (!BROWSABLE_THEME_IDS.includes(def.id)) return NextResponse.json({ error: "That theme is not offered any more." }, { status: 400 })

  const slotsLeft = await librarySlotsLeft(supabase, creator.id)
  if (slotsLeft === 0) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  /* A limit of one, not maybeSingle: a duplicate shares its source's theme,
     and two rows made maybeSingle answer nothing, which read as "not added". */
  const { data: existing } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("creator_id", creator.id)
    .eq("theme_id", themeId)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "This theme is already in your library" }, { status: 400 })
  }

  const admin = createAdminClient()

  // The catalogue row is the install's foreign key. Make sure it exists.
  const { data: catalogRow } = await admin.from("themes").select("id").eq("id", themeId).maybeSingle()
  if (!catalogRow) {
    const { error: seedErr } = await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
    if (seedErr) {
      /* The database's own words go to the server log, never into a toast. */
      console.error("[themes/add] could not register the catalogue row", { themeId, code: seedErr.code })
      return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
    }
  }

  const preset = buildThemePreset(def)
  const sortOrder = await nextSortOrder(admin, creator.id)

  const { data: newInstall, error: installErr } = await admin
    .from("store_theme_installs")
    .insert({
      creator_id: creator.id,
      theme_id: themeId,
      name: def.name,
      status: "draft",
      is_custom: false,
      // After the websites already there.
      sort_order: sortOrder,
    })
    .select()
    .single()

  /* Two adds at once: the database refuses the second, or the recount backs it out. See library-limit.ts. */
  if (isLibraryFullError(installErr)) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }
  if (installErr || !newInstall) {
    console.error("[themes/add] could not create the install", { themeId, code: installErr?.code })
    return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
  }
  if (!(await keptWithinLimit(admin, creator.id, newInstall.id as string))) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  /*
    THE STORE'S MENUS, NOT NEW ONES. The menus visitors see are written down
    as the store's before this website exists (store-menus-server.ts
    ensureStoreMenus), so it draws them rather than its starter links, and
    its header and footer name the same menus the live one does. Without the
    table, it gets its own copy, as menus were kept before.
  */
  const carried = await ensureStoreMenus(admin, creator.id, { excludeInstallId: newInstall.id as string })
  const homeSections = carried ? pointAtStoreMenus(preset.pages.home, carried.menus, carried) : preset.pages.home
  const settings = carried && !carried.stored ? { ...preset.settings, menus: carried.menus } : preset.settings

  // Settings and pages, or nothing: a half-built install is a website that
  // opens to an empty editor, which reads as data loss.
  const [{ error: settingsErr }, { error: pagesErr }] = await Promise.all([
    admin.from("store_theme_settings").insert({
      install_id: newInstall.id,
      settings,
    }),
    admin.from("store_theme_pages").insert([
      { install_id: newInstall.id, page_key: "home", sections: homeSections },
      { install_id: newInstall.id, page_key: "product", sections: preset.pages.product },
    ]),
  ])

  if (settingsErr || pagesErr) {
    await admin.from("store_theme_installs").delete().eq("id", newInstall.id)
    /* The database's own words go to the server log, never into a toast. */
    console.error("[themes/add] could not write the pages or settings", { code: settingsErr?.code ?? pagesErr?.code })
    return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
  }

  /*
    Its cover is a photograph of this website from the start, not a drawing
    of the theme's sample shop. No theme ships a preview picture of its own
    (themeCatalogRow's preview_image_url is null for all of them), so the
    photograph is the first picture it can have.
  */
  const first = await coverForNewWebsite({ installId: newInstall.id as string, userId: site.ownerUserId, creatorId: creator.id as string }, renderOrigin(req.url), "add", null)

  return NextResponse.json({ install: newInstall, ...first })
}
