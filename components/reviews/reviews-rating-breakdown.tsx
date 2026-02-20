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
  accentColor?: string
  textColor?: string
  starColor?: string
  cardBackgroundColor?: string
  cardBorderColor?: string
}

export function ReviewsRatingBreakdown({
  reviewsCount,
  reviewsAverage,
  starBreakdown,
  className,
  isMobile = false,
  accentColor,
  textColor,
  starColor,
  cardBackgroundColor,
  cardBorderColor,
}: ReviewsRatingBreakdownProps) {
  if (reviewsCount === 0) return null

  const calculatePercentage = (count: number) => {
    return reviewsCount > 0 ? Math.round((count / reviewsCount) * 100) : 0
  }

  return (
    <div
      className={cn(
        "rounded-xl border",
        isMobile ? "p-4" : "p-6 sm:p-8",
        className
      )}
      style={{
        backgroundColor: cardBackgroundColor || "#ffffff",
        borderColor: cardBorderColor || "rgb(229, 231, 235)",
      }}
    >
      <div className={cn(
        "flex gap-4",
        isMobile ? "flex-row items-start" : "flex-col sm:flex-row items-start gap-6 sm:gap-8"
      )}>
        {/* Overall Rating Display */}
        <div className={cn(
          "flex flex-col shrink-0",
          isMobile ? "items-start min-w-[80px]" : "items-start"
        )}>
          <div
            className={cn(
              "font-bold mb-1",
              isMobile ? "text-4xl" : "text-5xl sm:text-6xl mb-2"
            )}
            style={{ color: textColor || "#111827" }}
          >
            {reviewsAverage.toFixed(1)}
          </div>
          <div className={cn("flex items-center gap-0.5 mb-1", isMobile ? "mb-1" : "mb-2")}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(isMobile ? "h-3.5 w-3.5" : "h-5 w-5")}
                style={{
                  color: star <= Math.round(reviewsAverage)
                    ? (starColor || "#000000")
                    : (starColor ? `${starColor}30` : "rgb(229, 231, 235)"),
                  fill: star <= Math.round(reviewsAverage) ? "currentColor" : "currentColor",
                }}
              />
            ))}
          </div>
          <div
            className={cn(
              "font-medium",
              isMobile ? "text-xs" : "text-sm"
            )}
            style={{ color: textColor ? `${textColor}cc` : "rgb(75, 85, 99)" }}
          >
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
                <div
                  className={cn(
                    "flex items-center gap-1 font-medium shrink-0",
                    isMobile ? "w-8 text-xs" : "w-14 gap-1.5 text-sm"
                  )}
                  style={{ color: textColor ? `${textColor}cc` : "rgb(55, 65, 81)" }}
                >
                  <span>{rating}</span>
                  <Star
                    className={cn(isMobile ? "h-2.5 w-2.5" : "h-3.5 w-3.5")}
                    style={{
                      color: starColor ? `${starColor}80` : "rgb(156, 163, 175)",
                      fill: "currentColor",
                    }}
                  />
                </div>
                <div
                  className={cn(
                    "flex-1 rounded-full overflow-hidden",
                    isMobile ? "h-2" : "h-2.5"
                  )}
                  style={{ backgroundColor: cardBorderColor || "rgb(243, 244, 246)" }}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 ease-out",
                      !accentColor && !starColor && "bg-gradient-to-r from-blue-500 to-blue-600"
                    )}
                    style={{
                      width: `${percentage}%`,
                      ...(accentColor && { backgroundColor: accentColor }),
                      ...(!accentColor && starColor && { backgroundColor: starColor }),
                    }}
                  />
                </div>
                <div
                  className={cn(
                    "text-right font-semibold shrink-0",
                    isMobile ? "w-9 text-xs" : "w-12 text-sm"
                  )}
                  style={{ color: textColor ? `${textColor}cc` : "rgb(55, 65, 81)" }}
                >
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
