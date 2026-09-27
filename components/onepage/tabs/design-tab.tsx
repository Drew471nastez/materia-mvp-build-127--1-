"use client"

import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import * as ReactModule from "react"
import { useEffect, useLayoutEffect, useState, useRef, useCallback, startTransition } from "react"
import { flushSync } from "react-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SocialIcon } from "@/components/onepage/brand-icons"
import {
  AtSign,
  ImageIcon,
  ChevronRight,
  ChevronLeft,
  CircleUserRound,
  Layers,
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
import { createClient } from "@/lib/supabase/client"
import { DialogHeader } from "@/components/ui/dialog"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { secondaryDepth } from "@/components/ui/depth-button"
import { familyOf, fontStack, onePageFontSampleHref } from "@/lib/onepage/fonts"
import { normalizeHex } from "@/lib/onepage/color"
import { WALLPAPER_PATTERNS, isPatternId, patternStyle, type PatternOpacity } from "@/lib/onepage/wallpaper"
import { WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { NATIVE_BACK_EVENT } from "@/lib/ui/native-back"
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
  ChipFill,
  ChoiceMark,
  SwatchMark,
  choiceOff,
  fieldInput,
} from "@/components/onepage/editor-kit"

type DesignSection = "header" | "theme" | "wallpaper" | "text" | "buttons" | "socials" | "footer"

// Body text fonts
const FONTS = [
  { name: "Inter", category: "sans", style: "Clean & Professional", value: "'Inter', sans-serif" },
  { name: "Poppins", category: "sans", style: "Rounded & Friendly", value: "'Poppins', sans-serif" },
  { name: "Montserrat", category: "sans", style: "Elegant & Bold", value: "'Montserrat', sans-serif" },
  { name: "Lato", category: "sans", style: "Balanced & Warm", value: "'Lato', sans-serif" },
  { name: "Open Sans", category: "sans", style: "Web Standard", value: "'Open Sans', sans-serif" },
  { name: "Roboto", category: "sans", style: "Modern & Versatile", value: "'Roboto', sans-serif" },
  { name: "Raleway", category: "sans", style: "Elegant & Thin", value: "'Raleway', sans-serif" },
  { name: "Nunito", category: "sans", style: "Soft & Rounded", value: "'Nunito', sans-serif" },
  { name: "Quicksand", category: "sans", style: "Geometric & Friendly", value: "'Quicksand', sans-serif" },
  { name: "Comfortaa", category: "sans", style: "Round & Geometric", value: "'Comfortaa', cursive" },
  { name: "DM Sans", category: "sans", style: "Modern & Clean", value: "'DM Sans', sans-serif" },
  { name: "Space Grotesk", category: "sans", style: "Geometric Modern", value: "'Space Grotesk', sans-serif" },
  { name: "Sora", category: "sans", style: "Contemporary Clean", value: "'Sora', sans-serif" },
  { name: "Playfair Display", category: "serif", style: "Elegant & Editorial", value: "'Playfair Display', serif" },
  { name: "Merriweather", category: "serif", style: "Traditional & Warm", value: "'Merriweather', serif" },
  { name: "Lora", category: "serif", style: "Classic & Readable", value: "'Lora', serif" },
  { name: "Crimson Text", category: "serif", style: "Old Style & Elegant", value: "'Crimson Text', serif" },
  { name: "Source Serif Pro", category: "serif", style: "Transitional Serif", value: "'Source Serif Pro', serif" },
  { name: "Oswald", category: "display", style: "Strong & Narrow", value: "'Oswald', sans-serif" },
  { name: "Archivo Black", category: "display", style: "Bold & Impact", value: "'Archivo Black', sans-serif" },
  { name: "Barlow Condensed", category: "display", style: "Modern Condensed", value: "'Barlow Condensed', sans-serif" },
  { name: "Dancing Script", category: "script", style: "Elegant Script", value: "'Dancing Script', cursive" },
  { name: "Caveat", category: "script", style: "Natural Handwriting", value: "'Caveat', cursive" },
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
]

/* Every name in the two lists above, drawn in its own face: one small request cut to the letters of the names (lib/onepage/fonts). */
const FONT_SAMPLE_HREF = onePageFontSampleHref([...FONTS.map((f) => f.name), ...TITLE_FONTS.map((f) => f.name)])

const FONT_CATEGORIES = [
  { id: "all", label: "All Fonts" },
  { id: "sans", label: "Sans Serif" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "script", label: "Script" },
]

const SOCIAL_STYLES = [
  { id: "filled", label: "Solid" },
  { id: "outline", label: "Outline" },
  { id: "minimal", label: "Glass" },
]

const BACKGROUND_IMAGES = [
  // Nature image (kept)
  { id: "forest", url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=95", label: "Nature" },
  // Space image (kept)
  { id: "space-stars", url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=95", label: "Space" },
  // New Supabase images
  { id: "blocks-gradient", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/download.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvZG93bmxvYWQucG5nIiwiaWF0IjoxNzY4OTA3NjA3LCJleHAiOjMzMzA0OTA3NjA3fQ.Vt9eh0yu6lOl3hlyq-e_Q1DAZnE3F6SRQmpblm43vAw", label: "Gradient Blocks" },
  { id: "abstract-pink", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/c78fa2c87ca69f52361687fa7b27b909.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvYzc4ZmEyYzg3Y2E2OWY1MjM2MTY4N2ZhN2IyN2I5MDkuanBnIiwiaWF0IjoxNzY4OTA3NjIxLCJleHAiOjUzMDA5Mzk2MjF9.9BLSE0ZAWodphCHfDfLaPIcWby-1VbznKWyzV3M1U-M", label: "Abstract Pink" },
  { id: "black-solid", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/black_background.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvYmxhY2tfYmFja2dyb3VuZC5qcGciLCJpYXQiOjE3Njg5MDc2MzYsImV4cCI6Mzg4NDg1OTY1OTYzNn0.gP0xzyavmUb1e_s-3JMarX7TEUEgBCMn7c1-m_fLL7U", label: "Black" },
  { id: "dark-texture", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/b607af5996db7b6b9af70e1a777aa808.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvYjYwN2FmNTk5NmRiN2I2YjlhZjcwZTFhNzc3YWE4MDguanBnIiwiaWF0IjoxNzY4OTA3NjUyLCJleHAiOjYwMjYyNjc2NTJ9.axmEhvQleebXMWfojRjrou7-p74GKbtSlvbpVGY8mjA", label: "Dark Texture" },
  { id: "gradient-warm", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/510e061be1f3d8c7a56a9cff56c8ae24.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvNTEwZTA2MWJlMWYzZDhjN2E1NmE5Y2ZmNTZjOGFlMjQuanBnIiwiaWF0IjoxNzY4OTA3NjY3LCJleHAiOjEwNzQ0NjA0MzY2N30.jnvnqbf6FRqvyIDIx0tYz9kOyNWLGHEi-DyiQfRLX0o", label: "Warm Gradient" },
  { id: "fusion-gradient", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/3513ccb7c260ffd3f3662776ca8ac9e0.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvMzUxM2NjYjdjMjYwZmZkM2YzNjYyNzc2Y2E4YWM5ZTAuanBnIiwiaWF0IjoxNzY4OTA3Njc5LCJleHAiOjU2NDc4MzU2Nzl9.mNyFEKqxNOBl82EwxJrGPy_gC4bX31cnczX_zGgRt6k", label: "Fusion" },
  { id: "blue-texture", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/214ffad10a8306624600af8823503d46.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvMjE0ZmZhZDEwYTgzMDY2MjQ2MDBhZjg4MjM1MDNkNDYuanBnIiwiaWF0IjoxNzY4OTA3Njg5LCJleHAiOjYwMjYyNjc2ODl9.iymmMjpCYELdPQqT_BbfAOWDFSngkYtx4ssuE9Pid2g", label: "Blue Texture" },
  { id: "abstract-dark", url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/19fef3f73560866d37752eb95418f4bb.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvMTlmZWYzZjczNTYwODY2ZDM3NzUyZWI5NTQxOGY0YmIuanBnIiwiaWF0IjoxNzY4OTA3Njk5LCJleHAiOjM5MzI1NjgxMTY5OX0.ThQFYyEylNyx07kOmK9oBiZ9JqqCNHeFJJ-zZAa_7R8", label: "Abstract Dark" },
]

/*
  THE THEMES. Each one a different kind of page, not the same page in
  another colour: paper and ink (Studio, Cream, Riso), a bold block of
  colour with hard shadows (Blocks), warm and cool gradients (Sunset, Peach,
  Ocean, Aurora), quiet darks (Olive, Astrid, Night, Midnight, Space), one
  loud one (Neon) and two photographs. No violet: Blocks was a violet to pink
  gradient, Aurora violet glass, Night a violet black with lilac buttons and
  Fusion violet buttons; each is now its own thing under the same name, so a
  page that chose one keeps the id it saved. What a page has saved is its own
  copy of the settings and is not touched. Riso and Olive are new. Only
  settings the editor already has, so each can be changed piece by piece.
*/
export const THEME_TEMPLATES = [
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
      secondary_text_color: "#6b7280",
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
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: true,
      laser_glow_color: "#dbdbdb",
      laser_glow_intensity: "medium",
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
      secondary_text_color: "#78716c",
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
    },
    profile_layout: "classic" as const,
    light_button_text_color: "#1c1917",
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
      secondary_text_color: "#78716c",
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
      background_pattern: "zigzag",
      pattern_color: "#e2dc9c90",
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
      secondary_text_color: "#4b5fb8",
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
    },
    solid_button_text_color: "#111111",
    outline_button_text_color: "#111111",
    glass_button_text_color: "#111111",
    light_button_text_color: "#111111",
    share_style: "black",
    subscribe_style: "black",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#e98a64",
      background_gradient: "linear-gradient(180deg, #f7c59f 0%, #e98a64 55%, #c4553b 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#fde8dc",
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
    },
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
      secondary_text_color: "#7c2d12",
      button_color: "rgba(255, 255, 255, 0.55)",
      button_text_color: "#431407",
      button_style: "glass" as const,
      button_border_radius: 999,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.7)",
      button_shadow: "subtle",
      font_family: "'Poppins', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#431407",
      social_icon_color: "#431407",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
    light_button_text_color: "#431407",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0ea5e9",
      background_gradient: "linear-gradient(180deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#bae6fd",
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
      background_gradient: "linear-gradient(165deg, #04110f 0%, #0b3a33 50%, #1d7a63 100%)",
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
    },
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
      button_border_radius: 999,
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
      laser_glow_enabled: true,
      laser_glow_color: "#303030",
      laser_glow_intensity: "medium",
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
      laser_glow_enabled: true,
      laser_glow_color: "#2b3542",
      laser_glow_intensity: "medium",
    },
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
    },
    profile_layout: "hero" as const,
    // Neon theme uses glassmorphism for share/subscribe buttons
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
      // Wallpaper settings: 40% brightness and 30% noise strength
      image_brightness: 40,
      image_noise: true,
      noise_strength: 30,
    },
  },
  {
    id: "fusion",
    name: "Fusion",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#0f0f1a",
      background_gradient: "",
      background_image_url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/wallpapers%20blocks/3513ccb7c260ffd3f3662776ca8ac9e0.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvd2FsbHBhcGVycyBibG9ja3MvMzUxM2NjYjdjMjYwZmZkM2YzNjYyNzc2Y2E4YWM5ZTAuanBnIiwiaWF0IjoxNzY4OTA4Mjg2LCJleHAiOjM5NDg1NjIzODAyODZ9.gt2phg6Tkw-z5_Q-F4kqhDchEmd3eOupUWxohGQLmM0",
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
      // Wallpaper settings: 60% brightness and 40% noise strength
      image_brightness: 60,
      image_noise: true,
      noise_strength: 40,
    },
    profile_layout: "classic" as const,
    // Fusion theme uses glassmorphism for share/subscribe buttons
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
]

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
  theme: "Theme",
  header: "Header",
  wallpaper: "Wallpaper",
  text: "Text",
  buttons: "Buttons",
  socials: "Social icons",
  footer: "Footer",
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
 *  A PANEL IS PUSHED IN, AND POPPED BACK OUT
 * ===========================================================================
 * Opening a row and going back swapped one for the other in a single frame,
 * and back always landed at the top of the list. Now it is a navigation
 * stack, as on an iPhone: the panel slides in from the right over the list
 * while the list moves a little to the left and dims under it; back plays
 * it the other way, to the place in the list that was left. On a phone a
 * finger from the left edge of a panel pulls it back the same way, and
 * lets it go back or springs it home.
 *
 * On a computer, where the list is a column beside the phone preview and
 * not the whole screen, the two pages go side by side instead (SIDE BY
 * SIDE ON A COMPUTER below): scripts/check-onepage-design-push.mjs.
 *
 * Both pages are drawn only while they move. At rest the list is kept (its
 * state, not its pixels: `display: none`). Transform and opacity only, on
 * the compositor.
 *
 * ONE MOTION PER PRESS. "Themes, back, Themes again, back: a double
 * refresh." It was two motions (scripts/check-onepage-editor-nav.mjs): the
 * page slid in with only its title, and 40 to 70ms later what was in it
 * was built and faded in over 180ms, so every open arrived twice, and the
 * first one showed a page with nothing in it for four frames. Now the
 * panels are kept, as the editor keeps its tabs: each is built once, while
 * the page is idle (or on the tap, if that comes first), and kept in
 * React's <Activity> while another panel or the list is showing. A press
 * shows the one it opens and starts the slide with the page already whole:
 * one motion in, one out, nothing built or faded on the way.
 */
type DesignPage = DesignSection | "home"
/* React 19.2's <Activity>, as the editor's tabs use it. The installed types are 19.0's, which do not name it yet; the runtime has it. */
const Activity = (ReactModule as unknown as {
  Activity: React.ComponentType<{ mode: "visible" | "hidden"; children?: React.ReactNode }>
}).Activity
/** Every panel, in the order the list names them, which is the order they are built in while the page is idle. */
const DESIGN_SECTIONS = Object.keys(SECTION_LABEL) as DesignSection[]
/** iOS's push: 360ms on its own curve, the page under it moving about a quarter as far. */
const PUSH_MS = 360
const PUSH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const UNDER_SHIFT = 0.28
/** On a computer the two pages go side by side, the list all the way out, on a curve with no long tail. */
const SIDE_MS = 300
const SIDE_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** Where the pages go side by side: from 768px, where the list is not the whole screen (the dim is `md:hidden` for the same reason). */
const SIDE_QUERY = "(min-width: 768px)"
/** How dark the list goes under a panel: a shade, not a scrim. */
const UNDER_DIM = 0.07
/** A finger that starts this close to a panel's left edge is taking it back. */
const EDGE_PX = 28

/**
 * `top` places the page leaving (or, pulled by a finger, the list under the
 * panel) where it was on screen. `panelMin` and `listMin` are how tall each
 * must be to reach the bottom of the screen while they move, so a short
 * page never leaves the other showing, undimmed, below it.
 *
 * THE PAGE LEAVING IS CUT AT THE BOTTOM OF THE SCREEN. It is that tall and
 * no taller (its height, not its least height, and `overflow: clip`), so
 * a long page leaving (Theme, back to the list) never makes the column
 * taller than the page arriving needs: the column's scrollbar came in for
 * the move and went again at its end ("a scrollbar flash"), and where a
 * scrollbar takes room, the column went narrower and wider with it.
 */
type Move = { from: DesignPage; to: DesignPage; top: number; panelMin: number; listMin: number; peek?: boolean }

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
  const dimRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef(section)
  /* Where the list was scrolled to when a panel covered it. */
  const listScroll = useRef(0)
  /* The pages moving now: `top` places the one leaving where it was on screen. */
  const [move, setMove] = useState<Move | null>(null)
  /* The panels built so far, kept (see BUILT WHILE NOTHING ELSE IS HAPPENING below). */
  const [built, setBuilt] = useState<DesignSection[]>(() => (section ? [section] : []))
  const scrollerOf = () => rootRef.current?.closest<HTMLElement>("[data-scroll-container]") ?? null

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
    setMove({ from: current ?? "home", to: next ?? "home", top: arriveAt - y, panelMin: screen + (next ? 0 : y), listMin: screen + listScroll.current })
    setSectionState(next)
    setWarm(null)
    /* A panel not built yet (a tap before the page was idle) is built on the tap, whole, and the slide waits for it. */
    if (next) setBuilt((b) => (b.includes(next) ? b : [...b, next]))
    remember(next)
  }, [])

  /*
    READIED WHILE THE FINGER IS DOWN. A kept panel still has to be styled
    and laid out when it is shown (Theme: 150ms on a phone slowed four
    times, 40ms at full speed), and the slide cannot start before that. A
    finger rests on a row for 50 to 150ms before it lifts, so the row's
    panel is drawn then, out of sight and taking no room, at a priority the
    lift overtakes. By the lift it is laid out and only has to move. A
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
    slide waited for them, and built after it, the page arrived empty and
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
    The move itself, drawn before the browser paints the first frame of it.

    THE LAST FRAME IS HELD UNTIL REACT HAS DRAWN THE PAGE AT REST. The
    animations held nothing (`fill: none`), so in the frame they finished
    the page leaving jumped back to where it stands when nothing moves it,
    over the page arriving, and stayed there until React's commit hid it a
    frame or two later: back from Theme showed Theme whole again for two
    frames before the list. Now each animation holds its last frame
    (`fill: both`) and is let go in the layout effect of the commit that
    ends the move, before that commit is painted.
  */
  const animating = useRef<Animation[]>([])
  useLayoutEffect(() => {
    if (!move) {
      animating.current.forEach((a) => a.cancel())
      animating.current = []
      return
    }
    if (move.peek) return
    const scroller = scrollerOf()
    if (scroller) scroller.scrollTop = move.to === "home" ? listScroll.current : 0
    const list = listRef.current
    const panel = panelRef.current
    const dim = dimRef.current
    let anims: Animation[] = []
    const done = () => {
      if (animating.current !== anims) return
      setMove((m) => (m === move ? null : m))
    }
    if (!list || !panel || typeof panel.animate !== "function" || reducedMotion()) {
      animating.current.forEach((a) => a.cancel())
      animating.current = anims
      done()
      return
    }
    const pushing = move.to !== "home"
    /* A move still running (back pressed mid-push) is taken from where it is. */
    const w = panel.offsetWidth || 1
    const running = animating.current.length > 0
    const panelFrom = running ? new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41 / w : pushing ? 1 : 0
    animating.current.forEach((a) => a.cancel())
    const panelTo = pushing ? 0 : 1
    /*
      SIDE BY SIDE ON A COMPUTER. The phone's push (the list moving a
      quarter as far, under the panel) was played in the 630px column as
      well, where the panel stood in from the right over a list cut off at
      the left, and the curve's long tail left a strip of the panel at the
      column's edge for a fifth of a second. From 768px the two pages are
      the column wide and travel together, the list's right edge on the
      panel's left edge, on a curve that is done when it looks done.
    */
    const side = !!window.matchMedia?.(SIDE_QUERY).matches
    const shift = side ? 1 : UNDER_SHIFT
    const at = (p: number) => `translate3d(${(p * 100).toFixed(3)}%, 0, 0)`
    const under = (p: number) => `translate3d(${(-(1 - p) * shift * 100).toFixed(3)}%, 0, 0)`
    const duration = (side ? SIDE_MS : PUSH_MS) * Math.max(0.35, Math.abs(panelTo - panelFrom))
    const timing: KeyframeAnimationOptions = { duration, easing: side ? SIDE_EASE : PUSH_EASE, fill: "both" }
    anims = [
      panel.animate([{ transform: at(panelFrom) }, { transform: at(panelTo) }], timing),
      list.animate([{ transform: under(panelFrom) }, { transform: under(panelTo) }], timing),
    ]
    if (dim && !side) anims.push(dim.animate([{ opacity: (1 - panelFrom) * UNDER_DIM }, { opacity: (1 - panelTo) * UNDER_DIM }], timing))
    animating.current = anims
    anims[0].onfinish = done
    const timer = window.setTimeout(done, duration + 250)
    return () => window.clearTimeout(timer)
  }, [move])

  /* ── A finger from the left edge takes the panel back (a phone) ─────── */
  /*
    The edge is a strip of its own, 20px wide down the panel's left side on
    a phone, that takes its finger (`touch-action: none`), so the panel's
    scrolling is left to the browser everywhere else and no touch listener
    anywhere holds a scroll up waiting for script. Pointer events, captured.
  */
  const peekRef = useRef<{ id: number; x0: number; y0: number; w: number; dragging: boolean; samples: { t: number; x: number }[] } | null>(null)
  const restoreList = useRef(false)
  const drawPeek = (p: number) => {
    /* p: how far the panel has gone, 0 (covering) to 1 (gone). */
    const panel = panelRef.current
    const list = listRef.current
    const dim = dimRef.current
    if (panel) panel.style.transform = `translate3d(${(p * 100).toFixed(3)}%, 0, 0)`
    if (list) list.style.transform = `translate3d(${(-(1 - p) * UNDER_SHIFT * 100).toFixed(3)}%, 0, 0)`
    if (dim) dim.style.opacity = String((1 - p) * UNDER_DIM)
  }
  const clearPeek = () => {
    for (const el of [panelRef.current, listRef.current]) if (el) el.style.transform = ""
    if (dimRef.current) dimRef.current.style.opacity = ""
  }
  const onEdgeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || animating.current.length || !sectionRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    peekRef.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w: panelRef.current?.offsetWidth || window.innerWidth, dragging: false, samples: [{ t: e.timeStamp, x: e.clientX }] }
  }
  const onEdgeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = peekRef.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0
    if (!g.dragging) {
      const dy = e.clientY - g.y0
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      /* Up, down or to the left is not a way back. */
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) { peekRef.current = null; return }
      g.dragging = true
      g.x0 = e.clientX
      /* The list is drawn under the panel, where it was left, before the finger moves it. */
      const scroller = scrollerOf()
      const y = scroller?.scrollTop ?? 0
      const screen = scroller?.clientHeight ?? 0
      flushSync(() => setMove({ from: sectionRef.current ?? "home", to: sectionRef.current ?? "home", top: y - listScroll.current, panelMin: screen + y, listMin: screen + listScroll.current, peek: true }))
    }
    g.samples.push({ t: e.timeStamp, x: e.clientX })
    if (g.samples.length > 8) g.samples.shift()
    drawPeek(Math.max(0, Math.min(1, (e.clientX - g.x0) / g.w)))
  }
  const onEdgeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = peekRef.current
    peekRef.current = null
    if (!g || e.pointerId !== g.id || !g.dragging) return
    const last = g.samples[g.samples.length - 1]
    const first = g.samples.find((s) => last.t - s.t <= 80) ?? g.samples[0]
    const v = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
    const p = Math.max(0, Math.min(1, (last.x - g.x0) / g.w))
    /* Past 40% of the way, or let go moving right: back. */
    const back = e.type !== "pointercancel" && (p > 0.4 || v > 0.45)
    const to = back ? 1 : 0
    const timing = { duration: Math.max(140, PUSH_MS * Math.abs(to - p)), easing: PUSH_EASE }
    const panel = panelRef.current
    const list = listRef.current
    const dim = dimRef.current
    const anims: Animation[] = []
    if (panel) anims.push(panel.animate([{ transform: `translate3d(${p * 100}%, 0, 0)` }, { transform: `translate3d(${to * 100}%, 0, 0)` }], timing))
    if (list) anims.push(list.animate([{ transform: `translate3d(${-(1 - p) * UNDER_SHIFT * 100}%, 0, 0)` }, { transform: `translate3d(${-(1 - to) * UNDER_SHIFT * 100}%, 0, 0)` }], timing))
    if (dim) anims.push(dim.animate([{ opacity: (1 - p) * UNDER_DIM }, { opacity: (1 - to) * UNDER_DIM }], timing))
    drawPeek(to)
    animating.current = anims
    const settle = () => {
      if (animating.current !== anims) return
      animating.current = []
      if (back) {
        /* The list becomes the page, at its place; the finger's styles go once React has drawn that. */
        restoreList.current = true
        sectionRef.current = null
        setSectionState(null)
        remember(null)
      }
      setMove(null)
      if (!back) clearPeek()
    }
    if (anims[0]) anims[0].onfinish = settle
    else settle()
  }
  /* After a pull back has become the list: its place, and nothing left of the finger. */
  useLayoutEffect(() => {
    if (!restoreList.current || section) return
    restoreList.current = false
    clearPeek()
    const scroller = scrollerOf()
    if (scroller) scroller.scrollTop = listScroll.current
  }, [section])

  if (!onepage) return null
  const { theme, settings } = onepage
  const t = theme as any
  const templateName = THEME_TEMPLATES.find((x) => x.id === theme.template_id)?.name
  const bodyFont = FONTS.find((f) => familyOf(f.value) === familyOf(theme.font_family))?.name || familyOf(theme.font_family) || "Inter"
  const titleFont = t.title_font ? familyOf(t.title_font) : null
  const patternName = isPatternId(t.background_pattern) && (theme.background_type === "solid" || theme.background_type === "gradient") ? WALLPAPER_PATTERNS.find((x) => x.id === t.background_pattern)?.name.toLowerCase() : null
  const wallpaperSummary =
    theme.background_type === "gradient" ? `Gradient${patternName ? `, ${patternName}` : t.gradient_noise ? ", with grain" : ""}` :
    theme.background_type === "image" ? (theme.background_image_url ? "Image" : "Image, none chosen yet") :
    theme.background_type === "video" ? "Video" :
    `Fill, ${(normalizeHex(theme.background_color) || theme.background_color || "").toUpperCase()}${patternName ? `, ${patternName}` : ""}`
  const swatch = (bg: string) => <span aria-hidden className="h-7 w-7 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" style={{ background: bg }} />

  /* Which panel is drawn: the one open, or the one on its way out. */
  const shownSection: DesignSection | null = section ?? (move && move.from !== "home" ? move.from : null)
  /* And, out of sight, the one a finger is resting on. */
  const drawnSection: DesignSection | null = shownSection ?? warm
  const listCurrent = !section
  const listMoving = !!move && (move.from === "home" || move.to === "home" || !!move.peek)
  const panelMoving = !!move
  /* The page leaving sits where it was on screen; the page arriving is in the flow. */
  const leavingStyle = (top: number): React.CSSProperties => ({ position: "absolute", left: 0, right: 0, top, zIndex: 0 })
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
    column's edges.
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
            ? { position: "relative", zIndex: 0, minHeight: move ? move.listMin : undefined }
            : listMoving
              ? { ...leavingStyle(move!.top), height: move!.listMin, overflow: "clip" }
              : { display: "none" }
        }
      >
        {FONT_SAMPLE_HREF ? <link rel="stylesheet" href={FONT_SAMPLE_HREF} /> : null}
        <div className={readingClass}>
          <PanelHeader title="Design" />
          <nav aria-label="Design" className="flex flex-col" onPointerDown={onRowDown} onPointerCancel={onRowCancel}>
            <NavRow dataKey="theme" icon={Layers} title="Theme" subtitle={templateName || "Your own"} onClick={() => setSection("theme")} />
            <NavRow dataKey="header" icon={CircleUserRound} title="Header" subtitle={`${(t.header_layout || "classic") === "hero" ? "Hero" : "Classic"} layout, ${t.title_style === "logo" ? "logo title" : "text title"}`} onClick={() => setSection("header")} />
            <NavRow
              dataKey="wallpaper"
              icon={PaintBucket}
              title="Wallpaper"
              subtitle={wallpaperSummary}
              trailing={theme.background_type === "solid" || theme.background_type === "gradient" ? swatch(theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color) : null}
              onClick={() => setSection("wallpaper")}
            />
            <NavRow
              dataKey="text"
              icon={Type}
              title="Text"
              subtitle={<span style={{ fontFamily: fontStack(theme.font_family) }}>{titleFont && titleFont !== bodyFont ? `${bodyFont}, titles in ${titleFont}` : bodyFont}</span>}
              onClick={() => setSection("text")}
            />
            <NavRow dataKey="buttons" icon={RectangleHorizontal} title="Buttons" subtitle={`${theme.button_style === "filled" ? "Solid" : theme.button_style === "outline" ? "Outline" : "Glass"}, ${theme.button_border_radius ?? 8}px corners`} trailing={swatch(theme.button_color)} onClick={() => setSection("buttons")} />
            <NavRow dataKey="socials" icon={AtSign} title="Social icons" subtitle={SOCIAL_STYLES.find((x) => x.id === (t.social_icon_style || "filled"))?.label || "Solid"} onClick={() => setSection("socials")} />
            <NavRow dataKey="footer" icon={PanelBottom} title="Footer" subtitle={settings.show_branding === false ? "Storelib badge hidden" : "Storelib badge shown"} onClick={() => setSection("footer")} />
          </nav>
        </div>
        {/* The shade the list takes under a panel: on a phone, where the list is the whole screen; on a computer it would be a grey card in a white pane. */}
        <div ref={dimRef} aria-hidden data-design-dim="" className="pointer-events-none absolute inset-0 bg-[#1a1a2e] md:hidden" style={{ opacity: 0 }} />
      </div>
      {/*
        The panel page: one element for every panel, always there, so what
        slides is the page itself and never a page being made. With no panel
        open it is not drawn. Its panels are kept in <Activity>: the one
        showing is visible, the rest keep their state out of sight.
      */}
      <div
        ref={panelRef}
        data-design-panel={shownSection ?? undefined}
        inert={!shownSection || section !== shownSection}
        aria-hidden={shownSection ? undefined : true}
        /* An edge to the page while it moves over the list on a phone: a hairline and a soft shade. Side by side on a computer, nothing is under it. */
        className={cn(pageClass, panelMoving && "max-md:shadow-[-1px_0_0_rgba(26,26,46,0.05),-16px_0_32px_-12px_rgba(26,26,46,0.14)]")}
        style={
          shownSection
            ? {
                ...(section === shownSection
                  ? /* Moving, it covers the list under it to the bottom of the screen, however short it is. */
                    { position: "relative", minHeight: panelMoving ? move?.panelMin : undefined }
                  : { ...leavingStyle(move ? move.top : 0), height: move?.panelMin, overflow: "clip" }),
                zIndex: 1,
              }
            : drawnSection
              ? /* Readied under a finger: laid out, but unseen, untouchable, and taking no room from the list's scroll. */
                { position: "absolute", left: 0, right: 0, top: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none", zIndex: -1 }
              : { display: "none" }
        }
      >
        {shownSection && section === shownSection ? (
          <div
            aria-hidden
            data-edge-back=""
            className="absolute -left-0 bottom-0 top-0 z-[2] w-5 md:hidden"
            style={{ touchAction: "none" }}
            onPointerDown={onEdgeDown}
            onPointerMove={onEdgeMove}
            onPointerUp={onEdgeUp}
            onPointerCancel={onEdgeUp}
          />
        ) : null}
        <div className={readingClass}>
          {drawnSection ? <PanelHeader title={SECTION_LABEL[drawnSection]} onBack={() => setSection(null)} backLabel="Back to Design" /> : null}
          {DESIGN_SECTIONS.filter((id) => built.includes(id)).map((id) => (
            <Activity key={id} mode={id === drawnSection ? "visible" : "hidden"}>
              <div data-panel-body={id}>
                {id === "header" && <HeaderSection />}
                {id === "theme" && <ThemeSection />}
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

function HeaderSection() {
  const { onepage, updateProfile, updateTheme } = useOnePage()
  /* Its questions and pickers are the shared sheet on a phone (components/ui/sheet-dialog). */
  const sheetPhone = usePhone()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [tempImageFile, setTempImageFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  
  // Video selection states
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showVideoCropModal, setShowVideoCropModal] = useState(false)
  const [tempVideoUrl, setTempVideoUrl] = useState<string | null>(null)
  const [tempVideoFile, setTempVideoFile] = useState<File | null>(null)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const videoFileInputRef = useRef<HTMLInputElement>(null)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const videoCropContainerRef = useRef<HTMLDivElement>(null)
  
  // Video crop state
  const [videoCropBox, setVideoCropBox] = useState({ x: 10, y: 10, width: 80, height: 80 })
  const [isVideoDragging, setIsVideoDragging] = useState(false)
  const [isVideoResizing, setIsVideoResizing] = useState<string | null>(null)
  const [videoDragStart, setVideoDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 })

  // Crop box state
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Logo upload/crop states
  const [showLogoUploadModal, setShowLogoUploadModal] = useState(false)
  const [showLogoCropModal, setShowLogoCropModal] = useState(false)
  const [tempLogoUrl, setTempLogoUrl] = useState<string | null>(null)
  const [tempLogoFile, setTempLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const logoCropContainerRef = useRef<HTMLDivElement>(null)

  // Logo crop state - percentage based like video cropper
  const [logoCropBox, setLogoCropBox] = useState({ x: 10, y: 10, width: 80, height: 80 })
  const [isLogoDragging, setIsLogoDragging] = useState(false)
  const [isLogoResizing, setIsLogoResizing] = useState<string | null>(null)
  const [logoDragStart, setLogoDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })
  const [logoImageSize, setLogoImageSize] = useState({ width: 0, height: 0 })

  // Pattern/Hero conflict dialog state
  const [showPatternHeroConflict, setShowPatternHeroConflict] = useState(false)


  if (!onepage) return null

  const { theme } = onepage
  const headerLayout = (theme as any).header_layout || "classic"
  const effectiveLayout = (theme.background_type === "image" || theme.background_type === "video") ? "classic" : headerLayout
  const avatarVideoUrl = (onepage as any).avatar_video_url

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      console.log("No file selected")
      return
    }
    
    console.log("Video file selected:", file.name, file.type, file.size)
    
    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg']
    if (!validTypes.includes(file.type) && !file.type.startsWith('video/')) {
      alert('Please select a valid video file (MP4, WebM, or MOV)')
      return
    }
    
    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('Video file must be less than 100MB')
      return
    }
    
    const url = URL.createObjectURL(file)
    console.log("Created blob URL:", url)
    setTempVideoUrl(url)
    setTempVideoFile(file)
    setVideoCropBox({ x: 10, y: 10, width: 80, height: 80 }) // Reset crop box
    setShowVideoModal(false)
    setShowVideoCropModal(true)
    
    // Reset file input for next selection
    e.target.value = ''
  }

  // Video crop drag handlers
  const handleVideoCropMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize', corner?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const container = videoCropContainerRef.current
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    
    setVideoDragStart({ 
      x, 
      y, 
      boxX: videoCropBox.x, 
      boxY: videoCropBox.y, 
      boxW: videoCropBox.width, 
      boxH: videoCropBox.height 
    })
    
    if (type === 'drag') {
      setIsVideoDragging(true)
    } else {
      setIsVideoResizing(corner || null)
    }
  }

  const handleVideoCropMouseMove = useCallback((e: MouseEvent) => {
    const container = videoCropContainerRef.current
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    
    if (isVideoDragging) {
      const deltaX = x - videoDragStart.x
      const deltaY = y - videoDragStart.y
      
      let newX = videoDragStart.boxX + deltaX
      let newY = videoDragStart.boxY + deltaY
      
      // Constrain to container
      newX = Math.max(0, Math.min(100 - videoCropBox.width, newX))
      newY = Math.max(0, Math.min(100 - videoCropBox.height, newY))
      
      setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
    } else if (isVideoResizing) {
      const deltaX = x - videoDragStart.x
      const deltaY = y - videoDragStart.y
      
      let newBox = { ...videoCropBox }
      
      if (isVideoResizing.includes('right')) {
        newBox.width = Math.max(20, Math.min(100 - videoDragStart.boxX, videoDragStart.boxW + deltaX))
      }
      if (isVideoResizing.includes('left')) {
        const newWidth = Math.max(20, videoDragStart.boxW - deltaX)
        const maxX = videoDragStart.boxX + videoDragStart.boxW - 20
        newBox.x = Math.max(0, Math.min(maxX, videoDragStart.boxX + deltaX))
        newBox.width = videoDragStart.boxX + videoDragStart.boxW - newBox.x
      }
      if (isVideoResizing.includes('bottom')) {
        newBox.height = Math.max(20, Math.min(100 - videoDragStart.boxY, videoDragStart.boxH + deltaY))
      }
      if (isVideoResizing.includes('top')) {
        const newHeight = Math.max(20, videoDragStart.boxH - deltaY)
        const maxY = videoDragStart.boxY + videoDragStart.boxH - 20
        newBox.y = Math.max(0, Math.min(maxY, videoDragStart.boxY + deltaY))
        newBox.height = videoDragStart.boxY + videoDragStart.boxH - newBox.y
      }
      
      setVideoCropBox(newBox)
    }
  }, [isVideoDragging, isVideoResizing, videoDragStart, videoCropBox])

  const handleVideoCropMouseUp = useCallback(() => {
    setIsVideoDragging(false)
    setIsVideoResizing(null)
  }, [])

  // Touch handlers for video cropper
  const handleVideoCropTouchStart = (e: React.TouchEvent, type: 'drag' | 'resize', corner?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    const container = videoCropContainerRef.current
    if (!container || !touch) return

    const rect = container.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100

    setVideoDragStart({
      x,
      y,
      boxX: videoCropBox.x,
      boxY: videoCropBox.y,
      boxW: videoCropBox.width,
      boxH: videoCropBox.height
    })

    if (type === 'drag') {
      setIsVideoDragging(true)
    } else {
      setIsVideoResizing(corner || null)
    }
  }

  const handleVideoCropTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    const container = videoCropContainerRef.current
    if (!container || !touch) return

    e.preventDefault()
    const rect = container.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100

    if (isVideoDragging) {
      const deltaX = x - videoDragStart.x
      const deltaY = y - videoDragStart.y

      let newX = videoDragStart.boxX + deltaX
      let newY = videoDragStart.boxY + deltaY

      newX = Math.max(0, Math.min(100 - videoCropBox.width, newX))
      newY = Math.max(0, Math.min(100 - videoCropBox.height, newY))

      setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
    } else if (isVideoResizing) {
      const deltaX = x - videoDragStart.x
      const deltaY = y - videoDragStart.y

      let newBox = { ...videoCropBox }

      if (isVideoResizing.includes('right')) {
        newBox.width = Math.max(20, Math.min(100 - videoDragStart.boxX, videoDragStart.boxW + deltaX))
      }
      if (isVideoResizing.includes('left')) {
        const newWidth = Math.max(20, videoDragStart.boxW - deltaX)
        const maxX = videoDragStart.boxX + videoDragStart.boxW - 20
        newBox.x = Math.max(0, Math.min(maxX, videoDragStart.boxX + deltaX))
        newBox.width = videoDragStart.boxX + videoDragStart.boxW - newBox.x
      }
      if (isVideoResizing.includes('bottom')) {
        newBox.height = Math.max(20, Math.min(100 - videoDragStart.boxY, videoDragStart.boxH + deltaY))
      }
      if (isVideoResizing.includes('top')) {
        const newHeight = Math.max(20, videoDragStart.boxH - deltaY)
        const maxY = videoDragStart.boxY + videoDragStart.boxH - 20
        newBox.y = Math.max(0, Math.min(maxY, videoDragStart.boxY + deltaY))
        newBox.height = videoDragStart.boxY + videoDragStart.boxH - newBox.y
      }

      setVideoCropBox(newBox)
    }
  }, [isVideoDragging, isVideoResizing, videoDragStart, videoCropBox])

  const handleVideoCropTouchEnd = useCallback(() => {
    setIsVideoDragging(false)
    setIsVideoResizing(null)
  }, [])

  useEffect(() => {
    if (isVideoDragging || isVideoResizing) {
      window.addEventListener('mousemove', handleVideoCropMouseMove)
      window.addEventListener('mouseup', handleVideoCropMouseUp)
      window.addEventListener('touchmove', handleVideoCropTouchMove, { passive: false })
      window.addEventListener('touchend', handleVideoCropTouchEnd)
      return () => {
        window.removeEventListener('mousemove', handleVideoCropMouseMove)
        window.removeEventListener('mouseup', handleVideoCropMouseUp)
        window.removeEventListener('touchmove', handleVideoCropTouchMove)
        window.removeEventListener('touchend', handleVideoCropTouchEnd)
      }
    }
  }, [isVideoDragging, isVideoResizing, handleVideoCropMouseMove, handleVideoCropMouseUp, handleVideoCropTouchMove, handleVideoCropTouchEnd])

  const handleVideoCropSave = async () => {
    if (!tempVideoUrl) return
    setUploadingVideo(true)
    
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Please sign in to upload videos')
        setUploadingVideo(false)
        return
      }

      let finalVideoUrl = tempVideoUrl

      // If it's a file upload, upload to storage
      if (tempVideoFile) {
        const fileExt = tempVideoFile.name.split('.').pop() || 'mp4'
        const fileName = `${user.id}/avatar-video-${Date.now()}.${fileExt}`
        
        console.log("Uploading video to onepage-assets bucket:", fileName)
        
        const { error: uploadError } = await supabase.storage
          .from("onepage-assets")
          .upload(fileName, tempVideoFile, { 
            upsert: true,
            contentType: tempVideoFile.type
          })
        
        if (uploadError) {
          console.error("Upload error:", uploadError)
          alert(`Failed to upload video: ${uploadError.message}. Please make sure the storage bucket is configured correctly by running the SQL migration.`)
          setUploadingVideo(false)
          return
        }
        
        const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
        finalVideoUrl = publicUrl
        console.log("Video uploaded successfully:", finalVideoUrl)
      }
      
      // Update the profile with video URL and crop data, clear image when uploading video
      updateProfile({ avatar_video_url: finalVideoUrl, avatar_video_crop: videoCropBox, avatar_url: null })
      
      setShowVideoCropModal(false)
      setTempVideoUrl(null)
      setTempVideoFile(null)
    } catch (error) {
      console.error("Video save error:", error)
      alert('Failed to save video. Please try again.')
    } finally {
      setUploadingVideo(false)
    }
  }

  const handleRemoveVideo = async () => {
    updateProfile({ avatar_video_url: null })
    setShowEditModal(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setTempImageUrl(url)
    setTempImageFile(file)
    setShowUploadModal(false)
    setShowCropModal(true)
    
    // Load image to get dimensions and set initial crop box
    const img = new Image()
    img.onload = () => {
      const containerSize = 300
      const scale = Math.min(containerSize / img.width, containerSize / img.height)
      const displayWidth = img.width * scale
      const displayHeight = img.height * scale
      setImageSize({ width: displayWidth, height: displayHeight })
      
      // Initial crop box centered and sized to fit
      const initialSize = Math.min(displayWidth, displayHeight) * 0.8
      setCropBox({
        x: (displayWidth - initialSize) / 2,
        y: (displayHeight - initialSize) / 2,
        size: initialSize
      })
    }
    img.src = url
  }

  const handleCropSave = async () => {
    if (!tempImageFile || !tempImageUrl) return
    setUploading(true)
    
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = tempImageUrl
      })

      // Calculate the actual image coordinates from the crop box
      const containerSize = 300
      const scale = Math.min(containerSize / img.width, containerSize / img.height)
      
      // Convert crop box coordinates back to original image coordinates
      const actualX = cropBox.x / scale
      const actualY = cropBox.y / scale
      const actualSize = cropBox.size / scale

      // Output size for high quality
      const outputSize = 800
      canvas.width = outputSize
      canvas.height = outputSize

      if (ctx) {
        // Draw the cropped portion at high quality
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(
          img, 
          actualX, actualY, actualSize, actualSize,
          0, 0, outputSize, outputSize
        )
      }

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.95)
      })

      const fileName = `${user.id}/avatar-${Date.now()}.jpg`
      const { error } = await supabase.storage.from("onepage-assets").upload(fileName, blob, { upsert: true })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
      // Clear video when uploading an image to replace it
      updateProfile({ avatar_url: publicUrl, avatar_video_url: null })
      setShowCropModal(false)
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setUploading(false)
      if (tempImageUrl) { 
        URL.revokeObjectURL(tempImageUrl)
        setTempImageUrl(null) 
        setTempImageFile(null)
      }
    }
  }

  const handleRemoveImage = () => {
    updateProfile({ avatar_url: null })
    setShowEditModal(false)
  }

  const handleLayoutChange = (layout: string) => {
    if (layout === "hero" && (theme.background_type === "image" || theme.background_type === "gradient" || theme.background_type === "video")) return
    // Block switching to Hero if pattern is active
    if (layout === "hero" && (theme as any).background_pattern && (theme as any).background_pattern !== "none") {
      return // Silently block - pattern takes precedence
    }
    if (layout === "hero") {
      updateTheme({ header_layout: layout, laser_glow_enabled: false } as any)
      return
    }
    updateTheme({ header_layout: layout } as any)
  }

  // Logo file selection handler - detects image aspect ratio
  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)

    // Load image to detect dimensions and set appropriate crop box
    const img = new Image()
    img.onload = () => {
      const imgWidth = img.width
      const imgHeight = img.height
      const aspectRatio = imgWidth / imgHeight

      setLogoImageSize({ width: imgWidth, height: imgHeight })
      setTempLogoUrl(url)
      setTempLogoFile(file)
      setShowLogoUploadModal(false)
      setShowLogoCropModal(true)

      // Set crop box based on aspect ratio - adapts to image shape
      // For wide images (aspect > 1.2), use wider crop
      // For tall images (aspect < 0.8), use taller crop
      // Otherwise use square-ish crop
      if (aspectRatio > 1.2) {
        // Wide image - use wide crop box
        setLogoCropBox({ x: 5, y: 15, width: 90, height: 70 })
      } else if (aspectRatio < 0.8) {
        // Tall image - use tall crop box
        setLogoCropBox({ x: 15, y: 5, width: 70, height: 90 })
      } else {
        // Square-ish - use centered square
        setLogoCropBox({ x: 10, y: 10, width: 80, height: 80 })
      }
    }
    img.src = url

    // Reset file input for next selection
    e.target.value = ''
  }

  // Logo crop drag handlers - percentage based like video cropper
  const handleLogoCropMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize', corner?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const container = logoCropContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    setLogoDragStart({
      x,
      y,
      boxX: logoCropBox.x,
      boxY: logoCropBox.y,
      boxW: logoCropBox.width,
      boxH: logoCropBox.height
    })

    if (type === 'drag') {
      setIsLogoDragging(true)
    } else {
      setIsLogoResizing(corner || null)
    }
  }

  const handleLogoCropTouchStart = (e: React.TouchEvent, type: 'drag' | 'resize', corner?: string) => {
    e.stopPropagation()
    const touch = e.touches[0]
    const container = logoCropContainerRef.current
    if (!container || !touch) return

    const rect = container.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100

    setLogoDragStart({
      x,
      y,
      boxX: logoCropBox.x,
      boxY: logoCropBox.y,
      boxW: logoCropBox.width,
      boxH: logoCropBox.height
    })

    if (type === 'drag') {
      setIsLogoDragging(true)
    } else {
      setIsLogoResizing(corner || null)
    }
  }

  const handleLogoCropMouseMove = useCallback((e: MouseEvent) => {
    const container = logoCropContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    if (isLogoDragging) {
      const deltaX = x - logoDragStart.x
      const deltaY = y - logoDragStart.y

      let newX = logoDragStart.boxX + deltaX
      let newY = logoDragStart.boxY + deltaY

      // Constrain to container
      newX = Math.max(0, Math.min(100 - logoCropBox.width, newX))
      newY = Math.max(0, Math.min(100 - logoCropBox.height, newY))

      setLogoCropBox(prev => ({ ...prev, x: newX, y: newY }))
    } else if (isLogoResizing) {
      const deltaX = x - logoDragStart.x
      const deltaY = y - logoDragStart.y

      let newBox = { ...logoCropBox }

      if (isLogoResizing.includes('right')) {
        newBox.width = Math.max(20, Math.min(100 - logoDragStart.boxX, logoDragStart.boxW + deltaX))
      }
      if (isLogoResizing.includes('left')) {
        const newWidth = Math.max(20, logoDragStart.boxW - deltaX)
        const maxWidth = logoDragStart.boxX + logoDragStart.boxW
        newBox.width = Math.min(newWidth, maxWidth)
        newBox.x = logoDragStart.boxX + logoDragStart.boxW - newBox.width
      }
      if (isLogoResizing.includes('bottom')) {
        newBox.height = Math.max(20, Math.min(100 - logoDragStart.boxY, logoDragStart.boxH + deltaY))
      }
      if (isLogoResizing.includes('top')) {
        const newHeight = Math.max(20, logoDragStart.boxH - deltaY)
        const maxHeight = logoDragStart.boxY + logoDragStart.boxH
        newBox.height = Math.min(newHeight, maxHeight)
        newBox.y = logoDragStart.boxY + logoDragStart.boxH - newBox.height
      }

      // Keep square aspect ratio
      const size = Math.min(newBox.width, newBox.height)
      if (isLogoResizing.includes('right') || isLogoResizing.includes('bottom')) {
        newBox.width = size
        newBox.height = size
      } else {
        // Adjust position when resizing from left/top
        if (isLogoResizing.includes('left')) {
          newBox.x = logoDragStart.boxX + logoDragStart.boxW - size
        }
        if (isLogoResizing.includes('top')) {
          newBox.y = logoDragStart.boxY + logoDragStart.boxH - size
        }
        newBox.width = size
        newBox.height = size
      }

      setLogoCropBox(newBox)
    }
  }, [isLogoDragging, isLogoResizing, logoDragStart, logoCropBox.width, logoCropBox.height])

  const handleLogoCropTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    const container = logoCropContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100

    if (isLogoDragging) {
      const deltaX = x - logoDragStart.x
      const deltaY = y - logoDragStart.y

      let newX = logoDragStart.boxX + deltaX
      let newY = logoDragStart.boxY + deltaY

      newX = Math.max(0, Math.min(100 - logoCropBox.width, newX))
      newY = Math.max(0, Math.min(100 - logoCropBox.height, newY))

      setLogoCropBox(prev => ({ ...prev, x: newX, y: newY }))
    } else if (isLogoResizing) {
      const deltaX = x - logoDragStart.x
      const deltaY = y - logoDragStart.y

      let newBox = { ...logoCropBox }

      if (isLogoResizing.includes('right')) {
        newBox.width = Math.max(20, Math.min(100 - logoDragStart.boxX, logoDragStart.boxW + deltaX))
      }
      if (isLogoResizing.includes('left')) {
        const newWidth = Math.max(20, logoDragStart.boxW - deltaX)
        const maxWidth = logoDragStart.boxX + logoDragStart.boxW
        newBox.width = Math.min(newWidth, maxWidth)
        newBox.x = logoDragStart.boxX + logoDragStart.boxW - newBox.width
      }
      if (isLogoResizing.includes('bottom')) {
        newBox.height = Math.max(20, Math.min(100 - logoDragStart.boxY, logoDragStart.boxH + deltaY))
      }
      if (isLogoResizing.includes('top')) {
        const newHeight = Math.max(20, logoDragStart.boxH - deltaY)
        const maxHeight = logoDragStart.boxY + logoDragStart.boxH
        newBox.height = Math.min(newHeight, maxHeight)
        newBox.y = logoDragStart.boxY + logoDragStart.boxH - newBox.height
      }

      // Keep square aspect ratio
      const size = Math.min(newBox.width, newBox.height)
      newBox.width = size
      newBox.height = size

      setLogoCropBox(newBox)
    }
  }, [isLogoDragging, isLogoResizing, logoDragStart, logoCropBox.width, logoCropBox.height])

  const handleLogoCropMouseUp = useCallback(() => {
    setIsLogoDragging(false)
    setIsLogoResizing(null)
  }, [])

  // Add/remove logo crop event listeners
  useEffect(() => {
    if (isLogoDragging || isLogoResizing) {
      window.addEventListener('mousemove', handleLogoCropMouseMove)
      window.addEventListener('mouseup', handleLogoCropMouseUp)
      window.addEventListener('touchmove', handleLogoCropTouchMove, { passive: false })
      window.addEventListener('touchend', handleLogoCropMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleLogoCropMouseMove)
        window.removeEventListener('mouseup', handleLogoCropMouseUp)
        window.removeEventListener('touchmove', handleLogoCropTouchMove)
        window.removeEventListener('touchend', handleLogoCropMouseUp)
      }
    }
  }, [isLogoDragging, isLogoResizing, handleLogoCropMouseMove, handleLogoCropTouchMove, handleLogoCropMouseUp])

  const handleLogoCropSave = async () => {
    if (!tempLogoFile || !tempLogoUrl) return
    setUploadingLogo(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = tempLogoUrl
      })

      // Convert percentage-based crop box to actual image coordinates
      const actualX = (logoCropBox.x / 100) * img.width
      const actualY = (logoCropBox.y / 100) * img.height
      const actualWidth = (logoCropBox.width / 100) * img.width
      const actualHeight = (logoCropBox.height / 100) * img.height

      // Output size - preserve aspect ratio for high quality logo (no distortion)
      const maxOutputDimension = 500
      const cropAspectRatio = actualWidth / actualHeight
      let outputWidth: number
      let outputHeight: number

      if (cropAspectRatio >= 1) {
        // Wide or square - constrain by width
        outputWidth = maxOutputDimension
        outputHeight = Math.round(maxOutputDimension / cropAspectRatio)
      } else {
        // Tall - constrain by height
        outputHeight = maxOutputDimension
        outputWidth = Math.round(maxOutputDimension * cropAspectRatio)
      }

      canvas.width = outputWidth
      canvas.height = outputHeight

      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(
          img,
          actualX, actualY, actualWidth, actualHeight,
          0, 0, outputWidth, outputHeight
        )
      }

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0)
      })

      const fileName = `${user.id}/logo-${Date.now()}.png`
      const { error } = await supabase.storage.from("onepage-assets").upload(fileName, blob, { upsert: true })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
      updateTheme({ title_logo_url: publicUrl, title_style: 'logo' } as any)
      setShowLogoCropModal(false)
    } catch (error) {
      console.error("Logo upload error:", error)
      alert('Failed to save logo. Please try again.')
    } finally {
      setUploadingLogo(false)
      if (tempLogoUrl) {
        URL.revokeObjectURL(tempLogoUrl)
        setTempLogoUrl(null)
        setTempLogoFile(null)
      }
    }
  }

  const handleRemoveLogo = () => {
    updateTheme({ title_logo_url: null, title_style: 'text' } as any)
  }

  // Mouse/Touch handlers for crop box
  const handleCropMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    setIsDragging(true)
    setDragStart({ x: clientX - cropBox.x, y: clientY - cropBox.y })
  }

  const handleResizeMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    setIsResizing(true)
    setDragStart({ x: clientX, y: clientY })
  }

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    if (isDragging) {
      const newX = clientX - dragStart.x
      const newY = clientY - dragStart.y
      
      // Constrain to image bounds
      const maxX = imageSize.width - cropBox.size
      const maxY = imageSize.height - cropBox.size
      
      setCropBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      }))
    }
    
    if (isResizing) {
      const deltaX = clientX - dragStart.x
      const deltaY = clientY - dragStart.y
      const delta = Math.max(deltaX, deltaY)
      
      setCropBox(prev => {
        const newSize = Math.max(50, Math.min(
          prev.size + delta,
          imageSize.width - prev.x,
          imageSize.height - prev.y
        ))
        return { ...prev, size: newSize }
      })
      setDragStart({ x: clientX, y: clientY })
    }
  }, [isDragging, isResizing, dragStart, cropBox.size, imageSize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('touchmove', handleMouseMove)
      window.addEventListener('touchend', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('touchmove', handleMouseMove)
        window.removeEventListener('touchend', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  return (
    <div>
      <PanelSection>
        <SettingRow label="Profile image" description={avatarVideoUrl ? "A video, playing on a loop" : onepage.avatar_url ? "An image or GIF" : "Add a photo, a logo or a short video"}>
          {/* The picture itself is the button, with a pencil on its corner, as Linktree draws it. */}
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            disabled={uploading}
            aria-label="Change profile image"
            data-avatar-edit
            className="relative aspect-square h-[88px] w-[88px] shrink-0 cursor-pointer rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] disabled:cursor-wait"
          >
            {/* A circle, as the page draws it and as the theme cards do. */}
            <span data-editor-avatar="" className="absolute inset-0 overflow-hidden rounded-full bg-[#f1f2f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
          {avatarVideoUrl ? (
                <>
                  {onepage.avatar_url ? (
                    <img src={onepage.avatar_url} alt={onepage.title} className="absolute inset-0 w-full h-full object-cover scale-105 blur-[2px]" />
                  ) : (
                    <div className="absolute inset-0 bg-gray-200 animate-pulse" />
                  )}
                  <video
                    src={avatarVideoUrl}
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
              ) : onepage.avatar_url ? (
                <img src={onepage.avatar_url} alt={onepage.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[28px] font-semibold text-[#6b7280] bg-[#f1f2f4]">{onepage.title?.charAt(0) || "?"}</div>
              )}
            </span>
            <span aria-hidden className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" strokeWidth={1.75} />}
            </span>
          </button>
        </SettingRow>
      </PanelSection>

      <SheetDialog
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        phone={sheetPhone}
        label="Profile Image"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b">
            <SheetDialogTitle className="text-lg font-semibold text-center">Profile Image</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => { setShowEditModal(false); setShowUploadModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">Select image or GIF</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <button onClick={() => { setShowEditModal(false); setShowVideoModal(true) }} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center"><Video className="h-6 w-6 text-yellow-600" /></div>
              <div className="flex-1 text-left"><p className="font-medium">Select video</p></div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            {(onepage.avatar_url || avatarVideoUrl) && (
              <button onClick={() => { handleRemoveImage(); handleRemoveVideo(); }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-4 w-4" /><span className="font-medium">Remove current media</span>
              </button>
            )}
          </div>
        </SheetDialog>

      {/* Video Selection Modal */}
      <SheetDialog
        open={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        phone={sheetPhone}
        label="Profile Video"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Profile Video</SheetDialogTitle>
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
            <input ref={videoFileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      {/* Video Crop Modal - Simple 1:1 crop like image crop */}
      <SheetDialog
        open={showVideoCropModal}
        onClose={() => {
          setShowVideoCropModal(false)
          if (tempVideoUrl && tempVideoFile) URL.revokeObjectURL(tempVideoUrl)
          setTempVideoUrl(null)
          setTempVideoFile(null)
          setIsVideoDragging(false)
          setIsVideoResizing(null)
          setVideoDimensions({ width: 0, height: 0 })
        }}
        phone={sheetPhone}
        label="Crop Video"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoCropModal(false); setShowVideoModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Video</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempVideoUrl && (
              <>
                <div
                  ref={videoCropContainerRef}
                  className="relative mx-auto bg-black rounded-xl select-none overflow-hidden"
                  style={{
                    width: videoDimensions.width > 0
                      ? `${Math.min(300, Math.max(200, videoDimensions.width > videoDimensions.height
                          ? 300
                          : Math.round(300 * (videoDimensions.width / videoDimensions.height))))}px`
                      : '300px',
                    height: videoDimensions.height > 0
                      ? `${Math.min(300, Math.max(200, videoDimensions.height > videoDimensions.width
                          ? 300
                          : Math.round(300 * (videoDimensions.height / videoDimensions.width))))}px`
                      : '300px',
                    touchAction: 'none'
                  }}
                >
                  <video
                    ref={videoPreviewRef}
                    src={tempVideoUrl}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover pointer-events-none"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      const video = e.currentTarget
                      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight })
                    }}
                  />

                  {/* Crop box - 1:1 square ratio */}
                  <div
                    /* In the phone's sheet, the crop keeps its finger: the sheet does not drag from here. */
                    data-sheet-no-drag=""
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
                    onMouseDown={(e) => handleVideoCropMouseDown(e, 'drag')}
                    onTouchStart={(e) => handleVideoCropTouchStart(e, 'drag')}
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
                            onMouseDown={(e) => { e.stopPropagation(); handleVideoCropMouseDown(e, 'resize', corner) }}
                            onTouchStart={(e) => { e.stopPropagation(); handleVideoCropTouchStart(e, 'resize', corner) }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag bottom-right corner to resize
                </p>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowVideoCropModal(false); setShowVideoModal(true) }} className="flex-1">Cancel</Button>
                  <Button onClick={handleVideoCropSave} className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]" disabled={uploadingVideo}>
                    {uploadingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetDialog>

      <SheetDialog
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        phone={sheetPhone}
        label="Upload media"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowUploadModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload media</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5">
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-12 w-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-600">Select file to upload,</p>
              <p className="font-medium text-gray-600">or drag-and-drop file</p>
              <p className="text-sm text-gray-400 mt-2">Please upload an image</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      <SheetDialog
        open={showCropModal}
        onClose={() => { setShowCropModal(false); if (tempImageUrl) { URL.revokeObjectURL(tempImageUrl); setTempImageUrl(null); setTempImageFile(null) } }}
        phone={sheetPhone}
        label="Crop Image"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowCropModal(false); setShowUploadModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempImageUrl && (
              <>
                <div 
                  ref={containerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden"
                  style={{ width: '300px', height: '300px' }}
                >
                  {/* Image */}
                  <img 
                    src={tempImageUrl} 
                    alt="Preview" 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={{ 
                      width: imageSize.width, 
                      height: imageSize.height,
                      maxWidth: '300px',
                      maxHeight: '300px',
                      objectFit: 'contain'
                    }} 
                    draggable={false} 
                  />
                  
                  {/* Dark overlay outside crop area */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(to right, 
                        rgba(0,0,0,0.5) ${(150 - imageSize.width/2 + cropBox.x)}px, 
                        transparent ${(150 - imageSize.width/2 + cropBox.x)}px, 
                        transparent ${(150 - imageSize.width/2 + cropBox.x + cropBox.size)}px, 
                        rgba(0,0,0,0.5) ${(150 - imageSize.width/2 + cropBox.x + cropBox.size)}px)`
                    }}
                  />
                  
                  {/* Crop box */}
                  <div 
                    /* In the phone's sheet, the crop keeps its finger: the sheet does not drag from here. */
                    data-sheet-no-drag=""
                    className="absolute cursor-move"
                    style={{
                      left: `${150 - imageSize.width/2 + cropBox.x}px`,
                      top: `${150 - imageSize.height/2 + cropBox.y}px`,
                      width: `${cropBox.size}px`,
                      height: `${cropBox.size}px`,
                      border: '2px solid #3b82f6',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                    }}
                    onMouseDown={handleCropMouseDown}
                    onTouchStart={handleCropMouseDown}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>
                    
                    {/* Corner handles */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div 
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize"
                      onMouseDown={handleResizeMouseDown}
                      onTouchStart={handleResizeMouseDown}
                    />
                  </div>
                </div>
                
                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag bottom-right corner to resize
                </p>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowCropModal(false); setShowUploadModal(true) }} className="flex-1">Cancel</Button>
                  <Button onClick={handleCropSave} className="flex-1 bg-[#1a1a2e] hover:bg-[#2a2a40]" disabled={uploading}>
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetDialog>

      {/* Logo Upload Modal */}
      <SheetDialog
        open={showLogoUploadModal}
        onClose={() => setShowLogoUploadModal(false)}
        phone={sheetPhone}
        label="Upload Logo"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => setShowLogoUploadModal(false)} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload Logo</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5">
            <div onClick={() => logoFileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-12 w-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-600">Select logo to upload,</p>
              <p className="font-medium text-gray-600">or drag-and-drop file</p>
              <p className="text-sm text-gray-400 mt-2">PNG with transparent background recommended</p>
            </div>
            <input ref={logoFileInputRef} type="file" accept="image/*" onChange={handleLogoFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      {/* Logo Crop Modal */}
      <SheetDialog
        open={showLogoCropModal}
        onClose={() => {
          setShowLogoCropModal(false)
          if (tempLogoUrl) {
            URL.revokeObjectURL(tempLogoUrl)
            setTempLogoUrl(null)
            setTempLogoFile(null)
            setIsLogoDragging(false)
            setIsLogoResizing(null)
          }
        }}
        phone={sheetPhone}
        label="Crop Logo"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowLogoCropModal(false); setShowLogoUploadModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Logo</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempLogoUrl && (
              <>
                <div
                  ref={logoCropContainerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden select-none"
                  style={{ width: '300px', height: '300px', touchAction: 'none' }}
                >
                  {/* Image fills container */}
                  <img
                    src={tempLogoUrl}
                    alt="Preview"
                    className="w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                  />

                  {/* Crop box - percentage based like video cropper */}
                  <div
                    /* In the phone's sheet, the crop keeps its finger: the sheet does not drag from here. */
                    data-sheet-no-drag=""
                    className="absolute border-2 border-white border-dashed cursor-move"
                    style={{
                      left: `${logoCropBox.x}%`,
                      top: `${logoCropBox.y}%`,
                      width: `${logoCropBox.width}%`,
                      height: `${logoCropBox.height}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      background: 'transparent',
                      touchAction: 'none'
                    }}
                    onMouseDown={(e) => handleLogoCropMouseDown(e, 'drag')}
                    onTouchStart={(e) => handleLogoCropTouchStart(e, 'drag')}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner resize handles - larger for mobile touch */}
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-nw-resize z-50"
                      style={{ top: '-12px', left: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'top-left') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'top-left') }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-ne-resize z-50"
                      style={{ top: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'top-right') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'top-right') }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-sw-resize z-50"
                      style={{ bottom: '-12px', left: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'bottom-left') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'bottom-left') }}
                    />
                    <div
                      className="absolute bg-blue-500 border-2 border-blue-600 rounded-full cursor-se-resize z-50"
                      style={{ bottom: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'bottom-right') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'bottom-right') }}
                    />

                    {/* Edge resize handles */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bg-white/90 rounded-full cursor-n-resize z-50"
                      style={{ top: '-8px', width: '40px', height: '16px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'top') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'top') }}
                    />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bg-white/90 rounded-full cursor-s-resize z-50"
                      style={{ bottom: '-8px', width: '40px', height: '16px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'bottom') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'bottom') }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 bg-white/90 rounded-full cursor-w-resize z-50"
                      style={{ left: '-8px', width: '16px', height: '40px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'left') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'left') }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 bg-white/90 rounded-full cursor-e-resize z-50"
                      style={{ right: '-8px', width: '16px', height: '40px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleLogoCropMouseDown(e, 'resize', 'right') }}
                      onTouchStart={(e) => { e.stopPropagation(); handleLogoCropTouchStart(e, 'resize', 'right') }}
                    />
                  </div>
                </div>

                <p className="text-xs text-center text-gray-500">Drag to move, use corners to resize freely</p>

                <Button onClick={handleLogoCropSave} className="w-full bg-black hover:bg-gray-800 text-white h-12 rounded-xl" disabled={uploadingLogo}>
                  {uploadingLogo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                </Button>
              </>
            )}
          </div>
        </SheetDialog>

      <PanelSection>
        <SectionTitle title="Profile image layout" />
        {(() => {
          /* Hero puts the picture behind the top of the page, so it cannot sit on a gradient, a photo, a video or a pattern. */
          const heroBlockedBy =
            theme.background_type === "image" ? "an image wallpaper" :
            theme.background_type === "gradient" ? "a gradient wallpaper" :
            theme.background_type === "video" ? "a video wallpaper" :
            (theme as any).background_pattern && (theme as any).background_pattern !== "none" ? "a pattern" : null
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ChoiceCard selected={effectiveLayout === "classic"} onClick={() => handleLayoutChange("classic")} label="Classic">
                  <div className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[#f7f7f8]">
                    <span className="h-7 w-7 rounded-full bg-[#d9dbe0]" />
                    <span className="h-1.5 w-12 rounded-full bg-[#d9dbe0]" />
                  </div>
                </ChoiceCard>
                <ChoiceCard selected={effectiveLayout === "hero"} onClick={() => handleLayoutChange("hero")} disabled={!!heroBlockedBy} label="Hero">
                  <div className="relative flex h-[76px] flex-col items-center justify-end overflow-hidden rounded-xl bg-[#f7f7f8] pb-2.5">
                    <span className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#c9cbd1] to-[#f7f7f8]" />
                    <span className="relative h-1.5 w-12 rounded-full bg-[#d9dbe0]" />
                  </div>
                </ChoiceCard>
              </div>
              {heroBlockedBy ? (
                <p className="mt-3 text-[13.5px] text-[#6b7280]">
                  Hero is off while the page uses {heroBlockedBy}.{" "}
                  <button
                    type="button"
                    onClick={() => (heroBlockedBy === "a pattern" ? updateTheme({ background_pattern: "none" } as any) : updateTheme({ background_type: "solid" }))}
                    className="cursor-pointer font-medium text-[#1a1a2e] underline underline-offset-2"
                  >
                    {heroBlockedBy === "a pattern" ? "Remove the pattern" : "Use a flat colour"}
                  </button>
                </p>
              ) : effectiveLayout === "hero" ? (
                <p className="mt-3 text-[13.5px] text-[#6b7280]">Your picture fills the top of the page and fades into it.</p>
              ) : null}
            </>
          )
        })()}
      </PanelSection>

      {effectiveLayout !== "hero" ? (
        <PanelSection>
          <SwitchRow
            label="Glowing ring"
            description="A light that circles your profile image"
            checked={(theme as any).laser_glow_enabled || false}
            onChange={(checked) => updateTheme({ laser_glow_enabled: checked } as any)}
          />
          {(theme as any).laser_glow_enabled ? (
            <div className="mt-4 space-y-4">
              <ColorRow
                label="Glow colour"
                value={(theme as any).laser_glow_color || "#3b82f6"}
                onChange={(color) => updateTheme({ laser_glow_color: color } as any)}
                suggestions={["#1a1a2e", "#3b82f6", "#b2846c", "#f59e0b", "#10b981", "#ffffff"]}
              />
              <Segmented
                label="Glow strength"
                value={((theme as any).laser_glow_intensity || "medium") as "low" | "medium" | "hard"}
                options={[{ id: "low", label: "Soft" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Bright" }] as const}
                onChange={(id) => updateTheme({ laser_glow_intensity: id } as any)}
              />
            </div>
          ) : null}
        </PanelSection>
      ) : null}

      <PanelSection>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-[#1a1a2e]">Title</span>
            <input value={onepage.title} onChange={(e) => updateProfile({ title: e.target.value })} placeholder="Your name" maxLength={60} className={fieldInput} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-[#1a1a2e]">Bio</span>
            <span className="relative block">
              <textarea
                value={onepage.bio || ""}
                onChange={(e) => updateProfile({ bio: e.target.value.slice(0, 160) })}
                placeholder="Add a short bio"
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
        <SectionTitle title="Title style" />
        <div className="grid grid-cols-2 gap-3">
          <ChoiceCard selected={((theme as any).title_style || "text") === "text"} onClick={() => updateTheme({ title_style: "text" } as any)} label="Text">
            <div className="grid h-12 place-items-center text-[22px] font-medium text-[#1a1a2e]" style={{ fontFamily: fontStack((theme as any).title_font || theme.font_family) }}>Aa</div>
          </ChoiceCard>
          <ChoiceCard selected={(theme as any).title_style === "logo"} onClick={() => updateTheme({ title_style: "logo" } as any)} label="Logo">
            <div className="grid h-12 place-items-center text-[#1a1a2e]"><ImageIcon className="h-6 w-6" strokeWidth={1.6} /></div>
          </ChoiceCard>
        </div>

        {(theme as any).title_style === "logo" ? (
          <div className="mt-5 space-y-4">
            {(theme as any).title_logo_url ? (
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#e3e4e8] bg-[repeating-conic-gradient(#eef0f2_0_90deg,#fff_90deg_180deg)_0_0/10px_10px]">
                  <img src={(theme as any).title_logo_url} alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div className="flex flex-1 gap-2">
                  <button type="button" onClick={() => setShowLogoUploadModal(true)} className={cn(secondaryDepth, "h-11 flex-1 rounded-xl text-[14px]")}>Change logo</button>
                  <button type="button" onClick={handleRemoveLogo} aria-label="Remove logo" className={cn(secondaryDepth, "h-11 w-11 rounded-xl text-[#b42318]")}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogoUploadModal(true)}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-6 text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]"
              >
                <Upload className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />
                <span className="text-[14px] font-medium">Upload a logo</span>
                <span className="text-[13px] text-[#6b7280]">A PNG with a clear background looks best</span>
              </button>
            )}
            <SettingRow label="Logo position">
              <Segmented
                className="w-[220px]"
                label="Logo position"
                value={(theme as any).logo_position === "more_up" ? "more_up" : "default"}
                options={[{ id: "default", label: "Default" }, { id: "more_up", label: "Higher" }] as const}
                onChange={(id) => updateTheme({ logo_position: id } as any)}
              />
            </SettingRow>
          </div>
        ) : null}

        <SettingRow label="Title size" className="mt-5">
          <Segmented
            className="w-[220px]"
            label="Title size"
            value={(theme as any).title_size === "large" ? "large" : "default"}
            options={[{ id: "default", label: "Default" }, { id: "large", label: "Large" }] as const}
            onChange={(id) => updateTheme({ title_size: id } as any)}
          />
        </SettingRow>
      </PanelSection>
    </div>
  )
}

/* The theme names, each drawn in its theme's title face: one request cut to the letters of the names. */
const THEME_NAME_FONTS_HREF = onePageFontSampleHref(
  [...new Set(THEME_TEMPLATES.map((t) => familyOf(t.theme_config.title_font || t.theme_config.font_family)).filter((f): f is string => !!f))],
  THEME_TEMPLATES.map((t) => t.name).join(""),
)

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
function ThemeCard({ template, selected, onPick }: { template: typeof THEME_TEMPLATES[number]; selected: boolean; onPick: () => void }) {
  const c = template.theme_config as typeof THEME_TEMPLATES[number]["theme_config"] & Record<string, any>
  const image = c.background_type === "image" && c.background_image_url
  const bgStyle: React.CSSProperties = image
    ? { backgroundImage: `url(${c.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: c.background_type === "gradient" && c.background_gradient ? c.background_gradient : c.background_color }
  const hero = (template as any).profile_layout === "hero" || c.header_layout === "hero"
  const pattern = c.background_pattern && c.background_pattern !== "none" && !image ? c.background_pattern : null
  const text = c.text_color || "#111111"
  const radius = Math.min((c.button_border_radius ?? 8) * 0.5, 9)
  const border = c.button_border_width || 0
  const shadowInk = c.button_shadow_color || "#000000"
  const shadow = c.button_shadow === "hard" ? `2px 2px 0 ${shadowInk}` : c.button_shadow === "strong" ? "0 3px 8px rgba(0,0,0,0.22)" : c.button_shadow === "subtle" ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
  const button: React.CSSProperties =
    c.button_style === "outline"
      ? { background: "transparent", border: `${Math.max(1.5, Math.min(border, 2))}px solid ${c.button_border_color || c.button_color}`, borderRadius: radius, boxShadow: shadow }
      : c.button_style === "glass"
        ? { background: "rgba(255,255,255,0.15)", border: `1px solid ${border ? c.button_border_color : "rgba(255,255,255,0.22)"}`, borderRadius: radius, backdropFilter: "blur(6px)", boxShadow: shadow }
        : { background: c.button_color, border: border ? `${Math.min(border, 2)}px solid ${c.button_border_color}` : undefined, borderRadius: radius, boxShadow: shadow }
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      aria-label={`${template.name} theme`}
      data-theme-card={template.id}
      className={cn(
        "group/theme relative flex cursor-pointer flex-col rounded-2xl border bg-white p-1.5 text-left outline-none transition-[border-color] duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]",
        choiceOff,
      )}
    >
      <ChoiceMark on={selected} />
      <span className="relative block aspect-[4/5] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
        <span className="absolute inset-0" style={bgStyle} />
        {image && c.image_brightness && c.image_brightness < 100 ? <span className="absolute inset-0 bg-black" style={{ opacity: (100 - c.image_brightness) / 100 }} /> : null}
        {pattern ? <WallpaperPattern pattern={pattern} color={c.pattern_color || "#ffffff90"} level={c.pattern_opacity || "medium"} /> : null}
        {hero ? <span className="absolute inset-x-0 top-0 h-[36%]" style={{ background: `linear-gradient(180deg, ${text}38 0%, ${text}14 70%, transparent 100%)` }} /> : null}
        <span className={cn("absolute inset-0 flex flex-col items-center px-[13%]", hero ? "pt-[30%]" : "pt-[15%]")}>
          {/*
            THE AVATAR IS A CIRCLE. It was sized by its width and an aspect
            ratio, in a column the card's height holds: where the column ran
            out of room (a narrow phone, Safari) the column took the height
            back from it and it was drawn oval. It does not shrink now, and
            its height is its width twice over: the aspect ratio, and a
            spacer whose padding is 100% of that width, which every engine
            has drawn square since long before aspect-ratio.
          */}
          {hero ? null : (
            <span data-theme-avatar="" className="block aspect-square w-[22%] flex-none overflow-hidden rounded-full" style={{ background: `${text}2e`, boxShadow: `inset 0 0 0 1px ${text}1f` }}>
              <span aria-hidden className="block pb-[100%]" />
            </span>
          )}
          <span
            className="mt-[7%] block max-w-full truncate text-[14px] font-bold leading-tight"
            style={{ fontFamily: fontStack(c.title_font || c.font_family), color: c.title_color || text }}
          >
            {template.name}
          </span>
          <span className="mt-[5%] block h-[3px] w-[40%] rounded-full" style={{ background: c.secondary_text_color || text, opacity: 0.55 }} />
          <span className="mt-[11%] flex w-full flex-col gap-[7px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="grid h-[17px] w-full place-items-center" style={button}>
                <span className="block h-[3px] w-[36%] rounded-full" style={{ background: c.button_text_color || text, opacity: 0.8 }} />
              </span>
            ))}
          </span>
        </span>
        <CheckMark on={selected} className="right-1.5 top-1.5" />
      </span>
      <span className={cn("block truncate px-1.5 pb-1 pt-2 text-[13px] font-medium transition-colors duration-[180ms]", selected ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{template.name}</span>
    </button>
  )
}

function ThemeSection() {
  const { onepage, updateTheme, updateSettings, updateBlock } = useOnePage()
  /* Its questions and pickers are the shared sheet on a phone (components/ui/sheet-dialog). */
  const sheetPhone = usePhone()
  const [filter, setFilter] = useState<"all" | "light" | "dark" | "gradient" | "image">("all")
  const [showLayoutChangeDialog, setShowLayoutChangeDialog] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<typeof THEME_TEMPLATES[0] | null>(null)

  if (!onepage) return null
  const { theme, draft_blocks } = onepage
  const currentHeaderLayout = (theme as any).header_layout || "classic"

  const handleApplyTemplate = (template: typeof THEME_TEMPLATES[0]) => {
    const config = template.theme_config
    const templateLayout = (template as any).profile_layout
    const skipDialog = (template as any).skipLayoutDialog

    // Template explicitly requests hero layout (like Midnight)
    const wantsHeroLayout = templateLayout === "hero" || (config as any).header_layout === "hero"
    // Gradient/image backgrounds require classic layout (unless template explicitly specifies otherwise)
    const needsClassicLayout = !wantsHeroLayout && (config.background_type === "gradient" || config.background_type === "image" || templateLayout === "classic")

    // If current layout is Hero and new template requires classic layout, show dialog (unless skipLayoutDialog is true)
    if (needsClassicLayout && currentHeaderLayout === "hero" && !skipDialog) {
      setPendingTemplate(template)
      setShowLayoutChangeDialog(true)
      return
    }

    // Apply template, ensuring correct layout
    const updatedConfig = { ...config, template_id: template.id }
    if (wantsHeroLayout) {
      // Template explicitly wants hero layout (e.g., Midnight)
      (updatedConfig as any).header_layout = "hero"
    } else if (needsClassicLayout) {
      (updatedConfig as any).header_layout = "classic"
    }
    updateTheme(updatedConfig)

    // Apply button styles from template if specified (for Default theme white buttons)
    const templateWithStyles = template as any
    if (templateWithStyles.share_style || templateWithStyles.subscribe_style) {
      const settingsUpdate: any = {}
      if (templateWithStyles.share_style) settingsUpdate.share_style = templateWithStyles.share_style
      if (templateWithStyles.subscribe_style) settingsUpdate.subscribe_style = templateWithStyles.subscribe_style
      updateSettings(settingsUpdate)
    }

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
            data: { ...(firstLinkButton.data || {}), animation_type: "swipe" }
          })
        }
      }
    }
  }

  const handleConfirmLayoutChange = () => {
    if (pendingTemplate) {
      const config = pendingTemplate.theme_config
      updateTheme({ ...config, template_id: pendingTemplate.id, header_layout: "classic" } as any)
    }
    setShowLayoutChangeDialog(false)
    setPendingTemplate(null)
  }

  const filteredTemplates = filter === "all" ? THEME_TEMPLATES : THEME_TEMPLATES.filter(t => t.category === filter)

  return (
    <div>
      <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-hide md:mx-0 md:px-0" role="tablist" aria-label="Theme kind">
        {(["all", "light", "dark", "gradient", "image"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className="relative h-9 shrink-0 cursor-pointer rounded-full border border-[#e3e4e8] bg-white px-3.5 text-[13px] font-medium capitalize hover:border-[#c9cbd1] [-webkit-tap-highlight-color:transparent]"
          >
            <ChipFill on={filter === f} />
            <span className={cn("relative transition-colors duration-[180ms]", filter === f ? "text-white" : "text-[#4b5563]")}>{f === "all" ? "All" : f}</span>
          </button>
        ))}
      </div>
      {THEME_NAME_FONTS_HREF ? <link rel="stylesheet" href={THEME_NAME_FONTS_HREF} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filteredTemplates.map((template) => (
          <ThemeCard key={template.id} template={template} selected={theme.template_id === template.id} onPick={() => handleApplyTemplate(template)} />
        ))}
      </div>

      {/* Layout Change Dialog */}
      <SheetDialog
        open={showLayoutChangeDialog}
        onClose={() => setShowLayoutChangeDialog(false)}
        phone={sheetPhone}
        label="Update profile image style?"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 pb-0">
            <SheetDialogTitle className="text-lg font-semibold text-center">Update profile image style?</SheetDialogTitle>
          </DialogHeader>
          
          <div className="p-5 space-y-4">
            {/* Preview */}
            <div className="bg-gray-900 rounded-2xl p-4 flex items-center justify-center">
              <div className="w-40 rounded-2xl overflow-hidden shadow-xl" style={{ background: pendingTemplate?.theme_config.background_type === "gradient" ? pendingTemplate?.theme_config.background_gradient : pendingTemplate?.theme_config.background_color }}>
                <div className="p-4 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-white/20" />
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
              This wallpaper option requires a <strong>Classic</strong> profile image layout.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleConfirmLayoutChange}
                className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                Update to Classic
              </button>
              
              <button
                onClick={() => { setShowLayoutChangeDialog(false); setPendingTemplate(null); }}
                className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </SheetDialog>
    </div>
  )
}

/**
 * THE GRADIENT DIRECTION DIAL, DECLARED ONCE AT MODULE SCOPE.
 *
 * It used to be a component declared inside WallpaperSection's render. A
 * component declared in a render is a new function on every render, and
 * React treats a new function as a new component type, so it throws the old
 * dial away and mounts a fresh one. Every onChange updates the theme, the
 * section renders again, and the dial that was being dragged was replaced by
 * one whose `isDragging` was false: a drag moved the angle by one step and
 * then stopped following the pointer. Out here it is the same component on
 * every render and keeps its drag state for as long as the drag lasts.
 */
function DirectionDial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  /*
    Pointer events with the pointer captured, and touch-action: none, so a
    finger turning the dial never scrolls the panel instead (the old window
    touchmove listener was passive, and the page moved under the thumb).
    The needle turns by a rotate transform, so it is marked
    data-keep-transform: app/globals.css removes transforms inside a .group
    on a touch screen, and a dial without its rotation says nothing.
  */
  const dialRef = useRef<HTMLDivElement>(null)
  const angleAt = (clientX: number, clientY: number) => {
    const rect = dialRef.current!.getBoundingClientRect()
    const a = Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2))
    let deg = Math.round(((a * 180) / Math.PI + 90) / 15) * 15
    if (deg < 0) deg += 360
    return deg % 360
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label="Gradient direction"
        aria-valuemin={0}
        aria-valuemax={345}
        aria-valuenow={value}
        aria-valuetext={`${value} degrees`}
        data-sheet-no-drag=""
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          onChange(angleAt(e.clientX, e.clientY))
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            const next = angleAt(e.clientX, e.clientY)
            if (next !== value) onChange(next)
          }
        }}
        onKeyDown={(e) => {
          const d = { ArrowRight: 15, ArrowUp: 15, ArrowLeft: -15, ArrowDown: -15 }[e.key]
          if (d === undefined) return
          e.preventDefault()
          onChange((value + d + 360) % 360)
        }}
        className="relative h-[76px] w-[76px] cursor-grab touch-none select-none rounded-full border border-[#e3e4e8] bg-white shadow-[inset_0_1px_3px_rgba(16,24,40,0.08)] outline-none active:cursor-grabbing focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
      >
        <div data-keep-transform="" className="pointer-events-none absolute inset-[7px] flex items-start justify-center" style={{ transform: `rotate(${value}deg)` }}>
          <span className="h-[26px] w-[3px] rounded-full bg-[#1a1a2e]" />
        </div>
        <span className="pointer-events-none absolute left-1/2 top-1/2 -ml-[5px] -mt-[5px] h-2.5 w-2.5 rounded-full border border-[#d9dbe0] bg-white" />
      </div>
      <span className="text-[13px] font-medium tabular-nums text-[#6b7280]">{value}°</span>
    </div>
  )
}

function WallpaperSection() {
  const { onepage, updateTheme } = useOnePage()
  const [uploading, setUploading] = useState(false)
  /* Its questions and pickers are the shared sheet on a phone (components/ui/sheet-dialog). */
  const sheetPhone = usePhone()
  const [showLayoutChangeDialog, setShowLayoutChangeDialog] = useState(false)
  const [pendingBgType, setPendingBgType] = useState<"gradient" | "image" | "video" | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Video wallpaper states
  const [showWallpaperVideoModal, setShowWallpaperVideoModal] = useState(false)
  const [showWallpaperVideoCropModal, setShowWallpaperVideoCropModal] = useState(false)
  const [tempWallpaperVideoUrl, setTempWallpaperVideoUrl] = useState<string | null>(null)
  const [tempWallpaperVideoFile, setTempWallpaperVideoFile] = useState<File | null>(null)
  const [uploadingWallpaperVideo, setUploadingWallpaperVideo] = useState(false)
  const wallpaperVideoFileInputRef = useRef<HTMLInputElement>(null)
  const wallpaperVideoPreviewRef = useRef<HTMLVideoElement>(null)
  const wallpaperVideoCropContainerRef = useRef<HTMLDivElement>(null)

  // Video crop state for wallpaper
  const [wallpaperVideoCropBox, setWallpaperVideoCropBox] = useState({ x: 0, y: 0, width: 100, height: 100 }) // 9:16 container, full coverage default
  const [isWallpaperVideoDragging, setIsWallpaperVideoDragging] = useState(false)
  const [isWallpaperVideoResizing, setIsWallpaperVideoResizing] = useState<string | null>(null)
  const [wallpaperVideoDragStart, setWallpaperVideoDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })

  if (!onepage) return null
  const { theme } = onepage
  const currentHeaderLayout = (theme as any).header_layout || "classic"

  // Parse current gradient to extract colors and direction
  const parseGradient = (gradient: string) => {
    const directionMatch = gradient.match(/(\d+)deg/)
    const colorMatches = gradient.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/g)
    return {
      direction: directionMatch ? parseInt(directionMatch[1]) : 135,
      color1: colorMatches?.[0] || "#f0a8b8",
      color2: colorMatches?.[1] || "#b2846c"
    }
  }

  const gradientInfo = parseGradient(theme.background_gradient || DEFAULT_GRADIENT)

  const handleBgTypeChange = (type: "solid" | "gradient" | "image" | "video") => {
    // If switching to gradient, image, or video and Hero layout is active, show dialog
    if ((type === "gradient" || type === "image" || type === "video") && currentHeaderLayout === "hero") {
      setPendingBgType(type)
      setShowLayoutChangeDialog(true)
      return
    }

    // For video type, open the video picker modal
    if (type === "video") {
      setShowWallpaperVideoModal(true)
      return
    }

    /* A gradient with none set yet starts from the one its tile shows, rather than drawing nothing. */
    updateTheme(type === "gradient" && !theme.background_gradient ? { background_type: type, background_gradient: DEFAULT_GRADIENT } : { background_type: type })
  }

  const handleConfirmLayoutChange = () => {
    if (pendingBgType) {
      // For video, also open the video picker modal after confirming layout change
      if (pendingBgType === "video") {
        updateTheme({ header_layout: "classic" } as any)
        setShowWallpaperVideoModal(true)
      } else {
        updateTheme({ background_type: pendingBgType, header_layout: "classic" } as any)
      }
    }
    setShowLayoutChangeDialog(false)
    setPendingBgType(null)
  }

  const handleGradientChange = (direction: number, color1: string, color2: string) => {
    const newGradient = `linear-gradient(${direction}deg, ${color1} 0%, ${color2} 100%)`
    updateTheme({ background_gradient: newGradient })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Check if Hero layout is active
    if (currentHeaderLayout === "hero") {
      setPendingBgType("image")
      setShowLayoutChangeDialog(true)
      return
    }
    
    setUploading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const fileName = `${user.id}/wallpaper-${Date.now()}.${file.name.split('.').pop()}`
      const { error } = await supabase.storage.from("onepage-assets").upload(fileName, file, { upsert: true })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)
      updateTheme({ background_type: "image", background_image_url: publicUrl })
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = (url: string) => {
    // Check if Hero layout is active
    if (currentHeaderLayout === "hero") {
      setPendingBgType("image")
      setShowLayoutChangeDialog(true)
      return
    }
    updateTheme({ background_image_url: url })
  }

  // Wallpaper video handlers
  const handleWallpaperVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg']
    if (!validTypes.includes(file.type) && !file.type.startsWith('video/')) {
      alert('Please select a valid video file (MP4, WebM, or MOV)')
      return
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('Video file must be less than 100MB')
      return
    }

    const url = URL.createObjectURL(file)
    setTempWallpaperVideoUrl(url)
    setTempWallpaperVideoFile(file)
    // Default to portrait 9:16 aspect ratio crop box (centered)
    setWallpaperVideoCropBox({ x: 21.875, y: 0, width: 56.25, height: 100 })
    setShowWallpaperVideoModal(false)
    setShowWallpaperVideoCropModal(true)
    e.target.value = ''
  }

  const handleWallpaperVideoCropMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize', corner?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const container = wallpaperVideoCropContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    setWallpaperVideoDragStart({
      x,
      y,
      boxX: wallpaperVideoCropBox.x,
      boxY: wallpaperVideoCropBox.y,
      boxW: wallpaperVideoCropBox.width,
      boxH: wallpaperVideoCropBox.height
    })

    if (type === 'drag') {
      setIsWallpaperVideoDragging(true)
    } else {
      setIsWallpaperVideoResizing(corner || null)
    }
  }

  const handleWallpaperVideoCropMouseMove = useCallback((e: MouseEvent) => {
    const container = wallpaperVideoCropContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    if (isWallpaperVideoDragging) {
      const deltaX = x - wallpaperVideoDragStart.x
      const deltaY = y - wallpaperVideoDragStart.y

      let newX = wallpaperVideoDragStart.boxX + deltaX
      let newY = wallpaperVideoDragStart.boxY + deltaY

      newX = Math.max(0, Math.min(100 - wallpaperVideoCropBox.width, newX))
      newY = Math.max(0, Math.min(100 - wallpaperVideoCropBox.height, newY))

      setWallpaperVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
    } else if (isWallpaperVideoResizing) {
      const deltaY = y - wallpaperVideoDragStart.y

      // 9:16 aspect ratio locked - container is 200x356 (portrait 9:16)
      // For 9:16 crop on 9:16 container: width% = height% (approximately 1:1 ratio in percentages)
      const aspectFactor = 1 // Since container is already 9:16, percentages match

      let newBox = { ...wallpaperVideoCropBox }

      // Resize maintains square percentage (which gives 9:16 actual ratio)
      if (isWallpaperVideoResizing.includes('bottom')) {
        const newHeight = Math.max(30, Math.min(100 - wallpaperVideoDragStart.boxY, wallpaperVideoDragStart.boxH + deltaY))
        const newWidth = newHeight * aspectFactor
        if (newBox.x + newWidth <= 100) {
          newBox.height = newHeight
          newBox.width = newWidth
        }
      }
      if (isWallpaperVideoResizing.includes('top')) {
        const proposedHeight = wallpaperVideoDragStart.boxH - deltaY
        const newHeight = Math.max(30, proposedHeight)
        const newWidth = newHeight * aspectFactor
        if (newWidth <= 100) {
          const maxY = wallpaperVideoDragStart.boxY + wallpaperVideoDragStart.boxH - 30
          newBox.y = Math.max(0, Math.min(maxY, wallpaperVideoDragStart.boxY + deltaY))
          newBox.height = wallpaperVideoDragStart.boxY + wallpaperVideoDragStart.boxH - newBox.y
          newBox.width = newBox.height * aspectFactor
          if (newBox.x + newBox.width > 100) {
            newBox.x = 100 - newBox.width
          }
        }
      }
      // Corner resizing
      if (isWallpaperVideoResizing.includes('right') || isWallpaperVideoResizing.includes('left')) {
        const newHeight = Math.max(30, Math.min(100 - newBox.y, wallpaperVideoDragStart.boxH + deltaY))
        const newWidth = newHeight * aspectFactor
        if (newBox.x + newWidth <= 100) {
          newBox.height = newHeight
          newBox.width = newWidth
        }
      }

      setWallpaperVideoCropBox(newBox)
    }
  }, [isWallpaperVideoDragging, isWallpaperVideoResizing, wallpaperVideoDragStart, wallpaperVideoCropBox.width, wallpaperVideoCropBox.height])

  const handleWallpaperVideoCropMouseUp = useCallback(() => {
    setIsWallpaperVideoDragging(false)
    setIsWallpaperVideoResizing(null)
  }, [])

  useEffect(() => {
    if (isWallpaperVideoDragging || isWallpaperVideoResizing) {
      window.addEventListener('mousemove', handleWallpaperVideoCropMouseMove)
      window.addEventListener('mouseup', handleWallpaperVideoCropMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleWallpaperVideoCropMouseMove)
        window.removeEventListener('mouseup', handleWallpaperVideoCropMouseUp)
      }
    }
  }, [isWallpaperVideoDragging, isWallpaperVideoResizing, handleWallpaperVideoCropMouseMove, handleWallpaperVideoCropMouseUp])

  const handleWallpaperVideoCropSave = async () => {
    if (!tempWallpaperVideoFile || !tempWallpaperVideoUrl) return
    setUploadingWallpaperVideo(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const fileName = `${user.id}/wallpaper-video-${Date.now()}.${tempWallpaperVideoFile.name.split('.').pop()}`
      const { error } = await supabase.storage.from("onepage-assets").upload(fileName, tempWallpaperVideoFile, { upsert: true })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from("onepage-assets").getPublicUrl(fileName)

      // Save video URL and crop data to theme
      updateTheme({
        background_type: "video",
        background_video_url: publicUrl,
        background_video_crop: wallpaperVideoCropBox
      } as any)

      setShowWallpaperVideoCropModal(false)
    } catch (error) {
      console.error("Wallpaper video upload error:", error)
      alert('Failed to upload video. Please try again.')
    } finally {
      setUploadingWallpaperVideo(false)
      if (tempWallpaperVideoUrl) {
        URL.revokeObjectURL(tempWallpaperVideoUrl)
        setTempWallpaperVideoUrl(null)
        setTempWallpaperVideoFile(null)
      }
    }
  }

  const handleRemoveWallpaperVideo = () => {
    updateTheme({
      background_type: "solid",
      background_video_url: null,
      background_video_crop: null
    } as any)
  }

  const bgType = theme.background_type as "solid" | "gradient" | "image" | "video"
  const currentPattern = (theme as any).background_pattern || "none"
  const patternRaw: string = (theme as any).pattern_color || (bgType === "gradient" ? "#ffffff90" : "#00000090")
  /* The pattern colour carries its own strength as two hex digits on the end (#00000090). The picker has no alpha, so it is kept aside and put back. */
  const patternAlpha = /^#[0-9a-f]{8}$/i.test(patternRaw) ? patternRaw.slice(7) : "90"
  const wallpaperFill = bgType === "gradient" ? theme.background_gradient || DEFAULT_GRADIENT : theme.background_color

  const styleTile = (type: "solid" | "gradient" | "image" | "video") => {
    const art =
      type === "solid" ? <span className="absolute inset-0" style={{ background: bgType === "solid" ? theme.background_color : "#b2846c" }} /> :
      type === "gradient" ? <span className="absolute inset-0" style={{ background: bgType === "gradient" && theme.background_gradient ? theme.background_gradient : DEFAULT_GRADIENT }} /> :
      type === "image" ? (theme.background_image_url ? <img src={theme.background_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center bg-[#f1f2f4] text-[#6b7280]"><ImageIcon className="h-5 w-5" strokeWidth={1.6} /></span>) :
      <span className="absolute inset-0 grid place-items-center bg-[#f1f2f4] text-[#6b7280]"><Video className="h-5 w-5" strokeWidth={1.6} /></span>
    return (
      <ChoiceCard key={type} selected={bgType === type} onClick={() => handleBgTypeChange(type)} label={type === "solid" ? "Fill" : type === "gradient" ? "Gradient" : type === "image" ? "Image" : "Video"} className="p-1.5">
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
  const fillIsDark = (() => {
    const hex = normalizeHex(bgType === "gradient" ? (wallpaperFill.match(/#[0-9a-f]{6}/i)?.[0] ?? "") : theme.background_color)
    if (!hex) return bgType === "gradient"
    const n = parseInt(hex.slice(1), 16)
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.55
  })()
  const autoInk = fillIsDark ? "#ffffff90" : "#00000090"
  const ink = (theme as any).pattern_color || autoInk
  const pickPattern = (id: string) =>
    updateTheme({ background_pattern: id, ...(id !== "none" && !(theme as any).pattern_color ? { pattern_color: autoInk } : {}) } as any)
  const patternTile = (pattern: (typeof WALLPAPER_PATTERNS)[number]) => {
    const on = currentPattern === pattern.id || (pattern.id === "none" && !isPatternId(currentPattern))
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
            <WallpaperPattern pattern={pattern.id} color={ink} level={(theme as any).pattern_opacity || "medium"} style={{ backgroundSize: previewSize(pattern.id, ink, (theme as any).pattern_opacity || "medium") }} />
          )}
          <CheckMark on={on} small className="right-1 top-1" />
        </span>
        <span className={cn("block truncate pb-0.5 pt-1.5 text-[12px] font-medium transition-colors duration-[180ms]", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{pattern.name}</span>
      </button>
    )
  }
  const patternSection = (
    <PanelSection>
      <SectionTitle title="Pattern and texture" description="Drawn over the colour, on the whole page" />
      <p className="mb-2 text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Textures</p>
      <div className="grid grid-cols-4 gap-2" data-pattern-group="textures">
        {WALLPAPER_PATTERNS.filter((p) => p.kind !== "pattern").map(patternTile)}
      </div>
      <p className="mb-2 mt-5 text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Patterns</p>
      <div className="grid grid-cols-4 gap-2" data-pattern-group="patterns">
        {WALLPAPER_PATTERNS.filter((p) => p.kind === "pattern").map(patternTile)}
      </div>
      {isPatternId(currentPattern) ? (
        <div className="mt-5 space-y-4">
          <ColorRow
            label="Pattern colour"
            value={normalizeHex(ink)}
            onChange={(color) => updateTheme({ pattern_color: color + patternAlpha } as any)}
            suggestions={["#000000", "#ffffff", "#1a1a2e", theme.text_color, theme.button_color, "#b2846c"]}
          />
          <SettingRow label="Strength" stackOnPhone>
            <Segmented
              className="w-full sm:w-[300px]"
              label="Pattern strength"
              value={((theme as any).pattern_opacity || "medium") as PatternOpacity}
              options={[{ id: "low", label: "Light" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Strong" }, { id: "very_hard", label: "Bold" }] as const}
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
        label="Film grain"
        description="A fine grain over the whole wallpaper"
        checked={!!(theme as any)[field]}
        onChange={(checked) => updateTheme({ [field]: checked } as any)}
      />
      {(theme as any)[field] ? (
        <div className="mt-3">
          <RangeRow label="Grain strength" value={(theme as any).noise_strength || 15} min={5} max={50} step={5} onChange={(v) => updateTheme({ noise_strength: v } as any)} unit="%" ends={["Subtle", "Strong"]} />
        </div>
      ) : null}
    </>
  )

  return (
    <div>
      <PanelSection>
        <SectionTitle title="Wallpaper style" />
        <div className="grid grid-cols-4 gap-2.5">{(["solid", "gradient", "image", "video"] as const).map(styleTile)}</div>
      </PanelSection>

      {bgType === "solid" && (
        <>
          <PanelSection>
            <ColorRow
              label="Background colour"
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
            <div className="h-24 w-full rounded-2xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]" style={{ background: `linear-gradient(${gradientInfo.direction}deg, ${gradientInfo.color1} 0%, ${gradientInfo.color2} 100%)` }} />
            <div className="mt-5 flex items-center gap-5">
              <DirectionDial value={gradientInfo.direction} onChange={(dir) => handleGradientChange(dir, gradientInfo.color1, gradientInfo.color2)} />
              <div className="min-w-0 flex-1 space-y-3">
                <ColorRow label="Start" value={gradientInfo.color1} onChange={(color) => handleGradientChange(gradientInfo.direction, color, gradientInfo.color2)} />
                <ColorRow label="End" value={gradientInfo.color2} onChange={(color) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, color)} />
              </div>
            </div>
          </PanelSection>
          <PanelSection>
            <SectionTitle title="Ready made" />
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
                  aria-label={`Gradient ${i + 1}`}
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
            <SwitchRow label="Animate" description="The colours drift slowly across the page" checked={theme.animated_gradient || false} onChange={(checked) => updateTheme({ animated_gradient: checked })} />
            <div className="mt-5">{noiseRows("gradient_noise")}</div>
          </PanelSection>
          {patternSection}
        </>
      )}

      {bgType === "image" && (
        <>
          <PanelSection>
            {theme.background_image_url ? (
              <div className="relative aspect-video overflow-hidden rounded-2xl">
                <img src={theme.background_image_url} alt="Wallpaper" className="h-full w-full object-cover" style={{ filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)` }} />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={cn(secondaryDepth, "h-10 rounded-full px-4 text-[13.5px]")} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Replace
                  </button>
                  <button type="button" aria-label="Remove image" onClick={() => updateTheme({ background_image_url: "" })} className={cn(secondaryDepth, "h-10 w-10 rounded-full")}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-8 text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[#6b7280]" /> : <Upload className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />}
                <span className="text-[14px] font-medium">{uploading ? "Uploading" : "Upload an image"}</span>
                <span className="text-[13px] text-[#6b7280]">JPG, PNG or GIF. Tall pictures fit a phone best</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </PanelSection>
          {theme.background_image_url ? (
            <PanelSection>
              <div className="space-y-5">
                <RangeRow label="Brightness" value={(theme as any).image_brightness || 100} min={20} max={150} step={5} onChange={(v) => updateTheme({ image_brightness: v } as any)} unit="%" />
                <RangeRow label="Blur" value={(theme as any).image_blur || 0} min={0} max={20} step={1} onChange={(v) => updateTheme({ image_blur: v } as any)} unit="px" />
                <div>{noiseRows("image_noise")}</div>
              </div>
            </PanelSection>
          ) : null}
          <PanelSection>
            <SectionTitle title="From the library" />
            <div className="grid grid-cols-3 gap-2.5">
              {BACKGROUND_IMAGES.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  aria-label={bg.label}
                  aria-pressed={theme.background_image_url === bg.url}
                  onClick={() => handleImageSelect(bg.url)}
                  className="relative aspect-square cursor-pointer rounded-xl outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
                >
                  <span className="block h-full w-full overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    <img src={bg.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </span>
                  <SwatchMark on={theme.background_image_url === bg.url} className="rounded-[15.5px]" />
                </button>
              ))}
            </div>
          </PanelSection>
        </>
      )}

      {bgType === "video" && (
        <PanelSection>
          {(theme as any).background_video_url ? (
            <div className="space-y-5">
              <div className="relative mx-auto aspect-[9/16] max-h-[300px] overflow-hidden rounded-2xl">
                <video src={(theme as any).background_video_url} className="h-full w-full object-cover" style={{ filter: `brightness(${(theme as any).video_brightness || 100}%)` }} autoPlay loop muted playsInline />
                <button type="button" aria-label="Remove video" onClick={handleRemoveWallpaperVideo} className={cn(secondaryDepth, "absolute right-3 top-3 h-10 w-10 rounded-full")}><Trash2 className="h-4 w-4" /></button>
              </div>
              <SettingRow label="Brightness" stackOnPhone>
                <Segmented
                  className="w-full sm:w-[320px]"
                  label="Video brightness"
                  value={String((theme as any).video_brightness || 100) as "100" | "85" | "70" | "40"}
                  options={[{ id: "100", label: "Normal" }, { id: "85", label: "Dim" }, { id: "70", label: "Darker" }, { id: "40", label: "Dark" }] as const}
                  onChange={(id) => updateTheme({ video_brightness: Number(id) } as any)}
                />
              </SettingRow>
              <button type="button" onClick={() => setShowWallpaperVideoModal(true)} className={cn(secondaryDepth, "h-11 w-full rounded-xl text-[14px]")}>
                <Video className="h-4 w-4" />
                Change video
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowWallpaperVideoModal(true)} className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9dbe0] px-4 py-8 text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
              <Video className="h-6 w-6 text-[#6b7280]" strokeWidth={1.6} />
              <span className="text-[14px] font-medium">Upload a video</span>
              <span className="text-[13px] text-[#6b7280]">MP4, WebM or MOV, up to 100MB</span>
            </button>
          )}
        </PanelSection>
      )}

      {/* Video Picker Modal */}
      <SheetDialog
        open={showWallpaperVideoModal}
        onClose={() => setShowWallpaperVideoModal(false)}
        phone={sheetPhone}
        label="Upload Video"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => setShowWallpaperVideoModal(false)} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload Video</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <button onClick={() => wallpaperVideoFileInputRef.current?.click()} className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Upload className="h-6 w-6 text-gray-600" /></div>
              <div className="flex-1 text-left">
                <p className="font-medium">Upload from device</p>
                <p className="text-sm text-gray-500">MP4, WebM, or MOV</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
            <input ref={wallpaperVideoFileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleWallpaperVideoFileSelect} className="hidden" />
          </div>
        </SheetDialog>

      {/* Video Crop Modal */}
      <SheetDialog
        open={showWallpaperVideoCropModal}
        onClose={() => {
          setShowWallpaperVideoCropModal(false)
          if (tempWallpaperVideoUrl) URL.revokeObjectURL(tempWallpaperVideoUrl)
          setTempWallpaperVideoUrl(null)
          setTempWallpaperVideoFile(null)
          setIsWallpaperVideoDragging(false)
          setIsWallpaperVideoResizing(null)
        }}
        phone={sheetPhone}
        label="Crop Video"
        className="w-[calc(100%-32px)] max-w-md sm:max-w-lg md:max-w-xl p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
        dialog={{ onPointerDownOutside: (e) => e.preventDefault(), onInteractOutside: (e) => e.preventDefault() }}
      >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowWallpaperVideoCropModal(false); setShowWallpaperVideoModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <SheetDialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Video</SheetDialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempWallpaperVideoUrl && (
              <>
                <div
                  ref={wallpaperVideoCropContainerRef}
                  className="relative mx-auto bg-black rounded-xl select-none overflow-hidden w-[200px] h-[356px] sm:w-[260px] sm:h-[462px] md:w-[320px] md:h-[569px]"
                  style={{ touchAction: 'none' }}
                >
                  <video
                    ref={wallpaperVideoPreviewRef}
                    src={tempWallpaperVideoUrl}
                    className="w-full h-full object-cover pointer-events-none rounded-xl"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />

                  {/* Crop box - draggable */}
                  <div
                    /* In the phone's sheet, the crop keeps its finger: the sheet does not drag from here. */
                    data-sheet-no-drag=""
                    className="absolute border-2 border-white border-dashed cursor-move"
                    style={{
                      left: `${wallpaperVideoCropBox.x}%`,
                      top: `${wallpaperVideoCropBox.y}%`,
                      width: `${wallpaperVideoCropBox.width}%`,
                      height: `${wallpaperVideoCropBox.height}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      background: 'transparent',
                      touchAction: 'none'
                    }}
                    onMouseDown={(e) => handleWallpaperVideoCropMouseDown(e, 'drag')}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner resize handles */}
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-nw-resize z-50"
                      style={{ top: '-12px', left: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleWallpaperVideoCropMouseDown(e, 'resize', 'top-left') }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-ne-resize z-50"
                      style={{ top: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleWallpaperVideoCropMouseDown(e, 'resize', 'top-right') }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-sw-resize z-50"
                      style={{ bottom: '-12px', left: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleWallpaperVideoCropMouseDown(e, 'resize', 'bottom-left') }}
                    />
                    <div
                      className="absolute bg-blue-500 border-2 border-blue-600 rounded-full cursor-se-resize z-50"
                      style={{ bottom: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => { e.stopPropagation(); handleWallpaperVideoCropMouseDown(e, 'resize', 'bottom-right') }}
                    />
                  </div>
                </div>

                <p className="text-xs text-center text-gray-500">Drag to move, use corners to resize (9:16 portrait ratio locked)</p>

                <Button onClick={handleWallpaperVideoCropSave} className="w-full bg-black hover:bg-gray-800 text-white h-12 rounded-xl" disabled={uploadingWallpaperVideo}>
                  {uploadingWallpaperVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                </Button>
              </>
            )}
          </div>
        </SheetDialog>

      {/* Layout Change Dialog */}
      <SheetDialog
        open={showLayoutChangeDialog}
        onClose={() => setShowLayoutChangeDialog(false)}
        phone={sheetPhone}
        label="Update profile image style?"
        className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
      >
          <DialogHeader className="p-5 pb-0">
            <SheetDialogTitle className="text-lg font-semibold text-center">Update profile image style?</SheetDialogTitle>
          </DialogHeader>
          
          <div className="p-5 space-y-4">
            {/* Preview */}
            <div className="bg-gray-900 rounded-2xl p-4 flex items-center justify-center">
              <div className="w-40 rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-orange-400 to-pink-500">
                <div className="p-4 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-white/20" />
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
              This wallpaper option requires a <strong>Classic</strong> profile image layout.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleConfirmLayoutChange}
                className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                Update to Classic
              </button>
              
              <button
                onClick={() => { setShowLayoutChangeDialog(false); setPendingBgType(null); }}
                className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
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
  const current = fonts.find((f) => f.value === value)
  const name = value ? current?.name || familyOf(value) || value : defaultLabel || "Default"
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts" aria-label="Search fonts" className={cn(fieldInput, "h-11 pl-10")} />
        </label>
        {withCategories ? (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-hide">
            {FONT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFamily(c.id)}
                aria-pressed={family === c.id}
                className="relative h-9 shrink-0 cursor-pointer rounded-full border border-[#e3e4e8] bg-white px-3.5 text-[13px] font-medium hover:border-[#c9cbd1] [-webkit-tap-highlight-color:transparent]"
              >
                <ChipFill on={family === c.id} />
                <span className={cn("relative transition-colors duration-[180ms]", family === c.id ? "text-white" : "text-[#4b5563]")}>{c.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={listRef} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#eef0f2] px-2 py-2">
        {shown.length === 0 ? <p className="px-3 py-6 text-center text-[14px] text-[#6b7280]">No font by that name</p> : null}
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
              className={cn("relative flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors duration-150", !on && "hover:bg-[#f7f7f8] active:bg-[#f1f2f4]")}
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
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4f4f6] text-[20px] text-[#1a1a2e]" style={{ fontFamily: fontStack(value || sampleFamily) }} aria-hidden>Aa</span>
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
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={label} fill height="min(80dvh, 640px)" aboveKeyboard keepMounted>
          <div className="flex h-full min-h-0 flex-col pt-2" data-font-sheet="">{list}</div>
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

function TextSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage
  const titleFont = (theme as any).title_font || null
  const bodyValue = FONTS.find((f) => familyOf(f.value) === familyOf(theme.font_family))?.value ?? theme.font_family

  return (
    <div>
      <PanelSection>
        {FONT_SAMPLE_HREF ? <link rel="stylesheet" href={FONT_SAMPLE_HREF} /> : null}
        <SectionTitle title="Fonts" />
        <div className="space-y-3">
          <FontPicker
            label="Page font"
            value={bodyValue}
            fonts={FONTS}
            sampleFamily={theme.font_family}
            onPick={(v) => v && updateTheme({ font_family: v })}
          />
          <FontPicker
            label="Title font"
            value={titleFont}
            fonts={TITLE_FONTS.map((f) => ({ ...f, name: f.value ? f.name : "Same as page font" }))}
            sampleFamily={theme.font_family}
            defaultLabel="Same as page font"
            onPick={(v) => updateTheme({ title_font: v } as any)}
          />
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title="Colours" />
        <div className="space-y-4">
          <ColorRow
            label="Title"
            value={(theme as any).title_color || null}
            emptyLabel="Text colour"
            fallback={theme.text_color}
            onChange={(color) => updateTheme({ title_color: color } as any)}
            onClear={() => updateTheme({ title_color: null } as any)}
            suggestions={["#ffffff", "#000000", "#1a1a2e", theme.text_color, theme.button_color, "#b2846c"]}
          />
          <ColorRow
            label="Text"
            value={theme.text_color}
            onChange={(color) => updateTheme({ text_color: color })}
            suggestions={["#ffffff", "#000000", "#1a1a2e", "#374151", "#f4efe9", theme.button_color]}
          />
          <ColorRow
            label="Secondary text"
            description="The bio and small print"
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
  const handleButtonStyleChange = (style: "filled" | "outline" | "glass") => {
    const updates: any = { button_style: style }

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
    // If selecting filled (solid) style, use white text color for better contrast
    else if (style === "filled") {
      updates.button_text_color = "#ffffff"
    }

    updateTheme(updates)
  }

  const shadow = ((theme as any).button_shadow || "none") as "none" | "subtle" | "strong" | "hard"
  const radius = theme.button_border_radius ?? 8
  /* A small drawing of the button in each style, in the page's own colours. */
  const sample = (style: "filled" | "outline" | "glass") => (
    <div className="grid h-[68px] place-items-center rounded-xl px-3" style={{ background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8" }}>
      <span
        className="block h-6 w-full max-w-[92px]"
        style={{
          borderRadius: Math.min(radius, 12),
          background: style === "filled" ? theme.button_color : style === "glass" ? "rgba(255,255,255,0.28)" : "transparent",
          border: style === "filled" ? "none" : `1.5px solid ${style === "glass" ? "rgba(255,255,255,0.55)" : theme.button_color}`,
          backdropFilter: style === "glass" ? "blur(6px)" : undefined,
        }}
      />
    </div>
  )

  return (
    <div>
      <PanelSection>
        <SectionTitle title="Button style" />
        <div className="grid grid-cols-3 gap-3">
          {(["filled", "outline", "glass"] as const).map((style) => (
            <ChoiceCard key={style} selected={theme.button_style === style} onClick={() => handleButtonStyleChange(style)} label={style === "filled" ? "Solid" : style === "outline" ? "Outline" : "Glass"}>
              {sample(style)}
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      <PanelSection>
        <div className="space-y-5">
          <RangeRow label="Corners" value={radius} min={0} max={24} step={2} onChange={(v) => updateTheme({ button_border_radius: v })} unit="px" ends={["Square", "Round"]} />
          <RangeRow label="Border" value={theme.button_border_width ?? 0} min={0} max={4} step={1} onChange={(v) => updateTheme({ button_border_width: v })} unit="px" />
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title="Colours" />
        <div className="space-y-4">
          <ColorRow
            label="Button"
            value={theme.button_color}
            onChange={(color) => updateTheme(theme.button_style === "outline" ? { button_color: color, button_border_color: color } : { button_color: color })}
            suggestions={["#1a1a2e", "#000000", "#ffffff", "#6b7280", "#b2846c", "#2f6f4f", "#e4572e", "#3b82f6"]}
          />
          <ColorRow
            label="Button text"
            value={theme.button_text_color}
            onChange={(color) => updateTheme({ button_text_color: color })}
            suggestions={["#ffffff", "#000000", "#1a1a2e", "#f8fafc", "#fef3c7"]}
          />
          {(theme.button_border_width ?? 0) > 0 || theme.button_style === "outline" ? (
            <ColorRow
              label="Border"
              value={theme.button_border_color}
              onChange={(color) => updateTheme({ button_border_color: color })}
              suggestions={["#000000", "#ffffff", "#1a1a2e", "#e5e7eb", theme.button_color]}
            />
          ) : null}
        </div>
      </PanelSection>

      <PanelSection>
        <SectionTitle title="Shadow" />
        <Segmented
          label="Shadow"
          value={shadow}
          options={[{ id: "none", label: "None" }, { id: "subtle", label: "Soft" }, { id: "strong", label: "Strong" }, { id: "hard", label: "Hard" }] as const}
          onChange={(id) => updateTheme({ button_shadow: id } as any)}
        />
        {shadow !== "none" ? (
          <div className="mt-4">
            <ColorRow label="Shadow colour" value={(theme as any).button_shadow_color || "#000000"} onChange={(color) => updateTheme({ button_shadow_color: color } as any)} suggestions={["#000000", "#1a1a2e", "#ffffff", theme.button_color]} />
          </div>
        ) : null}
      </PanelSection>

      <PanelSection>
        <SectionTitle title="On hover" description="How a button answers a pointer on a computer" />
        <Segmented
          label="On hover"
          value={((theme as any).button_hover_animation || "default") as "default" | "fade" | "zoom"}
          options={[{ id: "default", label: "Lift", hint: "Scales up" }, { id: "fade", label: "Fade", hint: "Dims" }, { id: "zoom", label: "Zoom", hint: "Grows" }] as const}
          onChange={(id) => updateTheme({ button_hover_animation: id } as any)}
        />
      </PanelSection>
    </div>
  )
}

function SocialsSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage
  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  return (
    <div>
      <PanelSection>
        <SectionTitle title="Icon style" />
        <div className="grid grid-cols-3 gap-3">
          {SOCIAL_STYLES.map((style) => (
            <ChoiceCard key={style.id} selected={socialStyle === style.id} onClick={() => updateTheme({ social_icon_style: style.id } as any)} label={style.label}>
              <div className="flex h-[60px] items-center justify-center gap-1.5 rounded-xl" style={{ background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8" }}>
                {["instagram", "youtube"].map((platform) => (
                  <span
                    key={platform}
                    className="grid h-7 w-7 place-items-center rounded-full"
                    style={{
                      backgroundColor: style.id === "filled" ? `${socialColor}22` : style.id === "minimal" ? "rgba(255,255,255,0.22)" : "transparent",
                      border: style.id === "outline" ? `1.5px solid ${socialColor}` : "none",
                    }}
                  >
                    <SocialIcon platform={platform} size={13} color={socialColor} />
                  </span>
                ))}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>
      <PanelSection>
        <ColorRow
          label="Icon colour"
          value={(theme as any).social_icon_color || null}
          emptyLabel="Text colour"
          fallback={theme.text_color}
          onChange={(color) => updateTheme({ social_icon_color: color } as any)}
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
            label="Hide the Storelib badge"
            description={userHasPaidPlan ? "Removes \u201con Storelib\u201d from the foot of your page" : "Preview it here; saving it needs a paid plan"}
            checked={hideBrandingEnabled}
            onChange={handleHideBrandingChange}
            extra={<ProMark title={userHasPaidPlan ? "Included in your plan" : "Pro"} />}
          />
          <SwitchRow
            label="Verified badge"
            description={userHasPaidPlan ? "A check mark beside your name" : "A check mark beside your name. Saving it needs a paid plan"}
            checked={verifiedEnabled}
            onChange={handleVerifiedBadgeChange}
            extra={<ProMark title={userHasPaidPlan ? "Included in your plan" : "Pro"} />}
          />
        </div>
      </PanelSection>
    </div>
  )
}
