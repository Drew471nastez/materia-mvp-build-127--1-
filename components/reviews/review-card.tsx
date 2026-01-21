"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

interface ReviewCardProps {
  review: {
    id: string
    rating: number
    content: string
    created_at: string
    buyer?: {
      id: string
      display_name?: string | null
      avatar_url?: string | null
    } | null
  }
  isMobile?: boolean
  textColor?: string
  starColor?: string
  cardBackgroundColor?: string
  cardBorderColor?: string
}

export function ReviewCard({
  review,
  isMobile = false,
  textColor,
  starColor,
  cardBackgroundColor,
  cardBorderColor,
}: ReviewCardProps) {
  const [showVerifiedTooltip, setShowVerifiedTooltip] = useState(false)
  
  const buyerName = review.buyer?.display_name || "Anonymous Customer"
  const buyerInitials = buyerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: isMobile ? "short" : "long",
      day: "numeric",
    })
  }

  // Check if review is "new" (within last 7 days)
  const isNew = () => {
    const reviewDate = new Date(review.created_at)
    const now = new Date()
    const diffInDays = (now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24)
    return diffInDays <= 7
  }

  return (
    <div
      className={cn(
        "border-b last:border-0",
        isMobile ? "py-4 first:pt-0" : "py-5 first:pt-0"
      )}
      style={{ borderColor: cardBorderColor || "rgb(243, 244, 246)" }}
    >
      <div className={cn("flex gap-3", isMobile ? "items-start" : "items-start gap-4")}>
        {/* Avatar */}
        <Avatar className={cn("shrink-0", isMobile ? "h-10 w-10" : "h-12 w-12")}>
          <AvatarImage src={review.buyer?.avatar_url || undefined} alt={buyerName} />
          <AvatarFallback className={cn(
            "bg-gradient-to-br from-blue-500 to-purple-500 text-white font-semibold",
            isMobile ? "text-xs" : "text-sm"
          )}>
            {buyerInitials}
          </AvatarFallback>
        </Avatar>

        {/* Review Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name, Verified Badge, New Badge, and Date */}
          <div className={cn(
            "flex items-start justify-between gap-2 mb-1.5",
            isMobile && "flex-wrap"
          )}>
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span
                className={cn(
                  "font-semibold",
                  isMobile ? "text-sm truncate max-w-[120px]" : "truncate"
                )}
                style={{ color: textColor || "#111827" }}
              >
                {buyerName}
              </span>

              {/* Verified Buyer Badge */}
              <div className="relative shrink-0">
                <button
                  className="flex items-center"
                  onMouseEnter={() => setShowVerifiedTooltip(true)}
                  onMouseLeave={() => setShowVerifiedTooltip(false)}
                  onClick={() => setShowVerifiedTooltip(!showVerifiedTooltip)}
                >
                  <div className={cn(
                    "rounded-full bg-blue-500 flex items-center justify-center",
                    isMobile ? "h-3.5 w-3.5" : "h-4 w-4"
                  )}>
                    <svg className={cn("text-white", isMobile ? "h-2 w-2" : "h-2.5 w-2.5")} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>

                {/* Tooltip */}
                {showVerifiedTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50">
                    Verified Buyer
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>

              {/* New Badge */}
              {isNew() && (
                <span className={cn(
                  "inline-flex items-center rounded font-medium bg-gray-100 text-gray-600 shrink-0",
                  isMobile ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
                )}>
                  New
                </span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0",
                isMobile ? "text-[10px]" : "text-xs"
              )}
              style={{ color: textColor ? `${textColor}99` : "rgb(107, 114, 128)" }}
            >
              {formatDate(review.created_at)}
            </span>
          </div>

          {/* Star Rating */}
          <div className={cn("flex items-center gap-0.5", isMobile ? "mb-2" : "mb-3")}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")}
                style={{
                  color: star <= review.rating
                    ? (starColor || "#000000")
                    : (starColor ? `${starColor}40` : "rgb(209, 213, 219)"),
                  fill: star <= review.rating ? "currentColor" : "none",
                }}
              />
            ))}
          </div>

          {/* Review Text */}
          <p
            className={cn(
              "leading-relaxed whitespace-pre-wrap",
              isMobile ? "text-sm" : "text-sm"
            )}
            style={{ color: textColor ? `${textColor}cc` : "rgb(55, 65, 81)" }}
          >
            {review.content}
          </p>
        </div>
      </div>
    </div>
  )
}
