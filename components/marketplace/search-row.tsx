"use client"

import { Search } from "lucide-react"
import { AnimatedSearchPlaceholder } from "@/components/explore/animated-search-placeholder"
import { useLocale } from "@/components/locale-provider"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * The shared atoms of the mobile search strip. Two surfaces render this row —
 * the home feed's own header (MobileFeed) and the everywhere-else bar
 * (GlobalMobileTopBar) — and their hand-built copies drifted once already.
 *
 * Only what is genuinely identical on both surfaces lives here: the search
 * trigger and the light-on-white category pill rail. Everything around them is
 * deliberately NOT here — the view switcher, the filter/clear circle and the
 * hide-on-scroll transform belong to the feed's own state, and the reels
 * overlay's dark blurred pills are a different design, not a variant of this
 * one.
 */

/**
 * The inline search field. It is a trigger, never typed into — tapping it opens
 * the full-screen search overlay, so this is a button wearing an input's
 * clothes. `query` is the active search, shown in place of the animated
 * placeholder so a filtered feed never looks like an empty search box.
 */
export function SearchTrigger({ query, onOpen }: { query?: string; onOpen: () => void }) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      onClick={() => {
        // Opening search is a real action with a real result, so it gets the
        // same buzz a listing tap does. Safe on a plain onClick — a button is
        // not a scroll surface.
        void triggerHaptic("light")
        onOpen()
      }}
      aria-label={t("mfeed.search_placeholder")}
      className="relative flex-1 h-11 rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-10 text-left transition-transform active:scale-[0.99]"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      {query ? (
        <span className="absolute left-10 right-10 top-1/2 -translate-y-1/2 truncate text-sm font-medium text-neutral-900">
          {query}
        </span>
      ) : (
        <AnimatedSearchPlaceholder
          active
          prefix={`${t("mfeed.search_for")} `}
          quoted
          className="absolute left-10 right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
        />
      )}
    </button>
  )
}

/**
 * The horizontally scrolling category pills. `activeId` is optional because the
 * global bar has no category state of its own — it forwards every tap to the
 * feed via the URL, so none of its pills is ever the selected one.
 */
export function CategoryPillRail({
  activeId,
  onSelect,
}: {
  activeId?: string
  onSelect: (id: string) => void
}) {
  const { t } = useLocale()
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-3 pb-3" style={{ scrollbarWidth: "none" }}>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95",
            activeId === c.id
              ? "bg-neutral-900 text-white shadow-sm"
              : "bg-neutral-100 text-neutral-700 active:bg-neutral-200",
          )}
        >
          {t(`category.${c.id}`)}
        </button>
      ))}
    </div>
  )
}
