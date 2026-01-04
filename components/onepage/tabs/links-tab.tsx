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
import { Switch } from "@/components/ui/switch"
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
  threads: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.186 3.077c-.844 0-1.656.2-2.362.552a4.842 4.842 0 0 0-1.753 1.544 4.958 4.958 0 0 0-.654 2.439h2.194c.04-.656.28-1.232.714-1.717.434-.485 1.022-.727 1.76-.727.7 0 1.262.214 1.682.64.42.427.63.984.63 1.67 0 .635-.196 1.14-.59 1.513-.392.373-.963.56-1.712.56h-.795v1.96h.795c.895 0 1.603.2 2.122.6.52.4.78.97.78 1.71 0 .78-.28 1.4-.84 1.86-.56.46-1.295.69-2.205.69-.91 0-1.645-.23-2.205-.69-.56-.46-.84-1.08-.84-1.86h-2.194c0 .88.232 1.67.695 2.37.463.7 1.093 1.25 1.89 1.65.797.4 1.683.6 2.658.6 1.015 0 1.917-.21 2.706-.63.79-.42 1.405-1 1.845-1.74.44-.74.66-1.57.66-2.49 0-.86-.198-1.61-.595-2.25-.397-.64-.952-1.14-1.665-1.5.558-.33 1.002-.77 1.332-1.32.33-.55.495-1.18.495-1.89 0-.84-.21-1.57-.63-2.19-.42-.62-.998-1.1-1.735-1.44-.737-.34-1.565-.51-2.484-.51z"/>
    </svg>
  ),
  pinterest: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>
    </svg>
  ),
  snapchat: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3 0 .719-.186.915-.28.243-.117.513-.235.797-.235.274 0 .53.102.763.301.262.223.407.533.419.857.006.162-.022.324-.035.477-.01.117-.019.235-.015.355.012.524.238.875.595 1.155.3.237.682.467 1.038.68.11.067.223.136.335.207.316.198.65.432.78.727.062.142.098.298.098.459 0 .37-.166.718-.456.96-.32.265-.76.41-1.213.39-.377-.015-.754-.131-1.124-.241l-.09-.027c-.332-.103-.68-.209-1.02-.209-.134 0-.267.016-.395.043-.12.025-.654.199-.902.283-.493.167-1.003.34-1.526.42-.076.011-.16.016-.246.016-.336 0-.607-.105-.828-.32-.208-.201-.305-.479-.258-.743.045-.242.123-.486.185-.717l.008-.03c.054-.206.117-.447.13-.694.01-.184-.015-.369-.075-.54-.169-.48-.653-.795-1.254-.795-.603 0-1.086.315-1.254.795-.061.171-.086.356-.075.54.013.247.076.488.13.694l.008.03c.062.231.14.475.185.717.047.264-.05.542-.258.743-.221.215-.492.32-.828.32-.085 0-.17-.005-.245-.016-.524-.08-1.034-.253-1.527-.42-.248-.084-.783-.258-.902-.283-.128-.027-.261-.043-.395-.043-.34 0-.688.106-1.02.209l-.09.027c-.37.11-.747.226-1.124.241-.453.02-.893-.125-1.213-.39-.29-.242-.456-.59-.456-.96 0-.161.036-.317.098-.459.13-.295.464-.529.78-.727.112-.071.225-.14.335-.207.356-.213.738-.443 1.038-.68.357-.28.583-.631.595-1.155.004-.12-.005-.238-.015-.355-.013-.153-.041-.315-.035-.477.012-.324.157-.634.419-.857.233-.199.489-.301.763-.301.284 0 .554.118.797.235.196.094.615.28.915.28.198 0 .326-.045.401-.09-.008-.165-.018-.33-.03-.51l-.003-.06c-.104-1.628-.23-3.654.299-4.847C7.859 1.069 11.216.793 12.206.793z"/>
    </svg>
  ),
  whatsapp: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.304-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  ),
  discord: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0 a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
    </svg>
  ),
  telegram: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  soundcloud: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.016-.054-.055-.1-.107-.1zm-.899.828c-.047 0-.084.036-.092.085l-.203 1.328.203 1.251c.008.05.045.086.092.086.046 0 .084-.036.092-.086l.225-1.251-.225-1.328c-.008-.049-.046-.085-.092-.085zm1.754-.828c-.056 0-.1.044-.108.102l-.248 2.152.248 2.106c.008.056.052.097.108.097.053 0 .096-.04.104-.097l.272-2.106-.272-2.152c-.008-.058-.051-.102-.104-.102zm.899 0c-.056 0-.104.046-.109.104l-.252 2.15.252 2.104c.005.059.053.101.109.101.059 0 .102-.042.107-.101l.282-2.104-.282-2.15c-.005-.058-.048-.104-.107-.104zm.859-.022c-.063 0-.11.048-.117.111l-.219 2.172.219 2.105c.007.062.054.11.117.11.057 0 .107-.048.114-.11l.247-2.105-.247-2.172c-.007-.063-.057-.111-.114-.111zm.902.022c-.063 0-.11.048-.117.11l-.221 2.15.221 2.105c.007.06.054.111.117.111.06 0 .107-.051.114-.111l.248-2.105-.248-2.15c-.007-.062-.054-.11-.114-.11zm.89 0c-.065 0-.114.048-.119.11l-.204 2.15.204 2.105c.005.062.054.111.119.111.061 0 .113-.049.119-.111l.232-2.105-.232-2.15c-.006-.062-.058-.11-.119-.11zm.934.011c-.062 0-.109.05-.114.112l-.192 2.139.192 2.104c.005.061.052.11.114.11.058 0 .108-.049.114-.11l.218-2.104-.218-2.139c-.006-.062-.056-.112-.114-.112zm.896 0c-.066 0-.116.05-.121.112l-.191 2.139.191 2.104c.005.061.055.11.121.11.062 0 .111-.049.116-.11l.22-2.104-.22-2.139c-.005-.062-.054-.112-.116-.112zm1.769-.228c-.065 0-.115.057-.123.123l-.216 2.367.216 2.055c.008.064.058.121.123.121.063 0 .113-.057.121-.121l.246-2.055-.246-2.367c-.008-.066-.058-.123-.121-.123zm.899.218c-.063 0-.112.055-.121.119l-.183 2.147.183 2.054c.009.062.058.119.121.119.064 0 .114-.055.121-.119l.211-2.054-.211-2.147c-.007-.064-.057-.119-.121-.119zm-3.547.342c-.068 0-.118.05-.127.117l-.197 1.828.197 1.875c.009.066.059.117.127.117.066 0 .115-.051.123-.117l.223-1.875-.223-1.828c-.008-.066-.057-.117-.123-.117z"/>
    </svg>
  ),
  patreon: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524M.003 23.537h4.22V.524H.003"/>
    </svg>
  ),
  substack: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M22.539 8.242H1.46V5.406h21.08zM1.46 10.812V24L12 18.11 22.54 24V10.812zM22.54 0H1.46v2.836h21.08z"/>
    </svg>
  ),
  mastodon: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
    </svg>
  ),
  bluesky: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>
    </svg>
  ),
  etsy: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M16.47 12.02c-.05-.41-.06-.54-.06-.67 0-.09.02-.13.06-.13.03 0 .05.01.09.03l.02.01c.81.44 1.61.66 2.45.66 1.07 0 1.66-.51 1.66-1.39 0-1.19-1.23-1.44-2.47-1.73-1.95-.46-4.15-.98-4.15-3.47 0-1.72 1.23-3.08 3.43-3.08.8 0 1.53.16 2.2.47.25.12.43.17.52.17.12 0 .18-.08.2-.32l.04-.47c.02-.17.06-.23.15-.23.1 0 .16.04.24.18.37.63.61 1.23.72 1.85.04.23.04.41.01.55-.02.15-.08.23-.17.23-.12 0-.21-.11-.25-.32-.37-1.8-1.42-2.59-3.06-2.59-1.01 0-1.6.51-1.6 1.31 0 1.12 1.23 1.38 2.47 1.67 1.95.45 4.15.96 4.15 3.45 0 1.82-1.28 3.22-3.58 3.22-.86 0-1.68-.17-2.46-.51-.32-.14-.52-.22-.66-.22-.13 0-.19.09-.22.33l-.07.66c-.02.16-.08.23-.17.23-.09 0-.16-.05-.23-.18a8.37 8.37 0 0 1-.76-2.06zM3.1 17.16c-.14.02-.21-.05-.21-.2V15.7c0-.15.07-.21.21-.21h.47c.3 0 .46.13.6.49l2.5 7.08c.06.18.13.25.27.25.15 0 .2-.07.26-.25l2.61-7.16c.11-.31.24-.41.5-.41h.44c.14 0 .21.06.21.21v1.26c0 .15-.07.22-.21.2-.99-.09-1.29.29-1.46.76l-2.65 7.24c-.16.44-.32.65-.74.65H5.1c-.42 0-.58-.21-.74-.65L1.71 17.92c-.17-.47-.47-.85-1.46-.76z"/>
    </svg>
  ),
  phone: ({ size = 20, color = "currentColor", className }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
}

// Social platforms configuration with SVG icons
const SOCIAL_PLATFORMS = [
  { id: "threads", label: "Threads", placeholder: "https://threads.net/@username", color: "#000000", domains: ["threads.net"] },
  { id: "email", label: "Email", placeholder: "mailto:you@email.com", color: "#EA4335", domains: [] },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/page", color: "#1877F2", domains: ["facebook.com", "www.facebook.com", "fb.com"] },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel", color: "#FF0000", domains: ["youtube.com", "www.youtube.com", "youtu.be"] },
  { id: "twitter", label: "X (formerly Twitter)", placeholder: "https://x.com/username", color: "#000000", domains: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"] },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username", color: "#000000", domains: ["tiktok.com", "www.tiktok.com"] },
  { id: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/1234567890", color: "#25D366", domains: ["wa.me", "whatsapp.com"] },
  { id: "whatsappchannel", label: "WhatsApp Channel", placeholder: "https://whatsapp.com/channel/...", color: "#25D366", domains: ["whatsapp.com"] },
  { id: "snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/username", color: "#FFFC00", domains: ["snapchat.com", "www.snapchat.com"] },
  { id: "airchat", label: "Airchat", placeholder: "https://airchat.com/username", color: "#FFA500", domains: ["airchat.com"] },
  { id: "amazon", label: "Amazon", placeholder: "https://amazon.com/...", color: "#FF9900", domains: ["amazon.com", "www.amazon.com", "amzn.to"] },
  { id: "playstore", label: "Android Play Store", placeholder: "https://play.google.com/store/apps/details?id=...", color: "#34A853", domains: ["play.google.com"] },
  { id: "appstore", label: "Apple App Store", placeholder: "https://apps.apple.com/app/...", color: "#0D96F6", domains: ["apps.apple.com"] },
  { id: "applemusic", label: "Apple Music", placeholder: "https://music.apple.com/...", color: "#FA243C", domains: ["music.apple.com"] },
  { id: "applepodcast", label: "Apple Podcast", placeholder: "https://podcasts.apple.com/...", color: "#9933CC", domains: ["podcasts.apple.com"] },
  { id: "bandcamp", label: "Bandcamp", placeholder: "https://username.bandcamp.com", color: "#629AA9", domains: ["bandcamp.com"] },
  { id: "bereal", label: "BeReal", placeholder: "https://bereal.com/...", color: "#000000", domains: ["bereal.com"] },
  { id: "bluesky", label: "Bluesky", placeholder: "https://bsky.app/profile/username", color: "#1285FE", domains: ["bsky.app"] },
  { id: "cameo", label: "Cameo", placeholder: "https://cameo.com/username", color: "#BB44FF", domains: ["cameo.com"] },
  { id: "clubhouse", label: "Clubhouse", placeholder: "https://clubhouse.com/@username", color: "#F1EEE1", domains: ["clubhouse.com"] },
  { id: "discord", label: "Discord", placeholder: "https://discord.gg/...", color: "#5865F2", domains: ["discord.gg", "discord.com"] },
  { id: "etsy", label: "Etsy", placeholder: "https://etsy.com/shop/...", color: "#F1641E", domains: ["etsy.com"] },
  { id: "github", label: "GitHub", placeholder: "https://github.com/username", color: "#333333", domains: ["github.com", "www.github.com"] },
  { id: "kick", label: "Kick", placeholder: "https://kick.com/username", color: "#53FC18", domains: ["kick.com"] },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username", color: "#0A66C2", domains: ["linkedin.com", "www.linkedin.com"] },
  { id: "mastodon", label: "Mastodon", placeholder: "https://mastodon.social/@username", color: "#6364FF", domains: ["mastodon.social", "mastodon.online"] },
  { id: "patreon", label: "Patreon", placeholder: "https://patreon.com/username", color: "#FF424D", domains: ["patreon.com"] },
  { id: "payment", label: "Payment", placeholder: "https://paypal.me/username", color: "#6366F1", domains: [] },
  { id: "phone", label: "Phone", placeholder: "tel:+1234567890", color: "#10B981", domains: [] },
  { id: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/username", color: "#E60023", domains: ["pinterest.com", "www.pinterest.com", "pin.it"] },
  { id: "poshmark", label: "Poshmark", placeholder: "https://poshmark.com/closet/...", color: "#8B3B96", domains: ["poshmark.com"] },
  { id: "signal", label: "Signal", placeholder: "https://signal.me/#p/...", color: "#3A76F0", domains: ["signal.me"] },
  { id: "soundcloud", label: "Soundcloud", placeholder: "https://soundcloud.com/username", color: "#FF5500", domains: ["soundcloud.com"] },
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/...", color: "#1DB954", domains: ["open.spotify.com", "spotify.com"] },
  { id: "substack", label: "Substack", placeholder: "https://username.substack.com", color: "#FF6719", domains: ["substack.com"] },
  { id: "telegram", label: "Telegram", placeholder: "https://t.me/username", color: "#26A5E4", domains: ["t.me", "telegram.me"] },
  { id: "twitch", label: "Twitch", placeholder: "https://twitch.tv/username", color: "#9146FF", domains: ["twitch.tv", "www.twitch.tv"] },
  { id: "website", label: "Personal Website", placeholder: "https://yourwebsite.com", color: "#6366F1", domains: [] },
  { id: "rednote", label: "Red Note", placeholder: "https://rednote.com/...", color: "#FF0000", domains: ["rednote.com"] },
  { id: "lemon8", label: "Lemon8", placeholder: "https://lemon8-app.com/...", color: "#FFE500", domains: ["lemon8-app.com"] },
  { id: "bandsintown", label: "Bandsintown", placeholder: "https://bandsintown.com/a/...", color: "#00CEC8", domains: ["bandsintown.com"] },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/username", color: "#E4405F", domains: ["instagram.com", "www.instagram.com"] },
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
  const [showImageLibrary, setShowImageLibrary] = useState(false)
  const [imageBlockId, setImageBlockId] = useState<string | null>(null)
  
  // Drag state
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)
  
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

  if (!onepage) return null

  const { draft_blocks, title, avatar_url, social_links } = onepage
  const sortedBlocks = [...draft_blocks].sort((a, b) => a.sort_order - b.sort_order)

  const handleAddBlock = (type: OnePageBlockType, preset?: { label: string; url: string }) => {
    const newBlock = addBlock(type)
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
  }

  const handleAddSocial = () => {
    if (!selectedSocial || !socialUrl) return

    // Validate URL matches platform domain
    const platform = SOCIAL_PLATFORMS.find(p => p.id === selectedSocial)
    if (platform && platform.domains.length > 0) {
      try {
        const url = new URL(socialUrl.startsWith('http') ? socialUrl : `https://${socialUrl}`)
        const hostname = url.hostname.toLowerCase()
        const isValid = platform.domains.some(domain =>
          hostname === domain || hostname.endsWith(`.${domain}`)
        )

        if (!isValid) {
          alert(`Please enter a valid ${platform.label} URL (e.g., ${platform.placeholder})`)
          return
        }
      } catch (e) {
        alert(`Please enter a valid URL for ${platform.label}`)
        return
      }
    }

    updateSocialLinks({ [selectedSocial]: socialUrl } as Partial<OnePageSocialLinks>)
    setSelectedSocial(null)
    setSocialUrl("")
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
      const draggedIndex = sortedBlocks.findIndex(b => b.id === draggedBlockId)
      const targetIndex = sortedBlocks.findIndex(b => b.id === targetBlockId)
      
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
        <div>
          <h2 className="font-semibold">{title || "Your Name"}</h2>
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

      {/* Add Button - Blue with Smooth Hover Animation */}
      <button
        onClick={() => setShowAddModal(true)}
        className="group w-full h-11 bg-violet-600 hover:bg-gray-900 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center"
      >
        <Plus className="h-5 w-5 mr-2 transition-transform duration-300 group-hover:rotate-90" />
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
      <div className="space-y-2">
        {sortedBlocks.map((block, index) => (
          <div
            key={block.id}
            draggable
            onDragStart={(e) => handleDragStart(e, block.id)}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, block.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              "transition-all duration-200",
              draggedBlockId === block.id && "opacity-50 scale-[0.98]",
              dragOverBlockId === block.id && "border-t-2 border-violet-500"
            )}
          >
            <BlockItem
              block={block}
              isSelected={selectedBlockId === block.id}
              onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
              onRemove={() => removeBlock(block.id)}
              onMoveUp={() => moveBlockUp(block.id)}
              onMoveDown={() => moveBlockDown(block.id)}
              onToggle={() => toggleBlockEnabled(block.id)}
              isFirst={index === 0}
              isLast={index === sortedBlocks.length - 1}
              socialLinks={social_links}
              onOpenImageLibrary={(blockId) => { setImageBlockId(blockId); setShowImageLibrary(true) }}
              onOpenSocialModal={() => setShowSocialModal(true)}
            />
          </div>
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
      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) setSearchQuery(""); }}>
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

      {/* Social Links Modal with Scrollable Vertical Layout */}
      <Dialog open={showSocialModal} onOpenChange={(open) => { setShowSocialModal(open); if (!open) { setSelectedSocial(null); setSocialUrl(""); } }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[85vh]">
          <DialogHeader className="p-4 sm:p-5 border-b sticky top-0 bg-white z-10">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {selectedSocial ? "Edit Social Link" : "Add Social Link"}
            </DialogTitle>
          </DialogHeader>

          <div className={selectedSocial ? "p-4 sm:p-5" : ""}>
            {!selectedSocial ? (
              // Platform selection - Scrollable Vertical List with Colored Icons
              <div className="max-h-[60vh] overflow-y-auto px-4 sm:px-5">
                <div className="space-y-1 py-3">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const isActive = !!social_links?.[platform.id as keyof typeof social_links]
                    return (
                      <button
                        key={platform.id}
                        onClick={() => {
                          setSelectedSocial(platform.id)
                          setSocialUrl(social_links?.[platform.id as keyof typeof social_links] || "")
                        }}
                        className={cn(
                          "w-full flex items-center gap-4 p-3.5 rounded-xl transition-all hover:bg-gray-50",
                          isActive && "bg-gray-50"
                        )}
                      >
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: platform.color }}
                        >
                          <RenderSocialIcon platform={platform.id} size={22} color="#ffffff" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-sm">{platform.label}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              // URL input for selected platform
              <div className="space-y-4">
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
                          onChange={(e) => setSocialUrl(e.target.value)}
                          placeholder={platform?.placeholder}
                          className="h-11"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setSelectedSocial(null)}
                        >
                          Back
                        </Button>
                        {social_links?.[selectedSocial as keyof typeof social_links] && (
                          <button
                            onClick={() => {
                              handleRemoveSocial(selectedSocial)
                              setSelectedSocial(null)
                            }}
                            className="group relative inline-flex flex-col justify-center items-center p-4 border-0 rounded-[1.25em] transition-all duration-200"
                            style={{ backgroundColor: 'rgba(100,77,237,0.08)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '3.4px 2.5px 4.9px rgba(0, 0, 0, 0.025), 8.6px 6.3px 12.4px rgba(0, 0, 0, 0.035), 17.5px 12.8px 25.3px rgba(0, 0, 0, 0.045), 36.1px 26.3px 52.2px rgba(0, 0, 0, 0.055), 99px 72px 143px rgba(0, 0, 0, 0.08)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = ''
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" height="25" width="25">
                              <path fill="#6361D9" d="M8.78842 5.03866C8.86656 4.96052 8.97254 4.91663 9.08305 4.91663H11.4164C11.5269 4.91663 11.6329 4.96052 11.711 5.03866C11.7892 5.11681 11.833 5.22279 11.833 5.33329V5.74939H8.66638V5.33329C8.66638 5.22279 8.71028 5.11681 8.78842 5.03866ZM7.16638 5.74939V5.33329C7.16638 4.82496 7.36832 4.33745 7.72776 3.978C8.08721 3.61856 8.57472 3.41663 9.08305 3.41663H11.4164C11.9247 3.41663 12.4122 3.61856 12.7717 3.978C13.1311 4.33745 13.333 4.82496 13.333 5.33329V5.74939H15.5C15.9142 5.74939 16.25 6.08518 16.25 6.49939C16.25 6.9136 15.9142 7.24939 15.5 7.24939H15.0105L14.2492 14.7095C14.2382 15.2023 14.0377 15.6726 13.6883 16.0219C13.3289 16.3814 12.8414 16.5833 12.333 16.5833H8.16638C7.65805 16.5833 7.17054 16.3814 6.81109 16.0219C6.46176 15.6726 6.2612 15.2023 6.25019 14.7095L5.48896 7.24939H5C4.58579 7.24939 4.25 6.9136 4.25 6.49939C4.25 6.08518 4.58579 5.74939 5 5.74939H6.16667H7.16638ZM7.91638 7.24996H12.583H13.5026L12.7536 14.5905C12.751 14.6158 12.7497 14.6412 12.7497 14.6666C12.7497 14.7771 12.7058 14.8831 12.6277 14.9613C12.5495 15.0394 12.4436 15.0833 12.333 15.0833H8.16638C8.05588 15.0833 7.94989 15.0394 7.87175 14.9613C7.79361 14.8831 7.74972 14.7771 7.74972 14.6666C7.74972 14.6412 7.74842 14.6158 7.74584 14.5905L6.99681 7.24996H7.91638Z" clipRule="evenodd" fillRule="evenodd"></path>
                            </svg>
                            <span className="invisible group-hover:visible absolute z-10 w-16 bg-black/25 text-white text-center rounded-md py-1 text-xs left-full ml-2 top-1/4">
                              remove
                              <span className="absolute top-1/2 right-full -mt-1 border-[5px] border-transparent border-r-black/25"></span>
                            </span>
                          </button>
                        )}
                        <Button
                          className="flex-1 bg-gray-900 hover:bg-gray-800"
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
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden"
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
                    className="absolute cursor-move"
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
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingCrop(true)
                        setDragStartCrop({ x: e.clientX, y: e.clientY })
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
                  className="relative mx-auto bg-black rounded-xl overflow-hidden select-none"
                  style={{ width: '300px', height: '400px' }}
                >
                  <video
                    src={tempVideoUrl}
                    className="w-full h-full object-cover pointer-events-none"
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
                  <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)' }} />

                  {/* Crop box - draggable (using percentages) */}
                  <div
                    className="absolute border-2 border-white border-dashed cursor-move"
                    style={{
                      left: `${videoCropBox.x}%`,
                      top: `${videoCropBox.y}%`,
                      width: `${videoCropBox.width}%`,
                      height: `${videoCropBox.height}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      background: 'transparent'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingVideoCrop(true)
                      const container = videoContainerRef.current
                      if (!container) return
                      const rect = container.getBoundingClientRect()
                      setVideoDragStart({
                        x: e.clientX,
                        y: e.clientY,
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

                    {/* Corner resize handles */}
                    <div
                      className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-nw-resize z-10"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('top-left')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-ne-resize z-10"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('top-right')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-sw-resize z-10"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('bottom-left')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                    <div
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize z-10"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingVideoCrop('bottom-right')
                        setVideoDragStart({ x: e.clientX, y: e.clientY, boxX: videoCropBox.x, boxY: videoCropBox.y, boxW: videoCropBox.width, boxH: videoCropBox.height })
                      }}
                    />
                  </div>

                  {/* Global mouse handlers */}
                  {(isDraggingVideoCrop || isResizingVideoCrop) && (
                    <div
                      className="fixed inset-0 z-50"
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

  return (
    <div
      className={cn(
        "border rounded-xl bg-white transition-all cursor-grab active:cursor-grabbing",
        isSelected ? "ring-2 ring-violet-500 border-violet-200" : "hover:border-gray-300",
        !block.enabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="cursor-grab text-gray-300 hover:text-gray-400 active:cursor-grabbing">
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={onSelect}>
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{preview.title}</p>
            <p className="text-xs text-muted-foreground truncate">{preview.subtitle}</p>
          </div>
        </div>

        <Switch checked={block.enabled} onCheckedChange={onToggle} />
      </div>

      {isSelected && (
        <div className="border-t p-4 space-y-4 bg-gray-50/50">
          <BlockEditor 
            block={block} 
            socialLinks={socialLinks} 
            onOpenImageLibrary={onOpenImageLibrary}
            onOpenSocialModal={onOpenSocialModal}
          />
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
            <Switch checked={data.show_avatar} onCheckedChange={(checked) => updateData({ show_avatar: checked })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Name</Label>
            <Switch checked={data.show_name} onCheckedChange={(checked) => updateData({ show_name: checked })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Bio</Label>
            <Switch checked={data.show_bio} onCheckedChange={(checked) => updateData({ show_bio: checked })} />
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
