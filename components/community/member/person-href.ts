/**
 * WHERE A PERSON'S NAME TAKES YOU, from inside a community.
 *
 * Round 15, the owner: "when I go to profile make sure it's
 * /community/<slug>?profile=..., so I don't have to reload a whole page".
 * So inside a community a name opens the person's profile IN the community,
 * the shell's `profile` place (/community/<slug>?profile=<handle>, drawn by
 * components/community/member/member-profile.tsx with no page load). Their
 * full page (the creator page for a live store, /@handle otherwise, by
 * Storelib's one rule in lib/profile/person-href.ts) is one press further,
 * from that profile's "Full profile" or "Visit page".
 *
 * Every page of people gives each of them a handle before it is drawn
 * (lib/communities/server/directory.ts), so the last case, somebody with no
 * handle yet, is rare: their link is the old /community/<slug>/members/<id>
 * address, which the shell reads as the same profile place
 * (lib/communities/client/places.ts placeFromUrl). Pure and browser safe.
 */
import { personHref } from "@/lib/profile/person-href"

export { personHref }

export interface PersonLinkFacts {
  username: string | null | undefined
  hasStorefront?: boolean | null
}

const HANDLE = /^[a-z0-9][a-z0-9_.-]*$/

/** A person seen from a community: their profile inside it (through the old member address when they have no handle yet). */
export function memberHref(slug: string, p: PersonLinkFacts & { id: string }): string {
  const handle = (p.username || "").trim().toLowerCase()
  if (!handle || !HANDLE.test(handle)) return `/community/${slug}/members/${p.id}`
  return `/community/${slug}?profile=${encodeURIComponent(handle)}`
}
