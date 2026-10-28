/**
 * ===========================================================================
 *  WHICH BLOCK A CLICK BELONGS TO
 * ===========================================================================
 * A OnePage click is kept with the id of the block it was made on, in
 * onepage_clicks.block_id and analytics_events.link_id. That was enough for
 * a link button, and wrong for a row of social icons: every icon in the row
 * sent the row's id, so Instagram and then TikTok from one visitor on one
 * day was one click (onepage_clicks keeps one per visitor, block and day;
 * the analytics pipeline one per visit and link), and no report could say
 * which icon it was.
 *
 * An icon now sends `<row id>__<platform>`. Every reader folds it back into
 * its row with `blockOfLinkId`, so the row's total is the sum of its icons,
 * and Analytics lists each icon by the platform's name (onePageLinkLabels).
 * A row's clicks from before this carry the row's id alone and still count
 * for the row.
 *
 * Pure: no React, no database. The id stays inside what the analytics
 * pipeline accepts for a link id (letters, digits, _ and -, 80 at most).
 */
import { canonicalSocialPlatform } from "@/lib/onepage/social-url"
import { platformLabel } from "@/lib/onepage/seo-description"

export const SOCIAL_LINK_SEPARATOR = "__"
const LINK_ID_MAX = 80
const SAFE = /[^A-Za-z0-9_-]/g
const ID = /^[A-Za-z0-9_-]{1,80}$/

/** The id an icon in a social row is counted under: the row's id and the platform. */
export function socialLinkId(blockId: string, platform: string): string {
  const key = canonicalSocialPlatform(platform).replace(SAFE, "").slice(0, 24)
  const row = String(blockId ?? "").replace(SAFE, "")
  if (!key) return row.slice(0, LINK_ID_MAX)
  return `${row.slice(0, LINK_ID_MAX - SOCIAL_LINK_SEPARATOR.length - key.length)}${SOCIAL_LINK_SEPARATOR}${key}`
}

/** The block a click was made on: the row for an icon, the id itself for anything else. */
export function blockOfLinkId(linkId: string | null | undefined): string {
  const id = String(linkId ?? "")
  if (!ID.test(id)) return id
  const at = id.lastIndexOf(SOCIAL_LINK_SEPARATOR)
  return at > 0 ? id.slice(0, at) : id
}

/** The platform of an icon's click, or null for a click on a whole block. */
export function platformOfLinkId(linkId: string | null | undefined): string | null {
  const id = String(linkId ?? "")
  /* A link's address (a click with no block) is never an icon's id, whatever it has in it. */
  if (!ID.test(id)) return null
  const at = id.lastIndexOf(SOCIAL_LINK_SEPARATOR)
  const key = at > 0 ? id.slice(at + SOCIAL_LINK_SEPARATOR.length) : ""
  return key || null
}

/** What Analytics calls an icon's clicks: the platform's own name. */
export function socialLinkLabel(linkId: string): string | null {
  const platform = platformOfLinkId(linkId)
  return platform ? platformLabel(platform) || null : null
}

type Block = { id?: unknown; type?: unknown; data?: unknown }

function childrenOf(block: Block): Block[] {
  const children = (block?.data as { children?: unknown } | null | undefined)?.children
  return Array.isArray(children) ? (children as Block[]) : []
}

/**
 * The ids whose clicks a block's figures count: the block, and for a group
 * every block inside it. An icon's id is matched through `blockOfLinkId`.
 */
export function blockIdsCounted(blocks: unknown, blockId: string): Set<string> {
  const ids = new Set<string>([blockId])
  const list = Array.isArray(blocks) ? (blocks as Block[]) : []
  const walk = (items: Block[], inside: boolean) => {
    for (const b of items) {
      const id = typeof b?.id === "string" ? b.id : null
      const counted = inside || id === blockId
      if (id && inside) ids.add(id)
      walk(childrenOf(b), counted)
    }
  }
  walk(list, false)
  return ids
}

/** Whether a click, by its link id, belongs to these blocks. */
export function clickBelongs(linkId: string | null | undefined, ids: Set<string>): boolean {
  if (!linkId) return false
  return ids.has(linkId) || ids.has(blockOfLinkId(linkId))
}

/**
 * Clicks per block for the editor's list: each click on the block it was
 * made on, an icon's on its row, and a group's total as its own clicks and
 * every one inside it. Ids the page no longer has are kept under their own
 * id, so nothing is lost before the editor looks them up.
 */
export function clicksPerBlock(linkIds: Array<string | null | undefined>, blocks: unknown): Record<string, number> {
  const own: Record<string, number> = {}
  for (const link of linkIds) {
    if (!link) continue
    const block = blockOfLinkId(link)
    own[block] = (own[block] ?? 0) + 1
  }
  const out: Record<string, number> = { ...own }
  const list = Array.isArray(blocks) ? (blocks as Block[]) : []
  const total = (b: Block): number => {
    const id = typeof b?.id === "string" ? b.id : ""
    return (own[id] ?? 0) + childrenOf(b).reduce((n, c) => n + total(c), 0)
  }
  const walk = (items: Block[]) => {
    for (const b of items) {
      if (b?.type === "group" && typeof b.id === "string") out[b.id] = total(b)
      walk(childrenOf(b))
    }
  }
  walk(list)
  return out
}
