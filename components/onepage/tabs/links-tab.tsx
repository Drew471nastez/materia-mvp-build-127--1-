"use client"

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

// Block enable toggle - purple when checked (same style as theme-checkbox but purple)
function BlockToggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="theme-checkbox-purple"
    />
  )
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { MobileColorPicker } from "@/components/onepage/mobile-color-picker"
import { DeletedIcon, SaveNotification } from "@/components/ui/save-notification"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
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
  Globe,
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import React, { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { BLOCKED_EXTENSIONS, readFileHeader, scanFile, MAX_DIGITAL_PRODUCT_FILE_SIZE } from "@/lib/storage/security"

// Validate social URL and transform if needed
function validateSocialUrl(platform: keyof OnePageSocialLinks, url: string): { valid: boolean; error?: string; transformedUrl?: string } {
  if (!url) return { valid: true }

  // Platform base URLs for @username transformation
  const platformBaseUrls: Record<string, string> = {
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/@",
    twitter: "https://x.com/",
    youtube: "https://youtube.com/@",
    threads: "https://threads.net/@",
    facebook: "https://facebook.com/",
    github: "https://github.com/",
    linkedin: "https://linkedin.com/in/",
    twitch: "https://twitch.tv/",
    snapchat: "https://snapchat.com/add/",
    pinterest: "https://pinterest.com/",
    soundcloud: "https://soundcloud.com/",
    kick: "https://kick.com/",
    patreon: "https://patreon.com/",
    discord: "https://discord.gg/",
  }

  // Handle @username format - transform to full URL
  if (url.startsWith('@')) {
    const username = url.slice(1) // Remove the @ symbol
    const baseUrl = platformBaseUrls[platform]
    if (baseUrl && username) {
      // For platforms that already include @ in URL (tiktok, youtube, threads), don't double it
      return { valid: true, transformedUrl: baseUrl + username }
    }
  }

  // Handle plain username (no @ prefix, no URL) for supported platforms
  if (!url.includes('/') && !url.includes('.') && !url.includes(':') && platformBaseUrls[platform]) {
    const baseUrl = platformBaseUrls[platform]
    return { valid: true, transformedUrl: baseUrl + url }
  }

  // Basic URL validation
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`)
  } catch {
    return { valid: false, error: "Please enter a valid URL or @username" }
  }

  const patterns: Record<keyof OnePageSocialLinks, RegExp> = {
    instagram: /instagram\.com/i,
    tiktok: /tiktok\.com/i,
    youtube: /youtube\.com|youtu\.be/i,
    twitter: /x\.com|twitter\.com/i,
    spotify: /spotify\.com/i,
    website: /.*/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$|mailto:/i,
  }

  const pattern = patterns[platform]
  if (!pattern) return { valid: true, transformedUrl: url }

  // For email, handle mailto: prefix
  if (platform === 'email') {
    if (url.includes('@') && !url.startsWith('mailto:')) {
      return { valid: true, transformedUrl: `mailto:${url}` }
    }
    return { valid: true }
  }

  if (!pattern.test(url)) {
    const platformNames: Record<keyof OnePageSocialLinks, string> = {
      instagram: "Instagram",
      tiktok: "TikTok",
      youtube: "YouTube",
      twitter: "X (Twitter)",
      spotify: "Spotify",
      website: "website",
      email: "email",
    }
    return { valid: false, error: `URL doesn't appear to be a ${platformNames[platform]} link` }
  }

  return { valid: true }
}

// Real SVG social icons for brand accuracy
const SocialIconsSVG: Record<string, React.FC<{ size?: number; color?: string; className?: string }>> = {
  instagram: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  tiktok: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M16.8218 5.1344C16.0887 4.29394 15.648 3.19805 15.648 2H14.7293C14.9659 3.3095 15.7454 4.43326 16.8218 5.1344Z"/>
      <path d="M8.3218 11.9048C6.73038 11.9048 5.43591 13.2004 5.43591 14.7931C5.43591 15.903 6.06691 16.8688 6.98556 17.3517C6.64223 16.8781 6.43808 16.2977 6.43808 15.6661C6.43808 14.0734 7.73255 12.7778 9.324 12.7778C9.62093 12.7778 9.90856 12.8288 10.1777 12.9124V9.40192C9.89927 9.36473 9.61628 9.34149 9.324 9.34149C9.27294 9.34149 9.22654 9.34614 9.1755 9.34614V12.0394C8.90176 11.9558 8.61873 11.9048 8.3218 11.9048Z"/>
      <path d="M19.4245 6.67608V9.34614C17.6429 9.34614 15.9912 8.77501 14.6456 7.80911V14.7977C14.6456 18.2851 11.8108 21.127 8.32172 21.127C6.97621 21.127 5.7235 20.6998 4.69812 19.98C5.8534 21.2198 7.50049 22 9.32392 22C12.8083 22 15.6478 19.1627 15.6478 15.6707V8.68211C16.9933 9.64801 18.645 10.2191 20.4267 10.2191V6.78293C20.0787 6.78293 19.7446 6.74574 19.4245 6.67608Z"/>
      <path d="M14.6456 14.7977V7.80911C15.9912 8.77501 17.6429 9.34614 19.4245 9.34614V6.67608C18.3945 6.45788 17.4899 5.90063 16.8218 5.1344C15.7454 4.43326 14.9704 3.3095 14.7245 2H12.2098L12.2051 15.7775C12.1495 17.3192 10.8782 18.5591 9.32393 18.5591C8.35884 18.5591 7.50977 18.0808 6.98085 17.3564C6.06219 16.8688 5.4312 15.9076 5.4312 14.7977C5.4312 13.205 6.72567 11.9094 8.31708 11.9094C8.61402 11.9094 8.90168 11.9605 9.17079 12.0441V9.35079C5.75598 9.42509 3 12.2298 3 15.6707C3 17.3331 3.64492 18.847 4.69812 19.98C5.7235 20.6998 6.97621 21.127 8.32172 21.127C11.8061 21.127 14.6456 18.2851 14.6456 14.7977Z"/>
    </svg>
  ),
  youtube: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  twitter: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  spotify: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  ),
  linkedin: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  facebook: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  github: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  ),
  twitch: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
    </svg>
  ),
  telegram: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path fillRule="evenodd" clipRule="evenodd" d="M23.1117 4.49449C23.4296 2.94472 21.9074 1.65683 20.4317 2.227L2.3425 9.21601C0.694517 9.85273 0.621087 12.1572 2.22518 12.8975L6.1645 14.7157L8.03849 21.2746C8.13583 21.6153 8.40618 21.8791 8.74917 21.968C9.09216 22.0568 9.45658 21.9576 9.70712 21.707L12.5938 18.8203L16.6375 21.8531C17.8113 22.7334 19.5019 22.0922 19.7967 20.6549L23.1117 4.49449ZM3.0633 11.0816L21.1525 4.0926L17.8375 20.2531L13.1 16.6999C12.7019 16.4013 12.1448 16.4409 11.7929 16.7928L10.5565 18.0292L10.928 15.9861L18.2071 8.70703C18.5614 8.35278 18.5988 7.79106 18.2947 7.39293C17.9906 6.99479 17.4389 6.88312 17.0039 7.13168L6.95124 12.876L3.0633 11.0816ZM8.17695 14.4791L8.78333 16.6015L9.01614 15.321C9.05253 15.1209 9.14908 14.9366 9.29291 14.7928L11.5128 12.573L8.17695 14.4791Z"/>
    </svg>
  ),
  discord: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M2 11.6C2 8.23969 2 6.55953 2.65396 5.27606C3.2292 4.14708 4.14708 3.2292 5.27606 2.65396C6.55953 2 8.23969 2 11.6 2H20.4C23.7603 2 25.4405 2 26.7239 2.65396C27.8529 3.2292 28.7708 4.14708 29.346 5.27606C30 6.55953 30 8.23969 30 11.6V20.4C30 23.7603 30 25.4405 29.346 26.7239C28.7708 27.8529 27.8529 28.7708 26.7239 29.346C25.4405 30 23.7603 30 20.4 30H11.6C8.23969 30 6.55953 30 5.27606 29.346C4.14708 28.7708 3.2292 27.8529 2.65396 26.7239C2 25.4405 2 23.7603 2 20.4V11.6Z" fill="white"/>
      <path d="M23.6361 9.33998C22.212 8.71399 20.6892 8.25903 19.0973 8C18.9018 8.33209 18.6734 8.77875 18.5159 9.13408C16.8236 8.89498 15.1469 8.89498 13.4857 9.13408C13.3283 8.77875 13.0946 8.33209 12.8974 8C11.3037 8.25903 9.77927 8.71565 8.35518 9.3433C5.48276 13.4213 4.70409 17.3981 5.09342 21.3184C6.99856 22.6551 8.84487 23.467 10.66 23.9983C11.1082 23.4189 11.5079 22.8029 11.8523 22.1536C11.1964 21.9195 10.5683 21.6306 9.9748 21.2951C10.1323 21.1856 10.2863 21.071 10.4351 20.9531C14.0551 22.5438 17.9881 22.5438 21.5649 20.9531C21.7154 21.071 21.8694 21.1856 22.0251 21.2951C21.4299 21.6322 20.8 21.9211 20.1442 22.1553C20.4885 22.8029 20.8865 23.4205 21.3364 24C23.1533 23.4687 25.0013 22.6567 26.9065 21.3184C27.3633 16.7738 26.1261 12.8335 23.6361 9.33998ZM12.3454 18.9075C11.2587 18.9075 10.3676 17.9543 10.3676 16.7937C10.3676 15.6331 11.2397 14.6783 12.3454 14.6783C13.4511 14.6783 14.3422 15.6314 14.3232 16.7937C14.325 17.9543 13.4511 18.9075 12.3454 18.9075ZM19.6545 18.9075C18.5678 18.9075 17.6767 17.9543 17.6767 16.7937C17.6767 15.6331 18.5488 14.6783 19.6545 14.6783C20.7602 14.6783 21.6514 15.6314 21.6323 16.7937C21.6323 17.9543 20.7602 18.9075 19.6545 18.9075Z" fill="#5865F2"/>
    </svg>
  ),
  whatsapp: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  pinterest: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
    </svg>
  ),
  soundcloud: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="-143 145 512 512" fill={color}>
      <path d="M113,145c-141.4,0-256,114.6-256,256s114.6,256,256,256s256-114.6,256-256S254.4,145,113,145z M-11.1,432.9 c-0.1,0.6-0.5,1-1,1s-1-0.4-1-1l-1.9-14l1.9-14.2c0.1-0.6,0.5-1,1-1s0.9,0.4,1,1l2.2,14.2L-11.1,432.9z M-1.6,441.4 c-0.1,0.6-0.5,1-1.1,1c-0.5,0-1-0.4-1.1-1l-2.5-22.5l2.5-23c0.1-0.6,0.5-1,1.1-1c0.5,0,1,0.4,1.1,1l2.9,23L-1.6,441.4z M8.7,445.3 c-0.1,0.7-0.6,1.2-1.3,1.2c-0.7,0-1.2-0.5-1.3-1.3l-2.4-26.3l2.4-27.3c0.1-0.7,0.6-1.3,1.3-1.3c0.7,0,1.2,0.5,1.3,1.3l2.7,27.3 L8.7,445.3z M19.1,446.1c-0.1,0.8-0.7,1.5-1.5,1.5c-0.8,0-1.4-0.6-1.5-1.5L13.8,419l2.3-28c0.1-0.9,0.7-1.5,1.5-1.5 c0.8,0,1.4,0.6,1.5,1.5l2.6,28L19.1,446.1z M29.5,446.3c-0.1,1-0.8,1.7-1.7,1.7c-0.9,0-1.7-0.7-1.7-1.7L24,419l2.1-26 c0.1-1,0.8-1.7,1.7-1.7c0.9,0,1.6,0.7,1.7,1.7l2.4,26L29.5,446.3z M40,446.3c-0.1,1.1-0.9,1.9-1.9,1.9s-1.9-0.8-1.9-1.9l-2-27.3 l2-42.3c0.1-1.1,0.9-1.9,1.9-1.9s1.9,0.8,1.9,1.9l2.3,42.3L40,446.3z M50.6,446.2c-0.1,1.2-1,2.1-2.2,2.1s-2.1-0.9-2.2-2.1L44.3,419 l1.9-52c0.1-1.2,1-2.1,2.2-2.1s2.1,0.9,2.2,2.1l2.1,52L50.6,446.2z M61.3,445.9c-0.1,1.3-1.1,2.3-2.4,2.3s-2.3-1-2.4-2.3L54.7,419 l1.8-56.3c0-1.3,1.1-2.4,2.4-2.4s2.3,1,2.4,2.4l2,56.3L61.3,445.9z M72.1,445.7c-0.1,1.4-1.2,2.6-2.6,2.6c-1.4,0-2.5-1.1-2.6-2.6 L65.3,419l1.6-58.2c0-1.4,1.2-2.6,2.6-2.6s2.5,1.1,2.6,2.6l1.8,58.2L72.1,445.7z M82.9,445.5c0,1.5-1.3,2.8-2.8,2.8 s-2.8-1.2-2.8-2.8L75.8,419l1.5-56.7c0-1.6,1.3-2.8,2.8-2.8s2.8,1.2,2.8,2.8l1.7,56.7L82.9,445.5z M93.9,445.3c0,1.7-1.4,3-3,3 c-1.7,0-3-1.3-3-3L86.5,419l1.4-54.7c0-1.7,1.4-3,3-3c1.7,0,3,1.3,3,3l1.5,54.7L93.9,445.3z M104.9,445.1c0,1.8-1.5,3.2-3.2,3.2 c-1.8,0-3.2-1.5-3.2-3.2L97.3,419l1.2-65c0-1.8,1.5-3.2,3.2-3.2c1.8,0,3.2,1.4,3.2,3.2l1.4,65L104.9,445.1z M115.9,444.8 c0,1.9-1.6,3.4-3.5,3.4c-1.9,0-3.4-1.6-3.5-3.4l-1.4-25.7l1.4-70.9c0-1.9,1.6-3.5,3.5-3.5c1.9,0,3.4,1.6,3.5,3.5l1.5,70.9 L115.9,444.8z M209.5,448.4c-0.6,0-87.2,0-87.3,0c-1.9-0.2-3.4-1.8-3.4-3.7v-99.9c0-1.8,0.7-2.8,3-3.7c6.1-2.4,13-3.8,20.1-3.8 c29,0,52.8,22.3,55.3,50.6c3.7-1.6,7.9-2.4,12.2-2.4c17.4,0,31.5,14.1,31.5,31.5C241,434.3,226.9,448.4,209.5,448.4z"/>
    </svg>
  ),
  calendly: ({ size = 20, className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 525.8 535.73" fill="none">
      <path fill="#006bff" d="M360.4,347.4c-17,15.09-38.21,33.87-76.78,33.87h-23c-27.88,0-53.23-10.12-71.37-28.49-17.72-17.94-27.48-42.5-27.48-69.16V252.11c0-26.66,9.76-51.22,27.48-69.16,18.14-18.37,43.49-28.49,71.37-28.49h23c38.57,0,59.76,18.78,76.78,33.87,17.65,15.65,32.9,29.16,73.52,29.16a116.05,116.05,0,0,0,18.5-1.48c0-.12-.08-.23-.13-.35a139.23,139.23,0,0,0-8.55-17.55l-27.16-47.05A139.53,139.53,0,0,0,295.76,81.3H241.43a139.53,139.53,0,0,0-120.82,69.76L93.45,198.11a139.52,139.52,0,0,0,0,139.51l27.16,47.05a139.52,139.52,0,0,0,120.82,69.75h54.33a139.52,139.52,0,0,0,120.82-69.75l27.16-47.05a139.23,139.23,0,0,0,8.55-17.55c0-.12.09-.23.13-.35a116.05,116.05,0,0,0-18.5-1.48C393.3,318.24,378.05,331.75,360.4,347.4Z"/>
      <path fill="#006bff" d="M283.62,183h-23c-42.42,0-70.3,30.3-70.3,69.09v31.51c0,38.79,27.88,69.09,70.3,69.09h23c61.82,0,57-63,150.3-63a144.19,144.19,0,0,1,26.37,2.41,139.36,139.36,0,0,0,0-48.46,143.32,143.32,0,0,1-26.37,2.42C340.59,246.05,345.44,183,283.62,183Z"/>
      <path fill="#006bff" d="M513.91,315.13a130.21,130.21,0,0,0-53.62-23c0,.16-.05.32-.08.47a138.46,138.46,0,0,1-7.79,27.16A102.15,102.15,0,0,1,496.75,338c0,.14-.08.28-.13.43A237.8,237.8,0,0,1,463.33,406a240.67,240.67,0,0,1-52,53.48A239.3,239.3,0,0,1,98.65,98.65a239.43,239.43,0,0,1,398,98.69c.05.15.09.29.13.43A102.15,102.15,0,0,1,452.42,216a139.36,139.36,0,0,1,7.8,27.18c0,.15,0,.3.07.44a129.94,129.94,0,0,0,53.62-23c15.29-11.31,12.33-24.09,10-31.65C490.22,79.52,388.33,0,267.86,0,119.93,0,0,119.93,0,267.86S119.93,535.73,267.86,535.73c120.47,0,222.36-79.52,256-188.94C526.24,339.23,529.2,326.45,513.91,315.13Z"/>
      <path fill="#0ae9ef" d="M452.42,216a116.05,116.05,0,0,1-18.5,1.48c-40.62,0-55.87-13.51-73.52-29.16-17-15.09-38.21-33.87-76.78-33.87h-23c-27.88,0-53.23,10.12-71.37,28.49-17.72,17.94-27.48,42.5-27.48,69.16v31.51c0,26.66,9.76,51.22,27.48,69.16,18.14,18.37,43.49,28.49,71.37,28.49h23c38.57,0,59.76-18.78,76.78-33.87,17.65-15.65,32.9-29.16,73.52-29.16a116.05,116.05,0,0,1,18.5,1.48,138.46,138.46,0,0,0,7.79-27.16c0-.15.06-.31.08-.47a144.19,144.19,0,0,0-26.37-2.41c-93.33,0-88.48,63-150.3,63h-23c-42.42,0-70.3-30.3-70.3-69.09V252.11c0-38.79,27.88-69.09,70.3-69.09h23c61.82,0,57,63,150.3,63a143.32,143.32,0,0,0,26.37-2.42c0-.14,0-.29-.07-.44A139.36,139.36,0,0,0,452.42,216Z"/>
    </svg>
  ),
  applemusic: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" fill={color}>
      <path d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
    </svg>
  ),
  notion: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M16.5749 7.25003C16.6367 7.59473 16.5568 7.93086 16.2367 7.96109L15.7054 8.05698L15.4846 16.374C15.0168 16.6242 14.5911 16.7615 14.2397 16.7493C13.673 16.7296 13.5363 16.5344 13.1293 15.9535L9.82408 10.0074L9.6745 15.6431L10.7624 15.9474C10.7624 15.9474 10.7444 16.6282 9.8619 16.5975L7.42244 16.6648C7.35563 16.5103 7.43656 16.1329 7.68674 16.0686L8.32658 15.9004L8.52431 8.45081L7.64386 8.34411C7.5821 7.99941 7.77252 7.51503 8.26605 7.49448L10.8834 7.39512L14.328 13.4217L14.4666 8.20066L13.5514 8.05443C13.4916 7.63739 13.7802 7.34321 14.1354 7.32029L16.5749 7.25003Z"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M17.2583 2.83306C13.7917 2.44562 10.2083 2.44562 6.74177 2.83306C4.72971 3.05794 3.10538 4.64295 2.86883 6.66548C2.45429 10.2098 2.45429 13.7903 2.86883 17.3346C3.10538 19.3571 4.72971 20.9422 6.74177 21.167C10.2083 21.5545 13.7917 21.5545 17.2583 21.167C19.2703 20.9422 20.8946 19.3571 21.1312 17.3346C21.5457 13.7903 21.5457 10.2098 21.1312 6.66548C20.8946 4.64295 19.2703 3.05794 17.2583 2.83306ZM6.90838 4.32378C10.2642 3.94871 13.7358 3.94871 17.0916 4.32378C18.4218 4.47244 19.4872 5.52205 19.6414 6.83973C20.0424 10.2683 20.0424 13.7318 19.6414 17.1604C19.4872 18.478 18.4218 19.5277 17.0916 19.6763C13.7358 20.0514 10.2642 20.0514 6.90838 19.6763C5.57827 19.5277 4.51278 18.478 4.35867 17.1604C3.95767 13.7318 3.95767 10.2683 4.35867 6.83973C4.51278 5.52205 5.57827 4.47244 6.90838 4.32378Z"/>
    </svg>
  ),
  kick: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M1.333 0v24h5.334v-8l2.666 2.667L14.667 24H22l-8-9.333L22 5.333h-7.333l-5.334 6.334V0H1.333z"/>
    </svg>
  ),
  snapchat: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 192 192" fill="none" stroke={color} strokeWidth="12" strokeLinejoin="round">
      <path d="M95.918 22.002c-11.963-.087-24.145 4.54-32.031 13.717-6.995 7.405-9.636 17.901-9.284 27.868-.03 5.119.032 10.237.05 15.355-4.901-1.217-9.873-4.624-15.063-2.937-4.422 1.313-6.267 7.088-3.596 10.791 2.876 3.761 7.346 5.907 11.08 8.71 1.837 1.5 4.313 2.571 5.68 4.499-.001 4.62-2.425 8.897-4.722 12.786-5.597 8.802-14.342 15.531-23.705 20.18-2.39 1.035-4.59 4.144-2.473 6.499 3.862 3.622 9.327 4.778 14.195 6.486 2.047.64 5.078 1.34 4.886 4.084.335 2.923 2.205 6.066 5.492 6.078 7.873.91 16.289.522 23.345 4.741 6.917 4.006 14.037 8.473 22.255 8.96 8.188.767 16.623-.888 23.642-5.255 5.23-2.884 10.328-6.477 16.456-7.061 5.155-1.206 10.702-.151 15.685-2.072 3.193-1.367 2.762-5.244 4.104-7.808 2.532-1.747 5.77-1.948 8.59-3.102 3.687-1.47 8.335-2.599 10.268-6.413 1.148-3.038-2.312-4.698-4.453-5.88-11.38-5.874-21.631-14.921-26.121-27.191-.496-1.936-2.279-4.834.084-6.255 4.953-4.176 11.413-6.575 15.514-11.715 3.103-3.884.941-10.55-4.141-11.322-4.928-.78-9.525 1.893-14.152 3.127-.404-8.53.502-17.232-.776-25.746-2.429-13.808-13.514-25.157-26.813-29.124-4.521-1.401-9.266-2.037-13.996-2Z"/>
    </svg>
  ),
  threads: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 439.999 511.429" fill={color}>
      <path fillRule="nonzero" d="M342.382 237.037a175.843 175.843 0 00-6.707-3.045c-3.947-72.737-43.692-114.379-110.428-114.805-38.505-.256-72.972 15.445-94.454 48.041l36.702 25.178c15.265-23.159 39.221-28.097 56.864-28.097.203 0 .408 0 .61.003 21.973.139 38.555 6.528 49.287 18.987 7.81 9.071 13.034 21.606 15.62 37.425-19.482-3.312-40.552-4.329-63.077-3.039-63.449 3.656-104.24 40.661-101.5 92.081 1.39 26.083 14.384 48.522 36.586 63.18 18.773 12.391 42.95 18.451 68.078 17.08 33.183-1.819 59.214-14.48 77.376-37.631 13.793-17.579 22.516-40.362 26.368-69.068 15.814 9.543 27.535 22.103 34.007 37.2 11.007 25.665 11.648 67.84-22.764 102.222-30.15 30.121-66.392 43.151-121.164 43.554-60.757-.45-106.707-19.934-136.582-57.914-27.976-35.563-42.434-86.93-42.973-152.675.539-65.745 14.997-117.113 42.973-152.675 29.875-37.979 75.824-57.464 136.581-57.914 61.197.455 107.948 20.033 138.967 58.195 15.21 18.713 26.677 42.248 34.236 69.688l43.011-11.476c-9.163-33.775-23.581-62.881-43.203-87.017C357.031 25.59 298.872.519 223.935 0h-.3C148.851.518 91.343 25.683 52.709 74.794 18.331 118.498.598 179.308.002 255.534l-.002.18.002.18c.596 76.226 18.329 137.037 52.707 180.741 38.634 49.11 96.142 74.277 170.926 74.794h.3c66.487-.462 113.352-17.868 151.96-56.442 50.511-50.463 48.991-113.717 32.342-152.548-11.944-27.847-34.716-50.464-65.855-65.402zm-114.795 107.93c-27.809 1.566-56.7-10.917-58.124-37.652-1.056-19.823 14.108-41.942 59.83-44.577 5.237-.302 10.375-.45 15.422-.45 16.609 0 32.146 1.613 46.272 4.702-5.268 65.798-36.173 76.483-63.4 77.977z"/>
    </svg>
  ),
  patreon: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65 0 4.755 3.877 8.623 8.641 8.623 4.75 0 8.615-3.868 8.615-8.623C24 4.36 20.136.48 15.385.48z"/>
    </svg>
  ),
  website: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  email: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
}

function getThumbnailIconViewBox(iconId?: string | null) {
  return iconId === "threads" ? "0 0 16 16" : "0 0 24 24"
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
  { id: "gradient1", url: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800&q=80", label: "Purple Gradient" },
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
      { type: "link_button" as const, label: "Threads", description: "Link to Threads", icon: ({ className }: { className?: string }) => <SocialIconsSVG.threads size={16} className={className} />, preset: { label: "Follow on Threads", url: "https://threads.net/@" } },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: Video,
    blocks: [
      { type: "image" as const, label: "Image", description: "Upload or link an image", icon: ImageIcon },
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
      { type: "link_button" as const, label: "Notion", description: "Link to Notion page", icon: ({ className }: { className?: string }) => <SocialIconsSVG.notion size={16} className={className} />, preset: { label: "View Page", url: "https://notion.so/", icon: "notion" } },
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
      { type: "text" as const, label: "Text", description: "Add text content", icon: Type },
      { type: "divider" as const, label: "Divider", description: "Add spacing", icon: Minus },
      { type: "group" as const, label: "Group", description: "Group blocks together", icon: Layers },
    ],
  },
]

// Helper to render social icon
function RenderSocialIcon({ platform, size = 20, color = "currentColor", className }: { platform: string; size?: number; color?: string; className?: string }) {
  const IconComponent = SocialIconsSVG[platform]
  if (IconComponent) {
    return <IconComponent size={size} color={color} className={className} />
  }
  return <Globe size={size} color={color} className={className} />
}

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
  
  // Drag state
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)

  // Touch drag state for mobile
  const [touchDragId, setTouchDragId] = useState<string | null>(null)
  const touchOverIdRef = useRef<string | null>(null)
  const autoScrollTimerRef = useRef<number>(0)
  const autoScrollVelocityRef = useRef(0)
  const autoScrollElementRef = useRef<HTMLElement | null>(null)
  const dragSourceElRef = useRef<HTMLElement | null>(null)
  const touchStartYRef = useRef(0)
  const touchCurrentYRef = useRef(0)
  const [touchDragOffsetY, setTouchDragOffsetY] = useState(0)
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

  // Icon library paths for thumbnails
  const THUMBNAIL_ICON_PATHS: Record<string, string> = {
    // Links & Navigation
    'link': 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    'external': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
    'globe': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'compass': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
    'navigation': 'M3 11l19-9-9 19-2-8-8-2z',
    'send': 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
    // Social & Communication
    'mail': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    'phone': 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    'message': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'chat': 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    'users': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    'user': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'at-sign': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94',
    'share': 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
    'share-2': 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
    'threads': 'M6.321 6.016c-.27-.18-1.166-.802-1.166-.802.756-1.081 1.753-1.502 3.132-1.502.975 0 1.803.327 2.394.948s.928 1.509 1.005 2.644q.492.207.905.484c1.109.745 1.719 1.86 1.719 3.137 0 2.716-2.226 5.075-6.256 5.075C4.594 16 1 13.987 1 7.994 1 2.034 4.482 0 8.044 0 9.69 0 13.55.243 15 5.036l-1.36.353C12.516 1.974 10.163 1.43 8.006 1.43c-3.565 0-5.582 2.171-5.582 6.79 0 4.143 2.254 6.343 5.63 6.343 2.777 0 4.847-1.443 4.847-3.556 0-1.438-1.208-2.127-1.27-2.127-.236 1.234-.868 3.31-3.644 3.31-1.618 0-3.013-1.118-3.013-2.582 0-2.09 1.984-2.847 3.55-2.847.586 0 1.294.04 1.663.114 0-.637-.54-1.728-1.9-1.728-1.25 0-1.566.405-1.967.868ZM8.716 8.19c-2.04 0-2.304.87-2.304 1.416 0 .878 1.043 1.168 1.6 1.168 1.02 0 2.067-.282 2.232-2.423a6.2 6.2 0 0 0-1.528-.161',
    // Media & Entertainment
    'music': 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    'video': 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
    'camera': 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'image': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    'play': 'M5 3l14 9-14 9V3z',
    'pause': 'M6 4h4v16H6zM14 4h4v16h-4z',
    'mic': 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
    'headphones': 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
    'radio': 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19M12 12h.01',
    'tv': 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM17 2l-5 5-5-5',
    'film': 'M19.82 2H4.18A2.18 2.18 0 0 0 2 4.18v15.64A2.18 2.18 0 0 0 4.18 22h15.64A2.18 2.18 0 0 0 22 19.82V4.18A2.18 2.18 0 0 0 19.82 2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
    // Shopping & Commerce
    'shopping': 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
    'cart': 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'credit-card': 'M1 4h22a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM1 10h22',
    'dollar': 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    'tag': 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
    'percent': 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'gift': 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    'package': 'M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
    'truck': 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    // Favorites & Ratings
    'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    'thumbs-up': 'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3',
    'award': 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
    'trophy': 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z',
    // Documents & Files
    'file': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    'folder': 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
    'bookmark': 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    'clipboard': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'edit': 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    'pen': 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    // Time & Date
    'calendar': 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM16 2v4M8 2v4M3 10h18',
    'clock': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    'watch': 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 9v3l1.5 1.5M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83',
    'hourglass': 'M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
    // Weather & Nature
    'sun': 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
    'moon': 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
    'cloud': 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
    'droplet': 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
    'wind': 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2',
    'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    'flame': 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    // Food & Drink
    'coffee': 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3',
    'pizza': 'M12 2L2 19.5h20L12 2zM12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'apple': 'M12 2a3 3 0 0 0-3 3c0 1 .5 2 1 3H7a5 5 0 0 0-5 5c0 4 3 9 7 9s4-2 5-2 2 2 5 2 7-5 7-9a5 5 0 0 0-5-5h-3c.5-1 1-2 1-3a3 3 0 0 0-3-3h-4z',
    // Technology
    'smartphone': 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
    'tablet': 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
    'laptop': 'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16',
    'monitor': 'M2 3h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 21h8M12 17v4',
    'server': 'M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01',
    'database': 'M12 2c4.97 0 9 1.79 9 4s-4.03 4-9 4-9-1.79-9-4 4.03-4 9-4zM3 6v6c0 2.21 4.03 4 9 4s9-1.79 9-4V6M3 12v6c0 2.21 4.03 4 9 4s9-1.79 9-4v-6',
    'wifi': 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
    'bluetooth': 'M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11',
    'battery': 'M17 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM23 13v-2',
    'power': 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
    'cpu': 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3',
    // Arrows & Directions
    'arrow-up': 'M12 19V5M5 12l7-7 7 7',
    'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
    'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
    'arrow-right': 'M5 12h14M12 5l7 7-7 7',
    'refresh': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    'rotate': 'M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38',
    'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    'upload': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    // Status & Alerts
    'check': 'M20 6L9 17l-5-5',
    'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
    'x-mark': 'M18 6L6 18M6 6l12 12',
    'alert-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01',
    'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
    'info': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
    'help': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
    'bell': 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
    // Misc
    'settings': 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'sliders': 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    'filter': 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
    'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    'zoom-in': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6',
    'zoom-out': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6',
    'lock': 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
    'unlock': 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 9.9-1',
    'key': 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
    'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'eye-off': 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
    'target': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'crosshair': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M22 12h-4M6 12H2M12 6V2M12 22v-4',
    'anchor': 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 22V8M5 12H2a10 10 0 0 0 20 0h-3',
    'flag': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
    'hash': 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
    'layers': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    'box': 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
    'grid': 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    'layout': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M9 21V9',
    'sidebar': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18',
    'terminal': 'M4 17l6-6-6-6M12 19h8',
    'code': 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    'command': 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
    'tool': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    'wrench': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    'scissors': 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12',
    'paperclip': 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
    'link-2': 'M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3M8 12h8',
    'umbrella': 'M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7',
    'feather': 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5zM16 8L2 22M17.5 15H9',
    'droplets': 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05zM12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97',
    'activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
    'trending-up': 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
    'trending-down': 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6',
    'bar-chart': 'M12 20V10M18 20V4M6 20v-4',
    'pie-chart': 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
    'maximize': 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
    'minimize': 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',
    'move': 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
    'plus': 'M12 5v14M5 12h14',
    'minus': 'M5 12h14',
    'menu': 'M3 12h18M3 6h18M3 18h18',
    'more-horizontal': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'more-vertical': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    // Social Media Platforms (monochrome)
    'instagram': 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
    'twitter': 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    'youtube': 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z',
    'tiktok': 'M16.8218 5.1344C16.0887 4.29394 15.648 3.19805 15.648 2H14.7293C14.9659 3.3095 15.7454 4.43326 16.8218 5.1344ZM8.3218 11.9048C6.73038 11.9048 5.43591 13.2004 5.43591 14.7931C5.43591 15.903 6.06691 16.8688 6.98556 17.3517C6.64223 16.8781 6.43808 16.2977 6.43808 15.6661C6.43808 14.0734 7.73255 12.7778 9.324 12.7778C9.62093 12.7778 9.90856 12.8288 10.1777 12.9124V9.40192C9.89927 9.36473 9.61628 9.34149 9.324 9.34149C9.27294 9.34149 9.22654 9.34614 9.1755 9.34614V12.0394C8.90176 11.9558 8.61873 11.9048 8.3218 11.9048ZM19.4245 6.67608V9.34614C17.6429 9.34614 15.9912 8.77501 14.6456 7.80911V14.7977C14.6456 18.2851 11.8108 21.127 8.32172 21.127C6.97621 21.127 5.7235 20.6998 4.69812 19.98C5.8534 21.2198 7.50049 22 9.32392 22C12.8083 22 15.6478 19.1627 15.6478 15.6707V8.68211C16.9933 9.64801 18.645 10.2191 20.4267 10.2191V6.78293C20.0787 6.78293 19.7446 6.74574 19.4245 6.67608ZM14.6456 14.7977V7.80911C15.9912 8.77501 17.6429 9.34614 19.4245 9.34614V6.67608C18.3945 6.45788 17.4899 5.90063 16.8218 5.1344C15.7454 4.43326 14.9704 3.3095 14.7245 2H12.2098L12.2051 15.7775C12.1495 17.3192 10.8782 18.5591 9.32393 18.5591C8.35884 18.5591 7.50977 18.0808 6.98085 17.3564C6.06219 16.8688 5.4312 15.9076 5.4312 14.7977C5.4312 13.205 6.72567 11.9094 8.31708 11.9094C8.61402 11.9094 8.90168 11.9605 9.17079 12.0441V9.35079C5.75598 9.42509 3 12.2298 3 15.6707C3 17.3331 3.64492 18.847 4.69812 19.98C5.7235 20.6998 6.97621 21.127 8.32172 21.127C11.8061 21.127 14.6456 18.2851 14.6456 14.7977Z',
    'spotify': 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z',
    'facebook': 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
    'linkedin': 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
    'twitch': 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7',
    'discord': 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z',
    'telegram': 'M23.1117 4.49449C23.4296 2.94472 21.9074 1.65683 20.4317 2.227L2.3425 9.21601C0.694517 9.85273 0.621087 12.1572 2.22518 12.8975L6.1645 14.7157L8.03849 21.2746C8.13583 21.6153 8.40618 21.8791 8.74917 21.968C9.09216 22.0568 9.45658 21.9576 9.70712 21.707L12.5938 18.8203L16.6375 21.8531C17.8113 22.7334 19.5019 22.0922 19.7967 20.6549L23.1117 4.49449ZM3.0633 11.0816L21.1525 4.0926L17.8375 20.2531L13.1 16.6999C12.7019 16.4013 12.1448 16.4409 11.7929 16.7928L10.5565 18.0292L10.928 15.9861L18.2071 8.70703C18.5614 8.35278 18.5988 7.79106 18.2947 7.39293C17.9906 6.99479 17.4389 6.88312 17.0039 7.13168L6.95124 12.876L3.0633 11.0816ZM8.17695 14.4791L8.78333 16.6015L9.01614 15.321C9.05253 15.1209 9.14908 14.9366 9.29291 14.7928L11.5128 12.573L8.17695 14.4791Z',
    'whatsapp': 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
    'pinterest': 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
    'snapchat': 'M11.99 2.75c-1.494-.011-3.017.567-4.003 1.714-.874.926-1.204 2.238-1.16 3.483-.004.64.004 1.28.006 1.92-.613-.152-1.234-.578-1.882-.367-.553.164-.783.886-.45 1.349.36.47.918.738 1.385 1.089.229.188.538.321.71.562 0 .577-.303 1.112-.59 1.599-.7 1.099-1.786 1.93-2.956 2.509-.3.129-.572.518-.309.812.485.453 1.167.598 1.77.811.256.08.635.168.608.507.042.365.276.758.687.76.982.114 2.036.065 2.918.59.868.501 1.756 1.059 2.777 1.117 1.02.1 2.08-.111 2.958-.663.654-.36 1.292-.81 2.06-.883.645-.15 1.338-.015 1.96-.26.4-.17.35-.66.51-.984.32-.22.72-.243 1.07-.388.46-.183 1.04-.332 1.27-.802.14-.38-.29-.586-.56-.734-1.42-.734-2.7-1.87-3.27-3.4-.06-.24-.29-.6.01-.78.62-.52 1.43-.82 1.94-1.46.39-.488.12-1.318-.52-1.418-.618-.098-1.19.24-1.77.391-.051-1.068.063-2.152-.102-3.218-.304-1.726-1.69-3.145-3.35-3.64-.565-.18-1.158-.25-1.746-.25z',
    'github': 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z',
    'apple-music': 'M9.34 16.82v-7.94q0-.42.47-.51l6.43-1.3q.51-.1.56.47v5.68q0 .7-2.1.93c-2.65.42-2.23 4.89 1.4 3.68 1.4-.51 1.63-1.86 1.63-3.21V4.1s0-.93-.79-.7l-7.91 1.63s-.6.1-.6.84v9.45q0 .7-2.1.93c-2.65.42-2.23 4.89 1.4 3.68 1.4-.51 1.63-1.86 1.63-3.21',
    'notion': 'M16.5749 7.25003C16.6367 7.59473 16.5568 7.93086 16.2367 7.96109L15.7054 8.05698L15.4846 16.374C15.0168 16.6242 14.5911 16.7615 14.2397 16.7493C13.673 16.7296 13.5363 16.5344 13.1293 15.9535L9.82408 10.0074L9.6745 15.6431L10.7624 15.9474C10.7624 15.9474 10.7444 16.6282 9.8619 16.5975L7.42244 16.6648C7.35563 16.5103 7.43656 16.1329 7.68674 16.0686L8.32658 15.9004L8.52431 8.45081L7.64386 8.34411C7.5821 7.99941 7.77252 7.51503 8.26605 7.49448L10.8834 7.39512L14.328 13.4217L14.4666 8.20066L13.5514 8.05443C13.4916 7.63739 13.7802 7.34321 14.1354 7.32029L16.5749 7.25003Z M17.2583 2.83306C13.7917 2.44562 10.2083 2.44562 6.74177 2.83306C4.72971 3.05794 3.10538 4.64295 2.86883 6.66548C2.45429 10.2098 2.45429 13.7903 2.86883 17.3346C3.10538 19.3571 4.72971 20.9422 6.74177 21.167C10.2083 21.5545 13.7917 21.5545 17.2583 21.167C19.2703 20.9422 20.8946 19.3571 21.1312 17.3346C21.5457 13.7903 21.5457 10.2098 21.1312 6.66548C20.8946 4.64295 19.2703 3.05794 17.2583 2.83306ZM6.90838 4.32378C10.2642 3.94871 13.7358 3.94871 17.0916 4.32378C18.4218 4.47244 19.4872 5.52205 19.6414 6.83973C20.0424 10.2683 20.0424 13.7318 19.6414 17.1604C19.4872 18.478 18.4218 19.5277 17.0916 19.6763C13.7358 20.0514 10.2642 20.0514 6.90838 19.6763C5.57827 19.5277 4.51278 18.478 4.35867 17.1604C3.95767 13.7318 3.95767 10.2683 4.35867 6.83973C4.51278 5.52205 5.57827 4.47244 6.90838 4.32378Z',
  }

  // Organize icons by category for better browsing
  const ICON_CATEGORIES = [
    { id: 'all', label: 'All', icons: Object.keys(THUMBNAIL_ICON_PATHS) },
    { id: 'platforms', label: 'Platforms', icons: ['instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin', 'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat', 'reddit', 'threads', 'github', 'apple-music'] },
    { id: 'links', label: 'Links', icons: ['link', 'external', 'globe', 'home', 'map-pin', 'compass', 'navigation', 'send'] },
    { id: 'social', label: 'Contact', icons: ['mail', 'phone', 'message', 'chat', 'users', 'user', 'at-sign', 'share', 'share-2'] },
    { id: 'media', label: 'Media', icons: ['music', 'video', 'camera', 'image', 'play', 'pause', 'mic', 'headphones', 'radio', 'tv', 'film'] },
    { id: 'shopping', label: 'Shopping', icons: ['shopping', 'cart', 'credit-card', 'dollar', 'tag', 'percent', 'gift', 'package', 'truck'] },
    { id: 'favorites', label: 'Favorites', icons: ['star', 'heart', 'thumbs-up', 'award', 'trophy'] },
    { id: 'files', label: 'Files', icons: ['file', 'folder', 'book', 'bookmark', 'clipboard', 'edit', 'pen'] },
    { id: 'time', label: 'Time', icons: ['calendar', 'clock', 'watch', 'hourglass'] },
    { id: 'weather', label: 'Weather', icons: ['sun', 'moon', 'cloud', 'droplet', 'wind', 'zap', 'flame'] },
    { id: 'tech', label: 'Tech', icons: ['smartphone', 'tablet', 'laptop', 'monitor', 'server', 'database', 'wifi', 'bluetooth', 'battery', 'power', 'cpu'] },
    { id: 'arrows', label: 'Arrows', icons: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'refresh', 'rotate', 'download', 'upload'] },
    { id: 'status', label: 'Status', icons: ['check', 'check-circle', 'x-mark', 'alert-circle', 'alert-triangle', 'info', 'help', 'bell'] },
  ]

  // Icons that should be rendered with fill instead of stroke
  const FILLED_ICONS = new Set([
    'instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin',
    'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat', 'reddit',
    'threads', 'github', 'apple-music', 'notion'
  ])

  const THUMBNAIL_ICONS = Object.entries(THUMBNAIL_ICON_PATHS).map(([id, path]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
    path,
    isFilled: FILLED_ICONS.has(id)
  }))

  // Auto-fetch thumbnail for social media links (Spotify, YouTube, etc.)
  const autoFetchThumbnail = useCallback(async (blockId: string, rawUrl: string) => {
    const url = normalizeUrlInput(rawUrl)
    if (!url) return

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
              updateBlock(blockId, {
                data: {
                  ...currentData,
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  spotify_title: spotifyData.title || null,
                  spotify_artist: spotifyData.artistName || null,
                  spotify_type: spotifyData.type || null,
                  spotify_thumbnail: thumbnailUrl || null,
                  spotify_show_metadata: currentData.spotify_show_metadata !== false ? true : false
                }
              })
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
              updateBlock(blockId, {
                data: {
                  ...currentData,
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  soundcloud_title: soundcloudData.title || null,
                  soundcloud_artist: soundcloudData.artistName || null,
                  soundcloud_type: soundcloudData.type || null,
                  soundcloud_thumbnail: thumbnailUrl || null,
                  soundcloud_show_metadata: currentData.soundcloud_show_metadata !== false ? true : false
                }
              })
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
              updateBlock(blockId, {
                data: {
                  ...currentData,
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
                }
              })
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
              updateBlock(blockId, {
                data: {
                  ...currentData,
                  url,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  tiktok_video_id: videoId,
                  tiktok_embed_url: tiktokData.embedUrl || null,
                  tiktok_show_embed: true
                }
              })
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
          updateBlock(blockId, {
            data: {
              ...currentData,
              url,
              thumbnail_url: thumbnailUrl,
              icon: null
            }
          })
        }
      }
    } catch (error) {
      console.error('Error auto-fetching thumbnail:', error)
    }
  }, [onepage?.draft_blocks, updateBlock])

  // Handle URL change with auto-fetch
  const handleUrlChangeWithAutoFetch = useCallback((blockId: string, rawUrl: string) => {
    const normalizedUrl = normalizeUrlInput(rawUrl)
    const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
    if (currentData) {
      if (!normalizedUrl || normalizedUrl.length < 10) {
        updateBlock(blockId, {
          data: {
            ...currentData,
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
          }
        })
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
        updateBlock(blockId, {
          data: {
            ...currentData,
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
          }
        })
      } else {
        updateBlock(blockId, { data: { ...currentData, url: normalizedUrl } })
      }
    }

    if (normalizedUrl.length > 10 && (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://') || normalizedUrl.includes('spotify.com') || normalizedUrl.includes('youtube.com') || normalizedUrl.includes('soundcloud.com') || normalizedUrl.includes('music.apple.com') || normalizedUrl.includes('tiktok.com'))) {
      const timeoutId = setTimeout(() => {
        autoFetchThumbnail(blockId, normalizedUrl)
      }, 220)
      return () => clearTimeout(timeoutId)
    }
  }, [autoFetchThumbnail, onepage?.draft_blocks, updateBlock])

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
      const fileName = `thumbnail_${thumbnailBlockId}_${Date.now()}.${fileExt}`

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
    }, 220)
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
    }, 220)
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
    }, 220)
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
      if (type === "header" || type === "group" || type === "social_row" || type === "product" || type === "email_capture" || type === "text" || type === "divider") {
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

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    setDraggedBlockId(blockId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", blockId)
  }

  const handleDragOver = (e: React.DragEvent, blockId: string) => {
    e.preventDefault()
    if (draggedBlockId && draggedBlockId !== blockId) {
      setDragOverBlockId(blockId)
    }
  }

  const handleDragLeave = () => {
    setDragOverBlockId(null)
  }

  const handleDrop = (e: React.DragEvent, targetBlockId: string) => {
    e.preventDefault()
    if (draggedBlockId && draggedBlockId !== targetBlockId) {
      const draggedBlock = sortedBlocks.find(b => b.id === draggedBlockId)
      const targetBlock = sortedBlocks.find(b => b.id === targetBlockId)
      const draggedIndex = sortedBlocks.findIndex(b => b.id === draggedBlockId)
      const targetIndex = sortedBlocks.findIndex(b => b.id === targetBlockId)

      // If dropping onto a group block, add the dragged block to the group's children
      if (targetBlock?.type === "group" && draggedBlock && draggedBlock.type !== "group" && draggedBlock.type !== "header") {
        const groupData = targetBlock.data as GroupBlockData
        const existingChildren = groupData.children || []

        // Don't add if already in group
        if (existingChildren.some(c => c.id === draggedBlockId)) {
          setDraggedBlockId(null)
          setDragOverBlockId(null)
          return
        }

        // Add to group children and remove from main list
        const newChildren = [...existingChildren, { ...draggedBlock, sort_order: existingChildren.length }]
        updateBlock(targetBlockId, { data: { ...groupData, children: newChildren } })
        removeBlock(draggedBlockId)
        setDraggedBlockId(null)
        setDragOverBlockId(null)
        return
      }

      // Prevent social_row from being moved above header when Hero layout is active
      const headerLayout = (onepage.theme as any)?.header_layout || "classic"
      if (headerLayout === "hero" && draggedBlock?.type === "social_row") {
        const headerIndex = sortedBlocks.findIndex(b => b.type === "header")
        if (headerIndex !== -1 && targetIndex <= headerIndex) {
          // Don't allow dropping above or at the header position
          setDraggedBlockId(null)
          setDragOverBlockId(null)
          return
        }
      }

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newOrder = [...sortedBlocks]
        const [removed] = newOrder.splice(draggedIndex, 1)
        newOrder.splice(targetIndex, 0, removed)

        const updatedBlocks = newOrder.map((block, index) => ({
          ...block,
          sort_order: index
        }))

        reorderBlocks(updatedBlocks)
      }
    }
    setDraggedBlockId(null)
    setDragOverBlockId(null)
  }

  const handleDragEnd = () => {
    setDraggedBlockId(null)
    setDragOverBlockId(null)
  }

  // ============================================================
  // DRAG-AND-DROP AUTO-SCROLL SYSTEM (touch + mouse)
  // ============================================================

  // Find the scroll container for the editor
  const findScrollContainer = useCallback((): HTMLElement | null => {
    // Try the explicit data attribute first
    const explicit = document.querySelector('[data-scroll-container="links-tab"]') as HTMLElement | null
    if (explicit) return explicit
    // Fallback: walk from any block element
    const anyBlock = document.querySelector('[data-block-id]') as HTMLElement | null
    let current: HTMLElement | null = anyBlock
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
        return current
      }
      current = current.parentElement
    }
    return null
  }, [])

  const autoScrollActiveRef = useRef(false)

  // Compute auto-scroll velocity based on pointer position relative to scroll container
  const computeScrollVelocity = useCallback((clientY: number, scrollEl: HTMLElement): number => {
    const rect = scrollEl.getBoundingClientRect()
    const viewportH = window.innerHeight

    // Effective visible bounds of the scroll container
    const top = Math.max(rect.top, 0)
    const bottom = Math.min(rect.bottom, viewportH)
    const visibleHeight = bottom - top

    if (visibleHeight <= 0) return 0

    // Zone size: 20% of visible height, clamped between 60-120px
    const zone = Math.max(60, Math.min(120, visibleHeight * 0.2))

    // Distance from top/bottom edges
    const distFromTop = clientY - top
    const distFromBottom = bottom - clientY

    if (distFromTop < zone && distFromTop >= 0) {
      // Scroll UP: closer to top = faster
      const proximity = 1 - (distFromTop / zone)
      return -Math.max(2, proximity * proximity * 20)
    } else if (distFromBottom < zone && distFromBottom >= 0) {
      // Scroll DOWN: closer to bottom = faster
      const proximity = 1 - (distFromBottom / zone)
      return Math.max(2, proximity * proximity * 20)
    }

    return 0
  }, [])

  // Animation loop: runs every frame while dragging, applies scroll velocity
  const runAutoScrollLoop = useCallback(() => {
    if (autoScrollActiveRef.current) return
    autoScrollActiveRef.current = true

    const tick = () => {
      if (!autoScrollActiveRef.current) {
        autoScrollTimerRef.current = 0
        return
      }

      const scrollEl = autoScrollElementRef.current
      const speed = autoScrollVelocityRef.current

      if (scrollEl && speed !== 0) {
        const prevScrollTop = scrollEl.scrollTop
        scrollEl.scrollTop += speed
        // Verify scroll actually happened (not at bounds)
        if (scrollEl.scrollTop !== prevScrollTop) {
          // Scroll succeeded - continue
        }
      }

      autoScrollTimerRef.current = requestAnimationFrame(tick)
    }

    autoScrollTimerRef.current = requestAnimationFrame(tick)
  }, [])

  const stopAutoScroll = useCallback(() => {
    autoScrollActiveRef.current = false
    if (autoScrollTimerRef.current) {
      cancelAnimationFrame(autoScrollTimerRef.current)
      autoScrollTimerRef.current = 0
    }
    autoScrollVelocityRef.current = 0
  }, [])

  const handleTouchDragStart = useCallback((blockId: string, touchY?: number) => {
    const block = sortedBlocks.find(b => b.id === blockId)
    if (!block || block.type === "header") return

    const sourceBlock = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null
    dragSourceElRef.current = sourceBlock

    // Find and cache scroll container immediately
    const scrollEl = findScrollContainer()
    autoScrollElementRef.current = scrollEl

    touchStartYRef.current = touchY ?? 0
    touchCurrentYRef.current = touchY ?? 0
    setTouchDragOffsetY(0)

    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8)

    setTouchDragId(blockId)
    setDraggedBlockId(blockId)

    // Start the auto-scroll loop immediately
    if (scrollEl) {
      autoScrollVelocityRef.current = 0
      runAutoScrollLoop()
    }
  }, [sortedBlocks, findScrollContainer, runAutoScrollLoop])

  // Touch move + touch end event handlers
  useEffect(() => {
    if (!touchDragId) return

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)

      // Find target block under touch point
      const elements = document.elementsFromPoint(touch.clientX, touch.clientY)
      let targetId: string | null = null
      for (const el of elements) {
        const blockEl = (el as HTMLElement).closest('[data-block-id]') as HTMLElement | null
        if (blockEl && blockEl.dataset.blockId !== touchDragId) {
          targetId = blockEl.dataset.blockId || null
          break
        }
      }

      touchOverIdRef.current = targetId
      setDragOverBlockId(targetId)

      // Update auto-scroll velocity based on touch position
      const scrollEl = autoScrollElementRef.current
      if (scrollEl) {
        autoScrollVelocityRef.current = computeScrollVelocity(touch.clientY, scrollEl)
      }
    }

    const handleTouchEnd = () => {
      stopAutoScroll()
      autoScrollElementRef.current = null
      dragSourceElRef.current = null
      setTouchDragOffsetY(0)

      const targetId = touchOverIdRef.current
      if (touchDragId && targetId && touchDragId !== targetId) {
        const draggedIdx = sortedBlocks.findIndex(b => b.id === touchDragId)
        const targetIdx = sortedBlocks.findIndex(b => b.id === targetId)

        if (draggedIdx !== -1 && targetIdx !== -1) {
          // Check hero layout constraints for social_row
          const draggedBlock = sortedBlocks[draggedIdx]
          const headerLayout = (onepage.theme as any)?.header_layout || "classic"
          if (headerLayout === "hero" && draggedBlock?.type === "social_row") {
            const headerIdx = sortedBlocks.findIndex(b => b.type === "header")
            if (headerIdx !== -1 && targetIdx <= headerIdx) {
              setTouchDragId(null)
              touchOverIdRef.current = null
              setDraggedBlockId(null)
              setDragOverBlockId(null)
              return
            }
          }

          const newOrder = [...sortedBlocks]
          const [removed] = newOrder.splice(draggedIdx, 1)
          newOrder.splice(targetIdx, 0, removed)
          reorderBlocks(newOrder.map((b, i) => ({ ...b, sort_order: i })))
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10)
        }
      }

      setTouchDragId(null)
      touchOverIdRef.current = null
      setDraggedBlockId(null)
      setDragOverBlockId(null)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      stopAutoScroll()
      autoScrollElementRef.current = null
      dragSourceElRef.current = null
      setTouchDragOffsetY(0)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [touchDragId, sortedBlocks, reorderBlocks, onepage, computeScrollVelocity, stopAutoScroll])

  // Desktop mouse/HTML5 drag auto-scroll
  useEffect(() => {
    if (!draggedBlockId || touchDragId) return // Only for mouse drag (not touch)

    const scrollEl = findScrollContainer()
    if (!scrollEl) return
    autoScrollElementRef.current = scrollEl
    autoScrollVelocityRef.current = 0
    runAutoScrollLoop()

    const handleDragOverScroll = (e: DragEvent) => {
      autoScrollVelocityRef.current = computeScrollVelocity(e.clientY, scrollEl)
    }

    const handleMouseMove = (e: MouseEvent) => {
      autoScrollVelocityRef.current = computeScrollVelocity(e.clientY, scrollEl)
    }

    const handleDragEndOrDrop = () => {
      stopAutoScroll()
      autoScrollElementRef.current = null
    }

    document.addEventListener('dragover', handleDragOverScroll)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleDragEndOrDrop)
    document.addEventListener('drop', handleDragEndOrDrop)
    document.addEventListener('dragend', handleDragEndOrDrop)

    return () => {
      stopAutoScroll()
      autoScrollElementRef.current = null
      document.removeEventListener('dragover', handleDragOverScroll)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleDragEndOrDrop)
      document.removeEventListener('drop', handleDragEndOrDrop)
      document.removeEventListener('dragend', handleDragEndOrDrop)
    }
  }, [draggedBlockId, touchDragId, findScrollContainer, computeScrollVelocity, runAutoScrollLoop, stopAutoScroll])

  // Prevent pull-to-refresh and bounce during drag
  useEffect(() => {
    if (!touchDragId) return
    const prevOverscroll = document.body.style.overscrollBehaviorY
    const prevTouch = document.body.style.touchAction
    document.body.style.overscrollBehaviorY = "none"
    document.body.style.touchAction = "none"
    return () => {
      document.body.style.overscrollBehaviorY = prevOverscroll
      document.body.style.touchAction = prevTouch
    }
  }, [touchDragId])

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
  const blockedInGroup = ["header", "group", "social_row", "product", "email_capture", "text", "divider"]

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
                      setShowSocialModal(true)
                    }}
                  >
                    <RenderSocialIcon platform={platform} size={14} color="#ffffff" />
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
      <button
        onClick={() => {
          setInsertAfterId(null)
          setAddButtonClicked(true)
          setTimeout(() => setAddButtonClicked(false), 300)
          setIsAddSheetPresented(false)
          setShowAddModal(true)
        }}
        className="w-full h-11 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ease-out group cursor-pointer select-none active:scale-[0.98]"
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
            showArchiveView && "bg-purple-600 hover:bg-purple-700 text-white"
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

      {/* Blocks List - Draggable - Hidden when showing archive */}
      {!showArchiveView && (
      <div className="flex flex-col gap-2">
        {sortedBlocks.map((block, index) => (
          <React.Fragment key={block.id}>
            <div
              data-block-id={block.id}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, block.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                "transition-all duration-200",
                dragOverBlockId === block.id && block.type !== "header" && block.type !== "group" && "border-t-2 border-violet-500"
              )}
            >
              <BlockItem
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
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
                  setShowSocialModal(true)
                }}
                onOpenThumbnailModal={(blockId) => { setThumbnailBlockId(blockId); setShowThumbnailModal(true); setShowIconLibraryInModal(false) }}
                iconPaths={THUMBNAIL_ICON_PATHS}
                filledIcons={FILLED_ICONS}
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
                onDragStart={(e) => handleDragStart(e, block.id)}
                onTouchDragStart={handleTouchDragStart}
                isDragging={draggedBlockId === block.id}
                dragOffsetY={draggedBlockId === block.id ? touchDragOffsetY : 0}
                isDropTarget={dragOverBlockId === block.id}
                draggedBlockType={draggedBlockId ? sortedBlocks.find(b => b.id === draggedBlockId)?.type : null}
                onMoveChildToMainList={handleMoveChildToMainList}
                onOpenAddBlockModal={(groupId) => {
                  setAddToGroupId(groupId)
                  setIsAddSheetPresented(false)
                  setShowAddModal(true)
                }}
              />
            </div>

            {index < sortedBlocks.length - 1 && (
              <div className="relative h-0 -mx-1 group/add-divider">
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterId(block.id)
                    setIsAddSheetPresented(false)
                    setShowAddModal(true)
                  }}
                  className="absolute inset-x-0 -top-4 -bottom-4 flex items-center justify-center px-1 focus:outline-none"
                  tabIndex={0}
                  aria-label="Add block here"
                >
                  <span className="absolute inset-x-2 h-px bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:translate-y-[0.5px] group-focus-within/add-divider:translate-y-[0.5px]" />
                  <span className="absolute inset-x-3 h-px bg-gray-200 rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:-translate-y-[0.5px] group-focus-within/add-divider:-translate-y-[0.5px]" />
                  <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 text-violet-600 shadow-sm transition-all duration-200 ease-out opacity-0 scale-90 group-hover/add-divider:opacity-100 group-hover/add-divider:shadow-lg group-hover/add-divider:scale-105 group-focus-within/add-divider:opacity-100 group-focus-within/add-divider:shadow-lg group-focus-within/add-divider:scale-105">
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
          setShowAddModal(true)
          return
        }
        closeAddSheet()
      }}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          showCloseButton
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 transition-[backdrop-filter,opacity] duration-400", isAddSheetPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0") : undefined}
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
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
              : "w-[calc(100%-24px)] max-w-[520px] max-h-[85vh] sm:max-h-[min(680px,85vh)] rounded-2xl"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            bottom: 0,
            transform: isAddSheetPresented ? `translate3d(0, ${addSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
            willChange: 'transform',
            backfaceVisibility: 'hidden' as const,
            transition: isAddSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
            maxHeight: '75vh'
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
                                    <RenderSocialIcon
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
                            <RenderSocialIcon
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
          setShowSocialModal(true)
          return
        }
        closeSocialSheet()
      }}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          showCloseButton
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 transition-[backdrop-filter,opacity] duration-400", isSocialSheetPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0") : undefined}
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
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
              : "w-[calc(100%-32px)] max-w-md rounded-2xl max-h-[85vh]"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            bottom: 0,
            transform: isSocialSheetPresented ? `translate3d(0, ${socialSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
            transition: isSocialSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            maxHeight: '75vh'
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
                        <RenderSocialIcon platform={platform.id} size={20} color="#ffffff" />
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
                        <RenderSocialIcon platform={selectedSocial} size={20} color="#ffffff" />
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
        position="top"
      />
      <SaveNotification
        show={showAddBlockNotification}
        message="New block added"
        duration={4000}
        position="top"
      />
      <SaveNotification
        show={showUpdateSocialNotification}
        message="Updated"
        duration={3000}
        position="top"
      />
      <SaveNotification
        show={showBlockRemovedNotification}
        message="Block removed"
        duration={3000}
        icon={DeletedIcon}
        position="top"
      />
      <SaveNotification
        show={showBlockArchivedNotification}
        message="Block archived"
        duration={3000}
        position="top"
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
                className="flex-1 bg-violet-600 hover:bg-violet-700"
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
          setShowThumbnailModal(true)
          return
        }
        closeThumbnailSheet()
      }}>
        <DialogContent
          disableDefaultAnimations={isMobileModalViewport}
          overlayClassName={isMobileModalViewport ? cn("bg-black/40 transition-[backdrop-filter,opacity] duration-400", isThumbnailSheetPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0") : undefined}
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
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
              : showIconLibraryInModal
                ? "rounded-2xl w-[calc(100%-32px)] sm:max-w-[572px] max-w-[650px]"
                : "rounded-2xl w-[calc(100%-32px)] sm:max-w-[416px] max-w-[455px]"
          )}
          style={isMobileModalViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            bottom: 0,
            transform: isThumbnailSheetPresented ? `translate3d(0, ${thumbnailSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden' as const,
            transition: isThumbnailSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
            maxHeight: '75vh'
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
                          } else if (linkData?.icon && THUMBNAIL_ICON_PATHS[linkData.icon]) {
                            return (
                              <svg width="28" height="28" viewBox={getThumbnailIconViewBox(linkData?.icon)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                <path d={THUMBNAIL_ICON_PATHS[linkData.icon]} />
                              </svg>
                            )
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
                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                      <Grid3X3 className="w-5 h-5 text-purple-600" />
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
                    {ICON_CATEGORIES.map((cat) => (
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
                      {ICON_CATEGORIES.map((cat) => (
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
                      const categoryIcons = ICON_CATEGORIES.find(c => c.id === iconCategory)?.icons || []
                      // Filter by search query
                      const filteredIcons = THUMBNAIL_ICONS.filter(icon => {
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
                          <svg
                            width={isMobileModalViewport ? "20" : "24"}
                            height={isMobileModalViewport ? "20" : "24"}
                            viewBox="0 0 24 24"
                            fill={icon.isFilled ? "currentColor" : "none"}
                            stroke={icon.isFilled ? "none" : "currentColor"}
                            strokeWidth={icon.isFilled ? "0" : "2"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-gray-700"
                          >
                            <path d={icon.path} />
                          </svg>
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

                      // 1. File size limit: 50 GB for digital products
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
                    imageUploading ? "pointer-events-none" : "hover:border-violet-400 cursor-pointer"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center relative",
                    imageFieldType === 'pdf_file' ? "bg-red-100" : "bg-violet-100"
                  )}>
                    {imageUploading ? (
                      <svg className="w-10 h-10" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className={cn("opacity-20", imageFieldType === 'pdf_file' ? "text-red-600" : "text-violet-600")} />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={cn(imageFieldType === 'pdf_file' ? "text-red-600" : "text-violet-600")} style={{ strokeDasharray: `${2 * Math.PI * 15}`, strokeDashoffset: `${2 * Math.PI * 15 * (1 - uploadProgress / 100)}`, transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.3s ease' }} />
                        <text x="18" y="19.5" textAnchor="middle" className={cn("text-[8px] font-semibold fill-current", imageFieldType === 'pdf_file' ? "text-red-600" : "text-violet-600")}>{uploadProgress}%</text>
                      </svg>
                    ) : (
                      <Upload className={cn("h-6 w-6", imageFieldType === 'pdf_file' ? "text-red-600" : "text-violet-600")} />
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
                        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-violet-600" />
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
                    className="aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-500 transition-all group"
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
                  ? "border-violet-500 bg-violet-50 scale-[1.02]"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <Upload className={cn("h-12 w-12 mb-4 transition-colors", isDragOver ? "text-violet-500" : "text-gray-300")} />
              <p className={cn("font-medium transition-colors", isDragOver ? "text-violet-600" : "text-gray-600")}>
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
      touchCurrentYRef.current = touch.clientY
      setTouchDragOffsetY(touch.clientY - touchStartYRef.current)
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
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
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
  iconPaths: Record<string, string>
  filledIcons?: Set<string>
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
  onOpenStreamingModal?: (platform: string, index: number, data: LinkButtonBlockData, updateFn: (data: Partial<LinkButtonBlockData>) => void) => void
  onDragStart?: (e: React.DragEvent) => void
  onTouchDragStart?: (blockId: string, touchY?: number) => void
  isDragging?: boolean
  dragOffsetY?: number
  isDropTarget?: boolean
  draggedBlockType?: OnePageBlockType | null
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
  iconPaths,
  filledIcons,
  onUrlChangeWithAutoFetch,
  onOpenStreamingModal,
  onDragStart,
  onTouchDragStart,
  isDragging,
  dragOffsetY = 0,
  isDropTarget,
  draggedBlockType,
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
  const [statsTimeframe, setStatsTimeframe] = useState<'7' | 'today' | '30' | 'custom'>('7')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
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
    }, 220)
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
    }, 220)
  }, [showAnimationSheet, isMobileStatsViewport])

  // Fetch stats when modal is opened or timeframe changes
  const fetchStats = async (days?: number, startDate?: string, endDate?: string) => {
    if (!onepage?.id) return
    setStatsLoading(true)
    try {
      let url = `/api/onepage/stats?onepage_id=${onepage.id}&block_id=${block.id}`
      if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`
      } else {
        url += `&days=${days || 7}`
      }
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
    if (showStatsModal) {
      if (statsTimeframe === 'custom' && customStartDate && customEndDate) {
        fetchStats(undefined, customStartDate, customEndDate)
      } else if (statsTimeframe !== 'custom') {
        const days = statsTimeframe === 'today' ? 1 : parseInt(statsTimeframe)
        fetchStats(days)
      }
    }
  }, [statsTimeframe, customStartDate, customEndDate, showStatsModal])

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
  const hasThumbnail = (preview as any).thumbnail_url || ((preview as any).iconId && iconPaths[(preview as any).iconId])

  // Check if this group block can accept the dragged block
  const canAcceptDrop = isGroup && isDropTarget && draggedBlockType && 
    draggedBlockType !== "group" && draggedBlockType !== "header" && draggedBlockType !== "social_row"

  return (
    <div
      className={cn(
        "border rounded-xl bg-white relative",
        isSelected ? "ring-1 ring-gray-400 border-gray-300" : "hover:border-gray-300",
        !block.enabled && "opacity-50",
        isDragging ? "opacity-[0.97] scale-[1.03] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] z-50 border-violet-300 ring-1 ring-violet-200" : "transition-all duration-200",
        canAcceptDrop && "ring-2 ring-violet-500 border-violet-400 bg-violet-50/50"
      )}
      style={isDragging ? { transform: `translateY(${dragOffsetY}px) translateZ(0)`, willChange: 'transform', transition: 'box-shadow 200ms, scale 200ms' } : undefined}
      data-block-id={block.id}
    >
      {/* Drop zone indicator for group blocks */}
      {canAcceptDrop && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-xl bg-violet-500/10">
          <div className="flex items-center gap-2 bg-violet-600 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg">
            <Plus className="h-3.5 w-3.5" />
            Drop to add to group
          </div>
        </div>
      )}
      {/* Header section - only this part is draggable */}
      <div
        className={cn(
          "flex items-center gap-3 p-3",
          !isHeaderBlock && "cursor-grab active:cursor-grabbing"
        )}
        draggable={!isHeaderBlock}
        onDragStart={!isHeaderBlock ? onDragStart : undefined}
      >
        {!isHeaderBlock && (
          <div
            className={cn("cursor-grab text-gray-300 hover:text-gray-400 active:cursor-grabbing select-none p-2 -m-2 md:p-1 md:-m-1 rounded-lg active:bg-gray-100", isDragging ? "touch-none" : "touch-manipulation")}
            onTouchStart={(e) => {
              if (onTouchDragStart) {
                e.stopPropagation()
                onTouchDragStart(block.id, e.touches[0]?.clientY)
              }
            }}
          >
            <GripVertical className="h-5 w-5" />
          </div>
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
            ) : (preview as any).iconId && iconPaths[(preview as any).iconId] ? (
              <svg
                width="20"
                height="20"
                viewBox={getThumbnailIconViewBox((preview as any).iconId)}
                fill={filledIcons?.has((preview as any).iconId) ? "currentColor" : "none"}
                stroke={filledIcons?.has((preview as any).iconId) ? "none" : "currentColor"}
                strokeWidth={filledIcons?.has((preview as any).iconId) ? "0" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-500"
              >
                <path d={iconPaths[(preview as any).iconId]} />
              </svg>
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
            ) : (preview as any).iconId && iconPaths[(preview as any).iconId] ? (
              <svg
                width="20"
                height="20"
                viewBox={getThumbnailIconViewBox((preview as any).iconId)}
                fill={filledIcons?.has((preview as any).iconId) ? "currentColor" : "none"}
                stroke={filledIcons?.has((preview as any).iconId) ? "none" : "currentColor"}
                strokeWidth={filledIcons?.has((preview as any).iconId) ? "0" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-500"
              >
                <path d={iconPaths[(preview as any).iconId]} />
              </svg>
            ) : (
              <Icon className="h-5 w-5 text-gray-500" />
            )}
          </div>
        )}

        {/* Title and subtitle - clickable to select block */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
          <p className="font-medium text-sm truncate">{preview.title}</p>
          <p className="text-xs text-muted-foreground truncate">{preview.subtitle}</p>
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
                  setShowAnimationSheet(true)
                  return
                }
                setShowAnimationMenu(!showAnimationMenu)
              }}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                (block.data as any).animation_type && (block.data as any).animation_type !== 'none'
                  ? "text-violet-600 bg-violet-50 hover:bg-violet-100"
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
                          ? "bg-violet-50 text-violet-700 font-medium"
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
              setShowAnimationSheet(true)
              return
            }
            closeAnimationSheet()
          }}>
            <DialogContent
              showCloseButton
              disableDefaultAnimations={isMobileStatsViewport}
              overlayClassName={isMobileStatsViewport ? cn("bg-black/40 transition-[backdrop-filter,opacity] duration-400", isAnimationSheetPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0") : undefined}
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
                  ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
                  : "w-[calc(100%-32px)] max-w-[360px] rounded-2xl"
              )}
              style={isMobileStatsViewport ? {
                position: 'fixed',
                top: 'auto',
                left: 0,
                right: 0,
                bottom: 0,
                transform: isAnimationSheetPresented ? `translate3d(0, ${animationSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
                willChange: 'transform',
                backfaceVisibility: 'hidden' as const,
                transition: isAnimationSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                maxHeight: '75vh'
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
                            ? "bg-violet-50 text-violet-700 font-medium"
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
                setShowStatsModal(true)
                fetchStats(7)
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
                setShowStatsModal(true)
                return
              }
              closeStatsSheet()
            }}>
              <DialogContent
                showCloseButton
                disableDefaultAnimations={isMobileStatsViewport}
                overlayClassName={isMobileStatsViewport ? cn("bg-black/40 transition-[backdrop-filter,opacity] duration-400", isStatsSheetPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0") : undefined}
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
                    ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
                    : "w-[calc(100%-32px)] max-w-[420px] rounded-2xl"
                )}
                style={isMobileStatsViewport ? {
                  position: 'fixed',
                  top: 'auto',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  transform: isStatsSheetPresented ? `translate3d(0, ${statsSheetDragY}px, 0)` : 'translate3d(0, 100%, 0)',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden' as const,
                  transition: isStatsSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                  maxHeight: '75vh'
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
                  {/* Timeframe selector */}
                  <div className="flex gap-2 mb-4">
                    {[
                      { value: '7', label: '7 Days' },
                      { value: 'today', label: 'Today' },
                      { value: '30', label: '30 Days' },
                      { value: 'custom', label: 'Custom' },
                    ].map((tf) => (
                      <button
                        key={tf.value}
                        type="button"
                        onClick={() => setStatsTimeframe(tf.value as typeof statsTimeframe)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                          statsTimeframe === tf.value
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom date range */}
                  {statsTimeframe === 'custom' && (
                    <div className="flex gap-2 mb-4">
                      <Input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="flex-1 h-9 text-sm"
                        placeholder="Start date"
                      />
                      <Input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="flex-1 h-9 text-sm"
                        placeholder="End date"
                      />
                    </div>
                  )}

                  {statsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : statsData ? (
                    <>
                      {/* Stats summary cards */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-blue-50 rounded-xl">
                          <div className="text-2xl font-bold text-blue-900">{statsData.total_views || 0}</div>
                          <div className="text-xs text-blue-600 font-medium">Views</div>
                        </div>
                        <div className="p-3 bg-violet-50 rounded-xl">
                          <div className="text-2xl font-bold text-violet-900">{statsData.total_clicks || 0}</div>
                          <div className="text-xs text-violet-600 font-medium">{isEmailCapture ? "Submissions" : isPDFDocument ? "Opens" : "Clicks"}</div>
                        </div>
                      </div>

                      {/* Chart */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-xs font-medium text-gray-500 mb-3">Activity</div>
                        <div className="h-[140px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={statsData.chart_data.map(d => ({
                                ...d,
                                date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              }))}
                              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                              <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#9ca3af", fontSize: 10 }}
                                dy={5}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#9ca3af", fontSize: 10 }}
                                dx={-5}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "white",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                  fontSize: "11px"
                                }}
                                formatter={(value: number, name: string) => {
                                  const labels: Record<string, string> = {
                                    views: "Views",
                                    clicks: isEmailCapture ? "Submissions" : isPDFDocument ? "Opens" : "Clicks"
                                  }
                                  return [value.toLocaleString(), labels[name] || name]
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="views"
                                stroke="#60a5fa"
                                strokeWidth={2}
                                dot={{ fill: "#60a5fa", strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5 }}
                                name="views"
                              />
                              <Line
                                type="monotone"
                                dataKey="clicks"
                                stroke="#a78bfa"
                                strokeWidth={2}
                                dot={{ fill: "#a78bfa", strokeWidth: 0, r: 3 }}
                                activeDot={{ r: 5 }}
                                name="clicks"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-between mt-3 pt-2 border-t border-gray-200">
                          <span className="text-[10px] text-muted-foreground">
                            {statsTimeframe === 'custom' ? customStartDate : statsTimeframe === 'today' ? 'Today' : `${statsTimeframe} days ago`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {statsTimeframe === 'custom' ? customEndDate : 'Now'}
                          </span>
                        </div>
                        {/* Legend */}
                        <div className="flex items-center justify-center gap-6 mt-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-400" />
                            <span className="text-xs text-gray-600">Views</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-violet-400" />
                            <span className="text-xs text-gray-600">{isEmailCapture ? "Submissions" : isPDFDocument ? "Opens" : "Clicks"}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>No data yet</p>
                      <p className="text-xs mt-1">Stats will appear once visitors interact with this block</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        <BlockToggle checked={block.enabled} onCheckedChange={onToggle} />
      </div>

      {isSelected && (
        <div className="border-t p-4 space-y-4 bg-gray-50/50">
          <BlockEditor
            block={block}
            socialLinks={socialLinks}
            onOpenImageLibrary={onOpenImageLibrary}
            onOpenSocialModal={onOpenSocialModal}
            onOpenThumbnailModal={onOpenThumbnailModal}
            iconPaths={iconPaths}
            filledIcons={filledIcons}
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
  iconPaths,
  filledIcons,
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
  iconPaths?: Record<string, string>
  filledIcons?: Set<string>
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
  onOpenStreamingModal?: (platform: string, index: number, data: LinkButtonBlockData, updateFn: (data: Partial<LinkButtonBlockData>) => void) => void
  onOpenAddBlockModal?: (groupId: string) => void
  onMoveChildToMainList?: (childBlock: OnePageBlock, groupId: string) => void
  updateBlockOverride?: (blockId: string, updates: Partial<OnePageBlock>) => void
  sellerProducts?: SellerProduct[]
}) {
  const { updateBlock: contextUpdateBlock, updateSocialLinks, setActiveSection, onepage } = useOnePage()
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

  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    updateBlock(block.id, { data: { ...block.data, ...updates } })
  }

  // Handle thumbnail upload
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setThumbnailUploading(true)
    try {
      const supabase = createClient()
      const fileExt = file.name.split('.').pop()
      const fileName = `thumbnail_${block.id}_${Date.now()}.${fileExt}`

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
      const fileName = `image_${block.id}_${currentImageItemId}_${Date.now()}.${fileExt}`

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

  // Icon library - simple, clean icons
  const THUMBNAIL_ICONS = [
    { id: 'link', name: 'Link', path: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
    { id: 'external', name: 'External', path: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3' },
    { id: 'star', name: 'Star', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { id: 'heart', name: 'Heart', path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
    { id: 'music', name: 'Music', path: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
    { id: 'video', name: 'Video', path: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
    { id: 'camera', name: 'Camera', path: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { id: 'shopping', name: 'Shopping', path: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0' },
    { id: 'gift', name: 'Gift', path: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z' },
    { id: 'book', name: 'Book', path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z' },
    { id: 'calendar', name: 'Calendar', path: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM16 2v4M8 2v4M3 10h18' },
    { id: 'mail', name: 'Mail', path: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6' },
    { id: 'phone', name: 'Phone', path: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
    { id: 'globe', name: 'Globe', path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
    { id: 'map-pin', name: 'Location', path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
    { id: 'download', name: 'Download', path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
    { id: 'file', name: 'File', path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
    { id: 'image', name: 'Image', path: 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21' },
    { id: 'coffee', name: 'Coffee', path: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3' },
    { id: 'zap', name: 'Bolt', path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
    // Social Media Platforms (monochrome/simple style)
    { id: 'instagram', name: 'Instagram', path: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z' },
    { id: 'twitter', name: 'Twitter/X', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
    { id: 'youtube', name: 'YouTube', path: 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z' },
    { id: 'tiktok', name: 'TikTok', path: 'M16.8218 5.1344C16.0887 4.29394 15.648 3.19805 15.648 2H14.7293C14.9659 3.3095 15.7454 4.43326 16.8218 5.1344ZM8.3218 11.9048C6.73038 11.9048 5.43591 13.2004 5.43591 14.7931C5.43591 15.903 6.06691 16.8688 6.98556 17.3517C6.64223 16.8781 6.43808 16.2977 6.43808 15.6661C6.43808 14.0734 7.73255 12.7778 9.324 12.7778C9.62093 12.7778 9.90856 12.8288 10.1777 12.9124V9.40192C9.89927 9.36473 9.61628 9.34149 9.324 9.34149C9.27294 9.34149 9.22654 9.34614 9.1755 9.34614V12.0394C8.90176 11.9558 8.61873 11.9048 8.3218 11.9048ZM19.4245 6.67608V9.34614C17.6429 9.34614 15.9912 8.77501 14.6456 7.80911V14.7977C14.6456 18.2851 11.8108 21.127 8.32172 21.127C6.97621 21.127 5.7235 20.6998 4.69812 19.98C5.8534 21.2198 7.50049 22 9.32392 22C12.8083 22 15.6478 19.1627 15.6478 15.6707V8.68211C16.9933 9.64801 18.645 10.2191 20.4267 10.2191V6.78293C20.0787 6.78293 19.7446 6.74574 19.4245 6.67608ZM14.6456 14.7977V7.80911C15.9912 8.77501 17.6429 9.34614 19.4245 9.34614V6.67608C18.3945 6.45788 17.4899 5.90063 16.8218 5.1344C15.7454 4.43326 14.9704 3.3095 14.7245 2H12.2098L12.2051 15.7775C12.1495 17.3192 10.8782 18.5591 9.32393 18.5591C8.35884 18.5591 7.50977 18.0808 6.98085 17.3564C6.06219 16.8688 5.4312 15.9076 5.4312 14.7977C5.4312 13.205 6.72567 11.9094 8.31708 11.9094C8.61402 11.9094 8.90168 11.9605 9.17079 12.0441V9.35079C5.75598 9.42509 3 12.2298 3 15.6707C3 17.3331 3.64492 18.847 4.69812 19.98C5.7235 20.6998 6.97621 21.127 8.32172 21.127C11.8061 21.127 14.6456 18.2851 14.6456 14.7977Z', isFilled: true },
    { id: 'spotify', name: 'Spotify', path: 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z' },
    { id: 'facebook', name: 'Facebook', path: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' },
    { id: 'linkedin', name: 'LinkedIn', path: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z' },
    { id: 'twitch', name: 'Twitch', path: 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7' },
    { id: 'discord', name: 'Discord', path: 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' },
    { id: 'telegram', name: 'Telegram', path: 'M23.1117 4.49449C23.4296 2.94472 21.9074 1.65683 20.4317 2.227L2.3425 9.21601C0.694517 9.85273 0.621087 12.1572 2.22518 12.8975L6.1645 14.7157L8.03849 21.2746C8.13583 21.6153 8.40618 21.8791 8.74917 21.968C9.09216 22.0568 9.45658 21.9576 9.70712 21.707L12.5938 18.8203L16.6375 21.8531C17.8113 22.7334 19.5019 22.0922 19.7967 20.6549L23.1117 4.49449ZM3.0633 11.0816L21.1525 4.0926L17.8375 20.2531L13.1 16.6999C12.7019 16.4013 12.1448 16.4409 11.7929 16.7928L10.5565 18.0292L10.928 15.9861L18.2071 8.70703C18.5614 8.35278 18.5988 7.79106 18.2947 7.39293C17.9906 6.99479 17.4389 6.88312 17.0039 7.13168L6.95124 12.876L3.0633 11.0816ZM8.17695 14.4791L8.78333 16.6015L9.01614 15.321C9.05253 15.1209 9.14908 14.9366 9.29291 14.7928L11.5128 12.573L8.17695 14.4791Z' },
    { id: 'whatsapp', name: 'WhatsApp', path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z' },
    { id: 'pinterest', name: 'Pinterest', path: 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z' },
    { id: 'snapchat', name: 'Snapchat', path: 'M11.99 2.75c-1.494-.011-3.017.567-4.003 1.714-.874.926-1.204 2.238-1.16 3.483-.004.64.004 1.28.006 1.92-.613-.152-1.234-.578-1.882-.367-.553.164-.783.886-.45 1.349.36.47.918.738 1.385 1.089.229.188.538.321.71.562 0 .577-.303 1.112-.59 1.599-.7 1.099-1.786 1.93-2.956 2.509-.3.129-.572.518-.309.812.485.453 1.167.598 1.77.811.256.08.635.168.608.507.042.365.276.758.687.76.982.114 2.036.065 2.918.59.868.501 1.756 1.059 2.777 1.117 1.02.1 2.08-.111 2.958-.663.654-.36 1.292-.81 2.06-.883.645-.15 1.338-.015 1.96-.26.4-.17.35-.66.51-.984.32-.22.72-.243 1.07-.388.46-.183 1.04-.332 1.27-.802.14-.38-.29-.586-.56-.734-1.42-.734-2.7-1.87-3.27-3.4-.06-.24-.29-.6.01-.78.62-.52 1.43-.82 1.94-1.46.39-.488.12-1.318-.52-1.418-.618-.098-1.19.24-1.77.391-.051-1.068.063-2.152-.102-3.218-.304-1.726-1.69-3.145-3.35-3.64-.565-.18-1.158-.25-1.746-.25z' },
    { id: 'github', name: 'GitHub', path: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z' },
    { id: 'apple-music', name: 'Apple Music', path: 'M9.34 16.82v-7.94q0-.42.47-.51l6.43-1.3q.51-.1.56.47v5.68q0 .7-2.1.93c-2.65.42-2.23 4.89 1.4 3.68 1.4-.51 1.63-1.86 1.63-3.21V4.1s0-.93-.79-.7l-7.91 1.63s-.6.1-.6.84v9.45q0 .7-2.1.93c-2.65.42-2.23 4.89 1.4 3.68 1.4-.51 1.63-1.86 1.63-3.21', filled: true },
  ]

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
      const blockBackgroundColorPresets = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#1a1a1a']
      const textColorPresets = ['#ffffff', '#000000', '#1a1a1a', '#f5f5f5', '#374151', '#6b7280']
      const buttonColorPresets = ['#ffffff', '#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      const buttonTextColorPresets = ['#1a1a1a', '#ffffff', '#7c3aed', '#3b82f6', '#ef4444', '#10b981']

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
                      ? "bg-violet-500 text-white"
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
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                          ? "bg-violet-50 text-violet-700 font-medium"
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
                        ? "bg-violet-50 text-violet-700 font-medium"
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
              <p className="text-xs text-muted-foreground">Override colors from Design tab</p>

              {/* Block Background Color */}
              <div className="space-y-2">
                <Label className="text-xs">Block Background Color</Label>
                <div className="flex items-center gap-3">
                  <MobileColorPicker
                    value={data.block_background_color || "#7c3aed"}
                    onChange={(color) => updateData({ block_background_color: color })}
                    label="Block background color"
                    presets={blockBackgroundColorPresets}
                  />
                  <Input
                    value={data.block_background_color || ""}
                    onChange={(e) => updateData({ block_background_color: e.target.value })}
                    placeholder="Use theme default"
                    className="h-12 rounded-xl flex-1 font-mono text-sm"
                  />
                </div>
                {/* Color presets */}
                <div className="flex gap-2 pt-1">
                  {blockBackgroundColorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateData({ block_background_color: color })}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        data.block_background_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Text Color (for title, description, price) */}
              <div className="space-y-2">
                <Label className="text-xs">Text Color</Label>
                <p className="text-[10px] text-muted-foreground">For title, description, price{data.style === "callout" ? " and button" : ""}</p>
                <div className="flex items-center gap-3">
                  <MobileColorPicker
                    value={data.text_color || "#ffffff"}
                    onChange={(color) => updateData({ text_color: color })}
                    label="Text color"
                    presets={textColorPresets}
                  />
                  <Input
                    value={data.text_color || ""}
                    onChange={(e) => updateData({ text_color: e.target.value })}
                    placeholder="Use theme default"
                    className="h-12 rounded-xl flex-1 font-mono text-sm"
                  />
                </div>
                {/* Color presets */}
                <div className="flex gap-2 pt-1">
                  {textColorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateData({ text_color: color })}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        data.text_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Button (CTA) Background Color - Only for preview style */}
              {data.style === "preview" && (
                <div className="space-y-2">
                  <Label className="text-xs">Button Color</Label>
                  <p className="text-[10px] text-muted-foreground">CTA button background</p>
                  <div className="flex items-center gap-3">
                    <MobileColorPicker
                    value={data.button_color || "#ffffff"}
                    onChange={(color) => updateData({ button_color: color })}
                    label="Button color"
                    presets={buttonColorPresets}
                  />
                    <Input
                      value={data.button_color || ""}
                      onChange={(e) => updateData({ button_color: e.target.value })}
                      placeholder="Use theme default"
                      className="h-12 rounded-xl flex-1 font-mono text-sm"
                    />
                  </div>
                  {/* Color presets */}
                  <div className="flex gap-2 pt-1">
                    {buttonColorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateData({ button_color: color })}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                          data.button_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Button (CTA) Text Color - Only for preview style */}
              {data.style === "preview" && (
                <div className="space-y-2">
                  <Label className="text-xs">Button Text Color</Label>
                  <div className="flex items-center gap-3">
                    <MobileColorPicker
                    value={data.button_text_color || "#1a1a1a"}
                    onChange={(color) => updateData({ button_text_color: color })}
                    label="Button text color"
                    presets={buttonTextColorPresets}
                  />
                    <Input
                      value={data.button_text_color || ""}
                      onChange={(e) => updateData({ button_text_color: e.target.value })}
                      placeholder="Use theme default"
                      className="h-12 rounded-xl flex-1 font-mono text-sm"
                    />
                  </div>
                  {/* Color presets */}
                  <div className="flex gap-2 pt-1">
                    {buttonTextColorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateData({ button_text_color: color })}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                          data.button_text_color === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // Default layout content for link_button and image blocks
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground mb-2">Choose how this block displays on your page</p>

        {/* Layout Options Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Default Layout Option */}
          <button
            type="button"
            onClick={() => updateData({ layout_type: 'default' })}
            className={cn(
              "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
              currentLayoutType === 'default'
                ? "border-violet-500 bg-violet-50/50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            )}
          >
            {/* Visual Preview */}
            <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
              <div className="w-full h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center gap-2 px-3">
                <div className="w-5 h-5 rounded bg-gray-200" />
                <div className="flex-1 h-2.5 bg-gray-200 rounded" />
              </div>
            </div>
            
            {/* Label */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                currentLayoutType === 'default' ? "border-violet-500" : "border-gray-300"
              )}>
                {currentLayoutType === 'default' && (
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                )}
              </div>
              <span className="font-medium text-sm">Default</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 ml-6">Standard button</p>
          </button>

          {/* Pro Layout Option */}
          <button
            type="button"
            onClick={() => updateData({ layout_type: 'pro' })}
            className={cn(
              "relative p-3 rounded-xl border-2 text-left transition-all flex flex-col",
              currentLayoutType === 'pro'
                ? "border-violet-500 bg-violet-50/50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            )}
          >
            {/* Visual Preview */}
            <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
              <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-200 to-violet-300 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-full bg-gray-200 rounded" />
                    <div className="h-2 w-2/3 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Label */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                currentLayoutType === 'pro' ? "border-violet-500" : "border-gray-300"
              )}>
                {currentLayoutType === 'pro' && (
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                )}
              </div>
              <span className="font-medium text-sm">Featured</span>
              <Sparkles className="w-3 h-3 text-violet-500" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 ml-6">With thumbnail</p>
          </button>
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
                        ? "border-violet-500 bg-violet-50"
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
        const selectedIconPath = data.icon && iconPaths ? iconPaths[data.icon] : null
        const isFilledIcon = data.icon && filledIcons ? filledIcons.has(data.icon) : false
        return (
          <div className="space-y-3">
            {/* Thumbnail Editor - Opens Modal */}
            <div className="space-y-1.5">
              <Label className="text-xs">Thumbnail</Label>
              <button
                type="button"
                onClick={() => onOpenThumbnailModal && onOpenThumbnailModal(block.id)}
                className="group relative w-11 h-11 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-gray-50 hover:bg-gray-100"
              >
                {data.thumbnail_url ? (
                  <img
                    src={data.thumbnail_url}
                    alt="Thumbnail"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : selectedIconPath ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={isFilledIcon ? "currentColor" : "none"}
                    stroke={isFilledIcon ? "none" : "currentColor"}
                    strokeWidth={isFilledIcon ? "0" : "2"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-500"
                  >
                    <path d={selectedIconPath} />
                  </svg>
                ) : (
                  <ImageIcon className="w-5 h-5 text-gray-400" />
                )}
                {/* Pencil icon always visible */}
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center">
                  <Pencil className="w-2.5 h-2.5 text-gray-500" />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={data.label} onChange={(e) => updateData({ label: e.target.value })} placeholder="My Link" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL</Label>
              <Input
                value={data.url}
                onChange={(e) => {
                  if (onUrlChangeWithAutoFetch) {
                    onUrlChangeWithAutoFetch(block.id, e.target.value)
                  } else {
                    updateData({ url: e.target.value })
                  }
                }}
                placeholder="https://..."
                className="h-9"
              />
            </div>

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
                        <Toggle
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
                        <Toggle
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
                  <Toggle
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
                              className="text-xs text-violet-600 hover:text-violet-700 font-medium"
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
                        <Toggle
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
                  <Toggle
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
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                              ? "bg-violet-50 text-violet-700 font-medium"
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
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-violet-400 flex items-center justify-center transition-colors"
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
                  <Toggle
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
                          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-violet-600" />
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
                      <p className="text-[10px] text-muted-foreground bg-violet-50 p-2 rounded-lg">
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
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      (data.layout_type || 'default') === 'default' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                      ? "border-violet-500 bg-violet-50/50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  {/* Visual Preview */}
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden p-2">
                    <div className="w-full bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-200 to-violet-300 shrink-0" />
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
                      data.layout_type === 'pro' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-violet-500" />
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
              <Toggle checked={data.show_avatar} onCheckedChange={(checked) => updateData({ show_avatar: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Name</Label>
              <Toggle checked={data.show_name} onCheckedChange={(checked) => updateData({ show_name: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Bio</Label>
              <Toggle checked={data.show_bio} onCheckedChange={(checked) => updateData({ show_bio: checked })} />
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
                        dragOverSocialId === platform && "border-violet-500"
                      )}
                    >
                      <GripVertical className="h-4 w-4 text-gray-300" />
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: config?.color }}
                      >
                        <RenderSocialIcon platform={platform} size={14} color="#ffffff" />
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Top Padding</Label>
                  <span className="text-xs text-muted-foreground">{(block.data as SocialRowBlockData).padding_top ?? 0}px</span>
                </div>
                <Slider
                  value={[(block.data as SocialRowBlockData).padding_top ?? 0]}
                  onValueChange={([value]) => updateData({ padding_top: value })}
                  min={0}
                  max={48}
                  step={4}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Bottom Padding</Label>
                  <span className="text-xs text-muted-foreground">{(block.data as SocialRowBlockData).padding_bottom ?? 0}px</span>
                </div>
                <Slider
                  value={[(block.data as SocialRowBlockData).padding_bottom ?? 0]}
                  onValueChange={([value]) => updateData({ padding_bottom: value })}
                  min={0}
                  max={48}
                  step={4}
                  className="w-full"
                />
              </div>
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
                        ? "border-violet-500 bg-violet-50"
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
            <div className="space-y-1.5">
              <Label className="text-xs">Height: {data.height}px</Label>
              <Slider
                value={[data.height]}
                onValueChange={([value]) => updateData({ height: value })}
                min={8}
                max={64}
                step={4}
              />
            </div>
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
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                            <div className="w-8 h-8 border-2 border-gray-300 border-t-violet-500 rounded-full animate-spin" />
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
                <Toggle
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
                <Toggle
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
                    <Toggle
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
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                <Toggle
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
                <Toggle
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      (data.layout_type || 'default') === 'default' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      data.layout_type === 'pro' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-violet-500" />
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
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-violet-400 flex items-center justify-center transition-colors"
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
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                <Toggle
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
                <Toggle
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      (data.layout_type || 'default') === 'default' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      data.layout_type === 'pro' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-violet-500" />
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
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-violet-400 flex items-center justify-center transition-colors"
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
              <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                  <Toggle
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
                  <Toggle
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      (data.layout_type || 'default') === 'default' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {(data.layout_type || 'default') === 'default' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                      ? "border-violet-500 bg-violet-50/50"
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
                      data.layout_type === 'pro' ? "border-violet-500" : "border-gray-300"
                    )}>
                      {data.layout_type === 'pro' && (
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                      )}
                    </div>
                    <span className="font-medium text-sm">Featured</span>
                    <Sparkles className="w-3 h-3 text-violet-500" />
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
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-violet-400 flex items-center justify-center transition-colors"
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
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
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
                              ? "bg-violet-50 text-violet-700"
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
                            <p className={cn("font-medium truncate", data.product_id === product.id && "text-violet-700")}>
                              {product.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {product.price_cents > 0 ? `$${(product.price_cents / 100).toFixed(2)}` : 'Free'}
                            </p>
                          </div>
                          {data.product_id === product.id && (
                            <Check className="w-4 h-4 text-violet-600 shrink-0" />
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
                  className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit Product
                </a>
                <a
                  href="/store-builder?pageType=product"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors"
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
                <Toggle
                  checked={data.show_price !== false}
                  onCheckedChange={(checked) => updateData({ show_price: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Description</Label>
                <Toggle
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
                  <Toggle
                    checked={data.quick_checkout || false}
                    onCheckedChange={(checked) => updateData({ quick_checkout: checked })}
                  />
                </div>
                {data.quick_checkout && (
                  <p className="text-[10px] text-muted-foreground bg-violet-50 p-2 rounded-lg">
                    Users will see a quick checkout form instead of being redirected to the checkout page.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      }

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
          return { title: d.label || "My Link", icon: Link, thumbnail_url: d.thumbnail_url, iconId: d.icon }
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
              <div className="space-y-1.5">
                <Label className="text-xs">Height: {d.height || 24}px</Label>
                <Slider value={[d.height || 24]} onValueChange={([v]) => updateChildData({ height: v })} min={8} max={64} step={4} />
              </div>
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
          <TabsTrigger value="links" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
            <Link className="w-3.5 h-3.5" />
            Links
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
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
                          selectedGroupChildId === child.id ? "border-violet-500 ring-1 ring-violet-500" : "border-gray-200 hover:border-gray-300",
                          groupDraggedId === child.id && "opacity-50",
                          groupDragOverId === child.id && "border-violet-400 border-dashed bg-violet-50",
                          !child.enabled && "opacity-50"
                        )}
                      >
                        <div className="cursor-grab text-gray-300 hover:text-gray-400">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {preview.thumbnail_url ? (
                            <img src={preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : preview.iconId && iconPaths?.[preview.iconId] ? (
                            <img
                              src={iconPaths[preview.iconId]}
                              alt=""
                              className="w-4 h-4"
                              style={{ filter: filledIcons?.has(preview.iconId) ? undefined : 'invert(0.5)' }}
                            />
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
                  iconPaths={iconPaths}
                  filledIcons={filledIcons}
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
                  ? "border-violet-500 bg-violet-50/50"
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
                  groupData.layout === "stack" ? "border-violet-500" : "border-gray-300"
                )}>
                  {groupData.layout === "stack" && (
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                  ? "border-violet-500 bg-violet-50/50"
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
                  groupData.layout === "carousel" ? "border-violet-500" : "border-gray-300"
                )}>
                  {groupData.layout === "carousel" && (
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
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
                          ? "bg-violet-500 text-white"
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

  // If block supports layout, render with tabs; otherwise just render settings
  if (supportsLayout) {
    return (
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full mb-3 bg-transparent p-0 h-auto gap-2">
          <TabsTrigger value="settings" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-medium gap-1.5 transition-all data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=inactive]:border-gray-200 data-[state=inactive]:bg-white data-[state=inactive]:hover:border-gray-300">
            <LayoutGrid className="w-3.5 h-3.5" />
            Layout
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-0">
          {renderSettingsContent()}
        </TabsContent>
        <TabsContent value="layout" className="mt-0">
          {renderLayoutContent()}
        </TabsContent>
      </Tabs>
    )
  }

  // For blocks without layout support, just render settings directly
  return renderSettingsContent()
}
