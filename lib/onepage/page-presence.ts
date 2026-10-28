/**
 * ===========================================================================
 *  WHAT A PUBLISHED ONEPAGE ACTUALLY SHOWS, FOR A SEARCH ENGINE
 * ===========================================================================
 * Two questions the page's metadata and structured data ask of the copy a
 * visitor is drawn (lib/onepage/public-shape):
 *
 *   Does it show anything?  A page whose every block is switched off or
 *       outside its schedule, with no bio and no social icons, is a name
 *       and a photo. Indexed, it is a thin page under the creator's name,
 *       and Google's listing of it would say nothing. It is noindex until
 *       something is on it again, and the sitemap rule is unchanged.
 *
 *   Which profiles is it? The social icons it draws: the row's own icons
 *       when it has some, the profile's links when it has none (as the
 *       page draws them, components/onepage/public-onepage social_row),
 *       and the profile's links for a page with no row at all. These are
 *       the `sameAs` of its Person (lib/seo/structured-data onePageSameAs).
 *
 * Pure: no React, no database.
 */
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { plainText } from "@/lib/onepage/seo"

type Block = { type?: unknown; enabled?: unknown; data?: any; schedule?: unknown }

/* Blocks that say nothing on their own: the page's top and the space between things. */
const FRAME = new Set(["header", "divider", "spacer"])

const blocksOf = (list: unknown): Block[] => (Array.isArray(list) ? (list as Block[]).filter((b) => !!b && typeof b === "object") : [])

function filledLinks(links: unknown): Array<[string, string]> {
  if (!links || typeof links !== "object") return []
  return Object.entries(links as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1].trim())
}

/**
 * The social links the page draws, as platform and address: every shown row
 * of icons, each with its own icons or the profile's, then the profile's
 * links when no row is shown. The first address for a platform wins.
 */
export function onePageSocialLinks(input: { blocks: unknown; socialLinks: unknown; now?: number }): Record<string, string> {
  const now = input.now ?? Date.now()
  const out: Record<string, string> = {}
  const add = (platform: unknown, url: unknown) => {
    if (typeof platform !== "string" || typeof url !== "string" || !url.trim() || out[platform]) return
    out[platform] = url.trim()
  }
  const profile = filledLinks(input.socialLinks)
  let rows = 0
  for (const b of blocksOf(input.blocks)) {
    if (b.type !== "social_row" || !isBlockShown(b, now)) continue
    rows++
    const platforms = Array.isArray(b.data?.platforms) ? (b.data.platforms as Array<{ platform?: unknown; url?: unknown }>) : []
    if (platforms.length > 0) for (const p of platforms) add(p?.platform, p?.url)
    else for (const [k, v] of profile) add(k, v)
  }
  if (rows === 0) for (const [k, v] of profile) add(k, v)
  return out
}

/** Whether the published page shows a visitor anything beyond its name and photo. */
export function onePageShowsSomething(input: { blocks: unknown; bio: unknown; socialLinks: unknown; now?: number }): boolean {
  const now = input.now ?? Date.now()
  if (plainText(input.bio)) return true
  if (Object.keys(onePageSocialLinks({ blocks: input.blocks, socialLinks: input.socialLinks, now })).length > 0) return true
  return blocksOf(input.blocks).some((b) => typeof b.type === "string" && !FRAME.has(b.type) && b.type !== "social_row" && isBlockShown(b, now))
}

/**
 * Whether the page shows a link its creator marked sensitive (round 41): the
 * page asks the visitor before opening it (components/onepage/public-onepage
 * SensitiveLinkQuestion), and a page that has to ask is not one Storelib puts
 * in a search result. Shown blocks only, a group's children included.
 */
export function onePageSensitive(input: { blocks: unknown; now?: number }): boolean {
  const now = input.now ?? Date.now()
  const marked = (list: unknown): boolean =>
    blocksOf(list).some((b) => {
      if (!isBlockShown(b, now)) return false
      if (b.type === "link_button" && b.data?.sensitive === true) return true
      return b.type === "group" && marked(b.data?.children)
    })
  return marked(input.blocks)
}

/** The fields of a published `onepages` row the two questions read, as lib/onepage/public-shape draws them. */
export type OnePagePresenceRow = {
  bio?: string | null
  social_links?: unknown
  published_blocks?: unknown
  draft_blocks?: unknown
  published_profile?: unknown
  published_social_links?: unknown
}

/**
 * The sitemap's half of the page's rule, from the row alone: the published
 * copy (falling back where public-shape falls back) shows something, and no
 * link on it is marked sensitive. The page asks the same of the shape it
 * draws, so a page the sitemap lists does not say noindex.
 */
export function onePageRowListable(row: OnePagePresenceRow, now: number = Date.now()): boolean {
  const profile = row.published_profile && typeof row.published_profile === "object" ? (row.published_profile as { bio?: unknown }) : null
  const blocks = row.published_blocks || row.draft_blocks || []
  const socialLinks = row.published_social_links || row.social_links || {}
  const bio = (typeof profile?.bio === "string" && profile.bio) || row.bio || ""
  return onePageShowsSomething({ blocks, bio, socialLinks, now }) && !onePageSensitive({ blocks, now })
}
