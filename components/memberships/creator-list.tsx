"use client"

/**
 * ===========================================================================
 *  A CREATOR'S MEMBERSHIPS
 * ===========================================================================
 * /app/memberships: each membership with what it costs, whether it is on
 * sale, and the two numbers a creator looks at first: how many members it
 * has and what they bring in a month.
 *
 * NOTHING NEW IS MADE HERE. Memberships are communities now: a creator who
 * wants members to pay every month makes a paid community. This list is
 * for the memberships a creator already sells, so they and their members
 * keep everything; the page (app/app/memberships/page.tsx) sends a creator
 * with none to Community instead.
 *
 * Drawn in the /app language the Orders and Coupons lists use (their bar,
 * card and near black action: app/app/orders/order-parts).
 */
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, StatusBadge, card } from "@/app/(storelib)/app/orders/order-parts"
import { money, pricePer } from "@/lib/memberships/state"
import type { CreatorMembershipRow } from "@/lib/memberships/view-types"
import { tt } from "@/lib/i18n/text"

function priceLine(r: CreatorMembershipRow): string {
  const parts = [r.monthlyPriceCents ? pricePer(r.monthlyPriceCents, "month") : "", r.yearlyPriceCents ? pricePer(r.yearlyPriceCents, "year") : ""].filter(Boolean)
  return parts.length ? parts.join(" or ") : tt("No price yet")
}

export function CreatorMembershipsList({ rows }: { rows: CreatorMembershipRow[] }) {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-creator-memberships="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Memberships")}</h1>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {rows.length === 0 ? (
          <div className={cn(card, "mt-3 px-6 py-10 text-center text-[14px] text-[#6b7280]")}>{tt("No memberships.")}</div>
        ) : (
          <ul className={cn(card, "mt-3 divide-y divide-[#f1f2f4] overflow-hidden")}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/app/memberships/${r.id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[#fafbfb] sm:px-5">
                  {r.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span aria-hidden className="h-11 w-11 shrink-0 rounded-xl bg-[#eceef1]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{r.title}</p>
                      <StatusBadge tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? tt("On sale") : tt("Draft")}</StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{priceLine(r)}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{r.stats.members}</p>
                    <p className="text-[12px] text-[#6b7280]">{tt("{n, plural, one {member} other {members}}", { n: r.stats.members })}</p>
                  </div>
                  <div className="hidden w-[120px] text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{money(r.stats.monthlyCents)}</p>
                    <p className="text-[12px] text-[#6b7280]">{tt("a month")}</p>
                  </div>
                  <p className="text-[13px] tabular-nums text-[#6b7280] sm:hidden">{r.stats.members}</p>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
