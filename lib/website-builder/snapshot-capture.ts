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

import { MAX_BYTES, SNAPSHOT_VERSION } from "./snapshot"

export const SNAPSHOT_WIDTH = 1200
export const SNAPSHOT_ASPECT = 16 / 10
export const SNAPSHOT_DEBOUNCE_MS = 6000

/**
 * What gets photographed, mounted on demand.
 *
 * This used to be the editor's canvas node, and a photograph of the canvas
 * is a photograph of whatever the canvas happens to be showing: a 390px
 * phone layout when the editor is open on a phone, a selection outline round
 * the section somebody last clicked, an insert strip where the pointer was.
 * None of that is the website.
 *
 * So the editor hands over a STAGE: a function that mounts a clean copy of
 * the home page at desktop width, resolves with it once it is ready to be
 * photographed, and a `release` that takes it down again. The cover is then
 * the same picture whichever device the save came from.
 */
export interface SnapshotStage {
  node: HTMLElement
  release: () => void
}

export interface SnapshotJob {
  installId: string
  stage: () => Promise<SnapshotStage | null>
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
  const staged = await job.stage()
  if (!staged) return false
  let blob: Blob | null = null
  try {
    if (!staged.node.isConnected) return false
    blob = await captureNode(staged.node)
  } finally {
    staged.release()
  }
  if (!blob || blob.size === 0 || blob.size > MAX_BYTES) return false
  const res = await fetch(`/api/website-builder/themes/${encodeURIComponent(job.installId)}/snapshot`, {
    method: "POST",
    /* Which capture took this. The route refuses anything older: see
       SNAPSHOT_VERSION. */
    headers: { "Content-Type": blob.type, "X-Snapshot-Version": String(SNAPSHOT_VERSION) },
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
      filter: keepInSnapshot,
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

/**
 * Wait until a freshly mounted page is worth photographing.
 *
 * Two frames so React has committed and the browser has laid it out; the
 * fonts, so the headings are in the theme's face and not the fallback that
 * is swapped out a moment later; and every picture DECODED, because a stage
 * that has just mounted has images that have only just been asked for, and
 * a capture taken now would find them empty.
 *
 * `loading="lazy"` is overridden first. The stage sits outside anything a
 * visitor scrolls, and a lazy image the browser decides is not near the
 * viewport is never fetched at all.
 *
 * Bounded: a picture that has not arrived in `ms` is photographed as it is
 * rather than holding the cover up forever.
 */
export async function readyForCapture(node: HTMLElement, ms = 4000): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  const imgs = Array.from(node.querySelectorAll("img"))
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager"
  const settle = Promise.all([
    document.fonts?.ready.catch(() => undefined),
    ...imgs.map((img) => (img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => undefined))),
  ])
  await Promise.race([settle, new Promise((r) => setTimeout(r, ms))])
}

/**
 * ===========================================================================
 *  WHAT GOES INTO THE PICTURE
 * ===========================================================================
 * NOT THE PAGE'S <style> ELEMENTS. This is the line that made every cover
 * wrong.
 *
 * The theme animates each section in as it appears — `storelibSectionIn`,
 * from `opacity: 0`, with `animation-fill-mode: both` — and the header and
 * footer are exempt as page chrome. html-to-image builds its picture by
 * copying the node into an SVG, and it copied the <style> elements too, so
 * the keyframes came along. Inside that SVG every animation starts again
 * from its first frame, and the first frame is invisible.
 *
 * So the picture was the header — exempt, so present — above a blank page.
 * Heading, text, buttons and photographs, all of it at opacity 0. Measured
 * by scripts/check-cover-capture.mjs, which is the first thing ever to look
 * at what this function produces: the page had a coral header over a split
 * hero with a photograph; the capture had the coral header over white.
 *
 * Leaving the stylesheets out costs nothing. html-to-image writes every
 * element's COMPUTED style inline, so the picture never needed them — they
 * were only ever carrying the one thing that broke it.
 *
 * And editor chrome inside the canvas is not part of the website.
 */
function keepInSnapshot(el: Node): boolean {
  if (el instanceof HTMLStyleElement) return false
  if (el instanceof HTMLElement && el.dataset.snapshotExclude !== undefined) return false
  return true
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
