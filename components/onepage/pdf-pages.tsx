"use client"

/**
 * A PDF'S PAGES, DRAWN AS PICTURES (round AN).
 *
 * The PDF block (and a menu, which is a PDF too) opens in the block sheet
 * (components/onepage/block-sheet) or is drawn on the page, by the block's
 * Interaction (lib/onepage/block-sheet). Both show the document the same
 * way: each page drawn by pdf.js at the column's width, one under another,
 * appearing as it is ready rather than all at once at the end. Where pdf.js
 * cannot read the file (it is not allowed to fetch it, or it is not a PDF),
 * the browser's own viewer is shown instead.
 *
 * It replaces the page's own PDF pop-up, which drew every page at twice its
 * size into a PNG before it showed the first, inside a 3:4 box that scrolled
 * inside a panel that scrolled.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Download, ExternalLink } from "lucide-react"

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (src: string) => { promise: Promise<PdfDoc>; destroy?: () => void }
}
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => void }
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
}

let loading: Promise<PdfJs> | null = null

/** pdf.js, loaded once for the whole page, the first time a PDF is shown. */
function loadPdfJs(): Promise<PdfJs> {
  const w = window as unknown as { pdfjsLib?: PdfJs }
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib)
  if (!loading) {
    loading = new Promise<PdfJs>((resolve, reject) => {
      const s = document.createElement("script")
      s.src = PDFJS
      s.async = true
      s.onload = () => {
        const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib
        if (!lib) return reject(new Error("pdf.js"))
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
        resolve(lib)
      }
      s.onerror = () => {
        loading = null
        reject(new Error("pdf.js"))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

type Page = { src: string; ratio: number }

/**
 * Round AR3, the owner: documents and menus "display full, in a sheet, full
 * height ... and add what's recommended". Above the pages in the sheet: how
 * many there are, Open in a new tab and Download, so a reader can keep the
 * file or read it in the browser's own viewer.
 */
function PdfTools({ url, title, count }: { url: string; title: string; count: number | null }) {
  const ext = url.match(/\.(pdf|jpe?g|png|webp|gif|avif)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "pdf"
  const name = `${(title || "document").replace(/[^\w .-]+/g, "").trim() || "document"}.${ext}`
  const link = "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[#111113] bg-[rgba(127,127,127,0.12)] transition-[background-color,scale] duration-150 hover:bg-[rgba(127,127,127,0.2)] active:scale-[0.97] [-webkit-tap-highlight-color:transparent]"
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-1" data-pdf-tools="">
      <span className="text-[13px] tabular-nums text-[#6b7280]" data-pdf-count={count ?? ""}>{count === null ? "\u00a0" : tt("{count, plural, one {# page} other {# pages}}", { count })}</span>
      <span className="flex items-center gap-1.5">
        <a href={url} target="_blank" rel="noopener noreferrer" className={link} data-pdf-new-tab="">
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          {tt("Open")}
        </a>
        <a href={url} download={name} target="_blank" rel="noopener noreferrer" className={link} data-pdf-download="">
          <Download aria-hidden className="h-3.5 w-3.5" />
          {tt("Download")}
        </a>
      </span>
    </div>
  )
}

export function PdfPages({ url, title, className, tools = false }: { url: string; title: string; className?: string; tools?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [pages, setPages] = React.useState<Page[]>([])
  const [count, setCount] = React.useState<number | null>(null)
  const [failed, setFailed] = React.useState(false)

  /* Round AR3: a document or a menu uploaded as a picture is shown as that picture, whole. */
  const picture = /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(url)
  React.useEffect(() => {
    if (picture) return
    let cancelled = false
    const made: string[] = []
    setPages([])
    setCount(null)
    setFailed(false)
    const width = Math.max(320, Math.round((ref.current?.clientWidth || 480) * Math.min(window.devicePixelRatio || 1, 2)))
    ;(async () => {
      try {
        const lib = await loadPdfJs()
        const doc = await lib.getDocument(url).promise
        if (cancelled) return doc.destroy?.()
        setCount(doc.numPages)
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("canvas")
          await page.render({ canvasContext: ctx, viewport }).promise
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9))
          if (cancelled) break
          if (!blob) throw new Error("blob")
          const src = URL.createObjectURL(blob)
          made.push(src)
          setPages((cur) => [...cur, { src, ratio: viewport.height / viewport.width }])
        }
        doc.destroy?.()
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      for (const src of made) URL.revokeObjectURL(src)
    }
  }, [url, picture])

  if (picture) {
    return (
      <div ref={ref} className={cn("flex w-full flex-col gap-2", className)} data-pdf-pages="1" style={{ flex: "none" }}>
        {tools ? <PdfTools url={url} title={title} count={1} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={title} className="block h-auto w-full rounded-[6px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" data-pdf-page={1} />
      </div>
    )
  }
  if (failed && !pages.length) {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)} style={{ flex: "none" }}>
        {tools ? <PdfTools url={url} title={title} count={null} /> : null}
        <div ref={ref} className="w-full overflow-hidden rounded-[12px] bg-white" data-pdf-pages="frame" style={{ height: "min(70vh, 640px)", flex: "none" }}>
          <iframe src={`${url}#view=FitH&toolbar=0&navpanes=0`} title={title} className="block h-full w-full border-0" />
        </div>
      </div>
    )
  }
  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)} data-pdf-pages={count ?? ""} style={{ flex: "none" }} aria-busy={count === null || pages.length < count}>
      {tools ? <PdfTools url={url} title={title} count={count} /> : null}
      {pages.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- a page drawn here, not an image on the server
        <img
          key={p.src}
          src={p.src}
          alt={tt("Page {n}", { n: i + 1 })}
          className="block w-full rounded-[6px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          style={{ aspectRatio: `1 / ${p.ratio}` }}
          data-pdf-page={i + 1}
        />
      ))}
      {count === null || pages.length < count ? (
        /* The next page's place, at a page's usual shape, so what follows does not jump up and down. */
        <span aria-hidden className="block w-full rounded-[6px] bg-[rgba(127,127,127,0.12)] motion-safe:animate-pulse" style={{ aspectRatio: `1 / ${pages[0]?.ratio ?? 1.414}` }} data-pdf-placeholder="" />
      ) : null}
    </div>
  )
}

/**
 * THE PDF ON THE PAGE ITSELF ("Show on the page"): its pages in a box of a
 * page's shape that scrolls through them, with the title and the button to
 * open the file under it, in the page's own button style.
 */
export function PdfOnPage({
  url,
  title,
  radius,
  button,
  buttonStyle,
  onOpen,
}: {
  url: string
  title: string
  radius: number
  button: string
  buttonStyle: React.CSSProperties
  onOpen: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [near, setNear] = React.useState(false)
  /* Nothing is fetched until the box is about to be seen. */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver !== "function") return setNear(true)
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setNear(true)
        io.disconnect()
      }
    }, { rootMargin: "400px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const r = Math.min(Math.max(radius, 0), 24)
  return (
    <div className="w-full" data-pdf-inline="">
      <div ref={ref} className="w-full overflow-y-auto overscroll-contain bg-[rgba(127,127,127,0.10)] p-2 [scrollbar-width:thin]" style={{ aspectRatio: "3 / 4", maxHeight: 560, borderRadius: r }}>
        {near ? <PdfPages url={url} title={title} /> : null}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        className="op-btn mt-2 flex min-h-11 w-full items-center justify-center px-4 text-[14px] font-semibold"
        style={buttonStyle}
        data-pdf-open=""
      >
        <span className="truncate" data-block-title="">{button}</span>
      </a>
    </div>
  )
}
