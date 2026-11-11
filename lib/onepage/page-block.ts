// OnePage: one block of the published page, as a visitor sees it (round AR)
// Location: lib/onepage/page-block.ts
//
// The routes a visitor's tap reaches (a tip, a vote, an unlock, an RSVP)
// never trust what the page sends about the block: they read the block from
// the page's PUBLISHED copy by its id, and answer only while a visitor could
// see it: switched on, in its schedule, and inside a group that is on and in
// its schedule too. Pure, so the tests ask it the same questions.

import { isScheduledNow } from "./extra-blocks"

type Block = { id?: unknown; type?: unknown; enabled?: unknown; schedule?: unknown; data?: unknown }

/** The block `id` and the groups it sits in, outermost first, or null. */
export function findPageBlock(blocks: unknown, id: unknown): { block: Block; parents: Block[] } | null {
  if (typeof id !== "string" || !id || id.length > 120 || !Array.isArray(blocks)) return null
  const walk = (list: unknown[], parents: Block[], depth: number): { block: Block; parents: Block[] } | null => {
    if (depth > 3) return null
    for (const raw of list) {
      const b = raw as Block | null
      if (!b || typeof b !== "object") continue
      if (b.id === id) return { block: b, parents }
      const children = (b.data as { children?: unknown } | null)?.children
      if (b.type === "group" && Array.isArray(children)) {
        const inner = walk(children, [...parents, b], depth + 1)
        if (inner) return inner
      }
    }
    return null
  }
  return walk(blocks, [], 0)
}

/** On and in its schedule, itself and every group around it. */
export function visibleNow(found: { block: Block; parents: Block[] } | null, now: number = Date.now()): boolean {
  if (!found) return false
  return [...found.parents, found.block].every((b) => b.enabled !== false && isScheduledNow(b as { schedule?: never }, now))
}

/**
 * The data of an app block of this provider that a visitor can see now on
 * the published page, or null: a block from a draft, one switched off, out
 * of its schedule or of another kind is never answered.
 */
export function liveAppBlockData<T = Record<string, unknown>>(blocks: unknown, id: unknown, provider: string, now: number = Date.now()): T | null {
  const found = findPageBlock(blocks, id)
  if (!found || found.block.type !== "app") return null
  const data = (found.block.data ?? {}) as { provider?: unknown }
  if (data.provider !== provider) return null
  return visibleNow(found, now) ? (data as T) : null
}

/** The blocks a visitor is served: the published copy when there is one, else the row's draft, as the live page reads them (lib/onepage/public-shape). */
export function publishedBlocksOf(row: { published_blocks?: unknown; draft_blocks?: unknown } | null | undefined): unknown[] {
  if (Array.isArray(row?.published_blocks)) return row!.published_blocks as unknown[]
  if (Array.isArray(row?.draft_blocks)) return row!.draft_blocks as unknown[]
  return []
}

/** The creator (creators.id) a page belongs to. */
export function pageCreatorId(row: { seller_id?: string | null; creator_id?: string | null } | null | undefined): string | null {
  return row?.seller_id || row?.creator_id || null
}
