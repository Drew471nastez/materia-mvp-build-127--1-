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
 *   the network and nothing goes empty. The tiles on screen are copied into
 *   a layer above the grid as they are, the grid changes under it, and the
 *   copy fades out while the new grid fades in (`crossFade`): opacity only,
 *   on the compositor, 180ms.
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
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, Copy, Download, ExternalLink, Eye, Film, ImagePlus, MoreHorizontal, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { mediaUrl } from "@/lib/storage/media-url"
import { fileThumb, filePreview } from "@/lib/files/thumb"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Notice, api } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ActionDropdownContent, ActionSheetRows, groupsOf, type ActionMenuItem } from "@/components/ui/responsive-action-menu"

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
}

/** Pictures, or the videos a video setting can play (lib/files/library.ts). */
export type LibraryKind = "image" | "video"

/** What a pick hands over beside the address: something already on screen to show while the stored copy loads. */
export interface PickHint {
  /** The resized copy the tile already decoded. */
  thumb?: string
  /** The file just uploaded, for a local preview. */
  file?: File
}

const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif"
/* What the store-builder-images bucket takes as video (the builder's video field, controls/video-picker-control.tsx). */
const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v" }
const MAX_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const SOURCES = ["All", "Library", "Website", "Product photos"] as const
type Source = (typeof SOURCES)[number]
/* Product photos are pictures only, so a video list has no such pill. */
const VIDEO_SOURCES: readonly Source[] = ["All", "Library", "Website"]
/* The rows drawn at once: three on a phone at three across, three in the window at four across. */
const EAGER = 12
const SWAP_MS = 180
const SWAP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/* Above a sheet that is itself above the page (the chooser), for what opens from inside it. */
const OVER_SHEET_Z = 210
const PHONE = "(max-width: 639px)"

export function sizeText(bytes: number | null): string {
  if (bytes === null) return "Unknown size"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function dateText(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
  } catch {
    return ""
  }
}

/* ── The list, kept for the session, one per kind ───────────────────────── */

/** How long a kept list is used as it is before a prefetch asks again. */
const FRESH_MS = 60_000
type ListResult = { files?: LibraryFile[]; error?: string }
const kept: Record<LibraryKind, LibraryFile[] | null> = { image: null, video: null }
const keptAt: Record<LibraryKind, number> = { image: 0, video: 0 }
const inFlight: Record<LibraryKind, Promise<ListResult> | null> = { image: null, video: null }
/* Every library on screen hears a list arrive, whoever asked for it (a prefetch, an upload). */
const listeners = new Set<(kind: LibraryKind, r: ListResult) => void>()

function fetchList(kind: LibraryKind): Promise<ListResult> {
  const asking = inFlight[kind]
  if (asking) return asking
  const next = (async (): Promise<ListResult> => {
    const r = await api<{ files: LibraryFile[] }>(kind === "video" ? "/api/files?kind=video" : "/api/files")
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
    if (f.type?.startsWith("video/")) continue
    const t = fileThumb(f.url)
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
    toast.error("Copying is not available here.")
    return
  }
  void navigator.clipboard.writeText(f.url).then(
    () => toast.success("Link copied"),
    () => toast.error("The link could not be copied."),
  )
}

const isVideo = (f: LibraryFile) => !!f.type?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(f.name)
/** "Picture" or "Video", for what a toast or a question calls it. */
const noun = (f: LibraryFile) => (isVideo(f) ? "Video" : "Picture")

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
    toast.error(`The ${noun(f).toLowerCase()} could not be downloaded.`)
  }
}

/* ── Uploads, each with how far it is ──────────────────────────────────── */

function putWithProgress(endpoint: string, token: string, key: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open("POST", endpoint)
    x.setRequestHeader("Authorization", `Bearer ${token}`)
    x.setRequestHeader("apikey", key)
    x.setRequestHeader("x-upsert", "false")
    x.setRequestHeader("cache-control", "max-age=31536000")
    x.setRequestHeader("Content-Type", type)
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`upload ${x.status}`)))
    x.onerror = () => reject(new Error("upload failed"))
    x.send(body)
  })
}

/**
 * One file into the owner's library folder. Straight to storage with the
 * signed-in session, by XMLHttpRequest so its tile can say how far it is;
 * through the storage client when there is no session to hand. A picture
 * goes without its location and camera details; a video as it is.
 */
async function uploadOne(f: File, onProgress: (p: number) => void): Promise<LibraryFile> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("signed out")
  const video = VIDEO_TYPES[f.type]
  const ext = video ?? (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")
  const path = `${user.id}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const body: Blob = video ? f : await withoutMetadata(f)
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  const session = base && key ? (await supabase.auth.getSession()).data.session : null
  if (session?.access_token && base && key && typeof XMLHttpRequest !== "undefined") {
    await putWithProgress(`${base}/storage/v1/object/store-builder-images/${path.split("/").map(encodeURIComponent).join("/")}`, session.access_token, key, body, f.type, onProgress)
  } else {
    const { error: upErr } = await supabase.storage.from("store-builder-images").upload(path, body, { cacheControl: "31536000", contentType: f.type, upsert: false })
    if (upErr) throw upErr
  }
  onProgress(1)
  confirmUpload("store-builder-images", path)
  const url = mediaUrl(supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl)
  return { id: `store-builder-images:${path}`, bucket: "store-builder-images", path, name: path.split("/").pop() ?? f.name, url, bytes: f.size, type: f.type, createdAt: new Date().toISOString(), source: "Library" }
}

/** What is refused before it is sent: the bucket would refuse it after. */
function refusal(f: File, kind: LibraryKind): string | null {
  if (kind === "video") {
    if (!VIDEO_TYPES[f.type]) return `${f.name}: only MP4, WebM and MOV videos.`
    if (f.size > MAX_VIDEO_BYTES) return `${f.name} is over 200 MB.`
    return null
  }
  if (!TYPES.has(f.type)) return `${f.name}: only JPG, PNG, GIF, WebP and AVIF pictures.`
  if (f.size > MAX_BYTES) return `${f.name} is over 5 MB.`
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

/** Shown once decoded: straight onto the element, so nothing renders for it. */
function reveal(img: HTMLImageElement) {
  if (img.dataset.loaded !== undefined) return
  const show = () => {
    img.dataset.loaded = ""
  }
  if (typeof img.decode === "function") img.decode().then(show, show)
  else show()
}

/** A picture the browser already has is there on the first frame, with no fade to sit through. */
function revealIfReady(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth > 0 && img.dataset.loaded === undefined) {
    img.dataset.instant = ""
    img.dataset.loaded = ""
  }
}

/** The resized copy failed (a host the optimizer refused, say): the original, once. */
function fallBack(img: HTMLImageElement, original: string) {
  if (img.dataset.fallback !== undefined || img.src === original) {
    img.dataset.failed = ""
    img.dataset.loaded = ""
    return
  }
  img.dataset.fallback = ""
  img.removeAttribute("srcset")
  img.removeAttribute("sizes")
  img.src = original
}

const IMG_FADE = "absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-200 ease-out data-[instant]:transition-none data-[loaded]:opacity-100 data-[failed]:opacity-0"
/* A video's first frame, the same fade; one that cannot be drawn leaves the clean tile under it (a film mark on the grey). */
const VIDEO_FADE = "pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 ease-out data-[instant]:transition-none data-[loaded]:opacity-100 data-[failed]:opacity-0"

/** A video that already has its first frame (seen before in this tab) is there at once. */
function frameIfReady(v: HTMLVideoElement | null) {
  if (v && v.readyState >= 2 && v.dataset.loaded === undefined) {
    v.dataset.instant = ""
    v.dataset.loaded = ""
  }
}

/**
 * A video tile: its first frame (`#t=0.1`, which also makes Safari draw one
 * with only the metadata asked for), over a clean tile with a film mark that
 * stays if there is no frame to draw.
 */
function VideoFrame({ url }: { url: string }) {
  return (
    <>
      <Film className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
      <video
        ref={frameIfReady}
        src={`${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden
        onLoadedData={(e) => {
          e.currentTarget.dataset.loaded = ""
        }}
        onError={(e) => {
          e.currentTarget.dataset.failed = ""
        }}
        className={cn("peer", VIDEO_FADE)}
      />
      {/* The film badge marks a frame as a video; the clean tile already says so. */}
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 peer-data-[failed]:hidden grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white">
        <Film className="h-3.5 w-3.5" aria-hidden />
      </span>
    </>
  )
}

/* ── A tile ─────────────────────────────────────────────────────────────── */

const Tile = React.memo(function Tile({
  file,
  index,
  hidden,
  mode,
  chosen,
  menuOpen,
  onPress,
  onMenu,
}: {
  file: LibraryFile
  index: number
  hidden: boolean
  mode: "manage" | "pick"
  chosen: boolean
  menuOpen: boolean
  onPress: (f: LibraryFile) => void
  onMenu: (f: LibraryFile, button: HTMLButtonElement) => void
}) {
  const thumb = React.useMemo(() => fileThumb(file.url), [file.url])
  const video = isVideo(file)
  const local = localPreview.get(file.url)
  return (
    <li className="group/tile relative" data-file-tile={file.id} hidden={hidden}>
      <button
        type="button"
        onClick={() => onPress(file)}
        className={cn(
          "relative block w-full overflow-hidden rounded-xl border bg-white text-left transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 [-webkit-tap-highlight-color:transparent]",
          chosen ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#eceef1]",
        )}
        data-file={file.id}
        aria-label={mode === "pick" ? `Use ${file.name}` : `Open ${file.name}`}
      >
        <span className="relative block aspect-square w-full bg-[#f3f4f6]" data-file-box="">
          {video ? (
            <VideoFrame url={file.url} />
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
                decoding="async"
                onLoad={(e) => reveal(e.currentTarget)}
                onError={(e) => fallBack(e.currentTarget, file.url)}
                className={IMG_FADE}
                data-file-img=""
              />
            </>
          )}
        </span>
        {chosen ? (
          <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#1a1a2e] text-white">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          </span>
        ) : null}
        {mode === "manage" ? <span className="block truncate border-t border-[#eceef1] bg-white px-2 py-1.5 text-[12px] text-[#4b5563]">{file.name}</span> : null}
      </button>
      <button
        type="button"
        aria-label={`More for ${file.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-file-menu=""
        onClick={(e) => onMenu(file, e.currentTarget)}
        className={cn(
          "absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#374151] shadow-[0_1px_3px_rgba(17,24,39,0.16)] outline-none transition-opacity duration-150 hover:bg-white hover:text-[#1a1a2e] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 [-webkit-tap-highlight-color:transparent] sm:h-7 sm:w-7",
          /* Always there on a touch screen; with a mouse once the pointer is on the tile, or while its menu is open. */
          menuOpen ? "opacity-100" : "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
    </li>
  )
})

/** A file on its way up: its own preview (or a film mark), dimmed, with how far it is. */
function PendingTile({ row }: { row: Pending }) {
  return (
    <li className="relative" data-file-pending="" aria-label={`Uploading ${row.name}`}>
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

type Menu = { file: LibraryFile; anchor: HTMLButtonElement; box: DOMRect; phone: boolean }

export function FilesLibrary({
  mode = "manage",
  onPick,
  selectedUrl,
  kind = "image",
  fill = false,
  openId,
}: {
  mode?: "manage" | "pick"
  onPick?: (url: string, hint?: PickHint) => void
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
  const [deleting, setDeleting] = React.useState(false)
  const [pending, setPending] = React.useState<Pending[]>([])
  const [dragOver, setDragOver] = React.useState(false)
  /* The three dots: which file, and the dots it opened from. */
  const [menu, setMenu] = React.useState<Menu | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const pendingRef = React.useRef<(() => void) | null>(null)
  /* The dots whose dropdown a press outside just closed: the same press must not open it again. */
  const closedRef = React.useRef<{ anchor: HTMLElement; at: number } | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const viewRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const gridWrapRef = React.useRef<HTMLDivElement>(null)
  const swappedRef = React.useRef(false)
  const ghostRef = React.useRef<HTMLDivElement | null>(null)

  const onPickRef = React.useRef(onPick)
  React.useEffect(() => {
    onPickRef.current = onPick
  })

  /* What the tile on screen already decoded, for the field to show while the stored copy loads. */
  const hintFor = React.useCallback((f: LibraryFile): PickHint | undefined => {
    const img = gridWrapRef.current?.querySelector<HTMLImageElement>(`[data-file-tile="${CSS.escape(f.id)}"] img[data-file-img]`)
    if (img && img.dataset.loaded !== undefined && img.dataset.failed === undefined && img.currentSrc) return { thumb: img.currentSrc }
    return undefined
  }, [])
  const pickFile = React.useCallback((f: LibraryFile) => onPickRef.current?.(f.url, hintFor(f)), [hintFor])

  const upload = async (list: FileList | File[]) => {
    const picked = Array.from(list).slice(0, 20)
    const bad = picked.map((f) => refusal(f, kind)).find(Boolean)
    if (bad) toast.error(bad)
    const good = picked.filter((f) => !refusal(f, kind))
    if (good.length === 0) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error("Sign in again to upload.")
    const rows: Pending[] = good.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, preview: kind === "image" ? URL.createObjectURL(f) : null, progress: 0 }))
    setPending((p) => [...rows, ...p])
    const results = await Promise.all(
      good.map(async (f, i) => {
        const row = rows[i]
        try {
          return await uploadOne(f, (p) => setPending((all) => all.map((x) => (x.key === row.key ? { ...x, progress: Math.max(x.progress, p) } : x))))
        } catch {
          toast.error(`${f.name} could not be uploaded.`)
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
    /* One file dropped or chosen while picking: it is the one picked, with the file itself to show at once. */
    if (mode === "pick" && added.length === 1 && good.length === 1) onPickRef.current?.(added[0].url, { file: good[0] })
    else if (added.length > 1) toast.success(`${added.length} files uploaded`)
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
    setConfirming(null)
    setOpen((o) => (o?.id === f.id ? null : o))
    toast.success("Deleted")
  }

  /* ── The swap ── */

  /**
   * The tiles on screen, copied as they are into a layer that does not
   * scroll, so the grid can change under it. Called before the state that
   * changes the grid, while the old tiles are still the ones drawn.
   */
  const crossFade = React.useCallback(() => {
    const wrap = gridWrapRef.current
    const host = fill ? viewRef.current : wrap
    const grid = wrap?.querySelector<HTMLElement>(":scope > [data-files-grid]:not([hidden])")
    if (!wrap || !host || !grid) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    ghostRef.current?.remove()
    const hostBox = host.getBoundingClientRect()
    const view = fill && scrollRef.current ? scrollRef.current.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    const ghost = document.createElement("div")
    ghost.setAttribute("aria-hidden", "true")
    ghost.dataset.filesGhost = ""
    ghost.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden;will-change:opacity"
    for (const li of Array.from(grid.children) as HTMLElement[]) {
      if (li.hidden) continue
      const r = li.getBoundingClientRect()
      if (r.bottom <= view.top || r.top >= view.bottom) continue
      const copy = li.cloneNode(true) as HTMLElement
      copy.removeAttribute("data-file-tile")
      copy.style.cssText = `position:absolute;margin:0;list-style:none;left:${r.left - hostBox.left}px;top:${r.top - hostBox.top}px;width:${r.width}px;height:${r.height}px`
      ghost.append(copy)
    }
    if (!ghost.childElementCount) return
    host.append(ghost)
    ghostRef.current = ghost
    swappedRef.current = true
  }, [fill])

  const words = query.toLowerCase().trim()
  const shown = React.useMemo(
    () => (files ?? []).filter((f) => (source === "All" || f.source === source) && (!words || f.name.toLowerCase().includes(words))),
    [files, source, words],
  )
  /* Where each shown file is in the grid, for which are drawn at once. */
  const shownAt = React.useMemo(() => new Map(shown.map((f, i) => [f.id, i])), [shown])

  /* The new grid is drawn: it starts its fade under the copy, before this frame is painted. */
  React.useLayoutEffect(() => {
    if (!swappedRef.current) return
    swappedRef.current = false
    if (fill && scrollRef.current) scrollRef.current.scrollTop = 0
    const ghost = ghostRef.current
    const next = gridWrapRef.current?.querySelector<HTMLElement>(":scope > :not([data-files-ghost]):not([hidden])")
    next?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP_MS, easing: SWAP_EASE })
    if (ghost) {
      const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SWAP_MS, easing: "ease-out", fill: "forwards" })
      const done = () => {
        ghost.remove()
        if (ghostRef.current === ghost) ghostRef.current = null
      }
      out.finished.then(done, done)
    }
  }, [source, words, fill])

  const chooseSource = (s: Source) => {
    if (s === source) return
    crossFade()
    setSource(s)
  }
  const type = (value: string) => {
    if (value.toLowerCase().trim() !== words && !ghostRef.current) crossFade()
    setQuery(value)
  }

  /* ── The three dots ── */

  const onPress = React.useCallback(
    (f: LibraryFile) => {
      if (mode === "pick") pickFile(f)
      else setOpen(f)
    },
    [mode, pickFile],
  )
  const onMenu = React.useCallback((f: LibraryFile, anchor: HTMLButtonElement) => {
    const closed = closedRef.current
    if (closed && closed.anchor === anchor && performance.now() - closed.at < 400) {
      closedRef.current = null
      return
    }
    const phone = window.matchMedia(PHONE).matches
    pendingRef.current = null
    setMenu({ file: f, anchor, box: anchor.getBoundingClientRect(), phone })
    if (phone) setSheetOpen(true)
  }, [])

  const items = React.useMemo<ActionMenuItem[]>(() => {
    if (!menu) return []
    const f = menu.file
    const use: ActionMenuItem[] =
      mode !== "pick" ? [] : isVideo(f) ? [{ label: "Use this video", icon: <Check />, onClick: () => pickFile(f) }] : [{ label: "Use this picture", icon: <Check />, onClick: () => pickFile(f) }]
    /* While picking, the file in the Files page itself, in a new tab so the builder stays as it is. */
    const inFiles: ActionMenuItem[] = mode === "pick" ? [{ label: "Open in Files", icon: <ExternalLink />, href: `/app/files?file=${encodeURIComponent(f.id)}`, target: "_blank" }] : []
    return [
      ...use,
      { label: "Preview", icon: <Eye />, onClick: () => setOpen(f) },
      { label: "Copy link", icon: <Copy />, onClick: () => copyLink(f) },
      { label: "Download", icon: <Download />, onClick: () => void downloadFile(f) },
      ...inFiles,
      { label: "Delete", icon: <Trash2 />, variant: "destructive", separatorBefore: true, onClick: () => setConfirming(f) },
    ]
  }, [menu, mode, pickFile])
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
  const sources = kind === "video" ? VIDEO_SOURCES : SOURCES

  return (
    <div
      className={cn(fill ? "flex min-h-0 flex-1 flex-col" : "space-y-3")}
      data-files-library={mode}
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
            <span className="sr-only">Search files</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
            <input type="search" data-no-autofocus="" value={query} onChange={(e) => type(e.target.value)} placeholder="Search files" className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] outline-none transition-[border-color] focus:border-[#9ca3af] sm:text-[14px]" />
          </label>
          <button type="button" className={cn(BTN_SECONDARY, "shrink-0 gap-1.5 rounded-xl px-3 sm:px-4")} onClick={() => input.current?.click()} data-files-upload="">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {pending.length > 0 ? `Uploading ${pending.length}` : "Upload"}
          </button>
          <input
            ref={input}
            type="file"
            accept={kind === "video" ? Object.keys(VIDEO_TYPES).join(",") : IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void upload(Array.from(e.target.files))
              /* The same file chosen again is a new upload. */
              e.target.value = ""
            }}
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Where it came from">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              data-files-pill={s}
              onClick={() => chooseSource(s)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color] duration-200 ease-out [-webkit-tap-highlight-color:transparent]",
                source === s ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f5f6f7]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {error && files === null ? <Notice>{error}</Notice> : null}
      </div>

      <div ref={viewRef} className={cn("relative", fill && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <div
          ref={scrollRef}
          className={cn(fill && "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-0.5 sm:px-5 sm:pb-5")}
          data-files-scroll={fill ? "" : undefined}
        >
          <div ref={gridWrapRef} className={cn("relative rounded-2xl transition-[box-shadow]", dragOver && "shadow-[0_0_0_2px_#1a1a2e]")}>
            {files === null ? (
              <ul className={cn("grid gap-2.5", gridCols)} aria-busy="true" aria-label="Loading files" data-files-waiting="">
                {Array.from({ length: EAGER }, (_, i) => (
                  <li key={i} className="aspect-square rounded-xl border border-[#eceef1] bg-[#f3f4f6]" />
                ))}
              </ul>
            ) : (
              <>
                {shown.length === 0 && pending.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e3e5e8] px-4 py-10 text-center" data-files-empty="">
                    <p className="text-[14px] font-medium text-[#1a1a2e]">{files.length === 0 ? "No files yet" : "Nothing matches"}</p>
                    <p className="mt-1 text-[13px] text-[#6b7280]">
                      {files.length === 0 ? (kind === "video" ? "Upload a video here, or drop one in." : "Upload pictures here, or drop them in, and use them anywhere on your website.") : "Try another word or filter."}
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
                        index={at ?? EAGER}
                        hidden={at === undefined}
                        mode={mode}
                        chosen={mode === "pick" && !!selectedUrl && selectedUrl === f.url}
                        menuOpen={menu?.file.id === f.id && (!menu.phone || sheetOpen)}
                        onPress={onPress}
                        onMenu={onMenu}
                      />
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* On a computer: one dropdown, held against the dots that were pressed. */}
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
          <DropdownMenuPrimitive.Trigger asChild>
            <span aria-hidden style={{ position: "fixed", left: desktopMenu.box.left, top: desktopMenu.box.top, width: desktopMenu.box.width, height: desktopMenu.box.height, pointerEvents: "none" }} />
          </DropdownMenuPrimitive.Trigger>
          <ActionDropdownContent
            groups={groups}
            align="end"
            menuWidth="w-52"
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
        label="Picture actions"
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
        onClose={() => setOpen(null)}
        onUse={(f) => {
          setOpen(null)
          pickFile(f)
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

function FileDetails({ file, mode, onClose, onUse, onDelete }: { file: LibraryFile | null; mode: "manage" | "pick"; onClose: () => void; onUse: (f: LibraryFile) => void; onDelete: (f: LibraryFile) => void }) {
  const phone = usePhoneNow()
  const f = useLastOpen(file)
  return (
    <SheetDialog
      open={!!file}
      onClose={onClose}
      phone={phone}
      label="File details"
      showCloseButton={false}
      className="gap-0 p-0 sm:max-w-[720px] sm:rounded-2xl"
      sheet={{ zIndex: OVER_SHEET_Z, aboveKeyboard: false, maxHeight: "calc(var(--vv-h, 100dvh) * 0.9)" }}
    >
      {f ? (
        <div className="flex min-h-0 flex-col" data-file-details="">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-1 sm:border-b sm:border-[#f1f2f4] sm:px-5 sm:py-3">
            <SheetDialogTitle className="min-w-0 truncate text-[16px] font-semibold text-[#1a1a2e]">{f.name}</SheetDialogTitle>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] max-sm:hidden">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-5 sm:py-5">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#eceef1] bg-[#f3f4f6]">
              {isVideo(f) ? (
                <video key={f.id} src={f.url} controls muted playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
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
                  className={IMG_FADE}
                />
              )}
            </div>
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2.5 text-[13.5px] sm:grid-cols-1">
                {[
                  ["Size", sizeText(f.bytes)],
                  ["Type", (f.type ?? "").replace(/^(image|video)\//, "").toUpperCase() || noun(f)],
                  ["Uploaded", dateText(f.createdAt)],
                  ["From", f.source],
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
                    {isVideo(f) ? "Use this video" : "Use this picture"}
                  </button>
                ) : null}
                <button type="button" className={cn(BTN_SECONDARY, "flex-1 gap-1.5 px-3")} onClick={() => copyLink(f)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy link
                </button>
                <button type="button" className={cn(BTN_SECONDARY, "flex-1 gap-1.5 px-3")} onClick={() => void downloadFile(f)}>
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </button>
                <button type="button" className={cn(BTN_DANGER, "w-full gap-1.5")} onClick={() => onDelete(f)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
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
      label={f && isVideo(f) ? "Delete this video?" : "Delete this picture?"}
      showCloseButton={false}
      className="max-w-[420px] gap-0 rounded-2xl p-6"
      sheet={{ zIndex: OVER_SHEET_Z + 10, fill: false, aboveKeyboard: false, dismissible: !busy }}
    >
      {f ? (
        <div className="max-sm:px-5 max-sm:pb-[max(16px,env(safe-area-inset-bottom))] max-sm:pt-2" data-file-confirm="">
          <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{isVideo(f) ? "Delete this video?" : "Delete this picture?"}</SheetDialogTitle>
          <p className="mt-2 break-words text-[14px] leading-[20px] text-[#6b7280]">
            {f.source === "Library" ? `${f.name} is removed from your files.` : `${f.name} is removed from your files, and anything that still shows it will show nothing.`}
          </p>
          <div className="mt-5 flex gap-2 sm:justify-end">
            <button type="button" className={cn(BTN_SECONDARY, "max-sm:h-11 max-sm:flex-1")} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9a1d14] max-sm:h-11 max-sm:flex-1")} onClick={() => onConfirm(f)} disabled={busy} data-file-confirm-delete="">
              {busy ? "Deleting" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </SheetDialog>
  )
}

/* ── "Choose from your files" ───────────────────────────────────────────── */

/** Fixed, so a list that arrives, or a pill with fewer pictures, never moves the top edge. */
const SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.88)"

/**
 * "Choose from your files": the library in pick mode. On a phone the app's
 * one bottom sheet (components/ui/bottom-sheet.tsx, through SheetDialog), so
 * it follows the finger the way every other sheet does; on a computer the
 * app's dialog, which fades and scales in and out on the compositor. Both
 * are drawn into the body, so a sidebar or editor panel that is moved or scaled
 * can't trap or clip them. Built on the first open and kept, so it can leave
 * with its own motion and a second open is already there.
 */
export function FilesLibraryChooser({
  open,
  onClose,
  onPick,
  selectedUrl,
  kind = "image",
}: {
  open: boolean
  onClose: () => void
  onPick: (url: string, hint?: PickHint) => void
  selectedUrl?: string | null
  /** A video setting's chooser lists the store's videos. */
  kind?: LibraryKind
}) {
  const [used, setUsed] = React.useState(open)
  if (open && !used) setUsed(true)
  const phone = usePhoneNow()
  const pick = React.useCallback(
    (url: string, hint?: PickHint) => {
      onPick(url, hint)
      onClose()
    },
    [onPick, onClose],
  )
  if (!used) return null
  const title = kind === "video" ? "Choose a video" : "Choose from your files"
  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      phone={phone}
      label={title}
      showCloseButton={false}
      className="flex h-[min(760px,calc(100dvh-48px))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px] sm:rounded-2xl"
      sheet={{ height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT, keepMounted: true }}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-files-chooser={kind}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-1 sm:px-5 sm:pb-4 sm:pt-4">
          <SheetDialogTitle className="text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">{title}</SheetDialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] max-sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
        <FilesLibrary mode="pick" kind={kind} fill selectedUrl={selectedUrl} onPick={pick} />
      </div>
    </SheetDialog>
  )
}
