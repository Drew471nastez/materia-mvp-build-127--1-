"use client"

/**
 * ===========================================================================
 *  THE DATA AND MONEY BLOCKS, DRAWN (round AR)
 * ===========================================================================
 * App blocks (lib/onepage/app-blocks) whose drawing does more than link:
 *
 *   Tips      amounts and Tip, through Storelib checkout (./tip-block, round AS)
 *   Poll      a vote kept on the server, one each, the totals after
 *   Stats     numbers counted, rolled or faded in as they come into view
 *   Event     one event: the day, a live countdown, tickets, RSVP, calendar
 *   Paid      a teaser and the price; what it holds once the visitor owns it
 *   Reviews   the store's reviews, a Trustpilot TrustBox, or a Google score
 *   RSS       a feed's latest posts under its card
 *
 * Each draws in the page's own button colours (./app-block useParts), the
 * same in the editor's preview and on the live page. In the preview nothing
 * is sent anywhere: a vote stays local, a tip and paid access say what would
 * happen (lib/onepage/preview-notice), and the preview asks
 * /api/onepage/blocks-live for what the live page's server fills in.
 */

import * as React from "react"
import { ArrowUpRight, CalendarPlus, Check, Lock, MapPin, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { useBlockSheet } from "@/components/onepage/block-sheet"
import { CardButton, MIX, px, useParts, useTrack, type AppBlockLook } from "@/components/onepage/app-block"
import { pressableProps } from "@/lib/onepage/block-look"
import { chipColors } from "@/lib/onepage/contrast"
import { socialLinkId } from "@/lib/onepage/link-keys"
import { appItems, appLayoutOf, pollOptions, type AppBlockData, type AppItem } from "@/lib/onepage/app-blocks"
import { pollShowsResults, type PollTally } from "@/lib/onepage/poll"
import { countDuration, easeOutCubic, parseStatValue, statAnimationOf, statFrame, type StatAnimation } from "@/lib/onepage/stat-count"
import { readTrustBox, reviewSourceOf, starShares, trustBoxSrc } from "@/lib/onepage/reviews-block"
import { showPreviewNotice } from "@/lib/onepage/preview-notice"
import type { OnePageBlock } from "@/lib/onepage/types"

type Props = { block: OnePageBlock; data: AppBlockData; look: AppBlockLook }

/* i18n-ignore-start: a company's own name. */
const TRUSTPILOT = "Trustpilot"
/* i18n-ignore-end */

/* ─── Shared ──────────────────────────────────────────────────────────── */

/** The visitor's device asks for less motion. Read after mounting, so the server's HTML and the first render agree. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const q = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduce(q.matches)
    on()
    q.addEventListener?.("change", on)
    return () => q.removeEventListener?.("change", on)
  }, [])
  return reduce
}

/** True once the element has come a quarter of the way into view, and stays true. */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null)
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

/**
 * THE PREVIEW ASKS FOR WHAT THE LIVE PAGE IS GIVEN (as ./storelib-blocks
 * useLiveData): the live page's server fills reviews, a feed, Bandsintown's
 * dates, a product's price and whether tips can be taken before it is sent;
 * the editor's preview asks /api/onepage/blocks-live for the same once the
 * typing stops. On the live page `filled` is already true and nothing is asked.
 */
export function useFilled(block: OnePageBlock, data: AppBlockData, look: AppBlockLook, filled: boolean): AppBlockData {
  const need = !filled && !!look.preview && !!look.sellerId
  const key = need ? JSON.stringify(data) : ""
  const [answer, setAnswer] = React.useState<{ key: string; data: AppBlockData } | null>(null)
  React.useEffect(() => {
    if (!need) return
    let live = true
    const t = window.setTimeout(() => {
      fetch("/api/onepage/blocks-live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seller_id: look.sellerId, blocks: [{ id: block.id, type: "app", data }] }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const got = d?.blocks?.[0]?.data
          if (live && got && typeof got === "object") setAnswer({ key, data: got as AppBlockData })
        })
        .catch(() => {})
    }, 450)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return need && answer && answer.key === key ? answer.data : data
}

function Title({ text, look }: { text?: string | null; look: AppBlockLook }) {
  if (!text?.trim()) return null
  return (
    <p className="mb-2 text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
      {text}
    </p>
  )
}

function StarRow({ value, size, color = "#F5A524" }: { value: number; size: number; color?: string }) {
  return (
    <span className="inline-flex" aria-label={tt("{value} out of 5", { value: value.toFixed(1) })} data-stars={value}>
      {starShares(value).map((share, i) => (
        <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
          <Star aria-hidden className="absolute inset-0" style={{ width: size, height: size, opacity: 0.28 }} />
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${share * 100}%` }}>
            <Star aria-hidden fill={color} stroke={color} style={{ width: size, height: size }} />
          </span>
        </span>
      ))}
    </span>
  )
}

/* ─── Tips ────────────────────────────────────────────────────────────── */

/* Round AS: the tips card and its amount sheet are their own file (./tip-block). */

/* ─── A poll ──────────────────────────────────────────────────────────── */

export function DataPollView({ block, data, look }: Props) {
  const parts = useParts(look)
  const options = pollOptions(data)
  const showResults = pollShowsResults(data)
  const [voted, setVoted] = React.useState<string | null>(null)
  const [tally, setTally] = React.useState<PollTally | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [grown, setGrown] = React.useState(false)

  React.useEffect(() => {
    if (look.preview || !look.onepageId) return
    let live = true
    fetch(`/api/onepage/poll?onepage_id=${encodeURIComponent(look.onepageId)}&block_id=${encodeURIComponent(block.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return
        if (typeof d.voted === "string") setVoted(d.voted)
        if (d.tally) setTally(d.tally)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [look.preview, look.onepageId, block.id])

  /* The bars grow from nothing once the totals arrive. */
  React.useEffect(() => {
    if (!tally) return
    const t = window.setTimeout(() => setGrown(true), 30)
    return () => window.clearTimeout(t)
  }, [tally])

  if (!data.poll_question?.trim() || options.length < 2) return null
  const vote = async (id: string) => {
    if (voted || busy) return
    setVoted(id)
    if (look.preview || !look.onepageId) {
      setNote(tt("Votes are counted on your live page."))
      return
    }
    setBusy(true)
    try {
      const r = await fetch("/api/onepage/poll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ onepage_id: look.onepageId, block_id: block.id, option_id: id }) })
      const d = await r.json().catch(() => null)
      if (r.ok) {
        if (typeof d?.voted === "string") setVoted(d.voted)
        if (d?.tally) setTally(d.tally)
      } else {
        setVoted(null)
        setNote(d?.error === "not_ready" ? tt("This poll is not taking votes yet.") : r.status === 429 ? tt("That is a lot of votes from one connection. Try again tomorrow.") : tt("Your vote did not go through. Try again."))
      }
    } catch {
      setVoted(null)
      setNote(tt("Your vote did not go through. Try again."))
    }
    setBusy(false)
  }
  const results = !!tally && showResults
  const row = (id: string) => tally?.options.find((o) => o.id === id)
  /*
    Round AR: each option is the page's button made to read on the card
    (parts.onCard), with the page's hover until a vote is in. It was a
    hairline pill whatever the page's buttons were. The vote and the result
    bars are a shade that the option's words read on (lib/onepage/contrast
    chipColors), not the words' own colour laid under them.
  */
  const option = pressableProps(parts.onCard, look.still)
  const shade = { on: chipColors(parts.onCard, 24), off: chipColors(parts.onCard, 12) }
  return (
    <div data-onepage-app="poll" data-app-layout="card" className="w-full text-left" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(14, look.scale) }}>
      <p className="font-semibold" style={{ fontSize: px(15.5, look.scale) }} data-block-title="">{data.poll_question}</p>
      <div role="radiogroup" aria-label={data.poll_question} className="mt-3 flex flex-col" style={{ gap: px(8, look.scale) }}>
        {options.map((o) => {
          const on = voted === o.id
          const r = results ? row(o.id) : null
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!!voted}
              onClick={() => vote(o.id)}
              data-poll-option={o.id}
              data-hover={voted ? "none" : option["data-hover"]}
              data-shadow={option["data-shadow"]}
              className={cn(option.className, "relative flex w-full items-center justify-between overflow-hidden text-left font-medium disabled:cursor-default", voted && !on && !results && "opacity-60")}
              style={{ ...option.style, ...(results ? { color: shade.on.color } : null), padding: `${px(10, look.scale)} ${px(14, look.scale)}`, fontSize: px(14, look.scale) }}
            >
              {r || (on && !results) ? (
                <span
                  aria-hidden
                  data-poll-bar={r ? r.percent : undefined}
                  className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ width: r ? (grown ? `${r.percent}%` : "0%") : "100%", background: on ? shade.on.background : shade.off.background }}
                />
              ) : null}
              <span className="relative flex min-w-0 items-center gap-1.5">
                <span className="truncate">{o.label}</span>
                {on ? <Check aria-hidden className="shrink-0" style={{ width: px(15, look.scale), height: px(15, look.scale) }} /> : null}
              </span>
              {r ? <span className="relative shrink-0 tabular-nums" data-poll-percent="">{r.percent}%</span> : null}
            </button>
          )
        })}
      </div>
      {results ? (
        <p className="mt-2.5 opacity-75" style={{ fontSize: px(12.5, look.scale) }} data-poll-total="">
          {tt("{count, plural, one {# vote} other {# votes}}", { count: tally!.total })}
        </p>
      ) : voted && !note ? (
        <p className="mt-2.5 opacity-75" style={{ fontSize: px(12.5, look.scale) }} data-poll-thanks="">{tt("Thanks for voting")}</p>
      ) : null}
      {note ? <p className="mt-2.5 opacity-75" style={{ fontSize: px(12.5, look.scale) }} data-poll-note="">{note}</p> : null}
    </div>
  )
}

/* ─── Stats ───────────────────────────────────────────────────────────── */

/**
 * ONE NUMBER, ARRIVING. The final number sits invisibly in the same cell the
 * moving one is drawn in, so the tile is its final width from the first frame
 * and nothing around it moves while it counts. A number that is not one
 * ("Top 10") is drawn as typed.
 */
function StatValue({ value, mode, run, delay }: { value: string; mode: StatAnimation; run: boolean; delay: number }) {
  const n = parseStatValue(value)
  const [shown, setShown] = React.useState(() => (n && mode === "count" ? statFrame(n, 0) : value))
  React.useEffect(() => {
    if (!n || mode !== "count") {
      setShown(value)
      return
    }
    if (!run) {
      setShown(statFrame(n, 0))
      return
    }
    let raf = 0
    const length = countDuration(n)
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t + delay
      const share = (t - start) / length
      setShown(statFrame(n, share <= 0 ? 0 : easeOutCubic(share)))
      if (share < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, mode, run, delay]) // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "roll" && n) {
    const chars = [...value]
    return (
      <span className="inline-flex" aria-label={value} data-stat-mode="roll">
        {chars.map((c, i) =>
          /\d/.test(c) ? (
            <span key={i} aria-hidden className="relative inline-block overflow-hidden" style={{ height: "1.05em", width: "0.62em" }}>
              <span
                className="absolute left-0 top-0 flex flex-col transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ transform: `translateY(${run ? -Number(c) * 1.05 : 0}em)`, transitionDelay: `${delay + i * 70}ms`, willChange: "transform" }}
              >
                {"0123456789".split("").map((d) => (
                  <span key={d} className="block text-center" style={{ height: "1.05em", lineHeight: "1.05em" }}>
                    {d}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i} aria-hidden>
              {c}
            </span>
          ),
        )}
      </span>
    )
  }
  if (mode === "fade") {
    return (
      <span
        data-stat-mode="fade"
        className="inline-block transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ opacity: run ? 1 : 0, transform: run ? "none" : "translateY(0.35em)", transitionDelay: `${delay}ms` }}
      >
        {value}
      </span>
    )
  }
  return (
    <span className="inline-grid" data-stat-mode={n && mode === "count" ? "count" : "none"}>
      <span aria-hidden className="invisible [grid-area:1/1]">{value}</span>
      <span className="[grid-area:1/1]" aria-label={value}>
        <span aria-hidden>{shown}</span>
      </span>
    </span>
  )
}

export function DataStatsView({ block, data, look }: Props) {
  const parts = useParts(look)
  const stats = appItems(data)
  const layout = appLayoutOf(data)
  const reduce = useReducedMotion()
  const chosen = statAnimationOf(data)
  const mode: StatAnimation = reduce ? "none" : chosen
  const [ref, seen] = useSeen<HTMLDivElement>()
  /* The editor's preview plays it again when the choice changes, so the creator sees what they picked. */
  const [replay, setReplay] = React.useState(0)
  const firstMode = React.useRef(chosen)
  React.useEffect(() => {
    if (firstMode.current === chosen) return
    firstMode.current = chosen
    setReplay((n) => n + 1)
  }, [chosen])
  const [run, setRun] = React.useState(false)
  React.useEffect(() => {
    if (!seen) return
    setRun(false)
    const t = window.setTimeout(() => setRun(true), replay ? 60 : 0)
    return () => window.clearTimeout(t)
  }, [seen, replay])
  if (!stats.length) return null
  const live = mode === "none" || run
  const tile = (s: AppItem, i: number, big = false) => (
    <div key={s.id} data-app-stat={s.id} className="flex flex-col items-center justify-center text-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: `${px(big ? 22 : 14, look.scale)} ${px(10, look.scale)}` }}>
      <span className="font-bold tabular-nums tracking-[-0.02em]" style={{ fontSize: px(big ? 40 : 26, look.scale), lineHeight: 1.05 }}>
        <StatValue value={s.value || ""} mode={mode} run={live} delay={i * 90} />
      </span>
      <span className="mt-1 opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{s.title}</span>
    </div>
  )
  /* One card, the numbers side by side with a hairline between: "card". On the page itself, no card: "classic". */
  const band = (onCard: boolean) => (
    <div className="flex items-stretch" style={onCard ? { ...parts.surface, borderRadius: parts.radius, padding: `${px(16, look.scale)} ${px(6, look.scale)}` } : { color: look.theme.text_color, padding: `${px(6, look.scale)} 0` }}>
      {stats.slice(0, 4).map((s, i) => (
        <div key={s.id} data-app-stat={s.id} className="flex min-w-0 flex-1 flex-col items-center justify-center text-center" style={{ borderLeft: i ? `1px solid ${MIX[16]}` : undefined, padding: `0 ${px(6, look.scale)}` }}>
          <span className="font-bold tabular-nums tracking-[-0.02em]" style={{ fontSize: px(stats.length > 3 ? 21 : 26, look.scale), lineHeight: 1.05 }}>
            <StatValue value={s.value || ""} mode={mode} run={live} delay={i * 90} />
          </span>
          <span className="mt-1 truncate opacity-75" style={{ fontSize: px(12, look.scale), maxWidth: "100%" }}>{s.title}</span>
        </div>
      ))}
    </div>
  )
  return (
    <div ref={ref} data-onepage-app="stats" data-app-layout={layout} data-stat-animation={mode} className="w-full" key={`${block.id}-${replay}`}>
      <Title text={data.title} look={look} />
      {layout === "single" ? (
        tile(stats[0], 0, true)
      ) : layout === "carousel" ? (
        <div className="-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ gap: px(10, look.scale) }}>
          {stats.map((s, i) => (
            <div key={s.id} className="w-[42%] shrink-0 snap-start">{tile(s, i)}</div>
          ))}
        </div>
      ) : layout === "card" ? (
        band(true)
      ) : layout === "classic" ? (
        band(false)
      ) : (
        <div className="grid grid-cols-2" style={{ gap: px(10, look.scale) }}>{stats.map((s, i) => tile(s, i))}</div>
      )}
    </div>
  )
}

/* ─── One event ───────────────────────────────────────────────────────── */

function useNow(everyMs: number, on: boolean): number {
  const [now, setNow] = React.useState(0)
  React.useEffect(() => {
    setNow(Date.now())
    if (!on) return
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs, on])
  return now
}

function untilText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  if (d > 0) return tt("Starts in {d}d {h}h", { d, h })
  if (h > 0) return tt("Starts in {h}h {m}m", { h, m: min })
  return tt("Starts in {m}m", { m: min })
}

/** The event as a calendar file every phone opens. */
function icsOf(data: AppBlockData, start: number, pageUrl: string): string {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1")
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Storelib//OnePage//EN",
    "BEGIN:VEVENT",
    `UID:${Math.round(start / 1000)}-${pageUrl.length}@storelib`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + 2 * 3600_000)}`,
    `SUMMARY:${esc((data.title || "").slice(0, 120))}`,
    data.venue ? `LOCATION:${esc(data.venue.slice(0, 200))}` : "",
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")
}

function RsvpForm({ blockId, look, title }: { blockId: string; look: AppBlockLook; title: string }) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [keep, setKeep] = React.useState(false)
  const [trap, setTrap] = React.useState("")
  const [state, setState] = React.useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const shownAt = React.useRef(0)
  React.useEffect(() => {
    shownAt.current = Date.now()
  }, [])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state !== "idle") return
    if (look.preview || !look.onepageId) {
      showPreviewNotice("link")
      return
    }
    setState("busy")
    setError(null)
    try {
      const r = await fetch("/api/onepage/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ onepage_id: look.onepageId, block_id: blockId, name, email, keep_posted: keep, company: trap, elapsed: Date.now() - shownAt.current }),
      })
      const d = await r.json().catch(() => null)
      if (r.ok) setState("done")
      else {
        setState("idle")
        setError(typeof d?.error === "string" ? d.error : tt("That did not go through. Try again."))
      }
    } catch {
      setState("idle")
      setError(tt("That did not go through. Try again."))
    }
  }
  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-[#111113]" data-rsvp-done="">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#111113] text-white">
          <Check aria-hidden className="h-6 w-6" />
        </span>
        <p className="text-[17px] font-semibold">{tt("You're on the list")}</p>
        <p className="text-[14px] text-[#6b7280]">{title}</p>
      </div>
    )
  }
  const field = "h-12 w-full rounded-xl border border-[#e3e4e8] bg-white px-4 text-[16px] text-[#111113] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#111113] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.08)]"
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 py-2 text-left text-[#111113]" data-rsvp-form="">
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
      <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={tt("Your name")} aria-label={tt("Your name")} autoComplete="name" maxLength={80} required />
      <input className={field} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tt("Email")} aria-label={tt("Email")} autoComplete="email" required />
      <label className="flex min-h-11 items-center gap-3 text-[14px]">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-5 w-5 accent-[#111113]" />
        {tt("Send me news by email too")}
      </label>
      {error ? <p className="text-[13px] font-medium text-[#b42318]" role="alert">{error}</p> : null}
      <button type="submit" disabled={state === "busy"} className="h-12 rounded-full bg-[#111113] text-[15px] font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.985] disabled:opacity-60">
        {state === "busy" ? tt("Saving...") : tt("RSVP")}
      </button>
    </form>
  )
}

export function DataEventView({ block, data, look }: Props) {
  const parts = useParts(look)
  const track = useTrack(look)
  const sheet = useBlockSheet()
  const start = Date.parse(data.event_start || "")
  const now = useNow(30_000, !Number.isNaN(start))
  const [locale, setLocale] = React.useState("en-US")
  React.useEffect(() => setLocale(navigator.language || "en-US"), [])
  if (!data.title?.trim() || Number.isNaN(start)) return null
  const layout = appLayoutOf(data)
  const over = now > 0 && now > start + 6 * 3600_000
  const soon = now > 0 && !over && start > now
  const date = new Date(start)
  const month = date.toLocaleString(locale, { month: "short" }).replace(".", "").toUpperCase()
  const day = String(date.getDate())
  const when = date.toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" })
  const tickets = (() => {
    try {
      return data.url && /^https?:\/\//i.test(data.url) ? new URL(data.url).toString() : null
    } catch {
      return null
    }
  })()
  const openRsvp = () => {
    track(socialLinkId(block.id, "rsvp"), "#rsvp")
    if (!sheet.available) return
    sheet.open({ blockId: block.id, title: data.title || tt("Event"), body: <RsvpForm blockId={block.id} look={look} title={data.title || ""} /> })
  }
  const addToCalendar = () => {
    track(socialLinkId(block.id, "calendar"), "#calendar")
    const blob = new Blob([icsOf(data, start, window.location.href)], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(data.title || "event").replace(/[^\w .-]+/g, "").trim() || "event"}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  /* Round AR: on the card, a chip in colours that read on it (lib/onepage/contrast chipColors); over a photo, white words on dark glass. */
  const onPhoto = layout === "featured" && !!data.image_url
  const chip = (
    <span className="flex shrink-0 flex-col items-center justify-center rounded-xl text-center" style={{ width: px(50, look.scale), height: px(54, look.scale), ...(onPhoto ? { background: "rgba(0, 0, 0, 0.32)", color: "#ffffff" } : parts.chip) }} data-event-day="">
      <span suppressHydrationWarning className="font-semibold tracking-[0.04em]" style={{ fontSize: px(10.5, look.scale) }}>{month}</span>
      <span suppressHydrationWarning className="font-bold tabular-nums leading-none" style={{ fontSize: px(21, look.scale) }}>{day}</span>
    </span>
  )
  const actions = over ? (
    <p className="opacity-70" style={{ fontSize: px(13, look.scale) }} data-event-over="">{tt("This event has ended")}</p>
  ) : (
    <div className="flex flex-wrap items-center" style={{ gap: px(8, look.scale) }}>
      {tickets ? <CardButton label={data.button_text?.trim() || tt("Tickets")} look={look} href={tickets} onClick={() => track(socialLinkId(block.id, "tickets"), tickets)} /> : null}
      {data.rsvp ? <CardButton label={tt("RSVP")} look={look} onClick={openRsvp} /> : null}
      <button type="button" onClick={addToCalendar} data-event-calendar="" className="inline-flex items-center gap-1.5 font-medium opacity-80 transition-opacity hover:opacity-100" style={{ fontSize: px(13, look.scale), minHeight: px(36, look.scale) }}>
        <CalendarPlus aria-hidden style={{ width: px(15, look.scale), height: px(15, look.scale) }} />
        {tt("Add to calendar")}
      </button>
    </div>
  )
  const lines = (
    <>
      <p className="font-semibold leading-snug" style={{ fontSize: px(layout === "featured" ? 19 : 16, look.scale) }} data-block-title="">{data.title}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 opacity-80" style={{ fontSize: px(13, look.scale) }}>
        <span suppressHydrationWarning>{when}</span>
        {data.venue?.trim() ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin aria-hidden className="shrink-0" style={{ width: px(12, look.scale), height: px(12, look.scale) }} />
            <span className="truncate">{data.venue}</span>
          </span>
        ) : null}
      </p>
      {soon ? (
        <p className="mt-1 font-medium tabular-nums" style={{ fontSize: px(12.5, look.scale) }} data-event-countdown="">
          {untilText(start - now)}
        </p>
      ) : null}
    </>
  )
  if (layout === "classic") {
    return (
      <div data-onepage-app="event" data-app-layout="classic" className="flex w-full items-center text-left" style={{ ...parts.press.style, borderRadius: parts.radius, padding: `${px(10, look.scale)} ${px(12, look.scale)}`, gap: px(12, look.scale) }}>
        {chip}
        <span className="min-w-0 flex-1">{lines}</span>
        {!over && (tickets || data.rsvp) ? <CardButton label={tickets ? data.button_text?.trim() || tt("Tickets") : tt("RSVP")} look={look} href={tickets} onClick={tickets ? () => track(socialLinkId(block.id, "tickets"), tickets) : openRsvp} /> : null}
      </div>
    )
  }
  if (layout === "featured") {
    return (
      /* Round AR: without a picture the featured card is the page's button as a card (parts.surface), as the other layouts are. It named a part that no longer existed and drew nothing behind white words. */
      <div data-onepage-app="event" data-app-layout="featured" className="relative w-full overflow-hidden text-left" style={data.image_url ? { borderRadius: parts.radius, background: "#111113", color: "#ffffff" } : { ...parts.surface, borderRadius: parts.radius }}>
        {data.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className={cn("relative flex min-h-[220px] flex-col justify-end", data.image_url && "bg-[linear-gradient(180deg,rgba(0,0,0,0)_20%,rgba(0,0,0,0.72))]")} style={{ padding: px(16, look.scale) }}>
          <div className="flex items-end" style={{ gap: px(12, look.scale) }}>
            {chip}
            <div className="min-w-0 flex-1">{lines}</div>
          </div>
          {data.text?.trim() ? <p className="mt-2 line-clamp-3 opacity-90" style={{ fontSize: px(13.5, look.scale) }}>{data.text}</p> : null}
          <div className="mt-3">{actions}</div>
        </div>
      </div>
    )
  }
  return (
    <div data-onepage-app="event" data-app-layout="card" className="w-full overflow-hidden text-left" style={{ ...parts.surface, borderRadius: parts.radius }}>
      {data.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image_url} alt="" className="block aspect-[16/9] w-full object-cover" />
      ) : null}
      <div style={{ padding: px(14, look.scale) }}>
        <div className="flex items-start" style={{ gap: px(12, look.scale) }}>
          {chip}
          <div className="min-w-0 flex-1">{lines}</div>
        </div>
        {data.text?.trim() ? <p className="mt-2.5 line-clamp-4 opacity-85" style={{ fontSize: px(13.5, look.scale) }}>{data.text}</p> : null}
        <div className="mt-3">{actions}</div>
      </div>
    </div>
  )
}

/* ─── Paid access ───────────────────────────────────────────────────── */

export function DataPaidView({ block, data: given, look }: Props) {
  const data = useFilled(block, given, look, given.paid_ready !== undefined)
  const parts = useParts(look)
  const track = useTrack(look)
  const [open, setOpen] = React.useState<{ text: string; url: string | null; label: string | null } | null>(null)
  const [state, setState] = React.useState<"idle" | "busy" | "locked">("idle")
  const [signedIn, setSignedIn] = React.useState(false)

  const check = React.useCallback(
    async (quiet: boolean) => {
      if (look.preview || !look.onepageId) {
        if (!quiet) showPreviewNotice("payment")
        return
      }
      setState("busy")
      try {
        const r = await fetch("/api/onepage/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ onepage_id: look.onepageId, block_id: block.id }) })
        const d = await r.json().catch(() => null)
        if (r.ok && d && typeof d.text === "string") {
          setOpen({ text: d.text, url: typeof d.url === "string" ? d.url : null, label: typeof d.label === "string" ? d.label : null })
          setState("idle")
          return
        }
        setSignedIn(!!d?.signed_in)
        setState(quiet ? "idle" : "locked")
      } catch {
        setState("idle")
      }
    },
    [look.preview, look.onepageId, block.id],
  )
  /* A browser that bought something on Storelib carries a hint cookie: only then is the check made without a tap. */
  React.useEffect(() => {
    if (look.preview || !look.onepageId) return
    if (/(?:^|;\s*)sl_owned_hint=/.test(document.cookie)) void check(true)
  }, [look.preview, look.onepageId, check])

  if (data.paid_ready === false) return null
  const title = data.title?.trim() || data.paid_title || tt("Members only")
  const buy = data.paid_checkout || null
  if (open) {
    return (
      <div data-onepage-app="paid" data-paid-open="" className="w-full text-left" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(16, look.scale) }}>
        <p className="font-semibold" style={{ fontSize: px(16, look.scale) }} data-block-title="">{title}</p>
        {open.text ? <p className="mt-2 whitespace-pre-line" style={{ fontSize: px(14, look.scale) }}>{open.text}</p> : null}
        {open.url ? (
          <div className="mt-3">
            <CardButton label={open.label || tt("Open")} look={look} href={open.url} wide onClick={() => track(socialLinkId(block.id, "open"), open.url!)} />
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div data-onepage-app="paid" data-app-layout={appLayoutOf(data)} className="w-full text-left" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(16, look.scale) }}>
      <div className="flex items-start" style={{ gap: px(12, look.scale) }}>
        <span className="grid shrink-0 place-items-center rounded-full" style={{ width: px(40, look.scale), height: px(40, look.scale), background: MIX[12] }}>
          <Lock aria-hidden style={{ width: px(18, look.scale), height: px(18, look.scale) }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug" style={{ fontSize: px(16, look.scale) }} data-block-title="">{title}</p>
          {data.text?.trim() ? <p className="mt-1 opacity-80" style={{ fontSize: px(13.5, look.scale) }}>{data.text}</p> : null}
        </div>
      </div>
      {/* What it holds, blurred lines and never the words: they are not in the page until it is opened. */}
      <div aria-hidden className="mt-3 flex flex-col gap-1.5 rounded-xl p-3" style={{ background: MIX[10] }} data-paid-blur="">
        {[92, 78, 64].map((w) => (
          <span key={w} className="block h-2.5 rounded-full" style={{ width: `${w}%`, background: MIX[16] }} />
        ))}
      </div>
      <div className="mt-3 flex flex-col" style={{ gap: px(8, look.scale) }}>
        <CardButton
          wide
          look={look}
          label={data.button_text?.trim() || (data.paid_price ? tt("Get access for {price}", { price: data.paid_price }) : tt("Get access"))}
          href={look.preview ? null : buy}
          onClick={(e) => {
            if (look.preview || !buy) {
              e.preventDefault()
              showPreviewNotice("payment")
              return
            }
            track(block.id, buy)
          }}
        />
        <button type="button" onClick={() => void check(false)} disabled={state === "busy"} className="font-medium opacity-80 underline-offset-2 transition-opacity hover:underline hover:opacity-100 disabled:opacity-50" style={{ fontSize: px(13, look.scale), minHeight: px(36, look.scale) }} data-paid-check="">
          {state === "busy" ? tt("Checking...") : tt("Already bought it? Open it")}
        </button>
        {state === "locked" ? (
          <p className="text-center opacity-80" style={{ fontSize: px(12.5, look.scale) }} role="status" data-paid-locked="">
            {signedIn ? tt("This account has not bought it yet.") : (
              <>
                {tt("Sign in with the email you bought it with.")}{" "}
                <a className="font-medium underline underline-offset-2" href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}>{tt("Sign in")}</a>
              </>
            )}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/* ─── Reviews ─────────────────────────────────────────────────────────── */

type ReviewItem = NonNullable<AppBlockData["review_items"]>[number]

function ReviewCard({ r, look, clamp = true }: { r: ReviewItem; look: AppBlockLook; clamp?: boolean }) {
  const parts = useParts(look)
  return (
    <div className="flex h-full flex-col text-left" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(14, look.scale) }} data-review={r.id}>
      <StarRow value={r.rating} size={Math.round(14 * (look.scale === "small" ? 0.8 : 1))} />
      {r.title ? <p className="mt-1.5 font-semibold" style={{ fontSize: px(14, look.scale) }}>{r.title}</p> : null}
      {r.body ? <p className={cn("mt-1 opacity-85", clamp && "line-clamp-4")} style={{ fontSize: px(13.5, look.scale) }}>{r.body}</p> : null}
      <p className="mt-auto pt-2 opacity-65" style={{ fontSize: px(12, look.scale) }}>
        {[r.author, r.verified ? tt("Verified buyer") : null, r.product_title || null].filter(Boolean).join(" · ")}
      </p>
    </div>
  )
}

/** Every review, in the sheet: on the sheet's own light surface. */
function ReviewSheetList({ items, summary }: { items: ReviewItem[]; summary: AppBlockData["review_summary"] }) {
  return (
    <div className="flex flex-col gap-3 py-2 text-left text-[#111113]" data-review-sheet="">
      {summary ? (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-[28px] font-bold tabular-nums">{summary.average_label}</span>
          <StarRow value={summary.average} size={16} />
          <span className="text-[13px] text-[#6b7280]">{summary.count_label}</span>
        </div>
      ) : null}
      {items.map((r) => (
        <div key={r.id} className="rounded-2xl bg-[#f4f4f6] p-4">
          <StarRow value={r.rating} size={14} />
          {r.title ? <p className="mt-1.5 text-[15px] font-semibold">{r.title}</p> : null}
          {r.body ? <p className="mt-1 text-[14.5px] leading-relaxed text-[#374151]">{r.body}</p> : null}
          <p className="mt-2 text-[12.5px] text-[#6b7280]">{[r.author, r.date, r.verified ? tt("Verified buyer") : null].filter(Boolean).join(" · ")}</p>
        </div>
      ))}
    </div>
  )
}

export function DataReviewsView({ block, data: given, look }: Props) {
  const source = reviewSourceOf(given)
  const data = useFilled(block, given, look, source !== "storelib" || Array.isArray(given.review_items))
  const parts = useParts(look)
  const track = useTrack(look)
  const sheet = useBlockSheet()
  const layout = appLayoutOf(data)

  if (source === "trustpilot") {
    const box = readTrustBox(data.trustbox)
    if (!box) return null
    return (
      <div data-onepage-app="reviews" data-review-source="trustpilot" className="w-full">
        <Title text={data.title} look={look} />
        <div className="w-full overflow-hidden" style={{ ...parts.surface, background: box.theme === "dark" ? "#191919" : "#ffffff", borderRadius: parts.radius, padding: px(10, look.scale) }}>
          <iframe title={TRUSTPILOT} src={trustBoxSrc(box)} loading="lazy" className="block w-full border-0" style={{ height: box.height }} referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      </div>
    )
  }

  if (source === "google") {
    const rating = typeof data.rating === "number" && data.rating >= 1 && data.rating <= 5 ? Math.round(data.rating * 10) / 10 : null
    const href = (() => {
      try {
        return data.url ? new URL(/^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`).toString() : null
      } catch {
        return null
      }
    })()
    if (!href) return null
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => track(block.id, href)} data-onepage-app="reviews" data-review-source="google" className="flex w-full items-center text-left" style={{ ...parts.press.style, borderRadius: parts.radius, padding: px(14, look.scale), gap: px(12, look.scale) }}>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{data.title?.trim() || tt("Google reviews")}</span>
          {rating ? (
            <span className="mt-1 flex items-center gap-1.5" style={{ fontSize: px(13, look.scale) }}>
              <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
              <StarRow value={rating} size={14} color="#FBBC04" />
              {typeof data.reviews_count === "number" && data.reviews_count > 0 ? <span className="opacity-75 tabular-nums">({data.reviews_count})</span> : null}
            </span>
          ) : null}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium" style={{ fontSize: px(13, look.scale) }}>
          {data.button_text?.trim() || tt("Read reviews")}
          <ArrowUpRight aria-hidden style={{ width: px(14, look.scale), height: px(14, look.scale) }} />
        </span>
      </a>
    )
  }

  const items = Array.isArray(data.review_items) ? data.review_items : []
  const summary = data.review_summary ?? null
  if (!items.length) {
    /* The editor's preview says where the reviews come from; the live page leaves an empty block out (appBlockHasContent). */
    if (!look.preview) return null
    return (
      <div data-onepage-app="reviews" data-review-empty="" className="w-full text-center opacity-80" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(16, look.scale), fontSize: px(13.5, look.scale) }}>
        {tt("Your Storelib reviews show here once you have some.")}
      </div>
    )
  }
  const openAll = () => {
    track(block.id, "#reviews")
    if (sheet.available) sheet.open({ blockId: block.id, title: data.title?.trim() || tt("Reviews"), body: <ReviewSheetList items={items} summary={summary} /> })
  }
  const head = summary ? (
    <div className="mb-2.5 flex items-center justify-center gap-2" style={{ color: look.theme.text_color, fontSize: px(13, look.scale) }} data-review-summary="">
      <span className="font-bold tabular-nums" style={{ fontSize: px(17, look.scale) }}>{summary.average_label}</span>
      <StarRow value={summary.average} size={15} />
      <span className="opacity-75">{summary.count_label}</span>
    </div>
  ) : null
  const more = items.length > 3 ? (
    <button type="button" onClick={openAll} className="mt-2.5 w-full text-center font-medium underline-offset-2 hover:underline" style={{ color: look.theme.text_color, fontSize: px(13.5, look.scale), minHeight: px(40, look.scale) }} data-review-more="">
      {tt("Read all {count} reviews", { count: summary?.count ?? items.length })}
    </button>
  ) : null

  if (layout === "card") {
    return (
      <button type="button" onClick={openAll} data-onepage-app="reviews" data-app-layout="card" className="flex w-full items-center text-left" style={{ ...parts.press.style, borderRadius: parts.radius, padding: px(14, look.scale), gap: px(12, look.scale) }}>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{data.title?.trim() || tt("Reviews")}</span>
          {summary ? (
            <span className="mt-1 flex items-center gap-1.5" style={{ fontSize: px(13, look.scale) }}>
              <span className="font-semibold tabular-nums">{summary.average_label}</span>
              <StarRow value={summary.average} size={14} />
              <span className="opacity-75">{summary.count_label}</span>
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-medium" style={{ fontSize: px(13, look.scale) }}>{data.button_text?.trim() || tt("Read reviews")}</span>
      </button>
    )
  }
  if (layout === "carousel") {
    return (
      <div data-onepage-app="reviews" data-app-layout="carousel" className="w-full">
        <Title text={data.title} look={look} />
        {head}
        <div className="-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ gap: px(10, look.scale) }}>
          {items.map((r) => (
            <div key={r.id} className="w-[82%] shrink-0 snap-start sm:w-[62%]">
              <ReviewCard r={r} look={look} />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (layout === "grid") {
    return (
      <div data-onepage-app="reviews" data-app-layout="grid" className="w-full">
        <Title text={data.title} look={look} />
        {head}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2" style={{ gap: px(10, look.scale) }}>
          {items.slice(0, 4).map((r) => (
            <ReviewCard key={r.id} r={r} look={look} />
          ))}
        </div>
        {more}
      </div>
    )
  }
  return (
    <div data-onepage-app="reviews" data-app-layout="classic" className="w-full">
      <Title text={data.title} look={look} />
      {head}
      <div className="flex flex-col" style={{ gap: px(10, look.scale) }}>
        {items.slice(0, 3).map((r) => (
          <ReviewCard key={r.id} r={r} look={look} />
        ))}
      </div>
      {more}
    </div>
  )
}

/* ─── An RSS feed's latest posts ──────────────────────────────────────── */

export function DataFeedList({ block, data: given, look }: Props) {
  const data = useFilled(block, given, look, Array.isArray(given.feed_items) || given.feed_count === 0)
  const track = useTrack(look)
  const items = Array.isArray(data.feed_items) ? data.feed_items : []
  if (!items.length) return null
  return (
    <ul className="mt-2 w-full text-left" style={{ color: look.theme.text_color }} data-feed-items="">
      {items.map((it, i) => (
        <li key={it.url} style={{ borderTop: i ? `1px solid color-mix(in srgb, ${look.theme.text_color || "#111113"} 12%, transparent)` : undefined }}>
          <a href={it.url} target="_blank" rel="noopener noreferrer" onClick={() => track(socialLinkId(block.id, `post-${i}`), it.url)} className="flex items-baseline justify-between gap-3 py-2.5 transition-opacity hover:opacity-80" style={{ fontSize: px(14, look.scale) }}>
            <span className="min-w-0 flex-1 font-medium leading-snug">{it.title}</span>
            {it.date ? <span className="shrink-0 tabular-nums opacity-60" style={{ fontSize: px(12, look.scale) }}>{it.date}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  )
}
