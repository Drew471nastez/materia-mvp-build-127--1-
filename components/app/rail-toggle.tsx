"use client"

import { useEffect, useState } from "react"
import { PanelLeft } from "lucide-react"
import { toggleAppRail, type RailState } from "@/lib/ui/app-rail"
import { tt } from "@/lib/i18n/text"

/**
 * Collapse or expand the sidebar: the button at the foot of the sidebar,
 * and ⌘B or Ctrl+B anywhere in /app except while typing (lib/ui/app-rail).
 */
export function RailToggle() {
  const [state, setState] = useState<RailState>("open")
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-app-rail]")
    if (root?.getAttribute("data-app-rail") === "collapsed") setState("collapsed")
    const onChange = (e: Event) => setState((e as CustomEvent<RailState>).detail)
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      toggleAppRail()
    }
    window.addEventListener("storelib:app-rail", onChange)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("storelib:app-rail", onChange)
      window.removeEventListener("keydown", onKey)
    }
  }, [])
  const label = state === "collapsed" ? tt("Expand navigation") : tt("Collapse navigation")
  return (
    <button
      type="button"
      onClick={() => toggleAppRail()}
      aria-label={label}
      aria-expanded={state === "open"}
      title={`${label} (⌘B)`}
      data-rail-toggle=""
      className="flex h-[34px] w-full items-center gap-2 rounded-[10px] px-[14px] text-[13px] text-neutral-500 outline-none transition-colors duration-150 hover:bg-neutral-100/80 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-300"
    >
      <PanelLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      <span data-nav-label="" className="whitespace-nowrap">{tt("Collapse")}</span>
    </button>
  )
}
