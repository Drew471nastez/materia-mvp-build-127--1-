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
 * and the others slide out of its way (./gallery-tiles.tsx). Each tile also has one menu (show
 * first, earlier, later, remove), so nothing needs a drag at all.
 *
 * A tile that is still uploading is shown with its own picture coming into
 * focus and a line filling under it, and is not part of the gallery until it
 * is done, so Save never sends half a file.
 *
 * ROUND 32, THE OWNER: "the gallery tiles are small, Add pictures is a narrow
 * box with wrapped text, buttons below; not smooth like Storelib's other
 * pages". The gallery is now drawn as a product's media is in the product
 * editor: the same 16:9 tiles at the same sizes (two a row on a phone, three
 * wider, the full width of the card), and under them the same dashed zone
 * across the card, which takes pictures and videos in one picker or a drop,
 * with the YouTube or Vimeo link beside its button.
 */
import * as React from "react"
import { DndContext, closestCenter, type Announcements, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"
import { ImagePlus, Link2, Loader2, Play, Plus, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { uploadCommunityVideo, waitUntilPlayable } from "@/lib/video/upload-client"
import { videoStill } from "@/components/community/member/media-upload"
import { AUTO_SCROLL, liftTick, useHoldToDragSensors } from "@/app/app/products/new/hold-to-drag"
import { GalleryTile, PendingTile, type Uploading } from "./gallery-tiles"
import { GALLERY_MAX, coverItem, coverUpload, coverVideo, galleryEmbed, galleryKey, moveItem, type GalleryEmbed, type GalleryItem } from "./logic"
import type { GalleryVideoView } from "./view-types"
import { RemoveButton, UploadRing, buttonPrimary, buttonSecondary, field, usePictureUpload } from "./parts"
import { tt } from "@/lib/i18n/text"

const keyOf = galleryKey
const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const

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

  /* Files from the zone's own picker: pictures together, each video on its own, as a drop. */
  const openPicker = () => pictures.current?.click()

  return (
    <div data-gallery="">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-[#4b5563]">{tt("Gallery")}</p>
        <p className="text-[12.5px] tabular-nums text-[#6b7280]" data-gallery-count="">
          {tt("{length} of {max}", { length: value.length, max: GALLERY_MAX })}
        </p>
      </div>
      {value.length > 1 ? (
        <p className="-mt-1 mb-2.5 text-[12.5px] text-[#6b7280]" data-gallery-hint="">
          <span className="md:hidden">{tt("Hold a tile to move it. The first is shown first.")}</span>
          <span className="max-md:hidden">{tt("Drag a tile to move it. The first is shown first.")}</span>
        </p>
      ) : null}
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
          {/* The product editor's media grid (app/app/products/new/media-grid.tsx): 16:9 tiles, two a row on a phone, three wider. */}
          {value.length || uploading.length ? (
            <ul
              aria-label={tt("Gallery")}
              data-gallery-grid=""
              data-dragging={lifted != null ? "" : undefined}
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
              className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3"
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
            </ul>
          ) : null}
        </SortableContext>
      </DndContext>
      <input
        ref={pictures}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (files.length) takeFiles(files)
        }}
      />
      {/*
        THE PRODUCT EDITOR'S UPLOAD ZONE (round 32: "the gallery is not smooth like Storelib uses for this across other
        pages"): the width of the card, under the tiles, rather than a narrow tile of its own with its words wrapped and
        two more buttons under it. A press opens the picker for pictures and videos together; files dropped on it (or on
        the tiles) go up the same way; a YouTube or Vimeo link is pasted from its second button.
      */}
      {room > 0 ? (
        <div
          role="presentation"
          onClick={openPicker}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
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
          data-gallery-drop={dropping ? "over" : ""}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-[border-color,background-color] duration-150 sm:py-7 [-webkit-tap-highlight-color:transparent]",
            dropping ? "border-[#1a1a2e] bg-[#f6f7f9]" : "border-[#d1d5db] hover:border-[#9ca3af] hover:bg-[#fafafb]",
          )}
        >
          {dropping ? (
            <div className="flex flex-col items-center gap-2 py-1.5">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.06)]">
                <Plus className="h-5 w-5 text-[#1a1a2e]" />
              </span>
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Drop to add pictures and videos")}</p>
            </div>
          ) : (
            <>
              <p className="mb-2.5 text-[13px] text-[#6b7280] max-md:hidden sm:mb-3 sm:text-[14px]">{value.length ? tt("Drag pictures or a video here, or") : tt("Drag the first pictures or a video here, or")}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPicker()
                  }}
                  className={cn(buttonSecondary, "h-10 sm:h-9 sm:px-3.5")}
                  data-gallery-add-tile=""
                >
                  <Plus aria-hidden className="h-4 w-4" />
                  {value.length ? tt("Add pictures or video") : tt("Upload")}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLinking(true)
                  }}
                  aria-expanded={linking}
                  className={cn(buttonSecondary, "h-10 border-transparent bg-transparent shadow-none sm:h-9 sm:px-3")}
                  data-gallery-add-link=""
                >
                  <Link2 aria-hidden className="h-4 w-4" />
                  {tt("YouTube or Vimeo link")}
                </button>
              </div>
              <p className="mt-2.5 text-[12px] text-[#9ca3af]">{tt("Up to {room} more pictures or videos.", { room })}</p>
            </>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] text-[#6b7280]" data-gallery-full="">{tt("The gallery is full. Remove one to add another.")}</p>
      )}
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
