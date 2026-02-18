"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Star, Loader2, LogIn, CheckCircle, Lock, UserPlus, MessageSquare } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface ReviewFormProps {
  productId: string
  productTitle: string
  orderId?: string
  isLoggedIn: boolean
  hasPurchased: boolean
  hasReviewed: boolean
  existingReview?: {
    rating: number
    content: string
    created_at: string
  } | null
  onSuccess?: () => void
  redirectUrl?: string
  creatorAvatarUrl?: string | null
  creatorName?: string
}

const PENDING_REVIEW_PREFIX = "storelib_pending_review_v1"

export function ReviewForm({
  productId,
  productTitle,
  orderId,
  isLoggedIn,
  hasPurchased,
  hasReviewed,
  existingReview,
  onSuccess,
  redirectUrl,
  creatorAvatarUrl,
  creatorName,
}: ReviewFormProps) {
  const storageKey = useMemo(() => `${PENDING_REVIEW_PREFIX}:${productId}`, [productId])

  const [rating, setRating] = useState(existingReview?.rating || 0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [content, setContent] = useState(existingReview?.content || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)

  // ✅ Restore pending review after login redirect (and clean it up)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isLoggedIn) return

    try {
      const params = new URLSearchParams(window.location.search)
      const pendingFlag = params.get("pendingReview") === "true"

      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return

      const parsed = JSON.parse(raw) as { rating?: number; content?: string; ts?: number } | null
      if (!parsed) return

      // If they came back via the login redirect OR we simply have stored draft, restore it.
      if (pendingFlag || (parsed.rating || parsed.content)) {
        if (typeof parsed.rating === "number") setRating(parsed.rating)
        if (typeof parsed.content === "string") setContent(parsed.content)

        // remove query param so refresh doesn't keep it
        if (pendingFlag) {
          params.delete("pendingReview")
          const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`
          window.history.replaceState({}, "", next)
        }

        // We keep the stored draft for a little while in case they navigate away,
        // BUT if they already restored it once and start editing, it's fine either way.
        // Here we keep it; we only clear it on successful submit.
      }
    } catch {
      // ignore
    }
  }, [isLoggedIn, storageKey])

  // ✅ If not logged in, persist what they typed as they type (so it survives login)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isLoggedIn) return
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          rating,
          content,
          ts: Date.now(),
        }),
      )
    } catch {
      // ignore
    }
  }, [rating, content, isLoggedIn, storageKey])

  const clearPending = () => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }

  const handleSubmit = async () => {
    // Gate: must have purchased
    if (!hasPurchased) {
      setError("Only verified buyers can leave a review for this product.")
      return
    }

    if (!isLoggedIn) {
      // Store pending review and redirect to login
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            rating,
            content,
            ts: Date.now(),
          }),
        )
      } catch {
        // ignore
      }

      // Use relative path to ensure redirects work on the canonical domain
      const currentUrl = redirectUrl || window.location.pathname
      const url = `/login?redirect=${encodeURIComponent(currentUrl)}&pendingReview=true`
      window.location.href = url
      return
    }

    if (rating === 0) {
      setError("Please select a star rating")
      return
    }

    if (content.trim().length < 10) {
      setError("Please write at least 10 characters")
      return
    }

    setIsSubmitting(true)
    setError("")

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          content: content.trim(),
          orderId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to submit review")
        return
      }

      setIsSubmitted(true)
      clearPending()
      onSuccess?.()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Already reviewed state
  if (hasReviewed || isSubmitted) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-100 p-5 text-center">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">Thank you for your review!</h3>
        <p className="text-sm text-gray-600">Your feedback helps other customers make informed decisions.</p>

        {existingReview && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <div className="flex justify-center gap-0.5 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    "h-4 w-4",
                    star <= existingReview.rating ? "fill-black text-black" : "text-gray-300",
                  )}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600 italic">"{existingReview.content}"</p>
          </div>
        )}
      </div>
    )
  }

  // Not purchased state (still show UI but locked, cleaner than silently failing)
  if (!hasPurchased) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-gray-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Reviews are for verified buyers</h3>
            <p className="text-sm text-gray-600 mt-1">
              Once you purchase <span className="font-medium">{productTitle}</span>, you’ll be able to leave a review here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 space-y-4">
      {/* Overlapping circles: seller avatar + review icon */}
      {creatorAvatarUrl !== undefined && (
        <div className="flex justify-center mb-1">
          <div className="relative flex items-center">
            {/* Seller avatar circle */}
            <div className="relative z-10 h-14 w-14 rounded-full overflow-hidden border-2 border-white bg-gray-100">
              {creatorAvatarUrl ? (
                <Image src={creatorAvatarUrl} alt={creatorName || "Creator"} width={56} height={56} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600 text-base font-bold">
                  {(creatorName || "S").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {/* Review icon — overlapping 10% of avatar */}
            <div className="relative z-20 -ml-2.5 h-10 w-10 rounded-lg bg-[#7c3aed] border-2 border-white flex items-center justify-center shadow-sm">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <h3 className="font-semibold text-gray-900 text-lg">Leave a review</h3>
        <p className="text-sm text-gray-500 mt-1">Share your experience with {productTitle}</p>
      </div>

      {/* Star Rating — wrap in single container for smooth hover */}
      <div
        className="flex justify-center gap-1"
        onMouseLeave={() => setHoveredRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => {
              setError("")
              setRating(star)
            }}
            onMouseEnter={() => setHoveredRating(star)}
            className="p-1 transition-transform hover:scale-110 focus:outline-none"
            aria-label={`${star} star`}
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors duration-150",
                (hoveredRating || rating) >= star
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300",
              )}
            />
          </button>
        ))}
      </div>

      {/* Review Text */}
      <Textarea
        value={content}
        onChange={(e) => {
          setError("")
          setContent(e.target.value)
        }}
        placeholder="Tell others what you think about this product..."
        className="min-h-[100px] resize-none rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
        maxLength={1000}
      />

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{content.length}/1000 characters</span>
        <span>Min 10 characters</span>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Submit Button */}
      {isLoggedIn ? (
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || rating === 0 || content.trim().length < 10}
          className="w-full h-11 rounded-xl font-medium bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Posting...
            </>
          ) : (
            "Post Review"
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-center text-gray-600 font-medium">Sign in to post your review</p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                // Store pending review before redirect
                try {
                  window.localStorage.setItem(
                    storageKey,
                    JSON.stringify({ rating, content, ts: Date.now() })
                  )
                } catch { /* ignore */ }
                const currentUrl = redirectUrl || window.location.pathname
                window.location.href = `/login?redirect=${encodeURIComponent(currentUrl)}&pendingReview=true`
              }}
              variant="outline"
              className="flex-1 h-11 rounded-xl font-medium"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Login
            </Button>
            <Button
              onClick={() => {
                // Store pending review before redirect
                try {
                  window.localStorage.setItem(
                    storageKey,
                    JSON.stringify({ rating, content, ts: Date.now() })
                  )
                } catch { /* ignore */ }
                const currentUrl = redirectUrl || window.location.pathname
                window.location.href = `/signup?redirect=${encodeURIComponent(currentUrl)}&pendingReview=true`
              }}
              className="flex-1 h-11 rounded-xl font-medium bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Sign up
            </Button>
          </div>
          <p className="text-xs text-center text-gray-500">Your review will be saved and restored after you sign in.</p>
        </div>
      )}
    </div>
  )
}
