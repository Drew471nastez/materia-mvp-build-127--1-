import { Baby, Dices, Disc3, LayoutGrid, Shirt } from "lucide-react"

import { Dress } from "@/components/marketplace/department-icons"
import {
  DEPARTMENTS,
  categoryShortLabel,
  departmentForGroup,
  groupsForDepartment,
} from "@/lib/marketplace/listing-taxonomy"

/**
 * ===========================================================================
 *  ONE LIST OF DEPARTMENTS, FOR EVERY PLACE THE SITE OFFERS THEM
 * ===========================================================================
 *
 * There were two taxonomies, and only one of them was real.
 *
 * `lib/marketplace/categories.ts` carries Womenswear / Menswear / Sneakers /
 * Bags & Accessories / Jewellery / Beauty / Books / Home / Vintage. It is where
 * the phone browser's menu, its category rail and the search panel all read
 * from. `lib/marketplace/listing-taxonomy.ts` carries Femei / Bărbați / Copii /
 * Divertisment / Hobbyuri și colecții, each with its own groups, and it is what
 * the SELL FORM makes people choose from — so it is the only one any listing in
 * the database has ever been filed under.
 *
 * The consequence was worse than a mismatch of words. `?category=sneakers`
 * validated, and then matched nothing, because no listing carries `sneakers`:
 * it carries `women-footwear` or `men-footwear`. So the phone's menu was ten
 * doors, every one of which opened onto an empty room, and the rail's filter
 * quietly returned the whole feed. A shopper cannot tell that apart from a
 * marketplace with nothing in it.
 *
 * This module is the taxonomy the listing form uses, shaped for navigation:
 * departments, their groups, and the hrefs that reach them. The desktop header
 * already derived exactly this — it is moved here rather than copied, so the
 * phone and the desktop cannot drift, and so a department added to the sell
 * form appears in five places without anybody remembering to visit them.
 *
 * ---------------------------------------------------------------------------
 * THE ICONS ARE PICTURES OF WHAT IS IN EACH ONE
 * ---------------------------------------------------------------------------
 * The list this replaces wore Layers / Shirt / PersonStanding / Footprints /
 * ShoppingBag / Gem / Sparkles / BookOpen / Home / Recycle — a stack of paper
 * for "All", a walking pictogram for menswear, a recycling symbol for Vintage.
 * They are what a template reaches for when nobody has decided what a row
 * means, and a shopper reads the words and skips the pictures.
 *
 * These are the departments' own contents. `Shirt` and `Dress` separate the two
 * apparel departments, which is the only pair that needs separating since both
 * sell Haine and Pantofi. `Baby` for a department that is mostly cărucioare,
 * îmbăiere and dormit. `Disc3` for Cărți / Reviste / Muzică / Video, because a
 * record is the object that reads as "media somebody already owned". `Dices`
 * for trading cards, board games, puzzles and miniatures. `Dress` is drawn
 * rather than imported — see components/marketplace/department-icons.tsx.
 */

/** A lucide glyph or one of ours. `typeof LayoutGrid` is lucide's own
 *  forwardRef type and therefore excludes every icon we draw for ourselves. */
export type DeptIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>

export const DEPARTMENT_ICONS: Record<string, DeptIcon> = {
  women: Dress,
  men: Shirt,
  kids: Baby,
  entertainment: Disc3,
  hobby: Dices,
}

export type DepartmentNavItem = {
  id: string
  label: string
  href: string
  icon: DeptIcon
  subcategories: { id: string; label: string; href: string }[]
}

/**
 * The five departments, each drilling into its own groups.
 *
 * The groups come from `groupsForDepartment`, so Femei opens Haine / Pantofi /
 * Genți / Accesorii / Frumusețe — the exact list the sell form offers under
 * Femei — and `categoryShortLabel` takes the department off the front, so a
 * submenu under a heading that already says Femei reads "Haine" rather than
 * "Femei · Haine".
 *
 * THEY POINT AT `/shop`, which is a page rather than the home page wearing a
 * filter: a trail, a title, a count, a filter bar and a page number. See
 * app/(marketing)/shop/[[...path]]/page.tsx, and `categoryPath` below for why a
 * path rather than a query string.
 */
export const DEPARTMENT_NAV: DepartmentNavItem[] = DEPARTMENTS.map((d) => ({
  id: d.id,
  label: d.label,
  href: `/shop/${d.id}`,
  icon: DEPARTMENT_ICONS[d.id] ?? LayoutGrid,
  subcategories: groupsForDepartment(d.id).map((g) => ({
    id: g.id,
    label: categoryShortLabel(g),
    href: `/shop/${d.id}/${groupSlug(g.id)}`,
  })),
}))

/**
 * The same five with "Toate" in front, for the rails that FILTER rather than
 * navigate. "all" is not a department and has no groups; it is the absence of a
 * filter, which is why it is added here rather than living in the taxonomy.
 */
export const DEPARTMENT_RAIL: { id: string; label: string; icon: DeptIcon }[] = [
  { id: "all", label: "Toate", icon: LayoutGrid },
  ...DEPARTMENTS.map((d) => ({
    id: d.id,
    label: d.label,
    icon: DEPARTMENT_ICONS[d.id] ?? LayoutGrid,
  })),
]

/**
 * Does this listing belong to that department?
 *
 * The rails filter an array the client already has, and they used
 * `normalizeCategoryToId(p.category) === cat` — a function that maps the OLD
 * taxonomy's display names onto the OLD taxonomy's ids. Handed `women-footwear`
 * it recognises nothing and answers "all", so every pill matched everything and
 * the rail looked like it worked while doing nothing at all.
 *
 * A listing's `category` is a group id, and a group belongs to exactly one
 * department. That is the whole test, and it is the same one the server runs
 * when the department arrives in the URL instead.
 */
export function listingInDepartment(category: string | null | undefined, departmentId: string): boolean {
  if (departmentId === "all") return true
  return departmentForGroup(category) === departmentId
}

/**
 * ===========================================================================
 *  THE URLS THE RESULTS PAGE LIVES AT
 * ===========================================================================
 *
 * `/shop/women/shoes` rather than `/?category=women&sub=women-shoes`.
 *
 * `/shop` rather than the shorter `/c`, because `/c/[slug]` is already a
 * creator shortlink that redirects to `/u/<username>` — and in the App Router a
 * `[slug]` segment beats a `[[...path]]` one at the same level, so every
 * department would have been looked up as a seller and 404ed. A prefix that is
 * already somebody else's is not a prefix.
 *
 * A query string is right for a state the page can be in; a PATH is right for
 * a place. Femei · Încălțăminte is a place: it has a title, a trail, its own
 * results and its own page number, it is worth linking to, and search engines
 * should be able to tell it apart from the home page carrying a filter. The
 * query string stays for what genuinely is state — the brand, the size, the
 * sort, the page.
 *
 * THE SLUG IS THE GROUP ID WITH ITS PREFIX REMOVED, and the prefix is taken off
 * by position rather than by name. Group ids are `women-shoes`, `men-grooming`,
 * `ent-books` — and that last one is why: the prefix of a group in the
 * `entertainment` department is `ent`, so stripping "the department id and a
 * dash" would silently leave `ent-books` alone and produce
 * `/c/entertainment/ent-books` for four of the thirty-seven. Everything before
 * the FIRST dash is the prefix, whatever it happens to be.
 *
 * The slugs are unique within their department — checked across all five — so a
 * path resolves to exactly one group or to nothing at all.
 */
export function groupSlug(groupId: string): string {
  const dash = groupId.indexOf("-")
  return dash === -1 ? groupId : groupId.slice(dash + 1)
}

export function categoryPath(departmentId?: string | null, groupId?: string | null): string {
  if (!departmentId) return "/shop"
  if (!groupId) return `/shop/${departmentId}`
  return `/shop/${departmentId}/${groupSlug(groupId)}`
}

/**
 * A path back into ids, validated rather than trusted.
 *
 * Anything unrecognised resolves to nulls instead of throwing, so a hand-typed
 * or stale URL lands on the unfiltered results page rather than on a 404 — a
 * marketplace whose old links 404 loses the visitor, while one that widens the
 * filter keeps them.
 */
export function resolveCategoryPath(segments: string[] | undefined): {
  department: string | null
  group: string | null
} {
  const [rawDept, rawGroup] = (segments ?? []).map((s) => (s || "").toLowerCase())
  const department = DEPARTMENTS.some((d) => d.id === rawDept) ? rawDept : null
  if (!department || !rawGroup) return { department, group: null }
  const group = groupsForDepartment(department).find((g) => groupSlug(g.id) === rawGroup)
  return { department, group: group?.id ?? null }
}
