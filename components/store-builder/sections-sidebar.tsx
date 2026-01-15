"use client"

import type React from "react"
import { useStoreBuilder } from "./store-builder-context"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ImageUpload } from "@/components/app/image-upload"
import { CoverImageEditor } from "./cover-image-editor"
import { AvatarCropper } from "./avatar-cropper"
import { CoverImageLibraryModal } from "./cover-image-library-modal"
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Home,
  Layout,
  ListChecks,
  Type,
  Megaphone,
  Grid,
  ImageIcon,
  FileText,
  Plus,
  ChevronLeft,
  Move,
  Package,
  ShoppingBag,
  Pencil,
  User,
  X,
  Mail,
  AlertCircle,
  ShoppingCart,
  Star,
  Settings,
  Palette,
  Globe,
  BadgeCheck,
  Info,
} from "lucide-react"
import type {
  Section,
  SectionType,
  ShopHeaderSettings,
  ProductHeaderSettings,
  ImageTextSettings,
  BenefitsSettings,
  TextBlockSettings,
  AnnouncementBarSettings,
  FeaturedProductsSettings,
  MoreFromSellerSettings,
  SubscribeBarSettings,
  SpacingConfig,
  ColorConfig,
  AvatarSizeChoice,
  SocialLinksConfig,
  ProductCreatorBarSettings,
  StickyAddToCartSettings,
  ReviewsSettings,
  GlobalStoreSettings,
  ThemePreset,
  VerifiedBadgeType,
} from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useEffect, useRef, useState } from "react"
import {
  defaultSubscribeBarSettings,
  avatarSizeMap,
  defaultProductCreatorBarSettings,
  defaultStickyAddToCartSettings,
  defaultGlobalStoreSettings,
  themePresets,
  verifiedBadgeLabels,
} from "@/lib/store-builder/defaults"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search, Check, ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"

const sectionIcons: Record<
  | SectionType
  | "header"
  | "product-content"
  | "more-from-seller"
  | "subscribe-bar"
  | "creator-bar"
  | "sticky-add-to-cart",
  React.ReactNode
> = {
  header: <Layout className="h-5 w-5" />,
  "product-content": <Package className="h-5 w-5" />,
  "more-from-seller": <ShoppingBag className="h-5 w-5" />,
  "subscribe-bar": <Mail className="h-5 w-5" />,
  "creator-bar": <User className="h-5 w-5" />,
  "sticky-add-to-cart": <ShoppingCart className="h-5 w-5" />,
  "image-text": <ImageIcon className="h-5 w-5" />,
  benefits: <ListChecks className="h-5 w-5" />,
  "text-block": <Type className="h-5 w-5" />,
  "announcement-bar": <Megaphone className="h-5 w-5" />,
  "featured-products": <Grid className="h-5 w-5" />,
  "custom-html": <FileText className="h-5 w-5" />,
  reviews: <Star className="h-5 w-5" />,
}

const sectionNames: Record<
  | SectionType
  | "header"
  | "product-content"
  | "more-from-seller"
  | "subscribe-bar"
  | "creator-bar"
  | "sticky-add-to-cart",
  string
> = {
  header: "Header",
  "product-content": "Product Content",
  "more-from-seller": "More from Seller",
  "subscribe-bar": "Subscribe Bar",
  "creator-bar": "Creator Bar",
  "sticky-add-to-cart": "Sticky Add to Cart",
  "image-text": "Image + Text",
  benefits: "Benefits",
  "text-block": "Text Block",
  "announcement-bar": "Announcement",
  "featured-products": "Featured Products",
  "custom-html": "Custom HTML",
  reviews: "Reviews",
}

interface SortableSectionItemProps {
  section: Section
  isSelected: boolean
  onSelect: () => void
  onToggleVisibility: () => void
  onDelete: () => void
}

function SortableSectionItem({
  section,
  isSelected,
  onSelect,
  onToggleVisibility,
  onDelete,
}: SortableSectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-all cursor-pointer",
        isSelected ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20" : "border-transparent hover:bg-muted/50",
        isDragging && "opacity-50 shadow-lg",
        !section.settings.visible && section.type !== "reviews" && "opacity-50",
      )}
      onClick={onSelect}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
          isSelected ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400" : "bg-muted text-muted-foreground",
        )}
      >
        {sectionIcons[section.type]}
      </span>

      <span className="flex-1 truncate text-sm font-medium">{sectionNames[section.type]}</span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Reviews must always be present (cannot be hidden) */}
        {section.type !== "reviews" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility()
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={section.settings.visible ? "Hide section" : "Show section"}
          >
            {section.settings.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}

        {!section.locked && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete section"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export function SectionsSidebar({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const {
    currentPageType,
    draftConfig,
    selectedSectionId,
    setSelectedSectionId,
    updateSectionSettings,
    updateHeaderSettings,
    updateGlobalSettings,
    applyTheme,
    openGlobalSettings,
    removeSection,
    reorderSections,
    openAddSectionModal,
    sidebarMode,
    goBackToSections,
    selectedProductId,
    setSelectedProductId,
    setCurrentPageType,
    setIsEditingProductTemplate,
    products,
    isEditingProductTemplate,
  } = useStoreBuilder()

  const [showProductSelector, setShowProductSelector] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState("")

  // ✅ Safety: if old configs ever saved Reviews as hidden, force it back on.
  useEffect(() => {
    const reviews = draftConfig.sections.find((s) => s.type === "reviews")
    if (reviews && !reviews.settings.visible) {
      updateSectionSettings(reviews.id, { visible: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftConfig.sections])

  const filteredProducts = products.filter((p: any) => 
    p.title.toLowerCase().includes(productSearchQuery.toLowerCase())
  )

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleSelectProductForEdit = (productId: string) => {
    setCurrentPageType("product")
    setSelectedProductId(productId)
    setIsEditingProductTemplate(true)
    router.replace(`/store-builder?pageType=product&productId=${productId}`, { scroll: false })
    setShowProductSelector(false)
    setProductSearchQuery("")
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = draftConfig.sections.findIndex((s) => s.id === active.id)
      const newIndex = draftConfig.sections.findIndex((s) => s.id === over.id)
      const newSections = arrayMove(draftConfig.sections, oldIndex, newIndex)
      reorderSections(newSections)
    }
  }

  const handleToggleVisibility = (section: Section) => {
    // Reviews is mandatory (can't be hidden)
    if (section.type === "reviews") return
    updateSectionSettings(section.id, { visible: !section.settings.visible })
  }

  const pageTitle = currentPageType === "shop" ? "Home Page" : "Product Page"
  const selectedProduct = products.find((p) => p.id === selectedProductId)
  const pageSubtitle =
    currentPageType === "shop"
      ? "All Products"
      : isEditingProductTemplate && selectedProduct
        ? selectedProduct.title
        : "Default Template"

  const selectedSection = draftConfig.sections.find((s) => s.id === selectedSectionId)
  const selectedSectionType = selectedSection?.type

  // Get subscribe bar settings for shop pages (with fallback to defaults)
  const subscribeBarSettings =
    currentPageType === "shop"
      ? (draftConfig.headerSettings as ShopHeaderSettings).subscribeBar || defaultSubscribeBarSettings
      : null

  // Get product page specific settings (creator bar and sticky add to cart)
  const productCreatorBarSettings =
    currentPageType === "product"
      ? (draftConfig.headerSettings as ProductHeaderSettings).creatorBar || defaultProductCreatorBarSettings
      : null

  const stickyAddToCartSettings =
    currentPageType === "product"
      ? (draftConfig.headerSettings as ProductHeaderSettings).stickyAddToCart || defaultStickyAddToCartSettings
      : null

  const headerSettings = draftConfig.headerSettings
  const globalSettings = draftConfig.globalSettings || defaultGlobalStoreSettings

  // Global Settings Panel
  if (sidebarMode === "global-settings") {
    return (
      <div className="w-80 border-r border-border bg-background overflow-hidden flex flex-col h-full">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0 bg-background">
          <button onClick={goBackToSections} className="rounded p-1.5 hover:bg-muted transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="font-semibold">Settings</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="w-full justify-start px-4 pt-4 pb-0 bg-transparent border-b rounded-none h-auto flex-wrap gap-1">
              <TabsTrigger value="basic" className="text-xs px-3 py-1.5 data-[state=active]:bg-muted rounded-md">
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="seo" className="text-xs px-3 py-1.5 data-[state=active]:bg-muted rounded-md">
                SEO
              </TabsTrigger>
              <TabsTrigger value="badge" className="text-xs px-3 py-1.5 data-[state=active]:bg-muted rounded-md">
                Verified Badge
              </TabsTrigger>
              <TabsTrigger value="theme" className="text-xs px-3 py-1.5 data-[state=active]:bg-muted rounded-md">
                Theme Color
              </TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">Store Name</Label>
                <Input
                  id="store-name"
                  value={globalSettings.storeName || ""}
                  onChange={(e) => updateGlobalSettings({ storeName: e.target.value })}
                  placeholder="My Store"
                />
                <p className="text-xs text-muted-foreground">This appears as your store's title</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-tagline">Tagline</Label>
                <Input
                  id="store-tagline"
                  value={globalSettings.storeTagline || ""}
                  onChange={(e) => updateGlobalSettings({ storeTagline: e.target.value })}
                  placeholder="Your store's tagline"
                />
                <p className="text-xs text-muted-foreground">A short description of your store</p>
              </div>
            </TabsContent>

            {/* SEO Tab */}
            <TabsContent value="seo" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="seo-title">Store Title</Label>
                <Input
                  id="seo-title"
                  value={globalSettings.seoTitle || ""}
                  onChange={(e) => updateGlobalSettings({ seoTitle: e.target.value })}
                  placeholder="Store Title for Search Engines"
                />
                <p className="text-xs text-muted-foreground">Appears in search results and browser tabs</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-description">Meta Description</Label>
                <Textarea
                  id="meta-description"
                  value={globalSettings.seoDescription || ""}
                  onChange={(e) => updateGlobalSettings({ seoDescription: e.target.value })}
                  placeholder="Describe your store for search engines..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  {(globalSettings.seoDescription || "").length}/160 characters recommended
                </p>
              </div>

              <div className="space-y-2">
                <Label>Social Image</Label>
                <ImageUpload
                  value={globalSettings.socialImageUrl || ""}
                  onChange={(url) => updateGlobalSettings({ socialImageUrl: url })}
                  folder={`store-builder/${creatorId}/social`}
                />
                <p className="text-xs text-muted-foreground">
                  Used when your store is shared on social media (1200x630 recommended)
                </p>
              </div>

              {globalSettings.socialImageUrl && (
                <div className="space-y-2">
                  <Label>Social Image Preview</Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <img
                      src={globalSettings.socialImageUrl}
                      alt="Social preview"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Verified Badge Tab */}
            <TabsContent value="badge" className="p-4 space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="space-y-1">
                  <h4 className="font-medium">Verified Badge</h4>
                  <p className="text-sm text-muted-foreground">
                    Show a verification badge next to your name
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="badge-enabled" className="text-sm font-medium">Enable Verified Badge</Label>
                    <p className="text-xs text-muted-foreground">
                      Display a blue checkmark next to your page name
                    </p>
                  </div>
                  <Switch
                    id="badge-enabled"
                    checked={globalSettings.verifiedBadgeEnabled}
                    onCheckedChange={(checked) => updateGlobalSettings({ verifiedBadgeEnabled: checked })}
                  />
                </div>
              </div>

              {globalSettings.verifiedBadgeEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>Badge Type</Label>
                    <Select
                      value={globalSettings.verifiedBadgeType}
                      onValueChange={(value) => updateGlobalSettings({ verifiedBadgeType: value as VerifiedBadgeType })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(verifiedBadgeLabels) as VerifiedBadgeType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              <BadgeCheck className={cn(
                                "h-4 w-4",
                                type === globalSettings.verifiedBadgeType ? "text-blue-500" : "text-muted-foreground"
                              )} />
                              {verifiedBadgeLabels[type]}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This text appears when hovering over the badge
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <Label className="text-xs text-muted-foreground">Preview</Label>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{globalSettings.storeName || "Your Store"}</span>
                      <BadgeCheck className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Theme Color Tab */}
            <TabsContent value="theme" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Theme Preset</Label>
                <p className="text-xs text-muted-foreground">
                  Choose a theme to change colors across your entire store
                </p>
              </div>

              <div className="grid gap-3">
                {(Object.keys(themePresets) as ThemePreset[]).map((preset) => {
                  const theme = themePresets[preset]
                  const isSelected = globalSettings.themePreset === preset
                  return (
                    <button
                      key={preset}
                      onClick={() => applyTheme(preset)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-all text-left",
                        isSelected
                          ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      {/* Color preview dots */}
                      <div className="flex gap-1 mt-1 shrink-0">
                        <div
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: theme.colors.primary }}
                        />
                        <div
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: theme.colors.background }}
                        />
                        <div
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: theme.colors.foreground }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{theme.name}</span>
                          {isSelected && (
                            <div className="h-4 w-4 rounded-full bg-sky-500 flex items-center justify-center">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-4">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-medium">Note about custom colors</p>
                    <p className="mt-1">
                      Theme colors apply globally, but any custom colors you set on individual sections will override the theme.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  if (sidebarMode === "settings" && selectedSectionId) {
    return (
      <div className="w-80 border-r border-border bg-background overflow-hidden flex flex-col h-full">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0 bg-background">
          <button onClick={goBackToSections} className="rounded p-1.5 hover:bg-muted transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <h3 className="font-semibold truncate">
            {selectedSectionId === "subscribe-bar"
              ? "Subscribe Bar"
              : selectedSectionId === "creator-bar"
                ? "Creator Bar"
                : selectedSectionId === "sticky-add-to-cart"
                  ? "Sticky Add to Cart"
                  : selectedSectionId === "header"
                    ? "Header"
                    : selectedSectionId === "product-content"
                      ? "Product Content"
                      : selectedSectionType
                        ? sectionNames[selectedSectionType]
                        : "Section Settings"}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {selectedSectionId === "subscribe-bar" && currentPageType === "shop" && subscribeBarSettings ? (
              <SubscribeBarSettingsForm
                settings={subscribeBarSettings}
                onChange={(settings) =>
                  updateHeaderSettings({
                    subscribeBar: { ...subscribeBarSettings, ...settings },
                  })
                }
              />
            ) : selectedSectionId === "creator-bar" && currentPageType === "product" && productCreatorBarSettings ? (
              <ProductCreatorBarSettingsForm
                settings={productCreatorBarSettings}
                onChange={(settings) =>
                  updateHeaderSettings({
                    creatorBar: { ...productCreatorBarSettings, ...settings },
                  })
                }
              />
            ) : selectedSectionId === "sticky-add-to-cart" &&
              currentPageType === "product" &&
              stickyAddToCartSettings ? (
              <StickyAddToCartSettingsForm
                settings={stickyAddToCartSettings}
                onChange={(settings) =>
                  updateHeaderSettings({
                    stickyAddToCart: { ...stickyAddToCartSettings, ...settings },
                  })
                }
              />
            ) : selectedSectionId === "header" && currentPageType === "shop" ? (
              <ShopHeaderSettingsForm
                settings={draftConfig.headerSettings as ShopHeaderSettings}
                onChange={updateHeaderSettings}
                creatorId={creatorId}
              />
            ) : selectedSectionId === "product-content" && currentPageType === "product" ? (
              <ProductHeaderSettingsForm
                settings={draftConfig.headerSettings as ProductHeaderSettings}
                onChange={updateHeaderSettings}
                productId={selectedProductId}
              />
            ) : selectedSectionType === "more-from-seller" && selectedSection ? (
              <MoreFromSellerSettingsForm
                settings={selectedSection.settings as MoreFromSellerSettings}
                onChange={(settings) => updateSectionSettings(selectedSectionId, settings)}
              />
            ) : selectedSectionType === "reviews" && selectedSection ? (
              <ReviewsSettingsForm
                settings={selectedSection.settings as ReviewsSettings}
                onChange={(settings) => updateSectionSettings(selectedSectionId, settings)}
              />
            ) : selectedSection ? (
              <SectionSettingsForm
                section={selectedSection}
                onChange={(settings) => updateSectionSettings(selectedSectionId, settings)}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <p>Select a section to edit its settings</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 border-r border-border bg-background overflow-hidden flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 shrink-0 bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Home className="h-3.5 w-3.5" />
          <span className="uppercase tracking-wider">{pageTitle}</span>
        </div>
        {/* Product page: show product name with switcher button */}
        {currentPageType === "product" ? (
          <button
            onClick={() => setShowProductSelector(true)}
            className="mt-1 w-full flex items-center justify-between gap-2 group hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
          >
            <span className="text-base font-semibold truncate">{pageSubtitle}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </button>
        ) : (
          <h2 className="mt-1 text-base font-semibold truncate">{pageSubtitle}</h2>
        )}
      </div>

      {/* Product Selector Modal */}
      <Dialog open={showProductSelector} onOpenChange={setShowProductSelector}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden w-[95vw] h-[85vh] sm:w-full sm:max-w-md sm:h-auto sm:max-h-[80vh]">
          <DialogHeader className="px-4 sm:px-5 py-4 border-b border-border shrink-0">
            <DialogTitle>Select a Product to Edit</DialogTitle>
            <DialogDescription>Choose a product to customize its page design</DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="px-4 sm:px-5 py-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-3 space-y-2">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-8 w-8 mx-auto mb-3 opacity-50 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No products found</p>
                </div>
              ) : (
                filteredProducts.map((product: any) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProductForEdit(product.id)}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg border p-3 text-left transition-all",
                      selectedProductId === product.id
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <Avatar className="h-10 w-10 rounded-lg shrink-0">
                      <AvatarImage src={product.thumbnail_url || "/placeholder.svg"} className="object-cover" />
                      <AvatarFallback className="rounded-lg">
                        <Package className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.title}</p>
                      <p className="text-xs text-muted-foreground">{formatPrice(product.price_cents || 0)}</p>
                    </div>
                    {selectedProductId === product.id && (
                      <div className="h-5 w-5 rounded-full bg-sky-500 flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-5 py-3 border-t border-border shrink-0 bg-background">
            <Button variant="outline" onClick={() => setShowProductSelector(false)} className="w-full">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-1">
          {/* Subscribe Bar - only for shop page, appears above header */}
          {currentPageType === "shop" && (
            <div
              className={cn(
                "group flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                selectedSectionId === "subscribe-bar"
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                  : "border-transparent hover:bg-muted/50",
              )}
              onClick={() => setSelectedSectionId("subscribe-bar")}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                  selectedSectionId === "subscribe-bar"
                    ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Mail className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-medium">Subscribe Bar</span>

              {/* Eye icon to toggle visibility */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const currentSettings =
                    (draftConfig.headerSettings as ShopHeaderSettings).subscribeBar || defaultSubscribeBarSettings
                  updateHeaderSettings({
                    subscribeBar: { ...currentSettings, visible: !currentSettings.visible },
                  })
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
              >
                {((draftConfig.headerSettings as ShopHeaderSettings).subscribeBar?.visible ?? true) ? (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          )}

          {/* Header - shop page */}
          {currentPageType === "shop" && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                selectedSectionId === "header"
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                  : "border-transparent hover:bg-muted/50",
              )}
              onClick={() => setSelectedSectionId("header")}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                  selectedSectionId === "header"
                    ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Layout className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-medium">Header</span>
            </div>
          )}

          {/* Product page pinned blocks */}
          {currentPageType === "product" && (
            <>
              {/* Creator Bar - first, toggleable */}
              <div
                className={cn(
                  "group flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                  selectedSectionId === "creator-bar"
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                    : "border-transparent hover:bg-muted/50",
                  !productCreatorBarSettings?.visible && "opacity-50",
                )}
                onClick={() => setSelectedSectionId("creator-bar")}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                    selectedSectionId === "creator-bar"
                      ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <User className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-medium">Creator Bar</span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const currentSettings =
                        (draftConfig.headerSettings as ProductHeaderSettings).creatorBar ||
                        defaultProductCreatorBarSettings
                      updateHeaderSettings({
                        creatorBar: { ...currentSettings, visible: !currentSettings.visible },
                      })
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={productCreatorBarSettings?.visible ? "Hide creator bar" : "Show creator bar"}
                  >
                    {productCreatorBarSettings?.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Sticky Add to Cart - second, hideable but not removable */}
              <div
                className={cn(
                  "group flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                  selectedSectionId === "sticky-add-to-cart"
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                    : "border-transparent hover:bg-muted/50",
                  stickyAddToCartSettings && !stickyAddToCartSettings.visible && "opacity-50",
                )}
                onClick={() => setSelectedSectionId("sticky-add-to-cart")}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                    selectedSectionId === "sticky-add-to-cart"
                      ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <ShoppingCart className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-medium">Sticky Add to Cart</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const currentSettings =
                        (draftConfig.headerSettings as ProductHeaderSettings).stickyAddToCart ||
                        defaultStickyAddToCartSettings
                      updateHeaderSettings({
                        stickyAddToCart: { ...currentSettings, visible: !currentSettings.visible },
                      })
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={stickyAddToCartSettings?.visible ? "Hide sticky add to cart" : "Show sticky add to cart"}
                  >
                    {stickyAddToCartSettings?.visible !== false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Product Content - third */}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                  selectedSectionId === "product-content"
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                    : "border-transparent hover:bg-muted/50",
                )}
                onClick={() => setSelectedSectionId("product-content")}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                    selectedSectionId === "product-content"
                      ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Package className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-medium">Product Content</span>
                <span className="text-xs text-muted-foreground">Locked</span>
              </div>

              {/* ✅ REMOVED: old fake "reviews-section" locked card */}
            </>
          )}

          {/* Real draggable sections list (Reviews lives here like a normal section) */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draftConfig.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {draftConfig.sections.map((section) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  isSelected={selectedSectionId === section.id}
                  onSelect={() => setSelectedSectionId(section.id)}
                  onToggleVisibility={() => handleToggleVisibility(section)}
                  onDelete={() => removeSection(section.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div className="border-t border-border p-3 shrink-0 bg-background space-y-2">
        <button
          onClick={openAddSectionModal}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/20 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add section
        </button>
        <button
          onClick={openGlobalSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  )
}

// ============================================
// Settings Forms
// ============================================

function FocalPointSelector({
  value,
  onChange,
  imageUrl,
}: {
  value: { x: number; y: number }
  onChange: (point: { x: number; y: number }) => void
  imageUrl?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
    onChange({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-normal flex items-center gap-2">
        <Move className="h-3.5 w-3.5" />
        Focal Point
      </Label>
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative aspect-video rounded-lg overflow-hidden bg-muted cursor-crosshair border border-border"
      >
        {imageUrl ? (
          <img src={imageUrl || "/placeholder.svg"} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No image</div>
        )}
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-lg bg-sky-500"
          style={{ left: `${value.x}%`, top: `${value.y}%` }}
        />
        <div className="absolute w-full h-px bg-white/50" style={{ top: `${value.y}%` }} />
        <div className="absolute h-full w-px bg-white/50" style={{ left: `${value.x}%` }} />
      </div>
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span>X: {value.x}%</span>
        <span>Y: {value.y}%</span>
      </div>
    </div>
  )
}

function ShopHeaderSettingsForm({
  settings,
  onChange,
  creatorId,
}: {
  settings: ShopHeaderSettings
  onChange: (settings: Partial<ShopHeaderSettings>) => void
  creatorId: string
}) {
  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const [avatarCropperOpen, setAvatarCropperOpen] = useState(false)
  const [coverLibraryOpen, setCoverLibraryOpen] = useState(false)

  const handleCoverSave = (imageUrl: string, focalPoint: { x: number; y: number }) => {
    onChange({ coverImageUrl: imageUrl, coverFocalPoint: focalPoint })
  }

  const handleLibrarySelect = (imageUrl: string) => {
    onChange({ coverImageUrl: imageUrl, coverFocalPoint: { x: 50, y: 50 } })
  }

  const handleRemoveCover = () => {
    onChange({ coverImageUrl: undefined, coverFocalPoint: { x: 50, y: 50 } })
  }

  const handleRemoveAvatar = () => {
    onChange({ avatarUrl: "" })
  }

  const handleAvatarSave = (avatarUrl: string) => {
    onChange({ avatarUrl })
  }

  const handleAvatarSizeChoice = (choice: AvatarSizeChoice, isMobile: boolean) => {
    const size = avatarSizeMap[choice]
    if (isMobile) {
      onChange({ mobileAvatarSizeChoice: choice, mobileAvatarSize: size })
    } else {
      onChange({ avatarSizeChoice: choice, avatarSize: size })
    }
  }

  const validateSocialUrl = (platform: keyof SocialLinksConfig, url: string): string | null => {
    if (!url) return null
    const patterns: Record<keyof SocialLinksConfig, RegExp> = {
      instagram: /instagram\.com/i,
      tiktok: /tiktok\.com/i,
      youtube: /youtube\.com|youtu\.be/i,
      twitter: /x\.com|twitter\.com/i,
      spotify: /spotify\.com/i,
    }
    if (!patterns[platform].test(url)) {
      const platformNames: Record<keyof SocialLinksConfig, string> = {
        instagram: "Instagram",
        tiktok: "TikTok",
        youtube: "YouTube",
        twitter: "X (Twitter)",
        spotify: "Spotify",
      }
      return `URL doesn't appear to be a ${platformNames[platform]} link`
    }
    return null
  }

  // Initialize social links if not present
  const socialLinks: SocialLinksConfig = settings.socialLinks || {
    instagram: { enabled: true, url: "" },
    tiktok: { enabled: true, url: "" },
    youtube: { enabled: true, url: "" },
    twitter: { enabled: true, url: "" },
    spotify: { enabled: false, url: "" },
  }

  const handleSocialLinkChange = (
    platform: keyof SocialLinksConfig,
    field: "enabled" | "url",
    value: boolean | string,
  ) => {
    const newSocialLinks = {
      ...socialLinks,
      [platform]: {
        ...socialLinks[platform],
        [field]: value,
      },
    }
    onChange({ socialLinks: newSocialLinks })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover Image</h4>

        {settings.coverImageUrl ? (
          <div className="space-y-3">
            <div
              className="relative aspect-[3/1] rounded-lg overflow-hidden border border-border cursor-pointer group"
              onClick={() => setCoverEditorOpen(true)}
            >
              <img
                src={settings.coverImageUrl || "/placeholder.svg"}
                alt="Cover"
                className="w-full h-full object-cover"
                style={{
                  objectPosition: settings.coverFocalPoint
                    ? `${settings.coverFocalPoint.x}% ${settings.coverFocalPoint.y}%`
                    : "center",
                  filter: `brightness(${settings.coverBrightness ?? 1.0})`,
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-2 shadow-lg">
                  <Pencil className="h-4 w-4 text-gray-700" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Brightness</Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round((settings.coverBrightness ?? 1.0) * 100)}%
                </span>
              </div>
              <Slider
                value={[(settings.coverBrightness ?? 1.0) * 100]}
                onValueChange={([value]) => onChange({ coverBrightness: value / 100 })}
                min={70}
                max={130}
                step={5}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-transparent"
                onClick={() => setCoverEditorOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit Position
              </Button>
              <Button variant="outline" size="sm" onClick={handleRemoveCover}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full bg-transparent"
              onClick={() => setCoverLibraryOpen(true)}
            >
              Choose From Library
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="aspect-[3/1] rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors"
              onClick={() => setCoverEditorOpen(true)}
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Add Cover Image</p>
              <p className="text-xs text-muted-foreground">Click to upload and position</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full bg-transparent"
              onClick={() => setCoverLibraryOpen(true)}
            >
              Choose From Library
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile Picture</h4>

        <div className="flex items-center gap-4">
          <div
            className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border cursor-pointer group shrink-0"
            onClick={() => setAvatarCropperOpen(true)}
          >
            {settings.avatarUrl ? (
              <>
                <img
                  src={settings.avatarUrl || "/placeholder.svg"}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1.5 shadow-lg">
                    <Pencil className="h-3 w-3 text-gray-700" />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center group-hover:bg-gray-300 transition-colors">
                <User className="h-8 w-8 text-gray-400" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-transparent"
              onClick={() => setAvatarCropperOpen(true)}
            >
              {settings.avatarUrl ? "Change Photo" : "Upload Photo"}
            </Button>

            {settings.avatarUrl && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleRemoveAvatar}>
                Remove
              </Button>
            )}

            <p className="text-xs text-muted-foreground">{settings.avatarUrl ? "Click avatar to edit" : "Shows initials if empty"}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-normal">Desktop Size</Label>
            <div className="flex gap-1">
              {(["small", "medium", "large"] as AvatarSizeChoice[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleAvatarSizeChoice(size, false)}
                  className={cn(
                    "flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors capitalize",
                    (settings.avatarSizeChoice || "medium") === size
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-normal">Mobile Size</Label>
            <div className="flex gap-1">
              {(["small", "medium", "large"] as AvatarSizeChoice[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleAvatarSizeChoice(size, true)}
                  className={cn(
                    "flex-1 py-2 px-3 text-sm font-medium rounded-md border transition-colors capitalize",
                    (settings.mobileAvatarSizeChoice || "medium") === size
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social Media</h4>

        <ToggleField
          label="Show Social Media"
          checked={settings.showSocialMedia ?? false}
          onChange={(checked) => onChange({ showSocialMedia: checked })}
          description="Display social media icons on your cover image"
        />

        {settings.showSocialMedia && (
          <div className="space-y-4 pt-2">
            <ToggleField
              label="Enable Social Icons on Mobile"
              checked={settings.showSocialIconsOnMobile ?? true}
              onChange={(checked) => onChange({ showSocialIconsOnMobile: checked })}
              description="Show social media icons on mobile devices"
            />

            <div className="space-y-2">
              <Label className="text-sm font-normal">Icon Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={settings.socialMediaIconColor || "#ffffff"}
                  onChange={(e) => onChange({ socialMediaIconColor: e.target.value })}
                  className="w-12 h-8 p-1 cursor-pointer"
                />
                <Input
                  value={settings.socialMediaIconColor || "#ffffff"}
                  onChange={(e) => onChange({ socialMediaIconColor: e.target.value })}
                  placeholder="#ffffff"
                  className="flex-1 h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-3">
              {(["instagram", "tiktok", "youtube", "twitter", "spotify"] as const).map((platform) => {
                const platformNames: Record<typeof platform, string> = {
                  instagram: "Instagram",
                  tiktok: "TikTok",
                  youtube: "YouTube",
                  twitter: "X (Twitter)",
                  spotify: "Spotify",
                }
                const warning = validateSocialUrl(platform, socialLinks[platform].url)

                return (
                  <div key={platform} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">{platformNames[platform]}</Label>
                      <Switch
                        checked={socialLinks[platform].enabled}
                        onCheckedChange={(checked) => handleSocialLinkChange(platform, "enabled", checked)}
                      />
                    </div>
                    {socialLinks[platform].enabled && (
                      <div className="space-y-1">
                        <Input
                          value={socialLinks[platform].url}
                          onChange={(e) => handleSocialLinkChange(platform, "url", e.target.value)}
                          placeholder={`https://${platform === "twitter" ? "x" : platform}.com/...`}
                          className="h-8 text-sm"
                        />
                        {warning && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            {warning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stats & Badges</h4>
        <div className="space-y-3">
          <ToggleField label="Stats" checked={settings.showStats} onChange={(checked) => onChange({ showStats: checked })} />
          <ToggleField
            label="Sales Badge"
            checked={settings.showTotalSalesBadge}
            onChange={(checked) => onChange({ showTotalSalesBadge: checked })}
          />
        </div>
      </div>

      <CoverImageEditor
        open={coverEditorOpen}
        onOpenChange={setCoverEditorOpen}
        currentImageUrl={settings.coverImageUrl}
        currentFocalPoint={settings.coverFocalPoint}
        onSave={handleCoverSave}
      />

      <AvatarCropper
        open={avatarCropperOpen}
        onOpenChange={setAvatarCropperOpen}
        currentImageUrl={settings.avatarUrl}
        onSave={handleAvatarSave}
      />

      <CoverImageLibraryModal open={coverLibraryOpen} onOpenChange={setCoverLibraryOpen} onSelect={handleLibrarySelect} />
    </div>
  )
}

function ProductHeaderSettingsForm({
  settings,
  onChange,
  productId,
}: {
  settings: ProductHeaderSettings
  onChange: (settings: Partial<ProductHeaderSettings>) => void
  productId?: string | null
}) {
  return (
    <div className="space-y-6">
      {/* Edit Product Content Link */}
      {productId && (
        <div className="space-y-3">
          <a
            href={`https://www.materiabuilder.store/app/products/${productId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit Product Content
          </a>
          <p className="text-xs text-muted-foreground">
            Edit title, description, price, images, and other product details
          </p>
        </div>
      )}

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Options</h4>
        <ToggleField
          label="Show Sales Announcement"
          checked={settings.showSalesAnnouncement ?? false}
          onChange={(checked) => onChange({ showSalesAnnouncement: checked })}
          description="Show how many people purchased this item"
        />
        <ToggleField
          label="Show Rating Next To Seller"
          checked={settings.showRatingNextToSeller ?? true}
          onChange={(checked) => onChange({ showRatingNextToSeller: checked })}
          description="Display star rating next to seller name"
        />
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mobile Gallery</h4>
        <ToggleField
          label="Mobile Gallery Dots Navigation"
          checked={settings.mobileGalleryDots ?? false}
          onChange={(checked) => onChange({ mobileGalleryDots: checked })}
          description="Show dots instead of thumbnails on mobile (auto-plays every 7s)"
        />
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desktop Gallery</h4>
        <ToggleField
          label="Desktop Gallery Dots Navigation"
          checked={settings.desktopGalleryDots ?? false}
          onChange={(checked) => onChange({ desktopGalleryDots: checked })}
          description="Show dots instead of thumbnails on desktop (auto-plays every 7s)"
        />
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buy Button</h4>
        <div className="space-y-3">
          <Label>Button Background Color</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={settings.buyButtonColor || "#2563eb"}
              onChange={(e) => onChange({ buyButtonColor: e.target.value })}
              className="w-12 h-9 p-1 cursor-pointer"
            />
            <Input
              value={settings.buyButtonColor || "#2563eb"}
              onChange={(e) => onChange({ buyButtonColor: e.target.value })}
              placeholder="#2563eb"
              className="flex-1 h-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Button Text Color</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={settings.buyButtonTextColor || "#ffffff"}
              onChange={(e) => onChange({ buyButtonTextColor: e.target.value })}
              className="w-12 h-9 p-1 cursor-pointer"
            />
            <Input
              value={settings.buyButtonTextColor || "#ffffff"}
              onChange={(e) => onChange({ buyButtonTextColor: e.target.value })}
              placeholder="#ffffff"
              className="flex-1 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spacing</h4>
        <ProductSpacingSettings spacing={settings.spacing} onChange={(spacing) => onChange({ spacing })} />
      </div>
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-sm font-normal">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function ProductSpacingSettings({
  spacing,
  onChange,
}: {
  spacing: SpacingConfig
  onChange: (spacing: SpacingConfig) => void
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spacing</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Top</Label>
          <Input
            type="number"
            value={spacing.paddingTop}
            onChange={(e) => onChange({ ...spacing, paddingTop: Number(e.target.value) })}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Bottom</Label>
          <Input
            type="number"
            value={spacing.paddingBottom}
            onChange={(e) => onChange({ ...spacing, paddingBottom: Number(e.target.value) })}
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}

function SpacingSettings({
  spacing,
  onChange,
}: {
  spacing: SpacingConfig
  onChange: (spacing: SpacingConfig) => void
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spacing</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Top</Label>
          <Input
            type="number"
            value={spacing.paddingTop}
            onChange={(e) => onChange({ ...spacing, paddingTop: Number(e.target.value) })}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Bottom</Label>
          <Input
            type="number"
            value={spacing.paddingBottom}
            onChange={(e) => onChange({ ...spacing, paddingBottom: Number(e.target.value) })}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Left</Label>
          <Input
            type="number"
            value={spacing.paddingLeft}
            onChange={(e) => onChange({ ...spacing, paddingLeft: Number(e.target.value) })}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Right</Label>
          <Input
            type="number"
            value={spacing.paddingRight}
            onChange={(e) => onChange({ ...spacing, paddingRight: Number(e.target.value) })}
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}

function ColorSettings({
  colors,
  onChange,
}: {
  colors: ColorConfig
  onChange: (colors: ColorConfig) => void
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</h4>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Background</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={colors.backgroundColor || "#ffffff"}
              onChange={(e) => onChange({ ...colors, backgroundColor: e.target.value })}
              className="w-12 h-8 p-1 cursor-pointer"
            />
            <Input
              value={colors.backgroundColor || ""}
              onChange={(e) => onChange({ ...colors, backgroundColor: e.target.value })}
              placeholder="transparent"
              className="flex-1 h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Text</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={colors.textColor || "#000000"}
              onChange={(e) => onChange({ ...colors, textColor: e.target.value })}
              className="w-12 h-8 p-1 cursor-pointer"
            />
            <Input
              value={colors.textColor || ""}
              onChange={(e) => onChange({ ...colors, textColor: e.target.value })}
              placeholder="inherit"
              className="flex-1 h-8 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionSettingsForm({
  section,
  onChange,
}: {
  section: Section
  onChange: (settings: any) => void
}) {
  const settings = section.settings
  const { products } = useStoreBuilder()

  return (
    <div className="space-y-6">
      {/* Reviews is mandatory (can't be hidden) */}
      {section.type !== "reviews" ? (
        <ToggleField label="Visible" checked={settings.visible} onChange={(visible) => onChange({ visible })} />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800 dark:text-amber-200">
              <p className="font-medium">Reviews is required</p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                This section can’t be hidden or deleted, but you can still change its settings below.
              </p>
            </div>
          </div>
        </div>
      )}

      {section.type === "image-text" && <ImageTextSettingsForm settings={settings as ImageTextSettings} onChange={onChange} />}
      {section.type === "benefits" && <BenefitsSettingsForm settings={settings as BenefitsSettings} onChange={onChange} />}
      {section.type === "text-block" && <TextBlockSettingsForm settings={settings as TextBlockSettings} onChange={onChange} />}
      {section.type === "announcement-bar" && (
        <AnnouncementBarSettingsForm
          settings={settings as AnnouncementBarSettings}
          onChange={onChange}
          products={products}
        />
      )}
      {section.type === "featured-products" && (
        <FeaturedProductsSettingsForm settings={settings as FeaturedProductsSettings} onChange={onChange} />
      )}
      {section.type === "more-from-seller" && (
        <MoreFromSellerSettingsForm settings={settings as MoreFromSellerSettings} onChange={onChange} />
      )}

      {section.type === "reviews" && <ReviewsSettingsForm settings={settings as ReviewsSettings} onChange={onChange} />}

      <SpacingSettings spacing={settings.spacing} onChange={(spacing) => onChange({ spacing })} />
      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  )
}

function ImageTextSettingsForm({
  settings,
  onChange,
}: {
  settings: ImageTextSettings
  onChange: (settings: Partial<ImageTextSettings>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-normal">Image</Label>
        <ImageUpload
          bucket="store-builder-images"
          folder="store-builder"
          value={settings.imageUrl}
          onChange={(url) => onChange({ imageUrl: url || "" })}
          aspectRatio="video"
          maxSizeMB={10}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Image Position</Label>
        <Select value={settings.imagePosition} onValueChange={(value) => onChange({ imagePosition: value as "left" | "right" })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline</Label>
        <Input value={settings.headline} onChange={(e) => onChange({ headline: e.target.value })} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Body</Label>
        <Textarea value={settings.body} onChange={(e) => onChange({ body: e.target.value })} rows={4} className="resize-none" />
      </div>

      <ToggleField label="Show Button" checked={settings.showButton} onChange={(checked) => onChange({ showButton: checked })} />

      {settings.showButton && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-normal">Button Text</Label>
            <Input value={settings.buttonText || ""} onChange={(e) => onChange({ buttonText: e.target.value })} className="h-9" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-normal">Button URL</Label>
            <Input
              value={settings.buttonUrl || ""}
              onChange={(e) => onChange({ buttonUrl: e.target.value })}
              className="h-9"
              placeholder="https://"
            />
          </div>
        </>
      )}
    </div>
  )
}

function BenefitsSettingsForm({
  settings,
  onChange,
}: {
  settings: BenefitsSettings
  onChange: (settings: Partial<BenefitsSettings>) => void
}) {
  const updateBenefit = (index: number, field: string, value: string) => {
    const newBenefits = [...settings.benefits]
    newBenefits[index] = { ...newBenefits[index], [field]: value }
    onChange({ benefits: newBenefits })
  }

  const addBenefit = () => {
    onChange({
      benefits: [
        ...settings.benefits,
        { id: `benefit_${Date.now()}`, icon: "check-circle", title: "New Benefit", description: "Description here" },
      ],
    })
  }

  const removeBenefit = (index: number) => {
    onChange({ benefits: settings.benefits.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline</Label>
        <Input value={settings.headline} onChange={(e) => onChange({ headline: e.target.value })} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Columns</Label>
        <Select value={String(settings.columns)} onValueChange={(value) => onChange({ columns: Number(value) as 2 | 3 | 4 })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 Columns</SelectItem>
            <SelectItem value="3">3 Columns</SelectItem>
            <SelectItem value="4">4 Columns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-normal">Benefits</Label>

        {settings.benefits.map((benefit, index) => (
          <div key={benefit.id} className="relative p-3 rounded-lg bg-muted/50">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeBenefit(index)}
              className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Remove benefit"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            <div className="space-y-2 pr-8">
              <Input
                value={benefit.title}
                onChange={(e) => updateBenefit(index, "title", e.target.value)}
                placeholder="Title"
                className="h-8 text-sm"
              />
              <Textarea
                value={benefit.description}
                onChange={(e) => updateBenefit(index, "description", e.target.value)}
                placeholder="Description"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addBenefit} className="w-full bg-transparent">
          <Plus className="h-4 w-4 mr-1" />
          Add Benefit
        </Button>
      </div>
    </div>
  )
}

function TextBlockSettingsForm({
  settings,
  onChange,
}: {
  settings: TextBlockSettings
  onChange: (settings: Partial<TextBlockSettings>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline (optional)</Label>
        <Input value={settings.headline || ""} onChange={(e) => onChange({ headline: e.target.value })} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Body</Label>
        <Textarea value={settings.body} onChange={(e) => onChange({ body: e.target.value })} rows={6} className="resize-none" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Max Width</Label>
        <Select
          value={settings.maxWidth}
          onValueChange={(value) => onChange({ maxWidth: value as "sm" | "md" | "lg" | "full" })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
            <SelectItem value="full">Full Width</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Text Align</Label>
        <Select
          value={settings.typography.textAlign}
          onValueChange={(value) =>
            onChange({ typography: { ...settings.typography, textAlign: value as "left" | "center" | "right" } })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function AnnouncementBarSettingsForm({
  settings,
  onChange,
  products = [],
}: {
  settings: AnnouncementBarSettings
  onChange: (settings: Partial<AnnouncementBarSettings>) => void
  products?: Array<{ id: string; title: string; slug?: string }>
}) {
  const [linkMode, setLinkMode] = useState<"none" | "product" | "custom">(
    settings.linkProductSlug ? "product" : settings.linkUrl ? "custom" : "none",
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Text</Label>
        <Input value={settings.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Announcement text" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal">Text Size</Label>
          <span className="text-xs text-muted-foreground">{settings.textSize || 14}px</span>
        </div>
        <Slider
          value={[settings.textSize || 14]}
          onValueChange={([value]) => onChange({ textSize: value })}
          min={12}
          max={24}
          step={1}
        />
      </div>

      <ToggleField
        label="Enable Underline Text"
        checked={settings.enableUnderline || false}
        onChange={(checked) => onChange({ enableUnderline: checked })}
        description="Underline text to indicate it's clickable"
      />

      <div className="space-y-3">
        <Label>Link Destination</Label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={linkMode === "none"}
              onChange={() => {
                setLinkMode("none")
                onChange({ linkProductSlug: undefined, linkUrl: undefined })
              }}
              className="text-primary"
            />
            <span>No link</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={linkMode === "product"}
              onChange={() => setLinkMode("product")}
              className="text-primary"
            />
            <span>Link to product</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={linkMode === "custom"}
              onChange={() => setLinkMode("custom")}
              className="text-primary"
            />
            <span>Custom URL</span>
          </label>
        </div>
      </div>

      {linkMode === "product" && (
        <div className="space-y-2">
          <Label>Select Product</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={settings.linkProductSlug || ""}
            onChange={(e) => {
              const selectedProduct = products.find((p) => p.slug === e.target.value)
              onChange({
                linkProductSlug: e.target.value || undefined,
                linkProductId: selectedProduct?.id,
                linkUrl: undefined,
              })
            }}
          >
            <option value="">Select a product...</option>
            {products?.map((product) => (
              <option key={product.id} value={product.slug || product.id}>
                {product.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {linkMode === "custom" && (
        <div className="space-y-2">
          <Label>Custom URL</Label>
          <Input
            value={settings.linkUrl || ""}
            onChange={(e) =>
              onChange({
                linkUrl: e.target.value,
                linkProductSlug: undefined,
                linkProductId: undefined,
              })
            }
            placeholder="https://example.com"
          />
        </div>
      )}

      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />
      <SpacingSettings spacing={settings.spacing} onChange={(spacing) => onChange({ spacing })} />
    </div>
  )
}

function FeaturedProductsSettingsForm({
  settings,
  onChange,
}: {
  settings: FeaturedProductsSettings
  onChange: (settings: Partial<FeaturedProductsSettings>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline</Label>
        <Input value={settings.headline} onChange={(e) => onChange({ headline: e.target.value })} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Mobile Version Listing</Label>
        <Select
          value={String(settings.mobileListing ?? 1)}
          onValueChange={(value) => onChange({ mobileListing: Number(value) as 1 | 2 })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 item per row</SelectItem>
            <SelectItem value="2">2 items per row</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">Applies only on mobile screens.</p>
      </div>

      <ToggleField label="Show Price" checked={settings.showPrice} onChange={(checked) => onChange({ showPrice: checked })} />
      <ToggleField
        label="Show Compare at Price"
        checked={settings.showCompareAtPrice ?? false}
        onChange={(checked) => onChange({ showCompareAtPrice: checked })}
      />
      <ToggleField
        label="Hide Category Filter"
        checked={settings.hideCategoryFilter ?? false}
        onChange={(checked) => onChange({ hideCategoryFilter: checked })}
      />
    </div>
  )
}

function MoreFromSellerSettingsForm({
  settings,
  onChange,
}: {
  settings: MoreFromSellerSettings
  onChange: (settings: Partial<MoreFromSellerSettings>) => void
}) {
  const spacing = settings.spacing || { paddingTop: 48, paddingBottom: 48, paddingLeft: 16, paddingRight: 16 }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline</Label>
        <Input value={settings.headline} onChange={(e) => onChange({ headline: e.target.value })} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Columns</Label>
        <Select
          value={String(Math.min(Number(settings.columns ?? 3), 3))}
          onValueChange={(value) => onChange({ columns: Number(value) as 2 | 3 })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 Columns</SelectItem>
            <SelectItem value="3">3 Columns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Mobile Products Per Row</Label>
        <Select
          value={String(settings.mobileProductsPerRow ?? 1)}
          onValueChange={(value) => onChange({ mobileProductsPerRow: Number(value) as 1 | 2 })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 Product per Row</SelectItem>
            <SelectItem value="2">2 Products per Row</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Applies only on mobile screens.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Max Products</Label>
        <Select value={String(settings.maxProducts)} onValueChange={(value) => onChange({ maxProducts: Number(value) })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 Products</SelectItem>
            <SelectItem value="4">4 Products</SelectItem>
            <SelectItem value="6">6 Products</SelectItem>
            <SelectItem value="8">8 Products</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Top Padding</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[spacing.paddingTop ?? 48]}
            onValueChange={([value]) => onChange({ spacing: { ...spacing, paddingTop: value } })}
            min={0}
            max={96}
            step={4}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">{spacing.paddingTop ?? 48}px</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-normal">Bottom Padding</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[spacing.paddingBottom ?? 48]}
            onValueChange={([value]) => onChange({ spacing: { ...spacing, paddingBottom: value } })}
            min={0}
            max={96}
            step={4}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">{spacing.paddingBottom ?? 48}px</span>
        </div>
      </div>

      <ToggleField label="Show Price" checked={settings.showPrice} onChange={(checked) => onChange({ showPrice: checked })} />
      <ToggleField
        label="Show Compare at Price"
        checked={settings.showCompareAtPrice ?? false}
        onChange={(checked) => onChange({ showCompareAtPrice: checked })}
      />
      <ToggleField
        label="Show Description"
        checked={settings.showDescription}
        onChange={(checked) => onChange({ showDescription: checked })}
      />
    </div>
  )
}

function SubscribeBarSettingsForm({
  settings,
  onChange,
}: {
  settings: SubscribeBarSettings
  onChange: (settings: Partial<SubscribeBarSettings>) => void
}) {
  const safeSettings = { ...defaultSubscribeBarSettings, ...settings }

  const styleOptions = [
    { value: "style1", label: "Style 1" },
    { value: "style2", label: "Style 2" },
    { value: "style3", label: "Style 3" },
  ]

  const buttonStyleOptions = [
    { value: "style1", label: "Subscribe / Subscribed" },
    { value: "style2", label: "Join Now / Joined" },
    { value: "style3", label: "Get It / 🔥" },
    { value: "style4", label: "Follow / Followed" },
  ]

  const handleStyleChange = (style: string) => {
    let newText = ""

    switch (style) {
      case "style2":
        newText = "Join our family!"
        break
      case "style3":
        newText = "Join our community!"
        break
      case "style1":
      default:
        newText = ""
        break
    }

    onChange({
      style: style as SubscribeBarSettings["style"],
      text: newText,
    })
  }

  return (
    <div className="space-y-6">
      <ToggleField
        label="Show Subscribe Bar"
        checked={safeSettings.visible}
        onChange={(checked) => onChange({ visible: checked })}
        description="Display newsletter signup bar above the header"
      />

      <ToggleField
        label="Enable Sticky Bar"
        checked={safeSettings.enableStickyBar ?? false}
        onChange={(checked) => onChange({ enableStickyBar: checked })}
        description="Bar sticks to top when scrolling. Preview available on live website. "
      />

      <div className="space-y-3">
        <Label>Bar Style</Label>
        <Select value={safeSettings.style || "style1"} onValueChange={handleStyleChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {styleOptions.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Bar Text CTA</Label>
        <Input
          value={safeSettings.customCtaText || ""}
          onChange={(e) => onChange({ customCtaText: e.target.value })}
          placeholder="Custom text (overrides Bar Style text)"
          className="h-9 text-sm"
        />
        <p className="text-xs text-muted-foreground">Leave empty to use the Bar Style text</p>
      </div>

      <div className="space-y-3">
        <Label>Button Style</Label>
        <Select
          value={safeSettings.buttonStyle || "style1"}
          onValueChange={(value) => onChange({ buttonStyle: value as "style1" | "style2" | "style3" | "style4" })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buttonStyleOptions.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Changes button text before/after subscribe</p>
      </div>

      <div className="space-y-3">
        <Label>Button Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonColor || "#2563eb"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonColor || "#2563eb"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            placeholder="#2563eb"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Text Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <ToggleField
        label="Show Avatar"
        checked={safeSettings.showAvatar ?? true}
        onChange={(checked) => onChange({ showAvatar: checked })}
        description="Display your profile picture in the bar"
      />

      <div className="space-y-3">
        <Label>Background Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.colors?.backgroundColor || "#ffffff"}
            onChange={(e) => onChange({ colors: { ...safeSettings.colors, backgroundColor: e.target.value } })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.colors?.backgroundColor || "#ffffff"}
            onChange={(e) => onChange({ colors: { ...safeSettings.colors, backgroundColor: e.target.value } })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Text Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.colors?.textColor || "#000000"}
            onChange={(e) => onChange({ colors: { ...safeSettings.colors, textColor: e.target.value } })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.colors?.textColor || "#000000"}
            onChange={(e) => onChange({ colors: { ...safeSettings.colors, textColor: e.target.value } })}
            placeholder="#000000"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>
    </div>
  )
}

function ProductCreatorBarSettingsForm({
  settings,
  onChange,
}: {
  settings: ProductCreatorBarSettings
  onChange: (settings: Partial<ProductCreatorBarSettings>) => void
}) {
  const safeSettings = { ...defaultProductCreatorBarSettings, ...settings }

  const buttonStyleOptions = [
    { value: "style1", label: "Subscribe / Subscribed" },
    { value: "style2", label: "Join Now / Joined" },
    { value: "style3", label: "Get It / 🔥" },
    { value: "style4", label: "Follow / Followed" },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>Button Style</Label>
        <Select
          value={safeSettings.buttonStyle || "style4"}
          onValueChange={(value) => onChange({ buttonStyle: value as ProductCreatorBarSettings["buttonStyle"] })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buttonStyleOptions.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Background Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.backgroundColor || "#1a1a1a"}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.backgroundColor || "#1a1a1a"}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            placeholder="#1a1a1a"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Text Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.textColor || "#ffffff"}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.textColor || "#ffffff"}
            onChange={(e) => onChange({ textColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Background Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonColor || "#4b5563"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonColor || "#4b5563"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            placeholder="#4b5563"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Text Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>
    </div>
  )
}

function StickyAddToCartSettingsForm({
  settings,
  onChange,
}: {
  settings: StickyAddToCartSettings
  onChange: (settings: Partial<StickyAddToCartSettings>) => void
}) {
  const safeSettings = { ...defaultStickyAddToCartSettings, ...settings }

  const buttonStyleOptions = [
    { value: "add_to_cart", label: "Add to cart" },
    { value: "grab_it", label: "Grab It" },
    { value: "grab_me", label: "Grab Me" },
    { value: "download", label: "Download" },
    { value: "get_it", label: "Get It!" },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <p className="font-medium">Sticky Add to Cart</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Appears when visitors scroll down the product page. Clicking the button redirects to checkout. This section
              cannot be hidden or removed.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Style</Label>
        <Select
          value={safeSettings.buttonStyle || "add_to_cart"}
          onValueChange={(value) => onChange({ buttonStyle: value as StickyAddToCartSettings["buttonStyle"] })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buttonStyleOptions.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Border Radius</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[safeSettings.borderRadius ?? 8]}
            onValueChange={([value]) => onChange({ borderRadius: value })}
            min={0}
            max={24}
            step={2}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">{safeSettings.borderRadius ?? 8}px</span>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Background Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.backgroundColor || "#ffffff"}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.backgroundColor || "#ffffff"}
            onChange={(e) => onChange({ backgroundColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonColor || "#2563eb"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonColor || "#2563eb"}
            onChange={(e) => onChange({ buttonColor: e.target.value })}
            placeholder="#2563eb"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Button Text Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            className="w-12 h-9 p-1 cursor-pointer"
          />
          <Input
            value={safeSettings.buttonTextColor || "#ffffff"}
            onChange={(e) => onChange({ buttonTextColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 h-9 text-xs"
          />
        </div>
      </div>
    </div>
  )
}

function ReviewsSettingsForm({
  settings,
  onChange,
}: {
  settings: ReviewsSettings
  onChange: (settings: Partial<ReviewsSettings>) => void
}) {
  return (
    <div className="space-y-4">
      <SpacingSettings spacing={settings.spacing} onChange={(spacing) => onChange({ spacing })} />
      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  )
}
