"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useOnePage } from "@/lib/onepage/context"
import { createClient } from "@/lib/supabase/client"
import {
  Camera,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Youtube,
  Upload,
  Loader2
} from "lucide-react"

// Theme templates imported from design-tab
const THEME_TEMPLATES = [
  {
    id: "default",
    name: "Default",
    category: "light",
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
  },
  {
    id: "air",
    name: "Air",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f8fafc",
      text_color: "#0f172a",
      secondary_text_color: "#64748b",
      button_color: "#0f172a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 8,
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#0f172a",
      social_icon_color: "#64748b",
    },
  },
  {
    id: "astrid",
    name: "Astrid",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#0a0a0a",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "#27272a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "#3f3f46",
      font_family: "'Inter', sans-serif",
      title_font: "'Montserrat', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a1a1aa",
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
      text_color: "#ffffff",
      secondary_text_color: "#e9d5ff",
      button_color: "#ffffff",
      button_text_color: "#7c3aed",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_shadow: "hard",
      button_shadow_color: "#6a197b",
      font_family: "'Poppins', sans-serif",
      title_font: "'Poppins', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
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
      text_color: "#ffffff",
      secondary_text_color: "#bae6fd",
      button_color: "rgba(255, 255, 255, 0.15)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 24,
      font_family: "'Nunito', sans-serif",
      title_font: "'Nunito', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#bae6fd",
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
      text_color: "#ffffff",
      secondary_text_color: "#fed7aa",
      button_color: "#ffffff",
      button_text_color: "#ea580c",
      button_style: "filled" as const,
      button_border_radius: 16,
      button_shadow: "strong",
      font_family: "'Poppins', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#020617",
      text_color: "#f8fafc",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 10,
      font_family: "'Inter', sans-serif",
      title_font: "'Oswald', sans-serif",
      title_color: "#f8fafc",
      social_icon_color: "#3b82f6",
      header_layout: "hero",
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "medium",
    },
  },
  {
    id: "cream",
    name: "Cream",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#fffbeb",
      text_color: "#1c1917",
      secondary_text_color: "#78716c",
      button_color: "#1c1917",
      button_text_color: "#fffbeb",
      button_style: "outline" as const,
      button_border_radius: 24,
      button_border_width: 2,
      button_border_color: "#1c1917",
      font_family: "'Lora', serif",
      title_font: "'Playfair Display', serif",
      title_color: "#362f2b",
      social_icon_color: "#78716c",
    },
  },
  {
    id: "space",
    name: "Space",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#000000",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 12,
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "high",
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
      text_color: "#ffffff",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(139, 92, 246, 0.3)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 16,
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a78bfa",
    },
  },
  {
    id: "neon",
    name: "Neon",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#09090b",
      text_color: "#fafafa",
      secondary_text_color: "#a1a1aa",
      button_color: "#18181b",
      button_text_color: "#22d3ee",
      button_style: "glass" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#22d3ee",
      font_family: "'JetBrains Mono', monospace",
      title_font: "'Orbitron', sans-serif",
      title_color: "#22d3ee",
      social_icon_color: "#22d3ee",
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
      background_image_url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=95",
      text_color: "#ffffff",
      secondary_text_color: "#d1fae5",
      button_color: "rgba(255, 255, 255, 0.9)",
      button_text_color: "#065f46",
      button_style: "filled" as const,
      button_border_radius: 24,
      font_family: "'Nunito', sans-serif",
      title_font: "'Lora', serif",
      title_color: "#ffffff",
      social_icon_color: "#d1fae5",
      image_brightness: 40,
      image_noise: true,
    },
  },
]

// Goal option icons
const GoalIcons = {
  general: (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
      <Camera className="w-6 h-6 text-white" />
    </div>
  ),
  artist: (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>
  ),
  digital: (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  ),
  business: (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    </div>
  ),
}

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

    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa", "#f472b6", "#34d399", "#60a5fa", "#fbbf24"]
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
    }> = []

    // Create confetti from left and right
    for (let i = 0; i < 150; i++) {
      const fromLeft = i % 2 === 0
      confettiPieces.push({
        x: fromLeft ? -20 : canvas.width + 20,
        y: Math.random() * canvas.height * 0.6,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 10 + 5,
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 8 + 4),
        speedY: Math.random() * 4 - 2,
        rotationSpeed: Math.random() * 10 - 5,
        shape: Math.random() > 0.5 ? "rect" : "circle",
      })
    }

    let animationId: number
    let frame = 0
    const maxFrames = 210 // 3.5 seconds at 60fps

    const animate = () => {
      if (frame >= maxFrames) {
        cancelAnimationFrame(animationId)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      confettiPieces.forEach((piece) => {
        ctx.save()
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

        // Update position
        piece.x += piece.speedX * (frame < 60 ? 1 : 0.95)
        piece.y += piece.speedY
        piece.speedY += 0.15 // gravity
        piece.speedX *= 0.99 // air resistance
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
      className="fixed inset-0 pointer-events-none z-[100]"
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

  // Step 1 state
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  // Step 2 state
  const [selectedGoal, setSelectedGoal] = useState<"general" | "artist" | "digital" | "business" | null>(null)

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

  // Step 5 state
  const [isSettingUp, setIsSettingUp] = useState(false)
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

      // Calculate crop dimensions based on percentage
      const container = cropContainerRef.current
      const containerRect = container.getBoundingClientRect()
      const scaleX = img.naturalWidth / containerRect.width
      const scaleY = img.naturalHeight / containerRect.height

      const sourceX = (cropBox.x - cropBox.size / 2) * scaleX
      const sourceY = (cropBox.y - cropBox.size / 2) * scaleY
      const sourceSize = cropBox.size * Math.min(scaleX, scaleY)

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

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
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

  // Handle skip
  const handleSkip = () => {
    if (!canSkip()) return
    handleNext()
  }

  // Start setup process
  const startSetup = async () => {
    setCurrentStep(5)
    setIsSettingUp(true)

    // Wait 6 seconds
    await new Promise((resolve) => setTimeout(resolve, 6000))

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

    setIsSettingUp(false)
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

    const timestamp = Date.now()

    // Base blocks for all goals
    const socialRowBlock = {
      id: `block_${timestamp + 1}_social`,
      type: "social_row" as const,
      enabled: true,
      data: {
        platforms: [],
        style: "icons",
      },
      sort_order: 1,
    }

    const dividerBlock = {
      id: `block_${timestamp + 100}_divider`,
      type: "divider" as const,
      enabled: true,
      data: {
        style: "line",
        height: 24,
      },
      sort_order: 100,
    }

    const newsletterBlock = {
      id: `block_${timestamp + 101}_newsletter`,
      type: "email_capture" as const,
      enabled: true,
      data: {
        headline: "Join my newsletter",
        description: "Get updates and exclusive content",
        placeholder: "Enter your email",
        button_text: "Subscribe",
        success_message: "Thanks for subscribing!",
        layout_type: "default",
        animation_type: "none",
      },
      sort_order: 101,
    }

    switch (goal) {
      case "general":
        // Header, social icons, My link, divider, newsletter
        addBlock("social_row")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break

      case "artist":
        // Header, social icons, spotify, youtube, divider, newsletter
        addBlock("social_row")
        // Note: spotify and youtube would be added as link_button with specific icons
        addBlock("link_button") // For Spotify
        addBlock("link_button") // For YouTube
        addBlock("divider")
        addBlock("email_capture")
        break

      case "digital":
        // Header, social icons, digital product, my link, divider, newsletter
        addBlock("social_row")
        addBlock("product")
        addBlock("link_button")
        addBlock("divider")
        addBlock("email_capture")
        break

      case "business":
        // Header, social icons, My link, instagram, linkedin, divider, newsletter
        addBlock("social_row")
        addBlock("link_button")
        addBlock("link_button") // For Instagram
        addBlock("link_button") // For LinkedIn
        addBlock("divider")
        addBlock("email_capture")
        break
    }
  }

  // Progress bar width
  const progressWidth = (currentStep / 5) * 100

  // Template carousel
  const templatesPerPage = 3
  const maxCarouselIndex = Math.ceil(THEME_TEMPLATES.length / templatesPerPage) - 1

  const visibleTemplates = THEME_TEMPLATES.slice(
    carouselIndex * templatesPerPage,
    (carouselIndex + 1) * templatesPerPage
  )

  return (
    <>
      <Confetti show={showConfetti} />

      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden border-0 shadow-2xl",
            // Desktop: centered modal with max-width
            "sm:max-w-lg sm:rounded-3xl",
            // Mobile: full screen
            "w-full h-full sm:h-auto sm:max-h-[90vh] max-sm:rounded-none max-sm:max-w-none"
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Progress bar */}
          <div className="h-1 bg-gray-100">
            <div
              className="h-full bg-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          <div className={cn(
            "flex-1 overflow-y-auto transition-opacity duration-200",
            isAnimating && "opacity-0"
          )}>
            {/* Step 1: Let's get started */}
            {currentStep === 1 && (
              <div className="p-6 sm:p-8">
                <div className="text-center mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    Let's get started 👋
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base">
                    Start with your name — everything can be changed later
                  </p>
                </div>

                {/* Username input */}
                <div className="space-y-4">
                  <div className="relative">
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors",
                      usernameFocused ? "border-black" : "border-gray-200"
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
                      <p className="text-red-500 text-xs mt-1 ml-1">This name is not available</p>
                    )}
                  </div>

                  {/* URL preview */}
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="text-gray-500 text-sm sm:text-base">
                      <span className="text-black font-medium">{getSlug() || "username"}</span>
                      <span className="text-gray-400">.storelib.com/links</span>
                    </span>
                  </div>

                  {/* Bio input */}
                  <div className="flex items-start gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 focus-within:border-black transition-colors">
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
              <div className="p-6 sm:p-8">
                <div className="text-center mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    What's the goal here?
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base">
                    We'll build your OnePage around this
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {/* General */}
                  <button
                    onClick={() => setSelectedGoal("general")}
                    className={cn(
                      "p-4 rounded-2xl border-2 text-left transition-all",
                      selectedGoal === "general"
                        ? "border-black bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base">General</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          Covers all goals - links, business, and socials.
                        </p>
                      </div>
                      {GoalIcons.general}
                    </div>
                  </button>

                  {/* Artist & Creator */}
                  <button
                    onClick={() => setSelectedGoal("artist")}
                    className={cn(
                      "p-4 rounded-2xl border-2 text-left transition-all",
                      selectedGoal === "artist"
                        ? "border-black bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base">Artist & Creator</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          Share my creative work with the world.
                        </p>
                      </div>
                      {GoalIcons.artist}
                    </div>
                  </button>

                  {/* Digital Products */}
                  <button
                    onClick={() => setSelectedGoal("digital")}
                    className={cn(
                      "p-4 rounded-2xl border-2 text-left transition-all",
                      selectedGoal === "digital"
                        ? "border-black bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base">Digital Products</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          Sell my digital products to anyone.
                        </p>
                      </div>
                      {GoalIcons.digital}
                    </div>
                  </button>

                  {/* Business */}
                  <button
                    onClick={() => setSelectedGoal("business")}
                    className={cn(
                      "p-4 rounded-2xl border-2 text-left transition-all",
                      selectedGoal === "business"
                        ? "border-black bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base">Business</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          Grow my business & convert customers.
                        </p>
                      </div>
                      {GoalIcons.business}
                    </div>
                  </button>
                </div>

                {/* None of these option */}
                <button
                  onClick={() => setSelectedGoal("general")}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-4 py-2"
                >
                  None of these
                </button>
              </div>
            )}

            {/* Step 3: Socials & Profile */}
            {currentStep === 3 && (
              <div className="p-6 sm:p-8">
                <div className="text-center mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    Add your socials
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base">
                    These will appear on your OnePage
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                  {/* Avatar section */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200"
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
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
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
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 focus-within:border-gray-400 transition-colors">
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
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 focus-within:border-gray-400 transition-colors">
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
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 focus-within:border-gray-400 transition-colors">
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
              <div className="p-6 sm:p-8">
                <div className="text-center mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    Select a template
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base">
                    Pick the style you want - you can change it later
                  </p>
                </div>

                {/* Carousel */}
                <div className="relative">
                  {/* Left arrow */}
                  <button
                    onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
                    disabled={carouselIndex === 0}
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-opacity",
                      carouselIndex === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                    )}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Templates */}
                  <div className="flex gap-3 overflow-hidden px-2">
                    {visibleTemplates.map((template) => {
                      const isSelected = selectedTemplate === template.id
                      const bgStyle = template.theme_config.background_type === "gradient"
                        ? { background: template.theme_config.background_gradient }
                        : template.theme_config.background_type === "image"
                        ? {
                            background: `url(${template.theme_config.background_image_url}) center/cover`,
                          }
                        : { background: template.theme_config.background_color }

                      return (
                        <button
                          key={template.id}
                          onClick={() => setSelectedTemplate(template.id)}
                          className={cn(
                            "flex-1 min-w-[100px] aspect-[3/4] rounded-2xl overflow-hidden relative transition-all",
                            isSelected ? "ring-2 ring-purple-600 ring-offset-2" : "hover:scale-105"
                          )}
                        >
                          {/* Template preview */}
                          <div
                            className="w-full h-full p-3 flex flex-col items-center justify-center"
                            style={bgStyle}
                          >
                            {/* Avatar preview */}
                            <div
                              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/30"
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
                              className="text-xs font-semibold mt-2 truncate max-w-full"
                              style={{ color: template.theme_config.text_color }}
                            >
                              {displayName || "Name"}
                            </p>

                            {/* Button preview */}
                            <div
                              className="mt-3 w-full h-6 rounded-lg"
                              style={{
                                background: template.theme_config.button_color,
                                borderRadius: `${template.theme_config.button_border_radius || 8}px`
                              }}
                            />
                            <div
                              className="mt-1.5 w-full h-6 rounded-lg"
                              style={{
                                background: template.theme_config.button_color,
                                borderRadius: `${template.theme_config.button_border_radius || 8}px`
                              }}
                            />
                          </div>

                          {/* Selected checkmark */}
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}

                          {/* Template name */}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-white text-xs font-medium text-center">
                              {template.name}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Right arrow */}
                  <button
                    onClick={() => setCarouselIndex(Math.min(maxCarouselIndex, carouselIndex + 1))}
                    disabled={carouselIndex >= maxCarouselIndex}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-opacity",
                      carouselIndex >= maxCarouselIndex ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                    )}
                  >
                    <ChevronRight className="w-4 h-4" />
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

            {/* Step 5: Setup */}
            {currentStep === 5 && (
              <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[400px]">
                {/* Logo with pulse effect */}
                <div className="relative mb-6">
                  {isSettingUp && (
                    <>
                      <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-purple-400/30 animate-ping" />
                      <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-purple-400/20 animate-pulse" />
                    </>
                  )}
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg">
                    <span className="text-white text-3xl font-bold">S</span>
                  </div>
                </div>

                {/* Title */}
                <div className="text-center">
                  {isSettingUp ? (
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-bold">
                        We're setting things up...
                      </h1>
                      <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
                    </div>
                  ) : setupComplete ? (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-500">
                      <h1 className="text-xl sm:text-2xl font-bold">
                        Your OnePage is ready.
                      </h1>
                      <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Quote */}
                <div className="mt-6 text-center max-w-sm">
                  <p className="text-gray-500 text-sm italic">
                    "Logic will get you from A to B. Imagination will take you everywhere."
                  </p>
                  <p className="text-gray-400 text-xs mt-1">- Albert Einstein</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer with buttons */}
          {currentStep < 5 && (
            <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-4 flex items-center justify-between border-t border-gray-100">
              <button
                onClick={handleSkip}
                disabled={!canSkip()}
                className={cn(
                  "text-sm font-medium transition-colors",
                  canSkip()
                    ? "text-gray-500 hover:text-gray-700"
                    : "text-gray-300 cursor-not-allowed"
                )}
              >
                Skip
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-semibold text-sm transition-all",
                  canProceed()
                    ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                Next
              </button>
            </div>
          )}

          {/* Skip button on step 5 (for loading/success) */}
          {currentStep === 5 && !setupComplete && (
            <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-4 flex items-center justify-between border-t border-gray-100">
              <span />
              <button
                disabled
                className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-gray-200 text-gray-400 cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Crop Modal */}
      <Dialog open={showCropModal} onOpenChange={setShowCropModal}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Crop your photo</h2>
          </div>

          <div
            ref={cropContainerRef}
            className="relative w-full aspect-square bg-black overflow-hidden cursor-move"
          >
            {tempImageUrl && (
              <>
                <img
                  src={tempImageUrl}
                  alt=""
                  className="w-full h-full object-contain"
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
                  className="absolute border-2 border-white rounded-full pointer-events-auto cursor-move"
                  style={{
                    left: cropBox.x - cropBox.size / 2,
                    top: cropBox.y - cropBox.size / 2,
                    width: cropBox.size,
                    height: cropBox.size,
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e)}
                >
                  {/* Resize handle */}
                  <div
                    className="absolute -right-2 -bottom-2 w-6 h-6 bg-white rounded-full shadow-md cursor-se-resize flex items-center justify-center"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleCropMouseDown(e, true)
                    }}
                  >
                    <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              className="flex-1 py-2.5 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCropComplete}
              disabled={uploadingAvatar}
              className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
    </>
  )
}
