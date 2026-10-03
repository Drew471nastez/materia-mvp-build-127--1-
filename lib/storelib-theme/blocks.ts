/**
 * ===========================================================================
 *  BLOCKS INSIDE BLOCKS, IN BOTH SHAPES
 * ===========================================================================
 * A block tree is stored two ways, and this file is the only place that
 * turns one into the other:
 *
 *   KEYED   what a template file and a preset hold, the way Shopify writes
 *           it: `{ blocks: { id: {…} }, block_order: [id, …] }`, at every
 *           level. A static block is in `blocks` and not in `block_order`.
 *
 *   LIST    what the editor holds: `[{ id, type, settings, blocks: […] }]`,
 *           in order, with static blocks marked `static: true`.
 *
 * Nothing is dropped on the way through either direction. A block of a type
 * nobody knows, a setting no schema declares, a block that is neither in the
 * order nor static: each comes out the other side, because what a person
 * made is theirs whether or not the theme still understands it.
 */
import { MAX_BLOCK_DEPTH, type BlockInstanceData, type PresetBlock } from "./types"

/** `blocks/<type>.storelib`. A leading `_` marks a private block. */
export const BLOCK_PATH = /^blocks\/(_?[a-z][a-z0-9_-]*)\.storelib$/

export function blockTypeFromPath(path: string): string | null {
  return path.match(BLOCK_PATH)?.[1] ?? null
}

export function blockSourcePath(type: string): string {
  return `blocks/${type}.storelib`
}

/** A private block is offered only where it is asked for by name. */
export function isPrivateBlock(type: string): boolean {
  return type.startsWith("_")
}

/** A block in the editor's shape. */
export interface ListBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  hidden?: boolean
  static?: boolean
  blocks?: ListBlock[]
}

/** A preset's block, read into one shape whichever way the preset spelled it. */
export interface PresetNode {
  /** The id a static block is placed under; for the rest, the key it had, if any. */
  id?: string
  type: string
  settings: Record<string, unknown>
  static?: boolean
  blocks: PresetNode[]
}

type KeyedOwner = { blocks?: PresetBlock[] | Record<string, PresetBlock>; block_order?: string[] }

/**
 * A preset's blocks as a tree: the ordered blocks first, in their order, then
 * the static ones. Either spelling reads the same.
 */
export function presetTree(owner: KeyedOwner, depth = 1): PresetNode[] {
  const blocks = owner.blocks
  if (!blocks || depth > MAX_BLOCK_DEPTH) return []
  const node = (b: PresetBlock, id?: string): PresetNode => ({
    ...(id ? { id } : {}),
    type: b.type,
    settings: { ...(b.settings ?? {}) },
    ...(b.static ? { static: true } : {}),
    blocks: presetTree(b, depth + 1),
  })
  if (Array.isArray(blocks)) return blocks.map((b) => node(b, b.id))
  const order = (owner.block_order ?? []).filter((id) => blocks[id] && !blocks[id].static)
  const rest = Object.keys(blocks).filter((id) => !order.includes(id))
  return [...order, ...rest].map((id) => node(blocks[id], id))
}

/**
 * A preset tree to the editor's list, with ids minted for every block that
 * does not need to keep its own. A static block keeps the id its template
 * places it under, because that id is how the template finds it again.
 */
export function listFromPreset(nodes: PresetNode[], mint: (type: string) => string): ListBlock[] {
  return nodes.map((n) => {
    const out: ListBlock = { id: n.static && n.id ? n.id : mint(n.type), type: n.type, settings: { ...n.settings } }
    if (n.static) out.static = true
    if (n.blocks.length) out.blocks = listFromPreset(n.blocks, mint)
    return out
  })
}

/** The editor's list → the keyed form, at every level. */
export function keyedFromList(list: readonly ListBlock[] | undefined, depth = 1): { blocks: Record<string, BlockInstanceData>; block_order: string[] } {
  const blocks: Record<string, BlockInstanceData> = {}
  const block_order: string[] = []
  if (!list || depth > MAX_BLOCK_DEPTH) return { blocks, block_order }
  for (const b of list) {
    const data: BlockInstanceData = { type: b.type, settings: b.settings }
    if (b.hidden) data.hidden = true
    if (b.static) data.static = true
    if (b.blocks?.length) {
      const inner = keyedFromList(b.blocks, depth + 1)
      data.blocks = inner.blocks
      data.block_order = inner.block_order
    }
    blocks[b.id] = data
    if (!b.static) block_order.push(b.id)
  }
  return { blocks, block_order }
}

/** The keyed form → the editor's list, at every level. Ordered blocks, then static, then any left over. */
export function listFromKeyed(owner: { blocks?: Record<string, BlockInstanceData>; block_order?: string[] }, depth = 1): ListBlock[] {
  const blocks = owner.blocks ?? {}
  if (depth > MAX_BLOCK_DEPTH) return []
  const order = (owner.block_order ?? Object.keys(blocks)).filter((id) => blocks[id])
  const seen = new Set(order)
  const statics = Object.keys(blocks).filter((id) => !seen.has(id) && blocks[id].static)
  const rest = Object.keys(blocks).filter((id) => !seen.has(id) && !blocks[id].static)
  return [...new Set([...order, ...statics, ...rest])].map((id) => {
    const b = blocks[id]
    const out: ListBlock = { id, type: String(b.type), settings: (b.settings as Record<string, unknown> | undefined) ?? {} }
    if (b.hidden) out.hidden = true
    if (b.static) out.static = true
    const children = listFromKeyed(b as { blocks?: Record<string, BlockInstanceData>; block_order?: string[] }, depth + 1)
    if (children.length) out.blocks = children
    return out
  })
}

/** Every block in a list, at every depth. */
export function countBlocks(list: readonly { blocks?: readonly unknown[] }[] | undefined): number {
  if (!list) return 0
  let n = 0
  for (const b of list) n += 1 + countBlocks(b.blocks as { blocks?: unknown[] }[] | undefined)
  return n
}

/** How deep a list nests: 1 for blocks with no children, 0 for none. */
export function blockDepth(list: readonly { blocks?: readonly unknown[] }[] | undefined): number {
  if (!list || list.length === 0) return 0
  return 1 + Math.max(...list.map((b) => blockDepth(b.blocks as { blocks?: unknown[] }[] | undefined)))
}
