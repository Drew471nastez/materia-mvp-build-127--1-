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
  type ProductBlockData,
  type ProductBlockStyle,
  type ProductButtonStyle,
  type EmailCaptureButtonPreset,
  type EmailCaptureLayoutType,
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
import { Plus, GripVertical, Trash2, ChevronUp, ChevronDown, Link, Type, ImageIcon, Minus, Mail, User, Globe, Heart, Video, MessageSquare, Share2, ChevronRight, ChevronLeft, Search, X, ShoppingBag, Grid3X3, FileText, Pencil, Upload, Loader2, ZoomIn, ZoomOut, Archive, RotateCcw, Settings, LayoutGrid, Sparkles, AlertCircle, BarChart2, Play, Layers, ArrowUpRight, Palette, Check, Download } from "lucide-react"
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
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  whatsapp: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  ),
  pinterest: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
    </svg>
  ),
  soundcloud: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="-143 145 512 512" fill={color}>
      <path d="M113,145c-141.4,0-256,114.6-256,256s114.6,256,256,256s256-114.6,256-256S254.4,145,113,145z M-11.1,432.9 c-0.1,0.6-0.5,1-1,1s-1-0.4-1-1l-1.9-14l1.9-14.2c0.1-0.6,0.5-1,1-1s0.9,0.4,1,1l2.2,14.2L-11.1,432.9z M-1.6,441.4 c-0.1,0.6-0.5,1-1.1,1c-0.5,0-1-0.4-1.1-1l-2.5-22.5l2.5-23c0.1-0.6,0.5-1,1.1-1c0.5,0,1,0.4,1.1,1l2.9,23L-1.6,441.4z M8.7,445.3 c-0.1,0.7-0.6,1.2-1.3,1.2c-0.7,0-1.2-0.5-1.3-1.3l-2.4-26.3l2.4-27.3c0.1-0.7,0.6-1.3,1.3-1.3c0.7,0,1.2,0.5,1.3,1.3l2.7,27.3 L8.7,445.3z M19.1,446.1c-0.1,0.8-0.7,1.5-1.5,1.5c-0.8,0-1.4-0.6-1.5-1.5L13.8,419l2.3-28c0.1-0.9,0.7-1.5,1.5-1.5 c0.8,0,1.4,0.6,1.5,1.5l2.6,28L19.1,446.1z M29.5,446.3c-0.1,1-0.8,1.7-1.7,1.7c-0.9,0-1.7-0.7-1.7-1.7L24,419l2.1-26 c0.1-1,0.8-1.7,1.7-1.7c0.9,0,1.6,0.7,1.7,1.7l2.4,26L29.5,446.3z M40,446.3c-0.1,1.1-0.9,1.9-1.9,1.9s-1.9-0.8-1.9-1.9l-2-27.3 l2-42.3c0.1-1.1,0.9-1.9,1.9-1.9s1.9,0.8,1.9,1.9l2.3,42.3L40,446.3z M50.6,446.2c-0.1,1.2-1,2.1-2.2,2.1s-2.1-0.9-2.2-2.1L44.3,419 l1.9-52c0.1-1.2,1-2.1,2.2-2.1s2.1,0.9,2.2,2.1l2.1,52L50.6,446.2z M61.3,445.9c-0.1,1.3-1.1,2.3-2.4,2.3s-2.3-1-2.4-2.3L54.7,419 l1.8-56.3c0-1.3,1.1-2.4,2.4-2.4s2.3,1,2.4,2.4l2,56.3L61.3,445.9z M72.1,445.7c-0.1,1.4-1.2,2.6-2.6,2.6c-1.4,0-2.5-1.1-2.6-2.6 L65.3,419l1.6-58.2c0-1.4,1.2-2.6,2.6-2.6s2.5,1.1,2.6,2.6l1.8,58.2L72.1,445.7z M82.9,445.5c0,1.5-1.3,2.8-2.8,2.8 s-2.8-1.2-2.8-2.8L75.8,419l1.5-56.7c0-1.6,1.3-2.8,2.8-2.8s2.8,1.2,2.8,2.8l1.7,56.7L82.9,445.5z M93.9,445.3c0,1.7-1.4,3-3,3 c-1.7,0-3-1.3-3-3L86.5,419l1.4-54.7c0-1.7,1.4-3,3-3c1.7,0,3,1.3,3,3l1.5,54.7L93.9,445.3z M104.9,445.1c0,1.8-1.5,3.2-3.2,3.2 c-1.8,0-3.2-1.5-3.2-3.2L97.3,419l1.2-65c0-1.8,1.5-3.2,3.2-3.2c1.8,0,3.2,1.4,3.2,3.2l1.4,65L104.9,445.1z M115.9,444.8 c0,1.9-1.6,3.4-3.5,3.4c-1.9,0-3.4-1.6-3.5-3.4l-1.4-25.7l1.4-70.9c0-1.9,1.6-3.5,3.5-3.5c1.9,0,3.4,1.6,3.5,3.5l1.5,70.9 L115.9,444.8z M209.5,448.4c-0.6,0-87.2,0-87.3,0c-1.9-0.2-3.4-1.8-3.4-3.7v-99.9c0-1.8,0.7-2.8,3-3.7c6.1-2.4,13-3.8,20.1-3.8 c29,0,52.8,22.3,55.3,50.6c3.7-1.6,7.9-2.4,12.2-2.4c17.4,0,31.5,14.1,31.5,3... <truncated>
    </svg>
  ),
  applemusic: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" fill="none">
      <defs>
        <linearGradient id="apple-music-gradient" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
          <stop offset="0" stopColor="#FA233B"/>
          <stop offset="1" stopColor="#FB5C74"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="15%" fill="url(#apple-music-gradient)"/>
      <path fill="#ffffff" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
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
]

// Default background images library
const IMAGE_LIBRARY = [
  { id: "gradient1", url: "https://images.unsplash.com/photo-1557682164-014284673080?w=800&q=80", label: "Purple Gradient" },
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
      { type: "link_button" as const, label: "YouTube", description: "Link to YouTube", icon: Video, preset: { label: "Subscribe on YouTube", url: "https://youtube.com/@" } },
      { type: "link_button" as const, label: "X (Twitter)", description: "Link to X", icon: Share2, preset: { label: "Follow on X", url: "https://x.com/" } },
      { type: "link_button" as const, label: "Instagram", description: "Link to Instagram", icon: Share2, preset: { label: "Follow on Instagram", url: "https://instagram.com/" } },
    ],
  },
  {
    id: "products",
    label: "Products",
    icon: ShoppingBag,
    blocks: [
      { type: "product" as const, label: "Digital Product", description: "Sell a digital product", icon: ShoppingBag },
      { type: "link_button" as const, label: "Store Link", description: "Link to your store", icon: ShoppingBag, preset: { label: "Shop Now", url: "" } },
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
      { type: "link_button" as const, label: "Threads", description: "Link to Threads", icon: Share2, preset: { label: "Follow on Threads", url: "https://threads.net/@" } },
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
      { type: "link_button" as const, label: "PDF", description: "Link to a PDF file", icon: FileText, preset: { label: "View Document", url: "" } },
      { type: "link_button" as const, label: "Google Docs", description: "Link to Google Docs", icon: FileText, preset: { label: "View Document", url: "https://docs.google.com/" } },
      { type: "link_button" as const, label: "Notion", description: "Link to Notion page", icon: FileText, preset: { label: "View Page", url: "https://notion.so/" } },
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
      { type: "link_button" as const, label: "Contact Form", description: "Link to form", icon: FileText, preset: { label: "Contact Me", url: "" } },
      { type: "link_button" as const, label: "WhatsApp", description: "Link to WhatsApp", icon: MessageSquare, preset: { label: "Message on WhatsApp", url: "https://wa.me/" } },
      { type: "link_button" as const, label: "Telegram", description: "Link to Telegram", icon: MessageSquare, preset: { label: "Message on Telegram", url: "https://t.me/" } },
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
    case "product": {
      const data = block.data as ProductBlockData
      return { title: data.product_title || "Digital Product", subtitle: data.product_price_cents ? `$${(data.product_price_cents / 100).toFixed(2)}` : "Select product", icon: ShoppingBag, thumbnail_url: data.custom_thumbnail || data.product_thumbnail }
    }
    case "group": {
      const data = block.data as GroupBlockData
      const childCount = data.children?.length || 0
      return { title: data.title || "Group", subtitle: `${childCount} item${childCount !== 1 ? 's' : ''} · ${data.layout}`, icon: Layers }
    }
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

  // Email editor modal state
  const [showEmailEditor, setShowEmailEditor] = useState(false)
  const [emailEditorBlockId, setEmailEditorBlockId] = useState<string | null>(null)

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
    'share': 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4',
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
    'watch': 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 9v3l1.5 1.5M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83',
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
    'pizza': 'M12 2L2 19.5h20L12 2zM12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
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
    'key': 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.777 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
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
    'command': 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
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
                      },
                      {
                        name: 'Telegram',
                        color: 'bg-[#0088CC]',
                        icon: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                      }
                      // ... other platforms ...
                    }
                    return (
                      <div key={service.platform} className="flex items-center gap-2 p-3 rounded-lg border bg-white">
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", config.color)}>
                          {config.icon}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{config.name}</div>
                          <div className={cn("text-xs", service.found ? "text-green-600" : "text-gray-400")}>
                            {service.found ? "Visible" : "Not found"}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
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
              className="w-full bg-transparent"
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
                    <span className="text-xs text-gray-600">{label}</span>
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
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Image URL</Label>
              <Input value={data.image_url} onChange={(e) => updateData({ image_url: e.target.value })} className="h-9" />
            </div>
            <Button
              variant="outline"
              className="w-full bg-transparent"
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
                        src={selectedProduct.thumbnail_url || "/placeholder.svg"}
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
                  <svg className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", showProductDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              src={product.thumbnail_url || "/placeholder.svg"}
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
      const ctaOptions = ["Get My Guide", "Get it Now", "Buy Now", "Download", "Get Access", "Start Learning", "Enroll Now", "Custom"]
      const blockBackgroundColorPresets = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#1a1a1a']
      const textColorPresets = ['#ffffff', '#000000', '#1a1a1a', '#f5f5f5', '#374151', '#6b7280']
      const buttonColorPresets = ['#ffffff', '#1a1a1a', '#3b82f6', '#10b981', '#ef4444', '#10b981']
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
                onClick={(e) => { e.stopPropagation(); onOpenThumbnailModal && onOpenThumbnailModal(block.id) }}
                className="group relative w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-gray-50 hover:bg-gray-100"
              >
                {data.custom_thumbnail ? (
                  <img
                    src={data.custom_thumbnail || "/placeholder.svg"}
                    alt="Custom thumbnail"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : data.product_thumbnail ? (
                  <img
                    src={data.product_thumbnail || "/placeholder.svg"}
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
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCtaDropdown(!showCtaDropdown)
                }}
                className={cn(
                  "w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                  showCtaDropdown && "ring-2 ring-violet-500 border-violet-500"
                )}
              >
                <span className="truncate">{ctaOptions.slice(0, -1).includes(data.cta_text || "") ? data.cta_text : "Custom"}</span>
                <svg className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", showCtaDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCtaDropdown && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[200px] overflow-y-auto">
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
                      updateData({ cta_text: "" }) // Clear text when selecting custom
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
              className="h-9 rounded-xl"
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
                  <div className="relative">
                    <input
                      type="color"
                      value={data.block_background_color || "#7c3aed"}
                      onChange={(e) => updateData({ block_background_color: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div
                      className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
                      style={{ backgroundColor: data.block_background_color || "#7c3aed" }}
                    />
                  </div>
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
                  <div className="relative">
                    <input
                      type="color"
                      value={data.text_color || "#ffffff"}
                      onChange={(e) => updateData({ text_color: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div
                      className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
                      style={{ backgroundColor: data.text_color || "#ffffff" }}
                    />
                  </div>
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
                    <div className="relative">
                      <input
                        type="color"
                        value={data.button_color || "#ffffff"}
                        onChange={(e) => updateData({ button_color: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
                        style={{ backgroundColor: data.button_color || "#ffffff" }}
                      />
                    </div>
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
                    <div className="relative">
                      <input
                        type="color"
                        value={data.button_text_color || "#1a1a1a"}
                        onChange={(e) => updateData({ button_text_color: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
                        style={{ backgroundColor: data.button_text_color || "#1a1a1a" }}
                      />
                    </div>
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
                const isActive = currentDisplayMode === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateData({ display_mode: mode.id })}
                    className={cn(
                      "p-2.5 rounded-lg border-2 text-center transition-all",
                      isActive
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className="text-[10px] text-muted-foreground">{mode.desc}</div>
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
                onClick={(e) => { e.stopPropagation(); onOpenThumbnailModal && onOpenThumbnailModal(block.id) }}
                className="group relative w-11 h-11 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 flex items-center justify-center overflow-hidden transition-all bg-gray-50 hover:bg-gray-100"
              >
                {data.thumbnail_url ? (
                  <img
                    src={data.thumbnail_url || "/placeholder.svg"}
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
                              <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/>
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
                          icon: <svg viewBox="0 0 512 512" className="w-4 h-4"><rect width="512" height="512" rx="15%" fill="#f50"/><path d="m59 270-3 22 3 22c0 2 3 2 3 0l3-22-3-22c0-3-3-3-3 0zm18-14c0-3-3-3-3 0l-5 36 4 35c0 3 4 3 4 0l4-35zm59-30-3 66 2 40c0 8 7 8 7 0l4-40-4-66c0-5-6-5-6 0zm-31 22-4 44 3 40c0 6 5 6 5 0l4-40-4-44c0-3-4-3-4 0zm70 84 3-40-3-88c0-6-7-6-7 0l-3 88 2 40c0 8 8 8 8 0zm68 0 2-40-2-102c0-7-10-7-10 0l-2 102 2 40c0 8 10 8 10 0zm-34 0 3-40-3-89c0-6-9-6-9 0l-2 89 2 40c0 8 8 8 8 0zm-33 0 4-40-4-43c0-3-4-3-4 0l-4 43 4 40c0 7 6 7 6 0zm124-125-2 85 1 40c0 8 10 8 10 0l2-40-2-85c0-7-9-7-9 0zm-58 125 3-40-3-81c0-6-7-6-7 0l-3 81 2 40c0 8 8 8 8 0zm33 0 3-40-3-91c0-6-8-6-8 0l-3 91 3 40c0 8 8 8 8 0zm196-89c-5-57-64-94-118-73-4 2-5 3-5 6v156c0 3 2 6 5 6h137c27 0 49-22 49-49 0-37-35-57-68-46zm-138-62-3 111 3 40c0 8 10 8 10 0l3-40-3-111c0-7-10-7-10 0z" fill="#ffffff"/></svg>
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
                      }
                      // ... other platforms ...
                    }
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
              )
            }
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
  isDragging?: boolean
  isDropTarget?: boolean
  draggedBlockType?: OnePageBlockType | null
  onMoveChildToMainList?: (childBlock: OnePageBlock, groupId: string) => void
  onOpenAddBlockModal?: (groupId: string) => void
  onOpenEmailEditor?: (blockId: string) => void
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
  isDragging,
  isDropTarget,
  draggedBlockType,
  onMoveChildToMainList,
  onOpenAddBlockModal,
  onOpenEmailEditor,
}: BlockItemProps) {
  const { updateBlock: contextUpdateBlock, onepage } = useOnePage()
  const updateBlock = updateBlockOverride || contextUpdateBlock
  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    updateBlock(block.id, { data: { ...block.data, ...updates } })
  }

  // Theme settings for blocks
  const themeSettings = onepage?.theme as any || {}
  const headerLayout = themeSettings?.header_layout || "classic"
  const themeButtonColor = themeSettings?.button_color || '#6366F1'
  const themeButtonTextColor = themeSettings?.button_text_color || '#ffffff'
  const themeLinkColor = themeSettings?.link_color || '#6366F1'
  const themeLinkHoverColor = themeSettings?.link_hover_color || '#4f46e5'

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
    { id: 'instagram', name: 'Instagram', path: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z', isFilled: true },
    { id: 'twitter', name: 'Twitter/X', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', isFilled: true },
    { id: 'youtube
