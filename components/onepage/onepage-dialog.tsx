"use client"

/**
 * ===========================================================================
 *  ONE DIALOG FOR WHAT A OnePage OPENS OVER ITSELF
 * ===========================================================================
 * Share, Subscribe, and the Terms and Privacy policy a visitor reads from the
 * footer all open through this. On a phone it is the app's own sheet
 * (components/ui/bottom-sheet): the same rise, drag and flick as every sheet
 * in Storelib. From 640px it is a centred card that fades and settles in.
 * Only one of the two is ever mounted, chosen by the width of the window the
 * page is drawn in (the editor's phone preview is a phone).
 *
 * THE PAGE'S OWN LIGHT. A dark page opens a dark card and a light page a
 * white one: `dark` picks one set of colours, handed to everything inside
 * as --sheet-* variables (and --legal-*, which the legal text reads), so no
 * part of the card is drawn in a colour of its own.
 *
 * ONE SURFACE, NO CORNERS SHOWING THROUGH. The card's colour is the card's
 * own background and its corners are its own: nothing inside is drawn edge
 * to edge in another colour behind the same radius, which is what left a
 * white hairline around the share card's coloured top.
 */
import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

const LIGHT = {
  "--sheet-bg": "#ffffff",
  "--sheet-ink": "#1a1a2e",
  "--sheet-body": "#374151",
  "--sheet-muted": "#6b7280",
  "--sheet-rule": "#eef0f2",
  "--sheet-field": "#f3f4f6",
  "--sheet-hover": "#f3f4f6",
  "--sheet-on-ink": "#ffffff",
  "--sheet-error": "#dc2626",
}
const DARK = {
  "--sheet-bg": "#18181c",
  "--sheet-ink": "#f4f4f5",
  "--sheet-body": "#d4d4d8",
  "--sheet-muted": "#a1a1aa",
  "--sheet-rule": "rgba(255,255,255,0.09)",
  "--sheet-field": "rgba(255,255,255,0.07)",
  "--sheet-hover": "rgba(255,255,255,0.08)",
  "--sheet-on-ink": "#18181c",
  "--sheet-error": "#f87171",
}

/** The colours, as variables, for the sheet and the legal text inside it. */
export function sheetTokens(dark: boolean): React.CSSProperties {
  const t = dark ? DARK : LIGHT
  return {
    ...t,
    "--legal-ink": t["--sheet-ink"],
    "--legal-body": t["--sheet-body"],
    "--legal-muted": t["--sheet-muted"],
    "--legal-rule": t["--sheet-rule"],
    "--legal-rule-strong": dark ? "rgba(255,255,255,0.3)" : "#c9ccd2",
    "--legal-panel": t["--sheet-field"],
    "--legal-on-ink": t["--sheet-on-ink"],
    colorScheme: dark ? "dark" : "light",
  } as React.CSSProperties
}

const PHONE = "(max-width: 639px)"

/** Whether the window is a phone's width. Read before the first paint, so the right one of the two mounts. */
export function usePhoneWidth(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null)
  useLayoutEffect(() => {
    const mq = window.matchMedia(PHONE)
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
}

export function OnePageDialog({
  open,
  onClose,
  dark,
  label,
  header,
  children,
  width = 400,
  tall = false,
  scrollKey,
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  label: string
  /** Drawn above the content: on a phone it is part of what drags the sheet. */
  header?: React.ReactNode
  children: React.ReactNode
  /** The card's width from 640px. */
  width?: number
  /** A reading sheet: a fixed height, so a document that arrives late does not move the top edge. */
  tall?: boolean
  /** When this changes the content goes back to its top. */
  scrollKey?: string | number
}) {
  const phone = usePhoneWidth()
  const style = sheetTokens(dark)
  if (phone === null) return null
  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={label}
        header={header ? <div style={style}>{header}</div> : undefined}
        height={tall ? "88dvh" : undefined}
        maxHeight={tall ? "88dvh" : "min(86dvh, 640px)"}
        aboveKeyboard={!tall}
        scrollKey={scrollKey}
        className={dark ? "bg-[#18181c]" : "bg-white"}
      >
        <div style={style} className="text-[var(--sheet-body)]">
          {children}
        </div>
      </BottomSheet>
    )
  }
  return (
    <CenteredCard open={open} onClose={onClose} label={label} style={style} width={width} tall={tall} scrollKey={scrollKey} header={header}>
      {children}
    </CenteredCard>
  )
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"
const IN_MS = 220
const OUT_MS = 160

function CenteredCard({
  open,
  onClose,
  label,
  style,
  width,
  tall,
  scrollKey,
  header,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  style: React.CSSProperties
  width: number
  tall: boolean
  scrollKey?: string | number
  header?: React.ReactNode
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /* What it showed while open, kept while it leaves, so it never empties on the way out. */
  const kept = useRef<React.ReactNode>(children)
  const keptHeader = useRef<React.ReactNode>(header)
  if (open) {
    kept.current = children
    keptHeader.current = header
  }

  useEffect(() => {
    if (open) {
      setMounted(true)
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(f)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), OUT_MS)
    return () => window.clearTimeout(t)
  }, [open])

  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  /* Focus moves into the card and back to whatever opened it; Escape closes; the page behind does not scroll. */
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const f = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current()
    }
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = "hidden"
    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(f)
      document.removeEventListener("keydown", onKey)
      html.style.overflow = was
      before?.focus?.({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={label} data-onepage-dialog="">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${shown ? IN_MS : OUT_MS}ms ${EASE}` }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          ...style,
          width: "100%",
          maxWidth: width,
          height: tall ? "min(86vh, 820px)" : undefined,
          maxHeight: "min(86vh, 820px)",
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(8px) scale(0.985)",
          transition: `opacity ${shown ? IN_MS : OUT_MS}ms ${EASE}, transform ${shown ? IN_MS : OUT_MS}ms ${EASE}`,
        }}
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[24px] bg-[var(--sheet-bg)] text-[var(--sheet-body)] shadow-[0_24px_64px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.08)] outline-none",
        )}
        data-onepage-dialog-panel=""
      >
        {keptHeader.current ? <div className="shrink-0">{keptHeader.current}</div> : null}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-onepage-dialog-scroll="">
          {kept.current}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The round close button every one of these cards has, top right. */
export function SheetClose({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-muted)] transition-colors hover:text-[var(--sheet-ink)]"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
      </svg>
    </button>
  )
}
