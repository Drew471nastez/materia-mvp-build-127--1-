"use client"

/**
 * ===========================================================================
 *  THE CATEGORIES ICON AT THE RIGHT END OF A SEARCH FIELD
 * ===========================================================================
 * It said "Categories" with a chevron; the owner asked for the icon alone.
 * The icon is Explore's own (./categories-icon: two staggered rows of chips,
 * round 10, in place of the generic four square grid), it is named
 * "Categories" for a screen reader, and on a computer the word appears under
 * it on hover and keyboard focus.
 *
 * The same control sits in Explore's hero field and in the header's field
 * once the hero has scrolled away, opening the same browser
 * (./explore-category-picker: a panel under it on a computer, the shared
 * sheet on a phone) and doing the page's pick. `size` is the field it sits
 * in: 40px on a phone and 44 on a computer in the hero (a thumb's size inside
 * a 52 / 62px field), 36px in the header's 44px field.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { SearchCategories } from "@/lib/explore/search-categories"
import { ExploreCategoryPicker } from "./explore-category-picker"
import { CategoriesIcon } from "./categories-icon"

export const CATEGORIES_LABEL = "Categories"

export function SearchCategoriesButton({
  categories,
  size,
}: {
  categories: SearchCategories
  size: "hero" | "header"
}) {
  const [open, setOpen] = useState(false)
  return (
    <ExploreCategoryPicker
      open={open}
      onOpenChange={setOpen}
      groups={categories.groups}
      selectedGroup={categories.selectedGroup}
      selectedItem={categories.selectedItem}
      allRow={categories.allRow}
      onPick={categories.onPick}
      align="end"
      marker={size === "hero" ? "search-categories" : "header-search-categories"}
      triggerLabel={CATEGORIES_LABEL}
      tooltip={CATEGORIES_LABEL}
      triggerClassName={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[8px] cursor-pointer select-none",
        size === "hero" ? "h-10 w-10 sm:h-11 sm:w-11" : "h-9 w-9",
        "outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]",
        open ? "bg-neutral-100 text-[#1a1a2e]" : "text-neutral-500 hover:bg-neutral-100/80 hover:text-[#1a1a2e] active:bg-neutral-100",
      )}
    >
      <CategoriesIcon aria-hidden className={size === "hero" ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={1.8} />
    </ExploreCategoryPicker>
  )
}
