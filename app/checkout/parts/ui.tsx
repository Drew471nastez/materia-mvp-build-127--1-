"use client"

/**
 * ===========================================================================
 *  THE CHECKOUT'S OWN FORM PIECES
 * ===========================================================================
 * A checkout is read field by field, so every field is the same thing: a
 * label above, a 48px box, one hairline border that darkens on focus, and a
 * message under it when something is wrong. 16px text in the box, because
 * iOS zooms the whole page into any input set smaller, and a checkout that
 * jumps when you tap it feels broken.
 *
 * The same values are handed to Stripe's own fields (see `stripeAppearance`
 * in stripe-pay.tsx) so the card number and the email box beside it are
 * indistinguishable.
 */

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const INK = "#1a1a2e"

export const inputClass =
  "block h-12 w-full min-w-0 rounded-[10px] border border-[#d4d6db] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#b9bcc3] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.10)] aria-[invalid=true]:border-[#dc2626] aria-[invalid=true]:shadow-[0_0_0_3px_rgba(220,38,38,0.10)] disabled:bg-[#f7f7f8] disabled:text-[#9ca3af]"

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{children}</h2>
      {aside}
    </div>
  )
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string
  label: string
  error?: string | null
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#374151]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-[#dc2626]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{hint}</p>
      ) : null}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...rest} />
  },
)

/** A square box with a check, the size of a fingertip's target around it. */
export function CheckRow({
  id,
  checked,
  onChange,
  children,
  invalid,
}: {
  id: string
  checked: boolean
  onChange: (on: boolean) => void
  children: React.ReactNode
  invalid?: boolean
}) {
  return (
    <label htmlFor={id} className="group flex cursor-pointer items-start gap-3 py-1 text-[14px] leading-[1.45] text-[#374151]">
      <span className="relative mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={invalid || undefined}
          className={cn(
            "peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border bg-white transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
            checked ? "border-[#1a1a2e] bg-[#1a1a2e]" : invalid ? "border-[#dc2626]" : "border-[#b9bcc3] group-hover:border-[#6b7280]",
          )}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className={cn("pointer-events-none absolute h-3.5 w-3.5 text-white transition-[opacity,scale] duration-150", checked ? "scale-100 opacity-100" : "scale-75 opacity-0")}
        />
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  )
}

/** "OR" between the express buttons and the form, as a rule with a word in it. */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]" aria-hidden>
      <span className="h-px flex-1 bg-[#e5e7eb]" />
      or
      <span className="h-px flex-1 bg-[#e5e7eb]" />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  )
}

/** The one primary action. Near-black, full width, 52px. */
export function PayButton({
  children,
  busy,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className="relative flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#1a1a2e] text-[16px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(17,24,39,0.25)] transition-[background-color,scale,opacity] duration-150 hover:bg-[#2a2a40] active:scale-[0.99] active:bg-[#111122] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="checkout-rise flex items-start gap-2.5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[14px] leading-snug text-[#991b1b]">
      <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#dc2626]" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100)
