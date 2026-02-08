"use client"

import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import { useEffect, useState, useRef, useCallback } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider as BaseSlider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ImageIcon,
  Droplets,
  ChevronRight,
  ChevronLeft,
  Layers,
  Type,
  RectangleHorizontal,
  Sparkles,
  Check,
  Loader2,
  Share2,
  Search,
  User,
  Video,
  Trash2,
  Upload,
  Move,
  X,
  Pipette,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { OnePageTheme } from "@/lib/onepage/types"

type DesignSection = "header" | "theme" | "wallpaper" | "text" | "buttons" | "socials" | "footer"

// Custom Toggle Component with theme-style design
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="theme-checkbox"
    />
  )
}

// Custom Slider Component with premium minimal styling
function Slider({ value, onValueChange, min = 0, max = 100, step = 1 }: {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number
}) {
  const percentage = ((value[0] - min) / (max - min)) * 100
  const numTicks = 5
  const ticks = Array.from({ length: numTicks }, (_, i) => (i / (numTicks - 1)) * 100)

  return (
    <div className="relative w-full h-6 flex items-center">
      {/* Track */}
      <div className="relative w-full h-[4px] bg-[#f0f0f0] rounded-full">
        {/* Tick markers */}
        {ticks.map((pos, i) => (
          <div
            key={i}
            className="absolute w-[6px] h-[6px] bg-[#e0e0e0] rounded-full -translate-y-1/2 top-1/2"
            style={{ left: `calc(${pos}% - 3px)` }}
          />
        ))}
        {/* Hidden input for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          onChange={(e) => onValueChange([Number(e.target.value)])}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        {/* Thumb */}
        <div
          className="absolute w-[21px] h-[21px] bg-white rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
          style={{
            left: `calc(${percentage}% - 10.5px)`,
            boxShadow: '0 2px 5px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)'
          }}
        />
      </div>
    </div>
  )
}

// Social icons SVG components for preview in design tab
const SocialIconsSVG: Record<string, React.FC<{ size?: number; color?: string }>> = {
  instagram: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  youtube: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  twitter: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
}

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

const BACKGROUND_PATTERNS = [
  { id: "none", name: "None", preview: null },
  { id: "grid", name: "Grid", preview: "grid" },
  { id: "dots", name: "Dots", preview: "dots" },
  { id: "waves", name: "Waves", preview: "waves" },
  { id: "zigzag", name: "Zigzag", preview: "zigzag" },
  { id: "diagonal", name: "Diagonal", preview: "diagonal" },
  { id: "morph", name: "Morph", preview: "morph" },
  { id: "organic", name: "Organic", preview: "organic" },
  { id: "flowmaze", name: "Flow Maze", preview: "flowmaze" },
  { id: "topographic", name: "Topographic", preview: "topographic" },
  { id: "stars", name: "Stars", preview: "stars" },
]

const THEME_TEMPLATES = [
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
      background_color: "#f8fafc",
      background_gradient: "",
      background_image_url: "",
      text_color: "#0f172a",
      secondary_text_color: "#64748b",
      button_color: "#0f172a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#0f172a",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#0f172a",
      social_icon_color: "#64748b",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: true,
      laser_glow_color: "#dbdbdb",
      laser_glow_intensity: "medium",
    },
    // AIR theme with light background - use dark button text for outline/glass styles
    light_button_text_color: "#0f172a",
    // Air theme uses white share/subscribe button styles
    share_style: "white",
    subscribe_style: "white",
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
    id: "blocks",
    name: "Blocks",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#7c3aed",
      background_gradient: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#e9d5ff",
      button_color: "#ffffff",
      button_text_color: "#7c3aed",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "hard",
      button_shadow_color: "#6a197b",
      font_family: "'Poppins', sans-serif",
      title_font: "'Poppins', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      // Blocks theme: laser glow off, grid pattern with low opacity
      laser_glow_enabled: false,
      background_pattern: "grid",
      pattern_opacity: "low",
      pattern_color: "#c9c9c990",
    },
    // Button text colors for different styles
    solid_button_text_color: "#7c3aed",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
    // Blocks theme uses white share/subscribe button styles
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
    id: "sunset",
    name: "Sunset",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#f97316",
      background_gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#fed7aa",
      button_color: "#ffffff",
      button_text_color: "#ea580c",
      button_style: "filled" as const,
      button_border_radius: 16,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "strong",
      font_family: "'Poppins', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      // Sunset theme: organic pattern with low opacity
      background_pattern: "organic",
      pattern_opacity: "low",
      pattern_color: "#ffcccc90",
    },
    // Sunset theme uses white share/subscribe button styles
    share_style: "white",
    subscribe_style: "white",
    // Button text colors for different styles
    solid_button_text_color: "#ea580c",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
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
    id: "aurora",
    name: "Aurora",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0f0f23",
      background_gradient: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 25%, #2d1b4e 50%, #1e3a5f 75%, #0f0f23 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(139, 92, 246, 0.3)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 16,
      button_border_width: 1,
      button_border_color: "rgba(139, 92, 246, 0.5)",
      button_shadow: "none",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a78bfa",
      background_pattern: "morph",
      pattern_color: "#ffffff90",
      spacing: "normal" as const,
      card_width: "standard" as const,
      animated_gradient: false,
    },
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
      secondary_text_color: "#e9d5ff",
      button_color: "#8b5cf6",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 0,
      button_border_color: "#8b5cf6",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#e9d5ff",
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

export function DesignTab() {
  const [activeSection, setActiveSection] = useState<DesignSection>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('onepage-design-section')
      if (saved && ['header', 'theme', 'wallpaper', 'text', 'buttons', 'socials', 'footer'].includes(saved)) {
        return saved as DesignSection
      }
    }
    return "theme"
  })
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  // Save active section to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('onepage-design-section', activeSection)
  }, [activeSection])

  // Listen for storage events to navigate to specific section (e.g., from "Design Social Icons" button)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'onepage-design-section' && e.newValue) {
        const validSections = ['header', 'theme', 'wallpaper', 'text', 'buttons', 'socials', 'footer']
        if (validSections.includes(e.newValue)) {
          setActiveSection(e.newValue as DesignSection)
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const sections = [
    { id: "header" as const, label: "Header", icon: ImageIcon },
    { id: "theme" as const, label: "Theme", icon: Layers },
    { id: "wallpaper" as const, label: "Wallpaper", icon: Droplets },
    { id: "text" as const, label: "Text", icon: Type },
    { id: "buttons" as const, label: "Buttons", icon: RectangleHorizontal },
    { id: "socials" as const, label: "Socials", icon: Share2 },
    { id: "footer" as const, label: "Footer", icon: Sparkles },
  ]

  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-4">
      <TooltipProvider delayDuration={0}>
        <nav className={cn("hidden md:flex shrink-0 flex-col bg-gray-50/80 rounded-2xl p-2 transition-all duration-200", sidebarExpanded ? "w-40" : "w-14")}>
          <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="flex items-center justify-center w-full h-9 mb-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            {sidebarExpanded ? <ChevronLeft className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          </button>
          <div className="space-y-1">
            {sections.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveSection(id)} className={cn("flex items-center w-full rounded-xl transition-all duration-150", sidebarExpanded ? "px-3 py-2.5 gap-3" : "p-2.5 justify-center", activeSection === id ? "bg-white text-foreground shadow-sm border border-gray-200" : "text-muted-foreground hover:bg-white/60 hover:text-foreground")}>
                    <Icon className={cn("shrink-0", sidebarExpanded ? "h-4 w-4" : "h-5 w-5")} />
                    {sidebarExpanded && <span className="text-sm font-medium truncate">{label}</span>}
                  </button>
                </TooltipTrigger>
                {!sidebarExpanded && <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>}
              </Tooltip>
            ))}
          </div>
        </nav>
        <div className="md:hidden w-full">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {sections.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveSection(id)} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl whitespace-nowrap transition-all text-sm", activeSection === id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </div>
      </TooltipProvider>
      <div className="flex-1 min-w-0">
        {activeSection === "header" && <HeaderSection />}
        {activeSection === "theme" && <ThemeSection />}
        {activeSection === "wallpaper" && <WallpaperSection />}
        {activeSection === "text" && <TextSection />}
        {activeSection === "buttons" && <ButtonsSection />}
        {activeSection === "socials" && <SocialsSection />}
        {activeSection === "footer" && <FooterSection />}
      </div>
    </div>
  )
}

function HeaderSection() {
  const { onepage, updateProfile, updateTheme } = useOnePage()
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

  // Title font modal state
  const [showTitleFontModal, setShowTitleFontModal] = useState(false)

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
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Header</h2>

      <div className="flex items-center gap-4 md:gap-5">
        <Avatar className="h-16 w-16 md:h-20 md:w-20 border overflow-hidden">
          {avatarVideoUrl ? (
            <video
              src={avatarVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <AvatarImage src={onepage.avatar_url || undefined} />
              <AvatarFallback className="text-lg md:text-xl bg-gray-100">{onepage.title?.charAt(0) || "?"}</AvatarFallback>
            </>
          )}
        </Avatar>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEditModal(true)} disabled={uploading} className="h-9 rounded-lg" data-avatar-edit>
            <ImageIcon className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Edit"}
          </Button>
        </div>
      </div>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b">
            <DialogTitle className="text-lg font-semibold text-center">Profile Image</DialogTitle>
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
        </DialogContent>
      </Dialog>

      {/* Video Selection Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
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
            <input ref={videoFileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoFileSelect} className="hidden" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Crop Modal - Simple 1:1 crop like image crop */}
      <Dialog open={showVideoCropModal} onOpenChange={(open) => {
        setShowVideoCropModal(open)
        if (!open) {
          if (tempVideoUrl && tempVideoFile) URL.revokeObjectURL(tempVideoUrl)
          setTempVideoUrl(null)
          setTempVideoFile(null)
          setIsVideoDragging(false)
          setIsVideoResizing(null)
          setVideoDimensions({ width: 0, height: 0 })
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
                  <Button onClick={handleVideoCropSave} className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={uploadingVideo}>
                    {uploadingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowUploadModal(false); setShowEditModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload media</DialogTitle>
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
        </DialogContent>
      </Dialog>

      <Dialog open={showCropModal} onOpenChange={(open) => { setShowCropModal(open); if (!open && tempImageUrl) { URL.revokeObjectURL(tempImageUrl); setTempImageUrl(null); setTempImageFile(null) } }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowCropModal(false); setShowUploadModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</DialogTitle>
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
                  <Button onClick={handleCropSave} className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={uploading}>
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Logo Upload Modal */}
      <Dialog open={showLogoUploadModal} onOpenChange={setShowLogoUploadModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => setShowLogoUploadModal(false)} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload Logo</DialogTitle>
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
        </DialogContent>
      </Dialog>

      {/* Logo Crop Modal */}
      <Dialog open={showLogoCropModal} onOpenChange={(open) => {
        setShowLogoCropModal(open)
        if (!open && tempLogoUrl) {
          URL.revokeObjectURL(tempLogoUrl)
          setTempLogoUrl(null)
          setTempLogoFile(null)
          setIsLogoDragging(false)
          setIsLogoResizing(null)
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowLogoCropModal(false); setShowLogoUploadModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Logo</DialogTitle>
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
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Profile image layout</Label>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button onClick={() => handleLayoutChange("classic")} className={cn("border-2 rounded-xl p-4 md:p-5 flex flex-col items-center gap-2 md:gap-3 transition-all", effectiveLayout === "classic" ? "border-foreground bg-white" : "border-gray-200 hover:border-gray-300")}>
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"><User className="h-5 w-5 text-gray-400" /></div>
            <span className="text-xs md:text-sm font-medium">Classic</span>
          </button>
          <button onClick={() => handleLayoutChange("hero")} disabled={theme.background_type === "image" || theme.background_type === "gradient" || theme.background_type === "video" || ((theme as any).background_pattern && (theme as any).background_pattern !== "none")} className={cn("border-2 rounded-xl p-4 md:p-5 flex flex-col items-center gap-2 md:gap-3 transition-all relative", effectiveLayout === "hero" ? "border-foreground bg-white" : "border-gray-200 hover:border-gray-300", (theme.background_type === "image" || theme.background_type === "gradient" || theme.background_type === "video" || ((theme as any).background_pattern && (theme as any).background_pattern !== "none")) && "opacity-50 cursor-not-allowed")}>
            <div className="w-full h-10 bg-gradient-to-b from-gray-300 to-gray-100 rounded-lg flex items-end justify-center pb-1"><Move className="h-4 w-4 text-gray-400" /></div>
            <span className="text-xs md:text-sm font-medium">Hero</span>
          </button>
        </div>
        {theme.background_type === "image" && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
            Hero layout is disabled when using an image wallpaper.{" "}
            <button onClick={() => updateTheme({ background_type: "solid" })} className="underline font-medium hover:text-amber-700">Disable</button>
          </p>
        )}
        {theme.background_type === "gradient" && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
            Hero layout is disabled when using a gradient wallpaper.{" "}
            <button onClick={() => updateTheme({ background_type: "solid" })} className="underline font-medium hover:text-amber-700">Disable</button>
          </p>
        )}
        {theme.background_type === "video" && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
            Hero layout is disabled when using a video wallpaper.{" "}
            <button onClick={() => updateTheme({ background_type: "solid" })} className="underline font-medium hover:text-amber-700">Disable</button>
          </p>
        )}
        {(theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
            Hero layout is disabled when using a pattern.{" "}
            <button onClick={() => updateTheme({ background_pattern: "none" } as any)} className="underline font-medium hover:text-amber-700">Disable</button>
          </p>
        )}
        {effectiveLayout === "hero" && theme.background_type === "solid" && !((theme as any).background_pattern && (theme as any).background_pattern !== "none") && <p className="text-xs text-muted-foreground">Hero displays your avatar as a full-width background with fade</p>}
      </div>

      {/* Laser Glow Avatar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <Label className="text-sm font-medium">Laser Glow Avatar</Label>
          </div>
          <Toggle
            checked={(theme as any).laser_glow_enabled || false}
            onCheckedChange={(checked) => updateTheme({ laser_glow_enabled: checked } as any)}
          />
        </div>
        {(theme as any).laser_glow_enabled && (
          <div className="space-y-3 pl-6">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Glow Color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input type="color" value={(theme as any).laser_glow_color || "#3b82f6"} onChange={(e) => updateTheme({ laser_glow_color: e.target.value } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="w-10 h-10 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: (theme as any).laser_glow_color || "#3b82f6" }} />
                </div>
                <Input value={(theme as any).laser_glow_color || "#3b82f6"} onChange={(e) => updateTheme({ laser_glow_color: e.target.value } as any)} placeholder="#3b82f6" className="h-10 rounded-lg flex-1 font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Intensity</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "low", label: "Low" },
                  { id: "medium", label: "Medium" },
                  { id: "hard", label: "Hard" },
                ] as const).map((intensity) => (
                  <button
                    key={intensity.id}
                    onClick={() => updateTheme({ laser_glow_intensity: intensity.id } as any)}
                    className={cn(
                      "py-2 rounded-lg border-2 text-xs font-medium transition-colors",
                      ((theme as any).laser_glow_intensity || "medium") === intensity.id
                        ? "border-foreground bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {intensity.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Display Name</Label>
        <Input value={onepage.title} onChange={(e) => updateProfile({ title: e.target.value })} placeholder="Your name" className="h-10 rounded-lg" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Bio</Label>
        <Input value={onepage.bio || ""} onChange={(e) => updateProfile({ bio: e.target.value })} placeholder="A short bio..." className="h-10 rounded-lg" />
      </div>

      {/* Title Style Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title Style</Label>
        <div className="flex gap-2">
          <button
            onClick={() => updateTheme({ title_style: "text" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              ((theme as any).title_style || "text") === "text"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Text Based
          </button>
          <button
            onClick={() => updateTheme({ title_style: "logo" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              (theme as any).title_style === "logo"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Logo Based
          </button>
        </div>
      </div>

      {/* Logo Upload - only show when Logo Based is selected */}
      {(theme as any).title_style === "logo" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Logo Image</Label>
          {(theme as any).title_logo_url ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border-2 border-gray-200 overflow-hidden bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/10px_10px]">
                <img src={(theme as any).title_logo_url} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogoUploadModal(true)}
                  className="flex-1 h-9 rounded-lg"
                >
                  Change
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveLogo}
                  className="h-9 w-9 p-0 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLogoUploadModal(true)}
              className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors flex flex-col items-center justify-center gap-2"
            >
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Upload Logo</span>
            </button>
          )}
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>For best results, use a logo with a transparent background (PNG format)</span>
          </p>

          {/* Logo Position */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Logo Position</Label>
            <div className="flex gap-2">
              <button
                onClick={() => updateTheme({ logo_position: "default" } as any)}
                className={cn(
                  "flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all border-2",
                  (theme as any).logo_position !== "more_up"
                    ? "bg-white border-gray-900 text-gray-900"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                )}
              >
                Default
              </button>
              <button
                onClick={() => updateTheme({ logo_position: "more_up" } as any)}
                className={cn(
                  "flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all border-2",
                  (theme as any).logo_position === "more_up"
                    ? "bg-white border-gray-900 text-gray-900"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                )}
              >
                More Up
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-100" />

      {/* Title Font Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title Font</Label>
        <button
          onClick={() => setShowTitleFontModal(true)}
          className="w-full h-10 px-3 rounded-lg border border-input bg-background flex items-center justify-between hover:bg-accent transition-colors"
        >
          <span
            className="truncate"
            style={{ fontFamily: (theme as any).title_font || theme.font_family }}
          >
            {(theme as any).title_font || "Default (Same as body)"}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* Title Font Modal */}
      <Dialog open={showTitleFontModal} onOpenChange={setShowTitleFontModal}>
        <DialogContent className="w-[calc(100%-32px)] sm:max-w-md max-w-[100vw] p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[80vh] sm:max-h-[70vh] flex flex-col">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-lg font-semibold">Select Title Font</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            {TITLE_FONTS.map((font) => (
              <button
                key={font.name}
                onClick={() => {
                  updateTheme({ title_font: font.value } as any)
                  setShowTitleFontModal(false)
                }}
                className={cn(
                  "w-full p-4 sm:p-3 rounded-lg text-left transition-colors flex items-center justify-between",
                  (theme as any).title_font === font.value || (!font.value && !(theme as any).title_font)
                    ? "bg-violet-50"
                    : "hover:bg-gray-50"
                )}
              >
                <span
                  className="text-base sm:text-lg truncate flex-1 min-w-0"
                  style={{ fontFamily: font.value || theme.font_family }}
                >
                  {font.name}
                </span>
                {((theme as any).title_font === font.value || (!font.value && !(theme as any).title_font)) && (
                  <Check className="h-5 w-5 text-violet-500 shrink-0 ml-2" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="border-t border-gray-100" />

      {/* Title & Logo Size Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title & Logo size</Label>
        <div className="flex gap-2">
          <button
            onClick={() => updateTheme({ title_size: "default" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              ((theme as any).title_size || "default") === "default"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Default
          </button>
          <button
            onClick={() => updateTheme({ title_size: "large" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              (theme as any).title_size === "large"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Large
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Title Color Picker - Simple & Reliable */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="color"
              value={(theme as any).title_color || theme.text_color}
              onChange={(e) => updateTheme({ title_color: e.target.value } as any)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
              style={{ backgroundColor: (theme as any).title_color || theme.text_color }}
            />
          </div>
          <Input
            value={(theme as any).title_color || theme.text_color}
            onChange={(e) => updateTheme({ title_color: e.target.value } as any)}
            placeholder="#000000"
            className="h-12 rounded-xl flex-1 font-mono text-sm"
          />
          {(theme as any).title_color && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateTheme({ title_color: null } as any)}
              className="h-12 px-3"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Suggested Colors */}
        <div className="flex gap-2 pt-1">
          {['#ffffff', '#000000', '#1a1a1a', '#3b82f6', '#ef4444', '#10b981'].map((color) => (
            <button
              key={color}
              onClick={() => updateTheme({ title_color: color } as any)}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                (theme as any).title_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThemeSection() {
  const { onepage, updateTheme, updateSettings, updateBlock } = useOnePage()
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
    <div className="space-y-6">
      <h2 className="text-lg md:text-xl font-semibold">Theme</h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all", "light", "dark", "gradient", "image"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors whitespace-nowrap", filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{f}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        {filteredTemplates.map((template) => {
          const config = template.theme_config
          if (!config) return null
          const isSelected = theme.template_id === template.id
          const isDefaultTheme = (template as any).isDefault
          const bgStyle = config.background_type === "image" && config.background_image_url
            ? { backgroundImage: `url(${config.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: config.background_type === "gradient" && config.background_gradient ? config.background_gradient : config.background_color }

          // Special rendering for Default theme
          if (isDefaultTheme) {
            return (
              <button key={template.id} onClick={() => handleApplyTemplate(template)} className={cn("relative rounded-2xl overflow-hidden aspect-[3/4] transition-all group border-2", isSelected ? "ring-2 ring-violet-500 ring-offset-2 border-gray-200" : "border-gray-200 hover:ring-2 hover:ring-gray-300 hover:ring-offset-1")}>
                <div className="absolute inset-0 bg-white" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] font-medium text-gray-400" style={{ fontFamily: config.font_family }}>Default</span>
                </div>
                {isSelected && <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>}
              </button>
            )
          }

          // Check if this theme uses hero layout
          const isHeroLayout = (template as any).profile_layout === "hero" || (config as any).header_layout === "hero"
          // Check if theme has a pattern
          const hasPattern = (config as any).background_pattern && (config as any).background_pattern !== "none"
          const patternColor = (config as any).pattern_color || "#ffffff90"
          const patternId = (config as any).background_pattern

          return (
            <button key={template.id} onClick={() => handleApplyTemplate(template)} className={cn("relative rounded-2xl overflow-hidden aspect-[3/4] transition-all group", isSelected ? "ring-2 ring-violet-500 ring-offset-2" : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-1")}>
              <div className="absolute inset-0" style={bgStyle} />
              {/* Pattern overlay for themes with patterns */}
              {hasPattern && (
                <div className="absolute inset-0 opacity-60">
                  <PatternPreview pattern={patternId} color={patternColor} />
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
                {isHeroLayout ? (
                  /* Hero layout: wide banner-style header */
                  <>
                    <div className="w-full h-8 md:h-10 rounded-lg" style={{ backgroundColor: `${config.text_color}20` }} />
                    <div className="w-12 md:w-16 h-1.5 md:h-2 rounded" style={{ backgroundColor: `${config.text_color}50` }} />
                    <div className="w-8 md:w-12 h-1 rounded" style={{ backgroundColor: `${config.text_color}30` }} />
                  </>
                ) : (
                  /* Classic layout: circle avatar */
                  <>
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full" style={{ backgroundColor: `${config.text_color}30` }} />
                    <div className="w-12 md:w-16 h-1.5 md:h-2 rounded" style={{ backgroundColor: `${config.text_color}50` }} />
                    <div className="w-8 md:w-12 h-1 rounded" style={{ backgroundColor: `${config.text_color}30` }} />
                  </>
                )}
                <div className="w-full max-w-[60px] md:max-w-[80px] h-5 md:h-6 rounded-md mt-2" style={{ backgroundColor: config.button_color, borderWidth: config.button_border_width, borderColor: config.button_border_color, borderRadius: `${config.button_border_radius}px` }} />
              </div>
              {isSelected && <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-ring"><Check className="h-3 w-3 text-white" /></div>}
              {/* Theme name with font preview */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent">
                <p className="text-[10px] md:text-xs font-medium text-white text-center" style={{ fontFamily: config.font_family }}>{template.name}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Layout Change Dialog */}
      <Dialog open={showLayoutChangeDialog} onOpenChange={setShowLayoutChangeDialog}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 pb-0">
            <DialogTitle className="text-lg font-semibold text-center">Update profile image style?</DialogTitle>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Pattern Preview Component for showing pattern thumbnails
function PatternPreview({ pattern, color }: { pattern: string; color: string }) {
  const patternSVGs: Record<string, React.ReactNode> = {
    grid: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`grid-${color}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${color})`} />
      </svg>
    ),
    dots: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`dots-${color}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="1.5" fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${color})`} />
      </svg>
    ),
    waves: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`waves-${color}`} width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 10 Q10 0, 20 10 T40 10" fill="none" stroke={color} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#waves-${color})`} />
      </svg>
    ),
    zigzag: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`zigzag-${color}`} width="20" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={color} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#zigzag-${color})`} />
      </svg>
    ),
    diagonal: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`diagonal-${color}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 10 L10 0" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#diagonal-${color})`} />
      </svg>
    ),
    morph: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`morph-${color}`} width="200" height="200" patternUnits="userSpaceOnUse">
            {/* Futuristic melting/morphing shapes - tech aesthetic */}
            <path d="M40 20 Q60 40, 40 60 Q20 80, 40 100 Q60 80, 80 100 Q100 120, 80 140 Q60 120, 40 140 Q20 160, 40 180" fill="none" stroke={color} strokeWidth="2" opacity="0.5" />
            <path d="M120 10 Q140 30, 160 20 Q180 40, 160 60 Q180 80, 160 100 Q140 80, 120 100 Q100 80, 120 60" fill="none" stroke={color} strokeWidth="2" opacity="0.4" />
            <path d="M100 140 Q120 160, 140 150 Q160 170, 140 190 Q120 170, 100 180" fill="none" stroke={color} strokeWidth="2" opacity="0.45" />
            <circle cx="50" cy="50" r="8" fill={color} opacity="0.3" />
            <circle cx="150" cy="70" r="6" fill={color} opacity="0.25" />
            <circle cx="100" cy="160" r="5" fill={color} opacity="0.3" />
            <rect x="170" y="150" width="20" height="2" fill={color} opacity="0.4" rx="1" />
            <rect x="10" y="100" width="15" height="2" fill={color} opacity="0.35" rx="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#morph-${color})`} />
      </svg>
    ),
    organic: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`organic-${color}`} width="200" height="200" patternUnits="userSpaceOnUse">
            {/* Natural, soft, irregular organic shapes */}
            <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={color} opacity="0.35" />
            <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={color} opacity="0.3" />
            <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={color} opacity="0.32" />
            <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={color} opacity="0.28" />
            <path d="M20 160 Q35 150, 45 165 Q50 180, 35 190 Q20 185, 15 175 Q12 165, 20 160" fill={color} opacity="0.25" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#organic-${color})`} />
      </svg>
    ),
    flowmaze: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`flowmaze-${color}`} width="400" height="400" patternUnits="userSpaceOnUse">
            {/* Flow Maze - organic flowing continuous maze-like lines */}
            <path d="M20 50 Q60 20, 100 50 Q140 80, 120 130 Q100 180, 60 170 Q20 160, 30 120 Q40 80, 80 90 Q120 100, 140 140 Q160 180, 130 220 Q100 260, 60 240 Q20 220, 40 180" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.5" />
            <path d="M180 30 Q220 10, 260 40 Q300 70, 280 120 Q260 170, 220 150 Q180 130, 200 90 Q220 50, 260 70 Q300 90, 320 140 Q340 190, 300 230 Q260 270, 220 250 Q180 230, 200 190 Q220 150, 270 170 Q320 190, 340 240" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.45" />
            <path d="M350 50 Q390 30, 400 80 Q395 130, 360 120 Q320 110, 340 70 Q360 30, 400 50" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
            <path d="M30 280 Q70 250, 110 280 Q150 310, 130 360 Q110 400, 70 380 Q30 360, 50 320 Q70 280, 110 300 Q150 320, 160 370" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.48" />
            <path d="M200 290 Q240 260, 280 290 Q320 320, 300 370 Q280 400, 240 385 Q200 370, 220 330 Q240 290, 290 310 Q340 330, 360 380 Q380 400, 370 400" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.42" />
            <path d="M60 350 Q100 370, 90 400 M160 260 Q200 240, 180 200 Q160 160, 120 180 Q80 200, 100 240" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.38" />
            <path d="M320 10 Q360 30, 350 70 Q340 110, 300 100 Q260 90, 280 50 Q300 10, 340 20" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.35" />
            <path d="M380 280 Q400 320, 380 360 Q360 400, 320 380 Q280 360, 310 320 Q340 280, 380 300" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#flowmaze-${color})`} />
      </svg>
    ),
    topographic: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`topographic-${color}`} width="300" height="300" patternUnits="userSpaceOnUse">
            {/* Topographic - contour lines like elevation maps */}
            <ellipse cx="100" cy="100" rx="90" ry="80" fill="none" stroke={color} strokeWidth="1.5" opacity="0.3" />
            <ellipse cx="100" cy="100" rx="70" ry="62" fill="none" stroke={color} strokeWidth="1.5" opacity="0.35" />
            <ellipse cx="100" cy="100" rx="50" ry="44" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
            <ellipse cx="100" cy="100" rx="30" ry="26" fill="none" stroke={color} strokeWidth="1.5" opacity="0.45" />
            <ellipse cx="100" cy="100" rx="12" ry="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
            <ellipse cx="220" cy="200" rx="75" ry="90" fill="none" stroke={color} strokeWidth="1.5" opacity="0.28" />
            <ellipse cx="220" cy="200" rx="55" ry="70" fill="none" stroke={color} strokeWidth="1.5" opacity="0.33" />
            <ellipse cx="220" cy="200" rx="35" ry="50" fill="none" stroke={color} strokeWidth="1.5" opacity="0.38" />
            <ellipse cx="220" cy="200" rx="18" ry="30" fill="none" stroke={color} strokeWidth="1.5" opacity="0.43" />
            <ellipse cx="50" cy="250" rx="45" ry="40" fill="none" stroke={color} strokeWidth="1.5" opacity="0.3" />
            <ellipse cx="50" cy="250" rx="28" ry="25" fill="none" stroke={color} strokeWidth="1.5" opacity="0.38" />
            <ellipse cx="50" cy="250" rx="12" ry="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.45" />
            <ellipse cx="250" cy="50" rx="40" ry="45" fill="none" stroke={color} strokeWidth="1.5" opacity="0.32" />
            <ellipse cx="250" cy="50" rx="22" ry="28" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
            <ellipse cx="250" cy="50" rx="8" ry="12" fill="none" stroke={color} strokeWidth="1.5" opacity="0.48" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#topographic-${color})`} />
      </svg>
    ),
    stars: (
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        {/* Stars - subtle dots like space stars */}
        <circle cx="10" cy="15" r="1" fill={color} opacity="0.7" />
        <circle cx="25" cy="8" r="0.8" fill={color} opacity="0.5" />
        <circle cx="45" cy="20" r="1.2" fill={color} opacity="0.6" />
        <circle cx="65" cy="12" r="0.6" fill={color} opacity="0.4" />
        <circle cx="80" cy="25" r="1" fill={color} opacity="0.7" />
        <circle cx="90" cy="10" r="0.8" fill={color} opacity="0.5" />
        <circle cx="15" cy="40" r="0.7" fill={color} opacity="0.4" />
        <circle cx="35" cy="35" r="1" fill={color} opacity="0.6" />
        <circle cx="55" cy="45" r="0.9" fill={color} opacity="0.5" />
        <circle cx="75" cy="38" r="1.1" fill={color} opacity="0.7" />
        <circle cx="95" cy="42" r="0.6" fill={color} opacity="0.4" />
        <circle cx="8" cy="60" r="1" fill={color} opacity="0.6" />
        <circle cx="30" cy="55" r="0.8" fill={color} opacity="0.5" />
        <circle cx="50" cy="65" r="1.2" fill={color} opacity="0.7" />
        <circle cx="70" cy="58" r="0.7" fill={color} opacity="0.4" />
        <circle cx="88" cy="68" r="1" fill={color} opacity="0.6" />
        <circle cx="20" cy="80" r="0.9" fill={color} opacity="0.5" />
        <circle cx="42" cy="75" r="1.1" fill={color} opacity="0.7" />
        <circle cx="62" cy="85" r="0.6" fill={color} opacity="0.4" />
        <circle cx="82" cy="78" r="1" fill={color} opacity="0.6" />
        <circle cx="5" cy="92" r="0.8" fill={color} opacity="0.5" />
        <circle cx="48" cy="95" r="1" fill={color} opacity="0.7" />
        <circle cx="92" cy="90" r="0.7" fill={color} opacity="0.4" />
      </svg>
    ),
  }

  return patternSVGs[pattern] || null
}

function WallpaperSection() {
  const { onepage, updateTheme } = useOnePage()
  const [uploading, setUploading] = useState(false)
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
      color1: colorMatches?.[0] || "#667eea",
      color2: colorMatches?.[1] || "#764ba2"
    }
  }

  const gradientInfo = parseGradient(theme.background_gradient || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)")

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

    updateTheme({ background_type: type })
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

  // Gradient direction component - improved with better UX
  const DirectionDial = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
    const dialRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    const updateAngle = useCallback((clientX: number, clientY: number) => {
      if (!dialRef.current) return
      const rect = dialRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const angle = Math.atan2(clientY - centerY, clientX - centerX)
      let degrees = Math.round((angle * 180) / Math.PI + 90)
      if (degrees < 0) degrees += 360
      // Snap to 15 degree increments for easier control
      degrees = Math.round(degrees / 15) * 15
      if (degrees === 360) degrees = 0
      onChange(degrees)
    }, [onChange])

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      updateAngle(clientX, clientY)
    }

    useEffect(() => {
      const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        updateAngle(clientX, clientY)
      }
      const handleEnd = () => setIsDragging(false)

      if (isDragging) {
        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleEnd)
        window.addEventListener('touchmove', handleMove)
        window.addEventListener('touchend', handleEnd)
      }
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleEnd)
        window.removeEventListener('touchmove', handleMove)
        window.removeEventListener('touchend', handleEnd)
      }
    }, [isDragging, updateAngle])

    // Quick preset angles
    const presetAngles = [0, 45, 90, 135, 180, 225, 270, 315]

    return (
      <div className="flex flex-col items-center gap-2">
        <div
          ref={dialRef}
          className={cn(
            "w-20 h-20 rounded-full border-2 bg-gradient-to-br from-gray-50 to-gray-100 relative cursor-pointer select-none shadow-inner transition-all",
            isDragging ? "border-violet-500 shadow-lg scale-105" : "border-gray-200 hover:border-gray-300"
          )}
          onMouseDown={handleStart}
          onTouchStart={handleStart}
        >
          {/* Tick marks around the dial */}
          {presetAngles.map((angle) => (
            <div
              key={angle}
              className="absolute w-0.5 h-2 bg-gray-300 rounded-full"
              style={{
                top: '4px',
                left: '50%',
                transformOrigin: '50% 36px',
                transform: `translateX(-50%) rotate(${angle}deg)`
              }}
            />
          ))}

          {/* Rotating indicator */}
          <div
            className="absolute inset-3 rounded-full flex items-start justify-center transition-transform"
            style={{ transform: `rotate(${value}deg)` }}
          >
            <div className="w-2 h-8 bg-gradient-to-b from-violet-500 to-violet-600 rounded-full shadow-md" />
          </div>

          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3 h-3 bg-white rounded-full shadow-sm border border-gray-200" />
          </div>
        </div>
        <span className="text-sm font-medium text-gray-700">{value}°</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Wallpaper</h2>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Type</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["solid", "gradient", "image", "video"] as const).map((type) => (
            <button key={type} onClick={() => handleBgTypeChange(type)} className={cn("py-3 md:py-3.5 rounded-xl border-2 text-xs md:text-sm font-medium capitalize transition-colors", theme.background_type === type ? "border-foreground bg-gray-50" : "border-gray-200 hover:border-gray-300")}>{type}</button>
          ))}
        </div>
      </div>

      {theme.background_type === "solid" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Background color</Label>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input type="color" value={theme.background_color} onChange={(e) => updateTheme({ background_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.background_color }} />
              </div>
              <Input value={theme.background_color} onChange={(e) => updateTheme({ background_color: e.target.value })} placeholder="#ffffff" className="h-12 rounded-xl flex-1 font-mono text-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              {['#ffffff', '#f8f9fa', '#e9ecef', '#1a1a1a', '#0f172a', '#fef3c7'].map((color) => (
                <button key={color} onClick={() => updateTheme({ background_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", theme.background_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>

          {/* Pattern Selector */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Pattern</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BACKGROUND_PATTERNS.map((pattern) => {
                const currentPattern = (theme as any).background_pattern || "none"
                const patternColor = (theme as any).pattern_color || "#00000090"
                return (
                  <button
                    key={pattern.id}
                    onClick={() => updateTheme({ background_pattern: pattern.id } as any)}
                    className={cn(
                      "aspect-square rounded-xl border-2 overflow-hidden transition-all relative",
                      currentPattern === pattern.id ? "border-foreground ring-1 ring-foreground" : "border-gray-200 hover:border-gray-300"
                    )}
                    style={{ backgroundColor: theme.background_color }}
                  >
                    {pattern.id === "none" ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <X className="w-4 h-4 text-gray-400" />
                      </div>
                    ) : (
                      <PatternPreview pattern={pattern.id} color={patternColor} />
                    )}
                    <span className="absolute bottom-1 left-0 right-0 text-[9px] font-medium text-center text-gray-600">{pattern.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Pattern Color */}
          {(theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pattern color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input type="color" value={(theme as any).pattern_color?.replace(/[0-9a-f]{2}$/i, '') || "#000000"} onChange={(e) => updateTheme({ pattern_color: e.target.value + "90" } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: (theme as any).pattern_color || "#00000090" }} />
                </div>
                <Input value={(theme as any).pattern_color || "#00000090"} onChange={(e) => { const val = e.target.value; const normalized = val.match(/^#[0-9a-f]{6}/i) ? val.slice(0, 7) + "90" : val; updateTheme({ pattern_color: normalized } as any) }} placeholder="#00000090" className="h-12 rounded-xl flex-1 font-mono text-sm" />
              </div>
              <div className="flex gap-2 pt-1">
                {['#00000090', '#ffffff90', '#3b82f690', '#10b98190', '#f59e0b90', '#ef444490'].map((color) => (
                  <button key={color} onClick={() => updateTheme({ pattern_color: color } as any)} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", (theme as any).pattern_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          )}

          {/* Pattern Opacity */}
          {(theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pattern opacity</Label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => updateTheme({ pattern_opacity: "low" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "low"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Low
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "medium" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    ((theme as any).pattern_opacity || "medium") === "medium"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Medium
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "hard" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "hard"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Hard
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "very_hard" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "very_hard"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  V.Hard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {theme.background_type === "gradient" && (
        <div className="space-y-5">
          {/* Custom Gradient Editor */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Create your gradient</Label>
            <div className="p-4 border rounded-xl space-y-4">
              {/* Preview */}
              <div 
                className="w-full h-20 rounded-lg"
                style={{ background: `linear-gradient(${gradientInfo.direction}deg, ${gradientInfo.color1} 0%, ${gradientInfo.color2} 100%)` }}
              />
              
              {/* Direction and Colors */}
              <div className="flex items-center gap-4">
                {/* Direction Dial */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">Direction</span>
                  <DirectionDial 
                    value={gradientInfo.direction} 
                    onChange={(dir) => handleGradientChange(dir, gradientInfo.color1, gradientInfo.color2)} 
                  />
                </div>
                
                {/* Color Pickers */}
                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Start color</span>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input type="color" value={gradientInfo.color1} onChange={(e) => handleGradientChange(gradientInfo.direction, e.target.value, gradientInfo.color2)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="w-10 h-10 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: gradientInfo.color1 }} />
                      </div>
                      <Input value={gradientInfo.color1} onChange={(e) => handleGradientChange(gradientInfo.direction, e.target.value, gradientInfo.color2)} className="flex-1 font-mono text-xs h-10 rounded-lg" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">End color</span>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input type="color" value={gradientInfo.color2} onChange={(e) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="w-10 h-10 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: gradientInfo.color2 }} />
                      </div>
                      <Input value={gradientInfo.color2} onChange={(e) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, e.target.value)} className="flex-1 font-mono text-xs h-10 rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animate Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-medium">Animate</span>
            </div>
            <Toggle
              checked={theme.animated_gradient || false}
              onCheckedChange={(checked) => updateTheme({ animated_gradient: checked })}
            />
          </div>

          {/* Noise Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12h.01M12 12h.01M16 12h.01M8 8h.01M12 8h.01M16 8h.01M8 16h.01M12 16h.01M16 16h.01" />
                </svg>
                <span className="text-sm font-medium">Noise</span>
              </div>
              <Toggle
                checked={theme.gradient_noise || false}
                onCheckedChange={(checked) => updateTheme({ gradient_noise: checked })}
              />
            </div>
            {theme.gradient_noise && (
              <div className="px-4 space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Noise strength</Label>
                  <span className="text-sm text-muted-foreground">{(theme as any).noise_strength || 15}%</span>
                </div>
                <Slider
                  value={[(theme as any).noise_strength || 15]}
                  onValueChange={([value]) => updateTheme({ noise_strength: value } as any)}
                  min={5}
                  max={50}
                  step={5}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>
            )}
          </div>

          {/* Gradient Presets */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Presets</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
                "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
                "linear-gradient(180deg, #0c4a6e 0%, #0ea5e9 100%)",
                "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
                "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
                "linear-gradient(135deg, #5f27cd 0%, #341f97 100%)",
                "linear-gradient(135deg, #00d2d3 0%, #54a0ff 100%)",
                "linear-gradient(135deg, #ff9ff3 0%, #f368e0 100%)",
                "linear-gradient(180deg, #2c3e50 0%, #3498db 100%)",
                "linear-gradient(135deg, #ee5a24 0%, #f0932b 100%)",
                "linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)",
                "linear-gradient(135deg, #00b894 0%, #55efc4 100%)",
              ].map((grad, i) => (
                <button key={i} onClick={() => updateTheme({ background_gradient: grad })} className={cn("aspect-square rounded-lg border-2 transition-colors", theme.background_gradient === grad ? "border-gray-900" : "border-transparent hover:border-gray-300")} style={{ background: grad }} />
              ))}
            </div>
          </div>

          {/* Pattern Selector for Gradient */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Pattern</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BACKGROUND_PATTERNS.map((pattern) => {
                const currentPattern = (theme as any).background_pattern || "none"
                const patternColor = (theme as any).pattern_color || "#ffffff90"
                return (
                  <button
                    key={pattern.id}
                    onClick={() => updateTheme({ background_pattern: pattern.id } as any)}
                    className={cn(
                      "aspect-square rounded-xl border-2 overflow-hidden transition-all relative",
                      currentPattern === pattern.id ? "border-white ring-1 ring-white" : "border-white/30 hover:border-white/50"
                    )}
                    style={{ background: theme.background_gradient || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
                  >
                    {pattern.id === "none" ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <X className="w-4 h-4 text-white/60" />
                      </div>
                    ) : (
                      <PatternPreview pattern={pattern.id} color={patternColor} />
                    )}
                    <span className="absolute bottom-1 left-0 right-0 text-[9px] font-medium text-center text-white/80">{pattern.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Pattern Color for Gradient */}
          {(theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pattern color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input type="color" value={(theme as any).pattern_color?.replace(/[0-9a-f]{2}$/i, '') || "#ffffff"} onChange={(e) => updateTheme({ pattern_color: e.target.value + "90" } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: (theme as any).pattern_color || "#ffffff90" }} />
                </div>
                <Input value={(theme as any).pattern_color || "#ffffff90"} onChange={(e) => { const val = e.target.value; const normalized = val.match(/^#[0-9a-f]{6}/i) ? val.slice(0, 7) + "90" : val; updateTheme({ pattern_color: normalized } as any) }} placeholder="#ffffff90" className="h-12 rounded-xl flex-1 font-mono text-sm" />
              </div>
              <div className="flex gap-2 pt-1">
                {['#ffffff90', '#00000090', '#3b82f690', '#10b98190', '#f59e0b90', '#ef444490'].map((color) => (
                  <button key={color} onClick={() => updateTheme({ pattern_color: color } as any)} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", (theme as any).pattern_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          )}

          {/* Pattern Opacity for Gradient */}
          {(theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pattern opacity</Label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => updateTheme({ pattern_opacity: "low" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "low"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Low
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "medium" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    ((theme as any).pattern_opacity || "medium") === "medium"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Medium
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "hard" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "hard"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  Hard
                </button>
                <button
                  onClick={() => updateTheme({ pattern_opacity: "very_hard" } as any)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                    (theme as any).pattern_opacity === "very_hard"
                      ? "bg-white border-gray-900 text-gray-900"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  V.Hard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {theme.background_type === "image" && (
        <div className="space-y-5">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Background image</Label>
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
              {uploading ? <Loader2 className="h-8 w-8 text-gray-400 animate-spin" /> : <Upload className="h-8 w-8 text-gray-300 mb-2" />}
              <p className="text-sm text-gray-500">{uploading ? "Uploading..." : "Upload image"}</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </div>
          {theme.background_image_url && (
            <div className="relative rounded-xl overflow-hidden aspect-video">
              <img 
                src={theme.background_image_url} 
                alt="Background" 
                className="w-full h-full object-cover"
                style={{ 
                  filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)` 
                }}
              />
              <button onClick={() => updateTheme({ background_image_url: "" })} className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"><X className="h-4 w-4 text-white" /></button>
            </div>
          )}

          {/* Image Controls */}
          {theme.background_image_url && (
            <div className="space-y-4">
              {/* Brightness Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Brightness</Label>
                  <span className="text-xs text-muted-foreground">{(theme as any).image_brightness || 100}%</span>
                </div>
                <Slider 
                  value={[(theme as any).image_brightness || 100]} 
                  onValueChange={(v) => updateTheme({ image_brightness: v[0] } as any)}
                  min={20}
                  max={150}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Blur Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Blur</Label>
                  <span className="text-xs text-muted-foreground">{(theme as any).image_blur || 0}px</span>
                </div>
                <Slider 
                  value={[(theme as any).image_blur || 0]} 
                  onValueChange={(v) => updateTheme({ image_blur: v[0] } as any)}
                  min={0}
                  max={20}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Noise Toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h.01M12 12h.01M16 12h.01M8 8h.01M12 8h.01M16 8h.01M8 16h.01M12 16h.01M16 16h.01" />
                    </svg>
                    <span className="text-sm font-medium">Noise</span>
                  </div>
                  <Toggle
                    checked={(theme as any).image_noise || false}
                    onCheckedChange={(checked) => updateTheme({ image_noise: checked } as any)}
                  />
                </div>
                {(theme as any).image_noise && (
                  <div className="px-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Noise strength</Label>
                      <span className="text-sm text-muted-foreground">{(theme as any).noise_strength || 15}%</span>
                    </div>
                    <Slider
                      value={[(theme as any).noise_strength || 15]}
                      onValueChange={([value]) => updateTheme({ noise_strength: value } as any)}
                      min={5}
                      max={50}
                      step={5}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtle</span>
                      <span>Strong</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Or choose from library</Label>
            <div className="grid grid-cols-3 gap-2">
              {BACKGROUND_IMAGES.map((bg) => (
                <button key={bg.id} onClick={() => handleImageSelect(bg.url)} className={cn("aspect-square rounded-lg overflow-hidden border-2 transition-colors", theme.background_image_url === bg.url ? "border-violet-500" : "border-transparent hover:border-gray-300")}>
                  <img src={bg.url} alt={bg.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {theme.background_type === "video" && (
        <div className="space-y-5">
          {/* Video Preview */}
          {(theme as any).background_video_url ? (
            <>
              <div className="relative rounded-xl overflow-hidden aspect-[9/16] max-h-[300px] mx-auto">
                <video
                  src={(theme as any).background_video_url}
                  className="w-full h-full object-cover"
                  style={{
                    filter: `brightness(${(theme as any).video_brightness || 100}%)`
                  }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
                <button onClick={handleRemoveWallpaperVideo} className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"><X className="h-4 w-4 text-white" /></button>
              </div>

              {/* Video Brightness Options */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Brightness</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Normal", value: 100 },
                    { label: "Medium", value: 85 },
                    { label: "Low", value: 70 },
                    { label: "Very Low", value: 40 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateTheme({ video_brightness: option.value } as any)}
                      className={cn(
                        "py-2.5 px-2 rounded-xl text-xs font-medium transition-all border-2",
                        ((theme as any).video_brightness || 100) === option.value
                          ? "bg-white border-gray-900 text-gray-900"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Change Video Button */}
              <Button
                variant="outline"
                onClick={() => setShowWallpaperVideoModal(true)}
                className="w-full h-12 rounded-xl"
              >
                <Video className="h-4 w-4 mr-2" />
                Change Video
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Background video</Label>
              <div onClick={() => setShowWallpaperVideoModal(true)} className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                <Video className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Upload video</p>
                <p className="text-xs text-gray-400 mt-1">MP4, WebM, or MOV (max 100MB)</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Video Picker Modal */}
      <Dialog open={showWallpaperVideoModal} onOpenChange={setShowWallpaperVideoModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => setShowWallpaperVideoModal(false)} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload Video</DialogTitle>
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
        </DialogContent>
      </Dialog>

      {/* Video Crop Modal */}
      <Dialog open={showWallpaperVideoCropModal} onOpenChange={(open) => {
        setShowWallpaperVideoCropModal(open)
        if (!open) {
          if (tempWallpaperVideoUrl) URL.revokeObjectURL(tempWallpaperVideoUrl)
          setTempWallpaperVideoUrl(null)
          setTempWallpaperVideoFile(null)
          setIsWallpaperVideoDragging(false)
          setIsWallpaperVideoResizing(null)
        }
      }}>
        <DialogContent
          className="w-[calc(100%-32px)] max-w-md sm:max-w-lg md:max-w-xl p-0 gap-0 overflow-hidden rounded-2xl mx-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowWallpaperVideoCropModal(false); setShowWallpaperVideoModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Video</DialogTitle>
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
        </DialogContent>
      </Dialog>

      {/* Layout Change Dialog */}
      <Dialog open={showLayoutChangeDialog} onOpenChange={setShowLayoutChangeDialog}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 pb-0">
            <DialogTitle className="text-lg font-semibold text-center">Update profile image style?</DialogTitle>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TextSection() {
  const { onepage, updateTheme } = useOnePage()
  const [showFontModal, setShowFontModal] = useState(false)
  const [showTitleFontModal, setShowTitleFontModal] = useState(false)
  const [fontFilter, setFontFilter] = useState<"all" | "sans" | "serif" | "display" | "mono" | "handwritten">("all")
  const [fontSearch, setFontSearch] = useState("")

  if (!onepage) return null
  const { theme } = onepage
  const titleFont = (theme as any).title_font || null

  const filteredFonts = FONTS.filter(font => {
    const matchesFilter = fontFilter === "all" || font.category === fontFilter
    const matchesSearch = font.name.toLowerCase().includes(fontSearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Text</h2>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Font</Label>
        <button onClick={() => setShowFontModal(true)} className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><Type className="h-5 w-5 text-gray-500" /></div>
            <div className="text-left">
              <p className="font-medium" style={{ fontFamily: theme.font_family }}>{FONTS.find(f => f.value === theme.font_family)?.name || theme.font_family}</p>
              <p className="text-xs text-muted-foreground">{FONTS.find(f => f.value === theme.font_family)?.style || "Custom"}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </button>
      </div>
      <Dialog open={showFontModal} onOpenChange={setShowFontModal}>
        <DialogContent className="w-[calc(100%-32px)] sm:max-w-md max-w-[100vw] p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[80vh] sm:max-h-[70vh] flex flex-col">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-lg font-semibold">Choose Font</DialogTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} placeholder="Search fonts..." className="pl-9 h-10" />
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
              {FONT_CATEGORIES.map((cat) => (
                <button key={cat.id} onClick={() => setFontFilter(cat.id as any)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors", fontFilter === cat.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{cat.label}</button>
              ))}
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            {filteredFonts.map((font) => (
              <button key={font.name} onClick={() => { updateTheme({ font_family: font.value }); setShowFontModal(false) }} className={cn("w-full p-4 sm:p-3 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors", theme.font_family === font.value && "bg-violet-50")}>
                <div className="flex-1 min-w-0"><p style={{ fontFamily: font.value }} className="text-base truncate">{font.name}</p><p className="text-xs text-muted-foreground">{font.style}</p></div>
                {theme.font_family === font.value && <Check className="h-5 w-5 text-violet-500 shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="border-t border-gray-100" />

      {/* Title Font Selector */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Title font</Label>
        <button onClick={() => setShowTitleFontModal(true)} className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><Type className="h-5 w-5 text-gray-500" /></div>
            <div className="text-left">
              <p className="font-medium" style={{ fontFamily: titleFont || theme.font_family }}>
                {titleFont ? TITLE_FONTS.find(f => f.value === titleFont)?.name || titleFont : "Default (Same as body)"}
              </p>
              <p className="text-xs text-muted-foreground">{titleFont ? "Custom title font" : "Uses body font"}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </button>
      </div>
      <Dialog open={showTitleFontModal} onOpenChange={setShowTitleFontModal}>
        <DialogContent className="w-[calc(100%-32px)] sm:max-w-md max-w-[100vw] p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[80vh] sm:max-h-[70vh] flex flex-col">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-lg font-semibold">Choose Title Font</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            {TITLE_FONTS.map((font) => (
              <button
                key={font.name}
                onClick={() => { updateTheme({ title_font: font.value } as any); setShowTitleFontModal(false) }}
                className={cn(
                  "w-full p-4 sm:p-3 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors",
                  titleFont === font.value && "bg-violet-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p style={{ fontFamily: font.value || theme.font_family }} className="text-base sm:text-base truncate">
                    {font.name}
                  </p>
                </div>
                {titleFont === font.value && <Check className="h-5 w-5 text-violet-500 shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="border-t border-gray-100" />

      {/* Title & Logo Size Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title & Logo size</Label>
        <div className="flex gap-2">
          <button
            onClick={() => updateTheme({ title_size: "default" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              ((theme as any).title_size || "default") === "default"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Default
          </button>
          <button
            onClick={() => updateTheme({ title_size: "large" } as any)}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2",
              (theme as any).title_size === "large"
                ? "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            )}
          >
            Large
          </button>
        </div>
      </div>

      {/* Title color */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Title color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={(theme as any).title_color || theme.text_color} onChange={(e) => updateTheme({ title_color: e.target.value } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: (theme as any).title_color || theme.text_color }} />
          </div>
          <Input value={(theme as any).title_color || theme.text_color} onChange={(e) => updateTheme({ title_color: e.target.value } as any)} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#ffffff', '#000000', '#1a1a1a', '#3b82f6', '#ef4444', '#10b981'].map((color) => (
            <button key={color} onClick={() => updateTheme({ title_color: color } as any)} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", ((theme as any).title_color || theme.text_color) === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Text color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={theme.text_color} onChange={(e) => updateTheme({ text_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.text_color }} />
          </div>
          <Input value={theme.text_color} onChange={(e) => updateTheme({ text_color: e.target.value })} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#ffffff', '#000000', '#1a1a1a', '#3b82f6', '#ef4444', '#10b981'].map((color) => (
            <button key={color} onClick={() => updateTheme({ text_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", theme.text_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Secondary text color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={theme.secondary_text_color || theme.text_color} onChange={(e) => updateTheme({ secondary_text_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.secondary_text_color || theme.text_color }} />
          </div>
          <Input value={theme.secondary_text_color || theme.text_color} onChange={(e) => updateTheme({ secondary_text_color: e.target.value })} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#6b7280', '#9ca3af', '#d1d5db', '#374151', '#1f2937', '#111827'].map((color) => (
            <button key={color} onClick={() => updateTheme({ secondary_text_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", (theme.secondary_text_color || theme.text_color) === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
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

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Buttons</h2>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Style</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["filled", "outline", "glass"] as const).map((style) => (
            <button key={style} onClick={() => handleButtonStyleChange(style)} className={cn("py-3 md:py-3.5 rounded-xl border-2 text-xs md:text-sm font-medium capitalize transition-colors", theme.button_style === style ? "border-foreground bg-gray-50" : "border-gray-200 hover:border-gray-300")}>{style === "filled" ? "Solid" : style}</button>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-2">
        <Label className="text-sm font-medium">Button color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={theme.button_color} onChange={(e) => updateTheme({ button_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.button_color }} />
          </div>
          <Input value={theme.button_color} onChange={(e) => updateTheme({ button_color: e.target.value })} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#000000', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map((color) => (
            <button key={color} onClick={() => updateTheme({ button_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", theme.button_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-2">
        <Label className="text-sm font-medium">Button text color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={theme.button_text_color} onChange={(e) => updateTheme({ button_text_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.button_text_color }} />
          </div>
          <Input value={theme.button_text_color} onChange={(e) => updateTheme({ button_text_color: e.target.value })} placeholder="#ffffff" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#ffffff', '#000000', '#1a1a1a', '#f8fafc', '#fef3c7', '#ecfdf5'].map((color) => (
            <button key={color} onClick={() => updateTheme({ button_text_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", theme.button_text_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-3">
        <Label className="text-sm font-medium">Shadows</Label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { id: "none", label: "None" },
            { id: "subtle", label: "Subtle" },
            { id: "strong", label: "Strong" },
            { id: "hard", label: "Hard" },
          ] as const).map((shadow) => (
            <button
              key={shadow.id}
              onClick={() => updateTheme({ button_shadow: shadow.id } as any)}
              className={cn(
                "py-3 rounded-xl border-2 text-xs md:text-sm font-medium transition-colors",
                (theme as any).button_shadow === shadow.id || (!((theme as any).button_shadow) && shadow.id === "none")
                  ? "border-foreground bg-gray-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              {shadow.label}
            </button>
          ))}
        </div>
      </div>
      {/* Shadow Color - only show when shadow is enabled */}
      {(theme as any).button_shadow && (theme as any).button_shadow !== "none" && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Shadow color</Label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="color" value={(theme as any).button_shadow_color || "#000000"} onChange={(e) => updateTheme({ button_shadow_color: e.target.value } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: (theme as any).button_shadow_color || "#000000" }} />
            </div>
            <Input value={(theme as any).button_shadow_color || "#000000"} onChange={(e) => updateTheme({ button_shadow_color: e.target.value } as any)} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
          </div>
        </div>
      )}
      <div className="border-t border-gray-100" />
      <div className="space-y-3">
        <div className="flex justify-between items-center"><Label className="text-sm font-medium">Corners</Label><span className="text-sm text-muted-foreground">{theme.button_border_radius}px</span></div>
        <Slider value={[theme.button_border_radius]} onValueChange={([value]) => updateTheme({ button_border_radius: value })} min={0} max={24} step={2} />
        <div className="flex justify-between text-xs text-muted-foreground"><span>Square</span><span>Round</span></div>
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-3">
        <div className="flex justify-between items-center"><Label className="text-sm font-medium">Border width</Label><span className="text-sm text-muted-foreground">{theme.button_border_width}px</span></div>
        <Slider value={[theme.button_border_width]} onValueChange={([value]) => updateTheme({ button_border_width: value })} min={0} max={4} step={1} />
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-2">
        <Label className="text-sm font-medium">Border color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={theme.button_border_color} onChange={(e) => updateTheme({ button_border_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: theme.button_border_color }} />
          </div>
          <Input value={theme.button_border_color} onChange={(e) => updateTheme({ button_border_color: e.target.value })} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#000000', '#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((color) => (
            <button key={color} onClick={() => updateTheme({ button_border_color: color })} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", theme.button_border_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100" />
      {/* Button Animations Section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Button Animations</Label>
        <p className="text-xs text-muted-foreground -mt-1">Subtle hover effects for buttons</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "default", label: "Default", desc: "Scale up" },
            { id: "fade", label: "Fade", desc: "Opacity" },
            { id: "zoom", label: "Zoom", desc: "Grow" },
          ] as const).map((animation) => (
            <button
              key={animation.id}
              onClick={() => updateTheme({ button_hover_animation: animation.id } as any)}
              className={cn(
                "py-3 px-2 rounded-xl border-2 text-xs md:text-sm font-medium transition-colors flex flex-col items-center gap-0.5",
                ((theme as any).button_hover_animation || "default") === animation.id
                  ? "border-foreground bg-gray-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <span>{animation.label}</span>
              <span className="text-[10px] text-muted-foreground font-normal">{animation.desc}</span>
            </button>
          ))}
        </div>
      </div>
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
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Social Icons</h2>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Style</Label>
        <div className="grid grid-cols-3 gap-3">
          {SOCIAL_STYLES.map((style) => (
            <button
              key={style.id}
              onClick={() => updateTheme({ social_icon_style: style.id } as any)}
              className={cn(
                "py-3 px-4 rounded-2xl text-sm font-medium transition-all",
                socialStyle === style.id
                  ? "bg-gray-100 border-2 border-gray-900 text-gray-900"
                  : "bg-gray-100 border-2 border-transparent text-gray-600 hover:bg-gray-200"
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100" />
      <div className="space-y-2">
        <Label className="text-sm font-medium">Icon color</Label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="color" value={socialColor} onChange={(e) => updateTheme({ social_icon_color: e.target.value } as any)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer" style={{ backgroundColor: socialColor }} />
          </div>
          <Input value={socialColor} onChange={(e) => updateTheme({ social_icon_color: e.target.value } as any)} placeholder="#000000" className="h-12 rounded-xl flex-1 font-mono text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          {['#000000', '#ffffff', '#3b82f6', '#e1306c', '#ff0000', '#1da1f2'].map((color) => (
            <button key={color} onClick={() => updateTheme({ social_icon_color: color } as any)} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110", socialColor === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200")} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="p-4 bg-gray-100 rounded-xl">
        <p className="text-xs text-muted-foreground mb-3">Preview</p>
        <div className="flex gap-3 justify-center">
          {["instagram", "youtube", "twitter"].map((platform) => {
            const IconComponent = SocialIconsSVG[platform]
            return (
              <div 
                key={platform} 
                className="w-10 h-10 rounded-full flex items-center justify-center" 
                style={{ 
                  backgroundColor: socialStyle === "filled" ? `${socialColor}15` : "transparent", 
                  borderWidth: socialStyle === "outline" ? 2 : 0, 
                  borderColor: socialColor, 
                  borderStyle: "solid" 
                }}
              >
                {IconComponent && <IconComponent size={18} color={socialColor} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FooterSection() {
  const { onepage, updateSettings } = useOnePage()
  if (!onepage) return null
  const { settings } = onepage

  // Hide Storelib Branding is the inverse of show_branding
  // When toggle is ON (hide branding) → show_branding: false
  // When toggle is OFF (show branding - default) → show_branding: true
  const hideBrandingEnabled = !settings.show_branding

  const handleHideBrandingChange = (hide: boolean) => {
    // When user wants to hide branding, set show_branding to false
    // This will be checked against Pro plan at save time
    updateSettings({ show_branding: !hide, hide_branding_pro_enabled: hide })
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Footer</h2>
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between p-3 md:p-4 border rounded-xl">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">Hide Storelib Branding</p>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white">
                  PRO
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Remove the "on Storelib" badge from your page</p>
            </div>
          </div>
          <Toggle
            checked={hideBrandingEnabled}
            onCheckedChange={handleHideBrandingChange}
          />
        </div>
        <div className="flex items-center justify-between p-3 md:p-4 border rounded-xl">
          <div><p className="font-medium text-sm">Analytics</p><p className="text-xs text-muted-foreground mt-0.5">Track page views</p></div>
          <Toggle checked={settings.analytics_enabled} onCheckedChange={(checked) => updateSettings({ analytics_enabled: checked })} />
        </div>
      </div>
    </div>
  )
}
