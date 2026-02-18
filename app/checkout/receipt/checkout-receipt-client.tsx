"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DownloadButton } from "@/components/download-button"
import { ReviewForm } from "@/components/reviews/review-form"
import {
  CheckCircle,
  Package,
  ArrowLeft,
  Download,
  Mail,
  BookOpen,
  FileText,
  Shield,
  AlertCircle,
  Loader2,
  KeyRound,
  X,
  RefreshCw,
} from "lucide-react"
import { getStoreUrl } from "@/lib/url-helpers"
import { getProductUrl } from "@/lib/url-helpers"

interface CheckoutReceiptClientProps {
  order: {
    id: string
    product_id: string
    variant_id: string | null
    variant_name: string | null
    buyer_email: string
    total_cents: number
    created_at: string
    buyer_id: string | null
  }
  product: {
    id: string
    title: string
    slug: string
    thumbnail_url: string | null
    creator: {
      display_name: string
      username: string
      slug: string
    } | null
  }
  assets: any[]
  hasAccess: boolean
  requiresVerification: boolean
  isOwner: boolean
  isLoggedIn: boolean
  receiptToken: string
  emailStatus: {
    buyerEmailSent: boolean
    sellerEmailSent: boolean
    buyerEmailError: string
    sellerEmailError: string
  }
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

export default function CheckoutReceiptClient({
  order,
  product,
  assets,
  hasAccess,
  requiresVerification: initialRequiresVerification,
  isOwner,
  isLoggedIn,
  receiptToken,
  emailStatus,
}: CheckoutReceiptClientProps) {
  const searchParams = useSearchParams()
  const orderId = order.id
  const creatorName = product.creator?.display_name || "the creator"
  const creatorUsername = product.creator?.username || product.creator?.slug || ""
  const productUrl = creatorUsername ? getProductUrl(creatorUsername, product.slug) : "/explore"

  // Verification state (for different-device access)
  const [verifyEmail, setVerifyEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verifyStep, setVerifyStep] = useState<"email" | "code">("email")
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState("")
  const [verifySuccess, setVerifySuccess] = useState("")

  // Resend email state
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState("")
  const [resendDisabled, setResendDisabled] = useState(false)
  const [resendCount, setResendCount] = useState(0)
  const MAX_RESENDS = 3

  // Wrong email state
  const [showWrongEmail, setShowWrongEmail] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [updateEmailLoading, setUpdateEmailLoading] = useState(false)
  const [updateEmailError, setUpdateEmailError] = useState("")
  const [emailAlreadyChanged, setEmailAlreadyChanged] = useState(false)

  // Review status
  const [reviewStatus, setReviewStatus] = useState<{
    canReview: boolean
    hasReviewed: boolean
    isLoggedIn: boolean
    hasPurchased: boolean
    existingReview: any | null
  } | null>(null)
  const [isLoadingReviewStatus, setIsLoadingReviewStatus] = useState(true)

  // Toast state
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [showErrorToast, setShowErrorToast] = useState(false)
  const didAutoToastRef = useRef(false)

  // Save purchase to localStorage
  useEffect(() => {
    if (!hasAccess || !order.product_id || !receiptToken) return
    try {
      const PURCHASED_PRODUCTS_KEY = "materia_purchased_products"
      const stored = localStorage.getItem(PURCHASED_PRODUCTS_KEY)
      const purchases = stored ? JSON.parse(stored) : {}
      const existingPurchase = purchases[order.product_id]
      const variantToAdd = order.variant_id || ""
      let variantIds: string[] = []
      if (existingPurchase?.variantIds && Array.isArray(existingPurchase.variantIds)) {
        variantIds = [...existingPurchase.variantIds]
      } else if (existingPurchase?.variantId) {
        variantIds = [existingPurchase.variantId]
      }
      if (!variantIds.includes(variantToAdd)) {
        variantIds.push(variantToAdd)
      }
      purchases[order.product_id] = {
        receiptToken,
        assets: assets?.map(a => ({ id: a.id, file_name: a.file_name })) || [],
        variantIds,
      }
      localStorage.setItem(PURCHASED_PRODUCTS_KEY, JSON.stringify(purchases))
    } catch {}
  }, [hasAccess, order.product_id, order.variant_id, receiptToken, assets])

  // Auto toast on mount
  useEffect(() => {
    if (didAutoToastRef.current) return
    const emailSent = searchParams.get("emailSent")
    if (emailSent === "1") {
      didAutoToastRef.current = true
      setShowSuccessToast(true)
      return
    }
    if (emailStatus.buyerEmailSent && emailStatus.sellerEmailSent) {
      didAutoToastRef.current = true
      setShowSuccessToast(true)
    } else if (emailStatus.buyerEmailError || emailStatus.sellerEmailError) {
      didAutoToastRef.current = true
      setShowErrorToast(true)
    }
  }, [searchParams, emailStatus])

  // Auto-hide toasts
  useEffect(() => {
    if (showSuccessToast) {
      const t = setTimeout(() => setShowSuccessToast(false), 6000)
      return () => clearTimeout(t)
    }
  }, [showSuccessToast])
  useEffect(() => {
    if (showErrorToast) {
      const t = setTimeout(() => setShowErrorToast(false), 7000)
      return () => clearTimeout(t)
    }
  }, [showErrorToast])

  // Check review status
  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const res = await fetch(`/api/reviews/check?productId=${order.product_id}`)
        const data = await res.json()
        setReviewStatus(data)
      } catch {}
      finally { setIsLoadingReviewStatus(false) }
    }
    if (hasAccess && order.product_id) {
      checkReviewStatus()
    } else {
      setIsLoadingReviewStatus(false)
    }
  }, [hasAccess, order.product_id])

  // Verification handlers
  const handleSendCode = async () => {
    setVerifyError("")
    setVerifySuccess("")
    setVerifyLoading(true)
    try {
      const res = await fetch("/api/security/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, email: verifyEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVerifyError(data.error || "Failed to send verification code")
        return
      }
      setVerifySuccess("Verification code sent! Check your email.")
      setVerifyStep("code")
    } catch {
      setVerifyError("Something went wrong. Please try again.")
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setVerifyError("")
    setVerifyLoading(true)
    try {
      const res = await fetch("/api/security/confirm-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, code: verificationCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.limitReached) {
          setVerifyError("Device limit reached. You can only verify 3 devices per order. Please contact support.")
        } else {
          setVerifyError(data.error || "Invalid verification code")
        }
        return
      }
      window.location.reload()
    } catch {
      setVerifyError("Something went wrong. Please try again.")
    } finally {
      setVerifyLoading(false)
    }
  }

  // Resend receipt email
  const handleResendEmail = async () => {
    if (resendCount >= MAX_RESENDS) {
      setResendDisabled(true)
      setResendError("Maximum resend attempts reached.")
      return
    }
    setResendLoading(true)
    setResendSuccess(false)
    setResendError("")
    try {
      let resendType = "buyer"
      const buyerFailed = !emailStatus.buyerEmailSent || !!emailStatus.buyerEmailError
      const sellerFailed = !emailStatus.sellerEmailSent || !!emailStatus.sellerEmailError
      if (buyerFailed && sellerFailed) resendType = "both"
      else if (sellerFailed) resendType = "both"

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
        setResendCount((c) => c + 1)
        setShowSuccessToast(true)
        setTimeout(() => setResendSuccess(false), 5000)
      } else {
        setResendError(data.error || "Failed to resend email.")
      }
    } catch {
      setResendError("Network error. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  // Update email address
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
      setShowSuccessToast(true)
      setTimeout(() => setResendSuccess(false), 5000)
    } catch {
      setUpdateEmailError("Network error. Please try again.")
    } finally {
      setUpdateEmailLoading(false)
    }
  }

  // ---------- VERIFICATION GATE ----------
  if (initialRequiresVerification && !hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-gray-50">
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

              {verifyStep === "email" ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="verify-email" className="text-sm font-medium text-gray-700">
                      Purchase email
                    </Label>
                    <Input
                      id="verify-email"
                      type="email"
                      name="buyer_email_input"
                      value={verifyEmail}
                      onChange={(e) => setVerifyEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={verifyLoading}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      className="h-11 rounded-xl border-gray-200 focus:border-amber-400 focus:ring-amber-400/20"
                    />
                    <p className="text-xs text-gray-500">We&apos;ll send a 6-digit code to verify it&apos;s you.</p>
                  </div>

                  {verifyError && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{verifyError}</p>
                    </div>
                  )}

                  {verifySuccess && (
                    <div className="rounded-xl bg-green-50 border border-green-100 p-3 flex items-start gap-2.5">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-green-700">{verifySuccess}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleSendCode}
                    disabled={verifyLoading || !verifyEmail}
                    className="w-full h-11 rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm"
                  >
                    {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Send verification code
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="verify-code" className="text-sm font-medium text-gray-700">
                      Verification code
                    </Label>
                    <Input
                      id="verify-code"
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      disabled={verifyLoading}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="h-11 rounded-xl border-gray-200 focus:border-amber-400 focus:ring-amber-400/20 text-center text-lg tracking-widest font-mono"
                    />
                    <p className="text-xs text-gray-500">Check your inbox for the 6-digit code.</p>
                  </div>

                  {verifyError && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{verifyError}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Button
                      onClick={handleVerifyCode}
                      disabled={verifyLoading || verificationCode.length !== 6}
                      className="w-full h-11 rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm"
                    >
                      {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Verify & unlock download
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyStep("email")
                        setVerificationCode("")
                        setVerifyError("")
                        setVerifySuccess("")
                      }}
                      disabled={verifyLoading}
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

  // ---------- MAIN RECEIPT VIEW ----------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4">
          <div className="bg-white border border-green-200 rounded-xl shadow-lg shadow-green-100/50 p-4 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="font-medium text-gray-900 text-sm">Emails sent successfully</p>
              <p className="text-sm text-gray-600 mt-0.5">Your download link is now in your inbox. Check spam if you don&apos;t see it.</p>
            </div>
            <button onClick={() => setShowSuccessToast(false)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {showErrorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4">
          <div className="bg-white border border-red-200 rounded-xl shadow-lg shadow-red-100/50 p-4 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="font-medium text-gray-900 text-sm">Email delivery issue</p>
              <p className="text-sm text-gray-600 mt-0.5">We couldn&apos;t send one of the emails. Try Resend below.</p>
            </div>
            <button onClick={() => setShowErrorToast(false)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <a href={productUrl} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back to product</span>
          </a>
          <Link href="/explore" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Continue Shopping
          </Link>
        </div>
      </header>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <div className="mx-auto max-w-[640px] px-6 sm:px-10 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-6 animate-in fade-in-0 duration-500">
          {/* Success header */}
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Order Complete</h1>
            <p className="text-sm text-gray-500 mt-1">Your download is ready</p>
          </div>

          {/* Product info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                {product.thumbnail_url ? (
                  <Image src={product.thumbnail_url} alt={product.title} width={64} height={64} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center"><Package className="h-6 w-6 text-gray-300" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.title}</p>
                {order.variant_name && <p className="text-xs text-gray-500 mt-0.5">{order.variant_name}</p>}
                <p className="text-xs text-gray-400 mt-1">by {creatorName}</p>
              </div>
            </div>
          </div>

          {/* Download files */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Download className="h-4 w-4 text-gray-500" />
              Download Files
            </h3>
            {assets.length > 0 ? (
              <div className="space-y-2">
                {assets.map((asset: any, idx: number) => (
                  <DownloadButton
                    key={asset.id}
                    assetId={asset.id}
                    receiptToken={receiptToken}
                    fileName={asset.file_name}
                    size="lg"
                    className={`w-full h-12 rounded-xl text-sm font-semibold ${idx === 0 ? "bg-[#111] hover:bg-[#222] text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-900"}`}
                  >
                    {asset.file_name}{asset.file_size ? ` (${formatFileSize(asset.file_size)})` : ""}
                  </DownloadButton>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                <p className="text-sm text-gray-500">No files available yet. Check back soon!</p>
              </div>
            )}
          </div>

          {/* Review section (mobile) */}
          {hasAccess && !isLoadingReviewStatus && (
            <ReviewForm
              productId={order.product_id}
              productTitle={product.title}
              orderId={order.id}
              isLoggedIn={reviewStatus?.isLoggedIn ?? isLoggedIn}
              hasPurchased={true}
              hasReviewed={reviewStatus?.hasReviewed || false}
              existingReview={reviewStatus?.existingReview}
              redirectUrl={`/checkout/receipt?token=${receiptToken}`}
              onSuccess={() => {
                setReviewStatus((prev) => (prev ? { ...prev, hasReviewed: true, canReview: false } : null))
              }}
            />
          )}

          {/* Actions */}
          <div className="space-y-3">
            {isLoggedIn && (
              <Link href="/library/my-downloads" className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <BookOpen className="h-4 w-4" />
                View in Library
              </Link>
            )}
            <Link href={`/receipt/${receiptToken}`} className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <FileText className="h-4 w-4" />
              View Receipt
            </Link>
          </div>

          {/* Account CTA for guests */}
          {!isLoggedIn && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-1">Create an account</p>
              <p className="text-xs text-gray-600 mb-3">Access your purchases from any device, leave reviews, and manage downloads.</p>
              <div className="flex gap-2">
                <Link
                  href={`/signup?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  Create Account
                </Link>
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Log In
                </Link>
              </div>
            </div>
          )}

          {/* Email options (mobile) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>Need the email again?</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-4 rounded-lg text-gray-700 hover:bg-gray-200/50"
                onClick={handleResendEmail}
                disabled={resendLoading || resendDisabled || resendCount >= MAX_RESENDS}
              >
                {resendSuccess ? (
                  <><CheckCircle className="h-4 w-4 mr-1.5 text-green-600" /><span className="text-green-600">Sent!</span></>
                ) : (
                  <>{resendLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}Resend{resendCount > 0 ? ` (${MAX_RESENDS - resendCount} left)` : ""}</>
                )}
              </Button>
            </div>
            {resendError && <p className="text-xs text-red-600">{resendError}</p>}

            {/* Wrong email flow */}
            <div className="pt-3 border-t border-gray-200/60">
              {!showWrongEmail && !emailAlreadyChanged ? (
                <button onClick={() => setShowWrongEmail(true)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Wrong email address?
                </button>
              ) : emailAlreadyChanged ? (
                <p className="text-sm text-gray-500">Email was already updated once for this order.</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-email-mobile" className="text-sm font-medium text-gray-700">New email address</Label>
                    <Input
                      id="new-email-mobile"
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
                    <Button onClick={handleUpdateEmail} disabled={updateEmailLoading || !newEmail} className="flex-1 h-10 rounded-xl" size="sm">
                      {updateEmailLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Update & resend
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowWrongEmail(false); setNewEmail(""); setUpdateEmailError("") }} disabled={updateEmailLoading} size="sm" className="h-10 rounded-xl">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop layout: split-screen — left 45%, right 55% (review 20% wider) */}
      <div className="hidden lg:flex min-h-[calc(100vh-57px)]">
        {/* LEFT HALF — Downloads + actions */}
        <div className="w-[45%] bg-white">
          <div className="max-w-[580px] ml-auto py-10 px-10 xl:px-16 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            {/* Success header */}
            <div className="mb-8">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
                <CheckCircle className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="text-[28px] font-bold text-gray-900">Order Complete</h1>
              <p className="text-sm text-gray-500 mt-1">Your purchase was successful. Download your files below.</p>
            </div>

            {/* Product card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="flex gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {product.thumbnail_url ? (
                    <Image src={product.thumbnail_url} alt={product.title} width={64} height={64} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Package className="h-6 w-6 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-gray-900 line-clamp-2">{product.title}</p>
                  {order.variant_name && <p className="text-xs text-gray-500 mt-0.5">{order.variant_name}</p>}
                  <p className="text-xs text-gray-400 mt-1">by {creatorName} · {formatPrice(order.total_cents)}</p>
                </div>
              </div>
            </div>

            {/* Download files */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Download className="h-4 w-4 text-gray-500" />
                Download Files
              </h3>
              {assets.length > 0 ? (
                <div className="space-y-2">
                  {assets.map((asset: any, idx: number) => (
                    <DownloadButton
                      key={asset.id}
                      assetId={asset.id}
                      receiptToken={receiptToken}
                      fileName={asset.file_name}
                      size="lg"
                      className={`w-full h-12 rounded-xl text-sm font-semibold ${idx === 0 ? "bg-[#111] hover:bg-[#222] text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-900"}`}
                    >
                      {asset.file_name}{asset.file_size ? ` (${formatFileSize(asset.file_size)})` : ""}
                    </DownloadButton>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                  <p className="text-sm text-gray-500">No files available yet. Check back soon!</p>
                </div>
              )}
            </div>

            {/* Actions row */}
            <div className="flex gap-3 mb-6">
              {isLoggedIn && (
                <Link href="/library/my-downloads" className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <BookOpen className="h-4 w-4" />
                  View in Library
                </Link>
              )}
              <Link href={`/receipt/${receiptToken}`} className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <FileText className="h-4 w-4" />
                View Receipt
              </Link>
            </div>

            {/* Email options */}
            <div className="bg-gray-50/80 rounded-2xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4" />
                  <span>Need the email again?</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-4 rounded-lg text-gray-700 hover:bg-gray-200/50"
                  onClick={handleResendEmail}
                  disabled={resendLoading || resendDisabled || resendCount >= MAX_RESENDS}
                >
                  {resendSuccess ? (
                    <><CheckCircle className="h-4 w-4 mr-1.5 text-green-600" /><span className="text-green-600">Sent!</span></>
                  ) : (
                    <>{resendLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}Resend{resendCount > 0 ? ` (${MAX_RESENDS - resendCount} left)` : ""}</>
                  )}
                </Button>
              </div>
              {resendError && <p className="text-xs text-red-600">{resendError}</p>}

              {/* Wrong email flow */}
              <div className="pt-3 border-t border-gray-200/60">
                {!showWrongEmail && !emailAlreadyChanged ? (
                  <button onClick={() => setShowWrongEmail(true)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                    Wrong email address?
                  </button>
                ) : emailAlreadyChanged ? (
                  <p className="text-sm text-gray-500">Email was already updated once for this order.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="new-email-desktop" className="text-sm font-medium text-gray-700">New email address</Label>
                      <Input
                        id="new-email-desktop"
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
                      <Button onClick={handleUpdateEmail} disabled={updateEmailLoading || !newEmail} className="flex-1 h-10 rounded-xl" size="sm">
                        {updateEmailLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Update & resend
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowWrongEmail(false); setNewEmail(""); setUpdateEmailError("") }} disabled={updateEmailLoading} size="sm" className="h-10 rounded-xl">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Subtle vertical divider */}
        <div className="w-px bg-gray-200 shrink-0" />

        {/* RIGHT HALF — Review + Account CTA (55% width, 20% wider) */}
        <div className="w-[55%] bg-[#f7f7f8]">
          <div className="sticky top-[57px] max-w-[600px] mr-auto py-10 px-10 xl:px-16 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "150ms" }}>
            {/* Review section */}
            {hasAccess && !isLoadingReviewStatus && (
              <ReviewForm
                productId={order.product_id}
                productTitle={product.title}
                orderId={order.id}
                isLoggedIn={reviewStatus?.isLoggedIn ?? isLoggedIn}
                hasPurchased={true}
                hasReviewed={reviewStatus?.hasReviewed || false}
                existingReview={reviewStatus?.existingReview}
                redirectUrl={`/checkout/receipt?token=${receiptToken}`}
                onSuccess={() => {
                  setReviewStatus((prev) => (prev ? { ...prev, hasReviewed: true, canReview: false } : null))
                }}
              />
            )}

            {/* Account CTA for guests */}
            {!isLoggedIn && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6 mt-5">
                <p className="text-[15px] font-semibold text-gray-900 mb-1">Create an account</p>
                <p className="text-sm text-gray-600 mb-4">Access your purchases from any device, leave reviews, and manage downloads.</p>
                <div className="flex gap-3">
                  <Link
                    href={`/signup?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                    className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    Create Account
                  </Link>
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                    className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Log In
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
