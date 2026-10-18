"use client"

/**
 * ===========================================================================
 *  CHOOSE A CARRIER
 * ===========================================================================
 * The carrier field of Fulfill items and Edit tracking (./order-panel.tsx).
 * A field that shows the chosen carrier's logo and name; pressed, it opens
 * the list:
 *
 *   on a computer   a popover under the field, as wide as it, with a search
 *                   box that has the focus, and the arrow keys, Enter and
 *                   Escape doing what they do in any list
 *   on a phone      a sheet from the bottom over the Fulfill sheet, rows a
 *                   thumb can hit, no close button: a pull down or a tap
 *                   above it closes it, as every sheet in /app
 *
 * The list, in this order (./carrier-live.tsx has what belongs to the shop):
 *
 *   Starred            the carriers the shop starred (the star on any row)
 *   Connected          the carriers on its own Shippo, EasyPost or ShipStation
 *                      account, as the provider lists them
 *   Your carriers      carriers it added itself, with their tracking link
 *   Popular in <x>     from lib/physical/carriers.ts: the carriers people use
 *                      most in the order's shipping country (Popular in
 *                      Romania: FAN Courier, Sameday, Cargus...)
 *   All carriers       every other carrier by name
 *   then Other (a name of the seller's own, for this order), Local delivery /
 *   no tracking, Add a carrier, and Make <carrier> the default.
 *
 * A carrier is listed once, in the first group that has it. The search reads
 * names, official names and aliases, best match first ("us" is USPS, "fdx" is
 * FedEx); one that finds nothing offers the words typed as an Other carrier.
 * It opens at once with the static list; the shop's stars and its connected
 * carriers fold in when they arrive.
 *
 * The value is a carrier's id, "other", "none" or "" (nothing chosen yet). A
 * carrier with no id (the shop's own, or one only its provider names) is
 * chosen as "other" with its name.
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronDown, PenLine, Plus, Search, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { countryName } from "@/lib/checkout/countries"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { CARRIER_LIST, NO_TRACKING, OTHER_CARRIER, carrierChoices, carrierKey, carrierOf, type Carrier } from "@/lib/physical/carriers"
import { isFavourite, rankBy, toggleFavourite } from "@/lib/physical/carrier-prefs"
import { CarrierLogo } from "./carrier-logo"
import { AddCarrierForm, useCarrierPrefs, useConnected } from "./carrier-live"
import { FIELD, useModalPhone } from "./ui"

/** `star` is the carrier's name as it is starred and set as the default; the extras (Other, no tracking, the actions) have none. */
type Option = { value: string; name: string; sub?: string; carrier?: Carrier; aside?: string; star?: string }

/** A carrier with no id of ours is chosen by its name: "name:Curier Local". */
const NAMED = "name:"
const ADD = "__add"
const DEFAULT = "__default"

function regionName(cc: string): string {
  try {
    return new Intl.DisplayNames([appLocale()], { type: "region" }).of(cc) ?? countryName(cc)
  } catch {
    return countryName(cc)
  }
}

/** The carrier the picker's value names, for the field and the rest of the form. */
export function carrierOfChoice(value: string): Carrier | null {
  return CARRIER_LIST.find((c) => c.id === value) ?? null
}

export function CarrierPicker({
  value,
  onChange,
  country,
  otherName,
  onOtherName,
  id,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  /** The order's shipping country, ISO alpha-2: its carriers come first. */
  country?: string | null
  /** The name typed for an Other carrier, shown in the field. */
  otherName?: string
  /** A search that matched nothing, kept as the Other carrier's name. */
  onOtherName?: (name: string) => void
  id?: string
  invalid?: boolean
}) {
  const phone = useModalPhone()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  /* Adding a carrier of the shop's own: the form in place of the list, with the words searched for as its name. */
  const [adding, setAdding] = React.useState<string | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const { prefs, save } = useCarrierPrefs()
  const connected = useConnected()

  const { popular, rest } = React.useMemo(() => carrierChoices(country), [country])
  const cc = (country ?? "").trim().toUpperCase()
  const q = query.trim()
  const chosenName = carrierOfChoice(value)?.name ?? (value === OTHER_CARRIER ? (otherName ?? "").trim() : "")
  const groups = React.useMemo(() => {
    const seen = new Set<string>()
    const scored = (list: Option[]): Option[] => {
      const fresh = list.filter((o) => {
        const k = carrierKey(o.star ?? o.name)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      return rankBy(fresh, q, (o) => ({ name: o.name, official: o.carrier?.official ?? null, aliases: [...(o.carrier?.aliases ?? []), o.carrier?.id.replace(/-/g, "") ?? ""] }))
    }
    const aside = (c: Carrier) => (c.countries.length ? c.countries.slice(0, 2).join(" ") + (c.countries.length > 2 ? ` +${c.countries.length - 2}` : "") : undefined)
    const opt = (c: Carrier, sub?: string): Option => ({ value: c.id, name: c.name, carrier: c, sub: sub ?? (c.official && carrierKey(c.official) !== carrierKey(c.name) ? c.official : undefined), aside: aside(c), star: c.name })
    const named = (name: string, sub?: string): Option => {
      const c = carrierOf(name)
      return c ? opt(c, sub) : { value: NAMED + name, name, sub, star: name }
    }
    const own = (u: string | null) => (u ? tt("Tracking on {site}", { site: hostOf(u) }) : tt("Your carrier, no tracking link"))
    /* Mutations happen in order: a carrier lands in the first group that names it. */
    const starred = scored(prefs.favourites.map((n) => {
      const mine = prefs.custom.find((c) => carrierKey(c.name) === carrierKey(n))
      return mine ? named(mine.name, own(mine.urlTemplate)) : named(n)
    }))
    const linked = scored((connected?.carriers ?? []).map((c) => named(c.carrier, c.services.length ? tt("{provider}, {n, plural, one {# service} other {# services}}", { provider: c.provider.name, n: c.services.length }) : c.provider.name)))
    const mine = scored(prefs.custom.map((c) => named(c.name, own(c.urlTemplate))))
    const top = scored(popular.map((c) => opt(c)))
    const all = scored(rest.map((c) => opt(c)))
    const found = starred.length + linked.length + mine.length + top.length + all.length
    const extra: Option[] = [
      { value: OTHER_CARRIER, name: found === 0 && q ? tt("Use \"{name}\"", { name: q.slice(0, 40) }) : tt("Other carrier"), sub: tt("Type its name, and its tracking link if it has one") },
      { value: NO_TRACKING, name: tt("Local delivery / no tracking"), sub: tt("You deliver it, or it has no tracking number") },
      ...(prefs.ready ? [{ value: ADD, name: q && !carrierOf(q) && found === 0 ? tt("Add “{value}” as a carrier", { value: q.slice(0, 40) }) : tt("Add a carrier"), sub: tt("Saved with its tracking link for every order") }] : []),
      ...(prefs.ready && chosenName && !q
        ? [{ value: DEFAULT, name: prefs.defaultCarrier && carrierKey(prefs.defaultCarrier) === carrierKey(chosenName) ? tt("{name} is your default", { name: chosenName }) : tt("Make {name} the default", { name: chosenName }), sub: tt("New orders start with it") }]
        : []),
    ]
    return [
      ...(starred.length ? [{ title: tt("Starred"), options: starred }] : []),
      ...(linked.length ? [{ title: tt("Connected"), options: linked }] : []),
      ...(mine.length ? [{ title: tt("Your carriers"), options: mine }] : []),
      ...(top.length ? [{ title: cc ? tt("Popular in {country}", { country: regionName(cc) }) : tt("Popular"), options: top }] : []),
      ...(all.length ? [{ title: q ? tt("More carriers") : tt("All carriers"), options: all }] : []),
      { title: "", options: extra },
    ]
  }, [popular, rest, q, cc, prefs, connected, chosenName])
  const flat = groups.flatMap((g) => g.options)
  const [active, setActive] = React.useState(0)
  React.useEffect(() => setActive(0), [q])

  const choose = (v: string) => {
    if (v === ADD) {
      setSaveError(null)
      setAdding(q && !carrierOf(q) ? q.slice(0, 40) : "")
      return
    }
    if (v === DEFAULT) {
      const isDefault = !!prefs.defaultCarrier && carrierKey(prefs.defaultCarrier) === carrierKey(chosenName)
      void save({ defaultCarrier: isDefault ? null : chosenName }).then(setSaveError)
      return
    }
    if (v.startsWith(NAMED)) {
      onOtherName?.(v.slice(NAMED.length).slice(0, 40))
      onChange(OTHER_CARRIER)
      setOpen(false)
      return
    }
    if (v === OTHER_CARRIER && q && flat.filter((o) => o.star).length === 0) onOtherName?.(q.slice(0, 40))
    onChange(v)
    setOpen(false)
  }
  const star = (name: string) => void save({ favourites: toggleFavourite(prefs.favourites, name) }).then(setSaveError)
  const show = (on: boolean) => {
    setOpen(on)
    if (on) {
      setQuery("")
      setAdding(null)
      setSaveError(null)
      const i = flat.findIndex((o) => o.value === value)
      setActive(i < 0 ? 0 : i)
    }
  }

  const chosen = carrierOfChoice(value)
  const label = chosen ? chosen.name : value === OTHER_CARRIER ? otherName?.trim() || tt("Other carrier") : value === NO_TRACKING ? tt("Local delivery / no tracking") : ""
  const field = (
    <button
      ref={trigger}
      id={id}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      data-carrier-field={value || "empty"}
      onClick={phone ? () => show(true) : undefined}
      className={cn(FIELD, "relative flex cursor-pointer items-center gap-2.5 pl-2.5 pr-9 text-left", !label && "text-[#9ca3af]", invalid && "border-[#f04438]", open && "border-[#9ca3af] ring-[3px] ring-[rgba(17,24,39,0.06)]")}
    >
      {value ? <CarrierLogo carrier={chosen ? chosen.id : value === OTHER_CARRIER ? otherName || null : null} size={24} decorative /> : null}
      <span className="min-w-0 flex-1 truncate">{label || tt("Choose a carrier")}</span>
      <ChevronDown aria-hidden className={cn("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af] transition-transform duration-150", open && "rotate-180")} />
    </button>
  )

  const list = (size: "desk" | "phone") =>
    adding !== null ? (
      <div className={size === "desk" ? "" : "pb-[max(env(safe-area-inset-bottom,0px),12px)]"}>
        <AddCarrierForm
          initialName={adding}
          compact={size === "phone"}
          onCancel={() => setAdding(null)}
          onSave={async (c) => {
            const e = await save({ addCarrier: c })
            if (!e) choose(NAMED + c.name)
            return e
          }}
        />
      </div>
    ) : (
      <CarrierList
        size={size}
        groups={groups}
        flat={flat}
        value={value}
        chosenName={chosenName}
        active={active}
        setActive={setActive}
        query={query}
        setQuery={setQuery}
        onChoose={choose}
        onEscape={() => setOpen(false)}
        favourites={prefs.ready ? prefs.favourites : null}
        onStar={star}
        saveError={saveError}
      />
    )

  if (phone) {
    return (
      <>
        {field}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} label={tt("Carrier")} hideFrom={null} fill aboveKeyboard zIndex={210} maxHeight="calc(var(--vv-h, 100dvh) * 0.86)" header={<p className="px-4 pb-1 pt-2 text-[16px] font-semibold text-[#1a1a2e]">{tt("Carrier")}</p>}>
          {list("phone")}
        </BottomSheet>
      </>
    )
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={show}>
      <PopoverPrimitive.Trigger asChild>{field}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          data-carrier-popover=""
          className="carrier-pop z-[2147483640] flex max-h-[min(400px,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),320px)] flex-col overflow-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(17,24,39,0.24),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
        >
          {list("desk")}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function CarrierList({
  size,
  groups,
  flat,
  value,
  chosenName,
  active,
  setActive,
  query,
  setQuery,
  onChoose,
  onEscape,
  favourites,
  onStar,
  saveError,
}: {
  size: "desk" | "phone"
  groups: { title: string; options: Option[] }[]
  flat: Option[]
  value: string
  /** The chosen carrier's name, for a row picked by its name (the shop's own, a provider's). */
  chosenName: string
  active: number
  setActive: (n: number) => void
  query: string
  setQuery: (q: string) => void
  onChoose: (v: string) => void
  onEscape: () => void
  /** The shop's starred carriers; null while they cannot be saved (part 233 not run, or not read yet): no stars drawn. */
  favourites: string[] | null
  onStar: (name: string) => void
  saveError: string | null
}) {
  const desk = size === "desk"
  const listId = React.useId()
  const scroller = React.useRef<HTMLDivElement>(null)
  const input = React.useRef<HTMLInputElement>(null)
  /* On a computer the search has the focus as the list opens; on a phone the keyboard waits until the box is pressed. */
  React.useEffect(() => {
    if (!desk) return
    const t = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(t)
  }, [desk])
  /* The active row stays in sight as the arrows move it. */
  React.useEffect(() => {
    if (!desk) return
    scroller.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active, desk])
  /* The chosen carrier is in sight when the list opens. */
  React.useLayoutEffect(() => {
    const row = scroller.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (row && scroller.current) scroller.current.scrollTop = Math.max(0, row.offsetTop - scroller.current.clientHeight / 2 + row.offsetHeight / 2)
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive(Math.min(flat.length - 1, active + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive(Math.max(0, active - 1))
    } else if (e.key === "Home" && !query) {
      e.preventDefault()
      setActive(0)
    } else if (e.key === "End" && !query) {
      e.preventDefault()
      setActive(flat.length - 1)
    } else if (e.altKey && e.code === "KeyS") {
      /* Alt+S stars the highlighted carrier: the star button is out of the Tab order, so a keyboard reaches it here (on a Mac, Option+S). */
      const o = flat[active]
      if (o?.star && favourites) {
        e.preventDefault()
        onStar(o.star)
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      const o = flat[active]
      if (o) onChoose(o.value)
    } else if (e.key === "Escape") {
      /* Closes the list only: the Fulfill items dialog under it stays. */
      e.stopPropagation()
      onEscape()
    }
  }

  let index = -1
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKey} data-carrier-list={size}>
      <div className={cn("shrink-0", desk ? "border-b border-[#f0f1f3] p-2" : "px-4 pb-2 pt-1")}>
        <label className="relative block">
          <span className="sr-only">{tt("Search carriers")}</span>
          <Search aria-hidden className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#9ca3af]", desk ? "left-2.5 h-4 w-4" : "left-3 h-[18px] w-[18px]")} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("Search carriers")}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={desk && flat[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            data-carrier-search=""
            className={cn(
              "w-full rounded-lg bg-[#f4f5f7] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:bg-white focus:shadow-[0_0_0_1px_#c9ccd3,0_0_0_4px_rgba(17,17,19,0.05)]",
              desk ? "h-9 pl-8 pr-3 text-[13.5px]" : "h-11 pl-10 pr-3 text-[16px]",
            )}
          />
        </label>
      </div>
      <div
        ref={scroller}
        id={listId}
        role="listbox"
        aria-label={tt("Carriers")}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(148,163,184,0.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.45)] [&::-webkit-scrollbar-track]:bg-transparent", desk ? "p-1.5" : "px-2 pb-[max(env(safe-area-inset-bottom,0px),12px)]")}
      >
        {groups.map((g, gi) => (
          <div key={gi} role="group" aria-label={g.title || undefined} className={cn(gi > 0 && !g.title && "mt-1 border-t border-[#f0f1f3] pt-1")}>
            {g.title ? <p className={cn("font-medium text-[#646b78]", desk ? "px-2 pb-1 pt-1.5 text-[12px]" : "px-3 pb-1 pt-2 text-[12.5px]")}>{g.title}</p> : null}
            {g.options.map((o) => {
              index++
              const i = index
              const selected = o.value === value || (o.value.startsWith(NAMED) && value === OTHER_CARRIER && carrierKey(o.name) === carrierKey(chosenName))
              const extra = !o.star
              const starred = !!o.star && !!favourites && isFavourite(favourites, o.star)
              return (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  data-carrier-option={o.value}
                  /* A mouse lights the row it is over; a finger never does (a touch leaves no grey behind on the row it lifted from). */
                  onPointerMove={desk ? (e) => e.pointerType === "mouse" && active !== i && setActive(i) : undefined}
                  onClick={() => onChoose(o.value)}
                  className={cn(
                    /*
                      A ROW OUT OF SIGHT IS NOT PAINTED (content-visibility), so its logo is neither fetched nor decoded
                      until it is scrolled to: the open costs the rows on screen, not all thirty. Measured on a phone four
                      times slower (scripts/check-carrier-select.mjs): 285ms to the first rows without it, about 100 with.
                    */
                    "flex cursor-pointer select-none items-center rounded-lg [-webkit-tap-highlight-color:transparent] [content-visibility:auto]",
                    desk ? "[contain-intrinsic-size:auto_40px]" : "[contain-intrinsic-size:auto_52px]",
                    desk ? "min-h-10 gap-2.5 px-2 py-1" : "min-h-[52px] gap-3 px-3 py-1.5 active:bg-[#f1f2f4]",
                    desk && i === active && "bg-[#f1f2f4]",
                  )}
                >
                  {extra && o.value !== NO_TRACKING ? (
                    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[24%] bg-[#f1f2f4] text-[#646b78]", desk ? "h-6 w-6" : "h-7 w-7")}>
                      {o.value === ADD ? <Plus className={desk ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.9} /> : o.value === DEFAULT ? <Check className={desk ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.9} /> : <PenLine className={desk ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.75} />}
                    </span>
                  ) : (
                    <CarrierLogo carrier={o.carrier?.id ?? (o.star ? o.name : null)} size={desk ? 24 : 28} decorative />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", desk ? "text-[13.5px]" : "text-[16px]", selected ? "font-semibold" : "font-medium")}>{o.name}</span>
                    {o.sub ? <span className={cn("block truncate text-[#646b78]", desk ? "text-[12px] leading-4" : "text-[13px] leading-[18px]")}>{o.sub}</span> : null}
                  </span>
                  {o.aside ? (
                    <span className={cn("shrink-0 tabular-nums tracking-[0.02em] text-[#646b78]", desk ? "text-[11.5px]" : "text-[12.5px]")} data-carrier-country="">
                      {o.aside}
                    </span>
                  ) : null}
                  {selected ? <Check aria-hidden className={cn("shrink-0 text-[#1a1a2e]", desk ? "h-4 w-4" : "h-5 w-5")} strokeWidth={2.25} /> : null}
                  {o.star && favourites ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-keyshortcuts="Alt+S"
                      aria-pressed={starred}
                      aria-label={starred ? tt("Unstar {name}", { name: o.name }) : tt("Star {name}", { name: o.name })}
                      data-carrier-star={o.star}
                      onClick={(e) => {
                        e.stopPropagation()
                        onStar(o.star!)
                      }}
                      className={cn(
                        "-mr-1 grid shrink-0 place-items-center rounded-md outline-none transition-[opacity,color] duration-100",
                        desk ? "h-7 w-7 [@media(hover:hover)]:hover:bg-[#e8e9ec]" : "h-10 w-10",
                        starred ? "text-[#1a1a2e]" : cn("text-[#b4b7bf] [@media(hover:hover)]:hover:text-[#4b5563]", desk && i !== active && "opacity-0"),
                      )}
                    >
                      <Star className={desk ? "h-[14px] w-[14px]" : "h-4 w-4"} fill={starred ? "currentColor" : "none"} strokeWidth={1.9} />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
        {saveError ? (
          <p className={cn("text-[#b42318]", desk ? "px-2 pb-1 pt-1 text-[12px]" : "px-3 pb-2 pt-1 text-[13px]")} data-carrier-save-error="">
            {saveError}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** A link's host, without www: where the buyer follows a shop's own carrier. */
function hostOf(url: string): string {
  try {
    return new URL(url.replace("{tracking}", "x")).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
