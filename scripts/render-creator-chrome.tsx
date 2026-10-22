/**
 * Renders the four parts of a creator page that are NOT sections — the
 * profile header, the tab strip, a product card and the footer — once for
 * each colour scheme, so a browser can say what colour each one actually
 * came out. Bundled by scripts/check-creator-chrome.mjs.
 *
 * The components are the real ones. A probe that redraws them would measure
 * the probe.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { ShopHeaderRenderer } from "@/components/store-builder/section-renderer"
import { StorefrontTabs, EmptyTabPanel } from "@/components/storefront/storefront-tabs"
import { StorefrontProductCard } from "@/components/storefront/storefront-product-card"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { resolveStorefrontChrome, cardAccents } from "@/lib/store-builder/storefront-chrome"
import { productPageTone } from "@/lib/store-builder/product-page-tone"
import { Badge } from "@/components/ui/badge"
import { RefundPolicyDisplay } from "@/components/product/refund-policy-display"
import { Star } from "lucide-react"
import { themePresets, defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { OFFERED_SCHEMES } from "@/lib/store-builder/scheme-preview"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"

const OUT = process.env.OUT_DIR!

/** Every scheme the picker offers (eight since sage, harbor and clay; nine since graphite). */
const SCHEMES = OFFERED_SCHEMES

/**
 * WHAT A REAL STORED CONFIG LOOKS LIKE, which is the whole point.
 *
 * The builder writes the full settings object out on every save, so almost
 * every account carries an explicit white background and an explicit black
 * text colour that nobody chose. Feeding the probe a clean config would test
 * a case that does not exist in the database.
 */
const storedHeader = {
  ...defaultShopHeaderSettings,
  bio: "Building cool stuff on the internet",
  showBio: true,
  showStats: true,
  showFollowers: true,
  colors: { backgroundColor: "#ffffff", textColor: "#000000" },
} as unknown as ShopHeaderSettings

const profile = {
  id: "p1",
  display_name: "AndrewRullz",
  username: "andrewrullz",
  avatar_url: null,
  created_at: "2026-01-01",
}

const product = {
  id: "x1",
  slug: "mens-tee",
  title: "Men's heavyweight tee",
  thumbnail_url: null,
  price_cents: 6440,
  compare_at_cents: 11500,
  type: "digital",
  categories: [{ name: "Digital" }],
  reviews_count: 4,
  reviews_average: 4.8,
}

const parts = SCHEMES.map((preset) => {
  const chrome = resolveStorefrontChrome(preset, {
    pageBackground: undefined,
    text: storedHeader.colors?.textColor,
    bar: { backgroundColor: "#ffffff", textColor: "#000000", buttonColor: "#2563eb", buttonTextColor: "#ffffff" },
  })
  const theme = themePresets[preset]
  const cardSurface = {
    backgroundColor: theme.productCard.backgroundColor,
    borderColor: theme.productCard.borderColor,
    textColor: theme.productCard.textColor,
    priceColor: theme.productCard.priceColor,
    ...cardAccents(theme.productCard.backgroundColor, theme.productCard.textColor),
  }

  const body = (
    <div
      data-scheme={preset}
      style={{ background: chrome.pageBackground, color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}
    >
      <div data-region="header">
        <ShopHeaderRenderer
          settings={storedHeader}
          profile={profile as never}
          creator={{ id: "c1", bio: "Building cool stuff on the internet" } as never}
          products={[]}
          productCount={0}
          surface={{ textColor: chrome.text, mutedColor: chrome.muted }}
        />
      </div>

      <div data-region="tabs">
        <StorefrontTabs
          tabs={[
            { id: "home", label: "Home", panel: <div /> },
            { id: "products", label: "Products", panel: <div /> },
            { id: "communities", label: "Communities", panel: <div /> },
          ]}
          surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }}
        />
      </div>

      {/*
        THE ONE THING WITH NO `surface` PROP ON IT, on purpose. Everything
        else here is handed its colours explicitly; this is painted entirely
        from `text-foreground`, `text-muted-foreground` and `border-border`,
        so it is the part that only comes out right if rebinding those
        variables on the page root actually reaches a Tailwind utility. That
        is a claim about the stylesheet, and the only way to check a claim
        about a stylesheet is to load the stylesheet.
      */}
      <div data-region="empty">
        <EmptyTabPanel title="No communities yet" detail="This creator hasn't opened any yet." />
      </div>

      <div data-region="card" style={{ padding: 16, maxWidth: 380 }}>
        <StorefrontProductCard product={product as never} creatorName="AndrewRullz" creatorUsername="andrewrullz" surface={cardSurface} />
      </div>

      <div data-region="footer">
        <SellerFooter
          surface={{
            backgroundColor: chrome.footerBackground,
            textColor: chrome.footerText,
            mutedColor: chrome.footerMuted,
            borderColor: chrome.border,
          }}
        />
      </div>
    </div>
  )

  /*
    THE PRODUCT PAGE THE CREATOR PAGE OPENS ONTO, on the same scheme. The
    parts of app/(marketing)/p/[slug]/page.tsx a scheme paints, with the same
    markup and the colours from the same function the page calls
    (productPageTone). The stored page colour is the builder's untouched
    white, which is what a scheme picked in Edit profile leaves behind.
  */
  const tone = productPageTone({ globalSettings: { themePreset: preset }, globalColors: { backgroundColor: "#ffffff" }, headerSettings: {} })
  const c = tone.themeColors
  const productPage = (
    <div
      data-product-page={preset}
      data-dark={tone.isDarkTheme ? "true" : "false"}
      className="w-full"
      style={{ background: tone.pageBackgroundColor || "var(--background)", color: c.textColor || "var(--foreground)", padding: 16 }}
    >
      <div className="flex items-start gap-2">
        <h1 className="text-2xl sm:text-3xl font-semibold break-words flex-1 min-w-0" style={{ color: c.textColor || "var(--foreground)" }}>
          Men&apos;s heavyweight tee
        </h1>
        <Badge data-part="badge" variant="secondary" className="shrink-0 capitalize" style={tone.categoryBadgeStyle}>
          Digital
        </Badge>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <p data-part="seller" className="font-medium truncate" style={{ color: c.textColor || "var(--foreground)" }}>AndrewRullz</p>
        <Star data-part="star" className="h-4 w-4 fill-current" style={{ color: tone.ratingStarColor }} />
        <span data-part="rating" className="text-sm" style={{ color: c.cardPriceColor || "rgb(156, 163, 175)" }}>4.8</span>
      </div>
      <div
        data-part="card"
        className="mt-6 rounded-xl border p-4 shadow-sm"
        style={{ backgroundColor: c.cardBackground || "var(--card)", borderColor: c.cardBorderColor || "var(--border)", maxWidth: 380 }}
      >
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div data-part="price" className="text-2xl font-bold" style={{ color: c.cardTextColor || "var(--foreground)" }}>$64.40</div>
          <span data-part="was" className="text-base line-through" style={{ color: c.cardPriceColor || "var(--muted-foreground)" }}>$115.00</span>
        </div>
        <div data-part="refund">
          <RefundPolicyDisplay
            enabled
            policyType="30_day"
            finePrint={null}
            updatedAt={null}
            className="mt-3"
            textColor={c.cardTextColor}
            themePreset={preset}
            isDarkTheme={tone.isDarkTheme}
          />
        </div>
      </div>
      <h3 data-part="faq" className="mt-6 text-lg font-semibold" style={{ color: c.faqTextColor || "var(--foreground)" }}>
        Frequently asked
      </h3>
    </div>
  )

  return renderToStaticMarkup(body) + renderToStaticMarkup(productPage)
})

writeFileSync(join(OUT, "body.html"), parts.join("\n"))
