"use client"

/**
 * ===========================================================================
 *  CHANGE THE OPTION WITHOUT LEAVING CHECKOUT
 * ===========================================================================
 * One picker for every checkout line whose product has more than one option
 * on sale (lib/checkout/variant-choices-server): a hoodie's size and colour,
 * an ebook's edition, a licence. Nothing shows for a product with one.
 *
 *   closed   the option's name, and Edit beside it
 *   open     a thing that ships: one select per option (Size, Colour), each
 *            value that can't be had with the others marked sold out; a
 *            download: one select of its options. Native selects: the
 *            phone's own picker, the keyboard's arrows, nothing to break.
 *
 * A choice applies at once: the page changes the line's option and the
 * server prices the order again (stock, limits, offers, the code, shipping,
 * tax). Done folds it away.
 */

import * as React from "react"
import { ChevronDown } from "lucide-react"
import type { VariantChoices } from "@/lib/checkout/variant-choices"
import { money } from "./ui"

const SELECT =
  "h-9 w-full cursor-pointer appearance-none truncate rounded-[8px] border border-[#e1e3e7] bg-white py-0 pl-2.5 pr-8 text-[16px] text-[#1a1a2e] shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors hover:border-[#d2d5da] focus:border-[#1a1a2e]/55 disabled:cursor-default disabled:opacity-60 sm:text-[13.5px]"

/** The option to take when one value is changed: the same values otherwise if that combination is on sale, else the closest that has the new value and can be bought, else none. */
export function pickByValue(choices: VariantChoices, currentId: string | null, index: number, value: string): string | null {
  const current = choices.variants.find((v) => v.id === currentId)
  const want = choices.options.map((_, i) => (i === index ? value : (current?.values[i] ?? "")))
  const exact = choices.variants.find((v) => v.values.every((x, i) => x === want[i]))
  if (exact?.available) return exact.id
  const near = choices.variants.filter((v) => v.values[index] === value && v.available)
  /* The one sharing the most of what was chosen before. */
  near.sort((a, b) => b.values.filter((x, i) => x === want[i]).length - a.values.filter((x, i) => x === want[i]).length)
  /* Nothing on sale with that value: no change, never a sold out option. */
  return near[0]?.id ?? null
}

/** Whether a value of one option can be had at all, with the other options as they are or any other. */
function valueOn(choices: VariantChoices, index: number, value: string): boolean {
  return choices.variants.some((v) => v.values[index] === value && v.available)
}

export function VariantEdit({
  choices,
  currentId,
  currentName,
  title,
  busy = false,
  editable = true,
  onChange,
}: {
  choices: VariantChoices | undefined
  currentId: string | null
  /** The option's name as the line shows it ("S", "M / Black", "Deluxe"). */
  currentName: string | null
  title: string
  busy?: boolean
  /** False once paying has started: the name, no Edit. */
  editable?: boolean
  onChange: (variantId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  const canEdit = editable && !!choices && choices.variants.length > 1
  if (!canEdit) return currentName ? <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{currentName}</p> : null
  const current = choices.variants.find((v) => v.id === currentId) ?? null
  const label = currentName ?? current?.name ?? "Choose an option"
  return (
    <div className="mt-0.5" data-variant-edit="">
      <p className="flex min-w-0 items-baseline gap-2 text-[13px] text-[#6b7280]">
        <span className="truncate">{label}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? `Done changing ${title}` : `Change ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-[13px] text-[#6b7280] underline decoration-[#d9dce1] underline-offset-2 hover:text-[#1a1a2e] hover:decoration-[#1a1a2e]"
          data-variant-edit-toggle=""
        >
          {open ? "Done" : "Edit"}
        </button>
      </p>
      {open ? (
        <div id={id} className="mt-2 grid max-w-[340px] gap-2" data-variant-edit-panel="">
          {choices.options.length > 0 ? (
            choices.options.map((o, i) => (
              <label key={o.name} className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#6b7280]">{o.name}</span>
                <span className="relative block">
                  <select
                    className={SELECT}
                    value={current?.values[i] ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const next = pickByValue(choices, currentId, i, e.target.value)
                      if (next && next !== currentId) onChange(next)
                    }}
                  >
                    {current ? null : <option value="">Choose</option>}
                    {o.values.map((v) => {
                      const on = valueOn(choices, i, v)
                      return (
                        <option key={v} value={v} disabled={!on && v !== current?.values[i]}>
                          {on ? v : `${v} (sold out)`}
                        </option>
                      )
                    })}
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                </span>
              </label>
            ))
          ) : (
            <span className="relative block">
              <select
                aria-label={`Option for ${title}`}
                className={SELECT}
                value={currentId ?? ""}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value && e.target.value !== currentId) onChange(e.target.value)
                }}
              >
                {current ? null : <option value="">Choose</option>}
                {choices.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.available && v.id !== currentId}>
                    {v.name} · {v.priceCents === 0 ? "Free" : money(v.priceCents)}
                    {v.available ? "" : " (sold out)"}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
