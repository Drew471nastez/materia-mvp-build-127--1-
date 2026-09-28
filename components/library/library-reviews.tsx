"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { Loader2, MessageSquareText, Star } from "lucide-react"
import { STAR_AMBER, Stars } from "@/components/reviews/stars"
import { ReviewComposer } from "@/components/reviews/review-composer"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import type { LibraryItem, LibraryReview } from "@/lib/library/library-view"
import { CARD, SECONDARY, SMALL, VIOLET, shortDate } from "./library-ui"

/**
 * ===========================================================================
 *  REVIEWS: WHAT THEY HAVE SAID, AND WHAT IS STILL WAITING
 * ===========================================================================
 * Two lists on one screen, the way Etsy's Purchases and Reviews do it:
 *
 *   To review     every purchase a review would be taken for (bought, still
 *                 theirs, not their own product, not reviewed), with five
 *                 stars to start from and Leave a review.
 *   Your reviews  one per product (the database allows no more, run-now part
 *                 48): the stars, the date, the words, whether the seller
 *                 answered, and Edit and Delete.
 *
 * EVERYTHING HAPPENS HERE. "Leave a review" used to open another page to
 * write it on, and the owner asked for it to happen right where they
 * pressed. The composer (components/reviews/review-composer.tsx) opens in
 * place, as the shared sheet on a phone and a dialog on a computer. Post
 * moves the purchase into Your reviews at once and asks /api/reviews after;
 * if the server says no, the review goes back where it was and the composer
 * opens again with their words and the server's reason. Edit and Delete work
 * the same way, against /api/reviews/<id>. The server decides again, every
 * time, who may review (lib/reviews), so nothing here is trusted.
 *
 * This tab is the one place a purchase is rated. A product's More menu in
 * the library ("Write a review", "Edit your review") comes here with
 * ?product=<id>, and that purchase is scrolled to with its composer open.
 *
 * A refunded purchase, or the buyer's own product, is in neither list: the
 * review route would refuse it, so it is never offered.
 */

type Busy = "post" | "save" | "delete"
interface Draft {
  productId: string
  mode: "new" | "edit"
  rating: number
  content: string
  error: string | null
}

const QUIET =
  "inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-default disabled:opacity-50"

function Thumb({ src, size = 48 }: { src: string | null; size?: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04]" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
    </div>
  )
}

/** Five stars that open the composer with that many chosen. */
function StartStars({ title, onPick }: { title: string; onPick: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div role="group" aria-label={`Rate ${title}`} className="-ml-1 flex items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} out of 5 stars`}
          data-start-star={n}
          onClick={() => onPick(n)}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          className="flex h-9 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
        >
          <Star
            aria-hidden
            strokeWidth={1.5}
            className="h-5 w-5 transition-colors duration-100"
            style={{ color: n <= hover ? STAR_AMBER : "#d5d9e0", fill: n <= hover ? STAR_AMBER : "transparent" }}
          />
        </button>
      ))}
    </div>
  )
}

function Waiting({ item, error, onWrite }: { item: LibraryItem; error: string | null; onWrite: (rating: number) => void }) {
  return (
    <li id={`review-${item.productId}`} data-review-waiting={item.productId} className="scroll-mt-24 px-4 py-3.5 sm:px-5">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
        <Thumb src={item.thumbnailUrl} />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{item.title}</p>
          <p className="truncate text-[12.5px] text-[#6b7280]">
            {item.creator.name} · Bought {shortDate(item.purchasedAt)}
          </p>
        </div>
        <div className="col-span-2 mt-2 flex items-center justify-between gap-2 sm:col-span-1 sm:mt-0 sm:justify-end sm:gap-3">
          <StartStars title={item.title} onPick={onWrite} />
          <button type="button" onClick={() => onWrite(0)} data-review-write="" className={`${SECONDARY} ${SMALL} whitespace-nowrap`}>
            Leave a review
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-[#b42318] sm:pl-[60px]">
          {error}
        </p>
      ) : null}
    </li>
  )
}

function Reviewed({
  item,
  review,
  busy,
  fresh,
  confirming,
  error,
  onEdit,
  onAskDelete,
  onDelete,
  onKeep,
}: {
  item: LibraryItem
  review: LibraryReview
  busy: Busy | null
  fresh: boolean
  confirming: boolean
  error: string | null
  onEdit: () => void
  onAskDelete: () => void
  onDelete: () => void
  onKeep: () => void
}) {
  return (
    <li
      id={`review-${item.productId}`}
      data-review-done={item.productId}
      data-review-busy={busy ?? undefined}
      className={`scroll-mt-24 px-4 py-4 transition-colors duration-700 sm:px-5 ${fresh ? "bg-[#f7f5ff]" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Thumb src={item.thumbnailUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{item.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[#6b7280]">
            <Stars rating={review.rating} size={14} />
            {busy === "post" || busy === "save" ? (
              <span className="inline-flex items-center gap-1 text-[#6b7280]">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Saving
              </span>
            ) : (
              <span>
                {shortDate(review.createdAt)}
                {review.editedAt ? " · Edited" : ""}
              </span>
            )}
          </p>
          {review.content ? <p className="mt-2 line-clamp-4 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.content}</p> : null}
          {review.sellerReply || review.hidden ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              {review.sellerReply ? (
                <span className="inline-flex items-center gap-1 font-medium text-[#1a1a2e]">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  {item.creator.name} replied
                </span>
              ) : null}
              {review.hidden ? <span className="text-[#b45309]">Hidden from the product page for now</span> : null}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-[#b42318]">
              {error}
            </p>
          ) : null}

          {confirming ? (
            <div data-review-confirm="" className="mt-3 rounded-xl bg-[#f8f9fa] p-3">
              <p className="text-[14px] font-medium text-[#1a1a2e]">Delete your review?</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">It comes off the product page and out of its rating. You can write a new one later.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button type="button" onClick={onKeep} className={`${SECONDARY} ${SMALL}`}>
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  data-review-delete-confirm=""
                  className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#c4290c] px-3 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[#a82309] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4290c]/30"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="-mb-1 -ml-3 mt-2 flex items-center gap-1">
              <button type="button" onClick={onEdit} disabled={!!busy || !review.id} data-review-edit="" className={QUIET}>
                Edit
              </button>
              <button type="button" onClick={onAskDelete} disabled={!!busy || !review.id} data-review-delete="" className={QUIET}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** A phone is anything under Tailwind's sm, where every other library sheet takes over. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener?.("change", read)
    return () => mq.removeEventListener?.("change", read)
  }, [])
  return phone
}

/** A copy of a record with one key set, or taken out when the value is undefined. */
function patched<T>(m: Record<string, T>, id: string, value: T | undefined): Record<string, T> {
  const next = { ...m }
  if (value === undefined) delete next[id]
  else next[id] = value
  return next
}

async function said(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (typeof data.error === "string" && data.error) return data.error
  return res.status === 401 ? "Your session ended. Sign in again, then try once more." : fallback
}

export function LibraryReviews({ items, focus = null }: { items: LibraryItem[]; focus?: string | null }) {
  const router = useRouter()
  const phone = usePhone()
  /* Their review as this screen knows it: the server's, then whatever they did here. */
  const [mine, setMine] = useState<Record<string, LibraryReview | null>>({})
  const [busy, setBusy] = useState<Record<string, Busy>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const freshTimer = useRef<number | null>(null)

  /* The server caught up (router.refresh after a change): its answer is the truth again. */
  useEffect(() => {
    setMine((m) => {
      const kept: Record<string, LibraryReview | null> = {}
      for (const [k, v] of Object.entries(m)) if (busy[k]) kept[k] = v
      return kept
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const reviewOf = useCallback((item: LibraryItem): LibraryReview | null => (item.productId in mine ? mine[item.productId] : item.review), [mine])
  /* Could be reviewed at all: not yet, or already and still theirs (so a deleted one can be written again). */
  const reviewable = (item: LibraryItem) => item.canReview || (!!item.review && item.state === "open")

  const waiting = useMemo(() => items.filter((i) => reviewable(i) && !reviewOf(i)), [items, reviewOf])
  const done = useMemo(
    () =>
      items
        .filter((i) => !!reviewOf(i))
        .sort((a, b) => (reviewOf(b)!.createdAt || "").localeCompare(reviewOf(a)!.createdAt || "")),
    [items, reviewOf],
  )

  const flash = (id: string) => {
    setFresh(id)
    if (freshTimer.current) window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(null), 1600)
  }

  const write = (item: LibraryItem, rating = 0) => {
    const review = reviewOf(item)
    setConfirming(null)
    setErrors((m) => patched(m, item.productId, undefined))
    setDraft(
      review
        ? { productId: item.productId, mode: "edit", rating: review.rating, content: review.content, error: null }
        : { productId: item.productId, mode: "new", rating, content: "", error: null },
    )
    setOpen(true)
  }

  /* Arrived from a product's More menu: that purchase, in view, with its composer open. Once. */
  const focused = useRef(false)
  useEffect(() => {
    if (!focus || focused.current) return
    focused.current = true
    const item = items.find((i) => i.productId === focus)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("product")
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    } catch {
      /* the address keeps it; nothing else depends on it */
    }
    if (!item || (!reviewable(item) && !item.review)) return
    document.getElementById(`review-${item.productId}`)?.scrollIntoView({ block: "center" })
    write(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, items])

  const submit = async (rating: number, content: string) => {
    if (!draft) return
    const item = items.find((i) => i.productId === draft.productId)
    if (!item) return
    const id = item.productId
    const before = reviewOf(item)
    const mode = draft.mode
    const now = new Date().toISOString()
    const shown: LibraryReview =
      mode === "edit" && before
        ? { ...before, rating, content, editedAt: now }
        : { id: "", rating, content, createdAt: now, editedAt: null, hidden: false, sellerReply: null }

    /* At once: the list changes and the composer goes. */
    setMine((m) => patched(m, id, shown))
    setBusy((m) => patched(m, id, mode === "edit" ? "save" : "post"))
    setOpen(false)
    flash(id)
    try {
      const res =
        mode === "edit" && before
          ? await fetch(`/api/reviews/${encodeURIComponent(before.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rating, content, receiptToken: item.receiptToken || undefined }),
            })
          : await fetch("/api/reviews", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId: id, rating, content }),
            })
      if (!res.ok) throw new Error(await said(res, mode === "edit" ? "The change did not save. Try again." : "The review did not save. Try again."))
      const data = (await res.json().catch(() => ({}))) as { review?: { id?: string; created_at?: string; edited_at?: string } }
      setMine((m) => patched(m, id, {
        ...shown,
        id: data.review?.id || shown.id,
        createdAt: data.review?.created_at || shown.createdAt,
        editedAt: mode === "edit" ? data.review?.edited_at || shown.editedAt : null,
      }))
      setBusy((m) => patched(m, id, undefined))
      /* Every other library screen, and the router's copy of them, learns of it too. */
      router.refresh()
    } catch (err) {
      /* Put it back, and open the composer again with their words and the reason. */
      setMine((m) => patched(m, id, before === item.review ? undefined : before))
      setBusy((m) => patched(m, id, undefined))
      setFresh(null)
      setDraft({ productId: id, mode, rating, content, error: err instanceof Error ? err.message : "No connection. Try again." })
      setOpen(true)
    }
  }

  const remove = async (item: LibraryItem) => {
    const id = item.productId
    const before = reviewOf(item)
    if (!before?.id) return
    setConfirming(null)
    setErrors((m) => patched(m, id, undefined))
    setMine((m) => patched(m, id, null))
    setBusy((m) => patched(m, id, "delete"))
    try {
      const q = item.receiptToken ? `?receiptToken=${encodeURIComponent(item.receiptToken)}` : ""
      const res = await fetch(`/api/reviews/${encodeURIComponent(before.id)}${q}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await said(res, "The review was not deleted. Try again."))
      setBusy((m) => patched(m, id, undefined))
      router.refresh()
    } catch (err) {
      setMine((m) => patched(m, id, before === item.review ? undefined : before))
      setBusy((m) => patched(m, id, undefined))
      setErrors((m) => patched(m, id, err instanceof Error ? err.message : "No connection. Try again."))
    }
  }

  if (items.length === 0) {
    return (
      <div data-reviews-empty="" className={`${CARD} px-5 py-10 text-center`}>
        <p className="text-[16px] font-semibold text-[#1a1a2e]">Nothing to review yet</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Once you buy something, you can rate it here and change your mind any time.</p>
        <Link href="/explore" className={`${VIOLET} mt-5`}>
          Discover products
        </Link>
      </div>
    )
  }

  const drafted = draft ? items.find((i) => i.productId === draft.productId) ?? null : null

  return (
    <div className="max-w-[760px] space-y-7" data-library-reviews="">
      <section aria-labelledby="to-review">
        <div className="mb-2.5 flex items-baseline justify-between px-0.5">
          <h2 id="to-review" className="text-[15px] font-semibold text-[#1a1a2e]">
            To review
          </h2>
          <span className="text-[13px] tabular-nums text-[#6b7280]">{waiting.length}</span>
        </div>
        {waiting.length > 0 ? (
          <ul className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {waiting.map((item) => (
              <Waiting key={item.productId} item={item} error={errors[item.productId] ?? null} onWrite={(n) => write(item, n)} />
            ))}
          </ul>
        ) : (
          <p className={`${CARD} px-4 py-4 text-[14px] text-[#6b7280]`}>You have reviewed everything you bought.</p>
        )}
      </section>

      <section aria-labelledby="your-reviews">
        <div className="mb-2.5 flex items-baseline justify-between px-0.5">
          <h2 id="your-reviews" className="text-[15px] font-semibold text-[#1a1a2e]">
            Your reviews
          </h2>
          <span className="text-[13px] tabular-nums text-[#6b7280]">{done.length}</span>
        </div>
        {done.length > 0 ? (
          <ul className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {done.map((item) => (
              <Reviewed
                key={item.productId}
                item={item}
                review={reviewOf(item)!}
                busy={busy[item.productId] ?? null}
                fresh={fresh === item.productId}
                confirming={confirming === item.productId}
                error={errors[item.productId] ?? null}
                onEdit={() => write(item)}
                onAskDelete={() => setConfirming(item.productId)}
                onDelete={() => void remove(item)}
                onKeep={() => setConfirming(null)}
              />
            ))}
          </ul>
        ) : (
          <p className={`${CARD} px-4 py-4 text-[14px] text-[#6b7280]`}>Reviews you write show up here, with Edit.</p>
        )}
      </section>

      <SheetDialog
        open={open}
        onClose={() => setOpen(false)}
        phone={phone}
        label={draft?.mode === "edit" ? "Edit your review" : "Leave a review"}
        className="gap-0 rounded-2xl border-[#e4e7ec] bg-white p-6 sm:max-w-[460px]"
      >
        {draft && drafted ? (
          <div data-review-sheet="" className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:p-0">
            <div className="flex items-center gap-3 pr-8">
              <Thumb src={drafted.thumbnailUrl} size={40} />
              <div className="min-w-0">
                <SheetDialogTitle className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{draft.mode === "edit" ? "Edit your review" : "Leave a review"}</SheetDialogTitle>
                <p className="truncate text-[13px] text-[#6b7280]">{drafted.creator.name}</p>
              </div>
            </div>
            <div className="mt-4">
              <ReviewComposer
                key={`${draft.productId}:${draft.mode}:${draft.error ?? ""}`}
                productId={draft.productId}
                productTitle={drafted.title}
                mode={draft.mode}
                initialRating={draft.rating}
                initialContent={draft.content}
                error={draft.error}
                onSubmit={(rating, content) => void submit(rating, content)}
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        ) : null}
      </SheetDialog>
    </div>
  )
}
