/**
 * ===========================================================================
 *  ASK STORELIB'S CALLS TO THE SERVER, FROM THE BROWSER
 * ===========================================================================
 * The chat and its history talk to five routes under
 * /api/website-builder/themes/[installId]/: the agent (a streamed run), the
 * conversation, the list of conversations, deleting them, and reporting an
 * answer. This is the one place those requests are made and their answers
 * read, so the components only ever see plain results.
 *
 * STREAMING WITH UPLOAD PROGRESS. A run with pictures goes over
 * XMLHttpRequest, because it is the only way every browser (Safari and the
 * iOS web view included) reports how much of a request body has been sent;
 * `fetch` cannot. The answer is read as it arrives either way, a line of
 * JSON at a time.
 */

export interface ListedConversation {
  id: string
  title: string
  updatedAt: string
}

export type HistoryProblem = "not_set_up" | "read_failed"

const base = (installId: string) => `/api/website-builder/themes/${installId}`

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>
}

export async function listConversations(
  installId: string,
): Promise<
  | { ok: true; conversations: ListedConversation[]; earlier: { preview: string; updatedAt: string } | null }
  | { ok: false; problem: HistoryProblem }
> {
  try {
    const response = await fetch(`${base(installId)}/chat/conversations`, { cache: "no-store" })
    const body = await json(response)
    if (!response.ok) return { ok: false, problem: body.reason === "not_set_up" ? "not_set_up" : "read_failed" }
    return {
      ok: true,
      conversations: (body.conversations as ListedConversation[] | undefined) ?? [],
      earlier: (body.earlier as { preview: string; updatedAt: string } | null | undefined) ?? null,
    }
  } catch {
    return { ok: false, problem: "read_failed" }
  }
}

export type DeleteProblem = "not_set_up" | "not_found" | "failed"

/** One conversation by id, or "earlier" for the messages from before conversations. */
export async function deleteConversation(installId: string, id: string): Promise<{ ok: true } | { ok: false; problem: DeleteProblem }> {
  return remove(`${base(installId)}/chat/conversations/${encodeURIComponent(id)}`)
}

export async function deleteAllConversations(installId: string): Promise<{ ok: true } | { ok: false; problem: DeleteProblem }> {
  return remove(`${base(installId)}/chat/conversations`)
}

async function remove(url: string): Promise<{ ok: true } | { ok: false; problem: DeleteProblem }> {
  try {
    const response = await fetch(url, { method: "DELETE" })
    if (response.ok) return { ok: true }
    const body = await json(response)
    return { ok: false, problem: body.reason === "not_set_up" ? "not_set_up" : body.reason === "not_found" ? "not_found" : "failed" }
  } catch {
    return { ok: false, problem: "failed" }
  }
}

export type ReportProblem = "not_set_up" | "not_found" | "busy" | "failed"

export async function reportAnswer(
  installId: string,
  report: { messageId: string; reason?: string; engine?: string },
): Promise<{ ok: true } | { ok: false; problem: ReportProblem }> {
  try {
    const response = await fetch(`${base(installId)}/chat/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId: report.messageId, reason: report.reason?.trim() || null, engine: report.engine ?? null }),
    })
    if (response.ok) return { ok: true }
    const body = await json(response)
    if (response.status === 429) return { ok: false, problem: "busy" }
    return { ok: false, problem: body.reason === "not_set_up" ? "not_set_up" : body.reason === "not_found" ? "not_found" : "failed" }
  } catch {
    return { ok: false, problem: "failed" }
  }
}

/* ── a streamed answer ─────────────────────────────────────────────────── */

export interface StreamOptions {
  signal: AbortSignal
  /** Report how much of the request has been sent, 0 to 1. Uses XMLHttpRequest. */
  onUpload?: (fraction: number) => void
  /** The server has the whole request and has started to answer. */
  onSent?: () => void
  /** One line of the answer, parsed. */
  onLine: (event: Record<string, unknown>) => void
}

export interface StreamResult {
  ok: boolean
  status: number
  /** The route's own sentence when it refused before streaming. */
  error?: string
}

/** Splits text into whole lines, keeping the unfinished end for next time. */
function lines(buffer: string, onLine: (event: Record<string, unknown>) => void): string {
  let rest = buffer
  let at = rest.indexOf("\n")
  while (at >= 0) {
    const line = rest.slice(0, at).trim()
    rest = rest.slice(at + 1)
    at = rest.indexOf("\n")
    if (!line) continue
    try {
      const event = JSON.parse(line) as unknown
      if (event && typeof event === "object") onLine(event as Record<string, unknown>)
    } catch {
      /* Not a whole line of JSON: skipped, as a partial one is completed by the next read. */
    }
  }
  return rest
}

/** The longest a line waits when no frame comes (a tab in the background draws none). */
export const LINE_FALLBACK_MS = 100

/**
 * WHAT ARRIVED, HANDED ON ONCE A FRAME.
 *
 * A run's lines can come a few milliseconds apart, each in its own read, and
 * each was its own render of the whole editor: 24 edits were 146 commits and
 * the canvas redrawn for every one (scripts/check-editor-perf.mjs, "ask run").
 * Text is gathered as it arrives and split into lines in the next animation
 * frame, so everything that came in between two frames is one task, which
 * React renders once. Nothing is reordered or dropped: `finish` hands on the
 * rest, and `drain` what has arrived so far (before a throw).
 */
export function frameLines(onLine: (event: Record<string, unknown>) => void): { push: (text: string) => void; drain: () => void; finish: () => void } {
  let pending = ""
  let buffer = ""
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const drain = () => {
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame)
    if (timer) clearTimeout(timer)
    frame = 0
    timer = null
    if (!pending) return
    const text = pending
    pending = ""
    buffer = lines(buffer + text, onLine)
  }
  return {
    push(text: string) {
      pending += text
      if (frame || timer) return
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(drain)
      timer = setTimeout(drain, LINE_FALLBACK_MS)
    },
    drain,
    finish() {
      drain()
      lines(buffer + "\n", onLine)
      buffer = ""
    },
  }
}

function aborted(): DOMException {
  return new DOMException("The run was stopped.", "AbortError")
}

/**
 * POSTs `body` as JSON and hands each line of the answer to `onLine` as it
 * arrives. Throws an AbortError when `signal` fires, and a TypeError when the
 * connection is lost, as `fetch` would.
 */
export async function streamPost(url: string, body: string, options: StreamOptions): Promise<StreamResult> {
  if (options.onUpload && typeof XMLHttpRequest !== "undefined") return streamWithProgress(url, body, options)

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: options.signal,
    body,
  })
  options.onSent?.()
  if (!response.ok || !response.body) {
    const answer = await json(response)
    return { ok: false, status: response.status, error: typeof answer.error === "string" ? answer.error : undefined }
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const feed = frameLines(options.onLine)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) feed.push(decoder.decode(value, { stream: true }))
      if (done) break
    }
  } catch (error) {
    /* What arrived before the stop or the lost connection is handed on first, as it was when each line went on at once. */
    feed.drain()
    throw error
  }
  feed.finish()
  return { ok: true, status: response.status }
}

function streamWithProgress(url: string, body: string, options: StreamOptions): Promise<StreamResult> {
  return new Promise<StreamResult>((resolve, reject) => {
    if (options.signal.aborted) {
      reject(aborted())
      return
    }
    const xhr = new XMLHttpRequest()
    let read = 0
    const feed = frameLines(options.onLine)
    let sent = false
    const markSent = () => {
      if (sent) return
      sent = true
      options.onUpload?.(1)
      options.onSent?.()
    }
    const drain = () => {
      if (xhr.status < 200 || xhr.status >= 300) return
      const text = xhr.responseText
      if (text.length > read) {
        feed.push(text.slice(read))
        read = text.length
      }
    }
    const onAbort = () => xhr.abort()
    options.signal.addEventListener("abort", onAbort, { once: true })

    xhr.open("POST", url)
    xhr.setRequestHeader("content-type", "application/json")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onUpload?.(Math.min(0.99, event.loaded / event.total))
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) markSent()
    }
    xhr.onprogress = drain
    xhr.onload = () => {
      options.signal.removeEventListener("abort", onAbort)
      markSent()
      if (xhr.status < 200 || xhr.status >= 300) {
        let error: string | undefined
        try {
          const answer = JSON.parse(xhr.responseText) as { error?: unknown }
          if (typeof answer.error === "string") error = answer.error
        } catch {
          /* no sentence to pass on */
        }
        resolve({ ok: false, status: xhr.status, error })
        return
      }
      drain()
      feed.finish()
      resolve({ ok: true, status: xhr.status })
    }
    xhr.onerror = () => {
      options.signal.removeEventListener("abort", onAbort)
      feed.drain()
      reject(new TypeError("The connection was lost."))
    }
    xhr.onabort = () => {
      options.signal.removeEventListener("abort", onAbort)
      feed.drain()
      reject(aborted())
    }
    xhr.send(body)
  })
}
