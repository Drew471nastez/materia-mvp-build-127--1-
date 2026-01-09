// OnePage Types
// Location: lib/onepage/types.ts

export type OnePageBlockType =
  | "link_button"
  | "product"
  | "social_row"
  | "text"
  | "image"
  | "divider"
  | "email_capture"
  | "header"
  | "group"

export interface OnePageTheme {
  template_id: string
  background_type: "solid" | "gradient" | "image"
  background_color: string
  background_gradient?: string | null
  background_image_url?: string | null
  text_color: string
  secondary_text_color?: string
  button_style: "filled" | "outline" | "glass"
  button_color: string
  button_text_color: string
  button_border_radius: number
  button_border_width: number
  button_border_color: string
  button_hover_color?: string
  font_family: string
  // Title customization
  title_font?: string | null
  title_color?: string | null
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
  // Animated gradient
  animated_gradient?: boolean
}

export interface OnePageSettings {
  show_branding: boolean
  seo_title?: string | null
  seo_description?: string | null
  social_image_url?: string | null
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

export interface StreamingService {
  platform: 'apple_music' | 'youtube_music' | 'soundcloud' | 'tidal' | 'deezer' | 'amazon_music' | 'spotify'
  url: string | null
  found: boolean
}

export interface LinkButtonBlockData {
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
}

export interface ProductBlockData {
  product_id: string
  show_price: boolean
  show_description: boolean
  cta_text: string
}

export interface SocialRowBlockData {
  platforms: Array<{
    platform: keyof OnePageSocialLinks
    url: string
  }>
  style: "icons" | "buttons"
}

export interface TextBlockData {
  content: string
  alignment: "left" | "center" | "right"
}

export interface ImageBlockData {
  image_url: string
  alt_text?: string
  link_url?: string | null
  aspect_ratio?: "auto" | "square" | "video" | "wide"
  layout_type?: BlockLayoutType
}

export interface DividerBlockData {
  style: "line" | "space" | "dots"
  height: number
}

export interface EmailCaptureBlockData {
  headline: string
  description?: string
  placeholder: string
  button_text: string
  success_message: string
  lead_magnet_id?: string | null
}

export interface HeaderBlockData {
  show_avatar: boolean
  show_name: boolean
  show_bio: boolean
}

export type GroupLayoutType = "stack" | "carousel"

export type CarouselViewType = "1" | "1.2" | "1.5"

export interface GroupBlockData {
  title?: string | null
  layout: GroupLayoutType
  children: OnePageBlock[]
  carousel_view?: CarouselViewType
  carousel_fade_edges?: boolean
}

export type OnePageBlockData =
  | LinkButtonBlockData
  | ProductBlockData
  | SocialRowBlockData
  | TextBlockData
  | ImageBlockData
  | DividerBlockData
  | EmailCaptureBlockData
  | HeaderBlockData
  | GroupBlockData

export interface OnePageBlockStyle {
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
          cta_text: "Get it now",
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
          aspect_ratio: "auto",
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
    default:
      return baseBlock as OnePageBlock
  }
}
