"use client"

import { useOnePage, OnePageProvider } from "@/lib/onepage/context"
import { bottomAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"
import { PhonePreview, MobilePreviewContent } from "./phone-preview"
import { DesignTab } from "./tabs/design-tab"
import { LinksTab } from "./tabs/links-tab"
import { ProductsTab } from "./tabs/products-tab"
import { SettingsTab, type SettingsTabRef } from "./tabs/settings-tab"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ExternalLink,
  Copy,
  Loader2,
  Check,
  Palette,
  Link2,
  ShoppingBag,
  Undo2,
  Redo2,
  Save,
  Eye,
  Edit3,
  Globe,
  Zap,
  AlertCircle,
  ArrowLeft,
  Share,
} from "lucide-react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { BuilderLoader, useLinger } from "@/components/website-builder/builder-loader"
import { LEAVING_SEEN_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { isPlainClick } from "@/lib/ui/app-navigation"
import { setLeaveGuard } from "@/lib/ui/leave-guard"
import { HtmlClass } from "@/components/platform/html-class"
import { iconDepth, primaryDepth } from "@/components/ui/depth-button"
import type { OnePage } from "@/lib/onepage/types"
import { getLinksShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { creatorPageHostFrom } from "@/lib/custom-domains/client"
import { openExternal } from "@/lib/native-bridge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OnboardingModal } from "./onboarding-modal"
import { createClient } from "@/lib/supabase/client"
import { SaveNotification } from "@/components/ui/save-notification"
import { BottomSheet } from "@/components/ui/bottom-sheet"

// Settings Filter Icon SVG Component
const SettingsFilterIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 512 512" className={className} fill="currentColor">
    <path d="M0 416c0 17.7 14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384c-17.7 0-32 14.3-32 32zm128 0a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM320 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm32-80c-32.8 0-61 19.7-73.3 48L32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48zM192 128a32 32 0 1 1 0-64 32 32 0 1 1 0 64zm73.3-64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48L32 64C14.3 64 0 78.3 0 96s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 128c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 64z" />
  </svg>
)

interface OnePageEditorProps {
  initialOnePage: OnePage
}

export function OnePageEditor({ initialOnePage }: OnePageEditorProps) {
  return (
    <OnePageProvider initialOnePage={initialOnePage}>
      <EditorLayout />
    </OnePageProvider>
  )
}

type TabType = "design" | "links" | "products" | "settings"

/** Leaving was answered but the editor is still here this long after: it holds Back again. */
const LEAVE_REVIVE_MS = 12_000

/*
  THE EDITOR'S TWO QUESTIONS, ON THE APP'S OWN SHEET ON A PHONE.

  Both used to be a centred dialog pushed to the bottom by hand, with the drag
  written into React state on every touchmove (a re-render per finger event)
  and a close that simply unmounted, so a tap on a button made the sheet
  vanish rather than slide away. Under 768px they are now the shared
  BottomSheet (components/ui/bottom-sheet.tsx): dragged on the compositor,
  let go with the finger's real speed, and closed with the same slide down
  every other sheet in /app has. From 768px they stay a centred dialog.
*/
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const check = () => setIsPhone(mq.matches)
    check()
    mq.addEventListener("change", check)
    return () => mq.removeEventListener("change", check)
  }, [])
  return isPhone
}

function EditorQuestion({
  open,
  onClose,
  label,
  desktopWidth,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  desktopWidth: string
  children: React.ReactNode
}) {
  const isPhone = useIsPhone()
  if (isPhone) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} label={label} hideFrom="md">
        <div className="pb-[max(env(safe-area-inset-bottom),12px)]">{children}</div>
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={cn("p-0 gap-0 overflow-hidden w-[calc(100%-32px)] max-w-sm rounded-2xl mx-auto", desktopWidth)}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function UnsavedChangesDialog({
  open,
  onClose,
  onSave,
  onDiscard,
  isSaving
}: {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDiscard: () => void
  isSaving: boolean
}) {
  return (
    <EditorQuestion open={open} onClose={onClose} label="Save changes?" desktopWidth="md:max-w-[340px]">
      <div className="px-6 pt-5 pb-5 text-center md:pt-6">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e] mb-1.5">Save changes?</h2>
        <p className="text-sm text-[#6b7280]">
          Once saved, they'll appear on your OnePage.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-2.5 md:px-6 md:pb-6">
        <button
          onClick={onSave}
          disabled={isSaving}
          data-unsaved-save=""
          className="w-full h-12 px-4 bg-[#1a1a2e] text-white font-medium rounded-xl hover:bg-[#2a2a40] active:bg-[#0f0f1c] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.25)]"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            'Save changes'
          )}
        </button>

        <button
          onClick={onDiscard}
          disabled={isSaving}
          data-unsaved-discard=""
          className="w-full h-12 px-4 bg-white text-[#c4290c] font-medium rounded-xl border border-[#e5e7eb] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
        >
          Discard changes
        </button>

        <button
          onClick={onClose}
          disabled={isSaving}
          className="w-full h-11 px-4 text-[#6b7280] font-medium rounded-xl hover:bg-[#f3f4f6] hover:text-[#1a1a2e] transition-colors disabled:opacity-50"
        >
          Keep editing
        </button>
      </div>
    </EditorQuestion>
  )
}

function ProUpgradeDialog({
  open,
  onClose,
  onUpgrade,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean
  onClose: () => void
  onUpgrade: () => void
  onDiscard: () => void
  onKeepEditing: () => void
}) {
  return (
    <EditorQuestion open={open} onClose={onClose} label="Upgrade to Pro?" desktopWidth="md:max-w-[420px]">
      <div className="px-6 pt-5 pb-5 text-center md:pt-6">
        <h2 className="text-[17px] font-semibold text-[#1a1a2e] mb-1.5">Upgrade to Pro?</h2>
        <p className="text-sm text-[#6b7280] leading-relaxed">
          The verified badge and hiding Storelib branding are part of Pro. Upgrade to save these changes.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-2.5 md:px-6 md:pb-6">
        <button
          onClick={onUpgrade}
          className={cn(primaryDepth, "w-full h-12 px-5 rounded-xl gap-2")}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Upgrade to Pro
        </button>

        <button
          onClick={onDiscard}
          className="w-full h-12 px-4 bg-white text-[#374151] font-medium rounded-xl border border-[#e5e7eb] hover:bg-[#fafafa] transition-colors"
        >
          Discard changes
        </button>

        <button
          onClick={onKeepEditing}
          className="w-full h-11 px-4 text-[#6b7280] font-medium rounded-xl hover:bg-[#f3f4f6] hover:text-[#1a1a2e] transition-colors"
        >
          Keep editing
        </button>
      </div>
    </EditorQuestion>
  )
}

/** What the share sheet shows: the page as a card, its address to copy, and the ways out. */
function ShareOnePage({
  open,
  onClose,
  onepage,
  pageUrl,
  copied,
  onCopy,
  onOpen,
  connectedDomain,
  userPlan,
}: {
  open: boolean
  onClose: () => void
  onepage: OnePage
  pageUrl: string
  copied: boolean
  onCopy: () => void
  onOpen: () => void
  connectedDomain: string | null
  userPlan: "free" | "growth" | "pro" | null
}) {
  const isPhone = useIsPhone()
  const theme = onepage.theme
  /* The card wears the page's own wallpaper; a white one gets a light grey so it reads as a card. */
  const bg = theme.background_type === "gradient" && theme.background_gradient
    ? theme.background_gradient
    : (() => {
        const c = (theme.background_color || "#1f2937").toLowerCase()
        return ["#ffffff", "#fff", "white", "#fafafa", "#f9fafb", "#f5f5f5"].includes(c) ? "#f3f4f6" : c
      })()
  const hasPro = userPlan === "growth" || userPlan === "pro"
  const address = pageUrl.replace(/^https?:\/\//, "")
  const row = "flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 text-left text-[14px] font-medium text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"

  const body = (
    <div className="space-y-3" data-share-onepage="">
      <div className="rounded-2xl p-5 text-center" style={{ background: bg }}>
        {onepage.avatar_video_url ? (
          <video
            src={onepage.avatar_video_url}
            poster={onepage.avatar_url || undefined}
            className="mx-auto mb-2 h-14 w-14 rounded-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : onepage.avatar_url ? (
          <img
            src={onepage.avatar_url}
            alt={onepage.title}
            className="mx-auto mb-2 h-14 w-14 rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        ) : (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.text_color}20` }}>
            <span className="text-xl font-semibold" style={{ color: theme.text_color }}>{onepage.title?.charAt(0)?.toUpperCase() || "?"}</span>
          </div>
        )}
        <h3 className="text-[15px] font-semibold" style={{ color: theme.text_color }}>{onepage.title || "Your name"}</h3>
        <p className="mt-0.5 text-[12.5px]" style={{ color: `${theme.text_color}99` }}>/{onepage.slug}</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f7f7f8] py-1.5 pl-4 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{address}</span>
        <button type="button" onClick={onCopy} data-share-copy="" className={cn(primaryDepth, "h-9 gap-1.5 rounded-lg px-3.5 text-[13px]")}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <button type="button" onClick={onOpen} className={row}>
        <ExternalLink className="h-4 w-4 shrink-0 text-[#6b7280]" />
        Open in a new tab
      </button>

      {!connectedDomain && (
        <button type="button" onClick={() => { window.location.href = "/app/settings?tab=domains" }} className={cn(row, "justify-between")}>
          <span className="flex items-center gap-3">
            <Globe className="h-4 w-4 shrink-0 text-[#6b7280]" />
            Add a custom domain
          </span>
          <span title={hasPro ? "Included in your plan" : "Custom domains are part of Pro"} className="rounded-full bg-[#f1f2f4] px-2 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">
            {hasPro ? "Included" : "Pro"}
          </span>
        </button>
      )}
    </div>
  )

  if (isPhone) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} title="Share your OnePage" hideFrom="md">
        <div className="px-4 pb-3 pt-3">{body}</div>
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent overlayClassName="backdrop-blur-[3px]" className="w-[calc(100%-32px)] max-w-[420px] gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-[#eef0f2] px-5 py-4">
          <DialogTitle className="text-center text-[17px] font-semibold text-[#1a1a2e]">Share your OnePage</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-5">{body}</div>
      </DialogContent>
    </Dialog>
  )
}

function EditorLayout() {
  const {
    onepage,
    saveState,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    save,
    saveError,
    updateSettings,
  } = useOnePage()

  /*
    THE WAY OUT, THE SAME AS THE CREATOR PAGE AND THE WEBSITE BUILDER. The
    dark glass with "Going back" goes up, stays long enough to be read, and
    then /app is pushed, with a ceiling so a slow route cannot hang it (see
    components/app/creator-page-workspace.tsx, which this copies on purpose).
    `leavingRef` also stands the beforeunload prompt down: a creator who
    already chose Save or Discard has answered it.
  */
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  /* Puts the Back hold on or takes it off for what the page holds now (set below, by the hold itself). */
  const refreshLeaveGuard = useRef<() => void>(() => {})
  const cancelCeiling = useRef<(() => void) | null>(null)
  const leave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaveGuard(null)
    setLeaving(true)
    cancelCeiling.current?.()
    const start = window.setTimeout(() => {
      cancelCeiling.current = navigateWithCeiling(
        () => router.push("/app"),
        () => window.location.assign("/app"),
        (cb, ms) => window.setTimeout(cb, ms),
        (id) => window.clearTimeout(id),
      )
    }, LEAVING_SEEN_MS)
    cancelCeiling.current = () => window.clearTimeout(start)
  }, [router])
  useEffect(() => {
    if (!leaving) return
    const revive = () => {
      leavingRef.current = false
      setLeaving(false)
      refreshLeaveGuard.current()
    }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) revive() }
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("popstate", revive)
    const watchdog = window.setTimeout(revive, 6000)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("popstate", revive)
      window.clearTimeout(watchdog)
      cancelCeiling.current?.()
    }
  }, [leaving])
  useEffect(() => {
    try {
      router.prefetch("/app")
    } catch {
      /* A router that will not prefetch still navigates. */
    }
  }, [router])

  /* The way in: the light loader over the editor for a beat, then it fades off what arrived. */
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const loaderVisible = useLinger(!arrived, 320)

  // --- Hash-based tab navigation ---
  const HASH_TO_TAB: Record<string, TabType> = {
    links: "links",
    design: "design",
    products: "products",
    settings: "settings",
  }
  const getInitialTab = (): TabType => {
    if (typeof window === "undefined") return "links"
    const hash = window.location.hash.replace("#", "")
    return (HASH_TO_TAB[hash] as TabType) || "links"
  }
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab)

  const handleTabChange = useCallback((tab: TabType) => {
    /*
      LEAVING SETTINGS TAKES WHAT WAS TYPED THERE ALONG. The page name, the
      address and the SEO text are held by the Settings tab until a Save, and
      the tab is unmounted when another one is chosen, so a title typed there
      and then saved from the Links tab was simply gone while the header said
      "Changes saved". Handing the typed fields to the page first means the
      next Save sends them. Only fields that were actually typed in are
      handed over, so passing through the tab changes nothing.
    */
    if (tab !== "settings") {
      settingsTabRef.current?.saveAllSettings().catch(() => {})
    }
    setActiveTab(tab)
    /*
      THE TAB IS IN THE ADDRESS, NOT IN THE HISTORY. Each tab used to push an
      entry of its own, `pushState(null, "", "#settings")`: Back walked back
      through every tab before it left the editor, and the null state went
      through the router's own history patch, which filled it in from
      whatever the entry before it held and started a navigation of its own
      to the new address on every click. Now the tab replaces the address of
      the entry the editor is on, with that entry's own state, which carries
      the router's marker, so the router lets it through and does nothing:
      one entry for the editor, whatever tab it is on, and a reload keeps the
      tab.
    */
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `#${tab}`)
      refreshLeaveGuard.current()
    }
  }, [])

  // Sync tab when browser back/forward changes the hash
  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.replace("#", "")
      const tab = (HASH_TO_TAB[hash] as TabType) || "links"
      setActiveTab(tab)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [copied, setCopied] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isSavingForNav, setIsSavingForNav] = useState(false)
  const [showProUpgradeDialog, setShowProUpgradeDialog] = useState(false)
  const [saveToastSequence, setSaveToastSequence] = useState(0)
  const [historyToastSequence, setHistoryToastSequence] = useState(0)
  const [historyToastMessage, setHistoryToastMessage] = useState("Updated")
  const [saveFailure, setSaveFailure] = useState<{ message: string; sequence: number }>({ message: "", sequence: 0 })
  const showSaveFailure = useCallback((message: string) => {
    setSaveFailure((prev) => ({ message, sequence: prev.sequence + 1 }))
  }, [])

  /*
    EVERY FAILED SAVE IS SAID OUT LOUD, WHOEVER ASKED FOR IT. The header's
    Save, a Save button inside Settings and the onboarding's closing save all
    go through the same save(), and it reports a failure through saveError.
    Watching that here puts one toast on screen for all of them, instead of
    each caller having to remember to.
  */
  useEffect(() => {
    if (saveError) showSaveFailure(saveError.message)
  }, [saveError, showSaveFailure])

  // =====================================================
  // ONBOARDING STATE - Fetch directly from database
  // This ensures it works across ALL devices for the same account
  // =====================================================
  
  const [showOnboarding, setShowOnboarding] = useState(false) // Start with false, check DB
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)
  const [userPlan, setUserPlan] = useState<"free" | "growth" | "pro" | null>(null)

  // Fetch custom domain and user plan on mount
  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        /* The OnePage is at /links on the creator page's domain. */
        const host = creatorPageHostFrom(data)
        if (host) setConnectedDomain(host)
      })
      .catch(() => {})

    fetch("/api/billing/subscription")
      .then((res) => res.json())
      .then((data) => {
        // API returns { subscription: { plan_id }, currentPlan: { id } }
        const plan = (data.subscription?.plan_id || data.currentPlan?.id) as "free" | "growth" | "pro" | undefined
        setUserPlan(plan || "free")
      })
      .catch(() => setUserPlan("free"))
  }, [])

  const [onboardingChecked, setOnboardingChecked] = useState(false) // Track if we've checked
  const completedThisSessionRef = useRef(false)
  const settingsTabRef = useRef<SettingsTabRef>(null)
  
  // Check onboarding status directly from database on mount
  useEffect(() => {
    if (!onepage?.id || onboardingChecked || completedThisSessionRef.current) return
    
    const checkOnboardingStatus = async () => {
      const supabase = createClient()
      
      console.log("[OnePageEditor] Checking onboarding status from database...")
      console.log("[OnePageEditor] onepage.id:", onepage.id)
      
      // Fetch fresh onboarding_completed status directly from database
      const { data, error } = await supabase
        .from("onepages")
        .select("onboarding_completed")
        .eq("id", onepage.id)
        .single()
      
      if (error) {
        console.error("[OnePageEditor] Error fetching onboarding status:", error)
        // On error, check localStorage as fallback
        if (typeof window !== "undefined") {
          const localDone = localStorage.getItem(`onepage_onboarding_done_${onepage.id}`)
          if (localDone === "true") {
            console.log("[OnePageEditor] localStorage says completed")
            setShowOnboarding(false)
          } else {
            console.log("[OnePageEditor] No completion found, showing onboarding")
            setShowOnboarding(true)
          }
        }
      } else {
        console.log("[OnePageEditor] Database onboarding_completed:", data?.onboarding_completed)
        
        if (data?.onboarding_completed === true) {
          // Completed in database - don't show onboarding
          setShowOnboarding(false)
          // Sync localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
          }
        } else {
          // Not completed in database - check localStorage as backup
          if (typeof window !== "undefined") {
            const localDone = localStorage.getItem(`onepage_onboarding_done_${onepage.id}`)
            if (localDone === "true") {
              console.log("[OnePageEditor] localStorage override - not showing onboarding")
              setShowOnboarding(false)
            } else {
              console.log("[OnePageEditor] Not completed - showing onboarding")
              setShowOnboarding(true)
            }
          } else {
            setShowOnboarding(true)
          }
        }
      }
      
      setOnboardingChecked(true)
    }
    
    checkOnboardingStatus()
  }, [onepage?.id, onboardingChecked])

  // Check if user has Pro features enabled that require Pro plan
  const hasProFeaturesEnabled = useCallback(() => {
    if (!onepage) return false
    // Hide branding is a Pro feature - check if show_branding is false (meaning branding is hidden)
    // Verified badge is also a Pro feature
    return onepage.settings.show_branding === false || (onepage.settings as any).verified_badge_enabled === true
  }, [onepage])

  // Handle save with Pro plan check
  const handleSaveWithProCheck = useCallback(async () => {
    const userHasPro = userPlan === "growth" || userPlan === "pro"

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowProUpgradeDialog(true)
      return
    }

    // If on the settings tab, hand what was typed there to the page first, so
    // the save below sends it (basic info, SEO, subscribe, share, verified badge)
    if (activeTab === "settings") {
      try {
        await settingsTabRef.current?.saveAllSettings()
      } catch (error) {
        console.error("Settings could not be prepared for saving:", error)
        showSaveFailure("Couldn't save. Try again")
        return
      }
    }

    /*
      "CHANGES SAVED" ONLY WHEN THEY WERE. This used to toast success after
      any save at all, including one that failed and one that never ran
      because another was in flight. save() now answers, and a failure has
      already put its own toast up through saveError.
    */
    const result = await save()
    if (result.ok) setSaveToastSequence((prev) => prev + 1)
  }, [hasProFeaturesEnabled, save, activeTab, userPlan, showSaveFailure])

  // Handle upgrading to Pro — auto-saves non-pro changes, then sends user to pricing page
  const handleUpgradeToPro = useCallback(async () => {
    setShowProUpgradeDialog(false)
    // Auto-save current changes (non-pro changes will be persisted)
    // This prevents the user from losing work when they navigate away.
    // If the save failed, stay: leaving now would throw the work away, and the
    // failure is already on screen.
    const result = await save()
    if (!result.ok) return
    const returnTo = encodeURIComponent(window.location.pathname)
    window.location.href = `/pricing?source=upgrade&returnTo=${returnTo}`
  }, [save])

  // Handle discarding Pro changes
  const handleDiscardProChanges = useCallback(() => {
    // Reset Pro-only settings to defaults
    updateSettings({
      show_branding: true, // Re-enable branding
      hide_branding_pro_enabled: false,
      verified_badge_enabled: false, // Disable verified badge
    } as any)
    setShowProUpgradeDialog(false)
  }, [updateSettings])

  // Handle keep editing
  const handleKeepEditing = useCallback(() => {
    setShowProUpgradeDialog(false)
  }, [])

  const isDirtyRef = useRef(isDirty)
  
  // Keep isDirtyRef in sync with isDirty
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // Handle browser back/forward and page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !leavingRef.current) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty])
  
  /*
    BACK ASKS ONLY WHEN THERE IS SOMETHING TO LOSE, AND NEEDS NO ENTRY OF ITS
    OWN. The editor used to push an entry on arrival so that Back had
    something to pop: every visit then took an extra Back to leave (two, and
    one more per tab), "Discard" went back by counting entries, and on a
    first load the entry was pushed before the router had patched the
    history, so it carried none of the router's state. Now Back is held only
    while there is unsaved work, through the one listener that runs before
    the router's (lib/ui/leave-guard.ts), and the dialog asks. With nothing
    unsaved, Back is the browser's own and leaves in one press.
  */
  const leaveTimer = useRef(0)
  const armLeaveGuard = useCallback(() => {
    if (!isDirtyRef.current || leavingRef.current) {
      setLeaveGuard(null)
      return
    }
    setLeaveGuard({
      url: window.location.href,
      state: window.history.state,
      onHeld: () => {
        setPendingNavigation("back")
        setShowUnsavedDialog(true)
      },
    })
  }, [])
  refreshLeaveGuard.current = armLeaveGuard
  useEffect(() => {
    armLeaveGuard()
  }, [isDirty, armLeaveGuard])
  useEffect(() => () => {
    window.clearTimeout(leaveTimer.current)
    setLeaveGuard(null)
  }, [])

  /*
    A LINK OUT, WITH WORK UNSAVED, ASKS FIRST, AND ONLY THEN DOES ANYTHING
    START. The press is stopped before the link, the rail or the shell sees it,
    so no bar runs and no page is hidden for a navigation that may not
    happen. Only a press that would leave this tab: a new tab or window, a
    download, or a place on this same page leaves nothing behind.
  */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current || leavingRef.current || !isPlainClick(e)) return
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setPendingNavigation(url.href)
      setShowUnsavedDialog(true)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  /*
    ANSWERED: GO WHERE THE PRESS WAS GOING. A link out is followed the way the
    rail follows it, by the router, with the shell told on the same press
    (the row lights, the bar and the spinner answer a slow page). It used to
    be a whole document load, whose stale "unsaved changes" handler then
    asked the browser's own question on top of this one. A held Back goes
    back one entry, from the one the hold put back to the one Back was going
    to. If nothing has taken the editor away in LEAVE_REVIVE_MS, it holds
    Back again: the work is still here.
  */
  const leaveTo = useCallback((target: string) => {
    leavingRef.current = true
    setLeaveGuard(null)
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => {
      leavingRef.current = false
      refreshLeaveGuard.current()
    }, LEAVE_REVIVE_MS)
    if (target === "back") {
      window.history.back()
      return
    }
    let url: URL
    try {
      url = new URL(target, window.location.href)
    } catch {
      return
    }
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href)
      return
    }
    const href = url.pathname + url.search + url.hash
    startNavigationLoading(href)
    router.push(href)
  }, [router])

  const handleSaveAndNavigate = useCallback(async () => {
    const userHasPro = userPlan === "growth" || userPlan === "pro"

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowUnsavedDialog(false)
      setShowProUpgradeDialog(true)
      return
    }

    /*
      Leave only once the save has worked. A failed save used to be followed
      by the navigation anyway, which is the one moment unsaved work cannot
      be got back; now the dialog stays, with Discard still in it, and the
      failure is on screen.
    */
    setIsSavingForNav(true)
    try {
      if (activeTab === "settings") {
        await settingsTabRef.current?.saveAllSettings()
      }
      const result = await save()
      if (!result.ok) return
    } catch (error) {
      console.error("Save before leaving failed:", error)
      showSaveFailure("Couldn't save. Try again")
      return
    } finally {
      setIsSavingForNav(false)
    }
    setShowUnsavedDialog(false)
    /* "/app" is the phone's way out (handleExit), through the glass; "back" a held Back; anything else a link's address. */
    if (pendingNavigation === "/app") {
      leave()
    } else if (pendingNavigation) {
      leaveTo(pendingNavigation)
    }
    setPendingNavigation(null)
  }, [save, pendingNavigation, hasProFeaturesEnabled, activeTab, userPlan, showSaveFailure, leave, leaveTo])

  const handleDiscardAndNavigate = useCallback(() => {
    setShowUnsavedDialog(false)
    if (pendingNavigation === "/app") {
      leave()
    } else if (pendingNavigation) {
      leaveTo(pendingNavigation)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, leave, leaveTo])

  // Handle onboarding completion
  // Note: The onboarding modal already saves everything to the database and calls save()
  // This handler just updates local state and closes the modal
  const handleOnboardingComplete = useCallback(async () => {
    console.log("[OnePageEditor] Onboarding completed - modal already saved, updating local state...")

    // Mark completed in localStorage immediately as backup
    if (onepage?.id && typeof window !== "undefined") {
      localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
      localStorage.removeItem("onepage_onboarding_progress")
    }

    completedThisSessionRef.current = true
    setShowOnboarding(false)

    // The onboarding modal already:
    // 1. Saved onboarding_completed to database
    // 2. Called save() to persist all editor changes
    // So we don't need to do it again here
    console.log("[OnePageEditor] Onboarding completion handled - auto-save already done by modal")
  }, [onepage?.id])

  if (!onepage) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Always the external, shareable address: storelib.com/{handle}/links
  const pageUrl = connectedDomain ? getLinksUrlWithCustomDomain(onepage.slug, connectedDomain) : getLinksShareUrl(onepage.slug)

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const viewLive = () => {
    openExternal(pageUrl)
  }

  const tabs = [
    { id: "links" as const, label: "Links", icon: Link2 },
    { id: "design" as const, label: "Design", icon: Palette },
    { id: "products" as const, label: "Products", icon: ShoppingBag },
  ]

  // Determine save button state
  const getSaveButtonContent = () => {
    if (saveState === "saving") {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="hidden sm:inline ml-2">Saving...</span>
        </>
      )
    }
    if (saveState === "saved" && !isDirty) {
      return (
        <>
          <Check className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">Saved</span>
        </>
      )
    }
    /* The last save failed and nothing has been typed since: the button says
       so, and pressing it is the retry. The next edit or save clears it. */
    if (saveState === "error" && isDirty) {
      return (
        <>
          <AlertCircle className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">Try again</span>
        </>
      )
    }
    // Show lightning bolt when the user has pro features active but no paid plan
    const userHasPro = userPlan === "growth" || userPlan === "pro"
    const showZap = hasProFeaturesEnabled() && !userHasPro
    return (
      <>
        {showZap ? <Zap className="h-4 w-4" strokeWidth={2.5} /> : <Save className="h-4 w-4" />}
        <span className="hidden sm:inline ml-2">Save</span>
      </>
    )
  }

  const isSaveDisabled = saveState === "saving" || (saveState === "saved" && !isDirty) || !isDirty

  /* Back to Storelib, asking first when there is work that is not saved. */
  const handleExit = () => {
    if (isDirty) {
      setPendingNavigation("/app")
      setShowUnsavedDialog(true)
      return
    }
    leave()
  }

  const handleUndoClick = () => {
    undo()
    setHistoryToastMessage("Undone")
    setHistoryToastSequence((v) => v + 1)
  }

  const handleRedoClick = () => {
    redo()
    setHistoryToastMessage("Redone")
    setHistoryToastSequence((v) => v + 1)
  }

  return (
    <div
      className="flex flex-col bg-gray-50/50 fixed left-0 right-0 top-0 md:left-[240px] md:top-[58px]"
      /* The bottom edge is the keyboard's top when one is up, and the
         screen's bottom when none is: see bottomAboveKeyboard. */
      style={{ zIndex: 30, ...bottomAboveKeyboard() }}
      data-onepage-editor=""
    >
      {/*
        FULL SCREEN ON A PHONE. The editor used to start under the app's black
        header, 68px down, with a black band under the clock above it. Now it
        starts at the top of the screen and its own white bar pads itself into
        the safe area. `with-op-editor` tells app/globals.css to stop painting
        the black header and the native shield under 768px, where this bar
        replaces them. From 768px nothing changes: header, rail, editor beside.
        Hidden rather than covered, so the editor keeps z 30 and every dialog
        and sheet it opens (z 50) still sits over it.
      */}
      <HtmlClass name="with-op-editor" />
      <SaveNotification
        key={saveToastSequence}
        show={saveToastSequence > 0}
        message="Changes saved"
        duration={4000}
      />
      <SaveNotification
        key={`history-${historyToastSequence}`}
        show={historyToastSequence > 0}
        message={historyToastMessage}
        duration={2200}
      />
      <SaveNotification
        key={`save-failed-${saveFailure.sequence}`}
        show={saveFailure.sequence > 0}
        message={saveFailure.message}
        duration={5000}
        icon={<AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" strokeWidth={2.5} />}
      />
      {/* Header - ALWAYS visible with solid background */}
      <header className="box-content flex items-center border-b bg-white h-[56px] sm:h-[60px] pt-[env(safe-area-inset-top)] md:pt-0 shrink-0 relative z-30 overflow-hidden">
        {/* Left controls area - flex-1 matches editor panel below */}
        <div className="flex-1 min-w-0 h-full px-3 sm:px-4 md:px-0">
          <div className="flex items-center gap-2 sm:gap-3 h-full w-full md:max-w-xl md:mx-auto md:px-6">
            {/* The way out on a phone, where the app's header is not drawn. */}
            <button
              type="button"
              onClick={handleExit}
              aria-label="Back to Storelib"
              title="Back to Storelib"
              data-onepage-exit=""
              className="md:hidden -ml-1 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] active:bg-[#eceef1] [-webkit-tap-highlight-color:transparent]"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            {/* Undo/Redo: the icon squares from the rest of /app, a hairline and a soft foot */}
            <div className="flex items-center gap-1.5" data-onepage-history="">
              <button
                type="button"
                className={cn(iconDepth, "h-8 w-8 rounded-[9px] text-[#374151]")}
                onClick={handleUndoClick}
                disabled={!canUndo}
                title="Undo"
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                className={cn(iconDepth, "h-8 w-8 rounded-[9px] text-[#374151]")}
                onClick={handleRedoClick}
                disabled={!canRedo}
                title="Redo"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* Tab Navigation - Desktop - Pill shaped tabs */}
            <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-full p-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    data-tab={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                      activeTab === tab.id
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Settings Button - Desktop */}
            <button
              onClick={() => handleTabChange("settings")}
              title="Settings"
              className={cn(
                "hidden md:flex w-10 h-10 rounded-xl items-center justify-center border transition-all duration-200 cursor-pointer",
                activeTab === "settings"
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-900 hover:border-gray-900 hover:text-white shadow-sm hover:shadow-md"
              )}
            >
              <SettingsFilterIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 pr-3 sm:pr-4 md:w-[410px] md:border-l md:justify-end md:pr-6 md:pl-3">
          {/* Unsaved — mr-auto pushes it to the far left of the panel, away from the divider */}
          {isDirty && saveState !== "saving" && (
            <span className="hidden lg:inline text-xs text-amber-600 font-medium whitespace-nowrap shrink-0 mr-auto">
              Unsaved
            </span>
          )}

          {/* The phone's way to share, in the bar's own icon square: it opens the share sheet. */}
          <button
            type="button"
            className={cn(iconDepth, "md:hidden h-8 w-8 rounded-[9px] text-[#374151]")}
            onClick={() => setShowLinkModal(true)}
            aria-label="Share your OnePage"
            title="Share your OnePage"
            data-onepage-share=""
          >
            <Share className="h-4 w-4" strokeWidth={2} />
          </button>

          {/* Save Button */}
          <Button
            onClick={handleSaveWithProCheck}
            disabled={isSaveDisabled}
            className={cn(
              "h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-all duration-200",
              saveState === "saved" && !isDirty
                ? "bg-[#1a1a2e] hover:bg-[#2a2a40] text-white opacity-60 cursor-default pointer-events-none"
                : saveState === "error" && isDirty
                  ? "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  : isDirty
                  ? "bg-[#1a1a2e] hover:bg-[#2a2a40] text-white cursor-pointer"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
          >
            {getSaveButtonContent()}
          </Button>

          {/* Share your OnePage Button - Desktop */}
          <div className="hidden md:block">
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border text-sm font-medium hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
            >
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Share your OnePage</span>
            </button>
          </div>

          {/* Mobile Preview Toggle - Black button */}
          <Button
            variant={showMobilePreview ? "outline" : "default"}
            size="sm"
            className={cn(
              "md:hidden h-8 px-3 rounded-lg",
              !showMobilePreview && "bg-gray-900 hover:bg-gray-800 text-white"
            )}
            onClick={() => setShowMobilePreview(!showMobilePreview)}
          >
            {showMobilePreview ? (
              <>
                <Edit3 className="h-4 w-4 mr-1.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1.5" />
                Preview
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Editor Panel - Hidden when mobile preview is active */}
        <div
          className={cn(
            "flex-1 bg-white overflow-y-auto",
            showMobilePreview ? "hidden" : "block"
          )}
          data-scroll-container="links-tab"
          style={{ scrollbarWidth: 'thin' }}
        >
  <div
  className={cn(
    "p-4 md:p-6 pb-24 md:pb-6 w-full mx-auto",
    activeTab === "settings" ? "max-w-2xl" : "max-w-xl"
  )}
>
            {activeTab === "design" && <DesignTab userPlan={userPlan} />}
            {activeTab === "links" && <LinksTab />}
            {activeTab === "products" && <ProductsTab onGoToLinks={() => handleTabChange("links")} />}
            {activeTab === "settings" && <SettingsTab ref={settingsTabRef} />}
          </div>
        </div>

        {/* Preview Panel - Desktop with phone mockup */}
        <div
          className="hidden md:block border-l bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 overflow-auto"
          style={{
            width: '410px',
            minWidth: '410px',
            flexShrink: 0,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              minHeight: '100%',
              padding: '20px 53px',
            }}
          >
            <PhonePreview />
          </div>
        </div>

        {/* Mobile Preview - NO phone mockup, just real page content like Linktree */}
        {showMobilePreview && (
          <div className="md:hidden flex-1 flex flex-col overflow-hidden">
            <MobilePreviewContent />
          </div>
        )}
      </div>

      {/* Mobile Bottom Tab Bar - Fixed at bottom, only when NOT in preview */}
      {!showMobilePreview && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20" data-onepage-tabbar="">
          <div className="flex items-center justify-around gap-1 px-2 sm:px-4 py-2 sm:py-3 pb-[max(8px,env(safe-area-inset-bottom))]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-2.5 rounded-[7px] sm:rounded-xl text-xs sm:text-sm font-medium transition-all flex-1 justify-center min-w-0",
                    activeTab === tab.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              )
            })}
            {/* Settings Button - Mobile - same height as other tab buttons */}
            <button
              onClick={() => handleTabChange("settings")}
              className={cn(
                "flex items-center justify-center min-w-[40px] w-10 py-2.5 sm:w-11 sm:py-2.5 rounded-[7px] sm:rounded-xl transition-all shrink-0",
                activeTab === "settings"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600"
              )}
            >
              <SettingsFilterIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/*
        SHARE YOUR ONEPAGE. On a phone it is the app's own sheet
        (components/ui/bottom-sheet): it rises from the bottom, follows the
        thumb and is flicked away like every other sheet in /app. It was a
        centred modal on every width. From 768px it stays a dialog.
      */}
      <ShareOnePage
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onepage={onepage}
        pageUrl={pageUrl}
        copied={copied}
        onCopy={copyLink}
        onOpen={viewLive}
        connectedDomain={connectedDomain}
        userPlan={userPlan}
      />

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onClose={() => { setShowUnsavedDialog(false); setPendingNavigation(null); }}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
        isSaving={isSavingForNav}
      />

      {/* Pro Upgrade Dialog - shown when trying to save with Pro features */}
      <ProUpgradeDialog
        open={showProUpgradeDialog}
        onClose={() => setShowProUpgradeDialog(false)}
        onUpgrade={handleUpgradeToPro}
        onDiscard={handleDiscardProChanges}
        onKeepEditing={handleKeepEditing}
      />

      {/* The way in: the same light loader the creator page shows, faded off the editor once it is drawn. */}
      {loaderVisible && (
        <div
          className="wb-canvas-loader absolute inset-0 z-40 flex items-center justify-center bg-white"
          data-leaving={arrived}
          data-onepage-loader=""
          aria-hidden={arrived}
        >
          <BuilderLoader tone="light" lines={["Loading your page"]} />
        </div>
      )}

      {/* The way out, the same dark glass as the creator page and the website builder. */}
      {leaving && (
        <div className="wb-leaving" role="status" aria-live="polite" aria-label="Going back" data-onepage-leaving="">
          <BuilderLoader className="wb-leaving-content" tone="dark" lines={["Going back", "Almost there"]} />
        </div>
      )}

      {/* Onboarding Modal - shown on first visit only, after database check */}
      {onboardingChecked && !completedThisSessionRef.current && (
        <OnboardingModal
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  )
}
