/**
 * ===========================================================================
 *  ONE WAY TO GET A BOUGHT FILE ONTO THE DEVICE
 * ===========================================================================
 * Every Download a buyer can press ends here: the library, a product in the
 * library, the receipt, the product page after buying, the checkout's thank
 * you, a OnePage. components/download-button.tsx keeps its old name,
 * downloadEntitledFile, as a thin call into this, so every one of those
 * call sites takes the same path without being touched.
 *
 * ASKING FOR THE FILE. /api/download/<asset> checks the receipt token or the
 * session and answers a short lived signed address on storage's origin,
 * with the file's size and type. An invoice (or any file our own origin
 * serves with a token in its address) is passed as `url` and skips that.
 *
 * IN A BROWSER nothing changed: the file goes to a tab of its own, opened
 * inside the press, or through an anchor when the address is ours, and a
 * refused tab gets the notice (lib/platform/download-tab.ts). The browser's
 * own download manager streams it and shows its progress.
 *
 * IN THE APP, where WKWebView and Android's WebView drop an anchor download
 * on the floor, in this order (lib/downloads/native.ts has the why):
 *
 *   1. the app's own downloader, where this install has it: streamed to
 *      disk, a bar in the tray, then Save to Files (iOS) or Downloads with
 *      Open (Android)
 *   2. on an iPhone without it, a file up to IN_PAGE_LIMIT is read here
 *      with a bar, then offered with Save to Files from the share sheet
 *   3. everything else goes to the system browser, which saves it
 *
 * The tray (components/downloads/download-tray.tsx) is put on the page the
 * first time the app needs it, so no page has to remember to mount it.
 *
 * Resolves once the file is saved, handed over, or waiting for Save to
 * Files, so a button that awaits it can say "Preparing" for exactly as
 * long as there is something to wait for.
 */
import { SAVE_FROM_NOTICE, anchorCanSave, clickDownloadLink, openDownloadTab, showBlockedDownload } from "@/lib/platform/download-tab"
import { openInSystemBrowser } from "@/lib/platform/save-file"
import {
  IN_PAGE_LIMIT,
  IOS_DOWNLOAD_EVENT,
  TooLargeForPage,
  androidDownloads,
  appPlatform,
  canShareFile,
  iosDownloads,
  readAndroidStatus,
  readIntoFile,
  type AppPlatform,
  type IosDownloadEvent,
} from "./native"
import { downloadJob, isBusy, patchJob, startJob, type DownloadJob } from "./download-store"

export type DownloadTarget =
  | { assetId: string; receiptToken?: string | null; fileName?: string | null }
  | { url: string; fileName: string }

export interface DownloadResult {
  success: boolean
  error?: string
  /** Why the server refused, when it did: "refunded", "pending", ... */
  reason?: string
  /**
   * Where the file went. "app": the app's own downloader. "share": held by
   * the page, waiting for Save to Files. "viewer": the system browser. The
   * rest are a browser's: "browser" an anchor, "tab" a tab, "notice" a
   * refused tab's notice.
   */
  openedIn?: "app" | "share" | "viewer" | "browser" | "tab" | "notice"
  /** Set only when the tab was refused: the address the notice offers. */
  blockedUrl?: string
}

export const UNAVAILABLE = "This file isn't available right now. Try again in a minute."
const TOO_SLOW = "That took too long. Check your connection and try again."
const SAVE_FAILED = "The file did not finish downloading. Try again."

/** The key a job and a button share. */
export function downloadKey(target: DownloadTarget): string {
  return "assetId" in target ? `asset:${target.assetId}` : `url:${target.url}`
}

interface Resolved {
  url: string
  fileName: string
  size: number | null
  type: string
}

type Failure = { failed: DownloadResult }

/** The signed address for an asset, asked for once per press and never kept. */
async function resolveTarget(target: DownloadTarget): Promise<Resolved | Failure> {
  if (!("assetId" in target)) {
    const absolute = new URL(target.url, window.location.href).toString()
    return { url: absolute, fileName: target.fileName, size: null, type: typeFromName(target.fileName) }
  }
  let apiUrl = `/api/download/${encodeURIComponent(target.assetId)}`
  if (target.receiptToken) apiUrl += `?${new URLSearchParams({ receipt: target.receiptToken }).toString()}`

  /* 30 seconds, so a dropped connection never leaves a button spinning. */
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  let response: Response
  try {
    response = await fetch(apiUrl, { signal: controller.signal, cache: "no-store", credentials: "same-origin" })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { failed: { success: false, error: TOO_SLOW } }
    /* A dropped connection's own message ("Failed to fetch") means nothing to a buyer. */
    return { failed: { success: false, error: UNAVAILABLE } }
  } finally {
    clearTimeout(timeoutId)
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || !data.success || typeof data.downloadUrl !== "string") {
    return {
      failed: {
        success: false,
        error: typeof data.error === "string" && data.error ? data.error : UNAVAILABLE,
        reason: typeof data.reason === "string" ? data.reason : undefined,
      },
    }
  }
  const fileName = (typeof data.fileName === "string" && data.fileName) || target.fileName || "download"
  return {
    url: data.downloadUrl,
    fileName,
    size: typeof data.fileSize === "number" && data.fileSize > 0 ? data.fileSize : null,
    type: (typeof data.mimeType === "string" && data.mimeType) || typeFromName(fileName),
  }
}

/* ─── The one entry point ────────────────────────────────────────────── */

export async function downloadFile(target: DownloadTarget): Promise<DownloadResult> {
  const platform = appPlatform()
  if (!platform) return downloadInBrowser(target)

  const key = downloadKey(target)
  const running = downloadJob(key)
  /* A second press on a file already on its way: the tray already shows it. */
  if (isBusy(running)) return { success: true, openedIn: running?.route === "app" ? "app" : "share" }

  const fallbackName = ("assetId" in target ? target.fileName : target.fileName) || "File"
  startJob({ key, fileName: fallbackName, phase: "preparing", route: "app", platform })
  void showTray()

  const resolved = await resolveTarget(target)
  if ("failed" in resolved) {
    patchJob(key, { phase: "failed", message: resolved.failed.error })
    return resolved.failed
  }
  patchJob(key, { fileName: resolved.fileName, total: resolved.size ?? 0, url: resolved.url })
  return downloadInApp(key, platform, resolved)
}

/* ─── A browser: the tab, the anchor, or the notice ──────────────────── */

async function downloadInBrowser(target: DownloadTarget): Promise<DownloadResult> {
  if (!("assetId" in target)) {
    /* Our own address, answered as an attachment: the anchor saves it in place. */
    const url = new URL(target.url, window.location.href).toString()
    if (anchorCanSave(url)) {
      clickDownloadLink(url, target.fileName)
      return { success: true, openedIn: "browser" }
    }
  }
  /* Opened first, before the await below: a tab asked for after a request
     has come back is a pop-up, and blockers eat it (lib/platform/download-tab). */
  const tab = openDownloadTab()
  const resolved = await resolveTarget(target)
  if ("failed" in resolved) {
    tab?.close()
    return resolved.failed
  }
  const { url, fileName } = resolved
  if (anchorCanSave(url)) {
    /* `download` is obeyed here, so the file saves without leaving. */
    tab?.close()
    clickDownloadLink(url, fileName)
    return { success: true, openedIn: "browser" }
  }
  if (tab?.point(url)) return { success: true, openedIn: "tab" }
  tab?.close()
  showBlockedDownload(url, fileName)
  /* The notice already names what happened; the row that shows this does
     not repeat it, it points at the thing to press. */
  return { success: false, error: SAVE_FROM_NOTICE, blockedUrl: url, openedIn: "notice" }
}

/* ─── The app ─────────────────────────────────────────────────────────── */

async function downloadInApp(key: string, platform: AppPlatform, file: Resolved): Promise<DownloadResult> {
  const android = platform === "android" ? androidDownloads() : null
  if (android) return viaAndroid(key, android, file)

  const ios = platform === "ios" ? iosDownloads() : null
  if (ios) return viaIos(key, ios, file)

  if (platform === "ios" && canShareFile(file.fileName, file.type) && (file.size ?? 0) <= IN_PAGE_LIMIT) {
    const held = await viaPage(key, file)
    if (held) return held
  }
  return viaSystemBrowser(key, platform, file)
}

/** Android's DownloadManager: to Downloads, with its notification, polled for the bar. */
function viaAndroid(key: string, bridge: NonNullable<ReturnType<typeof androidDownloads>>, file: Resolved): Promise<DownloadResult> {
  let id = ""
  try {
    id = bridge.download(file.url, file.fileName, file.type) || ""
  } catch {
    id = ""
  }
  if (!id) return viaSystemBrowser(key, "android", file)

  patchJob(key, {
    phase: "downloading",
    route: "app",
    nativeId: id,
    cancel: () => {
      try {
        bridge.cancelDownload?.(id)
      } catch {
        /* gone already */
      }
      patchJob(key, { phase: "failed", message: "Stopped.", cancel: undefined })
    },
  })

  return new Promise((resolve) => {
    let misses = 0
    const timer = window.setInterval(() => {
      const job = downloadJob(key)
      if (!job || job.phase === "failed") {
        window.clearInterval(timer)
        resolve({ success: false, error: job?.message || SAVE_FAILED })
        return
      }
      let status
      try {
        status = readAndroidStatus(bridge.downloadStatus(id))
      } catch {
        status = readAndroidStatus(null)
      }
      if (status.state === "done") {
        window.clearInterval(timer)
        patchJob(key, { phase: "saved", loaded: status.total || status.loaded, total: status.total || status.loaded, message: "Saved to Downloads", cancel: undefined })
        resolve({ success: true, openedIn: "app" })
        return
      }
      if (status.state === "failed") {
        /* A query can miss once while the download is being registered. */
        if (++misses < 3) return
        window.clearInterval(timer)
        patchJob(key, { phase: "failed", message: SAVE_FAILED, cancel: undefined })
        resolve({ success: false, error: SAVE_FAILED })
        return
      }
      misses = 0
      patchJob(key, { loaded: status.loaded, total: status.total || downloadJob(key)?.total || 0 })
    }, 400)
  })
}

/** iOS's URLSession: to disk, reported back by event, then the share sheet opens itself. */
let iosListening = false
const iosWaiting = new Map<string, (event: IosDownloadEvent) => void>()

function listenToIos() {
  if (iosListening) return
  iosListening = true
  window.addEventListener(IOS_DOWNLOAD_EVENT, (e) => {
    const detail = (e as CustomEvent<IosDownloadEvent>).detail
    if (detail && typeof detail.id === "string") iosWaiting.get(detail.id)?.(detail)
  })
}

function viaIos(key: string, bridge: NonNullable<ReturnType<typeof iosDownloads>>, file: Resolved): Promise<DownloadResult> {
  listenToIos()
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return new Promise((resolve) => {
    iosWaiting.set(id, (event) => {
      if (event.state === "running") {
        patchJob(key, { phase: "downloading", loaded: Number(event.loaded) || 0, total: Number(event.total) > 0 ? Number(event.total) : downloadJob(key)?.total || 0 })
        return
      }
      iosWaiting.delete(id)
      if (event.state === "done") {
        const size = Number(event.total) > 0 ? Number(event.total) : Number(event.loaded) || 0
        patchJob(key, { phase: "saved", loaded: size, total: size, message: "Choose where to keep it", cancel: undefined })
        resolve({ success: true, openedIn: "app" })
      } else {
        const message = event.state === "cancelled" ? "Stopped." : SAVE_FAILED
        patchJob(key, { phase: "failed", message, cancel: undefined })
        resolve({ success: false, error: message })
      }
    })
    patchJob(key, {
      phase: "downloading",
      route: "app",
      nativeId: id,
      cancel: () => {
        try {
          bridge.postMessage({ action: "cancel", id })
        } catch {
          /* gone already */
        }
      },
    })
    try {
      bridge.postMessage({ action: "start", id, url: file.url, fileName: file.fileName, mimeType: file.type })
    } catch {
      iosWaiting.delete(id)
      void viaSystemBrowser(key, "ios", file).then(resolve)
    }
  })
}

/** Read into a File here, then wait for a tap on Save to Files. Null: too big, go another way. */
async function viaPage(key: string, file: Resolved): Promise<DownloadResult | null> {
  const controller = new AbortController()
  patchJob(key, { phase: "downloading", route: "share", cancel: () => controller.abort() })
  try {
    const held = await readIntoFile(file.url, file.fileName, file.type, {
      signal: controller.signal,
      expected: file.size,
      onProgress: (loaded, total) => patchJob(key, { loaded, total: total || downloadJob(key)?.total || 0 }),
    })
    patchJob(key, { phase: "ready", file: held, loaded: held.size, total: held.size, message: undefined, cancel: undefined })
    return { success: true, openedIn: "share" }
  } catch (err) {
    if (err instanceof TooLargeForPage) return null
    if (controller.signal.aborted) {
      patchJob(key, { phase: "failed", message: "Stopped.", cancel: undefined })
      return { success: false, error: "Stopped." }
    }
    /* Storage refused the read here (a network blip, an old address): the system browser still can. */
    return null
  }
}

/** Safari or Chrome saves it; the tray says where it will be. */
async function viaSystemBrowser(key: string, platform: AppPlatform, file: Resolved): Promise<DownloadResult> {
  await openInSystemBrowser(file.url)
  patchJob(key, {
    phase: "handoff",
    route: "system",
    cancel: undefined,
    message: platform === "ios" ? "Opened in Safari. Tap Download there, and it lands in Files, in Downloads." : "Saving to Downloads. Chrome shows it in your notifications.",
  })
  return { success: true, openedIn: "viewer" }
}

/* ─── The tray ────────────────────────────────────────────────────────── */

let trayShown = false

async function showTray(): Promise<void> {
  if (trayShown || typeof document === "undefined") return
  trayShown = true
  try {
    const { mountDownloadTray } = await import("@/components/downloads/download-tray")
    mountDownloadTray()
  } catch {
    trayShown = false
  }
}

/* ─── Small helpers ──────────────────────────────────────────────────── */

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  epub: "application/epub+zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
}

export function typeFromName(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase()
  return TYPES[ext] || "application/octet-stream"
}

export type { DownloadJob }
