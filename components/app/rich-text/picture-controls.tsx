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
 * pointer. Over it, one small bar:
 *
 *   left · centre · right        where it sits in the text
 *   S · M · L · Full             33, 50, 75 and 100% wide
 *   Original · 16:9 · 4:3 · 1:1 · 3:4
 *                                the shape it is cut to (object-fit cover)
 *   up · down                    one block earlier or later in the text
 *   Alt                          a description for people who cannot see it
 *   remove
 *
 * What it writes is what lib/rich-text/policy.ts keeps: `data-align`, and a
 * style with only a width in % and an aspect ratio (pictureStyle). Nothing
 * else survives the save, so nothing else is written.
 *
 * NO REACT RENDER PER FRAME. The frame and the bar follow the picture while
 * the text scrolls, the window resizes or a handle is dragged, from one
 * animation frame loop that writes their position straight onto the nodes.
 * React renders only when a setting changes.
 *
 * ON A PHONE the handles are 28px targets (the dot drawn is 12px), the bar
 * wraps onto a second row rather than hiding controls off its edge, and a
 * drag never scrolls the page (`touch-action: none` on the handles only).
 */

import * as React from "react"
import { createPortal } from "react-dom"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Trash2,
} from "lucide-react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

export type PictureAlign = "left" | "center" | "right"

const SIZES: Array<{ label: string; pct: number; name: string }> = [
  { label: "S", pct: 33, name: "Small, a third of the width" },
  { label: "M", pct: 50, name: "Medium, half the width" },
  { label: "L", pct: 75, name: "Large, three quarters of the width" },
  { label: "Full", pct: 100, name: "Full width" },
]

const RATIOS: Array<{ label: string; value: string | null; name: string }> = [
  { label: "Original", value: null, name: "Its own shape" },
  { label: "16:9", value: "16 / 9", name: "Wide, 16 by 9" },
  { label: "4:3", value: "4 / 3", name: "4 by 3" },
  { label: "1:1", value: "1 / 1", name: "Square" },
  { label: "3:4", value: "3 / 4", name: "Tall, 3 by 4" },
]

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

const barButton =
  "inline-flex h-8 min-w-8 shrink-0 cursor-pointer select-none items-center justify-center rounded-md px-1.5 text-[12px] font-medium text-white/75 outline-none transition-colors duration-100 hover:bg-white/10 hover:text-white focus-visible:bg-white/15 [-webkit-tap-highlight-color:transparent] max-sm:h-9 max-sm:min-w-9"
const barOn = "bg-white/15 text-white"
const barRule = <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-white/15" />

export function PictureControls({
  img,
  root,
  frameRef,
  onChange,
  onMove,
  onAlt,
  onRemove,
  onDone,
  dock,
}: {
  img: HTMLImageElement
  /**
   * On a phone, where the text is narrow and a floating bar would cover the
   * picture and its handles: a strip under the field's toolbar to hold the
   * bar instead. On a computer it floats over the picture.
   */
  dock?: HTMLElement | null
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
  const readoutRef = React.useRef<HTMLSpanElement>(null)
  const [, setTick] = React.useState(0)
  const refresh = () => setTick((n) => n + 1)
  const [ratioOpen, setRatioOpen] = React.useState(false)

  const align = (img.getAttribute("data-align") as PictureAlign | null) ?? null
  const width = pictureWidth(img)
  const ratio = pictureRatio(img)

  /* Follow the picture, every frame, straight onto the nodes. */
  React.useEffect(() => {
    let raf = 0
    const place = () => {
      const frame = frameRef.current
      const box = boxRef.current
      const bar = barRef.current
      if (frame && box && img.isConnected) {
        const f = frame.getBoundingClientRect()
        const r = img.getBoundingClientRect()
        const x = r.left - f.left
        const y = r.top - f.top
        box.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
        box.style.width = `${Math.round(r.width)}px`
        box.style.height = `${Math.round(r.height)}px`
      }
      if (frame && bar && !dock && img.isConnected) {
        const f = frame.getBoundingClientRect()
        const r = img.getBoundingClientRect()
        const x = r.left - f.left
        const y = r.top - f.top
        /* The bar centred on the picture, kept inside the text: above it when
           there is room, else below it, and only over it when neither fits,
           so it never sits on the corner handles if it can help it. */
        const bw = bar.offsetWidth
        const bh = bar.offsetHeight
        const bx = Math.max(6, Math.min(f.width - bw - 6, x + r.width / 2 - bw / 2))
        const above = y - bh - 10
        const below = y + r.height + 10
        const by = above >= 4 ? above : below + bh <= f.height - 4 ? below : Math.max(4, Math.min(f.height - bh - 4, y + 8))
        bar.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0)`
      }
      raf = requestAnimationFrame(place)
    }
    raf = requestAnimationFrame(place)
    return () => cancelAnimationFrame(raf)
  }, [img, frameRef, dock])

  /* Escape lets go; a picture that leaves the text lets go too. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDone])

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
    const move = (ev: PointerEvent) => {
      const w = startW + side * (ev.clientX - startX) * both
      const pct = Math.max(10, Math.min(100, Math.round((w / full) * 100)))
      setWidth(img, pct)
      if (readout) readout.textContent = `${pct}%`
    }
    const up = () => {
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

  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
      {/* The frame and its handles. */}
      <div
        ref={boxRef}
        data-picture-frame=""
        className="pointer-events-none absolute left-0 top-0 rounded-[10px] shadow-[0_0_0_2px_#111113,0_0_0_4px_rgba(255,255,255,0.9)]"
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

      {/* The bar: floating over the picture, or docked under the toolbar on a phone. */}
      {(() => {
        const bar = (
      <div
        ref={barRef}
        role="toolbar"
        aria-label="Picture"
        data-picture-bar=""
        onMouseDown={(e) => {
          /* The text keeps its focus and its caret while the bar is used. */
          if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault()
        }}
        data-docked={dock ? "" : undefined}
        className={cn(
          "pointer-events-auto flex items-center gap-0.5 rounded-xl bg-[#111113]/95 p-1 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          dock ? "relative mx-auto w-fit max-w-full flex-wrap justify-center" : "absolute left-0 top-0 max-w-[calc(100%-12px)] overflow-x-auto",
        )}
      >
        {(["left", "center", "right"] as const).map((a) => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight
          const name = a === "left" ? "Left" : a === "center" ? "Centre" : "Right"
          return (
            <Tip key={a} label={name}>
              <button
                type="button"
                aria-label={`Align ${name.toLowerCase()}`}
                aria-pressed={align === a}
                onClick={() => set(() => img.setAttribute("data-align", a))}
                className={cn(barButton, align === a && barOn)}
              >
                <Icon className="h-4 w-4" />
              </button>
            </Tip>
          )
        })}
        {barRule}
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
              className={cn(barButton, width === s.pct && barOn)}
            >
              {s.label}
            </button>
          </Tip>
        ))}
        {barRule}
        <div className="relative shrink-0">
          <Tip label="Shape">
            <button
              type="button"
              aria-label="Shape"
              aria-haspopup="menu"
              aria-expanded={ratioOpen}
              onClick={() => setRatioOpen((o) => !o)}
              className={cn(barButton, "gap-1 px-2", (ratio || ratioOpen) && barOn)}
            >
              {RATIOS.find((r) => r.value === ratio)?.label ?? "Original"}
              <svg aria-hidden viewBox="0 0 10 6" className="h-1.5 w-2.5"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </Tip>
        </div>
        {barRule}
        <Tip label="Move up">
          <button type="button" aria-label="Move up" onClick={() => onMove(-1)} className={barButton}>
            <ArrowUp className="h-4 w-4" />
          </button>
        </Tip>
        <Tip label="Move down">
          <button type="button" aria-label="Move down" onClick={() => onMove(1)} className={barButton}>
            <ArrowDown className="h-4 w-4" />
          </button>
        </Tip>
        {barRule}
        <Tip label="Describe it for screen readers">
          <button type="button" aria-label="Alt text" onClick={onAlt} className={cn(barButton, "px-2 tracking-wide")}>
            Alt
          </button>
        </Tip>
        <Tip label="Remove picture">
          <button type="button" aria-label="Remove picture" onClick={onRemove} className={barButton}>
            <Trash2 className="h-4 w-4" />
          </button>
        </Tip>
      </div>
        )
        return dock ? createPortal(bar, dock) : bar
      })()}

      {/* The shapes, as a short list under the bar. */}
      {ratioOpen ? (
        <RatioMenu
          barRef={barRef}
          frameRef={frameRef}
          docked={!!dock}
          value={ratio}
          onPick={(v) => {
            setRatioOpen(false)
            set(() => setRatio(img, v))
          }}
          onClose={() => setRatioOpen(false)}
        />
      ) : null}
    </TooltipPrimitive.Provider>
  )
}

function RatioMenu({
  barRef,
  frameRef,
  docked,
  value,
  onPick,
  onClose,
}: {
  barRef: React.RefObject<HTMLDivElement | null>
  frameRef: React.RefObject<HTMLDivElement | null>
  /** The bar is docked above the text: the list opens at the top of the text, under it. */
  docked: boolean
  value: string | null
  onPick: (v: string | null) => void
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    let raf = 0
    const place = () => {
      const bar = barRef.current
      const frame = frameRef.current
      const menu = ref.current
      if (bar && frame && menu) {
        const f = frame.getBoundingClientRect()
        const b = bar.getBoundingClientRect()
        const x = Math.max(6, Math.min(f.width - menu.offsetWidth - 6, b.left - f.left + b.width / 2 - menu.offsetWidth / 2))
        const below = docked ? 6 : b.bottom - f.top + 6
        const y = docked || below + menu.offsetHeight <= f.height ? below : Math.max(4, b.top - f.top - menu.offsetHeight - 6)
        menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
      }
      raf = requestAnimationFrame(place)
    }
    raf = requestAnimationFrame(place)
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !barRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("pointerdown", onDown, true)
    }
  }, [barRef, frameRef, docked, onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Shape"
      onMouseDown={(e) => e.preventDefault()}
      className="pointer-events-auto absolute left-0 top-0 z-[1] w-44 rounded-xl bg-[#111113]/95 p-1 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.18)] backdrop-blur-sm animate-in fade-in-0 zoom-in-[0.98] duration-150"
    >
      {RATIOS.map((r) => {
        const on = r.value === value
        return (
          <button
            key={r.label}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => onPick(r.value)}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10",
              on && "text-white",
            )}
          >
            <span>{r.label}</span>
            <span className="text-[12px] text-white/45">{r.value ? r.name : "As uploaded"}</span>
          </button>
        )
      })}
    </div>
  )
}
