"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
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
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { isNativeApp } from "@/lib/native-bridge"
import { THEME_TEMPLATES } from "./tabs/design-tab"

// Goal icon image URLs
const GOAL_ICON_URLS = {
  general: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20de121sign.svg",
  artist: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12115.svg",
  digital: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12551.svg",
  business: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/53112.svg",
}

/* The themes are the Design tab's own list, not a copy of it that drifts: the onboarding offers what the tab offers. */

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

// Confetti animation component - with proper cleanup to prevent random appearances
function Confetti({ show }: { show: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationIdRef = useRef<number | null>(null)
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    // Only run animation once per show=true transition
    // This prevents re-running on component re-renders
    if (!show) {
      hasAnimatedRef.current = false
      // Clean up canvas if it exists
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d")
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
      }
      return
    }

    // Prevent duplicate animations
    if (hasAnimatedRef.current) return
    hasAnimatedRef.current = true

    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#1a1a2e", "#f472b6", "#34d399", "#60a5fa", "#fbbf24", "#b2846c", "#ec4899"]
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
    for (let i = 0; i < 280; i++) {
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

    let frame = 0
    const maxFrames = 390 // 6.5 seconds at 60fps (1 second longer)

    const animate = () => {
      if (frame >= maxFrames) {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current)
          animationIdRef.current = null
        }
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
      animationIdRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
      // Clear canvas on cleanup
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [show])

  // Don't render anything if not showing
  if (!show) return null

  // Use portal to render at document body level, above all dialogs
  if (typeof document === "undefined") return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        width: "100vw",
        height: "100vh",
        zIndex: 2147483647, // Maximum z-index value
      }}
    />,
    document.body
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

// LocalStorage key for saving onboarding progress
const ONBOARDING_STORAGE_KEY = "onepage_onboarding_progress"

interface OnboardingProgress {
  step: number
  displayName: string
  bio: string
  selectedGoal: "general" | "artist" | "digital" | "business" | null
  socials: { instagram: string; tiktok: string; youtube: string }
  avatarUrl: string | null
  selectedTemplate: string
  onepageId: string
}

export function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const { onepage, updateProfile, updateTheme, updateSocialLinks, addBlock, updateBlock, removeBlock, save } = useOnePage()
  /*
    FULL SCREEN IN THE APP, AT EVERY WIDTH, like the creator onboarding
    (components/app/creator-onboarding-modal.tsx). Below 640px this has always
    been the whole screen; above it, a 930 by 540 card, which on an iPad in
    the app read as a website inside the app. Read after mount, so the
    server's HTML and the first client render agree.
  */
  const [nativeFullScreen, setNativeFullScreen] = useState(false)
  useEffect(() => {
    setNativeFullScreen(isNativeApp())
  }, [])

  // Load saved progress from localStorage
  const getSavedProgress = useCallback((): OnboardingProgress | null => {
    if (typeof window === "undefined") return null
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return null
      const progress = JSON.parse(saved) as OnboardingProgress
      // Only use saved progress if it's for the same onepage
      if (progress.onepageId !== onepage?.id) return null
      return progress
    } catch {
      return null
    }
  }, [onepage?.id])

  // Initialize step from saved progress or default to 1
  const [currentStep, setCurrentStep] = useState(() => {
    if (typeof window === "undefined") return 1
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return 1
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.step || 1
    } catch {
      return 1
    }
  })
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right")

  // Step 1 state - initialize from saved progress
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return ""
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.displayName || ""
    } catch {
      return ""
    }
  })
  const [bio, setBio] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return ""
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.bio || ""
    } catch {
      return ""
    }
  })
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  // Step 2 state - initialize from saved progress
  const [selectedGoal, setSelectedGoal] = useState<"general" | "artist" | "digital" | "business" | null>(() => {
    const saved = getSavedProgress()
    return saved?.selectedGoal || null
  })
  const [loadedGoalIcons, setLoadedGoalIcons] = useState<Set<string>>(new Set())

  // Step 3 state - initialize from saved progress
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    const saved = getSavedProgress()
    return saved?.avatarUrl || null
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [socials, setSocials] = useState(() => {
    const saved = getSavedProgress()
    return saved?.socials || { instagram: "", tiktok: "", youtube: "" }
  })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Step 4 state - initialize from saved progress
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    const saved = getSavedProgress()
    return saved?.selectedTemplate || "default"
  })
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselAnimating, setCarouselAnimating] = useState(false)
  const [carouselDirection, setCarouselDirection] = useState<"left" | "right">("right")

  // Step 5 state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupPhase, setSetupPhase] = useState<"setting-up" | "just-a-moment" | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Track if setup has already run (prevents double execution)
  const hasCompletedRef = useRef(false)

  // Save progress to localStorage whenever relevant state changes
  const saveProgress = useCallback(() => {
    if (typeof window === "undefined" || !onepage?.id || currentStep >= 5) return
    try {
      const progress: OnboardingProgress = {
        step: currentStep,
        displayName,
        bio,
        selectedGoal,
        socials,
        avatarUrl,
        selectedTemplate,
        onepageId: onepage.id,
      }
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress))
    } catch (e) {
      console.error("Failed to save onboarding progress:", e)
    }
  }, [currentStep, displayName, bio, selectedGoal, socials, avatarUrl, selectedTemplate, onepage?.id])

  // Clear saved progress from localStorage
  const clearSavedProgress = useCallback(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    } catch (e) {
      console.error("Failed to clear onboarding progress:", e)
    }
  }, [])

  // Save progress when modal is open and state changes
  useEffect(() => {
    if (open && currentStep < 5) {
      saveProgress()
    }
  }, [open, currentStep, displayName, bio, selectedGoal, socials, avatarUrl, selectedTemplate, saveProgress])

  // Reset confetti when modal closes
  useEffect(() => {
    if (!open) {
      setShowConfetti(false)
    }
  }, [open])

  // Reset setup states when modal opens fresh
  useEffect(() => {
    if (open && !hasCompletedRef.current) {
      setSetupComplete(false)
      setIsSettingUp(false)
      setSetupPhase(null)
      setShowConfetti(false)
    }
  }, [open])

  // Crop state - square style like Links tab
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDraggingCrop, setIsDraggingCrop] = useState(false)
  const [isResizingCrop, setIsResizingCrop] = useState(false)
  const [dragStartCrop, setDragStartCrop] = useState({ x: 0, y: 0 })
  const [imageSizeCrop, setImageSizeCrop] = useState({ width: 0, height: 0 })
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const supabase = createClient()

  // Initialize with existing data from main onboarding
  // IMPORTANT: Fetch fresh data from database to ensure we have the latest info
  // from the main platform onboarding (which may have just completed)
  useEffect(() => {
    if (open && onepage) {
      const fetchAndPopulateData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          // Check if we have saved progress (for resuming onboarding)
          const savedProgress = getSavedProgress()
          
          // Fetch fresh onepage data from database to get latest social links
          // The context onepage may be stale if main onboarding just completed
          const { data: freshOnepage } = await supabase
            .from("onepages")
            .select("*, instagram, tiktok, youtube")
            .eq("owner_id", user.id)
            .single()

          // Fetch profile data for username and display_name
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, username, avatar_url")
            .eq("id", user.id)
            .single()

          // Fetch creator data for bio
          const { data: creator } = await supabase
            .from("creators")
            .select("slug, bio")
            .eq("user_id", user.id)
            .maybeSingle()

          // ALWAYS use fresh database data for display name and bio
          // This ensures data from main platform onboarding is always loaded
          // Priority for display name: onepage.title > profile.display_name > profile.username > creator.slug
          let nameToUse = ""
          if (freshOnepage?.title) {
            nameToUse = freshOnepage.title
          } else if (profile?.display_name) {
            nameToUse = profile.display_name
          } else if (profile?.username) {
            nameToUse = profile.username
          } else if (creator?.slug) {
            nameToUse = creator.slug
          } else if (onepage.title) {
            nameToUse = onepage.title
          }
          
          // Only set if we have a value (don't overwrite with empty)
          if (nameToUse) {
            setDisplayName(nameToUse)
          }

          // Bio - prefer fresh onepage, then creator bio
          const bioToUse = freshOnepage?.bio || creator?.bio || onepage.bio || ""
          if (bioToUse) {
            setBio(bioToUse)
          }

          // Avatar - prefer fresh onepage, then profile avatar
          const avatarToUse = freshOnepage?.avatar_url || profile?.avatar_url || onepage.avatar_url || null
          if (avatarToUse) {
            setAvatarUrl(avatarToUse)
          }

          // For goal and template, use saved progress if available
          if (savedProgress) {
            if (savedProgress.selectedGoal) setSelectedGoal(savedProgress.selectedGoal)
            if (savedProgress.selectedTemplate) setSelectedTemplate(savedProgress.selectedTemplate)
          }

          // ALWAYS fetch and populate social links from FRESH database data
          // This ensures socials from main platform onboarding are always loaded
          // Check BOTH direct database columns (instagram, tiktok, youtube) AND social_links object
          const rawFreshOnepage = freshOnepage as any
          const instagramRaw = rawFreshOnepage?.instagram || freshOnepage?.social_links?.instagram ||
                              (onepage as any).instagram || onepage.social_links?.instagram || ""
          const tiktokRaw = rawFreshOnepage?.tiktok || freshOnepage?.social_links?.tiktok ||
                           (onepage as any).tiktok || onepage.social_links?.tiktok || ""
          const youtubeRaw = rawFreshOnepage?.youtube || freshOnepage?.social_links?.youtube ||
                            (onepage as any).youtube || onepage.social_links?.youtube || ""

          // Extract Instagram username from URL like https://instagram.com/username
          let instagramValue = instagramRaw
          if (instagramValue && instagramValue.includes("instagram.com/")) {
            const match = instagramValue.match(/instagram\.com\/([^\/\?]+)/)
            if (match && match[1]) {
              instagramValue = `@${match[1].replace('@', '')}`
            }
          } else if (instagramValue && !instagramValue.startsWith("@") && !instagramValue.includes("://")) {
            // If it's just a username without @ prefix, add it
            instagramValue = `@${instagramValue}`
          }

          // Extract TikTok username from URL like https://tiktok.com/@username
          let tiktokValue = tiktokRaw
          if (tiktokValue && tiktokValue.includes("tiktok.com/")) {
            const match = tiktokValue.match(/tiktok\.com\/@?([^\/\?]+)/)
            if (match && match[1]) {
              tiktokValue = `@${match[1].replace('@', '')}`
            }
          } else if (tiktokValue && !tiktokValue.startsWith("@") && !tiktokValue.includes("://")) {
            // If it's just a username without @ prefix, add it
            tiktokValue = `@${tiktokValue}`
          }

          // YouTube can stay as full URL or channel name
          let youtubeValue = youtubeRaw

          // Only update socials if we got data from DB (don't overwrite with empty)
          if (instagramValue || tiktokValue || youtubeValue) {
            setSocials({
              instagram: instagramValue || "",
              tiktok: tiktokValue || "",
              youtube: youtubeValue || "",
            })
          }
        } catch (e) {
          console.error("Error fetching initial data:", e)
          // Fallback to context data if database fetch fails
          setDisplayName(onepage.title || "")
          setBio(onepage.bio || "")
          setAvatarUrl(onepage.avatar_url || null)
        }
      }

      fetchAndPopulateData()
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

  // Handle crop completion - same as Links tab
  const handleCropComplete = async () => {
    if (!tempImageUrl || !canvasRef.current) return

    setUploadingAvatar(true)

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

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const fileName = `${user.id}/onepage-avatar-${Date.now()}.png` // the owner's folder first: storage only lets a person write there
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      setAvatarUrl(publicUrl)
      setShowCropModal(false)
      if (tempImageUrl) URL.revokeObjectURL(tempImageUrl)
      setTempImageUrl(null)
      setAvatarFile(null)
      setCropBox({ x: 50, y: 50, size: 200 })
    } catch (e) {
      console.error("Error uploading avatar:", e)
      alert('Failed to upload image')
    } finally {
      setUploadingAvatar(false)
    }
  }

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
    // Prevent double execution
    if (hasCompletedRef.current) return

    setCurrentStep(5)
    setIsSettingUp(true)
    setSetupPhase("setting-up")

    // Clear saved progress since we're completing the onboarding
    clearSavedProgress()

    // Wait 6 seconds - "Setting up your OnePage"
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Change to the "Almost there" phase
    setSetupPhase("just-a-moment")

    // Apply all changes
    try {
      // Update profile in context
      await updateProfile({
        title: displayName,
        bio: bio,
        avatar_url: avatarUrl,
      })

      // Build social links - convert @username to full URLs
      let instagramUrl = socials.instagram || null
      if (instagramUrl && instagramUrl.startsWith("@")) {
        instagramUrl = `https://instagram.com/${instagramUrl.replace("@", "")}`
      }
      let tiktokUrl = socials.tiktok || null
      if (tiktokUrl && tiktokUrl.startsWith("@")) {
        tiktokUrl = `https://tiktok.com/@${tiktokUrl.replace("@", "")}`
      }
      let youtubeUrl = socials.youtube || null
      if (youtubeUrl && !youtubeUrl.includes("://")) {
        youtubeUrl = `https://youtube.com/@${youtubeUrl.replace("@", "")}`
      }

      // Update social links in context
      const socialUpdates: Record<string, string | null> = {}
      if (instagramUrl) socialUpdates.instagram = instagramUrl
      if (tiktokUrl) socialUpdates.tiktok = tiktokUrl
      if (youtubeUrl) socialUpdates.youtube = youtubeUrl
      if (Object.keys(socialUpdates).length > 0) {
        await updateSocialLinks(socialUpdates)
      }

      // Apply theme with template_id so design tab shows correct selection
      const template = THEME_TEMPLATES.find((t) => t.id === selectedTemplate)
      if (template) {
        await updateTheme({
          ...template.theme_config,
          template_id: template.id,
        } as any)
      }

      // Create blocks based on goal
      await createBlocksForGoal(selectedGoal || "general")

      // IMPORTANT: Save everything directly to database (not just context)
      // This ensures the data is persisted immediately after onboarding
      if (onepage?.id) {
        // Build the social_links JSONB object
        const socialLinksJsonb = {
          ...onepage.social_links,
          instagram: instagramUrl,
          tiktok: tiktokUrl,
          youtube: youtubeUrl,
        }

        console.log("[OnePage Onboarding] Saving onboarding completion to database...")
        console.log("[OnePage Onboarding] onepage.id:", onepage.id)

        // Get current user to ensure we're authenticated
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) {
          console.error("[OnePage Onboarding] No authenticated user!")
        } else {
          console.log("[OnePage Onboarding] Authenticated user:", currentUser.id)
        }

        // Save to onepages table - update profile, social links, and mark onboarding completed
        // Use owner_id filter to ensure RLS policy works
        const { data: updateData, error: updateError } = await supabase
          .from("onepages")
          .update({
            title: displayName,
            bio: bio,
            avatar_url: avatarUrl,
            // Direct columns for backward compatibility
            instagram: instagramUrl,
            tiktok: tiktokUrl,
            youtube: youtubeUrl,
            // JSONB column
            social_links: socialLinksJsonb,
            // CRITICAL: Mark onboarding as completed - this prevents the modal from showing again
            onboarding_completed: true,
          })
          .eq("id", onepage.id)
          .select()

        if (updateError) {
          console.error("[OnePage Onboarding] FAILED to save onboarding completion:", updateError)
          console.error("[OnePage Onboarding] Error details:", JSON.stringify(updateError, null, 2))
          
          // RETRY: Try updating just the onboarding_completed field
          console.log("[OnePage Onboarding] Retrying with just onboarding_completed...")
          const { error: retryError } = await supabase
            .from("onepages")
            .update({ onboarding_completed: true })
            .eq("id", onepage.id)
          
          if (retryError) {
            console.error("[OnePage Onboarding] RETRY FAILED:", retryError)
          } else {
            console.log("[OnePage Onboarding] RETRY SUCCESS - onboarding_completed saved")
          }
        } else {
          console.log("[OnePage Onboarding] SUCCESS - onboarding_completed saved to database")
          console.log("[OnePage Onboarding] Updated data:", updateData)
          
          // Verify the save worked
          const { data: verifyData } = await supabase
            .from("onepages")
            .select("onboarding_completed")
            .eq("id", onepage.id)
            .single()
          
          console.log("[OnePage Onboarding] VERIFY - onboarding_completed in DB:", verifyData?.onboarding_completed)
        }

        // Also update store_builder_configs to ensure social links appear in Store Builder
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: creator } = await supabase
            .from("creators")
            .select("id")
            .eq("user_id", user.id)
            .single()

          if (creator) {
            const { data: existingConfig } = await supabase
              .from("store_builder_configs")
              .select("id, draft_config")
              .eq("creator_id", creator.id)
              .eq("page_type", "shop")
              .maybeSingle()

            if (existingConfig) {
              // Build social links for Store Builder format
              const storeBuilderSocialLinks = {
                instagram: { enabled: !!instagramUrl, url: instagramUrl || "" },
                tiktok: { enabled: !!tiktokUrl, url: tiktokUrl || "" },
                youtube: { enabled: !!youtubeUrl, url: youtubeUrl || "" },
                twitter: existingConfig.draft_config?.headerSettings?.socialLinks?.twitter || { enabled: false, url: "" },
                spotify: existingConfig.draft_config?.headerSettings?.socialLinks?.spotify || { enabled: false, url: "" },
              }

              // Update store_builder_configs with social links
              await supabase
                .from("store_builder_configs")
                .update({
                  draft_config: {
                    ...existingConfig.draft_config,
                    headerSettings: {
                      ...existingConfig.draft_config?.headerSettings,
                      showSocialMedia: true,
                      showSocialIconsOnMobile: true,
                      socialLinks: storeBuilderSocialLinks,
                    }
                  }
                })
                .eq("id", existingConfig.id)
            }
          }
        }
      }

    } catch (e) {
      console.error("Error during setup:", e)
    }

    // Wait 3 more seconds - "Almost there"
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Mark as completed to prevent duplicate execution
    hasCompletedRef.current = true

    // Clear saved progress from localStorage since onboarding is complete
    clearSavedProgress()
    
    // CRITICAL: Also save completion to localStorage as backup
    // This ensures onboarding won't show again even if database update fails
    if (onepage?.id && typeof window !== "undefined") {
      try {
        localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
        console.log("[OnePage Onboarding] Saved completion to localStorage")
      } catch (e) {
        console.error("[OnePage Onboarding] Failed to save to localStorage:", e)
      }
    }

    setIsSettingUp(false)
    setSetupPhase(null)
    setSetupComplete(true)
    setShowConfetti(true)

    // Auto-save the OnePage editor after onboarding completion
    // This ensures all changes are persisted immediately

    // Use force=true to ensure save happens even if isDirty is somehow false
    try {
      await save(true)
      console.log("[OnePage Onboarding] Editor auto-saved successfully after onboarding")
    } catch (e) {
      console.error("Failed to auto-save after onboarding:", e)
    }

    // Auto close after confetti animation and call onComplete
    setTimeout(() => {
      // Hide confetti before closing
      setShowConfetti(false)

      // Call onComplete to close the modal and update parent state
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
  // Blocks are added in REVERSE order (bottom to top) because smart positioning
  // always inserts after header when no social_row exists. Social_row is added LAST.
  const createBlocksForGoal = async (goal: "general" | "artist" | "digital" | "business") => {
    // Remove existing blocks except header
    const existingBlocks = onepage?.draft_blocks || []
    for (const block of existingBlocks) {
      if (block.type !== "header") {
        removeBlock(block.id)
      }
    }

    // Delay to ensure removeBlock operations complete
    await new Promise(resolve => setTimeout(resolve, 200))

    switch (goal) {
      case "general": {
        // Final order: header → social_row → My Link → My Link → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button")
        addBlock("link_button")
        addBlock("social_row")
        break
      }

      case "artist": {
        // Final order: header → social_row → Spotify block → YouTube block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Subscribe on YouTube",
          url: "https://youtube.com",
          icon: "youtube",
          thumbnail_url: null
        })
        addBlock("link_button", undefined, {
          label: "Listen on Spotify",
          url: "https://open.spotify.com/",
          icon: "spotify",
          thumbnail_url: null,
          animation_type: "swipe"
        })
        addBlock("social_row")
        break
      }

      case "digital": {
        // Final order: header → social_row → product → My Link → Instagram block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Follow on Instagram",
          url: "https://instagram.com/",
          icon: "instagram",
          thumbnail_url: null
        })
        addBlock("link_button")
        addBlock("product")
        addBlock("social_row")
        break
      }

      case "business": {
        // Final order: header → social_row → My Link → Instagram block → LinkedIn block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Connect on LinkedIn",
          url: "https://linkedin.com/in/",
          icon: "linkedin",
          thumbnail_url: null
        })
        addBlock("link_button", undefined, {
          label: "Follow on Instagram",
          url: "https://instagram.com/",
          icon: "instagram",
          thumbnail_url: null
        })
        addBlock("link_button")
        addBlock("social_row")
        break
      }
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

  // CRITICAL: Check completion AFTER all hooks but BEFORE rendering
  // Check both database AND localStorage
  const isCompletedInDb = onepage?.onboarding_completed === true
  const isCompletedInLocalStorage = typeof window !== "undefined" && onepage?.id 
    ? localStorage.getItem(`onepage_onboarding_done_${onepage.id}`) === "true"
    : false
  
  if (isCompletedInDb || isCompletedInLocalStorage) {
    return null
  }

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden border-0",
            nativeFullScreen
              ? // The app: the whole screen at every width (see nativeFullScreen above)
                "fixed inset-0 top-0 left-0 w-screen h-[100dvh] max-w-none translate-x-0 translate-y-0 rounded-none"
              : cn(
                  // Desktop: centered modal, 930 by 540
                  "sm:w-[930px] sm:max-w-[930px] sm:h-[540px] sm:rounded-[44px]",
                  // Mobile: the whole screen
                  "w-[calc(100%-24px)] max-w-none max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:w-screen max-sm:h-[100dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
                  // Shadow
                  "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
                ),
            // Hide the close button
            "[&>button]:hidden"
          )}
          style={{
            // @ts-ignore
            "--tw-backdrop-blur": "blur(8px)",
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className={cn(
            "flex flex-col h-full bg-white",
            nativeFullScreen
              ? "max-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              : "sm:max-h-[540px] max-sm:max-h-[100dvh] max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]",
          )}>
            {/* Progress bar - centered, 8px height, more border radius */}
            <div className="flex justify-center pt-4 sm:pt-8 shrink-0">
              <div className="w-[160px] sm:w-[200px] h-[6px] sm:h-[8px] bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1a1a2e] transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            <div className={cn(
              "flex-1 min-h-0 overflow-y-auto transition-all duration-200 px-4 sm:px-12 pt-3 sm:pt-6",
              // Add bottom padding on mobile for steps with inputs to prevent clipping
              (currentStep === 1 || currentStep === 3) && "max-sm:pb-4",
              currentStep === 2 && "max-sm:pb-2",
              isAnimating && slideDirection === "right" && "opacity-0 translate-x-4",
              isAnimating && slideDirection === "left" && "opacity-0 -translate-x-4"
            )}>
              {/* Step 1: Let's get started */}
              {currentStep === 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-4 sm:mb-8">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Let's get started
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Start with your name. You can change everything later.
                    </p>
                  </div>

                  {/* Input fields - centered, max width 600px */}
                  <div className="w-full max-w-[600px] space-y-3 sm:space-y-4">
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
                          autoFocus={false}
                          autoComplete="off"
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
                      {/*
                        The address as it will actually be: the handle sits in
                        the path, not in the host. It used to read
                        "<handle>.storelib.com/links", which was both the old
                        format and, by the end, a 404.
                      */}
                      <span className="text-base">
                        <span className="text-gray-400">storelib.com/</span>
                        <span className="text-black font-medium">{getSlug() || "username"}</span>
                        <span className="text-gray-400">/links</span>
                      </span>
                    </div>

                    {/* Bio input */}
                    <div className="flex items-start gap-3 px-5 py-4 min-h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
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
                <div className="flex flex-col items-center h-full">
                  <div className="text-center mb-3 sm:mb-6 shrink-0">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      What's the goal here?
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      We'll build your OnePage around this
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 overflow-y-auto max-sm:flex-1 max-sm:pb-2">
                    {/* General */}
                    <button
                      onClick={() => setSelectedGoal("general")}
                      className={cn(
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "general"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">General</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Links, socials and products, a bit of each.
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
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "artist"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Artist & Creator</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Show my work and where to find me.
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
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "digital"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Digital Products</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Sell my digital products.
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
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "business"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Business</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Bring customers to my business.
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
                </div>
              )}

              {/* Step 3: Socials & Profile */}
              {currentStep === 3 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-3 sm:mb-8">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Add your socials
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      These will appear on your OnePage
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] flex flex-col sm:flex-row gap-4 sm:gap-8">
                    {/* Avatar section - centered on mobile, left on desktop */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-full bg-[#F3F3F3] flex items-center justify-center overflow-hidden border-2 border-gray-200"
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl sm:text-3xl font-bold text-gray-400">
                            {displayName.charAt(0).toUpperCase() || "A"}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="mt-2 sm:mt-3 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
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
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <Instagram className="w-5 h-5 text-pink-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.instagram}
                          onChange={(e) => setSocials({ ...socials, instagram: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* TikTok */}
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <TikTokIcon className="w-5 h-5 shrink-0" />
                        <input
                          type="text"
                          value={socials.tiktok}
                          onChange={(e) => setSocials({ ...socials, tiktok: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* YouTube */}
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <Youtube className="w-5 h-5 text-red-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.youtube}
                          onChange={(e) => setSocials({ ...socials, youtube: e.target.value })}
                          placeholder="youtube.com/@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Template Selection */}
              {currentStep === 4 && (
                <div className="flex flex-col items-center h-full">
                  <div className="text-center mb-3 sm:mb-6 shrink-0">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Choose a template
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Pick a style. You can change it later.
                    </p>
                  </div>

                  {/* Mobile: Grid layout with scroll */}
                  <div className="sm:hidden w-full flex-1 min-h-0 overflow-y-auto px-2 py-2">
                    <div className="grid grid-cols-2 gap-3 pb-4 px-1">
                      {THEME_TEMPLATES.map((template) => {
                        const isSelected = selectedTemplate === template.id
                        const bgStyle = template.theme_config.background_type === "gradient"
                          ? { background: template.theme_config.background_gradient }
                          : template.theme_config.background_type === "image"
                          ? {
                              backgroundImage: `url(${template.theme_config.background_image_url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : { background: template.theme_config.background_color }
                        const isImageBg = template.theme_config.background_type === "image"
                        const isHeroLayout = (template as any).profile_layout === "hero" || (template.theme_config as any).header_layout === "hero"
                        const hasPattern = template.theme_config.background_pattern && template.theme_config.background_pattern !== "none"
                        const patternColor = template.theme_config.pattern_color || "#ffffff"
                        // Increased opacity for better visibility in thumbnails
                        const patternOpacity = template.theme_config.pattern_opacity === "high" ? 0.7 : template.theme_config.pattern_opacity === "medium" ? 0.5 : 0.35

                        return (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={cn(
                              "aspect-[3/4] rounded-xl overflow-hidden relative transition-all duration-300",
                              isSelected ? "ring-2 ring-[#1a1a2e] ring-offset-2" : ""
                            )}
                          >
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
                            <div
                              className="w-full h-full p-2 flex flex-col items-center justify-center gap-1.5 relative"
                              style={isImageBg ? {} : bgStyle}
                            >
                              {isImageBg && (
                                <div className="absolute inset-0 bg-black/50 z-[1]" />
                              )}
                              {/* Pattern overlay for mobile - all pattern types */}
                              {hasPattern && template.theme_config.background_pattern === "grid" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2]"
                                  style={{
                                    backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
                                    backgroundSize: "16px 16px",
                                    opacity: patternOpacity
                                  }}
                                />
                              )}
                              {hasPattern && template.theme_config.background_pattern === "stars" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                                  style={{ opacity: patternOpacity }}
                                >
                                  <style>{`
                                    @keyframes starTwinkle1m${template.id} {
                                      0%, 100% { opacity: 0.2; }
                                      50% { opacity: 0.8; }
                                    }
                                    @keyframes starTwinkle2m${template.id} {
                                      0%, 100% { opacity: 0.4; }
                                      50% { opacity: 1; }
                                    }
                                    @keyframes starTwinkle3m${template.id} {
                                      0%, 100% { opacity: 0.3; }
                                      50% { opacity: 0.7; }
                                    }
                                    .star-m-${template.id} {
                                      position: absolute;
                                      border-radius: 50%;
                                      background: ${patternColor};
                                    }
                                    .star-m1-${template.id} { animation: starTwinkle1m${template.id} 3s ease-in-out infinite; }
                                    .star-m2-${template.id} { animation: starTwinkle2m${template.id} 4s ease-in-out infinite; animation-delay: 0.5s; }
                                    .star-m3-${template.id} { animation: starTwinkle3m${template.id} 5s ease-in-out infinite; animation-delay: 1s; }
                                  `}</style>
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '8%', left: '15%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '15%', left: '45%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '10%', left: '75%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '25%', left: '25%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '30%', left: '60%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1px', height: '1px', top: '22%', left: '85%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '40%', left: '10%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '45%', left: '50%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '38%', left: '80%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '55%', left: '20%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '60%', left: '55%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1px', height: '1px', top: '52%', left: '90%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '70%', left: '35%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '75%', left: '70%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '68%', left: '5%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '85%', left: '40%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '90%', left: '65%' }} />
                                </div>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "waves" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`waves-mobile-${template.id}`} width="40" height="20" patternUnits="userSpaceOnUse">
                                      <path d="M0 10 Q10 0, 20 10 T40 10" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#waves-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "zigzag" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`zigzag-mobile-${template.id}`} width="20" height="12" patternUnits="userSpaceOnUse">
                                      <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#zigzag-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "organic" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`organic-mobile-${template.id}`} width="200" height="200" patternUnits="userSpaceOnUse">
                                      <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={patternColor} opacity="0.5" />
                                      <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={patternColor} opacity="0.45" />
                                      <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={patternColor} opacity="0.48" />
                                      <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={patternColor} opacity="0.4" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#organic-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "morph" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2]"
                                  style={{
                                    backgroundImage: `radial-gradient(ellipse at 20% 30%, ${patternColor} 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, ${patternColor} 0%, transparent 50%)`,
                                    opacity: patternOpacity
                                  }}
                                />
                              )}
                              {/* Neon glow effect */}
                              {template.id === "neon" && (
                                <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
                                  <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.15) 0%, transparent 50%)" }} />
                                </div>
                              )}
                              {isHeroLayout ? (
                                /* Hero layout for mobile: full height like phone preview */
                                <>
                                  <div className="absolute top-0 left-0 right-0 h-[55%] z-10 overflow-hidden">
                                    {avatarUrl ? (
                                      <>
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                        {/* Fade gradient overlay */}
                                        <div
                                          className="absolute inset-0 pointer-events-none"
                                          style={{
                                            background: `linear-gradient(to bottom, transparent 40%, ${template.theme_config.background_type === 'gradient' ? template.theme_config.background_color : template.theme_config.background_color} 100%)`
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}20` }}>
                                        <span className="text-sm font-bold" style={{ color: template.theme_config.text_color }}>
                                          {displayName.charAt(0).toUpperCase() || "A"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-auto mb-2 flex flex-col items-center gap-0.5 relative z-10">
                                    <div className="w-10 h-1.5 rounded" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                    <div className="w-8 h-1 rounded" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                  </div>
                                </>
                              ) : (
                                <>
                                  {/* A circle in a card too short for everything: it keeps its size, and the card's column cannot squash it oval. */}
                                  <div data-theme-avatar="" className="w-7 h-7 aspect-square shrink-0 rounded-full relative z-10 overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}30` }}>
                                    {avatarUrl ? (
                                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-[8px] font-bold" style={{ color: template.theme_config.text_color }}>
                                        {displayName.charAt(0).toUpperCase() || "A"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="w-10 h-1.5 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                  <div className="w-8 h-1 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                </>
                              )}
                              <div
                                className="mt-1 w-full max-w-[50px] h-4 relative z-10"
                                style={{
                                  background: template.theme_config.button_color,
                                  borderWidth: template.theme_config.button_border_width || 0,
                                  borderColor: template.theme_config.button_border_color,
                                  borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                }}
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#1a1a2e] flex items-center justify-center z-20">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1.5 z-10">
                              <p
                                className="text-white text-[10px] font-medium text-center"
                                style={{ fontFamily: template.theme_config.font_family }}
                              >
                                {template.name}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Desktop: Carousel - with padding to prevent overflow */}
                  <div className="hidden sm:block relative w-full max-w-[700px] px-8">
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
                            // Increased opacity for better visibility in thumbnails
                            const opacity = template.theme_config.pattern_opacity === "high" ? 0.7 :
                                           template.theme_config.pattern_opacity === "medium" ? 0.5 : 0.35

                            // Special handling for Neon theme - show cyan glow effect
                            if (template.id === "neon") {
                              return (
                                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                  <div
                                    className="absolute inset-0"
                                    style={{
                                      background: "radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.15) 0%, transparent 50%)"
                                    }}
                                  />
                                  <div
                                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[2px]"
                                    style={{
                                      background: "linear-gradient(90deg, transparent, #22d3ee, transparent)",
                                      boxShadow: "0 0 20px 2px rgba(34, 211, 238, 0.5)"
                                    }}
                                  />
                                </div>
                              )
                            }

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
                                  className="absolute inset-0 pointer-events-none overflow-hidden"
                                  style={{ opacity }}
                                >
                                  <style>{`
                                    @keyframes starTwinkle1d${template.id} {
                                      0%, 100% { opacity: 0.2; }
                                      50% { opacity: 0.8; }
                                    }
                                    @keyframes starTwinkle2d${template.id} {
                                      0%, 100% { opacity: 0.4; }
                                      50% { opacity: 1; }
                                    }
                                    @keyframes starTwinkle3d${template.id} {
                                      0%, 100% { opacity: 0.3; }
                                      50% { opacity: 0.7; }
                                    }
                                    .star-d-${template.id} {
                                      position: absolute;
                                      border-radius: 50%;
                                      background: ${patternColor};
                                    }
                                    .star-d1-${template.id} { animation: starTwinkle1d${template.id} 3s ease-in-out infinite; }
                                    .star-d2-${template.id} { animation: starTwinkle2d${template.id} 4s ease-in-out infinite; animation-delay: 0.5s; }
                                    .star-d3-${template.id} { animation: starTwinkle3d${template.id} 5s ease-in-out infinite; animation-delay: 1s; }
                                  `}</style>
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '5%', left: '10%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '12%', left: '30%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '8%', left: '55%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '15%', left: '75%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '10%', left: '90%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '25%', left: '15%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '30%', left: '45%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '22%', left: '65%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '35%', left: '85%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '40%', left: '5%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '45%', left: '35%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '42%', left: '60%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '50%', left: '80%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '55%', left: '20%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '58%', left: '50%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '62%', left: '70%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '65%', left: '92%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '70%', left: '8%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '75%', left: '40%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '78%', left: '58%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '82%', left: '78%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '88%', left: '25%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '92%', left: '55%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '95%', left: '88%' }} />
                                </div>
                              )
                            }
                            if (pattern === "waves") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`waves-desktop-${template.id}`} width="40" height="20" patternUnits="userSpaceOnUse">
                                      <path d="M0 10 Q10 0, 20 10 T40 10" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#waves-desktop-${template.id})`} />
                                </svg>
                              )
                            }
                            if (pattern === "zigzag") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`zigzag-desktop-${template.id}`} width="20" height="12" patternUnits="userSpaceOnUse">
                                      <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#zigzag-desktop-${template.id})`} />
                                </svg>
                              )
                            }
                            if (pattern === "organic") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`organic-desktop-${template.id}`} width="200" height="200" patternUnits="userSpaceOnUse">
                                      <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={patternColor} opacity="0.5" />
                                      <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={patternColor} opacity="0.45" />
                                      <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={patternColor} opacity="0.48" />
                                      <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={patternColor} opacity="0.4" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#organic-desktop-${template.id})`} />
                                </svg>
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
                                isSelected ? "ring-2 ring-[#1a1a2e] ring-offset-2" : ""
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
                                className="w-full h-full p-3 flex flex-col items-center justify-center gap-2 relative"
                                style={isImageBg ? {} : bgStyle}
                              >
                                {/* Dark overlay for image backgrounds so content is visible */}
                                {isImageBg && (
                                  <div className="absolute inset-0 bg-black/50 z-[1]" />
                                )}

                                {/* Pattern overlay */}
                                {getPatternOverlay()}

                                {/* Check if hero layout */}
                                {((template as any).profile_layout === "hero" || (template.theme_config as any).header_layout === "hero") ? (
                                  /* Hero layout: full height header like phone preview with fade */
                                  <>
                                    <div className="absolute top-0 left-0 right-0 h-[55%] z-10 overflow-hidden">
                                      {avatarUrl ? (
                                        <>
                                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                          {/* Fade gradient overlay like phone preview */}
                                          <div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{
                                              background: `linear-gradient(to bottom, transparent 40%, ${template.theme_config.background_type === 'gradient' ? template.theme_config.background_color : template.theme_config.background_color} 100%)`
                                            }}
                                          />
                                        </>
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}20` }}>
                                          <span className="text-lg font-bold" style={{ color: template.theme_config.text_color }}>
                                            {displayName.charAt(0).toUpperCase() || "A"}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-auto mb-4 flex flex-col items-center gap-1 relative z-10">
                                      <div className="w-16 h-2 rounded" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                      <div className="w-12 h-1 rounded" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                    </div>
                                  </>
                                ) : (
                                  /* Classic layout: circle avatar with user photo/initial */
                                  <>
                                    <div data-theme-avatar="" className="w-10 h-10 aspect-square shrink-0 rounded-full relative z-10 overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}30` }}>
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-xs font-bold" style={{ color: template.theme_config.text_color }}>
                                          {displayName.charAt(0).toUpperCase() || "A"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="w-16 h-2 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                    <div className="w-12 h-1 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                  </>
                                )}

                                {/* Button preview */}
                                <div
                                  className="w-full max-w-[80px] h-6 mt-2 relative z-10"
                                  style={{
                                    background: template.theme_config.button_color,
                                    borderWidth: template.theme_config.button_border_width || 0,
                                    borderColor: template.theme_config.button_border_color,
                                    borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                  }}
                                />
                              </div>

                              {/* Selected checkmark */}
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#1a1a2e] flex items-center justify-center z-20">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}

                              {/* Template name with font preview */}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-2 z-10">
                                <p
                                  className="text-white text-[10px] font-medium text-center"
                                  style={{ fontFamily: template.theme_config.font_family }}
                                >
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

                  {/* Pagination dots - desktop only */}
                  <div className="hidden sm:flex justify-center gap-1.5 mt-4">
                    {Array.from({ length: maxCarouselIndex + 1 }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          i === carouselIndex ? "bg-[#1a1a2e]" : "bg-gray-300 hover:bg-gray-400"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Setup - centered content */}
              {currentStep === 5 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px] sm:min-h-[350px] px-4 pt-6 sm:pt-0">
                  {/* Logo with pulse effect */}
                  <div className="relative mb-4 sm:mb-6 mt-4 sm:mt-0">
                    {isSettingUp && (
                      <>
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-[7px] bg-[#1a1a2e]/30 animate-ping" />
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-[7px] bg-[#1a1a2e]/20 animate-pulse" />
                      </>
                    )}
                    <StorelibLogo size={80} fluid className="relative h-16 w-16 sm:h-20 sm:w-20" />
                  </div>

                  {/* Title - centered */}
                  <div className="text-center">
                    {isSettingUp && setupPhase === "setting-up" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Setting up your OnePage
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#1a1a2e] animate-spin" />
                      </div>
                    ) : isSettingUp && setupPhase === "just-a-moment" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Almost there
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#1a1a2e] animate-spin" />
                      </div>
                    ) : setupComplete ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Your OnePage is ready.
                        </h1>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                </div>
              )}
            </div>

            {/* Footer with buttons - Back on left, Skip/Next on right */}
            {currentStep < 5 && (
              <div className={cn(
                "px-4 sm:px-12 pt-2 flex items-center justify-between shrink-0",
                // Mobile: consistent padding, Desktop: base padding
                "pb-5 sm:pb-4",
                // Extra padding for goal step to move buttons up on desktop
                currentStep === 2 && "sm:pb-7"
              )}>
                {/* Back button and None of these - left side */}
                <div className="flex items-center gap-3">
                  {currentStep > 1 && (
                    <button
                      onClick={handleBack}
                      className="px-5 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      Back
                    </button>
                  )}
                  {/* None of these button - desktop only, step 2 only */}
                  {currentStep === 2 && (
                    <button
                      onClick={() => {
                        setSelectedGoal("general")
                        handleNext()
                      }}
                      className="hidden sm:block px-5 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      None of these
                    </button>
                  )}
                </div>

                {/* Skip and Next buttons - right side */}
                <div className="flex items-center gap-3 sm:gap-4">
                  {canSkip() && (
                    <button
                      onClick={handleSkip}
                      className="px-4 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Skip
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={cn(
                      "px-7 sm:px-8 py-3 sm:py-3 rounded-xl font-semibold text-sm sm:text-sm transition-all min-w-[110px] sm:min-w-[140px]",
                      canProceed()
                        ? "bg-[#1a1a2e] text-white hover:bg-[#2a2a40] shadow-md hover:shadow-lg"
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

      {/* Image Crop Modal - Square style like Links tab */}
      <Dialog open={showCropModal} onOpenChange={(open) => {
        setShowCropModal(open)
        if (!open && tempImageUrl) {
          URL.revokeObjectURL(tempImageUrl)
          setTempImageUrl(null)
          setAvatarFile(null)
          setCropBox({ x: 50, y: 50, size: 200 })
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <div className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1 text-center pr-8">Crop image</h2>
          </div>
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

                <p className="text-xs text-center text-gray-500">
                  Drag to move, drag bottom-right corner to resize
                </p>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null); setCropBox({ x: 50, y: 50, size: 200 }) }}
                    className="flex-1 py-3 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCropComplete}
                    disabled={uploadingAvatar}
                    className="flex-1 py-3 rounded-xl font-medium text-sm bg-[#1a1a2e] text-white hover:bg-[#2a2a40] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploadingAvatar ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confetti rendered last to be on top of everything */}
      <Confetti show={showConfetti} />
    </>
  )
}
