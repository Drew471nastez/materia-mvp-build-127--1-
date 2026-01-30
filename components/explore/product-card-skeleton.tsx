"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      {/* Thumbnail skeleton */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        <Skeleton className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        {/* Seller info skeleton */}
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
        {/* Title and badge skeleton */}
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* Price skeleton */}
        <div className="mt-auto pt-4">
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  )
}
