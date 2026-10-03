"use client"

/**
 * A short line at the bottom of the screen after an action ("Link copied",
 * "Report sent", or what went wrong), the memberships screen's pill
 * (components/memberships/creator-screen.tsx): near black, rounded, gone
 * after a few seconds. One at a time; a new one replaces the last.
 */
import { useEffect, useState } from "react"

type Listener = (text: string) => void
const listeners = new Set<Listener>()

export function toast(text: string) {
  if (!text) return
  for (const l of listeners) l(text)
}

export function Toasts() {
  const [text, setText] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  useEffect(() => {
    const l: Listener = (t) => {
      setText(t)
      setKey((k) => k + 1)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  useEffect(() => {
    if (!text) return
    const t = window.setTimeout(() => setText(null), 3200)
    return () => window.clearTimeout(t)
  }, [text, key])
  if (!text) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(20px+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4" role="status" aria-live="polite">
      <div key={key} data-community-toast="" className="max-w-[420px] rounded-full bg-[#1a1a2e] px-4 py-2.5 text-center text-[14px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(17,24,39,0.35)]">
        {text}
      </div>
    </div>
  )
}
