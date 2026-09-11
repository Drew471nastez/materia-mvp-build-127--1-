"use client"

// The colour chip and picker the design panels share. Moved out of the
// editor page so the Colors panel, the Typography panel and the section
// design panel can all use it.
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const POPUP_W = 230
  const POPUP_H = 320

  // Current HSV state derived from the hex value (keeps the marker
  // positions stable while editing even when the hex rounding changes
  // the visible color slightly).
  const isTransparent = !value || value === "transparent"
  const initial = isTransparent ? { r: 92, g: 91, b: 99 } : hexToRgb(value)
  const [hsv, setHsv] = useState(() => rgbToHsv(initial.r, initial.g, initial.b))
  const [hexInput, setHexInput] = useState(isTransparent ? "" : value.toUpperCase())

  // Re-sync from prop value whenever it changes externally
  useEffect(() => {
    if (isTransparent) return
    const rgb = hexToRgb(value)
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b)
    setHsv(next)
    setHexInput(value.toUpperCase())
  }, [value, isTransparent])

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
      // Align popup's right edge ~12 px past the trigger's right so the
      // chevron sits at the top-right corner of the popup.
      let left = r.right - POPUP_W + 12
      if (left < 8) left = 8
      if (left + POPUP_W > vw - 8) left = vw - POPUP_W - 8
      // Open just below the trigger; flip up if it would overflow.
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

  // Commit a new HSV state to both local state and the parent via hex
  const commit = useCallback((next: { h: number; s: number; v: number }) => {
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    setHexInput(hex.toUpperCase())
    onChange(hex)
  }, [onChange])

  // Saturation/value box drag handling
  const handleSvPoint = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height))
    commit({ h: hsv.h, s: x, v: 1 - y })
  }, [commit, hsv.h])

  const onSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    handleSvPoint(e.clientX, e.clientY)
  }
  const onSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleSvPoint(e.clientX, e.clientY)
  }

  // Hue slider drag handling
  const handleHuePoint = useCallback((clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    commit({ h: x * 360, s: hsv.s, v: hsv.v })
  }, [commit, hsv.s, hsv.v])

  const onHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    handleHuePoint(e.clientX)
  }
  const onHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleHuePoint(e.clientX)
  }

  // Hex text input — only commit when it's a valid hex
  const onHexInputChange = (v: string) => {
    setHexInput(v)
    const clean = v.startsWith("#") ? v : "#" + v
    if (/^#[0-9a-f]{6}$/i.test(clean)) {
      const rgb = hexToRgb(clean)
      commit(rgbToHsv(rgb.r, rgb.g, rgb.b))
    }
  }

  const pureHue = hsvToHex(hsv.h, 1, 1)
  const markerLeft = `${hsv.s * 100}%`
  const markerTop  = `${(1 - hsv.v) * 100}%`
  const hueLeft    = `${(hsv.h / 360) * 100}%`
  const swatchColor = isTransparent ? "transparent" : hsvToHex(hsv.h, hsv.s, hsv.v)

  const popup = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popupRef}
      className="fixed z-[200] w-[230px] bg-white border border-border rounded-xl shadow-2xl p-2.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Saturation/value box */}
      <div
        ref={svRef}
        className="relative h-[120px] w-full rounded-md overflow-hidden cursor-crosshair touch-none select-none"
        style={{
          background: `
            linear-gradient(to top, #000, rgba(0,0,0,0)),
            linear-gradient(to right, #fff, rgba(255,255,255,0)),
            ${pureHue}
          `,
        }}
        onPointerDown={onSvPointerDown}
        onPointerMove={onSvPointerMove}
      >
        <div
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: markerLeft,
            top: markerTop,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="relative mt-2.5 h-2.5 w-full rounded-full cursor-pointer touch-none select-none"
        style={{
          background: "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
        onPointerDown={onHuePointerDown}
        onPointerMove={onHuePointerMove}
      >
        <div
          className="absolute top-1/2 h-4 w-4 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: hueLeft,
            transform: "translate(-50%, -50%)",
            background: pureHue,
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          }}
        />
      </div>

      {/* Hex input with swatch preview */}
      <div className="mt-2.5 flex items-center gap-2 h-9 px-2 border border-border rounded-lg bg-muted/20">
        <span
          className="h-5 w-5 rounded border border-border shrink-0"
          style={{
            background: isTransparent
              ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
              : swatchColor,
          }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={e => onHexInputChange(e.target.value)}
          className="flex-1 h-full text-[12px] bg-transparent border-0 tabular-nums uppercase focus:outline-none"
          placeholder="#FFFFFF"
        />
      </div>

      {existing.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Existing colors</p>
          <div className="grid grid-cols-8 gap-1">
            {existing.map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                onClick={() => { onChange(c); setOpen(false) }}
                className="h-5 w-5 rounded border border-border hover:scale-110 transition-transform"
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { onChange("transparent"); setOpen(false) }}
        className="mt-2.5 w-full h-8 flex items-center justify-center gap-1.5 text-[12px] font-medium border border-border rounded-lg hover:bg-muted transition-colors"
      >
        <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 6px 6px" }} />
        Don&apos;t apply any color
      </button>
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

