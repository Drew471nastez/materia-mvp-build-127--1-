"use client"

import { ArrowUpDown, ChevronRight, SlidersHorizontal } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { DEPARTMENT_NAV } from "@/lib/marketplace/department-nav"
import type { Facet } from "@/lib/marketplace/feed-filters"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  WHAT YOU ARE LOOKING AT, AND THE TWO WAYS TO CHANGE IT
 * ===========================================================================
 *
 * Pressing Femei · Încălțăminte used to land on a grid of shoes with nothing
 * anywhere saying so. The department, the group, the number of results and the
 * way back up were all in the URL and nowhere on the screen — so the only
 * evidence the filter had worked was that the listings looked different, which
 * is not evidence at all on a marketplace you have never used.
 *
 * Four things, in the order somebody reads them:
 *
 *   THE TRAIL, because a filtered feed needs a way OUT that is not the back
 *   button. Acasă › Femei › Încălțăminte, each of them a link, so widening by
 *   one level is one tap rather than a return trip through the menu.
 *
 *   THE TITLE AND THE COUNT, which is the site confirming what it did. The
 *   count is exact — the listings are already on the client — so it is a fact
 *   rather than an estimate.
 *
 *   THE BRANDS, derived from what is actually in front of you and ordered by
 *   how many carry each. On a resale marketplace the brand IS the query most of
 *   the time, and these are one tap instead of Filtre → Brand → scroll.
 *
 *   THE BAR. Filters and sort are the two things that change a result set, and
 *   they are the two controls. The badge is the number of active filters,
 *   because a filter you have forgotten is the reason a page looks empty.
 */

export function ResultsHeader({
  departmentId,
  groupId,
  query,
  count,
  brands,
  activeBrands,
  onToggleBrand,
  filterCount,
  onOpenFilters,
  onOpenSort,
}: {
  departmentId?: string | null
  groupId?: string | null
  query?: string
  count: number
  brands: Facet[]
  activeBrands: string[]
  onToggleBrand: (brand: string) => void
  filterCount: number
  onOpenFilters: () => void
  onOpenSort: () => void
}) {
  const dept = departmentId ? DEPARTMENT_NAV.find((d) => d.id === departmentId) ?? null : null
  const group = dept && groupId ? dept.subcategories.find((s) => s.id === groupId) ?? null : null

  const title = query ? `„${query}”` : group?.label ?? dept?.label ?? "Toate anunțurile"

  return (
    <div className="border-b border-neutral-100 bg-white px-4 pb-3 pt-3">
      {/* The trail is only drawn when there is somewhere above you. On a bare
          search there is not: "Acasă › „nike”" is a crumb pretending a query is
          a place in a hierarchy. */}
      {dept && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-hide">
          <Crumb href="/" label="Acasă" />
          <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
          {group ? (
            <>
              <Crumb href={dept.href} label={dept.label} />
              <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
              <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-neutral-900">
                {group.label}
              </span>
            </>
          ) : (
            <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-neutral-900">
              {dept.label}
            </span>
          )}
        </nav>
      )}

      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-neutral-900">{title}</h1>
      <p className="mt-0.5 text-[13.5px] font-medium text-neutral-500">
        {count === 1 ? "1 rezultat" : `${count} rezultate`}
      </p>

      {/* FOUR, NOT FORTY. This is a shortcut past the filter sheet, not a second
          copy of it — a rail long enough to scroll is a filter list that has
          escaped into the page. Anything past the top few is one tap away in
          Filtre → Brand, which is also where you go to combine them. */}
      {brands.length > 1 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 scrollbar-hide">
          {brands.slice(0, 8).map((b) => {
            const on = activeBrands.some((x) => x.toLowerCase() === b.value.toLowerCase())
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => onToggleBrand(b.value)}
                aria-pressed={on}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors",
                  on
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-800 active:bg-neutral-100",
                )}
              >
                {b.value}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex items-stretch border-t border-neutral-100 pt-1">
        <button
          type="button"
          onClick={onOpenFilters}
          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[15px] font-semibold text-neutral-900 active:bg-neutral-50"
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
          Filtre
          {filterCount > 0 && (
            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-neutral-900 px-1.5 text-[11.5px] font-bold text-white">
              {filterCount}
            </span>
          )}
        </button>
        <span aria-hidden className="my-2 w-px bg-neutral-200" />
        <button
          type="button"
          onClick={onOpenSort}
          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[15px] font-semibold text-neutral-900 active:bg-neutral-50"
        >
          <ArrowUpDown className="h-[17px] w-[17px]" />
          Sortează
        </button>
      </div>
    </div>
  )
}

function Crumb({ href, label }: { href: string; label: string }) {
  return (
    <SmartLink
      href={href}
      className="shrink-0 whitespace-nowrap text-[13px] font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-[3px] active:text-neutral-900"
    >
      {label}
    </SmartLink>
  )
}
