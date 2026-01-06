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
  Menu,
  Undo2,
  Redo2,
  Save,
  Eye,
  Edit3,
  Settings,
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import type { OnePage } from "@/lib/onepage/types"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  } = useOnePage()

  const [activeTab, setActiveTab] = useState<TabType>("links")
  const [copied, setCopied] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isSavingForNav, setIsSavingForNav] = useState(false)

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

  // Handle link clicks when dirty
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      
      if (anchor && isDirty) {
        const href = anchor.getAttribute('href')
        // Only intercept internal navigation links (not external or modal triggers)
        if (href && !href.startsWith('http') && !href.startsWith('#') && !anchor.getAttribute('target')) {
          e.preventDefault()
          setShowUnsavedDialog(true)
          setPendingNavigation(href)
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [isDirty])

  const handleSaveAndNavigate = useCallback(async () => {
    setIsSavingForNav(true)
    await save()
    setIsSavingForNav(false)
    setShowUnsavedDialog(false)
    if (pendingNavigation && pendingNavigation !== 'back') {
      window.location.href = pendingNavigation
    } else if (pendingNavigation === 'back') {
      window.history.back()
    }
    setPendingNavigation(null)
  }, [save, pendingNavigation])

  const handleDiscardAndNavigate = useCallback(() => {
    setShowUnsavedDialog(false)
    if (pendingNavigation && pendingNavigation !== 'back') {
      window.location.href = pendingNavigation
    } else if (pendingNavigation === 'back') {
      window.history.back()
    }
    setPendingNavigation(null)
  }, [pendingNavigation])

  if (!onepage) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/l/${onepage.slug}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const viewLive = () => {
    window.open(`/l/${onepage.slug}`, "_blank")
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

  return (
    <div 
      className="flex flex-col bg-gray-50/50 fixed inset-0 md:left-64 top-14 md:top-0"
      style={{ zIndex: 10 }}
    >
      {/* Header - ALWAYS visible with solid background */}
      <header className="flex items-center justify-between border-b bg-white px-3 sm:px-4 md:px-6 h-[56px] sm:h-[60px] shrink-0 relative z-30 gap-2 overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Undo/Redo Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={undo}
              disabled={!canUndo}
              title="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={redo}
              disabled={!canRedo}
              title="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab Navigation - Desktop */}
          <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                    activeTab === tab.id
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
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
              "hidden md:flex w-10 h-10 rounded-xl items-center justify-center border transition-all duration-200",
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
            onClick={save}
            disabled={isSaveDisabled}
            className={cn(
              "h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-all duration-200",
              saveState === "saved" && !isDirty
                ? "bg-gray-900 hover:bg-gray-900 text-white cursor-default"
                : isDirty
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
          >
            {getSaveButtonContent()}
          </Button>

          {/* URL Button - Desktop */}
          <div className="hidden md:block">
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border text-sm font-medium hover:shadow-md transition-all"
            >
              <span className="text-muted-foreground truncate max-w-[160px]">
                {pageUrl.replace('https://', '').replace('http://', '')}
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>

          {/* Mobile Preview Toggle - Blue button */}
          <Button
            variant={showMobilePreview ? "outline" : "default"}
            size="sm"
            className={cn(
              "md:hidden h-8 px-3 rounded-lg",
              !showMobilePreview && "bg-blue-500 hover:bg-blue-600 text-white"
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
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className={cn(
            "p-4 md:p-6 md:pl-2 xl:pl-6 2xl:pl-10 md:pr-8 pb-32 md:pb-6",
            activeTab === "settings" ? "max-w-2xl" : "max-w-xl"
          )}>
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
            width: '360px',
            minWidth: '360px',
            flexShrink: 0,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              minHeight: '100%',
              padding: '20px 24px',
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
                    "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex-1 justify-center min-w-0",
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
            {/* Settings Button - Mobile */}
            <button
              onClick={() => setActiveTab("settings")}
              className={cn(
                "flex items-center justify-center min-w-[40px] w-10 h-10 sm:w-11 sm:h-11 rounded-xl transition-all shrink-0",
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
        <DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[92vw] sm:w-[420px] max-w-[420px] p-0 gap-0 overflow-hidden rounded-2xl border bg-background shadow-lg z-50">
          <DialogHeader className="p-4 sm:p-5 border-b bg-background">
            <DialogTitle className="text-base sm:text-lg font-semibold text-center">Share your OnePage</DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Preview card */}
            <div className="bg-gray-900 rounded-xl p-4 sm:p-5 text-center">
              {onepage.avatar_url ? (
                <img
                  src={onepage.avatar_url}
                  alt={onepage.title}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full mx-auto mb-2 object-cover"
                />
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full mx-auto mb-2 bg-gray-700 flex items-center justify-center">
                  <span className="text-lg sm:text-xl text-white font-semibold">
                    {onepage.title?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              <h3 className="text-white font-semibold text-sm">{onepage.title || "Your Name"}</h3>
              <p className="text-gray-400 text-xs mt-1">✦ /{onepage.slug}</p>
            </div>

            {/* URL copy section */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border">
              <span className="flex-1 text-xs sm:text-sm truncate">{pageUrl.replace('https://', '').replace('http://', '')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0 h-9 px-3 rounded-lg text-xs sm:text-sm"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-1.5">{copied ? "Copied!" : "Copy"}</span>
              </Button>
            </div>

            {/* Open in new tab */}
            <Button
              variant="outline"
              className="w-full justify-start h-11 rounded-xl text-sm"
              onClick={viewLive}
            >
              <ExternalLink className="h-4 w-4 mr-3" />
              Open in new tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Navigation Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="p-3 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); setShowMobilePreview(false); }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    activeTab === tab.id
                      ? "bg-gray-100 text-foreground"
                      : "text-muted-foreground hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="border-t p-3 space-y-1">
            <Button variant="ghost" size="sm" onClick={copyLink} className="w-full justify-start h-10 rounded-lg">
              <Copy className="h-4 w-4 mr-3" />
              Copy Link
            </Button>
            <Button variant="ghost" size="sm" onClick={viewLive} className="w-full justify-start h-10 rounded-lg">
              <ExternalLink className="h-4 w-4 mr-3" />
              View Live
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onClose={() => { setShowUnsavedDialog(false); setPendingNavigation(null); }}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
        isSaving={isSavingForNav}
      />
    </div>
  )
}
