"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Wallet,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  CreditCard,
  Calendar,
  RefreshCw,
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
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { createClient } from "@/lib/supabase/client"

interface Creator {
  id: string
  stripe_account_id?: string
  stripe_onboarding_status?: string
  default_currency?: string
  payout_schedule?: string
  payout_threshold?: number
  instant_payouts_enabled?: boolean
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
}

interface Payout {
  id: string
  amount: number
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled"
  arrival_date: string
  created_at: string
  method: string
  destination_last4?: string
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

export function PayoutsClient({ creator, initialData }: PayoutsClientProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
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

  // Payout history
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [earningsTrend, setEarningsTrend] = useState<EarningsTrend[]>([])
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null)
  const [payoutDetailOpen, setPayoutDetailOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [timeframe, setTimeframe] = useState("last_30_days")

  const currency = creator.default_currency || "USD"
  const supabase = createClient()

  const isStripeConnected = creator.stripe_onboarding_status === "enabled"
  const isStripePending = creator.stripe_onboarding_status === "pending" || creator.stripe_onboarding_status === "restricted"

  // Fetch Stripe connection status
  const fetchConnectionStatus = async () => {
    if (!creator.stripe_account_id) return

    try {
      const response = await fetch("/api/stripe/connect/status")
      if (response.ok) {
        const data = await response.json()
        setConnectionStatus(data)
      }
    } catch (err) {
      console.error("Error fetching connection status:", err)
    }
  }

  // Fetch payout history (mock data for demo)
  const fetchPayoutHistory = async () => {
    setIsLoading(true)
    try {
      // In a real implementation, this would fetch from Stripe
      // For now, we'll generate mock data based on the timeframe
      const mockPayouts: Payout[] = [
        {
          id: "po_1",
          amount: 150000,
          status: "paid",
          arrival_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          method: "bank_account",
          destination_last4: "4242",
        },
        {
          id: "po_2",
          amount: 89500,
          status: "in_transit",
          arrival_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          method: "bank_account",
          destination_last4: "4242",
        },
        {
          id: "po_3",
          amount: 45000,
          status: "pending",
          arrival_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          method: "bank_account",
          destination_last4: "4242",
        },
      ]

      // Only show payouts if Stripe is connected
      if (isStripeConnected) {
        setPayouts(mockPayouts)
      } else {
        setPayouts([])
      }

      // Generate earnings trend
      const trend: EarningsTrend[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const earnings = Math.floor(Math.random() * 50000) + 10000
        const fees = Math.floor(earnings * 0.1)
        trend.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          earnings,
          fees,
          net: earnings - fees,
        })
      }
      setEarningsTrend(trend)
    } catch (err) {
      console.error("Error fetching payout history:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConnectionStatus()
    fetchPayoutHistory()
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
          payoutThreshold: payoutThreshold * 100, // Convert to cents
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

  const getPayoutStatusBadge = (status: Payout["status"]) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Paid
          </Badge>
        )
      case "in_transit":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            <ArrowUpRight className="mr-1 h-3 w-3" />
            In Transit
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      case "canceled":
        return (
          <Badge variant="outline">
            <XCircle className="mr-1 h-3 w-3" />
            Canceled
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
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

      {/* Stripe Connection Card */}
      {!isStripeConnected && (
        <div className={`rounded-2xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${isStripePending ? "border-yellow-200 bg-yellow-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${isStripePending ? "bg-yellow-100" : "bg-amber-100"}`}>
                  {isStripePending ? (
                    <Clock className="h-6 w-6 text-yellow-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold ${isStripePending ? "text-yellow-800" : "text-amber-800"}`}>
                    {isStripePending ? "Complete your Stripe setup" : "Connect Stripe to receive payouts"}
                  </h3>
                  <p className={`text-sm mt-1 ${isStripePending ? "text-yellow-700" : "text-amber-700"}`}>
                    {isStripePending
                      ? "Your Stripe account needs additional verification to enable payouts."
                      : "Connect your bank account through Stripe to start receiving payments from your sales."}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleConnectStripe}
                disabled={isConnecting}
                className={isStripePending ? "bg-yellow-600 hover:bg-yellow-700" : ""}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : isStripePending ? (
                  "Complete Setup"
                ) : (
                  "Connect Stripe"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Overview Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Available Balance */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Available Balance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-emerald-600 tracking-tight">
            {formatPrice(initialData.availableBalance)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Ready for payout</p>
        </div>

        {/* Pending */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Pending</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-amber-600 tracking-tight">
            {formatPrice(initialData.pendingAmount)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Processing (7 day hold)</p>
        </div>

        {/* Total Earnings */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Total Earnings</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
            {formatPrice(initialData.totalEarnings)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Gross revenue all time</p>
        </div>

        {/* Net Earnings */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Net Earnings</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
            {formatPrice(initialData.netEarnings)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">After {formatPrice(initialData.totalFees)} in fees</p>
        </div>
      </div>

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
                    Payout Account
                  </h3>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">Where your earnings are deposited</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-0">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4 p-4 bg-[#f9fafb] rounded-xl">
                <div className="p-2 bg-white rounded-lg border border-[#e5e7eb]/60">
                  <Building2 className="h-6 w-6 text-[#6b7280]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[14px] text-[#1a1a2e]">
                    {connectionStatus?.bankAccount?.bankName || "Bank Account"}
                  </p>
                  <p className="text-[13px] text-[#6b7280]">
                    ****{connectionStatus?.bankAccount?.last4 || "4242"} ({currency})
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleConnectStripe} className="rounded-lg">
                  Update
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[#6b7280]">Charges enabled</span>
                  <Badge variant={connectionStatus?.chargesEnabled ? "default" : "destructive"} className="text-[11px]">
                    {connectionStatus?.chargesEnabled ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[#6b7280]">Payouts enabled</span>
                  <Badge variant={connectionStatus?.payoutsEnabled ? "default" : "destructive"} className="text-[11px]">
                    {connectionStatus?.payoutsEnabled ? "Yes" : "No"}
                  </Badge>
                </div>
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
                <span className="font-medium text-[13px] text-[#1a1a2e]">{payoutThreshold > 0 ? formatPrice(payoutThreshold * 100) : "No minimum"}</span>
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
      {isStripeConnected && earningsTrend.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-5 border-b border-[#e5e7eb]/60">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Earnings Over Time</h3>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Your revenue trend for the selected period</p>
              </div>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-[180px] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 days</SelectItem>
                  <SelectItem value="last_90_days">Last 90 days</SelectItem>
                  <SelectItem value="this_year">This year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-5">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={earningsTrend}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => formatPrice(value)} tick={{ fontSize: 12 }} />
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
                    stroke="hsl(var(--chart-1))"
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

      {/* Payout History */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-5 border-b border-[#e5e7eb]/60">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Payout History</h3>
              <p className="text-[13px] text-[#6b7280] mt-0.5">All your past and scheduled payouts</p>
            </div>
            {payouts.length > 0 && (
              <Button variant="outline" size="sm" className="rounded-lg">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
          </div>
        </div>
        <div className="p-0 sm:p-5 sm:pt-0">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !isStripeConnected ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="p-4 bg-[#f3f4f6] rounded-full mb-4">
                <Wallet className="h-8 w-8 text-[#9ca3af]" />
              </div>
              <h3 className="font-medium text-[15px] text-[#1a1a2e] mb-1">No payout history</h3>
              <p className="text-[13px] text-[#6b7280] max-w-sm">
                Connect your Stripe account to start receiving payouts from your sales.
              </p>
              <Button onClick={handleConnectStripe} disabled={isConnecting} className="mt-4 rounded-xl bg-[#1a1a2e] hover:bg-[#2d2d44]">
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect Stripe"
                )}
              </Button>
            </div>
          ) : payouts.length > 0 ? (
            <>
              {/* Mobile view */}
              <div className="divide-y divide-[#e5e7eb]/60 sm:hidden">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="p-4 space-y-2 cursor-pointer hover:bg-[#f9fafb] transition-colors"
                    onClick={() => {
                      setSelectedPayout(payout)
                      setPayoutDetailOpen(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[18px] text-[#1a1a2e]">{formatPrice(payout.amount)}</p>
                        <p className="text-[12px] text-[#9ca3af]">
                          {payout.status === "paid" ? "Arrived" : "Expected"} {formatDate(payout.arrival_date)}
                        </p>
                      </div>
                      {getPayoutStatusBadge(payout.status)}
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-[#6b7280]">
                      <Building2 className="h-3 w-3" />
                      <span>Bank ****{payout.destination_last4}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop view */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[#e5e7eb]">
                      <TableHead className="text-[13px] font-medium text-[#6b7280]">Amount</TableHead>
                      <TableHead className="text-[13px] font-medium text-[#6b7280]">Status</TableHead>
                      <TableHead className="text-[13px] font-medium text-[#6b7280]">Destination</TableHead>
                      <TableHead className="text-[13px] font-medium text-[#6b7280]">Initiated</TableHead>
                      <TableHead className="text-[13px] font-medium text-[#6b7280]">Arrival</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id} className="hover:bg-[#f9fafb] border-b border-[#e5e7eb]/60 last:border-0">
                        <TableCell className="font-semibold text-[14px] text-[#1a1a2e]">{formatPrice(payout.amount)}</TableCell>
                        <TableCell>{getPayoutStatusBadge(payout.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-[14px] text-[#1a1a2e]">
                            <Building2 className="h-4 w-4 text-[#9ca3af]" />
                            <span>****{payout.destination_last4}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[14px] text-[#6b7280]">{formatDate(payout.created_at)}</TableCell>
                        <TableCell className="text-[14px] text-[#6b7280]">{formatDate(payout.arrival_date)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-[#f3f4f6]">
                                <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPayout(payout)
                                  setPayoutDetailOpen(true)
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View in Stripe
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="p-4 bg-[#f3f4f6] rounded-full mb-4">
                <Wallet className="h-8 w-8 text-[#9ca3af]" />
              </div>
              <h3 className="font-medium text-[15px] text-[#1a1a2e] mb-1">No payouts yet</h3>
              <p className="text-[13px] text-[#6b7280] max-w-sm">
                Once you start making sales, your payouts will appear here.
              </p>
            </div>
          )}
        </div>
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
            <DialogTitle>Payout Settings</DialogTitle>
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
              <p className="text-xs text-muted-foreground">
                Choose how often you want to receive payouts
              </p>
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
                Payouts will only be sent when your balance exceeds this amount. Set to 0 for no minimum.
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

      {/* Payout Detail Dialog */}
      <Dialog open={payoutDetailOpen} onOpenChange={setPayoutDetailOpen}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md">
          <DialogHeader>
            <DialogTitle>Payout Details</DialogTitle>
            <DialogDescription>
              Payout #{selectedPayout?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedPayout && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <p className="text-3xl font-bold">{formatPrice(selectedPayout.amount)}</p>
                <div className="mt-2">{getPayoutStatusBadge(selectedPayout.status)}</div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Destination</span>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>Bank ****{selectedPayout.destination_last4}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Initiated</span>
                  <span>{formatDate(selectedPayout.created_at)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {selectedPayout.status === "paid" ? "Arrived" : "Expected Arrival"}
                  </span>
                  <span>{formatDate(selectedPayout.arrival_date)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <Badge variant="outline" className="capitalize">{selectedPayout.method.replace("_", " ")}</Badge>
                </div>
              </div>

              {selectedPayout.status === "in_transit" && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    This payout is on its way and should arrive by {formatDate(selectedPayout.arrival_date)}.
                  </AlertDescription>
                </Alert>
              )}

              <Button variant="outline" className="w-full" asChild>
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View in Stripe Dashboard
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
