"use client"

/**
 * ===========================================================================
 *  THE COUNTRY FIELD (Settings, General, Address)
 * ===========================================================================
 * "The select country modal in the settings tab should be updated with all
 * the latest UI, like all the other tabs and mobile bottom sheets in
 * settings." It was a centred modal on a computer with its own search and a
 * violet selected row, over a hand typed list of seventy two countries.
 *
 * Now it is the Language and Time zone field (components/ui/choice-list):
 * the 44px field with the country's flag and name, a popover under it on a
 * computer and the shared sheet on a phone, the search at the top, a check on
 * the one chosen, and arrow keys, Home and End to move through the list. The
 * list is every country, each with its flag from public/flags, and it opens
 * on the chosen one, not on Afghanistan.
 *
 * What is listed, shown and saved is lib/account/country: the English name
 * is saved, as before.
 */
import * as React from "react"
import { ChoicePicker } from "@/components/ui/choice-list"
import { countryChoices, countryLabel, countryOf, countryToSave } from "@/lib/account/country"
import { FLAG_CODES, FLAG_SPRITE } from "@/lib/account/flag-sprite"
import { cn } from "@/lib/utils"

/* One observer per list scroller, shared by every flag in it. */
const observers = new WeakMap<Element, IntersectionObserver>()
const waiting = new WeakMap<Element, () => void>()
function whenNear(el: Element, go: () => void): () => void {
  const root = el.closest("[data-choice-scroll], [data-sheet-scroll]")
  if (!root || typeof IntersectionObserver === "undefined") {
    go()
    return () => {}
  }
  let io = observers.get(root)
  if (!io) {
    const made = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          waiting.get(e.target)?.()
          waiting.delete(e.target)
          made.unobserve(e.target)
        }
      },
      /* A screen's worth of rows ahead of the scroll, so a flick finds them drawn. */
      { root, rootMargin: "240px 0px" },
    )
    observers.set(root, made)
    io = made
  }
  waiting.set(el, go)
  io.observe(el)
  const observer = io
  return () => {
    waiting.delete(el)
    observer.unobserve(el)
  }
}

/**
 * Ask for the sprite once, early: the first field on screen warms the cache
 * at idle, so the list opens with every flag already there instead of a
 * request starting as it rises.
 */
let warmed = false
function warmSprite() {
  if (warmed || typeof window === "undefined") return
  warmed = true
  const go = () => void fetch(FLAG_SPRITE, { credentials: "same-origin" }).catch(() => { warmed = false })
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(go, { timeout: 1500 })
  else window.setTimeout(go, 200)
}

/**
 * A COUNTRY'S FLAG, from one sprite of every flag (public/flags/sprite.svg,
 * country-flag-icons, MIT, built by scripts/build-flag-sprite.mjs), at 3:2,
 * as Analytics draws its countries: a hairline edge so a white flag keeps
 * its shape, and a faint light from above. Round 12 ("country flags load
 * fast"): it was a file per flag, a dozen requests as the list opened and
 * more with every scroll, the flags arriving one by one after the names.
 * Now one cached file, asked for while the field is on screen, and a flag
 * is a <use> of its symbol: nothing to wait for. Rows far below the screen
 * still draw theirs only when scrolled close (`near`), which keeps the list's
 * first frame light. The box is the same size with or without its flag
 * (grey until then, and for a code the sprite has no flag for), so nothing
 * in the row ever moves.
 */
export function CountryFlag({ code, near = true, className }: { code: string; near?: boolean; className?: string }) {
  const cc = (code || "").toUpperCase()
  const [shown, setShown] = React.useState(near)
  const ref = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    warmSprite()
  }, [])
  React.useEffect(() => {
    if (shown || !ref.current) return
    return whenNear(ref.current, () => setShown(true))
  }, [shown])
  const ok = FLAG_CODES.has(cc)
  return (
    <span
      ref={ref}
      aria-hidden
      data-flag={ok ? cc : undefined}
      className={cn(
        "relative block h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[3px] bg-[#eef0f2] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18),0_1px_2px_rgba(17,24,39,0.12)]",
        className,
      )}
    >
      {ok && shown ? (
        <svg width="100%" height="100%" className="block h-full w-full" focusable="false">
          <use href={`${FLAG_SPRITE}#${cc}`} width="100%" height="100%" />
        </svg>
      ) : null}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.06)_100%)]" />
    </span>
  )
}

export function CountryPicker({
  value,
  onChange,
  id,
  sheetZIndex,
  fieldClassName,
}: {
  value: string
  onChange: (name: string) => void
  id?: string
  /** The phone sheet's layer, for a field inside a panel drawn above the usual one (Set up payments). */
  sheetZIndex?: number
  fieldClassName?: string
}) {
  const code = countryOf(value)
  const shown = countryLabel(value)
  /* The field on screen is the moment to fetch the flags, not the tap that opens the list. */
  React.useEffect(() => {
    warmSprite()
  }, [])
  return (
    <ChoicePicker
      id={id}
      name="country"
      title="Country"
      choices={countryChoices}
      value={code}
      onChange={(next) => onChange(countryToSave(next))}
      placeholder="Search countries"
      fieldLabel={shown || "Select country"}
      fieldMuted={!shown}
      fieldLeading={code ? <CountryFlag code={code} /> : null}
      leading={(choice, near) => <CountryFlag code={choice.value} near={near} />}
      uniform
      scrollClassName="max-h-[min(440px,min(52dvh,560px))]"
      sheetZIndex={sheetZIndex}
      /* A little shorter than the other lists (round 12): 580px at most, from 640, and 72% of the screen, from 80. */
      sheetHeight="min(72dvh, 580px)"
      fieldClassName={fieldClassName}
    />
  )
}
