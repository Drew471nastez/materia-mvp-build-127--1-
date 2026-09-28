"use client"

/**
 * ===========================================================================
 *  A PICTURE, FULL SIZE
 * ===========================================================================
 * A thumbnail in the chat is 56px, which is enough to know WHICH picture it
 * is and not enough to read anything in it. This is the other half: click one
 * and see it, copy it, save it, move between them, and get out with Escape.
 *
 * WHY THIS IS NOT A DIALOG COMPONENT. Every modal layer in this editor has at
 * some point frozen it — the dismissable layer that sets
 * `body.style.pointerEvents = "none"`, the scroll lock that cancels every
 * touchmove on the document and does not always let go. Both were measured,
 * both took a release to fix, and neither is worth re-inheriting to show a
 * picture. So: one fixed element, its own key handler, nothing written to
 * `body` at all. It cannot leave anything behind because it never takes
 * anything.
 */

import * as React from "react"
import { Check, ChevronLeft, ChevronRight, Copy, Download, X } from "lucide-react"
import { anchorCanSave, clickDownloadLink, openDownloadTab, showBlockedDownload } from "@/lib/platform/download-tab"

export interface ViewableImage {
  id: string
  name: string
  /** A data: URL or an https one. Either is drawn, neither is fetched by us. */
  url: string
}

/**
 * The clipboard takes PNG and, in every browser that matters, nothing else.
 * A JPEG is redrawn once rather than refused, so Copy means the same thing
 * whatever was attached.
 */
async function asPngBlob(url: string): Promise<Blob> {
  const source = await fetch(url).then((r) => r.blob())
  if (source.type === "image/png") return source
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not redraw"))), "image/png")
  })
}

export function ImageViewer({
  images,
  startAt,
  onClose,
}: {
  images: ViewableImage[]
  startAt: number
  onClose: () => void
}) {
  const [at, setAt] = React.useState(startAt)
  const [copied, setCopied] = React.useState(false)
  const image = images[Math.min(at, images.length - 1)]

  /**
   * THE ENTRANCE IS AN ANIMATION, NOT A STATE FLIP.
   *
   * It used to render at opacity 0 and flip to 1 inside a
   * requestAnimationFrame, which is the usual trick and has a failure mode
   * worth avoiding: where no frames are produced, the callback never runs,
   * the flip never happens, and the viewer sits there invisible over the
   * whole screen — a black hole you can only escape with Escape. Measured in
   * check-ask-attach, which caught it at opacity 0.
   *
   * A keyframe cannot fail that way. The element's settled state IS visible;
   * the animation plays from transparent to that, and where animations do
   * not run at all the picture is simply there, which is the right fallback.
   */

  const move = React.useCallback(
    (by: number) => setAt((i) => (i + by + images.length) % images.length),
    [images.length],
  )

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
      if (event.key === "ArrowRight" && images.length > 1) move(1)
      if (event.key === "ArrowLeft" && images.length > 1) move(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, move, images.length])

  const copy = React.useCallback(async () => {
    if (!image) return
    try {
      const blob = await asPngBlob(image.url)
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* A browser that will not take it says nothing rather than lying. */
    }
  }, [image])

  /*
   * A data: URL is bytes the page already holds and an anchor saves it. An
   * https one is another origin, where `download` is ignored and the click
   * was an ordinary navigation: the editor was replaced by the picture.
   * That one goes to a tab of its own (lib/platform/download-tab).
   */
  const save = React.useCallback(() => {
    if (!image) return
    const name = image.name || "image"
    if (anchorCanSave(image.url)) {
      clickDownloadLink(image.url, name)
      return
    }
    const tab = openDownloadTab()
    if (tab?.point(image.url)) return
    tab?.close()
    showBlockedDownload(image.url, name)
  }, [image])

  if (!image) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-[2px]"
      style={{
        animation: "fade-in 160ms ease-out",
        paddingTop: "max(env(safe-area-inset-top), 12px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
      }}
    >
      {/* The bar. Stops the click so pressing a control does not also close. */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex shrink-0 items-center gap-1 px-3 pb-2 text-white"
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">
          {image.name}
          {images.length > 1 && <span className="ml-2 text-white/40">{at + 1} of {images.length}</span>}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy the picture"
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={save}
          aria-label="Save the picture"
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        {images.length > 1 && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); move(-1) }}
            aria-label="Previous"
            className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        )}

        {/*
          Sized to fit rather than to its own pixels: a 3000px screenshot in a
          400px panel should be a picture you can look at, not a scroll.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element -- the creator's own bytes, already in hand. */}
        <img
          key={image.id}
          src={image.url}
          alt={image.name}
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          style={{ animation: "scale-fade-in 180ms cubic-bezier(0.2, 0, 0, 1)" }}
        />

        {images.length > 1 && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); move(1) }}
            aria-label="Next"
            className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}
