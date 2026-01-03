"use client"

import { useOnePage, OnePageProvider } from "@/lib/onepage/context"
import { PhonePreview, MobilePreviewContent } from "./phone-preview"
import { DesignTab } from "./tabs/design-tab"
import { LinksTab } from "./tabs/links-tab"
import { ProductsTab } from "./tabs/products-tab"
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

type TabType = "design" | "links" | "products"

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
      <header className="flex items-center justify-between border-b bg-white px-3 sm:px-4 md:px-6 h-[56px] sm:h-[60px] shrink-0 relative z-30">
        <div className="flex items-center gap-2 sm:gap-3">
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
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Unsaved changes indicator - Desktop only */}
          {isDirty && saveState !== "saving" && (
            <span className="hidden sm:inline text-xs text-amber-600 font-medium">
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
              "h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-all",
              saveState === "saved" && !isDirty
                ? "bg-emerald-600 hover:bg-emerald-600 text-white cursor-default"
                : isDirty
                  ? "bg-violet-600 hover:bg-violet-700 text-white"
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

          {/* Mobile Preview Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="md:hidden h-8 px-3 rounded-lg"
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
          <div className="max-w-xl mx-auto p-4 md:p-6 md:pr-8 pb-32 md:pb-6">
            {activeTab === "design" && <DesignTab />}
            {activeTab === "links" && <LinksTab />}
            {activeTab === "products" && <ProductsTab />}
          </div>
        </div>

        {/* Preview Panel - Desktop ONLY with phone mockup */}
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
          <div className="flex items-center justify-center gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                    activeTab === tab.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Link Modal - Responsive with mobile fixes */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent
          className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto max-h-[calc(100vh-48px)] overflow-y-auto"
          style={{
            marginTop: 'env(safe-area-inset-top, 0px)',
            marginBottom: 'env(safe-area-inset-bottom, 0px)'
          }}
        >
          <DialogHeader className="p-4 sm:p-5 border-b sticky top-0 bg-background z-10">
            <DialogTitle className="text-base sm:text-lg font-semibold text-center">Share your OnePage</DialogTitle>
          </DialogHeader>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Preview card */}
            <div className="bg-gray-900 rounded-xl p-4 sm:p-6 text-center">
              {onepage.avatar_url ? (
                <img
                  src={onepage.avatar_url}
                  alt={onepage.title}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full mx-auto mb-2 sm:mb-3 object-cover"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full mx-auto mb-2 sm:mb-3 bg-gray-700 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl text-white font-semibold">
                    {onepage.title?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              <h3 className="text-white font-semibold text-sm sm:text-base">{onepage.title || "Your Name"}</h3>
              <p className="text-gray-400 text-xs sm:text-sm mt-1">✦ /{onepage.slug}</p>
            </div>

            {/* URL copy section */}
            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-gray-50 rounded-xl border">
              <span className="flex-1 text-xs sm:text-sm truncate min-w-0 break-all">{pageUrl.replace('https://', '').replace('http://', '')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0 h-8 px-3 rounded-lg text-xs sm:text-sm touch-target"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-1.5">{copied ? "Copied!" : "Copy"}</span>
              </Button>
            </div>

            {/* Open in new tab */}
            <Button
              variant="outline"
              className="w-full justify-start h-11 sm:h-12 rounded-xl text-sm touch-target"
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
