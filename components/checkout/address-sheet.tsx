"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/**
 * The delivery address, as a full screen of its own.
 *
 * A subpage rather than a section, because an address is seven fields and
 * putting seven fields inline turns the checkout into a form to be waded
 * through instead of a summary to be confirmed. The main page shows one card
 * saying where the parcel is going; this is what opens when you tap it.
 *
 * Closing discards. Saving is the only thing that changes the order — so
 * somebody who opens this to check what they typed cannot accidentally clear a
 * field on the way out.
 */

export interface CheckoutAddress {
  fullName: string
  street: string
  details: string
  postalCode: string
  city: string
  county: string
}

export const EMPTY_ADDRESS: CheckoutAddress = {
  fullName: "",
  street: "",
  details: "",
  postalCode: "",
  city: "",
  county: "",
}

export function isAddressComplete(a: CheckoutAddress): boolean {
  return a.fullName.trim().length >= 3 && a.street.trim().length >= 3 && a.city.trim().length >= 2
}

/** One line per row, the way an address is actually read. */
export function formatAddressLines(a: CheckoutAddress): string[] {
  const lines: string[] = []
  const street = [a.street, a.details].filter((s) => s.trim()).join(", ")
  if (street) lines.push(street)
  const place = [a.postalCode, a.city].filter((s) => s.trim()).join(" ")
  if (place) lines.push(place)
  if (a.county.trim() && a.county.trim() !== a.city.trim()) lines.push(a.county)
  return lines
}

function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
  autoComplete,
  inputMode,
  optional,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: "text" | "numeric"
  optional?: boolean
  disabled?: boolean
}) {
  return (
    <label className="block border-b border-neutral-200 px-4 py-3">
      <span className="block text-[13px] text-neutral-500">
        {label}
        {optional && <span className="ml-1 text-neutral-400">(opțional)</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        // 16px minimum, or iOS zooms the page the moment the field is focused.
        className="mt-1 w-full bg-transparent text-[16px] text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-60"
      />
      {hint && <span className="mt-1 block text-[12px] text-neutral-500">{hint}</span>}
    </label>
  )
}

export function AddressSheet({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial: CheckoutAddress
  onClose: () => void
  onSave: (a: CheckoutAddress) => void
}) {
  const [draft, setDraft] = useState<CheckoutAddress>(initial)

  // Reset from the saved value each time it opens, so an abandoned edit does
  // not reappear as though it had been kept.
  useEffect(() => {
    if (open) setDraft(initial)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const set = (k: keyof CheckoutAddress) => (v: string) => setDraft((d) => ({ ...d, [k]: v }))

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adresă"
      className="fixed inset-0 z-[96] flex flex-col bg-white"
      style={{ height: "100dvh" }}
    >
      <header
        className="relative shrink-0 border-b border-neutral-200 px-4 pb-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-neutral-700 active:opacity-60"
        >
          Închide
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[16px] font-bold text-neutral-900">
          Adresă
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Field label="Nume complet" value={draft.fullName} onChange={set("fullName")} autoComplete="name" />
        {/* Fixed rather than a selector: the couriers integrated here deliver
            within Romania only, so offering a choice would be offering one that
            fails at the AWB step. */}
        <div className="block border-b border-neutral-200 px-4 py-3">
          <span className="block text-[13px] text-neutral-500">Țară</span>
          <span className="mt-1 block text-[16px] text-neutral-500">România</span>
        </div>
        <Field
          label="Stradă și număr"
          value={draft.street}
          onChange={set("street")}
          autoComplete="address-line1"
        />
        <Field
          label="Detalii adresă"
          value={draft.details}
          onChange={set("details")}
          autoComplete="address-line2"
          placeholder="Bloc, scară, apartament, etaj"
          optional
        />
        <Field
          label="Cod poștal"
          value={draft.postalCode}
          onChange={set("postalCode")}
          autoComplete="postal-code"
          inputMode="numeric"
          optional
        />
        <Field label="Oraș/localitate" value={draft.city} onChange={set("city")} autoComplete="address-level2" />
        <Field label="Județ" value={draft.county} onChange={set("county")} autoComplete="address-level1" />
      </div>

      <div
        className="shrink-0 border-t border-neutral-200 px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={!isAddressComplete(draft)}
          onClick={() => {
            onSave(draft)
            onClose()
          }}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[16px] font-semibold text-white transition-transform active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100"
        >
          Salvare adresă
        </button>
      </div>
    </div>,
    document.body,
  )
}
