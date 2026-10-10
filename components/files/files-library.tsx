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
 *   pick     the website builder's image fields: the same grid, and a press
 *            chooses the picture (a bottom sheet on a phone, a window on a
 *            computer, through Modal)
 *
 * The list is the API's (app/api/files, lib/files/library.ts). An upload goes
 * straight to storage into the owner's own library folder, without its
 * location and camera details, the way the builder's image field uploads.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Copy, ImagePlus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { mediaUrl } from "@/lib/storage/media-url"
import { BTN_DANGER, BTN_SECONDARY, Modal, Notice, api } from "@/components/physical/ui"

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

const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const MAX_BYTES = 5 * 1024 * 1024
const SOURCES = ["All", "Library", "Website", "Product photos"] as const

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

export function FilesLibrary({ mode = "manage", onPick, selectedUrl }: { mode?: "manage" | "pick"; onPick?: (url: string) => void; selectedUrl?: string | null }) {
  const [files, setFiles] = React.useState<LibraryFile[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [source, setSource] = React.useState<(typeof SOURCES)[number]>("All")
  const [open, setOpen] = React.useState<LibraryFile | null>(null)
  const [uploading, setUploading] = React.useState(0)
  const [dragOver, setDragOver] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    const r = await api<{ files: LibraryFile[] }>("/api/files")
    if ("error" in r) setError(r.error)
    else {
      setFiles(r.data.files)
      setError(null)
    }
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const upload = async (list: FileList | File[]) => {
    const picked = Array.from(list).slice(0, 20)
    const bad = picked.find((f) => !TYPES.has(f.type) || f.size > MAX_BYTES)
    if (bad) toast.error(!TYPES.has(bad.type) ? `${bad.name}: only JPG, PNG, GIF, WebP and AVIF pictures.` : `${bad.name} is over 5 MB.`)
    const good = picked.filter((f) => TYPES.has(f.type) && f.size <= MAX_BYTES)
    if (good.length === 0) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error("Sign in again to upload.")
    setUploading((n) => n + good.length)
    let lastUrl: string | null = null
    for (const f of good) {
      try {
        const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")
        const path = `${user.id}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const body = await withoutMetadata(f)
        const { error: upErr } = await supabase.storage.from("store-builder-images").upload(path, body, { cacheControl: "31536000", contentType: f.type, upsert: false })
        if (upErr) throw upErr
        confirmUpload("store-builder-images", path)
        lastUrl = mediaUrl(supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl)
      } catch {
        toast.error(`${f.name} could not be uploaded.`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    await load()
    if (mode === "pick" && lastUrl && good.length === 1) onPick?.(lastUrl)
  }

  const remove = async (f: LibraryFile) => {
    const r = await api("/api/files", { method: "DELETE", body: { bucket: f.bucket, path: f.path } })
    if ("error" in r) return toast.error(r.error)
    setFiles((list) => list?.filter((x) => x.id !== f.id) ?? null)
    setOpen(null)
    toast.success("Deleted")
  }

  const words = query.toLowerCase().trim()
  const shown = (files ?? []).filter((f) => (source === "All" || f.source === source) && (!words || f.name.toLowerCase().includes(words)))

  return (
    <div
      className="space-y-3"
      data-files-library={mode}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search files</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input type="search" data-no-autofocus="" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
        </label>
        <button type="button" className={cn(BTN_SECONDARY, "shrink-0 gap-1.5")} onClick={() => input.current?.click()} data-files-upload="">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {uploading > 0 ? `Uploading ${uploading}` : "Upload"}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Where it came from">
        {SOURCES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => setSource(s)} className={cn("inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors", source === s ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f8f9fa]")}>
            {s}
          </button>
        ))}
      </div>

      {error ? <Notice>{error}</Notice> : null}
      <div className={cn("relative rounded-2xl transition-[box-shadow]", dragOver && "shadow-[0_0_0_2px_#1a1a2e]")}>
        {files === null ? (
          <div className="min-h-[240px]" aria-busy="true" />
        ) : shown.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e3e5e8] px-4 py-10 text-center">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{files.length === 0 ? "No files yet" : "Nothing matches"}</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">{files.length === 0 ? "Upload pictures here, or drop them in, and use them anywhere on your website." : "Try another word or filter."}</p>
          </div>
        ) : (
          <ul className={cn("grid gap-2.5", mode === "pick" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5")} data-files-grid="">
            {shown.map((f) => {
              const chosen = mode === "pick" && !!selectedUrl && selectedUrl === f.url
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => (mode === "pick" ? onPick?.(f.url) : setOpen(f))}
                    className={cn("group relative block w-full overflow-hidden rounded-xl border bg-[#f8f9fa] text-left transition-[border-color,box-shadow] hover:border-[#d1d5db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30", chosen ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#eceef1]")}
                    data-file={f.id}
                    aria-label={mode === "pick" ? `Use ${f.name}` : `Open ${f.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-contain" />
                    {chosen ? (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#1a1a2e] text-white">
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                      </span>
                    ) : null}
                    {mode === "manage" ? <span className="block truncate border-t border-[#eceef1] bg-white px-2 py-1.5 text-[12px] text-[#4b5563]">{f.name}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title="File details" wide>
        {open ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]" data-file-details="">
            <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.url} alt="" className="mx-auto max-h-[52vh] w-full object-contain" />
            </div>
            <div className="space-y-3">
              <dl className="space-y-2.5 text-[13.5px]">
                {[
                  ["Name", open.name],
                  ["Size", sizeText(open.bytes)],
                  ["Type", (open.type ?? "").replace("image/", "").toUpperCase() || "Picture"],
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

/**
 * "Choose from your files": the library in pick mode, in a window on a
 * computer and a bottom sheet on a phone. Drawn into the body, so a sidebar
 * or editor panel with a transform can't trap or clip it.
 */
export function FilesLibraryChooser({ open, onClose, onPick, selectedUrl }: { open: boolean; onClose: () => void; onPick: (url: string) => void; selectedUrl?: string | null }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted || !open) return null
  return createPortal(
    <Modal open onClose={onClose} title="Choose from your files" wide>
      <FilesLibrary
        mode="pick"
        selectedUrl={selectedUrl}
        onPick={(url) => {
          onPick(url)
          onClose()
        }}
      />
    </Modal>,
    document.body,
  )
}
