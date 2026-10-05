"use client"

import { useState } from "react"
import { ArrowDownToLine, FileText, Loader2, Paperclip } from "lucide-react"
import { downloadFile, downloadKey } from "@/lib/downloads/download-file"
import { percentOf, useDownloadJob } from "@/lib/downloads/download-store"
import { fileSizeLabel } from "@/lib/communities/post-media"
import { fileKindOf } from "@/lib/receipts/rules"
import { cn } from "@/lib/utils"

const ROW =
  "flex min-h-12 max-w-[520px] items-center gap-3 rounded-xl border border-[#e6e8eb] bg-[#fafbfc] px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[background-color,box-shadow] duration-150 hover:bg-[#f4f5f7] active:bg-[#eef0f3]"

/**
 * A file attached to a post or comment: reads like an attachment, downloads
 * through lib/downloads/download-file.ts (tray + Save to Files on Capacitor).
 */
export function CommunityFileAttachment({
  apiPath,
  fileName,
  size,
  className,
  compact = false,
}: {
  apiPath: string
  fileName: string
  size?: number | null
  className?: string
  /** Comment tiles: slightly smaller. */
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = { memberApi: apiPath, fileName }
  const pct = percentOf(useDownloadJob(busy ? downloadKey(target) : null))
  const kind = fileKindOf(fileName)
  const glyph = kind && kind.length <= 4 ? kind : null

  const go = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    setError(null)
    const result = await downloadFile(target)
    setBusy(false)
    if (!result.success) setError(result.error ?? "The file could not be fetched. Try again.")
  }

  return (
    <div className={cn("max-w-[520px]", className)}>
    <div className={ROW} data-post-file="" data-community-attachment="">
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[10px] border border-[#e9ecf0] bg-white text-[#4b5563]",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        {glyph ? (
          <span className="text-[9.5px] font-bold tracking-[0.04em]">{glyph}</span>
        ) : (
          <Paperclip className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]")} strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate font-medium text-[#1a1a2e]", compact ? "text-[13.5px] leading-5" : "text-[14px] leading-5")}>{fileName}</span>
        {size ? <span className="block text-[12px] leading-4 text-[#6b7280]">{fileSizeLabel(size)}</span> : null}
      </span>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`Download ${fileName}`}
        data-community-file-download=""
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#e4e7ec] bg-white font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[background-color,scale] duration-150 active:scale-[0.97] disabled:opacity-70",
          compact ? "h-9 min-w-9 px-2 text-[12px]" : "h-10 min-w-10 px-2.5 text-[13px] sm:min-w-[108px] sm:px-3",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span className="hidden tabular-nums sm:inline">{pct !== null ? `${pct}%` : "Preparing"}</span>
          </>
        ) : (
          <>
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Download</span>
          </>
        )}
      </button>
    </div>
      {error ? (
        <p role="alert" className="mt-1.5 pl-1 text-[12.5px] leading-snug text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Row with open-in-viewer on the left and download on the right (picture/video files). */
export function CommunityFileAttachmentSplit({
  apiPath,
  fileName,
  size,
  onOpen,
  openLabel,
}: {
  apiPath: string
  fileName: string
  size?: number | null
  onOpen: () => void
  openLabel: string
}) {
  const [busy, setBusy] = useState(false)
  const target = { memberApi: apiPath, fileName }
  const pct = percentOf(useDownloadJob(busy ? downloadKey(target) : null))
  const go = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    await downloadFile(target)
    setBusy(false)
  }

  return (
    <div className="flex min-h-12 max-w-[520px] items-center rounded-xl border border-[#e6e8eb] bg-[#fafbfc] shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-post-file="">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 min-w-0 flex-1 cursor-zoom-in items-center gap-3 rounded-l-xl px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a2e]/20"
        aria-label={openLabel}
        data-post-file-open=""
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e9ecf0] bg-white text-[#4b5563]">
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{fileName}</span>
          {size ? <span className="block text-[12.5px] text-[#6b7280]">{fileSizeLabel(size)}</span> : null}
        </span>
      </button>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`Download ${fileName}`}
        data-community-file-download=""
        data-no-viewer=""
        className="mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#6b7280] transition-colors hover:bg-[#eef0f2] hover:text-[#1a1a2e] active:scale-[0.97]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />}
        <span className="sr-only">{busy && pct !== null ? `${pct}%` : "Download"}</span>
      </button>
    </div>
  )
}
