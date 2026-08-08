"use client"

import { Check, Home, MapPin, Pencil, Plus } from "lucide-react"

/**
 * The two ways a parcel can arrive, priced, as a choice.
 *
 * Both options are shown with their prices at the same time, rather than a
 * dropdown or a single "shipping" line that changes silently. Locker delivery
 * is meaningfully cheaper than a courier to the door — 16 lei against 118 in
 * the reference — and that difference is the reason most people pick it. A
 * choice presented without its price is not a choice.
 *
 * Presentational: it renders options and reports a selection. It never prices
 * anything; the numbers come from the quote, which comes from the courier.
 */

export type DeliveryMethod = "locker" | "home"

export interface DeliveryOption {
  method: DeliveryMethod
  /** Formatted by the caller, so this obeys whatever currency is configured. */
  price: string
  /** Absent while the quote is still loading. */
  unavailable?: boolean
}

export function DeliveryOptions({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: DeliveryOption[]
  selected: DeliveryMethod
  onSelect: (m: DeliveryMethod) => void
  disabled?: boolean
}) {
  const meta: Record<DeliveryMethod, { label: string; icon: typeof MapPin }> = {
    locker: { label: "Expediere la punctul de ridicare", icon: MapPin },
    home: { label: "Expediere acasă", icon: Home },
  }

  return (
    <section aria-label="Opțiune de livrare">
      <h2 className="text-[16px] font-bold text-neutral-900">Opțiune de livrare</h2>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="Opțiune de livrare">
        {options.map((o) => {
          const { label, icon: Icon } = meta[o.method]
          const active = selected === o.method
          return (
            <button
              key={o.method}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || o.unavailable}
              onClick={() => onSelect(o.method)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors disabled:opacity-40 ${
                active ? "border-[#7c3aed] bg-[#7c3aed]/[0.04]" : "border-neutral-200 bg-white"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#7c3aed]" : "text-neutral-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-neutral-900">{label}</span>
                <span className="mt-0.5 block text-[14px] text-neutral-500">
                  {o.unavailable ? "Indisponibil" : o.price}
                </span>
              </span>
              {/* A filled ring, not just a colour: the selected state must be
                  legible without relying on hue. */}
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-neutral-300"
                }`}
              >
                {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The saved delivery address, or an invitation to add one.
 *
 * One card either way, so the section does not jump around between an empty
 * state and a filled one.
 */
export function AddressCard({
  name,
  lines,
  onEdit,
  label = "Adresă",
  emptyLabel = "Adaugă o adresă",
}: {
  name?: string | null
  lines?: Array<string | null | undefined>
  onEdit: () => void
  label?: string
  emptyLabel?: string
}) {
  const filled = Boolean(name) || (lines ?? []).some(Boolean)

  return (
    <section aria-label={label}>
      <h2 className="text-[16px] font-bold text-neutral-900">{label}</h2>
      <button
        type="button"
        onClick={onEdit}
        className="mt-3 flex w-full items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors active:bg-neutral-50"
      >
        <span className="min-w-0 flex-1">
          {filled ? (
            <>
              <span className="block text-[15px] font-semibold text-neutral-900">{name}</span>
              {(lines ?? []).filter(Boolean).map((l, i) => (
                <span key={i} className="mt-0.5 block text-[14px] leading-snug text-neutral-500">
                  {l}
                </span>
              ))}
            </>
          ) : (
            <span className="block text-[15px] text-neutral-500">{emptyLabel}</span>
          )}
        </span>
        <span className="shrink-0 text-neutral-400">
          {filled ? <Pencil className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
        </span>
      </button>
    </section>
  )
}

/** The item being bought, at the top of the page. */
export function CheckoutItemCard({
  title,
  subtitle,
  variant,
  price,
  imageUrl,
}: {
  title: string
  /** Brand, when the listing has one. */
  subtitle?: string | null
  /** Size or option. */
  variant?: string | null
  price: string
  imageUrl?: string | null
}) {
  return (
    <div className="flex gap-3.5">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-[120px] w-[104px] shrink-0 rounded-xl object-cover"
          loading="eager"
        />
      ) : (
        <span className="h-[120px] w-[104px] shrink-0 rounded-xl bg-neutral-100" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[17px] font-bold leading-tight text-neutral-900">{title}</p>
        {subtitle && <p className="mt-0.5 text-[14px] text-neutral-500">{subtitle}</p>}
        {variant && <p className="mt-0.5 text-[14px] text-neutral-500">{variant}</p>}
        <p className="mt-auto text-[17px] font-bold text-neutral-900">{price}</p>
      </div>
    </div>
  )
}
