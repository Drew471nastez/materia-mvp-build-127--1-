/**
 * A BLOCK'S STATS, IN ANALYTICS (round 43). The stats sheet on a block in the
 * OnePage editor ends with "See in Analytics": the Analytics page on the
 * same period, filtered to the OnePage (?property=onepage, the place picker's
 * own word, app/app/analytics/analytics-client propertyFromAddress), with the
 * report that lists this kind of block opened over it (?report=, which
 * app/app/analytics/analytics-reports reads once and takes out of the
 * address). Pure, for the sheet and the tests.
 */
import { writePeriod } from "@/lib/date-range/params"
import type { RangeValue } from "@/lib/date-range/range"

/** The report a block's figures belong to: a form's are signups, everything else is taps on links. */
export function blockReportOf(kind: "clicks" | "signups" | "opens"): "links" | "subscribers" {
  return kind === "signups" ? "subscribers" : "links"
}

/** Analytics' own default period is the last seven days, so that one is left out of the address. */
export function blockAnalyticsHref(period: RangeValue | null, kind: "clicks" | "signups" | "opens"): string {
  const params = new URLSearchParams({ property: "onepage" })
  writePeriod(params, period, null, "last_7_days")
  params.set("report", blockReportOf(kind))
  return `/app/analytics?${params.toString()}`
}
