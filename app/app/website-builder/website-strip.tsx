"use client"

/**
 * ===========================================================================
 *  THE BAR ABOVE THE WEBSITE'S COVER
 * ===========================================================================
 * How the live website is doing, in one white bar cut into cells by
 * hairlines, the way Shopify's theme page shows a store's web performance:
 *
 *   [ Last 30 days ] Visits | Orders | Conversion | LCP | INP | CLS
 *
 * The first cell is the shared period picker. Each other cell has a title
 * with a dotted underline (rest on it for what the number means), the
 * number, and either the change from the period before or Google's verdict
 * on it. Visits, Orders and Conversion open Analytics for the same period.
 * A speed cell opens what the number means and how phones and computers
 * compare; the open one carries the violet rule along its foot.
 *
 * EVERY NUMBER IS MEASURED. Visits come from the website's own page views,
 * orders from the checkout's record of where each order came from, speed
 * from the visitors' own browsers (lib/website-builder/web-vitals.ts). A
 * number that could not be read says so; a speed with too few page loads
 * behind it says that; a site nobody has measured yet is collecting data.
 * Nothing is ever filled in.
 *
 * The page streams: the bar and its period arrive with the page, and the
 * numbers when the server has counted them. A new period is asked for from
 * app/api/website-builder/performance, with the old numbers dimmed until
 * the new ones land.
 *
 * On a phone the cells are wider than the screen. The bar keeps its corners
 * and the cells scroll sideways inside it, with no scrollbar drawn.
 */

import * as React from "react"
import Link from "next/link"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleAlert, TriangleAlert } from "lucide-react"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { HelpLabel } from "@/components/app/help-label"
import { rangeLabel, todayIn, type RangeValue } from "@/lib/date-range/range"
import { PERIOD_FALLBACK, analyticsHref, periodQuery } from "@/lib/website-builder/site-period"
import type { Figure, WebsitePerformance } from "@/lib/website-builder/site-performance"
import {
  MIN_SAMPLES,
  RATING_LABEL,
  VITAL_DEFINITION,
  VITAL_NAME,
  VITAL_SHORT,
  VITAL_THRESHOLDS,
  formatThreshold,
  formatVital,
  rate,
  type Rating,
  type VitalFigure,
  type VitalName,
} from "@/lib/website-builder/web-vitals"
import { writePeriod } from "@/lib/date-range/params"
import { cn } from "@/lib/utils"

/* ── words ─────────────────────────────────────────────────────────────── */

const TRAFFIC = {
  visits: {
    title: "Visits",
    description: "Visits to your live website in this period. Several pages in one visit count once.",
  },
  orders: {
    title: "Orders",
    description: "Orders placed from your website's Buy buttons and basket. Failed and pending payments are not counted.",
  },
  conversion: {
    title: "Conversion",
    description: "The share of website visits that ended in an order.",
  },
} as const

const VITAL_TITLE: Record<VitalName, string> = {
  lcp: "Loading (LCP)",
  inp: "Responsiveness (INP)",
  cls: "Layout shift (CLS)",
}

/** What the 75th percentile promises, per metric, in plain words. */
const VITAL_FOOT: Record<VitalName, string> = {
  lcp: "Three in four page loads were at least this fast",
  inp: "Three in four visits got an answer at least this fast",
  cls: "Three in four page loads were at least this steady",
}

/* ── the look ──────────────────────────────────────────────────────────── */

const CARD = "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

/**
 * Every number cell: three lines (the title, the number, then the change or
 * the verdict), never wrapped. A cell is at least as wide as what is in it
 * and the cells share what is left, so a long verdict widens its own cell
 * instead of breaking a number in two; when they all cannot fit, the bar
 * scrolls.
 */
const CELL =
  "group/cell relative flex min-w-[132px] flex-[1_0_auto] flex-col justify-center gap-0.5 whitespace-nowrap px-4 py-3 transition-colors duration-150 hover:bg-[#fafbfc] after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:rounded-t-full after:bg-[#8b5cf6] after:opacity-0 after:transition-opacity after:duration-150 data-[active]:bg-[#fafafb] data-[active]:after:opacity-100"

const TITLE = "relative z-10 text-[12.5px] font-medium leading-[18px] text-[#4b5563]"

/** The whole cell answers the press; the title sits above it for its own card. */
const STRETCH =
  "flex flex-col items-start gap-0.5 text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#8b5cf6]/40"

const VALUE = "block text-[17px] font-semibold leading-6 tracking-tight tabular-nums text-[#1a1a2e]"
const MUTED = "block text-[13px] font-medium leading-6 text-[#9ca3af]"
/** The third line, held open even when there is nothing to put on it. */
const META = "flex h-5 items-center gap-1.5 text-[12px] tabular-nums text-[#9ca3af]"

const BADGE: Record<Rating, string> = {
  good: "bg-[#e4f5ea] text-[#0c5132]",
  "needs-improvement": "bg-[#fff1c2] text-[#5e4200]",
  poor: "bg-[#fee9e6] text-[#8e1f0b]",
}

/* ── small pieces ──────────────────────────────────────────────────────── */

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

const count = (n: number) => n.toLocaleString("en-US")
const percent = (r: number) => (r === 0 ? "0%" : `${(r * 100).toFixed(r < 0.1 ? 2 : 1)}%`)

/** The change from the period before, grey, with the arrow Shopify uses. */
function Delta({ change }: { change: number | null }) {
  if (change === null) return null
  const pct = Math.round(Math.abs(change) * 100)
  const Arrow = pct === 0 ? null : change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-[#6b7280]">
      {Arrow && <Arrow className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
      <span className="sr-only">{change > 0 ? "up" : change < 0 ? "down" : "no change"}</span>
      {pct > 999 ? "999+%" : `${pct}%`}
    </span>
  )
}

export function RatingBadge({ rating }: { rating: Rating }) {
  return (
    <span className={cn("inline-flex h-[19px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 text-[11.5px] font-medium", BADGE[rating])}>
      {rating === "good" ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#29845a]" />
      ) : rating === "poor" ? (
        <CircleAlert className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      ) : (
        <TriangleAlert className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      )}
      {RATING_LABEL[rating]}
    </span>
  )
}

/** A value that has not arrived yet: the lines it will take, held open. */
function Waiting() {
  return (
    <>
      <span aria-hidden className="my-[7px] block h-2.5 w-16 rounded-full bg-[#eef0f3]" />
      <span aria-hidden className={META} />
    </>
  )
}

/* ── the cells ─────────────────────────────────────────────────────────── */

type Data = WebsitePerformance | null | undefined

function TrafficCell({
  kind,
  figure,
  data,
  truncated,
  href,
  dim,
}: {
  kind: keyof typeof TRAFFIC
  figure: Figure | null | undefined
  data: Data
  truncated: boolean
  href: string
  dim: boolean
}) {
  const words = TRAFFIC[kind]
  const text =
    figure == null ? null : kind === "conversion" ? percent(figure.value) : `${count(figure.value)}${truncated ? "+" : ""}`
  return (
    <div className={CELL} data-cell={kind}>
      <HelpLabel label={words.title} description={words.description} className={TITLE} />
      <Link href={href} className={cn(STRETCH, "transition-opacity duration-200", dim && "opacity-50")} aria-label={`${words.title}${text ? `, ${text}` : ""}. Open Analytics`}>
        {data === undefined ? (
          <Waiting />
        ) : text === null ? (
          <>
            <span className={MUTED}>Not available</span>
            <span className={META} />
          </>
        ) : (
          <>
            <span className={VALUE}>{text}</span>
            <span className={META}>
              <Delta change={figure?.change ?? null} />
            </span>
          </>
        )}
      </Link>
    </div>
  )
}

type VitalShown =
  | { kind: "waiting" }
  | { kind: "failed" }
  | { kind: "collecting" }
  | { kind: "few"; samples: number }
  | { kind: "value"; value: number; rating: Rating }

function shownOf(name: VitalName, data: Data, figure?: VitalFigure): VitalShown {
  if (data === undefined) return { kind: "waiting" }
  if (data === null) return { kind: "failed" }
  if (data.vitals.kind === "unavailable") return { kind: "collecting" }
  const f = figure ?? data.vitals.metrics[name].all
  if (f.samples === 0) return { kind: "collecting" }
  if (f.p75 === null) return { kind: "few", samples: f.samples }
  return { kind: "value", value: f.p75, rating: rate(name, f.p75) }
}

function VitalValue({ name, shown }: { name: VitalName; shown: VitalShown }) {
  switch (shown.kind) {
    case "waiting":
      return <Waiting />
    case "failed":
    case "collecting":
      return (
        <>
          <span className={MUTED}>{shown.kind === "failed" ? "Not available" : "Collecting data"}</span>
          <span className={META} />
        </>
      )
    case "few":
      return (
        <>
          <span className={cn(MUTED, "text-[#6b7280]")}>Too few visits</span>
          <span className={META}>
            {count(shown.samples)} of {MIN_SAMPLES} page loads
          </span>
        </>
      )
    case "value":
      return (
        <>
          <span className={VALUE}>{formatVital(name, shown.value)}</span>
          <span className={META}>
            <RatingBadge rating={shown.rating} />
          </span>
        </>
      )
  }
}

/** What a speed number means, the lines Google draws, and phones against computers. */
function VitalDetail({ name, data, period }: { name: VitalName; data: Data; period: RangeValue }) {
  const [good, poor] = VITAL_THRESHOLDS[name]
  const metrics = data && data.vitals.kind === "ready" ? data.vitals.metrics[name] : null
  const all = shownOf(name, data)
  return (
    <div data-vital-detail={name}>
      <p className="text-[13px] font-semibold leading-5 text-[#1a1a2e]">{VITAL_NAME[name]}</p>
      <p className="mt-1 text-[12.5px] leading-[18px] text-[#4b5563]">{VITAL_DEFINITION[name]}</p>
      <p className="mt-2 text-[12px] leading-[18px] text-[#6b7280]">
        Good at {formatThreshold(name, good)} or less. Poor over {formatThreshold(name, poor)}.
      </p>
      <dl className="mt-3 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
        {(["mobile", "desktop"] as const).map((device) => {
          const f = metrics?.[device]
          const shown = shownOf(name, data, f)
          return (
            <div key={device} className="flex min-h-[40px] items-center justify-between gap-3 py-2">
              <dt className="text-[#6b7280]">{device === "mobile" ? "Phones" : "Computers"}</dt>
              <dd className="flex items-center gap-2 text-right">
                {shown.kind === "value" ? (
                  <>
                    <span className="font-semibold tabular-nums text-[#1a1a2e]">{formatVital(name, shown.value)}</span>
                    <RatingBadge rating={shown.rating} />
                  </>
                ) : shown.kind === "few" ? (
                  <span className="text-[#9ca3af]">Too few visits ({count(shown.samples)})</span>
                ) : shown.kind === "waiting" ? (
                  <span aria-hidden className="block h-2.5 w-12 rounded-full bg-[#eef0f3]" />
                ) : (
                  <span className="text-[#9ca3af]">{shown.kind === "failed" ? "Not available" : "No visits measured"}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="mt-2.5 text-[12px] leading-[18px] text-[#6b7280]">
        {all.kind === "value" && metrics
          ? `${VITAL_FOOT[name]}, from ${count(metrics.all.samples)} page loads on your live website, ${rangeLabel(period)}.`
          : `Measured in your visitors' browsers on your live website. A number shows once ${MIN_SAMPLES} page loads have been measured.`}
      </p>
    </div>
  )
}

function VitalCell({
  name,
  data,
  period,
  open,
  onOpen,
  phone,
  dim,
}: {
  name: VitalName
  data: Data
  period: RangeValue
  open: boolean
  onOpen: (open: boolean) => void
  phone: boolean
  dim: boolean
}) {
  const shown = shownOf(name, data)
  const title = VITAL_TITLE[name]
  const trigger = (
    <button
      type="button"
      onClick={phone ? () => onOpen(true) : undefined}
      aria-expanded={open}
      aria-label={`${title}${shown.kind === "value" ? `, ${formatVital(name, shown.value)}, ${RATING_LABEL[shown.rating]}` : ""}`}
      className={cn(STRETCH, "transition-opacity duration-200", dim && "opacity-50")}
    >
      <VitalValue name={name} shown={shown} />
    </button>
  )
  const cell = (
    <div className={CELL} data-cell={name} data-active={open ? "" : undefined}>
      <HelpLabel label={title} title={`${VITAL_NAME[name]} (${VITAL_SHORT[name]})`} description={VITAL_DEFINITION[name]} className={TITLE} />
      {phone ? trigger : <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>}
    </div>
  )
  if (phone) {
    return (
      <>
        {cell}
        <BottomSheet isOpen={open} onClose={() => onOpen(false)} title={title}>
          <div className="px-5 pb-3 pt-2">
            <VitalDetail name={name} data={data} period={period} />
          </div>
        </BottomSheet>
      </>
    )
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpen}>
      <PopoverPrimitive.Anchor asChild>{cell}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="help-card z-[2147483640] w-[300px] max-w-[calc(100vw-24px)] rounded-xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left shadow-[0_12px_32px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)] outline-none"
        >
          <VitalDetail name={name} data={data} period={period} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function Cells({
  data,
  period,
  dim,
  openVital,
  setOpenVital,
  phone,
}: {
  data: Data
  period: RangeValue
  dim: boolean
  openVital: VitalName | null
  setOpenVital: (v: VitalName | null) => void
  phone: boolean
}) {
  const href = analyticsHref(period)
  const truncated = !!data?.truncated
  return (
    <>
      <TrafficCell kind="visits" figure={data?.visits} data={data} truncated={truncated} href={href} dim={dim} />
      <TrafficCell kind="orders" figure={data?.orders} data={data} truncated={truncated} href={href} dim={dim} />
      <TrafficCell kind="conversion" figure={data?.conversion} data={data} truncated={false} href={href} dim={dim} />
      {(["lcp", "inp", "cls"] as const).map((name) => (
        <VitalCell
          key={name}
          name={name}
          data={data}
          period={period}
          open={openVital === name}
          onOpen={(o) => setOpenVital(o ? name : null)}
          phone={phone}
          dim={dim}
        />
      ))}
    </>
  )
}

function FirstCells({ figures, ...rest }: { figures: Promise<WebsitePerformance | null> } & Omit<React.ComponentProps<typeof Cells>, "data">) {
  const data = React.use(figures)
  return <Cells data={data} {...rest} />
}

/* ── the bar ───────────────────────────────────────────────────────────── */

export function WebsiteStrip({
  initialPeriod,
  timeZone,
  figures,
}: {
  initialPeriod: RangeValue
  timeZone: string
  /** The first period's numbers, still being counted when the page arrives. */
  figures: Promise<WebsitePerformance | null>
}) {
  const [period, setPeriod] = React.useState(initialPeriod)
  /** Set once a period has been picked here; until then the stream answers. */
  const [picked, setPicked] = React.useState<{ data: WebsitePerformance | null } | null>(null)
  const [pending, setPending] = React.useState(false)
  const [openVital, setOpenVital] = React.useState<VitalName | null>(null)
  const today = React.useMemo(() => todayIn(timeZone, Date.now()), [timeZone])
  const phone = usePhone()
  const asking = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => asking.current?.abort(), [])

  const choose = (next: RangeValue) => {
    setPeriod(next)
    try {
      const url = new URL(window.location.href)
      writePeriod(url.searchParams, next, null, PERIOD_FALLBACK)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* The address is a convenience; the bar works without it. */
    }
    asking.current?.abort()
    const ask = new AbortController()
    asking.current = ask
    setPending(true)
    const q = periodQuery(next, PERIOD_FALLBACK)
    fetch(`/api/website-builder/performance?${q ? `${q}&` : ""}tz=${encodeURIComponent(timeZone)}`, { signal: ask.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { answer?: { figures?: WebsitePerformance } | null } | null) => {
        if (ask.signal.aborted) return
        /* A failed read is shown as one, never as the old period's numbers
           under the new period's name. */
        setPicked({ data: body?.answer?.figures ?? null })
        setPending(false)
      })
      .catch(() => {
        if (ask.signal.aborted) return
        setPicked({ data: null })
        setPending(false)
      })
  }

  const shared = { period, dim: pending, openVital, setOpenVital, phone }

  return (
    <section aria-label="Website performance" data-website-strip="" className={CARD}>
      <div className="flex divide-x divide-[#eceef1] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center px-3 sm:px-4" data-cell="period">
          <span className="relative inline-flex">
            <CalendarDays aria-hidden className="pointer-events-none absolute left-2.5 top-[9px] z-10 h-3.5 w-3.5 text-[#6b7280]" strokeWidth={2} />
            <DateRangePicker value={period} onChange={choose} today={today} className="pl-7" />
          </span>
        </div>
        {picked ? (
          <Cells data={picked.data} {...shared} />
        ) : (
          <React.Suspense fallback={<Cells data={undefined} {...shared} />}>
            <FirstCells figures={figures} {...shared} />
          </React.Suspense>
        )}
      </div>
    </section>
  )
}
