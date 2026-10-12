"use client"

/**
 * ===========================================================================
 *  FILES: EVERY PICTURE THE STORE HAS, TO MANAGE OR TO PICK FROM
 * ===========================================================================
 * One component, two uses:
 *
 *   manage   /app/files: upload, search, filter by where a picture came
 *            from, open one for its details (size, type, date, where it's
 *            from, its link) and delete it
 *   pick     "Choose from your files" (the website builder's image fields,
 *            Settings > Store details): the same grid, and a press chooses
 *            the picture. A bottom sheet on a phone, a window on a computer
 *            (FilesLibraryChooser below)
 *
 * The list is the API's (app/api/files, lib/files/library.ts). An upload goes
 * straight to storage into the owner's own library folder, without its
 * location and camera details, the way the builder's image field uploads.
 *
 * WHAT A TILE DOES TO STAY SMOOTH
 *
 *   SMALL. A tile is drawn from a copy the width it is shown at
 *   (lib/files/thumb.ts, Next's optimizer), never the camera original.
 *
 *   OFF THE MAIN THREAD. `decoding="async"`, eager for the first rows only
 *   and lazy after them.
 *
 *   NO SHIFT, NO POP. Every tile is a fixed square with a quiet grey in it
 *   from the first frame. The picture is decoded before it is shown and then
 *   fades in over 200ms; one the browser already has is there at once, with
 *   no fade. Both are written straight onto the element (data-loaded), so a
 *   picture arriving never renders React.
 *
 * WHAT A SWITCH DOES (a pill, a search)
 *
 *   The list is read once and kept for the session (`kept` below), so a
 *   chooser opened again shows it at once and refreshes underneath, and a
 *   pill or a search only filters what is already here: nothing waits on
 *   the network and nothing goes empty. The grid itself fades out (90ms),
 *   changes while it is out of sight, and fades back in (160ms): opacity
 *   only, on the compositor, nothing copied (`swapGrid`, round 21).
 *
 * NEVER A BROKEN PICTURE. A copy the optimizer refuses falls back to the
 * original; an original that will not draw either leaves a clean tile with
 * the file's type on it (PNG, HEIC), and when its address answers not found
 * the file is gone from storage, so the tile leaves the list. A picture
 * smaller than its tile (an icon) is drawn at its own size, centred, not
 * stretched into a blur (lib/files/thumb.ts, rawSize).
 *
 * THE THREE DOTS. One menu for the whole grid, not one per tile: on a
 * computer a dropdown held against the dots that were pressed, on a phone
 * the shared action sheet. Preview, Copy link, Download and Delete, each the
 * real thing (app/api/files for the delete, the file's own public address for
 * the rest), and while picking, Open in Files (/app/files?file=<id>, where
 * that file's details open). There is no Rename: a file's name is its
 * address, so renaming it would empty every page that shows it.
 *
 * WHAT THE BUILDER'S FIELDS GET FROM IT
 *
 *   PICTURES OR VIDEOS. `kind` ("image" by default, "video" for a video
 *   setting) is which list the API is asked for (/api/files?kind=video), what
 *   an upload takes, and what a tile draws: a video's first frame, or a
 *   clean tile with a film mark when there is none to show.
 *
 *   ASKED FOR AHEAD. `prefetchLibrary` fills the same kept list before the
 *   chooser opens: once when a picture field shows, and with the first
 *   screen of pictures fetched and decoded on a hover of the field's button,
 *   so the chooser opens on the grid. A list younger than a minute is not
 *   asked for again.
 *
 *   SOMETHING TO SHOW AT ONCE. A pick hands the field a `PickHint` beside the
 *   address: the copy the tile already decoded, or the file just dropped, so
 *   the field draws it on the next frame while the stored copy loads.
 *
 *   UPLOADS SAY HOW FAR THEY ARE. Each file dropped or chosen is a tile at the
 *   top of the grid with its own preview and progress bar (XMLHttpRequest's
 *   upload progress) until it is stored. One file dropped while picking is
 *   the one picked.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, Copy, Download, ExternalLink, Eye, Film, ImageIcon, ImagePlus, MoreHorizontal, Play, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { isOwnMedia, mediaUrl } from "@/lib/storage/media-url"
import { fileThumb, filePreview, rawSize, tooSmallFor } from "@/lib/files/thumb"
import { downloadBlob, saveFile, savedMessage, savePlatform } from "@/lib/platform/save-file"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Notice, api } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ActionDropdownContent, ActionSheetRows, groupsOf, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { afterLayout } from "@/lib/ui/after-layout"
import { VIDEO_ACCEPT, durationText } from "@/lib/media/video"
import { isVideoFile, putObject, uploadVideo, videoRefusal } from "@/lib/files/upload-video"
import { tt, msg } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

export interface LibraryFile {
  id: string
  bucket: "store-builder-images" | "product-images"
  path: string
  name: string
  url: string
  bytes: number | null
  type: string | null
  createdAt: string | null
  source: string
  /** A video's first frame, stored beside it at upload, or null (lib/files/library.ts). */
  poster?: string | null
  /** A video's length in seconds, or null. */
  duration?: number | null
}

/**
 * Pictures, the videos a video setting can play, or both: Files itself and a
 * product's photos and videos (lib/files/library.ts).
 */
export type LibraryKind = "image" | "video" | "media"

/** What a pick hands over beside the address: something already on screen to show while the stored copy loads. */
export interface PickHint {
  /** The resized copy the tile already decoded. */
  thumb?: string
  /** The file just uploaded, for a local preview. */
  file?: File
}

const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif"
const MAX_BYTES = 5 * 1024 * 1024
const ALL_SOURCES = [msg("All"), msg("Library"), msg("Website"), msg("Product photos"), msg("Videos")] as const
type Source = (typeof ALL_SOURCES)[number]
const SOURCES: readonly Source[] = [msg("All"), msg("Library"), msg("Website"), msg("Product photos")]
/* A list of videos: where each came from (a product's videos are kept with its photos). */
const VIDEO_SOURCES: readonly Source[] = [msg("All"), msg("Library"), msg("Website"), msg("Product photos")]
/* Pictures and videos together: the same, and a pill for the videos alone. */
const MEDIA_SOURCES: readonly Source[] = ALL_SOURCES
/* The rows drawn at once: three on a phone at three across, three in the window at four across. */
const EAGER = 12
/* A pill's first screen and a little more, fetched ahead (on idle, and on a hover of its pill) so a switch shows pictures, never grey squares filling in. */
const WARM = 24
/* Above a sheet that is itself above the page (the chooser), for what opens from inside it. */
const OVER_SHEET_Z = 210
const PHONE = "(max-width: 639px)"

export function sizeText(bytes: number | null): string {
  if (bytes === null) return tt("Unknown size")
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return tt("{value} KB", { value: Math.round(bytes / 1024) })
  return tt("{value} MB", { value: (bytes / (1024 * 1024)).toFixed(1) })
}

function dateText(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat(appLocale(), zoned({ day: "numeric", month: "short", year: "numeric" })).format(new Date(iso))
  } catch {
    return ""
  }
}

/* ── The list, kept for the session, one per kind ───────────────────────── */

/** How long a kept list is used as it is before a prefetch asks again. */
const FRESH_MS = 60_000
type ListResult = { files?: LibraryFile[]; error?: string }
const kept: Record<LibraryKind, LibraryFile[] | null> = { image: null, video: null, media: null }
const keptAt: Record<LibraryKind, number> = { image: 0, video: 0, media: 0 }
const inFlight: Record<LibraryKind, Promise<ListResult> | null> = { image: null, video: null, media: null }
/* Every library on screen hears a list arrive, whoever asked for it (a prefetch, an upload). */
const listeners = new Set<(kind: LibraryKind, r: ListResult) => void>()

function fetchList(kind: LibraryKind): Promise<ListResult> {
  const asking = inFlight[kind]
  if (asking) return asking
  const next = (async (): Promise<ListResult> => {
    const r = await api<{ files: LibraryFile[] }>(kind === "image" ? "/api/files" : `/api/files?kind=${kind}`)
    if ("error" in r) return { error: r.error }
    kept[kind] = r.data.files
    keptAt[kind] = Date.now()
    return { files: r.data.files }
  })()
    .then((r) => {
      listeners.forEach((l) => l(kind, r))
      return r
    })
    .finally(() => {
      inFlight[kind] = null
    })
  inFlight[kind] = next
  return next
}

/** The first screen of pictures, fetched at the size a tile asks for and decoded, so the tiles are there on their first frame. */
function warm(files: LibraryFile[]) {
  if (typeof Image === "undefined") return
  for (const f of files.slice(0, EAGER)) {
    if (isVideo(f) && !f.poster) continue
    const t = fileThumb(isVideo(f) ? (f.poster as string) : f.url)
    const img = new Image()
    img.decoding = "async"
    if (t.srcSet && t.sizes) {
      img.sizes = t.sizes
      img.srcset = t.srcSet
    }
    img.src = t.src
    img.decode().catch(() => {})
  }
}

/**
 * The store's files of one kind, asked for before the chooser opens and
 * kept: once when a picture field shows, and with `warmFirst` on a hover of
 * its button, a moment before the press. A list younger than FRESH_MS is
 * used as it is unless `force`.
 */
export function prefetchLibrary(kind: LibraryKind = "image", opts: { warmFirst?: boolean; force?: boolean } = {}): Promise<void> {
  const list = kept[kind]
  if (!opts.force && list && Date.now() - keptAt[kind] < FRESH_MS) {
    if (opts.warmFirst) warm(list)
    return Promise.resolve()
  }
  return fetchList(kind).then((r) => {
    if (opts.warmFirst && r.files) warm(r.files)
  })
}

function useLibraryList(kind: LibraryKind) {
  const [files, setFilesState] = React.useState<LibraryFile[] | null>(() => kept[kind])
  const [error, setError] = React.useState<string | null>(null)
  const setFiles = React.useCallback(
    (next: (prev: LibraryFile[] | null) => LibraryFile[] | null) => {
      setFilesState((prev) => {
        const out = next(prev)
        kept[kind] = out
        return out
      })
    },
    [kind],
  )
  const load = React.useCallback(async () => {
    await fetchList(kind)
  }, [kind])
  React.useEffect(() => {
    const hear = (k: LibraryKind, r: ListResult) => {
      if (k !== kind) return
      if (r.error) setError(r.error)
      else if (r.files) {
        const list = r.files
        /* A list that arrives while the chooser is still rising is drawn in pieces the browser can stop between, so no frame of the rise and no tap waits on sixty tiles. */
        React.startTransition(() => {
          setFilesState(list)
          setError(null)
        })
      }
    }
    listeners.add(hear)
    /* The kept list is always the newest: one that landed since the first render (a prefetch in between) is shown before asking. */
    setFilesState(kept[kind])
    void prefetchLibrary(kind)
    return () => {
      listeners.delete(hear)
    }
  }, [kind])
  return { files, setFiles, error, load }
}

/* ── One picture's actions ─────────────────────────────────────────────── */

function copyLink(f: LibraryFile) {
  if (!navigator.clipboard?.writeText) {
    toast.error(tt("Copying is not available here."))
    return
  }
  void navigator.clipboard.writeText(f.url).then(
    () => toast.success(tt("Link copied")),
    () => toast.error(tt("The link could not be copied.")),
  )
}

const isVideo = (f: LibraryFile) => !!f.type?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(f.name)
/** "Picture" or "Video", for what a toast or a question calls it. */
const noun = (f: LibraryFile) => (isVideo(f) ? tt("Video") : tt("Picture"))

async function downloadFile(f: LibraryFile) {
  try {
    const outcome = await saveFile({
      name: f.name,
      file: async () => {
        const res = await fetch(f.url, { credentials: "omit" })
        if (!res.ok) throw new Error(String(res.status))
        return res.blob()
      },
      /* A public file: the system browser in the app can open it as it is. */
      link: async () => f.url,
    })
    toast.success(savedMessage(outcome, noun(f)))
  } catch {
    toast.error(tt("The {value} could not be downloaded.", { value: noun(f).toLowerCase() }))
  }
}

/**
 * Several files as one zip (Files, Select, Download): one download, not a
 * prompt from the browser for each file. Stored as they are, since pictures
 * do not compress. In the app there is no download manager to hand a zip
 * to, so there Download takes one file at a time (`manyAtOnce`).
 */
async function downloadMany(list: LibraryFile[]) {
  if (list.length === 1) return downloadFile(list[0])
  try {
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    const taken = new Set<string>()
    const named = list.map((f) => {
      let name = f.name
      for (let n = 2; taken.has(name); n++) name = f.name.replace(/(\.[^.]*)?$/, (ext) => `-${n}${ext}`)
      taken.add(name)
      return { f, name }
    })
    await Promise.all(
      named.map(async ({ f, name }) => {
        const res = await fetch(f.url, { credentials: "omit" })
        if (!res.ok) throw new Error(String(res.status))
        zip.file(name, await res.blob())
      }),
    )
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), "storelib-files.zip")
    toast.success(tt("{length} files downloaded", { length: list.length }))
  } catch {
    toast.error(tt("The files could not be downloaded."))
  }
}

/** Whether Download can take several at once here: a browser, not the app. */
const manyAtOnce = () => savePlatform() === "web"

/* ── Uploads, each with how far it is ──────────────────────────────────── */

/**
 * One file into the owner's library folder. Straight to storage with the
 * signed-in session, by XMLHttpRequest so its tile can say how far it is;
 * through the storage client when there is no session to hand. A picture
 * goes without its location and camera details; a video as it is, with its
 * first frame and its length read in the browser and stored beside it
 * (lib/files/upload-video.ts), so its tile has a picture and a length.
 */
async function uploadOne(f: File, onProgress: (p: number) => void): Promise<LibraryFile> {
  if (isVideoFile(f)) {
    const v = await uploadVideo(f, "files", onProgress)
    return { id: `store-builder-images:${v.path}`, bucket: "store-builder-images", path: v.path, name: v.path.split("/").pop() ?? f.name, url: v.url, bytes: v.bytes, type: v.type, createdAt: new Date().toISOString(), source: "Library", poster: v.poster, duration: v.duration }
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error(tt("signed out"))
  const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")
  const path = `${user.id}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const body: Blob = await withoutMetadata(f)
  await putObject("store-builder-images", path, body, f.type, onProgress)
  confirmUpload("store-builder-images", path)
  const url = mediaUrl(supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl)
  return { id: `store-builder-images:${path}`, bucket: "store-builder-images", path, name: path.split("/").pop() ?? f.name, url, bytes: f.size, type: f.type, createdAt: new Date().toISOString(), source: "Library" }
}

/** What is refused before it is sent: the bucket would refuse it after. */
function refusal(f: File, kind: LibraryKind): string | null {
  if (kind === "video" || (kind === "media" && isVideoFile(f))) return videoRefusal(f)
  if (!TYPES.has(f.type)) return kind === "media" ? tt("{name}: only JPG, PNG, GIF, WebP and AVIF pictures, or MP4, WebM and MOV videos.", { name: f.name }) : tt("{name}: only JPG, PNG, GIF, WebP and AVIF pictures.", { name: f.name })
  if (f.size > MAX_BYTES) return tt("{name} is over 5 MB.", { name: f.name })
  return null
}

/** A file on its way up: a tile of its own until it is stored. */
type Pending = { key: string; name: string; preview: string | null; progress: number }

/**
 * The picture just uploaded, from memory, under its tile while the resized
 * copy loads, so the tile that replaces the pending one is never grey.
 * Let go of after a minute.
 */
const localPreview = new Map<string, string>()

/* ── A picture, shown once it is ready ─────────────────────────────────── */

/**
 * A picture smaller than its box (an icon, a favicon) at its own size,
 * centred, rather than stretched into a blur: the optimizer never enlarges,
 * so the copy is the original's pixels (lib/files/thumb.ts). Written onto
 * the element before it is shown, so it never jumps.
 */
/** Whether a file belongs in the grid for a pill and the words searched. */
function inGrid(f: LibraryFile, g: { source: Source; words: string }): boolean {
  const from = g.source === "All" || (g.source === "Videos" ? isVideo(f) : f.source === g.source)
  return from && (!g.words || f.name.toLowerCase().includes(g.words))
}

/** A tile put away or shown, as the Tile draws it (data-off, out of reach while away). */
function putAway(li: HTMLLIElement, off: boolean) {
  if (li.hasAttribute("data-off") === off) return
  /*
    A picture that arrived while its tile was put away was never styled there
    (content-visibility hidden), so shown now it would start its 200ms fade
    from nothing: a tile that blinks on a switch although its picture was
    ready. It is shown as it is.
  */
  if (!off) {
    li.querySelectorAll<HTMLElement>("[data-loaded]:not([data-instant])").forEach((el) => (el.dataset.instant = ""))
    li.querySelectorAll<HTMLImageElement>("img[data-file-img]:not([data-loaded])").forEach(revealIfReady)
  }
  li.toggleAttribute("data-off", off)
  li.inert = off
  if (off) li.setAttribute("aria-hidden", "true")
  else li.removeAttribute("aria-hidden")
}

function fitSmall(img: HTMLImageElement) {
  const box = img.parentElement
  if (!box || img.dataset.small !== undefined || !img.naturalWidth || /\.svg(?:$|[?#&])/i.test(img.currentSrc || img.src)) return
  const side = Math.min(box.clientWidth, box.clientHeight)
  /* In a pill that is not showing (a hidden tile has no size): measured when it shows (the layout effect after a switch). */
  if (!side) {
    img.dataset.fitLater = ""
    return
  }
  delete img.dataset.fitLater
  const src = img.currentSrc || img.src
  const raw = rawSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, currentSrc: src, sizes: img.getAttribute("sizes") ?? "" }, window.innerWidth)
  if (!tooSmallFor(raw, side)) return
  const size = (r: { w: number; h: number }) => {
    img.style.width = `${r.w}px`
    img.style.height = `${r.h}px`
    img.style.margin = "auto"
  }
  img.dataset.small = ""
  size(raw)
  /*
    A copy picked from a srcset reports its size rounded to whole CSS pixels,
    so the estimate can be a pixel out: the same address, already in the
    cache, read without a srcset gives the exact pixels.
  */
  if (!img.getAttribute("sizes")) return
  const exact = new Image()
  exact.onload = () => {
    if (img.currentSrc !== src && img.src !== src) return
    const r = { w: exact.naturalWidth, h: exact.naturalHeight }
    if (tooSmallFor(r, side)) return size(r)
    delete img.dataset.small
    img.style.width = img.style.height = img.style.margin = ""
  }
  exact.src = src
}

/** Whether a picture's tile is not being drawn now: put away in another pill, or off screen. */
function notDrawn(img: HTMLImageElement): boolean {
  if (img.closest("li[data-off]")) return true
  const check = (img as HTMLImageElement & { checkVisibility?: (o: { contentVisibilityAuto?: boolean }) => boolean }).checkVisibility
  return typeof check === "function" && !check.call(img, { contentVisibilityAuto: true })
}

/** Shown once decoded: straight onto the element, so nothing renders for it. */
function reveal(img: HTMLImageElement) {
  if (img.dataset.loaded !== undefined) return
  /*
    A tile that is not drawn (in a pill that is not showing, or off screen,
    skipped by content-visibility) has its decode() wait until it is drawn,
    which is the switch itself, so the picture faded in after it. Marked
    ready now, with no fade to sit through when it shows; the decode is still
    asked for, so the browser has it when it does.
  */
  if (notDrawn(img)) {
    fitSmall(img)
    img.dataset.instant = ""
    img.dataset.loaded = ""
    img.decode?.().catch(() => {})
    return
  }
  const show = () => {
    fitSmall(img)
    img.dataset.loaded = ""
  }
  if (typeof img.decode === "function") img.decode().then(show, show)
  else show()
}

/** A picture the browser already has is there on the first frame, with no fade to sit through. */
function revealIfReady(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth > 0 && img.dataset.loaded === undefined) {
    fitSmall(img)
    img.dataset.instant = ""
    img.dataset.loaded = ""
  }
}

/**
 * Whether a file's address answers that there is nothing there: not found
 * (storage says 400 or 404 for a missing object), or an empty body. Asked
 * only of Storelib's own addresses; anything it cannot tell (offline, a
 * refused request) is not gone.
 */
async function objectGone(url: string): Promise<boolean> {
  if (!isOwnMedia(url)) return false
  try {
    const r = await fetch(url, { method: "HEAD", credentials: "omit", cache: "no-store" })
    if (r.status === 400 || r.status === 404 || r.status === 410) return true
    return r.ok && r.headers.get("content-length") === "0"
  } catch {
    return false
  }
}

/**
 * The resized copy failed (a host the optimizer refused, say): the original,
 * once. When that fails too the tile shows its placeholder (data-failed),
 * never the browser's broken picture, and `gone` hears whether the file is
 * missing from storage altogether.
 */
function fallBack(img: HTMLImageElement, original: string, gone?: () => void) {
  if (img.dataset.fallback !== undefined || img.src === original) {
    img.dataset.failed = ""
    img.dataset.loaded = ""
    if (gone) void objectGone(original).then((yes) => yes && gone())
    return
  }
  img.dataset.fallback = ""
  img.removeAttribute("srcset")
  img.removeAttribute("sizes")
  img.src = original
}

/** What a placeholder says a file is: its type (PNG, HEIC), from what storage recorded or its name. */
function typeLabel(f: LibraryFile): string {
  const fromType = (f.type ?? "").split("/")[1]?.replace(/^(x-|vnd\.)/, "").replace("jpeg", "jpg").replace("quicktime", "mov").replace("svg+xml", "svg")
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1]
  return (fromType || fromName || "file").toUpperCase()
}

/** A clean tile for a file that will not draw: its kind and its type, on the same grey. */
function Placeholder({ file, className }: { file: LibraryFile; className?: string }) {
  return (
    <span className={cn("pointer-events-none absolute inset-0 flex-col items-center justify-center gap-1.5", className)} data-file-placeholder="">
      <ImageIcon className="h-5 w-5 text-[#9ca3af]" strokeWidth={1.75} aria-hidden />
      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.04em] text-[#6b7280] shadow-[0_0_0_1px_rgba(17,24,39,0.06)]">{typeLabel(file)}</span>
    </span>
  )
}

const IMG_FADE = "absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-200 ease-out data-[instant]:transition-none data-[loaded]:opacity-100 data-[failed]:invisible"
/* A video's first frame, the same fade; one that cannot be drawn leaves the clean tile under it (a film mark on the grey). */
const VIDEO_FADE = "pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 ease-out data-[instant]:transition-none data-[loaded]:opacity-100 data-[failed]:invisible"

/** A video that already has its first frame (seen before in this tab) is there at once. */
function frameIfReady(v: HTMLVideoElement | null) {
  if (v && v.readyState >= 2 && v.dataset.loaded === undefined) {
    v.dataset.instant = ""
    v.dataset.loaded = ""
  }
}

/**
 * A video tile. Its first frame as a picture when one was stored beside it at
 * upload (the same resized copy and fade as a photo's tile); otherwise the
 * video's own first frame (`#t=0.1`, which also makes Safari draw one with
 * only the metadata asked for), whose metadata also gives the length. Under
 * either, a clean tile with a film mark that stays if there is nothing to draw.
 */
function VideoFrame({ file, index, hidden, onGone }: { file: LibraryFile; index: number; hidden: boolean; onGone: () => void }) {
  const [seconds, setSeconds] = React.useState<number | null>(file.duration ?? null)
  const poster = React.useMemo(() => (file.poster ? fileThumb(file.poster) : null), [file.poster])
  const length = durationText(seconds)
  return (
    <>
      <Film className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
      {poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={revealIfReady}
          src={poster.src}
          srcSet={poster.srcSet}
          sizes={poster.sizes}
          alt=""
          draggable={false}
          loading={index < EAGER ? "eager" : "lazy"}
          fetchPriority={hidden ? "low" : "auto"}
          decoding="async"
          onLoad={(e) => reveal(e.currentTarget)}
          onError={(e) => fallBack(e.currentTarget, file.poster as string)}
          className={cn("peer", IMG_FADE, "object-cover")}
          data-file-img=""
          data-file-poster=""
        />
      ) : (
        <video
          ref={frameIfReady}
          src={`${file.url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d)) setSeconds(d)
          }}
          onLoadedData={(e) => {
            e.currentTarget.dataset.loaded = ""
          }}
          onError={(e) => {
            e.currentTarget.dataset.failed = ""
            void objectGone(file.url).then((yes) => yes && onGone())
          }}
          className={cn("peer", VIDEO_FADE)}
        />
      )}
      {/* What says it is a video: a small play mark and its length, in the corner a phone's thumb is not over. */}
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-black/55 px-1.5 text-[11px] font-medium leading-none tabular-nums text-white" data-file-video="">
        <Play className="h-2.5 w-2.5 fill-current" strokeWidth={0} aria-hidden />
        {length ? <span data-file-duration="">{length}</span> : <span className="sr-only">{tt("Video")}</span>}
      </span>
    </>
  )
}

/* ── A tile ─────────────────────────────────────────────────────────────── */

/*
  WHAT A TILE SHOWS, AND WHERE (round H).

  The picture, edge to edge on a light grey, and nothing over it until it is
  asked for. The owner's screenshot had a 32px near black disc with a check
  on one corner and a 32px white disc with three dots on the other, both over
  the photo: the controls were bigger than what they controlled.

    SELECTED   the picture draws in a little (a 0.92 scale, on the
               compositor) inside a 2px violet ring on a pale violet ground,
               and a 22px violet check with a white edge sits on its corner,
               the way Google Photos and Apple Photos mark a pick. Both for a
               pick in a list and for the picture a field already uses.
    SEVERAL    an empty white ring where the check will go: on hover with a
               mouse, always on a touch screen, where there is no hover.
    THE DOTS   24px, translucent dark, white dots, with a 40px target. With
               a mouse only on hover, on focus, or while its menu is open; on
               a touch screen always, quieter. A faint shade along the top of
               the picture keeps the ring and the dots readable on a white
               photo, only while they show.
    FOCUS      a 2px violet ring with a white edge inside the tile, from the
               keyboard only (outside it, content-visibility cut it off).

  The same tile is the Files page's (Select) and the chooser's, on a computer
  and in the phone sheet.
*/
const DOTS_TOUCH = "[@media(hover:none)]:bg-black/25"

const Tile = React.memo(function Tile({
  file,
  index,
  hidden,
  mode,
  chosen,
  selecting,
  ticked,
  menuOpen,
  onPress,
  onMenu,
  onGone,
}: {
  file: LibraryFile
  index: number
  hidden: boolean
  mode: "manage" | "pick"
  chosen: boolean
  /** Several at once: a press ticks the tile rather than picking or opening it. */
  selecting: boolean
  ticked: boolean
  menuOpen: boolean
  onPress: (f: LibraryFile) => void
  onMenu: (f: LibraryFile, button: HTMLButtonElement) => void
  /** Its address answers that there is nothing there. */
  onGone: (f: LibraryFile) => void
}) {
  const thumb = React.useMemo(() => fileThumb(file.url), [file.url])
  const video = isVideo(file)
  const local = localPreview.get(file.url)
  const on = selecting ? ticked : chosen
  const label = selecting ? `${ticked ? tt("Unselect") : tt("Select")} ${file.name}` : mode === "pick" ? tt("Use {name}", { name: file.name }) : tt("Open {name}", { name: file.name })
  return (
    /* Off screen a tile is skipped by the browser's layout and paint (content-visibility): a pill that shows sixty tiles lays out only the screenful (round 21). */
    <li
      className="group/tile relative [contain-intrinsic-size:auto_112px] [content-visibility:auto] data-[off]:pointer-events-none data-[off]:absolute data-[off]:left-0 data-[off]:top-0 data-[off]:w-0 data-[off]:[content-visibility:hidden]"
      data-file-tile={file.id}
      data-off={hidden ? "" : undefined}
      data-selected={on ? "" : undefined}
      aria-hidden={hidden || undefined}
      inert={hidden}
    >
      <button
        type="button"
        onClick={() => onPress(file)}
        className="group/btn relative block w-full rounded-xl text-left outline-none [-webkit-tap-highlight-color:transparent]"
        data-file={file.id}
        aria-label={label}
        aria-pressed={selecting ? ticked : undefined}
      >
        <span className="relative block">
          {/* The ring and the pale ground the picture draws in on; a hairline when not selected. */}
          <span
            aria-hidden
            data-file-ring={on ? "on" : "off"}
            className={cn(
              "pointer-events-none absolute inset-0 rounded-xl transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
              on ? "bg-[#f3efff] shadow-[inset_0_0_0_2px_#8b5cf6]" : "bg-transparent shadow-[inset_0_0_0_0_#8b5cf6]",
            )}
          />
          <span
            className={cn(
              "relative block aspect-square w-full overflow-hidden bg-[#f3f4f6] transition-[scale,border-radius] duration-150 ease-out motion-reduce:transition-none",
              "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)]",
              on ? "scale-[0.92] rounded-lg" : "scale-100 rounded-xl",
            )}
            data-file-box=""
          >
            {video ? (
              <VideoFrame file={file} index={index} hidden={hidden} onGone={() => onGone(file)} />
            ) : (
              <>
                {/* Just uploaded: the file from memory, under the resized copy until that has faded in. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {local ? <img src={local} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-contain" /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={revealIfReady}
                  src={thumb.src}
                  srcSet={thumb.srcSet}
                  sizes={thumb.sizes}
                  alt=""
                  draggable={false}
                  loading={index < EAGER ? "eager" : "lazy"}
                  /* A tile in another pill is fetched ahead, behind the ones on screen. */
                  fetchPriority={hidden ? "low" : "auto"}
                  decoding="async"
                  onLoad={(e) => reveal(e.currentTarget)}
                  onError={(e) => fallBack(e.currentTarget, file.url, () => onGone(file))}
                  className={cn("peer", IMG_FADE)}
                  data-file-img=""
                />
                {/* Only once the picture has failed: a clean tile with its type, never the broken picture. */}
                <Placeholder file={file} className="hidden peer-data-[failed]:flex" />
              </>
            )}
            {/* A faint shade along the top, only while the ring or the dots show, so they read on a white photo. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.22),rgba(0,0,0,0))] opacity-0 transition-opacity duration-150",
                "[@media(hover:hover)_and_(pointer:fine)]:group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
                menuOpen && "opacity-100",
              )}
            />
          </span>
          {/*
            The keyboard's focus ring, drawn inside the tile over the picture: a ring outside it is cut off,
            since an off screen tile is painted within its own box (content-visibility).
          */}
          <span aria-hidden data-file-focus="" className="pointer-events-none absolute inset-0 rounded-xl opacity-0 shadow-[inset_0_0_0_2px_#8b5cf6,inset_0_0_0_4px_#fff] group-focus-visible/btn:opacity-100" />
          {selecting || chosen ? (
            <span
              aria-hidden
              data-file-tick={on ? "on" : "off"}
              className={cn(
                "pointer-events-none absolute left-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-full transition-[opacity,scale,background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                on
                  ? "scale-100 bg-[#8b5cf6] text-white opacity-100 shadow-[0_0_0_1.5px_#fff,0_1px_3px_rgba(17,24,39,0.3)]"
                  : "scale-90 bg-black/10 text-transparent opacity-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.95),0_1px_2px_rgba(17,24,39,0.3)] [@media(hover:hover)_and_(pointer:fine)]:group-hover/tile:scale-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover/tile:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3.25} />
            </span>
          ) : null}
        </span>
        {mode === "manage" ? <span className="block truncate px-0.5 pt-1.5 text-[12px] leading-4 text-[#4b5563]">{file.name}</span> : null}
      </button>
      <button
        type="button"
        aria-label={tt("More for {name}", { name: file.name })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-file-menu=""
        onClick={(e) => onMenu(file, e.currentTarget)}
        className={cn(
          "absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/40 text-white outline-none transition-[opacity,background-color] duration-150 hover:bg-black/60 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-[#8b5cf6] [-webkit-tap-highlight-color:transparent]",
          /* A 40px target around the 24px mark. */
          "before:absolute before:-inset-2 before:content-['']",
          DOTS_TOUCH,
          /* Always there on a touch screen; with a mouse once the pointer is on the tile, or while its menu is open. */
          menuOpen ? "bg-black/60 opacity-100" : "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
    </li>
  )
})

/** A file on its way up: its own preview (or a film mark), dimmed, with how far it is. */
function PendingTile({ row }: { row: Pending }) {
  return (
    <li className="relative" data-file-pending="" aria-label={tt("Uploading {name}", { name: row.name })}>
      <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-[#eceef1] bg-[#f3f4f6]">
        {row.preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={row.preview} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain opacity-60" />
        ) : (
          <Film className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
        )}
        <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/10">
          <span className="block h-full rounded-full bg-[#1a1a2e] transition-[width] duration-200 ease-out" style={{ width: `${Math.round(Math.max(0.06, row.progress) * 100)}%` }} />
        </span>
      </span>
    </li>
  )
}

/* ── The library ────────────────────────────────────────────────────────── */

type Menu = { file: LibraryFile; anchor: HTMLButtonElement; box: DOMRect; phone: boolean; bound: Element | null }

/** One picked from several: its address, and what is already on screen for it. */
export type PickMany = Array<{ url: string; hint?: PickHint }>

/* ── The pills, with one white mark that slides between them ───────────── */

/**
 * Where a picture came from, as the segmented control Storelib's own pages
 * use (Support, Analytics): a grey track and a white mark under the one
 * chosen. The mark is one element that slides (`translate`, on the compositor)
 * rather than a fill that blinks from one pill to the next, and every pill
 * is the same height, so nothing below moves on a switch. Until the row is
 * measured the chosen pill draws its own white, so the first frame is
 * already right.
 */
function SourcePills({ sources, value, onChange, onWarm }: { sources: readonly Source[]; value: Source; onChange: (s: Source) => void; onWarm?: (s: Source) => void }) {
  const row = React.useRef<HTMLDivElement>(null)
  const [mark, setMark] = React.useState<{ x: number; w: number } | null>(null)
  const measure = React.useCallback(() => {
    const el = row.current?.querySelector<HTMLElement>(`[data-files-pill="${CSS.escape(value)}"]`)
    if (el) setMark((m) => (m && m.x === el.offsetLeft && m.w === el.offsetWidth ? m : { x: el.offsetLeft, w: el.offsetWidth }))
  }, [value])
  React.useLayoutEffect(measure, [measure])
  React.useEffect(() => {
    const el = row.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])
  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div ref={row} className="relative inline-flex h-10 items-center gap-0.5 rounded-xl bg-[#eef0f2] p-1" role="tablist" aria-label={tt("Where it came from")} data-files-pills="">
        <span
          aria-hidden
          data-files-pill-mark=""
          className={cn("absolute left-0 top-1 h-8 rounded-lg bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1),0_0_0_0.5px_rgba(16,24,40,0.04)] transition-[translate,width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", !mark && "opacity-0")}
          style={mark ? { width: mark.w, translate: `${mark.x}px 0` } : undefined}
        />
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={value === s}
            data-files-pill={s}
            onClick={() => onChange(s)}
            /* About to be pressed: its first screen is asked for now. */
            onPointerEnter={() => onWarm?.(s)}
            onTouchStart={() => onWarm?.(s)}
            onFocus={() => onWarm?.(s)}
            className={cn(
              "relative z-[1] inline-flex h-8 shrink-0 items-center rounded-lg px-3.5 text-[13.5px] font-medium transition-colors duration-200 [-webkit-tap-highlight-color:transparent]",
              value === s ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              value === s && !mark && "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1)]",
            )}
          >
            {tt(s)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FilesLibrary({
  mode = "manage",
  onPick,
  onPickMany,
  multiple = false,
  max,
  resetKey,
  selectedUrl,
  kind = "image",
  fill = false,
  openId,
}: {
  mode?: "manage" | "pick"
  onPick?: (url: string, hint?: PickHint) => void
  /** Picking several (`multiple`): every one ticked, in the order ticked. */
  onPickMany?: (picks: PickMany) => void
  /** Pick several at once, for a field that takes a list. */
  multiple?: boolean
  /** The most that can be ticked (the room left in the list). */
  max?: number
  /** Changes on each opening of the chooser, which starts with nothing ticked. */
  resetKey?: number
  selectedUrl?: string | null
  /** Pictures (the default) or videos. */
  kind?: LibraryKind
  /** Lay out as a column whose grid scrolls by itself (inside the chooser), rather than with the page. */
  fill?: boolean
  /** A file whose details open once the list is in (/app/files?file=<id>, from Open in Files). */
  openId?: string | null
}) {
  const { files, setFiles, error, load } = useLibraryList(kind)
  const [query, setQuery] = React.useState("")
  const [source, setSource] = React.useState<Source>("All")
  const [open, setOpen] = React.useState<LibraryFile | null>(null)
  const [confirming, setConfirming] = React.useState<LibraryFile | null>(null)
  const [confirmingMany, setConfirmingMany] = React.useState<LibraryFile[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [pending, setPending] = React.useState<Pending[]>([])
  const [dragOver, setDragOver] = React.useState(false)
  /* The three dots: which file, and the dots it opened from. */
  const [menu, setMenu] = React.useState<Menu | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  /* Several at once: picking for a list, or Select in Files. The ids ticked, in the order ticked. */
  const [selectingFiles, setSelectingFiles] = React.useState(false)
  const selecting = mode === "pick" ? multiple : selectingFiles
  const limit = mode === "pick" && multiple ? max : undefined
  const [ticked, setTickedState] = React.useState<string[]>([])
  const tickedRef = React.useRef<string[]>([])
  const setTicked = React.useCallback((next: string[]) => {
    tickedRef.current = next
    setTickedState(next)
  }, [])
  const pendingRef = React.useRef<(() => void) | null>(null)
  /* The dots whose dropdown a press outside just closed: the same press must not open it again. */
  const closedRef = React.useRef<{ anchor: HTMLElement; at: number } | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const viewRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const gridWrapRef = React.useRef<HTMLDivElement>(null)
  const swappedRef = React.useRef(false)

  const onPickRef = React.useRef(onPick)
  const onPickManyRef = React.useRef(onPickMany)
  React.useEffect(() => {
    onPickRef.current = onPick
    onPickManyRef.current = onPickMany
  })

  /* A new opening of the chooser starts with nothing ticked; drawn that way before its first frame. */
  React.useLayoutEffect(() => {
    if (resetKey !== undefined) setTicked([])
  }, [resetKey, setTicked])

  /* What the tile on screen already decoded, for the field to show while the stored copy loads. */
  const hintFor = React.useCallback((f: LibraryFile): PickHint | undefined => {
    if (isVideo(f)) return undefined
    const img = gridWrapRef.current?.querySelector<HTMLImageElement>(`[data-file-tile="${CSS.escape(f.id)}"] img[data-file-img]`)
    if (img && img.dataset.loaded !== undefined && img.dataset.failed === undefined && img.currentSrc) return { thumb: img.currentSrc }
    return undefined
  }, [])
  const pickFile = React.useCallback((f: LibraryFile) => onPickRef.current?.(f.url, hintFor(f)), [hintFor])

  /* ── Ticking ── */

  const tick = React.useCallback(
    (f: LibraryFile) => {
      const now = tickedRef.current
      if (now.includes(f.id)) return setTicked(now.filter((id) => id !== f.id))
      if (limit !== undefined && now.length >= limit) {
        toast.error(limit <= 0 ? tt("This list is full.") : tt("You can add up to {limit} here.", { limit }))
        return
      }
      setTicked([...now, f.id])
    },
    [limit, setTicked],
  )
  /* Files just uploaded while picking several are ticked, as far as there is room. */
  const tickMany = (list: LibraryFile[]) => {
    const now = tickedRef.current.slice()
    for (const f of list) if (!now.includes(f.id) && (limit === undefined || now.length < limit)) now.push(f.id)
    setTicked(now)
  }
  const tickedFiles = React.useCallback((): LibraryFile[] => {
    const byId = new Map((files ?? []).map((f) => [f.id, f]))
    return tickedRef.current.map((id) => byId.get(id)).filter((f): f is LibraryFile => !!f)
  }, [files])
  const addTicked = () => {
    const picks = tickedFiles().map((f) => ({ url: f.url, hint: hintFor(f) }))
    if (picks.length) onPickManyRef.current?.(picks)
  }
  const stopSelecting = () => {
    setTicked([])
    setSelectingFiles(false)
  }

  /* A file whose address answers that nothing is there: out of the list, and unticked. */
  const onGone = React.useCallback(
    (f: LibraryFile) => {
      setFiles((list) => list?.filter((x) => x.id !== f.id) ?? null)
      if (tickedRef.current.includes(f.id)) setTicked(tickedRef.current.filter((id) => id !== f.id))
    },
    [setFiles, setTicked],
  )

  const upload = async (list: FileList | File[]) => {
    const picked = Array.from(list).slice(0, 20)
    const bad = picked.map((f) => refusal(f, kind)).find(Boolean)
    if (bad) toast.error(bad)
    const good = picked.filter((f) => !refusal(f, kind))
    if (good.length === 0) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error(tt("Sign in again to upload."))
    const rows: Pending[] = good.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, preview: isVideoFile(f) ? null : URL.createObjectURL(f), progress: 0 }))
    setPending((p) => [...rows, ...p])
    const results = await Promise.all(
      good.map(async (f, i) => {
        const row = rows[i]
        try {
          return await uploadOne(f, (p) => setPending((all) => all.map((x) => (x.key === row.key ? { ...x, progress: Math.max(x.progress, p) } : x))))
        } catch {
          toast.error(tt("{name} could not be uploaded.", { name: f.name }))
          return null
        }
      }),
    )
    const added: LibraryFile[] = []
    results.forEach((a, i) => {
      if (!a) return
      added.push(a)
      const preview = rows[i].preview
      if (preview) localPreview.set(a.url, preview)
    })
    /* The stored files take the pending tiles' places at once; the list is asked for again underneath. */
    if (added.length) setFiles((all) => [...added, ...(all ?? []).filter((x) => !added.some((a) => a.id === x.id))])
    setPending((p) => p.filter((x) => !rows.some((r) => r.key === x.key)))
    window.setTimeout(() => {
      for (const [i, r] of rows.entries()) {
        if (!r.preview) continue
        const a = results[i]
        if (a) localPreview.delete(a.url)
        URL.revokeObjectURL(r.preview)
      }
    }, 60_000)
    void load()
    /* Picking several: what was just uploaded is ticked, to be added with the rest. */
    if (mode === "pick" && multiple) tickMany(added)
    /* One file dropped or chosen while picking: it is the one picked, with the file itself to show at once. */
    else if (mode === "pick" && added.length === 1 && good.length === 1) onPickRef.current?.(added[0].url, { file: good[0] })
    else if (added.length > 1) toast.success(tt("{length} files uploaded", { length: added.length }))
  }

  /* Open in Files lands on /app/files?file=<id>: that file's details, once the list is in. */
  React.useEffect(() => {
    if (!openId || !files) return
    const f = files.find((x) => x.id === openId)
    if (f) setOpen(f)
  }, [openId, files])

  const remove = async (f: LibraryFile) => {
    setDeleting(true)
    const r = await api("/api/files", { method: "DELETE", body: { bucket: f.bucket, path: f.path } })
    setDeleting(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    setFiles((list) => list?.filter((x) => x.id !== f.id) ?? null)
    if (tickedRef.current.includes(f.id)) setTicked(tickedRef.current.filter((id) => id !== f.id))
    setConfirming(null)
    setOpen((o) => (o?.id === f.id ? null : o))
    toast.success(tt("Deleted"))
  }

  /* Several at once (Files, Select, Delete): the API takes up to MAX_DELETE_AT_ONCE (100) a request. */
  const removeMany = async (list: LibraryFile[]) => {
    setDeleting(true)
    const done = new Set<string>()
    let failed: string | null = null
    for (let i = 0; i < list.length && !failed; i += 100) {
      const part = list.slice(i, i + 100)
      const r = await api("/api/files", { method: "DELETE", body: { files: part.map((f) => ({ bucket: f.bucket, path: f.path })) } })
      if ("error" in r) failed = r.error
      else part.forEach((f) => done.add(f.id))
    }
    setDeleting(false)
    if (done.size) {
      setFiles((all) => all?.filter((x) => !done.has(x.id)) ?? null)
      setTicked(tickedRef.current.filter((id) => !done.has(id)))
    }
    if (failed) {
      toast.error(failed)
      return
    }
    setConfirmingMany(null)
    stopSelecting()
    toast.success(done.size === 1 ? tt("Deleted") : tt("{size} files deleted", { size: done.size }))
  }

  /* ── The swap ── */

  /*
    ROUND H: NOTHING FADES ON A SWITCH. Round 21 faded the whole grid out (90ms) and back in (160ms) on every pill and
    every word typed: every picture on screen went to white and came back, which is the flash the owner saw between
    All, Library, Website and Product photos (scratchpad probe: 12 of 12 tiles on screen blank for two or three frames
    of every switch, desktop and phone). Now the press shows the tiles that belong and puts the rest away in the same
    frame, written straight onto them (a tile put away keeps its drawing and its decoded picture: content-visibility
    hidden), and React hears of it after, in a transition, and finds the tiles already as it would draw them. A tile in
    both pills never changes at all; only a tile whose picture has not arrived yet fades in, on its own.

    Every pill's first screen is fetched ahead (`warmPill`): on idle once the list is in, and at once on a hover or a
    touch of its pill, so the tiles a switch shows are already decoded.
  */
  const [grid, setGrid] = React.useState<{ source: Source; words: string }>({ source: "All", words: "" })
  const filesNow = React.useRef(files)
  filesNow.current = files
  const swapGrid = React.useCallback(
    (to: { source: Source; words: string }) => {
      const el = gridWrapRef.current?.querySelector<HTMLElement>(":scope > [data-files-grid]")
      if (el && !el.hidden) {
        const keep = new Set((filesNow.current ?? []).filter((f) => inGrid(f, to)).map((f) => f.id))
        for (const li of Array.from(el.querySelectorAll<HTMLLIElement>(":scope > li[data-file-tile]"))) putAway(li, !keep.has(li.dataset.fileTile ?? ""))
        if (fill && scrollRef.current && scrollRef.current.scrollTop !== 0) scrollRef.current.scrollTop = 0
        React.startTransition(() => setGrid(to))
        return
      }
      swappedRef.current = true
      setGrid(to)
    },
    [fill],
  )

  /** A pill's first screen, asked for now rather than when it is shown: `loading` eager on the tiles it will show first. */
  const warmPill = React.useCallback((s: Source) => {
    const wrap = gridWrapRef.current
    if (!wrap) return
    const first = (filesNow.current ?? []).filter((f) => inGrid(f, { source: s, words: "" })).slice(0, WARM)
    for (const f of first) {
      const img = wrap.querySelector<HTMLImageElement>(`[data-file-tile="${CSS.escape(f.id)}"] img[data-file-img]`)
      if (img && img.loading !== "eager") img.loading = "eager"
    }
  }, [])
  /* Once the list is drawn and the browser is idle, every pill's first screen, so no switch waits on the network. */
  const pillsFor = kind === "video" ? VIDEO_SOURCES : kind === "media" ? MEDIA_SOURCES : SOURCES
  React.useEffect(() => {
    if (!files?.length) return
    const run = () => pillsFor.forEach(warmPill)
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 1500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 400)
    return () => window.clearTimeout(t)
  }, [files, pillsFor, warmPill])

  const words = query.toLowerCase().trim()
  const shown = React.useMemo(() => (files ?? []).filter((f) => inGrid(f, grid)), [files, grid])
  /* Where each shown file is in the grid, for which are drawn at once. */
  const shownAt = React.useMemo(() => new Map(shown.map((f, i) => [f.id, i])), [shown])
  /*
    Where each file is in its own pill. A tile hidden now is still fetched
    and decoded ahead when it is on the first screen of its pill, so a
    switch shows pictures, not grey squares filling in.
  */
  const rankInSource = React.useMemo(() => {
    const seen = new Map<string, number>()
    const out = new Map<string, number>()
    for (const f of files ?? []) {
      const n = seen.get(f.source) ?? 0
      seen.set(f.source, n + 1)
      out.set(f.id, n)
    }
    return out
  }, [files])
  const tickedSet = React.useMemo(() => new Set(ticked), [ticked])

  /* The grid as drawn now. */
  React.useLayoutEffect(() => {
    /* Pictures that arrived while their pill was hidden are measured now that they have a size: after the browser's own layout, so the reads lay nothing out of their own. */
    const later = gridWrapRef.current?.querySelectorAll<HTMLImageElement>("img[data-fit-later]")
    const stopFit = later?.length ? afterLayout(() => later.forEach(fitSmall), gridWrapRef.current) : () => {}
    /* Changed at once (reduced motion, nothing on screen yet): back to the top. */
    if (swappedRef.current && fill && scrollRef.current) scrollRef.current.scrollTop = 0
    swappedRef.current = false
    return stopFit
  }, [grid, fill])

  const chooseSource = (s: Source) => {
    if (s === source) return
    setSource(s)
    swapGrid({ source: s, words })
  }
  const type = (value: string) => {
    setQuery(value)
    const w = value.toLowerCase().trim()
    if (w !== words) swapGrid({ source, words: w })
  }

  /* ── The three dots ── */

  const onPress = React.useCallback(
    (f: LibraryFile) => {
      if (selecting) tick(f)
      else if (mode === "pick") pickFile(f)
      else setOpen(f)
    },
    [mode, pickFile, selecting, tick],
  )
  const onMenu = React.useCallback((f: LibraryFile, anchor: HTMLButtonElement) => {
    const closed = closedRef.current
    if (closed && closed.anchor === anchor && performance.now() - closed.at < 400) {
      closedRef.current = null
      return
    }
    const phone = window.matchMedia(PHONE).matches
    pendingRef.current = null
    /* Inside the chooser the menu stays in its window, flipping above the dots near its bottom edge. */
    const bound = anchor.closest('[data-slot="dialog-content"]')
    setMenu({ file: f, anchor, box: anchor.getBoundingClientRect(), phone, bound })
    if (phone) setSheetOpen(true)
  }, [])

  const items = React.useMemo<ActionMenuItem[]>(() => {
    if (!menu) return []
    const f = menu.file
    const on = tickedSet.has(f.id)
    const use: ActionMenuItem[] =
      mode !== "pick"
        ? []
        : selecting
          ? [{ label: on ? tt("Unselect") : tt("Select"), icon: <Check />, onClick: () => tick(f) }]
          : isVideo(f)
            ? [{ label: tt("Use this video"), icon: <Check />, onClick: () => pickFile(f) }]
            : [{ label: tt("Use this picture"), icon: <Check />, onClick: () => pickFile(f) }]
    /* While picking, the file in the Files page itself, in a new tab so the builder stays as it is. */
    const inFiles: ActionMenuItem[] = mode === "pick" ? [{ label: tt("Open in Files"), icon: <ExternalLink />, href: `/app/files?file=${encodeURIComponent(f.id)}`, target: "_blank" }] : []
    return [
      ...use,
      { label: tt("Preview"), icon: <Eye />, onClick: () => setOpen(f) },
      { label: tt("Copy link"), icon: <Copy />, onClick: () => copyLink(f) },
      { label: tt("Download"), icon: <Download />, onClick: () => void downloadFile(f) },
      ...inFiles,
      { label: tt("Delete"), icon: <Trash2 />, variant: "destructive", separatorBefore: true, onClick: () => setConfirming(f) },
    ]
  }, [menu, mode, pickFile, selecting, tick, tickedSet])
  const groups = React.useMemo(() => groupsOf(items), [items])

  /* A dropdown held against the dots is closed by a scroll, since the dots move and it would not. */
  React.useEffect(() => {
    if (!menu || menu.phone) return
    const target: EventTarget = (fill ? scrollRef.current : null) ?? window
    const close = () => setMenu(null)
    target.addEventListener("scroll", close, { passive: true })
    return () => target.removeEventListener("scroll", close)
  }, [menu, fill])

  const desktopMenu = menu && !menu.phone ? menu : null

  const gridCols = mode === "pick" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"
  const sources = kind === "video" ? VIDEO_SOURCES : kind === "media" ? MEDIA_SOURCES : SOURCES
  /* The bar's words stay as they were while it slides away, rather than reading "Add 0". */
  const lastCount = React.useRef(0)
  if (ticked.length) lastCount.current = ticked.length
  const count = ticked.length || lastCount.current
  const nouns = kind === "video" ? ["video", "videos"] : kind === "media" ? ["file", "files"] : ["picture", "pictures"]

  return (
    <div
      className={cn(fill ? "flex min-h-0 flex-1 flex-col" : "space-y-3")}
      data-files-library={mode}
      data-files-multiple={selecting ? "" : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        /* Only when the pointer has left the library, not when it moves from one tile onto the next. */
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
      }}
    >
      <div className={cn("space-y-3", fill && "shrink-0 px-4 pb-3 sm:px-5")}>
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{tt("Search files")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
            <input type="search" data-no-autofocus="" value={query} onChange={(e) => type(e.target.value)} placeholder={tt("Search files")} className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] outline-none transition-[border-color] focus:border-[#9ca3af] sm:text-[14px]" />
          </label>
          {mode === "manage" ? (
            <button type="button" className={cn(BTN_SECONDARY, "shrink-0 rounded-xl px-3 sm:px-4")} onClick={() => (selectingFiles ? stopSelecting() : setSelectingFiles(true))} aria-pressed={selectingFiles} data-files-select="">
              {selectingFiles ? tt("Cancel") : tt("Select")}
            </button>
          ) : null}
          <button type="button" className={cn(BTN_SECONDARY, "shrink-0 gap-1.5 rounded-xl px-3 sm:px-4")} onClick={() => input.current?.click()} data-files-upload="">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {pending.length > 0 ? tt("Uploading {length}", { length: pending.length }) : tt("Upload")}
          </button>
          <input
            ref={input}
            type="file"
            accept={kind === "video" ? VIDEO_ACCEPT : kind === "media" ? `${IMAGE_ACCEPT},${VIDEO_ACCEPT}` : IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void upload(Array.from(e.target.files))
              /* The same file chosen again is a new upload. */
              e.target.value = ""
            }}
          />
        </div>
        <SourcePills sources={sources} value={source} onChange={chooseSource} onWarm={warmPill} />
        {error && files === null ? <Notice>{error}</Notice> : null}
      </div>

      <div ref={viewRef} className={cn("relative", fill && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <div
          ref={scrollRef}
          className={cn(fill && "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1.5 sm:px-5 sm:pb-5", fill && selecting && "pb-[calc(88px+env(safe-area-inset-bottom))] sm:pb-24")}
          data-files-scroll={fill ? "" : undefined}
        >
          <div ref={gridWrapRef} className={cn("relative rounded-2xl transition-[box-shadow]", dragOver && "shadow-[0_0_0_2px_#1a1a2e]")}>
            {files === null ? (
              <ul className={cn("grid gap-2.5", gridCols)} aria-busy="true" aria-label={tt("Loading files")} data-files-waiting="">
                {Array.from({ length: EAGER }, (_, i) => (
                  <li key={i} className="aspect-square rounded-xl border border-[#eceef1] bg-[#f3f4f6]" />
                ))}
              </ul>
            ) : (
              <>
                {shown.length === 0 && pending.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e3e5e8] px-4 py-10 text-center" data-files-empty="">
                    <p className="text-[14px] font-medium text-[#1a1a2e]">{files.length === 0 ? tt("No files yet") : tt("Nothing matches")}</p>
                    <p className="mt-1 text-[13px] text-[#6b7280]">
                      {files.length === 0 ? (kind === "video" ? tt("Upload a video here, or drop one in.") : kind === "media" ? tt("Upload pictures and videos here, or drop them in, and use them anywhere on your website and products.") : tt("Upload pictures here, or drop them in, and use them anywhere on your website.")) : tt("Try another word or filter.")}
                    </p>
                  </div>
                ) : null}
                {/* Every tile stays built; a pill or a search only hides the ones that do not match, so going back shows them as they were, pictures and all. */}
                <ul className={cn("grid gap-2.5", gridCols)} data-files-grid="" hidden={shown.length === 0 && pending.length === 0}>
                  {pending.map((row) => (
                    <PendingTile key={row.key} row={row} />
                  ))}
                  {files.map((f) => {
                    const at = shownAt.get(f.id)
                    return (
                      <Tile
                        key={f.id}
                        file={f}
                        index={at ?? rankInSource.get(f.id) ?? EAGER}
                        hidden={at === undefined}
                        mode={mode}
                        chosen={mode === "pick" && !selecting && !!selectedUrl && selectedUrl === f.url}
                        selecting={selecting}
                        ticked={tickedSet.has(f.id)}
                        menuOpen={menu?.file.id === f.id && (!menu.phone || sheetOpen)}
                        onPress={onPress}
                        onMenu={onMenu}
                        onGone={onGone}
                      />
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Picking several: what is ticked, and the one press that adds them all. */}
        {fill && selecting ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-[3] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:px-5 sm:pb-4",
              ticked.length ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
            )}
            data-files-add-bar={ticked.length ? "open" : "closed"}
            aria-hidden={!ticked.length}
          >
            <div className={cn("flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-2 pl-4 shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]", ticked.length ? "pointer-events-auto" : "pointer-events-none")}>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#4b5563]">
                {tt("{count} selected", { count })}{limit !== undefined ? <span className="text-[#9ca3af]"> {tt("of {limit}", { limit })}</span> : null}
              </span>
              <button type="button" tabIndex={ticked.length ? 0 : -1} className="h-10 shrink-0 rounded-lg px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]" onClick={() => setTicked([])}>
                {tt("Clear")}
              </button>
              <button type="button" tabIndex={ticked.length ? 0 : -1} className={cn(BTN_PRIMARY, "shrink-0 rounded-xl px-4")} onClick={addTicked} data-files-add="">
                {tt("Add {count}", { count })} {count === 1 ? nouns[0] : nouns[1]}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Files, Select: what is ticked, and what can be done to all of it at once. */}
      {!fill && selecting ? (
        <div className="sticky bottom-[calc(var(--app-nav-top,0px)+10px)] z-[3] md:bottom-4" data-files-bulk-bar="">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-2 pl-4 shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]">
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#4b5563]">{ticked.length ? tt("{length} selected", { length: ticked.length }) : kind === "image" ? tt("Tap pictures to select them") : tt("Tap files to select them")}</span>
            {shown.length > 0 ? (
              <button type="button" className="h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]" onClick={() => setTicked(ticked.length === shown.length ? [] : shown.map((f) => f.id))}>
                {ticked.length === shown.length ? tt("Clear") : tt("Select all")}
              </button>
            ) : null}
            {ticked.length > 0 && (ticked.length === 1 || manyAtOnce()) ? (
              <button type="button" className={cn(BTN_SECONDARY, "h-9 shrink-0 gap-1.5 px-3")} onClick={() => void downloadMany(tickedFiles())} data-files-bulk-download="">
                <Download className="h-4 w-4" aria-hidden />
                {tt("Download")}
              </button>
            ) : null}
            {ticked.length > 0 ? (
              <button type="button" className={cn(BTN_DANGER, "h-9 shrink-0 gap-1.5 px-3")} onClick={() => setConfirmingMany(tickedFiles())} data-files-bulk-delete="">
                <Trash2 className="h-4 w-4" aria-hidden />
                {tt("Delete")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/*
        On a computer: one dropdown, held against the dots that were pressed.
        The stand in it is held against is drawn into the body: inside the
        chooser's window, which is transformed, `position: fixed` is measured
        from the window and the menu opened a window's offset away.
      */}
      {desktopMenu ? (
        <DropdownMenuPrimitive.Root
          open
          modal={false}
          onOpenChange={(next) => {
            if (next) return
            closedRef.current = { anchor: desktopMenu.anchor, at: performance.now() }
            setMenu(null)
          }}
        >
          {createPortal(
            <DropdownMenuPrimitive.Trigger asChild>
              <span aria-hidden data-files-menu-anchor="" style={{ position: "fixed", left: desktopMenu.box.left, top: desktopMenu.box.top, width: desktopMenu.box.width, height: desktopMenu.box.height, pointerEvents: "none" }} />
            </DropdownMenuPrimitive.Trigger>,
            document.body,
          )}
          <ActionDropdownContent
            groups={groups}
            align="end"
            menuWidth="w-52"
            sideOffset={4}
            collisionBoundary={desktopMenu.bound}
            collisionPadding={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              desktopMenu.anchor.focus({ preventScroll: true })
            }}
          />
        </DropdownMenuPrimitive.Root>
      ) : null}

      {/* On a phone: the shared action sheet, and the row runs once it has gone. */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClosed={() => {
          const run = pendingRef.current
          pendingRef.current = null
          setMenu(null)
          run?.()
        }}
        label={tt("Picture actions")}
        hideFrom={null}
        zIndex={OVER_SHEET_Z}
      >
        <ActionSheetRows
          groups={menu?.phone ? groups : []}
          onPick={(run) => {
            pendingRef.current = run
            setSheetOpen(false)
          }}
        />
      </BottomSheet>

      <FileDetails
        file={open}
        mode={mode}
        selecting={selecting}
        onClose={() => setOpen(null)}
        onUse={(f) => {
          setOpen(null)
          if (selecting) {
            if (!tickedRef.current.includes(f.id)) tick(f)
          } else pickFile(f)
        }}
        onDelete={(f) => setConfirming(f)}
      />
      <ConfirmDelete
        file={confirming}
        busy={deleting}
        onClose={() => {
          if (!deleting) setConfirming(null)
        }}
        onConfirm={(f) => void remove(f)}
      />
      <ConfirmDeleteMany
        files={confirmingMany}
        busy={deleting}
        onClose={() => {
          if (!deleting) setConfirmingMany(null)
        }}
        onConfirm={(list) => void removeMany(list)}
      />
    </div>
  )
}

/* ── Phone or not, decided before the first frame ───────────────────────── */

function usePhoneNow(): boolean {
  const [phone, setPhone] = React.useState(() => typeof window !== "undefined" && window.matchMedia(PHONE).matches)
  React.useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/** The last value something was open with, so a sheet or a window does not empty as it leaves. */
function useLastOpen<T>(value: T | null): T | null {
  const [last, setLast] = React.useState<T | null>(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

/* ── A picture's details ────────────────────────────────────────────────── */

function FileDetails({ file, mode, selecting = false, onClose, onUse, onDelete }: { file: LibraryFile | null; mode: "manage" | "pick"; selecting?: boolean; onClose: () => void; onUse: (f: LibraryFile) => void; onDelete: (f: LibraryFile) => void }) {
  const phone = usePhoneNow()
  const f = useLastOpen(file)
  return (
    <SheetDialog
      open={!!file}
      onClose={onClose}
      phone={phone}
      label={tt("File details")}
      showCloseButton={false}
      className="gap-0 p-0 sm:max-w-[720px] sm:rounded-2xl"
      sheet={{ zIndex: OVER_SHEET_Z, aboveKeyboard: false, maxHeight: "calc(var(--vv-h, 100dvh) * 0.9)" }}
    >
      {f ? (
        <div className="flex min-h-0 flex-col" data-file-details="">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-1 sm:border-b sm:border-[#f1f2f4] sm:px-5 sm:py-3">
            <SheetDialogTitle className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e]">{f.name}</SheetDialogTitle>
            <button type="button" onClick={onClose} aria-label={tt("Close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] max-sm:hidden">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-5 sm:py-5">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#eceef1] bg-[#f3f4f6]">
              {isVideo(f) ? (
                <video key={f.id} src={f.url} poster={f.poster ?? undefined} controls muted playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={f.id}
                  ref={revealIfReady}
                  src={filePreview(f.url)}
                  alt=""
                  decoding="async"
                  onLoad={(e) => reveal(e.currentTarget)}
                  onError={(e) => fallBack(e.currentTarget, f.url)}
                  className={cn("peer", IMG_FADE)}
                />
              )}
              {isVideo(f) ? null : <Placeholder file={f} className="hidden peer-data-[failed]:flex" />}
            </div>
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2.5 text-[13.5px] sm:grid-cols-1">
                {[
                  [tt("Size"), sizeText(f.bytes)],
                  [tt("Type"), (f.type ?? "").replace(/^(image|video)\//, "").toUpperCase() || noun(f)],
                  [tt("Uploaded"), dateText(f.createdAt)],
                  [tt("From"), f.source],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] font-medium text-[#9ca3af]">{k}</dt>
                    <dd className="break-all text-[#1a1a2e]">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                {mode === "pick" ? (
                  <button type="button" className={cn(BTN_PRIMARY, "w-full")} onClick={() => onUse(f)}>
                    {selecting ? tt("Select") : isVideo(f) ? tt("Use this video") : tt("Use this picture")}
                  </button>
                ) : null}
                <button type="button" className={cn(BTN_SECONDARY, "flex-1 gap-1.5 px-3")} onClick={() => copyLink(f)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  {tt("Copy link")}
                </button>
                <button type="button" className={cn(BTN_SECONDARY, "flex-1 gap-1.5 px-3")} onClick={() => void downloadFile(f)}>
                  <Download className="h-4 w-4" aria-hidden />
                  {tt("Download")}
                </button>
                <button type="button" className={cn(BTN_DANGER, "w-full gap-1.5")} onClick={() => onDelete(f)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {tt("Delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SheetDialog>
  )
}

/* ── Asked before a delete ──────────────────────────────────────────────── */

function ConfirmDelete({ file, busy, onClose, onConfirm }: { file: LibraryFile | null; busy: boolean; onClose: () => void; onConfirm: (f: LibraryFile) => void }) {
  const phone = usePhoneNow()
  const f = useLastOpen(file)
  return (
    <SheetDialog
      open={!!file}
      onClose={onClose}
      phone={phone}
      label={f && isVideo(f) ? tt("Delete this video?") : tt("Delete this picture?")}
      showCloseButton={false}
      className="max-w-[420px] gap-0 rounded-2xl p-6"
      sheet={{ zIndex: OVER_SHEET_Z + 10, fill: false, aboveKeyboard: false, dismissible: !busy }}
    >
      {f ? (
        <div className="max-sm:px-5 max-sm:pb-[max(16px,env(safe-area-inset-bottom))] max-sm:pt-2" data-file-confirm="">
          <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{isVideo(f) ? tt("Delete this video?") : tt("Delete this picture?")}</SheetDialogTitle>
          <p className="mt-2 break-words text-[14px] leading-[20px] text-[#6b7280]">
            {f.source === "Library" ? tt("{name} is removed from your files.", { name: f.name }) : tt("{name} is removed from your files, and anything that still shows it will show nothing.", { name: f.name })}
          </p>
          <div className="mt-5 flex gap-2 sm:justify-end">
            <button type="button" className={cn(BTN_SECONDARY, "max-sm:h-11 max-sm:flex-1")} onClick={onClose} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9a1d14] max-sm:h-11 max-sm:flex-1")} onClick={() => onConfirm(f)} disabled={busy} data-file-confirm-delete="">
              {busy ? tt("Deleting") : tt("Delete")}
            </button>
          </div>
        </div>
      ) : null}
    </SheetDialog>
  )
}

/** Several at once (Files, Select): how many, and that anything still showing them will show nothing. */
function ConfirmDeleteMany({ files, busy, onClose, onConfirm }: { files: LibraryFile[] | null; busy: boolean; onClose: () => void; onConfirm: (list: LibraryFile[]) => void }) {
  const phone = usePhoneNow()
  const list = useLastOpen(files)
  const n = list?.length ?? 0
  const title = n === 1 ? tt("Delete this file?") : tt("Delete {n} files?", { n })
  return (
    <SheetDialog
      open={!!files}
      onClose={onClose}
      phone={phone}
      label={title}
      showCloseButton={false}
      className="max-w-[420px] gap-0 rounded-2xl p-6"
      sheet={{ zIndex: OVER_SHEET_Z + 10, fill: false, aboveKeyboard: false, dismissible: !busy }}
    >
      {list ? (
        <div className="max-sm:px-5 max-sm:pb-[max(16px,env(safe-area-inset-bottom))] max-sm:pt-2" data-file-confirm-many="">
          <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{title}</SheetDialogTitle>
          <p className="mt-2 text-[14px] leading-[20px] text-[#6b7280]">{tt("They are removed from your files, and anything that still shows one of them will show nothing.")}</p>
          <div className="mt-5 flex gap-2 sm:justify-end">
            <button type="button" className={cn(BTN_SECONDARY, "max-sm:h-11 max-sm:flex-1")} onClick={onClose} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9a1d14] max-sm:h-11 max-sm:flex-1")} onClick={() => onConfirm(list)} disabled={busy} data-file-confirm-delete-many="">
              {busy ? tt("Deleting") : n === 1 ? tt("Delete") : tt("Delete {n}", { n })}
            </button>
          </div>
        </div>
      ) : null}
    </SheetDialog>
  )
}

/* ── "Choose from your files" ───────────────────────────────────────────── */

/**
 * Fixed, so a list that arrives, or a pill with fewer pictures, never moves
 * the top edge. Four fifths of what is visible: a tenth lower than it was
 * (0.88), so the page behind still shows above it on a phone.
 */
const SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.79)"

/**
 * "Choose from your files": the library in pick mode. On a phone the app's
 * one bottom sheet (components/ui/bottom-sheet.tsx, through SheetDialog), so
 * it follows the finger the way every other sheet does; on a computer the
 * app's dialog, which fades and scales in and out on the compositor, a
 * little under 720px wide, with the deeper shadow and the scrim Storelib's
 * other windows have. Both are drawn into the body, so a sidebar or editor
 * panel that is moved or scaled can't trap or clip them. Built on the first
 * open and kept, so it can leave with its own motion and a second open is
 * already there.
 *
 * `multiple` is for a field that takes a list: pictures are ticked and added
 * together through `onPickMany`, at most `max`.
 */
export function FilesLibraryChooser({
  open,
  onClose,
  onPick,
  onPickMany,
  multiple = false,
  max,
  selectedUrl,
  kind = "image",
}: {
  open: boolean
  onClose: () => void
  onPick?: (url: string, hint?: PickHint) => void
  /** With `multiple`: every picture ticked, in the order ticked. */
  onPickMany?: (picks: PickMany) => void
  multiple?: boolean
  /** The room left in the list. */
  max?: number
  selectedUrl?: string | null
  /** A video setting's chooser lists the store's videos. */
  kind?: LibraryKind
}) {
  const [used, setUsed] = React.useState(open)
  if (open && !used) setUsed(true)
  /* Each opening is a new round: nothing ticked from the last one. */
  const [round, setRound] = React.useState(0)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setRound((r) => r + 1)
  }
  const phone = usePhoneNow()
  const pick = React.useCallback(
    (url: string, hint?: PickHint) => {
      onPick?.(url, hint)
      onClose()
    },
    [onPick, onClose],
  )
  const pickMany = React.useCallback(
    (picks: PickMany) => {
      onPickMany?.(picks)
      onClose()
    },
    [onPickMany, onClose],
  )
  if (!used) return null
  const title = kind === "video" ? (multiple ? tt("Choose videos") : tt("Choose a video")) : tt("Choose from your files")
  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      phone={phone}
      label={title}
      showCloseButton={false}
      className="flex h-[min(700px,calc(100dvh-64px))] w-[min(720px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_32px_80px_-24px_rgba(17,24,39,0.45),0_2px_8px_rgba(17,24,39,0.08)] sm:max-w-none"
      /* The scrim Storelib's other windows use (components/physical/ui), a little deeper for a window of pictures. */
      dialog={{ overlayClassName: "bg-[rgba(17,24,39,0.42)]" }}
      sheet={{ height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT, keepMounted: true }}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-files-chooser={kind}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-1 sm:px-5 sm:pb-4 sm:pt-4">
          <SheetDialogTitle className="text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">{title}</SheetDialogTitle>
          <button type="button" onClick={onClose} aria-label={tt("Close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] max-sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
        <FilesLibrary mode="pick" kind={kind} fill selectedUrl={selectedUrl} onPick={pick} onPickMany={pickMany} multiple={multiple} max={max} resetKey={round} />
      </div>
    </SheetDialog>
  )
}
