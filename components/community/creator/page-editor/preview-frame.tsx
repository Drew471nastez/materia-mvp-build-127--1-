"use client"

/**
 * ===========================================================================
 *  THE PAGE, AS A VISITOR'S SCREEN SHOWS IT (round 33)
 * ===========================================================================
 * The owner: "show the actual community landing page as it looks to
 * visitors, with a desktop and phone toggle, and subtle Edit buttons on each
 * editable block."
 *
 * A FRAME OF ITS OWN, SO THE PAGE'S OWN BREAKPOINTS ANSWER. The About page
 * is laid out by the width of the screen (sm:, lg:, xl:), so drawing it in a
 * narrower box of the editor would only ever show the editor's own width.
 * It is drawn into a same document iframe instead, 1440px wide for a
 * computer (scaled down to the pane) or 390px for a phone, through a React
 * portal: the same components, the same state, the creator's changes on it
 * as they type, and media queries that see the frame's width. The editor's
 * stylesheets are copied into the frame (and any that arrive later), and so
 * is the look on <html> (data-sl-dark, the font's class), so the frame is
 * the page in the look the creator is in.
 *
 * NOTHING IN IT CAN BE USED, ONLY PICKED. A press anywhere in the frame is
 * stopped before the page sees it (no join, no link followed, no player);
 * on a part of the page that can be edited ([data-page-block], set by
 * sales-page.tsx and join-controls.tsx) it opens that part's editor. Resting
 * on a part outlines it and shows a small Edit button at its corner; the
 * part being edited keeps a solid outline. On a touch screen, where nothing
 * rests, each part has a small pencil on its top right corner. The outlines and buttons are
 * drawn by the frame over the page, never inside it, so the page's own
 * layout is untouched; they are sized against the frame's scale, so they
 * read the same at 0.5 as at 1.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export type Device = "desktop" | "phone"
export const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, phone: 390 }
export const PHONE_HEIGHT = 844

const BLANK = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body></body></html>"
const FRAME_CSS = "html,body{margin:0}body{background:#f8f9fa;-webkit-font-smoothing:antialiased}[data-page-block]{cursor:pointer}[data-preview-root]{min-height:100vh}"

interface FrameValue {
  scale: number
  selected: string | null
  hover: boolean
  labels: Record<string, string>
}

/** The frame's document and body, for what is drawn inside it. */
export const PreviewDocument = React.createContext<Document | null>(null)

/** Copies the editor's stylesheets and its look on <html> and <body> into the frame, and keeps them in step. */
function mirror(doc: Document): () => void {
  const copied = new WeakSet<Node>()
  const copy = (node: Node) => {
    if (copied.has(node)) return
    const el = node as Element
    if (el.nodeName !== "STYLE" && !(el.nodeName === "LINK" && (el as HTMLLinkElement).rel === "stylesheet")) return
    copied.add(node)
    doc.head.appendChild(doc.importNode(el, true))
  }
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(copy)
  const own = doc.createElement("style")
  own.textContent = FRAME_CSS
  own.setAttribute("data-preview-own", "")
  doc.head.appendChild(own)
  const look = () => {
    const from = document.documentElement
    const to = doc.documentElement
    for (const name of ["class", "lang", "data-sl-dark", "data-sl-appearance"]) {
      const v = from.getAttribute(name)
      if (v === null) to.removeAttribute(name)
      else to.setAttribute(name, name === "class" ? v.replace(/\b(app-layout|app-arriving)\b/g, "").trim() : v)
    }
    to.style.colorScheme = from.style.colorScheme
    doc.body.className = document.body.className
  }
  look()
  const heads = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(copy)))
  heads.observe(document.head, { childList: true })
  const attrs = new MutationObserver(look)
  attrs.observe(document.documentElement, { attributes: true })
  attrs.observe(document.body, { attributes: true, attributeFilter: ["class"] })
  return () => {
    heads.disconnect()
    attrs.disconnect()
  }
}

const closest = (t: EventTarget | null, sel: string): Element | null => {
  const el = t as Element | null
  return el && typeof el.closest === "function" ? el.closest(sel) : null
}

export function PreviewFrame({
  device,
  selected,
  labels,
  onPick,
  focus,
  className,
  children,
}: {
  device: Device
  selected: string | null
  /** The parts' names, for the Edit buttons' labels. */
  labels: Record<string, string>
  onPick: (block: string) => void
  /** Brings the first shown copy of a part into view (a new object each time it is asked). */
  focus?: { block: string } | null
  className?: string
  children: React.ReactNode
}) {
  const pane = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = React.useState<Document | null>(null)
  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })
  const pick = React.useRef(onPick)
  pick.current = onPick
  const hover = React.useSyncExternalStore(
    (f) => {
      const mq = window.matchMedia("(pointer: coarse)")
      mq.addEventListener("change", f)
      return () => mq.removeEventListener("change", f)
    },
    () => !window.matchMedia("(pointer: coarse)").matches,
    () => true,
  )

  React.useLayoutEffect(() => {
    const el = pane.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* The frame's document, once it has loaded its blank page: the stylesheets, the look, the root the page is drawn in. */
  React.useEffect(() => {
    const f = frame.current
    if (!f) return
    let stop: (() => void) | null = null
    const ready = () => {
      const d = f.contentDocument
      if (!d || !d.body || d.querySelector("[data-preview-root]")) return
      stop = mirror(d)
      const r = d.createElement("div")
      r.setAttribute("data-preview-root", "")
      d.body.appendChild(r)
      setDoc(d)
      setRoot(r)
    }
    if (f.contentDocument?.readyState === "complete" && f.contentDocument.body) ready()
    f.addEventListener("load", ready)
    return () => {
      f.removeEventListener("load", ready)
      stop?.()
    }
  }, [])

  /* Every press in the frame is the editor's: stopped before the page sees it, and a part pressed opens its editor. */
  React.useEffect(() => {
    if (!doc) return
    const stopAll = (e: Event) => {
      const chip = closest(e.target, "[data-edit-chip]")
      const block = chip?.getAttribute("data-edit-chip") ?? closest(e.target, "[data-page-block]")?.getAttribute("data-page-block") ?? null
      e.preventDefault()
      e.stopPropagation()
      if (e.type === "click" && block) pick.current(block)
    }
    const kinds = ["click", "auxclick", "submit", "dblclick"]
    kinds.forEach((k) => doc.addEventListener(k, stopAll, true))
    return () => kinds.forEach((k) => doc.removeEventListener(k, stopAll, true))
  }, [doc])

  React.useEffect(() => {
    if (!doc || !focus) return
    const el = [...doc.querySelectorAll(`[data-page-block="${focus.block}"]`)].find((x) => x.getClientRects().length > 0 && (x as HTMLElement).offsetParent !== null)
    /* The frame's own scroll only: scrollIntoView would scroll the editor around the frame too. */
    const win = doc.defaultView
    if (!el || !win) return
    const r = el.getBoundingClientRect()
    win.scrollTo({ top: Math.max(0, win.scrollY + r.top - Math.max(80, (win.innerHeight - r.height) / 2)), behavior: "smooth" })
  }, [doc, focus])

  const width = DEVICE_WIDTH[device]
  const gutter = device === "phone" ? 24 : 0
  const scale = box.w > 0 ? Math.min(1, (box.w - gutter) / width) : 1
  const height = device === "phone" ? Math.min(PHONE_HEIGHT, Math.max(320, (box.h - gutter) / scale)) : Math.max(320, box.h / scale)
  const value: FrameValue = { scale, selected, hover, labels }

  return (
    <div ref={pane} className={cn("relative h-full w-full overflow-hidden", device === "phone" ? "bg-[#eceef1]" : "bg-[#f8f9fa]", className)} data-preview-pane={device} data-preview-scale={scale.toFixed(3)}>
      <div
        className={cn("absolute left-1/2 overflow-hidden", device === "phone" ? "top-3 rounded-[22px] bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_12px_32px_-12px_rgba(16,24,40,0.25)]" : "top-0")}
        style={{ width: width * scale, height: height * scale, translate: "-50% 0" }}
        data-preview-device={device}
      >
        <iframe
          ref={frame}
          title={tt("Preview of your page")}
          srcDoc={BLANK}
          data-page-preview=""
          className="block border-0"
          style={{ width, height, scale: scale === 1 ? undefined : String(scale), transformOrigin: "0 0" }}
        />
      </div>
      {doc && root
        ? createPortal(
            <PreviewDocument.Provider value={doc}>
              <Frame.Provider value={value}>
                {children}
                <Hotspots doc={doc} />
              </Frame.Provider>
            </PreviewDocument.Provider>,
            root,
          )
        : null}
    </div>
  )
}

const Frame = React.createContext<FrameValue>({ scale: 1, selected: null, hover: true, labels: {} })

interface Spot {
  key: string
  block: string
  x: number
  y: number
  w: number
  h: number
}

/** The outlines and Edit buttons over the page, drawn from where its parts are now. */
function Hotspots({ doc }: { doc: Document }) {
  const { scale, selected, hover, labels } = React.useContext(Frame)
  const [spots, setSpots] = React.useState<Spot[]>([])
  const [over, setOver] = React.useState<string | null>(null)
  const [vh, setVh] = React.useState(0)

  React.useEffect(() => {
    const win = doc.defaultView
    if (!win) return
    let raf = 0
    const read = () => {
      raf = 0
      const out: Spot[] = []
      doc.querySelectorAll<HTMLElement>("[data-page-block]").forEach((el, i) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return
        const block = el.getAttribute("data-page-block") as string
        out.push({ key: `${block}:${i}`, block, x: r.left, y: r.top, w: r.width, h: r.height })
      })
      setVh(win.innerHeight)
      setSpots((was) => (JSON.stringify(was) === JSON.stringify(out) ? was : out))
    }
    const soon = () => {
      if (!raf) raf = win.requestAnimationFrame(read)
    }
    read()
    win.addEventListener("scroll", soon, { capture: true, passive: true })
    win.addEventListener("resize", soon)
    const ro = new ResizeObserver(soon)
    ro.observe(doc.body)
    const mo = new MutationObserver(soon)
    mo.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true })
    const move = (e: PointerEvent) => {
      const el = closest(e.target, "[data-edit-chip], [data-page-block]")
      const id = el ? el.getAttribute("data-edit-chip") ?? el.getAttribute("data-page-block") : null
      /* Which copy: the one under the pointer, by its place in the list. */
      if (!el || !id) return setOver(null)
      const all = [...doc.querySelectorAll("[data-page-block]")]
      const at = el.hasAttribute("data-edit-chip") ? el.getAttribute("data-edit-spot") : `${id}:${all.indexOf(el)}`
      setOver(at)
    }
    const leave = () => setOver(null)
    doc.addEventListener("pointermove", move)
    doc.documentElement.addEventListener("pointerleave", leave)
    return () => {
      if (raf) win.cancelAnimationFrame(raf)
      win.removeEventListener("scroll", soon, { capture: true })
      win.removeEventListener("resize", soon)
      ro.disconnect()
      mo.disconnect()
      doc.removeEventListener("pointermove", move)
      doc.documentElement.removeEventListener("pointerleave", leave)
    }
  }, [doc])

  const px = (n: number) => n / scale
  /* On a touch screen one badge a part, on its largest copy on screen: the name is in the bar, the sheet and the side card. */
  const best = new Map<string, Spot>()
  for (const s of spots) {
    if (s.y < 0 || s.y > vh) continue
    const was = best.get(s.block)
    if (!was || s.w * s.h > was.w * was.h) best.set(s.block, s)
  }
  return (
    <div data-preview-hotspots="" style={{ position: "fixed", inset: 0, zIndex: 2147483000, pointerEvents: "none" }}>
      {spots.map((s) => {
        const on = s.block === selected
        const hovered = hover && over === s.key
        if (s.y + s.h < 0 || s.y > vh) return null
        const badge = !hover && !on && best.get(s.block) === s
        if (!on && !hovered && !badge) return null
        const pad = px(4)
        return (
          <React.Fragment key={s.key}>
            {on || hovered ? (
              <span
                data-hotspot={s.block}
                data-hotspot-state={on ? "selected" : "hover"}
                style={{
                  position: "absolute",
                  left: s.x - pad,
                  top: s.y - pad,
                  width: s.w + pad * 2,
                  height: s.h + pad * 2,
                  borderRadius: px(10),
                  boxShadow: on ? `0 0 0 ${px(2)}px #1a1a2e` : `0 0 0 ${px(1.5)}px rgba(26,26,46,0.45)`,
                  background: on ? "transparent" : "rgba(26,26,46,0.025)",
                }}
              />
            ) : null}
            {hovered ? (
              /* Resting on a part: Edit, inside its top right corner. */
              <button
                type="button"
                data-edit-chip={s.block}
                data-edit-spot={s.key}
                aria-label={`${tt("Edit")} ${labels[s.block] ?? ""}`.trim()}
                style={{
                  position: "absolute",
                  top: Math.max(px(6), s.y + px(6)),
                  left: Math.max(px(6), s.x + s.w - px(6)),
                  translate: "-100% 0",
                  pointerEvents: "auto",
                  height: px(26),
                  padding: `0 ${px(10)}px`,
                  borderRadius: px(8),
                  fontSize: px(12.5),
                  lineHeight: `${px(26)}px`,
                  fontWeight: 600,
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  color: "#1a1a2e",
                  background: "rgba(255,255,255,0.96)",
                  border: 0,
                  boxShadow: `0 0 0 ${px(1)}px rgba(16,24,40,0.10), 0 ${px(2)}px ${px(6)}px rgba(16,24,40,0.12)`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tt("Edit")}
              </button>
            ) : badge ? (
              /* A touch screen: a small pencil on the part's top right corner, over the edge rather than the words. */
              <button
                type="button"
                data-edit-chip={s.block}
                data-edit-spot={s.key}
                data-edit-badge=""
                aria-label={`${tt("Edit")} ${labels[s.block] ?? ""}`.trim()}
                style={{
                  position: "absolute",
                  top: Math.max(px(2), s.y - px(12)),
                  left: Math.min(s.x + s.w + px(12), (doc.defaultView?.innerWidth ?? 0) - px(2)),
                  translate: "-100% 0",
                  pointerEvents: "auto",
                  width: px(28),
                  height: px(28),
                  padding: 0,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "999px",
                  color: "#1a1a2e",
                  background: "rgba(255,255,255,0.97)",
                  border: 0,
                  boxShadow: `0 0 0 ${px(1)}px rgba(16,24,40,0.12), 0 ${px(2)}px ${px(6)}px rgba(16,24,40,0.14)`,
                  cursor: "pointer",
                }}
              >
                <svg aria-hidden viewBox="0 0 24 24" width={px(14)} height={px(14)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
                </svg>
              </button>
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}
