"use client"

/**
 * Owns the bundler worker and the debounce in front of it.
 *
 * One worker per editor, created lazily and terminated on unmount — a worker
 * that outlives its editor holds 12MB of WebAssembly for a page nobody is
 * looking at.
 *
 * Builds are SERIALISED BY ID rather than cancelled. esbuild has no abort, so
 * a superseded build still finishes; what matters is that its result is
 * discarded instead of racing the newer one into the preview. Without this the
 * preview flickers back to an older render whenever two edits land close
 * together, which reads as the editor losing your work.
 */

import * as React from "react"

import type { BuildError, ProjectFiles } from "@/lib/sites/types"
import type { BundleRequest, BundleResponse } from "./bundler.worker"

export interface BundleState {
  status: "idle" | "building" | "ok" | "failed"
  code?: string
  css?: string
  errors: BuildError[]
  warnings: BuildError[]
  durationMs: number
}

const IDLE: BundleState = { status: "idle", errors: [], warnings: [], durationMs: 0 }

/** Long enough that typing does not thrash it, short enough to feel live. */
const DEBOUNCE_MS = 350

export function useBundler(files: ProjectFiles): BundleState {
  const [state, setState] = React.useState<BundleState>(IDLE)
  const workerRef = React.useRef<Worker | null>(null)
  const latestId = React.useRef(0)

  React.useEffect(() => {
    /**
     * A static file, not `new URL("./bundler.worker.ts", import.meta.url)`.
     * That pattern is the documented one and it compiles — then throws
     * `Failed to construct 'URL': Invalid URL` at runtime, because
     * import.meta.url is empty in the production client chunk. The worker is
     * compiled by scripts/build-sites-assets.mjs instead.
     */
    const worker = new Worker("/sites/bundler-worker.js")
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<BundleResponse>) => {
      const result = event.data
      // A build that has been superseded is not a result, it is history.
      if (result.id !== latestId.current) return
      setState({
        status: result.ok ? "ok" : "failed",
        code: result.code,
        css: result.css,
        errors: result.errors,
        warnings: result.warnings,
        durationMs: result.durationMs,
      })
    }

    /**
     * A worker that fails to start is silent otherwise, and the symptom is a
     * preview that says "Building…" forever. Most often it is the wasm not
     * being served, which is a deployment mistake and worth naming as one.
     */
    worker.onerror = (event) => {
      setState({
        status: "failed",
        errors: [{ message: event.message || "The bundler could not start." }],
        warnings: [],
        durationMs: 0,
      })
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (Object.keys(files).length === 0) return
    const timer = setTimeout(() => {
      const worker = workerRef.current
      if (!worker) return
      const id = latestId.current + 1
      latestId.current = id
      setState((previous) => ({ ...previous, status: "building" }))
      const request: BundleRequest = { id, files }
      worker.postMessage(request)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [files])

  return state
}
