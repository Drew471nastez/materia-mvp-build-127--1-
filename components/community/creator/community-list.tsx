"use client"

/**
 * /app/community: the creator's communities, each with who can join, how
 * many members it has and whether it is live, and the ones they help run
 * as an admin or a moderator. New community opens the create flow.
 */
import Link from "next/link"
import { ChevronRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, StatusBadge, buttonPrimary, card } from "@/app/app/orders/order-parts"
import { compactCount, memberCountLabel } from "@/lib/communities/format"
import type { CommunityListRow } from "./view-types"
import { ROLE_LABEL } from "./logic"

function State({ row }: { row: CommunityListRow }) {
  if (row.status === "suspended") return <StatusBadge tone="critical">Suspended</StatusBadge>
  if (row.status === "archived") return <StatusBadge tone="neutral">Archived</StatusBadge>
  if (row.status === "published") return <StatusBadge tone="success">Published</StatusBadge>
  return <StatusBadge tone="neutral">Draft</StatusBadge>
}

export function CommunityList({ rows, available }: { rows: CommunityListRow[]; available: boolean }) {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-community-list="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">Community</h1>
        {available && rows.length > 0 ? (
          <Link href="/app/community/new" className={cn(buttonPrimary, "max-md:h-11 max-md:rounded-xl max-md:px-4 max-md:text-[15px]")}>
            <Plus aria-hidden className="h-4 w-4" />
            New community
          </Link>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {!available ? (
          <div className={cn(card, "mt-3 px-6 py-10 text-center text-[14px] text-[#6b7280]")}>Communities are not set up on Storelib yet. They appear here once they are.</div>
        ) : rows.length === 0 ? (
          <div className={cn(card, "mt-3 px-6 py-12 text-center")} data-empty="">
            <p className="text-[16px] font-semibold text-[#1a1a2e]">Start a community</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-[#6b7280]">
              A place for your members: posts, chat, your courses and live events. Free, paid every month or year, or by invite only.
            </p>
            <Link href="/app/community/new" className={cn(buttonPrimary, "mt-5 h-10 px-4 text-[14px]")}>
              <Plus aria-hidden className="h-4 w-4" />
              New community
            </Link>
          </div>
        ) : (
          <ul className={cn(card, "mt-3 divide-y divide-[#f1f2f4] overflow-hidden")}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/app/community/${r.id}`} className="flex min-h-[68px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-[#fafbfb] sm:px-5" data-community-row="">
                  {r.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1a1a2e] text-[16px] font-semibold text-white">
                      {r.name.trim().charAt(0).toUpperCase() || "C"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{r.name}</p>
                      <State row={r} />
                      {r.role !== "owner" ? <span className="hidden text-[12px] font-medium text-[#6b7280] sm:inline">{ROLE_LABEL[r.role]}</span> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">
                      {[r.priceLine, memberCountLabel(r.memberCount)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="hidden w-[88px] text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{compactCount(r.memberCount)}</p>
                    <p className="text-[12px] text-[#6b7280]">{r.memberCount === 1 ? "member" : "members"}</p>
                  </div>
                  <div className="hidden w-[88px] text-right sm:block">
                    <p className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{compactCount(r.postCount)}</p>
                    <p className="text-[12px] text-[#6b7280]">{r.postCount === 1 ? "post" : "posts"}</p>
                  </div>
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
