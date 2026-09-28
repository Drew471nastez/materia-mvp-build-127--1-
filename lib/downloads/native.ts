/**
 * ===========================================================================
 *  WHAT THE PHONE APP CAN DO WITH A FILE, ASKED AT THE MOMENT OF THE PRESS
 * ===========================================================================
 * The iOS and Android apps are Capacitor shells around storelib.com, so the
 * web layer ships the moment Vercel deploys while the shell only changes
 * with a store release. The page therefore never assumes which shell it is
 * in. It asks, every time:
 *
 *   ANDROID   window.StorelibNative.download, added to MainActivity with
 *             this change. The system DownloadManager fetches the file
 *             straight to Downloads, streaming to disk, with its own
 *             notification, and answers downloadStatus() for the bar. An
 *             install from before that release has no such method.
 *
 *   IOS       window.webkit.messageHandlers.storelibDownload, added to
 *             AppDelegate with this change. URLSession writes the file to
 *             disk as it arrives and then opens the share sheet, where Save
 *             to Files is. It reports progress back as a `storelib-download`
 *             event on window. An install from before that release has no
 *             such handler.
 *
 *   OLDER INSTALLS, which is every phone until the stores ship the above:
 *             iOS can still share a File the page holds (Web Share, level 2
 *             in WKWebView since iOS 15), so a file small enough to hold is
 *             read here with a real progress bar and then offered with Save
 *             to Files. Anything bigger, and all of Android (its WebView has
 *             no Web Share and no download listener), goes to the system
 *             browser, which streams it to Files or Downloads itself.
 *
 * Nothing here holds a big file in memory: the two native routes stream to
 * disk, and the in-page route refuses anything over IN_PAGE_LIMIT before it
 * reads a byte of it.
 */

export type AppPlatform = "ios" | "android"

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string }

/** Which app this page is running in, or null in a browser. */
export function appPlatform(): AppPlatform | null {
  if (typeof window === "undefined") return null
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.()
    if (p === "ios" || p === "android") return p
  }
  /* The same user agent test the layout uses (app/library/layout.tsx), for a
     page that has not been handed the bridge yet. */
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : ""
  if (/StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))) {
    return /Android/i.test(ua) ? "android" : "ios"
  }
  return null
}

/* ─── Android: MainActivity's StorelibNative ─────────────────────────────── */

export interface AndroidDownloads {
  /** Starts the download and answers its id, or "" when it could not start. */
  download: (url: string, fileName: string, mimeType: string) => string
  /** JSON: {"state":"pending|running|paused|done|failed","loaded":n,"total":n} */
  downloadStatus: (id: string) => string
  /** Opens the saved file in whatever app handles it. */
  openDownload?: (id: string) => boolean
  cancelDownload?: (id: string) => void
}

export function androidDownloads(): AndroidDownloads | null {
  if (typeof window === "undefined") return null
  const bridge = (window as unknown as { StorelibNative?: Partial<AndroidDownloads> }).StorelibNative
  if (!bridge || typeof bridge.download !== "function" || typeof bridge.downloadStatus !== "function") return null
  return bridge as AndroidDownloads
}

export interface AndroidStatus {
  state: "pending" | "running" | "paused" | "done" | "failed"
  loaded: number
  total: number
}

export function readAndroidStatus(raw: string | null | undefined): AndroidStatus {
  try {
    const o = JSON.parse(String(raw ?? ""))
    const state = ["pending", "running", "paused", "done", "failed"].includes(o?.state) ? o.state : "failed"
    return { state, loaded: Number(o?.loaded) > 0 ? Number(o.loaded) : 0, total: Number(o?.total) > 0 ? Number(o.total) : 0 }
  } catch {
    return { state: "failed", loaded: 0, total: 0 }
  }
}

/* ─── iOS: AppDelegate's storelibDownload handler ───────────────────────── */

export interface IosDownloads {
  postMessage: (message: { action?: "start" | "share" | "cancel"; id: string; url?: string; fileName?: string; mimeType?: string }) => void
}

export function iosDownloads(): IosDownloads | null {
  if (typeof window === "undefined") return null
  const handler = (window as unknown as { webkit?: { messageHandlers?: { storelibDownload?: IosDownloads } } }).webkit?.messageHandlers
    ?.storelibDownload
  return handler && typeof handler.postMessage === "function" ? handler : null
}

/** What the app sends back, as the detail of a `storelib-download` event. */
export interface IosDownloadEvent {
  id: string
  state: "running" | "done" | "failed" | "cancelled"
  loaded?: number
  total?: number
}

export const IOS_DOWNLOAD_EVENT = "storelib-download"

/* ─── Older iPhones: a file the page holds, handed to the share sheet ───── */

/**
 * The most a phone's page may read into memory before the file goes to the
 * system browser instead. WKWebView's web process is killed well before a
 * gigabyte, and a File built from its parts briefly holds them twice, so
 * the ceiling sits far below that. Most bought files (a PDF, a pack of
 * presets, an ebook) are far below it; a video pack of hundreds of
 * megabytes is streamed to disk by the system instead.
 */
export const IN_PAGE_LIMIT = 100 * 1024 * 1024

/** Whether this page can put a file of this kind in the share sheet. */
export function canShareFile(name: string, type: string): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
    if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false
    return nav.canShare({ files: [new File([new Uint8Array(0)], name || "download", { type: type || "application/octet-stream" })] })
  } catch {
    return false
  }
}

export class TooLargeForPage extends Error {
  constructor() {
    super("too large to hold")
  }
}

/**
 * Reads the file into one File, reporting as it goes. Refuses before reading
 * when the size is known and too big, and stops as soon as it passes the
 * limit when the size was not known, so memory never holds more than the
 * limit. The parts are dropped as soon as the File exists.
 */
export async function readIntoFile(
  url: string,
  name: string,
  type: string,
  opts: { limit?: number; signal?: AbortSignal; expected?: number | null; onProgress?: (loaded: number, total: number) => void; fetchImpl?: typeof fetch } = {},
): Promise<File> {
  const limit = opts.limit ?? IN_PAGE_LIMIT
  if (opts.expected && opts.expected > limit) throw new TooLargeForPage()
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(url, { signal: opts.signal, cache: "no-store", credentials: "omit" })
  if (!res.ok || !res.body) throw new Error(`status ${res.status}`)
  const total = Number(res.headers.get("content-length")) || opts.expected || 0
  if (total > limit) {
    try {
      await res.body.cancel()
    } catch {
      /* already closed */
    }
    throw new TooLargeForPage()
  }
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  opts.onProgress?.(0, total)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    loaded += value.byteLength
    if (loaded > limit) {
      parts.length = 0
      try {
        await reader.cancel()
      } catch {
        /* already closed */
      }
      throw new TooLargeForPage()
    }
    parts.push(value)
    opts.onProgress?.(loaded, total)
  }
  const file = new File(parts as BlobPart[], name || "download", { type: type || res.headers.get("content-type") || "application/octet-stream" })
  parts.length = 0
  return file
}

/** Hands a held file to the share sheet. Needs a fresh tap: call it from one. */
export async function shareHeldFile(file: File): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await (navigator as Navigator).share({ files: [file], title: file.name })
    return "shared"
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed"
  }
}
