"use client"

/**
 * The control for `datetime`: the device's own date and time picker, which
 * on a phone is the wheel people already know, and under it the date as the
 * page will print it. Stored as written, `2026-03-14T23:00`, with no time
 * zone added: the creator's "Sunday 11pm" is read as Sunday 11pm wherever
 * it is drawn (lib/storelib-theme/values.ts, parseDatetime).
 */
import { cleanDatetime, formatDatetime } from "@/lib/storelib-theme/values"
import { INPUT, NOTE, TEXT_BUTTON } from "./styles"

export function DateTimeControl({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const clean = cleanDatetime(value)
  /* The picker takes "YYYY-MM-DDTHH:mm" and nothing after it; a stored zone is kept by not editing it away. */
  const shown = clean ? (clean.length === 10 ? `${clean}T00:00` : clean.slice(0, 16)) : ""
  const zone = clean.length > 16 ? clean.slice(16) : ""
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          aria-label={label}
          /* Not a type the sheet's field rule names, so it carries its own phone size. */
          className={`${INPUT} min-w-0 max-sm:h-11 max-sm:text-[16px]`}
          value={shown}
          onChange={(e) => onChange(e.target.value ? `${e.target.value}${zone}` : "")}
        />
        {clean && (
          <button type="button" className={TEXT_BUTTON} onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
      {clean && <p className={NOTE}>Shown as {formatDatetime(clean, "long_time")}</p>}
    </div>
  )
}
