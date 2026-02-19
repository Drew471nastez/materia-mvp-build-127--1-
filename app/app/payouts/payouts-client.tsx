"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Wallet, DollarSign, Clock, CheckCircle2, AlertCircle, Building2,
  Download, Loader2, TrendingUp, ChevronDown, X, RotateCcw,
  ArrowDownLeft, ArrowUpRight, Package, CreditCard, Copy, Check,
  Landmark, Send, Zap, HelpCircle, Calendar, Eye, XCircle, Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Creator {
  id: string
  username?: string
  stripe_account_id?: string
  stripe_onboarding_status?: string
  charges_enabled?: boolean
  payouts_enabled?: boolean
  default_currency?: string
  payout_schedule?: string
}

interface OrderPayment {
  id: string
  amount_cents: number
  fee_cents: number
  created_at: string
  status: string
  customer_email?: string
  buyer_email?: string
  product_id: string
  stripe_payment_intent_id?: string
  refund_reason?: string
  refund_amount_cents?: number
  refunded_at?: string
  stripe_refund_id?: string
  receipt_token?: string
  buyer_first_name?: string
  buyer_last_name?: string
  payment_method?: string
  card_brand?: string | null
  card_last4?: string | null
  product?: { title: string; thumbnail_url?: string | null; type?: string } | null
}

interface StripePayout {
  id: string
  amount: number
  currency: string
  status: string
  arrival_date: number | null
  created: number
  method: string
  destination: string | null
  description?: string | null
}

interface TimelineItem {
  id: string
  label: string
  description: string
  timestamp: string | null
  status: "completed" | "pending" | "upcoming"
}

interface ChartPoint {
  date: string
  revenue: number
  gross: number
  count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function fmtShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtFull(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

function fmtUnix(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function payoutStatusConfig(status: string) {
  switch (status) {
    case "paid":       return { label: "Paid",       color: "bg-green-100 text-green-700",  icon: CheckCircle2 }
    case "in_transit": return { label: "In transit",  color: "bg-blue-100 text-blue-700",    icon: ArrowUpRight }
    case "pending":    return { label: "Pending",     color: "bg-yellow-100 text-yellow-700", icon: Clock }
    case "failed":     return { label: "Failed",      color: "bg-red-100 text-red-700",      icon: XCircle }
    case "canceled":   return { label: "Canceled",    color: "bg-gray-100 text-gray-600",    icon: X }
    default:           return { label: status,        color: "bg-gray-100 text-gray-600",    icon: HelpCircle }
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-gray-200", className)} />
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, loading, accent,
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; loading?: boolean; accent?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex gap-4 items-start shadow-sm">
      <div className={cn("p-2.5 rounded-xl shrink-0", accent || "bg-violet-50")}>
        <Icon className={cn("h-5 w-5", accent ? "text-white" : "text-violet-600")} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-28 mt-1" />
        ) : (
          <p className="text-[22px] font-bold text-gray-900 mt-0.5 leading-none">{value}</p>
        )}
        {sub && !loading && <p className="text-[12px] text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────

const CHART_DAYS = [
  { label: "7D",  value: "7" },
  { label: "30D", value: "30" },
  { label: "90D", value: "90" },
  { label: "All", value: "all" },
]

function RevenueChart({ currency }: { currency: string }) {
  const [days, setDays] = useState("30")
  const [data, setData] = useState<ChartPoint[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/stripe/revenue-chart?days=${d}`)
      if (!r.ok) throw new Error("Failed to load chart")
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setData(json.data || [])
      setTotal(json.total || 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const hasData = data.some((d) => d.revenue > 0)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-[13px]">
        <p className="text-gray-500 mb-1">{label}</p>
        <p className="font-bold text-gray-900">{fmt(payload[0].value, currency)}</p>
        {payload[0].payload.count > 0 && (
          <p className="text-gray-400">{payload[0].payload.count} sale{payload[0].payload.count !== 1 ? "s" : ""}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[13px] text-gray-500 font-medium">Revenue (net received)</p>
          {loading ? (
            <Skeleton className="h-7 w-32 mt-1" />
          ) : (
            <p className="text-[24px] font-bold text-gray-900">{fmt(total, currency)}</p>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {CHART_DAYS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all",
                days === opt.value
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-[13px] text-red-500">{error}</p>
        </div>
      ) : !hasData ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
          <TrendingUp className="h-8 w-8 text-gray-300" />
          <p className="text-[14px] text-gray-400">No revenue in this period yet</p>
          <p className="text-[12px] text-gray-300">Sales will appear here once processed</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const d = new Date(v + "T00:00:00")
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#7c3aed"
              strokeWidth={2.5}
              fill="url(#revGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Payouts List ──────────────────────────────────────────────────────────────

function PayoutsList({
  stripeAccountId, currency, refreshKey,
}: {
  stripeAccountId: string; currency: string; refreshKey: number
}) {
  const [payouts, setPayouts] = useState<StripePayout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/stripe/payouts")
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setPayouts(json.payouts || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <AlertDescription className="text-red-700">{error}</AlertDescription>
      </Alert>
    )
  }

  if (!payouts.length) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
        <Landmark className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-[15px] font-semibold text-gray-500">No payouts yet</p>
        <p className="text-[13px] text-gray-400 mt-1">Your payout history will appear here after your first withdrawal.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Date</th>
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Amount</th>
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide hidden md:table-cell">Destination</th>
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide hidden lg:table-cell">Arrival</th>
              <th className="text-left px-5 py-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wide hidden lg:table-cell">Payout ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payouts.map((p) => {
              const cfg = payoutStatusConfig(p.status)
              const Icon = cfg.icon
              const arrivalText = p.arrival_date
                ? fmtUnix(p.arrival_date)
                : "1–3 business days"
              return (
                <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-4 text-gray-700 whitespace-nowrap">{fmtUnix(p.created)}</td>
                  <td className="px-5 py-4 font-semibold text-gray-900 whitespace-nowrap">
                    {fmt(p.amount, p.currency)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold", cfg.color)}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 hidden md:table-cell">
                    {p.destination ? (
                      <span className="font-mono">{p.destination}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-500 hidden lg:table-cell">
                    {p.status === "paid" ? (
                      <span className="text-green-600 font-medium">Arrived {arrivalText}</span>
                    ) : (
                      <span>Est. {arrivalText}</span>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className="font-mono text-[11px] text-gray-400">{p.id}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40">
        <p className="text-[12px] text-gray-400">
          Most payouts arrive in 1–3 business days depending on your bank and region.
        </p>
      </div>
    </div>
  )
}

// ─── Withdraw Tab ──────────────────────────────────────────────────────────────

function WithdrawTab({
  availableBalance, currency, onSuccess,
}: {
  availableBalance: number; currency: string; onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { toast } = useToast()

  const handleWithdraw = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/stripe/withdraw", { method: "POST" })
      const json = await r.json()
      if (!r.ok || json.error) throw new Error(json.error || "Withdrawal failed")
      setSuccess(true)
      toast({
        title: "Withdrawal created!",
        description: `${fmt(json.payout.amount, json.payout.currency)} is on its way to your bank.`,
      })
      onSuccess()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h3 className="text-[18px] font-bold text-gray-900 mb-1">Withdrawal initiated!</h3>
        <p className="text-[14px] text-gray-500 mb-6">
          Your funds are on their way. Most payouts arrive in 1–3 business days.
        </p>
        <Button variant="outline" onClick={() => { setSuccess(false); onSuccess() }}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white">
        <p className="text-[13px] text-violet-200 uppercase tracking-wide font-medium mb-1">Available to cash out</p>
        <p className="text-[36px] font-bold leading-none">{fmt(availableBalance, currency)}</p>
        <p className="text-[13px] text-violet-300 mt-2">
          {availableBalance > 0 ? "Ready to transfer to your bank account." : "No funds available right now."}
        </p>
      </div>

      {/* Withdraw card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-[16px] font-semibold text-gray-900 mb-1">Withdraw funds</h3>
        <p className="text-[13px] text-gray-500 mb-5">
          This will withdraw your full available balance to your connected bank account.
          Stripe typically transfers funds within 1–3 business days.
        </p>

        {error && (
          <Alert className="border-red-200 bg-red-50 mb-4">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={handleWithdraw}
            disabled={loading || availableBalance <= 0}
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 h-11 rounded-xl font-semibold"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
            ) : availableBalance <= 0 ? (
              "No funds available"
            ) : (
              <><Send className="h-4 w-4 mr-2" />Withdraw {fmt(availableBalance, currency)}</>
            )}
          </Button>
          {availableBalance <= 0 && (
            <p className="text-[13px] text-gray-400">Funds will appear once Stripe clears them.</p>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2.5 p-3.5 bg-blue-50 rounded-xl">
          <Zap className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-[12px] text-blue-700">
            Withdrawals are processed by Stripe and sent to your connected bank account.
            If payouts aren't enabled, complete your Stripe onboarding first.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Order Timeline ────────────────────────────────────────────────────────────

function OrderTimeline({ orderId, amountCents }: { orderId: string; amountCents: number }) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isFree, setIsFree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(`/api/stripe/order-timeline?orderId=${orderId}`)
        const json = await r.json()
        if (cancelled) return
        if (json.error) throw new Error(json.error)
        setIsFree(json.free)
        setTimeline(json.timeline || [])
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [orderId])

  if (amountCents === 0) {
    return (
      <div className="p-3 bg-gray-50 rounded-xl text-[13px] text-gray-400 text-center">
        No payout timeline for free orders.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  if (error) {
    return <p className="text-[12px] text-red-500">{error}</p>
  }

  if (isFree) {
    return (
      <div className="p-3 bg-gray-50 rounded-xl text-[13px] text-gray-400 text-center">
        No payout timeline for free orders.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {timeline.map((item, i) => {
        const isLast = i === timeline.length - 1
        return (
          <div key={item.id} className="flex gap-3">
            {/* Dot + Line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                item.status === "completed" ? "bg-violet-600" :
                item.status === "pending"   ? "bg-yellow-400" :
                                              "bg-gray-200"
              )}>
                {item.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                ) : item.status === "pending" ? (
                  <Clock className="h-3.5 w-3.5 text-white" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                )}
              </div>
              {!isLast && (
                <div className={cn(
                  "w-px flex-1 mt-1 min-h-[20px]",
                  item.status === "completed" ? "bg-violet-200" : "bg-gray-200"
                )} />
              )}
            </div>
            {/* Content */}
            <div className={cn("pb-4 min-w-0", isLast ? "" : "")}>
              <p className={cn(
                "text-[13px] font-semibold leading-none",
                item.status === "upcoming" ? "text-gray-400" : "text-gray-900"
              )}>
                {item.label}
              </p>
              <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">{item.description}</p>
              {item.timestamp && (
                <p className="text-[11px] text-gray-300 mt-0.5 font-mono">
                  {fmtShort(item.timestamp)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Order Details Sheet ───────────────────────────────────────────────────────

function OrderDetailsSheet({
  order, onClose, currency,
}: {
  order: OrderPayment | null; onClose: () => void; currency: string
}) {
  const [showTimeline, setShowTimeline] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundDone, setRefundDone] = useState(false)
  const { toast } = useToast()

  useEffect(() => { setShowTimeline(false); setRefundDone(false) }, [order])

  if (!order) return null

  const net = order.amount_cents - order.fee_cents
  const buyerName = [order.buyer_first_name, order.buyer_last_name].filter(Boolean).join(" ")
  const buyerEmail = order.buyer_email || order.customer_email || "—"

  const copyId = () => {
    navigator.clipboard.writeText(order.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRefund = async () => {
    setRefundLoading(true)
    try {
      const r = await fetch("/api/stripe/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      })
      const json = await r.json()
      if (!r.ok || json.error) throw new Error(json.error || "Refund failed")
      setRefundDone(true)
      toast({ title: "Refund issued", description: "The buyer will be notified." })
    } catch (e: any) {
      toast({ title: "Refund failed", description: e.message, variant: "destructive" })
    } finally {
      setRefundLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[16px] font-bold text-gray-900">{order.product?.title || "Order"}</p>
            <p className="text-[12px] text-gray-400 mt-0.5 font-mono">{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Amounts */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <Row label="Gross sale" value={fmt(order.amount_cents, currency)} />
            <Row label="Platform fee" value={`−${fmt(order.fee_cents, currency)}`} valueClass="text-red-500" />
            <div className="border-t border-gray-200 pt-2">
              <Row label="Net earnings" value={fmt(net, currency)} valueClass="font-bold text-violet-700" />
            </div>
          </div>

          {/* Buyer */}
          <Section title="Buyer">
            <Row label="Name"  value={buyerName || "—"} />
            <Row label="Email" value={buyerEmail} />
            {order.card_brand && (
              <Row label="Card" value={`${order.card_brand.toUpperCase()} ••••${order.card_last4}`} />
            )}
          </Section>

          {/* Status */}
          <Section title="Status">
            <Row label="Order status" value={
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                order.status === "completed" ? "bg-violet-100 text-violet-700" :
                order.status === "refunded"  ? "bg-red-100 text-red-700" :
                                               "bg-gray-100 text-gray-600"
              )}>
                {order.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> :
                 order.status === "refunded"  ? <RotateCcw className="h-3 w-3" /> :
                                               <Clock className="h-3 w-3" />}
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            } />
            <Row label="Date" value={fmtFull(order.created_at)} />
          </Section>

          {/* Payout Timeline */}
          <Section title="Payout timeline">
            {order.amount_cents === 0 ? (
              <p className="text-[13px] text-gray-400 italic">No payout timeline for free orders.</p>
            ) : !showTimeline ? (
              <button
                onClick={() => setShowTimeline(true)}
                className="text-[13px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
              >
                <Eye className="h-3.5 w-3.5" /> View timeline
              </button>
            ) : (
              <OrderTimeline orderId={order.id} amountCents={order.amount_cents} />
            )}
          </Section>

          {/* Actions */}
          {order.status === "completed" && !refundDone && (
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleRefund}
                disabled={refundLoading}
              >
                {refundLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</> : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Issue refund</>}
              </Button>
            </div>
          )}
          {refundDone && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-[13px] text-green-700 font-medium">Refund issued successfully.</p>
            </div>
          )}

          {/* Copy ID */}
          <button
            onClick={copyId}
            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <span className="text-[12px] text-gray-500 font-mono">{order.id}</span>
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={cn("text-gray-900 text-right", valueClass)}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">{children}</div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

type Tab = "overview" | "withdraw" | "history"

interface PayoutsClientProps {
  creator: Creator
  initialData: {
    totalEarnings: number
    totalFees: number
    netEarnings: number
    pendingAmount: number
    availableBalance: number
    paidOut?: number
  }
  initialOrders?: OrderPayment[]
}

export function PayoutsClient({ creator, initialData, initialOrders = [] }: PayoutsClientProps) {
  const [tab, setTab] = useState<Tab>("overview")
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [availableBalance, setAvailableBalance] = useState(initialData.availableBalance)
  const [pendingBalance, setPendingBalance] = useState(initialData.pendingAmount)

  const currency = (creator.default_currency || "usd").toLowerCase()
  const hasStripe = !!creator.stripe_account_id
  const payoutsEnabled = creator.payouts_enabled !== false

  // Refresh balances after a withdraw
  const refreshBalances = useCallback(async () => {
    setRefreshKey((k) => k + 1)
    try {
      const r = await fetch("/api/stripe/payouts")
      const json = await r.json()
      if (json.balance) {
        const avail = json.balance.available?.find((b: any) => b.currency === currency)
        const pend = json.balance.pending?.find((b: any) => b.currency === currency)
        if (avail) setAvailableBalance(avail.amount)
        if (pend) setPendingBalance(pend.amount)
      }
    } catch { /* non-fatal */ }
  }, [currency])

  // Orders for the overview/sales section
  const completedOrders = useMemo(
    () => initialOrders.filter((o) => o.status === "completed"),
    [initialOrders]
  )

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview",  label: "Overview",  icon: TrendingUp },
    { id: "withdraw",  label: "Withdraw",  icon: ArrowDownLeft },
    { id: "history",   label: "History",   icon: Landmark },
  ]

  if (!hasStripe) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
        <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-[17px] font-bold text-gray-700 mb-1">Connect Stripe to unlock payouts</h3>
        <p className="text-[14px] text-gray-400 mb-5">
          You need a connected Stripe account to view balances, revenue charts, and withdraw funds.
        </p>
        <Button asChild className="bg-violet-600 hover:bg-violet-700 text-white">
          <a href="/app/settings?tab=payments">Connect Stripe</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
              tab === id
                ? "bg-white text-violet-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Available to cash out"
              value={fmt(availableBalance, currency)}
              sub="Ready to withdraw now"
              icon={Wallet}
              accent={availableBalance > 0 ? "bg-violet-600" : undefined}
            />
            <KpiCard
              label="Available soon"
              value={fmt(pendingBalance, currency)}
              sub="Processing, not yet available"
              icon={Clock}
            />
            <KpiCard
              label="Total net earnings"
              value={fmt(initialData.netEarnings, currency)}
              sub={`Gross: ${fmt(initialData.totalEarnings, currency)}`}
              icon={DollarSign}
            />
          </div>

          {/* Revenue Chart */}
          <RevenueChart currency={currency} />

          {/* Recent sales */}
          {initialOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="text-[14px] font-semibold text-gray-900">Recent sales</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {initialOrders.slice(0, 20).map((order) => {
                  const net = order.amount_cents - order.fee_cents
                  return (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                          order.status === "completed" ? "bg-violet-100" : "bg-red-100"
                        )}>
                          {order.status === "completed"
                            ? <Package className="h-3.5 w-3.5 text-violet-600" />
                            : <RotateCcw className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">
                            {order.product?.title || "Product"}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {order.buyer_email || order.customer_email || "—"} · {fmtShort(order.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={cn("text-[13px] font-bold", order.status === "completed" ? "text-gray-900" : "text-red-400 line-through")}>
                          {fmt(order.amount_cents, currency)}
                        </p>
                        {order.status === "completed" && (
                          <p className="text-[11px] text-violet-600">+{fmt(net, currency)} net</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {initialOrders.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[15px] font-semibold text-gray-500">No sales yet</p>
              <p className="text-[13px] text-gray-400 mt-1">Your first sale will appear here.</p>
            </div>
          )}
        </div>
      )}

      {/* ── WITHDRAW TAB ── */}
      {tab === "withdraw" && (
        <div className="max-w-lg">
          {!payoutsEnabled ? (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Payouts are not yet enabled on your Stripe account.
                Please complete your Stripe onboarding to enable withdrawals.
              </AlertDescription>
            </Alert>
          ) : (
            <WithdrawTab
              availableBalance={availableBalance}
              currency={currency}
              onSuccess={() => { refreshBalances(); setTab("history") }}
            />
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div>
          <PayoutsList
            stripeAccountId={creator.stripe_account_id!}
            currency={currency}
            refreshKey={refreshKey}
          />
        </div>
      )}

      {/* Order Details Side Panel */}
      {selectedOrder && (
        <OrderDetailsSheet
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          currency={currency}
        />
      )}
    </div>
  )
}
