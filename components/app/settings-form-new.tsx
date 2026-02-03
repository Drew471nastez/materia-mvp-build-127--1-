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
  User, Palette, Link2, FileText, Search, ChevronLeft, Upload, Copy, Pencil
} from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getStoreUrl, getStoreUrlDisplay } from "@/lib/url-helpers"
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

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
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
                  className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between ${
                    selectedCountry === country.name
                      ? "bg-[#f5f3ff] text-[#8b5cf6]"
                      : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
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
  const [activeTab, setActiveTab] = useState<TabId>("general")
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
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
    country !== initialValues.current.country

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

  const storeUrl = getStoreUrl(username)
  const storeUrlDisplay = getStoreUrlDisplay(username)

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

      const { error: creatorError } = await supabase.from("creators").update({ slug: cleanUsername }).eq("id", creator.id)

      if (creatorError) throw creatorError

      setSuccess(true)
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
      router.refresh()
      setTimeout(() => setSuccess(false), 3000)
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
    <div className="h-full overflow-y-scroll page-scroll bg-[#fafafa]" style={{ scrollbarGutter: 'stable' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header with Store URL */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e]">Settings</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Manage your account and preferences</p>
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

        {/* Pill-shaped Tab Navigation - Hidden scrollbar */}
        <div className="mb-6 sm:mb-8 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-1 p-1 w-fit min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-[#f3f4f6] text-[#1a1a2e] border border-[#e5e7eb]"
                      : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <form onSubmit={handleSubmit}>
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Profile Image Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setShowAvatarUploadModal(true)}
                    className="relative group cursor-pointer"
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="Profile"
                        width={72}
                        height={72}
                        className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full object-cover bg-[#f3f4f6] transition-opacity group-hover:opacity-80"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a78bfa] flex items-center justify-center text-white text-xl sm:text-2xl font-bold transition-opacity group-hover:opacity-80">
                        {firstName?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                    {/* Hover pencil overlay */}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <Pencil className="h-5 w-5 text-white" />
                    </div>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1a1a2e] text-[15px]">Profile Photo</p>
                    <p className="text-[13px] text-[#6b7280] mb-2">JPG, PNG or GIF. Max 2MB.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAvatarUploadModal(true)}
                        className="px-3 py-1.5 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Upload
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="px-3 py-1.5 text-[13px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Personal Information Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-[#8b5cf6]" />
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-[13px] font-medium text-[#374151]">
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter first name"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-[13px] font-medium text-[#374151]">
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter last name"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                </div>
              </div>

              {/* Email Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#8b5cf6]" />
                  Email Address
                </h3>
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
              </div>

              {/* Address Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#8b5cf6]" />
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
                      className="w-full h-11 px-3 text-left border border-[#e5e7eb] rounded-xl text-[14px] bg-white hover:bg-[#f9fafb] transition-colors flex items-center justify-between"
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
                    href="/changelog"
                    target="_blank"
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
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
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
                  <a
                    href="/partners"
                    target="_blank"
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-[#6b7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span className="text-[14px] text-[#374151]">Hire a Storelib Partner</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      Hire a Partner
                    </button>
                  </a>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 px-6 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl text-[14px] font-medium shadow-sm cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                {success && (
                  <span className="text-emerald-600 text-[13px] flex items-center justify-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Changes saved successfully
                  </span>
                )}
                {error && (
                  <span className="text-red-600 text-[13px] flex items-center justify-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Password Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#8b5cf6]" />
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
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#8b5cf6]" />
                  Two-Factor Authentication
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Add an extra layer of security to your account.</p>
                <button type="button" disabled className="px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] text-[#9ca3af] rounded-xl cursor-not-allowed">
                  Coming Soon
                </button>
              </div>

              {/* Session Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">Active Sessions</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Sign out of your account on this device.</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors"
                >
                  Sign Out
                </button>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-50 rounded-2xl p-4 sm:p-6 border border-red-200">
                <h3 className="text-[15px] font-semibold text-red-900 mb-2">Danger Zone</h3>
                <p className="text-[13px] text-red-700 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <button type="button" disabled className="px-4 h-10 text-[13px] font-medium bg-red-100 text-red-400 rounded-xl cursor-not-allowed">
                  Delete Account
                </button>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === "billing" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Current Plan Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#8b5cf6]" />
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
          {activeTab === "payments" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Test Mode Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800 text-[14px]">Test Mode</p>
                    <p className="text-[13px] text-amber-700 mt-0.5">You&apos;re using Stripe test keys</p>
                    <p className="text-[12px] text-amber-600 mt-1">Connect payouts to sell paid products. You won&apos;t be able to accept payments until your Stripe account is connected and verified.</p>
                  </div>
                </div>
              </div>

              {/* Stripe Connect Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-[#635bff] rounded-lg flex items-center justify-center">
                    <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Stripe Connect</h3>
                    <p className="text-[13px] text-[#6b7280]">Receive payments directly to your bank account</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-[#f9fafb] rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Status</span>
                    <span className="text-[13px] font-medium text-red-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Not Connected
                    </span>
                  </div>
                  <button
                    type="button"
                    className="w-full h-10 text-[14px] font-medium bg-[#635bff] hover:bg-[#5851db] text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Connect Stripe
                  </button>
                </div>
              </div>

              {/* PayPal Optional Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-[#003087] rounded-lg flex items-center justify-center">
                    <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.108a.658.658 0 0 0-.65.55l-.866 5.497a.652.652 0 0 1-.643.55H7.076v.409h-.001z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a2e]">PayPal (Optional)</h3>
                    <p className="text-[13px] text-[#6b7280]">Alternative payment method for your customers</p>
                  </div>
                </div>
                <p className="text-[12px] text-[#9ca3af] mt-2 mb-4">PayPal is optional. Most creators use Stripe for payouts.</p>
                <div className="space-y-1.5">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    className="h-11 rounded-xl text-[14px] border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                  />
                  <p className="text-[12px] text-[#9ca3af]">Your PayPal account email (optional - save settings to update)</p>
                </div>
              </div>

              {/* Payment Settings Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">Payment Settings</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Configure your default payment preferences</p>

                <div className="space-y-4">
                  {/* Currency Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-medium text-[#374151]">Default Currency</Label>
                    <select className="w-full h-11 rounded-xl text-[14px] border border-[#e5e7eb] px-3 bg-white focus:ring-[#8b5cf6] focus:border-[#8b5cf6] cursor-pointer">
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="AUD">AUD - Australian Dollar</option>
                    </select>
                  </div>

                  {/* Statement Descriptor */}
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-medium text-[#374151]">Statement Descriptor</Label>
                    <Input
                      type="text"
                      placeholder="YOUR STORE"
                      maxLength={22}
                      className="h-11 rounded-xl text-[14px] border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6] uppercase"
                    />
                    <p className="text-[12px] text-[#9ca3af]">Appears on customer credit card statements (max 22 characters)</p>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Button
                  type="button"
                  className="h-11 px-6 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl text-[14px] font-medium shadow-sm cursor-pointer"
                >
                  Save Settings
                </Button>
              </div>
            </div>
          )}

          {/* Manage Stores Tab */}
          {activeTab === "stores" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Store Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                  <Store className="h-4 w-4 text-[#8b5cf6]" />
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
                    Visit Store
                  </a>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-[13px] font-medium text-[#374151]">
                    Store URL
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
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">Store Customization</h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Customize your store appearance and settings.</p>
                <a
                  href="/app/store-builder"
                  className="inline-flex items-center gap-2 px-4 h-10 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors"
                >
                  <Palette className="h-4 w-4" />
                  Open Store Builder
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

              {/* Save Button for Stores Tab */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || !!usernameError}
                  className="h-11 px-6 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl text-[14px] font-medium shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                {success && (
                  <span className="text-emerald-600 text-[13px] flex items-center justify-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Changes saved successfully
                  </span>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Sticky Save Bar */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[220px] z-50 bg-white border-t border-[#e5e7eb] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[#6b7280]">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[13px] font-medium">You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-3">
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
                }}
                className="px-4 h-10 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] rounded-xl transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={(e) => {
                  // Trigger form submission
                  const form = document.querySelector('form')
                  if (form) {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                  }
                }}
                disabled={isLoading}
                className="px-5 h-10 text-[13px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
