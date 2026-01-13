"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface ReviewsRatingBreakdownProps {
  reviewsCount: number
  reviewsAverage: number
  starBreakdown: {
    5: number
    4: number
    3: number
    2: number
    1: number
  }
  className?: string
  isMobile?: boolean
}

export function ReviewsRatingBreakdown({
  reviewsCount,
  reviewsAverage,
  starBreakdown,
  className,
  isMobile = false,
}: ReviewsRatingBreakdownProps) {
  if (reviewsCount === 0) return null

  const calculatePercentage = (count: number) => {
    return reviewsCount > 0 ? Math.round((count / reviewsCount) * 100) : 0
  }

  return (
    <div className={cn(
      "rounded-xl border border-gray-200 bg-white",
      isMobile ? "p-4" : "p-6 sm:p-8",
      className
    )}>
      <div className={cn(
        "flex gap-4",
        isMobile ? "flex-row items-start" : "flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8"
      )}>
        {/* Overall Rating Display */}
        <div className={cn(
          "flex flex-col shrink-0",
          isMobile ? "items-start min-w-[80px]" : "items-center sm:items-start"
        )}>
          <div className={cn(
            "font-bold text-gray-900 mb-1",
            isMobile ? "text-4xl" : "text-5xl sm:text-6xl mb-2"
          )}>
            {reviewsAverage.toFixed(1)}
          </div>
          <div className={cn("flex items-center gap-0.5 mb-1", isMobile ? "mb-1" : "mb-2")}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  isMobile ? "h-3.5 w-3.5" : "h-5 w-5",
                  star <= Math.round(reviewsAverage)
                    ? "fill-black text-black"
                    : "fill-gray-200 text-gray-200",
                )}
              />
            ))}
          </div>
          <div className={cn(
            "text-gray-600 font-medium",
            isMobile ? "text-xs" : "text-sm"
          )}>
            {reviewsCount} {reviewsCount === 1 ? "review" : "reviews"}
          </div>
        </div>

        {/* Progress Bars */}
        <div className={cn("flex-1 w-full", isMobile ? "space-y-1.5" : "space-y-2.5")}>
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = starBreakdown[rating as keyof typeof starBreakdown] || 0
            const percentage = calculatePercentage(count)

            return (
              <div key={rating} className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-1 font-medium text-gray-700 shrink-0",
                  isMobile ? "w-8 text-xs" : "w-14 gap-1.5 text-sm"
                )}>
                  <span>{rating}</span>
                  <Star className={cn(
                    "fill-gray-400 text-gray-400",
                    isMobile ? "h-2.5 w-2.5" : "h-3.5 w-3.5"
                  )} />
                </div>
                <div className={cn(
                  "flex-1 bg-gray-100 rounded-full overflow-hidden",
                  isMobile ? "h-2" : "h-2.5"
                )}>
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className={cn(
                  "text-right font-semibold text-gray-700 shrink-0",
                  isMobile ? "w-9 text-xs" : "w-12 text-sm"
                )}>
                  {percentage}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
