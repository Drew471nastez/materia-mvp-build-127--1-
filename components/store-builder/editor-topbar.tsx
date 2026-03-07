"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
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
import type { PageType } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import { UnsavedChangesDialog } from "./unsaved-changes-dialog"
import { getStoreUrl, getStoreShareUrl, getProductUrl, getProductShareUrl, getStoreUrlWithCustomDomain, getProductUrlWithCustomDomain } from "@/lib/url-helpers"
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
  } = useStoreBuilder()

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [isSavingFromDialog, setIsSavingFromDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [pendingBrowserBack, setPendingBrowserBack] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)

  // Mobile bottom sheet for page switcher
  const [showPageSheet, setShowPageSheet] = useState(false)
  const [pageSheetVisible, setPageSheetVisible] = useState(false)
  const [pageSheetAnimating, setPageSheetAnimating] = useState(false)
  const [pageSheetDragY, setPageSheetDragY] = useState(0)
  const [pageSheetDragging, setPageSheetDragging] = useState(false)
  const pageSheetRef = useRef<HTMLDivElement>(null)
  const pageSheetStartY = useRef(0)
  const pageSheetLastY = useRef(0)
  const pageSheetLastTime = useRef(0)
  const pageSheetVelocity = useRef(0)

  const hasUnsavedChanges = saveState === "unsaved"

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

  const handleViewLiveStore = () => {
    openExternal(getLiveStoreUrl())
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

  // Page sheet animation lifecycle
  useEffect(() => {
    if (showPageSheet && !pageSheetVisible) {
      setPageSheetVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setPageSheetAnimating(true)))
    } else if (!showPageSheet && pageSheetVisible) {
      setPageSheetAnimating(false)
      const t = setTimeout(() => { setPageSheetVisible(false); setPageSheetDragY(0) }, 400)
      return () => clearTimeout(t)
    }
  }, [showPageSheet, pageSheetVisible])

  const closePageSheet = () => setShowPageSheet(false)

  const handlePageSheetTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const el = pageSheetRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const touchYInSheet = touch.clientY - rect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      pageSheetStartY.current = touch.clientY
      pageSheetLastY.current = touch.clientY
      pageSheetLastTime.current = Date.now()
      pageSheetVelocity.current = 0
      setPageSheetDragging(true)
    }
  }

  const handlePageSheetTouchMove = (e: React.TouchEvent) => {
    if (!pageSheetDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - pageSheetStartY.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - pageSheetLastTime.current)
      pageSheetVelocity.current = (currentY - pageSheetLastY.current) / dt
      pageSheetLastY.current = currentY
      pageSheetLastTime.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setPageSheetDragY(resisted)
    }
  }

  const handlePageSheetTouchEnd = () => {
    if (!pageSheetDragging) return
    setPageSheetDragging(false)
    if (pageSheetDragY > 92 || pageSheetVelocity.current > 0.55) {
      closePageSheet()
    } else {
      setPageSheetDragY(0)
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
        {isMobile ? (
          <>
            <button
              onClick={() => setShowPageSheet(true)}
              className="h-9 flex items-center justify-between px-3 border border-border bg-background rounded-md gap-2 text-sm font-medium w-[140px] cursor-pointer shrink-0"
            >
              <span className="truncate text-sm">{pageLabel.length > 15 ? `${pageLabel.slice(0, 15)}...` : pageLabel}</span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </button>

            {/* Mobile bottom sheet for page selection */}
            {pageSheetVisible && (
              <div
                className="fixed inset-0 z-[200]"
                onTouchStart={handlePageSheetTouchStart}
                onTouchMove={handlePageSheetTouchMove}
                onTouchEnd={handlePageSheetTouchEnd}
              >
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  style={{
                    opacity: pageSheetAnimating ? 1 : 0,
                    transition: pageSheetDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                  }}
                  onClick={closePageSheet}
                />
                <div
                  ref={pageSheetRef}
                  className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
                  style={{
                    transform: pageSheetAnimating ? `translate3d(0, ${pageSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
                    transition: pageSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden' as any,
                  }}
                >
                  <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
                    <div className="h-[5px] w-10 rounded-full bg-gray-300" />
                  </div>
                  <div className="px-4 pb-4">
                    <h3 className="text-[16px] font-semibold text-gray-900 mb-4">Select Page</h3>
                    <div className="space-y-1">
                      <button
                        onClick={() => { setCurrentPageType("shop"); closePageSheet() }}
                        className={cn(
                          "w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors",
                          currentPageType === "shop" ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] active:bg-[#f3f4f6]"
                        )}
                      >
                        Home Page
                      </button>
                      <button
                        onClick={() => { setCurrentPageType("product"); closePageSheet() }}
                        className={cn(
                          "w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors",
                          currentPageType === "product" ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] active:bg-[#f3f4f6]"
                        )}
                      >
                        Product Page
                      </button>
                    </div>
                  </div>
                  <div className="h-[env(safe-area-inset-bottom)]" />
                </div>
              </div>
            )}
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-[200px] flex items-center justify-between px-3 bg-background cursor-pointer font-normal shrink-0"
              >
                <span className="truncate text-sm">{pageLabel}</span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[200]">
              <DropdownMenuItem
                onClick={() => setCurrentPageType("shop")}
                className="cursor-pointer"
              >
                {currentPageType === "shop" && <Check className="mr-2 h-4 w-4 text-purple-600" />}
                {currentPageType !== "shop" && <span className="mr-2 inline-block w-4 h-4" />}
                Home Page
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setCurrentPageType("product")}
                className="cursor-pointer"
              >
                {currentPageType === "product" && <Check className="mr-2 h-4 w-4 text-purple-600" />}
                {currentPageType !== "product" && <span className="mr-2 inline-block w-4 h-4" />}
                Product Page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Add Section Button - hide text on mobile */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 bg-transparent shrink-0 cursor-pointer"
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
