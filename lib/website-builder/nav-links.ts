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
import type { MenuLink } from "@/lib/storelib-theme/values"

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
 * HOW DEEP THE HEADER GOES: a link, and the links under it. HeaderSection
 * draws a top-level link and one dropdown of its sub-links, and the phone
 * drawer opens one sub-page per top-level link; a sub-link's own sub-links
 * are drawn nowhere. So the editor offers two levels and never makes a third.
 */
export const NAV_MAX_DEPTH = 2

const isNav = (b: NavBlock) => b.type === "nav_link"
const parentOf = (b: NavBlock) => (typeof b.settings.parent_id === "string" ? b.settings.parent_id : "")

/**
 * The flat list in the order a person reads the tree: each top-level link
 * followed by its sub-links. Blocks that are not links keep their slots; the
 * links are written back into the link slots in this order. A sub-link whose
 * parent is gone (the header draws it nowhere) keeps its place after the rest.
 *
 * The header groups by `parent_id`, not by position, so this changes nothing
 * a visitor sees. It keeps the saved list readable, and it is what makes
 * "sub-links follow their parent" true after every move.
 */
export function navTreeOrder(blocks: NavBlock[]): NavBlock[] {
  const slots = blocks.map((b, i) => (isNav(b) ? i : -1)).filter((i) => i >= 0)
  const links = slots.map((i) => blocks[i])
  const ordered: NavBlock[] = []
  for (const root of links) {
    if (parentOf(root)) continue
    ordered.push(root)
    for (const kid of links) if (parentOf(kid) === root.id) ordered.push(kid)
  }
  const placed = new Set(ordered)
  for (const b of links) if (!placed.has(b)) ordered.push(b)
  if (ordered.every((b, k) => b === links[k])) return blocks
  const next = [...blocks]
  slots.forEach((slot, k) => {
    next[slot] = ordered[k]
  })
  return next
}

/**
 * Moves one link within its level of the flat block list, then puts the list
 * in tree order, so a link's sub-links follow it wherever it goes.
 */
export function moveNavBlock(blocks: NavBlock[], parentId: string | null, from: number, to: number): NavBlock[] {
  const isSibling = (b: NavBlock) => isNav(b) && (parentId ? parentOf(b) === parentId : !parentOf(b))
  const slots = blocks.map((b, i) => (isSibling(b) ? i : -1)).filter((i) => i >= 0)
  if (from === to || slots[from] === undefined || slots[to] === undefined) return blocks
  const siblings = slots.map((i) => blocks[i])
  const [moved] = siblings.splice(from, 1)
  siblings.splice(to, 0, moved)
  const next = [...blocks]
  slots.forEach((slot, k) => {
    next[slot] = siblings[k]
  })
  return navTreeOrder(next)
}

/** The top-level link right above this one, when it can take this one under it. */
export function nestTargetOf(blocks: NavBlock[], id: string): NavBlock | null {
  const roots = blocks.filter((b) => isNav(b) && !parentOf(b))
  const at = roots.findIndex((b) => b.id === id)
  if (at <= 0) return null
  /* A link with sub-links of its own would make a third level, which the header does not draw. */
  if (blocks.some((b) => isNav(b) && parentOf(b) === id)) return null
  return roots[at - 1]
}

/**
 * Into the one above: a top-level link becomes the last sub-link of the link
 * before it. One list comes back, so the editor saves it as one step of Undo.
 */
export function nestNavBlock(blocks: NavBlock[], id: string): NavBlock[] {
  const target = nestTargetOf(blocks, id)
  if (!target) return blocks
  /* In tree order this link already sits after the target's sub-links, so
     naming the parent is the whole move: tree order keeps it last among them. */
  return navTreeOrder(navTreeOrder(blocks).map((b) => (b.id === id ? { ...b, settings: { ...b.settings, parent_id: target.id } } : b)))
}

/**
 * The same two moves for a menu from Theme settings › Menus, whose links are
 * a nested list named by place: "2" goes in as the last link under "1";
 * "1/0" comes out to sit right after "1". A link with links under it does
 * not go in, which would make a third level.
 */
export function nestMenuLink(links: MenuLink[], id: string, dir: 1 | -1): MenuLink[] {
  const path = id.split("/").map(Number)
  if (dir === 1) {
    if (path.length !== 1) return links
    const i = path[0]
    const me = links[i]
    if (i <= 0 || !me || (me.links ?? []).length > 0) return links
    return links
      .map((l, k) => (k === i - 1 ? { ...l, links: [...(l.links ?? []), me] } : l))
      .filter((_, k) => k !== i)
  }
  if (path.length !== 2) return links
  const [i, j] = path
  const me = links[i]?.links?.[j]
  if (!me) return links
  const next = links.map((l, k) => (k === i ? { ...l, links: (l.links ?? []).filter((_, m) => m !== j) } : l))
  next.splice(i + 1, 0, me)
  return next
}

/**
 * Out of its parent: a sub-link becomes a top-level link, right after the
 * link it was under. Its `parent_id` is taken off, not blanked.
 */
export function unnestNavBlock(blocks: NavBlock[], id: string): NavBlock[] {
  const me = blocks.find((b) => b.id === id)
  if (!me || !parentOf(me)) return blocks
  /* Moved to the end of its parent's sub-links first, then freed: tree order
     then reads it as the top-level link that follows its old parent. */
  const ordered = navTreeOrder(blocks)
  const parent = parentOf(me)
  const slots = ordered.map((b, i) => (isNav(b) && parentOf(b) === parent ? i : -1)).filter((i) => i >= 0)
  const kids = slots.map((i) => ordered[i])
  const last = [...kids.filter((b) => b.id !== id), kids.find((b) => b.id === id) as NavBlock]
  const next = [...ordered]
  slots.forEach((slot, k) => {
    next[slot] = last[k]
  })
  const { parent_id: _gone, ...settings } = me.settings
  return navTreeOrder(next.map((b) => (b.id === id ? { ...b, settings } : b)))
}


/* ── a link dragged anywhere in the tree ──────────────────────────────── */

/**
 * A menu link (named by place, "2" or "2/0") taken out of where it is and put
 * at `index` of `parentId`'s links, or of the top level for `null`. `index`
 * is counted without the link itself, which is how the drag counts it. Two
 * levels: a link that has links of its own stays at the top, and a link
 * cannot go under itself. Anything else comes back unchanged.
 */
export function placeMenuLink(links: MenuLink[], id: string, parentId: string | null, index: number): MenuLink[] {
  const path = id.split("/").map(Number)
  if (path.some((n) => !Number.isInteger(n) || n < 0) || path.length > 2) return links
  const me = path.length === 1 ? links[path[0]] : links[path[0]]?.links?.[path[1]]
  if (!me) return links
  let parent = parentId === null ? null : Number(parentId)
  if (parent !== null && (!Number.isInteger(parent) || !links[parent] || parentId!.includes("/"))) return links
  if (parent !== null && (me.links ?? []).length > 0) return links
  if (parent !== null && path.length === 1 && parent === path[0]) return links
  /* Out of where it was. */
  let next: MenuLink[] =
    path.length === 1
      ? links.filter((_, i) => i !== path[0])
      : links.map((l, i) => (i === path[0] ? { ...l, links: (l.links ?? []).filter((_, j) => j !== path[1]) } : l))
  /* A top-level link taken out from above its new parent moves that parent up by one. */
  if (parent !== null && path.length === 1 && path[0] < parent) parent -= 1
  if (parent === null) {
    const at = Math.max(0, Math.min(index, next.length))
    next = [...next.slice(0, at), me, ...next.slice(at)]
  } else {
    const p = parent
    next = next.map((l, i) => {
      if (i !== p) return l
      const kids = [...(l.links ?? [])]
      kids.splice(Math.max(0, Math.min(index, kids.length)), 0, me)
      return { ...l, links: kids }
    })
  }
  return next
}

/**
 * The same for the header's own nav_link blocks, where a sub-link names its
 * parent in `parent_id`: the parent is set (or taken off), the link goes in
 * before the sibling now at `index`, and the list is put back in tree order.
 */
export function placeNavBlock(blocks: NavBlock[], id: string, parentId: string | null, index: number): NavBlock[] {
  const me = blocks.find((b) => b.id === id && isNav(b))
  if (!me) return blocks
  if (parentId !== null) {
    const parent = blocks.find((b) => b.id === parentId && isNav(b))
    if (!parent || parentId === id || parentOf(parent)) return blocks
    if (blocks.some((b) => isNav(b) && parentOf(b) === id)) return blocks
  }
  const ordered = navTreeOrder(blocks)
  const slots = ordered.map((b, i) => (isNav(b) ? i : -1)).filter((i) => i >= 0)
  const { parent_id: _gone, ...bare } = me.settings
  const moved: NavBlock = { ...me, settings: parentId ? { ...bare, parent_id: parentId } : bare }
  const links = slots.map((i) => ordered[i]).filter((b) => b.id !== id)
  const siblings = links.filter((b) => (parentId ? parentOf(b) === parentId : !parentOf(b)))
  const before = siblings[index]
  const at = before ? links.indexOf(before) : links.length
  links.splice(at, 0, moved)
  const next = [...ordered]
  slots.forEach((slot, k) => {
    next[slot] = links[k]
  })
  return navTreeOrder(next)
}
