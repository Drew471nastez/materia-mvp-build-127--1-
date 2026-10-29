"use client"

import { hapticTap } from "@/lib/native-bridge"
import { useProductMoney } from "@/components/platform/price-currency"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { useLinkReorder } from "@/components/onepage/link-reorder"

import { useOnePage } from "@/lib/onepage/context"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { announceAvatar } from "@/lib/account/avatar-store"
import { photoIsOwners, useOnePageTeam } from "@/lib/onepage/team-context"
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
  type OnePageBlockData,
} from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
// Custom Toggle Component with theme-style design
/** The large rounded box the link editor's own fields use (16px on a phone, or iOS zooms the page to type). */
/* The thumbnail dialog's views, in a box that follows their height on a computer; as they are in the phone's sheet. */
function ThumbnailViews({ glide, children }: { glide: boolean; children: React.ReactNode }) {
  return glide ? <AutoHeight>{children}</AutoHeight> : <>{children}</>
}

/* Round 40: the thumbnail sheet's rows, drawn as Add block's: a tint on press, a grey tile, a name and one line. */
const THUMB_ROW = "flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left outline-none transition-[background-color] duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-[#f6f6f7] active:bg-[#f0f0f2] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)] disabled:opacity-60"
const THUMB_TILE = "grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[#f2f2f4] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(17,17,19,0.04)]"

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
  return <Switch checked={checked} onChange={onCheckedChange} label={label ?? (checked ? tt("Shown on your page") : tt("Hidden from your page"))} />
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { ColorRow, RangeRow, Switch } from "@/components/onepage/editor-kit"
import { accentDepth } from "@/components/ui/depth-button"
import { DeletedIcon, SaveNotification } from "@/components/ui/save-notification"
import { DialogHeader } from "@/components/ui/dialog"
import { SHEET_DIALOG_MAX_HEIGHT, SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { CardMark, ChoiceMark } from "@/components/onepage/choice-marks"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Plus,
  GripVertical,
  Trash2,
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
  ExternalLink,
  Palette,
  Check,
  Calendar,
  Info,
  FolderOpen,
} from "lucide-react"
import { LinkStatsChart, type LinkStats } from "@/components/onepage/link-stats-chart"
import { pageClickCounts } from "@/lib/onepage/stats-client"

/* The blocks whose row shows a count of clicks (sign-ups for an email block) beside it. */
const ROW_COUNT_TYPES = new Set(["link_button", "email_capture", "group", "product", "pdf_document", "food_menu", "calendly", "image", "social_row"])
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { DateRangePicker } from "@/components/app/date-range-picker"
import NextLink from "next/link"
import { blockAnalyticsHref } from "@/lib/onepage/analytics-href"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { AvatarMark } from "@/components/app/app-avatar"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { createClient } from "@/lib/supabase/client"
import { readFileHeader, scanFile } from "@/lib/storage/security"
import { precheckUpload } from "@/lib/security/uploads"
import { BlockBadges, BlockExtras, ExtraBlockEditor, extraBlockRow, isExtraBlock } from "@/components/onepage/extra-blocks"
import { BlockFootActions } from "@/components/onepage/block-remove"
import { AutoHeight, Reveal, revealSettledTop } from "@/components/onepage/reveal"
import { ModeChoice, QuietAction, SettingsGroup } from "@/components/onepage/block-settings-kit"
import { ProductPicker } from "@/components/onepage/product-picker"
import { AddBlockButton, AddBlockPicker, AddSheetGate, isAddSheetOpen, setAddSheetOpen } from "@/components/onepage/add-block-picker"
import { IconLibrary, IconLibraryGate, setIconLibraryOpen } from "@/components/onepage/icon-library"
import { GlyphBooking, GlyphDivider, GlyphDocument, GlyphEmail, GlyphGroup, GlyphHeader, GlyphImage, GlyphLink, GlyphMenu, GlyphProduct, GlyphSocial, GlyphText, type Glyph } from "@/components/onepage/block-icons"
import { bookingProviderName, bookingSource } from "@/lib/onepage/creator-blocks"
import { hasRealUrl } from "@/lib/onepage/editor-state"
import { SignupDestination } from "@/components/onepage/creator-blocks"
import { canonicalSocialPlatform } from "@/lib/onepage/social-url"
import { parseSocialInput, socialFieldIsLink, socialFieldValue, socialFormat } from "@/lib/onepage/social-input"
import { LinkIcon, SocialIcon, hasLinkIcon, socialPlatformLabel } from "@/components/onepage/brand-icons"
import { resolveLinkIcon } from "@/components/onepage/link-icons"
import { tt } from "@/lib/i18n/text"
import { ONEPAGE_IMAGE_ACCEPT, ONEPAGE_VIDEO_ACCEPT, checkMedia, classifyMedia } from "@/lib/onepage/media-rules"
import { UploadError, openableImage, prepareImage, uploadErrorText, uploadMessage, uploadOnePageMedia } from "@/lib/onepage/media-upload"
import { CropUpload } from "@/components/onepage/crop-upload"
import { SaveError, saveAccountPhoto } from "@/lib/onepage/photo-save"
import { OnePageImageField } from "@/components/onepage/image-field"
import { PosterVideo } from "@/components/onepage/poster-video"
import { videoPoster } from "@/lib/onepage/poster-video"
import { croppedMediaStyle } from "@/lib/onepage/media-crop"
import { FilesLibraryChooser, LibraryRow, fileFromLibrary } from "@/components/onepage/library-pick"
import { LinkLayoutThumb, ProductEditLinks, ProductLayoutPicker, ProductRowBadge, ProductStateBadge, ProductStateNote, ProductTapSetting, layoutHasCard, useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { editorProductState, pickableProducts, productLayoutOf, removePlanFor } from "@/lib/onepage/product-block"
import { EmailLayoutThumb } from "@/components/onepage/email-signup"
import { connectButtonPatch, emailSignupImage, emailSignupLayout, type EmailSignupLayout } from "@/lib/onepage/email-signup"
import { canGoInGroup, deleteFromGroup, findBlockDeep, groupCandidates, moveIntoGroup, moveOutOfGroup, updatePlanDeep } from "@/lib/onepage/group"
import { GroupExistingBlocks } from "@/components/onepage/group-add-existing"

/**
 * A SOCIAL LINK IS READ THE WAY ITS PLATFORM IS TYPED (lib/onepage/social-input):
 * a bare username, an @username, or the whole link pasted with its www., m.,
 * tracking junk and trailing slash, each saved as the one address it means.
 * The host check that used to live here (so "hello" never saved as a Discord
 * link, and a link from the app's own share button is never refused) is part
 * of that now, per platform.
 */
/** How many times the background check asks again for a Spotify or Apple Music link's missing picture before leaving it for the person to add. */
const THUMBNAIL_RETRIES = 5

// Validate social URL and transform if needed
function validateSocialUrl(platform: string, url: string): { valid: boolean; error?: string; transformedUrl?: string } {
  const key = canonicalSocialPlatform(platform)
  const name = socialPlatformLabel(key)
  const read = parseSocialInput(key, url)
  if (read.ok) return { valid: true, transformedUrl: read.url }
  switch (read.error) {
    case "empty":
      return { valid: true }
    case "email":
      return { valid: false, error: tt("Enter an email address, like you@example.com") }
    case "phone":
      return { valid: false, error: tt("Enter your number with its country code, or a wa.me link") }
    case "wrong_site":
      return { valid: false, error: tt("That isn't a {name} link", { name }) }
    case "url":
      return { valid: false, error: key === "website" ? tt("Enter your website address, like yoursite.com") : tt("Paste the link to your {name} page", { name }) }
    default:
      return { valid: false, error: tt("Enter your username, or paste the link") }
  }
}

/** Three quarters of what the keyboard and the visible part make together, less the keyboard: with bottom-sheet's aboveKeyboard adding the keyboard back, a box whose top never moves. */
const SOCIAL_SHEET_HEIGHT = "calc((var(--vv-h, 100dvh) + var(--kb-inset, 0px)) * 0.75 - var(--kb-inset, 0px))"

/** The social sheet clears what was typed this long after it closes: after the sheet's own close (bottom-sheet SHEET_CLOSE_MS), and the dialog's. */
const SOCIAL_RESET_MS = 420
/* The list's height to a field's own, and back, as a glide where the browser can interpolate to auto (round 42). */
const SOCIAL_SHEET_GLIDE = "[interpolate-size:allow-keywords] transition-[height] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"

// Social platforms configuration with SVG icons
const SOCIAL_PLATFORMS = [
  { id: "threads", get label() { return tt("Threads") }, placeholder: "https://threads.net/@username", color: "#000000" },
  { id: "email", get label() { return tt("Email") }, placeholder: "mailto:you@email.com", color: "#EA4335" },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/page", color: "#1877F2" },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel", color: "#FF0000" },
  { id: "twitter", get label() { return tt("X (Twitter)") }, placeholder: "https://x.com/username", color: "#000000" },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username", color: "#000000" },
  { id: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/1234567890", color: "#25D366" },
  { id: "snapchat", get label() { return tt("Snapchat") }, placeholder: "https://snapchat.com/add/username", color: "#FFFC00" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/username", color: "#E4405F" },
  { id: "discord", label: "Discord", placeholder: "https://discord.gg/invite", color: "#5865F2" },
  { id: "github", label: "GitHub", placeholder: "https://github.com/username", color: "#333333" },
  { id: "kick", get label() { return tt("Kick") }, placeholder: "https://kick.com/username", color: "#53FC18" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username", color: "#0A66C2" },
  { id: "patreon", label: "Patreon", placeholder: "https://patreon.com/creator", color: "#FF424D" },
  { id: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/username", color: "#E60023" },
  { id: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/username", color: "#FF5500" },
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/...", color: "#1DB954" },
  { id: "applemusic", get label() { return tt("Apple Music") }, placeholder: "https://music.apple.com/...", color: "#FA233B" },
  { id: "telegram", label: "Telegram", placeholder: "https://t.me/username", color: "#0088CC" },
  { id: "twitch", label: "Twitch", placeholder: "https://twitch.tv/username", color: "#9146FF" },
  { id: "website", get label() { return tt("Website") }, placeholder: "https://yourwebsite.com", color: "#1a1a2e" },
  { id: "calendly", label: "Calendly", placeholder: "https://calendly.com/username", color: "#006BFF" },
]

// Default background images library
const IMAGE_LIBRARY = [
  { id: "gradient2", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80", get label() { return tt("Colorful Gradient") } },
  { id: "gradient3", url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80", get label() { return tt("Blue Gradient") } },
  { id: "minimal1", url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&q=80", get label() { return tt("Abstract Minimal") } },
  { id: "minimal2", url: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=800&q=80", get label() { return tt("Soft Waves") } },
  { id: "minimal3", url: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=800&q=80", get label() { return tt("Mesh Gradient") } },
  { id: "dark1", url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80", get label() { return tt("Dark Abstract") } },
  { id: "dark2", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", get label() { return tt("Mountains") } },
  { id: "texture1", url: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=800&q=80", get label() { return tt("Marble") } },
  { id: "texture2", url: "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=800&q=80", get label() { return tt("Paper Texture") } },
  { id: "nature1", url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&q=80", get label() { return tt("Ocean") } },
  { id: "nature2", url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=800&q=80", get label() { return tt("Forest") } },
]

/*
  THE PHONE SHEETS ARE THE SHARED SHEET. Add block, the social link, the
  thumbnail, and each block's animation and stats were a dialog pushed to
  the bottom by hand, dragged through React state (one render of the whole
  list per finger event) and taken away on a timer once their slide had run.
  Under 640px they are components/ui/bottom-sheet.tsx now, through
  SheetDialog, and move exactly like Quick access and the account sheet; the
  sheet keeps what it showed on screen until it has slid out, so a close
  resets its fields at once. From 640px they are the dialogs they were.
*/

/* The Add block sheet's catalogue and the sheet itself: components/onepage/add-block-picker.tsx. */

// Helper function to get block preview data
function getBlockPreviewData(block: OnePageBlock, shopMoney: (cents: number, product?: { type?: string | null } | null) => string) {
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
      return { title: data.label || tt("My Link"), subtitle: displayUrl, icon: isNotionUrl ? NotionIcon : GlyphLink }
    }
    case "header":
      return { title: tt("Header"), subtitle: tt("Profile section"), icon: GlyphHeader }
    case "text": {
      const data = block.data as TextBlockData
      return { title: data.content?.slice(0, 30) || tt("Text block"), subtitle: tt("Text"), icon: GlyphText }
    }
    case "image":
      return { title: tt("Image"), subtitle: tt("Image block"), icon: GlyphImage }
    case "divider":
      return { title: tt("Divider"), subtitle: tt("Spacing"), icon: GlyphDivider }
    case "email_capture": {
      const data = block.data as EmailCaptureBlockData
      return { title: data.headline || tt("Email Signup"), subtitle: tt("Lead capture form"), icon: GlyphEmail }
    }
    case "social_row":
      return { title: tt("Social Icons"), subtitle: tt("Social links"), icon: GlyphSocial }
    case "product": {
      const data = block.data as ProductBlockData
      return { title: data.product_title || tt("Digital Product"), subtitle: data.product_price_cents ? shopMoney(data.product_price_cents, { type: data.product_type }) : tt("Select product"), icon: GlyphProduct, thumbnail_url: data.custom_thumbnail || data.product_thumbnail }
    }
    case "group": {
      const data = block.data as GroupBlockData
      const childCount = data.children?.length || 0
      return { title: data.title || tt("Group"), subtitle: tt("{childCount, plural, one {# item} other {# items}} · {layout}", { childCount, layout: data.layout === "carousel" ? tt("Carousel") : tt("Stack") }), icon: GlyphGroup }
    }
    case "pdf_document": {
      const data = block.data as PDFDocumentBlockData
      return { title: data.title || tt("PDF Document"), subtitle: data.pdf_file_url ? tt("PDF uploaded") : tt("No file"), icon: GlyphDocument, thumbnail_url: data.thumbnail_url }
    }
    case "food_menu": {
      const data = block.data as FoodMenuBlockData
      return { title: data.title || tt("Menu"), subtitle: data.pdf_file_url ? tt("Menu uploaded") : tt("No file"), icon: GlyphMenu, thumbnail_url: data.thumbnail_url }
    }
    case "calendly": {
      const data = block.data as CalendlyBlockData
      return { title: data.title || tt("Book a Meeting"), subtitle: data.calendly_url ? bookingProviderName(data.calendly_url) ?? tt("Booking link") : tt("Add a booking link"), icon: GlyphBooking, thumbnail_url: data.thumbnail_url }
    }
    case "course":
    case "music":
    case "testimonials":
    case "contact_form":
    case "embed":
    case "heading":
    case "faq":
    case "countdown":
    case "map":
    case "video":
      return extraBlockRow(block)
    default:
      /* Round 40: any block of components/onepage/extra-blocks' list without a case here (the shelf, lead magnets, posts, followers, codes). */
      return isExtraBlock(block) ? extraBlockRow(block) : { title: block.type, subtitle: "", icon: GlyphLink }
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
  const sellerMoney = useProductMoney()
  /* A team member edits the store's page; the photo is the owner's account photo, theirs to change (lib/onepage/team-context). */
  const team = useOnePageTeam()
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

  /* Whether Add block is up lives in components/onepage/add-block-picker (setAddSheetOpen), so opening it does not render this tab. */
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
  /* Below 640px the editor's dialogs are the shared sheet (see THE PHONE SHEETS above). */
  const isMobileModalViewport = usePhoneWidth()

  // Thumbnail modal state
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [thumbnailBlockId, setThumbnailBlockId] = useState<string | null>(null)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [showIconLibraryInModal, setShowIconLibraryInModal] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  /* "Your files" for a link thumbnail, a product image or a thumbnail field: which block and field the pick goes to. */
  const [fieldLibrary, setFieldLibrary] = useState<{ blockId: string | null; field: string | null } | null>(null)

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
  /* What the profile croppers show and upload (components/onepage/crop-upload.tsx). */
  const [tempAvatar, setTempAvatar] = useState<{ url: string; blob: Blob } | null>(null)
  const [tempAvatarVideo, setTempAvatarVideo] = useState<{ url: string; file: File | null; existing?: string } | null>(null)
  /* Why a chosen file cannot be used, in the sheet it was chosen from. */
  const [avatarPickError, setAvatarPickError] = useState<string | null>(null)
  /* "Your files" for the profile photo or video: the chooser lives outside the sheets, which unmount what they hold when they close. */
  const [avatarLibrary, setAvatarLibrary] = useState<null | "image" | "video">(null)
  /* Kept while the chooser slides away, so its list does not switch under it. */
  const avatarLibraryKind = useRef<"image" | "video">("image")
  if (avatarLibrary) avatarLibraryKind.current = avatarLibrary

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoFileInputRef = useRef<HTMLInputElement>(null)

  /* A picture for the profile cropper: checked, made drawable (a HEIC becomes a JPEG), or the reason in plain words. */
  const pickAvatarImage = async (file: File | undefined) => {
    if (!file) return
    setAvatarPickError(null)
    try {
      const img = await openableImage(file)
      setTempAvatar(img)
      setShowAvatarUploadModal(false)
      setShowAvatarCropModal(true)
    } catch (err) {
      setAvatarPickError(uploadMessage(err))
    }
  }
  const closeAvatarCrop = () => {
    setShowAvatarCropModal(false)
    setTempAvatar((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return null
    })
  }
  const closeVideoCrop = () => {
    setShowVideoCropModal(false)
    setTempAvatarVideo((old) => {
      if (old && !old.existing) URL.revokeObjectURL(old.url)
      return null
    })
  }
  /* A picture from Files goes through the same cropper as one from the device; a video from Files is cropped where it is stored, not uploaded again. */
  const pickAvatarFromLibrary = async (url: string) => {
    if (avatarLibrary === "video") {
      setTempAvatarVideo({ url, file: null, existing: url })
      setShowVideoCropModal(true)
      return
    }
    setAvatarPickError(null)
    try {
      setTempAvatar(await openableImage(await fileFromLibrary(url)))
      setShowAvatarCropModal(true)
    } catch (err) {
      setAvatarPickError(uploadMessage(err))
      setShowAvatarUploadModal(true)
    }
  }

  const [insertAfterId, setInsertAfterId] = useState<string | null>(null)
  /* Whether the social and thumbnail sheets are up, for the clean ups that run after their close (closeSocialSheet, closeThumbnailSheet). Above the early return below, as every hook here. */
  const socialOpenRef = useRef(false)
  socialOpenRef.current = showSocialModal
  const thumbOpenRef = useRef(false)
  thumbOpenRef.current = showThumbnailModal
  useEffect(() => () => setIconLibraryOpen(false), [])
  /* The open state outlives this tab (it is a module's): a tab that goes away takes its sheet down with it, so it never comes back up on its own. */
  useEffect(() => () => setAddSheetOpen(false), [])
  /* When the sheet is up, + Add opened it (not a + between two cards, not a group's): its + is turned into an x (AddBlockButton). */
  const addSheetFromButton = insertAfterId === null && addToGroupId === null

  /*
    REORDERING THE CARDS: components/onepage/link-reorder.ts moves them
    under the finger without React, and hands the result back here once,
    at the drop. Called above the early return, so it is always the same
    hooks in the same order. Each rule reads the page as it is now.
  */
  const reorderListRef = useRef<HTMLDivElement>(null)
  const [reorderMessage, setReorderMessage] = useState("")
  const blocksInOrder = () => [...(onepage?.draft_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  /* An edit to a block on the page or inside one of its groups (the image library and the thumbnail picker serve both). */
  const updateBlockDeep = (id: string, updates: Partial<OnePageBlock>) => {
    const plan = updatePlanDeep(onepage?.draft_blocks, id, updates)
    if (plan) updateBlock(plan.id, plan.updates)
  }
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
      /* What the Add sheet lets into a group, and nothing else (lib/onepage/group canGoInGroup). */
      return target?.type === "group" && !!moving && canGoInGroup(moving.type)
    },
    onReorder: writeReorder,
    /* Into a group: it joins the group's own list and leaves this one. */
    onDropInto: (id, groupId) => {
      /* One edit, so one Undo puts it back (it was two, and one Undo left it on the page and in the group). */
      const next = moveIntoGroup(blocksInOrder(), id, groupId)
      if (next) reorderBlocks(next)
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
    setReorderMessage(tt("{name}, position {value} of {length}", { name, value: to + 1, length: list.length }))
    /* A card React moved can lose focus on the way; the grip gets it back. */
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-reorder-grip="${CSS.escape(id)}"]`)?.focus({ preventScroll: false }))
  }

  /* Every hook of this component runs before its early return (rules of hooks): the page's parts are read null-safe
     here, and the return for a page not loaded yet comes after the last hook, below. */
  const draft_blocks = onepage?.draft_blocks ?? []
  const title = onepage?.title ?? ""
  const avatar_url = onepage?.avatar_url ?? null
  const social_links = onepage?.social_links ?? ({} as OnePageSocialLinks)
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
        /* An edited address (a handle made into its link, a new paste) reaches the icons too; the row used to keep the old one. */
        const hasChangedUrls = (data.platforms || []).some(p => {
          const now = social_links?.[p.platform as keyof typeof social_links]
          return !!now && now !== p.url
        })

        if (hasNewPlatforms || hasRemovedPlatforms || needsInitialSync || hasChangedUrls) {
          const existingOrder = (data.platforms || [])
            .filter(p => social_links?.[p.platform as keyof typeof social_links])
            .map(p => ({ ...p, url: social_links?.[p.platform as keyof typeof social_links] as string }))
          const existingPlatforms = new Set(existingOrder.map(p => p.platform))
          const newPlatforms = activeSocials.filter(s => !existingPlatforms.has(s.platform))

          /* Silent: the row follows the links (lib/onepage/public-shape draws it from them either way), so bringing it in line is no edit and no undo step. It marked the page Unsaved on open. */
          updateBlock(block.id, {
            data: {
              ...block.data,
              platforms: [...existingOrder, ...newPlatforms]
            }
          }, { silent: true })
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

  // Background interval: silently re-fetch thumbnails for Spotify/Apple Music blocks missing them.
  // A link whose picture never comes (a private playlist, a removed track) is
  // asked at most THUMBNAIL_RETRIES times, not every 4 seconds for as long as
  // the editor is open, and nothing is asked while the tab is hidden.
  const thumbnailTriesRef = useRef(new Map<string, number>())
  useEffect(() => {
    const interval = setInterval(() => {
      if (!onepage?.draft_blocks || document.hidden) return

      onepage.draft_blocks.forEach((block) => {
        if (block.type !== 'link_button') return
        const data = block.data as LinkButtonBlockData
        if (!data?.url) return

        const url = normalizeUrlInput(data.url)
        const isSpotify = url.includes('spotify.com')
        const isAppleMusic = url.includes('music.apple.com')

        const missing = (isSpotify && !data.thumbnail_url && !data.spotify_thumbnail) || (isAppleMusic && !data.thumbnail_url && !data.apple_music_thumbnail)
        if (missing) {
          const fetchKey = `${block.id}:${url}`
          const tries = thumbnailTriesRef.current.get(fetchKey) ?? 0
          if (tries >= THUMBNAIL_RETRIES) return
          thumbnailTriesRef.current.set(fetchKey, tries + 1)
          // Clear the fetch key so autoFetchThumbnail can retry
          autoFetchedBlocksRef.current.delete(fetchKey)
          autoFetchThumbnail(block.id, data.url)
        }
      })
    }, 4000)

    return () => clearInterval(interval)
  }, [onepage?.draft_blocks, autoFetchThumbnail])

  if (!onepage) return null

  // Handle thumbnail upload for modal
  const handleThumbnailUploadForModal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !thumbnailBlockId) return

    setThumbnailUploading(true)
    try {
      /* Straight to storage under the owner's own folder, with a type storage takes (a HEIC becomes a JPEG): lib/onepage/media-upload. */
      const { url: publicUrl } = await uploadOnePageMedia(file, { prefix: `thumbnail_${thumbnailBlockId}`, want: "image" })

      const block = findBlockDeep(onepage.draft_blocks, thumbnailBlockId)?.block
      if (block?.type === 'product') {
        // For product blocks, use custom_thumbnail
        updateBlockDeep(thumbnailBlockId, {
          data: {
            ...block.data,
            custom_thumbnail: publicUrl
          }
        })
      } else {
        // For link_button blocks, use thumbnail_url
        updateBlockDeep(thumbnailBlockId, {
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
      alert(uploadMessage(error))
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
    const block = findBlockDeep(onepage.draft_blocks, thumbnailBlockId)?.block
    if (!block) return null
    if (block.type === 'link_button') return block.data as LinkButtonBlockData
    if (block.type === 'product') return block.data as ProductBlockData
    return null
  }

  // Get the block type for thumbnail modal
  const getThumbnailBlockType = () => {
    if (!thumbnailBlockId) return null
    const block = findBlockDeep(onepage.draft_blocks, thumbnailBlockId)?.block
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

  /* The sheet holds what it showed until it has slid out, so the fields reset at once on either surface. */
  const closeAddSheet = () => {
    if (!isAddSheetOpen()) return
    setAddSheetOpen(false)
    setInsertAfterId(null)
    setAddToGroupId(null)
  }

  /*
    THE SOCIAL SHEET CLOSES AS IT IS, THEN FORGETS (round 11: "when I click
    Cancel it closes very bad"). It used to empty the platform and the field
    on the same render that closed it, so the sheet swapped from "Edit social
    link" to the whole platform list, a different height, in the first frame
    of its slide. Now the keyboard goes down with it (the field is let go
    first), the sheet slides out showing what it showed, and what was typed
    is cleared once it is gone (SOCIAL_RESET_MS, a little after the sheet's
    own close), unless it was opened again by then.
  */
  const closeSocialSheet = () => {
    if (!showSocialModal) return
    const active = document.activeElement as HTMLElement | null
    if (active && active.closest?.("[data-social-sheet]")) active.blur()
    /*
      In a transition: this tab's render (the whole list of blocks, about
      100ms on a phone slowed four times) is cut into slices between frames
      instead of one long task while the sheet slides out.
    */
    React.startTransition(() => setShowSocialModal(false))
    window.setTimeout(() => {
      if (socialOpenRef.current) return
      React.startTransition(() => {
        setSelectedSocial(null)
        setSocialUrl("")
        setSearchQuery("")
        setSocialUrlError(null)
      })
    }, SOCIAL_RESET_MS)
  }

  /* The library's search and category are its own now (components/onepage/icon-library); a close leaves the view as it is until the dialog has gone. */
  const closeThumbnailSheet = () => {
    if (!showThumbnailModal) return
    setShowThumbnailModal(false)
    setIconLibraryOpen(false)
    if (!isMobileModalViewport) window.setTimeout(() => { if (!thumbOpenRef.current) setShowIconLibraryInModal(false) }, SOCIAL_RESET_MS)
  }

  /* An icon chosen in the library: on the link at once (the preview redraws with it), and the sheets go. */
  const chooseLinkIcon = (iconId: string) => {
    if (thumbnailBlockId) {
      const block = findBlockDeep(onepage.draft_blocks, thumbnailBlockId)?.block
      if (block?.type === 'link_button') {
        updateBlockDeep(thumbnailBlockId, { data: { ...block.data, icon: iconId, thumbnail_url: null } })
      }
    }
    closeThumbnailSheet()
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

  /* `data`: what a picker entry starts the block with beyond the defaults (a coaching call's title, say). */
  const handleAddBlock = (type: OnePageBlockType, preset?: { label: string; url: string; icon?: string }, data?: Record<string, unknown>) => {
    // If adding to a group, handle differently
    if (addToGroupId) {
      // Only what a group can hold (lib/onepage/group canGoInGroup): every block but the header, a group and the social icons
      if (!canGoInGroup(type)) {
        closeAddSheet()
        return
      }

      const groupBlock = sortedBlocks.find(b => b.id === addToGroupId)
      if (groupBlock && groupBlock.type === "group") {
        const groupData = groupBlock.data as GroupBlockData
        // Use createDefaultBlock to get proper default data for any block type
        const created = createDefaultBlock(type)
        /* What the picker entry starts it with (a coaching call's title, a shelf's source), as on the page (round 41). */
        const newBlock: OnePageBlock = data && !preset ? { ...created, data: { ...created.data, ...data } as OnePageBlock["data"] } : created
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
          if (preset.icon) defaultIcon = preset.icon

          ;(newBlock.data as LinkButtonBlockData).label = preset.label
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
    if (data && newBlock && !preset) {
      updateBlock(newBlock.id, { data: { ...newBlock.data, ...data } as OnePageBlock["data"] })
    }
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
      if (preset.icon) defaultIcon = preset.icon

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
    /* A link with no address yet: the address field, ready to type into, once its settings have opened. */
    if (newBlock?.id && type === "link_button" && !hasRealUrl(preset?.url)) {
      const id = newBlock.id
      let tries = 0
      const focusUrl = () => {
        const field = document.querySelector(`[data-block-id="${id}"] [data-link-url]`) as HTMLInputElement | null
        if (field) {
          field.focus({ preventScroll: true })
          field.select()
        } else if (tries++ < 20) requestAnimationFrame(focusUrl)
      }
      requestAnimationFrame(focusUrl)
    }
    setShowAddBlockNotification(false)
    requestAnimationFrame(() => setShowAddBlockNotification(true))
  }

  // Handler to move a child block from a group back to the main blocks list
  /*
    Out of the group and right under it, in one edit (lib/onepage/group
    moveOutOfGroup). It was two: the block put on the page with the group
    still holding it, then the group told to let go, so one Undo left it in
    both places. It also renumbered the page's blocks in place, editing the
    very objects the page was drawn from.
  */
  const handleMoveChildToMainList = (childBlock: OnePageBlock, groupId: string) => {
    const next = moveOutOfGroup(blocksInOrder(), groupId, childBlock.id)
    if (next) reorderBlocks(next)
  }

  /* Round 41: a group's child deleted for good, in one edit (lib/onepage/group deleteFromGroup). */
  const handleDeleteChild = (childId: string, groupId: string) => {
    const next = deleteFromGroup(blocksInOrder(), groupId, childId)
    if (next) reorderBlocks(next)
  }

  /* Round 41: Add to group's "On your page": a block already on the page moved in, the same one edit a drop makes. */
  const moveExistingIntoGroup = (id: string) => {
    const groupId = addToGroupId
    if (!groupId) return
    const next = moveIntoGroup(blocksInOrder(), id, groupId)
    if (next) reorderBlocks(next)
    closeAddSheet()
    focusAndScrollToBlock(groupId)
  }

  const handleAddSocial = () => {
    if (!selectedSocial || !socialUrl) return

    // Validate the URL
    const validation = validateSocialUrl(selectedSocial, socialUrl)

    if (!validation.valid) {
      setSocialUrlError(validation.error || tt("Invalid URL"))
      return
    }

    // Use transformed URL if available
    const urlToSave = validation.transformedUrl || socialUrl

    updateSocialLinks({ [selectedSocial]: urlToSave } as Partial<OnePageSocialLinks>)
    /* The field is cleared once the sheet has gone (closeSocialSheet), so it leaves showing what was saved. */
    closeSocialSheet()
  }

  const handleRemoveSocial = (platform: string) => {
    updateSocialLinks({ [platform]: null } as Partial<OnePageSocialLinks>)
  }


  // Check if header block already exists (only allow one)
  const hasHeaderBlock = sortedBlocks.some(b => b.type === "header")

  // Block types that can't be added to a group
  const blockedInGroup = ["header", "group", "social_row", "product", "email_capture", "text", "divider", "course", "music", "testimonials", "contact_form", "heading", "faq", "countdown", "map", "video"]

  // Get active social links
  const activeSocials = Object.entries(social_links || {}).filter(([_, url]) => url)

  return (
    <div className="space-y-6" data-scroll-container="links-tab" style={{ touchAction: "manipulation" }}>
      {/* Profile Header with Real SVG Icons */}
      <div className="flex items-center gap-4 pt-[8px] sm:pt-0 pb-5 border-b">
        <div className="relative group shrink-0 cursor-pointer" onClick={() => setShowAvatarEditModal(true)}>
          {/* A circle whatever the row beside it holds: its own width and height, never shrunk. */}
          {/* Its own stacking context, so the pencil on hover is drawn over a video too (the video used to carry z-index 1 above it). */}
          <div data-editor-avatar="" className="h-14 w-14 aspect-square shrink-0 border overflow-hidden rounded-full relative isolate bg-gray-100">
            {onepage.avatar_video_url ? (
              /* The page's own element: the video's first frame, then the video over it (components/onepage/poster-video). */
              <PosterVideo
                src={onepage.avatar_video_url}
                poster={videoPoster((onepage.settings as any)?.avatar_video_crop)}
                alt={title || tt("Avatar")}
                mediaStyle={croppedMediaStyle((onepage.settings as any)?.avatar_video_crop) as React.CSSProperties | undefined}
                /* Round 42: a still here; the preview beside it is where the video plays, once. */
                still
              />
            ) : avatar_url ? (
              <img src={onePageImageSrc(avatar_url, 64)} alt={title || tt("Avatar")} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">{title?.trim() ? title.charAt(0) : <AvatarMark name="" size={72} />}</div>
            )}
          </div>
          <div className="absolute inset-0 z-[2] bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
            <h2 className="font-semibold">{title || tt("Your Name")}</h2>
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
              <p className="text-sm text-gray-400 italic">{tt("Add your bio...")}</p>
            </button>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {activeSocials.slice(0, 5).map(([platform]) => {
              return (
                <div
                  key={platform}
                  className="relative group/social"
                >
                  <div
                    data-social-chip={platform}
                    className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer bg-white shadow-[inset_0_0_0_1px_rgba(17,17,19,0.1),0_1px_2px_rgba(17,17,19,0.06)] transition-opacity hover:opacity-80"
                    onClick={() => {
                      setSelectedSocial(platform)
                      setSocialUrl(socialFieldValue(platform, social_links?.[platform as keyof typeof social_links]))
                      setShowSocialModal(true)
                    }}
                  >
                    <SocialIcon platform={platform} size={14} color="#1a1a2e" tone="brand" />
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
                setShowSocialModal(true)
              }}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Button */}
      {/*
        + ADD IS VIOLET AGAIN, AND ITS + TURNS INTO THE SHEET'S X. "Make sure
        it's purple how it was before": Tailwind's violet 500 until the editor
        went near black; the app's violet primary now (depth-button accentDepth,
        #8b5cf6, which Products' New product wears too). Only this button:
        the rest of the editor stays ink. The + turns a quarter of the way
        round, 45deg, while the sheet it opened is up and back as it goes, on
        the `rotate` property over 200ms. It used to turn on a `.group`, and
        app/globals.css takes every transform and transition inside a
        `.group` away on a touch screen, so on a phone it never turned.
      */}
      <AddBlockButton
        fromButton={addSheetFromButton}
        onPress={() => {
          setInsertAfterId(null)
          setAddToGroupId(null)
          setAddSheetOpen(true)
        }}
        className={cn(accentDepth, "h-11 w-full gap-2 rounded-xl text-[15px]")}
      >
        {tt("Add")}
      </AddBlockButton>

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
          {tt("Add Group")}
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
          {showArchiveView ? tt("Back to links") : tt("View archive")}
          {archivedBlocks.length > 0 && !showArchiveView && (
            <span className="ml-1.5 bg-gray-200 text-gray-600 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full">{archivedBlocks.length}</span>
          )}
        </Button>
      </div>

      {/* Archive View */}
      {showArchiveView && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{tt("Archived Blocks")}</h3>
            <span className="text-xs text-muted-foreground">{tt("{length} items", { length: archivedBlocks.length })}</span>
          </div>
          {archivedBlocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{tt("No archived blocks")}</p>
              <p className="text-xs mt-1">{tt("Archived blocks will appear here")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedBlocks.map((block) => {
                const preview = getBlockPreviewData(block, sellerMoney)
                return (
                  <div key={block.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border">
                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center shrink-0">
                      <preview.icon className="h-5 w-5 text-[#1a1a2e]" />
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
                      {tt("Restore")}
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
        <p id="onepage-reorder-help" className="sr-only">{tt("Drag the grip, or hold a card, to move it. With the keyboard, the up and down arrows move it one place.")}</p>
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
                    {tt("Drop to add to group")}
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
                      /* Where the card will be once a card above it has finished closing (components/onepage/reveal revealSettledTop), not where it is mid close. */
                      const elTop = revealSettledTop(el)
                      const parentRect = scrollParent.getBoundingClientRect()
                      const offset = 12 // breathing room from top
                      const targetScrollTop = scrollParent.scrollTop + (elTop - parentRect.top) - offset
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
                  setShowSocialModal(true)
                }}
                onOpenThumbnailModal={(blockId) => { setThumbnailBlockId(blockId); setShowThumbnailModal(true); setShowIconLibraryInModal(false) }}
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
                onDeleteChild={handleDeleteChild}
                onOpenAddBlockModal={(groupId) => {
                  setAddToGroupId(groupId)
                  setAddSheetOpen(true)
                }}
              />
            </div>

            {index < sortedBlocks.length - 1 && (
              <div className="relative h-0 -mx-1 group/add-divider group-data-[reordering]/list:invisible">
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterId(block.id)
                    setAddSheetOpen(true)
                  }}
                  className="absolute inset-x-0 -top-4 -bottom-4 flex items-center justify-center px-1 focus:outline-none"
                  tabIndex={0}
                  aria-label={tt("Add block here")}
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
            <p className="font-medium text-muted-foreground">{tt("No links yet")}</p>
            <p className="text-sm text-muted-foreground mt-1">{tt("Click \"Add\" to get started")}</p>
          </div>
        )}
      </div>
      )}

      {/* Add Block Modal - Linktree style without sidebar. AddSheetGate: the open and the close render this, not the tab. */}
      <AddSheetGate>{(showAddModal) => (
      <SheetDialog
        open={showAddModal}
        onClose={closeAddSheet}
        phone={isMobileModalViewport}
        label={addToGroupId ? tt("Add to Group") : tt("Add Block")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        /*
          AS THE NOTIFICATIONS SHEET IS: built while the page is idle and
          kept, so the tap only slides it up (it was built on the tap: 250ms
          before it moved on a phone slowed four times), and a fixed height,
          so a category with fewer blocks does not move its top edge.
          closeAddSheet resets what was typed.
        */
        sheet={{ keepMounted: true, height: SHEET_DIALOG_MAX_HEIGHT }}
        /* One height on a computer too, so a category chip with fewer blocks does not move the dialog's edges (components/onepage/add-block-picker). */
        className="p-0 gap-0 overflow-hidden mx-auto flex flex-col bg-white border-[#ececf1] w-[calc(100%-24px)] max-w-[640px] sm:max-w-[640px] h-[min(640px,85vh)] rounded-2xl shadow-[0_24px_64px_-12px_rgba(17,17,19,0.25),0_2px_6px_rgba(17,17,19,0.06)]"
      >
          <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 shrink-0 text-left">
            <SheetDialogTitle className="text-[17px] sm:text-lg font-semibold tracking-[-0.01em] text-[#111113]">
              {addToGroupId ? tt("Add to Group") : tt("Add Block")}
            </SheetDialogTitle>
            {addToGroupId && (
              <p className="text-[12.5px] text-[#6b7280] mt-0.5">
                {tt("Move a block from your page, or add a new one.")}
              </p>
            )}
          </DialogHeader>

          <AddBlockPicker
            open={showAddModal}
            inGroup={!!addToGroupId}
            lead={addToGroupId ? (
              <GroupExistingBlocks
                rows={groupCandidates(onepage.draft_blocks, addToGroupId).map((b) => {
                  const p = getBlockPreviewData(b, sellerMoney) as { title: string; subtitle: string; icon: Glyph; thumbnail_url?: string | null }
                  return { id: b.id, title: p.title, subtitle: p.subtitle, icon: p.icon, thumbnail_url: p.thumbnail_url ?? null }
                })}
                onMove={moveExistingIntoGroup}
              />
            ) : null}
            atLimit={isBlockTypeAtLimit}
            onPick={(entry) => handleAddBlock(entry.type, entry.preset, entry.data)}
          />
      </SheetDialog>
      )}</AddSheetGate>

      {/* Social Links Modal - Modern Scrollable Vertical List */}
      <SheetDialog
        open={showSocialModal}
        onClose={closeSocialSheet}
        phone={isMobileModalViewport}
        label={selectedSocial ? tt("Edit Social Link") : tt("Add Social Link")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        /*
          Built ahead and kept, as Add block is; closeSocialSheet resets what was
          typed once it has gone. One height for the list and for a platform's
          field (as Add block has), so choosing a platform does not drop the
          sheet's top edge.

          AND THE KEYBOARD DOES NOT MOVE IT ("when I click the input, make sure
          it doesn't bump with the keyboard"). The field is at the top of the
          sheet, well above any keyboard, so the sheet has no reason to move:
          its box stays three quarters of the screen the keyboard and the
          visible part make together, and the keyboard's room is taken out of
          its foot (bottom-sheet aboveKeyboard's padding, on the keyboard's own
          250ms curve). The top edge, the title and the field stay exactly
          where they were; only the empty space under Cancel gives way.
        */
        /*
          ROUND 42, "a lot of empty white space at the bottom": the list keeps
          that one tall height (it scrolls), and a platform's field is as tall
          as what it holds, its foot the phone's own safe area
          (lib/ui/keyboard-safe-sheet sheetFoot). The change between the two
          is a glide of the sheet's height (interpolate-size), not a jump.
        */
        sheet={{ keepMounted: true, height: selectedSocial ? undefined : SOCIAL_SHEET_HEIGHT, className: SOCIAL_SHEET_GLIDE }}
        /*
          ROUND 40, ON A COMPUTER: one height for the list and for a platform's
          field, so choosing a platform does not snap the dialog's edges in and
          out (it was as tall as whatever it showed), and the dialog's own
          open and close (components/ui/sheet-dialog SHEET_DIALOG_MOTION).
        */
        className={cn("p-0 gap-0 overflow-hidden mx-auto flex flex-col border-[#ececf1] w-[calc(100%-32px)] max-w-[440px] rounded-2xl max-h-[85vh] shadow-[0_24px_64px_-12px_rgba(17,17,19,0.25),0_2px_6px_rgba(17,17,19,0.06)]", SOCIAL_SHEET_GLIDE, selectedSocial ? "h-auto" : "h-[min(580px,85vh)]")}
      >
          <DialogHeader data-social-sheet="" className="flex-row items-center gap-1.5 px-4 pb-3 pt-4 sm:px-5 sm:pt-5 shrink-0 space-y-0 text-left">
            {selectedSocial ? (
              <button
                type="button"
                onClick={() => { setSelectedSocial(null); setSocialUrl(""); setSocialUrlError(null) }}
                aria-label={tt("Back")}
                data-social-back=""
                className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#1a1a2e] outline-none transition-[background-color] duration-150 hover:bg-[#f3f4f6] active:bg-[#f0f0f2] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)]"
              >
                <ChevronLeft aria-hidden className="h-5 w-5" />
              </button>
            ) : null}
            <SheetDialogTitle className="text-[17px] sm:text-lg font-semibold tracking-[-0.01em] text-[#111113]">
              {selectedSocial ? tt("Edit Social Link") : tt("Add Social Link")}
            </SheetDialogTitle>
          </DialogHeader>

          {!selectedSocial ? (
            <>
              {/* Search, drawn as Add block's and Choose icon's are. */}
              <div className="px-4 pb-3 sm:px-5 shrink-0">
                <label className="relative block">
                  <span className="sr-only">{tt("Search platforms")}</span>
                  <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={tt("Search platforms")}
                    enterKeyHint="search"
                    autoComplete="off"
                    data-social-search=""
                    className="h-11 w-full rounded-xl border border-[#e8e8ec] bg-[#f6f6f7] pl-10 pr-10 text-[16px] text-[#111113] outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label={tt("Clear search")}
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:text-[#1a1a2e]"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </label>
              </div>

              {/* Scrollable Platform List */}
              <div data-social-sheet="" className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-2 py-2 sm:px-3 space-y-0.5">
                {SOCIAL_PLATFORMS.filter(p =>
                  p.label.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((platform) => {
                  const isActive = !!social_links?.[platform.id as keyof typeof social_links]
                  return (
                    <button
                      key={platform.id}
                      onClick={() => {
                        setSelectedSocial(platform.id)
                        setSocialUrl(socialFieldValue(platform.id, social_links?.[platform.id as keyof typeof social_links]))
                      }}
                      data-social-platform={platform.id}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl p-2 outline-none transition-[background-color] duration-150 [-webkit-tap-highlight-color:transparent] active:bg-[#f0f0f2] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)]",
                        isActive
                          ? "bg-[#f6f6f7]"
                          : "hover:bg-[#f6f6f7]"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white shadow-[inset_0_0_0_1px_rgba(17,17,19,0.08),0_1px_2px_rgba(17,17,19,0.05)]">
                        <SocialIcon platform={platform.id} size={21} color="#1a1a2e" tone="brand" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[14px] font-medium leading-5 text-[#111113]">{platform.label}</p>
                        {isActive && (
                          <p className="text-[12.5px] leading-[18px] text-[#6b7280] truncate max-w-[220px]">
                            {social_links?.[platform.id as keyof typeof social_links]}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-[#1a1a2e] shrink-0" />
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>
                  )
                })}
                {SOCIAL_PLATFORMS.filter(p =>
                  p.label.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">{tt("No platforms found")}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            // URL input for selected platform
            /* data-keyboard-own: the field is placed by the sheet (it is at its top, above any keyboard); KeyboardGuard must not centre it, which scrolled it a few pixels under the finger. */
            /* The field view comes in from the side it was chosen from, and Back takes it the other way. */
            <div data-social-sheet="" data-keyboard-own="" key={selectedSocial} className="border-t border-[#f0f0f2] p-4 sm:p-5 space-y-4 min-h-0 overflow-y-auto overscroll-contain animate-in fade-in-0 slide-in-from-right-3 duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none">
              {(() => {
                const platform = SOCIAL_PLATFORMS.find(p => p.id === selectedSocial)
                return (
                  <>
                    <div className="flex items-center gap-3 rounded-xl bg-[#f6f6f7] p-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-[inset_0_0_0_1px_rgba(17,17,19,0.08),0_1px_2px_rgba(17,17,19,0.05)]">
                        <SocialIcon platform={selectedSocial ?? ""} size={21} color="#1a1a2e" tone="brand" />
                      </div>
                      <div>
                        <p className="font-medium">{platform?.label}</p>
                        <p className="text-xs text-muted-foreground">{tt("Add your {label} link", { label: platform?.label })}</p>
                      </div>
                    </div>

                    {/*
                      ONE FIELD, TYPED THE PLATFORM'S WAY: a fixed "@", "github.com/",
                      "+" or "Email" in front, and the username after it. A whole
                      link can be pasted instead; the prefix then reads URL and the
                      link is tidied to the right address (lib/onepage/social-input).
                    */}
                    {(() => {
                      const format = socialFormat(selectedSocial ?? "")
                      const pastedLink = format.kind !== "url" && socialFieldIsLink(selectedSocial ?? "", socialUrl)
                      const prefix = format.kind === "url" || pastedLink ? "URL" : format.kind === "email" ? tt("Email") : format.prefix
                      return (
                        <div className="space-y-2">
                          <label
                            className={cn(
                              "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-offset-0",
                              socialUrlError ? "border-red-500 focus-within:ring-red-500/25" : "border-[#e3e4e8] focus-within:border-[#1a1a2e] focus-within:ring-[#1a1a2e]/10"
                            )}
                          >
                            <span data-social-prefix={prefix} className="flex h-full shrink-0 items-center border-r border-[#ececf1] bg-[#f7f7f8] px-3 text-[13px] font-medium text-[#4b5563]">
                              {prefix}
                            </span>
                            <input
                              value={socialUrl}
                              onChange={(e) => {
                                setSocialUrl(normalizeUrlInput(e.target.value))
                                if (socialUrlError) setSocialUrlError(null)
                              }}
                              onBlur={() => {
                                if (!socialUrl) return
                                const check = validateSocialUrl(selectedSocial ?? "", socialUrl)
                                if (!check.valid) setSocialUrlError(check.error || tt("Invalid URL"))
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && socialUrl) {
                                  e.preventDefault()
                                  handleAddSocial()
                                }
                              }}
                              inputMode={format.inputMode}
                              type={format.kind === "email" ? "email" : "text"}
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              aria-label={tt("Your {name} link or username", { name: platform?.label ?? "" })}
                              aria-invalid={!!socialUrlError}
                              placeholder={format.kind === "url" ? platform?.placeholder.replace(/^https:\/\//, "") : format.placeholder}
                              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
                            />
                          </label>
                          {socialUrlError ? (
                            <p className="text-xs text-red-600">{socialUrlError}</p>
                          ) : format.kind === "handle" || format.kind === "path" ? (
                            <p className="text-xs text-[#6b7280]">{tt("Type your username, or paste the whole link.")}</p>
                          ) : format.kind === "phone" ? (
                            <p className="text-xs text-[#6b7280]">{tt("Your number with its country code.")}</p>
                          ) : null}
                        </div>
                      )
                    })()}

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
                        {social_links?.[selectedSocial as keyof typeof social_links] ? tt("Update") : tt("Add")}
                      </Button>
                      {/* Cancel closes with the sheet's own close: on a phone the slide starts first (data-sheet-close) and the editor hears of it a frame later. */}
                      <Button
                        variant="outline"
                        data-social-cancel=""
                        data-sheet-close={isMobileModalViewport ? "" : undefined}
                        className="rounded-xl h-[44px] w-full text-[15px] font-semibold"
                        onClick={() => {
                          if (!isMobileModalViewport) closeSocialSheet()
                        }}
                      >
                        {tt("Cancel")}
                      </Button>
                      {social_links?.[selectedSocial as keyof typeof social_links] && (
                        <Button
                          variant="outline"
                          className="rounded-xl h-[44px] w-full text-red-600 hover:text-red-700 hover:bg-red-50 text-[15px] font-semibold justify-center"
                          onClick={() => {
                            handleRemoveSocial(selectedSocial)
                            setShowDeleteSocialNotification(false)
                            requestAnimationFrame(() => setShowDeleteSocialNotification(true))
                            closeSocialSheet()
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {tt("Delete")}
                        </Button>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
      </SheetDialog>


      <SaveNotification
        show={showDeleteSocialNotification}
        message={tt("Deleted")}
        duration={3000}
        icon={DeletedIcon}
      />
      <SaveNotification
        show={showAddBlockNotification}
        message={tt("New block added")}
        duration={4000}
      />
      <SaveNotification
        show={showUpdateSocialNotification}
        message={tt("Updated")}
        duration={3000}
      />
      <SaveNotification
        show={showBlockRemovedNotification}
        message={tt("Block removed")}
        duration={3000}
        icon={DeletedIcon}
      />
      <SaveNotification
        show={showBlockArchivedNotification}
        message={tt("Block archived")}
        duration={3000}
      />

      {/* Streaming Service URL Modal */}
      <SheetDialog
        open={showStreamingUrlModal}
        onClose={() => {
          setShowStreamingUrlModal(false)
          setStreamingPlatform(null)
          setStreamingPlatformIndex(-1)
          setStreamingUrl("")
          setStreamingUrlError(null)
        }}
        phone={isMobileModalViewport}
        label={streamingUrl ? tt("Edit Streaming Link") : tt("Add Streaming Link")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-4 sm:p-5 border-b">
            <SheetDialogTitle className="text-base sm:text-lg font-semibold">
              {streamingUrl ? tt("Edit Streaming Link") : tt("Add Streaming Link")}
            </SheetDialogTitle>
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
                  setStreamingUrlError(tt("Please enter a URL"))
                  return
                }
                if (config && !config.urlPattern.test(streamingUrl)) {
                  setStreamingUrlError(tt("Please enter a valid {name} URL", { name: config.name }))
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
                      style={{ backgroundColor: config?.color || "#1a1a2e" }}
                    >
                      {config?.icon || (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                          <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{config?.name || tt("Streaming Platform")}</p>
                      <p className="text-xs text-muted-foreground">{tt("Add your")} {config?.name || 'streaming'} {tt("link")}</p>
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
                      placeholder={config?.placeholder || tt("Enter URL...")}
                      className={cn(
                        "h-11 rounded-xl",
                        streamingUrlError && "border-red-500 focus-visible:ring-red-500"
                      )}
                    />
                    {streamingUrlError && (
                      <p className="text-xs text-red-500">{streamingUrlError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {tt("Tip: Paste the full URL from")} {config?.name || tt("the platform")}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl"
                      onClick={() => setShowStreamingUrlModal(false)}
                    >
                      {tt("Cancel")}
                    </Button>
                    <Button
                      className="flex-1 bg-gray-900 hover:bg-gray-800 rounded-xl"
                      onClick={handleSave}
                      disabled={!streamingUrl.trim()}
                    >
                      {tt("Add")}
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </SheetDialog>

      {/* Name & Bio Edit Modal */}
      <SheetDialog
        open={showNameBioModal}
        onClose={() => setShowNameBioModal(false)}
        phone={isMobileModalViewport}
        label={tt("Edit Profile")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-4 sm:p-5 border-b">
            <SheetDialogTitle className="text-base sm:text-lg font-semibold">{tt("Edit Profile")}</SheetDialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tt("Name")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={tt("Your display name")}
                className="h-11 border-2 border-gray-200 focus:border-gray-900 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{tt("Bio")}</Label>
              <Textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder={tt("A short bio about yourself...")}
                className="min-h-[100px] border-2 border-gray-200 focus:border-gray-900 rounded-xl resize-none"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{tt("This will appear below your name on your page")}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNameBioModal(false)}
              >
                {tt("Cancel")}
              </Button>
              <Button
                className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]"
                onClick={() => {
                  updateProfile({ title: editName, bio: editBio })
                  setShowNameBioModal(false)
                }}
              >
                {tt("Save")}
              </Button>
            </div>
          </div>
        </SheetDialog>

      {/* Thumbnail Edit Modal - Centered with overlay */}
      <SheetDialog
        open={showThumbnailModal}
        onClose={closeThumbnailSheet}
        phone={isMobileModalViewport}
        label={showIconLibraryInModal ? tt("Choose Icon") : getThumbnailBlockType() === 'product' ? tt("Edit Custom Thumbnail") : tt("Edit Thumbnail")}
        /*
          ROUND 40: ONE WIDTH FOR BOTH VIEWS. The dialog was 416px for the
          thumbnail's choices and 572px for Choose icon, with `transition-all`
          between them: every frame of that change laid the dialog out again
          and re-centred it, so it wobbled sideways. Now it is one width, and
          the view that comes in slides a little from its own side instead.
        */
        className="p-0 gap-0 overflow-hidden mx-auto flex flex-col rounded-2xl border-[#ececf1] w-[calc(100%-32px)] max-w-[480px] sm:max-w-[480px] shadow-[0_24px_64px_-12px_rgba(17,17,19,0.25),0_2px_6px_rgba(17,17,19,0.06)]"
      >
          {/* On a computer the two views share the dialog, and its height glides from one to the other (components/onepage/reveal AutoHeight). */}
          <ThumbnailViews glide={!isMobileModalViewport}>
          {/* Main Options View (on a phone it stays under the library's own sheet) */}
          {!(showIconLibraryInModal && !isMobileModalViewport) && (
            <div data-thumbnail-choices="" className={cn("flex flex-col", !isMobileModalViewport && "animate-in fade-in-0 slide-in-from-left-3 duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none")}>
              <DialogHeader className="px-4 pb-1 pt-4 sm:px-5 sm:pt-5 text-left">
                <SheetDialogTitle className="text-[17px] font-semibold tracking-[-0.01em] text-[#111113]">
                  {getThumbnailBlockType() === 'product' ? tt("Edit Custom Thumbnail") : tt("Edit Thumbnail")}
                </SheetDialogTitle>
              </DialogHeader>
              <div className="space-y-1 px-2 pb-3 pt-2 sm:px-3 sm:pb-4">
                {/* What it is now, large enough to see */}
                {getThumbnailBlockData() && (
                  <div className="flex items-center justify-center pb-3 pt-1">
                    <div data-thumbnail-now="" className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-2xl bg-[#f4f4f6] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]">
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
                            return <img src={onePageImageSrc(linkData.thumbnail_url, 64)} alt="" className="w-full h-full object-cover" />
                          } else if (hasLinkIcon(linkData?.icon)) {
                            return <LinkIcon name={linkData?.icon} size={28} className="text-gray-500" />
                          }
                        }
                        return <ImageIcon className="h-7 w-7 text-[#9ca3af]" strokeWidth={1.6} />
                      })()}
                    </div>
                  </div>
                )}

                {/* Upload option */}
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  data-thumbnail-upload=""
                  className={THUMB_ROW}
                >
                  <span className={THUMB_TILE}>
                    {thumbnailUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium leading-5 text-[#111113]">{thumbnailUploading ? tt("Uploading") : tt("Upload image")}</span>
                    <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{tt("JPG, PNG, GIF up to 5MB")}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { if (thumbnailBlockId) setFieldLibrary({ blockId: thumbnailBlockId, field: 'link_thumbnail' }); closeThumbnailSheet() }}
                  disabled={thumbnailUploading}
                  data-library-pick="image"
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#f4f4f6] flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-[#1a1a2e]" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{tt("Choose from your files")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                {/* Icon library button - only for link_button blocks */}
                {getThumbnailBlockType() === 'link_button' && (
                  <button
                    type="button"
                    /* On a phone its own sheet over this one (components/onepage/icon-library), opened without rendering this tab; on a computer this dialog's other view. */
                    onClick={() => (isMobileModalViewport ? setIconLibraryOpen(true) : setShowIconLibraryInModal(true))}
                    data-thumbnail-icons=""
                    className={THUMB_ROW}
                  >
                    <span className={THUMB_TILE}>
                      <Grid3X3 className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-5 text-[#111113]">{tt("Choose icon")}</span>
                      <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{tt("From icon library")}</span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
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
                          const block = findBlockDeep(onepage.draft_blocks, thumbnailBlockId)?.block
                          if (block?.type === 'product') {
                            updateBlockDeep(thumbnailBlockId, {
                              data: {
                                ...block.data,
                                custom_thumbnail: null
                              }
                            })
                          } else {
                            updateBlockDeep(thumbnailBlockId, {
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
                      data-thumbnail-remove=""
                      className={cn(THUMB_ROW, "hover:bg-[#fef3f2] active:bg-[#fde8e6]")}
                    >
                      <span className={cn(THUMB_TILE, "bg-[#fef3f2] text-[#b42318] shadow-none")}>
                        <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="text-[14px] font-medium text-[#b42318]">{tt("Remove thumbnail")}</span>
                    </button>
                  ) : null
                })()}
              </div>
            </div>
          )}

          {/* The icon library, on a computer in this dialog (on a phone it is its own sheet, below). */}
          {showIconLibraryInModal && !isMobileModalViewport && (
            <div className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-right-3 duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none">
            <IconLibrary
              phone={false}
              open={showThumbnailModal && showIconLibraryInModal}
              selected={getThumbnailBlockType() === 'link_button' ? ((getThumbnailBlockData() as LinkButtonBlockData | null)?.icon ?? null) : null}
              onSelect={chooseLinkIcon}
              onBack={() => setShowIconLibraryInModal(false)}
            />
            </div>
          )}
          </ThumbnailViews>

          {/* Hidden file input */}
          <input
            ref={thumbnailInputRef}
            type="file"
            accept={ONEPAGE_IMAGE_ACCEPT}
            onChange={handleThumbnailUploadForModal}
            className="hidden"
          />
      </SheetDialog>

      {/*
        CHOOSE ICON ON A PHONE: a sheet of its own over the thumbnail sheet,
        built ahead and kept (components/onepage/icon-library), one height so
        a search with fewer icons does not move its top edge. Back slides it
        away to the thumbnail's choices; choosing an icon applies it and both
        go.
      */}
      {isMobileModalViewport ? (
        <IconLibraryGate>{(libraryUp) => (
          <SheetDialog
            open={libraryUp}
            onClose={() => setIconLibraryOpen(false)}
            phone
            label={tt("Choose icon")}
            sheet={{ keepMounted: true, height: SHEET_DIALOG_MAX_HEIGHT, zIndex: 210 }}
          >
            <IconLibrary
              phone
              open={libraryUp}
              selected={getThumbnailBlockType() === 'link_button' ? ((getThumbnailBlockData() as LinkButtonBlockData | null)?.icon ?? null) : null}
              onSelect={chooseLinkIcon}
              onBack={() => setIconLibraryOpen(false)}
            />
          </SheetDialog>
        )}</IconLibraryGate>
      ) : null}

      {/* Image Library Modal / File Upload Modal */}
      <SheetDialog
        open={showImageLibrary}
        onClose={() => {
          setShowImageLibrary(false)
          setImageBlockId(null)
          setImageFieldType(null)
        }}
        phone={isMobileModalViewport}
        label={imageFieldType === 'digital_product_file' ? tt("Upload Digital File")
                : imageFieldType === 'product_image' ? tt("Product Image")
                : imageFieldType === 'pdf_file' ? tt("Upload PDF File")
                : imageFieldType === 'thumbnail_url' ? tt("Upload Thumbnail")
                : tt("Choose an Image")}
        className="w-[calc(100%-32px)] max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-4 sm:p-5 border-b">
            <SheetDialogTitle className="text-base sm:text-lg font-semibold">
              {imageFieldType === 'digital_product_file' ? tt("Upload Digital File")
                : imageFieldType === 'product_image' ? tt("Product Image")
                : imageFieldType === 'pdf_file' ? tt("Upload PDF File")
                : imageFieldType === 'thumbnail_url' ? tt("Upload Thumbnail")
                : tt("Choose an Image")}
            </SheetDialogTitle>
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
                    let file = e.target.files?.[0]
                    if (!file || !imageBlockId) return
                    if (imageUploading) return // Guard against concurrent uploads

                    setImageUploading(true)
                    setUploadProgress(0)
                    try {
                      const isDigitalFile = imageFieldType === 'digital_product_file' || imageFieldType === 'pdf_file'
                      /* An iPhone's HEIC is made a JPEG here first: the picture buckets take what a browser can show (lib/onepage/media-upload). */
                      if (!isDigitalFile && classifyMedia(file)?.convert) {
                        const jpeg = await prepareImage(file)
                        file = new File([jpeg.blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${jpeg.ext}`, { type: jpeg.mime })
                      }
                      const folder = isDigitalFile ? 'digital' : 'images'

                      /* The same rule the server applies (lib/security/uploads): size,
                         not a program, a picture where a picture goes. One plain sentence
                         when a file cannot be used; the server checks the bytes again. */
                      const verdict = precheckUpload({
                        fileName: file.name,
                        size: file.size,
                        declaredMime: file.type,
                        context: isDigitalFile ? 'link_page_file' : 'public_image',
                      })
                      if (!verdict.ok) throw new Error(verdict.userMessage)
                      const fileHeader = await readFileHeader(file)
                      const securityScan = scanFile(file.name, file.type || 'application/octet-stream', fileHeader, isDigitalFile ? 'link_page_file' : 'public_image')
                      if (!securityScan.safe) {
                        throw new Error(securityScan.reason || tt("We couldn't accept this file. Try another file."))
                      }

                      // Use signed URL upload for digital files (any size) and large image files
                      // Direct upload only for small image/thumbnail files (< 2MB)
                      const DIRECT_UPLOAD_LIMIT = 2 * 1024 * 1024 // 2MB

                      let url = ""

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
                          const err = await uploadRes.json().catch(() => ({ error: tt("Upload failed") }))
                          throw new Error(err.error || tt("Upload failed"))
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
                          /*
                            ROUND 40: A FILE ON THE PAGE GOES WHERE A VISITOR CAN OPEN IT. The v2 endpoint puts a file
                            ("digital") in the private product bucket and hands back no public address, so the free
                            file of an email signup ("Enable digital product") and a PDF block's file were saved with
                            an empty address: the signup's Download never appeared and the PDF opened nothing. A
                            link page's own file is public by design (app/api/onepage/signed-upload-url), so it asks
                            there; a picture still asks v2 first.
                          */
                          if (!isDigitalFile) try {
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
                            const err = await signedRes.json().catch(() => ({ error: tt("Failed to prepare upload") }))
                            throw new Error(err.error || tt("Failed to prepare upload"))
                          }
                          const data = await signedRes.json().catch(() => null)
                          if (!data) throw new Error(tt("Failed to prepare upload"))
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
                                  let errMsg = tt("Upload error ({status})", { status: xhr.status })
                                  try {
                                    const body = JSON.parse(xhr.responseText)
                                    errMsg = body.error || body.message || errMsg
                                  } catch {}
                                  reject(new Error(errMsg))
                                }
                              })
                              xhr.addEventListener('error', () => reject(new Error(tt("Network error during upload."))))
                              xhr.addEventListener('abort', () => reject(new Error(tt("Upload was cancelled."))))
                              xhr.addEventListener('timeout', () => reject(new Error(tt("Upload timed out."))))
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
                            confirmUpload(uploadBucket, signedData.path)
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
                            confirmUpload(uploadBucket, signedData.path)
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
                              lastError = err?.error || 'Upload failed. Try again.'
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
                          throw new Error(lastError || tt("Upload failed. Try again."))
                        }
                      }
                      /* Never saved without an address a visitor can open (see A FILE ON THE PAGE above). */
                      if (!url) throw new Error(tt("Upload failed. Try again."))

                      const block = findBlockDeep(onepage.draft_blocks, imageBlockId)?.block
                      if (block) {
                        if (imageFieldType === 'digital_product_file') {
                          updateBlockDeep(imageBlockId, {
                            data: {
                              ...block.data,
                              digital_product_file_url: url,
                              digital_product_title: file.name.replace(/\.[^/.]+$/, ""),
                              enable_digital_product: true,
                            }
                          })
                        } else if (imageFieldType === 'product_image') {
                          updateBlockDeep(imageBlockId, {
                            data: {
                              ...block.data,
                              product_image: url,
                            }
                          })
                        } else if (imageFieldType === 'pdf_file') {
                          updateBlockDeep(imageBlockId, {
                            data: {
                              ...block.data,
                              pdf_file_url: url,
                              title: block.data.title || file.name.replace(/\.[^/.]+$/, ""),
                            }
                          })
                        } else if (imageFieldType === 'thumbnail_url') {
                          updateBlockDeep(imageBlockId, {
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
                      /* One plain sentence: the server's own when it is one, never a code or a status. */
                      const said = error instanceof Error ? error.message : ''
                      const plain = said && said.length < 160 && !/failed|error|http|\(\d{3}\)|required|not found|denied|unauthori|token|bucket/i.test(said)
                      alert(error instanceof UploadError ? error.message : plain ? said : tt("Upload failed. Try again."))
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
                      {imageUploading ? tt("Uploading... {uploadProgress}%", { uploadProgress })
                        : imageFieldType === 'digital_product_file' ? tt("Upload file")
                        : imageFieldType === 'pdf_file' ? tt("Upload PDF")
                        : imageFieldType === 'thumbnail_url' ? tt("Upload thumbnail")
                        : tt("Upload image")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {imageFieldType === 'digital_product_file' ? tt("Any file type, no size limit (audio, video, ZIP, images, docs)")
                        : imageFieldType === 'pdf_file' ? tt("PDF files only")
                        : tt("JPG, PNG, GIF up to 10MB")}
                    </p>
                  </div>
                </label>
                {(imageFieldType === 'product_image' || imageFieldType === 'thumbnail_url') && !imageUploading ? (
                  <LibraryRow className="mt-3" onClick={() => { setFieldLibrary({ blockId: imageBlockId, field: imageFieldType }); setShowImageLibrary(false) }} />
                ) : null}

                {/* Show current file/image if exists */}
                {imageBlockId && (() => {
                  const block = findBlockDeep(onepage.draft_blocks, imageBlockId)?.block
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
                        <img src={onePageImageSrc(data.thumbnail_url, 64) || ''} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <img src={data.product_image || ''} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {imageFieldType === 'digital_product_file' ? (data.digital_product_title || tt("Current file"))
                            : imageFieldType === 'pdf_file' ? (data.title || tt("PDF file"))
                            : tt("Current image")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (imageFieldType === 'digital_product_file') {
                            updateBlockDeep(imageBlockId, {
                              data: {
                                ...block.data,
                                digital_product_file_url: null,
                                digital_product_title: null,
                                enable_digital_product: false, // Disable when file is removed
                              }
                            })
                          } else if (imageFieldType === 'pdf_file') {
                            updateBlockDeep(imageBlockId, {
                              data: {
                                ...block.data,
                                pdf_file_url: null,
                              }
                            })
                          } else if (imageFieldType === 'thumbnail_url') {
                            updateBlockDeep(imageBlockId, {
                              data: {
                                ...block.data,
                                thumbnail_url: null,
                              }
                            })
                          } else {
                            updateBlockDeep(imageBlockId, {
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
                        const block = findBlockDeep(onepage.draft_blocks, imageBlockId)?.block
                        if (block) {
                          // Handle image_item_${id} field type for multi-image blocks
                          if (imageFieldType && imageFieldType.startsWith('image_item_')) {
                            const imageItemId = imageFieldType.replace('image_item_', '')
                            const blockData = block.data as ImageBlockData
                            const images = blockData.images || (blockData.image_url ? [{ id: '1', image_url: blockData.image_url }] : [])
                            const newImages = images.map(image =>
                              image.id === imageItemId ? { ...image, image_url: img.url } : image
                            )
                            updateBlockDeep(imageBlockId, {
                              data: {
                                ...block.data,
                                images: newImages,
                                image_url: newImages[0]?.image_url || ''
                              }
                            })
                          } else {
                            updateBlockDeep(imageBlockId, { data: { ...block.data, image_url: img.url } })
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
        </SheetDialog>

      {/* Avatar Edit Modal */}
      <SheetDialog
        open={showAvatarEditModal}
        onClose={() => setShowAvatarEditModal(false)}
        phone={isMobileModalViewport}
        label={tt("Profile Image")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b">
            <SheetDialogTitle className="text-lg font-semibold text-center">{tt("Profile photo")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            {team ? (
              <p className="px-1 text-[13px] leading-snug text-[#6b7280]" data-team-photo-note="">{photoIsOwners(team.store)}</p>
            ) : (
            <button onClick={() => { setShowAvatarEditModal(false); setShowAvatarUploadModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">{tt("Select image or GIF")}</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            )}
            <button onClick={() => { setShowAvatarEditModal(false); setShowVideoModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center"><Video className="h-6 w-6 text-yellow-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">{tt("Select video")}</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            {(team ? onepage.avatar_video_url : onepage.avatar_url || onepage.avatar_video_url) && (
              <button onClick={async () => {
                /* A team member removes the page's video only: the photo is the owner's account photo. */
                if (team) {
                  updateProfile({ avatar_video_url: null })
                  setShowAvatarEditModal(false)
                  return
                }
                /* The one photo, removed everywhere, the same way Settings removes it. */
                if (onepage.avatar_url) {
                  await fetch("/api/account/avatar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: null }),
                  }).catch(() => null)
                  announceAvatar(null)
                }
                updateProfile({ avatar_url: null, avatar_video_url: null })
                setShowAvatarEditModal(false)
              }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-4 w-4" /><span className="font-medium">{tt("Remove current media")}</span>
              </button>
            )}
          </div>
        </SheetDialog>

      {/* Avatar Upload Modal */}
      <SheetDialog
        open={showAvatarUploadModal}
        onClose={() => setShowAvatarUploadModal(false)}
        phone={isMobileModalViewport}
        label={tt("Upload media")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowAvatarUploadModal(false); setShowAvatarEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Upload media")}</SheetDialogTitle>
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
                void pickAvatarImage(e.dataTransfer.files?.[0])
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
                {isDragOver ? tt("Drop image here") : tt("Select file to upload,")}
              </p>
              {!isDragOver && <p className="font-medium text-gray-600">{tt("or drag-and-drop file")}</p>}
              <p className="text-sm text-gray-400 mt-2">{tt("Please upload an image")}</p>
            </div>
            <LibraryRow className="mt-3" onClick={() => { setAvatarPickError(null); setShowAvatarUploadModal(false); setAvatarLibrary("image") }} />
            {avatarPickError ? <p role="alert" className="mt-3 text-[13px] leading-snug text-[#b42318]">{avatarPickError}</p> : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={ONEPAGE_IMAGE_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void pickAvatarImage(file)
              }}
              className="hidden"
            />
          </div>
        </SheetDialog>

      {/* Image Crop Modal: the shared cropper (components/onepage/crop-upload.tsx), a circle, saved as the one profile photo. */}
      <SheetDialog
        open={showAvatarCropModal}
        onClose={closeAvatarCrop}
        phone={isMobileModalViewport}
        label={tt("Crop Image")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeAvatarCrop(); setShowAvatarUploadModal(true) }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Image")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempAvatar ? (
              <CropUpload
                kind="image"
                src={tempAvatar.url}
                file={tempAvatar.blob}
                aspect={1}
                shape="circle"
                prefix="avatar"
                bucket="avatars"
                outputSize={800}
                onCancel={closeAvatarCrop}
                onSaved={async (result) => {
                  /*
                    ONE PROFILE PHOTO. This used to upload into
                    onepage-assets and write onepages.avatar_url alone,
                    which is how one creator ended up with three faces:
                    this one, the one in Settings and the one on the
                    creator page. It goes into the account's own avatars
                    folder now and is saved through the same route
                    Settings uses, so every surface takes it
                    (lib/account/avatar-save, lib/account/profile-follow).
                  */
                  if (team) throw new SaveError(photoIsOwners(team.store))
                  /* The route's own reason reaches the sheet when it refuses (lib/onepage/photo-save). */
                  await saveAccountPhoto(result.url)
                  announceAvatar(result.url)
                  updateProfile({ avatar_url: result.url, avatar_video_url: null })
                  closeAvatarCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      {/* Video Selection Modal */}
      <SheetDialog
        open={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        phone={isMobileModalViewport}
        label={tt("Profile Video")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoModal(false); setShowAvatarEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Profile Video")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => { setAvatarPickError(null); videoFileInputRef.current?.click() }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Upload className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left">
                <p className="font-medium">{tt("Upload video")}</p>
                <p className="text-sm text-gray-500">{tt("MP4, MOV or WebM, up to 2 GB")}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <LibraryRow kind="video" onClick={() => { setAvatarPickError(null); setShowVideoModal(false); setAvatarLibrary("video") }} />
            {avatarPickError ? <p role="alert" className="text-[13px] leading-snug text-[#b42318]">{avatarPickError}</p> : null}
            <input
              ref={videoFileInputRef}
              type="file"
              accept={ONEPAGE_VIDEO_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                /* MP4, MOV, WebM or M4V up to 2 GB; it goes straight to storage in parts (lib/onepage/media-upload). */
                const verdict = checkMedia(file, "video")
                if (!verdict.ok) {
                  setAvatarPickError(uploadErrorText(verdict.code ?? "type", "video"))
                  return
                }
                setAvatarPickError(null)
                setTempAvatarVideo({ url: URL.createObjectURL(file), file })
                setShowVideoModal(false)
                setShowVideoCropModal(true)
              }}
              className="hidden"
            />
          </div>
        </SheetDialog>

      {/* Video Crop Modal: a square of the video, drawn in the circle exactly as framed (croppedMediaStyle). */}
      <SheetDialog
        open={showVideoCropModal}
        onClose={closeVideoCrop}
        phone={isMobileModalViewport}
        label={tt("Crop Video")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeVideoCrop(); setShowVideoModal(true) }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Video")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempAvatarVideo ? (
              <CropUpload
                kind="video"
                src={tempAvatarVideo.url}
                file={tempAvatarVideo.file ?? new Blob()}
                existingUrl={tempAvatarVideo.existing}
                aspect={1}
                shape="circle"
                prefix="avatar-video"
                onCancel={closeVideoCrop}
                onSaved={(result, crop) => {
                  updateProfile({ avatar_video_url: result.url, avatar_url: null, avatar_video_crop: crop })
                  closeVideoCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      {/* "Your files" for the profile photo or video, outside the sheets it is asked for from (components/onepage/library-pick). */}
      <FilesLibraryChooser
        kind={avatarLibraryKind.current}
        open={avatarLibrary !== null}
        onClose={() => setAvatarLibrary(null)}
        onPick={(url) => void pickAvatarFromLibrary(url)}
      />
      {/* "Your files" for a thumbnail or a product image: written where the upload beside it writes. */}
      <FilesLibraryChooser
        open={fieldLibrary !== null}
        onClose={() => setFieldLibrary(null)}
        onPick={(url) => {
          const target = fieldLibrary
          const found = target?.blockId ? findBlockDeep(onepage.draft_blocks, target.blockId)?.block : null
          if (!target?.blockId || !found) return
          const was = found.data as Record<string, unknown>
          const next: Record<string, unknown> | null =
            target.field === 'link_thumbnail' ? (found.type === 'product' ? { ...was, custom_thumbnail: url } : { ...was, thumbnail_url: url, icon: null })
            : target.field === 'product_image' ? { ...was, product_image: url }
            : target.field === 'thumbnail_url' ? { ...was, thumbnail_url: url }
            : null
          if (next) updateBlockDeep(target.blockId, { data: next as unknown as OnePageBlock["data"] })
          setImageBlockId(null)
          setImageFieldType(null)
        }}
      />
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
  onDeleteChild?: (childId: string, groupId: string) => void
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
  onDeleteChild,
  onOpenAddBlockModal,
}: BlockItemProps) {
  const shopMoney = useProductMoney()
  const { updateBlock, onepage } = useOnePage()
  /*
    A PRODUCT THAT IS GONE (archived or deleted) is not drawn in the preview
    or on the page, so its row does not show a price as if it were: it says
    "Not on your page", beside PRODUCTS' Unavailable badge (ProductRowBadge).
  */
  const rowProducts = useCreatorProducts(block.type === "product" && !!(block.data as ProductBlockData)?.product_id)
  const productGone = block.type === "product" && !!(block.data as ProductBlockData)?.product_id && editorProductState((block.data as ProductBlockData).product_id, rowProducts) === "unavailable"
  const [showAnimationMenu, setShowAnimationMenu] = useState(false)
  const [showAnimationSheet, setShowAnimationSheet] = useState(false)
  const [showButtonTextMenu, setShowButtonTextMenu] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsData, setStatsData] = useState<LinkStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [clickCount, setClickCount] = useState<number | null>(null)
  /* The date picker every page in /app shares, opened in place in this dialog. */
  const statsTimeZone = useMemo(() => viewerTimeZone(), [])
  /* Worked out once per block, not on every render of the list: Intl's formatToParts on each render of each block was most of what opening a sheet over the list cost (scripts/check-onepage-shell.mjs). */
  const statsToday = useMemo(() => todayIn(statsTimeZone, Date.now()), [statsTimeZone])
  const [statsPeriod, setStatsPeriod] = useState<RangeValue>(() => resolveValue({ preset: 'last_7_days' }, statsToday, 'last_7_days'))
  /* Below 640px the animation and stats dialogs are the shared sheet (see THE PHONE SHEETS at the top). */
  const isMobileStatsViewport = usePhoneWidth()
  /* A row tapped in the phone sheet: applied once the sheet has slid out, so the page's render does not hold up the slide. */
  const pendingAnimationRef = useRef<string | null>(null)
  const animationMenuRef = useRef<HTMLDivElement>(null)
  const buttonTextMenuRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const settingsId = `block-settings-${block.id}`

  const animationOptions = [
    { id: 'none', label: tt("None") },
    { id: 'pulse', label: tt("Pulse") },
    { id: 'bounce', label: tt("Bounce") },
    { id: 'shake', label: tt("Shake") },
    { id: 'glow', label: tt("Glow") },
    { id: 'swipe', label: tt("Swipe") },
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

  const setAnimation = (id: string) => {
    updateBlock(block.id, {
      data: {
        ...block.data,
        animation_type: id as 'none' | 'pulse' | 'bounce' | 'shake' | 'glow' | 'swipe'
      }
    })
  }
  /*
    ON A PHONE THE NUMBERS ARE ASKED FOR ONCE THE SHEET HAS ARRIVED, as the
    notifications sheet refreshes after its slide (BottomSheet onOpened):
    the loading state and the chart the answer draws land after the slide,
    not in the middle of it. A computer's dialog asks at once, as before.
  */
  const [statsSheetArrived, setStatsSheetArrived] = useState(false)
  const closeStatsSheet = useCallback(() => { setShowStatsModal(false); setStatsSheetArrived(false) }, [])
  const closeAnimationSheet = useCallback(() => setShowAnimationSheet(false), [])

  // Fetch stats when modal is opened or timeframe changes
  const fetchStats = async (period: RangeValue) => {
    if (!onepage?.id) return
    setStatsLoading(true)
    try {
      const b = boundsOf(period, statsTimeZone, Date.now())
      /* Bucketed on the creator's clock, as Analytics buckets the OnePage (lib/onepage/link-stats-server). */
      const url = `/api/onepage/stats?onepage_id=${onepage.id}&block_id=${encodeURIComponent(block.id)}&start=${encodeURIComponent(new Date(b.start).toISOString())}&end=${encodeURIComponent(new Date(b.end).toISOString())}&tz=${encodeURIComponent(statsTimeZone)}`
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
    if (showStatsModal && (!isMobileStatsViewport || statsSheetArrived)) fetchStats(statsPeriod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsPeriod.preset, statsPeriod.start, statsPeriod.end, showStatsModal, statsSheetArrived])

  /* The figure beside the row: the last year's clicks (an email block's sign-ups), from one answer the whole list shares (lib/onepage/stats-client). */
  useEffect(() => {
    if (!onepage?.id || !ROW_COUNT_TYPES.has(block.type)) return
    let live = true
    void pageClickCounts(onepage.id, statsTimeZone).then((counts) => {
      if (live && counts) setClickCount(counts[block.id] ?? 0)
    })
    return () => { live = false }
  }, [onepage?.id, block.id, block.type, statsTimeZone])

  const getBlockPreview = () => {
    switch (block.type) {
      case "link_button": {
        const data = block.data as LinkButtonBlockData
        // Truncate URL for display - show just the domain/path without full URL
        const displayUrl = data.url ? (data.url.length > 40 ? data.url.slice(0, 40) + "..." : data.url) : "https://..."
        // Auto-detect Notion URLs and show Notion icon
        const isNotionUrl = data.url?.toLowerCase().includes('notion.so') || data.url?.toLowerCase().includes('notion.site')
        const effectiveIconId = data.icon || (isNotionUrl ? 'notion' : undefined)
        /* A new link with no address is not on the page yet: the row says what it needs (lib/onepage/extra-blocks isIncompleteLink). */
        if (!hasRealUrl(data.url)) return { title: data.label || tt("My Link"), subtitle: tt("Add an address to show it"), icon: GlyphLink, thumbnail_url: data.thumbnail_url, iconId: effectiveIconId, incomplete: true }
        return { title: data.label || tt("My Link"), subtitle: displayUrl, icon: GlyphLink, thumbnail_url: data.thumbnail_url, iconId: effectiveIconId }
      }
      case "header":
        return { title: tt("Header"), subtitle: tt("Profile section"), icon: GlyphHeader }
      case "text": {
        const data = block.data as TextBlockData
        return { title: data.content?.slice(0, 30) || tt("Text block"), subtitle: tt("Text"), icon: GlyphText }
      }
      case "image":
        return { title: tt("Image"), subtitle: tt("Image block"), icon: GlyphImage }
      case "divider":
        return { title: tt("Divider"), subtitle: tt("Spacing"), icon: GlyphDivider }
      case "email_capture": {
        const data = block.data as EmailCaptureBlockData
        return { title: data.headline || tt("Email Signup"), subtitle: tt("Lead capture form"), icon: GlyphEmail }
      }
      case "social_row":
        return { title: tt("Social Icons"), subtitle: tt("Social links"), icon: GlyphSocial }
      case "product": {
        const data = block.data as ProductBlockData
        return { title: data.product_title || tt("Digital Product"), subtitle: data.product_price_cents ? shopMoney(data.product_price_cents, { type: data.product_type }) : tt("Select product"), icon: GlyphProduct, thumbnail_url: data.custom_thumbnail || data.product_thumbnail }
      }
      case "group": {
        const data = block.data as GroupBlockData
        const childCount = data.children?.length || 0
        return { title: data.title || tt("Group"), subtitle: tt("{childCount, plural, one {# item} other {# items}} · {layout}", { childCount, layout: data.layout === "carousel" ? tt("Carousel") : tt("Stack") }), icon: GlyphGroup }
      }
      case "pdf_document": {
        const data = block.data as PDFDocumentBlockData
        return { title: data.title || tt("PDF Document"), subtitle: data.pdf_file_url ? tt("PDF uploaded") : tt("No file"), icon: GlyphDocument, thumbnail_url: data.thumbnail_url }
      }
      case "food_menu": {
        const data = block.data as FoodMenuBlockData
        return { title: data.title || tt("Menu"), subtitle: data.pdf_file_url ? tt("Menu uploaded") : tt("No file"), icon: GlyphMenu, thumbnail_url: data.thumbnail_url }
      }
      case "calendly": {
        const data = block.data as CalendlyBlockData
        return { title: data.title || tt("Book a Meeting"), subtitle: data.calendly_url ? bookingProviderName(data.calendly_url) ?? tt("Booking link") : tt("Add a booking link"), icon: GlyphBooking, thumbnail_url: data.thumbnail_url }
      }
      case "course":
      case "music":
      case "testimonials":
      case "contact_form":
      case "embed":
      case "heading":
      case "faq":
      case "countdown":
      case "map":
      case "video":
        return extraBlockRow(block)
      default:
        return isExtraBlock(block) ? extraBlockRow(block) : { title: block.type, subtitle: "", icon: GlyphLink }
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
  const isSocialRow = block.type === "social_row"
  const hasStats = isLinkButton || isEmailCapture || isGroup || isProduct || isPDFDocument || isFoodMenu || isCalendly || isImage || isSocialRow
  const hasAnimation = isLinkButton || isProduct || isEmailCapture || isPDFDocument || isFoodMenu || isCalendly
  const hasThumbnail = (preview as any).thumbnail_url || hasLinkIcon((preview as any).iconId)

  return (
    <div
      className={cn(
        /* Round 40: the card the rest of /app draws, and an open one lifted a little rather than ringed in grey. */
        "relative rounded-2xl border bg-white transition-[border-color,box-shadow] duration-200",
        isSelected ? "border-[#d5d7dc] shadow-[0_0_0_1px_#d5d7dc,0_8px_24px_-12px_rgba(16,24,40,0.18)]" : "border-[#ececf1] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#d5d7dc]",
      )}
      /*
        Round 43: a block that is off fades its picture and its name, never
        its controls. The whole card was at half opacity, so its open
        settings, the toggle that turns it back on and Remove's question
        (Archive, Delete, Cancel) were all drawn faded too, as if they could
        not be pressed.
      */
      data-block-off={block.enabled ? undefined : ""}
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
            aria-label={tt("Move {title}", { title: preview.title })}
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
            aria-label={tt("Edit thumbnail")}
            /* Round 40: a soft ring under a mouse on the box-shadow alone (it was transition-all on a ring), and the picture decoded off the main thread. */
            className={cn("group relative w-10 h-10 rounded-[11px] bg-[#f2f2f4] flex items-center justify-center shrink-0 overflow-hidden outline-none transition-[box-shadow,opacity] duration-150 hover:shadow-[0_0_0_2px_#d5d7dc] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]", !block.enabled && "opacity-50")}
            data-row-thumbnail=""
            data-block-fade=""
          >
            {(preview as any).thumbnail_url ? (
              <img
                src={onePageImageSrc((preview as any).thumbnail_url, 80)}
                alt=""
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : hasLinkIcon((preview as any).iconId) ? (
              <LinkIcon name={(preview as any).iconId} size={20} className="text-[#1a1a2e]" tone="brand" />
            ) : (
              <Icon className="h-5 w-5 text-[#1a1a2e]" />
            )}
            {/* Pencil icon always visible in corner */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center">
              <Pencil className="w-2.5 h-2.5 text-gray-500" />
            </div>
            {/* Hover overlay, under a mouse only */}
            <div className="absolute inset-0 rounded-[11px] bg-black/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </button>
        ) : (
          <div className={cn("w-10 h-10 rounded-[11px] bg-[#f2f2f4] flex items-center justify-center shrink-0 overflow-hidden", !block.enabled && "opacity-50")} data-block-fade="">
            {(preview as any).thumbnail_url ? (
              <img
                src={(preview as any).thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : hasLinkIcon((preview as any).iconId) ? (
              <LinkIcon name={(preview as any).iconId} size={20} className="text-[#1a1a2e]" tone="brand" />
            ) : (
              <Icon className="h-5 w-5 text-[#1a1a2e]" />
            )}
          </div>
        )}

        {/*
          Title and subtitle: the press that opens and closes the settings
          (round 41: a key for a keyboard too, and where focus lands when
          they close with focus inside them).
        */}
        <div
          ref={titleRef}
          role="button"
          tabIndex={0}
          aria-expanded={isSelected}
          aria-controls={settingsId}
          data-block-open={block.id}
          data-block-fade=""
          className={cn("flex-1 min-w-0 cursor-pointer rounded-lg outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.35)]", !block.enabled && "opacity-50")}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelect()
            }
          }}
        >
          <p className="font-medium text-sm truncate">{preview.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("truncate", ((preview as any).incomplete || productGone) && "font-medium text-[#b54708]")} data-row-incomplete={(preview as any).incomplete ? "" : undefined}>{productGone ? tt("Not on your page") : preview.subtitle}</span>
            <BlockBadges block={block} />
            {isProduct && <ProductRowBadge productId={(block.data as ProductBlockData).product_id} />}
          </p>
        </div>

        {/* Warning icon for link blocks without URL */}
        {isLinkButton && !(block.data as LinkButtonBlockData).url && (
          <div className="p-1" title={tt("No link added")}>
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
                  {tt("Position this block under the Header block or at the bottom for better look")}
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
                  setShowAnimationSheet(true)
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
              title={tt("Animation")}
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
          <SheetDialog
            open={showAnimationSheet}
            onClose={closeAnimationSheet}
            phone={isMobileStatsViewport}
            label={tt("Animation")}
            className="p-0 gap-0 overflow-hidden mx-auto border-[#ececf1] w-[calc(100%-32px)] max-w-[360px] rounded-2xl"
            sheet={{
              onClosed: () => {
                const next = pendingAnimationRef.current
                pendingAnimationRef.current = null
                if (next) setAnimation(next)
              },
            }}
          >
              <DialogHeader className="p-4 border-b">
                <SheetDialogTitle className="text-base font-semibold">{tt("Animation")}</SheetDialogTitle>
              </DialogHeader>
              {/* The sheet keeps clear of the home indicator itself; the dialog needs the room. */}
              <div className={cn("p-3 max-h-[65vh] overflow-y-auto", !isMobileStatsViewport && "pb-4")}>
                <div className="space-y-1">
                  {animationOptions.map((anim) => {
                    const currentAnimation = (block.data as any).animation_type || 'none'
                    return (
                      <button
                        key={anim.id}
                        type="button"
                        /* On a phone the sheet closes itself first (data-sheet-close), and the choice lands once it has gone. */
                        data-sheet-close={isMobileStatsViewport ? "" : undefined}
                        onClick={() => {
                          if (isMobileStatsViewport) {
                            pendingAnimationRef.current = anim.id
                            return
                          }
                          setAnimation(anim.id)
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
          </SheetDialog>
        )}

        {/* Stats control for link buttons and email capture */}
        {hasStats && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                /* Opening the dialog fetches, in the effect that watches it. */
                setShowStatsModal(true)
              }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title={tt("View Stats")}
            >
              <BarChart2 className="h-4 w-4" />
              {clickCount !== null && (
                <span className="text-xs font-medium">{clickCount}</span>
              )}
            </button>

            {/* Stats Modal */}
            <SheetDialog
              open={showStatsModal}
              onClose={closeStatsSheet}
              phone={isMobileStatsViewport}
              sheet={{ onOpened: () => setStatsSheetArrived(true) }}
              label={isGroup ? tt("Group Stats") : isEmailCapture ? tt("Form Stats") : isPDFDocument ? tt("PDF Stats") : isImage ? tt("Image Stats") : isSocialRow ? tt("Social Stats") : tt("Link Stats")}
              className="p-0 gap-0 overflow-hidden mx-auto border-[#ececf1] w-[calc(100%-32px)] max-w-[420px] rounded-2xl"
            >
                <DialogHeader className="p-4 border-b">
                  <SheetDialogTitle className="text-base font-semibold">{isGroup ? tt("Group Stats") : isEmailCapture ? tt("Form Stats") : isPDFDocument ? tt("PDF Stats") : isImage ? tt("Image Stats") : isSocialRow ? tt("Social Stats") : tt("Link Stats")}</SheetDialogTitle>
                </DialogHeader>

                {/* In the sheet this scrolls under the title, and a pull down from its top closes the sheet. */}
                <div className={cn("p-4", isMobileStatsViewport && "min-h-0 overflow-y-auto overscroll-contain")}>
                  {/*
                    The period: the same picker as every page in /app, as a
                    popover over the sheet (round 43). It opened inline, so the
                    dialog grew by the whole panel and ran over the page.
                    Beside it, the same figures in Analytics.
                  */}
                  <div className="mb-4 flex items-center justify-between gap-3" data-stats-head="">
                    <DateRangePicker value={statsPeriod} onChange={setStatsPeriod} today={statsToday} overlay />
                    <NextLink
                      href={blockAnalyticsHref(statsPeriod, isEmailCapture ? "signups" : isPDFDocument ? "opens" : "clicks")}
                      onClick={() => setShowStatsModal(false)}
                      data-stats-analytics=""
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] px-2 text-[13px] font-medium text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f4f4f6] outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
                    >
                      {tt("See in Analytics")}
                      <ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </NextLink>
                  </div>

                  {/* The OnePage chart from Analytics, with this block's figures (components/onepage/link-stats-chart). */}
                  <LinkStatsChart
                    stats={statsData}
                    loading={statsLoading}
                    kind={isEmailCapture ? "signups" : isPDFDocument ? "opens" : "clicks"}
                    start={statsPeriod.start}
                    end={statsPeriod.end}
                    endIsToday={statsPeriod.end === statsToday}
                  />
                </div>
            </SheetDialog>
          </>
        )}

        <BlockToggle checked={block.enabled} onCheckedChange={onToggle} label={tt("Show {title}", { title: preview.title })} />
      </div>

      {/*
        Round 41: the settings open to their measured height and close back to
        nothing (components/onepage/reveal), so the cards under them glide
        instead of jumping; a closed card lets its editor go.
      */}
      <Reveal open={isSelected} id={settingsId} returnFocus={titleRef} unmountWhenShut className="rounded-b-2xl">
        <div className="space-y-4 rounded-b-2xl border-t border-[#eef0f2] bg-[#fafafb] p-4" data-block-settings="">
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
            onDeleteChild={onDeleteChild}
          />
          {!isHeaderBlock && (
            /* Move, archive or delete (components/onepage/block-remove): the question opens under the row to its height. */
            <BlockFootActions
              question={block.type === "group" && ((block.data as GroupBlockData).children?.length ?? 0) > 0 ? tt("Remove this group? Its blocks stay on your page.") : tt("Remove this block?")}
              isFirst={isFirst}
              isLast={isLast}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onRemove={onRemove}
              onArchive={onArchive}
            />
          )}
        </div>
      </Reveal>
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
  /** The product kind: a membership or community plan is priced in US dollars. */
  type?: string | null
  /** Published, draft or archived (lib/onepage/product-block editorProductState). */
  status?: string | null
  archived?: boolean | null
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
  onDeleteChild,
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
  onDeleteChild?: (childId: string, groupId: string) => void
  updateBlockOverride?: (blockId: string, updates: Partial<OnePageBlock>) => void
  sellerProducts?: SellerProduct[]
}) {
  /* The store's own currency: a lei store's product reads 49.00 lei here (components/platform/price-currency). */
  const shopMoney = useProductMoney()
  const { updateBlock: contextUpdateBlock, updateBlockData, updateSocialLinks, setActiveSection, onepage, removeBlock, getLatestOnePage } = useOnePage()
  const updateBlock = updateBlockOverride || contextUpdateBlock

  /* Products for the product block's picker, with their status: read once for the whole editor (./product-block-editor). */
  const creatorProducts = useCreatorProducts(block.type === "product")
  const sellerProductsLocal: SellerProduct[] = creatorProducts ?? []

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
  /* The block as it is now, for an upload or a pick that finishes after the render that started it. */
  const blockRef = useRef(block)
  blockRef.current = block

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
      const hasChangedUrls = (data.platforms || []).some(p => {
        const now = socialLinks?.[p.platform as keyof typeof socialLinks]
        return !!now && now !== p.url
      })

      if (hasNewPlatforms || hasRemovedPlatforms || needsInitialSync || hasChangedUrls) {
        // Preserve existing order, add new ones at end, remove deleted ones
        const existingOrder = (data.platforms || [])
          .filter(p => socialLinks?.[p.platform as keyof typeof socialLinks])
          .map(p => ({ ...p, url: socialLinks?.[p.platform as keyof typeof socialLinks] as string }))
        const existingPlatforms = new Set(existingOrder.map(p => p.platform))
        const newPlatforms = activeSocials.filter(s => !existingPlatforms.has(s.platform))

        /* Silent, as the list's own sync is: bringing the row in line with the links is no edit, so opening this editor never marks the page Unsaved or adds an Undo step. A social row is never inside a group, so this is the page's own update. */
        contextUpdateBlock(block.id, {
          data: {
            ...block.data,
            platforms: [...existingOrder, ...newPlatforms]
          }
        }, { silent: true })
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
      /* Straight to storage under the owner's own folder, with a type storage takes (a HEIC becomes a JPEG): lib/onepage/media-upload. */
      const { url: publicUrl } = await uploadOnePageMedia(file, { prefix: `thumbnail_${block.id}`, want: "image" })

      updateData({ thumbnail_url: publicUrl, icon: null })
      setShowThumbnailPopup(false)
    } catch (error) {
      console.error('Error uploading thumbnail:', error)
      alert(uploadMessage(error))
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
      /* Straight to storage under the owner's own folder, with a type storage takes (a HEIC becomes a JPEG): lib/onepage/media-upload. */
      const { url: publicUrl } = await uploadOnePageMedia(file, { prefix: `image_${block.id}_${currentImageItemId}`, want: "image" })

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
      alert(uploadMessage(error))
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
      const layout = productLayoutOf(data, onepage?.theme)
      const ctaOptions = [tt("Get My Guide"), tt("Get it Now"), tt("Buy Now"), tt("Download"), tt("Get Access"), tt("Enroll Now"), tt("Start Learning"), tt("Custom")]
      const blockBackgroundColorPresets = ['#1a1a2e', '#b2846c', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      const textColorPresets = ['#ffffff', '#000000', '#1a1a1a', '#f5f5f5', '#374151', '#6b7280']
      const buttonColorPresets = ['#ffffff', '#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      const buttonTextColorPresets = ['#1a1a1a', '#ffffff', '#b2846c', '#3b82f6', '#ef4444', '#10b981']

      // Handle style selection (always use filled button style)
      const handleStyleSelect = (styleId: ProductBlockStyle) => {
        /* Picked here, so a theme's own way of showing products leaves it alone (lib/onepage/theme-layout themedProductStyle). */
        updateData({ style: styleId, style_chosen: true, button_style: "filled" })
      }

      return (
        <div className="space-y-4">
          {/* Eight layouts, each drawn small (./product-block-editor); the live page draws them in components/onepage/product-block. */}
          <ProductLayoutPicker data={data} theme={onepage?.theme} onPick={handleStyleSelect} />

          {/* Custom Thumbnail Section */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">{tt("Custom Thumbnail")}</Label>
            <p className="text-xs text-muted-foreground">{tt("Override the product image with a custom thumbnail")}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenThumbnailModal && onOpenThumbnailModal(block.id)}
                className="group relative w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-gray-50 hover:bg-gray-100"
              >
                {data.custom_thumbnail ? (
                  <img
                    src={data.custom_thumbnail}
                    alt={tt("Custom thumbnail")}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : data.product_thumbnail ? (
                  <img
                    src={data.product_thumbnail}
                    alt={tt("Product thumbnail")}
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
                  {tt("Remove")}
                </Button>
              )}
            </div>
          </div>

          {/* CTA Button Text - Modern Dropdown */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">{tt("Button Text")}</Label>
            <div className="relative" ref={ctaDropdownRef}>
              <button
                type="button"
                onClick={() => setShowCtaDropdown(!showCtaDropdown)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-transparent"
              >
                <span className="truncate">{ctaOptions.slice(0, -1).includes(data.cta_text || "") ? data.cta_text : tt("Custom")}</span>
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
                    {tt("Custom")}
                  </button>
                </div>
              )}
            </div>
            {/* Custom text input - always visible below dropdown */}
            <Input
              value={data.cta_text || ""}
              onChange={(e) => updateData({ cta_text: e.target.value })}
              placeholder={tt("Enter button text...")}
              className="h-9 rounded-lg"
            />
          </div>

          {/* Colours for the layouts drawn on a card of their own (the button and the minimal line wear the theme). */}
          {layoutHasCard(layout) && (
            <div className="space-y-4 pt-2 border-t">
              <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Colours for this block")}</p>
              <p className="-mt-3 text-[13px] text-[#6b7280]">{tt("Picking a theme sets these back to the theme's.")}</p>

              {/* The four overrides, each the editor's one colour field; Reset goes back to the theme's. */}
              <ColorRow
                label={tt("Block background")}
                value={data.block_background_color || null}
                emptyLabel={tt("Theme")}
                /* With none of its own the block takes the theme's button colour, and the picker starts there. */
                fallback={onepage?.theme.button_color || "#1a1a2e"}
                onChange={(color) => updateData({ block_background_color: color })}
                onClear={() => updateData({ block_background_color: null })}
                suggestions={blockBackgroundColorPresets}
              />
              <ColorRow
                label={tt("Text")}
                description={tt("Title, description, price{value}", { value: "" })}
                value={data.text_color || null}
                emptyLabel={tt("Theme")}
                /* Every picker starts on what the block shows now: the theme's colour, not a guess. */
                fallback={onepage?.theme.button_text_color || "#111827"}
                onChange={(color) => updateData({ text_color: color })}
                onClear={() => updateData({ text_color: null })}
                suggestions={textColorPresets}
              />
              {layout !== "overlay" && (
                <ColorRow
                  label={tt("Button")}
                  value={data.button_color || null}
                  emptyLabel={tt("Theme")}
                  fallback={onepage?.theme.button_color || "#ffffff"}
                  onChange={(color) => updateData({ button_color: color })}
                  onClear={() => updateData({ button_color: null })}
                  suggestions={buttonColorPresets}
                />
              )}
              {layout !== "overlay" && (
                <ColorRow
                  label={tt("Button text")}
                  value={data.button_text_color || null}
                  emptyLabel={tt("Theme")}
                  fallback={onepage?.theme.button_text_color || "#1a1a1a"}
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
          <p className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Display")}</p>
          <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{tt("How this block sits on your page")}</p>
        </div>

        {/* Classic and Featured, as Linktree's link editor draws them: a picture of each, the picked one in a thin dark border. */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: "default" as const, label: tt("Classic") },
            { id: "pro" as const, label: tt("Featured") },
          ]).map((o) => {
            const on = currentLayoutType === o.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                data-layout-choice={o.id}
                onClick={() => updateData({ layout_type: o.id })}
                className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-2 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
              >
                <ChoiceMark on={on} />
                {/* Round 43: drawn in this page's colours and button style, with this link's own picture (./product-block-editor LinkLayoutThumb). */}
                <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                  <LinkLayoutThumb id={o.id} theme={onepage?.theme as never} image={(block.data as { thumbnail_url?: string | null; custom_thumbnail?: string | null }).thumbnail_url || (block.data as { custom_thumbnail?: string | null }).custom_thumbnail || null} />
                </span>
                <span className={cn("block py-2 text-center text-[13.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{o.label}</span>
              </button>
            )
          })}
        </div>

        {/* Display Mode Options - Only shown when Pro Layout is selected and NOT YouTube */}
        {currentLayoutType === 'pro' && block.type === 'link_button' && !isYouTubeUrl((block.data as LinkButtonBlockData).url) && (
          <div className="pt-3 mt-1 border-t space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tt("Display Mode")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cover', label: tt("Cover"), desc: tt("Fill & crop") },
                { id: 'contain', label: tt("Fit"), desc: tt("Show all") },
                { id: 'full', label: tt("Full"), desc: tt("Original") },
              ].map((mode) => {
                const currentDisplayMode = (block.data as LinkButtonBlockData).display_mode || 'cover'
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateData({ display_mode: mode.id as 'cover' | 'contain' | 'full' })}
                    className="relative p-2.5 rounded-lg border-2 text-center isolate border-gray-200 hover:border-gray-300 bg-white"
                  >
                    <CardMark on={currentDisplayMode === mode.id} tint="#f4f4f6" />
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
            <p className="pt-1 text-[16px] font-semibold text-[#1a1a2e]">{tt("Info")}</p>
            <label className="block">
              <span className="sr-only">{tt("Title")}</span>
              <input value={data.label} onChange={(e) => updateData({ label: e.target.value })} placeholder={tt("Title")} aria-label={tt("Title")} data-link-title="" className={linkField} />
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
                  /* A new link starts at "https://": a whole address typed or pasted after it is that address, not "https://https://…". */
                  const url = e.target.value.replace(/^https?:\/\/(?=https?:\/\/)/i, "")
                  if (onUrlChangeWithAutoFetch) {
                    onUrlChangeWithAutoFetch(block.id, url)
                  } else {
                    updateData({ url })
                  }
                }}
                placeholder="https://"
                className={linkField}
                aria-describedby={!hasRealUrl(data.url) ? `link-needs-url-${block.id}` : undefined}
              />
            </label>
            {!hasRealUrl(data.url) ? (
              <p id={`link-needs-url-${block.id}`} data-link-needs-url="" className="-mt-1 px-1 text-[12.5px] font-medium text-[#b54708]">
                {tt("Add an address to show it. Until then it is only in your preview.")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenThumbnailModal && onOpenThumbnailModal(block.id)}
              data-link-thumbnail=""
              className="flex min-h-[72px] w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-[#e3e4e8] bg-white p-2.5 pr-4 text-left outline-none transition-colors hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f4f4f6] text-[#6b7280]">
                {data.thumbnail_url ? (
                  <img src={onePageImageSrc(data.thumbnail_url, 96)} alt="" className="h-full w-full object-cover" />
                ) : hasLinkIcon(data.icon) ? (
                  <LinkIcon name={data.icon} size={22} className="text-[#1a1a2e]" tone="brand" />
                ) : (
                  <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-[#1a1a2e]">{tt("Thumbnail")}</span>
                <span className="block truncate text-[13px] text-[#6b7280]">{data.thumbnail_url ? tt("An image beside the title") : hasLinkIcon(data.icon) ? tt("An icon beside the title") : tt("Add an image or an icon")}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.75} />
            </button>

            {/* WhatsApp Group URL - Only shown for WhatsApp URLs */}
            {(data.url?.includes('wa.me') || data.url?.includes('whatsapp.com')) && (
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("WhatsApp Group URL")}</Label>
                <Input
                  value={(data as any).whatsapp_group_url || ""}
                  onChange={(e) => updateData({ whatsapp_group_url: e.target.value })}
                  placeholder="https://chat.whatsapp.com/..."
                  className="h-9"
                />
              </div>
            )}

            {/* YouTube: one choice of two (components/onepage/block-settings-kit ModeChoice), not two switches. */}
            {isYouTubeUrl(data.url) && (
              <SettingsGroup title={tt("YouTube")}>
                <ModeChoice
                  label={tt("YouTube")}
                  accent="#e62117"
                  value={(data.youtube_mode || 'embed_video') as string}
                  options={[
                    { id: 'embed_video', label: tt("Play video on page"), hint: tt("Embed video directly in Pro Layout"), icon: <Play className="h-4 w-4" strokeWidth={2} /> },
                    { id: 'open_video', label: tt("Open YouTube video"), hint: tt("Redirect on click only"), icon: <ExternalLink className="h-4 w-4" strokeWidth={2} /> },
                  ]}
                  onPick={(mode) => {
                    /* embed_video uses Pro Layout, open_video uses Default Layout, with the video's own picture. */
                    const videoIdMatch = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
                    updateData({
                      /* 'open_video' is a mode the page reads and the type has never listed (lib/onepage/types YouTubeMode). */
                      youtube_mode: mode as YouTubeMode,
                      layout_type: mode === 'open_video' ? 'default' : 'pro',
                      ...(mode === 'open_video' && videoIdMatch ? { thumbnail_url: `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg` } : {}),
                    })
                  }}
                />
                {(data.youtube_mode as string) === 'open_video' && (
                  <QuietAction
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => {
                      const videoIdMatch = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
                      if (videoIdMatch) updateData({ thumbnail_url: `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg` })
                    }}
                  >
                    {tt("Refresh thumbnail")}
                  </QuietAction>
                )}
              </SettingsGroup>
            )}

            {/* Spotify Settings - Only shown for Spotify URLs */}
            {isSpotifyUrl(data.url) && (
              <div className="space-y-2.5 border-t border-[#eef0f2] pt-4">
                <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Spotify")}</p>
                <ModeChoice
                  label={tt("Spotify")}
                  accent="#1DB954"
                  value={(data.spotify_mode || 'go_to_url') as SpotifyMode}
                  options={[
                    { id: 'audio_preview' as SpotifyMode, label: tt("Audio preview"), hint: tt("Open modern preview modal"), icon: <Play className="h-4 w-4" strokeWidth={2} /> },
                    { id: 'go_to_url' as SpotifyMode, label: tt("Go to URL"), hint: tt("Redirect to Spotify directly"), icon: <ExternalLink className="h-4 w-4" strokeWidth={2} /> },
                    { id: 'show_streaming' as SpotifyMode, label: tt("Show streaming"), hint: tt("Display all platforms"), icon: <LayoutGrid className="h-4 w-4" strokeWidth={2} /> },
                  ]}
                  onPick={async (mode) => {
                    updateData({ spotify_mode: mode })
                    /* For streaming mode, fetch available services and metadata. */
                    if (mode === 'show_streaming') {
                      try {
                        const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                        if (res.ok) {
                          const spotifyData = await res.json()
                          updateData({
                            spotify_mode: mode,
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
                  }}
                />

                {/* Enable Metadata toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{tt("Enable Metadata")}</div>
                      <div className="text-xs text-muted-foreground">{tt("Show song type & artist info")}</div>
                    </div>
                  </div>
                  <Toggle label={tt("Enable Metadata")}
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
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f4f4f6] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#ececef] active:bg-[#e6e6ea]"
                >
                  <RotateCcw className="w-4 h-4" />
                  {tt("Refresh Thumbnail")}
                </button>

                {/* Streaming Services List - shown when show_streaming is selected */}
                {data.spotify_mode === 'show_streaming' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">{tt("Streaming services")}</div>
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
                        {tt("Sync")}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{tt("Visitors may see a different order depending on their location or preferences.")}</p>
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
                              {service.found ? tt("Visible") : tt("Not found")}
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
                              {service.found ? tt("Edit") : tt("+ Add")}
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
              <div className="space-y-2.5 border-t border-[#eef0f2] pt-4">
                <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("SoundCloud")}</p>

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
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f4f4f6] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#ececef] active:bg-[#e6e6ea]"
                >
                  <RotateCcw className="w-4 h-4" />
                  {tt("Refresh Thumbnail")}
                </button>
              </div>
            )}

            {/* Apple Music Settings - Only shown for Apple Music URLs */}
            {data.url?.includes('music.apple.com') && (
              <div className="space-y-2.5 border-t border-[#eef0f2] pt-4">
                <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Apple Music")}</p>
                <ModeChoice
                  label={tt("Apple Music")}
                  accent="#FA233B"
                  value={(data.apple_music_mode || 'go_to_url') as string}
                  options={[
                    { id: 'audio_preview', label: tt("Audio preview"), hint: tt("Open modern preview modal"), icon: <Play className="h-4 w-4" strokeWidth={2} /> },
                    { id: 'go_to_url', label: tt("Go to URL"), hint: tt("Redirect to Apple Music directly"), icon: <ExternalLink className="h-4 w-4" strokeWidth={2} /> },
                  ]}
                  onPick={async (mode) => {
                    updateData({ apple_music_mode: mode as NonNullable<LinkButtonBlockData["apple_music_mode"]> })
                    /* For audio preview mode, fetch metadata. */
                    if (mode === 'audio_preview') {
                      try {
                        const res = await fetch(`/api/onepage/apple-music?url=${encodeURIComponent(data.url)}`)
                        if (res.ok) {
                          const appleMusicData = await res.json()
                          updateData({
                            apple_music_mode: mode as NonNullable<LinkButtonBlockData["apple_music_mode"]>,
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
                  }}
                />

                {/* Enable Metadata toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5">
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
                      <div className="text-sm font-medium">{tt("Enable Metadata")}</div>
                      <div className="text-xs text-muted-foreground">{tt("Show song type & artist info")}</div>
                    </div>
                  </div>
                  <Toggle label={tt("Enable Metadata")}
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
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f4f4f6] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#ececef] active:bg-[#e6e6ea]"
                >
                  <RotateCcw className="w-4 h-4" />
                  {tt("Refresh Thumbnail")}
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
              <Label className="text-xs">{tt("Text")}</Label>
              <Textarea value={data.content} onChange={(e) => updateData({ content: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tt("Alignment")}</Label>
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
          { id: 'subscribe', label: tt("Subscribe"), text: tt("Subscribe") },
          { id: 'join', label: tt("Join Now"), text: tt("Join Now") },
          { id: 'get_access', label: tt("Get Access"), text: tt("Get Access") },
          { id: 'download', label: tt("Download"), text: tt("Download") },
          { id: 'sign_up', label: tt("Sign Up"), text: tt("Sign Up") },
          { id: 'unlock', label: tt("Unlock Now"), text: tt("Unlock Now") },
        ] as const

        // Handle preset change - clear custom text when selecting a preset
        const handlePresetChange = (presetId: EmailCaptureButtonPreset) => {
          const preset = buttonTextPresets.find(p => p.id === presetId)
          if (preset) {
            updateData({ button_preset: presetId, button_text: preset.text, custom_button_text: '' })
          }
        }

        /* The five layouts (lib/onepage/email-signup), and the image they show when there is one. */
        const emailLayouts: { id: EmailSignupLayout; label: string }[] = [
          { id: "default", label: tt("Classic") },
          { id: "pro", label: tt("Featured") },
          { id: "cover", label: tt("Cover") },
          { id: "bold", label: tt("Solid") },
          { id: "minimal", label: tt("Simple") },
          /* Round 43: three more (components/onepage/email-signup). */
          { id: "connect", label: tt("Connect") },
          { id: "letter", label: tt("Letter") },
          { id: "bar", label: tt("Bar") },
        ]
        const currentEmailLayout = emailSignupLayout(data.layout_type)
        const emailImage = emailSignupImage(data)

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                {tt("Settings")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {tt("Layout")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Headline */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Headline")}</Label>
                <Input
                  value={data.headline || "Join my newsletter"}
                  onChange={(e) => updateData({ headline: e.target.value })}
                  className="h-9"
                  placeholder={tt("Join my newsletter")}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Description")}</Label>
                <Input
                  value={data.description || "Get updates and exclusive content"}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="h-9"
                  placeholder={tt("Get updates and exclusive content")}
                />
              </div>

              {/* Button Text Selector - Dropdown like Animation */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Button Text")}</Label>
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
                    <span>{buttonTextPresets.find(p => p.id === (data.button_preset || 'subscribe'))?.label || tt("Subscribe")}</span>
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
                <Label className="text-xs">{tt("Custom Text")}</Label>
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
                  placeholder={tt("Enter custom button text")}
                />
              </div>

              {/* Success Message */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Success Message")}</Label>
                <Input
                  value={data.success_message || "Thanks for subscribing!"}
                  onChange={(e) => updateData({ success_message: e.target.value })}
                  className="h-9"
                  placeholder={tt("Thanks for subscribing!")}
                />
              </div>

              {/* A first name above the email box: it goes on the subscriber and into the welcome email. */}
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-xs">{tt("Ask for a first name")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Shown above the email box. Your emails can greet them by name.")}</p>
                </div>
                <Toggle label={tt("Ask for a first name")}
                  checked={data.ask_name === true}
                  onCheckedChange={(checked) => updateData({ ask_name: checked })}
                />
              </div>

              {/* After they join: a link (a free guide, a private video, a group chat). A file is under Enable Digital Product. */}
              <div className="space-y-2 pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs">{tt("After they join (optional)")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("A link they get right away: a free guide, a video, a group chat.")}</p>
                </div>
                <Input
                  value={data.after_signup_url || ""}
                  onChange={(e) => updateData({ after_signup_url: e.target.value.trim() })}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="h-9"
                  placeholder="https://"
                  aria-invalid={!!data.after_signup_url && !/^https?:\/\/\S+\.\S+/i.test(data.after_signup_url) || undefined}
                />
                {data.after_signup_url && !/^https?:\/\/\S+\.\S+/i.test(data.after_signup_url) ? (
                  <p className="text-[11px] text-[#b42318]">{tt("Start the link with https://")}</p>
                ) : null}
                {data.after_signup_url ? (
                  <Input
                    value={data.after_signup_label || ""}
                    onChange={(e) => updateData({ after_signup_label: e.target.value })}
                    maxLength={40}
                    className="h-9"
                    placeholder={tt("Open your free gift")}
                  />
                ) : null}
              </div>

              {/* Product Image Picker - Always show in settings */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">{tt("Product Image")}</Label>
                <p className="text-[10px] text-muted-foreground">
                  {tt("Shown in the Featured, Cover, Solid, Simple and Bar layouts.")}
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
                    {data.product_image ? tt("Change") : tt("Upload")}
                  </Button>
                </div>
              </div>

              {/*
                ROUND 40: A FILE AFTER SIGNUP. On, with a file, the live page turns the button into Download
                once the address is given, and app/api/onepage/leads answers with the same file, read from the
                published block (lib/onepage/signup-file). On with no file gives nothing, and says so here.
              */}
              <div className="space-y-2 border-t border-[#eef0f2] pt-3" data-signup-file="">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Enable Digital Product")}</p>
                    <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("People who join get a file to download")}</p>
                  </div>
                  <Toggle label={tt("Enable Digital Product")}
                    checked={data.enable_digital_product || false}
                    onCheckedChange={(checked) => updateData({ enable_digital_product: checked })}
                  />
                </div>

                {data.enable_digital_product && !data.digital_product_file_url ? (
                  <p className="rounded-xl bg-[#fff7ed] px-3 py-2 text-[12.5px] leading-snug text-[#9a4a07]" data-signup-file-missing="">
                    {tt("Upload the file. Until then, people who join get nothing to download.")}
                  </p>
                ) : null}

                {data.enable_digital_product && (
                  <div className="space-y-3 pt-2">
                    {/* Digital Product File Picker */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">{tt("Digital Product File")}</Label>
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
                            {data.digital_product_title || tt("Upload file")}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {data.digital_product_file_url
                              ? tt("Click to change file")
                              : tt("PDF, ZIP, or any file type")}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      </button>

                      {data.digital_product_file_url && (
                        <div className="space-y-1.5 mt-2">
                          <Label className="text-[10px]">{tt("File Name")}</Label>
                          <Input
                            value={data.digital_product_title || ""}
                            onChange={(e) => updateData({ digital_product_title: e.target.value })}
                            className="h-8 text-xs"
                            placeholder={tt("My Free Guide")}
                          />
                        </div>
                      )}
                    </div>

                    {data.digital_product_file_url && (
                      <p className="text-[10px] text-muted-foreground bg-[#f4f4f6] p-2 rounded-lg">
                        {tt("When visitors subscribe, they can download \"")}{data.digital_product_title || tt("your file")}{tt("\" directly on this page.")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Where the addresses go: Emails › Subscribers, and Klaviyo or Omnisend when connected (components/onepage/creator-blocks). */}
              <div className="pt-3 border-t">
                <SignupDestination suggest={data.integration_hint ?? null} />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              {/*
                FIVE LAYOUTS, EACH DRAWN SMALL AS IT WILL LOOK (components/onepage/email-signup EmailLayoutThumb):
                in the page's colours, with the block's image or, without one, the mark the layout shows instead.
                Three across, so the choice fits on a phone without a scroll.
              */}
              <div role="radiogroup" aria-label={tt("Layout")} className="grid grid-cols-3 gap-2" data-email-layouts="">
                {emailLayouts.map((option) => {
                  const on = currentEmailLayout === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-email-layout-option={option.id}
                      onClick={() => {
                        if (on) return
                        hapticTap("soft")
                        /* Connect says "Connect with" beside your picture, unless the button already has words you chose. */
                        updateData({ layout_type: option.id as EmailCaptureLayoutType, ...(option.id === "connect" ? connectButtonPatch(data, tt("Connect with")) ?? {} : {}) })
                      }}
                      className="relative isolate flex flex-col gap-1.5 rounded-xl border border-[#e3e4e8] bg-white p-1.5 text-left transition-[border-color] duration-150 [@media(hover:hover)]:hover:border-[#c9cbd1]"
                    >
                      <CardMark on={on} width={1.5} tint="#ffffff" />
                      <EmailLayoutThumb layout={option.id} image={emailImage} theme={onepage?.theme ?? {}} avatar={onepage?.avatar_url ?? null} />
                      <span className="px-1 pb-0.5 text-[12.5px] font-medium text-[#1a1a2e]">{option.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[12px] leading-snug text-[#6b7280]">
                {emailImage ? tt("Featured, Cover, Solid, Simple and Bar show your image.") : tt("No image needed. Add one in Settings to show it in Featured, Cover, Solid, Simple and Bar.")}
              </p>
            </TabsContent>
          </Tabs>
        )
      }

      case "header": {
        const data = block.data as HeaderBlockData
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{tt("Show Avatar")}</Label>
              <Toggle label={tt("Show Avatar")} checked={data.show_avatar} onCheckedChange={(checked) => updateData({ show_avatar: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{tt("Show Name")}</Label>
              <Toggle label={tt("Show Name")} checked={data.show_name} onCheckedChange={(checked) => updateData({ show_name: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{tt("Show Bio")}</Label>
              <Toggle label={tt("Show Bio")} checked={data.show_bio} onCheckedChange={(checked) => updateData({ show_bio: checked })} />
            </div>
          </div>
        )
      }

      case "social_row": {
        const activeSocials = getOrderedSocials()

        return (
          <div className="space-y-3">
            <Label className="text-xs">{tt("Social Links")}</Label>
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
                      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white shadow-[inset_0_0_0_1px_rgba(17,17,19,0.1),0_1px_2px_rgba(17,17,19,0.06)]">
                        <SocialIcon platform={platform} size={15} color="#1a1a2e" tone="brand" />
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
                {tt("No social links added yet")}
              </p>
            )}

            {/* Add Social Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenSocialModal}
            >
              <Plus className="h-4 w-4 mr-2" />
              {tt("Add Social Link")}
            </Button>

            {/* Padding Controls */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <RangeRow compact label={tt("Top padding")} value={(block.data as SocialRowBlockData).padding_top ?? 0} min={0} max={48} step={4} unit="px" onChange={(value) => updateData({ padding_top: value })} />
              <RangeRow compact label={tt("Bottom padding")} value={(block.data as SocialRowBlockData).padding_bottom ?? 0} min={0} max={48} step={4} unit="px" onChange={(value) => updateData({ padding_bottom: value })} />
            </div>
          </div>
        )
      }

      case "divider": {
        const data = block.data as DividerBlockData
        const dividerStyles = [
          { id: "space", label: tt("Space"), preview: <div className="w-full h-3" /> },
          { id: "line", label: tt("Line"), preview: <div className="w-full h-[1px] bg-gray-400" /> },
          { id: "dots", label: tt("Dots"), preview: (
            <div className="flex justify-center gap-1.5">
              {[...Array(3)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />)}
            </div>
          )},
          { id: "wave", label: tt("Wave"), preview: (
            <svg width="100%" height="8" viewBox="0 0 60 8" preserveAspectRatio="none">
              <path d="M0 4 Q 7.5 0, 15 4 T 30 4 T 45 4 T 60 4" fill="none" stroke="#9ca3af" strokeWidth="1" />
            </svg>
          )},
          { id: "zigzag", label: tt("Zigzag"), preview: (
            <svg width="100%" height="8" viewBox="0 0 60 8" preserveAspectRatio="none">
              <path d="M0 4 L10 0 L20 8 L30 0 L40 8 L50 0 L60 4" fill="none" stroke="#9ca3af" strokeWidth="1" />
            </svg>
          )},
          { id: "dashed", label: tt("Dashed"), preview: <div className="w-full border-t border-dashed border-gray-400" /> },
          { id: "gradient", label: tt("Gradient"), preview: (
            <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
          )},
          { id: "double", label: tt("Double"), preview: (
            <div className="flex flex-col gap-0.5">
              <div className="w-full h-[1px] bg-gray-400" />
              <div className="w-full h-[1px] bg-gray-400" />
            </div>
          )},
        ] as const

        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tt("Style")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {dividerStyles.map(({ id, label, preview }) => (
                  <button
                    key={id}
                    onClick={() => updateData({ style: id })}
                    className="relative flex flex-col items-center gap-1.5 p-2 rounded-lg border isolate border-gray-200 hover:border-gray-300 bg-white"
                  >
                    <CardMark on={data.style === id} width={1} tint="#f4f4f6" />
                    <div className="w-full h-4 flex items-center justify-center">
                      {preview}
                    </div>
                    <span className="text-[10px] text-gray-600">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <RangeRow compact label={tt("Height")} value={data.height} min={8} max={64} step={4} unit="px" onChange={(value) => updateData({ height: value })} />
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
          { id: 'original', label: tt("Original") },
          { id: 'square', label: tt("Square") },
          { id: 'portrait', label: tt("Portrait") },
          { id: 'landscape', label: tt("Landscape") },
          { id: 'wide', label: tt("Wide") },
        ]

        const displayStyles: { id: string; label: string; desc: string }[] = [
          { id: 'single', label: tt("Single"), desc: tt("One image at a time") },
          { id: 'grid', label: tt("Grid"), desc: tt("Multiple images in grid") },
          { id: 'carousel', label: tt("Carousel"), desc: tt("Swipeable slideshow") },
        ]

        const borderRadiusOptions: { id: string; label: string }[] = [
          { id: 'none', label: tt("None") },
          { id: 'sm', label: tt("Small") },
          { id: 'md', label: tt("Medium") },
          { id: 'lg', label: tt("Large") },
          { id: 'full', label: tt("Full") },
        ]

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                {tt("Settings")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {tt("Layout")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Images List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{tt("Images")}</Label>
                  <span className="text-xs text-muted-foreground">{tt("{length, plural, one {# image} other {# images}}", { length: images.length })}</span>
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
                          {tt("Remove")}
                        </button>
                      )}
                    </div>

                    {/* One row per picture: the picture, Upload or Replace, Your files, Remove (components/onepage/image-field). */}
                    <div className="space-y-2">
                      <OnePageImageField
                        value={img.image_url}
                        prefix={`image_${block.id}_${img.id}`}
                        onChange={(url, size) => {
                          /* Read the block as it is now: the upload may finish after other edits to it. */
                          const now = (blockRef.current.data || {}) as ImageBlockData
                          const list = now.images || (now.image_url ? [{ id: '1', image_url: now.image_url, alt_text: now.alt_text, link_url: now.link_url }] : [])
                          const next = list.map((it) => it.id === img.id ? { ...it, image_url: url || '', width: size?.width, height: size?.height } : it)
                          updateData({ images: next, image_url: next.find((it) => it.image_url)?.image_url || '' })
                        }}
                      />

                      <Input
                        value={img.title || ''}
                        onChange={(e) => updateImage(img.id, { title: e.target.value })}
                        placeholder={tt("Caption (optional)")}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Link URL for this image */}
                    {data.clickable && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{tt("Link URL")}</Label>
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
                  {tt("Add Image")}
                </Button>
              </div>

              <div className="border-t border-gray-100" />

              {/* Make Clickable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">{tt("Make clickable")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Add links to images")}</p>
                </div>
                <Toggle label={tt("Add links to images")}
                  checked={data.clickable || false}
                  onCheckedChange={(checked) => updateData({ clickable: checked })}
                />
              </div>

              {/* Show Captions Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">{tt("Show captions")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Display image titles")}</p>
                </div>
                <Toggle label={tt("Display image titles")}
                  checked={data.show_captions || false}
                  onCheckedChange={(checked) => updateData({ show_captions: checked })}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-4">
              {/* Display Style */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">{tt("Display Style")}</Label>
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
                    <Label className="text-xs font-medium">{tt("Grid Columns")}</Label>
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
                    <Label className="text-xs font-medium">{tt("Carousel View")}</Label>
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
                      <Label className="text-xs font-medium">{tt("Autoplay")}</Label>
                      <p className="text-[10px] text-muted-foreground">{tt("Auto-advance slides")}</p>
                    </div>
                    <Toggle label={tt("Auto-advance slides")}
                      checked={data.carousel_autoplay || false}
                      onCheckedChange={(checked) => updateData({ carousel_autoplay: checked })}
                    />
                  </div>
                </>
              )}

              <div className="border-t border-gray-100" />

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">{tt("Aspect Ratio")}</Label>
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
                <Label className="text-xs font-medium">{tt("Corner Radius")}</Label>
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
                <Label className="text-xs font-medium">{tt("Image Fit")}</Label>
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
                    {tt("Cover")}
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
                    {tt("Contain")}
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Hidden file input for image upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept={ONEPAGE_IMAGE_ACCEPT}
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
          { id: 'default', label: tt("Default"), description: tt("Button with document icon") },
          { id: 'pro', label: 'Pro', description: tt("Image, title, description & button") },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                {tt("Settings")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {tt("Layout")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Title")}</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder={tt("My PDF Document")}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Description")}</Label>
                <Textarea
                  value={data.description || ""}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="min-h-[60px] resize-none"
                  placeholder={tt("A brief description of your PDF...")}
                />
              </div>

              {/* PDF File Upload */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">{tt("PDF File")}</Label>
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
                      {data.pdf_file_url ? data.title || tt("PDF File") : tt("Upload PDF")}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {data.pdf_file_url
                        ? tt("Click to change file")
                        : tt("Select a PDF from your device")}
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
                <Label className="text-xs">{tt("Button Text")}</Label>
                <Input
                  value={data.button_text || "View PDF"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder={tt("View PDF")}
                />
              </div>

              {/* Preview Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Preview Modal Button Text")}</Label>
                <Input
                  value={data.preview_button_text || "View full PDF"}
                  onChange={(e) => updateData({ preview_button_text: e.target.value })}
                  className="h-9"
                  placeholder={tt("View full PDF")}
                />
              </div>

              {/* Enable Preview Toggle */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">{tt("Enable Preview")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Show PDF preview modal when clicked")}</p>
                </div>
                <Toggle label={tt("Show PDF preview when clicked")}
                  checked={data.enable_preview !== false}
                  onCheckedChange={(checked) => {
                    updateData({ enable_preview: checked, open_directly: checked ? false : data.open_directly })
                  }}
                />
              </div>

              {/* Open Directly Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">{tt("Open Directly")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Open PDF file directly in new tab")}</p>
                </div>
                <Toggle label={tt("Open PDF directly in a new tab")}
                  checked={data.open_directly === true}
                  onCheckedChange={(checked) => {
                    updateData({ open_directly: checked, enable_preview: checked ? false : data.enable_preview })
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">{tt("Choose how this block displays on your page")}</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={(data.layout_type || 'default') === 'default'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", (data.layout_type || 'default') === 'default' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Default")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("Button with icon")}</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={data.layout_type === 'pro'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", data.layout_type === 'pro' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Featured")}</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("With image & details")}</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">{tt("Thumbnail Image")}</Label>
                  <p className="text-[10px] text-muted-foreground">
                    {tt("Display an image with your PDF (used in Featured layout)")}
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={onePageImageSrc(data.thumbnail_url, 96)} alt="" className="w-full h-full object-cover" />
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
                      {data.thumbnail_url ? tt("Change") : tt("Upload")}
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
          { id: 'default', label: tt("Default"), description: tt("Button with menu icon") },
          { id: 'pro', label: 'Pro', description: tt("Image, title, description & button") },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                {tt("Settings")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {tt("Layout")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Title")}</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder={tt("Menu")}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Description")}</Label>
                <Textarea
                  value={data.description || ""}
                  onChange={(e) => updateData({ description: e.target.value })}
                  className="min-h-[60px] resize-none"
                  placeholder={tt("A brief description of your menu...")}
                />
              </div>

              {/* PDF File Upload */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">{tt("Menu PDF File")}</Label>
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
                      {data.pdf_file_url ? data.title || tt("Menu PDF") : tt("Upload Menu PDF")}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {data.pdf_file_url
                        ? tt("Click to change file")
                        : tt("Select a PDF from your device")}
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
                <Label className="text-xs">{tt("Button Text")}</Label>
                <Input
                  value={data.button_text || "View Menu"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder={tt("View Menu")}
                />
              </div>

              {/* Preview Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Preview Modal Button Text")}</Label>
                <Input
                  value={data.preview_button_text || "View Menu"}
                  onChange={(e) => updateData({ preview_button_text: e.target.value })}
                  className="h-9"
                  placeholder={tt("View Menu")}
                />
              </div>

              {/* Enable Preview Toggle */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">{tt("Enable Preview")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Show menu preview modal when clicked")}</p>
                </div>
                <Toggle label={tt("Show menu preview when clicked")}
                  checked={data.enable_preview !== false}
                  onCheckedChange={(checked) => {
                    updateData({ enable_preview: checked, open_directly: checked ? false : data.open_directly })
                  }}
                />
              </div>

              {/* Open Directly Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">{tt("Open Directly")}</Label>
                  <p className="text-[10px] text-muted-foreground">{tt("Open menu PDF directly in new tab")}</p>
                </div>
                <Toggle label={tt("Open menu PDF directly in a new tab")}
                  checked={data.open_directly === true}
                  onCheckedChange={(checked) => {
                    updateData({ open_directly: checked, enable_preview: checked ? false : data.enable_preview })
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">{tt("Choose how this block displays on your page")}</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={(data.layout_type || 'default') === 'default'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", (data.layout_type || 'default') === 'default' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Default")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("Button with icon")}</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={data.layout_type === 'pro'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", data.layout_type === 'pro' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Featured")}</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("With image & details")}</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">{tt("Thumbnail Image")}</Label>
                  <p className="text-[10px] text-muted-foreground">
                    {tt("Display an image with your menu (used in Featured layout)")}
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={onePageImageSrc(data.thumbnail_url, 96)} alt="" className="w-full h-full object-cover" />
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
                      {data.thumbnail_url ? tt("Change") : tt("Upload")}
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
          { id: 'default', label: tt("Default"), description: tt("Button with calendar icon") },
          { id: 'pro', label: 'Pro', description: tt("Image, title, description & button") },
        ] as const

        return (
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <Settings className="w-3.5 h-3.5" />
                {tt("Settings")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {tt("Layout")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-0 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Title")}</Label>
                <Input
                  value={data.title || ""}
                  onChange={(e) => updateData({ title: e.target.value })}
                  className="h-9"
                  placeholder={tt("Book a Meeting")}
                />
              </div>

              {/* Calendly URL */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Booking link")}</Label>
                <Input
                  value={data.calendly_url || ""}
                  onChange={(e) => updateData({ calendly_url: e.target.value.trim() })}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="h-9"
                  placeholder="https://calendly.com/your-username/30min"
                  aria-invalid={!!data.calendly_url && !bookingSource(data.calendly_url) || undefined}
                />
                {/* Calendly or Cal.com, the two booking pages made to be shown inside another page (lib/onepage/creator-blocks bookingSource). */}
                <p className={cn("text-[10px]", data.calendly_url && !bookingSource(data.calendly_url) ? "text-[#b42318]" : "text-muted-foreground")}>
                  {data.calendly_url && !bookingSource(data.calendly_url) ? tt("Paste a Calendly or Cal.com link to one of your events.") : tt("Paste your Calendly or Cal.com event link")}
                </p>
              </div>

              {/* Button Text */}
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Button Text")}</Label>
                <Input
                  value={data.button_text || "Schedule Now"}
                  onChange={(e) => updateData({ button_text: e.target.value })}
                  className="h-9"
                  placeholder={tt("Schedule Now")}
                />
              </div>

              {/* Embed Mode Options */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-xs font-medium">{tt("Behavior")}</Label>

                {/* Go Directly To Link */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">{tt("Go Directly To Link")}</Label>
                    <p className="text-[10px] text-muted-foreground">{tt("Open Calendly page in new tab")}</p>
                  </div>
                  <Toggle label={tt("Open Calendly page in a new tab")}
                    checked={data.embed_mode === 'direct_link'}
                    onCheckedChange={(checked) => {
                      updateData({ embed_mode: checked ? 'direct_link' : 'embedded' })
                    }}
                  />
                </div>

                {/* Embedded Calendar (Modal) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">{tt("Embedded Calendar")}</Label>
                    <p className="text-[10px] text-muted-foreground">{tt("Show calendar in popup modal")}</p>
                  </div>
                  <Toggle label={tt("Show calendar in a popup")}
                    checked={data.embed_mode === 'embedded'}
                    onCheckedChange={(checked) => {
                      updateData({ embed_mode: checked ? 'embedded' : 'direct_link', embed_type: 'modal' })
                    }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">{tt("Choose how this block displays on your page")}</p>

              {/* Layout Options Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Default Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'default' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={(data.layout_type || 'default') === 'default'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      (data.layout_type || 'default') === 'default' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", (data.layout_type || 'default') === 'default' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Default")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("Button with icon")}</p>
                </button>

                {/* Pro Layout Option */}
                <button
                  type="button"
                  onClick={() => updateData({ layout_type: 'pro' as PDFDocumentLayoutType })}
                  className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
                >
                  <CardMark on={data.layout_type === 'pro'} tint="#f7f7f8" />
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
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                      data.layout_type === 'pro' ? "border-[#1a1a2e]" : "border-gray-300"
                    )}>
                      <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", data.layout_type === 'pro' ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    </div>
                    <span className="font-medium text-sm">{tt("Featured")}</span>
                    <Sparkles className="w-3 h-3 text-[#1a1a2e]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("With image & details")}</p>
                </button>
              </div>

              {/* Custom Thumbnail - Only show for Pro layout */}
              {data.layout_type === 'pro' && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs">{tt("Thumbnail Image")}</Label>
                  <p className="text-[10px] text-muted-foreground">
                    {tt("Display an image with your Calendly block (used in Featured layout)")}
                  </p>
                  <div className="flex gap-2 items-center">
                    {data.thumbnail_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                        <img src={onePageImageSrc(data.thumbnail_url, 96)} alt="" className="w-full h-full object-cover" />
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
                      {data.thumbnail_url ? tt("Change") : tt("Upload")}
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
        /* Published, a draft (allowed here, never on the page), or gone (archived or deleted): lib/onepage/product-block. */
        const productState = editorProductState(data.product_id, creatorProducts)
        const pickable = pickableProducts(effectiveSellerProducts ?? [])

        return (
          <div className="space-y-4">
            {/* The product this block sells, as a card, and Change opens the list (components/onepage/product-picker). */}
            <ProductPicker
              products={pickable}
              stateOf={(id) => editorProductState(id, effectiveSellerProducts)}
              selectedId={data.product_id}
              fallback={{ title: data.product_title, thumbnail: data.product_thumbnail }}
              state={productState}
              money={(cents, product) => shopMoney(cents, product)}
              onPick={(product) => {
                const full = pickable.find((p) => p.id === product.id)
                /* The description, cut to its first seven words. */
                let shortDesc = full?.description || ''
                const words = shortDesc.split(' ')
                if (words.length > 7) shortDesc = words.slice(0, 7).join(' ') + '...'
                updateData({
                  product_id: product.id,
                  product_title: product.title,
                  product_thumbnail: product.thumbnail_url || null,
                  product_description: shortDesc || null,
                  product_price_cents: product.price_cents || 0,
                  product_slug: full?.slug || null,
                  product_type: product.type || null,
                })
              }}
            />

            {/* The product's own editors, side by side, and what a draft or a product that is gone means for the page. */}
            {data.product_id && (
              <div className="space-y-2">
                <ProductStateNote
                  state={productState}
                  productId={data.product_id}
                  onRemove={() => {
                    /* On the page, or inside a group (lib/onepage/product-block removePlanFor). */
                    const plan = removePlanFor(onepage?.draft_blocks, block.id)
                    if (plan.kind === "top") removeBlock(block.id)
                    else if (plan.kind === "child") {
                      const group = onepage?.draft_blocks.find((b) => b.id === plan.groupId)
                      if (group) contextUpdateBlock(plan.groupId, { data: { ...(group.data as GroupBlockData), children: plan.children as OnePageBlock[] } })
                    }
                  }}
                />
                {productState !== "unavailable" && <ProductEditLinks productId={data.product_id} />}
              </div>
            )}

            {/* Display Options */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{tt("Show Price")}</Label>
                <Toggle label={tt("Show Price")}
                  checked={data.show_price !== false}
                  onCheckedChange={(checked) => updateData({ show_price: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">{tt("Show Description")}</Label>
                <Toggle label={tt("Show Description")}
                  checked={data.show_description !== false}
                  onCheckedChange={(checked) => updateData({ show_description: checked })}
                />
              </div>
            </div>

            {/* When someone taps it, and instant checkout (./product-block-editor). It replaces the free-only Quick Checkout. */}
            {data.product_id && <ProductTapSetting data={data} onChange={(patch) => updateData(patch)} />}
          </div>
        )
      }

      case "course":
      case "music":
      case "testimonials":
      case "contact_form":
      case "embed":
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
        if (isExtraBlock(block)) return <ExtraBlockEditor block={block} updateData={updateData} />
        return <p className="text-xs text-muted-foreground">{tt("No settings available")}</p>
    }
  }

  // Special handling for group blocks with Links/Layout tabs
  if (block.type === "group") {
    const groupData = block.data as GroupBlockData

    const getChildBlockPreview = (child: OnePageBlock) => {
      switch (child.type) {
        case "link_button": {
          const d = child.data as LinkButtonBlockData
          return { title: d.label || tt("My Link"), icon: GlyphLink, thumbnail_url: d.thumbnail_url, iconId: resolveLinkIcon(d.icon, d.url) }
        }
        case "text": {
          const d = child.data as TextBlockData
          return { title: d.content?.slice(0, 25) || tt("Text"), icon: GlyphText, thumbnail_url: null, iconId: null }
        }
        case "image": {
          const d = child.data as ImageBlockData
          return { title: tt("Image"), icon: GlyphImage, thumbnail_url: d.images?.[0]?.image_url || d.image_url || null, iconId: null }
        }
        case "product": {
          const d = child.data as ProductBlockData
          return { title: d.product_title || tt("Product"), icon: GlyphProduct, thumbnail_url: d.custom_thumbnail || d.product_thumbnail || null, iconId: null }
        }
        case "divider":
          return { title: tt("Divider"), icon: GlyphDivider, thumbnail_url: null, iconId: null }
        case "email_capture": {
          const d = child.data as EmailCaptureBlockData
          return { title: d.headline || tt("Email Signup"), icon: GlyphEmail, thumbnail_url: null, iconId: null }
        }
        default: {
          /* Round 41: any block can be in a group; its row reads as it does on the page's list. */
          const p = getBlockPreviewData(child, shopMoney) as { title: string; icon: Glyph; thumbnail_url?: string | null }
          return { title: p.title, icon: p.icon, thumbnail_url: p.thumbnail_url ?? null, iconId: null }
        }
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

    /* Up or down one place: the rows are dragged with a mouse, and a finger has no drag here, so the open block has arrows too. */
    const moveChild = (childId: string, dir: -1 | 1) => {
      const children = [...(groupData.children || [])]
      const from = children.findIndex((c) => c.id === childId)
      const to = from + dir
      if (from < 0 || to < 0 || to >= children.length) return
      const [moved] = children.splice(from, 1)
      children.splice(to, 0, moved)
      updateData({ children: children.map((c, i) => ({ ...c, sort_order: i })) })
    }

    const removeChildFromGroup = (childId: string) => {
      const childToRemove = (groupData.children || []).find(c => c.id === childId)
      if (childToRemove && onMoveChildToMainList) {
        // Out of the group and onto the page, in one edit (LinksTab handleMoveChildToMainList)
        onMoveChildToMainList(childToRemove, block.id)
      } else {
        // Fallback: just remove from group (but don't delete entirely)
        const newChildren = (groupData.children || []).filter(c => c.id !== childId)
        updateData({ children: newChildren })
      }
      if (selectedGroupChildId === childId) {
        setSelectedGroupChildId(null)
      }
    }

    /* Round 41: deleted for good ("blocks I add into a group cannot be deleted from that group"). */
    const deleteChild = (childId: string) => {
      if (onDeleteChild) onDeleteChild(childId, block.id)
      else updateData({ children: (groupData.children || []).filter((c) => c.id !== childId).map((c, i) => ({ ...c, sort_order: i })) })
      if (selectedGroupChildId === childId) setSelectedGroupChildId(null)
    }

    /* The group as it is now (lib/onepage/context getLatestOnePage), so an upload that lands after another edit to the group keeps both. */
    const updateChildBlock = (childId: string, updates: Partial<OnePageBlock>) => {
      const latest = getLatestOnePage()?.draft_blocks.find((b) => b.id === block.id)
      const current = ((latest?.data as GroupBlockData | undefined) ?? groupData).children || []
      const newChildren = current.map(c =>
        c.id === childId ? { ...c, ...updates, data: { ...c.data, ...(updates.data || {}) } as OnePageBlockData } : c
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
                <Label className="text-xs">{tt("Title")}</Label>
                <Input value={d.label || ""} onChange={(e) => updateChildData({ label: e.target.value })} className="h-9" placeholder={tt("Link title")} />
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
                <Label className="text-xs">{tt("Text Content")}</Label>
                <Textarea value={d.content || ""} onChange={(e) => updateChildData({ content: e.target.value })} className="min-h-[80px]" placeholder={tt("Enter text...")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Alignment")}</Label>
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
                <Label className="text-xs">{tt("Style")}</Label>
                <div className="flex gap-2">
                  {(["space", "line", "dots"] as const).map((style) => (
                    <Button key={style} variant={d.style === style ? "default" : "outline"} size="sm" onClick={() => updateChildData({ style })} className="capitalize h-8 flex-1">
                      {style}
                    </Button>
                  ))}
                </div>
              </div>
              <RangeRow compact label={tt("Height")} value={d.height || 24} min={8} max={64} step={4} unit="px" onChange={(v) => updateChildData({ height: v })} />
            </div>
          )
        }
        case "image": {
          const d = child.data as ImageBlockData
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Image URL")}</Label>
                <Input value={d.image_url || ""} onChange={(e) => updateChildData({ image_url: e.target.value })} className="h-9" placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Link URL (optional)")}</Label>
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
                <Label className="text-xs">{tt("Headline")}</Label>
                <Input value={d.headline || ""} onChange={(e) => updateChildData({ headline: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tt("Button Text")}</Label>
                <Input value={d.button_text || ""} onChange={(e) => updateChildData({ button_text: e.target.value })} className="h-9" />
              </div>
            </div>
          )
        }
        default:
          return <p className="text-xs text-muted-foreground">{tt("No settings available")}</p>
      }
    }

    return (
      <Tabs defaultValue="links" className="w-full">
        <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
          <TabsTrigger value="links" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <Link className="w-3.5 h-3.5" />
            {tt("Links")}
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <LayoutGrid className="w-3.5 h-3.5" />
            {tt("Layout")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="mt-0 space-y-4">
          {/* Group Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">{tt("Group Title (optional)")}</Label>
            <Input
              value={groupData.title || ""}
              onChange={(e) => updateData({ title: e.target.value || null })}
              placeholder={tt("Enter group title...")}
              className="h-9"
            />
          </div>

          {/* Canvas / Block List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{tt("Blocks in Group")}</Label>
              <span className="text-xs text-muted-foreground">{groupData.children?.length || 0} {tt("items")}</span>
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
                    <span className="text-sm font-medium">{tt("Add Block")}</span>
                  </button>
                  <p className="text-xs text-gray-400 text-center px-4">
                    {tt("or drag blocks from the list onto this group")}
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
                        )}
                        /* Round 43: an off block fades its picture and name; its switch and Move out stay as they are. */
                        data-block-off={child.enabled ? undefined : ""}
                      >
                        <div className="cursor-grab text-gray-300 hover:text-gray-400">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className={cn("w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden", !child.enabled && "opacity-50")} data-block-fade="">
                          {preview.thumbnail_url ? (
                            <img src={preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : hasLinkIcon(preview.iconId) ? (
                            <LinkIcon name={preview.iconId} size={16} className="text-[#1a1a2e]" tone="brand" />
                          ) : (
                            <ChildIcon className="h-4 w-4 text-[#1a1a2e]" />
                          )}
                        </div>
                        <span className={cn("flex-1 text-sm truncate", !child.enabled && "opacity-50")} data-block-fade="">{preview.title}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!!child.enabled}
                          aria-label={tt("Show on page")}
                          data-group-child-toggle={child.id}
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
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[translate]",
                            child.enabled ? "translate-x-3.5" : "translate-x-0.5"
                          )} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeChildFromGroup(child.id) }}
                          className="text-gray-400 hover:text-[#1a1a2e] transition-colors p-1"
                          title={tt("Move out of group")}
                          aria-label={tt("Move out of group")}
                          data-group-child-out={child.id}
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
                    <span className="text-xs">{tt("Add Block")}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Selected Child Settings - Full Block Settings */}
            {selectedChild && (
              <div className="border rounded-xl p-3 bg-white space-y-3" data-group-child-settings={selectedChild.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium text-[#1a1a2e]">{getChildBlockPreview(selectedChild).title}</span>
                  <button
                    type="button"
                    aria-label={tt("Close")}
                    onClick={() => setSelectedGroupChildId(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
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
                {/*
                  Round 41: the foot every block has (components/onepage/block-remove):
                  move it within the group, then Move out or Delete.
                */}
                {(() => {
                  const at = (groupData.children || []).findIndex((c) => c.id === selectedChild.id)
                  const last = (groupData.children || []).length - 1
                  return (
                    <BlockFootActions
                      key={selectedChild.id}
                      question={tt("Remove this block from the group?")}
                      isFirst={at <= 0}
                      isLast={at >= last}
                      onMoveUp={() => moveChild(selectedChild.id, -1)}
                      onMoveDown={() => moveChild(selectedChild.id, 1)}
                      onRemove={() => deleteChild(selectedChild.id)}
                      keep={{ label: tt("Move out"), line: tt("Back on your page, under the group"), onPick: () => removeChildFromGroup(selectedChild.id) }}
                    />
                  )
                })()}
              </div>
            )}
          </div>

        </TabsContent>

        <TabsContent value="layout" className="mt-0 space-y-3">
          <p className="text-xs text-muted-foreground mb-2">{tt("Choose how blocks are arranged in this group")}</p>

          {/* Layout Options Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stack Layout */}
            <button
              type="button"
              onClick={() => updateData({ layout: "stack" as const })}
              className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
            >
              <CardMark on={groupData.layout === "stack"} tint="#f7f7f8" />
              {/* Visual Preview */}
              {/* Small, as the signup's layouts are (round 11): the shape, not a big card. */}
              <div className="w-full h-[60px] bg-gray-100 rounded-lg mb-2 flex flex-col items-center justify-center overflow-hidden px-2.5 gap-1">
                <div className="w-full h-3 bg-white rounded-[3px] border border-gray-200" />
                <div className="w-full h-3 bg-white rounded-[3px] border border-gray-200" />
                <div className="w-full h-3 bg-white rounded-[3px] border border-gray-200" />
              </div>
              
              {/* Label */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                  groupData.layout === "stack" ? "border-[#1a1a2e]" : "border-gray-300"
                )}>
                  <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", groupData.layout === "stack" ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                </div>
                <span className="font-medium text-sm">{tt("Stack")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("Vertical list")}</p>
            </button>

            {/* Carousel Layout */}
            <button
              type="button"
              onClick={() => updateData({ layout: "carousel" as const })}
              className="relative p-3 rounded-xl border-2 text-left flex flex-col isolate border-gray-200 hover:border-gray-300 bg-white"
            >
              <CardMark on={groupData.layout === "carousel"} tint="#f7f7f8" />
              {/* Visual Preview */}
              <div className="w-full h-[60px] bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden p-2 gap-1">
                <div className="w-[40%] h-full bg-white rounded-[3px] border border-gray-200 shrink-0" />
                <div className="w-[40%] h-full bg-white rounded-[3px] border border-gray-200 shrink-0" />
                <div className="w-[20%] h-full bg-white/50 rounded-[3px] border border-gray-100 shrink-0" />
              </div>
              
              {/* Label */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[180ms]",
                  groupData.layout === "carousel" ? "border-[#1a1a2e]" : "border-gray-300"
                )}>
                  <div className={cn("w-2 h-2 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", groupData.layout === "carousel" ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                </div>
                <span className="font-medium text-sm">{tt("Carousel")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 ml-6">{tt("Swipe horizontal")}</p>
            </button>
          </div>

          {/* Carousel Options - shown when carousel layout is selected */}
          {groupData.layout === "carousel" && (
            <div className="space-y-4 pt-3 border-t">
              <div className="space-y-2">
                <Label className="text-xs">{tt("Carousel View")}</Label>
                <div className="flex gap-2">
                  {([
                    { id: "1" as CarouselViewType, label: tt("1 per row") },
                    { id: "1.2" as CarouselViewType, label: tt("1.2 per row") },
                    { id: "1.5" as CarouselViewType, label: tt("1.5 per row") },
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
            {tt("Settings")}
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 h-11 rounded-xl border text-[13.5px] font-medium gap-1.5 transition-[border-color,box-shadow] data-[state=active]:border-[#1a1a2e] data-[state=active]:shadow-[0_0_0_0.5px_#1a1a2e] data-[state=active]:bg-white data-[state=active]:text-[#1a1a2e] data-[state=inactive]:border-[#e3e4e8] data-[state=inactive]:bg-white data-[state=inactive]:text-[#4b5563] data-[state=inactive]:hover:border-[#c9cbd1]">
            <LayoutGrid className="w-3.5 h-3.5" />
            {tt("Layout")}
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
