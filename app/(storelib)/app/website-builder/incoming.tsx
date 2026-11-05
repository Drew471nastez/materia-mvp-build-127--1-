"use client"

/**
 * ===========================================================================
 *  A WEBSITE ON ITS WAY INTO THE LIBRARY
 * ===========================================================================
 * Import used to be a spinner in the button and then, a few seconds later,
 * a new row somewhere down the page that nobody was looking at. Now the
 * website being made has a place from the first moment:
 *
 *   1. The row it will become is drawn where the server puts it: an import
 *      first in the library (the lowest sort_order minus one), an added or
 *      copied website at the end (the highest plus one), both in
 *      lib/website-builder/library-limit.ts. Its cover breathes, and a thin
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
import { IMPORT_TOO_LARGE, importSizeProblem } from "@/lib/website-builder/theme-import"
import { LIBRARY_FULL_CODE } from "@/lib/website-builder/library-limit"
import { tt, msg } from "@/lib/i18n/text"

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
  get import() { return tt("Importing") },
  get add() { return tt("Adding") },
  get duplicate() { return tt("Copying") },
}

export function incomingStatus(i: Incoming): string {
  if (i.phase === "error") return i.error ?? tt("Something went wrong")
  if (i.phase === "uploading") return tt("Uploading {value}%", { value: Math.round(i.progress * 100) })
  return WORKING[i.kind]
}

/** "summer-shop.storelib-theme.zip" is "summer-shop". */
export function nameFromFile(file: { name: string }): string {
  const base = file.name.replace(/(\.storelib-theme)?\.zip$/i, "").replace(/\.storelib-theme$/i, "")
  return base.trim() || tt("Imported theme")
}

/** What a request came back with. `failure` when there was no answer at all. */
export interface Answer {
  ok: boolean
  status: number
  data: Record<string, unknown>
  failure?: "network" | "timeout"
}

/**
 * How long an upload may go without a byte leaving before it is given up
 * on. A phone that loses its signal mid upload does not always say so: the
 * request just stops moving, and the row said "Uploading 43%" for ever.
 */
export const STALL_MS = 30_000

/** After the last byte, how long the far end has to answer. The import route may run for 60s. */
export const ANSWER_MS = 90_000

/**
 * ===========================================================================
 *  AN UPLOAD THAT SAYS HOW FAR IT HAS GOT
 * ===========================================================================
 * `fetch` cannot report upload progress, so the file goes by XMLHttpRequest,
 * whose `upload.onprogress` fires as the bytes leave. `sent` is called when
 * the last byte has gone, which is when the page switches from a percentage
 * to "Importing": from there on the wait is the server's.
 *
 * Every way it can end resolves, once: an answer, a dropped connection, or
 * a stall (STALL_MS without progress, or ANSWER_MS without an answer), which
 * aborts the request so nothing is left running behind the row.
 */
export function sendWithProgress(
  method: "POST" | "PUT",
  url: string,
  body: XMLHttpRequestBodyInit,
  on: { progress: (fraction: number) => void; sent: () => void },
  headers: Record<string, string> = {},
): Promise<Answer> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    let timer: ReturnType<typeof setTimeout> | undefined
    let stalled = false
    let settled = false
    const settle = (answer: Answer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(answer)
    }
    const arm = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stalled = true
        xhr.abort()
        /* Resolved here as well: a browser that does not fire abort after a send still lets the row go. */
        settle({ ok: false, status: 0, data: {}, failure: "timeout" })
      }, ms)
    }
    xhr.open(method, url)
    xhr.responseType = "text"
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      arm(STALL_MS)
      if (e.lengthComputable && e.total > 0) on.progress(Math.min(1, e.loaded / e.total))
    }
    xhr.upload.onload = () => {
      arm(ANSWER_MS)
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
      settle({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data })
    }
    xhr.onerror = () => settle({ ok: false, status: 0, data: {}, failure: "network" })
    xhr.onabort = () => settle({ ok: false, status: 0, data: {}, failure: stalled ? "timeout" : "network" })
    arm(STALL_MS)
    xhr.send(body)
  })
}

/** A JSON request that gives up after `ms`, answered in the same shape. */
export async function fetchAnswer(url: string, body: unknown, ms: number): Promise<Answer> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: {}, failure: ctl.signal.aborted ? "timeout" : "network" }
  } finally {
    clearTimeout(timer)
  }
}

const OFFLINE = msg("The connection dropped. Try again.")
const STALLED = msg("The upload stopped moving. Try again.")
const SLOW = msg("The import took too long. Try again.")

/** The answer with a reason a person can read in `data.error`, for the row and the toast. */
function said(a: Answer, otherwise: string, timeout: string = tt(SLOW)): Answer {
  if (a.ok) return a
  const error =
    a.failure === "timeout" ? timeout
    : a.failure === "network" ? tt(OFFLINE)
    : a.status === 413 ? IMPORT_TOO_LARGE
    : typeof a.data.error === "string" && a.data.error ? a.data.error
    : otherwise
  return { ...a, data: { ...a.data, error } }
}

/**
 * ===========================================================================
 *  AN IMPORT: A PLACE, THE FILE, THEN THE WEBSITE
 * ===========================================================================
 * The file goes straight into storage, never through a function, whose body
 * limit refused every real package (lib/website-builder/theme-import.ts):
 *
 *   1. import/upload answers with a signed place for it, or refuses a full
 *      library or a file over the limit before a byte is sent;
 *   2. the file is put there with its progress on the row;
 *   3. the import route reads it from there and makes the website.
 *
 * A file over the limit is refused here first, so nobody waits through an
 * upload that ends in "too large". Try again runs all three again with the
 * same file.
 */
export async function importThemeFile(
  file: File,
  on: { progress: (fraction: number) => void; sent: () => void },
): Promise<Answer> {
  const problem = importSizeProblem(file.size)
  if (problem) return { ok: false, status: 400, data: { error: problem } }
  const place = said(await fetchAnswer("/api/website-builder/themes/import/upload", { size: file.size }, 20_000), tt("Could not start the upload. Try again."), OFFLINE)
  /* A full library is an answer, not a failure of the way in. */
  if (!place.ok && place.data.code === LIBRARY_FULL_CODE) return place
  const url = place.data.url
  const path = place.data.path
  if (place.ok && typeof url === "string" && typeof path === "string") {
    const put = await sendWithProgress("PUT", url, file, on, { "Content-Type": file.type || "application/zip", "x-upsert": "true" })
    if (put.ok) return said(await fetchAnswer("/api/website-builder/themes/import", { path }, ANSWER_MS), tt("Could not import that file"))
    /* Storage's own error text is not for people: only the size is said as it is. */
    if (file.size > FORM_IMPORT_MAX_BYTES) return said({ ...put, data: {} }, tt("Could not upload that file. Try again."), tt(STALLED))
  } else if (file.size > FORM_IMPORT_MAX_BYTES) {
    return place.ok ? said({ ok: false, status: 500, data: {} }, tt("Could not start the upload. Try again.")) : place
  }
  /*
    THE SECOND WAY IN. A package small enough for a function's request body
    goes to the import route as a form when storage could not take it, so an
    import that worked before storage uploads existed still works if they
    ever fail.
  */
  const form = new FormData()
  form.append("file", file)
  return said(await sendWithProgress("POST", "/api/website-builder/themes/import", form, on), tt("Could not import that file"), tt(STALLED))
}

/** Under the 4.5 MB a function accepts as a request body, with room for the form around the file. */
const FORM_IMPORT_MAX_BYTES = 4 * 1024 * 1024

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

function reducedMotion(): boolean {
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
        {tt("Try again")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tt("Dismiss")}
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
                      className="absolute inset-0 origin-left rounded-full bg-[#1a1a2e] transition-transform duration-200 ease-out motion-reduce:transition-none"
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
