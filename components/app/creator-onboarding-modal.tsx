"use client"

import { useCallback, useState, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createPortal } from "react-dom"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { AVATAR_CHOSEN, onboardingPhoto } from "@/lib/account/avatar"
import { saveAccountPhoto } from "@/lib/onepage/photo-save"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import {
  ArrowLeft,
  Check,
  X,
  ChevronLeft,
  Instagram,
  Youtube,
  AtSign,
  ImagePlus,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  Bell,
  User,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { PricingSection } from "@/components/marketing/pricing-section"
import { JoinSocialBrandIcon } from "@/components/onboarding/join-social-brands"
import { STORELIB_LOGO_SHADOW_JOIN } from "@/lib/brand/logo"
import { hapticTap, isNativeApp } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { secondaryDepth } from "@/components/ui/depth-button"
import { pickPhoto } from "@/lib/native-camera"
import { TextSwap } from "@/components/ui/text-swap"
import { OnboardingBackdrop } from "@/components/onboarding/film-backdrop"
import { AvatarMark, DefaultAvatarGlyph } from "@/components/app/app-avatar"
import type { OnboardingResume } from "@/lib/account/onboarding-resume"
import { cleanName } from "@/lib/profile/display-name"
import { JOIN_STEP_USERNAME, cleanBio, welcomeDone } from "@/lib/account/welcome"
import { baseHandleFrom, joinHandleFromDisplayName, normalizeHandle, slugifyHandle } from "@/lib/profile/username-rules"
import { DEPTH, DEPTH_PRESS } from "@/components/community/member/ui"

const JOIN_PROGRESS_STORAGE = "storelib_join_progress"

/** Username suggestion from a display name: compact, no hyphens when possible. */
function suggestedJoinHandle(name: string): string {
  return joinHandleFromDisplayName(name)
}
import { askPushPermission, inNativeApp, nativePlatform, phoneSettingsPath, type PushPermission } from "@/lib/native-push"
import { msg, tt } from "@/lib/i18n/text"

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
/** The store address a store name makes: accents folded, at most the 30 characters a handle may have. */
function storeSlugFrom(name: string): string {
  return slugifyHandle(name, 30)
}

/*
  THE STORE'S HANDLE IS CLAIMED ON THE SERVER (round AX). It becomes
  storelib.com/<handle>, <handle>.storelib.com and storelib.me/<handle>, and
  every rule on a name (reserved words, names for a fake sign in page, a name
  somebody gave up, another website's address) is the server's
  (lib/profile/move-handle.ts claimStoreHandle). This setup used to write the
  name straight into profiles.username and creators.slug from the browser,
  unchecked; the database now refuses that (supabase/sql/run-now/462). The
  server answers with the handle it gave, which is the one on screen when it
  is free, else the account's own, else a free one made from it. Null when it
  could not be reached: the setup goes on and /api/onboarding/finalize claims
  one for the store it makes.
*/
async function claimStoreHandle(wanted: string): Promise<string | null> {
  try {
    const res = await fetch("/api/profile/username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: wanted, store: true, claim: true }),
    })
    const data = (await res.json().catch(() => null)) as { username?: string } | null
    return res.ok && data?.username ? data.username : null
  } catch {
    return null
  }
}

const STEP_IN_MS = 220
const STEP_OUT_MS = 160
const STEP_SHIFT = 8
/** Each piece of the setup screen rising into place (see SETUP ARRIVES). */
const SETUP_RISE_MS = 520
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

/** The step panel's edges: faded only where there is more to scroll to (see updateScrollEdges), over SCROLL_EDGE_FADE. */
const SCROLL_EDGE_MASK = "linear-gradient(to bottom, transparent 0, #000 var(--fade-top, 0px), #000 calc(100% - var(--fade-bottom, 0px)), transparent 100%)"
const SCROLL_EDGE_FADE = "12px"
/* What scrolls under the top row fades into the film over --fade-top (set from the scroll), never cut in a hard line. Nothing fades at the foot. */
const TOP_EDGE_MASK = "linear-gradient(to bottom, transparent 0, #000 var(--fade-top, 0px), #000 100%)"

/*
  A LITTLE DEPTH, AND NO MORE. A field is a well: the same grey, with a
  hairline and a touch of shadow inside it, so it reads as somewhere to
  type rather than a grey shape. Next is the violet with a hairline of
  light along its top and a soft shadow under it; Back is white on a
  hairline. No gradients (CLAUDE.md).
*/
const FIELD_REST = "bg-[#f4f4f5] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05),inset_0_1px_2px_rgba(17,24,39,0.05)]"
const FIELD_WELL = "border-2 border-transparent bg-[#f4f4f5] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05),inset_0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-[#6b7280] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(107,114,128,0.12)]"
const AVATAR_RING = "shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_2px_8px_-2px_rgba(17,24,39,0.14)]"
const JOIN_STEP_IN_MS = 220
const JOIN_STEP_SHIFT = 8

type JoinSocialId = "tiktok" | "instagram" | "youtube" | "bluesky" | "twitter" | "linkedin"

const SOCIAL_MORPH_MS = 460

/** A phone, including one turned sideways: the photo choice is a sheet, not a desktop file dialog. */
function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 639px), (max-height: 520px) and (pointer: coarse)").matches
}

function restoreJoinSocials(raw: Record<string, string> | undefined) {
  if (!raw) return { instagram: "", tiktok: "", youtube: "", bluesky: "", twitter: "", linkedin: "" }
  return {
    instagram: raw.instagram ?? "",
    tiktok: raw.tiktok ?? "",
    youtube: raw.youtube ?? "",
    bluesky: raw.bluesky ?? "",
    linkedin: raw.linkedin ?? "",
    twitter: raw.twitter ?? "",
  }
}

function SocialToggleBadge({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "absolute right-0 top-0 grid h-[18px] w-[18px] place-items-center rounded-full bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.16),0_0_0_1px_rgba(17,24,39,0.06)] transition-[background-color,color,scale] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        on && "scale-100 bg-[#1a1a2e] text-white",
      )}
    >
      <span className="relative block h-3 w-3">
        <Plus
          className={cn(
            "absolute inset-0 h-3 w-3 transition-[opacity,scale,rotate] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            on ? "scale-75 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
          )}
          strokeWidth={2.75}
          aria-hidden
        />
        <Minus
          className={cn(
            "absolute inset-0 h-3 w-3 transition-[opacity,scale,rotate] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            on ? "scale-100 rotate-0 opacity-100" : "scale-75 -rotate-90 opacity-0",
          )}
          strokeWidth={2.75}
          aria-hidden
        />
      </span>
    </span>
  )
}
/* Round AH: the ground behind the setup (see the Dialog below). */
/*
  ROUND AK: THE STORES PEOPLE BUILD, BEHIND THE SETUP. The owner's picture
  of storefronts made on Storelib, across the whole window, under a soft
  vignette (radial-gradient: clear in the middle where the card stands,
  darker toward the edges) so the white card reads first. From 640px only:
  on a phone the setup is the whole screen and nothing behind it shows, so
  the picture is not even fetched there.
*/
const ONBOARDING_GROUND = "!bg-[#0b0b0f]"
const NEXT_ON = "bg-[#7c3aed] text-white hover:bg-[#6d28d9] shadow-[0_1px_2px_rgba(76,29,149,0.28),0_4px_12px_-4px_rgba(124,58,237,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]"
const BACK_LOOK = "bg-white text-[#374151] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.06)] hover:bg-[#f9fafb]"
const CATEGORY_PILL = "h-11 px-4 sm:px-5 rounded-[10px] text-[14px] font-medium transition-[background-color,color,box-shadow]"
const CATEGORY_OFF = "bg-white text-[#374151] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.05)] hover:shadow-[0_0_0_1px_#d1d5db,0_1px_2px_rgba(17,24,39,0.08)]"
const CATEGORY_ON = "bg-[#1a1a2e] text-white shadow-[0_0_0_1px_#1a1a2e,0_2px_6px_-1px_rgba(26,26,46,0.35)]"

/*
  THE FULL SCREEN SETUP (the owner, with Shopify's setup as the reference):
  no oversized modal. The words sit on the darkened film, white, and what
  is to be filled in sits under them on one floating white card, with Back
  and Continue at its foot on every step. The page scrolls as a whole when
  a step is taller than the window, so nothing is ever cut off at any zoom.
*/
const VIEW_TITLE = "text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] text-white text-balance sm:text-[38px]"
const VIEW_SUB = "mx-auto mt-2.5 max-w-[460px] text-[15px] leading-[22px] text-white/70 text-balance sm:text-[16px] sm:leading-6"
const FLOAT_CARD = "rounded-[22px] bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_70px_-30px_rgba(0,0,0,0.65),0_8px_24px_-12px_rgba(0,0,0,0.35)]"
const GOAL_PILL = "inline-flex h-12 flex-auto items-center justify-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-[background-color,color,box-shadow,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transition-none min-[400px]:gap-2 min-[400px]:px-4 min-[400px]:text-[15px] transition-[background-color,color,box-shadow] duration-200 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 focus-visible:ring-offset-2 sm:h-12 sm:pl-4 sm:pr-5"
const GOAL_OFF = "bg-[#f4f4f6] text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.06)] hover:bg-[#ececf0]"
const GOAL_ON = "bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_10px_-4px_rgba(26,26,46,0.5)]"
const NAV_NEXT = "inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-full px-6 text-[15px] font-semibold transition-[background-color,box-shadow,scale] duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 focus-visible:ring-offset-2 motion-reduce:transition-none"
const NAV_NEXT_OFF = "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
const NAV_BACK = "inline-flex h-12 shrink-0 items-center justify-center gap-1 rounded-full bg-white px-5 text-[15px] font-medium text-[#374151] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,box-shadow,scale] duration-200 active:scale-[0.98] motion-reduce:transition-none hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 focus-visible:ring-offset-2"
const FIELD = cn("flex h-[52px] w-full items-center gap-3 rounded-[12px] px-4 text-left", "border-2 border-transparent bg-[#f4f4f5] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)] transition-[background-color,border-color] duration-200 focus-within:border-[#6b7280] focus-within:bg-white")

/** What they came to do: the first step. Several at once. Saved on the account (storelib_goals) so the dashboard can start from it. */
const SELL_GOALS = [
  { id: "sell_online", label: msg("Sell online") },
  { id: "digital_products", label: msg("Digital products") },
  { id: "courses", label: msg("Courses") },
  { id: "community", label: msg("Communities") },
  { id: "services", label: msg("Services") },
  { id: "link_in_bio", label: msg("Link in bio") },
  { id: "other", label: msg("Other") },
] as const
type SellGoal = (typeof SELL_GOALS)[number]["id"]
/* Two to a row, a short one beside a longer one, each as wide as its words: the row is filled, nothing is cut. */
const GOAL_ROWS: SellGoal[][] = [["courses", "digital_products"], ["sell_online", "community"], ["services", "link_in_bio"], ["other"]]
const GOALS_KEY = "storelib_goals"
/** An X handle from what was typed, without the @ or an address round it. */
function xHandle(soc: { twitter?: string }): string {
  return (soc.twitter || "").trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@+/, "").split(/[/?#]/)[0]
}
/**
 * THE PLUS THAT BECOMES A CHECK. Both marks are drawn in one 16px cell; the
 * plus turns a quarter and shrinks away as the check grows and settles in,
 * on opacity, rotate and scale only, so a tap reads as one movement.
 */
/**
 * The account's picture at the right of its field: a faint ring while it is
 * asked for, then the picture fading and settling in. Nothing when the
 * network gave none, so the field stays as it was.
 */
function SocialFace({ preview }: { preview?: { state: "loading" } | { state: "found"; avatar: string; name: string | null } | { state: "none" } }) {
  const [loaded, setLoaded] = useState(false)
  const avatar = preview?.state === "found" ? preview.avatar : null
  useEffect(() => setLoaded(false), [avatar])
  return (
    <span aria-hidden={!avatar} data-onboarding-social-face={preview?.state ?? ""} className="relative grid h-7 w-7 shrink-0 place-items-center">
      {preview?.state === "loading" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#9ca3af] motion-reduce:animate-none" /> : null}
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={preview?.state === "found" && preview.name ? preview.name : ""}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
          className={cn("h-7 w-7 rounded-full object-cover shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_3px_rgba(17,24,39,0.15)] transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", loaded ? "scale-100 opacity-100" : "scale-75 opacity-0")}
        />
      ) : null}
    </span>
  )
}

function GoalMark({ on }: { on: boolean }) {
  const ease = "transition-[opacity,rotate,scale] duration-[260ms] ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
  return (
    <span aria-hidden className="relative inline-block h-4 w-4 shrink-0">
      <Plus className={cn("absolute inset-0 h-4 w-4", ease, on ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} strokeWidth={2.25} />
      <Check className={cn("absolute inset-0 h-4 w-4", ease, on ? "rotate-0 scale-100 opacity-100" : "-rotate-45 scale-50 opacity-0")} strokeWidth={2.5} />
    </span>
  )
}

/** What was typed on /sell, kept for this tab so a reload or a slip of Back loses nothing. */
const SELL_DRAFT_STORAGE = "storelib_sell_draft"


// Primary categories (first 16)
const PRIMARY_CATEGORIES: string[] = [
  msg("Templates"),
  msg("Courses"),
  msg("Guides"),
  msg("Software"),
  msg("Assets"),
  msg("Communities"),
  msg("Design Kits"),
  msg("Audio"),
  msg("Video"),
  msg("Education"),
  msg("Productivity"),
  msg("Marketing"),
  msg("Business"),
  msg("Photography"),
  msg("Writing"),
  msg("Finance")
]

// Extended categories (30+ more)
const EXTENDED_CATEGORIES: string[] = [
  msg("3D Models"),
  msg("Animations"),
  msg("Apps"),
  msg("Art"),
  msg("Branding"),
  msg("Coaching"),
  msg("Consulting"),
  msg("Content"),
  msg("Crafts"),
  msg("Data"),
  msg("Developer Tools"),
  msg("E-books"),
  msg("Fashion"),
  msg("Fitness"),
  msg("Food & Recipes"),
  msg("Gaming"),
  msg("Graphics"),
  msg("Health"),
  msg("Illustrations"),
  msg("Investing"),
  msg("Legal"),
  msg("Lifestyle"),
  msg("Music"),
  msg("Newsletter"),
  msg("Notion Templates"),
  msg("Podcast"),
  msg("Print on Demand"),
  msg("Real Estate"),
  msg("SaaS"),
  msg("Social Media"),
  msg("Spreadsheets"),
  msg("Startup"),
  msg("Stock Photos"),
  msg("Themes"),
  msg("Trading"),
  msg("UI Kits"),
  msg("Web Design"),
  msg("Wellness"),
  msg("Workshops"),
  // 30 more categories
  msg("Automation"),
  msg("Beauty"),
  msg("Blogging"),
  msg("Calendars"),
  msg("Checklists"),
  msg("Copywriting"),
  msg("Crypto"),
  msg("Dance"),
  msg("Digital Art"),
  msg("Email Marketing"),
  msg("Engineering"),
  msg("Entrepreneurship"),
  msg("Events"),
  msg("Figma Templates"),
  msg("Fonts"),
  msg("Freelancing"),
  msg("Home & Garden"),
  msg("Icons"),
  msg("Interior Design"),
  msg("Journaling"),
  msg("Language Learning"),
  msg("Meditation"),
  msg("Mindfulness"),
  msg("Mockups"),
  msg("Parenting"),
  msg("Personal Finance"),
  msg("Planners"),
  msg("Presentation Templates"),
  msg("Project Management"),
  msg("Remote Work"),
  msg("Resume Templates"),
  msg("Self-Improvement"),
  msg("SEO"),
  msg("Side Hustle"),
  msg("Spirituality"),
  msg("Sports"),
  msg("Study Notes"),
  msg("Travel"),
  msg("Video Editing"),
  msg("Yoga"),
  // 50 additional popular categories
  msg("AI Tools"),
  msg("AI Prompts"),
  msg("Amazon KDP"),
  msg("Android Apps"),
  msg("Arduino"),
  msg("Astrology"),
  msg("Bookkeeping"),
  msg("Brand Strategy"),
  msg("Canva Templates"),
  msg("Career Coaching"),
  msg("Children's Education"),
  msg("Cinema LUTs"),
  msg("Coding Courses"),
  msg("Comic Art"),
  msg("Conversion Optimization"),
  msg("Cooking Classes"),
  msg("Customer Support"),
  msg("Cybersecurity"),
  msg("Data Science"),
  msg("Discord Communities"),
  msg("Dropshipping"),
  msg("Etsy Printables"),
  msg("Excel Dashboards"),
  msg("Game Assets"),
  msg("Gumroad Templates"),
  msg("HR & Recruiting"),
  msg("iOS Apps"),
  msg("Illustrator Brushes"),
  msg("Interview Prep"),
  msg("Kids Activities"),
  msg("Kotlin Development"),
  msg("Lead Magnets"),
  msg("LinkedIn Growth"),
  msg("Machine Learning"),
  msg("Meal Plans"),
  msg("Micro SaaS"),
  msg("No-Code Tools"),
  msg("Online Tutoring"),
  msg("Packaging Design"),
  msg("Paid Ads"),
  msg("Pitch Decks"),
  msg("Podcast Editing"),
  msg("Prayer & Faith"),
  msg("Procreate Brushes"),
  msg("Product Research"),
  msg("Public Speaking"),
  msg("React Templates"),
  msg("Sales Funnels"),
  msg("Script Writing"),
  msg("Shopify Apps"),
  msg("Startup Legal"),
  msg("Teaching Resources"),
  msg("UI Animation"),
  msg("Virtual Assistance"),
  msg("Wedding Templates"),
  msg("WordPress Themes"),
  msg("YouTube Growth")
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

/**
 * Storelib's mark at the top left of the window, over the picture, while
 * the setup is open (round AK). Only where the window has room around the
 * card (1024px up); on anything narrower the card is close to the edges or
 * is the whole screen.
 */
function GroundMark({ open }: { open: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined") return null
  return createPortal(
    <div
      data-onboarding-ground-mark=""
      aria-hidden
      className="pointer-events-none fixed left-7 top-6 z-[2147483639] hidden transition-opacity duration-500 ease-out motion-reduce:transition-none lg:block"
      style={{ opacity: open ? 1 : 0 }}
    >
      <StorelibLogo size={36} alt="" className="block h-9 w-9 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)]" />
    </div>,
    document.body,
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
  leave?: { label: string; href: string; onLeave?: () => Promise<void> } | null
  /**
   * A new account's first steps (app/(auth)/onboarding/start, lib/account/
   * welcome): two slides, a profile then notifications, then `next`, the
   * page that brought them to Storelib. Seller setup is /sell, unchanged.
   */
  start?: StartBranch | null
  /**
   * Admin preview (app/admin/onboarding): the same slides, with nothing saved
   * and no redirect, so the real onboarding can be walked without a new account.
   */
  preview?: boolean
  /** Admin simulator: called instead of a real redirect when the join flow finishes in preview. */
  onPreviewComplete?: (destination: string) => void
  /**
   * A setup begun and not finished (lib/account/onboarding-resume): the store
   * name, bio and category typed last time, and the step it was left on.
   */
  resume?: OnboardingResume | null
  /**
   * The account they already have, for Name your store: the name in the
   * field and their handle on username.storelib.com, until they type a
   * different store name.
   */
  seed?: { name?: string | null; username?: string | null } | null
}

/** What /onboarding/start hands the onboarding: where it ends, and whatever Google or Apple already gave. */
export interface StartBranch {
  next: string | null
  name: string
  username: string | null
  avatar?: string | null
  bio?: string
  /** Resume on the username slide when the profile step was already saved. */
  joinStep?: number | null
}

/*
  THE STEPS BY NUMBER. 1 to 5 are the store setup as it always was. A new
  account (`start`) is the profile, then socials (the OnePage slide), then
  a short done moment. Notifications are only in the iOS and Android app,
  between socials and done. Numbers apart from the store's, so every rule
  written for 1 to 5 reads the same as before.
*/
const JOIN_NAME = 11
const JOIN_SOCIAL = 12
const JOIN_NOTIFY = 13
const JOIN_DONE = 14
const isJoinStep = (step: number) => step === JOIN_NAME || step === JOIN_SOCIAL || step === JOIN_NOTIFY || step === JOIN_DONE

export function CreatorOnboardingModal({ open, onClose, resumeFromStripe, switchBack = null, leave = null, resume = null, start = null, preview = false, onPreviewComplete = undefined, seed = null }: CreatorOnboardingModalProps) {
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
      setSwitchBackError(e instanceof Error ? e.message : tt("That business could not be opened. Try again."))
    }
  }
  const supabase = createClient()
  const redirectFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasResumedFromStripeRef = useRef(false)
  void onClose

  // Step management
  const joinStepStart = start?.joinStep === JOIN_STEP_USERNAME ? JOIN_SOCIAL : JOIN_NAME
  const [currentStep, setCurrentStep] = useState(start ? joinStepStart : 1)
  /** The step on its way out, drawn under the new one while the two crossfade, and how far it was scrolled. */
  const [leavingStep, setLeavingStep] = useState<{ step: number; offset: number } | null>(null)
  /** The panel the steps are drawn in, so the next one starts at its top. */
  const stepScrollRef = useRef<HTMLDivElement | null>(null)
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
    /* The top edge only, and as much of it as has been scrolled (0 to 32px), so the fade grows with the scroll instead of switching on. */
    el.style.setProperty("--fade-top", `${Math.min(32, Math.max(0, el.scrollTop))}px`)
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
  const [displayName, setDisplayName] = useState(() => (resume?.displayName || seed?.name || "").trim())
  /** Their handle on the store address, until they type a different store name. */
  const slugFollowsName = useRef(!normalizeHandle(seed?.username || ""))
  const seededSlug = useRef(normalizeHandle(seed?.username || ""))
  const [bio, setBio] = useState("")
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  /*
    WHOSE ACCOUNT IS IT. Each social field shows, at its right, the picture of
    the account typed in (app/api/onboarding/social-preview), so a person sees
    it is theirs. Asked 600ms after typing stops, once per value; an answer
    for a value that has since changed is dropped.
  */
  type SocialPreview = { state: "loading" } | { state: "found"; avatar: string; name: string | null } | { state: "none" }
  const [socialPreviews, setSocialPreviews] = useState<Partial<Record<JoinSocialId, SocialPreview & { value: string }>>>({})
  const previewAsked = useRef<Partial<Record<JoinSocialId, string>>>({})

  // Step 1: Goals
  const [goals, setGoals] = useState<SellGoal[]>([])
  const toggleGoal = (id: SellGoal) => setGoals((cur) => (cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id]))

  // Category (no longer asked; kept for a setup begun before, and for a Stripe return)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")

  // Step 3: Socials & Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(start?.avatar ?? null)
  const [socials, setSocials] = useState({
    instagram: "",
    tiktok: "",
    youtube: "",
    bluesky: "",
    twitter: "",
    linkedin: "",
  })
  useEffect(() => {
    if (start || preview) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const id of ["instagram", "tiktok", "youtube", "twitter"] as const) {
      const value = (socials[id] || "").trim()
      if (previewAsked.current[id] === value) continue
      if (!value || value.replace(/^@+/, "").length < 2) {
        previewAsked.current[id] = value
        setSocialPreviews((cur) => ({ ...cur, [id]: undefined }))
        continue
      }
      timers.push(setTimeout(() => {
        previewAsked.current[id] = value
        setSocialPreviews((cur) => ({ ...cur, [id]: { state: "loading", value } }))
        fetch(`/api/onboarding/social-preview?network=${id}&handle=${encodeURIComponent(value)}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { avatar?: string | null; name?: string | null } | null) => {
            if (previewAsked.current[id] !== value) return
            setSocialPreviews((cur) => ({ ...cur, [id]: data?.avatar ? { state: "found", avatar: data.avatar, name: data.name ?? null, value } : { state: "none", value } }))
          })
          .catch(() => {
            if (previewAsked.current[id] === value) setSocialPreviews((cur) => ({ ...cur, [id]: { state: "none", value } }))
          })
      }, 600))
    }
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one look up per changed value
  }, [socials.instagram, socials.tiktok, socials.youtube, socials.twitter])
  const [openSocial, setOpenSocial] = useState<null | JoinSocialId>(null)
  const [socialPanel, setSocialPanel] = useState<null | JoinSocialId>(null)
  const [socialPanelShown, setSocialPanelShown] = useState(false)
  const [photoSheet, setPhotoSheet] = useState(false)
  const socialInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const joinPhotoInputRef = useRef<HTMLInputElement>(null)
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

  /*
    THE JOIN BRANCH. The name starts as the one the sign in gave (./page
    on /onboarding/start), the handle as the account's own; the handle is
    checked as it is typed and saved through the one rule every handle
    goes through (app/api/profile/username). The photo is the account's
    photo, the same picker and crop as the store's step 3.
  */
  const [joinName, setJoinName] = useState(start?.name ?? "")
  const [joinHandle, setJoinHandle] = useState(() => {
    const fromName = suggestedJoinHandle(start?.name ?? "")
    if (fromName.length >= 3) return fromName
    return normalizeHandle(start?.username ?? "")
  })
  /* Only a handle they typed themselves sticks. The name on the previous slide keeps suggesting until then. */
  const joinHandleEdited = useRef(false)
  const [joinNote, setJoinNote] = useState<string | null>(null)
  const [joinBio, setJoinBio] = useState(start?.bio ?? "")
  const [joinHandleState, setJoinHandleState] = useState<"same" | "checking" | "free" | "taken" | "empty">("same")
  const joinHandleStateRef = useRef(joinHandleState)
  joinHandleStateRef.current = joinHandleState
  const [joinHandleError, setJoinHandleError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSaving, setJoinSaving] = useState(false)
  const [pushAnswer, setPushAnswer] = useState<PushPermission | null>(null)
  const [askingPush, setAskingPush] = useState(false)
  /*
    Notifications are a phone question. The browser onboarding is only the
    profile; iOS and Android (the Capacitor app) get the second step.
  */
  const [joinNotify, setJoinNotify] = useState(false)
  const finishOnce = useRef(false)
  const joinSaveRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const previewCompleteRef = useRef(onPreviewComplete)
  previewCompleteRef.current = onPreviewComplete
  const startRef = useRef(start)
  startRef.current = start
  useLayoutEffect(() => {
    setJoinNotify(inNativeApp())
  }, [])
  const joinSteps = [JOIN_NAME, JOIN_SOCIAL, ...(joinNotify ? [JOIN_NOTIFY] : [])]

  useEffect(() => {
    if (joinHandleEdited.current) return
    const next = suggestedJoinHandle(joinName)
    if (next.length >= 3) setJoinHandle(next)
  }, [joinName])

  /* The page they came from, loaded while they are still on these slides, so finishing does not start from a cold document. */
  useEffect(() => {
    if (!open || !start) return
    const href = welcomeDone(start.next)
    /* In full (the page, not only up to its loading screen), so the hand off from "You're all set" is one swap. */
    router.prefetch(href, { kind: "full" as never })
    const path = href.split("?")[0]
    if (path && path !== href) router.prefetch(path, { kind: "full" as never })
  }, [open, start?.next, router])

  /* Same device: restore fields if they left mid-flow without finishing. */
  useEffect(() => {
    if (!start || preview) return
    try {
      const raw = localStorage.getItem(JOIN_PROGRESS_STORAGE)
      if (!raw) return
      const saved = JSON.parse(raw) as {
        step?: number
        joinName?: string
        joinHandle?: string
        joinBio?: string
        socials?: typeof socials
      }
      if (saved.step === JOIN_SOCIAL || saved.step === JOIN_NAME) setCurrentStep(saved.step)
      if (saved.joinName) setJoinName(saved.joinName)
      if (saved.joinBio) setJoinBio(saved.joinBio)
      if (saved.socials) setSocials(restoreJoinSocials(saved.socials as Record<string, string>))
      if (saved.joinHandle) {
        const suggested = suggestedJoinHandle(saved.joinName ?? "")
        if (normalizeHandle(saved.joinHandle) !== suggested) joinHandleEdited.current = true
        setJoinHandle(saved.joinHandle)
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!start || preview || !open) return
    if (currentStep !== JOIN_NAME && currentStep !== JOIN_SOCIAL) return
    try {
      localStorage.setItem(
        JOIN_PROGRESS_STORAGE,
        JSON.stringify({ step: currentStep, joinName, joinHandle, joinBio, socials }),
      )
    } catch {
      /* ignore */
    }
  }, [currentStep, joinName, joinHandle, joinBio, socials, start, preview, open])

  useEffect(() => {
    if (openSocial) {
      setSocialPanel(openSocial)
      const id = requestAnimationFrame(() => setSocialPanelShown(true))
      return () => cancelAnimationFrame(id)
    }
    setSocialPanelShown(false)
    const t = window.setTimeout(() => setSocialPanel(null), SOCIAL_MORPH_MS)
    return () => clearTimeout(t)
  }, [openSocial])

  useEffect(() => {
    if (!openSocial) return
    const id = requestAnimationFrame(() => socialInputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [openSocial])

  const toggleSocial = (id: JoinSocialId) => {
    setOpenSocial((cur) => (cur === id ? null : id))
  }

  const applyJoinPhoto = async (blob: Blob, dataUrl?: string) => {
    if (preview) {
      setAvatarUrl(dataUrl ?? URL.createObjectURL(blob))
      return
    }
    let square = blob
    if (blob instanceof File) {
      try {
        square = await squareCropFile(blob)
      } catch {
        square = blob
      }
    }
    await uploadAvatarBlob(square)
  }

  /**
   * The profile picture. On a phone the choice is our sheet with Photo
   * Library only (not Take photo, not Choose File). The app's own library
   * opens straight away. A computer opens the file dialog from the same tap.
   */
  const openJoinPhoto = () => {
    if (uploadingAvatar) return
    if (isNativeApp()) {
      void pickPhoto("PHOTOS").then((picked) => {
        if (picked) void applyJoinPhoto(picked.blob, picked.dataUrl)
      })
      return
    }
    if (isPhoneViewport()) {
      setPhotoSheet(true)
      return
    }
    joinPhotoInputRef.current?.click()
  }

  const chooseJoinLibrary = () => {
    joinPhotoInputRef.current?.click()
    setPhotoSheet(false)
  }

  const onJoinPhotoFile = (file: File | undefined) => {
    if (!file) return
    void applyJoinPhoto(file)
  }

  useEffect(() => {
    if (!start) return
    const handle = normalizeHandle(joinHandle)
    setJoinHandleError(null)
    if (handle === normalizeHandle(start.username ?? "") && handle) {
      setJoinHandleState("same")
      return
    }
    if (!handle) {
      setJoinHandleState("empty")
      setJoinHandleError(null)
      return
    }
    setJoinHandleState("checking")
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username?handle=${encodeURIComponent(handle)}`, { signal: controller.signal })
        const data = (await res.json().catch(() => ({}))) as { available?: boolean; error?: string }
        setJoinHandleState(data.available ? "free" : "taken")
        setJoinHandleError(data.available ? null : data.error || tt("This username is taken"))
      } catch {
        if (!controller.signal.aborted) setJoinHandleState("same")
      }
    }, 400)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [joinHandle, start])

  /** The name and, when it changed, the handle, saved as the name step is left. */
  const saveJoinName = async (): Promise<boolean> => {
    const name = cleanName(joinName)
    if (!name) return false
    if (preview) return true
    setJoinError(null)
    try {
      const handle = normalizeHandle(joinHandle)
      if (start && handle && joinHandleState === "free") {
        const res = await fetch("/api/profile/username", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: handle }) })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setJoinHandleState("taken")
          setJoinHandleError(data.error || tt("This username is taken"))
          return false
        }
      }
      const res = await fetch("/api/account/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, bio: cleanBio(joinBio) }) })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setJoinError(data.error || tt("That did not save. Try again in a moment."))
        return false
      }
      await fetch("/api/account/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: { step: JOIN_STEP_USERNAME } }),
      }).catch(() => null)
      return true
    } catch {
      setJoinError(tt("Could not reach Storelib. Check your connection and try again."))
      return false
    }
  }

  /** Username, bio and socials, saved as the second slide is left. */
  const saveJoinUsername = async (): Promise<boolean> => {
    if (preview) return true
    const handle = normalizeHandle(joinHandle)
    const state = joinHandleStateRef.current
    if (!handle || state === "taken" || state === "checking" || state === "empty") return false
    setJoinError(null)
    try {
      if (start && handle && state === "free") {
        const res = await fetch("/api/profile/username", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: handle }) })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setJoinHandleState("taken")
          setJoinHandleError(data.error || tt("This username is taken"))
          return false
        }
      }
      const res = await fetch("/api/account/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cleanName(joinName), bio: cleanBio(joinBio) }) })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setJoinError(data.error || tt("That did not save. Try again in a moment."))
        return false
      }
      await saveJoinSocials()
      return true
    } catch {
      setJoinError(tt("Could not reach Storelib. Check your connection and try again."))
      return false
    }
  }

  /** The last slide, then the page they came from. The card stays up until that page is ready. */
  const exitJoin = () => {
    if (currentStep === JOIN_DONE) {
      if (!preview) void finishJoin()
      return
    }
    goToStep(JOIN_DONE, "right")
  }

  /** Social handles, just the name. Empty is fine. Saved before the done moment. */
  const saveJoinSocials = async () => {
    if (preview) return
    const clean = (v: string) => v.trim().replace(/^@+/, "").slice(0, 80)
    await fetch("/api/account/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socials: {
          instagram: clean(socials.instagram),
          tiktok: clean(socials.tiktok),
          youtube: clean(socials.youtube),
          bluesky: clean(socials.bluesky),
          twitter: clean(socials.twitter),
          linkedin: clean(socials.linkedin),
        },
      }),
    }).catch(() => null)
  }

  /**
   * The last step. The slides stay on screen while the welcome is saved and
   * the page they came from (already prefetched) is opened in place. A hard
   * load is only the fallback if that handoff does not land, so the screen
   * never drops to an empty white document first.
   */
  const finishJoin = async () => {
    if (preview) return
    if (finishOnce.current) return
    finishOnce.current = true
    const saved = await Promise.race([
      joinSaveRef.current,
      new Promise<boolean>((r) => setTimeout(() => r(true), 1600)),
    ])
    if (!saved) {
      finishOnce.current = false
      showStep(JOIN_SOCIAL, "left")
      return
    }
    const done = welcomeDone(startRef.current?.next ?? null)
    try {
      const { data } = await createClient().auth.getSession().catch(() => ({ data: { session: null } }))
      const id = data.session?.user?.id
      if (id) {
        const snap = readAuthSnapshot()
        writeAuthSnapshot({
          signedIn: true,
          userId: id,
          avatarUrl: snap?.avatarUrl ?? null,
          displayName: cleanName(joinName) || snap?.displayName || null,
          username: normalizeHandle(joinHandle) || snap?.username || null,
          isSeller: !!snap?.isSeller,
        })
      }
    } catch {
      /* the community frame writes the same record if this did not */
    }
    document.body.style.overflow = ""
    document.body.style.paddingRight = ""
    document.body.style.touchAction = ""
    document.body.removeAttribute("data-scroll-locked")
    document.documentElement.style.overflow = ""
    try {
      localStorage.removeItem(JOIN_PROGRESS_STORAGE)
    } catch {
      /* ignore */
    }
    await Promise.race([
      fetch("/api/account/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
        keepalive: true,
      }).catch(() => null),
      new Promise((r) => setTimeout(r, 4000)),
    ])
    /* No route surface over "You're all set": its line is the wait, and it stays until the page it opens has painted (round 14). */
    router.replace(done)
    window.setTimeout(() => {
      if (window.location.pathname.startsWith("/onboarding")) window.location.replace(done)
    }, 8000)
  }

  const finishJoinRef = useRef(finishJoin)
  finishJoinRef.current = finishJoin
  useEffect(() => {
    if (currentStep !== JOIN_DONE) return
    if (preview) {
      const t = window.setTimeout(() => {
        const dest = welcomeDone(startRef.current?.next ?? null)
        const done = previewCompleteRef.current
        if (done) {
          done(dest)
          return
        }
        setJoinNote(tt("Preview only. Nothing was saved."))
        window.setTimeout(() => setJoinNote(null), 2200)
        setCurrentStep(JOIN_NAME)
      }, 680)
      return () => window.clearTimeout(t)
    }
    void finishJoinRef.current()
  }, [currentStep, preview])

  /**
   * The notification question, from the Turn on button only. The app asks
   * the phone (lib/native-push). A browser asks its own permission and, where
   * push exists, subscribes (lib/push/web-client). Never on open.
   */
  const allowNotifications = async () => {
    if (askingPush) return
    setAskingPush(true)
    try {
      if (inNativeApp()) {
        setPushAnswer(await askPushPermission())
        return
      }
      if (typeof window !== "undefined" && "Notification" in window) {
        let answer: NotificationPermission = Notification.permission
        if (answer === "default") {
          try {
            answer = await Notification.requestPermission()
          } catch {
            answer = Notification.permission
          }
        }
        setPushAnswer(answer === "granted" ? "granted" : answer === "denied" ? "denied" : "prompt")
        /* Subscribe before leaving, but never hold the next page on a stuck worker. */
        if (answer === "granted") {
          const { enableWebPush, webPushSupported } = await import("@/lib/push/web-client")
          if (webPushSupported()) {
            await Promise.race([enableWebPush().catch(() => undefined), new Promise((r) => setTimeout(r, 2500))])
          }
        }
        return
      }
      setPushAnswer("unsupported")
    } finally {
      setAskingPush(false)
    }
  }

  const startDashboardRedirect = () => {
    setIsRedirecting(true)
    setRedirectFailed(false)

    if (redirectFailureTimerRef.current) {
      clearTimeout(redirectFailureTimerRef.current)
    }

    redirectFailureTimerRef.current = setTimeout(() => {
      setRedirectFailed(true)
    }, 12000)

    /*
      IN PLACE, NOT A NEW DOCUMENT (round 14). A hard load dropped this screen for an empty white document and then the
      dashboard's own first screen: "white space, then it takes me there abruptly". The router's kept copies are dropped first
      (refresh), so /app is read fresh from the server with onboarding done, and this screen stays until the dashboard is ready
      to replace it. A hard load is only the fallback when the dashboard has not opened in a few seconds.
    */
    router.refresh()
    router.replace("/app")
    window.setTimeout(() => {
      if (!window.location.pathname.startsWith("/app")) window.location.replace("/app")
    }, 5000)
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

  /*
    WHAT WAS TYPED STAYS. Back never cleared anything (the fields live here),
    and now a reload of /sell in the same tab opens on the same step with the
    same words, until the store is set up.
  */
  const draftReadRef = useRef(false)
  useEffect(() => {
    if (!open || start || preview || resumeFromStripe || draftReadRef.current) return
    draftReadRef.current = true
    if (resume && resume.step > 1) return
    try {
      const raw = sessionStorage.getItem(SELL_DRAFT_STORAGE)
      if (!raw) return
      const d = JSON.parse(raw) as { step?: number; goals?: unknown[]; displayName?: string; bio?: string; socials?: Record<string, string>; slugFollows?: boolean }
      if (Array.isArray(d.goals)) setGoals(d.goals.filter((g): g is SellGoal => SELL_GOALS.some((x) => x.id === g)))
      if (typeof d.displayName === "string" && d.displayName.trim()) {
        if (d.slugFollows) slugFollowsName.current = true
        setDisplayName(d.displayName)
      }
      if (typeof d.bio === "string") setBio(d.bio)
      if (d.socials) setSocials(restoreJoinSocials(d.socials))
      if (d.step === 2 || d.step === 3 || d.step === 4) setCurrentStep(d.step)
    } catch {
      /* a draft that cannot be read is no draft */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open || start || preview || !draftReadRef.current || currentStep < 1 || currentStep > 4) return
    try {
      sessionStorage.setItem(SELL_DRAFT_STORAGE, JSON.stringify({ step: currentStep, goals, displayName, bio, socials, slugFollows: slugFollowsName.current }))
    } catch {}
  }, [open, start, preview, currentStep, goals, displayName, bio, socials])

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
      if (saved.socials) setSocials(restoreJoinSocials(saved.socials as Record<string, string>))
      if (saved.selectedCategory !== undefined) setSelectedCategory(saved.selectedCategory)
      const savedGoals = Array.isArray(saved.goals) ? (saved.goals as unknown[]).filter((g): g is SellGoal => SELL_GOALS.some((x) => x.id === g)) : []
      setGoals(savedGoals)
      // Start setup immediately with the saved data so we don't depend on React
      // state being updated synchronously.
      startSetup({
        displayName: saved.displayName,
        bio: saved.bio,
        avatarUrl: saved.avatarUrl,
        socials: saved.socials,
        selectedCategory: saved.selectedCategory,
        goals: savedGoals,
        handle: typeof saved.handle === "string" ? saved.handle : undefined,
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
        displayName, bio, avatarUrl, socials, selectedCategory, goals, planId: "free", handle: getSlug(),
      }))
    } catch {}
    startSetup()
  }

  /** User chose a paid plan — create a Stripe checkout session and redirect. */
  const handleSelectPaid = async (planId: "growth" | "pro") => {
    if (planCheckoutLoading) return
    setPlanCheckoutLoading(planId)

    const wanted = getSlug() || "creator"
    let _slug = wanted

    // Persist form state so we can restore it when the user returns from Stripe.
    const remember = () => {
      try {
        localStorage.setItem("storelib_onboarding_state", JSON.stringify({
          displayName, bio, avatarUrl, socials, selectedCategory, goals, planId, handle: _slug,
        }))
      } catch {}
    }
    remember()

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
        /* The server gives the handle first: a store row may only carry the account's own (part 462). */
        _slug = (await claimStoreHandle(wanted)) || wanted
        remember()
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
      /* The sign in's name is only a starting point: never over a store name read back from a setup begun before, or one already filled from their profile. */
      const { data: named } = await supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle()
      const profileName = ((named as { display_name?: string | null } | null)?.display_name || "").trim()
      const profileHandle = normalizeHandle((named as { username?: string | null } | null)?.username || "")
      const fromAccount = profileName || (user.user_metadata?.full_name as string | undefined) || (user.user_metadata?.name as string | undefined) || ""
      if (fromAccount && !resume?.displayName) {
        setDisplayName((cur) => cur.trim() || fromAccount.trim())
      }
      if (profileHandle && !seededSlug.current) {
        seededSlug.current = profileHandle
        slugFollowsName.current = false
      }
    }
    if (open) {
      loadUserAvatar()
    }
  }, [open])

  // Check username availability
  useEffect(() => {
    const slug = !slugFollowsName.current && seededSlug.current
      ? seededSlug.current
      : storeSlugFrom(displayName)
    if (!slug) {
      setUsernameAvailable(null)
      return
    }
    /* Too short to be a handle: the server makes one from it when the store is set up (claimStoreHandle), so the name never stops here. */
    if (slug.length < 3) {
      setUsernameAvailable(true)
      return
    }

    /*
      The same question the save asks (GET /api/profile/username): taken
      anywhere a handle lives, or a name the rules refuse. It used to ask
      only whether a OnePage had the name.
    */
    const checkAvailability = async () => {
      setCheckingUsername(true)
      try {
        const res = await fetch(`/api/profile/username?handle=${encodeURIComponent(slug)}`, { cache: "no-store" })
        const data = (await res.json().catch(() => null)) as { available?: boolean } | null
        /* Not answered (signed out, offline, rate limited): the setup claims a free one in the end. */
        setUsernameAvailable(res.ok && data && typeof data.available === "boolean" ? data.available : true)
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
    if (!slugFollowsName.current && seededSlug.current) return seededSlug.current
    return storeSlugFrom(displayName)
  }

  const uploadAvatarBlob = async (blob: Blob, previewUrl?: string) => {
    const previousAvatar = avatarUrl
    setJoinError(null)
    setUploadingAvatar(true)
    try {
      const preview = previewUrl ?? URL.createObjectURL(blob)
      setAvatarUrl(preview)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(tt("Not authenticated"))

      const fileName = `${user.id}/creator-avatar-${Date.now()}.png`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, blob, { upsert: true })
      if (uploadError) throw uploadError
      confirmUpload("avatars", fileName)

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName)
      await saveAccountPhoto(publicUrl)
      setAvatarUrl(publicUrl)
      if (previewUrl) URL.revokeObjectURL(preview)
    } catch (e) {
      console.error("Error uploading avatar:", e)
      setAvatarUrl(previousAvatar)
      setJoinError(e instanceof Error ? e.message : tt("Failed to upload image"))
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const squareCropFile = async (file: File): Promise<Blob> => {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(tt("Failed to load image")))
        img.src = url
      })
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2
      const canvas = document.createElement("canvas")
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error(tt("No canvas"))
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 512, 512)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tt("Failed to create blob")))), "image/jpeg", 0.92)
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  // Handle avatar file selection
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isJoinStep(currentStep)) {
      if (preview) {
        const url = URL.createObjectURL(file)
        setAvatarUrl(url)
        return
      }
      void squareCropFile(file).then((blob) => uploadAvatarBlob(blob))
      return
    }

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
      if (!ctx) throw new Error(tt("No canvas context"))

      const outputSize = 512
      canvas.width = outputSize
      canvas.height = outputSize

      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(tt("Failed to load image")))
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
          (b) => b ? resolve(b) : reject(new Error(tt("Failed to create blob"))),
          'image/png',
          0.95
        )
      })

      /* The circle shows the crop at once. The upload replaces it when it lands, so the step never sits empty. */
      const preview = URL.createObjectURL(blob)
      setAvatarUrl(preview)
      setShowCropModal(false)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(tt("Not authenticated"))

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
      await saveAccountPhoto(publicUrl)

      setAvatarUrl(publicUrl)
      URL.revokeObjectURL(preview)
      setShowCropModal(false)
      if (tempImageUrl) URL.revokeObjectURL(tempImageUrl)
      setTempImageUrl(null)
      setAvatarFile(null)
      setCropBox({ x: 50, y: 50, size: 200 })
    } catch (e) {
      console.error("Error uploading avatar:", e)
      alert(tt("Failed to upload image"))
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Check if can proceed to next step
  const canProceed = () => {
    switch (currentStep) {
      case JOIN_NAME:
        return !!cleanName(joinName) && !joinSaving
      case JOIN_SOCIAL:
        return !!normalizeHandle(joinHandle) && !joinSaving && (joinHandleState === "same" || joinHandleState === "free" || joinHandleState === "checking")
      case JOIN_DONE:
        return false
      /* Turn on notifications asks; Not now skips. Neither waits on a second press. */
      case JOIN_NOTIFY:
        return !joinSaving && !askingPush
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return true // What brings them here: any, all or none
      case 3:
        return true // Socials are optional
      // Step 4 (plan) has its own card buttons, Continue is not shown there
      default:
        return false
    }
  }

  // Check if can skip
  const canSkip = () => {
    switch (currentStep) {
      case JOIN_NOTIFY:
        return !joinSaving && !askingPush && pushAnswer === null
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return true
      case 3:
        return true
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
    if (currentStep === JOIN_DONE) {
      stepLeaveRef.current?.animate(
        [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.97" }],
        { duration: STEP_OUT_MS + 40, easing: MOTION_EASE, fill: "forwards" },
      )
      stepEnterRef.current?.querySelectorAll<HTMLElement>("[data-join-done-rise]").forEach((el, i) => {
        el.animate(
          [{ opacity: 0, translate: "0 8px", scale: "0.97" }, { opacity: 1, translate: "0 0", scale: "1" }],
          { duration: 680, delay: 60 + i * 85, easing: MOTION_EASE, fill: "backwards" },
        )
      })
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      stepTimerRef.current = setTimeout(() => setLeavingStep(null), STEP_IN_MS)
      return
    }
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
    const joinSlide = isJoinStep(currentStep) || (leavingStep !== null && isJoinStep(leavingStep.step))
    const shift = joinSlide ? JOIN_STEP_SHIFT : STEP_SHIFT
    const inMs = joinSlide ? JOIN_STEP_IN_MS : STEP_IN_MS
    const dx = direction === "right" ? shift : -shift
    stepEnterRef.current?.animate(
      joinSlide
        ? [{ opacity: 0, translate: `${dx}px 0`, scale: "0.985" }, { opacity: 1, translate: "0 0", scale: "1" }]
        : [{ opacity: 0, translate: `${dx}px 0` }, { opacity: 1, translate: "0 0" }],
      { duration: inMs, easing: MOTION_EASE },
    )
    stepLeaveRef.current?.animate(
      joinSlide
        ? [{ opacity: 1, translate: "0 0", scale: "1" }, { opacity: 0, translate: `${-dx}px 0`, scale: "0.985" }]
        : [{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: `${-dx}px 0` }],
      { duration: STEP_OUT_MS, easing: MOTION_EASE, fill: "forwards" },
    )
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    stepTimerRef.current = setTimeout(() => setLeavingStep(null), inMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate once per step change; clearing leavingStep must not replay the move
  }, [currentStep])

  // Handle next step
  const handleNext = async () => {
    if (joinSaving || askingPush) return
    if (currentStep === JOIN_SOCIAL && joinHandleState === "checking" && normalizeHandle(joinHandle)) {
      setJoinSaving(true)
      const state = await new Promise<"same" | "checking" | "free" | "taken" | "empty">((resolve) => {
        const started = Date.now()
        const tick = () => {
          const now = joinHandleStateRef.current
          if (now !== "checking" || Date.now() - started > 2000) {
            resolve(now)
            return
          }
          window.setTimeout(tick, 40)
        }
        tick()
      })
      setJoinSaving(false)
      if (state !== "same" && state !== "free") return
    } else if (!canProceed()) return
    if (isJoinStep(currentStep)) {
      if (currentStep === JOIN_NAME) {
        if (!joinHandleEdited.current) {
          const nextHandle = suggestedJoinHandle(joinName)
          if (nextHandle.length >= 3) setJoinHandle(nextHandle)
        }
        const save = saveJoinName()
        joinSaveRef.current = Promise.all([joinSaveRef.current, save]).then(([prev, ok]) => prev && ok)
        goToStep(JOIN_SOCIAL, "right")
        void save.then((ok) => {
          if (ok || finishOnce.current) return
          window.setTimeout(() => showStep(JOIN_NAME, "left"), JOIN_STEP_IN_MS + 40)
        })
        return
      }
      if (currentStep === JOIN_SOCIAL) {
        const save = saveJoinUsername()
        joinSaveRef.current = Promise.all([joinSaveRef.current, save]).then(([prev, ok]) => prev && ok)
        goToStep(joinNotify || inNativeApp() ? JOIN_NOTIFY : JOIN_DONE, "right")
        return
      }
      if (currentStep === JOIN_NOTIFY) {
        await allowNotifications()
        goToStep(JOIN_DONE, "right")
        return
      }
      return
    }
    // Steps 1-3 advance normally; step 3 → step 4 (plan selection)
    if (currentStep >= 4) return
    goToStep(currentStep + 1, "right")
  }

  /** The step Back goes to, or null where there is none (the first question, the store's first step without it, the plans' setup). */
  const backFrom = (step: number): number | null => {
    if (step === JOIN_NAME || step === JOIN_DONE) return null
    if (isJoinStep(step)) return joinSteps[joinSteps.indexOf(step) - 1] ?? JOIN_NAME
    if (step === 1) return null
    if (step >= 2 && step <= 4) return step - 1
    return null
  }

  // Handle back step
  const handleBack = () => {
    const back = backFrom(currentStep)
    if (back === null) return
    goToStep(back, "left")
  }

  // Handle skip
  const handleSkip = async () => {
    if (!canSkip()) return
    if (isJoinStep(currentStep)) {
      if (currentStep === JOIN_NOTIFY) {
        await exitJoin()
        return
      }
      const next = joinSteps[joinSteps.indexOf(currentStep) + 1]
      if (next) goToStep(next, "right")
      return
    }
    handleNext()
  }

  // Start setup process
  // Accepts optional override data when resuming after a Stripe redirect (state was lost).
  const startSetup = async (overrideData?: {
    displayName?: string
    bio?: string
    avatarUrl?: string | null
    socials?: { instagram: string; tiktok: string; youtube: string; twitter?: string }
    selectedCategory?: string | null
    goals?: SellGoal[]
    handle?: string
  }) => {
    // Resolve effective values — override data wins over React state.
    const _dn = overrideData?.displayName ?? displayName
    const _bio = overrideData?.bio ?? bio
    const _av = overrideData?.avatarUrl !== undefined ? overrideData.avatarUrl : avatarUrl
    const _soc = overrideData?.socials ?? socials
    const _cat = overrideData?.selectedCategory !== undefined ? overrideData.selectedCategory : selectedCategory
    /* The address on screen, or the one saved before the Stripe redirect; the server says which one it is (claimStoreHandle). */
    const wanted = overrideData?.handle || (overrideData ? storeSlugFrom(_dn) : getSlug())
    let _slug = wanted

    /* What they came to do, on the account, for the dashboard to start from. Never in the way of the setup. */
    const _goals = overrideData?.goals ?? goals
    void supabase.auth.updateUser({ data: { [GOALS_KEY]: _goals } }).catch(() => undefined)
    try {
      sessionStorage.removeItem(SELL_DRAFT_STORAGE)
    } catch {}

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
      if (!user) throw new Error(tt("Not authenticated"))

      /* The handle first, on the server: it moves the username, an existing store's address and its OnePage together. */
      _slug = (await claimStoreHandle(wanted)) || wanted

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
          display_name: _dn,
          avatar_url: _av,
        })
        .eq("id", user.id)

      if (creator) {
        // Update creator profile - only use columns that exist in the database
        await supabase
          .from("creators")
          .update({
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
            twitter: { enabled: !!xHandle(_soc), url: xHandle(_soc) ? `https://x.com/${xHandle(_soc)}` : "" },
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
          twitter: xHandle(_soc) ? `https://x.com/${xHandle(_soc)}` : null,
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
            twitter: xHandle(_soc) ? `https://x.com/${xHandle(_soc)}` : null,
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
              twitter: { enabled: !!xHandle(_soc), url: xHandle(_soc) ? `https://x.com/${xHandle(_soc)}` : "" },
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

  // Progress bar width (5 steps total; the join branch its own two or three, the first question a sliver)
  const progressWidth = isJoinStep(currentStep)
    ? ((Math.max(0, joinSteps.indexOf(currentStep)) + 1) / joinSteps.length) * 100
    : (Math.min(currentStep, 4) / 4) * 100

  // Filter categories for search
  const allCategories = [...PRIMARY_CATEGORIES, ...EXTENDED_CATEGORIES]
  const filteredCategories = categorySearch
    ? allCategories.filter(c => tt(c).toLowerCase().includes(categorySearch.toLowerCase()) || c.toLowerCase().includes(categorySearch.toLowerCase()))
    : EXTENDED_CATEGORIES

  /**
   * ONE STEP'S CONTENT, BY NUMBER. Drawn for the step on screen and, for
   * the moment a step change takes, for the one leaving beside it.
   */
  const renderStep = (step: number) => (
    <>
        {/* Slide 1: name, photo, socials. Username and bio are the next slide. */}
        {step === JOIN_NAME && (
          <div className="mx-auto flex w-full max-w-[min(100%,600px)] flex-col items-center text-center font-sans" data-onboarding-join="profile">
            {/* The same row as the seller's page step: the photo, and a slim button beside it. */}
            <div className="mb-1 flex w-full items-center gap-4 text-left">
              <button
                type="button"
                onClick={openJoinPhoto}
                disabled={uploadingAvatar}
                data-onboarding-join-photo=""
                aria-label={avatarUrl ? tt("Change photo") : tt("Add a photo")}
                className={cn("relative block h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#eceef1] transition-[scale] duration-200 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] sm:h-[72px] sm:w-[72px]", AVATAR_RING)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
                ) : (
                  <span className="absolute inset-0 text-[#b0b5bd]"><DefaultAvatarGlyph fill /></span>
                )}
                {uploadingAvatar ? (
                  <span className="absolute inset-0 grid place-items-center bg-white/70">
                    <ActivitySpinner size={20} className="text-[#4b5563]" />
                  </span>
                ) : null}
              </button>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={openJoinPhoto}
                  disabled={uploadingAvatar}
                  data-onboarding-join-photo-add=""
                  className="group -my-1.5 inline-flex h-11 items-center disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,scale] duration-200 group-hover:bg-[#f9fafb] group-active:scale-[0.97] motion-reduce:transition-none">
                    <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {avatarUrl ? tt("Change photo") : tt("Add a photo")}
                  </span>
                </button>
                <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Shown on your profile.")}</p>
              </div>
            </div>
            <label className={cn(FIELD, "mt-3")}>
              <span className="sr-only">{tt("Your name")}</span>
              <User className="h-5 w-5 shrink-0 text-[#9ca3af]" aria-hidden />
              <input
                type="text"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder={tt("Your name")}
                maxLength={60}
                autoComplete="name"
                data-onboarding-join-name=""
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#9ca3af]"
              />
            </label>
            <div className="mt-5 w-full min-w-0" data-onboarding-social-row="">
              <div
                className={cn(
                  "grid w-full min-w-0 transition-[grid-template-rows,opacity,margin] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  socialPanelShown ? "mb-3 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 w-full min-w-0 overflow-hidden">
                  {socialPanel ? (
                    <label
                      className={cn(
                        "flex h-[52px] w-full min-w-0 items-center gap-1 rounded-[10px] px-4 transition-[opacity,translate,scale] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                        FIELD_WELL,
                        socialPanelShown ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-[0.985] opacity-0",
                      )}
                    >
                      <span className="sr-only">{socialPanel}</span>
                      <span className="select-none text-[16px] text-[#9ca3af]">@</span>
                      <input
                        ref={socialInputRef}
                        type="text"
                        value={socials[socialPanel]}
                        onChange={(e) => setSocials({ ...socials, [socialPanel]: e.target.value.replace(/@/g, "") })}
                        placeholder="yourname"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-onboarding-join-social={socialPanel}
                        className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
              <div
                className={cn(
                  "flex flex-wrap items-center justify-center gap-1.5 px-0.5 sm:gap-2 transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  socialPanelShown ? "translate-y-0 opacity-100" : "translate-y-0 opacity-100",
                )}
              >
                {(
                  [
                    ["tiktok", "TikTok"],
                    ["instagram", "Instagram"],
                    ["twitter", "X"],
                    ["youtube", "YouTube"],
                    ["linkedin", "LinkedIn"],
                  ] as const
                ).map(([id, label]) => {
                  const on = openSocial === id
                  const filled = !!socials[id]
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-expanded={on}
                      aria-label={on ? tt("Close {label}", { label }) : tt("Add {label}", { label })}
                      onClick={() => toggleSocial(id)}
                      className="relative grid h-[48px] w-[48px] shrink-0 place-items-center [-webkit-tap-highlight-color:transparent]"
                    >
                      <span
                        className={cn(
                          "grid h-10 w-10 place-items-center rounded-full bg-[#f4f4f5] text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_0_0_1px_rgba(17,24,39,0.07),0_1px_3px_rgba(17,24,39,0.07)] transition-[box-shadow,scale] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                          on && "scale-[1.04] shadow-[inset_0_0_0_2px_#6b7280,0_2px_6px_-2px_rgba(17,24,39,0.12)]",
                          filled && !on && "shadow-[inset_0_0_0_1.5px_#8b5cf6]",
                        )}
                      >
                        <JoinSocialBrandIcon id={id} className="h-[18px] w-[18px] shrink-0" />
                      </span>
                      <SocialToggleBadge on={on} />
                    </button>
                  )
                })}
              </div>
            </div>
            {joinError && <p role="alert" className="mt-3 text-center text-[13px] text-red-600">{joinError}</p>}
          </div>
        )}

        {step === JOIN_SOCIAL && (
          <div className="mx-auto flex w-full max-w-[min(100%,560px)] flex-col items-center font-sans text-center" data-onboarding-join="username">
            <span className={cn("relative mb-3 block h-[72px] w-[72px] overflow-hidden rounded-full bg-[#eceef1] text-[#9ca3af]", AVATAR_RING)}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" /> : <DefaultAvatarGlyph fill />}
            </span>
            <label className={cn("mt-1 flex h-[52px] w-full items-center gap-1.5 rounded-[10px] px-4 text-left", FIELD_WELL)}>
              <span className="sr-only">{tt("Username")}</span>
              <AtSign className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" strokeWidth={2} aria-hidden />
              <input
                type="text"
                value={joinHandle}
                onChange={(e) => {
                  joinHandleEdited.current = true
                  setJoinHandle(e.target.value.toLowerCase().replace(/^@+/, "").replace(/[\s_.]+/g, "-").replace(/[^a-z0-9-]/g, ""))
                }}
                placeholder="username"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                data-onboarding-join-handle=""
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
              />
              {joinHandleState === "checking" && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-gray-400" />}
              {joinHandleState === "free" && <Check className="h-5 w-5 shrink-0 text-green-500" />}
              {joinHandleState === "taken" && normalizeHandle(joinHandle) && <X className="h-5 w-5 shrink-0 text-red-500" />}
            </label>
            <p className={cn("mt-2 min-h-[18px] w-full text-left text-[13px] leading-[18px]", joinHandleError ? "text-red-500" : "text-[#6b7280]")} aria-live="polite">
              {joinHandleError ?? (normalizeHandle(joinHandle) ? `storelib.com/${normalizeHandle(joinHandle)}` : "storelib.com/username")}
            </p>
            <label className={cn("mt-3 flex w-full items-start rounded-[10px] px-4 py-3 text-left", FIELD_WELL)}>
              <span className="sr-only">{tt("Bio, optional")}</span>
              <textarea
                value={joinBio}
                onChange={(e) => setJoinBio(e.target.value.slice(0, 160))}
                placeholder={tt("Add a short bio")}
                rows={2}
                maxLength={160}
                data-onboarding-join-bio=""
                className="min-h-[44px] w-full resize-none bg-transparent text-[16px] outline-none"
              />
            </label>
            {joinError && <p role="alert" className="mt-3 text-[13px] text-red-600">{joinError}</p>}
          </div>
        )}

        {step === JOIN_NOTIFY && (
          <div className="mx-auto flex w-full max-w-[min(100%,560px)] flex-col items-center text-center font-sans" data-onboarding-join="notify" data-push-answer={pushAnswer ?? ""}>
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#f4f4f5] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05),0_1px_2px_rgba(17,24,39,0.05)]">
              <Bell className="h-7 w-7" strokeWidth={1.8} />
            </span>
            {pushAnswer === "granted" ? (
              <p className="inline-flex h-12 items-center gap-2 text-[15px] font-medium text-[#1a1a2e]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a]">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
                {tt("Notifications are on")}
              </p>
            ) : pushAnswer === "denied" ? (
              <p className="max-w-[360px] text-[14px] leading-[20px] text-[#6b7280]">
                {tt("They are off for now. You can turn them on in")} {phoneSettingsPath(nativePlatform())}.
              </p>
            ) : null}
          </div>
        )}

        {step === JOIN_DONE && (
          <div data-onboarding-join="done" className="flex h-full min-h-[300px] flex-col items-center justify-center px-4 pb-6 text-center sm:min-h-[360px]">
            <span data-join-done-rise="" className="block">
              <StorelibLogo size={56} fluid className="mx-auto block h-[52px] w-[52px] sm:h-14 sm:w-14" />
            </span>
            <h1 data-join-done-rise="" className={cn(SETUP_LINE, "mt-5")}>
              {tt("You're all set")}
            </h1>
            {preview ? (
              <button type="button" data-join-done-rise="" onClick={() => setCurrentStep(JOIN_NAME)} className="mt-6 text-[14px] font-semibold text-[#6d28d9]">
                {tt("Play it again")}
              </button>
            ) : (
              <div data-join-done-rise="" className="mt-6 h-[3px] w-16 overflow-hidden rounded-full bg-[#eceef1]" aria-hidden>
                <span className="block h-full w-1/2 rounded-full bg-[#1a1a2e] motion-safe:animate-[onboard-line_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite] motion-reduce:w-full" />
              </div>
            )}
          </div>
        )}

        {/* Step 1: what they came to do. Pills, several at once (Shopify's setup is the reference). */}
        {step === 2 && (
          <div data-onboarding-goals="" role="group" aria-label={tt("What brings you here")} className="flex flex-col gap-2 sm:gap-2.5">
            {GOAL_ROWS.map((row) => (
              <div key={row.join()} data-onboarding-goal-row="" className="flex gap-2 sm:gap-2.5">
                {row.map((id) => {
                  const g = SELL_GOALS.find((x) => x.id === id)!
                  const on = goals.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      data-onboarding-goal={g.id}
                      onClick={() => {
                        hapticTap("soft")
                        toggleGoal(g.id)
                      }}
                      className={cn(GOAL_PILL, row.length === 1 && "flex-none px-5", on ? GOAL_ON : GOAL_OFF)}
                    >
                      <GoalMark on={on} />
                      <span className="whitespace-nowrap">{tt(g.label)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* Step 2: who they are. Photo, name, address, a line about them; prefilled from Google or Apple. */}
        {step === 1 && (
          <div data-onboarding-identity="" className="flex flex-col gap-3">
            <div className="mb-1 flex items-center gap-4">
              <button
                type="button"
                onClick={openJoinPhoto}
                disabled={uploadingAvatar}
                data-onboarding-photo=""
                aria-label={avatarUrl ? tt("Change photo") : tt("Add a photo")}
                className={cn("relative block h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#eceef1] transition-[scale] duration-200 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] sm:h-[72px] sm:w-[72px]", AVATAR_RING)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-[#b0b5bd]"><AvatarMark name={displayName} size={72} /></span>
                )}
                {uploadingAvatar ? (
                  <span className="absolute inset-0 grid place-items-center bg-white/70">
                    <ActivitySpinner size={20} className="text-[#4b5563]" />
                  </span>
                ) : null}
              </button>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={openJoinPhoto}
                  disabled={uploadingAvatar}
                  data-onboarding-photo-button=""
                  className="group -my-1.5 inline-flex h-11 items-center disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(17,24,39,0.05)] transition-[background-color,scale] duration-200 group-hover:bg-[#f9fafb] group-active:scale-[0.97] motion-reduce:transition-none">
                    <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {avatarUrl ? tt("Change photo") : tt("Add a photo")}
                  </span>
                </button>
                <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Shown on your page and your store.")}</p>
              </div>
            </div>

            <label className={FIELD} data-onboarding-name="">
              <span className="sr-only">{tt("Your name or brand")}</span>
              <User className="h-5 w-5 shrink-0 text-[#9ca3af]" aria-hidden />
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  slugFollowsName.current = true
                  setDisplayName(e.target.value)
                }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                placeholder={tt("Your name or brand")}
                maxLength={60}
                autoComplete="name"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
              />
              {checkingUsername ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#9ca3af]" aria-hidden /> : null}
              {!checkingUsername && usernameAvailable === true && displayName.trim() ? <Check className="h-5 w-5 shrink-0 text-[#16a34a]" aria-label={tt("Available")} /> : null}
              {!checkingUsername && usernameAvailable === false && displayName.trim() ? <X className="h-5 w-5 shrink-0 text-[#dc2626]" aria-label={tt("Taken")} /> : null}
            </label>
            {usernameAvailable === false && displayName.trim() ? (
              <p role="alert" className="-mt-1 px-1 text-[13px] text-[#dc2626]">{tt("This name is not available")}</p>
            ) : null}

            <div className={cn(FIELD, "bg-[#f8f8f9]")} data-onboarding-address="">
              <svg className="h-5 w-5 shrink-0 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="min-w-0 truncate text-[16px]" aria-live="polite">
                <span className="font-medium text-[#1a1a2e]">{getSlug() || tt("yourname")}</span>
                <span className="text-[#9ca3af]">{".storelib.com"}</span>
              </span>
            </div>

            <label className={cn(FIELD, "h-auto items-start py-3")}>
              <span className="sr-only">{tt("Tell people what you do or create")}</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                placeholder={tt("Tell people what you do or create")}
                rows={2}
                maxLength={160}
                className="min-h-[48px] w-full resize-none bg-transparent text-[16px] leading-6 text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
              />
            </label>
            {joinError ? <p role="alert" className="px-1 text-[13px] text-[#dc2626]">{joinError}</p> : null}
          </div>
        )}

        {/* Step 3: where people already follow them. Compact, one line each, all optional. */}
        {step === 3 && (
          <div data-onboarding-socials="" className="flex flex-col gap-2.5">
            {(
              [
                ["instagram", "Instagram", "username", true],
                ["tiktok", "TikTok", "username", true],
                ["youtube", "YouTube", "youtube.com/@channel", false],
                ["twitter", "X", "username", true],
              ] as const
            ).map(([id, label, placeholder, at]) => (
              <label key={id} className={cn(FIELD, "h-[50px] gap-2.5")} data-onboarding-social={id}>
                <span className="sr-only">{label}</span>
                <JoinSocialBrandIcon id={id} className="h-5 w-5 shrink-0 text-[#1a1a2e]" />
                {at ? <span className="-mr-1.5 select-none text-[16px] text-[#9ca3af]">@</span> : null}
                <input
                  type="text"
                  value={socials[id]}
                  onChange={(e) => setSocials({ ...socials, [id]: at ? e.target.value.replace(/@/g, "") : e.target.value })}
                  placeholder={placeholder}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
                />
                <SocialFace preview={socialPreviews[id]} />
              </label>
            ))}
          </div>
        )}

        {/*
          Step 4: the plans, whole. The heading and its line at the left and
          Monthly / Yearly at the right from 768px; every card at its full
          height, with the page itself scrolling when the window is shorter.
        */}
        {step === 4 && (
          <div data-onboarding-plans="" className="[--plan-bleed:16px] sm:[--plan-bleed:24px]">
            <PricingSection
              compact
              hideDetailsLink
              compactHeading={
                <div className="flex items-start gap-3 text-left sm:gap-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={!!planCheckoutLoading}
                    data-onboarding-back=""
                    aria-label={tt("Back")}
                    className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition-colors duration-200 hover:bg-white/[0.16] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:mt-1"
                  >
                    <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </button>
                  <div className="min-w-0">
                    <h1 className={cn(VIEW_TITLE, "text-left")}>{tt("Choose your plan")}</h1>
                    <p className="mt-2 text-[15px] leading-[22px] text-white/70 sm:text-[16px] sm:leading-6">{tt("Start free and upgrade when you need to.")}</p>
                  </div>
                </div>
              }
              onboardingCallbacks={{
                onPlanSelect: (planId) => {
                  if (planId === "free") handleSelectFree()
                  else handleSelectPaid(planId)
                },
                loadingPlan: planCheckoutLoading,
                ctaLabels: {
                  free: tt("Start free"),
                  growth: tt("Get Grow"),
                  pro: tt("Get Pro"),
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
                    creating: <h1 className={SETUP_LINE}>{tt("Creating your store")}</h1>,
                    applying: <h1 className={SETUP_LINE}>{tt("Applying your settings")}</h1>,
                    almost: <h1 className={SETUP_LINE}>{tt("Almost ready")}</h1>,
                    done: (
                      <h1 className={cn(SETUP_LINE, "inline-flex items-center gap-2.5")}>
                        {tt("Your store is ready")}
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] shadow-[0_1px_2px_rgba(22,163,74,0.35)]">
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                        </span>
                      </h1>
                    ),
                    error: (
                      <div>
                        <h1 className={SETUP_LINE}>{tt("Your store was not saved")}</h1>
                        <p className="mt-1.5 text-[15px] leading-[21px] text-[#6b7280]">{tt("Check your connection and try again.")}</p>
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
                      className={cn("h-11 rounded-[10px] px-6 text-[14px] font-semibold transition-[background-color,box-shadow]", NEXT_ON)}
                    >
                      {tt("Try again")}
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

  /** The words over each step, white on the film. The plans carry their own, at the left of their card. */
  const viewHead = (step: number): { title: string; sub: string } | null => {
    switch (step) {
      case 1:
        return { title: tt("Let's get started"), sub: tt("Your name, your Storelib address and a photo.") }
      case 2:
        return { title: tt("What brings you here?"), sub: tt("Pick all that apply.") }
      case 3:
        return { title: tt("Where do people follow you?"), sub: tt("Add the accounts you post on. Each one is optional.") }
      case JOIN_NAME:
        return { title: tt("Create a profile"), sub: tt("Add a name, photo and links to get started.") }
      case JOIN_SOCIAL:
        return { title: tt("Pick a username"), sub: tt("Claim your unique Storelib link.") }
      case JOIN_NOTIFY:
        return { title: tt("Don't miss a thing"), sub: tt("Get notified about replies, messages, updates and things you follow.") }
      default:
        return null
    }
  }

  /** Back and Continue, at the foot of every card. The notifications slide declines with Not now in Back's place. */
  const renderNav = (step: number) => {
    if (step === 5 || step === JOIN_DONE) return null
    const back = backFrom(step)
    const busy = joinSaving || askingPush
    const plan = step === 4
    const ready = canProceed() || busy
    return (
      <div data-onboarding-footer="" className={cn("flex items-center gap-3", plan ? "mt-6 sm:mt-8" : "mt-6 sm:mt-7")}>
        {step === JOIN_NOTIFY ? (
          <button type="button" onClick={handleSkip} disabled={!canSkip()} data-onboarding-not-now="" className={NAV_BACK}>
            {tt("Not now")}
          </button>
        ) : back !== null ? (
          <button
            type="button"
            onClick={() => {
              hapticTap("soft")
              handleBack()
            }}
            disabled={busy || (plan && !!planCheckoutLoading)}
            data-onboarding-back=""
            className={NAV_BACK}
          >
            <ChevronLeft className="-ml-1 h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
            {tt("Back")}
          </button>
        ) : null}
        {plan ? null : (
          <button
            type="button"
            onClick={() => {
              if (ready) hapticTap("light")
              void handleNext()
            }}
            data-onboarding-next=""
            {...(step === JOIN_NOTIFY ? { "data-onboarding-allow-push": "" } : {})}
            disabled={!ready}
            aria-busy={busy || undefined}
            className={cn(NAV_NEXT, ready ? NEXT_ON : NAV_NEXT_OFF)}
          >
            {busy ? <ActivitySpinner size={20} className="mx-auto text-white" /> : step === JOIN_NOTIFY ? tt("Turn on notifications") : tt("Continue")}
          </button>
        )}
      </div>
    )
  }

  /**
   * ONE STEP AS IT IS SEEN: its words on the film, then its card with Back
   * and Continue at the foot. The plans are one wide card (the cards whole,
   * heading at the left, Monthly and Yearly at the right); setting up and
   * "You're all set" are one small card in the middle.
   */
  const renderView = (step: number) => {
    if (step === 4) {
      return (
        <div data-onboarding-view="plans" className="mx-auto w-full max-w-[1056px]">
          {renderStep(step)}
        </div>
      )
    }
    if (step === 5 || step === JOIN_DONE) {
      return (
        <section data-onboarding-view="moment" className={cn(FLOAT_CARD, "mx-auto w-full max-w-[460px] px-6 py-8")}>
          {renderStep(step)}
        </section>
      )
    }
    const head = viewHead(step)
    return (
      <div data-onboarding-view={step} className="mx-auto w-full max-w-[600px]">
        {head ? (
          <header className="mb-6 text-center sm:mb-8">
            <h1 className={VIEW_TITLE}>{head.title}</h1>
            <p className={VIEW_SUB}>{head.sub}</p>
          </header>
        ) : null}
        <section className={cn(FLOAT_CARD, "p-4 sm:p-7")}>
          {renderStep(step)}
          {renderNav(step)}
        </section>
      </div>
    )
  }

  return (
    <>
      <style>{`@keyframes onboard-line{0%{translate:-120% 0}100%{translate:280% 0}}`}</style>
      {joinNote ? (
        <div className="pointer-events-none fixed inset-x-0 z-[200] flex justify-center px-4" style={{ top: "max(16px, env(safe-area-inset-top))" }} role="status">
          <p className="rounded-full bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(17,24,39,0.45)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-300">{joinNote}</p>
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            /* The whole window at every width: the film fills it and the steps sit on it. */
            "fixed inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none sm:max-w-none translate-x-0 translate-y-0 gap-0 overflow-clip rounded-none border-0 bg-transparent p-0 shadow-none",
            "[&>button]:hidden outline-none focus:outline-none focus-visible:outline-none",
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          overlayClassName={ONBOARDING_GROUND}
        >
          <OnboardingBackdrop />
          <div data-onboarding-card="" data-own-look="" data-native={nativeFullScreen || undefined} className="absolute inset-0 flex flex-col font-sans">
            {/*
              THE TOP ROW. Storelib at the left, the progress in the middle of
              the window whatever is beside it (1fr auto 1fr), and the way out
              at the right. No Skip anywhere: Back and Continue are on the card.
            */}
            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
              <div className="flex min-w-0 items-center justify-start">
                <StorelibLogo size={36} alt="Storelib" className="block h-8 w-8 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)] sm:h-9 sm:w-9" />
              </div>
              <div
                data-onboarding-progress=""
                role="progressbar"
                aria-label={tt("Setup progress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressWidth)}
                className="h-[5px] w-[132px] overflow-hidden rounded-full bg-white/20 sm:h-[6px] sm:w-[200px]"
              >
                <div
                  data-onboarding-progress-fill=""
                  className="h-full w-full rounded-full bg-white motion-reduce:!transition-none"
                  style={{ translate: `${progressWidth - 100}% 0`, transition: `translate 420ms ${MOTION_EASE}` }}
                />
              </div>
              <div className="flex min-w-0 items-center justify-end">
                {switchBack && currentStep !== 5 ? (
                  <button
                    type="button"
                    onClick={goBackToFirstBusiness}
                    disabled={switchingBack}
                    data-onboarding-switch-back=""
                    aria-label={tt("Back to {name}", { name: switchBack.name })}
                    className="inline-flex h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-white/75 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:opacity-60 sm:px-4"
                  >
                    {switchingBack ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ArrowLeft className="h-4 w-4 shrink-0" />}
                    <span className="hidden truncate sm:inline">{switchBack.name}</span>
                  </button>
                ) : null}
              </div>
            </div>
            {switchBackError && (
              <p role="alert" className="shrink-0 px-4 pt-1 text-center text-[13px] text-red-300 sm:px-8">{switchBackError}</p>
            )}

            {/*
              ONE SCROLL, THE PAGE'S OWN. The step is centred when it fits and
              the page scrolls when it does not (a short laptop, a zoomed
              window, a phone with the keyboard up), so a card is never cut
              off and nothing fades over its foot. The leaving step and the
              arriving one share one grid cell while they crossfade (200ms or
              so, opacity and translate only), so nothing under them jumps.
            */}
            <div
              ref={stepScrollRef}
              onScroll={updateScrollEdges}
              data-onboarding-scroller=""
              style={{ maskImage: TOP_EDGE_MASK, WebkitMaskImage: TOP_EDGE_MASK }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
            >
              <div className="flex min-h-full flex-col items-center px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[clamp(12px,4.5svh,40px)] sm:px-6 sm:pb-12 sm:pt-[clamp(24px,9svh,112px)]">
                <div data-onboarding-steps="" className="relative w-full min-w-0 [&>*]:[backface-visibility:hidden] [&>*]:[transform:translateZ(0)]">
                  {leavingStep && (
                    <div
                      key={leavingStep.step}
                      ref={stepLeaveRef}
                      data-onboarding-leaving={leavingStep.step}
                      aria-hidden="true"
                      inert
                      className="pointer-events-none absolute inset-x-0 top-0"
                      style={{ marginTop: -leavingStep.offset }}
                    >
                      {renderView(leavingStep.step)}
                    </div>
                  )}
                  <div key={currentStep} ref={stepEnterRef} data-onboarding-step={currentStep} className="relative">
                    {renderView(currentStep)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {photoSheet ? (
            <div className="absolute inset-0 z-30 flex items-end" data-onboarding-photo-sheet="">
              <button
                type="button"
                aria-label={tt("Close")}
                className="absolute inset-0 bg-black/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                onClick={() => setPhotoSheet(false)}
              />
              <div className="relative z-10 w-full rounded-t-[20px] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_-12px_rgba(17,24,39,0.28)] motion-safe:animate-in motion-safe:slide-in-from-bottom-6 motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]">
                <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-300" />
                <p className="px-1 pb-3 text-[15px] font-semibold text-[#1a1a2e]">{tt("Photo Library")}</p>
                <button
                  type="button"
                  onClick={chooseJoinLibrary}
                  data-onboarding-photo-library=""
                  className={cn(secondaryDepth, "mb-1 h-12 w-full rounded-xl px-4 text-[15px]")}
                >
                  <ImagePlus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {tt("Photo Library")}
                </button>
              </div>
            </div>
          ) : null}
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
            <h2 className="text-lg font-semibold flex-1 text-center pr-8">{tt("Crop Image")}</h2>
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
                    alt={tt("Preview")}
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
                  {tt("Drag to move, drag bottom-right corner to resize")}
                </p>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null); setCropBox({ x: 50, y: 50, size: 200 }) }}
                    className="flex-1 py-3 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {tt("Cancel")}
                  </button>
                  <button
                    onClick={handleCropComplete}
                    disabled={uploadingAvatar}
                    className="flex-1 py-3 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploadingAvatar ? <><Loader2 className="h-4 w-4 animate-spin" />{tt("Saving...")}</> : tt("Save")}
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
      <input
        ref={joinPhotoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        tabIndex={-1}
        data-onboarding-join-photo-input=""
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          onJoinPhotoFile(file)
        }}
      />
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
              <p className="text-[15px] font-medium leading-[22px] text-[#1a1a2e]">{tt("Opening your dashboard")}</p>
              {redirectFailed && (
                <div className="mt-4 animate-in fade-in duration-200 motion-reduce:animate-none">
                  <p className="text-[14px] leading-5 text-[#6b7280]">{tt("This is taking longer than usual.")}</p>
                  <button
                    onClick={startDashboardRedirect}
                    className={cn("mt-3 inline-flex h-11 items-center justify-center rounded-xl px-5 text-[14px] font-semibold transition-[background-color,box-shadow]", NEXT_ON)}
                  >
                    {tt("Go to dashboard")}
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
