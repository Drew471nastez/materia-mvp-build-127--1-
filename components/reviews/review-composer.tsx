"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_REVIEW_CHARS, MIN_REVIEW_CHARS, RATING_WORDS } from "@/lib/reviews/rules"

/**
 * ===========================================================================
 *  WRITING A REVIEW WHERE THE LIST IS
 * ===========================================================================
 * The library's Reviews tab (components/library/library-reviews.tsx) opens
 * this in place: in the shared sheet on a phone, in a dialog on a computer
 * (components/ui/sheet-dialog.tsx). "Leave a review" used to send the buyer
 * to another page to write it; the owner asked for it to happen right
 * there. Stars, the words, and one button. What happens on Post is the
 * list's business: it shows the review at once and asks the server after
 * (/api/reviews, which decides again who may review, and the database's one
 * review per buyer per product).
 *
 * The stars are the receipt card's (components/reviews/review-form.tsx):
 * they fill as the pointer moves, stay on a press with a small give, and the
 * word under them says what the number means. The rules are the server's
 * (lib/reviews/rules): at least MIN_REVIEW_CHARS of words, at most
 * MAX_REVIEW_CHARS.
 */
export function ReviewComposer({
  productId,
  productTitle,
  mode,
  initialRating = 0,
  initialContent = "",
  error = null,
  onSubmit,
  onCancel,
}: {
  productId: string
  productTitle: string
  mode: "new" | "edit"
  initialRating?: number
  initialContent?: string
  /** What the server said last time, in its own words. */
  error?: string | null
  onSubmit: (rating: number, content: string) => void
  onCancel: () => void
}) {
  const [rating, setRating] = useState(initialRating >= 1 && initialRating <= 5 ? Math.round(initialRating) : 0)
  const [hovered, setHovered] = useState(0)
  const [popped, setPopped] = useState(0)
  const [content, setContent] = useState(initialContent.slice(0, MAX_REVIEW_CHARS))
  const [problem, setProblem] = useState<string | null>(error)
  const [sending, setSending] = useState(false)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setProblem(error), [error])
  useEffect(
    () => () => {
      if (popTimer.current) clearTimeout(popTimer.current)
    },
    [],
  )

  const choose = (star: number) => {
    setProblem(null)
    setRating(star)
    setPopped(star)
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopped(0), 180)
    /* Stars first, then the words: the box is where the thumb goes next. */
    if (!content.trim()) textRef.current?.focus({ preventScroll: true })
  }

  const trimmed = content.trim()
  const ready = rating > 0 && trimmed.length >= MIN_REVIEW_CHARS
  const lit = hovered || rating
  const word = RATING_WORDS[lit] ?? ""

  const submit = () => {
    if (rating === 0) return setProblem("Choose a star rating.")
    if (trimmed.length < MIN_REVIEW_CHARS) return setProblem(`Write at least ${MIN_REVIEW_CHARS} characters.`)
    setSending(true)
    onSubmit(rating, trimmed)
  }

  return (
    <form
      data-review-composer={productId}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col"
    >
      <p className="text-[13px] text-[#6b7280]">How was {productTitle}?</p>

      <div role="radiogroup" aria-label="Rating" className="-ml-1.5 mt-2 flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
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
              className="group/star flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
            >
              <Star
                aria-hidden
                strokeWidth={1.75}
                className={cn(
                  "h-8 w-8 transition-[scale,color,fill] duration-150 ease-out motion-reduce:transition-none",
                  on ? "fill-[#f5a524] text-[#f5a524]" : "fill-transparent text-[#d0d5dd]",
                  popped === star ? "scale-[1.18]" : "scale-100 group-active/star:scale-95",
                )}
              />
            </button>
          )
        })}
        <span className="ml-2 text-[13px] font-medium text-[#4b5563]" aria-live="polite">
          {word}
        </span>
      </div>

      <label htmlFor={`compose-${productId}`} className="sr-only">
        Your review
      </label>
      <textarea
        ref={textRef}
        id={`compose-${productId}`}
        value={content}
        onChange={(e) => {
          setProblem(null)
          setContent(e.target.value.slice(0, MAX_REVIEW_CHARS))
        }}
        placeholder="What did you like? What could be better?"
        maxLength={MAX_REVIEW_CHARS}
        rows={4}
        className="mt-3 block min-h-[112px] w-full resize-none rounded-xl border border-[#e4e7ec] bg-white px-3.5 py-3 text-[16px] leading-relaxed text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[15px]"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] tabular-nums text-[#9ca3af]">
        <span>{trimmed.length > 0 && trimmed.length < MIN_REVIEW_CHARS ? `${MIN_REVIEW_CHARS - trimmed.length} more to go` : ""}</span>
        <span>
          {content.length} / {MAX_REVIEW_CHARS}
        </span>
      </div>

      {problem ? (
        <p role="alert" className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]">
          {problem}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] transition-[background-color,translate] duration-150 hover:bg-[#eceef1] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready || sending}
          data-composer-submit=""
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,translate,opacity] duration-150 hover:bg-[#262640] active:translate-y-px disabled:cursor-default disabled:border-[#e4e7ec] disabled:bg-[#eceef1] disabled:text-[#9ca3af] disabled:shadow-none disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {mode === "edit" ? "Save changes" : "Post review"}
        </button>
      </div>
    </form>
  )
}
