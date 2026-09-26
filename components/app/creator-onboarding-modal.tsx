"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { AVATAR_CHOSEN, onboardingPhoto } from "@/lib/account/avatar"
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

/**
 * How long a step takes to leave, in ms. It is the CSS duration and the
 * timer that swaps the step, one number, so the two cannot drift: a swap
 * late by a frame is seen as a pop rather than a change.
 */
const STEP_SWAP_MS = 180

// Storelib logo SVG component - inlined for instant loading
const StorelibLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Storelib">
    <path d="M0 0 C1.25598999 -0.00852997 2.51197998 -0.01705994 3.80603027 -0.02584839 C5.19036878 -0.02514942 6.57470719 -0.02422639 7.95904541 -0.02310181 C9.42299746 -0.02908898 10.88694635 -0.03589496 12.35089111 -0.04345703 C16.32216398 -0.06110767 20.29335063 -0.06581209 24.26465893 -0.0670886 C26.7484317 -0.06851159 29.23218266 -0.07278404 31.71595001 -0.07808304 C40.3887928 -0.09658205 49.06157417 -0.10475404 57.73443604 -0.10317993 C65.80571415 -0.1019794 73.87672448 -0.1230646 81.94793487 -0.15466726 C88.88740979 -0.18086566 95.82679746 -0.1915457 102.76632142 -0.19026911 C106.90650235 -0.18976041 111.04644538 -0.19539209 115.18657684 -0.21662521 C119.08386362 -0.23606723 122.98068708 -0.2360918 126.87799072 -0.22159195 C128.3029473 -0.21950992 129.72793332 -0.22416847 131.15283966 -0.23631287 C141.09680252 -0.31552915 147.72066213 0.96939458 156.01470947 6.39242554 C164.00844081 14.7495083 164.48967637 23.75783423 164.39581299 34.77963257 C164.40096022 36.32476622 164.40824753 37.86989399 164.41749573 39.41500854 C164.43591288 43.58446598 164.42313434 47.75327889 164.40340543 51.92270899 C164.38694289 56.29916711 164.39584208 60.67558686 164.40092468 65.05206299 C164.40543622 72.39722923 164.38963191 79.74214002 164.3616333 87.08724976 C164.32956172 95.56596535 164.32960943 104.04422102 164.34684807 112.52296937 C164.36273668 120.69971652 164.35596615 128.87629588 164.33891106 137.05303574 C164.33205827 140.52416353 164.33305464 143.99515609 164.34045601 147.46628189 C164.34814329 151.55574766 164.33591375 155.64469271 164.3086071 159.73406982 C164.30174858 161.23038055 164.30159802 162.72674016 164.30882263 164.22304916 C164.34272151 172.16130636 164.16638678 178.42591425 159.76470947 185.26742554 C159.22845947 186.15430054 158.69220947 187.04117554 158.13970947 187.95492554 C152.43571606 193.50881386 144.75237362 196.38313512 136.89727783 196.41459656 C135.67216995 196.42175186 134.44706207 196.42890717 133.18482971 196.4362793 C131.8247378 196.43911959 130.46464562 196.44183131 129.10455322 196.44442749 C127.67369929 196.45069344 126.24284699 196.45734036 124.81199646 196.46434021 C120.10874564 196.48537739 115.40549454 196.49574619 110.70220947 196.50570679 C109.0806883 196.50975527 107.45916731 196.51387222 105.83764648 196.51805687 C98.21463332 196.53711229 90.59162982 196.55133937 82.96859741 196.55966884 C74.18508474 196.56942573 65.40182511 196.59570309 56.61840153 196.63616973 C49.82077103 196.66640598 43.02321272 196.68114504 36.22551632 196.68444985 C32.17017831 196.68679292 28.1151105 196.69565491 24.05984497 196.72091103 C20.23810795 196.74432693 16.41681639 196.74837134 12.59502602 196.73814964 C11.19992904 196.73765734 9.80480913 196.7438867 8.4097805 196.75770569 C-1.41657181 196.84951715 -9.61649844 195.68755985 -18.11029053 190.51742554 C-27.18735637 180.90641464 -27.53411292 170.57341229 -27.49407959 157.91610718 C-27.49679343 156.4714185 -27.50035657 155.02673121 -27.50469971 153.58204651 C-27.51378005 149.67704699 -27.51029729 145.77215372 -27.50394154 141.86715245 C-27.49885795 137.76875741 -27.50357962 133.67037113 -27.50671387 129.57197571 C-27.51034706 122.68992489 -27.50557183 115.80791708 -27.49603271 108.9258728 C-27.48515374 100.98582544 -27.4886723 93.04588084 -27.49968553 85.10583597 C-27.50878201 78.27246064 -27.51003202 71.43911611 -27.50480819 64.60573667 C-27.5017009 60.53163085 -27.50124478 56.45757321 -27.50788116 52.38347054 C-27.51368829 48.55108556 -27.50959658 44.71883213 -27.49809265 40.88646126 C-27.4954638 39.48569964 -27.49618056 38.08492682 -27.50061798 36.68416977 C-27.53530251 24.61619513 -27.10564593 15.19154067 -18.23529053 6.26742554 C-15.93480906 4.53840125 -13.88377264 3.49357466 -11.23529053 2.26742554 C-10.46928402 1.91071463 -9.70327751 1.55400372 -8.91405869 1.18648338 C-5.79872006 0.11764269 -3.29228243 0.01012495 0 0 Z" fill="#8B56FA" transform="translate(31.235,1.733)"/>
    <path d="M0 0 C0.99749268 0.36665771 0.99749268 0.36665771 2.01513672 0.74072266 C6.62777473 2.59663113 6.62777473 2.59663113 7.68823242 4.86303711 C7.94652165 7.99120666 7.02705902 10.04467511 5.85546875 12.94921875 C5.41009766 14.05974609 4.96472656 15.17027344 4.50585938 16.31445312 C4.02955078 17.46880859 3.55324219 18.62316406 3.0625 19.8125 C2.59779297 20.97845703 2.13308594 22.14441406 1.65429688 23.34570312 C-1.85471661 31.98985831 -1.85471661 31.98985831 -4.125 33.125 C-6.02961204 32.43054915 -7.90085447 31.64344514 -9.75 30.8125 C-19.66422998 26.58368153 -27.26609106 25.85047702 -38.125 26.125 C-38.455 27.115 -38.785 28.105 -39.125 29.125 C-38.14402344 29.36734375 -37.16304687 29.6096875 -36.15234375 29.859375 C-33.31305776 30.56236873 -30.47635159 31.27497918 -27.640625 31.9921875 C-24.80213536 32.70970135 -21.95989766 33.40235421 -19.109375 34.0703125 C-6.69949938 37.1089446 3.02755655 40.84926977 9.875 52.125 C13.29151905 58.95803811 12.61307566 67.23479967 10.625 74.4375 C7.53029491 83.45189328 1.37513276 90.18616729 -7.02734375 94.67578125 C-26.20884362 103.04454374 -49.04415352 101.90170642 -68.5 94.625 C-72.25964144 93.07749587 -75.67848864 91.2806362 -79.125 89.125 C-78.55593823 84.90468545 -77.56543969 81.39586411 -75.83984375 77.5078125 C-75.39189453 76.48945313 -74.94394531 75.47109375 -74.48242188 74.421875 C-73.77956055 72.85179688 -73.77956055 72.85179688 -73.0625 71.25 C-72.59005859 70.18007812 -72.11761719 69.11015625 -71.63085938 68.0078125 C-70.46832699 65.3774362 -69.29955398 62.75002483 -68.125 60.125 C-63.80181734 61.13483216 -60.07150265 62.96083682 -56.07421875 64.87109375 C-49.32009515 67.74271451 -43.48344492 68.41757298 -36.25 68.3125 C-35.38375 68.31185547 -34.5175 68.31121094 -33.625 68.31054688 C-29.55080641 68.64235092 -29.55080641 68.64235092 -26.125 67.125 C-32.43853708 64.84703882 -38.66045093 62.93279428 -45.25 61.625 C-56.73505022 59.25968679 -67.31315991 55.21661495 -74.125 45.125 C-77.1608836 40.09281577 -77.67121961 36.10082917 -77.625 30.375 C-77.62072998 29.57876221 -77.61645996 28.78252441 -77.61206055 27.9621582 C-77.37730644 19.82208022 -74.95520496 14.3797357 -69.625 8.25 C-68.8 7.54875 -67.975 6.8475 -67.125 6.125 C-66.403125 5.465 -65.68125 4.805 -64.9375 4.125 C-46.69751714 -8.84565448 -20.22397968 -7.61423584 0 0 Z" fill="#FDFDFF" transform="translate(134.125,52.875)"/>
  </svg>
)

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
  "Memberships",
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
  "Community",
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
}

export function CreatorOnboardingModal({ open, onClose, resumeFromStripe, switchBack = null }: CreatorOnboardingModalProps) {
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
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right")
  /** The panel the steps are drawn in, so the next one starts at its top. */
  const stepScrollRef = useRef<HTMLDivElement | null>(null)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
  }, [])

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
          successUrl: `${origin}/signup/success?action=become-creator&stripe_success=1&tier=${planId}`,
          cancelUrl: `${origin}/signup/success?action=become-creator`,
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
      if (user?.user_metadata?.full_name) {
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
   * MOVING BETWEEN STEPS. The step on screen leaves, the next one arrives,
   * and `STEP_SWAP_MS` is that half of it: the same number is the CSS
   * duration and this timer, so the swap happens as the old step finishes
   * going rather than a frame or two after, which is what was read as a pop.
   *
   * A second press while a step is already leaving is ignored. Before, two
   * presses in the same 200ms started two timers and skipped a step.
   *
   * The next step starts at its top. Step 2's categories are taller than
   * step 1 on a phone, so going back landed part way down a short step.
   */
  const goToStep = (next: number, direction: "left" | "right") => {
    if (isAnimating) return
    setSlideDirection(direction)
    setIsAnimating(true)
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    stepTimerRef.current = setTimeout(() => {
      setCurrentStep(next)
      stepScrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      setIsAnimating(false)
    }, STEP_SWAP_MS)
  }

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

    setCurrentStep(5)
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
                    Desktop: the 930 by 540 card, and never wider than the
                    window it is in. The card was 930px from 640px up, so on
                    a 768px tablet held upright it hung 81px off each side:
                    Back and Next were off the screen, and there was nothing
                    to scroll sideways to reach them. It keeps its size where
                    there is room and takes the window's, less a margin,
                    where there is not.
                  */
                  "sm:w-[930px] sm:max-w-[calc(100vw-40px)] sm:h-[540px] sm:max-h-[calc(100dvh-40px)] sm:rounded-[44px]",
                  // Mobile: true fullscreen experience
                  "w-[calc(100%-24px)] max-w-none max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:w-screen max-sm:h-[100dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
                  // Shadow
                  "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
                ),
            // Hide the close button
            "[&>button]:hidden"
          )}
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
                {/* Width alone, so the bar's growth is its own and nothing else is animated with it. */}
                <div
                  className="h-full rounded-full bg-purple-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${progressWidth}%` }}
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
              and transform, which are the two a phone animates without
              drawing a frame again (`translate`, which is what translate-x-3 sets
              in Tailwind 4, not `transform`). A person who has asked for less motion
              gets the swap with no movement at all.
            */}
            <div
              ref={stepScrollRef}
              className={cn(
                "flex-1 min-h-0 overflow-y-auto px-4 sm:px-12 pt-3 sm:pt-6",
                (currentStep === 1 || currentStep === 3) && "max-sm:pb-4",
                currentStep === 2 && "max-sm:pb-2",
                currentStep === 4 && "pb-4 sm:pb-6",
              )}
            >
            <div
              data-onboarding-step={currentStep}
              style={{ transitionDuration: `${STEP_SWAP_MS}ms` }}
              className={cn(
                "transition-[opacity,translate] ease-out motion-reduce:transition-none motion-reduce:translate-x-0",
                isAnimating && (slideDirection === "right" ? "translate-x-3 opacity-0" : "-translate-x-3 opacity-0"),
              )}
            >
              {/* Step 1: Let's get started */}
              {currentStep === 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-4 sm:mb-8">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Name your store
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      You can change it later, and everything else too.
                    </p>
                  </div>

                  {/* Input fields */}
                  <div className="w-full max-w-[600px] space-y-3 sm:space-y-4">
                    {/* Username input - with shop bag icon */}
                    <div className="relative">
                      <div className={cn(
                        "flex items-center gap-3 px-5 h-[56px] rounded-[14px] transition-all",
                        usernameFocused
                          ? "bg-white ring-2 ring-black"
                          : "bg-[#F3F3F3]"
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
                    <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3]">
                      <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="text-base">
                        <span className="text-black font-medium">{getSlug() || "username"}</span>
                        <span className="text-gray-400">.storelib.com</span>
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
                        placeholder="Tell us a few words about you..."
                        rows={2}
                        className="flex-1 text-base outline-none bg-transparent resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Store Category */}
              {currentStep === 2 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-4 sm:mb-6">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Store category
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Choose what best fits your store.
                    </p>
                  </div>

                  {/* Category pills */}
                  <div className="w-full max-w-[650px] flex flex-wrap justify-center gap-2.5 sm:gap-3">
                    {PRIMARY_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                        className={cn(
                          "px-4 sm:px-5 py-2.5 sm:py-3 rounded-full text-sm font-medium transition-all",
                          selectedCategory === category
                            ? "bg-gray-100 border-2 border-black text-black"
                            : "bg-gray-100 border-2 border-transparent text-gray-700 hover:bg-gray-200"
                        )}
                      >
                        {category}
                      </button>
                    ))}

                    {/* Show selected extended category inline so user can see it */}
                    {selectedCategory && !PRIMARY_CATEGORIES.includes(selectedCategory) && (
                      <button
                        key={selectedCategory}
                        onClick={() => setSelectedCategory(null)}
                        className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-full text-sm font-medium transition-all bg-gray-100 border-2 border-black text-black"
                      >
                        {selectedCategory}
                      </button>
                    )}

                    {/* See more button */}
                    <button
                      onClick={() => setShowCategoryModal(true)}
                      className="px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      See more....
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
                    {/* Avatar section */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#F3F3F3] flex items-center justify-center overflow-hidden border-2 border-gray-200">
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
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
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

              {/* Step 4: Choose a Plan */}
              {currentStep === 4 && (
                <div className="flex flex-col">
                  <div className="text-center mb-5 sm:mb-7">
                    <h1 className="text-[22px] sm:text-[34px] font-bold leading-tight">
                      Choose your plan
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5">
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

              {/* Step 5: Setup - centered content */}
              {currentStep === 5 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px] sm:min-h-[350px] px-4 pt-6 sm:pt-0">
                  {/* Logo with pulse effect */}
                  <div className="relative mb-4 sm:mb-6 mt-4 sm:mt-0">
                    {isSettingUp && (
                      <>
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-400/30 animate-ping" />
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-400/20 animate-pulse" />
                      </>
                    )}
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shadow-lg bg-white flex items-center justify-center">
                      <StorelibLogo className="w-full h-full" />
                    </div>
                  </div>

                  {/* Title - rotating text */}
                  <div className="text-center">
                    {isSettingUp && setupPhase === "creating" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Creating your profile...
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : isSettingUp && setupPhase === "applying" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Applying your settings...
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : isSettingUp && setupPhase === "almost" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Almost ready...
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : setupError ? (
                      <div className="flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold text-red-600">
                          Something went wrong
                        </h1>
                        <p className="text-sm text-gray-500 text-center max-w-xs">
                          We couldn't save your profile. Please try again.
                        </p>
                        <button
                          onClick={() => {
                            setSetupError(false)
                            startSetup()
                          }}
                          className="mt-2 px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                        >
                          Try again
                        </button>
                      </div>
                    ) : setupComplete ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Your store is ready.
                        </h1>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* A quote used to sit here (Einstein, under the spinner). It was
                      filler on a screen whose only job is to say it is working. */}
                </div>
              )}
            </div>
            </div>

            {/*
              THE ROW OF BUTTONS FITS THE NARROWEST PHONE SOLD. On the
              category step it is four of them, Back, Other, Skip and Next,
              and at 320px (an iPhone SE, and any phone with the text size
              turned up) they came to 368px: Next hung off the right edge.
              Under 384px, which is the width the roomy row stops fitting at,
              each one gives up some of its side padding and Next some of its
              floor: 291px, with 8px between any two, at 320. The words and
              the heights do not change, so the press stays 44px and nothing
              reads as a different button.
            */}
            {/* Footer with buttons — steps 1-3 */}
            {currentStep >= 1 && currentStep <= 3 && (
              <div className={cn(
                /* The same bottom padding on every step: the category step's
                   was 12px deeper, which made the panel above it 12px
                   shorter, so a step change resized the box it happened in. */
                "px-4 sm:px-12 pt-2 flex items-center justify-between shrink-0 max-[384px]:px-3",
                "pb-5 sm:pb-4",
              )}>
                {/* Back button and Other - left side */}
                <div className="flex items-center gap-3 max-[384px]:gap-2">
                  {currentStep > 1 && (
                    <button
                      onClick={handleBack}
                      className="px-5 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors max-[384px]:px-4"
                    >
                      Back
                    </button>
                  )}
                  {/* Other button - only on category step */}
                  {currentStep === 2 && (
                    <button
                      onClick={() => {
                        setSelectedCategory(null)
                        handleNext()
                      }}
                      className="px-4 sm:px-5 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors max-[384px]:px-3"
                    >
                      Other
                    </button>
                  )}
                </div>

                {/* Skip and Next buttons - right side */}
                <div className="flex items-center gap-3 sm:gap-4 max-[384px]:gap-2">
                  {canSkip() && (
                    <button
                      onClick={handleSkip}
                      className="px-4 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors max-[384px]:px-2.5"
                    >
                      Skip
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={cn(
                      "px-7 sm:px-8 py-3 sm:py-3 rounded-xl font-semibold text-sm sm:text-sm transition-colors min-w-[110px] sm:min-w-[140px] max-[384px]:min-w-[88px] max-[384px]:px-4",
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

            {/* Step 4 (plan selection) — Back button only; plan cards contain the CTAs */}
            {currentStep === 4 && (
              <div className="px-4 sm:px-12 pt-2 pb-5 sm:pb-4 flex items-center shrink-0">
                <button
                  onClick={handleBack}
                  disabled={!!planCheckoutLoading}
                  className="px-5 sm:px-6 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              </div>
            )}

            {/* Step 5 (setup) — no buttons, just bottom spacing */}
            {currentStep === 5 && (
              <div className="h-16" />
            )}
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

      {isRedirecting && (
        <div
          className="fixed inset-0 z-[2147483647] bg-white flex items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm text-center">
            <div
              className="mx-auto mb-5 h-12 w-12 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin"
              aria-hidden="true"
            />
            <h2 className="text-xl font-semibold text-gray-900">Setting things up...</h2>
            <p className="mt-2 text-sm text-gray-500">Redirecting to your dashboard.</p>

            {redirectFailed && (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-700">This is taking longer than expected. You can continue manually.</p>
                <button
                  onClick={startDashboardRedirect}
                  className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
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
