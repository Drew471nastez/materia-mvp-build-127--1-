"use client"

/**
 * The request email's preview, drawn into a sandboxed frame's own document in
 * place, the way Settings › Customer emails draws its previews: a new word
 * typed replaces what is drawn without loading anything, so the frame never
 * flashes blank. No scripts run in it; its links go nowhere; its height
 * follows the email.
 */
import * as React from "react"

const PREVIEW_STYLE = "<style>a{pointer-events:none;cursor:default}html,body{overflow:hidden}</style>"

function innerOf(html: string): string {
  const open = html.match(/<html[^>]*>/i)
  if (!open || open.index === undefined) return `<head>${PREVIEW_STYLE}</head><body>${html}</body>`
  const inner = html.slice(open.index + open[0].length).replace(/<\/html>[\s\S]*$/i, "")
  return /<\/head>/i.test(inner) ? inner.replace(/<\/head>/i, `${PREVIEW_STYLE}</head>`) : `<head>${PREVIEW_STYLE}</head>${inner}`
}

export function EmailFrame({ title, html }: { title: string; html: string }) {
  const ref = React.useRef<HTMLIFrameElement>(null)
  const drawn = React.useRef<string | null>(null)
  const [height, setHeight] = React.useState(640)
  const measure = React.useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.documentElement) return
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    if (h > 0) setHeight(Math.min(8000, Math.max(320, Math.ceil(h))))
  }, [])
  const draw = React.useCallback(
    (force = false) => {
      const doc = ref.current?.contentDocument
      if (!doc?.documentElement || (!force && drawn.current === html)) return
      drawn.current = html
      doc.documentElement.innerHTML = innerOf(html)
      measure()
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", measure, { once: true })
      })
    },
    [html, measure],
  )
  React.useLayoutEffect(() => draw(), [draw])
  return (
    <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
      <iframe ref={ref} title={title} sandbox="allow-same-origin" scrolling="no" className="block w-full" style={{ height }} onLoad={() => drawn.current !== null && draw(true)} data-email-frame="" />
    </div>
  )
}
