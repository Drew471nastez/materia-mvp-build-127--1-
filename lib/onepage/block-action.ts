/**
 * A block's destination, from its action (lib/forms/actions).
 *
 * A block keeps what it does as `data.action`; the field its renderer has
 * always drawn as the link's address (`url` on a link, `link_url` on an
 * image or text block) is filled from that action here, once, for the
 * editor's preview and the published page alike. A block with no action
 * keeps the address it was saved with, so old pages open what they always
 * opened.
 *
 * A block type that gains an action editor adds its address field to
 * ACTION_FIELD and nothing else changes.
 */
import { actionHref, normaliseAction, type ActionVars, type NativeAction } from "@/lib/forms/actions"

/** Where each block type draws its destination. */
export const ACTION_FIELD: Readonly<Record<string, string>> = {
  link_button: "url",
  image: "link_url",
  text: "link_url",
}

type BlockLike = { type?: string; data?: unknown }

/** What the action's message can be filled with on this block: the product it names, and the block's own title as the service. */
export function blockActionVars(block: BlockLike, action: NativeAction | null): ActionVars {
  const d = (block.data || {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return {
    product_name: str((action as { title?: unknown } | null)?.title) || str(d.product_title),
    service: str(d.service) || str(d.label) || str(d.title),
  }
}

/** The block with its address filled from its action, and the action itself (null when it has none that works). */
export function withBlockAction<T extends BlockLike>(block: T): { block: T; action: NativeAction | null } {
  const raw = (block?.data as { action?: unknown } | undefined)?.action
  if (!raw) return { block, action: null }
  const action = normaliseAction(raw)
  const field = ACTION_FIELD[block.type || ""]
  if (!field) return { block, action }
  const href = action ? actionHref(action, blockActionVars(block, action)) || "" : ""
  return { block: { ...block, data: { ...(block.data as object), [field]: href } }, action }
}

/**
 * Every block's address filled from its action, groups included, before the
 * page decides what is shown: a link whose address comes from its action is
 * a link with an address (lib/onepage/extra-blocks isBlockShown).
 */
export function withBlockActions<T extends BlockLike>(blocks: readonly T[] | null | undefined): T[] {
  return (blocks || []).map((b) => {
    const { block } = withBlockAction(b)
    const children = (block.data as { children?: unknown } | undefined)?.children
    return Array.isArray(children) ? ({ ...block, data: { ...(block.data as object), children: withBlockActions(children as BlockLike[]) } } as T) : block
  })
}
