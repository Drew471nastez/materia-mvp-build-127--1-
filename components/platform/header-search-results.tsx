"use client"

/**
 * ===========================================================================
 *  WHAT THE HEADER'S SEARCH SHOWS UNDER ITS FIELD
 * ===========================================================================
 * The Storelib header's own search (components/platform/platform-header-
 * client.tsx) opens this under its field, on a computer and in the phone's
 * search strip. It is a results list, not a categories menu: there are no
 * category pills in it at all (categories are the grid icon at the end of
 * the field, and Explore's own pills).
 *
 *   NOTHING TYPED   the recent searches on this device (lib/nav/quick-
 *                   search readRecent), each removable, or nothing at all:
 *                   with no recent searches the header draws no panel.
 *   A WORD          the five most relevant products and communities
 *                   together (lib/nav/quick-search topHits), each with its
 *                   picture asked for at the size it is drawn, then
 *                   "View all results for" the word, which is Explore's own
 *                   results page in the mode being browsed.
 *
 * KEYBOARD. The field is a combobox: the arrows move through the rows
 * (the recent searches, or the results and View all), Enter opens the one
 * marked, or Explore's results when none is, and Escape closes. The marked
 * row is announced through aria-activedescendant, so focus never leaves
 * the field and typing carries on.
 *
 * The list is short (five rows), so it rarely scrolls; when it does (a
 * short window) its scrollbar is the slim one, not the browser's default.
 */
import { Clock, Search, X, ArrowRight } from "lucide-react"

import { optimizedImageUrl } from "@/lib/images/optimized-url"
import type { QuickHit } from "@/lib/nav/quick-search"
import { cn } from "@/lib/utils"

/** The thin scrollbar: 6px, a soft grey thumb, no track. */
export const SLIM_SCROLL =
  "[scrollbar-width:thin] [scrollbar-color:#d4d7dd_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d4d7dd]"

/** How many rows the arrows move through: the results and View all, or the recent searches. */
export function optionCount(query: string, hits: QuickHit[], recents: string[]): number {
  return query.trim() ? hits.length + 1 : recents.length
}

/** Whether there is anything to draw: a word, or a recent search to offer. */
export function hasPanel(query: string, recents: string[]): boolean {
  return query.trim() !== "" || recents.length > 0
}

export const optionId = (prefix: string, i: number) => `${prefix}-opt-${i}`

/* The box is 44px with a hairline inside it, so the picture is drawn at 42 and asked for at that size. */
const THUMB = 42

function Thumb({ hit }: { hit: QuickHit }) {
  const radius = hit.kind === "community" ? "rounded-[11px]" : "rounded-[9px]"
  if (!hit.thumb) {
    return (
      <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center border border-[#eceef1] bg-[#f4f5f7] text-[15px] font-semibold text-[#6b7280]", radius)}>
        {hit.kind === "community" ? hit.title.trim().charAt(0).toUpperCase() || "C" : <Search className="h-[18px] w-[18px] text-[#9ca3af]" strokeWidth={1.9} />}
      </span>
    )
  }
  return (
    <span className={cn("block h-11 w-11 shrink-0 overflow-hidden border border-[#eceef1] bg-[#f4f5f7]", radius)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedImageUrl(hit.thumb, THUMB)}
        alt=""
        width={THUMB}
        height={THUMB}
        decoding="async"
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden"
        }}
      />
    </span>
  )
}

export function HeaderSearchResults({
  query,
  hits,
  loading,
  recents,
  active,
  idPrefix,
  onHover,
  onPick,
  onViewAll,
  onRecent,
  onRemoveRecent,
  onClearRecent,
  phone = false,
}: {
  query: string
  hits: QuickHit[]
  /** A search is on its way. The rows already shown stay until it answers. */
  loading: boolean
  recents: string[]
  /** The row the arrows have marked, -1 for none. */
  active: number
  idPrefix: string
  onHover: (i: number) => void
  onPick: (hit: QuickHit) => void
  onViewAll: () => void
  onRecent: (q: string) => void
  onRemoveRecent: (q: string) => void
  onClearRecent: () => void
  phone?: boolean
}) {
  const word = query.trim()
  const row = cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-[10px] text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
    phone ? "min-h-[56px] px-2 py-1.5" : "min-h-[56px] px-2.5 py-1.5",
  )

  if (!word) {
    if (!recents.length) return null
    return (
      <div className="p-1.5" data-header-search-recent="">
        <div className="flex h-9 items-center justify-between pl-2.5 pr-1">
          <span className="text-[12.5px] font-medium text-[#6b7280]">Recent searches</span>
          <button type="button" onClick={onClearRecent} className="h-8 cursor-pointer rounded-md px-2 text-[12.5px] font-medium text-[#6b7280] outline-none hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
            Clear
          </button>
        </div>
        <ul role="listbox" id={`${idPrefix}-list`} aria-label="Recent searches">
          {recents.map((r, i) => (
            <li key={r} role="presentation" className="group/recent relative">
              <button
                type="button"
                role="option"
                id={optionId(idPrefix, i)}
                aria-selected={active === i}
                tabIndex={-1}
                onMouseMove={() => onHover(i)}
                onClick={() => onRecent(r)}
                data-header-search-option=""
                className={cn("flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-[10px] pl-2.5 pr-11 text-left text-[14.5px] text-[#1a1a2e] outline-none transition-colors duration-100", active === i ? "bg-[#f4f5f7]" : "hover:bg-[#f7f8f9]")}
              >
                <Clock aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={1.9} />
                <span className="min-w-0 flex-1 truncate">{r}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${r}`}
                tabIndex={-1}
                onClick={() => onRemoveRecent(r)}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#9ca3af] outline-none hover:bg-[#eceef1] hover:text-[#1a1a2e]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const viewAllIndex = hits.length
  return (
    <div role="listbox" id={`${idPrefix}-list`} aria-label="Search results" data-header-search-results="" aria-busy={loading || undefined}>
      <ul role="presentation" className="p-1.5 empty:hidden">
        {hits.map((hit, i) => (
          <li key={`${hit.kind}:${hit.id}`} role="presentation">
            <a
              href={hit.href}
              role="option"
              id={optionId(idPrefix, i)}
              aria-selected={active === i}
              tabIndex={-1}
              onMouseMove={() => onHover(i)}
              onClick={(e) => {
                e.preventDefault()
                onPick(hit)
              }}
              data-header-search-option=""
              data-header-search-hit={hit.kind}
              className={cn(row, active === i ? "bg-[#f4f5f7]" : "hover:bg-[#f7f8f9]")}
            >
              <Thumb hit={hit} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium leading-[1.35] text-[#1a1a2e]">{hit.title}</span>
                <span className="block truncate text-[12.5px] leading-[1.4] text-[#6b7280]">
                  {hit.kind === "community" ? (
                    <>
                      <span className="text-[#1a1a2e]/70">Community</span>
                      {hit.line ? ` · ${hit.line}` : null}
                    </>
                  ) : hit.line ? (
                    `by ${hit.line}`
                  ) : (
                    "Product"
                  )}
                </span>
              </span>
              {hit.price ? <span className="shrink-0 pl-2 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{hit.price}</span> : null}
            </a>
          </li>
        ))}
      </ul>
      {!hits.length ? (
        <p role="presentation" className="px-4 py-5 text-[14px] text-[#6b7280]" data-header-search-empty="">
          {loading ? "Searching" : <>Nothing found for &ldquo;{word}&rdquo;</>}
        </p>
      ) : null}
      <div role="presentation" className="border-t border-[#f0f1f3] p-1.5">
        <button
          type="button"
          role="option"
          id={optionId(idPrefix, viewAllIndex)}
          aria-selected={active === viewAllIndex}
          tabIndex={-1}
          onMouseMove={() => onHover(viewAllIndex)}
          onClick={onViewAll}
          data-header-search-option=""
          data-header-search-all=""
          className={cn("flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 text-left text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100", active === viewAllIndex ? "bg-[#f4f5f7]" : "hover:bg-[#f7f8f9]")}
        >
          <span className="min-w-0 flex-1 truncate">View all results for &ldquo;{word}&rdquo;</span>
          <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
