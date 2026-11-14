"use client"

import {HeaderCoverEditor} from "../header-cover-editor"

import { ProfileImage } from "@/components/onepage/profile-image"

import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import type { LinkButtonBlockData } from "@/lib/onepage/types"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import * as ReactModule from "react"
import { useEffect, useLayoutEffect, useState, useRef, useCallback, startTransition, memo } from "react"
import { flushSync } from "react-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { pageGroundIsLight, socialIconStyleOf, socialIconToneOf, socialIsBrandDisc, socialMarkColorOf, socialTileStyle } from "@/lib/onepage/social-look"
import {
  ArrowLeft,
  AtSign,
  ImageIcon,
  ChevronRight,
  ChevronLeft,
  CircleUserRound,
  Layers,
  LayoutGrid,
  PaintBucket,
  PanelBottom,
  Pencil,
  Type,
  RectangleHorizontal,
  Check,
  Loader2,
  Search,
  Video,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { photoIsOwners, useOnePageTeam } from "@/lib/onepage/team-context"
import { ONEPAGE_IMAGE_ACCEPT, ONEPAGE_VIDEO_ACCEPT, checkMedia } from "@/lib/onepage/media-rules"
import { croppedMediaStyle } from "@/lib/onepage/media-crop"
import { openableImage, uploadErrorText, uploadMessage } from "@/lib/onepage/media-upload"
import { CropUpload } from "@/components/onepage/crop-upload"
import { SaveError, saveAccountPhoto } from "@/lib/onepage/photo-save"
import { PosterVideo } from "@/components/onepage/poster-video"
import { videoPoster } from "@/lib/onepage/poster-video"
import { FilesLibraryChooser, LibraryButton, LibraryRow, fileFromLibrary } from "@/components/onepage/library-pick"
import { UploadProgress, useMediaUpload } from "@/components/onepage/upload-progress"
import { DialogHeader } from "@/components/ui/dialog"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { secondaryDepth } from "@/components/ui/depth-button"
import { familyOf, fontStack, onePageFontHref, onePageFontSampleHref, realWeight } from "@/lib/onepage/fonts"
import { AVATAR_BORDER_MAX, AVATAR_RADIUS_DEFAULT, AVATAR_RADIUS_MAX, avatarBorderWidth, avatarRadius, avatarShapeOf, avatarSizeOf, bioFamilyOf, bioWeightOf, caseOf, textSizeOf, titleFamilyOf, titleWeightOf, trackingOf } from "@/lib/onepage/header-style"
import { PILL_FROM, PILL_RADIUS, type ButtonHover, buttonAlign, buttonFill, buttonHover, buttonHoverVars, buttonIconSide, buttonShadow, buttonShape, buttonSize, themeButtonStyle } from "@/lib/onepage/button-style"
import { normalizeHex } from "@/lib/onepage/color"
import { NAME_STYLES, nameColours, nameStyleCss, nameStyleOf, type NameStyle } from "@/lib/onepage/name-style"
import { WALLPAPER_PATTERNS, canonicalPatternId, isAutoInk, isPatternId, patternStyle, resolvedPatternInk, wallpaperIsDark, wallpaperMediaLook, type PatternOpacity } from "@/lib/onepage/wallpaper"
import { WallpaperEffectLayers, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { WallpaperEffects } from "@/components/onepage/themes/wallpaper-effects"
import { PillTabs } from "@/components/onepage/pill-tabs"
import { LAYER_LEAVE_MS, LAYER_MOTION_EASE, LAYER_MOTION_MS, LAYER_PHONE, startWhenFramesFlow } from "@/components/app/page-layer"
import { CONTENT_IN_EASE, CONTENT_IN_FROM, CONTENT_IN_MS } from "@/lib/ui/pill-switch"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { NATIVE_BACK_EVENT } from "@/lib/ui/native-back"
import { AvatarMark } from "@/components/app/app-avatar"
import {
  ChoiceCard,
  ColorRow,
  NavRow,
  PanelHeader,
  PanelSection,
  ProMark,
  RangeRow,
  SectionTitle,
  Segmented,
  SettingRow,
  SwitchRow,
  CheckMark,
  ChoiceMark,
  SwatchMark,
  choiceOff,
  fieldInput,
} from "@/components/onepage/editor-kit"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
/* Round 40: five more themes, the Layout panel, font pairs, the gradient's direction and the wallpaper library (components/onepage/themes). */
import { withR40Themes } from "@/components/onepage/themes/r40-themes"
import { RENAISSANCE_THEMES } from "@/components/onepage/themes/renaissance-theme"
import { orderThemes, themeGroupOf, type ThemeGroupId } from "@/components/onepage/themes/theme-order"
import { ThemePreview } from "@/components/onepage/themes/theme-preview"
import { useThemePreviewScale } from "@/components/onepage/themes/preview-scale"
import { previewAccountKey, previewAccountOf, type PreviewAccount } from "@/components/onepage/themes/preview-account"
import { usePageMoney } from "@/components/platform/price-currency"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { themeLabel } from "@/components/onepage/themes/theme-names"
import { LayoutSection } from "@/components/onepage/themes/layout-section"
import { FontPairs } from "@/components/onepage/themes/font-pairs"
import { GradientDirection } from "@/components/onepage/themes/gradient-direction"
import { WallpaperLibrary } from "@/components/onepage/themes/wallpaper-library"
import { blockLayoutOf, blockSpacingOf, coverImageOf, editLinearGradient, readLinearGradient } from "@/lib/onepage/theme-layout"

type DesignSection = "header" | "theme" | "layout" | "wallpaper" | "text" | "buttons" | "socials" | "footer"

// Body text fonts
const FONTS = [
  { name: "Inter", category: "sans", get style() { return tt("Clean & Professional") }, value: "'Inter', sans-serif" },
  { name: "Poppins", category: "sans", get style() { return tt("Rounded & Friendly") }, value: "'Poppins', sans-serif" },
  { name: "Montserrat", category: "sans", get style() { return tt("Elegant & Bold") }, value: "'Montserrat', sans-serif" },
  { name: "Lato", category: "sans", get style() { return tt("Balanced & Warm") }, value: "'Lato', sans-serif" },
  { name: "Open Sans", category: "sans", get style() { return tt("Web Standard") }, value: "'Open Sans', sans-serif" },
  { name: "Roboto", category: "sans", get style() { return tt("Modern & Versatile") }, value: "'Roboto', sans-serif" },
  { name: "Raleway", category: "sans", get style() { return tt("Elegant & Thin") }, value: "'Raleway', sans-serif" },
  { name: "Nunito", category: "sans", get style() { return tt("Soft & Rounded") }, value: "'Nunito', sans-serif" },
  { name: "Quicksand", category: "sans", get style() { return tt("Geometric & Friendly") }, value: "'Quicksand', sans-serif" },
  { name: "Comfortaa", category: "sans", get style() { return tt("Round & Geometric") }, value: "'Comfortaa', cursive" },
  { name: "DM Sans", category: "sans", get style() { return tt("Modern & Clean") }, value: "'DM Sans', sans-serif" },
  { name: "Space Grotesk", category: "sans", get style() { return tt("Geometric Modern") }, value: "'Space Grotesk', sans-serif" },
  { name: "Sora", category: "sans", get style() { return tt("Contemporary Clean") }, value: "'Sora', sans-serif" },
  { name: "Playfair Display", category: "serif", get style() { return tt("Elegant & Editorial") }, value: "'Playfair Display', serif" },
  { name: "Merriweather", category: "serif", get style() { return tt("Traditional & Warm") }, value: "'Merriweather', serif" },
  { name: "Lora", category: "serif", get style() { return tt("Classic & Readable") }, value: "'Lora', serif" },
  { name: "Crimson Text", category: "serif", get style() { return tt("Old Style & Elegant") }, value: "'Crimson Text', serif" },
  { name: "Source Serif Pro", category: "serif", get style() { return tt("Transitional Serif") }, value: "'Source Serif Pro', serif" },
  { name: "Oswald", category: "display", get style() { return tt("Strong & Narrow") }, value: "'Oswald', sans-serif" },
  { name: "Archivo Black", category: "display", get style() { return tt("Bold & Impact") }, value: "'Archivo Black', sans-serif" },
  { name: "Barlow Condensed", category: "display", get style() { return tt("Modern Condensed") }, value: "'Barlow Condensed', sans-serif" },
  { name: "Dancing Script", category: "script", get style() { return tt("Elegant Script") }, value: "'Dancing Script', cursive" },
  { name: "Caveat", category: "script", get style() { return tt("Natural Handwriting") }, value: "'Caveat', cursive" },
  /* Round 13: ten more (lib/onepage/fonts.ts ONEPAGE_FONTS), the website builder's too. */
  { name: "Geist", category: "sans", get style() { return tt("Crisp & Minimal") }, value: "'Geist', sans-serif" },
  { name: "Manrope", category: "sans", get style() { return tt("Modern & Open") }, value: "'Manrope', sans-serif" },
  { name: "Figtree", category: "sans", get style() { return tt("Friendly & Clear") }, value: "'Figtree', sans-serif" },
  { name: "Fredoka", category: "sans", get style() { return tt("Round & Playful") }, value: "'Fredoka', sans-serif" },
  { name: "Bricolage Grotesque", category: "sans", get style() { return tt("Bold & Playful") }, value: "'Bricolage Grotesque', sans-serif" },
  { name: "Fraunces", category: "serif", get style() { return tt("Soft & Warm") }, value: "'Fraunces', serif" },
  { name: "Newsreader", category: "serif", get style() { return tt("Editorial & Calm") }, value: "'Newsreader', serif" },
  { name: "Bodoni Moda", category: "serif", get style() { return tt("Fashion & Sharp") }, value: "'Bodoni Moda', serif" },
  /* Renaissance's book face (components/onepage/themes/renaissance-theme). */
  { name: "EB Garamond", category: "serif", get style() { return tt("Classic & Readable") }, value: "'EB Garamond', serif" },
  { name: "Big Shoulders", category: "display", get style() { return tt("Tall & Condensed") }, value: "'Big Shoulders', sans-serif" },
  { name: "Geist Mono", category: "mono", get style() { return tt("Code & Tech") }, value: "'Geist Mono', monospace" },
]

// Display fonts for Title customization
const TITLE_FONTS = [
  { name: "Default (Same as body)", value: null },
  { name: "Playfair Display", value: "'Playfair Display', serif" },
  { name: "Bebas Neue", value: "'Bebas Neue', sans-serif" },
  { name: "Pacifico", value: "'Pacifico', cursive" },
  { name: "Oswald", value: "'Oswald', sans-serif" },
  { name: "Lobster", value: "'Lobster', cursive" },
  { name: "Dancing Script", value: "'Dancing Script', cursive" },
  { name: "Permanent Marker", value: "'Permanent Marker', cursive" },
  { name: "Bangers", value: "'Bangers', cursive" },
  { name: "Orbitron", value: "'Orbitron', sans-serif" },
  { name: "Anton", value: "'Anton', sans-serif" },
  { name: "Righteous", value: "'Righteous', cursive" },
  { name: "Alfa Slab One", value: "'Alfa Slab One', cursive" },
  { name: "Russo One", value: "'Russo One', sans-serif" },
  { name: "Pixelify Sans", value: "'Pixelify Sans', sans-serif" },
  { name: "Press Start 2P", value: "'Press Start 2P', monospace" },
  { name: "Abril Fatface", value: "'Abril Fatface', cursive" },
  { name: "Satisfy", value: "'Satisfy', cursive" },
  { name: "Archivo Black", value: "'Archivo Black', sans-serif" },
  { name: "Quicksand", value: "'Quicksand', sans-serif" },
  { name: "Comfortaa", value: "'Comfortaa', cursive" },
  { name: "Caveat", value: "'Caveat', cursive" },
  { name: "Barlow Condensed", value: "'Barlow Condensed', sans-serif" },
  { name: "DM Sans", value: "'DM Sans', sans-serif" },
  { name: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { name: "Sora", value: "'Sora', sans-serif" },
  { name: "Fraunces", value: "'Fraunces', serif" },
  { name: "Newsreader", value: "'Newsreader', serif" },
  { name: "Bodoni Moda", value: "'Bodoni Moda', serif" },
  { name: "Cormorant Garamond", value: "'Cormorant Garamond', serif" },
  { name: "Bricolage Grotesque", value: "'Bricolage Grotesque', sans-serif" },
  { name: "Big Shoulders", value: "'Big Shoulders', sans-serif" },
  { name: "Geist", value: "'Geist', sans-serif" },
  { name: "Manrope", value: "'Manrope', sans-serif" },
  { name: "Figtree", value: "'Figtree', sans-serif" },
  { name: "Fredoka", value: "'Fredoka', sans-serif" },
  { name: "Geist Mono", value: "'Geist Mono', monospace" },
  /* Round W10: popular display faces for a name (lib/onepage/fonts ONEPAGE_FONTS). */
  { name: "Syne", value: "'Syne', sans-serif" },
  { name: "Unbounded", value: "'Unbounded', sans-serif" },
  { name: "DM Serif Display", value: "'DM Serif Display', serif" },
  { name: "Instrument Serif", value: "'Instrument Serif', serif" },
  { name: "Shrikhand", value: "'Shrikhand', cursive" },
  { name: "Great Vibes", value: "'Great Vibes', cursive" },
  { name: "Yellowtail", value: "'Yellowtail', cursive" },
  { name: "Rubik Mono One", value: "'Rubik Mono One', sans-serif" },
]

/* Every name in the two lists above, drawn in its own face: one small request cut to the letters of the names (lib/onepage/fonts). */
const FONT_SAMPLE_HREF = onePageFontSampleHref([...FONTS.map((f) => f.name), ...TITLE_FONTS.map((f) => f.name)])

const FONT_CATEGORIES = [
  { id: "all", get label() { return tt("All Fonts") } },
  { id: "sans", get label() { return tt("Sans Serif") } },
  { id: "serif", get label() { return tt("Serif") } },
  { id: "display", get label() { return tt("Display") } },
  { id: "script", get label() { return tt("Script") } },
  { id: "mono", get label() { return tt("Mono") } },
]

const SOCIAL_STYLES = [
  { id: "filled", get label() { return tt("Solid") } },
  { id: "outline", get label() { return tt("Outline") } },
  { id: "minimal", get label() { return tt("Glass") } },
]

/*
  THE THEMES. Each one a different kind of page, not the same page in
  another colour. Light: Default, Air, Studio, Paper (warm paper, a serif
  title, hairline cards), Cream, Riso and Blocks (a bold block of colour with
  hard shadows). Gradient: Sunset (a deep dusk), Peach, Sage (muted sage to
  moss, deep green buttons), Ocean and Aurora. Dark: Olive, Astrid, Night,
  Graphite (graphite with soft glass cards), Midnight, Space and Neon (the
  one loud one). Image: Nature and Fusion (a warm grain). Round 11 added
  five made pieces, each with its own pattern or photograph, type and
  buttons: Terrazzo (light), Blueprint (dark), Darkroom and Haze (image);
  the note above each says what it is and where its photo comes from.
  Editorial was the fifth; the owner asked for it to go, and a page
  that wore it drawn as Paper (lib/onepage/retired-themes). No violet: Blocks
  was a violet to pink gradient, Aurora violet glass, Night a violet black
  with lilac buttons and Fusion a violet swirl; each is now its own thing
  under the same name, so a page that chose one keeps the id it saved. What
  a page has saved is its own copy of the settings and is not touched. Every
  theme's bio and text read at 4.5:1 or more on what is behind them
  (scripts/check-onepage-themes.mjs). Only settings the editor already has,
  so each can be changed piece by piece.

  ROUND AR: A DIFFERENT STRUCTURE EACH, NOT A RECOLOUR. Seventeen of these
  were the same page (a classic header, centred, a list of rounded buttons)
  in another colour. Each now also sets how its page is built, with the
  settings round 40 and 42 gave themes (lib/onepage/theme-layout), so no two
  of the catalogue share a structure (tests/onepage-ar5.test.ts):
    a Hero (the photo full bleed)  Sunset, Aurora (with Midnight, Neon, Cobalt)
    a cover picture                Night, Ocean (with Folio)
    links as tiles two to a row    Studio, Riso, Blocks, Fusion, Neon
    links as picture cards         Paper, Sage, Space, Nature
    links Mixed (halves)           Terrazzo, Peach, Graphite
    links Compact                  Astrid, Blueprint, Aurora
    flush left, an index           Olive, Haze
    products as tiles or rows      Studio, Terrazzo, Riso, Blocks, Space, Nature;
                                   Sunset, Sage, Olive, Paper, Blueprint
    Air keeps the plain list, with large buttons and room to breathe.
  Their colours are as they were. lib/onepage/theme-apply resets all of it on
  the next pick; a Hero a theme set is taken back by a Classic theme.
*/
const BASE_THEME_TEMPLATES = [
  {
    id: "default",
    name: "Default",
    category: "light",
    isDefault: true,
    theme_config: {
      background_type: "solid" as const,
      background_color: "#ffffff",
      background_gradient: "",
      background_image_url: "",
      text_color: "#000000",
      secondary_text_color: "#000000",
      button_color: "#000000",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#000000",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#000000",
      social_icon_color: "#000000",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      background_pattern: "none",
      laser_glow_enabled: false,
    },
    profile_layout: "classic" as const,
    skipLayoutDialog: true,
    // Default theme uses white share/subscribe button styles
    share_style: "white",
    subscribe_style: "white",
    // Default theme with light background - use dark button text for outline/glass styles
    light_button_text_color: "#000000",
  },
  {
    id: "air",
    name: "Air",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#eef0f3",
      background_gradient: "",
      background_image_url: "",
      text_color: "#111827",
      secondary_text_color: "#5b6170",
      button_color: "#ffffff",
      button_text_color: "#111827",
      button_style: "filled" as const,
      button_border_radius: 14,
      button_border_width: 0,
      button_border_color: "#e5e7eb",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'DM Sans', sans-serif",
      title_color: "#111827",
      social_icon_color: "#374151",
      spacing: "comfortable" as const,
      card_width: "standard" as const,
      laser_glow_enabled: false, /* Round AS: a ring is the creator's to turn on (Header), never a theme's: Air drew a white glow round every photo. */
      laser_glow_color: "#dbdbdb",
      laser_glow_intensity: "medium",
      button_size: "large",
    },
    // White cards on a cool grey: dark text for outline and glass buttons
    light_button_text_color: "#111827",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "studio",
    name: "Studio",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f6f3ee",
      background_gradient: "",
      background_image_url: "",
      text_color: "#1c1917",
      secondary_text_color: "#6b645c",
      button_color: "#ffffff",
      button_text_color: "#1c1917",
      button_style: "filled" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#1c1917",
      button_shadow: "hard",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#1c1917",
      social_icon_color: "#1c1917",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      background_pattern: "none",
      laser_glow_enabled: false,
      block_layout: "grid",
      header_align: "left",
      product_layout: "grid",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1c1917",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "paper",
    name: "Paper",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f3eee4",
      background_gradient: "",
      background_image_url: "",
      text_color: "#23201b",
      secondary_text_color: "#5e574c",
      button_color: "#fbf8f2",
      button_text_color: "#23201b",
      button_style: "filled" as const,
      button_border_radius: 6,
      button_border_width: 1,
      button_border_color: "#ddd5c6",
      button_shadow: "none",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Source Serif Pro', serif",
      title_color: "#23201b",
      social_icon_color: "#23201b",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "paper",
      pattern_color: "#8a7a5c40",
      pattern_opacity: "low",
      block_layout: "cards",
      header_align: "left",
      product_layout: "rows",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#23201b",
    solid_button_text_color: "#23201b",
    outline_button_text_color: "#23201b",
    glass_button_text_color: "#23201b",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "cream",
    name: "Cream",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#fffbeb",
      background_gradient: "",
      background_image_url: "",
      text_color: "#1c1917",
      secondary_text_color: "#6b645c",
      button_color: "#1c1917",
      button_text_color: "#363221",
      button_style: "outline" as const,
      button_border_radius: 24,
      button_border_width: 2,
      button_border_color: "#363221",
      button_shadow: "none",
      font_family: "'Lora', serif",
      title_font: "'Playfair Display', serif",
      title_color: "#362f2b",
      social_icon_color: "#78716c",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      /* Round W10: Zigzag is gone; Cream is a soft butter gingham. */
      background_pattern: "gingham",
      pattern_color: "#d8c87a90",
      pattern_opacity: "low",
    },
    profile_layout: "classic" as const,
    // Cream theme uses black share/subscribe button styles
    share_style: "black",
    subscribe_style: "black",
    // Button text colors for different styles
    outline_button_text_color: "#363221",
    solid_button_text_color: "#fffcf0",
    glass_button_text_color: "#37342a",
  },
  {
    id: "riso",
    name: "Riso",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f3efe6",
      background_gradient: "",
      background_image_url: "",
      text_color: "#2340c7",
      secondary_text_color: "#3f51a6",
      button_color: "#2340c7",
      button_text_color: "#2340c7",
      button_style: "outline" as const,
      button_border_radius: 0,
      button_border_width: 2,
      button_border_color: "#2340c7",
      button_shadow: "none",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Bebas Neue', sans-serif",
      title_color: "#2340c7",
      social_icon_color: "#2340c7",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "dots",
      pattern_color: "#2340c750",
      pattern_opacity: "low",
      block_layout: "grid",
      product_layout: "grid",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#2340c7",
    outline_button_text_color: "#2340c7",
    solid_button_text_color: "#f3efe6",
    glass_button_text_color: "#2340c7",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "blocks",
    name: "Blocks",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#ffd23f",
      background_gradient: "",
      background_image_url: "",
      text_color: "#111111",
      secondary_text_color: "#3f3a24",
      button_color: "#ffffff",
      button_text_color: "#111111",
      button_style: "filled" as const,
      button_border_radius: 0,
      button_border_width: 2,
      button_border_color: "#111111",
      button_shadow: "hard",
      button_shadow_color: "#111111",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Archivo Black', sans-serif",
      title_color: "#111111",
      social_icon_color: "#111111",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: false,
      background_pattern: "grid",
      pattern_opacity: "low",
      pattern_color: "#11111140",
      block_layout: "grid",
      product_layout: "grid",
    },
    solid_button_text_color: "#111111",
    outline_button_text_color: "#111111",
    glass_button_text_color: "#111111",
    light_button_text_color: "#111111",
    share_style: "black",
    subscribe_style: "black",
  },
  /*
    TERRAZZO: a poured stone floor. A warm limestone ground set with
    terracotta chips of every size (the Terrazzo pattern), a round
    geometric title face, and buttons as smooth pale stone pills with a
    hairline edge and a soft shadow, as if laid on top of it.
  */
  {
    id: "terrazzo",
    name: "Terrazzo",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#efe8dd",
      background_gradient: "",
      background_image_url: "",
      text_color: "#2a231e",
      secondary_text_color: "#574b41",
      button_color: "#fbf8f3",
      button_text_color: "#2a231e",
      button_style: "filled" as const,
      button_border_radius: 28,
      button_border_width: 1,
      button_border_color: "#ddd2c3",
      button_shadow: "subtle",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Sora', sans-serif",
      title_color: "#2a231e",
      social_icon_color: "#a4533a",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "terrazzo",
      pattern_color: "#b8664a",
      pattern_opacity: "medium",
      block_layout: "masonry",
      product_layout: "grid",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#2a231e",
    outline_button_text_color: "#2a231e",
    glass_button_text_color: "#2a231e",
    light_button_text_color: "#2a231e",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#8f3b28",
      background_gradient: "linear-gradient(180deg, #9c472f 0%, #8f3b28 55%, #5e2617 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#ffeee4",
      button_color: "#fff8f2",
      button_text_color: "#8a3320",
      button_style: "filled" as const,
      button_border_radius: 16,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      button_shadow_color: "#7a2e1b",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      background_pattern: "grain",
      pattern_opacity: "low",
      pattern_color: "#ffffff90",
      header_layout: "hero",
      product_layout: "rows",
    },
    profile_layout: "hero" as const,
    share_style: "white",
    subscribe_style: "white",
    solid_button_text_color: "#8a3320",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
  },
  {
    id: "peach",
    name: "Peach",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#fb923c",
      background_gradient: "linear-gradient(160deg, #fed7aa 0%, #fdba74 40%, #fb7185 100%)",
      background_image_url: "",
      text_color: "#431407",
      secondary_text_color: "#5c210c",
      button_color: "rgba(255, 255, 255, 0.55)",
      button_text_color: "#431407",
      button_style: "glass" as const,
      button_border_radius: 24,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.7)",
      button_shadow: "subtle",
      font_family: "'Poppins', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#431407",
      social_icon_color: "#431407",
      spacing: "normal" as const,
      card_width: "standard" as const,
      block_layout: "masonry",
    },
    light_button_text_color: "#431407",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "sage",
    name: "Sage",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#b9c6ad",
      background_gradient: "linear-gradient(180deg, #c9d3bf 0%, #b9c6ad 55%, #a9b89c 100%)",
      background_image_url: "",
      text_color: "#1f2a1f",
      secondary_text_color: "#2e3d2b",
      button_color: "#2f4a32",
      button_text_color: "#f1f3ea",
      button_style: "filled" as const,
      button_border_radius: 24,
      button_border_width: 0,
      button_border_color: "#2f4a32",
      button_shadow: "subtle",
      button_shadow_color: "#1f2a1f",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Lora', serif",
      title_color: "#1f2a1f",
      social_icon_color: "#1f2a1f",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "cards",
      product_layout: "rows",
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1f2a1f",
    solid_button_text_color: "#f1f3ea",
    outline_button_text_color: "#1f2a1f",
    glass_button_text_color: "#1f2a1f",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0c4a6e",
      background_gradient: "linear-gradient(180deg, #082f49 0%, #0c4a6e 50%, #075985 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#cdeefe",
      button_color: "rgba(255, 255, 255, 0.15)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 24,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.2)",
      button_shadow: "subtle",
      font_family: "'Nunito', sans-serif",
      title_font: "'Nunito', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#bae6fd",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      // Ocean theme: waves pattern with low opacity
      background_pattern: "waves",
      pattern_opacity: "low",
      pattern_color: "#428ad790",
      cover_image_url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1600&q=80",
      button_size: "large",
    },
    // Ocean theme uses white share/subscribe button styles
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0b3a33",
      background_gradient: "linear-gradient(165deg, #04110f 0%, #0b3a33 50%, #17614f 100%)",
      background_image_url: "",
      text_color: "#ecfdf5",
      secondary_text_color: "#a7d7c5",
      button_color: "rgba(255, 255, 255, 0.12)",
      button_text_color: "#ecfdf5",
      button_style: "glass" as const,
      button_border_radius: 16,
      button_border_width: 1,
      button_border_color: "rgba(236, 253, 245, 0.28)",
      button_shadow: "none",
      font_family: "'Sora', sans-serif",
      title_font: "'Sora', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a7f3d0",
      background_pattern: "none",
      spacing: "normal" as const,
      card_width: "standard" as const,
      animated_gradient: false,
      header_layout: "hero",
      block_layout: "compact",
    },
    profile_layout: "hero" as const,
  },
  {
    id: "olive",
    name: "Olive",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#2e3526",
      background_gradient: "",
      background_image_url: "",
      text_color: "#efe9d8",
      secondary_text_color: "#b9b39f",
      button_color: "#efe9d8",
      button_text_color: "#2e3526",
      button_style: "filled" as const,
      button_border_radius: 24,
      button_border_width: 0,
      button_border_color: "#efe9d8",
      button_shadow: "none",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Crimson Text', serif",
      title_color: "#efe9d8",
      social_icon_color: "#efe9d8",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "linen",
      pattern_color: "#efe9d830",
      pattern_opacity: "low",
      header_align: "left",
      button_text_align: "left",
      button_icon_position: "right",
      product_layout: "rows",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#2e3526",
    outline_button_text_color: "#efe9d8",
    glass_button_text_color: "#efe9d8",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "astrid",
    name: "Astrid",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#0a0a0a",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "#27272a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "#3f3f46",
      button_shadow: "none",
      font_family: "'Inter', sans-serif",
      title_font: "'Montserrat', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a1a1aa",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: false,
      laser_glow_color: "#303030",
      laser_glow_intensity: "medium",
      block_layout: "compact",
      button_size: "compact",
      header_align: "left",
    },
    // Astrid theme uses glassmorphism for share/subscribe icons
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "night",
    name: "Night",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#0d1117",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f3efe6",
      secondary_text_color: "#9aa3ad",
      button_color: "#161b22",
      button_text_color: "#f3efe6",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "#2b333d",
      button_shadow: "none",
      font_family: "'Inter', sans-serif",
      title_font: "'Source Serif Pro', serif",
      title_color: "#f3efe6",
      social_icon_color: "#c9c4b8",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: false,
      laser_glow_color: "#2b3542",
      laser_glow_intensity: "medium",
      cover_image_url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1600&q=80",
    },
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "graphite",
    name: "Graphite",
    category: "dark",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#1b1d21",
      background_gradient: "linear-gradient(180deg, #2b2e33 0%, #1b1d21 45%, #121315 100%)",
      background_image_url: "",
      text_color: "#f2f2f0",
      secondary_text_color: "#b3b7bd",
      button_color: "rgba(255, 255, 255, 0.15)",
      button_text_color: "#f2f2f0",
      button_style: "glass" as const,
      button_border_radius: 18,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.14)",
      button_shadow: "none",
      font_family: "'Inter', sans-serif",
      title_font: "'DM Sans', sans-serif",
      title_color: "#f2f2f0",
      social_icon_color: "#d4d6d9",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "grain",
      pattern_color: "#ffffff90",
      pattern_opacity: "low",
      block_layout: "masonry",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "midnight",
    name: "Midnight",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#020617",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f8fafc",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#182b49",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Oswald', sans-serif",
      title_color: "#f8fafc",
      social_icon_color: "#3b82f6",
      spacing: "normal" as const,
      card_width: "standard" as const,
      // Midnight theme: hero layout, laser glow off, zoom button animation
      header_layout: "hero",
      laser_glow_enabled: false,
      button_hover_animation: "zoom",
      // Midnight only allows stars pattern - stars enabled by default with white color
      allowed_patterns: ["none", "stars"],
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "medium",
    },
    profile_layout: "hero" as const,
    // Midnight theme uses glassmorphism for share/subscribe buttons
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "space",
    name: "Space",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#000000",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.2)",
      button_shadow: "none",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "high",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      block_layout: "cards",
      product_layout: "grid",
    },
    profile_layout: "classic" as const,
    // Space theme uses black share/subscribe button styles
    share_style: "black",
    subscribe_style: "black",
  },
  {
    id: "neon",
    name: "Neon",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#09090b",
      background_gradient: "",
      background_image_url: "",
      text_color: "#fafafa",
      secondary_text_color: "#a1a1aa",
      button_color: "#18181b",
      button_text_color: "#22d3ee",
      button_style: "glass" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#22d3ee",
      button_shadow: "strong",
      button_shadow_color: "#ffffff",
      font_family: "'JetBrains Mono', monospace",
      title_font: "'Orbitron', sans-serif",
      title_color: "#22d3ee",
      social_icon_color: "#22d3ee",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "hero",
      background_pattern: "none",
      block_layout: "grid",
    },
    profile_layout: "hero" as const,
    // Neon theme uses glassmorphism for share/subscribe buttons
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  /*
    BLUEPRINT: a drawing on drafting paper. Deep blueprint blue with its
    grid (fine lines every 10px, firm ones every 50px, a cross where they
    meet: the Blueprint pattern), the name in a mono face, and buttons
    drawn as outlines with a pale blue offset under them, as a draughtsman
    would shade a box.
  */
  {
    id: "blueprint",
    name: "Blueprint",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#123b66",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f3f8fd",
      secondary_text_color: "#cfe0f1",
      button_color: "#f3f8fd",
      button_text_color: "#f3f8fd",
      button_style: "outline" as const,
      button_border_radius: 0,
      button_border_width: 2,
      button_border_color: "#f3f8fd",
      button_shadow: "hard",
      button_shadow_color: "#5f93c9",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'JetBrains Mono', monospace",
      title_color: "#ffffff",
      social_icon_color: "#f3f8fd",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "blueprint",
      pattern_color: "#ffffff38",
      pattern_opacity: "medium",
      block_layout: "compact",
      header_align: "left",
      button_size: "compact",
      product_layout: "rows",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#123b66",
    outline_button_text_color: "#f3f8fd",
    glass_button_text_color: "#f3f8fd",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "nature",
    name: "Nature",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#1a2e1a",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=95",
      text_color: "#ffffff",
      secondary_text_color: "#d1fae5",
      button_color: "rgba(255, 255, 255, 0.9)",
      button_text_color: "#065f46",
      button_style: "filled" as const,
      button_border_radius: 24,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      font_family: "'Nunito', sans-serif",
      title_font: "'Lora', serif",
      title_color: "#ffffff",
      social_icon_color: "#d1fae5",
      spacing: "normal" as const,
      card_width: "standard" as const,
      // Wallpaper settings: 32% brightness (white words read on the bright fog at the top) and 30% noise strength
      image_brightness: 32,
      image_noise: true,
      noise_strength: 30,
      block_layout: "cards",
      product_layout: "grid",
    },
  },
  {
    id: "fusion",
    name: "Fusion",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#1a1814",
      background_gradient: "",
      /* The warm grain, not the violet and orange swirl it was: no violet (see the note above the list). */
      background_image_url: "https://storelib.com/media/platform%20images/wallpapers%20blocks/510e061be1f3d8c7a56a9cff56c8ae24.jpg",
      text_color: "#ffffff",
      secondary_text_color: "#e5e7eb",
      button_color: "#ffffff",
      button_text_color: "#111113",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      // Wallpaper settings: 36% brightness (white words read on its lightest part, grain and all) and 40% noise strength
      image_brightness: 36,
      image_noise: true,
      noise_strength: 40,
      block_layout: "grid",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    // Fusion theme uses glassmorphism for share/subscribe buttons
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  /*
    DARKROOM: a silver print. A black and white photograph of a peak in
    cloud, printed down dark, with film grain over it; a tall condensed
    title, plain words, and buttons as thin white frames. One drop of
    safelight red, in the social icons.
    Photo: Unsplash photo-1505765050516-f72dcac9c60e, desaturated by
    Unsplash's own image service (sat=-100). Unsplash License: free for
    commercial use, no permission or credit needed
    (https://unsplash.com/license).
  */
  {
    id: "darkroom",
    name: "Darkroom",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#161616",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80&sat=-100",
      text_color: "#f4f2ee",
      secondary_text_color: "#dedad3",
      button_color: "#f4f2ee",
      button_text_color: "#f4f2ee",
      button_style: "outline" as const,
      button_border_radius: 2,
      button_border_width: 1,
      button_border_color: "#f4f2ee",
      button_shadow: "none",
      font_family: "'DM Sans', sans-serif",
      title_font: "'Barlow Condensed', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ff6b5e",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      // Printed down to 26% (white words read on the white cloud; the grain's overlay lifts the light parts) with a fine grain
      image_brightness: 26,
      image_noise: true,
      noise_strength: 30,
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#161616",
    outline_button_text_color: "#f4f2ee",
    glass_button_text_color: "#f4f2ee",
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  /*
    HAZE: a photograph seen out of focus. The sky over a range of hills at
    dusk, cropped to the sky and the farthest ridges and softened, so the
    page is warm light fading into blue haze; dark words in a fine serif
    and frosted glass pills.
    Photo: Unsplash photo-1500534314209-a25ddb2bd429, cropped and blurred
    by Unsplash's own image service (rect, blur). Unsplash License: free
    for commercial use, no permission or credit needed
    (https://unsplash.com/license).
  */
  {
    id: "haze",
    name: "Haze",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#e9dccd",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?rect=0,0,3456,3000&w=1920&q=80&blur=25",
      text_color: "#1d2124",
      secondary_text_color: "#2f3539",
      button_color: "#ffffff",
      button_text_color: "#1d2124",
      button_style: "glass" as const,
      button_border_radius: 28,
      button_border_width: 1,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      font_family: "'Raleway', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#1d2124",
      social_icon_color: "#1d2124",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      image_brightness: 108,
      image_noise: false,
      header_align: "left",
      button_text_align: "left",
      button_icon_position: "right",
    },
    profile_layout: "classic" as const,
    solid_button_text_color: "#1d2124",
    outline_button_text_color: "#1d2124",
    glass_button_text_color: "#1d2124",
    light_button_text_color: "#1d2124",
    share_style: "white",
    subscribe_style: "white",
  },
]

/* Round 40: Gallery, Swiss, Ember, Lagoon and Atlas (components/onepage/themes/r40-themes), each laid into its kind. */
/* Renaissance (components/onepage/themes/renaissance-theme), and the picker's order: the best and most chosen first, in groups (components/onepage/themes/theme-order). */
export const THEME_TEMPLATES = orderThemes(withR40Themes([...BASE_THEME_TEMPLATES, ...(RENAISSANCE_THEMES as unknown as typeof BASE_THEME_TEMPLATES)]))

/** The gradient a page starts from when it has none of its own: warm, and nothing like the old violet default. */
const DEFAULT_GRADIENT = "linear-gradient(160deg, #f0a8b8 0%, #b2846c 100%)"

/**
 * A pattern's tile at a little over half its size (the big drawn ones at a
 * third), for a square the size of a thumb: the page's own tile
 * (lib/onepage/wallpaper) is sized for a whole page, and at full size a
 * square shows one corner of the big ones.
 */
function previewSize(id: string, color: string, level: string): string | undefined {
  const s = patternStyle(id, color, level)
  if (!s) return undefined
  /* The big drawn tiles (contours, organic, morph, flow) go down further than the small repeats, or a square is one curve. */
  return String(s.backgroundSize).replace(/(\d+(?:\.\d+)?)px/g, (_, n) => {
    const px = Number(n)
    return `${Math.round(px * (px >= 120 ? 0.36 : 0.6) * 10) / 10}px`
  })
}

const SECTION_LABEL: Record<DesignSection, string> = {
  get theme() { return tt("Theme") },
  /* Round 40: how the blocks sit, their spacing, the header's alignment, Share and Subscribe (components/onepage/themes/layout-section). */
  get layout() { return tt("Layout") },
  get header() { return tt("Header") },
  get wallpaper() { return tt("Wallpaper") },
  get text() { return tt("Text") },
  get buttons() { return tt("Buttons") },
  get socials() { return tt("Social icons") },
  get footer() { return tt("Footer") },
}

/**
 * ===========================================================================
 *  THE DESIGN TAB: A LIST, THEN ONE PANEL AT A TIME
 * ===========================================================================
 * It was a rail of seven unlabelled icons on a computer and a strip of
 * chips that ran off the side of a phone, with every section's controls
 * stacked under a small heading. Now it opens on a list, as Linktree's does:
 * each row names a part of the page and says in grey what it is set to now
 * (the font's name, "Gradient, with grain"), so the page can be read before
 * anything is opened. A row opens its panel, which has a way back (the
 * app's square with a hairline and a foot, editor-kit's PanelHeader) and
 * its name in large type, and the panel scrolls to its top.
 *
 * The open panel is kept for this visit in sessionStorage, so switching to
 * Links and back returns to it; a new visit opens on the list.
 */
/**
 * ===========================================================================
 *  A PANEL COMES UP OVER THE LIST, AND GOES BACK DOWN OFF IT
 * ===========================================================================
 * Round 11, the owner: "When I go to Theme, Header, Wallpaper, Text, Button,
 * Social icons, Footer, make sure it's more smooth and clean. I don't like
 * the fade." Before that (round 9): "NO SLIDE like."
 *
 * It was a crossfade: the list out over 90ms, the panel in from 50ms to
 * 200ms, so for a few frames the two pages' words were faintly on the glass
 * together. Now it is the app's own sub-page, the one an order opens with
 * (app/app/orders/order-motion.ts) and every page layer in /app moves on
 * (components/app/page-layer.tsx), on the same numbers:
 *
 *   PHONE     the panel rises from the bottom of the column, whole, as one
 *             layer over the list, which holds still underneath it, exactly
 *             where it was (LAYER_MOTION_MS, the iOS sheet curve, with the
 *             page layer's soft top edge); back drops it down again
 *             (LAYER_LEAVE_MS) off the list, still where it was left. Nothing
 *             moves sideways and nothing fades: every frame is one whole page
 *             over another whole page.
 *   COMPUTER  where nothing slides in from an edge, the panel is there on the
 *             first frame, its title included, and only what is under the
 *             title lands as Storelib's pills' content does (lib/ui/
 *             pill-switch, from CONTENT_IN_FROM over CONTENT_IN_MS, never from
 *             nothing); back shows the list at once, whole, where it was
 *             (the order's `settle: false`).
 *
 * Transform and opacity only, on the compositor; a back pressed half way
 * starts from where the panel is on screen, never from an end. The way back
 * is the arrow at the top of the panel (and Android's back).
 *
 * Both pages are drawn only while the panel moves. At rest the list is kept
 * (its state, not its pixels: `display: none`).
 *
 * ONE MOTION PER PRESS. "Themes, back, Themes again, back: a double
 * refresh." It was two motions (scripts/check-onepage-editor-nav.mjs): the
 * page came in with only its title, and 40 to 70ms later what was in it
 * was built and faded in over 180ms, so every open arrived twice, and the
 * first one showed a page with nothing in it for four frames. Now the
 * panels are kept, as the editor keeps its tabs: each is built once, while
 * the page is idle (or on the tap, if that comes first), and kept in
 * React's <Activity> while another panel or the list is showing. A press
 * shows the one it opens and starts the fade with the page already whole:
 * one motion in, one out, nothing built on the way.
 */
type DesignPage = DesignSection | "home"
/* React 19.2's <Activity>, as the editor's tabs use it. The installed types are 19.0's, which do not name it yet; the runtime has it. */
const Activity = (ReactModule as unknown as {
  Activity: React.ComponentType<{ mode: "visible" | "hidden"; children?: React.ReactNode }>
}).Activity
/** Every panel, in the order the list names them, which is the order they are built in while the page is idle. */
const DESIGN_SECTIONS = Object.keys(SECTION_LABEL) as DesignSection[]
/** On a phone the panel moves as the app's page layer does: up in LAYER_MOTION_MS, down in LAYER_LEAVE_MS, on its curve. */
const PUSH_MS = LAYER_MOTION_MS
const POP_MS = LAYER_LEAVE_MS
const MOVE_EASE = LAYER_MOTION_EASE
/** The page layer's soft top edge while it moves (app/app/orders/order-motion EDGE_SHADOW), so it reads as a layer over the list. */
const EDGE_SHADOW = "0 -10px 30px -12px rgba(17, 24, 39, 0.22)"

/**
 * `top` places the page leaving where it was on screen, under the page
 * arriving. `panelMin` and `listMin` are how tall each must be to reach the
 * bottom of the screen while they fade, so the page arriving, which is
 * opaque, always covers the page leaving and a short page never leaves the
 * other showing below it.
 *
 * THE PAGE LEAVING IS CUT AT THE BOTTOM OF THE SCREEN. It is that tall and
 * no taller (its height, not its least height, and `overflow: clip`), so
 * a long page leaving (Theme, back to the list) never makes the column
 * taller than the page arriving needs: the column's scrollbar came in for
 * the move and went again at its end ("a scrollbar flash"), and where a
 * scrollbar takes room, the column went narrower and wider with it.
 */
type Move = { from: DesignPage; to: DesignPage; top: number; panelMin: number; listMin: number; phone: boolean }

export function DesignTab({ userPlan }: { userPlan?: "free" | "growth" | "pro" | null }) {
  const { onepage } = useOnePage()
  const [section, setSectionState] = useState<DesignSection | null>(() => {
    try {
      const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("onepage-design-section") : null
      return saved && saved in SECTION_LABEL ? (saved as DesignSection) : null
    } catch {
      return null
    }
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef(section)
  /* Where the list was scrolled to when a panel covered it. */
  const listScroll = useRef(0)
  /* The pages fading now: `top` places the one leaving where it was on screen. */
  const [move, setMove] = useState<Move | null>(null)
  /* The panels built so far, kept (see BUILT WHILE NOTHING ELSE IS HAPPENING below). */
  const [built, setBuilt] = useState<DesignSection[]>(() => (section ? [section] : []))
  const scrollerOf = () => rootRef.current?.closest<HTMLElement>("[data-scroll-container]") ?? null
  /* The theme cards' photos, fetched and decoded while the creator is still on this list (see preloadThemeThumbs). */
  useEffect(() => preloadThemeThumbs(), [])

  const remember = (next: DesignSection | null) => {
    try {
      if (next) window.sessionStorage.setItem("onepage-design-section", next)
      else window.sessionStorage.removeItem("onepage-design-section")
    } catch {
      /* A private window: the panel is simply not remembered. */
    }
  }

  const setSection = useCallback((next: DesignSection | null) => {
    const current = sectionRef.current
    if (current === next) return
    const scroller = rootRef.current?.closest<HTMLElement>("[data-scroll-container]")
    const y = scroller?.scrollTop ?? 0
    if (!current) listScroll.current = y
    /* The page arriving starts at its top (a panel) or where it was left (the list). */
    const arriveAt = next ? 0 : listScroll.current
    sectionRef.current = next
    const screen = scroller?.clientHeight ?? 0
    const phone = !!window.matchMedia?.(LAYER_PHONE).matches
    setMove({ from: current ?? "home", to: next ?? "home", top: arriveAt - y, panelMin: screen + (next ? 0 : y), listMin: screen + listScroll.current, phone })
    setSectionState(next)
    setWarm(null)
    /* A panel not built yet (a tap before the page was idle) is built on the tap, whole, and the fade waits for it. */
    if (next) setBuilt((b) => (b.includes(next) ? b : [...b, next]))
    remember(next)
  }, [])

  /*
    READIED WHILE THE FINGER IS DOWN. A kept panel still has to be styled
    and laid out when it is shown (Theme: 150ms on a phone slowed four
    times, 40ms at full speed), and the fade cannot start before that. A
    finger rests on a row for 50 to 150ms before it lifts, so the row's
    panel is drawn then, out of sight and taking no room, at a priority the
    lift overtakes. By the lift it is laid out and only has to fade in. A
    finger that scrolls instead lets it go.
  */
  const [warm, setWarm] = useState<DesignSection | null>(null)
  const onRowDown = (e: React.PointerEvent<HTMLElement>) => {
    if (sectionRef.current || animating.current.length) return
    const id = (e.target as Element).closest("[data-nav-row]")?.getAttribute("data-nav-row")
    if (!id || !(id in SECTION_LABEL)) return
    const next = id as DesignSection
    startTransition(() => {
      setWarm(next)
      setBuilt((b) => (b.includes(next) ? b : [...b, next]))
    })
  }
  const onRowCancel = () => {
    if (!sectionRef.current) startTransition(() => setWarm(null))
  }

  /*
    BUILT WHILE NOTHING ELSE IS HAPPENING, AND KEPT. Theme's eighteen cards
    cost 200ms to build on a phone slowed four times; built on the tap, the
    move waited for them, and built after it, the page arrived empty and
    filled in (the double). So, as the editor does with its tabs, the
    panels are built once the Design tab is on screen and the page is idle,
    at a priority any tap overtakes, and each is kept once built.
  */
  useEffect(() => {
    const build = () => startTransition(() => setBuilt((b) => (DESIGN_SECTIONS.every((s) => b.includes(s)) ? b : [...b, ...DESIGN_SECTIONS.filter((s) => !b.includes(s))])))
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(build, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(build, 800)
    return () => window.clearTimeout(t)
  }, [])

  /*
    ANDROID'S BACK IS THIS PAGE'S BACK. With a panel open the stack is
    marked (data-native-back), and components/app/native-back-handler hands
    the press here instead of offering to leave the app: the same pop as
    the way back at the top of the panel, to the same place in the list.
  */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onBack = () => setSection(null)
    root.addEventListener(NATIVE_BACK_EVENT, onBack)
    return () => root.removeEventListener(NATIVE_BACK_EVENT, onBack)
  }, [setSection])

  /*
    The move itself, started before the browser paints its first frame.

    THE LAST FRAME IS HELD UNTIL REACT HAS DRAWN THE PAGE AT REST. The drop
    holds its last frame (`fill: forwards`) and is let go in the layout
    effect of the commit that ends the move, before that commit is painted,
    so the panel never shows again for a frame between the end of the drop
    and React hiding it.
  */
  const animating = useRef<Animation[]>([])
  /* The landing of a panel's content on a computer: its own, so the end of the move does not cancel it. */
  const landing = useRef<Animation | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!move) {
      animating.current.forEach((a) => a.cancel())
      animating.current = []
      if (root) root.style.overflowY = ""
      const panel = panelRef.current
      if (panel) {
        panel.style.boxShadow = ""
        panel.style.willChange = ""
      }
      return
    }
    const scroller = scrollerOf()
    if (scroller) scroller.scrollTop = move.to === "home" ? listScroll.current : 0
    const list = listRef.current
    const panel = panelRef.current
    let anims: Animation[] = []
    const done = () => {
      if (animating.current !== anims) return
      setMove((m) => (m === move ? null : m))
    }
    if (!list || !panel || !root || typeof panel.animate !== "function" || reducedMotion()) {
      animating.current.forEach((a) => a.cancel())
      animating.current = anims
      done()
      return
    }
    const push = move.to !== "home"
    if (!move.phone) {
      /* A computer: the panel is there whole, only its content lands; back is the list at once. */
      animating.current.forEach((a) => a.cancel())
      animating.current = anims
      landing.current?.cancel()
      landing.current = null
      const body = push ? panel.querySelector<HTMLElement>(`[data-panel-body="${move.to}"]`) : null
      if (body) landing.current = body.animate([{ opacity: CONTENT_IN_FROM }, { opacity: 1 }], { duration: CONTENT_IN_MS, easing: CONTENT_IN_EASE })
      done()
      return
    }
    /* A phone: the panel rises over the list, or drops off it; the list never moves. From where the panel is now, if a move is still running. */
    const height = scroller?.clientHeight || window.innerHeight || 1
    const running = animating.current.length > 0
    const at = running ? new DOMMatrixReadOnly(getComputedStyle(panel).transform === "none" ? undefined : getComputedStyle(panel).transform).m42 : push ? height : 0
    animating.current.forEach((a) => a.cancel())
    const to = push ? 0 : height
    const ms = Math.max(120, Math.round((push ? PUSH_MS : POP_MS) * Math.min(1, Math.abs(to - at) / height)))
    /* The column cuts the panel at its foot while it is below it: nothing of it shows under the list or scrolls the column. */
    root.style.overflowY = "clip"
    panel.style.willChange = "transform"
    panel.style.boxShadow = EDGE_SHADOW
    anims = [panel.animate([{ transform: `translate3d(0, ${at}px, 0)` }, { transform: `translate3d(0, ${to}px, 0)` }], { duration: ms, easing: MOVE_EASE, fill: push ? "backwards" : "forwards" })]
    animating.current = anims
    /* Held where it starts until the screen keeps up with it: a panel shown for the first time is drawn in this same frame (page-layer startWhenFramesFlow). */
    if (push) startWhenFramesFlow(anims)
    anims[0].onfinish = done
    const timer = window.setTimeout(done, ms + 600)
    return () => window.clearTimeout(timer)
  }, [move])

  if (!onepage) return null
  const { theme, settings } = onepage
  const t = theme as any
  const templateName = THEME_TEMPLATES.find((x) => x.id === theme.template_id)?.name
  const bodyFont = FONTS.find((f) => familyOf(f.value) === familyOf(theme.font_family))?.name || familyOf(theme.font_family) || "Inter"
  const titleFont = t.title_font ? familyOf(t.title_font) : null
  const patternName = isPatternId(t.background_pattern) && (theme.background_type === "solid" || theme.background_type === "gradient") ? WALLPAPER_PATTERNS.find((x) => x.id === canonicalPatternId(t.background_pattern))?.name.toLowerCase() : null
  const wallpaperSummary =
    theme.background_type === "gradient" ? tt("Gradient{value}", { value: patternName ? `, ${patternName}` : t.gradient_noise ? tt(", with grain") : "" }) :
    theme.background_type === "image" ? (theme.background_image_url ? tt("Image") : tt("Image, none chosen yet")) :
    theme.background_type === "video" ? tt("Video") :
    tt("Fill, {value}{value2}", { value: (normalizeHex(theme.background_color) || theme.background_color || "").toUpperCase(), value2: patternName ? `, ${patternName}` : "" })
  const layoutName = { list: tt("List"), grid: tt("Grid"), cards: tt("Cards"), compact: tt("Compact"), masonry: tt("Mixed tiles") }[blockLayoutOf(t)]
  const layoutSummary = blockLayoutOf(t) === "compact" ? layoutName : tt("{layout}, {spacing} spacing", { layout: layoutName, spacing: blockSpacingOf(t) === "compact" ? tt("tight") : blockSpacingOf(t) === "comfortable" ? tt("roomy") : tt("normal") })
  const swatch = (bg: string) => <span aria-hidden className="h-7 w-7 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" style={{ background: bg }} />

  /* Which panel is drawn: the one open, or the one on its way out. */
  const shownSection: DesignSection | null = section ?? (move && move.from !== "home" ? move.from : null)
  /* And, out of sight, the one a finger is resting on. */
  const drawnSection: DesignSection | null = shownSection ?? warm
  const listCurrent = !section
  const listMoving = !!move && (move.from === "home" || move.to === "home")
  const panelMoving = !!move
  /* The page leaving sits where it was on screen, under; the page arriving is in the flow, over it. */
  const leavingStyle = (top: number): React.CSSProperties => ({ position: "absolute", left: 0, right: 0, top, zIndex: 0 })
  /* On a phone the panel going back is the layer: it drops over the list, which is in place under it. */
  const droppingStyle = (top: number): React.CSSProperties => ({ ...leavingStyle(top), zIndex: 2 })
  /*
    EACH PAGE IS THE COLUMN, AND ONLY THE COLUMN'S EDGE CUTS IT. The pages
    were the 576px of the editor's reading width (max-w-xl) inside a 630px
    column, so a page moving out was still drawn in the 27px either side of
    it: the list's words cut at the column's left edge, Theme's cards at its
    right, and the column itself could be scrolled sideways by the page
    standing off to the right. The editor gives this tab the whole column,
    padding and all (onepage-editor, the tab boxes); each page is the
    column wide and from its top to its bottom, with the reading width and
    the padding inside it, and the stack cuts sideways (`overflow-x: clip`,
    which is not a scroll box, so nothing inside can scroll it) at the
    column's edges. The pages fade in place now and never stand off to a
    side, but the clip stays: nothing inside can widen the column.
  */
  const pageClass = "bg-white"
  const readingClass = "mx-auto w-full max-w-xl p-4 op-tabbar-clearance md:p-6 md:pb-6"

  return (
    <div ref={rootRef} className="relative isolate" style={{ overflowX: "clip" }} data-design-stack="" data-native-back={section ? "" : undefined}>
      <div
        ref={listRef}
        data-design-panel="home"
        aria-hidden={listCurrent ? undefined : true}
        inert={!listCurrent}
        className={pageClass}
        style={
          listCurrent
            ? /* Arriving (back), it is in place, at once, and reaches the bottom of the screen under the panel dropping off it. */
              { position: "relative", zIndex: move ? 1 : 0, minHeight: move ? move.listMin : undefined }
            : listMoving
              ? { ...leavingStyle(move!.top), height: move!.listMin, overflow: "clip" }
              : { display: "none" }
        }
      >
        {FONT_SAMPLE_HREF ? <link rel="stylesheet" href={FONT_SAMPLE_HREF} /> : null}
        <div className={readingClass}>
          <PanelHeader title={tt("Design")} />
          <nav aria-label={tt("Design")} className="flex flex-col" onPointerDown={onRowDown} onPointerCancel={onRowCancel}>
            <NavRow dataKey="theme" icon={Layers} title={tt("Theme")} subtitle={templateName || tt("Your own")} onClick={() => setSection("theme")} />
            <NavRow dataKey="layout" icon={LayoutGrid} title={tt("Layout")} subtitle={layoutSummary} onClick={() => setSection("layout")} />
            <NavRow dataKey="header" icon={CircleUserRound} title={tt("Header")} subtitle={tt("{value} layout, {value2}", { value: (t.header_layout || "classic") === "hero" ? tt("Hero") : tt("Classic"), value2: t.title_style === "logo" ? tt("logo title") : tt("text title") })} onClick={() => setSection("header")} />
            <NavRow
              dataKey="wallpaper"
              icon={PaintBucket}
              title={tt("Wallpaper")}
              subtitle={wallpaperSummary}
              trailing={theme.background_type === "solid" || theme.background_type === "gradient" ? swatch(theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color) : null}
              onClick={() => setSection("wallpaper")}
            />
            <NavRow
              dataKey="text"
              icon={Type}
              title={tt("Text")}
              subtitle={<span style={{ fontFamily: fontStack(theme.font_family) }}>{titleFont && titleFont !== bodyFont ? tt("{bodyFont}, titles in {titleFont}", { bodyFont, titleFont }) : bodyFont}</span>}
              onClick={() => setSection("text")}
            />
            <NavRow dataKey="buttons" icon={RectangleHorizontal} title={tt("Buttons")} subtitle={(() => { const fill = theme.button_style === "filled" ? tt("Solid") : theme.button_style === "soft" ? tt("Soft") : theme.button_style === "outline" ? tt("Outline") : tt("Glass"); const shape = buttonShape(theme.button_border_radius); return shape === "rounded" ? tt("{value}, {value2}px corners", { value: fill, value2: theme.button_border_radius ?? 8 }) : tt("{value}, {value2}", { value: fill, value2: shape === "pill" ? tt("Pill") : tt("Square") }) })()} trailing={swatch(theme.button_color)} onClick={() => setSection("buttons")} />
            <NavRow dataKey="socials" icon={AtSign} title={tt("Social icons")} subtitle={SOCIAL_STYLES.find((x) => x.id === (t.social_icon_style || "filled"))?.label || tt("Solid")} onClick={() => setSection("socials")} />
            <NavRow dataKey="footer" icon={PanelBottom} title={tt("Footer")} subtitle={settings.show_branding === false ? tt("Storelib badge hidden") : tt("Storelib badge shown")} onClick={() => setSection("footer")} />
          </nav>
        </div>
      </div>
      {/*
        The panel page: one element for every panel, always there, so what
        fades is the page itself and never a page being made. With no panel
        open it is not drawn. Its panels are kept in <Activity>: the one
        showing is visible, the rest keep their state out of sight.
      */}
      <div
        ref={panelRef}
        data-design-panel={shownSection ?? undefined}
        inert={!shownSection || section !== shownSection}
        aria-hidden={shownSection ? undefined : true}
        /* The same white as the list; on a phone, while it moves, the page layer's soft top edge (EDGE_SHADOW). */
        className={pageClass}
        style={
          shownSection
            ? {
                ...(section === shownSection
                  ? /* Arriving, it is over the list and covers it to the bottom of the screen, however short it is. */
                    { position: "relative", minHeight: panelMoving ? move?.panelMin : undefined, zIndex: 1 }
                  : /* Leaving (back), on a phone it drops off the list, over it; on a computer it is already gone. */
                    { ...(move?.phone ? droppingStyle(move.top) : leavingStyle(move ? move.top : 0)), height: move?.panelMin, overflow: "clip" }),
              }
            : drawnSection
              ? /* Readied under a finger: laid out, but unseen, untouchable, and taking no room from the list's scroll. */
                { position: "absolute", left: 0, right: 0, top: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none", zIndex: -1 }
              : { display: "none" }
        }
      >
        {section && section === shownSection ? <StickyPanelBack panelRef={panelRef} section={section} title={SECTION_LABEL[section]} onBack={() => setSection(null)} /> : null}
        <div className={readingClass}>
          {drawnSection ? <PanelHeader title={SECTION_LABEL[drawnSection]} onBack={() => setSection(null)} backLabel={tt("Back to Design")} /> : null}
          {DESIGN_SECTIONS.filter((id) => built.includes(id)).map((id) => (
            <Activity key={id} mode={id === drawnSection ? "visible" : "hidden"}>
              <div data-panel-body={id}>
                {id === "header" && <HeaderSection />}
                {id === "theme" && <ThemeSection />}
                {id === "layout" && <LayoutSection />}
                {id === "wallpaper" && <WallpaperSection />}
                {id === "text" && <TextSection />}
                {id === "buttons" && <ButtonsSection />}
                {id === "socials" && <SocialsSection />}
                {id === "footer" && <FooterSection userPlan={userPlan} />}
              </div>
            </Activity>
          ))}
        </div>
      </div>
    </div>
  )
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/*
  ===========================================================================
   THE WAY BACK STAYS IN REACH (round AL)
  ===========================================================================
  "I click on wallpaper and then I scroll down, but then I have to scroll up
  again to find the back button." Once the panel's own header (the back
  tile and the panel's name) has scrolled up out of the column, a slim bar
  with the same way back and the name settles at the top of the column. It
  fades and slides 8px into place over 180ms, and goes the same way when the
  header comes back into view; with reduced motion it simply appears.

  It is a zero height sticky slot at the top of the panel, so it takes no
  room and moves nothing under it. Whether to show it is one
  IntersectionObserver on the panel's header against the editor's scroll
  box, never a scroll listener.

  ROUND AT, THE OWNER: on a phone "it glitches and stutters" while a panel
  scrolls. The slot was 0px tall with the bar hung out of it (absolute), and
  the bar slid 8px as well as fading: each time it came or went mid scroll,
  iOS made the bar a layer of its own for the slide, placed from the main
  thread a frame behind the scroll, and dropped it again after, so it
  jumped. Now the sticky box is the bar's own height (56px, given back with a
  -56px margin, so it still takes no room), it is its own layer for good
  (will-change), nothing in it is a blur, and a change is opacity only, which
  the compositor draws with the scroll. scripts/check-onepage-at2.mjs scrolls
  a panel at 390 and counts frames over 25ms and the bar's height.
*/
function StickyPanelBack({ panelRef, section, title, onBack }: { panelRef: React.RefObject<HTMLDivElement | null>; section: DesignSection; title: string; onBack: () => void }) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    setStuck(false)
    const panel = panelRef.current
    const header = panel?.querySelector<HTMLElement>(":scope > div > [data-panel-header]")
    if (!panel || !header || typeof IntersectionObserver !== "function") return
    const scroller = panel.closest<HTMLElement>("[data-scroll-container]")
    const io = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? 0
        setStuck(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1)
      },
      { root: scroller, threshold: 0 },
    )
    io.observe(header)
    return () => io.disconnect()
  }, [panelRef, section])
  return (
    <div data-sticky-back-slot="" className="pointer-events-none sticky top-0 z-20 -mb-14 h-14 will-change-transform">
      <div
        data-sticky-back={stuck ? "shown" : "hidden"}
        aria-hidden={stuck ? undefined : true}
        inert={!stuck}
        className="h-14 border-b border-[#eef0f2] bg-white transition-opacity duration-[180ms] ease-out will-change-[opacity] motion-reduce:transition-none"
        style={{ opacity: stuck ? 1 : 0, pointerEvents: stuck ? "auto" : "none" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2.5 px-4 md:px-6">
          <button
            type="button"
            onClick={onBack}
            aria-label={tt("Back to Design")}
            data-sticky-back-button=""
            className="-ml-1 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-[10px] outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]"
          >
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-[9px] border border-[#d9dbe0] bg-white text-[#1a1a2e] shadow-[inset_0_-2px_0_rgba(0,0,0,0.07),0_1px_2px_rgba(15,23,42,0.08)] transition-colors duration-[120ms] [@media(hover:hover)]:hover:bg-[#f7f7f8] active:bg-[#f1f2f4]">
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
          </button>
          <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#1a1a2e]">{title}</span>
        </div>
      </div>
    </div>
  )
}

/*
  ROUND W10: HOW THE NAME IS WRITTEN. "Add more styles so it can be
  customised to how I want my name to be written, and creative fonts." The
  name's face, then its style, each a square of the page's own wallpaper with
  the name's first letters drawn exactly as the page will draw them
  (lib/onepage/name-style), so the colours a style picks from the theme are
  the ones seen here. "Theme" is what the page drew before: the theme's own
  treatment, a skin's included. A chosen style replaces a skin's.
*/
function NameStyleRows() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const theme = onepage.theme as unknown as Record<string, unknown>
  const current = nameStyleOf(theme)
  const titleFont = (theme.title_font as string | null) || null
  const family = fontStack(titleFont || (theme.font_family as string))
  const wall = theme.background_type === "gradient" && typeof theme.background_gradient === "string" && theme.background_gradient ? theme.background_gradient : theme.background_type === "solid" ? (theme.background_color as string) : nameColours(theme).dark ? "#1b1b1f" : "#f4f4f5"
  const sample = (onepage.title || "").trim().slice(0, 2) || tt("Aa")
  const sampleHref = onePageFontHref(familyOf(titleFont || (theme.font_family as string)), sample)
  const tile = (id: NameStyle | null, label: string) => (
    <ChoiceCard key={id ?? "theme"} selected={current === id} onClick={() => updateTheme({ name_style: id } as never)} label={label} className="p-1.5">
      <span data-name-style-choice={id ?? "theme"} className="relative grid h-14 place-items-center overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" style={{ background: wall }}>
        <span className="text-[22px] font-bold leading-none" style={{ fontFamily: family, color: (theme.title_color as string) || (theme.text_color as string) }}>
          {id ? <span style={nameStyleCss(id, theme) as React.CSSProperties}>{sample}</span> : sample}
        </span>
      </span>
    </ChoiceCard>
  )
  return (
    <div className="mt-5 space-y-4" data-name-style-rows="">
      {FONT_SAMPLE_HREF ? <link rel="stylesheet" href={FONT_SAMPLE_HREF} /> : null}
      {/* The face first: the same list as Text, so the creative display faces are one tap from the name. */}
      <FontPicker
        label={tt("Name font")}
        value={titleFont}
        fonts={TITLE_FONTS.map((f) => ({ ...f, name: f.value ? f.name : "Same as page font" }))}
        sampleFamily={theme.font_family as string}
        defaultLabel={tt("Same as page font")}
        onPick={(v) => updateTheme({ title_font: v } as never)}
      />
      {/* The squares' letters in the name's face: one tiny request cut to those letters. */}
      {sampleHref ? <link rel="stylesheet" href={sampleHref} /> : null}
      <div>
        <p className="mb-2 text-[15px] font-medium text-[#1a1a2e]">{tt("Name style")}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {tile(null, tt("Theme"))}
          {NAME_STYLES.map((n) => tile(n.id, nameStyleLabel(n.id)))}
        </div>
      </div>
    </div>
  )
}

/** The name styles' names, in the creator's language. */
function nameStyleLabel(id: NameStyle): string {
  switch (id) {
    case "outline": return tt("Outline")
    case "retro": return tt("Retro shadow")
    case "gradient": return tt("Gradient")
    case "marker": return tt("Highlighter")
    case "chrome": return tt("Chrome")
    case "neon": return tt("Neon")
    case "sticker": return tt("Sticker")
    case "swash": return tt("Swash")
    case "spaced": return tt("Spaced caps")
    case "label": return tt("Label")
  }
}

function HeaderSection() {
  const { onepage, updateProfile, updateTheme } = useOnePage()
  /* A team member edits the store's page; the photo is the owner's account photo, theirs to change (lib/onepage/team-context). */
  const team = useOnePageTeam()
  /* Its questions and pickers are the shared sheet on a phone (components/ui/sheet-dialog). */
  const sheetPhone = usePhone()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  /* What the croppers show and upload (components/onepage/crop-upload.tsx). */
  const [tempImage, setTempImage] = useState<{ url: string; blob: Blob } | null>(null)
  /* Why a chosen file cannot be used, in the sheet it was chosen from. */
  const [pickError, setPickError] = useState<string | null>(null)

  // Video selection states
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showVideoCropModal, setShowVideoCropModal] = useState(false)
  const [tempVideo, setTempVideo] = useState<{ url: string; file: File | null; existing?: string } | null>(null)
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Logo upload/crop states
  const [showLogoUploadModal, setShowLogoUploadModal] = useState(false)
  const [showLogoCropModal, setShowLogoCropModal] = useState(false)
  const [tempLogo, setTempLogo] = useState<{ url: string; blob: Blob } | null>(null)
  const logoFileInputRef = useRef<HTMLInputElement>(null)

  // Pattern/Hero conflict dialog state
  const [showPatternHeroConflict, setShowPatternHeroConflict] = useState(false)

  /* "Your files" for the photo, the video or the logo: the chooser lives outside the sheets, which unmount what they hold when they close. */
  const [library, setLibrary] = useState<null | "avatar" | "video" | "logo">(null)
  /* Kept while the chooser slides away, so its list does not switch under it. */
  const libraryKind = useRef<"image" | "video">("image")
  if (library) libraryKind.current = library === "video" ? "video" : "image"

  if (!onepage) return null

  const { theme } = onepage
  const headerLayout = (theme as any).header_layout || "classic"
  const effectiveLayout = headerLayout
  const avatarVideoUrl = (onepage as any).avatar_video_url
  /* The crop (and its first frame) is kept in settings (lib/onepage/context updateProfile); read there, not off the page row. */
  const avatarVideoCrop = (onepage.settings as any)?.avatar_video_crop ?? (onepage as any).avatar_video_crop ?? null

  /* A picture chosen for a cropper: checked, made drawable (a HEIC becomes a JPEG), or the reason in plain words. */
  const pickImage = async (file: File | undefined, then: (img: { url: string; blob: Blob }) => void) => {
    if (!file) return
    setPickError(null)
    try {
      then(await openableImage(file))
    } catch (err) {
      setPickError(uploadMessage(err))
    }
  }

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    /* MP4, MOV, WebM or M4V up to 2 GB; it goes straight to storage in parts (lib/onepage/media-upload). */
    const verdict = checkMedia(file, "video")
    if (!verdict.ok) {
      setPickError(uploadErrorText(verdict.code ?? "type", "video"))
      return
    }
    setPickError(null)
    setTempVideo({ url: URL.createObjectURL(file), file })
    setShowVideoModal(false)
    setShowVideoCropModal(true)
  }

  const closeVideoCrop = () => {
    setShowVideoCropModal(false)
    if (tempVideo && !tempVideo.existing) URL.revokeObjectURL(tempVideo.url)
    setTempVideo(null)
  }

  /*
    REMOVE IS ONE STEP AND IT STICKS. It was two edits (the photo, then the
    video), so Undo brought half of it back, and the photo came straight
    back anyway: the page draws the account's photo (lib/account/identity),
    which only the page's own copy was cleared from. Now the account's photo
    is removed the way Settings removes it, and the page's photo, video and
    crop go in one edit, while the sheet closes at once.
  */
  const handleRemoveMedia = async () => {
    setPickError(null)
    const hadPhoto = !!onepage.avatar_url
    setShowEditModal(false)
    /* A team member removes the page's video only: the photo is the owner's account photo. */
    if (team) {
      updateProfile({ avatar_video_url: null, avatar_video_crop: null })
      return
    }
    if (hadPhoto) {
      try { await saveAccountPhoto(null) }
      catch (err) { setPickError(err instanceof Error ? err.message : tt("The photo was not removed. Try again in a moment.")); setShowEditModal(true); return }
    }
    updateProfile({ avatar_url: null, avatar_video_url: null, avatar_video_crop: null })
  }

  /* A picture from Files goes through the same cropper as one from the device; a video from Files is cropped where it is stored, not uploaded again. */
  const pickFromLibrary = async (url: string) => {
    const kind = library
    setPickError(null)
    if (kind === "video") {
      setTempVideo({ url, file: null, existing: url })
      setShowVideoCropModal(true)
      return
    }
    try {
      const img = await openableImage(await fileFromLibrary(url))
      if (kind === "logo") {
        setTempLogo(img)
        setShowLogoCropModal(true)
      } else {
        setTempImage(img)
        setShowCropModal(true)
      }
    } catch (err) {
      setPickError(uploadMessage(err))
      if (kind === "logo") setShowLogoUploadModal(true)
      else setShowUploadModal(true)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    void pickImage(file, (img) => {
      setTempImage(img)
      setShowUploadModal(false)
      setShowCropModal(true)
    })
  }

  const closeImageCrop = () => {
    setShowCropModal(false)
    if (tempImage) URL.revokeObjectURL(tempImage.url)
    setTempImage(null)
  }

  /*
    ONE PROFILE PHOTO, as the Links tab saves it: into the account's own
    avatars folder and through the route Settings uses, so the OnePage, the
    creator page and the app all show the same face (lib/account/avatar-save).
  */
  const saveProfilePhoto = async (url: string) => {
    if (team) throw new SaveError(photoIsOwners(team.store))
    /* The route's own reason reaches the sheet when it refuses (lib/onepage/photo-save). */
    await saveAccountPhoto(url)
    updateProfile({ avatar_url: url, avatar_video_url: null })
  }

  const handleLayoutChange = (layout: string) => {
    /* A pattern no longer stops Hero: the picture fades into the page through a mask, so the pattern shows under it (lib/onepage/poster-video HERO_FADE_MASK). */
    if (layout === "hero") {
      updateTheme({ header_layout: layout, laser_glow_enabled: false } as any)
      return
    }
    updateTheme({ header_layout: layout } as any)
  }

  // Logo: any picture (a HEIC is made a JPEG first), then the free cropper.
  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    void pickImage(file, (img) => {
      setTempLogo(img)
      setShowLogoUploadModal(false)
      setShowLogoCropModal(true)
    })
  }

  const closeLogoCrop = () => {
    setShowLogoCropModal(false)
    if (tempLogo) URL.revokeObjectURL(tempLogo.url)
    setTempLogo(null)
  }

  const handleRemoveLogo = () => {
    updateTheme({ title_logo_url: null, title_style: 'text' } as any)
  }

  return (
    <div>
      <PanelSection>
        <SettingRow label={tt("Profile image")} description={avatarVideoUrl ? tt("A video, playing on a loop") : onepage.avatar_url ? tt("An image or GIF") : tt("Add a photo, a logo or a short video")}>
          {/* The picture itself is the button, with a pencil on its corner, as Linktree draws it. */}
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            aria-label={tt("Change profile image")}
            data-avatar-edit
            style={{ borderRadius: avatarRadius(theme as never) }}
            className="relative isolate aspect-square h-[88px] w-[88px] shrink-0 cursor-pointer rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] disabled:cursor-wait"
          >
            {/*
              A circle, as the page draws it and as the theme cards do. Its
              own stacking context (isolate) under the pencil: the video in it
              carried z-index 1, which painted it over the pencil, so the
              round button sat half hidden behind the picture.
            */}
            <span data-editor-avatar="" className="absolute inset-0 overflow-hidden rounded-full isolate z-0 bg-[#f1f2f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" style={{ borderRadius: avatarRadius(theme as never) }}>
          {avatarVideoUrl ? (
                /* The same element the page draws, from the video's own first frame (components/onepage/poster-video). */
                <PosterVideo
                  src={avatarVideoUrl}
                  poster={videoPoster(avatarVideoCrop)}
                  alt={onepage.title}
                  mediaStyle={croppedMediaStyle(avatarVideoCrop) as React.CSSProperties | undefined}
                  /* Round 42: a still here; the preview beside it is where the video plays, once. */
                  still
                />
              ) : onepage.avatar_url ? (
                <ProfileImage src={onePageImageSrc(onepage.avatar_url, 96)} name={onepage.title || ""} alt={onepage.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[28px] font-semibold text-[#6b7280] bg-[#f1f2f4]">{onepage.title?.trim() ? onepage.title.charAt(0) : <AvatarMark name="" size={72} />}</div>
              )}
            </span>
            <span aria-hidden data-avatar-pencil="" className="absolute bottom-0 right-0 z-[2] grid h-8 w-8 place-items-center rounded-full border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </span>
          </button>
        </SettingRow>
      </PanelSection>

      <SheetDialog
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        phone={sheetPhone}
        label={tt("Profile Image")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b">
            <SheetDialogTitle className="text-lg font-semibold text-center">{tt("Profile Image")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            {team ? (
              <p className="px-1 text-[13px] leading-snug text-[#6b7280]" data-team-photo-note="">{photoIsOwners(team.store)}</p>
            ) : (
            <button onClick={() => { setPickError(null); setShowEditModal(false); setShowUploadModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">{tt("Select image or GIF")}</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            )}
            <button onClick={() => { setPickError(null); setShowEditModal(false); setShowVideoModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center"><Video className="h-6 w-6 text-yellow-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">{tt("Select video")}</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            {(team ? avatarVideoUrl : onepage.avatar_url || avatarVideoUrl) && (
              <button onClick={handleRemoveMedia} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-4 w-4" /><span className="font-medium">{tt("Remove current media")}</span>
              </button>
            )}
            {pickError ? <p role="alert" className="text-[13px] leading-snug text-[#b42318]">{pickError}</p> : null}
          </div>
        </SheetDialog>

      {/* Video Selection Modal */}
      <SheetDialog
        open={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        phone={sheetPhone}
        label={tt("Profile Video")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Profile Video")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => videoFileInputRef.current?.click()} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Upload className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left">
                <p className="font-medium">{tt("Upload video")}</p>
                <p className="text-sm text-gray-500">{tt("MP4, MOV or WebM, up to 2 GB")}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <LibraryRow kind="video" onClick={() => { setPickError(null); setShowVideoModal(false); setLibrary("video") }} />
            {pickError ? <p role="alert" className="text-[13px] leading-snug text-[#b42318]">{pickError}</p> : null}
            <input ref={videoFileInputRef} type="file" accept={ONEPAGE_VIDEO_ACCEPT} onChange={handleVideoFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      {/* Video Crop Modal: a square of the video, drawn in the circle exactly as framed (croppedMediaStyle). */}
      <SheetDialog
        open={showVideoCropModal}
        onClose={closeVideoCrop}
        phone={sheetPhone}
        label={tt("Crop Video")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeVideoCrop(); setShowVideoModal(true) }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Video")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempVideo ? (
              <CropUpload
                kind="video"
                src={tempVideo.url}
                file={tempVideo.file ?? new Blob()}
                existingUrl={tempVideo.existing}
                aspect={1}
                shape="circle"
                prefix="avatar-video"
                onCancel={closeVideoCrop}
                onSaved={(result, crop) => {
                  updateProfile({ avatar_video_url: result.url, avatar_video_crop: crop, avatar_url: null })
                  closeVideoCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      <SheetDialog
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        phone={sheetPhone}
        label={tt("Upload media")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowUploadModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Upload media")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5">
            {/* Said "or drag-and-drop" with nothing listening for a drop; it does now. */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void pickImage(e.dataTransfer.files?.[0], (img) => {
                  setTempImage(img)
                  setShowUploadModal(false)
                  setShowCropModal(true)
                })
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl px-5 py-6 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            >
              <Upload className="h-7 w-7 text-gray-300 mb-2.5" />
              <p className="font-medium text-gray-600">{tt("Select file to upload,")}</p>
              <p className="font-medium text-gray-600">{tt("or drag-and-drop file")}</p>
              <p className="text-sm text-gray-400 mt-1.5">{tt("Please upload an image")}</p>
            </div>
            <LibraryRow className="mt-3" onClick={() => { setPickError(null); setShowUploadModal(false); setLibrary("avatar") }} />
            {pickError ? <p role="alert" className="mt-3 text-[13px] leading-snug text-[#b42318]">{pickError}</p> : null}
            <input ref={fileInputRef} type="file" accept={ONEPAGE_IMAGE_ACCEPT} onChange={handleFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      <SheetDialog
        open={showCropModal}
        onClose={closeImageCrop}
        phone={sheetPhone}
        label={tt("Crop Image")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeImageCrop(); setShowUploadModal(true) }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Image")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempImage ? (
              <CropUpload
                kind="image"
                src={tempImage.url}
                file={tempImage.blob}
                aspect={1}
                shape="circle"
                prefix="avatar"
                bucket="avatars"
                outputSize={800}
                onCancel={closeImageCrop}
                onSaved={async (result) => {
                  await saveProfilePhoto(result.url)
                  closeImageCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      {/* Logo Upload Modal */}
      <SheetDialog
        open={showLogoUploadModal}
        onClose={() => setShowLogoUploadModal(false)}
        phone={sheetPhone}
        label={tt("Upload Logo")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => setShowLogoUploadModal(false)} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Upload Logo")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5">
            <div
              onClick={() => logoFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void pickImage(e.dataTransfer.files?.[0], (img) => {
                  setTempLogo(img)
                  setShowLogoUploadModal(false)
                  setShowLogoCropModal(true)
                })
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl px-5 py-6 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            >
              <Upload className="h-7 w-7 text-gray-300 mb-2.5" />
              <p className="font-medium text-gray-600">{tt("Select logo to upload,")}</p>
              <p className="font-medium text-gray-600">{tt("or drag-and-drop file")}</p>
              <p className="text-sm text-gray-400 mt-1.5">{tt("PNG with transparent background recommended")}</p>
            </div>
            <LibraryRow className="mt-3" onClick={() => { setPickError(null); setShowLogoUploadModal(false); setLibrary("logo") }} />
            {pickError ? <p role="alert" className="mt-3 text-[13px] leading-snug text-[#b42318]">{pickError}</p> : null}
            <input ref={logoFileInputRef} type="file" accept={ONEPAGE_IMAGE_ACCEPT} onChange={handleLogoFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      {/* Logo Crop Modal: the shared cropper (components/onepage/crop-upload.tsx), any shape, kept as a PNG so a clear background stays clear. */}
      <SheetDialog
        open={showLogoCropModal}
        onClose={closeLogoCrop}
        phone={sheetPhone}
        label={tt("Crop Logo")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeLogoCrop(); setShowLogoUploadModal(true) }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Logo")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempLogo ? (
              <CropUpload
                kind="image"
                src={tempLogo.url}
                file={tempLogo.blob}
                aspect={null}
                prefix="logo"
                outputSize={600}
                outputType="image/png"
                help={tt("Drag to move. Drag a corner or an edge to resize.")}
                onCancel={closeLogoCrop}
                onSaved={(result) => {
                  updateTheme({ title_logo_url: result.url, title_style: 'logo' } as any)
                  closeLogoCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      {/* "Your files" for the photo, the video or the logo, outside the sheets it is asked for from (components/onepage/library-pick). */}
      <FilesLibraryChooser
        kind={libraryKind.current}
        open={library !== null}
        onClose={() => setLibrary(null)}
        onPick={(url) => void pickFromLibrary(url)}
      />

      <PanelSection>
        <SectionTitle title={tt("Profile image layout")} />
        {(() => {
          /*
            Hero puts the picture behind the top of the page, so it cannot sit
            on a gradient, a photo or a video wallpaper. A pattern is fine
            since round 40: the picture fades out through a mask, and the
            pattern carries on under it.
          */
          const heroBlockedBy: string | null = null
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceCard selected={effectiveLayout === "classic"} onClick={() => handleLayoutChange("classic")} label={tt("Classic")}>
                  <div className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[#f7f7f8]">
                    <span data-layout-avatar="" className="h-7 w-7 aspect-square shrink-0 rounded-full bg-[#d9dbe0]" />
                    <span className="h-1.5 w-12 rounded-full bg-[#d9dbe0]" />
                  </div>
                </ChoiceCard>
                <ChoiceCard selected={effectiveLayout === "hero"} onClick={() => handleLayoutChange("hero")} disabled={!!heroBlockedBy} label={tt("Hero")}>
                  <div className="relative flex h-[76px] flex-col items-center justify-end overflow-hidden rounded-xl bg-[#f7f7f8] pb-2.5">
                    <span className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#c9cbd1] to-[#f7f7f8]" />
                    <span className="relative h-1.5 w-12 rounded-full bg-[#d9dbe0]" />
                  </div>
                </ChoiceCard>
              </div>
              {heroBlockedBy ? (
                <p className="mt-3 text-[13.5px] text-[#6b7280]">
                  {tt("Hero is off while the page uses {heroBlockedBy}.", { heroBlockedBy })}{" "}
                  <button
                    type="button"
                    onClick={() => updateTheme({ background_type: "solid" })}
                    className="cursor-pointer font-medium text-[#1a1a2e] underline underline-offset-2"
                  >
                    {tt("Use a flat colour")}
                  </button>
                </p>
              ) : effectiveLayout === "hero" ? (
                <p className="mt-3 text-[13.5px] text-[#6b7280]">
                  {onepage.avatar_url || avatarVideoUrl
                    ? tt("Your picture fills the top of the page and fades into it.")
                    : tt("Add a profile image above and it fills the top of the page.")}
                </p>
              ) : null}
            </>
          )
        })()}
        {/* Round AL: the cover sits under the layout it belongs to, with "Your files" beside its upload (components/onepage/header-cover-editor). */}
        <div className="mt-5">
          <HeaderCoverEditor />
        </div>
      </PanelSection>

      {effectiveLayout !== "hero" ? <AvatarFrameSection /> : null}

      {effectiveLayout !== "hero" ? (
        <PanelSection>
          <SwitchRow
            label={tt("Glowing ring")}
            description={tt("A light that circles your profile image")}
            checked={(theme as any).laser_glow_enabled || false}
            onChange={(checked) => updateTheme({ laser_glow_enabled: checked } as any)}
          />
          {(theme as any).laser_glow_enabled ? (
            <div className="mt-4 space-y-4">
              <ColorRow
                label={tt("Glow colour")}
                value={(theme as any).laser_glow_color || "#3b82f6"}
                onChange={(color) => updateTheme({ laser_glow_color: color } as any)}
                suggestions={["#1a1a2e", "#3b82f6", "#b2846c", "#f59e0b", "#10b981", "#ffffff"]}
              />
              <Segmented
                label={tt("Glow strength")}
                value={((theme as any).laser_glow_intensity || "medium") as "low" | "medium" | "hard"}
                options={[{ id: "low", label: tt("Soft") }, { id: "medium", label: tt("Medium") }, { id: "hard", label: tt("Bright") }] as const}
                onChange={(id) => updateTheme({ laser_glow_intensity: id } as any)}
              />
            </div>
          ) : null}
        </PanelSection>
      ) : null}

      <PanelSection>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-[#1a1a2e]">{tt("Title")}</span>
            <input value={onepage.title} onChange={(e) => updateProfile({ title: e.target.value })} placeholder={tt("Your name")} maxLength={60} className={fieldInput} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-[#1a1a2e]">{tt("Bio")}</span>
            <span className="relative block">
              <textarea
                value={onepage.bio || ""}
                onChange={(e) => updateProfile({ bio: e.target.value.slice(0, 160) })}
                placeholder={tt("Add a short bio")}
                rows={3}
                maxLength={160}
                className={cn(fieldInput, "h-auto min-h-[104px] resize-none py-3 pb-7 leading-[1.45]")}
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3.5 text-[12.5px] tabular-nums text-[#6b7280]">{(onepage.bio || "").length}/160</span>
            </span>
          </label>
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Title style")} />
        <div className="grid grid-cols-2 gap-3">
          <ChoiceCard selected={((theme as any).title_style || "text") === "text"} onClick={() => updateTheme({ title_style: "text" } as any)} label={tt("Text")}>
            <div className="grid h-12 place-items-center text-[22px] font-medium text-[#1a1a2e]" style={{ fontFamily: fontStack((theme as any).title_font || theme.font_family) }}>{tt("Aa")}</div>
          </ChoiceCard>
          <ChoiceCard selected={(theme as any).title_style === "logo"} onClick={() => updateTheme({ title_style: "logo" } as any)} label={tt("Logo")}>
            <div className="grid h-12 place-items-center text-[#1a1a2e]"><ImageIcon className="h-6 w-6" strokeWidth={1.6} /></div>
          </ChoiceCard>
        </div>

        {(theme as any).title_style === "logo" ? (
          <div className="mt-5 space-y-4">
            {(theme as any).title_logo_url ? (
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#e3e4e8] bg-[repeating-conic-gradient(#eef0f2_0_90deg,#fff_90deg_180deg)_0_0/10px_10px]">
                  <img src={(theme as any).title_logo_url} alt={tt("Logo")} className="h-full w-full object-contain" />
                </div>
                <div className="flex flex-1 gap-2">
                  <button type="button" onClick={() => { setPickError(null); setShowLogoUploadModal(true) }} className={cn(secondaryDepth, "h-11 flex-1 rounded-xl text-[14px]")}>{tt("Change logo")}</button>
                  <button type="button" onClick={handleRemoveLogo} aria-label={tt("Remove logo")} className={cn(secondaryDepth, "h-11 w-11 rounded-xl text-[#b42318]")}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setPickError(null); setShowLogoUploadModal(true) }}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-6 text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]"
              >
                <Upload className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />
                <span className="text-[14px] font-medium">{tt("Upload a logo")}</span>
                <span className="text-[13px] text-[#6b7280]">{tt("A PNG with a clear background looks best")}</span>
              </button>
            )}
            <SettingRow label={tt("Logo position")}>
              <Segmented
                className="w-[220px]"
                label={tt("Logo position")}
                value={(theme as any).logo_position === "more_up" ? "more_up" : "default"}
                options={[{ id: "default", label: tt("Default") }, { id: "more_up", label: tt("Higher") }] as const}
                onChange={(id) => updateTheme({ logo_position: id } as any)}
              />
            </SettingRow>
          </div>
        ) : null}

        {(theme as any).title_style === "logo" ? null : <NameStyleRows />}

        {/* The words' size, weight and spacing are under Text (TitleTypeSection); a logo's size stays here, beside the logo. */}
        {(theme as any).title_style === "logo" ? (
          <SettingRow label={tt("Logo size")} className="mt-5">
            <Segmented
              className="w-[220px]"
              label={tt("Logo size")}
              value={(theme as any).title_size === "large" ? "large" : "default"}
              options={[{ id: "default", label: tt("Default") }, { id: "large", label: tt("Large") }] as const}
              onChange={(id) => updateTheme({ title_size: id } as any)}
            />
          </SettingRow>
        ) : null}
      </PanelSection>
    </div>
  )
}

/* The theme names, each drawn in its theme's title face: one request cut to the letters of the names, as the language spells them (round AP). */
/* Round AS: and the body faces, since each card sets the creator's line, links and prices in them (./themes/preview-account). */
const THEME_NAME_FAMILIES = [...new Set(THEME_TEMPLATES.flatMap((t) => [familyOf(t.theme_config.title_font || t.theme_config.font_family), familyOf(t.theme_config.font_family)]).filter((f): f is string => !!f))]
/* The letters the cards' words use: the alphabet both ways, the accents the creators' names carry, figures and the price signs. */
const PREVIEW_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i, 97 + i)).join("") + "áéêíóú0123456789$€£&.,:'/ "
/* In capitals too (round W8): Gazette, Halo and Acid set their names in capitals, and a letter missing from the cut is drawn in another face. */
/* Round AT: and the creator's own words, which the cards draw now (a name with a letter outside the alphabet above). */
export const themeNameFontsHref = (own = "") => { const names = THEME_TEMPLATES.map((t) => themeLabel(t)).join(""); const extra = [...new Set(own.replace(/[A-Za-z0-9\s]/g, ""))].join(""); return onePageFontSampleHref(THEME_NAME_FAMILIES, names + names.toUpperCase() + PREVIEW_LETTERS + extra + extra.toUpperCase()) }

/**
 * A THEME, AS A SMALL PAGE. The cards were one grey skeleton in eighteen
 * colours: a circle, two bars and two buttons, so a serif paper theme and a
 * hard shadowed block of yellow looked like the same page. Each card now
 * draws the page the theme makes: its wallpaper and texture, its name in its
 * own title face and colour, and three buttons the way the live page draws
 * them (solid, outline or glass, its corners, its border, its shadow, hard
 * ones included), at the size of a card. A Hero theme has its picture band
 * across the top. Picked is the thin dark border and a small ink check.
 */
/*
  A PHOTO THEME'S CARD IS A SMALL COPY OF THE PHOTO, ON ITS OWN COLOUR. The
  card drew the page's own wallpaper file as a CSS background: Nature's is
  1920px at 95% quality (632KB) and was decoded again each time the card was
  made, so the card sat white until it was. Now it is an <img> of the
  optimizer's 384px copy, over the theme's own background colour, so before
  the photo is in the card already reads as the theme, never white.
*/
/* Round AP: a card now spreads the photo over a phone screen's height, as the page does, so it asks for the 640px copy. */
const THEME_THUMB_WIDTH = 320

/** A photo theme's card picture: the optimizer's 640px copy, the same address the card asks for. */
/* Round AS: a drawn SVG (Plaster's cover) is drawn as it is: the optimizer refuses SVG (lib/onepage/display-image). */
export const themeThumbSrc = (url: string) => (/\.svg(?:[?#]|$)/i.test(url) ? url : optimizedImageUrl(url, THEME_THUMB_WIDTH, 75))

/*
  EVERY CARD'S PHOTO IS IN AND DECODED BEFORE THE THEME PAGE IS OPENED. The
  Design tab asks for them as it opens (a handful of small files), decodes
  each, and keeps the decoded pictures referenced for as long as the editor
  is open, so a card shown by a pick of a kind is drawn with its photo in
  the same frame, never its bare colour first.
*/
/*
  AND LET GO WHEN THE DESIGN TAB GOES (round 12). The kept pictures were held
  by this module for the life of the page, so leaving the editor for /app
  kept them decoded. The tab's effect now gives them back when it is put
  away (hidden or gone); the next open asks for them again, from the cache.
*/
const keptThemeThumbs: HTMLImageElement[] = []
let themeThumbHolders = 0
export function preloadThemeThumbs(): () => void {
  if (typeof window === "undefined") return () => {}
  themeThumbHolders++
  let held = true
  const release = () => {
    if (!held) return
    held = false
    if (--themeThumbHolders > 0) return
    for (const img of keptThemeThumbs.splice(0)) img.src = ""
  }
  if (keptThemeThumbs.length) return release
  for (const t of THEME_TEMPLATES) {
    const c = t.theme_config as { background_type?: string; background_image_url?: string; cover_image_url?: string }
    /* The wallpaper photo, and (round AP) a theme's cover picture, which its card draws too. */
    const urls = [c.background_type === "image" ? c.background_image_url : null, coverImageOf(c)].filter((u): u is string => !!u)
    for (const url of urls) {
      const img = new Image()
      img.decoding = "async"
      img.src = themeThumbSrc(url)
      img.decode?.().catch(() => null)
      keptThemeThumbs.push(img)
    }
  }
  return release
}

/** How many theme pictures are held decoded now (tests/memory-r12.test.ts). */
export const keptThemeThumbCount = () => keptThemeThumbs.length

/*
  A kind's grid that is not the one picked: out of the flow, under the
  shown grid (the box holding the grids is its own stacking layer,
  `isolate`), not drawn (opacity 0), its inside skipped
  (content-visibility) and out of reach (inert). Nothing here is a
  property its inside inherits, so a pick works out the styles of two
  grids and not of every span in every card.
*/
const HIDDEN_GRID: React.CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, zIndex: -1, opacity: 0, contentVisibility: "hidden" }

const ThemeCard = memo(function ThemeCard({ template, who, selected, shown, copy, onPick }: { template: typeof THEME_TEMPLATES[number]; who: PreviewAccount; selected: boolean; shown: boolean; copy: boolean; onPick: (template: typeof THEME_TEMPLATES[number]) => void }) {
  const c = template.theme_config as typeof THEME_TEMPLATES[number]["theme_config"] & Record<string, any>
  const name = themeLabel(template)
  /* A Hero theme's card is drawn with its Hero, as picking it lays the page out (handleApplyTemplate). */
  const look = (template as any).profile_layout === "hero" ? { ...c, header_layout: "hero" } : c
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      aria-pressed={selected}
      aria-label={tt("{name} theme", { name })}
      /* All's card is the theme's card; the same theme in its own kind's grid is a copy of it. */
      data-theme-card={copy ? undefined : template.id}
      data-theme-copy={copy ? template.id : undefined}
      data-theme-shown={shown ? "" : undefined}
      className={cn(
        /* Round AT: nothing on a card is selected by a long press or a double click (the owner's blue Blocks card). */
        "group/theme relative flex cursor-pointer select-none flex-col rounded-2xl border bg-white p-1.5 text-left outline-none transition-[border-color] duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
        choiceOff,
      )}
    >
      <ChoiceMark on={selected} />
      {/*
        Round AP: the page itself, laid out at a phone's width with the live
        page's own numbers and scaled to the card as one picture
        (components/onepage/themes/theme-preview). Its own layer of layout and
        paint, so nothing inside it is worked out again for the rest of the grid.
      */}
      {/* op-demo: pointing at the card plays the theme's own hover on its buttons (app/globals.css). */}
      <span data-theme-frame="" className="op-demo relative block aspect-[5/7] overflow-hidden rounded-xl [contain:layout_paint]" style={{ background: c.background_color }}>
        <ThemePreview c={look} who={who} thumb={themeThumbSrc} />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" />
        <CheckMark on={selected} className="right-1.5 top-1.5" />
      </span>
      <span className={cn("block truncate px-1.5 pb-1 pt-2 text-[13px] font-medium transition-colors duration-[180ms]", selected ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{name}</span>
    </button>
  )
})

type ThemeFilter = "all" | "light" | "dark" | "gradient" | "image"
/* The names of All's groups (components/onepage/themes/theme-order). */
const THEME_GROUP_LABELS: Record<ThemeGroupId, () => string> = {
  clean: () => tt("Clean"),
  dark: () => tt("Dark"),
  colour: () => tt("Colour"),
  photo: () => tt("Photo"),
  styled: () => tt("Eras and styles"),
}
const THEME_KINDS: readonly { id: ThemeFilter; label: string }[] = [
  { id: "all", get label() { return tt("All") } },
  { id: "light", get label() { return tt("Light") } },
  { id: "dark", get label() { return tt("Dark") } },
  { id: "gradient", get label() { return tt("Gradient") } },
  { id: "image", get label() { return tt("Image") } },
]

/** The box that scrolls the Theme page: the editor's tab panel. */
function scrollBoxOf(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY
    if (y === "auto" || y === "scroll") return n
  }
  return null
}

/**
 * A PICK OF A KIND MOVES NOTHING BUT THE PICK. "When I click between the
 * pills... make sure they don't shift layout on click or glitch, because
 * they do." The pills never changed size; what moved them was the list
 * under them. All is every theme and Image a few, so a pick shortened the
 * page by a thousand pixels, the panel could no longer be scrolled as far
 * as it was, the browser pulled it back, and the pills (and everything else
 * on screen) jumped down by however far the page had been scrolled.
 *
 * Now, in the commit that draws the new kind and before it is painted, the
 * grid is held at least as tall as it takes for the panel to stay exactly
 * where it was (and no taller: at the top of the page nothing is held), and
 * the panel's scroll is put back. The hold is let go as the panel is
 * scrolled up past what it needs, so the space under a short kind shrinks
 * away rather than stay. scripts/check-onepage-tabbar.mjs measures every
 * pill and the row before and after each pick, and the layout shift.
 *
 * A PICK IS ONE STILL SWAP. "When I switch between All, Light, Dark,
 * Gradient, Image, the themes flash when I land on each category... no
 * flashes of the themes appearing, or in between the transition, or bump."
 * Round 10 slid every card that stayed from its old place to its new one
 * and faded the new ones up from 97%: on a phone that was most of the grid
 * moving and half of it fading at once, and the owner saw the movement
 * itself as the flash. Now nothing moves and nothing fades: the frame after
 * the press shows the new kind, whole, where the frame before showed the
 * old one, and the only motion on screen is the pill. Each kind has its
 * own grid, made once and kept, and a pick shows one and hides the rest,
 * so no card on screen ever changes place (no layout shift). Every photo is
 * decoded before it is ever shown (preloadThemeThumbs, from the moment the
 * Design tab opens) and drawn with decoding="sync", so a card is never
 * painted without its picture. scripts/check-onepage-themes.mjs samples
 * every frame of each pick, and films one, and fails on a card that is
 * blank, faded or between two places.
 */
function useSteadyFilter(filter: ThemeFilter, setFilter: (f: ThemeFilter) => void) {
  const gridRef = useRef<HTMLDivElement>(null)
  const pending = useRef<{ box: HTMLElement; top: number; rest: number } | null>(null)
  const held = useRef<{ box: HTMLElement; rest: number; natural: number; min: number } | null>(null)

  /* The kind's grid readied for a pick (see below), and the frames it waits. */
  const staged = useRef<{ el: HTMLElement; frame: number } | null>(null)
  const pickFilter = useCallback((f: ThemeFilter) => {
    const grid = gridRef.current
    const was = staged.current
    if (was) {
      cancelAnimationFrame(was.frame)
      staged.current = null
      if (!was.el.hasAttribute("data-theme-kind-shown")) was.el.style.contentVisibility = "hidden"
    }
    if (f === filter) return
    const box = grid ? scrollBoxOf(grid) : null
    /*
      At the top of the panel there is nothing to hold, and nothing is
      measured: a read of the page's height in the press makes the browser
      lay the editor out there and then. Scrolled down, everything in the
      panel but the grid is measured before the change (after it, a panel
      shorter than its box reports the box).
    */
    const top = box ? box.scrollTop : 0
    pending.current = box && grid && top > 0 ? { box, top, rest: box.scrollHeight - grid.offsetHeight } : null
    /*
      READIED FOR ONE FRAME, THEN SHOWN. A kind's grid out of sight has its
      inside skipped (content-visibility: hidden), so its cards keep the
      places they had when it was last drawn, and shown straight from that
      the browser takes them for cards that jumped from there (layout
      shift, 0.1 to 0.15 a pick on a phone). So the press first lets the
      grid be laid out and drawn where it is, still unseen (opacity 0), and
      the frame after, it is shown: a new set of cards in place, no shift.
    */
    const target = grid?.querySelector<HTMLElement>(`[data-theme-kind-grid="${f}"]`)
    if (!target || typeof requestAnimationFrame !== "function") {
      setFilter(f)
      return
    }
    target.style.contentVisibility = "visible"
    const next = { el: target, frame: 0 }
    next.frame = requestAnimationFrame(() => {
      next.frame = requestAnimationFrame(() => {
        if (staged.current !== next) return
        staged.current = null
        flushSync(() => setFilter(f))
      })
    })
    staged.current = next
  }, [filter, setFilter])

  useLayoutEffect(() => {
    const grid = gridRef.current
    const at = pending.current
    pending.current = null
    if (!grid) return
    if (!at) {
      /* From the top: whatever was held for an earlier pick is let go, the page as short as the kind. */
      if (held.current) { grid.style.minHeight = ""; held.current = null }
      return
    }
    grid.style.minHeight = ""
    const natural = grid.offsetHeight
    const rest = at.rest
    const need = Math.ceil(at.top + at.box.clientHeight - rest)
    if (need > natural) {
      grid.style.minHeight = `${need}px`
      held.current = { box: at.box, rest, natural, min: need }
    } else {
      held.current = null
    }
    if (at.box.scrollTop !== at.top) at.box.scrollTop = at.top
  }, [filter])

  /* Scrolled back up, the hold is needed less: it shrinks with the scroll, never under what is on screen. */
  useEffect(() => {
    const hold = held.current
    const grid = gridRef.current
    if (!hold || !grid) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const h = held.current
        if (!h) return
        const need = Math.ceil(h.box.scrollTop + h.box.clientHeight - h.rest)
        if (need >= h.min) return
        if (h.box.scrollTop <= 0 || need <= h.natural) {
          grid.style.minHeight = ""
          held.current = null
          h.box.removeEventListener("scroll", onScroll)
          return
        }
        h.min = need
        grid.style.minHeight = `${need}px`
      })
    }
    hold.box.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      hold.box.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [filter])

  return { gridRef, pickFilter }
}

function ThemeSection() {
  const { onepage, updateBlock, applyThemeLook } = useOnePage()
  const [filter, setFilter] = useState<ThemeFilter>("all")
  const { gridRef, pickFilter } = useSteadyFilter(filter, setFilter)
  /*
    Round AT: every card draws this creator's own page (./themes/preview-account): the name, the photo the
    editor shows (useShellAvatar, a new upload included), the socials, links, products and newsletter the page
    already holds. One object for the grid, the same one until something a card draws changes, so a card is
    drawn again only then (ThemeCard is memo).
  */
  const money = usePageMoney()
  const avatar = useShellAvatar(onepage?.avatar_url, onepage?.owner_id)
  const fresh = previewAccountOf(onepage ? { ...onepage, avatar_url: avatar } : null, (cents) => money(cents))
  const freshKey = previewAccountKey(fresh)
  const whoRef = useRef<{ key: string; who: PreviewAccount } | null>(null)
  if (!whoRef.current || whoRef.current.key !== freshKey) whoRef.current = { key: freshKey, who: fresh }
  const who = whoRef.current.who
  const nameFontsHref = themeNameFontsHref([who.name, who.bio, ...who.links.map((l) => l.label), ...who.products.flatMap((p) => [p.title, p.price, p.cta]), who.news.headline, who.news.desc, who.news.button].join(""))
  /*
    Round AP: every card draws the page at a phone's width, scaled to the
    card (components/onepage/themes/theme-preview). The cards of every kind
    are the same width, so one is measured, once and when the panel's width
    changes, and the scale is one number on the grid that every card reads.
  */
  useThemePreviewScale(gridRef, "[data-theme-kind-shown] [data-theme-frame]")
  const pickRef = useRef<(template: typeof THEME_TEMPLATES[0]) => void>(() => {})
  const onPick = useCallback((template: typeof THEME_TEMPLATES[0]) => pickRef.current(template), [])

  if (!onepage) return null
  const { theme, draft_blocks } = onepage
  const currentHeaderLayout = (theme as any).header_layout || "classic"

  const handleApplyTemplate = (template: typeof THEME_TEMPLATES[0]) => {
    const config = template.theme_config
    const templateLayout = (template as any).profile_layout

    // Template explicitly requests hero layout (like Midnight)
    const wantsHeroLayout = templateLayout === "hero" || (config as any).header_layout === "hero"
    /*
      Round AL: a Classic theme no longer takes a Hero away. The Hero's
      picture fades into the page through a mask (HERO_FADE_MASK), so a
      gradient, a photo, a video or a pattern simply carries on under the
      fade, and a creator who chose Hero keeps it. The theme's Classic still
      applies to a page that is Classic already.
    */
    /*
      Round AR: a Hero the last theme put there is that theme's, not the
      creator's, so a Classic theme takes it back (Sunset to Air was a Hero
      Air). One the creator chose on a Classic theme stays, as above.
    */
    const previous = THEME_TEMPLATES.find((t) => t.id === theme.template_id) as { profile_layout?: string; theme_config?: { header_layout?: string } } | undefined
    const heroFromTheme = previous?.profile_layout === "hero" || previous?.theme_config?.header_layout === "hero"
    const needsClassicLayout = !wantsHeroLayout && (templateLayout === "classic" || !templateLayout) && (currentHeaderLayout !== "hero" || heroFromTheme)

    /* The whole look in one step: nothing of the old theme left behind, Share
       and Subscribe matched, every block's own colours cleared (lib/onepage/theme-apply). */
    applyThemeLook(template as never, wantsHeroLayout ? "hero" : needsClassicLayout ? "classic" : undefined, (THEME_TEMPLATES.find((t) => t.id === theme.template_id) ?? null) as never)

    // AIR theme: Set swipe animation on the first link_button block if no blocks have animations
    if (template.id === "air" && draft_blocks) {
      // Check if any block already has an animation
      const hasAnimation = draft_blocks.some(b =>
        b.type === "link_button" && (b.data as any)?.animation_type && (b.data as any)?.animation_type !== "none"
      )

      if (!hasAnimation) {
        // Find the first link_button block and set swipe animation
        const firstLinkButton = draft_blocks.find(b => b.type === "link_button" && b.enabled)
        if (firstLinkButton) {
          updateBlock(firstLinkButton.id, {
            data: { ...((firstLinkButton.data || {}) as LinkButtonBlockData), animation_type: "swipe" }
          })
        }
      }
    }
  }

  /* One function for every card across renders, so a pick of a kind draws no card again but those that change (ThemeCard is memo). */
  pickRef.current = handleApplyTemplate

  return (
    <div>
      {/*
        The editor's one pill-tab row (components/onepage/pill-tabs), Storelib's
        own pills since round 11: the chosen kind's light fill fades in where
        it is, as Settings' pills across the app do. The pick goes through the
        steady filter above, so the page holds still under it.
      */}
      <PillTabs
        dataRow="theme-kinds"
        label={tt("Theme kind")}
        items={THEME_KINDS}
        value={filter}
        onChange={pickFilter}
        rowAttrs={{ "data-theme-filters": "" }}
        itemAttr="data-theme-filter"
        keepInView
        scroll={{ wrapClassName: "-mx-4 mb-5 md:mx-0" }}
        className="flex gap-2 px-4 pb-0.5 scrollbar-hide md:px-0"
        itemClassName="h-10 px-4 text-[13px] sm:h-9"
      />
      {nameFontsHref ? <link rel="stylesheet" href={nameFontsHref} /> : null}
      {/*
        A GRID FOR EACH KIND, ALL MADE ONCE AND KEPT. One grid that hid the
        cards of the other kinds moved every card that stayed to a new
        place (Nature is the 23rd card in All and the first in Image): the
        browser counted that as layout shift, 0.5 to 2 on a phone per pick,
        and the eye saw the cards jump. Now each kind has its own grid, its
        cards in their own places for good, and a pick shows one grid and
        hides the other: no card on screen ever changes place, it is a new
        set of cards in one frame. Every photo is decoded already (the same
        small files, preloadThemeThumbs). The box is as tall as the grid
        shown (held by useSteadyFilter when scrolled), and nothing sits
        under it in the panel.
      */}
      <div ref={gridRef} className="relative isolate" data-theme-grid="">
        {THEME_KINDS.map((kind) => (
          <div
            key={kind.id}
            data-theme-kind-grid={kind.id}
            className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3"
            style={kind.id === filter ? undefined : HIDDEN_GRID}
            data-theme-kind-shown={kind.id === filter ? "" : undefined}
            aria-hidden={kind.id !== filter ? true : undefined}
          >
            {THEME_TEMPLATES.filter((t) => kind.id === "all" || t.category === kind.id).map((template, i, list) => {
              /* All is in groups, each named once where it starts (components/onepage/themes/theme-order); a kind is one group already. */
              const group = kind.id === "all" ? themeGroupOf(template.id) : null
              const starts = group && (i === 0 || themeGroupOf(list[i - 1].id) !== group)
              return (
                <ReactModule.Fragment key={template.id}>
                  {starts ? <h3 data-theme-group={group} className="col-span-full pt-4 text-[13px] font-semibold text-[#1a1a2e] first:pt-0">{THEME_GROUP_LABELS[group]()}</h3> : null}
                  <ThemeCard template={template} who={who} selected={theme.template_id === template.id} shown={kind.id === filter} copy={kind.id !== "all"} onPick={onPick} />
                </ReactModule.Fragment>
              )
            })}
          </div>
        ))}
      </div>

    </div>
  )
}

function WallpaperSection() {
  const { onepage, updateTheme } = useOnePage()
  /* Its questions and pickers are the shared sheet on a phone (components/ui/sheet-dialog). */
  const sheetPhone = usePhone()
  const [showLayoutChangeDialog, setShowLayoutChangeDialog] = useState(false)
  const [pendingBgType, setPendingBgType] = useState<"gradient" | "image" | "video" | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Video wallpaper states
  const [showWallpaperVideoCropModal, setShowWallpaperVideoCropModal] = useState(false)
  const [tempWallpaperVideo, setTempWallpaperVideo] = useState<{ url: string; file: File } | null>(null)
  const [videoPickError, setVideoPickError] = useState<string | null>(null)
  const wallpaperVideoFileInputRef = useRef<HTMLInputElement>(null)

  /* The wallpaper picture's upload, and the picture from the device shown while it goes up. */
  const imageUp = useMediaUpload()
  const [localImage, setLocalImage] = useState<string | null>(null)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  /* The device picture's address is let go when the section closes (a state setter would not run then). */
  const localImageRef = useRef<string | null>(null)
  localImageRef.current = localImage
  useEffect(() => () => {
    if (localImageRef.current) URL.revokeObjectURL(localImageRef.current)
  }, [])
  /* "Your files" for the wallpaper picture. */
  const [wallpaperLibrary, setWallpaperLibrary] = useState(false)

  if (!onepage) return null
  const { theme } = onepage
  const currentHeaderLayout = (theme as any).header_layout || "classic"

  // Parse current gradient to extract colors and direction
  /* Start is the first stop and End the last, however many lie between (lib/onepage/theme-layout readLinearGradient). */
  const parseGradient = (gradient: string) => {
    const read = readLinearGradient(gradient)
    return {
      direction: read ? read.direction : 135,
      color1: read?.stops[0]?.color || "#f0a8b8",
      color2: read?.stops[read.stops.length - 1]?.color || "#b2846c",
    }
  }

  const gradientInfo = parseGradient(theme.background_gradient || DEFAULT_GRADIENT)

  const handleBgTypeChange = (type: "solid" | "gradient" | "image" | "video") => {
    /* Video with none chosen yet opens the device's picker; the page changes once a video is saved. With one, it is simply back. */
    if (type === "video" && !(theme as any).background_video_url) {
      pickWallpaperVideo()
      return
    }

    /* A gradient with none set yet starts from the one its tile shows, rather than drawing nothing. */
    updateTheme(type === "gradient" && !theme.background_gradient ? { background_type: type, background_gradient: DEFAULT_GRADIENT } : { background_type: type })
  }

  const handleConfirmLayoutChange = () => {
    if (pendingBgType) {
      if (pendingBgType === "video" && !(theme as any).background_video_url) {
        updateTheme({ header_layout: "classic" } as any)
        pickWallpaperVideo()
      } else {
        updateTheme({ background_type: pendingBgType, header_layout: "classic" } as any)
      }
      /* A picture chosen before the switch was asked for goes up now. */
      if (pendingBgType === "image" && pendingImageFile) void uploadWallpaperImage(pendingImageFile)
    }
    setShowLayoutChangeDialog(false)
    setPendingBgType(null)
    setPendingImageFile(null)
  }

  /* Only what was changed: the angle, the first colour or the last; the theme's other stops stay (lib/onepage/theme-layout editLinearGradient). */
  const handleGradientChange = (direction: number, color1: string, color2: string) => {
    const change = {
      ...(direction !== gradientInfo.direction ? { direction } : {}),
      ...(color1 !== gradientInfo.color1 ? { first: color1 } : {}),
      ...(color2 !== gradientInfo.color2 ? { last: color2 } : {}),
    }
    updateTheme({ background_gradient: editLinearGradient(theme.background_gradient || DEFAULT_GRADIENT, change, { direction, first: color1, last: color2 }) })
  }

  /* The chosen picture shows at once from the device and goes up behind its progress; the uploaded one replaces it once it has loaded. */
  const uploadWallpaperImage = async (file: File) => {
    const preview = URL.createObjectURL(file)
    setLocalImage((old) => {
      if (old) URL.revokeObjectURL(old)
      return preview
    })
    const result = await imageUp.upload(file, { prefix: "wallpaper", want: "image" })
    if (!result) {
      setLocalImage((old) => {
        if (old) URL.revokeObjectURL(old)
        return null
      })
      return
    }
    updateTheme({ background_type: "image", background_image_url: result.url })
    const loaded = new Image()
    loaded.src = result.url
    const done = () => setLocalImage((old) => {
      if (old !== preview) return old
      URL.revokeObjectURL(preview)
      return null
    })
    loaded.decode().then(done, done)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await uploadWallpaperImage(file)
  }

  const cancelWallpaperImage = () => {
    imageUp.cancel()
    setLocalImage((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  const removeWallpaperImage = () => {
    cancelWallpaperImage()
    imageUp.clear()
    updateTheme({ background_image_url: "" })
  }

  const handleImageSelect = (url: string) => {
    updateTheme({ background_image_url: url })
  }

  // Wallpaper video: MP4, MOV, WebM or M4V up to 2 GB, cropped to a phone's shape, then straight to storage.
  const pickWallpaperVideo = () => {
    setVideoPickError(null)
    wallpaperVideoFileInputRef.current?.click()
  }

  const handleWallpaperVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const verdict = checkMedia(file, "video")
    if (!verdict.ok) {
      setVideoPickError(uploadErrorText(verdict.code ?? "type", "video"))
      return
    }
    setVideoPickError(null)
    setTempWallpaperVideo({ url: URL.createObjectURL(file), file })
    setShowWallpaperVideoCropModal(true)
  }

  const closeWallpaperVideoCrop = () => {
    setShowWallpaperVideoCropModal(false)
    if (tempWallpaperVideo) URL.revokeObjectURL(tempWallpaperVideo.url)
    setTempWallpaperVideo(null)
  }

  const handleRemoveWallpaperVideo = () => {
    updateTheme({
      background_type: "solid",
      background_video_url: null,
      background_video_crop: null
    } as any)
  }

  const bgType = theme.background_type as "solid" | "gradient" | "image" | "video"
  const coverImage = localImage || theme.background_image_url || ""
  const wallpaperVideoUrl: string = (theme as any).background_video_url || ""
  /* Round AR: the photo's and the video's effect, as the page draws them. */
  const imageLook = wallpaperMediaLook(theme as any, "image")
  const videoLook = wallpaperMediaLook(theme as any, "video")
  const currentPattern = (theme as any).background_pattern || "none"
  const patternRaw: string = (theme as any).pattern_color || "#00000090"
  /* The pattern colour carries its own strength as two hex digits on the end (#00000090). The picker has no alpha, so it is kept aside and put back. */
  const patternAlpha = /^#[0-9a-f]{8}$/i.test(patternRaw) ? patternRaw.slice(7) : "90"
  const wallpaperFill = bgType === "gradient" ? theme.background_gradient || DEFAULT_GRADIENT : theme.background_color

  const styleTile = (type: "solid" | "gradient" | "image" | "video") => {
    const art =
      type === "solid" ? <span className="absolute inset-0" style={{ background: bgType === "solid" ? theme.background_color : "#b2846c" }} /> :
      type === "gradient" ? <span className="absolute inset-0" style={{ background: bgType === "gradient" && theme.background_gradient ? theme.background_gradient : DEFAULT_GRADIENT }} /> :
      type === "image" ? (theme.background_image_url ? <img src={onePageImageSrc(theme.background_image_url, 160)} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center bg-[#f1f2f4] text-[#6b7280]"><ImageIcon className="h-5 w-5" strokeWidth={1.6} /></span>) :
      <span className="absolute inset-0 grid place-items-center bg-[#f1f2f4] text-[#6b7280]"><Video className="h-5 w-5" strokeWidth={1.6} /></span>
    return (
      <ChoiceCard key={type} selected={bgType === type} onClick={() => handleBgTypeChange(type)} label={type === "solid" ? tt("Fill") : type === "gradient" ? tt("Gradient") : type === "image" ? tt("Image") : tt("Video")} className="p-1.5">
        <span className="relative block aspect-square overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">{art}</span>
      </ChoiceCard>
    )
  }

  /*
    PATTERN AND TEXTURE. Each choice is a small square of the page's own
    wallpaper with the pattern on it, drawn by the same function as the page
    (WallpaperPattern), at a little over half its size so a square shows as
    much of it as a phone would. Textures (grain, paper, linen) and patterns
    are two short rows under their own names, None first. Picked is the thin
    dark border and an ink check. A page with no pattern colour of its own
    gets one that shows on its wallpaper: white on a dark one, black on a
    light one, written with the pick, so what the square showed is what the
    page draws.
  */
  /*
    Round W10: an automatic colour (none saved, or one of the two this picker
    used to write) is no longer written with the pick. It follows the
    wallpaper wherever it is drawn (lib/onepage/wallpaper resolvedPatternInk),
    so a page made dark later shows its pattern in white, not black on black.
  */
  /* The wallpaper the squares are drawn on, the gradient one shows when the page has none of its own included. */
  const ground = { background_type: bgType, background_color: theme.background_color, background_gradient: wallpaperFill }
  const fillIsDark = wallpaperIsDark(ground)
  const autoInk = isAutoInk((theme as any).pattern_color)
  const ink = resolvedPatternInk((theme as any).pattern_color, ground)
  /* A colour picked by hand is the creator's: never written as one of the two values that mean "automatic". */
  const ownInk = (hex: string) => (isAutoInk(hex + patternAlpha) ? `${hex}8f` : hex + patternAlpha)
  const pickPattern = (id: string) => updateTheme({ background_pattern: id } as any)
  const patternTile = (pattern: (typeof WALLPAPER_PATTERNS)[number]) => {
    const on = (canonicalPatternId(currentPattern) ?? "none") === pattern.id
    return (
      <button
        key={pattern.id}
        type="button"
        onClick={() => pickPattern(pattern.id)}
        aria-pressed={on}
        data-pattern-choice={pattern.id}
        className={cn(
          "group/pattern relative flex min-h-11 cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-1.5 text-center outline-none transition-[border-color] duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]",
          choiceOff,
        )}
      >
        <ChoiceMark on={on} />
        <span className="relative block aspect-square overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" style={{ background: wallpaperFill }}>
          {pattern.id === "none" ? (
            <span className="absolute inset-0 grid place-items-center">
              <span className="block h-px w-[70%] rotate-45 rounded-full" style={{ background: fillIsDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.3)" }} />
            </span>
          ) : (
            <WallpaperPattern pattern={pattern.id} color={ink} ground={ground} level={(theme as any).pattern_opacity || "medium"} style={{ backgroundSize: previewSize(pattern.id, ink, (theme as any).pattern_opacity || "medium") }} />
          )}
          <CheckMark on={on} small className="right-1 top-1" />
        </span>
        <span className={cn("block truncate pb-0.5 pt-1.5 text-[12px] font-medium transition-colors duration-[180ms]", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{pattern.name}</span>
      </button>
    )
  }
  const patternSection = (
    <PanelSection>
      <SectionTitle title={tt("Pattern and texture")} description={tt("Drawn over the colour, on the whole page")} />
      <p className="mb-2 text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Textures")}</p>
      <div className="grid grid-cols-4 gap-2" data-pattern-group="textures">
        {WALLPAPER_PATTERNS.filter((p) => p.kind !== "pattern").map(patternTile)}
      </div>
      <p className="mb-2 mt-5 text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Patterns")}</p>
      <div className="grid grid-cols-4 gap-2" data-pattern-group="patterns">
        {WALLPAPER_PATTERNS.filter((p) => p.kind === "pattern").map(patternTile)}
      </div>
      {isPatternId(currentPattern) ? (
        <div className="mt-5 space-y-4">
          <ColorRow
            label={tt("Pattern colour")}
            description={autoInk ? tt("Automatic: follows the wallpaper") : undefined}
            value={autoInk ? null : normalizeHex(ink)}
            emptyLabel={tt("Automatic")}
            fallback={normalizeHex(ink) ?? undefined}
            onChange={(color) => updateTheme({ pattern_color: ownInk(color) } as any)}
            onClear={() => updateTheme({ pattern_color: null } as any)}
            suggestions={["#000000", "#ffffff", "#1a1a2e", theme.text_color, theme.button_color, "#b2846c"]}
          />
          <SettingRow label={tt("Strength")} stackOnPhone>
            <Segmented
              className="w-full sm:w-[300px]"
              label={tt("Pattern strength")}
              value={((theme as any).pattern_opacity || "medium") as PatternOpacity}
              options={[{ id: "low", label: tt("Light") }, { id: "medium", label: tt("Medium") }, { id: "hard", label: tt("Strong") }, { id: "very_hard", label: tt("Bold") }] as const}
              onChange={(id) => updateTheme({ pattern_opacity: id } as any)}
            />
          </SettingRow>
        </div>
      ) : null}
    </PanelSection>
  )

  const noiseRows = (field: "gradient_noise" | "image_noise") => (
    <>
      <SwitchRow
        label={tt("Film grain")}
        description={tt("A fine grain over the whole wallpaper")}
        checked={!!(theme as any)[field]}
        onChange={(checked) => updateTheme({ [field]: checked } as any)}
      />
      {(theme as any)[field] ? (
        <div className="mt-3">
          <RangeRow label={tt("Grain strength")} value={(theme as any).noise_strength || 15} min={5} max={50} step={5} onChange={(v) => updateTheme({ noise_strength: v } as any)} unit="%" ends={[tt("Subtle"), tt("Strong")]} />
        </div>
      ) : null}
    </>
  )

  return (
    <div>
      <PanelSection>
        <SectionTitle title={tt("Wallpaper style")} />
        <div className="grid grid-cols-4 gap-2.5">{(["solid", "gradient", "image", "video"] as const).map(styleTile)}</div>
      </PanelSection>

      {bgType === "solid" && (
        <>
          <PanelSection>
            <ColorRow
              label={tt("Background colour")}
              value={theme.background_color}
              onChange={(color) => updateTheme({ background_color: color })}
              suggestions={["#ffffff", "#f8f9fa", "#f4efe9", "#e9ecef", "#1a1a2e", "#0f172a", "#b2846c", "#fef3c7"]}
            />
          </PanelSection>
          {patternSection}
        </>
      )}

      {bgType === "gradient" && (
        <>
          <PanelSection>
            <div className="h-24 w-full rounded-2xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]" style={{ background: theme.background_gradient || DEFAULT_GRADIENT }} />
            <div className="mt-5 space-y-3">
              <ColorRow label={tt("Start")} value={gradientInfo.color1} onChange={(color) => handleGradientChange(gradientInfo.direction, color, gradientInfo.color2)} />
              <ColorRow label={tt("End")} value={gradientInfo.color2} onChange={(color) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, color)} />
            </div>
            {/* Round 40: eight painted directions and an angle, where the dial was (components/onepage/themes/gradient-direction). */}
            <div className="mt-5">
              <GradientDirection value={gradientInfo.direction} from={gradientInfo.color1} to={gradientInfo.color2} onChange={(dir) => handleGradientChange(dir, gradientInfo.color1, gradientInfo.color2)} />
            </div>
          </PanelSection>
          <PanelSection>
            <SectionTitle title={tt("Ready made")} />
            <div className="grid grid-cols-6 gap-2">
              {[
                "linear-gradient(160deg, #f7c59f 0%, #c4553b 100%)",
                "linear-gradient(135deg, #fbd3c4 0%, #e8687a 100%)",
                "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
                "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                "linear-gradient(180deg, #e9e6da 0%, #b8b08d 100%)",
                "linear-gradient(180deg, #0c4a6e 0%, #0ea5e9 100%)",
                "linear-gradient(165deg, #04110f 0%, #1d7a63 100%)",
                "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
                "linear-gradient(180deg, #f4efe9 0%, #b2846c 100%)",
                "linear-gradient(135deg, #00d2d3 0%, #54a0ff 100%)",
                "linear-gradient(180deg, #2c3e50 0%, #3498db 100%)",
              ].map((grad, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={tt("Gradient {value}", { value: i + 1 })}
                  aria-pressed={theme.background_gradient === grad}
                  onClick={() => updateTheme({ background_gradient: grad })}
                  className="relative aspect-square min-h-11 cursor-pointer rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
                  style={{ background: grad }}
                >
                  <SwatchMark on={theme.background_gradient === grad} className="rounded-[15.5px]" />
                </button>
              ))}
            </div>
          </PanelSection>
          <PanelSection>
            <SwitchRow label={tt("Animate")} description={tt("The colours drift slowly across the page")} checked={theme.animated_gradient || false} onChange={(checked) => updateTheme({ animated_gradient: checked })} />
            <div className="mt-5">{noiseRows("gradient_noise")}</div>
          </PanelSection>
          {patternSection}
        </>
      )}

      {bgType === "image" && (
        <>
          <PanelSection>
            {coverImage ? (
              /* The picture, with Replace and Delete on it. While a new one goes up it shows at once from the device, with the progress and Stop over it, and stays until the uploaded one has loaded: no blank frame, no jump. */
              <div data-wallpaper-cover="image" className="relative aspect-video overflow-hidden rounded-2xl bg-[#f1f2f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <img key={coverImage} src={onePageImageSrc(coverImage, 400)} alt={tt("Wallpaper")} decoding="async" className="h-full w-full object-cover" style={{ filter: imageLook.filter, scale: String(imageLook.scale) }} />
                {/* Round AR: the effect's layers, as the page lays them (lib/onepage/wallpaper wallpaperMediaLook). */}
                <WallpaperEffectLayers look={imageLook} box={{ position: "absolute", inset: 0 }} />
                {imageUp.busy ? (
                  <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.6),rgba(0,0,0,0))] px-3 pb-3 pt-10">
                    <UploadProgress state={imageUp.state} onCancel={cancelWallpaperImage} tone="dark" />
                  </div>
                ) : (
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button type="button" data-wallpaper-replace="" onClick={() => fileInputRef.current?.click()} className={cn(secondaryDepth, "h-10 rounded-full px-4 text-[13.5px]")}>
                      <Upload className="h-4 w-4" />
                      {tt("Replace")}
                    </button>
                    <LibraryButton onClick={() => setWallpaperLibrary(true)} className={cn(secondaryDepth, "h-10 rounded-full border-0 px-4 text-[13.5px]")} />
                    <button type="button" data-wallpaper-delete="" aria-label={tt("Remove image")} onClick={removeWallpaperImage} className={cn(secondaryDepth, "h-10 w-10 rounded-full")}><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" data-wallpaper-upload="image" onClick={() => fileInputRef.current?.click()} className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-8 text-[#1a1a2e] [@media(hover:hover)]:hover:bg-[#f7f7f8]">
                <Upload className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />
                <span className="text-[14px] font-medium">{tt("Upload an image")}</span>
                <span className="text-[13px] text-[#6b7280]">{tt("JPG, PNG, GIF or HEIC. Tall pictures fit a phone best")}</span>
              </button>
            )}
            {!coverImage ? <LibraryRow className="mt-3" onClick={() => setWallpaperLibrary(true)} /> : null}
            {imageUp.state.phase === "error" ? <UploadProgress state={imageUp.state} className="mt-3" /> : null}
            <input ref={fileInputRef} type="file" accept={ONEPAGE_IMAGE_ACCEPT} onChange={handleImageUpload} className="hidden" />
            <FilesLibraryChooser
              open={wallpaperLibrary}
              onClose={() => setWallpaperLibrary(false)}
              selectedUrl={theme.background_image_url || null}
              onPick={(url) => updateTheme({ background_type: "image", background_image_url: url })}
            />
          </PanelSection>
          {theme.background_image_url ? (
            <PanelSection>
              <div className="space-y-5">
                <RangeRow label={tt("Brightness")} value={(theme as any).image_brightness || 100} min={20} max={150} step={5} onChange={(v) => updateTheme({ image_brightness: v } as any)} unit="%" />
                {/* Round AR: None, Mono, Blur, Halftone, Grain or Duotone, and a tint (components/onepage/themes/wallpaper-effects). Blur is one of them now. */}
                <WallpaperEffects theme={theme as any} kind="image" src={onePageImageSrc(theme.background_image_url, 200)} onChange={(patch) => updateTheme(patch as any)} />
                <div>{noiseRows("image_noise")}</div>
              </div>
            </PanelSection>
          ) : null}
          <PanelSection>
            <SectionTitle title={tt("From the library")} />
            {/* Round 40: sized copies, faded in once decoded, and the rest of Storelib's library (components/onepage/themes/wallpaper-library). */}
            <WallpaperLibrary value={theme.background_image_url} onPick={handleImageSelect} />
          </PanelSection>
        </>
      )}

      {bgType === "video" && (
        <PanelSection>
          {wallpaperVideoUrl ? (
            <div className="space-y-5">
              {/* The video as the page draws it (the same crop), with Replace and Delete on it, like the picture. */}
              <div data-wallpaper-cover="video" className="relative mx-auto aspect-[9/16] w-[min(100%,210px)] overflow-hidden rounded-2xl bg-[#111113] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <video key={wallpaperVideoUrl} src={wallpaperVideoUrl} className="h-full w-full object-cover" style={{ filter: videoLook.filter, scale: String(videoLook.scale), ...(croppedMediaStyle((theme as any).background_video_crop) as React.CSSProperties | undefined) }} autoPlay loop muted playsInline preload="metadata" />
                <WallpaperEffectLayers look={videoLook} box={{ position: "absolute", inset: 0 }} />
                <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                  <button type="button" data-wallpaper-replace="" onClick={pickWallpaperVideo} className={cn(secondaryDepth, "h-10 rounded-full px-4 text-[13.5px]")}>
                    <Upload className="h-4 w-4" />
                    {tt("Replace")}
                  </button>
                  <button type="button" data-wallpaper-delete="" aria-label={tt("Remove video")} onClick={handleRemoveWallpaperVideo} className={cn(secondaryDepth, "h-10 w-10 rounded-full")}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <SettingRow label={tt("Brightness")} stackOnPhone>
                <Segmented
                  className="w-full sm:w-[320px]"
                  label={tt("Video brightness")}
                  value={String((theme as any).video_brightness || 100) as "100" | "85" | "70" | "40"}
                  options={[{ id: "100", label: tt("Normal") }, { id: "85", label: tt("Dim") }, { id: "70", label: tt("Darker") }, { id: "40", label: tt("Dark") }] as const}
                  onChange={(id) => updateTheme({ video_brightness: Number(id) } as any)}
                />
              </SettingRow>
              <WallpaperEffects theme={theme as any} kind="video" src={videoPoster((theme as any).background_video_crop)} onChange={(patch) => updateTheme(patch as any)} />
            </div>
          ) : (
            <button type="button" data-wallpaper-upload="video" onClick={pickWallpaperVideo} className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-8 text-[#1a1a2e] [@media(hover:hover)]:hover:bg-[#f7f7f8]">
              <Video className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />
              <span className="text-[14px] font-medium">{tt("Upload a video")}</span>
              <span className="text-[13px] text-[#6b7280]">{tt("MP4, MOV or WebM, up to 2 GB")}</span>
            </button>
          )}
        </PanelSection>
      )}

      {/* Always here, so the Video tile can open the device's picker from any wallpaper style. */}
      <input ref={wallpaperVideoFileInputRef} type="file" accept={ONEPAGE_VIDEO_ACCEPT} onChange={handleWallpaperVideoFileSelect} className="hidden" />
      {videoPickError ? (
        <PanelSection>
          <p role="alert" className="text-[13px] leading-snug text-[#b42318]">{videoPickError}</p>
        </PanelSection>
      ) : null}


      {/* Video Crop Modal: a phone-shaped (9:16) part of the video; the page draws it through the same crop (croppedMediaStyle). */}
      <SheetDialog
        open={showWallpaperVideoCropModal}
        onClose={closeWallpaperVideoCrop}
        phone={sheetPhone}
        label={tt("Crop Video")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { closeWallpaperVideoCrop(); pickWallpaperVideo() }} aria-label={tt("Back")} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Video")}</SheetDialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            {tempWallpaperVideo ? (
              <CropUpload
                kind="video"
                src={tempWallpaperVideo.url}
                file={tempWallpaperVideo.file}
                aspect={9 / 16}
                prefix="wallpaper-video"
                maxHeight={sheetPhone ? 340 : 420}
                help={tt("Drag to move. Drag a corner to resize. The box is the shape of a phone.")}
                onCancel={closeWallpaperVideoCrop}
                onSaved={(result, crop) => {
                  updateTheme({ background_type: "video", background_video_url: result.url, background_video_crop: crop } as any)
                  closeWallpaperVideoCrop()
                }}
              />
            ) : null}
          </div>
        </SheetDialog>

      {/* Layout Change Dialog */}
      <SheetDialog
        open={showLayoutChangeDialog}
        onClose={() => setShowLayoutChangeDialog(false)}
        phone={sheetPhone}
        label={tt("Update profile image style?")}
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 pb-0">
            <SheetDialogTitle className="text-lg font-semibold text-center">{tt("Update profile image style?")}</SheetDialogTitle>
          </DialogHeader>
          
          <div className="p-5 space-y-4">
            {/* Preview */}
            <div className="bg-gray-900 rounded-2xl p-4 flex items-center justify-center">
              <div className="w-40 rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-orange-400 to-pink-500">
                <div className="p-4 flex flex-col items-center gap-2">
                  <div data-layout-avatar="" className="w-10 h-10 aspect-square shrink-0 rounded-full bg-white/20" />
                  <div className="w-16 h-2 rounded bg-white/40" />
                  <div className="w-12 h-1.5 rounded bg-white/30" />
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-4 rounded-full bg-white/20" />
                    <div className="w-4 h-4 rounded-full bg-white/20" />
                    <div className="w-4 h-4 rounded-full bg-white/20" />
                  </div>
                  <div className="w-full h-6 rounded-lg bg-white/80 mt-2" />
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              <Rich text={tt("This wallpaper option requires a {layout} profile image layout.")} parts={{ layout: <strong>{tt("Classic")}</strong> }} />
            </p>

            <div className="space-y-2">
              <button
                onClick={handleConfirmLayoutChange}
                className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                {tt("Update to Classic")}
              </button>
              
              <button
                onClick={() => { setShowLayoutChangeDialog(false); setPendingBgType(null); setPendingImageFile(null) }}
                className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {tt("Cancel")}
              </button>
            </div>
          </div>
        </SheetDialog>
    </div>
  )
}

/**
 * A FONT, CHOSEN FROM A LIST DRAWN IN ITS OWN FACES. The row shows the font
 * in use, in that font; the list is a dialog on a computer and the app's
 * sheet on a phone, with a search and the families as tabs. Each name is
 * drawn in its own face from one small request (FONT_SAMPLE_HREF), so the
 * list costs a few kilobytes, not forty fonts.
 */
/**
 * ===========================================================================
 *  A FONT'S NAME, DRAWN IN ITS OWN FACE ONCE THAT FACE IS HERE
 * ===========================================================================
 * The list names some forty families, each drawn in itself from one small
 * stylesheet cut to the letters of the names (FONT_SAMPLE_HREF). Drawing all
 * of them the moment the list opened asked for every face at once and
 * re-laid each row as its face arrived: the open stuttered. Now a row asks
 * for its face only when it scrolls into view, is drawn in the app's own
 * face, a little faded, until the face has loaded, and then takes it. A face
 * that has loaded once is remembered for the visit, so a second open is drawn
 * in the right faces from its first frame.
 */
const loadedFaces = new Set<string>()
function FontSample({ family, text, className }: { family: string; text: string; className?: string }) {
  const face = familyOf(family)
  const ref = useRef<HTMLSpanElement>(null)
  const [ready, setReady] = useState(() => !face || loadedFaces.has(face) || typeof document === "undefined" || !("fonts" in document))
  useEffect(() => {
    if (ready || !face) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") {
      setReady(true)
      return
    }
    let gone = false
    const done = () => {
      loadedFaces.add(face)
      if (!gone) setReady(true)
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      document.fonts.load(`17px "${face}"`, text).then(done, done)
    }, { rootMargin: "160px 0px" })
    io.observe(el)
    return () => {
      gone = true
      io.disconnect()
    }
  }, [ready, face, text])
  return (
    <span ref={ref} data-font-sample={ready ? "ready" : "waiting"} className={cn(className, "transition-opacity duration-200 ease-out", ready ? "opacity-100" : "opacity-50")} style={ready ? { fontFamily: fontStack(family) } : undefined}>
      {text}
    </span>
  )
}

/**
 * THE FONT PICKER. On a phone, the app's own sheet (components/ui/bottom-sheet),
 * built while the page is idle and kept (keepMounted), so the tap that opens
 * it only moves it; it sits on the keyboard when the search is typed in. On a
 * computer, a dropdown under the field rather than a dialog over the page:
 * no scrim, no page behind it to dim, and the list is where the eye already
 * is. Either way the rows draw their faces as they come into view (above).
 */
/** The font sheet's tallest: three quarters of what a phone shows. */
const FONT_SHEET_MAX = "min(75dvh, 640px)"
/** The list's least room while a search narrows it: four rows, or a third of the visible screen when the keyboard leaves less. */
const FONT_SHEET_SEARCH_ROOM = "min(232px, calc(var(--vv-h, 100dvh) * 0.33))"

function FontPicker({
  label,
  description,
  value,
  fonts,
  onPick,
  sampleFamily,
  defaultLabel,
}: {
  label: string
  description?: string
  value: string | null
  fonts: { name: string; value: string | null; category?: string; style?: string }[]
  onPick: (value: string | null) => void
  /** The face the row is drawn in when `value` is null. */
  sampleFamily: string
  defaultLabel?: string
}) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [family, setFamily] = useState("all")
  const listRef = useRef<HTMLDivElement>(null)
  /* Another kind: its list fades in from the top, on opacity, rather than replacing the last in one frame. */
  const chooseFamily = (id: string) => {
    setFamily(id)
    const box = listRef.current
    if (!box) return
    box.scrollTop = 0
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) box.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" })
  }
  const current = fonts.find((f) => f.value === value)
  const name = value ? current?.name || familyOf(value) || value : defaultLabel || tt("Default")
  const withCategories = fonts.some((f) => f.category)
  const shown = fonts.filter((f) => (family === "all" || f.category === family) && f.name.toLowerCase().includes(query.trim().toLowerCase()))
  const choose = (v: string | null) => {
    onPick(v)
    setOpen(false)
  }
  const openPicker = () => {
    setQuery("")
    setFamily("all")
    setOpen(true)
    /* A kept sheet keeps its scroll: start at the chosen one. */
    requestAnimationFrame(() => {
      const box = listRef.current
      if (!box) return
      const on = box.querySelector<HTMLElement>('[aria-selected="true"]')
      const at = on ? on.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop : 0
      box.scrollTop = at > box.clientHeight - 60 ? at - 56 : 0
    })
  }
  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search fonts")} aria-label={tt("Search fonts")} className={cn(fieldInput, "h-11 pl-10")} />
        </label>
        {withCategories ? (
          /* The editor's one pill-tab row (components/onepage/pill-tabs): Storelib's own pills, the chosen one's fill fading in where it is. */
          <PillTabs
            dataRow="font-kinds"
            label={tt("Kind of font")}
            items={FONT_CATEGORIES}
            value={family}
            onChange={chooseFamily}
            keepInView
            scroll={{ wrapClassName: "-mx-4" }}
            className="flex gap-2 px-4 pb-0.5 scrollbar-hide"
            itemClassName="h-9 px-4 text-[13px]"
          />
        ) : null}
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#eef0f2] px-2 py-2"
        /* On a phone the sheet is as tall as its list (FONT_SHEET_MAX at most); a search that narrows the list keeps a few rows of room, so the top edge does not fall to the search box under the thumb. */
        style={phone && query.trim() ? { minHeight: FONT_SHEET_SEARCH_ROOM } : undefined}
      >
        {shown.length === 0 ? <p className="px-3 py-6 text-center text-[14px] text-[#6b7280]">{tt("No font by that name")}</p> : null}
        {shown.map((f) => {
          const on = f.value === value
          return (
            <button
              key={f.name}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => choose(f.value)}
              data-font-option={f.name}
              className={cn("relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors duration-150", phone ? "min-h-[56px] py-1.5" : "min-h-[52px]", !on && "hover:bg-[#f7f7f8] active:bg-[#f1f2f4]")}
            >
              {/* The chosen row's grey and its check fade in; the one it replaces fades out. */}
              <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[inherit] bg-[#f1f2f4] transition-opacity duration-[180ms] ease-out", on ? "opacity-100" : "opacity-0")} />
              <span className="relative min-w-0 flex-1">
                <FontSample family={f.value || sampleFamily} text={f.name} className="block truncate text-[17px] leading-[1.35] text-[#1a1a2e]" />
                {f.style ? <span className="block truncate text-[12.5px] text-[#6b7280]">{f.style}</span> : null}
              </span>
              <Check className={cn("relative h-5 w-5 shrink-0 text-[#1a1a2e] transition-[opacity,scale] duration-[180ms] ease-out", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
  const trigger = (
    <button
      type="button"
      onClick={openPicker}
      data-font-picker={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      className="flex min-h-[64px] w-full cursor-pointer items-center gap-4 rounded-2xl border border-[#e3e4e8] bg-white px-4 py-3 text-left transition-colors hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] outline-none"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4f4f6] text-[20px] text-[#1a1a2e]" style={{ fontFamily: fontStack(value || sampleFamily) }} aria-hidden>{tt("Aa")}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-[#6b7280]">{label}</span>
        <span className="block truncate text-[16px] font-medium text-[#1a1a2e]" style={{ fontFamily: fontStack(value || sampleFamily) }}>{name}</span>
      </span>
      <ChevronRight className={cn("h-5 w-5 shrink-0 text-[#1a1a2e] transition-[rotate] duration-200", !phone && open && "rotate-90")} strokeWidth={1.75} aria-hidden />
    </button>
  )
  if (phone) {
    return (
      <>
        {trigger}
        {description ? <p className="mt-2 text-[13.5px] text-[#6b7280]">{description}</p> : null}
        {/*
          Round 43: as tall as what is in it, three quarters of the screen at
          most. It was a fixed 80% (640px) whatever it held, so a short list
          sat in a tall white sheet and a long one covered nearly the whole
          page behind it.
        */}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={label} fill maxHeight={FONT_SHEET_MAX} aboveKeyboard keepMounted>
          <div className="flex min-h-0 flex-1 flex-col pt-2" data-font-sheet="">{list}</div>
        </BottomSheet>
      </>
    )
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          data-font-popover=""
          className="flex h-[min(460px,70vh)] w-[var(--radix-popover-trigger-width)] min-w-[340px] flex-col overflow-hidden rounded-2xl border border-[#e3e4e8] bg-white p-0 pt-4 text-[#1a1a2e] shadow-[0_16px_48px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
        >
          {list}
        </PopoverContent>
      </Popover>
      {description ? <p className="mt-2 text-[13.5px] text-[#6b7280]">{description}</p> : null}
    </>
  )
}

/**
 * ROUND 43: THE NAME AND THE BIO, SET AS TYPE. Size, weight, letter spacing
 * and capitals for each, stored on the theme (lib/onepage/header-style) and
 * drawn by the page and the preview alike. Nothing chosen is what a page
 * always drew: a bold name, a regular bio, both at their usual size.
 */
function TypeRows({
  which,
  theme,
  weights,
  onChange,
}: {
  which: "title" | "bio"
  theme: Record<string, unknown>
  weights: readonly { id: string; label: string }[]
  onChange: (patch: Record<string, unknown>) => void
}) {
  const weight = which === "title" ? titleWeightOf(theme) : bioWeightOf(theme)
  /*
    Only the weights the chosen face really has (lib/onepage/fonts realWeight):
    Medium on Lato would draw its Regular, and every weight of Bebas Neue is
    the one it has, so those choices are not offered twice. The one picked is
    the one that draws what the page draws.
  */
  const family = which === "title" ? titleFamilyOf(theme) : bioFamilyOf(theme)
  const seen = new Set<number>()
  const offered = weights.filter((w) => {
    const real = realWeight(family, Number(w.id))
    if (seen.has(real)) return false
    seen.add(real)
    return true
  })
  const drawn = realWeight(family, weight)
  /* The nearest on offer, so a bio saved as Semibold (600) before Bold was offered shows as Bold, the heavier on a tie. */
  const picked = offered.reduce<string | null>((best, w) => {
    if (best === null) return w.id
    const d = Math.abs(realWeight(family, Number(w.id)) - drawn)
    const bd = Math.abs(realWeight(family, Number(best)) - drawn)
    return d < bd || (d === bd && Number(w.id) > Number(best)) ? w.id : best
  }, null) ?? String(weight)
  /* Wide enough for four weights' names side by side. */
  const row = "w-full sm:w-[308px]"
  return (
    <div className="space-y-4" data-type-rows={which}>
      <SettingRow label={tt("Size")} stackOnPhone>
        <Segmented
          className={row}
          label={tt("Size")}
          value={textSizeOf(theme[`${which}_size`])}
          options={[{ id: "small", label: tt("Small") }, { id: "default", label: tt("Default") }, { id: "large", label: tt("Large") }] as const}
          onChange={(id) => onChange({ [`${which}_size`]: id === "default" ? null : id })}
        />
      </SettingRow>
      <SettingRow label={tt("Weight")} stackOnPhone>
        {offered.length > 1 ? (
          <Segmented
            className={row}
            label={tt("Weight")}
            value={picked}
            options={offered}
            onChange={(id) => onChange({ [`${which}_weight`]: Number(id) === (which === "title" ? 700 : 400) ? null : Number(id) })}
          />
        ) : (
          <p className="text-[13.5px] text-[#6b7280]" data-one-weight="">{tt("This font has one weight")}</p>
        )}
      </SettingRow>
      <SettingRow label={tt("Letter spacing")} stackOnPhone>
        <Segmented
          className={row}
          label={tt("Letter spacing")}
          value={trackingOf(theme[`${which}_tracking`])}
          options={[{ id: "tight", label: tt("Tight") }, { id: "normal", label: tt("Normal") }, { id: "wide", label: tt("Wide") }] as const}
          onChange={(id) => onChange({ [`${which}_tracking`]: id === "normal" ? null : id })}
        />
      </SettingRow>
      <SettingRow label={tt("Case")} stackOnPhone>
        <Segmented
          className={row}
          label={tt("Case")}
          value={caseOf(theme[`${which}_case`])}
          options={[{ id: "none", label: tt("As typed") }, { id: "upper", label: tt("Capitals") }] as const}
          onChange={(id) => onChange({ [`${which}_case`]: id === "none" ? null : id })}
        />
      </SettingRow>
    </div>
  )
}

function HeaderTypeSections() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const theme = onepage.theme as unknown as Record<string, unknown>
  const logo = theme.title_style === "logo"
  return (
    <>
      {logo ? null : (
        <PanelSection>
          <SectionTitle title={tt("Title")} />
          <TypeRows
            which="title"
            theme={theme}
            weights={[{ id: "400", label: tt("Regular") }, { id: "500", label: tt("Medium") }, { id: "700", label: tt("Bold") }, { id: "800", label: tt("Heavy") }]}
            onChange={(patch) => updateTheme(patch as never)}
          />
        </PanelSection>
      )}
      <PanelSection>
        <SectionTitle title={tt("Bio")} />
        <TypeRows
          which="bio"
          theme={theme}
          weights={[{ id: "400", label: tt("Regular") }, { id: "500", label: tt("Medium") }, { id: "700", label: tt("Bold") }]}
          onChange={(patch) => updateTheme(patch as never)}
        />
      </PanelSection>
    </>
  )
}

/**
 * ROUND 43: THE PICTURE'S FRAME. Its size, its shape (a circle, a rounded
 * square with its corner, a square) and its ring: how thick, none at all,
 * and in the theme's own colour or one of the creator's. The ring a page
 * never chose is lighter than it was (lib/onepage/header-style
 * AVATAR_BORDER_DEFAULT).
 */
function AvatarFrameSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const theme = onepage.theme as unknown as Record<string, unknown>
  const shape = avatarShapeOf(theme)
  const ring = avatarBorderWidth(theme)
  const row = "w-full sm:w-[260px]"
  return (
    <PanelSection>
      <SectionTitle title={tt("Profile image frame")} />
      <div className="space-y-4" data-avatar-frame="">
        <SettingRow label={tt("Size")} stackOnPhone>
          <Segmented
            className={row}
            label={tt("Profile image size")}
            value={avatarSizeOf(theme)}
            options={[{ id: "small", label: tt("Small") }, { id: "medium", label: tt("Medium") }, { id: "large", label: tt("Large") }] as const}
            onChange={(id) => updateTheme({ avatar_size: id === "medium" ? null : id } as never)}
          />
        </SettingRow>
        <SettingRow label={tt("Shape")} stackOnPhone>
          <Segmented
            className={row}
            label={tt("Profile image shape")}
            value={shape}
            options={[{ id: "circle", label: tt("Circle") }, { id: "rounded", label: tt("Rounded") }, { id: "square", label: tt("Square") }] as const}
            onChange={(id) => updateTheme({ avatar_shape: id === "circle" ? null : id } as never)}
          />
        </SettingRow>
        {shape === "rounded" ? (
          <RangeRow
            label={tt("Corner radius")}
            value={typeof theme.avatar_radius === "number" ? theme.avatar_radius : AVATAR_RADIUS_DEFAULT}
            min={0}
            max={AVATAR_RADIUS_MAX}
            step={2}
            unit="px"
            onChange={(v) => updateTheme({ avatar_radius: v } as never)}
          />
        ) : null}
        <RangeRow
          label={tt("Border")}
          value={ring}
          min={0}
          max={AVATAR_BORDER_MAX}
          step={1}
          unit="px"
          ends={[tt("None"), tt("Thick")]}
          onChange={(v) => updateTheme({ avatar_border_width: v } as never)}
        />
        {ring > 0 ? (
          <ColorRow
            label={tt("Border colour")}
            value={typeof theme.avatar_border_color === "string" ? theme.avatar_border_color : null}
            emptyLabel={tt("Theme")}
            fallback={onepage.theme.text_color}
            onChange={(color) => updateTheme({ avatar_border_color: color } as never)}
            onClear={() => updateTheme({ avatar_border_color: null } as never)}
            suggestions={["#ffffff", "#000000", "#1a1a2e", onepage.theme.text_color, onepage.theme.button_color, "#b2846c"]}
          />
        ) : null}
      </div>
    </PanelSection>
  )
}

function TextSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage
  const titleFont = (theme as any).title_font || null
  const bodyValue = FONTS.find((f) => familyOf(f.value) === familyOf(theme.font_family))?.value ?? theme.font_family

  return (
    <div>
      {/* Round 40: a title and page face made for each other, in one press (components/onepage/themes/font-pairs). */}
      <PanelSection>
        <SectionTitle title={tt("Font pairs")} />
        <FontPairs theme={theme} onPick={(pair) => updateTheme(pair as never)} />
      </PanelSection>
      <PanelSection>
        {FONT_SAMPLE_HREF ? <link rel="stylesheet" href={FONT_SAMPLE_HREF} /> : null}
        <SectionTitle title={tt("Fonts")} />
        <div className="space-y-3">
          <FontPicker
            label={tt("Page font")}
            value={bodyValue}
            fonts={FONTS}
            sampleFamily={theme.font_family}
            onPick={(v) => v && updateTheme({ font_family: v })}
          />
          <FontPicker
            label={tt("Title font")}
            value={titleFont}
            fonts={TITLE_FONTS.map((f) => ({ ...f, name: f.value ? f.name : "Same as page font" }))}
            sampleFamily={theme.font_family}
            defaultLabel={tt("Same as page font")}
            onPick={(v) => updateTheme({ title_font: v } as any)}
          />
        </div>
      </PanelSection>

      <HeaderTypeSections />

      <PanelSection>
        <SectionTitle title={tt("Colours")} />
        <div className="space-y-4">
          <ColorRow
            label={tt("Title")}
            value={(theme as any).title_color || null}
            emptyLabel={tt("Text colour")}
            fallback={theme.text_color}
            onChange={(color) => updateTheme({ title_color: color } as any)}
            onClear={() => updateTheme({ title_color: null } as any)}
            suggestions={["#ffffff", "#000000", "#1a1a2e", theme.text_color, theme.button_color, "#b2846c"]}
          />
          <ColorRow
            label={tt("Text")}
            value={theme.text_color}
            onChange={(color) => updateTheme({ text_color: color })}
            suggestions={["#ffffff", "#000000", "#1a1a2e", "#374151", "#f4efe9", theme.button_color]}
          />
          <ColorRow
            label={tt("Secondary text")}
            description={tt("The bio and small print")}
            value={theme.secondary_text_color || theme.text_color}
            onChange={(color) => updateTheme({ secondary_text_color: color })}
            suggestions={["#6b7280", "#9ca3af", "#d1d5db", "#374151", "#1f2937", "#e5e7eb"]}
          />
        </div>
      </PanelSection>
    </div>
  )
}

function ButtonsSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage

  // Helper function to determine if background is light
  const isLightBackground = (bgColor: string) => {
    // Convert hex to RGB and calculate luminance
    const hex = bgColor.replace('#', '')
    if (hex.length !== 6) return true // Default to light if invalid
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    // Calculate luminance using relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 // Light if luminance > 0.5
  }

  // Handler for button style changes - auto-adjusts text color for light backgrounds
  /*
    WHAT PICKING A STYLE CHANGES, so the words stay readable: the same
    object draws that style's card above, so the card shows what a press does.
    Solid: words readable on the button (white on a dark one, near black on a
    light one; it was always white, so a white button went blank). Soft: the
    words take the button colour. Outline and glass on a light page: the
    theme's dark words. Outline: its border matches its words.
  */
  const styleUpdates = (style: "filled" | "soft" | "outline" | "glass") => {
    const updates: Record<string, unknown> = { button_style: style }
    if (style === "soft") {
      updates.button_text_color = theme.button_color
      return updates
    }
    // If selecting outline or glass on a light background, use dark text color
    if ((style === "outline" || style === "glass") && theme.background_type === "solid") {
      const bgColor = theme.background_color || "#ffffff"
      if (isLightBackground(bgColor)) {
        // Find the current template to get its light_button_text_color, or use default dark color
        const currentTemplate = THEME_TEMPLATES.find(t => t.id === theme.template_id)
        const lightButtonTextColor = (currentTemplate as any)?.light_button_text_color || "#0f172a"
        updates.button_text_color = lightButtonTextColor
      }
    }
    // Solid: words that read on the button itself
    else if (style === "filled") {
      updates.button_text_color = /^#[0-9a-f]{6}$/i.test(theme.button_color || "") && isLightBackground(theme.button_color) ? "#111113" : "#ffffff"
    }
    if (style === "outline") updates.button_border_color = (updates.button_text_color as string) || theme.button_text_color
    return updates
  }
  const handleButtonStyleChange = (style: "filled" | "soft" | "outline" | "glass") => updateTheme(styleUpdates(style) as any)

  const shadow = buttonShadow(theme)
  const radius = theme.button_border_radius ?? 8
  const shape = buttonShape(radius)
  const size = buttonSize(theme)
  const align = buttonAlign(theme)
  const iconSide = buttonIconSide(theme)
  const hover = buttonHover(theme)
  /* What Fill turns to with no colour of its own: the page draws exactly this (buttonHoverVars). */
  const autoFill = buttonHoverVars({ ...theme, button_hover_fill: null, button_hover_text: null }) as Record<string, string>
  const autoText = buttonHoverVars({ ...theme, button_hover_text: null }) as Record<string, string>
  const hoverFallback = { fill: autoFill["--op-fill"], text: autoText["--op-fill-text"] }
  const pageBg = theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8"

  /*
    EVERY CHOICE SHOWS ITSELF. Each card draws the page's own button with that
    one thing changed, from the same lib/onepage/button-style.ts the page
    draws with, so what is picked here is what the phone shows. The hover
    cards run the real hover rules (.op-btn in app/globals.css) when pointed at.
  */
  const sample = (over: Record<string, unknown>, opts: { height?: number; width?: string; label?: React.ReactNode; hover?: string; className?: string } = {}) => {
    const t = { ...theme, ...over } as typeof theme
    const r = Number(t.button_border_radius ?? 8)
    const look = { ...themeButtonStyle(t), ...buttonHoverVars(t) }
    return (
      <div className="grid h-[64px] place-items-center rounded-xl px-3" style={{ background: pageBg }}>
        <span
          className={cn("op-btn flex items-center justify-center overflow-visible text-[10px] font-semibold leading-none", opts.className)}
          data-hover={opts.hover ?? "none"}
          data-shadow={buttonShadow(t)}
          style={{ ...look, height: opts.height ?? 24, width: opts.width ?? "100%", maxWidth: 96, borderRadius: r >= PILL_FROM ? 999 : Math.min(r, 10) }}
        >
          {opts.label ?? null}
        </span>
      </div>
    )
  }

  /* Picking a shape keeps a Rounded page's own corners when it comes back to Rounded. */
  const setShape = (next: "square" | "rounded" | "pill") => {
    if (next === shape) return
    updateTheme({ button_border_radius: next === "square" ? 0 : next === "pill" ? PILL_RADIUS : 12 })
  }

  const hoverChoices = [
    { id: "none", label: tt("None") },
    { id: "lift", label: tt("Lift") },
    { id: "zoom", label: tt("Bigger") },
    { id: "glow", label: tt("Glow") },
    { id: "fill", label: tt("Fill") },
    { id: "pop", label: tt("Fill and lift") },
    { id: "underline", label: tt("Underline") },
    /* Fade is still drawn for the pages that chose it, and offered only to them. */
    ...(hover === "fade" ? [{ id: "fade", label: tt("Fade") }] : []),
  ] as const

  return (
    <div>
      <PanelSection>
        <SectionTitle title={tt("Style")} />
        <div className="grid grid-cols-4 gap-2">
          {(["filled", "soft", "outline", "glass"] as const).map((style) => (
            <ChoiceCard key={style} selected={buttonFill(theme) === style} onClick={() => handleButtonStyleChange(style)} label={style === "filled" ? tt("Solid") : style === "soft" ? tt("Soft") : style === "outline" ? tt("Outline") : tt("Glass")}>
              {sample(buttonFill(theme) === style ? {} : styleUpdates(style), { label: "Aa" })} {/* i18n-ignore: a type sample, the same in every language */}
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Shape")} />
        <div className="grid grid-cols-3 gap-3">
          {(["square", "rounded", "pill"] as const).map((id) => (
            <ChoiceCard key={id} selected={shape === id} onClick={() => setShape(id)} label={id === "square" ? tt("Square") : id === "rounded" ? tt("Rounded") : tt("Pill")}>
              {sample({ button_border_radius: id === "square" ? 0 : id === "pill" ? PILL_RADIUS : shape === "rounded" ? radius : 12 })}
            </ChoiceCard>
          ))}
        </div>
        {shape === "rounded" ? (
          <div className="mt-5">
            {/* A theme's own corners can be rounder than 24 (Terrazzo and Haze are 28): the slider shows them and can go back to them (the OnePage production audit, D6). */}
            <RangeRow label={tt("Corners")} value={radius} min={2} max={Math.max(24, radius)} step={2} onChange={(v) => updateTheme({ button_border_radius: v })} unit="px" />
          </div>
        ) : null}
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Size")} />
        <div className="grid grid-cols-3 gap-3">
          {(["compact", "regular", "large"] as const).map((id) => (
            <ChoiceCard key={id} selected={size === id} onClick={() => updateTheme({ button_size: id })} label={id === "compact" ? tt("Small") : id === "regular" ? tt("Medium") : tt("Large")}>
              {sample({}, { height: id === "compact" ? 18 : id === "regular" ? 24 : 30 })}
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Text and icon")} />
        <div className="grid grid-cols-2 gap-3">
          {(["center", "left"] as const).map((id) => (
            <ChoiceCard key={id} selected={align === id} onClick={() => updateTheme({ button_text_align: id })} label={id === "center" ? tt("Text in the middle") : tt("Text on the left")}>
              {sample({}, {
                height: 26,
                className: id === "left" ? "justify-start pl-2" : undefined,
                label: <span className="block h-[3px] w-8 rounded-full" style={{ background: "currentColor", opacity: 0.85 }} />,
              })}
            </ChoiceCard>
          ))}
          {(["left", "right"] as const).map((id) => (
            <ChoiceCard key={`icon-${id}`} selected={iconSide === id} onClick={() => updateTheme({ button_icon_position: id })} label={id === "left" ? tt("Icon on the left") : tt("Icon on the right")}>
              {sample({}, {
                height: 26,
                className: cn("relative", id === "right" && "flex-row-reverse"),
                label: (
                  <span className={cn("flex w-full items-center gap-1.5 px-1.5", id === "right" && "flex-row-reverse")}>
                    <span className="block h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: "currentColor", opacity: 0.85 }} />
                    <span className="mx-auto block h-[3px] w-7 rounded-full" style={{ background: "currentColor", opacity: 0.85 }} />
                    <span className="block h-3.5 w-3.5 shrink-0" />
                  </span>
                ),
              })}
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Shadow")} />
        <div className="grid grid-cols-4 gap-2">
          {(["none", "subtle", "strong", "hard"] as const).map((id) => (
            <ChoiceCard key={id} selected={shadow === id} onClick={() => updateTheme({ button_shadow: id })} label={id === "none" ? tt("None") : id === "subtle" ? tt("Soft") : id === "strong" ? tt("Strong") : tt("Hard")}>
              {sample({ button_shadow: id })}
            </ChoiceCard>
          ))}
        </div>
        {shadow !== "none" ? (
          <div className="mt-4">
            <ColorRow label={tt("Shadow colour")} value={theme.button_shadow_color || "#000000"} onChange={(color) => updateTheme({ button_shadow_color: color })} suggestions={["#000000", "#1a1a2e", "#ffffff", theme.button_color]} />
          </div>
        ) : null}
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Border")} />
        <Segmented
          label={tt("Border")}
          value={String(Math.min(4, Math.max(0, theme.button_border_width ?? 0))) as "0" | "1" | "2" | "3" | "4"}
          options={[{ id: "0", label: tt("None") }, { id: "1", label: "1px" }, { id: "2", label: "2px" }, { id: "3", label: "3px" }, { id: "4", label: "4px" }] as const}
          onChange={(id) => updateTheme({ button_border_width: Number(id) })}
        />
        {theme.button_style === "outline" && (theme.button_border_width ?? 0) < 2 ? (
          <p className="mt-2 text-[13px] text-[#6b7280]">{tt("Outline buttons always have at least a 2px border.")}</p>
        ) : null}
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("Colours")} />
        <div className="space-y-4">
          <ColorRow
            label={tt("Button")}
            value={theme.button_color}
            onChange={(color) => updateTheme(theme.button_style === "outline" ? { button_color: color, button_border_color: color } : { button_color: color })}
            suggestions={["#1a1a2e", "#000000", "#ffffff", "#6b7280", "#b2846c", "#2f6f4f", "#e4572e", "#3b82f6"]}
          />
          <ColorRow
            label={tt("Button text")}
            value={theme.button_text_color}
            onChange={(color) => updateTheme({ button_text_color: color })}
            suggestions={["#ffffff", "#000000", "#1a1a2e", "#f8fafc", "#fef3c7"]}
          />
          {(theme.button_border_width ?? 0) > 0 || theme.button_style === "outline" ? (
            <ColorRow
              label={tt("Border")}
              value={theme.button_border_color}
              onChange={(color) => updateTheme({ button_border_color: color })}
              suggestions={["#000000", "#ffffff", "#1a1a2e", "#e5e7eb", theme.button_color]}
            />
          ) : null}
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title={tt("On hover")} description={tt("What a button does when a mouse points at it. Point at one to try it.")} />
        <div className="grid grid-cols-3 gap-3">
          {hoverChoices.map((choice) => (
            <ChoiceCard key={choice.id} className="op-demo" selected={hover === choice.id} onClick={() => updateTheme({ button_hover_animation: choice.id as ButtonHover })} label={choice.label}>
              {sample({}, { hover: choice.id, label: <span className="op-label">Aa</span> })} {/* i18n-ignore: a type sample */}
            </ChoiceCard>
          ))}
        </div>
        {/* Round 40: the colours Fill and Fill and lift turn to, the theme's until changed (lib/onepage/button-style buttonHoverVars). */}
        {hover === "fill" || hover === "pop" ? (
          <div className="mt-5 space-y-4" data-hover-colours="">
            <ColorRow
              label={tt("Hover fill")}
              value={theme.button_hover_fill || null}
              emptyLabel={tt("Automatic")}
              fallback={hoverFallback.fill}
              onChange={(color) => updateTheme({ button_hover_fill: color })}
              onClear={() => updateTheme({ button_hover_fill: null })}
              suggestions={["#111113", "#ffffff", theme.text_color, theme.button_color, "#d42d17", "#12695e", "#f0a24a"]}
            />
            <ColorRow
              label={tt("Hover text")}
              value={theme.button_hover_text || null}
              emptyLabel={tt("Automatic")}
              fallback={hoverFallback.text}
              onChange={(color) => updateTheme({ button_hover_text: color })}
              onClear={() => updateTheme({ button_hover_text: null })}
              suggestions={["#ffffff", "#111113", theme.button_color, theme.button_text_color]}
            />
          </div>
        ) : null}
        <p className="mt-3 text-[13px] text-[#6b7280]">{tt("To make one link stand out, use the sparkle button on that link in Links.")}</p>
      </PanelSection>
    </div>
  )
}

function SocialsSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage
  const socialStyle = socialIconStyleOf(theme as never)

  return (
    <div>
      <PanelSection>
        <SectionTitle title={tt("Icon style")} />
        <div className="grid grid-cols-3 gap-3">
          {SOCIAL_STYLES.map((style) => (
            <ChoiceCard key={style.id} selected={socialStyle === style.id} onClick={() => updateTheme({ social_icon_style: style.id } as any)} label={style.label}>
              <div className="flex h-[60px] items-center justify-center gap-1.5 rounded-xl" style={{ background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8" }}>
                {["instagram", "youtube"].map((platform) => (
                  <span
                    key={platform}
                    className="grid h-7 w-7 place-items-center"
                    /* The tile the page draws (lib/onepage/social-look), in this page's colours. */
                    style={socialTileStyle({ ...(theme as object), social_icon_style: style.id } as never, { onLight: pageGroundIsLight(theme as never) })}
                  >
                    <SocialIcon platform={platform} size={13} color={socialMarkColorOf({ ...(theme as object), social_icon_style: style.id } as never)} tone={socialIconToneOf(theme as never)} />
                  </span>
                ))}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>
      {/*
        ROUND 11: BRAND COLOURS OR ONE COLOUR. "Make them colorful, use their
        actual icons." A new page starts on brand colours (lib/onepage/ensure-
        onepage); a page made before this choice has none saved and stays one
        colour, as it looked, until its owner picks.
      */}
      <PanelSection>
        <SectionTitle title={tt("Icon colours")} />
        <div className="grid grid-cols-2 gap-3" data-social-tone-choice="">
          {([
            { id: "brand" as const, label: tt("Brand colours") },
            { id: "mono" as const, label: tt("One colour") },
          ]).map((choice) => (
            <ChoiceCard key={choice.id} selected={((theme as any).social_icon_tone === "brand" ? "brand" : "mono") === choice.id} onClick={() => updateTheme({ social_icon_tone: choice.id } as any)} label={choice.label}>
              <div className="flex h-[60px] items-center justify-center gap-1.5 rounded-xl" style={{ background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8" }}>
                {["instagram", "youtube", "spotify"].map((platform) => (
                  <span key={platform} className="grid h-7 w-7 place-items-center" style={socialTileStyle({ ...(theme as object), social_icon_tone: choice.id } as never, { onLight: pageGroundIsLight(theme as never) })}>
                    <SocialIcon platform={platform} size={13} color={socialMarkColorOf({ ...(theme as object), social_icon_tone: choice.id } as never)} tone={choice.id} />
                  </span>
                ))}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>
      <PanelSection>
        <ColorRow
          label={tt("Icon colour")}
          value={(theme as any).social_icon_color || null}
          emptyLabel={tt("Text colour")}
          fallback={theme.text_color}
          /* A colour picked while the icons wear their brands' own discs is a colour the creator wants to see (the OnePage production audit, D5): the icons take it, in one colour, instead of nothing changing. */
          onChange={(color) => updateTheme({ social_icon_color: color, ...(socialIsBrandDisc(theme as never) ? { social_icon_tone: "mono" } : {}) } as any)}
          onClear={() => updateTheme({ social_icon_color: null } as any)}
          suggestions={["#000000", "#ffffff", "#1a1a2e", theme.text_color, theme.button_color, "#e1306c"]}
        />
      </PanelSection>
    </div>
  )
}

function FooterSection({ userPlan }: { userPlan?: "free" | "growth" | "pro" | null }) {
  const { onepage, updateSettings } = useOnePage()
  if (!onepage) return null
  const { settings } = onepage

  const hideBrandingEnabled = !settings.show_branding
  const verifiedEnabled = (settings as any).verified_badge_enabled ?? false
  const userHasPaidPlan = userPlan === "growth" || userPlan === "pro"

  const handleHideBrandingChange = (hide: boolean) => {
    updateSettings({ show_branding: !hide, hide_branding_pro_enabled: hide })
  }

  const handleVerifiedBadgeChange = (enabled: boolean) => {
    updateSettings({
      verified_badge_enabled: enabled,
      ...(!enabled ? {} : { verified_badge_type: (settings as any).verified_badge_type || "verified_creator" }),
    } as any)
  }

  return (
    <div>
      <PanelSection>
        <div className="space-y-5">
          <SwitchRow
            label={tt("Hide the Storelib badge")}
            description={userHasPaidPlan ? tt("Removes “on Storelib” from the foot of your page") : tt("Preview it here; saving it needs a paid plan")}
            checked={hideBrandingEnabled}
            onChange={handleHideBrandingChange}
            extra={<ProMark title={userHasPaidPlan ? tt("Included in your plan") : "Pro"} />}
          />
          <SwitchRow
            label={tt("Verified badge")}
            description={userHasPaidPlan ? tt("A check mark beside your name") : tt("A check mark beside your name. Saving it needs a paid plan")}
            checked={verifiedEnabled}
            onChange={handleVerifiedBadgeChange}
            extra={<ProMark title={userHasPaidPlan ? tt("Included in your plan") : "Pro"} />}
          />
        </div>
      </PanelSection>
    </div>
  )
}
