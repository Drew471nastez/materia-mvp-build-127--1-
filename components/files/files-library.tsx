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
 *   pick     the website builder's image and video fields: the same grid,
 *            and a press chooses the file (a draggable bottom sheet on a
 *            phone, a window on a computer, through SheetDialog)
 *
 * The list is the API's (app/api/files, lib/files/library.ts). An upload goes
 * straight to storage into the owner's own library folder, without its
 * location and camera details, the way the builder's image field uploads.
 *
 * WHAT MADE THE CHOOSER FEEL SLOW, and what each part here does about it
 * (round R6, the owner's report on "Choose from your files"):
 *
 *   THE LIST WAS ASKED FOR WHEN THE WINDOW OPENED, so it opened empty and
 *   filled a beat later. It is kept per kind (`prefetchLibrary`): asked for
 *   once the editor has an image field on screen and again on a hover of the
 *   button, so the window opens on the grid.
 *
 *   EVERY TILE LOADED THE ORIGINAL UPLOAD, a 3000px photo for a 160px
 *   square, and appeared at full opacity in whichever frame it decoded. Each
 *   tile asks for a resized copy through Next's image optimizer
 *   (`thumbUrl`, falling back to the original if that is refused), the
 *   first rows eagerly and the rest lazily, holds a grey square of the same
 *   size until then, and fades its picture in once it has decoded. A
 *   picture decoded once is remembered, so a filter or a search that shows
 *   it again shows it at once.
 *
 *   IT CLOSED BY DISAPPEARING. The old window returned null when closed.
 *   SheetDialog keeps it mounted through the exit (Radix's own animation on
 *   a computer, the shared sheet's slide on a phone).
 */
import * as React from "react"
import { Check, Copy, Download, ExternalLink, Film, ImagePlus, MoreHorizontal, Search, Trash2, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { mediaUrl } from "@/lib/storage/media-url"
import { BTN_DANGER, BTN_SECONDARY, Modal, Notice, api } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"

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

/** What the picker gets beside the address: something already on screen to show while the stored copy loads. */
export interface PickHint {
  /** A resized copy the grid already decoded. */
  thumb?: string
  /** The file just uploaded, for a local preview. */
  file?: File
}

const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v" }
const MAX_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const SOURCES = ["All", "Library", "Website", "Product photos"] as const
type Source = (typeof SOURCES)[number]
/** The tiles on the first screen of the grid, asked for eagerly and warmed ahead. */
const FIRST_SCREEN = 12

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

/* ── thumbnails ───────────────────────────────────────────────────────── */

/**
 * A resized copy for a tile, through Next's optimizer (the endpoint <Image>
 * uses; next.config lists Storelib's /media/ and the storage host, and the
 * widths and the quality used here). Anything else is shown as it is.
 */
export function thumbUrl(url: string, width = 384): string {
  if (!url) return url
  const ours = /^https:\/\/[^/]+\/media\//.test(url) || /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(url)
  return ours ? `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75` : url
}
function thumbSet(url: string): string | undefined {
  const a = thumbUrl(url, 256)
  return a === url ? undefined : `${a} 256w, ${thumbUrl(url, 384)} 384w`
}
const TILE_SIZES = "(max-width: 639px) 33vw, 180px"

/** Pictures already decoded in this tab: shown again, they are there at once rather than fading in a second time. */
const decoded = new Set<string>()

function warm(files: LibraryFile[]) {
  if (typeof Image === "undefined") return
  for (const f of files.slice(0, FIRST_SCREEN)) {
    if (decoded.has(f.url) || f.type?.startsWith("video/")) continue
    const img = new Image()
    img.decoding = "async"
    img.sizes = TILE_SIZES
    const set = thumbSet(f.url)
    if (set) img.srcset = set
    img.src = thumbUrl(f.url)
    img.decode().then(() => decoded.add(f.url), () => {})
  }
}

/* ── the list, kept per kind ──────────────────────────────────────────── */

const FRESH_MS = 60_000
type Kept = { files: LibraryFile[] | null; error: string | null; at: number; asking: Promise<void> | null }
const kept: Record<LibraryKind, Kept> = {
  image: { files: null, error: null, at: 0, asking: null },
  video: { files: null, error: null, at: 0, asking: null },
}
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((l) => l())

/**
 * The store's files of one kind, asked for once and kept for a minute. With
 * `warmFirst` the pictures of the first screen are fetched and decoded too:
 * that is the hover on "Choose from your files", a moment before the press.
 */
export function prefetchLibrary(kind: LibraryKind = "image", opts: { warmFirst?: boolean; force?: boolean } = {}): Promise<void> {
  const k = kept[kind]
  if (!opts.force && k.files && Date.now() - k.at < FRESH_MS) {
    if (opts.warmFirst) warm(k.files)
    return Promise.resolve()
  }
  if (k.asking) {
    if (opts.warmFirst) void k.asking.then(() => k.files && warm(k.files))
    return k.asking
  }
  k.asking = (async () => {
    try {
      const res = await fetch(kind === "video" ? "/api/files?kind=video" : "/api/files", { credentials: "same-origin", cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as { files?: LibraryFile[]; error?: string }
      if (!res.ok || !Array.isArray(data.files)) {
        k.error = typeof data.error === "string" ? data.error : "Your files could not be loaded. Try again."
      } else {
        k.files = data.files
        k.error = null
        k.at = Date.now()
        if (opts.warmFirst) warm(k.files)
      }
    } catch {
      k.error = "The connection dropped. Try again."
    } finally {
      k.asking = null
      tell()
    }
  })()
  return k.asking
}

function setKept(kind: LibraryKind, update: (files: LibraryFile[]) => LibraryFile[]) {
  kept[kind].files = update(kept[kind].files ?? [])
  tell()
}

function useLibrary(kind: LibraryKind) {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    listeners.add(rerender)
    void prefetchLibrary(kind)
    return () => { listeners.delete(rerender) }
  }, [kind])
  return kept[kind]
}

/* ── uploads, with how far each one is ────────────────────────────────── */

function putWithProgress(endpoint: string, token: string, key: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open("POST", endpoint)
    x.setRequestHeader("Authorization", `Bearer ${token}`)
    x.setRequestHeader("apikey", key)
    x.setRequestHeader("x-upsert", "false")
    x.setRequestHeader("cache-control", "max-age=31536000")
    x.setRequestHeader("Content-Type", type)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`upload ${x.status}`)))
    x.onerror = () => reject(new Error("upload failed"))
    x.send(body)
  })
}

/**
 * One file into the owner's library folder. Straight to storage with the
 * signed-in session, by XMLHttpRequest so the tile can say how far it is;
 * through the storage client when there is no session to hand.
 */
async function uploadOne(f: File, onProgress: (p: number) => void): Promise<LibraryFile> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("signed out")
  const video = VIDEO_TYPES[f.type]
  const ext = video ?? (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")
  const path = `${user.id}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const body: Blob = video ? f : await withoutMetadata(f)
  const session = (await supabase.auth.getSession()).data.session
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  if (session?.access_token && base && key && typeof XMLHttpRequest !== "undefined") {
    await putWithProgress(`${base}/storage/v1/object/store-builder-images/${path.split("/").map(encodeURIComponent).join("/")}`, session.access_token, key, body, f.type, onProgress)
  } else {
    const { error } = await supabase.storage.from("store-builder-images").upload(path, body, { cacheControl: "31536000", contentType: f.type, upsert: false })
    if (error) throw error
  }
  onProgress(1)
  confirmUpload("store-builder-images", path)
  const url = mediaUrl(supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl)
  return { id: `store-builder-images:${path}`, bucket: "store-builder-images", path, name: path.split("/").pop() ?? f.name, url, bytes: f.size, type: f.type, createdAt: new Date().toISOString(), source: "Library" }
}

type Pending = { key: string; name: string; preview: string | null; progress: number }

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

function useUploads(kind: LibraryKind, onDone: (files: LibraryFile[], from: File[]) => void) {
  const [pending, setPending] = React.useState<Pending[]>([])
  const doneRef = React.useRef(onDone)
  doneRef.current = onDone
  const upload = React.useCallback(async (list: FileList | File[]) => {
    const picked = Array.from(list).slice(0, 20)
    const bad = picked.map((f) => refusal(f, kind)).find(Boolean)
    if (bad) toast.error(bad)
    const good = picked.filter((f) => !refusal(f, kind))
    if (good.length === 0) return
    const rows = good.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, preview: kind === "image" ? URL.createObjectURL(f) : null, progress: 0 }))
    setPending((p) => [...rows, ...p])
    const results = await Promise.all(good.map(async (f, i) => {
      const row = rows[i]
      try {
        return await uploadOne(f, (p) => setPending((all) => all.map((x) => (x.key === row.key ? { ...x, progress: Math.max(x.progress, p) } : x))))
      } catch {
        toast.error(`${f.name} could not be uploaded.`)
        return null
      }
    }))
    const added = results.filter((x): x is LibraryFile => !!x)
    if (added.length) {
      for (const a of added) {
        const row = rows[results.indexOf(a)]
        if (row?.preview) decoded.add(a.url)
      }
      setKept(kind, (files) => [...added, ...files.filter((f) => !added.some((a) => a.id === f.id))])
    }
    setPending((p) => p.filter((x) => !rows.some((r) => r.key === x.key)))
    /* The local previews outlive the tiles a moment, for a picker that shows the file while the stored copy loads. */
    window.setTimeout(() => rows.forEach((r) => r.preview && URL.revokeObjectURL(r.preview)), 60_000)
    doneRef.current(added, good.filter((_, i) => !!results[i]))
  }, [kind])
  return { pending, upload }
}

/* ── one tile ─────────────────────────────────────────────────────────── */

async function download(f: LibraryFile) {
  try {
    const res = await fetch(f.url)
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } catch {
    window.open(f.url, "_blank", "noopener")
  }
}

const Tile = React.memo(function Tile({
  file,
  kind,
  mode,
  chosen,
  eager,
  onUse,
  onOpen,
  onDelete,
}: {
  file: LibraryFile
  kind: LibraryKind
  mode: "manage" | "pick"
  chosen: boolean
  eager: boolean
  onUse: (f: LibraryFile, thumb?: string) => void
  onOpen: (f: LibraryFile) => void
  onDelete: (f: LibraryFile) => Promise<boolean>
}) {
  const [loaded, setLoaded] = React.useState(() => decoded.has(file.url))
  const [original, setOriginal] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const src = original ? file.url : thumbUrl(file.url)
  const shown = () => { decoded.add(file.url); setLoaded(true) }

  const items = React.useMemo<ActionMenuItem[]>(() => {
    const list: ActionMenuItem[] = []
    if (mode === "pick") list.push({ label: "Use", icon: <Check className="h-4 w-4" />, onClick: () => onUse(file, original ? undefined : src) })
    list.push({ label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => void download(file) })
    list.push({ label: "Copy link", icon: <Copy className="h-4 w-4" />, onClick: () => void navigator.clipboard?.writeText(file.url).then(() => toast.success("Link copied"), () => toast.error("Could not copy the link")) })
    if (mode === "pick") list.push({ label: "Open in Files", icon: <ExternalLink className="h-4 w-4" />, href: `/app/files?file=${encodeURIComponent(file.id)}`, target: "_blank" })
    list.push({ label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "destructive", separatorBefore: true, onClick: () => setConfirming(true) })
    return list
  }, [file, mode, onUse, original, src])

  return (
    <li className="group/tile relative" data-file-tile={file.id}>
      <button
        type="button"
        onClick={() => (mode === "pick" ? onUse(file, original ? undefined : src) : onOpen(file))}
        className={cn(
          "relative block w-full overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30",
          chosen ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#eceef1] hover:border-[#d1d5db]",
        )}
        data-file={file.id}
        aria-label={mode === "pick" ? `Use ${file.name}` : `Open ${file.name}`}
      >
        <span className={cn("relative block aspect-square w-full bg-[#f3f4f6]", !loaded && "wb-image-skeleton")}>
          {kind === "video" ? (
            <video
              src={file.url}
              muted
              playsInline
              preload="metadata"
              onLoadedData={shown}
              onError={shown}
              className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out", loaded ? "opacity-100" : "opacity-0")}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              srcSet={original ? undefined : thumbSet(file.url)}
              sizes={TILE_SIZES}
              alt=""
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              ref={(el) => { if (el?.complete && el.naturalWidth > 0 && !loaded) shown() }}
              onLoad={shown}
              onError={() => (original ? shown() : setOriginal(true))}
              className={cn("absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ease-out", loaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {kind === "video" && (
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white">
              <Film className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </span>
        {chosen ? (
          <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#1a1a2e] text-white">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          </span>
        ) : null}
        {mode === "manage" ? <span className="block truncate border-t border-[#eceef1] bg-white px-2 py-1.5 text-[12px] text-[#4b5563]">{file.name}</span> : null}
      </button>
      {/* On a phone it is always there; with a mouse it shows on hover, on focus, and while its menu is open. */}
      <ResponsiveActionMenu
        title={file.name}
        menuWidth="w-48"
        items={items}
        trigger={
          <button
            type="button"
            aria-label={`More for ${file.name}`}
            data-file-menu=""
            className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-[#1a1a2e] shadow-[0_1px_3px_rgba(17,24,39,0.16)] backdrop-blur-sm transition-opacity duration-150 hover:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
      />
      {confirming ? (
        <div
          role="alertdialog"
          aria-label={`Delete ${file.name}?`}
          className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 rounded-xl border border-[#eceef1] bg-white/95 p-2 text-center animate-in fade-in duration-150"
          data-file-confirm=""
        >
          <p className="text-[12.5px] font-medium leading-tight text-[#1a1a2e]">Delete this file?</p>
          <p className="text-[11.5px] leading-tight text-[#6b7280]">It goes from anywhere it shows.</p>
          <div className="flex gap-1.5">
            <button type="button" className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep
            </button>
            <button
              type="button"
              className="h-8 rounded-lg bg-[#b42318] px-2.5 text-[12.5px] font-semibold text-white hover:bg-[#9b1c12] disabled:opacity-60"
              disabled={deleting}
              autoFocus
              onClick={async () => {
                setDeleting(true)
                const ok = await onDelete(file)
                if (!ok) { setDeleting(false); setConfirming(false) }
              }}
            >
              {deleting ? "Deleting" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
})

function PendingTile({ row }: { row: Pending }) {
  return (
    <li className="relative" data-file-pending="" aria-label={`Uploading ${row.name}`}>
      <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-[#eceef1] bg-[#f3f4f6]">
        {row.preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={row.preview} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" />
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

/* ── the pills, with one mark that slides between them ─────────────────── */

function SourcePills({ sources, value, onChange }: { sources: readonly Source[]; value: Source; onChange: (s: Source) => void }) {
  const row = React.useRef<HTMLDivElement>(null)
  const [mark, setMark] = React.useState<{ left: number; width: number } | null>(null)
  React.useLayoutEffect(() => {
    const el = row.current?.querySelector<HTMLElement>(`[data-source="${value}"]`)
    if (el) setMark({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, sources])
  return (
    <div ref={row} className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Where it came from">
      {mark ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-8 rounded-full bg-[#1a1a2e] transition-[transform,width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ width: mark.width, transform: `translateX(${mark.left - 4}px)`, left: 4 }}
        />
      ) : null}
      {sources.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          data-source={s}
          aria-selected={value === s}
          onClick={() => onChange(s)}
          className={cn(
            "relative inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors duration-200",
            value === s ? (mark ? "border-transparent text-white" : "border-[#1a1a2e] bg-[#1a1a2e] text-white") : "border-[#e5e7eb] bg-white/0 text-[#374151] hover:bg-[#f3f4f6]",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

/* ── the library ──────────────────────────────────────────────────────── */

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
  kind?: LibraryKind
  /** Lays itself out as a column whose grid scrolls (the chooser); otherwise the page scrolls it. */
  fill?: boolean
  /** A file to open the details of once the list is in (/app/files?file=). */
  openId?: string | null
}) {
  const lib = useLibrary(kind)
  const files = lib.files
  const [query, setQuery] = React.useState("")
  const [source, setSource] = React.useState<Source>("All")
  const [open, setOpen] = React.useState<LibraryFile | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const pickRef = React.useRef(onPick)
  pickRef.current = onPick

  const { pending, upload } = useUploads(kind, (added, from) => {
    /* One file dropped or chosen while picking: it is the one picked. */
    if (mode === "pick" && added.length === 1 && from.length === 1) pickRef.current?.(added[0].url, { file: from[0] })
    else if (added.length > 1) toast.success(`${added.length} files uploaded`)
  })

  React.useEffect(() => {
    if (!openId || !files) return
    const f = files.find((x) => x.id === openId)
    if (f) setOpen(f)
  }, [openId, files])

  const remove = React.useCallback(async (f: LibraryFile) => {
    const r = await api("/api/files", { method: "DELETE", body: { bucket: f.bucket, path: f.path } })
    if ("error" in r) {
      toast.error(r.error)
      return false
    }
    setKept(kind, (list) => list.filter((x) => x.id !== f.id))
    setOpen(null)
    toast.success("Deleted")
    return true
  }, [kind])
  const use = React.useCallback((f: LibraryFile, thumb?: string) => pickRef.current?.(f.url, { thumb: decoded.has(f.url) ? thumb : undefined }), [])

  const sources = kind === "video" ? SOURCES.slice(0, 3) : SOURCES
  const words = query.toLowerCase().trim()
  const shown = (files ?? []).filter((f) => (source === "All" || f.source === source) && (!words || f.name.toLowerCase().includes(words)))
  const accept = kind === "video" ? Object.keys(VIDEO_TYPES).join(",") : "image/jpeg,image/png,image/gif,image/webp,image/avif"

  const grid = (
    <div className={cn("relative", fill && "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5")} data-sheet-scroll={fill ? "" : undefined}>
      {lib.error && !files ? <Notice>{lib.error}</Notice> : null}
      {files === null && !lib.error ? (
        <ul className={cn("grid gap-2.5", mode === "pick" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5")} aria-busy="true" aria-label="Loading your files">
          {Array.from({ length: 8 }, (_, i) => <li key={i} className="wb-image-skeleton aspect-square rounded-xl bg-[#f3f4f6]" />)}
        </ul>
      ) : files !== null && shown.length === 0 && pending.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e3e5e8] px-4 py-10 text-center">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{files.length === 0 ? "No files yet" : "Nothing matches"}</p>
          <p className="mt-1 text-[13px] text-[#6b7280]">
            {files.length === 0 ? (kind === "video" ? "Upload a video here, or drop one in." : "Upload pictures here, or drop them in, and use them anywhere on your website.") : "Try another word or filter."}
          </p>
        </div>
      ) : files !== null ? (
        <ul key={`${source}|${words}`} className={cn("grid gap-2.5 animate-in fade-in duration-150", mode === "pick" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5")} data-files-grid="">
          {pending.map((row) => <PendingTile key={row.key} row={row} />)}
          {shown.map((f, i) => (
            <Tile key={f.id} file={f} kind={kind} mode={mode} chosen={mode === "pick" && !!selectedUrl && selectedUrl === f.url} eager={i < FIRST_SCREEN} onUse={use} onOpen={setOpen} onDelete={remove} />
          ))}
        </ul>
      ) : null}
    </div>
  )

  return (
    <div
      className={cn("relative", fill ? "flex min-h-0 flex-1 flex-col" : "space-y-3")}
      data-files-library={mode}
      onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true) } }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false) }}
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
            <input type="search" data-no-autofocus="" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] outline-none transition-colors focus:border-[#9ca3af] sm:text-[14px]" />
          </label>
          <button type="button" className={cn(BTN_SECONDARY, "shrink-0 gap-1.5 rounded-xl")} onClick={() => input.current?.click()} data-files-upload="">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {pending.length > 0 ? `Uploading ${pending.length}` : "Upload"}
          </button>
          <input ref={input} type="file" accept={accept} multiple className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = "" }} />
        </div>
        <SourcePills sources={sources} value={source} onChange={setSource} />
      </div>
      {grid}
      {/* Anything dropped on the library is uploaded into it. */}
      <div
        aria-hidden={!dragOver}
        data-files-drop={dragOver ? "on" : "off"}
        className={cn(
          "pointer-events-none absolute inset-1 z-[2] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#1a1a2e]/40 bg-white/90 text-[#1a1a2e] transition-opacity duration-150",
          dragOver ? "opacity-100" : "opacity-0",
        )}
      >
        <UploadCloud className="h-6 w-6" aria-hidden />
        <p className="text-[14px] font-medium">Drop to upload</p>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title="File details" wide>
        {open ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]" data-file-details="">
            <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
              {open.type?.startsWith("video/") ? (
                <video src={open.url} controls muted playsInline className="mx-auto max-h-[52vh] w-full" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={open.url} alt="" className="mx-auto max-h-[52vh] w-full object-contain" />
              )}
            </div>
            <div className="space-y-3">
              <dl className="space-y-2.5 text-[13.5px]">
                {[
                  ["Name", open.name],
                  ["Size", sizeText(open.bytes)],
                  ["Type", (open.type ?? "").replace(/^(image|video)\//, "").toUpperCase() || "Picture"],
                  ["Uploaded", dateText(open.createdAt)],
                  ["From", open.source],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] font-medium text-[#9ca3af]">{k}</dt>
                    <dd className="break-all text-[#1a1a2e]">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(BTN_SECONDARY, "gap-1.5")}
                  onClick={() => {
                    void navigator.clipboard?.writeText(open.url).then(() => toast.success("Link copied"))
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy link
                </button>
                <button type="button" className={cn(BTN_SECONDARY, "gap-1.5")} onClick={() => void download(open)}>
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </button>
                <button type="button" className={cn(BTN_DANGER, "gap-1.5")} onClick={() => void remove(open)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </button>
              </div>
              {open.source !== "Library" ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]">Deleting it takes it off anything that still shows it.</p> : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

/** Whoever decides what is a phone here: the same 640px the chooser's grid changes at. */
function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
}

/**
 * "Choose from your files": the library in pick mode, a window on a computer
 * and the shared draggable sheet on a phone (SheetDialog). It stays mounted
 * while it leaves, so it closes the way it opened.
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
  kind?: LibraryKind
}) {
  const phone = usePhone()
  /* Built on the first open, then kept: closed, it is only the dialog's exit that runs. */
  const [ever, setEver] = React.useState(open)
  if (open && !ever) setEver(true)
  if (!ever) return null
  const title = kind === "video" ? "Choose a video" : "Choose from your files"
  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      phone={phone}
      label={title}
      showCloseButton={false}
      onOpenAutoFocus={(e) => e.preventDefault()}
      sheet={{ maxHeight: "calc(var(--vv-h, 100dvh) * 0.88)", height: "calc(var(--vv-h, 100dvh) * 0.88)" }}
      className="flex h-[min(580px,calc(100dvh-112px))] w-[min(700px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_32px_80px_-24px_rgba(17,24,39,0.45),0_2px_8px_rgba(17,24,39,0.06)] sm:max-w-none"
      dialog={{ "aria-describedby": undefined } as never}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-files-chooser={kind}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-1 sm:px-5 sm:pt-4">
          <SheetDialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{title}</SheetDialogTitle>
          {!phone ? (
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <FilesLibrary
          mode="pick"
          kind={kind}
          fill
          selectedUrl={selectedUrl}
          onPick={(url, hint) => {
            onPick(url, hint)
            onClose()
          }}
        />
      </div>
    </SheetDialog>
  )
}
