"use client"

/**
 * The live preview.
 *
 * SERVED FROM A URL, NOT srcdoc, and the reason is navigation. A srcdoc
 * document's base URL is the page around it, so "#/about" in a generated site
 * meant storelib.com/sites/<id>#/about — a different document, and one that
 * denies framing. Clicking a menu item replaced the creator's work with
 * "storelib.com refused to connect.", and a hash router could not work at all
 * because location.hash cannot change without leaving.
 *
 * The shell at /api/sites/preview-frame has its own URL, so a hash link is a
 * same-document fragment and the site's router runs exactly as it will once
 * published. Each build is posted into it.
 *
 * The iframe is still `sandbox="allow-scripts"` and deliberately NOT
 * `allow-same-origin`, and the response now carries a CSP sandbox directive of
 * its own so that holds even if this attribute is ever widened — see the
 * header of lib/sites/preview-document.ts.
 */
const SHELL_URL = "/api/sites/preview-frame"

import * as React from "react"
import { AlertCircle } from "lucide-react"

import { placeholderPayload, previewPayload, type PreviewPayload } from "@/lib/sites/preview-document"
import { cn } from "@/lib/utils"
import type { BuildError } from "@/lib/sites/types"
import type { BundleState } from "./use-bundler"

export type Viewport = "desktop" | "tablet" | "phone"

const WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "834px",
  phone: "390px",
}

interface RuntimeError {
  message: string
  stack: string
}

/**
 * The frame only. Its controls now live in the editor's top bar, beside the
 * address they act on — a device switcher and a reload button belong next to
 * the thing being addressed, not stacked in a second strip under it.
 *
 * Controlled rather than stateful: `viewport` and `nonce` are owned by the
 * shell so the bar can drive them. `nonce` remounts the iframe, which is what
 * a reload actually is here.
 */
export function PreviewPane({
  build,
  html,
  viewport,
  nonce,
}: {
  build: BundleState
  html?: string
  viewport: Viewport
  nonce: number
}) {
  const [runtimeError, setRuntimeError] = React.useState<RuntimeError | null>(null)
  /** The shell has loaded and can take a build. Reset on every remount. */
  const [shellReady, setShellReady] = React.useState(false)
  /**
   * Where a click inside the preview was trying to go, for the few seconds
   * after it was stopped from going there.
   */
  const [heldLink, setHeldLink] = React.useState<string | null>(null)
  /**
   * Bumped to put the preview back after it navigated away despite everything.
   * Part of the iframe's key, so a bump re-mounts the shell.
   */
  const [restores, setRestores] = React.useState(0)
  const loadsRef = React.useRef(0)
  const frameRef = React.useRef<HTMLIFrameElement>(null)

  /**
   * The frame is on an opaque origin, so `event.origin` is the string "null"
   * and proves nothing. What identifies the sender is `event.source` — a
   * reference to a window object that only this frame has. Comparing it is the
   * check; the origin string is not.
   */
  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.source !== "storelib-preview") return
      if (data.kind === "error") setRuntimeError({ message: String(data.message), stack: String(data.stack ?? "") })
      /**
       * A link inside the preview was stopped. Told rather than swallowed: a
       * nav that appears to do nothing reads as a broken site, and the creator
       * needs to know it works once the site is published.
       */
      if (data.kind === "navigate") setHeldLink(String(data.message ?? ""))
      if (data.kind === "ready") setShellReady(true)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const payload: PreviewPayload = React.useMemo(() => {
    if (build.status === "ok" && build.code) {
      return previewPayload({ code: build.code, css: build.css, html })
    }
    if (build.status === "failed") return placeholderPayload("")
    return placeholderPayload(build.status === "building" ? "Building…" : "Waiting for the first build…")
  }, [build.status, build.code, build.css, html])

  // A new document is a new run: last render's exception is not this one's.
  React.useEffect(() => {
    setRuntimeError(null)
    setHeldLink(null)
    setRestores(0)
  }, [payload])

  // The load counter belongs to the document currently in the frame, and a
  // restore mounts a fresh one.
  React.useEffect(() => {
    loadsRef.current = 0
    setShellReady(false)
  }, [nonce, restores])

  /**
   * The build goes in as soon as there is a shell to take it, and again
   * whenever it changes. Posted rather than rendered: the shell is served once
   * and lives for the session, so a rebuild replaces its body and styles
   * instead of reloading the frame — which is what keeps the creator's scroll
   * position and the site's current route across a keystroke.
   */
  React.useEffect(() => {
    if (!shellReady) return
    frameRef.current?.contentWindow?.postMessage(payload, "*")
  }, [shellReady, payload])

  // The notice is a nudge, not a state to sit in.
  React.useEffect(() => {
    if (!heldLink && heldLink !== "") return
    const timer = window.setTimeout(() => setHeldLink(null), 4000)
    return () => window.clearTimeout(timer)
  }, [heldLink])

  /**
   * THE PREVIEW CAME BACK, OR SOMETHING ELSE DID.
   *
   * The click guard in the preview document holds links and forms, which is
   * every ordinary way out. It cannot hold `window.location = "/x"` written by
   * a model, and a frame that has navigated shows whatever it landed on —
   * usually the browser's own refusal, since every page on this domain denies
   * framing.
   *
   * A second load event on the same document means exactly that: the frame is
   * no longer showing the preview. It is put back rather than diagnosed,
   * because what it went to does not matter and cannot be read from here — the
   * frame is on an opaque origin.
   *
   * Capped, so a document that navigates on sight cannot become a reload loop.
   */
  const onFrameLoad = React.useCallback(() => {
    loadsRef.current += 1
    if (loadsRef.current <= 1) return
    setHeldLink("")
    setRestores((n) => (n < 2 ? n + 1 : n))
  }, [])

  const failed = build.status === "failed"

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="relative min-h-0 flex-1 overflow-auto p-0 sm:p-4">
        <div
          className="mx-auto h-full overflow-hidden border-border bg-white shadow-sm transition-[width] sm:rounded-[10px] sm:border"
          style={{ width: WIDTHS[viewport], maxWidth: "100%" }}
        >
          <iframe
            key={`${nonce}-${restores}`}
            ref={frameRef}
            title="Preview"
            src={SHELL_URL}
            sandbox="allow-scripts"
            onLoad={onFrameLoad}
            className="h-full w-full border-0"
          />
        </div>

        {heldLink !== null && (
          /**
           * Deliberately a small pill rather than an overlay: nothing is wrong,
           * a link simply does not leave the preview.
           */
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <p className="pointer-events-auto max-w-full truncate rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
              {heldLink
                ? `Links open on the published site — this one goes to ${heldLink}`
                : "Links open on the published site"}
            </p>
          </div>
        )}

        {failed && <ErrorOverlay title="This did not build" errors={build.errors} />}
        {!failed && runtimeError && (
          <ErrorOverlay
            title="The page threw while rendering"
            errors={[{ message: runtimeError.message }]}
            detail={runtimeError.stack}
          />
        )}
      </div>
    </div>
  )
}

export function BuildStatus({ build }: { build: BundleState }) {
  if (build.status === "building") return <span className="text-xs text-muted-foreground">Building…</span>
  if (build.status === "ok") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Built in {build.durationMs}ms
      </span>
    )
  }
  if (build.status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        {build.errors.length} error{build.errors.length === 1 ? "" : "s"}
      </span>
    )
  }
  return null
}

/**
 * Errors sit ON the preview rather than in a drawer somewhere.
 *
 * The failure and the blank rectangle it caused belong in the same place; a
 * status pill elsewhere in the chrome is how someone spends a minute wondering
 * why their change did nothing.
 */
function ErrorOverlay({ title, errors, detail }: { title: string; errors: BuildError[]; detail?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-end p-3 sm:p-4">
      <div className="pointer-events-auto max-h-[60%] w-full overflow-auto rounded-[10px] border border-destructive/30 bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4" />
          {title}
        </div>
        <ul className="space-y-2">
          {errors.map((error, i) => (
            <li key={i} className="font-mono text-xs leading-relaxed text-foreground">
              {error.file && (
                <span className="text-muted-foreground">
                  {error.file}
                  {error.line ? `:${error.line}` : ""}{" "}
                </span>
              )}
              {error.message}
            </li>
          ))}
        </ul>
        {detail && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{detail}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
