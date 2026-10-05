/**
 * ===========================================================================
 *  PRIVACY AND PRICE ARE TWO FACTS, NOT ONE SWITCH
 * ===========================================================================
 * A community has two independent dimensions, and for a long time this
 * codebase had them in one column:
 *
 *   PRIVACY   who can find it and who may enter: public, unlisted, private.
 *   PRICE     what joining costs: free, or a paid tier.
 *
 *   `access: "invite_only"` meant both at once ("private AND free"), which is
 *   why a private community could never charge: lib/communities/server/join.ts
 *   refused every join on it. The two columns that exist are enough to hold
 *   both facts, so no new column and no new word in the enum are needed:
 *
 *     public  free   access free         visibility public
 *     public  paid   access paid         visibility public
 *     private free   access invite_only  visibility private
 *     private paid   access paid         visibility private
 *     unlisted …     the same, visibility unlisted
 *
 * Read it with privacyOf and joinCosts rather than comparing `access` to a
 * word, and write it with accessColumnsFor. A community stored as
 * invite_only reads back as private and free, exactly as before, so every
 * community that exists keeps behaving as it does until its owner sets a
 * price.
 *
 * A PRIVATE COMMUNITY NEEDS AN INVITE. needsInvite is the one rule the join
 * path applies: no valid invite (or an approved request), no entry, whatever
 * the price. When there is a price, the invite is the approval and the
 * payment is still theirs to make.
 *
 * Pure and browser safe: no server import, so the editor and the sales page
 * both use it.
 */
import { COMMUNITY_ACCESS, COMMUNITY_VISIBILITIES, isOneOf, type CommunityAccess, type CommunityVisibility } from "./types"

/* ── The two dimensions ─────────────────────────────────────────────────── */

/** Who can find a community and who may enter it. */
export const COMMUNITY_PRIVACY = ["public", "unlisted", "private"] as const
export type CommunityPrivacy = (typeof COMMUNITY_PRIVACY)[number]

/** What joining costs. */
export const COMMUNITY_PRICING = ["free", "paid"] as const
export type CommunityPricing = (typeof COMMUNITY_PRICING)[number]

/** The two columns that hold both facts (communities.access, communities.visibility). */
export interface AccessColumns {
  access: CommunityAccess
  visibility: CommunityVisibility
}

export const isPrivacy = (v: unknown): v is CommunityPrivacy => isOneOf(COMMUNITY_PRIVACY, v)
export const isPricing = (v: unknown): v is CommunityPricing => isOneOf(COMMUNITY_PRICING, v)

/** Whether a stored row's two columns are words the database allows. */
export function isAccessColumns(v: unknown): v is AccessColumns {
  const r = (v ?? {}) as Record<string, unknown>
  return isOneOf(COMMUNITY_ACCESS, r.access) && isOneOf(COMMUNITY_VISIBILITIES, r.visibility)
}

/* ── Reading the stored row ─────────────────────────────────────────────── */

/**
 * The privacy of a stored community. `invite_only` has always meant private,
 * and `visibility: "private"` says it outright, so either one is private.
 */
export function privacyOf(c: AccessColumns): CommunityPrivacy {
  if (c.access === "invite_only" || c.visibility === "private") return "private"
  if (c.visibility === "unlisted") return "unlisted"
  return "public"
}

/**
 * Whether joining costs money. `paid` is a tier sold through checkout;
 * `product` and `custom` are the creator's own ways in, priced on the
 * product, so they are not a membership price here.
 */
export function joinCosts(c: AccessColumns): boolean {
  return c.access === "paid"
}

/** The pricing of a stored community, as the editor's second choice. */
export function pricingOf(c: AccessColumns): CommunityPricing {
  return joinCosts(c) ? "paid" : "free"
}

/** A private community lets nobody in without an invite link or an approved request. */
export function needsInvite(c: AccessColumns): boolean {
  return privacyOf(c) === "private"
}

/**
 * Whether this person's row already carries a way through a private
 * community's door: an invite they accepted (invite_id), or a request an
 * admin approved (approved_by). The row may still be pending, because for a
 * paid tier the invite is the approval and the payment comes next.
 */
export function invitedIn(member: { invite_id?: string | null; approved_by?: string | null } | null | undefined): boolean {
  if (!member) return false
  return Boolean(member.invite_id) || Boolean(member.approved_by)
}

/** Whether a community is listed in Explore and indexed: public only, as before. */
export function listedPublicly(c: AccessColumns): boolean {
  return privacyOf(c) === "public"
}

/* ── Writing it back ───────────────────────────────────────────────────── */

/** The two columns to store for a privacy and a price. */
export function accessColumnsFor(privacy: CommunityPrivacy, pricing: CommunityPricing): AccessColumns {
  const visibility: CommunityVisibility = privacy === "private" ? "private" : privacy === "unlisted" ? "unlisted" : "public"
  if (pricing === "paid") return { access: "paid", visibility }
  return { access: privacy === "private" ? "invite_only" : "free", visibility }
}

/* ── The words the screens show ─────────────────────────────────────────── */

const PRIVACY_TITLE: Record<CommunityPrivacy, string> = {
  public: "Anyone can join",
  unlisted: "Only people with the link",
  private: "Invite only",
}

/** The heading of the privacy choice, for the editor's card. */
export function privacyTitle(privacy: CommunityPrivacy): string {
  return PRIVACY_TITLE[privacy]
}

/**
 * The one line under the editor's card: who can get in, and what it costs,
 * as one sentence. `priceLine` is the tier's price as the rest of the
 * product writes it ("$19/month"), or null while there is none.
 */
export function accessSummary(privacy: CommunityPrivacy, pricing: CommunityPricing, priceLine: string | null): string {
  const price = pricing === "paid" ? priceLine : null
  const costs = pricing === "paid" ? (price ? `it costs ${price}` : "it costs what your paid tier says") : "it is free"
  if (privacy === "private") return `Only people with your link can join, and ${costs}.`
  if (privacy === "unlisted") return `It stays out of Explore, people with the link can join, and ${costs}.`
  return `Anyone can find it and join, and ${costs}.`
}

/**
 * The price a card or a share picture says, with the privacy in front of it
 * so the two facts read as two facts: "Invite only · $19/month". A private
 * community with no price keeps the two words it has today.
 */
export function accessWords(privacy: CommunityPrivacy, priceLine: string | null): string | null {
  if (privacy !== "private") return priceLine
  return priceLine && priceLine !== "Free" ? `Invite only · ${priceLine}` : "Invite only"
}

/** What an invited person is told on the join screen, before they press. */
export function inviteNote(creatorName: string | null, priceLine: string | null): string {
  const who = creatorName ? `Ask ${creatorName} for an invite link.` : "Ask the creator for an invite link."
  return priceLine && priceLine !== "Free" ? `${who} Joining costs ${priceLine}.` : who
}
