/**
 * WHERE A PERSON'S NAME TAKES YOU, from inside a community: the person's own
 * page, in the same tab, by Storelib's one rule (lib/profile/person-href.ts:
 * /<handle> for a live storefront, /@handle for everybody else). There is no
 * member page inside a community. Every page of people gives each of them a
 * handle before it is drawn (lib/communities/server/directory.ts), so the
 * last case, somebody with no handle yet, is rare: their link is the old
 * /community/<slug>/members/<id> address, which now only finds their page
 * on the server (giving them a handle on the way) and sends the visitor
 * there. Pure and browser safe.
 */
import { personHref } from "@/lib/profile/person-href"

export { personHref }

export interface PersonLinkFacts {
  username: string | null | undefined
  hasStorefront?: boolean | null
}

/** A person seen from a community: their own page (through the redirect when they have no handle yet). */
export function memberHref(slug: string, p: PersonLinkFacts & { id: string }): string {
  const href = personHref({ username: p.username, hasStorefront: !!p.hasStorefront })
  return href === "/" ? `/community/${slug}/members/${p.id}` : href
}
