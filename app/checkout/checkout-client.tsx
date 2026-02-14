"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { getProductUrl } from "@/lib/url-helpers"
import {
  ArrowLeft,
  Package,
  Loader2,
  Gift,
  Heart,
  Tag,
  Lock,
  CreditCard,
  X,
  ChevronDown,
  ChevronUp,
  Shield,
  Check,
  AlertCircle,
  MapPin,
} from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ---------- Types ----------
interface SelectedVariant {
  id: string
  name: string
  description: string | null
  priceCents: number
}

interface CheckoutPageClientProps {
  product: {
    id: string
    title: string
    slug: string
    description: string | null
    price_cents: number
    thumbnail_url: string | null
    type: string
  }
  creator: {
    id: string
    name: string
    avatar_url: string | null
    username: string
  }
  userEmail: string | null
  isLoggedIn: boolean
  selectedVariant?: SelectedVariant | null
  isPwyw?: boolean
  customPriceCents?: number | null
}

// ---------- Helpers ----------
const CSRF_TOKEN = typeof crypto !== "undefined" ? crypto.randomUUID() : "csrf-placeholder"

function sanitizeInput(value: string): string {
  return value.replace(/[<>'"]/g, "").trim()
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

// Session storage keys
const SESSION_KEYS = {
  firstName: "checkout_firstName",
  lastName: "checkout_lastName",
  email: "checkout_email",
  vatId: "checkout_vatId",
  discountCode: "checkout_discountCode",
} as const

function loadSessionField(key: string): string {
  if (typeof window === "undefined") return ""
  try { return sessionStorage.getItem(key) || "" } catch { return "" }
}

function saveSessionField(key: string, value: string) {
  if (typeof window === "undefined") return
  try { sessionStorage.setItem(key, value) } catch { /* ignore */ }
}

// Stripe Elements styling
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1f2937",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      "::placeholder": {
        color: "#9ca3af",
      },
      iconColor: "#6b7280",
    },
    invalid: {
      color: "#ef4444",
      iconColor: "#ef4444",
    },
  },
}

// ---------- SVG Icons ----------
function GooglePayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.28 12.27c0-.84-.08-1.64-.24-2.41H9v4.55h6.35c-.27 1.46-1.1 2.7-2.35 3.54v2.94h3.79c2.22-2.04 3.49-5.05 3.49-8.62Z" fill="#4285F4"/>
      <path d="M9 24c3.15 0 5.79-1.04 7.72-2.82L12.93 18.2c-1.04.7-2.38 1.12-3.93 1.12-3.02 0-5.58-2.04-6.5-4.79H-1.4v3.03A11.996 11.996 0 0 0 9 24Z" fill="#34A853"/>
      <path d="M2.5 14.53A7.2 7.2 0 0 1 2.1 12c0-.88.15-1.74.4-2.53V6.44H-1.4A12 12 0 0 0-3 12c0 1.93.46 3.75 1.6 5.56L2.5 14.53Z" fill="#FBBC04"/>
      <path d="M9 4.77c1.71 0 3.25.59 4.47 1.74l3.35-3.35A11.2 11.2 0 0 0 9 0 11.996 11.996 0 0 0-1.4 6.44l3.9 3.03C3.42 6.8 5.98 4.77 9 4.77Z" fill="#EA4335"/>
      <path d="M28.9 16.73V7.27h3.43c.89 0 1.64.3 2.25.9.62.58.93 1.32.93 2.2 0 .87-.31 1.6-.93 2.2-.61.58-1.36.87-2.25.87h-1.28v3.29H28.9Zm2.15-5.12h1.32c.35 0 .63-.11.86-.33.24-.24.35-.54.35-.91 0-.37-.11-.66-.35-.88a1.15 1.15 0 0 0-.86-.35h-1.32v2.47Zm8.84 5.34c-.86 0-1.57-.24-2.12-.73-.56-.5-.83-1.12-.83-1.85 0-.76.29-1.37.86-1.82.58-.46 1.35-.69 2.3-.69.82 0 1.5.14 2.03.43v-.15c0-.37-.15-.67-.44-.9-.3-.24-.65-.36-1.05-.36-.61 0-1.1.26-1.46.77l-1.98-1.24c.55-.8 1.4-1.2 2.56-1.2.98 0 1.79.24 2.43.72.64.48.96 1.2.96 2.14v4.95h-2.05v-.58h-.07c-.44.5-1.02.76-1.74.76Zm.54-1.64c.4 0 .74-.13 1.02-.4.3-.27.45-.58.45-.95-.31-.24-.74-.36-1.28-.36-.39 0-.72.08-.97.24-.26.16-.39.38-.39.65 0 .24.1.43.3.58.2.16.49.24.87.24Zm8.58 4.79h-2.24l2.11-4.6-3.64-8.29h2.33l2.34 5.65h.04l2.25-5.65h2.29L49 20.1Z" fill="#5F6368"/>
    </svg>
  )
}

function PayPalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 780 501" xmlns="http://www.w3.org/2000/svg" fill="none">
      <g>
        <path fill="#003087" d="M168.379,169.853c-8.399-5.774-19.359-8.668-32.88-8.668H83.153c-4.145,0-6.435,2.073-6.87,6.215 L55.018,300.883c-0.221,1.311,0.107,2.51,0.981,3.6c0.869,1.092,1.962,1.635,3.271,1.635h24.864c4.361,0,6.758-2.068,7.198-6.215 l5.888-35.986c0.215-1.744,0.982-3.162,2.291-4.254c1.308-1.09,2.944-1.803,4.907-2.13c1.963-0.324,3.814-0.487,5.562-0.487 c1.743,0,3.814,0.11,6.217,0.327c2.397,0.218,3.925,0.324,4.58,0.324c18.756,0,33.478-5.285,44.167-15.866 c10.684-10.577,16.032-25.243,16.032-44.004C180.976,184.96,176.774,175.636,168.379,169.853z M141.389,209.933 c-1.094,7.635-3.926,12.649-8.506,15.049c-4.581,2.403-11.124,3.598-19.629,3.598l-10.797,0.327l5.563-35.007 c0.434-2.397,1.851-3.597,4.252-3.597h6.218c8.72,0,15.049,1.257,18.975,3.761C141.389,196.574,142.698,201.865,141.389,209.933z" />
        <path fill="#009CDE" d="M720.794,161.185h-24.208c-2.405,0-3.821,1.2-4.253,3.6l-21.267,136.099l-0.328,0.654 c0,1.096,0.437,2.127,1.311,3.109c0.868,0.98,1.963,1.471,3.27,1.471h21.595c4.138,0,6.429-2.068,6.871-6.215l21.265-133.813 v-0.325C725.049,162.712,723.627,161.185,720.794,161.185z" />
        <path fill="#003087" d="M428.31,213.856c0-1.088-0.439-2.126-1.306-3.106c-0.875-0.981-1.858-1.474-2.945-1.474h-25.192 c-2.404,0-4.366,1.096-5.889,3.271l-34.679,51.04l-14.395-49.075c-1.095-3.487-3.492-5.236-7.197-5.236h-24.541 c-1.093,0-2.074,0.492-2.941,1.474c-0.875,0.98-1.309,2.019-1.309,3.106c0,0.44,2.127,6.871,6.379,19.303 c4.252,12.435,8.832,25.849,13.74,40.245c4.908,14.393,7.469,22.031,7.688,22.898c-17.886,24.43-26.826,37.517-26.826,39.259 c0,2.838,1.416,4.254,4.253,4.254h25.192c2.398,0,4.36-1.088,5.889-3.27l83.427-120.399 C428.092,215.713,428.31,214.953,428.31,213.856z" />
      </g>
    </svg>
  )
}

const CHECKOUT_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" },
]

// ---------- Sub-components ----------
function OrderSummaryMobileToggle({
  isOpen,
  onToggle,
  total,
}: {
  isOpen: boolean
  onToggle: () => void
  total: number
}) {
  return (
    <button
      onClick={onToggle}
      className="lg:hidden flex items-center justify-between w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium cursor-pointer"
      type="button"
    >
      <span className="flex items-center gap-2">
        <Package className="w-4 h-4 text-gray-500" />
        {isOpen ? "Hide" : "Show"} order summary
      </span>
      <span className="flex items-center gap-2">
        <span className="font-semibold">{formatPrice(total)}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </span>
    </button>
  )
}

// ---------- Stripe Card Form ----------
function StripeCardForm({
  onSubmit,
  isSubmitting,
  isFormValid,
  isFree,
  total,
  error,
  setError,
  nameOnCard,
  setNameOnCard,
  agreedToTerms,
  setAgreedToTerms,
}: {
  onSubmit: (stripe: any, elements: any) => void
  isSubmitting: boolean
  isFormValid: boolean
  isFree: boolean
  total: number
  error: string | null
  setError: (e: string | null) => void
  nameOnCard: string
  setNameOnCard: (v: string) => void
  agreedToTerms: boolean
  setAgreedToTerms: (v: boolean) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const isStripeReady = Boolean(stripe && elements)
  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false,
  })

  const isCardComplete = cardComplete.cardNumber && cardComplete.cardExpiry && cardComplete.cardCvc

  const handleSubmit = () => {
    if (!stripe || !elements) {
      setError("Payment system is loading. Please wait.")
      return
    }
    onSubmit(stripe, elements)
  }

  return (
    <div className="space-y-4">
      {/* Payment Methods Express Buttons */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Express checkout</p>
          <div className="grid grid-cols-2 gap-3">
            {isStripeReady ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !isFormValid || !stripe}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GooglePayIcon className="h-6 w-auto" />
              </button>
            ) : (
              <Skeleton className="h-12 w-full rounded-xl bg-gray-100" />
            )}
            <div className="relative group">
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-[#FFC439] text-[#003087] text-sm font-bold cursor-not-allowed transition-all"
              >
                <PayPalIcon className="h-6 w-[78px]" />
              </button>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 bg-black/80 rounded-xl pointer-events-none">
                <span className="text-xs text-white font-medium">Not available now</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">OR PAY WITH CARD</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </div>
      )}

      {/* Card Input Fields - Stripe Elements */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Card number</Label>
            {isStripeReady ? (
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                <CardNumberElement
                  options={{
                    ...CARD_ELEMENT_OPTIONS,
                    showIcon: true,
                  }}
                  onChange={(e) => setCardComplete(prev => ({ ...prev, cardNumber: e.complete }))}
                  className="w-full"
                />
              </div>
            ) : (
              <Skeleton className="h-11 w-full rounded-xl bg-gray-100" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Expiration date</Label>
              {isStripeReady ? (
                <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                  <CardExpiryElement
                    options={CARD_ELEMENT_OPTIONS}
                    onChange={(e) => setCardComplete(prev => ({ ...prev, cardExpiry: e.complete }))}
                    className="w-full"
                  />
                </div>
              ) : (
                <Skeleton className="h-11 w-full rounded-xl bg-gray-100" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Security code</Label>
              {isStripeReady ? (
                <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                  <CardCvcElement
                    options={CARD_ELEMENT_OPTIONS}
                    onChange={(e) => setCardComplete(prev => ({ ...prev, cardCvc: e.complete }))}
                    className="w-full"
                  />
                </div>
              ) : (
                <Skeleton className="h-11 w-full rounded-xl bg-gray-100" />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Name on card</Label>
            <Input
              placeholder="John Doe"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value)}
              className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Terms & Conditions - Moved above Pay button */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-1">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          <Label htmlFor="terms" className="cursor-pointer text-sm leading-relaxed text-gray-600">
            I agree to the{" "}
            <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
              Terms and Conditions
            </Link>{" "}
            *
          </Label>
        </div>
      </div>

      {/* CTA Button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || !isFormValid || (!isFree && !isCardComplete) || !stripe}
        className="mt-4 w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : isFree ? (
          <>
            Get for Free
            <span className="ml-1">&rarr;</span>
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Pay {formatPrice(total)}
          </>
        )}
      </button>

      {/* Trust signals */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Shield className="h-3.5 w-3.5" />
          <span>Payment is secure and encrypted</span>
        </div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Secured by Stripe
        </p>
      </div>
    </div>
  )
}

// ---------- Main Component ----------
export default function CheckoutPageClient({
  product,
  creator,
  userEmail,
  isLoggedIn,
  selectedVariant,
  isPwyw,
  customPriceCents,
}: CheckoutPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlEmail = searchParams.get("email") || ""

  const [firstName, setFirstName] = useState(() => loadSessionField(SESSION_KEYS.firstName))
  const [lastName, setLastName] = useState(() => loadSessionField(SESSION_KEYS.lastName))
  const [email, setEmail] = useState(() => urlEmail || "")
  const [vatId, setVatId] = useState(() => loadSessionField(SESSION_KEYS.vatId))
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [nameOnCard, setNameOnCard] = useState("")

  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState("")
  const [isGift, setIsGift] = useState(false)

  const [discountCode, setDiscountCode] = useState(() => loadSessionField(SESSION_KEYS.discountCode))
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [mobileOrderOpen, setMobileOrderOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [countryCode, setCountryCode] = useState("US")
  const [showCountrySelector, setShowCountrySelector] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  const lastSubmitTime = useRef(0)

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 1024)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Persist form fields
  useEffect(() => { saveSessionField(SESSION_KEYS.firstName, firstName) }, [firstName])
  useEffect(() => { saveSessionField(SESSION_KEYS.lastName, lastName) }, [lastName])
  useEffect(() => { saveSessionField(SESSION_KEYS.email, email) }, [email])
  useEffect(() => { saveSessionField(SESSION_KEYS.vatId, vatId) }, [vatId])
  useEffect(() => { saveSessionField(SESSION_KEYS.discountCode, discountCode) }, [discountCode])

  // Track checkout start
  useEffect(() => {
    const trackCheckoutStart = async () => {
      try {
        await fetch("/api/track-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "checkout_start",
            creatorId: creator.id,
            productId: product.id,
          }),
        })
      } catch { /* Silent fail */ }
    }
    trackCheckoutStart()
  }, [creator.id, product.id])

  // Price calculations
  const subtotal = selectedVariant ? selectedVariant.priceCents : product.price_cents
  const tipCents = customTip ? Math.round(parseFloat(customTip) * 100) || 0 : Math.round(tipAmount * 100)
  const discountCents = discountApplied ? Math.round(subtotal * (discountPercent / 100)) : 0
  const total = Math.max(0, subtotal - discountCents + tipCents)
  const isFree = total === 0

  const tipOptions = [0, 1, 3, 5]
  const productUrl = getProductUrl(creator.username, product.slug)

  const isFormValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      validateEmail(email) &&
      agreedToTerms
    )
  }, [firstName, lastName, email, agreedToTerms])

  const isRateLimited = useCallback(() => {
    const now = Date.now()
    if (now - lastSubmitTime.current < 3000) return true
    lastSubmitTime.current = now
    return false
  }, [])

  // Handle free checkout
  const handleFreeCheckout = async () => {
    if (!isFormValid) {
      if (!firstName.trim()) return setError("Please enter your first name")
      if (!lastName.trim()) return setError("Please enter your last name")
      if (!validateEmail(email)) return setError("Please enter a valid email address")
      if (!agreedToTerms) return setError("Please agree to the Terms and Conditions")
      return
    }

    if (isRateLimited()) {
      setError("Please wait a moment before trying again")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch("/api/checkout/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": CSRF_TOKEN,
        },
        body: JSON.stringify({
          productId: product.id,
          firstName: sanitizeInput(firstName),
          lastName: sanitizeInput(lastName),
          email: sanitizeInput(email),
          tipCents: 0,
          isGift,
          variantId: selectedVariant?.id || null,
          customPriceCents: isPwyw ? customPriceCents : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorDetails = data.details ? ` (${data.details})` : ""
        const errorCode = data.code ? ` [${data.code}]` : ""
        throw new Error((data.error || "Checkout failed") + errorDetails + errorCode)
      }

      router.push(`${data.redirectUrl}?emailSent=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Create PaymentIntent and get clientSecret
  const createPaymentIntent = useCallback(async () => {
    const response = await fetch("/api/checkout/stripe-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": CSRF_TOKEN,
      },
      body: JSON.stringify({
        productId: product.id,
        firstName: sanitizeInput(firstName),
        lastName: sanitizeInput(lastName),
        email: sanitizeInput(email),
        tipCents,
        isGift,
        variantId: selectedVariant?.id || null,
        customPriceCents: isPwyw ? customPriceCents : null,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to create payment session")
    }

    return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId }
  }, [product.id, firstName, lastName, email, tipCents, isGift, selectedVariant, isPwyw, customPriceCents])

  // Initialize PaymentIntent when form is valid and product is not free
  useEffect(() => {
    if (!isFree && isFormValid && !clientSecret) {
      createPaymentIntent()
        .then(({ clientSecret: cs, paymentIntentId: piId }) => {
          setClientSecret(cs)
          setPaymentIntentId(piId)
        })
        .catch((err) => {
          console.error("Failed to initialize payment:", err)
        })
    }
  }, [isFree, isFormValid, clientSecret, createPaymentIntent])

  // Handle paid checkout with Stripe Elements
  const handlePaidCheckout = async (stripe: any, elements: any) => {
    if (!isFormValid) {
      if (!firstName.trim()) return setError("Please enter your first name")
      if (!lastName.trim()) return setError("Please enter your last name")
      if (!validateEmail(email)) return setError("Please enter a valid email address")
      if (!agreedToTerms) return setError("Please agree to the Terms and Conditions")
      return
    }

    if (isRateLimited()) {
      setError("Please wait a moment before trying again")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Get or create the PaymentIntent
      let secret = clientSecret
      let piId = paymentIntentId

      if (!secret) {
        const result = await createPaymentIntent()
        secret = result.clientSecret
        piId = result.paymentIntentId
        setClientSecret(secret)
        setPaymentIntentId(piId)
      }

      // Get the CardNumberElement
      const cardElement = elements.getElement(CardNumberElement)
      if (!cardElement) {
        throw new Error("Card input not ready. Please try again.")
      }

      // Confirm the payment with Stripe
      const { error: stripeError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: nameOnCard || `${firstName} ${lastName}`.trim(),
            email: email,
          },
        },
      })

      if (stripeError) {
        // Handle specific Stripe errors
        if (stripeError.type === "card_error" || stripeError.type === "validation_error") {
          setError(stripeError.message || "Your card was declined. Please try another card.")
        } else {
          setError("An unexpected error occurred. Please try again.")
        }
        return
      }

      if (confirmedIntent?.status === "succeeded") {
        // Payment succeeded - create the order on our backend
        const completeResponse = await fetch("/api/checkout/confirm-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": CSRF_TOKEN,
          },
          body: JSON.stringify({ paymentIntentId: piId }),
        })

        const completeData = await completeResponse.json()

        if (!completeResponse.ok) {
          throw new Error(completeData.error || "Failed to complete order")
        }

        // Redirect to receipt page
        router.push(`${completeData.redirectUrl}?emailSent=1`)
      } else if (confirmedIntent?.status === "requires_action") {
        // 3D Secure - Stripe handles this automatically
        setError("Additional authentication required. Please complete the verification.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process payment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (stripeInstance?: any, elementsInstance?: any) => {
    if (isFree) {
      handleFreeCheckout()
    } else if (stripeInstance && elementsInstance) {
      handlePaidCheckout(stripeInstance, elementsInstance)
    }
  }

  const handleApplyDiscount = () => {
    if (!discountCode.trim()) return
    setDiscountApplied(true)
    setDiscountPercent(10)
  }

  const handleRemoveDiscount = () => {
    setDiscountApplied(false)
    setDiscountPercent(0)
    setDiscountCode("")
  }

  // Stripe Elements appearance config
  const elementsOptions = useMemo(() => {
    if (!clientSecret) return undefined
    return {
      clientSecret,
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#000000",
          borderRadius: "12px",
        },
      },
    }
  }, [clientSecret])

  // ---------- RENDER ----------

  // Order summary and extras content (RIGHT column on desktop)
  const rightColumnContent = (
    <div className="space-y-5">
      {/* Order Summary - Desktop only */}
      <div className="hidden lg:block">
        <OrderSummaryContent
          product={product}
          creator={creator}
          selectedVariant={selectedVariant}
          subtotal={subtotal}
          tipCents={tipCents}
          discountApplied={discountApplied}
          discountCents={discountCents}
          total={total}
          isPwyw={isPwyw}
          formatPrice={formatPrice}
        />
      </div>

      {/* Discount Code - Desktop only */}
      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-400" />
          Discount code
        </h3>
        {discountApplied ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">{discountCode}</span>
              <span className="text-xs text-green-600">(-{discountPercent}%)</span>
            </div>
            <button
              type="button"
              onClick={handleRemoveDiscount}
              className="text-green-600 hover:text-green-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Enter discount code"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
            />
            <Button
              variant="outline"
              onClick={handleApplyDiscount}
              disabled={!discountCode.trim()}
              className="h-11 px-5 rounded-xl border-gray-200"
            >
              Apply
            </Button>
          </div>
        )}
      </section>

      {/* Tip Section - Desktop only */}
      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-pink-500 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900">Add a tip for {creator.name}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {tipOptions.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => { setTipAmount(amount); setCustomTip("") }}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                tipAmount === amount && !customTip
                  ? "bg-black text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {amount === 0 ? "None" : `$${amount}`}
            </button>
          ))}
          <Input
            type="number"
            placeholder="Other"
            value={customTip}
            className="w-24 h-10 rounded-full text-center border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
            min={0}
            step={0.5}
            onChange={(e) => {
              setCustomTip(e.target.value)
              setTipAmount(0)
            }}
          />
        </div>
      </section>

      {/* Gift Toggle - Desktop only */}
      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Gift className="h-5 w-5 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <Label htmlFor="gift-desktop" className="cursor-pointer text-sm font-semibold text-gray-900">
                Give as a gift?
              </Label>
              <p className="text-xs text-gray-400">Send to someone else via email</p>
            </div>
          </div>
          <Switch id="gift-desktop" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
        </div>
      </section>
    </div>
  )

  // Payment elements content (LEFT column on desktop, after product on mobile)
  const paymentElementsContent = !isFree ? (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <StripeCardForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        isFormValid={isFormValid}
        isFree={isFree}
        total={total}
        error={error}
        setError={setError}
        nameOnCard={nameOnCard}
        setNameOnCard={setNameOnCard}
        agreedToTerms={agreedToTerms}
        setAgreedToTerms={setAgreedToTerms}
      />
    </Elements>
  ) : (
    <>
      {/* Free product - just show button */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms-free"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          <Label htmlFor="terms-free" className="cursor-pointer text-sm leading-relaxed text-gray-600">
            I agree to the{" "}
            <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
              Terms and Conditions
            </Link>{" "}
            *
          </Label>
        </div>
      </div>

      <button
        type="button"
        onClick={handleFreeCheckout}
        disabled={isSubmitting || !isFormValid}
        className="mt-4 w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Get for Free
            <span className="ml-1">&rarr;</span>
          </>
        )}
      </button>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <a
            href={productUrl}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back to product</span>
          </a>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 sm:px-10 lg:px-16 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Mobile order summary toggle */}
        <div className="mb-4 lg:hidden">
          <OrderSummaryMobileToggle
            isOpen={mobileOrderOpen}
            onToggle={() => setMobileOrderOpen(!mobileOrderOpen)}
            total={total}
          />
          {mobileOrderOpen && (
            <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
              <OrderSummaryContent
                product={product}
                creator={creator}
                selectedVariant={selectedVariant}
                subtotal={subtotal}
                tipCents={tipCents}
                discountApplied={discountApplied}
                discountCents={discountCents}
                total={total}
                isPwyw={isPwyw}
                formatPrice={formatPrice}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* ===== LEFT COLUMN (50%) ===== */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">

            {/* Product Card - First on Desktop, Third on Mobile */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-2 lg:order-1">
              <div className="flex gap-4">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl bg-gray-100">
                  <div className="relative h-full w-full overflow-hidden rounded-xl">
                    {product.thumbnail_url ? (
                      <Image
                        src={product.thumbnail_url}
                        alt={product.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  {/* Quantity badge */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md z-10 ring-2 ring-white">
                    1
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base sm:text-lg text-gray-900 line-clamp-2">{product.title}</h2>
                      {selectedVariant && (
                        <p className="text-sm font-medium text-gray-600 mt-0.5">{selectedVariant.name}</p>
                      )}
                      <p className="text-sm text-gray-500 truncate mt-0.5">{creator.name}</p>
                    </div>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">
                      {subtotal === 0 ? "Free" : formatPrice(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {selectedVariant && (
                      <button
                        type="button"
                        onClick={() => setShowVariantModal(true)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-800 underline underline-offset-2 cursor-pointer transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <a
                      href={productUrl}
                      className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Remove
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* Contact Information - First on Mobile, Second on Desktop */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-1 lg:order-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs font-medium text-gray-600">First Name *</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs font-medium text-gray-600">Last Name *</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-gray-600">Email address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
                    required
                  />
                  <p className="text-xs text-gray-400">We&apos;ll send your download link to this email</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Country</Label>
                  <button
                    type="button"
                    onClick={() => setShowCountrySelector(true)}
                    className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      {CHECKOUT_COUNTRIES.find((item) => item.code === countryCode)?.name || "United States"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </section>

            {/* Payment Elements - Mobile: after product (order-3), Desktop: after VAT (order-4) */}
            <div className="order-3 lg:order-4">
              {paymentElementsContent}
            </div>

            {/* Discount Code - Mobile only (order-4) */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-4 lg:hidden">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                Discount code
              </h3>
              {discountApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{discountCode}</span>
                    <span className="text-xs text-green-600">(-{discountPercent}%)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    className="text-green-600 hover:text-green-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter discount code"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
                  />
                  <Button
                    variant="outline"
                    onClick={handleApplyDiscount}
                    disabled={!discountCode.trim()}
                    className="h-11 px-5 rounded-xl border-gray-200"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </section>

            {/* Tip Section - Mobile only (order-5) */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-5 lg:hidden">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="h-4 w-4 text-pink-500 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-900">Add a tip for {creator.name}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => { setTipAmount(amount); setCustomTip("") }}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                      tipAmount === amount && !customTip
                        ? "bg-black text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {amount === 0 ? "None" : `$${amount}`}
                  </button>
                ))}
                <Input
                  type="number"
                  placeholder="Other"
                  value={customTip}
                  className="w-24 h-10 rounded-full text-center border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
                  min={0}
                  step={0.5}
                  onChange={(e) => {
                    setCustomTip(e.target.value)
                    setTipAmount(0)
                  }}
                />
              </div>
            </section>

            {/* Gift Toggle - Mobile only (order-6) */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-6 lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Gift className="h-5 w-5 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor="gift" className="cursor-pointer text-sm font-semibold text-gray-900">
                      Give as a gift?
                    </Label>
                    <p className="text-xs text-gray-400">Send to someone else via email</p>
                  </div>
                </div>
                <Switch id="gift" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
              </div>
            </section>

            {/* Business VAT ID - Mobile: order-7 (last), Desktop: order-3 (before payment) */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-7 lg:order-3">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Business VAT ID (optional)</h3>
              <Input
                placeholder="e.g. DE123456789"
                value={vatId}
                onChange={(e) => setVatId(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
              />
              <p className="text-xs text-gray-400 mt-1.5">Only required for EU B2B transactions</p>
            </section>
          </div>

          {/* ===== RIGHT COLUMN (50%, sticky) ===== */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-6">
            {rightColumnContent}
          </div>
        </div>
      </div>

      {/* Mobile sticky pay button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 z-50" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="pt-3">
          <button
            type="button"
            disabled={isSubmitting || !isFormValid}
            className="w-full flex items-center justify-center gap-2 h-13 rounded-2xl text-base font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : isFree ? (
              <>Get for Free &rarr;</>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Pay {formatPrice(total)}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom padding for mobile sticky button */}
      <div className="lg:hidden h-20" />

      {/* Variant Selection Modal */}
      {showVariantModal && selectedVariant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVariantModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Select variant</h3>
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-black bg-gray-50">
                <div className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{selectedVariant.name}</p>
                  {selectedVariant.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{selectedVariant.description}</p>
                  )}
                </div>
                <span className="font-semibold text-gray-900 whitespace-nowrap">
                  {selectedVariant.priceCents === 0 ? "Free" : formatPrice(selectedVariant.priceCents)}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="w-full h-11 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold transition-colors cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Country selector modal/sheet */}
      {showCountrySelector && !isMobileViewport && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCountrySelector(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Select country</h3>
            <div className="max-h-[60vh] overflow-y-auto space-y-1">
              {CHECKOUT_COUNTRIES.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => { setCountryCode(country.code); setShowCountrySelector(false) }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${countryCode === country.code ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {country.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`lg:hidden fixed inset-0 z-[90] ${showCountrySelector && isMobileViewport ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div
          onClick={() => setShowCountrySelector(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${showCountrySelector && isMobileViewport ? "opacity-100" : "opacity-0"}`}
        />
        <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl border-t border-gray-200 p-4 max-h-[72vh] overflow-y-auto transition-transform duration-300 ${showCountrySelector && isMobileViewport ? "translate-y-0" : "translate-y-full"}`}>
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
          <h3 className="text-base font-semibold text-gray-900 mb-3">Select country</h3>
          <div className="space-y-1 pb-4">
            {CHECKOUT_COUNTRIES.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => { setCountryCode(country.code); setShowCountrySelector(false) }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${countryCode === country.code ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {country.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Order Summary Sub-component ----------
function OrderSummaryContent({
  product,
  creator,
  selectedVariant,
  subtotal,
  tipCents,
  discountApplied,
  discountCents,
  total,
  isPwyw,
  formatPrice,
}: {
  product: CheckoutPageClientProps["product"]
  creator: CheckoutPageClientProps["creator"]
  selectedVariant?: SelectedVariant | null
  subtotal: number
  tipCents: number
  discountApplied: boolean
  discountCents: number
  total: number
  isPwyw?: boolean
  formatPrice: (cents: number) => string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Order summary</h3>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {product.thumbnail_url ? (
            <Image
              src={product.thumbnail_url}
              alt={product.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-5 w-5 text-gray-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
          {selectedVariant && (
            <p className="text-xs text-gray-500">{selectedVariant.name}</p>
          )}
        </div>
        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
          {subtotal === 0 ? "Free" : formatPrice(subtotal)}
        </span>
      </div>

      <Separator className="my-3" />

      <div className="space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{isPwyw ? "Your price" : "Subtotal"}</span>
          <span className="text-gray-900">{formatPrice(subtotal)}</span>
        </div>

        {discountApplied && discountCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600">Discount</span>
            <span className="text-green-600 font-medium">-{formatPrice(discountCents)}</span>
          </div>
        )}

        {tipCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tip</span>
            <span className="text-gray-900">{formatPrice(tipCents)}</span>
          </div>
        )}
      </div>

      <Separator className="my-3" />

      <div className="flex justify-between">
        <span className="text-base font-semibold text-gray-900">Total</span>
        <span className="text-lg font-bold text-gray-900">{formatPrice(total)}</span>
      </div>
    </div>
  )
}
