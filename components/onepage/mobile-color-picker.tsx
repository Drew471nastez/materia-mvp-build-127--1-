"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
  presets?: string[]
}

const DEFAULT_PRESETS = ["#111827", "#7c3aed", "#ec4899", "#22c55e", "#3b82f6"]
const hexRegex = /^#[0-9A-Fa-f]{6}$/

function hslToHex(h: number, s: number, l: number) {
  const hh = h / 360
  const ss = s / 100
  const ll = l / 100

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q

  const hue2rgb = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }

  const r = Math.round(hue2rgb(hh + 1 / 3) * 255)
  const g = Math.round(hue2rgb(hh) * 255)
  const b = Math.round(hue2rgb(hh - 1 / 3) * 255)

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

export function MobileColorPicker({ value, onChange, label = "Choose color", className, presets = DEFAULT_PRESETS }: Props) {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const [renderSheet, setRenderSheet] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [hex, setHex] = useState(value)
  const [dragColor, setDragColor] = useState(value)

  useEffect(() => {
    setMounted(true)
    const update = () => setIsMobile(window.matchMedia("(max-width: 767px)").matches)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => setHex(value), [value])

  useEffect(() => {
    if (open) {
      setRenderSheet(true)
      setIsClosing(false)
    } else if (renderSheet) {
      setIsClosing(true)
      const t = setTimeout(() => {
        setRenderSheet(false)
        setIsClosing(false)
      }, 260)
      return () => clearTimeout(t)
    }
  }, [open, renderSheet])

  const validHex = useMemo(() => (hexRegex.test(hex) ? hex : null), [hex])

  const applyFromPoint = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top))

    const hue = (x / rect.width) * 360
    const lightness = 100 - (y / rect.height) * 100
    const color = hslToHex(hue, 90, Math.max(8, Math.min(92, lightness)))

    setDragColor(color)
    setHex(color)
    onChange(color)
  }

  const sheet = mounted && renderSheet && isMobile
    ? createPortal(
        <div className="fixed inset-0 z-[150] md:hidden">
          <button
            className={cn(
              "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-250",
              isClosing ? "opacity-0" : "opacity-100",
            )}
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-2xl transition-transform duration-250 ease-out will-change-transform",
              isClosing ? "translate-y-full" : "translate-y-0",
            )}
          >
            <div className="mx-auto mt-2 mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
            <div className="flex items-center justify-between px-4 pb-2">
              <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
              <button className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-4 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                {presets.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onChange(c)
                      setHex(c)
                      setDragColor(c)
                    }}
                    className={cn(
                      "h-11 w-11 rounded-full border-2 transition-transform",
                      value.toLowerCase() === c.toLowerCase() ? "border-gray-900 scale-105" : "border-gray-200",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <div
                className="relative h-44 rounded-2xl border border-gray-200 overflow-hidden touch-none"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000), linear-gradient(to top, #000, transparent 55%, #fff)",
                }}
                onPointerDown={(e) => {
                  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
                  applyFromPoint(e.clientX, e.clientY, e.currentTarget)
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return
                  applyFromPoint(e.clientX, e.clientY, e.currentTarget)
                }}
              >
                <div className="absolute right-3 top-3 rounded-full px-2 py-1 text-[11px] font-medium bg-black/60 text-white">
                  Touch to pick
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl border border-gray-200" style={{ backgroundColor: validHex || dragColor || value }} />
                <input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-11 flex-1 rounded-xl border border-gray-200 px-3 font-mono text-sm"
                  placeholder="#7c3aed"
                />
                <button
                  type="button"
                  onClick={() => { if (validHex) onChange(validHex) }}
                  disabled={!validHex}
                  className="h-11 px-4 rounded-xl bg-black text-white text-sm font-medium disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <div className={cn("relative", className)}>
        {!isMobile && (
          <input
            type="color"
            value={hexRegex.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
        <button
          type="button"
          onClick={() => isMobile && setOpen(true)}
          className={cn("w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm", isMobile && "cursor-pointer")}
          style={{ backgroundColor: value }}
        />
      </div>
      {sheet}
    </>
  )
}
