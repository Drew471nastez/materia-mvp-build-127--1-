"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Package } from "lucide-react"

import { LockerPicker, type LockerOption } from "@/components/shipping/locker-picker"

/**
 * Where do you want it delivered? — asked BEFORE paying, the way Vinted does.
 *
 * This is a gate in front of checkout, not part of it: the payment page is
 * untouched, and this page's only job is to record a delivery point and then
 * step out of the way. If anything here fails in a way the buyer cannot fix —
 * the shipping feature not being installed, the courier's locker list being
 * down — it forwards to checkout anyway rather than standing between somebody
 * and a purchase they want to make. A missing address is recoverable later on
 * the order page; a lost sale is not.
 */
export default function DeliveryStepClient({
  nextUrl,
  carrierId,
  initialEmail,
  signedIn,
  productTitle,
  productPrice,
}: {
  nextUrl: string
  carrierId: number
  initialEmail: string
  signedIn: boolean
  productTitle: string | null
  productPrice: string | null
}) {
  const router = useRouter()
  const [locker, setLocker] = useState<LockerOption | null>(null)
  const [contact, setContact] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState(initialEmail)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A returning buyer should not retype an address they already gave us. Only
  // for signed-in buyers — a guest has no identity to look one up by until they
  // have typed the email, and prefilling from one would be guesswork.
  useEffect(() => {
    if (!signedIn) return
    let alive = true
    fetch("/api/shipping/preference", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.preference) return
        const p = d.preference
        setContact((c) => c || p.contact || "")
        setPhone((c) => c || p.phone || "")
        setLocker({
          id: p.lockerId,
          name: p.details || "Easybox",
          address: [p.street, p.streetNo].filter(Boolean).join(" "),
          carrier: "",
          carrierId: p.carrierId ?? carrierId,
          locality: p.locality ?? "",
          localityId: 0,
          county: p.county ?? "",
          allowsDropOff: true,
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [signedIn, carrierId])

  const proceed = useCallback(() => router.replace(nextUrl), [router, nextUrl])

  const submit = async () => {
    if (!locker) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/shipping/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lockerId: locker.id, contact, phone, email }),
      })
      const json = await res.json()
      if (!json.ok) {
        // Not installed, or the courier is unreachable — neither is the buyer's
        // fault and neither is fixable by them, so do not trap them here.
        if (json.code === "shipping_not_configured" || json.code === "provider_unavailable") {
          proceed()
          return
        }
        setError(json.message || "Nu am putut salva adresa. Încearcă din nou.")
        return
      }
      proceed()
    } catch {
      setError("Verifică conexiunea și încearcă din nou.")
    } finally {
      setSaving(false)
    }
  }

  const emailOk = signedIn || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready = Boolean(locker) && contact.trim().length >= 3 && phone.trim().length >= 10 && emailOk

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-3 md:pb-12">
      <button
        type="button"
        onClick={() => router.back()}
        className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-neutral-600 transition-colors active:bg-neutral-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Înapoi
      </button>

      <div className="mt-2 flex items-center gap-2">
        <Package className="h-5 w-5 text-[#7c3aed]" />
        <h1 className="text-[22px] font-bold leading-tight text-neutral-900">Unde livrăm coletul?</h1>
      </div>
      <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-600">
        Alege easybox-ul din care vrei să ridici coletul. Poți plăti după ce alegi.
      </p>

      {productTitle && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-3.5 py-3">
          <span className="min-w-0 truncate text-[14px] font-medium text-neutral-800">{productTitle}</span>
          {productPrice && (
            <span className="ml-3 shrink-0 text-[14px] font-bold text-neutral-900">{productPrice}</span>
          )}
        </div>
      )}

      <div className="mt-5">
        <LockerPicker value={locker} onSelect={setLocker} carrierId={carrierId} disabled={saving} />
      </div>

      <div className="mt-5 grid gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Nume complet</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            disabled={saving}
            autoComplete="name"
            className="h-12 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none focus:border-neutral-900 disabled:opacity-50"
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
            className="h-12 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50"
          />
        </label>
        {!signedIn && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              inputMode="email"
              autoComplete="email"
              className="h-12 rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] outline-none focus:border-neutral-900 disabled:opacity-50"
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-500">
        Curierul trimite codul de ridicare prin SMS la acest număr.
      </p>

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!ready || saving}
        onClick={submit}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? "Se salvează…" : "Continuă spre plată"}
      </button>

      {/* An escape hatch, stated plainly. Somebody who cannot find their locker
          should still be able to buy — the address can be set on the order. */}
      <button
        type="button"
        onClick={proceed}
        disabled={saving}
        className="mt-3 w-full text-center text-[13px] font-medium text-neutral-500 underline underline-offset-2 disabled:opacity-40"
      >
        Aleg mai târziu
      </button>
    </div>
  )
}
