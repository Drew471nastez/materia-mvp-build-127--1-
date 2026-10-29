import dynamic from "next/dynamic"
import { Hero } from "@/components/marketing/hero"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { StatsBar } from "@/components/marketing/stats-bar"
import { storelibLogoUrl } from "@/lib/brand/logo"
import { jsonLdScript } from "@/lib/seo/json-ld"
import type { Metadata } from "next"

/*
  THE HOME PAGE NAMES ITSELF. The title, description and share card are the
  root layout's (app/layout.tsx), which describe this page; the canonical is
  set here and only here, because a canonical in the root layout would be
  inherited by every page that sets none and point all of them at "/".
*/
export const metadata: Metadata = {
  alternates: { canonical: "https://storelib.com" },
}

// Below-the-fold sections — dynamically imported to reduce initial JS bundle.
// Hero + BentoGrid + StatsBar load eagerly (above the fold).
const ManageSection = dynamic(() => import("@/components/marketing/manage-section").then(m => ({ default: m.ManageSection })))
const SplitFeaturesSection = dynamic(() => import("@/components/marketing/split-features-section").then(m => ({ default: m.SplitFeaturesSection })))
const CarouselSection = dynamic(() => import("@/components/marketing/carousel-section").then(m => ({ default: m.CarouselSection })))
const ToolStackSection = dynamic(() => import("@/components/marketing/tool-stack-section").then(m => ({ default: m.ToolStackSection })))
const PricingSection = dynamic(() => import("@/components/marketing/pricing-section").then(m => ({ default: m.PricingSection })))
const FeaturesBadgesSection = dynamic(() => import("@/components/marketing/features-badges-section").then(m => ({ default: m.FeaturesBadgesSection })))
const FaqSection = dynamic(() => import("@/components/marketing/faq-section").then(m => ({ default: m.FaqSection })))
const CtaSection = dynamic(() => import("@/components/marketing/cta-section").then(m => ({ default: m.CtaSection })))
const ProductMarquee = dynamic(() => import("@/components/marketing/product-marquee").then(m => ({ default: m.ProductMarquee })))

export default function StorelibLanding() {
  return (
    <div className="bg-white overflow-x-hidden">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Storelib",
            "url": "https://storelib.com",
            "logo": storelibLogoUrl(),
            "sameAs": [],
            "description": "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience."
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Storelib",
            "url": "https://storelib.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://storelib.com/explore?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }),
        }}
      />

      {/* HERO SECTION */}
      <Hero />

      {/* BENTO GRID */}
      <BentoGrid />

      {/* STATS BAR */}
      <StatsBar />

      {/* MANAGE YOUR BUSINESS */}
      <ManageSection />

      {/* PRODUCT CATEGORIES MARQUEE */}
      <ProductMarquee />

      {/* SPLIT FEATURE ROWS */}
      <SplitFeaturesSection />

      {/* CAROUSEL / ONEPAGE TESTIMONIALS */}
      {/* <CarouselSection /> */}

      {/* TOOL STACK COMPARISON */}
      <ToolStackSection />

      {/* PRICING */}
      <PricingSection />

      {/* FEATURE BADGES */}
      <FeaturesBadgesSection />

      {/* FAQ */}
      <FaqSection />

      {/* CTA */}
      <CtaSection />
    </div>
  )
}
