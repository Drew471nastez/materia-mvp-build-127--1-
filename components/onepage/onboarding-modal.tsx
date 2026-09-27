"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { createPortal, preload } from "react-dom"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useOnePage } from "@/lib/onepage/context"
import { createClient } from "@/lib/supabase/client"
import { announceAvatar } from "@/lib/account/avatar-store"
import {
  Check,
  X,
  ChevronLeft,
  Instagram,
  Youtube,
  Loader2,
  Pencil
} from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { isNativeApp } from "@/lib/native-bridge"
import { THEME_TEMPLATES } from "./tabs/design-tab"
import { getOnePageDomain } from "@/lib/onepage/address"
import { CardMark, CheckMark, ChoiceMark } from "./choice-marks"
import { WallpaperPattern } from "./wallpaper-layers"

type Goal = "general" | "artist" | "digital" | "business"

/*
  THE GOAL PICTURES ARE THE APP'S OWN, AT THE SIZE THEY ARE DRAWN. They were
  four SVGs from Supabase storage, each a 1000px square wrapping a PNG in a
  mask and a colour filter: 645KB and four requests to another origin for
  four 48px tiles, each hidden until it arrived, so on a phone on a slow
  network the step sat with grey boxes for four and a half seconds. They are
  the same pictures now as WebP at 48, 96 and 144px (1x, 2x, 3x; 4.7KB for
  the 2x set), served from public/images/onepage-goals and fetched while the
  first step is on screen, so the goal step arrives with them drawn.
  scripts/check-onepage-onboarding.mjs measures it.
*/
const GOALS: readonly { id: Goal; title: string; text: string }[] = [
  { id: "general", title: "General", text: "Links, socials and products, a bit of each." },
  { id: "artist", title: "Artist & Creator", text: "Show my work and where to find me." },
  { id: "digital", title: "Digital Products", text: "Sell my digital products." },
  { id: "business", title: "Business", text: "Bring customers to my business." },
]
const goalIcon = (id: Goal, px: 48 | 96 | 144) => `/images/onepage-goals/${id}-${px}.webp`
const goalIconSet = (id: Goal) => `${goalIcon(id, 48)} 1x, ${goalIcon(id, 96)} 2x, ${goalIcon(id, 144)} 3x`

/*
  The two photo templates, as a 300 by 400 WebP of the photo (9 and 7KB). The
  cards drew the photos themselves: a 1920px Unsplash JPEG at quality 95
  (632KB) and a 278KB one from storage, for a card 160px wide.
*/
const TEMPLATE_THUMBS: Record<string, string> = {
  nature: "/images/onepage-themes/nature.webp",
  fusion: "/images/onepage-themes/fusion.webp",
}

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

/*
  A PICK FADES IN AND THE LAST ONE OUT. The goal card's own border and grey
  changed class on a pick: in, the colours faded over 150ms (a repaint every
  frame); out, the card got its hover border class back, and on a touch
  screen app/globals.css zeroes the transition of anything with a hover
  border, so the old pick snapped off in one frame. The pick is the editor's
  own mark now (./choice-marks CardMark: the dark border and the grey under
  the words, faded and scaled in and out on opacity and scale, 180ms); the
  card itself never changes, and its words keep their weight.
*/
const GoalCard = memo(function GoalCard({ goal, selected, onPick }: { goal: (typeof GOALS)[number]; selected: boolean; onPick: (id: Goal) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(goal.id)}
      aria-pressed={selected}
      data-goal={goal.id}
      className={cn(
        /* On a phone the four cards share the screen's height, so what is in each sits in its middle, as it did. */
        "relative isolate flex cursor-pointer items-center gap-3 rounded-2xl border border-[#e3e4e8] bg-white p-3.5 text-left transition-[border-color] duration-150 hover:border-[#c9cbd1] sm:items-start sm:p-5 sm:pb-7 [-webkit-tap-highlight-color:transparent]",
        focusRing,
      )}
    >
      <CardMark on={selected} tint="#f9fafb" />
      <span className="min-w-0 flex-1 pr-1">
        <h3 className="text-base font-semibold text-[#1a1a2e]">{goal.title}</h3>
        <span className="mt-1 block text-sm text-gray-500">{goal.text}</span>
      </span>
      {/* The box is the picture's size before it arrives, in the grey it sits on. */}
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[9px] bg-[#f1f2f4]">
        <img
          src={goalIcon(goal.id, 48)}
          srcSet={goalIconSet(goal.id)}
          width={48}
          height={48}
          alt=""
          decoding="async"
          draggable={false}
          className="block h-full w-full"
        />
      </span>
    </button>
  )
})

/*
  A TEMPLATE, ONE CARD AT EVERY WIDTH, picked as a Design tab theme is: the
  thin dark border round the card and the small ink check in the corner of
  its picture, both faded and scaled in (./choice-marks), the last pick's
  faded out. The picture is the page the template makes, with the creator's
  own photo in it, and the texture drawn by the live page's own layer
  (./wallpaper-layers). Memoised: a pick draws the two cards that changed,
  not all eighteen.
*/
const TemplateCard = memo(function TemplateCard({
  template,
  selected,
  onPick,
  avatarUrl,
  initial,
}: {
  template: (typeof THEME_TEMPLATES)[number]
  selected: boolean
  onPick: (id: string) => void
  avatarUrl: string | null
  initial: string
}) {
  const c = template.theme_config as (typeof THEME_TEMPLATES)[number]["theme_config"] & Record<string, any>
  const image = c.background_type === "image" ? TEMPLATE_THUMBS[template.id] || c.background_image_url || null : null
  const hero = (template as any).profile_layout === "hero" || c.header_layout === "hero"
  const pattern = c.background_pattern && c.background_pattern !== "none" && !image ? c.background_pattern : null
  const text = c.text_color || "#111111"
  return (
    <button
      type="button"
      onClick={() => onPick(template.id)}
      aria-pressed={selected}
      aria-label={`${template.name} template`}
      data-template-card={template.id}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-2xl border border-[#e3e4e8] bg-white p-1.5 text-left transition-[border-color] duration-150 hover:border-[#c9cbd1] [-webkit-tap-highlight-color:transparent]",
        focusRing,
      )}
    >
      <ChoiceMark on={selected} />
      <span className="relative block aspect-[3/4] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
        {image ? (
          <>
            <img src={image} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-black/40" />
          </>
        ) : (
          <span className="absolute inset-0" style={{ background: c.background_type === "gradient" && c.background_gradient ? c.background_gradient : c.background_color }} />
        )}
        {pattern ? <WallpaperPattern pattern={pattern} color={c.pattern_color || "#ffffff90"} level={c.pattern_opacity || "medium"} /> : null}
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          {hero ? (
            /* Hero: the photo across the top, fading into the page. */
            <>
              <span className="absolute left-0 right-0 top-0 h-[55%] overflow-hidden">
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${c.background_color} 100%)` }} />
                  </>
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-bold" style={{ backgroundColor: `${text}20`, color: text }}>
                    {initial}
                  </span>
                )}
              </span>
              <span className="relative mb-4 mt-auto flex flex-col items-center gap-1">
                <span className="block h-2 w-16 rounded" style={{ backgroundColor: `${text}50` }} />
                <span className="block h-1 w-12 rounded" style={{ backgroundColor: `${text}30` }} />
              </span>
            </>
          ) : (
            <>
              {/* A circle whatever the card's height: it keeps its size, and the column cannot squash it oval. */}
              <span data-theme-avatar="" className="w-10 h-10 aspect-square shrink-0 rounded-full relative overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${text}30` }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold" style={{ color: text }}>
                    {initial}
                  </span>
                )}
              </span>
              <span className="block h-2 w-16 rounded" style={{ backgroundColor: `${text}50` }} />
              <span className="block h-1 w-12 rounded" style={{ backgroundColor: `${text}30` }} />
            </>
          )}
          <span
            className="relative mt-2 block h-6 w-full max-w-[80px]"
            style={{
              background: c.button_style === "outline" ? "transparent" : c.button_color,
              borderStyle: "solid",
              borderWidth: c.button_style === "outline" ? Math.max(1.5, c.button_border_width || 0) : c.button_border_width || 0,
              borderColor: c.button_border_color || c.button_color,
              borderRadius: `${Math.min(c.button_border_radius ?? 8, 12)}px`,
            }}
          />
        </span>
        <CheckMark on={selected} className="right-1.5 top-1.5" />
      </span>
      <span data-template-name="" className="block truncate px-1.5 pb-1 pt-2 text-[13px] font-medium text-[#1a1a2e]">
        {template.name}
      </span>
    </button>
  )
})

/* What the last step says, in order. All three are drawn, one over the other (see Step 5). */
const SETUP_WORDS = [
  ["setting-up", "Setting up your OnePage"],
  ["just-a-moment", "Almost there"],
  ["ready", "Your OnePage is ready."],
] as const

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

  // Step 5 state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupPhase, setSetupPhase] = useState<"setting-up" | "just-a-moment" | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Track if setup has already run (prevents double execution)
  const hasCompletedRef = useRef(false)

  /*
    The goal pictures are asked for while the first step is read, and the two
    photo templates' pictures from the socials step on, in the browser's idle
    time and at low priority, so each step arrives with its pictures drawn.
    For the goals, the size this screen will draw (the srcset picks it).
  */
  const fetchTemplatesAhead = currentStep >= 3
  useEffect(() => {
    if (!open) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const run = () => {
      for (const goal of GOALS) preload(goalIcon(goal.id, 48), { as: "image", imageSrcSet: goalIconSet(goal.id), fetchPriority: "low" })
      if (fetchTemplatesAhead) for (const src of Object.values(TEMPLATE_THUMBS)) preload(src, { as: "image", fetchPriority: "low" })
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 600 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(run, 150)
    return () => window.clearTimeout(id)
  }, [open, fetchTemplatesAhead])

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

      /* One profile photo: the picture chosen here IS the account's photo,
         saved where it lives, so onboarding cannot leave a second face
         behind (app/api/account/avatar, lib/account/profile-follow). */
      await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: publicUrl }),
      }).catch(() => null)
      announceAvatar(publicUrl)

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

  // CRITICAL: Check completion AFTER all hooks but BEFORE rendering
  // Check both database AND localStorage
  const isCompletedInDb = onepage?.onboarding_completed === true
  const isCompletedInLocalStorage = typeof window !== "undefined" && onepage?.id 
    ? localStorage.getItem(`onepage_onboarding_done_${onepage.id}`) === "true"
    : false
  
  /*
    Unless it was finished here, just now: the last step marks the page done
    (in the database and in localStorage) a moment before it says "Your
    OnePage is ready." and throws the confetti, and this check used to take
    the whole modal away in that same render, so neither was ever seen. It
    closes when onComplete says so, four seconds later.
  */
  const finishingHere = currentStep === 5 && (isSettingUp || setupComplete)
  if ((isCompletedInDb || isCompletedInLocalStorage) && !finishingHere) {
    return null
  }

  const setupWords = setupComplete ? "ready" : setupPhase === "just-a-moment" ? "just-a-moment" : "setting-up"

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            // outline-none: when the pressed Next leaves (the last step has no buttons) focus falls to the modal, which drew a blue frame round the screen
            "p-0 gap-0 overflow-hidden border-0 outline-none",
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
              "flex-1 min-h-0 overflow-y-auto transition-[opacity,translate] duration-200 px-4 sm:px-12 pt-3 sm:pt-6",
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
                        The address as it will actually be: storelib.me/{name}
                        (lib/onepage/address). It used to read
                        "<handle>.storelib.com/links", then
                        "storelib.com/<handle>/links".
                      */}
                      <span className="text-base">
                        <span className="text-gray-400">{getOnePageDomain()}/</span>
                        <span className="text-black font-medium">{getSlug() || "username"}</span>
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

                  {/* p-0.5: room for a picked card's 2px border, which is drawn outside it */}
                  <div className="w-full max-w-[604px] grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 overflow-y-auto p-0.5 max-sm:flex-1 max-sm:pb-2">
                    {GOALS.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} selected={selectedGoal === goal.id} onPick={setSelectedGoal} />
                    ))}
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
                  <div className="text-center mb-3 sm:mb-5 shrink-0">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Choose a template
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Pick a style. You can change it later.
                    </p>
                  </div>

                  {/*
                    ONE GRID AT EVERY WIDTH. The phone had a grid and the
                    computer a carousel of four with arrows and dots, two
                    copies of every card that drifted apart (the carousel
                    went blank for 150ms on every page). Now it is one list
                    of equal cards that scrolls, two across on a phone and
                    five on a computer. p-1: room for a picked card's border.
                  */}
                  <div className="w-full max-w-[760px] flex-1 min-h-0 overflow-y-auto overscroll-contain p-1 pb-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {THEME_TEMPLATES.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          selected={selectedTemplate === template.id}
                          onPick={setSelectedTemplate}
                          avatarUrl={avatarUrl}
                          initial={displayName.charAt(0).toUpperCase() || "A"}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Setup - centered content */}
              {currentStep === 5 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px] sm:min-h-[350px] px-4 pt-6 sm:pt-0">
                  {/*
                    THE LOGO, WITH TWO RINGS LEAVING IT WHILE THE PAGE IS
                    BUILT. It had a dark square behind it that doubled in
                    size and vanished once a second (Tailwind's ping) under a
                    second one breathing, a grey block pulsing behind the
                    logo. Two thin rings in the logo's own shape now grow out
                    of it and fade, one after the other (app/globals.css
                    .onepage-setup-ring: transform and opacity, on the
                    compositor). When it is done they fade away and a green
                    check arrives on the logo's corner.
                  */}
                  <div data-setup-mark="" className="relative mb-6 mt-4 sm:mb-7 sm:mt-0 grid h-16 w-16 sm:h-20 sm:w-20 place-items-center">
                    <span aria-hidden className={cn("onepage-setup-halo pointer-events-none absolute inset-0", !isSettingUp && "onepage-setup-halo-off")}>
                      <span className="onepage-setup-ring" />
                      <span className="onepage-setup-ring onepage-setup-ring-late" />
                    </span>
                    <StorelibLogo size={80} fluid className="relative h-16 w-16 sm:h-20 sm:w-20" />
                    <span
                      aria-hidden
                      data-setup-done=""
                      className={cn(
                        "absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-[#16a34a] text-white shadow-[0_0_0_3px_#fff] transition-[opacity,scale] duration-300 ease-out",
                        setupComplete ? "scale-100 opacity-100" : "scale-50 opacity-0",
                      )}
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  </div>

                  {/*
                    THE WORDS CROSS, THEY DO NOT JUMP. Each line was mounted
                    in place of the last, so a change was the old words gone
                    in one frame and the new ones faded up from nothing. All
                    three lines are drawn now, one over the other in a single
                    grid cell, so the cell is always as tall and as wide as
                    the longest of them; a change fades the old line out and
                    the new one in, 100ms behind it. 21px on a phone and 27px
                    on a computer, 3px up from 18 and 24.
                  */}
                  <div data-setup-words="" className="grid text-center" role="status" aria-live="polite">
                    {SETUP_WORDS.map(([key, words]) => {
                      const shown = setupWords === key
                      return (
                        <h1
                          key={key}
                          aria-hidden={!shown}
                          className={cn(
                            "col-start-1 row-start-1 text-[21px] sm:text-[27px] font-bold leading-tight text-[#1a1a2e] transition-opacity ease-out motion-reduce:transition-none",
                            shown ? "opacity-100 duration-[260ms] delay-100" : "opacity-0 duration-[180ms]",
                          )}
                        >
                          {words}
                        </h1>
                      )
                    })}
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
