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
import { useLocale } from "@/components/locale-provider"

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
  const { t } = useLocale()
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
      setSuccess(t("settings.pmtConnectedVerifying"))
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
      const response = await fetch("/api/stripe/connect/start", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || t("settings.pmtFailedStart"))
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.pmtSomethingWrong"))
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
        throw new Error(data.error || t("settings.pmtFailedDisconnect"))
      }

      setConnectionStatus(null)
      setSuccess(t("settings.pmtDisconnected"))
      router.refresh()
    } catch (err) {
      setError(t("settings.pmtFailedRefresh"))
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
        throw new Error(data.error || t("settings.pmtFailedSave"))
      }

      setSuccess(t("settings.pmtSaved"))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.pmtSomethingWrong"))
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
      setSuccess(t("settings.pmtStatusRefreshed"))
    } catch (err) {
      setError(t("settings.pmtFailedRefresh"))
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
        <h1 className="text-2xl font-semibold text-foreground">{t("settings.pmtTitle")}</h1>
        <p className="text-muted-foreground">{t("settings.pmtSubtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {isTestMode && (
          <Alert>
            <AlertDescription className="flex items-center gap-2">
              <Badge variant="secondary">{t("settings.testMode")}</Badge>
              <span className="text-sm">{t("settings.pmtTestKeys")}</span>
            </AlertDescription>
          </Alert>
        )}

        {showWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>
                {!connectionStatus?.connected
                  ? t("settings.pmtConnectToSell")
                  : t("settings.pmtHasRestrictions")}
              </strong>{" "}
              {!connectionStatus?.connected
                ? t("settings.pmtCannotAccept")
                : t("settings.pmtCompleteVerification")}
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
              {t("settings.stripeConnect")}
            </CardTitle>
            <CardDescription>{t("settings.pmtReceiveDirect")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("settings.status")}</p>
                <div className="mt-1 flex items-center gap-2">
                  {connectionStatus?.status === "connected" ? (
                    <>
                      <Badge variant="default" className="bg-green-600">
                        {t("settings.pmtFullyEnabled")}
                      </Badge>
                      {connectionStatus?.accountId && (
                        <span className="text-xs text-muted-foreground">{connectionStatus.accountId}</span>
                      )}
                    </>
                  ) : connectionStatus?.status === "pending" ? (
                    <Badge variant="destructive">{t("settings.pmtRestricted")}</Badge>
                  ) : connectionStatus?.status === "pending" ? (
                    <Badge variant="secondary">{t("settings.pmtPendingVerification")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("settings.notConnected")}</Badge>
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
                    {t("settings.pmtRefresh")}
                  </Button>
                )}

                {connectionStatus?.status !== "enabled" ? (
                  <Button onClick={handleConnectStripe} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("settings.connecting")}
                      </>
                    ) : connectionStatus?.status === "pending" || connectionStatus?.status === "pending" ? (
                      t("settings.completeSetup")
                    ) : (
                      t("settings.pmtConnectStripe")
                    )}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={isDisconnecting}>
                        {isDisconnecting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("settings.disconnecting")}
                          </>
                        ) : (
                          <>
                            <Unplug className="mr-2 h-4 w-4" />
                            {t("settings.disconnect")}
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("settings.pmtDisconnectTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("settings.pmtDisconnectDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect}>{t("settings.disconnect")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {connectionStatus?.chargesEnabled !== undefined && (
              <div className="space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("settings.pmtChargesEnabled")}</span>
                  <Badge variant={connectionStatus.chargesEnabled ? "default" : "destructive"}>
                    {connectionStatus.chargesEnabled ? t("settings.pmtYes") : t("settings.pmtNo")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("settings.pmtPayoutsEnabled")}</span>
                  <Badge variant={connectionStatus.payoutsEnabled ? "default" : "destructive"}>
                    {connectionStatus.payoutsEnabled ? t("settings.pmtYes") : t("settings.pmtNo")}
                  </Badge>
                </div>
                {(!connectionStatus.chargesEnabled || !connectionStatus.payoutsEnabled) && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    {t("settings.pmtCompleteAllFeatures")}
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
              {t("settings.pmtPaypalOptional")}
            </CardTitle>
            <CardDescription>{t("settings.pmtPaypalAlt")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50 text-blue-800">
              <AlertDescription className="text-sm">
                {t("settings.pmtPaypalNote")}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2">
              <Label htmlFor="paypal-email">{t("settings.pmtPaypalEmail")}</Label>
              <Input
                id="paypal-email"
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                placeholder="your@email.com"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.pmtPaypalEmailHelp")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.paymentSettings")}</CardTitle>
            <CardDescription>{t("settings.pmtConfigurePrefs")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="currency">{t("settings.defaultCurrency")}</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {t(`settings.currencyName_${currency.code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="descriptor">{t("settings.statementDescriptor")}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        {t("settings.pmtDescriptorTooltip")}
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
                {t("settings.pmtBankShow")} <span className="font-mono">{statementDescriptor || creator.name?.slice(0, 10).toUpperCase() || "YOURNAME"} - STORELIB</span>
              </p>
            </div>

            <Button onClick={handleSaveSettings} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("settings.saving")}
                </>
              ) : (
                t("settings.pmtSaveSettings")
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
