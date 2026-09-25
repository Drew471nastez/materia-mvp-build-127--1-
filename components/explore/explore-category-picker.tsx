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
 * On a phone it is the shared sheet (components/ui/bottom-sheet.tsx): it
 * follows the finger, a pull or a flick closes it, and it has a fixed height,
 * so drilling into a category or typing a search never moves its top edge.
 *
 * The list inside is the same component in both (./category-browser).
 */

import { useState } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { BrowseSearch, CategoryBrowser, findInGroups, useDesktop, type BrowseGroup } from "./category-browser"

/** The panel's look, shared with the filters panel so the two agree. */
export const PANEL_CLASS =
  "z-[60] flex flex-col overflow-hidden rounded-xl bg-white text-[#1a1a2e] outline-none " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_12px_32px_-8px_rgba(15,23,42,0.18)] " +
  "origin-[var(--radix-popover-content-transform-origin)] " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] duration-150 ease-out"

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

  const show = (next: boolean) => {
    if (next) setQuery("")
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
          <button type="button" data-more-pill="" className={triggerClassName}>
            {children}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-category-panel=""
            align="start"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Categories"
            className={`${PANEL_CLASS} h-[min(460px,calc(100dvh-140px))] w-[320px]`}
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
            <p className="pb-3 text-[17px] font-semibold leading-6 text-[#1a1a2e]">Categories</p>
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
