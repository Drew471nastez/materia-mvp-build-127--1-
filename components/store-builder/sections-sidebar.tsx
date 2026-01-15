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
  Share2,
  Circle,
  Square,
  Hexagon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Custom Toggle Component with theme-style design (purple when ON)
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="theme-checkbox-purple"
    />
  )
}

// Custom Slider Component with premium minimal styling (matches Onepage)
function PremiumSlider({ value, onValueChange, min = 0, max = 100, step = 1, showValue = false, unit = "px" }: {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  unit?: string;
}) {
  const percentage = ((value[0] - min) / (max - min)) * 100
  const numTicks = 5
  const ticks = Array.from({ length: numTicks }, (_, i) => (i / (numTicks - 1)) * 100)

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 h-6 flex items-center">
        {/* Track */}
        <div className="relative w-full h-[4px] bg-[#f0f0f0] rounded-full">
          {/* Tick markers */}
          {ticks.map((pos, i) => (
            <div
              key={i}
              className="absolute w-[6px] h-[6px] bg-[#e0e0e0] rounded-full -translate-y-1/2 top-1/2"
              style={{ left: `calc(${pos}% - 3px)` }}
            />
          ))}
          {/* Hidden input for interaction */}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value[0]}
            onChange={(e) => onValueChange([Number(e.target.value)])}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          {/* Thumb */}
          <div
            className="absolute w-[21px] h-[21px] bg-white rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
            style={{
              left: `calc(${percentage}% - 10.5px)`,
              boxShadow: '0 2px 5px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)'
            }}
          />
        </div>
      </div>
      {showValue && (
        <span className="text-sm text-muted-foreground w-12 text-right">{value[0]}{unit}</span>
      )}
    </div>
  )
}

// Onepage-style Color Picker with preset colors
function ColorPicker({
  label,
  value,
  onChange,
  presetColors = ['#ffffff', '#000000', '#1a1a1a', '#3b82f6', '#ef4444', '#10b981'],
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  presetColors?: string[];
}) {
  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="w-12 h-12 rounded-xl border-2 border-gray-200 shadow-sm cursor-pointer"
            style={{ backgroundColor: value || "#ffffff" }}
          />
        </div>
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="h-12 rounded-xl flex-1 font-mono text-sm"
        />
      </div>
      {/* Suggested Colors */}
      <div className="flex gap-2 pt-1">
        {presetColors.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={cn(
              "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
              value === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}

// Segmented Button Selector (matches Onepage Design tab style)
function SegmentedSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 py-2.5 px-4 text-sm font-medium rounded-xl border-2 transition-all",
              value === option.value
                ? "bg-white border-gray-900 text-gray-900 shadow-sm"
                : "bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

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

interface SectionsSidebarProps {
  creatorId: string
  profile?: {
    display_name?: string | null
    avatar_url?: string | null
    username?: string | null
  }
  creator?: {
    headline?: string | null
    bio?: string | null
  }
}

export function SectionsSidebar({ creatorId, profile, creator }: SectionsSidebarProps) {
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
  const [settingsTab, setSettingsTab] = useState<"basic" | "seo" | "badge" | "theme" | "social">("basic")

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
    // Theme tab is only shown for shop pages, not product pages
    const allSettingsTabs = [
      { id: "basic" as const, label: "Basic Info", icon: Info },
      { id: "theme" as const, label: "Theme Presets", icon: Palette },
      { id: "social" as const, label: "Social Media", icon: Share2 },
      { id: "seo" as const, label: "SEO", icon: Globe },
      { id: "badge" as const, label: "Verified Badge", icon: BadgeCheck },
    ]

    // Filter out theme tab for product pages
    const settingsTabs = currentPageType === "product"
      ? allSettingsTabs.filter(tab => tab.id !== "theme")
      : allSettingsTabs

    return (
      <div className="w-80 border-r border-border bg-background overflow-hidden flex flex-col h-full">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0 bg-background">
          <button onClick={goBackToSections} className="rounded p-1.5 hover:bg-muted transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="font-semibold">General Settings</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Vertical Tab Navigation - like sections list */}
          <div className="p-3 space-y-1 border-b border-border">
            {settingsTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-3 py-2.5 transition-all text-left",
                    settingsTab === tab.id
                      ? "bg-purple-50 border border-purple-500 dark:bg-purple-950/20"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                      settingsTab === tab.id
                        ? "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={cn(
                    "text-sm font-medium",
                    settingsTab === tab.id ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="p-4 space-y-4">
            {/* Basic Info Content */}
            {settingsTab === "basic" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="store-name">Store Name</Label>
                  <Input
                    id="store-name"
                    value={globalSettings.storeName || (profile?.display_name || "")}
                    onChange={(e) => updateGlobalSettings({ storeName: e.target.value })}
                    placeholder={profile?.display_name || "My Store"}
                  />
                  <p className="text-xs text-muted-foreground">
                    This appears as your store's title
                    {profile?.display_name && !globalSettings.storeName && (
                      <span className="block text-purple-600 mt-1">Uses "{profile.display_name}" if left empty</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-tagline">Tagline</Label>
                  <Input
                    id="store-tagline"
                    value={globalSettings.storeTagline || (creator?.headline || "")}
                    onChange={(e) => updateGlobalSettings({ storeTagline: e.target.value })}
                    placeholder={creator?.headline || "Your store's tagline"}
                  />
                  <p className="text-xs text-muted-foreground">
                    A short description of your store
                    {creator?.headline && !globalSettings.storeTagline && (
                      <span className="block text-purple-600 mt-1">Uses "{creator.headline}" if left empty</span>
                    )}
                  </p>
                </div>
              </>
            )}

            {/* SEO Content */}
            {settingsTab === "seo" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="seo-title">Store Title</Label>
                  <Input
                    id="seo-title"
                    value={globalSettings.seoTitle || (profile?.display_name ? `${profile.display_name} | Storelib` : "")}
                    onChange={(e) => updateGlobalSettings({ seoTitle: e.target.value })}
                    placeholder={profile?.display_name ? `${profile.display_name} | Storelib` : "Store Title for Search Engines"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Appears in search results and browser tabs
                    {profile?.display_name && !globalSettings.seoTitle && (
                      <span className="block text-purple-600 mt-1">Uses "{profile.display_name} | Storelib" if left empty</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta-description">Meta Description</Label>
                  <Textarea
                    id="meta-description"
                    value={globalSettings.seoDescription || (creator?.headline || creator?.bio || "")}
                    onChange={(e) => updateGlobalSettings({ seoDescription: e.target.value })}
                    placeholder={creator?.headline || creator?.bio || "Describe your store for search engines..."}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    {(globalSettings.seoDescription || creator?.headline || creator?.bio || "").length}/160 characters recommended
                    {(creator?.headline || creator?.bio) && !globalSettings.seoDescription && (
                      <span className="block text-purple-600 mt-1">Uses your bio/headline if left empty</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Social Image</Label>
                  <ImageUpload
                    bucket="store-builder-images"
                    value={globalSettings.socialImageUrl || ""}
                    onChange={(url) => updateGlobalSettings({ socialImageUrl: url || "" })}
                    folder={`social`}
                    aspectRatio="video"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used when your store is shared on social media (1200x630 recommended)
                    {profile?.avatar_url && !globalSettings.socialImageUrl && (
                      <span className="block text-purple-600 mt-1">Uses your profile avatar by default</span>
                    )}
                  </p>
                </div>

                {/* Social Image Preview - show avatar as default if no custom image */}
                <div className="space-y-2">
                  <Label>Social Image Preview</Label>
                  <div className="rounded-lg border border-border overflow-hidden aspect-[1200/630] bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center">
                    {globalSettings.socialImageUrl ? (
                      <img
                        src={globalSettings.socialImageUrl}
                        alt="Social preview"
                        className="w-full h-full object-cover"
                      />
                    ) : profile?.avatar_url ? (
                      <div className="text-center">
                        <img
                          src={profile.avatar_url}
                          alt="Default social preview"
                          className="w-20 h-20 rounded-full mx-auto mb-2 border-2 border-white shadow-lg object-cover"
                        />
                        <p className="text-sm font-medium text-gray-700">{profile?.display_name || "Your Store"}</p>
                        <p className="text-xs text-gray-500 mt-1">Default preview using profile avatar</p>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No image set</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Social Media Content */}
            {settingsTab === "social" && (
              <>
                <div className="space-y-2">
                  <h4 className="font-medium">Social Media Links</h4>
                  <p className="text-sm text-muted-foreground">
                    Configure your social media links. These will appear on your store header and can be shown across all pages.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label className="text-sm font-medium">Enable Social Media</Label>
                      <p className="text-xs text-muted-foreground">
                        Show social icons on your cover image
                      </p>
                    </div>
                    <Toggle
                      checked={(headerSettings as ShopHeaderSettings).showSocialMedia ?? false}
                      onCheckedChange={(checked) => updateHeaderSettings({ showSocialMedia: checked })}
                    />
                  </div>

                  {(headerSettings as ShopHeaderSettings).showSocialMedia && (
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1 pr-4">
                          <Label className="text-sm font-medium text-muted-foreground">Show on Mobile</Label>
                          <p className="text-xs text-muted-foreground">Display icons on mobile devices</p>
                        </div>
                        <Toggle
                          checked={(headerSettings as ShopHeaderSettings).showSocialIconsOnMobile ?? true}
                          onCheckedChange={(checked) => updateHeaderSettings({ showSocialIconsOnMobile: checked })}
                        />
                      </div>

                      <ColorPicker
                        label="Icon Color"
                        value={(headerSettings as ShopHeaderSettings).socialMediaIconColor || "#ffffff"}
                        onChange={(value) => updateHeaderSettings({ socialMediaIconColor: value })}
                      />

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Icon Style</Label>
                        <div className="flex gap-2">
                          {[
                            { id: "default" as const, label: "Default" },
                            { id: "filled" as const, label: "Filled" },
                            { id: "outlined" as const, label: "Outlined" },
                          ].map((style) => (
                            <button
                              key={style.id}
                              onClick={() => updateHeaderSettings({ socialMediaIconStyle: style.id })}
                              className={cn(
                                "flex-1 py-2.5 px-2 text-xs font-medium rounded-xl border-2 transition-all",
                                (headerSettings as ShopHeaderSettings).socialMediaIconStyle === style.id
                                  ? "bg-white border-gray-900 text-gray-900 shadow-sm"
                                  : "bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200"
                              )}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Choose how your social media icons appear
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {(headerSettings as ShopHeaderSettings).showSocialMedia && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Social Platforms</Label>
                    {(["instagram", "tiktok", "youtube", "twitter", "spotify"] as const).map((platform) => {
                      const platformNames: Record<typeof platform, string> = {
                        instagram: "Instagram",
                        tiktok: "TikTok",
                        youtube: "YouTube",
                        twitter: "X (Twitter)",
                        spotify: "Spotify",
                      }
                      const shopHeader = headerSettings as ShopHeaderSettings
                      const socialLinks = shopHeader.socialLinks || {
                        instagram: { enabled: true, url: "" },
                        tiktok: { enabled: true, url: "" },
                        youtube: { enabled: true, url: "" },
                        twitter: { enabled: true, url: "" },
                        spotify: { enabled: false, url: "" },
                      }

                      return (
                        <div key={platform} className="space-y-2 rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-normal">{platformNames[platform]}</Label>
                            <Toggle
                              checked={socialLinks[platform].enabled}
                              onCheckedChange={(checked) => {
                                const newSocialLinks = {
                                  ...socialLinks,
                                  [platform]: { ...socialLinks[platform], enabled: checked },
                                }
                                updateHeaderSettings({ socialLinks: newSocialLinks })
                              }}
                            />
                          </div>
                          {socialLinks[platform].enabled && (
                            <Input
                              value={socialLinks[platform].url}
                              onChange={(e) => {
                                const newSocialLinks = {
                                  ...socialLinks,
                                  [platform]: { ...socialLinks[platform], url: e.target.value },
                                }
                                updateHeaderSettings({ socialLinks: newSocialLinks })
                              }}
                              placeholder={`https://${platform === "twitter" ? "x" : platform}.com/...`}
                              className="h-8 text-sm"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* Verified Badge Content */}
            {settingsTab === "badge" && (
              <>
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-medium">Verified Badge</h4>
                    <p className="text-sm text-muted-foreground">
                      Show a verification badge next to your name
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label htmlFor="badge-enabled" className="text-sm font-medium">Enable Verified Badge</Label>
                      <p className="text-xs text-muted-foreground">
                        Display a blue checkmark next to your page name
                      </p>
                    </div>
                    <Toggle
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

                    <div className="rounded-xl bg-gray-50 p-4 space-y-2">
                      <Label className="text-xs text-muted-foreground">Preview</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-gray-900">{globalSettings.storeName || profile?.display_name || "Your Store"}</span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-pointer">
                                <svg viewBox="0 0 22 22" className="h-5 w-5">
                                  {/* Blue badge background */}
                                  <path
                                    fill="#3b82f6"
                                    d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
                                  />
                                  {/* White checkmark */}
                                  <path
                                    fill="#ffffff"
                                    d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
                                  />
                                </svg>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-gray-900 text-white px-3 py-2">
                              <p className="font-medium">{verifiedBadgeLabels[globalSettings.verifiedBadgeType]}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Hover over the badge to see the tooltip</p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Theme Content */}
            {settingsTab === "theme" && (
              <>
              <div className="space-y-2">
                <Label>Theme Preset</Label>
                <p className="text-xs text-muted-foreground">
                  Choose a theme to change colors across your entire store
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(themePresets) as ThemePreset[]).map((preset) => {
                  const theme = themePresets[preset]
                  const isSelected = globalSettings.themePreset === preset

                  // Determine if this is a dark/gradient theme based on background or foreground color
                  const isDarkOrGradientTheme =
                    preset === "astrid" ||
                    preset === "royal" ||
                    preset === "ocean" ||
                    preset === "sunset" ||
                    theme.colors.foreground === "#ffffff" ||
                    theme.colors.foreground === "#fafafa"

                  // Check if background is a gradient
                  const isGradient = theme.colors.background.includes("gradient")

                  return (
                    <button
                      key={preset}
                      onClick={() => applyTheme(preset)}
                      className={cn(
                        "relative rounded-xl border-2 text-left transition-all overflow-hidden flex flex-col",
                        isSelected
                          ? "border-purple-500 ring-2 ring-purple-200"
                          : "border-border hover:border-purple-300"
                      )}
                    >
                      {/* Selected checkmark badge */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 z-10 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}

                      {/* Theme thumbnail preview - Onepage style */}
                      <div
                        className="aspect-[4/5] flex flex-col items-center justify-center p-3"
                        style={{
                          background: isGradient ? theme.colors.background : undefined,
                          backgroundColor: !isGradient ? theme.colors.background : undefined,
                        }}
                      >
                        {/* Avatar circle */}
                        <div
                          className="w-8 h-8 rounded-full mb-2"
                          style={{
                            backgroundColor: isDarkOrGradientTheme
                              ? "rgba(255,255,255,0.2)"
                              : "rgba(0,0,0,0.1)"
                          }}
                        />

                        {/* Text lines */}
                        <div
                          className="w-12 h-1.5 rounded-full mb-1"
                          style={{
                            backgroundColor: isDarkOrGradientTheme
                              ? "rgba(255,255,255,0.4)"
                              : "rgba(0,0,0,0.2)"
                          }}
                        />
                        <div
                          className="w-8 h-1 rounded-full mb-3"
                          style={{
                            backgroundColor: isDarkOrGradientTheme
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(0,0,0,0.1)"
                          }}
                        />

                        {/* Button preview */}
                        <div
                          className="w-14 h-4 rounded flex items-center justify-center"
                          style={{
                            backgroundColor: theme.subscribeBar.buttonColor,
                            borderRadius: `${Math.min(theme.borderRadius, 12)}px`
                          }}
                        />
                      </div>

                      {/* Theme name below preview thumbnail */}
                      <div className="py-1.5 text-center text-[10px] font-medium text-foreground bg-muted/50 border-t border-border">
                        {theme.name}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 mt-4">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-purple-800">
                    <p className="font-medium">Note about custom colors</p>
                    <p className="mt-1">
                      Theme colors apply globally, but any custom colors you set on individual sections will override the theme.
                    </p>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">{pageTitle}</span>
          </div>
          {/* Settings Button - icon only with tooltip and animation */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openGlobalSettings}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Settings className="h-4 w-4 settings-gear-animated" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>General Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

      <div className="border-t border-border p-3 shrink-0 bg-background">
        <button
          onClick={openAddSectionModal}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/20 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add section
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
                <Label className="text-sm font-normal">Brightness</Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round((settings.coverBrightness ?? 1.0) * 100)}%
                </span>
              </div>
              <PremiumSlider
                value={[(settings.coverBrightness ?? 1.0) * 100]}
                onValueChange={([value]) => onChange({ coverBrightness: value / 100 })}
                min={70}
                max={130}
                step={5}
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
            <Label className="text-sm font-medium">Desktop Size</Label>
            <div className="flex gap-2">
              {(["small", "large"] as AvatarSizeChoice[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleAvatarSizeChoice(size, false)}
                  className={cn(
                    "flex-1 py-2.5 px-4 text-sm font-medium rounded-xl border-2 transition-all capitalize",
                    (settings.avatarSizeChoice === size || (settings.avatarSizeChoice === "medium" && size === "large") || (!settings.avatarSizeChoice && size === "large"))
                      ? "bg-white border-gray-900 text-gray-900 shadow-sm"
                      : "bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Mobile Size</Label>
            <div className="flex gap-2">
              {(["small", "large"] as AvatarSizeChoice[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleAvatarSizeChoice(size, true)}
                  className={cn(
                    "flex-1 py-2.5 px-4 text-sm font-medium rounded-xl border-2 transition-all capitalize",
                    (settings.mobileAvatarSizeChoice === size || (settings.mobileAvatarSizeChoice === "medium" && size === "large") || (!settings.mobileAvatarSizeChoice && size === "large"))
                      ? "bg-white border-gray-900 text-gray-900 shadow-sm"
                      : "bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <ColorPicker
            label="Ring Border Color"
            value={settings.profileRingColor || "#ffffff"}
            onChange={(value) => onChange({ profileRingColor: value })}
          />
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

            <ColorPicker
              label="Icon Color"
              value={settings.socialMediaIconColor || "#ffffff"}
              onChange={(value) => onChange({ socialMediaIconColor: value })}
            />

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
                      <Toggle
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
        <ColorPicker
          label="Button Background Color"
          value={settings.buyButtonColor || "#2563eb"}
          onChange={(value) => onChange({ buyButtonColor: value })}
        />
        <ColorPicker
          label="Button Text Color"
          value={settings.buyButtonTextColor || "#ffffff"}
          onChange={(value) => onChange({ buyButtonTextColor: value })}
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Buttons Border Radius</Label>
            <span className="text-xs text-muted-foreground">{settings.buttonsBorderRadius ?? 8}px</span>
          </div>
          <PremiumSlider
            value={[settings.buttonsBorderRadius ?? 8]}
            onValueChange={([value]) => onChange({ buttonsBorderRadius: value })}
            min={0}
            max={32}
            step={2}
          />
          <p className="text-xs text-muted-foreground">Controls Add to Cart, Buy, and Wishlist buttons</p>
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
      <div className="flex-1 pr-4">
        <Label className="text-sm font-normal">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Toggle checked={checked} onCheckedChange={onChange} />
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
  const paddingTop = spacing.paddingTop ?? 0
  const paddingBottom = spacing.paddingBottom ?? 0

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spacing</h4>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Top</Label>
            <span className="text-xs text-muted-foreground">{paddingTop}px</span>
          </div>
          <PremiumSlider
            value={[paddingTop]}
            onValueChange={([value]) => onChange({ ...spacing, paddingTop: value })}
            min={0}
            max={96}
            step={4}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Bottom</Label>
            <span className="text-xs text-muted-foreground">{paddingBottom}px</span>
          </div>
          <PremiumSlider
            value={[paddingBottom]}
            onValueChange={([value]) => onChange({ ...spacing, paddingBottom: value })}
            min={0}
            max={96}
            step={4}
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
  const paddingTop = spacing.paddingTop ?? 0
  const paddingBottom = spacing.paddingBottom ?? 0
  const paddingLeft = spacing.paddingLeft ?? 0
  const paddingRight = spacing.paddingRight ?? 0

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spacing</h4>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Top</Label>
            <span className="text-xs text-muted-foreground">{paddingTop}px</span>
          </div>
          <PremiumSlider
            value={[paddingTop]}
            onValueChange={([value]) => onChange({ ...spacing, paddingTop: value })}
            min={0}
            max={96}
            step={4}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Bottom</Label>
            <span className="text-xs text-muted-foreground">{paddingBottom}px</span>
          </div>
          <PremiumSlider
            value={[paddingBottom]}
            onValueChange={([value]) => onChange({ ...spacing, paddingBottom: value })}
            min={0}
            max={96}
            step={4}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Left</Label>
            <span className="text-xs text-muted-foreground">{paddingLeft}px</span>
          </div>
          <PremiumSlider
            value={[paddingLeft]}
            onValueChange={([value]) => onChange({ ...spacing, paddingLeft: value })}
            min={0}
            max={96}
            step={4}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Right</Label>
            <span className="text-xs text-muted-foreground">{paddingRight}px</span>
          </div>
          <PremiumSlider
            value={[paddingRight]}
            onValueChange={([value]) => onChange({ ...spacing, paddingRight: value })}
            min={0}
            max={96}
            step={4}
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
      <div className="space-y-4">
        <ColorPicker
          label="Background"
          value={colors.backgroundColor || "#ffffff"}
          onChange={(value) => onChange({ ...colors, backgroundColor: value })}
        />
        <ColorPicker
          label="Text"
          value={colors.textColor || "#000000"}
          onChange={(value) => onChange({ ...colors, textColor: value })}
        />
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
        <PremiumSlider
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
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal">Top Padding</Label>
          <span className="text-xs text-muted-foreground">{spacing.paddingTop ?? 48}px</span>
        </div>
        <PremiumSlider
          value={[spacing.paddingTop ?? 48]}
          onValueChange={([value]) => onChange({ spacing: { ...spacing, paddingTop: value } })}
          min={0}
          max={96}
          step={4}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal">Bottom Padding</Label>
          <span className="text-xs text-muted-foreground">{spacing.paddingBottom ?? 48}px</span>
        </div>
        <PremiumSlider
          value={[spacing.paddingBottom ?? 48]}
          onValueChange={([value]) => onChange({ spacing: { ...spacing, paddingBottom: value } })}
          min={0}
          max={96}
          step={4}
        />
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
        description="Bar sticks to top when scrolling"
      />

      {safeSettings.enableStickyBar && (
        <ToggleField
          label="Enable Sticky on Scroll Up"
          checked={safeSettings.enableStickyOnScrollUp ?? false}
          onChange={(checked) => onChange({ enableStickyOnScrollUp: checked })}
          description="Bar smoothly appears when scrolling up, hides when scrolling down"
        />
      )}

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

      <ColorPicker
        label="Button Color"
        value={safeSettings.buttonColor || "#2563eb"}
        onChange={(value) => onChange({ buttonColor: value })}
      />

      <ColorPicker
        label="Button Text Color"
        value={safeSettings.buttonTextColor || "#ffffff"}
        onChange={(value) => onChange({ buttonTextColor: value })}
      />

      <ToggleField
        label="Show Avatar"
        checked={safeSettings.showAvatar ?? true}
        onChange={(checked) => onChange({ showAvatar: checked })}
        description="Display your profile picture in the bar"
      />

      <ColorPicker
        label="Background Color"
        value={safeSettings.colors?.backgroundColor || "#ffffff"}
        onChange={(value) => onChange({ colors: { ...safeSettings.colors, backgroundColor: value } })}
      />

      <ColorPicker
        label="Text Color"
        value={safeSettings.colors?.textColor || "#000000"}
        onChange={(value) => onChange({ colors: { ...safeSettings.colors, textColor: value } })}
      />
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

      <ColorPicker
        label="Background Color"
        value={safeSettings.backgroundColor || "#1a1a1a"}
        onChange={(value) => onChange({ backgroundColor: value })}
      />

      <ColorPicker
        label="Text Color"
        value={safeSettings.textColor || "#ffffff"}
        onChange={(value) => onChange({ textColor: value })}
      />

      <ColorPicker
        label="Button Background Color"
        value={safeSettings.buttonColor || "#4b5563"}
        onChange={(value) => onChange({ buttonColor: value })}
      />

      <ColorPicker
        label="Button Text Color"
        value={safeSettings.buttonTextColor || "#ffffff"}
        onChange={(value) => onChange({ buttonTextColor: value })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal">Button Border Radius</Label>
          <span className="text-xs text-muted-foreground">{safeSettings.buttonBorderRadius ?? 8}px</span>
        </div>
        <PremiumSlider
          value={[safeSettings.buttonBorderRadius ?? 8]}
          onValueChange={([value]) => onChange({ buttonBorderRadius: value })}
          min={0}
          max={24}
          step={2}
        />
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal">Border Radius</Label>
          <span className="text-xs text-muted-foreground">{safeSettings.borderRadius ?? 8}px</span>
        </div>
        <PremiumSlider
          value={[safeSettings.borderRadius ?? 8]}
          onValueChange={([value]) => onChange({ borderRadius: value })}
          min={0}
          max={24}
          step={2}
        />
      </div>

      <ColorPicker
        label="Background Color"
        value={safeSettings.backgroundColor || "#ffffff"}
        onChange={(value) => onChange({ backgroundColor: value })}
      />

      <ColorPicker
        label="Button Color"
        value={safeSettings.buttonColor || "#2563eb"}
        onChange={(value) => onChange({ buttonColor: value })}
      />

      <ColorPicker
        label="Button Text Color"
        value={safeSettings.buttonTextColor || "#ffffff"}
        onChange={(value) => onChange({ buttonTextColor: value })}
      />
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
