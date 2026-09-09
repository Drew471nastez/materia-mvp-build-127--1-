import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import { WebsiteBuilderClient, type WebsiteSummary } from "./website-builder-client"

export const metadata: Metadata = {
  title: "Website",
}

/**
 * ===========================================================================
 *  /app/website-builder — the website page
 * ===========================================================================
 * Rendered on the server with the data already in it, like /app/products.
 *
 * The page used to be a client component that mounted empty, showed a
 * skeleton, fetched `/api/website-builder/themes` (every install WITH every
 * page's sections), and then — for the thumbnails — mounted the live
 * storefront three times over. Two round trips and three websites, to show
 * a list of three names.
 *
 * Now the server reads the installs once (settings only, no pages: the cover
 * is a picture, not a render), initialises a first-time creator in the same
 * request, and hands the client component a small, flat list. There is no
 * loading state inside the page; `loading.tsx` covers the server render and
 * only appears if that takes longer than the skeleton's deferral.
 */

type InstallRow = {
  id: string
  name: string
  status: ThemeStatus
  theme_id: string
  created_at: string
  updated_at: string
  published_at?: string | null
  snapshot_url?: string | null
  snapshot_updated_at?: string | null
  theme: { name: string; version: string; slug: string } | { name: string; version: string; slug: string }[] | null
  settings: { settings: ThemeSettingsValues | null; updated_at: string }[] | { settings: ThemeSettingsValues | null; updated_at: string } | null
}

const INSTALL_SELECT = `
  *,
  theme:themes(name, version, slug),
  settings:store_theme_settings(settings, updated_at)
`

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function newest(...isos: (string | null | undefined)[]): string {
  let best = 0
  for (const iso of isos) {
    const t = iso ? Date.parse(iso) : NaN
    if (Number.isFinite(t) && t > best) best = t
  }
  return new Date(best || Date.now()).toISOString()
}

function toSummary(row: InstallRow): WebsiteSummary {
  const settings = one(row.settings)
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    theme_id: row.theme_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at ?? null,
    snapshot_url: row.snapshot_url ?? null,
    snapshot_updated_at: row.snapshot_updated_at ?? null,
    saved_at: newest(row.updated_at, settings?.updated_at, row.snapshot_updated_at, row.created_at),
    theme: one(row.theme),
    settings: settings?.settings ?? null,
  }
}

export default async function WebsiteBuilderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id, slug").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ])
  if (!creator) redirect("/app")

  const username = profile?.username || creator.slug || ""

  const load = () =>
    supabase
      .from("store_theme_installs")
      .select(INSTALL_SELECT)
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true })

  let { data: rows } = await load()

  if (!rows || rows.length === 0) {
    // First visit: the same idempotent seed the old page called from the
    // browser, done here so the creator never sees an empty page first.
    const admin = createAdminClient()
    await admin.rpc("initialize_creator_themes", { p_creator_id: creator.id })
    ;({ data: rows } = await load())
  }

  const installs = ((rows ?? []) as unknown as InstallRow[]).map(toSummary)

  return <WebsiteBuilderClient installs={installs} username={username} />
}
