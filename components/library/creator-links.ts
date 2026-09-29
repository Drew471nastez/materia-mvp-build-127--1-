import { memberProfilePublicPath } from "@/lib/profile/member-url"
import { getProductInternalPath, getStoreInternalPath } from "@/lib/url-helpers"
import type { LibraryCreator, LibraryItem } from "@/lib/library/library-view"

/**
 * How a buyer reaches a seller from the library, from what exists:
 *
 *   the seller's support address, when they set one: a mail to it
 *   otherwise the receipt's own contact form (app/receipt/[token], "Contact
 *   seller"), which mails the seller with the buyer's address to reply to.
 *   There is no inbox on Storelib for a message to wait in
 *   (lib/receipts/contact.ts says why), so a message is always an email.
 *
 * Addresses on our own site are paths, so the app keeps its session
 * (lib/url-helpers.ts, getStoreInternalPath).
 */
export interface ContactLink {
  href: string
  label: string
  /** The verb alone, for a place that already shows the seller's name beside it. */
  short: string
  /** A mail link, opened by the mail app rather than navigated to. */
  mail: boolean
}

export function contactOf(creator: Pick<LibraryCreator, "name" | "supportEmail" | "contactReceiptToken">, productTitle?: string): ContactLink | null {
  const first = (creator.name || "the seller").split(" ")[0]
  if (creator.supportEmail) {
    const subject = productTitle ? `?subject=${encodeURIComponent(`About ${productTitle}`)}` : ""
    return { href: `mailto:${creator.supportEmail}${subject}`, label: `Email ${first}`, short: "Email", mail: true }
  }
  if (creator.contactReceiptToken) {
    return { href: `/receipt/${encodeURIComponent(creator.contactReceiptToken)}#receipt-contact`, label: `Message ${first}`, short: "Message", mail: false }
  }
  return null
}

export function storeOf(creator: { slug: string | null }): string | null {
  return creator.slug ? getStoreInternalPath(creator.slug) : null
}

/** Public member profile (`/@handle`), not the creator storefront. */
export function memberProfileOf(creator: { slug: string | null }): string | null {
  return creator.slug ? memberProfilePublicPath(creator.slug) : null
}

/** The product's own page, while it is still on sale. */
export function productPageOf(item: Pick<LibraryItem, "productSlug" | "archived" | "creator">): string | null {
  if (!item.productSlug || item.archived) return null
  return getProductInternalPath(item.productSlug, item.creator.slug || undefined)
}
