"use client"

import { hapticTap } from "@/lib/native-bridge"
import { sheetAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"
import { useLinkReorder } from "@/components/onepage/link-reorder"

import { useOnePage } from "@/lib/onepage/context"
import {
  createDefaultBlock,
  type OnePageBlock,
  type OnePageBlockType,
  type LinkButtonBlockData,
  type TextBlockData,
  type EmailCaptureBlockData,
  type ImageBlockData,
  type ImageItem,
  type DividerBlockData,
  type HeaderBlockData,
  type SocialRowBlockData,
  type OnePageSocialLinks,
  type BlockLayoutType,
  type YouTubeMode,
  type SpotifyMode,
  type StreamingService,
  type GroupBlockData,
  type GroupLayoutType,
  type CarouselViewType,
  type ImageCarouselViewType,
  type ProductBlockData,
  type ProductBlockStyle,
  type ProductButtonStyle,
  type EmailCaptureButtonPreset,
  type EmailCaptureLayoutType,
  type PDFDocumentBlockData,
  type PDFDocumentLayoutType,
  type FoodMenuBlockData,
  type CalendlyBlockData,
  type CalendlyEmbedMode,
  type CalendlyEmbedType,
} from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
// Custom Toggle Component with theme-style design
/** The large rounded box the link editor's own fields use (16px on a phone, or iOS zooms the page to type). */
const linkField =
  "h-12 w-full rounded-xl border border-[#e3e4e8] bg-white px-4 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[15px]"

/*
  EVERY TOGGLE HERE IS THE APP'S ONE SWITCH (components/ui/switch-style,
  drawn by editor-kit's Switch): slim, near black when on, a quiet grey
  when off, with a 44px place to press. They were two CSS checkboxes, one of
  them violet.
*/
function Toggle({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label?: string }) {
  return <Switch checked={checked} onChange={onCheckedChange} label={label ?? ""} />
}

/** A card's own on and off, at the end of its row. */
function BlockToggle({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label?: string }) {
  return <Switch checked={checked} onChange={onCheckedChange} label={label ?? (checked ? "Shown on your page" : "Hidden from your page")} />
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { ColorRow, RangeRow, Switch } from "@/components/onepage/editor-kit"
import { primaryDepth } from "@/components/ui/depth-button"
import { DeletedIcon, SaveNotification } from "@/components/ui/save-notification"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Plus,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link,
  Type,
  Image as ImageIcon,
  Minus,
  Mail,
  User,
  Heart,
  Video,
  MessageSquare,
  Share2,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  ShoppingBag,
  Grid3X3,
  FileText,
  Pencil,
  Upload,
  Loader2,
  ZoomIn,
  ZoomOut,
  Archive,
  RotateCcw,
  Settings,
  LayoutGrid,
  Sparkles,
  AlertCircle,
  BarChart2,
  Play,
  Layers,
  ArrowUpRight,
  Palette,
  Check,
  Calendar,
  Info,
} from "lucide-react"
import { LinkStatsChart } from "@/components/onepage/link-stats-chart"
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { createClient } from "@/lib/supabase/client"
import { BLOCKED_EXTENSIONS, readFileHeader, scanFile, MAX_DIGITAL_PRODUCT_FILE_SIZE } from "@/lib/storage/security"
import { BlockBadges, BlockExtras, EXTRA_BLOCK_CATALOG, EXTRA_BLOCK_TYPES, ExtraBlockEditor, extraBlockRow, type ExtraBlockType } from "@/components/onepage/extra-blocks"
import { canonicalSocialPlatform, hasSocialHandles, socialHandleUrl } from "@/lib/onepage/social-url"
import { LinkIcon, SocialIcon, hasLinkIcon, markOn, socialPlatformLabel } from "@/components/onepage/brand-icons"
import { LINK_ICONS, LINK_ICON_CATEGORIES, resolveLinkIcon } from "@/components/onepage/link-icons"

/**
 * WHERE EACH PLATFORM'S LINKS LIVE.
 *
 * Only seven platforms were checked before; the other fifteen took whatever
 * was typed, so "hello" saved as a Discord link. Each host list includes the
 * short and regional addresses the platform hands out itself (youtu.be,
 * lnkd.in, pin.it, spotify.link, apple.co), so a link copied from the app's
 * own share button is never refused. A website is any address at all.
 */
const SOCIAL_HOSTS: Record<string, RegExp> = {
  instagram: /(^|\.)(instagram\.com|instagr\.am)$/,
  tiktok: /(^|\.)tiktok\.com$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
  twitter: /(^|\.)(x\.com|twitter\.com)$/,
  spotify: /(^|\.)(spotify\.com|spotify\.link)$/,
  threads: /(^|\.)threads\.(net|com)$/,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$/,
  whatsapp: /(^|\.)(wa\.me|whatsapp\.com)$/,
  snapchat: /(^|\.)snapchat\.com$/,
  discord: /(^|\.)(discord\.gg|discord\.com|discordapp\.com)$/,
  github: /(^|\.)github\.com$/,
  kick: /(^|\.)kick\.com$/,
  linkedin: /(^|\.)(linkedin\.com|lnkd\.in)$/,
  patreon: /(^|\.)patreon\.com$/,
  pinterest: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/,
  soundcloud: /(^|\.)(soundcloud\.com|snd\.sc)$/,
  applemusic: /(^|\.)(music\.apple\.com|itunes\.apple\.com|apple\.co)$/,
  telegram: /(^|\.)(t\.me|telegram\.me|telegram\.org|telegram\.dog)$/,
  twitch: /(^|\.)twitch\.tv$/,
  calendly: /(^|\.)calendly\.com$/,
}

/**
 * Spotify and Apple Music have no usernames: the only thing that opens a
 * creator's page there is its link. `@name` for either used to become an
 * address that did not exist, so for these two it is refused with a hint.
 */
const LINK_ONLY_PLATFORMS = new Set(["spotify", "applemusic"])

// Validate social URL and transform if needed
function validateSocialUrl(platform: string, url: string): { valid: boolean; error?: string; transformedUrl?: string } {
  const typed = url.trim()
  if (!typed) return { valid: true }
  const key = canonicalSocialPlatform(platform)
  const name = socialPlatformLabel(key)

  if (key === "email") {
    const address = typed.replace(/^mailto:/i, "")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { valid: false, error: "Enter an email address, like you@example.com" }
    return { valid: true, transformedUrl: `mailto:${address}` }
  }

  // @username, a plain username, or a WhatsApp number: made into the profile address
  if (!LINK_ONLY_PLATFORMS.has(key)) {
    const profile = socialHandleUrl(key, typed)
    if (profile) return { valid: true, transformedUrl: profile }
  }

  const hint =
    key === "website" ? "Enter your website address, like yoursite.com"
    : key === "whatsapp" ? "Enter your number with its country code, or a wa.me link"
    : LINK_ONLY_PLATFORMS.has(key) || !hasSocialHandles(key) ? `Paste the link to your ${name} page`
    : "Enter a link or an @username"

  let parsed: URL
  const full = /^https?:\/\//i.test(typed) ? typed : `https://${typed.replace(/^\/\//, "")}`
  try {
    parsed = new URL(full)
  } catch {
    return { valid: false, error: hint }
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".") || /\s/.test(typed)) {
    return { valid: false, error: hint }
  }

  const hosts = SOCIAL_HOSTS[key]
  if (hosts && !hosts.test(parsed.hostname.toLowerCase())) {
    return { valid: false, error: `That isn't a ${name} link` }
  }

  return { valid: true, transformedUrl: full }
}

// Social platforms configuration with SVG icons
const SOCIAL_PLATFORMS = [
  { id: "threads", label: "Threads", placeholder: "https://threads.net/@username", color: "#000000" },
  { id: "email", label: "Email", placeholder: "mailto:you@email.com", color: "#EA4335" },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/page", color: "#1877F2" },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel", color: "#FF0000" },
  { id: "twitter", label: "X (Twitter)", placeholder: "https://x.com/username", color: "#000000" },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username", color: "#000000" },
  { id: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/1234567890", color: "#25D366" },
  { id: "snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/username", color: "#FFFC00" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/username", color: "#E4405F" },
  { id: "discord", label: "Discord", placeholder: "https://discord.gg/invite", color: "#5865F2" },
  { id: "github", label: "GitHub", placeholder: "https://github.com/username", color: "#333333" },
  { id: "kick", label: "Kick", placeholder: "https://kick.com/username", color: "#53FC18" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username", color: "#0A66C2" },
  { id: "patreon", label: "Patreon", placeholder: "https://patreon.com/creator", color: "#FF424D" },
  { id: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/username", color: "#E60023" },
  { id: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/username", color: "#FF5500" },
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/...", color: "#1DB954" },
  { id: "applemusic", label: "Apple Music", placeholder: "https://music.apple.com/...", color: "#FA233B" },
  { id: "telegram", label: "Telegram", placeholder: "https://t.me/username", color: "#0088CC" },
  { id: "twitch", label: "Twitch", placeholder: "https://twitch.tv/username", color: "#9146FF" },
  { id: "website", label: "Website", placeholder: "https://yourwebsite.com", color: "#6366F1" },
  { id: "calendly", label: "Calendly", placeholder: "https://calendly.com/username", color: "#006BFF" },
]

// Default background images library
const IMAGE_LIBRARY = [
  { id: "gradient2", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80", label: "Colorful Gradient" },
  { id: "gradient3", url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80", label: "Blue Gradient" },
  { id: "minimal1", url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&q=80", label: "Abstract Minimal" },
  { id: "minimal2", url: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=800&q=80", label: "Soft Waves" },
  { id: "minimal3", url: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=800&q=80", label: "Mesh Gradient" },
  { id: "dark1", url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80", label: "Dark Abstract" },
  { id: "dark2", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", label: "Mountains" },
  { id: "texture1", url: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=800&q=80", label: "Marble" },
  { id: "texture2", url: "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=800&q=80", label: "Paper Texture" },
  { id: "nature1", url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&q=80", label: "Ocean" },
  { id: "nature2", url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=800&q=80", label: "Forest" },
]

/*
  THE PHONE SHEETS ARE TAKEN AWAY ONLY ONCE THEY HAVE SLID OUT. Each slides
  down over 400ms (the transform transition on the sheet), and used to be
  unmounted at 220ms, so it vanished halfway down, which read as a jump on
  every close.
*/
const SHEET_SLIDE_MS = 400

/*
  Opened again while it slides out: the close is called off and it slides
  back up, rather than the old close shutting the new open. Returns true, so
  an open reads setShowX(sheetOpening(...)).
*/
function sheetOpening(timer: { current: ReturnType<typeof setTimeout> | null }, mounted: boolean, setPresented: (v: boolean) => void): true {
  if (timer.current) {
    clearTimeout(timer.current)
    timer.current = null
    if (mounted) setPresented(true)
  }
  return true
}

// Block categories with integrations
const blockCategories = [
  {
    id: "most_popular",
    label: "Most Popular",
    icon: Heart,
    blocks: [
      { type: "product" as const, label: "Digital Product", description: "Sell a digital product on your page", icon: ShoppingBag },
      { type: "email_capture" as const, label: "Email Signup", description: "Collect emails from visitors", icon: Mail },
      { type: "link_button" as const, label: "YouTube", description: "Link to YouTube", icon: Video, preset: { label: "Subscribe on YouTube", url: "https://youtube.com/@" } },
      { type: "link_button" as const, label: "Spotify", description: "Share your music", icon: Share2, preset: { label: "Listen on Spotify", url: "https://open.spotify.com/" } },
      { type: "link_button" as const, label: "TikTok", description: "Link to TikTok", icon: Share2, preset: { label: "Follow on TikTok", url: "https://tiktok.com/@" } },
      { type: "link_button" as const, label: "Instagram", description: "Link to Instagram", icon: Share2, preset: { label: "Follow on Instagram", url: "https://instagram.com/" } },
    ],
  },
  {
    id: "products",
    label: "Products",
    icon: ShoppingBag,
    blocks: [
      { type: "product" as const, label: "Digital Product", description: "Sell a digital product", icon: ShoppingBag },
      { type: "email_capture" as const, label: "Email Signup", description: "Collect emails from visitors", icon: Mail },
      { type: "link_button" as const, label: "My Link", description: "Add a simple link", icon: Link, preset: { label: "My Link", url: "" } },
      { type: "link_button" as const, label: "Store Link", description: "Link to your store", icon: ShoppingBag, preset: { label: "Shop Now", url: "" } },
      { type: "link_button" as const, label: "eCourse", description: "Sell online courses", icon: Video, comingSoon: true, preset: { label: "View Course", url: "" } },
      { type: "link_button" as const, label: "Coaching", description: "Offer coaching sessions", icon: User, comingSoon: true, preset: { label: "Book Coaching", url: "" } },
    ],
  },
  {
    id: "social",
    label: "Social",
    icon: Share2,
    blocks: [
      { type: "social_row" as const, label: "Social Icons", description: "Display social links", icon: Share2 },
      { type: "link_button" as const, label: "Instagram", description: "Link to Instagram", icon: Share2, preset: { label: "Follow on Instagram", url: "https://instagram.com/" } },
      { type: "link_button" as const, label: "TikTok", description: "Link to TikTok", icon: Share2, preset: { label: "Follow on TikTok", url: "https://tiktok.com/@" } },
      { type: "link_button" as const, label: "YouTube", description: "Link to YouTube", icon: Share2, preset: { label: "Subscribe on YouTube", url: "https://youtube.com/@" } },
      { type: "link_button" as const, label: "X (Twitter)", description: "Link to X", icon: Share2, preset: { label: "Follow on X", url: "https://x.com/" } },
      { type: "link_button" as const, label: "Facebook", description: "Link to Facebook", icon: Share2, preset: { label: "Follow on Facebook", url: "https://facebook.com/" } },
      { type: "link_button" as const, label: "LinkedIn", description: "Link to LinkedIn", icon: Share2, preset: { label: "Connect on LinkedIn", url: "https://linkedin.com/in/" } },
      { type: "link_button" as const, label: "Threads", description: "Link to Threads", icon: ({ className }: { className?: string }) => <SocialIcon platform="threads" size={16} className={className} />, preset: { label: "Follow on Threads", url: "https://threads.net/@" } },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: Video,
    blocks: [
      { type: "image" as const, label: "Image", description: "Upload or link an image", icon: ImageIcon },
      EXTRA_BLOCK_CATALOG.video,
      { type: "link_button" as const, label: "YouTube Video", description: "Embed a video link", icon: Video, preset: { label: "Watch Video", url: "https://youtube.com/watch?v=" } },
      { type: "link_button" as const, label: "Vimeo", description: "Link to Vimeo", icon: Video, preset: { label: "Watch on Vimeo", url: "https://vimeo.com/" } },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    blocks: [
      { type: "pdf_document" as const, label: "PDF Document", description: "Share a PDF with preview", icon: FileText },
      { type: "food_menu" as const, label: "Food & Drinks Menu", description: "Share your restaurant menu", icon: FileText },
      { type: "link_button" as const, label: "Google Docs", description: "Link to Google Docs", icon: FileText, preset: { label: "View Document", url: "https://docs.google.com/" } },
      { type: "link_button" as const, label: "Notion", description: "Link to Notion page", icon: ({ className }: { className?: string }) => <SocialIcon platform="notion" size={16} className={className} />, preset: { label: "View Page", url: "https://notion.so/", icon: "notion" } },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    icon: Video,
    blocks: [
      { type: "link_button" as const, label: "Spotify", description: "Share your music", icon: Share2, preset: { label: "Listen on Spotify", url: "https://open.spotify.com/" } },
      { type: "link_button" as const, label: "Apple Music", description: "Link to Apple Music", icon: Share2, preset: { label: "Listen on Apple Music", url: "https://music.apple.com/" } },
      { type: "link_button" as const, label: "SoundCloud", description: "Link to SoundCloud", icon: Share2, preset: { label: "Listen on SoundCloud", url: "https://soundcloud.com/" } },
      { type: "link_button" as const, label: "Podcast", description: "Link to your podcast", icon: Share2, preset: { label: "Listen to Podcast", url: "" } },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    icon: MessageSquare,
    blocks: [
      { type: "email_capture" as const, label: "Email Signup", description: "Collect emails", icon: Mail },
      { type: "calendly" as const, label: "Calendly", description: "Book meetings with Calendly", icon: Calendar },
      EXTRA_BLOCK_CATALOG.map,
      { type: "link_button" as const, label: "Contact Form", description: "Link to form", icon: FileText, comingSoon: true, preset: { label: "Contact Me", url: "" } },
      { type: "link_button" as const, label: "WhatsApp", description: "Link to WhatsApp", icon: MessageSquare, preset: { label: "Message on WhatsApp", url: "https://wa.me/" } },
      { type: "link_button" as const, label: "Telegram", description: "Link to Telegram", icon: MessageSquare, preset: { label: "Message on Telegram", url: "https://t.me/" } },
      { type: "link_button" as const, label: "Discord", description: "Link to Discord", icon: MessageSquare, preset: { label: "Join Discord", url: "https://discord.gg/" } },
    ],
  },
  {
    id: "other",
    label: "Other",
    icon: Grid3X3,
    blocks: [
      { type: "link_button" as const, label: "Link", description: "Add any URL", icon: Link },
      EXTRA_BLOCK_CATALOG.heading,
      { type: "text" as const, label: "Text", description: "Add text content", icon: Type },
      EXTRA_BLOCK_CATALOG.faq,
      EXTRA_BLOCK_CATALOG.countdown,
      { type: "divider" as const, label: "Divider", description: "Add spacing", icon: Minus },
      { type: "group" as const, label: "Group", description: "Group blocks together", icon: Layers },
    ],
  },
]

// Helper function to get block preview data
function getBlockPreviewData(block: OnePageBlock) {
  switch (block.type) {
    case "link_button": {
      const data = block.data as LinkButtonBlockData
      const displayUrl = data.url ? (data.url.length > 40 ? data.url.slice(0, 40) + "..." : data.url) : "https://..."
      // Check for Notion URL to show Notion icon
      const isNotionUrl = data.url?.toLowerCase().includes('notion.so') || data.url?.toLowerCase().includes('notion.site') || data.icon === 'notion'
      const NotionIcon = ({ className }: { className?: string }) => (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5749 7.25003C16.6367 7.59473 16.5568 7.93086 16.2367 7.96109L15.7054 8.05698L15.4846 16.374C15.0168 16.6242 14.5911 16.7615 14.2397 16.7493C13.673 16.7296 13.5363 16.5344 13.1293 15.9535L9.82408 10.0074L9.6745 15.6431L10.7624 15.9474C10.7624 15.9474 10.7444 16.6282 9.8619 16.5975L7.42244 16.6648C7.35563 16.5103 7.43656 16.1329 7.68674 16.0686L8.32658 15.9004L8.52431 8.45081L7.64386 8.34411C7.5821 7.99941 7.77252 7.51503 8.26605 7.49448L10.8834 7.39512L14.328 13.4217L14.4666 8.20066L13.5514 8.05443C13.4916 7.63739 13.7802 7.34321 14.1354 7.32029L16.5749 7.25003Z"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M17.2583 2.83306C13.7917 2.44562 10.2083 2.44562 6.74177 2.83306C4.72971 3.05794 3.10538 4.64295 2.86883 6.66548C2.45429 10.2098 2.45429 13.7903 2.86883 17.3346C3.10538 19.3571 4.72971 20.9422 6.74177 21.167C10.2083 21.5545 13.7917 21.5545 17.2583 21.167C19.2703 20.9422 20.8946 19.3571 21.1312 17.3346C21.5457 13.7903 21.5457 10.2098 21.1312 6.66548C20.8946 4.64295 19.2703 3.05794 17.2583 2.83306ZM6.90838 4.32378C10.2642 3.94871 13.7358 3.94871 17.0916 4.32378C18.4218 4.47244 19.4872 5.52205 19.6414 6.83973C20.0424 10.2683 20.0424 13.7318 19.6414 17.1604C19.4872 18.478 18.4218 19.5277 17.0916 19.6763C13.7358 20.0514 10.2642 20.0514 6.90838 19.6763C5.57827 19.5277 4.51278 18.478 4.35867 17.1604C3.95767 13.7318 3.95767 10.2683 4.35867 6.83973C4.51278 5.52205 5.57827 4.47244 6.90838 4.32378Z"/>
        </svg>
      )
      return { title: data.label || "My Link", subtitle: displayUrl, icon: isNotionUrl ? NotionIcon : Link }
    }
    case "header":
      return { title: "Header", subtitle: "Profile section", icon: User }
    case "text": {
      const data = block.data as TextBlockData
      return { title: data.content?.slice(0, 30) || "Text block", subtitle: "Text", icon: Type }
    }
    case "image":
      return { title: "Image", subtitle: "Image block", icon: ImageIcon }
    case "divider":
      return { title: "Divider", subtitle: "Spacing", icon: Minus }
    case "email_capture": {
      const data = block.data as EmailCaptureBlockData
      return { title: data.headline || "Email Signup", subtitle: "Lead capture form", icon: Mail }
    }
    case "social_row":
      return { title: "Social Icons", subtitle: "Social links", icon: Share2 }
    case "product": {
      const data = block.data as ProductBlockData
      return { title: data.product_title || "Digital Product", subtitle: data.product_price_cents ? `$${(data.product_price_cents / 100).toFixed(2)}` : "Select product", icon: ShoppingBag, thumbnail_url: data.custom_thumbnail || data.product_thumbnail }
    }
    case "group": {
      const data = block.data as GroupBlockData
      const childCount = data.children?.length || 0
      return { title: data.title || "Group", subtitle: `${childCount} item${childCount !== 1 ? 's' : ''} · ${data.layout}`, icon: Layers }
    }
    case "pdf_document": {
      const data = block.data as PDFDocumentBlockData
      return { title: data.title || "PDF Document", subtitle: data.pdf_file_url ? "PDF uploaded" : "No file", icon: FileText, thumbnail_url: data.thumbnail_url }
    }
    case "food_menu": {
      const data = block.data as FoodMenuBlockData
      return { title: data.title || "Menu", subtitle: data.pdf_file_url ? "Menu uploaded" : "No file", icon: FileText, thumbnail_url: data.thumbnail_url }
    }
    case "calendly": {
      const data = block.data as CalendlyBlockData
      return { title: data.title || "Book a Meeting", subtitle: data.calendly_url ? "Calendly connected" : "Add Calendly URL", icon: Calendar, thumbnail_url: data.thumbnail_url }
    }
    case "heading":
    case "faq":
    case "countdown":
    case "map":
    case "video":
      return extraBlockRow(block)
    default:
      return { title: block.type, subtitle: "", icon: Link }
  }
}


function normalizeUrlInput(value: string): string {
  return value.trim().replace(/\s+/g, "")
}

// Helper to detect YouTube URLs
function isYouTubeUrl(url: string): boolean {
  if (!url) return false
  const normalizedUrl = normalizeUrlInput(url)
  return normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')
}

// Helper to detect if YouTube URL is a channel/profile (not video)
function isYouTubeChannelUrl(url: string): boolean {
  if (!url) return false
  return url.includes('youtube.com/@') ||
    url.includes('youtube.com/channel/') ||
    url.includes('youtube.com/c/') ||
    url.includes('youtube.com/user/')
}

// Helper to detect Spotify URLs
function isSpotifyUrl(url: string): boolean {
  if (!url) return false
  const normalizedUrl = normalizeUrlInput(url)
  return normalizedUrl.includes('spotify.com') || normalizedUrl.includes('open.spotify.com')
}

export function LinksTab() {
  const {
    onepage,
    selectedBlockId,
    setSelectedBlockId,
    addBlock,
    removeBlock,
    archiveBlock,
    unarchiveBlock,
    archivedBlocks,
    moveBlockUp,
    moveBlockDown,
    toggleBlockEnabled,
    updateBlock,
    updateBlockData,
    updateSocialLinks,
    reorderBlocks,
    updateProfile,
    setActiveSection,
  } = useOnePage()

  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalCategory, setAddModalCategory] = useState("most_popular")
  const [searchQuery, setSearchQuery] = useState("")
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null)
  const [showSocialModal, setShowSocialModal] = useState(false)
  const [selectedSocial, setSelectedSocial] = useState<string | null>(null)
  const [socialUrl, setSocialUrl] = useState("")
  const [socialUrlError, setSocialUrlError] = useState<string | null>(null)
  const [showImageLibrary, setShowImageLibrary] = useState(false)
  const [imageBlockId, setImageBlockId] = useState<string | null>(null)
  const [imageFieldType, setImageFieldType] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showArchiveView, setShowArchiveView] = useState(false)
  const [isMobileModalViewport, setIsMobileModalViewport] = useState(false)
  const [addSheetDragY, setAddSheetDragY] = useState(0)
  const [isAddSheetDragging, setIsAddSheetDragging] = useState(false)
  const addSheetStartYRef = useRef(0)
  const [socialSheetDragY, setSocialSheetDragY] = useState(0)
  const [isSocialSheetDragging, setIsSocialSheetDragging] = useState(false)
  const socialSheetStartYRef = useRef(0)
  const [isAddSheetPresented, setIsAddSheetPresented] = useState(false)
  const [isSocialSheetPresented, setIsSocialSheetPresented] = useState(false)
  const addSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socialSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addSheetLastYRef = useRef(0)
  const addSheetLastTimeRef = useRef(0)
  const addSheetVelocityRef = useRef(0)
  const socialSheetLastYRef = useRef(0)
  const socialSheetLastTimeRef = useRef(0)
  const socialSheetVelocityRef = useRef(0)

  // Thumbnail modal state
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [thumbnailBlockId, setThumbnailBlockId] = useState<string | null>(null)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [showIconLibraryInModal, setShowIconLibraryInModal] = useState(false)
  const [iconSearchQuery, setIconSearchQuery] = useState("")
  const [iconCategory, setIconCategory] = useState("all")
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const [isThumbnailSheetPresented, setIsThumbnailSheetPresented] = useState(false)
  const [thumbnailSheetDragY, setThumbnailSheetDragY] = useState(0)
  const [isThumbnailSheetDragging, setIsThumbnailSheetDragging] = useState(false)
  const thumbnailSheetStartYRef = useRef(0)
  const thumbnailSheetLastYRef = useRef(0)
  const thumbnailSheetLastTimeRef = useRef(0)
  const thumbnailSheetVelocityRef = useRef(0)
  const thumbnailSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const checkViewport = () => {
      if (typeof window === 'undefined') return
      setIsMobileModalViewport(window.innerWidth < 640)
    }

    checkViewport()
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  useEffect(() => {
    if (!showAddModal || !isMobileModalViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsAddSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showAddModal, isMobileModalViewport])

  useEffect(() => {
    if (!showSocialModal || !isMobileModalViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsSocialSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showSocialModal, isMobileModalViewport])

  useEffect(() => {
    if (!showThumbnailModal || !isMobileModalViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsThumbnailSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showThumbnailModal, isMobileModalViewport])

  useEffect(() => {
    return () => {
      if (addSheetCloseTimerRef.current) clearTimeout(addSheetCloseTimerRef.current)
      if (socialSheetCloseTimerRef.current) clearTimeout(socialSheetCloseTimerRef.current)
      if (thumbnailSheetCloseTimerRef.current) clearTimeout(thumbnailSheetCloseTimerRef.current)
    }
  }, [])

  // Pull-to-refresh prevention is handled by the Dialog/Sheet components themselves
  // (scoped to their portals, so it doesn't block normal page interactions)

  // Streaming service URL modal state
  const [showStreamingUrlModal, setShowStreamingUrlModal] = useState(false)
  const [streamingPlatform, setStreamingPlatform] = useState<string | null>(null)
  const [streamingPlatformIndex, setStreamingPlatformIndex] = useState<number>(-1)
  const [streamingUrl, setStreamingUrl] = useState("")
  const [streamingUrlError, setStreamingUrlError] = useState<string | null>(null)
  const [streamingBlockData, setStreamingBlockData] = useState<LinkButtonBlockData | null>(null)
  const [streamingBlockUpdateFn, setStreamingBlockUpdateFn] = useState<((data: Partial<LinkButtonBlockData>) => void) | null>(null)


  // Track which blocks have had auto-fetch attempted to avoid repeated requests
  const autoFetchedBlocksRef = useRef<Set<string>>(new Set())
  
  const [showDeleteSocialNotification, setShowDeleteSocialNotification] = useState(false)
  const [showAddBlockNotification, setShowAddBlockNotification] = useState(false)
  const [showUpdateSocialNotification, setShowUpdateSocialNotification] = useState(false)
  const [showBlockRemovedNotification, setShowBlockRemovedNotification] = useState(false)
  const [showBlockArchivedNotification, setShowBlockArchivedNotification] = useState(false)
  
  // Name/Bio edit state
  const [showNameBioModal, setShowNameBioModal] = useState(false)
  const [editName, setEditName] = useState("")
  const [editBio, setEditBio] = useState("")

  // Avatar edit state
  const [showAvatarEditModal, setShowAvatarEditModal] = useState(false)
  const [showAvatarUploadModal, setShowAvatarUploadModal] = useState(false)
  const [showAvatarCropModal, setShowAvatarCropModal] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showVideoCropModal, setShowVideoCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [tempImageFile, setTempImageFile] = useState<File | null>(null)
  const [tempVideoUrl, setTempVideoUrl] = useState<string | null>(null)
  const [tempVideoFile, setTempVideoFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Crop state for images - square style like design tab
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDraggingCrop, setIsDraggingCrop] = useState(false)
  const [isResizingCrop, setIsResizingCrop] = useState<string | null>(null)
  const [dragStartCrop, setDragStartCrop] = useState({ x: 0, y: 0 })
  const [imageSizeCrop, setImageSizeCrop] = useState({ width: 0, height: 0 })
  const cropContainerRef = useRef<HTMLDivElement>(null)

  // Video crop state - portrait ratio (percentages)
  const [videoCropBox, setVideoCropBox] = useState({ x: 10, y: 5, width: 60, height: 80 })
  const [isDraggingVideoCrop, setIsDraggingVideoCrop] = useState(false)
  const [isResizingVideoCrop, setIsResizingVideoCrop] = useState<string | null>(null)
  const [videoDragStart, setVideoDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [videoNaturalSize, setVideoNaturalSize] = useState({ width: 0, height: 0 })

  // Add button animation state
  const [addButtonClicked, setAddButtonClicked] = useState(false)
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null)

  /*
    REORDERING THE CARDS: components/onepage/link-reorder.ts moves them
    under the finger without React, and hands the result back here once,
    at the drop. Called above the early return, so it is always the same
    hooks in the same order. Each rule reads the page as it is now.
  */
  const reorderListRef = useRef<HTMLDivElement>(null)
  const [reorderMessage, setReorderMessage] = useState("")
  const blocksInOrder = () => [...(onepage?.draft_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  /* Under a Hero header the social icons stay below it, as they always had to. */
  const clampReorder = (id: string, to: number) => {
    const list = blocksInOrder()
    const moving = list.find((b) => b.id === id)
    if ((onepage?.theme as any)?.header_layout !== "hero" || moving?.type !== "social_row") return to
    const headerIndex = list.findIndex((b) => b.type === "header")
    if (headerIndex === -1) return to
    const from = list.findIndex((b) => b.id === id)
    return Math.max(to, from < headerIndex ? headerIndex : headerIndex + 1)
  }
  const writeReorder = (id: string, to: number) => {
    const list = blocksInOrder()
    const from = list.findIndex((b) => b.id === id)
    if (from < 0 || to === from) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    reorderBlocks(next.map((b, i) => ({ ...b, sort_order: i })))
  }
  const { onPointerDown: onReorderPointerDown } = useLinkReorder({
    listRef: reorderListRef,
    clampTarget: clampReorder,
    acceptsInto: (dragId, targetId) => {
      const list = blocksInOrder()
      const target = list.find((b) => b.id === targetId)
      const moving = list.find((b) => b.id === dragId)
      return target?.type === "group" && !!moving && moving.type !== "group" && moving.type !== "header" && moving.type !== "social_row"
    },
    onReorder: writeReorder,
    /* Into a group: it joins the group's own list and leaves this one. */
    onDropInto: (id, groupId) => {
      const list = blocksInOrder()
      const moving = list.find((b) => b.id === id)
      const group = list.find((b) => b.id === groupId)
      if (!moving || group?.type !== "group") return
      const groupData = group.data as GroupBlockData
      const children = groupData.children || []
      if (children.some((c) => c.id === id)) return
      updateBlock(groupId, { data: { ...groupData, children: [...children, { ...moving, sort_order: children.length }] } })
      removeBlock(id)
    },
  })
  /* The keyboard's way: an arrow on the grip moves the card one place, and a screen reader hears where it went. */
  const moveWithKeys = (e: React.KeyboardEvent, id: string, name: string) => {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0
    if (!dir) return
    e.preventDefault()
    const list = blocksInOrder()
    const from = list.findIndex((b) => b.id === id)
    const to = clampReorder(id, Math.max(0, Math.min(list.length - 1, from + dir)))
    if (from < 0 || to === from) return
    writeReorder(id, to)
    setReorderMessage(`${name}, position ${to + 1} of ${list.length}`)
    /* A card React moved can lose focus on the way; the grip gets it back. */
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-reorder-grip="${CSS.escape(id)}"]`)?.focus({ preventScroll: false }))
  }

  if (!onepage) return null

  const { draft_blocks, title, avatar_url, social_links } = onepage
  const sortedBlocks = [...draft_blocks].sort((a, b) => a.sort_order - b.sort_order)

  // Sync social_links to all social_row blocks for instant preview updates
  // Also runs when blocks change (new block added) to ensure immediate sync
  useEffect(() => {
    sortedBlocks.forEach(block => {
      if (block.type === "social_row") {
        const data = block.data as SocialRowBlockData
        const activeSocials = Object.entries(social_links || {})
          .filter(([_, url]) => url)
          .map(([platform, url]) => ({ platform: platform as keyof OnePageSocialLinks, url: url as string }))

        const currentPlatforms = new Set((data.platforms || []).map(p => p.platform))
        const activePlatformSet = new Set(activeSocials.map(s => s.platform))
        const hasNewPlatforms = activeSocials.some(s => !currentPlatforms.has(s.platform))
        const hasRemovedPlatforms = (data.platforms || []).some(p => !activePlatformSet.has(p.platform as keyof OnePageSocialLinks))

        // Also sync if platforms is empty but there are active social links
        const needsInitialSync = (data.platforms || []).length === 0 && activeSocials.length > 0

        if (hasNewPlatforms || hasRemovedPlatforms || needsInitialSync) {
          const existingOrder = (data.platforms || []).filter(p => social_links?.[p.platform as keyof typeof social_links])
          const existingPlatforms = new Set(existingOrder.map(p => p.platform))
          const newPlatforms = activeSocials.filter(s => !existingPlatforms.has(s.platform))

          updateBlock(block.id, {
            data: {
              ...block.data,
              platforms: [...existingOrder, ...newPlatforms]
            }
          })
        }
      }
    })
  }, [social_links, draft_blocks])

  // Auto-fetch thumbnail for social media links (Spotify, YouTube, etc.)
  const autoFetchThumbnail = useCallback(async (blockId: string, rawUrl: string) => {
    const url = normalizeUrlInput(rawUrl)
    if (!url) return

    /*
      A FETCH THAT COMES BACK LATE DOES NOT UNDO WHAT WAS TYPED MEANWHILE.
      Each answer used to write back the whole block as it was when the fetch
      began, so a label typed during it was lost, and an answer for an address
      since replaced landed on the new one. It now merges into the block as
      it is, only while the block still points at this address, and joins the
      edit that asked for it in undo.
    */
    const landFetched = (fields: (current: LinkButtonBlockData) => Partial<LinkButtonBlockData>) =>
      updateBlockData(
        blockId,
        (current) => (normalizeUrlInput((current as LinkButtonBlockData).url || "") === url ? fields(current as LinkButtonBlockData) : null),
        { joinLastStep: true },
      )

    // Skip if URL is empty or block already has a custom thumbnail
    const block = onepage?.draft_blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'link_button') return
    const data = block.data as LinkButtonBlockData
    if (data.thumbnail_url) return // Don't override user's custom thumbnail

    // Create a unique key for this URL to avoid duplicate fetches
    const fetchKey = `${blockId}:${url}`
    if (autoFetchedBlocksRef.current.has(fetchKey)) return
    autoFetchedBlocksRef.current.add(fetchKey)

    try {
      let thumbnailUrl: string | null = null

      // Spotify URL detection - fetch from our API for full metadata
      if (url.includes('spotify.com')) {
        try {
          const apiResponse = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(url)}`)
          if (apiResponse.ok) {
            const spotifyData = await apiResponse.json()
            thumbnailUrl = spotifyData.thumbnailUrl?.replace('ab67616d00001e02', 'ab67616d0000b273') || spotifyData.thumbnailUrl
            const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
            if (currentData) {
              landFetched((currentData) => ({
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  spotify_title: spotifyData.title || null,
                  spotify_artist: spotifyData.artistName || null,
                  spotify_type: spotifyData.type || null,
                  spotify_thumbnail: thumbnailUrl || null,
                  spotify_show_metadata: currentData.spotify_show_metadata !== false ? true : false
              }))
              return
            }
          }
        } catch {
          const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
          if (response.ok) {
            const data = await response.json()
            thumbnailUrl = data.thumbnail_url?.replace('ab67616d00001e02', 'ab67616d0000b273') || data.thumbnail_url
          }
        }
      }
      // YouTube URL detection
      else if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        let videoId: string | null = null
        if (url.includes('youtube.com/watch')) {
          const urlObj = new URL(url)
          videoId = urlObj.searchParams.get('v')
        } else if (url.includes('youtu.be/')) {
          const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
          videoId = match ? match[1] : null
        }
        if (videoId) {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        }
      }
      else if (url.includes('soundcloud.com/')) {
        try {
          const apiResponse = await fetch(`/api/onepage/soundcloud?url=${encodeURIComponent(url)}`)
          if (apiResponse.ok) {
            const soundcloudData = await apiResponse.json()
            thumbnailUrl = soundcloudData.thumbnailUrl
            const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
            if (currentData) {
              landFetched((currentData) => ({
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  soundcloud_title: soundcloudData.title || null,
                  soundcloud_artist: soundcloudData.artistName || null,
                  soundcloud_type: soundcloudData.type || null,
                  soundcloud_thumbnail: thumbnailUrl || null,
                  soundcloud_show_metadata: currentData.soundcloud_show_metadata !== false ? true : false
              }))
              return
            }
          }
        } catch {
          const response = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)
          if (response.ok) {
            const data = await response.json()
            thumbnailUrl = data.thumbnail_url
          }
        }
      }
      else if (url.includes('music.apple.com/')) {
        try {
          const apiResponse = await fetch(`/api/onepage/apple-music?url=${encodeURIComponent(url)}`)
          if (apiResponse.ok) {
            const appleMusicData = await apiResponse.json()
            thumbnailUrl = appleMusicData.thumbnailUrl
            const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
            if (currentData) {
              landFetched((currentData) => ({
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  apple_music_title: appleMusicData.title || null,
                  apple_music_artist: appleMusicData.artistName || null,
                  apple_music_type: appleMusicData.type || null,
                  apple_music_thumbnail: thumbnailUrl || null,
                  apple_music_show_metadata: currentData.apple_music_show_metadata !== false ? true : false,
                  apple_music_preview_url: appleMusicData.previewUrl || null,
                  apple_music_streaming_services: appleMusicData.streamingServices || []
              }))
              return
            }
          }
        } catch (e) {
          console.error('Apple Music fetch error:', e)
        }
      }
      else if (url.includes('vimeo.com/')) {
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)
        if (response.ok) {
          const data = await response.json()
          thumbnailUrl = data.thumbnail_url
        }
      }
      else if (url.includes('tiktok.com') && (url.includes('/video/') || url.includes('vm.tiktok.com'))) {
        try {
          const response = await fetch(`/api/onepage/tiktok?url=${encodeURIComponent(url)}`)
          if (response.ok) {
            const tiktokData = await response.json()
            thumbnailUrl = tiktokData.thumbnailUrl
            const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
            if (currentData) {
              const videoIdMatch = url.match(/video\/(\d+)/)
              const videoId = videoIdMatch ? videoIdMatch[1] : null
              landFetched((currentData) => ({
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  tiktok_video_id: videoId,
                  tiktok_embed_url: tiktokData.embedUrl || null,
                  tiktok_show_embed: true
              }))
              return
            }
          }
        } catch (e) {
          console.error('TikTok fetch error:', e)
        }
      }

      if (thumbnailUrl) {
        const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
        if (currentData) {
          landFetched((currentData) => ({
              url,
              thumbnail_url: thumbnailUrl,
              icon: null
              }))
        }
      }
    } catch (error) {
      console.error('Error auto-fetching thumbnail:', error)
    }
  }, [onepage?.draft_blocks, updateBlockData])

  // Handle URL change with auto-fetch
  const handleUrlChangeWithAutoFetch = useCallback((blockId: string, rawUrl: string) => {
    const normalizedUrl = normalizeUrlInput(rawUrl)
    const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
    if (currentData) {
      if (!normalizedUrl || normalizedUrl.length < 10) {
        updateBlockData(blockId, (currentData: any) => ({
            url: normalizedUrl,
            thumbnail_url: null,
            icon: null,
            spotify_title: null,
            spotify_artist: null,
            spotify_type: null,
            spotify_thumbnail: null,
            soundcloud_title: null,
            soundcloud_artist: null,
            soundcloud_type: null,
            soundcloud_thumbnail: null,
            apple_music_title: null,
            apple_music_artist: null,
            apple_music_type: null,
            apple_music_thumbnail: null,
            apple_music_preview_url: null,
            apple_music_streaming_services: [],
            tiktok_video_id: null,
            tiktok_embed_url: null,
            tiktok_show_embed: false
          }))
        return
      }

      const previousUrl = normalizeUrlInput(currentData.url || '')
      const wasSpotify = previousUrl.includes('spotify.com')
      const isSpotify = normalizedUrl.includes('spotify.com')
      const wasYouTube = previousUrl.includes('youtube.com') || previousUrl.includes('youtu.be')
      const isYouTube = normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')
      const wasSoundCloud = previousUrl.includes('soundcloud.com')
      const isSoundCloud = normalizedUrl.includes('soundcloud.com')
      const wasAppleMusic = previousUrl.includes('music.apple.com')
      const isAppleMusic = normalizedUrl.includes('music.apple.com')
      const wasTikTok = previousUrl.includes('tiktok.com')
      const isTikTok = normalizedUrl.includes('tiktok.com')

      const platformChanged = (wasSpotify !== isSpotify) || (wasYouTube !== isYouTube) || (wasSoundCloud !== isSoundCloud) || (wasAppleMusic !== isAppleMusic) || (wasTikTok !== isTikTok)

      if (platformChanged) {
        updateBlockData(blockId, (currentData: any) => ({
            url: normalizedUrl,
            thumbnail_url: null,
            icon: null,
            spotify_title: null,
            spotify_artist: null,
            spotify_type: null,
            spotify_thumbnail: null,
            soundcloud_title: null,
            soundcloud_artist: null,
            soundcloud_type: null,
            soundcloud_thumbnail: null,
            apple_music_title: null,
            apple_music_artist: null,
            apple_music_type: null,
            apple_music_thumbnail: null,
            apple_music_preview_url: null,
            apple_music_streaming_services: [],
            tiktok_video_id: null,
            tiktok_embed_url: null,
            tiktok_show_embed: false
          }))
      } else {
        updateBlockData(blockId, (currentData: any) => ({ url: normalizedUrl
          }))
      }
    }

    if (normalizedUrl.length > 10 && (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://') || normalizedUrl.includes('spotify.com') || normalizedUrl.includes('youtube.com') || normalizedUrl.includes('soundcloud.com') || normalizedUrl.includes('music.apple.com') || normalizedUrl.includes('tiktok.com'))) {
      const timeoutId = setTimeout(() => {
        autoFetchThumbnail(blockId, normalizedUrl)
      }, 220)
      return () => clearTimeout(timeoutId)
    }
  }, [autoFetchThumbnail, onepage?.draft_blocks, updateBlock, updateBlockData])

// Effect to ensure thumbnails are fetched for existing Spotify/YouTube URLs without thumbnails
  useEffect(() => {
    if (!onepage?.draft_blocks) return

    onepage.draft_blocks.forEach((block) => {
      if (block.type !== 'link_button') return
      const data = block.data as LinkButtonBlockData
      if (!data?.url) return

      // Skip if user has set a custom icon (not auto-fetched)
      if (data.icon) return

      const normalizedUrl = normalizeUrlInput(data.url || '')
      const isSpotify = normalizedUrl.includes('spotify.com')
      const isYouTube = normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')
      const isSoundCloud = normalizedUrl.includes('soundcloud.com')
      const isAppleMusic = normalizedUrl.includes('music.apple.com')

      // If it's a Spotify URL without thumbnail/metadata, fetch it
      if (isSpotify && !data.thumbnail_url && !data.spotify_title) {
        autoFetchThumbnail(block.id, data.url)
      }
      // If it's a YouTube URL without thumbnail, fetch it
      else if (isYouTube && !data.thumbnail_url) {
        autoFetchThumbnail(block.id, data.url)
      }
      // If it's a SoundCloud URL without thumbnail/metadata, fetch it
      else if (isSoundCloud && !data.thumbnail_url && !data.soundcloud_title) {
        autoFetchThumbnail(block.id, data.url)
      }
      // If it's an Apple Music URL without thumbnail/metadata, fetch it
      else if (isAppleMusic && !data.thumbnail_url && !data.apple_music_title) {
        autoFetchThumbnail(block.id, data.url)
      }
    })
  }, []) // Run once on mount

  // Background interval: silently re-fetch thumbnails for Spotify/Apple Music blocks missing them
  useEffect(() => {
    const interval = setInterval(() => {
      if (!onepage?.draft_blocks) return

      onepage.draft_blocks.forEach((block) => {
        if (block.type !== 'link_button') return
        const data = block.data as LinkButtonBlockData
        if (!data?.url) return

        const url = normalizeUrlInput(data.url)
        const isSpotify = url.includes('spotify.com')
        const isAppleMusic = url.includes('music.apple.com')

        if (isSpotify && !data.thumbnail_url && !data.spotify_thumbnail) {
          // Clear the fetch key so autoFetchThumbnail can retry
          const fetchKey = `${block.id}:${url}`
          autoFetchedBlocksRef.current.delete(fetchKey)
          autoFetchThumbnail(block.id, data.url)
        } else if (isAppleMusic && !data.thumbnail_url && !data.apple_music_thumbnail) {
          const fetchKey = `${block.id}:${url}`
          autoFetchedBlocksRef.current.delete(fetchKey)
          autoFetchThumbnail(block.id, data.url)
        }
      })
    }, 4000)

    return () => clearInterval(interval)
  }, [onepage?.draft_blocks, autoFetchThumbnail])

  // Handle thumbnail upload for modal
  const handleThumbnailUploadForModal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !thumbnailBlockId) return

    setThumbnailUploading(true)
    try {
      const supabase = createClient()
      const fileExt = file.name.split('.').pop()
      /* Under the owner's own folder: storage only lets a person write there. */
      const ownerId = (await supabase.auth.getSession()).data.session?.user.id
      if (!ownerId) throw new Error('Not signed in')
      const fileName = `${ownerId}/thumbnail_${thumbnailBlockId}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('onepage-assets')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('onepage-assets')
        .getPublicUrl(fileName)

      const block = onepage.draft_blocks.find(b => b.id === thumbnailBlockId)
      if (block?.type === 'product') {
        // For product blocks, use custom_thumbnail
        updateBlock(thumbnailBlockId, {
          data: {
            ...block.data,
            custom_thumbnail: publicUrl
          }
        })
      } else {
        // For link_button blocks, use thumbnail_url
        updateBlock(thumbnailBlockId, {
          data: {
            ...block?.data,
            thumbnail_url: publicUrl,
            icon: null
          }
        })
      }
      setShowThumbnailModal(false)
      setShowIconLibraryInModal(false)
    } catch (error) {
      console.error('Error uploading thumbnail:', error)
    } finally {
      setThumbnailUploading(false)
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = ''
      }
    }
  }

  // Get thumbnail block data
  const getThumbnailBlockData = () => {
    if (!thumbnailBlockId) return null
    const block = onepage.draft_blocks.find(b => b.id === thumbnailBlockId)
    if (!block) return null
    if (block.type === 'link_button') return block.data as LinkButtonBlockData
    if (block.type === 'product') return block.data as ProductBlockData
    return null
  }

  // Get the block type for thumbnail modal
  const getThumbnailBlockType = () => {
    if (!thumbnailBlockId) return null
    const block = onepage.draft_blocks.find(b => b.id === thumbnailBlockId)
    return block?.type || null
  }

  // Check if a block type has reached its limit
  const getBlockTypeCount = (type: OnePageBlockType) => {
    return onepage.draft_blocks.filter(b => b.type === type).length
  }

  const isBlockTypeAtLimit = (type: OnePageBlockType): boolean => {
    // Social Icons (social_row) can only be added 2 times max
    if (type === "social_row") {
      return getBlockTypeCount("social_row") >= 2
    }
    return false
  }

  const closeAddSheet = () => {
    if (!showAddModal) return

    if (!isMobileModalViewport) {
      setShowAddModal(false)
      setSearchQuery("")
      setInsertAfterId(null)
      setAddToGroupId(null)
      return
    }

    setIsAddSheetDragging(false)
    setAddSheetDragY(0)
    setIsAddSheetPresented(false)

    if (addSheetCloseTimerRef.current) clearTimeout(addSheetCloseTimerRef.current)
    addSheetCloseTimerRef.current = setTimeout(() => {
      setShowAddModal(false)
      setSearchQuery("")
      setInsertAfterId(null)
      setAddToGroupId(null)
    }, SHEET_SLIDE_MS)
  }

  const closeSocialSheet = () => {
    if (!showSocialModal) return

    if (!isMobileModalViewport) {
      setShowSocialModal(false)
      setSelectedSocial(null)
      setSocialUrl("")
      setSearchQuery("")
      setSocialUrlError(null)
      return
    }

    setIsSocialSheetDragging(false)
    setSocialSheetDragY(0)
    setIsSocialSheetPresented(false)

    if (socialSheetCloseTimerRef.current) clearTimeout(socialSheetCloseTimerRef.current)
    socialSheetCloseTimerRef.current = setTimeout(() => {
      setShowSocialModal(false)
      setSelectedSocial(null)
      setSocialUrl("")
      setSearchQuery("")
      setSocialUrlError(null)
    }, SHEET_SLIDE_MS)
  }

  const closeThumbnailSheet = () => {
    if (!showThumbnailModal) return

    if (!isMobileModalViewport) {
      setShowThumbnailModal(false)
      setShowIconLibraryInModal(false)
      setIconSearchQuery("")
      setIconCategory("all")
      return
    }

    setIsThumbnailSheetDragging(false)
    setThumbnailSheetDragY(0)
    setIsThumbnailSheetPresented(false)

    if (thumbnailSheetCloseTimerRef.current) clearTimeout(thumbnailSheetCloseTimerRef.current)
    thumbnailSheetCloseTimerRef.current = setTimeout(() => {
      setShowThumbnailModal(false)
      setShowIconLibraryInModal(false)
      setIconSearchQuery("")
      setIconCategory("all")
    }, SHEET_SLIDE_MS)
  }

  const focusAndScrollToBlock = (blockId: string) => {
    setSelectedBlockId(blockId)
    requestAnimationFrame(() => {
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null
      if (!blockEl) return
      blockEl.scrollIntoView({ behavior: "smooth", block: "center" })
      const clickable = blockEl.querySelector("button, [role='button']") as HTMLElement | null
      clickable?.focus?.({ preventScroll: true })
    })
  }

  const handleAddBlock = (type: OnePageBlockType, preset?: { label: string; url: string }) => {
    // If adding to a group, handle differently
    if (addToGroupId) {
      // Don't allow adding these types to a group
      if (type === "header" || type === "group" || type === "social_row" || type === "product" || type === "email_capture" || type === "text" || type === "divider" || EXTRA_BLOCK_TYPES.includes(type as ExtraBlockType)) {
        closeAddSheet()
        return
      }

      const groupBlock = sortedBlocks.find(b => b.id === addToGroupId)
      if (groupBlock && groupBlock.type === "group") {
        const groupData = groupBlock.data as GroupBlockData
        // Use createDefaultBlock to get proper default data for any block type
        const newBlock = createDefaultBlock(type)
        newBlock.sort_order = groupData.children?.length || 0

        // Override Image block defaults when added to a Group (use single instead of carousel)
        if (type === "image") {
          (newBlock.data as ImageBlockData).display_style = "single"
          ;(newBlock.data as ImageBlockData).carousel_autoplay = false
        }

        // Apply preset if provided (for link_button presets)
        if (preset && type === "link_button") {
          // Determine default icon based on preset URL
          let defaultIcon: string | null = null
          if (preset.url.includes('instagram.com')) defaultIcon = 'instagram'
          else if (preset.url.includes('x.com') || preset.url.includes('twitter.com')) defaultIcon = 'twitter'
          else if (preset.url.includes('tiktok.com')) defaultIcon = 'tiktok'
          else if (preset.url.includes('facebook.com')) defaultIcon = 'facebook'
          else if (preset.url.includes('linkedin.com')) defaultIcon = 'linkedin'
          else if (preset.url.includes('youtube.com')) defaultIcon = 'youtube'
          else if (preset.url.includes('threads.net')) defaultIcon = 'threads'
          else if (preset.url.includes('spotify.com')) defaultIcon = 'spotify'
          else if (preset.url.includes('music.apple.com')) defaultIcon = 'apple-music'
          else if (preset.url.includes('wa.me') || preset.url.includes('whatsapp.com')) defaultIcon = 'whatsapp'
          else if (preset.url.includes('t.me') || preset.url.includes('telegram.')) defaultIcon = 'telegram'
          else if (preset.url.includes('vimeo.com')) defaultIcon = 'vimeo'
          else if (preset.url.includes('discord.gg') || preset.url.includes('discord.com')) defaultIcon = 'discord'

          (newBlock.data as LinkButtonBlockData).label = preset.label
          ;(newBlock.data as LinkButtonBlockData).url = preset.url
          ;(newBlock.data as LinkButtonBlockData).icon = defaultIcon
        }

        const newChildren = [...(groupData.children || []), newBlock]
        updateBlock(addToGroupId, { data: { ...groupData, children: newChildren } })
      }
      closeAddSheet()
      focusAndScrollToBlock(addToGroupId)
      setShowAddBlockNotification(false)
      requestAnimationFrame(() => setShowAddBlockNotification(true))
      return
    }

    // Check if block type is at its limit
    if (isBlockTypeAtLimit(type)) {
      return // Don't add the block
    }

    const newBlock = addBlock(type, insertAfterId || undefined)
    if (preset && newBlock) {
      // Determine default icon based on preset URL
      let defaultIcon: string | null = null
      if (preset.url.includes('instagram.com')) defaultIcon = 'instagram'
      else if (preset.url.includes('x.com') || preset.url.includes('twitter.com')) defaultIcon = 'twitter'
      else if (preset.url.includes('tiktok.com')) defaultIcon = 'tiktok'
      else if (preset.url.includes('facebook.com')) defaultIcon = 'facebook'
      else if (preset.url.includes('linkedin.com')) defaultIcon = 'linkedin'
      else if (preset.url.includes('youtube.com')) defaultIcon = 'youtube'
      else if (preset.url.includes('threads.net')) defaultIcon = 'threads'
      else if (preset.url.includes('spotify.com')) defaultIcon = 'spotify'
      else if (preset.url.includes('music.apple.com')) defaultIcon = 'apple-music'
      else if (preset.url.includes('wa.me') || preset.url.includes('whatsapp.com')) defaultIcon = 'whatsapp'
      else if (preset.url.includes('t.me') || preset.url.includes('telegram.')) defaultIcon = 'telegram'
      else if (preset.url.includes('vimeo.com')) defaultIcon = 'vimeo'
      else if (preset.url.includes('discord.gg') || preset.url.includes('discord.com')) defaultIcon = 'discord'

      updateBlock(newBlock.id, {
        data: {
          ...newBlock.data,
          label: preset.label,
          url: preset.url,
          icon: defaultIcon
        }
      })
    }
    closeAddSheet()
    if (newBlock?.id) focusAndScrollToBlock(newBlock.id)
    setShowAddBlockNotification(false)
    requestAnimationFrame(() => setShowAddBlockNotification(true))
  }

  // Handler to move a child block from a group back to the main blocks list
  const handleMoveChildToMainList = (childBlock: OnePageBlock, groupId: string) => {
    // Find the group block's index to insert the child after it
    const groupIndex = sortedBlocks.findIndex(b => b.id === groupId)

    // Create a new block with updated sort_order
    const newBlock = {
      ...childBlock,
      sort_order: groupIndex + 1, // Insert right after the group
    }

    // Get current blocks and insert the child after the group
    const newBlocks = [...sortedBlocks]
    newBlocks.splice(groupIndex + 1, 0, newBlock)

    // Update sort orders for all blocks
    newBlocks.forEach((b, i) => {
      b.sort_order = i
    })

    reorderBlocks(newBlocks)
  }

  const handleAddSocial = () => {
    if (!selectedSocial || !socialUrl) return

    // Validate the URL
    const validation = validateSocialUrl(selectedSocial, socialUrl)

    if (!validation.valid) {
      setSocialUrlError(validation.error || "Invalid URL")
      return
    }

    // Use transformed URL if available
    const urlToSave = validation.transformedUrl || socialUrl

    updateSocialLinks({ [selectedSocial]: urlToSave } as Partial<OnePageSocialLinks>)
    setSelectedSocial(null)
    setSocialUrl("")
    setSocialUrlError(null)
    closeSocialSheet()
  }

  const handleRemoveSocial = (platform: string) => {
    updateSocialLinks({ [platform]: null } as Partial<OnePageSocialLinks>)
  }


  const filteredCategories = searchQuery
    ? blockCategories.map((cat) => ({
        ...cat,
        blocks: cat.blocks.filter((b) =>
          b.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((cat) => cat.blocks.length > 0)
    : blockCategories

  // Check if header block already exists (only allow one)
  const hasHeaderBlock = sortedBlocks.some(b => b.type === "header")

  // Block types that can't be added to a group
  const blockedInGroup = ["header", "group", "social_row", "product", "email_capture", "text", "divider", "heading", "faq", "countdown", "map", "video"]

  const activeCategoryBlocks = (searchQuery
    ? filteredCategories.flatMap(c => c.blocks)
    : blockCategories.find((c) => c.id === addModalCategory)?.blocks || []
  ).filter(block => {
    // Always filter out header if one exists
    if (block.type === "header" && hasHeaderBlock) return false
    // Filter out blocks that can't be added to groups when adding to a group
    if (addToGroupId && blockedInGroup.includes(block.type)) return false
    return true
  })

  // Get active social links
  const activeSocials = Object.entries(social_links || {}).filter(([_, url]) => url)

  return (
    <div className="space-y-6" data-scroll-container="links-tab" style={{ touchAction: "manipulation" }}>
      {/* Profile Header with Real SVG Icons */}
      <div className="flex items-center gap-4 pt-[8px] sm:pt-0 pb-5 border-b">
        <div className="relative group cursor-pointer" onClick={() => setShowAvatarEditModal(true)}>
          <div className="h-14 w-14 border overflow-hidden rounded-full relative bg-gray-100">
            {onepage.avatar_video_url ? (
              <>
                {avatar_url ? (
                  <img src={avatar_url} alt={title || 'Avatar'} className="absolute inset-0 w-full h-full object-cover scale-105 blur-[2px]" />
                ) : (
                  <div className="absolute inset-0 bg-gray-200 animate-pulse" />
                )}
                <video
                  src={onepage.avatar_video_url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="relative z-[1] w-full h-full object-cover opacity-0 transition-all duration-500"
                  onLoadedData={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                  onCanPlay={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                  onPlaying={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                />
              </>
            ) : avatar_url ? (
              <img src={avatar_url} alt={title || 'Avatar'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">{title?.charAt(0) || "?"}</div>
            )}
          </div>
          <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Pencil className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => {
              setEditName(title || "")
              setEditBio(onepage.bio || "")
              setShowNameBioModal(true)
            }}
            className="text-left group flex items-center gap-1.5 hover:opacity-70 transition-opacity cursor-pointer"
    >
            <h2 className="font-semibold">{title || "Your Name"}</h2>
            <Pencil className="h-3 w-3 text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity" />
          </button>
          {onepage.bio ? (
            <button
              onClick={() => {
                setEditName(title || "")
                setEditBio(onepage.bio || "")
                setShowNameBioModal(true)
              }}
              className="text-left mt-0.5 hover:opacity-70 transition-opacity cursor-pointer"
            >
              <p className="text-sm text-muted-foreground line-clamp-2">{onepage.bio}</p>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditName(title || "")
                setEditBio("")
                setShowNameBioModal(true)
              }}
              className="text-left mt-0.5 hover:opacity-70 transition-opacity cursor-pointer"
            >
              <p className="text-sm text-gray-400 italic">Add your bio...</p>
            </button>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {activeSocials.slice(0, 5).map(([platform]) => {
              const config = SOCIAL_PLATFORMS.find(p => p.id === platform)
              return (
                <div
                  key={platform}
                  className="relative group/social"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: config?.color || "#6366F1" }}
                    onClick={() => {
                      setSelectedSocial(platform)
                      setSocialUrl(social_links?.[platform as keyof typeof social_links] || "")
                      setIsSocialSheetPresented(false)
                      setShowSocialModal(sheetOpening(socialSheetCloseTimerRef, showSocialModal, setIsSocialSheetPresented))
                    }}
                  >
                    <SocialIcon platform={platform} size={14} color={markOn(config?.color || "#6366F1")} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSocialLinks({ [platform]: null } as Partial<OnePageSocialLinks>)
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-800 text-white flex items-center justify-center opacity-0 group-hover/social:opacity-100 transition-opacity hover:bg-gray-900 cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
            <button
              onClick={() => {
                setIsSocialSheetPresented(false)
                setShowSocialModal(sheetOpening(socialSheetCloseTimerRef, showSocialModal, setIsSocialSheetPresented))
              }}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <button
        onClick={() => {
          setInsertAfterId(null)
          setAddButtonClicked(true)
          setTimeout(() => setAddButtonClicked(false), 300)
          setIsAddSheetPresented(false)
          setShowAddModal(sheetOpening(addSheetCloseTimerRef, showAddModal, setIsAddSheetPresented))
        }}
        /* The page's one primary action: the app's near black, with its line of light and its press (depth-button). */
        className={cn(primaryDepth, "group h-11 w-full gap-2 rounded-xl text-[15px]")}
      >
        <Plus
          className={cn(
            "h-5 w-5 transition-transform duration-300 ease-out group-hover:rotate-90",
            addButtonClicked && "rotate-180"
          )}
        />
        Add
      </button>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 cursor-pointer"
          onClick={() => {
            const newGroup = addBlock("group", undefined)
            if (newGroup) {
              setSelectedBlockId(newGroup.id)
            }
          }}
        >
          <Layers className="h-3 w-3 mr-1" />
          Add Group
        </Button>
        <Button
          variant={showArchiveView ? "default" : "outline"}
          size="sm"
          className={cn(
            "text-xs h-8 cursor-pointer",
            showArchiveView && "bg-[#1a1a2e] hover:bg-[#2a2a40] text-white"
          )}
          onClick={() => setShowArchiveView(!showArchiveView)}
        >
          <Archive className="h-3 w-3 mr-1" />
          {showArchiveView ? "Back to links" : "View archive"}
          {archivedBlocks.length > 0 && !showArchiveView && (
            <span className="ml-1.5 bg-gray-200 text-gray-600 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full">{archivedBlocks.length}</span>
          )}
        </Button>
      </div>

      {/* Archive View */}
      {showArchiveView && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Archived Blocks</h3>
            <span className="text-xs text-muted-foreground">{archivedBlocks.length} items</span>
          </div>
          {archivedBlocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No archived blocks</p>
              <p className="text-xs mt-1">Archived blocks will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedBlocks.map((block) => {
                const preview = getBlockPreviewData(block)
                return (
                  <div key={block.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border">
                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center shrink-0">
                      <preview.icon className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{preview.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{preview.subtitle}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unarchiveBlock(block.id)}
                      className="h-8 text-xs shrink-0"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* The cards. Each one is picked up and moved by link-reorder.ts; the list only says which are cards. */}
      {!showArchiveView && (
      <div ref={reorderListRef} onPointerDown={onReorderPointerDown} className="group/list flex flex-col gap-2" data-reorder-list="">
        <p id="onepage-reorder-help" className="sr-only">Drag the grip, or hold a card, to move it. With the keyboard, the up and down arrows move it one place.</p>
        <p className="sr-only" aria-live="polite">{reorderMessage}</p>
        {sortedBlocks.map((block, index) => (
          <React.Fragment key={block.id}>
            <div
              data-block-id={block.id}
              data-reorder-item=""
              data-reorder-fixed={block.type === "header" ? "" : undefined}
              className="group/card relative rounded-xl"
            >
              {/* The depth a lifted card has: a soft shadow on its own layer, faded in by opacity. */}
              <span aria-hidden data-lift-shadow="" className="pointer-events-none absolute inset-0 rounded-xl opacity-0 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_12px_28px_-8px_rgba(16,24,40,0.22)] transition-opacity duration-200 ease-out" />
              {block.type === "group" ? (
                /* A card held over the middle of a group goes into it: said here, in ink, not a violet wash. */
                <span aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70 opacity-0 shadow-[inset_0_0_0_1.5px_#1a1a2e] transition-opacity duration-150 group-data-[drop-into]/card:opacity-100">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#1a1a2e] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_2px_8px_rgba(16,24,40,0.2)]">
                    <Plus className="h-3.5 w-3.5" />
                    Drop to add to group
                  </span>
                </span>
              ) : null}
              <BlockItem
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => {
                  const isDeselecting = selectedBlockId === block.id
                  setSelectedBlockId(isDeselecting ? null : block.id)
                  // When opening (not closing) a block, scroll it into view
                  // after the editor panel has expanded (next two frames).
                  if (!isDeselecting) {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement | null
                      if (!el) return
                      // Find the nearest scrollable ancestor
                      let scrollParent: HTMLElement | null = el.parentElement
                      while (scrollParent && scrollParent !== document.documentElement) {
                        const style = window.getComputedStyle(scrollParent)
                        if ((style.overflowY === "auto" || style.overflowY === "scroll") && scrollParent.scrollHeight > scrollParent.clientHeight) break
                        scrollParent = scrollParent.parentElement
                      }
                      if (!scrollParent || scrollParent === document.documentElement) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" })
                        return
                      }
                      // Scroll so the block's top is near the top of the visible area
                      // with a small offset (header clearance)
                      const elRect = el.getBoundingClientRect()
                      const parentRect = scrollParent.getBoundingClientRect()
                      const offset = 12 // breathing room from top
                      const targetScrollTop = scrollParent.scrollTop + (elRect.top - parentRect.top) - offset
                      scrollParent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" })
                    }))
                  }
                }}
                onRemove={() => { removeBlock(block.id); setShowBlockRemovedNotification(false); requestAnimationFrame(() => setShowBlockRemovedNotification(true)) }}
                onArchive={() => { archiveBlock(block.id); setShowBlockArchivedNotification(false); requestAnimationFrame(() => setShowBlockArchivedNotification(true)) }}
                onMoveUp={() => {
                  // Prevent social_row from moving above header when Hero layout
                  const headerLayout = (onepage.theme as any)?.header_layout || "classic"
                  if (headerLayout === "hero" && block.type === "social_row") {
                    const headerIndex = sortedBlocks.findIndex(b => b.type === "header")
                    if (headerIndex !== -1 && index <= headerIndex + 1) {
                      return // Block the move if it would place social_row above or at header
                    }
                  }
                  moveBlockUp(block.id)
                }}
                onMoveDown={() => moveBlockDown(block.id)}
                onToggle={() => toggleBlockEnabled(block.id)}
                isFirst={index === 0 || (block.type === "social_row" && (onepage.theme as any)?.header_layout === "hero" && index === sortedBlocks.findIndex(b => b.type === "header") + 1)}
                isLast={index === sortedBlocks.length - 1}
                socialLinks={social_links}
                onOpenImageLibrary={(blockId, fieldType) => { setImageBlockId(blockId); setImageFieldType(fieldType || null); setShowImageLibrary(true) }}
                onOpenSocialModal={() => {
                  setIsSocialSheetPresented(false)
                  setShowSocialModal(sheetOpening(socialSheetCloseTimerRef, showSocialModal, setIsSocialSheetPresented))
                }}
                onOpenThumbnailModal={(blockId) => { setThumbnailBlockId(blockId); setShowThumbnailModal(sheetOpening(thumbnailSheetCloseTimerRef, showThumbnailModal, setIsThumbnailSheetPresented)); setShowIconLibraryInModal(false) }}
                onUrlChangeWithAutoFetch={handleUrlChangeWithAutoFetch}
                onOpenStreamingModal={(platform, index, data, updateFn) => {
                  setStreamingPlatform(platform)
                  setStreamingPlatformIndex(index)
                  // Pre-populate URL if editing existing service
                  const existingService = data.streaming_services?.find(s => s.platform === platform)
                  setStreamingUrl(existingService?.url || "")
                  setStreamingUrlError(null)
                  setStreamingBlockData(data)
                  setStreamingBlockUpdateFn(() => updateFn)
                  setShowStreamingUrlModal(true)
                }}
                onGripKeyDown={(e, name) => moveWithKeys(e, block.id, name)}
                onMoveChildToMainList={handleMoveChildToMainList}
                onOpenAddBlockModal={(groupId) => {
                  setAddToGroupId(groupId)
                  setIsAddSheetPresented(false)
                  setShowAddModal(sheetOpening(addSheetCloseTimerRef, showAddModal, setIsAddSheetPresented))
                }}
              />
            </div>

            {index < sortedBlocks.length - 1 && (
              <div className="relative h-0 -mx-1 group/add-divider group-data-[reordering]/list:invisible">
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterId(block.id)
                    setIsAddSheetPresented(false)
                    setShowAddModal(sheetOpening(addSheetCloseTimerRef, showAddModal, setIsAddSheetPresented))
                  }}
                  className="absolute inset-x-0 -top-4 -bottom-4 flex items-center justify-center px-1 focus:outline-none"
                  tabIndex={0}
                  aria-label="Add block here"
                >
                  <span className="absolute inset-x-2 h-px bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:translate-y-[0.5px] group-focus-within/add-divider:translate-y-[0.5px]" />
                  <span className="absolute inset-x-3 h-px bg-gray-200 rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:-translate-y-[0.5px] group-focus-within/add-divider:-translate-y-[0.5px]" />
                  <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 text-[#1a1a2e] shadow-sm transition-all duration-200 ease-out opacity-0 scale-90 group-hover/add-divider:opacity-100 group-hover/add-divider:shadow-lg group-hover/add-divider:scale-105 group-focus-within/add-divider:opacity-100 group-focus-within/add-divider:shadow-lg group-focus-within/add-divider:scale-105">
                    <Plus className="h-4 w-4 transition-transform duration-200 ease-out group-hover/add-divider:rotate-90 group-focus-within/add-divider:rotate-90" />
                  </span>
                </button>
              </div>
            )}
          </React.Fragment>
        ))}

        {sortedBlocks.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-xl bg-gray-50/50">
            <Link className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-muted-foreground">No links yet</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Add" to get started</p>
          </div>
        )}
      </div>
      )}

      {/* Add Block Modal - Linktree style without sidebar */}
      <Dialog open={showAddModal} onOpenChange={(open) => {
        if (open) {
          setIsAddSheetPresented(false)
          setShowAddModal(sheetOpening(addSheetCloseTimerRef, showAddModal, setIsAddSheetPresented))
          return
        }
        closeAddSheet()
      }}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          showCloseButton
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isAddSheetPresented ? "opacity-100" : "opacity-0") : undefined}
          onTouchStart={(e) => {
            if (!isMobileModalViewport) return
            const touchY = e.touches[0]?.clientY ?? 0
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            if (touchY - bounds.top <= 72) {
              addSheetStartYRef.current = touchY
              addSheetLastYRef.current = touchY
              addSheetLastTimeRef.current = Date.now()
              addSheetVelocityRef.current = 0
              setIsAddSheetDragging(true)
            }
          }}
          onTouchMove={(e) => {
            if (!isMobileModalViewport || !isAddSheetDragging) return
            const currentY = e.touches[0]?.clientY ?? 0
            const diff = currentY - addSheetStartYRef.current
            if (diff > 0) {
              e.preventDefault()
              const now = Date.now()
              const dt = Math.max(1, now - addSheetLastTimeRef.current)
              addSheetVelocityRef.current = (currentY - addSheetLastYRef.current) / dt
              addSheetLastYRef.current = currentY
              addSheetLastTimeRef.current = now

              const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
              setAddSheetDragY(resisted)
            }
          }}
          onTouchEnd={() => {
            if (!isMobileModalViewport || !isAddSheetDragging) return
            setIsAddSheetDragging(false)
            if (addSheetDragY > 92 || addSheetVelocityRef.current > 0.55) {
              closeAddSheet()
              return
            }
            setAddSheetDragY(0)
          }}
          className={cn(
            "h-auto p-0 gap-0 overflow-hidden mx-auto flex flex-col border-[#ececf1]",
            isMobileModalViewport
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
              : "w-[calc(100%-24px)] max-w-[520px] max-h-[85vh] sm:max-h-[min(680px,85vh)] rounded-2xl"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            ...sheetAboveKeyboard(0.75),
            transform: isAddSheetPresented ? `translate3d(0, ${addSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
            willChange: 'transform',
            backfaceVisibility: 'hidden' as const,
            transition: isAddSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          } : undefined}
        >
          {isMobileModalViewport && (
            <div className="pt-3 pb-2 flex justify-center cursor-pointer" data-sheet-handle>
              <div className="h-1.5 w-10 rounded-full bg-gray-300" />
            </div>
          )}
          {/* Header with title and close button */}
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 bg-white shrink-0 border-b border-gray-100">
            <DialogTitle className="text-lg sm:text-xl font-semibold">
              {addToGroupId ? "Add to Group" : "Add Block"}
            </DialogTitle>
            {addToGroupId && (
              <p className="text-xs text-muted-foreground mt-1">
                Adding block to group. Some block types are not available.
              </p>
            )}
          </DialogHeader>

          {/* Search */}
          <div className="px-4 sm:px-6 pb-4 bg-white shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search platforms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 sm:h-11 bg-gray-50 border-gray-200 focus:border-gray-400 rounded-xl text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-5 overscroll-contain">
            {/* Quick action buttons - horizontal row */}
            {!searchQuery && !addToGroupId && (
              <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-5">
                {[
                  { label: "Group", icon: Grid3X3, type: "group" as const },
                  { label: "Link", icon: Link, type: "link_button" as const },
                  { label: "Product", icon: ShoppingBag, type: "product" as const },
                  { label: "Form", icon: Mail, type: "email_capture" as const },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      onClick={() => handleAddBlock(item.type)}
                      className="flex flex-col items-center justify-center gap-1 sm:gap-2 p-2.5 sm:p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors aspect-square sm:aspect-auto cursor-pointer"
                    >
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-700" />
                      <span className="text-[11px] sm:text-sm font-medium text-gray-900">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Quick action buttons for group - simplified */}
            {!searchQuery && addToGroupId && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5">
                {[
                  { label: "Link", icon: Link, type: "link_button" as const },
                  { label: "Image", icon: ImageIcon, type: "image" as const },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      onClick={() => handleAddBlock(item.type)}
                      className="flex flex-col items-center justify-center gap-1 sm:gap-2 p-2.5 sm:p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-700" />
                      <span className="text-[11px] sm:text-sm font-medium text-gray-900">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Categories with blocks - vertical scrolling list */}
            {!searchQuery ? (
              <div className="space-y-5">
                {blockCategories
                  .filter(cat => {
                    // Filter out categories with no allowed blocks when adding to group
                    if (addToGroupId) {
                      const allowedTypes = ["link_button", "image"]
                      return cat.blocks.some(b => allowedTypes.includes(b.type))
                    }
                    return true
                  })
                  .map((category) => {
                    // Filter blocks for group if needed
                    const blocksToShow = addToGroupId
                      ? category.blocks.filter(b => ["link_button", "image"].includes(b.type))
                      : category.blocks

                    if (blocksToShow.length === 0) return null

                    return (
                      <div key={category.id}>
                        {/* Category title */}
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">
                          {category.label}
                        </p>

                        {/* Blocks in category */}
                        <div className="space-y-0.5">
                          {blocksToShow.map((block, idx) => {
                            const Icon = block.icon
                            const socialId = block.label.toLowerCase().replace(/[^a-z]/g, "").replace("xtwitter", "twitter")
                            const hasSocialIcon = ["instagram", "tiktok", "youtube", "twitter", "spotify", "facebook", "linkedin", "threads", "soundcloud", "applemusic", "whatsapp", "telegram", "discord", "calendly"].includes(socialId)
                            const atLimit = isBlockTypeAtLimit(block.type)
                            const currentCount = getBlockTypeCount(block.type)
                            const isComingSoon = (block as any).comingSoon === true

                            return (
                              <button
                                key={`${category.id}-${block.type}-${block.label}-${idx}`}
                                onClick={() => !atLimit && !isComingSoon && handleAddBlock(block.type, (block as any).preset)}
                                disabled={atLimit || isComingSoon}
                                className={cn(
                                  "w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-colors text-left group",
                                  (atLimit || isComingSoon)
                                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                                  : "hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                                )}
                              >
                                <div
                                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                                  style={{
                                    backgroundColor: hasSocialIcon
                                      ? SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color + "15"
                                      : "#f3f4f6"
                                  }}
                                >
                                  {hasSocialIcon ? (
                                    <SocialIcon
                                      platform={socialId}
                                      size={18}
                                      color={SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color}
                                    />
                                  ) : (
                                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm text-gray-900">{block.label}</p>
                                  <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                                    {atLimit ? `Already added (${currentCount}/2)` : block.description}
                                  </p>
                                </div>
                                {isComingSoon ? (
                                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">Coming Soon</span>
                                ) : atLimit ? (
                                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">Added</span>
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              /* Search results */
              <div className="space-y-0.5">
                {activeCategoryBlocks.length > 0 ? (
                  activeCategoryBlocks.map((block, idx) => {
                    const Icon = block.icon
                    const socialId = block.label.toLowerCase().replace(/[^a-z]/g, "").replace("xtwitter", "twitter")
                    const hasSocialIcon = ["instagram", "tiktok", "youtube", "twitter", "spotify", "facebook", "linkedin", "threads", "soundcloud", "applemusic", "whatsapp", "telegram", "discord", "calendly"].includes(socialId)
                    const atLimit = isBlockTypeAtLimit(block.type)
                    const currentCount = getBlockTypeCount(block.type)
                    const isComingSoon = (block as any).comingSoon === true

                    return (
                      <button
                        key={`search-${block.type}-${block.label}-${idx}`}
                        onClick={() => !atLimit && !isComingSoon && handleAddBlock(block.type, (block as any).preset)}
                        disabled={atLimit || isComingSoon}
                        className={cn(
                          "w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-colors text-left group",
                          (atLimit || isComingSoon)
                            ? "opacity-50 cursor-not-allowed bg-gray-50"
                            : "hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                        )}
                      >
                        <div
                          className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                          style={{
                            backgroundColor: hasSocialIcon
                              ? SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color + "15"
                              : "#f3f4f6"
                          }}
                        >
                          {hasSocialIcon ? (
                            <SocialIcon
                              platform={socialId}
                              size={18}
                              color={SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color}
                            />
                          ) : (
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900">{block.label}</p>
                          <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                            {atLimit ? `Already added (${currentCount}/2)` : block.description}
                          </p>
                        </div>
                        {isComingSoon ? (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">Coming Soon</span>
                        ) : atLimit ? (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">Added</span>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">No results found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Social Links Modal - Modern Scrollable Vertical List */}
      <Dialog open={showSocialModal} onOpenChange={(open) => {
        if (open) {
          setIsSocialSheetPresented(false)
          setShowSocialModal(sheetOpening(socialSheetCloseTimerRef, showSocialModal, setIsSocialSheetPresented))
          return
        }
        closeSocialSheet()
      }}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          showCloseButton
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isSocialSheetPresented ? "opacity-100" : "opacity-0") : undefined}
          onTouchStart={(e) => {
            if (!isMobileModalViewport) return
            const touchY = e.touches[0]?.clientY ?? 0
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            if (touchY - bounds.top <= 72) {
              socialSheetStartYRef.current = touchY
              socialSheetLastYRef.current = touchY
              socialSheetLastTimeRef.current = Date.now()
              socialSheetVelocityRef.current = 0
              setIsSocialSheetDragging(true)
            }
          }}
          onTouchMove={(e) => {
            if (!isMobileModalViewport || !isSocialSheetDragging) return
            const currentY = e.touches[0]?.clientY ?? 0
            const diff = currentY - socialSheetStartYRef.current
            if (diff > 0) {
              e.preventDefault()
              const now = Date.now()
              const dt = Math.max(1, now - socialSheetLastTimeRef.current)
              socialSheetVelocityRef.current = (currentY - socialSheetLastYRef.current) / dt
              socialSheetLastYRef.current = currentY
              socialSheetLastTimeRef.current = now

              const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
              setSocialSheetDragY(resisted)
            }
          }}
          onTouchEnd={() => {
            if (!isMobileModalViewport || !isSocialSheetDragging) return
            setIsSocialSheetDragging(false)
            if (socialSheetDragY > 92 || socialSheetVelocityRef.current > 0.55) {
              closeSocialSheet()
              return
            }
            setSocialSheetDragY(0)
          }}
          className={cn(
            "p-0 gap-0 overflow-hidden mx-auto flex flex-col border-[#ececf1]",
            isMobileModalViewport
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
              : "w-[calc(100%-32px)] max-w-md rounded-2xl max-h-[85vh]"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            ...sheetAboveKeyboard(0.75),
            transform: isSocialSheetPresented ? `translate3d(0, ${socialSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
            transition: isSocialSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          } : undefined}
        >
          {isMobileModalViewport && (
            <div className="pt-3 pb-2 flex justify-center cursor-pointer" data-sheet-handle>
              <div className="h-1.5 w-10 rounded-full bg-gray-300" />
            </div>
          )}
          <DialogHeader className="p-4 sm:p-5 border-b border-gray-100 shrink-0">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {selectedSocial ? "Edit Social Link" : "Add Social Link"}
            </DialogTitle>
          </DialogHeader>

          {!selectedSocial ? (
            <>
              {/* Search Bar */}
              <div className="px-4 pt-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search platforms..."
                    className="pl-10 h-11 rounded-xl bg-gray-50 border-gray-200"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Platform List */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {SOCIAL_PLATFORMS.filter(p =>
                  p.label.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((platform) => {
                  const isActive = !!social_links?.[platform.id as keyof typeof social_links]
                  return (
                    <button
                      key={platform.id}
                      onClick={() => {
                        setSelectedSocial(platform.id)
                        setSocialUrl(social_links?.[platform.id as keyof typeof social_links] || "")
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                        isActive
                          ? "bg-gray-100"
                          : "hover:bg-gray-50"
                      )}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: platform.color }}
                      >
                        <SocialIcon platform={platform.id} size={20} color={markOn(platform.color)} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-sm">{platform.label}</p>
                        {isActive && (
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">
                            {social_links?.[platform.id as keyof typeof social_links]}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>
                  )
                })}
                {SOCIAL_PLATFORMS.filter(p =>
                  p.label.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No platforms found</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            // URL input for selected platform
            <div className="p-4 sm:p-5 space-y-4">
              {(() => {
                const platform = SOCIAL_PLATFORMS.find(p => p.id === selectedSocial)
                return (
                  <>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: platform?.color }}
                      >
                        <SocialIcon platform={selectedSocial ?? ""} size={20} color={markOn(platform?.color)} />
                      </div>
                      <div>
                        <p className="font-medium">{platform?.label}</p>
                        <p className="text-xs text-muted-foreground">Add your {platform?.label} link</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">URL</Label>
                      <Input
                        value={socialUrl}
                        onChange={(e) => {
                          setSocialUrl(normalizeUrlInput(e.target.value))
                          if (socialUrlError) setSocialUrlError(null)
                        }}
                        placeholder={platform?.placeholder}
                        className={cn(
                          "h-11 rounded-xl",
                          socialUrlError && "border-red-500 focus-visible:ring-red-500"
                        )}
                      />
                      {socialUrlError && (
                        <p className="text-xs text-red-500">{socialUrlError}</p>
                      )}
                      {(selectedSocial === 'instagram' || selectedSocial === 'twitter' || selectedSocial === 'threads' || selectedSocial === 'tiktok' || selectedSocial === 'telegram') && (
                        <p className="text-xs text-muted-foreground">
                          Tip: You can enter just @username
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        className="bg-black hover:bg-neutral-800 text-white rounded-xl h-[44px] w-full text-[15px] font-semibold"
                        onClick={() => {
                          const wasExisting = !!social_links?.[selectedSocial as keyof typeof social_links]
                          setSocialUrl(normalizeUrlInput(socialUrl))
                          handleAddSocial()
                          if (wasExisting) {
                            setShowUpdateSocialNotification(false)
                            requestAnimationFrame(() => setShowUpdateSocialNotification(true))
                          }
                        }}
                        disabled={!socialUrl}
                      >
                        {social_links?.[selectedSocial as keyof typeof social_links] ? "Update" : "Add"}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl h-[44px] w-full text-[15px] font-semibold"
                        onClick={() => closeSocialSheet()}
                      >
                        Back
                      </Button>
                      {social_links?.[selectedSocial as keyof typeof social_links] && (
                        <Button
                          variant="outline"
                          className="rounded-xl h-[44px] w-full text-red-600 hover:text-red-700 hover:bg-red-50 text-[15px] font-semibold justify-center"
                          onClick={() => {
                            handleRemoveSocial(selectedSocial)
                            setShowDeleteSocialNotification(false)
                            requestAnimationFrame(() => setShowDeleteSocialNotification(true))
                            setSelectedSocial(null)
                            setSocialUrlError(null)
                            closeSocialSheet()
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>


      <SaveNotification
        show={showDeleteSocialNotification}
        message="Deleted"
        duration={3000}
        icon={DeletedIcon}
      />
      <SaveNotification
        show={showAddBlockNotification}
        message="New block added"
        duration={4000}
      />
      <SaveNotification
        show={showUpdateSocialNotification}
        message="Updated"
        duration={3000}
      />
      <SaveNotification
        show={showBlockRemovedNotification}
        message="Block removed"
        duration={3000}
        icon={DeletedIcon}
      />
      <SaveNotification
        show={showBlockArchivedNotification}
        message="Block archived"
        duration={3000}
      />

      {/* Streaming Service URL Modal */}
      <Dialog open={showStreamingUrlModal} onOpenChange={(open) => {
        setShowStreamingUrlModal(open)
        if (!open) {
          setStreamingPlatform(null)
          setStreamingPlatformIndex(-1)
          setStreamingUrl("")
          setStreamingUrlError(null)
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 sm:p-5 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {streamingUrl ? "Edit Streaming Link" : "Add Streaming Link"}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4">
            {(() => {
              const platformConfig: Record<string, { name: string; color: string; urlPattern: RegExp; placeholder: string; icon: React.ReactNode }> = {
                apple_music: {
                  name: 'Apple Music',
                  color: '#FC3C44',
                  urlPattern: /music\.apple\.com/i,
                  placeholder: 'https://music.apple.com/...',
                  icon: <svg viewBox="0 0 512 512" className="w-5 h-5"><defs><linearGradient id="am-grad" x1=".5" y1=".99" x2=".5" y2=".02"><stop offset="0" stopColor="#FA233B"/><stop offset="1" stopColor="#FB5C74"/></linearGradient></defs><rect width="512" height="512" rx="15%" fill="url(#am-grad)"/><path fill="#ffffff" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/></svg>
                },
                youtube_music: {
                  name: 'YouTube Music',
                  color: '#FF0000',
                  urlPattern: /music\.youtube\.com/i,
                  placeholder: 'https://music.youtube.com/...',
                  icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>
                },
                spotify: {
                  name: 'Spotify',
                  color: '#1DB954',
                  urlPattern: /spotify\.com/i,
                  placeholder: 'https://open.spotify.com/...',
                  icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                },
                soundcloud: {
                  name: 'SoundCloud',
                  color: '#FF5500',
                  urlPattern: /soundcloud\.com/i,
                  placeholder: 'https://soundcloud.com/...',
                  icon: <svg viewBox="0 0 512 512" className="w-5 h-5"><rect width="512" height="512" rx="15%" fill="#f50"/><path d="m59 270-3 22 3 22c0 2 3 2 3 0l3-22-3-22c0-3-3-3-3 0zm18-14c0-3-3-3-3 0l-5 36 4 35c0 3 4 3 4 0l4-35zm59-30-3 66 2 40c0 8 7 8 7 0l4-40-4-66c0-5-6-5-6 0zm-31 22-4 44 3 40c0 6 5 6 5 0l4-40-4-44c0-3-4-3-4 0zm70 84 3-40-3-88c0-6-7-6-7 0l-3 88 2 40c0 8 8 8 8 0zm68 0 2-40-2-102c0-7-10-7-10 0l-2 102 2 40c0 8 10 8 10 0zm-34 0 3-40-3-89c0-6-9-6-9 0l-2 89 2 40c0 8 9 8 9 0zm-83 0 3-40-3-41c0-3-6-3-6 0l-3 41 3 40c0 7 6 7 6 0zm-33 0 4-40-4-43c0-3-4-3-4 0l-4 43 4 40c0 4 4 4 4 0zm124-125-2 85 1 40c0 8 10 8 10 0l2-40-2-85c0-7-9-7-9 0zm-58 125 3-40-3-81c0-6-7-6-7 0l-3 81 2 40c0 8 8 8 8 0zm33 0 3-40-3-91c0-6-8-6-8 0l-3 91 3 40c0 8 8 8 8 0zm196-89c-5-57-64-94-118-73-4 2-5 3-5 6v156c0 3 2 6 5 6h137c27 0 49-22 49-49 0-37-35-57-68-46zm-138-62-3 111 3 40c0 8 10 8 10 0l3-40-3-111c0-7-10-7-10 0z" fill="#ffffff"/></svg>
                },
                tidal: {
                  name: 'TIDAL',
                  color: '#000000',
                  urlPattern: /tidal\.com/i,
                  placeholder: 'https://tidal.com/...',
                  icon: <svg viewBox="0 0 32 32" className="w-5 h-5" fill="white"><path d="M16.016 5.323l-5.339 5.339-5.339-5.339-5.339 5.339 5.339 5.339 5.339-5.339 5.339 5.339-5.339 5.339 5.339 5.339 5.339-5.339-5.339-5.339 5.339-5.339zM21.391 10.661l5.302-5.307 5.307 5.307-5.307 5.307z"/></svg>
                },
                deezer: {
                  name: 'Deezer',
                  color: '#231f20',
                  urlPattern: /deezer\.com/i,
                  placeholder: 'https://deezer.com/...',
                  icon: <svg viewBox="0 0 512 512" className="w-5 h-5" fill="none" strokeWidth="20"><rect width="512" height="512" rx="15%" fill="#231f20"/><path stroke="#f1796e" d="M78 241h64m-64 26h64"/><path stroke="#ec2529" d="M78 293h64m-64 26h64m-64 26h64"/><path stroke="#f6dd05" d="M148 293h64m-64 26h64m-64 26h64"/><path stroke="#e78dcc" d="M218 241h64m-64 26h64m-64-52h64m-64-26h64"/><path stroke="#d81996" d="M218 293h64m-64 26h64m-64 26h64"/><path stroke="#d6e465" d="M288 241h64m-64 26h64"/><path stroke="#adda1a" d="M288 293h64m-64 26h64m-64 26h64"/><path stroke="#b0d8e6" d="M358 241h64m-64 26h64m-64-52h64m-64-26h64m-64-26h64"/><path stroke="#56bbe9" d="M358 293h64m-64 26h64m-64 26h64"/></svg>
                },
                amazon_music: {
                  name: 'Amazon Music',
                  color: '#25D1DA',
                  urlPattern: /music\.amazon|amazon\.com\/music/i,
                  placeholder: 'https://music.amazon.com/...',
                  icon: <svg viewBox="0 0 48 48" className="w-5 h-5" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="21.5"/><path d="M32.28 29.7c1.11-.45 3.09-1.05 3.69-.33.64.78-.17 2.48-.92 3.79"/><path d="M11.8 30.22c1.76 1.4 6.95 3.53 12.49 3.53a17 17 0 0 0 10.17-3.08"/><path d="M20.4 20.13v3.3a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-3.3"/><line x1="24.4" y1="23.43" x2="24.4" y2="25.43"/><path d="M10.4 22.23a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3.2"/><line x1="10.4" y1="20.23" x2="10.4" y2="25.43"/><path d="M14.4 22.23a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3.2"/><circle cx="31.88" cy="17.68" r="0.7" fill="white"/><line x1="31.88" y1="20.13" x2="31.88" y2="25.43"/><path d="M26.54 24.97a2.25 2.25 0 0 0 1.64.45h.45a1.32 1.32 0 0 0 1.32-1.33 1.32 1.32 0 0 0-1.32-1.32h-.9a1.32 1.32 0 0 1-1.32-1.33 1.32 1.32 0 0 1 1.32-1.32h.45a2.25 2.25 0 0 1 1.64.45"/><path d="M37.6 24.42a2 2 0 0 1-1.74 1h0a2 2 0 0 1-2-2v-1.3a2 2 0 0 1 2-2h0a2 2 0 0 1 1.73 1"/></svg>
                },
              }
              const config = streamingPlatform ? platformConfig[streamingPlatform] : null

              const handleSave = () => {
                if (!streamingUrl.trim()) {
                  setStreamingUrlError('Please enter a URL')
                  return
                }
                if (config && !config.urlPattern.test(streamingUrl)) {
                  setStreamingUrlError(`Please enter a valid ${config.name} URL`)
                  return
                }
                if (streamingBlockData && streamingBlockUpdateFn && streamingPlatformIndex >= 0) {
                  const newServices = [...(streamingBlockData.streaming_services || [])]
                  if (newServices[streamingPlatformIndex]) {
                    newServices[streamingPlatformIndex] = { ...newServices[streamingPlatformIndex], url: streamingUrl.trim(), found: true }
                    streamingBlockUpdateFn({ streaming_services: newServices })
                  }
                }
                setShowStreamingUrlModal(false)
              }

              return (
                <>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: config?.color || '#6366F1' }}
                    >
                      {config?.icon || (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                          <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{config?.name || 'Streaming Platform'}</p>
                      <p className="text-xs text-muted-foreground">Add your {config?.name || 'streaming'} link</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">URL</Label>
                    <Input
                      value={streamingUrl}
                      onChange={(e) => {
                        setStreamingUrl(e.target.value)
                        if (streamingUrlError) setStreamingUrlError(null)
                      }}
                      placeholder={config?.placeholder || 'Enter URL...'}
                      className={cn(
                        "h-11 rounded-xl",
                        streamingUrlError && "border-red-500 focus-visible:ring-red-500"
                      )}
                    />
                    {streamingUrlError && (
                      <p className="text-xs text-red-500">{streamingUrlError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Tip: Paste the full URL from {config?.name || 'the platform'}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl"
                      onClick={() => setShowStreamingUrlModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-gray-900 hover:bg-gray-800 rounded-xl"
                      onClick={handleSave}
                      disabled={!streamingUrl.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Name & Bio Edit Modal */}
      <Dialog open={showNameBioModal} onOpenChange={setShowNameBioModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 sm:p-5 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">Edit Profile</DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your display name"
                className="h-11 border-2 border-gray-200 focus:border-gray-900 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Bio</Label>
              <Textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="A short bio about yourself..."
                className="min-h-[100px] border-2 border-gray-200 focus:border-gray-900 rounded-xl resize-none"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">This will appear below your name on your page</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNameBioModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]"
                onClick={() => {
                  updateProfile({ title: editName, bio: editBio })
                  setShowNameBioModal(false)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Thumbnail Edit Modal - Centered with overlay */}
      <Dialog open={showThumbnailModal} onOpenChange={(open) => {
        if (open) {
          setIsThumbnailSheetPresented(false)
          setShowThumbnailModal(sheetOpening(thumbnailSheetCloseTimerRef, showThumbnailModal, setIsThumbnailSheetPresented))
          return
        }
        closeThumbnailSheet()
      }}>
        <DialogContent
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isThumbnailSheetPresented ? "opacity-100" : "opacity-0") : undefined}
          onTouchStart={(e) => {
            if (!isMobileModalViewport) return
            const touchY = e.touches[0]?.clientY ?? 0
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            if (touchY - bounds.top <= 72) {
              thumbnailSheetStartYRef.current = touchY
              thumbnailSheetLastYRef.current = touchY
              thumbnailSheetLastTimeRef.current = Date.now()
              thumbnailSheetVelocityRef.current = 0
              setIsThumbnailSheetDragging(true)
            }
          }}
          onTouchMove={(e) => {
            if (!isMobileModalViewport || !isThumbnailSheetDragging) return
            const currentY = e.touches[0]?.clientY ?? 0
            const diff = currentY - thumbnailSheetStartYRef.current
            if (diff > 0) {
              e.preventDefault()
              const now = Date.now()
              const dt = Math.max(1, now - thumbnailSheetLastTimeRef.current)
              thumbnailSheetVelocityRef.current = (currentY - thumbnailSheetLastYRef.current) / dt
              thumbnailSheetLastYRef.current = currentY
              thumbnailSheetLastTimeRef.current = now

              const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
              setThumbnailSheetDragY(resisted)
            }
          }}
          onTouchEnd={() => {
            if (!isMobileModalViewport || !isThumbnailSheetDragging) return
            setIsThumbnailSheetDragging(false)
            if (thumbnailSheetDragY > 92 || thumbnailSheetVelocityRef.current > 0.55) {
              closeThumbnailSheet()
              return
            }
            setThumbnailSheetDragY(0)
          }}
          className={cn(
            "p-0 gap-0 overflow-hidden mx-auto transition-all duration-200 flex flex-col border-[#ececf1]",
            isMobileModalViewport
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
              : showIconLibraryInModal
                ? "rounded-2xl w-[calc(100%-32px)] sm:max-w-[572px] max-w-[650px]"
                : "rounded-2xl w-[calc(100%-32px)] sm:max-w-[416px] max-w-[455px]"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            ...sheetAboveKeyboard(0.75),
            transform: isThumbnailSheetPresented ? `translate3d(0, ${thumbnailSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden' as const,
            transition: isThumbnailSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          } : undefined}
        >
          {/* Main Options View */}
          {!showIconLibraryInModal && (
            <>
              {isMobileModalViewport && (
                <div className="pt-3 pb-2 flex justify-center cursor-pointer" data-sheet-handle>
                  <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                </div>
              )}
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-base font-semibold">
                  {getThumbnailBlockType() === 'product' ? 'Edit Custom Thumbnail' : 'Edit Thumbnail'}
                </DialogTitle>
              </DialogHeader>
              <div className="p-4 space-y-3">
                {/* Current thumbnail preview */}
                {getThumbnailBlockData() && (
                  <div className="flex items-center justify-center pb-3 border-b">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                      {(() => {
                        const blockData = getThumbnailBlockData()
                        const blockType = getThumbnailBlockType()
                        if (blockType === 'product') {
                          const productData = blockData as ProductBlockData | null
                          if (productData?.custom_thumbnail) {
                            return <img src={productData.custom_thumbnail} alt="" className="w-full h-full object-cover" />
                          } else if (productData?.product_thumbnail) {
                            return <img src={productData.product_thumbnail} alt="" className="w-full h-full object-cover opacity-50" />
                          }
                        } else {
                          const linkData = blockData as LinkButtonBlockData | null
                          if (linkData?.thumbnail_url) {
                            return <img src={linkData.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          } else if (hasLinkIcon(linkData?.icon)) {
                            return <LinkIcon name={linkData?.icon} size={28} className="text-gray-500" />
                          }
                        }
                        return <ImageIcon className="w-7 h-7 text-gray-400" />
                      })()}
                    </div>
                  </div>
                )}

                {/* Upload option */}
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    {thumbnailUploading ? (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Upload image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, GIF up to 5MB</p>
                  </div>
                </button>

                {/* Icon library button - only for link_button blocks */}
                {getThumbnailBlockType() === 'link_button' && (
                  <button
                    type="button"
                    onClick={() => setShowIconLibraryInModal(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#f4f4f6] flex items-center justify-center">
                      <Grid3X3 className="w-5 h-5 text-[#1a1a2e]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Choose icon</p>
                      <p className="text-xs text-muted-foreground">From icon library</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                )}

                {/* Remove thumbnail */}
                {(() => {
                  const blockData = getThumbnailBlockData()
                  const blockType = getThumbnailBlockType()
                  const hasThumbnail = blockType === 'product'
                    ? (blockData as ProductBlockData | null)?.custom_thumbnail
                    : ((blockData as LinkButtonBlockData | null)?.thumbnail_url || (blockData as LinkButtonBlockData | null)?.icon)

                  return hasThumbnail ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (thumbnailBlockId) {
                          const block = onepage.draft_blocks.find(b => b.id === thumbnailBlockId)
                          if (block?.type === 'product') {
                            updateBlock(thumbnailBlockId, {
                              data: {
                                ...block.data,
                                custom_thumbnail: null
                              }
                            })
                          } else {
                            updateBlock(thumbnailBlockId, {
                              data: {
                                ...block?.data,
                                thumbnail_url: null,
                                icon: null
                              }
                            })
                          }
                        }
                        setShowThumbnailModal(false)
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors text-left border border-red-200 text-red-600"
                    >
                      <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium">Remove thumbnail</p>
                    </button>
                  ) : null
                })()}
              </div>
            </>
          )}

          {/* Icon Library Full Page View */}
          {showIconLibraryInModal && (
            <>
              {isMobileModalViewport && (
                <div className="pt-3 pb-2 flex justify-center cursor-pointer" data-sheet-handle>
                  <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                </div>
              )}
              <DialogHeader className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIconLibraryInModal(false)
                      setIconSearchQuery("")
                      setIconCategory("all")
                    }}
                    className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <DialogTitle className="text-base font-semibold">Choose Icon</DialogTitle>
                </div>
              </DialogHeader>

              {/* Search */}
              <div className="p-3 border-b bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search icons..."
                    value={iconSearchQuery}
                    onChange={(e) => setIconSearchQuery(e.target.value)}
                    className="pl-9 h-10 bg-white border-gray-200 rounded-lg text-sm"
                    readOnly={isMobileModalViewport}
                    onClick={(e) => {
                      if (isMobileModalViewport) {
                        e.currentTarget.readOnly = false
                        e.currentTarget.focus()
                      }
                    }}
                  />
                  {iconSearchQuery && (
                    <button
                      onClick={() => setIconSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Categories - Horizontal scroll on mobile, sidebar on desktop */}
              {isMobileModalViewport ? (
                <div className="border-b bg-white overflow-x-auto scrollbar-hide">
                  <div className="flex gap-2 p-3">
                    {LINK_ICON_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setIconCategory(cat.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                          iconCategory === cat.id
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {cat.label} ({cat.icons.length})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Layout with sidebar and icons */}
              <div className={cn(
                "flex overflow-hidden",
                isMobileModalViewport ? "h-[50vh]" : "h-[60vh] max-h-[500px]"
              )}>
                {/* Categories sidebar - Desktop only */}
                {!isMobileModalViewport && (
                  <div className="w-40 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
                    <div className="p-2 space-y-1">
                      {LINK_ICON_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setIconCategory(cat.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            iconCategory === cat.id
                              ? "bg-gray-900 text-white"
                              : "text-gray-600 hover:bg-gray-200"
                          )}
                        >
                          {cat.label}
                          <span className="ml-1 text-xs opacity-60">({cat.icons.length})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Icon grid */}
                <div className={cn(
                  "flex-1 overflow-y-auto",
                  isMobileModalViewport ? "p-3 pb-[max(16px,env(safe-area-inset-bottom))]" : "p-4"
                )}>
                  <div className={cn(
                    "grid gap-2",
                    isMobileModalViewport ? "grid-cols-4" : "grid-cols-5 sm:grid-cols-6 md:grid-cols-8"
                  )}>
                    {(() => {
                      // Get icons for current category
                      const categoryIcons = LINK_ICON_CATEGORIES.find(c => c.id === iconCategory)?.icons || []
                      // Filter by search query
                      const filteredIcons = LINK_ICONS.filter(icon => {
                        const matchesCategory = categoryIcons.includes(icon.id)
                        const matchesSearch = !iconSearchQuery ||
                          icon.name.toLowerCase().includes(iconSearchQuery.toLowerCase()) ||
                          icon.id.toLowerCase().includes(iconSearchQuery.toLowerCase())
                        return matchesCategory && matchesSearch
                      })

                      if (filteredIcons.length === 0) {
                        return (
                          <div className="col-span-full text-center py-8 text-gray-500">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No icons found</p>
                          </div>
                        )
                      }

                      return filteredIcons.map((icon) => (
                        <button
                          key={icon.id}
                          type="button"
                          onClick={() => {
                            if (thumbnailBlockId) {
                              const block = onepage.draft_blocks.find(b => b.id === thumbnailBlockId)
                              if (block?.type === 'link_button') {
                                updateBlock(thumbnailBlockId, {
                                  data: {
                                    ...block.data,
                                    icon: icon.id,
                                    thumbnail_url: null
                                  }
                                })
                              }
                            }
                            closeThumbnailSheet()
                            setShowIconLibraryInModal(false)
                            setIconSearchQuery("")
                            setIconCategory("all")
                          }}
                          className={cn(
                            "aspect-square rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:bg-gray-100 hover:shadow-sm",
                            isMobileModalViewport ? "p-2" : "p-2",
                            (() => {
                              const blockData = getThumbnailBlockData()
                              if (getThumbnailBlockType() === 'link_button' && blockData) {
                                return (blockData as LinkButtonBlockData).icon === icon.id
                              }
                              return false
                            })() && "bg-gray-100 shadow-sm ring-2 ring-gray-900"
                          )}
                          title={icon.name}
                        >
                          <LinkIcon name={icon.id} size={isMobileModalViewport ? 20 : 24} className="text-gray-700" />
                          <span className={cn(
                            "text-gray-500 truncate w-full text-center",
                            isMobileModalViewport ? "text-[8px]" : "text-[9px]"
                          )}>{icon.name}</span>
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Hidden file input */}
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/*"
            onChange={handleThumbnailUploadForModal}
            className="hidden"
          />
        </DialogContent>
      </Dialog>

      {/* Image Library Modal / File Upload Modal */}
      <Dialog open={showImageLibrary} onOpenChange={(open) => {
        setShowImageLibrary(open)
        if (!open) {
          setImageBlockId(null)
          setImageFieldType(null)
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 sm:p-5 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {imageFieldType === 'digital_product_file' ? 'Upload Digital File'
                : imageFieldType === 'product_image' ? 'Product Image'
                : imageFieldType === 'pdf_file' ? 'Upload PDF File'
                : imageFieldType === 'thumbnail_url' ? 'Upload Thumbnail'
                : 'Choose an Image'}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto">
            {/* File Upload Section for digital product file, product image, PDF file, or thumbnail */}
            {(imageFieldType === 'digital_product_file' || imageFieldType === 'product_image' || imageFieldType === 'pdf_file' || imageFieldType === 'thumbnail_url') && (
              <div className="mb-4">
                <input
                  type="file"
                  id="file-upload-input"
                  accept={
                    imageFieldType === 'digital_product_file' ? undefined
                    : imageFieldType === 'pdf_file' ? '.pdf,application/pdf'
                    : 'image/*'
                  }
                  disabled={imageUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !imageBlockId) return
                    if (imageUploading) return // Guard against concurrent uploads

                    setImageUploading(true)
                    setUploadProgress(0)
                    try {
                      const isDigitalFile = imageFieldType === 'digital_product_file' || imageFieldType === 'pdf_file'
                      const folder = isDigitalFile ? 'digital' : 'images'

                      // --- Client-side security checks (fast, before any upload) ---

                      // 1. File size limit: plan-based (free=10GB, growth=50GB, pro=unlimited)
                      if (isDigitalFile && file.size > MAX_DIGITAL_PRODUCT_FILE_SIZE) {
                        const limitGB = MAX_DIGITAL_PRODUCT_FILE_SIZE / (1024 * 1024 * 1024)
                        throw new Error(`File size exceeds the ${limitGB} GB limit for digital product uploads.`)
                      }
                      if (file.size <= 0) {
                        throw new Error('File is empty (0 bytes).')
                      }

                      // 2. Extension blocklist (instant check)
                      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
                      if (BLOCKED_EXTENSIONS.has(fileExt)) {
                        throw new Error(`File type ".${fileExt}" is blocked for security reasons. This file type can contain executable code.`)
                      }

                      // 3. Deep security scan: read file header and check magic bytes
                      const fileHeader = await readFileHeader(file)
                      const securityScan = scanFile(file.name, file.type || 'application/octet-stream', fileHeader)
                      if (!securityScan.safe) {
                        throw new Error(securityScan.reason || 'File blocked for security reasons.')
                      }

                      // Use signed URL upload for digital files (any size) and large image files
                      // Direct upload only for small image/thumbnail files (< 2MB)
                      const DIRECT_UPLOAD_LIMIT = 2 * 1024 * 1024 // 2MB

                      let url: string

                      if (!isDigitalFile && file.size < DIRECT_UPLOAD_LIMIT) {
                        // Small image/thumbnail files: use FormData via server API route
                        const formData = new FormData()
                        formData.append('file', file)
                        formData.append('type', 'image')

                        let simProgress = 0
                        const simInterval = setInterval(() => {
                          simProgress = Math.min(simProgress + 12, 90)
                          setUploadProgress(simProgress)
                        }, 150)

                        const uploadRes = await fetch('/api/onepage/upload-file', {
                          method: 'POST',
                          body: formData,
                        })

                        clearInterval(simInterval)

                        if (!uploadRes.ok) {
                          const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }))
                          throw new Error(err.error || 'Upload failed')
                        }

                        setUploadProgress(100)
                        const result = await uploadRes.json()
                        url = result.url
                      } else {
                        // All digital files + large images: direct-to-storage upload
                        // Tries: 1) Signed URL XHR (most reliable), 2) TUS, 3) Server proxy
                        setUploadProgress(1)

                        let uploaded = false
                        let lastError = ''

                        // Step 1: Get a signed upload URL from server
                        setUploadProgress(2)
                        const getSignedUrl = async () => {
                          // Try v2 prepare endpoint first
                          try {
                            const v2Res = await fetch('/api/v2/upload/prepare', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream',
                                fileSize: file.size,
                                folder,
                              }),
                            })
                            if (v2Res.ok) {
                              const data = await v2Res.json().catch(() => null)
                              if (data?.signedUrl) return data
                            }
                            const v2Err = await v2Res.json().catch(() => ({}))
                            if (v2Res.status === 403 && v2Err.error) throw new Error(v2Err.error)
                          } catch (v2Error) {
                            if (v2Error instanceof Error && v2Error.message.includes('plan')) throw v2Error
                            console.warn('v2 prepare failed, falling back:', v2Error)
                          }
                          // Fallback: legacy endpoint
                          const signedRes = await fetch('/api/onepage/signed-upload-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              fileName: file.name,
                              contentType: file.type || 'application/octet-stream',
                              fileSize: file.size,
                              folder,
                            }),
                          })
                          if (!signedRes.ok) {
                            const err = await signedRes.json().catch(() => ({ error: 'Failed to prepare upload' }))
                            throw new Error(err.error || 'Failed to prepare upload')
                          }
                          const data = await signedRes.json().catch(() => null)
                          if (!data) throw new Error('Failed to prepare upload')
                          return data
                        }

                        const signedData = await getSignedUrl()
                        setUploadProgress(3)
                        const uploadBucket = signedData.bucket || 'lead-form-files-v2'

                        // --- Strategy A: Signed URL XHR (most reliable — single PUT, works without RLS) ---
                        if (!uploaded && signedData.signedUrl) {
                          try {
                            url = await new Promise<string>((resolve, reject) => {
                              const xhr = new XMLHttpRequest()
                              xhr.upload.addEventListener('progress', (event) => {
                                if (event.lengthComputable) {
                                  const pct = Math.round(3 + (event.loaded / event.total) * 96)
                                  setUploadProgress(Math.min(pct, 99))
                                }
                              })
                              xhr.addEventListener('load', () => {
                                if (xhr.status >= 200 && xhr.status < 300) {
                                  setUploadProgress(100)
                                  resolve(signedData.publicUrl)
                                } else {
                                  let errMsg = `Upload error (${xhr.status})`
                                  try {
                                    const body = JSON.parse(xhr.responseText)
                                    errMsg = body.error || body.message || errMsg
                                  } catch {}
                                  reject(new Error(errMsg))
                                }
                              })
                              xhr.addEventListener('error', () => reject(new Error('Network error during upload.')))
                              xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')))
                              xhr.addEventListener('timeout', () => reject(new Error('Upload timed out.')))
                              xhr.open('PUT', signedData.signedUrl)
                              const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                              if (anonKey) {
                                xhr.setRequestHeader('apikey', anonKey)
                                xhr.setRequestHeader('Authorization', `Bearer ${anonKey}`)
                              }
                              xhr.setRequestHeader('x-upsert', 'true')
                              const xhrForm = new FormData()
                              xhrForm.append('cacheControl', '31536000')
                              xhrForm.append('', file, file.name)
                              xhr.timeout = 600000
                              xhr.send(xhrForm)
                            })
                            uploaded = true
                          } catch (xhrErr: unknown) {
                            lastError = xhrErr instanceof Error ? xhrErr.message : String(xhrErr)
                            console.warn('XHR signed URL upload failed:', lastError)
                          }
                        }

                        // --- Strategy B: TUS via browser Supabase client ---
                        if (!uploaded && signedData.tusReady !== false) {
                          try {
                            const supabase = createClient()
                            const { data: { session } } = await supabase.auth.getSession()
                            if (!session) await supabase.auth.refreshSession()

                            let simProgress = 3
                            const progressInterval = setInterval(() => {
                              const mbSize = file.size / (1024 * 1024)
                              const increment = Math.max(0.3, 12 / Math.max(mbSize, 1))
                              simProgress = Math.min(simProgress + increment, 95)
                              setUploadProgress(Math.round(simProgress))
                            }, 500)

                            const { error: tusError } = await supabase.storage
                              .from(uploadBucket)
                              .upload(signedData.path, file, {
                                contentType: file.type || 'application/octet-stream',
                                cacheControl: '31536000',
                                upsert: true,
                              })
                            clearInterval(progressInterval)
                            if (tusError) throw tusError
                            setUploadProgress(100)
                            url = signedData.publicUrl
                            uploaded = true
                          } catch (tusErr: unknown) {
                            lastError = tusErr instanceof Error ? tusErr.message : String(tusErr)
                            console.warn('TUS upload failed:', lastError)
                          }
                        }

                        // --- Strategy C: Server-side upload proxy (last resort) ---
                        if (!uploaded) {
                          try {
                            const uploadFormData = new FormData()
                            uploadFormData.append('file', file)
                            uploadFormData.append('folder', folder)

                            let simProgress = 3
                            const progressInterval = setInterval(() => {
                              const mbSize = file.size / (1024 * 1024)
                              const increment = Math.max(0.3, 12 / Math.max(mbSize, 1))
                              simProgress = Math.min(simProgress + increment, 95)
                              setUploadProgress(Math.round(simProgress))
                            }, 500)

                            const serverRes = await fetch('/api/v2/upload/server-upload', {
                              method: 'POST',
                              body: uploadFormData,
                            })
                            clearInterval(progressInterval)

                            if (serverRes.ok) {
                              const result = await serverRes.json().catch(() => null)
                              if (result?.url) {
                                url = result.url
                                uploaded = true
                                setUploadProgress(100)
                              }
                            }
                            if (!uploaded) {
                              const err = await serverRes.json().catch(() => null)
                              lastError = err?.error || `Server upload failed (${serverRes.status})`
                              console.warn('Server upload failed:', lastError)
                            }
                          } catch (serverErr: unknown) {
                            lastError = serverErr instanceof Error ? serverErr.message : String(serverErr)
                            console.warn('Server upload error:', lastError)
                          }
                        }

                        // Notify upload complete (non-blocking)
                        if (uploaded && (signedData?.assetId || signedData?.path)) {
                          fetch('/api/v2/upload/complete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              assetId: signedData.assetId || null,
                              path: signedData.path,
                              bucket: signedData.bucket || 'lead-form-files-v2',
                              fileSize: file.size,
                            }),
                          }).catch(() => {})
                        }

                        if (!uploaded) {
                          throw new Error(lastError || 'All upload methods failed. Please try again.')
                        }
                      }

                      const block = onepage.draft_blocks.find(b => b.id === imageBlockId)
                      if (block) {
                        if (imageFieldType === 'digital_product_file') {
                          updateBlock(imageBlockId, {
                            data: {
                              ...block.data,
                              digital_product_file_url: url,
                              digital_product_title: file.name.replace(/\.[^/.]+$/, ""),
                              enable_digital_product: true,
                            }
                          })
                        } else if (imageFieldType === 'product_image') {
                          updateBlock(imageBlockId, {
                            data: {
                              ...block.data,
                              product_image: url,
                            }
                          })
                        } else if (imageFieldType === 'pdf_file') {
                          updateBlock(imageBlockId, {
                            data: {
                              ...block.data,
                              pdf_file_url: url,
                              title: block.data.title || file.name.replace(/\.[^/.]+$/, ""),
                            }
                          })
                        } else if (imageFieldType === 'thumbnail_url') {
                          updateBlock(imageBlockId, {
                            data: {
                              ...block.data,
                              thumbnail_url: url,
                            }
                          })
                        }
                      }

                      setShowImageLibrary(false)
                      setImageBlockId(null)
                      setImageFieldType(null)
                    } catch (error) {
                      console.error('Upload failed:', error)
                      const errMsg = error instanceof Error ? error.message : 'Upload failed'
                      alert(`Upload failed: ${errMsg}`)
                    } finally {
                      setImageUploading(false)
                      setTimeout(() => setUploadProgress(0), 500)
                    }
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload-input"
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-300 transition-colors",
                    imageUploading ? "pointer-events-none" : "hover:border-[#9ca3af] cursor-pointer"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center relative",
                    imageFieldType === 'pdf_file' ? "bg-red-100" : "bg-[#f1f2f4]"
                  )}>
                    {imageUploading ? (
                      <svg className="w-10 h-10" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className={cn("opacity-20", imageFieldType === 'pdf_file' ? "text-red-600" : "text-[#1a1a2e]")} />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={cn(imageFieldType === 'pdf_file' ? "text-red-600" : "text-[#1a1a2e]")} style={{ strokeDasharray: `${2 * Math.PI * 15}`, strokeDashoffset: `${2 * Math.PI * 15 * (1 - uploadProgress / 100)}`, transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.3s ease' }} />
                        <text x="18" y="19.5" textAnchor="middle" className={cn("text-[8px] font-semibold fill-current", imageFieldType === 'pdf_file' ? "text-red-600" : "text-[#1a1a2e]")}>{uploadProgress}%</text>
                      </svg>
                    ) : (
                      <Upload className={cn("h-6 w-6", imageFieldType === 'pdf_file' ? "text-red-600" : "text-[#1a1a2e]")} />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium">
                      {imageUploading ? `Uploading... ${uploadProgress}%`
                        : imageFieldType === 'digital_product_file' ? 'Upload file'
                        : imageFieldType === 'pdf_file' ? 'Upload PDF'
                        : imageFieldType === 'thumbnail_url' ? 'Upload thumbnail'
                        : 'Upload image'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {imageFieldType === 'digital_product_file' ? 'Any file type, no size limit (audio, video, ZIP, images, docs)'
                        : imageFieldType === 'pdf_file' ? 'PDF files only'
                        : 'JPG, PNG, GIF up to 10MB'}
                    </p>
                  </div>
                </label>

                {/* Show current file/image if exists */}
                {imageBlockId && (() => {
                  const block = onepage.draft_blocks.find(b => b.id === imageBlockId)
                  if (!block) return null
                  const data = block.data as any
                  const hasFile = imageFieldType === 'digital_product_file' ? data.digital_product_file_url
                    : imageFieldType === 'pdf_file' ? data.pdf_file_url
                    : imageFieldType === 'thumbnail_url' ? data.thumbnail_url
                    : data.product_image
                  if (!hasFile) return null

                  return (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-gray-50 border">
                      {imageFieldType === 'digital_product_file' ? (
                        <div className="w-10 h-10 rounded-lg bg-[#f1f2f4] flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-[#1a1a2e]" />
                        </div>
                      ) : imageFieldType === 'pdf_file' ? (
                        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-red-600" />
                        </div>
                      ) : imageFieldType === 'thumbnail_url' ? (
                        <img src={data.thumbnail_url || ''} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <img src={data.product_image || ''} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {imageFieldType === 'digital_product_file' ? (data.digital_product_title || 'Current file')
                            : imageFieldType === 'pdf_file' ? (data.title || 'PDF file')
                            : 'Current image'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (imageFieldType === 'digital_product_file') {
                            updateBlock(imageBlockId, {
                              data: {
                                ...block.data,
                                digital_product_file_url: null,
                                digital_product_title: null,
                                enable_digital_product: false, // Disable when file is removed
                              }
                            })
                          } else if (imageFieldType === 'pdf_file') {
                            updateBlock(imageBlockId, {
                              data: {
                                ...block.data,
                                pdf_file_url: null,
                              }
                            })
                          } else if (imageFieldType === 'thumbnail_url') {
                            updateBlock(imageBlockId, {
                              data: {
                                ...block.data,
                                thumbnail_url: null,
                              }
                            })
                          } else {
                            updateBlock(imageBlockId, {
                              data: {
                                ...block.data,
                                product_image: null,
                              }
                            })
                          }
                          setShowImageLibrary(false)
                          setImageBlockId(null)
                          setImageFieldType(null)
                        }}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Show image library only for regular image blocks (not product_image or digital_product_file) */}
            {(!imageFieldType || imageFieldType.startsWith('image_item_')) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {IMAGE_LIBRARY.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => {
                      if (imageBlockId) {
                        const block = onepage.draft_blocks.find(b => b.id === imageBlockId)
                        if (block) {
                          // Handle image_item_${id} field type for multi-image blocks
                          if (imageFieldType && imageFieldType.startsWith('image_item_')) {
                            const imageItemId = imageFieldType.replace('image_item_', '')
                            const blockData = block.data as ImageBlockData
                            const images = blockData.images || (blockData.image_url ? [{ id: '1', image_url: blockData.image_url }] : [])
                            const newImages = images.map(image =>
                              image.id === imageItemId ? { ...image, image_url: img.url } : image
                            )
                            updateBlock(imageBlockId, {
                              data: {
                                ...block.data,
                                images: newImages,
                                image_url: newImages[0]?.image_url || ''
                              }
                            })
                          } else {
                            updateBlock(imageBlockId, { data: { ...block.data, image_url: img.url } })
                          }
                        }
                      }
                      setShowImageLibrary(false)
                      setImageBlockId(null)
                      setImageFieldType(null)
                    }}
                    className="aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-[#1a1a2e] transition-all group"
                  >
                    <img src={img.url} alt={img.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Avatar Edit Modal */}
      <Dialog open={showAvatarEditModal} onOpenChange={setShowAvatarEditModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b">
            <DialogTitle className="text-lg font-semibold text-center">Profile Image</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => { setShowAvatarEditModal(false); setShowAvatarUploadModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">Select image or GIF</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <button onClick={() => { setShowAvatarEditModal(false); setShowVideoModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center"><Video className="h-6 w-6 text-yellow-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">Select video</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            {(onepage.avatar_url || onepage.avatar_video_url) && (
              <button onClick={() => { 
                updateProfile({ avatar_url: null, avatar_video_url: null })
                setShowAvatarEditModal(false)
              }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-4 w-4" /><span className="font-medium">Remove current media</span>
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Avatar Upload Modal */}
      <Dialog open={showAvatarUploadModal} onOpenChange={setShowAvatarUploadModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowAvatarUploadModal(false); setShowAvatarEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload media</DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (!file || !file.type.startsWith('image/')) return
                const url = URL.createObjectURL(file)
                setTempImageUrl(url)
                setTempImageFile(file)
                setShowAvatarUploadModal(false)
                setShowAvatarCropModal(true)
              }}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200",
                isDragOver
                  ? "border-[#1a1a2e] bg-[#f4f4f6] scale-[1.02]"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <Upload className={cn("h-12 w-12 mb-4 transition-colors", isDragOver ? "text-[#1a1a2e]" : "text-gray-300")} />
              <p className={cn("font-medium transition-colors", isDragOver ? "text-[#1a1a2e]" : "text-gray-600")}>
                {isDragOver ? "Drop image here" : "Select file to upload,"}
              </p>
              {!isDragOver && <p className="font-medium text-gray-600">or drag-and-drop file</p>}
              <p className="text-sm text-gray-400 mt-2">Please upload an image</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = URL.createObjectURL(file)
                setTempImageUrl(url)
                setTempImageFile(file)
                setShowAvatarUploadModal(false)
                setShowAvatarCropModal(true)
              }}
              className="hidden"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Crop Modal - Square style like Design tab */}
      <Dialog open={showAvatarCropModal} onOpenChange={(open) => {
        setShowAvatarCropModal(open)
        if (!open && tempImageUrl) {
          URL.revokeObjectURL(tempImageUrl)
          setTempImageUrl(null)
          setTempImageFile(null)
          setCropBox({ x: 50, y: 50, size: 200 })
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowAvatarCropModal(false); setShowAvatarUploadModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempImageUrl && (
              <>
                {/* Square crop preview with draggable crop box */}
                <div
                  ref={cropContainerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden touch-none"
                  style={{ width: '300px', height: '300px' }}
                  onMouseMove={(e) => {
                    if (!isDraggingCrop && !isResizingCrop) return
                    const rect = cropContainerRef.current?.getBoundingClientRect()
                    if (!rect) return

                    if (isDraggingCrop) {
                      const newX = e.clientX - rect.left - dragStartCrop.x
                      const newY = e.clientY - rect.top - dragStartCrop.y
                      // Constrain to image bounds
                      const maxX = imageSizeCrop.width - cropBox.size
                      const maxY = imageSizeCrop.height - cropBox.size
                      const offsetX = (300 - imageSizeCrop.width) / 2
                      const offsetY = (300 - imageSizeCrop.height) / 2
                      setCropBox(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(maxX, newX - offsetX)),
                        y: Math.max(0, Math.min(maxY, newY - offsetY))
                      }))
                    } else if (isResizingCrop) {
                      const dx = e.clientX - dragStartCrop.x
                      const dy = e.clientY - dragStartCrop.y
                      let delta: number, newSize: number
                      if (isResizingCrop === 'top-left') {
                        delta = Math.max(-dx, -dy)
                        newSize = Math.max(50, cropBox.size + delta)
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, x: Math.max(0, prev.x - sizeChange), y: Math.max(0, prev.y - sizeChange) }))
                      } else if (isResizingCrop === 'top-right') {
                        delta = Math.max(dx, -dy)
                        newSize = Math.max(50, Math.min(imageSizeCrop.width - cropBox.x, cropBox.size + delta))
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, y: Math.max(0, prev.y - sizeChange) }))
                      } else if (isResizingCrop === 'bottom-left') {
                        delta = Math.max(-dx, dy)
                        newSize = Math.max(50, Math.min(imageSizeCrop.height - cropBox.y, cropBox.size + delta))
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, x: Math.max(0, prev.x - sizeChange) }))
                      } else {
                        delta = Math.max(dx, dy)
                        newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                        const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                        setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      }
                      setDragStartCrop({ x: e.clientX, y: e.clientY })
                    }
                  }}
                  onMouseUp={() => { setIsDraggingCrop(false); setIsResizingCrop(null) }}
                  onMouseLeave={() => { setIsDraggingCrop(false); setIsResizingCrop(null) }}
                  onTouchMove={(e) => {
                    if (!isDraggingCrop && !isResizingCrop) return
                    e.preventDefault()
                    const touch = e.touches[0]
                    const rect = cropContainerRef.current?.getBoundingClientRect()
                    if (!rect || !touch) return

                    if (isDraggingCrop) {
                      const newX = touch.clientX - rect.left - dragStartCrop.x
                      const newY = touch.clientY - rect.top - dragStartCrop.y
                      const maxX = imageSizeCrop.width - cropBox.size
                      const maxY = imageSizeCrop.height - cropBox.size
                      const offsetX = (300 - imageSizeCrop.width) / 2
                      const offsetY = (300 - imageSizeCrop.height) / 2
                      setCropBox(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(maxX, newX - offsetX)),
                        y: Math.max(0, Math.min(maxY, newY - offsetY))
                      }))
                    } else if (isResizingCrop) {
                      const dx = touch.clientX - dragStartCrop.x
                      const dy = touch.clientY - dragStartCrop.y
                      let delta: number, newSize: number
                      if (isResizingCrop === 'top-left') {
                        delta = Math.max(-dx, -dy)
                        newSize = Math.max(50, cropBox.size + delta)
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, x: Math.max(0, prev.x - sizeChange), y: Math.max(0, prev.y - sizeChange) }))
                      } else if (isResizingCrop === 'top-right') {
                        delta = Math.max(dx, -dy)
                        newSize = Math.max(50, Math.min(imageSizeCrop.width - cropBox.x, cropBox.size + delta))
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, y: Math.max(0, prev.y - sizeChange) }))
                      } else if (isResizingCrop === 'bottom-left') {
                        delta = Math.max(-dx, dy)
                        newSize = Math.max(50, Math.min(imageSizeCrop.height - cropBox.y, cropBox.size + delta))
                        const sizeChange = newSize - cropBox.size
                        setCropBox(prev => ({ ...prev, size: newSize, x: Math.max(0, prev.x - sizeChange) }))
                      } else {
                        delta = Math.max(dx, dy)
                        newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                        const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                        setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      }
                      setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                    }
                  }}
                  onTouchEnd={() => { setIsDraggingCrop(false); setIsResizingCrop(null) }}
                >
                  {/* Image */}
                  <img
                    src={tempImageUrl}
                    alt="Preview"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={{
                      width: imageSizeCrop.width,
                      height: imageSizeCrop.height,
                      maxWidth: '300px',
                      maxHeight: '300px',
                      objectFit: 'contain'
                    }}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.target as HTMLImageElement
                      const nw = img.naturalWidth
                      const nh = img.naturalHeight
                      // Scale to fit container
                      const scale = Math.min(300 / nw, 300 / nh)
                      const displayW = nw * scale
                      const displayH = nh * scale
                      setImageSizeCrop({ width: displayW, height: displayH })
                      // Center crop box
                      const size = Math.min(displayW, displayH) * 0.8
                      setCropBox({
                        x: (displayW - size) / 2,
                        y: (displayH - size) / 2,
                        size
                      })
                    }}
                  />

                  {/* Crop box with shadow overlay */}
                  <div
                    className="absolute cursor-move touch-none"
                    style={{
                      left: `${150 - imageSizeCrop.width/2 + cropBox.x}px`,
                      top: `${150 - imageSizeCrop.height/2 + cropBox.y}px`,
                      width: `${cropBox.size}px`,
                      height: `${cropBox.size}px`,
                      border: '2px solid #3b82f6',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingCrop(true)
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setDragStartCrop({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const touch = e.touches[0]
                      setIsDraggingCrop(true)
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setDragStartCrop({ x: touch.clientX - rect.left, y: touch.clientY - rect.top })
                    }}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner handles - all corners resizable */}
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
                      const pos = {
                        'top-left': '-top-2.5 -left-2.5 cursor-nw-resize',
                        'top-right': '-top-2.5 -right-2.5 cursor-ne-resize',
                        'bottom-left': '-bottom-2.5 -left-2.5 cursor-sw-resize',
                        'bottom-right': '-bottom-2.5 -right-2.5 cursor-se-resize',
                      }[corner]
                      const isBR = corner === 'bottom-right'
                      return (
                        <div key={corner} className={`absolute ${pos}`}>
                          <div className={`w-5 h-5 ${isBR ? 'bg-blue-500' : 'bg-white'} border-[3px] border-blue-500 rounded-sm`} />
                          <div
                            className="absolute -inset-[25px] w-[70px] h-[70px]"
                            style={{ touchAction: 'none' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setIsResizingCrop(corner)
                              setDragStartCrop({ x: e.clientX, y: e.clientY })
                            }}
                            onTouchStart={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const touch = e.touches[0]
                              setIsResizingCrop(corner)
                              setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag any corner to resize
                </p>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowAvatarCropModal(false); setShowAvatarUploadModal(true) }} className="flex-1">Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!tempImageUrl || !canvasRef.current) return
                      setUploading(true)
                      try {
                        const canvas = canvasRef.current
                        const ctx = canvas.getContext('2d')
                        if (!ctx) throw new Error('No canvas context')

                        // Output size (512x512 for crisp profile pictures)
                        const outputSize = 512
                        canvas.width = outputSize
                        canvas.height = outputSize

                        const img = new Image()
                        img.crossOrigin = 'anonymous'

                        await new Promise<void>((resolve, reject) => {
                          img.onload = () => resolve()
                          img.onerror = () => reject(new Error('Failed to load image'))
                          img.src = tempImageUrl
                        })

                        // Calculate source rectangle from crop box
                        const nw = img.naturalWidth
                        const nh = img.naturalHeight
                        const scale = Math.min(300 / nw, 300 / nh)

                        // Convert crop box coordinates back to original image coordinates
                        const srcX = cropBox.x / scale
                        const srcY = cropBox.y / scale
                        const srcSize = cropBox.size / scale

                        ctx.clearRect(0, 0, outputSize, outputSize)
                        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize)

                        // Convert to blob and upload
                        const blob = await new Promise<Blob>((resolve, reject) => {
                          canvas.toBlob(
                            (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
                            'image/png',
                            0.95
                          )
                        })

                        const supabase = createClient()
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) throw new Error('Not authenticated')

                        const fileName = `${user.id}/avatar-${Date.now()}.png`
                        const { error } = await supabase.storage.from("onepage-assets").upload(fileName, blob, { upsert: true })
                        if (error) throw error

                        const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
                        updateProfile({ avatar_url: publicUrl, avatar_video_url: null })
                        setShowAvatarCropModal(false)
                        URL.revokeObjectURL(tempImageUrl)
                        setTempImageUrl(null)
                        setTempImageFile(null)
                        setCropBox({ x: 50, y: 50, size: 200 })
                      } catch (error) {
                        console.error("Upload error:", error)
                        alert('Failed to upload image')
                      } finally {
                        setUploading(false)
                      }
                    }}
                    className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]"
                    disabled={uploading}
                  >
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Selection Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoModal(false); setShowAvatarEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Profile Video</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => videoFileInputRef.current?.click()} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Upload className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left">
                <p className="font-medium">Upload video</p>
                <p className="text-sm text-gray-500">MP4, WebM up to 100MB</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <input 
              ref={videoFileInputRef} 
              type="file" 
              accept="video/mp4,video/webm,video/quicktime" 
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                
                if (file.size > 100 * 1024 * 1024) {
                  alert('Video file must be less than 100MB')
                  return
                }
                
                const url = URL.createObjectURL(file)
                setTempVideoUrl(url)
                setTempVideoFile(file)
                setShowVideoModal(false)
                setShowVideoCropModal(true)
              }} 
              className="hidden" 
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Crop Modal - Simple 1:1 crop like image crop */}
      <Dialog open={showVideoCropModal} onOpenChange={(open) => {
        setShowVideoCropModal(open)
        if (!open && tempVideoUrl) {
          URL.revokeObjectURL(tempVideoUrl)
          setTempVideoUrl(null)
          setTempVideoFile(null)
          setVideoCropBox({ x: 10, y: 10, width: 80, height: 80 })
        }
      }}>
        <DialogContent
          className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoCropModal(false); setShowVideoModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Video</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempVideoUrl && (
              <>
                <div
                  ref={videoContainerRef}
                  className="relative mx-auto bg-black rounded-xl select-none overflow-hidden"
                  style={{ width: '300px', height: '300px', touchAction: 'none' }}
                >
                  <video
                    src={tempVideoUrl}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover pointer-events-none"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      const video = e.target as HTMLVideoElement
                      setVideoNaturalSize({ width: video.videoWidth, height: video.videoHeight })
                    }}
                  />

                  {/* Crop box - 1:1 square ratio */}
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: `${videoCropBox.x}%`,
                      top: `${videoCropBox.y}%`,
                      width: `${videoCropBox.width}%`,
                      height: `${videoCropBox.width}%`,
                      border: '2px solid #3b82f6',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      touchAction: 'none'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingVideoCrop(true)
                      setVideoDragStart({
                        x: e.clientX,
                        y: e.clientY,
                        boxX: videoCropBox.x,
                        boxY: videoCropBox.y,
                        boxW: videoCropBox.width,
                        boxH: videoCropBox.height
                      })
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const touch = e.touches[0]
                      setIsDraggingVideoCrop(true)
                      setVideoDragStart({
                        x: touch.clientX,
                        y: touch.clientY,
                        boxX: videoCropBox.x,
                        boxY: videoCropBox.y,
                        boxW: videoCropBox.width,
                        boxH: videoCropBox.height
                      })
                    }}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner handles - all corners resizable with 70px touch targets */}
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
                      const pos = {
                        'top-left': '-top-2.5 -left-2.5 cursor-nw-resize',
                        'top-right': '-top-2.5 -right-2.5 cursor-ne-resize',
                        'bottom-left': '-bottom-2.5 -left-2.5 cursor-sw-resize',
                        'bottom-right': '-bottom-2.5 -right-2.5 cursor-se-resize',
                      }[corner]
                      const isBR = corner === 'bottom-right'
                      return (
                        <div key={corner} className={`absolute ${pos}`}>
                          <div className={`w-5 h-5 ${isBR ? 'bg-blue-500' : 'bg-white'} border-[3px] border-blue-500 rounded-sm`} />
                          <div
                            className="absolute -inset-[25px] w-[70px] h-[70px]"
                            style={{ touchAction: 'none' }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setIsResizingVideoCrop(corner)
                              setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                            }}
                            onTouchStart={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const touch = e.touches[0]
                              setIsResizingVideoCrop(corner)
                              setVideoDragStart({ x: touch.clientX, y: touch.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>

                  {/* Global mouse and touch handlers */}
                  {(isDraggingVideoCrop || isResizingVideoCrop) && (
                    <div
                      className="fixed inset-0 z-50"
                      style={{ touchAction: 'none' }}
                      onMouseMove={(e) => {
                        const container = videoContainerRef.current
                        if (!container) return
                        const rect = container.getBoundingClientRect()
                        const deltaX = ((e.clientX - videoDragStart.x) / rect.width) * 100
                        const deltaY = ((e.clientY - videoDragStart.y) / rect.height) * 100

                        if (isDraggingVideoCrop) {
                          let newX = videoDragStart.boxX + deltaX
                          let newY = videoDragStart.boxY + deltaY
                          newX = Math.max(0, Math.min(100 - videoCropBox.width, newX))
                          newY = Math.max(0, Math.min(100 - videoCropBox.width, newY))
                          setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
                        } else if (isResizingVideoCrop) {
                          const { boxX, boxY, boxW } = videoDragStart
                          let newSize: number, newX: number, newY: number
                          if (isResizingVideoCrop === 'top-left') {
                            const d = Math.max(-deltaX, -deltaY)
                            newSize = Math.max(20, boxW + d)
                            newX = Math.max(0, boxX - (newSize - boxW))
                            newY = Math.max(0, boxY - (newSize - boxW))
                            setVideoCropBox({ x: newX, y: newY, width: newSize, height: newSize })
                          } else if (isResizingVideoCrop === 'top-right') {
                            const d = Math.max(deltaX, -deltaY)
                            newSize = Math.max(20, Math.min(100 - boxX, boxW + d))
                            newY = Math.max(0, boxY - (newSize - boxW))
                            setVideoCropBox(prev => ({ ...prev, y: newY, width: newSize, height: newSize }))
                          } else if (isResizingVideoCrop === 'bottom-left') {
                            const d = Math.max(-deltaX, deltaY)
                            newSize = Math.max(20, Math.min(100 - boxY, boxW + d))
                            newX = Math.max(0, boxX - (newSize - boxW))
                            setVideoCropBox(prev => ({ ...prev, x: newX, width: newSize, height: newSize }))
                          } else {
                            newSize = Math.max(20, Math.min(100 - Math.max(boxX, boxY), boxW + Math.max(deltaX, deltaY)))
                            setVideoCropBox(prev => ({ ...prev, width: newSize, height: newSize }))
                          }
                        }
                      }}
                      onMouseUp={() => {
                        setIsDraggingVideoCrop(false)
                        setIsResizingVideoCrop(null)
                      }}
                      onTouchMove={(e) => {
                        e.preventDefault()
                        const touch = e.touches[0]
                        const container = videoContainerRef.current
                        if (!container || !touch) return
                        const rect = container.getBoundingClientRect()
                        const deltaX = ((touch.clientX - videoDragStart.x) / rect.width) * 100
                        const deltaY = ((touch.clientY - videoDragStart.y) / rect.height) * 100

                        if (isDraggingVideoCrop) {
                          let newX = videoDragStart.boxX + deltaX
                          let newY = videoDragStart.boxY + deltaY
                          newX = Math.max(0, Math.min(100 - videoCropBox.width, newX))
                          newY = Math.max(0, Math.min(100 - videoCropBox.width, newY))
                          setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
                        } else if (isResizingVideoCrop) {
                          const { boxX, boxY, boxW } = videoDragStart
                          let newSize: number, newX: number, newY: number
                          if (isResizingVideoCrop === 'top-left') {
                            const d = Math.max(-deltaX, -deltaY)
                            newSize = Math.max(20, boxW + d)
                            newX = Math.max(0, boxX - (newSize - boxW))
                            newY = Math.max(0, boxY - (newSize - boxW))
                            setVideoCropBox({ x: newX, y: newY, width: newSize, height: newSize })
                          } else if (isResizingVideoCrop === 'top-right') {
                            const d = Math.max(deltaX, -deltaY)
                            newSize = Math.max(20, Math.min(100 - boxX, boxW + d))
                            newY = Math.max(0, boxY - (newSize - boxW))
                            setVideoCropBox(prev => ({ ...prev, y: newY, width: newSize, height: newSize }))
                          } else if (isResizingVideoCrop === 'bottom-left') {
                            const d = Math.max(-deltaX, deltaY)
                            newSize = Math.max(20, Math.min(100 - boxY, boxW + d))
                            newX = Math.max(0, boxX - (newSize - boxW))
                            setVideoCropBox(prev => ({ ...prev, x: newX, width: newSize, height: newSize }))
                          } else {
                            newSize = Math.max(20, Math.min(100 - Math.max(boxX, boxY), boxW + Math.max(deltaX, deltaY)))
                            setVideoCropBox(prev => ({ ...prev, width: newSize, height: newSize }))
                          }
                        }
                      }}
                      onTouchEnd={() => {
                        setIsDraggingVideoCrop(false)
                        setIsResizingVideoCrop(null)
                      }}
                    />
                  )}
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag any corner to resize
                </p>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowVideoCropModal(false); setShowVideoModal(true) }} className="flex-1">Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!tempVideoFile) return
                      setUploadingVideo(true)
                      try {
                        const supabase = createClient()
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return

                        const fileName = `${user.id}/avatar-video-${Date.now()}.${tempVideoFile.name.split('.').pop()}`
                        const { error } = await supabase.storage.from("onepage-assets").upload(fileName, tempVideoFile, { upsert: true })
                        if (error) throw error

                        const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
                        updateProfile({
                          avatar_video_url: publicUrl,
                          avatar_url: null,
                          avatar_video_crop: videoCropBox
                        })
                        setShowVideoCropModal(false)
                        if (tempVideoUrl) URL.revokeObjectURL(tempVideoUrl)
                        setTempVideoUrl(null)
                        setTempVideoFile(null)
                        setVideoCropBox({ x: 10, y: 10, width: 80, height: 80 })
                      } catch (error) {
                        console.error("Upload error:", error)
                        alert('Failed to upload video')
                      } finally {
                        setUploadingVideo(false)
                      }
                    }}
                    className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]"
                    disabled={uploadingVideo}
                  >
                    {uploadingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface BlockItemProps {
  block: OnePageBlock
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  onArchive?: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: () => void
  isFirst: boolean
  isLast: boolean
  socialLinks: OnePageSocialLinks
  onOpenImageLibrary: (blockId: string, fieldType?: string) => void
  onOpenSocialModal: () => void
  onOpenThumbnailModal?: (blockId: string) => void
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
  onOpenStreamingModal?: (platform: string, index: number, data: LinkButtonBlockData, updateFn: (data: Partial<LinkButtonBlockData>) => void) => void
  /** The grip's keys: the arrows move the card (LinksTab moveWithKeys). */
  onGripKeyDown?: (e: React.KeyboardEvent, name: string) => void
  onMoveChildToMainList?: (childBlock: OnePageBlock, groupId: string) => void
  onOpenAddBlockModal?: (groupId: string) => void
}

function BlockItem({
  block,
  isSelected,
  onSelect,
  onRemove,
  onArchive,
  onMoveUp,
  onMoveDown,
  onToggle,
  isFirst,
  isLast,
  socialLinks,
  onOpenImageLibrary,
  onOpenSocialModal,
  onOpenThumbnailModal,
  onUrlChangeWithAutoFetch,
  onOpenStreamingModal,
  onGripKeyDown,
  onMoveChildToMainList,
  onOpenAddBlockModal,
}: BlockItemProps) {
  const { updateBlock, onepage } = useOnePage()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAnimationMenu, setShowAnimationMenu] = useState(false)
  const [showAnimationSheet, setShowAnimationSheet] = useState(false)
  const [showButtonTextMenu, setShowButtonTextMenu] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsData, setStatsData] = useState<{ total_clicks: number; total_views: number; chart_data: { date: string; clicks: number; views: number }[] } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [clickCount, setClickCount] = useState<number | null>(null)
  /* The date picker every page in /app shares, opened in place in this dialog. */
  const statsTimeZone = useMemo(() => viewerTimeZone(), [])
  const statsToday = todayIn(statsTimeZone, Date.now())
  const [statsPeriod, setStatsPeriod] = useState<RangeValue>(() => resolveValue({ preset: 'last_7_days' }, statsToday, 'last_7_days'))
  const [isMobileStatsViewport, setIsMobileStatsViewport] = useState(false)
  const [isStatsSheetPresented, setIsStatsSheetPresented] = useState(false)
  const [statsSheetDragY, setStatsSheetDragY] = useState(0)
  const [isStatsSheetDragging, setIsStatsSheetDragging] = useState(false)
  const statsSheetStartYRef = useRef(0)
  const statsSheetLastYRef = useRef(0)
  const statsSheetLastTimeRef = useRef(0)
  const statsSheetVelocityRef = useRef(0)
  const statsSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAnimationSheetPresented, setIsAnimationSheetPresented] = useState(false)
  const [animationSheetDragY, setAnimationSheetDragY] = useState(0)
  const [isAnimationSheetDragging, setIsAnimationSheetDragging] = useState(false)
  const animationSheetStartYRef = useRef(0)
  const animationSheetLastYRef = useRef(0)
  const animationSheetLastTimeRef = useRef(0)
  const animationSheetVelocityRef = useRef(0)
  const animationSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationMenuRef = useRef<HTMLDivElement>(null)
  const buttonTextMenuRef = useRef<HTMLDivElement>(null)

  const animationOptions = [
    { id: 'none', label: 'None' },
    { id: 'pulse', label: 'Pulse' },
    { id: 'bounce', label: 'Bounce' },
    { id: 'shake', label: 'Shake' },
    { id: 'glow', label: 'Glow' },
    { id: 'swipe', label: 'Swipe' },
  ] as const

  // Close animation menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (animationMenuRef.current && !animationMenuRef.current.contains(e.target as Node)) {
        setShowAnimationMenu(false)
      }
    }
    if (showAnimationMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAnimationMenu])

  // Close button text menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonTextMenuRef.current && !buttonTextMenuRef.current.contains(e.target as Node)) {
        setShowButtonTextMenu(false)
      }
    }
    if (showButtonTextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showButtonTextMenu])

  useEffect(() => {
    const checkViewport = () => {
      if (typeof window === 'undefined') return
      setIsMobileStatsViewport(window.innerWidth < 640)
    }

    checkViewport()
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  useEffect(() => {
    if (!showStatsModal || !isMobileStatsViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsStatsSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showStatsModal, isMobileStatsViewport])

  useEffect(() => {
    if (!showAnimationSheet || !isMobileStatsViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsAnimationSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showAnimationSheet, isMobileStatsViewport])

  useEffect(() => {
    return () => {
      if (statsSheetCloseTimerRef.current) clearTimeout(statsSheetCloseTimerRef.current)
      if (animationSheetCloseTimerRef.current) clearTimeout(animationSheetCloseTimerRef.current)
    }
  }, [])

  const closeStatsSheet = useCallback(() => {
    if (!showStatsModal) return

    if (!isMobileStatsViewport) {
      setShowStatsModal(false)
      return
    }

    setIsStatsSheetDragging(false)
    setStatsSheetDragY(0)
    setIsStatsSheetPresented(false)

    if (statsSheetCloseTimerRef.current) clearTimeout(statsSheetCloseTimerRef.current)
    statsSheetCloseTimerRef.current = setTimeout(() => {
      setShowStatsModal(false)
    }, SHEET_SLIDE_MS)
  }, [showStatsModal, isMobileStatsViewport])

  const closeAnimationSheet = useCallback(() => {
    if (!showAnimationSheet) return

    if (!isMobileStatsViewport) {
      setShowAnimationSheet(false)
      return
    }

    setIsAnimationSheetDragging(false)
    setAnimationSheetDragY(0)
    setIsAnimationSheetPresented(false)

    if (animationSheetCloseTimerRef.current) clearTimeout(animationSheetCloseTimerRef.current)
    animationSheetCloseTimerRef.current = setTimeout(() => {
      setShowAnimationSheet(false)
    }, SHEET_SLIDE_MS)
  }, [showAnimationSheet, isMobileStatsViewport])

  // Fetch stats when modal is opened or timeframe changes
  const fetchStats = async (period: RangeValue) => {
    if (!onepage?.id) return
    setStatsLoading(true)
    try {
      const b = boundsOf(period, statsTimeZone, Date.now())
      const url = `/api/onepage/stats?onepage_id=${onepage.id}&block_id=${block.id}&start=${encodeURIComponent(new Date(b.start).toISOString())}&end=${encodeURIComponent(new Date(b.end).toISOString())}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setStatsData(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  // Refetch when timeframe changes
  useEffect(() => {
    if (showStatsModal) fetchStats(statsPeriod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsPeriod.preset, statsPeriod.start, statsPeriod.end, showStatsModal])

  // Fetch click count on mount for link buttons and email capture
  useEffect(() => {
    const fetchClickCount = async () => {
      if (!onepage?.id || (block.type !== "link_button" && block.type !== "email_capture" && block.type !== "group" && block.type !== "product")) return
      try {
        const response = await fetch(`/api/onepage/stats?onepage_id=${onepage.id}&block_id=${block.id}&days=365`)
        if (response.ok) {
          const data = await response.json()
          setClickCount(data.total_clicks || 0)
        }
      } catch (error) {
        // Silent fail for click count
      }
    }
    fetchClickCount()
  }, [onepage?.id, block.id, block.type])

  const getBlockPreview = () => {
    switch (block.type) {
      case "link_button": {
        const data = block.data as LinkButtonBlockData
        // Truncate URL for display - show just the domain/path without full URL
        const displayUrl = data.url ? (data.url.length > 40 ? data.url.slice(0, 40) + "..." : data.url) : "https://..."
        // Auto-detect Notion URLs and show Notion icon
        const isNotionUrl = data.url?.toLowerCase().includes('notion.so') || data.url?.toLowerCase().includes('notion.site')
        const effectiveIconId = data.icon || (isNotionUrl ? 'notion' : undefined)
        return { title: data.label || "My Link", subtitle: displayUrl, icon: Link, thumbnail_url: data.thumbnail_url, iconId: effectiveIconId }
      }
      case "header":
        return { title: "Header", subtitle: "Profile section", icon: User }
      case "text": {
        const data = block.data as TextBlockData
        return { title: data.content?.slice(0, 30) || "Text block", subtitle: "Text", icon: Type }
      }
      case "image":
        return { title: "Image", subtitle: "Image block", icon: ImageIcon }
      case "divider":
        return { title: "Divider", subtitle: "Spacing", icon: Minus }
      case "email_capture": {
        const data = block.data as EmailCaptureBlockData
        return { title: data.headline || "Email Signup", subtitle: "Lead capture form", icon: Mail }
      }
      case "social_row":
        return { title: "Social Icons", subtitle: "Social links", icon: Share2 }
      case "product": {
        const data = block.data as ProductBlockData
        return { title: data.product_title || "Digital Product", subtitle: data.product_price_cents ? `$${(data.product_price_cents / 100).toFixed(2)}` : "Select product", icon: ShoppingBag, thumbnail_url: data.custom_thumbnail || data.product_thumbnail }
      }
      case "group": {
        const data = block.data as GroupBlockData
        const childCount = data.children?.length || 0
        return { title: data.title || "Group", subtitle: `${childCount} item${childCount !== 1 ? 's' : ''} · ${data.layout}`, icon: Layers }
      }
      case "pdf_document": {
        const data = block.data as PDFDocumentBlockData
        return { title: data.title || "PDF Document", subtitle: data.pdf_file_url ? "PDF uploaded" : "No file", icon: FileText, thumbnail_url: data.thumbnail_url }
      }
      case "food_menu": {
        const data = block.data as FoodMenuBlockData
        return { title: data.title || "Menu", subtitle: data.pdf_file_url ? "Menu uploaded" : "No file", icon: FileText, thumbnail_url: data.thumbnail_url }
      }
      case "calendly": {
        const data = block.data as CalendlyBlockData
        return { title: data.title || "Book a Meeting", subtitle: data.calendly_url ? "Calendly connected" : "Add Calendly URL", icon: Calendar, thumbnail_url: data.thumbnail_url }
      }
      case "heading":
      case "faq":
      case "countdown":
      case "map":
      case "video":
        return extraBlockRow(block)
      default:
        return { title: block.type, subtitle: "", icon: Link }
    }
  }

  const preview = getBlockPreview()
  const Icon = preview.icon

  const isHeaderBlock = block.type === "header"
  const isLinkButton = block.type === "link_button"
  const isEmailCapture = block.type === "email_capture"
  const isGroup = block.type === "group"
  const isProduct = block.type === "product"
  const isPDFDocument = block.type === "pdf_document"
  const isFoodMenu = block.type === "food_menu"
  const isCalendly = block.type === "calendly"
  const isImage = block.type === "image"
  const hasStats = isLinkButton || isEmailCapture || isGroup || isProduct || isPDFDocument || isFoodMenu || isCalendly || isImage
  const hasAnimation = isLinkButton || isProduct || isEmailCapture || isPDFDocument || isFoodMenu || isCalendly
  const hasThumbnail = (preview as any).thumbnail_url || hasLinkIcon((preview as any).iconId)

  return (
    <div
      className={cn(
        "border rounded-xl bg-white relative transition-[border-color,box-shadow] duration-200",
        isSelected ? "ring-1 ring-gray-400 border-gray-300" : "hover:border-gray-300",
        !block.enabled && "opacity-50",
      )}
    >
      {/*
        The card's row is where it is picked up (components/onepage/link-reorder.ts):
        the grip at once, anywhere else on the row after a short hold on a phone
        or a 3px move with a mouse. The buttons in the row stay buttons.
      */}
      <div
        className={cn(
          "flex items-center gap-3 p-3",
          !isHeaderBlock && "select-none [-webkit-touch-callout:none]"
        )}
        data-reorder-zone={isHeaderBlock ? undefined : ""}
      >
        {!isHeaderBlock && (
          <button
            type="button"
            data-reorder-grip={block.id}
            aria-label={`Move ${preview.title}`}
            aria-describedby="onepage-reorder-help"
            onKeyDown={(e) => onGripKeyDown?.(e, preview.title)}
            className="-my-0.5 -ml-1.5 -mr-1 grid h-11 w-8 shrink-0 cursor-grab touch-none select-none place-items-center rounded-lg text-[#b4b8c0] outline-none transition-colors duration-150 hover:text-[#6b7280] active:cursor-grabbing focus-visible:text-[#1a1a2e] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.35)] [-webkit-tap-highlight-color:transparent]"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}

        {/* Clickable thumbnail for link buttons, product blocks, and calendly */}
        {(isLinkButton || isProduct || isCalendly) && onOpenThumbnailModal ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenThumbnailModal(block.id)
            }}
            className="group relative w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden hover:ring-2 hover:ring-gray-300 transition-all"
          >
            {(preview as any).thumbnail_url ? (
              <img
                src={(preview as any).thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : hasLinkIcon((preview as any).iconId) ? (
              <LinkIcon name={(preview as any).iconId} size={20} className="text-gray-500" />
            ) : (
              <Icon className="h-5 w-5 text-gray-500" />
            )}
            {/* Pencil icon always visible in corner */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center">
              <Pencil className="w-2.5 h-2.5 text-gray-500" />
            </div>
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
          </button>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
            {(preview as any).thumbnail_url ? (
              <img
                src={(preview as any).thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : hasLinkIcon((preview as any).iconId) ? (
              <LinkIcon name={(preview as any).iconId} size={20} className="text-gray-500" />
            ) : (
              <Icon className="h-5 w-5 text-gray-500" />
            )}
          </div>
        )}

        {/* Title and subtitle - clickable to select block */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
          <p className="font-medium text-sm truncate">{preview.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{preview.subtitle}</span>
            <BlockBadges block={block} />
          </p>
        </div>

        {/* Warning icon for link blocks without URL */}
        {isLinkButton && !(block.data as LinkButtonBlockData).url && (
          <div className="p-1" title="No link added">
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
        )}

        {/* Info icon for social_row blocks not positioned correctly */}
        {block.type === "social_row" && (() => {
          const blocks = onepage?.draft_blocks || []
          const headerIndex = blocks.findIndex(b => b.type === "header")
          const socialRowIndex = blocks.findIndex(b => b.id === block.id)
          const isAtBottom = socialRowIndex === blocks.length - 1
          const isRightAfterHeader = headerIndex !== -1 && socialRowIndex === headerIndex + 1
          const isPositionedCorrectly = isAtBottom || isRightAfterHeader

          if (!isPositionedCorrectly) {
            return (
              <div className="relative group/info">
                <div className="p-1 cursor-help">
                  <Info className="h-4 w-4 text-blue-400" />
                </div>
                <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 shadow-lg">
                  Position this block under the Header block or at the bottom for better look
                </div>
              </div>
            )
          }
          return null
        })()}

        {/* Animation control for link buttons and product blocks */}
        {hasAnimation && (
          <div className="relative" ref={animationMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (isMobileStatsViewport) {
                  setIsAnimationSheetPresented(false)
                  setShowAnimationSheet(sheetOpening(animationSheetCloseTimerRef, showAnimationSheet, setIsAnimationSheetPresented))
                  return
                }
                setShowAnimationMenu(!showAnimationMenu)
              }}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                (block.data as any).animation_type && (block.data as any).animation_type !== 'none'
                  ? "text-[#1a1a2e] bg-[#f4f4f6] hover:bg-[#ececef]"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
              title="Animation"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {/* Animation dropdown menu */}
            {!isMobileStatsViewport && showAnimationMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                {animationOptions.map((anim) => {
                  const currentAnimation = (block.data as any).animation_type || 'none'
                  return (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateBlock(block.id, {
                          data: {
                            ...block.data,
                            animation_type: anim.id as 'none' | 'pulse' | 'bounce' | 'shake' | 'glow' | 'swipe'
                          }
                        })
                        setShowAnimationMenu(false)
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm transition-colors",
                        currentAnimation === anim.id
                          ? "bg-[#f4f4f6] text-[#1a1a2e] font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {anim.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {hasAnimation && (
          <Dialog open={showAnimationSheet} onOpenChange={(open) => {
            if (open) {
              setIsAnimationSheetPresented(false)
              setShowAnimationSheet(sheetOpening(animationSheetCloseTimerRef, showAnimationSheet, setIsAnimationSheetPresented))
              return
            }
            closeAnimationSheet()
          }}>
            <DialogContent
              showCloseButton
              disableDefaultAnimations={isMobileStatsViewport}
              overlayClassName={isMobileStatsViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isAnimationSheetPresented ? "opacity-100" : "opacity-0") : undefined}
              onTouchStart={(e) => {
                if (!isMobileStatsViewport) return
                const touchY = e.touches[0]?.clientY ?? 0
                const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                if (touchY - bounds.top <= 72) {
                  animationSheetStartYRef.current = touchY
                  animationSheetLastYRef.current = touchY
                  animationSheetLastTimeRef.current = Date.now()
                  animationSheetVelocityRef.current = 0
                  setIsAnimationSheetDragging(true)
                }
              }}
              onTouchMove={(e) => {
                if (!isMobileStatsViewport || !isAnimationSheetDragging) return
                const currentY = e.touches[0]?.clientY ?? 0
                const diff = currentY - animationSheetStartYRef.current
                if (diff > 0) {
                  e.preventDefault()
                  const now = Date.now()
                  const dt = Math.max(1, now - animationSheetLastTimeRef.current)
                  animationSheetVelocityRef.current = (currentY - animationSheetLastYRef.current) / dt
                  animationSheetLastYRef.current = currentY
                  animationSheetLastTimeRef.current = now

                  const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
                  setAnimationSheetDragY(resisted)
                }
              }}
              onTouchEnd={() => {
                if (!isMobileStatsViewport || !isAnimationSheetDragging) return
                setIsAnimationSheetDragging(false)
                if (animationSheetDragY > 92 || animationSheetVelocityRef.current > 0.55) {
                  closeAnimationSheet()
                  return
                }
                setAnimationSheetDragY(0)
              }}
              className={cn(
                "p-0 gap-0 overflow-hidden mx-auto border-[#ececf1]",
                isMobileStatsViewport
                  ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
                  : "w-[calc(100%-32px)] max-w-[360px] rounded-2xl"
              )}
              style={isMobileStatsViewport ? {
                position: 'fixed',
                top: 'auto',
                left: 0,
                right: 0,
                ...sheetAboveKeyboard(0.75),
                transform: isAnimationSheetPresented ? `translate3d(0, ${animationSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
                willChange: 'transform',
                backfaceVisibility: 'hidden' as const,
                transition: isAnimationSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
              } : undefined}
            >
              {isMobileStatsViewport && (
                <div className="pt-3 pb-2 flex justify-center cursor-pointer" data-sheet-handle>
                  <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                </div>
              )}
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-base font-semibold">Animation</DialogTitle>
              </DialogHeader>
              <div className="p-3 max-h-[65vh] overflow-y-auto pb-[max(16px,env(safe-area-inset-bottom))]">
                <div className="space-y-1">
                  {animationOptions.map((anim) => {
                    const currentAnimation = (block.data as any).animation_type || 'none'
                    return (
                      <button
                        key={anim.id}
                        type="button"
                        onClick={() => {
                          updateBlock(block.id, {
                            data: {
                              ...block.data,
                              animation_type: anim.id as 'none' | 'pulse' | 'bounce' | 'shake' | 'glow' | 'swipe'
                            }
                          })
                          closeAnimationSheet()
                        }}
                        className={cn(
                          "w-full px-3 py-2.5 rounded-xl text-left text-sm transition-colors",
                          currentAnimation === anim.id
                            ? "bg-[#f4f4f6] text-[#1a1a2e] font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {anim.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Stats control for link buttons and email capture */}
        {hasStats && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsStatsSheetPresented(false)
                /* Opening the dialog fetches, in the effect that watches it. */
                setShowStatsModal(sheetOpening(statsSheetCloseTimerRef, showStatsModal, setIsStatsSheetPresented))
              }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="View Stats"
            >
              <BarChart2 className="h-4 w-4" />
              {clickCount !== null && (
                <span className="text-xs font-medium">{clickCount}</span>
              )}
            </button>

            {/* Stats Modal */}
            <Dialog open={showStatsModal} onOpenChange={(open) => {
              if (open) {
                setIsStatsSheetPresented(false)
                setShowStatsModal(sheetOpening(statsSheetCloseTimerRef, showStatsModal, setIsStatsSheetPresented))
                return
              }
              closeStatsSheet()
            }}>
              <DialogContent
                showCloseButton
                disableDefaultAnimations={isMobileStatsViewport}
                overlayClassName={isMobileStatsViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isStatsSheetPresented ? "opacity-100" : "opacity-0") : undefined}
                onTouchStart={(e) => {
                  if (!isMobileStatsViewport) return
                  const touchY = e.touches[0]?.clientY ?? 0
                  const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  if (touchY - bounds.top <= 72) {
                    statsSheetStartYRef.current = touchY
                    statsSheetLastYRef.current = touchY
                    statsSheetLastTimeRef.current = Date.now()
                    statsSheetVelocityRef.current = 0
                    setIsStatsSheetDragging(true)
                  }
                }}
                onTouchMove={(e) => {
                  if (!isMobileStatsViewport || !isStatsSheetDragging) return
                  const currentY = e.touches[0]?.clientY ?? 0
                  const diff = currentY - statsSheetStartYRef.current
                  if (diff > 0) {
                    e.preventDefault()
                    const now = Date.now()
                    const dt = Math.max(1, now - statsSheetLastTimeRef.current)
                    statsSheetVelocityRef.current = (currentY - statsSheetLastYRef.current) / dt
                    statsSheetLastYRef.current = currentY
                    statsSheetLastTimeRef.current = now

                    const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
                    setStatsSheetDragY(resisted)
                  }
                }}
                onTouchEnd={() => {
                  if (!isMobileStatsViewport || !isStatsSheetDragging) return
                  setIsStatsSheetDragging(false)
                  if (statsSheetDragY > 92 || statsSheetVelocityRef.current > 0.55) {
                    closeStatsSheet()
                    return
                  }
                  setStatsSheetDragY(0)
                }}
                className={cn(
                  "p-0 gap-0 overflow-hidden mx-auto border-[#ececf1]",
                  isMobileStatsViewport
                    ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
                    : "w-[calc(100%-32px)] max-w-[420px] rounded-2xl"
                )}
                style={isMobileStatsViewport ? {
                  position: 'fixed',
                  top: 'auto',
                  left: 0,
                  right: 0,
                  ...sheetAboveKeyboard(0.75),
                  transform: isStatsSheetPresented ? `translate3d(0, ${statsSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden' as const,
                  transition: isStatsSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                } : undefined}
              >
                {isMobileStatsViewport && (
                  <div className="pt-3 pb-2 flex justify-center cursor-pointer">
                    <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                  </div>
                )}
                <DialogHeader className="p-4 border-b">
                  <DialogTitle className="text-base font-semibold">{isGroup ? "Group Stats" : isEmailCapture ? "Form Stats" : isPDFDocument ? "PDF Stats" : isImage ? "Image Stats" : "Link Stats"}</DialogTitle>
                </DialogHeader>

                <div className={cn("p-4", isMobileStatsViewport && "max-h-[75vh] overflow-y-auto pb-[max(16px,env(safe-area-inset-bottom))]")}>
                  {/* The period: the same picker as every page in /app. */}
                  <div className="mb-4">
                    <DateRangePicker value={statsPeriod} onChange={setStatsPeriod} today={statsToday} inline />
                  </div>

                  {/* The OnePage chart from Analytics, with this block's figures (components/onepage/link-stats-chart). */}
                  <LinkStatsChart
                    stats={statsData}
                    loading={statsLoading}
                    clicksLabel={isEmailCapture ? "Submissions" : isPDFDocument ? "Opens" : "Clicks"}
                    start={statsPeriod.start}
                    end={statsPeriod.end}
                    endIsToday={statsPeriod.end === statsToday}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        <BlockToggle checked={block.enabled} onCheckedChange={onToggle} label={`Show ${preview.title}`} />
      </div>

      {isSelected && (
        <div className="border-t p-4 space-y-4 bg-gray-50/50">
          <BlockEditor
            block={block}
            socialLinks={socialLinks}
            onOpenImageLibrary={onOpenImageLibrary}
            onOpenSocialModal={onOpenSocialModal}
            onOpenThumbnailModal={onOpenThumbnailModal}
            onUrlChangeWithAutoFetch={onUrlChangeWithAutoFetch}
            onOpenStreamingModal={onOpenStreamingModal}
            onOpenAddBlockModal={onOpenAddBlockModal}
            onMoveChildToMainList={onMoveChildToMainList}
          />
          {!isHeaderBlock && (
            <div className="pt-3 border-t">
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={onMoveUp} disabled={isFirst} className="h-8 w-8 p-0">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onMoveDown} disabled={isLast} className="h-8 w-8 p-0">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-sm text-muted-foreground text-center">Remove this block?</p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onRemove()
                          setShowDeleteConfirm(false)
                        }}
                        className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1">Permanently remove</p>
                    </div>
                    <div className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (onArchive) onArchive()
                          setShowDeleteConfirm(false)
                        }}
                        className="w-full text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300"
                      >
                        <Archive className="h-3.5 w-3.5 mr-1.5" />
                        Archive
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1">Restore anytime</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full text-muted-foreground h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Seller product interface for product selector
interface SellerProduct {
  id: string
  title: string
  price_cents: number
  thumbnail_url?: string | null
  description?: string | null
  slug?: string | null
}

function BlockEditor({
  block,
  socialLinks,
  onOpenImageLibrary,
  onOpenSocialModal,
  onOpenThumbnailModal,
  onUrlChangeWithAutoFetch,
  onOpenStreamingModal,
  onOpenAddBlockModal,
  onMoveChildToMainList,
  updateBlockOverride,
  sellerProducts,
}: {
  block: OnePageBlock
  socialLinks: OnePageSocialLinks
  onOpenImageLibrary: (blockId: string, fieldType?: string) => void
  onOpenSocialModal: () => void
  onOpenThumbnailModal?: (blockId: string) => void
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
  onOpenStreamingModal?: (platform: string, index: number, data: LinkButtonBlockData, updateFn: (data: Partial<LinkButtonBlockData>) => void) => void
  onOpenAddBlockModal?: (groupId: string) => void
  onMoveChildToMainList?: (childBlock: OnePageBlock, groupId: string) => void
  updateBlockOverride?: (blockId: string, updates: Partial<OnePageBlock>) => void
  sellerProducts?: SellerProduct[]
}) {
  const { updateBlock: contextUpdateBlock, updateBlockData, updateSocialLinks, setActiveSection, onepage } = useOnePage()
  const updateBlock = updateBlockOverride || contextUpdateBlock

  // Products for product block selector
  const [sellerProductsLocal, setSellerProductsLocal] = useState<SellerProduct[]>([])

  // Fetch seller products when product block is selected
  useEffect(() => {
    if (block.type === "product") {
      const fetchProducts = async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: creator } = await supabase
          .from("creators")
          .select("id")
          .eq("user_id", user.id)
          .single()

        if (!creator) return

        const { data } = await supabase
          .from("products")
          .select("id, title, price_cents, thumbnail_url, description, slug")
          .eq("creator_id", creator.id)
          .order("created_at", { ascending: false })

        setSellerProductsLocal(data || [])
      }
      fetchProducts()
    }
  }, [block.type])

  // Use provided sellerProducts or local fetch
  const effectiveSellerProducts = sellerProducts || sellerProductsLocal

  // Thumbnail editing state
  const [showThumbnailPopup, setShowThumbnailPopup] = useState(false)
  const [showIconLibrary, setShowIconLibrary] = useState(false)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  // Image block upload state
  const [imageUploading, setImageUploading] = useState<string | null>(null) // stores image item id being uploaded
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [currentImageItemId, setCurrentImageItemId] = useState<string | null>(null)

  // Drag state for social icons reordering
  const [draggedSocialId, setDraggedSocialId] = useState<string | null>(null)
  const [dragOverSocialId, setDragOverSocialId] = useState<string | null>(null)

  // Group block state
  const [groupDraggedId, setGroupDraggedId] = useState<string | null>(null)
  const [groupDragOverId, setGroupDragOverId] = useState<string | null>(null)
  const [selectedGroupChildId, setSelectedGroupChildId] = useState<string | null>(null)

  // CTA dropdown state for product block
  const [showCtaDropdown, setShowCtaDropdown] = useState(false)
  const ctaDropdownRef = useRef<HTMLDivElement>(null)

  // Product selector dropdown state
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const productDropdownRef = useRef<HTMLDivElement>(null)

  // Close CTA dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ctaDropdownRef.current && !ctaDropdownRef.current.contains(e.target as Node)) {
        setShowCtaDropdown(false)
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    if (showCtaDropdown || showProductDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCtaDropdown, showProductDropdown])

  // Sync block platforms when socialLinks change or on initial mount
  useEffect(() => {
    if (block.type === "social_row") {
      const data = block.data as SocialRowBlockData
      const activeSocials = Object.entries(socialLinks || {})
        .filter(([_, url]) => url)
        .map(([platform, url]) => ({ platform: platform as keyof OnePageSocialLinks, url: url as string }))

      // Only update if there are new platforms not in the current order
      const currentPlatforms = new Set((data.platforms || []).map(p => p.platform))
      const hasNewPlatforms = activeSocials.some(s => !currentPlatforms.has(s.platform))
      const hasRemovedPlatforms = (data.platforms || []).some(p => !socialLinks?.[p.platform as keyof typeof socialLinks])

      // Also sync if platforms is empty but there are active social links (initial mount fix)
      const needsInitialSync = (data.platforms || []).length === 0 && activeSocials.length > 0

      if (hasNewPlatforms || hasRemovedPlatforms || needsInitialSync) {
        // Preserve existing order, add new ones at end, remove deleted ones
        const existingOrder = (data.platforms || []).filter(p => socialLinks?.[p.platform as keyof typeof socialLinks])
        const existingPlatforms = new Set(existingOrder.map(p => p.platform))
        const newPlatforms = activeSocials.filter(s => !existingPlatforms.has(s.platform))

        updateBlock(block.id, {
          data: {
            ...block.data,
            platforms: [...existingOrder, ...newPlatforms]
          }
        })
      }
    }
  }, [socialLinks, block.type, block.id])

  /* A block on the page merges into the block as it is now (lib/onepage/context
     updateBlockData), so two changes in one tick, or an upload that finishes
     after an edit, both land. A block inside a group goes through its group. */
  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    if (updateBlockOverride) updateBlockOverride(block.id, { data: { ...block.data, ...updates } })
    else updateBlockData(block.id, updates as Record<string, any>)
  }

  // Handle thumbnail upload
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setThumbnailUploading(true)
    try {
      const supabase = createClient()
      const fileExt = file.name.split('.').pop()
      /* Under the owner's own folder: storage only lets a person write there. */
      const ownerId = (await supabase.auth.getSession()).data.session?.user.id
      if (!ownerId) throw new Error('Not signed in')
      const fileName = `${ownerId}/thumbnail_${block.id}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('onepage-assets')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('onepage-assets')
        .getPublicUrl(fileName)

      updateData({ thumbnail_url: publicUrl, icon: null })
      setShowThumbnailPopup(false)
    } catch (error) {
      console.error('Error uploading thumbnail:', error)
    } finally {
      setThumbnailUploading(false)
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = ''
      }
    }
  }

  // Handle image upload for Image block
  const handleImageBlockUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentImageItemId) return

    setImageUploading(currentImageItemId)
    try {
      const supabase = createClient()
      const fileExt = file.name.split('.').pop()
      /* Under the owner's own folder: storage only lets a person write there. */
      const ownerId = (await supabase.auth.getSession()).data.session?.user.id
      if (!ownerId) throw new Error('Not signed in')
      const fileName = `${ownerId}/image_${block.id}_${currentImageItemId}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('onepage-assets')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('onepage-assets')
        .getPublicUrl(fileName)

      // Update the specific image in the images array
      const data = block.data as ImageBlockData
      const images = data.images || (data.image_url ? [{ id: '1', image_url: data.image_url, alt_text: data.alt_text, link_url: data.link_url }] : [])
      const newImages = images.map(img =>
        img.id === currentImageItemId
          ? { ...img, image_url: publicUrl }
          : img
      )
      updateData({
        images: newImages,
        image_url: newImages[0]?.image_url || ''
      })
    } catch (error) {
      console.error('Error uploading image:', error)
    } finally {
      setImageUploading(null)
      setCurrentImageItemId(null)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  // Get ordered social platforms - prioritize block data order
  const getOrderedSocials = () => {
    const data = block.data as SocialRowBlockData
    
    // If block has platforms array with items, use that order (filtered to only include active links)
    if (data.platforms && data.platforms.length > 0) {
      return data.platforms.filter(p => socialLinks?.[p.platform as keyof typeof socialLinks])
    }
    
    // Fallback to deriving from socialLinks
    const activeSocials = Object.entries(socialLinks || {})
      .filter(([_, url]) => url)
      .map(([platform, url]) => ({ platform, url: url as string }))
    return activeSocials
  }

  // Handle social icon drag
  const handleSocialDragStart = (e: React.DragEvent, platform: string) => {
    setDraggedSocialId(platform)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleSocialDragOver = (e: React.DragEvent, platform: string) => {
    e.preventDefault()
    if (draggedSocialId && draggedSocialId !== platform) {
      setDragOverSocialId(platform)
    }
  }

  const handleSocialDrop = (e: React.DragEvent, targetPlatform: string) => {
    e.preventDefault()
    if (!draggedSocialId || draggedSocialId === targetPlatform) {
      setDraggedSocialId(null)
      setDragOverSocialId(null)
      return
    }
    
    // Get current ordered list
    const currentOrder = getOrderedSocials()
    const draggedIndex = currentOrder.findIndex(p => p.platform === draggedSocialId)
    const targetIndex = currentOrder.findIndex(p => p.platform === targetPlatform)
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSocialId(null)
      setDragOverSocialId(null)
      return
    }
    
    // Reorder the array
    const newOrder = [...currentOrder]
    const [dragged] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, dragged)
    
    // Update block data with new order
    updateBlock(block.id, { 
      data: { 
        ...block.data, 
        platforms: newOrder.map(p => ({ platform: p.platform, url: p.url }))
      } 
    })
    
    setDraggedSocialId(null)
    setDragOverSocialId(null)
  }

  // Determine if this block type supports layout options
  const supportsLayout = ["link_button", "product"].includes(block.type)

  // Get current layout type from block data
  const currentLayoutType = (block.data as any).layout_type || 'default'

  // Helper to render the Layout tab content
  const renderLayoutContent = () => {
    // Special layout content for product blocks
    if (block.type === "product") {
      const data = block.data as ProductBlockData
      const productStyles: { id: ProductBlockStyle; label: string }[] = [
        { id: "button", label: "Button" },
        { id: "callout", label: "Callout" },
        { id: "preview", label: "Preview" },
      ]
      const ctaOptions = ["Get My Guide", "Get it Now", "Buy Now", "Download", "Get Access", "Enroll Now", "Start Learning", "Custom"]
      const blockBackgroundColorPresets = ['#1a1a2e', '#b2846c', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      const textColorPresets = ['#ffffff', '#000000', '#1a1a1a', '#f5f5f5', '#374151', '#6b7280']
      const buttonColorPresets = ['#ffffff', '#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      const buttonTextColorPresets = ['#1a1a1a', '#ffffff', '#b2846c', '#3b82f6', '#ef4444', '#10b981']

      // Handle style selection (always use filled button style)
      const handleStyleSelect = (styleId: ProductBlockStyle) => {
        updateData({ style: styleId, button_style: "filled" })
      }

      return (
        <div className="space-y-4">
          {/* Style Selector - Carousel style UI */}
          <div className="space-y-2">
            <Label className="text-xs">Style</Label>
            <div className="flex gap-2">
              {productStyles.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleStyleSelect(id)}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all",
                    data.style === id
                      ? "bg-[#1a1a2e] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Thumbnail Section */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">Custom Thumbnail</Label>
            <p className="text-xs text-muted-foreground">Override the product image with a custom thumbnail</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenThumbnailModal && onOpenThumbnailModal(block.id)}
                className="group relative w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-gray-50 hover:bg-gray-100"
              >
                {data.custom_thumbnail ? (
                  <img
                    src={data.custom_thumbnail}
                    alt="Custom thumbnail"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : data.product_thumbnail ? (
                  <img
                    src={data.product_thumbnail}
                    alt="Product thumbnail"
                    className="w-full h-full object-cover rounded-lg opacity-50"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                )}
                {/* Pencil icon */}
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center">
                  <Pencil className="w-3 h-3 text-gray-500" />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
              </button>
              {data.custom_thumbnail && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateData({ custom_thumbnail: null })}
                  className="text-xs text-gray-500 hover:text-red-500"
                >
                  <X className="h-3 w-3 mr-1" />
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* CTA Button Text - Modern Dropdown */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">Button Text</Label>
            <div className="relative" ref={ctaDropdownRef}>
              <button
                type="button"
                onClick={() => setShowCtaDropdown(!showCtaDropdown)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-transparent"
              >
                <span className="truncate">{ctaOptions.slice(0, -1).includes(data.cta_text || "") ? data.cta_text : "Custom"}</span>
                <svg className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", showCtaDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCtaDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[200px] overflow-y-auto">
                  {ctaOptions.slice(0, -1).map((cta) => (
                    <button
                      key={cta}
                      type="button"
                      onClick={() => {
                        updateData({ cta_text: cta })
                        setShowCtaDropdown(false)
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm transition-colors",
                        data.cta_text === cta
                          ? "bg-[#f4f4f6] text-[#1a1a2e] font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {cta}
                    </button>
                  ))}
                  <div className="border-t my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCtaDropdown(false)
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm transition-colors",
                      !ctaOptions.slice(0, -1).includes(data.cta_text || "")
                        ? "bg-[#f4f4f6] text-[#1a1a2e] font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    Custom
                  </button>
                </div>
              )}
            </div>
            {/* Custom text input - always visible below dropdown */}
            <Input
              value={data.cta_text || ""}
              onChange={(e) => updateData({ cta_text: e.target.value })}
              placeholder="Enter button text..."
              className="h-9 rounded-lg"
            />
          </div>

          {/* Color Customizers - Only show for callout/preview styles */}
          {(data.style === "callout" || data.style === "preview") && (
            <div className="space-y-4 pt-2 border-t">
              <p className="text-[14px] font-semibold text-[#1a1a2e]">Colours for this block</p>

              {/* The four overrides, each the editor's one colour field; Reset goes back to the theme's. */}
              <ColorRow
                label="Block background"
                value={data.block_background_color || null}
                emptyLabel="Theme"
                /* With none of its own the block takes the theme's button colour, and the picker starts there. */
                fallback={onepage?.theme.button_color || "#1a1a2e"}
                onChange={(color) => updateData({ block_background_color: color })}
                onClear={() => updateData({ block_background_color: null })}
                suggestions={blockBackgroundColorPresets}
              />
              <ColorRow
                label="Text"
                description={`Title, description, price${data.style === "callout" ? " and button" : ""}`}
                value={data.text_color || null}
                emptyLabel="Theme"
                fallback="#ffffff"
                onChange={(color) => updateData({ text_color: color })}
                onClear={() => updateData({ text_color: null })}
                suggestions={textColorPresets}
              />
              {data.style === "preview" && (
                <ColorRow
                  label="Button"
                  value={data.button_color || null}
                  emptyLabel="Theme"
                  fallback="#ffffff"
                  onChange={(color) => updateData({ button_color: color })}
                  onClear={() => updateData({ button_color: null })}
                  suggestions={buttonColorPresets}
                />
              )}
              {data.style === "preview" && (
                <ColorRow
                  label="Button text"
                  value={data.button_text_color || null}
                  emptyLabel="Theme"
                  fallback="#1a1a1a"
                  onChange={(color) => updateData({ button_text_color: color })}
                  onClear={() => updateData({ button_text_color: null })}
                  suggestions={buttonTextColorPresets}
                />
              )}
            </div>
          )}
        </div>
      )
    }

    // Default layout content for link_button and image blocks
    return (
      <div className="space-y-3">
        <div>
          <p className="text-[16px] font-semibold text-[#1a1a2e]">Display</p>
          <p className="mt-0.5 text-[13.5px] text-[#6b7280]">How this block sits on your page</p>
        </div>

        {/* Classic and Featured, as Linktree's link editor draws them: a picture of each, the picked one in a thin dark border. */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: "default" as const, label: "Classic" },
            { id: "pro" as const, label: "Featured" },
          ]).map((o) => {
            const on = currentLayoutType === o.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                data-layout-choice={o.id}
                onClick={() => updateData({ layout_type: o.id })}
                className={cn(
                  "flex cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-2 outline-none transition-[border-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
                  on ? "border-[#1a1a2e] shadow-[0_0_0_0.5px_#1a1a2e]" : "border-[#e3e4e8] hover:border-[#c9cbd1]",
                )}
              >
                <span className="grid aspect-[4/3] place-items-center rounded-xl bg-[#f7f7f8] px-3">
                  {o.id === "default" ? (
                    <span className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#e3e4e8] bg-white px-2">
                      <span className="h-5 w-5 shrink-0 rounded bg-[#d9dbe0]" />
                      <span className="h-1.5 flex-1 rounded-full bg-[#d9dbe0]" />
                    </span>
                  ) : (
                    <span className="block w-full rounded-lg border border-[#e3e4e8] bg-white p-1.5">
                      <span className="block h-10 w-full rounded-md bg-[#d9dbe0]" />
                      <span className="mx-auto mt-1.5 block h-1.5 w-2/3 rounded-full bg-[#d9dbe0]" />
                    </span>
                  )}
                </span>
                <span className={cn("block py-2 text-center text-[13.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{o.label}</span>
              </button>
            )
          })}
        </div>

        {/* Display Mode Options - Only shown when Pro Layout is selected and NOT YouTube */}
        {currentLayoutType === 'pro' && block.type === 'link_button' && !isYouTubeUrl((block.data as LinkButtonBlockData).url) && (
          <div className="pt-3 mt-1 border-t space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cover', label: 'Cover', desc: 'Fill & crop' },
                { id: 'contain', label: 'Fit', desc: 'Show all' },
                { id: 'full', label: 'Full', desc: 'Original' },
              ].map((mode) => {
                const currentDisplayMode = (block.data as LinkButtonBlockData).display_mode || 'cover'
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateData({ display_mode: mode.id as 'cover' | 'contain' | 'full' })}
                    className={cn(
                      "p-2.5 rounded-lg border-2 text-center transition-all",
                      currentDisplayMode === mode.id
                        ? "border-[#1a1a2e] bg-[#f4f4f6]"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{mode.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Helper to render Settings content per block type
  const renderSettingsContent = () => {
    switch (block.type) {
      case "link_button": {
        const data = block.data as LinkButtonBlockData
        return (
          <div className="space-y-3">
            {/*
              THE LINK'S OWN FIELDS, as Linktree's link editor lays them out:
              a heading, the title and the address in large rounded boxes,
              and the picture as a row you press, with the picture itself
              on its left and a chevron on its right.
            */}
            <p className="pt-1 text-[16px] font-semibold text-[#1a1a2e]">Info</p>
            <label className="block">
              <span className="sr-only">Title</span>
              <input value={data.label} onChange={(e) => updateData({ label: e.target.value })} placeholder="Title" aria-label="Title" data-link-title="" className={linkField} />
            </label>
            <label className="block">
              <span className="sr-only">URL</span>
              <input
                value={data.url}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="URL"
                data-link-url=""
                onChange={(e) => {
                  if (onUrlChangeWithAutoFetch) {
                    onUrlChangeWithAutoFetch(block.id, e.target.value)
                  } else {
                    updateData({ url: e.target.value })
                  }
                }}
                placeholder="https://"
                className={linkField}
              />
            </label>
            <button
              type="button"
              onClick={() => onOpenThumbnailModal && onOpenThumbnailModal(block.id)}
              data-link-thumbnail=""
              className="flex min-h-[72px] w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-[#e3e4e8] bg-white p-2.5 pr-4 text-left outline-none transition-colors hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f4f4f6] text-[#6b7280]">
                {data.thumbnail_url ? (
                  <img src={data.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : hasLinkIcon(data.icon) ? (
                  <LinkIcon name={data.icon} size={22} className="text-[#1a1a2e]" />
                ) : (
                  <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-[#1a1a2e]">Thumbnail</span>
                <span className="block truncate text-[13px] text-[#6b7280]">{data.thumbnail_url ? "An image beside the title" : hasLinkIcon(data.icon) ? "An icon beside the title" : "Add an image or an icon"}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.75} />
            </button>

            {/* WhatsApp Group URL - Only shown for WhatsApp URLs */}
            {(data.url?.includes('wa.me') || data.url?.includes('whatsapp.com')) && (
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp Group URL</Label>
                <Input
                  value={(data as any).whatsapp_group_url || ""}
                  onChange={(e) => updateData({ whatsapp_group_url: e.target.value })}
                  placeholder="https://chat.whatsapp.com/..."
                  className="h-9"
                />
              </div>
            )}

            {/* YouTube Settings - Only shown for YouTube URLs */}
            {isYouTubeUrl(data.url) && (
              <div className="space-y-3 pt-3 mt-3 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">YouTube Settings</Label>
                <div className="space-y-2">
                  {[
                    { id: 'embed_video', label: 'Play video on page', desc: 'Embed video directly in Pro Layout' },
                    { id: 'open_video', label: 'Open YouTube video', desc: 'Redirect on click only' },
                  ].map((mode) => {
                    const currentMode = data.youtube_mode || 'embed_video'
                    const isActive = currentMode === mode.id
                    return (
                      <div
                        key={mode.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border-2 transition-all",
                          isActive ? "border-gray-900 bg-white" : "border-gray-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            isActive ? "bg-red-600 text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{mode.label}</div>
                            <div className="text-xs text-muted-foreground">{mode.desc}</div>
                          </div>
                        </div>
                        <Toggle label={mode.label}
                          checked={isActive}
                          onCheckedChange={async (checked) => {
                            if (checked) {
                              // embed_video uses Pro Layout, open_video uses Default Layout
                              const layoutType = mode.id === 'open_video' ? 'default' : 'pro'
                              updateData({
                                youtube_mode: mode.id as YouTubeMode,
                                layout_type: layoutType
                              })
                              // For open_video mode, fetch thumbnail
                              if (mode.id === 'open_video') {
                                // Extract video ID and set thumbnail
                                const videoIdMatch = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
                                if (videoIdMatch) {
                                  updateData({
                                    youtube_mode: mode.id as YouTubeMode,
                                    layout_type: 'default',
                                    thumbnail_url: `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`
                                  })
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                {/* Refresh thumbnail button for open_video mode */}
                {data.youtube_mode === 'open_video' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const videoIdMatch = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
                      if (videoIdMatch) {
                        updateData({
                          thumbnail_url: `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`
                        })
                      }
                    }}
                    className="w-full text-xs text-center py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    ↻ Refresh thumbnail
                  </button>
                )}
              </div>
            )}

            {/* Spotify Settings - Only shown for Spotify URLs */}
            {isSpotifyUrl(data.url) && (
              <div className="space-y-3 pt-3 mt-3 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spotify Settings</Label>
                <div className="space-y-2">
                  {[
                    { id: 'audio_preview', label: 'Audio preview', desc: 'Open modern preview modal' },
                    { id: 'go_to_url', label: 'Go to URL', desc: 'Redirect to Spotify directly' },
                    { id: 'show_streaming', label: 'Show streaming', desc: 'Display all platforms' },
                  ].map((mode) => {
                    const currentMode = data.spotify_mode || 'go_to_url'
                    const isActive = currentMode === mode.id
                    return (
                      <div
                        key={mode.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border-2 transition-all",
                          isActive ? "border-gray-900 bg-white" : "border-gray-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            isActive ? "bg-[#1DB954] text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{mode.label}</div>
                            <div className="text-xs text-muted-foreground">{mode.desc}</div>
                          </div>
                        </div>
                        <Toggle label={mode.label}
                          checked={isActive}
                          onCheckedChange={async (checked) => {
                            if (checked) {
                              updateData({ spotify_mode: mode.id as SpotifyMode })
                              // For streaming mode, fetch available services and metadata
                              if (mode.id === 'show_streaming') {
                                try {
                                  const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                                  if (res.ok) {
                                    const spotifyData = await res.json()
                                    updateData({
                                      spotify_mode: mode.id as SpotifyMode,
                                      spotify_artist_id: spotifyData.id || null,
                                      spotify_title: spotifyData.title || null,
                                      spotify_artist: spotifyData.artistName || null,
                                      spotify_type: spotifyData.type || null,
                                      streaming_services: spotifyData.streamingServices || []
                                    })
                                  }
                                } catch (e) {
                                  console.error('Failed to fetch streaming services:', e)
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Enable Metadata toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-white mt-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Enable Metadata</div>
                      <div className="text-xs text-muted-foreground">Show song type & artist info</div>
                    </div>
                  </div>
                  <Toggle label="Enable Metadata"
                    checked={data.spotify_show_metadata !== false}
                    onCheckedChange={async (checked) => {
                      updateData({ spotify_show_metadata: checked })
                      // If enabling metadata and we don't have it yet, fetch it
                      if (checked && (!data.spotify_title && !data.spotify_artist) && data.url) {
                        try {
                          const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                          if (res.ok) {
                            const spotifyData = await res.json()
                            updateData({
                              spotify_show_metadata: true,
                              spotify_title: spotifyData.title || null,
                              spotify_artist: spotifyData.artistName || null,
                              spotify_type: spotifyData.type || null
                            })
                          }
                        } catch (e) {
                          console.error('Failed to fetch Spotify metadata:', e)
                        }
                      }
                    }}
                  />
                </div>

                {/* Refresh Thumbnail button */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                      if (res.ok) {
                        const spotifyData = await res.json()
                        updateData({
                          thumbnail_url: spotifyData.thumbnailUrl || data.thumbnail_url,
                          spotify_title: spotifyData.title || data.spotify_title,
                          spotify_artist: spotifyData.artistName || data.spotify_artist,
                          spotify_type: spotifyData.type || data.spotify_type,
                          spotify_thumbnail: spotifyData.thumbnailUrl || data.spotify_thumbnail,
                        })
                      }
                    } catch (e) {
                      console.error('Failed to refresh Spotify thumbnail:', e)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Refresh Thumbnail
                </button>

                {/* Streaming Services List - shown when show_streaming is selected */}
                {data.spotify_mode === 'show_streaming' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Streaming services</div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                            if (res.ok) {
                              const spotifyData = await res.json()
                              updateData({ streaming_services: spotifyData.streamingServices || [] })
                            }
                          } catch (e) {
                            console.error('Failed to refresh streaming services:', e)
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Sync
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Visitors may see a different order depending on their location or preferences.</p>
                    {(data.streaming_services || [
                      { platform: 'apple_music', found: false, url: null },
                      { platform: 'youtube_music', found: false, url: null },
                      { platform: 'spotify', found: true, url: data.url },
                      { platform: 'soundcloud', found: false, url: null },
                      { platform: 'tidal', found: false, url: null },
                      { platform: 'deezer', found: false, url: null },
                    ]).map((service: StreamingService, index: number) => {
                      const platformConfig: Record<string, { name: string; color: string; icon: React.ReactNode }> = {
                        apple_music: {
                          name: 'Apple Music',
                          color: 'bg-gradient-to-br from-[#FC3C44] to-[#F94C57]',
                          icon: <svg viewBox="0 0 512 512" className="w-4 h-4"><defs><linearGradient id="am-grad2" x1=".5" y1=".99" x2=".5" y2=".02"><stop offset="0" stopColor="#FA233B"/><stop offset="1" stopColor="#FB5C74"/></linearGradient></defs><rect width="512" height="512" rx="15%" fill="url(#am-grad2)"/><path fill="#ffffff" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/></svg>
                        },
                        youtube_music: {
                          name: 'YouTube Music',
                          color: 'bg-red-600',
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>
                        },
                        spotify: {
                          name: 'Spotify',
                          color: 'bg-[#1DB954]',
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                        },
                        soundcloud: {
                          name: 'SoundCloud',
                          color: 'bg-[#FF5500]',
                          icon: <svg viewBox="0 0 512 512" className="w-4 h-4"><rect width="512" height="512" rx="15%" fill="#f50"/><path d="m59 270-3 22 3 22c0 2 3 2 3 0l3-22-3-22c0-3-3-3-3 0zm18-14c0-3-3-3-3 0l-5 36 4 35c0 3 4 3 4 0l4-35zm59-30-3 66 2 40c0 8 7 8 7 0l4-40-4-66c0-5-6-5-6 0zm-31 22-4 44 3 40c0 6 5 6 5 0l4-40-4-44c0-3-4-3-4 0zm70 84 3-40-3-88c0-6-7-6-7 0l-3 88 2 40c0 8 8 8 8 0zm68 0 2-40-2-102c0-7-10-7-10 0l-2 102 2 40c0 8 10 8 10 0zm-34 0 3-40-3-89c0-6-9-6-9 0l-2 89 2 40c0 8 9 8 9 0zm-83 0 3-40-3-41c0-3-6-3-6 0l-3 41 3 40c0 7 6 7 6 0zm-33 0 4-40-4-43c0-3-4-3-4 0l-4 43 4 40c0 4 4 4 4 0zm124-125-2 85 1 40c0 8 10 8 10 0l2-40-2-85c0-7-9-7-9 0zm-58 125 3-40-3-81c0-6-7-6-7 0l-3 81 2 40c0 8 8 8 8 0zm33 0 3-40-3-91c0-6-8-6-8 0l-3 91 3 40c0 8 8 8 8 0zm196-89c-5-57-64-94-118-73-4 2-5 3-5 6v156c0 3 2 6 5 6h137c27 0 49-22 49-49 0-37-35-57-68-46zm-138-62-3 111 3 40c0 8 10 8 10 0l3-40-3-111c0-7-10-7-10 0z" fill="#ffffff"/></svg>
                        },
                        tidal: {
                          name: 'TIDAL',
                          color: 'bg-black',
                          icon: <svg viewBox="0 0 32 32" className="w-4 h-4" fill="white"><path d="M16.016 5.323l-5.339 5.339-5.339-5.339-5.339 5.339 5.339 5.339 5.339-5.339 5.339 5.339-5.339 5.339 5.339 5.339 5.339-5.339-5.339-5.339 5.339-5.339zM21.391 10.661l5.302-5.307 5.307 5.307-5.307 5.307z"/></svg>
                        },
                        deezer: {
                          name: 'Deezer',
                          color: 'bg-[#231f20]',
                          icon: <svg viewBox="0 0 512 512" className="w-4 h-4" fill="none" strokeWidth="20"><rect width="512" height="512" rx="15%" fill="#231f20"/><path stroke="#f1796e" d="M78 241h64m-64 26h64"/><path stroke="#ec2529" d="M78 293h64m-64 26h64m-64 26h64"/><path stroke="#f6dd05" d="M148 293h64m-64 26h64m-64 26h64"/><path stroke="#e78dcc" d="M218 241h64m-64 26h64m-64-52h64m-64-26h64"/><path stroke="#d81996" d="M218 293h64m-64 26h64m-64 26h64"/><path stroke="#d6e465" d="M288 241h64m-64 26h64"/><path stroke="#adda1a" d="M288 293h64m-64 26h64m-64 26h64"/><path stroke="#b0d8e6" d="M358 241h64m-64 26h64m-64-52h64m-64-26h64m-64-26h64"/><path stroke="#56bbe9" d="M358 293h64m-64 26h64m-64 26h64"/></svg>
                        },
                        amazon_music: {
                          name: 'Amazon Music',
                          color: 'bg-gradient-to-br from-[#25D1DA] to-[#1A98FF]',
                          icon: <svg viewBox="0 0 48 48" className="w-4 h-4" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="21.5"/><path d="M32.28 29.7c1.11-.45 3.09-1.05 3.69-.33.64.78-.17 2.48-.92 3.79"/><path d="M11.8 30.22c1.76 1.4 6.95 3.53 12.49 3.53a17 17 0 0 0 10.17-3.08"/><path d="M20.4 20.13v3.3a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-3.3"/><line x1="24.4" y1="23.43" x2="24.4" y2="25.43"/><path d="M10.4 22.23a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3.2"/><line x1="10.4" y1="20.23" x2="10.4" y2="25.43"/><path d="M14.4 22.23a2 2 0 0 1 2-2 2 2 0 0 1 2 2v3.2"/><circle cx="31.88" cy="17.68" r="0.7" fill="white"/><line x1="31.88" y1="20.13" x2="31.88" y2="25.43"/><path d="M26.54 24.97a2.25 2.25 0 0 0 1.64.45h.45a1.32 1.32 0 0 0 1.32-1.33 1.32 1.32 0 0 0-1.32-1.32h-.9a1.32 1.32 0 0 1-1.32-1.33 1.32 1.32 0 0 1 1.32-1.32h.45a2.25 2.25 0 0 1 1.64.45"/><path d="M37.6 24.42a2 2 0 0 1-1.74 1h0a2 2 0 0 1-2-2v-1.3a2 2 0 0 1 2-2h0a2 2 0 0 1 1.73 1"/></svg>
                        },
                      }
                      const config = platformConfig[service.platform] || { name: service.platform, color: 'bg-gray-500', icon: null }
                      return (
                        <div key={service.platform} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                          <div className="flex items-center justify-center cursor-grab">
                            <GripVertical className="w-4 h-4 text-gray-300" />
                          </div>
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", config.color)}>
                            {config.icon}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{config.name}</div>
                            <div className={cn("text-xs", service.found ? "text-green-600" : "text-gray-400")}>
                              {service.found ? "Visible" : "Not found"}
                            </div>
                          </div>
                          {onOpenStreamingModal && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenStreamingModal(service.platform, index, data, updateData)
                              }}
                              className="text-xs text-[#1a1a2e] hover:text-[#4b5563] font-medium"
                            >
                              {service.found ? "Edit" : "+ Add"}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SoundCloud Settings - Only shown for SoundCloud URLs */}
            {data.url?.includes('soundcloud.com') && (
              <div className="space-y-3 pt-3 mt-3 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SoundCloud Settings</Label>

                {/* Refresh Thumbnail button */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/onepage/soundcloud?url=${encodeURIComponent(data.url)}`)
                      if (res.ok) {
                        const soundcloudData = await res.json()
                        updateData({
                          thumbnail_url: soundcloudData.thumbnailUrl || data.thumbnail_url,
                          soundcloud_title: soundcloudData.title || data.soundcloud_title,
                          soundcloud_artist: soundcloudData.artistName || data.soundcloud_artist,
                          soundcloud_type: soundcloudData.type || data.soundcloud_type,
                          soundcloud_thumbnail: soundcloudData.thumbnailUrl || data.soundcloud_thumbnail,
                        })
                      }
                    } catch (e) {
                      console.error('Failed to refresh SoundCloud thumbnail:', e)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Refresh Thumbnail
                </button>
              </div>
            )}

            {/* Apple Music Settings - Only shown for Apple Music URLs */}
            {data.url?.includes('music.apple.com') && (
              <div className="space-y-3 pt-3 mt-3 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Apple Music Settings</Label>
                <div className="space-y-2">
                  {[
                    { id: 'audio_preview', label: 'Audio preview', desc: 'Open modern preview modal' },
                    { id: 'go_to_url', label: 'Go to URL', desc: 'Redirect to Apple Music directly' },
                  ].map((mode) => {
                    const currentMode = data.apple_music_mode || 'go_to_url'
                    const isActive = currentMode === mode.id
                    return (
                      <div
                        key={mode.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border-2 transition-all",
                          isActive ? "border-gray-900 bg-white" : "border-gray-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            isActive ? "bg-gradient-to-br from-[#FA233B] to-[#FB5C74] text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            <svg className="w-4 h-4" viewBox="0 0 512 512" fill="currentColor">
                              <path d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{mode.label}</div>
                            <div className="text-xs text-muted-foreground">{mode.desc}</div>
                          </div>
                        </div>
                        <Toggle label={mode.label}
                          checked={isActive}
                          onCheckedChange={async (checked) => {
                            if (checked) {
                              updateData({ apple_music_mode: mode.id })
                              // For audio preview mode, fetch metadata
                              if (mode.id === 'audio_preview') {
                                try {
                                  const res = await fetch(`/api/onepage/apple-music?url=${encodeURIComponent(data.url)}`)
                                  if (res.ok) {
                                    const appleMusicData = await res.json()
                                    updateData({
                                      apple_music_mode: mode.id,
                                      apple_music_title: appleMusicData.title || null,
                                      apple_music_artist: appleMusicData.artistName || null,
                                      apple_music_type: appleMusicData.type || null,
                                      apple_music_preview_url: appleMusicData.previewUrl || null
                                    })
                                  }
                                } catch (e) {
                                  console.error('Failed to fetch Apple Music data:', e)
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Enable Metadata toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-white mt-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FA233B]/10 to-[#FB5C74]/10 flex items-center justify-center">
                      <svg className="w-4 h-4" viewBox="0 0 512 512">
                        <defs>
                          <linearGradient id="am-icon-gradient" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                            <stop offset="0" stopColor="#FA233B"/>
                            <stop offset="1" stopColor="#FB5C74"/>
                          </linearGradient>
                        </defs>
                        <path fill="url(#am-icon-gradient)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Enable Metadata</div>
                      <div className="text-xs text-muted-foreground">Show song type & artist info</div>
                    </div>
                  </div>
                  <Toggle label="Enable Metadata"
                    checked={data.apple_music_show_metadata !== false}
                    onCheckedChange={async (checked) => {
                      updateData({ apple_music_show_metadata: checked })
                      // If enabling metadata and we don't have it yet, fetch it
                      if (checked && (!data.apple_music_title && !data.apple_music_artist) && data.url) {
                        try {
                          const res = await fetch(`/api/onepage/apple-music?url=${encodeURIComponent(data.url)}`)
                          if (res.ok) {
                            const appleMusicData = await res.json()
                            updateData({
                              apple_music_show_metadata: true,
                              apple_music_title: appleMusicData.title || null,
                              apple_music_artist: appleMusicData.artistName || null,
                              apple_music_type: appleMusicData.type || null
                            })
                          }
                        } catch (e) {
                          console.error('Failed to fetch Apple Music metadata:', e)
                        }
                      }
                    }}
                  />
                </div>

                {/* Refresh Thumbnail button */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/onepage/apple-music?url=${encodeURIComponent(data.url)}`)
                      if (res.ok) {
                        const appleMusicData = await res.json()
                        updateData({
                          thumbnail_url: appleMusicData.thumbnailUrl || data.thumbnail_url,
                          apple_music_title: appleMusicData.title || data.apple_music_title,
                          apple_music_artist: appleMusicData.artistName || data.apple_music_artist,
                          apple_music_type: appleMusicData.type || data.apple_music_type,
                          apple_music_thumbnail: appleMusicData.thumbnailUrl || data.apple_music_thumbnail,
                          apple_music_preview_url: appleMusicData.previewUrl || data.apple_music_preview_url,
                        })
                      }
                    } catch (e) {
                      console.error('Failed to refresh Apple Music thumbnail:', e)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Refresh Thumbnail
                </button>
              </div>
            )}
          </div>
        )
      }

      case "text": {
        const data = block.data as TextBlockData
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Text</Label>
              <Textarea value={data.content} onChange={(e) => updateData({ content: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alignment</Label>
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map((align) => (
                  <Button
                    key={align}
                    variant={data.alignment === align ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateData({ alignment: align })}
                    className="capitalize h-8 flex-1"
                  >
                    {align}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )
      }

      case "email_capture": {
        const data = block.data as EmailCaptureBlockData
        const selectedDigitalProduct = effectiveSellerProducts?.find(p => p.id === data.digital_product_id)

        // Button text presets
        const buttonTextPresets = [
          { id: 'subscribe', label: 'Subscribe', text: 'Subscribe' },
          { id: 'join', label: 'Join Now', text: 'Join Now' },
          { id: 'get_access', label: 'Get Access', text: 'Get Access' },
          { id: 'download', label: 'Download', text: 'Download' },
          { id: 'sign_up', label: 'Sign Up', text: 'Sign Up' },
          { id: 'unlock', label: 'Unlock Now', text: 'Unlock Now' },
        ] as const

        // Handle preset change - clear custom text when selecting a preset
        const handlePresetChange = (presetId: EmailCaptureButtonPreset) => {
          const preset = buttonTextPresets.find(p => p.id === presetId)
          if (preset) {
            updateData({ button_preset: presetId, button_text: preset.text, custom_button_text: '' })
          }
        }

        // Layout options
        const layoutOptions = [
          { id: 'default', label: 'Default', description: 'Classic email form' },
          { id: 'pro', label: 'Pro', description: 'Compact with image' },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                Layout
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Headline */}
              <div className="space-y-1.5">
                <Label className="text-xs">Headline</Label>
                <Input
                  value={data.headline || "Join my newsletter"}
                  onChange={(e) => updateData({ headline: e.target.value })}
                  className="h-9"
                  placeholder="Join my newsletter"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  value={data.description || "Get updates and exclusive content"}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="h-9"
                  placeholder="Get updates and exclusive content"
                />
              </div>

              {/* Button Text Selector - Dropdown like Animation */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      const dropdown = e.currentTarget.nextElementSibling as HTMLElement
                      if (dropdown) {
                        dropdown.classList.toggle('hidden')
                      }
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-transparent"
                  >
                    <span>{buttonTextPresets.find(p => p.id === (data.button_preset || 'subscribe'))?.label || 'Subscribe'}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  <div className="hidden absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    {buttonTextPresets.map((preset) => {
                      const isSelected = (data.button_preset || 'subscribe') === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={(e) => {
                            handlePresetChange(preset.id as EmailCaptureButtonPreset)
                            const dropdown = e.currentTarget.parentElement as HTMLElement
                            if (dropdown) dropdown.classList.add('hidden')
                          }}
                          className={cn(
                            "w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center justify-between",
                            isSelected
                              ? "bg-[#f4f4f6] text-[#1a1a2e] font-medium"
                              : "text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          <span>{preset.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Custom Button Text Input - Always visible */}
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Text</Label>
                <Input
                  value={data.custom_button_text || ""}
                  onChange={(e) => {
                    const customText = e.target.value
                    if (customText.trim()) {
                      // When custom text is entered, set preset to 'custom'
                      updateData({ custom_button_text: customText, button_preset: 'custom' })
                    } else {
                      // When cleared, fall back to default
                      updateData({ custom_button_text: '', button_preset: 'subscribe' })
                    }
                  }}
                  className="h-9"
                  placeholder="Enter custom button text"
                />
              </div>

              {/* Success Message */}
              <div className="space-y-1.5">
                <Label className="text-xs">Success Message</Label>
                <Input
                  value={data.success_message || "Thanks for subscribing!"}
                  onChange={(e) => updateData({ success_message: e.target.value })}
                  className="h-9"
                  placeholder="Thanks for subscribing!"
                />
              </div>

              {/* Product Image Picker - Always show in settings */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">Product Image</Label>
                <p className="text-[10px] text-muted-foreground">
                  Display an image with your email form (used in Pro layout)
                </p>
                <div className="flex gap-2 items-center">
                  {data.product_image ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img src={data.product_image} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => updateData({ product_image: null })}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onOpenImageLibrary(block.id, 'product_image')}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#9ca3af] flex items-center justify-center transition-colors"
                    >
                      <Upload className="w-5 h-5 text-gray-400" />
                    </button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenImageLibrary(block.id, 'product_image')}
                    className="h-8 text-xs"
                  >
                    <Upload className="w-3 h-3 mr-1.5" />
                    {data.product_image ? 'Change' : 'Upload'}
                  </Button>
                </div>
              </div>

              {/* Enable Digital Product Toggle */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Enable Digital Product</Label>
                    <p className="text-[10px] text-muted-foreground">Allow subscribers get a free product on signup</p>
                  </div>
                  <Toggle label="Enable Digital Product"
                    checked={data.enable_digital_product || false}
                    onCheckedChange={(checked) => updateData({ enable_digital_product: checked })}
                  />
                </div>

                {data.enable_digital_product && (
                  <div className="space-y-3 pt-2">
                    {/* Digital Product File Picker */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Digital Product File</Label>
                      <button
                        type="button"
                        onClick={() => onOpenImageLibrary(block.id, 'digital_product_file')}
                        className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        {data.digital_product_file_url ? (
                          <div className="w-10 h-10 rounded-lg bg-[#f1f2f4] flex items-center justify-center">
                            <FileText className="w-5 h-5 text-[#1a1a2e]" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-xs font-medium truncate">
                            {data.digital_product_title || "Upload file"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {data.digital_product_file_url
                              ? "Click to change file"
                              : "PDF, ZIP, or any file type"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      </button>

                      {data.digital_product_file_url && (
                        <div className="space-y-1.5 mt-2">
                          <Label className="text-[10px]">File Name</Label>
                          <Input
                            value={data.digital_product_title || ""}
                            onChange={(e) => updateData({ digital_product_title: e.target.value })}
                            className="h-8 text-xs"
                            placeholder="My Free Guide"
                          />
                        </div>
                      )}
                    </div>

                    {data.digital_product_file_url && (
                      <p className="text-[10px] text-muted-foreground bg-[#f4f4f6] p-2 rounded-lg">
                        When visitors subscribe, they can download "{data.digital_product_title || 'your file'}" directly on this page.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* See Subscribers Link */}
              <div className="pt-3 border-t">
                <a
                  href="/app/emails"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-[#1a1a2e] bg-[#f4f4f6] hover:bg-[#ececef] rounded-lg transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  See subscribers
                </a>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Choose how this block displays on your page</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as EmailCaptureLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    (data.layout_type || 'default') === 'default'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex flex-col items-center justify-center overflow-hidden p-2">
                    <div className="w-full space-y-1.5">
                      <div className="h-2.5 w-3/4 bg-gray-300 rounded mx-auto" />
                      <div className="h-1.5 w-1/2 bg-gray-200 rounded mx-auto" />
                      <div className="flex gap-1.5 mt-2">
                        <div className="flex-1 h-7 bg-white rounded border border-gray-200" />
                        <div className="w-14 h-7 bg-gray-800 rounded" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Default</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">Classic centered form</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as EmailCaptureLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    data.layout_type === 'pro'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e5e7eb] to-[#d1d5db] shrink-0" />
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-full bg-gray-200 rounded" />
                          <div className="h-1.5 w-1/2 bg-gray-100 rounded" />
                        </div>
                      </div>
                      <div className="flex gap-1 mt-2">
                        <div className="flex-1 h-5 bg-gray-50 rounded border border-gray-100" />
                        <div className="w-10 h-5 bg-gray-800 rounded" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">Compact with image</p>
                </button>
              </div>
            </TabsContent>
          </Tabs>
        )
      }

      case "header": {
        const data = block.data as HeaderBlockData
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Avatar</Label>
              <Toggle label="Show Avatar" checked={data.show_avatar} onCheckedChange={(checked) => updateData({ show_avatar: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Name</Label>
              <Toggle label="Show Name" checked={data.show_name} onCheckedChange={(checked) => updateData({ show_name: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Bio</Label>
              <Toggle label="Show Bio" checked={data.show_bio} onCheckedChange={(checked) => updateData({ show_bio: checked })} />
            </div>
          </div>
        )
      }

      case "social_row": {
        const activeSocials = getOrderedSocials()

        return (
          <div className="space-y-3">
            <Label className="text-xs">Social Links</Label>
            {activeSocials.length > 0 ? (
              <div className="space-y-2">
                {activeSocials.map(({ platform, url }) => {
                  const config = SOCIAL_PLATFORMS.find(p => p.id === platform)
                  return (
                    <div
                      key={platform}
                      draggable
                      onDragStart={(e) => handleSocialDragStart(e, platform)}
                      onDragOver={(e) => handleSocialDragOver(e, platform)}
                      onDragLeave={() => setDragOverSocialId(null)}
                      onDrop={(e) => handleSocialDrop(e, platform)}
                      onDragEnd={() => { setDraggedSocialId(null); setDragOverSocialId(null) }}
                      className={cn(
                        "flex items-center gap-2 p-2 bg-white rounded-lg border cursor-grab active:cursor-grabbing transition-all",
                        draggedSocialId === platform && "opacity-50",
                        dragOverSocialId === platform && "border-[#1a1a2e]"
                      )}
                    >
                      <GripVertical className="h-4 w-4 text-gray-300" />
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: config?.color }}
                      >
                        <SocialIcon platform={platform} size={14} color={markOn(config?.color)} />
                      </div>
                      <span className="flex-1 text-sm truncate">{config?.label}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => updateSocialLinks({ [platform]: null } as any)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No social links added yet
              </p>
            )}

            {/* Add Social Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenSocialModal}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Social Link
            </Button>

            {/* Padding Controls */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <RangeRow compact label="Top padding" value={(block.data as SocialRowBlockData).padding_top ?? 0} min={0} max={48} step={4} unit="px" onChange={(value) => updateData({ padding_top: value })} />
              <RangeRow compact label="Bottom padding" value={(block.data as SocialRowBlockData).padding_bottom ?? 0} min={0} max={48} step={4} unit="px" onChange={(value) => updateData({ padding_bottom: value })} />
            </div>
          </div>
        )
      }

      case "divider": {
        const data = block.data as DividerBlockData
        const dividerStyles = [
          { id: "space", label: "Space", preview: <div className="w-full h-3" /> },
          { id: "line", label: "Line", preview: <div className="w-full h-[1px] bg-gray-400" /> },
          { id: "dots", label: "Dots", preview: (
            <div className="flex justify-center gap-1.5">
              {[...Array(3)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />)}
            </div>
          )},
          { id: "wave", label: "Wave", preview: (
            <svg width="100%" height="8" viewBox="0 0 60 8" preserveAspectRatio="none">
              <path d="M0 4 Q 7.5 0, 15 4 T 30 4 T 45 4 T 60 4" fill="none" stroke="#9ca3af" strokeWidth="1" />
            </svg>
          )},
          { id: "zigzag", label: "Zigzag", preview: (
            <svg width="100%" height="8" viewBox="0 0 60 8" preserveAspectRatio="none">
              <path d="M0 4 L10 0 L20 8 L30 0 L40 8 L50 0 L60 4" fill="none" stroke="#9ca3af" strokeWidth="1" />
            </svg>
          )},
          { id: "dashed", label: "Dashed", preview: <div className="w-full border-t border-dashed border-gray-400" /> },
          { id: "gradient", label: "Gradient", preview: (
            <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
          )},
          { id: "double", label: "Double", preview: (
            <div className="flex flex-col gap-0.5">
              <div className="w-full h-[1px] bg-gray-400" />
              <div className="w-full h-[1px] bg-gray-400" />
            </div>
          )},
        ] as const

        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Style</Label>
              <div className="grid grid-cols-4 gap-2">
                {dividerStyles.map(({ id, label, preview }) => (
                  <button
                    key={id}
                    onClick={() => updateData({ style: id })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all",
                      data.style === id
                        ? "border-[#1a1a2e] bg-[#f4f4f6]"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    <div className="w-full h-4 flex items-center justify-center">
                      {preview}
                    </div>
                    <span className="text-[10px] text-gray-600">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <RangeRow compact label="Height" value={data.height} min={8} max={64} step={4} unit="px" onChange={(value) => updateData({ height: value })} />
          </div>
        )
      }

      case "image": {
        const data = block.data as ImageBlockData
        const images = data.images || (data.image_url ? [{ id: '1', image_url: data.image_url, alt_text: data.alt_text, link_url: data.link_url }] : [])

        const addImage = () => {
          const newImage: ImageItem = {
            id: Date.now().toString(),
            image_url: '',
            alt_text: '',
            title: '',
            link_url: null
          }
          const newImages = [...images, newImage]
          updateData({ images: newImages, image_url: newImages[0]?.image_url || '' })
        }

        const removeImage = (id: string) => {
          const newImages = images.filter(img => img.id !== id)
          updateData({
            images: newImages,
            image_url: newImages[0]?.image_url || ''
          })
        }

        const updateImage = (id: string, updates: Partial<ImageItem>) => {
          const newImages = images.map(img => img.id === id ? { ...img, ...updates } : img)
          updateData({
            images: newImages,
            image_url: newImages[0]?.image_url || ''
          })
        }

        const aspectRatios: { id: string; label: string }[] = [
          { id: 'original', label: 'Original' },
          { id: 'square', label: 'Square' },
          { id: 'portrait', label: 'Portrait' },
          { id: 'landscape', label: 'Landscape' },
          { id: 'wide', label: 'Wide' },
        ]

        const displayStyles: { id: string; label: string; desc: string }[] = [
          { id: 'single', label: 'Single', desc: 'One image at a time' },
          { id: 'grid', label: 'Grid', desc: 'Multiple images in grid' },
          { id: 'carousel', label: 'Carousel', desc: 'Swipeable slideshow' },
        ]

        const borderRadiusOptions: { id: string; label: string }[] = [
          { id: 'none', label: 'None' },
          { id: 'sm', label: 'Small' },
          { id: 'md', label: 'Medium' },
          { id: 'lg', label: 'Large' },
          { id: 'full', label: 'Full' },
        ]

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                Layout
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Images List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Images</Label>
                  <span className="text-xs text-muted-foreground">{images.length} image{images.length !== 1 ? 's' : ''}</span>
                </div>

                {images.map((img, index) => (
                  <div key={img.id} className="space-y-2 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
                      {images.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="ml-auto text-xs text-red-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Image Preview or Upload */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentImageItemId(img.id)
                          imageInputRef.current?.click()
                        }}
                        disabled={imageUploading === img.id}
                        className="group relative w-full aspect-video rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-white disabled:opacity-60"
                      >
                        {imageUploading === img.id ? (
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin" />
                            <span className="text-xs font-medium">Uploading...</span>
                          </div>
                        ) : img.image_url ? (
                          <img src={img.image_url} alt={img.alt_text || ''} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <ImageIcon className="w-8 h-8" />
                            <span className="text-xs font-medium">Click to upload</span>
                          </div>
                        )}
                        {!imageUploading && (
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <Upload className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </button>

                      <Input
                        value={img.title || ''}
                        onChange={(e) => updateImage(img.id, { title: e.target.value })}
                        placeholder="Caption (optional)"
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Link URL for this image */}
                    {data.clickable && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Link URL</Label>
                        <Input
                          value={img.link_url || ''}
                          onChange={(e) => updateImage(img.id, { link_url: e.target.value || null })}
                          placeholder="https://..."
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Image Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9 text-xs"
                  onClick={addImage}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Image
                </Button>
              </div>

              <div className="border-t border-gray-100" />

              {/* Make Clickable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Make clickable</Label>
                  <p className="text-[10px] text-muted-foreground">Add links to images</p>
                </div>
                <Toggle label="Add links to images"
                  checked={data.clickable || false}
                  onCheckedChange={(checked) => updateData({ clickable: checked })}
                />
              </div>

              {/* Show Captions Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Show captions</Label>
                  <p className="text-[10px] text-muted-foreground">Display image titles</p>
                </div>
                <Toggle label="Display image titles"
                  checked={data.show_captions || false}
                  onCheckedChange={(checked) => updateData({ show_captions: checked })}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-4">
              {/* Display Style */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Display Style</Label>
                <div className="grid grid-cols-3 gap-2">
                  {displayStyles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => updateData({ display_style: style.id as any })}
                      className={cn(
                        "p-2.5 rounded-xl border-2 text-center transition-all",
                        (data.display_style || 'single') === style.id
                          ? "border-gray-900 bg-white"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      <div className="text-xs font-medium">{style.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid Columns - only show for grid style */}
              {data.display_style === 'grid' && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Grid Columns</Label>
                    <div className="flex gap-2">
                      {[2, 3, 4].map((cols) => (
                        <button
                          key={cols}
                          type="button"
                          onClick={() => updateData({ grid_columns: cols as any })}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                            (data.grid_columns || 2) === cols
                              ? "border-gray-900 bg-white"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          )}
                        >
                          {cols}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Carousel Options - only show for carousel style */}
              {data.display_style === 'carousel' && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Carousel View</Label>
                    <div className="flex gap-2">
                      {([
                        { id: "1" as ImageCarouselViewType, label: "1" },
                        { id: "1.3" as ImageCarouselViewType, label: "1.3" },
                        { id: "1.5" as ImageCarouselViewType, label: "1.5" },
                        { id: "2" as ImageCarouselViewType, label: "2" },
                      ]).map((viewOption) => (
                        <button
                          key={viewOption.id}
                          type="button"
                          onClick={() => updateData({ carousel_view: viewOption.id })}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-xs font-medium transition-all border",
                            (data.carousel_view || "1") === viewOption.id
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          )}
                        >
                          {viewOption.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Autoplay</Label>
                      <p className="text-[10px] text-muted-foreground">Auto-advance slides</p>
                    </div>
                    <Toggle label="Auto-advance slides"
                      checked={data.carousel_autoplay || false}
                      onCheckedChange={(checked) => updateData({ carousel_autoplay: checked })}
                    />
                  </div>
                </>
              )}

              <div className="border-t border-gray-100" />

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Aspect Ratio</Label>
                <div className="flex flex-wrap gap-2">
                  {aspectRatios.map((ratio) => (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => updateData({ aspect_ratio: ratio.id as any })}
                      className={cn(
                        "px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all",
                        (data.aspect_ratio || 'original') === ratio.id
                          ? "border-gray-900 bg-white"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Border Radius */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Corner Radius</Label>
                <div className="flex flex-wrap gap-2">
                  {borderRadiusOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateData({ border_radius: option.id as any })}
                      className={cn(
                        "px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all",
                        (data.border_radius || 'md') === option.id
                          ? "border-gray-900 bg-white"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Image Fit */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Image Fit</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateData({ image_fit: 'cover' })}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                      (data.image_fit || 'cover') === 'cover'
                        ? "border-gray-900 bg-white"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    Cover
                  </button>
                  <button
                    type="button"
                    onClick={() => updateData({ image_fit: 'contain' })}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                      data.image_fit === 'contain'
                        ? "border-gray-900 bg-white"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    Contain
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Hidden file input for image upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageBlockUpload}
              className="hidden"
            />
          </Tabs>
        )
      }

      case "pdf_document": {
        const data = block.data as PDFDocumentBlockData

        // Layout options for PDF document
        const layoutOptions = [
          { id: 'default', label: 'Default', description: 'Button with document icon' },
          { id: 'pro', label: 'Pro', description: 'Image, title, description & button' },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                Layout
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder="My PDF Document"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={data.description || ""}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="min-h-[60px] resize-none"
                  placeholder="A brief description of your PDF..."
                />
              </div>

              {/* PDF File Upload */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">PDF File</Label>
                <button
                  type="button"
                  onClick={() => onOpenImageLibrary(block.id, 'pdf_file')}
                  className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {data.pdf_file_url ? (
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium truncate">
                      {data.pdf_file_url ? data.title || "PDF File" : "Upload PDF"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {data.pdf_file_url
                        ? "Click to change file"
                        : "Select a PDF from your device"}
                    </p>
                  </div>
                  {data.pdf_file_url ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateData({ pdf_file_url: null })
                      }}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </button>
              </div>

              {/* Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <Input
                  value={data.button_text || "View PDF"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder="View PDF"
                />
              </div>

              {/* Preview Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Preview Modal Button Text</Label>
                <Input
                  value={data.preview_button_text || "View full PDF"}
                  onChange={(e) => updateData({ preview_button_text: e.target.value })}
                  className="h-9"
                  placeholder="View full PDF"
                />
              </div>

              {/* Enable Preview Toggle */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Enable Preview</Label>
                  <p className="text-[10px] text-muted-foreground">Show PDF preview modal when clicked</p>
                </div>
                <Toggle label="Show PDF preview when clicked"
                  checked={data.enable_preview !== false}
                  onCheckedChange={(checked) => {
                    updateData({ enable_preview: checked, open_directly: checked ? false : data.open_directly })
                  }}
                />
              </div>

              {/* Open Directly Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Open Directly</Label>
                  <p className="text-[10px] text-muted-foreground">Open PDF file directly in new tab</p>
                </div>
                <Toggle label="Open PDF directly in a new tab"
                  checked={data.open_directly === true}
                  onCheckedChange={(checked) => {
                    updateData({ open_directly: checked, enable_preview: checked ? false : data.enable_preview })
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Choose how this block displays on your page</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    (data.layout_type || 'default') === 'default'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-red-500" />
                      <div className="h-2.5 w-16 bg-gray-300 rounded" />
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Default</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">Button with icon</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    data.layout_type === 'pro'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-100 to-red-200 shrink-0 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-full bg-gray-200 rounded" />
                          <div className="h-1.5 w-1/2 bg-gray-100 rounded" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">With image & details</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">Thumbnail Image</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Display an image with your PDF (used in Featured layout)
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={data.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateData({ thumbnail_url: null })}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#9ca3af] flex items-center justify-center transition-colors"
                      >
                        <Upload className="w-5 h-5 text-gray-400" />
                      </button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                      className="h-8 text-xs"
                    >
                      <Upload className="w-3 h-3 mr-1.5" />
                      {data.thumbnail_url ? 'Change' : 'Upload'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )
      }

      case "food_menu": {
        const data = block.data as FoodMenuBlockData

        // Layout options for food menu
        const layoutOptions = [
          { id: 'default', label: 'Default', description: 'Button with menu icon' },
          { id: 'pro', label: 'Pro', description: 'Image, title, description & button' },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                Layout
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder="Menu"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={data.description || ""}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="min-h-[60px] resize-none"
                  placeholder="A brief description of your menu..."
                />
              </div>

              {/* PDF File Upload */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">Menu PDF File</Label>
                <button
                  type="button"
                  onClick={() => onOpenImageLibrary(block.id, 'pdf_file')}
                  className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {data.pdf_file_url ? (
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium truncate">
                      {data.pdf_file_url ? data.title || "Menu PDF" : "Upload Menu PDF"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {data.pdf_file_url
                        ? "Click to change file"
                        : "Select a PDF from your device"}
                    </p>
                  </div>
                  {data.pdf_file_url ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        updateData({ pdf_file_url: null })
                      }}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </button>
              </div>

              {/* Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <Input
                  value={data.button_text || "View Menu"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder="View Menu"
                />
              </div>

              {/* Preview Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Preview Modal Button Text</Label>
                <Input
                  value={data.preview_button_text || "View Menu"}
                  onChange={(e) => updateData({ preview_button_text: e.target.value })}
                  className="h-9"
                  placeholder="View Menu"
                />
              </div>

              {/* Enable Preview Toggle */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Enable Preview</Label>
                  <p className="text-[10px] text-muted-foreground">Show menu preview modal when clicked</p>
                </div>
                <Toggle label="Show menu preview when clicked"
                  checked={data.enable_preview !== false}
                  onCheckedChange={(checked) => {
                    updateData({ enable_preview: checked, open_directly: checked ? false : data.open_directly })
                  }}
                />
              </div>

              {/* Open Directly Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Open Directly</Label>
                  <p className="text-[10px] text-muted-foreground">Open menu PDF directly in new tab</p>
                </div>
                <Toggle label="Open menu PDF directly in a new tab"
                  checked={data.open_directly === true}
                  onCheckedChange={(checked) => {
                    updateData({ open_directly: checked, enable_preview: checked ? false : data.enable_preview })
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Choose how this block displays on your page</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    (data.layout_type || 'default') === 'default'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-red-500" />
                      <div className="h-2.5 w-16 bg-gray-300 rounded" />
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Default</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">Button with icon</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    data.layout_type === 'pro'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-100 to-red-200 shrink-0 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-full bg-gray-200 rounded" />
                          <div className="h-1.5 w-1/2 bg-gray-100 rounded" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">With image & details</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">Thumbnail Image</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Display an image with your menu (used in Featured layout)
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={data.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateData({ thumbnail_url: null })}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#9ca3af] flex items-center justify-center transition-colors"
                      >
                        <Upload className="w-5 h-5 text-gray-400" />
                      </button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                      className="h-8 text-xs"
                    >
                      <Upload className="w-3 h-3 mr-1.5" />
                      {data.thumbnail_url ? 'Change' : 'Upload'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )
      }

      case "calendly": {
        const data = block.data as CalendlyBlockData

        // Layout options for Calendly
        const layoutOptions = [
          { id: 'default', label: 'Default', description: 'Button with calendar icon' },
          { id: 'pro', label: 'Pro', description: 'Image, title, description & button' },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                Layout
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder="Book a Meeting"
                />
              </div>

              {/* Calendly URL */}
              <div className="space-y-1.5">
                <Label className="text-xs">Calendly URL</Label>
                <Input
                  value={data.calendly_url || ""}
                  onChange={(e) => updateData({ calendly_url: e.target.value })}
                  className="h-9"
                  placeholder="https://calendly.com/your-username/30min"
                />
                <p className="text-[10px] text-muted-foreground">
                  Paste your Calendly event link here
                </p>
              </div>

              {/* Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <Input
                  value={data.button_text || "Schedule Now"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder="Schedule Now"
                />
              </div>

              {/* Embed Mode Options */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-xs font-medium">Behavior</Label>

                {/* Go Directly To Link */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Go Directly To Link</Label>
                    <p className="text-[10px] text-muted-foreground">Open Calendly page in new tab</p>
                  </div>
                  <Toggle label="Open Calendly page in a new tab"
                    checked={data.embed_mode === 'direct_link'}
                    onCheckedChange={(checked) => {
                      updateData({ embed_mode: checked ? 'direct_link' : 'embedded' })
                    }}
                  />
                </div>

                {/* Embedded Calendar (Modal) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Embedded Calendar</Label>
                    <p className="text-[10px] text-muted-foreground">Show calendar in popup modal</p>
                  </div>
                  <Toggle label="Show calendar in a popup"
                    checked={data.embed_mode === 'embedded'}
                    onCheckedChange={(checked) => {
                      updateData({ embed_mode: checked ? 'embedded' : 'direct_link', embed_type: 'modal' })
                    }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Choose how this block displays on your page</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    (data.layout_type || 'default') === 'default'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm flex items-center justify-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500" />
                      <div className="h-2.5 w-16 bg-gray-300 rounded" />
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Default</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">Button with icon</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className={cn(
                    "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                    data.layout_type === 'pro'
                      ? "border-[#1a1a2e] bg-[#f7f7f8]"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 shrink-0 flex items-center justify-center">
                          <Calendar className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="h-2 w-full bg-gray-200 rounded" />
                          <div className="h-1.5 w-1/2 bg-gray-100 rounded" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">With image & details</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">Thumbnail Image</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Display an image with your Calendly block (used in Featured layout)
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={data.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => updateData({ thumbnail_url: null })}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#9ca3af] flex items-center justify-center transition-colors"
                      >
                        <Upload className="w-5 h-5 text-gray-400" />
                      </button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenImageLibrary(block.id, 'thumbnail_url')}
                      className="h-8 text-xs"
                    >
                      <Upload className="w-3 h-3 mr-1.5" />
                      {data.thumbnail_url ? 'Change' : 'Upload'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )
      }

      case "product": {
        const data = block.data as ProductBlockData
        const selectedProduct = effectiveSellerProducts?.find(p => p.id === data.product_id)

        return (
          <div className="space-y-4">
            {/* Product Selector - Modern dropdown style */}
            <div className="space-y-1.5">
              <Label className="text-xs">Select Product</Label>
              <div className="relative" ref={productDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowProductDropdown(!showProductDropdown)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-transparent"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectedProduct?.thumbnail_url && (
                      <img
                        src={selectedProduct.thumbnail_url}
                        alt=""
                        className="w-6 h-6 rounded object-cover shrink-0"
                      />
                    )}
                    <span className="truncate">
                      {selectedProduct ? selectedProduct.title : "Select a product..."}
                    </span>
                    {selectedProduct && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {selectedProduct.price_cents > 0 ? `$${(selectedProduct.price_cents / 100).toFixed(2)}` : 'Free'}
                      </span>
                    )}
                  </div>
                  <svg className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform ml-2", showProductDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showProductDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[240px] overflow-y-auto">
                    {effectiveSellerProducts?.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-sm text-muted-foreground mb-3">No products found.</p>
                        <a
                          href="/app/products/new"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1a1a2e] hover:bg-[#2a2a40] rounded-lg transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Product
                        </a>
                      </div>
                    ) : (
                      effectiveSellerProducts?.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            // Truncate description
                            let shortDesc = product.description || ''
                            const words = shortDesc.split(' ')
                            if (words.length > 7) {
                              shortDesc = words.slice(0, 7).join(' ') + '...'
                            }
                            updateData({
                              product_id: product.id,
                              product_title: product.title,
                              product_thumbnail: product.thumbnail_url || null,
                              product_description: shortDesc || null,
                              product_price_cents: product.price_cents || 0,
                              product_slug: product.slug || null,
                            })
                            setShowProductDropdown(false)
                          }}
                          className={cn(
                            "w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center gap-2",
                            data.product_id === product.id
                              ? "bg-[#f4f4f6] text-[#1a1a2e]"
                              : "text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          {product.thumbnail_url && (
                            <img
                              src={product.thumbnail_url}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn("font-medium truncate", data.product_id === product.id && "text-[#1a1a2e]")}>
                              {product.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {product.price_cents > 0 ? `$${(product.price_cents / 100).toFixed(2)}` : 'Free'}
                            </p>
                          </div>
                          {data.product_id === product.id && (
                            <Check className="w-4 h-4 text-[#1a1a2e] shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Edit Product Links */}
            {data.product_id && (
              <div className="flex flex-col gap-1.5">
                <a
                  href={`/app/products/${data.product_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#1a1a2e] hover:text-[#4b5563] font-medium transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit Product
                </a>
                <a
                  href="/creator-page?pageType=product"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#1a1a2e] hover:text-[#4b5563] font-medium transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit Product Page
                </a>
              </div>
            )}

            {/* Display Options */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Price</Label>
                <Toggle label="Show Price"
                  checked={data.show_price !== false}
                  onCheckedChange={(checked) => updateData({ show_price: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Description</Label>
                <Toggle label="Show Description"
                  checked={data.show_description !== false}
                  onCheckedChange={(checked) => updateData({ show_description: checked })}
                />
              </div>
            </div>

            {/* Quick Checkout Toggle - Only for free products */}
            {(data.product_price_cents === 0 || !data.product_price_cents) && data.product_id && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Quick Checkout</Label>
                    <p className="text-[10px] text-muted-foreground">Works only for free products</p>
                  </div>
                  <Toggle label="Quick Checkout"
                    checked={data.quick_checkout || false}
                    onCheckedChange={(checked) => updateData({ quick_checkout: checked })}
                  />
                </div>
                {data.quick_checkout && (
                  <p className="text-[10px] text-muted-foreground bg-[#f4f4f6] p-2 rounded-lg">
                    Users will see a quick checkout form instead of being redirected to the checkout page.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      }

      case "heading":
      case "faq":
      case "countdown":
      case "map":
      case "video":
        return <ExtraBlockEditor block={block} updateData={updateData} />

      case "group": {
        // Group block has special handling - returns null here, handled separately at the end
        return null
      }

      default:
        return <p className="text-xs text-muted-foreground">No settings available</p>
    }
  }

  // Special handling for group blocks with Links/Layout tabs
  if (block.type === "group") {
    const groupData = block.data as GroupBlockData

    const getChildBlockPreview = (child: OnePageBlock) => {
      switch (child.type) {
        case "link_button": {
          const d = child.data as LinkButtonBlockData
          return { title: d.label || "My Link", icon: Link, thumbnail_url: d.thumbnail_url, iconId: resolveLinkIcon(d.icon, d.url) }
        }
        case "text": {
          const d = child.data as TextBlockData
          return { title: d.content?.slice(0, 25) || "Text", icon: Type, thumbnail_url: null, iconId: null }
        }
        case "image": {
          const d = child.data as ImageBlockData
          return { title: "Image", icon: ImageIcon, thumbnail_url: d.image_url, iconId: null }
        }
        case "divider":
          return { title: "Divider", icon: Minus, thumbnail_url: null, iconId: null }
        case "email_capture": {
          const d = child.data as EmailCaptureBlockData
          return { title: d.headline || "Email Signup", icon: Mail, thumbnail_url: null, iconId: null }
        }
        default:
          return { title: child.type.replace('_', ' '), icon: Link, thumbnail_url: null, iconId: null }
      }
    }

    const handleGroupChildDragStart = (e: React.DragEvent, childId: string) => {
      setGroupDraggedId(childId)
      e.dataTransfer.effectAllowed = 'move'
    }

    const handleGroupChildDragOver = (e: React.DragEvent, childId: string) => {
      e.preventDefault()
      if (groupDraggedId && groupDraggedId !== childId) {
        setGroupDragOverId(childId)
      }
    }

    const handleGroupChildDrop = (e: React.DragEvent, targetChildId: string) => {
      e.preventDefault()
      if (groupDraggedId && groupDraggedId !== targetChildId) {
        const children = [...(groupData.children || [])]
        const draggedIndex = children.findIndex(c => c.id === groupDraggedId)
        const targetIndex = children.findIndex(c => c.id === targetChildId)

        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [removed] = children.splice(draggedIndex, 1)
          children.splice(targetIndex, 0, removed)
          updateData({ children: children.map((c, i) => ({ ...c, sort_order: i })) })
        }
      }
      setGroupDraggedId(null)
      setGroupDragOverId(null)
    }

    const removeChildFromGroup = (childId: string) => {
      const childToRemove = (groupData.children || []).find(c => c.id === childId)
      if (childToRemove && onMoveChildToMainList) {
        // Move to main list instead of deleting
        onMoveChildToMainList(childToRemove, block.id)
        // Update group to remove the child
        const newChildren = (groupData.children || []).filter(c => c.id !== childId)
        updateData({ children: newChildren })
      } else {
        // Fallback: just remove from group (but don't delete entirely)
        const newChildren = (groupData.children || []).filter(c => c.id !== childId)
        updateData({ children: newChildren })
      }
      if (selectedGroupChildId === childId) {
        setSelectedGroupChildId(null)
      }
    }

    const updateChildBlock = (childId: string, updates: Partial<OnePageBlock>) => {
      const newChildren = (groupData.children || []).map(c =>
        c.id === childId ? { ...c, ...updates, data: { ...c.data, ...(updates.data || {}) } } : c
      )
      updateData({ children: newChildren })
    }

    const selectedChild = selectedGroupChildId
      ? (groupData.children || []).find(c => c.id === selectedGroupChildId)
      : null

    // Render child block settings
    const renderChildSettings = (child: OnePageBlock) => {
      const updateChildData = (updates: Partial<any>) => {
        updateChildBlock(child.id, { data: { ...child.data, ...updates } })
      }

      switch (child.type) {
        case "link_button": {
          const d = child.data as LinkButtonBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input value={d.label || ""} onChange={(e) => updateChildData({ label: e.target.value })} className="h-9" placeholder="Link title" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL</Label>
                <Input value={d.url || ""} onChange={(e) => updateChildData({ url: e.target.value })} className="h-9" placeholder="https://" />
              </div>
            </div>
          )
        }
        case "text": {
          const d = child.data as TextBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Text Content</Label>
                <Textarea value={d.content || ""} onChange={(e) => updateChildData({ content: e.target.value })} className="min-h-[80px]" placeholder="Enter text..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Alignment</Label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <Button key={align} variant={d.alignment === align ? "default" : "outline"} size="sm" onClick={() => updateChildData({ alignment: align })} className="flex-1 capitalize h-8">
                      {align}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )
        }
        case "divider": {
          const d = child.data as DividerBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Style</Label>
                <div className="flex gap-2">
                  {(["space", "line", "dots"] as const).map((style) => (
                    <Button key={style} variant={d.style === style ? "default" : "outline"} size="sm" onClick={() => updateChildData({ style })} className="capitalize h-8 flex-1">
                      {style}
                    </Button>
                  ))}
                </div>
              </div>
              <RangeRow compact label="Height" value={d.height || 24} min={8} max={64} step={4} unit="px" onChange={(v) => updateChildData({ height: v })} />
            </div>
          )
        }
        case "image": {
          const d = child.data as ImageBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Image URL</Label>
                <Input value={d.image_url || ""} onChange={(e) => updateChildData({ image_url: e.target.value })} className="h-9" placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link URL (optional)</Label>
                <Input value={d.link_url || ""} onChange={(e) => updateChildData({ link_url: e.target.value || null })} className="h-9" placeholder="https://" />
              </div>
            </div>
          )
        }
        case "email_capture": {
          const d = child.data as EmailCaptureBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Headline</Label>
                <Input value={d.headline || ""} onChange={(e) => updateChildData({ headline: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Button Text</Label>
                <Input value={d.button_text || ""} onChange={(e) => updateChildData({ button_text: e.target.value })} className="h-9" />
              </div>
            </div>
          )
        }
        default:
          return <p className="text-xs text-muted-foreground">No settings available</p>
      }
    }

    return (
      <Tabs defaultValue="links" className="w-full">
        <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
          <TabsTrigger value="links" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <Link className="w-3.5 h-3.5" />
            Links
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <LayoutGrid className="w-3.5 h-3.5" />
            Layout
          </TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="mt-0 space-y-4">
          {/* Group Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Group Title (optional)</Label>
            <Input
              value={groupData.title || ""}
              onChange={(e) => updateData({ title: e.target.value || null })}
              placeholder="Enter group title..."
              className="h-9"
            />
          </div>

          {/* Canvas / Block List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Blocks in Group</Label>
              <span className="text-xs text-muted-foreground">{groupData.children?.length || 0} items</span>
            </div>

            {/* Block Canvas */}
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-2 min-h-[120px] bg-gray-50/50">
              {(!groupData.children || groupData.children.length === 0) ? (
                <div className="w-full h-full min-h-[100px] flex flex-col items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenAddBlockModal?.(block.id)}
                    className="flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors p-4"
                  >
                    <Plus className="h-8 w-8" />
                    <span className="text-sm font-medium">Add Block</span>
                  </button>
                  <p className="text-xs text-gray-400 text-center px-4">
                    or drag blocks from the list onto this group
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {groupData.children.map((child, idx) => {
                    const preview = getChildBlockPreview(child)
                    const ChildIcon = preview.icon
                    return (
                      <div
                        key={child.id}
                        draggable
                        onDragStart={(e) => handleGroupChildDragStart(e, child.id)}
                        onDragOver={(e) => handleGroupChildDragOver(e, child.id)}
                        onDragLeave={() => setGroupDragOverId(null)}
                        onDrop={(e) => handleGroupChildDrop(e, child.id)}
                        onDragEnd={() => { setGroupDraggedId(null); setGroupDragOverId(null) }}
                        onClick={() => setSelectedGroupChildId(selectedGroupChildId === child.id ? null : child.id)}
                        className={cn(
                          "flex items-center gap-2 p-2.5 bg-white rounded-lg border cursor-pointer transition-all",
                          selectedGroupChildId === child.id ? "border-[#1a1a2e] ring-1 ring-[#1a1a2e]" : "border-gray-200 hover:border-gray-300",
                          groupDraggedId === child.id && "opacity-50",
                          groupDragOverId === child.id && "border-[#9ca3af] border-dashed bg-[#f4f4f6]",
                          !child.enabled && "opacity-50"
                        )}
                      >
                        <div className="cursor-grab text-gray-300 hover:text-gray-400">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {preview.thumbnail_url ? (
                            <img src={preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : hasLinkIcon(preview.iconId) ? (
                            <LinkIcon name={preview.iconId} size={16} className="text-gray-500" />
                          ) : (
                            <ChildIcon className="h-3.5 w-3.5 text-gray-500" />
                          )}
                        </div>
                        <span className="flex-1 text-sm truncate">{preview.title}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateChildBlock(child.id, { enabled: !child.enabled })
                          }}
                          className={cn(
                            "w-8 h-5 rounded-full transition-colors relative",
                            child.enabled ? "bg-gray-900" : "bg-gray-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                            child.enabled ? "translate-x-3.5" : "translate-x-0.5"
                          )} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeChildFromGroup(child.id) }}
                          className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                          title="Move out of group"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}

                  {/* Add more button */}
                  <button
                    type="button"
                    onClick={() => onOpenAddBlockModal?.(block.id)}
                    className="w-full flex items-center justify-center gap-2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-dashed border-gray-200"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-xs">Add Block</span>
                  </button>
                </div>
              )}
            </div>

            {/* Selected Child Settings - Full Block Settings */}
            {selectedChild && (
              <div className="border rounded-xl p-3 bg-white space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium capitalize">{selectedChild.type.replace('_', ' ')} Settings</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => removeChildFromGroup(selectedChild.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      Move out
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupChildId(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {/* Render full BlockEditor for child with custom update function */}
                {/* Note: onUrlChangeWithAutoFetch is NOT passed because it looks for blocks in main list, not group children */}
                <BlockEditor
                  block={selectedChild}
                  socialLinks={socialLinks}
                  onOpenImageLibrary={(blockId) => {
                    // For image library, we need to handle the child block
                    onOpenImageLibrary(blockId)
                  }}
                  onOpenSocialModal={onOpenSocialModal}
                  onOpenThumbnailModal={(blockId) => {
                    onOpenThumbnailModal?.(blockId)
                  }}
                  onOpenStreamingModal={onOpenStreamingModal}
                  updateBlockOverride={(childId, updates) => {
                    updateChildBlock(childId, updates)
                  }}
                />
              </div>
            )}
          </div>

        </TabsContent>

        <TabsContent value="layout" className="mt-0 space-y-3">
          <p className="text-xs text-muted-foreground mb-2">Choose how blocks are arranged in this group</p>

          {/* Layout Options Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stack Layout */}
            <button
              type="button"
              onClick={() => updateData({ layout: "stack" as const })}
              className={cn(
                "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                groupData.layout === "stack"
                  ? "border-[#1a1a2e] bg-[#f7f7f8]"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              {/* Visual Preview */}
              <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex flex-col items-center justify-center overflow-hidden p-2 gap-1.5">
                <div className="w-full h-6 bg-white rounded border border-gray-200" />
                <div className="w-full h-6 bg-white rounded border border-gray-200" />
                <div className="w-full h-6 bg-white rounded border border-gray-200" />
              </div>
              
              {/* Label */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  groupData.layout === "stack" ? "border-[#1a1a2e]" : "border-gray-300"
                )}>
                  {groupData.layout === "stack" && (
                    <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                  )}
                </div>
                <span className="font-medium text-sm">Stack</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 ml-6">Vertical list</p>
            </button>

            {/* Carousel Layout */}
            <button
              type="button"
              onClick={() => updateData({ layout: "carousel" as const })}
              className={cn(
                "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
                groupData.layout === "carousel"
                  ? "border-[#1a1a2e] bg-[#f7f7f8]"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              {/* Visual Preview */}
              <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2 gap-1.5">
                <div className="w-[40%] h-full bg-white rounded border border-gray-200 shrink-0" />
                <div className="w-[40%] h-full bg-white rounded border border-gray-200 shrink-0" />
                <div className="w-[20%] h-full bg-white/50 rounded border border-gray-100 shrink-0" />
              </div>
              
              {/* Label */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  groupData.layout === "carousel" ? "border-[#1a1a2e]" : "border-gray-300"
                )}>
                  {groupData.layout === "carousel" && (
                    <div className="w-2 h-2 rounded-full bg-[#1a1a2e]" />
                  )}
                </div>
                <span className="font-medium text-sm">Carousel</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 ml-6">Swipe horizontal</p>
            </button>
          </div>

          {/* Carousel Options - shown when carousel layout is selected */}
          {groupData.layout === "carousel" && (
            <div className="space-y-4 pt-3 border-t">
              <div className="space-y-2">
                <Label className="text-xs">Carousel View</Label>
                <div className="flex gap-2">
                  {([
                    { id: "1" as CarouselViewType, label: "1 per row" },
                    { id: "1.2" as CarouselViewType, label: "1.2 per row" },
                    { id: "1.5" as CarouselViewType, label: "1.5 per row" },
                  ]).map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => updateData({ carousel_view: view.id })}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all",
                        (groupData.carousel_view || "1") === view.id
                          ? "bg-[#1a1a2e] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}
        </TabsContent>
      </Tabs>
    )
  }

  /*
    THE SCHEDULE AND THE SENSITIVE SWITCH (components/onepage/extra-blocks),
    under every block's own settings but the profile header's. A block inside
    a group shows with its group, so it has the switch but not the schedule.
  */
  const settingsWithExtras = () => (
    <>
      {renderSettingsContent()}
      {block.type !== "header" ? (
        <BlockExtras
          block={block}
          scheduling={!updateBlockOverride}
          updateBlock={(updates) => updateBlock(block.id, updates)}
          updateData={updateData}
        />
      ) : null}
    </>
  )

  // If block supports layout, render with tabs; otherwise just render settings
  if (supportsLayout) {
    return (
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
          <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <LayoutGrid className="w-3.5 h-3.5" />
            Layout
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-0">
          {settingsWithExtras()}
        </TabsContent>
        <TabsContent value="layout" className="mt-0">
          {renderLayoutContent()}
        </TabsContent>
      </Tabs>
    )
  }

  // For blocks without layout support, just render settings directly
  return settingsWithExtras()
}
