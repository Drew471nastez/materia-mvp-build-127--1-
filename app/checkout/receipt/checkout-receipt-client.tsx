"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { downloadEntitledFile } from "@/components/download-button"
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
  UserPlus,
} from "lucide-react"
import { getProductUrl } from "@/lib/url-helpers"
import { useLocale } from "@/components/locale-provider"

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
      avatar_url: string | null
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

/** Truncate a filename to maxLen chars, preserving the extension */
const truncateFileName = (name: string, maxLen = 32) => {
  if (!name || name.length <= maxLen) return name
  const dotIdx = name.lastIndexOf(".")
  if (dotIdx === -1) return name.slice(0, maxLen - 3) + "..."
  const ext = name.slice(dotIdx)
  const base = name.slice(0, dotIdx)
  const maxBase = maxLen - ext.length - 3
  if (maxBase < 4) return name.slice(0, maxLen - 3) + "..."
  return base.slice(0, maxBase) + "..." + ext
}

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
  const { t, formatPrice } = useLocale()
  const orderId = order.id
  const creatorName = product.creator?.display_name || t("checkout.the_creator")
  const creatorAvatar = product.creator?.avatar_url || null
  const creatorUsername = product.creator?.username || product.creator?.slug || ""
  const productUrl = creatorUsername ? getProductUrl(creatorUsername, product.slug) : "/explore"

  // "Back to product" URL includes purchaseToken (and variant if applicable) so the
  // product page can show the Download button immediately without depending on
  // localStorage — which may be unavailable in Safari private mode, iOS in-app
  // browsers (WhatsApp, Instagram), or after ITP storage clearing.
  const backToProductUrl = hasAccess && receiptToken
    ? `${productUrl}${productUrl.includes("?") ? "&" : "?"}purchaseToken=${encodeURIComponent(receiptToken)}${order.variant_id ? `&purchaseVariantId=${encodeURIComponent(order.variant_id)}` : ""}`
    : productUrl

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
  const [toastVisible, setToastVisible] = useState(false)
  const [toastLeaving, setToastLeaving] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [toastType, setToastType] = useState<"success" | "error">("success")

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToastMessage(message)
    setToastType(type)
    setToastLeaving(false)
    setToastVisible(true)
    setTimeout(() => {
      setToastLeaving(true)
      setTimeout(() => {
        setToastVisible(false)
        setToastLeaving(false)
      }, 400)
    }, 5000)
  }, [])

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

  // Auto toast: only once per order per session
  useEffect(() => {
    const toastKey = `checkout_receipt_toast_${orderId}`
    try {
      if (sessionStorage.getItem(toastKey)) return
    } catch {}

    const hasError = !!emailStatus.buyerEmailError || !!emailStatus.sellerEmailError
    const allSent = emailStatus.buyerEmailSent && emailStatus.sellerEmailSent

    if (hasError) {
      showToast(t("checkout.toast_email_failed"), "error")
    } else if (allSent || searchParams.get("emailSent") === "1") {
      showToast(t("checkout.toast_download_inbox"), "success")
    } else {
      return
    }

    try { sessionStorage.setItem(toastKey, "1") } catch {}
  }, [orderId, emailStatus, searchParams, showToast])

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
        setVerifyError(data.error || t("checkout.err_send_code"))
        return
      }
      setVerifySuccess(t("checkout.verify_code_sent"))
      setVerifyStep("code")
    } catch {
      setVerifyError(t("checkout.err_something_wrong"))
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
          setVerifyError(t("checkout.err_device_limit"))
        } else {
          setVerifyError(data.error || t("checkout.err_invalid_code"))
        }
        return
      }
      window.location.reload()
    } catch {
      setVerifyError(t("checkout.err_something_wrong"))
    } finally {
      setVerifyLoading(false)
    }
  }

  // Resend receipt email
  const handleResendEmail = async () => {
    if (resendCount >= MAX_RESENDS) {
      setResendDisabled(true)
      setResendError(t("checkout.err_max_resends"))
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
        setResendError(data.error || t("checkout.err_too_many_resends"))
        setResendDisabled(true)
        return
      }
      if (res.ok && data.success) {
        setResendSuccess(true)
        setResendCount((c) => c + 1)
        showToast(t("checkout.toast_email_resent"), "success")
        setTimeout(() => setResendSuccess(false), 5000)
      } else {
        setResendError(data.error || t("checkout.err_resend_failed"))
      }
    } catch {
      setResendError(t("checkout.err_network"))
    } finally {
      setResendLoading(false)
    }
  }

  // Update email address
  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes("@")) {
      setUpdateEmailError(t("checkout.err_valid_email"))
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
        setUpdateEmailError(data.error || t("checkout.err_update_email"))
        return
      }
      setResendSuccess(true)
      setShowWrongEmail(false)
      setNewEmail("")
      showToast(t("checkout.toast_email_updated"), "success")
      setTimeout(() => setResendSuccess(false), 5000)
    } catch {
      setUpdateEmailError(t("checkout.err_network"))
    } finally {
      setUpdateEmailLoading(false)
    }
  }

  // ---------- TOAST ----------
  const toastEl = toastVisible ? (
    <div
      className="fixed top-5 left-1/2 z-[200] w-full max-w-sm px-4"
      style={{
        transform: toastLeaving ? "translate(-50%, -20px)" : "translate(-50%, 0)",
        opacity: toastLeaving ? 0 : 1,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: toastLeaving ? "none" : "auto",
      }}
    >
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl"
        style={{ backgroundColor: toastType === "error" ? "#dc2626" : "#111", color: "#fff" }}
      >
        {toastType === "error" ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-white/80" />
        ) : (
          <CheckCircle className="h-4 w-4 shrink-0 text-white/80" />
        )}
        <p className="text-sm font-medium flex-1 leading-snug">{toastMessage}</p>
        <button
          onClick={() => { setToastLeaving(true); setTimeout(() => { setToastVisible(false); setToastLeaving(false) }, 400) }}
          className="shrink-0 text-white/50 hover:text-white transition-colors p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  ) : null

  // ---------- DOWNLOAD FILE ITEM ----------
  const [showAllDownloads, setShowAllDownloads] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const MAX_VISIBLE_DOWNLOADS = 4

  const handleFileDownload = async (assetId: string) => {
    setDownloadingId(assetId)
    await downloadEntitledFile(assetId, { receiptToken })
    setDownloadingId(null)
  }

  const renderDownloadItem = (asset: any, idx: number) => {
    const fileName = asset.file_name || t("checkout.download_fallback")
    const displayName = truncateFileName(fileName, 28)
    const isDownloading = downloadingId === asset.id

    return (
      <button
        key={asset.id}
        type="button"
        onClick={() => handleFileDownload(asset.id)}
        disabled={isDownloading}
        className="flex items-center w-full p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-default"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 shrink-0">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate px-3 text-left">
          {displayName}
        </span>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white shrink-0">
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </div>
      </button>
    )
  }

  const downloadListRef = useRef<HTMLDivElement>(null)

  const renderDownloadList = (assetsList: any[]) => {
    const hasMore = assetsList.length > MAX_VISIBLE_DOWNLOADS
    // Collapsed: each item ~58px + 8px gap
    const collapsedHeight = MAX_VISIBLE_DOWNLOADS * 58 + (MAX_VISIBLE_DOWNLOADS - 1) * 8

    return (
      <>
        <div
          ref={downloadListRef}
          className="space-y-2 overflow-hidden"
          style={{
            maxHeight: hasMore && !showAllDownloads ? `${collapsedHeight}px` : `${assetsList.length * 80}px`,
            transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {assetsList.map((asset: any, idx: number) => renderDownloadItem(asset, idx))}
        </div>
        {hasMore && (
          <div className="relative mt-0">
            <div
              className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none"
              style={{
                opacity: showAllDownloads ? 0 : 1,
                transition: "opacity 0.3s ease",
              }}
            />
            <button
              type="button"
              onClick={() => setShowAllDownloads(!showAllDownloads)}
              className="w-full py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            >
              {showAllDownloads ? t("checkout.show_less") : `${t("checkout.show_all")} (${assetsList.length})`}
            </button>
          </div>
        )}
      </>
    )
  }

  // ---------- VERIFICATION GATE ----------
  if (initialRequiresVerification && !hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        {toastEl}
        <div className="mx-auto max-w-[420px] px-5 py-12 sm:py-16">
          {/* Overlapping circles: seller avatar + security shield */}
          <div className="flex justify-center mb-8">
            <div className="relative flex items-center">
              {/* Seller avatar circle */}
              <div className="relative z-10 h-16 w-16 rounded-full overflow-hidden border-2 border-white bg-gray-100 shadow-sm">
                {creatorAvatar ? (
                  <Image src={creatorAvatar} alt={creatorName} width={64} height={64} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600 text-lg font-bold">
                    {creatorName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Security shield square — overlapping 10% of avatar */}
              <div className="relative z-20 -ml-3 h-12 w-12 rounded-lg bg-[#7c3aed] border-2 border-white flex items-center justify-center shadow-md">
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t("checkout.verify_identity")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-500 max-w-sm mx-auto">
              {t("checkout.verify_new_device")}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-5">
            <form autoComplete="off" className="hidden">
              <input type="text" name="username" autoComplete="username" />
              <input type="password" name="password" autoComplete="current-password" />
            </form>

            {verifyStep === "email" ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="verify-email" className="text-sm font-medium text-gray-700">
                    {t("checkout.purchase_email")}
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
                    className="h-11 rounded-xl border-gray-200 focus:border-[#7c3aed] focus:ring-[#7c3aed]/20"
                  />
                  <p className="text-xs text-gray-500">{t("checkout.verify_send_hint")}</p>
                </div>

                {verifyError && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{verifyError}</p>
                  </div>
                )}

                {verifySuccess && (
                  <div className="rounded-xl bg-green-50 border border-green-100 p-3 flex items-start gap-2.5">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-green-700">{verifySuccess}</p>
                  </div>
                )}

                <Button
                  onClick={handleSendCode}
                  disabled={verifyLoading || !verifyEmail}
                  className="w-full h-11 rounded-xl gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium shadow-sm"
                >
                  {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {t("checkout.send_verification_code")}
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="verify-code" className="text-sm font-medium text-gray-700">
                    {t("checkout.verification_code")}
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
                    className="h-11 rounded-xl border-gray-200 focus:border-[#7c3aed] focus:ring-[#7c3aed]/20 text-center text-lg tracking-widest font-mono"
                  />
                  <p className="text-xs text-gray-500">{t("checkout.verify_check_inbox")}</p>
                </div>

                {verifyError && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{verifyError}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <Button
                    onClick={handleVerifyCode}
                    disabled={verifyLoading || verificationCode.length !== 6}
                    className="w-full h-11 rounded-xl gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium shadow-sm"
                  >
                    {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    {t("checkout.verify_unlock")}
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
                    {t("checkout.didnt_receive")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-400 max-w-xs mx-auto">
            {t("checkout.verify_protects")}
          </p>
        </div>
      </div>
    )
  }

  // ---------- MAIN RECEIPT VIEW ----------
  return (
    <div className="min-h-screen bg-gray-50">
      {toastEl}

      {/* Header */}
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <a href={backToProductUrl} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("checkout.back_to_product")}</span>
          </a>
          <Link href="/explore" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            {t("checkout.continue_shopping")}
          </Link>
        </div>
      </header>

      {/* ========== MOBILE LAYOUT ========== */}
      <div className="lg:hidden">
        <div className="mx-auto max-w-[640px] px-6 sm:px-10 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-6 animate-in fade-in-0 duration-500">
          {/* Success header */}
          <div className="text-center">
            <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#7b42ff" strokeWidth="0.648"/>
                <path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="#7b42ff" strokeWidth="0.648" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t("checkout.order_complete")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("checkout.download_ready")}</p>
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
                <p className="text-xs text-gray-400 mt-1">{t("checkout.by")} {creatorName}</p>
              </div>
            </div>
          </div>

          {/* Download files */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Download className="h-4 w-4 text-gray-500" />
              {t("checkout.download_files")}
            </h3>
            {assets.length > 0 ? (
              renderDownloadList(assets)
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                <p className="text-sm text-gray-500">{t("checkout.no_files_check_back")}</p>
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
              creatorAvatarUrl={creatorAvatar}
              creatorName={creatorName}
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
                {t("checkout.view_in_library")}
              </Link>
            )}
            <a
              href={`/api/receipt/view?orderId=${orderId}&receiptToken=${receiptToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              {t("checkout.view_receipt")}
            </a>
          </div>

          {/* Account CTA for guests */}
          {!isLoggedIn && (
            <div className="bg-[#f9fafb] rounded-2xl border border-[#e5e7eb] p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                  <UserPlus className="h-4 w-4 text-[#6b7280]" />
                </div>
                <p className="text-sm font-semibold text-gray-900">{t("checkout.create_account_heading")}</p>
              </div>
              <p className="text-xs text-gray-600 mb-3">{t("checkout.account_cta_subtitle")}</p>
              <div className="flex gap-2">
                <Link
                  href={`/signup?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-semibold transition-colors"
                >
                  {t("checkout.create_account")}
                </Link>
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t("checkout.log_in")}
                </Link>
              </div>
            </div>
          )}

          {/* Email options (mobile) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>{t("checkout.need_email_again")}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-4 rounded-lg text-gray-700 hover:bg-gray-200/50"
                onClick={handleResendEmail}
                disabled={resendLoading || resendDisabled || resendCount >= MAX_RESENDS}
              >
                {resendSuccess ? (
                  <><CheckCircle className="h-4 w-4 mr-1.5 text-green-600" /><span className="text-green-600">{t("checkout.sent")}</span></>
                ) : (
                  <>{resendLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}{t("checkout.resend")}{resendCount > 0 ? ` (${MAX_RESENDS - resendCount} ${t("checkout.left")})` : ""}</>
                )}
              </Button>
            </div>
            {resendError && <p className="text-xs text-red-600">{resendError}</p>}

            {/* Wrong email flow */}
            <div className="pt-3 border-t border-gray-200/60">
              {!showWrongEmail && !emailAlreadyChanged ? (
                <button onClick={() => setShowWrongEmail(true)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  {t("checkout.wrong_email")}
                </button>
              ) : emailAlreadyChanged ? (
                <p className="text-sm text-gray-500">{t("checkout.email_already_updated")}</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-email-mobile" className="text-sm font-medium text-gray-700">{t("checkout.new_email_address")}</Label>
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
                      {t("checkout.update_resend")}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowWrongEmail(false); setNewEmail(""); setUpdateEmailError("") }} disabled={updateEmailLoading} size="sm" className="h-10 rounded-xl">
                      {t("checkout.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========== DESKTOP LAYOUT: 50/50 split ========== */}
      <div className="hidden lg:flex min-h-[calc(100vh-57px)]">
        {/* LEFT HALF — Downloads + actions */}
        <div className="w-1/2 bg-white">
          <div className="max-w-[600px] ml-auto py-10 px-10 xl:px-16 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            {/* Success header */}
            <div className="mb-8">
              <div className="w-12 h-12 flex items-center justify-center mb-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#7b42ff" strokeWidth="0.648"/>
                  <path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="#7b42ff" strokeWidth="0.648" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1 className="text-[28px] font-bold text-gray-900">{t("checkout.order_complete")}</h1>
              <p className="text-sm text-gray-500 mt-1">{t("checkout.purchase_successful_download")}</p>
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
                  <p className="text-xs text-gray-400 mt-1">{t("checkout.by")} {creatorName} · {order.total_cents === 0 ? t("checkout.free") : formatPrice(order.total_cents)}</p>
                </div>
              </div>
            </div>

            {/* Download files */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Download className="h-4 w-4 text-gray-500" />
                {t("checkout.download_files")}
              </h3>
              {assets.length > 0 ? (
                renderDownloadList(assets)
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                  <p className="text-sm text-gray-500">{t("checkout.no_files_check_back")}</p>
                </div>
              )}
            </div>

            {/* Actions row */}
            <div className="flex gap-3 mb-6">
              {isLoggedIn && (
                <Link href="/library/my-downloads" className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <BookOpen className="h-4 w-4" />
                  {t("checkout.view_in_library")}
                </Link>
              )}
              <a
                href={`/api/receipt/view?orderId=${orderId}&receiptToken=${receiptToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-4 w-4" />
                {t("checkout.view_receipt")}
              </a>
            </div>

            {/* Email options */}
            <div className="bg-gray-50/80 rounded-2xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4" />
                  <span>{t("checkout.need_email_again")}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-4 rounded-lg text-gray-700 hover:bg-gray-200/50"
                  onClick={handleResendEmail}
                  disabled={resendLoading || resendDisabled || resendCount >= MAX_RESENDS}
                >
                  {resendSuccess ? (
                    <><CheckCircle className="h-4 w-4 mr-1.5 text-green-600" /><span className="text-green-600">{t("checkout.sent")}</span></>
                  ) : (
                    <>{resendLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}{t("checkout.resend")}{resendCount > 0 ? ` (${MAX_RESENDS - resendCount} ${t("checkout.left")})` : ""}</>
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
                  <p className="text-sm text-gray-500">{t("checkout.email_already_updated")}</p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="new-email-desktop" className="text-sm font-medium text-gray-700">{t("checkout.new_email_address")}</Label>
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
                        {t("checkout.update_resend")}
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowWrongEmail(false); setNewEmail(""); setUpdateEmailError("") }} disabled={updateEmailLoading} size="sm" className="h-10 rounded-xl">
                        {t("checkout.cancel")}
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

        {/* RIGHT HALF — Review + Account CTA */}
        <div className="w-1/2 bg-[#f7f7f8]">
          <div className="sticky top-[57px] w-full py-10 px-8 xl:px-12 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 space-y-5" style={{ animationDelay: "150ms" }}>
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
                creatorAvatarUrl={creatorAvatar}
                creatorName={creatorName}
                onSuccess={() => {
                  setReviewStatus((prev) => (prev ? { ...prev, hasReviewed: true, canReview: false } : null))
                }}
              />
            )}

            {/* Account CTA for guests */}
            {!isLoggedIn && (
              <div className="bg-[#f9fafb] rounded-2xl border border-[#e5e7eb] shadow-sm p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-[#f3f4f6] flex items-center justify-center shrink-0">
                    <UserPlus className="h-5 w-5 text-[#6b7280]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{t("checkout.create_account_heading")}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{t("checkout.account_cta_subtitle")}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link
                    href={`/signup?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                    className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-semibold transition-colors"
                  >
                    {t("checkout.create_account")}
                  </Link>
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/checkout/receipt?token=${receiptToken}`)}&autoBuyer=1&receiptToken=${receiptToken}`}
                    className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {t("checkout.log_in")}
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
