"use client"

/**
 * ===========================================================================
 *  THE PAGE'S GALLERY
 * ===========================================================================
 * The pictures and videos at the top of the community's page, the first
 * one shown first, up to twelve (communities.gallery, saved with the Page
 * tab's Save bar).
 *
 *   PICTURES go through the same upload as the logo, the cover and a
 *   product's pictures (lib/storage/chunked-upload: checked, stripped, kept
 *   in the public picture bucket), several at once.
 *   VIDEOS go through the community's video upload
 *   (/api/app/community/<id>/videos, lib/video/upload-client.ts), the same
 *   path as an event's replay: Storelib storage by default, or the video
 *   service that is connected.
 *   A YOUTUBE OR VIMEO LINK (round 11) is pasted into a field: it is read at
 *   once with the composer's own parser (embedFromUrl), so a link that is
 *   not a video says so before anything is saved, and the route checks it
 *   again and asks Vimeo for the still (lib/communities/server/gallery.ts).
 *   THE COVER can be one of those videos too (CoverField below): it is then
 *   the gallery's first item, marked as the cover, and its still stands in
 *   for the cover picture wherever one is drawn.
 *   ORDER by dragging a tile onto another on a computer, or with the arrows
 *   that show on a tile under the pointer or the keyboard. On a phone each
 *   tile has one button, its menu (move earlier, later, first, remove), so
 *   the picture is not covered by buttons.
 *
 * A tile that is still uploading is shown with its progress and is not part
 * of the gallery until it is done, so Save never sends half a file.
 */
import * as React from "react"
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, MoreHorizontal, Play, Video, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { uploadCommunityVideo } from "@/lib/video/upload-client"
import { GALLERY_MAX, coverVideo, galleryEmbed, galleryKey, moveItem, type GalleryEmbed, type GalleryItem } from "./logic"
import type { GalleryVideoView } from "./view-types"
import { PicturePick, buttonPrimary, buttonSecondary, field } from "./parts"

interface Uploading {
  key: string
  kind: "image" | "video"
  name: string
  percent: number
  preview: string | null
}

const keyOf = galleryKey
const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const

function duration(s: number | null): string {
  if (!s) return ""
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`
}

export function GalleryEditor({
  communityId,
  value,
  onChange,
  videos: initialVideos,
  ready,
  onError,
  onBusy,
  max = GALLERY_MAX,
}: {
  communityId: string
  value: GalleryItem[]
  onChange: (next: GalleryItem[]) => void
  videos: Record<string, GalleryVideoView>
  ready: boolean
  onError: (message: string) => void
  /** True while a file is on its way, so the page can hold Save. */
  onBusy?: (busy: boolean) => void
  /** Room in the list (twelve, less one while a cover video is the first item). */
  max?: number
}) {
  const pictures = React.useRef<HTMLInputElement>(null)
  const movie = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState<Uploading[]>([])
  const [videos, setVideos] = React.useState(initialVideos)
  const [dragging, setDragging] = React.useState<number | null>(null)
  const [over, setOver] = React.useState<number | null>(null)
  const [linking, setLinking] = React.useState(false)
  /* The newest list, for an upload that finishes after other changes were made. */
  const latest = React.useRef(value)
  latest.current = value
  const room = max - value.length - uploading.length

  React.useEffect(() => {
    onBusy?.(uploading.length > 0)
  }, [uploading.length, onBusy])

  const progress = (key: string, percent: number) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, percent } : x)))
  const done = (key: string) =>
    setUploading((u) => {
      const gone = u.find((x) => x.key === key)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return u.filter((x) => x.key !== key)
    })
  const add = (item: GalleryItem) => {
    if (latest.current.length >= max) return
    const next = [...latest.current, item]
    latest.current = next
    onChange(next)
  }

  const uploadPictures = async (files: File[]) => {
    const take = files.slice(0, Math.max(0, room))
    if (files.length > take.length) onError(`A gallery holds ${max}. The first ${take.length} were added.`)
    const jobs = take.map((file) => ({ file, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` }))
    setUploading((u) => [...u, ...jobs.map((j) => ({ key: j.key, kind: "image" as const, name: j.file.name, percent: 0, preview: URL.createObjectURL(j.file) }))])
    /* One after another: a phone on a slow line finishes the first picture before it starts the next. */
    for (const j of jobs) {
      const uploader = new DirectUploader({ file: j.file, folder: "product-images", onProgress: (p) => progress(j.key, p) })
      try {
        const result = await uploader.start()
        if (result.publicUrl) add({ type: "image", url: result.publicUrl })
        else onError("A picture did not upload. Try again.")
      } catch (e) {
        onError((e as { message?: string })?.message || "A picture did not upload. Try again.")
      } finally {
        uploader.destroy()
        done(j.key)
      }
    }
  }

  const uploadVideo = async (file: File) => {
    if (room <= 0) return onError(`A gallery holds ${max}.`)
    const key = `${Date.now()}-v`
    setUploading((u) => [...u, { key, kind: "video", name: file.name, percent: 0, preview: null }])
    try {
      const v = await uploadCommunityVideo({ endpoint: `/api/app/community/${communityId}/videos`, file, onProgress: (p) => progress(key, p) })
      setVideos((x) => ({ ...x, [v.id]: { status: v.status, thumbnailUrl: v.thumbnailUrl, durationSeconds: v.durationSeconds } }))
      add({ type: "video", videoId: v.id })
    } catch (e) {
      onError((e as { message?: string })?.message || "The video did not upload. Try again.")
    } finally {
      done(key)
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return
    onChange(moveItem(value, from, to))
  }

  if (!ready)
    return (
      <p className="rounded-xl bg-[#f7f7f8] px-4 py-3 text-[13.5px] leading-snug text-[#4b5563]" data-gallery-not-ready="">
        The gallery arrives with the next Storelib database update. Once it has run, add pictures and videos here.
      </p>
    )

  return (
    <div data-gallery="">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="Gallery">
        {value.map((item, i) => {
          const v = item.type === "video" ? videos[item.videoId] : null
          return (
            <li
              key={keyOf(item)}
              data-gallery-item={item.type}
              draggable
              onDragStart={(e) => {
                setDragging(i)
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", String(i))
              }}
              onDragOver={(e) => {
                if (dragging === null) return
                e.preventDefault()
                setOver(i)
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging !== null) move(dragging, i)
                setDragging(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
              className={cn(
                "group/tile relative aspect-[16/10] cursor-grab overflow-hidden rounded-xl bg-[#eceef1] transition-[opacity,box-shadow] duration-100 active:cursor-grabbing",
                dragging === i && "opacity-40",
                over === i && dragging !== i && "shadow-[0_0_0_2px_#1a1a2e]",
              )}
            >
              {item.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              ) : item.type === "embed" ? (
                item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span aria-hidden className="absolute inset-0 bg-[#1a1a2e]" />
                )
              ) : v?.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span aria-hidden className="absolute inset-0 bg-[#1a1a2e]" />
              )}
              {item.type !== "image" ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </span>
              ) : null}
              <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1">
                {i === 0 ? <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11.5px] font-medium text-[#1a1a2e]">First</span> : null}
                {item.type === "video" && v && v.status !== "ready" ? <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11.5px] font-medium text-[#92400e]">{v.status === "failed" ? "Failed" : "Processing"}</span> : null}
                {item.type === "embed" ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11.5px] font-medium text-white">{PROVIDER[item.provider]}</span> : null}
                {item.type === "video" && v?.durationSeconds ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums text-white">{duration(v.durationSeconds)}</span> : null}
              </span>
              {/* A computer: the arrows and remove, when the pointer or the keyboard is on the tile. */}
              <span className="absolute inset-x-1.5 bottom-1.5 hidden items-center justify-between gap-1 opacity-0 transition-opacity duration-100 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 md:flex">
                <span className="flex items-center gap-1">
                  <TileButton label={`Move ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowLeft className="h-4 w-4" />
                  </TileButton>
                  <TileButton label={`Move ${i + 1} later`} disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowRight className="h-4 w-4" />
                  </TileButton>
                </span>
                <TileButton label={`Remove ${item.type === "image" ? "picture" : "video"} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </TileButton>
              </span>
              {/* A phone: one button, its menu as a sheet. */}
              <span className="absolute bottom-0.5 right-0.5 md:hidden">
                <ResponsiveActionMenu
                  title={item.type === "image" ? `Picture ${i + 1}` : `Video ${i + 1}`}
                  align="end"
                  items={[
                    ...(i > 0 ? [{ label: "Show first", onClick: () => move(i, 0) }, { label: "Move earlier", onClick: () => move(i, i - 1) }] : []),
                    ...(i < value.length - 1 ? [{ label: "Move later", onClick: () => move(i, i + 1) }] : []),
                    { label: "Remove", variant: "destructive" as const, separatorBefore: true, onClick: () => onChange(value.filter((_, j) => j !== i)) },
                  ]}
                  trigger={
                    <button type="button" aria-label={`Change ${item.type === "image" ? "picture" : "video"} ${i + 1}`} data-tile-menu="" className="grid h-10 w-10 cursor-pointer place-items-center">
                      {/* Drawn 30px, pressed 40px: the picture stays the thing you see. */}
                      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-white/92 text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                        <MoreHorizontal className="h-4 w-4" />
                      </span>
                    </button>
                  }
                />
              </span>
            </li>
          )
        })}
        {uploading.map((u) => (
          <li key={u.key} data-gallery-uploading="" className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#eceef1]">
            {u.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
            ) : null}
            <span className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 px-3 text-center">
              <Loader2 aria-hidden className="h-5 w-5 animate-spin text-[#1a1a2e]" />
              <span className="max-w-full truncate text-[12px] font-medium text-[#1a1a2e]">{u.kind === "video" ? `Video ${u.percent}%` : `${u.percent}%`}</span>
            </span>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
              <span className="block h-full bg-[#1a1a2e] transition-[width] duration-200" style={{ width: `${u.percent}%` }} />
            </span>
          </li>
        ))}
        {value.length === 0 && uploading.length === 0 ? (
          <li className="col-span-full grid min-h-[132px] place-content-center justify-items-center gap-1 rounded-xl border border-dashed border-[#d9dce1] bg-[#fafafb] px-4 py-6 text-center">
            <p className="text-[14px] font-medium text-[#1a1a2e]">No pictures or videos yet</p>
            <p className="text-[13px] text-[#6b7280]">Show what being a member looks like.</p>
          </li>
        ) : null}
      </ul>
      <input
        ref={pictures}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void uploadPictures(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      <input
        ref={movie}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void uploadVideo(f)
          e.target.value = ""
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2" data-gallery-add="">
        {room > 0 ? (
          <>
            <button type="button" onClick={() => pictures.current?.click()} className={cn(buttonSecondary, "h-10 sm:h-8")}>
              <ImagePlus aria-hidden className="h-4 w-4" />
              Add pictures
            </button>
            <button type="button" onClick={() => movie.current?.click()} className={cn(buttonSecondary, "h-10 sm:h-8")}>
              <Video aria-hidden className="h-4 w-4" />
              Add a video
            </button>
            <button type="button" onClick={() => setLinking(true)} aria-expanded={linking} className={cn(buttonSecondary, "h-10 sm:h-8")} data-gallery-add-link="">
              <Link2 aria-hidden className="h-4 w-4" />
              Add a video link
            </button>
          </>
        ) : null}
        <span className="text-[12.5px] tabular-nums text-[#6b7280]">
          {value.length} of {GALLERY_MAX}
          <span className="max-md:hidden">. Drag to reorder. Wide pictures look best.</span>
        </span>
      </div>
      {linking && room > 0 ? (
        <VideoLinkField
          className="mt-3"
          onCancel={() => setLinking(false)}
          onAdd={(embed) => {
            if (latest.current.some((x) => keyOf(x) === keyOf(embed))) return "That video is already in the gallery."
            add(embed)
            setLinking(false)
            return null
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * A YOUTUBE OR VIMEO LINK, pasted. Read on the spot with the composer's own
 * parser, so "Add" either takes it or says what is wrong in one line under
 * the field (nothing is saved until the page's Save). Enter adds, Escape
 * closes.
 */
export function VideoLinkField({ onAdd, onCancel, className, submitLabel = "Add" }: { onAdd: (embed: GalleryEmbed) => string | null; onCancel: () => void; className?: string; submitLabel?: string }) {
  const [text, setText] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    input.current?.focus()
  }, [])
  const submit = () => {
    const embed = galleryEmbed(text.trim())
    if (!embed) return setError(text.trim() ? "That is not a YouTube or Vimeo video link." : "Paste a YouTube or Vimeo link.")
    const refused = onAdd(embed)
    if (refused) return setError(refused)
    setText("")
    setError(null)
  }
  return (
    <div className={cn("max-w-[560px]", className)} data-video-link="">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <input
          ref={input}
          type="url"
          inputMode="url"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, 500))
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            } else if (e.key === "Escape") onCancel()
          }}
          placeholder="https://youtube.com/watch?v=… or vimeo.com/…"
          aria-label="YouTube or Vimeo link"
          aria-invalid={!!error}
          className={cn(field, "h-11 min-w-0 flex-1 basis-full sm:h-9 sm:basis-auto", error && "border-[#f1b4ae]")}
        />
        <button type="button" onClick={submit} className={cn(buttonPrimary, "h-10 sm:h-9")} data-video-link-add="">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={cn(buttonSecondary, "h-10 sm:h-9")}>
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] text-[#b42318]" data-video-link-error="">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-[#6b7280]">It plays on your page in the YouTube or Vimeo player.</p>
      )}
    </div>
  )
}

/**
 * THE COVER: A PICTURE, OR A YOUTUBE OR VIMEO VIDEO (round 11, ask 27). A
 * picture is the logo's upload (PicturePick). A video link makes that video
 * the gallery's first item, marked as the cover: the page leads with it, and
 * on Save the route makes its still the cover picture, so Explore, the cards
 * and a shared link keep showing a still (Vimeo's still arrives with the
 * save). Removing it takes it out of the gallery and leaves no cover.
 */
export function CoverField({ coverUrl, gallery, onChange, onError }: { coverUrl: string | null; gallery: GalleryItem[]; onChange: (next: { coverUrl: string | null; gallery: GalleryItem[] }) => void; onError?: (message: string) => void }) {
  const video = coverVideo(gallery)
  const [linking, setLinking] = React.useState(false)
  const setVideo = (embed: GalleryEmbed): string | null => {
    const rest = (video ? gallery.slice(1) : gallery).filter((x) => keyOf(x) !== keyOf(embed))
    if (rest.length >= GALLERY_MAX) return `The gallery is full (${GALLERY_MAX}). Remove one first.`
    onChange({ coverUrl: null, gallery: [{ ...embed, cover: true }, ...rest] })
    setLinking(false)
    return null
  }
  if (video)
    return (
      <div className="min-w-0" data-cover-video={video.provider}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-16 w-full max-w-[208px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1a1a2e] sm:w-[208px]">
            {video.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white">
              <Play aria-hidden className="ml-0.5 h-3.5 w-3.5 fill-current" />
            </span>
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[10.5px] font-medium text-white">{PROVIDER[video.provider]}</span>
          </span>
          <div className="flex min-w-0 flex-col items-start gap-1">
            <button type="button" onClick={() => setLinking(true)} className={cn(buttonSecondary, "h-10 sm:h-8")}>
              Change
            </button>
            <button type="button" onClick={() => onChange({ coverUrl: null, gallery: gallery.slice(1) })} className="inline-flex min-h-10 items-center gap-1 px-0.5 text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e] sm:min-h-8" data-cover-remove="">
              <X aria-hidden className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
        {linking ? <VideoLinkField className="mt-3" submitLabel="Use" onCancel={() => setLinking(false)} onAdd={setVideo} /> : null}
      </div>
    )
  return (
    <div className="min-w-0" data-cover-picture="">
      <PicturePick value={coverUrl} onChange={(v) => onChange({ coverUrl: v, gallery })} shape="wide" name="cover" onError={onError} />
      {linking ? (
        <VideoLinkField className="mt-3" submitLabel="Use" onCancel={() => setLinking(false)} onAdd={setVideo} />
      ) : (
        <button type="button" onClick={() => setLinking(true)} className="mt-1 inline-flex min-h-10 items-center gap-1.5 px-0.5 text-[12.5px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline sm:min-h-8" data-cover-use-link="">
          <Link2 aria-hidden className="h-3.5 w-3.5" />
          Use a YouTube or Vimeo video instead
        </button>
      )}
    </div>
  )
}

function TileButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg bg-white/92 text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-colors hover:bg-white disabled:cursor-default disabled:opacity-40 md:h-8 md:w-8"
    >
      {children}
    </button>
  )
}
