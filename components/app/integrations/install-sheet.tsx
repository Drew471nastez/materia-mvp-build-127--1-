"use client"

/**
 * ===========================================================================
 *  THE INSTALL SHEET (round 58)
 * ===========================================================================
 * Install on an app's listing opens this: on a phone the app's bottom sheet
 * (components/physical/ui Modal, the same one every /app sheet is), on a
 * computer a dialog that fades and rises 8px in and goes the same way out,
 * on opacity and transform only, 180ms, none under reduced motion.
 *
 * Inside: the steps, numbered and short ("1. Open Printful, Developer
 * portal, Your tokens. 2. Create a token. 3. Paste it here."), then the
 * integration's own panel, exactly the one it had, with its own fields,
 * its validation and its own route: the key goes to the server, is checked
 * with the provider and sealed there, and only its last four ever come
 * back. Nothing here reads or keeps a key.
 *
 * The sheet watches where the integration stands: once it is installed
 * while the sheet is open, the steps give way to a plain success state with
 * Done; a failure stays in the panel, in its own words, with the fields
 * kept so it can be fixed and sent again.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BTN_PRIMARY, Modal, useModalPhone } from "@/components/physical/ui"
import { Mark } from "@/components/app/settings/integration-mark"
import type { Integration } from "@/lib/integrations/catalog"

const MS = 180

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** The numbered steps: a number in a circle, the step beside it, one line each where it fits. */
export function InstallSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3" data-install-steps="">
      {steps.map((s, i) => (
        <li key={s} className="flex gap-3" data-install-step={i + 1}>
          <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[12px] font-semibold tabular-nums text-[#1a1a2e]">
            {i + 1}
          </span>
          <p className="min-w-0 pt-[2px] text-[14px] leading-[21px] text-[#1a1a2e]">
            <span className="sr-only">{tt("Step {n}:", { n: i + 1 })} </span>
            {s}
          </p>
        </li>
      ))}
    </ol>
  )
}

export interface InstallSheetProps {
  open: boolean
  onClose: () => void
  item: Integration
  title: string
  steps: string[]
  /** The integration's own panel: its fields, its checks, its route. */
  panel: React.ReactNode
  /** Where it stands now: the sheet says so once it turns true while open. */
  installed: boolean
}

export function InstallSheet({ open, onClose, item, title, steps, panel, installed }: InstallSheetProps) {
  const phone = useModalPhone()
  /* Installed while this sheet was open: the success state, until it is closed. */
  const [done, setDone] = React.useState(false)
  const wasInstalled = React.useRef(installed)
  React.useEffect(() => {
    if (open && installed && !wasInstalled.current) setDone(true)
    wasInstalled.current = installed
  }, [installed, open])
  React.useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => setDone(false), MS + 40)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const body = done ? (
    <div className="flex flex-col items-center px-2 py-6 text-center" data-install-success="">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]">
        <Check className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-3 text-[16px] font-semibold text-[#1a1a2e]" role="status">
        {tt("{name} is connected", { name: item.name })}
      </p>
      <p className="mt-1 max-w-[340px] text-[14px] leading-[21px] text-[#6b7280]">{tt("Its page now shows what it keeps in step, its activity and its settings.")}</p>
    </div>
  ) : (
    <div className="space-y-5" data-install-sheet-body="">
      {steps.length ? <InstallSteps steps={steps} /> : null}
      <div className={cn(steps.length ? "border-t border-[#f1f2f4] pt-5" : null, "max-sm:[&_:is(button,a).h-10]:h-11")} data-install-panel="">
        {panel}
      </div>
    </div>
  )
  const footer = done ? (
    <button type="button" className={cn(BTN_PRIMARY, "w-full sm:w-auto")} onClick={onClose} data-install-done="">
      {tt("Done")}
    </button>
  ) : undefined

  if (phone) {
    return (
      <Modal open={open} onClose={onClose} title={title} footer={footer}>
        <div data-install-sheet={item.id}>{body}</div>
      </Modal>
    )
  }
  return (
    <InstallDialog open={open} onClose={onClose} title={title} item={item} footer={footer}>
      <div data-install-sheet={item.id}>{body}</div>
    </InstallDialog>
  )
}

/**
 * THE COMPUTER'S DIALOG. Kept mounted for the length of its way out, so it
 * leaves the way it came (the shared ModalDialog is gone in one frame).
 * Escape and the scrim close it, focus goes into it and back to Install.
 */
function InstallDialog({ open, onClose, title, item, footer, children }: { open: boolean; onClose: () => void; title: string; item: Integration; footer?: React.ReactNode; children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(open)
  const [shown, setShown] = React.useState(false)
  const panel = React.useRef<HTMLDivElement>(null)
  const opener = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null
      setMounted(true)
      /* Drawn hidden for one frame, then shown: the transition has a start. */
      const r = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShown(true)))
      return () => window.cancelAnimationFrame(r)
    }
    setShown(false)
    const t = window.setTimeout(() => {
      setMounted(false)
      opener.current?.focus?.({ preventScroll: true })
    }, reduced() ? 0 : MS)
    return () => window.clearTimeout(t)
  }, [open])
  React.useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", key)
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input:not([data-no-autofocus]), select, textarea")?.focus({ preventScroll: true }), 40)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("keydown", key)
      html.style.overflow = before
    }
  }, [open, onClose])
  if (!mounted || typeof document === "undefined") return null
  const motion = "transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation" data-install-dialog={shown ? "open" : "closing"}>
      <div className={cn("absolute inset-0 bg-[rgba(17,24,39,0.36)]", motion, shown ? "opacity-100" : "opacity-0")} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
        }}
        className={cn("relative flex max-h-[min(88dvh,720px)] w-full max-w-[520px] flex-col rounded-2xl bg-white shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28)] will-change-transform", motion, shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0")}
      >
        <div className="flex items-center gap-3 border-b border-[#f1f2f4] px-5 py-3.5">
          <Mark item={item} size={28} />
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
          <button type="button" data-close="" onClick={onClose} aria-label={tt("Close")} className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-[#f1f2f4] px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
