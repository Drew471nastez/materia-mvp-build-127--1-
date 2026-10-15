"use client"

import { useState } from "react"
import { ArrowDownToLine, Check, FileText, Loader2 } from "lucide-react"
import { downloadFile, downloadKey } from "@/lib/downloads/download-file"
import { percentOf, useDownloadJob } from "@/lib/downloads/download-store"
import { fileKindOf, formatFileSize, splitFileName } from "@/lib/receipts/rules"
import type { LibraryFile } from "@/lib/library/library-view"
import { PRIMARY, ROW_ACTION, SMALL } from "./library-ui"
import { cn } from "@/lib/utils"

/**
 * One file in the library: its type, its name cut in the middle so the end
 * and the extension stay readable, its size, and Download. The same row as
 * the receipt's (app/receipt/[token]/receipt-view.tsx FileRow), through the
 * one download path (lib/downloads/download-file.ts), so it saves in a
 * browser, in the iPhone app and in the Android app alike, and counts up
 * while it does.
 *
 * Round 31: in a purchase row's list (tone "secondary") its Download is the
 * row's calm secondary (library-ui.ts ROW_ACTION), never dimmed while it
 * runs. On a phone the button is the arrow alone and keeps that width while
 * it works: the spinner stays in it and the percent goes on the line under
 * the name, so neither the name nor the button changes width as it counts.
 */
export function LibraryFileRow({
  file,
  receiptToken,
  tone = "primary",
  note = null,
}: {
  file: LibraryFile
  receiptToken?: string | null
  tone?: "primary" | "secondary"
  /** A line under the size, such as a file the seller added after the purchase. */
  note?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pct = percentOf(useDownloadJob(busy ? downloadKey({ assetId: file.id }) : null))

  const onDownload = async () => {
    setBusy(true)
    setDone(false)
    setError(null)
    const result = await downloadFile({ assetId: file.id, receiptToken, fileName: file.name })
    setBusy(false)
    if (result.success) {
      setDone(true)
      window.setTimeout(() => setDone(false), 3000)
    } else {
      setError(result.error ?? "The file could not be fetched. Try again.")
    }
  }

  const size = formatFileSize(file.sizeBytes)
  const kind = fileKindOf(file.name)
  const { head, tail } = splitFileName(file.name)
  return (
    <li data-library-file="" className="border-b border-[#eef0f3] py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e9ecf0] bg-[#f7f8fa] text-[9.5px] font-bold tracking-[0.04em] text-[#6b7280]"
        >
          {kind && kind.length <= 4 ? kind : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p title={file.name} className="flex min-w-0 text-[14px] font-medium leading-5 text-[#1a1a2e]">
            <span className="overflow-hidden text-ellipsis whitespace-pre">{head}</span>
            {tail ? <span className="shrink-0 whitespace-pre">{tail}</span> : null}
          </p>
          {size || (busy && pct !== null) ? (
            <p data-file-meta="" className="text-[12px] leading-4 tabular-nums text-[#6b7280]">
              {size}
              {busy && pct !== null ? <span className="sm:hidden">{size ? " · " : ""}{pct}%</span> : null}
            </p>
          ) : null}
          {note ? <p className="text-[12px] font-medium leading-4 text-[#6d28d9]">{note}</p> : null}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`Download ${file.name}`}
          data-file-download=""
          className={cn(tone === "primary" ? cn(PRIMARY, SMALL) : ROW_ACTION, "w-12 px-0 tabular-nums sm:w-auto sm:min-w-[112px] sm:px-3")}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span className="hidden sm:inline">{pct !== null ? `${pct}%` : "Preparing"}</span>
            </>
          ) : done ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Done</span>
            </>
          ) : (
            <>
              <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
              {/* The arrow alone on a phone, so a long file name keeps its room. */}
              <span className="hidden sm:inline">Download</span>
            </>
          )}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 pl-12 text-[13px] leading-snug text-[#b42318]">
          {error}
        </p>
      ) : null}
    </li>
  )
}
