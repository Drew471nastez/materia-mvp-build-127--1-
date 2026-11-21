/*
  THE REFUND POLICY, written once. Drawn by the page at /refund-policy and by
  the sheet a OnePage opens from its footer (components/onepage/onepage-legal-links).
  Colours are read from --legal-* variables, as in ./terms-body.

  It says what the product does today: refunds are made by the creator from
  Orders (app/api/stripe/refund) or by Storelib on their behalf
  (app/api/admin/orders/refund), always with the creator's share reversed and
  Storelib's fee kept; a full refund closes access (lib/stripe/refund-sync);
  physical orders are cancelled or returned from the buyer's order page
  (lib/physical/buyer-cancel, commerce_returns); the EU withdrawal waiver is
  asked only at a community membership's checkout
  (lib/communities/membership-policy). A draft for review by counsel.
*/
import { LINK, Section, SubSection, Ul } from "./legal-parts"
import { MEMBERSHIP_GRACE_DAYS, MEMBERSHIP_WAIVER_WORDS } from "@/lib/legal/figures"

export const REFUND_TOC = [
  { id: "s1", label: "1. What this policy covers" },
  { id: "s2", label: "2. Storelib plans" },
  { id: "s3", label: "3. Purchases from creators" },
  { id: "s4", label: "4. How a refund works" },
  { id: "s5", label: "5. Downloads and courses" },
  { id: "s6", label: "6. Memberships, communities and events" },
  { id: "s7", label: "7. Products that ship" },
  { id: "s8", label: "8. Tips, bookings and services" },
  { id: "s9", label: "9. EU and UK right of withdrawal" },
  { id: "s10", label: "10. Chargebacks and disputes" },
  { id: "s11", label: "11. When Storelib steps in" },
  { id: "s12", label: "12. Contact" },
]

export function RefundBody() {
  return (
    <>
      <Section id="s1" title="1. What this policy covers">
        <p>
          This policy explains refunds on Storelib: for the plans creators buy from Storelib, and for everything buyers
          buy from creators through Storelib. It is part of our <a href="/terms" className={LINK}>Terms of service</a>.
          How we handle the data involved is in our <a href="/privacy" className={LINK}>Privacy policy</a>.
        </p>
        <p>
          Nothing here takes away rights the law gives you as a consumer, for example when something is not delivered,
          is faulty or is not as described.
        </p>
      </Section>

      <Section id="s2" title="2. Storelib plans">
        <Ul items={[
          "You can cancel a paid plan at any time in Billing. It stays active until the end of the month you paid for, then your account moves to Free. Nothing more is charged.",
          "Plan fees already paid are not refunded, in full or in part, when you cancel, downgrade or delete your account, except where the law requires it.",
          "An upgrade is charged at once for the rest of the month. If the payment does not go through, your plan does not change and nothing is kept.",
          "If we charged you by mistake, for example twice or after you cancelled, write to support@storelib.com and we will refund the amount charged in error.",
          "Paid plans are sold to creators for their business, so consumer withdrawal rights do not usually apply to them.",
        ]} />
      </Section>

      <Section id="s3" title="3. Purchases from creators">
        <p>
          When you buy from a creator, the creator is the seller and decides refunds, within the law. Storelib does not
          refund creators&apos; sales from its own money.
        </p>
        <Ul items={[
          "A creator can show a refund policy on each product (for example no refunds, or a 7, 14 or 30 day money back guarantee) and, for a community or event, its own refund policy at checkout. That policy is the creator's promise to you.",
          "Where a creator states no policy, a digital product is not refundable once it has been delivered, and a product that ships follows the store's return settings. In both cases you keep your legal rights.",
          "To ask for a refund, press Need help with this order? on your receipt or order page, or reply to the creator's contact address on the receipt. Say what you bought and why.",
        ]} />
      </Section>

      <Section id="s4" title="4. How a refund works">
        <Ul items={[
          "The creator refunds from Orders, all of an order or part of it, and can refund the same order again until the whole amount is refunded.",
          "The money goes back to the card or wallet you paid with, through Stripe, in the currency you paid in. You and the creator both get an email. Your bank usually shows it within 5 to 10 business days.",
          "A full refund of a download, course or other digital product removes it from your library and closes its download link. A partial refund leaves your access as it is.",
          "The refunded amount comes out of the creator's balance. Storelib's fee on the sale is not returned.",
          "A refund made by the creator in their own Stripe dashboard is recorded the same way.",
          "Orders paid through Airwallex before Storelib moved to Stripe are refunded by the creator in their Airwallex account.",
          "Cash on delivery: before the cash is paid, the order is cancelled rather than refunded; after, the creator gives the cash back and records it on the order.",
        ]} />
      </Section>

      <Section id="s5" title="5. Downloads and courses">
        <p>
          Digital products are delivered as soon as payment succeeds, and can be copied once downloaded, so most
          creators do not refund them unless something is wrong. You are entitled to a fix or a refund if a product was
          never delivered, does not open or work as described, or is materially different from its listing. Contact the
          creator first; if they do not answer, Storelib can step in (section 11). Buyers in the EEA and the UK should
          also read section 9.
        </p>
      </Section>

      <Section id="s6" title="6. Memberships, communities and events">
        <Ul items={[
          "You can cancel a membership or community plan at any time from your Membership page. You keep access until the end of the period you paid for, and nothing more is charged. Cancelling does not refund the current period unless the creator's policy or the law says so.",
          `If a renewal payment fails, you keep access for ${MEMBERSHIP_GRACE_DAYS} days while the card is retried, then access ends until it is paid.`,
          "The community's own refund policy, shown at checkout and on your Membership page, applies. The owner can refund payments from the community's payments.",
          "Event tickets are refunded within the window the event sets; outside it there is no refund unless the event is cancelled or the event's own policy says otherwise.",
          "If a community is closed, either your membership runs to the end of the period you paid for, or it ends at once and the unused part of your last payment is refunded.",
        ]} />
      </Section>

      <Section id="s7" title="7. Products that ship">
        <SubSection title="7.1 Cancelling an order">
          <p>
            While an order has not shipped and the creator has not started on it, your order page has Cancel order.
            Usually the order is cancelled and refunded at once. If the order has already gone to a print or fulfilment
            partner, or includes a download you already have, the creator is asked instead and decides.
          </p>
        </SubSection>
        <SubSection title="7.2 Returns">
          <p>
            Where the store accepts returns, your order page has Return items within the store&apos;s return window,
            counted from delivery (or from shipping when there is no tracking). The creator approves each return and
            refunds once the items are back or as they say; who pays for return shipping is the creator&apos;s
            policy, within the law. Personalised or made to order items may not be returnable unless faulty.
          </p>
        </SubSection>
        <SubSection title="7.3 Not arrived, damaged or wrong">
          <p>
            Tell the creator through Need help with this order?, with photos if it helps. A parcel the carrier never
            shows as delivered is closed as Delivery not confirmed after a time, and you can still ask for help.
          </p>
        </SubSection>
      </Section>

      <Section id="s8" title="8. Tips, bookings and services">
        <Ul items={[
          "Tips are gifts to the creator and are not refundable unless the creator chooses to refund one or the tip was a mistake.",
          "Paid bookings and services follow the cancellation and refund terms the creator shows when you book. If the creator cancels or does not deliver, you are entitled to a refund.",
        ]} />
      </Section>

      <Section id="s9" title="9. EU and UK right of withdrawal">
        <p>
          If you are a consumer in the EEA or the UK, you usually have 14 days to withdraw from a purchase from a
          trader, without giving a reason. For goods, the 14 days start when you receive them, and you send them back
          within 14 days of withdrawing. For digital content and services there is an exception: the right ends once
          delivery or the service starts, but only if you asked for it to start at once and acknowledged that you would
          lose the right.
        </p>
        <Ul items={[
          `At the checkout of a community membership, buyers in the EEA and the UK are asked for that consent, in these words: "${MEMBERSHIP_WAIVER_WORDS}" It is confirmed again in the welcome email.`,
          "Other Storelib checkouts do not currently ask for it. For those purchases, the exception may not apply, and you may withdraw within 14 days by telling the creator.",
          "Withdrawal rights are between you and the creator, who must refund you within 14 days of your withdrawal. Creators who sell as private individuals, not as a business, may not be bound by these rules.",
        ]} />
      </Section>

      <Section id="s10" title="10. Chargebacks and disputes">
        <p>
          Please ask the creator first: most problems are sorted quickly, and a refund is faster than a dispute. If you
          ask your bank to reverse a payment, Storelib answers the bank because the payment was taken on Storelib&apos;s
          Stripe account, and the creator&apos;s share is held while the bank decides. If the bank decides for you, the
          money stays with you and access to a product you bought once ends. If it decides for the creator, the
          payment stands. Opening disputes in bad faith can lead to your account being closed. Creators should read
          section 9 of the <a href="/terms#s9" className={LINK}>Terms</a>.
        </p>
      </Section>

      <Section id="s11" title="11. When Storelib steps in">
        <p>
          If the creator has not answered within three days about the goods or a refund, press Ask Storelib for help
          in Need help with this order? on your receipt or order page, or write to{" "}
          <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a> with the product and the
          email address you paid with. We look at what you and the creator say. Where the law, the card network rules
          or our Terms require it, for example when something was never delivered, Storelib may refund you on the
          creator&apos;s behalf; the amount is taken from the creator&apos;s balance.
        </p>
      </Section>

      <Section id="s12" title="12. Contact">
        <div className="mt-3 space-y-1 rounded-2xl bg-[var(--legal-panel,#f8f9fa)] p-4 text-[14px]">
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Refunds and billing:</span>{" "}
            <a href="mailto:support@storelib.com" className={LINK}>support@storelib.com</a>
          </p>
          <p>
            <span className="font-medium text-[var(--legal-ink,#1a1a2e)]">Legal:</span>{" "}
            <a href="mailto:legal@storelib.com" className={LINK}>legal@storelib.com</a>
          </p>
        </div>
      </Section>
    </>
  )
}
