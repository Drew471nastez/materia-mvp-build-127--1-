"use client"

import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import { useEffect, useState, useRef, useCallback } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
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
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { OnePageTheme } from "@/lib/onepage/types"

type DesignSection = "header" | "theme" | "wallpaper" | "text" | "buttons" | "socials" | "footer"

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

const FONTS = [
  // Sans Serif - Most Popular
  { name: "Inter", category: "sans", style: "Clean & Professional" },
  { name: "Roboto", category: "sans", style: "Modern & Versatile" },
  { name: "Poppins", category: "sans", style: "Rounded & Friendly" },
  { name: "Montserrat", category: "sans", style: "Elegant & Bold" },
  { name: "Open Sans", category: "sans", style: "Web Standard" },
  { name: "Lato", category: "sans", style: "Balanced & Warm" },
  { name: "DM Sans", category: "sans", style: "Geometric & Sharp" },
  { name: "Nunito", category: "sans", style: "Soft & Rounded" },
  // Serif
  { name: "Playfair Display", category: "serif", style: "Elegant & Editorial" },
  { name: "Merriweather", category: "serif", style: "Traditional & Warm" },
  { name: "Lora", category: "serif", style: "Classic & Readable" },
  { name: "Georgia", category: "serif", style: "Web Classic" },
  // Display
  { name: "Bebas Neue", category: "display", style: "Tall & Condensed" },
  { name: "Oswald", category: "display", style: "Strong & Narrow" },
  { name: "Anton", category: "display", style: "Bold Impact" },
  { name: "Archivo Black", category: "display", style: "Heavy & Modern" },
  // Script / Handwritten
  { name: "Caveat", category: "script", style: "Casual & Personal" },
  { name: "Dancing Script", category: "script", style: "Elegant Script" },
  { name: "Pacifico", category: "script", style: "Fun & Friendly" },
  { name: "Sacramento", category: "script", style: "Flowing & Delicate" },
]

const FONT_CATEGORIES = [
  { id: "all", label: "All Fonts" },
  { id: "sans", label: "Sans Serif" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "script", label: "Script" },
]

const SOCIAL_STYLES = [
  { id: "filled", label: "Filled", description: "Solid background" },
  { id: "outline", label: "Outline", description: "Border only" },
  { id: "minimal", label: "Minimal", description: "No background" },
]

const BACKGROUND_IMAGES = [
  { id: "gradient1", url: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800&q=80", label: "Purple Gradient" },
  { id: "gradient2", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80", label: "Colorful Gradient" },
  { id: "gradient3", url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80", label: "Blue Gradient" },
  { id: "abstract1", url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&q=80", label: "Abstract" },
  { id: "abstract2", url: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=800&q=80", label: "Waves" },
  { id: "mesh1", url: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=800&q=80", label: "Mesh" },
  { id: "dark1", url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80", label: "Dark" },
  { id: "mountains", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", label: "Mountains" },
  { id: "marble", url: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=800&q=80", label: "Marble" },
  { id: "texture", url: "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=800&q=80", label: "Texture" },
  { id: "ocean", url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", label: "Ocean" },
  { id: "forest", url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=800&q=80", label: "Forest" },
]

const THEME_TEMPLATES = [
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
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      button_color: "#38bdf8",
      button_text_color: "#0c4a6e",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 0,
      button_border_color: "#38bdf8",
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      font_family: "Poppins",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      button_color: "#3b82f6",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 10,
      button_border_width: 0,
      button_border_color: "#3b82f6",
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      button_text_color: "#fffbeb",
      button_style: "outline" as const,
      button_border_radius: 24,
      button_border_width: 2,
      button_border_color: "#1c1917",
      font_family: "DM Sans",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
  },
  {
    id: "glass",
    name: "Glass",
    category: "dark",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#1e1b4b",
      background_gradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
      background_image_url: "",
      text_color: "#e0e7ff",
      secondary_text_color: "#a5b4fc",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#e0e7ff",
      button_style: "glass" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.2)",
      font_family: "Inter",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
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
      font_family: "Space Grotesk",
      spacing: "normal" as const,
      card_width: "standard" as const,
      animated_gradient: true,
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
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 1,
      button_border_color: "#22d3ee",
      font_family: "JetBrains Mono",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "hero",
    },
  },
  {
    id: "nature",
    name: "Nature",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#1a2e1a",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1200&q=80",
      text_color: "#ffffff",
      secondary_text_color: "#d1fae5",
      button_color: "rgba(255, 255, 255, 0.9)",
      button_text_color: "#065f46",
      button_style: "filled" as const,
      button_border_radius: 24,
      button_border_width: 0,
      button_border_color: "#ffffff",
      font_family: "Nunito",
      spacing: "normal" as const,
      card_width: "standard" as const,
    },
  },
]

export function DesignTab() {
  const [activeSection, setActiveSection] = useState<DesignSection>("theme")
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

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
  
  // Crop box state
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!onepage) return null

  const { theme } = onepage
  const headerLayout = (theme as any).header_layout || "classic"
  const effectiveLayout = theme.background_type === "image" ? "classic" : headerLayout
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

  useEffect(() => {
    if (isVideoDragging || isVideoResizing) {
      window.addEventListener('mousemove', handleVideoCropMouseMove)
      window.addEventListener('mouseup', handleVideoCropMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleVideoCropMouseMove)
        window.removeEventListener('mouseup', handleVideoCropMouseUp)
      }
    }
  }, [isVideoDragging, isVideoResizing, handleVideoCropMouseMove, handleVideoCropMouseUp])

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
      
      // Update the profile with video URL and crop data
      updateProfile({ avatar_video_url: finalVideoUrl, avatar_video_crop: videoCropBox })
      
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
      updateProfile({ avatar_url: publicUrl })
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
    if (layout === "hero" && (theme.background_type === "image" || theme.background_type === "gradient")) return
    updateTheme({ header_layout: layout } as any)
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
        <Button variant="outline" onClick={() => setShowEditModal(true)} disabled={uploading} className="h-9 rounded-lg" data-avatar-edit>
          <ImageIcon className="h-4 w-4 mr-2" />
          {uploading ? "Uploading..." : "Edit"}
        </Button>
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

      {/* Video Crop Modal */}
      <Dialog open={showVideoCropModal} onOpenChange={(open) => { 
        setShowVideoCropModal(open)
        if (!open) {
          if (tempVideoUrl && tempVideoFile) URL.revokeObjectURL(tempVideoUrl)
          setTempVideoUrl(null)
          setTempVideoFile(null)
          setIsVideoDragging(false)
          setIsVideoResizing(null)
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
                <div
                  ref={videoCropContainerRef}
                  className="relative mx-auto bg-black rounded-xl overflow-hidden select-none"
                  style={{ width: '300px', height: '400px' }}
                >
                  <video
                    ref={videoPreviewRef}
                    src={tempVideoUrl}
                    className="w-full h-full object-cover pointer-events-none"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                  {/* Dark overlay outside crop area */}
                  <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)' }} />
                  
                  {/* Crop box - draggable */}
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
                    onMouseDown={(e) => handleVideoCropMouseDown(e, 'drag')}
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
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'top-left')}
                    />
                    <div 
                      className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-ne-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'top-right')}
                    />
                    <div 
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-sw-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'bottom-left')}
                    />
                    <div 
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'bottom-right')}
                    />
                    
                    {/* Edge resize handles */}
                    <div 
                      className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-white/80 rounded cursor-n-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'top')}
                    />
                    <div 
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-white/80 rounded cursor-s-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'bottom')}
                    />
                    <div 
                      className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-8 bg-white/80 rounded cursor-w-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'left')}
                    />
                    <div 
                      className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-8 bg-white/80 rounded cursor-e-resize z-10"
                      onMouseDown={(e) => handleVideoCropMouseDown(e, 'resize', 'right')}
                    />
                  </div>
                </div>
                
                <p className="text-xs text-center text-gray-500">Drag to move, use corners to resize</p>
                
                <Button onClick={handleVideoCropSave} className="w-full bg-black hover:bg-gray-800 text-white h-12 rounded-xl" disabled={uploadingVideo}>
                  {uploadingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
                </Button>
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

      <div className="space-y-3">
        <Label className="text-sm font-medium">Profile image layout</Label>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button onClick={() => handleLayoutChange("classic")} className={cn("border-2 rounded-xl p-4 md:p-5 flex flex-col items-center gap-2 md:gap-3 transition-all", effectiveLayout === "classic" ? "border-foreground bg-white" : "border-gray-200 hover:border-gray-300")}>
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"><User className="h-5 w-5 text-gray-400" /></div>
            <span className="text-xs md:text-sm font-medium">Classic</span>
          </button>
          <button onClick={() => handleLayoutChange("hero")} disabled={theme.background_type === "image" || theme.background_type === "gradient"} className={cn("border-2 rounded-xl p-4 md:p-5 flex flex-col items-center gap-2 md:gap-3 transition-all relative", effectiveLayout === "hero" ? "border-foreground bg-white" : "border-gray-200 hover:border-gray-300", (theme.background_type === "image" || theme.background_type === "gradient") && "opacity-50 cursor-not-allowed")}>
            <div className="w-full h-10 bg-gradient-to-b from-gray-300 to-gray-100 rounded-lg flex items-end justify-center pb-1"><Move className="h-4 w-4 text-gray-400" /></div>
            <span className="text-xs md:text-sm font-medium">Hero</span>
          </button>
        </div>
        {theme.background_type === "image" && <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">Hero layout is disabled when using an image wallpaper.</p>}
        {theme.background_type === "gradient" && <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">Hero layout is disabled when using a gradient wallpaper.</p>}
        {effectiveLayout === "hero" && theme.background_type === "solid" && <p className="text-xs text-muted-foreground">Hero displays your avatar as a full-width background with fade</p>}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Display Name</Label>
        <Input value={onepage.title} onChange={(e) => updateProfile({ title: e.target.value })} placeholder="Your name" className="h-10 rounded-lg" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Bio</Label>
        <Input value={onepage.bio || ""} onChange={(e) => updateProfile({ bio: e.target.value })} placeholder="A short bio..." className="h-10 rounded-lg" />
      </div>
    </div>
  )
}

function ThemeSection() {
  const { onepage, updateTheme } = useOnePage()
  const [filter, setFilter] = useState<"all" | "light" | "dark" | "gradient" | "image">("all")
  const [showLayoutChangeDialog, setShowLayoutChangeDialog] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<typeof THEME_TEMPLATES[0] | null>(null)

  if (!onepage) return null
  const { theme } = onepage
  const currentHeaderLayout = (theme as any).header_layout || "classic"

  const handleApplyTemplate = (template: typeof THEME_TEMPLATES[0]) => {
    const config = template.theme_config
    const needsClassicLayout = config.background_type === "gradient" || config.background_type === "image"
    
    // If current layout is Hero and new template has gradient/image background, show dialog
    if (needsClassicLayout && currentHeaderLayout === "hero") {
      setPendingTemplate(template)
      setShowLayoutChangeDialog(true)
      return
    }
    
    // Apply template, ensuring Classic layout for gradient/image backgrounds
    const updatedConfig = { ...config, template_id: template.id }
    if (needsClassicLayout) {
      (updatedConfig as any).header_layout = "classic"
    }
    updateTheme(updatedConfig)
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
          const bgStyle = config.background_type === "image" && config.background_image_url 
            ? { backgroundImage: `url(${config.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: config.background_type === "gradient" && config.background_gradient ? config.background_gradient : config.background_color }
          return (
            <button key={template.id} onClick={() => handleApplyTemplate(template)} className={cn("relative rounded-2xl overflow-hidden aspect-[3/4] transition-all group", isSelected ? "ring-2 ring-violet-500 ring-offset-2" : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-1")}>
              <div className="absolute inset-0" style={bgStyle} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full" style={{ backgroundColor: `${config.text_color}30` }} />
                <div className="w-12 md:w-16 h-1.5 md:h-2 rounded" style={{ backgroundColor: `${config.text_color}50` }} />
                <div className="w-8 md:w-12 h-1 rounded" style={{ backgroundColor: `${config.text_color}30` }} />
                <div className="w-full max-w-[60px] md:max-w-[80px] h-5 md:h-6 rounded-md mt-2" style={{ backgroundColor: config.button_color, borderWidth: config.button_border_width, borderColor: config.button_border_color, borderRadius: `${config.button_border_radius}px` }} />
              </div>
              {isSelected && <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent">
                <p className="text-[10px] md:text-xs font-medium text-white text-center">{template.name}</p>
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

function WallpaperSection() {
  const { onepage, updateTheme } = useOnePage()
  const [uploading, setUploading] = useState(false)
  const [showLayoutChangeDialog, setShowLayoutChangeDialog] = useState(false)
  const [pendingBgType, setPendingBgType] = useState<"gradient" | "image" | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleBgTypeChange = (type: "solid" | "gradient" | "image") => {
    // If switching to gradient or image and Hero layout is active, show dialog
    if ((type === "gradient" || type === "image") && currentHeaderLayout === "hero") {
      setPendingBgType(type)
      setShowLayoutChangeDialog(true)
      return
    }
    
    updateTheme({ background_type: type })
  }

  const handleConfirmLayoutChange = () => {
    if (pendingBgType) {
      updateTheme({ background_type: pendingBgType, header_layout: "classic" } as any)
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
        <div className="grid grid-cols-3 gap-2">
          {(["solid", "gradient", "image"] as const).map((type) => (
            <button key={type} onClick={() => handleBgTypeChange(type)} className={cn("py-3 md:py-3.5 rounded-xl border-2 text-xs md:text-sm font-medium capitalize transition-colors", theme.background_type === type ? "border-foreground bg-gray-50" : "border-gray-200 hover:border-gray-300")}>{type}</button>
          ))}
        </div>
      </div>

      {theme.background_type === "solid" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Background color</Label>
          <div className="flex items-center gap-3 p-3 border rounded-xl">
            <Input type="color" value={theme.background_color} onChange={(e) => updateTheme({ background_color: e.target.value })} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
            <Input value={theme.background_color} onChange={(e) => updateTheme({ background_color: e.target.value })} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" />
          </div>
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
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={gradientInfo.color1} 
                      onChange={(e) => handleGradientChange(gradientInfo.direction, e.target.value, gradientInfo.color2)} 
                      className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" 
                    />
                    <Input 
                      value={gradientInfo.color1} 
                      onChange={(e) => handleGradientChange(gradientInfo.direction, e.target.value, gradientInfo.color2)} 
                      className="flex-1 font-mono text-xs h-8" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={gradientInfo.color2} 
                      onChange={(e) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, e.target.value)} 
                      className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" 
                    />
                    <Input 
                      value={gradientInfo.color2} 
                      onChange={(e) => handleGradientChange(gradientInfo.direction, gradientInfo.color1, e.target.value)} 
                      className="flex-1 font-mono text-xs h-8" 
                    />
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
            <Switch
              checked={theme.animated_gradient || false}
              onCheckedChange={(checked) => updateTheme({ animated_gradient: checked })}
            />
          </div>

          {/* Noise Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h.01M12 12h.01M16 12h.01M8 8h.01M12 8h.01M16 8h.01M8 16h.01M12 16h.01M16 16h.01" />
              </svg>
              <span className="text-sm font-medium">Noise</span>
            </div>
            <Switch
              checked={theme.gradient_noise || false}
              onCheckedChange={(checked) => updateTheme({ gradient_noise: checked })}
            />
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
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12h.01M12 12h.01M16 12h.01M8 8h.01M12 8h.01M16 8h.01M8 16h.01M12 16h.01M16 16h.01" />
                  </svg>
                  <span className="text-sm font-medium">Noise</span>
                </div>
                <Switch 
                  checked={(theme as any).image_noise || false} 
                  onCheckedChange={(checked) => updateTheme({ image_noise: checked } as any)} 
                />
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
  const [fontFilter, setFontFilter] = useState<"all" | "sans" | "serif" | "display" | "mono" | "handwritten">("all")
  const [fontSearch, setFontSearch] = useState("")

  if (!onepage) return null
  const { theme } = onepage

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
              <p className="font-medium" style={{ fontFamily: theme.font_family }}>{theme.font_family}</p>
              <p className="text-xs text-muted-foreground">{FONTS.find(f => f.name === theme.font_family)?.style || "Custom"}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </button>
      </div>
      <Dialog open={showFontModal} onOpenChange={setShowFontModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-lg font-semibold">Choose Font</DialogTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} placeholder="Search fonts..." className="pl-9 h-10" />
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {FONT_CATEGORIES.map((cat) => (
                <button key={cat.id} onClick={() => setFontFilter(cat.id as any)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors", fontFilter === cat.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{cat.label}</button>
              ))}
            </div>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[400px] p-2">
            {filteredFonts.map((font) => (
              <button key={font.name} onClick={() => { updateTheme({ font_family: font.name }); setShowFontModal(false) }} className={cn("w-full p-3 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors", theme.font_family === font.name && "bg-violet-50")}>
                <div><p style={{ fontFamily: font.name }} className="text-base">{font.name}</p><p className="text-xs text-muted-foreground">{font.style}</p></div>
                {theme.font_family === font.name && <Check className="h-5 w-5 text-violet-500" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Text color</Label>
        <div className="flex items-center gap-3 p-3 border rounded-xl">
          <Input type="color" value={theme.text_color} onChange={(e) => updateTheme({ text_color: e.target.value })} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
          <Input value={theme.text_color} onChange={(e) => updateTheme({ text_color: e.target.value })} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Secondary text color</Label>
        <div className="flex items-center gap-3 p-3 border rounded-xl">
          <Input type="color" value={theme.secondary_text_color || theme.text_color} onChange={(e) => updateTheme({ secondary_text_color: e.target.value })} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
          <Input value={theme.secondary_text_color || theme.text_color} onChange={(e) => updateTheme({ secondary_text_color: e.target.value })} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" />
        </div>
      </div>
    </div>
  )
}

function ButtonsSection() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const { theme } = onepage

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Buttons</h2>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Style</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["filled", "outline", "glass"] as const).map((style) => (
            <button key={style} onClick={() => updateTheme({ button_style: style })} className={cn("py-3 md:py-3.5 rounded-xl border-2 text-xs md:text-sm font-medium capitalize transition-colors", theme.button_style === style ? "border-foreground bg-gray-50" : "border-gray-200 hover:border-gray-300")}>{style === "filled" ? "Solid" : style}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Button color</Label>
        <div className="flex items-center gap-3 p-3 border rounded-xl">
          <Input type="color" value={theme.button_color} onChange={(e) => updateTheme({ button_color: e.target.value })} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
          <Input value={theme.button_color} onChange={(e) => updateTheme({ button_color: e.target.value })} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center"><Label className="text-sm font-medium">Corners</Label><span className="text-sm text-muted-foreground">{theme.button_border_radius}px</span></div>
        <Slider value={[theme.button_border_radius]} onValueChange={([value]) => updateTheme({ button_border_radius: value })} min={0} max={24} step={2} />
        <div className="flex justify-between text-xs text-muted-foreground"><span>Square</span><span>Round</span></div>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center"><Label className="text-sm font-medium">Border width</Label><span className="text-sm text-muted-foreground">{theme.button_border_width}px</span></div>
        <Slider value={[theme.button_border_width]} onValueChange={([value]) => updateTheme({ button_border_width: value })} min={0} max={4} step={1} />
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Border color</Label>
        <div className="flex items-center gap-3 p-3 border rounded-xl">
          <Input type="color" value={theme.button_border_color} onChange={(e) => updateTheme({ button_border_color: e.target.value })} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
          <Input value={theme.button_border_color} onChange={(e) => updateTheme({ button_border_color: e.target.value })} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" />
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
        <Label className="text-sm font-medium">Icon style</Label>
        <div className="grid grid-cols-3 gap-2">
          {SOCIAL_STYLES.map((style) => (
            <Button key={style.id} variant={socialStyle === style.id ? "default" : "outline"} onClick={() => updateTheme({ social_icon_style: style.id } as any)} className="h-auto py-3 flex-col gap-1">
              <span className="text-sm font-medium">{style.label}</span>
              <span className="text-[10px] opacity-70">{style.description}</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Icon color</Label>
        <div className="flex items-center gap-3 p-3 border rounded-xl">
          <Input type="color" value={socialColor} onChange={(e) => updateTheme({ social_icon_color: e.target.value } as any)} className="w-10 h-10 p-0.5 cursor-pointer rounded-lg border-0" />
          <Input value={socialColor} onChange={(e) => updateTheme({ social_icon_color: e.target.value } as any)} className="flex-1 border-0 bg-transparent font-mono h-8 text-sm" placeholder="#000000" />
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

  return (
    <div className="space-y-6 md:space-y-8">
      <h2 className="text-lg md:text-xl font-semibold">Footer</h2>
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between p-3 md:p-4 border rounded-xl">
          <div><p className="font-medium text-sm">Show Materia branding</p><p className="text-xs text-muted-foreground mt-0.5">Display "Powered by Materia"</p></div>
          <Switch checked={settings.show_branding} onCheckedChange={(checked) => updateSettings({ show_branding: checked })} />
        </div>
        <div className="flex items-center justify-between p-3 md:p-4 border rounded-xl">
          <div><p className="font-medium text-sm">Analytics</p><p className="text-xs text-muted-foreground mt-0.5">Track page views</p></div>
          <Switch checked={settings.analytics_enabled} onCheckedChange={(checked) => updateSettings({ analytics_enabled: checked })} />
        </div>
      </div>
    </div>
  )
}
