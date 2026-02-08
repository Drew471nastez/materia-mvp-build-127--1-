"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  X, Check, Loader2, AlertCircle, Mail, Lock,
  CreditCard, Store, Shield, Settings, Wallet,
  Camera, ExternalLink, ChevronRight, Globe,
  User, Palette, Link2, FileText, Search, ChevronLeft, Upload, Copy, Pencil,
  ToggleLeft, LogOut, Trash2, Languages, Info
} from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getStoreUrl, getStoreUrlDisplay } from "@/lib/url-helpers"
import { useLanguage, LANGUAGES } from "@/lib/i18n"
import Image from "next/image"

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
  { id: "privacy", label: "Privacy", icon: ToggleLeft },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "stores", label: "Stores", icon: Store },
] as const

type TabId = typeof TABS[number]["id"]

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
    slug?: string
  }
  storeBuilderAvatarUrl?: string | null
  onepageAvatarUrl?: string | null
  googleAvatarUrl?: string | null
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
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      // Prevent layout shift by compensating for scrollbar
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = "hidden"
      document.body.style.paddingRight = `${scrollbarWidth}px`
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        document.body.style.overflow = ""
        document.body.style.paddingRight = ""
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.body.style.paddingRight = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      setDragY(diff * 0.8)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div
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
          style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">{title}</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto">{children}</div>
        </div>
      </div>
      {/* Mobile Bottom Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="sm:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-hidden"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="pt-3 pb-2">
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto max-h-[calc(90vh-60px)]">
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
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("")
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

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

export function SettingsFormNew({ profile, creator, storeBuilderAvatarUrl, onepageAvatarUrl, googleAvatarUrl }: SettingsFormProps) {
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

  const [activeTab, setActiveTab] = useState<TabId>("general")
  const [isTabLoading, setIsTabLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  // Avatar fallback order: Profile (manually set) → Store Builder → OnePage → Google → Initials
  // Filter out placeholder URLs to match layout.tsx logic for sidebar consistency
  const isValidAvatarUrl = (url: string | null | undefined): boolean => {
    return !!url && !url.includes("placeholder.svg")
  }

  const getDefaultAvatarUrl = () => {
    if (isValidAvatarUrl(profile.avatar_url)) return profile.avatar_url!
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
    supportEmail !== initialSupportEmail.current

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

  // Tab change with skeleton loading animation
  const handleTabChange = (newTab: TabId) => {
    if (newTab === activeTab) return
    setIsTabLoading(true)
    setActiveTab(newTab)
    // Show skeleton for 1.5 seconds
    setTimeout(() => {
      setIsTabLoading(false)
    }, 500)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", profile.id)
        .single()

      if (existingUser) {
        setError("This username is already taken")
        setIsLoading(false)
        return
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
        support_email: supportEmail || null
      }).eq("id", creator.id)

      if (creatorError) throw creatorError

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
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  const handleSignOutAllDevices = async () => {
    setSigningOutAll(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'global' })
      router.push("/")
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
        router.push("/")
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

  // Store URL for copy
  const [copied, setCopied] = useState(false)
  const handleCopyStoreUrl = () => {
    navigator.clipboard.writeText(storeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Save Toast Notification */}
      <div
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-out ${
          showSaveToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="bg-[#1a1a2e] text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2.5">
          <Check className="h-4.5 w-4.5 text-emerald-400" />
          <span className="text-[14px] font-medium">Your settings are saved</span>
        </div>
      </div>

      <div className="h-full overflow-y-scroll overflow-x-hidden page-scroll bg-[#fafafa]" style={{ scrollbarGutter: 'stable' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 sm:pb-52 overflow-x-hidden">
        {/* Header with Store URL */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("settings.title")}</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("settings.subtitle")}</p>
          </div>
          {/* Store URL with copy */}
          <div className="flex items-center gap-2">
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#8b5cf6] hover:text-[#7c3aed] transition-colors"
            >
              {storeUrlDisplay}
            </a>
            <button
              type="button"
              onClick={handleCopyStoreUrl}
              className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors"
              title="Copy store URL"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 text-[#9ca3af] hover:text-[#6b7280]" />
              )}
            </button>
          </div>
        </div>

        {/* Pill-shaped Tab Navigation - Hidden scrollbar, fixed height to prevent layout shift */}
        <div className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const tabLabel = tab.id === "general" ? t("settings.general") :
                              tab.id === "security" ? t("settings.security") :
                              tab.id === "privacy" ? t("settings.privacy") :
                              tab.id === "billing" ? t("settings.billing") :
                              tab.id === "payments" ? t("settings.payments") :
                              tab.id === "stores" ? t("settings.stores") : tab.label
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                    activeTab === tab.id
                      ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#e5e7eb]"
                      : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
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
            <div className="space-y-4 sm:space-y-6 animate-pulse">
              {/* Skeleton Card 1 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-200 rounded w-48" />
                  </div>
                </div>
              </div>
              {/* Skeleton Card 2 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-20" />
                    <div className="h-11 bg-gray-200 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-24" />
                    <div className="h-11 bg-gray-200 rounded-xl" />
                  </div>
                </div>
              </div>
              {/* Skeleton Card 3 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-16" />
                    <div className="h-11 bg-gray-200 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-28" />
                    <div className="h-11 bg-gray-200 rounded-xl" />
                  </div>
                </div>
              </div>
              {/* Skeleton Card 4 */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="h-5 bg-gray-200 rounded w-24 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-64 mb-4" />
                <div className="h-11 bg-gray-200 rounded-xl" />
              </div>
            </div>
          )}

          {/* General Tab */}
          {!isTabLoading && activeTab === "general" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Profile Image Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-4">
                  <a
                    href="/store-builder"
                    className="relative group cursor-pointer"
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="Profile"
                        width={72}
                        height={72}
                        className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full object-cover bg-[#f3f4f6]"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a78bfa] flex items-center justify-center text-white text-xl sm:text-2xl font-bold">
                        {firstName?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
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
                  className="w-full h-11 px-3 text-left border border-[#e5e7eb] rounded-xl text-[14px] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span className="text-[#1a1a2e]">
                    {TIMEZONES.find(tz => tz.code === selectedTimezone)?.name || selectedTimezone}
                    <span className="text-[#9ca3af] ml-2">
                      ({TIMEZONES.find(tz => tz.code === selectedTimezone)?.offset || ""})
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
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
                  <a
                    href="/help"
                    target="_blank"
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

          {/* Billing Tab */}
          {!isTabLoading && activeTab === "billing" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Current Plan Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Current Plan
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[18px] font-bold text-[#1a1a2e]">Free Plan</p>
                      <span className="text-[11px] font-medium text-[#8b5cf6] bg-[#f5f3ff] px-2 py-0.5 rounded-full">Current</span>
                    </div>
                    <p className="text-[13px] text-[#6b7280] mt-1">Basic features included</p>
                  </div>
                  <button type="button" className="px-5 h-10 text-[13px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl transition-colors">
                    Upgrade Plan
                  </button>
                </div>
              </div>

              {/* Payment Methods Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Payment Methods</h3>
                <div className="bg-[#f9fafb] rounded-xl p-4 text-center">
                  <CreditCard className="h-8 w-8 text-[#9ca3af] mx-auto mb-2" />
                  <p className="text-[13px] text-[#6b7280] mb-3">No payment methods added yet.</p>
                  <button type="button" className="px-4 h-9 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors">
                    Add Payment Method
                  </button>
                </div>
              </div>

              {/* Billing History Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Billing History</h3>
                <div className="bg-[#f9fafb] rounded-xl p-4 text-center">
                  <FileText className="h-8 w-8 text-[#9ca3af] mx-auto mb-2" />
                  <p className="text-[13px] text-[#6b7280]">No billing history available.</p>
                </div>
              </div>
            </div>
          )}

          {/* Payments Tab */}
          {!isTabLoading && activeTab === "payments" && (
            <div className="space-y-4 sm:space-y-6">
              {/* PayPal Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* PayPal Logo */}
                    <div className="w-14 h-14 flex items-center justify-center shrink-0">
                      <svg className="w-12 h-12" viewBox="0 0 124 33" fill="none">
                        <path d="M46.211 6.749h-6.839a.95.95 0 0 0-.939.802l-2.766 17.537a.57.57 0 0 0 .564.658h3.265a.95.95 0 0 0 .939-.803l.746-4.73a.95.95 0 0 1 .938-.803h2.165c4.505 0 7.105-2.18 7.784-6.5.306-1.89.013-3.375-.872-4.415-.972-1.142-2.696-1.746-4.985-1.746zM47.02 13.154c-.374 2.454-2.249 2.454-4.062 2.454h-1.032l.724-4.583a.57.57 0 0 1 .563-.481h.473c1.235 0 2.4 0 3.002.704.359.42.469 1.044.332 1.906z" fill="#253B80"/>
                        <path d="M66.654 13.075h-3.275a.57.57 0 0 0-.563.481l-.145.916-.229-.332c-.709-1.029-2.29-1.373-3.868-1.373-3.619 0-6.71 2.741-7.312 6.586-.313 1.918.132 3.752 1.22 5.031.998 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .562.66h2.95a.95.95 0 0 0 .939-.803l1.77-11.209a.568.568 0 0 0-.561-.658zm-4.565 6.374c-.316 1.871-1.801 3.127-3.695 3.127-.951 0-1.711-.305-2.199-.883-.484-.574-.668-1.391-.514-2.301.295-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.499.589.697 1.411.554 2.317z" fill="#253B80"/>
                        <path d="M84.096 13.075h-3.291a.954.954 0 0 0-.787.417l-4.539 6.686-1.924-6.425a.953.953 0 0 0-.912-.678h-3.234a.57.57 0 0 0-.541.754l3.625 10.638-3.408 4.811a.57.57 0 0 0 .465.9h3.287a.949.949 0 0 0 .781-.408l10.946-15.8a.57.57 0 0 0-.468-.895z" fill="#253B80"/>
                        <path d="M94.992 6.749h-6.84a.95.95 0 0 0-.938.802l-2.766 17.537a.569.569 0 0 0 .562.658h3.51a.665.665 0 0 0 .656-.562l.785-4.971a.95.95 0 0 1 .938-.803h2.164c4.506 0 7.105-2.18 7.785-6.5.307-1.89.012-3.375-.873-4.415-.971-1.142-2.694-1.746-4.983-1.746zm.789 6.405c-.373 2.454-2.248 2.454-4.062 2.454h-1.031l.725-4.583a.568.568 0 0 1 .562-.481h.473c1.234 0 2.4 0 3.002.704.359.42.468 1.044.331 1.906z" fill="#179BD7"/>
                        <path d="M115.434 13.075h-3.273a.567.567 0 0 0-.562.481l-.145.916-.23-.332c-.709-1.029-2.289-1.373-3.867-1.373-3.619 0-6.709 2.741-7.311 6.586-.312 1.918.131 3.752 1.219 5.031 1 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .564.66h2.949a.95.95 0 0 0 .938-.803l1.771-11.209a.571.571 0 0 0-.565-.658zm-4.565 6.374c-.314 1.871-1.801 3.127-3.695 3.127-.949 0-1.711-.305-2.199-.883-.484-.574-.666-1.391-.514-2.301.297-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.501.589.699 1.411.554 2.317z" fill="#179BD7"/>
                        <path d="M119.295 7.23l-2.807 17.858a.569.569 0 0 0 .562.658h2.822c.469 0 .867-.34.939-.803l2.768-17.536a.57.57 0 0 0-.562-.659h-3.16a.571.571 0 0 0-.562.482z" fill="#179BD7"/>
                        <path d="M7.266 29.154l.523-3.322-1.165-.027H1.061L4.927 1.292a.316.316 0 0 1 .314-.268h9.38c3.114 0 5.263.648 6.385 1.927.526.6.861 1.227 1.023 1.917.17.724.173 1.589.007 2.644l-.012.077v.676l.526.298a3.69 3.69 0 0 1 1.065.812c.45.513.741 1.165.864 1.938.127.795.085 1.741-.123 2.812-.24 1.232-.628 2.305-1.152 3.183a6.547 6.547 0 0 1-1.825 2c-.696.494-1.523.869-2.458 1.109-.906.236-1.939.355-3.072.355h-.73c-.522 0-1.029.188-1.427.525a2.21 2.21 0 0 0-.744 1.328l-.055.299-.924 5.855-.042.215c-.011.068-.03.102-.058.125a.155.155 0 0 1-.096.035H7.266z" fill="#253B80"/>
                        <path d="M23.048 7.667c-.028.179-.06.362-.096.55-1.237 6.351-5.469 8.545-10.874 8.545H9.326c-.661 0-1.218.48-1.321 1.132L6.596 26.83l-.399 2.533a.704.704 0 0 0 .695.814h4.881c.578 0 1.069-.42 1.16-.99l.048-.248.919-5.832.059-.32c.09-.572.582-.992 1.16-.992h.73c4.729 0 8.431-1.92 9.513-7.476.452-2.321.218-4.259-.978-5.622a4.667 4.667 0 0 0-1.336-1.03z" fill="#179BD7"/>
                        <path d="M21.754 7.151a9.757 9.757 0 0 0-1.203-.267 15.284 15.284 0 0 0-2.426-.177H11.12a1.172 1.172 0 0 0-1.159.992L8.553 17.504l-.05.31a1.336 1.336 0 0 1 1.321-1.132h2.752c5.405 0 9.637-2.195 10.874-8.545.037-.188.068-.371.096-.55a6.594 6.594 0 0 0-1.017-.354 9.04 9.04 0 0 0-.775-.082z" fill="#222D65"/>
                        <path d="M9.961 8.699a1.17 1.17 0 0 1 1.159-.991h7.005c.83 0 1.605.054 2.426.177a9.757 9.757 0 0 1 1.203.267c.329.093.628.202.896.327.314-2.001-.003-3.362-1.086-4.596C20.273 2.48 17.857 1.8 14.621 1.8H5.241a1.34 1.34 0 0 0-1.324 1.132L.063 25.573a.806.806 0 0 0 .795.932h5.791l1.454-9.225 1.858-8.581z" fill="#253B80"/>
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-semibold text-[#1a1a2e]">PayPal</h3>
                        <span className="px-2.5 py-0.5 text-[12px] font-medium bg-emerald-500 text-white rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      </div>
                      <p className="text-[14px] text-[#6b7280] mt-0.5">Connect to accept payments from PayPal and Credit/Debit cards</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-5 h-10 text-[14px] font-medium border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151] rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Manage
                  </button>
                </div>
              </div>

              {/* Stripe Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Stripe Logo */}
                    <div className="w-14 h-14 bg-[#635bff] rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-[24px] font-bold text-white">S</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Stripe</h3>
                        <span className="px-2.5 py-0.5 text-[12px] font-medium bg-emerald-500 text-white rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      </div>
                      <p className="text-[14px] text-[#6b7280] mt-0.5">Connect to accept payments from Credit/Debit cards</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-5 h-10 text-[14px] font-medium border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151] rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Manage
                  </button>
                </div>
              </div>

              {/* See all payment options link */}
              <a
                href="#"
                className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0891b2] hover:text-[#0e7490] transition-colors cursor-pointer"
              >
                See all payment options
                <ChevronRight className="h-4 w-4" />
              </a>

              {/* Your default currency */}
              <div className="pt-2">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-3">Your default currency</h3>
                <div className="max-w-[200px]">
                  <select className="w-full h-11 rounded-xl text-[14px] border border-[#e5e7eb] px-3 bg-white hover:bg-[#f9fafb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6] cursor-pointer transition-colors">
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="JPY">JPY</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
              </div>

              {/* Statement description */}
              <div className="pt-4">
                <p className="text-[14px] text-[#374151] mb-3">
                  <span className="font-semibold">Statement description</span>
                  <span className="text-[#6b7280]"> - will appear on your customers bank statement, they should recognise it&apos;s you</span>
                  <br />
                  <span className="text-[13px] text-[#9ca3af]">(maximum 11 characters)</span>
                </p>
                <div className="flex items-center max-w-md">
                  <div className="px-4 h-11 bg-[#f3f4f6] border border-r-0 border-[#e5e7eb] rounded-l-xl flex items-center">
                    <span className="text-[14px] text-[#6b7280] font-medium">STORELIB*</span>
                  </div>
                  <Input
                    type="text"
                    placeholder="YOURSTORE"
                    maxLength={11}
                    className="h-11 rounded-l-none rounded-r-xl text-[14px] border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6] uppercase flex-1"
                  />
                </div>
              </div>
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
              onClick={() => {
                // Trigger form submission
                const form = document.querySelector('form')
                if (form) {
                  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                }
              }}
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
