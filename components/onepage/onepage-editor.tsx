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
import { getLinksUrl } from "@/lib/url-helpers"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OnboardingModal } from "./onboarding-modal"

// =====================================================
// ONBOARDING COMPLETION KEY - Used to track completion
// =====================================================
const ONBOARDING_COMPLETED_KEY = "onepage_onboarding_done"

// Helper to check if onboarding is completed (checks localStorage)
function isOnboardingDone(onepageId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    const completed = localStorage.getItem(`${ONBOARDING_COMPLETED_KEY}_${onepageId}`)
    return completed === "true"
  } catch {
    return false
  }
}

// Helper to mark onboarding as done (saves to localStorage)
function markOnboardingDone(onepageId: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`${ONBOARDING_COMPLETED_KEY}_${onepageId}`, "true")
    // Also clear the progress
    localStorage.removeItem("onepage_onboarding_progress")
  } catch {
    // Ignore
  }
}

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
  // Check if onboarding should be shown
  // Priority: 1. localStorage (instant), 2. database field
  const shouldSkipOnboarding = 
    initialOnePage?.onboarding_completed === true || 
    (typeof window !== "undefined" && isOnboardingDone(initialOnePage?.id || ""))

  return (
    <OnePageProvider initialOnePage={initialOnePage}>
      <EditorLayout skipOnboarding={shouldSkipOnboarding} onepageId={initialOnePage?.id || ""} />
    </OnePageProvider>
  )
}

type TabType = "design" | "links" | "products" | "settings"

// Unsaved Changes Dialog Component
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-32px)] max-w-sm p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
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
            className="w-full py-3 px-4 bg-white text-gray-700 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Don't save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Pro Upgrade Dialog Component (same as in original)
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
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
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

function EditorLayout({ skipOnboarding, onepageId }: { skipOnboarding: boolean; onepageId: string }) {
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

  // =====================================================
  // ONBOARDING STATE - SIMPLE AND BULLETPROOF
  // =====================================================
  
  // Check localStorage on client side
  const [isClient, setIsClient] = useState(false)
  const [localStorageChecked, setLocalStorageChecked] = useState(false)
  const [isOnboardingCompletedLocal, setIsOnboardingCompletedLocal] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
    // Check localStorage
    const isDone = isOnboardingDone(onepageId)
    setIsOnboardingCompletedLocal(isDone)
    setLocalStorageChecked(true)
  }, [onepageId])
  
  // Determine if we should show onboarding
  // Skip if: server says completed OR localStorage says completed
  const shouldShowOnboarding = !skipOnboarding && !isOnboardingCompletedLocal && localStorageChecked
  
  // State for controlling the modal
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  // Show onboarding after client-side check
  useEffect(() => {
    if (localStorageChecked && !skipOnboarding && !isOnboardingCompletedLocal) {
      setShowOnboarding(true)
    }
  }, [localStorageChecked, skipOnboarding, isOnboardingCompletedLocal])

  // Track if completed this session
  const completedThisSession = useRef(false)

  // Check if user has Pro features enabled that require Pro plan
  const hasProFeaturesEnabled = useCallback(() => {
    if (!onepage) return false
    return onepage.settings.show_branding === false
  }, [onepage])

  // Handle save with Pro plan check
  const handleSaveWithProCheck = useCallback(async () => {
    const userHasPro = false
    if (hasProFeaturesEnabled() && !userHasPro) {
      setShowProUpgradeDialog(true)
      return
    }
    await save()
  }, [hasProFeaturesEnabled, save])

  // Handle upgrading to Pro
  const handleUpgradeToPro = useCallback(() => {
    setShowProUpgradeDialog(false)
    window.open('/pricing', '_blank')
  }, [])

  // Handle discarding Pro changes
  const handleDiscardProChanges = useCallback(() => {
    updateSettings({
      show_branding: true,
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
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        window.history.pushState(null, '', window.location.href)
        setShowUnsavedDialog(true)
        setPendingNavigation('back')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)

    if (!hasSetupBackInterceptionRef.current) {
      window.history.pushState(null, '', window.location.href)
      hasSetupBackInterceptionRef.current = true
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isDirty])

  // Handle saving for navigation
  const handleSaveForNav = useCallback(async () => {
    setIsSavingForNav(true)
    try {
      await save()
      setShowUnsavedDialog(false)
      if (pendingNavigation === 'back') {
        window.history.back()
      } else if (pendingNavigation) {
        window.location.href = pendingNavigation
      }
    } finally {
      setIsSavingForNav(false)
    }
  }, [save, pendingNavigation])

  // Handle discarding changes
  const handleDiscardChanges = useCallback(() => {
    setShowUnsavedDialog(false)
    if (pendingNavigation === 'back') {
      hasSetupBackInterceptionRef.current = false
      window.history.back()
    } else if (pendingNavigation) {
      window.location.href = pendingNavigation
    }
  }, [pendingNavigation])

  // Handle closing unsaved dialog
  const handleCloseUnsavedDialog = useCallback(() => {
    setShowUnsavedDialog(false)
    setPendingNavigation(null)
  }, [])

  const pageUrl = onepage?.slug ? getLinksUrl(onepage.slug) : ""

  const handleCopyLink = useCallback(async () => {
    if (!pageUrl) return
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [pageUrl])

  const handleOpenPage = useCallback(() => {
    if (!pageUrl) return
    window.open(pageUrl, "_blank")
  }, [pageUrl])

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(async () => {
    // Mark as completed immediately in localStorage
    markOnboardingDone(onepageId)
    
    // Update local state
    completedThisSession.current = true
    setShowOnboarding(false)
    setIsOnboardingCompletedLocal(true)
    
    // Save the editor
    try {
      await save()
    } catch (e) {
      console.error("Failed to save after onboarding:", e)
    }
  }, [onepageId, save])

  if (!onepage) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f8] overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="flex-none h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-4">
        {/* Left: Tab Navigation */}
        <nav className="flex items-center gap-1">
          {[
            { id: "links" as TabType, label: "Links", icon: Link2 },
            { id: "design" as TabType, label: "Design", icon: Palette },
            { id: "products" as TabType, label: "Products", icon: ShoppingBag },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === "settings"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <SettingsFilterIcon className="h-4 w-4" />
          </button>
        </nav>

        {/* Center: Spacer */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="hidden sm:flex items-center gap-1 mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
              className="h-8 w-8"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
              className="h-8 w-8"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSaveWithProCheck}
            disabled={saveState === "saving"}
            className={cn(
              "gap-2 transition-all duration-300",
              saveState === "saved" && "bg-green-600 hover:bg-green-700"
            )}
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">Saved</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
              </>
            )}
          </Button>

          {/* View Live Link */}
          <Button
            variant="outline"
            onClick={() => setShowLinkModal(true)}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">View Live</span>
          </Button>

          {/* Mobile Preview Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            className="sm:hidden"
          >
            {showMobilePreview ? (
              <Edit3 className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Editor */}
        <div
          className={cn(
            "flex-1 overflow-y-auto",
            showMobilePreview && "hidden sm:block"
          )}
        >
          <div className="max-w-2xl mx-auto p-6">
            {activeTab === "links" && <LinksTab />}
            {activeTab === "design" && <DesignTab />}
            {activeTab === "products" && <ProductsTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        </div>

        {/* Right Panel: Phone Preview */}
        <div
          className={cn(
            "w-full sm:w-[400px] flex-none border-l border-gray-200 bg-[#f0f0f2] overflow-hidden",
            !showMobilePreview && "hidden sm:block"
          )}
        >
          <div className="h-full flex items-center justify-center p-6">
            <PhonePreview />
          </div>
        </div>
      </div>

      {/* Link Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your OnePage Link</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={pageUrl}
              className="flex-1 px-3 py-2 border rounded-lg text-sm bg-gray-50"
            />
            <Button onClick={handleCopyLink} variant="outline" size="icon">
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={handleOpenPage} variant="outline" size="icon">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onClose={handleCloseUnsavedDialog}
        onSave={handleSaveForNav}
        onDiscard={handleDiscardChanges}
        isSaving={isSavingForNav}
      />

      {/* Pro Upgrade Dialog */}
      <ProUpgradeDialog
        open={showProUpgradeDialog}
        onClose={() => setShowProUpgradeDialog(false)}
        onUpgrade={handleUpgradeToPro}
        onDiscard={handleDiscardProChanges}
        onKeepEditing={handleKeepEditing}
      />

      {/* Onboarding Modal - Only render if not completed */}
      {!skipOnboarding && !completedThisSession.current && (
        <OnboardingModal
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  )
}
