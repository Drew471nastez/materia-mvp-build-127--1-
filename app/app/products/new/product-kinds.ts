/**
 * ===========================================================================
 *  WHAT A CREATOR CAN START: THE THREE KINDS, AND WHERE EACH ONE OPENS
 * ===========================================================================
 * "Add some questions before starting to add a new product: is it a
 * membership, a digital product, or a video course." One question, asked by
 * every New product in /app (./kind-chooser.tsx), and these are its answers.
 *
 *   digital      the product editor, with its Digital Files card
 *   course       the product editor as a course: the Lessons card first,
 *                right under the title (./product-editor.tsx)
 *   membership   the membership screen (app/app/memberships/[id]), on a
 *                draft made when it is picked, because that screen is one
 *                membership's and needs its id
 *
 * The editors' addresses carry the kind (`?type=`), so each is its own page
 * the router can fetch ahead, and a reload opens the same editor again.
 * /app/products/new with no kind is the question as a page, for every link
 * that points there (an email, a notification, a bookmark).
 *
 * Pure: no React, no browser, so the page, the chooser and the tests read
 * the same list.
 */

export type ProductKind = "digital" | "course" | "membership" | "physical"

/** A kind the product editor opens as. */
export type EditorKind = Exclude<ProductKind, "membership">

export const NEW_PRODUCT_HREF = "/app/products/new"

export interface KindOption {
  kind: ProductKind
  title: string
  /** One line under the name: what the buyer gets. */
  line: string
}

export const KIND_OPTIONS: readonly KindOption[] = [
  { kind: "digital", title: "Digital product", line: "Files people download: templates, presets, sample packs, ebooks." },
  { kind: "course", title: "Video course", line: "Lessons in order, a player, and each buyer's progress." },
  { kind: "membership", title: "Membership", line: "Monthly or yearly. Members get your updates and files." },
]

/**
 * A product that ships: asked only while physical commerce is switched on
 * in /admin (lib/platform/physical-commerce.ts), after the three above, so
 * with the switch off the question is exactly what it always was.
 */
export const PHYSICAL_KIND_OPTION: KindOption = { kind: "physical", title: "Physical product", line: "Things you ship: clothing, prints, merch, gear, with stock." }

/** The answers to show: the three, and a physical product while the switch is on. */
export function kindOptions(physical: boolean): readonly KindOption[] {
  return physical ? [...KIND_OPTIONS, PHYSICAL_KIND_OPTION] : KIND_OPTIONS
}

/** The product editor's address for a new product of this kind. */
export function editorHref(kind: EditorKind): string {
  return `${NEW_PRODUCT_HREF}?type=${kind}`
}

/** A new membership's screen, once its draft is made: it opens on Settings, where the price is set. */
export function membershipHref(productId: string): string {
  return `/app/memberships/${encodeURIComponent(productId)}?tab=settings&new=1`
}

/** `?type=` as the new product page reads it. Anything else is no answer yet. */
export function kindFromParam(value: unknown): ProductKind | null {
  return value === "digital" || value === "course" || value === "membership" || value === "physical" ? value : null
}
