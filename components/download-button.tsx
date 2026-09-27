"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, AlertCircle } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"

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

export interface DownloadResult {
  success: boolean
  error?: string
  /** Why the server refused, when it did: "refunded", "pending", ... */
  reason?: string
  /** "viewer" inside the native app, where iOS shows the file with Share. */
  openedIn?: "viewer" | "browser"
}

/**
 * Fetches a short-lived signed URL for one file from /api/download and hands
 * it to the platform. The URL is made per click by the server, after it has
 * checked the receipt token or the session, and it is never stored.
 *
 * IN THE APP. The iOS and Android shells are WKWebView and Android WebView,
 * which ignore <a download>. The file is opened with @capacitor/browser
 * instead (SFSafariViewController on iOS, a Custom Tab on Android), where
 * iOS shows the file with its Share button, so Save to Files works, and
 * Android hands it to the download manager.
 *
 * IN A BROWSER. The signed URL is created with download=true, so storage
 * answers with Content-Disposition: attachment and a plain anchor click
 * saves it, including in mobile Safari, without a pop-up to be blocked.
 */
export async function downloadEntitledFile(
  assetId: string,
  options?: { receiptToken?: string | null },
): Promise<DownloadResult> {
  try {
    let apiUrl = `/api/download/${encodeURIComponent(assetId)}`
    if (options?.receiptToken) {
      apiUrl += `?${new URLSearchParams({ receipt: options.receiptToken }).toString()}`
    }

    // Get signed download URL from our API (with 30s timeout to prevent hanging)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(apiUrl, { signal: controller.signal, cache: "no-store", credentials: "same-origin" })
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await response.json().catch(() => ({}) as Record<string, any>)

    if (!response.ok || !data.success || typeof data.downloadUrl !== "string") {
      return {
        success: false,
        error: data.error || "This file isn't available right now. Try again in a minute.",
        reason: typeof data.reason === "string" ? data.reason : undefined,
      }
    }

    const filename = data.fileName || "download"

    if (isNativeApp()) {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url: data.downloadUrl })
      return { success: true, openedIn: "viewer" }
    }

    const link = document.createElement("a")
    link.href = data.downloadUrl
    link.download = filename
    link.style.display = "none"
    link.rel = "noopener noreferrer"
    document.body.appendChild(link)
    link.click()
    setTimeout(() => link.remove(), 300)

    return { success: true, openedIn: "browser" }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "That took too long. Check your connection and try again." }
    }
    /* A dropped connection's own message ("Failed to fetch") means nothing to a buyer. */
    return { success: false, error: "This file isn't available right now. Try again in a minute." }
  }
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

  const handleDownload = async () => {
    setStatus("loading")
    setError(null)

    const result = await downloadEntitledFile(assetId, { receiptToken })

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
            Downloading...
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
