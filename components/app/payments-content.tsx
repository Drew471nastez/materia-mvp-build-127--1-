"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertTriangle, CreditCard, Unplug, RefreshCw, Info } from "lucide-react"

interface PaymentsContentProps {
  creator: {
    id: string
    name?: string
    default_currency?: string
    statement_descriptor?: string
    stripe_account_id?: string
    stripe_onboarding_status?: string
    allow_paypal?: boolean
    paypal_merchant_id?: string
  }
}

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
]

export function PaymentsContent({ creator }: PaymentsContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean
    status: string
    accountId?: string
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
  } | null>(null)

  const [defaultCurrency, setDefaultCurrency] = useState(creator.default_currency || "USD")
  const [statementDescriptor, setStatementDescriptor] = useState(
    creator.statement_descriptor || creator.name?.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").slice(0, 10) || ""
  )
  const [paypalEmail, setPaypalEmail] = useState(creator.paypal_merchant_id || "")

  const isTestMode = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.includes("_test_")

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setSuccess("Successfully connected to Stripe! Verifying your account...")
      fetchConnectionStatus()
    }
  }, [searchParams])

  useEffect(() => {
    if (creator.stripe_account_id) {
      fetchConnectionStatus()
    }
  }, [creator.stripe_account_id])

  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch("/api/stripe/connect/status")
      if (!response.ok) throw new Error("Failed to fetch status")
      const data = await response.json()
      setConnectionStatus(data)
      console.log("[v0] Connection status fetched:", data)
    } catch (err) {
      console.error("[v0] Fetch Status Error:", err)
    }
  }

  const handleConnectStripe = async () => {
    setIsLoading(true)
    setError(null)

    try {
      router.push("/app/payouts")
      return
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    setError(null)

    try {
      const response = await fetch("/api/stripe/connect/disconnect", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to disconnect")
      }

      setConnectionStatus(null)
      setSuccess("Successfully disconnected from Stripe")
      router.refresh()
    } catch (err) {
      setError("Failed to refresh status")
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCurrency,
          statementDescriptor: statementDescriptor.trim(),
          paypalEmail: paypalEmail.trim() || null,
          allowPaypal: !!paypalEmail.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
      }

      setSuccess("Payment settings saved successfully!")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshStatus = async () => {
    setIsRefreshing(true)
    setError(null)
    setSuccess(null)

    try {
      await fetchConnectionStatus()
      setSuccess("Status refreshed successfully!")
    } catch (err) {
      setError("Failed to refresh status")
    } finally {
      setIsRefreshing(false)
    }
  }

  const isConnected = connectionStatus?.connected || false
  const hasRestrictions = connectionStatus?.chargesEnabled === false || connectionStatus?.payoutsEnabled === false
  const showWarning = !isConnected || hasRestrictions

  return (
    <div className="min-h-screen bg-white p-4 sm:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Payments & Store Settings</h1>
        <p className="text-muted-foreground">Connect your payout method to start selling</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {isTestMode && (
          <Alert>
            <AlertDescription className="flex items-center gap-2">
              <Badge variant="secondary">Test Mode</Badge>
              <span className="text-sm">You're using Stripe test keys</span>
            </AlertDescription>
          </Alert>
        )}

        {showWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>
                {!connectionStatus?.connected
                  ? "Connect payouts to sell paid products."
                  : "Your Stripe account has restrictions."}
              </strong>{" "}
              {!connectionStatus?.connected
                ? "You won't be able to accept payments until your Stripe account is connected and verified."
                : "Complete your Stripe verification to enable all payment features."}
            </AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe Connect
            </CardTitle>
            <CardDescription>Receive payments directly to your bank account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <div className="mt-1 flex items-center gap-2">
                  {connectionStatus?.status === "connected" ? (
                    <>
                      <Badge variant="default" className="bg-green-600">
                        Fully Enabled
                      </Badge>
                      {connectionStatus?.accountId && (
                        <span className="text-xs text-muted-foreground">{connectionStatus.accountId}</span>
                      )}
                    </>
                  ) : connectionStatus?.status === "pending" ? (
                    <Badge variant="destructive">Restricted</Badge>
                  ) : connectionStatus?.status === "pending" ? (
                    <Badge variant="secondary">Pending Verification</Badge>
                  ) : (
                    <Badge variant="outline">Not Connected</Badge>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {connectionStatus?.connected !== undefined && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing}
                    className="gap-2 bg-transparent"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                )}

                {connectionStatus?.status !== "enabled" ? (
                  <Button onClick={handleConnectStripe} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : connectionStatus?.status === "pending" || connectionStatus?.status === "pending" ? (
                      "Complete Setup"
                    ) : (
                      "Connect Stripe"
                    )}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={isDisconnecting}>
                        {isDisconnecting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          <>
                            <Unplug className="mr-2 h-4 w-4" />
                            Disconnect
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Stripe?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will disable new paid checkouts until you reconnect. Historical orders will remain
                          intact.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {connectionStatus?.chargesEnabled !== undefined && (
              <div className="space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Charges enabled:</span>
                  <Badge variant={connectionStatus.chargesEnabled ? "default" : "destructive"}>
                    {connectionStatus.chargesEnabled ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Payouts enabled:</span>
                  <Badge variant={connectionStatus.payoutsEnabled ? "default" : "destructive"}>
                    {connectionStatus.payoutsEnabled ? "Yes" : "No"}
                  </Badge>
                </div>
                {(!connectionStatus.chargesEnabled || !connectionStatus.payoutsEnabled) && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Complete your Stripe verification to enable all features. Click "Complete Setup" above.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .76-.653h8.14c2.97 0 4.93 1.017 5.848 3.03.774 1.697.587 3.694-.544 5.78-1.296 2.388-3.413 3.61-6.116 3.61h-.777a.77.77 0 0 0-.76.653l-.647 4.11a.641.641 0 0 1-.633.647H7.076z" />
              </svg>
              PayPal (Optional)
            </CardTitle>
            <CardDescription>Alternative payment method for your customers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50 text-blue-800">
              <AlertDescription className="text-sm">
                PayPal is optional. Most creators use Stripe for payouts.
              </AlertDescription>
            </Alert>

            <div className="grid gap-2">
              <Label htmlFor="paypal-email">PayPal Email</Label>
              <Input
                id="paypal-email"
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                placeholder="your@email.com"
              />
              <p className="text-xs text-muted-foreground">
                Your PayPal account email (optional - save settings to update)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Settings</CardTitle>
            <CardDescription>Configure your default payment preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="descriptor">Statement Descriptor</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        This text appears on your customers' bank statements. It helps them identify the charge.
                        Format: &quot;(Your Name) - STORELIB&quot;. Only your name can be changed. Max 22 characters total.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center">
                <Input
                  id="descriptor"
                  value={statementDescriptor}
                  onChange={(e) => setStatementDescriptor(e.target.value.slice(0, 10).toUpperCase())}
                  placeholder={creator.name?.slice(0, 10).toUpperCase() || "YOUR NAME"}
                  maxLength={10}
                  className="rounded-r-none border-r-0"
                />
                <div className="flex h-10 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm font-medium text-muted-foreground whitespace-nowrap select-none">
                  - STORELIB
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Bank statement will show: <span className="font-mono">{statementDescriptor || creator.name?.slice(0, 10).toUpperCase() || "YOURNAME"} - STORELIB</span>
              </p>
            </div>

            <Button onClick={handleSaveSettings} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
