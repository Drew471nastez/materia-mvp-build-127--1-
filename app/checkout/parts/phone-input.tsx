"use client"

/**
 * ===========================================================================
 *  THE PHONE NUMBER AT CHECKOUT, WITH ITS COUNTRY
 * ===========================================================================
 * The owner: "next to the phone number I want to be able to add my phone
 * number and know where the country I am from is, or change the country".
 *
 * One field, the checkout's own (inputClass): the country's flag and calling
 * code at its start, behind a hairline, then the number as it is written in
 * that country ("712 345 678", "(415) 555-0123"). The country follows the
 * address until the buyer picks another on the code: the searchable country
 * list the settings use (components/ui/choice-list), a popover on a computer
 * and the bottom sheet on a phone, found by name or by code. A number pasted or
 * filled in whole with its code ("+44 7700 900123") moves the code to that
 * country. What is kept and sent is "+40 712 345 678" (lib/account/phone, the
 * same reading Set up payouts uses).
 */
import * as React from "react"
import { ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/checkout/countries"
import { FLAG_CODES, FLAG_SPRITE } from "@/lib/account/flag-sprite"
import { callingCode, countryOfInternational, digitsFromKept, formatNational, fullNumber, nationalDigits } from "@/lib/account/phone"
import { FIELD_SHADOW } from "./ui"

/** Every country with a calling code, as the select lists them: "Romania (+40)". */
const DIALS = COUNTRIES.flatMap((c) => {
  const code = callingCode(c.code)
  return code ? [{ code: c.code, name: c.name, dial: code }] : []
})

/* The list the code opens: searched by the name, by "40" or by "+40". */
const choices = (): Choice[] => DIALS.map((d) => ({ value: d.code, label: d.name, aside: `+${d.dial}`, keywords: `${d.dial} +${d.dial} ${d.code}` }))

function Flag({ code }: { code: string }) {
  return (
    <span aria-hidden className="relative block h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[3px] bg-[#eef0f2] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18),0_1px_2px_rgba(17,24,39,0.12)]">
      {FLAG_CODES.has(code) ? (
        <svg width="100%" height="100%" className="block h-full w-full" focusable="false">
          <use href={`${FLAG_SPRITE}#${code}`} width="100%" height="100%" />
        </svg>
      ) : null}
    </span>
  )
}

export function CheckoutPhone({
  id,
  value,
  onChange,
  country,
  invalid,
  placeholder = "Phone",
  label,
  className,
}: {
  id: string
  /** "+40 712 345 678", as kept. */
  value: string
  onChange: (value: string) => void
  /** The address's country: the code follows it until the buyer picks one. */
  country: string
  invalid?: boolean
  placeholder?: string
  /** Its name for a screen reader, where no <label> points at it (a form whose labels are its placeholders). */
  label?: string
  /** The box's size where a form's fields are taller (app/checkout/physical). */
  className?: string
}) {
  const [picked, setPicked] = React.useState<string | null>(null)
  const cc = (picked || country || "US").toUpperCase()
  const code = callingCode(cc)
  const digits = digitsFromKept(value, cc)
  const shown = formatNational(digits, cc)
  const input = React.useRef<HTMLInputElement>(null)
  /* Where the caret goes after the number is drawn again: after this many digits. */
  const caret = React.useRef<number | null>(null)

  /* The country changed: the code follows, the digits stay. */
  React.useEffect(() => {
    const next = fullNumber(digits, cc)
    if (value && next !== value) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc])

  React.useLayoutEffect(() => {
    const el = input.current
    const want = caret.current
    if (!el || want == null || document.activeElement !== el) return
    caret.current = null
    let seen = 0
    let at = 0
    while (at < el.value.length && seen < want) {
      if (/\d/.test(el.value[at])) seen++
      at++
    }
    while (want > 0 && at < el.value.length && /[)\-]/.test(el.value[at])) at++
    el.setSelectionRange(at, at)
  }, [shown])

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    /* Filled in or pasted with its own code: that country, and the number after the code. */
    const from = countryOfInternational(raw, [cc, country.toUpperCase()])
    if (from && from !== cc) {
      setPicked(from)
      onChange(fullNumber(nationalDigits(raw, from), from))
      return
    }
    const before = raw.slice(0, e.target.selectionStart ?? raw.length)
    let next = nationalDigits(raw, cc)
    /* Backspace over a space or a bracket removes the digit before it, not nothing. */
    const native = e.nativeEvent as InputEvent
    if (native.inputType === "deleteContentBackward" && next === digits && raw.length < shown.length) {
      const left = before.replace(/\D/g, "").length
      if (left > 0) next = digits.slice(0, left - 1) + digits.slice(left)
      caret.current = Math.max(0, left - 1)
    } else {
      const typedDigits = raw.replace(/\D/g, "").length
      caret.current = Math.max(0, before.replace(/\D/g, "").length - (typedDigits - next.length))
    }
    onChange(fullNumber(next, cc))
  }

  return (
    <div
      data-checkout-phone=""
      style={{ boxShadow: invalid ? undefined : FIELD_SHADOW }}
      className={cn(
        "flex h-11 w-full items-stretch overflow-hidden rounded-[8px] border bg-white text-[16px] text-[#1a1a2e] transition-[border-color,box-shadow] duration-150 sm:text-[15px]",
        invalid
          ? "border-[#dc2626] shadow-[0_0_0_3px_rgba(220,38,38,0.10)]"
          : "border-[#e1e3e7] hover:border-[#d2d5da] focus-within:border-[#1a1a2e]/55 focus-within:!shadow-[0_0_0_3px_rgba(26,26,46,0.08),0_1px_1px_rgba(0,0,0,0.03)]",
        className,
      )}
    >
      <ChoicePicker
        name="phone-country"
        title="Country code"
        choices={choices}
        value={cc}
        onChange={(next) => {
          setPicked(next)
          requestAnimationFrame(() => input.current?.focus())
        }}
        placeholder="Search countries or codes"
        fieldLabel={code ? `+${code}` : "Code"}
        fieldLeading={<Flag code={cc} />}
        leading={(choice) => <Flag code={choice.value} />}
        uniform
        scrollClassName="max-h-[min(400px,min(52dvh,520px))]"
        sheetHeight="min(72dvh, 580px)"
        fieldClassName="h-full w-auto shrink-0 gap-1.5 rounded-none border-0 border-r border-[#eceef1] bg-transparent pl-3.5 pr-2.5 tabular-nums text-[#4b5563] shadow-none hover:bg-[#fafafb] focus-visible:border-[#eceef1] focus-visible:bg-[#f7f7f8] focus-visible:shadow-none data-[state=open]:border-[#eceef1] data-[state=open]:shadow-none sm:text-[15px]"
      />
      <input
        ref={input}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-invalid={invalid || undefined}
        aria-label={label}
        placeholder={placeholder}
        value={shown}
        onChange={change}
        className="w-0 min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-[#a2a7b0]"
      />
    </div>
  )
}
