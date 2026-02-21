"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react"

interface DownloadButtonProps {
  assetId: string
  orderId?: string | null
  token?: string | null
  receiptToken?: string | null
  fileName?: string
  variant?: "default" | "outline" | "secondary"
  size?: "default" | "sm" | "lg"
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

/**
 * Handles entitlement-based file downloads.
 * Supports both:
 * - New receipt-based downloads
 * - Legacy orderId + token downloads
 */
export async function downloadEntitledFile(
  assetId: string,
  options?: {
    orderId?: string | null
    token?: string | null
    receiptToken?: string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    let apiUrl = `/api/download/${assetId}`
    const params = new URLSearchParams()

    if (options?.receiptToken) {
      params.set("receipt", options.receiptToken)
    } else if (options?.orderId && options?.token) {
      // Legacy support
      params.set("order", options.orderId)
      params.set("token", options.token)
    }

    if (params.toString()) {
      apiUrl += `?${params.toString()}`
    }

    // Get signed download URL from our API (with 30s timeout to prevent hanging)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(apiUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to get download link")
    }

    const filename = data.fileName || "download"

    // Trigger download via <a> link — the signed Supabase URL already has
    // Content-Disposition: attachment set (from { download: true }),
    // so the browser will download the file natively without loading it into memory.
    const link = document.createElement("a")
    link.href = data.downloadUrl
    link.download = filename
    link.style.display = "none"
    link.rel = "noopener noreferrer"
    document.body.appendChild(link)
    link.click()
    setTimeout(() => document.body.removeChild(link), 300)

    return { success: true }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "Request timed out. Please try again." }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Download failed",
    }
  }
}

export function DownloadButton({
  assetId,
  orderId,
  token,
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

  const handleDownload = async () => {
    setStatus("loading")
    setError(null)

    const result = await downloadEntitledFile(assetId, {
      orderId,
      token,
      receiptToken,
    })

    if (result.success) {
      setStatus("success")
      setTimeout(() => setStatus("idle"), 2000)
    } else {
      setError(result.error || "Download failed")
      setStatus("error")
      setTimeout(() => {
        setStatus("idle")
        setError(null)
      }, 3000)
    }
  }

  return (
    <div className="flex flex-col relative z-10">
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
            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
            <span className="truncate">Downloading...</span>
          </>
        ) : status === "success" ? (
          <>
            <CheckCircle className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">Downloaded!</span>
          </>
        ) : status === "error" ? (
          <>
            <AlertCircle className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">Failed</span>
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate min-w-0">{children || "Download File"}</span>
          </>
        )}
      </Button>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
