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
  Globe,
  Search,
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
  country: "checkout_country",
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

// ---------- Country list ----------
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "EE", name: "Estonia" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "MT", name: "Malta" },
  { code: "LU", name: "Luxembourg" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "NZ", name: "New Zealand" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "KE", name: "Kenya" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "IS", name: "Iceland" },
  { code: "PR", name: "Puerto Rico" },
  { code: "PA", name: "Panama" },
  { code: "CR", name: "Costa Rica" },
  { code: "EC", name: "Ecuador" },
  { code: "UY", name: "Uruguay" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
]

// ---------- SVG Icons ----------
function GooglePayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g>
        <path d="M19.526 8.568v5.103h-1.651V.271h4.388c1.068 0 2.078.413 2.826 1.147.761.748 1.189 1.759 1.189 2.84 0 1.08-.428 2.091-1.189 2.839-.748.734-1.758 1.147-2.826 1.147h-2.737v.324zm0-6.627v5.03h2.763c.721 0 1.401-.285 1.908-.799.52-.52.811-1.214.811-1.947 0-.732-.291-1.427-.811-1.947-.507-.514-1.187-.799-1.908-.799h-2.763v.462z" fill="#5F6368"/>
        <path d="M30.858 5.763c1.228 0 2.197.338 2.905.962.721.637 1.081 1.516 1.081 2.645v5.301h-1.57v-1.201h-.069c-.679 1.011-1.596 1.516-2.75 1.516-1.011 0-1.866-.31-2.565-.93-.693-.62-1.04-1.406-1.04-2.358 0-.979.36-1.752 1.081-2.317.721-.565 1.651-.848 2.791-.848 1.011 0 1.842.203 2.496.607v-.427c0-.607-.262-1.188-.734-1.627-.472-.438-1.054-.662-1.733-.662-.965 0-1.733.42-2.303 1.255l-1.461-.924c.858-1.188 2.142-1.787 3.843-1.787l.028-.006zm-2.195 6.627c0 .482.22.924.607 1.228.386.31.858.472 1.392.472.748 0 1.461-.351 1.974-.965.525-.62.786-1.322.786-2.105-.565-.482-1.364-.721-2.398-.721-.734 0-1.364.2-1.88.593-.514.393-.771.896-.771 1.498h.29z" fill="#5F6368"/>
        <path d="M44 6.078l-6.048 13.805h-1.706l2.243-4.846-4.039-8.959h1.815l2.966 6.927h.041l2.905-6.927H44z" fill="#5F6368"/>
        <path d="M11.05 6.713c0-.565-.048-1.13-.138-1.682H5.64v3.177h3.025c-.131.7-.527 1.344-1.116 1.758v2.063h1.803c1.054-.972 1.662-2.403 1.662-4.109l.036-.207z" fill="#4285F4"/>
        <path d="M5.64 13.776c1.51 0 2.777-.496 3.703-1.351l-1.803-2.063c-.5.338-1.143.537-1.9.537-1.461 0-2.701-1.011-3.143-2.371H.649v2.063c.917 1.814 2.791 3.064 4.991 3.064v.121z" fill="#34A853"/>
        <path d="M2.497 8.528c-.234-.7-.234-1.461 0-2.161V4.304H.649c-.772 1.53-.772 3.322 0 4.852l1.848-2.063v.435z" fill="#FBBC04"/>
        <path d="M5.64 3.256c.803-.014 1.579.283 2.147.827l1.606-1.606C8.431 1.579 7.064.934 5.64.948c-2.2 0-4.074 1.25-4.991 3.064l1.848 2.063c.442-1.36 1.682-2.371 3.143-2.371v.552z" fill="#EA4335"/>
      </g>
    </svg>
  )
}

function PayPalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="24" fontFamily="Verdana, Arial, sans-serif" fontSize="22" fontWeight="bold" fill="#003087">Pay</text>
      <text x="36" y="24" fontFamily="Verdana, Arial, sans-serif" fontSize="22" fontWeight="bold" fill="#009cde">Pal</text>
    </svg>
  )
}

// ---------- Skeleton Loader ----------
function CheckoutSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="h-4 w-32 bg-gray-200 rounded mb-4 mx-auto" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 bg-gray-100 rounded-xl" />
          <div className="h-12 bg-gray-100 rounded-xl" />
        </div>
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <div className="h-3 w-28 bg-gray-200 rounded" />
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-gray-200 rounded" />
          <div className="h-11 bg-gray-100 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-11 bg-gray-100 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-11 bg-gray-100 rounded-xl" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-gray-200 rounded" />
          <div className="h-11 bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ---------- Country Selector ----------
function CountrySelector({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  const selectedCountry = COUNTRIES.find((c) => c.code === value)
  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (code: string) => {
    onChange(code)
    setIsOpen(false)
    setSearch("")
  }

  // Touch drag for mobile bottom sheet
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = e.touches[0].clientY - dragStartY.current
    if (diff > 0) setDragY(diff)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    if (dragY > 120) {
      setIsOpen(false)
      setSearch("")
    }
    setDragY(0)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between h-11 px-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors text-sm cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-400" />
          <span className={selectedCountry ? "text-gray-900" : "text-gray-400"}>
            {selectedCountry ? selectedCountry.name : "Select country"}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => { setIsOpen(false); setSearch("") }}
          />

          {/* Mobile: bottom sheet */}
          <div
            ref={sheetRef}
            className="lg:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col"
            style={{ transform: dragY > 0 ? `translateY(${dragY}px)` : undefined, transition: isDragging ? "none" : "transform 0.3s ease-out" }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-4 pb-3">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Select country</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {filtered.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country.code)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors cursor-pointer ${
                    value === country.code ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 text-left">{country.name}</span>
                  <span className="text-xs text-gray-400">{country.code}</span>
                  {value === country.code && <Check className="w-4 h-4 text-gray-900" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No countries found</p>
              )}
            </div>
          </div>

          {/* Desktop: centered modal */}
          <div className="hidden lg:flex items-center justify-center h-full p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Select country</h3>
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setSearch("") }}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="px-4 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search countries..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3">
                {filtered.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelect(country.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                      value === country.code ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex-1 text-left">{country.name}</span>
                    <span className="text-xs text-gray-400">{country.code}</span>
                    {value === country.code && <Check className="w-4 h-4 text-gray-900" />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No countries found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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
    if (!agreedToTerms) {
      setError("Please agree to the Terms and Conditions")
      return
    }
    onSubmit(stripe, elements)
  }

  return (
    <>
      {/* Payment Methods Express Buttons */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Express checkout</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid || !agreedToTerms || !stripe}
              className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GooglePayIcon className="h-6 w-auto" />
            </button>
            <div className="relative group">
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-[#FFC439] text-[#003087] text-sm font-bold cursor-not-allowed transition-all"
              >
                <PayPalIcon className="h-6 w-auto" />
              </button>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-xl pointer-events-none">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Expiration date</Label>
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                <CardExpiryElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={(e) => setCardComplete(prev => ({ ...prev, cardExpiry: e.complete }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Security code</Label>
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                <CardCvcElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={(e) => setCardComplete(prev => ({ ...prev, cardCvc: e.complete }))}
                  className="w-full"
                />
              </div>
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

      {/* Terms & Conditions - Above Pay button */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
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
        disabled={isSubmitting || !isFormValid || !agreedToTerms || (!isFree && !isCardComplete) || !stripe}
        className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
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
    </>
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
  const [country, setCountry] = useState(() => loadSessionField(SESSION_KEYS.country) || "US")
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
  const [stripeReady, setStripeReady] = useState(false)

  const lastSubmitTime = useRef(0)

  // Persist form fields
  useEffect(() => { saveSessionField(SESSION_KEYS.firstName, firstName) }, [firstName])
  useEffect(() => { saveSessionField(SESSION_KEYS.lastName, lastName) }, [lastName])
  useEffect(() => { saveSessionField(SESSION_KEYS.email, email) }, [email])
  useEffect(() => { saveSessionField(SESSION_KEYS.vatId, vatId) }, [vatId])
  useEffect(() => { saveSessionField(SESSION_KEYS.discountCode, discountCode) }, [discountCode])
  useEffect(() => { saveSessionField(SESSION_KEYS.country, country) }, [country])

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

  // Contact validation: does NOT require agreedToTerms so PaymentIntent can be created early
  const isContactValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      validateEmail(email)
    )
  }, [firstName, lastName, email])

  // Full form validation: includes terms for payment submission
  const isFormValid = useMemo(() => {
    return isContactValid && agreedToTerms
  }, [isContactValid, agreedToTerms])

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

  // Initialize PaymentIntent when contact info is valid (NOT requiring agreedToTerms)
  // This fixes infinite loading - Elements get clientSecret before terms are checked
  useEffect(() => {
    if (!isFree && isContactValid && !clientSecret) {
      createPaymentIntent()
        .then(({ clientSecret: cs, paymentIntentId: piId }) => {
          setClientSecret(cs)
          setPaymentIntentId(piId)
          setStripeReady(true)
        })
        .catch((err) => {
          console.error("Failed to initialize payment:", err)
          // Set stripeReady to true even on error to stop showing skeleton
          setStripeReady(true)
        })
    }
  }, [isFree, isContactValid, clientSecret, createPaymentIntent])

  // If product is free, mark stripe as ready immediately
  useEffect(() => {
    if (isFree) setStripeReady(true)
  }, [isFree])

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
                  ? "bg-[#2563eb] text-white shadow-sm"
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
    clientSecret && elementsOptions ? (
      <Elements stripe={stripePromise} options={elementsOptions}>
        <StripeCardForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isFormValid={isContactValid}
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
      /* Skeleton loader while Stripe Elements are loading */
      <div className="space-y-4">
        <CheckoutSkeleton />
        {/* Terms checkbox still shown during loading */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms-loading"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
              className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
            />
            <Label htmlFor="terms-loading" className="cursor-pointer text-sm leading-relaxed text-gray-600">
              I agree to the{" "}
              <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
                Terms and Conditions
              </Link>{" "}
              *
            </Label>
          </div>
        </div>
        {/* Disabled pay button during loading */}
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-not-allowed opacity-60 bg-[#2563eb] text-white shadow-lg shadow-blue-500/20"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading payment...
        </button>
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
        className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
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
        {/* Mobile order summary toggle - open by default */}
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
          {/* Desktop: Contact info, Product, VAT, Express Checkout + Card fields */}
          {/* Mobile: Contact info (order-1), Product (order-2), Payment (order-3), extras (order-4+) */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">

            {/* Contact Information - First on BOTH mobile and desktop */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-1 lg:order-1">
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
                  <CountrySelector value={country} onChange={setCountry} />
                </div>
              </div>
            </section>

            {/* Product Card - Second on BOTH mobile and desktop */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-2 lg:order-2">
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

            {/* Business VAT ID - Desktop: order-3 (before payment), Mobile: order-7 (last) */}
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

            {/* Payment Elements - Mobile: order-3, Desktop: order-4 (after VAT) */}
            <div className="order-3 lg:order-4">
              {paymentElementsContent}
            </div>

            {/* Discount Code - Mobile only (order-4) */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-4">
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
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-5">
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
                        ? "bg-[#2563eb] text-white shadow-sm"
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
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-6">
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
                className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold transition-colors cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
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
