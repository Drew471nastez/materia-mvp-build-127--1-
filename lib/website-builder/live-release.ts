/**
 * ===========================================================================
 *  WHICH PUBLISH A PAGE OF A LIVE WEBSITE WAS DRAWN FROM, AS ONE WORD
 * ===========================================================================
 * A page already in a visitor's browser is out of every server cache's
 * reach: the back and forward cache keeps the whole document, Back from a
 * checkout loads it from the browser's own cache without asking, and Next's
 * router keeps the pages it fetched ahead for minutes. Each of them showed
 * the theme from before a Publish until the visitor refreshed.
 *
 * So every page of a live website carries a marker of what was live when it
 * was drawn (`liveSiteFor`), and the page asks /api/public/site-release for
 * the marker now when it could be showing something old
 * (./live-release-script.ts). Different: the page is loaded again.
 *
 * The marker names the published install and its live release (SQL part
 * 180), hashed, so neither id is handed to the public. A Publish writes a
 * new release, switching themes changes the install, and a live file edited
 * outside Publish clears the pointer (`site_live_release_forget`): each one
 * changes the marker. Read in one round trip with whether the install is an
 * imported theme, which the two renderers use to send a visitor the proxy
 * routed by an answer from before a switch on to the right one
 * (SITE_FRESH_PARAM). Held under the site's tag, which Publish expires at
 * once (published-site.ts revalidatePublishedSite).
 */
import "server-only"
import { unstable_cache } from "next/cache"
import { PUBLISHED_HOLD_S } from "@/lib/delivery/holds"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorSiteTag } from "@/lib/website-builder/published-site"
import { releasesKnownMissing, releasesMissing } from "@/lib/website-builder/site-releases-server"
import { sha256Hex } from "@/lib/website-builder/site-releases"

/** How long what is live is held when nothing clears it: the release pointer's own hold (site-releases-server.ts POINTER_HOLD_S). Publish expires it at once. */
const LIVE_HOLD_S = PUBLISHED_HOLD_S

export interface LiveSite {
  /** What is live, as the marker a page carries. */
  marker: string
  /** The published install is a theme imported from Shopify (drawn by app/api/site-theme/site). */
  compat: boolean
}

/** The marker for an install and its release (null: drawn from the rows). Short, and not either id. */
/** The marker for an install whose live rows are counted (part 180 `site_live_releases.rev`): the same for the rows and for the release written from them. */
export function liveMarkerAt(installId: string, rev: number): string {
  return sha256Hex(`${installId}:rev:${rev}`).slice(0, 16)
}

export function liveMarker(installId: string, releaseId: string | null): string {
  return sha256Hex(`${installId}:${releaseId ?? "rows"}`).slice(0, 16)
}

type Answer = { data: unknown; error: { code?: string; message?: string } | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }
type Row = {
  id?: string
  site_live_releases?: { release_id?: string | null; rev?: number | string | null } | { release_id?: string | null; rev?: number | string | null }[] | null
  store_theme_settings?: { kind?: string | null } | { kind?: string | null }[] | null
}
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** The published install, its live release and its kind, in one read. Throws when the database did not answer. */
export async function readLiveSite(db: Db, creatorId: string): Promise<LiveSite | null> {
  const ask = (columns: string): Promise<Answer> =>
    db.from("store_theme_installs").select(columns).eq("creator_id", creatorId).eq("status", "published").order("sort_order", { ascending: true }).limit(1).maybeSingle()
  const kind = "store_theme_settings ( kind:settings->compat->>kind )"
  let r = await ask(releasesKnownMissing() ? `id, ${kind}` : `id, site_live_releases ( release_id, rev ), ${kind}`)
  /* Before part 180: no release to name, the install alone. */
  if (r.error && releasesMissing(r.error)) r = await ask(`id, ${kind}`)
  if (r.error) throw new Error(`live site: ${r.error.message ?? r.error.code ?? "the read failed"}`)
  const row = r.data as Row | null
  if (!row?.id) return null
  const link = one(row.site_live_releases)
  const releaseId = link?.release_id
  /*
    BY THE LIVE ROWS' COUNT WHEN THERE IS ONE (round AM). The release a
    Publish records is written from the live rows a few seconds after the
    Publish, and it is pointed at only while the rows are still what it was
    written from (site-releases-server.ts recordRelease, `rev`). So the page
    drawn from the rows in those seconds and the page drawn from the release
    after are the same page, and they now carry the same marker: a page drawn
    in between is not reloaded when the pointer moves on (which it did, an
    hour later, once the pointer's hold ran out). Every change to the live
    rows counts `rev` up (the trigger of part 180), and so does putting a
    release back: each one is a new marker, as before. Without the row (part
    180 not run, or a site never released) the marker is what it always was.
  */
  const rev = typeof link?.rev === "number" ? link.rev : typeof link?.rev === "string" && /^\d{1,18}$/.test(link.rev) ? Number(link.rev) : null
  const marker = rev !== null ? liveMarkerAt(row.id, rev) : liveMarker(row.id, typeof releaseId === "string" && releaseId ? releaseId : null)
  return { marker, compat: one(row.store_theme_settings)?.kind === "shopify" }
}

/**
 * What is live for a creator now. Null when nothing is published. Throws
 * when the database did not answer, so the caller can say "not known"
 * rather than "changed".
 */
export async function liveSiteFor(creatorId: string): Promise<LiveSite | null> {
  return unstable_cache(() => readLiveSite(createAdminClient(), creatorId), ["site-live-state", creatorId], { tags: [creatorSiteTag(creatorId)], revalidate: LIVE_HOLD_S })()
}
