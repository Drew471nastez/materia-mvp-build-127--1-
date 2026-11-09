"use client"

/**
 * ===========================================================================
 *  CUSTOMERS, DRAWN AS ORDERS AND PEOPLE ARE (round 52)
 * ===========================================================================
 * The list bar (title, Open in Contacts), one card with a table of each
 * buyer: who, where, their last order, how many orders, what they spent in
 * the store's currency and when they joined. Each row opens the person in
 * Contacts (./page.tsx makes the address), so there is no View contact line
 * under every name. A phone shows each buyer as one stacked row.
 *
 * Everything shown is read and worded on the server (./page.tsx): this only
 * draws it.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { LIST_BAR, LIST_WIDTH, PaneBar, GUTTER, buttonSecondary, card } from "../orders/order-parts"

export interface CustomerLine {
  id: string
  name: string
  email: string
  location: string | null
  /** The person in Contacts. */
  href: string
  lastOrder: { title: string | null; day: string } | null
  orders: number
  spent: string
  joined: string
}

export function CustomersView({ rows }: { rows: CustomerLine[] | null }) {
  const th = "bg-[#f7f7f8] px-3 text-left text-[12px] font-medium text-[#4b5563]"
  const td = "border-t border-[#f0f1f3] px-3 py-2 max-sm:hidden"
  return (
    <>
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Customers")}</h1>
        {/* Round 51: every person the store knows, buyers included, with their whole history. This page stays for what each buyer spent in the store's currency and where they are. */}
        <Link href="/app/contacts?filter=customers" className={cn(buttonSecondary, "max-sm:h-10")} data-customers-contacts="">
          {tt("Open in Contacts")}
        </Link>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)} data-customers="">
        <section aria-label={tt("Customers")} className={cn(card, "mt-3 overflow-hidden")}>
          {rows && rows.length > 0 ? (
            <table className="w-full border-separate border-spacing-0 text-[13px] sm:table-fixed">
              <colgroup>
                <col />
                <col className="sm:w-[16%]" />
                <col className="sm:w-[22%]" />
                <col className="sm:w-[80px]" />
                <col className="sm:w-[120px]" />
                <col className="sm:w-[120px]" />
                <col className="sm:w-0" />
              </colgroup>
              <thead className="max-sm:hidden">
                <tr className="h-9">
                  <th scope="col" className={cn(th, "pl-4")}>{tt("Customer")}</th>
                  <th scope="col" className={th}>{tt("Location")}</th>
                  <th scope="col" className={th}>{tt("Last order")}</th>
                  <th scope="col" className={cn(th, "text-right")}>{tt("Orders")}</th>
                  <th scope="col" className={cn(th, "text-right")}>{tt("Total spent")}</th>
                  <th scope="col" className={cn(th, "pr-4")}>{tt("Joined")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="group relative" data-customer-row={c.id}>
                    <td className={cn(td, "pl-4 group-hover:bg-[#fafafb]")}>
                      {/* The row is the link: its ::after covers the whole row. */}
                      <Link href={c.href} className="block truncate font-semibold text-[#1a1a2e] outline-none after:absolute after:inset-0 focus-visible:underline">
                        {c.name || displayEmail(c.email)}
                      </Link>
                      {c.name && displayEmail(c.email) ? <span className="block truncate text-[12px] text-[#6b7280]">{displayEmail(c.email)}</span> : null}
                    </td>
                    <td className={cn(td, "truncate text-[#4b5563] group-hover:bg-[#fafafb]")}>{c.location ?? "–"}</td>
                    <td className={cn(td, "group-hover:bg-[#fafafb]")}>
                      {c.lastOrder ? (
                        <>
                          <span className="block truncate text-[#1a1a2e]">{c.lastOrder.title || tt("Removed product")}</span>
                          <span className="block text-[12px] text-[#6b7280]">{c.lastOrder.day}</span>
                        </>
                      ) : (
                        <span className="text-[#9ca3af]">–</span>
                      )}
                    </td>
                    <td className={cn(td, "text-right tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb]")}>{c.orders}</td>
                    <td className={cn(td, "text-right font-medium tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb]")}>{c.spent}</td>
                    <td className={cn(td, "whitespace-nowrap pr-4 text-[#4b5563] group-hover:bg-[#fafafb]")}>{c.joined}</td>
                    {/* A phone: one stacked cell. */}
                    <td className="w-full max-w-0 border-t border-[#f0f1f3] bg-white px-4 py-3 sm:hidden" data-phone-row="">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={c.href} className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e] outline-none after:absolute after:inset-0">
                          {c.name || displayEmail(c.email)}
                        </Link>
                        <span className="shrink-0 text-[15px] font-medium tabular-nums text-[#1a1a2e]">{c.spent}</span>
                      </div>
                      {c.name && displayEmail(c.email) ? <p className="mt-0.5 truncate text-[15px] text-[#303036]">{displayEmail(c.email)}</p> : null}
                      <p className="mt-0.5 truncate text-[14px] text-[#6b7280]">
                        {[tt("{length, plural, one {# order} other {# orders}}", { length: c.orders }), c.location, c.lastOrder?.day].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center" data-customers-empty="">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("No customers yet")}</p>
              <p className="mt-1 max-w-[380px] text-[13px] text-[#6b7280] max-sm:text-[14px]">{tt("Customers will appear here when they purchase your products.")}</p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
