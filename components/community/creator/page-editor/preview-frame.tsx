"use client"

/**
 * ===========================================================================
 *  THE PAGE, AS A VISITOR'S SCREEN SHOWS IT (round 33, round 27)
 * ===========================================================================
 * The owner: "show the actual community landing page as it looks to
 * visitors, with a desktop and phone toggle, and subtle Edit buttons on each
 * editable block."
 *
 * A FRAME OF ITS OWN, SO THE PAGE'S OWN BREAKPOINTS ANSWER. The About page
 * is laid out by the width of the screen (sm:, lg:, xl:), so drawing it in a
 * narrower box of the editor would only ever show the editor's own width.
 * It is drawn into a same document iframe instead, through a React portal:
 * the same components, the same state, the creator's changes on it as they
 * type, and media queries that see the frame's width. The editor's
 * stylesheets are copied into the frame (and any that arrive later), and so
 * is the look on <html> (data-sl-dark, the font's class), so the frame is
 * the page in the look the creator is in.
 *
 * HOW WIDE THE PAGE IS LAID OUT, AND HOW IT IS SCALED (round 27, the owner:
 * "it shrinks things at medium widths and when I zoom"). frameGeometry:
 *
 *   COMPUTER  as wide as the pane, never under 1280px (where the page has
 *             its side card, its desktop look). A pane of 1280 or more is the
 *             page at its own size, nothing scaled; a narrower one is the
 *             1280px page scaled to fit, which is the least it is ever
 *             scaled (round 26 always drew 1440 and scaled that: 0.40 at a
 *             1280px window, 0.47 now).
 *   PHONE     a phone card 390 wide with room around it; in a pane about as
 *             narrow as a phone, the page itself edge to edge, laid out at
 *             the pane's own width (320 to 430), so it is never a phone
 *             drawn inside a phone and never scaled.
 *
 * SCALED WHILE IT MOVES, LAID OUT WHEN IT STOPS. Laying the page out again
 * at a new width, and drawing it again at a new scale, are the costly parts
 * (the whole About page, every frame of a drag). While the pane is changing
 * size (the panel dragged, the window resized, the rail folding) the box
 * the page is in keeps everything it had and is only moved and scaled to the
 * pane, on its own layer, written straight to it on the ResizeObserver's
 * callback (before the frame is painted, no React render, no frame of lag):
 * the compositor's work alone. SETTLE_MS after the last change the page is
 * laid out once at the new width and drawn sharp at its scale. At rest the
 * frame is placed on whole pixels, so its edges and the outlines over it are
 * crisp.
 *
 * NOTHING IN IT CAN BE USED, ONLY PICKED. A press anywhere in the frame is
 * stopped before the page sees it (no join, no link followed, no player);
 * on a part of the page that can be edited ([data-page-block], set by
 * sales-page.tsx and join-controls.tsx) it opens that part's editor.
 *
 * THE OUTLINES (round 27, the owner: "better, not pill shaped, more
 * accurate"). Each part's own box, exactly: no padding around it, its own
 * corner rounding (square where it has none, never a pill), the line drawn
 * just outside the box so it covers nothing of the part. The lines are one
 * device pixel for a part pointed at and two for the part being edited, on
 * the screen's pixel grid at any scale, so they stay crisp at 0.4 as at 1.
 * Resting on a part shows a small tab with its name on the outline's top
 * right corner; a press on it or anywhere on the part opens it. On a touch
 * screen, where nothing rests, each part has a small square pencil on its
 * top right corner. Parts in the page's flow are drawn in the page's own
 * coordinates, so they scroll with it on the compositor and never trail it;
 * parts in a bar that sticks or is fixed are drawn against the frame's
 * screen and measured again as it scrolls. In the dark look they are light.
 *
 * AS A VISITOR (round 26, the owner: "preview as visitor, the signed out /
 * non member view"). The page is the signed out visitor's already (its
 * button decided for one, lib/communities/server/page-editor.ts); `visitor`
 * takes the editor off it: no outlines, no Edit badges, no empty parts'
 * placeholders (the caller draws the page without them), and what a visitor
 * can do inside the page works (the gallery, a question opened, the
 * description's Read more). What would leave the page or act on it never
 * does: a link, the join button, a form.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SETTLE_MS, frameGeometry, liveGeometry, type Device, type FrameGeometry } from "./layout"

export { DESKTOP_MIN, PHONE_WIDTH, PHONE_HEIGHT, frameGeometry, liveGeometry, type Device, type FrameGeometry } from "./layout"

const BLANK = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body></body></html>"
const FRAME_CSS = "html,body{margin:0}body{background:#f8f9fa;-webkit-font-smoothing:antialiased}body:not([data-visitor]) [data-page-block]{cursor:pointer}[data-preview-root]{min-height:100vh}"

/** In the visitor's view, what still never acts: a way off the page, the join button, a form. */
const NEVER_ACTS = 'a[href], [data-page-block="join"], [data-join-state], form, button[type="submit"], input[type="submit"]'

interface FrameValue {
  scale: number
  selected: string | null
  hover: boolean
  dark: boolean
  labels: Record<string, string>
}

/** The frame's document and body, for what is drawn inside it. */
export const PreviewDocument = React.createContext<Document | null>(null)

/**
 * Copies the editor's stylesheets and its look on <html> and <body> into the frame, and keeps them in step. `dark`
 * (round 26) puts the page in the dark look or the light one whatever the dashboard is in (/app is never dark, and a
 * visitor who chose dark sees the page dark): null follows the dashboard.
 */
function mirror(doc: Document, dark: () => boolean | null): { stop: () => void; refresh: () => void } {
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
    const forced = dark()
    if (forced === true) {
      to.setAttribute("data-sl-dark", "")
      to.style.colorScheme = "dark"
    } else if (forced === false) {
      to.removeAttribute("data-sl-dark")
      to.style.colorScheme = "light"
    }
  }
  look()
  const heads = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(copy)))
  heads.observe(document.head, { childList: true })
  const attrs = new MutationObserver(look)
  attrs.observe(document.documentElement, { attributes: true })
  attrs.observe(document.body, { attributes: true, attributeFilter: ["class"] })
  return {
    stop: () => {
      heads.disconnect()
      attrs.disconnect()
    },
    refresh: look,
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
  visitor = false,
  dark = null,
  className,
  children,
}: {
  device: Device
  /** The visitor's view: no outlines or Edit badges, and what a visitor can do inside the page works. */
  visitor?: boolean
  /** The page in the dark look (true), the light one (false), or the dashboard's (null). */
  dark?: boolean | null
  selected: string | null
  /** The parts' names, for the Edit tabs' labels. */
  labels: Record<string, string>
  onPick: (block: string) => void
  /**
   * Brings the first shown copy of a part into view (a new object each time it is asked). `room` is how much of the
   * pane, from its top, is in sight (a drawer covers the rest), in the pane's pixels: the part is centred in that.
   */
  focus?: { block: string; room?: number } | null
  className?: string
  children: React.ReactNode
}) {
  const pane = React.useRef<HTMLDivElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = React.useState<Document | null>(null)
  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  const [scale, setScale] = React.useState(1)
  const pick = React.useRef(onPick)
  pick.current = onPick
  const asVisitor = React.useRef(visitor)
  asVisitor.current = visitor
  const darkRef = React.useRef(dark)
  darkRef.current = dark
  const refreshLook = React.useRef<(() => void) | null>(null)
  const hover = React.useSyncExternalStore(
    (f) => {
      const mq = window.matchMedia("(pointer: coarse)")
      mq.addEventListener("change", f)
      return () => mq.removeEventListener("change", f)
    },
    () => !window.matchMedia("(pointer: coarse)").matches,
    () => true,
  )

  /*
    THE GEOMETRY, WRITTEN TO THE ELEMENTS (see SCALED WHILE IT MOVES above). React draws the three boxes without any
    size; everything that changes with the pane is set here, so a render never undoes it and a drag never waits for one.
  */
  const settled = React.useRef<(FrameGeometry & { device: Device }) | null>(null)
  React.useLayoutEffect(() => {
    const el = pane.current
    const b = box.current
    const f = frame.current
    if (!el || !b || !f) return
    let settle = 0
    /* At rest: the page laid out at its width, the box and the scale exact, nothing held on a layer of its own. */
    const settleNow = () => {
      settle = 0
      const g = frameGeometry(device, el.clientWidth, el.clientHeight)
      const was = settled.current
      b.style.width = `${g.boxW}px`
      b.style.height = `${g.boxH}px`
      b.style.left = `${g.left}px`
      b.style.top = `${g.top}px`
      b.style.translate = ""
      b.style.scale = ""
      b.style.willChange = ""
      if (!was || was.w !== g.w || was.h !== g.h || was.device !== device) {
        f.style.width = `${g.w}px`
        f.style.height = `${g.h}px`
      }
      f.style.scale = g.scale === 1 ? "" : String(g.scale)
      b.toggleAttribute("data-card", g.card)
      el.toggleAttribute("data-preview-card", g.card)
      el.setAttribute("data-preview-scale", g.scale.toFixed(3))
      el.setAttribute("data-preview-width", String(g.w))
      el.removeAttribute("data-preview-live")
      settled.current = { ...g, device }
      setScale(g.scale)
    }
    /*
      WHILE IT MOVES: ONE MOVE AND ONE SCALE. The box with the page in it is held on its own layer and only scaled (and moved
      to stay centred), so nothing is laid out, nothing is painted and nothing is drawn again: measured, a scale written
      to the frame itself every frame still had Chromium raster and commit the page at each step. A pane taller than
      the box shows the page's own ground under it for that moment; at rest it is laid out once more.
    */
    const read = () => {
      const pw = el.clientWidth
      const ph = el.clientHeight
      if (!pw || !ph) return
      const was = settled.current
      if (!was || was.device !== device) return settleNow()
      const natural = frameGeometry(device, pw, ph)
      if (natural.w === was.w && natural.h === was.h && natural.scale === was.scale && natural.boxW === was.boxW && natural.boxH === was.boxH && natural.left === was.left && natural.top === was.top) {
        if (settle) {
          window.clearTimeout(settle)
          settleNow()
        }
        return
      }
      const k = liveGeometry(device, pw, ph, was).scale / was.scale
      const tx = (pw - was.boxW * k) / 2 - was.left
      b.style.willChange = "translate, scale"
      b.style.translate = `${tx}px 0`
      b.style.scale = String(k)
      el.setAttribute("data-preview-live", "")
      window.clearTimeout(settle)
      settle = window.setTimeout(settleNow, SETTLE_MS)
    }
    settleNow()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(settle)
    }
  }, [device])

  /* The frame's document, once it has loaded its blank page: the stylesheets, the look, the root the page is drawn in. */
  React.useEffect(() => {
    const f = frame.current
    if (!f) return
    let stop: (() => void) | null = null
    const ready = () => {
      const d = f.contentDocument
      if (!d || !d.body || d.querySelector("[data-preview-root]")) return
      const m = mirror(d, () => darkRef.current)
      stop = m.stop
      refreshLook.current = m.refresh
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
      /* The visitor's view: only what would leave the page or act on it is stopped. */
      if (asVisitor.current) {
        if (closest(e.target, NEVER_ACTS)) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
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
    refreshLook.current?.()
  }, [doc, dark])

  React.useEffect(() => {
    if (!doc) return
    if (visitor) doc.body.setAttribute("data-visitor", "")
    else doc.body.removeAttribute("data-visitor")
  }, [doc, visitor])

  const scaleRef = React.useRef(scale)
  scaleRef.current = scale
  React.useEffect(() => {
    if (!doc || !focus) return
    const el = [...doc.querySelectorAll(`[data-page-block="${focus.block}"]`)].find((x) => x.getClientRects().length > 0 && (x as HTMLElement).offsetParent !== null)
    /* The frame's own scroll only: scrollIntoView would scroll the editor around the frame too. */
    const win = doc.defaultView
    if (!el || !win) return
    const r = el.getBoundingClientRect()
    const room = focus.room ? Math.min(win.innerHeight, focus.room / (scaleRef.current || 1)) : win.innerHeight
    win.scrollTo({ top: Math.max(0, win.scrollY + r.top - Math.max(Math.min(80, room / 6), (room - r.height) / 2)), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [doc, focus])

  const looksDark = dark === true || (dark === null && typeof document !== "undefined" && document.documentElement.hasAttribute("data-sl-dark"))
  const value: FrameValue = { scale, selected, hover, labels, dark: looksDark }

  return (
    <div ref={pane} className={cn("relative h-full w-full overflow-hidden bg-[#f8f9fa] data-[preview-card]:bg-[#eceef1]", className)} data-preview-pane={device} data-preview-visitor={visitor ? "" : undefined} data-preview-look={dark === true ? "dark" : dark === false ? "light" : undefined}>
      <div
        ref={box}
        className="absolute origin-top-left overflow-hidden data-[card]:rounded-[22px] data-[card]:bg-white data-[card]:shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_12px_32px_-12px_rgba(16,24,40,0.25)]"
        data-preview-device={device}
      >
        <iframe ref={frame} title={tt("Preview of your page")} srcDoc={BLANK} data-page-preview="" className="block origin-top-left border-0" />
      </div>
      {doc && root
        ? createPortal(
            <PreviewDocument.Provider value={doc}>
              <Frame.Provider value={value}>
                {children}
                {visitor ? null : <Hotspots doc={doc} />}
              </Frame.Provider>
            </PreviewDocument.Provider>,
            root,
          )
        : null}
    </div>
  )
}

const Frame = React.createContext<FrameValue>({ scale: 1, selected: null, hover: true, dark: false, labels: {} })

interface Spot {
  key: string
  block: string
  /** In the page's coordinates for a part in its flow; in the frame's screen's for one in a bar that sticks or is fixed. */
  x: number
  y: number
  w: number
  h: number
  /** The part's own corner rounding, in the frame's pixels. */
  r: number
  pinned: boolean
}

/** Whether a part sits in something that sticks or is fixed (so it moves against the page as it scrolls). Kept per element. */
function pinnedIn(el: Element, win: Window, seen: WeakMap<Element, boolean>): boolean {
  const known = seen.get(el)
  if (known !== undefined) return known
  let pinned = false
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const p = win.getComputedStyle(a).position
    if (p === "fixed" || p === "sticky") {
      pinned = true
      break
    }
  }
  seen.set(el, pinned)
  return pinned
}

/** The outlines and Edit tabs over the page, drawn from where its parts are now. */
function Hotspots({ doc }: { doc: Document }) {
  const { scale, selected, hover, labels, dark } = React.useContext(Frame)
  const [spots, setSpots] = React.useState<Spot[]>([])
  const [over, setOver] = React.useState<string | null>(null)
  const [view, setView] = React.useState({ sy: 0, vh: 0, vw: 0 })

  React.useEffect(() => {
    const win = doc.defaultView
    if (!win) return
    let raf = 0
    const pins = new WeakMap<Element, boolean>()
    const radii = new WeakMap<Element, number>()
    const read = () => {
      raf = 0
      const sx = win.scrollX
      const sy = win.scrollY
      const out: Spot[] = []
      doc.querySelectorAll<HTMLElement>("[data-page-block]").forEach((el, i) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return
        const block = el.getAttribute("data-page-block") as string
        const pinned = pinnedIn(el, win, pins)
        let radius = radii.get(el)
        if (radius === undefined) {
          radius = parseFloat(win.getComputedStyle(el).borderTopRightRadius) || 0
          radii.set(el, radius)
        }
        out.push({ key: `${block}:${i}`, block, x: pinned ? r.left : r.left + sx, y: pinned ? r.top : r.top + sy, w: r.width, h: r.height, r: Math.min(radius, r.width / 2, r.height / 2), pinned })
      })
      setView((v) => (v.sy === sy && v.vh === win.innerHeight && v.vw === win.innerWidth ? v : { sy, vh: win.innerHeight, vw: win.innerWidth }))
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
      const id = el ? (el.getAttribute("data-edit-chip") ?? el.getAttribute("data-page-block")) : null
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

  /*
    ON THE SCREEN'S PIXEL GRID. A frame pixel is `scale` screen pixels and a screen pixel `dpr` device pixels, so one
    device pixel is `unit` frame pixels. Every edge is put on that grid as the screen sees it (a part in the page's
    flow measured against the page's scroll now), and a line is a whole number of device pixels wide: crisp at any scale.
  */
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  const unit = 1 / (scale * dpr)
  const px = (screen: number) => screen / scale
  const line = (screen: number) => Math.max(1, Math.round(screen * dpr)) * unit
  const ink = dark ? "#ececee" : "#1a1a2e"
  const soft = dark ? "rgba(236,236,238,0.6)" : "rgba(26,26,46,0.55)"
  const onScreen = (s: Spot) => (s.pinned ? s.y : s.y - view.sy)
  /* On a touch screen one badge a part, on its largest copy on screen: the name is in the bar, the sheet and the side card. */
  const best = new Map<string, Spot>()
  for (const s of spots) {
    const y = onScreen(s)
    if (y < 0 || y > view.vh) continue
    const was = best.get(s.block)
    if (!was || s.w * s.h > was.w * was.h) best.set(s.block, s)
  }
  const flow: React.ReactNode[] = []
  const pinned: React.ReactNode[] = []
  for (const s of spots) {
    const on = s.block === selected
    const hovered = hover && over === s.key
    const top = onScreen(s)
    if (top + s.h < 0 || top > view.vh) continue
    const badge = !hover && !on && best.get(s.block) === s
    if (!on && !hovered && !badge) continue
    /* Snapped as the screen sees it, then back into the layer's own coordinates. */
    const shift = s.pinned ? 0 : view.sy
    const snap = (v: number) => Math.round((v - shift) / unit) * unit + shift
    const x0 = snap(s.x)
    const y0 = snap(s.y)
    const x1 = snap(s.x + s.w)
    const y1 = snap(s.y + s.h)
    const lw = line(on ? 2 : 1)
    /* Two screen pixels clear of the part, so the line never touches its words; the rectangle is still the part's own. */
    const gap = line(2)
    const radius = s.r > 0 ? s.r + gap + lw : px(2)
    const tabH = px(22)
    /* The tab sits on the outline's top edge, outside it, unless that would leave the frame's screen. */
    const outside = top > tabH + lw + gap + px(2)
    const out = (
      <React.Fragment key={s.key}>
        {on || hovered ? (
          <span
            data-hotspot={s.block}
            data-hotspot-state={on ? "selected" : "hover"}
            data-line={lw}
            data-gap={gap}
            style={{
              position: "absolute",
              left: x0 - lw - gap,
              top: y0 - lw - gap,
              width: x1 - x0 + (lw + gap) * 2,
              height: y1 - y0 + (lw + gap) * 2,
              /* An inset shadow, not a border: Chromium rounds a border's width in the frame's own pixels, which undid the screen's. */
              boxShadow: `inset 0 0 0 ${lw}px ${on ? ink : soft}`,
              borderRadius: radius,
              background: on ? "transparent" : dark ? "rgba(236,236,238,0.04)" : "rgba(26,26,46,0.03)",
            }}
          />
        ) : null}
        {hovered ? (
          /* Resting on a part: its name on a tab at the outline's top right corner. */
          <button
            type="button"
            data-edit-chip={s.block}
            data-edit-spot={s.key}
            aria-label={`${tt("Edit")} ${labels[s.block] ?? ""}`.trim()}
            style={{
              position: "absolute",
              left: x1 + lw + gap,
              top: outside ? y0 - lw - gap - tabH : y0 - gap,
              translate: "-100% 0",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: px(5),
              height: tabH,
              maxWidth: Math.max(px(60), x1 - x0 + (lw + gap) * 2),
              padding: `0 ${px(8)}px`,
              borderRadius: outside ? `${px(5)}px ${px(5)}px 0 0` : `0 0 0 ${px(5)}px`,
              fontSize: px(12),
              lineHeight: `${tabH}px`,
              fontWeight: 600,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              letterSpacing: 0,
              color: dark ? "#111113" : "#ffffff",
              background: on ? ink : dark ? "#d4d4d8" : "#3a3a4c",
              border: 0,
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <svg aria-hidden viewBox="0 0 24 24" width={px(12)} height={px(12)} style={{ flex: "none" }} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{labels[s.block] ?? tt("Edit")}</span>
          </button>
        ) : badge ? (
          /* A touch screen: a small square pencil on the part's top right corner, over the edge rather than the words. */
          <button
            type="button"
            data-edit-chip={s.block}
            data-edit-spot={s.key}
            data-edit-badge=""
            aria-label={`${tt("Edit")} ${labels[s.block] ?? ""}`.trim()}
            style={{
              position: "absolute",
              top: Math.max(shift + px(2), y0 - px(10)),
              left: Math.min(x1 + px(10), view.vw - px(2)),
              translate: "-100% 0",
              pointerEvents: "auto",
              width: px(28),
              height: px(28),
              padding: 0,
              display: "grid",
              placeItems: "center",
              borderRadius: px(7),
              color: "#1a1a2e",
              background: "rgba(255,255,255,0.97)",
              border: 0,
              boxShadow: `0 0 0 ${line(1)}px rgba(16,24,40,0.14), 0 ${px(2)}px ${px(6)}px rgba(16,24,40,0.14)`,
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
    ;(s.pinned ? pinned : flow).push(out)
  }
  return (
    <>
      {/*
        The page's flow: in its own coordinates, so these scroll with it and never trail it; above what is in the flow
        (the gallery's Share is z-30) and under the page's own bars that stick or are fixed (z-40 and up), so a part
        scrolled under the top bar goes under it as the part itself does.
      */}
      <div data-preview-hotspots="" data-scale={scale} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 35, pointerEvents: "none" }}>
        {flow}
      </div>
      {/* Bars that stick or are fixed: against the frame's screen, measured again as it scrolls. */}
      <div data-preview-hotspots-pinned="" style={{ position: "fixed", inset: 0, zIndex: 2147483001, pointerEvents: "none", overflow: "hidden" }}>
        {pinned}
      </div>
    </>
  )
}
