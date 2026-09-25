/**
 * ===========================================================================
 *  COMPARE PLANS
 * ===========================================================================
 * The table under the cards on the upgrade page, drawn after the owner's
 * reference: a large title, the plan names across the top, then groups of rows with a
 * title of their own, a hairline between rows, the feature on the left and
 * each plan's answer centred under its name. A number or a word where the
 * answer is one; a check in a green disc or a cross in a grey one where it is
 * yes or no. Pro's column is lifted a little, so the eye reads down it.
 *
 * Every row comes from lib/billing/plans planComparison, which reads the
 * fee, site and storage tables, so nothing here can claim what a plan does
 * not do.
 */
import { Check, X } from "lucide-react"
import { formatPlanPrice, planComparison, planDisplayName, PRO_CHECKOUT_PLAN_ID, PRO_PRICE_CENTS, type ComparisonValue } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"

function Cell({ value, pro }: { value: ComparisonValue; pro?: boolean }) {
  return (
    <td className={cn("h-14 border-t px-2 text-center align-middle sm:h-[60px]", pro ? "border-[#ebe8ff] bg-[#f6f5ff]" : "border-[#f0f1f3]")}>
      {typeof value === "string" ? (
        <span className="text-[13px] tabular-nums text-[#4b5563] sm:text-[14px]">{value}</span>
      ) : value ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#e3f5e9]" role="img" aria-label="Included">
          <Check className="h-3.5 w-3.5 text-[#15803d]" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f2f4]" role="img" aria-label="Not included">
          <X className="h-3.5 w-3.5 text-[#6b7280]" strokeWidth={3} aria-hidden />
        </span>
      )}
    </td>
  )
}

export function ComparePlans() {
  const sections = planComparison()
  return (
    <section aria-labelledby="compare-plans-title" data-compare-plans="" className="mx-auto w-full max-w-[880px]">
      <h2 id="compare-plans-title" className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">
        Compare plans
      </h2>
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-8">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup>
            <col className="w-[46%] sm:w-[52%]" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="border-b border-[#eef0f2] bg-white px-4 text-left sm:px-6">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="h-[72px] border-b border-[#eef0f2] bg-white px-2 text-center">
                <span className="block text-[15px] font-semibold text-[#1a1a2e] sm:text-[16px]">{planDisplayName("free")}</span>
                <span className="block text-[12px] font-normal text-[#6b7280]">{formatPlanPrice(0)}</span>
              </th>
              <th scope="col" className="h-[72px] border-b border-[#e4e1ff] bg-[#f6f5ff] px-2 text-center">
                <span className="block text-[15px] font-semibold text-[#3b2bb8] sm:text-[16px]">{planDisplayName(PRO_CHECKOUT_PLAN_ID)}</span>
                <span className="block text-[12px] font-normal text-[#5f6570]">{formatPlanPrice(PRO_PRICE_CENTS)} a month</span>
              </th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.title}>
              <tr>
                <th colSpan={1} scope="colgroup" className="px-4 pb-2 pt-7 text-left text-[16px] font-semibold text-[#1a1a2e] sm:px-6 sm:pt-9 sm:text-[18px]">
                  {section.title}
                </th>
                <td aria-hidden />
                <td aria-hidden className="bg-[#f6f5ff]" />
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label} data-compare-row={row.label}>
                  <th scope="row" className="border-t border-[#f0f1f3] px-4 text-left text-[13px] font-medium text-[#1a1a2e] sm:px-6 sm:text-[14px]">
                    {row.label}
                  </th>
                  <Cell value={row.free} />
                  <Cell value={row.pro} pro />
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td className="h-4" />
              <td />
              <td className="bg-[#f6f5ff]" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
