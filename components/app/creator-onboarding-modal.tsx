"use client"

import { useCallback, useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createPortal } from "react-dom"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { AVATAR_CHOSEN, onboardingPhoto } from "@/lib/account/avatar"
import { announceAvatar } from "@/lib/account/avatar-store"
import {
  ArrowLeft,
  Check,
  X,
  ChevronLeft,
  Instagram,
  Youtube,
  Loader2,
  Pencil,
  ShoppingBag,
  Search
} from "lucide-react"
import { useRouter } from "next/navigation"
import { PricingSection } from "@/components/marketing/pricing-section"
import { isNativeApp } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { TextSwap } from "@/components/ui/text-swap"
import { AvatarMark } from "@/components/app/app-avatar"
import type { OnboardingResume } from "@/lib/account/onboarding-resume"

/*
  ONE CLOCK FOR EVERY MOVE IN THE ONBOARDING. A step change is a crossfade:
  the next step arrives over STEP_IN_MS while the one on screen leaves over
  the shorter STEP_OUT_MS, both at once and on the same curve, drifting
  STEP_SHIFT px the way the flow is going. The two overlap, so there is never
  a frame with nothing on screen (the old one leaving first and the new one
  arriving after it left a blank beat between them), and the old one is
  mostly gone before the new one is clearly there, so they are never read as
  two pages on top of each other. The footer's buttons, the progress bar and
  the setup screen's lines move on the same curve.
*/
const STEP_IN_MS = 280
const STEP_OUT_MS = 160
const STEP_SHIFT = 16
/** Each piece of the setup screen rising into place (see SETUP ARRIVES). */
const SETUP_RISE_MS = 520
/** The blur of each 16px band at the foot of the panel, top to bottom (see THE FOOT OF THE PANEL). */
const VEIL_BLURS = [0.5, 1, 1.5, 2]
const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** A button or group that comes and goes with the step: it fades, and is gone for a press or a tab once it has. */
const fadeWith = (on: boolean, extra = ""): CSSProperties => ({
  opacity: on ? 1 : 0,
  visibility: on ? "visible" : "hidden",
  transition: `opacity 200ms ${MOTION_EASE}, visibility 0s linear ${on ? 0 : 200}ms${extra ? `, ${extra}` : ""}`,
})
/** The one line on the setup screen, whichever phase it names. */
const SETUP_LINE = "text-[20px] font-semibold leading-7 text-[#1a1a2e] sm:text-[22px]"
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/*
  ONE TYPE SCALE FOR EVERY STEP. The four steps had four sizes of heading
  (24, 24, 24 and 22px on a phone; 42, 42, 42 and 34 on a computer) and
  12px under them on a phone, which is smaller than the words in the fields
  below it. Now one heading and one line, in the app's own ink (#1a1a2e and
  #6b7280): 26px over 15px on a phone, 36px over 16px from 640px, with the
  same space beneath on every step, so moving between steps changes the
  words and nothing else.
*/
const HEADING = "text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] sm:text-[36px]"
const SUBHEADING = "mt-2 text-[15px] leading-[21px] text-[#6b7280] sm:text-[16px] sm:leading-6"
const HEADING_BLOCK = "text-center mb-6 sm:mb-7"

/** The step panel's edges: faded only where there is more to scroll to (see updateScrollEdges). */
const SCROLL_EDGE_MASK = "linear-gradient(to bottom, transparent 0, #000 var(--fade-top, 0px), #000 calc(100% - var(--fade-bottom, 0px)), transparent 100%)"

/*
  A LITTLE DEPTH, AND NO MORE. A field is a well: the same grey, with a
  hairline and a touch of shadow inside it, so it reads as somewhere to
  type rather than a grey shape. Next is the violet with a hairline of
  light along its top and a soft shadow under it; Back is white on a
  hairline. No gradients (CLAUDE.md).
*/
const FIELD_REST = "bg-[#f4f4f5] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05),inset_0_1px_2px_rgba(17,24,39,0.05)]"
const FIELD_WELL = "border-2 border-transparent bg-[#f4f4f5] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05),inset_0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,border-color,box-shadow] focus-within:border-[#1a1a2e] focus-within:bg-white focus-within:shadow-none"
const NEXT_ON = "bg-purple-600 text-white hover:bg-purple-700 shadow-[0_1px_2px_rgba(76,29,149,0.28),0_4px_12px_-4px_rgba(124,58,237,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]"
const BACK_LOOK = "bg-white text-[#374151] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.06)] hover:bg-[#f9fafb]"
const CATEGORY_PILL = "h-11 px-4 sm:px-5 rounded-full text-[14px] font-medium transition-[background-color,color,box-shadow]"
const CATEGORY_OFF = "bg-white text-[#374151] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.05)] hover:shadow-[0_0_0_1px_#d1d5db,0_1px_2px_rgba(17,24,39,0.08)]"
const CATEGORY_ON = "bg-[#1a1a2e] text-white shadow-[0_0_0_1px_#1a1a2e,0_2px_6px_-1px_rgba(26,26,46,0.35)]"

// TikTok icon
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

// Primary categories (first 16)
const PRIMARY_CATEGORIES = [
  "Templates",
  "Courses",
  "Guides",
  "Software",
  "Assets",
  "Communities",
  "Design Kits",
  "Audio",
  "Video",
  "Education",
  "Productivity",
  "Marketing",
  "Business",
  "Photography",
  "Writing",
  "Finance"
]

// Extended categories (30+ more)
const EXTENDED_CATEGORIES = [
  "3D Models",
  "Animations",
  "Apps",
  "Art",
  "Branding",
  "Coaching",
  "Consulting",
  "Content",
  "Crafts",
  "Data",
  "Developer Tools",
  "E-books",
  "Fashion",
  "Fitness",
  "Food & Recipes",
  "Gaming",
  "Graphics",
  "Health",
  "Illustrations",
  "Investing",
  "Legal",
  "Lifestyle",
  "Music",
  "Newsletter",
  "Notion Templates",
  "Podcast",
  "Print on Demand",
  "Real Estate",
  "SaaS",
  "Social Media",
  "Spreadsheets",
  "Startup",
  "Stock Photos",
  "Themes",
  "Trading",
  "UI Kits",
  "Web Design",
  "Wellness",
  "Workshops",
  // 30 more categories
  "Automation",
  "Beauty",
  "Blogging",
  "Calendars",
  "Checklists",
  "Copywriting",
  "Crypto",
  "Dance",
  "Digital Art",
  "Email Marketing",
  "Engineering",
  "Entrepreneurship",
  "Events",
  "Figma Templates",
  "Fonts",
  "Freelancing",
  "Home & Garden",
  "Icons",
  "Interior Design",
  "Journaling",
  "Language Learning",
  "Meditation",
  "Mindfulness",
  "Mockups",
  "Parenting",
  "Personal Finance",
  "Planners",
  "Presentation Templates",
  "Project Management",
  "Remote Work",
  "Resume Templates",
  "Self-Improvement",
  "SEO",
  "Side Hustle",
  "Spirituality",
  "Sports",
  "Study Notes",
  "Travel",
  "Video Editing",
  "Yoga",
  // 50 additional popular categories
  "AI Tools",
  "AI Prompts",
  "Amazon KDP",
  "Android Apps",
  "Arduino",
  "Astrology",
  "Bookkeeping",
  "Brand Strategy",
  "Canva Templates",
  "Career Coaching",
  "Children's Education",
  "Cinema LUTs",
  "Coding Courses",
  "Comic Art",
  "Conversion Optimization",
  "Cooking Classes",
  "Customer Support",
  "Cybersecurity",
  "Data Science",
  "Discord Communities",
  "Dropshipping",
  "Etsy Printables",
  "Excel Dashboards",
  "Game Assets",
  "Gumroad Templates",
  "HR & Recruiting",
  "iOS Apps",
  "Illustrator Brushes",
  "Interview Prep",
  "Kids Activities",
  "Kotlin Development",
  "Lead Magnets",
  "LinkedIn Growth",
  "Machine Learning",
  "Meal Plans",
  "Micro SaaS",
  "No-Code Tools",
  "Online Tutoring",
  "Packaging Design",
  "Paid Ads",
  "Pitch Decks",
  "Podcast Editing",
  "Prayer & Faith",
  "Procreate Brushes",
  "Product Research",
  "Public Speaking",
  "React Templates",
  "Sales Funnels",
  "Script Writing",
  "Shopify Apps",
  "Startup Legal",
  "Teaching Resources",
  "UI Animation",
  "Virtual Assistance",
  "Wedding Templates",
  "WordPress Themes",
  "YouTube Growth"
]

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

    // Create confetti from left and right
    for (let i = 0; i < 280; i++) {
      const fromLeft = i % 2 === 0
      confettiPieces.push({
        x: fromLeft ? -20 : canvas.width + 20,
        y: Math.random() * canvas.height * 0.5,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 12 + 6,
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 10 + 5),
        speedY: Math.random() * 4 - 2,
        rotationSpeed: Math.random() * 10 - 5,
        shape: Math.random() > 0.5 ? "rect" : "circle",
        opacity: 1,
      })
    }

    let animationId: number
    let frame = 0
    const maxFrames = 390 // 6.5 seconds at 60fps

    const animate = () => {
      if (frame >= maxFrames) {
        cancelAnimationFrame(animationId)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      confettiPieces.forEach((piece) => {
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

        piece.x += piece.speedX * (frame < 90 ? 1 : 0.97)
        piece.y += piece.speedY
        piece.speedY += 0.12
        piece.speedX *= 0.995
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

  if (typeof document === "undefined") return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        width: "100vw",
        height: "100vh",
        zIndex: 2147483647,
      }}
    />,
    document.body
  )
}

interface CreatorOnboardingModalProps {
  open: boolean
  onClose: () => void
  /** When the user returns from Stripe Checkout, pass the plan they chose so the modal can auto-resume setup. */
  resumeFromStripe?: { planId: "growth" | "pro" } | null
  /**
   * A second business being set up (lib/businesses): the way back to the
   * first one, at the top left, so starting a business is never a door that
   * only opens one way. It can be left half done and opened again from the
   * account menu, where it says "Setting up".
   */
  switchBack?: { name: string; onSwitch: () => Promise<void> } | null
  /**
   * A buyer becoming a seller (app/(auth)/sell): the way out, in the same
   * place as the way back above, to the page they came from. Nothing is
   * lost by leaving; /sell opens the setup again whenever they come back.
   * Ignored when there is a switchBack, which is the way out for a business.
   */
  leave?: { label: string; href: string } | null
  /**
   * A setup begun and not finished (lib/account/onboarding-resume): the store
   * name, bio and category typed last time, and the step it was left on.
   */
  resume?: OnboardingResume | null
}

export function CreatorOnboardingModal({ open, onClose, resumeFromStripe, switchBack = null, leave = null, resume = null }: CreatorOnboardingModalProps) {
  const router = useRouter()
  /*
    FULL SCREEN IN THE APP, AT EVERY WIDTH. Below 640px the onboarding has
    always been the whole screen; above it, a 930 by 540 card. In the iOS and
    Android apps a card with the dashboard's black showing round it reads as
    a website inside the app, and on an iPad it was one. Read after mount, so
    the server's HTML and the first client render agree.
  */
  const [nativeFullScreen, setNativeFullScreen] = useState(false)
  useEffect(() => {
    setNativeFullScreen(isNativeApp())
  }, [])
  const [switchingBack, setSwitchingBack] = useState(false)
  const [switchBackError, setSwitchBackError] = useState<string | null>(null)
  /* What went wrong going back stays long enough to read, then goes. */
  useEffect(() => {
    if (!switchBackError) return
    const t = setTimeout(() => setSwitchBackError(null), 6000)
    return () => clearTimeout(t)
  }, [switchBackError])
  const goBackToFirstBusiness = async () => {
    if (!switchBack || switchingBack) return
    setSwitchBackError(null)
    setSwitchingBack(true)
    try {
      await switchBack.onSwitch()
    } catch (e) {
      setSwitchingBack(false)
      setSwitchBackError(e instanceof Error ? e.message : "That business could not be opened. Try again.")
    }
  }
  const supabase = createClient()
  const redirectFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasResumedFromStripeRef = useRef(false)
  void onClose

  // Step management
  const [currentStep, setCurrentStep] = useState(1)
  /** The step on its way out, drawn under the new one while the two crossfade, and how far it was scrolled. */
  const [leavingStep, setLeavingStep] = useState<{ step: number; offset: number } | null>(null)
  /** The panel the steps are drawn in, so the next one starts at its top. */
  const stepScrollRef = useRef<HTMLDivElement | null>(null)
  /** The soft white over the foot of the panel, shown while there is more below (see THE FOOT OF THE PANEL). */
  const veilRef = useRef<HTMLDivElement | null>(null)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepEnterRef = useRef<HTMLDivElement | null>(null)
  const stepLeaveRef = useRef<HTMLDivElement | null>(null)
  /** Which way the step change that is about to render goes, or null to change without moving. */
  const stepMoveRef = useRef<"left" | "right" | null>(null)
  useEffect(() => () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
  }, [])
  /** Where the panel has more above or below it, fade that edge; nowhere else. Written on the element, not into state. */
  const updateScrollEdges = useCallback(() => {
    const el = stepScrollRef.current
    if (!el) return
    const above = el.scrollTop > 1
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    el.style.setProperty("--fade-top", above ? "20px" : "0px")
    el.style.setProperty("--fade-bottom", below ? "20px" : "0px")
    veilRef.current?.style.setProperty("--veil", below ? "1" : "0")
  }, [])
  useEffect(() => {
    const el = stepScrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    updateScrollEdges()
    const ro = new ResizeObserver(updateScrollEdges)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [open, currentStep, updateScrollEdges])

  // Step 1: Profile
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  // Step 2: Category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")

  // Step 3: Socials & Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [socials, setSocials] = useState({
    instagram: "",
    tiktok: "",
    youtube: ""
  })
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDraggingCrop, setIsDraggingCrop] = useState(false)
  const [isResizingCrop, setIsResizingCrop] = useState(false)
  const [dragStartCrop, setDragStartCrop] = useState({ x: 0, y: 0 })
  const [imageSizeCrop, setImageSizeCrop] = useState({ width: 300, height: 300 })

  // Step 4: Plan selection
  const [planCheckoutLoading, setPlanCheckoutLoading] = useState<"free" | "growth" | "pro" | null>(null)

  // Step 5: Setup
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupPhase, setSetupPhase] = useState<"creating" | "applying" | "almost" | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [redirectFailed, setRedirectFailed] = useState(false)
  const [setupError, setSetupError] = useState(false)

  const startDashboardRedirect = () => {
    setIsRedirecting(true)
    setRedirectFailed(false)

    if (redirectFailureTimerRef.current) {
      clearTimeout(redirectFailureTimerRef.current)
    }

    redirectFailureTimerRef.current = setTimeout(() => {
      setRedirectFailed(true)
    }, 12000)

    // Use hard navigation so the server-side layout always reads fresh DB state
    // after onboarding_completed is written — avoids bouncing back to /signup/success
    window.location.replace("/app")
  }

  useEffect(() => {
    return () => {
      if (redirectFailureTimerRef.current) {
        clearTimeout(redirectFailureTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isRedirecting) return

    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = "hidden"
    document.body.style.touchAction = "none"

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
    }
  }, [isRedirecting])

  /*
    PICKED UP WHERE IT WAS LEFT. What this person typed before, read back from
    the creator row the plan step wrote, and the plan step itself when they
    had reached it. Once, on opening; the name typed here is never replaced
    by the sign in's name the effect below reads.
  */
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!open || !resume || resumeFromStripe || resumedRef.current) return
    resumedRef.current = true
    if (resume.displayName) setDisplayName(resume.displayName)
    if (resume.bio) setBio(resume.bio)
    if (resume.category) setSelectedCategory(resume.category)
    if (resume.step > 1 && resume.displayName) setCurrentStep(resume.step)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resume, resumeFromStripe])

  // Resume onboarding after a Stripe redirect (user paid for Growth/Pro).
  // Restore saved form state from localStorage and jump straight to the setup step.
  useEffect(() => {
    if (!open || !resumeFromStripe || hasResumedFromStripeRef.current) return
    hasResumedFromStripeRef.current = true

    const savedRaw = localStorage.getItem("storelib_onboarding_state")
    if (!savedRaw) {
      // No saved state — just show the plan step so user can re-select
      setCurrentStep(4)
      return
    }

    try {
      const saved = JSON.parse(savedRaw)
      localStorage.removeItem("storelib_onboarding_state")
      // Restore state for display purposes and then auto-start setup with override data
      if (saved.displayName) setDisplayName(saved.displayName)
      if (saved.bio) setBio(saved.bio)
      if (saved.avatarUrl !== undefined) setAvatarUrl(saved.avatarUrl)
      if (saved.socials) setSocials(saved.socials)
      if (saved.selectedCategory !== undefined) setSelectedCategory(saved.selectedCategory)
      // Start setup immediately with the saved data so we don't depend on React
      // state being updated synchronously.
      startSetup({
        displayName: saved.displayName,
        bio: saved.bio,
        avatarUrl: saved.avatarUrl,
        socials: saved.socials,
        selectedCategory: saved.selectedCategory,
      })
    } catch {
      // Malformed localStorage — fall back to plan step
      setCurrentStep(4)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumeFromStripe])

  // Plan handlers ─────────────────────────────────────────────────────────────

  /** User chose the free plan — proceed straight to setup. */
  const handleSelectFree = () => {
    if (planCheckoutLoading) return
    setPlanCheckoutLoading("free")
    // Persist form state in case of unexpected page loss (not strictly needed for free)
    try {
      localStorage.setItem("storelib_onboarding_state", JSON.stringify({
        displayName, bio, avatarUrl, socials, selectedCategory, planId: "free",
      }))
    } catch {}
    startSetup()
  }

  /** User chose a paid plan — create a Stripe checkout session and redirect. */
  const handleSelectPaid = async (planId: "growth" | "pro") => {
    if (planCheckoutLoading) return
    setPlanCheckoutLoading(planId)

    const _slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "creator"

    // Persist form state so we can restore it when the user returns from Stripe.
    try {
      localStorage.setItem("storelib_onboarding_state", JSON.stringify({
        displayName, bio, avatarUrl, socials, selectedCategory, planId,
      }))
    } catch {}

    try {
      // The billing API requires a creators record. At this onboarding stage none
      // exists yet, so we create a minimal placeholder now. startSetup will update
      // it with the full profile data after Stripe returns.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setPlanCheckoutLoading(null)
        return
      }

      const { data: existingCreator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (!existingCreator) {
        const { error: createError } = await supabase
          .from("creators")
          .insert({
            user_id: user.id,
            slug: _slug,
            bio: bio || "",
            niche_tags: selectedCategory ? [selectedCategory] : [],
            onboarding_completed: false,
            store_published: false,
          })
        if (createError) {
          console.error("Failed to create creator record for checkout:", createError)
          setPlanCheckoutLoading(null)
          return
        }
      }

      const origin = window.location.origin
      const res = await fetch("/api/billing/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          /* Back to /sell, the one door into seller onboarding, which reopens the setup and finishes it. */
          successUrl: `${origin}/sell?stripe_success=1&tier=${planId}`,
          cancelUrl: `${origin}/sell`,
        }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      // API returned an error
      console.error("Checkout error:", data.error)
    } catch (err) {
      console.error("Failed to create checkout session:", err)
    }

    setPlanCheckoutLoading(null)
  }

  /*
    THE PHOTO IT STARTS WITH IS THE PROFILE'S (lib/account/avatar,
    onboardingPhoto). It was always the picture Google sent at sign in, so a
    person who had removed their photo got it back here, written into the
    profile, the creator page and the OnePage.
  */
  useEffect(() => {
    const loadUserAvatar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: own } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
      const start = onboardingPhoto({
        profileAvatar: (own as { avatar_url?: string | null } | null)?.avatar_url,
        providerAvatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        chosen: user.user_metadata?.[AVATAR_CHOSEN] === true,
      })
      if (start) setAvatarUrl(start)
      /* The sign in's name is only a starting point: never over a store name read back from a setup begun before. */
      if (user?.user_metadata?.full_name && !resume?.displayName) {
        setDisplayName(user.user_metadata.full_name)
      }
    }
    if (open) {
      loadUserAvatar()
    }
  }, [open])

  // Check username availability
  useEffect(() => {
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    if (!slug) {
      setUsernameAvailable(null)
      return
    }

    const checkAvailability = async () => {
      setCheckingUsername(true)
      try {
        // Check onepages table
        const { data: existing } = await supabase
          .from("onepages")
          .select("id")
          .eq("slug", slug)
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
  }, [displayName])

  // Get slug from display name
  const getSlug = () => {
    return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

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
    if (!tempImageUrl || !canvasRef.current) return

    setUploadingAvatar(true)

    try {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No canvas context')

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

      const nw = img.naturalWidth
      const nh = img.naturalHeight
      const scale = Math.min(300 / nw, 300 / nh)

      const srcX = cropBox.x / scale
      const srcY = cropBox.y / scale
      const srcSize = cropBox.size / scale

      ctx.clearRect(0, 0, outputSize, outputSize)
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
          'image/png',
          0.95
        )
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const fileName = `${user.id}/creator-avatar-${Date.now()}.png` // the owner's folder first: storage only lets a person write there
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true })

      if (uploadError) throw uploadError
      confirmUpload("avatars", fileName)

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      /* One profile photo: what is chosen here IS the account's photo, saved
         where it lives, so the account cannot come out of onboarding with a
         second face (app/api/account/avatar, lib/account/profile-follow). */
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

  // Check if can proceed to next step
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return true // Category is optional
      case 3:
        return true // Socials are optional
      // Step 4 (plan) has its own card buttons — Next is not shown there
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
        return true // Can skip category
      case 3:
        return true // Can skip socials
      default:
        return false
    }
  }

  /**
   * MOVING BETWEEN STEPS. The new step is drawn at once and the old one stays
   * beside it, in the same cell, while one fades and drifts in and the other
   * fades and drifts out (the layout effect below). The panel is back at its
   * top for the new step, and the old one is held where it was scrolled to,
   * so nothing on screen jumps. With less motion asked for, the step simply
   * changes.
   *
   * A second press while a step is still arriving is ignored. Before, two
   * presses in the same moment started two changes and skipped a step.
   */
  const showStep = (next: number, direction: "left" | "right", animate = true) => {
    /* A failed way back is about the moment it failed, not about every step after it. */
    setSwitchBackError(null)
    if (next === currentStep) return
    const calm = !animate || reducedMotion()
    stepMoveRef.current = calm ? null : direction
    setLeavingStep(calm ? null : { step: currentStep, offset: stepScrollRef.current?.scrollTop ?? 0 })
    setCurrentStep(next)
  }
  const goToStep = (next: number, direction: "left" | "right") => {
    if (leavingStep) return
    showStep(next, direction)
  }
  useLayoutEffect(() => {
    stepScrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
    const direction = stepMoveRef.current
    stepMoveRef.current = null
    if (!direction) return
    if (currentStep === 5) {
      /*
        SETUP ARRIVES, IT DOES NOT SLIDE IN. The plans were pushed sideways
        like a step of the form, and the mark, the line and the marks under
        it landed as one flat page. Now the plans settle back and fade, and
        the setup screen rises into place a piece at a time: the mark, then
        its line, then the marks, 70ms apart, each from a little lower and a
        little smaller. Opacity, translate and scale only.
      */
      stepLeaveRef.current?.animate(
        [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.97" }],
        { duration: STEP_OUT_MS + 40, easing: MOTION_EASE, fill: "forwards" },
      )
      stepEnterRef.current?.querySelectorAll<HTMLElement>("[data-setup-rise]").forEach((el, i) => {
        el.animate(
          [{ opacity: 0, translate: "0 12px", scale: "0.94" }, { opacity: 1, translate: "0 0", scale: "1" }],
          { duration: SETUP_RISE_MS, delay: 80 + i * 70, easing: MOTION_EASE, fill: "backwards" },
        )
      })
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      stepTimerRef.current = setTimeout(() => setLeavingStep(null), STEP_IN_MS)
      return
    }
    const dx = direction === "right" ? STEP_SHIFT : -STEP_SHIFT
    stepEnterRef.current?.animate(
      [{ opacity: 0, translate: `${dx}px 0` }, { opacity: 1, translate: "0 0" }],
      { duration: STEP_IN_MS, easing: MOTION_EASE },
    )
    stepLeaveRef.current?.animate(
      [{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: `${-dx}px 0` }],
      { duration: STEP_OUT_MS, easing: MOTION_EASE, fill: "forwards" },
    )
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    stepTimerRef.current = setTimeout(() => setLeavingStep(null), STEP_IN_MS)
  }, [currentStep])

  // Handle next step
  const handleNext = () => {
    if (!canProceed()) return
    // Steps 1-3 advance normally; step 3 → step 4 (plan selection)
    if (currentStep >= 4) return
    goToStep(currentStep + 1, "right")
  }

  // Handle back step
  const handleBack = () => {
    if (currentStep <= 1) return
    goToStep(currentStep - 1, "left")
  }

  // Handle skip
  const handleSkip = () => {
    if (!canSkip()) return
    handleNext()
  }

  // Start setup process
  // Accepts optional override data when resuming after a Stripe redirect (state was lost).
  const startSetup = async (overrideData?: {
    displayName?: string
    bio?: string
    avatarUrl?: string | null
    socials?: { instagram: string; tiktok: string; youtube: string }
    selectedCategory?: string | null
  }) => {
    // Resolve effective values — override data wins over React state.
    const _dn = overrideData?.displayName ?? displayName
    const _bio = overrideData?.bio ?? bio
    const _av = overrideData?.avatarUrl !== undefined ? overrideData.avatarUrl : avatarUrl
    const _soc = overrideData?.socials ?? socials
    const _cat = overrideData?.selectedCategory !== undefined ? overrideData.selectedCategory : selectedCategory
    const _slug = _dn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

    /* From the plan step it crossfades like any other step; back from Stripe it is simply there. */
    showStep(5, "right", !overrideData)
    setIsSettingUp(true)

    // Phase 1: Creating your profile... (2 seconds)
    setSetupPhase("creating")
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Phase 2: Applying your settings... (2 seconds)
    setSetupPhase("applying")

    // Actually save the data
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Get creator ID (use maybeSingle to not throw error if no record exists)
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      // Update profile to mark as creator and welcome completed
      await supabase
        .from("profiles")
        .update({
          is_creator: true,
          welcome_completed: true,
          username: _slug,
          display_name: _dn,
          avatar_url: _av,
        })
        .eq("id", user.id)

      if (creator) {
        // Update creator profile - only use columns that exist in the database
        await supabase
          .from("creators")
          .update({
            slug: _slug,
            bio: _bio,
            niche_tags: _cat ? [_cat] : [],
            onboarding_completed: true,
            store_published: true,
          })
          .eq("id", creator.id)

        // Build the header settings with social data
        const headerSettings = {
          title: _dn,
          subtitle: _bio,
          avatarUrl: _av,
          categoryBadge: _cat,
          showSocialMedia: true,
          showSocialIconsOnMobile: true,
          socialLinks: {
            instagram: { enabled: !!_soc.instagram, url: _soc.instagram ? `https://instagram.com/${_soc.instagram.replace('@', '')}` : "" },
            tiktok: { enabled: !!_soc.tiktok, url: _soc.tiktok ? `https://tiktok.com/@${_soc.tiktok.replace('@', '')}` : "" },
            youtube: { enabled: !!_soc.youtube, url: _soc.youtube || "" },
            twitter: { enabled: false, url: "" },
            spotify: { enabled: false, url: "" },
          }
        }

        // Update or create store builder config for shop page
        const { data: existingConfig } = await supabase
          .from("store_builder_configs")
          .select("id, draft_config")
          .eq("creator_id", creator.id)
          .eq("page_type", "shop")
          .maybeSingle()

        if (existingConfig) {
          // Update existing config with header section data
          const draftConfig = existingConfig.draft_config || {}
          let sections = draftConfig.sections || []

          // Find header section and update it, or add one if missing
          const headerIndex = sections.findIndex((s: any) => s.type === "header")
          if (headerIndex !== -1) {
            sections[headerIndex] = {
              ...sections[headerIndex],
              settings: {
                ...sections[headerIndex].settings,
                ...headerSettings
              }
            }
          } else {
            // No header section exists, add one at the beginning
            sections = [{ id: "header-1", type: "header", settings: headerSettings }, ...sections]
          }

          // IMPORTANT: Store Builder UI reads from headerSettings.socialLinks, not sections[header].settings
          // So we need to save social links to BOTH locations
          await supabase
            .from("store_builder_configs")
            .update({
              draft_config: {
                ...draftConfig,
                sections,
                headerSettings: {
                  ...draftConfig.headerSettings,
                  ...headerSettings
                }
              }
            })
            .eq("id", existingConfig.id)
        } else {
          // No config exists, create one with header section for SHOP page
          // IMPORTANT: Save to BOTH sections AND headerSettings
          await supabase
            .from("store_builder_configs")
            .insert({
              creator_id: creator.id,
              page_type: "shop",
              draft_config: {
                sections: [{ id: "header-1", type: "header", settings: headerSettings }],
                headerSettings: headerSettings
              },
            })
        }

        // Update or create onepage with the same data
        const { data: onepage } = await supabase
          .from("onepages")
          .select("id")
          .eq("creator_id", creator.id)
          .maybeSingle()

        // Build social_links JSONB for OnePage (used by OnePage context)
        const onepageSocialLinks = {
          instagram: _soc.instagram ? `https://instagram.com/${_soc.instagram.replace('@', '')}` : null,
          tiktok: _soc.tiktok ? `https://tiktok.com/@${_soc.tiktok.replace('@', '')}` : null,
          youtube: _soc.youtube || null,
        }

        if (onepage) {
          await supabase
            .from("onepages")
            .update({
              slug: _slug,
              title: _dn,
              bio: _bio,
              avatar_url: _av,
              // Direct columns (for backward compatibility)
              instagram: onepageSocialLinks.instagram,
              tiktok: onepageSocialLinks.tiktok,
              youtube: onepageSocialLinks.youtube,
              // JSONB column (used by OnePage TypeScript type)
              social_links: onepageSocialLinks,
            })
            .eq("id", onepage.id)
        } else {
          // No onepage exists, create one
          await supabase
            .from("onepages")
            .insert({
              owner_id: user.id,
              creator_id: creator.id,
              seller_id: user.id,
              slug: _slug,
              title: _dn,
              bio: _bio,
              avatar_url: _av,
              // Direct columns (for backward compatibility)
              instagram: onepageSocialLinks.instagram,
              tiktok: onepageSocialLinks.tiktok,
              youtube: onepageSocialLinks.youtube,
              // JSONB column (used by OnePage TypeScript type)
              social_links: onepageSocialLinks,
              // Set to false so OnePage onboarding shows when user visits OnePage editor
              onboarding_completed: false,
            })
        }
      } else {
        // Create new creator record - only use columns that exist in the database
        const { data: newCreator, error: insertError } = await supabase
          .from("creators")
          .insert({
            user_id: user.id,
            slug: _slug,
            bio: _bio,
            niche_tags: _cat ? [_cat] : [],
            onboarding_completed: true,
            store_published: true,
          })
          .select("id")
          .single()

        if (insertError) {
          console.error("Error creating creator:", insertError)
        } else if (newCreator) {
          // Build social_links JSONB for new creator's OnePage
          const newCreatorSocialLinks = {
            instagram: _soc.instagram ? `https://instagram.com/${_soc.instagram.replace('@', '')}` : null,
            tiktok: _soc.tiktok ? `https://tiktok.com/@${_soc.tiktok.replace('@', '')}` : null,
            youtube: _soc.youtube || null,
          }

          // Create onepage record with social data
          const { data: newOnepage } = await supabase
            .from("onepages")
            .insert({
              owner_id: user.id,
              creator_id: newCreator.id,
              seller_id: user.id,
              slug: _slug,
              title: _dn,
              bio: _bio,
              avatar_url: _av,
              // Direct columns (for backward compatibility)
              instagram: newCreatorSocialLinks.instagram,
              tiktok: newCreatorSocialLinks.tiktok,
              youtube: newCreatorSocialLinks.youtube,
              // JSONB column (used by OnePage TypeScript type)
              social_links: newCreatorSocialLinks,
              // Set to false so OnePage onboarding shows when user visits OnePage editor
              onboarding_completed: false,
            })
            .select("id")
            .single()

          // Create store builder config with social data in header
          const newCreatorHeaderSettings = {
            title: _dn,
            subtitle: _bio,
            avatarUrl: _av,
            categoryBadge: _cat,
            showSocialMedia: true,
            showSocialIconsOnMobile: true,
            socialLinks: {
              instagram: { enabled: !!_soc.instagram, url: _soc.instagram ? `https://instagram.com/${_soc.instagram.replace('@', '')}` : "" },
              tiktok: { enabled: !!_soc.tiktok, url: _soc.tiktok ? `https://tiktok.com/@${_soc.tiktok.replace('@', '')}` : "" },
              youtube: { enabled: !!_soc.youtube, url: _soc.youtube || "" },
              twitter: { enabled: false, url: "" },
              spotify: { enabled: false, url: "" },
            }
          }
          const defaultSections = [
            {
              id: "header-1",
              type: "header",
              settings: newCreatorHeaderSettings
            }
          ]

          // IMPORTANT: Save to BOTH sections AND headerSettings
          // Store Builder UI reads from headerSettings.socialLinks
          await supabase
            .from("store_builder_configs")
            .insert({
              creator_id: newCreator.id,
              page_type: "shop",
              draft_config: {
                sections: defaultSections,
                headerSettings: newCreatorHeaderSettings
              },
            })
        }
      }
    } catch (e) {
      console.error("Error during setup:", e)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Phase 3: Almost ready... — finalize API runs concurrently with the 2s delay.
    // The finalize API uses the admin/service-role client (bypasses RLS) to guarantee
    // onboarding_completed = true is written. We retry up to 3 times before giving up.
    setSetupPhase("almost")

    const callFinalize = async (): Promise<boolean> => {
      // Include the access token in the Authorization header so the finalize
      // API can authenticate Capacitor users whose session lives in Preferences
      // (not cookies) and would otherwise fail the server-side auth check.
      let accessToken: string | undefined
      try {
        const { data: { session } } = await supabase.auth.getSession()
        accessToken = session?.access_token
      } catch {}

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1200))
          const headers: Record<string, string> = { "Content-Type": "application/json" }
          if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`
          const res = await fetch("/api/onboarding/finalize", {
            method: "POST",
            headers,
            body: JSON.stringify({ role: "creator", creatorSlug: _slug }),
          })
          const data = await res.json().catch(() => ({ ok: false }))
          if (data.ok) return true
          console.error(`[onboarding] finalize attempt ${attempt + 1} failed:`, data.error)
        } catch (err) {
          console.error(`[onboarding] finalize attempt ${attempt + 1} network error:`, err)
        }
      }
      return false
    }

    const [, finalizeOk] = await Promise.all([
      new Promise((resolve) => setTimeout(resolve, 2000)),
      callFinalize(),
    ])

    if (!finalizeOk) {
      // All retries failed — show error state instead of redirecting to a broken /app
      setIsSettingUp(false)
      setSetupPhase(null)
      setSetupError(true)
      return
    }

    // Complete — finalize succeeded, safe to redirect
    setIsSettingUp(false)
    setSetupPhase(null)
    setSetupComplete(true)
    setShowConfetti(false)
    startDashboardRedirect()
  }

  // Progress bar width (5 steps total)
  const progressWidth = (currentStep / 5) * 100

  // Filter categories for search
  const allCategories = [...PRIMARY_CATEGORIES, ...EXTENDED_CATEGORIES]
  const filteredCategories = categorySearch
    ? allCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()))
    : EXTENDED_CATEGORIES

  /**
   * ONE STEP'S CONTENT, BY NUMBER. Drawn for the step on screen and, for
   * the moment a step change takes, for the one leaving beside it.
   */
  const renderStep = (step: number) => (
    <>
        {/* Step 1: Let's get started */}
        {step === 1 && (
          <div className="flex flex-col items-center">
            <div className={HEADING_BLOCK}>
              <h1 className={HEADING}>
                Name your store
              </h1>
              <p className={SUBHEADING}>
                You can change it later, and everything else too.
              </p>
            </div>

            {/* Input fields */}
            <div className="w-full max-w-[600px] space-y-3 sm:space-y-4">
              {/* Username input - with shop bag icon */}
              <div className="relative">
                <div className={cn(
                  "flex items-center gap-3 px-5 h-[56px] rounded-[14px] transition-[background-color,box-shadow]",
                  usernameFocused
                    ? "bg-white shadow-[0_0_0_2px_#1a1a2e]"
                    : FIELD_REST
                )}>
                  <ShoppingBag className="w-5 h-5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => setUsernameFocused(false)}
                    placeholder="Your store name"
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
              <div className={cn("flex items-center gap-3 px-5 h-[56px] rounded-[14px]", FIELD_REST)}>
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="text-base">
                  <span className="text-black font-medium">{getSlug() || "username"}</span>
                  <span className="text-gray-400">.storelib.com</span>
                </span>
              </div>

              {/* Bio input */}
              <div className={cn("flex items-start gap-3 px-5 py-4 min-h-[56px] rounded-[14px]", FIELD_WELL)}>
                <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us a few words about you..."
                  rows={2}
                  className="flex-1 text-base outline-none bg-transparent resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Store Category */}
        {step === 2 && (
          <div className="flex flex-col items-center">
            <div className={HEADING_BLOCK}>
              <h1 className={HEADING}>
                Store category
              </h1>
              <p className={SUBHEADING}>
                Choose what best fits your store.
              </p>
            </div>

            {/* Category pills */}
            {/*
              Each category a white pill on a hairline, the chosen one
              near black; the ring is a shadow, not a border, so
              choosing one changes its colour and not its size.
              "Other" sits with "See more" at the end of the pills,
              where the choice is made: in the row of buttons at the
              bottom it read as a way through the step, beside Skip.
            */}
            <div data-onboarding-categories="" className="w-full max-w-[650px] flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {PRIMARY_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                  className={cn(CATEGORY_PILL, selectedCategory === category ? CATEGORY_ON : CATEGORY_OFF)}
                >
                  {category}
                </button>
              ))}

              {/* Show selected extended category inline so user can see it */}
              {selectedCategory && !PRIMARY_CATEGORIES.includes(selectedCategory) && (
                <button
                  key={selectedCategory}
                  type="button"
                  aria-pressed="true"
                  onClick={() => setSelectedCategory(null)}
                  className={cn(CATEGORY_PILL, CATEGORY_ON)}
                >
                  {selectedCategory}
                </button>
              )}

              {/* See more and Other, together, so a wrap never parts them. */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="h-11 px-3.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e]"
                >
                  See more
                </button>
                <span aria-hidden="true" className="h-4 w-px bg-[#e5e7eb]" />
                <button
                  type="button"
                  data-onboarding-other=""
                  onClick={() => {
                    setSelectedCategory(null)
                    handleNext()
                  }}
                  className="h-11 px-3.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:text-[#1a1a2e]"
                >
                  Other
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Step 3: Socials & Profile */}
        {step === 3 && (
          <div className="flex flex-col items-center">
            <div className={HEADING_BLOCK}>
              <h1 className={HEADING}>
                Add your socials
              </h1>
              <p className={SUBHEADING}>
                These will appear on your OnePage
              </p>
            </div>

            <div className="w-full max-w-[600px] flex flex-col sm:flex-row gap-4 sm:gap-8">
              {/* Avatar section */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#F3F3F3] flex items-center justify-center overflow-hidden border-2 border-gray-200">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-gray-400">
                      {displayName.trim() ? displayName.charAt(0).toUpperCase() : <AvatarMark name="" size={96} />}
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
                <div className={cn("flex items-center gap-3 px-4 sm:px-5 h-[52px] sm:h-[56px] rounded-[14px]", FIELD_WELL)}>
                  <Instagram className="w-5 h-5 text-pink-500 shrink-0" />
                  <span className="text-sm sm:text-base text-gray-500 select-none shrink-0 -mr-2">@</span>
                  <input
                    type="text"
                    value={socials.instagram}
                    onChange={(e) => setSocials({ ...socials, instagram: e.target.value.replace(/@/g, "") })}
                    placeholder="username"
                    className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                  />
                </div>

                {/* TikTok */}
                <div className={cn("flex items-center gap-3 px-4 sm:px-5 h-[52px] sm:h-[56px] rounded-[14px]", FIELD_WELL)}>
                  <TikTokIcon className="w-5 h-5 shrink-0" />
                  <span className="text-sm sm:text-base text-gray-500 select-none shrink-0 -mr-2">@</span>
                  <input
                    type="text"
                    value={socials.tiktok}
                    onChange={(e) => setSocials({ ...socials, tiktok: e.target.value.replace(/@/g, "") })}
                    placeholder="username"
                    className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                  />
                </div>

                {/* YouTube */}
                <div className={cn("flex items-center gap-3 px-4 sm:px-5 h-[52px] sm:h-[56px] rounded-[14px]", FIELD_WELL)}>
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

        {/* Step 4: Choose a Plan */}
        {step === 4 && (
          <div className="flex flex-col">
            <div className={HEADING_BLOCK}>
              <h1 className={HEADING}>
                Choose your plan
              </h1>
              <p className={SUBHEADING}>
                Start free and upgrade when you need to.
              </p>
            </div>

            <PricingSection
              compact
              hideDetailsLink
              onboardingCallbacks={{
                onPlanSelect: (planId) => {
                  if (planId === "free") handleSelectFree()
                  else handleSelectPaid(planId)
                },
                loadingPlan: planCheckoutLoading,
                ctaLabels: {
                  free: "Start free",
                  growth: "Get Pro",
                },
              }}
            />
          </div>
        )}

        {/*
          ═══════════════════════════════════════════════════════════
           THE LAST STEP: SETTING UP, IN ONE CALM PLACE
          ═══════════════════════════════════════════════════════════
          It drew its own copy of the mark inside a white rounded box
          that clipped it: the box's corners and the mark's own did not
          match, so the violet tile was cut at every corner, with two
          pulsing squares behind it. Now the one mark
          (components/storelib-mark), whole, with a soft shadow that
          follows its shape, and under it one line at a time that
          crossfades as setup moves on, over three short marks that
          fill as each phase finishes. Nothing in it changes size, so
          the screen holds still between phases.
        */}
        {step === 5 && (() => {
          const state = setupError ? "error" : setupComplete ? "done" : setupPhase ?? "creating"
          const reached = state === "done" ? 3 : state === "almost" ? 2 : state === "applying" ? 1 : 0
          return (
            <div data-onboarding-setup={state} className="flex h-full min-h-[300px] flex-col items-center justify-center px-4 pb-6 text-center sm:min-h-[360px]">
              {/*
                A little smaller again (54px on a phone, 62 from 640, from 61
                and 68) and lifted a little off the page: a soft shadow under
                the mark's own 7px corner, on a box around it, so the mark
                keeps the one hairline every logo has.
              */}
              <span data-setup-rise="" data-onboarding-setup-mark-box="" className="block rounded-[7px] shadow-[0_10px_22px_-10px_rgba(26,26,46,0.30),0_3px_8px_-4px_rgba(26,26,46,0.12)]">
                <StorelibLogo size={62} fluid className="block h-[54px] w-[54px] sm:h-[62px] sm:w-[62px]" />
              </span>
              {/*
                Every phase's line is laid out in one cell and crossfades to
                the next with a short roll (components/ui/text-swap): the new
                line arrives as the old one goes, never after a blank beat,
                and the cell is the size of the longest, so nothing under it
                moves. The marks and Try again share a cell the same way.
              */}
              <div data-setup-rise="" className="mt-6" aria-live="polite">
                <TextSwap
                  as="div"
                  align="center"
                  value={state}
                  /* Half a line of roll, not a third: the line going and the one coming pass each other instead of sitting on top of each other mid way. */
                  lift="0.55em"
                  items={{
                    creating: <h1 className={SETUP_LINE}>Creating your store</h1>,
                    applying: <h1 className={SETUP_LINE}>Applying your settings</h1>,
                    almost: <h1 className={SETUP_LINE}>Almost ready</h1>,
                    done: (
                      <h1 className={cn(SETUP_LINE, "inline-flex items-center gap-2.5")}>
                        Your store is ready
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] shadow-[0_1px_2px_rgba(22,163,74,0.35)]">
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                        </span>
                      </h1>
                    ),
                    error: (
                      <div>
                        <h1 className={SETUP_LINE}>Your store was not saved</h1>
                        <p className="mt-1.5 text-[15px] leading-[21px] text-[#6b7280]">Check your connection and try again.</p>
                      </div>
                    ),
                  }}
                />
              </div>
              <div data-setup-rise="" className="mt-2">
              <TextSwap
                as="div"
                align="center"
                lift="6px"
                value={state === "error" ? "retry" : "progress"}
                items={{
                  progress: (
                    <div className="flex gap-1.5 pt-1" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-1 w-8 overflow-hidden rounded-full bg-[#ede9fe]">
                          {/* Slid in from the left and clipped, so a mark fills on `translate` and its round end is never squashed. */}
                          <span
                            data-onboarding-setup-mark=""
                            className="block h-full w-full rounded-full bg-[#8b5cf6] motion-reduce:!transition-none"
                            style={{ translate: `${(i < reached ? 1 : i === reached ? 0.45 : 0) * 100 - 100}% 0`, transition: `translate 480ms ${MOTION_EASE}` }}
                          />
                        </span>
                      ))}
                    </div>
                  ),
                  retry: (
                    <button
                      type="button"
                      onClick={() => {
                        setSetupError(false)
                        startSetup()
                      }}
                      className={cn("h-11 rounded-xl px-6 text-[14px] font-semibold transition-[background-color,box-shadow]", NEXT_ON)}
                    >
                      Try again
                    </button>
                  ),
                }}
              />
              </div>
            </div>
          )
        })()}
    </>
  )

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
                  /*
                    Desktop: the 1040 by 610 card, and never wider or taller
                    than the window it is in. It was 930 by 540; "increase the
                    whole modal a bit so it expands a little more on the
                    screen, but without touching the edges" made it about 12%
                    larger each way. The card was once 930px from 640px up, so
                    on a 768px tablet held upright it hung 81px off each side:
                    Back and Next were off the screen. It keeps its size where
                    there is room and takes the window's, less 24px on every
                    side, where there is not (a 1280 by 720 laptop keeps 55px
                    above and below it; a short window keeps 24px).
                  */
                  "sm:w-[1040px] sm:max-w-[calc(100vw-48px)] sm:h-[610px] sm:max-h-[calc(100dvh-48px)] sm:rounded-[44px]",
                  // Mobile: true fullscreen experience
                  "w-[calc(100%-24px)] max-w-none max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:w-screen max-sm:h-[100dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
                  // Shadow
                  "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
                ),
            // Hide the close button
            "[&>button]:hidden",
            /* Focus lands on the dialog itself when the button pressed goes with its step; that is not a place to draw a ring round the screen. */
            "outline-none focus:outline-none focus-visible:outline-none"
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className={cn(
            "flex flex-col h-full bg-white",
            nativeFullScreen
              ? "max-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              /* The card's own limit, window included: a short window kept the column 610px tall inside a shorter card, and Back and Next were cut off under its edge. */
              : "sm:max-h-[min(610px,calc(100dvh-48px))] max-sm:max-h-[100dvh] max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]",
          )}>
            {/*
              ═══════════════════════════════════════════════════════════════
               THE TOP ROW: THE WAY BACK, THE PROGRESS, AND NOTHING TOUCHING
              ═══════════════════════════════════════════════════════════════
              The way back to the first business was placed absolutely at the
              left while the bar was centred in the whole width, so the two
              knew nothing about each other. On a 390px phone the bar begins
              at 115px and the button could reach 212px: a name of any length
              ran under the bar. They were not even on the same line, the
              button's middle at 26px and the bar's at 19px.

              One row of three columns now (1fr auto 1fr). The bar is the
              middle column, centred between the edges whatever is beside it;
              the button has the column to its left and cannot leave it, so
              however long the name is it truncates instead of reaching the
              bar; the third column is the first one's width, which is what
              keeps the bar in the middle of the row rather than in the
              middle of what is left. A phone shows the arrow alone, its
              44px press, with the name as its label: at 320px there is no
              room for a name beside a 160px bar, and a name cut to five
              letters says less than the arrow does. From 640px the name is
              beside it. scripts/check-onboarding.mjs measures the gap, the
              middles and the press at six widths.

              What went wrong is kept out of the row: an error under an
              absolutely placed button used to be drawn over the heading.
            */}
            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-3 sm:gap-4 sm:px-6 sm:pt-7">
              <div className="flex min-w-0 items-center justify-start">
                {!switchBack && leave && (
                  <a
                    href={leave.href}
                    data-onboarding-leave=""
                    aria-label={leave.label}
                    className="inline-flex h-11 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 max-sm:w-11 sm:h-10 sm:justify-start sm:px-2"
                  >
                    <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
                    <span className="hidden truncate sm:inline">{leave.label}</span>
                  </a>
                )}
                {switchBack && (
                  <button
                    type="button"
                    onClick={goBackToFirstBusiness}
                    disabled={switchingBack}
                    data-onboarding-switch-back=""
                    aria-label={`Back to ${switchBack.name}`}
                    className="inline-flex h-11 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 max-sm:w-11 sm:h-10 sm:justify-start sm:px-2"
                  >
                    {switchingBack ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" /> : <ArrowLeft className="h-[18px] w-[18px] shrink-0" />}
                    <span className="hidden truncate sm:inline">{switchBack.name}</span>
                  </button>
                )}
              </div>
              <div data-onboarding-progress="" className="h-[6px] w-[160px] overflow-hidden rounded-full bg-gray-200 sm:h-[8px] sm:w-[200px]">
                {/*
                  A full length fill slid in from the left, clipped by the track,
                  so the bar grows on `translate` alone (no layout, nothing
                  squashed: its round end stays round), on the steps' curve.
                */}
                <div
                  data-onboarding-progress-fill=""
                  className="h-full w-full rounded-full bg-purple-600 motion-reduce:!transition-none"
                  style={{ translate: `${progressWidth - 100}% 0`, transition: `translate 480ms ${MOTION_EASE}` }}
                />
              </div>
              <div aria-hidden="true" />
            </div>
            {switchBackError && (
              <p role="alert" className="shrink-0 px-3 pt-1.5 text-center text-[12px] text-red-600 sm:px-6">{switchBackError}</p>
            )}

            {/*
              ONE STEP LEAVES, THE NEXT ARRIVES, AND THE BOX AROUND THEM
              HOLDS STILL. This was `transition-all` on the scroller itself:
              every step carries its own bottom padding, so changing step
              animated the padding, the height and the scroll box as well as
              the fade, none of which the compositor can do on its own, and
              the panel it all happens in is the one being scrolled. Now the
              scroller is fixed and only what is inside it moves, on opacity
              and `translate`, the two a phone animates without laying out
              or drawing a frame again. The leaving step and the arriving one
              share one grid cell for the moment they crossfade, so the cell
              is as tall as the taller of them and nothing under it moves. A
              person who has asked for less motion gets the change with no
              movement at all.
            */}
            {/*
              THE EDGES OF WHAT SCROLLS FADE, THEY ARE NOT CUT. On the plan
              step a phone scrolls the plans, and they were sliced off in a
              hard line against the progress bar above and the Back button
              below. Now whatever runs past an edge fades out over 20px, and
              only at an edge that has more behind it: the top is sharp
              until something has scrolled under it. The two values are set
              on the element from the scroll itself (no render per scroll).
            */}
            <div
              ref={stepScrollRef}
              onScroll={updateScrollEdges}
              data-onboarding-scroller=""
              style={{ maskImage: SCROLL_EDGE_MASK, WebkitMaskImage: SCROLL_EDGE_MASK }}
              className={cn(
                "flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-12 pt-5 sm:pt-6",
                (currentStep === 1 || currentStep === 3) && "max-sm:pb-4",
                currentStep === 2 && "max-sm:pb-2",
                currentStep === 4 && "pb-4 sm:pb-6",
              )}
            >
            <div data-onboarding-steps="" className="grid min-h-full">
              {leavingStep && (
                <div
                  key={leavingStep.step}
                  ref={stepLeaveRef}
                  data-onboarding-leaving={leavingStep.step}
                  aria-hidden="true"
                  inert
                  className="pointer-events-none [grid-area:1/1]"
                  /* Where it was on screen: the panel is back at its top for the new step, so the old one is held where it was scrolled to. */
                  style={{ marginTop: -leavingStep.offset }}
                >
                  {renderStep(leavingStep.step)}
                </div>
              )}
              <div key={currentStep} ref={stepEnterRef} data-onboarding-step={currentStep} className="[grid-area:1/1]">
                {renderStep(currentStep)}
              </div>
            </div>
            </div>

            {/*
              THE FOOT OF THE PANEL: A SOFT WHITE, LIGHTLY BLURRED. The plans
              ran into a flat white bar over the Back button, cut 20px above
              it. Over the last 64px of the panel the page now goes softly to
              white, and what is under it is blurred a little more the lower
              it is: four 16px bands at 0.5, 1, 1.5 and 2px, so no band is
              more than half a pixel of blur from the next and there is no
              line where the blur starts. (One blurred box faded with a mask
              would be simpler, but Chrome draws the blur under a mask
              whole, with a hard top edge.) The white is on top of the
              bands. It takes no room (its negative margin gives back its
              height), it never takes a tap, and it is only there while there
              is more to scroll to.
            */}
            <div
              ref={veilRef}
              aria-hidden="true"
              data-onboarding-veil=""
              className="pointer-events-none relative z-10 -mt-16 h-16 shrink-0"
            >
              {VEIL_BLURS.map((blur, i) => (
                <div
                  key={blur}
                  data-onboarding-veil-band=""
                  className="absolute inset-x-0 h-4 motion-reduce:!transition-none"
                  style={{ top: i * 16, opacity: "var(--veil, 0)", transition: `opacity 220ms ${MOTION_EASE}`, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)` }}
                />
              ))}
              <div
                className="absolute inset-0 motion-reduce:!transition-none"
                style={{ opacity: "var(--veil, 0)", transition: `opacity 220ms ${MOTION_EASE}`, background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.88) 82%, #fff 100%)" }}
              />
            </div>

            {/*
              THE ROW OF BUTTONS FITS THE NARROWEST PHONE SOLD. On the
              category step it was four of them, Back, Other, Skip and Next,
              and at 320px (an iPhone SE, and any phone with the text size
              turned up) they came to 368px: Next hung off the right edge.
              Other now sits with See more among the categories.
              Under 384px, which is the width the roomy row stops fitting at,
              each one gives up some of its side padding and Next some of its
              floor: 291px, with 8px between any two, at 320. The words and
              the heights do not change, so the press stays 44px and nothing
              reads as a different button.
            */}
            {/*
              ONE ROW OF BUTTONS FOR EVERY STEP. It used to be three: Back,
              Skip and Next on the first three steps, Back alone on the plan
              step, and a 64px gap on the last, each swapped in whole as the
              step changed, so Back popped in on step 2, Skip and Next
              vanished on the plan step, and the panel above grew 4 to 8px as
              setup began. Now the row is always there at the same height
              and each button fades in or out with its step, on the step's
              own curve, and cannot be pressed or reached by Tab while it is
              gone.
            */}
            <div
              data-onboarding-footer=""
              aria-hidden={currentStep === 5 || undefined}
              className={cn(
                /* The same bottom padding on every step: the category step's
                   was 12px deeper, which made the panel above it 12px
                   shorter, so a step change resized the box it happened in. */
                "px-4 sm:px-12 pt-2 flex items-center justify-between shrink-0 max-[384px]:px-3",
                "pb-5 sm:pb-4",
              )}
            >
              {/* Back, on the left */}
              <div className="flex items-center gap-3 max-[384px]:gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep < 2 || currentStep > 4 || (currentStep === 4 && !!planCheckoutLoading)}
                  data-onboarding-back=""
                  style={fadeWith(currentStep >= 2 && currentStep <= 4, `background-color 150ms, box-shadow 150ms, color 150ms`)}
                  className={cn("px-5 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium rounded-xl max-[384px]:px-4 disabled:cursor-not-allowed motion-reduce:!transition-none", BACK_LOOK, currentStep === 4 && planCheckoutLoading && "text-[#9ca3af]")}
                >
                  Back
                </button>
              </div>

              {/* Skip and Next, on the right, for the first three steps */}
              <div className="flex items-center gap-3 sm:gap-4 max-[384px]:gap-2 motion-reduce:!transition-none" style={fadeWith(currentStep <= 3)}>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={!canSkip()}
                  style={fadeWith(canSkip(), "color 150ms")}
                  className="px-4 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-500 hover:text-gray-700 max-[384px]:px-2.5 motion-reduce:!transition-none"
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentStep > 3 || !canProceed()}
                  style={{ transition: `background-color 200ms ${MOTION_EASE}, color 200ms ${MOTION_EASE}, box-shadow 200ms ${MOTION_EASE}` }}
                  className={cn(
                    "px-7 sm:px-8 py-3 sm:py-3 rounded-xl font-semibold text-sm sm:text-sm min-w-[110px] sm:min-w-[140px] max-[384px]:min-w-[88px] max-[384px]:px-4 motion-reduce:!transition-none",
                    /* Keeps its colour while it fades out with the plan step coming in. */
                    currentStep > 3 || canProceed()
                      ? NEXT_ON
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <div className="p-5 border-b flex flex-row items-center gap-3">
            <button
              onClick={() => setShowCategoryModal(false)}
              className="hover:bg-gray-100 p-1 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1 text-center pr-8">More Categories</h2>
          </div>

          {/* Search */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-3 px-4 h-[44px] rounded-xl bg-gray-100">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className="flex-1 text-sm outline-none bg-transparent"
              />
            </div>
          </div>

          {/* Categories list */}
          <div className="p-4 max-h-[360px] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {filteredCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    setSelectedCategory(category)
                    setShowCategoryModal(false)
                    setCategorySearch("")
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-full text-sm font-medium transition-all",
                    selectedCategory === category
                      ? "bg-gray-100 border-2 border-black text-black"
                      : "bg-gray-100 border-2 border-transparent text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Crop Modal */}
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
            <button
              onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null) }}
              className="hover:bg-gray-100 p-1 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</h2>
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
                      const scale = Math.min(300 / nw, 300 / nh)
                      const displayW = nw * scale
                      const displayH = nh * scale
                      setImageSizeCrop({ width: displayW, height: displayH })
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

                    {/* Corner handles */}
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
                    className="flex-1 py-3 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploadingAvatar ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/*
        ON THE WAY TO THE DASHBOARD. It was a purple ring, "Setting things
        up..." and "Redirecting to your dashboard." on white: a third loading
        look after the setup step and before the app's own. Now it is the one
        every slow page and every switch of business shows: the light gray
        spinner 40% down (components/ui/activity-spinner PageSpinner's rows)
        with one plain line under it, on the white the setup was on.
      */}
      {isRedirecting && (
        <div
          data-onboarding-redirect=""
          className="fixed inset-0 z-[2147483647] grid grid-rows-[2fr_auto_3fr] justify-items-center bg-white px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-in fade-in duration-200 motion-reduce:animate-none"
          role="status"
          aria-live="polite"
        >
          <div className="relative row-start-2">
            <span aria-hidden className="block">
              <ActivitySpinner label="" />
            </span>
            <div className="absolute left-1/2 top-full ml-[-150px] mt-4 w-[300px] text-center">
              <p className="text-[15px] font-medium leading-[22px] text-[#1a1a2e]">Opening your dashboard</p>
              {redirectFailed && (
                <div className="mt-4 animate-in fade-in duration-200 motion-reduce:animate-none">
                  <p className="text-[14px] leading-5 text-[#6b7280]">This is taking longer than usual.</p>
                  <button
                    onClick={startDashboardRedirect}
                    className={cn("mt-3 inline-flex h-11 items-center justify-center rounded-xl px-5 text-[14px] font-semibold transition-[background-color,box-shadow]", NEXT_ON)}
                  >
                    Go to dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confetti */}
      <Confetti show={showConfetti} />
    </>
  )
}

// Hook to manage creator onboarding state
export function useCreatorOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    // For testing: always show the modal
    // Remove this line and uncomment the check below when ready for production
    setShowOnboarding(true)

    // Production check - uncomment when ready:
    // const onboardingShown = localStorage.getItem("storelib_creator_onboarding_shown")
    // if (!onboardingShown) {
    //   setShowOnboarding(true)
    // }

    setIsChecked(true)
  }, [])

  const closeOnboarding = () => {
    setShowOnboarding(false)
    // For production - uncomment:
    // localStorage.setItem("storelib_creator_onboarding_shown", "true")
  }

  return { showOnboarding, closeOnboarding, isChecked }
}
