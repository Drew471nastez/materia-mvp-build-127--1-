/**
 * WHERE A PERSON'S NAME TAKES YOU, from inside a community: the person's own
 * page, in the same tab. Somebody who sells on Storelib has a storefront at
 * /<handle>; everybody else has a profile at /@handle. With no username yet
 * there is no page to open, so the community's own view of them is used.
 *
 * A LOCAL COPY OF THE PROFILES WORKER'S RULE (lib/profile/person-href.ts,
 * personHref) so this branch stands on its own. Same inputs, same answers;
 * on merge `personHref` here becomes a re-export of that one. Pure and
 * browser safe.
 */

export interface PersonLinkFacts {
  username: string | null | undefined
  hasStorefront?: boolean | null
}

/** "/<handle>" for a storefront, "/@handle" otherwise, "/" with no username. */
export function personHref(p: PersonLinkFacts): string {
  const handle = (p.username || "").trim().toLowerCase()
  if (!handle) return "/"
  return p.hasStorefront ? `/${handle}` : `/@${handle}`
}

/** A person seen from a community: their page, or this community's view of them when they have no username. */
export function memberHref(slug: string, p: PersonLinkFacts & { id: string }): string {
  return p.username ? personHref(p) : `/community/${slug}/members/${p.id}`
}
