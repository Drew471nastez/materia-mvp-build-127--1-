"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Star, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The review card on the receipt (app/receipt/[token]/receipt-view.tsx).
 *
 * The buyer's own photo heads it, or their initial on a neutral circle: it
 * is their review, so it is their face, not the seller's. The stars fill as
 * the pointer moves over them and stay filled on a press, with a small give
 * on the one pressed, and the word under them says what the number means.
 *
 * Posting goes to /api/reviews, which decides again who may review (bought
 * it, still has it, not the seller, not twice). Whatever it refuses with is
 * shown here in its own words.
 *
 * A guest can write the review before signing in: what they typed is kept
 * in this browser and put back when they return signed in.
 */

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
  /** The person writing: their name and photo, when signed in. */
  reviewerName?: string | null
  reviewerAvatarUrl?: string | null
  /** Where Sign in and Create account go. The receipt's own links keep the order with the account. */
  loginHref?: string
  signupHref?: string
}

const PENDING_REVIEW_PREFIX = "storelib_pending_review_v1"
const MIN_CHARS = 10
const MAX_CHARS = 1000
const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"]

const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
const PRIMARY =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,box-shadow,translate,opacity] duration-150 hover:bg-[#262640] active:translate-y-px active:bg-[#12121f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] disabled:cursor-default disabled:border-[#e4e7ec] disabled:bg-[#eceef1] disabled:text-[#9ca3af] disabled:shadow-none disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2"
const GREY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] transition-[background-color,box-shadow,translate] duration-150 hover:bg-[#eceef1] active:translate-y-px active:bg-[#e7e9ed] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2"

function ReviewerMark({ name, avatarUrl }: { name: string | null | undefined; avatarUrl: string | null | undefined }) {
  const [broken, setBroken] = useState(false)
  const initial = ((name ?? "").trim().charAt(0) || "·").toUpperCase()
  return (
    <span
      data-reviewer=""
      className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#eef0f3] text-[17px] font-semibold text-[#4b5563] ring-4 ring-[#f5f6f8]"
    >
      {avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </span>
  )
}

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
  reviewerName,
  reviewerAvatarUrl,
  loginHref,
  signupHref,
}: ReviewFormProps) {
  const storageKey = useMemo(() => `${PENDING_REVIEW_PREFIX}:${productId}`, [productId])

  const [rating, setRating] = useState(existingReview?.rating || 0)
  const [hovered, setHovered] = useState(0)
  const [popped, setPopped] = useState(0)
  const [content, setContent] = useState(existingReview?.content || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState<{ rating: number; content: string } | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Put back a review written before signing in, then drop the flag from the address. */
  useEffect(() => {
    if (typeof window === "undefined" || !isLoggedIn) return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { rating?: number; content?: string } | null
      if (!parsed) return
      if (typeof parsed.rating === "number" && parsed.rating >= 1 && parsed.rating <= 5) setRating(parsed.rating)
      if (typeof parsed.content === "string") setContent(parsed.content.slice(0, MAX_CHARS))
      const params = new URLSearchParams(window.location.search)
      if (params.get("pendingReview") === "true") {
        params.delete("pendingReview")
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`
        window.history.replaceState({}, "", next)
      }
    } catch {
      /* private mode, or a draft that is not JSON: start empty */
    }
  }, [isLoggedIn, storageKey])

  /* A guest's draft is kept as they type, so it survives signing in. */
  useEffect(() => {
    if (typeof window === "undefined" || isLoggedIn) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ rating, content, ts: Date.now() }))
    } catch {
      /* nothing to keep it in */
    }
  }, [rating, content, isLoggedIn, storageKey])

  useEffect(
    () => () => {
      if (popTimer.current) clearTimeout(popTimer.current)
    },
    [],
  )

  const choose = (star: number) => {
    setError("")
    setRating(star)
    setPopped(star)
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopped(0), 180)
  }

  const goSignIn = (href: string | undefined, fallback: "/login" | "/signup") => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ rating, content, ts: Date.now() }))
    } catch {
      /* the draft is lost, the sign in still works */
    }
    const back = redirectUrl || window.location.pathname
    const target = href || `${fallback}?redirect=${encodeURIComponent(back)}`
    window.location.href = `${target}${target.includes("?") ? "&" : "?"}pendingReview=true`
  }

  const trimmed = content.trim()
  const ready = rating > 0 && trimmed.length >= MIN_CHARS

  const handleSubmit = async () => {
    if (!hasPurchased) {
      setError("Only buyers can review this product.")
      return
    }
    if (!isLoggedIn) {
      goSignIn(loginHref, "/login")
      return
    }
    if (rating === 0) {
      setError("Choose a star rating.")
      return
    }
    if (trimmed.length < MIN_CHARS) {
      setError(`Write at least ${MIN_CHARS} characters.`)
      return
    }

    setIsSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, content: trimmed, orderId }),
      })
      const data = await res.json().catch(() => ({}) as Record<string, any>)
      if (!res.ok) {
        setError(
          data.error ||
            (res.status === 401 ? "Your session ended. Sign in again to post." : "The review did not save. Try again."),
        )
        return
      }
      setSubmitted({ rating, content: trimmed })
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* nothing kept */
      }
      onSuccess?.()
    } catch {
      setError("No connection. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  /* Posted now, or on an earlier visit. */
  const shown = submitted ?? (hasReviewed ? existingReview ?? null : null)
  if (submitted || hasReviewed) {
    return (
      <div className={cn(CARD, "px-5 py-6 text-center sm:px-6")}>
        <div className="flex justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
            <Check className="h-5 w-5" strokeWidth={2.25} />
          </span>
        </div>
        <h3 className="mt-3 text-[16px] font-semibold text-[#1a1a2e]">Thanks for your review</h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">Other buyers of {productTitle} can read it now.</p>
        {shown ? (
          <div className="mt-4 border-t border-[#eef0f3] pt-4">
            <div className="flex justify-center gap-0.5" aria-label={`${shown.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  aria-hidden
                  className={cn("h-4 w-4", star <= shown.rating ? "fill-[#f5a524] text-[#f5a524]" : "fill-[#e5e7eb] text-[#e5e7eb]")}
                />
              ))}
            </div>
            <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-[#4b5563] [overflow-wrap:anywhere]">{shown.content}</p>
          </div>
        ) : null}
      </div>
    )
  }

  if (!hasPurchased) {
    return (
      <div className={cn(CARD, "px-5 py-4")}>
        <p className="text-[14px] text-[#6b7280]">Reviews for {productTitle} are written by its buyers.</p>
      </div>
    )
  }

  const lit = hovered || rating
  const word = WORDS[lit] ?? ""

  return (
    <div className={cn(CARD, "px-5 py-6 sm:px-6")}>
      <div className="flex flex-col items-center text-center">
        <ReviewerMark name={reviewerName} avatarUrl={isLoggedIn ? reviewerAvatarUrl : null} />
        <h3 className="mt-3 text-[17px] font-semibold text-[#1a1a2e]">Leave a review</h3>
        <p className="mt-1 max-w-[40ch] text-[14px] text-[#6b7280]">How was {productTitle}?</p>
      </div>

      <div role="radiogroup" aria-label="Rating" className="mt-4 flex justify-center gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const on = lit >= star
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} ${star === 1 ? "star" : "stars"}, ${WORDS[star]}`}
              data-star=""
              data-lit={on ? "true" : "false"}
              onClick={() => choose(star)}
              onMouseEnter={() => setHovered(star)}
              className="group flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
            >
              <Star
                aria-hidden
                strokeWidth={1.75}
                className={cn(
                  "h-8 w-8 transition-[scale,color,fill] duration-150 ease-out",
                  on ? "fill-[#f5a524] text-[#f5a524]" : "fill-transparent text-[#d0d5dd]",
                  popped === star ? "scale-[1.18]" : "scale-100 group-hover:scale-110 group-active:scale-95",
                )}
              />
            </button>
          )
        })}
      </div>
      <p className="mt-1 h-5 text-center text-[13px] font-medium text-[#4b5563]" aria-live="polite">
        {word}
      </p>

      <label htmlFor={`review-text-${productId}`} className="sr-only">
        Your review
      </label>
      <textarea
        id={`review-text-${productId}`}
        value={content}
        onChange={(e) => {
          setError("")
          setContent(e.target.value.slice(0, MAX_CHARS))
        }}
        placeholder="What did you like? What could be better?"
        maxLength={MAX_CHARS}
        rows={4}
        className="mt-2 block min-h-[104px] w-full resize-none rounded-xl border border-[#e4e7ec] bg-white px-3.5 py-3 text-[16px] leading-relaxed text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[15px]"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] tabular-nums text-[#9ca3af]">
        <span>{trimmed.length > 0 && trimmed.length < MIN_CHARS ? `${MIN_CHARS - trimmed.length} more to go` : ""}</span>
        <span>
          {content.length} / {MAX_CHARS}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {isLoggedIn ? (
          <button type="button" onClick={handleSubmit} disabled={isSubmitting || !ready} className={PRIMARY}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Posting
              </>
            ) : (
              "Post review"
            )}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => goSignIn(loginHref, "/login")} className={cn(GREY, "w-full")}>
              Sign in to post
            </button>
            <p className="mt-2.5 text-center text-[12px] text-[#6b7280]">
              What you wrote is kept. No account yet?{" "}
              <button
                type="button"
                onClick={() => goSignIn(signupHref, "/signup")}
                className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 hover:decoration-[#1a1a2e]"
              >
                Create one
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
