"use client"

/**
 * ===========================================================================
 *  THE MEMBERSHIP PAGE'S PARTS (round 13, worker M), for worker F2 to mount
 * ===========================================================================
 *   <MembershipSection communityId initial? locale? />  everything below, in order
 *   <CancelMembership communityId initial? locale? onChange? />  the plan and Cancel / Resume
 *   <MembershipRefundPolicy text />  the owner's refund policy, folded
 *   <ContactOwner communityId ownerName publicEmail enabled />  the form to the owner
 *
 * `initial` is lib/communities/server/membership-lifecycle
 * communityMembershipView(db, community, person) from the server, so the
 * page draws at once; without it the section asks
 * GET /api/community/<id>/membership. Owner side, in /app:
 * <CommunityPayments communityId userId? /> with its RefundDialog.
 */
import type { CommunityMembershipView } from "@/lib/communities/membership-policy"
import { CancelMembership, useMembershipView } from "./cancel-membership"
import { ContactOwner, MembershipRefundPolicy } from "./contact-owner"

export { CancelMembership, useMembershipView } from "./cancel-membership"
export { ContactOwner, MembershipRefundPolicy } from "./contact-owner"
export { CommunityPayments, PaymentsSection, RefundDialog, type CommunityPaymentView, type RefundResult } from "./refund-dialog"
export { CommunityRefundPolicy, waiverSentence, type CommunityCheckoutTerms } from "./checkout-policy"

export function MembershipSection({ communityId, initial, locale = "en-US" }: { communityId: string; initial?: CommunityMembershipView | null; locale?: string }) {
  const { view, setView } = useMembershipView(communityId, initial)
  if (!view) return <CancelMembership communityId={communityId} locale={locale} onChange={setView} />
  return (
    <div className="space-y-3" data-membership-section="">
      <CancelMembership communityId={communityId} initial={view} locale={locale} onChange={setView} />
      <MembershipRefundPolicy text={view.refundPolicy} />
      <ContactOwner communityId={communityId} ownerName={view.contact.ownerName} publicEmail={view.contact.publicEmail} enabled={view.contact.form} />
    </div>
  )
}
