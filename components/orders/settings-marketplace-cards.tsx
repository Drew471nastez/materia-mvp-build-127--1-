"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Loader2, ShoppingBag, Tag, Wallet } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal, triggerHaptic } from "@/lib/native-bridge"

type PaymentsStatus = { hasCreator: boolean; connected: boolean; chargesEnabled: boolean }

/**
 * The marketplace shelf on top of settings: order history for both sides of a
 * trade, and the seller's payments state. Styled in the settings form's own
 * card language (white, rounded-2xl, #e5e7eb border) so the shelf reads as part
 * of the page below it rather than a widget dropped on top.
 *
 * The Plăți card is DB-truth, not Stripe-truth — /api/seller/payments-status is
 * a single row read, cheap enough to ask on every settings visit. The payments
 * tab further down is where the columns get reconciled against Stripe itself.
 * Someone with no creator row gets no card at all: they have nothing to
 * connect, and a "become a seller" pitch belongs to onboarding, not settings.
 */
export function SettingsMarketplaceCards() {
  const [status, setStatus] = useState<PaymentsStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/seller/payments-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setStatus(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const connectStripe = async () => {
    void triggerHaptic("light")
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        setError(data?.error || "Nu am putut porni conectarea Stripe. Încearcă din nou.")
        setBusy(false)
        return
      }
      // The account link is a one-time Stripe-hosted URL; connect/start's
      // return_url brings the seller back to settings when onboarding ends.
      // Busy stays on during the redirect so the button doesn't flicker back.
      if (isNativeApp()) {
        openExternal(data.url)
        setBusy(false)
      } else {
        window.location.href = data.url
      }
    } catch {
      setError("Nu am putut porni conectarea Stripe. Încearcă din nou.")
      setBusy(false)
    }
  }

  const showPayments = status?.hasCreator === true
  const active = !!status?.connected && !!status?.chargesEnabled

  return (
    <div className="mb-6 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HubLink
          href="/purchases"
          icon={ShoppingBag}
          title="Achizițiile mele"
          body="Comenzile plasate de tine"
        />
        <HubLink
          href="/sales"
          icon={Tag}
          title="Vânzările mele"
          body="Comenzile primite pentru anunțurile tale"
        />
      </div>

      {showPayments && (
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[#7c3aed]">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#111827]">Plăți</p>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">
                  {active
                    ? "Contul Stripe este conectat și poate încasa plăți."
                    : status?.connected
                      ? "Finalizează configurarea Stripe ca să poți încasa plăți."
                      : "Conectează Stripe ca să primești banii din vânzări."}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : status?.connected
                    ? "bg-amber-50 text-amber-700"
                    : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {active ? "Activ" : status?.connected ? "Configurare incompletă" : "Neconectat"}
            </span>
          </div>

          {!active && (
            <button
              type="button"
              onClick={connectStripe}
              disabled={busy}
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[14px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {status?.connected ? "Continuă configurarea" : "Conectează Stripe"}
            </button>
          )}
          {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

function HubLink({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string
  icon: typeof ShoppingBag
  title: string
  body: string
}) {
  return (
    <Link
      href={href}
      onClick={() => void triggerHaptic("light")}
      className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm transition-transform active:scale-[0.98] sm:p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[#7c3aed]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[#111827]">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#6b7280]">{body}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" />
    </Link>
  )
}
