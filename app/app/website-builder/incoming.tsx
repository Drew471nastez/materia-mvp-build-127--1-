"use client"

/**
 * ===========================================================================
 *  A WEBSITE ON ITS WAY INTO THE LIBRARY
 * ===========================================================================
 * Import used to be a spinner in the button and then, a few seconds later,
 * a new row somewhere down the page that nobody was looking at. Now the
 * website being made has a place from the first moment:
 *
 *   1. The row it will become is drawn at the end of the library, which is
 *      where the server puts a new website (the highest sort_order plus one,
 *      lib/website-builder/library-limit.ts). Its cover breathes, and a thin
 *      bar under the name shows the upload, then the server's work.
 *   2. When the server answers, the page is refreshed, and the real row takes
 *      the placeholder's place in the same frame: same position, same height.
 *   3. The page scrolls it to the middle of the screen, in the element that
 *      actually scrolls, and a ring fades in and out around it once.
 *
 * Import, Add theme and Duplicate all go through this. Only an import has a
 * file to upload, so only it shows a percentage.
 *
 * Everything that moves here moves on opacity or transform, and nothing
 * moves at all under reduced motion (app/globals.css, `.wb-incoming-*`).
 */
import * as React from "react"
import { RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type IncomingKind = "import" | "add" | "duplicate"

export interface Incoming {
  kind: IncomingKind
  /** What the row is called until the real one arrives. */
  name: string
  phase: "uploading" | "working" | "error"
  /** 0 to 1, while uploading. */
  progress: number
  /** Set once the server has answered: the row the page waits for. */
  installId?: string
  error?: string
}

/** How long the ring around an arrived website lasts. Read by the CSS too, through the inline style. */
export const ARRIVAL_MS = 1200

/** What the row says while the server works. */
const WORKING: Record<IncomingKind, string> = {
  import: "Importing",
  add: "Adding",
  duplicate: "Copying",
}

export function incomingStatus(i: Incoming): string {
  if (i.phase === "error") return i.error ?? "Something went wrong"
  if (i.phase === "uploading") return `Uploading ${Math.round(i.progress * 100)}%`
  return WORKING[i.kind]
}

/** "summer-shop.storelib-theme.zip" is "summer-shop". */
export function nameFromFile(file: { name: string }): string {
  const base = file.name.replace(/(\.storelib-theme)?\.zip$/i, "").replace(/\.storelib-theme$/i, "")
  return base.trim() || "Imported theme"
}

/**
 * ===========================================================================
 *  AN UPLOAD THAT SAYS HOW FAR IT HAS GOT
 * ===========================================================================
 * `fetch` cannot report upload progress, so the file goes by XMLHttpRequest,
 * whose `upload.onprogress` fires as the bytes leave. `onSent` is called when
 * the last byte has gone, which is when the page switches from a percentage
 * to "Importing": from there on the wait is the server's.
 */
export function postWithProgress(
  url: string,
  body: FormData,
  on: { progress: (fraction: number) => void; sent: () => void },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.responseType = "text"
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) on.progress(Math.min(1, e.loaded / e.total))
    }
    xhr.upload.onload = () => {
      on.progress(1)
      on.sent()
    }
    xhr.onload = () => {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(xhr.responseText || "{}")
      } catch {
        /* not JSON: a proxy's error page, say */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data })
    }
    xhr.onerror = () => resolve({ ok: false, status: 0, data: {} })
    xhr.onabort = () => resolve({ ok: false, status: 0, data: {} })
    xhr.send(body)
  })
}

/**
 * ===========================================================================
 *  SCROLLED INTO VIEW IN THE ELEMENT THAT SCROLLS
 * ===========================================================================
 * In /app the window does not scroll: the page's own root does, or the
 * shell's `.app-content-scroll` around it. `scrollIntoView` would also move
 * every other scrollable ancestor, the shell's included, which on iOS can
 * shift the whole app under the status bar. So the nearest ancestor that
 * really scrolls is found and only it is moved, to put the element in its
 * middle (`center`) or just enough to show it (`nearest`).
 *
 * Resolves when the scroll has ended, so the caller can start what comes
 * after it (the ring) on a still page.
 */
export function scrollerOf(el: HTMLElement): HTMLElement {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function scrollToRow(el: HTMLElement, block: "center" | "nearest" = "center"): Promise<void> {
  const scroller = scrollerOf(el)
  const view = scroller === document.scrollingElement
    ? { top: 0, height: window.innerHeight }
    : { top: scroller.getBoundingClientRect().top, height: scroller.clientHeight }
  const box = el.getBoundingClientRect()
  const offset = box.top - view.top
  let delta = 0
  if (block === "center") {
    delta = offset - (view.height - box.height) / 2
  } else if (offset < 0) {
    delta = offset - 16
  } else if (offset + box.height > view.height) {
    delta = offset + box.height - view.height + 16
  }
  const max = scroller.scrollHeight - scroller.clientHeight
  const target = Math.max(0, Math.min(max, scroller.scrollTop + delta))
  if (Math.abs(target - scroller.scrollTop) < 1) return Promise.resolve()
  const smooth = !reducedMotion()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      scroller.removeEventListener("scrollend", finish)
      resolve()
    }
    scroller.addEventListener("scrollend", finish, { once: true })
    /* A browser without `scrollend` (Safari before 18) still moves on. */
    window.setTimeout(finish, smooth ? 700 : 0)
    scroller.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" })
  })
}

/**
 * The row for the website being made. The same four cells as a real library
 * row, with the same classes for which of them a phone hides: a table lays
 * out its columns from its cells, and one cell spanning the row while the
 * others had two made a phone's table four columns wide, which squeezed
 * every other website's name out of its row. The same heights too, so
 * nothing below it moves when the real one replaces it.
 *
 * A failure keeps the row with the reason, Try again and a way to dismiss
 * it: under the reason on a phone, where the actions column is only wide
 * enough for a More button, and in the actions column from 640px up.
 */
export function IncomingRow({
  incoming,
  onRetry,
  onDismiss,
  ref,
}: {
  incoming: Incoming
  onRetry: () => void
  onDismiss: () => void
  ref?: React.Ref<HTMLTableRowElement>
}) {
  const failed = incoming.phase === "error"
  const status = incomingStatus(incoming)
  const actions = (where: "phone" | "wide") => (
    <span className={cn("items-center gap-1", where === "phone" ? "mt-1.5 flex sm:hidden" : "hidden justify-end sm:flex")}>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150 hover:bg-[#f8f9fa] sm:h-9"
      >
        <RotateCcw className="h-3.5 w-3.5 text-[#6b7280]" strokeWidth={2} />
        Try again
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6b7280] transition-colors duration-150 hover:bg-[#eef0f3] hover:text-[#1a1a2e] sm:h-9 sm:w-9"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  )
  return (
    <tr ref={ref} data-incoming={incoming.phase} aria-live="polite" aria-busy={!failed}>
      <td className="p-3 sm:px-4">
        <div className="wb-incoming-in flex w-full min-w-0 items-center gap-3 sm:gap-4">
          <span className="relative block w-24 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-28">
            <span className="block aspect-[16/10]" />
            {!failed && <span aria-hidden className="wb-incoming-pulse absolute inset-0 bg-[#e6e8ec]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[14px] font-semibold", failed ? "text-[#1a1a2e]" : "text-[#4b5563]")}>
              {incoming.name}
            </span>
            {failed ? (
              <>
                <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#c4290c]">{status}</span>
                {actions("phone")}
              </>
            ) : (
              <>
                <span data-incoming-status="" className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#6b7280]">
                  {status}
                </span>
                {/* The bar: the upload's own fraction, then a calm sweep while the server works. */}
                <span aria-hidden className="relative mt-2 block h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-[#eceef1]">
                  {incoming.phase === "uploading" ? (
                    <span
                      data-incoming-bar="progress"
                      className="absolute inset-0 origin-left rounded-full bg-[#1a1a2e] transition-transform duration-200 ease-out"
                      style={{ transform: `scaleX(${Math.max(0.04, incoming.progress)})` }}
                    />
                  ) : (
                    <span data-incoming-bar="sweep" className="wb-incoming-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-[#1a1a2e]" />
                  )}
                </span>
              </>
            )}
          </span>
        </div>
      </td>
      <td className="hidden px-3 sm:table-cell" />
      <td className="hidden px-3 md:table-cell" />
      <td className="w-[52px] pr-3 sm:w-auto sm:px-4">{failed && actions("wide")}</td>
    </tr>
  )
}
