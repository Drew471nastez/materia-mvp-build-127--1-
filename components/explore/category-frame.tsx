"use client"

/**
 * ===========================================================================
 *  A CATEGORY PAGE'S FRAME, DRAWN ONCE
 * ===========================================================================
 * /explore/[category] and its loading screen both draw these, so the heading,
 * the search field, the subcategory pills and the Filters button are the same
 * elements in the same boxes whether the products have arrived or not. The
 * loading screen used to draw its own guess (a 1400px container on #f8f9fa
 * over a page that was 1270px on white, grey bars for a heading that is
 * centred, five pills for a row of nine) and every block moved when the page
 * came in.
 *
 * It is Explore's frame (components/explore/explore-page-client and
 * explore-skeleton): the same ground, the same container, the same pill row
 * that scrolls sideways under a fade, the same Filters button beside it.
 */

import Link from "next/link"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CATEGORY_NAV, getCategory } from "@/lib/marketplace/categories"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"
import { cn } from "@/lib/utils"
import { Chevron, Magnifier, type BrowseGroup } from "./category-browser"

/** One line under the heading, shown on the page. The route keeps the longer SEO copy. */
const BLURB: Record<string, string> = {
  design: "Beautiful templates, graphics, fonts, and design assets",
  development: "Web templates, mobile apps, scripts, and developer tools",
  marketing: "Email templates, ad creatives, landing pages, and SEO tools",
  business: "Spreadsheets, presentations, documents, and business tools",
  ai: "AI prompts, ChatGPT templates, and automation tools",
  "social-media": "Instagram, TikTok, YouTube templates and content packs",
  productivity: "Notion templates, planners, checklists, and dashboards",
  photography: "Lightroom presets, photo overlays, and Photoshop actions",
  video: "Video templates, transitions, motion graphics, and effects",
  "audio-music": "Royalty-free music, sound effects, loops, and samples",
  education: "Online courses, eBooks, tutorials, and educational content",
  ecommerce: "Store themes, product photography, and e-commerce tools",
  freebies: "Free digital products, templates, and resources",
  other: "Miscellaneous digital products and resources",
}

export type CategoryInfo = {
  id: string
  label: string
  description: string
  subcategories: readonly { id: string; label: string }[]
}

/** The category's name, its line and its subcategories, from the shared taxonomy (lib/marketplace/categories). */
export function categoryInfo(id: string): CategoryInfo {
  const c = getCategory(id)
  return {
    id,
    label: c?.label ?? id,
    description: BLURB[id] ?? "",
    subcategories: c?.subcategories ?? [],
  }
}

/** A `?sub=` that belongs to this category, or null. Anything else is ignored rather than emptying the list. */
export function validSub(info: CategoryInfo, sub: string | null | undefined): string | null {
  return sub && info.subcategories.some((s) => s.id === sub) ? sub : null
}

/** Every category and its subcategories, as the Categories pill lists them. */
export const CATEGORY_GROUPS: BrowseGroup[] = CATEGORY_NAV.map((c) => ({
  id: c.id,
  label: c.label,
  items: c.subcategories.map((s) => ({ id: s.id, label: s.label })),
}))

/* ── Explore's pill, in Explore's classes. ── */
export const PILL =
  "inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-sm font-medium select-none whitespace-nowrap border"
export const PILL_ON =
  "bg-[#e2e4e8] text-neutral-900 border-[#d7dadf] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
export const PILL_OFF = "bg-white text-neutral-500 border-neutral-200"
export const PILL_LIVE =
  "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 transition-[background-color,border-color,color,box-shadow] duration-150"
export const PILL_HOVER = "hover:border-neutral-300 hover:text-neutral-800"
/** The trailing pill that opens the category list: a pill with a chevron, one step tighter on the right. */
export const PICKER_PILL =
  "inline-flex items-center gap-1 shrink-0 pl-3.5 pr-2.5 py-2 rounded-full text-sm font-medium select-none whitespace-nowrap border"
/** Explore's Filters button at rest. */
export const FILTERS_BUTTON =
  "inline-flex items-center justify-center gap-2 h-[38px] px-3.5 sm:px-4 rounded-[10px] text-sm font-medium border select-none"
export const FILTERS_REST =
  "bg-white text-neutral-500 border-neutral-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_1px_rgba(15,23,42,0.04)]"

/**
 * The heading, its line and a search inside the category.
 *
 * The search runs on submit, and on clearing, as Explore's does: a list that
 * narrowed on every letter collapsed to an empty box between two keystrokes
 * and pulled the footer up under the pills. It carries Explore's search anchor,
 * so the header shows its own field only once this one has scrolled away
 * (lib/explore/use-search-handoff); without it the header's field on this
 * route was simply missing.
 */
export function CategoryHero({
  title,
  description,
  query,
  onQueryChange,
}: {
  title: string
  description: string
  query: string
  onQueryChange: (q: string) => void
}) {
  const [draft, setDraft] = useState(query)
  useEffect(() => setDraft(query), [query])
  return (
    <section className="pt-2 pb-[6px] sm:pt-4 sm:pb-[18.5px]" data-category-hero="">
      <Link
        href="/explore"
        data-category-back=""
        className="-my-0.5 -ml-1.5 inline-flex h-9 items-center gap-1 rounded-lg pl-1 pr-2.5 text-[14px] font-medium text-[#6b7280] outline-none transition-colors hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
      >
        <Chevron dir="left" />
        Explore
      </Link>

      <div className="mt-3 text-center sm:mt-4">
        <h1 data-category-title="" className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] sm:text-[44px] sm:leading-[1.1]">
          {title}
        </h1>
        {description ? (
          <p className="mx-auto mt-2.5 max-w-[560px] text-balance text-[15px] font-[450] text-neutral-600 sm:mt-3 sm:text-[17px]">{description}</p>
        ) : null}
      </div>

      <div className="mx-auto mt-6 w-full max-w-[640px] sm:mt-7" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            onQueryChange(draft.trim())
          }}
        >
          <Magnifier className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400 sm:left-5" />
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              /* Emptying the field is asking for everything again. */
              if (!e.target.value && query) onQueryChange("")
            }}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder={`Search in ${title}`}
            aria-label={`Search in ${title}`}
            data-category-search=""
            className={cn(
              "h-[48px] w-full rounded-[10px] bg-white pl-12 pr-12 text-[15px] text-neutral-900 placeholder:text-neutral-400 sm:h-[54px] sm:pl-14 sm:text-[16px]",
              "border border-neutral-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)]",
              "outline-none transition-[box-shadow,border-color] focus:border-neutral-300 [&::-webkit-search-cancel-button]:hidden",
              "focus:shadow-[0_1px_3px_rgba(15,23,42,0.054),0_11px_27px_-16px_rgba(15,23,42,0.36)]",
            )}
          />
          {draft ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setDraft("")
                onQueryChange("")
              }}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-neutral-400 outline-none hover:text-neutral-700 sm:right-4"
            >
              <svg aria-hidden viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </form>
      </div>
    </section>
  )
}

/**
 * The row: the category's own pill, which opens the whole category list, then
 * "All" and every subcategory, all in one line that scrolls sideways under a
 * fade (Explore's row, for Explore's reasons). The Filters button sits beside
 * it.
 *
 * THE CATEGORY'S PILL COMES FIRST, where Explore's More comes last. Explore's
 * row fits a computer screen; a category's eight subcategories do not, so a
 * pill at the end of this one was off the edge at every width, and the only
 * way to another category was the back link. First, it is always on screen,
 * and it reads as what it is: "Design", then what Design holds.
 *
 * The pill that is on is brought into view: at once on arrival, in a layout
 * effect, so a page opened on the last subcategory does not paint the row at
 * its start and then jump; smoothly when it changes after that. The loading
 * screen draws this same row, so it scrolls to the same place.
 */
export function CategoryControls({
  info,
  sub,
  onPick,
  picker,
  filters,
}: {
  info: CategoryInfo
  sub: string | null
  /** A subcategory id, or null for All. Absent on the loading screen. */
  onPick?: (sub: string | null) => void
  /** The category's pill, which the page wires to the category list. */
  picker: React.ReactNode
  filters: React.ReactNode
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const arrived = useRef(false)
  const live = !!onPick

  useLayoutEffect(() => {
    const track = trackRef.current
    const on = track?.querySelector<HTMLElement>('[aria-pressed="true"]')
    const first = !arrived.current
    arrived.current = true
    if (!track || !on) return
    const t = track.getBoundingClientRect()
    const m = on.getBoundingClientRect()
    const behavior: ScrollBehavior = first ? "auto" : "smooth"
    if (m.right > t.right - 20) track.scrollBy({ left: m.right - t.right + 24, behavior })
    else if (m.left < t.left + 8) track.scrollBy({ left: m.left - t.left - 12, behavior })
  }, [sub])

  const pill = (id: string | null, label: string) => {
    const on = sub === id
    const cls = cn(PILL, on ? PILL_ON : PILL_OFF, live && PILL_LIVE, live && !on && PILL_HOVER)
    return live ? (
      <button key={id ?? "*"} type="button" aria-pressed={on} data-sub-pill={id ?? "all"} onClick={() => onPick!(id)} className={cls}>
        {label}
      </button>
    ) : (
      <span key={id ?? "*"} aria-pressed={on} data-sub-pill={id ?? "all"} className={cls}>
        {label}
      </span>
    )
  }

  return (
    <div className="mb-6 flex flex-col gap-4" data-category-controls="">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* pr-5 is the fade's own width, so a row scrolled to its end shows its last pill whole. */}
        <div
          ref={trackRef}
          data-category-track=""
          className="-mx-1 min-w-0 flex-1 overflow-x-auto py-0.5 pl-1 pr-5 scrollbar-hide [mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-20px),transparent_100%)]"
        >
          <div data-category-pills-row="" className="mx-auto flex w-max items-center gap-2">
            {picker}
            {pill(null, "All")}
            {info.subcategories.map((s) => pill(s.id, s.label))}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">{filters}</div>
      </div>
    </div>
  )
}

/** The picker pill's face, shared by the page and its loading screen: the category's name and a chevron. */
export function PickerPillFace({ label }: { label: string }) {
  return (
    <>
      {label}
      <Chevron dir="down" className="h-3.5 w-3.5 opacity-70" />
    </>
  )
}
