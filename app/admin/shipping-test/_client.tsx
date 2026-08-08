"use client"

import { useCallback, useState } from "react"

/**
 * The shipping simulation, driven entirely through our own backend.
 *
 * Nothing here knows the eAWB key exists. Every button posts to
 * /api/admin/shipping-test, which holds the credential server-side and returns
 * an already-sanitised result — so this page can be read, screenshotted or
 * shared without leaking anything.
 *
 * Ordered by how much each button can do: connection reads the account, quote
 * validates a full shipment and prices it without booking anything, and create
 * is the only one that costs money — so it is last, visually separated, and
 * requires a typed phrase.
 */

type Result = Record<string, unknown> | null

/** One bookable option, as lib/shipping/compare.ts returns it. */
type CompareOption = {
  carrierId: number
  carrier: string
  serviceId: number
  serviceName: string
  amount: number
  vat: number
  total: number
  currency: string
  estimatedPickup: string | null
  estimatedDelivery: string | null
  labelPrintRequired: boolean
  from: { id: number; name: string; street: string; streetNumber: string; locality: string; county: string }
  to: { id: number; name: string; street: string; streetNumber: string; locality: string; county: string }
}

/**
 * Prefilled with a combination VERIFIED against the live API: Sameday
 * locker→locker, Bucharest easybox 66725 → Cluj easybox 2210235, which priced
 * at 19.89 RON. Starting from something known to work means a failure here is
 * information about what you changed, not about the defaults.
 *
 * Note the street fields are present ALONGSIDE the locker id. The provider
 * requires both: sending only `fixed_location_id` fails validation with
 * "street_name field is required". The address of the locker itself is the
 * correct thing to put there.
 */
const SELLER = {
  contact: "Andrew Radu",
  phone: "0751048522",
  email: "seller@storelib.com",
  country_code: "RO",
  county_name: "Bucuresti",
  locality_name: "Bucuresti",
  street_name: "Str. Sergent Pechiu Ion",
  street_number: "3-7",
  fixed_location_id: "66725",
}
const BUYER = {
  contact: "John Pop",
  phone: "0740123456",
  email: "buyer@example.com",
  country_code: "RO",
  county_name: "Cluj",
  locality_name: "Cluj-Napoca",
  street_name: "Str. Eugen Ionesco",
  street_number: "73",
  fixed_location_id: "2210235",
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-[14px]"
      />
    </label>
  )
}

export default function ShippingTestClient() {
  const [from, setFrom] = useState<Record<string, string>>(SELLER)
  const [to, setTo] = useState<Record<string, string>>(BUYER)
  const [carrierId, setCarrierId] = useState("6")
  const [serviceId, setServiceId] = useState("4")
  const [billingAddressId, setBillingAddressId] = useState("391214")
  const [weight, setWeight] = useState("1")
  const [contents, setContents] = useState("Vintage Nike Jacket")
  const [reference, setReference] = useState("ST-TEST-1")
  const [awb, setAwb] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<Result>(null)
  const [title, setTitle] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const call = useCallback(
    async (mode: string, extra: Record<string, unknown> = {}) => {
      setBusy(mode)
      setTitle(mode)
      try {
        const res = await fetch("/api/admin/shipping-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            carrierId: Number(carrierId),
            serviceId: Number(serviceId),
            billingAddressId: Number(billingAddressId),
            from,
            to,
            weight: Number(weight),
            contents,
            reference,
            ...extra,
          }),
        })
        setResult((await res.json()) as Result)
      } catch (e) {
        setResult({ ok: false, message: (e as Error).message })
      } finally {
        setBusy(null)
      }
    },
    [carrierId, serviceId, billingAddressId, from, to, weight, contents, reference],
  )

  const ok = result?.ok === true
  const options = (result?.options as Array<Record<string, unknown>>) ?? null
  const payload = (result?.payload as Record<string, unknown>) ?? null
  const wallet = (result?.wallet as { balance: number; currency: string } | null) ?? null
  const compare = (result?.options as CompareOption[] | undefined) ?? null
  // A created shipment: the AWB to read, and the provider's order id, which is
  // what both the label PDF and the cancellation are keyed on.
  const created = (result?.result as { awb?: string; orderId?: number; carrier?: string } | undefined) ?? null
  const skipped = (result?.skipped as Array<{ carrier: string; reason: string }>) ?? null
  const isCompare = title === "compare"

  /**
   * Adopt one quoted option wholesale.
   *
   * Carrier, service AND BOTH LOCKERS move together, and that is the whole
   * point. Each carrier runs its own locker network — FAN's boxes are not
   * Sameday's — so a price is only valid for the exact pair it was quoted
   * with. Selecting a carrier without its lockers would produce a booking that
   * either fails validation or routes the parcel somewhere nobody chose.
   */
  const selectOption = (o: CompareOption) => {
    setCarrierId(String(o.carrierId))
    setServiceId(String(o.serviceId))
    setFrom((f) => ({
      ...f,
      county_name: o.from.county,
      locality_name: o.from.locality,
      street_name: o.from.street,
      street_number: o.from.streetNumber,
      fixed_location_id: String(o.from.id),
    }))
    setTo((t) => ({
      ...t,
      county_name: o.to.county,
      locality_name: o.to.locality,
      street_name: o.to.street,
      street_number: o.to.streetNumber,
      fixed_location_id: String(o.to.id),
    }))
    setSelected(`${o.carrierId}:${o.serviceId}`)
  }
  const problems = (result?.wouldFailCreate ?? result?.problems) as string[] | undefined

  /** The two ids the provider validates for locker services, pulled out of the
   *  payload so they can be checked at a glance instead of by reading JSON.
   *  This is the whole point of the panel: they were being dropped silently. */
  const lockerIds = payload
    ? {
        from: (payload.address_from as Record<string, unknown> | undefined)?.fixed_location_id,
        to: (payload.address_to as Record<string, unknown> | undefined)?.fixed_location_id,
      }
    : null

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-[22px] font-bold text-neutral-900">Test expediere (eAWB)</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
        Verifică integrarea de curierat fără să atingi comenzile reale.{" "}
        <strong>Conexiune</strong> și <strong>Calculează preț</strong> nu creează nimic —
        prețul rulează exact aceleași validări ca o comandă reală, pe exact același
        corp de cerere. <strong>Creează AWB</strong> comandă un curier adevărat și costă bani.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Field label="Carrier ID (6 = Sameday)" value={carrierId} onChange={setCarrierId} />
        <Field label="Service ID (4 = locker→locker)" value={serviceId} onChange={setServiceId} />
        <Field label="Billing address ID" value={billingAddressId} onChange={setBillingAddressId} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {(
          [
            ["Expeditor (vânzător)", from, setFrom],
            ["Destinatar (cumpărător)", to, setTo],
          ] as const
        ).map(([label, value, set]) => (
          <div key={label} className="rounded-xl border border-neutral-200 p-4">
            <p className="mb-3 text-[13px] font-semibold text-neutral-900">{label}</p>
            <div className="grid gap-2">
              {(["contact", "phone", "email", "county_name", "locality_name", "street_name", "street_number", "fixed_location_id"] as const).map(
                (k) => (
                  <Field
                    key={k}
                    label={k}
                    value={value[k] ?? ""}
                    onChange={(v) => set({ ...value, [k]: v })}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Field label="Greutate (kg)" value={weight} onChange={setWeight} />
        <Field label="Conținut" value={contents} onChange={setContents} />
        <Field label="Referință internă" value={reference} onChange={setReference} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => call("connection")}
          className="rounded-full border border-neutral-300 px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {busy === "connection" ? "…" : "1. Testează conexiunea"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => call("compare")}
          className="rounded-full border border-neutral-900 px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {busy === "compare" ? "…" : "2. Compară toți curierii"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => call("quote")}
          className="rounded-full bg-neutral-900 px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {busy === "quote" ? "…" : "3. Calculează preț (nu creează nimic)"}
        </button>
      </div>

      {/* Everything above is read-only. Everything below books a courier. */}
      <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-[13px] font-semibold text-amber-900">Creează AWB real</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">
          Furnizorul nu are mediu de test. Această acțiune comandă un curier real și
          costă bani. Nu există cheie de idempotență la furnizor — două apăsări
          înseamnă două expedieri.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label='Scrie: CREATE REAL SHIPMENT' value={confirm} onChange={setConfirm} />
          <button
            type="button"
            disabled={busy !== null || confirm !== "CREATE REAL SHIPMENT"}
            onClick={() => call("create", { confirm })}
            className="rounded-full bg-amber-600 px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {busy === "create" ? "…" : "Creează AWB"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <Field label="AWB" value={awb} onChange={setAwb} />
        <button
          type="button"
          disabled={busy !== null || !awb}
          onClick={() => call("label", { awb })}
          className="rounded-full border border-neutral-300 px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          Etichetă
        </button>
        <button
          type="button"
          disabled={busy !== null || !awb}
          onClick={() => call("track", { awb })}
          className="rounded-full border border-neutral-300 px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          Urmărire
        </button>
      </div>

      {result && (
        <div className="mt-8">
          <p className="text-[13px] font-semibold text-neutral-900">
            {title} — {ok ? "SUCCES" : "EȘUAT"}
          </p>
          {/* The plain quote list. Compare mode also returns `options`, but in a
              different shape and with its own renderer above, so this must not
              also fire for it. */}
          {!isCompare && options && options.length > 0 && (
            <ul className="mt-3 space-y-2">
              {options.map((o, i) => (
                <li key={i} className="rounded-xl border border-neutral-200 p-3 text-[13.5px]">
                  <strong>{String(o.carrier)}</strong> · {String(o.service_name)} ·{" "}
                  <strong>
                    {String((o.price as Record<string, unknown>)?.total)}{" "}
                    {String((o.price as Record<string, unknown>)?.currency)}
                  </strong>
                  <div className="text-[12px] text-neutral-500">
                    ridicare {String(o.estimated_pickup_date)} · livrare{" "}
                    {String(o.estimated_delivery_date)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* Every bookable locker→locker option, cheapest first. Each row was
              priced with THAT carrier's own lockers, so selecting one adopts
              its lockers along with its carrier and service. */}
          {isCompare && compare && (
            <div className="mt-3">
              {compare.length === 0 ? (
                <p className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-[13.5px] text-amber-900">
                  Niciun curier nu are easybox-uri la ambele capete ale acestei rute.
                </p>
              ) : (
                <ul className="space-y-2">
                  {compare.map((o, i) => {
                    const key = `${o.carrierId}:${o.serviceId}`
                    const isSelected = selected === key
                    return (
                      <li
                        key={key}
                        className={`rounded-xl border p-3.5 ${
                          isSelected
                            ? "border-neutral-900 bg-neutral-50"
                            : i === 0
                              ? "border-emerald-300 bg-emerald-50/50"
                              : "border-neutral-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-neutral-900">
                              {o.carrier}{" "}
                              {i === 0 && (
                                <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  cel mai ieftin
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[12.5px] text-neutral-600">
                              {o.serviceName} · carrier_id {o.carrierId} · service_id {o.serviceId}
                            </p>
                            <p className="mt-1 text-[12px] text-neutral-500">
                              Predare: {o.from.name} ({o.from.id}) · {o.from.locality}
                            </p>
                            <p className="text-[12px] text-neutral-500">
                              Livrare: {o.to.name} ({o.to.id}) · {o.to.locality}
                            </p>
                            <p className="mt-1 text-[12px] text-neutral-500">
                              Ridicare {o.estimatedPickup ?? "—"} · livrare {o.estimatedDelivery ?? "—"}
                              {o.labelPrintRequired ? " · necesită etichetă printată" : " · fără printare"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[20px] font-bold text-neutral-900">
                              {o.total.toFixed(2)} {o.currency}
                            </p>
                            <p className="text-[11.5px] text-neutral-500">
                              {o.amount.toFixed(2)} + TVA {o.vat.toFixed(2)}
                            </p>
                            <button
                              type="button"
                              onClick={() => selectOption(o)}
                              className={`mt-2 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-transform active:scale-[0.96] ${
                                isSelected
                                  ? "bg-neutral-900 text-white"
                                  : "border border-neutral-300 text-neutral-800"
                              }`}
                            >
                              {isSelected ? "Selectat" : "Selectează"}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {skipped && skipped.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-[12px] text-neutral-500">
                  {skipped.map((s, i) => (
                    <li key={i}>
                      {s.carrier}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <p className="mt-3 rounded-xl bg-neutral-900 p-3 text-[13px] font-medium text-white">
                  Opțiune selectată — câmpurile de mai sus (curier, serviciu și ambele easybox-uri) au
                  fost completate. Poți calcula prețul sau crea AWB-ul cu ele.
                </p>
              )}
            </div>
          )}

          {/* THE POINT OF THE WHOLE PAGE: a real AWB, its barcode, and a way
              to undo it. The provider refunds a cancelled order to the wallet,
              so a test costs nothing once the money is there. */}
          {created?.awb && (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50/60 p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-800">
                AWB generat{created.carrier ? ` · ${created.carrier}` : ""}
              </p>
              <p className="mt-1 select-all font-mono text-[24px] font-bold leading-tight text-neutral-900">
                {created.awb}
              </p>
              {created.orderId && (
                <p className="mt-0.5 text-[12px] text-neutral-500">order_id furnizor: {created.orderId}</p>
              )}

              {created.orderId && (
                <>
                  {/* Rendered, not linked. The barcode and QR are the thing
                      being verified, and a download link does not show them. */}
                  <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <iframe
                      src={`/api/admin/shipping-test/label?orderId=${created.orderId}&format=A6`}
                      title="Etichetă AWB"
                      className="h-[520px] w-full"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={`/api/admin/shipping-test/label?orderId=${created.orderId}&format=A6`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-neutral-300 px-4 py-2 text-[13px] font-semibold"
                    >
                      Deschide A6
                    </a>
                    <a
                      href={`/api/admin/shipping-test/label?orderId=${created.orderId}&format=A4`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-neutral-300 px-4 py-2 text-[13px] font-semibold"
                    >
                      Deschide A4
                    </a>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => call("cancel", { providerOrderId: created.orderId })}
                      className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                    >
                      {busy === "cancel" ? "…" : "Anulează AWB (banii se întorc în portofel)"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* An empty wallet is the most likely reason a create fails, and it
              costs a permanent "failed" order at the provider to find out the
              hard way. Shown as soon as the connection is checked. */}
          {wallet && (
            <div
              className={`mt-3 rounded-xl border p-3.5 ${
                wallet.balance > 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"
              }`}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
                Sold portofel eAWB
              </p>
              <p className="mt-1 text-[18px] font-bold text-neutral-900">
                {wallet.balance} {wallet.currency}
              </p>
              {wallet.balance <= 0 && (
                <p className="mt-1 text-[12.5px] leading-snug text-amber-800">
                  Cu sold 0 nu se poate genera niciun AWB. Alimentează contul pe eAWB.ro — o
                  expediere locker→locker costă ~19.89 RON.
                </p>
              )}
            </div>
          )}

          {/* The two ids the provider validates, first and unmissable. They
              were being dropped between the form and the request, and nothing
              on this page showed what was actually sent. */}
          {lockerIds && (
            <div
              className={`mt-3 rounded-xl border p-3.5 ${
                problems && problems.length > 0
                  ? "border-red-300 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
                fixed_location_id trimis către eAWB
              </p>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[13px] text-neutral-800">
                <li>
                  address_from:{" "}
                  <strong>{lockerIds.from === undefined ? "LIPSEȘTE" : String(lockerIds.from)}</strong>
                </li>
                <li>
                  address_to:{" "}
                  <strong>{lockerIds.to === undefined ? "LIPSEȘTE" : String(lockerIds.to)}</strong>
                </li>
              </ul>
              {problems && problems.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12.5px] text-red-700">
                  {problems.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {payload && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-neutral-700">
                Corpul exact trimis către eAWB (fără date personale)
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-neutral-50 p-4 text-[12px] leading-relaxed text-neutral-700">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          )}

          <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-neutral-50 p-4 text-[12px] leading-relaxed text-neutral-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
