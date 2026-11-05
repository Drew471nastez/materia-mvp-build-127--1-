import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Check } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadOrder } from "@/lib/physical/orders-server"
import { partnerLinkHolds, partnerView, verifyPartnerLink } from "@/lib/physical/partner-server"
import { addressLines } from "@/lib/physical/address"
import { CARRIERS, SHIPMENT_LABEL } from "@/lib/physical/status"
import { storeIdentity } from "@/lib/store/identity-server"
import { ErrorBanner, Field, TextInput } from "../../../parts/ui"

export const dynamic = "force-dynamic"
/* The token is the partner's key to this order: never indexed, never sent on as a Referer. */
export const metadata: Metadata = { title: "Add tracking", robots: { index: false, follow: false }, referrer: "no-referrer" }

const ERRORS: Record<string, string> = {
  number: "Check the tracking number. Letters, numbers and dashes only.",
  url: "The tracking link must start with https://.",
  limit: "That's a lot of tries. Wait a few minutes, then try again.",
  order: "This order can't take tracking right now. Reply to the order email instead.",
  link: "This link has expired. Reply to the order email with the tracking instead.",
}

const select =
  "block h-11 w-full min-w-0 rounded-[8px] border border-[#e1e3e7] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/55 sm:text-[15px]"

/**
 * ===========================================================================
 *  THE PARTNER'S PAGE FOR ONE ORDER: ADD TRACKING
 * ===========================================================================
 * Linked from the order email a supplier, warehouse or print partner gets
 * (lib/physical/jobs-server.ts sendSupplierEmail), signed for that order and
 * that location (lib/physical/partner-link.ts). What to ship and where, as
 * the email said it, and one form: carrier, number, link. Sending it ships
 * their items on the order and emails the buyer the tracking
 * (app/api/physical/partner-tracking). No account, no prices.
 */
export default async function PartnerTrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams])
  const link = verifyPartnerLink(decodeURIComponent(token))
  const admin = createAdminClient()
  const co = link ? (await admin.from("commerce_checkouts").select("id, creator_id").eq("id", link.c).maybeSingle()).data : null
  const found = co && link ? (await admin.from("inventory_locations").select("id, name, email, forwarding").eq("id", link.l).eq("creator_id", co.creator_id).maybeSingle()).data : null
  /* Sent to an email the location no longer uses: closed, said as expired (lib/physical/partner-link.ts). */
  const revoked = !!(link && found && !partnerLinkHolds(link, found))
  const loc = revoked ? null : found
  const order = co && loc ? await loadOrder(admin, { creatorId: co.creator_id, checkoutId: co.id }) : null
  if (!link || !co || !loc || !order) {
    if (!link || revoked) {
      return (
        <main className="mx-auto min-h-dvh w-full max-w-[460px] bg-[#f8f9fa] px-5 pb-16 pt-12">
          <h1 className="text-[24px] font-semibold text-[#1a1a2e]">This link has expired</h1>
          <p className="mt-2 text-[14.5px] leading-6 text-[#6b7280]">Reply to the order email with the carrier and tracking number, and the store will add it.</p>
        </main>
      )
    }
    notFound()
  }
  const store = await storeIdentity(admin, co.creator_id)
  const view = partnerView(order, loc.id)
  const left = view.lines.reduce((n, l) => n + l.left, 0)
  const error = sp.error && Object.prototype.hasOwnProperty.call(ERRORS, sp.error) ? ERRORS[sp.error] : null
  const ship = order.deliveryMethod === "pickup" ? [] : addressLines(order.address as never)

  return (
    <div data-page="partner-tracking" className="min-h-dvh bg-[#f8f9fa]">
      <main className="mx-auto w-full max-w-[520px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#6b7280]">{store.name}</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Order {view.number}</h1>
        <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">For {loc.name}</p>

        {sp.done ? (
          <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <p className="text-[14.5px] leading-6 text-[#1a1a2e]">{sp.done === "already" ? "This was already marked as shipped. Nothing changed." : "Thanks. The buyer has the tracking now, and the store can see it on the order."}</p>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <ul className="space-y-2.5">
            {view.lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-4 text-[14px]">
                <span className="min-w-0 text-[#1a1a2e]">
                  {l.title}
                  {l.variantName ? <span className="text-[#6b7280]"> ({l.variantName})</span> : null}
                  {l.sku ? <span className="block text-[12.5px] text-[#6b7280]">SKU {l.sku}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-[#1a1a2e]">x {l.quantity}</span>
              </li>
            ))}
          </ul>
          {ship.length ? (
            <div className="mt-4 border-t border-black/[0.07] pt-4">
              <p className="text-[13px] font-semibold text-[#1a1a2e]">Ship to</p>
              <p className="mt-1 text-[14px] leading-[21px] text-[#4b5563]">
                {ship.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          {view.shipped.length ? (
            <div className="mt-4 border-t border-black/[0.07] pt-4">
              <p className="text-[13px] font-semibold text-[#1a1a2e]">Shipped</p>
              <ul className="mt-1 space-y-1 text-[14px] text-[#4b5563]">
                {view.shipped.map((s, i) => (
                  <li key={i}>{[s.carrier, s.trackingNumber].filter(Boolean).join(" ") || "No tracking"}, {SHIPMENT_LABEL[s.status].label.toLowerCase()}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {view.cancelled ? (
          <p className="mt-6 text-[14.5px] text-[#6b7280]">This order was cancelled. Don't ship it.</p>
        ) : left > 0 ? (
          <form method="post" action="/api/physical/partner-tracking" className="mt-6 space-y-4">
            <input type="hidden" name="token" value={decodeURIComponent(token)} />
            {error ? <ErrorBanner>{error}</ErrorBanner> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-carrier" label="Carrier">
                <select id="p-carrier" name="carrier" className={select} defaultValue="">
                  <option value="">Choose</option>
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="p-number" label="Tracking number">
                <TextInput id="p-number" name="tracking_number" required maxLength={60} autoComplete="off" spellCheck={false} invalid={sp.error === "number"} />
              </Field>
              <Field id="p-other" label="Carrier name" hint="Only if you chose Other.">
                <TextInput id="p-other" name="other_carrier" maxLength={40} />
              </Field>
              <Field id="p-url" label="Tracking link" hint="Optional, https://">
                <TextInput id="p-url" name="tracking_url" type="url" maxLength={500} invalid={sp.error === "url"} />
              </Field>
            </div>
            <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white hover:bg-[#262640]">
              Send tracking to the buyer
            </button>
          </form>
        ) : !sp.done ? (
          <p className="mt-6 text-[14.5px] text-[#6b7280]">Everything for {loc.name} on this order has shipped.</p>
        ) : null}
      </main>
    </div>
  )
}
