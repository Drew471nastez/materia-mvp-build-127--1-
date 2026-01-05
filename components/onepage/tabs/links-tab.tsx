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
} from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

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
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.33-3.022.907-.754 2.063-1.05 3.096-1.05.344 0 .672.026.984.074l.048-.3c.055-.334.076-.63.063-.9-.053-1.024-.489-1.721-1.296-2.073-.515-.224-1.17-.319-1.832-.267-.768.062-1.416.303-1.929.72-.447.363-.756.844-.868 1.349l-2.05-.421c.256-1.203.892-2.188 1.86-2.866.94-.658 2.15-1.024 3.51-1.061.066-.002.13-.003.195-.003.972 0 1.896.178 2.694.54 1.33.602 2.168 1.726 2.359 3.163.04.307.051.622.035.949l.5.007c1.698.118 2.928.639 3.759 1.597.857.987 1.227 2.397 1.134 4.316-.068 1.393-.522 2.833-1.316 4.172-.759 1.279-1.9 2.354-3.394 3.2-1.618.918-3.561 1.405-5.618 1.41zM10.75 13.39c-.614 0-1.378.126-1.93.585-.436.362-.648.85-.612 1.41.045.732.488 1.304 1.249 1.611.404.163.89.242 1.387.222 1.036-.053 1.818-.424 2.323-1.104.343-.46.567-1.03.668-1.703-.57-.175-1.3-.293-2.009-.42-.367-.068-.716-.132-1.014-.206l-.062-.394z"/>
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
    label: "Suggested",
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

export function LinksTab() {
  const {
    onepage,
    selectedBlockId,
    setSelectedBlockId,
    addBlock,
    removeBlock,
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

  const handleAddBlock = (type: OnePageBlockType, preset?: { label: string; url: string }) => {
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

  // Social link validation rules
  const validateSocialUrl = (platform: string, url: string): { valid: boolean; error?: string; transformedUrl?: string } => {
    const trimmedUrl = url.trim()

    // Platform-specific validation patterns
    const platformRules: Record<string, {
      patterns: RegExp[];
      errorMsg: string;
      transform?: (url: string) => string
    }> = {
      instagram: {
        patterns: [
          /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/,
          /^@?[a-zA-Z0-9_.]+$/ // Allow @username or just username
        ],
        errorMsg: "Enter a valid Instagram URL or @username",
        transform: (url: string) => {
          // Transform @username to full URL
          if (url.startsWith('@') || (!url.includes('http') && !url.includes('/'))) {
            const username = url.replace('@', '')
            return `https://instagram.com/${username}`
          }
          return url
        }
      },
      twitter: {
        patterns: [
          /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/,
          /^@?[a-zA-Z0-9_]+$/ // Allow @username
        ],
        errorMsg: "Enter a valid X/Twitter URL or @username",
        transform: (url: string) => {
          if (url.startsWith('@') || (!url.includes('http') && !url.includes('/'))) {
            const username = url.replace('@', '')
            return `https://x.com/${username}`
          }
          return url
        }
      },
      threads: {
        patterns: [
          /^https?:\/\/(www\.)?threads\.net\/@?[a-zA-Z0-9_.]+\/?$/,
          /^@?[a-zA-Z0-9_.]+$/
        ],
        errorMsg: "Enter a valid Threads URL or @username",
        transform: (url: string) => {
          if (url.startsWith('@') || (!url.includes('http') && !url.includes('/'))) {
            const username = url.replace('@', '')
            return `https://threads.net/@${username}`
          }
          return url
        }
      },
      tiktok: {
        patterns: [
          /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\/@?[a-zA-Z0-9_.]+\/?.*$/,
          /^@?[a-zA-Z0-9_.]+$/
        ],
        errorMsg: "Enter a valid TikTok URL or @username",
        transform: (url: string) => {
          if (url.startsWith('@') || (!url.includes('http') && !url.includes('/'))) {
            const username = url.replace('@', '')
            return `https://tiktok.com/@${username}`
          }
          return url
        }
      },
      youtube: {
        patterns: [
          /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/
        ],
        errorMsg: "Enter a valid YouTube URL"
      },
      facebook: {
        patterns: [
          /^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/.+$/
        ],
        errorMsg: "Enter a valid Facebook URL"
      },
      linkedin: {
        patterns: [
          /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/.+$/
        ],
        errorMsg: "Enter a valid LinkedIn URL"
      },
      spotify: {
        patterns: [
          /^https?:\/\/(open\.)?spotify\.com\/.+$/
        ],
        errorMsg: "Enter a valid Spotify URL"
      },
      soundcloud: {
        patterns: [
          /^https?:\/\/(www\.)?soundcloud\.com\/.+$/
        ],
        errorMsg: "Enter a valid SoundCloud URL"
      },
      pinterest: {
        patterns: [
          /^https?:\/\/(www\.)?pinterest\.(com|ca|co\.uk)\/.+$/
        ],
        errorMsg: "Enter a valid Pinterest URL"
      },
      twitch: {
        patterns: [
          /^https?:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+\/?$/
        ],
        errorMsg: "Enter a valid Twitch URL"
      },
      kick: {
        patterns: [
          /^https?:\/\/(www\.)?kick\.com\/[a-zA-Z0-9_]+\/?$/
        ],
        errorMsg: "Enter a valid Kick URL"
      },
      discord: {
        patterns: [
          /^https?:\/\/(www\.)?(discord\.(gg|com\/invite)|discordapp\.com\/invite)\/.+$/
        ],
        errorMsg: "Enter a valid Discord invite URL"
      },
      telegram: {
        patterns: [
          /^https?:\/\/(www\.)?(t\.me|telegram\.me)\/.+$/,
          /^@?[a-zA-Z0-9_]+$/
        ],
        errorMsg: "Enter a valid Telegram URL or @username",
        transform: (url: string) => {
          if (url.startsWith('@') || (!url.includes('http') && !url.includes('/'))) {
            const username = url.replace('@', '')
            return `https://t.me/${username}`
          }
          return url
        }
      },
      whatsapp: {
        patterns: [
          /^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/.+$/,
          /^\+?[0-9]+$/ // Allow phone number
        ],
        errorMsg: "Enter a valid WhatsApp URL or phone number",
        transform: (url: string) => {
          if (/^\+?[0-9]+$/.test(url)) {
            const number = url.replace(/\D/g, '')
            return `https://wa.me/${number}`
          }
          return url
        }
      },
      snapchat: {
        patterns: [
          /^https?:\/\/(www\.)?snapchat\.com\/add\/[a-zA-Z0-9_.]+\/?$/,
          /^[a-zA-Z0-9_.]+$/
        ],
        errorMsg: "Enter a valid Snapchat URL or username",
        transform: (url: string) => {
          if (!url.includes('http') && !url.includes('/')) {
            return `https://snapchat.com/add/${url}`
          }
          return url
        }
      },
      github: {
        patterns: [
          /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9-]+\/?$/
        ],
        errorMsg: "Enter a valid GitHub URL"
      },
      patreon: {
        patterns: [
          /^https?:\/\/(www\.)?patreon\.com\/[a-zA-Z0-9_]+\/?$/
        ],
        errorMsg: "Enter a valid Patreon URL"
      },
      email: {
        patterns: [
          /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/,
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        ],
        errorMsg: "Enter a valid email address",
        transform: (url: string) => {
          if (!url.startsWith('mailto:')) {
            return `mailto:${url}`
          }
          return url
        }
      },
      website: {
        patterns: [
          /^https?:\/\/.+\..+$/
        ],
        errorMsg: "Enter a valid website URL",
        transform: (url: string) => {
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return `https://${url}`
          }
          return url
        }
      }
    }

    const rules = platformRules[platform]
    if (!rules) {
      // No specific rules, accept any URL
      return { valid: true, transformedUrl: trimmedUrl }
    }

    // Apply transform if available
    let finalUrl = rules.transform ? rules.transform(trimmedUrl) : trimmedUrl

    // Check if matches any pattern
    const isValid = rules.patterns.some(pattern => pattern.test(trimmedUrl) || pattern.test(finalUrl))

    if (!isValid) {
      return { valid: false, error: rules.errorMsg }
    }

    return { valid: true, transformedUrl: finalUrl }
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

  const activeCategoryBlocks = searchQuery 
    ? filteredCategories.flatMap(c => c.blocks)
    : blockCategories.find((c) => c.id === addModalCategory)?.blocks || []

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
        <Button variant="outline" size="sm" className="text-xs h-8">
          View archive
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Blocks List - Draggable */}
      <div className="flex flex-col gap-2">
        {sortedBlocks.map((block, index) => (
          <React.Fragment key={block.id}>
            <div
              draggable={block.type !== "header"}
              onDragStart={(e) => block.type !== "header" && handleDragStart(e, block.id)}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, block.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                "transition-all duration-200",
                draggedBlockId === block.id && "opacity-50 scale-[0.98]",
                dragOverBlockId === block.id && block.type !== "header" && "border-t-2 border-violet-500"
              )}
            >
              <BlockItem
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
                onRemove={() => removeBlock(block.id)}
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
              />
            </div>

            {index < sortedBlocks.length - 1 && (
              <div className="relative h-10 -mx-1 group/add-divider">
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterId(block.id)
                    setShowAddModal(true)
                  }}
                  className="absolute inset-0 flex items-center justify-center px-1 focus:outline-none"
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

      {/* Add Block Modal - Wider on desktop */}
      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) { setSearchQuery(""); setInsertAfterId(null); } }}>
    <DialogContent className="w-[calc(100%-32px)] sm:w-[min(800px,calc(100vw-64px))] sm:!max-w-[800px] p-0 gap-0 overflow-hidden rounded-2xl mx-auto">


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
          <div className="flex flex-col sm:flex-row max-h-[60vh] sm:max-h-[500px] overflow-hidden">
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
                        className="flex flex-col items-center gap-2 p-4 sm:p-5 border-2 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600" />
                        <span className="text-sm font-medium">{item.label}</span>
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
                  
                  return (
                    <button
                      key={`${block.type}-${block.label}-${idx}`}
                      onClick={() => handleAddBlock(block.type, (block as any).preset)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 transition-colors text-left group"
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
                        <p className="text-xs text-muted-foreground truncate">{block.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
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
                        onClick={() => { setSelectedSocial(null); setSocialUrlError(null); }}
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
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: () => void
  isFirst: boolean
  isLast: boolean
  socialLinks: OnePageSocialLinks
  onOpenImageLibrary: (blockId: string) => void
  onOpenSocialModal: () => void
}

function BlockItem({
  block,
  isSelected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggle,
  isFirst,
  isLast,
  socialLinks,
  onOpenImageLibrary,
  onOpenSocialModal,
}: BlockItemProps) {
  const { updateBlock } = useOnePage()

  const getBlockPreview = () => {
    switch (block.type) {
      case "link_button": {
        const data = block.data as LinkButtonBlockData
        return { title: data.label || "My Link", subtitle: data.url || "https://...", icon: Link }
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

  return (
    <div
      className={cn(
        "border rounded-xl bg-white transition-all",
        !isHeaderBlock && "cursor-grab active:cursor-grabbing",
        isSelected ? "ring-2 ring-violet-500 border-violet-200" : "hover:border-gray-300",
        !block.enabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {!isHeaderBlock && (
          <div className="cursor-grab text-gray-300 hover:text-gray-400 active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </div>
        )}

        <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={onSelect}>
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{preview.title}</p>
            <p className="text-xs text-muted-foreground truncate">{preview.subtitle}</p>
          </div>
        </div>

        <Toggle checked={block.enabled} onCheckedChange={onToggle} />
      </div>

      {isSelected && (
        <div className="border-t p-4 space-y-4 bg-gray-50/50">
          <BlockEditor
            block={block}
            socialLinks={socialLinks}
            onOpenImageLibrary={onOpenImageLibrary}
            onOpenSocialModal={onOpenSocialModal}
          />
          {!isHeaderBlock && (
            <div className="flex items-center justify-between pt-3 border-t">
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
                onClick={onRemove}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
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
  onOpenSocialModal 
}: { 
  block: OnePageBlock
  socialLinks: OnePageSocialLinks
  onOpenImageLibrary: (blockId: string) => void
  onOpenSocialModal: () => void
}) {
  const { updateBlock, updateSocialLinks } = useOnePage()
  
  // Drag state for social icons reordering
  const [draggedSocialId, setDraggedSocialId] = useState<string | null>(null)
  const [dragOverSocialId, setDragOverSocialId] = useState<string | null>(null)

  // Sync block platforms when socialLinks change
  useEffect(() => {
    if (block.type === "social_row") {
      const data = block.data as SocialRowBlockData
      const activeSocials = Object.entries(socialLinks || {})
        .filter(([_, url]) => url)
        .map(([platform, url]) => ({ platform, url: url as string }))
      
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

  switch (block.type) {
    case "link_button": {
      const data = block.data as LinkButtonBlockData
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={data.label} onChange={(e) => updateData({ label: e.target.value })} placeholder="My Link" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={data.url} onChange={(e) => updateData({ url: e.target.value })} placeholder="https://..." className="h-9" />
          </div>
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
