"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, AlertCircle, Link2, ShieldCheck, Unplug } from "lucide-react"

type StripeStatus = {
  connected: boolean
  status: string
  accountId?: string | null
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
}

export default function StripeManagePage() {
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/stripe/connect/status")
      const data = await res.json()
      if (res.ok) setStatus(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const connect = async () => {
    setBusy("connect")
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" })
      const data = await res.json()
      if (data?.url) window.location.href = data.url
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    try {
      await fetch("/api/stripe/connect/disconnect", { method: "POST" })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link href="/app/settings/payments" className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900 mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to payments
      </Link>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1a1a2e]">Stripe connection</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage your Stripe payout connection.</p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Checking Stripe status...</p>
          ) : status?.connected ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> You have successfully connected Stripe</p>
              <p className="text-sm text-neutral-700">Your account is able to receive payments through Stripe.</p>
              <p className="text-xs text-neutral-500">Account: {status.accountId || "Connected"}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border text-xs"><ShieldCheck className="h-3.5 w-3.5" /> Charges: {status.chargesEnabled ? "Enabled" : "Pending"}</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border text-xs"><Link2 className="h-3.5 w-3.5" /> Payouts: {status.payoutsEnabled ? "Enabled" : "Pending"}</span>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-amber-700"><AlertCircle className="h-4 w-4" /> Stripe is not connected yet.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={connect} disabled={busy !== null} className="h-10 px-4 rounded-lg bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 cursor-pointer">
            {busy === "connect" ? "Connecting..." : status?.connected ? "Reconnect Stripe" : "Connect Stripe"}
          </button>
          <button onClick={disconnect} disabled={busy !== null || !status?.connected} className="h-10 px-4 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
            <Unplug className="h-4 w-4" /> {busy === "disconnect" ? "Disconnecting..." : "Disconnect Stripe"}
          </button>
        </div>
      </div>
    </div>
  )
}
