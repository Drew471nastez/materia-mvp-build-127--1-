"use client"

import { downloadFile } from "@/lib/downloads/download-file"

/**
 * A lesson's download, saved the way every other bought file on Storelib is
 * (lib/downloads/download-file): in a browser the file saves where the
 * button is, with no new tab and no about:blank; in the iOS and Android
 * apps it goes through the app's own downloader, the in-page Save to Files,
 * or the system browser, in that order. The course never gives way to a
 * PDF. Resolves with an error to show, or null.
 */
export async function downloadAttachment(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/courses/attachments/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" })
    const body = (await res.json().catch(() => ({}))) as { url?: string; name?: string; error?: string }
    if (!res.ok || !body.url) return body.error || "The file could not be opened. Try again."
    const saved = await downloadFile({ url: body.url, fileName: body.name || "download" })
    return saved.success ? null : saved.error || "The file could not be opened. Try again."
  } catch {
    return "The file could not be opened. Check your connection and try again."
  }
}
