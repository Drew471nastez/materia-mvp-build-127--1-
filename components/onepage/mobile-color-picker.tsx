"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
  presets?: string[]
}

const DEFAULT_PRESETS = [
  "#7c3aed", "#ec4899", "#3b82f6", "#22c55e", "#f59e0b",
]

const hexRegex = /^#[0-9A-Fa-f]{6}$/

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/* ── HSV ↔ Hex conversions ── */
function hexToHsv(hex: string) {
  const safe = hexRegex.test(hex) ? hex : "#7c3aed"
  const r = parseInt(safe.slice(1, 3), 16) / 255
  const g = parseInt(safe.slice(3, 5), 16) / 255
  const b = parseInt(safe.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: h * 360, s: s * 100, v: v * 100 }
}

function hsvToHex(h: number, s: number, v: number) {
  const hh = clamp(h, 0, 360) / 360
  const ss = clamp(s, 0, 100) / 100
  const vv = clamp(v, 0, 100) / 100
  const i = Math.floor(hh * 6)
  const f = hh * 6 - i
  const p = vv * (1 - ss)
  const q = vv * (1 - f * ss)
  const t = vv * (1 - (1 - f) * ss)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = vv; g = t; b = p; break
    case 1: r = q; g = vv; b = p; break
    case 2: r = p; g = vv; b = t; break
    case 3: r = p; g = q; b = vv; break
    case 4: r = t; g = p; b = vv; break
    case 5: r = vv; g = p; b = q; break
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function MobileColorPicker({ value, onChange, label = "Choose color", className, presets = DEFAULT_PRESETS }: Props) {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)

  // HSV state for the 2D picker
  const [hue, setHue] = useState(0)
  const [sat, setSat] = useState(100)
  const [val, setVal] = useState(100)

  // Bottom sheet animation - GPU accelerated
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)

  // Top notification state
  const [showNotification, setShowNotification] = useState(false)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs for canvas interaction
  const canvasRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const update = () => setIsMobile(window.matchMedia("(max-width: 767px)").matches)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    setHex(value)
    const hsv = hexToHsv(value)
    setHue(hsv.h)
    setSat(hsv.s)
    setVal(hsv.v)
  }, [value])

  const currentHex = useMemo(() => hsvToHex(hue, sat, val), [hue, sat, val])
  const validHex = useMemo(() => (hexRegex.test(hex) ? hex : null), [hex])

  // Store previous overscroll values for proper restoration
  const prevOverscrollRef = useRef({ html: '', body: '' })

  const openSheet = useCallback(() => {
    setOpen(true)
    setIsVisible(true)
    // Save current values before overriding
    prevOverscrollRef.current = {
      html: document.documentElement.style.overscrollBehavior,
      body: document.body.style.overscrollBehavior,
    }
    // Prevent pull-to-refresh on iOS/Android
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.style.overscrollBehavior = 'none'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    })
  }, [])

  const closeSheet = useCallback(() => {
    setIsAnimating(false)
    setDragY(0)
    setIsDragging(false)
    velocityRef.current = 0
    setTimeout(() => {
      setIsVisible(false)
      setOpen(false)
      // Restore previous values instead of empty string
      document.documentElement.style.overscrollBehavior = prevOverscrollRef.current.html
      document.body.style.overscrollBehavior = prevOverscrollRef.current.body
    }, 380)
  }, [])

  // Sheet drag handlers with velocity tracking
  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    startYRef.current = touch.clientY
    lastYRef.current = touch.clientY
    lastTimeRef.current = Date.now()
    velocityRef.current = 0
    setIsDragging(true)
  }, [])

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      // Track velocity
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      // Apply resistance
      const resisted = diff <= 140 ? diff * 0.85 : 119 + (diff - 140) * 0.35
      setDragY(resisted)
    }
  }, [isDragging])

  const handleSheetTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    // Close if dragged far enough or fast enough
    if (dragY > 80 || velocityRef.current > 0.5) {
      closeSheet()
    } else {
      setDragY(0)
    }
  }, [isDragging, dragY, closeSheet])

  // 2D color area touch handler
  const handleCanvasInteraction = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((clientY - rect.top) / rect.height, 0, 1)
    setSat(x * 100)
    setVal((1 - y) * 100)
  }, [])

  // Hue strip touch handler
  const handleHueInteraction = useCallback((clientX: number) => {
    if (!hueRef.current) return
    const rect = hueRef.current.getBoundingClientRect()
    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    setHue(x * 360)
  }, [])

  const applyColor = useCallback((hex: string) => {
    onChange(hex)
    setHex(hex)
    const hsv = hexToHsv(hex)
    setHue(hsv.h)
    setSat(hsv.s)
    setVal(hsv.v)
  }, [onChange])

  // Show top notification
  const showAppliedNotification = useCallback(() => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    setShowNotification(false)
    requestAnimationFrame(() => {
      setShowNotification(true)
      notificationTimerRef.current = setTimeout(() => {
        setShowNotification(false)
      }, 2000)
    })
  }, [])

  // Done: close sheet smoothly
  const handleDone = useCallback(() => {
    closeSheet()
  }, [closeSheet])

  // Apply: apply color + show notification
  const handleApply = useCallback(() => {
    applyColor(currentHex)
    showAppliedNotification()
    closeSheet()
  }, [applyColor, currentHex, showAppliedNotification, closeSheet])

  // Cleanup
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    }
  }, [])

  const notification = mounted
    ? createPortal(
        <div
          className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-3 left-0 right-0 z-[200] flex justify-center pointer-events-none"
        >
          <div
            className="pointer-events-auto px-5 py-3 rounded-2xl bg-black/90 backdrop-blur-lg shadow-2xl flex items-center gap-2.5 whitespace-nowrap"
            style={{
              transform: showNotification ? 'translateY(0)' : 'translateY(-100%)',
              opacity: showNotification ? 1 : 0,
              transition: 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 350ms cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform, opacity',
            }}
          >
            <Check className="h-4 w-4 text-white" strokeWidth={3} />
            <span className="text-[13px] font-semibold text-white">Color applied</span>
          </div>
        </div>,
        document.body,
      )
    : null

  const sheet = mounted && isVisible && isMobile
    ? createPortal(
        <div className="fixed inset-0 z-[150] md:hidden" style={{ willChange: 'auto' }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 scrim-graduated"
            style={{
              opacity: isAnimating ? 1 : 0,
              transition: isDragging ? 'none' : 'opacity 380ms cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'opacity',
            }}
            onClick={closeSheet}
          />
          {/* Bottom Sheet - GPU accelerated */}
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white shadow-2xl"
            style={{
              transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
              transition: isDragging ? 'none' : 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Handle */}
            <div
              className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none"
              data-sheet-handle
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
            >
              <div className="h-[5px] w-10 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <h4 className="text-[15px] font-semibold text-gray-900">{label}</h4>
              <button
                className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                onClick={handleDone}
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-6 space-y-5">
              {/* 2D Saturation/Value picker */}
              <div
                ref={canvasRef}
                className="relative h-[180px] rounded-2xl overflow-hidden touch-none"
                style={{
                  backgroundColor: `hsl(${hue}, 100%, 50%)`,
                }}
                onTouchStart={(e) => {
                  e.stopPropagation()
                  handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY)
                }}
                onTouchMove={(e) => {
                  e.stopPropagation()
                  handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY)
                }}
                onMouseDown={(e) => handleCanvasInteraction(e.clientX, e.clientY)}
              >
                {/* White → transparent gradient (left to right) */}
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
                />
                {/* Transparent → black gradient (top to bottom) */}
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
                />
                {/* Picker dot */}
                <div
                  className="absolute w-6 h-6 rounded-full border-[3px] border-white shadow-lg pointer-events-none"
                  style={{
                    left: `${sat}%`,
                    top: `${100 - val}%`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: currentHex,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.25)',
                  }}
                />
              </div>

              {/* Hue strip */}
              <div
                ref={hueRef}
                className="relative h-[36px] rounded-full overflow-hidden touch-none"
                style={{
                  background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                }}
                onTouchStart={(e) => {
                  e.stopPropagation()
                  handleHueInteraction(e.touches[0].clientX)
                }}
                onTouchMove={(e) => {
                  e.stopPropagation()
                  handleHueInteraction(e.touches[0].clientX)
                }}
                onMouseDown={(e) => handleHueInteraction(e.clientX)}
              >
                {/* Hue indicator */}
                <div
                  className="absolute top-1/2 w-7 h-7 rounded-full border-[3px] border-white shadow-lg pointer-events-none"
                  style={{
                    left: `${(hue / 360) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: `hsl(${hue}, 100%, 50%)`,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.25)',
                  }}
                />
              </div>

              {/* Preview + Presets row */}
              <div className="flex items-center gap-3">
                {/* Current color preview */}
                <div
                  className="w-11 h-11 rounded-full border-2 border-gray-200 shadow-sm shrink-0"
                  style={{ backgroundColor: currentHex }}
                />
                {/* 5 Preset circles */}
                <div className="flex items-center gap-2 flex-1 justify-center">
                  {presets.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => applyColor(c)}
                      className={cn(
                        "w-9 h-9 rounded-full transition-all duration-150 shrink-0",
                        value.toLowerCase() === c.toLowerCase()
                          ? "ring-2 ring-offset-2 ring-gray-900 scale-110"
                          : "ring-1 ring-gray-200 hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Hex input + buttons */}
              <div className="flex items-center gap-3">
                <input
                  value={hex}
                  onChange={(e) => {
                    const v = e.target.value
                    setHex(v)
                    if (hexRegex.test(v)) {
                      const hsv = hexToHsv(v)
                      setHue(hsv.h)
                      setSat(hsv.s)
                      setVal(hsv.v)
                    }
                  }}
                  className="h-12 flex-1 rounded-2xl border border-gray-200 px-4 font-mono text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="#7c3aed"
                />
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-12 px-6 rounded-2xl bg-violet-600 text-white text-sm font-semibold transition-all active:scale-[0.97] hover:bg-violet-700"
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
          onClick={() => isMobile && openSheet()}
          className={cn("w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm", isMobile && "cursor-pointer")}
          style={{ backgroundColor: value }}
        />
      </div>
      {notification}
      {sheet}
    </>
  )
}
