/**
 * ONE SALE, ON EACH PLAN, AS CHECKOUT WORKS IT OUT (lib/marketing/facts
 * saleBreakdown). Drawn on the server. Stripe's card fee is named beside it
 * and not added: it is Stripe's, and it depends on the card and the country.
 */
import Link from "next/link"
import { FEES, PLANS, proBreakEvenDollars, saleBreakdown, usdText, type FactPlanId } from "@/lib/marketing/facts"
import { ratePercentLabel } from "@/lib/payments/fees/config"

export function SaleExample({ priceCents, what, per }: { priceCents: number; what: string; per?: string }) {
  const rows = (["free", "pro"] as FactPlanId[]).map((id) => ({ plan: PLANS[id], sale: saleBreakdown(priceCents, id) }))
  return (
    <div data-sale-example={priceCents}>
      <p className="max-w-[720px] text-[15px] leading-[1.65] text-[#374151]">
        You sell {what}{per ? `, ${per}` : ""}. Here is what Storelib takes and what is left, on each plan.
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Storelib&apos;s fee on {what}, on Free and on Pro</caption>
          <thead>
            <tr className="border-b border-[#eef0f2] bg-[#f8f9fa] text-[13px]">
              <th scope="col" className="px-4 py-3 font-medium text-[#6b7280] sm:px-5">Plan</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-[#6b7280] sm:px-5">Price</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-[#6b7280] sm:px-5">Storelib fee</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-[#1a1a2e] sm:px-5">Left for you</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, sale }) => (
              <tr key={plan.id} className="border-b border-[#f1f2f4] last:border-0">
                <th scope="row" className="px-4 py-3.5 text-[15px] font-semibold text-[#1a1a2e] sm:px-5">
                  {plan.name}
                  <span className="block text-[12.5px] font-normal text-[#6b7280]">
                    {plan.monthlyCents ? `${plan.price} a month, ` : "No monthly fee, "}
                    {plan.feeLabel}
                  </span>
                </th>
                <td className="px-4 py-3.5 text-right text-[15px] tabular-nums text-[#374151] sm:px-5">{usdText(sale.priceCents)}</td>
                <td className="px-4 py-3.5 text-right text-[15px] tabular-nums text-[#374151] sm:px-5">{usdText(sale.storelibFeeCents)}</td>
                <td className="px-4 py-3.5 text-right text-[16px] font-semibold tabular-nums text-[#1a1a2e] sm:px-5">{usdText(sale.afterStorelibCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 max-w-[760px] space-y-1.5 text-[14px] leading-[1.6] text-[#4b5563]">
        <li>Stripe&apos;s card processing fee is separate and applies on both plans. It depends on the card and the country.</li>
        <li>
          Orders under {FEES.smallOrderBelow} pay {ratePercentLabel(PLANS.free.smallOrderRate)} on Free or {ratePercentLabel(PLANS.pro.smallOrderRate)} on Pro, with no {FEES.fixed}.
        </li>
        <li>
          Pro&apos;s lower fee covers its {PLANS.pro.price} price once you sell about ${proBreakEvenDollars().toLocaleString("en-US")} a month.{" "}
          <Link href="/pricing" className="font-medium text-[#1a1a2e] underline underline-offset-2">
            See pricing
          </Link>
        </li>
      </ul>
    </div>
  )
}
