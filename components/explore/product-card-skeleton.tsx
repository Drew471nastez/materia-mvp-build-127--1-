"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Portrait thumbnail — must stay identical to the card's image well or the grid jumps */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        <Skeleton className="absolute inset-0" />
      </div>
      <div className="flex flex-col px-0.5 pt-2.5">
        {/* Price */}
        <Skeleton className="h-[15px] w-14" />
        {/* Title */}
        <Skeleton className="mt-1 h-[13px] w-3/4" />
        {/* Seller */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}
