"use client"

import { useState, useEffect } from "react"
import { ownOpen, useOwnMarker } from "@/lib/analytics/own-site"
import { useRouter } from "next/navigation"
import { useStoreBuilder } from "./store-builder-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Menu,
  Monitor,
  Smartphone,
  Loader2,
  ChevronDown,
  Plus,
  Undo2,
  Redo2,
  Check,
  Save,
  PanelLeft,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { UnsavedChangesDialog } from "./unsaved-changes-dialog"
import { getStoreUrl, getStoreShareUrl, getProductUrl, getProductShareUrl, getStoreUrlWithCustomDomain, getProductUrlWithCustomDomain } from "@/lib/url-helpers"
import { creatorPageHostFrom } from "@/lib/custom-domains/client"
import { openExternal } from "@/lib/native-bridge"

interface EditorTopbarProps {
  creatorSlug: string
  onPreview: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
}

export function EditorTopbar({ creatorSlug, onPreview, onToggleSidebar, isMobile }: EditorTopbarProps) {
  const router = useRouter()
  const {
    currentPageType,
    setCurrentPageType,
    previewDevice,
    setPreviewDevice,
    openAddSectionModal,
    canUndo,
    canRedo,
    undo,
    redo,
    saveState,
    save,
    publish,
    selectedProductId,
    products,
    discardChanges,
    setShowProductModeSelector,
  } = useStoreBuilder()

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [isSavingFromDialog, setIsSavingFromDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [pendingBrowserBack, setPendingBrowserBack] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)

  const hasUnsavedChanges = saveState === "unsaved"

  // Fetch custom domain on mount
  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => {
        /* The shop this edits is the creator page: its own domain, when it has one. */
        const host = creatorPageHostFrom(data)
        if (host) setConnectedDomain(host)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("storebuilder-navigation-loading", { detail: { isNavigating } }))
    return () => {
      window.dispatchEvent(new CustomEvent("storebuilder-navigation-loading", { detail: { isNavigating: false } }))
    }
  }, [isNavigating])

  // Get the live store URL based on current page type.
  // Always returns a full https:// URL (never an internal path) so it can
  // be opened in an external browser when running inside Capacitor.
  const getLiveStoreUrl = () => {
    if (currentPageType === "product" && selectedProductId) {
      const product = products.find((p) => p.id === selectedProductId)
      if (product) {
        const productSlug = (product as any).slug || selectedProductId
        return connectedDomain
          ? getProductUrlWithCustomDomain(creatorSlug, productSlug, connectedDomain)
          : getProductShareUrl(creatorSlug, productSlug)
      }
    }
    return connectedDomain
      ? getStoreUrlWithCustomDomain(creatorSlug, connectedDomain)
      : getStoreShareUrl(creatorSlug)
  }

  // Handle browser back button with popstate
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (hasUnsavedChanges) {
        // Prevent the navigation by pushing state back
        window.history.pushState(null, "", window.location.href)
        setPendingBrowserBack(true)
        setShowUnsavedDialog(true)
      }
    }

    // Push initial state to enable popstate detection
    window.history.pushState(null, "", window.location.href)
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [hasUnsavedChanges])

  const handleNavigationAttempt = (href: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(href)
      setPendingBrowserBack(false)
      setShowUnsavedDialog(true)
    } else {
      setIsNavigating(true)
      window.location.href = href
    }
  }

  /* The creator opening their own live store is not one of its visitors (lib/analytics/own-site). */
  useOwnMarker()

  const handleViewLiveStore = () => {
    openExternal(ownOpen(getLiveStoreUrl()))
  }

  const handleSaveFromDialog = async () => {
    setIsSavingFromDialog(true)
    try {
      await save()
      await publish()
      setShowUnsavedDialog(false)
      if (pendingBrowserBack) {
        // Go back after saving
        setIsNavigating(true)
        window.history.back()
      } else if (pendingNavigation) {
        setIsNavigating(true)
        window.location.href = pendingNavigation
      }
    } catch {
      // Error handled in context
    } finally {
      setIsSavingFromDialog(false)
      setPendingBrowserBack(false)
    }
  }

  const handleDiscardFromDialog = () => {
    discardChanges()
    setShowUnsavedDialog(false)
    if (pendingBrowserBack) {
      // Go back after discarding
      setIsNavigating(true)
      window.history.back()
    } else if (pendingNavigation) {
      setIsNavigating(true)
      window.location.href = pendingNavigation
    }
    setPendingBrowserBack(false)
  }

  const handleSave = async () => {
    try {
      await save()
      await publish()
    } catch {
      // Error handled in context
    }
  }

  const getPageLabel = () => {
    if (currentPageType === "shop") return "Home Page"
    if (selectedProductId) {
      const product = products.find((p) => p.id === selectedProductId)
      return product ? product.title : "Product Page"
    }
    return "Product Page"
  }

  const pageLabel = getPageLabel()

  const renderActionButton = () => {
    switch (saveState) {
      case "unsaved":
        return (
          <Button
            size="sm"
            className={cn(
              "bg-purple-600 text-white hover:bg-purple-700 cursor-pointer",
              isMobile ? "h-9 w-9 p-0" : "h-9"
            )}
            onClick={handleSave}
          >
            {isMobile ? (
              <Save className="h-4 w-4" />
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                <span>Save</span>
              </>
            )}
          </Button>
        )
      case "saving":
        return (
          <Button
            size="sm"
            className={cn(
              "bg-purple-600 text-white hover:bg-purple-700",
              isMobile ? "h-9 w-9 p-0" : "h-9"
            )}
            disabled
          >
            {isMobile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            )}
          </Button>
        )
      case "saved":
        return (
          <Button
            size="sm"
            className={cn(
              "bg-purple-600 text-white hover:bg-purple-600 cursor-default pointer-events-none",
              isMobile ? "h-9 w-9 p-0" : "h-9"
            )}
            disabled
          >
            {isMobile ? (
              <Check className="h-4 w-4" />
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                <span>Saved</span>
              </>
            )}
          </Button>
        )
      case "publishing":
        return (
          <Button
            size="sm"
            className={cn(
              "bg-purple-600 text-white hover:bg-purple-700",
              isMobile ? "h-9 w-9 p-0" : "h-9"
            )}
            disabled
          >
            {isMobile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            )}
          </Button>
        )
      case "published":
        return (
          <Button
            size="sm"
            className={cn(
              "bg-purple-600 text-white hover:bg-purple-600 cursor-default pointer-events-none",
              isMobile ? "h-9 w-9 p-0" : "h-9"
            )}
            disabled
          >
            {isMobile ? (
              <Check className="h-4 w-4" />
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                <span>Saved</span>
              </>
            )}
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-3 md:px-4 gap-2 relative z-50">
      {/* Left side */}
      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
        {isMobile && onToggleSidebar && (
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 bg-transparent" onClick={onToggleSidebar}>
            <PanelLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Hamburger Menu / Back */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent shrink-0 cursor-pointer">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 z-[100]">
            <DropdownMenuItem
              onClick={() => handleNavigationAttempt("/app")}
              disabled={isNavigating}
              className="cursor-pointer"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Returning...
                </>
              ) : (
                "Back to Dashboard"
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleViewLiveStore} className="cursor-pointer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Live Store
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Page Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 border-border bg-background shrink-0 cursor-pointer justify-between gap-1.5",
                isMobile ? "w-[140px]" : "w-[200px]"
              )}
            >
              <span className="truncate flex-1 text-left text-sm font-normal" title={pageLabel}>
                {isMobile && pageLabel.length > 15 ? `${pageLabel.slice(0, 15)}...` : pageLabel}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[100]">
            <DropdownMenuItem
              onClick={() => setCurrentPageType("shop")}
              className="cursor-pointer"
            >
              Home Page
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setCurrentPageType("product")
                setShowProductModeSelector(true)
              }}
              className="cursor-pointer"
            >
              Product Page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Add Section Button - hide text on mobile */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 bg-transparent shrink-0 cursor-pointer sm:px-[17px]"
          onClick={openAddSectionModal}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>

        {/* Undo/Redo - hide on very small screens */}
        <div className="hidden sm:flex items-center border-l border-border ml-1 pl-1 md:ml-2 md:pl-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className={cn("h-4 w-4", canUndo ? "text-purple-600" : "opacity-40")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className={cn("h-4 w-4", canRedo ? "text-purple-600" : "opacity-40")} />
          </Button>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {saveState === "unsaved" && (
          <span className="hidden md:inline text-xs text-amber-600 dark:text-amber-500">Unsaved changes</span>
        )}

        {/* View Live Store Button - desktop only, before device switcher */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 bg-transparent hidden sm:flex cursor-pointer"
          onClick={handleViewLiveStore}
          title={currentPageType === "product" ? "View live product page" : "View live store"}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden md:inline">View Live</span>
        </Button>

        {/* Device Switcher - hide on mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-transparent hidden sm:flex cursor-pointer">
              {previewDevice === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[100]">
            <DropdownMenuItem onClick={() => setPreviewDevice("desktop")} className="cursor-pointer">
              <Monitor className="mr-2 h-4 w-4" />
              Desktop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPreviewDevice("mobile")} className="cursor-pointer">
              <Smartphone className="mr-2 h-4 w-4" />
              Mobile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Preview Button - icon only on mobile */}
        <Button size="sm" className="h-9 bg-gray-900 text-white hover:bg-gray-800 cursor-pointer" onClick={onPreview}>
          <span className="hidden sm:inline">Preview</span>
          <Monitor className="h-4 w-4 sm:hidden" />
        </Button>

        {renderActionButton()}
      </div>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onSave={handleSaveFromDialog}
        onDiscard={handleDiscardFromDialog}
        isSaving={isSavingFromDialog}
      />

      {/* Navigation Loading Overlay - z-index higher than sticky add-to-cart */}
      {isNavigating && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <p className="text-sm text-gray-600 font-medium">Returning to dashboard...</p>
          </div>
        </div>
      )}
    </div>
  )
}
