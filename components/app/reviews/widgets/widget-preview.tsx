"use client"

/**
 * ===========================================================================
 *  A WIDGET, DRAWN AS THE WEBSITE DRAWS IT
 * ===========================================================================
 * The section's own file through the website's own renderer
 * (lib/website-builder/storelib-runtime.ts renderStorelibSection), with the
 * store's theme settings and its reviews, at the width a computer (1280) or a
 * phone (390) gives it, then scaled to the box it is shown in. What the store
 * sees here is the markup and the CSS a visitor's browser would get; only
 * `page.in_editor` is on, so a widget with nothing to show says why instead
 * of drawing nothing.
 *
 * Links and forms in it go nowhere: it is a picture of the section that can
 * still be scrolled, swiped and opened (a Show more, a write form).
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import type { StorefrontReviews } from "@/lib/reviews/storefront"

export type PreviewDevice = "desktop" | "mobile"
export const DEVICE_WIDTH: Record<PreviewDevice, number> = { desktop: 1280, mobile: 390 }

/** The section's markup and CSS, as the website would get them. */
export function renderWidget(input: { id: string; type: string; settings: Record<string, unknown>; theme: Record<string, unknown>; reviews: StorefrontReviews; product?: boolean }): { html: string; css: string } | null {
  const section: SectionInstance = { id: input.id, type: input.type, name: input.type, settings: input.settings, blocks: [], hidden: false }
  const data = { reviews: input.reviews } as unknown as StorefrontData
  const out = renderStorelibSection(section, input.theme as ThemeSettingsValues, { template: input.product ? "product" : "index", in_editor: true }, undefined, [], data)
  if (out.ok === false) return null
  return { html: out.html, css: out.css }
}

export function WidgetPreview({
  type,
  settings,
  theme,
  reviews,
  device,
  product = false,
  maxHeight,
  frame,
  renderWidth,
  className,
}: {
  type: string
  settings: Record<string, unknown>
  theme: Record<string, unknown>
  reviews: StorefrontReviews
  device: PreviewDevice
  product?: boolean
  /** A gallery card shows the top of a tall widget, faded out at the bottom. */
  maxHeight?: number
  /** A box of this height whatever the widget's: a short one sits in its middle, a tall one shows its top. */
  frame?: number
  /** The width it is laid out at, when not the device's own (a gallery card: narrow enough to read, wide enough for the computer layout). */
  renderWidth?: number
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const id = `wg-${type}-${uid}`
  const drawn = useMemo(() => renderWidget({ id, type, settings, theme, reviews, product }), [id, type, settings, theme, reviews, product])
  const width = renderWidth ?? DEVICE_WIDTH[device]

  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const b = box.current
    const i = inner.current
    if (!b || !i) return
    const read = () => {
      setBoxWidth(b.clientWidth)
      setHeight(i.offsetHeight)
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(read)
    ro.observe(b)
    ro.observe(i)
    return () => ro.disconnect()
  }, [drawn, width])

  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1
  /* A phone is drawn at its own width and centred, never stretched. */
  const shownWidth = width * scale
  const fullHeight = Math.ceil(height * scale)
  const limit = frame ?? maxHeight
  const clipped = limit !== undefined && fullHeight > limit
  const boxStyle: CSSProperties = { height: frame ?? (clipped ? maxHeight : fullHeight || undefined) }
  /* In a frame, a widget shorter than it is centred top to bottom. */
  const top = frame !== undefined && fullHeight < frame ? Math.round((frame - fullHeight) / 2) : 0

  return (
    <div ref={box} data-widget-preview={type} data-device={device} className={className} style={{ position: "relative", overflow: "hidden", ...boxStyle }}>
      {drawn?.css ? <style>{drawn.css}</style> : null}
      <div
        ref={inner}
        /* Scaled by transform, which the app's touch rules take off anything inside a `.group` unless it is kept (app/globals.css). */
        data-keep-transform=""
        /* Clicks reach <details> and scrolling, never a link or a form. */
        onClickCapture={(e) => {
          const t = e.target as HTMLElement
          if (t.closest("a[href]") || t.closest("button[type=submit]")) e.preventDefault()
        }}
        onSubmitCapture={(e) => e.preventDefault()}
        style={{ width, transform: `scale(${scale})`, transformOrigin: "0 0", marginLeft: Math.max(0, (boxWidth - shownWidth) / 2), marginTop: top, textAlign: "left" }}
        dangerouslySetInnerHTML={{ __html: drawn?.html ?? "" }}
      />
      {clipped ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" /> : null}
    </div>
  )
}
