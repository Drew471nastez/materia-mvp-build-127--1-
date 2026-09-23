"use client"

/**
 * ===========================================================================
 *  SNAPSHOT CAPTURE — the picture the website-builder page shows
 * ===========================================================================
 * After a save the editor turns the top of its canvas into a WebP and posts
 * it to `/api/website-builder/themes/[installId]/snapshot`. The website-builder
 * page then shows THAT — a still image from the last save — as the website's
 * cover, instead of running the storefront inside a card.
 *
 * The rules that keep this cheap and honest:
 *
 *   • It happens AFTER the save succeeded, never as part of it. A snapshot
 *     that fails is silent; a save that fails is loud. They are not the same
 *     thing and the creator should never wonder which one went wrong.
 *   • It is debounced and runs when the browser is idle. Autosave fires every
 *     couple of seconds; serialising a whole page to an SVG that often would
 *     make typing feel heavy. One capture a few seconds after the last save
 *     is the same picture for a fraction of the work.
 *   • Only the home page, only at desktop width, only when the canvas is
 *     actually showing the page (not the loading state, not the code view).
 *     The cover is "what the website looks like", and that is the home page
 *     on a desktop.
 *   • Cropped to the top of the page BEFORE rasterising. A five-screen page
 *     is serialised once but only the first 16:10 of it is painted, which is
 *     where the cost is.
 *   • Capped at 1200px wide and encoded as WebP at 0.82, which comes out
 *     around 60–120 KB. The server refuses anything over 2 MB.
 */

import { MAX_BYTES } from "./snapshot"

export const SNAPSHOT_WIDTH = 1200
export const SNAPSHOT_ASPECT = 16 / 10
export const SNAPSHOT_DEBOUNCE_MS = 6000

export interface SnapshotJob {
  installId: string
  /** The element that contains the rendered page. */
  node: HTMLElement
}

let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let queued: SnapshotJob | null = null

/**
 * Ask for a snapshot "soon". Repeated calls within the debounce window
 * collapse into one; a call while a capture is running is remembered and
 * runs after it.
 */
export function scheduleSnapshot(job: SnapshotJob) {
  if (typeof window === "undefined") return
  queued = job
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    whenIdle(runQueued)
  }, SNAPSHOT_DEBOUNCE_MS)
}

/** Forget a pending capture — the editor is unmounting. */
export function cancelScheduledSnapshot() {
  if (timer) clearTimeout(timer)
  timer = null
  queued = null
}

function whenIdle(fn: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(fn, { timeout: 4000 })
  else setTimeout(fn, 250)
}

async function runQueued() {
  if (inFlight || !queued) return
  const job = queued
  queued = null
  inFlight = true
  try {
    await captureAndUpload(job)
  } catch {
    // Silent by design — see the header comment.
  } finally {
    inFlight = false
    if (queued) whenIdle(runQueued)
  }
}

export async function captureAndUpload(job: SnapshotJob): Promise<boolean> {
  if (!job.node.isConnected) return false
  const blob = await captureNode(job.node)
  if (!blob || blob.size === 0 || blob.size > MAX_BYTES) return false
  const res = await fetch(`/api/website-builder/themes/${encodeURIComponent(job.installId)}/snapshot`, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
    keepalive: blob.size < 64 * 1024,
  })
  return res.ok
}

/**
 * Rasterise the top of `node` to a WebP blob. Returns null when the browser
 * cannot (no canvas, tainted images, a font that will not embed) — the caller
 * treats null as "no snapshot this time".
 */
export async function captureNode(node: HTMLElement): Promise<Blob | null> {
  const rect = node.getBoundingClientRect()
  const width = Math.round(rect.width)
  if (width < 320) return null
  const height = Math.round(Math.min(rect.height, width / SNAPSHOT_ASPECT))
  if (height < 120) return null

  const { toCanvas } = await import("html-to-image")
  /**
   * TO THE COVER'S WIDTH, UP OR DOWN.
   *
   * This was `Math.min(1, SNAPSHOT_WIDTH / width)`, which never enlarged
   * anything — right while only a desktop canvas was ever captured, since
   * that is already wider than the cover and only ever needs shrinking.
   *
   * A phone's canvas is 390px. Capped at 1 it rasterises at 390x244, and
   * the website page then paints it into a slot three times that wide, so
   * the cover is soft where every other picture on the page is sharp. The
   * cost of removing the cap is nothing: the output is SNAPSHOT_WIDTH
   * across either way, which is the number the cap was there to protect.
   */
  const scale = SNAPSHOT_WIDTH / width

  const canvas = await withTimeout(
    toCanvas(node, {
      width,
      height,
      pixelRatio: scale,
      cacheBust: false,
      // Editor chrome inside the canvas is not part of the website.
      filter: (el) => !(el instanceof HTMLElement && el.dataset.snapshotExclude !== undefined),
      // A font that fails to embed should cost a fallback face, not the snapshot.
      fontEmbedCSS: undefined,
      skipAutoScale: true,
    }),
    15000,
  )
  if (!canvas) return null

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82))
  if (!blob) return null
  // Safari before 16 hands back PNG when asked for WebP. Still a valid cover.
  return blob
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(null) },
    )
  })
}
