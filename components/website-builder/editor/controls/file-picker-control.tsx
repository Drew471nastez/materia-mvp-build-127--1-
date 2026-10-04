"use client"

/**
 * ===========================================================================
 *  A FILE: UPLOADED, OR LINKED
 * ===========================================================================
 * The control for a `file_picker` setting: an attachment on the website, such
 * as a PDF sample, a press kit or a price list. It was a text box that said
 * "Paste a file URL", which left a creator with a PDF on their computer
 * nowhere to put it. Now it is the same shape as the image setting's picker
 * (image-picker.tsx, layout "row"): a tile with the file's type on it, its
 * name, Replace and Remove; and when there is nothing yet, one line to tap or
 * drop a file on. Under it, the address box, for a file that already lives
 * somewhere else.
 *
 * What it takes comes from the schema's `accept` (lib/storelib-theme/
 * file-kinds.ts): the file dialog offers only those, the empty line says
 * which in words, and anything else is refused before it uploads. The upload
 * goes straight from the browser to storage with a signed URL from
 * /api/website-builder/files, with a bar showing how far it has got, and the
 * server checks the bytes afterwards like every public file.
 */
import * as React from "react"
import { isOwnMedia } from "@/lib/storage/media-url"
import { FileText, RefreshCw, Trash2, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { useEchoedValue } from "@/components/website-builder/echo-field"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { acceptLabel, fileBadge, fileFits, inputAccept } from "@/lib/storelib-theme/file-kinds"
import { cn } from "@/lib/utils"
import { INPUT, PROBLEM } from "./styles"

/** An address a link can point at: https, http, or a path on this site. */
function isFileAddress(value: string): boolean {
  return /^(https?:\/\/[^\s/]+\S*|\/(?![/\\])\S*)$/i.test(value.trim())
}

/** The file's own name from its address, for the line beside its tile. */
function nameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url, "https://x.invalid").pathname.split("/").pop() || "") || "File"
  } catch {
    return "File"
  }
}

async function upload(file: File, accept: unknown, onProgress: (pct: number) => void): Promise<string> {
  const res = await fetch("/api/website-builder/files", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", fileSize: file.size, accept }),
  })
  const ticket = (await res.json().catch(() => ({}))) as { signedUrl?: string; publicUrl?: string; path?: string; bucket?: string; error?: string }
  if (!res.ok || !ticket.signedUrl || !ticket.publicUrl) throw new Error(ticket.error || "Could not start the upload. Try again.")

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload did not finish. Try again."))))
    xhr.addEventListener("error", () => reject(new Error("The connection dropped during the upload. Try again.")))
    xhr.addEventListener("timeout", () => reject(new Error("The upload took too long. Try again.")))
    xhr.open("PUT", ticket.signedUrl as string)
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (anon) {
      xhr.setRequestHeader("apikey", anon)
      xhr.setRequestHeader("Authorization", `Bearer ${anon}`)
    }
    xhr.setRequestHeader("x-upsert", "true")
    const form = new FormData()
    form.append("cacheControl", "31536000")
    form.append("", file, file.name)
    xhr.timeout = 600_000
    xhr.send(form)
  })
  /* The bytes are there: the server reads and checks them (lib/storage/confirm-upload.ts). */
  if (ticket.bucket && ticket.path) confirmUpload(ticket.bucket, ticket.path)
  return ticket.publicUrl
}

export function FilePickerControl({
  value,
  onChange,
  label,
  accept,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  /** The schema's `accept`: kinds ("pdf", "document") or extensions (".zip"). */
  accept?: unknown
  placeholder?: string
}) {
  const [shown, commit] = useEchoedValue(typeof value === "string" ? value : "", onChange)
  /* A file Storelib holds is shown by name in the picker, never as an address here (lib/storage/media-url.ts). */
  const [draft, setDraft] = React.useState(isOwnMedia(shown) ? "" : shown)
  const [seen, setSeen] = React.useState(shown)
  const [left, setLeft] = React.useState(false)
  if (seen !== shown) {
    setSeen(shown)
    setDraft(isOwnMedia(shown) ? "" : shown)
    setLeft(false)
  }
  const [progress, setProgress] = React.useState<number | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const uploading = progress !== null
  const what = acceptLabel(accept)
  const typed = draft.trim()
  const unusable = typed !== "" && !isFileAddress(typed)

  const take = async (file: File) => {
    if (uploading) return
    if (!fileFits(file.name, accept)) {
      toast.error(what === "any file" ? "That kind of file cannot go on a website." : `This setting takes a ${what}.`)
      return
    }
    setPending(file.name)
    setProgress(0)
    try {
      const url = await upload(file, accept, setProgress)
      setSeen(url)
      setDraft("")
      commit(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The upload did not finish. Try again.")
    } finally {
      setProgress(null)
      setPending(null)
    }
  }
  const pick = () => {
    if (!uploading) inputRef.current?.click()
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      accept={inputAccept(accept) || undefined}
      data-file-input=""
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ""
        if (f) void take(f)
      }}
    />
  )

  const current = shown || null
  const name = pending ?? (current ? nameOf(current) : "")

  return (
    <div className="space-y-2" data-file-setting="">
      {current || pending ? (
        <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-white p-1.5 pr-2 dark:bg-white/[0.04]" data-file-picker="filled">
          <span
            aria-hidden
            className="flex h-14 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-black/[0.06] bg-[#f4f4f5] text-[#4b5563] dark:bg-white/[0.06]"
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} />
            <span className="text-[8.5px] font-bold tracking-wide">{fileBadge(name)}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-foreground" title={name}>{name}</p>
            {uploading ? (
              <p className="mt-1 text-[11.5px] text-muted-foreground" aria-live="polite">Uploading {progress}%</p>
            ) : (
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={pick}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted max-sm:h-9"
                >
                  <RefreshCw className="h-3 w-3" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSeen("")
                    setDraft("")
                    commit("")
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:h-9"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            )}
          </div>
          {uploading && (
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-black/[0.06]">
              <span className="block h-full bg-[#1a1a2e] transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </span>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={label ? `Add ${label.toLowerCase()}` : "Add file"}
          data-file-picker="empty"
          onClick={pick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              pick()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void take(f)
          }}
          className={cn(
            "flex h-16 w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15",
            dragOver ? "border-foreground/40 bg-muted" : "border-neutral-300 bg-[#fafafa] hover:border-neutral-400 hover:bg-muted/60 dark:border-white/15 dark:bg-white/[0.03]",
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-white text-muted-foreground/70 dark:bg-white/[0.05]">
            <UploadCloud className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">Add file</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {what === "any file" ? "Upload or drop a file" : `Upload or drop a ${what}`}
            </span>
          </span>
        </div>
      )}
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label={label ? `${label} address` : "File address"}
        aria-invalid={left && unusable}
        data-file-address=""
        className={INPUT}
        placeholder={placeholder || "Or paste a file link"}
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          setLeft(false)
          const t = next.trim()
          if (t === "" || isFileAddress(t)) {
            setSeen(t)
            commit(t)
          }
        }}
        onBlur={() => setLeft(true)}
      />
      {left && unusable && (
        <p className={PROBLEM} role="alert">
          A file link starts with https:// or with / for a file on this site.
        </p>
      )}
      {fileInput}
    </div>
  )
}
