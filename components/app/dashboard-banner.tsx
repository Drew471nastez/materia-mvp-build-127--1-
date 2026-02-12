"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { X, ExternalLink, ChevronRight, Copy, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getStoreUrl } from "@/lib/url-helpers"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BannerContext {
  hasProducts: boolean
  productCount: number
  totalOrders: number
  totalRevenue: number // in cents
  isStripeConnected: boolean
  hasCustomDomain: boolean
  currentPlan: "free" | "growth" | "pro"
  setupComplete: boolean
  creatorHandle: string
  connectedDomain: string | null
}

interface BannerTip {
  text: string
}

interface TipsPanelContent {
  title: string
  tips: BannerTip[]
  ctaText: string
  ctaHref?: string
  ctaAction?: "copy-link"
}

interface BannerConfig {
  id: string
  label: string
  headline: string
  description: string
  primaryCTA: {
    text: string
    href?: string
    action?: "copy-link" | "open-tips"
  }
  secondaryCTA?: {
    text: string
    href?: string
    action?: "open-tips" | "dismiss"
  }
  backgroundClass: string
  tipsContent?: TipsPanelContent
  dismissDays: number
}

// ─── Banner Configurations ─────────────────────────────────────────────────────

function getBannerConfigs(ctx: BannerContext): BannerConfig[] {
  const revenueDollars = ctx.totalRevenue / 100
  const savings = revenueDollars * (0.06 - 0.03)

  const configs: BannerConfig[] = []

  // Priority 1: First Product Nudge
  if (!ctx.hasProducts) {
    configs.push({
      id: "first-product",
      label: "Get Started",
      headline: "Create your first product in under 5 minutes",
      description: "You're all set up — now add a digital product, course, or template and start earning.",
      primaryCTA: { text: "Create Product", href: "/app/products/new" },
      secondaryCTA: { text: "View Tips", action: "open-tips" },
      backgroundClass: "bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600",
      dismissDays: 3,
      tipsContent: {
        title: "Tips to create your first product",
        tips: [
          { text: "Start simple — Your first product doesn't need to be perfect. A single PDF, template, or guide is enough to get started." },
          { text: "Price it right — If you're unsure, start with a low price ($5-$15) to get your first sales and build social proof." },
          { text: "Use a compelling cover image — Products with cover images convert 2-3x better than those without." },
          { text: "Write a clear description — Tell people exactly what they'll get, who it's for, and why it's valuable." },
          { text: "Add a product preview — If possible, show a preview or sample so buyers know what to expect." },
        ],
        ctaText: "Create Product",
        ctaHref: "/app/products/new",
      },
    })
  }

  // Priority 2: First Sale Push
  if (ctx.hasProducts && ctx.totalOrders === 0) {
    configs.push({
      id: "first-sale",
      label: "Share Your Store",
      headline: "You're one step away from your first sale",
      description: "Your products are live! Share your store link on social media, in your bio, or with your audience.",
      primaryCTA: { text: "Copy Store Link", action: "copy-link" },
      secondaryCTA: { text: "View Tips", action: "open-tips" },
      backgroundClass: "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600",
      dismissDays: 2,
      tipsContent: {
        title: "Tips to get your first sale",
        tips: [
          { text: "Share on social media — Post your store link on Instagram, Twitter/X, TikTok, or wherever your audience is. Don't just post once — share it multiple times." },
          { text: "Add your link to your bio — Put your Storelib OnePage link in your Instagram bio, Twitter bio, YouTube description, etc." },
          { text: "Tell your existing audience — If you have an email list, newsletter, or community, let them know you're selling something new." },
          { text: "Offer a launch discount — Create urgency with a limited-time discount for your first customers." },
          { text: "Ask friends to share — Word of mouth is powerful. Ask 5-10 friends to share your product with their networks." },
          { text: "Create content around your product — Make a tutorial, behind-the-scenes post, or explainer that naturally leads to your product." },
        ],
        ctaText: "Copy Store Link",
        ctaAction: "copy-link",
      },
    })
  }

  // Priority 3: Stripe Setup Reminder
  if (ctx.hasProducts && !ctx.isStripeConnected) {
    configs.push({
      id: "stripe-setup",
      label: "Get Paid",
      headline: "Connect Stripe to start receiving payments",
      description: "You have products ready to sell, but you need a payment method to receive money from orders.",
      primaryCTA: { text: "Connect Stripe", href: "/app/payouts" },
      secondaryCTA: { text: "View Tips", action: "open-tips" },
      backgroundClass: "bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500",
      dismissDays: 1,
      tipsContent: {
        title: "Setting up payouts",
        tips: [
          { text: "It takes 2 minutes — Stripe setup is quick. You'll need your email, bank details, and basic business info." },
          { text: "You get paid directly — Money from sales goes straight to your bank account through Stripe. No waiting for monthly payouts." },
          { text: "Stripe is secure — Stripe handles billions of dollars in payments and is trusted by millions of businesses worldwide." },
          { text: "Your customers can pay with anything — Credit cards, Apple Pay, Google Pay, and more." },
        ],
        ctaText: "Connect Stripe",
        ctaHref: "/app/payouts",
      },
    })
  }

  // Priority 4: Upgrade Nudge
  if (ctx.currentPlan === "free" && ctx.totalRevenue > 0 && savings > 1) {
    configs.push({
      id: "upgrade-nudge",
      label: "Save on Fees",
      headline: `You've earned $${revenueDollars.toFixed(2)} so far — upgrade to keep more`,
      description: `On the Free plan, you're paying 6% per transaction. The Growth plan drops that to 3% — you'd save $${savings.toFixed(2)} on what you've earned so far.`,
      primaryCTA: { text: "See Plans", href: "/app/settings/billing" },
      secondaryCTA: { text: "Maybe Later", action: "dismiss" },
      backgroundClass: "bg-gradient-to-r from-purple-900 via-violet-900 to-slate-900",
      dismissDays: 7,
      tipsContent: {
        title: "Why upgrade?",
        tips: [
          { text: "Lower transaction fees — Free plan charges 6% per sale. Growth plan drops to 3%. Professional drops to 1.5%." },
          { text: "Custom domain — Use yourbrand.com instead of username.storelib.com. Looks more professional and builds trust." },
          { text: "Verified badge — Stand out in the Storelib discover marketplace with a verified creator badge." },
          { text: "More email captures — Free plan allows 500/month. Growth gives you 2,000. Professional gives 5,000." },
          { text: "Priority support — Get faster help when you need it." },
        ],
        ctaText: "See Plans",
        ctaHref: "/app/settings/billing",
      },
    })
  }

  // Priority 5: Custom Domain Prompt
  if (ctx.currentPlan !== "free" && !ctx.hasCustomDomain) {
    configs.push({
      id: "custom-domain",
      label: "Brand Your Store",
      headline: "Connect your own domain",
      description: "Make your store feel professional — use yourbrand.com instead of username.storelib.com",
      primaryCTA: { text: "Add Domain", href: "/app/settings?tab=domains" },
      secondaryCTA: { text: "Learn How", href: "/app/settings?tab=domains" },
      backgroundClass: "bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-500",
      dismissDays: 14,
    })
  }

  // Priority 6: Feature Spotlights (only if setup complete and no higher priority)
  if (ctx.setupComplete) {
    const spotlights: BannerConfig[] = [
      {
        id: "feature-emails",
        label: "New Feature",
        headline: "Send your first email campaign",
        description: "Reach your subscribers directly. Announce new products, share updates, or run promotions.",
        primaryCTA: { text: "Go to Emails", href: "/app/emails" },
        backgroundClass: "bg-gradient-to-r from-pink-500 via-rose-500 to-red-400",
        dismissDays: 7,
      },
      {
        id: "feature-store-builder",
        label: "Customize",
        headline: "Make your store uniquely yours",
        description: "Use the Store Builder to add sections, customize your layout, and create a store that matches your brand.",
        primaryCTA: { text: "Open Store Builder", href: "/app/store-builder" },
        backgroundClass: "bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-500",
        dismissDays: 7,
      },
      {
        id: "feature-analytics",
        label: "Insights",
        headline: "Understand your audience",
        description: "See where your visitors come from, which products perform best, and how to improve your conversion rate.",
        primaryCTA: { text: "View Analytics", href: "/app/analytics" },
        backgroundClass: "bg-gradient-to-r from-emerald-500 via-green-500 to-teal-400",
        dismissDays: 7,
      },
      {
        id: "feature-onepage",
        label: "Optimize",
        headline: "Your OnePage is your storefront — make it count",
        description: "Add links, products, and content to your link-in-bio page. First impressions matter.",
        primaryCTA: { text: "Edit OnePage", href: "/app/onepage" },
        backgroundClass: "bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-400",
        dismissDays: 7,
      },
    ]
    configs.push(...spotlights)
  }

  // Priority 7: Seasonal
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  if (month === 2 && day >= 1 && day <= 14) {
    configs.push({
      id: "seasonal-valentines",
      label: "Valentine's Day",
      headline: "Valentine's Day is coming — launch a limited product",
      description: "Create a special Valentine's product or bundle and tap into the season.",
      primaryCTA: { text: "Create Product", href: "/app/products/new" },
      backgroundClass: "bg-gradient-to-r from-pink-600 via-rose-500 to-red-500",
      dismissDays: 14,
    })
  }

  if (month === 11 && day >= 15 && day <= 30) {
    configs.push({
      id: "seasonal-blackfriday",
      label: "Black Friday",
      headline: "Black Friday prep — set up a sale before the rush",
      description: "Get your products and promotions ready for the biggest shopping event of the year.",
      primaryCTA: { text: "Create Product", href: "/app/products/new" },
      backgroundClass: "bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700",
      dismissDays: 15,
    })
  }

  if ((month === 12 && day >= 26) || (month === 1 && day <= 7)) {
    configs.push({
      id: "seasonal-newyear",
      label: "New Year",
      headline: "New year, new products — start 2026 strong",
      description: "Set your goals and launch something new to kick off the year right.",
      primaryCTA: { text: "Create Product", href: "/app/products/new" },
      backgroundClass: "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400",
      dismissDays: 12,
    })
  }

  // Priority 8: Default Editions Banner (always present as fallback)
  configs.push({
    id: "editions-default",
    label: "Storelib Editions | Winter '26",
    headline: "The commerce renaissance is here.",
    description: "Explore what's new — features, tools, and updates to help you grow.",
    primaryCTA: { text: "Explore updates", href: "/editions" },
    secondaryCTA: { text: "/editions", href: "/editions" },
    backgroundClass: "bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900",
    dismissDays: 0, // Never expires — always fallback
  })

  return configs
}

// ─── Dismiss Logic ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "storelib_dismissed_banners"
const SPOTLIGHT_KEY = "storelib_last_spotlight_index"

function getDismissedBanners(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

function dismissBanner(bannerId: string) {
  const dismissed = getDismissedBanners()
  dismissed[bannerId] = new Date().toISOString()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
}

function isBannerDismissed(bannerId: string, dismissDays: number): boolean {
  if (dismissDays === 0) return false // Never dismissed (fallback banners)
  const dismissed = getDismissedBanners()
  if (!dismissed[bannerId]) return false
  const dismissedAt = new Date(dismissed[bannerId])
  const now = new Date()
  const daysSince = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince < dismissDays
}

function getLastSpotlightIndex(): number {
  if (typeof window === "undefined") return 0
  try {
    return parseInt(localStorage.getItem(SPOTLIGHT_KEY) || "0", 10)
  } catch {
    return 0
  }
}

function setLastSpotlightIndex(idx: number) {
  localStorage.setItem(SPOTLIGHT_KEY, String(idx))
}

// ─── Select Active Banner ──────────────────────────────────────────────────────

function selectBanner(ctx: BannerContext): BannerConfig | null {
  const allConfigs = getBannerConfigs(ctx)
  const spotlightIds = ["feature-emails", "feature-store-builder", "feature-analytics", "feature-onepage"]

  // For feature spotlights, rotate through them
  let spotlightIndex = getLastSpotlightIndex()

  for (const banner of allConfigs) {
    if (isBannerDismissed(banner.id, banner.dismissDays)) continue

    // Handle spotlight rotation
    if (spotlightIds.includes(banner.id)) {
      const currentSpotlightId = spotlightIds[spotlightIndex % spotlightIds.length]
      if (banner.id !== currentSpotlightId) continue
      // Found the right spotlight to show
      setLastSpotlightIndex((spotlightIndex + 1) % spotlightIds.length)
    }

    return banner
  }

  // If everything is dismissed, show the fallback
  return allConfigs[allConfigs.length - 1]
}

// ─── Tips Panel Component ──────────────────────────────────────────────────────

function TipsPanel({
  content,
  isOpen,
  onClose,
  onCopyLink,
}: {
  content: TipsPanelContent
  isOpen: boolean
  onClose: () => void
  onCopyLink?: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white z-[61] shadow-2xl transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{content.title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Tips List */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {content.tips.map((tip, i) => {
                const boldEnd = tip.text.indexOf(" — ")
                const hasBold = boldEnd > -1
                return (
                  <div key={i} className="flex gap-3.5">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center mt-0.5">
                      <span className="text-[11px] font-semibold text-purple-600">{i + 1}</span>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-gray-600">
                      {hasBold ? (
                        <>
                          <span className="font-semibold text-[#1a1a2e]">{tip.text.slice(0, boldEnd)}</span>
                          {tip.text.slice(boldEnd)}
                        </>
                      ) : (
                        tip.text
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="px-6 py-5 border-t border-gray-100">
            {content.ctaAction === "copy-link" ? (
              <button
                onClick={() => { onCopyLink?.(); onClose() }}
                className="w-full py-2.5 px-4 bg-[#1a1a2e] text-white text-[13.5px] font-semibold rounded-xl hover:bg-[#2a2a3e] transition-colors flex items-center justify-center gap-2"
              >
                <Copy className="h-3.5 w-3.5" />
                {content.ctaText}
              </button>
            ) : content.ctaHref ? (
              <Link
                href={content.ctaHref}
                className="w-full py-2.5 px-4 bg-[#1a1a2e] text-white text-[13.5px] font-semibold rounded-xl hover:bg-[#2a2a3e] transition-colors flex items-center justify-center gap-2"
              >
                {content.ctaText}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Banner Component ─────────────────────────────────────────────────────

export function DashboardDynamicBanner({ context }: { context: BannerContext }) {
  const [banner, setBanner] = useState<BannerConfig | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isTipsOpen, setIsTipsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // Select banner on mount (client-side only due to localStorage)
  useEffect(() => {
    const selected = selectBanner(context)
    setBanner(selected)
    // Small delay for entrance animation
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [context])

  const handleDismiss = useCallback(() => {
    if (!banner) return
    setIsVisible(false)
    setTimeout(() => {
      dismissBanner(banner.id)
      // Select next banner
      const next = selectBanner(context)
      setBanner(next)
      setTimeout(() => setIsVisible(true), 50)
    }, 300)
  }, [banner, context])

  const handleCopyLink = useCallback(() => {
    const storeUrl = context.connectedDomain
      ? `https://${context.connectedDomain}`
      : context.creatorHandle
        ? getStoreUrl(context.creatorHandle)
        : ""
    if (!storeUrl) return
    navigator.clipboard.writeText(storeUrl).then(() => {
      setCopied(true)
      toast({ title: "Store link copied!", description: storeUrl })
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      toast({ title: "Copy failed", variant: "destructive" })
    })
  }, [context, toast])

  const handlePrimaryCTA = useCallback(() => {
    if (!banner?.primaryCTA) return
    if (banner.primaryCTA.action === "copy-link") {
      handleCopyLink()
    } else if (banner.primaryCTA.action === "open-tips" && banner.tipsContent) {
      setIsTipsOpen(true)
    }
    // href CTAs are handled by Link component
  }, [banner, handleCopyLink])

  const handleSecondaryCTA = useCallback(() => {
    if (!banner?.secondaryCTA) return
    if (banner.secondaryCTA.action === "open-tips" && banner.tipsContent) {
      setIsTipsOpen(true)
    } else if (banner.secondaryCTA.action === "dismiss") {
      handleDismiss()
    }
  }, [banner, handleDismiss])

  if (!banner) return null

  const isEditionsDefault = banner.id === "editions-default"

  return (
    <>
      <div className="mb-8">
        <div
          className={`relative overflow-hidden rounded-2xl transition-all duration-300 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        >
          {/* Background */}
          {isEditionsDefault ? (
            <>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
            </>
          ) : (
            <div className={`absolute inset-0 ${banner.backgroundClass}`} />
          )}

          {/* Content */}
          <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
            {/* Dismiss button */}
            {banner.dismissDays > 0 && (
              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors z-20"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5 text-white/70" />
              </button>
            )}

            {/* Label */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] sm:text-[15px] font-semibold text-white">{banner.label}</span>
            </div>

            {/* Headline */}
            <p className="text-[16px] sm:text-[20px] font-medium text-white mb-1 pr-8">{banner.headline}</p>

            {/* Description */}
            <p className="text-[12px] sm:text-[14px] text-white/75 mb-3 sm:mb-4 max-w-2xl">{banner.description}</p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Primary CTA */}
              {banner.primaryCTA.href && !banner.primaryCTA.action ? (
                <Link
                  href={banner.primaryCTA.href}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                >
                  {banner.primaryCTA.text}
                </Link>
              ) : (
                <button
                  onClick={handlePrimaryCTA}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                >
                  {banner.primaryCTA.action === "copy-link" && (
                    copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />
                  )}
                  {banner.primaryCTA.action === "copy-link" && copied ? "Copied!" : banner.primaryCTA.text}
                </button>
              )}

              {/* Secondary CTA */}
              {banner.secondaryCTA && (
                banner.secondaryCTA.href && !banner.secondaryCTA.action ? (
                  <Link
                    href={banner.secondaryCTA.href}
                    className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {banner.secondaryCTA.text}
                  </Link>
                ) : (
                  <button
                    onClick={handleSecondaryCTA}
                    className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors"
                  >
                    {banner.secondaryCTA.text}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tips Panel */}
      {banner.tipsContent && (
        <TipsPanel
          content={banner.tipsContent}
          isOpen={isTipsOpen}
          onClose={() => setIsTipsOpen(false)}
          onCopyLink={handleCopyLink}
        />
      )}
    </>
  )
}
