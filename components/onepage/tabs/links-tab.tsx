"use client"

import { useOnePage } from "@/lib/onepage/context"
import type {
  OnePageBlock,
  OnePageBlockType,
  LinkButtonBlockData,
  TextBlockData,
  EmailCaptureBlockData,
  ImageBlockData,
  DividerBlockData,
  HeaderBlockData,
  SocialRowBlockData,
  OnePageSocialLinks,
  BlockLayoutType,
  YouTubeMode,
  SpotifyMode,
  StreamingService,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
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
} from "lucide-react"
import React, { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

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
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
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
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
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
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.102-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.045-.09-.09-.09m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.059-.104-.12-.104m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.225-2.544-.225-2.64c-.015-.075-.06-.135-.135-.135m1.065.202c-.09 0-.166.075-.18.165l-.18 2.46.195 2.46c.016.09.09.165.18.165s.165-.075.18-.165l.21-2.46-.21-2.46c-.016-.09-.09-.165-.18-.165m1.065-.202c-.105 0-.195.09-.21.195l-.165 2.685.18 2.43c.015.104.09.179.21.179.105 0 .18-.074.195-.179l.194-2.43-.194-2.685c-.015-.105-.09-.195-.195-.195m1.17-.585c-.12 0-.225.105-.225.225l-.165 3.255.165 2.355c0 .12.105.225.225.225s.225-.105.225-.225l.18-2.355-.18-3.255c0-.12-.105-.225-.225-.225m1.095-.314c-.135 0-.24.105-.255.24l-.15 3.585.15 2.295c.015.135.12.24.255.24.12 0 .24-.105.255-.24l.165-2.295-.165-3.585c-.015-.135-.135-.24-.255-.24m1.17-.135c-.15 0-.27.12-.27.27l-.135 3.705.135 2.235c0 .15.12.27.27.27s.27-.12.27-.27l.15-2.235-.15-3.705c0-.15-.12-.27-.27-.27m1.154.24c-.165 0-.3.135-.315.3l-.105 3.45.105 2.175c.015.165.15.3.315.3.165 0 .3-.135.3-.3l.12-2.175-.12-3.45c-.015-.165-.135-.3-.3-.3m1.155-.48c-.18 0-.33.15-.33.33l-.105 3.915.105 2.13c0 .18.15.33.33.33.18 0 .33-.15.345-.33l.105-2.13-.105-3.915c-.015-.18-.165-.33-.345-.33m1.2-.48c-.195 0-.36.165-.36.36l-.09 4.335.09 2.085c0 .195.165.36.36.36s.36-.165.36-.36l.105-2.085-.105-4.335c0-.195-.165-.36-.36-.36m1.125 1.725c-.21 0-.375.18-.39.39l-.06 2.22.075 2.025c.015.21.18.375.375.375.21 0 .375-.165.39-.375l.075-2.025-.075-2.22c-.015-.21-.18-.39-.39-.39m8.67-1.17c-.48 0-.93.09-1.35.27-.27-3.03-2.82-5.415-5.94-5.415-.75 0-1.485.15-2.145.405-.255.105-.33.21-.33.405v10.725c0 .21.165.39.375.405h9.39c1.995 0 3.615-1.62 3.615-3.615s-1.62-3.615-3.615-3.615"/>
    </svg>
  ),
  kick: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M1.333 0v24h5.334v-8l2.666 2.667L14.667 24H22l-8-9.333L22 5.333h-7.333l-5.334 6.334V0H1.333z"/>
    </svg>
  ),
  discord: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
    </svg>
  ),
  snapchat: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301a.32.32 0 01.135-.03c.085 0 .166.022.23.06.105.06.195.18.195.33 0 .135-.06.27-.165.345a1.964 1.964 0 01-.615.255c-.27.09-.57.165-.87.225-.18.045-.33.105-.42.195-.12.12-.165.285-.195.45-.015.105-.015.195-.015.285 0 .105.045.195.09.285a1.05 1.05 0 00.45.42c.09.06.18.12.285.165.645.345 1.215.855 1.635 1.455.33.465.54.96.615 1.485.06.39-.015.795-.225 1.14-.345.57-1.065.945-2.205 1.125-.18.03-.375.06-.585.09-.195.03-.405.06-.645.09-.105.015-.18.075-.225.15-.045.09-.12.315-.195.555-.09.27-.15.45-.24.585-.24.36-.72.585-1.35.585-.21 0-.435-.03-.675-.06-.315-.045-.69-.09-1.14-.09-.18 0-.375.015-.57.03-.18.015-.36.03-.555.03-.585 0-1.17-.12-1.725-.36-.735-.315-1.395-.9-1.98-1.755-.855-1.26-.705-2.4-.63-2.64a.615.615 0 00-.165-.57 1.05 1.05 0 00-.525-.27c-.315-.075-.69-.12-1.11-.195-1.14-.18-1.86-.555-2.205-1.125-.21-.345-.285-.75-.225-1.14.075-.525.285-1.02.615-1.485.42-.6.99-1.11 1.635-1.455.105-.06.195-.105.285-.165.195-.12.36-.27.45-.42a.568.568 0 00.09-.285c0-.09-.015-.18-.015-.285-.03-.165-.075-.33-.195-.45-.09-.09-.24-.15-.42-.195a6.044 6.044 0 01-.87-.225 1.964 1.964 0 01-.615-.255.379.379 0 01-.165-.345c0-.15.09-.27.195-.33a.385.385 0 01.23-.06c.045 0 .09.015.135.03.374.18.733.287 1.033.301.198 0 .326-.045.401-.09-.008-.165-.018-.33-.03-.51l-.003-.06c-.104-1.628-.23-3.654.299-4.847C7.859 1.069 11.216.793 12.206.793z"/>
    </svg>
  ),
  threads: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 192 192" fill={color}>
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 125.084 64.8569 132.827 72.0518 138.095C78.0037 142.425 85.7883 144.669 93.8627 144.267C104.67 143.762 113.294 139.372 119.426 131.257C123.968 125.209 126.839 117.661 128.011 108.524C134.151 112.138 138.711 116.852 140.818 122.579C144.283 131.969 144.493 147.389 132.112 159.684C121.329 170.391 108.196 175.168 90.4863 175.313C71.1024 175.146 56.413 169.087 46.743 157.33C37.7196 146.384 33.0206 130.727 32.8218 110.728L32.8218 81.2724C33.0206 61.2734 37.7196 45.6164 46.743 34.6699C56.413 22.9131 71.1024 16.8538 90.4863 16.687C109.996 16.8551 124.983 22.969 135.077 34.8069C139.98 40.5571 143.818 47.559 146.498 55.5601L163.044 50.2802C159.626 40.0171 154.589 31.1436 147.971 23.8628C134.709 9.04939 116.136 1.41406 90.5517 1.18164L90.4209 1.18111C64.9526 1.41299 46.6603 9.0918 33.6384 23.9936C22.3006 36.9827 16.2393 54.9747 16.0037 77.5368V77.5752L16 110.766L16.0037 114.463V114.501C16.2393 137.063 22.3006 155.055 33.6384 168.044C46.6603 182.946 64.9526 190.625 90.4209 190.857L90.5517 190.856C113.049 190.674 129.763 184.282 143.474 170.655C161.387 152.86 160.887 130.625 155.586 117.281C151.64 107.259 143.663 99.0028 132.122 93.3506C131.667 91.8653 131.16 90.3969 130.603 88.9554L141.537 88.9883ZM98.4405 127.461C88.1005 127.987 77.7615 123.461 77.2019 114.047C76.7685 106.846 81.9377 97.7908 99.0178 96.8022C101.279 96.6754 103.499 96.6135 105.678 96.6135C111.478 96.6135 116.931 97.1398 121.955 98.1592C120.066 117.743 109.748 126.885 98.4405 127.461Z"/>
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
  { id: "telegram", label: "Telegram", placeholder: "https://t.me/username", color: "#0088CC" },
  { id: "twitch", label: "Twitch", placeholder: "https://twitch.tv/username", color: "#9146FF" },
  { id: "website", label: "Website", placeholder: "https://yourwebsite.com", color: "#6366F1" },
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
    id: "suggested",
    label: "Popular",
    icon: Heart,
    blocks: [
      { type: "link_button" as const, label: "Link", description: "Add any URL", icon: Link },
      { type: "header" as const, label: "Header", description: "Profile section", icon: User },
      { type: "email_capture" as const, label: "Form", description: "Collect emails", icon: Mail },
      { type: "product" as const, label: "Product", description: "Sell a product", icon: ShoppingBag },
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
      { type: "link_button" as const, label: "Twitter/X", description: "Link to X", icon: Share2, preset: { label: "Follow on X", url: "https://x.com/" } },
      { type: "link_button" as const, label: "Spotify", description: "Share your music", icon: Share2, preset: { label: "Listen on Spotify", url: "https://open.spotify.com/" } },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: Video,
    blocks: [
      { type: "image" as const, label: "Image", description: "Upload or link an image", icon: Image },
      { type: "link_button" as const, label: "YouTube Video", description: "Embed a video link", icon: Share2, preset: { label: "Watch Video", url: "https://youtube.com/watch?v=" } },
      { type: "link_button" as const, label: "Spotify Song", description: "Share a song", icon: Share2, preset: { label: "Listen Now", url: "https://open.spotify.com/track/" } },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    icon: MessageSquare,
    blocks: [
      { type: "email_capture" as const, label: "Email Signup", description: "Collect emails", icon: Mail },
      { type: "link_button" as const, label: "Contact Form", description: "Link to form", icon: FileText, preset: { label: "Contact Me", url: "" } },
    ],
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
    blocks: [
      { type: "text" as const, label: "Text", description: "Add text content", icon: Type },
      { type: "divider" as const, label: "Divider", description: "Add spacing", icon: Minus },
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
      return { title: data.label || "My Link", subtitle: displayUrl, icon: Link }
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
    default:
      return { title: block.type, subtitle: "", icon: Link }
  }
}

// Helper to detect YouTube URLs
function isYouTubeUrl(url: string): boolean {
  if (!url) return false
  return url.includes('youtube.com') || url.includes('youtu.be')
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
  return url.includes('spotify.com') || url.includes('open.spotify.com')
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
  } = useOnePage()

  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalCategory, setAddModalCategory] = useState("suggested")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSocialModal, setShowSocialModal] = useState(false)
  const [selectedSocial, setSelectedSocial] = useState<string | null>(null)
  const [socialUrl, setSocialUrl] = useState("")
  const [socialUrlError, setSocialUrlError] = useState<string | null>(null)
  const [showImageLibrary, setShowImageLibrary] = useState(false)
  const [imageBlockId, setImageBlockId] = useState<string | null>(null)
  const [showArchiveView, setShowArchiveView] = useState(false)

  // Thumbnail modal state
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [thumbnailBlockId, setThumbnailBlockId] = useState<string | null>(null)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [showIconLibraryInModal, setShowIconLibraryInModal] = useState(false)
  const [iconSearchQuery, setIconSearchQuery] = useState("")
  const [iconCategory, setIconCategory] = useState("all")
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

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
  const [isResizingCrop, setIsResizingCrop] = useState(false)
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

        if (hasNewPlatforms || hasRemovedPlatforms) {
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
  }, [social_links])

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
    'tiktok': 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5',
    'spotify': 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z',
    'facebook': 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
    'linkedin': 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
    'twitch': 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7',
    'discord': 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z',
    'telegram': 'M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.303l3.2 1.067 1.493 4.8a1.5 1.5 0 0 0 2.368.671l2.441-1.953 4.195 3.209a2.25 2.25 0 0 0 3.541-1.332l3-15A2.25 2.25 0 0 0 21.198 2.433zM6.988 13.678l7.25-4.812-5.5 5.562-.75 3z',
    'whatsapp': 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
    'pinterest': 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
    'snapchat': 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301a.42.42 0 0 1 .19-.04c.15 0 .39.06.54.21.195.195.345.54.345.825 0 .39-.24.675-.51.855a2.58 2.58 0 0 1-1.32.45c-.225.015-.42.03-.614.045-.48.06-.48.255-.48.36 0 .09.015.165.045.255a7.35 7.35 0 0 0 2.115 3.195c.735.675 1.695 1.17 2.834 1.425.15.03.27.12.315.255.03.06.045.12.045.18 0 .285-.24.54-.765.69-.375.105-.825.165-1.305.195a.7.7 0 0 0-.165.015c-.09.015-.165.03-.27.045-.285.045-.54.09-.63.36-.045.105-.075.195-.105.285-.09.255-.195.555-.705.555-.09 0-.195-.015-.315-.03-.66-.09-1.365-.45-2.22-.45-.12 0-.24 0-.36.015-1.08.075-1.905.795-2.97 1.68-1.035.855-2.2 1.824-4.005 1.824-1.695 0-2.79-.9-3.78-1.71-1.095-.885-2.04-1.68-3.165-1.8a4.47 4.47 0 0 0-.315-.015c-.87 0-1.56.36-2.205.45a1.83 1.83 0 0 1-.33.03c-.495 0-.6-.285-.69-.54l-.12-.3c-.09-.27-.345-.315-.63-.36a1.49 1.49 0 0 0-.27-.045 1.21 1.21 0 0 0-.18-.015c-.48-.03-.93-.09-1.29-.195-.525-.15-.78-.405-.78-.69 0-.06.015-.12.045-.18.045-.135.165-.225.315-.255 1.14-.255 2.1-.75 2.835-1.425a7.35 7.35 0 0 0 2.115-3.195c.03-.09.045-.165.045-.255 0-.105 0-.3-.48-.36a10.31 10.31 0 0 1-.615-.045c-.495-.03-1.05-.15-1.32-.45-.27-.18-.51-.465-.51-.855 0-.285.15-.63.345-.825.15-.15.39-.21.54-.21.075 0 .135.015.19.04.39.195.735.285 1.035.3.195 0 .33-.045.405-.09-.015-.165-.022-.33-.03-.51l-.003-.06c-.105-1.628-.233-3.654.3-4.848C5.648 1.069 9.004.793 9.994.793h.005z',
    'reddit': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm4.67-12.003c.35 0 .691.056 1.015.164a1.89 1.89 0 0 1 1.216 2.376c-.239.73-.908 1.203-1.667 1.203-.76 0-1.428-.473-1.667-1.203a1.89 1.89 0 0 1 1.103-2.54zM8.33 9.997c.35 0 .691.056 1.015.164a1.89 1.89 0 0 1 1.216 2.376c-.239.73-.908 1.203-1.667 1.203-.76 0-1.428-.473-1.667-1.203a1.89 1.89 0 0 1 1.103-2.54zM12 18c-2.21 0-4-1.343-4-3h8c0 1.657-1.79 3-4 3z',
    'threads': 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.332-3.023.88-.73 2.107-1.168 3.662-1.31.883-.08 1.807-.07 2.755.03-.073-.485-.192-.923-.353-1.313-.346-.836-.855-1.456-1.513-1.844-.715-.422-1.63-.624-2.724-.602-.937.019-1.794.238-2.55.65-.69.377-1.272.922-1.73 1.62l-1.686-1.094c.61-.938 1.392-1.672 2.32-2.177.994-.54 2.137-.823 3.399-.84h.212c1.398.017 2.604.282 3.584.787.986.507 1.763 1.258 2.31 2.233.39.696.642 1.49.755 2.373 1.01.324 1.912.816 2.679 1.472 1.052.898 1.797 2.07 2.218 3.487.384 1.29.43 2.817-.28 4.394-.72 1.6-1.995 2.925-3.791 3.942-1.73.98-3.795 1.49-6.144 1.518zm-.293-7.232c-.87.046-1.542.291-1.942.712-.38.399-.57.862-.54 1.338.032.49.275.9.698 1.173.466.302 1.135.453 1.989.41 1.08-.059 1.896-.44 2.426-1.131.466-.609.77-1.455.907-2.526a15.7 15.7 0 0 0-3.538.024z',
    'github': 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z',
    'soundcloud': 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.102-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.045-.09-.09-.09m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.059-.104-.12-.104',
    'apple-music': 'M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.62.497 2.373.55 1.205 1.47 2.082 2.72 2.594.454.186.93.3 1.415.38.37.06.74.1 1.113.12.2.01.397.02.596.027h12.268c.15-.01.3-.018.45-.028.94-.06 1.86-.19 2.72-.58 1.1-.5 1.92-1.3 2.45-2.4.23-.48.38-1 .46-1.53.08-.47.13-.95.15-1.43.01-.12.01-.25.01-.37V6.18l-.04.04z M12 18.75c-4.694 0-8.5-3.806-8.5-8.5s3.806-8.5 8.5-8.5 8.5 3.806 8.5 8.5-3.806 8.5-8.5 8.5zM10 6v8l6-4z',
  }

  // Organize icons by category for better browsing
  const ICON_CATEGORIES = [
    { id: 'all', label: 'All', icons: Object.keys(THUMBNAIL_ICON_PATHS) },
    { id: 'platforms', label: 'Platforms', icons: ['instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin', 'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat', 'reddit', 'threads', 'github', 'soundcloud', 'apple-music'] },
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
    'threads', 'github', 'soundcloud', 'apple-music'
  ])

  const THUMBNAIL_ICONS = Object.entries(THUMBNAIL_ICON_PATHS).map(([id, path]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
    path,
    isFilled: FILLED_ICONS.has(id)
  }))

  // Auto-fetch thumbnail for social media links (Spotify, YouTube, etc.)
  const autoFetchThumbnail = useCallback(async (blockId: string, url: string) => {
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
      if (url.includes('spotify.com/') || url.includes('open.spotify.com/')) {
        try {
          const apiResponse = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(url)}`)
          if (apiResponse.ok) {
            const spotifyData = await apiResponse.json()
            // Convert to high quality image (640x640 instead of 300x300)
            thumbnailUrl = spotifyData.thumbnailUrl?.replace('ab67616d00001e02', 'ab67616d0000b273') || spotifyData.thumbnailUrl
            // Also store Spotify metadata for display
            const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
            if (currentData) {
              updateBlock(blockId, {
                data: {
                  ...currentData,
                  thumbnail_url: thumbnailUrl || currentData.thumbnail_url,
                  icon: thumbnailUrl ? null : currentData.icon,
                  spotify_title: spotifyData.title || null,
                  spotify_artist: spotifyData.artistName || null,
                  spotify_type: spotifyData.type || null,
                  spotify_thumbnail: thumbnailUrl || null
                }
              })
              return // Skip the generic thumbnail update below
            }
          }
        } catch (e) {
          // Fallback to oEmbed if our API fails
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
          // Use maximum resolution thumbnail
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        }
      }
      // SoundCloud oEmbed
      else if (url.includes('soundcloud.com/')) {
        const response = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)
        if (response.ok) {
          const data = await response.json()
          thumbnailUrl = data.thumbnail_url
        }
      }
      // Vimeo oEmbed
      else if (url.includes('vimeo.com/')) {
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)
        if (response.ok) {
          const data = await response.json()
          thumbnailUrl = data.thumbnail_url
        }
      }

      // Update block if we got a thumbnail
      if (thumbnailUrl) {
        const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
        if (currentData) {
          updateBlock(blockId, {
            data: {
              ...currentData,
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
  const handleUrlChangeWithAutoFetch = useCallback((blockId: string, url: string) => {
    const currentData = onepage?.draft_blocks.find(b => b.id === blockId)?.data as LinkButtonBlockData
    if (currentData) {
      updateBlock(blockId, { data: { ...currentData, url } })
    }

    // Debounce the auto-fetch - only fetch if URL looks complete
    if (url.length > 10 && (url.startsWith('http://') || url.startsWith('https://'))) {
      // Use a short delay to avoid fetching while user is still typing
      const timeoutId = setTimeout(() => {
        autoFetchThumbnail(blockId, url)
      }, 800)
      return () => clearTimeout(timeoutId)
    }
  }, [autoFetchThumbnail, onepage?.draft_blocks, updateBlock])

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

      updateBlock(thumbnailBlockId, {
        data: {
          ...onepage.draft_blocks.find(b => b.id === thumbnailBlockId)?.data,
          thumbnail_url: publicUrl,
          icon: null
        }
      })
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
    if (!block || block.type !== 'link_button') return null
    return block.data as LinkButtonBlockData
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

  const handleAddBlock = (type: OnePageBlockType, preset?: { label: string; url: string }) => {
    // Check if block type is at its limit
    if (isBlockTypeAtLimit(type)) {
      return // Don't add the block
    }

    const newBlock = addBlock(type, insertAfterId || undefined)
    if (preset && newBlock) {
      updateBlock(newBlock.id, {
        data: {
          ...newBlock.data,
          label: preset.label,
          url: preset.url
        }
      })
    }
    setShowAddModal(false)
    setSearchQuery("")
    setInsertAfterId(null)
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
    setShowSocialModal(false)
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

  const activeCategoryBlocks = (searchQuery
    ? filteredCategories.flatMap(c => c.blocks)
    : blockCategories.find((c) => c.id === addModalCategory)?.blocks || []
  ).filter(block => !(block.type === "header" && hasHeaderBlock))

  // Get active social links
  const activeSocials = Object.entries(social_links || {}).filter(([_, url]) => url)

  return (
    <div className="space-y-6">
      {/* Profile Header with Real SVG Icons */}
      <div className="flex items-center gap-4 pb-5 border-b">
        <div className="relative group cursor-pointer" onClick={() => setShowAvatarEditModal(true)}>
          <Avatar className="h-14 w-14 border overflow-hidden">
            {onepage.avatar_video_url ? (
              <video
                src={onepage.avatar_video_url}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <AvatarImage src={avatar_url || undefined} />
                <AvatarFallback>{title?.charAt(0) || "?"}</AvatarFallback>
              </>
            )}
          </Avatar>
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
            className="text-left group flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          >
            <h2 className="font-semibold">{title || "Your Name"}</h2>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          {onepage.bio && (
            <button
              onClick={() => {
                setEditName(title || "")
                setEditBio(onepage.bio || "")
                setShowNameBioModal(true)
              }}
              className="text-left mt-0.5 group flex items-center gap-1.5 hover:opacity-70 transition-opacity"
            >
              <p className="text-sm text-muted-foreground line-clamp-2">{onepage.bio}</p>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-800 text-white flex items-center justify-center opacity-0 group-hover/social:opacity-100 transition-opacity hover:bg-gray-900"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
            <button
              onClick={() => setShowSocialModal(true)}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
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
          setShowAddModal(true)
        }}
        className="w-full h-11 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ease-out group"
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
        <Button variant="outline" size="sm" className="text-xs h-8">
          Add collection
        </Button>
        <Button
          variant={showArchiveView ? "default" : "outline"}
          size="sm"
          className="text-xs h-8"
          onClick={() => setShowArchiveView(!showArchiveView)}
        >
          <Archive className="h-3 w-3 mr-1" />
          {showArchiveView ? "Back to links" : "View archive"}
          {archivedBlocks.length > 0 && !showArchiveView && (
            <span className="ml-1.5 bg-gray-200 text-gray-600 text-[10px] px-1.5 rounded-full">{archivedBlocks.length}</span>
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
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, block.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                "transition-all duration-200",
                dragOverBlockId === block.id && block.type !== "header" && "border-t-2 border-violet-500"
              )}
            >
              <BlockItem
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
                onRemove={() => removeBlock(block.id)}
                onArchive={() => archiveBlock(block.id)}
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
                onOpenImageLibrary={(blockId) => { setImageBlockId(blockId); setShowImageLibrary(true) }}
                onOpenSocialModal={() => setShowSocialModal(true)}
                onOpenThumbnailModal={(blockId) => { setThumbnailBlockId(blockId); setShowThumbnailModal(true); setShowIconLibraryInModal(false) }}
                iconPaths={THUMBNAIL_ICON_PATHS}
                onUrlChangeWithAutoFetch={handleUrlChangeWithAutoFetch}
                onDragStart={(e) => handleDragStart(e, block.id)}
                isDragging={draggedBlockId === block.id}
              />
            </div>

            {index < sortedBlocks.length - 1 && (
              <div className="relative h-0 -mx-1 group/add-divider">
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterId(block.id)
                    setShowAddModal(true)
                  }}
                  className="absolute inset-x-0 -top-4 -bottom-4 flex items-center justify-center px-1 focus:outline-none"
                  tabIndex={0}
                  aria-label="Add block here"
                >
                  <span className="absolute inset-x-2 h-px bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:translate-y-[0.5px] group-focus-within/add-divider:translate-y-[0.5px]" />
                  <span className="absolute inset-x-3 h-px bg-gray-200 rounded-full opacity-0 transition-all duration-200 ease-out group-hover/add-divider:opacity-100 group-focus-within/add-divider:opacity-100 group-hover/add-divider:-translate-y-[0.5px] group-focus-within/add-divider:-translate-y-[0.5px]" />
                  <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 text-blue-600 shadow-sm transition-all duration-200 ease-out opacity-0 scale-90 group-hover/add-divider:opacity-100 group-hover/add-divider:shadow-lg group-hover/add-divider:scale-105 group-focus-within/add-divider:opacity-100 group-focus-within/add-divider:shadow-lg group-focus-within/add-divider:scale-105">
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

      {/* Add Block Modal - Wider on desktop */}
      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) { setSearchQuery(""); setInsertAfterId(null); } }}>
    <DialogContent className="w-[calc(100%-32px)] sm:w-[min(700px,calc(100vw-64px))] sm:!max-w-[700px] p-0 gap-0 overflow-hidden rounded-2xl mx-auto">


          <DialogHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b bg-white">
            <DialogTitle className="text-base sm:text-lg font-semibold">Add</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="p-3 sm:p-4 border-b bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Paste or search a link"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11 sm:h-12 bg-white border-2 border-gray-200 focus:border-gray-900 rounded-xl text-sm"
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

          {/* Content */}
          <div className="flex flex-col sm:flex-row max-h-[50vh] sm:max-h-[400px] overflow-hidden">
            {/* Categories sidebar */}
            {!searchQuery && (
              <div className="sm:w-44 border-b sm:border-b-0 sm:border-r bg-gray-50/50 overflow-x-auto sm:overflow-x-visible">
                <div className="flex sm:flex-col p-2 sm:p-3 gap-1 min-w-max sm:min-w-0">
                  {blockCategories.map((cat) => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setAddModalCategory(cat.id)}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap sm:w-full",
                          addModalCategory === cat.id
                            ? "bg-white shadow-sm text-foreground"
                            : "text-muted-foreground hover:bg-white/50"
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Blocks grid */}
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto">
              {/* Quick add cards - top row */}
              {!searchQuery && addModalCategory === "suggested" && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Collection", icon: Grid3X3, type: "link_button" as const },
                    { label: "Link", icon: Link, type: "link_button" as const },
                    { label: "Product", icon: ShoppingBag, type: "product" as const },
                    { label: "Form", icon: Mail, type: "email_capture" as const },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.label}
                        onClick={() => handleAddBlock(item.type)}
                        className="flex flex-col items-center gap-2 p-3 sm:p-4 border-2 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                        <span className="text-xs sm:text-sm font-medium">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Category title */}
              {!searchQuery && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {blockCategories.find(c => c.id === addModalCategory)?.label}
                </p>
              )}

              {/* Block list */}
              <div className="space-y-1.5">
                {activeCategoryBlocks.map((block, idx) => {
                  const Icon = block.icon
                  const socialId = block.label.toLowerCase().replace(/[^a-z]/g, "").replace("twitterx", "twitter")
                  const hasSocialIcon = ["instagram", "tiktok", "youtube", "twitter", "spotify"].includes(socialId)
                  const atLimit = isBlockTypeAtLimit(block.type)
                  const currentCount = getBlockTypeCount(block.type)

                  return (
                    <button
                      key={`${block.type}-${block.label}-${idx}`}
                      onClick={() => !atLimit && handleAddBlock(block.type, (block as any).preset)}
                      disabled={atLimit}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group",
                        atLimit
                          ? "opacity-50 cursor-not-allowed bg-gray-50"
                          : "hover:bg-gray-100"
                      )}
                    >
                      <div
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                        style={{
                          backgroundColor: hasSocialIcon
                            ? SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color + "20"
                            : "#f3f4f6"
                        }}
                      >
                        {hasSocialIcon ? (
                          <RenderSocialIcon
                            platform={socialId}
                            size={20}
                            color={SOCIAL_PLATFORMS.find(p => p.id === socialId)?.color}
                          />
                        ) : (
                          <Icon className="h-5 w-5 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{block.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {atLimit ? `Already added (${currentCount}/2)` : block.description}
                        </p>
                      </div>
                      {atLimit ? (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">Added</span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Social Links Modal - Modern Scrollable Vertical List */}
      <Dialog open={showSocialModal} onOpenChange={(open) => { setShowSocialModal(open); if (!open) { setSelectedSocial(null); setSocialUrl(""); setSearchQuery(""); setSocialUrlError(null); } }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[85vh] flex flex-col">
          <DialogHeader className="p-4 sm:p-5 border-b shrink-0">
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
                          setSocialUrl(e.target.value)
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

                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      {social_links?.[selectedSocial as keyof typeof social_links] && (
                        <Button
                          variant="outline"
                          className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 sm:w-auto w-full justify-center"
                          onClick={() => {
                            handleRemoveSocial(selectedSocial)
                            setSelectedSocial(null)
                            setSocialUrlError(null)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl w-full sm:w-auto"
                        onClick={() => setSelectedSocial(null)}
                      >
                        Back
                      </Button>
                      <Button
                        className="flex-1 bg-blue-500 hover:bg-blue-600 rounded-xl w-full sm:w-auto"
                        onClick={handleAddSocial}
                        disabled={!socialUrl}
                      >
                        {social_links?.[selectedSocial as keyof typeof social_links] ? "Update" : "Add"}
                      </Button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
            <DialogTitle className="text-base sm:text-lg font-semibold">Add Streaming Link</DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4">
            {(() => {
              const platformConfig: Record<string, { name: string; color: string; urlPattern: RegExp; placeholder: string }> = {
                apple_music: { name: 'Apple Music', color: '#FC3C44', urlPattern: /music\.apple\.com/i, placeholder: 'https://music.apple.com/...' },
                youtube_music: { name: 'YouTube Music', color: '#FF0000', urlPattern: /music\.youtube\.com/i, placeholder: 'https://music.youtube.com/...' },
                spotify: { name: 'Spotify', color: '#1DB954', urlPattern: /spotify\.com/i, placeholder: 'https://open.spotify.com/...' },
                soundcloud: { name: 'SoundCloud', color: '#FF5500', urlPattern: /soundcloud\.com/i, placeholder: 'https://soundcloud.com/...' },
                tidal: { name: 'TIDAL', color: '#000000', urlPattern: /tidal\.com/i, placeholder: 'https://tidal.com/...' },
                deezer: { name: 'Deezer', color: '#FEAA2D', urlPattern: /deezer\.com/i, placeholder: 'https://deezer.com/...' },
                amazon_music: { name: 'Amazon Music', color: '#25D1DA', urlPattern: /music\.amazon|amazon\.com\/music/i, placeholder: 'https://music.amazon.com/...' },
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
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: config?.color || '#6366F1' }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                        <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                      </svg>
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
        setShowThumbnailModal(open)
        if (!open) {
          setShowIconLibraryInModal(false)
          setIconSearchQuery("")
          setIconCategory("all")
        }
      }}>
        <DialogContent className={cn(
          "p-0 gap-0 overflow-hidden rounded-2xl mx-auto transition-all duration-200",
          showIconLibraryInModal
            ? "w-[calc(100%-32px)] sm:max-w-[440px] max-w-[500px]"
            : "w-[calc(100%-32px)] sm:max-w-[320px] max-w-[350px]"
        )}>
          {/* Main Options View */}
          {!showIconLibraryInModal && (
            <>
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-base font-semibold">Edit Thumbnail</DialogTitle>
              </DialogHeader>
              <div className="p-4 space-y-3">
                {/* Current thumbnail preview */}
                {getThumbnailBlockData() && (
                  <div className="flex items-center justify-center pb-3 border-b">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                      {getThumbnailBlockData()?.thumbnail_url ? (
                        <img src={getThumbnailBlockData()?.thumbnail_url || ''} alt="" className="w-full h-full object-cover" />
                      ) : getThumbnailBlockData()?.icon && THUMBNAIL_ICON_PATHS[getThumbnailBlockData()?.icon || ''] ? (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                          <path d={THUMBNAIL_ICON_PATHS[getThumbnailBlockData()?.icon || '']} />
                        </svg>
                      ) : (
                        <ImageIcon className="w-7 h-7 text-gray-400" />
                      )}
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

                {/* Icon library button */}
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

                {/* Remove thumbnail */}
                {(getThumbnailBlockData()?.thumbnail_url || getThumbnailBlockData()?.icon) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (thumbnailBlockId) {
                        updateBlock(thumbnailBlockId, {
                          data: {
                            ...onepage.draft_blocks.find(b => b.id === thumbnailBlockId)?.data,
                            thumbnail_url: null,
                            icon: null
                          }
                        })
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
                )}
              </div>
            </>
          )}

          {/* Icon Library Full Page View */}
          {showIconLibraryInModal && (
            <>
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

              {/* Layout with sidebar and icons */}
              <div className="flex h-[60vh] max-h-[500px]">
                {/* Categories sidebar */}
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

                {/* Icon grid */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
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
                              updateBlock(thumbnailBlockId, {
                                data: {
                                  ...onepage.draft_blocks.find(b => b.id === thumbnailBlockId)?.data,
                                  icon: icon.id,
                                  thumbnail_url: null
                                }
                              })
                            }
                            setShowThumbnailModal(false)
                            setShowIconLibraryInModal(false)
                            setIconSearchQuery("")
                            setIconCategory("all")
                          }}
                          className={cn(
                            "aspect-square rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:bg-gray-100 hover:shadow-sm p-2",
                            getThumbnailBlockData()?.icon === icon.id && "bg-gray-100 shadow-sm ring-2 ring-gray-900"
                          )}
                          title={icon.name}
                        >
                          <svg
                            width="24"
                            height="24"
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
                          <span className="text-[9px] text-gray-500 truncate w-full text-center">{icon.name}</span>
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

      {/* Image Library Modal */}
      <Dialog open={showImageLibrary} onOpenChange={setShowImageLibrary}>
        <DialogContent className="w-[calc(100%-32px)] max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 sm:p-5 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">Choose an Image</DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {IMAGE_LIBRARY.map((img) => (
                <button
                  key={img.id}
                  onClick={() => {
                    if (imageBlockId) {
                      updateBlock(imageBlockId, { data: { image_url: img.url } })
                    }
                    setShowImageLibrary(false)
                    setImageBlockId(null)
                  }}
                  className="aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-500 transition-all group"
                >
                  <img src={img.url} alt={img.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </button>
              ))}
            </div>
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
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-12 w-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-600">Select file to upload,</p>
              <p className="font-medium text-gray-600">or drag-and-drop file</p>
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
                      const delta = Math.max(dx, dy)
                      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                      // Constrain to not exceed image bounds
                      const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      setDragStartCrop({ x: e.clientX, y: e.clientY })
                    }
                  }}
                  onMouseUp={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
                  onMouseLeave={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
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
                      const delta = Math.max(dx, dy)
                      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                      const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                    }
                  }}
                  onTouchEnd={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
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

                    {/* Corner handles - larger for mobile touch */}
                    <div className="absolute -top-2 -left-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -bottom-2 -left-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div
                      className="absolute -bottom-2 -right-2 w-6 h-6 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize touch-none"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingCrop(true)
                        setDragStartCrop({ x: e.clientX, y: e.clientY })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingCrop(true)
                        setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                      }}
                    />
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag bottom-right corner to resize
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

      {/* Video Crop Modal - portrait ratio */}
      <Dialog open={showVideoCropModal} onOpenChange={(open) => {
        setShowVideoCropModal(open)
        if (!open && tempVideoUrl) {
          URL.revokeObjectURL(tempVideoUrl)
          setTempVideoUrl(null)
          setTempVideoFile(null)
          setVideoCropBox({ x: 10, y: 5, width: 60, height: 80 })
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowVideoCropModal(false); setShowVideoModal(true) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors"><ChevronLeft className="h-5 w-5" /></button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Video</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempVideoUrl && (
              <>
                {/* Video container - video fills container with object-cover */}
                <div
                  ref={videoContainerRef}
                  className="relative mx-auto bg-black rounded-xl select-none"
                  style={{ width: '300px', height: '400px', touchAction: 'none' }}
                >
                  <video
                    src={tempVideoUrl}
                    className="w-full h-full object-cover pointer-events-none rounded-xl"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      const video = e.target as HTMLVideoElement
                      setVideoNaturalSize({ width: video.videoWidth, height: video.videoHeight })
                    }}
                  />
                  {/* Dark overlay outside crop area */}
                  <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)' }} />

                  {/* Crop box - draggable (using percentages) */}
                  <div
                    className="absolute border-2 border-white border-dashed cursor-move"
                    style={{
                      left: `${videoCropBox.x}%`,
                      top: `${videoCropBox.y}%`,
                      width: `${videoCropBox.width}%`,
                      height: `${videoCropBox.height}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      background: 'transparent',
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
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('top-left')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingVideoCrop('top-left')
                        setVideoDragStart({ x: touch.clientX, y: touch.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-ne-resize z-50"
                      style={{ top: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('top-right')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingVideoCrop('top-right')
                        setVideoDragStart({ x: touch.clientX, y: touch.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute bg-white border-2 border-blue-500 rounded-full cursor-sw-resize z-50"
                      style={{ bottom: '-12px', left: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('bottom-left')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingVideoCrop('bottom-left')
                        setVideoDragStart({ x: touch.clientX, y: touch.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute bg-blue-500 border-2 border-blue-600 rounded-full cursor-se-resize z-50"
                      style={{ bottom: '-12px', right: '-12px', width: '24px', height: '24px', touchAction: 'none' }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('bottom-right')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingVideoCrop('bottom-right')
                        setVideoDragStart({ x: touch.clientX, y: touch.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
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
                          newY = Math.max(0, Math.min(100 - videoCropBox.height, newY))
                          setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
                        } else if (isResizingVideoCrop) {
                          let newBox = { ...videoCropBox }
                          const minSize = 20

                          if (isResizingVideoCrop.includes('right')) {
                            newBox.width = Math.max(minSize, Math.min(100 - videoDragStart.boxX, videoDragStart.boxW + deltaX))
                          }
                          if (isResizingVideoCrop.includes('bottom')) {
                            newBox.height = Math.max(minSize, Math.min(100 - videoDragStart.boxY, videoDragStart.boxH + deltaY))
                          }
                          if (isResizingVideoCrop.includes('left')) {
                            const newWidth = videoDragStart.boxW - deltaX
                            if (newWidth >= minSize && videoDragStart.boxX + deltaX >= 0) {
                              newBox.x = videoDragStart.boxX + deltaX
                              newBox.width = newWidth
                            }
                          }
                          if (isResizingVideoCrop.includes('top')) {
                            const newHeight = videoDragStart.boxH - deltaY
                            if (newHeight >= minSize && videoDragStart.boxY + deltaY >= 0) {
                              newBox.y = videoDragStart.boxY + deltaY
                              newBox.height = newHeight
                            }
                          }
                          setVideoCropBox(newBox)
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
                          newY = Math.max(0, Math.min(100 - videoCropBox.height, newY))
                          setVideoCropBox(prev => ({ ...prev, x: newX, y: newY }))
                        } else if (isResizingVideoCrop) {
                          let newBox = { ...videoCropBox }
                          const minSize = 20

                          if (isResizingVideoCrop.includes('right')) {
                            newBox.width = Math.max(minSize, Math.min(100 - videoDragStart.boxX, videoDragStart.boxW + deltaX))
                          }
                          if (isResizingVideoCrop.includes('bottom')) {
                            newBox.height = Math.max(minSize, Math.min(100 - videoDragStart.boxY, videoDragStart.boxH + deltaY))
                          }
                          if (isResizingVideoCrop.includes('left')) {
                            const newWidth = videoDragStart.boxW - deltaX
                            if (newWidth >= minSize && videoDragStart.boxX + deltaX >= 0) {
                              newBox.x = videoDragStart.boxX + deltaX
                              newBox.width = newWidth
                            }
                          }
                          if (isResizingVideoCrop.includes('top')) {
                            const newHeight = videoDragStart.boxH - deltaY
                            if (newHeight >= minSize && videoDragStart.boxY + deltaY >= 0) {
                              newBox.y = videoDragStart.boxY + deltaY
                              newBox.height = newHeight
                            }
                          }
                          setVideoCropBox(newBox)
                        }
                      }}
                      onTouchEnd={() => {
                        setIsDraggingVideoCrop(false)
                        setIsResizingVideoCrop(null)
                      }}
                    />
                  )}
                </div>

                <p className="text-xs text-center text-gray-500">Drag to move, use corners to resize</p>

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
                      // Save video URL with crop data
                      updateProfile({
                        avatar_video_url: publicUrl,
                        avatar_url: null,
                        avatar_video_crop: videoCropBox
                      })
                      setShowVideoCropModal(false)
                      if (tempVideoUrl) URL.revokeObjectURL(tempVideoUrl)
                      setTempVideoUrl(null)
                      setTempVideoFile(null)
                      setVideoCropBox({ x: 10, y: 5, width: 60, height: 80 })
                    } catch (error) {
                      console.error("Upload error:", error)
                      alert('Failed to upload video')
                    } finally {
                      setUploadingVideo(false)
                    }
                  }}
                  className="w-full bg-black hover:bg-gray-800 text-white h-12 rounded-xl"
                  disabled={uploadingVideo}
                >
                  {uploadingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                </Button>
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
  onOpenImageLibrary: (blockId: string) => void
  onOpenSocialModal: () => void
  onOpenThumbnailModal?: (blockId: string) => void
  iconPaths: Record<string, string>
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
  onDragStart?: (e: React.DragEvent) => void
  isDragging?: boolean
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
  onUrlChangeWithAutoFetch,
  onDragStart,
  isDragging,
}: BlockItemProps) {
  const { updateBlock, onepage } = useOnePage()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAnimationMenu, setShowAnimationMenu] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsData, setStatsData] = useState<{ total_clicks: number; total_views: number; chart_data: { date: string; clicks: number; views: number }[] } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsTimeframe, setStatsTimeframe] = useState<'7' | '14' | '30' | 'custom'>('7')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const animationMenuRef = useRef<HTMLDivElement>(null)

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
        fetchStats(parseInt(statsTimeframe))
      }
    }
  }, [statsTimeframe, customStartDate, customEndDate, showStatsModal])

  const getBlockPreview = () => {
    switch (block.type) {
      case "link_button": {
        const data = block.data as LinkButtonBlockData
        // Truncate URL for display - show just the domain/path without full URL
        const displayUrl = data.url ? (data.url.length > 40 ? data.url.slice(0, 40) + "..." : data.url) : "https://..."
        return { title: data.label || "My Link", subtitle: displayUrl, icon: Link, thumbnail_url: data.thumbnail_url, iconId: data.icon }
      }
      case "header":
        return { title: "Header", subtitle: "Profile section", icon: User }
      case "text": {
        const data = block.data as TextBlockData
        return { title: data.content?.slice(0, 30) || "Text block", subtitle: "Text", icon: Type }
      }
      case "image":
        return { title: "Image", subtitle: "Image block", icon: Image }
      case "divider":
        return { title: "Divider", subtitle: "Spacing", icon: Minus }
      case "email_capture": {
        const data = block.data as EmailCaptureBlockData
        return { title: data.headline || "Email Signup", subtitle: "Lead capture form", icon: Mail }
      }
      case "social_row":
        return { title: "Social Icons", subtitle: "Social links", icon: Share2 }
      default:
        return { title: block.type, subtitle: "", icon: Link }
    }
  }

  const preview = getBlockPreview()
  const Icon = preview.icon

  const isHeaderBlock = block.type === "header"
  const isLinkButton = block.type === "link_button"
  const hasThumbnail = (preview as any).thumbnail_url || ((preview as any).iconId && iconPaths[(preview as any).iconId])

  return (
    <div
      className={cn(
        "border rounded-xl bg-white transition-all",
        isSelected ? "ring-1 ring-gray-400 border-gray-300" : "hover:border-gray-300",
        !block.enabled && "opacity-50",
        isDragging && "opacity-50 scale-[0.98]"
      )}
    >
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
          <div className="cursor-grab text-gray-300 hover:text-gray-400 active:cursor-grabbing pointer-events-none">
            <GripVertical className="h-5 w-5" />
          </div>
        )}

        {/* Clickable thumbnail for link buttons */}
        {isLinkButton && onOpenThumbnailModal ? (
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
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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

        {/* Animation control for link buttons */}
        {isLinkButton && (
          <div className="relative" ref={animationMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowAnimationMenu(!showAnimationMenu)
              }}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                (block.data as LinkButtonBlockData).animation_type && (block.data as LinkButtonBlockData).animation_type !== 'none'
                  ? "text-violet-600 bg-violet-50 hover:bg-violet-100"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
              title="Animation"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {/* Animation dropdown menu */}
            {showAnimationMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                {[
                  { id: 'none', label: 'None' },
                  { id: 'pulse', label: 'Pulse' },
                  { id: 'bounce', label: 'Bounce' },
                  { id: 'shake', label: 'Shake' },
                  { id: 'glow', label: 'Glow' },
                  { id: 'swipe', label: 'Swipe' },
                ].map((anim) => {
                  const currentAnimation = (block.data as LinkButtonBlockData).animation_type || 'none'
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

        {/* Stats control for link buttons */}
        {isLinkButton && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowStatsModal(true)
                fetchStats(7)
              }}
              className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="View Stats"
            >
              <BarChart2 className="h-4 w-4" />
            </button>

            {/* Stats Modal */}
            <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
              <DialogContent className="w-[calc(100%-32px)] max-w-[420px] p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
                <DialogHeader className="p-4 border-b">
                  <DialogTitle className="text-base font-semibold">Link Stats</DialogTitle>
                </DialogHeader>

                <div className="p-4">
                  {/* Timeframe selector */}
                  <div className="flex gap-2 mb-4">
                    {[
                      { value: '7', label: '7 days' },
                      { value: '14', label: '14 days' },
                      { value: '30', label: '30 days' },
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
                          <div className="text-xs text-violet-600 font-medium">Clicks</div>
                        </div>
                      </div>

                      {/* Chart */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-xs font-medium text-gray-500 mb-3">Activity</div>
                        <div className="flex items-end gap-[3px] h-28">
                          {statsData.chart_data.map((day, i) => {
                            const maxValue = Math.max(...statsData.chart_data.map(d => Math.max(d.clicks, d.views || 0)), 1)
                            const viewHeight = ((day.views || 0) / maxValue) * 100
                            const clickHeight = (day.clicks / maxValue) * 100
                            return (
                              <div key={day.date} className="flex-1 flex gap-[2px] items-end group relative h-full">
                                {/* Views bar */}
                                <div className="flex-1 flex flex-col justify-end h-full">
                                  <div
                                    className="w-full bg-blue-400 rounded-t-sm transition-all group-hover:bg-blue-500"
                                    style={{ height: `${Math.max(viewHeight, 4)}%`, minHeight: '4px' }}
                                  />
                                </div>
                                {/* Clicks bar */}
                                <div className="flex-1 flex flex-col justify-end h-full">
                                  <div
                                    className="w-full bg-violet-400 rounded-t-sm transition-all group-hover:bg-violet-500"
                                    style={{ height: `${Math.max(clickHeight, 4)}%`, minHeight: '4px' }}
                                  />
                                </div>
                                {/* Tooltip */}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                                  <div className="font-medium">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                  <div className="flex gap-3 mt-0.5">
                                    <span className="text-blue-300">{day.views || 0} views</span>
                                    <span className="text-violet-300">{day.clicks} clicks</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex justify-between mt-3 pt-2 border-t border-gray-200">
                          <span className="text-[10px] text-muted-foreground">{statsTimeframe === 'custom' ? customStartDate : `${statsTimeframe}d ago`}</span>
                          <span className="text-[10px] text-muted-foreground">{statsTimeframe === 'custom' ? customEndDate : 'Today'}</span>
                        </div>
                        {/* Legend */}
                        <div className="flex items-center justify-center gap-6 mt-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-blue-400" />
                            <span className="text-xs text-gray-600">Views</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-violet-400" />
                            <span className="text-xs text-gray-600">Clicks</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>No data yet</p>
                      <p className="text-xs mt-1">Stats will appear once visitors interact with your link</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        <Toggle checked={block.enabled} onCheckedChange={onToggle} />
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
            onUrlChangeWithAutoFetch={onUrlChangeWithAutoFetch}
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

function BlockEditor({
  block,
  socialLinks,
  onOpenImageLibrary,
  onOpenSocialModal,
  onOpenThumbnailModal,
  iconPaths,
  onUrlChangeWithAutoFetch,
}: {
  block: OnePageBlock
  socialLinks: OnePageSocialLinks
  onOpenImageLibrary: (blockId: string) => void
  onOpenSocialModal: () => void
  onOpenThumbnailModal?: (blockId: string) => void
  iconPaths?: Record<string, string>
  onUrlChangeWithAutoFetch?: (blockId: string, url: string) => void
}) {
  const { updateBlock, updateSocialLinks } = useOnePage()

  // Thumbnail editing state
  const [showThumbnailPopup, setShowThumbnailPopup] = useState(false)
  const [showIconLibrary, setShowIconLibrary] = useState(false)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  // Drag state for social icons reordering
  const [draggedSocialId, setDraggedSocialId] = useState<string | null>(null)
  const [dragOverSocialId, setDragOverSocialId] = useState<string | null>(null)

  // Sync block platforms when socialLinks change
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
      
      if (hasNewPlatforms || hasRemovedPlatforms) {
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
  }, [socialLinks, block.type])

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
    { id: 'tiktok', name: 'TikTok', path: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5' },
    { id: 'spotify', name: 'Spotify', path: 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z' },
    { id: 'facebook', name: 'Facebook', path: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' },
    { id: 'linkedin', name: 'LinkedIn', path: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z' },
    { id: 'twitch', name: 'Twitch', path: 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7' },
    { id: 'discord', name: 'Discord', path: 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' },
    { id: 'telegram', name: 'Telegram', path: 'M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.303l3.2 1.067 1.493 4.8a1.5 1.5 0 0 0 2.368.671l2.441-1.953 4.195 3.209a2.25 2.25 0 0 0 3.541-1.332l3-15A2.25 2.25 0 0 0 21.198 2.433zM6.988 13.678l7.25-4.812-5.5 5.562-.75 3z' },
    { id: 'whatsapp', name: 'WhatsApp', path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z' },
    { id: 'pinterest', name: 'Pinterest', path: 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z' },
    { id: 'snapchat', name: 'Snapchat', path: 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301a.42.42 0 0 1 .19-.04c.15 0 .39.06.54.21.195.195.345.54.345.825 0 .39-.24.675-.51.855a2.58 2.58 0 0 1-1.32.45c-.225.015-.42.03-.614.045-.48.06-.48.255-.48.36 0 .09.015.165.045.255a7.35 7.35 0 0 0 2.115 3.195c.735.675 1.695 1.17 2.834 1.425.15.03.27.12.315.255.03.06.045.12.045.18 0 .285-.24.54-.765.69-.375.105-.825.165-1.305.195a.7.7 0 0 0-.165.015c-.09.015-.165.03-.27.045-.285.045-.54.09-.63.36-.045.105-.075.195-.105.285-.09.255-.195.555-.705.555-.09 0-.195-.015-.315-.03-.66-.09-1.365-.45-2.22-.45-.12 0-.24 0-.36.015-1.08.075-1.905.795-2.97 1.68-1.035.855-2.2 1.824-4.005 1.824-1.695 0-2.79-.9-3.78-1.71-1.095-.885-2.04-1.68-3.165-1.8a4.47 4.47 0 0 0-.315-.015c-.87 0-1.56.36-2.205.45a1.83 1.83 0 0 1-.33.03c-.495 0-.6-.285-.69-.54l-.12-.3c-.09-.27-.345-.315-.63-.36a1.49 1.49 0 0 0-.27-.045 1.21 1.21 0 0 0-.18-.015c-.48-.03-.93-.09-1.29-.195-.525-.15-.78-.405-.78-.69 0-.06.015-.12.045-.18.045-.135.165-.225.315-.255 1.14-.255 2.1-.75 2.835-1.425a7.35 7.35 0 0 0 2.115-3.195c.03-.09.045-.165.045-.255 0-.105 0-.3-.48-.36a10.31 10.31 0 0 1-.615-.045c-.495-.03-1.05-.15-1.32-.45-.27-.18-.51-.465-.51-.855 0-.285.15-.63.345-.825.15-.15.39-.21.54-.21.075 0 .135.015.19.04.39.195.735.285 1.035.3.195 0 .33-.045.405-.09-.015-.165-.022-.33-.03-.51l-.003-.06c-.105-1.628-.233-3.654.3-4.848C5.648 1.069 9.004.793 9.994.793h.005z' },
    { id: 'reddit', name: 'Reddit', path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm4.67-12.003c.35 0 .691.056 1.015.164a1.89 1.89 0 0 1 1.216 2.376c-.239.73-.908 1.203-1.667 1.203-.76 0-1.428-.473-1.667-1.203a1.89 1.89 0 0 1 1.103-2.54zM8.33 9.997c.35 0 .691.056 1.015.164a1.89 1.89 0 0 1 1.216 2.376c-.239.73-.908 1.203-1.667 1.203-.76 0-1.428-.473-1.667-1.203a1.89 1.89 0 0 1 1.103-2.54zM12 18c-2.21 0-4-1.343-4-3h8c0 1.657-1.79 3-4 3z' },
    { id: 'threads', name: 'Threads', path: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.332-3.023.88-.73 2.107-1.168 3.662-1.31.883-.08 1.807-.07 2.755.03-.073-.485-.192-.923-.353-1.313-.346-.836-.855-1.456-1.513-1.844-.715-.422-1.63-.624-2.724-.602-.937.019-1.794.238-2.55.65-.69.377-1.272.922-1.73 1.62l-1.686-1.094c.61-.938 1.392-1.672 2.32-2.177.994-.54 2.137-.823 3.399-.84h.212c1.398.017 2.604.282 3.584.787.986.507 1.763 1.258 2.31 2.233.39.696.642 1.49.755 2.373 1.01.324 1.912.816 2.679 1.472 1.052.898 1.797 2.07 2.218 3.487.384 1.29.43 2.817-.28 4.394-.72 1.6-1.995 2.925-3.791 3.942-1.73.98-3.795 1.49-6.144 1.518zm-.293-7.232c-.87.046-1.542.291-1.942.712-.38.399-.57.862-.54 1.338.032.49.275.9.698 1.173.466.302 1.135.453 1.989.41 1.08-.059 1.896-.44 2.426-1.131.466-.609.77-1.455.907-2.526a15.7 15.7 0 0 0-3.538.024z' },
    { id: 'github', name: 'GitHub', path: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z' },
    { id: 'soundcloud', name: 'SoundCloud', path: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.102-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.045-.09-.09-.09m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.059-.104-.12-.104' },
    { id: 'apple-music', name: 'Apple Music', path: 'M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.62.497 2.373.55 1.205 1.47 2.082 2.72 2.594.454.186.93.3 1.415.38.37.06.74.1 1.113.12.2.01.397.02.596.027h12.268c.15-.01.3-.018.45-.028.94-.06 1.86-.19 2.72-.58 1.1-.5 1.92-1.3 2.45-2.4.23-.48.38-1 .46-1.53.08-.47.13-.95.15-1.43.01-.12.01-.25.01-.37V6.18l-.04.04z M12 18.75c-4.694 0-8.5-3.806-8.5-8.5s3.806-8.5 8.5-8.5 8.5 3.806 8.5 8.5-3.806 8.5-8.5 8.5zM10 6v8l6-4z' },
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
  const supportsLayout = ["link_button", "image"].includes(block.type)

  // Get current layout type from block data
  const currentLayoutType = (block.data as any).layout_type || 'default'

  // Helper to render the Layout tab content
  const renderLayoutContent = () => {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Choose how this block displays on your page</p>

        {/* Default Layout Option */}
        <button
          type="button"
          onClick={() => updateData({ layout_type: 'default' })}
          className={cn(
            "w-full p-3 rounded-xl border-2 text-left transition-all",
            currentLayoutType === 'default'
              ? "border-violet-500 bg-violet-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
              currentLayoutType === 'default' ? "border-violet-500" : "border-gray-300"
            )}>
              {currentLayoutType === 'default' && (
                <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Default</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Standard display for your link
              </p>
            </div>
          </div>
        </button>

        {/* Pro Layout Option */}
        <button
          type="button"
          onClick={() => updateData({ layout_type: 'pro' })}
          className={cn(
            "w-full p-3 rounded-xl border-2 text-left transition-all",
            currentLayoutType === 'pro'
              ? "border-violet-500 bg-violet-50"
              : "border-gray-200 hover:border-gray-300 bg-white"
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
              currentLayoutType === 'pro' ? "border-violet-500" : "border-gray-300"
            )}>
              {currentLayoutType === 'pro' && (
                <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm">Pro Layout</span>
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {block.type === "link_button"
                  ? "Make your link stand out with a larger, more attractive display featuring your thumbnail prominently"
                  : "Make your content stand out with enhanced display and interactions"}
              </p>
              {/* Preview mockup */}
              <div className="mt-2.5 p-2 bg-gray-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-16 bg-gray-300 rounded" />
                    <div className="h-1.5 w-10 bg-gray-200 rounded mt-1.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* Display Mode Options - Only shown when Pro Layout is selected and NOT YouTube */}
        {currentLayoutType === 'pro' && block.type === 'link_button' && !isYouTubeUrl((block.data as LinkButtonBlockData).url) && (
          <div className="pt-3 mt-3 border-t space-y-2">
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
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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

            {/* YouTube Settings - Only shown for YouTube URLs */}
            {isYouTubeUrl(data.url) && (
              <div className="space-y-3 pt-3 mt-3 border-t">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">YouTube Settings</Label>
                <div className="space-y-2">
                  {[
                    { id: 'embed_video', label: 'Play video on page', desc: 'Embed video directly in Pro Layout' },
                    { id: 'open_video', label: 'Open YouTube video', desc: 'Show thumbnail, redirect on click' },
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
                              // Both modes use Pro Layout for YouTube
                              updateData({
                                youtube_mode: mode.id as YouTubeMode,
                                layout_type: 'pro'
                              })
                              // For open_video mode, fetch thumbnail
                              if (mode.id === 'open_video') {
                                // Extract video ID and set thumbnail
                                const videoIdMatch = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
                                if (videoIdMatch) {
                                  updateData({
                                    youtube_mode: mode.id as YouTubeMode,
                                    layout_type: 'pro',
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
                              // For streaming mode, fetch available services
                              if (mode.id === 'show_streaming' && !data.streaming_services) {
                                try {
                                  const res = await fetch(`/api/onepage/spotify?url=${encodeURIComponent(data.url)}`)
                                  if (res.ok) {
                                    const spotifyData = await res.json()
                                    updateData({
                                      spotify_mode: mode.id as SpotifyMode,
                                      spotify_artist_id: spotifyData.id || null,
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
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.023.552 20.4.375 19.737.235c-.625-.13-1.256-.16-1.893-.165H6.167c-.55.01-1.1.025-1.64.08-.89.09-1.74.27-2.48.78-.55.38-.96.86-1.27 1.43C.38 3.13.13 4.08.03 5.04c-.07.65-.09 1.31-.09 1.96v10.03c.01.56.03 1.12.08 1.68.09.9.27 1.74.78 2.48.38.55.86.96 1.43 1.27.8.4 1.67.58 2.58.66.65.05 1.31.07 1.96.07h11.17c.72-.01 1.44-.03 2.15-.12.9-.1 1.77-.31 2.54-.8.52-.34.95-.76 1.29-1.27.51-.78.7-1.63.79-2.52.05-.55.07-1.1.08-1.65V6.37c0-.082 0-.165-.003-.246zM17.29 17.965c0 .56-.25 1.01-.75 1.27-.26.14-.54.21-.83.21-.18 0-.36-.02-.54-.08-.64-.2-1.25-.49-1.89-.69-.57-.17-1.15-.26-1.75-.23-.61.04-1.2.14-1.75.41-.36.18-.7.39-1.04.62-.38.26-.77.53-1.23.65-.2.05-.4.08-.6.08-.5 0-.95-.18-1.27-.58-.27-.33-.4-.72-.4-1.15v-7.6c0-.6.22-1.11.66-1.52.29-.27.63-.46 1-.58.5-.17 1.01-.24 1.53-.26.76-.03 1.5.07 2.21.37.48.2.92.47 1.32.83.42.37.68.84.68 1.43 0 .24-.06.46-.21.65-.19.25-.44.35-.75.35-.27 0-.5-.09-.69-.3-.22-.24-.48-.42-.77-.56-.42-.2-.87-.3-1.34-.28-.38.02-.75.11-1.08.3-.3.17-.48.44-.48.78v6.38c.03.39.27.65.64.76.16.05.33.06.5.04.31-.03.6-.14.86-.3.34-.2.68-.4 1-.62.5-.35 1.03-.62 1.62-.76.5-.12 1-.16 1.51-.1.78.08 1.53.33 2.2.78.43.29.69.71.69 1.26z"/></svg>
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
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.102-.1zm2.855-1.058c-.068 0-.12.054-.12.118l-.147 3.193.147 3.077c0 .064.054.118.12.118s.12-.054.12-.118l.166-3.077-.166-3.193c0-.064-.054-.118-.12-.118zm1.86-.507c-.076 0-.14.064-.14.136l-.12 3.7.12 3.04c0 .072.064.136.14.136s.14-.064.14-.136l.134-3.04-.134-3.7c0-.072-.064-.136-.14-.136zm1.86.238c-.083 0-.154.07-.154.152l-.107 3.462.107 2.969c0 .082.07.152.154.152.083 0 .154-.07.154-.152l.12-2.969-.12-3.462c0-.082-.07-.152-.154-.152zm1.857-.445c-.094 0-.17.076-.17.168l-.093 3.907.093 2.896c0 .092.076.168.17.168s.168-.076.168-.168l.107-2.896-.107-3.907c0-.092-.074-.168-.168-.168zm1.858-.147c-.1 0-.183.082-.183.182l-.08 4.054.08 2.808c0 .1.082.182.183.182.1 0 .182-.082.182-.182l.092-2.808-.092-4.054c0-.1-.082-.182-.182-.182zm3.817.534c-.166 0-.3.134-.3.3v6.586c0 .166.134.3.3.3h7.893c2.344 0 4.244-1.9 4.244-4.244s-1.9-4.243-4.244-4.243c-.586 0-1.146.119-1.654.334-.34-3.837-3.543-6.847-7.436-6.847-1.008 0-1.98.2-2.862.564-.337.139-.425.28-.425.558v10.678c.004.2.12.37.3.399.012.002 5.926.002 5.926.002"/></svg>
                        },
                        tidal: {
                          name: 'TIDAL',
                          color: 'bg-black',
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004 4.004-4.004 4.004 4.004-4.004 4.004 4.004 4.004 4.004-4.004-4.004-4.004 4.004-4.004 4.004 4.004 4.004-4.004L24 3.992l-4.004 4.004-3.988-4.004z"/></svg>
                        },
                        deezer: {
                          name: 'Deezer',
                          color: 'bg-black',
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><rect x="0" y="16.032" width="3.6" height="1.536" rx="0.192"/><rect x="4.08" y="16.032" width="3.6" height="1.536" rx="0.192" fill="#FEAA2D"/><rect x="4.08" y="14.208" width="3.6" height="1.536" rx="0.192" fill="#FEAA2D"/><rect x="4.08" y="12.384" width="3.6" height="1.536" rx="0.192" fill="#FEAA2D"/><rect x="8.16" y="16.032" width="3.6" height="1.536" rx="0.192" fill="#FE3E62"/><rect x="8.16" y="14.208" width="3.6" height="1.536" rx="0.192" fill="#FE3E62"/><rect x="12.24" y="16.032" width="3.6" height="1.536" rx="0.192" fill="#D400A0"/><rect x="12.24" y="14.208" width="3.6" height="1.536" rx="0.192" fill="#D400A0"/><rect x="12.24" y="12.384" width="3.6" height="1.536" rx="0.192" fill="#D400A0"/><rect x="12.24" y="10.56" width="3.6" height="1.536" rx="0.192" fill="#D400A0"/><rect x="16.32" y="16.032" width="3.6" height="1.536" rx="0.192" fill="#7B00C9"/><rect x="16.32" y="14.208" width="3.6" height="1.536" rx="0.192" fill="#7B00C9"/><rect x="16.32" y="12.384" width="3.6" height="1.536" rx="0.192" fill="#7B00C9"/><rect x="20.4" y="16.032" width="3.6" height="1.536" rx="0.192" fill="#12BEF1"/><rect x="20.4" y="14.208" width="3.6" height="1.536" rx="0.192" fill="#12BEF1"/><rect x="20.4" y="12.384" width="3.6" height="1.536" rx="0.192" fill="#12BEF1"/><rect x="20.4" y="10.56" width="3.6" height="1.536" rx="0.192" fill="#12BEF1"/><rect x="20.4" y="8.736" width="3.6" height="1.536" rx="0.192" fill="#12BEF1"/></svg>
                        },
                        amazon_music: {
                          name: 'Amazon Music',
                          color: 'bg-gradient-to-br from-[#25D1DA] to-[#1A98FF]',
                          icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M17.963 13.346c-.236-.083-.49-.042-.745.082-.51.248-1.04.414-1.61.497-1.287.186-2.503-.02-3.677-.532-.266-.117-.511-.272-.786-.363-.335-.111-.546.16-.453.5.046.167.146.31.262.433.616.643 1.38 1.053 2.227 1.322 1.35.43 2.72.472 4.09.103.355-.095.695-.24 1.006-.437.204-.13.354-.297.404-.547.054-.273-.113-.476-.358-.56-.102-.035-.212-.047-.36.002zm1.58-2.152c-.143-.12-.318-.096-.49-.027-.628.254-1.274.45-1.95.548-1.135.165-2.255.089-3.35-.242a7.092 7.092 0 01-1.804-.838c-.203-.13-.407-.263-.626-.362-.366-.165-.633.05-.586.454.024.21.128.38.273.524.72.716 1.574 1.208 2.545 1.51 1.41.438 2.836.468 4.27.105.41-.104.808-.25 1.186-.44.21-.106.388-.253.492-.478.127-.275.007-.526-.234-.62-.075-.03-.193-.06-.274-.134zm2.226-1.768c-.123-.165-.305-.184-.494-.118-.732.257-1.48.456-2.262.538-1.42.15-2.82.017-4.17-.452a8.932 8.932 0 01-2.487-1.303c-.2-.148-.4-.303-.616-.422-.408-.225-.7.008-.665.498.017.24.121.44.274.612.847.952 1.893 1.62 3.1 2.053 1.72.618 3.472.69 5.24.245.486-.122.957-.285 1.41-.498.226-.107.43-.246.574-.453.17-.244.146-.51-.096-.7h.192zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/></svg>
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
                          {!service.found && (
                            <button
                              type="button"
                              onClick={() => {
                                setStreamingPlatform(service.platform)
                                setStreamingPlatformIndex(index)
                                setStreamingUrl("")
                                setStreamingUrlError(null)
                                setStreamingBlockData(data)
                                setStreamingBlockUpdateFn(() => updateData)
                                setShowStreamingUrlModal(true)
                              }}
                              className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
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
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Headline</Label>
              <Input value={data.headline} onChange={(e) => updateData({ headline: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={data.description || ""} onChange={(e) => updateData({ description: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Button Text</Label>
              <Input value={data.button_text} onChange={(e) => updateData({ button_text: e.target.value })} className="h-9" />
            </div>
          </div>
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
          </div>
        )
      }

      case "divider": {
        const data = block.data as DividerBlockData
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Style</Label>
              <div className="flex gap-2">
                {(["space", "line", "dots"] as const).map((style) => (
                  <Button
                    key={style}
                    variant={data.style === style ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateData({ style })}
                    className="capitalize h-8 flex-1"
                  >
                    {style}
                  </Button>
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
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Image URL</Label>
              <Input value={data.image_url} onChange={(e) => updateData({ image_url: e.target.value })} className="h-9" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenImageLibrary(block.id)}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Choose from Library
            </Button>
            <div className="space-y-1.5">
              <Label className="text-xs">Link URL (optional)</Label>
              <Input value={data.link_url || ""} onChange={(e) => updateData({ link_url: e.target.value || null })} className="h-9" />
            </div>
          </div>
        )
      }

      default:
        return <p className="text-xs text-muted-foreground">No settings available</p>
    }
  }

  // If block supports layout, render with tabs; otherwise just render settings
  if (supportsLayout) {
    return (
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full mb-3 bg-gray-100/80 p-0.5 h-9">
          <TabsTrigger value="settings" className="flex-1 text-xs h-8 gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 text-xs h-8 gap-1.5">
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
