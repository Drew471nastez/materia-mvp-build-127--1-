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
 * The list, from lib/physical/carriers.ts: the carriers people use most in
 * the order's shipping country first (Popular in Romania: FAN Courier,
 * Sameday, Cargus...), then every other carrier by name, then Other (a
 * carrier of the seller's own, by name) and Local delivery / no tracking.
 * A search that finds nothing offers the words typed as an Other carrier.
 *
 * The value is a carrier's id, "other", "none" or "" (nothing chosen yet).
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronDown, PenLine, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { countryName } from "@/lib/checkout/countries"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { CARRIER_LIST, NO_TRACKING, OTHER_CARRIER, carrierChoices, type Carrier } from "@/lib/physical/carriers"
import { CarrierLogo } from "./carrier-logo"
import { FIELD, useModalPhone } from "./ui"

type Option = { value: string; name: string; sub?: string; carrier?: Carrier }

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

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
  const trigger = React.useRef<HTMLButtonElement>(null)

  const { popular, rest } = React.useMemo(() => carrierChoices(country), [country])
  const cc = (country ?? "").trim().toUpperCase()
  const q = fold(query)
  const match = (c: Carrier) => !q || fold(c.name).includes(q) || c.aliases.some((a) => a.includes(q)) || c.id.replace(/-/g, "").includes(q)
  const groups = React.useMemo(() => {
    const opt = (c: Carrier): Option => ({ value: c.id, name: c.name, carrier: c })
    const top = popular.filter(match).map(opt)
    const all = rest.filter(match).map(opt)
    const typed = query.trim()
    const extra: Option[] = [
      { value: OTHER_CARRIER, name: top.length + all.length === 0 && typed ? tt("Use \"{name}\"", { name: typed.slice(0, 40) }) : tt("Other carrier"), sub: tt("Type its name, and its tracking link if it has one") },
      { value: NO_TRACKING, name: tt("Local delivery / no tracking"), sub: tt("You deliver it, or it has no tracking number") },
    ]
    return [
      ...(top.length ? [{ title: cc ? tt("Popular in {country}", { country: regionName(cc) }) : tt("Popular"), options: top }] : []),
      ...(all.length ? [{ title: q ? tt("More carriers") : tt("All carriers"), options: all }] : []),
      { title: "", options: extra },
    ]
  }, [popular, rest, q, query, cc]) // eslint-disable-line react-hooks/exhaustive-deps
  const flat = groups.flatMap((g) => g.options)
  const [active, setActive] = React.useState(0)
  React.useEffect(() => setActive(0), [q])

  const choose = (v: string) => {
    if (v === OTHER_CARRIER && query.trim() && flat.length === 2) onOtherName?.(query.trim().slice(0, 40))
    onChange(v)
    setOpen(false)
  }
  const show = (on: boolean) => {
    setOpen(on)
    if (on) {
      setQuery("")
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

  const list = (size: "desk" | "phone") => (
    <CarrierList
      size={size}
      groups={groups}
      flat={flat}
      value={value}
      active={active}
      setActive={setActive}
      query={query}
      setQuery={setQuery}
      onChoose={choose}
      onEscape={() => setOpen(false)}
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
  active,
  setActive,
  query,
  setQuery,
  onChoose,
  onEscape,
}: {
  size: "desk" | "phone"
  groups: { title: string; options: Option[] }[]
  flat: Option[]
  value: string
  active: number
  setActive: (n: number) => void
  query: string
  setQuery: (q: string) => void
  onChoose: (v: string) => void
  onEscape: () => void
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
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", desk ? "p-1.5" : "px-2 pb-[max(env(safe-area-inset-bottom,0px),12px)]")}
      >
        {groups.map((g, gi) => (
          <div key={gi} role="group" aria-label={g.title || undefined} className={cn(gi > 0 && !g.title && "mt-1 border-t border-[#f0f1f3] pt-1")}>
            {g.title ? <p className={cn("font-medium text-[#6b7280]", desk ? "px-2 pb-1 pt-1.5 text-[12px]" : "px-3 pb-1 pt-2 text-[12.5px]")}>{g.title}</p> : null}
            {g.options.map((o) => {
              index++
              const i = index
              const selected = o.value === value
              const extra = o.value === OTHER_CARRIER || o.value === NO_TRACKING
              return (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  data-carrier-option={o.value}
                  onPointerMove={desk ? () => active !== i && setActive(i) : undefined}
                  onClick={() => onChoose(o.value)}
                  className={cn(
                    "flex cursor-pointer select-none items-center rounded-lg [-webkit-tap-highlight-color:transparent]",
                    desk ? "min-h-10 gap-2.5 px-2 py-1" : "min-h-[52px] gap-3 px-3 py-1.5 active:bg-[#f1f2f4]",
                    desk && i === active && "bg-[#f1f2f4]",
                  )}
                >
                  {extra && o.value === OTHER_CARRIER ? (
                    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[24%] bg-[#f1f2f4] text-[#6b7280]", desk ? "h-6 w-6" : "h-7 w-7")}>
                      <PenLine className={desk ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.75} />
                    </span>
                  ) : (
                    <CarrierLogo carrier={o.carrier?.id ?? null} size={desk ? 24 : 28} decorative />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", desk ? "text-[13.5px]" : "text-[16px]", selected ? "font-semibold" : "font-medium")}>{o.name}</span>
                    {o.sub ? <span className={cn("block truncate text-[#6b7280]", desk ? "text-[12px] leading-4" : "text-[13px] leading-[18px]")}>{o.sub}</span> : null}
                  </span>
                  {selected ? <Check aria-hidden className={cn("shrink-0 text-[#1a1a2e]", desk ? "h-4 w-4" : "h-5 w-5")} strokeWidth={2.25} /> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
