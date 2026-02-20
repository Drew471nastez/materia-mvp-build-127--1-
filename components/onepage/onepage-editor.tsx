"use client"

import { useOnePage, OnePageProvider } from "@/lib/onepage/context"
import { PhonePreview, MobilePreviewContent } from "./phone-preview"
import { DesignTab } from "./tabs/design-tab"
import { LinksTab } from "./tabs/links-tab"
import { ProductsTab } from "./tabs/products-tab"
import { SettingsTab } from "./tabs/settings-tab"
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
} from "lucide-react"
import { useState, useEffect, useCallback, useRef } from "react"
import type { OnePage } from "@/lib/onepage/types"
import { getLinksUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OnboardingModal } from "./onboarding-modal"
import { createClient } from "@/lib/supabase/client"
import { SaveNotification } from "@/components/ui/save-notification"

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

// Unsaved Changes Dialog Component — mobile bottom sheet, desktop centered modal
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
  const [isMobileSheet, setIsMobileSheet] = useState(false)
  const [isPresented, setIsPresented] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragCurrentY = useRef(0)

  useEffect(() => {
    const check = () => setIsMobileSheet(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (open && isMobileSheet) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsPresented(true))
      })
    } else {
      setIsPresented(false)
      setDragY(0)
    }
  }, [open, isMobileSheet])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    dragCurrentY.current = e.touches[0].clientY
    const delta = Math.max(0, dragCurrentY.current - dragStartY.current)
    setDragY(delta)
  }, [])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    const delta = dragCurrentY.current - dragStartY.current
    const velocity = delta > 0 ? delta / 300 : 0
    if (delta > 80 || velocity > 0.5) {
      setIsPresented(false)
      setTimeout(() => { onClose(); setDragY(0) }, 400)
    } else {
      setDragY(0)
    }
  }, [onClose])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={!isMobileSheet}
        disableDefaultAnimations={isMobileSheet}
        disableOverlayDefaultAnimations={isMobileSheet}
        overlayClassName={isMobileSheet ? cn(
          "bg-black/40 transition-all duration-400",
          isPresented ? "opacity-100 backdrop-blur-[2px]" : "opacity-0 backdrop-blur-0"
        ) : undefined}
        onTouchStart={isMobileSheet ? handleTouchStart : undefined}
        onTouchMove={isMobileSheet ? handleTouchMove : undefined}
        onTouchEnd={isMobileSheet ? handleTouchEnd : undefined}
        className={cn(
          "p-0 gap-0 overflow-hidden",
          isMobileSheet
            ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 !top-auto !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0"
            : "w-[calc(100%-32px)] max-w-sm md:max-w-[340px] rounded-2xl mx-auto"
        )}
        style={isMobileSheet ? {
          position: 'fixed',
          top: 'auto', left: 0, right: 0, bottom: 0,
          transform: isPresented ? `translate3d(0, ${dragY}px, 0)` : 'translate3d(0, 100%, 0)',
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        } : undefined}
      >
        {/* Mobile drag handle */}
        {isMobileSheet && (
          <div className="pt-3 pb-1 flex justify-center">
            <div className="h-1.5 w-10 rounded-full bg-gray-300" />
          </div>
        )}

        <div className="p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">Save changes?</h2>
          <p className="text-sm text-muted-foreground">
            Once saved, they'll appear on your OnePage.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </button>

          <button
            onClick={onDiscard}
            disabled={isSaving}
            className="w-full py-3 px-4 bg-white text-red-600 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Discard changes
          </button>

          <button
            onClick={onClose}
            disabled={isSaving}
            className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Keep editing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Pro Upgrade Dialog Component - shown when trying to save with Pro features without Pro plan
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-32px)] max-w-sm p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
        <div className="p-6 text-center">
          {/* Pro Badge */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Upgrade to Pro?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Some of the customizations you're previewing are exclusive to Storelib Pro. Let's get you upgraded so you can save them!
          </p>
        </div>

        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={onUpgrade}
            className="w-full py-3 px-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-all shadow-md"
          >
            Upgrade To Pro
          </button>

          <button
            onClick={onDiscard}
            className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Discard changes
          </button>

          <button
            onClick={onKeepEditing}
            className="w-full py-3 px-4 bg-white text-gray-500 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Keep editing
          </button>
        </div>
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
    updateSettings,
  } = useOnePage()

  const [activeTab, setActiveTab] = useState<TabType>("links")
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

  // =====================================================
  // ONBOARDING STATE - Fetch directly from database
  // This ensures it works across ALL devices for the same account
  // =====================================================
  
  const [showOnboarding, setShowOnboarding] = useState(false) // Start with false, check DB
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)

  // Fetch custom domain on mount
  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        const active = data.domains?.find((d: any) => d.status === "active")
        if (active) setConnectedDomain(active.domain)
      })
      .catch(() => {})
  }, [])

  const [onboardingChecked, setOnboardingChecked] = useState(false) // Track if we've checked
  const completedThisSessionRef = useRef(false)
  
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
    return onepage.settings.show_branding === false
  }, [onepage])

  // Handle save with Pro plan check
  const handleSaveWithProCheck = useCallback(async () => {
    // TODO: Replace this with actual Pro plan check from user's subscription
    const userHasPro = false // For now, assume user doesn't have Pro

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowProUpgradeDialog(true)
      return
    }

    // No Pro features or user has Pro, proceed with save
    await save()
    setSaveToastSequence((prev) => prev + 1)
  }, [hasProFeaturesEnabled, save])

  // Handle upgrading to Pro
  const handleUpgradeToPro = useCallback(() => {
    setShowProUpgradeDialog(false)
    // Redirect to upgrade page
    window.open('/pricing', '_blank')
  }, [])

  // Handle discarding Pro changes
  const handleDiscardProChanges = useCallback(() => {
    // Reset Pro-only settings to defaults
    updateSettings({
      show_branding: true, // Re-enable branding
      hide_branding_pro_enabled: false,
    })
    setShowProUpgradeDialog(false)
  }, [updateSettings])

  // Handle keep editing
  const handleKeepEditing = useCallback(() => {
    setShowProUpgradeDialog(false)
  }, [])

  // Ref to track if we pushed state for back button interception
  const hasSetupBackInterceptionRef = useRef(false)
  const isDirtyRef = useRef(isDirty)
  
  // Keep isDirtyRef in sync with isDirty
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // Handle browser back/forward and page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
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
  
  // Handle browser back button with popstate
  useEffect(() => {
    // Push a state entry so we can intercept back button
    if (!hasSetupBackInterceptionRef.current) {
      window.history.pushState({ onepageEditor: true }, '', window.location.href)
      hasSetupBackInterceptionRef.current = true
    }
    
    const handlePopState = (e: PopStateEvent) => {
      // Check if user has unsaved changes
      if (isDirtyRef.current) {
        // Push state back to prevent navigation
        window.history.pushState({ onepageEditor: true }, '', window.location.href)
        // Show unsaved changes dialog
        setShowUnsavedDialog(true)
        setPendingNavigation('back')
      }
      // If no unsaved changes, allow normal back navigation
      // The browser will handle it naturally
    }

    window.addEventListener('popstate', handlePopState)
    
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Handle link clicks when dirty - intercept ALL navigation including Next.js client-side routing
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return

      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      if (anchor) {
        const href = anchor.getAttribute('href')
        // Intercept internal navigation links (not external links opened in new tab or hash links)
        if (href && !href.startsWith('#') && !anchor.getAttribute('target')) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          setShowUnsavedDialog(true)
          setPendingNavigation(href.startsWith('http') ? href : href)
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  const handleSaveAndNavigate = useCallback(async () => {
    // TODO: Replace this with actual Pro plan check from user's subscription
    const userHasPro = false

    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowUnsavedDialog(false)
      setShowProUpgradeDialog(true)
      return
    }

    setIsSavingForNav(true)
    await save()
    setIsSavingForNav(false)
    setShowUnsavedDialog(false)
    if (pendingNavigation && pendingNavigation !== 'back') {
      window.location.href = pendingNavigation
    } else if (pendingNavigation === 'back') {
      // Actually go back now
      window.history.go(-2) // Go back 2 because we pushed a state
    }
    setPendingNavigation(null)
  }, [save, pendingNavigation, hasProFeaturesEnabled])

  const handleDiscardAndNavigate = useCallback(() => {
    setShowUnsavedDialog(false)
    if (pendingNavigation && pendingNavigation !== 'back') {
      window.location.href = pendingNavigation
    } else if (pendingNavigation === 'back') {
      // Actually go back now
      window.history.go(-2) // Go back 2 because we pushed a state
    }
    setPendingNavigation(null)
  }, [pendingNavigation])

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

  const pageUrl = connectedDomain ? getLinksUrlWithCustomDomain(onepage.slug, connectedDomain) : getLinksUrl(onepage.slug)

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const viewLive = () => {
    window.open(pageUrl, "_blank")
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
    return (
      <>
        <Save className="h-4 w-4" />
        <span className="hidden sm:inline ml-2">Save</span>
      </>
    )
  }

  const isSaveDisabled = saveState === "saving" || (saveState === "saved" && !isDirty) || !isDirty

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
      className="flex flex-col bg-gray-50/50 fixed left-0 right-0 bottom-0 top-[68px] md:left-[220px] md:top-[58px] md:bottom-0"
      style={{ zIndex: 30 }}
    >
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
      {/* Header - ALWAYS visible with solid background */}
      <header className="flex items-center justify-between border-b bg-white px-3 sm:px-4 md:px-6 h-[56px] sm:h-[60px] shrink-0 relative z-30 gap-2 overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Undo/Redo Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={handleUndoClick}
              disabled={!canUndo}
              title="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={handleRedoClick}
              disabled={!canRedo}
              title="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab Navigation - Desktop - Pill shaped tabs */}
          <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-full p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
            onClick={() => setActiveTab("settings")}
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

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Unsaved changes indicator - Only show on larger screens to prevent overlap */}
          {isDirty && saveState !== "saving" && (
            <span className="hidden lg:inline text-xs text-amber-600 font-medium whitespace-nowrap shrink-0">
              Unsaved changes
            </span>
          )}

          {/* Mobile: URL button in header (only shows in preview mode) */}
          {showMobilePreview && (
            <Button
              variant="outline"
              size="sm"
              className="md:hidden h-8 px-2 rounded-lg"
              onClick={() => setShowLinkModal(true)}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSaveWithProCheck}
            disabled={isSaveDisabled}
            className={cn(
              "h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-all duration-200",
              saveState === "saved" && !isDirty
                ? "bg-purple-400 hover:bg-purple-400 text-white opacity-60 cursor-default pointer-events-none"
                : isDirty
                  ? "bg-violet-500 hover:bg-violet-600 text-white cursor-pointer"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
          >
            {getSaveButtonContent()}
          </Button>

          {/* URL Button - Desktop */}
          <div className="hidden md:block">
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border text-sm font-medium hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer"
            >
              <span className="text-muted-foreground truncate max-w-[160px]">
                {pageUrl.replace('https://', '').replace('http://', '')}
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
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
            {activeTab === "design" && <DesignTab />}
            {activeTab === "links" && <LinksTab />}
            {activeTab === "products" && <ProductsTab />}
            {activeTab === "settings" && <SettingsTab />}
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20">
          <div className="flex items-center justify-around gap-1 px-2 sm:px-4 py-2 sm:py-3 pb-[max(8px,env(safe-area-inset-bottom))]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
              onClick={() => setActiveTab("settings")}
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

      {/* Link Modal - Fully Responsive */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent
          disableOverlayDefaultAnimations
          overlayClassName="backdrop-blur-[3px]"
          className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[92vw] sm:w-[420px] max-w-[420px] p-0 gap-0 overflow-hidden rounded-2xl border bg-background shadow-lg duration-300">
          <DialogHeader className="p-4 sm:p-5 border-b bg-background relative">
            <DialogTitle className="text-base sm:text-lg font-semibold text-center">Share your OnePage</DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Preview card - adapts to theme background */}
            <div
              className="rounded-xl p-4 sm:p-5 text-center"
              style={{
                background: onepage.theme.background_type === "gradient" && onepage.theme.background_gradient
                  ? onepage.theme.background_gradient
                  : (() => {
                      // If background is white or very light, use light gray instead
                      const bgColor = onepage.theme.background_color || "#1f2937"
                      const isWhiteOrLight = bgColor.toLowerCase() === "#ffffff" ||
                        bgColor.toLowerCase() === "#fff" ||
                        bgColor.toLowerCase() === "white" ||
                        bgColor.toLowerCase() === "#fafafa" ||
                        bgColor.toLowerCase() === "#f9fafb" ||
                        bgColor.toLowerCase() === "#f5f5f5"
                      return isWhiteOrLight ? "#f3f4f6" : bgColor
                    })(),
              }}
            >
              {onepage.avatar_video_url ? (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full mx-auto mb-2 overflow-hidden relative bg-white/20">
                  {onepage.avatar_url ? (
                    <img src={onepage.avatar_url} alt={onepage.title} className="absolute inset-0 w-full h-full object-cover scale-105 blur-[2px]" />
                  ) : (
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  )}
                  <video
                    src={onepage.avatar_video_url}
                    className="relative z-[1] w-full h-full object-cover opacity-0 transition-all duration-500"
                    onLoadedData={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                    onCanPlay={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                    onPlaying={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.filter = 'blur(0px)' }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                </div>
              ) : onepage.avatar_url ? (
                <img
                  src={onepage.avatar_url}
                  alt={onepage.title}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full mx-auto mb-2 object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{ backgroundColor: `${onepage.theme.text_color}20` }}
                >
                  <span
                    className="text-lg sm:text-xl font-semibold"
                    style={{ color: onepage.theme.text_color }}
                  >
                    {onepage.title?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              <h3
                className="font-semibold text-sm"
                style={{ color: onepage.theme.text_color }}
              >
                {onepage.title || "Your Name"}
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: `${onepage.theme.text_color}80` }}
              >
                ✦ /{onepage.slug}
              </p>
            </div>

            {/* URL copy section */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border">
              <span className="flex-1 text-xs sm:text-sm truncate">{pageUrl.replace('https://', '').replace('http://', '')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0 h-9 px-3 rounded-lg text-xs sm:text-sm cursor-pointer"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-1.5">{copied ? "Copied!" : "Copy"}</span>
              </Button>
            </div>

            {/* Open in new tab */}
            <Button
              variant="outline"
              className="w-full justify-start h-11 rounded-xl text-sm cursor-pointer"
              onClick={viewLive}
            >
              <ExternalLink className="h-4 w-4 mr-3" />
              Open in new tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
