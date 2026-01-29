"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DownloadButton } from "@/components/download-button"
import {
  CheckCircle,
  Package,
  Calendar,
  Shield,
  AlertCircle,
  Loader2,
  ArrowRight,
  Mail,
  KeyRound,
  X,
  ExternalLink,
  RefreshCw,
  User,
  LogIn,
  FileDown,
  Sparkles,
} from "lucide-react"
import { ReviewForm } from "@/components/reviews/review-form"
import { getStoreUrl } from "@/lib/url-helpers"

interface ReceiptContentProps {
  order: any
  product: any
  assets: any[]
  hasAccess: boolean
  requiresVerification: boolean
  isOwner: boolean
  receiptToken: string
}

function SuccessToast({
  show,
  onClose,
  message,
}: {
  show: boolean
  onClose: () => void
  message: string
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose()
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div
        className="bg-white border border-green-200 rounded-xl shadow-lg shadow-green-100/50 p-4 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300"
        style={{
          animation: show ? "slideIn 0.3s ease-out" : "slideOut 0.3s ease-in forwards",
        }}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1 pt-0.5">
          <p className="font-medium text-gray-900 text-sm">Emails sent successfully</p>
          <p className="text-sm text-gray-600 mt-0.5">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ErrorToast({
  show,
  onClose,
  message,
}: {
  show: boolean
  onClose: () => void
  message: string
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose()
      }, 7000)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div
        className="bg-white border border-red-200 rounded-xl shadow-lg shadow-red-100/50 p-4 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300"
        style={{
          animation: show ? "slideIn 0.3s ease-out" : "slideOut 0.3s ease-in forwards",
        }}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1 pt-0.5">
          <p className="font-medium text-gray-900 text-sm">Email delivery issue</p>
          <p className="text-sm text-gray-600 mt-0.5">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function ReceiptContent({
  order,
  product,
  assets,
  hasAccess,
  requiresVerification,
  isOwner,
  receiptToken,
}: ReceiptContentProps) {
  const searchParams = useSearchParams()

  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [showErrorToast, setShowErrorToast] = useState(false)

  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState("")
  const [resendDisabled, setResendDisabled] = useState(false)

  const [showWrongEmail, setShowWrongEmail] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [updateEmailLoading, setUpdateEmailLoading] = useState(false)
  const [updateEmailError, setUpdateEmailError] = useState("")
  const [emailAlreadyChanged, setEmailAlreadyChanged] = useState(false)

  const [reviewStatus, setReviewStatus] = useState<{
    canReview: boolean
    hasReviewed: boolean
    isLoggedIn: boolean
    hasPurchased: boolean
    existingReview: any | null
  } | null>(null)
  const [isLoadingReviewStatus, setIsLoadingReviewStatus] = useState(true)

  const handleCloseToast = useCallback(() => {
    setShowSuccessToast(false)
  }, [])

  const handleCloseErrorToast = useCallback(() => {
    setShowErrorToast(false)
  }, [])

  const orderId = order?.id
  const orderShortId = orderId?.slice(0, 8) || ""

  const purchaseDate = useMemo(() => {
    try {
      return new Date(order.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    } catch {
      return ""
    }
  }, [order?.created_at])

  const sellerName = useMemo(() => {
    const raw =
      product?.creator?.display_name ||
      product?.creator?.name ||
      product?.seller?.display_name ||
      product?.seller?.name ||
      null
    if (!raw) return null
    const clean = String(raw).trim()
    if (!clean) return null
    if (clean.toLowerCase() === "creator") return null
    return clean
  }, [product])

  const sellerUsername = useMemo(() => {
    const raw = product?.creator?.username || product?.seller?.username || null
    if (!raw) return null
    const clean = String(raw).trim()
    if (!clean) return null
    return clean
  }, [product])

  /**
   * ✅ UNIVERSAL EMAIL STATUS (works for paid + free)
   * This comes from the receipt page we updated: order.__email_status
   */
  const emailStatus = useMemo(() => {
    return (order as any)?.__email_status || null
  }, [order])

  const successToastMessage = "Your download link is now in your inbox. Check spam if you don't see it."

  const errorToastMessage = useMemo(() => {
    const buyerErr = emailStatus?.buyerEmailError ? String(emailStatus.buyerEmailError) : ""
    const sellerErr = emailStatus?.sellerEmailError ? String(emailStatus.sellerEmailError) : ""
    if (buyerErr && sellerErr) return "We couldn’t send one of the emails. Try Resend below, or contact support."
    if (buyerErr) return "We couldn’t email the buyer. Try Resend below, or contact support."
    if (sellerErr) return "We couldn’t notify the seller. Try Resend below, or contact support."
    return "We couldn’t send one of the emails. Try Resend below, or contact support."
  }, [emailStatus])

  // Prevent showing toast multiple times due to re-renders
  const didAutoToastRef = useRef(false)

  useEffect(() => {
    // Old behaviour (kept): show toast if receipt link has ?sent=1 or ?emailSent=1
    const sent = searchParams.get("sent")
    const emailSent = searchParams.get("emailSent")

    if ((sent === "1" || emailSent === "1") && !didAutoToastRef.current) {
      didAutoToastRef.current = true
      setShowSuccessToast(true)
      return
    }

    // New behaviour: auto toast based on DB-backed status (paid + free)
    if (!emailStatus || didAutoToastRef.current) return

    if (emailStatus.emailsAllSent) {
      didAutoToastRef.current = true
      setShowSuccessToast(true)
      return
    }

    if (emailStatus.emailsAnyFailed) {
      didAutoToastRef.current = true
      setShowErrorToast(true)
    }
  }, [searchParams, emailStatus])

  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const res = await fetch(`/api/reviews/check?productId=${order.product_id}`)
        const data = await res.json()
        setReviewStatus(data)
      } catch (err) {
        console.error("Failed to check review status:", err)
      } finally {
        setIsLoadingReviewStatus(false)
      }
    }

    if (hasAccess && order?.product_id) {
      checkReviewStatus()
    } else {
      setIsLoadingReviewStatus(false)
    }
  }, [hasAccess, order?.product_id])

  // Save purchase to localStorage for persistence across page refreshes
  // Includes variant ID for per-variant access control
  // Uses variantIds array to support multiple variant purchases per product
  useEffect(() => {
    if (!hasAccess || !order?.product_id || !receiptToken) return

    try {
      const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      const purchases = stored ? JSON.parse(stored) : {}

      const existingPurchase = purchases[order.product_id]
      const variantToAdd = order.variant_id || ""

      // Initialize or migrate existing purchase data
      let variantIds: string[] = []
      if (existingPurchase?.variantIds && Array.isArray(existingPurchase.variantIds)) {
        variantIds = [...existingPurchase.variantIds]
      } else if (existingPurchase?.variantId) {
        // Migrate legacy single variantId format
        variantIds = [existingPurchase.variantId]
      }

      // Add new variant if not already present
      if (!variantIds.includes(variantToAdd)) {
        variantIds.push(variantToAdd)
      }

      // Update purchase record
      purchases[order.product_id] = {
        receiptToken,
        assets: assets?.map(a => ({ id: a.id, file_name: a.file_name })) || [],
        variantIds, // Array of all purchased variant IDs for this product
      }
      localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
    } catch (e) {
      console.error("[ReceiptContent] Failed to save purchase to localStorage:", e)
    }
  }, [hasAccess, order?.product_id, order?.variant_id, receiptToken, assets])

  const handleSendCode = async () => {
    setError("")
    setSuccess("")
    setLoading(true)

    try {
      const res = await fetch("/api/security/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId, email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send verification code")
        return
      }

      setSuccess("Verification code sent! Check your email.")
      setStep("code")
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/security/confirm-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId, code: verificationCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.limitReached) {
          setError(
            `Device limit reached. You can only verify 3 devices per order. Please use one of your previously verified devices or contact support.`,
          )
        } else {
          setError(data.error || "Invalid verification code")
        }
        return
      }

      window.location.reload()
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResendReceipt = async () => {
    setResendLoading(true)
    setResendSuccess(false)
    setResendError("")
    setShowErrorToast(false)
    try {
      // Determine which emails need to be resent based on status
      let resendType = "buyer" // Default to buyer only
      if (emailStatus) {
        const buyerFailed = !emailStatus.buyerEmailSent || !!emailStatus.buyerEmailError
        const sellerFailed = !emailStatus.sellerEmailSent || !!emailStatus.sellerEmailError
        if (buyerFailed && sellerFailed) {
          resendType = "both"
        } else if (sellerFailed) {
          resendType = "both" // Also resend buyer to be safe
        }
      }

      const res = await fetch("/api/receipt/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, receiptToken, resendType }),
      })

      const data = await res.json()

      if (res.status === 429) {
        setResendError(data.error || "Too many resend attempts. Please try again later.")
        setResendDisabled(true)
        return
      }

      if (res.ok && data.success) {
        setResendSuccess(true)
        setShowSuccessToast(true)
        setTimeout(() => setResendSuccess(false), 5000)
      } else {
        setResendError(data.error || data.details || "Failed to resend email. Please try again.")
        if (!data.buyerSuccess || !data.sellerSuccess) {
          // Show specific failure info
          const failedParts = []
          if (!data.buyerSuccess) failedParts.push("receipt email")
          if (!data.sellerSuccess) failedParts.push("seller notification")
          if (failedParts.length > 0) {
            setResendError(`Failed to send: ${failedParts.join(", ")}. Please try again.`)
          }
        }
      }
    } catch (err) {
      console.error("Failed to resend receipt:", err)
      setResendError("Network error. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes("@")) {
      setUpdateEmailError("Please enter a valid email address")
      return
    }

    setUpdateEmailLoading(true)
    setUpdateEmailError("")

    try {
      const res = await fetch("/api/receipt/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, receiptToken, newEmail }),
      })

      const data = await res.json()

      if (res.status === 403 && data.alreadyChanged) {
        setEmailAlreadyChanged(true)
        setUpdateEmailError(data.error)
        return
      }

      if (!res.ok) {
        setUpdateEmailError(data.error || "Failed to update email")
        return
      }

      setResendSuccess(true)
      setShowWrongEmail(false)
      setNewEmail("")
      setTimeout(() => setResendSuccess(false), 5000)
    } catch (err) {
      console.error("Failed to update email:", err)
      setUpdateEmailError("Network error. Please try again.")
    } finally {
      setUpdateEmailLoading(false)
    }
  }

  if (requiresVerification && !hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-background">
        <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 shadow-sm">
              <Shield className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Verify your identity</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 max-w-sm mx-auto">
              You&apos;re accessing this receipt from a new device. Quick verification keeps your purchase secure.
            </p>
          </div>

          <Card className="border-0 shadow-lg shadow-gray-200/50 rounded-2xl overflow-hidden">
            <CardContent className="pt-6 pb-6 px-6 space-y-5">
              <form autoComplete="off" className="hidden">
                <input type="text" name="username" autoComplete="username" />
                <input type="password" name="password" autoComplete="current-password" />
              </form>

              {step === "email" ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                      Purchase email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      name="buyer_email_input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={loading}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      className="h-11 rounded-xl border-gray-200 focus:border-amber-400 focus:ring-amber-400/20"
                    />
                    <p className="text-xs text-gray-500">We&apos;ll send a 6-digit code to verify it&apos;s you.</p>
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="rounded-xl bg-green-50 border border-green-100 p-3 flex items-start gap-2.5">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-green-700">{success}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleSendCode}
                    disabled={loading || !email}
                    className="w-full h-11 rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Send verification code
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-sm font-medium text-gray-700">
                      Verification code
                    </Label>
                    <Input
                      id="code"
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      disabled={loading}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="h-11 rounded-xl border-gray-200 focus:border-amber-400 focus:ring-amber-400/20 text-center text-lg tracking-widest font-mono"
                    />
                    <p className="text-xs text-gray-500">Check your inbox for the 6-digit code.</p>
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Button
                      onClick={handleVerifyCode}
                      disabled={loading || verificationCode.length !== 6}
                      className="w-full h-11 rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Verify & unlock download
                    </Button>

                    <button
                      type="button"
                      onClick={() => {
                        setStep("email")
                        setVerificationCode("")
                        setError("")
                        setSuccess("")
                      }}
                      disabled={loading}
                      className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
                    >
                      Didn&apos;t receive it? Send again
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-gray-500 max-w-xs mx-auto">
            This verification protects your purchase. If you didn&apos;t request access, you can safely ignore this.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/50 to-background">
      <SuccessToast show={showSuccessToast} onClose={handleCloseToast} message={successToastMessage} />
      <ErrorToast show={showErrorToast} onClose={handleCloseErrorToast} message={errorToastMessage} />

      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14 space-y-5">
        {/* Success Header */}
        <div className="text-center pb-2">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 shadow-sm ring-8 ring-green-50">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
            {isOwner ? "Purchase Complete" : "Your Download is Ready"}
          </h1>
          <p className="mt-2 text-sm text-gray-500 font-mono">Order #{orderShortId}</p>
        </div>

        {/* Product Card */}
        <Card className="border-0 shadow-lg shadow-gray-200/50 rounded-2xl overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex gap-4">
              {product?.thumbnail_url ? (
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-xl border border-gray-100 shadow-sm">
                  <Image
                    src={product.thumbnail_url || "/placeholder.svg"}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                  <Package className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold leading-tight text-gray-900 truncate">
                  {product?.title}
                </h2>

                {/* Show variant name if purchased */}
                {order?.variant_name && (
                  <p className="text-sm font-medium text-violet-600 mt-0.5">
                    {order.variant_name}
                  </p>
                )}

                {sellerName ? (
                  sellerUsername ? (
                    <a
                      href={getStoreUrl(sellerUsername)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                    >
                      by {sellerName}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">by {sellerName}</p>
                  )
                ) : null}

                <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{purchaseDate}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Downloads Section - Primary Action */}
        <Card className="border-0 shadow-lg shadow-gray-200/50 rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 px-5 sm:px-6 pt-5 sm:pt-6">
            <div className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-gray-700" />
              <CardTitle className="text-base font-semibold text-gray-900">Download Files</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="pt-0 px-5 sm:px-6 pb-5 sm:pb-6">
            {!assets || assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                </div>
                <p className="font-medium text-gray-700 text-sm">No files available yet</p>
                <p className="text-xs text-gray-500 mt-1">
                  The creator hasn&apos;t uploaded files yet. Check back soon!
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {assets.map((asset, index) => (
                  <DownloadButton
                    key={asset.id}
                    assetId={asset.id}
                    receiptToken={receiptToken}
                    size="lg"
                    className={`w-full h-12 rounded-xl font-medium ${
                      index === 0
                        ? "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    Download {product?.title}
                  </DownloadButton>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {hasAccess && !isLoadingReviewStatus && (
          <ReviewForm
            productId={order.product_id}
            productTitle={product?.title || "this product"}
            orderId={order.id}
            isLoggedIn={reviewStatus?.isLoggedIn || false}
            hasPurchased={true}
            hasReviewed={reviewStatus?.hasReviewed || false}
            existingReview={reviewStatus?.existingReview}
            redirectUrl={`/receipt/${receiptToken}`}
            onSuccess={() => {
              setReviewStatus((prev) => (prev ? { ...prev, hasReviewed: true, canReview: false } : null))
            }}
          />
        )}

        {/* Account CTA for non-owners */}
        {!isOwner && (
          <Card className="border-0 shadow-lg shadow-blue-100/50 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Keep access forever</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Create an account to access your purchases anytime, from any device.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <Button className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-sm" asChild>
                  <Link href={`/signup?redirect=${encodeURIComponent(`/receipt/${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}>
                    <User className="mr-2 h-4 w-4" />
                    Create Account
                  </Link>
                </Button>
                <Button variant="outline" className="flex-1 h-11 rounded-xl bg-white/80 border-gray-200" asChild>
                  <Link href={`/login?redirect=${encodeURIComponent(`/receipt/${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}>
                    <LogIn className="mr-2 h-4 w-4" />
                    Log In
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Owner Actions */}
        {isOwner && (
          <Card className="border-0 shadow-lg shadow-gray-200/50 rounded-2xl overflow-hidden">
            <CardContent className="p-5 sm:p-6 space-y-2.5">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl justify-between bg-white border-gray-200 hover:bg-gray-50"
                asChild
              >
                <Link href="/library/my-downloads">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    View in Library
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </Link>
              </Button>

              <Button
                variant="outline"
                className="w-full h-11 rounded-xl justify-between bg-white border-gray-200 hover:bg-gray-50"
                asChild
              >
                <a
                  href={`/api/receipt/view?orderId=${orderId}&receiptToken=${receiptToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-gray-500" />
                    View Receipt
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Email Options */}
        <Card className="border-0 shadow-md shadow-gray-100/50 rounded-2xl overflow-hidden bg-gray-50/50">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>Need the email again?</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-4 rounded-lg text-gray-700 hover:bg-gray-200/50"
                onClick={handleResendReceipt}
                disabled={resendLoading || resendDisabled}
              >
                {resendSuccess ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5 text-green-600" />
                    <span className="text-green-600">Sent!</span>
                  </>
                ) : (
                  <>
                    {resendLoading ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    Resend
                  </>
                )}
              </Button>
            </div>
            {resendError && <p className="text-xs text-red-600">{resendError}</p>}

            {/* Wrong email flow */}
            <div className="pt-3 border-t border-gray-200/60">
              {!showWrongEmail && !emailAlreadyChanged ? (
                <button
                  onClick={() => setShowWrongEmail(true)}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Wrong email address?
                </button>
              ) : emailAlreadyChanged ? (
                <p className="text-sm text-gray-500">Email was already updated once for this order.</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-email" className="text-sm font-medium text-gray-700">
                      New email address
                    </Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={updateEmailLoading}
                      className="h-10 rounded-xl border-gray-200"
                    />
                    {updateEmailError && <p className="text-xs text-red-600">{updateEmailError}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUpdateEmail}
                      disabled={updateEmailLoading || !newEmail}
                      className="flex-1 h-10 rounded-xl"
                      size="sm"
                    >
                      {updateEmailLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Update & resend
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowWrongEmail(false)
                        setNewEmail("")
                        setUpdateEmailError("")
                      }}
                      disabled={updateEmailLoading}
                      size="sm"
                      className="h-10 rounded-xl"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
