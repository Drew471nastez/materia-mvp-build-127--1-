import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  WHAT A CREATOR CAN START: THE KINDS, AND WHERE EACH ONE OPENS
 * ===========================================================================
 * One question, asked by every New product in /app (./kind-chooser.tsx),
 * and these are its answers.
 *
 *   digital      the product editor, with its Digital Files card
 *   course       the product editor as a course: the Lessons card first,
 *                right under the title (./product-editor.tsx)
 *   physical     the product editor for a thing that ships, only while
 *                physical commerce is switched on in /admin
 *
 * NOT A PAID COMMUNITY. The owner: "people create communities from the
 * community page, not from the products page". So the question never offers
 * one. `community` stays a kind only so an old `?type=community` link still
 * lands in the community's own setup (/app/community/new) while communities
 * are switched on in /admin.
 *
 * NO MEMBERSHIP ANY MORE. The owner: "memberships are communities". A
 * creator who wants people to pay every month makes a paid community, which
 * bills through the same memberships engine, from the Community page. The
 * memberships a creator already sells keep working at their own address
 * (app/app/memberships), but nothing here makes a new one.
 *
 * The editors' addresses carry the kind (`?type=`), so each is its own page
 * the router can fetch ahead, and a reload opens the same editor again.
 * /app/products/new with no kind is the question as a page, for every link
 * that points there (an email, a notification, a bookmark).
 *
 * Pure: no React, no browser, so the page, the chooser and the tests read
 * the same list.
 */

export type ProductKind = "digital" | "course" | "physical" | "community"

/** A kind the product editor opens as. */
export type EditorKind = Exclude<ProductKind, "community">

export const NEW_PRODUCT_HREF = "/app/products/new"

/** Where a paid community is made: the community's own setup, not the product editor. */
export const NEW_COMMUNITY_HREF = "/app/community/new"

export interface KindOption {
  kind: ProductKind
  title: string
  /** One line under the name: what the buyer gets. */
  line: string
}

export const KIND_OPTIONS: readonly KindOption[] = [
  { kind: "digital", get title() { return tt("Digital product") }, get line() { return tt("Files people download: templates, presets, sample packs, ebooks.") } },
  { kind: "course", get title() { return tt("Video course") }, get line() { return tt("Lessons in order, a player, and each buyer's progress.") } },
]

/**
 * A product that ships: asked only while physical commerce is switched on
 * in /admin (lib/platform/physical-commerce.ts), after the two above, so
 * with the switch off the question is exactly what it always was.
 */
export const PHYSICAL_KIND_OPTION: KindOption = { kind: "physical", get title() { return tt("Physical product") }, get line() { return tt("Things you ship: clothing, prints, merch, gear, with stock.") } }

/** The answers to show, for the platform switch that is on. Never a paid community: that is made on the Community page. */
export function kindOptions(physical: boolean): readonly KindOption[] {
  const list: KindOption[] = [...KIND_OPTIONS]
  if (physical) list.push(PHYSICAL_KIND_OPTION)
  return list
}

/** The product editor's address for a new product of this kind. */
export function editorHref(kind: EditorKind): string {
  return `${NEW_PRODUCT_HREF}?type=${kind}`
}

/** Where a kind opens: the editor for a product, the community setup for an old `?type=community` link. */
export function kindHref(kind: ProductKind): string {
  return kind === "community" ? NEW_COMMUNITY_HREF : editorHref(kind)
}

/**
 * `?type=` as the new product page reads it. Anything else is no answer yet,
 * and that includes the old `?type=membership`: it asks the question again.
 */
export function kindFromParam(value: unknown): ProductKind | null {
  return value === "digital" || value === "course" || value === "physical" || value === "community" ? value : null
}
