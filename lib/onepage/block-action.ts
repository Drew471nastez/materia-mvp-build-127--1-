/**
 * A block's destinations, from its actions (lib/forms/actions).
 *
 * A block keeps what a press does as an action; the field its renderer has
 * always drawn as the address (`url` on a link, `link_url` on a picture,
 * `after_signup_url` on an email signup, `calendly_url` on a booking block)
 * is filled from that action here, once, for the editor's preview and the
 * published page alike. A block with no action keeps the address it was
 * saved with, so old pages open what they always opened.
 *
 * Link cards (every presentation of a link, lib/onepage/block-presentation)
 * are link blocks, so they follow the link's action.
 *
 * A block type that gains an action editor adds a row to ACTION_FIELD.
 */
import { actionHref, normaliseAction, type ActionVars, type NativeAction } from "@/lib/forms/actions"

/** Per block type: which action key fills which address field. The first is the block's own action (the one a press on the whole block uses). */
export const ACTION_FIELD: Readonly<Record<string, readonly (readonly [actionKey: string, field: string])[]>> = {
  link_button: [["action", "url"]],
  image: [["action", "link_url"]],
  email_capture: [["after_action", "after_signup_url"]],
  calendly: [["action", "calendly_url"]],
}

type BlockLike = { type?: string; data?: unknown }

/** What the action's message can be filled with on this block: the product it names, and the block's own title as the service. */
export function blockActionVars(block: BlockLike, action: NativeAction | null): ActionVars {
  const d = (block.data || {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return {
    product_name: str((action as { title?: unknown } | null)?.title) || str(d.product_title),
    /* The service the creator typed on the action first, then the block's own words. */
    service: str((action as { service?: unknown } | null)?.service) || str(d.service) || str(d.label) || str(d.title) || str(d.headline),
  }
}

const hrefOf = (raw: unknown, block: BlockLike): string => {
  const action = normaliseAction(raw)
  return action ? actionHref(action, blockActionVars(block, action)) || "" : ""
}

/**
 * The block with its addresses filled from its actions, and the block's own
 * action (null when it has none that works). A picture block's pictures each
 * carry their own action, which fills that picture's link.
 */
export function withBlockAction<T extends BlockLike>(block: T): { block: T; action: NativeAction | null } {
  const data = (block?.data || {}) as Record<string, unknown>
  const rows = ACTION_FIELD[block?.type || ""] || [["action", ""] as const]
  let next: Record<string, unknown> | null = null
  for (const [key, field] of rows) {
    if (!data[key] || !field) continue
    next = { ...(next || data), [field]: hrefOf(data[key], block) }
  }
  if (block?.type === "image" && Array.isArray(data.images) && data.images.some((i) => i && (i as { action?: unknown }).action)) {
    next = {
      ...(next || data),
      images: (data.images as Record<string, unknown>[]).map((i) => (i && i.action ? { ...i, link_url: hrefOf(i.action, block) || null } : i)),
    }
  }
  const own = rows[0]?.[0] === "action" && data.action ? normaliseAction(data.action) : null
  return { block: next ? ({ ...block, data: next } as T) : block, action: own }
}

/**
 * Every block's addresses filled from its actions, groups included, before
 * the page decides what is shown: a link whose address comes from its action
 * is a link with an address (lib/onepage/extra-blocks isBlockShown).
 */
export function withBlockActions<T extends BlockLike>(blocks: readonly T[] | null | undefined): T[] {
  return (blocks || []).map((b) => {
    const { block } = withBlockAction(b)
    const children = (block.data as { children?: unknown } | undefined)?.children
    return Array.isArray(children) ? ({ ...block, data: { ...(block.data as object), children: withBlockActions(children as BlockLike[]) } } as T) : block
  })
}
