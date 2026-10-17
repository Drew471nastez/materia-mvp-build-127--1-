"use client"

/**
 * ===========================================================================
 *  THE THREE DOTS ON AN OPEN SECTION'S TITLE ROW, AND THE CONFIRM CARD
 * ===========================================================================
 * The section (or block) open in the sidebar has its menu at the right end
 * of its title row, as Shopify's theme editor has: Copy and Paste for the
 * section, its settings and a block, Edit code, Duplicate, Hide, Delete.
 * The same action list as everywhere else in the app (components/ui/
 * responsive-action-menu.tsx): a dropdown under the dots on a computer, the
 * shared sheet on a phone. Its rows are worked out when it opens, so the
 * page re-rendering on every autosave builds none of them.
 *
 * The button is the size of the Back tile on the same row, 36px on a phone
 * and 32 from md, and its right edge sits on the row's padding
 * (scripts/check-section-menus.mjs measures both).
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ActionMenuAt, type ActionMenuItem, type ActionMenuPlace } from "@/components/ui/responsive-action-menu"

const PHONE_QUERY = "(max-width: 767px)"

export function PanelMenuButton({ label, title, items }: { label: string; title?: string; items: () => ActionMenuItem[] }) {
  const [at, setAt] = React.useState<ActionMenuPlace | null>(null)
  const close = React.useCallback(() => setAt(null), [])
  return (
    <>
      <button
        type="button"
        data-section-panel-menu=""
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ box: { left: r.left, top: r.top, width: r.width, height: r.height }, phone: window.matchMedia(PHONE_QUERY).matches, align: "end", focus: e.currentTarget })
        }}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[10px] text-[#4b5563] outline-none transition-[background-color,color,scale] duration-100 md:h-8 md:w-8 md:rounded-lg",
          "hover:bg-[#f0f1f4] hover:text-[#1a1a2e] active:scale-[0.94] active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-neutral-900/15 [-webkit-tap-highlight-color:transparent]",
          at && "bg-[#f0f1f4] text-[#1a1a2e]",
        )}
      >
        <MoreHorizontal className="h-5 w-5 md:h-4 md:w-4" strokeWidth={2} />
      </button>
      <ActionMenuAt at={at} items={at ? items() : NONE} title={title} onClose={close} menuWidth="w-60" />
    </>
  )
}
const NONE: ActionMenuItem[] = []

/**
 * A question before a copy or a paste that does more than the menu row says:
 * a file written into the theme, or settings landing on another kind of
 * section. The builder's own card (../leave-confirm.tsx, replace-chrome-
 * confirm.tsx): portalled, Escape and the scrim cancel, Cancel has the focus.
 */
export function SectionActionConfirm({
  open,
  title,
  children,
  confirm,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  confirm: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, busy, onCancel])
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!open || !mounted) return null
  return createPortal(
    <div className="wb-leave-scrim fixed inset-0 z-[320] flex items-center justify-center p-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-section-action-confirm=""
        onClick={(e) => e.stopPropagation()}
        className="wb-leave-card w-full max-w-[430px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]"
      >
        <h2 className="text-[19px] font-semibold leading-tight">{title}</h2>
        <div className="mt-2.5 text-[14.5px] leading-relaxed text-white/70">{children}</div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            autoFocus
            className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          >
            {tt("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className="h-10 rounded-xl bg-white/[0.12] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
