"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type {
  PageConfig,
  PageType,
  Section,
  DeviceType,
  SelectedElement,
  SaveState,
  ProductTemplate,
  GlobalStoreSettings,
  ThemePreset,
} from "@/lib/store-builder/types"
import {
  defaultShopPageConfig,
  defaultProductPageConfig,
  createDefaultProductPageConfig,
  createSectionFromLibrary,
  sectionLibrary,
  defaultMoreFromSellerSettings,
  defaultReviewsSettings,
  defaultSubscribeBarSettings,
  generateSectionId,
  themePresets,
  defaultGlobalStoreSettings,
} from "@/lib/store-builder/defaults"

interface HistoryState {
  config: PageConfig
  timestamp: number
}

interface StoreBuilderContextType {
  // Current state
  currentPageType: PageType
  draftConfig: PageConfig
  publishedConfig: PageConfig
  selectedSectionId: string | null
  selectedElement: SelectedElement | null
  previewDevice: DeviceType
  isLoading: boolean
  addSectionModalOpen: boolean
  canUndo: boolean
  canRedo: boolean
  sidebarMode: "sections" | "settings" | "global-settings"
  selectedProductId: string | null
  products: Array<{ id: string; title: string; thumbnail_url?: string }>
  saveState: SaveState
  hasEverBeenPublished: boolean

  // Product templates
  templates: ProductTemplate[]
  selectedTemplateId: string | null
  isEditingProductTemplate: boolean
  showProductModeSelector: boolean

  // Actions
  setCurrentPageType: (pageType: PageType) => void
  setSelectedSectionId: (id: string | null) => void
  setSelectedElement: (element: SelectedElement | null) => void
  setPreviewDevice: (device: DeviceType) => void
  updateDraftConfig: (config: PageConfig) => void
  updateSection: (sectionId: string, updates: Partial<Section>) => void
  updateSectionSettings: (sectionId: string, settings: any) => void
  addSection: (section: Section) => void
  removeSection: (sectionId: string) => void
  reorderSections: (sections: Section[]) => void
  updateHeaderSettings: (settings: any) => void
  updateGlobalSettings: (settings: Partial<GlobalStoreSettings>) => void
  applyTheme: (themePreset: ThemePreset) => void
  save: () => Promise<void>
  publish: () => Promise<void>
  discardChanges: () => void
  loadConfig: (pageType: PageType, productId?: string | null) => Promise<void>
  openAddSectionModal: () => void
  closeAddSectionModal: () => void
  undo: () => void
  redo: () => void
  setSidebarMode: (mode: "sections" | "settings" | "global-settings") => void
  goBackToSections: () => void
  setSelectedProductId: (id: string | null) => void
  setProducts: (products: Array<{ id: string; title: string; thumbnail_url?: string }>) => void
  openGlobalSettings: () => void

  // Template actions
  saveAsTemplate: (name: string) => Promise<void>
  selectTemplate: (templateId: string | null) => void
  assignTemplateToProducts: (templateId: string, productIds: string[]) => Promise<void>
  setIsEditingProductTemplate: (editing: boolean) => void
  setShowProductModeSelector: (show: boolean) => void
}

const StoreBuilderContext = createContext<StoreBuilderContextType | null>(null)

export function useStoreBuilder() {
  const context = useContext(StoreBuilderContext)
  if (!context) {
    throw new Error("useStoreBuilder must be used within StoreBuilderProvider")
  }
  return context
}

interface StoreBuilderProviderProps {
  children: React.ReactNode
  creatorId: string
  initialProducts?: Array<{ id: string; title: string; thumbnail_url?: string }>
  initialPageType?: PageType
  initialProductId?: string | null
}

const MAX_HISTORY_SIZE = 50

function isLockedSection(section: Section | undefined | null) {
  return !!section?.locked
}

/**
 * Ensures Reviews section exists on product pages and is locked (non-deletable)
 */
function ensureReviewsSection(sections: Section[]): Section[] {
  const hasReviews = sections.some((s) => s.type === "reviews")
  if (!hasReviews) {
    const reviewsSection: Section = {
      id: generateSectionId(),
      type: "reviews",
      settings: defaultReviewsSettings,
      order: sections.length,
      locked: true, // Cannot be deleted
    }
    return [...sections, reviewsSection]
  }
  // Make sure existing reviews section is locked
  return sections.map((s) => (s.type === "reviews" ? { ...s, locked: true } : s))
}

/**
 * Ensures mandatory sections exist on product pages
 */
function ensureMandatoryProductSections(config: PageConfig): PageConfig {
  let next = config

  // Ensure Reviews section exists and is locked
  next = {
    ...next,
    sections: ensureReviewsSection(next.sections),
  }

  // Ensure More from Seller section exists and is locked
  const hasMoreFromSeller = next.sections.some((s) => s.type === "more-from-seller")
  if (!hasMoreFromSeller) {
    const moreFromSellerSection: Section = {
      id: generateSectionId(),
      type: "more-from-seller",
      settings: defaultMoreFromSellerSettings,
      order: next.sections.length,
      locked: true, // Locked so it can only be hidden, not deleted
    }
    next = {
      ...next,
      sections: [...next.sections, moreFromSellerSection],
    }
  } else {
    // Make sure existing more-from-seller section is locked
    next = {
      ...next,
      sections: next.sections.map((s) => (s.type === "more-from-seller" ? { ...s, locked: true } : s)),
    }
  }

  // Normalize orders
  next = {
    ...next,
    sections: next.sections.map((s, i) => ({ ...s, order: i })),
  }

  return next
}

export function StoreBuilderProvider({
  children,
  creatorId,
  initialProducts = [],
  initialPageType = "shop",
  initialProductId = null,
}: StoreBuilderProviderProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [currentPageType, setCurrentPageType] = useState<PageType>(initialPageType)
  const [draftConfig, setDraftConfig] = useState<PageConfig>(defaultShopPageConfig)
  const [publishedConfig, setPublishedConfig] = useState<PageConfig>(defaultShopPageConfig)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [previewDevice, setPreviewDevice] = useState<DeviceType>("desktop")
  const [isLoading, setIsLoading] = useState(true)
  const [addSectionModalOpen, setAddSectionModalOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<"sections" | "settings" | "global-settings">("sections")
  const [selectedProductId, setSelectedProductIdState] = useState<string | null>(initialProductId)
  const [products, setProducts] =
    useState<Array<{ id: string; title: string; thumbnail_url?: string }>>(initialProducts)

  const [saveState, setSaveState] = useState<SaveState>("published")
  const [hasEverBeenPublished, setHasEverBeenPublished] = useState(false)

  const [templates, setTemplates] = useState<ProductTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [isEditingProductTemplate, setIsEditingProductTemplate] = useState(false)
  const [showProductModeSelector, setShowProductModeSelector] = useState(false)

  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedoAction = useRef(false)

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const updateURL = useCallback(
    (pageType: PageType, productId: string | null) => {
      const params = new URLSearchParams()
      params.set("pageType", pageType)
      if (productId && pageType === "product") {
        params.set("productId", productId)
      }
      router.replace(`/store-builder?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  const addToHistory = useCallback(
    (config: PageConfig) => {
      if (isUndoRedoAction.current) {
        isUndoRedoAction.current = false
        return
      }

      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1)
        newHistory.push({ config: JSON.parse(JSON.stringify(config)), timestamp: Date.now() })
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift()
        }
        return newHistory
      })
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1))
    },
    [historyIndex],
  )

  const undo = useCallback(() => {
    if (!canUndo) return
    isUndoRedoAction.current = true
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setDraftConfig(JSON.parse(JSON.stringify(history[newIndex].config)))
    setSaveState("unsaved")
  }, [canUndo, historyIndex, history])

  const redo = useCallback(() => {
    if (!canRedo) return
    isUndoRedoAction.current = true
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setDraftConfig(JSON.parse(JSON.stringify(history[newIndex].config)))
    setSaveState("unsaved")
  }, [canRedo, historyIndex, history])

  const loadConfig = useCallback(async (pageType: PageType, productId?: string | null) => {
    setIsLoading(true)
    try {
      let url = `/api/store-builder?pageType=${pageType}`
      if (productId && pageType === "product") {
        url += `&productId=${productId}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        // Use createDefaultProductPageConfig() to get fresh IDs for product pages
        const defaultConfig = pageType === "shop" ? defaultShopPageConfig : createDefaultProductPageConfig()

        let loadedDraft = (data.draft_config || defaultConfig) as PageConfig
        let loadedPublished = (data.published_config || defaultConfig) as PageConfig

        if (pageType === "shop") {
          loadedDraft = {
            ...loadedDraft,
            sections: loadedDraft.sections.filter((s: Section) => s.type !== "products"),
          }

          const hasFeaturedProducts = loadedDraft.sections.some((s) => s.type === "featured-products")
          if (!hasFeaturedProducts) {
            const featuredProductsLibraryItem = sectionLibrary.find((item) => item.type === "featured-products")
            if (featuredProductsLibraryItem) {
              const featuredProductsSection = createSectionFromLibrary(
                featuredProductsLibraryItem,
                loadedDraft.sections.length,
              )
              featuredProductsSection.locked = true
              loadedDraft = {
                ...loadedDraft,
                sections: [...loadedDraft.sections, featuredProductsSection],
              }
            }
          } else {
            loadedDraft = {
              ...loadedDraft,
              sections: loadedDraft.sections.map((s) => (s.type === "featured-products" ? { ...s, locked: true } : s)),
            }
          }
        }

        if (pageType === "product") {
          // Load global settings from default template and merge into product config
          // Global settings: creator bar, sticky add to cart, buy button colors, spacing
          if (productId) {
            try {
              const globalResponse = await fetch(`/api/store-builder?pageType=product`)
              if (globalResponse.ok) {
                const globalData = await globalResponse.json()
                const globalHeader = globalData.draft_config?.headerSettings || {}

                // Merge global settings into loaded config
                const productHeader = loadedDraft.headerSettings as any
                loadedDraft = {
                  ...loadedDraft,
                  headerSettings: {
                    ...loadedDraft.headerSettings,
                    // Use global settings for these fields (fallback to loaded values if global not set)
                    creatorBar: globalHeader.creatorBar || productHeader.creatorBar,
                    stickyAddToCart: globalHeader.stickyAddToCart || productHeader.stickyAddToCart,
                    buyButtonColor: globalHeader.buyButtonColor || productHeader.buyButtonColor,
                    buyButtonTextColor: globalHeader.buyButtonTextColor || productHeader.buyButtonTextColor,
                    spacing: globalHeader.spacing || productHeader.spacing,
                  },
                }

                // Also merge for published config
                const globalPublishedHeader = globalData.published_config?.headerSettings || {}
                const publishedProductHeader = loadedPublished.headerSettings as any
                loadedPublished = {
                  ...loadedPublished,
                  headerSettings: {
                    ...loadedPublished.headerSettings,
                    creatorBar: globalPublishedHeader.creatorBar || publishedProductHeader.creatorBar,
                    stickyAddToCart: globalPublishedHeader.stickyAddToCart || publishedProductHeader.stickyAddToCart,
                    buyButtonColor: globalPublishedHeader.buyButtonColor || publishedProductHeader.buyButtonColor,
                    buyButtonTextColor: globalPublishedHeader.buyButtonTextColor || publishedProductHeader.buyButtonTextColor,
                    spacing: globalPublishedHeader.spacing || publishedProductHeader.spacing,
                  },
                }

                console.log("[v0] Merged global product settings into product config")
              }
            } catch (err) {
              console.error("[v0] Failed to load global product settings:", err)
            }
          }

          loadedDraft = ensureMandatoryProductSections(loadedDraft)
          loadedPublished = ensureMandatoryProductSections(loadedPublished)
        }

        setDraftConfig(loadedDraft)
        setPublishedConfig(loadedPublished)

        const wasPublished = !!data.published_at || (data.is_default && !productId)
        setHasEverBeenPublished(wasPublished)
        setSaveState(wasPublished ? "published" : "saved")

        setHistory([{ config: JSON.parse(JSON.stringify(loadedDraft)), timestamp: Date.now() }])
        setHistoryIndex(0)
      } else {
        throw new Error("Failed to load config")
      }
    } catch (error) {
      console.error("Failed to load config:", error)
      // Use createDefaultProductPageConfig() to get fresh IDs for product pages
      const defaultConfig = pageType === "shop" ? defaultShopPageConfig : createDefaultProductPageConfig()

      let configWithDefaults: PageConfig = defaultConfig

      if (pageType === "shop") {
        const featuredProductsLibraryItem = sectionLibrary.find((item) => item.type === "featured-products")
        if (featuredProductsLibraryItem) {
          const featuredProductsSection = createSectionFromLibrary(featuredProductsLibraryItem, 0)
          featuredProductsSection.locked = true
          configWithDefaults = {
            ...defaultConfig,
            headerSettings: {
              ...defaultConfig.headerSettings,
              subscribeBar: defaultSubscribeBarSettings,
            },
            sections: [featuredProductsSection],
          }
        }
      }

      if (pageType === "product") {
        // Default product config must include Reviews (locked) + More from seller
        const reviewsSection: Section = {
          id: generateSectionId(),
          type: "reviews",
          settings: defaultReviewsSettings,
          order: 0,
          locked: true,
        }
        const moreFromSellerSection: Section = {
          id: generateSectionId(),
          type: "more-from-seller",
          settings: defaultMoreFromSellerSettings,
          order: 1,
          locked: false,
        }
        configWithDefaults = {
          ...defaultConfig,
          sections: [reviewsSection, moreFromSellerSection],
        }
      }

      setDraftConfig(configWithDefaults)
      setPublishedConfig(configWithDefaults)
      setSaveState("unsaved")
      setHasEverBeenPublished(false)
      setHistory([{ config: JSON.parse(JSON.stringify(configWithDefaults)), timestamp: Date.now() }])
      setHistoryIndex(0)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig(currentPageType, selectedProductId)
  }, [currentPageType, selectedProductId, loadConfig])

  const markUnsaved = useCallback(() => {
    setSaveState("unsaved")
  }, [])

  const updateDraftConfig = useCallback(
    (config: PageConfig) => {
      // Safety: if product page, keep mandatory sections intact
      const next = currentPageType === "product" ? ensureMandatoryProductSections(config) : config
      setDraftConfig(next)
      markUnsaved()
      addToHistory(next)
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const updateSection = useCallback(
    (sectionId: string, updates: Partial<Section>) => {
      setDraftConfig((prev) => {
        const target = prev.sections.find((s) => s.id === sectionId)
        if (isLockedSection(target)) return prev

        const newConfig: PageConfig = {
          ...prev,
          sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
        }

        const next = currentPageType === "product" ? ensureMandatoryProductSections(newConfig) : newConfig
        addToHistory(next)
        return next
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const updateSectionSettings = useCallback(
    (sectionId: string, settings: any) => {
      setDraftConfig((prev) => {
        // Allow settings updates for all sections including locked ones
        const newConfig: PageConfig = {
          ...prev,
          sections: prev.sections.map((s) =>
            s.id === sectionId ? { ...s, settings: { ...s.settings, ...settings } } : s,
          ),
        }

        const next = currentPageType === "product" ? ensureMandatoryProductSections(newConfig) : newConfig
        addToHistory(next)
        return next
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const addSection = useCallback(
    (section: Section) => {
      setDraftConfig((prev) => {
        const newConfig: PageConfig = {
          ...prev,
          sections: [...prev.sections, section],
        }
        const next = currentPageType === "product" ? ensureMandatoryProductSections(newConfig) : newConfig
        addToHistory(next)
        return next
      })
      markUnsaved()
      setSelectedSectionId(section.id)
      setSidebarMode("settings")
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const removeSection = useCallback(
    (sectionId: string) => {
      setDraftConfig((prev) => {
        const target = prev.sections.find((s) => s.id === sectionId)
        if (isLockedSection(target)) return prev

        const newConfig: PageConfig = {
          ...prev,
          sections: prev.sections.filter((s) => s.id !== sectionId),
        }

        const next = currentPageType === "product" ? ensureMandatoryProductSections(newConfig) : newConfig
        addToHistory(next)
        return next
      })
      markUnsaved()
      setSelectedSectionId(null)
      setSidebarMode("sections")
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const reorderSections = useCallback(
    (sections: Section[]) => {
      setDraftConfig((prev) => {
        const newConfig: PageConfig = {
          ...prev,
          sections: sections.map((s, i) => ({ ...s, order: i })),
        }
        const next = currentPageType === "product" ? ensureMandatoryProductSections(newConfig) : newConfig
        addToHistory(next)
        return next
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved, currentPageType],
  )

  const updateHeaderSettings = useCallback(
    (settings: any) => {
      setDraftConfig((prev) => {
        const newConfig: PageConfig = {
          ...prev,
          headerSettings: { ...prev.headerSettings, ...settings },
        }
        addToHistory(newConfig)
        return newConfig
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved],
  )

  const updateGlobalSettings = useCallback(
    (settings: Partial<GlobalStoreSettings>) => {
      setDraftConfig((prev) => {
        const newConfig: PageConfig = {
          ...prev,
          globalSettings: { ...prev.globalSettings, ...settings } as GlobalStoreSettings,
        }
        addToHistory(newConfig)
        return newConfig
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved],
  )

  const applyTheme = useCallback(
    (themePreset: ThemePreset) => {
      const theme = themePresets[themePreset]
      if (!theme) return

      setDraftConfig((prev) => {
        // Update global settings with theme preset
        const newGlobalSettings: GlobalStoreSettings = {
          ...(prev.globalSettings || defaultGlobalStoreSettings),
          themePreset,
          themeColors: theme.colors,
          themeBorderRadius: theme.borderRadius,
        }

        // Apply theme to subscribe bar (shop pages)
        let newHeaderSettings = { ...prev.headerSettings }
        if (prev.pageType === "shop" && "subscribeBar" in newHeaderSettings) {
          const shopHeader = newHeaderSettings as any
          if (shopHeader.subscribeBar) {
            shopHeader.subscribeBar = {
              ...shopHeader.subscribeBar,
              // Button styling
              buttonColor: theme.subscribeBar.buttonColor,
              buttonTextColor: theme.subscribeBar.buttonTextColor,
              buttonBorderRadius: theme.subscribeBar.buttonBorderRadius ?? theme.buttonBorderRadius,
              // Input styling
              inputBorderColor: theme.subscribeBar.inputBorderColor,
              inputTextColor: theme.subscribeBar.inputTextColor,
              inputPlaceholderColor: theme.subscribeBar.inputPlaceholderColor,
              // Background and text colors (both direct and nested for compatibility)
              backgroundColor: theme.subscribeBar.backgroundColor,
              textColor: theme.subscribeBar.textColor,
              colors: {
                ...shopHeader.subscribeBar.colors,
                backgroundColor: theme.subscribeBar.backgroundColor,
                textColor: theme.subscribeBar.textColor,
              },
            }
          }
          // Apply profile ring color from theme
          if (theme.profileRingColor) {
            shopHeader.profileRingColor = theme.profileRingColor
          }
          // Apply header colors from theme sections config
          shopHeader.colors = {
            ...shopHeader.colors,
            backgroundColor: theme.sections.headerBackgroundColor,
            textColor: theme.sections.headerTextColor || theme.colors.foreground,
          }
        }

        // Apply theme to product page components
        if (prev.pageType === "product") {
          const productHeader = newHeaderSettings as any
          if (productHeader.creatorBar) {
            productHeader.creatorBar = {
              ...productHeader.creatorBar,
              backgroundColor: theme.creatorBar.backgroundColor,
              textColor: theme.creatorBar.textColor,
              buttonColor: theme.creatorBar.buttonColor,
              buttonTextColor: theme.creatorBar.buttonTextColor,
              buttonBorderRadius: theme.creatorBar.buttonBorderRadius,
            }
          }
          if (productHeader.stickyAddToCart) {
            // Calculate border color based on background - dark backgrounds get lighter borders
            const bgColor = theme.stickyAddToCart.backgroundColor
            const isDarkBg = bgColor && (bgColor.startsWith("#0") || bgColor.startsWith("#1") || bgColor.startsWith("#2"))
            const borderColor = isDarkBg ? `${theme.colors.foreground}20` : theme.colors.border || "#e5e7eb"

            productHeader.stickyAddToCart = {
              ...productHeader.stickyAddToCart,
              backgroundColor: theme.stickyAddToCart.backgroundColor,
              buttonColor: theme.stickyAddToCart.buttonColor,
              buttonTextColor: theme.stickyAddToCart.buttonTextColor,
              borderRadius: theme.stickyAddToCart.borderRadius,
              borderColor: borderColor,
              textColor: theme.stickyAddToCart.textColor || theme.colors.foreground,
            }
          }
          // Apply buy button colors and buttons border radius
          productHeader.buyButtonColor = theme.productHeader.buyButtonColor
          productHeader.buyButtonTextColor = theme.productHeader.buyButtonTextColor
          if (theme.productHeader.buttonsBorderRadius !== undefined) {
            productHeader.buttonsBorderRadius = theme.productHeader.buttonsBorderRadius
          }
          // Apply page background and text colors for product page
          productHeader.colors = {
            ...productHeader.colors,
            backgroundColor: theme.sections.pageBackgroundColor,
            textColor: theme.colors.foreground,
          }
        }

        // Apply theme to all sections
        const newSections = prev.sections.map((section) => {
          const newSection = { ...section, settings: { ...section.settings } }

          // Apply featured products section colors (including product card and category filter colors)
          if (section.type === "featured-products") {
            newSection.settings = {
              ...newSection.settings,
              colors: {
                ...newSection.settings.colors,
                backgroundColor: theme.sections.featuredProductsBackgroundColor,
                textColor: theme.sections.featuredProductsTextColor || theme.colors.foreground,
              },
              productCardColors: {
                backgroundColor: theme.productCard.backgroundColor,
                textColor: theme.productCard.textColor,
                priceColor: theme.productCard.priceColor,
                borderColor: theme.productCard.borderColor,
              },
              categoryFilterColors: {
                textColor: theme.categoryFilter.textColor,
                activeTextColor: theme.categoryFilter.activeTextColor,
                borderColor: theme.categoryFilter.borderColor,
              },
            }
          }

          // Apply more-from-seller section colors (including product card colors)
          if (section.type === "more-from-seller") {
            newSection.settings = {
              ...newSection.settings,
              colors: {
                ...newSection.settings.colors,
                backgroundColor: theme.sections.featuredProductsBackgroundColor,
                textColor: theme.sections.featuredProductsTextColor || theme.colors.foreground,
              },
              productCardColors: {
                backgroundColor: theme.productCard.backgroundColor,
                textColor: theme.productCard.textColor,
                priceColor: theme.productCard.priceColor,
                borderColor: theme.productCard.borderColor,
              },
            }
          }

          // Apply text blocks and other sections - use page background
          if (section.type === "text-block" || section.type === "image-text" || section.type === "benefits") {
            newSection.settings = {
              ...newSection.settings,
              colors: {
                ...newSection.settings.colors,
                backgroundColor: "transparent",
                textColor: theme.colors.foreground,
              },
            }
          }

          // Apply announcement bar colors
          if (section.type === "announcement-bar") {
            newSection.settings = {
              ...newSection.settings,
              colors: {
                ...newSection.settings.colors,
                backgroundColor: theme.colors.primary,
                textColor: theme.colors.foreground === "#ffffff" ? "#ffffff" : theme.colors.foreground,
              },
            }
          }

          return newSection
        })

        // Update global colors for page background
        const newGlobalColors = {
          ...prev.globalColors,
          backgroundColor: theme.sections.pageBackgroundColor,
        }

        const newConfig: PageConfig = {
          ...prev,
          globalSettings: newGlobalSettings,
          globalColors: newGlobalColors,
          headerSettings: newHeaderSettings,
          sections: newSections,
        }

        addToHistory(newConfig)
        return newConfig
      })
      markUnsaved()
    },
    [addToHistory, markUnsaved],
  )

  const openGlobalSettings = useCallback(() => {
    setSelectedSectionId(null)
    setSidebarMode("global-settings")
  }, [])

  const save = useCallback(async () => {
    console.log("[v0] Save initiated", { currentPageType, selectedProductId })
    setSaveState("saving")
    try {
      const body: any = { pageType: currentPageType, config: draftConfig }

      if (selectedProductId && currentPageType === "product") {
        body.productId = selectedProductId
        console.log("[v0] Saving product-specific config", {
          productId: selectedProductId,
          sections: draftConfig.sections.length,
        })

        // ALSO save global settings (creator bar, sticky, buy button, spacing) to default product template
        // These settings should apply to ALL product pages
        const productHeader = draftConfig.headerSettings as any
        const baseProductConfig = createDefaultProductPageConfig()
        const globalProductSettings = {
          pageType: "product",
          config: {
            ...baseProductConfig,
            headerSettings: {
              ...baseProductConfig.headerSettings,
              creatorBar: productHeader.creatorBar,
              stickyAddToCart: productHeader.stickyAddToCart,
              buyButtonColor: productHeader.buyButtonColor,
              buyButtonTextColor: productHeader.buyButtonTextColor,
              spacing: productHeader.spacing,
            },
          },
        }

        // Save global settings to default template (without productId)
        console.log("[v0] Also saving global product settings to default template")
        const globalResponse = await fetch("/api/store-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(globalProductSettings),
        })

        if (!globalResponse.ok) {
          console.error("[v0] Failed to save global product settings, continuing...")
        } else {
          console.log("[v0] Global product settings saved successfully")
        }
      } else {
        console.log("[v0] Saving default template", { sections: draftConfig.sections.length })
      }

      console.log("[v0] Sending save request to API", body)

      const response = await fetch("/api/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[v0] Save failed", errorData)
        throw new Error(errorData.error || "Failed to save")
      }

      const result = await response.json()
      console.log("[v0] Save successful", result)

      await new Promise((resolve) => setTimeout(resolve, 500))
      setSaveState("saved")
    } catch (error) {
      console.error("[v0] Save error", error)
      setSaveState("unsaved")
      throw error
    }
  }, [currentPageType, draftConfig, selectedProductId])

  const publish = useCallback(async () => {
    console.log("[v0] Publish initiated", { currentPageType, selectedProductId })
    setSaveState("publishing")
    try {
      const saveBody: any = { pageType: currentPageType, config: draftConfig }
      if (selectedProductId && currentPageType === "product") {
        saveBody.productId = selectedProductId
        console.log("[v0] Publishing product-specific config", {
          productId: selectedProductId,
          sections: draftConfig.sections.length,
        })

        // ALSO save and publish global settings (creator bar, sticky, buy button, spacing) to default product template
        const productHeader = draftConfig.headerSettings as any
        const baseProductConfigForPublish = createDefaultProductPageConfig()
        const globalProductSettings = {
          pageType: "product",
          config: {
            ...baseProductConfigForPublish,
            headerSettings: {
              ...baseProductConfigForPublish.headerSettings,
              creatorBar: productHeader.creatorBar,
              stickyAddToCart: productHeader.stickyAddToCart,
              buyButtonColor: productHeader.buyButtonColor,
              buyButtonTextColor: productHeader.buyButtonTextColor,
              spacing: productHeader.spacing,
            },
          },
        }

        // Save global settings to default template (without productId)
        console.log("[v0] Also saving global product settings to default template")
        await fetch("/api/store-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(globalProductSettings),
        })

        // Also publish the default template
        await fetch("/api/store-builder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageType: "product" }),
        })
        console.log("[v0] Global product settings published")
      } else {
        console.log("[v0] Publishing default template", { sections: draftConfig.sections.length })
      }

      console.log("[v0] Saving draft before publish", saveBody)

      const saveResponse = await fetch("/api/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveBody),
      })

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json()
        console.error("[v0] Save before publish failed", errorData)
        throw new Error(errorData.error || "Failed to save before publishing")
      }

      const saveResult = await saveResponse.json()
      console.log("[v0] Draft saved before publish", saveResult)

      const publishBody: any = { pageType: currentPageType }
      if (selectedProductId && currentPageType === "product") {
        publishBody.productId = selectedProductId
      }

      console.log("[v0] Sending publish request", publishBody)

      const response = await fetch("/api/store-builder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[v0] Publish failed", errorData)
        throw new Error(errorData.error || "Failed to publish")
      }

      const publishResult = await response.json()
      console.log("[v0] Publish successful", publishResult)

      setPublishedConfig(draftConfig)
      setHasEverBeenPublished(true)
      await new Promise((resolve) => setTimeout(resolve, 500))
      setSaveState("published")
    } catch (error) {
      console.error("[v0] Publish error", error)
      setSaveState("saved")
      throw error
    }
  }, [currentPageType, draftConfig, selectedProductId])

  const discardChanges = useCallback(() => {
    setDraftConfig(publishedConfig)
    setSaveState(hasEverBeenPublished ? "published" : "saved")
    setSelectedSectionId(null)
    setSidebarMode("sections")
  }, [publishedConfig, hasEverBeenPublished])

  const handleSetCurrentPageType = useCallback(
    (pageType: PageType) => {
      setCurrentPageType(pageType)
      if (pageType === "shop") {
        setSelectedProductIdState(null)
        updateURL(pageType, null)
      } else {
        updateURL(pageType, selectedProductId)
      }
      setSelectedSectionId(null)
      setSidebarMode("sections")
    },
    [selectedProductId, updateURL],
  )

  const setSelectedProductId = useCallback(
    (id: string | null) => {
      setSelectedProductIdState(id)
      updateURL(currentPageType, id)
      setSelectedSectionId(null)
      setSidebarMode("sections")
    },
    [currentPageType, updateURL],
  )

  const handleSetSelectedSectionId = useCallback((id: string | null) => {
    setSelectedSectionId(id)
    if (id) {
      setSidebarMode("settings")
    }
  }, [])

  const goBackToSections = useCallback(() => {
    setSelectedSectionId(null)
    setSelectedElement(null)
    setSidebarMode("sections")
  }, [])

  const openAddSectionModal = useCallback(() => {
    setAddSectionModalOpen(true)
  }, [])

  const closeAddSectionModal = useCallback(() => {
    setAddSectionModalOpen(false)
  }, [])

  const saveAsTemplate = useCallback(
    async (name: string) => {
      const newTemplate: ProductTemplate = {
        id: `template_${Date.now()}`,
        name,
        config: JSON.parse(JSON.stringify(draftConfig)),
        isDefault: false,
        productIds: selectedProductId ? [selectedProductId] : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setTemplates((prev) => [...prev, newTemplate])
    },
    [draftConfig, selectedProductId],
  )

  const selectTemplate = useCallback(
    (templateId: string | null) => {
      setSelectedTemplateId(templateId)
      if (templateId) {
        const template = templates.find((t) => t.id === templateId)
        if (template) {
          const next = currentPageType === "product" ? ensureMandatoryProductSections(template.config) : template.config
          setDraftConfig(JSON.parse(JSON.stringify(next)))
          markUnsaved()
        }
      }
    },
    [templates, markUnsaved, currentPageType],
  )

  const assignTemplateToProducts = useCallback(async (templateId: string, productIds: string[]) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? { ...t, productIds: [...new Set([...t.productIds, ...productIds])], updatedAt: new Date().toISOString() }
          : t,
      ),
    )
  }, [])

  return (
    <StoreBuilderContext.Provider
      value={{
        currentPageType,
        draftConfig,
        publishedConfig,
        selectedSectionId,
        selectedElement,
        previewDevice,
        isLoading,
        addSectionModalOpen,
        canUndo,
        canRedo,
        sidebarMode,
        selectedProductId,
        products,
        saveState,
        hasEverBeenPublished,
        templates,
        selectedTemplateId,
        isEditingProductTemplate,
        showProductModeSelector,
        setCurrentPageType: handleSetCurrentPageType,
        setSelectedSectionId: handleSetSelectedSectionId,
        setSelectedElement,
        setPreviewDevice,
        updateDraftConfig,
        updateSection,
        updateSectionSettings,
        addSection,
        removeSection,
        reorderSections,
        updateHeaderSettings,
        updateGlobalSettings,
        applyTheme,
        openGlobalSettings,
        save,
        publish,
        discardChanges,
        loadConfig,
        openAddSectionModal,
        closeAddSectionModal,
        undo,
        redo,
        setSidebarMode,
        goBackToSections,
        setSelectedProductId,
        setProducts,
        saveAsTemplate,
        selectTemplate,
        assignTemplateToProducts,
        setIsEditingProductTemplate,
        setShowProductModeSelector,
      }}
    >
      {children}
    </StoreBuilderContext.Provider>
  )
}
