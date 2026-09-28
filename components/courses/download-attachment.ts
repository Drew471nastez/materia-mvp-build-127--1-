"use client"

import { isNativeApp } from "@/lib/platform-utils"
import { openInSystemBrowser } from "@/lib/platform/save-file"
import { anchorCanSave, clickDownloadLink, openDownloadTab, showBlockedDownload } from "@/lib/platform/download-tab"

/**
 * A lesson's download, saved the way every other file on Storelib is
 * (lib/platform/download-tab): a tab of its own opened inside the press on
 * the web, so the course never gives way to a PDF; the system browser in
 * the iOS and Android apps. Resolves with an error to show, or null.
 */
export async function downloadAttachment(id: string): Promise<string | null> {
  const native = isNativeApp()
  const tab = native ? null : openDownloadTab()
  try {
    const res = await fetch(`/api/courses/attachments/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" })
    const body = (await res.json().catch(() => ({}))) as { url?: string; name?: string; error?: string }
    if (!res.ok || !body.url) {
      tab?.close()
      return body.error || "The file could not be opened. Try again."
    }
    if (native) {
      await openInSystemBrowser(body.url)
      return null
    }
    if (anchorCanSave(body.url)) {
      tab?.close()
      clickDownloadLink(body.url, body.name || "download")
      return null
    }
    if (tab?.point(body.url)) return null
    showBlockedDownload(body.url, body.name || "download")
    return null
  } catch {
    tab?.close()
    return "The file could not be opened. Check your connection and try again."
  }
}
