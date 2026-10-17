/**
 * ===========================================================================
 *  WHETHER THERE IS ROOM FOR ONE MORE BLOCK
 * ===========================================================================
 * Two limits, and they mean different things. `max_blocks` is how many blocks
 * a section (or a block that holds blocks) will hold at all; `limit` on a
 * block type is how many of THAT kind it will hold. A slideshow that takes
 * eight slides and one caption needs both. Then the section's total at every
 * depth, and how deep blocks may nest.
 *
 * Add block, Duplicate and Paste block all ask this one function, so a block
 * pasted from another section meets exactly the rules a block added by hand
 * does. Pure.
 */
import { countAll } from "./block-tree"
import { LIMITS, MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import type { BlockInstance, BlockSchema } from "./types"

export function blockRoom(
  owner: { name: string; max_blocks?: number } | undefined,
  siblings: readonly BlockInstance[],
  def: Pick<BlockSchema, "name" | "limit"> | undefined,
  blockType: string,
  section: { blocks?: BlockInstance[] },
  room: { depth: number; size: number; height: number },
): { ok: true } | { ok: false; reason: string } {
  const placed = siblings.filter((b) => !b.static)
  const max = owner?.max_blocks
  if (max && placed.length >= max) {
    return { ok: false, reason: `${owner!.name} holds ${max} block${max === 1 ? "" : "s"}.` }
  }
  const limit = def?.limit
  if (limit && placed.filter((b) => b.type === blockType).length >= limit) {
    return { ok: false, reason: `${owner?.name ?? "This section"} holds ${limit} ${def?.name ?? blockType}${limit === 1 ? "" : "s"}.` }
  }
  if (countAll(section.blocks) + room.size > LIMITS.blocksPerSection) {
    return { ok: false, reason: `A section holds ${LIMITS.blocksPerSection} blocks.` }
  }
  if (room.depth + room.height - 1 > MAX_BLOCK_DEPTH) {
    return { ok: false, reason: `Blocks nest ${MAX_BLOCK_DEPTH} deep at most.` }
  }
  return { ok: true }
}
