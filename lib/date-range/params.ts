/**
 * A period and its comparison, read from and written to a query string.
 * Pure, so the server, the page and the tests all read one format:
 *
 *   range=<preset> | range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   compare=none|previous_year | compare=custom&cfrom=&cto=
 *   (previous period when compare is absent)
 */
import { isYmd, resolveValue, type CompareValue, type PresetId, type RangeValue, type Ymd } from "./range"

export function readPeriod(params: URLSearchParams, today: Ymd, fallback: PresetId, firstDay?: Ymd): { period: RangeValue; compare: CompareValue } {
  const period = resolveValue(
    {
      preset: (params.get("range") ?? fallback) as RangeValue["preset"],
      start: params.get("from") ?? undefined,
      end: params.get("to") ?? undefined,
    },
    today,
    fallback,
    firstDay,
  )
  const c = params.get("compare")
  const compare: CompareValue =
    c === "none" || c === "previous_year"
      ? { mode: c }
      : c === "custom" && isYmd(params.get("cfrom")) && isYmd(params.get("cto"))
        ? { mode: "custom", range: { start: params.get("cfrom") as Ymd, end: params.get("cto") as Ymd } }
        : { mode: "previous_period" }
  return { period, compare }
}

export function writePeriod(params: URLSearchParams, period: RangeValue | null, compare: CompareValue | null, fallback: PresetId) {
  if (period) {
    if (period.preset === fallback) params.delete("range")
    else params.set("range", period.preset)
    if (period.preset === "custom") {
      params.set("from", period.start)
      params.set("to", period.end)
    } else {
      params.delete("from")
      params.delete("to")
    }
  }
  if (compare) {
    if (compare.mode === "previous_period") params.delete("compare")
    else params.set("compare", compare.mode)
    if (compare.mode === "custom" && compare.range) {
      params.set("cfrom", compare.range.start)
      params.set("cto", compare.range.end)
    } else {
      params.delete("cfrom")
      params.delete("cto")
    }
  }
}
