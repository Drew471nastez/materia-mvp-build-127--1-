"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { PanelBottom, PanelTop } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A SECOND HEADER REPLACES THE FIRST, AFTER ASKING
 * ===========================================================================
 * A site draws one header and one footer (lib/storelib-theme/section-
 * groups.ts). Choosing a header in Add section while one is drawn would
 * otherwise put a second one on every page, so this asks once, says what
 * happens to the old one (hidden, not deleted), and does it.
 *
 * The same card as leaving the builder (../leave-confirm.tsx): portalled to
 * the body, Escape and the scrim cancel, the safe answer has the focus.
 */
export function ReplaceChromeConfirm({
  open,
  kind,
  current,
  next,
  onCancel,
  onReplace,
}: {
  open: boolean
  kind: "header" | "footer"
  /** The name of the one drawn now. */
  current: string
  /** The name of the one chosen. */
  next: string
  onCancel: () => void
  onReplace: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!open || !mounted) return null

  const Icon = kind === "header" ? PanelTop : PanelBottom
  const group = kind === "header" ? "Header" : "Footer"

  return createPortal(
    <div className="wb-leave-scrim fixed inset-0 z-[320] flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Replace the ${kind}`}
        data-replace-chrome={kind}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "wb-leave-card w-full max-w-[430px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 text-white",
          "shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]",
        )}
      >
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/80">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold leading-tight">Replace the {kind}?</h2>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/70">
              {next} becomes the {kind} on every page. {current} is hidden with its settings kept, and you can show it again from the {group} group.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="h-10 rounded-xl bg-white/[0.12] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            Replace {kind}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
