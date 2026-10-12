"use client"

/**
 * ===========================================================================
 *  THE EMAIL, AS IT ARRIVES
 * ===========================================================================
 * The exact HTML the send route builds (lib/email-campaigns/template.ts),
 * in a sandboxed iframe with scripts off: what is drawn here is what goes
 * out, not a lookalike. A computer is shown at the email's full 600px
 * scaled to the column; a phone at 375px, life size.
 *
 * Above it, the line the inbox shows: who it is from, the subject and the
 * preview text, because that is what decides whether it is opened at all.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { Segmented } from "./ui"
import { tt } from "@/lib/i18n/text"

export type PreviewMode = "desktop" | "mobile"

const FRAME: Record<PreviewMode, number> = { desktop: 664, mobile: 375 }

export function EmailPreview({
  html,
  senderName,
  subject,
  previewText,
  mode,
  onMode,
  when = "now",
  bare = false,
  fit = false,
  className,
}: {
  html: string
  senderName: string
  subject: string
  previewText: string
  mode: PreviewMode
  onMode: (m: PreviewMode) => void
  /** The time the inbox line shows: "now" while writing, the send's time on its page. */
  when?: string
  /** Without its own row of Preview and the size switch: a surface that has its own (./preview-layer.tsx). */
  bare?: boolean
  /** At phone size, as wide as the box it is in (320 to 430px) rather than 375px: a phone showing it life size. */
  fit?: boolean
  className?: string
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const [boxWidth, setBoxWidth] = React.useState(0)
  const [height, setHeight] = React.useState(480)
  const [shown, setShown] = React.useState(html)

  /* The preview follows the typing a moment behind it, not on every key. */
  React.useEffect(() => {
    const t = window.setTimeout(() => setShown(html), 180)
    return () => window.clearTimeout(t)
  }, [html])

  React.useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const read = () => setBoxWidth(el.clientWidth)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const measure = React.useCallback(() => {
    const d = frameRef.current?.contentDocument
    if (!d?.body) return
    setHeight(Math.max(240, Math.ceil(d.documentElement.scrollHeight)))
  }, [])

  const onLoad = () => {
    measure()
    const d = frameRef.current?.contentDocument
    d?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure, { once: true }))
    /* A link in the preview goes nowhere: following it would replace the preview with that page. */
    d?.addEventListener("click", (e) => {
      if ((e.target as Element | null)?.closest?.("a")) e.preventDefault()
    })
  }

  React.useEffect(() => {
    measure()
  }, [mode, boxWidth, measure])

  const width = mode === "mobile" && fit && boxWidth > 0 ? Math.max(320, Math.min(430, boxWidth)) : FRAME[mode]
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1

  return (
    <div className={cn("min-w-0", className)}>
      {bare ? null : (
      <div className="flex items-center justify-between gap-3 border-b border-[#eef0f2] px-4 py-2.5">
        <p className="text-[13px] font-medium text-[#1a1a2e]">
          {tt("Preview")}
        </p>
        <Segmented
          label={tt("Preview size")}
          value={mode}
          onChange={onMode}
          options={[
            { value: "desktop", label: tt("Desktop") },
            { value: "mobile", label: tt("Phone") },
          ]}
        />
      </div>
      )}
      <div className="border-b border-[#eef0f2] px-4 py-3">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{senderName}</p>
          <p className="shrink-0 text-[12px] text-[#6b7280]">{when}</p>
        </div>
        <p className={cn("truncate text-[13px]", subject ? "font-medium text-[#1a1a2e]" : "text-[#9ca3af]")}>{subject || tt("No subject yet")}</p>
        <p className="truncate text-[13px] text-[#6b7280]">{previewText || tt("The first words of the email show here unless you add preview text.")}</p>
      </div>
      <div ref={boxRef} className="bg-[#f4f5f7] p-0">
        <div className="mx-auto overflow-hidden" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frameRef}
            title={tt("Email preview")}
            sandbox="allow-same-origin"
            srcDoc={shown}
            onLoad={onLoad}
            scrolling="no"
            className="block origin-top-left border-0 bg-[#f4f5f7]"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  )
}
