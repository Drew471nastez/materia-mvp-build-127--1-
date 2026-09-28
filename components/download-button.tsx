"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, AlertCircle } from "lucide-react"
import { downloadFile, downloadKey, type DownloadResult } from "@/lib/downloads/download-file"
import { percentOf, useDownloadJob } from "@/lib/downloads/download-store"

interface DownloadButtonProps {
  assetId: string
  receiptToken?: string | null
  fileName?: string
  variant?: "default" | "outline" | "secondary"
  size?: "default" | "sm" | "lg"
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export type { DownloadResult }

/**
 * One file, by asset id: the name every Download on Storelib has always
 * called. It is lib/downloads/download-file.ts now, which is where the
 * browser's tab, the app's own downloader, the iPhone's Save to Files and
 * the system browser are chosen between. Kept here under its old name so
 * the receipt, the checkout, the product page and a OnePage all take that
 * path without being rewritten.
 */
export async function downloadEntitledFile(
  assetId: string,
  options?: { receiptToken?: string | null; fileName?: string | null },
): Promise<DownloadResult> {
  return downloadFile({ assetId, receiptToken: options?.receiptToken, fileName: options?.fileName })
}

// Top toast notification for download errors only
function DownloadToast({ message, visible, onDone }: { message: string; visible: boolean; onDone: () => void }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 4000)
      return () => clearTimeout(t)
    }
  }, [visible, onDone])

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        {message}
      </div>
    </div>
  )
}

export function DownloadButton({
  assetId,
  receiptToken,
  fileName,
  variant = "default",
  size = "default",
  className,
  style,
  children,
}: DownloadButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMsg, setToastMsg] = useState("")

  const hideToast = useCallback(() => setToastVisible(false), [])
  /* In the app the file travels for a while: the button says how far. */
  const job = useDownloadJob(downloadKey({ assetId }))
  const pct = status === "loading" ? percentOf(job) : null

  const handleDownload = async () => {
    setStatus("loading")
    setError(null)

    const result = await downloadEntitledFile(assetId, { receiptToken, fileName })

    if (result.success) {
      setStatus("success")
      setTimeout(() => setStatus("idle"), 2000)
    } else {
      setError(result.error || "Download failed")
      setStatus("error")
      setToastMsg(result.error || "Download failed")
      setToastVisible(true)
      setTimeout(() => {
        setStatus("idle")
        setError(null)
      }, 3000)
    }
  }

  return (
    <div className="flex flex-col relative z-10">
      <DownloadToast message={toastMsg} visible={toastVisible} onDone={hideToast} />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={`cursor-pointer overflow-hidden ${className || ""}`}
        style={style}
        onClick={handleDownload}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {pct !== null ? `Downloading ${pct}%` : "Downloading..."}
          </>
        ) : status === "success" ? (
          <>
            <Download className="mr-2 h-4 w-4" />
            Downloaded!
          </>
        ) : status === "error" ? (
          <>
            <AlertCircle className="mr-2 h-4 w-4" />
            Failed
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            {children || "Download File"}
          </>
        )}
      </Button>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
