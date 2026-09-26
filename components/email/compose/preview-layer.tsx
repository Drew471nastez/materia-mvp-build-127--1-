"use client"

/**
 * ===========================================================================
 *  THE EMAIL AS IT ARRIVES, ON A SCREEN OF ITS OWN
 * ===========================================================================
 * Below 1024px there is no room for the preview beside the writing, and it
 * used to be the other half of a Write | Preview switch at the top of the
 * page that swapped the two in one frame: "the animation is too direct and I
 * don't like the UI and how you switch between them."
 *
 * Now writing is the page, and the preview is a place you go to and come
 * back from. Preview (at the foot of the page on a phone, beside Send on a
 * tablet) raises the email over the whole screen from the bottom edge, the
 * way an iOS sheet comes up, and Done takes it back down, to the writing
 * exactly as it was left: same scroll, same caret. From 1024px the preview
 * is beside the writing all the time (./composer.tsx) and none of this is
 * drawn.
 *
 * What it shows is the preview component (./email-preview.tsx): the line
 * the inbox shows, then the email's real HTML in a sandboxed frame. At phone
 * size it is life size, the screen being the phone; on a wider screen it is
 * drawn in a phone's frame, and Desktop shows the 600px email scaled to fit.
 *
 * The move is transform only, on the compositor (element.animate): 340ms on
 * the iOS sheet curve up, 260ms down. With reduced motion it fades in 120ms.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { EmailPreview, type PreviewMode } from "./email-preview"
import { Segmented } from "./ui"

export const PREVIEW_IN_MS = 340
export const PREVIEW_OUT_MS = 260
export const PREVIEW_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export interface PreviewLayerProps {
  open: boolean
  onClose: () => void
  html: string
  senderName: string
  subject: string
  previewText: string
  mode: PreviewMode
  onMode: (m: PreviewMode) => void
}

export function PreviewLayer({ open, onClose, mode, onMode, ...preview }: PreviewLayerProps) {
  const [mounted, setMounted] = React.useState(open)
  const ref = React.useRef<HTMLDivElement>(null)
  const doneRef = React.useRef<HTMLButtonElement>(null)
  const returnFocus = React.useRef<HTMLElement | null>(null)
  const shownFor = React.useRef(false)

  if (open && !mounted) setMounted(true)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (open && !shownFor.current) {
      shownFor.current = true
      returnFocus.current = document.activeElement as HTMLElement | null
      el.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], {
        duration: reduced ? 120 : PREVIEW_IN_MS,
        easing: PREVIEW_EASE,
        fill: "backwards",
      })
      doneRef.current?.focus({ preventScroll: true })
    } else if (!open && shownFor.current) {
      shownFor.current = false
      const move = el.animate(reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], {
        duration: reduced ? 120 : PREVIEW_OUT_MS,
        easing: PREVIEW_EASE,
        fill: "forwards",
      })
      const done = () => {
        setMounted(false)
        returnFocus.current?.focus?.({ preventScroll: true })
      }
      move.onfinish = done
      move.oncancel = done
    }
  }, [open, mounted])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!mounted || typeof document === "undefined") return null
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Preview"
      data-preview-layer=""
      data-open={open ? "true" : "false"}
      className="fixed inset-0 z-[70] flex flex-col bg-[#f4f5f7] will-change-transform"
    >
      <header className="shrink-0 border-b border-[#e5e7eb] bg-white pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 w-full max-w-[760px] items-center gap-2 px-4">
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-[#1a1a2e]">Preview</h2>
          <Segmented
            label="Preview size"
            value={mode}
            onChange={onMode}
            className="h-9 [&>button]:min-w-[64px]"
            options={[
              { value: "mobile", label: "Phone" },
              { value: "desktop", label: "Desktop" },
            ]}
          />
          <button
            ref={doneRef}
            type="button"
            onClick={onClose}
            data-preview-done=""
            className="-mr-2 inline-flex h-11 cursor-pointer items-center rounded-[10px] px-3 text-[16px] font-semibold text-[#1a1a2e] transition-colors duration-100 hover:bg-[#eef0f2] active:bg-[#e4e6ea] [-webkit-tap-highlight-color:transparent]"
          >
            Done
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
        <div
          className={cn(
            "mx-auto w-full overflow-hidden bg-white",
            mode === "mobile" ? "sm:my-6 sm:max-w-[390px] sm:rounded-[32px] sm:border sm:border-[#e5e7eb] sm:shadow-[0_24px_60px_-24px_rgba(17,24,39,0.35)]" : "max-w-[760px] sm:my-6 sm:rounded-2xl sm:border sm:border-[#e5e7eb]",
          )}
        >
          <EmailPreview bare fit mode={mode} onMode={onMode} {...preview} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
