"use client"

/**
 * SALES CHANNELS, in the product editor's side column: where this product
 * is listed (lib/store/channels.ts). Every channel is ticked until someone
 * takes the product off one; a new product starts on what Settings › Sales
 * channels › New products says. Saved after the product itself, by the
 * editor calling `save` with the product's id, so a new product's choice is
 * kept too. A database without parts 109 and 111 shows nothing here.
 */
import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { channelKey, startingChannels, type Channel } from "@/lib/store/channels"
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
  never sell on. Their ticks are left as they were, so the API and the
  stored listings do not change.
*/
const DIGITAL_ONLY = new Set(["creator_page", "marketplace"])
const forPhysical = (c: Channel) => !DIGITAL_ONLY.has(c.kind)

export const SalesChannelsCard = React.forwardRef<SalesChannelsHandle, { productId: string | null; cardClass: string; titleClass: string; onChange?: () => void; physical?: boolean }>(function SalesChannelsCard({ productId, cardClass, titleClass, onChange, physical = false }, ref) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [on, setOn] = React.useState<Set<string>>(new Set())
  const dirty = React.useRef(false)

  React.useEffect(() => {
    let live = true
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : ""
    fetch(`/api/store/channels/product${q}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Loaded | null) => {
        if (!live || !d || !Array.isArray(d.channels)) return
        setLoaded(d)
        const offIds = new Set(d.off ?? [])
        /* A new physical product starts where Settings says when that is a channel it sells on; on all of its channels otherwise, never on none. */
        const starting = physical ? startingChannels(d.channels.filter(forPhysical), d.defaultKey) : startingChannels(d.channels, d.defaultKey)
        setOn(productId ? new Set(d.channels.filter((c) => !(c.id && offIds.has(c.id))).map(channelKey)) : starting)
        /* A new product that starts on one channel has something to save even untouched. */
        dirty.current = !productId && !!d.defaultKey
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, physical])

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
        if (!loaded && !productId) {
          try {
            const r = await fetch("/api/store/channels/product", { cache: "no-store", credentials: "same-origin" })
            const d = r.ok ? ((await r.json()) as Loaded) : null
            if (!d || !d.ready || !Array.isArray(d.channels) || !d.defaultKey) return null
            const starting = physical ? startingChannels(d.channels.filter(forPhysical), d.defaultKey) : startingChannels(d.channels, d.defaultKey)
            const off = d.channels.map(channelKey).filter((k) => !starting.has(k))
            const put = await fetch("/api/store/channels/product", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ productId: id, off }) })
            return put.ok ? null : tt("The sales channels were not saved.")
          } catch {
            return tt("The sales channels were not saved.")
          }
        }
        if (!loaded || !loaded.ready || !dirty.current) return null
        const off = loaded.channels.map(channelKey).filter((k) => !on.has(k))
        try {
          const r = await fetch("/api/store/channels/product", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ productId: id, off }) })
          if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? tt("The sales channels were not saved.")
          dirty.current = false
          return null
        } catch {
          return tt("The sales channels were not saved.")
        }
      },
    }),
    [loaded, on, productId, physical],
  )

  if (!loaded || !loaded.ready) return null
  const toggle = (key: string) => {
    dirty.current = true
    setOn((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    onChange?.()
  }
  const shown = physical ? loaded.channels.filter(forPhysical) : loaded.channels
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
                <input id={id} type="checkbox" checked={on.has(key)} onChange={() => toggle(key)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[#d1d5db] accent-[#1a1a2e]" />
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
