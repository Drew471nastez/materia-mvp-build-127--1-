"use client"

/**
 * The live preview.
 *
 * The iframe is `sandbox="allow-scripts"` and deliberately NOT
 * `allow-same-origin` — see the header of lib/sites/preview-document.ts for why
 * those two together would hand generated code the editor's session.
 */

import * as React from "react"
import { AlertCircle } from "lucide-react"

import { previewDocument, previewPlaceholder } from "@/lib/sites/preview-document"
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
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const srcDoc = React.useMemo(() => {
    if (build.status === "ok" && build.code) {
      return previewDocument({ code: build.code, css: build.css, html })
    }
    if (build.status === "failed") return previewPlaceholder("")
    return previewPlaceholder(build.status === "building" ? "Building…" : "Waiting for the first build…")
  }, [build.status, build.code, build.css, html])

  // A new document is a new run: last render's exception is not this one's.
  React.useEffect(() => setRuntimeError(null), [srcDoc])

  const failed = build.status === "failed"

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="relative min-h-0 flex-1 overflow-auto p-0 sm:p-4">
        <div
          className="mx-auto h-full overflow-hidden border-border bg-white shadow-sm transition-[width] sm:rounded-[10px] sm:border"
          style={{ width: WIDTHS[viewport], maxWidth: "100%" }}
        >
          <iframe
            key={nonce}
            ref={frameRef}
            title="Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="h-full w-full border-0"
          />
        </div>

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
