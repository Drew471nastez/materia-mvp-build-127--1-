"use client"

/**
 * ===========================================================================
 *  ONE SHEET FOR THE MEMBERSHIP SCREENS (round 13, worker M)
 * ===========================================================================
 * Cancel membership, and the owner's Refund, open the way Report does
 * (components/community/member/report-sheet.tsx): the app's own sheet on a
 * phone (components/ui/bottom-sheet.tsx, pulled down to close, kept above
 * the keyboard), a small dialog in the middle on a computer that fades and
 * settles. One place, so both feel the same.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ICON_BTN } from "@/components/community/member/ui"

export function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

export function MembershipSheet({
  open,
  onClose,
  title,
  busy = false,
  children,
  footer,
  marker,
}: {
  open: boolean
  onClose: () => void
  title: string
  busy?: boolean
  children: ReactNode
  /** The buttons: full width and stacked on a phone, in a row on the right on a computer. */
  footer: (phone: boolean) => ReactNode
  /** A data attribute name for the probe, e.g. "cancel". */
  marker: string
}) {
  const phone = usePhone()
  const close = () => {
    if (!busy) onClose()
  }
  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={close} title={title} aboveKeyboard dismissible={!busy} zIndex={140}>
        <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-1" data-membership-sheet={marker}>
          {children}
          <div className="mt-4 flex flex-col gap-2">{footer(true)}</div>
        </div>
      </BottomSheet>
    )
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[140] bg-[#0f1115]/35 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
          }}
          className="fixed left-1/2 top-1/2 z-[141] max-h-[calc(100dvh-48px)] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e6e8eb] bg-white p-5 shadow-[0_24px_60px_-16px_rgba(17,24,39,0.3),0_2px_6px_rgba(17,24,39,0.05)] outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] motion-reduce:animate-none"
          data-membership-dialog={marker}
        >
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="pt-1.5 text-[17px] font-semibold text-[#1a1a2e]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className={`${ICON_BTN} -mr-2 -mt-1`} aria-label="Close" disabled={busy}>
              <X className="h-[18px] w-[18px]" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-1">{children}</div>
          <div className="mt-5 flex justify-end gap-2">{footer(false)}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
