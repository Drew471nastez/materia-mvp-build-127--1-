import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

/** Storelib's star: one amber, filled or a quiet grey. The product page passes its theme's colour instead. */
export const STAR_AMBER = "#f5a524"

/** A row of five stars that says the rating to a screen reader once. */
export function Stars({ rating, size = 16, color, className }: { rating: number; size?: number; color?: string; className?: string }) {
  const on = Math.round(Number(rating) || 0)
  const fill = color || STAR_AMBER
  return (
    <span role="img" aria-label={`${on} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          strokeWidth={1.5}
          style={{ width: size, height: size, color: n <= on ? fill : color ? `${color}33` : "#dcdfe4", fill: "currentColor" }}
        />
      ))}
    </span>
  )
}
