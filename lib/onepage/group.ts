/**
 * ===========================================================================
 *  A GROUP AND WHAT GOES IN IT, IN ONE PLACE
 * ===========================================================================
 * A Group block holds other blocks (data.children), drawn one under another
 * (stack) or sliding sideways (carousel) on the live page and in the
 * preview. The owner: "Make sure groups work." What did not:
 *
 *   WHAT MAY GO IN   the Add sheet let links and images in, a card dragged
 *                    onto a group let anything in but a header, a group or
 *                    the social row, and the sheet's own note said "Only links
 *                    and images". A product block is drawn inside a group
 *                    (its quiet look) and its editor already knew how to
 *                    leave one (lib/onepage/product-block removePlanFor), so
 *                    links, images and products may go in, by either way.
 *   ONE STEP         moving a block in or out was two edits (add it to the
 *                    group, then take it off the page), so one Undo left it
 *                    in both places at once, with one id twice. It is one
 *                    edit now (moveIntoGroup, moveOutOfGroup), one Undo.
 *   WHAT IS DRAWN    a block switched off inside a group was hidden in the
 *                    stack but the carousel read `enabled` its own way, and
 *                    a link with no address or an empty image was drawn
 *                    inside a group where the page leaves it out anywhere
 *                    else. Children are read by the page's one rule now
 *                    (lib/onepage/extra-blocks isBlockShown).
 */
import type { GroupBlockData, OnePageBlock, OnePageBlockType } from "@/lib/onepage/types"

/** The blocks a group can hold. */
export const GROUP_CHILD_TYPES: readonly OnePageBlockType[] = ["link_button", "image", "product"]

export function canGoInGroup(type: unknown): boolean {
  return typeof type === "string" && (GROUP_CHILD_TYPES as readonly string[]).includes(type)
}

const renumber = (blocks: OnePageBlock[]): OnePageBlock[] => blocks.map((b, i) => (b.sort_order === i ? b : { ...b, sort_order: i }))

/** The page's list with `id` taken off it and put at the end of the group, or null when that cannot be done. */
export function moveIntoGroup(blocks: OnePageBlock[], id: string, groupId: string): OnePageBlock[] | null {
  const moving = blocks.find((b) => b.id === id)
  const group = blocks.find((b) => b.id === groupId)
  if (!moving || !group || group.type !== "group" || id === groupId || !canGoInGroup(moving.type)) return null
  const data = group.data as GroupBlockData
  const children = data.children || []
  if (children.some((c) => c.id === id)) return null
  const nextGroup: OnePageBlock = { ...group, data: { ...data, children: [...children, { ...moving, sort_order: children.length }] } }
  return renumber(blocks.filter((b) => b.id !== id).map((b) => (b.id === groupId ? nextGroup : b)))
}

/** The page's list with a group's child taken out and put right under the group, or null when it is not there. */
export function moveOutOfGroup(blocks: OnePageBlock[], groupId: string, childId: string): OnePageBlock[] | null {
  const at = blocks.findIndex((b) => b.id === groupId)
  const group = blocks[at]
  if (!group || group.type !== "group") return null
  const data = group.data as GroupBlockData
  const child = (data.children || []).find((c) => c.id === childId)
  if (!child) return null
  const children = (data.children || []).filter((c) => c.id !== childId).map((c, i) => (c.sort_order === i ? c : { ...c, sort_order: i }))
  const next = [...blocks]
  next[at] = { ...group, data: { ...data, children } }
  next.splice(at + 1, 0, { ...child })
  return renumber(next)
}

/** Where a block is: on the page, or inside one of its groups. */
export function findBlockDeep(blocks: OnePageBlock[] | null | undefined, id: string | null | undefined): { block: OnePageBlock; groupId: string | null } | null {
  if (!blocks || !id) return null
  for (const b of blocks) {
    if (b.id === id) return { block: b, groupId: null }
  }
  for (const b of blocks) {
    if (b.type !== "group") continue
    const child = ((b.data as GroupBlockData).children || []).find((c) => c.id === id)
    if (child) return { block: child, groupId: b.id }
  }
  return null
}

/**
 * The change to make for an edit to a block wherever it is: the block's own
 * update when it is on the page, or its group's children with it changed.
 * The image library and the thumbnail picker looked the block up on the page
 * only, so a picture chosen for a link inside a group went nowhere.
 */
export function updatePlanDeep(
  blocks: OnePageBlock[] | null | undefined,
  id: string,
  updates: Partial<OnePageBlock>,
): { id: string; updates: Partial<OnePageBlock> } | null {
  const found = findBlockDeep(blocks, id)
  if (!found) return null
  if (!found.groupId) return { id, updates }
  const group = (blocks || []).find((b) => b.id === found.groupId)!
  const data = group.data as GroupBlockData
  const children = (data.children || []).map((c) => (c.id === id ? { ...c, ...updates } : c))
  return { id: group.id, updates: { data: { ...data, children } } }
}
