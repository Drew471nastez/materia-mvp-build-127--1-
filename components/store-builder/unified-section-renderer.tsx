"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

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
import { Avatar, AvatarFallback, AvatarImage, AvatarSkeleton } from "@/components/ui/avatar"
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
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { SocialMediaIcons } from "./social-media-icons"
import { avatarSizeMap } from "@/lib/store-builder/defaults"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ReviewsList } from "@/components/reviews/reviews-list"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { verifiedBadgeLabels } from "@/lib/store-builder/defaults"
import * as LucideIcons from "lucide-react"
import { DescriptionEditWrapper, RichDescriptionContent } from "./description-rich-editor"

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
  // Refund policy fields
  refund_policy_enabled?: boolean
  refund_policy_type?: 'no_refunds' | '7_day' | '14_day' | '30_day' | '6_month' | null
  refund_policy_fine_print?: string | null
  refund_policy_updated_at?: string | null
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
  sellerProductsCount?: number
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
function getIncludedItemIcon(item: string, iconColor?: string): React.ReactNode {
  const lowerItem = item.toLowerCase()
  const colorStyle = iconColor ? { color: iconColor } : undefined
  const defaultClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-black"

  if (lowerItem.includes("instant") || lowerItem.includes("download")) {
    return <Download className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("files") || lowerItem.includes("included")) {
    return <Files className={defaultClass} style={colorStyle} />
  }
  if (lowerItem.includes("lifetime") || lowerItem.includes("access")) {
    return <Infinity className={defaultClass} style={colorStyle} />
  }
  // For check icon, use iconColor if provided, otherwise default green
  const checkClass = iconColor ? "h-4 w-4 mt-0.5 shrink-0" : "h-4 w-4 mt-0.5 shrink-0 text-green-600"
  return <Check className={checkClass} style={colorStyle} />
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
            className="w-full justify-center gap-2 h-14 rounded-xl text-base font-medium border-2 bg-transparent text-black"
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
  reviewsColors,
}: {
  settings: ReviewsSettings
  isMobile?: boolean
  isPreviewMode?: boolean
  productId?: string
  reviews?: any[]
  reviewsCount?: number
  reviewsAverage?: number
  accentColor?: string
  reviewsColors?: {
    starColor?: string
    cardBackgroundColor?: string
    cardBorderColor?: string
  }
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing
  const textColor = settings.colors?.textColor

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
          textColor={textColor}
          starColor={reviewsColors?.starColor || settings.reviewsColors?.starColor}
          cardBackgroundColor={reviewsColors?.cardBackgroundColor || settings.reviewsColors?.cardBackgroundColor}
          cardBorderColor={reviewsColors?.cardBorderColor || settings.reviewsColors?.cardBorderColor}
        />
      </div>
    </div>
  )
}

// Payment method icon components - using accurate brand designs
function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#F3F3F3"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M26.4388 20.2562L26.6913 18.6477L26.1288 18.6346H23.4429L25.3095 6.76505C25.3153 6.72911 25.3341 6.69575 25.3616 6.67201C25.3892 6.64827 25.4243 6.63525 25.4611 6.63525H29.9901C31.4937 6.63525 32.5313 6.94897 33.073 7.56826C33.327 7.85879 33.4887 8.16246 33.567 8.49653C33.6491 8.84713 33.6505 9.26596 33.5704 9.77689L33.5646 9.81405V10.1415L33.8186 10.2858C34.0324 10.3996 34.2024 10.5298 34.3328 10.6788C34.55 10.9273 34.6905 11.2431 34.7499 11.6173C34.8113 12.0022 34.791 12.4604 34.6905 12.979C34.5746 13.5755 34.3873 14.0951 34.1343 14.5202C33.9016 14.9119 33.6052 15.2369 33.2531 15.4886C32.9171 15.7279 32.5178 15.9095 32.0664 16.0257C31.6288 16.1399 31.1301 16.1975 30.583 16.1975H30.2305C29.9786 16.1975 29.7338 16.2886 29.5416 16.4517C29.3489 16.6183 29.2215 16.8459 29.1824 17.0947L29.1558 17.2396L28.7096 20.0747L28.6894 20.1787C28.684 20.2117 28.6748 20.2281 28.6613 20.2392C28.6493 20.2494 28.632 20.2562 28.615 20.2562H26.4388" fill="#28356A"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M34.0589 9.85181C34.0455 9.93848 34.03 10.027 34.0126 10.1181C33.4154 13.1934 31.372 14.2558 28.7623 14.2558H27.4335C27.1143 14.2558 26.8453 14.4881 26.7957 14.8038L25.9227 20.3573C25.8904 20.5647 26.0497 20.7514 26.2582 20.7514H28.615C28.894 20.7514 29.1311 20.5481 29.1751 20.2721L29.1982 20.1521L29.6419 17.3281L29.6705 17.1732C29.7139 16.8962 29.9515 16.6928 30.2305 16.6928H30.583C32.8663 16.6928 34.6538 15.7632 35.1763 13.0728C35.3944 11.9489 35.2815 11.0105 34.704 10.3505C34.5293 10.1516 34.3125 9.98635 34.0589 9.85181" fill="#298FC2"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M33.4342 9.60206C33.3429 9.57534 33.2488 9.5512 33.1522 9.52936C33.0551 9.50807 32.9557 9.48922 32.8533 9.47267C32.4951 9.41462 32.1025 9.38708 31.682 9.38708H28.1322C28.0447 9.38708 27.9617 9.40689 27.8874 9.44269C27.7236 9.52163 27.602 9.67707 27.5726 9.86736L26.8174 14.6641L26.7957 14.8039C26.8454 14.4882 27.1144 14.2558 27.4335 14.2558H28.7623C31.372 14.2558 33.4154 13.1929 34.0127 10.1181C34.0305 10.0271 34.0455 9.93856 34.0589 9.85189C33.9078 9.77146 33.7442 9.7027 33.568 9.64411C33.5244 9.62959 33.4795 9.61562 33.4342 9.60206" fill="#22284F"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M27.5726 9.86737C27.6021 9.67708 27.7236 9.52165 27.8874 9.44325C27.9622 9.40731 28.0447 9.38751 28.1322 9.38751H31.682C32.1025 9.38751 32.4951 9.41518 32.8534 9.47323C32.9557 9.48964 33.0551 9.50863 33.1522 9.52992C33.2488 9.55162 33.3429 9.5759 33.4342 9.60248C33.4795 9.61605 33.5244 9.63015 33.5684 9.64412C33.7446 9.70272 33.9084 9.77202 34.0595 9.85191C34.2372 8.71545 34.058 7.94168 33.4453 7.241C32.7698 6.46953 31.5507 6.1394 29.9906 6.1394H25.4615C25.1429 6.1394 24.8711 6.37174 24.8218 6.68803L22.9354 18.6796C22.8982 18.9168 23.0807 19.1309 23.3193 19.1309H26.1153L27.5726 9.86737" fill="#28356A"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M13.0946 23.5209H9.79248C9.56648 23.5209 9.3743 23.6855 9.339 23.9093L8.00345 32.4009C7.97695 32.5686 8.10638 32.7195 8.27584 32.7195H9.85225C10.0782 32.7195 10.2704 32.555 10.3057 32.3308L10.6659 30.0404C10.7006 29.8162 10.8932 29.6516 11.1188 29.6516H12.1641C14.3393 29.6516 15.5946 28.5959 15.9226 26.5042C16.0703 25.589 15.9288 24.87 15.5014 24.3664C15.0321 23.8134 14.1997 23.5209 13.0946 23.5209ZM13.4755 26.6224C13.2949 27.8106 12.3896 27.8106 11.5143 27.8106H11.0159L11.3655 25.5914C11.3863 25.4573 11.5021 25.3585 11.6374 25.3585H11.8658C12.4621 25.3585 13.0246 25.3585 13.3152 25.6994C13.4886 25.9027 13.5416 26.2049 13.4755 26.6224Z" fill="#28356A"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M23.0496 26.5199H21.4683C21.3336 26.5199 21.2171 26.6187 21.1964 26.7528L21.1264 27.1963L21.0159 27.0356C20.6736 26.5373 19.9101 26.3707 19.1483 26.3707C17.4008 26.3707 15.9084 27.698 15.6177 29.5598C15.4666 30.4885 15.6814 31.3766 16.2068 31.9959C16.6887 32.5653 17.3782 32.8026 18.1985 32.8026C19.6065 32.8026 20.3871 31.8947 20.3871 31.8947L20.3167 32.3354C20.2902 32.5038 20.4196 32.6549 20.5881 32.6549H22.0124C22.2389 32.6549 22.4301 32.4903 22.4659 32.2661L23.3205 26.8385C23.3475 26.6714 23.2185 26.5199 23.0496 26.5199ZM20.8453 29.6064C20.6928 30.5122 19.9759 31.1204 19.0613 31.1204C18.6022 31.1204 18.2353 30.9727 17.9995 30.6929C17.7658 30.415 17.6771 30.0194 17.7513 29.5787C17.8939 28.6805 18.6229 28.0524 19.5235 28.0524C19.9725 28.0524 20.3375 28.2022 20.578 28.4843C20.8188 28.7695 20.9145 29.1676 20.8453 29.6064Z" fill="#28356A"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M31.3495 26.6556H29.7604C29.6088 26.6556 29.4664 26.7312 29.3805 26.8576L27.1888 30.095L26.2598 26.9839C26.2014 26.7892 26.0223 26.6556 25.8195 26.6556H24.2581C24.0682 26.6556 23.9365 26.8416 23.9968 27.0208L25.7471 32.1718L24.1016 34.5014C23.9722 34.6849 24.1025 34.9372 24.3261 34.9372H25.9132C26.0639 34.9372 26.2048 34.8635 26.2903 34.7397L31.5754 27.089C31.702 26.906 31.572 26.6556 31.3495 26.6556" fill="#28356A"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M36.6469 23.5209H33.3444C33.1189 23.5209 32.9267 23.6855 32.8914 23.9093L31.5559 32.4009C31.5294 32.5686 31.6588 32.7195 31.8273 32.7195H33.5221C33.6794 32.7195 33.8141 32.6044 33.8387 32.4475L34.2178 30.0404C34.2525 29.8162 34.4453 29.6516 34.6707 29.6516H35.7156C37.8912 29.6516 39.1461 28.5959 39.4745 26.5042C39.6227 25.589 39.4803 24.87 39.0529 24.3664C38.584 23.8134 37.7521 23.5209 36.6469 23.5209ZM37.0279 26.6224C36.8478 27.8106 35.9424 27.8106 35.0666 27.8106H34.5689L34.9189 25.5914C34.9396 25.4573 35.0545 25.3585 35.1902 25.3585H35.4186C36.0144 25.3585 36.5774 25.3585 36.868 25.6994C37.0414 25.9027 37.094 26.2049 37.0279 26.6224Z" fill="#298FC2"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M46.5999 26.5199H45.0195C44.8839 26.5199 44.7685 26.6187 44.7482 26.7528L44.6782 27.1963L44.5671 27.0356C44.2248 26.5373 43.4619 26.3707 42.6999 26.3707C40.9526 26.3707 39.4607 27.698 39.1701 29.5598C39.0194 30.4885 39.2332 31.3766 39.7585 31.9959C40.2415 32.5653 40.9299 32.8026 41.7503 32.8026C43.1582 32.8026 43.9389 31.8947 43.9389 31.8947L43.8685 32.3354C43.842 32.5038 43.9713 32.6549 44.1408 32.6549H45.5647C45.7902 32.6549 45.9823 32.4903 46.0176 32.2661L46.8727 26.8385C46.8988 26.6714 46.7693 26.5199 46.5999 26.5199ZM44.3958 29.6064C44.2442 30.5122 43.5262 31.1204 42.6116 31.1204C42.1534 31.1204 41.7856 30.9727 41.5498 30.6929C41.3163 30.415 41.2283 30.0194 41.3016 29.5787C41.4451 28.6805 42.1732 28.0524 43.0738 28.0524C43.5228 28.0524 43.8878 28.2022 44.1283 28.4843C44.3701 28.7695 44.4657 29.1676 44.3958 29.6064Z" fill="#298FC2"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M48.3324 23.7543L46.9771 32.4013C46.9506 32.569 47.0799 32.7199 47.2484 32.7199H48.611C48.8375 32.7199 49.0296 32.5554 49.0643 32.3312L50.4008 23.84C50.4275 23.6724 50.298 23.5209 50.1295 23.5209H48.6038C48.4691 23.5213 48.3532 23.6202 48.3324 23.7543" fill="#298FC2"/>
    </svg>
  )
}

function VisaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#F3F3F3"></rect>
        <path d="M25.7516 27.4332H21.8901L24.3054 13.4325H28.1667L25.7516 27.4332Z" fill="#15195A"></path>
        <path d="M39.7499 13.7748C38.9882 13.4915 37.7802 13.1787 36.2865 13.1787C32.4731 13.1787 29.7878 15.0851 29.7713 17.8106C29.7396 19.8215 31.6939 20.9384 33.1556 21.6089C34.6495 22.2941 35.1574 22.7413 35.1574 23.352C35.1422 24.29 33.9502 24.7223 32.8384 24.7223C31.2967 24.7223 30.4707 24.4994 29.2153 23.9776L28.7069 23.7539L28.1665 26.8967C29.0722 27.2835 30.7408 27.6268 32.4731 27.6419C36.5249 27.6419 39.1627 25.765 39.1939 22.8605C39.2093 21.2667 38.1774 20.0454 35.9526 19.0475C34.602 18.4069 33.7749 17.9749 33.7749 17.3195C33.7908 16.7236 34.4745 16.1133 35.9991 16.1133C37.2544 16.0834 38.1768 16.3663 38.8755 16.6494L39.2247 16.7981L39.7499 13.7748V13.7748V13.7748Z" fill="#15195A"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M46.6618 13.4325H49.6486L52.7639 27.433H49.1885C49.1885 27.433 48.8386 25.8244 48.7278 25.3328H43.7699C43.6266 25.705 42.9595 27.433 42.9595 27.433H38.9078L44.6435 14.5941C45.0409 13.6855 45.7407 13.4325 46.6618 13.4325ZM46.4238 18.556C46.4238 18.556 45.2001 21.6689 44.8821 22.4732H48.0918C47.933 21.7733 47.2017 18.4219 47.2017 18.4219L46.9319 17.2156C46.8182 17.5262 46.6539 17.9533 46.543 18.2414C46.4679 18.4366 46.4173 18.568 46.4238 18.556Z" fill="#15195A"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M5.1589 13.4325H11.3716C12.2138 13.462 12.8971 13.7152 13.1194 14.6094L14.4696 21.0422C14.4697 21.0426 14.4699 21.043 14.47 21.0434L14.8832 22.9796L18.6649 13.4325H22.7481L16.6785 27.4184H12.5951L9.15337 15.253C7.96587 14.6021 6.6106 14.0786 5.09534 13.7154L5.1589 13.4325Z" fill="#15195A"></path>
      </g>
    </svg>
  )
}

function MastercardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#F3F3F3"/>
      <path d="M34.3102 28.9765H23.9591V10.5122H34.3102V28.9765Z" fill="#FF5F00"/>
      <path d="M24.6223 19.7429C24.6223 15.9973 26.3891 12.6608 29.1406 10.5107C27.1285 8.93843 24.5892 7.99998 21.8294 7.99998C15.2961 7.99998 10 13.2574 10 19.7429C10 26.2283 15.2961 31.4857 21.8294 31.4857C24.5892 31.4857 27.1285 30.5473 29.1406 28.975C26.3891 26.8249 24.6223 23.4884 24.6223 19.7429" fill="#EB001B"/>
      <path d="M48.2706 19.7429C48.2706 26.2283 42.9745 31.4857 36.4412 31.4857C33.6814 31.4857 31.1421 30.5473 29.1293 28.975C31.8815 26.8249 33.6483 23.4884 33.6483 19.7429C33.6483 15.9973 31.8815 12.6608 29.1293 10.5107C31.1421 8.93843 33.6814 7.99998 36.4412 7.99998C42.9745 7.99998 48.2706 13.2574 48.2706 19.7429" fill="#F79E1B"/>
    </svg>
  )
}

function AmexIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="#006FCF" stroke="#F3F3F3"></rect>
        <path fillRule="evenodd" clipRule="evenodd" d="M11.8632 28.8937V20.6592H21.1869L22.1872 21.8787L23.2206 20.6592H57.0632V28.3258C57.0632 28.3258 56.1782 28.8855 55.1546 28.8937H36.4152L35.2874 27.5957V28.8937H31.5916V26.6779C31.5916 26.6779 31.0867 26.9872 29.9953 26.9872H28.7373V28.8937H23.1415L22.1426 27.6481L21.1284 28.8937H11.8632ZM1 14.4529L3.09775 9.86914H6.7256L7.9161 12.4368V9.86914H12.4258L13.1346 11.7249L13.8216 9.86914H34.0657V10.8021C34.0657 10.8021 35.1299 9.86914 36.8789 9.86914L43.4474 9.89066L44.6173 12.4247V9.86914H48.3913L49.43 11.3247V9.86914H53.2386V18.1037H49.43L48.4346 16.6434V18.1037H42.8898L42.3321 16.8056H40.8415L40.293 18.1037H36.5327C35.0277 18.1037 34.0657 17.1897 34.0657 17.1897V18.1037H28.3961L27.2708 16.8056V18.1037H6.18816L5.63093 16.8056H4.14505L3.59176 18.1037H1V14.4529ZM1.01082 17.05L3.84023 10.8843H5.98528L8.81199 17.05H6.92932L6.40997 15.8154H3.37498L2.85291 17.05H1.01082ZM5.81217 14.4768L4.88706 12.3192L3.95925 14.4768H5.81217ZM9.00675 17.049V10.8832L11.6245 10.8924L13.147 14.8676L14.6331 10.8832H17.2299V17.049H15.5853V12.5058L13.8419 17.049H12.3996L10.6514 12.5058V17.049H9.00675ZM18.3552 17.049V10.8832H23.7219V12.2624H20.0171V13.3171H23.6353V14.6151H20.0171V15.7104H23.7219V17.049H18.3552ZM24.674 17.05V10.8843H28.3339C29.5465 10.8843 30.6331 11.5871 30.6331 12.8846C30.6331 13.9938 29.717 14.7082 28.8289 14.7784L30.9929 17.05H28.9831L27.0111 14.8596H26.3186V17.05H24.674ZM28.1986 12.2635H26.3186V13.5615H28.223C28.5526 13.5615 28.9776 13.3221 28.9776 12.9125C28.9776 12.5941 28.6496 12.2635 28.1986 12.2635ZM32.9837 17.049H31.3045V10.8832H32.9837V17.049ZM36.9655 17.049H36.603C34.8492 17.049 33.7844 15.754 33.7844 13.9915C33.7844 12.1854 34.8373 10.8832 37.052 10.8832H38.8698V12.3436H36.9856C36.0865 12.3436 35.4507 13.0012 35.4507 14.0067C35.4507 15.2008 36.1777 15.7023 37.2251 15.7023H37.6579L36.9655 17.049ZM37.7147 17.05L40.5441 10.8843H42.6892L45.5159 17.05H43.6332L43.1139 15.8154H40.0789L39.5568 17.05H37.7147ZM42.5161 14.4768L41.591 12.3192L40.6632 14.4768H42.5161ZM45.708 17.049V10.8832H47.7989L50.4687 14.7571V10.8832H52.1134V17.049H50.09L47.3526 13.0737V17.049H45.708ZM12.9885 27.8391V21.6733H18.3552V23.0525H14.6504V24.1072H18.2686V25.4052H14.6504V26.5005H18.3552V27.8391H12.9885ZM39.2853 27.8391V21.6733H44.6519V23.0525H40.9472V24.1072H44.5481V25.4052H40.9472V26.5005H44.6519V27.8391H39.2853ZM18.5635 27.8391L21.1765 24.7942L18.5012 21.6733H20.5733L22.1665 23.6026L23.7651 21.6733H25.756L23.1159 24.7562L25.7338 27.8391H23.6621L22.1151 25.9402L20.6057 27.8391H18.5635ZM25.9291 27.8401V21.6744H29.5619C31.0525 21.6744 31.9234 22.5748 31.9234 23.7482C31.9234 25.1647 30.8131 25.893 29.3482 25.893H27.617V27.8401H25.9291ZM29.4402 23.0687H27.617V24.4885H29.4348C29.9151 24.4885 30.2517 24.1901 30.2517 23.7786C30.2517 23.3406 29.9134 23.0687 29.4402 23.0687ZM32.6375 27.8391V21.6733H36.2973C37.51 21.6733 38.5966 22.3761 38.5966 23.6736C38.5966 24.7828 37.6805 25.4972 36.7923 25.5675L38.9563 27.8391H36.9465L34.9746 25.6486H34.2821V27.8391H32.6375ZM36.1621 23.0525H34.2821V24.3505H36.1864C36.5161 24.3505 36.9411 24.1112 36.9411 23.7015C36.9411 23.3831 36.6131 23.0525 36.1621 23.0525ZM45.4137 27.8391V26.5005H48.7051C49.1921 26.5005 49.403 26.2538 49.403 25.9833C49.403 25.7241 49.1928 25.462 48.7051 25.462H47.2177C45.9249 25.462 45.2048 24.7237 45.2048 23.6153C45.2048 22.6267 45.8642 21.6733 47.7854 21.6733H50.9881L50.2956 23.0606H47.5257C46.9962 23.0606 46.8332 23.321 46.8332 23.5697C46.8332 23.8253 47.0347 24.1072 47.4392 24.1072H48.9972C50.4384 24.1072 51.0638 24.8734 51.0638 25.8768C51.0638 26.9555 50.367 27.8391 48.9188 27.8391H45.4137ZM51.2088 27.8391V26.5005H54.5002C54.9873 26.5005 55.1981 26.2538 55.1981 25.9833C55.1981 25.7241 54.9879 25.462 54.5002 25.462H53.0129C51.72 25.462 51 24.7237 51 23.6153C51 22.6267 51.6594 21.6733 53.5806 21.6733H56.7833L56.0908 23.0606H53.3209C52.7914 23.0606 52.6284 23.321 52.6284 23.5697C52.6284 23.8253 52.8298 24.1072 53.2343 24.1072H54.7924C56.2336 24.1072 56.859 24.8734 56.859 25.8768C56.859 26.9555 56.1621 27.8391 54.7139 27.8391H51.2088Z" fill="white"></path>
      </g>
    </svg>
  )
}

function ApplePayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#F3F3F3"></rect>
        <path fillRule="evenodd" clipRule="evenodd" d="M17.5771 14.9265C17.1553 15.4313 16.4803 15.8294 15.8053 15.7725C15.7209 15.09 16.0513 14.3649 16.4381 13.9171C16.8599 13.3981 17.5982 13.0284 18.1959 13C18.2662 13.7109 17.992 14.4076 17.5771 14.9265ZM18.1888 15.9076C17.5942 15.873 17.0516 16.0884 16.6133 16.2624C16.3313 16.3744 16.0924 16.4692 15.9107 16.4692C15.7068 16.4692 15.4581 16.3693 15.1789 16.2571C14.813 16.1102 14.3947 15.9422 13.956 15.9502C12.9506 15.9645 12.0154 16.5403 11.5021 17.4573C10.4474 19.2915 11.2279 22.0071 12.2474 23.5C12.7467 24.2393 13.3443 25.0498 14.1318 25.0213C14.4783 25.0081 14.7275 24.9012 14.9854 24.7905C15.2823 24.6631 15.5908 24.5308 16.0724 24.5308C16.5374 24.5308 16.8324 24.6597 17.1155 24.7834C17.3847 24.9011 17.6433 25.014 18.0271 25.0071C18.8428 24.9929 19.356 24.2678 19.8553 23.5284C20.394 22.7349 20.6307 21.9605 20.6667 21.843L20.6709 21.8294C20.67 21.8285 20.6634 21.8254 20.6516 21.82C20.4715 21.7366 19.095 21.0995 19.0818 19.391C19.0686 17.957 20.1736 17.2304 20.3476 17.116C20.3582 17.109 20.3653 17.1043 20.3685 17.1019C19.6654 16.0498 18.5685 15.936 18.1888 15.9076ZM23.8349 24.9289V13.846H27.9482C30.0717 13.846 31.5553 15.3246 31.5553 17.4858C31.5553 19.6469 30.0435 21.1398 27.892 21.1398H25.5365V24.9289H23.8349ZM25.5365 15.2962H27.4982C28.9748 15.2962 29.8185 16.0924 29.8185 17.4929C29.8185 18.8934 28.9748 19.6967 27.4912 19.6967H25.5365V15.2962ZM37.1732 23.5995C36.7232 24.4668 35.7318 25.0142 34.6631 25.0142C33.081 25.0142 31.9771 24.0616 31.9771 22.6256C31.9771 21.2038 33.0459 20.3863 35.0217 20.2654L37.1451 20.1374V19.5261C37.1451 18.6232 36.5615 18.1327 35.5209 18.1327C34.6631 18.1327 34.0373 18.5806 33.9107 19.263H32.3779C32.4271 17.827 33.7631 16.782 35.5701 16.782C37.5177 16.782 38.7834 17.8128 38.7834 19.4123V24.9289H37.2084V23.5995H37.1732ZM35.1201 23.6991C34.2131 23.6991 33.6365 23.2583 33.6365 22.5829C33.6365 21.8863 34.192 21.481 35.2537 21.4171L37.1451 21.2962V21.9218C37.1451 22.9597 36.2732 23.6991 35.1201 23.6991ZM44.0076 25.3626C43.3256 27.3033 42.5451 27.9431 40.8857 27.9431C40.7592 27.9431 40.3373 27.9289 40.2388 27.9005V26.5711C40.3443 26.5853 40.6045 26.5995 40.7381 26.5995C41.4904 26.5995 41.9123 26.2796 42.1724 25.4479L42.3271 24.9573L39.4443 16.8886H41.2232L43.2271 23.436H43.2623L45.2662 16.8886H46.9959L44.0076 25.3626Z" fill="#000000"></path>
      </g>
    </svg>
  )
}

function GooglePayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#F3F3F3"></rect>
        <path fillRule="evenodd" clipRule="evenodd" d="M27.9174 24.1182V19.6071V19.6062H30.3578C31.3639 19.6068 32.2095 19.2907 32.8945 18.6578C33.5868 18.0571 33.9738 17.1935 33.9541 16.2934C33.9678 15.3982 33.5815 14.541 32.8945 13.9422C32.2155 13.3059 31.3023 12.9587 30.3578 12.9778H26.4404V24.1182H27.9174ZM27.9174 18.2382V14.3494V14.3485H30.3945C30.9466 14.3334 31.4788 14.5487 31.856 14.9396C32.2355 15.2971 32.4496 15.7881 32.4496 16.3009C32.4496 16.8137 32.2355 17.3048 31.856 17.6622C31.4741 18.0449 30.9436 18.254 30.3945 18.2382H27.9174Z" fill="#5F6368"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M39.9431 17.0951C39.3113 16.5297 38.4496 16.2471 37.3578 16.2471C35.9554 16.2471 34.8963 16.7448 34.1807 17.7404L35.4817 18.5342C35.9624 17.8598 36.6153 17.5226 37.4404 17.5226C37.9664 17.5167 38.4755 17.703 38.8661 18.0444C39.2555 18.3564 39.4795 18.8215 39.4762 19.3111V19.6382C38.9086 19.3271 38.1863 19.1715 37.3092 19.1715C36.2817 19.1727 35.4603 19.4062 34.845 19.872C34.2297 20.3377 33.922 20.965 33.922 21.7537C33.9086 22.4719 34.2302 23.1577 34.7973 23.6204C35.3807 24.1182 36.1058 24.3671 36.9725 24.3671C37.9878 24.3671 38.8012 23.9315 39.4129 23.0604H39.4771V24.1182H40.8899V19.4204C40.8905 18.4355 40.5749 17.6604 39.9431 17.0951ZM35.9367 22.7182C35.6273 22.5021 35.4448 22.1544 35.4468 21.7848C35.4468 21.3697 35.6477 21.024 36.0523 20.7395C36.4529 20.4592 36.9532 20.3191 37.5532 20.3191C38.3771 20.3191 39.0193 20.4968 39.4798 20.8524C39.4798 21.4533 39.2352 21.9768 38.7459 22.4231C38.3052 22.8501 37.7077 23.0905 37.0844 23.0915C36.6689 23.099 36.2634 22.9672 35.9367 22.7182Z" fill="#5F6368"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M49 16.496L44.0679 27.4782H42.5431L44.3734 23.6355L41.1303 16.496H42.7358L45.0798 21.9715H45.1119L47.3917 16.496H49Z" fill="#5F6368"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M21.9486 18.6347C21.9492 18.1986 21.9111 17.7632 21.8349 17.3334H15.6055V19.7983H19.1734C19.0259 20.5938 18.5493 21.2964 17.8541 21.7432V23.3432H19.9835C21.2303 22.2294 21.9486 20.5823 21.9486 18.6347Z" fill="#4285F4"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 24.8889C17.3881 24.8889 18.889 24.3217 19.9835 23.344L17.8541 21.744C17.2615 22.1333 16.4982 22.3555 15.6055 22.3555C13.8826 22.3555 12.4202 21.2302 11.8973 19.7137H9.70367V21.3626C10.8249 23.5244 13.1085 24.8887 15.6055 24.8889Z" fill="#34A853"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M11.8973 19.7138C11.6208 18.9192 11.6208 18.0586 11.8973 17.264V15.6151H9.70367C8.76585 17.4232 8.76585 19.5546 9.70367 21.3627L11.8973 19.7138Z" fill="#FBBC04"></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 14.6223C16.5475 14.6073 17.4577 14.9522 18.1395 15.5823V15.5823L20.0248 13.7556C18.8293 12.6677 17.2455 12.0704 15.6055 12.0889C13.1085 12.089 10.8249 13.4534 9.70367 15.6151L11.8973 17.264C12.4202 15.7476 13.8826 14.6223 15.6055 14.6223Z" fill="#EA4335"></path>
      </g>
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
  productsCount,
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
  productsCount?: number
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
  // Use actual productsCount from props
  const displayProductsCount = productsCount ?? 0
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
          "w-full py-6 px-2 md:py-12 md:px-2",
          isMobile && "!py-6 !px-2"
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

            {/* Stats - Sales and Joined shown together, Products shown after */}
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

              {/* Member Since / Year Joined - next to Sales */}
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

              {/* Products - only shown when showProductsStats is true */}
              {settings.showProductsStats !== false && (
                <div>
                  <p
                    className="text-xs uppercase tracking-wide mb-1"
                    style={{ color: textColor ? `${textColor}80` : "#6b7280" }}
                  >
                    Products
                  </p>
                  <p
                    className={cn(
                      "font-semibold text-xl md:text-2xl",
                      isMobile && "!text-xl"
                    )}
                    style={{ color: textColor || undefined }}
                  >
                    {displayProductsCount}
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
                          ) : (
                            <iframe
                              src={`https://www.youtube.com/embed/${extractYouTubeId(item.url)}`}
                              className="w-full h-full"
                              allowFullScreen
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
                    "leading-relaxed overflow-hidden text-sm md:text-base",
                    isMobile && "!text-sm",
                    !isExpanded && needsTruncation && "relative"
                  )}
                  style={{
                    maxHeight: !isExpanded && needsTruncation ? `${maxContentHeight}px` : '2000px',
                    color: textColor ? `${textColor}cc` : "#374151",
                    transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <p className="whitespace-pre-wrap">{settings.aboutContent}</p>
                </div>

                {/* Fade gradient and Read more button */}
                {needsTruncation && (
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
                      })(),
                      opacity: isExpanded ? 0 : 1,
                      transition: 'opacity 0.3s ease-in-out',
                    }}
                  />
                )}

                {needsTruncation && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={cn(
                      "mt-2 text-sm font-medium hover:opacity-80",
                      !isExpanded && "relative z-10"
                    )}
                    style={{
                      color: textColor || "#374151",
                      transition: 'opacity 0.2s ease-in-out',
                    }}
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

        {/* Accepted Payment Methods Section - 1500px width (10% wider) */}
        {showPaymentMethods && paymentMethods.length > 0 && (
          <div className={cn(
            "max-w-[1500px] mx-auto w-full",
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
              <div className="flex flex-wrap items-center -space-x-1">
                {paymentMethods.map((method) => {
                  const IconComponent = paymentMethodIcons[method]
                  if (!IconComponent) return null
                  return (
                    <IconComponent
                      key={method}
                      className={cn(
                        "flex-shrink-0 w-[50px] h-[34px] md:w-[53px] md:h-[38px]",
                        isMobile && "!w-[50px] !h-[34px]"
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
          "max-w-[1500px] mx-auto w-full mt-6 md:hidden",
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
      </div>
    </SectionContainer>
  )
}

// ====== PRODUCT ABOUT SECTION - Payment Methods Only ======
// This is a simplified About section for product pages that only shows payment methods
export function ProductAboutSection({
  isMobile,
  textColor,
  backgroundColor,
}: {
  isMobile?: boolean
  textColor?: string
  backgroundColor?: string
}) {
  // All payment methods enabled by default
  const paymentMethods = ["paypal", "visa", "mastercard", "amex", "applepay", "googlepay"]

  return (
    <SectionContainer isMobile={isMobile}>
      <div
        className={cn(
          "w-full py-6 px-2 md:py-12 md:px-2",
          isMobile && "!py-6 !px-2"
        )}
        style={{ backgroundColor: backgroundColor || "transparent" }}
      >
        {/* Top divider */}
        <div
          className="w-full h-px mb-8"
          style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
        />

        {/* Accepted Payment Methods Section - 1500px width (10% wider) */}
        <div className={cn(
          "max-w-[1500px] mx-auto w-full",
          "flex flex-col gap-3 md:flex-row md:gap-12",
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
            <div className="flex flex-wrap items-center -space-x-1">
              {paymentMethods.map((method) => {
                const IconComponent = paymentMethodIcons[method]
                if (!IconComponent) return null
                return (
                  <IconComponent
                    key={method}
                    className={cn(
                      "flex-shrink-0 w-[50px] h-[34px] md:w-[53px] md:h-[38px]",
                      isMobile && "!w-[50px] !h-[34px]"
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

        {/* Returns & Exchanges Section - Mobile only (stacked layout) */}
        <div className={cn(
          "max-w-[1500px] mx-auto w-full mt-6 md:hidden",
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
  sellerProductsCount,
  onUpdateAboutSettings,
  onOpenAboutSidebar,
}: UnifiedSectionProps) {
  // Defensive check - ensure section and settings exist
  if (!section?.settings?.visible) return null

  // For more-from-seller, don't apply wrapper padding as it handles its own layout
  const isMoreFromSeller = section.type === "more-from-seller"

  // Defensive access to spacing and colors with fallbacks
  const spacing = section.settings.spacing || { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }
  const colors = section.settings.colors || { backgroundColor: "transparent", textColor: "inherit" }

  const style = {
    paddingTop: isMoreFromSeller ? undefined : spacing.paddingTop,
    paddingBottom: isMoreFromSeller ? undefined : spacing.paddingBottom,
    paddingLeft: isMoreFromSeller ? undefined : spacing.paddingLeft,
    paddingRight: isMoreFromSeller ? undefined : spacing.paddingRight,
    backgroundColor: colors.backgroundColor || "transparent",
    color: colors.textColor || "inherit",
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
          globalSettings={globalSettings}
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
          reviewsColors={(section.settings as ReviewsSettings).reviewsColors}
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
          productsCount={sellerProductsCount}
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
            className={cn("overflow-hidden select-none relative", isDragging && "cursor-grabbing")}
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

            {/* Navigation arrows - shown on mobile carousel */}
            {benefitsCount > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-all z-10"
                  aria-label="Previous benefit"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goToNext(); }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-all z-10"
                  aria-label="Next benefit"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>

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

  // Get text colors from settings (theme-applied)
  // Use separate headline and content colors if available, fallback to textColor for backwards compatibility
  const headlineColor = (settings as any).headlineColor || settings.colors?.textColor || undefined
  const contentColor = (settings as any).contentColor || (settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined)

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
            !headlineColor && "text-foreground",
          )}
          style={{
            textAlign: textAlign,
            color: headlineColor || undefined,
          }}
        >
          {settings.headline}
        </h2>
      )}
      <p
        className={cn(
          "leading-relaxed whitespace-pre-wrap",
          isMobile ? "text-sm" : "text-base",
          !contentColor && "text-muted-foreground",
        )}
        style={{
          textAlign: textAlign,
          lineHeight: lineHeight,
          color: contentColor || undefined,
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
  globalSettings,
}: {
  settings: FeaturedProductsSettings
  products?: ProductData[]
  isMobile?: boolean
  isPreviewMode?: boolean
  isEditorCanvas?: boolean
  globalSettings?: GlobalStoreSettings
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing

  // Get theme preset for mobile filter pills styling
  const themePreset = globalSettings?.themePreset || "default"

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "price-low" | "price-high" | "popular">("recent")
  const [isAnimating, setIsAnimating] = useState(false)
  const [runtimeIsMobile, setRuntimeIsMobile] = useState(false)
  const [navigatingProductId, setNavigatingProductId] = useState<string | null>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
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
          {uiIsMobile && !settings.hideCategoryFilter && (() => {
            // Theme-specific mobile filter pill colors
            const getMobilePillStyles = (isSelected: boolean) => {
              // Default border color for unselected pills
              const defaultUnselectedBorderColor = themePreset === "default"
                ? "#e5e7eb" // Light gray for default theme
                : (settings.categoryFilterColors?.borderColor ||
                   (settings.categoryFilterColors?.textColor ? `${settings.categoryFilterColors.textColor}50` : undefined) ||
                   (settings.colors?.textColor ? `${settings.colors.textColor}50` : undefined))

              if (isSelected) {
                // Selected pill colors based on theme preset
                switch (themePreset) {
                  case "astrid":
                    return {
                      backgroundColor: "#404040", // Dark gray for Astrid
                      color: "#ffffff",
                      borderColor: "transparent",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }
                  case "bubble":
                    return {
                      backgroundColor: "#8b5cf6", // Purple for Bubble
                      color: "#ffffff",
                      borderColor: "transparent",
                      boxShadow: "0 2px 8px rgba(139,92,246,0.3)",
                    }
                  case "pink":
                    return {
                      backgroundColor: "#ec4899", // Pink for Pink theme
                      color: "#ffffff",
                      borderColor: "transparent",
                      boxShadow: "0 2px 8px rgba(236,72,153,0.3)",
                    }
                  case "default":
                    return {
                      backgroundColor: "#000000", // Black for Default
                      color: "#ffffff",
                      borderColor: "transparent",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }
                  default:
                    // For other themes (cream, air, etc.), use the settings colors
                    return {
                      backgroundColor: settings.categoryFilterColors?.activeTextColor || settings.colors?.textColor || "rgba(255,255,255,0.9)",
                      color: settings.productCardColors?.backgroundColor ||
                             (settings.colors?.textColor?.includes("fff") ? "#000000" : "#ffffff"),
                      borderColor: "transparent",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }
                }
              } else {
                // Unselected pill colors
                return {
                  backgroundColor: "transparent",
                  color: settings.categoryFilterColors?.textColor || settings.colors?.textColor || undefined,
                  borderColor: defaultUnselectedBorderColor,
                  boxShadow: undefined,
                }
              }
            }

            return (
              <div className="mt-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  <button
                    onClick={() => handleCategoryChange(null)}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]"
                    style={getMobilePillStyles(selectedCategory === null)}
                  >
                    All <span className={selectedCategory === null ? "opacity-60" : "opacity-50"}>{totalProducts}</span>
                  </button>

                  {categoriesWithCounts.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryChange(category.id)}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]"
                      style={getMobilePillStyles(selectedCategory === category.id)}
                    >
                      {category.name} <span className={selectedCategory === category.id ? "opacity-60" : "opacity-50"}>{category.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

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

              const productHref = getProductHref(product)
              const isNavigating = navigatingProductId === product.id || isPending

              const handleProductClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                // Allow cmd/ctrl+click for new tab
                if (e.metaKey || e.ctrlKey || e.shiftKey) return

                e.preventDefault()
                setNavigatingProductId(product.id)

                // Use startTransition for smoother navigation
                startTransition(() => {
                  router.push(productHref)
                })
              }

              return (
                <Link
                  key={product.id}
                  href={productHref}
                  prefetch={false}
                  onClick={handleProductClick}
                  className={cn(
                    "group overflow-hidden rounded-lg border transition-shadow hover:shadow-lg touch-manipulation",
                    !cardBgColor && "bg-card border-border",
                  )}
                  style={{
                    backgroundColor: cardBgColor || undefined,
                    borderColor: cardBorderColor || undefined,
                    boxShadow: cardBgColor && cardBgColor.includes("rgba")
                      ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)"
                      : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                    opacity: isNavigating ? 0.7 : 1,
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
  onBioEdit?: () => void
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
  onBioEdit,
  globalSettings,
}: UnifiedShopHeaderProps) {
  const [avatarLoadStatus, setAvatarLoadStatus] = useState<"loading" | "loaded" | "error">("loading")

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
              className="shadow-lg shrink-0"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                borderWidth: "2.5px",
                borderStyle: "solid",
                borderColor: settings.profileImageBorderColor || "#e5e7eb",
              }}
            >
              {/* Skeleton loading state */}
              {avatarImageUrl && avatarLoadStatus === "loading" && (
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="size-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
                    style={{
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.5s ease-in-out infinite",
                    }}
                  />
                </div>
              )}
              {avatarImageUrl ? (
                <AvatarImage
                  src={avatarImageUrl || "/placeholder.svg"}
                  alt={profile?.display_name || ""}
                  className={cn(
                    "transition-opacity duration-300",
                    avatarLoadStatus === "loaded" ? "opacity-100" : "opacity-0"
                  )}
                  onLoadingStatusChange={setAvatarLoadStatus}
                />
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
              !(settings.textsColor || settings.colors?.textColor) && "text-foreground",
            )}
            style={{ color: settings.textsColor || settings.colors?.textColor || undefined }}
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
                !(settings.textsColor || settings.colors?.textColor) && "text-muted-foreground",
              )}
              style={{ color: settings.textsColor ? `${settings.textsColor}99` : (settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined) }}
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

          {settings.showBio && (settings.bio || creator?.bio) && (
            <div className="relative group/bio inline-flex items-center justify-center">
              <p
                className={cn(
                  "max-w-xl break-words px-4",
                  isMobile ? "mt-4 text-xs" : "mt-6 text-sm",
                  !(settings.textsColor || settings.colors?.textColor) && "text-muted-foreground",
                )}
                style={{ color: settings.textsColor ? `${settings.textsColor}99` : (settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined) }}
              >
                {settings.bio || creator?.bio}
              </p>
              {!isPreviewMode && onBioEdit && (
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onBioEdit()
                  }}
                  className={cn(
                    "absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full opacity-0 group-hover/bio:opacity-100 transition-opacity duration-200 cursor-pointer",
                    isMobile ? "mt-2" : "mt-3"
                  )}
                >
                  <div className="bg-white rounded-full p-1.5 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors">
                    <svg className="h-3.5 w-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          )}

          {settings.showStats && (
            <div className={cn("flex flex-wrap gap-4 justify-center", isMobile ? "mt-4 gap-3" : "mt-6 sm:gap-8")}>
              <div
                className={cn(
                  "flex items-center gap-2",
                  isMobile ? "text-xs" : "text-sm sm:text-base",
                  !(settings.textsColor || settings.colors?.textColor) && "text-muted-foreground",
                )}
                style={{ color: settings.textsColor ? `${settings.textsColor}99` : (settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined) }}
              >
                <Package className={cn(isMobile ? "h-4 w-4" : "h-4 w-4 sm:h-5 sm:w-5")} />
                <span>{productCount} products</span>
              </div>

              {creator?.show_total_sales_badge && settings.showTotalSalesBadge && (
                <div
                  className={cn(
                    "flex items-center gap-2",
                    isMobile ? "text-xs" : "text-sm sm:text-base",
                    !(settings.textsColor || settings.colors?.textColor) && "text-muted-foreground",
                  )}
                  style={{ color: settings.textsColor ? `${settings.textsColor}99` : (settings.colors?.textColor ? `${settings.colors.textColor}99` : undefined) }}
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
  globalSettings?: GlobalStoreSettings
  onEditFaqs?: () => void
  onDescriptionChange?: (description: string) => void
  faqSettings?: {
    customFaqs?: Array<{ id: string; question: string; answer: string; isDefault?: boolean }>
    allFaqs?: Array<{ id: string; question: string; answer: string; isDefault?: boolean }>
  }
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
  globalSettings,
  onEditFaqs,
  onDescriptionChange,
  faqSettings,
}: UnifiedProductPageProps) {
  const [showShareModal, setShowShareModal] = useState(false)
  const [isFaqHovered, setIsFaqHovered] = useState(false)

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

  const productFaqs = product?.faqs || []
  const defaultFaqs = [
    {
      question: "How do I access my purchase?",
      answer:
        "After you complete checkout, you can download the product immediately on the download page. You'll also receive an email with the download link, so you can access it anytime from your inbox.",
    },
    {
      question: "Is there a refund policy?",
      answer:
        "Refund policies are set by individual creators. Please check product info or contact the seller directly if you have questions about refunds.",
    },
    {
      question: "How long do I have access?",
      answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.",
    },
  ]

  // Use allFaqs if available (preserves user-defined order of all FAQs including defaults)
  // Otherwise fall back to old behavior for backward compatibility
  const getDisplayFaqs = () => {
    // If allFaqs is set (new unified ordering system), use it
    if (faqSettings?.allFaqs && faqSettings.allFaqs.length > 0) {
      return faqSettings.allFaqs
        .filter(faq => faq.question && faq.answer)
        .map(faq => ({ question: faq.question, answer: faq.answer }))
    }

    // Legacy behavior: Custom FAQs from FAQ section settings (added via the sidebar)
    const customFaqs = (faqSettings?.customFaqs || [])
      .filter(faq => faq.question && faq.answer)
      .map(faq => ({ question: faq.question, answer: faq.answer }))

    // Combine: Default FAQs FIRST, then custom FAQs (matches new behavior where custom added at end)
    // If there are product-level FAQs, use those instead of defaults
    const baseFaqs = productFaqs.length > 0 ? productFaqs : defaultFaqs
    return [...baseFaqs, ...customFaqs]
  }

  const displayFaqs = getDisplayFaqs()

  // Theme preset colors
  const themePreset = globalSettings?.themePreset || "default"
  const themeConfig = require("@/lib/store-builder/defaults").themePresets[themePreset]

  // Theme color helpers - use theme preset colors when available
  const themeTextColor = settings.colors?.textColor || undefined
  const themeMutedColor = themeTextColor ? `${themeTextColor}99` : undefined // 60% opacity for muted

  // Determine if this is a dark/colorful theme based on preset
  const isColorfulTheme = ["royal", "ocean", "sunset", "forest", "rose"].includes(themePreset)
  const isDarkTheme = ["astrid", "midnight"].includes(themePreset) || (settings.colors?.backgroundColor && (
    settings.colors.backgroundColor.startsWith("#0") ||
    settings.colors.backgroundColor.startsWith("#1") ||
    settings.colors.backgroundColor.startsWith("#2")
  ))

  // Price container colors from theme preset
  const priceContainerBg = themeConfig?.priceContainer?.backgroundColor || (isDarkTheme ? "#1a1a1a" : undefined)
  const priceContainerText = themeConfig?.priceContainer?.textColor || themeTextColor
  const priceContainerMuted = themeConfig?.priceContainer?.mutedTextColor || themeMutedColor
  const priceContainerBorder = themeConfig?.priceContainer?.borderColor || (isDarkTheme ? "#2a2a2a" : undefined)
  const priceContainerIcon = themeConfig?.priceContainer?.iconColor || themeTextColor

  // FAQ section colors from theme preset, with fallback to headerSettings faqColors
  const faqTextColor = themeConfig?.faqSection?.textColor || (settings as any)?.faqColors?.textColor || themeTextColor
  const faqBorderColor = themeConfig?.faqSection?.borderColor || (settings as any)?.faqColors?.borderColor || priceContainerBorder
  const faqIconColor = themeConfig?.faqSection?.iconColor || (settings as any)?.faqColors?.iconColor || themeTextColor

  // Legacy aliases for backward compatibility
  const cardBgColor = priceContainerBg
  const cardBorderColor = priceContainerBorder

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
                    selectionColor={themeConfig?.colors?.primary}
                    backgroundColor={isDarkTheme ? themeConfig?.colors?.muted || "#171717" : undefined}
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
                    <Badge
                      variant="secondary"
                      className="shrink-0 capitalize"
                      style={isDarkTheme ? {
                        backgroundColor: "#2a2a2a",
                        color: "#fafafa",
                        borderColor: "#3a3a3a"
                      } : themePreset === "cream" ? {
                        backgroundColor: "#ffffff",
                        color: "#000000",
                        borderColor: "#e8dfc9"
                      } : undefined}
                    >
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
                    className={cn(
                      "shrink-0 transition-colors",
                      isDarkTheme ? "hover:bg-white/10" : "hover:bg-black/5"
                    )}
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
                    className={cn("rounded-xl border p-4", !priceContainerBg && "border-border bg-card")}
                    style={{
                      backgroundColor: priceContainerBg,
                      borderColor: priceContainerBorder,
                      boxShadow: isDarkTheme || isColorfulTheme
                        ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                        : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <div className="mb-4">
                      <div
                        className={cn("text-xl font-bold", !priceContainerText && "text-foreground")}
                        style={{ color: priceContainerText }}
                      >
                        {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                      </div>
                      {compareAtPrice && compareAtPrice > productPrice && (
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={cn("text-base line-through", !priceContainerMuted && "text-muted-foreground")}
                            style={{ color: priceContainerMuted }}
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
                            border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          {buttonText}
                        </Button>
                        {/* Wishlist button placeholder in preview */}
                        <Button
                          variant="outline"
                          className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                          style={{
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                            backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                            borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                            color: priceContainerText,
                          }}
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Add to wishlist
                        </Button>
                        {/* Refund Policy Display */}
                        <RefundPolicyDisplay
                          enabled={product?.refund_policy_enabled || false}
                          policyType={product?.refund_policy_type || null}
                          finePrint={product?.refund_policy_fine_print || null}
                          updatedAt={product?.refund_policy_updated_at || null}
                          className="mt-3"
                          textColor={priceContainerText}
                          isPreviewMode={true}
                          themePreset={themePreset}
                          isDarkTheme={isDarkTheme}
                          isMobile={isMobile}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Button
                          className="w-full min-h-[44px]"
                          disabled
                          style={{
                            backgroundColor: settings.buyButtonColor || undefined,
                            color: settings.buyButtonTextColor || undefined,
                            border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          }}
                        >
                          {buttonText}
                        </Button>
                        {/* Wishlist button placeholder */}
                        <Button
                          variant="outline"
                          className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                          disabled
                          style={{
                            borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                            backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                            borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                            color: priceContainerText,
                          }}
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Add to wishlist
                        </Button>
                        {/* Refund Policy Display */}
                        <RefundPolicyDisplay
                          enabled={product?.refund_policy_enabled || false}
                          policyType={product?.refund_policy_type || null}
                          finePrint={product?.refund_policy_fine_print || null}
                          updatedAt={product?.refund_policy_updated_at || null}
                          className="mt-3"
                          textColor={priceContainerText}
                          isPreviewMode={true}
                          themePreset={themePreset}
                          isDarkTheme={isDarkTheme}
                          isMobile={isMobile}
                        />
                      </div>
                    )}

                    {settings.showWhatsIncluded && (
                      <div
                        className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                        style={{ borderColor: cardBorderColor }}
                      >
                        <h3
                          className={cn("font-semibold text-sm", !priceContainerText && "text-foreground")}
                          style={{ color: priceContainerText }}
                        >
                          What&apos;s included
                        </h3>
                        <ul className="mt-3 space-y-2">
                          {whatsIncluded.map((item, idx) => (
                            <li
                              key={idx}
                              className={cn("flex items-center gap-2 text-sm", !priceContainerMuted && "text-muted-foreground")}
                              style={{ color: priceContainerMuted }}
                            >
                              {getIncludedItemIcon(item, priceContainerIcon)}
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
                          className={cn("text-sm text-center", !priceContainerMuted && "text-muted-foreground")}
                          style={{ color: priceContainerMuted }}
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
                        className={cn(
                          "shrink-0 h-8 w-8 transition-colors",
                          isDarkTheme ? "hover:bg-white/10" : "hover:bg-black/5"
                        )}
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

              {settings.showDescription !== false && (productDescription || !isPreviewMode) && (
                <DescriptionEditWrapper
                  isEditorMode={!isPreviewMode}
                  description={productDescription || ""}
                  onDescriptionChange={onDescriptionChange || (() => {})}
                  isMobile={isMobile}
                  textColor={themeTextColor}
                  mutedTextColor={themeMutedColor}
                  themeColors={{
                    backgroundColor: isDarkTheme ? "#1a1a1a" : "#ffffff",
                    foregroundColor: themeTextColor,
                    mutedColor: themeMutedColor,
                    borderColor: priceContainerBorder || (isDarkTheme ? "#333" : "#e5e7eb"),
                    accentColor: themeConfig?.colors?.primary || "#7c3aed",
                    isDarkTheme: isDarkTheme,
                  }}
                >
                  <div className="mt-6">
                    <h2
                      className={cn("mb-3 font-semibold", isMobile ? "text-base" : "text-lg", !themeTextColor && "text-foreground")}
                      style={{ color: themeTextColor }}
                    >
                      Description
                    </h2>
                    {productDescription ? (
                      <RichDescriptionContent
                        html={productDescription}
                        className="text-sm"
                        textColor={themeMutedColor}
                      />
                    ) : (
                      <p
                        className={cn("whitespace-pre-wrap leading-relaxed break-words text-sm italic opacity-60", !themeMutedColor && "text-muted-foreground")}
                        style={{ color: themeMutedColor }}
                      >
                        No description yet. Click Edit to add one.
                      </p>
                    )}
                  </div>
                </DescriptionEditWrapper>
              )}
            </div>

            {/* Tablet/Small desktop price card (lg:hidden but not mobile) */}
            {!isMobile && (
              <div className="mt-6 lg:hidden">
                <div
                  className={cn("rounded-xl border p-4 sm:p-6", !priceContainerBg && "border-border bg-card")}
                  style={{
                    backgroundColor: priceContainerBg,
                    borderColor: priceContainerBorder,
                    boxShadow: isDarkTheme || isColorfulTheme
                      ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                      : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <div className="mb-4">
                    <div
                      className={cn("text-2xl sm:text-3xl font-bold", !priceContainerText && "text-foreground")}
                      style={{ color: priceContainerText }}
                    >
                      {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                    </div>
                    {compareAtPrice && compareAtPrice > productPrice && (
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={cn("text-base line-through", !priceContainerMuted && "text-muted-foreground")}
                          style={{ color: priceContainerMuted }}
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
                          border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        {buttonText}
                      </Button>
                      <Button
                        variant="outline"
                        className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                        style={{
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                          borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                          color: priceContainerText,
                        }}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Add to wishlist
                      </Button>
                      {/* Refund Policy Display */}
                      <RefundPolicyDisplay
                        enabled={product?.refund_policy_enabled || false}
                        policyType={product?.refund_policy_type || null}
                        finePrint={product?.refund_policy_fine_print || null}
                        updatedAt={product?.refund_policy_updated_at || null}
                        className="mt-3"
                        textColor={priceContainerText}
                        isPreviewMode={true}
                        themePreset={themePreset}
                        isDarkTheme={isDarkTheme}
                        isMobile={isMobile}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        className="w-full min-h-[44px]"
                        disabled
                        style={{
                          backgroundColor: settings.buyButtonColor || undefined,
                          color: settings.buyButtonTextColor || undefined,
                          border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        }}
                      >
                        {buttonText}
                      </Button>
                      <Button
                        variant="outline"
                        className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                        disabled
                        style={{
                          borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                          backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                          borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                          color: priceContainerText,
                        }}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Add to wishlist
                      </Button>
                      {/* Refund Policy Display */}
                      <RefundPolicyDisplay
                        enabled={product?.refund_policy_enabled || false}
                        policyType={product?.refund_policy_type || null}
                        finePrint={product?.refund_policy_fine_print || null}
                        updatedAt={product?.refund_policy_updated_at || null}
                        className="mt-3"
                        textColor={priceContainerText}
                        isPreviewMode={true}
                        themePreset={themePreset}
                        isDarkTheme={isDarkTheme}
                        isMobile={isMobile}
                      />
                    </div>
                  )}

                  {settings.showWhatsIncluded && (
                    <div
                      className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                      style={{ borderColor: cardBorderColor }}
                    >
                      <h3
                        className={cn("font-semibold text-sm", !priceContainerText && "text-foreground")}
                        style={{ color: priceContainerText }}
                      >
                        What&apos;s included
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {whatsIncluded.map((item, idx) => (
                          <li
                            key={idx}
                            className={cn("flex items-center gap-2 text-sm", !priceContainerMuted && "text-muted-foreground")}
                            style={{ color: priceContainerMuted }}
                          >
                            {getIncludedItemIcon(item, priceContainerIcon)}
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
                        className={cn("text-sm text-center", !priceContainerMuted && "text-muted-foreground")}
                        style={{ color: priceContainerMuted }}
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
              <div
                className={cn("mt-8 relative group/faq", !isMobile && "sm:mt-10")}
                data-faq-section
                onMouseEnter={() => !isPreviewMode && setIsFaqHovered(true)}
                onMouseLeave={() => !isPreviewMode && setIsFaqHovered(false)}
              >
                {/* Edit FAQs hover link - only in editor mode */}
                {!isPreviewMode && onEditFaqs && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditFaqs()
                    }}
                    className={cn(
                      "absolute -top-1 right-0 z-10 flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 hover:underline transition-all duration-200 ease-out",
                      isFaqHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
                    )}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit FAQs
                  </button>
                )}
                <h2
                  className={cn("mb-4 font-semibold", isMobile ? "text-base" : "text-lg", !faqTextColor && "text-foreground")}
                  style={{ color: faqTextColor }}
                >
                  Frequently Asked Questions
                </h2>
                <div className="px-2 sm:px-0">
                  <Accordion type="single" collapsible className="w-full">
                    {displayFaqs.map((faq, idx) => (
                      <AccordionItem
                        key={idx}
                        value={`item-${idx}`}
                        className={cn(!faqBorderColor && "border-border")}
                        style={{ borderColor: faqBorderColor }}
                      >
                        <AccordionTrigger
                          className={cn("min-h-[44px] text-left text-sm", !faqTextColor && "text-foreground")}
                          style={{ color: faqTextColor }}
                        >
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent
                          className={cn("text-sm", !faqTextColor && "text-muted-foreground")}
                          style={{ color: faqTextColor ? `${faqTextColor}cc` : undefined }}
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
                className={cn("sticky top-6 rounded-xl border p-6", !priceContainerBg && "border-border bg-card")}
                style={{
                  backgroundColor: priceContainerBg,
                  borderColor: priceContainerBorder,
                  boxShadow: isDarkTheme || isColorfulTheme
                    ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
                    : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                }}
              >
                <div className="mb-4">
                  <div
                    className={cn("text-3xl font-bold", !priceContainerText && "text-foreground")}
                    style={{ color: priceContainerText }}
                  >
                    {productPrice === 0 ? "Free" : formatPrice(productPrice)}
                  </div>
                  {compareAtPrice && compareAtPrice > productPrice && (
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn("text-lg line-through", !priceContainerMuted && "text-muted-foreground")}
                        style={{ color: priceContainerMuted }}
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
                        border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      {buttonText}
                    </Button>
                    <Button
                      variant="outline"
                      className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                      style={{
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                        borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                        color: priceContainerText,
                      }}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Add to wishlist
                    </Button>
                    {/* Refund Policy Display */}
                    <RefundPolicyDisplay
                      enabled={product?.refund_policy_enabled || false}
                      policyType={product?.refund_policy_type || null}
                      finePrint={product?.refund_policy_fine_print || null}
                      updatedAt={product?.refund_policy_updated_at || null}
                      className="mt-3"
                      textColor={priceContainerText}
                      isPreviewMode={true}
                      themePreset={themePreset}
                      isDarkTheme={isDarkTheme}
                      isMobile={isMobile}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      className="w-full min-h-[44px]"
                      disabled
                      style={{
                        backgroundColor: settings.buyButtonColor || undefined,
                        color: settings.buyButtonTextColor || undefined,
                        border: isColorfulTheme ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.08)",
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                      }}
                    >
                      {buttonText}
                    </Button>
                    <Button
                      variant="outline"
                      className={cn("w-full min-h-[44px]", !isColorfulTheme && !isDarkTheme && "bg-white border-gray-200")}
                      disabled
                      style={{
                        borderRadius: settings.buttonsBorderRadius != null ? `${settings.buttonsBorderRadius}px` : undefined,
                        backgroundColor: isColorfulTheme || isDarkTheme ? "transparent" : undefined,
                        borderColor: isColorfulTheme || isDarkTheme ? priceContainerBorder : undefined,
                        color: priceContainerText,
                      }}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Add to wishlist
                    </Button>
                    {/* Refund Policy Display */}
                    <RefundPolicyDisplay
                      enabled={product?.refund_policy_enabled || false}
                      policyType={product?.refund_policy_type || null}
                      finePrint={product?.refund_policy_fine_print || null}
                      updatedAt={product?.refund_policy_updated_at || null}
                      className="mt-3"
                      textColor={priceContainerText}
                      isPreviewMode={true}
                      themePreset={themePreset}
                      isDarkTheme={isDarkTheme}
                      isMobile={isMobile}
                    />
                  </div>
                )}

                {settings.showWhatsIncluded && (
                  <div
                    className={cn("mt-4 border-t pt-4", !cardBorderColor && "border-border")}
                    style={{ borderColor: cardBorderColor }}
                  >
                    <h3
                      className={cn("font-semibold", !priceContainerText && "text-foreground")}
                      style={{ color: priceContainerText }}
                    >
                      What&apos;s included
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {whatsIncluded.map((item, idx) => (
                        <li
                          key={idx}
                          className={cn("flex items-start gap-2 text-sm", !priceContainerMuted && "text-muted-foreground")}
                          style={{ color: priceContainerMuted }}
                        >
                          {getIncludedItemIcon(item, priceContainerIcon)}
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
                      className={cn("text-sm text-center", !priceContainerMuted && "text-muted-foreground")}
                      style={{ color: priceContainerMuted }}
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
              prefetch={false}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md touch-manipulation"
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
              prefetch={false}
              className={cn(
                "group overflow-hidden rounded-lg border transition-shadow hover:shadow-lg touch-manipulation",
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
