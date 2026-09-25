"use client"

// The colour chip and picker the design panels share. Moved out of the
// editor page so the Colors panel, the Typography panel and the section
// design panel can all use it.
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Pipette } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFrameCommit } from "./use-frame-commit"

// ── HSV ↔ HEX helpers ────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) h = h.split("").map(c => c + c).join("")
  if (h.length !== 6 || !/^[0-9a-f]+$/i.test(h)) return { r: 0, g: 0, b: 0 }
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => {
    const x = Math.max(0, Math.min(255, Math.round(n))).toString(16)
    return x.length === 1 ? "0" + x : x
  }
  return "#" + to(r) + to(g) + to(b)
}
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}
function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

/**
 * ===========================================================================
 *  THE PICKER ITSELF, WITH NOWHERE TO BE
 * ===========================================================================
 * The saturation box, the hue slider, the hex field and the page's own
 * colours: the whole of what a person uses. It knows nothing about where it
 * is drawn. ColorChip below puts it in a portal that floats over the design
 * panels; ColorField on the creator page puts it IN THE FLOW of a dialog,
 * because a portal inside a modal dialog is not reachable — Radix sets
 * `pointer-events: none` on everything outside the dialog and closes it on a
 * click there, so a floating popup is both unclickable and a way to dismiss
 * the form you were filling in. Which is what "the colour picker does not
 * work" was.
 *
 * One picker, two homes, and the picker is the part that must not drift.
 */
export function ColorPickerPanel({
  value,
  onChange,
  existing,
  onDone,
  className,
  against,
}: {
  value: string
  onChange: (v: string) => void
  existing: string[]
  /** Called after a choice that ends the interaction: a swatch, or clearing. */
  onDone?: () => void
  className?: string
  /** The colour this one is read on, for the contrast line under the field. */
  against?: { label: string; color: string }
}) {
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  const isTransparent = !value || value === "transparent"
  const initial = isTransparent ? { r: 92, g: 91, b: 99 } : hexToRgb(value)
  const [hsv, setHsv] = useState(() => rgbToHsv(initial.r, initial.g, initial.b))
  const [hexInput, setHexInput] = useState(isTransparent ? "" : value.toUpperCase())

  /**
   * The handle moves at the finger's rate, the document at the screen's:
   * `onChange` rewrites a theme setting and repaints the canvas, and it was
   * being called once per `pointermove`. See use-frame-commit.ts.
   */
  const { emit: send, flush } = useFrameCommit(onChange)

  /** The last colour WE sent, so its echo does not reset the picker. */
  const sent = useRef<string | null>(null)
  const emit = useCallback((hex: string) => {
    sent.current = hex
    send(hex)
  }, [send])

  useEffect(() => {
    if (isTransparent) return
    /**
     * OUR OWN VALUE COMING BACK IS NOT A NEW VALUE.
     *
     * Hue and saturation do not survive the round trip through a hex: every
     * colour with v=0 is #000000, and reading that back gives h=0, s=0. So
     * dragging to the bottom of the box threw the hue away and snapped the
     * handle into the corner, and the picker fought whoever was using it.
     * The colour is the same colour; the state that produced it is finer
     * than the string, and it is kept.
     */
    if (sent.current && value.toLowerCase() === sent.current.toLowerCase()) return
    sent.current = null
    const rgb = hexToRgb(value)
    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b))
    setHexInput(value.toUpperCase())
  }, [value, isTransparent])

  const commit = useCallback((next: { h: number; s: number; v: number }) => {
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    setHexInput(hex.toUpperCase())
    emit(hex)
  }, [emit])

  const handleSvPoint = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height))
    commit({ h: hsv.h, s: x, v: 1 - y })
  }, [commit, hsv.h])

  const handleHuePoint = useCallback((clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    commit({ h: x * 360, s: hsv.s, v: hsv.v })
  }, [commit, hsv.s, hsv.v])

  const onHexInputChange = (v: string) => {
    setHexInput(v)
    const clean = normalizeHex(v)
    if (clean) {
      const rgb = hexToRgb(clean)
      commit(rgbToHsv(rgb.r, rgb.g, rgb.b))
    }
  }

  /**
   * THE SCREEN'S OWN EYEDROPPER, where the browser has one (Chrome and Edge
   * on a computer): pick a colour off anything on the screen, the canvas
   * included. Where there is none the button is simply not drawn.
   */
  const [canDrop, setCanDrop] = useState(false)
  useEffect(() => { setCanDrop(typeof window !== "undefined" && "EyeDropper" in window) }, [])
  const dropper = async () => {
    try {
      const Dropper = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
      const { sRGBHex } = await new Dropper().open()
      const clean = normalizeHex(sRGBHex)
      if (!clean) return
      const rgb = hexToRgb(clean)
      commit(rgbToHsv(rgb.r, rgb.g, rgb.b))
      flush()
    } catch {
      /* Escape pressed, or the browser refused: nothing changes. */
    }
  }

  const pureHue = hsvToHex(hsv.h, 1, 1)
  const swatchColor = isTransparent ? "transparent" : hsvToHex(hsv.h, hsv.s, hsv.v)
  const ratio = against && !isTransparent ? contrastBetween(swatchColor, against.color) : null

  return (
    <div className={className} onMouseDown={(e) => e.stopPropagation()}>
      {/* Saturation/value box */}
      <div
        ref={svRef}
        data-sheet-no-drag
        className="relative h-[120px] w-full rounded-md overflow-hidden cursor-crosshair touch-none select-none"
        style={{
          background: `
            linear-gradient(to top, #000, rgba(0,0,0,0)),
            linear-gradient(to right, #fff, rgba(255,255,255,0)),
            ${pureHue}
          `,
        }}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleSvPoint(e.clientX, e.clientY) }}
        onPointerMove={(e) => { if (e.buttons === 1) handleSvPoint(e.clientX, e.clientY) }}
        /* The last position of a drag is the one that matters, and it must
           not be left sitting in a frame that never runs because the picker
           closed on the same gesture. */
        onPointerUp={flush}
        onPointerCancel={flush}
      >
        <div
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        data-sheet-no-drag
        className="relative mt-2.5 h-2.5 w-full rounded-full cursor-pointer touch-none select-none"
        style={{
          background: "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleHuePoint(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons === 1) handleHuePoint(e.clientX) }}
        onPointerUp={flush}
        onPointerCancel={flush}
      >
        <div
          className="absolute top-1/2 h-4 w-4 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            transform: "translate(-50%, -50%)",
            background: pureHue,
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          }}
        />
      </div>

      {/* Hex, with the swatch it makes and the screen's eyedropper beside it */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-2 focus-within:border-[#9ca3af] focus-within:ring-2 focus-within:ring-black/5">
          <span
            className="h-5 w-5 rounded border border-black/10 shrink-0"
            style={{
              background: isTransparent
                ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
                : swatchColor,
            }}
          />
          <input
            type="text"
            value={hexInput}
            aria-label="Hex colour"
            spellCheck={false}
            onChange={e => onHexInputChange(e.target.value)}
            onBlur={() => { if (!normalizeHex(hexInput)) setHexInput(isTransparent ? "" : swatchColor.toUpperCase()) }}
            onKeyDown={e => { if (e.key === "Enter") { flush(); (e.target as HTMLInputElement).blur() } }}
            className="min-w-0 flex-1 h-full font-mono text-[12px] bg-transparent border-0 tabular-nums uppercase focus:outline-none"
            placeholder="#FFFFFF"
          />
        </div>
        {canDrop && (
          <button
            type="button"
            onClick={() => void dropper()}
            aria-label="Pick a colour from the screen"
            title="Pick from the screen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a2e]"
          >
            <Pipette className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* How it reads on what it sits on, where that is known. */}
      {against && ratio !== null && (
        <p className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-[#6b7280]" data-contrast-line="">
          <span className="truncate">On {against.label.toLowerCase()}</span>
          <span className={cn("shrink-0 tabular-nums", ratio < 4.5 ? "font-medium text-[#b45309]" : "text-[#1a1a2e]")}>
            {(Math.round(ratio * 10) / 10).toFixed(1)} : 1{ratio < 4.5 ? (ratio < 3 ? ", hard to read" : ", large text only") : ""}
          </span>
        </p>
      )}

      {existing.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10.5px] font-medium text-muted-foreground mb-1">In this scheme</p>
          <div className="grid grid-cols-8 gap-1">
            {existing.map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                onClick={() => { onChange(c); onDone?.() }}
                className="h-5 w-5 rounded border border-black/10 hover:scale-110 transition-transform"
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { onChange("transparent"); onDone?.() }}
        className="mt-2.5 w-full h-8 flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#4b5563] border border-[#e5e7eb] rounded-lg bg-white hover:bg-[#f6f7f8] transition-colors"
      >
        <span className="inline-block h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 6px 6px" }} />
        No color
      </button>
    </div>
  )
}

/** "#abc", "abc", "#AABBCC" or "aabbcc" to "#aabbcc"; anything else to null. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, "")
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split("").map((c) => c + c).join("")}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`.toLowerCase()
  return null
}

/** The WCAG ratio between two hex colours. */
function contrastBetween(a: string, b: string): number | null {
  const x = normalizeHex(a)
  const y = normalizeHex(b)
  if (!x || !y) return null
  const lum = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    const f = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const la = lum(x)
  const lb = lum(y)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── Pretty color picker dropdown (chevron + popup) ───────────
// Uses a portal + fixed positioning so the popup floats above every
// sidebar scroller and isn't clipped by the parent `overflow-y-auto`.
export function ColorChip({
  value,
  onChange,
  existing,
}: {
  value: string
  onChange: (v: string) => void
  existing: string[]
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const POPUP_W = 230
  const POPUP_H = 320

  const isTransparent = !value || value === "transparent"

  // Position the popup BELOW the trigger (slightly offset to the left so
  // the trigger chevron sits at the top-right edge of the popup, matching
  // the mock). Keep it on-screen on all sides.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = r.right - POPUP_W + 12
      if (left < 8) left = 8
      if (left + POPUP_W > vw - 8) left = vw - POPUP_W - 8
      let top = r.bottom + 6
      if (top + POPUP_H > vh - 8) {
        top = r.top - POPUP_H - 6
        if (top < 8) top = 8
      }
      setPos({ top, left })
    }
    update()
    const onScroll = () => update()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const popup = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popupRef}
      className="fixed z-[200] w-[230px] bg-white border border-border rounded-xl shadow-2xl p-2.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <ColorPickerPanel value={value} onChange={onChange} existing={existing} onDone={() => setOpen(false)} />
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 h-7 px-1.5 rounded border border-border hover:border-foreground/30 transition-colors cursor-pointer"
        aria-label="Pick color"
      >
        <span
          className="h-5 w-5 rounded-full border border-border shrink-0"
          style={{
            background: isTransparent
              ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
              : value,
          }}
        />
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {popup}
    </>
  )
}
