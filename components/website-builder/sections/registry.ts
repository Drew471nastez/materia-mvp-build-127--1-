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
import { RichTextSection } from "./renderers/RichTextSection"
import { ImageBannerSection } from "./renderers/ImageBannerSection"
import { ImageSection } from "./renderers/ImageSection"
import { SlideshowSection } from "./renderers/SlideshowSection"
import { SplitContentSection } from "./renderers/SplitContentSection"
import { ProductListSection } from "./renderers/ProductListSection"
import { TestimonialsSection } from "./renderers/TestimonialsSection"
import { FaqSection } from "./renderers/FaqSection"
import { CtaSection } from "./renderers/CtaSection"
import { StatsSection } from "./renderers/StatsSection"
import { FeatureGridSection } from "./renderers/FeatureGridSection"
import { PricingSection } from "./renderers/PricingSection"
import { LogoBarSection } from "./renderers/LogoBarSection"
import { GallerySection } from "./renderers/GallerySection"
import { ScrollingTextSection } from "./renderers/ScrollingTextSection"
import { CounterSection } from "./renderers/CounterSection"
import { ImageComparisonSection } from "./renderers/ImageComparisonSection"
import { CollectionListSection } from "./renderers/CollectionListSection"
import { IconBoxSection } from "./renderers/IconBoxSection"
import { PromotionBannerSection } from "./renderers/PromotionBannerSection"
import { BannerPackerySection } from "./renderers/BannerPackerySection"
import { ProductsCarouselSection } from "./renderers/ProductsCarouselSection"
import { BrandLogoSection } from "./renderers/BrandLogoSection"
import { CountdownTimerSection } from "./renderers/CountdownTimerSection"

// Newly-built (Stage 2 finishers): the 22 sections whose schemas
// shipped earlier but lacked a renderer. Each now has a compact,
// production-ready renderer under ./renderers/*.
import { AnnouncementBannerSection } from "./renderers/AnnouncementBannerSection"
import { StickyBarSection } from "./renderers/StickyBarSection"
import { CustomHtmlSection } from "./renderers/CustomHtmlSection"
import { SocialProofBarSection } from "./renderers/SocialProofBarSection"
import { TrustBadgesSection } from "./renderers/TrustBadgesSection"
import { MapEmbedSection } from "./renderers/MapEmbedSection"
import { VideoEmbedSection } from "./renderers/VideoEmbedSection"
import { NewsletterSection } from "./renderers/NewsletterSection"
import { VideoHeroSection } from "./renderers/VideoHeroSection"
import { ProcessStepsSection } from "./renderers/ProcessStepsSection"
import { TeamMembersSection } from "./renderers/TeamMembersSection"
import { PressMentionsSection } from "./renderers/PressMentionsSection"
import { TimelineSection } from "./renderers/TimelineSection"
import { TabsContentSection } from "./renderers/TabsContentSection"
import { ComparisonTableSection } from "./renderers/ComparisonTableSection"
import { ContactFormSection } from "./renderers/ContactFormSection"
import { EbookShowcaseSection } from "./renderers/EbookShowcaseSection"
import { AuthorBioSection } from "./renderers/AuthorBioSection"
import { ChapterPreviewSection } from "./renderers/ChapterPreviewSection"
import { LookbookSection } from "./renderers/LookbookSection"
import { SizeGuideSection } from "./renderers/SizeGuideSection"
import { CollectionBannerSection } from "./renderers/CollectionBannerSection"

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

