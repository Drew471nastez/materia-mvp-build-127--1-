/**
 * ===========================================================================
 *  A SECTION'S BLOCKS AS A TREE, FOR THE EDITOR AND EVERY SAVE DOOR
 * ===========================================================================
 * A section holds blocks; a theme block may hold blocks; and so on, to
 * MAX_BLOCK_DEPTH. Every change the editor, the assistant or a connected
 * agent makes to them goes through the functions here, so there is one
 * meaning of "add", "move" and "remove" whoever is asking.
 *
 * A block is found by its PATH, the ids from the section down to it,
 * written `outer/inner/block`. An id alone is not enough: a card block with
 * a static "title" inside it, used three times, has three blocks called
 * "title", one in each card. The path tells them apart; on the canvas it is
 * read from the `data-block-id` of the clicked element and of every block
 * around it.
 *
 * Every function is pure: the list comes in, a new list goes out, and the
 * one that came in is untouched, which is what lets Undo keep it.
 */
import { z } from "zod"

import { MAX_BLOCK_DEPTH, LIMITS } from "@/lib/storelib-theme/types"
import type { BlockInstance } from "./types"

export const PATH_SEPARATOR = "/"

export function pathKey(path: readonly string[]): string {
  return path.join(PATH_SEPARATOR)
}

export function parsePath(key: string | null | undefined): string[] {
  return key ? key.split(PATH_SEPARATOR).filter(Boolean) : []
}

/** The block at a path, and the list it sits in. */
export function blockAt(list: readonly BlockInstance[] | undefined, path: readonly string[]): { block: BlockInstance; siblings: readonly BlockInstance[]; depth: number } | null {
  let siblings = list ?? []
  for (let i = 0; i < path.length; i++) {
    const block = siblings.find((b) => b.id === path[i])
    if (!block) return null
    if (i === path.length - 1) return { block, siblings, depth: i + 1 }
    siblings = block.blocks ?? []
  }
  return null
}

/**
 * The path to the first block with this id, searching level by level from
 * the top: what a bare id from an older caller (the assistant, the header's
 * link editor) means.
 */
export function pathOfId(list: readonly BlockInstance[] | undefined, id: string): string[] | null {
  const walk = (items: readonly BlockInstance[], above: string[], depth: number): string[] | null => {
    if (depth > MAX_BLOCK_DEPTH) return null
    for (const b of items) if (b.id === id) return [...above, b.id]
    for (const b of items) {
      const hit = b.blocks?.length ? walk(b.blocks, [...above, b.id], depth + 1) : null
      if (hit) return hit
    }
    return null
  }
  return walk(list ?? [], [], 1)
}

/** A path, or a bare id resolved to one. */
export function resolvePath(list: readonly BlockInstance[] | undefined, key: string): string[] | null {
  const path = parsePath(key)
  if (path.length > 1) return blockAt(list, path) ? path : null
  return pathOfId(list, path[0] ?? "")
}

/** The children of the block at `parent` (the section's own blocks for an empty path) replaced by `fn`. */
export function withChildren(
  list: readonly BlockInstance[] | undefined,
  parent: readonly string[],
  fn: (children: readonly BlockInstance[]) => BlockInstance[],
): BlockInstance[] {
  const items = list ?? []
  if (parent.length === 0) return fn(items)
  const [head, ...rest] = parent
  return items.map((b) => (b.id === head ? withBlocks(b, withChildren(b.blocks, rest, fn)) : b))
}

function withBlocks(b: BlockInstance, blocks: BlockInstance[]): BlockInstance {
  if (blocks.length) return { ...b, blocks }
  const { blocks: _gone, ...rest } = b
  return rest
}

/** The block at `path`, changed by `fn`. */
export function updateAt(list: readonly BlockInstance[] | undefined, path: readonly string[], fn: (b: BlockInstance) => BlockInstance): BlockInstance[] {
  if (path.length === 0) return [...(list ?? [])]
  const parent = path.slice(0, -1)
  const id = path[path.length - 1]
  return withChildren(list, parent, (children) => children.map((b) => (b.id === id ? fn(b) : b)))
}

/**
 * The block at `path` gone, with everything inside it. Also gone: any
 * sibling whose `parent_id` setting names it, which is how the header's
 * links keep their dropdowns flat beside them.
 */
export function removeAt(list: readonly BlockInstance[] | undefined, path: readonly string[]): BlockInstance[] {
  const parent = path.slice(0, -1)
  const id = path[path.length - 1]
  return withChildren(list, parent, (children) => children.filter((b) => b.id !== id && (b.settings?.parent_id as string | undefined) !== id))
}

/** `block` placed under `parent`, at `index` or last. */
export function insertAt(list: readonly BlockInstance[] | undefined, parent: readonly string[], block: BlockInstance, index?: number): BlockInstance[] {
  return withChildren(list, parent, (children) => {
    const next = [...children]
    const at = index === undefined ? next.length : Math.max(0, Math.min(next.length, index))
    next.splice(at, 0, block)
    return next
  })
}

/** The block at `path` moved to `index` among its siblings. Static blocks stay where the template put them. */
export function moveAt(list: readonly BlockInstance[] | undefined, path: readonly string[], index: number): BlockInstance[] {
  const parent = path.slice(0, -1)
  const id = path[path.length - 1]
  return withChildren(list, parent, (children) => {
    const from = children.findIndex((b) => b.id === id)
    if (from < 0 || children[from].static) return [...children]
    const next = [...children]
    const [moved] = next.splice(from, 1)
    next.splice(Math.max(0, Math.min(next.length, index)), 0, moved)
    return next
  })
}

/**
 * A copy with new ids all the way down, so the copy and the original are
 * never the same block in two places. A static block inside keeps its id:
 * its template finds it by that id, and its parent is new, so the path is.
 */
export function cloneTree(block: BlockInstance, mint: (type: string) => string, keepId = false): BlockInstance {
  const out: BlockInstance = {
    ...block,
    id: keepId || block.static ? block.id : mint(block.type),
    settings: { ...block.settings },
  }
  if (block.blocks?.length) out.blocks = block.blocks.map((b) => cloneTree(b, mint))
  return out
}

/** Preset blocks as a new section's own: fresh ids everywhere a template does not need the old one. */
export function freshBlocks(list: readonly BlockInstance[] | undefined, mint: (type: string) => string): BlockInstance[] {
  return (list ?? []).map((b) => cloneTree(b, mint))
}

/** Every block, at every depth. */
export function countAll(list: readonly BlockInstance[] | undefined): number {
  let n = 0
  for (const b of list ?? []) n += 1 + countAll(b.blocks)
  return n
}

export function depthOf(list: readonly BlockInstance[] | undefined): number {
  if (!list?.length) return 0
  return 1 + Math.max(...list.map((b) => depthOf(b.blocks)))
}

/* ── what a save accepts ─────────────────────────────────────────────── */

type BlockShape = { id: string; type: string; settings: Record<string, unknown>; hidden?: boolean; static?: boolean; blocks?: BlockShape[] }

/**
 * ===========================================================================
 *  A BLOCK, AS EVERY SAVE DOOR READS ONE
 * ===========================================================================
 * zod drops a key it was not told about. The routes used to describe a
 * block as `{ id, type, settings }`, so the moment blocks could hold blocks,
 * saving a page would have kept the outer block and silently thrown away
 * everything inside it. One description, shared by every route that takes
 * sections, carries the whole tree: its blocks, whether it is hidden, and
 * whether its template placed it.
 *
 * MARKED PURE, so a bundle that does not use it leaves it, and zod with it,
 * out. The canvas's live layer reads this module's tree helpers, and the
 * live layer is in every published website's section renderer: a schema
 * built when the module loads put zod (about 50KB) in every visitor's
 * JavaScript for a check only the save routes make (the engine audit, S1).
 */
export const BlockInstanceSchema: z.ZodType<BlockShape> = /* @__PURE__ */ z.lazy(() =>
  z.object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(64),
    settings: z.record(z.unknown()),
    hidden: z.boolean().optional(),
    static: z.boolean().optional(),
    blocks: z.array(BlockInstanceSchema).max(LIMITS.blocksPerSection).optional(),
  }),
) as z.ZodType<BlockShape>

/** Why a section's blocks cannot be saved, or null when they can. */
export function blockTreeProblem(section: { name?: string; type: string; blocks?: readonly BlockInstance[] }): string | null {
  const total = countAll(section.blocks)
  const label = section.name || section.type
  if (total > LIMITS.blocksPerSection) return `A section holds ${LIMITS.blocksPerSection} blocks. "${label}" has ${total}.`
  if (depthOf(section.blocks) > MAX_BLOCK_DEPTH) return `Blocks nest ${MAX_BLOCK_DEPTH} deep at most. "${label}" goes deeper.`
  return null
}
