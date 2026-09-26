/**
 * ===========================================================================
 *  LINK LISTS, WITHOUT THE REACT
 * ===========================================================================
 * The pure half of the sidebar's link list editor
 * (components/website-builder/editor/controls/link-list-editor.tsx): how a
 * row says where it goes, and how the header's flat nav_link blocks, where a
 * sub-link names its parent in `parent_id`, become a tree and are reordered.
 */
import type { LinkTarget } from "@/components/website-builder/link-picker"
import { linkKind } from "@/lib/website-builder/link-address"

export interface LinkItem {
  id: string
  label: string
  url: string
  children?: LinkItem[]
}

/** The text a new link starts with, selected on focus so typing replaces it. */
export const NEW_LINK_LABEL = "New link"

/** Where a link goes, in a few words: "Shop", "Home", "instagram.com". */
export function describeLink(url: string, targets: LinkTarget[] = []): string {
  const v = (url ?? "").trim()
  if (!v || v === "#") return "No link yet"
  const known = targets.find((t) => t.href === v)
  if (known) return known.label
  if (v === "/") return "Home"
  const kind = linkKind(v)
  if (kind === "web") {
    try {
      return new URL(v.startsWith("//") ? `https:${v}` : v).hostname.replace(/^www\./, "")
    } catch {
      return v
    }
  }
  if (kind === "email") return v.replace(/^mailto:/i, "").split("?")[0]
  if (kind === "phone") return v.replace(/^tel:/i, "")
  return v
}

/* ── the header's links: flat blocks, a sub-link names its parent ─────── */

export interface NavBlock {
  id: string
  type: string
  settings: Record<string, unknown>
}

const text = (v: unknown) => (typeof v === "string" ? v : "")

/** A header link's address, by the rules the header draws it with. */
export function navBlockHref(s: Record<string, unknown>): string {
  const type = text(s.link_type).trim() || "custom"
  const target = text(s.target_id).trim()
  if (type === "product" && target) return `/products/${target}`
  if (type === "page" && target) return `/${target}`
  if ((type === "blog" || type === "blog_post") && target) return `/blog/${target}`
  return text(s.url)
}

/** The header's nav_link blocks as a tree: roots in order, each with its sub-links. */
export function navBlocksToItems(blocks: NavBlock[]): LinkItem[] {
  const links = blocks.filter((b) => b.type === "nav_link")
  const item = (b: NavBlock): LinkItem => ({ id: b.id, label: text(b.settings.label), url: navBlockHref(b.settings) })
  return links
    .filter((b) => !b.settings.parent_id)
    .map((b) => ({ ...item(b), children: links.filter((c) => c.settings.parent_id === b.id).map(item) }))
}

/**
 * Moves one link within its level of the flat block list. The other blocks
 * keep their places: the moved one takes the slot of the sibling it lands on.
 */
export function moveNavBlock(blocks: NavBlock[], parentId: string | null, from: number, to: number): NavBlock[] {
  const isSibling = (b: NavBlock) => b.type === "nav_link" && (parentId ? b.settings.parent_id === parentId : !b.settings.parent_id)
  const slots = blocks.map((b, i) => (isSibling(b) ? i : -1)).filter((i) => i >= 0)
  if (from === to || slots[from] === undefined || slots[to] === undefined) return blocks
  const siblings = slots.map((i) => blocks[i])
  const [moved] = siblings.splice(from, 1)
  siblings.splice(to, 0, moved)
  const next = [...blocks]
  slots.forEach((slot, k) => {
    next[slot] = siblings[k]
  })
  return next
}

