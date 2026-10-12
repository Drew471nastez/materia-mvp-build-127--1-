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
 *   CHECKING IS INVISIBLE UNLESS IT TAKES A MOMENT. Every file is checked
 *   by the server when it has arrived (/api/v2/upload/complete,
 *   lib/security/uploads), from a few small reads, well under a second.
 *   The line says "Checking file…" only if that step is still going after
 *   CHECKING_DELAY_MS, so an ordinary upload never flashes it; then the row
 *   is simply the file. A file that is not accepted says one plain sentence
 *   in its row ("This file type isn't supported.", "We couldn't accept this
 *   file. Try another file.") with only a way to remove it: trying the same
 *   file again would give the same answer. Nothing here names a check, an
 *   engine or anything found; that is for the admin (/admin/security).
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
import { ownFileNotice, saveOwnFile, type OwnFileOutcome } from "@/lib/platform/own-file"
import type { UploadedFile } from "./editor-form"
import { secondaryDepth } from "./editor-buttons"
import { CHECKING_LABEL, REFUSED_FILE, useUploadChecking } from "@/lib/storage/upload-state"
import { tt } from "@/lib/i18n/text"

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
  /** The server refused the file itself: trying again would change nothing, so no Retry. */
  refused?: boolean
}

/**
 * The "Checking file…" line waits this long before it shows: the check is
 * usually over sooner, and a word that flashes for a frame is noise. The rule
 * and the words live in lib/storage/upload-state.ts, so the uploader on the
 * product edit page behaves identically; they are re-exported here because
 * this file is where the rest of this list's parts are.
 */
export { CHECKING_DELAY_MS, CHECKING_LABEL, REFUSED_FILE } from "@/lib/storage/upload-state"

/** A saved file the checks refused (scan_status), which buyers never get. */
export function isRefusedFile(f: Pick<UploadedFile, "scan_status">): boolean {
  return f.scan_status === "blocked" || f.scan_status === "infected" || f.scan_status === "quarantined"
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
  return unitA === unitB ? tt("{value} of {b}", { value: a.split(" ")[0], b }) : tt("{a} of {b}", { a, b })
}

function formatLeft(seconds: number): string {
  if (seconds < 10) return tt("a few sec left")
  if (seconds < 60) return tt("{value} sec left", { value: Math.round(seconds / 5) * 5 })
  if (seconds < 3600) return tt("{value} min left", { value: Math.round(seconds / 60) })
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? tt("{h} h {m} min left", { h, m }) : tt("{h} h left", { h })
}

/** Server sentences a creator may read as they are: the calm ones (lib/security/uploads/policy.ts, limits, quota). */
function sayable(message: string | undefined): message is string {
  if (!message || message.length > 160) return false
  return !/required|not found|denied|unauthori[sz]ed|forbidden|http|failed:|error|exception|stack|asset|bucket|token|record/i.test(message)
}

/** What went wrong, in words a creator can act on, and whether trying again could help. */
export function plainError(err: UploadError): { text: string; refused: boolean } {
  if (err.code === "NETWORK_ERROR") return { text: tt("Connection lost"), refused: false }
  const status = err.httpStatus ?? 0
  const refused = status === 400 || status === 413 || status === 415
  if (status === 413) return { text: sayable(err.message) ? err.message : tt("This file is too large. The limit is 10 GB."), refused: true }
  if (status === 415) return { text: sayable(err.message) ? err.message : tt("This file type isn't supported."), refused: true }
  if (status === 401) return { text: tt("Sign in again, then try once more."), refused: false }
  /* A refusal the server explained (not accepted, over a limit, the plan's file count) says so itself. */
  if (status >= 400 && status < 500 && sayable(err.message)) return { text: err.message, refused }
  return { text: tt("Upload failed. Try again."), refused: false }
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
  /* And the file that was picked for it, so Download in a browser saves that
     rather than fetching back what was just sent (lib/platform/own-file.ts). */
  const picked = useRef(new Map<string, File>())
  /* Transfer rate, smoothed, for the time left. */
  const rates = useRef(new Map<string, { since: number; at: number; sent: number; rate: number }>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
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
        picked.current.set(done.file_path, file)
        /* Both in one render: the row turns into the file in place, never gone for a frame. */
        setFiles((prev) => {
          const at = prev.findIndex((f) => (rows.current.get(f.file_path)?.seq ?? -1) > seq)
          return at < 0 ? [...prev, done] : [...prev.slice(0, at), done, ...prev.slice(at)]
        })
        patchNow(key, { status: "complete", progress: 100, sent: result.fileSize, total: result.fileSize, secondsLeft: null })
        later(() => drop(key), SETTLE_MS)
      },
      onError: (err) => {
        uploaders.current.delete(key)
        /* Cancelled here: the row is already on its way out. */
        if (err.code === "ABORTED") return
        const said = plainError(err)
        patchNow(key, { status: "error", error: said.text, refused: said.refused, secondsLeft: null })
      },
    })
    uploaders.current.set(key, uploader)
    uploader.start().catch(() => { /* onError has it */ })
  }, [queue, setFiles, patchNow, later, drop])

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
    patchNow(key, { status: "idle", progress: 0, sent: 0, error: undefined, refused: undefined, secondsLeft: null })
    run(u.key, u.seq, u.file, u.productId)
  }, [patchNow, run])

  /** The file picked in this session for a saved file, when there is one. */
  const localOf = useCallback((f: UploadedFile): File | null => picked.current.get(f.file_path) ?? null, [])

  /** The row a saved file is drawn in: the upload's own, when this session uploaded it. */
  const rowKeyOf = useCallback((f: UploadedFile) => rows.current.get(f.file_path)?.key ?? f.id ?? f.file_path, [])

  const inFlight = uploads.filter((u) => u.status !== "complete" && u.status !== "aborted")
  return { uploads, start, cancel, retry, rowKeyOf, seqOf, inFlight, localOf }
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
  local,
  onCancel,
  onRetry,
  onRename,
  onDelete,
  onSaved,
}: {
  entry: Entry
  /** The file as it was picked in this session, when it was. */
  local?: File | null
  onCancel: (key: string) => void
  onRetry: (key: string) => void
  onRename: (file: UploadedFile, name: string) => void
  onDelete: (file: UploadedFile) => void
  /** A download went somewhere worth saying (the apps name where). */
  onSaved: (outcome: OwnFileOutcome, name: string) => void
}) {
  const check = useRef<HTMLSpanElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const upload = entry.kind === "upload" ? entry.upload : null
  const file = entry.kind === "file" ? entry.file : null
  const name = file ? file.file_name : upload!.file.name
  const justDone = entry.kind === "file" && entry.justDone

  /*
    DOWNLOAD SAYS WHAT IT IS DOING ON THE ROW'S OWN LINE. The menu closes on
    the press, as every row menu here does, and the line under the name reads
    "Preparing download" while the link is asked for, then goes back to the
    size. A refusal replaces it in red, in the server's words, for a few
    seconds. One line of text changing: nothing moves.
  */
  const [saving, setSaving] = useState<{ state: "preparing" } | { state: "error"; message: string } | null>(null)
  const savingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (savingTimer.current) clearTimeout(savingTimer.current)
  }, [])
  const download = async () => {
    if (saving?.state === "preparing") return
    if (savingTimer.current) clearTimeout(savingTimer.current)
    setSaving({ state: "preparing" })
    try {
      const outcome = await saveOwnFile({ assetId: file?.id ?? null, name, local: local ?? upload?.file ?? null })
      setSaving(null)
      onSaved(outcome, name)
    } catch (err) {
      setSaving({ state: "error", message: err instanceof Error && err.message ? err.message : tt("Download failed. Try again.") })
      savingTimer.current = setTimeout(() => setSaving(null), 6000)
    }
  }

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

  /* "Checking file…" only once the check has taken longer than a blink, by
     the one rule every uploader follows (lib/storage/upload-state.ts). */
  const checking = useUploadChecking(status)

  const refusedFile = !!file && isRefusedFile(file)
  let meta: React.ReactNode
  if (saving?.state === "preparing") meta = <span data-file-download="preparing">{tt("Preparing download")}</span>
  else if (saving?.state === "error") meta = <span data-file-download="error" role="alert" className="text-[#b42318]">{saving.message}</span>
  else if (refusedFile) meta = <span data-file-refused="" className="text-[#b42318]">{REFUSED_FILE}</span>
  else if (file) meta = formatBytes(file.file_size)
  else if (status === "error") meta = <span className="text-[#b42318]">{upload!.error}</span>
  else if (status === "paused") meta = "Paused, waiting for a connection"
  else if (status === "completing" && checking) meta = CHECKING_LABEL
  else if ((status === "uploading" || status === "completing") && upload!.sent > 0) {
    meta = formatSent(upload!.sent, upload!.total) + (status === "uploading" && upload!.secondsLeft != null ? ` · ${formatLeft(upload!.secondsLeft)}` : "")
  } else meta = `Uploading… · ${formatBytes(upload!.total)}`

  return (
    <li
      data-file-row=""
      data-state={file ? (justDone ? "done" : refusedFile ? "refused" : "file") : status === "completing" && checking ? "checking" : status}
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
            aria-label={tt("File name")}
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
        <p data-file-meta="" className={cn("text-[13px] leading-[18px] tabular-nums text-[#6b6b76]", status === "error" || refusedFile ? "[overflow-wrap:anywhere]" : "truncate")}>
          {meta}
        </p>
      </div>
      {/* A new cluster per state, rather than one that changes width: the name keeps its place. */}
      <div key={file ? "file" : moving ? "moving" : status} className="relative flex shrink-0 items-center">
        {upload && moving ? (
          <>
            <span
              role="progressbar"
              aria-label={tt("Uploading {name}", { name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={upload.progress}
              data-upload-percent=""
              className="w-10 text-right text-[13px] tabular-nums text-[#6b7280] max-sm:sr-only"
            >
              {upload.progress}%
            </span>
            <ResponsiveActionMenu
              title={name}
              trigger={<RowMenuButton label={tt("Actions for {name}", { name })} className={cn(ICON_BUTTON, "text-[#9ca3af]")} />}
              items={[
                { label: tt("Download"), onClick: () => void download() },
                { label: tt("Cancel upload"), variant: "destructive", separatorBefore: true, onClick: () => onCancel(upload.key) },
              ]}
            />
          </>
        ) : upload && status === "error" && upload.refused ? (
          <button type="button" aria-label={tt("Remove {name}", { name })} onClick={() => onCancel(upload.key)} className={ICON_BUTTON}>
            <X className="h-4 w-4" />
          </button>
        ) : upload && status === "error" ? (
          <>
            <button
              type="button"
              data-upload-retry=""
              onClick={() => onRetry(upload.key)}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-[#1a1a2e] outline-none hover:bg-[#f1f2f4] active:bg-[#e9eaed] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] sm:h-8 sm:text-[13px]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {tt("Retry")}
            </button>
            <ResponsiveActionMenu
              title={name}
              trigger={<RowMenuButton label={tt("Actions for {name}", { name })} className={cn(ICON_BUTTON, "text-[#9ca3af]")} />}
              items={[
                { label: tt("Download"), onClick: () => void download() },
                { label: tt("Remove"), variant: "destructive", separatorBefore: true, onClick: () => onCancel(upload.key) },
              ]}
            />
          </>
        ) : file ? (
          <ResponsiveActionMenu
            title={file.file_name}
            trigger={<RowMenuButton label={tt("Actions for {file_name}", { file_name: file.file_name })} className={cn(ICON_BUTTON, "text-[#9ca3af]")} />}
            items={[
              { label: tt("Download"), onClick: () => void download() },
              { label: tt("Rename"), onClick: () => { setDraft(file.file_name); setEditing(true) } },
              { label: tt("Delete"), variant: "destructive", separatorBefore: true, onClick: () => onDelete(file) },
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
  onNotice,
}: {
  files: UploadedFile[]
  uploads: FileUploads
  max: number
  /** Files chosen or dropped: the editor checks them and starts them. */
  onPick: (files: FileList | null) => void
  onRename: (file: UploadedFile, name: string) => void
  onDelete: (file: UploadedFile) => void
  /** A short notice, for where an app sent a download (the editor's toast). */
  onNotice?: (message: string) => void
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

  /* A screen reader hears each file land, and a file that was not accepted. */
  const heard = useRef(new Set<string>())
  useEffect(() => {
    for (const u of uploads.uploads) {
      if (u.status === "complete" && !heard.current.has(u.key)) {
        heard.current.add(u.key)
        setAnnounce(tt("{name} uploaded", { name: u.file.name }))
      }
    }
  }, [uploads.uploads])
  useEffect(() => {
    for (const u of uploads.uploads) {
      if (u.status === "error" && u.refused && !heard.current.has(`refused:${u.key}`)) {
        heard.current.add(`refused:${u.key}`)
        setAnnounce(`${u.file.name}: ${u.error}`)
      }
    }
  }, [uploads.uploads])

  /* In a browser the browser shows the download; the apps hand it to the system browser, so they say where it went. */
  const onSaved = useCallback(
    (outcome: OwnFileOutcome, name: string) => {
      const message = ownFileNotice(outcome)
      if (message) {
        setAnnounce(`${name}: ${message}`)
        onNotice?.(message)
      } else if (outcome === "downloaded") setAnnounce(tt("{name} downloaded", { name }))
    },
    [onNotice],
  )

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
          {dragging ? tt("Drop to upload") : tt("Drop files here")}
        </p>
        <button type="button" onClick={choose} className={cn(secondaryDepth, "h-11 rounded-[10px] px-4 text-[15px] sm:h-9 sm:rounded-lg sm:text-[14px]", dragging && "invisible")}>
          {tt("Choose files")}
        </button>
        <p className="text-[12.5px] leading-4 text-[#9ca3af]">{tt("Up to 10 GB each")}</p>
      </div>
    )
  }

  return (
    <div data-file-drop="" data-dragging={dragging ? "" : undefined} {...dragProps} className="relative mt-3">
      {input}
      <ul
        aria-label={tt("Files")}
        data-file-list=""
        className={cn(
          "divide-y divide-[#eef0f2] overflow-hidden rounded-xl border bg-white transition-colors duration-150",
          dragging ? "border-[#1a1a2e]" : "border-[#e5e7eb]",
        )}
      >
        {entries.map((entry) => (
          <FileRow
            key={entry.key}
            entry={entry}
            local={entry.kind === "file" ? uploads.localOf(entry.file) : entry.upload.file}
            onCancel={uploads.cancel}
            onRetry={uploads.retry}
            onRename={onRename}
            onDelete={onDelete}
            onSaved={onSaved}
          />
        ))}
        <li>
          {full ? (
            <p className="flex min-h-[52px] items-center px-3 text-[13px] text-[#6b7280]">{tt("{max} files is the most a product can have", { max })}</p>
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
              <span className="text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">{tt("Add files")}</span>
              <span className="ml-auto hidden pr-1 text-[13px] text-[#9ca3af] sm:block">{tt("or drop them here")}</span>
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
        {tt("Drop to upload")}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  )
}
