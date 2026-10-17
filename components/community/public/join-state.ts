/**
 * ===========================================================================
 *  WHAT THE ONE BUTTON DOES, FOR THIS PERSON, ON THIS COMMUNITY
 * ===========================================================================
 * The sales page has one primary button (and the same button in the phone's
 * bar). Which one it is depends on who is looking and how the community lets
 * people in, and every case is decided here, in order, so the page, the
 * route and the tests agree:
 *
 *   1. AN ACTIVE MEMBER opens the community. The owner too.
 *   2. BANNED OR REMOVED: a plain sentence, no button. Joining again is a
 *      moderator's decision, never a second press.
 *   3. A CLOSED COMMUNITY (archived, suspended, a draft) takes nobody new.
 *   4. A REQUEST ALREADY SENT says so, until an admin answers it.
 *   5. A PRIVATE COMMUNITY: nothing to press until they hold an invite; the
 *      price is said all the same, because privacy and price are two facts
 *      (lib/communities/access-model.ts). With an invite accepted, or a
 *      request approved, the ordinary free or paid way in below runs, which
 *      is what lets a private community charge.
 *   6. ACCESS BY PRODUCT: to the product that gives it.
 *   7. Otherwise the first way in: a free tier when the community has one,
 *      else the first paid tier the creator can actually sell.
 *   8. APPROVAL REQUIRED puts a request in front of it, paid tiers included:
 *      nobody is charged before an admin has said yes (an approved request
 *      is a pending row with approved_by set, and only then is checkout
 *      offered). Paid access wins once paid (FOUNDATION note 6), which is
 *      exactly why the gate sits before the payment.
 *
 * Signed out, the button is the same words and goes to sign in first, then
 * back here with ?join=1 so the press is not lost.
 *
 * Pure and browser safe; the server calls it with the rows it read.
 */
import { joinButtonLabel } from "@/lib/communities/format"
import { accessWords, inviteNote, needsInvite } from "@/lib/communities/access-model"
import type { CommunityAccess, CommunityStatus, CommunityVisibility, MemberSource, MemberStatus, Role } from "@/lib/communities/types"
import { communityPath, signInToJoinPath } from "./paths"
import type { AccessProductLink, JoinOption, JoinStateView } from "./types"

export interface JoinFacts {
  community: {
    slug: string
    status: CommunityStatus
    access: CommunityAccess
    /** Who can find it: with `access` it says whether the community is private. */
    visibility?: CommunityVisibility
    approvalRequired: boolean
    suspended: boolean
    archived: boolean
    creatorName: string | null
  }
  viewer: {
    signedIn: boolean
    active: boolean
    status: MemberStatus | null
    role: Role | null
    isOwner: boolean
    banned: boolean
    /** A pending row an admin has approved (approved_by set): may pay now. */
    approved: boolean
    /** An invite they accepted, so a private community's door is open to them. */
    invited?: boolean
    source: MemberSource | null
    /** The subscription a paying member pays with, for "Manage billing". */
    membershipId: string | null
  }
  options: JoinOption[]
  accessProducts: AccessProductLink[]
  /** The creator's payments are connected; a paid tier cannot be sold otherwise. */
  canTakePayments: boolean
}

/** The tier the button is for: a free one first where the community has one, else the first paid tier on sale. */
export function primaryOption(options: JoinOption[], access: CommunityAccess, canTakePayments: boolean): JoinOption | null {
  const free = options.find((o) => o.kind === "free")
  if (free && access !== "paid") return free
  const sellable = options.find((o) => o.kind === "paid" && o.checkout && o.priceLine && canTakePayments)
  return sellable ?? options.find((o) => o.kind === "paid") ?? free ?? null
}

export function decideJoin(f: JoinFacts): JoinStateView {
  const { community: c, viewer: v } = f
  const base = {
    signedIn: v.signedIn,
    option: null,
    href: null,
    note: null,
    isOwner: v.isOwner,
    canLeave: false,
    manageHref: null,
    role: v.active ? v.role : null,
    status: v.status,
  } satisfies Omit<JoinStateView, "kind" | "label">
  const url = communityPath(c.slug)

  if (v.active || v.isOwner) {
    const paying = v.source === "subscription" && v.membershipId
    return {
      ...base,
      kind: "open",
      label: joinButtonLabel({ isMember: true }),
      href: url,
      canLeave: !v.isOwner && v.role !== "owner",
      manageHref: paying ? `/account/library/memberships/${v.membershipId}` : null,
    }
  }
  if (v.banned || v.status === "banned" || v.status === "removed") {
    return { ...base, kind: "banned", label: "You can't join this community." }
  }
  if (c.suspended) return { ...base, kind: "closed", label: "This community isn't available right now." }
  if (c.archived || c.status === "archived") return { ...base, kind: "closed", label: "This community is closed to new members." }
  if (c.status !== "published") return { ...base, kind: "closed", label: "This community isn't open yet." }

  if (v.status === "pending" && !v.approved) {
    return { ...base, kind: "pending", label: joinButtonLabel({ isMember: false, pending: true }), note: "You'll get access once an admin approves it." }
  }

  /*
    A PRIVATE COMMUNITY, AND NOTHING TO GET IN WITH: the two facts are said
    together ("Invite only · $19/month") instead of the price being hidden
    behind the privacy, and there is still nothing to press. Somebody who
    holds an invite or an approved request falls through to the way in below.
  */
  const priced = primaryOption(f.options, c.access, f.canTakePayments)
  if (needsInvite({ access: c.access, visibility: c.visibility ?? "public" }) && !v.invited && !v.approved) {
    const price = priced?.kind === "paid" ? priced.priceLine : null
    return { ...base, kind: "invite_only", label: accessWords("private", price) ?? "Invite only", note: inviteNote(c.creatorName, price) }
  }

  if (c.access === "product") {
    const first = f.accessProducts[0]
    if (!first) return { ...base, kind: "unavailable", label: "Joining isn't open yet." }
    return {
      ...base,
      kind: "product",
      label: f.accessProducts.length === 1 ? `Get ${first.title}` : "See ways to join",
      href: f.accessProducts.length === 1 ? first.href : "#ways-to-join",
      note: f.accessProducts.length === 1 ? "Owning it gives you access." : null,
    }
  }

  const option = priced
  if (!option) return { ...base, kind: "unavailable", label: "Joining isn't open yet." }

  const signIn = v.signedIn ? null : signInToJoinPath(c.slug)

  if (c.approvalRequired && !v.approved) {
    return { ...base, kind: "request", option, label: joinButtonLabel({ isMember: false, approvalRequired: true }), href: signIn }
  }
  if (option.kind === "free") {
    return { ...base, kind: "join_free", option, label: joinButtonLabel({ isMember: false, priceLine: "Free" }), href: signIn }
  }
  if (!f.canTakePayments || !option.checkout || !option.priceLine) {
    return { ...base, kind: "unavailable", option, label: "Joining isn't open yet." }
  }
  /*
    A FREE TRIAL is said on the button (round 26) when the tier's plan gives one and this person has never had a
    membership row here (a request or an invite still waiting counts as never): somebody who was a member before
    gets no second trial at checkout, so their button says the price.
  */
  const trial = option.billing === "recurring" && (v.status === null || v.status === "pending") ? (option.trialDays ?? 0) : 0
  return {
    ...base,
    kind: "checkout",
    option,
    label: joinButtonLabel({ isMember: false, priceLine: option.priceLine, trialDays: trial }),
    href: signIn,
    note: v.approved ? "Your request was approved." : null,
  }
}
