"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { StoreBuilderProvider, useStoreBuilder } from "./store-builder-context"
import { EditorTopbar } from "./editor-topbar"
import { SectionsSidebar } from "./sections-sidebar"
import { PreviewCanvas } from "./preview-canvas"
import type { CommunityCard } from "@/lib/communities/types"
import { AddSectionModal } from "./add-section-modal"
import { ProductPageModeSelector } from "./product-page-mode-selector"
import { cn } from "@/lib/utils"
import type { PageType } from "@/lib/store-builder/types"

interface StoreBuilderEditorProps {
  creatorId: string
  creatorSlug: string
  creator: {
    cover_url?: string
    headline?: string
    bio?: string
    niche_tags?: string[]
    show_total_sales_badge?: boolean
    avatar_url?: string
  }
  profile: {
    display_name?: string
    avatar_url?: string
    username?: string
  }
  products: Array<{
    id: string
    slug?: string
    title: string
    thumbnail_url?: string
    price_cents: number
    compare_at_cents?: number
    sales_count?: number
    description?: string
    whats_included?: string[]
    gallery_urls?: string[]
    video_url?: string
    faqs?: Array<{ question: string; answer: string }>
  }>
  initialPageType?: PageType
  initialProductId?: string | null
  /** The creator's communities for the canvas's Communities tab; empty while communities are off. */
  communities?: CommunityCard[]
}

export function StoreBuilderEditor({
  creatorId,
  creatorSlug,
  creator,
  profile,
  products,
  initialPageType,
  initialProductId,
  communities = [],
}: StoreBuilderEditorProps) {
  return (
    <StoreBuilderProvider
      creatorId={creatorId}
      initialProducts={products}
      initialPageType={initialPageType}
      initialProductId={initialProductId}
    >
      <EditorLayout
        creatorId={creatorId}
        creatorSlug={creatorSlug}
        creator={creator}
        profile={profile}
        products={products}
        communities={communities}
      />
    </StoreBuilderProvider>
  )
}

function EditorLayout({
  creatorId,
  creatorSlug,
  creator,
  profile,
  products,
  communities = [],
}: Omit<StoreBuilderEditorProps, "initialPageType" | "initialProductId">) {
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    addSectionModalOpen,
    closeAddSectionModal,
    showProductModeSelector,
    setShowProductModeSelector,
    saveState,
  } = useStoreBuilder()
  const [previewMode, setPreviewMode] = useState(false)

  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizing, setIsResizing] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Get selectedSectionId from context to auto-open sidebar on mobile
  const { selectedSectionId } = useStoreBuilder()

  const MIN_SIDEBAR_WIDTH = 280
  const MAX_SIDEBAR_WIDTH = 400

  // Warn user about unsaved changes when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === "unsaved") {
        e.preventDefault()
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?"
        return e.returnValue
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [saveState])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Auto-open sidebar on mobile when a section is selected
  useEffect(() => {
    if (isMobileView && selectedSectionId) {
      setMobileSidebarOpen(true)
    }
  }, [isMobileView, selectedSectionId])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isResizing) return
      const touch = e.touches[0]
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, touch.clientX))
      setSidebarWidth(newWidth)
    }

    const handleEnd = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleEnd)
      document.addEventListener("touchmove", handleTouchMove)
      document.addEventListener("touchend", handleEnd)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleEnd)
      document.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("touchend", handleEnd)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault()
          if (canRedo) redo()
        } else {
          e.preventDefault()
          if (canUndo) undo()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canUndo, canRedo, undo, redo])

  if (previewMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top,_0px)] pb-[env(safe-area-inset-bottom,_0px)]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <span className="text-sm font-medium">Preview Mode</span>
          <button
            onClick={() => setPreviewMode(false)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Exit Preview
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <PreviewCanvas creatorId={creatorId} creator={creator} profile={profile} products={products} communities={communities} isPreviewMode />
        </div>
      </div>
    )
  }

  if (isMobileView) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white dark:bg-zinc-950 pt-[env(safe-area-inset-top,_0px)] pb-[env(safe-area-inset-bottom,_0px)]">
        {/* Top Bar */}
        <EditorTopbar
          creatorSlug={creatorSlug}
          onPreview={() => setPreviewMode(true)}
          onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          isMobile
        />

        {/* Main Content Area */}
        <div className="relative flex-1 min-h-0">
          {/* Mobile Sidebar - slides in from left */}
          <div
            className={cn(
              "absolute inset-y-0 left-0 z-30 w-[85vw] max-w-[320px] bg-background border-r border-border transition-transform duration-300 ease-in-out",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex flex-col h-full">
              <SectionsSidebar creatorId={creatorId} profile={profile} creator={creator} />
            </div>
          </div>

          {/* Overlay when sidebar is open */}
          {mobileSidebarOpen && (
            <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setMobileSidebarOpen(false)} />
          )}

          {/* Canvas - always visible */}
          <div className="h-full overflow-auto">
            <PreviewCanvas
              creatorId={creatorId}
              creator={creator}
              profile={profile}
              products={products}
              communities={communities}
              isMobileSidebarOpen={mobileSidebarOpen}
            />
          </div>
        </div>

        {/* Modals */}
        <AddSectionModal open={addSectionModalOpen} onOpenChange={closeAddSectionModal} />
        <ProductPageModeSelector
          open={showProductModeSelector}
          onOpenChange={setShowProductModeSelector}
          products={products}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden pt-[env(safe-area-inset-top,_0px)] pb-[env(safe-area-inset-bottom,_0px)]">
      {/* Top Bar - fixed height */}
      <EditorTopbar creatorSlug={creatorSlug} onPreview={() => setPreviewMode(true)} />

      {/* Main Editor Area - fills remaining space */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - fixed width, internal scroll */}
        <div
          className="relative flex-shrink-0 border-r border-border bg-background flex flex-col h-full overflow-hidden"
          style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}
        >
          {/* Sidebar content - scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <SectionsSidebar creatorId={creatorId} profile={profile} creator={creator} />
          </div>

          {/* Resize Handle */}
          <div
            ref={resizeRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize transition-colors z-20 group",
              "hover:bg-sky-500/30",
              isResizing && "bg-sky-500/50",
            )}
          >
            {/* Visual drag indicator */}
            <div
              className={cn(
                "absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-12 rounded-full bg-border transition-all",
                "group-hover:bg-sky-500 group-hover:h-16",
                isResizing && "bg-sky-500 h-16",
              )}
            />
          </div>
        </div>

        {/* Preview Canvas - fills remaining space, scrollable */}
        <div className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-950">
          <PreviewCanvas creatorId={creatorId} creator={creator} profile={profile} products={products} communities={communities} />
        </div>
      </div>

      {/* Modals - portaled to body, proper z-index */}
      <AddSectionModal open={addSectionModalOpen} onOpenChange={closeAddSectionModal} />
      <ProductPageModeSelector
        open={showProductModeSelector}
        onOpenChange={setShowProductModeSelector}
        products={products}
      />
    </div>
  )
}
