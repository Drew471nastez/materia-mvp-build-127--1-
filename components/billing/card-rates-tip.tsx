"use client"

/**
 * ===========================================================================
 *  THE CARD RATES BY KIND, BEHIND A SMALL INFO CIRCLE
 * ===========================================================================
 * Pricing tooltip round, the owner: the plan card's rate line is one row,
 * starting with the plan's lowest rate, and a very quiet "i" in a circle
 * right after it opens "Card rates" by kind, digital first, and a muted note on
 * small orders. Every figure comes from components/marketing/pricing-lines,
 * written from the fee rules.
 *
 *   - Opens on hover where a fine pointer hovers, on keyboard focus, and on a
 *     click or tap anywhere; a second click or tap closes it.
 *   - Closes on Escape, on a press outside, and when the page or the card
 *     rail scrolls it away (a small nudge only moves it along).
 *   - The circle draws 15px; its press area is 24px, and 44px on a coarse
 *     pointer, from a pseudo element, so the line's height never changes.
 *   - The tip is drawn on the page's top layer (a portal into the open
 *     dialog, or the body) at a fixed position, so the phone's sideways card
 *     rail never clips it. It stays inside the card's column and the window,
 *     12px from the window's edges, below the circle or above it when there
 *     is no room below.
 *   - It fades in over 160ms with a 3px rise, and does not move under
 *     reduced motion.
 *   - It is always in the document once mounted (hidden while closed), so
 *     aria-describedby reads it to a screen reader from the button.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import type { PlanLineRates } from "@/components/marketing/pricing-lines"
import { tt } from "@/lib/i18n/text"

const EDGE = 12
const GAP = 8
const WIDTH = 232
/** The narrowest the tip goes to stay inside a card's column; "Physical products" and its rate still share a row. */
const MIN_WIDTH = 196
/** How far the circle may move under an open tip (a scroll) before the tip closes. */
const SCROLL_AWAY = 24

/** A space before a rate that does not break the rate itself ("3% + $0.25"). */
const keepRateWhole = (text: string) => text.replace(/(\d%) \+ /g, "$1 + ")

export function CardRatesTip({ rates }: { rates: PlanLineRates }) {
  const id = React.useId()
  const tipId = `card-rates-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`
  const button = React.useRef<HTMLButtonElement>(null)
  const tip = React.useRef<HTMLDivElement>(null)
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  /* "hover" while a pointer or keyboard focus holds it open, "click" once pressed: then only a second press, Escape, outside or scroll closes it. */
  const [open, setOpen] = React.useState<false | "hover" | "click">(false)
  const closeTimer = React.useRef<number | undefined>(undefined)
  const anchorAt = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    const b = button.current
    if (!b) return
    setHost((b.closest("[role='dialog']") as HTMLElement | null) ?? document.body)
  }, [])

  const place = React.useCallback(() => {
    const b = button.current
    const t = tip.current
    if (!b || !t) return
    const br = b.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    /*
      The card's column, inside the window, the tip narrowing to it (three cards across at 768). A card mostly
      off screen in the phone's rail leaves too little of its column in view: the window alone bounds it then.
    */
    const card = b.closest("[data-plan-card]")?.getBoundingClientRect()
    let left = EDGE
    let right = vw - EDGE
    if (card) {
      const l = Math.max(left, card.left + 6)
      const r = Math.min(right, card.right - 6)
      if (r - l >= MIN_WIDTH) {
        left = l
        right = r
      }
    }
    const width = Math.min(WIDTH, right - left)
    t.style.width = `${width}px`
    /* A fixed box inside a transformed ancestor (the dialog) is placed from that ancestor: measure where 0,0 lands and correct for it. */
    t.style.left = "0px"
    t.style.top = "0px"
    const origin = t.getBoundingClientRect()
    const height = origin.height
    const x = Math.min(Math.max(br.left + br.width / 2 - width / 2, left), right - width)
    const below = br.bottom + GAP
    const above = br.top - GAP - height
    const flip = below + height > vh - EDGE && above >= EDGE
    const y = flip ? above : below
    t.dataset.side = flip ? "top" : "bottom"
    t.style.left = `${Math.round(x - origin.left)}px`
    t.style.top = `${Math.round(y - origin.top)}px`
  }, [])

  const show = React.useCallback(
    (how: "hover" | "click") => {
      window.clearTimeout(closeTimer.current)
      const b = button.current
      if (b) {
        const r = b.getBoundingClientRect()
        anchorAt.current = { x: r.left, y: r.top }
      }
      place()
      setOpen((now) => (now === "click" ? "click" : how))
    },
    [place],
  )
  const hide = React.useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(false)
  }, [])
  const hideSoon = React.useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen((now) => (now === "hover" ? false : now)), 120)
  }, [])

  React.useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        hide()
      }
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (button.current?.contains(target) || tip.current?.contains(target)) return
      hide()
    }
    const onScroll = () => {
      const b = button.current
      const at = anchorAt.current
      if (!b || !at) return
      const r = b.getBoundingClientRect()
      if (Math.hypot(r.left - at.x, r.top - at.y) > SCROLL_AWAY || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > document.documentElement.clientWidth) hide()
      else place()
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", place)
    }
  }, [open, hide, place])

  const fine = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches

  return (
    <>
      <style href="card-rates-tip" precedence="default">{TIP_CSS}</style>
      <button
        ref={button}
        type="button"
        data-plan-info=""
        aria-label={tt("Card rates by product type")}
        aria-expanded={!!open}
        aria-controls={host ? tipId : undefined}
        aria-describedby={host ? tipId : undefined}
        className="crt-btn"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && fine()) show("hover")
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") hideSoon()
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show("hover")
        }}
        onBlur={() => setOpen((now) => (now === "hover" ? false : now))}
        onClick={(e) => {
          e.stopPropagation()
          if (open === "click") hide()
          else show("click")
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="8" cy="8" r="6.6" />
          <path d="M8 7.3v3.9" />
          <circle cx="8" cy="4.95" r="0.2" fill="currentColor" strokeWidth="1.15" />
        </svg>
      </button>
      {host
        ? createPortal(
            <div
              ref={tip}
              id={tipId}
              role="tooltip"
              data-card-rates-tip=""
              data-open={open ? "" : undefined}
              className="crt-tip"
              onClick={(e) => e.stopPropagation()}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") window.clearTimeout(closeTimer.current)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") hideSoon()
              }}
            >
              <div className="crt-box">
                <p className="crt-title">{tt("Card rates")}</p>
                <dl className="crt-rows">
                  <div>
                    <dt>{tt("Digital products")}</dt>
                    <dd>{keepRateWhole(rates.digital)}</dd>
                  </div>
                  <div>
                    <dt>{tt("Physical products")}</dt>
                    <dd>{keepRateWhole(rates.physical)}</dd>
                  </div>
                </dl>
                {/* A hyphenated word ("small-order") is never broken at its hyphen. */}
                <p className="crt-note">{tt("Sales under {amount} pay a small-order rate with no fixed fee.", { amount: rates.smallOrderUnder }).replace(/(\p{L})-(\p{L})/gu, "$1‑$2")}</p>
              </div>
            </div>,
            host,
          )
        : null}
    </>
  )
}

/*
  Outside Tailwind's layers, so the portaled tip is styled wherever it lands.
  The circle sits on the text's baseline area at 15px with no box of its own
  in the line's height; ::before is the press area.
*/
const TIP_CSS = `
.crt-btn{position:relative;display:inline-grid;place-items:center;width:15px;height:15px;margin-left:5px;padding:0;border:0;background:none;color:#8b8b94;vertical-align:-2.5px;border-radius:999px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .15s ease}
.crt-btn::before{content:"";position:absolute;left:50%;top:50%;width:24px;height:24px;translate:-50% -50%;border-radius:999px}
@media (pointer:coarse){.crt-btn::before{width:44px;height:44px}}
@media (hover:hover) and (pointer:fine){.crt-btn:hover{color:#3f3f46}}
.crt-btn[aria-expanded="true"]{color:#3f3f46}
.crt-btn:focus{outline:none}
.crt-btn:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
.crt-tip{position:fixed;left:0;top:0;z-index:2147483000;width:${WIDTH}px;visibility:hidden;pointer-events:none;transition:visibility 0s linear .16s}
.crt-tip[data-open]{visibility:visible;pointer-events:auto;transition:none}
.crt-box{box-sizing:border-box;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid #e4e4e7;box-shadow:0 12px 32px -12px rgba(9,9,11,.32),0 2px 6px -2px rgba(9,9,11,.10);font-family:inherit;font-size:12.5px;line-height:18px;color:#27272a;text-align:left;opacity:0;translate:0 3px;transition:opacity .16s ease-out,translate .16s cubic-bezier(.22,1,.36,1)}
.crt-tip[data-side="top"] .crt-box{translate:0 -3px}
.crt-tip[data-open] .crt-box{opacity:1;translate:0 0}
.crt-title{margin:0 0 6px;font-size:12px;line-height:16px;font-weight:600;color:#18181b}
.crt-rows{margin:0;display:grid;gap:4px}
.crt-rows>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.crt-rows dt{color:#52525b}
.crt-rows dd{margin:0;font-weight:500;color:#18181b;font-variant-numeric:tabular-nums;white-space:nowrap}
.crt-note{margin:8px 0 0;padding-top:8px;border-top:1px solid #f0f0f2;font-size:12px;line-height:17px;color:#71717a}
@media (prefers-reduced-motion:reduce){.crt-btn,.crt-tip,.crt-box{transition:none!important}.crt-box,.crt-tip[data-side="top"] .crt-box{translate:none}}
`
