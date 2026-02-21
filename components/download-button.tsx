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

    // Step 1: get signed download URL from our API
    const response = await fetch(apiUrl)
    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || "Failed to get download link")
    }

    // Derive filename
    const filename = data.fileName || "download"

    // Step 2: Try blob-based download first (works same-origin & when CORS allows),
    // fall back to direct link navigation (always works but can't set filename).
    try {
      const fileRes = await fetch(data.downloadUrl)
      if (!fileRes.ok) throw new Error("fetch failed")
      const blob = await fileRes.blob()

      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      link.style.display = "none"
      link.download = filename
      document.body.appendChild(link)
      link.click()
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      }, 300)
    } catch {
      // Blob fetch failed (CORS, network, etc.) — fall back to direct <a> download.
      // Signed Supabase URLs include ?download=true which sets Content-Disposition.
      const link = document.createElement("a")
      link.href = data.downloadUrl
      link.download = filename
      link.style.display = "none"
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      setTimeout(() => document.body.removeChild(link), 300)
    }

    return { success: true }
  } catch (err) {
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
        className={`cursor-pointer ${className || ""}`}
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
            <CheckCircle className="mr-2 h-4 w-4" />
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
