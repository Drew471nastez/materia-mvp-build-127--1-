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

const DEFAULT_PRESETS = [
  "#000000", "#ffffff", "#7c3aed", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#6b7280",
]

const hexRegex = /^#[0-9A-Fa-f]{6}$/

export function MobileColorPicker({ value, onChange, label = "Choose color", className, presets = DEFAULT_PRESETS }: Props) {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)

  useEffect(() => {
    setMounted(true)
    const update = () => setIsMobile(window.matchMedia("(max-width: 767px)").matches)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => setHex(value), [value])

  const validHex = useMemo(() => (hexRegex.test(hex) ? hex : null), [hex])

  const sheet = mounted && open && isMobile
    ? createPortal(
        <div className="fixed inset-0 z-[150] md:hidden">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="mx-auto mt-2 mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
            <div className="flex items-center justify-between px-4 pb-2">
              <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
              <button className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-4">
              <div className="grid grid-cols-6 gap-2">
                {presets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { onChange(c); setHex(c) }}
                    className={cn("h-10 w-full rounded-xl border-2", value.toLowerCase() === c.toLowerCase() ? "border-gray-900" : "border-gray-200")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl border border-gray-200" style={{ backgroundColor: validHex || value }} />
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
