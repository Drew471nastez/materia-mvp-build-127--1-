"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Loader2, Package, Printer, Truck } from "lucide-react"

import { LockerPicker, type LockerOption } from "@/components/shipping/locker-picker"
import { ShippingTimeline } from "@/components/shipping/shipping-timeline"
import type { ShippingState } from "@/lib/shipping/status"

/**
 * The shipping section of one order, for whichever side is looking.
 *
 * One fetch decides everything: the server answers with `party`, and the two
 * branches below are genuinely different screens — the buyer picks a locker and
 * watches a parcel, the seller prints a label and hands one over. They share
 * the timeline and nothing else, which is why this renders two components
 * rather than one with a dozen conditionals.
 *
 * When the shipping migration has not been run the server replies
 * `configured: false` and this renders NOTHING. An order page that predates
 * shipping should look exactly as it did, not sprout an error box.
 */

type BuyerShipping = {
  id: string
  shippingStatus: ShippingState | null
  trackingNumber: string | null
  carrier: string | null
  rawStatus: string | null
  shippedAt: string | null
  deliveredAt: string | null
  destination: { lockerId: number; name: string | null; street: string | null; locality: string | null; county: string | null } | null
  contact: string | null
  phone: string | null
  needsAddress: boolean
  /** The only courier network the buyer may pick a locker from. */
  carrierId: number
}

type SellerShipping = {
  id: string
  shippingStatus: ShippingState | null
  awb: string | null
  trackingNumber: string | null
  carrier: string | null
  rawStatus: string | null
  shippedAt: string | null
  deliveredAt: string | null
  labelUrl: string | null
  hasLabel: boolean
  error: string | null
  destinationLocality: string | null
  buyerReady: boolean
}

export function OrderShippingPanel({ orderId }: { orderId: string }) {
  const [party, setParty] = useState<"buyer" | "seller" | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [data, setData] = useState<BuyerShipping | SellerShipping | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (refresh = false) => {
      try {
        const res = await fetch(`/api/shipping/order/${orderId}${refresh ? "?refresh=1" : ""}`, {
          credentials: "include",
        })
        const json = await res.json()
        if (!json.ok) {
          setConfigured(false)
          return
        }
        setConfigured(json.configured !== false)
        setParty(json.party ?? null)
        setData(json.shipping ?? null)
      } catch {
        setConfigured(false)
      } finally {
        setLoading(false)
      }
    },
    [orderId],
  )

  // The first load asks for a carrier refresh; the server decides whether that
  // actually costs a request (it rate-limits in the database), so this stays a
  // single call rather than a poll.
  useEffect(() => {
    void load(true)
  }, [load])

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-[18px] w-[18px] animate-pulse rounded-full bg-neutral-100" />
              <div className="h-3.5 w-40 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!configured || !data || !party) return null

  return party === "buyer" ? (
    <BuyerPanel data={data as BuyerShipping} onSaved={() => void load()} />
  ) : (
    <SellerPanel data={data as SellerShipping} onChanged={() => void load()} />
  )
}

/* ─────────────────────────── buyer ─────────────────────────── */

function BuyerPanel({ data, onSaved }: { data: BuyerShipping; onSaved: () => void }) {
  if (data.needsAddress)
    return <ChooseLocker orderId={data.id} carrierId={data.carrierId} onSaved={onSaved} />

  return (
    <section className="rounded-2xl border border-neutral-200 p-4">
      <header className="mb-4 flex items-center gap-2">
        <Truck className="h-4 w-4 text-neutral-500" />
        <h2 className="text-[15px] font-bold text-neutral-900">Livrare</h2>
      </header>

      <ShippingTimeline
        state={data.shippingStatus}
        shippedAt={data.shippedAt}
        deliveredAt={data.deliveredAt}
        rawStatus={data.rawStatus}
      />

      {data.destination && (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Punct de ridicare</p>
          <p className="mt-1 text-[14px] font-medium text-neutral-900">{data.destination.name || "Easybox"}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-neutral-600">
            {[data.destination.street, data.destination.locality, data.destination.county]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
      )}

      {data.trackingNumber && <TrackingRow awb={data.trackingNumber} carrier={data.carrier} />}
    </section>
  )
}

function ChooseLocker({
  orderId,
  carrierId,
  onSaved,
}: {
  orderId: string
  carrierId: number
  onSaved: () => void
}) {
  const [locker, setLocker] = useState<LockerOption | null>(null)
  const [contact, setContact] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!locker) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/shipping/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId, lockerId: locker.id, contact, phone }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || "Nu am putut salva adresa. Încearcă din nou.")
        return
      }
      onSaved()
    } catch {
      setError("Verifică conexiunea și încearcă din nou.")
    } finally {
      setSaving(false)
    }
  }

  const ready = Boolean(locker) && contact.trim().length >= 3 && phone.trim().length >= 10

  return (
    <section className="rounded-2xl border border-[#7c3aed]/25 bg-[#7c3aed]/[0.03] p-4">
      <header className="mb-1 flex items-center gap-2">
        <Package className="h-4 w-4 text-[#7c3aed]" />
        <h2 className="text-[15px] font-bold text-neutral-900">Unde livrăm coletul?</h2>
      </header>
      <p className="mb-4 text-[13.5px] leading-relaxed text-neutral-600">
        Alege easybox-ul din care vrei să ridici coletul. Vânzătorul primește eticheta abia după
        ce alegi, așa că expedierea începe imediat ce salvezi.
      </p>

      {/* Filtered to the seller's network. Both ends of a locker→locker
          shipment must be on one carrier, so offering the others would only
          produce a choice the server has to reject. */}
      <LockerPicker value={locker} onSelect={setLocker} carrierId={carrierId} disabled={saving} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Nume complet</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            disabled={saving}
            autoComplete="name"
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none focus:border-neutral-900 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Telefon</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
            inputMode="tel"
            autoComplete="tel"
            placeholder="07xxxxxxxx"
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50"
          />
        </label>
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-500">
        Curierul trimite codul de ridicare prin SMS la acest număr.
      </p>

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!ready || saving}
        onClick={submit}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? "Se salvează…" : "Confirmă punctul de livrare"}
      </button>
    </section>
  )
}

/* ─────────────────────────── seller ─────────────────────────── */

function SellerPanel({ data, onChanged }: { data: SellerShipping; onChanged: () => void }) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createAwb = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/shipping/order/${data.id}/awb`, {
        method: "POST",
        credentials: "include",
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || "Nu am putut genera eticheta. Încearcă din nou.")
        return
      }
      onChanged()
    } catch {
      setError("Verifică conexiunea și încearcă din nou.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 p-4">
      <header className="mb-4 flex items-center gap-2">
        <Package className="h-4 w-4 text-neutral-500" />
        <h2 className="text-[15px] font-bold text-neutral-900">Expediere</h2>
      </header>

      {!data.buyerReady && !data.awb ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
          <p className="text-[14px] font-semibold text-amber-900">Așteptăm adresa cumpărătorului</p>
          <p className="mt-1 text-[13px] leading-snug text-amber-800/80">
            Cumpărătorul nu a ales încă easybox-ul de livrare. Eticheta se generează automat imediat
            după ce o face — nu trebuie să faci nimic până atunci.
          </p>
        </div>
      ) : (
        <>
          <ShippingTimeline
            state={data.shippingStatus}
            shippedAt={data.shippedAt}
            deliveredAt={data.deliveredAt}
            rawStatus={data.rawStatus}
          />

          {data.awb ? (
            <>
              <ol className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 p-3.5 text-[13.5px] leading-relaxed text-neutral-700">
                <li>1. Împachetează articolul.</li>
                <li>2. Printează eticheta și lipeşte-o pe colet.</li>
                <li>
                  3. Lasă coletul la orice easybox {data.carrier ? `${data.carrier} ` : ""}care acceptă
                  ridicări{data.destinationLocality ? ` — pleacă spre ${data.destinationLocality}` : ""}.
                </li>
              </ol>

              <a
                href={data.labelUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
              >
                <Printer className="h-4 w-4" />
                Descarcă eticheta
              </a>

              <TrackingRow awb={data.awb} carrier={data.carrier} />
            </>
          ) : (
            <div className="mt-4">
              <p className="text-[13.5px] leading-relaxed text-neutral-600">
                Cumpărătorul și-a ales easybox-ul. Generează eticheta, printeaz-o și lasă coletul la
                orice easybox care acceptă ridicări.
              </p>
              {(error || data.error) && (
                <p className="mt-2 text-[12.5px] text-red-600">{error ?? data.error}</p>
              )}
              <button
                type="button"
                disabled={creating}
                onClick={createAwb}
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? "Se generează…" : "Generează eticheta"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ─────────────────────────── shared ─────────────────────────── */

function TrackingRow({ awb, carrier }: { awb: string; carrier: string | null }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(awb)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is permission-gated and refuses in some webviews. The number
      // is selectable on screen either way, so a failure needs no message.
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-neutral-50 p-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          AWB{carrier ? ` · ${carrier}` : ""}
        </span>
        <span className="mt-0.5 block select-all truncate font-mono text-[14px] text-neutral-900">{awb}</span>
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition-transform active:scale-[0.96]"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copiat" : "Copiază"}
      </button>
    </div>
  )
}
