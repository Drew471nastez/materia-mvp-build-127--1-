"use client"

import { personName } from "@/lib/profile/display-name"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { usePriceCurrency } from "@/components/platform/price-currency"
import type React from "react"
// `import type React` gives the TYPES only — `React.Fragment` off that binding
// is undefined at runtime, which is a blank page, not a type error. The meta
// row below needs the real Fragment, so it is imported by name.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"

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
  CommunitySettings,
} from "@/lib/store-builder/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AppAvatar, AvatarMark } from "@/components/app/app-avatar"
import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BadgeCheck, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Download, Facebook, Files, Heart, Infinity, Link2, Mail, Package, Share2, Star, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { applyManualOrder, pickFeatured } from "@/lib/store-builder/featured-order"
import { cn } from "@/lib/utils"
import { tint } from "@/lib/appearance/site-paint"
import { useSitePaint } from "@/lib/appearance/site-paint-context"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ProductGallery } from "@/components/product/product-gallery"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { ContactReveal } from "@/components/storefront/contact-reveal"
import { SocialMediaIcons } from "./social-media-icons"
import { CatalogHeader } from "@/components/storefront/catalog-controls"
import { ArrangeProductsControl } from "@/components/storefront/arrange-products-button"
import { headerAvatar } from "@/lib/store-builder/header-avatar"

/**
 * The headline this section shipped with. Anything still set to it was never
 * chosen by the creator, so the rail may pick a better word; anything else is
 * theirs and is left alone. Do not change this string — it is a record of what
 * the old default WAS, not a setting.
 */
const LEGACY_FEATURED_HEADLINE = "Featured Products"
import { StorefrontProductCard } from "@/components/storefront/storefront-product-card"
import { avatarSizeMap } from "@/lib/store-builder/defaults"
import { cardAccents, isInheritedBlack } from "@/lib/store-builder/storefront-chrome"
import { isInheritedWhite } from "@/lib/store-builder/page-surface"
import { isOptimizableImage, optimizedImageUrl, PORTRAIT_QUALITY } from "@/lib/images/optimized-url"
import { coverCropStyle, coverSizes, cropFromSettings } from "@/lib/images/cover-crop"
import { videoEmbedUrl } from "@/lib/social/video"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ReviewsList } from "@/components/reviews/reviews-list"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { verifiedBadgeLabels } from "@/lib/store-builder/defaults"
import { CreatorBadges } from "@/components/storefront/creator-badges"
import type { CreatorBadgeId } from "@/lib/creators/badges"
import { getIconComponent } from "./section-icons"
import { DescriptionEditWrapper, RichDescriptionContent } from "./description-rich-editor"
import { plainSummary } from "@/lib/html-entities"
import { SmartLink } from "@/components/smart-link"
import { UnifiedCommunitySection } from "./community-section"
import type { CommunityBlockData } from "@/lib/communities/blocks"
import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { VariantSelector, type ProductVariant } from "@/components/product/variant-selector"
import { intervalOf, perInterval } from "@/lib/pricing/list-price"
import { imagesOnly } from "@/lib/media/video"

// Shared product type for consistency
export interface ProductData {
  id: string
  slug?: string
  /** Where the card goes when it is not a product page: a free community's own page. */
  href?: string
  title: string
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number
  /** The currency this card's price is in, when it is not the page's (a dollar price on the marketplace). */
  currency?: string | null
  /* Pay what you want, listed from its minimum (lib/pricing/list-price). */
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  sales_count?: number
  description?: string | null
  whats_included?: string[]
  gallery_urls?: string[]
  video_url?: string
  faqs?: Array<{ question: string; answer: string }>
  type?: string
  /** A membership's billing interval: its price reads "$9/month" or "$90/year" (lib/pricing/list-price). */
  price_interval?: "month" | "year" | null
  show_sales_badge?: boolean
  categories?: Array<{ id: string; name: string; slug: string; type: string | null }>
  // Denormalised on the product row; the card shows a rating without a query.
  reviews_count?: number | null
  reviews_average?: number | null
  /** Every copy of a limited run sold (lib/products/sales-limit.ts), counted on the server. */
  sold_out?: boolean | null
  // Refund policy fields
  refund_policy_enabled?: boolean
  refund_policy_type?: 'no_refunds' | '7_day' | '14_day' | '30_day' | '6_month' | null
  refund_policy_fine_print?: string | null
  refund_policy_updated_at?: string | null
  // Product variants
  variants?: ProductVariant[]
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
  // The card shows the creator beside every product, and links their name to
  // their store, so it needs the handle and the avatar as well as the name.
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  // Decided on the server from the session; gates the per-card owner menu.
  viewerIsOwner?: boolean
  /**
   * The creator's own arrangement of their catalogue, from
   * headerSettings.productsOrder. Home and the Products tab render the same
   * products, so they render them in the same order.
   */
  productsOrder?: string[]
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
  /** A PUBLIC address the creator typed. Absent means no Contact link. */
  sellerContactEmail?: string
  // For inline editing in About section
  onUpdateAboutSettings?: (settings: Partial<AboutSettings>) => void
  // For opening About section in sidebar
  onOpenAboutSidebar?: () => void
  /** The owner's About edit control, from the page that knows who is looking. */
  aboutOwnerActions?: React.ReactNode
  /**
   * The Community sections' live data, by community id, read on the server
   * for the page (lib/communities/server/blocks.ts). A section whose id is
   * not here draws nothing; the builder canvas reads its own.
   */
  communityBlocks?: Record<string, CommunityBlockData>
}

// Helper function to get product href
// NOTE: Only use product.slug — product.id is a UUID and will never resolve on
// the /p/[slug] route, causing a 404 "lost" navigation in Capacitor.
const getProductHref = (product: ProductData): string => {
  if (product.href && product.href.startsWith("/")) return product.href
  return product.slug ? `/p/${product.slug}` : "#"
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
  const [shareUrl, setShareUrl] = useState(`/p/${productSlug}`)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/p/${productSlug}`)
    }
  }, [productSlug])

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

  /**
   * INLINE, NOT CENTRED. A centred dialog with a dimmed page behind it says
   * "stop and decide"; three share targets are not that. This is a small
   * panel that rises in at the corner, the way the website builder's own
   * panels do (same wb-settings-in), and any click outside it closes it.
   * The scrim is there only to catch that click, not to darken anything.
   */
  return (
    <div className="fixed inset-0 z-[999999]" onClick={onClose}>
      <div
        className="wb-settings-in absolute bottom-[calc(16px+env(safe-area-inset-bottom,0px))] right-4 w-[240px] rounded-2xl border border-border bg-background p-3 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)] sm:bottom-auto sm:right-6 sm:top-20"
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

/**
 * ===========================================================================
 *  ONE COLUMN FOR EVERY SECTION ON A CREATOR PAGE
 * ===========================================================================
 * This was 1100 while About and the reviews overrode it to 1180, so a page
 * had two left edges: the tab strip and the products started 32px further in
 * than "About <creator>" below them, and the eye finds both. Reported with a
 * picture and two lines drawn down it.
 *
 * The same complaint was made about the product page once, and the note a few
 * lines below this one records it: three pieces of code, three ideas of how
 * wide the page is, and "nothing flowed together".
 *
 * 1180 rather than 1100 because About is the one that was named as the ruler,
 * and because it is the wider of the two — a column that grows loses nothing,
 * where one that shrinks takes a product out of the rows it was fitting. The
 * tab strip, the products grid and the reviews are set to the same number in
 * their own files; scripts/check-page-width.mjs measures all of them on one
 * document and fails if any one starts on a different line.
 */
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
    <div className={cn("mx-auto w-full max-w-[1180px]", !noPadding && "px-3 sm:px-4 lg:px-6", className)} style={style}>
      {children}
    </div>
  )
}

// ====== REVIEWS SECTION - UNIFIED ======
/**
 * ONE CONTAINER FOR EVERY SECTION ON A PRODUCT PAGE.
 *
 * The product content, More from the seller and the reviews are rendered by
 * three different pieces of code, and all three had their own idea of how
 * wide the page is: 1200, 1200 and 1180, on two different padding scales.
 * The owner's word for the result was that nothing flowed together.
 */
const PRODUCT_SECTION_CONTAINER = "mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6"

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
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  /* The list paints its own colours (components/reviews): these go to it as written. */
  const textColor = settings.colors?.textColor

  if (!isPreviewMode && reviewsCount === 0 && reviews.length === 0) {
    return null
  }

  return (
    <div
      /*
        ═══════════════════════════════════════════════════════════════════
         THE SAME BOX AS EVERY OTHER SECTION ON THE PAGE
        ═══════════════════════════════════════════════════════════════════
        This was max-w-[1180px] with px-4 sm:px-6 while the product content
        above it and More from the seller below it are max-w-[1200px] with
        px-3 sm:px-4 lg:px-6. Twenty pixels of width and a different padding
        scale, which is why the reviews card did not line up with anything
        else and the page looked like it stepped in and out as you scrolled.
      */
      className={cn(PRODUCT_SECTION_CONTAINER, isMobile && "max-w-none px-[10px]")}
      style={{
        paddingTop: spacing?.paddingTop,
        paddingBottom: spacing?.paddingBottom,
        backgroundColor: paint(settings.colors?.backgroundColor, "page") || "transparent",
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
  contactEmail,
  onUpdateSettings,
  onOpenSidebar,
  pageBackgroundColor,
  ownerActions,
}: {
  settings: AboutSettings
  isMobile?: boolean
  isPreviewMode?: boolean
  isEditorMode?: boolean
  creatorName?: string
  memberSince?: string
  totalSales?: number
  productsCount?: number
  /** A PUBLIC address the creator typed. Absent means no Contact link. */
  contactEmail?: string
  onUpdateSettings?: (settings: Partial<AboutSettings>) => void
  onOpenSidebar?: () => void
  pageBackgroundColor?: string
  /**
   * The owner's edit control, decided on the server from the session and
   * rendered beside the heading. On a live page there is no other way in: the
   * builder's inline "+ Add a story headline" placeholders only appear in the
   * canvas, so a creator looking at their own storefront had no way to change
   * the block they were looking at.
   */
  ownerActions?: React.ReactNode
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

  /**
   * ===========================================================================
   *  DRAG IT, WITH A FINGER OR WITH A MOUSE
   * ===========================================================================
   * The carousel had arrows and dots and nothing else, so on a phone — where
   * the arrows are small and a swipe is what anybody tries first — it read as
   * not working. Pointer events rather than separate touch and mouse
   * handlers: one code path, and a trackpad drag behaves the same as a thumb.
   *
   * The threshold is 48px, and it is a distance rather than a velocity so a
   * slow deliberate drag counts. Below it nothing happens, which is what
   * makes a tap on the image still a tap.
   *
   * A VERTICAL DRAG IS A SCROLL, and taking it would trap the page: on a
   * phone this thing is as wide as the screen, and a carousel that eats
   * upward swipes is a carousel somebody cannot scroll past. So the gesture
   * is claimed only once it is clearly sideways.
   */
  const dragRef = useRef<{ x: number; y: number; id: number } | null>(null)

  const onMediaPointerDown = (e: React.PointerEvent) => {
    if (mediaItems.length < 2) return
    /** A secondary button is a context menu, not a swipe. */
    if (e.pointerType === "mouse" && e.button !== 0) return
    dragRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }

  const onMediaPointerUp = (e: React.PointerEvent) => {
    const start = dragRef.current
    dragRef.current = null
    if (!start || start.id !== e.pointerId) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    /** Sideways, and meant: 48px across and further across than down. */
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return

    if (dx < 0) goToNextMedia()
    else goToPrevMedia()
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
      {/*
        THE SPACING SETTING IS APPLIED ONCE, BY THE WRAPPER.
        
        UnifiedSectionRenderer already pads every section it renders with that
        section's own `spacing`, and this div then applied the very same
        numbers again — so About's 48px of top padding was 96px on the page,
        and every adjustment a creator made in the builder moved it by twice
        what the control said. On the storefront that put 96px of empty page
        between the last product and the About rule, on every tab.

        The classes went with it: `py-6 md:py-12` was dead under the inline
        style, and reviving it by deleting only the style would have swapped
        one wrong number for another.
      */}
      {/*
        NO PADDING OF ITS OWN. This carried `px-2` on every width, eight
        pixels that no other section has, so About's heading and its divider
        sat eight pixels further in than the products above them — the last
        of the three reasons this page had more than one left edge. The
        column's padding is the container's job and it already does it.
      */}
      {/*
        A LITTLE AIR ABOVE THE RULE, ON TOP OF THE SECTION'S OWN SPACING.

        The gap between the last product and this block's rule measured 48px
        and read as tight: the work and what is said about it ran into each
        other. That 48 is the section's `spacing.paddingTop`, which is the
        creator's to set and is 48 on every page that has ever been saved —
        so raising the default alone would have moved the pages nobody has
        arranged and left every arranged one exactly as it was.

        This is the block's own, and it adds to theirs rather than replacing
        it: their control still moves the block by exactly what it says. Two
        numbers and one of them fixed, which is the trade for a change that
        reaches a page somebody arranged a year ago.
      */}
      <div className="w-full pt-2 sm:pt-4" style={{ backgroundColor }}>
        {/* Top divider */}
        <div
          className="w-full h-px mb-8"
          style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
        />

        {/* max-w-[1180px] to match every other section on this page — the
            payment-methods block directly below it in particular. This was
            max-w-5xl (1024px), so on a wide screen its content sat 78px further
            in on each side than the block beneath it, and the two headings did
            not share a left edge. */}
        <div className={cn(
          "flex max-w-[1180px] mx-auto w-full flex-col gap-6 md:flex-row md:gap-12",
          isMobile && "!flex-col !gap-6"
        )}>
          {/* Left Column - Seller Info */}
          <div className={cn(
            "flex-shrink-0 w-full md:w-64",
            isMobile && "!w-full"
          )}>
            <div className="mb-6 flex items-center gap-2">
              <h3
                className={cn("font-semibold text-lg md:text-xl", isMobile && "!text-lg")}
                style={{ color: textColor || undefined }}
              >
                About {displayName}
              </h3>
              {ownerActions}
            </div>

            {/* Stats - Sales and Joined shown together, Products shown after */}
            <div className="flex gap-8">
              {/* Sales — the setting must be on AND there must be at least one.
                  "SALES 0" is not a neutral fact on a storefront: it is among
                  the first things a buyer reads about a seller and it says
                  nothing a new shop wants said. Absent beats zero, and the stat
                  appears on its own the moment a first sale lands. */}
              {settings.showSalesStats && Number(displayTotalSales) > 0 && (
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

              {/* Products - the setting must be on AND there must be at least
                  one, which is the rule Sales already follows three blocks up:
                  "PRODUCTS 0" is among the first things a buyer reads about a
                  creator and it says nothing a new page wants said. Absent
                  beats zero, and the stat appears the moment a first product
                  is published.

                  Communities was asked for here too, conditionally, and it is
                  not built: see the note beside the Communities tab in
                  app/(marketing)/u/[username]/page.tsx. There is no count to
                  show, and inventing one would be a number that means nothing. */}
              {settings.showProductsStats !== false && displayProductsCount > 0 && (
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

            {/*
              CONTACT, WHICH THE PAGE HAD NO WAY OF OFFERING.

              A creator page could be read by somebody who wanted to ask a
              question and there was nothing on it to ask through. This is a
              plain mailto, under the stats, in the column that already says
              who this is.

              The creator's own typed address when they have one, and the
              account's own email when they have not. That fallback is the
              owner's explicit call, made where it is resolved — see the
              creator page's ShopHeaderRenderer — because a creator page with
              no way to be reached was the thing they did not want. This
              comment used to claim the opposite, which had stopped being
              true.
            */}
            {contactEmail && (
              <div className="mt-6 text-sm" style={{ color: textColor || undefined }}>
                <ContactReveal email={contactEmail} />
              </div>
            )}
          </div>

          {/* Right Column - About Content */}
          <div className="flex-1 min-w-0">
            {/* Media Carousel - displayed above headline and content */}
            {mediaItems.length > 0 && (
              <div className="mb-6">
                {/* Carousel Container */}
                <div className="relative group">
                  {/* Carousel Track with smooth sliding animation */}
                  <div
                    className="relative aspect-video rounded-lg overflow-hidden bg-muted"
                    onPointerDown={onMediaPointerDown}
                    onPointerUp={onMediaPointerUp}
                    onPointerCancel={() => { dragRef.current = null }}
                    /* pan-y: the browser keeps vertical scrolling, we take the
                       horizontal axis. Without it the compositor claims the
                       gesture before a single pointermove is delivered. */
                    style={mediaItems.length > 1 ? { touchAction: "pan-y" } : undefined}
                  >
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
                          {/*
                            ═══════════════════════════════════════════════
                             `=== true`, NOT `!== false`, AND THAT IS THE
                             WHOLE OF THE FLASH ON THE WAY BACK
                            ═══════════════════════════════════════════════
                            `mediaLoading` starts as an empty object, so
                            `!== false` was true for every picture on mount:
                            a shimmering grey skeleton over each one, and the
                            picture itself held at opacity 0.

                            That is right the first time. Coming BACK to this
                            page it is wrong — the component remounts, the
                            state is empty again, and every picture that is
                            already in the browser cache shows a loading
                            skeleton and then fades in over 300ms, on a page
                            that was on screen a moment ago.

                            Filmed on production, document.getAnimations()
                            during a back navigation reported a 1500ms
                            `shimmer` and a 300ms fade still running.

                            Asking for `=== true` inverts the default from
                            "loading" to "not loading". A picture that has to
                            be fetched still fires onLoadStart and still gets
                            its skeleton; one that is already decoded is
                            simply there.
                          */}
                          {mediaLoading[item.id] === true && item.type === "image" && (
                            <div className="absolute inset-0 z-10">
                              <MediaSkeleton className="w-full h-full rounded-lg" />
                            </div>
                          )}

                          {item.type === "image" ? (
                            <Image
                              src={item.url}
                              alt={item.caption || ""}
                              fill
                              /* No `sizes` meant 100vw: a phone at 3x fetched a
                                 picture wider than a desktop for a slide in a
                                 column. The column is at most ~600px. */
                              sizes="(max-width: 768px) 100vw, 600px"
                              className={cn(
                                "object-cover transition-opacity duration-300",
                                /* Same inversion as the skeleton above. */
                                mediaLoading[item.id] === true ? "opacity-0" : "opacity-100"
                              )}
                              onLoadStart={() => handleMediaLoadStart(item.id)}
                              onLoad={() => handleMediaLoad(item.id)}
                            />
                          ) : (
                            (() => {
                              const embed = videoEmbedUrl(item.url)
                              return embed ? (
                                <iframe
                                  src={embed}
                                  title={item.caption || "Video"}
                                  className="w-full h-full"
                                  allowFullScreen
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                />
                              ) : null
                            })()
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
                  {/*
                    RICH TEXT WHEN THERE IS ANY, plain text when there is not.
                    The story is written in a real editor now, so it arrives as
                    markup; every story written before that is a plain string
                    whose line breaks are the only formatting it has, and
                    putting THAT through an HTML renderer loses them. The test
                    is whether the value contains a tag.

                    It is sanitised on save (app/api/creator-profile) and the
                    class list here allows nothing to execute. `storelib-prose`
                    is the typography: Tailwind's preflight flattens h2, ul and
                    blockquote to nothing, so rendered markup without it looks
                    exactly like the plain text it replaced.
                  */}
                  {/<[a-z][\s\S]*>/i.test(settings.aboutContent || "") ? (
                    <div
                      className="storelib-prose"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: settings.aboutContent || "" }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{settings.aboutContent}</p>
                  )}
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

        {/* Accepted Payment Methods Section - 1575px width (5% wider) */}
        {showPaymentMethods && paymentMethods.length > 0 && (
          <div className={cn(
            "max-w-[1180px] mx-auto w-full",
            // Mobile: stack vertically, Desktop: side by side
            "flex flex-col gap-3 md:flex-row md:gap-12",
            // Override for editor preview mode
            isMobile && "!flex-col !gap-3"
          )}>
            <div className={cn(
              "flex-shrink-0 w-full md:w-64",
              isMobile && "!w-full"
            )}>
              <h3
                className={cn(
                  "font-semibold text-base md:text-lg",
                  isMobile && "!text-base"
                )}
                style={{ color: textColor || undefined }}
              >
                Accepted payment methods
              </h3>
            </div>
            <div className="flex-1 w-full">
              {/* The card brands are drawn in their own colours, on their own white chips, in either look (data-keep-bright, round 30). */}
              <div className="flex flex-wrap items-center -space-x-1" data-keep-bright="">
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
          "max-w-[1180px] mx-auto w-full mt-6 md:hidden",
          isMobile && "!block !mt-6"
        )}>
          <div
            className="w-full h-px mb-6"
            style={{ backgroundColor: textColor ? `${textColor}20` : "#e5e7eb" }}
          />
          <h3
            className="font-semibold text-base mb-2"
            style={{ color: textColor || undefined }}
          >
            Returns & exchanges
          </h3>
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
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  // All payment methods enabled by default
  const paymentMethods = ["paypal", "visa", "mastercard", "amex", "applepay", "googlepay"]

  return (
    <SectionContainer isMobile={isMobile}>
      <div
        className={cn(
          "w-full py-6 px-2 md:py-12 md:px-2",
          isMobile && "!py-6 !px-2"
        )}
        style={{ backgroundColor: paint(backgroundColor, "page") || "transparent" }}
      >
        {/* Top divider */}
        <div
          className="w-full h-px mb-8"
          style={{ backgroundColor: textColor ? tint(paint(textColor, "ink"), "20") : paint("#e5e7eb", "line") }}
        />

        {/* Accepted Payment Methods Section - 1575px width (5% wider) */}
        <div className={cn(
          "max-w-[1180px] mx-auto w-full",
          "flex flex-col gap-3 md:flex-row md:gap-12",
          isMobile && "!flex-col !gap-3"
        )}>
          <div className={cn(
            "flex-shrink-0 w-full md:w-64",
            isMobile && "!w-full"
          )}>
            <h3
              className={cn(
                "font-semibold text-base md:text-lg",
                isMobile && "!text-base"
              )}
              style={{ color: paint(textColor, "ink") || undefined }}
            >
              Accepted payment methods
            </h3>
          </div>
          <div className="flex-1 w-full">
            <div className="flex flex-wrap items-center -space-x-1" data-keep-bright="">
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
                style={{ color: textColor ? tint(paint(textColor, "ink"), "99") : paint("#6b7280", "ink") }}
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
          "max-w-[1180px] mx-auto w-full mt-6 md:hidden",
          isMobile && "!block !mt-6"
        )}>
          <div
            className="w-full h-px mb-6"
            style={{ backgroundColor: textColor ? tint(paint(textColor, "ink"), "20") : paint("#e5e7eb", "line") }}
          />
          <h3
            className="font-semibold text-base mb-2"
            style={{ color: paint(textColor, "ink") || undefined }}
          >
            Returns & exchanges
          </h3>
          <p
            className="text-sm"
            style={{ color: textColor ? tint(paint(textColor, "ink"), "cc") : paint("#374151", "ink") }}
          >
            See item details for return and exchange eligibility.
          </p>
        </div>
      </div>
    </SectionContainer>
  )
}

/**
 * The third copy of the YouTube regex used to live here, 400 lines from
 * anything that looked related — and it was the one that decided what a
 * visitor actually saw. Parsing now happens in lib/social/video, which also
 * understands Vimeo; a stored link that no longer parses renders nothing
 * rather than an iframe pointed at a guess.
 */

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
  creatorUsername,
  creatorAvatarUrl,
  viewerIsOwner,
  productsOrder,
  productId,
  reviews = [],
  reviewsCount = 0,
  reviewsAverage = 0,
  accentColor,
  globalSettings,
  sellerMemberSince,
  sellerTotalSales,
  sellerProductsCount,
  sellerContactEmail,
  onUpdateAboutSettings,
  onOpenAboutSidebar,
  aboutOwnerActions,
  communityBlocks,
}: UnifiedSectionProps) {
  const paint = useSitePaint()
  // Defensive check - ensure section and settings exist
  if (!section?.settings?.visible) return null

  // For more-from-seller, don't apply wrapper padding as it handles its own layout
  // (and the community card, which draws its own column and spacing the same way)
  const isMoreFromSeller = section.type === "more-from-seller" || section.type === "community"

  /**
   * THE FEATURED RAIL TAKES NO HORIZONTAL PADDING FROM ITS SPACING SETTING.
   *
   * `defaultFeaturedProductsSettings` ships `paddingLeft/Right: 16` (12 on
   * mobile), and this wrapper applied it on top of the rail's own
   * SectionContainer — so the Home grid sat 32px from the edge on desktop
   * while the Products tab, which has only the container, sat at 16. The same
   * cards, on two tabs of one page, at different widths, moving sideways as
   * you switched. It was invisible to a test that used 0.
   *
   * Vertical spacing is still the creator's: it separates this section from
   * the ones above and below it, which is what that control is for. Horizontal
   * is not a per-section choice — it is the page's column, and every other
   * section on the page gets it from SectionContainer too.
   */
  const isProductRail = section.type === "featured-products"

  /*
    AND THE REVIEWS OWN THEIR COLUMN TOO, which is the half of this I missed.
    UnifiedReviewsSection carries PRODUCT_SECTION_CONTAINER now, so it has the
    page's column already — and this wrapper was still adding spacing.paddingLeft
    on top of it. 12px from here plus px-3 from the container is 24px, against
    More from the seller's 12, which is exactly the step the owner kept
    pointing at: the reviews card sitting a card's border further in than the
    product card above it.

    Changing the container without changing this fixed nothing visible, which
    is why it came back a second time.
  */
  const isReviews = section.type === "reviews"

  /** Horizontal padding belongs to whichever of these draws its own column. */
  const ownsItsColumn = isMoreFromSeller || isProductRail || isReviews

  // Defensive access to spacing and colors with fallbacks
  const spacing = section.settings.spacing || { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }
  const colors = section.settings.colors || { backgroundColor: "transparent", textColor: "inherit" }

  const style = {
    paddingTop: isMoreFromSeller ? undefined : spacing.paddingTop,
    paddingBottom: isMoreFromSeller ? undefined : spacing.paddingBottom,
    paddingLeft: ownsItsColumn ? undefined : spacing.paddingLeft,
    paddingRight: ownsItsColumn ? undefined : spacing.paddingRight,
    /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
    backgroundColor: paint(colors.backgroundColor, "page") || "transparent",
    color: paint(colors.textColor, "ink") || "inherit",
  }

  // isEditorMode is true when onSelect is provided - allows selection even in preview mode
  const isEditorMode = !!onSelect

  return (
    <div
      onClick={onSelect}
      className={cn(
        "transition-all relative",
        isEditorMode && "cursor-pointer",
        isEditorMode && isSelected && "ring-2 ring-sky-500 ring-inset",
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
          creatorName={creatorName}
          creatorUsername={creatorUsername}
          creatorAvatarUrl={creatorAvatarUrl}
          viewerIsOwner={viewerIsOwner}
          productsOrder={productsOrder}
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
      {section.type === "community" && (
        <UnifiedCommunitySection
          settings={section.settings as CommunitySettings}
          data={communityBlocks?.[((section.settings as CommunitySettings).communityId || "").toLowerCase()] ?? null}
          isMobile={isMobile}
          isEditorCanvas={!!onSelect}
          globalSettings={globalSettings}
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
          contactEmail={sellerContactEmail}
          onUpdateSettings={onUpdateAboutSettings}
          onOpenSidebar={onOpenAboutSidebar}
          pageBackgroundColor={globalSettings?.themeColors?.background}
          ownerActions={aboutOwnerActions}
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
          isMobile
            ? "flex flex-col gap-4"
            : isPreviewMode
              ? "flex flex-row gap-8 items-center"
              : "flex flex-col gap-8 items-center md:flex-row",
          !isMobile && isPreviewMode && (settings.imagePosition === "left" ? "flex-row" : "flex-row-reverse"),
          !isMobile && !isPreviewMode && (settings.imagePosition === "left" ? "md:flex-row" : "md:flex-row-reverse"),
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
                /* Half the 1180px column from md up; the whole width below. */
                sizes="(max-width: 768px) 100vw, 590px"
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
                <a
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
                </a>
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
function getBenefitIcon(iconName: string): React.ComponentType<React.SVGProps<SVGSVGElement>> | null {
  /*
    THE MAP AND THE 1736-ICON NAMESPACE IMPORT BOTH MOVED TO ./section-icons.
    They were the largest thing on a product page — 196 KB compressed of
    lucide, because a name looked up at runtime is a name a bundler cannot
    tree-shake. That file explains it and is generated from the picker's own
    list, so nothing a creator can choose stopped resolving.
  */
  return getIconComponent(iconName)
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
                  settings.columns === 3 && "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
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
  const router = useRouter()

  if (!settings?.visible) return null

  const hasLink = settings.linkProductSlug || settings.linkUrl
  const cursorClass = hasLink ? "cursor-pointer" : "cursor-default"

  const handleTextClick = () => {
    if (settings.linkProductSlug) {
      const internalPath = `/p/${settings.linkProductSlug}`
      // In Capacitor, use client-side navigation to preserve auth session
      if (isNativeApp()) {
        router.push(internalPath)
      } else {
        window.location.href = internalPath
      }
    } else if (settings.linkUrl) {
      window.location.href = settings.linkUrl
    }
  }

  return (
    <SectionContainer className="py-3" noPadding={false}>
      <div
        className="w-full"
        style={{
          backgroundColor: settings.colors?.backgroundColor || "#000000",
          color: settings.colors?.textColor || "#ffffff",
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
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
  viewerIsOwner,
  productsOrder,
}: {
  settings: FeaturedProductsSettings
  products?: ProductData[]
  isMobile?: boolean
  isPreviewMode?: boolean
  isEditorCanvas?: boolean
  globalSettings?: GlobalStoreSettings
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  viewerIsOwner?: boolean
  /** The creator's own arrangement, shared with the Products tab. */
  productsOrder?: string[]
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing
  /**
   * NO HORIZONTAL PADDING OF ITS OWN. This was 8, applied as an INLINE style,
   * and an inline style beats a class — so it replaced SectionContainer's
   * responsive `px-3 sm:px-4 lg:px-6` outright. The Featured rail sat 8px from
   * the edge while the Products tab sat at 12px on mobile and 24px on desktop,
   * so the two tabs of the same page had visibly different margins and the
   * cards changed width as you switched.
   *
   * `undefined` leaves the container's own padding alone.
   */
  const horizontalPadding = undefined

  /**
   * NO SORT AND NO FILTER STATE, and no touch handling for either.
   *
   * The rail is a teaser: it shows the creator's products in their own order
   * and points at the Products tab, which owns both controls.
   *
   * What was here was the wreckage of two removals. A hold-to-open touch
   * handler — `sortTouch`, a 140ms timer, a 6px movement threshold and a
   * `document.getElementById("sb-sort-trigger").click()` — outlived the
   * dropdown it opened by several commits, so it was reaching for an element
   * that no longer exists. The sort and category STATE outlived its controls
   * by one, leaving state nothing could change. Both are worse than a missing
   * feature: they read as working code.
   */
  /**
   * The `matchMedia("(max-width: 768px)")` that used to live here is gone.
   *
   * It decided the column count, and Tailwind's `sm:` decided the Products
   * tab's — two breakpoints 128px apart for one grid. It also ran in an
   * effect, so the first paint was always the desktop layout and a phone
   * re-laid-out a frame later. Both are CSS now.
   */

  /**
   * `formatPrice` was here too, hardcoded to USD, and unused since the rail
   * started rendering StorefrontProductCard — which formats its own price in
   * the store's currency. A dead copy that says "$" is not neutral: it is the
   * one somebody reaches for next time.
   */

  /**
   * The products this section is about: the creator's picks, IN THEIR ORDER.
   *
   * This was a `.filter()`, and a filter keeps the order of the array it
   * filters — which is the page's query, newest first. So a creator could
   * drag their products into the arrangement they wanted, it was saved in
   * `productIds`, and the page then ignored it. Home and the Products tab
   * were the same list twice.
   *
   * The ordering itself is in lib/store-builder/featured-order, where it can
   * be run rather than read: tests/featured-order.test.ts covers the
   * arrangement surviving, an id that no longer resolves, and the empty case.
   */
  /**
   * TWO DIFFERENT QUESTIONS, ASKED IN ORDER.
   *
   * `productIds` is a SELECTION made in the builder: which products are on
   * Home at all. `productsOrder` is the arrangement the creator dragged on
   * the page itself, and it governs the Products tab. Applying the second to
   * the result of the first means one arrangement serves both tabs, which is
   * what "arrange my products" means to the person doing it — an Arrange
   * control on Home that reordered a list only the other tab showed would be
   * a control that appears not to work.
   *
   * Empty `productsOrder` is a no-op, so a creator who has never touched
   * Arrange still sees their builder selection exactly as it was.
   */
  const sectionProducts = useMemo(
    () => applyManualOrder(pickFeatured(products, settings.productIds), productsOrder),
    [products, settings.productIds, productsOrder],
  )

  /**
   * "Featured", not "Featured Products".
   *
   * The word "Products" is now the title of the tab beside it and the label on
   * the link at the other end of this very row, so the rail was the third
   * thing on one screen saying it. The creator's own headline still wins —
   * this only replaces the value nobody chose, the old shipped default, which
   * is the same "did anyone actually decide this" rule the sticky bar and the
   * inherited-white backgrounds use.
   */
  const headline = settings.headline === LEGACY_FEATURED_HEADLINE ? "Featured" : settings.headline


  // The sort labels live in components/storefront/catalog-controls, which both
  // this rail and the Products tab render. A second copy here is how the two
  // ended up with different words for the same five options.

  // ✅ Placeholder ONLY inside Store Builder canvas
  if (!products || products.length === 0) {
    if (isEditorCanvas) {
      return (
        <SectionContainer
          isMobile={isMobile}
          style={{
            paddingTop: spacing.paddingTop,
            paddingBottom: spacing.paddingBottom,
            paddingLeft: horizontalPadding,
            paddingRight: horizontalPadding,
          }}
        >
          <h2
            className={cn("font-semibold text-foreground mb-6", "text-lg sm:text-xl")}
            style={{ textAlign: settings.typography?.textAlign }}
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
        paddingLeft: horizontalPadding,
        paddingRight: horizontalPadding,
      }}
    >
      {/*
        THE LEFT-HAND CATEGORY RAIL IS GONE, and with it the two-column layout
        it forced. It took 192px off every desktop storefront to list categories
        most creators have two of, and it pushed the products — the thing the
        page exists for — into a narrower column and further from the eye.

        WHAT REPLACED IT is one pill in the header row — the same control the
        Products tab uses, on both layouts rather than mobile only. It costs a
        line rather than a column, and it still answers to the builder's
        `hideCategoryFilter` toggle, which for a while it silently ignored: the
        switch was in the sidebar, saved, and read by nothing.
      */}
      <div className="flex flex-col">
        {/* Main */}
        <div className="flex-1 min-w-0">
          {/*
            THE HOME RAIL IS A TEASER, NOT A SECOND PRODUCTS TAB.

            It used to carry the same sort and category controls the Products
            tab has, which is two of everything on one page: the visitor sorts
            here, switches tab, and finds a different sort. A rail that shows
            the creator's products and leaves the browsing to the tab named
            after it has one job.

            It briefly carried a "View all products →" link as well. The tab
            strip is directly above it saying "Products" — a second control
            two inches below the first, doing the same thing, is not a
            shortcut. The heading is the whole header now.
          */}
          <CatalogHeader
            title={headline}
            titleClassName={cn(
              // A CSS breakpoint, not the JS one that used to live here: that
              // resized the heading a frame after hydration.
              isMobile ? "text-lg" : "text-lg sm:text-xl lg:text-2xl",
              !settings.colors?.textColor && "text-foreground",
            )}
            titleStyle={{
              textAlign: settings.typography?.textAlign,
              color: settings.colors?.textColor || undefined,
            }}
          >
            {/*
              THE OWNER'S CONTROL, in the header row rather than under it, so
              it costs no vertical space at all — this row exists and is
              `min-h-9` whether or not anything is in it, and on Home its
              right-hand side is otherwise empty.

              The same control the Products tab shows, so the arrangement can
              be changed from whichever tab the creator is looking at.
              `isPreviewMode` is deliberately not consulted: this is gated on
              the session, which the server decided.
            */}
            <ArrangeProductsControl products={sectionProducts} isOwner={viewerIsOwner} />
          </CatalogHeader>

          {/*
            THE SAME BREAKPOINTS AS THE PRODUCTS TAB, because they are the same
            grid of the same products on the same page.

            The column count used to come from a JS media query at
            `max-width: 768px`, while the Products tab used Tailwind's `sm:` at
            640px. BETWEEN THOSE TWO NUMBERS THE TABS DISAGREED: measured at
            700px, Home drew one column of 668px cards and Products drew two of
            326px, so switching tab halved every card and pulled the grid up by
            more than a screen — 2472px of grid against 922px. That is the
            "product card row moves up for no reason".

            Two definitions of "mobile" on one page is the bug; one of them
            being JavaScript is what made it invisible until a window happened
            to be that wide. The creator's `mobileListing` choice still decides
            the phone layout — it is now the base class, with `sm:` and `lg:`
            taking over above it, exactly as the Products grid does.

            `isMobile` is the builder's explicit phone preview, where the frame
            is narrow but the viewport is not, so CSS cannot see it. That one
            case still has to be told.
          */}
          <div
            /**
             * THREE FROM `md`, NOT FROM `lg`.
             *
             * The grid dropped to two columns below 1024px, and the creator
             * page is edited inside a frame that is a sidebar and two insets
             * narrower than the window — so on an ordinary laptop the page a
             * creator was arranging had two columns while the page a visitor
             * on the same laptop sees has three. A card at 768/3 is about
             * 230px wide, which is still wider than the phone layout every
             * one of these is designed to work at.
             */
            className={cn(
              "grid gap-4",
              (settings.mobileListing ?? 1) === 1 ? "grid-cols-1" : "grid-cols-2",
              !isMobile && "sm:grid-cols-2 md:grid-cols-3",
            )}
          >
            {sectionProducts.map((product) => {
              // Get product card colors from theme settings
              const cardBgColor = settings.productCardColors?.backgroundColor || undefined
              const cardTextColor = settings.productCardColors?.textColor || settings.colors?.textColor || undefined
              const cardPriceColor = settings.productCardColors?.priceColor || (cardTextColor ? `${cardTextColor}99` : undefined)
              const cardBorderColor = settings.productCardColors?.borderColor || (cardTextColor ? `${cardTextColor}20` : undefined)

              /**
               * THE FOUR COLOURS ABOVE USED TO STOP HERE.
               *
               * They were computed from the theme on every render and then
               * the card was given the product and the creator and nothing
               * else, so the card painted itself the design system's white.
               * On every dark scheme that was a white card with near-white
               * text on it. This is the line that was missing.
               */
              const content = (
                <StorefrontProductCard
                  product={product}
                  creatorName={creatorName}
                  creatorUsername={creatorUsername}
                  creatorAvatarUrl={creatorAvatarUrl}
                  isOwner={viewerIsOwner}
                  surface={{
                    backgroundColor: cardBgColor,
                    borderColor: cardBorderColor,
                    textColor: cardTextColor,
                    priceColor: cardPriceColor,
                    /**
                     * The pill and the seller row. Not in the theme's card
                     * block, which states two colours; derived from those two
                     * so they land between them on any scheme.
                     */
                    ...cardAccents(cardBgColor, cardTextColor),
                  }}
                />
              )

              /**
               * The card is a whole card now — its own border, its own links to
               * the product and to the creator. It is no longer wrapped in a
               * second link with a second border.
               *
               * In the BUILDER CANVAS those links must not navigate: a click
               * there selects the section. Rather than rendering a different
               * card for the editor, which is how the two drift apart, the
               * links are simply switched off with pointer-events and the click
               * is caught on the way down.
               */
              if (isPreviewMode) {
                return (
                  <div key={product.id} className="cursor-pointer [&_a]:pointer-events-none">
                    {content}
                  </div>
                )
              }

              return <div key={product.id}>{content}</div>
            })}
          </div>

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
  /**
   * Rendered over the cover, top-right, on the LIVE storefront only. The page
   * fills it with the owner's "Edit profile" control when the signed-in
   * viewer owns this page. It is a slot rather than a prop the header acts on,
   * so this component stays free of session logic and there is exactly one
   * place the button can come from.
   */
  ownerActions?: React.ReactNode
  /**
   * Aggregates for the meta row. Passed in rather than derived here because
   * the page already has them: a rating weighted across every product.
   *
   * NO FOLLOWER COUNT. The meta row printed one when no follow block was
   * given (the editor's canvas, a creator's own page with the Show followers
   * switch off). The owner (round 38): followers and following only on
   * profiles inside communities, never on a creator page. A person's profile
   * draws its counts in the follow block below, not here.
   */
  reviewCount?: number
  reviewAverage?: number
  /**
   * THE FOLLOW BLOCK, under the meta row, on the LIVE page only
   * (components/profile/profile-social.tsx, filled by the page). On a
   * person's profile it carries their followers and following; on a creator
   * page only where they are from and Follow.
   */
  followRow?: React.ReactNode
  /**
   * THE COLOUR SCHEME'S TYPE COLOURS, resolved by the page.
   *
   * This block painted itself from `settings.colors.textColor`, falling back
   * to `text-foreground`. Both are wrong on a themed page: the builder writes
   * that setting out as "#000000" on every save whether or not anybody chose
   * it, and `text-foreground` is the Storelib app's near-black. So a creator
   * on a dark scheme got their own name in black on black — which is the
   * screenshot this exists to fix.
   *
   * A colour the creator ACTUALLY typed still wins; see `isInheritedBlack`.
   */
  surface?: { textColor?: string; mutedColor?: string; avatarBorderColor?: string }
  /**
   * The badges Storelib has granted this creator (lib/creators/badges.ts),
   * drawn after the name. Ids, not components, so the server page can pass
   * them across the client boundary.
   */
  badges?: CreatorBadgeId[]
  /**
   * THE CONTACT IS NOT ON THIS LINE.
   *
   * It was, for a day. The line under the bio is followers, sales and the
   * creator's social links — who they are and where else they are — and a
   * way to email them sat oddly among them. It belongs in the About block,
   * which is the part of the page that is about dealing with this person,
   * and the About block is a LOCKED default section, so every creator page
   * has one. See UnifiedAboutSection's `contactEmail`.
   */
}

export function UnifiedShopHeader({
  settings,
  creator,
  profile,
  productCount = 0,
  isMobile = false,
  isPreviewMode = false,
  isSelected = false,
  onSelect,
  onAvatarEdit,
  onCoverEdit,
  onBioEdit,
  globalSettings,
  ownerActions,
  reviewCount = 0,
  reviewAverage = 0,
  followRow,
  surface,
  badges,
}: UnifiedShopHeaderProps) {
  /**
   * One decision, used by the name, the handle, the bio and the meta row.
   *
   * `storedText` is only a choice when it is not the default black the
   * builder writes out unasked. When it is a choice it wins outright, muted
   * included; when it is not, the scheme's colours apply; when there is no
   * scheme either (the builder canvas, a product page), both are undefined
   * and the design-system classes below stay in charge exactly as before.
   */
  const storedText = settings.textsColor || settings.colors?.textColor
  const chosenText = isInheritedBlack(storedText) ? undefined : storedText
  const headingColor = chosenText || surface?.textColor
  const subduedColor = chosenText ? `${chosenText}99` : surface?.mutedColor
  /**
   * WHICH PICTURE AND HOW BIG, from lib/store-builder/header-avatar — which
   * the creator page also calls, to emit a `<link rel="preload">` for exactly
   * this URL. A preload whose URL differs by one character from the one Radix
   * later requests downloads the avatar twice and shows it no sooner, so the
   * two cannot be two expressions.
   */
  const { url: avatarSrc, size: avatarSize } = headerAvatar(settings, profile?.avatar_url, isMobile)

  const coverImageUrl = settings.coverImageUrl || creator?.cover_url

  /** Still needed on its own: whether there IS a picture gates the lightbox. */
  const avatarImageUrl =
    settings.avatarUrl === "" ? undefined : settings.avatarUrl !== undefined ? settings.avatarUrl : profile?.avatar_url

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
      /**
       * A STORED WHITE IS NOT A CHOICE — page-surface.ts settles why. Without
       * this the header band stays white on Cream's #FAF4E8 page and on any
       * dark scheme, because the builder writes "#ffffff" out on every save.
       */
      style={{
        backgroundColor:
          surface && isInheritedWhite(settings.colors?.backgroundColor)
            ? "transparent"
            : settings.colors?.backgroundColor || "transparent",
      }}
    >
      {showPlaceholder ? (
        <div
          data-cover-band
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
          /**
           * THE BAND IS THE MEASUREMENT. Its height is fixed and its width is
           * the page's, so its shape changes with the window: about 3:1 on a
           * phone and better than 4:1 on a laptop. The editor's positioning
           * frame was a flat 3:1, so what a creator dragged into place on a
           * desktop was a crop of a different shape from the one the page
           * drew, and the picture landed somewhere else.
           *
           * An `object-position` crop depends only on the RATIO of the frame
           * to the image, not on its size, so a small preview of the same
           * shape shows exactly the crop this band will. Marked here and read
           * by components/storefront/use-cover-aspect.
           */
          data-cover-band
          className={cn("relative w-full overflow-hidden bg-gray-200 group", isMobile ? "h-32" : "h-48 sm:h-64")}
          onClick={!isPreviewMode ? onSelect : undefined}
        >
          {/*
            THE COVER IS THE PAGE'S LARGEST IMAGE AND ITS FIRST ONE.

            It was a plain <img> pointed at the original upload: a phone camera
            JPEG, four megabytes, painted into a 192px-tall band. Nothing
            resized it and nothing preloaded it, so the browser only learned
            the URL when React reached this element — and then downloaded the
            whole thing.

            Three changes, and the order matters:

            `priority` puts a <link rel="preload" as="image"> in the document
            head, so the download starts from the first bytes of HTML rather
            than after hydration. That is most of the "sometimes it takes very
            long".

            `sizes="100vw"` with `fill` lets the optimizer pick a width from
            the srcset that matches the screen, and re-encode to AVIF. A phone
            gets ~750px of AVIF instead of 4032px of JPEG.

            And THE FADE IS GONE. It set `opacity: 0` from a ref callback and
            transitioned back over 700ms on load — so the banner was invisible
            until JavaScript ran, and then took most of a second to arrive.
            That is the "abrupt" part: not the image appearing, but the image
            appearing slowly, after a gap, on its own schedule. The grey
            underneath is a solid colour that is simply there from the first
            paint, and the picture replaces it whenever it is ready.
          */}
          {(() => {
            /*
              THE CROP IS POSITION AND ZOOM, from lib/images/cover-crop, the
              same function the editor's frame draws with, so what was pinched
              into place in the sheet is what this band shows at every width.
              It is layout, not a transform: this band is a `.group`, and
              app/globals.css strips transforms inside one on a touch screen.
              A cover saved before zoom existed is zoom 1, which is plain
              object-fit: cover at its object-position, exactly as before.
            */
            const crop = cropFromSettings(settings.coverFocalPoint, settings.coverZoom)
            const coverStyle = {
              ...coverCropStyle(crop),
              filter: `brightness(${settings.coverBrightness ?? 1.0})`,
            }
            /**
             * `<Image>` THROWS on a host that is not in remotePatterns — it
             * does not fall back, it raises "hostname is not configured"
             * during render, and this header is at the top of every
             * storefront. `cover_url` is user data going back years; one row
             * pointing somewhere else and the whole page is an error instead
             * of a slightly-too-large photo. So an unrecognised URL loads the
             * old way: unoptimised, and there.
             */
            /*
              NO FADE ON THE COVER, and this is the second time that has been
              decided. A fade needs the image to start transparent, and an
              image that starts transparent is INVISIBLE until the script that
              reveals it has run. Measured last time at most of a second of
              blank band on a real connection, which is what "it shows up
              abruptly" actually described: the waiting, not the arriving.
              The avatar below can fade because Radix only mounts it once the
              photo has loaded, so nothing is hidden waiting for JavaScript.
              Held by tests/page-performance.test.ts.
            */
            return isOptimizableImage(coverImageUrl) ? (
              <Image
                src={coverImageUrl}
                alt={`${personName({ name: profile?.display_name, username: profile?.username })} cover`}
                fill
                sizes={coverSizes(crop.zoom)}
                quality={PORTRAIT_QUALITY}
                priority
                style={coverStyle}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt={`${personName({ name: profile?.display_name, username: profile?.username })} cover`}
                style={coverStyle}
              />
            )
          })()}

          {/*
            THE SOCIAL ICONS USED TO LIVE HERE, floating over the cover. They
            have moved down beside the bio, where they read as part of who the
            creator is rather than as a watermark on their banner — and, more
            to the point, where a creator with no cover image still gets them.
            Inside this branch they only existed when `coverImageUrl` did.

            They are rendered in ONE place. Do not add a second copy here.
          */}
          {/*
            Bottom-right of the cover, not top-right. Up there it sat level with
            whatever the page has above the cover — the subscribe bar's own
            button, in practice — and read as part of that row rather than as
            something belonging to the banner. Down here it is clearly the
            cover's own control, and the avatar straddles the bottom CENTRE so
            the two never collide.
          */}
          {/*
            TOP-RIGHT ON A NARROW SCREEN, bottom-right once there is room.

            The avatar straddles the bottom CENTRE of the cover, so a control
            pinned bottom-right has to clear it: "Edit profile" plus the menu
            is about 150px, which on a 390px screen reaches back past the
            avatar's right edge. It sat on top of it, visibly.

            THIS IS A BREAKPOINT, NOT THE `isMobile` PROP. `isMobile` is the
            store BUILDER's phone-preview switch — the published page renders
            with it false whatever device is asking, so on a real phone this
            branch was choosing the desktop position and the overlap survived
            the fix that was supposed to remove it. Only CSS knows how wide the
            screen actually is. The prop is still honoured, because the
            builder's preview frame is narrow while its viewport is not.
          */}
          {ownerActions && (
            <div
              className={cn(
                /* 15px from the top on a phone, a touch below the 12px it was, so the
                   raised buttons sit into the banner rather than on its edge. */
                "absolute right-3 top-[15px] z-[6]",
                !isMobile && "sm:bottom-4 sm:right-4 sm:top-auto",
              )}
            >
              {ownerActions}
            </div>
          )}

          {/*
            THE BUILDER'S HOVER WASH, UNDER A MOUSE ONLY. On a phone there is
            no hover, and on the phones that claim one anyway (Android web
            views) a tap left the cover under a 30% black fade until the next
            tap somewhere else. pointer-fine is globals.css's own variant.
          */}
          {!isPreviewMode && onSelect && (
            <div className="absolute inset-0 bg-black/0 pointer-fine:group-hover:bg-black/30 transition-all flex items-center justify-center cursor-pointer">
              <div className="opacity-0 pointer-fine:group-hover:opacity-100 transition-opacity bg-white rounded-full p-2 shadow-lg">
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
      ) : ownerActions ? (
        /*
          No cover: the control has no banner to sit at the bottom of, and
          pinning it to the very top of the section put it level with the
          subscribe bar above — reading as part of that row, and floating well
          clear of anything it belongs to. It gets a proper row of its own with
          the same breathing space the header below it has.
        */
        <div className={cn("flex justify-end", isMobile ? "px-3 pt-5" : "px-4 pt-6 sm:px-6")}>{ownerActions}</div>
      ) : null}

      {/*
        The top padding is dropped when there is a cover, because the avatar's
        negative margin has to travel through it before it reaches the cover at
        all. Left in, a -68px offset on a 137px avatar spent 48px of itself on
        padding and produced a 15% overlap instead of 50%. Written as an inline
        style rather than a `pt-0` class so it does not depend on which of two
        equally specific Tailwind rules the stylesheet happens to emit last.
      */}
      {/*
        The bottom padding is deliberately smaller than the top used to be.
        With the stats and the icons merged into one row, `py-8 sm:py-12` left
        a stretch of empty page between that row and whatever follows — big
        enough to read as a mistake rather than as spacing. The top padding is
        still dropped entirely under a cover, so the avatar can straddle it.
      */}
      {/*
        Without a cover the avatar sat a little tight under the bar above it,
        so it gets a touch more room: 36px on a phone, 40px and 56px wider up.
        With a cover the inline style below still takes the top padding away.
      */}
      <SectionContainer
        className={cn(isMobile ? "pt-9 pb-5" : "pt-10 pb-6 sm:pt-14 sm:pb-8")}
        style={coverImageUrl ? { paddingTop: 0 } : undefined}
        isMobile={isMobile}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="relative group"
            style={{
              /**
               * EXACTLY HALF over the cover, whatever size the avatar is.
               *
               * This was two hardcoded offsets, -2.875rem and -3.75rem — 46px
               * and 60px against a 137px avatar, so the overlap was 34% on
               * mobile and 44% on desktop, and it drifted further whenever the
               * creator picked a different avatar size. Deriving it from
               * `avatarSize` makes the circle straddle the cover's edge the
               * way the design asks for, at every size, on both layouts.
               */
              marginTop: coverImageUrl ? `-${avatarSize / 2}px` : "0",
            }}
          >
            {/*
              NO `key` HERE. It used to be keyed on the avatar URL, which
              forced a full remount every time the URL changed — and a remount
              resets Radix's image-loading state, so the avatar dropped back to
              grey initials and then popped to the photo. That was the flashing
              in the builder canvas. Changing `src` alone already re-runs the
              loader; the key bought nothing and cost a flash every time.

              The fallback's delay (600ms, the shared default) is the other
              half: a cached photo now paints with no initials in front of it.
              `bg-gray-200` on the root keeps the circle a solid disc while it
              decodes, so a slow image shows a plain shape rather than a hole.
            */}
            {/*
              ================================================================
               A CIRCLE
              ================================================================
              It was a rounded square for two rounds, on the argument that the
              app-icon shape agrees with the Storelib mark above it. The owner
              has asked for a circle and it is their page; a circle is also
              what every profile picture on the internet is, which is the
              other half of the argument and the half that wins with visitors.

              The crop behind it is square (components/shared/square-image-
              cropper), so a circle does throw away the corners. That is the
              known cost, and it is the same cost every social network pays.
            */}
            {/*
              Pressing the picture opens it full size. Off in the editor,
              where a press selects the section to style it instead.
            */}
            <AvatarLightbox
              src={avatarImageUrl || undefined}
              name={profile?.display_name || undefined}
              /*
                NOT `isPreviewMode`. That reads like the discriminator and is
                not one: the LIVE page passes isPreviewMode={false} (see
                ShopHeaderRenderer), so keying off it would have switched the
                lightbox off on the only page it is for. What actually means
                "this header is being edited" is the presence of the edit
                callbacks, which is the same signal the cover placeholder uses
                a few lines up.
              */
              disabled={!!onAvatarEdit || !!onSelect}
            >
              <Avatar
                className="shrink-0 bg-gray-200"
                style={{
                  width: `${avatarSize}px`,
                  height: `${avatarSize}px`,
                  borderRadius: "9999px",
                  /* A clear band of the page around the photo where it crosses the cover. */
                  borderWidth: "3px",
                  borderStyle: "solid",
                  /**
                   * The ring is the page's own background (the scheme's), so
                   * never a white or grey hoop on a dark page. The page
                   * resolves it; see storefront-chrome `avatarBorder`.
                   */
                  borderColor: surface?.avatarBorderColor || settings.profileImageBorderColor || "#e5e7eb",
                  /**
                   * DEPTH, AND ONLY A LITTLE.
                   *
                   * `shadow-lg` is a single wide blur, which at this size reads
                   * as a grey halo rather than as a raised object. Two layers
                   * instead: a tight one directly underneath, which is what
                   * makes something look like it is resting ON the page, and a
                   * wider, softer one below that for the lift. Both are barely
                   * there on purpose — the picture is the thing being looked
                   * at, not the shadow.
                   */
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 28px -8px rgba(15, 23, 42, 0.20)",
                }}
              >
                {/*
                  SERVED AT THE SIZE IT IS SHOWN AT.

                  This was the raw upload too — the same four-megabyte camera
                  JPEG, decoded in full to fill a 137px circle. Radix mounts the
                  <img> only once that has finished decoding, so the wait was
                  spent looking at grey, and the photo then arrived all at once.
                  That is exactly the "first shows gray then abruptly shows the
                  image" in the report: not a bad animation, a big file.

                  At `avatarSize` ×2 the optimizer returns roughly twenty
                  kilobytes of AVIF, which lands inside a frame or two — and the
                  fallback's 600ms delay means the initials never get shown at
                  all. Same component, same swap-when-decoded logic that keeps
                  the builder from flashing; a hundredth of the bytes.

                  It goes through a URL helper rather than <Image> because the
                  point of AvatarPrimitive.Image is that IT decides when the img
                  appears, and wrapping it would take that decision away.
                */}
                {avatarImageUrl ? (
                  /*
                    Radix keeps the fallback until the photo has loaded and
                    then swaps them on one frame, which is the snap. Mounting
                    here already MEANS loaded, so a plain fade-in is the whole
                    cross-fade: the initials are still underneath it.
                  */
                  <AvatarImage
                    src={avatarSrc}
                    alt={profile?.display_name || ""}
                    /* The fade lives in the component now, and it plays only
                       when the initials were actually on screen to fade out
                       of. Hardcoding the class here replayed it on every back
                       navigation; see the note in components/ui/avatar.tsx. */
                    crossFadeFromFallback
                  />
                ) : null}
                {/*
                  WHAT THE CIRCLE HOLDS WHEN THERE IS NO PICTURE: the
                  initials, else a plain person. It was `initials || "?"` on a
                  hardcoded `bg-gray-300`, so a creator with no display name
                  got a question mark, and on a dark page the circle was a
                  bright grey disc whoever they were. The ground is a tenth of
                  the heading colour the rest of this header is written in.

                  `delayMs` 0 WHEN THERE IS NO PICTURE. The 600ms wait is
                  there so a cached photo never flashes initials first, and
                  that reason only exists when a photo is coming: with none,
                  the wait was 600ms of an empty circle on every load. The
                  wait is kept exactly as it was whenever there is a photo.
                */}
                <AvatarFallback
                  delayMs={avatarImageUrl ? undefined : 0}
                  className={cn("font-semibold", !headingColor && "bg-gray-200 text-gray-600", isMobile ? "text-lg" : "text-xl sm:text-2xl")}
                  style={headingColor ? { backgroundColor: `${headingColor}1f`, color: headingColor } : undefined}
                >
                  <AvatarMark name={(profile?.display_name || "").trim()} size={avatarSize} />
                </AvatarFallback>
              </Avatar>
            </AvatarLightbox>

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
              !headingColor && "text-foreground",
            )}
            style={{ color: headingColor }}
          >
            {personName({ name: profile?.display_name, username: profile?.username })}
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
            <CreatorBadges badges={badges} ink={headingColor} size={isMobile ? 17 : 20} className={isMobile ? undefined : "max-sm:[&_svg]:h-[17px] max-sm:[&_svg]:w-[17px]"} />
          </h1>

          {/*
            The handle. It is the address the page is served from —
            {username}.storelib.com and /u/{username} both key off it — so a
            visitor who wants to come back, or link someone here, has had no
            way to read it off the page until now. Shown only when there is
            one; a profile that has never claimed a username shows nothing
            rather than an empty "@".
          */}
          {profile?.username && (
            <p
              className={cn(
                "mt-0.5 break-words max-w-full px-4 font-[450]",
                /*
                A PIXEL AND HALF A WEIGHT STEP.

                These three lines — the handle, the bio, the meta row — were
                12/14px at 400, which is the size the rest of the app uses
                for text that sits BESIDE something. On a profile they are
                not beside anything; they are the middle of the page, under
                a name set large, and at that size they read as a caption of
                the name rather than as the page.

                One pixel and 450. Inter comes through next/font with no
                weight list, which is the variable face, so 450 is a real
                weight here and not a round to 400 — scripts/check-profile-type.mjs
                measures that rather than trusting it. Any more of either and
                it stops being the quiet line under the name.
                */
                isMobile ? "text-[13px]" : "text-[15px]",
                !subduedColor && "text-muted-foreground",
              )}
              style={{ color: subduedColor }}
            >
              @{profile.username}
            </p>
          )}

          {/*
            =====================================================================
             NO CATEGORY PILL ABOVE THE BIO
            =====================================================================
            A grey badge reading "Design" or "Music" sat between the handle and
            the bio, on the one line a visitor reads to find out who somebody
            is. It said less than the bio directly under it and it said it in
            the shape of a system label rather than in the creator's own words.

            The niche itself is NOT gone: creators.niche_tags is what
            /explore and /explore/<category> browse by, so it is how a creator
            gets found. It is a filing detail, and a filing detail does not
            belong on the front of somebody's page.

            The "Show Category" switch went with it, because a switch that
            controls nothing is worse than no switch, and the picker that sets
            the niche now says what the niche is actually for.
          */}

          {settings.showBio && (settings.bio || creator?.bio) && (
            <div className="relative group/bio inline-flex items-center justify-center">
              <p
                className={cn(
                  "max-w-xl break-words px-4 font-[450]",
                  // Tighter than it was (mt-4 / mt-6): the meta row underneath
                  // used to be two separately-margined blocks, and the column
                  // read as a series of unrelated islands.
                  // A pixel up from 12/14, and half a weight step: see the
                  // note on the handle above.
                  isMobile ? "mt-3 text-[13px]" : "mt-4 text-[15px]",
                  !subduedColor && "text-muted-foreground",
                )}
                style={{ color: subduedColor }}
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

          {/*
            ONE META ROW: the rating and the social
            icons, separated by dots.

            These were three stacked blocks, each with its own top margin, so a
            profile ran name / handle / bio / icons / stats down a long column
            of whitespace with nothing tying them together. They are all the
            same KIND of thing — small facts about the creator — so they read as
            one line with dividers, and the page gets shorter by about a
            hundred pixels.

            SOCIAL ICONS ARE THE ONLY COPY ON THE PAGE. They were an overlay on
            the cover; see the note up there for why they moved. There is no
            `showSocialMedia` gate and no per-platform switch left: filling a
            URL in is what shows an icon. Both of those toggles defaulted to
            off and were written out on every save, so a creator could type
            their Instagram in, save, and see nothing, with two different
            switches able to be the reason and neither visible from the page.

            Every part is conditional on its own, and the dividers are drawn
            BETWEEN whatever survives rather than after each item, so no
            combination leaves a dot hanging.
          */}
          {(() => {
            const parts: React.ReactNode[] = []

            if (settings.showStats) {
              /*
                NO PRODUCT COUNT HERE. It is the least interesting thing on the
                line — the products themselves are directly below, and their
                number is on the About section where somebody reading about the
                creator might actually want it. What stays is what a visitor
                cannot see by scrolling: the rating.
              */

              /**
               * The rating, and how many people it is made of. "4.9" on its own
               * is a number a buyer has no way to weigh — 4.9 from three people
               * and 4.9 from three hundred are different claims — so the count
               * travels with it. Absent entirely until somebody has reviewed
               * something, for the same reason "0 sales" was.
               */
              if ((settings.showReviews ?? true) && reviewCount > 0 && reviewAverage > 0) {
                parts.push(
                  <span key="reviews" className="flex items-center gap-1.5">
                    <Star className={cn("fill-current", isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
                    {reviewAverage.toFixed(1)}
                    <span className="opacity-70">
                      {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                    </span>
                  </span>,
                )
              }

              /*
                NO SALES COUNT IN THE HEADER. The owner: sales show only in
                the "About <creator>" block, beside Joined and Products and
                above the payment methods, where somebody reading about the
                seller finds it (UnifiedAboutSection). Under the bio it was a
                number competing with who the person is. The creator's Sales
                count switch now decides the About figure instead (the page).
              */
            }

            if (settings.socialLinks && (!isMobile || (settings.showSocialIconsOnMobile ?? true))) {
              const icons = (
                <SocialMediaIcons
                  key="social"
                  socialLinks={settings.socialLinks}
                  // Inherited from the meta row, which is already the muted
                  // grey the rest of that line uses — and follows a creator's
                  // own text colour, and stays visible on a dark storefront.
                  iconColor="currentColor"
                  iconStyle={settings.socialMediaIconStyle || "default"}
                  isPreviewMode={isPreviewMode}
                  isMobile={isMobile}
                />
              )
              // SocialMediaIcons renders null when there is nothing to show, so
              // the divider before it must depend on the same condition rather
              // than on the component being present.
              const hasAnyLink = Object.values(settings.socialLinks).some((link) => !!link?.url?.trim())
              if (hasAnyLink) parts.push(icons)
            }

            if (parts.length === 0) return null

            return (
              <div
                className={cn(
                  /*
                    THE ONE LINE ON THIS BLOCK THAT REACHED THE EDGES.
                    The name, the handle and the bio all keep `px-4` off the
                    sides; this had none, so a creator with a rating, a sales
                    count and five social icons got a row running into both
                    margins while every line above it sat neatly inside them.
                    One step more than its siblings, because the others wrap
                    mid-sentence and this one cannot break inside an icon.
                  */
                  "flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-5 font-[450]",
                  // Same pixel and same half step as the two lines above it,
                  // so the three read as one block rather than as a caption
                  // with a footnote.
                  isMobile ? "mt-3 text-[13px]" : "mt-4 text-[15px]",
                  !subduedColor && "text-muted-foreground",
                )}
                style={{ color: subduedColor }}
              >
                {parts.map((part, i) => (
                  <Fragment key={i}>
                    {/* A rule rather than a dot: with four facts on the line,
                        dots read as punctuation inside a sentence. */}
                    {i > 0 && <span aria-hidden className="h-3.5 w-px bg-current opacity-20" />}
                    {part}
                  </Fragment>
                ))}
              </div>
            )
          })()}

          {followRow ? (
            <div className={cn("w-full px-4", isMobile ? "mt-2" : "mt-3")} style={{ color: headingColor }} data-storefront-follow="">
              {followRow}
            </div>
          ) : null}
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

  // Variant state - if variants exist, use variant price as FINAL price (not additional)
  const variants = product?.variants || []
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  )
  const [currentDisplayPrice, setCurrentDisplayPrice] = useState(
    variants.length > 0 ? (variants[0]?.price_cents || 0) : (product?.price_cents ?? 0)
  )

  const handleVariantChange = useCallback((variant: ProductVariant | null, finalPrice: number) => {
    setSelectedVariant(variant)
    setCurrentDisplayPrice(finalPrice)
  }, [])

  /* In the store's own currency when the page is one store's (components/platform/price-currency). */
  const priceCurrency = usePriceCurrency()
  const formatPrice = (cents: number) => {
    return shopMoneyIn(cents, priceCurrency, { grouping: true })
  }

  /* A membership's price is per month or year, in every layout: "$9/month", never a bare "$9". */
  const pricePer = intervalOf(product ?? {})
  const priced = (cents: number) => perInterval(formatPrice(cents), pricePer)

  const productTitle = product?.title || "Product Title"
  const productPrice = product?.price_cents ?? 0
  const compareAtPrice = product?.compare_at_cents
  const productDescription = product?.description
  const productType = product?.type || "digital"
  const salesCount = product?.sales_count || 0
  const showSalesBadge = !isPreviewMode && product?.show_sales_badge !== false
  /* The "N people have purchased this" line is gone, and so is the pair of
     switches that decided whether to print it. `show_sales_badge` still
     drives the badge on the card, above. */

  // Get category badge text (use first category name, fallback to type)
  const categoryBadgeText = product?.categories?.[0]?.name || productType

  // Determine button text: Use call_to_action if set, otherwise default based on price
  const buttonText = product?.call_to_action || (productPrice === 0 ? "Get for Free" : "I want this!")

  const galleryImages = product?.gallery_urls?.length
    ? (imagesOnly([product.thumbnail_url, ...product.gallery_urls]).filter(Boolean) as string[])
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

  // Priority: Product FAQs (from product form) > Config FAQs > Default FAQs
  const getDisplayFaqs = () => {
    // HIGHEST PRIORITY: If product has FAQs set in the product form, use those exclusively
    if (productFaqs.length > 0) {
      return productFaqs
    }

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

    // Combine: Default FAQs FIRST, then custom FAQs
    return [...defaultFaqs, ...customFaqs]
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
  const isDarkTheme = isDarkScheme(themePreset) || (settings.colors?.backgroundColor && (
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
        paddingTop: settings.spacing?.paddingTop,
        paddingBottom: settings.spacing?.paddingBottom,
        backgroundColor: settings.colors?.backgroundColor || "transparent",
      }}
    >
      <SectionContainer className={cn(isMobile ? "py-4" : "py-6 sm:py-12", "pb-24 lg:pb-12")} isMobile={isMobile}>
        {/*
          =====================================================================
           `items-start` IS WHAT WAS STOPPING THE CARD FROM STICKING
          =====================================================================
          The buying card has carried `sticky top-6` all along and has never
          stuck. A sticky element travels inside ITS OWN containing block, and
          `items-start` shrinks a grid item to its content — so the column
          holding the card was exactly the card's height, and a sticky element
          with nowhere to travel behaves exactly like one with no sticky at
          all. The class was right there in the source, looking correct.

          Stretched, the column is as tall as the row and the card rides down
          it. Measured in scripts/check-buy-card.mjs: with `items-start` the
          card ends 1176px above the viewport after a 1200px scroll; without
          it, the card holds at 24px.
        */}
        <div className={cn("grid gap-8", !isMobile && "lg:grid-cols-5 lg:gap-12")}>
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

            {/*
              ===================================================================
               THE NAME IS READ ONCE, WHERE THE PRICE IS
              ===================================================================
              On a wide screen the buying card carries the title above the
              price — so what is being bought and what it costs are read
              together, wherever the page has been scrolled to — and this
              block was printing the same words again under the gallery,
              three hundred pixels to the left. Two headings, one product.

              So this one is the heading BELOW `lg`, which is where the
              buying card does not render at all (it is `hidden lg:block`,
              and a phone gets the sticky bar instead). The badge goes with
              it, because a category chip floating alone under a gallery is
              not a row.

              `!isMobile` guards it because `isMobile` is the store builder's
              PHONE PREVIEW, where the frame is narrow and the viewport is
              not: `lg:hidden` there would hide the title inside a 390px
              preview that has no buying card either.
            */}
            {/*
              ON A PHONE THE TITLE MOVED INTO THE BUYING CARD, above the
              price, so the name of the thing and what it costs are one block
              instead of a heading floating above a box. This wrapper is what
              used to carry it, and at phone width it now carries nothing.
            */}
            <div className={cn("mt-6", isMobile && "hidden", !isMobile && "sm:mt-8 lg:hidden")}>
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
                    {/* The page's own text colour in the circle: the shared
                        light grey with a "?" in it was a bright disc on a dark
                        theme. Photo, else initials, else a plain person. */}
                    <AppAvatar
                      src={profile?.avatar_url}
                      name={(profile?.display_name || "").trim()}
                      alt=""
                      size={40}
                      markWhileLoading
                      style={themeTextColor ? { backgroundColor: `${themeTextColor}1f`, color: themeTextColor } : undefined}
                    />
                    <div className="min-w-0 flex items-center gap-3">
                      <p
                        className={cn(
                          "font-medium truncate text-base",
                          !themeTextColor && "text-foreground",
                        )}
                        style={{ color: themeTextColor }}
                      >
                        {personName({ name: profile?.display_name, username: profile?.username })}
                      </p>
                      {(settings.showRatingNextToSeller ?? true) && reviewsCount > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                          <Star
                            className={cn(
                              "h-4 w-4",
                              themeTextColor ? "fill-current" : "fill-current text-black"
                            )}
                            style={themeTextColor ? { color: themeTextColor } : undefined}
                          />
                          <span
                            className={cn("text-sm", !themeMutedColor && "text-muted-foreground")}
                            style={{ color: themeMutedColor }}
                          >
                            {reviewsAverage > 0 ? reviewsAverage.toFixed(1) : "5.0"}
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
                    {/* The name of the thing, then what it costs. */}
                    {isMobile && (
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <h1
                          className={cn("flex-1 min-w-0 break-words text-xl font-semibold", !priceContainerText && "text-foreground")}
                          style={{ color: priceContainerText }}
                        >
                          {productTitle}
                        </h1>
                      </div>
                    )}

                    {/* Price display - only show static price if no variants */}
                    {variants.length === 0 && (
                      /*
                        ONE ROW, NOT TWO. `flex-wrap` put the old price and the
                        discount badge on a line of their own under the price,
                        which reads as a second fact rather than as the same
                        one. `min-w-0` on the price is what lets the row shrink
                        instead of wrapping when the numbers are long.
                      */
                      <div className="mb-4 flex items-baseline gap-x-2.5">
                        <div
                          className={cn("min-w-0 shrink-0 text-xl font-bold", !priceContainerText && "text-foreground")}
                          style={{ color: priceContainerText }}
                        >
                          {productPrice === 0 ? "Free" : priced(productPrice)}
                        </div>
                        {compareAtPrice && compareAtPrice > productPrice && (
                          <div className="flex min-w-0 items-center gap-2">
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
                    )}

                    {/* Dynamic price display when variants exist */}
                    {variants.length > 0 && (
                      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <div
                          className={cn("text-xl font-bold", !priceContainerText && "text-foreground")}
                          style={{ color: priceContainerText }}
                        >
                          {currentDisplayPrice === 0 ? "Free" : priced(currentDisplayPrice)}
                        </div>
                        {compareAtPrice && compareAtPrice > currentDisplayPrice && (
                          <div className="flex items-center gap-2">
                            <span
                              className={cn("text-base line-through", !priceContainerMuted && "text-muted-foreground")}
                              style={{ color: priceContainerMuted }}
                            >
                              {formatPrice(compareAtPrice)}
                            </span>
                            <Badge variant="destructive">
                              {Math.round((1 - currentDisplayPrice / (compareAtPrice)) * 100)}% OFF
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Variant selector */}
                    {variants.length > 0 && (
                      <div className="mb-4">
                        <VariantSelector
                          variants={variants}
                          basePrice={productPrice}
                          onVariantChange={handleVariantChange}
                          themeColors={{
                            cardBackground: priceContainerBg,
                            cardTextColor: priceContainerText,
                            cardBorderColor: priceContainerBorder,
                            accentColor: settings.buyButtonColor || "#000000",
                          }}
                        />
                      </div>
                    )}

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
                        <h2
                          className={cn("font-semibold text-sm", !priceContainerText && "text-foreground")}
                          style={{ color: priceContainerText }}
                        >
                          What&apos;s included
                        </h2>
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

                    {/*
                      =====================================================================
                       NO "8 PEOPLE HAVE PURCHASED THIS"
                      =====================================================================
                      It sat under What's included on every product page, and on a shop that
                      is getting started it is a small number printed in the place a buyer
                      looks to decide. Nobody is persuaded by eight, and the ones who are
                      reading it are the ones deciding. The sales count is still on the
                      product in the app, where it is a fact for the person selling rather
                      than a line of copy for the person buying.
                    */}
                  </div>

                  {/* Mobile: Creator info OUTSIDE the price card */}
                  {settings.showCreatorInfo && creator && (
                    <div
                      className={cn("mt-4 flex items-center justify-between p-3 rounded-lg border", !cardBgColor && "border-border bg-card")}
                      style={{ backgroundColor: cardBgColor, borderColor: cardBorderColor }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <AppAvatar
                          src={profile?.avatar_url}
                          name={(profile?.display_name || "").trim()}
                          alt=""
                          size={32}
                          markWhileLoading
                          style={themeTextColor ? { backgroundColor: `${themeTextColor}1f`, color: themeTextColor } : undefined}
                        />
                        <div className="min-w-0 flex items-center gap-2 flex-1">
                          <p
                            className={cn("font-medium truncate text-sm", !themeTextColor && "text-foreground")}
                            style={{ color: themeTextColor }}
                          >
                            {personName({ name: profile?.display_name, username: profile?.username })}
                          </p>
                          {(settings.showRatingNextToSeller ?? true) && reviewsCount > 0 && (
                            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                              <Star
                                className={cn(
                                  "h-3.5 w-3.5",
                                  themeTextColor ? "fill-current" : "fill-current text-black"
                                )}
                                style={themeTextColor ? { color: themeTextColor } : undefined}
                              />
                              <span
                                className={cn("text-sm", !themeMutedColor && "text-muted-foreground")}
                                style={{ color: themeMutedColor }}
                              >
                                {reviewsAverage > 0 ? reviewsAverage.toFixed(1) : "5.0"}
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
                  {/* Price display - only show static price if no variants */}
                  {variants.length === 0 && (
                    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div
                        className={cn("text-2xl sm:text-3xl font-bold", !priceContainerText && "text-foreground")}
                        style={{ color: priceContainerText }}
                      >
                        {productPrice === 0 ? "Free" : priced(productPrice)}
                      </div>
                      {compareAtPrice && compareAtPrice > productPrice && (
                        <div className="flex items-center gap-2">
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
                  )}

                  {/* Dynamic price display when variants exist */}
                  {variants.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div
                        className={cn("text-2xl sm:text-3xl font-bold", !priceContainerText && "text-foreground")}
                        style={{ color: priceContainerText }}
                      >
                        {currentDisplayPrice === 0 ? "Free" : priced(currentDisplayPrice)}
                      </div>
                      {compareAtPrice && compareAtPrice > currentDisplayPrice && (
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("text-base line-through", !priceContainerMuted && "text-muted-foreground")}
                            style={{ color: priceContainerMuted }}
                          >
                            {formatPrice(compareAtPrice)}
                          </span>
                          <Badge variant="destructive">
                            {Math.round((1 - currentDisplayPrice / (compareAtPrice)) * 100)}% OFF
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Variant selector */}
                  {variants.length > 0 && (
                    <div className="mb-4">
                      <VariantSelector
                        variants={variants}
                        basePrice={productPrice}
                        onVariantChange={handleVariantChange}
                        themeColors={{
                          cardBackground: priceContainerBg,
                          cardTextColor: priceContainerText,
                          cardBorderColor: priceContainerBorder,
                          accentColor: settings.buyButtonColor || "#000000",
                        }}
                      />
                    </div>
                  )}

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
                      <h2
                        className={cn("font-semibold text-sm", !priceContainerText && "text-foreground")}
                        style={{ color: priceContainerText }}
                      >
                        What&apos;s included
                      </h2>
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
                {/*
                  =================================================================
                   THE TITLE, ABOVE THE PRICE
                  =================================================================
                  The card began with a number. On a desktop it follows you
                  down the page while the gallery and the description scroll
                  past, so by the time somebody reaches the button the only
                  thing naming what they are buying is far above them — a
                  price, a button and no product.

                  It is the card's heading now, so what is being bought and
                  what it costs are read together, wherever the page has been
                  scrolled to. Two lines at most: a long title is for the page
                  below, not for a buying card.
                */}
                {/*
                  THE PAGE'S HEADING, on the screens where this card exists.
                  It was an h2 under a duplicate h1 in the left column; the
                  left one is `lg:hidden` now, so this is the one a reader
                  sees and it is the one marked up as the heading. Two lines
                  at most: a long title is for the page below, not for a
                  buying card.
                */}
                <h1
                  className={cn("mb-2 text-2xl font-semibold leading-snug line-clamp-2", !priceContainerText && "text-foreground")}
                  style={{ color: priceContainerText }}
                  title={productTitle}
                >
                  {productTitle}
                </h1>

                {/* Price display - only show static price if no variants */}
                {variants.length === 0 && (
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div
                      className={cn("text-3xl font-bold", !priceContainerText && "text-foreground")}
                      style={{ color: priceContainerText }}
                    >
                      {productPrice === 0 ? "Free" : priced(productPrice)}
                    </div>
                    {compareAtPrice && compareAtPrice > productPrice && (
                      <div className="flex items-center gap-2">
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
                )}

                {/* Dynamic price display when variants exist */}
                {variants.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div
                      className={cn("text-3xl font-bold", !priceContainerText && "text-foreground")}
                      style={{ color: priceContainerText }}
                    >
                      {currentDisplayPrice === 0 ? "Free" : priced(currentDisplayPrice)}
                    </div>
                    {compareAtPrice && compareAtPrice > currentDisplayPrice && (
                      <div className="flex items-center gap-2">
                        <span
                          className={cn("text-lg line-through", !priceContainerMuted && "text-muted-foreground")}
                          style={{ color: priceContainerMuted }}
                        >
                          {formatPrice(compareAtPrice)}
                        </span>
                        <Badge variant="destructive">
                          {Math.round((1 - currentDisplayPrice / (compareAtPrice)) * 100)}% OFF
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                {/* Variant selector */}
                {variants.length > 0 && (
                  <div className="mb-4">
                    <VariantSelector
                      variants={variants}
                      basePrice={productPrice}
                      onVariantChange={handleVariantChange}
                      themeColors={{
                        cardBackground: priceContainerBg,
                        cardTextColor: priceContainerText,
                        cardBorderColor: priceContainerBorder,
                        accentColor: settings.buyButtonColor || "#000000",
                      }}
                    />
                  </div>
                )}

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
                    <h2
                      className={cn("font-semibold", !priceContainerText && "text-foreground")}
                      style={{ color: priceContainerText }}
                    >
                      What&apos;s included
                    </h2>
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
  /* In the store's own currency when the page is one store's (components/platform/price-currency). */
  const priceCurrency = usePriceCurrency()
  const formatPrice = (cents: number) => {
    return shopMoneyIn(cents, priceCurrency, { grouping: true })
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
                columns === 3 && "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
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
                    /* A card in a grid of up to three, not the window's width. */
                    sizes={isMobile ? "100vw" : columns === 3 ? "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 400px" : "(max-width: 640px) 100vw, 600px"}
                    className="object-cover transition-all duration-500 [@media(hover:hover)]:group-hover:scale-105 opacity-0"
                    /*
                      A PICTURE THAT IS ALREADY DECODED DOES NOT FADE IN.

                      This starts transparent and transitions to 1, which is
                      right the first time a photograph is fetched. Coming BACK
                      to this grid it is wrong: every card remounts, every
                      picture is already in the browser cache, and they all
                      re-run a 500ms fade over a page that was on screen a
                      moment ago. Filmed on production, that is the whole of
                      the dip and the 300ms climb on the way back.

                      `complete` is true for a cached image before the first
                      paint, so the transition is switched off for that frame
                      and the picture is simply there. Setting opacity without
                      that was not enough — the transition still ran.
                    */
                    ref={(el) => {
                      const img = el as HTMLImageElement | null
                      if (img?.complete) {
                        img.style.transition = "none"
                        img.style.opacity = "1"
                      }
                    }}
                    onLoad={(e) => {
                      ;(e.target as HTMLImageElement).style.opacity = "1"
                    }}
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
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{plainSummary(product.description, 200)}</p>
                )}
                {settings.showPrice && (
                  <div className={cn("mt-2 flex items-center gap-2", isMobile ? "text-sm" : "text-base")}>
                    <span className="font-semibold text-foreground">
                      {product.price_cents === 0 ? "Free" : perInterval(formatPrice(product.price_cents), intervalOf(product))}
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
            <SmartLink
              key={product.id}
              href={getProductHref(product)}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-md"
            >
              {content}
            </SmartLink>
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

  /* In the store's own currency when the page is one store's (components/platform/price-currency). */
  const priceCurrency = usePriceCurrency()
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  const formatPrice = (cents: number) => {
    return shopMoneyIn(cents, priceCurrency, { grouping: true })
  }

  const columns = Math.min(Number(settings.columns ?? 3), 3)
  /*
    ONE PER ROW ON A PHONE, WHICHEVER WAY THE SETTING IS SAVED.

    The default was already 1, but a page whose config carries 2 rendered two
    cards across on a phone, which at that width is two cramped cards where
    the rest of the product page shows one of everything. The owner asked for
    one, everywhere, so the stored value no longer decides this. The control
    that sets it is gone from the sections sidebar with it, rather than left
    there setting nothing.
  */
  const getGridClasses = () => {
    const mobileGridClass = "grid-cols-1"

    // If isMobile is true (store builder mobile preview), just return mobile class
    if (isMobile) {
      return mobileGridClass
    }

    // For desktop preview in store builder OR live pages, use responsive classes
    if (columns === 2) {
      return `${mobileGridClass} sm:grid-cols-2`
    }
    // columns === 3 (default)
    return `${mobileGridClass} sm:grid-cols-2 md:grid-cols-3`
  }

  if (displayProducts.length === 0) {
    if (isPreviewMode) {
      return (
        <div
          className={cn(PRODUCT_SECTION_CONTAINER, isMobile && "max-w-none px-[10px]")}
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
            style={{ color: paint(settings.colors?.textColor, "ink") || undefined }}
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
    /**
     * THE SAME COLUMN AS EVERY OTHER SECTION ON THE PAGE.
     *
     * This was `max-w-[1150px]` with its own padding scale while the product
     * page's own content is `max-w-[1200px] px-3 sm:px-4 lg:px-6`, so the
     * heading and the grid started 25px inside everything above them — which
     * reads as the section having slipped rather than as a margin.
     */
    <div
      className={cn(
        PRODUCT_SECTION_CONTAINER,
        // The store builder's phone preview is narrow while its viewport is
        // not, so CSS cannot see it and it is told.
        isPreviewMode && isMobile && "px-[18px]",
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
        style={{ color: paint(settings.colors?.textColor, "ink") || undefined }}
      >
        {settings.headline} {creatorName}
      </h2>
      {/*
        ===================================================================
         THE CARD IS THE CARD, NOT A SECOND DRAWING OF IT
        ===================================================================
        This section drew its own: a thumbnail, a truncated title and a price,
        with its own hover, its own shadow and its own colour plumbing. So the
        cards on a product page were a different size, a different type scale
        and a different shape from the ones on the creator page two clicks
        away, and every fix to one missed the other. The rating, the category
        pill and the struck-through original price simply did not exist here.

        It renders THE SAME COMPONENT the creator page renders. There is one
        product card in this product now, and the four colours the theme gives
        it arrive the same way they do there.

        `showDescription`, `showPrice` and `showCompareAtPrice` are no longer
        honoured. They were switches on a card nobody else had, and keeping
        them would mean keeping the second card to switch.
      */}
      <div className={cn("grid gap-4", getGridClasses())}>
        {displayProducts.map((product) => {
          const cardBgColor = settings.productCardColors?.backgroundColor || undefined
          const cardTextColor = settings.productCardColors?.textColor || settings.colors?.textColor || undefined
          const cardPriceColor = settings.productCardColors?.priceColor || (cardTextColor ? `${cardTextColor}99` : undefined)
          const cardBorderColor = settings.productCardColors?.borderColor || (cardTextColor ? `${cardTextColor}20` : undefined)
          const accents = cardAccents(cardBgColor, cardTextColor)
          /* Worked out from the literal colours, then painted: the light look is exactly as it was. */
          const surface = {
            backgroundColor: paint(cardBgColor, "bg"),
            borderColor: paint(cardBorderColor, "line"),
            textColor: paint(cardTextColor, "ink"),
            priceColor: paint(cardPriceColor, "ink"),
            ...(accents.mutedColor ? { mutedColor: paint(accents.mutedColor, "ink") } : {}),
            ...(accents.badgeBackgroundColor ? { badgeBackgroundColor: paint(accents.badgeBackgroundColor, "bg") } : {}),
            ...(accents.badgeTextColor ? { badgeTextColor: paint(accents.badgeTextColor, "ink") } : {}),
          }

          const card = (
            <StorefrontProductCard
              product={{
                id: product.id,
                slug: product.slug,
                href: product.href,
                title: product.title,
                thumbnail_url: product.thumbnail_url,
                price_cents: product.price_cents,
                compare_at_cents: product.compare_at_cents,
                currency: product.currency ?? null,
                type: product.type,
                price_interval: product.price_interval ?? null,
                categories: product.categories,
                reviews_count: product.reviews_count,
                reviews_average: product.reviews_average,
              }}
              creatorName={creatorName}
              surface={surface}
            />
          )

          /*
            In the BUILDER CANVAS a click selects the section rather than
            navigating. Rather than rendering a different card for the editor,
            which is how the two drift apart, the links are switched off with
            pointer-events and the click is caught on the way down.
          */
          if (isPreviewMode) {
            return (
              <div key={product.id} className="[&_a]:pointer-events-none">
                {card}
              </div>
            )
          }
          return <div key={product.id}>{card}</div>
        })}
      </div>
    </div>
  )
}
