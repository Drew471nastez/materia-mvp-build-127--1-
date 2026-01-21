"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useStoreBuilder } from "./store-builder-context"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  ArrowLeft,
} from "lucide-react"
import type { PageType } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import { UnsavedChangesDialog } from "./unsaved-changes-dialog"
import { getStoreUrl, getProductUrl } from "@/lib/url-helpers"

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
  const [isNavigatingToDashboard, setIsNavigatingToDashboard] = useState(false)

  const hasUnsavedChanges = saveState === "unsaved"

  // Get the live store URL based on current page type (uses subdomain format)
  const getLiveStoreUrl = () => {
    if (currentPageType === "product" && selectedProductId) {
      const product = products.find((p) => p.id === selectedProductId)
      if (product) {
        // Use slug if available, otherwise use ID
        const productSlug = (product as any).slug || selectedProductId
        return getProductUrl(creatorSlug, productSlug)
      }
    }
    return getStoreUrl(creatorSlug)
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

  const handleNavigationAttempt = (href: string, isDashboard = false) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(href)
      setPendingBrowserBack(false)
      setShowUnsavedDialog(true)
    } else {
      if (isDashboard) {
        setIsNavigatingToDashboard(true)
      }
      router.push(href)
    }
  }

  const handleViewLiveStore = () => {
    window.open(getLiveStoreUrl(), "_blank")
  }

  const handleSaveFromDialog = async () => {
    setIsSavingFromDialog(true)
    try {
      await save()
      setShowUnsavedDialog(false)
      if (pendingBrowserBack) {
        // Go back after saving
        window.history.back()
      } else if (pendingNavigation) {
        if (pendingNavigation === "/app") {
          setIsNavigatingToDashboard(true)
        }
        router.push(pendingNavigation)
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
      window.history.back()
    } else if (pendingNavigation) {
      if (pendingNavigation === "/app") {
        setIsNavigatingToDashboard(true)
      }
      router.push(pendingNavigation)
    }
    setPendingBrowserBack(false)
  }

  const handleSave = async () => {
    try {
      await save()
    } catch {
      // Error handled in context
    }
  }

  const handlePublish = async () => {
    try {
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
              "bg-purple-600 text-white hover:bg-purple-700",
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
              "bg-purple-600 text-white hover:bg-purple-700",
              isMobile ? "h-9 px-3" : "h-9"
            )}
            onClick={handlePublish}
          >
            <span>Publish</span>
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
                <span>Publishing...</span>
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
                <span>Published</span>
              </>
            )}
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-3 md:px-4 gap-2">
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
            <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent shrink-0">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onSelect={() => handleNavigationAttempt("/app", true)}
              disabled={isNavigatingToDashboard}
              className="flex items-center gap-2"
            >
              {isNavigatingToDashboard ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Going to Dashboard...</span>
                </>
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Dashboard</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleViewLiveStore}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Live Store
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Page Switcher */}
        <Select value={currentPageType} onValueChange={(value) => setCurrentPageType(value as PageType)}>
          <SelectTrigger
            className={cn("h-9 border-border bg-background shrink-0", isMobile ? "w-[140px]" : "w-[200px]")}
          >
            <SelectValue>
              <span className="truncate" title={pageLabel}>
                {isMobile && pageLabel.length > 15 ? `${pageLabel.slice(0, 15)}...` : pageLabel}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shop">Home Page</SelectItem>
            <SelectItem value="product">Product Page</SelectItem>
          </SelectContent>
        </Select>

        {/* Add Section Button - hide text on mobile */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 bg-transparent shrink-0"
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
          className="h-9 gap-1.5 bg-transparent hidden sm:flex"
          onClick={handleViewLiveStore}
          title={currentPageType === "product" ? "View live product page" : "View live store"}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden md:inline">View Live</span>
        </Button>

        {/* Device Switcher - hide on mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-transparent hidden sm:flex">
              {previewDevice === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setPreviewDevice("desktop")}>
              <Monitor className="mr-2 h-4 w-4" />
              Desktop
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPreviewDevice("mobile")}>
              <Smartphone className="mr-2 h-4 w-4" />
              Mobile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Preview Button - icon only on mobile */}
        <Button size="sm" className="h-9 bg-gray-900 text-white hover:bg-gray-800" onClick={onPreview}>
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

      {/* Navigation Overlay - shows when navigating to dashboard */}
      {isNavigatingToDashboard && (
        <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <p className="text-lg font-medium text-gray-700">Going back to Dashboard...</p>
          </div>
        </div>
      )}
    </div>
  )
}
