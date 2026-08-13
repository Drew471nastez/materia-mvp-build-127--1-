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
 * `?sub=` is a GROUP id, which is what a listing's `category` column actually
 * holds. That is what makes these links resolve to listings rather than to an
 * empty feed — see the validation in app/(marketing)/_explore-feed.tsx.
 */
export const DEPARTMENT_NAV: DepartmentNavItem[] = DEPARTMENTS.map((d) => ({
  id: d.id,
  label: d.label,
  href: `/?category=${d.id}`,
  icon: DEPARTMENT_ICONS[d.id] ?? LayoutGrid,
  subcategories: groupsForDepartment(d.id).map((g) => ({
    id: g.id,
    label: categoryShortLabel(g),
    href: `/?category=${d.id}&sub=${g.id}`,
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
