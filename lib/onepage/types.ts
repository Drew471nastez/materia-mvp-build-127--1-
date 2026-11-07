// OnePage Types
// Location: lib/onepage/types.ts

import type { AppBlockData } from "./app-blocks"
import type { FollowersBlockData, LeadMagnetBlockData, PromoCodeBlockData, SocialPostsBlockData, StorelibShelfBlockData } from "./storelib-blocks"

export type OnePageBlockType =
  | "form_quiz"
  | "link_button"
  | "product"
  | "social_row"
  | "text"
  | "image"
  | "divider"
  | "email_capture"
  | "header"
  | "group"
  | "pdf_document"
  | "food_menu"
  | "calendly"
  | "heading"
  | "faq"
  | "countdown"
  | "map"
  | "video"
  | "course"
  | "music"
  | "testimonials"
  | "contact_form"
  | "embed"
  | "storelib_shelf"
  | "lead_magnet"
  | "social_posts"
  | "followers"
  | "promo_code"
  /* Round AL: every service with no block of its own, one engine (./app-blocks). */
  | "app"

export interface OnePageTheme {
  template_id: string
  background_type: "solid" | "gradient" | "image" | "video"
  background_color: string
  background_gradient?: string | null
  background_image_url?: string | null
  text_color: string
  secondary_text_color?: string
  /* "soft" is a tint of button_color. How each is drawn: lib/onepage/button-style.ts. */
  button_style: "filled" | "outline" | "glass" | "soft"
  button_color: string
  button_text_color: string
  /* 0 reads as Square, 100 or more as Pill, anything between as Rounded. */
  button_border_radius: number
  button_border_width: number
  button_border_color: string
  button_hover_color?: string
  button_shadow?: "none" | "subtle" | "strong" | "hard"
  button_shadow_color?: string | null
  /* "default" (or nothing) is Lift. */
  button_hover_animation?: "default" | "none" | "lift" | "fade" | "zoom" | "glow" | "fill" | "pop" | "underline" | null
  /* Round 40: the colours Fill and Pop turn a button to. Missing is the old Fill (lib/onepage/button-style). */
  button_hover_fill?: string | null
  button_hover_text?: string | null
  /* Missing means what every button had before: regular, centred, icon on the left. */
  button_size?: "compact" | "regular" | "large"
  button_text_align?: "center" | "left"
  button_icon_position?: "left" | "right"
  /* Round 40 (lib/onepage/theme-layout): how the blocks are laid out, and the classic header's alignment. Missing is a list, centred. */
  block_layout?: "list" | "grid" | "cards" | "compact" | "masonry" | null
  header_align?: "center" | "left" | null
  /* Round 42 (lib/onepage/theme-layout): how product blocks are shown, and a wide cover picture over the classic header. Missing is each block's own layout, and no cover. */
  product_layout?: "own" | "grid" | "rows" | null
  cover_image_url?: string | null
  cover_crop?: { x: number; y: number; zoom: number } | null
  cover_previous_header_layout?: "classic" | "hero"
  cover_profile_layout?: boolean
  font_family: string
  // Title customization
  title_font?: string | null
  title_color?: string | null
  /* Round 43 (lib/onepage/header-style): the name's and the bio's type, and the profile picture's frame. Missing draws what a page always drew. */
  title_size?: "small" | "default" | "large" | null
  title_weight?: 400 | 500 | 600 | 700 | 800 | null
  title_tracking?: "tight" | "normal" | "wide" | null
  title_case?: "none" | "upper" | null
  bio_size?: "small" | "default" | "large" | null
  bio_weight?: 400 | 500 | 600 | null
  bio_tracking?: "tight" | "normal" | "wide" | null
  bio_case?: "none" | "upper" | null
  avatar_size?: "small" | "medium" | "large" | null
  avatar_shape?: "circle" | "rounded" | "square" | null
  avatar_radius?: number | null
  avatar_border_width?: number | null
  avatar_border_color?: string | null
  card_width: "narrow" | "standard" | "wide"
  spacing: "compact" | "normal" | "comfortable"
  // New gradient properties
  gradient_direction?: number // 0-360 degrees
  gradient_color_1?: string
  gradient_color_2?: string
  gradient_animated?: boolean
  gradient_noise?: boolean
  // New image properties
  image_brightness?: number // 0-200, default 100
  image_blur?: number // 0-20, default 0
  image_noise?: boolean
  // Header layout
  header_layout?: "classic" | "hero"
  // Social icons
  social_icon_style?: "filled" | "outline" | "minimal"
  social_icon_color?: string
  /**
   * The social marks in their own brand colours ("brand") or all in the icon
   * colour ("mono"). Missing means "mono", how every page made before the
   * choice existed looks; a new page starts on "brand" (ensure-onepage).
   */
  social_icon_tone?: "brand" | "mono"
  // Animated gradient
  animated_gradient?: boolean
}

export interface OnePageSettings {
  show_branding: boolean
  seo_title?: string | null
  seo_description?: string | null
  /* The title and description a shared link shows, when not the search ones (lib/onepage/seo). */
  social_title?: string | null
  social_description?: string | null
  social_image_url?: string | null
  social_image_position_x?: number | null
  social_image_position_y?: number | null
  /* The share picture's choice, kept here only where the database has no onepages.share_image_mode column yet. */
  share_image_mode?: "profile" | "card" | "custom"
  custom_domain?: string | null
  analytics_enabled: boolean
  subscribe_enabled?: boolean
  subscribe_style?: "glass" | "white" | "black"
  share_enabled?: boolean
  share_style?: "glass" | "white" | "black"
  verified_badge_enabled?: boolean
  verified_badge_type?: "verified_creator" | "verified_brand" | "verified_business" | "official_page" | "verified_artist"
}

export interface OnePageSocialLinks {
  instagram?: string | null
  tiktok?: string | null
  youtube?: string | null
  twitter?: string | null
  spotify?: string | null
  website?: string | null
  email?: string | null
  threads?: string | null
  facebook?: string | null
  whatsapp?: string | null
  snapchat?: string | null
  discord?: string | null
  github?: string | null
  kick?: string | null
  linkedin?: string | null
  patreon?: string | null
  pinterest?: string | null
  soundcloud?: string | null
  telegram?: string | null
  twitch?: string | null
}

// Block data types
export type BlockLayoutType = 'default' | 'pro'
export type BlockAnimationType = 'none' | 'pulse' | 'bounce' | 'shake' | 'glow' | 'swipe'
export type BlockDisplayMode = 'cover' | 'contain' | 'full'
export type YouTubeMode = 'embed_video' | 'open_profile' | 'open_latest' | 'embed_latest'
export type SpotifyMode = 'audio_preview' | 'go_to_url' | 'show_streaming'
export type AppleMusicMode = 'audio_preview' | 'go_to_url' | 'show_streaming'
export type SoundCloudMode = 'audio_preview' | 'go_to_url'

// Email capture button text presets
export type EmailCaptureButtonPreset = 'subscribe' | 'join' | 'get_access' | 'download' | 'sign_up' | 'unlock' | 'custom'

// Email capture layout types
export type EmailCaptureLayoutType = 'default' | 'pro' | 'cover' | 'bold' | 'minimal' | 'connect' | 'letter' | 'bar'

export interface StreamingService {
  platform: 'apple_music' | 'youtube_music' | 'soundcloud' | 'tidal' | 'deezer' | 'amazon_music' | 'spotify'
  url: string | null
  found: boolean
}

export interface FormQuizBlockData {form_id:string;title:string;inline?:boolean;presentation?:"inline"|"card"|"expandable"|"modal"}

export interface LinkButtonBlockData {
  /** The pasted address's public preview (lib/onepage/link-preview). The *_edited and image_hidden marks keep a refresh off what the creator changed. */
  link_preview?:{enabled?:boolean;url?:string;title?:string;image?:string|null;description?:string;favicon?:string|null;title_edited?:boolean;description_edited?:boolean;image_edited?:boolean;image_hidden?:boolean}

  action?: import("@/lib/forms/actions").NativeAction
  label: string
  url: string
  icon?: string | null
  thumbnail_url?: string | null
  layout_type?: BlockLayoutType
  animation_type?: BlockAnimationType
  display_mode?: BlockDisplayMode
  // YouTube-specific settings
  youtube_mode?: YouTubeMode
  youtube_channel_id?: string | null
  youtube_latest_video_id?: string | null
  // Spotify-specific settings
  spotify_mode?: SpotifyMode
  spotify_artist_id?: string | null
  spotify_preview_url?: string | null
  streaming_services?: StreamingService[]
  // Spotify metadata for display
  spotify_title?: string | null
  spotify_artist?: string | null
  spotify_type?: 'track' | 'album' | 'artist' | 'playlist' | null
  spotify_thumbnail?: string | null
  spotify_show_metadata?: boolean
  // Apple Music-specific settings
  apple_music_mode?: AppleMusicMode
  apple_music_title?: string | null
  apple_music_artist?: string | null
  apple_music_type?: 'song' | 'album' | 'artist' | 'playlist' | null
  apple_music_thumbnail?: string | null
  apple_music_show_metadata?: boolean
  apple_music_preview_url?: string | null
  apple_music_streaming_services?: StreamingService[]
  // SoundCloud-specific settings
  soundcloud_mode?: SoundCloudMode
  soundcloud_title?: string | null
  soundcloud_artist?: string | null
  soundcloud_type?: 'track' | 'playlist' | 'artist' | null
  soundcloud_thumbnail?: string | null
  soundcloud_show_metadata?: boolean
  // TikTok-specific settings
  tiktok_video_id?: string | null
  tiktok_embed_url?: string | null
  tiktok_show_embed?: boolean
  // Ask the visitor before opening (components/onepage/extra-blocks)
  sensitive?: boolean
}

/*
  How a product block is drawn (components/onepage/product-block.tsx). The first three are the old ones and keep
  their names; round 10 added a compact row, an image-left card, a text-only line with a price pill, a picture
  with the words over it, and a tile (two tiles in a row sit side by side). lib/onepage/product-block.ts.
*/
export type ProductBlockStyle = 'button' | 'callout' | 'preview' | 'row' | 'side' | 'minimal' | 'overlay' | 'tile'
/** What a tap on a product block does. Unset is what it always did: the checkout (a product that ships: its page). */
export type ProductTapAction = 'page' | 'sheet' | 'checkout'
export type ProductButtonStyle = 'default' | 'filled'
/** The main button inside a product's sheet: check out there, or go on to its full page. */
export type ProductSheetAction = 'checkout' | 'page'

export interface ProductBlockData {
  product_id: string
  show_price: boolean
  show_description: boolean
  cta_text: string
  style: ProductBlockStyle
  /** Round 42: the layout was picked in the block's own Layout list, so a theme's product_layout leaves it alone. */
  style_chosen?: boolean
  // Cached product data for display
  product_title?: string | null
  product_thumbnail?: string | null
  /** The product's cover as uploaded (products.cover_original_url, SQL part 377): unpadded, unlike the card copy above. */
  product_cover?: string | null
  product_description?: string | null
  product_variant_min_cents?: number | null
  product_variant_max_cents?: number | null
  product_variant_count?: number
  product_single_variant_id?: string | null
  product_price_cents?: number | null
  product_slug?: string | null
  /** Refreshed from the product row (lib/onepage/live-products): a membership's price is per month or year. */
  product_type?: string | null
  product_price_interval?: "month" | "year" | null
  // Layout and animation options
  layout_type?: BlockLayoutType
  animation_type?: BlockAnimationType
  // Custom thumbnail (overrides product thumbnail)
  custom_thumbnail?: string | null
  // Button style customization (filled is the only style now)
  button_style?: ProductButtonStyle
  // Block background color (entire block container)
  block_background_color?: string | null
  // Text color for title, description, price
  text_color?: string | null
  // Button (CTA) background color
  button_color?: string | null
  // Button (CTA) text color
  button_text_color?: string | null
  // Quick checkout for free products (skips checkout page)
  quick_checkout?: boolean
  /** What a tap does (lib/onepage/product-block productTapAction). Unset: the checkout, as before. */
  tap_action?: ProductTapAction
  /** A download or a course is paid for in a window on this page, the community's checkout window (components/onepage/instant-checkout). */
  instant_checkout?: boolean
  /** Round 41: the sheet's main button (lib/onepage/product-block productSheetAction). Unset: check out. */
  sheet_action?: ProductSheetAction
  /** Round 41: with checkout as the main button, a quiet link to the full page under it. Unset: shown. */
  sheet_page_link?: boolean
  /** Round 43: the sheet's checkout button carries the price ("Buy now · €49"). Unset: the words alone. */
  sheet_button_price?: boolean
  /** Refreshed from the product row (lib/onepage/live-products): a sale price's "was", and pay what you want. */
  product_compare_at_cents?: number | null
  product_pwyw?: boolean | null
  product_pwyw_min_cents?: number | null
}

export interface SocialRowBlockData {
  platforms: Array<{
    platform: keyof OnePageSocialLinks
    url: string
  }>
  style: "icons" | "buttons"
  // Padding options
  padding_top?: number
  padding_bottom?: number
}

export interface TextBlockData {
  content: string
  alignment: "left" | "center" | "right"
}

export interface ImageItem {
  id: string
  image_url: string
  alt_text?: string
  title?: string
  link_url?: string | null
  /** What a press on the picture does (lib/forms/actions); fills link_url (lib/onepage/block-action). */
  action?: import("@/lib/forms/actions").NativeAction
  /** The picture's own size, saved with it from round 40 so the page reserves its box before it loads. */
  width?: number
  height?: number
}

export type ImageCarouselViewType = "1" | "1.3" | "1.5" | "2"

export interface ImageBlockData {
  // Legacy single image support
  image_url: string
  alt_text?: string
  link_url?: string | null
  // New multi-image support
  images?: ImageItem[]
  // Display options
  aspect_ratio?: "auto" | "original" | "square" | "portrait" | "landscape" | "video" | "wide"
  layout_type?: BlockLayoutType
  // Style options
  display_style?: "single" | "grid" | "carousel"
  grid_columns?: 2 | 3 | 4
  // Carousel options
  carousel_autoplay?: boolean
  carousel_interval?: number
  carousel_view?: ImageCarouselViewType
  // Image options
  image_fit?: "cover" | "contain"
  border_radius?: "none" | "sm" | "md" | "lg" | "full"
  show_captions?: boolean
  // Interaction
  clickable?: boolean
}

export interface DividerBlockData {
  style: "line" | "space" | "dots" | "wave" | "zigzag" | "dashed" | "gradient" | "double"
  height: number
}

export interface EmailCaptureBlockData {
  headline: string
  description?: string
  placeholder: string
  button_text: string
  success_message: string
  lead_magnet_id?: string | null
  // Button text preset selector
  button_preset?: EmailCaptureButtonPreset
  custom_button_text?: string
  // Digital product delivery
  enable_digital_product?: boolean
  digital_product_id?: string | null
  digital_product_title?: string | null
  digital_product_thumbnail?: string | null
  digital_product_file_url?: string | null  // URL to the digital file
  // Layout type (default or pro with thumbnail)
  layout_type?: EmailCaptureLayoutType
  product_image?: string | null  // Custom image for Pro layout
  // Email customization
  send_welcome_email?: boolean  // Always send welcome email on subscription
  email_subject?: string  // Custom email subject
  email_heading?: string  // Custom email heading
  email_body?: string  // Custom email body text
  // Animation option
  animation_type?: BlockAnimationType
  // Ask for a first name above the email box
  ask_name?: boolean
  // After they join: a link the success message offers (a free guide, a private video, a group)
  after_signup_url?: string | null
  /** A chat or group the signup leads to (lib/forms/actions); fills after_signup_url. */
  after_action?: import("@/lib/forms/actions").NativeAction
  after_signup_label?: string | null
  /** The tool the block was added as in the Add block sheet (Mailchimp, Kit, Zapier...): its settings offer to connect that one first. */
  integration_hint?: string | null
}

// PDF document layout types
export type PDFDocumentLayoutType = 'default' | 'pro'

export interface PDFDocumentBlockData {
  title: string
  description?: string
  pdf_file_url?: string | null
  // Layout type (default with button, pro with image/title/description)
  layout_type?: PDFDocumentLayoutType
  // Custom thumbnail for Pro layout (defaults to PDF preview if not set)
  thumbnail_url?: string | null
  // Button text customization
  button_text?: string
  // Preview modal button text (e.g., "View full PDF" or "View Menu")
  preview_button_text?: string
  // Enable preview modal when button is clicked
  enable_preview?: boolean
  // Open PDF directly instead of showing preview modal
  open_directly?: boolean
  // Animation option
  animation_type?: BlockAnimationType
}

// Food Menu block data (same structure as PDF Document)
export interface FoodMenuBlockData {
  title: string
  description?: string
  pdf_file_url?: string | null
  layout_type?: PDFDocumentLayoutType
  thumbnail_url?: string | null
  button_text?: string
  preview_button_text?: string
  enable_preview?: boolean
  open_directly?: boolean
  animation_type?: BlockAnimationType
}

// Calendly embed mode types
export type CalendlyEmbedMode = 'direct_link' | 'embedded'
export type CalendlyEmbedType = 'inline' | 'modal'

export interface CalendlyBlockData {
  title: string
  description?: string
  calendly_url?: string | null
  /** A booking (lib/forms/actions): one of the creator's booking forms, drawn in place of the embed, or a booking page that fills calendly_url. */
  action?: import("@/lib/forms/actions").NativeAction
  layout_type?: PDFDocumentLayoutType
  thumbnail_url?: string | null
  button_text?: string
  // Embed mode: go directly to link or embed
  embed_mode?: CalendlyEmbedMode
  // Embed type: inline (default) or modal popup
  embed_type?: CalendlyEmbedType
  animation_type?: BlockAnimationType
}

export interface HeaderBlockData {
  show_avatar: boolean
  show_name: boolean
  show_bio: boolean
}

export type GroupLayoutType = "stack" | "carousel" | "grid"

export type CarouselViewType = "1" | "1.2" | "1.5"

export interface GroupBlockData {
  title?: string | null
  layout: GroupLayoutType
  children: OnePageBlock[]
  carousel_view?: CarouselViewType
  carousel_fade_edges?: boolean
  /** A collection's optional line and picture, drawn above its blocks with a soft fade. */
  description?: string | null
  image_url?: string | null
}

// The blocks drawn by components/onepage/extra-blocks, the same in the editor and on the live page
export interface HeadingBlockData {
  text: string
  size: "small" | "medium" | "large"
  alignment: "left" | "center" | "right"
}

export interface FaqItem {
  id: string
  question: string
  answer: string
}

export interface FaqBlockData {
  title?: string | null
  items: FaqItem[]
}

export interface CountdownBlockData {
  title?: string | null
  target_at: string | null
  ended_text?: string | null
}

export interface MapBlockData {
  title?: string | null
  address: string
  show_button?: boolean
}

export interface VideoBlockData {
  url: string
  title?: string | null
}

// The blocks drawn by components/onepage/creator-blocks (lib/onepage/creator-blocks.ts holds their rules)
export interface CourseBlockData {
  /** A product of type "course" that belongs to the page's creator. */
  product_id: string
  /** Copies kept for the editor's row; the live page reads the product again (lib/onepage/live-products). */
  course_title?: string | null
  course_slug?: string | null
  course_thumbnail?: string | null
  course_price_cents?: number | null
  lessons_count?: number | null
  button_text?: string | null
  show_price?: boolean
}

export interface MusicBlockData {
  /** A Spotify, SoundCloud or Apple Music link. */
  url: string
  title?: string | null
}

export interface TestimonialItem {
  id: string
  quote: string
  name: string
  detail?: string | null
  rating?: number | null
}

export interface TestimonialsBlockData {
  title?: string | null
  items: TestimonialItem[]
}

export interface ContactFormBlockData {
  title?: string | null
  description?: string | null
  button_text?: string | null
  success_message?: string | null
  /** Show the "Keep me updated" box that adds the sender to the email list. */
  offer_signup?: boolean
}

/**
 * A post, form, player or calendar from another service, in that service's
 * own public embed (lib/onepage/creator-blocks embedSource): Instagram, X,
 * Typeform, Google Forms, Tally, Substack, Apple Podcasts, Twitch, Loom,
 * Mixcloud, Bandcamp, Deezer and Google Calendar.
 */
export interface EmbedBlockData {
  url: string
  title?: string | null
  /** Which one the Add block sheet started it as, for the field's hint; the link decides what plays. */
  provider?: string | null
}

/* The blocks drawn by components/onepage/storelib-blocks (lib/onepage/storelib-blocks.ts holds their rules). */
export type { FollowersBlockData, LeadMagnetBlockData, PromoCodeBlockData, SocialPostsBlockData, StorelibShelfBlockData } from "./storelib-blocks"

export type OnePageBlockData =
  | FormQuizBlockData
  | LinkButtonBlockData
  | ProductBlockData
  | SocialRowBlockData
  | TextBlockData
  | ImageBlockData
  | DividerBlockData
  | EmailCaptureBlockData
  | HeaderBlockData
  | GroupBlockData
  | PDFDocumentBlockData
  | FoodMenuBlockData
  | CalendlyBlockData
  | HeadingBlockData
  | FaqBlockData
  | CountdownBlockData
  | MapBlockData
  | VideoBlockData
  | CourseBlockData
  | MusicBlockData
  | TestimonialsBlockData
  | ContactFormBlockData
  | EmbedBlockData
  | StorelibShelfBlockData
  | LeadMagnetBlockData
  | SocialPostsBlockData
  | FollowersBlockData
  | PromoCodeBlockData
  | AppBlockData

export interface OnePageBlockStyle {
  presentation?: import("./block-presentation").BlockPresentation
  background_color?: string
  text_color?: string
  border_radius?: number
  border_width?: number
  border_color?: string
  shadow?: "none" | "sm" | "md" | "lg"
  padding?: "sm" | "md" | "lg"
}

export interface OnePageBlock {
  id: string
  type: OnePageBlockType
  enabled: boolean
  data: OnePageBlockData
  style?: OnePageBlockStyle
  sort_order: number
  // Shown only between these times (ISO). Either end may be left open.
  schedule?: OnePageBlockSchedule | null
}

export interface OnePageBlockSchedule {
  start_at?: string | null
  end_at?: string | null
}

export interface OnePage {
  id: string
  owner_id: string
  creator_id?: string | null
  slug: string
  title: string
  bio: string
  avatar_url?: string | null
  avatar_video_url?: string | null
  avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
  theme: OnePageTheme
  settings: OnePageSettings
  social_links: OnePageSocialLinks
  draft_blocks: OnePageBlock[]
  published_blocks?: OnePageBlock[] | null
  published_theme?: OnePageTheme | null
  published_profile?: {
    title: string
    bio: string
    avatar_url?: string | null
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
  } | null
  published_social_links?: OnePageSocialLinks | null
  status: "draft" | "published" | "archived"
  published_at?: string | null
  created_at: string
  updated_at: string
  // Track if the user has completed the OnePage onboarding wizard
  onboarding_completed?: boolean
  /** The picture a shared link shows (lib/onepage/seo shareImageModeOf): the profile photo unless changed. */
  share_image_mode?: "profile" | "card" | "custom" | null
}

export interface OnePageTemplate {
  id: string
  name: string
  description?: string | null
  preview_image_url?: string | null
  theme: OnePageTheme
  sort_order: number
  is_premium: boolean
}

export interface OnePageLead {
  id: string
  onepage_id: string
  email: string
  name?: string | null
  block_id?: string | null
  referrer?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  lead_magnet_id?: string | null
  delivery_status: "pending" | "sent" | "failed" | "not_applicable"
  delivered_at?: string | null
  created_at: string
  // NEW: Digital product tracking
  digital_product_id?: string | null
  digital_download_sent?: boolean
  digital_download_sent_at?: string | null
}

export interface OnePageLeadMagnet {
  id: string
  onepage_id: string
  name: string
  description?: string | null
  file_url?: string | null
  product_id?: string | null
  email_subject: string
  email_body: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Editor state types
export interface OnePageEditorState {
  onepage: OnePage | null
  selectedBlockId: string | null
  activeSection: "profile" | "theme" | "blocks" | "socials" | "leads" | "settings"
  isDirty: boolean
  isSaving: boolean
  saveState: "idle" | "saving" | "saved" | "error"
  history: OnePage[]
  historyIndex: number
}

// Button preset labels for UI display
export const buttonPresetLabels: Record<EmailCaptureButtonPreset, string> = {
  subscribe: 'Subscribe',
  join: 'Join Now',
  get_access: 'Get Access',
  download: 'Download',
  sign_up: 'Sign Up',
  unlock: 'Unlock Now',
  custom: 'Custom',
}

// Default values
export const defaultTheme: OnePageTheme = {
  template_id: "minimal_white",
  background_type: "solid",
  background_color: "#ffffff",
  background_gradient: null,
  background_image_url: null,
  text_color: "#000000",
  secondary_text_color: "#6b7280",
  button_style: "outline",
  button_color: "#ffffff",
  button_text_color: "#000000",
  button_border_radius: 8,
  button_border_width: 1,
  button_border_color: "#e5e7eb",
  button_hover_color: "#f9fafb",
  font_family: "Inter",
  card_width: "standard",
  spacing: "normal",
  gradient_direction: 135,
  gradient_animated: false,
  gradient_noise: false,
  image_brightness: 100,
  image_blur: 0,
  image_noise: false,
  header_layout: "classic",
}

export const defaultSettings: OnePageSettings = {
  show_branding: true,
  seo_title: null,
  seo_description: null,
  social_image_url: null,
  custom_domain: null,
  analytics_enabled: true,
  subscribe_enabled: true,
  subscribe_style: "glass",
  share_enabled: true,
  share_style: "white",
  verified_badge_enabled: false,
  verified_badge_type: "verified_creator",
}

export const defaultSocialLinks: OnePageSocialLinks = {
  instagram: null,
  tiktok: null,
  youtube: null,
  twitter: null,
  spotify: null,
  website: null,
  email: null,
}

/** Moved to ./social-url.ts; imported from here as before. */
export { normalizeSocialUrl } from "./social-url"

export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function createDefaultBlock(type: OnePageBlockType): OnePageBlock {
  const id = generateBlockId()
  const baseBlock = {
    id,
    type,
    enabled: true,
    sort_order: 0,
  }

  switch (type) {
    case "form_quiz": return {...baseBlock,data:{form_id:"",title:"Open form",inline:false} as FormQuizBlockData}
    case "link_button":
      return {
        ...baseBlock,
        data: {
          label: "My Link",
          url: "https://",
          icon: null,
          thumbnail_url: null,
        } as LinkButtonBlockData,
      }
    case "product":
      return {
        ...baseBlock,
        data: {
          product_id: "",
          show_price: true,
          show_description: true,
          cta_text: "Get My Guide",
          style: "callout",
        } as ProductBlockData,
      }
    case "social_row":
      return {
        ...baseBlock,
        data: {
          platforms: [],
          style: "icons",
        } as SocialRowBlockData,
      }
    case "text":
      return {
        ...baseBlock,
        data: {
          content: "Enter your text here...",
          alignment: "center",
        } as TextBlockData,
      }
    case "image":
      return {
        ...baseBlock,
        data: {
          image_url: "",
          alt_text: "",
          link_url: null,
          aspect_ratio: "square",
          display_style: "carousel",
          carousel_autoplay: true,
          border_radius: "md",
          image_fit: "cover",
        } as ImageBlockData,
      }
    case "divider":
      return {
        ...baseBlock,
        data: {
          style: "space",
          height: 24,
        } as DividerBlockData,
      }
    case "email_capture":
      return {
        ...baseBlock,
        data: {
          headline: "Join my newsletter",
          description: "Get updates and exclusive content",
          placeholder: "Enter your email",
          button_text: "Subscribe",
          success_message: "Thanks for subscribing!",
          lead_magnet_id: null,
          button_preset: "subscribe",
          custom_button_text: "",
          enable_digital_product: false,
          digital_product_id: null,
          digital_product_title: null,
          digital_product_thumbnail: null,
          digital_product_file_url: null,
          layout_type: "default",
          product_image: null,
          animation_type: "none",
        } as EmailCaptureBlockData,
      }
    case "header":
      return {
        ...baseBlock,
        data: {
          show_avatar: true,
          show_name: true,
          show_bio: true,
        } as HeaderBlockData,
      }
    case "group":
      return {
        ...baseBlock,
        data: {
          title: null,
          layout: "stack",
          children: [],
        } as GroupBlockData,
      }
    case "pdf_document":
      return {
        ...baseBlock,
        data: {
          title: "My PDF Document",
          description: "",
          pdf_file_url: null,
          layout_type: "default",
          thumbnail_url: null,
          button_text: "View PDF",
          preview_button_text: "View full PDF",
          enable_preview: true,
          open_directly: false,
          animation_type: "none",
        } as PDFDocumentBlockData,
      }
    case "food_menu":
      return {
        ...baseBlock,
        data: {
          title: "Menu",
          description: "",
          pdf_file_url: null,
          layout_type: "default",
          thumbnail_url: null,
          button_text: "View Menu",
          preview_button_text: "View Menu",
          enable_preview: true,
          open_directly: false,
          animation_type: "none",
        } as FoodMenuBlockData,
      }
    case "calendly":
      return {
        ...baseBlock,
        data: {
          title: "Book a Meeting",
          description: "",
          calendly_url: null,
          layout_type: "default",
          thumbnail_url: null,
          button_text: "Schedule Now",
          embed_mode: "embedded",
          embed_type: "modal",
          animation_type: "none",
        } as CalendlyBlockData,
      }
    case "heading":
      return {
        ...baseBlock,
        data: { text: "New section", size: "medium", alignment: "center" } as HeadingBlockData,
      }
    case "faq":
      return {
        ...baseBlock,
        data: {
          title: "",
          items: [{ id: `q_${Date.now().toString(36)}`, question: "What do I get?", answer: "" }],
        } as FaqBlockData,
      }
    case "countdown":
      return {
        ...baseBlock,
        data: {
          title: "",
          target_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          ended_text: "",
        } as CountdownBlockData,
      }
    case "map":
      return {
        ...baseBlock,
        data: { title: "", address: "", show_button: true } as MapBlockData,
      }
    case "video":
      return {
        ...baseBlock,
        data: { url: "", title: "" } as VideoBlockData,
      }
    case "course":
      return {
        ...baseBlock,
        data: { product_id: "", button_text: "", show_price: true } as CourseBlockData,
      }
    case "music":
      return {
        ...baseBlock,
        data: { url: "", title: "" } as MusicBlockData,
      }
    case "testimonials":
      return {
        ...baseBlock,
        data: {
          title: "",
          items: [{ id: `t_${Date.now().toString(36)}`, quote: "", name: "", detail: "", rating: 5 }],
        } as TestimonialsBlockData,
      }
    case "contact_form":
      return {
        ...baseBlock,
        data: { title: "Get in touch", description: "", button_text: "Send", success_message: "Thanks. I will write back soon.", offer_signup: true } as ContactFormBlockData,
      }
    case "embed":
      return {
        ...baseBlock,
        data: { url: "", title: "", provider: null } as EmbedBlockData,
      }
    case "storelib_shelf":
      return { ...baseBlock, data: { source: "all", title: "", layout: "carousel", limit: 6 } as StorelibShelfBlockData }
    case "lead_magnet":
      return { ...baseBlock, data: { kind: "download", title: "Free guide", description: "", button_text: "", ask_name: false } as LeadMagnetBlockData }
    case "social_posts":
      return { ...baseBlock, data: { network: "youtube", title: "", channel_url: "", post_urls: [], limit: 6 } as SocialPostsBlockData }
    case "followers":
      return { ...baseBlock, data: { networks: [], label: "", style: "line" } as FollowersBlockData }
    case "promo_code":
      return { ...baseBlock, data: { title: "", code: "", description: "", url: "" } as PromoCodeBlockData }
    case "app":
      /* The picker's entry says which service (./app-blocks appBlockDefaults); a bare one is a text and button. */
      return { ...baseBlock, data: { provider: "note", url: "", title: "", subtitle: "", button_text: "" } as AppBlockData }
    default:
      return baseBlock as OnePageBlock
  }
}
