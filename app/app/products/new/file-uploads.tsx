"use client"

/**
 * ===========================================================================
 *  THE PRODUCT'S FILES, AND THEIR UPLOADS
 * ===========================================================================
 * "I don't like that loading purple thing. The success should not be that
 * green bar. The animation should not disrupt everything."
 *
 * Every file is one row in one list, uploading or not: a glyph for its kind,
 * its name, and one quiet line under it. A file that is uploading is the same
 * row as the file it becomes, under the same React key, so finishing changes
 * what the row says and nothing else: no row is added, none moves, and the
 * rows under it stay exactly where they were.
 *
 *   PROGRESS IS THE ROW ITSELF. A light grey wash behind the row grows from
 *   the left, on `transform: scaleX` only, and the line under the name says
 *   how much of how much has gone and roughly how long is left. The numbers
 *   are the uploader's own (lib/storage/chunked-upload.ts), coalesced to one
 *   render a frame however often the browser reports.
 *
 *   DONE IS A CHECK THAT GOES. The wash fades out, and a small dark check
 *   takes the glyph's place for about a second and fades back to the glyph.
 *   Opacity and transform, on the compositor.
 *
 *   A FAILURE STAYS IN ITS ROW, with what went wrong and Retry, which starts
 *   the same file again in the same place.
 *
 *   SEVERAL AT ONCE. Each file is its own upload, all running together, and
 *   each keeps the place it was given when it was dropped: a small file that
 *   finishes before a big one above it does not jump over it, in this list
 *   or in the form's own list of files, which is what gets saved.
 *
 *   THE VIRUS SCAN IS A WORD ON THE SAME LINE. With Storelib's malware
 *   scanner on, a finished file's line reads "Scanning" while ClamAV reads
 *   it (/api/v2/upload/scan, in the background: nothing waits for it), then
 *   "Clean", or "Blocked" in red with the threat's name. A blocked file has
 *   already been removed from storage and no buyer can get it; Delete takes
 *   the row away. With no verdict yet (the scanner was busy or down) it says
 *   "Virus check pending" and the server keeps retrying. With the scanner
 *   off, nothing is added to the line at all.
 *
 * Nothing here animates layout, and every motion is dropped under
 * prefers-reduced-motion.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, Plus, RotateCw, X } from "lucide-react"
import { DirectUploader, type UploadError, type UploadStatus } from "@/lib/storage/chunked-upload"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { RowMenuButton } from "../../orders/order-parts"
import { cn } from "@/lib/utils"
import type { UploadedFile } from "./editor-form"
import { secondaryDepth } from "./editor-buttons"

/** How long a finished upload keeps its check before it is an ordinary file row. */
export const SETTLE_MS = 1400
/** A cancelled row fades for this long before it goes. */
const LEAVE_MS = 180

export interface FileUpload {
  key: string
  /** The order it was dropped in. The list, and the saved files, keep it. */
  seq: number
  file: File
  productId?: string
  status: UploadStatus
  /** 0 to 100, as the uploader reports it (checksum, transfer, finishing). */
  progress: number
  sent: number
  total: number
  secondsLeft: number | null
  error?: string
}

/** Where a file's malware scan is, as its row says it. */
export type FileScan = { state: "scanning" | "clean" | "blocked" | "waiting"; threat?: string }

/** A saved file's state from the row the editor loaded, before anything is asked. */
export function scanFromStatus(status: string | null | undefined, threat?: string | null): FileScan | null {
  if (status === "infected" || status === "quarantined") return { state: "blocked", ...(threat ? { threat } : {}) }
  if (status === "pending_scan" || status === "scanning") return { state: "scanning" }
  return null
}

/** The scan route's answer as a row state; null when scanning is off and the row says nothing. */
export function scanFromAnswer(body: { status?: unknown; threat?: unknown; scanning?: unknown } | null): FileScan | null {
  if (!body) return { state: "waiting" }
  if (body.status === "infected") return { state: "blocked", ...(typeof body.threat === "string" ? { threat: body.threat } : {}) }
  if (body.scanning === false) return null
  if (body.status === "clean" || body.status === "skipped") return { state: "clean" }
  return { state: "waiting" }
}

/* ── words and numbers ───────────────────────────────────────────────── */

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const n = bytes / Math.pow(1024, i)
  return `${n >= 100 || i === 0 ? Math.round(n) : Number(n.toFixed(1))} ${units[i]}`
}

/** "12 of 48 MB": the unit once, when both sides share it. */
function formatSent(sent: number, total: number): string {
  const a = formatBytes(sent)
  const b = formatBytes(total)
  const unitA = a.split(" ")[1]
  const unitB = b.split(" ")[1]
  return unitA === unitB ? `${a.split(" ")[0]} of ${b}` : `${a} of ${b}`
}

function formatLeft(seconds: number): string {
  if (seconds < 10) return "a few sec left"
  if (seconds < 60) return `${Math.round(seconds / 5) * 5} sec left`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h} h ${m} min left` : `${h} h left`
}

/** What went wrong, in words a creator can act on. */
function plainError(err: UploadError): string {
  if (err.code === "NETWORK_ERROR") return "Connection lost"
  if (err.httpStatus === 413) return "Too large to upload"
  /* A refusal the server explained (not allowed, over a limit) says so itself. */
  if (err.code === "PREPARE_FAILED" && err.httpStatus && err.httpStatus < 500 && err.message) return err.message
  /* Refused when it was finished: most often the virus scan, which says so. */
  if ((err.code === "COMPLETE_FAILED" || err.code === "SERVER_UPLOAD_FAILED") && err.httpStatus === 400 && err.message) return err.message
  return "Upload failed"
}

/** The short name of a file's kind, drawn in its glyph. */
export function fileKind(name: string): string {
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
  if (!ext || ext.length > 4 || !/^[a-z0-9]+$/.test(ext)) return "FILE"
  if (ext === "jpeg") return "JPG"
  return ext.toUpperCase()
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/* ── the uploads ─────────────────────────────────────────────────────── */

/**
 * The uploads in flight, and the rows they keep. `setFiles` is the form's
 * own list of files: a finished upload is placed in it by the order it was
 * dropped in, not the order it finished in.
 */
export function useFileUploads(setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>) {
  const [uploads, setUploads] = useState<FileUpload[]>([])
  const uploadsRef = useRef(uploads)
  useEffect(() => { uploadsRef.current = uploads })
  const uploaders = useRef(new Map<string, DirectUploader>())
  /* Progress arrives as often as the browser likes; it reaches React once a frame. */
  const pending = useRef(new Map<string, Partial<FileUpload>>())
  const frame = useRef<number | null>(null)
  const seqRef = useRef(0)
  /* A file this session uploaded, by its storage path: the row it came from. */
  const rows = useRef(new Map<string, { key: string; seq: number }>())
  /* Transfer rate, smoothed, for the time left. */
  const rates = useRef(new Map<string, { since: number; at: number; sent: number; rate: number }>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  /* Each file's malware scan, by storage path. Kept here rather than on the
     form's files, so a verdict arriving never reads as an unsaved change. */
  const [scans, setScans] = useState<Record<string, FileScan>>({})
  const setScan = useCallback((path: string, scan: FileScan | null) => {
    setScans((prev) => {
      if (!scan) {
        if (!(path in prev)) return prev
        const next = { ...prev }
        delete next[path]
        return next
      }
      return { ...prev, [path]: scan }
    })
  }, [])
  const asked = useRef(new Set<string>())

  /**
   * Asks for a file's verdict and follows it on the row. The route scans the
   * whole file, which for a large one takes a while; the editor carries on
   * meanwhile. A busy or unreachable answer is tried once more, then left
   * as pending for the server's own retries.
   */
  const followScan = useCallback(async (path: string, assetId: string) => {
    if (asked.current.has(path)) return
    asked.current.add(path)
    setScan(path, { state: "scanning" })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/v2/upload/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        })
        const body = await res.json().catch(() => null)
        if (res.ok) return setScan(path, scanFromAnswer(body))
        if (res.status !== 429 && res.status < 500) return setScan(path, { state: "waiting" })
      } catch {
        /* A dropped connection: once more, below. */
      }
      await new Promise((r) => setTimeout(r, 4000))
    }
    setScan(path, { state: "waiting" })
  }, [setScan])

  useEffect(() => {
    const t = timers.current
    return () => {
      for (const id of t) clearTimeout(id)
      if (frame.current != null) cancelAnimationFrame(frame.current)
    }
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => { timers.current.delete(id); fn() }, ms)
    timers.current.add(id)
  }, [])

  const flush = useCallback(() => {
    frame.current = null
    if (!pending.current.size) return
    const batch = new Map(pending.current)
    pending.current.clear()
    setUploads((prev) => prev.map((u) => (batch.has(u.key) ? { ...u, ...batch.get(u.key) } : u)))
  }, [])

  const queue = useCallback((key: string, patch: Partial<FileUpload>) => {
    pending.current.set(key, { ...pending.current.get(key), ...patch })
    if (frame.current == null) frame.current = requestAnimationFrame(flush)
  }, [flush])

  const patchNow = useCallback((key: string, patch: Partial<FileUpload>) => {
    pending.current.delete(key)
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }, [])
  const drop = useCallback((key: string) => {
    pending.current.delete(key)
    rates.current.delete(key)
    setUploads((prev) => prev.filter((u) => u.key !== key))
  }, [])

  const seqOf = useCallback((f: UploadedFile) => rows.current.get(f.file_path)?.seq ?? -1, [])

  const run = useCallback((key: string, seq: number, file: File, productId?: string) => {
    rates.current.set(key, { since: performance.now(), at: performance.now(), sent: 0, rate: 0 })
    const uploader = new DirectUploader({
      file,
      productId,
      folder: "digital",
      onProgress: (progress, sent, total) => {
        /* Time left from a smoothed rate, and only once there is a second of it to go on. */
        const r = rates.current.get(key)
        let secondsLeft: number | null = null
        if (r) {
          const now = performance.now()
          const dt = now - r.at
          if (sent < r.sent) { r.sent = sent; r.at = now; r.since = now; r.rate = 0 }
          else if (dt >= 250) {
            const instant = (sent - r.sent) / dt
            r.rate = r.rate ? r.rate * 0.7 + instant * 0.3 : instant
            r.sent = sent
            r.at = now
          }
          if (r.rate > 0 && now - r.since > 1000 && total > sent) secondsLeft = (total - sent) / r.rate / 1000
        }
        queue(key, { progress, sent, total: total || file.size, secondsLeft })
      },
      onStatusChange: (status) => {
        /* The end states are set by onComplete and onError, with what goes with them. */
        if (status === "complete" || status === "error" || status === "aborted") return
        queue(key, { status })
      },
      onComplete: (result) => {
        uploaders.current.delete(key)
        const done: UploadedFile = {
          id: result.assetId || undefined,
          file_name: result.fileName,
          file_path: result.path,
          file_size: result.fileSize,
          mime_type: result.mimeType,
        }
        rows.current.set(done.file_path, { key, seq })
        /* Both in one render: the row turns into the file in place, never gone for a frame. */
        setFiles((prev) => {
          const at = prev.findIndex((f) => (rows.current.get(f.file_path)?.seq ?? -1) > seq)
          return at < 0 ? [...prev, done] : [...prev.slice(0, at), done, ...prev.slice(at)]
        })
        patchNow(key, { status: "complete", progress: 100, sent: result.fileSize, total: result.fileSize, secondsLeft: null })
        later(() => drop(key), SETTLE_MS)
        /* The virus scan runs in the background; the cron picks up any this
           misses. "pending_scan" is Storelib's scanner waiting to read the
           whole file: its verdict is followed on the row. */
        if (result.assetId && result.scanStatus === "pending_scan") {
          void followScan(done.file_path, result.assetId)
        } else if (result.assetId) {
          fetch("/api/v2/upload/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId: result.assetId }),
          }).catch(() => {})
        }
      },
      onError: (err) => {
        uploaders.current.delete(key)
        /* Cancelled here: the row is already on its way out. */
        if (err.code === "ABORTED") return
        patchNow(key, { status: "error", error: plainError(err), secondsLeft: null })
      },
    })
    uploaders.current.set(key, uploader)
    uploader.start().catch(() => { /* onError has it */ })
  }, [queue, setFiles, patchNow, later, drop, followScan])

  const start = useCallback((files: File[], productId?: string) => {
    const added: FileUpload[] = files.map((file) => {
      const seq = ++seqRef.current
      return { key: `upload-${seq}`, seq, file, productId, status: "idle", progress: 0, sent: 0, total: file.size, secondsLeft: null }
    })
    setUploads((prev) => [...prev, ...added])
    for (const u of added) run(u.key, u.seq, u.file, u.productId)
  }, [run])

  /* The row goes at once; the uploader's own "cancelled" answer arrives when it has stopped. */
  const cancel = useCallback((key: string) => {
    uploaders.current.get(key)?.abort()
    uploaders.current.delete(key)
    patchNow(key, { status: "aborted" })
    later(() => drop(key), LEAVE_MS)
  }, [patchNow, later, drop])

  const retry = useCallback((key: string) => {
    const u = uploadsRef.current.find((x) => x.key === key)
    if (!u || uploaders.current.has(key)) return
    patchNow(key, { status: "idle", progress: 0, sent: 0, error: undefined, secondsLeft: null })
    run(u.key, u.seq, u.file, u.productId)
  }, [patchNow, run])

  /** The row a saved file is drawn in: the upload's own, when this session uploaded it. */
  const rowKeyOf = useCallback((f: UploadedFile) => rows.current.get(f.file_path)?.key ?? f.id ?? f.file_path, [])

  /** A saved file's scan: this session's when there is one, else what the editor loaded. */
  const scanOf = useCallback(
    (f: UploadedFile): FileScan | null => scans[f.file_path] ?? scanFromStatus(f.scan_status, f.scan_threat),
    [scans],
  )

  const inFlight = uploads.filter((u) => u.status !== "complete" && u.status !== "aborted")
  return { uploads, start, cancel, retry, rowKeyOf, seqOf, inFlight, scanOf, followScan }
}

export type FileUploads = ReturnType<typeof useFileUploads>

/* ── the rows ────────────────────────────────────────────────────────── */

const ROW = "relative flex min-h-[64px] items-center gap-3 overflow-hidden pl-3 pr-1 sm:min-h-[56px] sm:pr-2"
const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#e9eaed] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] sm:h-8 sm:w-8 [-webkit-tap-highlight-color:transparent]"

/** The file's kind, as a small page with the extension on it. */
function Glyph({ name, check }: { name: string; check: React.RefObject<HTMLSpanElement | null> }) {
  const kind = fileKind(name)
  return (
    <span aria-hidden className="relative block h-10 w-9 shrink-0">
      <span
        data-file-glyph=""
        className={cn(
          "absolute inset-0 flex items-end justify-center rounded-[7px] border border-[#e3e5e9] bg-[#f6f7f8] pb-1.5 font-semibold tracking-[0.02em] text-[#4b5563]",
          kind.length > 3 ? "text-[8.5px]" : "text-[9.5px]",
        )}
      >
        {kind}
      </span>
      {/* The folded corner, drawn as a notch of the page's colour. */}
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-bl-[4px] border-b border-l border-[#e3e5e9] bg-white" />
      <span
        ref={check}
        data-upload-check=""
        className="absolute inset-0 flex items-center justify-center rounded-[7px] bg-[#1a1a2e] text-white opacity-0"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </span>
  )
}

type Entry =
  | { kind: "file"; key: string; seq: number; file: UploadedFile; justDone: boolean }
  | { kind: "upload"; key: string; seq: number; upload: FileUpload }

function FileRow({
  entry,
  scan,
  onCancel,
  onRetry,
  onRename,
  onDelete,
}: {
  entry: Entry
  /** The file's malware scan, when there is one to show. */
  scan?: FileScan | null
  onCancel: (key: string) => void
  onRetry: (key: string) => void
  onRename: (file: UploadedFile, name: string) => void
  onDelete: (file: UploadedFile) => void
}) {
  const check = useRef<HTMLSpanElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const upload = entry.kind === "upload" ? entry.upload : null
  const file = entry.kind === "file" ? entry.file : null
  const name = file ? file.file_name : upload!.file.name
  const justDone = entry.kind === "file" && entry.justDone

  /* The check: in, held, out. Only for the row that has just finished here. */
  const was = useRef(entry.kind)
  useLayoutEffect(() => {
    const from = was.current
    was.current = entry.kind
    if (!(from === "upload" && justDone)) return
    const el = check.current
    if (!el || typeof el.animate !== "function") return
    if (reducedMotion()) {
      el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 900 })
      return
    }
    el.animate(
      [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1)", offset: 0.18 },
        { opacity: 1, transform: "scale(1)", offset: 0.72 },
        { opacity: 0, transform: "scale(1)" },
      ],
      { duration: SETTLE_MS - 100, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    )
  }, [entry.kind, justDone])

  const status = upload?.status
  const moving = !!upload && status !== "error" && status !== "aborted"
  /* The wash: the share sent, full as it finishes, then faded out. */
  const fill = upload ? (status === "error" ? 0 : upload.progress / 100) : justDone ? 1 : 0
  const fillOpacity = moving ? 1 : 0

  let meta: React.ReactNode
  if (file && scan?.state === "blocked") {
    meta = (
      <span data-file-scan="blocked" className="text-[#b42318]">
        Blocked by the virus scan{scan.threat ? `: ${scan.threat}` : ""}. Buyers never get it.
      </span>
    )
  } else if (file && scan) {
    meta = (
      <>
        {formatBytes(file.file_size)} ·{" "}
        <span data-file-scan={scan.state}>
          {scan.state === "scanning" ? "Scanning" : scan.state === "clean" ? "Clean" : "Virus check pending"}
        </span>
      </>
    )
  } else if (file) meta = formatBytes(file.file_size)
  else if (status === "error") meta = <span className="text-[#b42318]">{upload!.error}</span>
  else if (status === "paused") meta = "Paused, waiting for a connection"
  else if (status === "completing") meta = "Finishing"
  else if (status === "uploading" && upload!.sent > 0) {
    meta = formatSent(upload!.sent, upload!.total) + (upload!.secondsLeft != null ? ` · ${formatLeft(upload!.secondsLeft)}` : "")
  } else meta = `Preparing · ${formatBytes(upload!.total)}`

  return (
    <li
      data-file-row=""
      data-state={file ? (justDone ? "done" : "file") : status}
      data-scan={scan?.state}
      className={cn(ROW, "transition-opacity duration-150 motion-reduce:transition-none", status === "aborted" && "opacity-0")}
    >
      <span
        aria-hidden
        data-upload-fill=""
        className="pointer-events-none absolute inset-0 origin-left bg-[#f1f2f4] transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${fill.toFixed(4)})`, opacity: fillOpacity }}
      />
      <Glyph name={name} check={check} />
      <div className="relative min-w-0 flex-1 py-2.5">
        {editing && file ? (
          <input
            autoFocus
            aria-label="File name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onRename(file, draft.trim() || file.file_name); setEditing(false) }
              if (e.key === "Escape") setEditing(false)
            }}
            onBlur={() => { onRename(file, draft.trim() || file.file_name); setEditing(false) }}
            className="h-8 w-full rounded-md border border-[#d9dbe0] bg-white px-2 text-[16px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] sm:text-[14px]"
          />
        ) : (
          <p className="truncate text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">{name}</p>
        )}
        {/* A blocked file's line wraps: the threat's name is the point of it. */}
        <p
          data-file-meta=""
          className={cn("text-[13px] leading-[18px] tabular-nums text-[#6b7280]", scan?.state === "blocked" && file ? "[overflow-wrap:anywhere]" : "truncate")}
        >
          {meta}
        </p>
      </div>
      {/* A new cluster per state, rather than one that changes width: the name keeps its place. */}
      <div key={file ? "file" : moving ? "moving" : status} className="relative flex shrink-0 items-center">
        {upload && moving ? (
          <>
            <span
              role="progressbar"
              aria-label={`Uploading ${name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={upload.progress}
              data-upload-percent=""
              className="w-10 text-right text-[13px] tabular-nums text-[#6b7280] max-sm:sr-only"
            >
              {upload.progress}%
            </span>
            <button type="button" aria-label={`Cancel upload of ${name}`} onClick={() => onCancel(upload.key)} className={ICON_BUTTON}>
              <X className="h-4 w-4" />
            </button>
          </>
        ) : upload && status === "error" ? (
          <>
            <button
              type="button"
              data-upload-retry=""
              onClick={() => onRetry(upload.key)}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f1f2f4] active:bg-[#e9eaed] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] sm:h-8 sm:text-[13px]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <button type="button" aria-label={`Remove ${name}`} onClick={() => onCancel(upload.key)} className={ICON_BUTTON}>
              <X className="h-4 w-4" />
            </button>
          </>
        ) : file ? (
          <ResponsiveActionMenu
            title={file.file_name}
            trigger={<RowMenuButton label={`Actions for ${file.file_name}`} className={cn(ICON_BUTTON, "text-[#9ca3af]")} />}
            items={[
              { label: "Rename", onClick: () => { setDraft(file.file_name); setEditing(true) } },
              { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => onDelete(file) },
            ]}
          />
        ) : null}
      </div>
    </li>
  )
}

/* ── the section ─────────────────────────────────────────────────────── */

export function DigitalFiles({
  files,
  uploads,
  max,
  onPick,
  onRename,
  onDelete,
}: {
  files: UploadedFile[]
  uploads: FileUploads
  max: number
  /** Files chosen or dropped: the editor checks them and starts them. */
  onPick: (files: FileList | null) => void
  onRename: (file: UploadedFile, name: string) => void
  onDelete: (file: UploadedFile) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const [announce, setAnnounce] = useState("")

  const doneKeys = new Set(uploads.uploads.filter((u) => u.status === "complete").map((u) => u.key))
  const entries: Entry[] = [
    ...files.map((f): Entry => {
      const key = uploads.rowKeyOf(f)
      return { kind: "file", key, seq: uploads.seqOf(f), file: f, justDone: doneKeys.has(key) }
    }),
    ...uploads.uploads
      .filter((u) => u.status !== "complete")
      .map((u): Entry => ({ kind: "upload", key: u.key, seq: u.seq, upload: u })),
  ].sort((a, b) => a.seq - b.seq)

  /* A screen reader hears each file land, and a file the scan blocked. */
  const heard = useRef(new Set<string>())
  useEffect(() => {
    for (const u of uploads.uploads) {
      if (u.status === "complete" && !heard.current.has(u.key)) {
        heard.current.add(u.key)
        setAnnounce(`${u.file.name} uploaded`)
      }
    }
  }, [uploads.uploads])
  const { scanOf, followScan } = uploads
  useEffect(() => {
    for (const f of files) {
      if (scanOf(f)?.state === "blocked" && !heard.current.has(`blocked:${f.file_path}`)) {
        heard.current.add(`blocked:${f.file_path}`)
        setAnnounce(`${f.file_name} was blocked by the virus scan`)
      }
    }
  }, [files, scanOf])

  /* A saved file still waiting for its scan is asked about once when the
     editor opens, so the row can say how it ended. */
  useEffect(() => {
    for (const f of files) {
      if (f.id && (f.scan_status === "pending_scan" || f.scan_status === "scanning")) void followScan(f.file_path, f.id)
    }
    // Only the files the editor opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const full = files.length + uploads.inFlight.length >= max
  const choose = () => inputRef.current?.click()

  const dragProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = full ? "none" : "copy"
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      if (!full) onPick(e.dataTransfer.files)
    },
  }

  const input = (
    <input
      ref={inputRef}
      id="file-input"
      type="file"
      multiple
      className="hidden"
      onChange={(e) => {
        onPick(e.target.files)
        /* The same file can be chosen again. */
        e.target.value = ""
      }}
    />
  )

  if (entries.length === 0) {
    return (
      <div
        data-file-drop=""
        data-dragging={dragging ? "" : undefined}
        {...dragProps}
        className={cn(
          "mt-3 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center sm:py-7 transition-colors duration-150",
          dragging ? "border-[#1a1a2e] bg-[#f8f9fa]" : "border-[#d1d5db] bg-white",
        )}
      >
        {input}
        {/* A phone has nothing to drag: it gets the button alone. */}
        <p className="text-[14px] leading-5 text-[#6b7280] max-sm:hidden">
          {dragging ? "Drop to upload" : "Drop files here"}
        </p>
        <button type="button" onClick={choose} className={cn(secondaryDepth, "h-11 rounded-[10px] px-4 text-[15px] sm:h-9 sm:rounded-lg sm:text-[14px]", dragging && "invisible")}>
          Choose files
        </button>
        <p className="text-[12.5px] leading-4 text-[#9ca3af]">Up to 10 GB each</p>
      </div>
    )
  }

  return (
    <div data-file-drop="" data-dragging={dragging ? "" : undefined} {...dragProps} className="relative mt-3">
      {input}
      <ul
        aria-label="Files"
        data-file-list=""
        className={cn(
          "divide-y divide-[#eef0f2] overflow-hidden rounded-xl border bg-white transition-colors duration-150",
          dragging ? "border-[#1a1a2e]" : "border-[#e5e7eb]",
        )}
      >
        {entries.map((entry) => (
          <FileRow key={entry.key} entry={entry} scan={entry.kind === "file" ? uploads.scanOf(entry.file) : null} onCancel={uploads.cancel} onRetry={uploads.retry} onRename={onRename} onDelete={onDelete} />
        ))}
        <li>
          {full ? (
            <p className="flex min-h-[52px] items-center px-3 text-[13px] text-[#6b7280]">{max} files is the most a product can have</p>
          ) : (
            <button
              type="button"
              data-add-files=""
              onClick={choose}
              className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-3 text-left outline-none transition-colors duration-100 hover:bg-[#fafafb] active:bg-[#f4f5f7] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] sm:min-h-[52px] [-webkit-tap-highlight-color:transparent]"
            >
              <span aria-hidden className="flex h-10 w-9 shrink-0 items-center justify-center rounded-[7px] border border-dashed border-[#c9ccd3] text-[#6b7280]">
                <Plus className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">Add files</span>
              <span className="ml-auto hidden pr-1 text-[13px] text-[#9ca3af] sm:block">or drop them here</span>
            </button>
          )}
        </li>
      </ul>
      {/* Over the list while files are dragged over it: where they will land. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/85 text-[14px] font-medium text-[#1a1a2e] transition-opacity duration-150 motion-reduce:transition-none",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        Drop to upload
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  )
}
