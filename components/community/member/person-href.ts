/**
 * WHERE A PERSON'S NAME TAKES YOU, from inside a community: the person's own
 * page, in the same tab, by Storelib's one rule (lib/profile/person-href.ts:
 * /<handle> for a live storefront, /@handle for everybody else). With no
 * username there is no page to open, so the community's own view of them is
 * used instead. Pure and browser safe.
 */
import { personHref } from "@/lib/profile/person-href"

export { personHref }

export interface PersonLinkFacts {
  username: string | null | undefined
  hasStorefront?: boolean | null
}

/** A person seen from a community: their page, or this community's view of them when they have no username. */
export function memberHref(slug: string, p: PersonLinkFacts & { id: string }): string {
  const href = personHref({ username: p.username, hasStorefront: !!p.hasStorefront })
  return href === "/" ? `/community/${slug}/members/${p.id}` : href
}
