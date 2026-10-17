// ============================================================
// Storelib Theme Engine — Section registry
// Stage 2 of the Shopify-style theme refactor: the big
// SectionRenderer.tsx dispatcher used to define every section
// component inline. Now every component lives in its own file
// under ./renderers/*. This module is just the lookup table
// that maps `section.type` → component.
//
// Adding a new section is a 2-file change:
//   1. Create ./renderers/<YourSection>Section.tsx
//   2. Register it in the map below.
//
// Keeping the registry as data (not a long if/else chain or
// a switch statement) is what makes Stage 3 (uploadable
// .storelib-theme packages) straightforward: a packaged theme
// can ship its own registry.json and the renderer can use the
// union of the built-in registry and the packaged one without
// any code changes here.
// ============================================================

import type { ComponentType } from "react"
import type { SectionProps } from "./_shared"
import { lazySection } from "./lazy-section"
export { preloadSectionRenderers } from "./lazy-section"

// ── Built-in section renderers (one import per section type) ──
import { HeaderSection } from "./renderers/HeaderSection"
import { FooterSection } from "./renderers/FooterSection"
import { ProductSection } from "./renderers/ProductSection"
// The hero renders from themes/default/sections/hero.storelib through the
// theme engine. ./renderers/HeroSection.tsx stays as the reference
// scripts/check-storelib-hero.mjs measures the engine's output against, and
// leaves with the next section that moves.
import { StorelibSection } from "./StorelibSection"
/*
  THE NAMES, NOT THE FILES. This imported STORELIB_SECTION_TYPES from
  lib/website-builder/storelib-schemas, which reads every section's schema
  when it loads: every visitor of every published website downloaded the
  theme's sources, the schema parser, its validator and postcss (1.3MB, 288KB
  gzipped, in the production build's site chunk) and parsed fifty-three
  schemas before the page could answer a tap. The generated list is the same
  names (tests/storelib-theme.test.ts) and nothing else.
*/
import { DEFAULT_STORELIB_SECTION_TYPES as STORELIB_SECTION_TYPES } from "@/themes/default/section-types.generated"

// Newly-built (Stage 2 finishers): the 22 sections whose schemas
// shipped earlier but lacked a renderer. Each now has a compact,
// production-ready renderer under ./renderers/*.

/*
  ═══════════════════════════════════════════════════════════════════════════
   ONLY THE SECTIONS A PAGE DRAWS ARE DOWNLOADED
  ═══════════════════════════════════════════════════════════════════════════
  Every one of the renderers below was in the script every visitor of every
  published website downloaded, whichever sections the page had: 216KB of
  the 626KB site bundle (minified, before gzip; measured by bundling the
  site's client entry with esbuild), for sections most new sites never use
  because Storelib's own theme draws its sections from .storelib files.

  The header, the footer and the product section are on nearly every page and
  stay in the bundle. The rest are fetched when a page draws one
  (./lazy-section.tsx): the server still draws them in full, so nothing is
  missing from the page or from search, and the browser makes them
  interactive once their file arrives. A link followed on the site fetches
  them ahead (preloadSectionRenderers), so the next page never waits.
*/
const RichTextSection = lazySection(() => import("./renderers/RichTextSection").then((m) => m.RichTextSection))
const ImageBannerSection = lazySection(() => import("./renderers/ImageBannerSection").then((m) => m.ImageBannerSection))
const ImageSection = lazySection(() => import("./renderers/ImageSection").then((m) => m.ImageSection))
const SlideshowSection = lazySection(() => import("./renderers/SlideshowSection").then((m) => m.SlideshowSection))
const SplitContentSection = lazySection(() => import("./renderers/SplitContentSection").then((m) => m.SplitContentSection))
const ProductListSection = lazySection(() => import("./renderers/ProductListSection").then((m) => m.ProductListSection))
const TestimonialsSection = lazySection(() => import("./renderers/TestimonialsSection").then((m) => m.TestimonialsSection))
const FaqSection = lazySection(() => import("./renderers/FaqSection").then((m) => m.FaqSection))
const CtaSection = lazySection(() => import("./renderers/CtaSection").then((m) => m.CtaSection))
const StatsSection = lazySection(() => import("./renderers/StatsSection").then((m) => m.StatsSection))
const FeatureGridSection = lazySection(() => import("./renderers/FeatureGridSection").then((m) => m.FeatureGridSection))
const PricingSection = lazySection(() => import("./renderers/PricingSection").then((m) => m.PricingSection))
const LogoBarSection = lazySection(() => import("./renderers/LogoBarSection").then((m) => m.LogoBarSection))
const GallerySection = lazySection(() => import("./renderers/GallerySection").then((m) => m.GallerySection))
const ScrollingTextSection = lazySection(() => import("./renderers/ScrollingTextSection").then((m) => m.ScrollingTextSection))
const CounterSection = lazySection(() => import("./renderers/CounterSection").then((m) => m.CounterSection))
const ImageComparisonSection = lazySection(() => import("./renderers/ImageComparisonSection").then((m) => m.ImageComparisonSection))
const CollectionListSection = lazySection(() => import("./renderers/CollectionListSection").then((m) => m.CollectionListSection))
const IconBoxSection = lazySection(() => import("./renderers/IconBoxSection").then((m) => m.IconBoxSection))
const PromotionBannerSection = lazySection(() => import("./renderers/PromotionBannerSection").then((m) => m.PromotionBannerSection))
const BannerPackerySection = lazySection(() => import("./renderers/BannerPackerySection").then((m) => m.BannerPackerySection))
const ProductsCarouselSection = lazySection(() => import("./renderers/ProductsCarouselSection").then((m) => m.ProductsCarouselSection))
const BrandLogoSection = lazySection(() => import("./renderers/BrandLogoSection").then((m) => m.BrandLogoSection))
const CountdownTimerSection = lazySection(() => import("./renderers/CountdownTimerSection").then((m) => m.CountdownTimerSection))
const AnnouncementBannerSection = lazySection(() => import("./renderers/AnnouncementBannerSection").then((m) => m.AnnouncementBannerSection))
const StickyBarSection = lazySection(() => import("./renderers/StickyBarSection").then((m) => m.StickyBarSection))
const CustomHtmlSection = lazySection(() => import("./renderers/CustomHtmlSection").then((m) => m.CustomHtmlSection))
const SocialProofBarSection = lazySection(() => import("./renderers/SocialProofBarSection").then((m) => m.SocialProofBarSection))
const TrustBadgesSection = lazySection(() => import("./renderers/TrustBadgesSection").then((m) => m.TrustBadgesSection))
const MapEmbedSection = lazySection(() => import("./renderers/MapEmbedSection").then((m) => m.MapEmbedSection))
const VideoEmbedSection = lazySection(() => import("./renderers/VideoEmbedSection").then((m) => m.VideoEmbedSection))
const NewsletterSection = lazySection(() => import("./renderers/NewsletterSection").then((m) => m.NewsletterSection))
const VideoHeroSection = lazySection(() => import("./renderers/VideoHeroSection").then((m) => m.VideoHeroSection))
const ProcessStepsSection = lazySection(() => import("./renderers/ProcessStepsSection").then((m) => m.ProcessStepsSection))
const TeamMembersSection = lazySection(() => import("./renderers/TeamMembersSection").then((m) => m.TeamMembersSection))
const PressMentionsSection = lazySection(() => import("./renderers/PressMentionsSection").then((m) => m.PressMentionsSection))
const TimelineSection = lazySection(() => import("./renderers/TimelineSection").then((m) => m.TimelineSection))
const TabsContentSection = lazySection(() => import("./renderers/TabsContentSection").then((m) => m.TabsContentSection))
const ComparisonTableSection = lazySection(() => import("./renderers/ComparisonTableSection").then((m) => m.ComparisonTableSection))
const ContactFormSection = lazySection(() => import("./renderers/ContactFormSection").then((m) => m.ContactFormSection))
const EbookShowcaseSection = lazySection(() => import("./renderers/EbookShowcaseSection").then((m) => m.EbookShowcaseSection))
const AuthorBioSection = lazySection(() => import("./renderers/AuthorBioSection").then((m) => m.AuthorBioSection))
const ChapterPreviewSection = lazySection(() => import("./renderers/ChapterPreviewSection").then((m) => m.ChapterPreviewSection))
const LookbookSection = lazySection(() => import("./renderers/LookbookSection").then((m) => m.LookbookSection))
const SizeGuideSection = lazySection(() => import("./renderers/SizeGuideSection").then((m) => m.SizeGuideSection))
const CollectionBannerSection = lazySection(() => import("./renderers/CollectionBannerSection").then((m) => m.CollectionBannerSection))

// ── Registry ──────────────────────────────────────────────────
// Keys MUST match the `type` field in each section's schema.
// These are the sections still described by a JSON schema; the ones that
// live in a .storelib file are derived below, from the files themselves.
const BUILT_IN_COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  header: HeaderSection,
  rich_text: RichTextSection,
  image_banner: ImageBannerSection,
  split_content: SplitContentSection,
  image_section: ImageSection,
  slideshow: SlideshowSection,
  product: ProductSection,
  product_list: ProductListSection,
  faq: FaqSection,
  cta: CtaSection,
  stats: StatsSection,
  feature_grid: FeatureGridSection,
  pricing: PricingSection,
  logo_bar: LogoBarSection,
  gallery: GallerySection,
  footer: FooterSection,
  // Ported from Shopify-style themes
  scrolling_text: ScrollingTextSection,
  counter: CounterSection,
  image_comparison: ImageComparisonSection,
  collection_list: CollectionListSection,
  icon_box: IconBoxSection,
  promotion_banner: PromotionBannerSection,
  banner_packery: BannerPackerySection,
  products_carousel: ProductsCarouselSection,
  brand_logo: BrandLogoSection,
  countdown_timer: CountdownTimerSection,
  // Stage-2 finishers
  announcement_banner: AnnouncementBannerSection,
  sticky_bar: StickyBarSection,
  custom_html: CustomHtmlSection,
  social_proof_bar: SocialProofBarSection,
  trust_badges: TrustBadgesSection,
  map_embed: MapEmbedSection,
  video_embed: VideoEmbedSection,
  newsletter: NewsletterSection,
  video_hero: VideoHeroSection,
  process_steps: ProcessStepsSection,
  team_members: TeamMembersSection,
  press_mentions: PressMentionsSection,
  timeline: TimelineSection,
  tabs_content: TabsContentSection,
  comparison_table: ComparisonTableSection,
  contact_form: ContactFormSection,
  ebook_showcase: EbookShowcaseSection,
  author_bio: AuthorBioSection,
  chapter_preview: ChapterPreviewSection,
  lookbook: LookbookSection,
  size_guide: SizeGuideSection,
  collection_banner: CollectionBannerSection,
}
/**
 * EVERY SECTION THAT LIVES IN A .storelib FILE renders through one
 * component, and registers itself by existing. Adding a section to the
 * theme is adding its file; there is no second place to remember, which is
 * what the fifty hand-written entries above were.
 *
 * A `.storelib` wins where a type has both, because the file is the section.
 */
const STORELIB_COMPONENTS: Record<string, ComponentType<SectionProps>> = Object.fromEntries(
  STORELIB_SECTION_TYPES.map((type) => [type, StorelibSection]),
)

export const SECTION_COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  ...BUILT_IN_COMPONENTS,
  ...STORELIB_COMPONENTS,
}

