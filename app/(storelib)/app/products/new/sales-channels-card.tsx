"use client"

/**
 * SALES CHANNELS, in the product editor's side column: where this product
 * is listed (lib/store/channels.ts). Every channel is ticked until someone
 * takes the product off one; a new product starts on what Settings › Sales
 * channels › New products says. Saved after the product itself, by the
 * editor calling `save` with the product's id, so a new product's choice is
 * kept too. A database without parts 109 and 111 shows nothing here.
 *
 * WHAT IS SENT IS WHAT CHANGED (lib/store/channel-changes.ts): the channels
 * whose tick differs from what was saved, never the whole list, so a tab
 * left open does not put back a channel another tab took the product off.
 * The answer is what is saved now, and the card shows it.
 */
import * as React from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { channelKey, startingChannels, type Channel } from "@/lib/store/channels"
import { channelChanges, listedKeys } from "@/lib/store/channel-changes"
import { tt } from "@/lib/i18n/text"

export interface SalesChannelsHandle {
  /** Writes the ticks for this product; an error's words, or null. */
  save: (productId: string) => Promise<string | null>
}

type Loaded = { channels: Channel[]; defaultKey: string | null; ready: boolean; off: string[] }

/*
  THINGS THAT SHIP SELL ON THE ONLINE STORE. The creator page and Explore
  list downloads, courses and memberships only (they check out with no
  address, and Explore leaves physical products out), so a physical product
  is not offered them at all: its card lists the Online store and the
  store's own channels (a market stall, a wholesale list), nothing it could
  never sell on. Their ticks are left as they were: they are never sent.
*/
const DIGITAL_ONLY = new Set(["creator_page", "marketplace"])
const forPhysical = (c: Channel) => !DIGITAL_ONLY.has(c.kind)
const shownOf = (channels: Channel[], physical: boolean) => (physical ? channels.filter(forPhysical) : channels)

/** PUT /api/store/channels/product: what is saved after the write, or the error's words. */
async function put(body: Record<string, unknown>): Promise<{ data: Loaded | null; error: string | null }> {
  try {
    const r = await fetch("/api/store/channels/product", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(body) })
    const json = (await r.json().catch(() => null)) as (Loaded & { error?: string }) | null
    if (!r.ok) return { data: null, error: json?.error ?? tt("The sales channels were not saved.") }
    return { data: json && Array.isArray(json.channels) && Array.isArray(json.off) ? json : null, error: null }
  } catch {
    return { data: null, error: tt("The sales channels were not saved.") }
  }
}

export const SalesChannelsCard = React.forwardRef<SalesChannelsHandle, { productId: string | null; cardClass: string; titleClass: string; onValue?: (on: string[] | undefined, saved: boolean) => void; physical?: boolean }>(function SalesChannelsCard({ productId, cardClass, titleClass, onValue, physical = false }, ref) {
  /* What is saved, as the server last answered it: a read, or a save's answer. */
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [on, setOn] = React.useState<Set<string>>(new Set())
  /* Ticked or unticked by hand since the card loaded or saved. */
  const touched = React.useRef(false)
  /* Each read and each save takes a number; an answer older than the last one asked is dropped. */
  const asked = React.useRef(0)
  /* Opened for a new product, an existing one, or saved since. */
  const opened = React.useRef<"new" | "existing" | "saved">(productId ? "existing" : "new")
  /*
    WHAT IT HOLDS, TOLD TO THE EDITOR: the channels ticked, as a set, with
    whether that is what was loaded. The editor's Save turns on while it
    differs from what was loaded or last saved, and off again when a tick is
    put back (product-editor reportCard). Told after the draw, never inside
    a state update.
  */
  const told = React.useRef(onValue)
  told.current = onValue
  const asLoaded = React.useRef(false)
  React.useEffect(() => {
    if (!loaded?.ready) return
    told.current?.([...on].sort(), asLoaded.current)
    asLoaded.current = false
  }, [on, loaded])
  React.useEffect(() => () => told.current?.(undefined, true), [])

  /*
    READ WHEN THE PRODUCT IS OPENED, not when a new one gets its id. A new
    product's first save gives it an id while that save is still writing; a
    read then answered from before the channels were written, put every tick
    back on and forgot the ones taken off. The save's own answer says what
    is saved.
  */
  const heldFor = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    const before = heldFor.current
    heldFor.current = productId
    if (before === null && productId) return
    const mine = ++asked.current
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : ""
    fetch(`/api/store/channels/product${q}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Loaded | null) => {
        if (mine !== asked.current || !d || !Array.isArray(d.channels)) return
        const off = Array.isArray(d.off) ? d.off : []
        asLoaded.current = true
        touched.current = false
        setLoaded({ ...d, off })
        /* A new physical product starts where Settings says when that is a channel it sells on; on all of its channels otherwise, never on none. */
        setOn(productId ? listedKeys(d.channels, off) : startingChannels(shownOf(d.channels, physical), d.defaultKey))
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  /* A new product switched between a download and a thing that ships before any tick: it starts where that kind starts. */
  React.useEffect(() => {
    if (opened.current !== "new" || !loaded || touched.current) return
    asLoaded.current = true
    setOn(startingChannels(shownOf(loaded.channels, physical), loaded.defaultKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physical])

  /* The ticks as last drawn, for a save's answer to keep a tick changed while it was saving. */
  const onNow = React.useRef(on)
  onNow.current = on
  /* A save's answer, drawn: built-ins named by their new rows' ids, and a tick changed since the save was sent kept as it is. */
  const showSaved = (answer: Loaded, before: Loaded, sentOn: ReadonlySet<string>) => {
    const saved = listedKeys(answer.channels, answer.off)
    const current = onNow.current
    const next = new Set<string>()
    for (const c of answer.channels) {
      const key = channelKey(c)
      const was = channelKey(c.kind === "custom" ? c : (before.channels.find((o) => o.kind === c.kind) ?? c))
      const changedSince = current.has(was) !== sentOn.has(was)
      if (changedSince ? current.has(was) : saved.has(key)) next.add(key)
    }
    asLoaded.current = next.size === saved.size && [...next].every((k) => saved.has(k))
    touched.current = !asLoaded.current
    opened.current = "saved"
    setLoaded(answer)
    setOn(next)
  }

  React.useImperativeHandle(
    ref,
    () => ({
      save: async (id: string) => {
        /*
          A NEW PRODUCT SAVED BEFORE THIS CARD HAD LOADED (a quick Save, a
          slow connection): Settings › Sales channels › "List new products on"
          still applies. The channels are read now and the product starts
          where Settings says, instead of on every channel.
        */
        if (!loaded && opened.current === "new") {
          const mine = ++asked.current
          try {
            const r = await fetch("/api/store/channels/product", { cache: "no-store", credentials: "same-origin" })
            const d = r.ok ? ((await r.json()) as Loaded) : null
            if (!d || !d.ready || !Array.isArray(d.channels)) return null
            const fresh: Loaded = { ...d, off: [] }
            const starting = startingChannels(shownOf(d.channels, physical), d.defaultKey)
            const sent = channelChanges(shownOf(d.channels, physical), listedKeys(d.channels, []), starting)
            if (sent.list.length === 0 && sent.unlist.length === 0) {
              if (mine === asked.current) showSaved(fresh, fresh, starting)
              return null
            }
            const answer = await put({ productId: id, ...sent })
            if (answer.error) return answer.error
            if (answer.data && mine === asked.current) showSaved(answer.data, fresh, starting)
            return null
          } catch {
            return tt("The sales channels were not saved.")
          }
        }
        if (!loaded || !loaded.ready) return null
        const sentOn = on
        const sent = channelChanges(shownOf(loaded.channels, physical), listedKeys(loaded.channels, loaded.off), sentOn)
        if (sent.list.length === 0 && sent.unlist.length === 0) return null
        const mine = ++asked.current
        const answer = await put({ productId: id, ...sent })
        if (answer.error) return answer.error
        if (answer.data && mine === asked.current) showSaved(answer.data, loaded, sentOn)
        return null
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, on, productId, physical],
  )

  if (!loaded || !loaded.ready) return null
  const toggle = (key: string) => {
    touched.current = true
    setOn((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const shown = shownOf(loaded.channels, physical)
  const listedCount = shown.filter((c) => on.has(channelKey(c))).length
  const ownChannels = shown.filter((c) => c.kind === "custom").length

  return (
    <div className={cardClass} data-sales-channels="">
      <div>
        <h2 className={titleClass}>{tt("Sales channels")}</h2>
        <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
          {listedCount === 0 ? tt("Listed nowhere: sold by its link alone.") : shown.length === 1 ? tt("Where it's listed.") : tt("Listed on {listedCount} of {length}.", { listedCount, length: shown.length })}
        </p>
      </div>
      <ul className="-mx-1 space-y-0.5" data-channel-list="">
        {shown.map((c) => {
          const key = channelKey(c)
          const id = `channel-${key}`
          return (
            <li key={key} data-channel={c.kind}>
              <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-[#f8f9fa]", !c.enabled && "opacity-60")}>
                {/* The real checkbox, for the keyboard and screen readers; the box beside it is what is drawn, filling and ticking on a short ease. */}
                <input id={id} type="checkbox" checked={on.has(key)} onChange={() => toggle(key)} className="peer sr-only" />
                <span
                  aria-hidden
                  data-channel-box={on.has(key) ? "on" : "off"}
                  className={cn(
                    "mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-[#1a1a2e]/20 peer-focus-visible:ring-offset-1",
                    on.has(key) ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white",
                  )}
                >
                  <Check
                    strokeWidth={3}
                    className={cn("h-3 w-3 text-white transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none", on.has(key) ? "scale-100 opacity-100" : "scale-50 opacity-0")}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-5 text-[#1a1a2e]">
                    {c.name}
                    {!c.enabled ? <span className="font-normal text-[#9ca3af]"> · {tt("off")}</span> : null}
                  </span>
                  {c.description ? <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{c.description}</span> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
        {physical && ownChannels === 0 ? tt("Sell it somewhere else too, like a market stall? Add that as a channel. ") : tt("Its link works wherever it's listed. ")}
        <Link href="/app/settings?tab=channels" prefetch={false} className="font-medium text-[#1a1a2e] underline underline-offset-2">
          {tt("Manage channels")}
        </Link>
      </p>
    </div>
  )
})
