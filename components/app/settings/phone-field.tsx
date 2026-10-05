"use client"

/**
 * ===========================================================================
 *  THE PHONE NUMBER IN SET UP PAYOUTS
 * ===========================================================================
 * The country's flag and calling code stand at the start of the field and
 * follow the payouts country: nothing to know or type. What is typed is the
 * number as it is written in that country, grouped as it goes ("712 345
 * 678", "(415) 555-0123"); a pasted number with the code in front, or a
 * local one with its 0, is read as the same number (lib/account/phone).
 * What the form keeps is "+40 712 345 678".
 *
 * Drawn as the setup form's own field (FIELD): one box, the code inside it
 * behind a hairline, the halo around the whole box when the number is
 * focused. The caret stays where it was as the spaces come and go.
 */
import * as React from "react"
import { CountryFlag } from "@/components/app/settings/country-picker"
import { callingCode, digitsFromKept, examplePhone, formatNational, fullNumber, nationalDigits } from "@/lib/account/phone"
import { cn } from "@/lib/utils"

export function PhoneField({
  country,
  value,
  onChange,
  id,
  "aria-invalid": invalid,
}: {
  /** The payouts country, ISO code. */
  country: string
  /** "+40 712 345 678", as kept. */
  value: string
  onChange: (value: string) => void
  id?: string
  "aria-invalid"?: boolean
}) {
  const cc = (country || "").toUpperCase()
  const code = callingCode(cc)
  const digits = digitsFromKept(value, cc)
  const shown = formatNational(digits, cc)
  const input = React.useRef<HTMLInputElement>(null)
  /* Where the caret goes after the number is drawn again: after this many digits. */
  const caret = React.useRef<number | null>(null)

  /* The country changed (or the kept number was typed before it was known): the code follows, the digits stay. */
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
    /* Past a closing bracket or a dash that follows the digit just typed. */
    while (want > 0 && at < el.value.length && /[)\-]/.test(el.value[at])) at++
    el.setSelectionRange(at, at)
  }, [shown])

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const before = raw.slice(0, e.target.selectionStart ?? raw.length)
    let next = nationalDigits(raw, cc)
    /* Backspace over a space or a bracket removes the digit before it, not nothing. */
    const native = e.nativeEvent as InputEvent
    if (native.inputType === "deleteContentBackward" && next === digits && raw.length < shown.length) {
      const left = before.replace(/\D/g, "").length
      if (left > 0) next = digits.slice(0, left - 1) + digits.slice(left)
      caret.current = Math.max(0, left - 1)
    } else {
      /* Digits before the caret, less whatever the reading took off the front (a pasted code, a local 0). */
      const typedDigits = raw.replace(/\D/g, "").length
      caret.current = Math.max(0, before.replace(/\D/g, "").length - (typedDigits - next.length))
    }
    onChange(fullNumber(next, cc))
  }

  return (
    <div
      className={cn(
        "flex h-11 w-full items-stretch overflow-hidden rounded-[10px] border border-[#e3e5e8] bg-white text-[16px] text-[#1a1a2e] transition-[border-color,box-shadow] duration-150 hover:border-[#d5d8dd] focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]",
        invalid && "border-[#c4290c] hover:border-[#c4290c] focus-within:border-[#c4290c] focus-within:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]",
      )}
      data-phone-field=""
      onPointerDown={(e) => {
        /* A press on the code puts the caret in the number, as a press anywhere on a field does. */
        if (e.target !== input.current) {
          e.preventDefault()
          input.current?.focus()
        }
      }}
    >
      {code ? (
        <span data-phone-prefix={`+${code}`} className="flex shrink-0 select-none items-center gap-2 border-r border-[#eceef1] pl-3.5 pr-3 tabular-nums text-[#4b5563]">
          <CountryFlag code={cc} />
          +{code}
        </span>
      ) : null}
      <input
        ref={input}
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={code ? `Phone number, after +${code}` : "Phone number, with the country code"}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={code ? examplePhone(cc) : "+40 712 345 678"}
        value={code ? shown : value}
        onChange={code ? change : (e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-[#9ca3af]"
      />
    </div>
  )
}
