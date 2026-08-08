"use client"

import { Check, Home, MapPin, Pencil, Plus } from "lucide-react"

/**
 * The building blocks of the checkout page: a section heading, a card that
 * summarises one decision, the delivery choice, and the item being bought.
 *
 * They share one set of measurements — heading size, card radius, card padding,
 * the affordance on the right — because a checkout built from five sections
 * that each invented their own is a page that reads as five different screens
 * stacked up. The constants below are the single source of those numbers.
 */

/** Section headings. Large enough to structure the page at a glance. */
const HEADING = "text-[20px] font-bold text-neutral-900"

/** Every summary card: same radius, same border, same padding, same press. */
const CARD =
  "flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors active:bg-neutral-50"

export type DeliveryMethod = "locker" | "home"

export interface DeliveryOption {
  method: DeliveryMethod
  /** Formatted by the caller, so this obeys whatever currency is configured. */
  price: string
  /** Absent while the quote is still loading. */
  unavailable?: boolean
}

/**
 * The two ways a parcel can arrive, priced, as a choice.
 *
 * Both options carry their price at the same time, rather than a dropdown or a
 * single "shipping" line that changes silently. Locker delivery is meaningfully
 * cheaper than a courier to the door — 16 lei against 118 in the reference —
 * and that difference is the reason most people pick it. A choice presented
 * without its price is not a choice.
 *
 * Presentational: it renders options and reports a selection. It never prices
 * anything; the numbers come from the quote, which comes from the courier.
 */
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
      <h2 className={HEADING}>Opțiune de livrare</h2>
      <div className="mt-3 space-y-3" role="radiogroup" aria-label="Opțiune de livrare">
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
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-40 ${
                active ? "border-[#7c3aed] bg-[#7c3aed]/[0.04]" : "border-neutral-200 bg-white"
              }`}
            >
              <Icon className={`h-6 w-6 shrink-0 ${active ? "text-[#7c3aed]" : "text-neutral-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold leading-snug text-neutral-900">{label}</span>
                <span className="mt-0.5 block text-[15px] text-neutral-500">
                  {o.unavailable ? "Indisponibil" : o.price}
                </span>
              </span>
              {/* A filled ring, not just a colour: the selected state has to be
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
 * One decision, summarised, with the way to change it on the right.
 *
 * The affordance carries the whole message and no word is needed for it: a plus
 * when there is nothing there yet, a pencil once there is. That is what the
 * reference does, and it is the reason these rows stay one line tall on a
 * narrow phone instead of wrapping a "Schimbă" onto a second one.
 */
export function SummaryCard({
  label,
  filled,
  onEdit,
  children,
  leading,
  invalid,
}: {
  /** The section heading above the card. */
  label: string
  /** Drives the icon: plus to add, pencil to change. */
  filled: boolean
  onEdit: () => void
  children: React.ReactNode
  /** Optional mark on the left — a locker pin, a card brand. */
  leading?: React.ReactNode
  /** This is the section the checkout is waiting on. Draws the border in the
   *  warning colour so the row and the message under it read as one thing. */
  invalid?: boolean
}) {
  return (
    <section aria-label={label}>
      <h2 className={HEADING}>{label}</h2>
      <button
        type="button"
        onClick={onEdit}
        aria-invalid={invalid || undefined}
        className={`mt-3 items-start ${CARD} ${invalid ? "border-[#c2410c]" : ""}`}
      >
        {leading}
        <span className="min-w-0 flex-1">{children}</span>
        <span className="mt-0.5 shrink-0 text-neutral-400">
          {filled ? <Pencil className="h-[18px] w-[18px]" /> : <Plus className="h-5 w-5" />}
        </span>
      </button>
    </section>
  )
}

/** The saved delivery address, or an invitation to add one. */
export function AddressCard({
  name,
  lines,
  onEdit,
  label = "Adresă",
  emptyLabel = "Adaugă o adresă",
  invalid,
}: {
  name?: string | null
  lines?: Array<string | null | undefined>
  onEdit: () => void
  label?: string
  emptyLabel?: string
  invalid?: boolean
}) {
  const filled = Boolean(name) || (lines ?? []).some(Boolean)

  return (
    <SummaryCard label={label} filled={filled} onEdit={onEdit} invalid={invalid}>
      {filled ? (
        <>
          {name && <span className="block text-[16px] font-semibold text-neutral-900">{name}</span>}
          {(lines ?? []).filter(Boolean).map((l, i) => (
            <span key={i} className="mt-0.5 block text-[15px] leading-snug text-neutral-500">
              {l}
            </span>
          ))}
        </>
      ) : (
        <span className="block text-[16px] text-neutral-500">{emptyLabel}</span>
      )}
    </SummaryCard>
  )
}

/**
 * The item being bought, at the top of the page.
 *
 * Everything the listing actually knows about the thing goes here — brand,
 * size, condition, colour — because this is the last screen before money moves
 * and "is this the right one, in the right size" is the question somebody is
 * asking at exactly this moment. It also fills the column: with only a title
 * and a price pushed to the baseline there was a hand's width of nothing in
 * between, which reads as something failing to load.
 *
 * Facts are listed in the order they matter for a second-hand garment, and any
 * the listing does not carry are simply absent — never rendered as an empty row
 * or a dash.
 */
export function CheckoutItemCard({
  title,
  seller,
  brand,
  size,
  condition,
  colour,
  price,
  imageUrl,
}: {
  title: string
  seller?: string | null
  brand?: string | null
  size?: string | null
  condition?: string | null
  colour?: string | null
  price: string
  imageUrl?: string | null
}) {
  const facts: Array<{ label: string; value: string }> = []
  if (brand?.trim()) facts.push({ label: "Marcă", value: brand.trim() })
  if (size?.trim()) facts.push({ label: "Mărime", value: size.trim() })
  if (condition?.trim()) facts.push({ label: "Stare", value: condition.trim() })
  if (colour?.trim()) facts.push({ label: "Culoare", value: colour.trim() })

  return (
    <div className="flex gap-4">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-[156px] w-[124px] shrink-0 rounded-lg object-cover"
          loading="eager"
        />
      ) : (
        <span className="h-[156px] w-[124px] shrink-0 rounded-lg bg-neutral-100" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[19px] font-bold leading-tight text-neutral-900">{title}</p>
        {seller && <p className="mt-0.5 truncate text-[15px] text-neutral-500">{seller}</p>}

        {facts.length > 0 && (
          <dl className="mt-2 space-y-0.5">
            {facts.map((f) => (
              <div key={f.label} className="flex gap-1.5 text-[14px] leading-snug">
                <dt className="shrink-0 text-neutral-400">{f.label}</dt>
                <dd className="min-w-0 truncate text-neutral-600">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-2 text-[19px] font-bold text-neutral-900">{price}</p>
      </div>
    </div>
  )
}

export { HEADING as CHECKOUT_HEADING }
