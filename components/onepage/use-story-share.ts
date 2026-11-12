"use client"

/**
 * THE STORY BUTTON'S STATE, for the visitor's share sheet and the creator's
 * Share window alike (lib/onepage/story-image).
 *
 * The picture is drawn while the window is open and idle, before any tap,
 * because a phone lets a page open its share sheet only straight from a tap:
 * drawing first (the photo has to load) could use that permission up, and
 * the share would fail. A tap then shares the picture already in hand. A
 * picture drawn for one page is redrawn when the page's name, photo or
 * colours change.
 */
import * as React from "react"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { renderStoryImage, shareStoryImage, storyInk, type StoryInput } from "@/lib/onepage/story-image"

export function useStoryShare({ open, name, address, avatarUrl, ground, fontFamily }: { open: boolean; name: string; address: string; avatarUrl?: string | null; ground: string; fontFamily?: string | null }) {
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const slug = address.split("/").filter(Boolean).pop() || ""
  const input: StoryInput = React.useMemo(
    () => ({ name, handle: slug && slug !== address ? `@${slug}` : "", address, avatarSrc: avatarUrl ? onePageImageSrc(avatarUrl, 640) || avatarUrl : null, ground, ink: storyInk(ground), fontFamily }),
    [name, slug, address, avatarUrl, ground, fontFamily],
  )
  const key = JSON.stringify(input)
  const ready = React.useRef<{ key: string; image: Promise<Blob> } | null>(null)
  const draw = React.useCallback(() => {
    if (ready.current?.key !== key) {
      const image = renderStoryImage(input)
      image.catch(() => {
        if (ready.current?.image === image) ready.current = null
      })
      ready.current = { key, image }
    }
    return ready.current.image
  }, [key, input])

  React.useEffect(() => {
    if (!open) {
      setSaved(false)
      return
    }
    /* After the window has settled: the idle callback where the browser has one (Safari has not), else a short timer. */
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const run = () => void draw().catch(() => {})
    const viaIdle = typeof w.requestIdleCallback === "function" && typeof w.cancelIdleCallback === "function"
    const id = viaIdle ? w.requestIdleCallback!(run, { timeout: 800 }) : window.setTimeout(run, 200)
    return () => {
      if (viaIdle) w.cancelIdleCallback!(id)
      else window.clearTimeout(id)
    }
  }, [open, draw])

  const share = React.useCallback(async () => {
    if (isOnePagePreview()) return showPreviewNotice("link")
    setBusy(true)
    try {
      const image = await draw()
      const outcome = await shareStoryImage(image, { fileName: `${slug || "onepage"}-story.png`, address })
      setSaved(outcome === "saved")
    } catch {
      setSaved(false)
    } finally {
      setBusy(false)
    }
  }, [draw, slug, address])

  return { busy, saved, share }
}
