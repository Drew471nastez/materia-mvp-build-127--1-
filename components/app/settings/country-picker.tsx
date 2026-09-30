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
 * A COUNTRY'S FLAG: the SVG in public/flags (country-flag-icons, MIT), at
 * 3:2, as Analytics draws its countries: a hairline edge so a white flag
 * keeps its shape, and a faint light from above. About 700 bytes each, but
 * each is an SVG document the browser has to build, so only the flags on
 * screen when the list opens are asked for then (`near`), and the others when
 * they are scrolled close. A flag that fails is the same size in plain grey,
 * so the names stay in one column.
 */
export function CountryFlag({ code, near = true, className }: { code: string; near?: boolean; className?: string }) {
  const cc = (code || "").toUpperCase()
  const [failed, setFailed] = React.useState(false)
  const [shown, setShown] = React.useState(near)
  const ref = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    if (shown || !ref.current) return
    return whenNear(ref.current, () => setShown(true))
  }, [shown])
  const ok = /^[A-Z]{2}$/.test(cc) && !failed
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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/flags/${cc}.svg`}
          alt=""
          width={21}
          height={14}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="block h-full w-full object-cover"
        />
      ) : null}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.06)_100%)]" />
    </span>
  )
}

export function CountryPicker({ value, onChange, id }: { value: string; onChange: (name: string) => void; id?: string }) {
  const code = countryOf(value)
  const shown = countryLabel(value)
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
    />
  )
}
