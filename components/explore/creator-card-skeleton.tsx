"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function CreatorCardSkeleton() {
  return (
    <div className="flex flex-col rounded-lg border border-border/60 bg-card p-6">
      <div className="flex items-start gap-4">
        {/* Avatar skeleton */}
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 overflow-hidden">
          {/* Name skeleton */}
          <Skeleton className="h-5 w-32 mb-1" />
          {/* Headline skeleton */}
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      {/* Tags skeleton */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      {/* Product count skeleton */}
      <div className="mt-4">
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  )
}
