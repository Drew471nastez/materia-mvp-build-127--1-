"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useOnePage } from "@/lib/onepage/context"
import { createClient } from "@/lib/supabase/client"
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Youtube,
  Loader2,
  Pencil
} from "lucide-react"

// Storelib logo URL
const STORELIB_LOGO_URL = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

// Goal icon image URLs
const GOAL_ICON_URLS = {
  general: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20de121sign.svg",
  artist: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12115.svg",
  digital: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12551.svg",
  business: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/53112.svg",
}

// Theme templates - exact copy from design-tab.tsx
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
    share_style: "white",
    subscribe_style: "white",
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
    light_button_text_color: "#0f172a",
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
      laser_glow_enabled: false,
      background_pattern: "grid",
      pattern_opacity: "low",
      pattern_color: "#c9c9c990",
    },
    solid_button_text_color: "#7c3aed",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
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
      background_pattern: "waves",
      pattern_opacity: "low",
      pattern_color: "#428ad790",
    },
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
      background_pattern: "organic",
      pattern_opacity: "low",
      pattern_color: "#ffcccc90",
    },
    share_style: "white",
    subscribe_style: "white",
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
      header_layout: "hero",
      laser_glow_enabled: false,
      button_hover_animation: "zoom",
      allowed_patterns: ["none", "stars"],
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "medium",
    },
    profile_layout: "hero" as const,
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
      button_text_color: "#fffbeb",
      button_style: "outline" as const,
      button_border_radius: 24,
      button_border_width: 2,
      button_border_color: "#1c1917",
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
    share_style: "black",
    subscribe_style: "black",
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
      image_brightness: 60,
      image_noise: true,
      noise_strength: 40,
    },
    profile_layout: "classic" as const,
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
]

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

// Confetti animation component
function Confetti({ show }: { show: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!show || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa", "#f472b6", "#34d399", "#60a5fa", "#fbbf24", "#8b5cf6", "#ec4899"]
    const confettiPieces: Array<{
      x: number
      y: number
      rotation: number
      color: string
      size: number
      speedX: number
      speedY: number
      rotationSpeed: number
      shape: "rect" | "circle"
      opacity: number
    }> = []

    // Create confetti from left and right - more pieces for visibility
    for (let i = 0; i < 200; i++) {
      const fromLeft = i % 2 === 0
      confettiPieces.push({
        x: fromLeft ? -20 : canvas.width + 20,
        y: Math.random() * canvas.height * 0.5,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 12 + 6, // Slightly larger pieces
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 10 + 5),
        speedY: Math.random() * 4 - 2,
        rotationSpeed: Math.random() * 10 - 5,
        shape: Math.random() > 0.5 ? "rect" : "circle",
        opacity: 1,
      })
    }

    let animationId: number
    let frame = 0
    const maxFrames = 330 // 5.5 seconds at 60fps (2 seconds more)

    const animate = () => {
      if (frame >= maxFrames) {
        cancelAnimationFrame(animationId)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      confettiPieces.forEach((piece) => {
        // Fade out in last 60 frames
        const fadeStart = maxFrames - 60
        if (frame > fadeStart) {
          piece.opacity = 1 - (frame - fadeStart) / 60
        }

        ctx.save()
        ctx.globalAlpha = piece.opacity
        ctx.translate(piece.x, piece.y)
        ctx.rotate((piece.rotation * Math.PI) / 180)
        ctx.fillStyle = piece.color

        if (piece.shape === "rect") {
          ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, piece.size / 3, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()

        // Update position with smoother animation
        piece.x += piece.speedX * (frame < 90 ? 1 : 0.97)
        piece.y += piece.speedY
        piece.speedY += 0.12 // gentler gravity
        piece.speedX *= 0.995 // gentler air resistance
        piece.rotation += piece.rotationSpeed
      })

      frame++
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [show])

  if (!show) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[99999]"
      style={{ width: "100vw", height: "100vh" }}
    />
  )
}

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
  onComplete: (data: OnboardingData) => void
}

interface OnboardingData {
  displayName: string
  bio: string
  slug: string
  goal: "general" | "artist" | "digital" | "business"
  socials: {
    instagram: string
    tiktok: string
    youtube: string
  }
  avatarUrl: string | null
  templateId: string
}

export function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const { onepage, updateProfile, updateTheme, updateSocialLinks, addBlock, removeBlock } = useOnePage()
  const [currentStep, setCurrentStep] = useState(1)
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right")

  // Step 1 state
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  // Step 2 state
  const [selectedGoal, setSelectedGoal] = useState<"general" | "artist" | "digital" | "business" | null>(null)
  const [loadedGoalIcons, setLoadedGoalIcons] = useState<Set<string>>(new Set())

  // Step 3 state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [socials, setSocials] = useState({
    instagram: "",
    tiktok: "",
    youtube: "",
  })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Step 4 state
  const [selectedTemplate, setSelectedTemplate] = useState("default")
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselAnimating, setCarouselAnimating] = useState(false)
  const [carouselDirection, setCarouselDirection] = useState<"left" | "right">("right")

  // Step 5 state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupPhase, setSetupPhase] = useState<"setting-up" | "just-a-moment" | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Crop state
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const cropContainerRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  // Initialize with existing data
  useEffect(() => {
    if (open && onepage) {
      setDisplayName(onepage.title || "")
      setBio(onepage.bio || "")
      setAvatarUrl(onepage.avatar_url || null)

      // Try to get from localStorage or profile
      const fetchInitialData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            // Try Google profile name
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name, username, avatar_url")
              .eq("id", user.id)
              .single()

            if (profile) {
              if (!displayName && profile.display_name) {
                setDisplayName(profile.display_name)
              }
              if (!avatarUrl && profile.avatar_url) {
                setAvatarUrl(profile.avatar_url)
              }
            }

            // Try Store Builder seller name
            const { data: seller } = await supabase
              .from("creators")
              .select("store_name, avatar_url")
              .eq("user_id", user.id)
              .single()

            if (seller) {
              if (!displayName && seller.store_name) {
                setDisplayName(seller.store_name)
              }
              if (!avatarUrl && seller.avatar_url) {
                setAvatarUrl(seller.avatar_url)
              }
            }
          }
        } catch (e) {
          console.error("Error fetching initial data:", e)
        }
      }

      fetchInitialData()
    }
  }, [open, onepage])

  // Check username availability
  useEffect(() => {
    if (!displayName.trim()) {
      setUsernameAvailable(null)
      return
    }

    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    if (!slug) {
      setUsernameAvailable(null)
      return
    }

    const checkAvailability = async () => {
      setCheckingUsername(true)
      try {
        const { data: existing } = await supabase
          .from("onepages")
          .select("id")
          .eq("slug", slug)
          .neq("id", onepage?.id || "")
          .single()

        setUsernameAvailable(!existing)
      } catch {
        setUsernameAvailable(true)
      } finally {
        setCheckingUsername(false)
      }
    }

    const timer = setTimeout(checkAvailability, 500)
    return () => clearTimeout(timer)
  }, [displayName, onepage?.id])

  // Handle avatar file selection
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    setTempImageUrl(url)
    setAvatarFile(file)
    setShowCropModal(true)
  }

  // Handle crop completion
  const handleCropComplete = async () => {
    if (!tempImageUrl || !avatarFile || !cropContainerRef.current) return

    setUploadingAvatar(true)

    try {
      // Create cropped image
      const img = new Image()
      img.src = tempImageUrl
      await new Promise((resolve) => { img.onload = resolve })

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Set output size
      const outputSize = 400
      canvas.width = outputSize
      canvas.height = outputSize

      // Calculate crop dimensions for object-fit: cover behavior
      const container = cropContainerRef.current
      const containerRect = container.getBoundingClientRect()
      const containerWidth = containerRect.width
      const containerHeight = containerRect.height

      // Calculate how the image is displayed with object-fit: cover
      const imageAspect = img.naturalWidth / img.naturalHeight
      const containerAspect = containerWidth / containerHeight

      let displayWidth, displayHeight, offsetX, offsetY

      if (imageAspect > containerAspect) {
        // Image is wider - height fills container, width is cropped
        displayHeight = containerHeight
        displayWidth = containerHeight * imageAspect
        offsetX = (displayWidth - containerWidth) / 2
        offsetY = 0
      } else {
        // Image is taller - width fills container, height is cropped
        displayWidth = containerWidth
        displayHeight = containerWidth / imageAspect
        offsetX = 0
        offsetY = (displayHeight - containerHeight) / 2
      }

      // Scale factor from display size to natural size
      const scale = img.naturalWidth / displayWidth

      // Calculate source coordinates in natural image pixels
      const sourceX = (cropBox.x + offsetX - cropBox.size / 2) * scale
      const sourceY = (cropBox.y + offsetY - cropBox.size / 2) * scale
      const sourceSize = cropBox.size * scale

      ctx.drawImage(
        img,
        Math.max(0, sourceX),
        Math.max(0, sourceY),
        sourceSize,
        sourceSize,
        0,
        0,
        outputSize,
        outputSize
      )

      // Convert to blob and upload
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const fileName = `onepage-avatar-${user.id}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      setAvatarUrl(publicUrl)
      setShowCropModal(false)
      setTempImageUrl(null)
      setAvatarFile(null)
    } catch (e) {
      console.error("Error uploading avatar:", e)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Handle crop drag
  const handleCropMouseDown = (e: React.MouseEvent, resize?: boolean) => {
    e.preventDefault()
    setDragStart({ x: e.clientX, y: e.clientY })
    if (resize) {
      setIsResizing(true)
    } else {
      setIsDragging(true)
    }
  }

  // Touch handlers for crop
  const handleCropTouchStart = (e: React.TouchEvent, resize?: boolean) => {
    const touch = e.touches[0]
    if (!touch) return
    setDragStart({ x: touch.clientX, y: touch.clientY })
    if (resize) {
      setIsResizing(true)
    } else {
      setIsDragging(true)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizing) return
      if (!cropContainerRef.current) return

      const container = cropContainerRef.current
      const rect = container.getBoundingClientRect()

      if (isDragging) {
        const newX = Math.max(cropBox.size / 2, Math.min(rect.width - cropBox.size / 2, e.clientX - rect.left))
        const newY = Math.max(cropBox.size / 2, Math.min(rect.height - cropBox.size / 2, e.clientY - rect.top))
        setCropBox((prev) => ({ ...prev, x: newX, y: newY }))
      } else if (isResizing) {
        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y
        const delta = Math.max(dx, dy)
        const newSize = Math.max(50, Math.min(Math.min(rect.width, rect.height) - 20, cropBox.size + delta))
        setCropBox((prev) => ({ ...prev, size: newSize }))
        setDragStart({ x: e.clientX, y: e.clientY })
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging && !isResizing) return
      if (!cropContainerRef.current) return
      const touch = e.touches[0]
      if (!touch) return

      e.preventDefault()
      const container = cropContainerRef.current
      const rect = container.getBoundingClientRect()

      if (isDragging) {
        const newX = Math.max(cropBox.size / 2, Math.min(rect.width - cropBox.size / 2, touch.clientX - rect.left))
        const newY = Math.max(cropBox.size / 2, Math.min(rect.height - cropBox.size / 2, touch.clientY - rect.top))
        setCropBox((prev) => ({ ...prev, x: newX, y: newY }))
      } else if (isResizing) {
        const dx = touch.clientX - dragStart.x
        const dy = touch.clientY - dragStart.y
        const delta = Math.max(dx, dy)
        const newSize = Math.max(50, Math.min(Math.min(rect.width, rect.height) - 20, cropBox.size + delta))
        setCropBox((prev) => ({ ...prev, size: newSize }))
        setDragStart({ x: touch.clientX, y: touch.clientY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      window.addEventListener("touchmove", handleTouchMove, { passive: false })
      window.addEventListener("touchend", handleMouseUp)
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleMouseUp)
    }
  }, [isDragging, isResizing, cropBox, dragStart])

  // Get slug from display name
  const getSlug = () => {
    return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  // Check if can proceed to next step
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return selectedGoal !== null
      case 3:
        return true // Can skip
      case 4:
        return true // Template is always selected
      default:
        return false
    }
  }

  // Check if can skip
  const canSkip = () => {
    switch (currentStep) {
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return false // Must select a goal
      case 3:
        return true // Can skip socials
      case 4:
        return false // Must select template (but always has default)
      default:
        return false
    }
  }

  // Handle next step
  const handleNext = () => {
    if (!canProceed()) return

    setSlideDirection("right")
    setIsAnimating(true)
    setTimeout(() => {
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1)
      } else {
        startSetup()
      }
      setIsAnimating(false)
    }, 200)
  }

  // Handle back step
  const handleBack = () => {
    if (currentStep <= 1) return

    setSlideDirection("left")
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(currentStep - 1)
      setIsAnimating(false)
    }, 200)
  }

  // Handle skip
  const handleSkip = () => {
    if (!canSkip()) return
    handleNext()
  }

  // Start setup process
  const startSetup = async () => {
    setCurrentStep(5)
    setIsSettingUp(true)
    setSetupPhase("setting-up")

    // Wait 6 seconds - "We're setting things up..."
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Change to "Just a moment..." phase
    setSetupPhase("just-a-moment")

    // Apply all changes
    try {
      // Update profile
      await updateProfile({
        title: displayName,
        bio: bio,
        avatar_url: avatarUrl,
      })

      // Update social links
      const socialUpdates: Record<string, string | null> = {}
      if (socials.instagram) socialUpdates.instagram = socials.instagram
      if (socials.tiktok) socialUpdates.tiktok = socials.tiktok
      if (socials.youtube) socialUpdates.youtube = socials.youtube
      if (Object.keys(socialUpdates).length > 0) {
        await updateSocialLinks(socialUpdates)
      }

      // Apply theme
      const template = THEME_TEMPLATES.find((t) => t.id === selectedTemplate)
      if (template) {
        await updateTheme(template.theme_config as any)
      }

      // Create blocks based on goal
      await createBlocksForGoal(selectedGoal || "general")

    } catch (e) {
      console.error("Error during setup:", e)
    }

    // Wait 3 more seconds - "Just a moment..."
    await new Promise((resolve) => setTimeout(resolve, 3000))

    setIsSettingUp(false)
    setSetupPhase(null)
    setSetupComplete(true)
    setShowConfetti(true)

    // Auto close after animation
    setTimeout(() => {
      onComplete({
        displayName,
        bio,
        slug: getSlug(),
        goal: selectedGoal || "general",
        socials,
        avatarUrl,
        templateId: selectedTemplate,
      })
    }, 4000)
  }

  // Create blocks based on goal selection
  const createBlocksForGoal = async (goal: "general" | "artist" | "digital" | "business") => {
    // Remove existing blocks except header
    const existingBlocks = onepage?.draft_blocks || []
    for (const block of existingBlocks) {
      if (block.type !== "header") {
        removeBlock(block.id)
      }
    }

    switch (goal) {
      case "general":
        addBlock("social_row")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break

      case "artist":
        addBlock("social_row")
        addBlock("link_button")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break

      case "digital":
        addBlock("social_row")
        addBlock("product")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break

      case "business":
        addBlock("social_row")
        addBlock("link_button")
        addBlock("link_button")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break
    }
  }

  // Progress bar width
  const progressWidth = (currentStep / 5) * 100

  // Template carousel - show 4 per page
  const templatesPerPage = 4
  const maxCarouselIndex = Math.ceil(THEME_TEMPLATES.length / templatesPerPage) - 1

  const visibleTemplates = THEME_TEMPLATES.slice(
    carouselIndex * templatesPerPage,
    (carouselIndex + 1) * templatesPerPage
  )

  // Carousel navigation with smooth animation
  const handleCarouselPrev = () => {
    if (carouselIndex > 0 && !carouselAnimating) {
      setCarouselAnimating(true)
      setCarouselDirection("left")
      setTimeout(() => {
        setCarouselIndex(carouselIndex - 1)
        setTimeout(() => setCarouselAnimating(false), 50)
      }, 150)
    }
  }

  const handleCarouselNext = () => {
    if (carouselIndex < maxCarouselIndex && !carouselAnimating) {
      setCarouselAnimating(true)
      setCarouselDirection("right")
      setTimeout(() => {
        setCarouselIndex(carouselIndex + 1)
        setTimeout(() => setCarouselAnimating(false), 50)
      }, 150)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden border-0",
            // Desktop: centered modal with exact specs - 948px width, 550px height
            "sm:w-[930px] sm:max-w-[930px] sm:h-[540px] sm:rounded-[44px]",
            // Mobile: full screen white
            "w-full h-full max-sm:rounded-none max-sm:max-w-none",
            // Shadow
            "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
            // Hide the close button
            "[&>button]:hidden"
          )}
          style={{
            // @ts-ignore
            "--tw-backdrop-blur": "blur(8px)",
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col h-full bg-white">
            {/* Progress bar - centered, 8px height, more border radius */}
            <div className="flex justify-center pt-8">
              <div className="w-[200px] h-[8px] bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            <div className={cn(
              "flex-1 overflow-y-auto transition-all duration-200 px-12 pt-6",
              isAnimating && slideDirection === "right" && "opacity-0 translate-x-4",
              isAnimating && slideDirection === "left" && "opacity-0 -translate-x-4"
            )}>
              {/* Step 1: Let's get started */}
              {currentStep === 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-8">
                    <h1 className="text-[42px] font-bold leading-tight">
                      Let's get started <span className="inline-block">👋</span>
                    </h1>
                    <p className="text-gray-500 text-base mt-2">
                      Start with your name — everything can be changed later
                    </p>
                  </div>

                  {/* Input fields - centered, max width 600px */}
                  <div className="w-full max-w-[600px] space-y-4">
                    {/* Username input */}
                    <div className="relative">
                      <div className={cn(
                        "flex items-center gap-3 px-5 h-[56px] rounded-[14px] transition-all",
                        usernameFocused
                          ? "bg-white ring-2 ring-black"
                          : "bg-[#F3F3F3]"
                      )}>
                        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          onFocus={() => setUsernameFocused(true)}
                          onBlur={() => setUsernameFocused(false)}
                          placeholder="Your name"
                          className="flex-1 text-base outline-none bg-transparent"
                        />
                        {checkingUsername && (
                          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        )}
                        {!checkingUsername && usernameAvailable === true && displayName && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                        {!checkingUsername && usernameAvailable === false && displayName && (
                          <X className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      {usernameAvailable === false && (
                        <p className="text-red-500 text-xs mt-1.5 ml-1">This name is not available</p>
                      )}
                    </div>

                    {/* URL preview */}
                    <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3]">
                      <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="text-base">
                        <span className="text-black font-medium">{getSlug() || "username"}</span>
                        <span className="text-gray-400">.storelib.com/links</span>
                      </span>
                    </div>

                    {/* Bio input */}
                    <div className="flex items-start gap-3 px-5 py-4 min-h-[56px] rounded-[14px] bg-[#F3F3F3] focus-within:bg-white focus-within:ring-2 focus-within:ring-black transition-all">
                      <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us a few words about yourself"
                        rows={2}
                        className="flex-1 text-base outline-none bg-transparent resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Goal Selection */}
              {currentStep === 2 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-6">
                    <h1 className="text-[42px] font-bold leading-tight">
                      What's the goal here?
                    </h1>
                    <p className="text-gray-500 text-base mt-2">
                      We'll build your OnePage around this
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] grid grid-cols-2 gap-4">
                    {/* General */}
                    <button
                      onClick={() => setSelectedGoal("general")}
                      className={cn(
                        "p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "general"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">General</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Covers all goals - links, business, and socials.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("general") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.general}
                            alt="General"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("general") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("general"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Artist & Creator */}
                    <button
                      onClick={() => setSelectedGoal("artist")}
                      className={cn(
                        "p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "artist"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Artist & Creator</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Share my creative work with the world.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("artist") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.artist}
                            alt="Artist"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("artist") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("artist"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Digital Products */}
                    <button
                      onClick={() => setSelectedGoal("digital")}
                      className={cn(
                        "p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "digital"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Digital Products</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Sell my digital products to anyone.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("digital") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.digital}
                            alt="Digital"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("digital") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("digital"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Business */}
                    <button
                      onClick={() => setSelectedGoal("business")}
                      className={cn(
                        "p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "business"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Business</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Grow my business & convert customers.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("business") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.business}
                            alt="Business"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("business") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("business"))}
                          />
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* None of these option */}
                  <button
                    onClick={() => setSelectedGoal("general")}
                    className="text-sm text-gray-500 hover:text-gray-700 mt-4 py-2"
                  >
                    None of these
                  </button>
                </div>
              )}

              {/* Step 3: Socials & Profile */}
              {currentStep === 3 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-8">
                    <h1 className="text-[42px] font-bold leading-tight">
                      Add your socials
                    </h1>
                    <p className="text-gray-500 text-base mt-2">
                      These will appear on your OnePage
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] flex gap-8">
                    {/* Avatar section */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="w-24 h-24 rounded-full bg-[#F3F3F3] flex items-center justify-center overflow-hidden border-2 border-gray-200"
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl font-bold text-gray-400">
                            {displayName.charAt(0).toUpperCase() || "A"}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="mt-3 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Social inputs */}
                    <div className="flex-1 space-y-3">
                      {/* Instagram */}
                      <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3] focus-within:bg-white focus-within:ring-2 focus-within:ring-black transition-all">
                        <Instagram className="w-5 h-5 text-pink-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.instagram}
                          onChange={(e) => setSocials({ ...socials, instagram: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* TikTok */}
                      <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3] focus-within:bg-white focus-within:ring-2 focus-within:ring-black transition-all">
                        <TikTokIcon className="w-5 h-5 shrink-0" />
                        <input
                          type="text"
                          value={socials.tiktok}
                          onChange={(e) => setSocials({ ...socials, tiktok: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* YouTube */}
                      <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3] focus-within:bg-white focus-within:ring-2 focus-within:ring-black transition-all">
                        <Youtube className="w-5 h-5 text-red-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.youtube}
                          onChange={(e) => setSocials({ ...socials, youtube: e.target.value })}
                          placeholder="youtube.com/@username"
                          className="flex-1 text-base outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Template Selection */}
              {currentStep === 4 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-6">
                    <h1 className="text-[42px] font-bold leading-tight">
                      Select a template
                    </h1>
                    <p className="text-gray-500 text-base mt-2">
                      Pick the style you want - you can change it later
                    </p>
                  </div>

                  {/* Carousel - with padding to prevent overflow */}
                  <div className="relative w-full max-w-[700px] px-8">
                    {/* Left arrow */}
                    <button
                      onClick={handleCarouselPrev}
                      disabled={carouselIndex === 0}
                      className={cn(
                        "absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-200",
                        carouselIndex === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:shadow-xl"
                      )}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Templates container with overflow hidden and padding for ring-offset */}
                    <div className="overflow-hidden px-1 py-4">
                      <div
                        className={cn(
                          "flex gap-3 transition-all duration-300 ease-out",
                          carouselAnimating && carouselDirection === "right" && "opacity-0 translate-x-8",
                          carouselAnimating && carouselDirection === "left" && "opacity-0 -translate-x-8"
                        )}
                      >
                        {visibleTemplates.map((template) => {
                          const isSelected = selectedTemplate === template.id

                          // Get pattern SVG based on theme
                          const getPatternOverlay = () => {
                            const pattern = template.theme_config.background_pattern
                            const patternColor = template.theme_config.pattern_color || "#ffffff"
                            const opacity = template.theme_config.pattern_opacity === "high" ? 0.3 :
                                           template.theme_config.pattern_opacity === "medium" ? 0.2 : 0.1

                            if (!pattern || pattern === "none") return null

                            if (pattern === "grid") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
                                    backgroundSize: "20px 20px",
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "stars") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `radial-gradient(${patternColor} 1px, transparent 1px)`,
                                    backgroundSize: "15px 15px",
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "waves") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21.184 20c.357-.13.72-.264 1.088-.402l1.768-.661C33.64 15.347 39.647 14 50 14c10.271 0 15.362 1.222 24.629 4.928.955.383 1.869.74 2.75 1.072h6.225c-2.51-.73-5.139-1.691-8.233-2.928C65.888 13.278 60.562 12 50 12c-10.626 0-16.855 1.397-26.66 5.063l-1.767.662c-2.475.923-4.66 1.674-6.724 2.275h6.335zm0-20C13.258 2.892 8.077 4 0 4V2c5.744 0 9.951-.574 14.85-2h6.334zM77.38 0C85.239 2.966 90.502 4 100 4V2c-6.842 0-11.386-.542-16.396-2h-6.225zM0 14c8.44 0 13.718-1.21 22.272-4.402l1.768-.661C33.64 5.347 39.647 4 50 4c10.271 0 15.362 1.222 24.629 4.928C84.112 12.722 89.438 14 100 14v-2c-10.271 0-15.362-1.222-24.629-4.928C65.888 3.278 60.562 2 50 2 39.374 2 33.145 3.397 23.34 7.063l-1.767.662C13.223 10.84 8.163 12 0 12v2z' fill='${encodeURIComponent(patternColor)}' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "zigzag") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='12' viewBox='0 0 40 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 6.172L6.172 0h5.656L0 11.828V6.172zm40 5.656L28.172 0h5.656L40 6.172v5.656zM6.172 12l12-12h3.656l12 12h-5.656L20 3.828 11.828 12H6.172zm12 0L0 .172V0h11.172l8.828 8.828L28.828 0H40v.172L21.828 12h-3.656z' fill='${encodeURIComponent(patternColor)}' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "organic") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='52' height='26' viewBox='0 0 52 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='${encodeURIComponent(patternColor)}' fill-opacity='0.4'%3E%3Cpath d='M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "morph") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `radial-gradient(ellipse at 20% 30%, ${patternColor} 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, ${patternColor} 0%, transparent 50%)`,
                                    opacity
                                  }}
                                />
                              )
                            }
                            return null
                          }

                          const bgStyle = template.theme_config.background_type === "gradient"
                            ? { background: template.theme_config.background_gradient }
                            : template.theme_config.background_type === "image"
                            ? {
                                backgroundImage: `url(${template.theme_config.background_image_url})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                            : { background: template.theme_config.background_color }

                          // Check if this is an image-type background
                          const isImageBg = template.theme_config.background_type === "image"

                          return (
                            <button
                              key={template.id}
                              onClick={() => setSelectedTemplate(template.id)}
                              className={cn(
                                "flex-1 min-w-[140px] aspect-[3/4] rounded-2xl overflow-hidden relative transition-all duration-300",
                                isSelected ? "ring-2 ring-purple-600 ring-offset-2" : ""
                              )}
                            >
                              {/* Background layer for image themes */}
                              {isImageBg && (
                                <div
                                  className="absolute inset-0 z-0"
                                  style={{
                                    backgroundImage: `url(${template.theme_config.background_image_url})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                />
                              )}

                              {/* Template preview */}
                              <div
                                className="w-full h-full p-3 flex flex-col items-center justify-center relative"
                                style={isImageBg ? {} : bgStyle}
                              >
                                {/* Dark overlay for image backgrounds so content is visible */}
                                {isImageBg && (
                                  <div className="absolute inset-0 bg-black/50 z-[1]" />
                                )}

                                {/* Pattern overlay */}
                                {getPatternOverlay()}

                                {/* Avatar preview */}
                                <div
                                  className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/30 relative z-10"
                                >
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span
                                      className="text-sm font-bold"
                                      style={{ color: template.theme_config.text_color }}
                                    >
                                      {displayName.charAt(0).toUpperCase() || "A"}
                                    </span>
                                  )}
                                </div>

                                {/* Name preview */}
                                <p
                                  className="text-xs font-semibold mt-2 truncate max-w-full relative z-10"
                                  style={{ color: template.theme_config.text_color }}
                                >
                                  {displayName || "Name"}
                                </p>

                                {/* Button preview */}
                                <div
                                  className="mt-3 w-full h-6 relative z-10"
                                  style={{
                                    background: template.theme_config.button_color,
                                    borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                  }}
                                />
                                <div
                                  className="mt-1.5 w-full h-6 relative z-10"
                                  style={{
                                    background: template.theme_config.button_color,
                                    borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                  }}
                                />
                              </div>

                              {/* Selected checkmark */}
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center z-20">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}

                              {/* Template name */}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 z-10">
                                <p className="text-white text-xs font-medium text-center">
                                  {template.name}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right arrow */}
                    <button
                      onClick={handleCarouselNext}
                      disabled={carouselIndex >= maxCarouselIndex}
                      className={cn(
                        "absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-200",
                        carouselIndex >= maxCarouselIndex ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:shadow-xl"
                      )}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Pagination dots */}
                  <div className="flex justify-center gap-1.5 mt-4">
                    {Array.from({ length: maxCarouselIndex + 1 }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          i === carouselIndex ? "bg-purple-600" : "bg-gray-300 hover:bg-gray-400"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Setup - centered content */}
              {currentStep === 5 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[350px]">
                  {/* Logo with pulse effect */}
                  <div className="relative mb-6">
                    {isSettingUp && (
                      <>
                        <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-purple-400/30 animate-ping" />
                        <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-purple-400/20 animate-pulse" />
                      </>
                    )}
                    <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-lg">
                      <img
                        src={STORELIB_LOGO_URL}
                        alt="Storelib"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Title - centered */}
                  <div className="text-center">
                    {isSettingUp && setupPhase === "setting-up" ? (
                      <div className="flex items-center justify-center gap-3">
                        <h1 className="text-2xl font-bold">
                          We're setting things up...
                        </h1>
                        <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : isSettingUp && setupPhase === "just-a-moment" ? (
                      <div className="flex items-center justify-center gap-3 animate-in fade-in duration-300">
                        <h1 className="text-2xl font-bold">
                          Just a moment...
                        </h1>
                        <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : setupComplete ? (
                      <div className="flex items-center justify-center gap-3 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-2xl font-bold">
                          Your OnePage is ready.
                        </h1>
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Quote - centered with purple accolades */}
                  <div className="mt-8 text-center max-w-sm">
                    <p className="text-gray-500 text-sm italic">
                      <span className="text-purple-600 font-medium not-italic">"</span>
                      Logic will get you from A to B. Imagination will take you everywhere.
                      <span className="text-purple-600 font-medium not-italic">"</span>
                    </p>
                    <p className="text-gray-400 text-xs mt-1">- Albert Einstein</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with buttons - Back on left, Skip/Next on right */}
            {currentStep < 5 && (
              <div className="px-12 pb-3 sm:pb-4 pt-3 flex items-center justify-between shrink-0">
                {/* Back button - left side */}
                <div>
                  {currentStep > 1 && (
                    <button
                      onClick={handleBack}
                      className="px-6 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                  )}
                </div>

                {/* Skip and Next buttons - right side */}
                <div className="flex items-center gap-4">
                  {canSkip() && (
                    <button
                      onClick={handleSkip}
                      className="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Skip
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={cn(
                      "px-8 py-3 rounded-lg font-semibold text-sm transition-all min-w-[140px]",
                      canProceed()
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 5 footer (no buttons, just padding) */}
            {currentStep === 5 && (
              <div className="h-16" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop Modal - more responsive */}
      <Dialog open={showCropModal} onOpenChange={setShowCropModal}>
        <DialogContent className="sm:max-w-md max-w-[95vw] p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Crop your photo</h2>
          </div>

          <div
            ref={cropContainerRef}
            className="relative w-full aspect-square max-h-[60vh] bg-gray-900 overflow-hidden cursor-move touch-none"
          >
            {tempImageUrl && (
              <>
                <img
                  src={tempImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement
                    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
                    // Center crop box
                    if (cropContainerRef.current) {
                      const rect = cropContainerRef.current.getBoundingClientRect()
                      setCropBox({
                        x: rect.width / 2,
                        y: rect.height / 2,
                        size: Math.min(rect.width, rect.height) * 0.6
                      })
                    }
                  }}
                />

                {/* Overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Dark overlay with cutout */}
                  <svg className="w-full h-full">
                    <defs>
                      <mask id="cropMask">
                        <rect width="100%" height="100%" fill="white" />
                        <circle
                          cx={cropBox.x}
                          cy={cropBox.y}
                          r={cropBox.size / 2}
                          fill="black"
                        />
                      </mask>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(0,0,0,0.6)"
                      mask="url(#cropMask)"
                    />
                  </svg>
                </div>

                {/* Crop circle */}
                <div
                  className="absolute border-2 border-white rounded-full pointer-events-auto cursor-move touch-none"
                  style={{
                    left: cropBox.x - cropBox.size / 2,
                    top: cropBox.y - cropBox.size / 2,
                    width: cropBox.size,
                    height: cropBox.size,
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e)}
                  onTouchStart={(e) => handleCropTouchStart(e)}
                >
                  {/* Resize handle */}
                  <div
                    className="absolute -right-3 -bottom-3 w-8 h-8 bg-white rounded-full shadow-md cursor-se-resize flex items-center justify-center touch-none"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleCropMouseDown(e, true)
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation()
                      handleCropTouchStart(e, true)
                    }}
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-4 flex gap-3">
            <button
              onClick={() => {
                setShowCropModal(false)
                setTempImageUrl(null)
                setAvatarFile(null)
              }}
              className="flex-1 py-3 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCropComplete}
              disabled={uploadingAvatar}
              className="flex-1 py-3 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploadingAvatar ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Apply"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confetti rendered last to be on top of everything */}
      <Confetti show={showConfetti} />
    </>
  )
}
