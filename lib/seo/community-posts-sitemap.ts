/**
 * ===========================================================================
 *  A COMMUNITY'S PUBLIC POSTS, IN ITS SITEMAP FILE (round 45)
 * ===========================================================================
 * A post in a public community's open space has its own indexable page at
 * /community/<slug>/post/<words>-<id>, with its own title, description and
 * canonical (app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo.ts
 * indexablePost). Nothing listed those pages and nothing crawlable linked
 * them: the community's public face shows its About, never its feed. So a
 * page that said index could not be found.
 *
 * The communities file now lists them beside their community, by the same
 * rule the page reads, so the two cannot disagree:
 *
 *   THE COMMUNITY   one the file already lists (published, public, not
 *                   invite only, not hidden, suspended, deleted, waiting to
 *                   be deleted, on its own domain, or a banned creator's)
 *   THE SPACE       none, or one every member may read (isOpenRule), and
 *                   not archived
 *   THE POST        published and not deleted
 *
 * Nothing of a post in a space with a tier, product, level or role rule is
 * read past its id and space: it is not listed, and its words never leave
 * the database for this.
 */
import { isOpenRule } from "@/lib/communities/access"
import { postPath } from "@/lib/communities/post-url"
import type { AccessRuleJson } from "@/lib/communities/types"
import { lastmodOf, type SitemapEntry } from "./indexing"

const STORELIB = "https://storelib.com"

export interface SitemapSpaceRow {
  id: string
  community_id: string
  view_access: AccessRuleJson | null
  archived_at: string | null
}

export interface SitemapPostRow {
  id: string
  community_id: string
  space_id: string | null
  title: string | null
  body_text?: string | null
  status: string
  deleted_at: string | null
  created_at: string | null
  edited_at: string | null
}

/** The spaces whose posts any visitor may read. */
export function openSpaceIds(spaces: SitemapSpaceRow[]): Set<string> {
  return new Set(spaces.filter((s) => !s.archived_at && isOpenRule(s.view_access ?? {})).map((s) => s.id))
}

/** Whether a post's page is a public one, by indexablePost's rule for the post and its space. */
export function listablePost(p: SitemapPostRow, open: Set<string>): boolean {
  return p.status === "published" && !p.deleted_at && (p.space_id === null || open.has(p.space_id))
}

/** The sitemap rows for the public posts of these (already listed) communities, at each post's canonical address. */
export function publicPostEntries(communities: { id: string; slug: string }[], spaces: SitemapSpaceRow[], posts: SitemapPostRow[]): SitemapEntry[] {
  const slugOf = new Map(communities.map((c) => [c.id, c.slug]))
  const open = openSpaceIds(spaces.filter((s) => slugOf.has(s.community_id)))
  const out: SitemapEntry[] = []
  for (const p of posts) {
    const slug = slugOf.get(p.community_id)
    if (!slug || !listablePost(p, open)) continue
    out.push({ url: `${STORELIB}${postPath(slug, { id: p.id, title: p.title, bodyText: p.body_text })}`, lastModified: lastmodOf(p.edited_at ?? p.created_at) })
  }
  return out
}
