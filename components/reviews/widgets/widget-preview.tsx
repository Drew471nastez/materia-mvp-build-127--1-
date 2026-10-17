"use client"

/**
 * ===========================================================================
 *  A WIDGET, DRAWN FOR THE GALLERY
 * ===========================================================================
 * The widget's real markup (lib/reviews/widgets/render.ts), the same a
 * website gets, in a shadow root so the app's own styles neither reach it
 * nor are reached by it. Laid out at the width it is shown at on a
 * computer or on a phone (the widget asks its own width, with container
 * queries) and scaled down to the space it has, the way a thumbnail of a
 * page is. Links and the form do nothing here; the carousel's buttons work.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import { enhanceReviewWidgets } from "@/lib/reviews/widgets/enhance"

export const DESKTOP_WIDTH = 1100
export const PHONE_WIDTH = 390

const HOST_CSS = `:host{display:block;color:#1a1a2e;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.page{background:#fff;color:inherit}
h1,h2,h3,p{margin:0}`

export const WidgetPreview = memo(function WidgetPreview({
  html,
  width,
  maxHeight,
  boxHeight,
  className,
  label,
  interactive = false,
}: {
  html: string
  /** The width it is laid out at: DESKTOP_WIDTH or PHONE_WIDTH. */
  width: number
  /** Cropped to this height (in the shown size), for a card. */
  maxHeight?: number
  /** Always this tall (a gallery card): a short widget sits in the middle, a tall one shows its top. */
  boxHeight?: number
  className?: string
  label?: string
  /** The customizer's preview: its carousel can be used, so it is not a picture to a screen reader. */
  interactive?: boolean
}) {
  const outer = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)

  /* The space it has, read again whenever it changes. */
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const read = () => setScale(Math.min(1, el.clientWidth / width || 1))
    read()
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [width])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" })
    root.innerHTML = `<style>${HOST_CSS}</style><div class="page">${html}</div>`
    const undo = enhanceReviewWidgets(root)
    const stop = (e: Event) => {
      const t = e.target as Element | null
      if (e.type === "submit" || t?.closest?.("a")) e.preventDefault()
    }
    root.addEventListener("click", stop)
    root.addEventListener("submit", stop)
    const page = root.querySelector<HTMLElement>(".page")
    const measure = () => setHeight(page?.scrollHeight ?? 0)
    measure()
    const ro = typeof ResizeObserver === "function" && page ? new ResizeObserver(measure) : null
    if (page) ro?.observe(page)
    return () => {
      undo()
      ro?.disconnect()
      root.removeEventListener("click", stop)
      root.removeEventListener("submit", stop)
    }
  }, [html])

  const shown = height * scale
  const box = boxHeight ?? (maxHeight ? Math.min(shown, maxHeight) : shown)
  const top = boxHeight && shown < boxHeight ? Math.round((boxHeight - shown) / 2) : 0
  return (
    <div ref={outer} className={className} {...(interactive ? { "aria-label": label } : { role: "img", "aria-label": label })} style={{ height: box, overflow: "hidden", position: "relative" }}>
      <div ref={host} aria-hidden={interactive ? undefined : true} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top }} />
    </div>
  )
})
