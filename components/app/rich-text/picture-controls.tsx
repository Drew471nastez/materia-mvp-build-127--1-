"use client"

/**
 * ===========================================================================
 *  A PICTURE IN THE DESCRIPTION, PICKED
 * ===========================================================================
 * "If I add an image, I can adjust the size, position it better, adjust its
 * ratio, with draggers in corners, and it works on desktop and on a phone."
 *
 * A tap or click on a picture picks it. Around it, a frame with a handle on
 * each corner: drag one and the picture grows or shrinks, as a share of the
 * text's width (10% to 100%), with the share shown while it moves. A
 * centred picture grows from both sides, so its corner stays under the
 * pointer. Over it, one short row, the same on a phone and a computer:
 *
 *   position        one button: left, centre, right, and round again
 *   S M L Full      33, 50, 75 and 100% wide, as one segmented control
 *   shape           a menu: Original, 16:9, 4:3, 1:1, 3:4 (object-fit cover)
 *   Alt             a description for people who cannot see it
 *   remove
 *   more            a menu: move it one block up or down in the text
 *
 * What it writes is what lib/rich-text/policy.ts keeps: `data-align`, and a
 * style with only a width in % and an aspect ratio (pictureStyle). Nothing
 * else survives the save, so nothing else is written.
 *
 * WHERE THE ROW GOES. Centred on the picture, above it when there is room,
 * else below it, else over its top edge, and always inside the text. Every
 * control in it has a fixed width, so the row is the same width whatever is
 * picked and never shifts sideways when a setting changes.
 *
 * HOW IT COMES AND GOES. It is placed before it is first painted, so there
 * is no frame in which it sits at the text's corner and slides across. Then
 * it fades in with a small rise from the picture's side (160ms), and fades
 * out the same way when the picture is let go. The menus open from their
 * button the same way. Only opacity and transform move, as Web Animations,
 * so the compositor runs them.
 *
 * NO REACT RENDER PER FRAME. The frame and the row follow the picture while
 * the text scrolls, the window resizes or a handle is dragged, from one
 * animation frame loop that writes their position straight onto the nodes.
 * React renders only when a setting changes.
 *
 * ON A PHONE the handles are 28px targets (the dot drawn is 12px), the row's
 * controls are 36px tall, and a drag never scrolls the page (`touch-action:
 * none` on the handles only). Hover shades are for a mouse only.
 */

import * as React from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export type PictureAlign = "left" | "center" | "right"

const SIZES: Array<{ label: string; pct: number; name: string }> = [
  { label: "S", pct: 33, name: "Small, a third of the width" },
  { label: "M", pct: 50, name: "Medium, half the width" },
  { label: "L", pct: 75, name: "Large, three quarters of the width" },
  { label: "Full", pct: 100, name: "Full width" },
]

const RATIOS: Array<{ label: string; value: string | null; w: number; h: number }> = [
  { get label() { return tt("Original") }, value: null, w: 14, h: 10 },
  { label: "16:9", value: "16 / 9", w: 16, h: 9 },
  { label: "4:3", value: "4 / 3", w: 4, h: 3 },
  { label: "1:1", value: "1 / 1", w: 1, h: 1 },
  { label: "3:4", value: "3 / 4", w: 3, h: 4 },
]

const PLACES: Array<{ value: PictureAlign; name: string; icon: typeof AlignLeft }> = [
  { value: "left", name: "Left", icon: AlignLeft },
  { value: "center", name: "Centre", icon: AlignCenter },
  { value: "right", name: "Right", icon: AlignRight },
]

/** One curve for everything here that comes and goes. */
const EASE = "cubic-bezier(0.2, 0, 0, 1)"
const IN_MS = 160
const OUT_MS = 120

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The picture's width as a share of the text, 100 when it has none of its own. */
export function pictureWidth(img: HTMLImageElement): number {
  const m = /^(\d{1,3})%$/.exec(img.style.width || "")
  return m ? Math.max(10, Math.min(100, Number(m[1]))) : 100
}

function pictureRatio(img: HTMLImageElement): string | null {
  const r = (img.style.aspectRatio || "").replace(/\s+/g, " ").trim()
  return r && r !== "auto" ? r : null
}

function setWidth(img: HTMLImageElement, pct: number) {
  const p = Math.max(10, Math.min(100, Math.round(pct)))
  if (p >= 100) img.style.removeProperty("width")
  else img.style.width = `${p}%`
  if (!img.getAttribute("style")) img.removeAttribute("style")
}

function setRatio(img: HTMLImageElement, ratio: string | null) {
  if (ratio) {
    img.style.aspectRatio = ratio
    img.style.objectFit = "cover"
  } else {
    img.style.removeProperty("aspect-ratio")
    img.style.removeProperty("object-fit")
  }
  if (!img.getAttribute("style")) img.removeAttribute("style")
}

/** A small outline of a shape, drawn to its proportions; dashed for the picture's own. */
function RatioGlyph({ w, h, own }: { w: number; h: number; own?: boolean }) {
  const s = 12 / Math.max(w, h)
  const gw = Math.max(5, w * s)
  const gh = Math.max(5, h * s)
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <rect
        x={(16 - gw) / 2}
        y={(16 - gh) / 2}
        width={gw}
        height={gh}
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={own ? "2.2 1.8" : undefined}
      />
    </svg>
  )
}

/** A label that shows on hover with a mouse, after a moment; never on touch. */
export function Tip({ label, children, side = "top" }: { label: string; children: React.ReactElement; side?: "top" | "bottom" }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[2147483641] select-none rounded-md bg-[#111113] px-2 py-1 text-[12px] font-medium leading-4 text-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-100 [@media(pointer:coarse)]:hidden"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* Every control has a fixed width (see WHERE THE ROW GOES). */
const barButton =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer select-none items-center justify-center rounded-md text-[12px] font-medium text-white/75 outline-none transition-colors duration-100 focus-visible:bg-white/15 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-white max-sm:h-9"
const barOn = "bg-white/15 text-white"
const barRule = <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-white/15 max-sm:hidden" />

export function PictureControls({
  img,
  open = true,
  onExited,
  root,
  frameRef,
  onChange,
  onMove,
  onAlt,
  onRemove,
  onDone,
}: {
  img: HTMLImageElement
  /** False once the picture is let go: the controls fade out, then call onExited. */
  open?: boolean
  onExited?: () => void
  /** The editable text the picture is in: its width is what a share is of. */
  root: HTMLElement
  /** The box the controls are drawn in, positioned over the text. */
  frameRef: React.RefObject<HTMLDivElement | null>
  /** A setting changed: save the text. */
  onChange: () => void
  onMove: (dir: -1 | 1) => void
  onAlt: () => void
  onRemove: () => void
  onDone: () => void
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const barRef = React.useRef<HTMLDivElement>(null)
  const barInnerRef = React.useRef<HTMLDivElement>(null)
  const readoutRef = React.useRef<HTMLSpanElement>(null)
  const shapeRef = React.useRef<HTMLButtonElement>(null)
  const moreRef = React.useRef<HTMLButtonElement>(null)
  /** Which side of the picture the row is on, for the direction it rises from. */
  const sideRef = React.useRef<"above" | "below">("above")
  const [, setTick] = React.useState(0)
  const refresh = () => setTick((n) => n + 1)
  const [menu, setMenu] = React.useState<"shape" | "more" | null>(null)

  const align = (img.getAttribute("data-align") as PictureAlign | null) ?? null
  const width = pictureWidth(img)
  const ratio = pictureRatio(img)

  /** Frame on the picture, row centred over or under it, clamped inside the text. */
  const place = React.useCallback(() => {
    const frame = frameRef.current
    const box = boxRef.current
    const bar = barRef.current
    if (!frame || !img.isConnected) return
    const f = frame.getBoundingClientRect()
    const r = img.getBoundingClientRect()
    const x = r.left - f.left
    const y = r.top - f.top
    if (box) {
      box.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
      box.style.width = `${Math.round(r.width)}px`
      box.style.height = `${Math.round(r.height)}px`
    }
    if (bar) {
      const bw = bar.offsetWidth
      const bh = bar.offsetHeight
      const bx = Math.max(6, Math.min(f.width - bw - 6, x + r.width / 2 - bw / 2))
      const above = y - bh - 10
      const below = y + r.height + 10
      let by: number
      if (above >= 4) {
        by = above
        sideRef.current = "above"
      } else if (below + bh <= f.height - 4) {
        by = below
        sideRef.current = "below"
      } else {
        by = Math.max(4, Math.min(f.height - bh - 4, y + 8))
        sideRef.current = "below"
      }
      bar.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0)`
      bar.style.visibility = "visible"
    }
  }, [img, frameRef])

  /* Placed before the first paint, then followed every frame. */
  React.useLayoutEffect(() => {
    place()
    let raf = 0
    const loop = () => {
      place()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [place])

  /* In, and out: opacity and a few pixels of rise, nothing sideways. */
  const onExitedRef = React.useRef(onExited)
  React.useEffect(() => {
    onExitedRef.current = onExited
  })
  React.useLayoutEffect(() => {
    const inner = barInnerRef.current
    const box = boxRef.current
    if (!inner || !box) return
    const quick = reducedMotion()
    const dy = sideRef.current === "above" ? 4 : -4
    inner.style.transformOrigin = sideRef.current === "above" ? "50% 100%" : "50% 0%"
    const hidden = { opacity: 0, transform: quick ? "none" : `translate3d(0, ${dy}px, 0) scale(0.96)` }
    const shown = { opacity: 1, transform: "none" }
    const opts: KeyframeAnimationOptions = { duration: quick ? 1 : open ? IN_MS : OUT_MS, easing: EASE, fill: "both" }
    const a = inner.animate(open ? [hidden, shown] : [shown, hidden], opts)
    const b = box.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], opts)
    if (!open) {
      setMenu(null)
      a.onfinish = () => onExitedRef.current?.()
    }
    return () => {
      a.cancel()
      b.cancel()
    }
  }, [open])

  /* Escape lets go; a picture that leaves the text lets go too. */
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDone, open])

  const contentWidth = () => {
    const cs = getComputedStyle(root)
    return root.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")
  }

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, side: -1 | 1) => {
    e.preventDefault()
    e.stopPropagation()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = img.getBoundingClientRect().width
    const full = Math.max(1, contentWidth())
    const both = img.getAttribute("data-align") === "center" ? 2 : 1
    const readout = readoutRef.current
    if (readout) readout.style.opacity = "1"
    let pct = Math.round((startW / full) * 100)
    let frame = 0
    const move = (ev: PointerEvent) => {
      const w = startW + side * (ev.clientX - startX) * both
      pct = Math.max(10, Math.min(100, Math.round((w / full) * 100)))
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setWidth(img, pct)
        if (readout) readout.textContent = `${pct}%`
      })
    }
    const up = () => {
      if (frame) cancelAnimationFrame(frame)
      setWidth(img, pct)
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      handle.removeEventListener("pointercancel", up)
      if (readout) readout.style.opacity = "0"
      onChange()
      refresh()
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
  }

  const handle = (corner: "tl" | "tr" | "bl" | "br") => {
    const side: -1 | 1 = corner === "tl" || corner === "bl" ? -1 : 1
    return (
      <span
        key={corner}
        data-picture-handle={corner}
        aria-hidden
        onPointerDown={(e) => startResize(e, side)}
        className={cn(
          "pointer-events-auto absolute flex h-7 w-7 touch-none items-center justify-center sm:h-5 sm:w-5",
          corner === "tl" && "-left-3.5 -top-3.5 cursor-nwse-resize sm:-left-2.5 sm:-top-2.5",
          corner === "tr" && "-right-3.5 -top-3.5 cursor-nesw-resize sm:-right-2.5 sm:-top-2.5",
          corner === "bl" && "-bottom-3.5 -left-3.5 cursor-nesw-resize sm:-bottom-2.5 sm:-left-2.5",
          corner === "br" && "-bottom-3.5 -right-3.5 cursor-nwse-resize sm:-bottom-2.5 sm:-right-2.5",
        )}
      >
        <span className="block h-3 w-3 rounded-full border-2 border-[#111113] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
      </span>
    )
  }

  const set = (fn: () => void) => {
    fn()
    onChange()
    refresh()
  }

  /* Round the three places; a picture with none of its own sits at the left, so the first tap centres it. */
  const current = PLACES.find((p) => p.value === align) ?? null
  const next = current ? PLACES[(PLACES.indexOf(current) + 1) % PLACES.length] : PLACES[1]
  const PlaceIcon = (current ?? PLACES[0]).icon
  const shape = RATIOS.find((r) => r.value === ratio) ?? RATIOS[0]
  const closeMenu = React.useCallback(() => setMenu(null), [])

  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
      {/* The frame and its handles. */}
      <div
        ref={boxRef}
        data-picture-frame=""
        className={cn(
          "absolute left-0 top-0 rounded-[10px] shadow-[0_0_0_2px_#111113,0_0_0_4px_rgba(255,255,255,0.9)]",
          open ? "pointer-events-none" : "pointer-events-none [&_*]:!pointer-events-none",
        )}
      >
        {handle("tl")}
        {handle("tr")}
        {handle("bl")}
        {handle("br")}
        <span
          ref={readoutRef}
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-[#111113]/85 px-2 py-0.5 text-[12px] font-medium tabular-nums text-white opacity-0 transition-opacity duration-150"
        >
          {width}%
        </span>
      </div>

      {/* The row. The outer box is only ever moved; the inner one fades and rises. */}
      <div
        ref={barRef}
        className={cn("absolute left-0 top-0 max-w-[calc(100%-12px)]", open ? "pointer-events-auto" : "pointer-events-none")}
        style={{ visibility: "hidden" }}
      >
        <div
          ref={barInnerRef}
          role="toolbar"
          aria-label={tt("Picture")}
          data-picture-bar=""
          onMouseDown={(e) => {
            /* The text keeps its focus and its caret while the row is used. */
            if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault()
          }}
          className="flex items-center gap-0.5 overflow-x-auto rounded-xl bg-[#111113]/95 p-1 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ opacity: 0 }}
        >
          <Tip label={tt("Position: {name}, then {value}", { name: (current ?? PLACES[0]).name, value: next.name.toLowerCase() })}>
            <button
              type="button"
              data-picture-position={align ?? ""}
              aria-label={tt("Position, {value}", { value: current ? current.name.toLowerCase() : tt("not set") })}
              onClick={() => set(() => img.setAttribute("data-align", next.value))}
              className={cn(barButton, current && barOn)}
            >
              <PlaceIcon className="h-4 w-4" />
            </button>
          </Tip>
          {barRule}
          <div role="group" aria-label={tt("Size")} className="flex shrink-0 items-center rounded-lg bg-white/[0.06] p-px">
            {SIZES.map((s) => (
              <Tip key={s.label} label={s.name}>
                <button
                  type="button"
                  aria-label={s.name}
                  aria-pressed={width === s.pct}
                  onClick={() =>
                    set(() => {
                      setWidth(img, s.pct)
                      /* A picture narrower than the text sits somewhere: centred unless told. */
                      if (s.pct < 100 && !img.getAttribute("data-align")) img.setAttribute("data-align", "center")
                    })
                  }
                  className={cn(barButton, "h-7 max-sm:h-8", s.label === "Full" ? "w-9 max-sm:w-8" : "w-7 max-sm:w-[26px]", width === s.pct && barOn)}
                >
                  {s.label}
                </button>
              </Tip>
            ))}
          </div>
          {barRule}
          <Tip label={`Shape: ${shape.label}`}>
            <button
              ref={shapeRef}
              type="button"
              aria-label={tt("Shape")}
              aria-haspopup="menu"
              aria-expanded={menu === "shape"}
              onClick={() => setMenu((m) => (m === "shape" ? null : "shape"))}
              className={cn(barButton, "w-10 gap-0.5 max-sm:w-9", (ratio || menu === "shape") && barOn)}
            >
              <RatioGlyph w={shape.w} h={shape.h} own={!shape.value} />
              <svg aria-hidden viewBox="0 0 10 6" className="h-1.5 w-2 shrink-0 opacity-70"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </Tip>
          <Tip label={tt("Describe it for screen readers")}>
            <button type="button" aria-label={tt("Alt text")} onClick={onAlt} className={cn(barButton, "tracking-wide")}>
              {tt("Alt")}
            </button>
          </Tip>
          <Tip label={tt("Remove picture")}>
            <button type="button" aria-label={tt("Remove picture")} onClick={onRemove} className={barButton}>
              <Trash2 className="h-4 w-4" />
            </button>
          </Tip>
          <Tip label={tt("More")}>
            <button
              ref={moreRef}
              type="button"
              aria-label={tt("More")}
              aria-haspopup="menu"
              aria-expanded={menu === "more"}
              onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
              className={cn(barButton, menu === "more" && barOn)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </Tip>
        </div>
      </div>

      <BarMenu open={menu === "shape"} label={tt("Shape")} anchorRef={shapeRef} frameRef={frameRef} barRef={barRef} onClose={closeMenu}>
        {RATIOS.map((r) => {
          const on = r.value === ratio
          return (
            <button
              key={r.label}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              onClick={() => {
                setMenu(null)
                set(() => setRatio(img, r.value))
              }}
              className={cn(menuItem, on && "bg-white/10 text-white")}
            >
              <RatioGlyph w={r.w} h={r.h} own={!r.value} />
              <span>{r.label}</span>
            </button>
          )
        })}
      </BarMenu>
      <BarMenu open={menu === "more"} label={tt("More")} anchorRef={moreRef} frameRef={frameRef} barRef={barRef} onClose={closeMenu}>
        <button type="button" role="menuitem" onClick={() => onMove(-1)} className={menuItem}>
          <ArrowUp aria-hidden className="h-4 w-4 shrink-0" />
          <span>{tt("Move up")}</span>
        </button>
        <button type="button" role="menuitem" onClick={() => onMove(1)} className={menuItem}>
          <ArrowDown aria-hidden className="h-4 w-4 shrink-0" />
          <span>{tt("Move down")}</span>
        </button>
      </BarMenu>
    </TooltipPrimitive.Provider>
  )
}

const menuItem =
  "flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] text-white/80 outline-none transition-colors focus-visible:bg-white/10 [-webkit-tap-highlight-color:transparent] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-white max-sm:h-10"

/**
 * A short list that opens from a button in the row: under the row when the
 * text has room below it, else over it, centred on its button and kept
 * inside the text. It fades and rises in from the row's side, and out the
 * same way; it stays in the document until its exit has finished.
 */
function BarMenu({
  open,
  label,
  anchorRef,
  barRef,
  frameRef,
  onClose,
  children,
}: {
  open: boolean
  label: string
  anchorRef: React.RefObject<HTMLButtonElement | null>
  barRef: React.RefObject<HTMLDivElement | null>
  frameRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(open)
  if (open && !mounted) setMounted(true)
  const outerRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const belowRef = React.useRef(true)

  React.useLayoutEffect(() => {
    if (!mounted) return
    let raf = 0
    const place = () => {
      const anchor = anchorRef.current
      const bar = barRef.current
      const frame = frameRef.current
      const menu = outerRef.current
      if (anchor && bar && frame && menu) {
        const f = frame.getBoundingClientRect()
        const a = anchor.getBoundingClientRect()
        const b = bar.getBoundingClientRect()
        const mw = menu.offsetWidth
        const mh = menu.offsetHeight
        const x = Math.max(6, Math.min(f.width - mw - 6, a.left - f.left + a.width / 2 - mw / 2))
        const below = b.bottom - f.top + 6
        belowRef.current = below + mh <= f.height - 4
        const y = belowRef.current ? below : Math.max(4, b.top - f.top - mh - 6)
        menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
        menu.style.visibility = "visible"
      }
    }
    place()
    const loop = () => {
      place()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mounted, anchorRef, barRef, frameRef])

  React.useLayoutEffect(() => {
    const inner = innerRef.current
    if (!mounted || !inner) return
    const quick = reducedMotion()
    const dy = belowRef.current ? -4 : 4
    inner.style.transformOrigin = belowRef.current ? "50% 0%" : "50% 100%"
    const hidden = { opacity: 0, transform: quick ? "none" : `translate3d(0, ${dy}px, 0) scale(0.96)` }
    const shown = { opacity: 1, transform: "none" }
    const a = inner.animate(open ? [hidden, shown] : [shown, hidden], { duration: quick ? 1 : open ? IN_MS : OUT_MS, easing: EASE, fill: "both" })
    if (!open) a.onfinish = () => setMounted(false)
    return () => a.cancel()
  }, [open, mounted])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!outerRef.current?.contains(t) && !anchorRef.current?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open, onClose, anchorRef])

  if (!mounted) return null
  return (
    <div
      ref={outerRef}
      className={cn("absolute left-0 top-0 z-[1]", open ? "pointer-events-auto" : "pointer-events-none")}
      style={{ visibility: "hidden" }}
    >
      <div
        ref={innerRef}
        role="menu"
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        className="min-w-[128px] rounded-xl bg-[#111113]/95 p-1 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.18)] backdrop-blur-sm"
        style={{ opacity: 0 }}
      >
        {children}
      </div>
    </div>
  )
}
