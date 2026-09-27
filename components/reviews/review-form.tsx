"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Star, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { MAX_REVIEW_CHARS, MIN_REVIEW_CHARS, RATING_WORDS } from "@/lib/reviews/rules"
import { Stars } from "./stars"

/**
 * The buyer's review card: on the receipt (components/reviews/receipt-review)
 * and on the product in their library (components/reviews/library-review).
 *
 * The buyer's own photo heads it, or their initial on a neutral circle: it
 * is their review, so it is their face, not the seller's. The stars fill as
 * the pointer moves over them and stay filled on a press, with a small give
 * on the one pressed, and the word under them says what the number means.
 *
 * WHO CAN POST. A signed in buyer, and anybody holding the receipt link:
 * the token proves the purchase, as it does for the downloads, so the
 * review request email opens a form that posts without an account. Without
 * either, the form keeps what was typed in this browser and asks them to
 * sign in; it is put back when they return.
 *
 * THEIR OWN REVIEW, once posted, is shown with its stars, words and the
 * seller's answer, and they can change it or delete it at any time, as on
 * Etsy and the App Store. A review the seller reported says so.
 *
 * Posting goes to /api/reviews, which decides again who may review (bought
 * it, still has it, not the seller, not twice). Whatever it refuses with is
 * shown here in its own words.
 */

export interface OwnReview {
  id?: string
  rating: number
  content: string
  created_at?: string
  edited_at?: string | null
  hidden?: boolean
  seller_reply?: string | null
  seller_reply_at?: string | null
}

interface ReviewFormProps {
  productId: string
  productTitle: string
  orderId?: string
  /** The order's receipt token: proves the purchase, so no sign in is needed. */
  receiptToken?: string | null
  isLoggedIn: boolean
  hasPurchased: boolean
  hasReviewed: boolean
  existingReview?: OwnReview | null
  /** Stars chosen in the review request email (?rate=4). */
  initialRating?: number | null
  onSuccess?: () => void
  /** Their review as it is now: posted, changed, or null once deleted. */
  onChange?: (review: OwnReview | null) => void
  redirectUrl?: string
  /** The person writing: their name and photo, when known. */
  reviewerName?: string | null
  reviewerAvatarUrl?: string | null
  /** Who answers under the review. */
  sellerName?: string | null
  /** Where Sign in and Create account go. The receipt's own links keep the order with the account. */
  loginHref?: string
  signupHref?: string
}

const PENDING_REVIEW_PREFIX = "storelib_pending_review_v1"

const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
const PRIMARY =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,box-shadow,translate,opacity] duration-150 hover:bg-[#262640] active:translate-y-px active:bg-[#12121f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] disabled:cursor-default disabled:border-[#e4e7ec] disabled:bg-[#eceef1] disabled:text-[#9ca3af] disabled:shadow-none disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2"
const GREY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] transition-[background-color,box-shadow,translate] duration-150 hover:bg-[#eceef1] active:translate-y-px active:bg-[#e7e9ed] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2"
const QUIET =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
const DANGER =
  "inline-flex h-11 flex-1 items-center justify-center rounded-[10px] bg-[#c4290c] px-4 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-[#a82309] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4290c]/30 focus-visible:ring-offset-2"

const shortDate = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/* The shared avatar (components/app/app-avatar): any host loads, a photo that fails becomes the initials. */
function ReviewerMark({ name, avatarUrl }: { name: string | null | undefined; avatarUrl: string | null | undefined }) {
  return (
    <span data-reviewer="" className="inline-flex rounded-full ring-4 ring-[#f5f6f8]">
      <AppAvatar src={avatarUrl} name={(name ?? "").trim() || "?"} alt="" size={48} />
    </span>
  )
}

export function ReviewForm({
  productId,
  productTitle,
  orderId,
  receiptToken,
  isLoggedIn,
  hasPurchased,
  hasReviewed,
  existingReview,
  initialRating,
  onSuccess,
  onChange,
  redirectUrl,
  reviewerName,
  reviewerAvatarUrl,
  sellerName,
  loginHref,
  signupHref,
}: ReviewFormProps) {
  const storageKey = useMemo(() => `${PENDING_REVIEW_PREFIX}:${productId}`, [productId])
  const startRating = initialRating && initialRating >= 1 && initialRating <= 5 ? Math.round(initialRating) : 0

  /* Their review as this card knows it: from the server, then from what they post, change or delete here. */
  const [mine, setMine] = useState<OwnReview | null>(hasReviewed ? existingReview ?? { rating: 0, content: "" } : null)
  const [justPosted, setJustPosted] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rating, setRating] = useState(existingReview?.rating || startRating)
  const [hovered, setHovered] = useState(0)
  const [popped, setPopped] = useState(0)
  const [content, setContent] = useState(existingReview?.content || "")
  const [busy, setBusy] = useState<"" | "post" | "save" | "delete">("")
  const [error, setError] = useState("")
  const [needsAccount, setNeedsAccount] = useState(false)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* The receipt link proves the purchase: no sign in needed to post from it. */
  const canPost = isLoggedIn || (!!receiptToken && !needsAccount)

  /* Put back a review written before signing in, then drop the flag from the address. */
  useEffect(() => {
    if (typeof window === "undefined" || !isLoggedIn) return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { rating?: number; content?: string } | null
      if (!parsed) return
      if (typeof parsed.rating === "number" && parsed.rating >= 1 && parsed.rating <= 5) setRating(parsed.rating)
      if (typeof parsed.content === "string") setContent(parsed.content.slice(0, MAX_REVIEW_CHARS))
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

  /* A draft that cannot be posted here yet is kept as they type, so it survives signing in. */
  useEffect(() => {
    if (typeof window === "undefined" || canPost || mine) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ rating, content, ts: Date.now() }))
    } catch {
      /* nothing to keep it in */
    }
  }, [rating, content, canPost, mine, storageKey])

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
  const ready = rating > 0 && trimmed.length >= MIN_REVIEW_CHARS

  const say = (res: Response, data: Record<string, any>, fallback: string) =>
    setError(data.error || (res.status === 401 ? "Your session ended. Sign in again to post." : fallback))

  const forget = () => {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* nothing kept */
    }
  }

  const handleSubmit = async () => {
    if (!hasPurchased) return setError("Only buyers can review this product.")
    if (!canPost) return goSignIn(loginHref, "/login")
    if (rating === 0) return setError("Choose a star rating.")
    if (trimmed.length < MIN_REVIEW_CHARS) return setError(`Write at least ${MIN_REVIEW_CHARS} characters.`)

    setBusy("post")
    setError("")
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receiptToken ? { productId, rating, content: trimmed, receiptToken } : { productId, rating, content: trimmed, orderId }),
      })
      const data = await res.json().catch(() => ({}) as Record<string, any>)
      if (!res.ok) {
        /* Before the database can hold a guest's review, the account is how. */
        if (data.needsAccount) setNeedsAccount(true)
        return say(res, data, "The review did not save. Try again.")
      }
      const posted: OwnReview = { id: data.review?.id, rating, content: trimmed, created_at: data.review?.created_at ?? new Date().toISOString() }
      setMine(posted)
      setJustPosted(true)
      forget()
      onChange?.(posted)
      onSuccess?.()
    } catch {
      setError("No connection. Try again.")
    } finally {
      setBusy("")
    }
  }

  const handleSave = async () => {
    if (!mine?.id) return
    if (rating === 0) return setError("Choose a star rating.")
    if (trimmed.length < MIN_REVIEW_CHARS) return setError(`Write at least ${MIN_REVIEW_CHARS} characters.`)
    setBusy("save")
    setError("")
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(mine.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, content: trimmed, receiptToken: receiptToken || undefined }),
      })
      const data = await res.json().catch(() => ({}) as Record<string, any>)
      if (!res.ok) return say(res, data, "The change did not save. Try again.")
      const next: OwnReview = { ...mine, rating, content: trimmed, edited_at: data.review?.edited_at ?? new Date().toISOString() }
      setMine(next)
      setEditing(false)
      setJustPosted(false)
      onChange?.(next)
    } catch {
      setError("No connection. Try again.")
    } finally {
      setBusy("")
    }
  }

  const handleDelete = async () => {
    if (!mine?.id) return
    setBusy("delete")
    setError("")
    try {
      const q = receiptToken ? `?receiptToken=${encodeURIComponent(receiptToken)}` : ""
      const res = await fetch(`/api/reviews/${encodeURIComponent(mine.id)}${q}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}) as Record<string, any>)
      if (!res.ok) return say(res, data, "The review was not deleted. Try again.")
      setMine(null)
      setConfirmDelete(false)
      setEditing(false)
      setJustPosted(false)
      setRating(0)
      setContent("")
      onChange?.(null)
    } catch {
      setError("No connection. Try again.")
    } finally {
      setBusy("")
    }
  }

  /* ── Their review ─────────────────────────────────────────────────── */
  if (mine && !editing) {
    const edited = mine.edited_at ? ` · Edited ${shortDate(mine.edited_at)}` : ""
    return (
      <div data-own-review="" className={cn(CARD, "px-5 py-5 sm:px-6")}>
        {justPosted ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
              <Check className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Thanks for your review</h3>
              <p className="text-[13px] text-[#6b7280]">Other buyers of {productTitle} can read it now.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Your review</h3>
            {mine.created_at ? <span className="shrink-0 text-[12px] text-[#9ca3af]">{shortDate(mine.created_at)}{edited}</span> : null}
          </div>
        )}

        {mine.rating > 0 ? (
          <div className={cn("border-[#eef0f3]", justPosted ? "mt-4 border-t pt-4" : "mt-2")}>
            <div className="flex items-center gap-2">
              <Stars rating={mine.rating} size={16} />
              <span className="text-[13px] font-medium text-[#4b5563]">{RATING_WORDS[mine.rating]}</span>
            </div>
            {mine.content ? <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{mine.content}</p> : null}
          </div>
        ) : null}

        {mine.hidden ? (
          <p className="mt-3 rounded-lg bg-[#fffaeb] px-3 py-2 text-[13px] leading-snug text-[#93370d]">
            The seller reported this review, so it is hidden while Storelib looks at it.
          </p>
        ) : null}

        {mine.seller_reply ? (
          <div className="mt-3 border-l-2 border-[#e4e7ec] pl-3">
            <p className="text-[12px] font-medium text-[#6b7280]">
              Reply from {sellerName || "the seller"}
              {mine.seller_reply_at ? <span className="font-normal text-[#9ca3af]"> · {shortDate(mine.seller_reply_at)}</span> : null}
            </p>
            <p className="mt-0.5 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{mine.seller_reply}</p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]">
            {error}
          </p>
        ) : null}

        {mine.id && (canPost || isLoggedIn) ? (
          confirmDelete ? (
            <div className="mt-4 rounded-xl bg-[#f8f9fa] p-3">
              <p className="text-[14px] font-medium text-[#1a1a2e]">Delete your review?</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">It comes off the product page and out of its rating. You can write a new one later.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy === "delete"} className={GREY}>
                  Keep it
                </button>
                <button type="button" onClick={handleDelete} disabled={busy === "delete"} className={DANGER}>
                  {busy === "delete" ? "Deleting" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <div className="-mb-1 -ml-3 mt-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setRating(mine.rating)
                  setContent(mine.content)
                  setError("")
                  setEditing(true)
                }}
                className={QUIET}
              >
                Edit
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} className={QUIET}>
                Delete
              </button>
            </div>
          )
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

  /* ── The form: a new review, or theirs being changed ─────────────── */
  const lit = hovered || rating
  const word = RATING_WORDS[lit] ?? ""

  return (
    <div className={cn(CARD, "px-5 py-6 sm:px-6")}>
      <div className="flex flex-col items-center text-center">
        <ReviewerMark name={reviewerName} avatarUrl={reviewerAvatarUrl} />
        <h3 className="mt-3 text-[17px] font-semibold text-[#1a1a2e]">{editing ? "Edit your review" : "Leave a review"}</h3>
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
              aria-label={`${star} ${star === 1 ? "star" : "stars"}, ${RATING_WORDS[star]}`}
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
          setContent(e.target.value.slice(0, MAX_REVIEW_CHARS))
        }}
        placeholder="What did you like? What could be better?"
        maxLength={MAX_REVIEW_CHARS}
        rows={4}
        className="mt-2 block min-h-[104px] w-full resize-none rounded-xl border border-[#e4e7ec] bg-white px-3.5 py-3 text-[16px] leading-relaxed text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[15px]"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] tabular-nums text-[#9ca3af]">
        <span>{trimmed.length > 0 && trimmed.length < MIN_REVIEW_CHARS ? `${MIN_REVIEW_CHARS - trimmed.length} more to go` : ""}</span>
        <span>
          {content.length} / {MAX_REVIEW_CHARS}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setError("")
              }}
              disabled={busy === "save"}
              className={GREY}
            >
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={busy === "save" || !ready} className={cn(PRIMARY, "flex-1")}>
              {busy === "save" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving
                </>
              ) : (
                "Save changes"
              )}
            </button>
          </div>
        ) : canPost ? (
          <>
            <button type="button" onClick={handleSubmit} disabled={busy === "post" || !ready} className={PRIMARY}>
              {busy === "post" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Posting
                </>
              ) : (
                "Post review"
              )}
            </button>
            {!isLoggedIn ? (
              <p className="mt-2.5 text-center text-[12px] text-[#6b7280]">Shown with your first name as a verified purchase.</p>
            ) : null}
          </>
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
