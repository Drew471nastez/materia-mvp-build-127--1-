"use client"

/**
 * ===========================================================================
 *  A CREATOR'S MEMBERSHIPS
 * ===========================================================================
 * /app/memberships: each membership with what it costs, whether it is on
 * sale, and the two numbers a creator looks at first: how many members it
 * has and what they bring in a month. New membership makes a draft and opens
 * it (/api/app/memberships), where the price, what members get and the
 * first update are set.
 *
 * Drawn in the /app language the Orders and Coupons lists use (their bar,
 * card and near black action: app/app/orders/order-parts).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, StatusBadge, buttonPrimary, card } from "@/app/app/orders/order-parts"
import { money, pricePer } from "@/lib/memberships/state"
import type { CreatorMembershipRow } from "@/lib/memberships/view-types"

function priceLine(r: CreatorMembershipRow): string {
  const parts = [r.monthlyPriceCents ? pricePer(r.monthlyPriceCents, "month") : "", r.yearlyPriceCents ? pricePer(r.yearlyPriceCents, "year") : ""].filter(Boolean)
  return parts.length ? parts.join(" or ") : "No price yet"
}

export function CreatorMembershipsList({ rows, available }: { rows: CreatorMembershipRow[]; available: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const create = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/app/memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Membership" }) })
      const data = (await res.json().catch(() => ({}))) as { productId?: string; error?: string }
      if (!res.ok || !data.productId) throw new Error(data.error || "The membership could not be made. Try again.")
      router.push(`/app/memberships/${data.productId}?tab=settings&new=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The membership could not be made. Try again.")
      setBusy(false)
    }
  }

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-creator-memberships="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Memberships</h1>
        {available ? (
          <button type="button" onClick={() => void create()} disabled={busy} className={cn(buttonPrimary, "max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]")}>
            <Plus aria-hidden className="h-4 w-4" />
            {busy ? "Making" : "New membership"}
          </button>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {error ? <p role="alert" className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-[13.5px] text-[#991b1b]">{error}</p> : null}
        {!available ? (
          <div className={cn(card, "mt-3 px-6 py-10 text-center text-[14px] text-[#6b7280]")}>Memberships are not set up on Storelib yet. They appear here once they are.</div>
        ) : rows.length === 0 ? (
          <div className={cn(card, "mt-3 px-6 py-12 text-center")}>
            <p className="text-[16px] font-semibold text-[#1a1a2e]">Sell a membership</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-[#6b7280]">
              Members pay every month or every year. They get your updates, the files you share with them and any products you include, in their library and by email.
            </p>
            <button type="button" onClick={() => void create()} disabled={busy} className={cn(buttonPrimary, "mt-5 h-10 px-4 text-[14px]")}>
              <Plus aria-hidden className="h-4 w-4" />
              {busy ? "Making" : "New membership"}
            </button>
          </div>
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
                      <StatusBadge tone={r.status === "published" ? "success" : "neutral"}>{r.status === "published" ? "On sale" : "Draft"}</StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{priceLine(r)}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{r.stats.members}</p>
                    <p className="text-[12px] text-[#6b7280]">{r.stats.members === 1 ? "member" : "members"}</p>
                  </div>
                  <div className="hidden w-[120px] text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{money(r.stats.monthlyCents)}</p>
                    <p className="text-[12px] text-[#6b7280]">a month</p>
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
