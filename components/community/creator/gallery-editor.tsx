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
 *   in the public picture bucket), several at once, picked or dropped on
 *   the gallery.
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
 *
 * ORDER (round 31, the owner: "organizing and pull to drag and arrangement
 * doesn't work at all"). It was the browser's own drag and drop, which a
 * finger never starts, and arrows that only showed under a mouse. It is now
 * the product editor's media grid (app/app/products/new/media-grid.tsx) and
 * its rules (./hold-to-drag.ts there): a mouse drags after 4px, a finger
 * after a 300ms hold (a swipe before then scrolls the page), the keyboard
 * lifts with Space, moves with the arrows and drops with Space; Escape or a
 * touchcancel puts it back. The tile under the finger follows it one to one
 * and the others slide out of its way. Each tile also has one menu (show
 * first, earlier, later, remove), so nothing needs a drag at all.
 *
 * A tile that is still uploading is shown with its own picture coming into
 * focus and a line filling under it, and is not part of the gallery until it
 * is done, so Save never sends half a file.
 */
import * as React from "react"
import { DndContext, closestCenter, type Announcements, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { ImagePlus, Link2, Loader2, MoreHorizontal, Play, Upload, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { uploadCommunityVideo, waitUntilPlayable } from "@/lib/video/upload-client"
import { videoStill } from "@/components/community/member/media-upload"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "@/app/app/products/new/hold-to-drag"
import { GALLERY_MAX, coverItem, coverUpload, coverVideo, galleryEmbed, galleryKey, moveItem, type GalleryEmbed, type GalleryItem } from "./logic"
import type { GalleryVideoView } from "./view-types"
import { RemoveButton, UploadRing, buttonPrimary, buttonSecondary, field, usePictureUpload } from "./parts"
import { tt } from "@/lib/i18n/text"

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

const kindWord = (item: GalleryItem) => (item.type === "image" ? tt("picture") : tt("video"))

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
  const [linking, setLinking] = React.useState(false)
  const [dropping, setDropping] = React.useState(false)
  const [lifted, setLifted] = React.useState<UniqueIdentifier | null>(null)
  /* The newest list, for an upload that finishes after other changes were made. */
  const latest = React.useRef(value)
  latest.current = value
  const room = max - value.length - uploading.length

  React.useEffect(() => {
    onBusy?.(uploading.length > 0)
  }, [uploading.length, onBusy])

  const progress = (key: string, percent: number) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, percent: Math.round(percent) } : x)))
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
    if (files.length > take.length) onError(tt("A gallery holds {max}. The first {length} were added.", { max, length: take.length }))
    const jobs = take.map((file) => ({ file, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` }))
    setUploading((u) => [...u, ...jobs.map((j) => ({ key: j.key, kind: "image" as const, name: j.file.name, percent: 0, preview: URL.createObjectURL(j.file) }))])
    /* One after another: a phone on a slow line finishes the first picture before it starts the next. */
    for (const j of jobs) {
      /* Round 27: made the size the gallery shows (2000px on its long edge, no HDR or location in it) before it leaves the device. */
      let file = j.file
      try {
        const { compressPostPicture } = await import("@/components/community/member/media-compress")
        file = await compressPostPicture(j.file, { maxEdge: 2000, quality: 0.86 })
      } catch {
        /* A picture the browser cannot redraw goes up as it is. */
      }
      const uploader = new DirectUploader({ file, folder: "product-images", onProgress: (p) => progress(j.key, p) })
      try {
        const result = await uploader.start()
        if (result.publicUrl) add({ type: "image", url: result.publicUrl })
        else onError(tt("A picture did not upload. Try again."))
      } catch (e) {
        onError((e as { message?: string })?.message || tt("A picture did not upload. Try again."))
      } finally {
        uploader.destroy()
        done(j.key)
      }
    }
  }

  const uploadVideo = async (file: File) => {
    if (room <= 0) return onError(tt("A gallery holds {max}.", { max }))
    const key = `${Date.now()}-v`
    setUploading((u) => [...u, { key, kind: "video", name: file.name, percent: 0, preview: null }])
    try {
      const v = await uploadCommunityVideo({ endpoint: `/api/app/community/${communityId}/videos`, file, onProgress: (p) => progress(key, p) })
      setVideos((x) => ({ ...x, [v.id]: { status: v.status, thumbnailUrl: v.thumbnailUrl, durationSeconds: v.durationSeconds } }))
      add({ type: "video", videoId: v.id })
    } catch (e) {
      onError((e as { message?: string })?.message || tt("The video did not upload. Try again."))
    } finally {
      done(key)
    }
  }

  /* Files dropped on the gallery from a computer: pictures together, each video on its own. */
  const takeFiles = (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith("image/"))
    const vids = files.filter((f) => f.type.startsWith("video/"))
    if (!pics.length && !vids.length) return onError(tt("Drop pictures or a video here."))
    if (pics.length) void uploadPictures(pics)
    for (const v of vids) void uploadVideo(v)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return
    onChange(moveItem(value, from, to))
  }
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))

  /* ── Dragging (./hold-to-drag in the product editor) ── */
  const sensors = useHoldToDragSensors()
  const ids = value.map(keyOf)
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : ids.indexOf(String(id)) + 1)
  const nameOf = (id: UniqueIdentifier) => {
    const item = value[ids.indexOf(String(id))]
    return item ? `${kindWord(item)} ${place(id)}` : ""
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => tt("Picked up {name}.", { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? tt("{name} is now at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : undefined),
    onDragEnd: ({ active, over }) => (over ? tt("{name} dropped at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : tt("Dropped where it was.")),
    onDragCancel: ({ active }) => tt("Cancelled. {name} is back where it was.", { name: nameOf(active.id) }),
  }
  const onDragStart = (e: DragStartEvent) => {
    setLifted(e.active.id)
    liftTick(e.activatorEvent)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setLifted(null)
    if (!over || active.id === over.id) return
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  if (!ready)
    return (
      <p className="rounded-xl bg-[#f7f7f8] px-4 py-3 text-[13.5px] leading-snug text-[#4b5563]" data-gallery-not-ready="">
        {tt("The gallery arrives with the next Storelib database update. Once it has run, add pictures and videos here.")}
      </p>
    )

  return (
    <div data-gallery="">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-[#4b5563]">{tt("Gallery")}</p>
        <p className="text-[12.5px] tabular-nums text-[#6b7280]" data-gallery-count="">
          {tt("{length} of {max}", { length: value.length, max: GALLERY_MAX })}
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={AUTO_SCROLL}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: tt("To move a picture or video, press Space or Enter on it, then the arrow keys. Press Space or Enter again to drop it, or Escape to put it back. The first is shown first.") },
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setLifted(null)}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <ul
            aria-label={tt("Gallery")}
            data-gallery-grid=""
            data-dragging={lifted != null ? "" : undefined}
            data-drop={dropping ? "over" : undefined}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types).includes("Files") || room <= 0) return
              e.preventDefault()
              setDropping(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files?.length) return
              e.preventDefault()
              setDropping(false)
              takeFiles(Array.from(e.dataTransfer.files))
            }}
            className={cn("grid grid-cols-2 gap-2.5 rounded-xl transition-shadow duration-150 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4", dropping && "shadow-[0_0_0_2px_#1a1a2e,0_0_0_6px_rgba(26,26,46,0.08)]")}
          >
            {value.map((item, i) => (
              <GalleryTile
                key={keyOf(item)}
                id={keyOf(item)}
                item={item}
                index={i}
                count={value.length}
                video={item.type === "video" ? videos[item.videoId] : undefined}
                onMove={move}
                onRemove={remove}
              />
            ))}
            {uploading.map((u) => (
              <PendingTile key={u.key} pending={u} />
            ))}
            {room > 0 ? (
              <li className="list-none">
                <button
                  type="button"
                  onClick={() => pictures.current?.click()}
                  data-gallery-add-tile=""
                  className="group/add grid aspect-[16/10] w-full cursor-pointer place-content-center justify-items-center gap-1 rounded-xl border border-dashed border-[#d3d6dc] bg-[#fafafb] px-3 text-center text-[#6b7280] outline-none transition-[border-color,background-color,color] duration-100 hover:border-[#a9aeb7] hover:bg-white hover:text-[#1a1a2e] focus-visible:border-[#1a1a2e] active:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]"
                >
                  <ImagePlus aria-hidden className="h-5 w-5" />
                  <span className="text-[13px] font-medium">{value.length ? tt("Add pictures") : tt("Add the first pictures")}</span>
                  <span className="text-[11.5px] text-[#9ca3af] max-md:hidden">{tt("or drop them here")}</span>
                </button>
              </li>
            ) : null}
          </ul>
        </SortableContext>
      </DndContext>
      <input
        ref={pictures}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
            <button type="button" onClick={() => movie.current?.click()} className={cn(buttonSecondary, "h-10 sm:h-8")} data-gallery-add-video="">
              <Video aria-hidden className="h-4 w-4" />
              {tt("Upload a video")}
            </button>
            <button type="button" onClick={() => setLinking(true)} aria-expanded={linking} className={cn(buttonSecondary, "h-10 sm:h-8")} data-gallery-add-link="">
              <Link2 aria-hidden className="h-4 w-4" />
              {tt("YouTube or Vimeo link")}
            </button>
          </>
        ) : (
          <span className="text-[12.5px] text-[#6b7280]">{tt("The gallery is full. Remove one to add another.")}</span>
        )}
        {value.length > 1 ? (
          <span className="text-[12.5px] text-[#6b7280]" data-gallery-hint="">
            <span className="md:hidden">{tt("Hold a tile to move it.")}</span>
            <span className="max-md:hidden">{tt("Drag a tile to move it.")}</span>
          </span>
        ) : null}
      </div>
      {linking && room > 0 ? (
        <VideoLinkField
          className="mt-3"
          onCancel={() => setLinking(false)}
          onAdd={(embed) => {
            if (latest.current.some((x) => keyOf(x) === keyOf(embed))) return tt("That video is already in the gallery.")
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
 * ONE TILE. The whole tile is the handle (held on a phone, dragged with a
 * mouse, Space from the keyboard), as in the product editor; its menu sits
 * above the handle and is its own button, so a tap on it never starts a
 * drag. It moves by transform only, one to one with the finger, and lifts
 * on an inner layer (a 3% scale and a shadow) while it is held.
 *
 * `group/tile`, not `group`: app/globals.css strips every transform and
 * transition inside a `.group` on a touch screen, and the lift is both.
 */
function GalleryTile({ id, item, index, count, video, onMove, onRemove }: { id: string; item: GalleryItem; index: number; count: number; video?: GalleryVideoView; onMove: (from: number, to: number) => void; onRemove: (i: number) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const still = item.type === "image" ? optimizedImageUrl(item.url, 480) : item.type === "embed" ? item.thumb : video?.thumbnailUrl
  const kind = kindWord(item)
  const menu: ActionMenuItem[] = [
    ...(index > 0 ? [{ label: tt("Show first"), onClick: () => onMove(index, 0) }, { label: tt("Move earlier"), onClick: () => onMove(index, index - 1) }] : []),
    ...(index < count - 1 ? [{ label: tt("Move later"), onClick: () => onMove(index, index + 1) }] : []),
    { label: tt("Remove"), variant: "destructive" as const, separatorBefore: count > 1, onClick: () => onRemove(index) },
  ]
  return (
    <li
      ref={setNodeRef}
      data-gallery-item={item.type}
      data-gallery-key={id}
      data-lifted={isDragging ? "" : undefined}
      className="relative list-none"
      style={{
        transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <div
        className={cn(
          "group/tile relative aspect-[16/10] overflow-hidden rounded-xl bg-[#eceef1] select-none [-webkit-touch-callout:none]",
          "transition-[scale,box-shadow] duration-150 ease-out motion-reduce:transition-none",
          isDragging ? "scale-[1.03] shadow-[0_14px_30px_-10px_rgba(17,24,39,0.35),0_2px_6px_rgba(17,24,39,0.1)]" : "shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.05)]",
        )}
      >
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt="" draggable={false} loading={index < 4 ? undefined : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
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

        {/* The handle: the whole tile. */}
        <div
          ref={setActivatorNodeRef}
          data-gallery-handle=""
          {...attributes}
          {...listeners}
          aria-label={tt("Move {kind} {value}", { kind, value: index + 1 })}
          className={cn("absolute inset-0 bg-black/0 outline-none transition-colors duration-100 group-hover/tile:bg-black/10 focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]", HANDLE_TOUCH)}
        />

        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1">
          <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded-md bg-black/55 px-1 text-[11px] font-medium tabular-nums text-white">{index + 1}</span>
          {index === 0 ? <span className="rounded-md bg-white/92 px-1.5 py-0.5 text-[11px] font-medium text-[#1a1a2e]">{tt("First")}</span> : null}
        </span>
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1">
          {item.type === "video" && video && video.status !== "ready" ? <span className="rounded-md bg-white/92 px-1.5 py-0.5 text-[11px] font-medium text-[#92400e]">{video.status === "failed" ? tt("Failed") : tt("Processing")}</span> : null}
          {item.type === "embed" ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{PROVIDER[item.provider]}</span> : null}
          {item.type === "video" && video?.durationSeconds ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">{duration(video.durationSeconds)}</span> : null}
        </span>

        {/* The menu: over the handle, its own button. Always there on a touch screen; under the pointer or the keyboard on a computer. */}
        <span className="absolute right-0.5 top-0.5 z-10 opacity-100 transition-opacity duration-100 md:opacity-0 md:group-hover/tile:opacity-100 md:group-focus-within/tile:opacity-100 md:[&:has([data-state=open])]:opacity-100">
          <ResponsiveActionMenu
            title={item.type === "image" ? tt("Picture {value}", { value: index + 1 }) : tt("Video {value}", { value: index + 1 })}
            align="end"
            items={menu}
            trigger={
              <button type="button" aria-label={tt("Options for {kind} {value}", { kind, value: index + 1 })} data-tile-menu="" className="grid h-10 w-10 cursor-pointer place-items-center outline-none [-webkit-tap-highlight-color:transparent] focus-visible:[&>span]:shadow-[0_0_0_2px_#1a1a2e]">
                {/* Drawn 28px, pressed 40px: the picture stays the thing you see. */}
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              </button>
            }
          />
        </span>
      </div>
    </li>
  )
}

/**
 * A FILE ON ITS WAY UP (the product editor's PendingTile): a picture shows
 * itself the moment it is picked, soft and a little dim, coming into focus
 * as its bytes go up, with a line along its foot that fills with them. A
 * video has no picture yet: the grey tile, its percent and the line.
 */
function PendingTile({ pending }: { pending: Uploading }) {
  const p = Math.max(0, Math.min(100, pending.percent)) / 100
  return (
    <li data-gallery-uploading={pending.kind} className="relative list-none animate-in fade-in zoom-in-[0.97] duration-300 ease-out motion-reduce:animate-none">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#eceef1] select-none">
        {pending.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pending.preview}
            alt=""
            draggable={false}
            className="h-full w-full object-cover transition-[filter,transform] duration-500 ease-out motion-reduce:transition-none"
            style={{ filter: `blur(${(1 - p) * 10}px) saturate(${0.6 + p * 0.4}) brightness(${0.92 + p * 0.08})`, transform: `scale(${1.04 - p * 0.04})` }}
          />
        ) : (
          <span className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 text-[#4b5563]">
            <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            <span className="text-[12px] font-medium tabular-nums">{tt("Video {percent}%", { percent: pending.percent })}</span>
          </span>
        )}
        <span
          role="progressbar"
          aria-label={pending.kind === "video" ? tt("Uploading video") : tt("Uploading picture")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pending.percent}
          className="absolute inset-x-2.5 bottom-2.5 h-[3px] overflow-hidden rounded-full bg-black/15"
        >
          <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${p.toFixed(3)})` }} />
        </span>
      </div>
    </li>
  )
}

/**
 * A YOUTUBE OR VIMEO LINK, pasted. Read on the spot with the composer's own
 * parser, so "Add" either takes it or says what is wrong in one line under
 * the field (nothing is saved until the page's Save). Enter adds, Escape
 * closes.
 */
export function VideoLinkField({ onAdd, onCancel, className, submitLabel = tt("Add") }: { onAdd: (embed: GalleryEmbed) => string | null; onCancel: () => void; className?: string; submitLabel?: string }) {
  const [text, setText] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    input.current?.focus()
  }, [])
  const submit = () => {
    const embed = galleryEmbed(text.trim())
    if (!embed) return setError(text.trim() ? tt("That is not a YouTube or Vimeo video link.") : tt("Paste a YouTube or Vimeo link."))
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
          aria-label={tt("YouTube or Vimeo link")}
          aria-invalid={!!error}
          className={cn(field, "h-11 min-w-0 flex-1 basis-full sm:h-9 sm:basis-auto", error && "border-[#f1b4ae]")}
        />
        <button type="button" onClick={submit} className={cn(buttonPrimary, "h-10 sm:h-9")} data-video-link-add="">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={cn(buttonSecondary, "h-10 sm:h-9")}>
          {tt("Cancel")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] text-[#b42318]" data-video-link-error="">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-[#6b7280]">{tt("It plays on your page in the YouTube or Vimeo player.")}</p>
      )}
    </div>
  )
}

/**
 * THE COVER: A PICTURE, AN UPLOADED VIDEO, OR A YOUTUBE OR VIMEO VIDEO
 * (round 11, ask 27; the upload round 13, ask 21; round 31 drew it as one
 * wide frame with one way to change it). The frame shows the cover at the
 * shape the page shows it; Change (or Add a cover) opens the choice:
 *
 *   A PICTURE  the logo's upload (usePictureUpload): drawn at once from the
 *              file, a ring for how far it is. A picture dropped on the
 *              frame goes up too.
 *   UPLOADED   a video, through the community's video upload, waited on
 *              until it plays (a video service processes it first); a still
 *              taken from the file goes up beside it as the cover picture,
 *              so Explore, the cards and a shared link keep a picture. The
 *              video is the gallery's first item, marked as the cover.
 *   LINKED     YouTube or Vimeo: on Save the route makes its still the cover
 *              picture (Vimeo's arrives with the save).
 *
 * Save waits while a cover is on its way (onBusy). Removing a linked video
 * leaves no cover; removing an uploaded one keeps its still as the cover
 * picture, which can then be changed like any picture.
 */
export function CoverField({
  communityId,
  coverUrl,
  gallery,
  onChange,
  onError,
  onBusy,
}: {
  communityId?: string
  coverUrl: string | null
  gallery: GalleryItem[]
  onChange: (next: { coverUrl: string | null; gallery: GalleryItem[] }) => void
  onError?: (message: string) => void
  onBusy?: (busy: boolean) => void
}) {
  const video = coverVideo(gallery)
  const upload = coverUpload(gallery)
  const [linking, setLinking] = React.useState(false)
  const [sending, setSending] = React.useState<{ percent: number; processing: boolean; still: string | null } | null>(null)
  const [over, setOver] = React.useState(false)
  const picker = React.useRef<HTMLInputElement>(null)
  const photo = React.useRef<HTMLInputElement>(null)
  /* The newest gallery and picture, for an upload that finishes after other changes. */
  const latest = React.useRef({ gallery, coverUrl })
  latest.current = { gallery, coverUrl }
  const after = (list: GalleryItem[]) => (coverItem(list) ? list.slice(1) : list)
  const fail = (m: string) => onError?.(m)
  /* A picture as the cover: any cover video gives its place back to the gallery's order. */
  const pictureUp = usePictureUpload({
    maxEdge: 2000,
    onDone: (url) => {
      const now = latest.current
      onChange({ coverUrl: url, gallery: after(now.gallery) })
    },
    onError: fail,
  })

  React.useEffect(() => {
    onBusy?.(!!sending || pictureUp.busy)
  }, [sending, pictureUp.busy, onBusy])

  const setVideo = (embed: GalleryEmbed): string | null => {
    const rest = after(gallery).filter((x) => keyOf(x) !== keyOf(embed))
    if (rest.length >= GALLERY_MAX) return tt("The gallery is full ({galleryMax}). Remove one first.", { galleryMax: GALLERY_MAX })
    onChange({ coverUrl: null, gallery: [{ ...embed, cover: true }, ...rest] })
    setLinking(false)
    return null
  }

  const uploadVideo = async (file: File | undefined) => {
    if (!file || !communityId || sending) return
    if (!file.type.startsWith("video/")) return onError?.(tt("That file is not a video."))
    if (after(gallery).length >= GALLERY_MAX) return onError?.(tt("The gallery is full ({galleryMax}). Remove one first.", { galleryMax: GALLERY_MAX }))
    setLinking(false)
    setSending({ percent: 0, processing: false, still: null })
    const endpoint = `/api/app/community/${communityId}/videos`
    try {
      const [ready, stillUrl] = await Promise.all([
        uploadCommunityVideo({ endpoint, file, onProgress: (p) => setSending((x) => (x ? { ...x, percent: Math.min(99, Math.round(p)) } : x)) }).then((v) => {
          if (v.status === "ready") return v
          setSending((x) => (x ? { ...x, percent: 100, processing: true } : x))
          return waitUntilPlayable({ endpoint, video: v })
        }),
        /* The still: shown at once, and kept as the cover picture. */
        videoStill(file).then(async (still) => {
          if (!still) return null
          const local = URL.createObjectURL(still.blob)
          setSending((x) => (x ? { ...x, still: local } : x))
          const uploader = new DirectUploader({ file: new File([still.blob], "cover.jpg", { type: "image/jpeg" }), folder: "product-images" })
          try {
            return (await uploader.start()).publicUrl || null
          } catch {
            return null
          } finally {
            uploader.destroy()
          }
        }),
      ])
      const now = latest.current
      const others = after(now.gallery).filter((x) => !(x.type === "video" && x.videoId === ready.id))
      onChange({ coverUrl: stillUrl || ready.thumbnailUrl || now.coverUrl, gallery: [{ type: "video", videoId: ready.id, cover: true }, ...others] })
    } catch (e) {
      onError?.((e as { message?: string })?.message || tt("The video did not upload. Try again."))
    } finally {
      setSending((x) => {
        if (x?.still) URL.revokeObjectURL(x.still)
        return null
      })
    }
  }

  const removeCover = () => {
    if (video || upload) onChange({ coverUrl: video ? null : coverUrl, gallery: gallery.slice(1) })
    else onChange({ coverUrl: null, gallery })
  }

  const busy = !!sending || pictureUp.busy
  const has = !!(video || upload || coverUrl)
  const still = sending ? sending.still : pictureUp.busy ? pictureUp.local : video ? video.thumb : coverUrl
  const menu: ActionMenuItem[] = [
    { label: tt("Upload a picture"), icon: <ImagePlus className="h-4 w-4" aria-hidden />, onClick: () => photo.current?.click() },
    ...(communityId ? [{ label: tt("Upload a video"), icon: <Upload className="h-4 w-4" aria-hidden />, onClick: () => picker.current?.click() }] : []),
    { label: tt("YouTube or Vimeo link"), icon: <Link2 className="h-4 w-4" aria-hidden />, onClick: () => setLinking(true) },
  ]

  return (
    <div className="min-w-0" data-cover-field="" data-cover-video={video ? video.provider : upload ? "upload" : undefined} data-cover-picture={!video && !upload ? "" : undefined} data-cover-sending={sending ? (sending.processing ? "processing" : "uploading") : undefined}>
      <input ref={picker} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => (void uploadVideo(e.target.files?.[0]), (e.target.value = ""))} data-cover-video-input="" />
      <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => (void pictureUp.upload(e.target.files?.[0]), (e.target.value = ""))} data-cover-picture-input="" />
      <div
        onDragOver={(e) => {
          if (busy || !Array.from(e.dataTransfer.types).includes("Files")) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0]
          if (!f) return
          e.preventDefault()
          setOver(false)
          if (f.type.startsWith("video/")) void uploadVideo(f)
          else void pictureUp.upload(f)
        }}
        data-cover-frame=""
        className={cn(
          "relative aspect-[3/1] w-full overflow-hidden rounded-xl transition-[box-shadow,border-color,background-color] duration-150",
          has || busy ? "bg-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.06)]" : "border border-dashed border-[#d3d6dc] bg-[#fafafb]",
          over && "shadow-[0_0_0_2px_#1a1a2e,0_0_0_6px_rgba(26,26,46,0.08)]",
        )}
      >
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={busy ? still : optimizedImageUrl(still, 1200)} alt="" className={cn("absolute inset-0 h-full w-full object-cover", sending && "opacity-60")} decoding="async" />
        ) : null}
        {!has && !busy ? (
          <button type="button" onClick={() => photo.current?.click()} className="absolute inset-0 grid cursor-pointer place-content-center justify-items-center gap-1 text-[#6b7280] outline-none transition-colors hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" data-cover-empty="">
            <ImagePlus aria-hidden className="h-5 w-5" />
            <span className="text-[13px] font-medium">{tt("Add a cover")}</span>
            <span className="text-[11.5px] text-[#9ca3af] max-md:hidden">{tt("Wide, about 3 to 1. Or drop it here.")}</span>
          </button>
        ) : null}
        {(video || upload) && !busy ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        ) : null}
        {(video || upload) && !busy ? <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{video ? PROVIDER[video.provider] : tt("Video")}</span> : null}
        {sending ? (
          <span className="absolute inset-0 grid place-content-center justify-items-center gap-1 text-white">
            <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            <span className="text-[12px] font-semibold tabular-nums">{sending.processing ? tt("Getting the video ready to play") : tt("Uploading the video, {percent}%", { percent: sending.percent })}</span>
          </span>
        ) : pictureUp.busy ? (
          <UploadRing percent={pictureUp.percent} />
        ) : null}
      </div>
      {linking ? (
        <VideoLinkField className="mt-3" submitLabel={tt("Use")} onCancel={() => setLinking(false)} onAdd={setVideo} />
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <ResponsiveActionMenu
            title={tt("Cover")}
            align="start"
            items={menu}
            trigger={
              <button type="button" disabled={busy} className={cn(buttonSecondary, "h-10 sm:h-8")} data-cover-change="">
                {has ? tt("Change cover") : tt("Add a cover")}
              </button>
            }
          />
          {has && !busy ? <RemoveButton label={tt("Remove the cover")} onClick={removeCover} className="max-sm:h-10 max-sm:w-10" /> : null}
        </div>
      )}
    </div>
  )
}
