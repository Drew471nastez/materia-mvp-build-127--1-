/**
 * ===========================================================================
 *  THE VERTICAL SCALE OF EVERY ANALYTICS CHART
 * ===========================================================================
 * Shared by the trend chart at the top of Analytics
 * (components/app/analytics-chart.tsx) and the report cards under it
 * (app/app/analytics/analytics-reports.tsx), so a "1" sits at the same place
 * on both and the axes read the same way.
 *
 * WHY A LINE AT 1 LOOKED CUT. The chart asked for `domain={[0, "auto"]}`, and
 * for a day with one view recharts made the top of the plot exactly 1, with
 * ticks at 0, 0.25, 0.5, 0.75 and 1. The line ran along the very top edge, a
 * 2px stroke half above it, the active dot clipped, and an axis of quarter
 * views for something that can only ever be counted whole.
 *
 * So the top is always ABOVE the highest point, by at least a tenth of it,
 * and counts step in whole numbers: a series of 0 and 1 is drawn on 0, 1, 2,
 * with the 1 in the middle of the card.
 *
 * WHY THE AXIS TOOK A QUARTER OF A PHONE. The left gutter was a guess, from a
 * flat 40px to a character count, whatever the numbers were. It is measured
 * here from the labels actually drawn, in the font they are drawn in, so
 * "0 1 2" takes 14px and "$1.2k" takes what it needs.
 */
import { currencyMark } from "@/lib/store/currency"
import { minorUnits } from "@/lib/markets/money"

export interface Scale {
  /** The top of the plot, always above the highest value. */
  top: number
  /** 0 first, `top` last, evenly spaced. */
  ticks: number[]
  step: number
}

/** 1, 2, 2.5, 5 or 10, times a power of ten: the steps an axis reads well in. */
export function niceStep(raw: number, integer = false): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / exp
  const pick = integer && exp < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  const nice = pick.find((p) => f <= p + 1e-9) ?? 10
  const step = nice * exp
  return integer ? Math.max(1, Math.round(step)) : step
}

/**
 * Ticks from 0 to a top with headroom above `max`. `intervals` is how many
 * gaps to aim for; an integer scale never steps by less than one.
 */
export function niceScale(max: number, opts: { integer?: boolean; intervals?: number; headroom?: number } = {}): Scale {
  const integer = opts.integer ?? false
  const intervals = Math.max(1, opts.intervals ?? 3)
  const headroom = opts.headroom ?? 0.1
  if (!(max > 0) || !Number.isFinite(max)) {
    /* Nothing to show: a quiet axis, with the flat line on its floor. */
    const step = integer ? 1 : 1
    return { top: step * 2, step, ticks: [0, step, step * 2] }
  }
  const target = max * (1 + headroom)
  /* Of `intervals` and one more, whichever puts the top nearest the data:
     a highest point of $49 is drawn on $0 to $60, not on $0 to $100. */
  const fit = (k: number) => {
    const s = niceStep(target / k, integer)
    return { step: s, top: Math.max(s, Math.ceil(target / s - 1e-9) * s) }
  }
  const a = fit(intervals)
  const b = fit(intervals + 1)
  const { step, top } = b.top < a.top ? b : a
  const ticks: number[] = []
  for (let t = 0; t <= top + step / 1000; t += step) ticks.push(Number(t.toPrecision(12)))
  return { top: ticks[ticks.length - 1], step, ticks }
}

/* ─── Labels ─────────────────────────────────────────────────────────────── */

const trim = (s: string) => s.replace(/\.0+(?=[a-zA-Z%]|$)/, "").replace(/(\.\d*?)0+(?=[a-zA-Z%]|$)/, "$1")

/** 950, 1.2k, 12k, 1.5M: a count as short as it can be and still be right. */
export function compactCount(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`
  if (a >= 10_000) return `${Math.round(n / 1000)}k`
  if (a >= 1_000) return `${trim((n / 1000).toFixed(1))}k`
  return `${Math.round(n * 100) / 100}`
}

/**
 * Money on an axis, from cents: $0, $5, $2.50, $1.2k. Cents are shown only
 * when the step between ticks needs them. In the store's currency, with its
 * own mark where it writes it: "€1.2k", "1.2k lei" (lib/store/currency); a
 * lei store's revenue axis read "$1.2k".
 */
export function compactMoney(cents: number, step = 100, currency = "USD"): string {
  /* Minor units over the currency's own decimals: a yen store's 2,500 was "¥25" on the axis. */
  const decimals = minorUnits(currency)
  const unit = 10 ** decimals
  const d = cents / unit
  const a = Math.abs(d)
  const n =
    a >= 1_000_000 ? `${trim((d / 1_000_000).toFixed(1))}M` : a >= 10_000 ? `${Math.round(d / 1000)}k` : a >= 1_000 ? `${trim((d / 1000).toFixed(1))}k` : step < unit && d % 1 !== 0 ? d.toFixed(decimals) : `${Math.round(d)}`
  const mark = currencyMark(currency)
  return mark.position === "prefix" ? `${mark.symbol}${n}` : `${n} ${mark.symbol}`
}

/** A fraction as a percentage on an axis: 0%, 2.5%, 40%. */
export function compactPercent(f: number): string {
  const p = f * 100
  return `${p >= 10 || p === 0 ? Math.round(p) : trim(p.toFixed(1))}%`
}

/**
 * How wide a label is in 10px or 11px Inter, from the widths of its
 * characters. Measured, so the gutter is the label's width and not a guess;
 * computed rather than read from a canvas, so the server and the browser
 * draw the first frame the same.
 */
const CHAR_EM: Record<string, number> = {
  "0": 0.62, "1": 0.45, "2": 0.6, "3": 0.61, "4": 0.62, "5": 0.6, "6": 0.61, "7": 0.55, "8": 0.61, "9": 0.61,
  "$": 0.62, ".": 0.26, ",": 0.26, k: 0.52, M: 0.84, "%": 0.86, "-": 0.4, "−": 0.62,
}
export function labelWidth(text: string, fontPx = 10): number {
  let em = 0
  for (const ch of text) em += CHAR_EM[ch] ?? 0.62
  return Math.ceil(em * fontPx)
}

/** The gutter an axis needs: its widest label, and a gap to the plot. */
export function axisWidth(labels: string[], fontPx = 10, gap = 6): number {
  return Math.max(...labels.map((l) => labelWidth(l, fontPx)), 0) + gap
}
