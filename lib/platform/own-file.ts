/**
 * ===========================================================================
 *  SAVING ONE OF YOUR OWN PRODUCT FILES, IN A BROWSER AND IN THE APP
 * ===========================================================================
 * The product editor's file menu has Download. What happens depends on
 * where the page is running and on what it has in hand:
 *
 *   A browser, desktop or phone, with the file picked in this session:
 *     the picked file itself is saved (a blob URL on an <a download>). No
 *     request, nothing to wait for, and it works while it is still uploading.
 *
 *   A browser otherwise: the server checks the file is yours and answers
 *     with a two minute signed storage link that storage serves as an
 *     attachment under the file's name (lib/storage/owner-download.ts).
 *     That link is on STORAGE'S origin, where an anchor's `download` is
 *     ignored, so clicking one was an ordinary navigation and the editor
 *     went with it whenever the attachment header did not arrive. The file
 *     goes to a tab of its own now, opened empty inside the press and
 *     pointed at the link when it comes back (lib/platform/download-tab).
 *     A link on our own origin still saves through the anchor.
 *
 *   The iOS and Android apps: <a download> does nothing in WKWebView or in
 *     Capacitor's Android WebView, so the same signed link is opened in the
 *     system browser (lib/platform/save-file.ts, openInSystemBrowser), which
 *     saves an attachment: iOS asks Download, and the file is in Files, in
 *     Downloads; Android's browser saves it to Downloads and says so. That
 *     browser has no session, which is why the link is signed first.
 *
 *   An app with a file that has not finished uploading: there is no link
 *     yet, and the file came from this phone. The share sheet is offered
 *     with it where the Web Share API can carry a file (Save to Files on
 *     iOS); where it cannot, the row says it can be downloaded once it has
 *     uploaded.
 *
 * Detection is the Capacitor bridge (savePlatform), never the user agent.
 * Everything that touches the page is passed in, so tests/owner-download
 * runs every branch without a browser.
 */
import { downloadBlob, openInSystemBrowser, savePlatform, type SaveOutcome, type SavePlatform } from "./save-file"
import { anchorCanSave, clickDownloadLink, openDownloadTab, showBlockedDownload, type DownloadTab } from "./download-tab"

/** "blocked": the browser refused the tab, so the file is in the notice. */
export type OwnFileOutcome = SaveOutcome | "shared" | "blocked"

export type OwnFilePlan = { via: "local" } | { via: "link"; open: "anchor" | "system" } | { via: "share" } | { via: "none" }

/** How this file is saved here. Pure, and the whole of the decision. */
export function ownFilePlan(input: { platform: SavePlatform; hasLocal: boolean; assetId?: string | null }): OwnFilePlan {
  if (input.platform === "web") {
    if (input.hasLocal) return { via: "local" }
    if (input.assetId) return { via: "link", open: "anchor" }
    return { via: "none" }
  }
  if (input.assetId) return { via: "link", open: "system" }
  if (input.hasLocal) return { via: "share" }
  return { via: "none" }
}

export interface OwnFileDeps {
  platform: SavePlatform
  /** The signed link for a saved file, or throws with the server's words. */
  fetchLink: (assetId: string, name: string) => Promise<{ url: string; fileName: string }>
  downloadBlob: (blob: Blob, name: string) => void
  /** A tab of this page's own, opened before anything is awaited. */
  openTab: () => DownloadTab | null
  /** True where an <a download> really saves the address in place. */
  anchorCanSave: (url: string) => boolean
  /** An ordinary link click, for an address anchorCanSave allows. */
  followLink: (url: string, name: string) => void
  /** The calm notice with the file on it, when the tab was refused. */
  showBlocked: (url: string, name: string) => void
  openInSystemBrowser: (url: string) => Promise<void>
  /** The share sheet with this file; false where the page cannot share files. */
  shareFile: (file: File, name: string) => Promise<boolean>
}

export const NOT_UPLOADED_YET = "This file can be downloaded once it has uploaded."

export async function saveOwnFile(
  request: { assetId?: string | null; name: string; local?: File | null },
  deps: OwnFileDeps = ownFileDeps(),
): Promise<OwnFileOutcome> {
  const plan = ownFilePlan({ platform: deps.platform, hasLocal: !!request.local, assetId: request.assetId })
  switch (plan.via) {
    case "local":
      deps.downloadBlob(request.local!, request.name)
      return "downloaded"
    case "share":
      if (await deps.shareFile(request.local!, request.name)) return "shared"
      throw new Error(NOT_UPLOADED_YET)
    case "none":
      throw new Error(NOT_UPLOADED_YET)
    case "link": {
      /* Opened here, before the request: a tab asked for after an await is
         a pop-up and blockers eat it. Nothing is opened for the apps. */
      const tab = plan.open === "anchor" ? deps.openTab() : null
      let link: { url: string; fileName: string }
      try {
        link = await deps.fetchLink(request.assetId!, request.name)
      } catch (err) {
        tab?.close()
        throw err
      }
      if (plan.open === "anchor") {
        if (deps.anchorCanSave(link.url)) {
          tab?.close()
          deps.followLink(link.url, link.fileName)
          return "downloaded"
        }
        if (tab?.point(link.url)) return "downloaded"
        tab?.close()
        deps.showBlocked(link.url, link.fileName)
        return "blocked"
      }
      await deps.openInSystemBrowser(link.url)
      return deps.platform === "ios" ? "ios-download" : "android-download"
    }
  }
}

/**
 * The notice after the apps hand a file on, short enough for the editor's
 * one line toast on a phone: what to do next, not the file's name again.
 * Null where the browser's own download is the notice.
 */
export function ownFileNotice(outcome: OwnFileOutcome): string | null {
  if (outcome === "ios-download") return "Tap Download to save it to Files"
  if (outcome === "android-download") return "Saving to Downloads on this phone"
  /* The notice itself carries the file; the toast points at it. */
  if (outcome === "blocked") return "Your file is ready. Press Save."
  return null
}

/* ─── The real page ───────────────────────────────────────────────────── */

async function fetchLink(assetId: string, name: string): Promise<{ url: string; fileName: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetch(`/api/products/files/${encodeURIComponent(assetId)}/download?${new URLSearchParams({ name })}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
  } catch (err) {
    throw new Error(err instanceof DOMException && err.name === "AbortError" ? "That took too long. Check your connection and try again." : "No connection. Try again.")
  } finally {
    clearTimeout(timer)
  }
  const body = (await response.json().catch(() => ({}))) as { downloadUrl?: unknown; fileName?: unknown; error?: unknown }
  if (!response.ok || typeof body.downloadUrl !== "string") {
    throw new Error(typeof body.error === "string" && body.error ? body.error : "The file could not be fetched. Try again.")
  }
  return { url: body.downloadUrl, fileName: typeof body.fileName === "string" ? body.fileName : name }
}

async function shareFile(file: File, name: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false
  const named = file.name === name ? file : new File([file], name, { type: file.type })
  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [named] })) return false
  try {
    await navigator.share({ files: [named] })
  } catch (err) {
    /* Closing the sheet is a choice, not a failure. */
    if (err instanceof DOMException && err.name === "AbortError") return true
    return false
  }
  return true
}

export function ownFileDeps(): OwnFileDeps {
  return {
    platform: savePlatform(),
    fetchLink,
    downloadBlob,
    openTab: openDownloadTab,
    anchorCanSave,
    followLink: clickDownloadLink,
    showBlocked: showBlockedDownload,
    openInSystemBrowser,
    shareFile,
  }
}
