"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { nativeLogOut } from "@/lib/native-bridge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SmartLink } from "@/components/smart-link"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  X, Check, Loader2, AlertCircle, Mail, Lock,
  CreditCard, Store, Shield, Settings, Wallet, Landmark,
  Camera, ExternalLink, ChevronRight, Globe,
  User, Palette, Link2, FileText, Search, ChevronLeft, Upload, Pencil,
  ToggleLeft, LogOut, Trash2, Languages, Info, ChevronDown, CheckCircle, Clock, Copy, Plus
} from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getLinksShareUrl, getLinksUrl, getStoreShareUrl, getStoreUrl, getStoreUrlDisplay } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { useLanguage, LANGUAGES } from "@/lib/i18n"

function ChainLinkIcon({ className = "w-3 h-3", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0002 13C10.4297 13.5741 10.9776 14.0491 11.6067 14.3929C12.2359 14.7367 12.9317 14.9411 13.6468 14.9923C14.362 15.0435 15.0798 14.9403 15.7515 14.6897C16.4233 14.4392 17.0333 14.047 17.5402 13.54L20.5402 10.54C21.451 9.59695 21.955 8.33394 21.9436 7.02296C21.9322 5.71198 21.4063 4.45791 20.4793 3.53087C19.5523 2.60383 18.2982 2.07799 16.9872 2.0666C15.6762 2.0552 14.4132 2.55918 13.4702 3.46997L11.7502 5.17997M14.0002 11C13.5707 10.4258 13.0228 9.95078 12.3936 9.60703C11.7645 9.26327 11.0687 9.05885 10.3535 9.00763C9.63841 8.95641 8.92061 9.0596 8.24885 9.31018C7.5771 9.56077 6.96709 9.9529 6.4602 10.46L3.4602 13.46C2.54941 14.403 2.04544 15.666 2.05683 16.977C2.06822 18.288 2.59407 19.542 3.52111 20.4691C4.44815 21.3961 5.70221 21.9219 7.01319 21.9333C8.32418 21.9447 9.58719 21.4408 10.5302 20.53L12.2402 18.82"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Countries list
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
  { code: "RU", name: "Russia" },
  { code: "UA", name: "Ukraine" },
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
].sort((a, b) => a.name.localeCompare(b.name))

// Timezone list - comprehensive list of major timezones
const TIMEZONES = [
  { code: "UTC", name: "UTC (Coordinated Universal Time)", offset: "+00:00" },
  { code: "America/New_York", name: "Eastern Time (US & Canada)", offset: "-05:00" },
  { code: "America/Chicago", name: "Central Time (US & Canada)", offset: "-06:00" },
  { code: "America/Denver", name: "Mountain Time (US & Canada)", offset: "-07:00" },
  { code: "America/Los_Angeles", name: "Pacific Time (US & Canada)", offset: "-08:00" },
  { code: "America/Anchorage", name: "Alaska", offset: "-09:00" },
  { code: "Pacific/Honolulu", name: "Hawaii", offset: "-10:00" },
  { code: "America/Phoenix", name: "Arizona", offset: "-07:00" },
  { code: "America/Toronto", name: "Toronto", offset: "-05:00" },
  { code: "America/Vancouver", name: "Vancouver", offset: "-08:00" },
  { code: "America/Mexico_City", name: "Mexico City", offset: "-06:00" },
  { code: "America/Bogota", name: "Bogotá", offset: "-05:00" },
  { code: "America/Lima", name: "Lima", offset: "-05:00" },
  { code: "America/Santiago", name: "Santiago", offset: "-04:00" },
  { code: "America/Sao_Paulo", name: "São Paulo", offset: "-03:00" },
  { code: "America/Buenos_Aires", name: "Buenos Aires", offset: "-03:00" },
  { code: "Europe/London", name: "London", offset: "+00:00" },
  { code: "Europe/Dublin", name: "Dublin", offset: "+00:00" },
  { code: "Europe/Lisbon", name: "Lisbon", offset: "+00:00" },
  { code: "Europe/Paris", name: "Paris", offset: "+01:00" },
  { code: "Europe/Berlin", name: "Berlin", offset: "+01:00" },
  { code: "Europe/Amsterdam", name: "Amsterdam", offset: "+01:00" },
  { code: "Europe/Brussels", name: "Brussels", offset: "+01:00" },
  { code: "Europe/Madrid", name: "Madrid", offset: "+01:00" },
  { code: "Europe/Rome", name: "Rome", offset: "+01:00" },
  { code: "Europe/Zurich", name: "Zurich", offset: "+01:00" },
  { code: "Europe/Vienna", name: "Vienna", offset: "+01:00" },
  { code: "Europe/Stockholm", name: "Stockholm", offset: "+01:00" },
  { code: "Europe/Oslo", name: "Oslo", offset: "+01:00" },
  { code: "Europe/Copenhagen", name: "Copenhagen", offset: "+01:00" },
  { code: "Europe/Warsaw", name: "Warsaw", offset: "+01:00" },
  { code: "Europe/Prague", name: "Prague", offset: "+01:00" },
  { code: "Europe/Budapest", name: "Budapest", offset: "+01:00" },
  { code: "Europe/Helsinki", name: "Helsinki", offset: "+02:00" },
  { code: "Europe/Athens", name: "Athens", offset: "+02:00" },
  { code: "Europe/Bucharest", name: "Bucharest", offset: "+02:00" },
  { code: "Europe/Kiev", name: "Kyiv", offset: "+02:00" },
  { code: "Europe/Moscow", name: "Moscow", offset: "+03:00" },
  { code: "Europe/Istanbul", name: "Istanbul", offset: "+03:00" },
  { code: "Asia/Dubai", name: "Dubai", offset: "+04:00" },
  { code: "Asia/Karachi", name: "Karachi", offset: "+05:00" },
  { code: "Asia/Kolkata", name: "Mumbai, Kolkata, New Delhi", offset: "+05:30" },
  { code: "Asia/Dhaka", name: "Dhaka", offset: "+06:00" },
  { code: "Asia/Bangkok", name: "Bangkok", offset: "+07:00" },
  { code: "Asia/Jakarta", name: "Jakarta", offset: "+07:00" },
  { code: "Asia/Singapore", name: "Singapore", offset: "+08:00" },
  { code: "Asia/Hong_Kong", name: "Hong Kong", offset: "+08:00" },
  { code: "Asia/Shanghai", name: "Beijing, Shanghai", offset: "+08:00" },
  { code: "Asia/Taipei", name: "Taipei", offset: "+08:00" },
  { code: "Asia/Seoul", name: "Seoul", offset: "+09:00" },
  { code: "Asia/Tokyo", name: "Tokyo", offset: "+09:00" },
  { code: "Australia/Perth", name: "Perth", offset: "+08:00" },
  { code: "Australia/Adelaide", name: "Adelaide", offset: "+09:30" },
  { code: "Australia/Brisbane", name: "Brisbane", offset: "+10:00" },
  { code: "Australia/Sydney", name: "Sydney", offset: "+10:00" },
  { code: "Australia/Melbourne", name: "Melbourne", offset: "+10:00" },
  { code: "Pacific/Auckland", name: "Auckland", offset: "+12:00" },
  { code: "Pacific/Fiji", name: "Fiji", offset: "+12:00" },
  { code: "Africa/Cairo", name: "Cairo", offset: "+02:00" },
  { code: "Africa/Johannesburg", name: "Johannesburg", offset: "+02:00" },
  { code: "Africa/Lagos", name: "Lagos", offset: "+01:00" },
  { code: "Africa/Nairobi", name: "Nairobi", offset: "+03:00" },
]

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "privacy", label: "Privacy", icon: ToggleLeft },
  { id: "stores", label: "Stores", icon: Store },
] as const

type TabId = typeof TABS[number]["id"]
const TAB_IDS: TabId[] = ["general", "security", "payments", "billing", "domains", "privacy", "stores"]

interface SettingsFormProps {
  profile: Profile & {
    cover_url?: string
    first_name?: string
    last_name?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    display_name?: string
    username?: string
  }
  creator: Creator & {
    store_published?: boolean
    brand_color?: string
    cover_url?: string
    support_email?: string | null
    statement_descriptor?: string | null
    payout_currency?: string | null
    slug?: string
  }
  storeBuilderAvatarUrl?: string | null
  onepageAvatarUrl?: string | null
  googleAvatarUrl?: string | null
  initialTab?: TabId
}

// Mobile Bottom Sheet Component
function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleBarRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Refs for native non-passive touch handlers (avoids stale closures)
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)
  const scrollYRef = useRef(0)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      scrollYRef.current = window.scrollY
      // Lock scroll without position:fixed to prevent layout shifts on iOS Capacitor.
      // position:fixed on body causes the sticky black platform header to jump and
      // create extra black space above it. overflow:hidden is sufficient here because
      // the sheet overlay already blocks all touch-through, and CapacitorBounceGuard
      // handles rubber-band prevention at the document level.
      document.documentElement.style.overflow = "hidden"
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = "none"
      document.body.style.overscrollBehavior = "none"
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        document.documentElement.style.overflow = ""
        document.body.style.overflow = ""
        document.documentElement.style.overscrollBehavior = ""
        document.body.style.overscrollBehavior = ""
        setIsVisible(false)
        setDragY(0)
        dragYRef.current = 0
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.documentElement.style.overflow = ""
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ""
      document.body.style.overscrollBehavior = ""
    }
  }, [isOpen, isVisible])

  // Attach non-passive touchmove on the handle bar so preventDefault() actually works
  useEffect(() => {
    const handle = handleBarRef.current
    if (!handle || !isVisible) return
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return
      const diff = e.touches[0].clientY - startYRef.current
      if (diff > 0) {
        e.preventDefault()
        const newDrag = diff * 0.8
        dragYRef.current = newDrag
        setDragY(newDrag)
      }
    }
    handle.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => handle.removeEventListener("touchmove", onTouchMove)
  }, [isVisible])

  // Prevent the backdrop overlay from letting touch events reach the page below
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !isVisible) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    overlay.addEventListener("touchmove", prevent, { passive: false })
    return () => overlay.removeEventListener("touchmove", prevent)
  }, [isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    dragYRef.current = 0
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY
    isDraggingRef.current = true
    setIsDragging(true)
  }

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    if (dragYRef.current > 80) {
      handleClose()
    } else {
      setDragY(0)
      dragYRef.current = 0
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: "none" }}>
      <div
        ref={overlayRef}
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-400 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      {/* Desktop Modal */}
      <div className="hidden sm:flex fixed inset-0 items-center justify-center p-4">
        <div
          className={`relative bg-white rounded-2xl w-full max-w-md shadow-xl transition-all duration-400 ${
            isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", touchAction: "auto" }}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">{title}</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>{children}</div>
        </div>
      </div>
      {/* Mobile Bottom Sheet */}
      <div
        ref={sheetRef}
        className="sm:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-hidden"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
          touchAction: "none",
        }}
      >
        {/* Handle bar — drag target; native non-passive listener handles move */}
        <div
          ref={handleBarRef}
          className="pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: "none" }}
        >
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto overscroll-contain max-h-[calc(90vh-60px)]" style={{ touchAction: "pan-y" }}>
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">{title}</h3>
          {children}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

// Country Selector Modal
function CountrySelectorModal({
  isOpen,
  onClose,
  selectedCountry,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  selectedCountry: string
  onSelect: (country: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Check if mobile
    setIsMobile(window.innerWidth < 768)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("")
      // Only auto-focus on desktop to prevent keyboard popup on mobile
      if (!isMobile) {
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
    }
  }, [isOpen, isMobile])

  const filteredCountries = COUNTRIES.filter(
    (country) =>
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = (countryName: string) => {
    onSelect(countryName)
    onClose()
  }

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} title="Select Country">
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search countries..."
            readOnly={isMobile}
            onFocus={(e) => {
              if (isMobile) {
                e.currentTarget.readOnly = false
              }
            }}
            className="w-full h-11 pl-10 pr-4 border border-[#e5e7eb] rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
          />
        </div>

        {/* Countries List */}
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {filteredCountries.length === 0 ? (
            <p className="text-center text-[13px] text-[#6b7280] py-4">No countries found</p>
          ) : (
            <div className="space-y-1">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => handleSelect(country.name)}
                  className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${
                    selectedCountry === country.name
                      ? "bg-[#f5f3ff] text-[#8b5cf6]"
                      : "text-[#374151] hover:bg-[#f3f4f6] active:bg-[#e5e7eb]"
                  }`}
                >
                  <span>{country.name}</span>
                  {selectedCountry === country.name && (
                    <Check className="h-4 w-4 text-[#8b5cf6]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileBottomSheet>
  )
}

// Image Crop Modal (similar to OnePage)
function ImageCropModal({
  isOpen,
  onClose,
  tempImageUrl,
  onSave,
  isSaving,
}: {
  isOpen: boolean
  onClose: () => void
  tempImageUrl: string | null
  onSave: (croppedBlob: Blob) => void
  isSaving: boolean
}) {
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Prevent pull-to-refresh when crop modal is open
  useEffect(() => {
    if (isOpen) {
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
    } else {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
    return () => {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (tempImageUrl && isOpen) {
      const img = new window.Image()
      img.onload = () => {
        const containerSize = 300
        const scale = Math.min(containerSize / img.width, containerSize / img.height)
        const displayWidth = img.width * scale
        const displayHeight = img.height * scale
        setImageSize({ width: displayWidth, height: displayHeight })

        const initialSize = Math.min(displayWidth, displayHeight) * 0.8
        setCropBox({
          x: (displayWidth - initialSize) / 2,
          y: (displayHeight - initialSize) / 2,
          size: initialSize,
        })
      }
      img.src = tempImageUrl
    }
  }, [tempImageUrl, isOpen])

  const handleCropMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    setIsDragging(true)
    setDragStart({ x: clientX - cropBox.x, y: clientY - cropBox.y })
  }

  const handleResizeMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    setIsResizing(true)
    setDragStart({ x: clientX, y: clientY })
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

      if (isDragging) {
        const newX = clientX - dragStart.x
        const newY = clientY - dragStart.y

        const maxX = imageSize.width - cropBox.size
        const maxY = imageSize.height - cropBox.size

        setCropBox((prev) => ({
          ...prev,
          x: Math.max(0, Math.min(maxX, newX)),
          y: Math.max(0, Math.min(maxY, newY)),
        }))
      } else if (isResizing) {
        const deltaX = clientX - dragStart.x
        const deltaY = clientY - dragStart.y
        const delta = Math.max(deltaX, deltaY)
        setCropBox((prev) => {
          const newSize = Math.max(50, Math.min(Math.min(imageSize.width - prev.x, imageSize.height - prev.y), prev.size + delta))
          return { ...prev, size: newSize }
        })
        setDragStart({ x: clientX, y: clientY })
      }
    },
    [isDragging, isResizing, dragStart, cropBox.size, imageSize]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      window.addEventListener("touchmove", handleMouseMove, { passive: false })
      window.addEventListener("touchend", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
        window.removeEventListener("touchmove", handleMouseMove)
        window.removeEventListener("touchend", handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  const handleSave = async () => {
    if (!tempImageUrl) return

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new window.Image()

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = tempImageUrl
    })

    const containerSize = 300
    const scale = Math.min(containerSize / img.width, containerSize / img.height)

    const actualX = cropBox.x / scale
    const actualY = cropBox.y / scale
    const actualSize = cropBox.size / scale

    const outputSize = 800
    canvas.width = outputSize
    canvas.height = outputSize

    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, actualX, actualY, actualSize, actualSize, 0, 0, outputSize, outputSize)
    }

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onSave(blob)
        }
      },
      "image/jpeg",
      0.95
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
          <div className="flex items-center p-4 border-b border-[#e5e7eb]">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-[18px] font-semibold text-[#1a1a2e] flex-1 text-center pr-8">Crop Image</h2>
          </div>
          <div className="p-5 space-y-4">
            {tempImageUrl && (
              <>
                <div
                  ref={containerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden"
                  style={{ width: "300px", height: "300px" }}
                >
                  <img
                    src={tempImageUrl}
                    alt="Preview"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={{
                      width: imageSize.width,
                      height: imageSize.height,
                      maxWidth: "300px",
                      maxHeight: "300px",
                      objectFit: "contain",
                    }}
                    draggable={false}
                  />

                  {/* Crop box */}
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: `${150 - imageSize.width / 2 + cropBox.x}px`,
                      top: `${150 - imageSize.height / 2 + cropBox.y}px`,
                      width: `${cropBox.size}px`,
                      height: `${cropBox.size}px`,
                      border: "2px solid #8b5cf6",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                      borderRadius: "50%",
                    }}
                    onMouseDown={handleCropMouseDown}
                    onTouchStart={handleCropMouseDown}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none rounded-full overflow-hidden">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/20" />
                      ))}
                    </div>

                    {/* Resize handle - larger touch target for mobile */}
                    <div
                      className="absolute -bottom-3 -right-3 w-8 h-8 flex items-center justify-center cursor-se-resize touch-none"
                      onMouseDown={handleResizeMouseDown}
                      onTouchStart={handleResizeMouseDown}
                    >
                      <div className="w-5 h-5 bg-[#8b5cf6] border-2 border-white rounded-full shadow-lg" />
                    </div>
                  </div>
                </div>

                <p className="text-[12px] text-center text-[#6b7280]">Drag to move, drag corner to resize</p>

                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 h-11 text-[14px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 h-11 text-[14px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Image Upload Modal
function ImageUploadModal({
  isOpen,
  onClose,
  onFileSelect,
  fileInputRef,
}: {
  isOpen: boolean
  onClose: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}) {
  // Prevent pull-to-refresh when modal is open
  useEffect(() => {
    if (isOpen) {
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
    } else {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
    return () => {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Upload Photo</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#e5e7eb] rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#8b5cf6] hover:bg-[#faf5ff] transition-colors"
            >
              <Upload className="h-12 w-12 text-[#9ca3af] mb-4" />
              <p className="font-medium text-[#374151] text-[14px]">Select file to upload</p>
              <p className="text-[13px] text-[#6b7280] mt-1">or drag-and-drop</p>
              <p className="text-[12px] text-[#9ca3af] mt-2">JPG, PNG or GIF. Max 2MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelect}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsFormNew({ profile, creator, storeBuilderAvatarUrl, onepageAvatarUrl, googleAvatarUrl, initialTab = "general" }: SettingsFormProps) {
  const router = useRouter()
  const { language: currentLanguage, setLanguage, t } = useLanguage()
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const initialLanguage = useRef(currentLanguage)

  // Timezone state - auto-detect from browser, then allow manual change
  const detectTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      return "UTC"
    }
  }
  const [selectedTimezone, setSelectedTimezone] = useState(() => {
    // First check if stored in localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('storelib_timezone')
      if (stored) return stored
    }
    // Then check profile data
    if (profile && (profile as any).timezone) return (profile as any).timezone
    // Auto-detect from browser
    return detectTimezone()
  })
  const [showTimezoneModal, setShowTimezoneModal] = useState(false)
  const initialTimezone = useRef(selectedTimezone)

  // Support Email state - for customer receipts
  const [supportEmail, setSupportEmail] = useState(creator?.support_email || "")
  const initialSupportEmail = useRef(supportEmail)

  const normalizeStatementDescriptor = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .slice(0, 22)

  const defaultStatementDescriptor = normalizeStatementDescriptor(
    (creator?.statement_descriptor || profile?.username || (creator as any)?.display_name || "STORE").trim()
  )

  const [payoutCurrency, setPayoutCurrency] = useState((creator as any)?.payout_currency || "USD")
  const [statementDescriptor, setStatementDescriptor] = useState(defaultStatementDescriptor)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const initialPayoutCurrency = useRef(payoutCurrency)
  const initialStatementDescriptor = useRef(statementDescriptor)

  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; status: string; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; accountId?: string | null }>({ connected: false, status: "not_connected" })
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false)
  const [stripeBusy, setStripeBusy] = useState<"connect" | "disconnect" | null>(null)
  const [showStripeManage, setShowStripeManage] = useState(false)
  const [stripeBankInfo, setStripeBankInfo] = useState<{ bankName: string | null; last4: string; currency: string; status: string | null } | null>(null)
  const [stripeBankLoading, setStripeBankLoading] = useState(false)
  const [stripePayoutInfo, setStripePayoutInfo] = useState<{ payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[]; requirementsPastDue: string[] } | null>(null)

  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const tabNavRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [isTabLoading, setIsTabLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectHelpUrl, setConnectHelpUrl] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  // Subscription plan (for feature gating)
  const [userPlan, setUserPlan] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(true)

  // Domain state
  const [domains, setDomains] = useState<any[]>([])
  const [domainsLoading, setDomainsLoading] = useState(false)
  const [domainInput, setDomainInput] = useState("")
  const [domainAdding, setDomainAdding] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainInfo, setDomainInfo] = useState<string | null>(null)
  const [lastVerifyDomainId, setLastVerifyDomainId] = useState<string | null>(null)
  const [domainVerifying, setDomainVerifying] = useState<string | null>(null)
  const [domainRemoving, setDomainRemoving] = useState<string | null>(null)
  const [dnsRecordStatus, setDnsRecordStatus] = useState<{ aRecord: boolean; cname: boolean; txt: boolean } | null>(null)
  const [domainWarnings, setDomainWarnings] = useState<string[]>([])
  const [domainIssues, setDomainIssues] = useState<string[]>([])
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  // Avatar fallback order: Profile → Creator → Store Builder → OnePage → Google → Initials
  // Filter out placeholder URLs to match layout.tsx logic for sidebar consistency
  const isValidAvatarUrl = (url: string | null | undefined): boolean => {
    return !!url && !url.includes("placeholder.svg")
  }

  const getDefaultAvatarUrl = () => {
    if (isValidAvatarUrl(profile.avatar_url)) return profile.avatar_url!
    if (isValidAvatarUrl(creator.avatar_url)) return creator.avatar_url!
    if (isValidAvatarUrl(storeBuilderAvatarUrl)) return storeBuilderAvatarUrl!
    if (isValidAvatarUrl(onepageAvatarUrl)) return onepageAvatarUrl!
    if (isValidAvatarUrl(googleAvatarUrl)) return googleAvatarUrl!
    return ""
  }

  // Profile fields
  const [firstName, setFirstName] = useState(profile.first_name || profile.display_name?.split(" ")[0] || "")
  const [lastName, setLastName] = useState(profile.last_name || profile.display_name?.split(" ").slice(1).join(" ") || "")
  const [username, setUsername] = useState(profile.username || creator.slug || "")
  const [avatarUrl, setAvatarUrl] = useState(getDefaultAvatarUrl())
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Track initial values for unsaved changes detection
  const initialValues = useRef({
    firstName: profile.first_name || profile.display_name?.split(" ")[0] || "",
    lastName: profile.last_name || profile.display_name?.split(" ").slice(1).join(" ") || "",
    username: profile.username || creator.slug || "",
    avatarUrl: getDefaultAvatarUrl(),
    addressLine1: profile.address_line1 || "",
    city: profile.city || "",
    state: profile.state || "",
    postalCode: profile.postal_code || "",
    country: profile.country || "",
  })

  // Avatar upload/crop states
  const [showAvatarUploadModal, setShowAvatarUploadModal] = useState(false)
  const [showAvatarCropModal, setShowAvatarCropModal] = useState(false)
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null)
  const [tempAvatarFile, setTempAvatarFile] = useState<File | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  // Email fields
  const [currentEmail, setCurrentEmail] = useState(profile.email || "")
  const [emailVerified] = useState(true)

  // Address fields
  const [addressLine1, setAddressLine1] = useState(profile.address_line1 || "")
  const [addressLine2, setAddressLine2] = useState(profile.address_line2 || "")
  const [city, setCity] = useState(profile.city || "")
  const [state, setState] = useState(profile.state || "")
  const [postalCode, setPostalCode] = useState(profile.postal_code || "")
  const [country, setCountry] = useState(profile.country || "")

  // Country selector
  const [showCountryModal, setShowCountryModal] = useState(false)

  // Detect unsaved changes
  const hasUnsavedChanges =
    firstName !== initialValues.current.firstName ||
    lastName !== initialValues.current.lastName ||
    username !== initialValues.current.username ||
    avatarUrl !== initialValues.current.avatarUrl ||
    addressLine1 !== initialValues.current.addressLine1 ||
    city !== initialValues.current.city ||
    state !== initialValues.current.state ||
    postalCode !== initialValues.current.postalCode ||
    country !== initialValues.current.country ||
    selectedLanguage !== initialLanguage.current ||
    selectedTimezone !== initialTimezone.current ||
    supportEmail !== initialSupportEmail.current ||
    payoutCurrency !== initialPayoutCurrency.current ||
    statementDescriptor !== initialStatementDescriptor.current


  const loadStripeStatus = useCallback(async () => {
    setStripeStatusLoading(true)
    try {
      const res = await fetch("/api/stripe/connect/status")
      const data = await res.json()
      if (res.ok) setStripeStatus(data)
    } finally {
      setStripeStatusLoading(false)
    }
  }, [])

  const loadStripeBankInfo = useCallback(async () => {
    setStripeBankLoading(true)
    try {
      const res = await fetch("/api/stripe/payout-method")
      const data = await res.json()
      if (res.ok && data.bankAccount) setStripeBankInfo(data.bankAccount)
      else setStripeBankInfo(null)
      // Store requirements & status info
      if (res.ok) {
        setStripePayoutInfo({
          payoutsEnabled: data.payoutsEnabled ?? false,
          detailsSubmitted: data.detailsSubmitted ?? false,
          requirementsDue: data.requirementsDue || [],
          requirementsPastDue: data.requirementsPastDue || [],
        })
      }
    } catch {
      setStripeBankInfo(null)
    } finally {
      setStripeBankLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "payments" || activeTab === "general") loadStripeStatus()
    if (activeTab === "payments") loadStripeBankInfo()
  }, [activeTab, loadStripeStatus, loadStripeBankInfo])

  // Auto-refresh bank info on window focus (catches updates from Stripe hosted form)
  useEffect(() => {
    const onFocus = () => {
      if (activeTab === "payments") loadStripeBankInfo()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [activeTab, loadStripeBankInfo])

  // Fetch domains - defined here (before the URL params useEffect) to avoid TDZ in production builds
  const fetchDomains = useCallback(async () => {
    setDomainsLoading(true)
    try {
      const res = await fetch("/api/domains")
      const data = await res.json()
      if (data.domains) setDomains(data.domains)
    } catch (err) {
      console.error("Failed to fetch domains:", err)
    } finally {
      setDomainsLoading(false)
    }
  }, [])

  // Fetch domains on mount so quick links can use the custom domain
  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  // Fetch subscription plan on mount (for feature gating in Domains tab etc.)
  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((data) => setUserPlan(data.currentPlan?.id || "free"))
      .catch(() => setUserPlan("free"))
      .finally(() => setPlanLoading(false))
  }, [])

  // Auto-poll SSL provisioning domains every 10s until they become active
  useEffect(() => {
    const sslDomains = domains.filter((d) => d.status === "ssl_provisioning")
    if (sslDomains.length === 0) return

    let cancelled = false

    const checkSsl = async () => {
      for (const d of sslDomains) {
        if (cancelled) return
        try {
          const res = await fetch("/api/domains/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domainId: d.id }),
          })
          const data = await res.json()
          if (data.warnings?.length) setDomainWarnings(data.warnings)
          if (data.issues?.length) setDomainIssues(data.issues)
          if (data.verified && !data.sslPending) {
            setDomains((prev) => prev.map((dom) => dom.id === d.id ? { ...dom, status: "active", ssl_status: "active" } : dom))
            setDomainWarnings([])
            setDomainIssues([])
          }
        } catch {
          // Ignore polling errors
        }
      }
    }

    // Immediate first check (after 2s to avoid double-checking on initial verify)
    const initialTimeout = setTimeout(checkSsl, 2000)
    // Then poll every 10 seconds
    const interval = setInterval(checkSsl, 10000)

    return () => {
      cancelled = true
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [domains])

  // Handle URL parameters for tab navigation and Stripe Connect return/refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab") as TabId | null
    const stripeParam = params.get("stripe")

    if (tab && TAB_IDS.includes(tab as TabId) && tab !== "billing") {
      setActiveTab(tab as TabId)
      if (tab === "domains") fetchDomains()
    }

    if (stripeParam === "return" || stripeParam === "refresh") {
      setActiveTab("payments")
      loadStripeStatus()
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete("tab")
      url.searchParams.delete("stripe")
      window.history.replaceState({}, "", url.pathname)
    }
  }, [loadStripeStatus, fetchDomains])

  const connectStripe = async () => {
    setStripeBusy("connect")
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        console.error("Stripe Connect start error:", data)
        if (data?.code === "platform_not_configured" && data?.helpUrl) {
          setConnectHelpUrl(data.helpUrl)
        }
        setError(data?.error || "Failed to start Stripe Connect. Please try again.")
        setTimeout(() => setError(null), 15000)
        return
      }
      if (data?.url) {
        if (isNativeApp()) {
          // On native: open in SFSafariViewController (iOS) / Chrome Custom Tab (Android)
          openExternal(data.url)
          // Refresh Stripe status when the user returns to the app
          try {
            const { App } = await import("@capacitor/app")
            const handle = await App.addListener("appStateChange", ({ isActive }) => {
              if (isActive) {
                handle.remove()
                loadStripeStatus()
              }
            })
          } catch { /* @capacitor/app not available */ }
        } else {
          // Web: open in a popup window so the user stays on the settings page
          const w = 1100
          const h = 700
          const left = window.screenX + (window.outerWidth - w) / 2
          const top = window.screenY + (window.outerHeight - h) / 2
          const popup = window.open(data.url, "stripe-connect", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)
          if (popup) {
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer)
                loadStripeStatus()
              }
            }, 1000)
          } else {
            window.location.href = data.url
          }
        }
      } else {
        setError("No onboarding URL returned. Please try again.")
        setTimeout(() => setError(null), 5000)
      }
    } catch (err) {
      console.error("Stripe Connect fetch error:", err)
      setError("Network error. Please check your connection and try again.")
      setTimeout(() => setError(null), 5000)
    } finally {
      setStripeBusy(null)
    }
  }


  const manageStripe = async () => {
    setStripeBusy("connect")
    try {
      const res = await fetch("/api/stripe/account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "update" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to open account settings")
      if (data?.url) {
        if (isNativeApp()) {
          openExternal(data.url)
          try {
            const { App } = await import("@capacitor/app")
            const handle = await App.addListener("appStateChange", ({ isActive }) => {
              if (isActive) {
                handle.remove()
                loadStripeStatus()
                loadStripeBankInfo()
              }
            })
          } catch { /* @capacitor/app not available */ }
        } else {
          const w = 1100, h = 700
          const left = window.screenX + (window.outerWidth - w) / 2
          const top = window.screenY + (window.outerHeight - h) / 2
          const popup = window.open(data.url, "stripe-manage", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)
          if (popup) {
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer)
                loadStripeStatus()
                loadStripeBankInfo()
              }
            }, 1000)
          } else {
            window.location.href = data.url
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Try again.")
      setTimeout(() => setError(null), 5000)
    } finally {
      setStripeBusy(null)
    }
  }

  const disconnectStripe = async () => {
    setStripeBusy("disconnect")
    try {
      await fetch("/api/stripe/connect/disconnect", { method: "POST" })
      await loadStripeStatus()
    } finally {
      setStripeBusy(null)
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    const update = () => setIsMobileViewport(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Security
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null)

  // Email change modal
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailChangeStep, setEmailChangeStep] = useState<"input" | "verify">("input")
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""])
  const [emailChangeLoading, setEmailChangeLoading] = useState(false)
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null)
  const [emailChangeSuccess, setEmailChangeSuccess] = useState(false)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Sign out all devices
  const [signingOutAll, setSigningOutAll] = useState(false)

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<"confirm" | "verify">("confirm")
  const [deleteVerificationCode, setDeleteVerificationCode] = useState(["", "", "", "", "", ""])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteCodeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Privacy settings
  const [aiFeatures, setAiFeatures] = useState(true)
  const [personalization, setPersonalization] = useState(true)
  const [sessionRecording, setSessionRecording] = useState(false)
  const [analyticsSharing, setAnalyticsSharing] = useState(true)
  const [marketingEmails, setMarketingEmails] = useState(true)
  const [productUpdates, setProductUpdates] = useState(true)

  const storeUrl = getStoreUrl(username)
  const storeUrlDisplay = getStoreUrlDisplay(username)
  const fullNameForUsernameInput = [firstName, lastName].filter(Boolean).join(" ").trim()

  const validateUsername = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setUsername(cleanValue)
    setUsernameError(null)

    if (cleanValue.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      return
    }

    const validation = isValidUsername(cleanValue)
    if (!validation.valid) {
      setUsernameError(validation.error || "Invalid username")
    }
  }

  // Avatar file select handler
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    setTempAvatarUrl(url)
    setTempAvatarFile(file)
    setShowAvatarUploadModal(false)
    setShowAvatarCropModal(true)

    e.target.value = ""
  }

  // Avatar crop save handler
  const handleAvatarCropSave = async (croppedBlob: Blob) => {
    setIsUploadingAvatar(true)
    const supabase = createClient()

    try {
      const fileExt = "jpg"
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, { upsert: true, contentType: "image/jpeg" })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath)

      setAvatarUrl(publicUrl)

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", profile.id)

      setShowAvatarCropModal(false)
      if (tempAvatarUrl) {
        URL.revokeObjectURL(tempAvatarUrl)
      }
      setTempAvatarUrl(null)
      setTempAvatarFile(null)
      router.refresh()
    } catch (err) {
      console.error("Avatar upload error:", err)
      setError("Failed to upload image")
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleRemoveAvatar = async () => {
    const supabase = createClient()
    setAvatarUrl("")
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id)
    router.refresh()
  }

  // Auto-scroll tab nav to active tab on mobile
  useEffect(() => {
    if (activeTabRef.current && tabNavRef.current) {
      const container = tabNavRef.current
      const activeEl = activeTabRef.current
      const scrollLeft = activeEl.offsetLeft - container.offsetWidth / 2 + activeEl.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: "smooth" })
    }
  }, [activeTab])

  // fetchDomains moved above the URL params useEffect to avoid TDZ

  const addDomain = async () => {
    if (!domainInput.trim()) return
    setDomainAdding(true)
    setDomainError(null)
    setDomainInfo(null)
    setLastVerifyDomainId(null)
    setDomainWarnings([])
    setDomainIssues([])
    setDnsRecordStatus(null)
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDomainError(data.error || "Failed to add domain")
        return
      }
      setDomains((prev) => [data.domain, ...prev])
      setDomainInput("")
      setDomainError(null)
    } catch (err) {
      setDomainError("Failed to add domain")
    } finally {
      setDomainAdding(false)
    }
  }

  const verifyDomain = async (domainId: string) => {
    setDomainVerifying(domainId)
    setLastVerifyDomainId(domainId)
    setDomainError(null)
    setDomainInfo(null)
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      })
      const data = await res.json()
      if (data.records) setDnsRecordStatus(data.records)
      if (data.warnings) setDomainWarnings(data.warnings)
      if (data.issues) setDomainIssues(data.issues)
      if (data.verified && data.sslPending) {
        // DNS verified but SSL certificate is still being issued — info, not an error
        setDomains((prev) => prev.map((d) => d.id === domainId ? { ...d, status: "ssl_provisioning", verified_at: new Date().toISOString(), ssl_status: "provisioning" } : d))
        setDomainError(null)
        setDomainInfo(data.message || "DNS verified! SSL certificate is being issued. This usually takes 1–10 minutes.")
      } else if (data.verified) {
        // Fully connected with SSL
        setDomains((prev) => prev.map((d) => d.id === domainId ? { ...d, status: "active", verified_at: new Date().toISOString(), ssl_status: "active" } : d))
        setDomainError(null)
        setDomainInfo(null)
        setLastVerifyDomainId(null)
        setDomainWarnings([])
        setDomainIssues([])
      } else {
        setDomainInfo(null)
        setDomainError(data.message || "DNS records not found yet. Please check your records and try again.")
      }
    } catch (err) {
      setDomainError("Verification failed — please try again.")
    } finally {
      setDomainVerifying(null)
    }
  }

  const removeDomain = async (domainId: string) => {
    setDomainRemoving(domainId)
    setDomainError(null)
    setDomainInfo(null)
    setLastVerifyDomainId(null)
    setDomainWarnings([])
    setDomainIssues([])
    setDnsRecordStatus(null)
    try {
      const res = await fetch("/api/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      })
      if (res.ok) {
        setDomains((prev) => prev.filter((d) => d.id !== domainId))
      }
    } catch (err) {
      console.error("Failed to remove domain:", err)
    } finally {
      setDomainRemoving(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedValue(text)
    setTimeout(() => setCopiedValue(null), 2000)
  }

  // Suggested domains based on username
  const suggestedDomains = username ? [
    `${username.toLowerCase()}.com`,
    `${username.toLowerCase()}.store`,
    `${username.toLowerCase()}.shop`,
    `${username.toLowerCase()}.io`,
  ] : []

  // Tab change with skeleton loading animation
  const handleTabChange = (newTab: TabId) => {
    if (newTab === activeTab) return
    // Billing tab navigates to its own route
    if (newTab === "billing") {
      router.push("/app/settings/billing")
      return
    }
    setIsTabLoading(true)
    setActiveTab(newTab)
    if (newTab === "domains") fetchDomains()
    // Persist tab in URL so refresh stays on the same tab
    const url = new URL(window.location.href)
    if (newTab === "general") {
      url.searchParams.delete("tab")
    } else {
      url.searchParams.set("tab", newTab)
    }
    window.history.replaceState({}, "", url.toString())
    setTimeout(() => {
      setIsTabLoading(false)
    }, 160)
  }

  const handleSubmit = async (e?: React.FormEvent | Event) => {
    if (e && 'preventDefault' in e) e.preventDefault()

    if (usernameError) {
      setError(usernameError)
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "")
    const displayName = `${firstName} ${lastName}`.trim()

    try {
      // Check if username is taken by another user
      const { data: existingUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", profile.id)
        .limit(1)

      if (existingUsers && existingUsers.length > 0) {
        setError("This username is already taken")
        setIsLoading(false)
        return
      }

      // Track old username for redirects (only if actually changing)
      const oldUsername = profile.username
      if (oldUsername && oldUsername !== cleanUsername) {
        await supabase.from("username_history").insert({
          user_id: profile.id,
          old_username: oldUsername,
          new_username: cleanUsername,
        }).catch(() => {}) // Non-fatal
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          username: cleanUsername,
          first_name: firstName,
          last_name: lastName,
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
        })
        .eq("id", profile.id)

      if (profileError) throw profileError

      const { error: creatorError } = await supabase.from("creators").update({
        slug: cleanUsername,
        support_email: supportEmail || null,
        payout_currency: payoutCurrency,
        statement_descriptor: normalizeStatementDescriptor(statementDescriptor || profile?.username || (creator as any)?.display_name || "STORE"),
      }).eq("id", creator.id)

      if (creatorError) throw creatorError

      // Sync OnePage slug to match new username
      if (oldUsername && oldUsername !== cleanUsername) {
        await supabase
          .from("onepages")
          .update({ slug: cleanUsername })
          .eq("owner_id", profile.id)
          .catch(() => {}) // Non-fatal
      }

      // Save timezone to localStorage
      if (selectedTimezone !== initialTimezone.current) {
        localStorage.setItem('storelib_timezone', selectedTimezone)
      }

      setSuccess(true)
      setShowSaveToast(true)

      // Check if language was changed
      const languageChanged = selectedLanguage !== initialLanguage.current

      // Update initial values to reflect saved state
      initialValues.current = {
        firstName,
        lastName,
        username: cleanUsername,
        avatarUrl,
        addressLine1,
        city,
        state,
        postalCode,
        country,
      }
      initialTimezone.current = selectedTimezone
      initialSupportEmail.current = supportEmail
      initialPayoutCurrency.current = payoutCurrency
      initialStatementDescriptor.current = statementDescriptor

      // If language changed, apply it and reload the page
      if (languageChanged) {
        setLanguage(selectedLanguage)
        initialLanguage.current = selectedLanguage
        // Short delay to allow localStorage to save, then reload
        setTimeout(() => {
          window.location.reload()
        }, 500)
        return
      }

      router.refresh()
      // Hide toast and success state after 8 seconds
      setTimeout(() => {
        setSuccess(false)
        setShowSaveToast(false)
      }, 8000)
    } catch (error: unknown) {
      console.error("[Settings] Save error:", error)
      setError(error instanceof Error ? error.message : "An error occurred while saving. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
    }
  }

  const handleSignOutAllDevices = async () => {
    setSigningOutAll(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'global' })
      if (isNativePlatform()) {
        nativeLogOut()
      } else {
        router.push("/")
      }
    } catch {
      setSigningOutAll(false)
    }
  }

  const handleSendDeleteCode = async () => {
    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-code" }),
      })

      const data = await response.json()

      if (response.ok) {
        setDeleteStep("verify")
        setDeleteVerificationCode(["", "", "", "", "", ""])
      } else {
        setDeleteError(data.error || "Failed to send verification code")
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newCode = [...deleteVerificationCode]
    newCode[index] = value.slice(-1)
    setDeleteVerificationCode(newCode)

    if (value && index < 5) {
      deleteCodeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleDeleteCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !deleteVerificationCode[index] && index > 0) {
      deleteCodeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleConfirmDelete = async () => {
    const code = deleteVerificationCode.join("")
    if (code.length !== 6) {
      setDeleteError("Please enter the complete verification code")
      return
    }

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      })

      const data = await response.json()

      if (response.ok) {
        const supabase = createClient()
        await supabase.auth.signOut()
        if (isNativePlatform()) {
          nativeLogOut()
        } else {
          router.push("/")
        }
      } else {
        setDeleteError(data.error || "Invalid verification code")
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    setPasswordResetLoading(true)
    setPasswordResetError(null)

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (response.ok) {
        setPasswordResetSent(true)
      } else {
        setPasswordResetError(data.error || "Failed to send reset email")
      }
    } catch {
      setPasswordResetError("An error occurred. Please try again.")
    } finally {
      setPasswordResetLoading(false)
    }
  }

  const handleSendEmailChangeCode = async () => {
    if (!newEmail || newEmail === currentEmail) {
      setEmailChangeError("Please enter a different email address")
      return
    }

    setEmailChangeLoading(true)
    setEmailChangeError(null)

    try {
      const response = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      })

      const data = await response.json()

      if (response.ok) {
        setEmailChangeStep("verify")
        setVerificationCode(["", "", "", "", "", ""])
      } else {
        setEmailChangeError(data.error || "Failed to send verification code")
      }
    } catch {
      setEmailChangeError("An error occurred. Please try again.")
    } finally {
      setEmailChangeLoading(false)
    }
  }

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newCode = [...verificationCode]
    newCode[index] = value.slice(-1)
    setVerificationCode(newCode)

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyEmailChange = async () => {
    const code = verificationCode.join("")
    if (code.length !== 6) {
      setEmailChangeError("Please enter the complete 6-digit code")
      return
    }

    setEmailChangeLoading(true)
    setEmailChangeError(null)

    try {
      const response = await fetch("/api/auth/verify-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })

      const data = await response.json()

      if (response.ok) {
        setEmailChangeSuccess(true)
        setCurrentEmail(data.newEmail)
        setTimeout(() => {
          setShowEmailChangeModal(false)
          setEmailChangeStep("input")
          setNewEmail("")
          setVerificationCode(["", "", "", "", "", ""])
          setEmailChangeSuccess(false)
          router.refresh()
        }, 2000)
      } else {
        setEmailChangeError(data.error || "Invalid verification code")
      }
    } catch {
      setEmailChangeError("An error occurred. Please try again.")
    } finally {
      setEmailChangeLoading(false)
    }
  }

  const closeEmailChangeModal = () => {
    setShowEmailChangeModal(false)
    setEmailChangeStep("input")
    setNewEmail("")
    setVerificationCode(["", "", "", "", "", ""])
    setEmailChangeError(null)
    setEmailChangeSuccess(false)
  }

  // Header quick access
  const [isQuickAccessOpen, setIsQuickAccessOpen] = useState(false)
  const quickAccessRef = useRef<HTMLDivElement | null>(null)

  const settingsHandleBase = creator?.username || profile?.username || storeUrlDisplay.split(".")[0] || "store"
  const settingsHandleLabel = `@${settingsHandleBase}`
  const connectedDomain = domains.find((d: any) => d.status === "active")?.domain || null
  // Canonical subdomain URLs for display text and clipboard copy
  const onepageUrl = connectedDomain ? `https://${connectedDomain}/links` : getLinksShareUrl(settingsHandleBase)
  const storeUrlWithDomain = connectedDomain ? `https://${connectedDomain}` : getStoreShareUrl(settingsHandleBase)
  // Internal-path URLs for in-app navigation (preserves auth in Capacitor)
  const navOnepageUrl = connectedDomain ? `https://${connectedDomain}/links` : getLinksUrl(settingsHandleBase)
  const navStoreUrlWithDomain = connectedDomain ? `https://${connectedDomain}` : storeUrl

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (quickAccessRef.current && !quickAccessRef.current.contains(target)) {
        setIsQuickAccessOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <>
      {/* Save Toast Notification */}
      <div
        className={`fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-out ${
          showSaveToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="bg-[#1a1a2e] text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2.5 whitespace-nowrap max-w-[calc(100vw-2rem)]">
          <Check className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
          <span className="text-[14px] font-medium hidden sm:inline">Your settings are saved</span>
          <span className="text-[14px] font-medium sm:hidden">Settings saved</span>
        </div>
      </div>

      <div className="overflow-x-hidden bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-16 sm:pb-32 overflow-x-hidden">
        {/* Header with Handle pill */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("settings.title")}</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("settings.subtitle")}</p>
          </div>
          <div ref={quickAccessRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isMobileViewport) {
                  setIsQuickAccessOpen(true)
                  return
                }
                setIsQuickAccessOpen((v) => !v)
              }}
              className="relative inline-flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] sm:text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:border-[#d1d5db] hover:bg-white transition-all cursor-pointer overflow-hidden"
            >
              <span className="absolute -inset-px rounded-full opacity-45 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
              <span className="absolute inset-[1px] rounded-full bg-white/95" />
              <span className="relative z-[1] inline-flex items-center gap-1.5 sm:gap-2">
                {settingsHandleLabel}
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#9ca3af]" />
              </span>
            </button>

            {!isMobileViewport && isQuickAccessOpen && (
              <div className="absolute right-0 top-full mt-2 w-[280px] rounded-2xl border border-[#e5e7eb] bg-white shadow-xl p-2 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-200">
                <p className="px-2 pt-1 pb-2 text-[11px] text-[#6b7280]">Quick access</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickAccessOpen(false)
                    openExternal(onepageUrl || navOnepageUrl)
                  }}
                  className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer"
                >
                  <p className="text-[13px] font-semibold text-[#111827] flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-2.5 h-2.5" stroke="#ffffff" /></span>OnePage</p>
                  <p className="text-[11px] text-[#6b7280] truncate mt-1">{onepageUrl}</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickAccessOpen(false)
                    openExternal(storeUrlWithDomain || navStoreUrlWithDomain)
                  }}
                  className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer"
                >
                  <p className="text-[13px] font-semibold text-[#111827] flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/image2vector%20(2).webp" alt="" width={14} height={14} className="w-3.5 h-3.5" loading="eager" decoding="async" /></span>Store</p>
                  <p className="text-[11px] text-[#6b7280] truncate mt-1">{storeUrlWithDomain}</p>
                </button>
              </div>
            )}
          </div>
        </div>

        <MobileBottomSheet isOpen={isMobileViewport && isQuickAccessOpen} onClose={() => setIsQuickAccessOpen(false)} title="Quick access">
          <div className="space-y-2">
            <button type="button" onClick={() => {
              setIsQuickAccessOpen(false)
              openExternal(onepageUrl || navOnepageUrl)
            }} className="w-full text-left rounded-xl border border-[#ececf1] p-3">
              <p className="text-[14px] font-semibold text-[#111827] flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-3 h-3" stroke="#ffffff" /></span>OnePage</p>
              <p className="text-[12px] text-[#6b7280] truncate mt-1">{onepageUrl}</p>
            </button>
            <button type="button" onClick={() => {
              setIsQuickAccessOpen(false)
              openExternal(storeUrlWithDomain || navStoreUrlWithDomain)
            }} className="w-full text-left rounded-xl border border-[#ececf1] p-3">
              <p className="text-[14px] font-semibold text-[#111827] flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/image2vector%20(2).webp" alt="" className="w-4 h-4" loading="eager" decoding="async" /></span>Store</p>
              <p className="text-[12px] text-[#6b7280] truncate mt-1">{storeUrlWithDomain}</p>
            </button>
          </div>
        </MobileBottomSheet>

        {/* Pill-shaped Tab Navigation - Hidden scrollbar, fixed height to prevent layout shift */}
        <div ref={tabNavRef} className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const tabLabel = tab.id === "general" ? t("settings.general") :
                              tab.id === "security" ? t("settings.security") :
                              tab.id === "privacy" ? t("settings.privacy") :
                              tab.id === "billing" ? t("settings.billing") :
                              tab.id === "payments" ? t("settings.payments") :
                              tab.id === "domains" ? "Domains" :
                              t("settings.stores")
              return (
                <button
                  key={tab.id}
                  ref={activeTab === tab.id ? activeTabRef : undefined}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                    activeTab === tab.id
                      ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#d1d5db]"
                      : "bg-[#f9fafb] text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tabLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <form onSubmit={handleSubmit}>
          {/* Skeleton Loading */}
          {isTabLoading && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-150">
              {/* Skeleton Card 1 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-32" />
                    <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-48" />
                  </div>
                </div>
              </div>
              {/* Skeleton Card 2 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="h-5 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-40 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-20" />
                    <div className="h-11 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-24" />
                    <div className="h-11 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-xl" />
                  </div>
                </div>
              </div>
              {/* Skeleton Card 3 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="h-5 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-32 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-16" />
                    <div className="h-11 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-lg w-28" />
                    <div className="h-11 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%] rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* General Tab */}
          {!isTabLoading && activeTab === "general" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Purple Announcement Bar — Connect Stripe (only after status confirmed) */}
              {!stripeStatusLoading && !stripeStatus.connected && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 sm:px-6 py-3 sm:py-3.5 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-3 min-w-0">
                    <Wallet className="h-5 w-5 text-white shrink-0" />
                    <p className="text-[13px] sm:text-[14px] font-medium text-white">
                      <span className="sm:hidden">Get paid - Connect Stripe</span>
                      <span className="hidden sm:inline">Get paid — Connect your payouts to receive payments.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connectStripe}
                    disabled={stripeBusy !== null}
                    className="shrink-0 h-9 px-5 text-[13px] font-semibold text-[#7c3aed] bg-white rounded-lg hover:bg-[#f5f3ff] active:bg-[#ede9fe] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {stripeBusy === "connect" ? "Connecting..." : "Connect"}
                  </button>
                </div>
              )}

              {/* Profile Image Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-4">
                  <a
                    href="/store-builder"
                    className="relative group cursor-pointer"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile"
                        className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full object-cover bg-[#f3f4f6]"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                          e.currentTarget.nextElementSibling?.classList.remove("hidden")
                        }}
                      />
                    ) : null}
                    <div className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a78bfa] flex items-center justify-center text-white text-xl sm:text-2xl font-bold ${avatarUrl ? "hidden" : ""}`}>
                      {firstName?.[0]?.toUpperCase() || "U"}
                    </div>
                  </a>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1a1a2e] text-[15px]">Profile Photo</p>
                    <p className="text-[13px] text-[#6b7280] mb-2">JPG, PNG or GIF. Max 2MB.</p>
                    <a
                      href="/store-builder"
                      className="inline-flex px-3 py-1.5 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors items-center gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Change
                    </a>
                  </div>
                </div>
              </div>

              {/* Profile Information Card - Username + Store URL */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  {t("settings.profileInfo")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-[13px] font-medium text-[#374151]">
                      Username
                    </Label>
                    <Input
                      id="firstName"
                      value={fullNameForUsernameInput}
                      onChange={(e) => {
                        const value = e.target.value
                        const [first = "", ...rest] = value.trimStart().split(/\s+/)
                        setFirstName(first)
                        setLastName(rest.join(" "))
                      }}
                      placeholder="Enter your display name"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="storeUrlProfile" className="text-[13px] font-medium text-[#374151]">
                      {t("settings.storeUrl")}
                    </Label>
                    <Input
                      id="storeUrlProfile"
                      value={username}
                      onChange={(e) => validateUsername(e.target.value)}
                      placeholder="your-store-name"
                      className={`h-11 rounded-xl text-[14px] ${
                        usernameError ? "border-red-300 focus:ring-red-500 focus:border-red-500" : "border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                      }`}
                    />
                    {usernameError ? (
                      <p className="text-[12px] text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {usernameError}
                      </p>
                    ) : (
                      <p className="text-[12px] text-[#9ca3af]">{storeUrlDisplay}</p>
                    )}
                  </div>
                </div>

              </div>

              {/* OnePage URL - separate card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  OnePage URL
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="onepageHandle" className="text-[13px] font-medium text-[#374151]">
                    Handle
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
                      @
                    </span>
                    <Input
                      id="onepageHandle"
                      value={username}
                      onChange={(e) => {
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                        setUsername(value)
                      }}
                      placeholder="yourhandle"
                      className="h-11 pl-7 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <p className="text-[12px] text-[#6b7280]">
                    Your OnePage will be available at: <span className="font-medium text-[#8b5cf6]">{getLinksShareUrl(username || "yourhandle")}</span>
                  </p>
                </div>
              </div>

              {/* Emails Card - Email + Support Email */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Emails
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[13px] font-medium text-[#374151]">
                      Email
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input id="email" value={currentEmail} disabled className="h-11 bg-[#f9fafb] border-[#e5e7eb] rounded-xl text-[14px] pr-24" />
                        {emailVerified && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEmailChangeModal(true)}
                        className="px-4 h-11 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supportEmailProfile" className="text-[13px] font-medium text-[#374151]">
                      Support Email
                    </Label>
                    <Input
                      id="supportEmailProfile"
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder={currentEmail || "support@yourdomain.com"}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] text-[#9ca3af]">Shown to customers on receipts</p>
                      <div className="relative group">
                        <Info className="h-3.5 w-3.5 text-[#9ca3af] cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] text-white text-[12px] rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                          <div className="max-w-[220px] text-center leading-relaxed">
                            This email will appear on customer receipts and order confirmations. It&apos;s also the contact for customer support inquiries.
                          </div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a2e]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Language Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Language
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Choose your preferred language for the dashboard</p>
                <button
                  type="button"
                  onClick={() => setShowLanguageModal(true)}
                  className="w-full h-11 px-3 text-left border border-[#e5e7eb] rounded-xl text-[14px] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span className="text-[#1a1a2e]">{LANGUAGES.find(l => l.code === selectedLanguage)?.name || "English (US)"}</span>
                  <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
                </button>
              </div>

              {/* Timezone Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Timezone
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Used for analytics, product launches, scheduled emails, and sales timestamps</p>
                <button
                  type="button"
                  onClick={() => setShowTimezoneModal(true)}
                  className="w-full h-11 px-3 text-left border border-[#e5e7eb] rounded-xl text-[14px] bg-white hover:bg-[#f9fafb] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span className="text-[#1a1a2e] truncate min-w-0 flex-1">
                    {TIMEZONES.find(tz => tz.code === selectedTimezone)?.name || selectedTimezone}
                    <span className="text-[#9ca3af] ml-2">
                      ({TIMEZONES.find(tz => tz.code === selectedTimezone)?.offset || ""})
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#9ca3af] shrink-0" />
                </button>
              </div>

              {/* Address Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine1" className="text-[13px] font-medium text-[#374151]">
                      Address Line 1
                    </Label>
                    <Input
                      id="addressLine1"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Street address"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine2" className="text-[13px] font-medium text-[#374151]">
                      Address Line 2
                    </Label>
                    <Input
                      id="addressLine2"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Apt, suite, etc. (optional)"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-[13px] font-medium text-[#374151]">
                      City
                    </Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-[13px] font-medium text-[#374151]">
                      State / Province
                    </Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-[13px] font-medium text-[#374151]">
                      Postal Code
                    </Label>
                    <Input
                      id="postalCode"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="Postal code"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="text-[13px] font-medium text-[#374151]">
                      Country
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowCountryModal(true)}
                      className="w-full h-11 px-3 text-left border border-[#e5e7eb] rounded-xl text-[14px] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span className={country ? "text-[#1a1a2e]" : "text-[#9ca3af]"}>{country || "Select country"}</span>
                      <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Resources Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Resources</h3>
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <a
                    href="/app/changelog"
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-[#6b7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </svg>
                      <span className="text-[14px] text-[#374151]">Change log</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      View change log
                    </button>
                  </a>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("domains" as TabId); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-[#6b7280]" />
                      <span className="text-[14px] text-[#374151]">Custom Domain</span>
                    </div>
                    <span className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      Set up domain
                    </span>
                  </button>
                  <a
                    href="/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (isNativeApp()) {
                        e.preventDefault()
                        openExternal(`https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/help`)
                      }
                    }}
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-[#6b7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="text-[14px] text-[#374151]">Storelib Help Center</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      Get help
                    </button>
                  </a>
                </div>
              </div>

            </div>
          )}

          {/* Security Tab */}
          {!isTabLoading && activeTab === "security" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Password Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">
                  Password
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Send a password reset link to your email address.</p>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={passwordResetLoading || passwordResetSent}
                  className={`px-4 h-10 text-[13px] font-medium rounded-xl transition-colors flex items-center gap-2 ${
                    passwordResetSent ? "bg-emerald-50 text-emerald-600" : "bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151]"
                  }`}
                >
                  {passwordResetLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : passwordResetSent ? (
                    <>
                      <Check className="h-4 w-4" />
                      Email Sent
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Send Reset Link
                    </>
                  )}
                </button>
                {passwordResetSent && <p className="mt-3 text-[13px] text-emerald-600 bg-emerald-50 p-3 rounded-xl">Check your email for the password reset link.</p>}
                {passwordResetError && <p className="mt-3 text-[13px] text-red-600 bg-red-50 p-3 rounded-xl">{passwordResetError}</p>}
              </div>

              {/* Two-Factor Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">
                  Two-Factor Authentication
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Add an extra layer of security to your account.</p>
                <button type="button" disabled className="px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] text-[#9ca3af] rounded-xl cursor-not-allowed">
                  Coming Soon
                </button>
              </div>

              {/* Session Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">
                  Active Sessions
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Manage your active sessions across all devices.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOutAllDevices}
                    disabled={signingOutAll}
                    className="px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                  >
                    {signingOutAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing out...
                      </>
                    ) : (
                      "Sign out from all devices"
                    )}
                  </button>
                </div>
              </div>

              {/* Delete Account Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                      Delete your account
                    </h3>
                    <p className="text-[13px] text-[#6b7280]">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <p className="text-[12px] text-[#9ca3af] mt-2">
                      Account created on {new Date(profile.created_at || Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 h-10 text-[13px] font-medium bg-[#1a1a2e] hover:bg-[#2d2d44] text-white rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Tab */}
          {!isTabLoading && activeTab === "privacy" && (
            <div className="space-y-4 sm:space-y-6">
              {/* AI & Personalization Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  AI & Personalization
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Control how we use AI and personalize your experience.</p>

                <div className="space-y-4">
                  {/* AI Features Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">AI-powered features</p>
                      <p className="text-[12px] text-[#6b7280]">Enable smart suggestions and AI assistance</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiFeatures(!aiFeatures)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        aiFeatures ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          aiFeatures ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Personalization Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">Personalized recommendations</p>
                      <p className="text-[12px] text-[#6b7280]">Get tailored content based on your activity</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPersonalization(!personalization)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        personalization ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          personalization ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Data & Analytics Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">Data & Analytics</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Manage how your data is collected and used.</p>

                <div className="space-y-4">
                  {/* Session Recording Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">Session recording</p>
                      <p className="text-[12px] text-[#6b7280]">Help us improve by recording anonymous sessions</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSessionRecording(!sessionRecording)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        sessionRecording ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          sessionRecording ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Analytics Sharing Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">Analytics sharing</p>
                      <p className="text-[12px] text-[#6b7280]">Share anonymous usage data to improve our service</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAnalyticsSharing(!analyticsSharing)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        analyticsSharing ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          analyticsSharing ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Email Preferences Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Email Preferences
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Choose what emails you want to receive.</p>

                <div className="space-y-4">
                  {/* Marketing Emails Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">Marketing emails</p>
                      <p className="text-[12px] text-[#6b7280]">Tips, promotions, and special offers</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMarketingEmails(!marketingEmails)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        marketingEmails ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          marketingEmails ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Product Updates Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">Product updates</p>
                      <p className="text-[12px] text-[#6b7280]">New features and important changes</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProductUpdates(!productUpdates)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        productUpdates ? "bg-[#8b5cf6]" : "bg-[#e5e7eb]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          productUpdates ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payments Tab */}
          {!isTabLoading && activeTab === "payments" && (
            <div className="space-y-[10px] sm:space-y-[14px]">
              {/* Error display for Connect flow */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => { setError(null); setConnectHelpUrl(null) }} className="shrink-0 cursor-pointer"><X className="h-4 w-4" /></button>
                  </div>
                  {connectHelpUrl && (
                    <a href={connectHelpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] ml-6">
                      <ExternalLink className="h-3 w-3" />
                      Open Stripe Platform Profile Settings
                    </a>
                  )}
                </div>
              )}
              {/* Action required banners — use requirements from payout-method API */}
              {stripeStatus.connected && !stripeBankLoading && stripePayoutInfo && !stripePayoutInfo.payoutsEnabled && stripePayoutInfo.detailsSubmitted && (stripePayoutInfo.requirementsDue.length > 0 || stripePayoutInfo.requirementsPastDue.length > 0) && (
                <div className="flex items-start gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#374151]">{stripePayoutInfo.requirementsPastDue.length > 0 ? "Action required to keep receiving payouts" : "Verification needed to enable payouts"}</p>
                  </div>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 mt-0.5 cursor-pointer">{stripeBusy ? "Opening..." : "Complete verification"}</button>
                </div>
              )}
              {stripeStatus.connected && !stripeBankLoading && stripePayoutInfo && !stripePayoutInfo.detailsSubmitted && !stripePayoutInfo.payoutsEnabled && (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0">
                    <AlertCircle className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <p className="text-[13px] text-[#4b5563] flex-1">Complete your account setup to receive payouts</p>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 cursor-pointer">{stripeBusy ? "Opening..." : "Complete setup"}</button>
                </div>
              )}
              {stripeStatus.connected && !stripeBankLoading && !stripeBankInfo && (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0">
                    <Landmark className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <p className="text-[13px] text-[#4b5563] flex-1">Add a bank account to cash out</p>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 cursor-pointer">{stripeBusy ? "Opening..." : "Add bank"}</button>
                </div>
              )}

              {/* Stripe Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-9 h-9 sm:w-[44px] sm:h-[44px] rounded-xl overflow-hidden shrink-0">
                      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="none" className="w-full h-full">
                        <circle cx="512" cy="512" r="512" style={{ fill: "#635bff" }} />
                        <path d="M781.67 515.75c0-38.35-18.58-68.62-54.08-68.62s-57.23 30.26-57.23 68.32c0 45.09 25.47 67.87 62 67.87 17.83 0 31.31-4 41.5-9.74v-30c-10.19 5.09-21.87 8.24-36.7 8.24-14.53 0-27.42-5.09-29.06-22.77h73.26c.01-1.92.31-9.71.31-13.3zm-74-14.23c0-16.93 10.34-24 19.78-24 9.14 0 18.88 7 18.88 24zm-95.14-54.39a42.32 42.32 0 0 0-29.36 11.69l-1.95-9.29h-33v174.68l37.45-7.94.15-42.4c5.39 3.9 13.33 9.44 26.52 9.44 26.82 0 51.24-21.57 51.24-69.06-.12-43.45-24.84-67.12-51.05-67.12zm-9 103.22c-8.84 0-14.08-3.15-17.68-7l-.15-55.58c3.9-4.34 9.29-7.34 17.83-7.34 13.63 0 23.07 15.28 23.07 34.91.01 20.03-9.28 35.01-23.06 35.01zM496.72 438.29l37.6-8.09v-30.41l-37.6 7.94v30.56zm0 11.39h37.6v131.09h-37.6zm-40.3 11.08L454 449.68h-32.34v131.08h37.45v-88.84c8.84-11.54 23.82-9.44 28.46-7.79v-34.45c-4.78-1.8-22.31-5.1-31.15 11.08zm-74.91-43.59L345 425l-.15 120c0 22.17 16.63 38.5 38.8 38.5 12.28 0 21.27-2.25 26.22-4.94v-30.45c-4.79 1.95-28.46 8.84-28.46-13.33v-53.19h28.46v-31.91h-28.51zm-101.27 70.56c0-5.84 4.79-8.09 12.73-8.09a83.56 83.56 0 0 1 37.15 9.59V454a98.8 98.8 0 0 0-37.12-6.87c-30.41 0-50.64 15.88-50.64 42.4 0 41.35 56.93 34.76 56.93 52.58 0 6.89-6 9.14-14.38 9.14-12.43 0-28.32-5.09-40.9-12v35.66a103.85 103.85 0 0 0 40.9 8.54c31.16 0 52.58-15.43 52.58-42.25-.17-44.63-57.25-36.69-57.25-53.47z" style={{ fill: "#fff" }} />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">Stripe</h3>
                        <span className={`px-1.5 py-0.5 font-medium rounded-full flex items-center gap-1 ${isMobileViewport ? "text-[8px]" : "text-[10px]"} ${stripeStatus.connected ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                          <Check className="h-3 w-3" /> {stripeStatus.connected ? "Connected" : stripeStatus.status === "pending" ? "Pending" : stripeStatusLoading ? "Checking" : "Not connected"}
                        </span>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-[#6b7280] mt-0.5">Connect to accept payments from Credit/Debit cards</p>
                    </div>
                  </div>
                  {stripeStatus.connected ? (
                    <button type="button" onClick={() => setShowStripeManage((v) => !v)} className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-medium border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151] rounded-lg transition-colors cursor-pointer shrink-0">{showStripeManage ? "Hide" : "Manage"}</button>
                  ) : (
                    <button type="button" onClick={connectStripe} disabled={stripeBusy !== null} className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-60">{stripeBusy === "connect" ? "Connecting..." : stripeStatus.status === "pending" ? "Complete Setup" : "Connect"}</button>
                  )}
                </div>
              </div>

              <div className={`grid transition-all duration-300 ease-in-out ${showStripeManage ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="-mt-2 rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-4 sm:p-5">
                    {/* Bank account info */}
                    {stripeBankLoading ? (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                        <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                      </div>
                    ) : stripeBankInfo ? (
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Landmark className="h-3.5 w-3.5 text-[#6b7280] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{stripeBankInfo.bankName || "Bank account"} ••••{stripeBankInfo.last4}</span>
                        <span className="text-[11px] text-[#6b7280] uppercase">{stripeBankInfo.currency}</span>
                        {stripeBankInfo.status && stripeBankInfo.status !== "new" && (
                          <span className={`text-[11px] font-medium capitalize ${stripeBankInfo.status === "verified" ? "text-green-600" : "text-amber-600"}`}>{stripeBankInfo.status}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#6b7280] mb-3">No bank account connected yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 rounded-full border text-[11px] bg-white">Charges: {stripeStatus.chargesEnabled ? "Enabled" : "Pending"}</span>
                      <span className="px-2 py-1 rounded-full border text-[11px] bg-white">Payouts: {stripeStatus.payoutsEnabled ? "Enabled" : "Pending"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={manageStripe} disabled={stripeBusy !== null || !stripeStatus.connected} className="h-9 px-3 rounded-lg border border-[#e5e7eb] bg-white text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer flex items-center gap-1.5"><ExternalLink className="h-3 w-3" /> Manage settings</button>
                      <button type="button" onClick={connectStripe} disabled={stripeBusy !== null} className="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer">{stripeBusy === "connect" ? "Connecting..." : "Reconnect"}</button>
                      <button type="button" onClick={disconnectStripe} disabled={stripeBusy !== null || !stripeStatus.connected} className="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer">{stripeBusy === "disconnect" ? "Disconnecting..." : "Disconnect"}</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* PayPal Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-9 h-9 sm:w-[38px] sm:h-[38px] rounded-xl overflow-hidden shrink-0">
                      <svg viewBox="-23 0 302 302" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        <path d="M217.168476 23.5070146C203.234077 7.62479651 178.045612 0.815753338 145.823355 0.815753338L52.3030619 0.815753338C45.7104431 0.815753338 40.1083819 5.6103852 39.0762042 12.1114399L0.136468302 259.076601C-0.637664968 263.946149 3.13311322 268.357876 8.06925331 268.357876H65.804612L80.3050438 176.385849L79.8555471 179.265958C80.8877248 172.764903 86.4481659 167.970272 93.0324607 167.970272H120.46841C174.366398 167.970272 216.569147 146.078116 228.897012 82.7490197C229.263268 80.8761167 229.579581 79.0531577 229.854273 77.2718188C233.525163 53.8646924 229.829301 37.9325302 217.168476 23.5070146" fill="#27346A" />
                        <path d="M228.897012 82.7490197C216.569147 146.069792 174.366398 167.970272 120.46841 167.970272H93.0241367C86.4398419 167.970272 80.8794007 172.764903 79.8555471 179.265958L61.8174095 293.621258C61.1431644 297.883153 64.4394738 301.745495 68.7513129 301.745495H117.421821C123.182038 301.745495 128.084882 297.550192 128.983876 291.864891L138.631407 231.249423C140.121406 222.351053 145.02425 218.15575 150.784467 218.15575H158.067979C205.215193 218.15575 242.132193 199.002194 252.920115 143.605884C257.423406 120.456802 255.092683 101.128442 243.181019 87.5519756C239.568397 83.4399129 235.081754 80.0437153 229.854273 77.2718188C229.571257 79.0614817 229.263268 80.8761167 228.897012 82.7490197" fill="#2790C3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">PayPal</h3>
                        <span className={`px-1.5 py-0.5 font-medium bg-[#eef2ff] text-[#635bff] rounded-full border border-[#dbe4ff] ${isMobileViewport ? "text-[8px]" : "text-[10px]"}`}>Coming soon</span>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-[#6b7280] mt-0.5">PayPal payouts and card-backed options will be available soon.</p>
                    </div>
                  </div>
                  <button type="button" disabled className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-medium border border-[#e5e7eb] text-[#9ca3af] rounded-lg cursor-not-allowed shrink-0">Soon</button>
                </div>
              </div>

              <div className="relative inline-flex group">
                <a href="#" className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0891b2] hover:text-[#0e7490] transition-colors cursor-pointer">
                  See all payment options
                  <ChevronRight className="h-4 w-4" />
                </a>
                <div className="absolute left-0 top-full mt-2 hidden group-hover:flex items-center gap-1.5 rounded-lg bg-[#111827] text-white text-xs px-3 py-2 shadow-lg z-20 whitespace-nowrap">
                  <Info className="h-3.5 w-3.5 text-[#93c5fd]" />
                  More payment options coming soon.
                </div>
              </div>

              <div className="pt-2">
                <div className="space-y-1.5 max-w-[420px]">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="statement-descriptor" className="text-[13px] font-medium text-[#374151]">Statement Descriptor</Label>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] transition-colors cursor-help"
                            aria-label="About statement descriptor"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
                          This text appears on your customer&apos;s bank statement to identify who charged them.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="statement-descriptor"
                    value={statementDescriptor}
                    onChange={(e) => setStatementDescriptor(normalizeStatementDescriptor(e.target.value))}
                    placeholder={defaultStatementDescriptor}
                    className="h-10 rounded-xl border-[#e5e7eb] text-[13px] focus-visible:border-[#8b5cf6] focus-visible:ring-[#8b5cf6]/20"
                  />
                  <p className="text-[12px] text-[#9ca3af]">Shown in bank apps as the charge descriptor (max 22 characters).</p>
                </div>
              </div>

              {showCurrencyPicker && !isMobileViewport && (
                <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCurrencyPicker(false)}>
                  <div className="w-full max-w-[420px] rounded-2xl bg-white border border-[#e5e7eb] p-4 sm:p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">Select payout currency</h4>
                    <p className="text-[12px] text-[#6b7280] mb-3">Choose your payout settlement currency.</p>
                    <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                      {(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"] as const).map((currency) => (
                        <button key={currency} type="button" onClick={() => { setPayoutCurrency(currency); setShowCurrencyPicker(false) }} className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${payoutCurrency === currency ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f3f4f6]"}`}>
                          {currency}
                          {payoutCurrency === currency && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <MobileBottomSheet
                isOpen={showCurrencyPicker && isMobileViewport}
                onClose={() => setShowCurrencyPicker(false)}
                title="Select payout currency"
              >
                <div className="space-y-2 pb-2">
                  {(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"] as const).map((currency) => (
                    <button key={currency} type="button" onClick={() => { setPayoutCurrency(currency); setShowCurrencyPicker(false) }} className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${payoutCurrency === currency ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f3f4f6]"}`}>
                      {currency}
                      {payoutCurrency === currency && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </MobileBottomSheet>
            </div>
          )}

          {/* Manage Stores Tab */}
          {!isTabLoading && activeTab === "stores" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Store Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Your Store
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 pb-4 border-b border-[#e5e7eb]">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1a1a2e] text-[15px] truncate">{creator.headline || "My Store"}</p>
                    <p className="text-[13px] text-[#6b7280] truncate">{storeUrlDisplay}</p>
                  </div>
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 h-9 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("settings.visitStore")}
                  </a>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-[13px] font-medium text-[#374151]">
                    {t("settings.storeUrl")}
                  </Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => validateUsername(e.target.value)}
                    placeholder="your-store-name"
                    className={`h-11 rounded-xl text-[14px] ${
                      usernameError ? "border-red-300 focus:ring-red-500 focus:border-red-500" : "border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    }`}
                  />
                  {usernameError ? (
                    <p className="text-[12px] text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {usernameError}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[#9ca3af]">{storeUrlDisplay}</p>
                  )}
                </div>
              </div>

              {/* Store Settings Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">{t("settings.storeCustomization")}</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">{t("settings.storeCustomizationDesc")}</p>
                <a
                  href="/store-builder"
                  className="inline-flex items-center gap-2 px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors"
                >
                  <Palette className="h-4 w-4" />
                  {t("settings.openStoreBuilder")}
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>

              {/* OnePage Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">OnePage</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Manage your link-in-bio page.</p>
                <a
                  href="/app/onepage"
                  className="inline-flex items-center gap-2 px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors"
                >
                  <Link2 className="h-4 w-4" />
                  Edit OnePage
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>

            </div>
          )}

          {/* Domains Tab */}
          {!isTabLoading && activeTab === "domains" && (
            <div className="space-y-4 sm:space-y-6">

              {/* Upgrade banner — only shown for free/null plan, nothing while loading or paid */}
              {!planLoading && (userPlan === "free" || userPlan === null) ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 sm:px-6 py-3 sm:py-3.5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="h-5 w-5 text-white shrink-0" />
                    <p className="text-[13px] sm:text-[14px] font-medium text-white truncate">
                      <span className="sm:hidden">Upgrade for custom domains</span>
                      <span className="hidden sm:inline">Custom domains are available on Growth &amp; Pro plans.</span>
                    </p>
                  </div>
                  <a
                    href="/app/settings/billing/upgrade"
                    className="shrink-0 inline-flex items-center justify-center h-9 px-5 text-[13px] font-semibold text-[#7c3aed] bg-white rounded-xl hover:bg-[#f5f3ff] active:bg-[#ede9fe] transition-colors shadow-sm cursor-pointer no-underline whitespace-nowrap"
                  >
                    Upgrade
                  </a>
                </div>
              ) : null}

              {/* Connect Your Domain Card */}
              <div className={`bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] transition-[filter,opacity] duration-700 ease-in-out ${(userPlan === "free" || userPlan === null) && !planLoading ? "blur-[1.5px] opacity-80 pointer-events-none select-none" : ""}`}>
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">Connect your own domain</h3>
                {/* Desktop: full text, Mobile: shorter text */}
                <p className="hidden sm:block text-[13px] text-[#6b7280] mb-4">Connect a custom domain to your store and OnePage. Your store will be at <span className="font-medium">yourdomain.com</span> and OnePage at <span className="font-medium">yourdomain.com/links</span>.</p>
                <p className="sm:hidden text-[13px] text-[#6b7280] mb-4">Connect a custom domain to your store and OnePage.</p>

                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                    <input
                      type="text"
                      value={domainInput}
                      onChange={(e) => { setDomainInput(e.target.value); setDomainError(null); setDomainInfo(null) }}
                      onKeyDown={(e) => e.key === "Enter" && addDomain()}
                      placeholder="Enter your domain (e.g. mydomain.com)"
                      disabled={userPlan === "free" || userPlan === null}
                      className="w-full h-11 pl-10 pr-4 text-[14px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-[#8b5cf6] transition-colors disabled:cursor-not-allowed"
                    />
                  </div>
                  <button
                    onClick={addDomain}
                    disabled={domainAdding || !domainInput.trim() || userPlan === "free" || userPlan === null}
                    className="h-11 px-5 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 shrink-0 disabled:cursor-not-allowed"
                  >
                    {domainAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Connect
                  </button>
                </div>

                {domainError && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {domainError}
                  </div>
                )}

                {domainInfo && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    {domainInfo}
                  </div>
                )}

                {domainIssues.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-[12px] font-semibold text-red-800 mb-1.5">Issues blocking SSL:</p>
                    <ul className="space-y-1.5">
                      {domainIssues.map((issue, i) => (
                        <li key={i} className="text-[11px] text-red-700 flex items-start gap-2 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {domainWarnings.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[12px] font-semibold text-amber-800 mb-1.5">Warnings:</p>
                    <ul className="space-y-1.5">
                      {domainWarnings.map((warning, i) => (
                        <li key={i} className="text-[11px] text-amber-700 flex items-start gap-2 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* DNS Provider Quick Links */}
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-[11px] text-[#9ca3af]">Get a domain:</span>
                  <div className="flex items-center gap-3">
                    <a href="https://www.hostinger.com/domain-name-search" target="_blank" rel="noopener noreferrer" className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer" title="Hostinger">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg"><path d="M16.415 0v7.16l5.785 3.384V2.949zM1.8 0v11.237h18.815L14.89 8.09l-7.457-.003V3.024zm14.615 20.894v-5.019l-7.514-.005c.007.033-5.82-3.197-5.82-3.197l19.119.091V24zM1.8 13.551v7.343l5.633 2.949v-6.988z"/></svg>
                    </a>
                    <a href="https://www.godaddy.com/en/domains" target="_blank" rel="noopener noreferrer" className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer" title="GoDaddy">
                      <svg width="20" height="20" viewBox="0 0 1534 1368" fill="#374151" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M1391.5 968.9C1233.6 1221.8 986.7 1370 767 1367.2c-219.8 2.8-466.6-145.4-624.5-398.4C-71.6 625.8-41 220 210.9 62.4c159.2-99.5 369.2-75.9 555.8 41.8 187.2-117.8 397.1-141.3 556.5-41.8 251.9 157.6 282.2 563.4 68.3 906.5M280.3 929.8q11.3 16.5 23.4 32.3 12.2 15.9 25 31.1 12.8 15.3 26.4 30c-45.4-184.8-5.7-416.6 124.3-624.9Q497 370 516.5 343q19.5-27.1 40.8-52.7t44.3-49.7 47.7-46.6c-17.2-9-34.8-17.1-52.8-24.4-118.2-46.9-229.3-43.9-313.3 8.7-84 52.7-135.5 151.4-145.1 278.1q-1.8 26.9-1.3 53.8.4 27 3.1 53.8 2.7 26.9 7.6 53.4 5 26.5 12.1 52.5 7.9 30 18.2 59.3 10.2 29.3 22.6 57.8 12.4 28.4 26.9 55.8 14.6 27.5 31.1 53.7 10.5 16.9 21.9 33.3m1106.3-312.4q4.8-26.5 7.4-53.3 2.7-26.8 3.1-53.7t-1.4-53.8c-9.6-126.7-61-225.4-145.1-278-84-52.6-195.3-55.7-313.3-8.7q-24.9 10.2-48.8 22.4-24 12.3-46.9 26.5T797.1 249q-21.6 16.1-41.8 33.8c-31.1 27.3-60.2 56.8-86.9 88.2-26.8 31.5-51.2 65-73.1 100-21.9 35.1-41.2 71.7-57.8 109.6-16.5 37.9-30.2 77-41.1 116.9C477.5 767 470.3 839.2 475 911c9.5 126.8 61.1 225.6 145.1 278.1 10.8 6.7 22 12.5 33.5 17.6 11.6 5.1 23.5 9.5 35.6 13s24.5 6.2 37 8.1c12.5 1.8 25.1 2.8 37.7 3h6.5c12.6-.2 25.2-1.2 37.7-3.1 12.5-1.8 24.8-4.5 37-8 12.1-3.6 24-7.9 35.5-13 11.6-5.1 22.8-11 33.6-17.6 83.9-52.5 135.5-151.3 145-278 4.8-71.9-2.4-144.1-21.4-213.6-4.9-19.8-11.4-39-17.9-58.6l-201 125.7c-2.8 1.8-6 3-9.2 3.6-3.3.5-6.7.4-9.9-.3-3.3-.8-6.4-2.2-9.1-4.1-2.7-2-5-4.4-6.7-7.2l-45.5-72.9c-1.8-2.8-3-5.9-3.5-9.2-.6-3.3-.5-6.7.3-9.9.7-3.3 2.1-6.3 4-9 2-2.8 4.4-5.1 7.2-6.8l310.2-194c2.9-1.9 6.2-3.2 9.7-3.7 3.5-.6 7-.4 10.4.5 3.4 1 6.6 2.6 9.3 4.8s4.9 5 6.5 8.2c99.5 190.3 127.1 393.2 86.5 558.8q13.5-14.7 26.4-30 12.8-15.3 24.9-31.2t23.5-32.3q11.3-16.5 21.9-33.4 16.5-26.3 31-53.7 14.6-27.4 27-55.9 12.4-28.4 22.6-57.7t18.2-59.3q7.1-26 12-52.5"/></svg>
                    </a>
                    <a href="https://www.namecheap.com/domains/" target="_blank" rel="noopener noreferrer" className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer" title="Namecheap">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg"><path d="M17.295 17.484c.227.403.57.728.985.931-.309.15-.647.229-.99.232h-3.068a2.26 2.26 0 0 1-1.957-1.143L6.705 6.511a2.27 2.27 0 0 0-.974-.922c.309-.153.652-.233.997-.232h3.05c.81.003 1.558.438 1.959 1.143zm-9.329-7.392L6.269 6.755c-.209-.392-.582-.657-.984-.829-.204.165-.391.35-.522.581-.184.349-4.391 8.648-4.569 8.987a2.245 2.245 0 0 0 4.016 1.999zm15.846-1.593a2.245 2.245 0 0 0-1.162-2.955v-.001a2.2 2.2 0 0 0-.892-.187l-.003-.011c-.816 0-1.569.443-1.965 1.157l-3.749 7.414 1.689 3.323c.213.399.59.664.998.839.252-.2.473-.444.605-.742z"/></svg>
                    </a>
                  </div>
                </div>

                {/* Suggested Domains */}
                {suggestedDomains.length > 0 && domains.length === 0 && (
                  <div className="mt-4">
                    <p className="text-[12px] font-medium text-[#6b7280] mb-2">Suggested domains based on your username:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedDomains.filter((sd) => !domains.some((d) => d.domain === sd)).map((sd, idx) => (
                        <button
                          key={sd}
                          onClick={() => { setDomainInput(sd); setDomainError(null) }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#7c3aed] bg-[#f5f3ff] border border-[#ede9fe] rounded-lg hover:bg-[#ede9fe] transition-colors cursor-pointer ${idx >= 3 ? "hidden sm:inline-flex" : ""}`}
                        >
                          {sd}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Domains List */}
              <div className={`bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb] transition-[filter,opacity] duration-700 ease-in-out ${(userPlan === "free" || userPlan === null) && !planLoading ? "blur-[1.5px] opacity-80 pointer-events-none select-none" : ""}`}>
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Your Domains</h3>

                {domainsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#7c3aed]" />
                  </div>
                ) : domains.length === 0 ? (
                  <div className="text-center py-8">
                    <Globe className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
                    <p className="text-[13px] text-[#6b7280] mb-1">No domains connected yet</p>
                    <p className="text-[12px] text-[#9ca3af]">Add a custom domain above to get started</p>
                  </div>
                ) : (
                  <>
                    {/* Table Header - Desktop */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_130px_150px_140px] gap-4 pb-3 border-b border-[#e5e7eb]">
                      <p className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Domain Name</p>
                      <p className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Status</p>
                      <p className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date Added</p>
                      <p className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Actions</p>
                    </div>

                    {domains.map((d) => (
                      <div key={d.id}>
                        {/* Desktop Row */}
                        <div className="hidden sm:grid sm:grid-cols-[1fr_130px_150px_140px] gap-4 items-center py-4 border-b border-[#f3f4f6] last:border-0">
                          <div>
                            <p className="text-[14px] font-medium text-[#1a1a2e]">{d.domain}</p>
                            {(d.status === "ssl_provisioning" || d.status === "pending" || d.status === "verifying") && (
                              <p className="text-[11px] text-[#9ca3af] mt-0.5">Fallback: <SmartLink href={`https://${username}.storelib.com`} className="text-[#7c3aed] hover:underline">{username}.storelib.com</SmartLink></p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {d.status === "active" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-full">
                                <CheckCircle className="h-3 w-3" /> Connected
                              </span>
                            ) : d.status === "ssl_provisioning" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full">
                                <Loader2 className="h-3 w-3 animate-spin" /> SSL Pending
                              </span>
                            ) : d.status === "verifying" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-semibold rounded-full">
                                <Loader2 className="h-3 w-3 animate-spin" /> Verifying
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-semibold rounded-full">
                                <Clock className="h-3 w-3" /> Pending
                              </span>
                            )}
                            <div className="relative group">
                              <Info className="h-3.5 w-3.5 text-[#c0c5cc] hover:text-[#9ca3af] transition-colors cursor-help" />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-[#1a1a2e] text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                {d.status === "active" ? "Domain is live" : d.status === "ssl_provisioning" ? "Issuing SSL cert" : d.status === "verifying" ? "Checking DNS records" : "Awaiting DNS setup"}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a2e]" />
                              </div>
                            </div>
                          </div>
                          <p className="text-[13px] text-[#6b7280]">
                            {new Date(d.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <div className="flex items-center gap-2 justify-end">
                            {d.status !== "active" && (
                              <button
                                onClick={() => verifyDomain(d.id)}
                                disabled={domainVerifying === d.id}
                                className="h-8 px-3 text-[12px] font-medium text-[#7c3aed] border border-[#ede9fe] bg-[#f5f3ff] hover:bg-[#ede9fe] rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                {domainVerifying === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                              </button>
                            )}
                            <button
                              onClick={() => removeDomain(d.id)}
                              disabled={domainRemoving === d.id}
                              className="h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] hover:text-red-600 hover:border-red-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              {domainRemoving === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove"}
                            </button>
                          </div>
                        </div>

                        {/* Inline verify feedback — shown only for the last-verified domain */}
                        {lastVerifyDomainId === d.id && (domainError || domainInfo) && (
                          <div className={`hidden sm:flex items-start gap-2 px-4 py-2.5 mx-0 mb-1 rounded-xl text-[12px] leading-relaxed ${domainError ? "bg-red-50 border border-red-200 text-red-700" : "bg-blue-50 border border-blue-200 text-blue-700"}`}>
                            {domainError ? <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />}
                            <span>{domainError || domainInfo}</span>
                          </div>
                        )}

                        {/* Mobile Card */}
                        <div className="sm:hidden bg-[#f9fafb] rounded-xl p-4 border border-[#e5e7eb] mb-3">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-[14px] font-semibold text-[#1a1a2e]">{d.domain}</p>
                            <div className="flex items-center gap-1.5">
                              {d.status === "active" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-full">
                                  <CheckCircle className="h-3 w-3" /> Connected
                                </span>
                              ) : d.status === "ssl_provisioning" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full">
                                  <Loader2 className="h-3 w-3 animate-spin" /> SSL Pending
                                </span>
                              ) : d.status === "verifying" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-semibold rounded-full">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Verifying
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-semibold rounded-full">
                                  <Clock className="h-3 w-3" /> Pending
                                </span>
                              )}
                              <div className="relative group">
                                <Info className="h-3.5 w-3.5 text-[#c0c5cc] hover:text-[#9ca3af] transition-colors cursor-help" />
                                <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 bg-[#1a1a2e] text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                  {d.status === "active" ? "Domain is live" : d.status === "ssl_provisioning" ? "Issuing SSL cert" : d.status === "verifying" ? "Checking DNS records" : "Awaiting DNS setup"}
                                  <div className="absolute top-full right-3 border-4 border-transparent border-t-[#1a1a2e]" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-[12px] text-[#9ca3af] mb-1">Added {new Date(d.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
                          {(d.status === "ssl_provisioning" || d.status === "pending" || d.status === "verifying") && (
                            <p className="text-[11px] text-[#9ca3af] mb-2">Fallback: <SmartLink href={`https://${username}.storelib.com`} className="text-[#7c3aed] hover:underline">{username}.storelib.com</SmartLink></p>
                          )}
                          <div className="flex items-center gap-2">
                            {d.status !== "active" && (
                              <button
                                onClick={() => verifyDomain(d.id)}
                                disabled={domainVerifying === d.id}
                                className="flex-1 h-9 text-[12px] font-medium text-[#7c3aed] bg-[#f5f3ff] rounded-lg hover:bg-[#ede9fe] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                              >
                                {domainVerifying === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify DNS"}
                              </button>
                            )}
                            <button
                              onClick={() => removeDomain(d.id)}
                              disabled={domainRemoving === d.id}
                              className={`h-9 px-4 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1 ${d.status === "active" ? "flex-1" : ""}`}
                            >
                              {domainRemoving === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* DNS Setup Instructions */}
              {domains.some((d) => d.status !== "active") && (
                <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-3">DNS Setup Instructions</h3>
                  <p className="text-[13px] text-[#6b7280] mb-4">Add both DNS records below at your registrar. Your site will be served at <span className="font-medium">www.yourdomain.com</span> (apex auto-redirects to www). Set TTL to 300 for faster propagation.</p>

                  <div className="space-y-4">
                    {/* A Record for apex domain */}
                    <div className="bg-[#f9fafb] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold text-[#374151]">Step 1: A Record <span className="font-normal text-[#6b7280]">— apex domain ({domains.find((d) => d.status !== "active")?.domain || "yourdomain.com"})</span></p>
                        {dnsRecordStatus && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${dnsRecordStatus.aRecord ? "text-green-600" : "text-[#9ca3af]"}`}>
                            {dnsRecordStatus.aRecord ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {dnsRecordStatus.aRecord ? "Verified" : "Not found"}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="text-[#6b7280] w-14">Type:</span>
                          <span className="font-mono font-medium text-[#1a1a2e]">A</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[#6b7280] w-14">Name:</span>
                            <span className="font-mono font-medium text-[#1a1a2e]">@</span>
                          </div>
                          <button onClick={() => copyToClipboard("@")} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1">
                            {copiedValue === "@" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedValue === "@" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[#6b7280] w-14">Value:</span>
                            <span className="font-mono font-medium text-[#7c3aed]">216.150.1.1</span>
                          </div>
                          <button onClick={() => copyToClipboard("216.150.1.1")} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1">
                            {copiedValue === "216.150.1.1" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedValue === "216.150.1.1" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* CNAME Record for www */}
                    <div className="bg-[#f9fafb] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold text-[#374151]">Step 2: CNAME Record <span className="font-normal text-[#6b7280]">— www subdomain (www.{domains.find((d) => d.status !== "active")?.domain || "yourdomain.com"})</span></p>
                        {dnsRecordStatus && (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${dnsRecordStatus.cname ? "text-green-600" : "text-[#9ca3af]"}`}>
                            {dnsRecordStatus.cname ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {dnsRecordStatus.cname ? "Verified" : "Not found"}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="text-[#6b7280] w-14">Type:</span>
                          <span className="font-mono font-medium text-[#1a1a2e]">CNAME</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[#6b7280] w-14">Name:</span>
                            <span className="font-mono font-medium text-[#1a1a2e]">www</span>
                            <span className="relative group">
                              <Info className="h-3 w-3 text-[#9ca3af] cursor-help" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-[#1a1a2e] text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">Enter &quot;www&quot; or &quot;@&quot; — try both if one doesn&apos;t work</span>
                            </span>
                          </div>
                          <button onClick={() => copyToClipboard("www")} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1">
                            {copiedValue === "www" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedValue === "www" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[#6b7280] w-14">Value:</span>
                            <span className="font-mono font-medium text-[#7c3aed]">cname.vercel-dns.com</span>
                          </div>
                          <button onClick={() => copyToClipboard("cname.vercel-dns.com")} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1">
                            {copiedValue === "cname.vercel-dns.com" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedValue === "cname.vercel-dns.com" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* TXT Verification */}
                    {domains.filter((d) => d.status !== "active" && d.status !== "ssl_provisioning").map((d) => (
                      <div key={d.id} className="bg-[#f9fafb] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[12px] font-semibold text-[#374151]">Step 3: TXT Record for verification ({d.domain})</p>
                          {dnsRecordStatus && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${dnsRecordStatus.txt ? "text-green-600" : "text-[#9ca3af]"}`}>
                              {dnsRecordStatus.txt ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              {dnsRecordStatus.txt ? "Verified" : "Not found"}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-[#6b7280] w-14">Type:</span>
                            <span className="font-mono font-medium text-[#1a1a2e]">TXT</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[12px]">
                              <span className="text-[#6b7280] w-14">Name:</span>
                              <span className="font-mono font-medium text-[#1a1a2e]">_storelib</span>
                            </div>
                            <button onClick={() => copyToClipboard("_storelib")} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1">
                              {copiedValue === "_storelib" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {copiedValue === "_storelib" ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 text-[12px] min-w-0">
                              <span className="text-[#6b7280] w-14 shrink-0">Value:</span>
                              <span className="font-mono font-medium text-[#7c3aed] break-all text-[11px]">{d.verification_token}</span>
                            </div>
                            <button onClick={() => copyToClipboard(d.verification_token)} className="text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1 shrink-0">
                              {copiedValue === d.verification_token ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {copiedValue === d.verification_token ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* SSL Provisioning notice */}
                    {domains.some((d) => d.status === "ssl_provisioning") && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-[13px] font-medium text-blue-800 mb-1">SSL certificate is being issued</p>
                        <p className="text-[12px] text-blue-600">Your DNS is correctly configured. An SSL certificate is being provisioned automatically. This usually takes 1-10 minutes. This page will update automatically when complete.</p>
                      </div>
                    )}

                    {/* Cloudflare tip */}
                    <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100">
                      <p className="text-[12px] font-semibold text-amber-800 mb-1">Using Cloudflare?</p>
                      <p className="text-[11px] text-amber-700">Set the DNS records to &quot;DNS only&quot; (grey cloud icon, not orange proxy). Set SSL mode to &quot;Full (strict)&quot;. The orange proxy can block SSL certificate issuance.</p>
                    </div>

                    <p className="text-[11px] text-[#b0b5bd] leading-relaxed">DNS propagation may take a few minutes to 48 hours. Click &quot;Verify&quot; after adding records. Remove any conflicting A, AAAA, or CNAME records.</p>
                  </div>
                </div>
              )}

              {/* How Custom Domains Work */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">How Custom Domains Work</h3>
                {(() => {
                  const activeDomain = domains.find((d) => d.status === "active")?.domain
                  const displayDomain = activeDomain || "yourdomain.com"
                  return (
                    <div className="space-y-3">
                      {[
                        { title: "Your Store", from: `${username}.storelib.com`, to: displayDomain },
                        { title: "Your OnePage", from: `${username}.storelib.com/links`, to: `${displayDomain}/links` },
                        { title: "Product Pages", from: `${username}.storelib.com/p/...`, to: `${displayDomain}/p/...` },
                      ].map((item, i) => (
                        <div key={i} className="group bg-[#f9fafb] hover:bg-[#f5f3ff]/50 rounded-xl p-3.5 border border-[#e5e7eb] hover:border-[#ede9fe] transition-all duration-200">
                          <p className="text-[13px] font-semibold text-[#374151] mb-2">{item.title}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] bg-[#e5e7eb]/60 text-[#6b7280] px-2 py-0.5 rounded">{item.from}</span>
                            <ChevronRight className="h-3 w-3 text-[#9ca3af] shrink-0" />
                            <span className="font-mono text-[11px] bg-[#ede9fe] text-[#7c3aed] font-medium px-2 py-0.5 rounded">{item.to}</span>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-[#9ca3af] mt-2">Marketplace traffic continues to work via <span className="font-mono">{username}.storelib.com</span></p>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

        </form>
      </div>

      {/* Sticky Save Bar - Smooth fade animation */}
      <div
        className={`fixed bottom-0 left-0 right-0 md:left-[220px] z-40 bg-white/95 backdrop-blur-sm border-t border-[#e5e7eb]/60 pb-[env(safe-area-inset-bottom)] transition-all duration-300 ease-out ${
          hasUnsavedChanges && !showEmailChangeModal && !showLanguageModal && !showTimezoneModal && !showCountryModal && !showDeleteModal && !showAvatarUploadModal && !showAvatarCropModal
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[14px] text-[#6b7280]">{t("settings.unsavedChanges")}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                // Reset to initial values
                setFirstName(initialValues.current.firstName)
                setLastName(initialValues.current.lastName)
                setUsername(initialValues.current.username)
                setAvatarUrl(initialValues.current.avatarUrl)
                setAddressLine1(initialValues.current.addressLine1)
                setCity(initialValues.current.city)
                setState(initialValues.current.state)
                setPostalCode(initialValues.current.postalCode)
                setCountry(initialValues.current.country)
                setSelectedLanguage(initialLanguage.current)
                setSelectedTimezone(initialTimezone.current)
                setSupportEmail(initialSupportEmail.current)
              }}
              className="px-4 h-10 text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] rounded-lg transition-colors cursor-pointer"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isLoading}
              className="px-5 h-10 text-[14px] font-medium rounded-lg transition-colors flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("settings.save")
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Avatar Upload Modal */}
      <ImageUploadModal
        isOpen={showAvatarUploadModal}
        onClose={() => setShowAvatarUploadModal(false)}
        onFileSelect={handleAvatarFileSelect}
        fileInputRef={avatarInputRef as React.RefObject<HTMLInputElement>}
      />

      {/* Avatar Crop Modal */}
      <ImageCropModal
        isOpen={showAvatarCropModal}
        onClose={() => {
          setShowAvatarCropModal(false)
          if (tempAvatarUrl) {
            URL.revokeObjectURL(tempAvatarUrl)
          }
          setTempAvatarUrl(null)
          setTempAvatarFile(null)
        }}
        tempImageUrl={tempAvatarUrl}
        onSave={handleAvatarCropSave}
        isSaving={isUploadingAvatar}
      />

      {/* Country Selector Modal */}
      <CountrySelectorModal isOpen={showCountryModal} onClose={() => setShowCountryModal(false)} selectedCountry={country} onSelect={setCountry} />

      {/* Email Change Modal */}
      <MobileBottomSheet isOpen={showEmailChangeModal} onClose={closeEmailChangeModal} title={emailChangeStep === "input" ? "Change Email Address" : "Verify Your New Email"}>
        {emailChangeSuccess ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">Email Updated!</h3>
            <p className="text-[13px] text-[#6b7280]">Your email has been successfully changed.</p>
          </div>
        ) : emailChangeStep === "input" ? (
          <div className="space-y-4">
            <p className="text-[13px] text-[#6b7280]">Enter your new email address. We&apos;ll send a verification code to confirm.</p>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-[#374151]">Current Email</Label>
              <Input value={currentEmail} disabled className="h-11 bg-[#f9fafb] border-[#e5e7eb] rounded-xl text-[14px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-[#374151]">New Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter new email address"
                className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
              />
            </div>
            {emailChangeError && <p className="text-[13px] text-red-600 bg-red-50 p-3 rounded-xl">{emailChangeError}</p>}
            <button
              type="button"
              onClick={handleSendEmailChangeCode}
              disabled={emailChangeLoading || !newEmail}
              className="w-full h-11 text-[14px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {emailChangeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : (
                "Send Verification Code"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-[#6b7280]">
              Enter the 6-digit code we sent to <span className="font-medium text-[#1a1a2e]">{newEmail}</span>
            </p>
            <div className="flex justify-center gap-2">
              {verificationCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    codeInputRefs.current[index] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeInput(index, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(index, e)}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                />
              ))}
            </div>
            {emailChangeError && <p className="text-[13px] text-red-600 bg-red-50 p-3 rounded-xl text-center">{emailChangeError}</p>}
            <button
              type="button"
              onClick={handleVerifyEmailChange}
              disabled={emailChangeLoading || verificationCode.join("").length !== 6}
              className="w-full h-11 text-[14px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {emailChangeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Change Email"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailChangeStep("input")
                setEmailChangeError(null)
              }}
              className="w-full text-[13px] text-[#6b7280] hover:text-[#374151] py-2"
            >
              Use a different email
            </button>
          </div>
        )}
      </MobileBottomSheet>

      {/* Language Selector Modal */}
      <MobileBottomSheet isOpen={showLanguageModal} onClose={() => setShowLanguageModal(false)} title="Select Language">
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setSelectedLanguage(lang.code)
                setShowLanguageModal(false)
              }}
              className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${
                selectedLanguage === lang.code
                  ? "bg-[#f5f3ff] text-[#8b5cf6]"
                  : "text-[#374151] hover:bg-[#f3f4f6] active:bg-[#e5e7eb]"
              }`}
            >
              <span>{lang.name}</span>
              {selectedLanguage === lang.code && (
                <Check className="h-4 w-4 text-[#8b5cf6]" />
              )}
            </button>
          ))}
        </div>
      </MobileBottomSheet>

      {/* Timezone Selector Modal */}
      <MobileBottomSheet isOpen={showTimezoneModal} onClose={() => setShowTimezoneModal(false)} title="Select Timezone">
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {TIMEZONES.map((tz) => (
            <button
              key={tz.code}
              onClick={() => {
                setSelectedTimezone(tz.code)
                setShowTimezoneModal(false)
              }}
              className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${
                selectedTimezone === tz.code
                  ? "bg-[#f5f3ff] text-[#8b5cf6]"
                  : "text-[#374151] hover:bg-[#f3f4f6] active:bg-[#e5e7eb]"
              }`}
            >
              <div className="flex flex-col">
                <span>{tz.name}</span>
                <span className="text-[12px] text-[#9ca3af]">{tz.offset}</span>
              </div>
              {selectedTimezone === tz.code && (
                <Check className="h-4 w-4 text-[#8b5cf6]" />
              )}
            </button>
          ))}
        </div>
      </MobileBottomSheet>

      {/* Delete Account Modal */}
      <MobileBottomSheet
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeleteStep("confirm")
          setDeleteVerificationCode(["", "", "", "", "", ""])
          setDeleteError(null)
        }}
        title={deleteStep === "confirm" ? "Delete Account" : "Verify Deletion"}
      >
        {deleteStep === "confirm" ? (
          <div className="space-y-4">
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#2d2d44] rounded-full flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-white text-[14px]">This action cannot be undone</p>
                  <p className="text-[13px] text-[#9ca3af] mt-1">
                    Deleting your account will permanently remove all your data, including products, customers, and sales history.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[13px] text-[#6b7280]">
              We&apos;ll send a verification code to <span className="font-medium text-[#1a1a2e]">{currentEmail}</span> to confirm this action.
            </p>
            {deleteError && <p className="text-[13px] text-white bg-[#1a1a2e] p-3 rounded-xl">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteError(null)
                }}
                className="flex-1 h-11 text-[14px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendDeleteCode}
                disabled={deleteLoading}
                className="flex-1 h-11 text-[14px] font-medium bg-[#1a1a2e] hover:bg-[#2d2d44] disabled:bg-[#6b7280] text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Code"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-[#6b7280]">
              Enter the 6-digit code we sent to <span className="font-medium text-[#1a1a2e]">{currentEmail}</span>
            </p>
            <div className="flex justify-center gap-2">
              {deleteVerificationCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    deleteCodeInputRefs.current[index] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDeleteCodeInput(index, e.target.value)}
                  onKeyDown={(e) => handleDeleteCodeKeyDown(index, e)}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e] focus:border-[#1a1a2e]"
                />
              ))}
            </div>
            {deleteError && <p className="text-[13px] text-white bg-[#1a1a2e] p-3 rounded-xl text-center">{deleteError}</p>}
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteLoading || deleteVerificationCode.join("").length !== 6}
              className="w-full h-11 text-[14px] font-medium bg-[#1a1a2e] hover:bg-[#2d2d44] disabled:bg-[#6b7280] text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Permanently Delete Account"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteStep("confirm")
                setDeleteError(null)
              }}
              className="w-full text-[13px] text-[#6b7280] hover:text-[#374151] py-2 cursor-pointer"
            >
              Go back
            </button>
          </div>
        )}
      </MobileBottomSheet>
    </div>
    </>
  )
}
