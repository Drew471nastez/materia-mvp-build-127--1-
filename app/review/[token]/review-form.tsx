"use client"

import { useRef, useState } from "react"
import { Film, Loader2, Plus, X } from "lucide-react"
import { MAX_BODY_CHARS, MAX_PHOTOS, MAX_TITLE_CHARS, REVIEW_PHOTO_UPLOAD_BYTES, VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/reviews/app-settings"
import { RATING_WORDS } from "@/lib/reviews/rules"

export interface ReviewPageProps {
  token: string
  storeName: string
  product: { title: string; image: string | null }
  starColor: string
  photosAllowed: boolean
  videosAllowed?: boolean
  initialRating: number
  suggestedName: string
  closed: boolean
  review: {
    rating: number
    title: string
    content: string
    name: string
    photos: { path: string; url: string; removed: boolean; video?: boolean }[]
    status: "published" | "pending" | "hidden"
    editable: boolean
  } | null
}

type Photo = { path: string; url: string; removed?: boolean; video?: boolean }

const field = "block w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c4c9d2] focus:shadow-[0_0_0_4px_rgba(26,26,46,0.06)] sm:text-[15px]"

export function ReviewPageForm(p: ReviewPageProps) {
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
  const videoRef = useRef<HTMLInputElement>(null)
  /* When the page opened, and a field nobody sees: the route's spam check (app-settings looksAutomated). */
  const [openedAt] = useState(() => Date.now())
  const [trap, setTrap] = useState("")
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const editing = !!p.review
  const pictures = photos.filter((x) => !x.removed && !x.video)
  const clip = photos.find((x) => !x.removed && x.video) ?? null

  const shown = hover || rating
  const addPhoto = async (file: File) => {
    setError(null)
    /* Said here, before a phone sends 20 MB to be told no. */
    if (file.size > REVIEW_PHOTO_UPLOAD_BYTES) return setError("That photo is too large. Use one under 8 MB.")
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    form.append("token", p.token)
    const res = await fetch("/api/reviews/photo", { method: "POST", body: form }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setUploading(false)
    if (!res?.ok || !data.path) return setError(data.error || "The photo didn't upload. Try again.")
    setPhotos((list) => [...list, { path: data.path, url: data.url }])
  }

  /* A video goes straight to storage on an address the server signs for this link (app/api/reviews/video). */
  const addVideo = async (file: File) => {
    setError(null)
    if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) return setError("Use an MP4, WebM or MOV video.")
    if (file.size > VIDEO_MAX_BYTES) return setError("That video is too large. Use one under 50 MB.")
    setVideoProgress(0)
    const res = await fetch("/api/reviews/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.token, type: file.type, size: file.size }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !data.uploadUrl) {
      setVideoProgress(null)
      return setError(data.error || "The video didn't upload. Try again.")
    }
    const ok = await new Promise<boolean>((resolve) => {
      const form = new FormData()
      form.append("cacheControl", "3600")
      form.append("", file)
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", data.uploadUrl)
      xhr.setRequestHeader("x-upsert", "false")
      xhr.upload.onprogress = (e) => e.lengthComputable && setVideoProgress(Math.round((e.loaded / e.total) * 100))
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
      xhr.onerror = () => resolve(false)
      xhr.send(form)
    })
    setVideoProgress(null)
    if (!ok) return setError("The video didn't upload. Try again, or use a shorter one.")
    setPhotos((list) => [...list.filter((x) => !x.video), { path: data.path, url: URL.createObjectURL(file), video: true }])
  }

  const submit = async () => {
    if (!rating) return setError("Choose how many stars.")
    if (content.trim().length < 2) return setError("Write a few words about it.")
    setBusy(true)
    setError(null)
    const res = await fetch("/api/reviews/request", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token, rating, title, content, name, photos: photos.filter((x) => !x.removed).map((x) => x.path), website: trap, openedAt }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return setError(data.error || "It didn't send. Try again.")
    setStatus(data.status ?? "published")
    setMode("done")
  }

  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa] px-4 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))] sm:pt-14" data-review-page="">
      <div className="mx-auto w-full max-w-[520px]">
        <p className="text-[13px] font-medium text-[#6b7280]">{p.storeName}</p>
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
            {mode === "done" ? "Thank you" : editing && mode === "view" ? "Your review" : `How was ${p.product.title}?`}
          </h1>
        </div>

        <section className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
          {mode === "done" ? (
            <div data-review-done={status}>
              <p className="text-[15px] leading-relaxed text-[#374151]">
                {status === "pending" ? `${p.storeName} reads new reviews before they go up. Yours will show once they have.` : "Your review is up. It helps the next person decide."}
              </p>
              <button type="button" onClick={() => setMode("view")} className="mt-4 text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4">
                See your review
              </button>
            </div>
          ) : mode === "view" ? (
            <div data-review-view="">
              <StarRow value={rating} color={p.starColor} size={22} />
              {title ? <p className="mt-3 text-[16px] font-semibold text-[#1a1a2e]">{title}</p> : null}
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{content}</p>
              {photos.some((x) => !x.removed) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.filter((x) => !x.removed).map((x) =>
                    x.video ? (
                      <video key={x.path} src={x.url} controls playsInline preload="metadata" className="h-20 w-32 rounded-lg bg-black object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={x.path} src={x.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    ),
                  )}
                </div>
              ) : null}
              <p className="mt-3 text-[13px] text-[#6b7280]">
                {name ? `By ${name}. ` : ""}
                {status === "pending" ? `Waiting for ${p.storeName} to publish it.` : status === "hidden" ? "Not shown on the store right now." : "Shown on the store."}
              </p>
              {p.review?.editable !== false && !p.closed ? (
                <button type="button" onClick={() => setMode("form")} className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#e3e4e8] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
                  Change it
                </button>
              ) : null}
            </div>
          ) : p.closed ? (
            <p className="text-[15px] leading-relaxed text-[#374151]">This order can&apos;t be reviewed any more. If something is wrong, reply to the email from {p.storeName}.</p>
          ) : (
            <form
              data-review-form=""
              className="relative"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <fieldset>
                <legend className="text-[14px] font-medium text-[#1a1a2e]">Your rating</legend>
                <div className="mt-2 flex items-center gap-3" onMouseLeave={() => setHover(0)}>
                  <div className="flex" role="radiogroup" aria-label="Stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        className="-m-0.5 flex h-11 w-11 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
                        data-star={n}
                      >
                        <StarGlyph on={n <= shown} color={p.starColor} size={30} />
                      </button>
                    ))}
                  </div>
                  <span className="text-[14px] text-[#6b7280]">{shown ? RATING_WORDS[shown] : ""}</span>
                </div>
              </fieldset>

              <label className="mt-5 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-title">
                Title <span className="font-normal text-[#9ca3af]">(optional)</span>
              </label>
              <input id="review-title" value={title} maxLength={MAX_TITLE_CHARS} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1.5`} placeholder="Sum it up" />

              <label className="mt-4 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-body">
                Your review
              </label>
              <textarea id="review-body" value={content} maxLength={MAX_BODY_CHARS} onChange={(e) => setContent(e.target.value)} rows={5} className={`${field} mt-1.5 min-h-[120px] resize-y leading-relaxed`} placeholder="What did you like? What could be better?" />

              <label className="mt-4 block text-[14px] font-medium text-[#1a1a2e]" htmlFor="review-name">
                Your name
              </label>
              <input id="review-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`${field} mt-1.5`} placeholder="First name" autoComplete="given-name" />
              <p className="mt-1 text-[12.5px] text-[#6b7280]">Shown as your first name and last initial.</p>

              {p.photosAllowed || p.videosAllowed ? (
                <div className="mt-4">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">
                    {p.photosAllowed && p.videosAllowed ? "Photos and a video" : p.photosAllowed ? "Photos" : "A video"}{" "}
                    <span className="font-normal text-[#9ca3af]">
                      (optional{p.photosAllowed ? `, up to ${MAX_PHOTOS} photos` : ""}{p.videosAllowed ? ", one video under 50 MB" : ""})
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clip ? (
                      <div className="relative" data-review-video="">
                        <video src={clip.url} muted playsInline preload="metadata" className="h-20 w-32 rounded-lg bg-black object-cover" />
                        <button type="button" aria-label="Remove video" onClick={() => setPhotos((list) => list.filter((y) => y.path !== clip.path))} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                    {pictures.map((x) => (
                      <div key={x.path} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={x.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                        <button type="button" aria-label="Remove photo" onClick={() => setPhotos((list) => list.filter((y) => y.path !== x.path))} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                    {p.photosAllowed && pictures.length < MAX_PHOTOS ? (
                      <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[#c4c9d2] text-[#6b7280] hover:bg-[#f7f7f8]" aria-label="Add a photo">
                        {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
                      </button>
                    ) : null}
                    {p.videosAllowed && !clip ? (
                      <button type="button" disabled={videoProgress !== null} onClick={() => videoRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#c4c9d2] text-[12px] text-[#6b7280] hover:bg-[#f7f7f8]" aria-label="Add a video" data-review-add-video="">
                        {videoProgress !== null ? <span className="tabular-nums">{videoProgress}%</span> : <Film className="h-5 w-5" aria-hidden />}
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={videoRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ""
                      if (f) void addVideo(f)
                    }}
                  />
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

              {/* Nobody sees this field; a script that fills every field fills it (app-settings looksAutomated). */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
                </label>
              </div>

              {error ? (
                <p role="alert" className="mt-4 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy || uploading || videoProgress !== null} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white transition-colors hover:bg-[#2a2a40] disabled:opacity-60" data-review-submit="">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {editing ? "Save changes" : "Post review"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-4 text-center text-[12px] text-[#9ca3af]">Reviews by Storelib</p>
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

function StarRow({ value, color, size }: { value: number; color: string; size: number }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarGlyph key={n} on={n <= value} color={color} size={size} />
      ))}
    </span>
  )
}
