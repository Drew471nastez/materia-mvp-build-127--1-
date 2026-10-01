"use client"

/**
 * ===========================================================================
 *  THE MORE PILL AND WHAT IT OPENS
 * ===========================================================================
 * It opened a centred modal on a computer and a sheet of its own on a phone,
 * both a list of line icons whose rows grew accordions. The owner did not
 * like the look, the icons or the way it appeared.
 *
 * On a computer it is a panel hanging from the pill, the way a menu does:
 * no scrim over the catalogue, a search on top, the categories under it, and
 * a category with subcategories slides into its own level. Escape or a click
 * anywhere else closes it; focus goes into the search and comes back to the
 * pill.
 *
 * A POPOVER THAT KNOWS WHERE IT IS. "On a large screen it opens as a panel
 * that seems to hang from the top of the page, overlapping the black header,
 * with its own scrollbar." It was 460px tall whatever the window, so with the
 * pill low on the screen it fitted neither under it nor over it; Radix put it
 * over, and 460px over a pill 450px down the window runs up under the sticky
 * header and off the top. Now, on open and on every resize while open:
 *
 *   it goes under the pill when there is a comfortable panel's worth of room
 *   there (PANEL_MIN), and over it only when there is not and there is more
 *   room above;
 *
 *   it is never taller than the room on that side, counted from the bottom
 *   of the sticky header rather than the top of the window, and Radix's
 *   available height keeps that true while the page scrolls under it;
 *
 *   its list scrolls inside it, with a thin scrollbar and no track.
 *
 * It opens and closes by opacity with 4px of travel from the pill and a hair
 * of scale, from the pill's corner (Radix's transform origin), 160ms in and
 * 120ms out.
 *
 * On a phone it is the shared sheet (components/ui/bottom-sheet.tsx): it
 * follows the finger, a pull or a flick closes it, and it has a fixed height,
 * so drilling into a category or typing a search never moves its top edge.
 *
 * The list inside is the same component in both (./category-browser).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { BrowseSearch, CategoryBrowser, findInGroups, useDesktop, type BrowseGroup } from "./category-browser"

/** The panel's look, shared with the filters panel so the two agree. */
export const PANEL_CLASS =
  "z-[60] flex flex-col overflow-hidden rounded-xl bg-white text-[#1a1a2e] outline-none " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_12px_32px_-8px_rgba(15,23,42,0.18)] " +
  "origin-[var(--radix-popover-content-transform-origin)] " +
  /* In from the pill: 4px of travel toward the side it opens on, a hair of scale, a fade. */
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-[160ms] data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "data-[side=bottom]:data-[state=open]:slide-in-from-top-1 data-[side=top]:data-[state=open]:slide-in-from-bottom-1 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=closed]:duration-[120ms] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)] " +
  "data-[side=bottom]:data-[state=closed]:slide-out-to-top-1 data-[side=top]:data-[state=closed]:slide-out-to-bottom-1"

/** The tallest the More panel gets, and the room under the pill that is enough to open there. */
const PANEL_MAX = 440
const PANEL_MIN = 300
/** The gap between the pill and the panel, and between the panel and a window edge or the header. */
const GAP = 8
const EDGE = 16

/** How far down the window the sticky header reaches, or 0 when it has scrolled away. */
function headerBottom() {
  const el = document.getElementById("platform-header-root")
  if (!el) return 0
  const b = el.getBoundingClientRect().bottom
  return b > 0 ? b : 0
}

type Placement = { side: "top" | "bottom"; height: number; top: number }

/** Under the pill when there is room for PANEL_MIN there, over it when there is more room above. */
function place(pill: Element): Placement {
  const r = pill.getBoundingClientRect()
  const top = headerBottom() + GAP
  const below = window.innerHeight - r.bottom - GAP - EDGE
  const above = r.top - GAP - top
  const side = below >= PANEL_MIN || below >= above ? "bottom" : "top"
  const room = side === "bottom" ? below : above
  return { side, height: Math.max(160, Math.min(PANEL_MAX, Math.floor(room))), top }
}

export function ExploreCategoryPicker({
  open,
  onOpenChange,
  groups,
  selectedGroup,
  selectedItem,
  onPick,
  allRow,
  triggerClassName,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly BrowseGroup[]
  selectedGroup: string | null
  selectedItem: string | null
  onPick: (groupId: string, itemId: string | null) => void
  allRow?: { id: string; label: string }
  triggerClassName: string
  /** What the pill says. */
  children: React.ReactNode
}) {
  const desktop = useDesktop()
  const [query, setQuery] = useState("")
  const pillRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<Placement>({ side: "bottom", height: PANEL_MAX, top: EDGE })
  const measure = useCallback(() => {
    if (pillRef.current) setPlacement(place(pillRef.current))
  }, [])
  /* Placed again when the window changes size while it is open. */
  useEffect(() => {
    if (!open || !desktop) return
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [open, desktop, measure])

  const show = (next: boolean) => {
    if (next) {
      setQuery("")
      /* Placed before the first frame it is drawn in, so it never opens in the wrong place. */
      if (desktop) measure()
    }
    onOpenChange(next)
  }
  const pick = (groupId: string, itemId: string | null) => {
    if (!desktop) hapticTap("soft")
    onOpenChange(false)
    onPick(groupId, itemId)
  }

  const browser = (phone: boolean) => (
    <CategoryBrowser
      groups={groups}
      selectedGroup={selectedGroup}
      selectedItem={selectedItem}
      onPick={pick}
      phone={phone}
      search
      searchInHeader={phone}
      query={query}
      onQueryChange={setQuery}
      allRow={allRow}
      autoFocusSearch={!phone}
    />
  )

  if (desktop) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={show}>
        <PopoverPrimitive.Trigger asChild>
          <button ref={pillRef} type="button" data-more-pill="" className={triggerClassName}>
            {children}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-category-panel=""
            align="start"
            side={placement.side}
            sideOffset={GAP}
            /* The header is a wall: the panel is kept below it, and its height counts from there. */
            collisionPadding={{ top: placement.top, bottom: EDGE, left: EDGE, right: EDGE }}
            aria-label="Categories"
            className={`${PANEL_CLASS} w-[320px]`}
            style={{ height: `min(${placement.height}px, var(--radix-popover-content-available-height, ${placement.height}px))` }}
          >
            {browser(false)}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }

  return (
    <>
      <button type="button" data-more-pill="" aria-haspopup="dialog" aria-expanded={open} onClick={() => show(true)} className={triggerClassName}>
        {children}
      </button>
      <BottomSheet
        isOpen={open}
        onClose={() => onOpenChange(false)}
        label="Categories"
        hideFrom="md"
        fill
        aboveKeyboard
        height="min(78dvh, 680px)"
        maxHeight="min(78dvh, 680px)"
        header={
          <div data-category-sheet="" className="px-4 pb-2 pt-2">
            <p className="pb-3 text-[17px] font-medium leading-6 text-[#1a1a2e]">Categories</p>
            <BrowseSearch
              value={query}
              onChange={setQuery}
              phone
              onEnter={() => {
                const first = findInGroups(groups, query)[0]
                if (first) pick(first.group.id, first.item?.id ?? null)
              }}
            />
          </div>
        }
      >
        {browser(true)}
      </BottomSheet>
    </>
  )
}
