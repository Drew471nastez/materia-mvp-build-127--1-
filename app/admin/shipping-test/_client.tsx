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
          onClick={() => call("quote")}
          className="rounded-full bg-neutral-900 px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {busy === "quote" ? "…" : "2. Calculează preț (nu creează nimic)"}
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
          {options && options.length > 0 && (
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
          <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-neutral-50 p-4 text-[12px] leading-relaxed text-neutral-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
