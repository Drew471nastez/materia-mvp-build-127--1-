"use client"

import { useEffect, useState } from "react"
import { Code2, Globe, Layers, Loader2, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PREVIEW, OR THE CODE BEHIND IT
 * ===========================================================================
 *
 * The code editor existed at its own address and nothing in the product led
 * to it. It belongs where the preview is, because the code IS the preview,
 * seen the other way round — so this is a segmented control at the top of the
 * canvas: the page as visitors see it, or the files that make it.
 *
 * The code surface loads in place, in a frame, rather than in a new tab. A new
 * tab is a context switch; a panel that fades in over the canvas is the same
 * page turned over. The frame is only mounted once it is first asked for, so
 * an editor session that never opens the code never pays for it.
 */

export type PreviewMode = "preview" | "code" | "sections"

export function PreviewModeSwitch({
  mode,
  onChange,
  onSections,
  compact = false,
  thirdLabel = "Sections",
}: {
  mode: PreviewMode
  onChange: (m: PreviewMode) => void
  /** The third segment is a jump rather than a mode, so it is a callback. */
  onSections: () => void
  /** Icons only, for a phone bar: the active label is the one thing worth
   *  the room, and even that goes when there is none. */
  compact?: boolean
  /** On a phone the third segment opens Settings; on a desktop, Sections. */
  thirdLabel?: string
}) {
  const seg = (m: PreviewMode, label: string, Icon: typeof Globe, onClick?: () => void) => {
    const active = mode === m
    return (
      <button
        key={m}
        type="button"
        onClick={onClick ?? (() => onChange(m))}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full text-[13px] font-medium transition-all duration-200",
          compact ? "w-9 justify-center px-0" : "px-3",
          active
            ? "bg-[#2f5cff]/20 text-[#7da2ff] ring-1 ring-inset ring-[#2f5cff]/60"
            : "text-white/60 hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        {active && !compact && <span>{label}</span>}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.05] p-1">
      {seg("preview", "Preview", Globe)}
      <span className="mx-0.5 h-4 w-px bg-white/10" />
      {seg("code", "Code", Code2)}
      <span className="mx-0.5 h-4 w-px bg-white/10" />
      {seg("sections", thirdLabel, thirdLabel === "Settings" ? Settings : Layers, onSections)}
    </div>
  )
}

/** The code editor, in place. Mounted on first use and kept after. */
export function CodePane({ installId, visible }: { installId: string; visible: boolean }) {
  const [everShown, setEverShown] = useState(visible)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (visible) setEverShown(true)
  }, [visible])
  if (!everShown) return null
  return (
    <div
      className={cn(
        "absolute inset-0 z-20 bg-[#0f0f0f] transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!visible}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <iframe
        title="Code editor"
        src={`/website-builder/code/${installId}?embedded=1`}
        onLoad={() => setLoaded(true)}
        className={cn("h-full w-full border-0 transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}
