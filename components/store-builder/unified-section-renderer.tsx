"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  Section,
  ImageTextSettings,
  BenefitsSettings,
  TextBlockSettings,
  AnnouncementBarSettings,
  FeaturedProductsSettings,
  ShopHeaderSettings,
  ProductHeaderSettings,
  MoreFromSellerSettings,
  ReviewsSettings,
  AboutSettings,
  GlobalStoreSettings,
} from "@/lib/store-builder/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Package,
  ShoppingBag,
  CheckCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Files,
  Infinity,
  Share2,
  X,
  Link2,
  Facebook,
  Star,
  Heart,
  BadgeCheck,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ProductGallery } from "@/components/product/product-gallery"
import { SocialMediaIcons } from "./social-media-icons"
import { avatarSizeMap } from "@/lib/store-builder/defaults"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ReviewsList } from "@/components/reviews/reviews-list"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { verifiedBadgeLabels } from "@/lib/store-builder/defaults"
import * as LucideIcons from "lucide-react"

// Shared product type for consistency
export interface ProductData {
  id: string
  slug?: string
  title: string
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number
  sales_count?: number
  description?: string | null
  whats_included?: string[]
  gallery_urls?: string[]
  video_url?: string
  faqs?: Array<{ question: string; answer: string }>
  type?: string
  show_sales_badge?: boolean
  categories?: Array<{ id: string; name: string; slug: string; type: string | null }>
}

// Creator data type
export interface CreatorData {
  headline?: string | null
  bio?: string | null
  niche_tags?: string[] | null
  cover_url?: string | null
  avatar_url?: string | null
  show_total_sales_badge?: boolean
  slug?: string | null
  created_at?: string | null
}

// Profile data type
export interface ProfileData {
  display_name?: string | null
  avatar_url?: string | null
  username?: string | null
  created_at?: string | null
}

// Unified props for all section rendering
export interface UnifiedSectionProps {
  section: Section
  products?: ProductData[]
  isMobile?: boolean
  isPreviewMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  moreFromSellerProducts?: ProductData[]
  creatorName?: string
  productId?: string
  reviews?: any[]
  reviewsCount?: number
  reviewsAverage?: number
  accentColor?: string
  globalSettings?: GlobalStoreSettings
  // For About section
  sellerMemberSince?: string // ISO date string
  sellerTotalSales?: number
  // For inline editing in About section
  onUpdateAboutSettings?: (settings: Partial<AboutSettings>) => void
  // For opening About section in sidebar
  onOpenAboutSidebar?: () => void
}

// Helper function to get product href
const getProductHref = (product: ProductData): string => {
  return `/p/${product.slug || product.id}`
}

// Icon mapping for what's included items
function getIncludedItemIcon(item: string): React.ReactNode {
  const lowerItem = item.toLowerCase()
  if (lowerItem.includes("instant") || lowerItem.includes("download")) {
    return <Download className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  if (lowerItem.includes("files") || lowerItem.includes("included")) {
    return <Files className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  if (lowerItem.includes("lifetime") || lowerItem.includes("access")) {
    return <Infinity className="h-4 w-4 mt-0.5 shrink-0 text-black" />
  }
  return <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
}

// Share Modal Component - Fixed position to overlay everything
function ShareModal({
  isOpen,
  onClose,
  productTitle,
  productSlug,
}: {
  isOpen: boolean
  onClose: () => void
  productTitle: string
  productSlug?: string
}) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${productSlug}` : `/p/${productSlug}`

  const shareText = `Check out ${productTitle}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleShareTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, "_blank", "noopener,noreferrer")
  }

  const handleShareFacebook = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    window.open(facebookUrl, "_blank", "noopener,noreferrer")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />
      {/* Modal */}
      <div
        className="relative bg-background max-w-[280px] w-full mx-4 p-4 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <Button
            className="w-full justify-center gap-2 h-14 rounded-xl bg-black text-white hover:bg-black/90 text-base font-medium"
            onClick={handleShareTwitter}
          >
            <X className="h-5 w-5" />
            Share on X
          </Button>
          <Button
            className="w-full justify-center gap-2 h-14 rounded-xl bg-[#4267B2] text-white hover:bg-[#4267B2]/90 text-base font-medium"
            onClick={handleShareFacebook}
          >
            <Facebook className="h-5 w-5" />
            Share on Facebook
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center gap-2 h-14 rounded-xl text-base font-medium border-2 bg-transparent"
            onClick={handleCopyLink}
          >
            <Link2 className="h-5 w-5" />
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function SectionContainer({
  children,
  className,
  noPadding,
  isMobile,
  style,
}: {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
  isMobile?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1100px]", !noPadding && "px-3 sm:px-4 lg:px-6", className)} style={style}>
      {children}
    </div>
  )
}

// ====== REVIEWS SECTION - UNIFIED ======
function UnifiedReviewsSection({
  settings,
  isMobile,
  isPreviewMode,
  productId,
  reviews = [],
  reviewsCount = 0,
  reviewsAverage = 0,
  accentColor,
}: {
  settings: ReviewsSettings
  isMobile?: boolean
  isPreviewMode?: boolean
  productId?: string
  reviews?: any[]
  reviewsCount?: number
  reviewsAverage?: number
  accentColor?: string
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing

  if (!isPreviewMode && reviewsCount === 0 && reviews.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "mx-auto w-full",
        // Mobile: tighter padding (px-2)
        isMobile && "px-2",
        // Desktop: max width 1150px with standard padding
        !isMobile && "max-w-[1150px] px-4 sm:px-6",
      )}
      style={{
        paddingTop: spacing?.paddingTop,
        paddingBottom: spacing?.paddingBottom,
        backgroundColor: settings.colors?.backgroundColor || "transparent",
      }}
    >
      <div className="space-y-6">
        <ReviewsList
          productId={productId || ""}
          initialReviews={reviews}
          initialTotal={reviewsCount}
          reviewsCount={reviewsCount}
          reviewsAverage={reviewsAverage}
          showHeader={true}
          isPreview={isPreviewMode}
          isMobile={isMobile}
          accentColor={accentColor}
        />
      </div>
    </div>
  )
}

// Payment method icon components - using accurate brand designs
function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="white" stroke="#E5E7EB"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M13.976 6.5H18.3c2.186 0 3.27 1.075 3.27 2.715 0 2.334-1.608 3.754-4.066 3.754h-1.388c-.24 0-.41.194-.453.453l-.548 3.47c-.03.195-.166.358-.366.358h-2.168c-.2 0-.338-.195-.295-.44l1.4-9.91c.043-.26.204-.4.452-.4h-.162z" fill="#003087"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M23.176 6.5H27.5c1.285 0 2.297.455 2.654 1.525.227.68.2 1.393-.012 2.165-.404 2.25-1.925 3.704-4.088 3.704h-1.175c-.24 0-.41.194-.453.453l-.498 3.21c-.03.195-.166.357-.366.357h-1.9c-.2 0-.337-.194-.294-.44l1.28-9.9c.043-.26.203-.39.452-.39l.076-.684z" fill="#0070E0"/>
    </svg>
  )
}

function VisaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="white" stroke="#E5E7EB"/>
      <path d="M15.836 16.186h-2.344l1.465-8.966h2.344l-1.465 8.966z" fill="#00579F"/>
      <path d="M25.78 7.416c-.465-.18-1.191-.375-2.098-.375-2.316 0-3.946 1.221-3.957 2.97-.012 1.293 1.163 2.015 2.051 2.446.91.44 1.215.72 1.21 1.113-.005.602-.726.877-1.396.877-.934 0-1.43-.136-2.197-.472l-.3-.143-.327 2.011c.546.25 1.556.468 2.604.479 2.463 0 4.064-1.209 4.082-3.075.01-.873-.523-1.538-1.672-2.085-.696-.356-1.122-.593-1.117-.953 0-.32.36-.662 1.14-.662.65-.01 1.121.138 1.487.293l.179.088.27-1.65.041.138z" fill="#00579F"/>
      <path d="M29.095 7.22h-1.81c-.562 0-.982.161-1.228.748l-3.485 8.218h2.463s.403-1.109.494-1.352h3.008c.07.315.285 1.352.285 1.352h2.178l-1.905-8.966zm-2.894 5.79c.194-.52.937-2.521.937-2.521-.014.024.193-.523.312-.862l.16.778s.45 2.151.544 2.605h-1.953z" fill="#00579F"/>
      <path d="M11.77 7.22l-2.293 6.113-.245-1.244c-.426-1.437-1.754-2.996-3.24-3.775l2.099 7.87h2.48l3.688-8.964h-2.49z" fill="#00579F"/>
      <path d="M7.472 7.22H3.715l-.035.211c2.938.745 4.883 2.545 5.689 4.708l-.82-4.13c-.14-.578-.559-.77-1.077-.79z" fill="#FAA61A"/>
    </svg>
  )
}

function MastercardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="white" stroke="#E5E7EB"/>
      <circle cx="15" cy="12" r="7" fill="#EB001B"/>
      <circle cx="23" cy="12" r="7" fill="#F79E1B"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M19 17.64a6.97 6.97 0 002.5-5.36c0-2.17-.99-4.11-2.5-5.4A6.971 6.971 0 0016.5 12a6.97 6.97 0 002.5 5.64z" fill="#FF5F00"/>
    </svg>
  )
}

function AmexIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#006FCF"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.857 10.326l-.755 1.784h1.51l-.755-1.784zm15.714 2.388h-1.898v-.778h1.847v-1.162h-1.847v-.716h1.949l.898 1.325-.949 1.331zm-4.896-2.656h2.133l.632.87.663-.87h2.122v4.648l-1.724-2.412-.02.028 1.693 2.384h-1.254l-.652-.891-.663.891h-3.96l-.367-.865h-.806l-.366.865h-1.366l1.765-4.05-.02-.043-1.693 2.287h-1.377l-1.754-2.357v2.4h-2.23l-.366-.865H8.26l-.367.865H6.5l1.806-4.285h1.56l1.719 4.062V10.058h1.714l1.5 2.076 1.438-2.076h1.438v4.648z" fill="white"/>
    </svg>
  )
}

function ApplePayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="white" stroke="#E5E7EB"/>
      <path d="M11.195 8.414c.335-.42.561-.996.502-1.572-.486.05-1.076.324-1.424.733-.313.363-.585.942-.513 1.498.544.042 1.1-.276 1.435-.659z" fill="#000"/>
      <path d="M11.69 9.115c-.79-.047-1.463.448-1.84.448-.376 0-.957-.425-1.578-.413-.813.012-1.562.473-1.98 1.2-.845 1.463-.216 3.63.605 4.818.405.585.887 1.244 1.52 1.22.61-.024.84-.394 1.577-.394.737 0 .944.394 1.59.382.656-.012 1.07-.597 1.475-1.182.461-.673.65-1.325.663-1.36-.013-.012-1.27-.49-1.283-1.94-.012-1.21.988-1.788 1.033-1.823-.563-.83-1.439-.922-1.749-.947l-.033-.009z" fill="#000"/>
      <path d="M18.2 17.8V7.4h3.134c1.657 0 2.82 1.152 2.82 2.816 0 1.664-1.18 2.823-2.85 2.823h-2.043V17.8H18.2zm1.06-5.668h1.693c1.156 0 1.814-.619 1.814-1.716 0-1.097-.658-1.713-1.81-1.713h-1.698v3.43z" fill="#000"/>
      <path d="M24.82 15.4c0-1.074.824-1.732 2.29-1.813l1.687-.094v-.486c0-.684-.46-1.094-1.231-1.094-.71 0-1.172.36-1.28.913h-.972c.066-1.058.939-1.833 2.3-1.833 1.346 0 2.211.744 2.211 1.905v3.998h-1.002v-.967h-.024c-.297.642-.946 1.055-1.695 1.055-1.054 0-1.784-.65-1.784-1.584zm3.977-.476v-.498l-1.518.09c-.757.049-1.186.394-1.186.934 0 .552.442.913 1.12.913.88 0 1.584-.607 1.584-1.44z" fill="#000"/>
      <path d="M31.015 20v-.894c.075.012.243.018.33.018.474 0 .728-.199.886-.71l.095-.305-2.14-5.922h1.085l1.595 5.092h.024l1.594-5.092h1.056L33.307 18c-.49 1.366-1.054 1.806-2.236 1.806-.088 0-.264-.006-.356-.012z" fill="#000"/>
    </svg>
  )
}

function GooglePayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="white" stroke="#E5E7EB"/>
      <path d="M17.706 12.076v2.861h-.91V7.5h2.416c.58-.012 1.138.21 1.555.617.428.395.667.95.66 1.53a2.09 2.09 0 01-.66 1.556 2.148 2.148 0 01-1.555.605h-1.506v.268zm0-3.62v2.628h1.531c.355.011.698-.125.95-.378a1.27 1.27 0 00.389-.938 1.32 1.32 0 00-.39-.956 1.265 1.265 0 00-.949-.356h-1.531z" fill="#5F6368"/>
      <path d="M23.876 9.754c.679 0 1.214.181 1.606.545.392.363.588.86.588 1.492v3.062h-.87v-.69h-.039c-.38.569-.886.853-1.52.853-.54 0-.995-.161-1.362-.482-.367-.321-.55-.73-.55-1.225 0-.518.186-.93.559-1.236.373-.306.87-.46 1.492-.46.531 0 .969.098 1.314.293v-.206c0-.347-.138-.644-.414-.89a1.41 1.41 0 00-.947-.369c-.547 0-.98.231-1.296.693l-.802-.505c.468-.682 1.148-1.022 2.04-1.022l.201-.153zm-1.16 3.935c0 .263.108.483.324.66.216.176.471.265.766.265.415 0 .797-.157 1.146-.47.349-.314.523-.68.523-1.1-.279-.222-.67-.334-1.171-.334-.365 0-.67.09-.912.27-.243.179-.364.412-.364.7l-.312.009z" fill="#5F6368"/>
      <path d="M31.107 9.908l-3.012 6.927h-.94l1.118-2.408-1.982-4.519h.99l1.427 3.44h.02l1.39-3.44h.99z" fill="#5F6368"/>
      <path d="M14.093 11.713c0-.266-.022-.532-.068-.794h-4.32v1.502h2.472a2.116 2.116 0 01-.917 1.39v1.152h1.483a4.476 4.476 0 001.35-3.25z" fill="#4285F4"/>
      <path d="M9.706 15.992c1.24 0 2.281-.411 3.042-1.114l-1.483-1.152c-.41.276-.935.44-1.559.44-1.2 0-2.216-.81-2.58-1.9H5.6v1.189a4.6 4.6 0 004.106 2.537z" fill="#34A853"/>
      <path d="M7.126 12.266a2.76 2.76 0 010-1.758V9.32H5.6a4.6 4.6 0 000 4.134l1.526-1.188z" fill="#FBBC04"/>
      <path d="M9.706 8.608c.677-.011 1.329.246 1.822.72l1.36-1.36a4.426 4.426 0 00-3.182-1.24A4.6 4.6 0 005.6 9.265l1.526 1.189c.364-1.09 1.38-1.846 2.58-1.846z" fill="#EA4335"/>
    </svg>
  )
}

// Payment method icon mapping
const paymentMethodIcons: Record<string, React.FC<{ className?: string }>> = {
  paypal: PayPalIcon,
  visa: VisaIcon,
  mastercard: MastercardIcon,
  amex: AmexIcon,
  applepay: ApplePayIcon,
  googlepay: GooglePayIcon,
}

// Skeleton loading component for media
function MediaSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%]", className)}
      style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
    />
  )
}

// ====== ABOUT SECTION - UNIFIED ======
function UnifiedAboutSection({
  settings,
  isMobile,
  isPreviewMode,
  isEditorMode,
  creatorName,
  memberSince,
  totalSales,
  onUpdateSettings,
  onOpenSidebar,
  pageBackgroundColor,
}: {
  settings: AboutSettings
  isMobile?: boolean
  isPreviewMode?: boolean
  isEditorMode?: boolean
  creatorName?: string
  memberSince?: string
  totalSales?: number
  onUpdateSettings?: (settings: Partial<AboutSettings>) => void
  onOpenSidebar?: () => void
  pageBackgroundColor?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [needsTruncation, setNeedsTruncation] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [hoveredField, setHoveredField] = useState<"headline" | "content" | null>(null)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [mediaLoading, setMediaLoading] = useState<Record<string, boolean>>({})

  // Media carousel navigation handlers
  const mediaItems = settings.mediaItems || []
  const hasMultipleMedia = mediaItems.length > 1

  // Smooth transition handler
  const handleMediaTransition = (newIndex: number) => {
    if (isTransitioning || newIndex === currentMediaIndex) return
    setIsTransitioning(true)
    setCurrentMediaIndex(newIndex)
    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 400)
  }

  const goToPrevMedia = () => {
    const newIndex = currentMediaIndex === 0 ? mediaItems.length - 1 : currentMediaIndex - 1
    handleMediaTransition(newIndex)
  }

  const goToNextMedia = () => {
    const newIndex = currentMediaIndex === mediaItems.length - 1 ? 0 : currentMediaIndex + 1
    handleMediaTransition(newIndex)
  }

  const goToMediaIndex = (index: number) => {
    handleMediaTransition(index)
  }

  // Track media loading state
  const handleMediaLoad = (id: string) => {
    setMediaLoading(prev => ({ ...prev, [id]: false }))
  }

  const handleMediaLoadStart = (id: string) => {
    setMediaLoading(prev => ({ ...prev, [id]: true }))
  }

  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing

  // Get colors from settings
  const textColor = settings.colors?.textColor || undefined
  const backgroundColor = settings.colors?.backgroundColor || "transparent"

  // Always use creatorName from props for the "About [Name]" heading (non-editable)
  const displayName = creatorName || "Seller"
  // Use actual totalSales from props, not from settings (settings value is deprecated)
  const displayTotalSales = totalSales ?? 0
  // Use actual memberSince from props
  const displayMemberSince = memberSince
  // Fixed max height for 4 lines: text-base (16px) * leading-relaxed (1.625) * 4 lines = ~104px
  const maxContentHeight = 104

  // Format member since date to year - show current year as fallback in editor
  const memberSinceYear = displayMemberSince
    ? new Date(displayMemberSince).getFullYear()
    : isEditorMode ? new Date().getFullYear() : undefined

  // Check if content needs truncation (show Read more if more than 4 lines)
  useEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight
      setNeedsTruncation(contentHeight > maxContentHeight)
    }
  }, [settings.aboutContent])

  // Determine if we have headline or content to show
  const hasHeadline = !!settings.headline
  const hasContent = !!settings.aboutContent

  // Handle click to open sidebar settings
  const handleEditClick = () => {
    if (!isEditorMode || !onOpenSidebar) return
    onOpenSidebar()
  }

  // Get payment methods to display
  const paymentMethods = settings.paymentMethods ?? ["paypal", "visa", "mastercard", "amex", "applepay", "googlepay"]
  const showPaymentMethods = settings.showPaymentMethods ?? true

  return (
    <SectionContainer isMobile={isMobile}>
      <div
        className={cn(
          "w-full py-6 px-4 md:py-12",
          isMobile && "!py-6 !px-4"
        )}
        style={{
          paddingTop: spacing?.paddingTop,
          paddingBottom: spacing?.paddingBottom,
          backgroundColor,
        }}
      >
        {/* Top divider */}
        <div
          className="w-full h-px mb-8"
          style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
        />

        <div className={cn(
          "flex max-w-5xl mx-auto flex-col gap-6 md:flex-row md:gap-12",
          isMobile && "!flex-col !gap-6"
        )}>
          {/* Left Column - Seller Info */}
          <div className={cn(
            "flex-shrink-0 w-full md:w-64",
            isMobile && "!w-full"
          )}>
            <h3
              className={cn(
                "font-semibold mb-6 text-lg md:text-xl",
                isMobile && "!text-lg"
              )}
              style={{ color: textColor || undefined }}
            >
              About {displayName}
            </h3>

            {/* Stats - Sales is controlled by showSalesStats, Joined is always shown */}
            <div className="flex gap-8">
              {/* Sales - only shown when showSalesStats is true */}
              {settings.showSalesStats && (
                <div>
                  <p
                    className="text-xs uppercase tracking-wide mb-1"
                    style={{ color: textColor ? `${textColor}80` : "#6b7280" }}
                  >
                    Sales
                  </p>
                  <p
                    className={cn(
                      "font-semibold text-xl md:text-2xl",
                      isMobile && "!text-xl"
                    )}
                    style={{ color: textColor || undefined }}
                  >
                    {displayTotalSales}
                  </p>
                </div>
              )}

              {/* Member Since / Year Joined - always shown */}
              {memberSinceYear && (
                <div>
                  <p
                    className="text-xs uppercase tracking-wide mb-1"
                    style={{ color: textColor ? `${textColor}80` : "#6b7280" }}
                  >
                    Joined
                  </p>
                  <p
                    className={cn(
                      "font-semibold text-xl md:text-2xl",
                      isMobile && "!text-xl"
                    )}
                    style={{ color: textColor || undefined }}
                  >
                    {memberSinceYear}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - About Content */}
          <div className="flex-1 min-w-0">
            {/* Media Carousel - displayed above headline and content */}
            {mediaItems.length > 0 && (
              <div className="mb-6">
                {/* Carousel Container */}
                <div className="relative group">
                  {/* Carousel Track with smooth sliding animation */}
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <div
                      className="flex h-full transition-transform duration-400 ease-out"
                      style={{
                        transform: `translateX(-${currentMediaIndex * 100}%)`,
                        transitionDuration: '400ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      {mediaItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="relative w-full h-full flex-shrink-0"
                          style={{ minWidth: '100%' }}
                        >
                          {/* Skeleton loader shown while media loads */}
                          {mediaLoading[item.id] !== false && item.type === "image" && (
                            <div className="absolute inset-0 z-10">
                              <MediaSkeleton className="w-full h-full rounded-lg" />
                            </div>
                          )}

                          {item.type === "image" ? (
                            <Image
                              src={item.url}
                              alt={item.caption || ""}
                              fill
                              className={cn(
                                "object-cover transition-opacity duration-300",
                                mediaLoading[item.id] !== false ? "opacity-0" : "opacity-100"
                              )}
                              onLoadStart={() => handleMediaLoadStart(item.id)}
                              onLoad={() => handleMediaLoad(item.id)}
                            />
                          ) : item.type === "youtube" ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${extractYouTubeId(item.url)}`}
                              className="w-full h-full"
                              allowFullScreen
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                          ) : (
                            <video
                              src={item.url}
                              className="w-full h-full object-cover"
                              controls
                              playsInline
                              poster={item.thumbnailUrl}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Navigation Arrows - always visible on mobile, hover on desktop */}
                    {hasMultipleMedia && (
                      <>
                        {/* Left Arrow */}
                        <button
                          onClick={goToPrevMedia}
                          disabled={isTransitioning}
                          className={cn(
                            "absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all duration-200 z-20",
                            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            isTransitioning && "cursor-not-allowed opacity-50"
                          )}
                          aria-label="Previous media"
                        >
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        {/* Right Arrow */}
                        <button
                          onClick={goToNextMedia}
                          disabled={isTransitioning}
                          className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all duration-200 z-20",
                            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            isTransitioning && "cursor-not-allowed opacity-50"
                          )}
                          aria-label="Next media"
                        >
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Navigation Dots */}
                  {hasMultipleMedia && (
                    <div className="flex justify-center gap-1.5 mt-3">
                      {mediaItems.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => goToMediaIndex(index)}
                          disabled={isTransitioning}
                          className={cn(
                            "w-2 h-2 rounded-full transition-all duration-300",
                            index === currentMediaIndex
                              ? "bg-current w-4"
                              : "bg-current opacity-40 hover:opacity-60",
                            isTransitioning && "cursor-not-allowed"
                          )}
                          style={{ color: textColor || "#374151" }}
                          aria-label={`Go to media ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Caption for current media */}
                {mediaItems[currentMediaIndex]?.caption && (
                  <p
                    className={cn(
                      "mt-2 text-center text-xs md:text-sm",
                      isMobile && "!text-xs"
                    )}
                    style={{ color: textColor ? `${textColor}90` : "#6b7280" }}
                  >
                    {mediaItems[currentMediaIndex].caption}
                  </p>
                )}
              </div>
            )}

            {/* Headline - with inline edit placeholder in editor mode */}
            {hasHeadline ? (
              <div
                className="group mb-4"
                onMouseEnter={() => setHoveredField("headline")}
                onMouseLeave={() => setHoveredField(null)}
              >
                <span className="inline-flex items-center gap-2">
                  <h4
                    className={cn(
                      "font-semibold text-lg md:text-2xl",
                      isMobile && "!text-lg"
                    )}
                    style={{ color: textColor || undefined }}
                  >
                    {settings.headline}
                  </h4>
                  {/* Edit icon on hover - only in editor mode */}
                  {isEditorMode && hoveredField === "headline" && (
                    <button
                      onClick={handleEditClick}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </span>
              </div>
            ) : (
              // Placeholder for headline in editor mode
              isEditorMode && (
                <button
                  onClick={handleEditClick}
                  className={cn(
                    "flex items-center gap-2 mb-4 text-left transition-colors hover:opacity-80 text-sm md:text-lg",
                    isMobile && "!text-sm"
                  )}
                  style={{ color: textColor ? `${textColor}60` : "#9ca3af" }}
                >
                  <span className="text-lg font-bold">+</span>
                  <span className="font-semibold">Add a story headline</span>
                </button>
              )
            )}

            {/* About Content - with inline edit placeholder in editor mode */}
            {hasContent ? (
              <div
                className="relative group"
                onMouseEnter={() => setHoveredField("content")}
                onMouseLeave={() => setHoveredField(null)}
              >
                {/* Edit icon on hover - only in editor mode, positioned at top right of content */}
                {isEditorMode && hoveredField === "content" && (
                  <button
                    onClick={handleEditClick}
                    className="absolute -top-1 right-0 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-opacity z-20"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit
                  </button>
                )}
                <div
                  ref={contentRef}
                  className={cn(
                    "leading-relaxed overflow-hidden transition-all duration-300 text-sm md:text-base",
                    isMobile && "!text-sm",
                    !isExpanded && needsTruncation && "relative"
                  )}
                  style={{
                    maxHeight: !isExpanded && needsTruncation ? `${maxContentHeight}px` : undefined,
                    color: textColor ? `${textColor}cc` : "#374151",
                  }}
                >
                  <p className="whitespace-pre-wrap">{settings.aboutContent}</p>
                </div>

                {/* Fade gradient and Read more button */}
                {needsTruncation && !isExpanded && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
                    style={{
                      background: (() => {
                        // Use section background if set and not transparent
                        if (backgroundColor && backgroundColor !== "transparent") {
                          return `linear-gradient(to bottom, transparent, ${backgroundColor})`
                        }
                        // Fall back to page background color if available
                        if (pageBackgroundColor && pageBackgroundColor !== "transparent") {
                          return `linear-gradient(to bottom, transparent, ${pageBackgroundColor})`
                        }
                        // Default to white
                        return "linear-gradient(to bottom, transparent, white)"
                      })()
                    }}
                  />
                )}

                {needsTruncation && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={cn(
                      "mt-2 text-sm font-medium transition-colors hover:opacity-80",
                      !isExpanded && "relative z-10"
                    )}
                    style={{ color: textColor || "#374151" }}
                  >
                    {isExpanded ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
            ) : (
              // Placeholder for content in editor mode
              isEditorMode && (
                <button
                  onClick={handleEditClick}
                  className={cn(
                    "flex items-center gap-2 text-left transition-colors hover:opacity-80 text-sm md:text-base",
                    isMobile && "!text-sm"
                  )}
                  style={{ color: textColor ? `${textColor}60` : "#9ca3af" }}
                >
                  <span className="text-lg font-bold">+</span>
                  <span>Add your story. Tell shoppers a little about your business.</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Middle divider */}
        <div
          className="w-full h-px my-8"
          style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
        />

        {/* Accepted Payment Methods Section */}
        {showPaymentMethods && paymentMethods.length > 0 && (
          <div className={cn(
            "max-w-5xl mx-auto w-full",
            // Mobile: stack vertically, Desktop: side by side
            "flex flex-col gap-3 md:flex-row md:gap-12",
            // Override for editor preview mode
            isMobile && "!flex-col !gap-3"
          )}>
            <div className={cn(
              "flex-shrink-0 w-full md:w-64",
              isMobile && "!w-full"
            )}>
              <h4
                className={cn(
                  "font-semibold text-base md:text-lg",
                  isMobile && "!text-base"
                )}
                style={{ color: textColor || undefined }}
              >
                Accepted payment methods
              </h4>
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-wrap items-center gap-2">
                {paymentMethods.map((method) => {
                  const IconComponent = paymentMethodIcons[method]
                  if (!IconComponent) return null
                  return (
                    <IconComponent
                      key={method}
                      className={cn(
                        "flex-shrink-0 w-[42px] h-[26px] md:w-[45px] md:h-[30px]",
                        isMobile && "!w-[42px] !h-[26px]"
                      )}
                    />
                  )
                })}
              </div>
              {/* Returns & Exchanges - desktop: below payment icons, smaller text */}
              <div className={cn(
                "hidden md:block mt-4",
                isMobile && "!hidden"
              )}>
                <p
                  className="text-xs"
                  style={{ color: textColor ? `${textColor}99` : "#6b7280" }}
                >
                  <span className="font-medium">Returns & exchanges</span>
                  {" · "}
                  See item details for return and exchange eligibility.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Returns & Exchanges Section - Mobile only (stacked layout) */}
        <div className={cn(
          "max-w-5xl mx-auto w-full mt-6 md:hidden",
          isMobile && "!block !mt-6"
        )}>
          <div
            className="w-full h-px mb-6"
            style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
          />
          <h4
            className="font-semibold text-base mb-2"
            style={{ color: textColor || undefined }}
          >
            Returns & exchanges
          </h4>
          <p
            className="text-sm"
            style={{ color: textColor ? `${textColor}cc` : "#374151" }}
          >
            See item details for return and exchange eligibility.
          </p>
        </div>

        {/* Bottom divider */}
        <div
          className="w-full h-px mt-8"
          style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
        />
      </div>
    </SectionContainer>
  )
}

// Helper function to extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Unified Section Renderer - used by BOTH editor preview and live pages
export function UnifiedSectionRenderer({
  section,
  products = [],
  isMobile = false,
  isPreviewMode = false,
  isSelected = false,
  onSelect,
  moreFromSellerProducts = [],
  creatorName = "this creator",
  productId,
  reviews = [],
  reviewsCount = 0,
  reviewsAverage = 0,
  accentColor,
  globalSettings,
  sellerMemberSince,
  sellerTotalSales,
  onUpdateAboutSettings,
  onOpenAboutSidebar,
}: UnifiedSectionProps) {
  if (!section.settings.visible) return null

  // For more-from-seller, don't apply wrapper padding as it handles its own layout
  const isMoreFromSeller = section.type === "more-from-seller"

  const style = {
    paddingTop: isMoreFromSeller ? undefined : section.settings.spacing.paddingTop,
    paddingBottom: isMoreFromSeller ? undefined : section.settings.spacing.paddingBottom,
    paddingLeft: isMoreFromSeller ? undefined : section.settings.spacing.paddingLeft,
    paddingRight: isMoreFromSeller ? undefined : section.settings.spacing.paddingRight,
    backgroundColor: section.settings.colors.backgroundColor || "transparent",
    color: section.settings.colors.textColor || "inherit",
  }

  return (
    <div
      onClick={isPreviewMode ? undefined : onSelect}
      className={cn(
        "transition-all relative",
        !isPreviewMode && onSelect && "cursor-pointer",
        !isPreviewMode && isSelected && "ring-2 ring-sky-500 ring-inset",
      )}
      style={style}
    >
      {section.type === "image-text" && (
        <UnifiedImageTextSection
          settings={section.settings as ImageTextSettings}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
          globalSettings={globalSettings}
        />
      )}
      {section.type === "benefits" && (
        <UnifiedBenefitsSection
          settings={section.settings as BenefitsSettings}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
        />
      )}
      {section.type === "text-block" && (
        <UnifiedTextBlockSection
          settings={section.settings as TextBlockSettings}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
        />
      )}
      {section.type === "announcement-bar" && (
        <UnifiedAnnouncementBarSection
          settings={section.settings as AnnouncementBarSettings}
          isPreviewMode={isPreviewMode}
        />
      )}
      {section.type === "featured-products" && (
        <UnifiedFeaturedProductsSection
          settings={section.settings as FeaturedProductsSettings}
          products={products}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
          isEditorCanvas={!!onSelect}
        />
      )}
      {section.type === "more-from-seller" && (
        <UnifiedMoreFromSellerSection
          settings={section.settings as MoreFromSellerSettings}
          products={moreFromSellerProducts || products}
          creatorName={creatorName || "this creator"}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
        />
      )}
      {section.type === "reviews" && (
        <UnifiedReviewsSection
          settings={section.settings as ReviewsSettings}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
          productId={productId}
          reviews={reviews}
          reviewsCount={reviewsCount}
          reviewsAverage={reviewsAverage}
          accentColor={accentColor}
        />
      )}
      {section.type === "about" && (
        <UnifiedAboutSection
          settings={section.settings as AboutSettings}
          isMobile={isMobile}
          isPreviewMode={isPreviewMode}
          isEditorMode={!!onSelect}
          creatorName={creatorName}
          memberSince={sellerMemberSince}
          totalSales={sellerTotalSales}
          onUpdateSettings={onUpdateAboutSettings}
          onOpenSidebar={onOpenAboutSidebar}
          pageBackgroundColor={globalSettings?.themeColors?.background}
        />
      )}
    </div>
  )
}

// Image + Text Section - UNIFIED
function UnifiedImageTextSection({
  settings,
  isMobile,
  isPreviewMode,
  globalSettings,
}: { settings: ImageTextSettings; isMobile?: boolean; isPreviewMode?: boolean; globalSettings?: GlobalStoreSettings }) {
  // Safely get spacing with fallback defaults
  const defaultSpacing = { paddingTop: 48, paddingBottom: 48, paddingLeft: 16, paddingRight: 16 }
  const defaultMobileSpacing = { paddingTop: 24, paddingBottom: 24, paddingLeft: 12, paddingRight: 12 }
  const spacing = isMobile
    ? (settings.mobileSpacing || defaultMobileSpacing)
    : (settings.spacing || defaultSpacing)

  // Safely get typography with fallback
  const textAlign = settings.typography?.textAlign || "left"

  // Get text color from settings (theme-applied)
  const textColor = settings.colors?.textColor || undefined

  // Get theme button styles from globalSettings
  const themePreset = globalSettings?.themePreset || "default"
  const themeConfig = require("@/lib/store-builder/defaults").themePresets[themePreset]
  // Use custom button colors if set, otherwise fall back to theme defaults
  const themeButtonBgColor = themeConfig?.subscribeBar?.buttonColor || themeConfig?.colors?.primary || "#374151"
  const themeButtonTextColor = themeConfig?.subscribeBar?.buttonTextColor || "#ffffff"
  const buttonBgColor = settings.buttonColor || themeButtonBgColor
  const buttonTextColor = settings.buttonTextColor || themeButtonTextColor
  const buttonBorderRadius = themeConfig?.buttonBorderRadius || 8

  // Determine button URL based on link type
  const getButtonHref = () => {
    if (settings.buttonLinkType === "product" && settings.buttonProductSlug) {
      return `/p/${settings.buttonProductSlug}`
    }
    return settings.buttonUrl || "#"
  }

  // Determine if link should open in new tab
  const isExternalLink = settings.buttonLinkType === "custom" && settings.buttonUrl && !settings.buttonUrl.startsWith("#")

  return (
    <SectionContainer isMobile={isMobile}>
      <div
        className={cn(
          isMobile ? "flex flex-col gap-4" : "flex flex-col gap-8 items-center md:flex-row",
          !isMobile && (settings.imagePosition === "left" ? "md:flex-row" : "md:flex-row-reverse"),
        )}
        style={{
          paddingTop: spacing.paddingTop,
          paddingBottom: spacing.paddingBottom,
          paddingLeft: spacing.paddingLeft,
          paddingRight: spacing.paddingRight,
        }}
      >
        <div className="w-full">
          {settings.imageUrl ? (
            <div className={cn("relative rounded-lg overflow-hidden", "aspect-video")}>
              <Image
                src={settings.imageUrl || "/placeholder.svg"}
                alt=""
                fill
                className="object-cover"
                style={
                  settings.imageFocalPoint
                    ? { objectPosition: `${settings.imageFocalPoint.x}% ${settings.imageFocalPoint.y}%` }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className={cn("rounded-lg bg-muted flex items-center justify-center", "aspect-video")}>
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="w-full">
          <h2
            className={cn(
              "font-semibold",
              isMobile ? "text-lg" : "text-2xl sm:text-3xl",
              !textColor && "text-foreground",
            )}
            style={{
              textAlign: textAlign,
              color: textColor || undefined,
            }}
          >
            {settings.headline}
          </h2>
          <p
            className={cn(
              "mt-3 leading-relaxed",
              isMobile ? "text-sm" : "text-base",
              !textColor && "text-muted-foreground",
            )}
            style={{
              textAlign: textAlign,
              color: textColor ? `${textColor}99` : undefined,
            }}
          >
            {settings.body}
          </p>
          {settings.showButton && settings.buttonText && (
            <div className="mt-4" style={{ textAlign: textAlign }}>
              {isPreviewMode ? (
                <button
                  className={cn(
                    "inline-flex items-center justify-center font-medium transition-colors",
                    isMobile ? "px-4 py-2 text-sm" : "px-6 py-2.5 text-sm"
                  )}
                  style={{
                    backgroundColor: buttonBgColor,
                    color: buttonTextColor,
                    borderRadius: `${buttonBorderRadius}px`,
                  }}
                >
                  {settings.buttonText}
                </button>
              ) : isExternalLink ? (
                <a
                  href={settings.buttonUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center justify-center font-medium transition-colors hover:opacity-90",
                    isMobile ? "px-4 py-2 text-sm" : "px-6 py-2.5 text-sm"
                  )}
                  style={{
                    backgroundColor: buttonBgColor,
                    color: buttonTextColor,
                    borderRadius: `${buttonBorderRadius}px`,
                  }}
                >
                  {settings.buttonText}
                </a>
              ) : (
                <Link
                  href={getButtonHref()}
                  className={cn(
                    "inline-flex items-center justify-center font-medium transition-colors hover:opacity-90",
                    isMobile ? "px-4 py-2 text-sm" : "px-6 py-2.5 text-sm"
                  )}
                  style={{
                    backgroundColor: buttonBgColor,
                    color: buttonTextColor,
                    borderRadius: `${buttonBorderRadius}px`,
                  }}
                >
                  {settings.buttonText}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionContainer>
  )
}

// Icon mapping for benefits section
// Get Lucide icon component by name
function getBenefitIcon(iconName: string): React.ComponentType<{ className?: string }> | null {
  // Common icon mappings
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    "check-circle": LucideIcons.CheckCircle,
    "check": LucideIcons.Check,
    "star": LucideIcons.Star,
    "heart": LucideIcons.Heart,
    "shield": LucideIcons.Shield,
    "shield-check": LucideIcons.ShieldCheck,
    "zap": LucideIcons.Zap,
    "award": LucideIcons.Award,
    "trophy": LucideIcons.Trophy,
    "target": LucideIcons.Target,
    "gift": LucideIcons.Gift,
    "crown": LucideIcons.Crown,
    "sparkles": LucideIcons.Sparkles,
    "rocket": LucideIcons.Rocket,
    "flame": LucideIcons.Flame,
    "bolt": LucideIcons.Zap,
    "lightning": LucideIcons.Zap,
    "thumbs-up": LucideIcons.ThumbsUp,
    "smile": LucideIcons.Smile,
    "users": LucideIcons.Users,
    "user-check": LucideIcons.UserCheck,
    "clock": LucideIcons.Clock,
    "timer": LucideIcons.Timer,
    "calendar": LucideIcons.Calendar,
    "mail": LucideIcons.Mail,
    "phone": LucideIcons.Phone,
    "globe": LucideIcons.Globe,
    "map-pin": LucideIcons.MapPin,
    "lock": LucideIcons.Lock,
    "key": LucideIcons.Key,
    "credit-card": LucideIcons.CreditCard,
    "wallet": LucideIcons.Wallet,
    "dollar-sign": LucideIcons.DollarSign,
    "percent": LucideIcons.Percent,
    "tag": LucideIcons.Tag,
    "bookmark": LucideIcons.Bookmark,
    "flag": LucideIcons.Flag,
    "bell": LucideIcons.Bell,
    "megaphone": LucideIcons.Megaphone,
    "volume-2": LucideIcons.Volume2,
    "headphones": LucideIcons.Headphones,
    "mic": LucideIcons.Mic,
    "video": LucideIcons.Video,
    "camera": LucideIcons.Camera,
    "image": LucideIcons.Image,
    "film": LucideIcons.Film,
    "music": LucideIcons.Music,
    "play": LucideIcons.Play,
    "download": LucideIcons.Download,
    "upload": LucideIcons.Upload,
    "cloud": LucideIcons.Cloud,
    "server": LucideIcons.Server,
    "database": LucideIcons.Database,
    "cpu": LucideIcons.Cpu,
    "monitor": LucideIcons.Monitor,
    "smartphone": LucideIcons.Smartphone,
    "tablet": LucideIcons.Tablet,
    "laptop": LucideIcons.Laptop,
    "wifi": LucideIcons.Wifi,
    "bluetooth": LucideIcons.Bluetooth,
    "battery": LucideIcons.Battery,
    "power": LucideIcons.Power,
    "settings": LucideIcons.Settings,
    "tool": LucideIcons.Wrench,
    "wrench": LucideIcons.Wrench,
    "hammer": LucideIcons.Hammer,
    "brush": LucideIcons.Brush,
    "pen": LucideIcons.Pen,
    "pencil": LucideIcons.Pencil,
    "edit": LucideIcons.Edit,
    "scissors": LucideIcons.Scissors,
    "copy": LucideIcons.Copy,
    "clipboard": LucideIcons.Clipboard,
    "file": LucideIcons.File,
    "folder": LucideIcons.Folder,
    "archive": LucideIcons.Archive,
    "box": LucideIcons.Box,
    "package": LucideIcons.Package,
    "shopping-cart": LucideIcons.ShoppingCart,
    "shopping-bag": LucideIcons.ShoppingBag,
    "store": LucideIcons.Store,
    "truck": LucideIcons.Truck,
    "plane": LucideIcons.Plane,
    "car": LucideIcons.Car,
    "bike": LucideIcons.Bike,
    "ship": LucideIcons.Ship,
    "anchor": LucideIcons.Anchor,
    "compass": LucideIcons.Compass,
    "map": LucideIcons.Map,
    "navigation": LucideIcons.Navigation,
    "home": LucideIcons.Home,
    "building": LucideIcons.Building,
    "building-2": LucideIcons.Building2,
    "landmark": LucideIcons.Landmark,
    "factory": LucideIcons.Factory,
    "tree": LucideIcons.TreeDeciduous,
    "leaf": LucideIcons.Leaf,
    "flower": LucideIcons.Flower,
    "sun": LucideIcons.Sun,
    "moon": LucideIcons.Moon,
    "cloud-sun": LucideIcons.CloudSun,
    "cloud-rain": LucideIcons.CloudRain,
    "snowflake": LucideIcons.Snowflake,
    "droplet": LucideIcons.Droplet,
    "wind": LucideIcons.Wind,
    "thermometer": LucideIcons.Thermometer,
    "activity": LucideIcons.Activity,
    "heart-pulse": LucideIcons.HeartPulse,
    "stethoscope": LucideIcons.Stethoscope,
    "pill": LucideIcons.Pill,
    "syringe": LucideIcons.Syringe,
    "dumbbell": LucideIcons.Dumbbell,
    "apple": LucideIcons.Apple,
    "coffee": LucideIcons.Coffee,
    "utensils": LucideIcons.Utensils,
    "wine": LucideIcons.Wine,
    "beer": LucideIcons.Beer,
    "cake": LucideIcons.Cake,
    "pizza": LucideIcons.Pizza,
    "book": LucideIcons.Book,
    "book-open": LucideIcons.BookOpen,
    "graduation-cap": LucideIcons.GraduationCap,
    "school": LucideIcons.School,
    "library": LucideIcons.Library,
    "brain": LucideIcons.Brain,
    "lightbulb": LucideIcons.Lightbulb,
    "puzzle": LucideIcons.Puzzle,
    "gamepad": LucideIcons.Gamepad,
    "dice": LucideIcons.Dice1,
    "trophy": LucideIcons.Trophy,
    "medal": LucideIcons.Medal,
    "gem": LucideIcons.Gem,
    "diamond": LucideIcons.Diamond,
    "infinity": LucideIcons.Infinity,
    "circle": LucideIcons.Circle,
    "square": LucideIcons.Square,
    "triangle": LucideIcons.Triangle,
    "hexagon": LucideIcons.Hexagon,
    "octagon": LucideIcons.Octagon,
    "pentagon": LucideIcons.Pentagon,
  }

  // First check direct mapping
  if (iconMap[iconName]) {
    return iconMap[iconName]
  }

  // Try to find icon in LucideIcons by PascalCase name
  const pascalCase = iconName.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")
  const LucideIcon = (LucideIcons as any)[pascalCase]
  if (LucideIcon) {
    return LucideIcon
  }

  // Default fallback
  return LucideIcons.CheckCircle
}

// Benefits Section - UNIFIED with Carousel Support (Mobile Only)
function UnifiedBenefitsSection({ settings, isMobile, isPreviewMode }: { settings: BenefitsSettings; isMobile?: boolean; isPreviewMode?: boolean }) {
  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  // Mouse drag state for trackpad support
  const [isDragging, setIsDragging] = useState(false)
  const [mouseStart, setMouseStart] = useState<number | null>(null)
  const [mouseEnd, setMouseEnd] = useState<number | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)

  // Client-side mobile detection for live pages
  const [clientIsMobile, setClientIsMobile] = useState(false)

  useEffect(() => {
    // Detect mobile on client side for live pages (when isMobile prop is not explicitly true)
    const checkMobile = () => {
      setClientIsMobile(window.innerWidth < 768)
    }

    // Initial check
    checkMobile()

    // Listen for resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Use prop if in preview mode (editor), otherwise use client detection for live pages
  const effectiveMobile = isPreviewMode ? isMobile : (isMobile || clientIsMobile)

  // Safely get spacing with fallback defaults
  const defaultSpacing = { paddingTop: 48, paddingBottom: 48, paddingLeft: 16, paddingRight: 16 }
  const defaultMobileSpacing = { paddingTop: 24, paddingBottom: 24, paddingLeft: 12, paddingRight: 12 }
  const spacing = effectiveMobile
    ? (settings.mobileSpacing || defaultMobileSpacing)
    : (settings.spacing || defaultSpacing)

  // Get text color from settings (theme-applied)
  const textColor = settings.colors?.textColor || undefined
  const accentColor = settings.colors?.accentColor || undefined

  // Safely get typography with fallback
  const textAlign = settings.typography?.textAlign || "center"

  // Gap settings with defaults
  const horizontalGap = settings.horizontalGap ?? 24
  const verticalGap = settings.verticalGap ?? 24

  // Carousel settings - ONLY enable on mobile devices
  // Carousel is mobile-only: only shows on mobile view (published or preview canvas in mobile mode)
  const carouselEnabled = settings.enableCarousel ?? false
  const enableCarousel = carouselEnabled && effectiveMobile
  const autoplay = settings.autoplay ?? false
  const autoplaySpeed = settings.autoplaySpeed ?? 4000
  const benefitsCount = settings.benefits.length

  // Navigate to next slide
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % benefitsCount)
  }, [benefitsCount])

  // Navigate to previous slide
  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + benefitsCount) % benefitsCount)
  }, [benefitsCount])

  // Go to specific slide
  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  // Handle autoplay
  useEffect(() => {
    if (!enableCarousel || !autoplay || isHovered) {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current)
        autoplayRef.current = null
      }
      return
    }

    autoplayRef.current = setInterval(goToNext, autoplaySpeed)

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current)
      }
    }
  }, [enableCarousel, autoplay, autoplaySpeed, isHovered, goToNext])

  // Touch handlers for swipe support
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrev()
    }
  }

  // Mouse drag handlers for trackpad/mouse support
  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setMouseEnd(null)
    setMouseStart(e.clientX)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setMouseEnd(e.clientX)
  }

  const onMouseUp = () => {
    if (!isDragging) return
    setIsDragging(false)

    if (!mouseStart || !mouseEnd) return
    const distance = mouseStart - mouseEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrev()
    }

    setMouseStart(null)
    setMouseEnd(null)
  }

  const onMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false)
      setMouseStart(null)
      setMouseEnd(null)
    }
  }

  // Render a single benefit item
  const renderBenefitItem = (benefit: typeof settings.benefits[0], index: number) => {
    const useCustomImage = benefit.iconType === "custom" && benefit.customImageUrl
    const IconComponent = !useCustomImage ? getBenefitIcon(benefit.icon) : null

    return (
      <div key={benefit.id} className="text-center flex-shrink-0" style={{ width: enableCarousel ? "100%" : undefined }}>
        <div
          className={cn(
            "mx-auto rounded-full flex items-center justify-center mb-3 overflow-hidden",
            effectiveMobile ? "h-12 w-12" : "h-14 w-14",
            !textColor && "bg-primary/10",
          )}
          style={{
            backgroundColor: textColor ? `${textColor}15` : undefined,
          }}
        >
          {useCustomImage ? (
            <Image
              src={benefit.customImageUrl!}
              alt={benefit.title}
              width={effectiveMobile ? 48 : 56}
              height={effectiveMobile ? 48 : 56}
              className="w-full h-full object-cover"
            />
          ) : IconComponent ? (
            <IconComponent
              className={cn(effectiveMobile ? "h-6 w-6" : "h-7 w-7", !textColor && "text-primary")}
              style={{ color: textColor || undefined }}
            />
          ) : (
            <CheckCircle
              className={cn(effectiveMobile ? "h-6 w-6" : "h-7 w-7", !textColor && "text-primary")}
              style={{ color: textColor || undefined }}
            />
          )}
        </div>
        <h3
          className={cn(
            "font-semibold",
            effectiveMobile ? "text-base" : "text-lg",
            !textColor && "text-foreground",
          )}
          style={{ color: textColor || undefined }}
        >
          {benefit.title}
        </h3>
        <p
          className={cn(
            "mt-2 text-sm",
            !textColor && "text-muted-foreground",
          )}
          style={{ color: textColor ? `${textColor}99` : undefined }}
        >
          {benefit.description}
        </p>
      </div>
    )
  }

  return (
    <SectionContainer
      isMobile={effectiveMobile}
      style={{
        paddingTop: spacing.paddingTop,
        paddingBottom: spacing.paddingBottom,
        paddingLeft: spacing.paddingLeft,
        paddingRight: spacing.paddingRight,
      }}
    >
      {/* Only show headline if it has content */}
      {settings.headline && (
        <h2
          className={cn(
            "font-semibold",
            effectiveMobile ? "text-xl mb-6" : "text-2xl sm:text-3xl mb-8 sm:mb-12",
            !textColor && "text-foreground",
          )}
          style={{
            textAlign: textAlign,
            color: textColor || undefined,
          }}
        >
          {settings.headline}
        </h2>
      )}

      {enableCarousel ? (
        // Carousel mode
        <div
          className="relative group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Carousel container */}
          <div
            ref={carouselRef}
            className={cn("overflow-hidden select-none", isDragging && "cursor-grabbing")}
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(-${currentIndex * 100}%)`,
              }}
            >
              {settings.benefits.map((benefit, index) => (
                <div
                  key={benefit.id}
                  className="w-full flex-shrink-0 px-4"
                >
                  {renderBenefitItem(benefit, index)}
                </div>
              ))}
            </div>
          </div>

          {/* Navigation arrows - NEVER show on mobile (carousel is mobile-only with dots/swipe) */}
          {/* Since carousel is only enabled on mobile, we don't render arrows at all */}

          {/* Navigation dots */}
          {benefitsCount > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {settings.benefits.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                    index === currentIndex
                      ? "bg-primary w-6"
                      : "bg-primary/30 hover:bg-primary/50"
                  )}
                  style={{
                    backgroundColor: index === currentIndex
                      ? (accentColor || undefined)
                      : undefined,
                  }}
                  aria-label={`Go to benefit ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // Grid mode (original behavior)
        <div
          className={cn(
            "grid",
            effectiveMobile
              ? "grid-cols-1"
              : cn(
                  settings.columns === 2 && "grid-cols-1 sm:grid-cols-2",
                  settings.columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                  settings.columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
                ),
          )}
          style={{
            gap: `${verticalGap}px ${horizontalGap}px`,
          }}
        >
          {settings.benefits.map((benefit, index) => renderBenefitItem(benefit, index))}
        </div>
      )}
    </SectionContainer>
  )
}

// Text Block Section - UNIFIED
function UnifiedTextBlockSection({ settings, isMobile }: { settings: TextBlockSettings; isMobile?: boolean }) {
  // Safely get spacing with fallback defaults
  const defaultSpacing = { paddingTop: 32, paddingBottom: 32, paddingLeft: 16, paddingRight: 16 }
  const defaultMobileSpacing = { paddingTop: 16, paddingBottom: 16, paddingLeft: 12, paddingRight: 12 }
  const spacing = isMobile
    ? (settings.mobileSpacing || defaultMobileSpacing)
    : (settings.spacing || defaultSpacing)

  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    full: "max-w-4xl",
  }[settings.maxWidth || "md"]

  // Safely get typography with fallback
  const textAlign = settings.typography?.textAlign || "left"
  const lineHeight = settings.typography?.lineHeight || 1.6

  // Determine alignment class based on textAlign
  const alignmentClass = {
    left: "mr-auto",
    center: "mx-auto",
    right: "ml-auto",
  }[textAlign]

  // Get text color from settings (theme-applied)
  const textColor = settings.colors?.textColor || undefined

  return (
    <div
      className={cn(alignmentClass, isMobile ? "px-3 max-w-full" : cn("px-4", maxWidthClass))}
      style={{
        paddingTop: spacing.paddingTop,
        paddingBottom: spacing.paddingBottom,
        paddingLeft: spacing.paddingLeft,
        paddingRight: spacing.paddingRight,
      }}
    >
      {settings.headline && (
        <h2
          className={cn(
            "font-semibold mb-3",
            isMobile ? "text-lg" : "text-2xl sm:text-3xl mb-4",
            !textColor && "text-foreground",
          )}
          style={{
            textAlign: textAlign,
            color: textColor || undefined,
          }}
        >
          {settings.headline}
        </h2>
      )}
      <p
        className={cn(
          "leading-relaxed whitespace-pre-wrap",
          isMobile ? "text-sm" : "text-base",
          !textColor && "text-muted-foreground",
        )}
        style={{
          textAlign: textAlign,
          lineHeight: lineHeight,
          color: textColor ? `${textColor}99` : undefined,
        }}
      >
        {settings.body}
      </p>
    </div>
  )
}

// Announcement Bar Section - UNIFIED
function UnifiedAnnouncementBarSection({
  settings,
  isPreviewMode,
}: {
  settings: AnnouncementBarSettings
  isPreviewMode?: boolean
}) {
  if (!settings?.visible) return null

  const hasLink = settings.linkProductSlug || settings.linkUrl
  const cursorClass = hasLink ? "cursor-pointer" : "cursor-default"

  const handleTextClick = () => {
    if (settings.linkProductSlug) {
      window.location.href = `/p/${settings.linkProductSlug}`
    } else if (settings.linkUrl) {
      window.location.href = settings.linkUrl
    }
  }

  return (
    <SectionContainer className="py-3" noPadding={false}>
      <div
        className="w-full"
        style={{
          backgroundColor: settings.colors.backgroundColor || "#000000",
          color: settings.colors.textColor || "#ffffff",
        }}
      >
        <div
          className={`flex items-center justify-center gap-2 px-4 py-3 text-sm transition-opacity whitespace-nowrap overflow-hidden text-ellipsis ${cursorClass} ${
            hasLink ? "hover:opacity-90" : ""
          }`}
          onClick={hasLink && !isPreviewMode ? handleTextClick : undefined}
          role={hasLink ? "button" : undefined}
          tabIndex={hasLink ? 0 : undefined}
          onKeyDown={(e) => {
            if (hasLink && !isPreviewMode && (e.key === "Enter" || e.key === " ")) {
              handleTextClick()
            }
          }}
          style={{
            fontSize: `${settings.textSize || 14}px`,
          }}
        >
          <span className={cn("text-center leading-snug", settings.enableUnderline && hasLink && "underline")}>
            {settings.text || "New products available! Check them out."}
          </span>
        </div>
      </div>
    </SectionContainer>
  )
}

// Featured Products Section - UNIFIED
function UnifiedFeaturedProductsSection({
  settings,
  products,
  isMobile,
  isPreviewMode,
  isEditorCanvas = false,
}: {
  settings: FeaturedProductsSettings
  products?: ProductData[]
  isMobile?: boolean
  isPreviewMode?: boolean
  isEditorCanvas?: boolean
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "price-low" | "price-high" | "popular">("recent")
  const [isAnimating, setIsAnimating] = useState(false)
  const [runtimeIsMobile, setRuntimeIsMobile] = useState(false)
  const sortTouch = useRef({
    startX: 0,
    startY: 0,
    moved: false,
    timer: null as null | ReturnType<typeof setTimeout>,
    allowOpen: false,
  })

  // this opens the dropdown trigger programmatically
  const openSortDropdown = () => {
    const el = document.getElementById("sb-sort-trigger") as HTMLButtonElement | null
    el?.click()
  }

  const onSortPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return
    sortTouch.current.startX = e.clientX
    sortTouch.current.startY = e.clientY
    sortTouch.current.moved = false
    sortTouch.current.allowOpen = false

    // ✅ must “hold” briefly to open (prevents accidental opens while scrolling)
    sortTouch.current.timer = setTimeout(() => {
      if (!sortTouch.current.moved) {
        sortTouch.current.allowOpen = true
        openSortDropdown()
      }
    }, 140)
  }

  const onSortPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return
    const dx = Math.abs(e.clientX - sortTouch.current.startX)
    const dy = Math.abs(e.clientY - sortTouch.current.startY)
    if (dx > 6 || dy > 6) sortTouch.current.moved = true
  }

  const onSortPointerUp = () => {
    if (sortTouch.current.timer) clearTimeout(sortTouch.current.timer)
    sortTouch.current.timer = null
  }

  const onSortPointerCancel = () => {
    if (sortTouch.current.timer) clearTimeout(sortTouch.current.timer)
    sortTouch.current.timer = null
  }

  const onSortClickCapture = (e: React.MouseEvent) => {
    if (sortTouch.current.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    // If parent already forces mobile (Store Builder preview), trust it.
    if (isMobile) {
      setRuntimeIsMobile(true)
      return
    }

    // Otherwise detect real viewport (published site on phone)
    const mq = window.matchMedia("(max-width: 768px)")
    const update = () => setRuntimeIsMobile(mq.matches)

    update()
    mq.addEventListener?.("change", update)

    return () => mq.removeEventListener?.("change", update)
  }, [isMobile])

  const uiIsMobile = isMobile || runtimeIsMobile

  // Handler for category changes with subtle animation
  const handleCategoryChange = (categoryId: string | null) => {
    if (categoryId === selectedCategory) return
    setIsAnimating(true)
    // Small delay to trigger animation
    setTimeout(() => {
      setSelectedCategory(categoryId)
      setTimeout(() => setIsAnimating(false), 150)
    }, 50)
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // ✅ Build categories from ALL product categories (not only first one)
  const categoriesWithCounts = useMemo(() => {
    if (!products || products.length === 0) return []
    const map = new Map<string, { name: string; count: number }>()

    for (const p of products) {
      const cats = p.categories || []
      for (const c of cats) {
        if (!c?.id) continue
        const existing = map.get(c.id)
        if (existing) existing.count++
        else map.set(c.id, { name: c.name, count: 1 })
      }
    }

    return Array.from(map.entries()).map(([id, v]) => ({ id, name: v.name, count: v.count }))
  }, [products])

  const filteredProducts = useMemo(() => {
    // ✅ show ALL products by default (no maxProducts)
    let result =
      settings.productIds && settings.productIds.length > 0
        ? products?.filter((p) => settings.productIds.includes(p.id))
        : products

    if (selectedCategory && result) {
      result = result.filter((p) => (p.categories || []).some((c) => c.id === selectedCategory))
    }

    return result || []
  }, [products, settings.productIds, selectedCategory])

  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts]

    switch (sortBy) {
      case "oldest":
        sorted.reverse()
        break
      case "price-low":
        sorted.sort((a, b) => a.price_cents - b.price_cents)
        break
      case "price-high":
        sorted.sort((a, b) => b.price_cents - a.price_cents)
        break
      case "popular":
        sorted.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "recent":
      default:
        break
    }

    return sorted
  }, [filteredProducts, sortBy])

  const totalProducts = products?.length || 0

  const sortLabels: Record<typeof sortBy, string> = {
    recent: "Most Recent",
    oldest: "Oldest",
    "price-low": "Price: Low → High",
    "price-high": "Price: High → Low",
    popular: "Most Popular",
  }

  // ✅ Placeholder ONLY inside Store Builder canvas
  if (!products || products.length === 0) {
    if (isEditorCanvas) {
      return (
        <SectionContainer
          isMobile={isMobile}
          style={{
            paddingTop: spacing.paddingTop,
            paddingBottom: spacing.paddingBottom,
            paddingLeft: spacing.paddingLeft,
            paddingRight: spacing.paddingRight,
          }}
        >
          <h2
            className={cn("font-semibold text-foreground mb-6", "text-lg sm:text-xl")}
            style={{ textAlign: settings.typography.textAlign }}
          >
            {settings.headline}
          </h2>

          <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto 4" />
            <p className="text-muted-foreground">No products available</p>

            <Link
              href="/app/products/new"
              className="mt-3 inline-flex text-sm font-medium underline underline-offset-4 text-foreground hover:opacity-80"
            >
              Add Products
            </Link>
          </div>
        </SectionContainer>
      )
    }
    return null
  }

  return (
    <SectionContainer
      isMobile={isMobile}
      style={{
        paddingTop: spacing.paddingTop,
        paddingBottom: spacing.paddingBottom,
        paddingLeft: spacing.paddingLeft,
        paddingRight: spacing.paddingRight,
      }}
    >
      <div className={cn("flex", uiIsMobile ? "flex-col" : "flex-col md:flex-row md:gap-8")}>
        {/* Desktop sidebar - only show when NOT mobile AND category filter is not hidden */}
        {!uiIsMobile && !settings.hideCategoryFilter && (
          <div className="hidden md:block w-48 flex-shrink-0">
            <nav className="space-y-1">
              <button
                onClick={() => handleCategoryChange(null)}
                className={cn(
                  "w-full flex items-center justify-between py-2 pr-3 text-sm transition-all duration-200 border-r-2",
                  selectedCategory === null
                    ? "font-medium"
                    : "hover:opacity-80 border-transparent",
                )}
                style={{
                  color: selectedCategory === null
                    ? (settings.categoryFilterColors?.activeTextColor || settings.colors?.textColor || undefined)
                    : (settings.categoryFilterColors?.textColor || undefined),
                  borderColor: selectedCategory === null
                    ? (settings.categoryFilterColors?.borderColor || settings.colors?.textColor || undefined)
                    : "transparent",
                }}
              >
                <span>All</span>
                <span style={{ color: settings.categoryFilterColors?.textColor || undefined }}>{totalProducts}</span>
              </button>

              {categoriesWithCounts.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={cn(
                    "w-full flex items-center justify-between py-2 pr-3 text-sm transition-all duration-200 border-r-2",
                    selectedCategory === category.id
                      ? "font-medium"
                      : "hover:opacity-80 border-transparent",
                  )}
                  style={{
                    color: selectedCategory === category.id
                      ? (settings.categoryFilterColors?.activeTextColor || settings.colors?.textColor || undefined)
                      : (settings.categoryFilterColors?.textColor || undefined),
                    borderColor: selectedCategory === category.id
                      ? (settings.categoryFilterColors?.borderColor || settings.colors?.textColor || undefined)
                      : "transparent",
                  }}
                >
                  <span>{category.name}</span>
                  <span style={{ color: settings.categoryFilterColors?.textColor || undefined }}>{category.count}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div
            className={cn(
              "flex gap-3",
              uiIsMobile ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between",
            )}
          >
            <h2
              className={cn(
                "font-semibold",
                uiIsMobile ? "text-lg" : "text-xl sm:text-2xl",
                !settings.colors?.textColor && "text-foreground",
              )}
              style={{
                textAlign: settings.typography.textAlign,
                color: settings.colors?.textColor || undefined,
              }}
            >
              {settings.headline}
            </h2>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  id="sb-sort-trigger"
                  onPointerDown={runtimeIsMobile ? onSortPointerDown : undefined}
                  onPointerMove={runtimeIsMobile ? onSortPointerMove : undefined}
                  onPointerUp={runtimeIsMobile ? onSortPointerUp : undefined}
                  onPointerCancel={runtimeIsMobile ? onSortPointerCancel : undefined}
                  onClick={runtimeIsMobile ? (e) => e.preventDefault() : undefined}
                  className={cn(
                    // ✅ Mobile: subtle themed button - no visible border, very subtle appearance
                    runtimeIsMobile
                      ? "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 touch-pan-y select-none active:scale-[0.98] hover:bg-foreground/5"
                      : // ✅ Desktop: clean text control on the right
                        "inline-flex w-auto items-center gap-2 rounded-md px-2 py-1 text-sm hover:opacity-80 bg-transparent",
                    // Only apply default classes when no theme colors are set
                    !settings.categoryFilterColors?.textColor && !runtimeIsMobile && "text-muted-foreground hover:text-foreground",
                  )}
                  style={{
                    // Mobile: use theme-aware styling with subtle transparent background
                    ...(runtimeIsMobile ? {
                      backgroundColor: "transparent",
                      color: settings.categoryFilterColors?.textColor || settings.colors?.textColor || undefined,
                    } : {
                      color: settings.categoryFilterColors?.textColor || undefined,
                    }),
                  }}
                >
                  <span>Sort: {sortLabels[sortBy]}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortBy("recent")}>Most Recent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("oldest")}>Oldest</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("price-low")}>Price: Low → High</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("price-high")}>Price: High → Low</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("popular")}>Most Popular</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile pills - only show when mobile AND category filter is not hidden */}
          {uiIsMobile && !settings.hideCategoryFilter && (
            <div className="mt-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  onClick={() => handleCategoryChange(null)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]"
                  style={{
                    backgroundColor: selectedCategory === null
                      ? (settings.categoryFilterColors?.activeTextColor || settings.colors?.textColor || "rgba(255,255,255,0.9)")
                      : "transparent",
                    color: selectedCategory === null
                      ? (settings.productCardColors?.backgroundColor ||
                         (settings.colors?.textColor?.includes("fff") ? "#000000" : "#ffffff"))
                      : (settings.categoryFilterColors?.textColor || settings.colors?.textColor || undefined),
                    borderColor: selectedCategory === null
                      ? "transparent"
                      : (settings.categoryFilterColors?.borderColor ||
                         (settings.categoryFilterColors?.textColor ? `${settings.categoryFilterColors.textColor}50` : undefined) ||
                         (settings.colors?.textColor ? `${settings.colors.textColor}50` : undefined)),
                    boxShadow: selectedCategory === null
                      ? "0 2px 8px rgba(0,0,0,0.15)"
                      : undefined,
                  }}
                >
                  All <span className={selectedCategory === null ? "opacity-60" : "opacity-50"}>{totalProducts}</span>
                </button>

                {categoriesWithCounts.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryChange(category.id)}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]"
                    style={{
                      backgroundColor: selectedCategory === category.id
                        ? (settings.categoryFilterColors?.activeTextColor || settings.colors?.textColor || "rgba(255,255,255,0.9)")
                        : "transparent",
                      color: selectedCategory === category.id
                        ? (settings.productCardColors?.backgroundColor ||
                           (settings.colors?.textColor?.includes("fff") ? "#000000" : "#ffffff"))
                        : (settings.categoryFilterColors?.textColor || settings.colors?.textColor || undefined),
                      borderColor: selectedCategory === category.id
                        ? "transparent"
                        : (settings.categoryFilterColors?.borderColor ||
                           (settings.categoryFilterColors?.textColor ? `${settings.categoryFilterColors.textColor}50` : undefined) ||
                           (settings.colors?.textColor ? `${settings.colors.textColor}50` : undefined)),
                      boxShadow: selectedCategory === category.id
                        ? "0 2px 8px rgba(0,0,0,0.15)"
                        : undefined,
                    }}
                  >
                    {category.name} <span className={selectedCategory === category.id ? "opacity-60" : "opacity-50"}>{category.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid - use uiIsMobile to determine layout */}
          <div
            className={cn(
              "grid gap-4 mt-4 transition-opacity duration-150",
              uiIsMobile
                ? (settings.mobileListing ?? 1) === 1
                  ? "grid-cols-1"
                  : "grid-cols-2"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              isAnimating && "opacity-50",
            )}
          >
            {sortedProducts.map((product) => {
              // Get product card colors from theme settings
              const cardBgColor = settings.productCardColors?.backgroundColor || undefined
              const cardTextColor = settings.productCardColors?.textColor || settings.colors?.textColor || undefined
              const cardPriceColor = settings.productCardColors?.priceColor || (cardTextColor ? `${cardTextColor}99` : undefined)
              const cardBorderColor = settings.productCardColors?.borderColor || (cardTextColor ? `${cardTextColor}20` : undefined)

              const content = (
                <>
                  <div className="aspect-video bg-muted relative overflow-hidden rounded-t-lg">
                    {product.thumbnail_url ? (
                      <Image
                        src={product.thumbnail_url || "/placeholder.svg"}
                        alt={product.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div
                      className={cn(
                        "font-medium truncate",
                        !cardTextColor && "text-foreground",
                      )}
                      style={{ color: cardTextColor || undefined }}
                    >
                      {product.title}
                    </div>

                    {settings.showPrice && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            !cardPriceColor && "text-muted-foreground",
                          )}
                          style={{ color: cardPriceColor || undefined }}
                        >
                          {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                        </span>
                        {settings.showCompareAtPrice &&
                          product.compare_at_cents &&
                          product.compare_at_cents > product.price_cents && (
                            <span
                              className={cn(
                                "text-sm line-through",
                                !cardPriceColor && "text-muted-foreground/60",
                              )}
                              style={{ color: cardPriceColor ? `${cardPriceColor}99` : undefined }}
                            >
                              {formatPrice(product.compare_at_cents)}
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                </>
              )

              if (isPreviewMode) {
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "group overflow-hidden rounded-lg border transition-all hover:shadow-lg cursor-pointer",
                      !cardBgColor && "bg-card border-border",
                    )}
                    style={{
                      backgroundColor: cardBgColor || undefined,
                      borderColor: cardBorderColor || undefined,
                      boxShadow: cardBgColor && cardBgColor.includes("rgba")
                        ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)"
                        : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    {content}
                  </div>
                )
              }

              return (
                <Link
                  key={product.id}
                  href={getProductHref(product)}
                  className={cn(
                    "group overflow-hidden rounded-lg border transition-all hover:shadow-lg",
                    !cardBgColor && "bg-card border-border",
                  )}
                  style={{
                    backgroundColor: cardBgColor || undefined,
                    borderColor: cardBorderColor || undefined,
                    boxShadow: cardBgColor && cardBgColor.includes("rgba")
                      ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)"
                      : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  {content}
                </Link>
              )
            })}
          </div>

          {sortedProducts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center mt-6">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No products in this category</p>
              <button
                onClick={() => setSelectedCategory(null)}
                className="mt-3 text-sm font-medium underline underline-offset-4 text-foreground hover:opacity-80"
              >
                View all products
              </button>
            </div>
          )}
        </div>
      </div>
    </SectionContainer>
  )
}

// ====== SHOP HEADER - UNIFIED ======
export interface UnifiedShopHeaderProps {
  settings: ShopHeaderSettings
  creator?: CreatorData
  profile?: ProfileData
  products?: ProductData[]
  productCount?: number
  isMobile?: boolean
  isPreviewMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onAvatarEdit?: () => void
  onCoverEdit?: () => void
  globalSettings?: GlobalStoreSettings
}

export function UnifiedShopHeader({
  settings,
  creator,
  profile,
  products,
  productCount = 0,
  isMobile = false,
  isPreviewMode = false,
  isSelected = false,
  onSelect,
  onAvatarEdit,
  onCoverEdit,
  globalSettings,
}: UnifiedShopHeaderProps) {
  const avatarSizeChoice = isMobile
    ? settings.mobileAvatarSizeChoice || "medium"
    : settings.avatarSizeChoice || "medium"
  const avatarSize = avatarSizeMap[avatarSizeChoice]

  const coverImageUrl = settings.coverImageUrl || creator?.cover_url

  const avatarImageUrl =
    settings.avatarUrl === "" ? undefined : settings.avatarUrl !== undefined ? settings.avatarUrl : profile?.avatar_url

  const avatarKey = `avatar-${settings.avatarUrl ?? "default"}-${avatarImageUrl ?? "none"}`

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const totalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0

  // Show placeholder only in editor mode (when we have edit callbacks), never on live published pages
  const showPlaceholder = !coverImageUrl && !isPreviewMode && (!!onCoverEdit || !!onSelect)

  return (
    <div
      onClick={isPreviewMode ? undefined : onSelect}
      className={cn(
        "transition-all",
        !isPreviewMode && onSelect && "cursor-pointer",
        !isPreviewMode && isSelected && "ring-2 ring-sky-500 ring-inset",
      )}
      style={{ backgroundColor: settings.colors.backgroundColor || "transparent" }}
    >
      {showPlaceholder ? (
        <div
          className={cn(
            "relative w-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors",
            isMobile ? "h-32" : "h-48 sm:h-64",
          )}
          onClick={() => {
            if (onCoverEdit) {
              onCoverEdit()
            } else if (onSelect) {
              onSelect()
            }
          }}
        >
          <div className="flex items-center gap-3 text-gray-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium">Add banner to showcase your brand</span>
          </div>
        </div>
      ) : coverImageUrl ? (
        <div
          className={cn("relative w-full overflow-hidden bg-gray-200 group", isMobile ? "h-32" : "h-48 sm:h-64")}
          onClick={!isPreviewMode ? onSelect : undefined}
        >
          <Image
            src={coverImageUrl || "/placeholder.svg"}
            alt={`${profile?.display_name || "Creator"} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            style={{
              objectPosition: settings.coverFocalPoint
                ? `${settings.coverFocalPoint.x}% ${settings.coverFocalPoint.y}%`
                : undefined,
              filter: `brightness(${settings.coverBrightness ?? 1.0})`,
            }}
            priority
          />

          {settings.showSocialMedia && settings.socialLinks && (!isMobile || settings.showSocialIconsOnMobile) && (
            <div className={cn(
              "absolute z-[5]",
              isMobile 
                ? "top-2 right-2" 
                : "top-[18px] right-[12px]"  // Desktop: 3px more down (15->18), 3px more left (15->12)
            )}>
              <SocialMediaIcons
                socialLinks={settings.socialLinks}
                iconColor={settings.socialMediaIconColor || "#ffffff"}
                iconStyle={settings.socialMediaIconStyle || "default"}
                isPreviewMode={isPreviewMode}
                isMobile={isMobile}
              />
            </div>
          )}

          {!isPreviewMode && onSelect && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center cursor-pointer">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-2 shadow-lg">
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <SectionContainer className={cn(isMobile ? "py-6" : "py-8 sm:py-12")} isMobile={isMobile}>
        <div className="flex flex-col items-center text-center">
          <div
            className="relative group"
            style={{
              marginTop: coverImageUrl ? (isMobile ? "-2.875rem" : "-3.75rem") : "0",
            }}
          >
            <Avatar
              key={avatarKey}
              className="border-4 shadow-lg shrink-0"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                borderColor: settings.profileImageBorderColor || "hsl(var(--background))",
              }}
            >
              {avatarImageUrl ? (
                <AvatarImage src={avatarImageUrl || "/placeholder.svg"} alt={profile?.display_name || ""} />
              ) : null}
              <AvatarFallback
                delayMs={0}
                className={cn("bg-gray-300 text-gray-700 font-semibold", isMobile ? "text-lg" : "text-xl sm:text-2xl")}
              >
                {initials || "?"}
              </AvatarFallback>
            </Avatar>

            {!isPreviewMode && onAvatarEdit && (
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  onAvatarEdit()
                }}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-200 cursor-pointer"
              >
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white rounded-full p-2 shadow-lg">
                  <svg className="h-4 w-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>

          <h1
            className={cn(
              "mt-3 font-semibold break-words max-w-full px-4 flex items-center justify-center gap-1.5",
              isMobile ? "text-lg" : "text-xl sm:text-2xl mt-4",
              !settings.colors?.textColor && "text-foreground",
            )}
            style={{ color: settings.colors?.textColor || undefined }}
          >
            {profile?.display_name || "Creator"}
            {globalSettings?.verifiedBadgeEnabled && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-pointer shrink-0">
                      <svg
                        viewBox="0 0 22 22"
                        className={cn(isMobile ? "h-[17px] w-[17px]" : "h-5 w-5")}
                      >
                        {/* Blue badge background */}
                        <path
                          fill="#3b82f6"
                          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
                        />
                        {/* White checkmark */}
                        <path
                          fill="#ffffff"
                          d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
                        />
                      </svg>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-gray-900 text-white px-3 py-2">
                    <p className="font-medium">{verifiedBadgeLabels[globalSettings.verifiedBadgeType]}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </h1>

          {settings.showHeadline && creator?.headline && (
            <p
              className={cn(
                "mt-1 break-words max-w-full px-4",
                isMobile ? "text-xs" : "text-sm sm:text-base",
                !settings.colors?.textColor && "text-muted-foreground",
              )}
              style={{ color: settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined }}
            >
              {creator.headline}
            </p>
          )}

          {settings.showNicheTags && creator?.niche_tags && creator.niche_tags.length > 0 && (
            <div className={cn("flex flex-wrap justify-center gap-2", isMobile ? "mt-3" : "mt-4")}>
              {creator.niche_tags.map((tag) => (
                <Badge key={tag} variant="secondary" className={isMobile ? "text-xs" : ""}>
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {settings.showBio && creator?.bio && (
            <p
              className={cn(
                "max-w-xl break-words px-4",
                isMobile ? "mt-4 text-xs" : "mt-6 text-sm",
                !settings.colors?.textColor && "text-muted-foreground",
              )}
              style={{ color: settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined }}
            >
              {creator.bio}
            </p>
          )}

          {settings.showStats && (
            <div className={cn("flex flex-wrap gap-4 justify-center", isMobile ? "mt-4 gap-3" : "mt-6 sm:gap-8")}>
              <div
                className={cn(
                  "flex items-center gap-2",
                  isMobile ? "text-xs" : "text-sm sm:text-base",
                  !settings.colors?.textColor && "text-muted-foreground",
                )}
                style={{ color: settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined }}
              >
                <Package className={cn(isMobile ? "h-4 w-4" : "h-4 w-4 sm:h-5 sm:w-5")} />
                <span>{productCount} products</span>
              </div>

              {creator?.show_total_sales_badge && settings.showTotalSalesBadge && (
                <div
                  className={cn(
                    "flex items-center gap-2",
                    isMobile ? "text-xs" : "text-sm sm:text-base",
                    !settings.colors?.textColor && "text-muted-foreground",
                  )}
                  style={{ color: settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined }}
                >
                  <ShoppingBag className={cn(isMobile ? "h-4 w-4" : "h-4 w-4 sm:h-5 sm:w-5")} />
                  <span>{totalSales} sales</span>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionContainer>
    </div>
  )
}

// ====== PRODUCT PAGE CONTENT - UNIFIED ======
// (kept exactly as your original continuation below — no changes here)
export interface UnifiedProductPageProps {
  settings: ProductHeaderSettings
  product: ProductData
  creator?: CreatorData
  profile?: ProfileData
  isMobile?: boolean
  isPreviewMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  reviewsCount?: number
  reviewsAverage?: number
  reviews?: any[]
}

export function UnifiedProductPage({
  settings,
  product,
  creator,
  profile,
  isMobile = false,
  isPreviewMode = false,
  isSelected = false,
  onSelect,
  reviewsCount = 0,
  reviewsAverage = 0,
  reviews = [],
}: UnifiedProductPageProps) {
  const [showShareModal, setShowShareModal] = useState(false)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const productTitle = product?.title || "Product Title"
  const productPrice = product?.price_cents ?? 0
  const compareAtPrice = product?.compare_at_cents
  const productDescription = product?.description
  const productType = product?.type || "digital"
  const salesCount = product?.sales_count || 0
  const showSalesBadge = !isPreviewMode && product?.show_sales_badge !== false

  // Get category badge text (use first category name, fallback to type)
  const categoryBadgeText = product?.categories?.[0]?.name || productType

  // Determine button text: "Add to cart" if price > 0, else "Get for Free"
  const buttonText = productPrice === 0 ? "Get for Free" : "Add to cart"

  const galleryImages = product?.gallery_urls?.length
    ? ([product.thumbnail_url, ...product.gallery_urls].filter(Boolean) as string[])
    : product?.thumbnail_url
      ? [product.thumbnail_url]
      : []

  const whatsIncluded =
    product?.whats_included && product.whats_included.length > 0
      ? product.whats_included.map((item) => item.replace(/\*\*/g, ""))
      : ["Instant download access", "All included files", "Lifetime access"]

  const faqs = product?.faqs || []
  const defaultFaqs = [
    {
      question: "How do I access my purchase?",
      answer:
        "After completing your purchase, you'll have instant access to your content through your library. You can access it anytime by logging in to your Materia account.",
    },
    {
      question: "Is there a refund policy?",
      answer:
        "Refund policies are set by individual creators. Please contact the creator directly if you have questions about refunds.",
    },
    {
      question: "How long do I have access?",
      answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.",
    },
  ]
  const displayFaqs = faqs.length > 0 ? faqs : defaultFaqs

  // Theme color helpers
  const themeTextColor = settings.colors?.textColor || undefined
  const themeMutedColor = themeTextColor ? `${themeTextColor}99` : undefined // 60% opacity for muted
  const isDarkTheme = settings.colors?.backgroundColor && (
    settings.colors.backgroundColor.startsWith("#0") ||
    settings.colors.backgroundColor.startsWith("#1") ||
    settings.colors.backgroundColor.startsWith("#2")
  )
  // Card background color - slightly lighter than page background for dark themes
  const cardBgColor = isDarkTheme ? "#1a1a1a" : undefined
  const cardBorderColor = isDarkTheme ? "#2a2a2a" : undefined

  return (
    <div
      onClick={isPreviewMode ? undefined : onSelect}
      className={cn(
        "transition-all",
        !isPreviewMode && onSelect && "cursor-pointer",
        !isPreviewMode && isSelected && "ring-2 ring-sky-500 ring-inset",
      )}
      style={{
        paddingTop: settings.spacing.paddingTop,
        paddingBottom: settings.spacing.paddingBottom,
        backgroundColor: settings.colors.backgroundColor || "transparent",
      }}
    >
      <SectionContainer className={cn(isMobile ? "py-4" : "py-6 sm:py-12", "pb-24 lg:pb-12")} isMobile={isMobile}>
        <div className={cn("grid gap-8", !isMobile && "lg:grid-cols-5 lg:gap-12 lg:items-start")}>
          <div className={cn(!isMobile && "lg:col-span-3", "min-w-0 w-full")}>
            {settings.showGallery && (
              <>
                {galleryImages.length > 0 ? (
                  <ProductGallery
                    images={galleryImages}
                    title={productTitle}
                    mobileDotsMode={settings.mobileGalleryDots ?? false}
                    desktopDotsMode={settings.desktopGalleryDots ?? false}
                    forceDotsMode={isMobile && (settings.mobileGalleryDots ?? false)}
                    forceDesktopDotsMode={!isMobile && (settings.desktopGalleryDots ?? false)}
                    isEditorMobilePreview={isMobile}
                  />
                ) : (
                  <div className="relative aspect-square sm:aspect-video overflow-hidden rounded-xl bg-muted">
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <span className="text-6xl">{productType === "digital" ? "📦" : "📚"}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className={cn("mt-6", !isMobile && "sm:mt-8")}>
              <div className={cn("flex items-start justify-between gap-3", !isMobile && "sm:flex-row sm:gap-4")}>
                <h1
                  className={cn(
                    "font-semibold break-words flex-1 min-w-0",
                    isMobile ? "text-xl" : "text-2xl sm:text-3xl",
                    !themeTextColor && "text-foreground",
                  )}
                  style={{ color: themeTextColor }}
                >
                  {productTitle}
                </h1>
                {settings.showBadges && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {categoryBadgeText}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Desktop: Show creator info here (before description) with share button */}
              {!isMobile && settings.showCreatorInfo && creator && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 p-2 -ml-2">
                    <Avatar className="shrink-0 h-10 w-10">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback>{initials || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex items-center gap-3">
                      <p
                        className={cn(
                          "font-medium truncate text-base",
                          !themeTextColor && "text-foreground",
                        )}
                        style={{ color: themeTextColor }}
                      >
                        {profile?.display_name || "Creator"}
                      </p>
                      {(settings.showRatingNextToSeller ?? true) && reviewsCount > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={cn(
                                "h-4 w-4",
                                star <= Math.round(reviewsAverage)
                                  ? themeTextColor ? "fill-current" : "fill-current text-black"
                                  : isDarkTheme ? "text-gray-500" : "text-gray-300",
                              )}
                              style={star <= Math.round(reviewsAverage) && themeTextColor ? { color: themeTextColor } : undefined}
                            />
                          ))}
                          <span
                            className={cn("text-sm ml-1", !themeMutedColor && "text-muted-foreground")}
                            style={{ color: themeMutedColor }}
                          >
                            ({reviewsCount})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowShareModal(true)
                    }}
                    style={{ color: themeTextColor }}
                  >
                    <Share2 className="h-5 w-5" />
                  </Button>
                </div>
              )}

              {/* Mobile: Price card and Creator info ABOVE description */}
              {isMobile && (
                <div className="mt-6">
                  <div
                    className={cn("rounded-xl border p-4", !cardBgColor && "border-border bg-card")}
                    style={{
                      backgroundColor: cardBgColor,
                      borderColor: cardBorderColor,
                      boxShadow: isDarkTheme
                        ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                        : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <div className="mb-4">
                      <div
                        className={cn("text-xl font-bold", !themeTextColor && "text-foreground")}
                        style={{ color: themeTextColor }}
                      >
                        {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                      </div>
                      {compareAtPrice && compareAtPrice > productPrice && (
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={cn("text-base line-through", !themeMutedColor && "text-muted-foreground")}
                            style={{ color: themeMutedColor }}
                          >
                            {formatPrice(compareAtPrice)}
                          </span>
                          <Badge variant="destructive">
                            {Math.round((1 - productPrice / compareAtPrice) * 100)}% OFF
                          </Badge>
                        </div>
                      )}
                    </div>

                    {isPreviewMode ? (
                      <div className="space-y-3">
                        <Button
                          className="w-full min-h-[44px]"
                          style={{
                            backgroundColor: settings.buyButtonColor || undefined,
                            color: settings.buyButtonTextColor || undefined,
                            border: "1px solid rgba(0, 0, 0, 0.08)",
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          {buttonText}
                        </Button>
                        {/* Wishlist button placeholder in preview */}
                        <Button
                          variant="outline"
                          className="w-full bg-white border-gray-200 min-h-[44px]"
                          style={{
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Add to wishlist
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Button
                          className="w-full min-h-[44px]"
                          disabled
                          style={{
                            backgroundColor: settings.buyButtonColor || undefined,
                            color: settings.buyButtonTextColor || undefined,
                            border: "1px solid rgba(0, 0, 0, 0.08)",
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          {buttonText}
                        </Button>
                        {/* Wishlist button placeholder */}
                        <Button
                          variant="outline"
                          className="w-full bg-white border-gray-200 min-h-[44px]"
                          disabled
                          style={{
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Add to wishlist
                        </Button>
                      </div>
                    )}

                    {settings.showWhatsIncluded && (
                      <div
                        className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                        style={{ borderColor: cardBorderColor }}
                      >
                        <h3
                          className={cn("font-semibold text-sm", !themeTextColor && "text-foreground")}
                          style={{ color: themeTextColor }}
                        >
                          What&apos;s included
                        </h3>
                        <ul className="mt-3 space-y-2">
                          {whatsIncluded.map((item, idx) => (
                            <li
                              key={idx}
                              className={cn("flex items-center gap-2 text-sm", !themeMutedColor && "text-muted-foreground")}
                              style={{ color: themeMutedColor }}
                            >
                              {getIncludedItemIcon(item)}
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {settings.showSalesAnnouncement && salesCount > 0 && (
                      <div
                        className={cn("mt-4 pt-4 border-t", !cardBorderColor && "border-border")}
                        style={{ borderColor: cardBorderColor }}
                      >
                        <p
                          className={cn("text-sm text-center", !themeMutedColor && "text-muted-foreground")}
                          style={{ color: themeMutedColor }}
                        >
                          {salesCount} {salesCount === 1 ? "person has" : "people have"} purchased this
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Mobile: Creator info OUTSIDE the price card */}
                  {settings.showCreatorInfo && creator && (
                    <div
                      className={cn("mt-4 flex items-center justify-between p-3 rounded-lg border", !cardBgColor && "border-border bg-card")}
                      style={{ backgroundColor: cardBgColor, borderColor: cardBorderColor }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="shrink-0 h-8 w-8">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback>{initials || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex items-center gap-2">
                          <p
                            className={cn("font-medium truncate text-sm", !themeTextColor && "text-foreground")}
                            style={{ color: themeTextColor }}
                          >
                            {profile?.display_name || "Creator"}
                          </p>
                          {(settings.showRatingNextToSeller ?? true) && reviewsCount > 0 && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    "h-3 w-3",
                                    star <= Math.round(reviewsAverage)
                                      ? themeTextColor ? "fill-current" : "fill-current text-black"
                                      : isDarkTheme ? "text-gray-500" : "text-gray-300",
                                  )}
                                  style={star <= Math.round(reviewsAverage) && themeTextColor ? { color: themeTextColor } : undefined}
                                />
                              ))}
                              <span
                                className={cn("text-xs ml-1", !themeMutedColor && "text-muted-foreground")}
                                style={{ color: themeMutedColor }}
                              >
                                ({reviewsCount})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowShareModal(true)
                        }}
                        style={{ color: themeTextColor }}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {settings.showDescription !== false && productDescription && (
                <div className="mt-6">
                  <h2
                    className={cn("mb-3 font-semibold", isMobile ? "text-base" : "text-lg", !themeTextColor && "text-foreground")}
                    style={{ color: themeTextColor }}
                  >
                    Description
                  </h2>
                  <p
                    className={cn("whitespace-pre-wrap leading-relaxed break-words text-sm", !themeMutedColor && "text-muted-foreground")}
                    style={{ color: themeMutedColor }}
                  >
                    {productDescription.replace(/\*\*/g, "").replace(/\n\n\*\*What you'll get:\*\*\n/g, "")}
                  </p>
                </div>
              )}
            </div>

            {/* Tablet/Small desktop price card (lg:hidden but not mobile) */}
            {!isMobile && (
              <div className="mt-6 lg:hidden">
                <div
                  className={cn("rounded-xl border p-4 sm:p-6", !cardBgColor && "border-border bg-card")}
                  style={{
                    backgroundColor: cardBgColor,
                    borderColor: cardBorderColor,
                    boxShadow: isDarkTheme
                      ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                      : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <div className="mb-4">
                    <div
                      className={cn("text-2xl sm:text-3xl font-bold", !themeTextColor && "text-foreground")}
                      style={{ color: themeTextColor }}
                    >
                      {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                    </div>
                    {compareAtPrice && compareAtPrice > productPrice && (
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={cn("text-base line-through", !themeMutedColor && "text-muted-foreground")}
                          style={{ color: themeMutedColor }}
                        >
                          {formatPrice(compareAtPrice)}
                        </span>
                        <Badge variant="destructive">
                          {Math.round((1 - productPrice / compareAtPrice) * 100)}% OFF
                        </Badge>
                      </div>
                    )}
                  </div>

                  {isPreviewMode ? (
                    <div className="space-y-3">
                      <Button
                        className="w-full min-h-[44px]"
                        style={{
                          backgroundColor: settings.buyButtonColor || undefined,
                          color: settings.buyButtonTextColor || undefined,
                          border: "1px solid rgba(0, 0, 0, 0.08)",
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        {buttonText}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full bg-white border-gray-200 min-h-[44px]"
                        style={{
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Add to wishlist
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        className="w-full min-h-[44px]"
                        disabled
                        style={{
                          backgroundColor: settings.buyButtonColor || undefined,
                          color: settings.buyButtonTextColor || undefined,
                          border: "1px solid rgba(0, 0, 0, 0.08)",
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        {buttonText}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full bg-white border-gray-200 min-h-[44px]"
                        disabled
                        style={{
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Add to wishlist
                      </Button>
                    </div>
                  )}

                  {settings.showWhatsIncluded && (
                    <div
                      className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                      style={{ borderColor: cardBorderColor }}
                    >
                      <h3
                        className={cn("font-semibold text-sm", !themeTextColor && "text-foreground")}
                        style={{ color: themeTextColor }}
                      >
                        What&apos;s included
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {whatsIncluded.map((item, idx) => (
                          <li
                            key={idx}
                            className={cn("flex items-center gap-2 text-sm", !themeMutedColor && "text-muted-foreground")}
                            style={{ color: themeMutedColor }}
                          >
                            {getIncludedItemIcon(item)}
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {settings.showSalesAnnouncement && salesCount > 0 && (
                    <div
                      className={cn("mt-4 pt-4 border-t", !cardBorderColor && "border-border")}
                      style={{ borderColor: cardBorderColor }}
                    >
                      <p
                        className={cn("text-sm text-center", !themeMutedColor && "text-muted-foreground")}
                        style={{ color: themeMutedColor }}
                      >
                        {salesCount} {salesCount === 1 ? "person has" : "people have"} purchased this
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FAQs */}
            {settings.showFaqs !== false && (
              <div className={cn("mt-8", !isMobile && "sm:mt-10")}>
                <h2
                  className={cn("mb-4 font-semibold", isMobile ? "text-base" : "text-lg", !themeTextColor && "text-foreground")}
                  style={{ color: themeTextColor }}
                >
                  Frequently Asked Questions
                </h2>
                <div className="px-2 sm:px-0">
                  <Accordion type="single" collapsible className="w-full">
                    {displayFaqs.map((faq, idx) => (
                      <AccordionItem
                        key={idx}
                        value={`item-${idx}`}
                        className={cn(!cardBorderColor && "border-border")}
                        style={{ borderColor: cardBorderColor }}
                      >
                        <AccordionTrigger
                          className={cn("min-h-[44px] text-left text-sm", !themeTextColor && "text-foreground")}
                          style={{ color: themeTextColor }}
                        >
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent
                          className={cn("text-sm", !themeMutedColor && "text-muted-foreground")}
                          style={{ color: themeMutedColor }}
                        >
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
            )}
          </div>

          {/* Desktop sidebar with sticky behavior */}
          {!isMobile && (
            <div className="hidden lg:block lg:col-span-2">
              <div
                className={cn("sticky top-6 rounded-xl border p-6", !cardBgColor && "border-border bg-card")}
                style={{
                  backgroundColor: cardBgColor,
                  borderColor: cardBorderColor,
                  boxShadow: isDarkTheme
                    ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                    : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                }}
              >
                <div className="mb-4">
                  <div
                    className={cn("text-3xl font-bold", !themeTextColor && "text-foreground")}
                    style={{ color: themeTextColor }}
                  >
                    {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                  </div>
                  {compareAtPrice && compareAtPrice > productPrice && (
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn("text-lg line-through", !themeMutedColor && "text-muted-foreground")}
                        style={{ color: themeMutedColor }}
                      >
                        {formatPrice(compareAtPrice)}
                      </span>
                      <Badge variant="destructive">{Math.round((1 - productPrice / compareAtPrice) * 100)}% OFF</Badge>
                    </div>
                  )}
                </div>

                {isPreviewMode ? (
                  <div className="space-y-3">
                    <Button
                      className="w-full min-h-[44px]"
                      style={{
                        backgroundColor: settings.buyButtonColor || undefined,
                        color: settings.buyButtonTextColor || undefined,
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      {buttonText}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full bg-white border-gray-200 min-h-[44px]"
                      style={{
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Add to wishlist
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      className="w-full min-h-[44px]"
                      disabled
                      style={{
                        backgroundColor: settings.buyButtonColor || undefined,
                        color: settings.buyButtonTextColor || undefined,
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      {buttonText}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full bg-white border-gray-200 min-h-[44px]"
                      disabled
                      style={{
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Add to wishlist
                    </Button>
                  </div>
                )}

                {settings.showWhatsIncluded && (
                  <div
                    className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                    style={{ borderColor: cardBorderColor }}
                  >
                    <h3
                      className={cn("font-semibold", !themeTextColor && "text-foreground")}
                      style={{ color: themeTextColor }}
                    >
                      What&apos;s included
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {whatsIncluded.map((item, idx) => (
                        <li
                          key={idx}
                          className={cn("flex items-start gap-2 text-sm", !themeMutedColor && "text-muted-foreground")}
                          style={{ color: themeMutedColor }}
                        >
                          {getIncludedItemIcon(item)}
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {settings.showSalesAnnouncement && salesCount > 0 && (
                  <div
                    className={cn("mt-4 pt-4 border-t", !cardBorderColor && "border-border")}
                    style={{ borderColor: cardBorderColor }}
                  >
                    <p
                      className={cn("text-sm text-center", !themeMutedColor && "text-muted-foreground")}
                      style={{ color: themeMutedColor }}
                    >
                      {salesCount} {salesCount === 1 ? "person has" : "people have"} purchased this
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SectionContainer>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        productTitle={productTitle}
        productSlug={product?.slug || product?.id}
      />
    </div>
  )
}

// ====== MORE FROM SELLER - UNIFIED ======
export interface UnifiedProductsGridProps {
  settings: any
  products: ProductData[]
  isMobile?: boolean
  isPreviewMode?: boolean
}

export function UnifiedProductsGrid({
  settings,
  products,
  isMobile = false,
  isPreviewMode = false,
}: UnifiedProductsGridProps) {
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing
  const displayProducts = products?.slice(0, settings.maxProducts || 4) || []

  if (displayProducts.length === 0) return null

  const columns = Math.min(Number(settings.columns ?? 3), 3)

  return (
    <SectionContainer
      isMobile={isMobile}
      className={cn(
        // wider section on desktop / large screens
        !isMobile && "max-w-[1200px] lg:px-8 xl:max-w-[1500px]",
        // tighter left/right padding on mobile (max 5px)
        isMobile && "!px-[5px]",
      )}
      style={{
        paddingTop: spacing?.paddingTop,
        paddingBottom: spacing?.paddingBottom,
        // Only apply left/right padding on desktop
        paddingLeft: isMobile ? undefined : spacing?.paddingLeft,
        paddingRight: isMobile ? undefined : spacing?.paddingRight,
      }}
    >
      <div
        className={cn(
          "grid gap-4",
          isMobile
            ? "grid-cols-1"
            : cn(
                columns === 2 && "grid-cols-1 sm:grid-cols-2",
                columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              ),
        )}
      >
        {displayProducts.map((product) => {
          const content = (
            <>
              <div className="aspect-video bg-muted relative overflow-hidden">
                {product.thumbnail_url ? (
                  <Image
                    src={product.thumbnail_url || "/placeholder.svg"}
                    alt={product.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className={cn("p-3", !isMobile && "sm:p-4")}>
                <h3 className={cn("font-medium text-foreground truncate", isMobile ? "text-sm" : "text-base")}>
                  {product.title}
                </h3>
                {settings.showDescription && product.description && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                )}
                {settings.showPrice && (
                  <div className={cn("mt-2 flex items-center gap-2", isMobile ? "text-sm" : "text-base")}>
                    <span className="font-semibold text-foreground">
                      {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                    </span>
                    {settings.showCompareAtPrice &&
                      product.compare_at_cents &&
                      product.compare_at_cents > product.price_cents && (
                        <span className="text-muted-foreground line-through text-sm">
                          {formatPrice(product.compare_at_cents)}
                        </span>
                      )}
                  </div>
                )}
              </div>
            </>
          )

          if (isPreviewMode) {
            return (
              <div
                key={product.id}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-md cursor-pointer"
              >
                {content}
              </div>
            )
          }

          return (
            <Link
              key={product.id}
              href={`/p/${product.slug || product.id}`}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-md"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </SectionContainer>
  )
}

function UnifiedMoreFromSellerSection({
  settings,
  products,
  creatorName,
  isMobile = false,
  isPreviewMode = false,
}: {
  settings: MoreFromSellerSettings
  products: ProductData[]
  creatorName: string
  isMobile?: boolean
  isPreviewMode?: boolean
}) {
  // Always use settings.spacing for top/bottom padding (this is what the sliders control)
  const spacing = settings.spacing
  const displayProducts = products?.slice(0, settings.maxProducts || 4) || []

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const columns = Math.min(Number(settings.columns ?? 3), 3)
  const mobileProductsPerRow = settings.mobileProductsPerRow ?? 1

  // Build grid classes based on mobileProductsPerRow setting
  const getGridClasses = () => {
    const mobileGridClass = mobileProductsPerRow === 2 ? "grid-cols-2" : "grid-cols-1"

    // If isMobile is true (store builder mobile preview), just return mobile class
    if (isMobile) {
      return mobileGridClass
    }

    // For desktop preview in store builder OR live pages, use responsive classes
    if (columns === 2) {
      return `${mobileGridClass} sm:grid-cols-2`
    }
    // columns === 3 (default)
    return `${mobileGridClass} sm:grid-cols-2 lg:grid-cols-3`
  }

  if (displayProducts.length === 0) {
    if (isPreviewMode) {
      return (
        <div
          className={cn("mx-auto w-full", isMobile ? "px-[10px]" : "max-w-[1400px] px-3 sm:px-4 lg:px-6")}
          style={{
            paddingTop: spacing?.paddingTop,
            paddingBottom: spacing?.paddingBottom,
          }}
        >
          <h2
            className={cn(
              "font-semibold mb-4",
              isMobile ? "text-lg" : "text-xl sm:text-2xl",
              !settings.colors?.textColor && "text-foreground",
            )}
            style={{ color: settings.colors?.textColor || undefined }}
          >
            {settings.headline} {creatorName}
          </h2>
          <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No other products from this seller</p>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1150px]",
        // ✅ LIVE PRODUCT PAGE – mobile device - 18px padding
        !isPreviewMode && "px-[18px] sm:px-4 lg:px-6",
        // ✅ STORE BUILDER mobile preview - 18px padding for better spacing
        isPreviewMode && isMobile && "px-[18px]",
        // ✅ desktop safety
        !isMobile && "px-4 sm:px-4 lg:px-6",
      )}
      style={{
        paddingTop: spacing?.paddingTop,
        paddingBottom: spacing?.paddingBottom,
      }}
    >
      <h2
        className={cn(
          "font-semibold mb-9",
          isMobile ? "text-lg" : "text-xl sm:text-2xl",
          !settings.colors?.textColor && "text-foreground",
        )}
        style={{ color: settings.colors?.textColor || undefined }}
      >
        {settings.headline} {creatorName}
      </h2>
      <div className={cn("grid gap-4", getGridClasses())}>
        {displayProducts.map((product) => {
          // Get product card colors from theme settings
          const cardBgColor = settings.productCardColors?.backgroundColor || undefined
          const cardTextColor = settings.productCardColors?.textColor || settings.colors?.textColor || undefined
          const cardPriceColor = settings.productCardColors?.priceColor || (cardTextColor ? `${cardTextColor}99` : undefined)
          const cardBorderColor = settings.productCardColors?.borderColor || (cardTextColor ? `${cardTextColor}20` : undefined)

          const content = (
            <>
              <div className="aspect-video bg-muted relative overflow-hidden">
                {product.thumbnail_url ? (
                  <Image
                    src={product.thumbnail_url || "/placeholder.svg"}
                    alt={product.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className={cn("p-3", !isMobile && "sm:p-4")}>
                <h3
                  className={cn(
                    "font-medium truncate",
                    isMobile ? "text-sm" : "text-base",
                    !cardTextColor && "text-foreground",
                  )}
                  style={{ color: cardTextColor || undefined }}
                >
                  {product.title}
                </h3>
                {settings.showDescription && product.description && (
                  <p
                    className={cn(
                      "mt-1 text-xs line-clamp-2",
                      !cardPriceColor && "text-muted-foreground",
                    )}
                    style={{ color: cardPriceColor || undefined }}
                  >
                    {product.description}
                  </p>
                )}
                {settings.showPrice && (
                  <div className={cn("mt-2 flex items-center gap-2", isMobile ? "text-sm" : "text-base")}>
                    <span
                      className={cn(
                        "font-semibold",
                        !cardTextColor && "text-foreground",
                      )}
                      style={{ color: cardTextColor || undefined }}
                    >
                      {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                    </span>
                    {settings.showCompareAtPrice &&
                      product.compare_at_cents &&
                      product.compare_at_cents > product.price_cents && (
                        <span
                          className={cn(
                            "line-through text-sm",
                            !cardPriceColor && "text-muted-foreground",
                          )}
                          style={{ color: cardPriceColor ? `${cardPriceColor}99` : undefined }}
                        >
                          {formatPrice(product.compare_at_cents)}
                        </span>
                      )}
                  </div>
                )}
              </div>
            </>
          )

          if (isPreviewMode) {
            return (
              <div
                key={product.id}
                className={cn(
                  "group overflow-hidden rounded-lg border transition-all hover:shadow-lg cursor-pointer",
                  !cardBgColor && "bg-card border-border",
                )}
                style={{
                  backgroundColor: cardBgColor || undefined,
                  borderColor: cardBorderColor || undefined,
                  boxShadow: cardBgColor && cardBgColor.includes("rgba")
                    ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)"
                    : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                }}
              >
                {content}
              </div>
            )
          }

          return (
            <Link
              key={product.id}
              href={`/p/${product.slug || product.id}`}
              className={cn(
                "group overflow-hidden rounded-lg border transition-all hover:shadow-lg",
                !cardBgColor && "bg-card border-border",
              )}
              style={{
                backgroundColor: cardBgColor || undefined,
                borderColor: cardBorderColor || undefined,
                boxShadow: cardBgColor && cardBgColor.includes("rgba")
                  ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)"
                  : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
              }}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
