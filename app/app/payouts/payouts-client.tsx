"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Wallet,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Download,
  MoreHorizontal,
  Eye,
  ExternalLink,
  Settings,
  Info,
  Loader2,
  BanknoteIcon,
  TrendingUp,
  Shield,
  Zap,
  ChevronRight,
  XCircle,
  HelpCircle,
  Landmark,
  Package,
  Mail,
  CreditCard,
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface Creator {
  id: string
  stripe_account_id?: string
  stripe_onboarding_status?: string
  default_currency?: string
  payout_schedule?: string
  payout_threshold?: number
  instant_payouts_enabled?: boolean
}

interface OrderPayment {
  id: string
  amount_cents: number
  fee_cents: number
  created_at: string
  status: string
  customer_email: string
  product_id: string
  stripe_payment_intent_id?: string
  product?: {
    title: string
    thumbnail_url?: string
  } | null
}

interface PayoutsClientProps {
  creator: Creator
  initialData: {
    totalEarnings: number
    totalFees: number
    netEarnings: number
    pendingAmount: number
    availableBalance: number
  }
  initialOrders?: OrderPayment[]
}

interface EarningsTrend {
  date: string
  earnings: number
  fees: number
  net: number
}

const PAYOUT_SCHEDULES = [
  { value: "daily", label: "Daily", description: "Receive payouts every business day" },
  { value: "weekly", label: "Weekly", description: "Receive payouts every Monday" },
  { value: "monthly", label: "Monthly", description: "Receive payouts on the 1st of each month" },
]

export function PayoutsClient({ creator, initialData, initialOrders = [] }: PayoutsClientProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean
    status: string
    accountId?: string
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
    bankAccount?: {
      last4: string
      bankName: string
      currency: string
    }
  } | null>(null)

  // Payout settings
  const [payoutSchedule, setPayoutSchedule] = useState(creator.payout_schedule || "daily")
  const [payoutThreshold, setPayoutThreshold] = useState(creator.payout_threshold || 0)
  const [instantPayoutsEnabled, setInstantPayoutsEnabled] = useState(creator.instant_payouts_enabled || false)

  // Payment detail bottom sheet
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)

  // Mobile bottom sheet state for detail
  const [isMobileSheet, setIsMobileSheet] = useState(false)
  const [isDetailPresented, setIsDetailPresented] = useState(false)
  const [detailDragY, setDetailDragY] = useState(0)
  const [isDetailDragging, setIsDetailDragging] = useState(false)
  const detailDragStartY = useRef(0)
  const detailDragCurrentY = useRef(0)

  const currency = creator.default_currency || "USD"

  const isStripeConnected = creator.stripe_onboarding_status === "connected"
  const isStripePending = creator.stripe_onboarding_status === "pending"

  useEffect(() => {
    const check = () => setIsMobileSheet(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (detailOpen && isMobileSheet) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsDetailPresented(true))
      })
    } else {
      setIsDetailPresented(false)
      setDetailDragY(0)
    }
  }, [detailOpen, isMobileSheet])

  const handleDetailTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDetailDragging(true)
    detailDragStartY.current = e.touches[0].clientY
    detailDragCurrentY.current = e.touches[0].clientY
  }, [])

  const handleDetailTouchMove = useCallback((e: React.TouchEvent) => {
    detailDragCurrentY.current = e.touches[0].clientY
    const delta = Math.max(0, detailDragCurrentY.current - detailDragStartY.current)
    setDetailDragY(delta)
  }, [])

  const handleDetailTouchEnd = useCallback(() => {
    setIsDetailDragging(false)
    const delta = detailDragCurrentY.current - detailDragStartY.current
    const velocity = delta > 0 ? delta / 300 : 0
    if (delta > 80 || velocity > 0.5) {
      setIsDetailPresented(false)
      setTimeout(() => { setDetailOpen(false); setDetailDragY(0) }, 400)
    } else {
      setDetailDragY(0)
    }
  }, [])

  // Build earnings trend from real order data
  const earningsTrend: EarningsTrend[] = (() => {
    if (initialOrders.length === 0) return []
    const trendMap: Record<string, { earnings: number; fees: number }> = {}
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      trendMap[key] = { earnings: 0, fees: 0 }
    }
    initialOrders.forEach((order) => {
      const d = new Date(order.created_at)
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      if (trendMap[key]) {
        trendMap[key].earnings += order.amount_cents || 0
        trendMap[key].fees += order.fee_cents || 0
      }
    })
    return Object.entries(trendMap).map(([date, data]) => ({
      date,
      earnings: data.earnings,
      fees: data.fees,
      net: data.earnings - data.fees,
    }))
  })()

  // Fetch Stripe connection status
  const fetchConnectionStatus = async () => {
    setStatusLoading(true)
    try {
      const response = await fetch("/api/stripe/connect/status")
      if (response.ok) {
        const data = await response.json()
        setConnectionStatus(data)
      }
    } catch (err) {
      console.error("Error fetching connection status:", err)
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    fetchConnectionStatus()
  }, [creator.stripe_account_id])

  const handleConnectStripe = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await fetch("/api/stripe/connect/start", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to start Stripe Connect")
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsConnecting(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/settings/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutSchedule,
          payoutThreshold: payoutThreshold * 100,
          instantPayoutsEnabled,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
      }

      setSuccess("Payout settings saved successfully!")
      setSettingsDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSaving(false)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Earnings Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Total Earnings</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(initialData.totalEarnings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Net Earnings</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(initialData.netEarnings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Pending</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(initialData.pendingAmount)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Available</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(initialData.availableBalance)}</p>
        </div>
      </div>

      {/* Stripe Connection Card */}
      {!isStripeConnected && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  <circle cx="512" cy="512" r="512" fill="#635bff"></circle>
                  <path d="M781.67 515.75c0-38.35-18.58-68.62-54.08-68.62s-57.23 30.26-57.23 68.32c0 45.09 25.47 67.87 62 67.87 17.83 0 31.31-4 41.5-9.74v-30c-10.19 5.09-21.87 8.24-36.7 8.24-14.53 0-27.42-5.09-29.06-22.77h73.26c.01-1.92.31-9.71.31-13.3zm-74-14.23c0-16.93 10.34-24 19.78-24 9.14 0 18.88 7 18.88 24zm-95.14-54.39a42.32 42.32 0 0 0-29.36 11.69l-1.95-9.29h-33v174.68l37.45-7.94.15-42.4c5.39 3.9 13.33 9.44 26.52 9.44 26.82 0 51.24-21.57 51.24-69.06-.12-43.45-24.84-67.12-51.05-67.12zm-9 103.22c-8.84 0-14.08-3.15-17.68-7l-.15-55.58c3.9-4.34 9.29-7.34 17.83-7.34 13.63 0 23.07 15.28 23.07 34.91.01 20.03-9.28 35.01-23.06 35.01zM496.72 438.29l37.6-8.09v-30.41l-37.6 7.94v30.56zm0 11.39h37.6v131.09h-37.6zm-40.3 11.08L454 449.68h-32.34v131.08h37.45v-88.84c8.84-11.54 23.82-9.44 28.46-7.79v-34.45c-4.78-1.8-22.31-5.1-31.15 11.08zm-74.91-43.59L345 425l-.15 120c0 22.17 16.63 38.5 38.8 38.5 12.28 0 21.27-2.25 26.22-4.94v-30.45c-4.79 1.95-28.46 8.84-28.46-13.33v-53.19h28.46v-31.91h-28.51zm-101.27 70.56c0-5.84 4.79-8.09 12.73-8.09a83.56 83.56 0 0 1 37.15 9.59V454a98.8 98.8 0 0 0-37.12-6.87c-30.41 0-50.64 15.88-50.64 42.4 0 41.35 56.93 34.76 56.93 52.58 0 6.89-6 9.14-14.38 9.14-12.43 0-28.32-5.09-40.9-12v35.66a103.85 103.85 0 0 0 40.9 8.54c31.16 0 52.58-15.43 52.58-42.25-.17-44.63-57.25-36.69-57.25-53.47z" fill="#fff"></path>
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1a1a2e]">
                    {statusLoading ? "Checking payout connection..." : isStripePending ? "Complete your Stripe setup" : "Get paid — Connect your payouts to receive payments."}
                  </h3>
                  <p className="text-[14px] text-[#6b7280] mt-1">
                    {statusLoading
                      ? "Loading Stripe status..."
                      : isStripePending
                        ? "Your Stripe account needs additional verification to enable payouts."
                        : "Connect your bank account through Stripe to start receiving payments from your sales."}
                  </p>
                </div>
                {isStripePending && (
                  <div className="flex items-center gap-2 text-[13px] text-gray-400">
                    <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    <span>Verification required</span>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    onClick={handleConnectStripe}
                    disabled={isConnecting}
                    className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium cursor-pointer"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : isStripePending ? (
                      <>
                        Complete Setup
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Connect Stripe
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <a
                    href="https://stripe.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors"
                  >
                    Learn more
                  </a>
                </div>
              </div>
            </div>
          </div>
          {!isStripePending && (
            <div className="px-6 py-4 bg-[#f9fafb] border-t border-[#e5e7eb]/60">
              <div className="flex items-center gap-4 text-[12px] text-[#6b7280]">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Secure payments</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Instant setup</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Bank deposits</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payout Account & Settings */}
      {isStripeConnected && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Payout Account */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="p-5 border-b border-[#e5e7eb]/60">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                    <Landmark className="h-5 w-5" />
                    {t("payouts.payoutAccount")}
                  </h3>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">Where your earnings are deposited</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-0">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t("common.connected")}
                </Badge>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4 p-4 bg-[#f9fafb] rounded-xl">
                <div className="p-2 bg-white rounded-lg border border-[#e5e7eb]/60">
                  <Building2 className="h-6 w-6 text-[#6b7280]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14px] text-[#1a1a2e]">
                    {connectionStatus?.bankAccount?.bankName || "Bank Account"}
                  </p>
                  <p className="text-[13px] text-[#6b7280]">
                    ****{connectionStatus?.bankAccount?.last4 || "4242"} ({currency})
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleConnectStripe} className="rounded-lg shrink-0">
                  {t("common.update")}
                </Button>
              </div>
            </div>
            <div className="p-5 border-t border-[#e5e7eb]/60">
              <Button variant="outline" className="w-full rounded-xl" asChild>
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Stripe Dashboard
                </a>
              </Button>
            </div>
          </div>

          {/* Payout Settings */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="p-5 border-b border-[#e5e7eb]/60">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Payout Settings
                  </h3>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">Configure how and when you get paid</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSettingsDialogOpen(true)} className="rounded-lg">
                  Edit
                </Button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-xl">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-[#6b7280]" />
                  <div>
                    <p className="font-medium text-[13px] text-[#1a1a2e]">Payout Schedule</p>
                    <p className="text-[12px] text-[#9ca3af]">
                      {PAYOUT_SCHEDULES.find((s) => s.value === payoutSchedule)?.description}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="capitalize text-[11px]">{payoutSchedule}</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-xl">
                <div className="flex items-center gap-3">
                  <BanknoteIcon className="h-5 w-5 text-[#6b7280]" />
                  <div>
                    <p className="font-medium text-[13px] text-[#1a1a2e]">Minimum Payout</p>
                    <p className="text-[12px] text-[#9ca3af]">
                      Payouts trigger when balance exceeds this amount
                    </p>
                  </div>
                </div>
                <span className="font-medium text-[13px] text-[#1a1a2e] shrink-0">{payoutThreshold > 0 ? formatPrice(payoutThreshold * 100) : "No minimum"}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-xl">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-[#6b7280]" />
                  <div>
                    <p className="font-medium text-[13px] text-[#1a1a2e]">Instant Payouts</p>
                    <p className="text-[12px] text-[#9ca3af]">
                      Get funds in minutes (1.5% fee)
                    </p>
                  </div>
                </div>
                <Badge variant={instantPayoutsEnabled ? "default" : "secondary"} className="text-[11px]">
                  {instantPayoutsEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Earnings Chart */}
      {earningsTrend.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-5 border-b border-[#e5e7eb]/60">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{t("payouts.earningsOverTime")}</h3>
              <p className="text-[13px] text-[#6b7280] mt-0.5">Revenue from the last 30 days</p>
            </div>
          </div>
          <div className="p-5">
            <div className="h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={earningsTrend}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(value) => formatPrice(value)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatPrice(value),
                      name === "net" ? "Net Earnings" : name === "earnings" ? "Gross" : "Fees",
                    ]}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="net"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorNet)"
                    name="net"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Payments Table — Real Order Data */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-5 border-b border-[#e5e7eb]/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Payments</h3>
              <p className="text-[13px] text-[#6b7280] mt-0.5">{initialOrders.length} completed payment{initialOrders.length !== 1 ? "s" : ""}</p>
            </div>
            {initialOrders.length > 0 && (
              <span className="text-[13px] font-medium text-[#8b5cf6]">{formatPrice(initialData.totalEarnings)} total</span>
            )}
          </div>
        </div>

        {initialOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="p-4 bg-[#f3f4f6] rounded-full mb-4">
              <Wallet className="h-8 w-8 text-[#9ca3af]" />
            </div>
            <h3 className="font-medium text-[15px] text-[#1a1a2e] mb-1">No payments yet</h3>
            <p className="text-[13px] text-[#6b7280] max-w-sm">
              Once you start making sales, all payments will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="divide-y divide-[#e5e7eb]/60 sm:hidden">
              {initialOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 cursor-pointer hover:bg-[#f9fafb] transition-colors active:bg-[#f3f4f6]"
                  onClick={() => {
                    setSelectedOrder(order)
                    setDetailOpen(true)
                  }}
                >
                  <div className="flex items-center gap-3">
                    {order.product?.thumbnail_url ? (
                      <img src={order.product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-[#9ca3af]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1a1a2e] truncate">
                        {order.product?.title || "Product"}
                      </p>
                      <p className="text-[12px] text-[#9ca3af] truncate">{order.customer_email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(order.amount_cents)}</p>
                      <p className="text-[11px] text-[#9ca3af]">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#e5e7eb]">
                    <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Product</TableHead>
                    <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Customer</TableHead>
                    <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-right text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="text-right text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Fee</TableHead>
                    <TableHead className="text-right text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Net</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-[#f9fafb] border-b border-[#e5e7eb]/60 last:border-0">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {order.product?.thumbnail_url ? (
                            <img src={order.product.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                              <Package className="h-3.5 w-3.5 text-[#9ca3af]" />
                            </div>
                          )}
                          <span className="text-[14px] font-medium text-[#1a1a2e] truncate max-w-[200px]">
                            {order.product?.title || "Product"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] text-[#6b7280] truncate max-w-[180px]">{order.customer_email}</TableCell>
                      <TableCell className="text-[13px] text-[#6b7280]">{formatDate(order.created_at)}</TableCell>
                      <TableCell className="text-right text-[14px] font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents)}</TableCell>
                      <TableCell className="text-right text-[13px] text-[#ef4444]">-{formatPrice(order.fee_cents || 0)}</TableCell>
                      <TableCell className="text-right text-[14px] font-semibold text-[#1a1a2e]">{formatPrice((order.amount_cents || 0) - (order.fee_cents || 0))}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => {
                            setSelectedOrder(order)
                            setDetailOpen(true)
                          }}
                          className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors"
                        >
                          <Eye className="h-4 w-4 text-[#9ca3af]" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Footer */}
            {initialOrders.length > 0 && (
              <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#6b7280]">
                Showing {initialOrders.length} payment{initialOrders.length !== 1 ? "s" : ""}
              </div>
            )}
          </>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-[#f9fafb] rounded-2xl border border-[#e5e7eb]/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-white rounded-lg border border-[#e5e7eb]/60">
              <HelpCircle className="h-5 w-5 text-[#6b7280]" />
            </div>
            <div>
              <h3 className="font-medium text-[14px] text-[#1a1a2e]">Need help with payouts?</h3>
              <p className="text-[13px] text-[#6b7280]">
                Learn about payout schedules, fees, and how to optimize your earnings.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-lg">
              View FAQ
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg">
              Contact Support
            </Button>
          </div>
        </div>
      </div>

      {/* Payout Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payouts.payoutSettings")}</DialogTitle>
            <DialogDescription>
              Configure how and when you receive your earnings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Payout Schedule</Label>
              <Select value={payoutSchedule} onValueChange={setPayoutSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_SCHEDULES.map((schedule) => (
                    <SelectItem key={schedule.value} value={schedule.value}>
                      <div>
                        <span className="font-medium">{schedule.label}</span>
                        <span className="text-muted-foreground ml-2">- {schedule.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Minimum Payout Amount ({currency})</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                step="1"
                value={payoutThreshold}
                onChange={(e) => setPayoutThreshold(Number(e.target.value))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Payouts will only be sent when your balance exceeds this amount.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="instant">Instant Payouts</Label>
                <p className="text-xs text-muted-foreground">
                  Get funds in minutes (1.5% fee applies)
                </p>
              </div>
              <Switch
                id="instant"
                checked={instantPayoutsEnabled}
                onCheckedChange={setInstantPayoutsEnabled}
              />
            </div>

            {instantPayoutsEnabled && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Instant payouts incur a 1.5% fee. Standard payouts are free.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Detail — Mobile Bottom Sheet / Desktop Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          showCloseButton={!isMobileSheet}
          disableDefaultAnimations={isMobileSheet}
          disableOverlayDefaultAnimations={isMobileSheet}
          overlayClassName={isMobileSheet ? cn(
            "bg-black/40 transition-all duration-400",
            isDetailPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0"
          ) : undefined}
          onTouchStart={isMobileSheet ? handleDetailTouchStart : undefined}
          onTouchMove={isMobileSheet ? handleDetailTouchMove : undefined}
          onTouchEnd={isMobileSheet ? handleDetailTouchEnd : undefined}
          className={cn(
            "p-0 gap-0 overflow-hidden",
            isMobileSheet
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
              : "w-[calc(100%-32px)] max-w-md rounded-2xl"
          )}
          style={isMobileSheet ? {
            position: "fixed",
            top: "auto", left: 0, right: 0, bottom: 0,
            transform: isDetailPresented ? `translate3d(0, ${detailDragY}px, 0)` : "translate3d(0, 100%, 0)",
            transition: isDetailDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
          } : undefined}
        >
          {/* Mobile drag handle */}
          {isMobileSheet && (
            <div className="pt-3 pb-1 flex justify-center">
              <div className="h-1.5 w-10 rounded-full bg-gray-300" />
            </div>
          )}

          {selectedOrder && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <p className="text-[28px] font-bold text-[#1a1a2e]">{formatPrice(selectedOrder.amount_cents)}</p>
                <Badge className="mt-2 bg-emerald-50 text-emerald-700 border-0">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Completed
                </Badge>
              </div>

              {/* Product */}
              <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                {selectedOrder.product?.thumbnail_url ? (
                  <img src={selectedOrder.product.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                    <Package className="h-5 w-5 text-[#9ca3af]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e] truncate">{selectedOrder.product?.title || "Product"}</p>
                  <p className="text-[12px] text-[#9ca3af]">Product sale</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#6b7280] flex items-center gap-2"><Mail className="h-4 w-4" /> Customer</span>
                  <span className="text-[#1a1a2e] font-medium truncate max-w-[180px]">{selectedOrder.customer_email}</span>
                </div>

                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#6b7280] flex items-center gap-2"><Calendar className="h-4 w-4" /> Date</span>
                  <span className="text-[#1a1a2e]">{formatFullDate(selectedOrder.created_at)}</span>
                </div>

                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#6b7280] flex items-center gap-2"><DollarSign className="h-4 w-4" /> Amount</span>
                  <span className="text-[#1a1a2e] font-medium">{formatPrice(selectedOrder.amount_cents)}</span>
                </div>

                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#6b7280]">Platform fee</span>
                  <span className="text-[#ef4444]">-{formatPrice(selectedOrder.fee_cents || 0)}</span>
                </div>

                <div className="flex items-center justify-between text-[14px] pt-2 border-t border-[#e5e7eb]">
                  <span className="text-[#1a1a2e] font-semibold">Net earnings</span>
                  <span className="text-[#1a1a2e] font-bold">{formatPrice((selectedOrder.amount_cents || 0) - (selectedOrder.fee_cents || 0))}</span>
                </div>
              </div>

              {selectedOrder.stripe_payment_intent_id && (
                <div className="flex items-center justify-between text-[13px] p-3 bg-[#f9fafb] rounded-xl">
                  <span className="text-[#6b7280] flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment ID</span>
                  <span className="text-[#1a1a2e] font-mono text-[12px] truncate max-w-[160px]">{selectedOrder.stripe_payment_intent_id}</span>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => setDetailOpen(false)}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
