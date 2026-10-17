"use client"

import { useRef, useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { MAX_BODY_CHARS, MAX_PHOTOS, MAX_TITLE_CHARS } from "@/lib/reviews/app-settings"
import { useCt } from "@/app/checkout/parts/words"

export interface ReviewPageProps {
  token: string
  /** The link is from the order itself: the review shows as a verified purchase. */
  verified?: boolean
  storeName: string
  product: { title: string; image: string | null }
  starColor: string
  photosAllowed: boolean
  initialRating: number
  suggestedName: string
  closed: boolean
  review: {
    rating: number
    title: string
    content: string
    name: string
    photos: { path: string; url: string; removed: boolean }[]
    status: "published" | "pending" | "hidden"
    editable: boolean
  } | null
}

type Photo = { path: string; url: string; removed?: boolean }

const field = "block w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[15px]"

/**
 * The review page's words in the store's language (round K5): every sentence
 * goes through ct(), the checkout's translator, so it is listed under
 * Translate with the checkout's words (scripts/i18n/checkout-sentences.mjs
 * reads app/review) and the page (./page.tsx) hands the order's language and
 * its approved translations to CheckoutWords around this form.
 */
export function ReviewPageForm(p: ReviewPageProps) {
  const ct = useCt()
  const ratingWord = (n: number) => [ "", ct("Poor"), ct("Fair"), ct("Good"), ct("Very good"), ct("Excellent")][n] ?? ""
  const [mode, setMode] = useState<"form" | "done" | "view">(p.review ? "view" : "form")
  const [rating, setRating] = useState(p.review?.rating ?? p.initialRating)
  const [hover, setHover] = useState(0)
  const [title, setTitle] = useState(p.review?.title ?? "")
  const [content, setContent] = useState(p.review?.content ?? "")
  const [name, setName] = useState(p.review?.name || p.suggestedName)
  const [photos, setPhotos] = useState<Photo[]>(p.review?.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>(p.review?.status ?? "")
  const fileRef = useRef<HTMLInputElement>(null)
  const editing = !!p.review

  const shown = hover || rating
  const addPhoto = async (file: File) => {
    setError(null)
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    form.append("token", p.token)
    const res = await fetch("/api/reviews/photo", { method: "POST", body: form }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setUploading(false)
    if (!res?.ok || !data.path) return setError(data.error ? ct(String(data.error)) : ct("The photo didn't upload. Try again."))
    setPhotos((list) => [...list, { path: data.path, url: data.url }])
  }

  const submit = async () => {
    if (!rating) return setError(ct("Choose how many stars."))
    if (content.trim().length < 2) return setError(ct("Write a few words about it."))
    setBusy(true)
    setError(null)
    const res = await fetch("/api/reviews/request", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token, rating, title, content, name, photos: photos.filter((x) => !x.removed).map((x) => x.path) }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return setError(data.error ? ct(String(data.error)) : ct("It didn't send. Try again."))
    setStatus(data.status ?? "published")
    setMode("done")
  }

  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa] px-4 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))] sm:pt-14" data-review-page="">
      <div className="mx-auto w-full max-w-[520px]">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-[#6b7280]">
          <span>{p.storeName}</span>
          {p.verified ? (
            <span className="inline-flex items-center gap-1 text-[#067647]" data-review-verified="">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path fill="currentColor" d="M8 1.5l1.7 1.2 2.1-.1.7 2 1.7 1.3-.6 2 .6 2-1.7 1.3-.7 2-2.1-.1L8 14.5l-1.7-1.2-2.1.1-.7-2L1.8 10.1l.6-2-.6-2 1.7-1.3.7-2 2.1.1z" /><path d="M5.6 8.2l1.6 1.6 3.3-3.4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {ct("Verified purchase")}
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex items-center gap-3.5">
          {p.product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.product.image} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl border border-[#e5e7eb]/70 bg-white object-cover" />
          ) : (
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#eceef1] text-[18px] font-semibold text-[#4b5563]">
              {p.product.title.slice(0, 1).toUpperCase()}
            </span>
          )}
          <h1 className="min-w-0 text-[22px] font-bold leading-tight text-[#1a1a2e] sm:text-[24px]">
            {mode === "done" ? ct("Thank you") : editing && mode === "view" ? ct("Your review") : ct("How was {product}?", { product: p.product.title })}
          </h1>
        </div>

        <section className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
          {mode === "done" ? (
            <div data-review-done={status}>
              <p className="text-[15px] leading-relaxed text-[#374151]">
                {status === "pending" ? ct("{store} reads new reviews before they go up. Yours will show once they have.", { store: p.storeName }) : ct("Your review is up. It helps the next person decide.")}
              </p>
              <button type="button" onClick={() => setMode("view")} className="mt-4 text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4">
                {ct("See your review")}
              </button>
            </div>
          ) : mode === "view" ? (
            <div data-review-view="">
              <StarRow value={rating} color={p.starColor} size={22} label={ct("{value} out of 5 stars", { value: rating })} />
              {title ? <p className="mt-3 text-[16px] font-semibold text-[#1a1a2e]">{title}</p> : null}
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{content}</p>
              {photos.some((x) => !x.removed) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.filter((x) => !x.removed).map((x) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={x.path} src={x.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-[13px] text-[#6b7280]">
                {name ? `${ct("By {name}.", { name })} ` : ""}
                {status === "pending" ? ct("Waiting for {store} to publish it.", { store: p.storeName }) : status === "hidden" ? ct("Not shown on the store right now.") : ct("Shown on the store.")}
              </p>
              {p.review?.editable !== false && !p.closed ? (
                <button type="button" onClick={() => setMode("form")} className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#e3e4e8] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                  {ct("Change it")}
                </button>
              ) : null}
            </div>
          ) : p.closed ? (
            <p className="text-[15px] leading-relaxed text-[#374151]">{ct("This order can't be reviewed any more. If something is wrong, reply to the email from {store}.", { store: p.storeName })}</p>
          ) : (
            <form
              data-review-form=""
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <fieldset>
                <legend className="text-[14px] font-medium text-[#1a1a2e]">{ct("Your rating")}</legend>
                <div className="mt-2 flex items-center gap-3" onMouseLeave={() => setHover(0)}>
                  <div className="flex" role="radiogroup" aria-label={ct("Stars")}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={ct("{n, plural, one {# star} other {# stars}}", { n })}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        className="-m-0.5 flex h-11 w-11 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
                        data-star={n}
                      >
                        <StarGlyph on={n <= shown} color={p.starColor} size={30} />
                      </button>
                    ))}
                  </div>
                  <span className="text-[14px] text-[#6b7280]" aria-live="polite">{shown ? ratingWord(shown) : ""}</span>
                </div>
              </fieldset>

              <label className="mt-5 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-title">
                {ct("Title")} <span className="font-normal text-[#9ca3af]">{ct("(optional)")}</span>
              </label>
              <input id="review-title" value={title} maxLength={MAX_TITLE_CHARS} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1.5`} placeholder={ct("Sum it up")} />

              <label className="mt-4 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-body">
                {ct("Your review")}
              </label>
              <textarea id="review-body" value={content} maxLength={MAX_BODY_CHARS} onChange={(e) => setContent(e.target.value)} rows={5} className={`${field} mt-1.5 min-h-[120px] resize-y leading-relaxed`} placeholder={ct("What did you like? What could be better?")} />

              <label className="mt-4 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-name">
                {ct("Your name")}
              </label>
              <input id="review-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`${field} mt-1.5`} placeholder={ct("First name")} autoComplete="given-name" />
              <p className="mt-1 text-[12.5px] text-[#6b7280]">{ct("Shown as your first name and last initial.")}</p>

              {p.photosAllowed ? (
                <div className="mt-4">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">
                    {ct("Photos")} <span className="font-normal text-[#9ca3af]">{ct("(optional, up to {count})", { count: MAX_PHOTOS })}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photos.filter((x) => !x.removed).map((x) => (
                      <div key={x.path} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={x.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                        <button type="button" aria-label={ct("Remove photo")} onClick={() => setPhotos((list) => list.filter((y) => y.path !== x.path))} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                    {photos.filter((x) => !x.removed).length < MAX_PHOTOS ? (
                      <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[#c4c9d2] text-[#6b7280] hover:bg-[#f7f7f8]" aria-label={ct("Add a photo")}>
                        {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ""
                      if (f) void addPhoto(f)
                    }}
                  />
                </div>
              ) : null}

              {error ? (
                <p role="alert" className="mt-4 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy || uploading} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white transition-colors hover:bg-[#2a2a40] disabled:opacity-60" data-review-submit="">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {editing ? ct("Save changes") : ct("Post review")}
              </button>
            </form>
          )}
        </section>
        <p className="mt-4 text-center text-[12px] text-[#9ca3af]">{ct("Reviews by Storelib")}</p>
      </div>
    </main>
  )
}

function StarGlyph({ on, color, size }: { on: boolean; color: string; size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} style={{ color: on ? color : "#dcdfe4" }}>
      <path fill="currentColor" d="M12 2.8l2.84 5.76 6.36.92-4.6 4.49 1.09 6.33L12 17.31 6.31 20.3l1.09-6.33-4.6-4.49 6.36-.92z" />
    </svg>
  )
}

function StarRow({ value, color, size, label }: { value: number; color: string; size: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarGlyph key={n} on={n <= value} color={color} size={size} />
      ))}
    </span>
  )
}
