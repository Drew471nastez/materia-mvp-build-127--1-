"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, AlertCircle } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"
import { openInSystemBrowser } from "@/lib/platform/save-file"

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
  openedIn?: "viewer" | "browser" | "tab" | "notice"
  /** Set only when the tab was refused: the address the notice offers. */
  blockedUrl?: string
}

/** What the buyer reads when the browser refused the tab. */
const TAB_REFUSED = "This browser stopped the new tab from opening."

/**
 * A tab of its own for this click, opened before anything is awaited.
 *
 * A pop-up blocker lets through a window opened inside the click itself and
 * refuses one opened after an await, and the signed address takes a request
 * to fetch. So the tab is opened empty here, while the press is still the
 * thing running, and pointed at the file once the address arrives.
 *
 * Not `window.open(url, "_blank", "noopener")`: with that feature set the
 * answer is null in every browser, and there would be no tab left to point
 * anywhere. The way back is cut on the tab itself instead, which is the
 * same protection.
 */
function openBlankTab(): Window | null {
  try {
    const tab = window.open("", "_blank")
    if (tab) {
      try {
        tab.opener = null
      } catch {
        /* Some browsers cut it themselves and refuse the write. */
      }
    }
    return tab
  } catch {
    return null
  }
}

/** Our own origin, where `download` on an anchor is obeyed. */
function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

/** A same-origin file: an ordinary anchor click, no tab needed. */
function clickDownloadLink(url: string, filename: string): void {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.style.display = "none"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  setTimeout(() => link.remove(), 300)
}

/**
 * The tab was refused, so the file is put where the buyer can press it.
 *
 * It lives outside React because every caller of this helper shares it, from
 * the receipt to the library grid, and none of them may lose the page the
 * buyer is on. Nothing here navigates that page.
 */
function showBlockedDownload(url: string, filename: string): void {
  document.querySelector("[data-download-blocked]")?.remove()

  const holder = document.createElement("div")
  holder.setAttribute("data-download-blocked", "")
  holder.className = "fixed inset-x-0 bottom-0 z-[120] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"

  const card = document.createElement("div")
  card.className =
    "mx-auto flex max-w-[420px] flex-col gap-2 rounded-2xl border border-[#e4e7ec] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-8px_rgba(16,24,40,0.24)]"
  holder.appendChild(card)

  const title = document.createElement("p")
  title.className = "text-[14px] font-semibold text-[#1a1a2e]"
  title.textContent = TAB_REFUSED
  card.appendChild(title)

  const note = document.createElement("p")
  note.className = "text-[13px] leading-snug text-[#6b7280]"
  note.textContent = "Your file is ready. Press Save to keep it. This page stays where it is."
  card.appendChild(note)

  const row = document.createElement("div")
  row.className = "mt-1 flex items-center gap-2"
  card.appendChild(row)

  const link = document.createElement("a")
  link.setAttribute("data-download-blocked-link", "")
  link.href = url
  link.download = filename
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.className =
    "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-3 text-[13px] font-semibold text-white"
  const label = document.createElement("span")
  label.className = "truncate"
  label.textContent = `Save ${filename}`
  link.appendChild(label)
  row.appendChild(link)

  const close = document.createElement("button")
  close.type = "button"
  close.className =
    "inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-3 text-[13px] font-semibold text-[#1a1a2e]"
  close.textContent = "Close"
  row.appendChild(close)

  const remove = () => holder.remove()
  close.addEventListener("click", remove)
  link.addEventListener("click", () => setTimeout(remove, 400))
  /* The signed address lives five minutes; the notice goes when it does. */
  setTimeout(remove, 5 * 60 * 1000)

  document.body.appendChild(holder)
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
 * answers with Content-Disposition: attachment and the file is saved rather
 * than drawn.
 *
 * THE PAGE THE BUYER IS ON IS NEVER NAVIGATED. That address is on storage's
 * origin, not ours, and `download` on an anchor is ignored across origins:
 * the click became an ordinary navigation, the PDF drew itself in the tab,
 * and the receipt underneath it was gone. So the file goes to a tab of its
 * own, opened empty inside the press (openBlankTab) and pointed at the
 * address when it arrives. Our own origin still goes through the anchor,
 * where `download` is obeyed and no tab is needed. A browser that refuses
 * the tab gets the notice above, never a silent failure.
 */
export async function downloadEntitledFile(
  assetId: string,
  options?: { receiptToken?: string | null },
): Promise<DownloadResult> {
  /* Opened first, before the await below: a tab asked for after a request
     has come back is a pop-up, and blockers eat it. */
  const native = isNativeApp()
  const tab = native ? null : openBlankTab()
  const closeTab = () => {
    try {
      tab?.close()
    } catch {
      /* Already gone. */
    }
  }

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
      closeTab()
      return {
        success: false,
        error: data.error || "This file isn't available right now. Try again in a minute.",
        reason: typeof data.reason === "string" ? data.reason : undefined,
      }
    }

    const filename = data.fileName || "download"

    if (native) {
      /* No tab was opened for this one. The Browser plugin where the app
         has it (Android), else the address itself, which Capacitor hands to
         Safari: the iOS app is built without that plugin, so calling it
         alone failed every download there (lib/platform/save-file
         openInSystemBrowser). */
      await openInSystemBrowser(data.downloadUrl)
      return { success: true, openedIn: "viewer" }
    }

    if (isSameOrigin(data.downloadUrl)) {
      /* `download` is obeyed here, so the file saves without leaving. */
      closeTab()
      clickDownloadLink(data.downloadUrl, filename)
      return { success: true, openedIn: "browser" }
    }

    if (tab && !tab.closed) {
      try {
        /* replace, so the empty page is not left in that tab's history. */
        tab.location.replace(data.downloadUrl)
        return { success: true, openedIn: "tab" }
      } catch {
        closeTab()
      }
    }

    showBlockedDownload(data.downloadUrl, filename)
    /* The notice already names what happened; the row that shows this does
       not repeat it, it points at the thing to press. */
    return { success: false, error: "Your file is ready below. Press Save to keep it.", blockedUrl: data.downloadUrl, openedIn: "notice" }
  } catch (err) {
    closeTab()
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
