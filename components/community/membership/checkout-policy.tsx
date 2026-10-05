/**
 * ===========================================================================
 *  WHAT A BUYER AGREES TO WHEN THE PRODUCT IS A COMMUNITY'S (round 13, 41/43)
 * ===========================================================================
 * The checkout of a product that sells a community tier (a membership, or a
 * one time purchase) shows the owner's refund policy, folded under one line
 * so it is there to read and never in the way, and, for a buyer in the EU,
 * the EEA or the UK (or one whose country is not known), the waiver of the
 * 14 day right of withdrawal inside the consent they tick: digital access
 * starts at once, and the law asks for that to be said and agreed to.
 *
 * Browser safe, no hooks: drawn inside app/checkout/membership-checkout.tsx
 * and app/checkout/checkout-client.tsx with what app/checkout/page.tsx read
 * on the server (lib/communities/server/membership-lifecycle checkoutTermsFor).
 */
import { WITHDRAWAL_WAIVER } from "@/lib/communities/membership-policy"

export interface CommunityCheckoutTerms {
  communityName: string
  /** The owner's own words (part 101), or null when they wrote none. */
  refundPolicy: string | null
  /** Whether the consent carries the withdrawal waiver (lib/communities/membership-policy withdrawalWaiverApplies). */
  waiver: boolean
  /** The buyer's locale, for money (Accept-Language). */
  locale: string
}

/** The sentence added to the consent, or null where the waiver does not apply. */
export function waiverSentence(terms: CommunityCheckoutTerms | null | undefined): string | null {
  return terms?.waiver ? WITHDRAWAL_WAIVER : null
}

export function CommunityRefundPolicy({ terms }: { terms: CommunityCheckoutTerms | null | undefined }) {
  if (!terms?.refundPolicy) return null
  return (
    <details data-community-refund-policy="" className="group/policy rounded-[8px] border border-black/[0.06] bg-white text-[13.5px] leading-relaxed text-[#4b5563]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 font-medium text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">Refund policy of {terms.communityName}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-150 group-open/policy:rotate-180 motion-reduce:transition-none">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className="whitespace-pre-line break-words border-t border-black/[0.06] px-3.5 py-3">{terms.refundPolicy}</p>
    </details>
  )
}
