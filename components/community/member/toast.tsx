"use client"

/**
 * A short line at the top of the screen after an action ("Welcome to…",
 * "Link copied", or what went wrong): near black, rounded, gone after a few
 * seconds. One at a time; a new one replaces the last.
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
    const t = window.setTimeout(() => setText(null), 2600)
    return () => window.clearTimeout(t)
  }, [text, key])
  if (!text) return null
  return (
    /* Above the phone's tab bar when it is on screen inside a community (--buyer-tabs-h, app/globals.css), never under it. */
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ top: "max(calc(12px + env(safe-area-inset-top, 0px)), calc(var(--community-top, 0px) + 10px))" }}
      role="status"
      aria-live="polite"
    >
      <div
        key={key}
        data-community-toast=""
        className="max-w-[420px] rounded-full bg-[#1a1a2e]/95 px-4 py-2.5 text-center text-[14px] font-medium text-white shadow-[0_8px_28px_-10px_rgba(17,24,39,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm motion-reduce:animate-none animate-in fade-in-0 slide-in-from-top-2 duration-220 ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        {text}
      </div>
    </div>
  )
}
