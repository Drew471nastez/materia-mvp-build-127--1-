import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft, nextSortOrder } from "@/lib/website-builder/library-limit"
import {
  buildThemePreset,
  getThemeDefinition,
  isThemeId,
  themeCatalogRow,
  BROWSABLE_THEME_IDS,
} from "@/lib/website-builder/theme-registry"
import { coverAfterCreate, renderOrigin } from "@/lib/website-builder/cover-take"

export const runtime = "nodejs"
/** The theme is added at once; its photograph is taken after, which needs a browser launch. */
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

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

  const { data: existing } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("creator_id", creator.id)
    .eq("theme_id", themeId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "This theme is already in your library" }, { status: 400 })
  }

  const admin = createAdminClient()

  // The catalogue row is the install's foreign key. Make sure it exists.
  const { data: catalogRow } = await admin.from("themes").select("id").eq("id", themeId).maybeSingle()
  if (!catalogRow) {
    const { error: seedErr } = await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
    if (seedErr) {
      return NextResponse.json({ error: `Could not register theme: ${seedErr.message}` }, { status: 500 })
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

  if (installErr || !newInstall) {
    return NextResponse.json({ error: installErr?.message ?? "Failed to add theme" }, { status: 500 })
  }

  // Settings and pages, or nothing: a half-built install is a website that
  // opens to an empty editor, which reads as data loss.
  const [{ error: settingsErr }, { error: pagesErr }] = await Promise.all([
    admin.from("store_theme_settings").insert({
      install_id: newInstall.id,
      settings: preset.settings,
    }),
    admin.from("store_theme_pages").insert([
      { install_id: newInstall.id, page_key: "home", sections: preset.pages.home },
      { install_id: newInstall.id, page_key: "product", sections: preset.pages.product },
    ]),
  ])

  if (settingsErr || pagesErr) {
    await admin.from("store_theme_installs").delete().eq("id", newInstall.id)
    return NextResponse.json(
      { error: settingsErr?.message ?? pagesErr?.message ?? "Failed to add theme" },
      { status: 500 },
    )
  }

  /* Its cover is a photograph of this website from the start, not a drawing of the theme's sample shop. */
  after(() => coverAfterCreate({ installId: newInstall.id as string, userId: user.id, creatorId: creator.id as string }, renderOrigin(req.url), "add"))

  return NextResponse.json({ install: newInstall })
}
