"use client"

/**
 * The compose page's small parts, in the /app palette the Emails list and
 * Orders already use (app/app/orders/order-parts.tsx): fields with the
 * product picker's input, segmented choices in the list's tab style, and a
 * dialog that is a centred card on a computer and the shared sheet on a
 * phone.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import { SWATCHES, safeColor } from "@/lib/email-campaigns/blocks"
import { tt } from "@/lib/i18n/text"

export { buttonAccent, buttonPrimary, buttonSecondary, card, iconButton, StatusBadge } from "@/app/app/orders/order-parts"

/** 16px on a phone, or iOS zooms the page to type. */
export const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-[#d5d7dd] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.10)] sm:h-9 sm:text-[14px] aria-[invalid=true]:border-[#d72c0d] aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgba(215,44,13,0.12)]"

export const labelClass = "text-[13px] font-medium text-[#1a1a2e]"
export const helpClass = "text-[12px] leading-[18px] text-[#6b7280]"
export const errorClass = "text-[12px] leading-[18px] text-[#b42318]"

export function Field({
  label,
  htmlFor,
  hint,
  error,
  counter,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  error?: string | null
  counter?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
        {counter ? <span className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">{counter}</span> : null}
      </div>
      {children}
      {error ? <p className={cn(errorClass, "mt-1.5")}>{error}</p> : hint ? <p className={cn(helpClass, "mt-1.5")}>{hint}</p> : null}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-9 items-center gap-0.5 rounded-lg border border-[#e3e4e8] bg-white p-0.5 sm:h-8", className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-full min-w-[40px] cursor-pointer whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors duration-100",
              on ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A button's colour: the brand's (the default, read when the email is sent,
 * so a new brand colour reaches every button that did not choose one), one
 * of a few, or any.
 */
export function ColorChoice({ value, onChange, brand, large = false }: { value: string; onChange: (c: string) => void; brand?: string; large?: boolean }) {
  const current = value ? safeColor(value) : ""
  /* `large`: a thumb's size, for the button's sheet on a phone (./panels.tsx). */
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", large && "gap-2.5 [&_button]:h-10 [&_button[aria-label]]:w-10 [&_label]:h-10 [&_button]:text-[14px] [&_label]:text-[14px]")} role="radiogroup" aria-label={tt("Color")}>
      <button
        type="button"
        role="radio"
        aria-checked={current === ""}
        onClick={() => onChange("")}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12px] font-medium transition-colors duration-100",
          current === "" ? "border-[#1a1a2e]/30 bg-[#f1f2f4] text-[#1a1a2e]" : "border-[#e3e4e8] bg-white text-[#4b5563] hover:bg-[#f7f7f8]",
        )}
      >
        <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: brand || "#1a1a2e" }} />
        {tt("Brand")}
      </button>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={current === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="relative h-7 w-7 cursor-pointer rounded-full border border-black/10 transition-transform duration-100 active:scale-95"
          style={{ backgroundColor: c }}
        >
          {current === c ? <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white mix-blend-difference" strokeWidth={3} /> : null}
        </button>
      ))}
      <label className="relative ml-1 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-[#e3e4e8] bg-white pl-1 pr-2.5 text-[12px] font-medium text-[#4b5563] hover:bg-[#f7f7f8]">
        <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: current || brand || "#1a1a2e" }} />
        {tt("Custom")}
        <input type="color" value={current || brand || "#1a1a2e"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={tt("Custom color")} />
      </label>
    </div>
  )
}

/**
 * A dialog: a card in the middle on a computer, the shared sheet on a
 * phone. The footer holds its actions and stays above the keyboard.
 */
export function ComposeDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-[480px]",
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  const phone = usePhone()
  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} title={title} label={title} aboveKeyboard hideFrom="sm">
        <div className="px-5 pb-2 pt-2">
          {description ? <p className="sr-only">{description}</p> : null}
          {children}
        </div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-[#eef0f2] px-5 pb-3 pt-3 [&>button]:h-11 [&>button]:w-full [&>button]:text-[15px]">{footer}</div> : null}
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        showCloseButton={false}
        className={cn("w-[calc(100%-24px)] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]", width)}
      >
        <div className="border-b border-[#eef0f2] bg-[#f7f7f8] px-5 py-3.5">
          <DialogTitle className="text-[15px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        </div>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  )
}
