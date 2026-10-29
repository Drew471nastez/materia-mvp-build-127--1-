/**
 * ===========================================================================
 *  storelib.com/<handle>/<slug> IS THAT CREATOR'S PRODUCT, OR IT GOES THERE
 * ===========================================================================
 * Round 44. The route read only the slug and threw the handle away, so:
 *
 *   storelib.com/<anybody>/<slug>   drew the product, 200, for any first
 *                                   segment that is not one of Storelib's
 *                                   own: as many copies as there are words
 *   <alice's domain>/<bob's slug>   drew Bob's product on Alice's domain
 *   alice/ebook and bob/ebook       a 404 for both: a slug is unique per
 *                                   creator, and a lookup by slug alone
 *                                   found two rows and answered none
 *
 * Now the handle names whose product it is. The decision is here, pure, so
 * tests/seo-creator-r44.test.ts drives it; the door
 * (app/(marketing)/[sellername]/[productSlug]/page.tsx) does the reads.
 *
 *   the creator's own product          the page
 *   their product under an old slug    308 to /<handle>/<current slug>
 *   a creator with no such product     404, on storelib.com and on their
 *                                      own domain alike: never somebody
 *                                      else's product under their name
 *   a handle that was renamed          308 to /<new handle>/<slug>
 *   a handle nobody has, and the slug  307 to that product's canonical
 *   is somebody's product              address (an old link; not
 *                                      permanent, the handle may be taken)
 *   nothing                            404
 */

export type ProductAddressStep =
  | { kind: "page"; owner: string }
  | { kind: "redirect"; to: string; permanent: boolean }
  | { kind: "missing" }

export interface ProductAddressFacts {
  slug: string
  /** The creator the handle in the path names, or null when nobody has it. */
  owner: { creatorId: string; handle: string } | null
  /** That creator's published product found by this slug (or a slug it had), or null. */
  found: { slug: string; viaHistory: boolean } | null
  /** The handle's new name when nobody has it and somebody changed away from it. */
  renamedTo: string | null
  /** When nobody has the handle: the canonical address of the product sold under this slug, or null. */
  elsewhere: string | null
}

/* The handle lowercase, as getProductShareUrl writes every product's canonical; the slug as it is. */
const at = (handle: string, slug: string) => `/${encodeURIComponent(handle.toLowerCase())}/${encodeURIComponent(slug)}`

export function productAddressStep(f: ProductAddressFacts): ProductAddressStep {
  if (f.owner && f.found) {
    if (f.found.viaHistory) return { kind: "redirect", to: at(f.owner.handle, f.found.slug), permanent: true }
    return { kind: "page", owner: f.owner.creatorId }
  }
  /* A creator the handle names and no such product of theirs: a 404, never somebody else's product under their name or on their domain. */
  if (f.owner) return { kind: "missing" }
  if (f.renamedTo) return { kind: "redirect", to: at(f.renamedTo, f.slug), permanent: true }
  if (f.elsewhere) return { kind: "redirect", to: f.elsewhere, permanent: false }
  return { kind: "missing" }
}
