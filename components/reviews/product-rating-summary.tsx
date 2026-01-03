"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProductRatingSummaryProps {
  reviewsCount: number
  reviewsAverage: number
  size?: "sm" | "md" | "lg"
  showText?: boolean
  className?: string
}

export function ProductRatingSummary({
  reviewsCount,
  reviewsAverage,
  size = "md",
  showText = true,
  className,
}: ProductRatingSummaryProps) {
  if (reviewsCount === 0) return null

  const starSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              starSizes[size],
              star <= Math.round(reviewsAverage) ? "fill-black text-black" : "text-gray-300",
            )}
          />
        ))}
      </div>
      {showText && (
        <span className={cn("text-muted-foreground", textSizes[size])}>
          {reviewsCount} {reviewsCount === 1 ? "review" : "reviews"}
        </span>
      )}
    </div>
  )
}
