import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import { WebsiteBuilderClient, type WebsiteSummary } from "./website-builder-client"
import {
  SNAPSHOT_BUCKET,
  isCurrentSnapshotUrl,
  snapshotFolder,
  snapshotsNewestFirst,
  snapshotTakenAt,
} from "@/lib/website-builder/snapshot"

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

  const installs = await withStoredCovers(
    ((rows ?? []) as unknown as InstallRow[]).map(toSummary),
    user.id,
  )

  return <WebsiteBuilderClient installs={installs} username={username} />
}

/**
 * ===========================================================================
 *  A COVER THE COLUMN LOST IS FOUND IN THE FOLDER
 * ===========================================================================
 * The editor photographs the home page after every save and the route
 * uploads it. If the database has no `snapshot_url` column the route cannot
 * record where it put it, answers 200 anyway, and this page — which only
 * ever looked at the column — drew the theme's stock artwork instead. In
 * production that was a site called THE CHAIR showing a cover that said
 * "Presets that hit different", which is Digital Wave's sample copy, after
 * seventeen snapshots of the real thing had been uploaded that week.
 *
 * So for any install the column says nothing about, the install's own
 * snapshot folder is asked for its newest picture. Once the column exists
 * and is filled, none of these requests are made at all.
 *
 * COST. One storage listing per install without a recorded cover, all at
 * once rather than one after another, and a creator has a handful. The
 * listing is capped and scoped to the signed-in user's own folders: the
 * path is built from their id and an install their creator row owns, never
 * from anything in the request.
 *
 * A listing that fails leaves that one card on its drawn cover, which is
 * what it showed before. The page never waits on a picture to render.
 */
async function withStoredCovers(given: WebsiteSummary[], userId: string): Promise<WebsiteSummary[]> {
  /*
    A cover recorded by a capture older than SNAPSHOT_VERSION is the header
    over a blank page, and is treated as no cover at all: the folder is asked
    for a current one, and failing that the card draws its stand-in.
  */
  const installs = given.map((i) =>
    i.snapshot_url && !isCurrentSnapshotUrl(i.snapshot_url) ? { ...i, snapshot_url: null, snapshot_updated_at: null } : i,
  )
  const missing = installs.filter((i) => !i.snapshot_url)
  if (missing.length === 0) return installs

  const admin = createAdminClient()
  const bucket = admin.storage.from(SNAPSHOT_BUCKET)
  const found = new Map<string, { url: string; at: string | null }>()

  await Promise.all(
    missing.map(async (install) => {
      try {
        const folder = snapshotFolder(userId, install.id)
        const { data } = await bucket.list(folder, { limit: 100 })
        const newest = snapshotsNewestFirst((data ?? []).map((f) => f.name))[0]
        if (!newest) return
        found.set(install.id, {
          url: bucket.getPublicUrl(`${folder}/${newest}`).data.publicUrl,
          at: snapshotTakenAt(newest),
        })
      } catch {
        /* That card keeps its drawn cover. */
      }
    }),
  )

  return installs.map((install) => {
    const hit = found.get(install.id)
    if (!hit) return install
    return {
      ...install,
      snapshot_url: hit.url,
      snapshot_updated_at: hit.at,
      saved_at: newest(install.saved_at, hit.at),
    }
  })
}
