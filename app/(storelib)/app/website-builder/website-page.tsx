import { redirect } from "next/navigation"
import { websitePage } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import { WebsiteBuilderClient, type WebsiteSummary } from "./website-builder-client"
import {
  SNAPSHOT_BUCKET,
  isCurrentSnapshotUrl,
  snapshotFolder,
  snapshotsNewestFirst,
  snapshotTakenAt,
  mobilePartner,
} from "@/lib/website-builder/snapshot"
import { ensureStarterWebsite } from "@/lib/website-builder/starter-website"
import { publishedListings } from "@/lib/themes/marketplace-server"
import { publishedReleases } from "@/lib/themes/releases-server"
import { builtinListings } from "@/lib/themes/marketplace-shared"
import { agentEnabledFor } from "@/lib/website-builder/ai-site/agent-access"

/**
 * ===========================================================================
 *  /app/website-builder — the website page
 * ===========================================================================
 * Rendered on the server with the data already in it, like /app/products.
 *
 * ONE LOADER, TWO ADDRESSES (templates round 16). /app/website-builder
 * (./page.tsx) and /app/website-builder/ai (./ai/page.tsx) are the same page:
 * the same access check, the same reads, the same client component. The
 * second only asks for the Create a website section at the top (`create`),
 * so neither route can drift from the other, and the check on who may see a
 * store's websites is written once.
 *
 * The page used to be a client component that mounted empty, showed a
 * skeleton, fetched `/api/website-builder/themes` (every install WITH every
 * page's sections), and then — for the thumbnails — mounted the live
 * storefront three times over. Two round trips and three websites, to show
 * a list of three names.
 *
 * Now the server reads the installs once (settings only, no pages: the cover
 * is a picture, not a render), gives a creator with no website the default
 * theme as a draft in the same request, and hands the client component a small, flat list. There is no
 * loading state inside the page and no route skeleton: a slow server render
 * is the app's stage to cover, the same way on every page in /app.
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
  pages?: { updated_at: string }[] | null
}

const INSTALL_SELECT = `
  *,
  theme:themes(name, version, slug),
  settings:store_theme_settings(settings, updated_at),
  pages:store_theme_pages(updated_at)
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
  /*
    WHEN THE SITE WAS LAST EDITED: its pages and its settings, and nothing
    else. Not the install row's own updated_at — recording a new cover
    writes to that row, and counting it would make every cover look older
    than the site it had just been taken of, and ask for another, forever.
  */
  const editedAt = newest(settings?.updated_at, ...(row.pages ?? []).map((p) => p.updated_at), row.created_at)
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
    saved_at: editedAt,
    snapshot_mobile_url: null,
    theme: one(row.theme),
    settings: settings?.settings ?? null,
  }
}

export async function WebsitePage({ create = false }: { /** The Create a website section at the top: /app/website-builder/ai only. */ create?: boolean }) {
  /* Whose store (round 42): the owner's own, or the store a team member with Website works in (lib/team/website). */
  const access = await websitePage()
  if (access.kind === "closed") return null
  if (access.kind === "none") redirect("/app")
  const supabase = access.db

  /*
    THE LIBRARY BESIDE THE ROWS IT USED TO WAIT FOR (round 48). The installs,
    the website's name and the theme listings need only the store's id, which
    websitePage already has, so they go with the creator and profile reads
    instead of after them: one round trip less before the page is drawn. A
    store with no creator row is still sent to /app before anything is shown.
  */
  const storeId = access.creatorId
  const load = () =>
    supabase
      .from("store_theme_installs")
      .select(INSTALL_SELECT)
      .eq("creator_id", storeId)
      .order("sort_order", { ascending: true })

  /*
    SIDE BY SIDE, NOT ONE AFTER ANOTHER. The website's own name needs only the
    creator, so it is asked for with the installs rather than after the
    covers: one round trip less before the page can be drawn. "I click on
    Website, it shows the loading thing because the page takes long to load."
  */
  const listings = publishedListings().catch(() => builtinListings())
  /* The theme versions the library's Update available reads; none before RUN_THEME_RELEASES.sql has run. */
  const releases = publishedReleases().catch(() => [])
  const handle = websiteHandleOf(storeId)
  const [{ data: creator }, { data: profile }, library] = await Promise.all([
    supabase.from("creators").select("id, slug").eq("id", storeId).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", access.ownerUserId).maybeSingle(),
    load(),
  ])
  if (!creator) redirect("/app")

  const username = profile?.username || creator.slug || ""

  let { data: rows } = library

  if (rows && rows.length === 0) {
    /*
      An empty library: Storelib Default goes in as a draft, so there is a
      website to open and nothing is live until the creator publishes it.
      Idempotent, and never twice (lib/website-builder/starter-website.ts).
      Not on a read that failed: `rows` is null then, and a library that
      could not be read is not an empty one.
    */
    const { installId } = await ensureStarterWebsite(createAdminClient(), creator.id)
    if (installId) ({ data: rows } = await load())
  }

  const installs = await withStoredCovers(
    ((rows ?? []) as unknown as InstallRow[]).map(toSummary),
    /* Covers are kept in the store owner's folder. */
    access.ownerUserId,
  )

  /* The website's own name on Storelib, when its creator gave it one. */
  const siteHandle = await handle
  /*
    Whether Start with AI can design from scratch (round N): the new AI builder, the agent engine, on for this store's
    owner. The same check themes/create makes; it reads the creator's names only when the allowlist has names.
  */
  const aiAgent = access.isOwner ? await agentEnabledFor(createAdminClient(), { ownerUserId: access.ownerUserId, creatorId: storeId }).catch(() => false) : false
  return <WebsiteBuilderClient installs={installs} username={username} siteHandle={siteHandle} listings={await listings} releases={await releases} account={access.viewer} teamMember={!access.isOwner} aiAgent={aiAgent} create={create} />
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
  /*
    ONLY THE INSTALLS THE COLUMN SAYS NOTHING ABOUT. Every install's folder
    was listed on every visit, for the phone picture that goes with the
    desktop one; this page never draws the phone picture (the cover is the
    desktop screenshot alone, cut from its top), so that was a storage
    round trip per website before the page could be drawn, for nothing on
    it. A current column is the record; the folder is asked only where the
    column is empty or holds a picture too old to show.
  */
  const missing = installs.filter((i) => !i.snapshot_url)
  if (missing.length === 0) return installs

  const admin = createAdminClient()
  const bucket = admin.storage.from(SNAPSHOT_BUCKET)
  const found = new Map<string, { url: string; mobile: string | null; at: string | null }>()

  await Promise.all(
    missing.map(async (install) => {
      try {
        const folder = snapshotFolder(userId, install.id)
        const { data } = await bucket.list(folder, { limit: 100 })
        const names = (data ?? []).map((f) => f.name)
        const newest = snapshotsNewestFirst(names)[0]
        if (!newest) return
        const phone = mobilePartner(newest, names)
        found.set(install.id, {
          url: bucket.getPublicUrl(`${folder}/${newest}`).data.publicUrl,
          mobile: phone ? bucket.getPublicUrl(`${folder}/${phone}`).data.publicUrl : null,
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
      snapshot_mobile_url: hit.mobile,
      snapshot_updated_at: hit.at,
    }
  })
}
