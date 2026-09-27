"use client"

import React from "react"
import { useStoreBuilder } from "./store-builder-context"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ImageUpload } from "@/components/app/image-upload"
import { CoverImageEditor } from "./cover-image-editor"
import { OnepageAvatarPicker } from "@/components/shared/onepage-avatar-picker"
import { CoverImageLibraryModal } from "./cover-image-library-modal"
import { coverCropStyle, cropFromSettings } from "@/lib/images/cover-crop"
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
  CheckCircle,
  Check,
  Heart,
  Download,
  Upload,
  Sparkles,
  Image as ImageLucide,
  HelpCircle,
  ExternalLink,
  Navigation,
  PanelBottom,
  Columns,
  AlignLeft,
  CreditCard,
  Link2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
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
  AboutSettings,
  AboutMediaItem,
  GlobalStoreSettings,
  FAQSettings,
  FAQItem,
  ThemePreset,
  VerifiedBadgeType,
  NavLink,
  FooterSettings,
  FooterColumnType,
} from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search, ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { SocialLinksEditor } from "@/components/social/social-links-editor"
import { MediaItemsEditor } from "@/components/social/media-items-editor"
import { SOCIAL_PLATFORM_KEYS, type SocialPlatformKey } from "@/lib/social/platforms"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getIconComponent as sectionIcon } from "./section-icons"

// Niche categories (mirrored from onboarding)
const NICHE_PRIMARY = [
  "Templates","Courses","Guides","Software","Assets","Memberships",
  "Design Kits","Audio","Video","Education","Productivity","Marketing",
  "Business","Photography","Writing","Finance",
]
const NICHE_EXTENDED = [
  "3D Models","Animations","Apps","Art","Branding","Coaching","Community",
  "Consulting","Content","Crafts","Data","Developer Tools","E-books",
  "Fashion","Fitness","Food & Recipes","Gaming","Graphics","Health",
  "Illustrations","Investing","Legal","Lifestyle","Music","Newsletter",
  "Notion Templates","Podcast","Print on Demand","Real Estate","SaaS",
  "Social Media","Spreadsheets","Startup","Stock Photos","Themes","Trading",
  "UI Kits","Web Design","Wellness","Workshops","Automation","Beauty",
  "Blogging","Calendars","Checklists","Copywriting","Crypto","Dance",
  "Digital Art","Email Marketing","Engineering","Entrepreneurship","Events",
  "Figma Templates","Fonts","Freelancing","Home & Garden","Icons",
  "Interior Design","Journaling","Language Learning","Meditation","Mindfulness",
  "Mockups","Parenting","Personal Finance","Planners","Presentation Templates",
  "Project Management","Remote Work","Resume Templates","Self-Improvement",
  "SEO","Side Hustle","Spirituality","Sports","Study Notes","Travel",
  "Video Editing","Yoga","AI Tools","AI Prompts","Amazon KDP","Android Apps",
  "Arduino","Astrology","Bookkeeping","Brand Strategy","Canva Templates",
  "Career Coaching","Children's Education","Cinema LUTs","Coding Courses",
  "Comic Art","Conversion Optimization","Cooking Classes","Customer Support",
  "Cybersecurity","Data Science","Discord Communities","Dropshipping",
  "Etsy Printables","Excel Dashboards","Game Assets","Gumroad Templates",
  "HR & Recruiting","iOS Apps","Illustrator Brushes","Interview Prep",
  "Kids Activities","Kotlin Development","Lead Magnets","LinkedIn Growth",
  "Machine Learning","Meal Plans","Micro SaaS","No-Code Tools",
  "Online Tutoring","Packaging Design","Paid Ads","Pitch Decks",
  "Podcast Editing","Prayer & Faith","Procreate Brushes","Product Research",
  "Public Speaking","React Templates","Sales Funnels","Script Writing",
  "Shopify Apps","Startup Legal","Teaching Resources","UI Animation",
  "Virtual Assistance","Wedding Templates","WordPress Themes","YouTube Growth",
]
const ALL_NICHES = [...NICHE_PRIMARY, ...NICHE_EXTENDED]

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
  presetColors = ['#000000', '#374151', '#3b82f6', '#10b981', '#f59e0b'],
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  presetColors?: string[];
}) {
  // Ensure only 5 preset colors are shown
  const displayColors = presetColors.slice(0, 5)

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
      {/* Suggested Colors - 5 perfectly round circles */}
      <div className="flex gap-2 pt-1">
        {displayColors.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={cn(
              "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0 aspect-square",
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
  about: <Info className="h-5 w-5" />,
  faq: <HelpCircle className="h-5 w-5" />,
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
  about: "About",
  faq: "FAQ",
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
  // About and FAQ sections are not draggable - always fixed positions
  const isAboutSection = section.type === "about"
  const isFaqSection = section.type === "faq"
  const isFixedSection = isAboutSection || isFaqSection
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: isFixedSection,
  })

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
        !section.settings.visible && section.type !== "reviews" && section.type !== "about" && section.type !== "faq" && "opacity-50",
      )}
      onClick={onSelect}
    >
      {/* Only show drag handle for non-fixed sections (About and FAQ are fixed) */}
      {!isFixedSection ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-4" /> // Placeholder for spacing
      )}

      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
          isSelected ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400" : "bg-muted text-muted-foreground",
        )}
      >
        {sectionIcons[section.type]}
      </span>

      <span className="flex-1 truncate text-sm font-medium">{sectionNames[section.type]}</span>

      {/* Fixed sections (About, FAQ) - show "Locked" indicator */}
      {isFaqSection && (
        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Locked</span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Reviews, About, and FAQ must always be present (cannot be hidden) */}
        {section.type !== "reviews" && section.type !== "about" && section.type !== "faq" && (
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

        {/* FAQ sections cannot be deleted */}
        {!section.locked && section.type !== "faq" && (
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
    niche_tags?: string[] | null
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
  const [settingsTab, setSettingsTab] = useState<"basic" | "seo" | "badge" | "theme" | "social" | "domain">("basic")
  const [showNichePopup, setShowNichePopup] = useState(false)
  const [nicheSearch, setNicheSearch] = useState("")

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
      { id: "domain" as const, label: "Custom Domain", icon: Globe },
    ]

    // Theme tab is available for all page types (shop and product)
    const settingsTabs = allSettingsTabs

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
              // Show tooltip for Theme Presets tab on product pages
              const showTooltip = tab.id === "theme" && currentPageType === "product"

              const tabButton = (
                <button
                  onClick={() => setSettingsTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-3 py-2.5 transition-all text-left cursor-pointer",
                    settingsTab === tab.id
                      ? "bg-[#f3f4f6] border border-[#d1d5db] dark:bg-zinc-800 dark:border-zinc-600"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                      settingsTab === tab.id
                        ? "bg-[#e5e7eb] text-[#374151] dark:bg-zinc-700 dark:text-zinc-200"
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

              if (showTooltip) {
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      {tabButton}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="max-w-[200px]">
                      The theme styles for the product pages apply only for product pages
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return <React.Fragment key={tab.id}>{tabButton}</React.Fragment>
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
                    placeholder="My Store"
                    className={!(globalSettings.storeName || profile?.display_name) ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  {!(globalSettings.storeName || profile?.display_name) ? (
                    <p className="text-xs text-red-500">Store name cannot be empty</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Updates your creator display name
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-bio">Bio</Label>
                  <Textarea
                    id="store-bio"
                    value={(headerSettings as any)?.bio ?? (creator?.bio || "")}
                    onChange={(e) => updateHeaderSettings({ bio: e.target.value })}
                    placeholder="Enter your bio description..."
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your bio description shown below your profile picture
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Niche</Label>
                  {/*
                    It is not shown on the profile any more — the pill above
                    the bio is gone — so saying so would be a lie a creator
                    would only catch by looking. What it still does is decide
                    where they turn up in Explore, which is the reason to set
                    it.
                  */}
                  <p className="text-xs text-muted-foreground mb-1">
                    Where you appear in Explore. Not shown on your page.
                  </p>
                  {(() => {
                    const currentTag: string = (globalSettings.storeNicheTags ?? creator?.niche_tags ?? [])[0] ?? ""
                    const filteredNiches = nicheSearch
                      ? ALL_NICHES.filter(n => n.toLowerCase().includes(nicheSearch.toLowerCase()))
                      : ALL_NICHES
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowNichePopup(true)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors",
                            currentTag
                              ? "border-purple-400 bg-purple-50 text-purple-700"
                              : "border-neutral-300 bg-white text-neutral-500 hover:border-purple-400"
                          )}
                        >
                          <span>{currentTag || "Select niche..."}</span>
                          {currentTag ? (
                            <X
                              className="w-3.5 h-3.5 shrink-0 text-purple-500 hover:text-purple-800"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateGlobalSettings({ storeNicheTags: [] })
                              }}
                            />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>

                        <Dialog open={showNichePopup} onOpenChange={(open) => {
                          setShowNichePopup(open)
                          if (!open) setNicheSearch("")
                        }}>
                          <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
                            <div className="p-4 border-b flex flex-row items-center gap-3">
                              <button
                                onClick={() => { setShowNichePopup(false); setNicheSearch("") }}
                                className="hover:bg-gray-100 p-1 rounded-lg transition-colors"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              <h2 className="text-base font-semibold flex-1 text-center pr-8">Select Niche</h2>
                            </div>
                            <div className="p-3 border-b">
                              <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-gray-100">
                                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                                <input
                                  type="text"
                                  value={nicheSearch}
                                  onChange={(e) => setNicheSearch(e.target.value)}
                                  placeholder="Search niches..."
                                  className="flex-1 text-sm outline-none bg-transparent"
                                />
                              </div>
                            </div>
                            <div className="p-4 max-h-[360px] overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                {filteredNiches.map((niche) => (
                                  <button
                                    key={niche}
                                    type="button"
                                    onClick={() => {
                                      updateGlobalSettings({ storeNicheTags: [niche] })
                                      setShowNichePopup(false)
                                      setNicheSearch("")
                                    }}
                                    className={cn(
                                      "px-3.5 py-2 rounded-full text-xs font-medium transition-all border-2",
                                      currentTag === niche
                                        ? "bg-gray-100 border-black text-black"
                                        : "bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200"
                                    )}
                                  >
                                    {niche}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )
                  })()}
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
                      <Label className="text-sm font-medium">Social Media</Label>
                      <p className="text-xs text-muted-foreground">
                        Icons appear under your bio for every link you fill in
                      </p>
                    </div>
                  </div>

                  {/*
                    THE MASTER "Enable Social Media" TOGGLE IS GONE, and the two
                    panels below no longer hide behind it.

                    It defaulted to OFF and the builder wrote it out on every
                    save whether or not anyone touched it — the same trap the
                    sticky bar took three attempts to escape — so creators who
                    had filled in their links saw no icons on their page and no
                    reason why. The per-platform switches are the real control:
                    a link with nothing in it renders nothing.
                  */}

                  {(
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

                {/*
                  ONE EDITOR, shared with the storefront's own Edit-profile
                  dialog and with the social panel further down this same file.
                  This block used to be its own copy of the platform list, with
                  its own placeholders and an @-handle rule that applied to
                  Instagram and TikTok and nothing else. NO PER-PLATFORM
                  TOGGLE: typing a link in is what turns the icon on, clearing
                  it is what turns it off.
                */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Social Platforms</Label>
                  {(() => {
                    const shopHeader = headerSettings as ShopHeaderSettings
                    const socialLinks = shopHeader.socialLinks || ({} as SocialLinksConfig)
                    return (
                      <SocialLinksEditor
                        compact
                        value={Object.fromEntries(
                          SOCIAL_PLATFORM_KEYS.map((key) => [key, socialLinks[key]?.url || ""]),
                        )}
                        onChange={(key, url) =>
                          updateHeaderSettings({
                            socialLinks: {
                              ...socialLinks,
                              [key]: { ...socialLinks[key], url, enabled: !!url.trim() },
                            },
                          })
                        }
                      />
                    )
                  })()}
                </div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between h-9 px-3 font-normal text-sm"
                          >
                            <span>{verifiedBadgeLabels[globalSettings.verifiedBadgeType || "verified_creator"]}</span>
                            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[180px] z-[9999]">
                          {(Object.keys(verifiedBadgeLabels) as VerifiedBadgeType[]).map((type) => (
                            <DropdownMenuItem
                              key={type}
                              onClick={() => updateGlobalSettings({ verifiedBadgeType: type })}
                              className={cn(
                                "cursor-pointer",
                                (globalSettings.verifiedBadgeType || "verified_creator") === type && "font-medium bg-accent"
                              )}
                            >
                              {verifiedBadgeLabels[type]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    isDarkScheme(preset) ||
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
                            // For Bubble theme, use purple in thumbnail since white button is not visible on white background
                            // For Blacks theme, use light gray in thumbnail since the actual button is white on the black subscribe bar
                            backgroundColor: preset === "bubble" ? "#8b5cf6" : preset === "blacks" ? "#9ca3af" : theme.subscribeBar.buttonColor,
                            borderRadius: `${Math.min(theme.buttonBorderRadius || theme.borderRadius, 12)}px`
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

            {/* Custom Domain Content */}
            {settingsTab === "domain" && (
              <div className="space-y-4">
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                      <Globe className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Custom Domain</p>
                      <p className="text-xs text-muted-foreground">Use your own domain for your store</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    Connect a custom domain so visitors see <span className="font-mono font-medium text-purple-600">yourdomain.com</span> instead of <span className="font-mono text-muted-foreground">username.storelib.com</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Domain settings are managed in your account settings. Click below to open the Domains configuration page.</p>
                  <Button
                    variant="outline"
                    className="w-full gap-2 cursor-pointer h-10 text-sm font-semibold border-[#d1d5db] hover:bg-[#f3f4f6] hover:border-[#9ca3af] transition-all"
                    onClick={() => {
                      if (window.confirm("You may have unsaved changes. Open domain settings in a new tab?")) {
                        window.open("/app/settings?tab=domains", "_blank")
                      }
                    }}
                  >
                    <Globe className="h-4 w-4" />
                    Open Domain Settings
                    <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                  </Button>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">What you get:</p>
                  <ul className="space-y-1.5">
                    {["Custom URL for your store", "SSL certificate included", "Works with your OnePage too"].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-purple-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
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
                    ? "Header Section"
                    : selectedSectionId === "product-content"
                      ? "Product Content"
                      : selectedSectionId === "footer"
                        ? "Footer"
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
                creator={creator}
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
            ) : selectedSectionType === "faq" && selectedSection ? (
              <FAQSettingsForm
                settings={selectedSection.settings as FAQSettings}
                onChange={(settings) => updateSectionSettings(selectedSectionId, settings)}
                productId={selectedProductId}
              />
            ) : selectedSectionId === "footer" ? (
              <FooterSettingsForm
                settings={(draftConfig.globalSettings || defaultGlobalStoreSettings).footerSettings || {
                  footerType: "simple",
                  columns: ["navigation"],
                  showPaymentIcons: false,
                  showPoweredBy: true,
                  sectionHeight: 80,
                  headingSize: "h3",
                  textFontSize: "medium",
                }}
                onChange={(footerSettings) => updateGlobalSettings({ footerSettings })}
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
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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

              {/* FAQ Section - always positioned under Product Content, locked */}
              {(() => {
                const faqSection = draftConfig.sections.find((s) => s.type === "faq")
                if (!faqSection) return null
                return (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                      selectedSectionId === faqSection.id
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                        : "border-transparent hover:bg-muted/50",
                    )}
                    onClick={() => setSelectedSectionId(faqSection.id)}
                  >
                    <div className="w-4" /> {/* Placeholder for drag handle spacing */}
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                        selectedSectionId === faqSection.id
                          ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <HelpCircle className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-sm font-medium">FAQ</span>
                    <span className="text-xs text-muted-foreground">Locked</span>
                  </div>
                )
              })()}
            </>
          )}

          {/* Real draggable sections list (Reviews lives here like a normal section) */}
          {/* About and FAQ sections are excluded and rendered separately (FAQ after Product Content, About at bottom) */}
          {(() => {
            const sortableSections = draftConfig.sections.filter((s) => s.type !== "about" && s.type !== "faq")
            const aboutSection = draftConfig.sections.find((s) => s.type === "about")

            return (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortableSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {sortableSections.map((section) => (
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

                {/* About section - always at bottom, dedicated bar like Header */}
                {aboutSection && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                      selectedSectionId === aboutSection.id
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                        : "border-transparent hover:bg-muted/50",
                    )}
                    onClick={() => setSelectedSectionId(aboutSection.id)}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                        selectedSectionId === aboutSection.id
                          ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Info className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-sm font-medium">About</span>
                  </div>
                )}

                {/* Footer - always at bottom for shop pages */}
                {currentPageType === "shop" && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-all",
                      selectedSectionId === "footer"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20"
                        : "border-transparent hover:bg-muted/50",
                    )}
                    onClick={() => setSelectedSectionId("footer")}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                        selectedSectionId === "footer"
                          ? "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <PanelBottom className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-sm font-medium">Footer</span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      <div className="border-t border-border p-3 shrink-0 bg-background">
        <button
          onClick={openAddSectionModal}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/20 transition-colors cursor-pointer"
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

// ============================================
// Navigation Links Editor Dialog
// ============================================

interface NavLinksEditorProps {
  links: NavLink[]
  onChange: (links: NavLink[]) => void
}

function NavLinksEditorDialog({ links, onChange }: NavLinksEditorProps) {
  const [open, setOpen] = useState(false)
  const [localLinks, setLocalLinks] = useState<NavLink[]>(links)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editUrl, setEditUrl] = useState("")
  const [addingNew, setAddingNew] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newUrl, setNewUrl] = useState("")

  const handleOpen = () => {
    setLocalLinks(links)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingId(null)
    setAddingNew(false)
  }

  const handleApply = () => {
    onChange(localLinks)
    setOpen(false)
    setEditingId(null)
    setAddingNew(false)
  }

  const handleStartEdit = (link: NavLink) => {
    setEditingId(link.id)
    setEditLabel(link.label)
    setEditUrl(link.url)
  }

  const handleSaveEdit = (id: string) => {
    setLocalLinks(localLinks.map(l => l.id === id ? { ...l, label: editLabel, url: editUrl } : l))
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    setLocalLinks(localLinks.filter(l => l.id !== id))
  }

  const handleAddLink = () => {
    if (!newLabel.trim()) return
    const newLink: NavLink = {
      id: `nav-${Date.now()}`,
      label: newLabel.trim(),
      url: newUrl.trim(),
    }
    setLocalLinks([...localLinks, newLink])
    setNewLabel("")
    setNewUrl("")
    setAddingNew(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Edit Navigation Links
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden w-[95vw] sm:max-w-md max-h-[90vh]">
          <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
            <DialogTitle className="text-lg font-semibold text-center">Navigation Links</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-0">
              {localLinks.map((link, index) => (
                <div key={link.id}>
                  {editingId === link.id ? (
                    <div className="p-3 space-y-2 border border-blue-200 rounded-lg bg-blue-50/50 m-1">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Link label"
                        className="h-9 text-sm"
                        autoFocus
                      />
                      <Input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="URL (e.g., /shop or https://...)"
                        className="h-9 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(link.id)} className="flex-1 h-8 text-xs bg-blue-500 hover:bg-blue-600 text-white">
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-8 text-xs">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-3.5 border-b border-border last:border-b-0">
                      <GripVertical className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                      <span className="flex-1 text-sm font-medium">{link.label}</span>
                      <button
                        onClick={() => handleStartEdit(link)}
                        className="flex items-center justify-center w-9 h-9 border border-border rounded-lg hover:bg-muted transition-colors shrink-0"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(link.id)}
                        className="flex items-center justify-center w-9 h-9 border border-border rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new link form */}
              {addingNew ? (
                <div className="p-3 space-y-2 border border-blue-200 rounded-lg bg-blue-50/50 m-1 mt-2">
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Link label (e.g., Home)"
                    className="h-9 text-sm"
                    autoFocus
                  />
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="URL (e.g., / or https://...)"
                    className="h-9 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddLink} className="flex-1 h-8 text-xs bg-blue-500 hover:bg-blue-600 text-white">
                      Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewLabel(""); setNewUrl("") }} className="h-8 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingNew(true)}
                  className="flex items-center gap-2 w-full px-3 py-3.5 text-sm font-medium text-blue-500 hover:bg-blue-50 transition-colors border-t border-border mt-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Link
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border shrink-0">
            <button
              onClick={handleApply}
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Check className="h-4 w-4" />
              Apply Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ShopHeaderSettingsForm({
  settings,
  onChange,
  creatorId,
  creator,
}: {
  settings: ShopHeaderSettings
  onChange: (settings: Partial<ShopHeaderSettings>) => void
  creatorId: string
  creator?: {
    headline?: string | null
    bio?: string | null
  }
}) {
  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const [avatarCropperOpen, setAvatarCropperOpen] = useState(false)
  const [coverLibraryOpen, setCoverLibraryOpen] = useState(false)

  const handleCoverSave = (imageUrl: string, focalPoint: { x: number; y: number }) => {
    onChange({ coverImageUrl: imageUrl, coverFocalPoint: focalPoint, coverZoom: undefined })
  }

  const handleLibrarySelect = (imageUrl: string) => {
    onChange({ coverImageUrl: imageUrl, coverFocalPoint: { x: 50, y: 50 }, coverZoom: undefined })
  }

  const handleRemoveCover = () => {
    onChange({ coverImageUrl: undefined, coverFocalPoint: { x: 50, y: 50 }, coverZoom: undefined })
  }

  const handleRemoveAvatar = () => {
    onChange({ avatarUrl: "" })
  }

  const handleAvatarSave = (avatarUrl: string) => {
    onChange({ avatarUrl })
  }

  const handleAvatarFileSelect = () => {
    setAvatarCropperOpen(true)
  }

  const handleAvatarSizeChoice = (choice: AvatarSizeChoice, isMobile: boolean) => {
    const size = avatarSizeMap[choice]
    if (isMobile) {
      onChange({ mobileAvatarSizeChoice: choice, mobileAvatarSize: size })
    } else {
      onChange({ avatarSizeChoice: choice, avatarSize: size })
    }
  }

  // Initialize social links if not present
  const socialLinks: SocialLinksConfig = settings.socialLinks || ({} as SocialLinksConfig)

  /**
   * The URL is the only field anything writes now. `enabled` used to be
   * settable here too, and it is exactly the switch that let a creator fill in
   * a link and see nothing — so the parameter is gone rather than left as an
   * option nobody is supposed to use. The field survives in the stored shape
   * for old configs; nothing reads it.
   */
  const handleSocialLinkChange = (platform: SocialPlatformKey, url: string) => {
    onChange({
      socialLinks: {
        ...socialLinks,
        [platform]: { ...socialLinks[platform], url, enabled: !!url.trim() },
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Store Title */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store title</Label>
        <Input
          value={(settings as any).storeTitle || ""}
          onChange={(e) => onChange({ storeTitle: e.target.value } as any)}
          placeholder="Your Store Name"
        />
      </div>

      {/* Edit Settings Link */}
      <a
        href="/app/settings"
        className="flex items-center justify-start gap-1.5 text-purple-600 hover:text-purple-700 text-sm font-medium transition-colors"
      >
        <Settings className="h-3.5 w-3.5" />
        Edit Settings
      </a>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover Image</h4>

        {settings.coverImageUrl ? (
          <div className="space-y-3">
            <div
              className="relative aspect-[3/1] rounded-lg overflow-hidden border border-border cursor-pointer group"
              onClick={() => setCoverEditorOpen(true)}
            >
              {/* The crop the page draws, zoom included (lib/images/cover-crop):
                  a cover pinched closer in the profile sheet shows closer here. */}
              <img
                src={settings.coverImageUrl || "/placeholder.svg"}
                alt="Cover"
                style={{
                  ...coverCropStyle(cropFromSettings(settings.coverFocalPoint, settings.coverZoom)),
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
            className="relative w-20 h-20 rounded-full overflow-hidden border-[3px] border-border cursor-pointer group shrink-0"
            onClick={handleAvatarFileSelect}
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
              onClick={handleAvatarFileSelect}
            >
              {settings.avatarUrl ? "Change Photo" : "Upload Photo"}
            </Button>

            {settings.avatarUrl && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleRemoveAvatar}>
                Remove
              </Button>
            )}

            <p className="text-xs text-muted-foreground">{settings.avatarUrl ? "Click avatar to edit" : "Shows initials if empty"}</p>
            {/* One photo: this is the account's, not a picture this page keeps to itself (lib/account/identity). */}
            <p className="text-xs text-muted-foreground">This is your profile photo. It is shown on your creator page, your OnePage, your products and your receipts.</p>
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

          <div className="space-y-2 pt-2">
            <ColorPicker
              label="Profile Image Border"
              value={settings.profileImageBorderColor || "#e5e7eb"}
              onChange={(value) => onChange({ profileImageBorderColor: value })}
              description="Border color for the profile image circle"
            />
          </div>

          <div className="space-y-2 pt-3" id="sidebar-bio-section">
            <Label className="text-sm font-medium">Bio</Label>
            <Textarea
              id="sidebar-bio-input"
              value={settings.bio ?? creator?.bio ?? ""}
              onChange={(e) => onChange({ bio: e.target.value })}
              placeholder="Enter your bio description..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Your bio description shown below your profile picture
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Header Background</h4>
        <div className="space-y-2">
          <ColorPicker
            label="Background Color"
            value={settings.colors?.backgroundColor || "#ffffff"}
            onChange={(value) => onChange({ colors: { ...settings.colors, backgroundColor: value } })}
            description="Background color for the header section"
          />
        </div>
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
          {/*
            "Show Category" was here, and it switched a grey pill above the bio
            on and off. The pill is gone, so the switch would have controlled
            nothing. The niche it named is still set below, under Niche, and
            still decides where a creator appears in Explore.
          */}
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social Media</h4>

        {/* No master toggle here either — see the note in the header panel.
            Filling a link in is what turns its icon on. */}
        {(
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

            {/*
              The same editor again — this was the fifth copy of the list.

              THE AMBER "URL doesn't appear to be an Instagram link" WARNING IS
              GONE WITH IT. It matched the hostname against a regex, so a
              perfectly good `instagr.am/x` short link was flagged and a
              nonsense `instagram.com.evil.tld` was not; and it was only a
              warning, so it stopped nobody. What a link has to be is decided
              on the server, where it is stored.
            */}
            <SocialLinksEditor
              compact
              value={Object.fromEntries(SOCIAL_PLATFORM_KEYS.map((key) => [key, socialLinks[key]?.url || ""]))}
              onChange={handleSocialLinkChange}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</h4>
        <ColorPicker
          label="Texts Color"
          value={settings.textsColor || ""}
          onChange={(value) => onChange({ textsColor: value })}
          description="Color for stats, icons, seller name, and bio"
        />
      </div>

      <CoverImageEditor
        open={coverEditorOpen}
        onOpenChange={setCoverEditorOpen}
        currentImageUrl={settings.coverImageUrl}
        currentFocalPoint={settings.coverFocalPoint}
        onSave={handleCoverSave}
      />

      <OnepageAvatarPicker
        open={avatarCropperOpen}
        onOpenChange={setAvatarCropperOpen}
        onSave={handleAvatarSave}
        bucket="onepage-assets"
        folder="avatars"
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
            href={`https://www.storelib.com/app/products/${productId}`}
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
        {/* "Show Sales Announcement" was here. The line it switched — "N people
            have purchased this", under What's included — is gone, so the
            switch controlled nothing. */}
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
          <Slider
            min={0}
            max={32}
            step={1}
            value={[settings.buttonsBorderRadius ?? 8]}
            onValueChange={([value]) => onChange({ buttonsBorderRadius: value })}
          />
          <p className="text-xs text-muted-foreground">Affects Add to Cart, Buy, and Wishlist buttons</p>
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

      {section.type === "image-text" && <ImageTextSettingsForm settings={settings as ImageTextSettings} onChange={onChange} products={products} />}
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

      {section.type === "about" && <AboutSettingsForm settings={settings as AboutSettings} onChange={onChange} />}

      {section.type === "featured-products" ? (
        <ProductSpacingSettings
          spacing={{ ...settings.spacing, paddingLeft: 8, paddingRight: 8 }}
          onChange={(spacing) => onChange({ spacing: { ...spacing, paddingLeft: 8, paddingRight: 8 } })}
        />
      ) : section.type === "reviews" ? (
        <ProductSpacingSettings
          spacing={{ ...settings.spacing, paddingLeft: 7, paddingRight: 7 }}
          onChange={(spacing) => onChange({ spacing: { ...spacing, paddingLeft: 7, paddingRight: 7 } })}
        />
      ) : (
        <SpacingSettings spacing={settings.spacing} onChange={(spacing) => onChange({ spacing })} />
      )}
      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  )
}

function ImageTextSettingsForm({
  settings,
  onChange,
  products = [],
}: {
  settings: ImageTextSettings
  onChange: (settings: Partial<ImageTextSettings>) => void
  products?: Array<{ id: string; title: string; slug?: string; thumbnail_url?: string }>
}) {
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState("")

  // Determine current link mode
  const buttonLinkType = settings.buttonLinkType || (settings.buttonProductSlug ? "product" : "custom")

  // Find selected product for display
  const selectedProduct = products.find(
    (p) => p.slug === settings.buttonProductSlug || p.id === settings.buttonProductId
  )

  // Filter products for search
  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(productSearchQuery.toLowerCase())
  )

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

      <ToggleField label="Enable Button" checked={settings.showButton} onChange={(checked) => onChange({ showButton: checked })} />

      {settings.showButton && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-normal">Button Text</Label>
            <Input value={settings.buttonText || ""} onChange={(e) => onChange({ buttonText: e.target.value })} className="h-9" />
          </div>

          {/* Button Link Type Selector */}
          <div className="space-y-3">
            <Label className="text-sm font-normal">Button Link</Label>
            <Select
              value={buttonLinkType}
              onValueChange={(value: "product" | "custom") => {
                onChange({
                  buttonLinkType: value,
                  // Clear the other type's values when switching
                  ...(value === "product"
                    ? { buttonUrl: undefined }
                    : { buttonProductId: undefined, buttonProductSlug: undefined }),
                })
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Link to product</SelectItem>
                <SelectItem value="custom">Custom URL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product Selector - shows when "Link to product" is selected */}
          {buttonLinkType === "product" && (
            <div className="space-y-2">
              <Label className="text-sm font-normal">Select Product</Label>
              <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
                  >
                    {selectedProduct ? (
                      <>
                        <div className="w-10 h-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                          {selectedProduct.thumbnail_url ? (
                            <img
                              src={selectedProduct.thumbnail_url}
                              alt={selectedProduct.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
                          <p className="text-xs text-muted-foreground">Click to change</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">Select a product...</p>
                        </div>
                      </>
                    )}
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-32px)] max-w-md sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
                  <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/50">
                    <DialogHeader className="space-y-1">
                      <DialogTitle className="text-lg sm:text-xl font-semibold">Select Product</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                        Choose a product to link the button to
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4 sm:px-6 sm:pb-6">
                    {/* Search input */}
                    <div className="my-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          className="pl-9 h-10 sm:h-11 text-sm rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
                        />
                      </div>
                    </div>

                    {/* Products list */}
                    <div className="flex-1 overflow-y-auto -mx-1 px-1" style={{ maxHeight: "calc(85vh - 220px)" }}>
                      <div className="space-y-2 pb-2">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((product) => {
                            const isSelected = product.slug === settings.buttonProductSlug || product.id === settings.buttonProductId
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => {
                                  onChange({
                                    buttonLinkType: "product",
                                    buttonProductId: product.id,
                                    buttonProductSlug: product.slug || product.id,
                                    buttonUrl: undefined,
                                  })
                                  setIsProductModalOpen(false)
                                  setProductSearchQuery("")
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                                  isSelected
                                    ? "bg-primary/10 border-2 border-primary"
                                    : "bg-muted/50 border-2 border-transparent hover:bg-muted"
                                )}
                              >
                                <div className="w-12 h-12 rounded-lg bg-background overflow-hidden flex-shrink-0">
                                  {product.thumbnail_url ? (
                                    <img
                                      src={product.thumbnail_url}
                                      alt={product.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Package className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{product.title}</p>
                                </div>
                                {isSelected && (
                                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                                )}
                              </button>
                            )
                          })
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Package className="w-10 h-10 mb-3 opacity-40" />
                            <p className="text-sm">
                              {productSearchQuery ? `No products found for "${productSearchQuery}"` : "No products available"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Custom URL Input - shows when "Custom URL" is selected */}
          {buttonLinkType === "custom" && (
            <div className="space-y-2">
              <Label className="text-sm font-normal">Custom URL</Label>
              <Input
                value={settings.buttonUrl || ""}
                onChange={(e) =>
                  onChange({
                    buttonUrl: e.target.value,
                    buttonProductId: undefined,
                    buttonProductSlug: undefined,
                  })
                }
                className="h-9"
                placeholder="https://"
              />
              <p className="text-xs text-muted-foreground">Opens in a new tab when clicked</p>
            </div>
          )}

          {/* Button Color Customizer */}
          <div className="space-y-2">
            <Label className="text-sm font-normal">Button Color</Label>
            <ColorPicker
              value={settings.buttonColor || "#374151"}
              onChange={(value) => onChange({ buttonColor: value })}
              presetColors={["#374151", "#000000", "#3b82f6", "#10b981", "#f59e0b"]}
            />
          </div>

          {/* Button Text Color Customizer */}
          <div className="space-y-2">
            <Label className="text-sm font-normal">Button Text Color</Label>
            <ColorPicker
              value={settings.buttonTextColor || "#ffffff"}
              onChange={(value) => onChange({ buttonTextColor: value })}
              presetColors={["#ffffff", "#000000", "#374151", "#3b82f6", "#10b981"]}
            />
          </div>
        </>
      )}
    </div>
  )
}

// Available icons for benefits section - comprehensive library with diverse icons
const BENEFIT_ICONS = [
  // Success & Verification
  "check-circle", "check", "check-square", "verified", "badge-check", "circle-check",
  // Rating & Recognition
  "star", "star-half", "award", "trophy", "medal", "crown", "ribbon", "badge",
  // Emotions & Social
  "heart", "thumbs-up", "smile", "laugh", "party-popper", "hand-heart", "handshake",
  // Security & Trust
  "shield", "shield-check", "lock", "key", "fingerprint", "scan", "eye", "eye-off",
  // Energy & Speed
  "zap", "bolt", "rocket", "flame", "sparkles", "wand", "magic", "flash",
  // Target & Goals
  "target", "crosshair", "focus", "bullseye", "compass", "navigation",
  // Gift & Rewards
  "gift", "present", "box", "package", "shopping-bag", "shopping-cart",
  // Time & Schedule
  "clock", "timer", "calendar", "alarm", "hourglass", "watch", "history",
  // Communication
  "mail", "message-circle", "message-square", "phone", "video", "mic", "megaphone", "bell",
  // Location & Travel
  "globe", "map-pin", "map", "plane", "car", "truck", "ship", "train",
  // Money & Business
  "credit-card", "wallet", "dollar-sign", "percent", "tag", "receipt", "coins", "piggy-bank", "trending-up", "chart-bar", "bar-chart",
  // Bookmarks & Notes
  "bookmark", "flag", "pin", "paperclip", "link", "link-2",
  // Media & Sound
  "headphones", "speaker", "volume-2", "music", "radio", "podcast",
  // Visual & Image
  "camera", "image", "film", "palette", "brush", "pen-tool", "dropper",
  // Files & Data
  "download", "upload", "cloud", "cloud-download", "cloud-upload", "server", "database", "hard-drive",
  // Devices
  "cpu", "monitor", "smartphone", "laptop", "tablet", "tv", "printer",
  // Network & Connectivity
  "wifi", "bluetooth", "signal", "satellite", "rss", "share", "share-2",
  // Power & Settings
  "power", "settings", "sliders", "toggle-left", "toggle-right",
  // Tools
  "wrench", "hammer", "screwdriver", "tool", "scissors", "ruler",
  // Writing & Edit
  "pen", "pencil", "edit", "edit-2", "edit-3", "type", "text-cursor",
  // Copy & Clipboard
  "copy", "clipboard", "clipboard-check", "clipboard-list",
  // Files & Folders
  "file", "file-text", "file-plus", "folder", "folder-open", "archive", "inbox",
  // Commerce & Store
  "store", "storefront", "building", "building-2", "warehouse",
  // Nature
  "tree", "leaf", "flower", "sun", "moon", "cloud-sun", "rainbow", "umbrella",
  // Health & Wellness
  "droplet", "activity", "heart-pulse", "heartbeat", "thermometer", "stethoscope",
  // Fitness
  "dumbbell", "bicep", "running", "bike", "hiking",
  // Food & Drink
  "apple", "coffee", "cup", "utensils", "pizza", "cake",
  // Education
  "book", "book-open", "graduation-cap", "school", "library", "bookmark-check",
  // Brain & Ideas
  "brain", "lightbulb", "lamp", "idea", "bulb",
  // Games & Fun
  "puzzle", "gamepad", "dice", "joystick", "game-controller",
  // Premium & Luxury
  "gem", "diamond", "sparkle", "shine", "glow",
  // Math & Symbols
  "infinity", "plus", "minus", "x", "divide", "equal", "hash",
  // People & Users
  "users", "user", "user-check", "user-plus", "user-star", "people", "group", "team",
  // Arrows & Direction
  "arrow-right", "arrow-up", "arrow-down", "chevron-right", "trending-up", "move",
  // Interface
  "menu", "grid", "list", "layout", "columns", "rows", "table",
  // Misc Useful
  "refresh", "repeat", "sync", "rotate", "undo", "redo",
  "help-circle", "info", "alert-circle", "alert-triangle", "x-circle", "x-octagon",
  "thumbtack", "magnet", "layers", "stack", "component", "puzzle-piece",
  "calendar-check", "calendar-star", "shield-star", "user-shield"
] as const

// Icon Picker Component for Benefits
function BenefitIconPicker({
  selectedIcon,
  customImageUrl,
  iconType,
  onSelectIcon,
  onUploadImage,
}: {
  selectedIcon: string
  customImageUrl?: string
  iconType?: "preset" | "custom"
  onSelectIcon: (icon: string, type: "preset" | "custom", customUrl?: string) => void
  onUploadImage: (url: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"icons" | "upload">(iconType === "custom" ? "upload" : "icons")

  const filteredIcons = BENEFIT_ICONS.filter((icon) =>
    icon.toLowerCase().includes(searchQuery.toLowerCase())
  )

  /*
    THIS USED TO BE `require("lucide-react")` AND ITS OWN COPY OF THE NAME MAP.
    A runtime lookup against the whole library is a bundler instruction to keep
    all 1736 icons, which is how 196 KB of pictograms ended up in the editor as
    well as on every product page. ./section-icons holds the registry, the
    aliases and the PascalCase fallback, generated from BENEFIT_ICONS above, so
    this picker and the live page resolve a name the same way by construction
    rather than by two lists agreeing.
  */
  const getIconComponent = (iconName: string) => sectionIcon(iconName)

  const IconComponent = getIconComponent(selectedIcon)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center overflow-hidden">
            {iconType === "custom" && customImageUrl ? (
              <img src={customImageUrl} alt="Custom icon" className="w-full h-full object-cover" />
            ) : (
              <IconComponent className="w-4 h-4 text-violet-500" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">Change icon</span>
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-24px)] max-w-[420px] sm:max-w-lg overflow-hidden flex flex-col p-0 gap-0 rounded-xl sm:rounded-2xl mx-auto">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 sm:px-5 sm:pt-5 sm:pb-3 border-b border-border/50 flex-shrink-0">
          <DialogHeader className="space-y-0.5">
            <DialogTitle className="text-base sm:text-lg font-semibold">Choose Icon</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select an icon or upload your own
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-shrink-0 overflow-x-hidden">
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "icons" | "upload")} className="space-y-3">
              {/* Tab buttons - compact */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("icons")}
                  className={cn(
                    "flex items-center justify-center gap-2 p-2.5 sm:p-3 rounded-lg border-2 transition-all",
                    activeTab === "icons"
                      ? "border-violet-500 bg-violet-500/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                  )}
                >
                  <Sparkles className={cn("w-4 h-4 sm:w-5 sm:h-5", activeTab === "icons" ? "text-violet-500" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", activeTab === "icons" ? "text-foreground" : "text-muted-foreground")}>
                    Icons
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className={cn(
                    "flex items-center justify-center gap-2 p-2.5 sm:p-3 rounded-lg border-2 transition-all",
                    activeTab === "upload"
                      ? "border-violet-500 bg-violet-500/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                  )}
                >
                  <ImageLucide className={cn("w-4 h-4 sm:w-5 sm:h-5", activeTab === "upload" ? "text-violet-500" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", activeTab === "upload" ? "text-foreground" : "text-muted-foreground")}>
                    Upload
                  </span>
                </button>
              </div>

              <TabsContent value="icons" className="mt-0 space-y-2 data-[state=inactive]:hidden">
                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search icons..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm rounded-lg bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-violet-500"
                  />
                </div>

                {/* Icons grid - compact height */}
                <div className="max-h-[240px] sm:max-h-[280px] overflow-y-auto rounded-lg">
                  <div className="grid grid-cols-6 sm:grid-cols-7 gap-1 p-0.5">
                    {filteredIcons.map((iconName) => {
                      const Icon = getIconComponent(iconName)
                      const isSelected = selectedIcon === iconName && iconType !== "custom"
                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => {
                            onSelectIcon(iconName, "preset")
                            setIsOpen(false)
                          }}
                          className={cn(
                            "aspect-square w-full flex items-center justify-center rounded-md transition-all touch-manipulation",
                            "min-h-[36px] sm:min-h-[40px]",
                            isSelected
                              ? "bg-violet-500 text-white shadow-md"
                              : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95"
                          )}
                          title={iconName.replace(/-/g, ' ')}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      )
                    })}
                  </div>
                  {filteredIcons.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Search className="w-6 h-6 mb-2 opacity-40" />
                      <p className="text-xs">No icons found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="upload" className="mt-0 space-y-3 data-[state=inactive]:hidden">
                <p className="text-xs text-muted-foreground">
                  Upload a custom image to use as the icon.
                </p>

                {/* Current custom icon with remove button */}
                {customImageUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                    <div className="w-14 h-14 rounded-full bg-violet-500/10 overflow-hidden ring-2 ring-violet-500/20 flex-shrink-0">
                      <img src={customImageUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground block">Current icon</span>
                      <span className="text-xs text-muted-foreground">Custom image uploaded</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectIcon("check-circle", "preset")
                        onUploadImage("")
                      }}
                      className="flex-shrink-0 p-2 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                      title="Remove custom image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}

                {/* Image upload area */}
                <div className="rounded-lg border-2 border-dashed border-border p-3 bg-muted/20">
                  <ImageUpload
                    bucket="store-builder-images"
                    folder="benefit-icons"
                    value=""
                    onChange={(url) => {
                      if (url) {
                        onUploadImage(url)
                        onSelectIcon(selectedIcon, "custom", url)
                        setIsOpen(false)
                      }
                    }}
                    aspectRatio="compact"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BenefitsSettingsForm({
  settings,
  onChange,
}: {
  settings: BenefitsSettings
  onChange: (settings: Partial<BenefitsSettings>) => void
}) {
  const updateBenefit = (index: number, field: string, value: any) => {
    const newBenefits = [...settings.benefits]
    newBenefits[index] = { ...newBenefits[index], [field]: value }
    onChange({ benefits: newBenefits })
  }

  const updateBenefitIcon = (index: number, icon: string, iconType: "preset" | "custom", customUrl?: string) => {
    const newBenefits = [...settings.benefits]
    newBenefits[index] = {
      ...newBenefits[index],
      icon,
      iconType,
      customImageUrl: iconType === "custom" ? customUrl : undefined,
    }
    onChange({ benefits: newBenefits })
  }

  const addBenefit = () => {
    onChange({
      benefits: [
        ...settings.benefits,
        {
          id: `benefit_${Date.now()}`,
          icon: "check-circle",
          iconType: "preset" as const,
          title: "New Benefit",
          description: "Description here",
        },
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

      {/* Carousel Toggle - Mobile Only */}
      <div className="flex items-center justify-between py-2">
        <div className="space-y-0.5">
          <Label className="text-sm font-normal">Enable Carousel (Mobile)</Label>
          <p className="text-xs text-muted-foreground">Display benefits in a sliding carousel on mobile devices with swipe support</p>
        </div>
        <Switch
          checked={settings.enableCarousel ?? false}
          onCheckedChange={(checked) => onChange({ enableCarousel: checked })}
        />
      </div>

      {/* Autoplay Toggle - only show when carousel is enabled */}
      {settings.enableCarousel && (
        <div className="flex items-center justify-between py-2 pl-4 border-l-2 border-primary/20">
          <div className="space-y-0.5">
            <Label className="text-sm font-normal">Autoplay</Label>
            <p className="text-xs text-muted-foreground">Automatically cycle through benefits</p>
          </div>
          <Switch
            checked={settings.autoplay ?? false}
            onCheckedChange={(checked) => onChange({ autoplay: checked })}
          />
        </div>
      )}

      {/* Columns - always show since it's for desktop layout */}
      <div className="space-y-2">
        <Label className="text-sm font-normal">Columns (Desktop)</Label>
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

      {/* Gap Settings */}
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Horizontal Gap</Label>
            <span className="text-xs text-muted-foreground">{settings.horizontalGap ?? 24}px</span>
          </div>
          <Slider
            value={[settings.horizontalGap ?? 24]}
            onValueChange={([value]) => onChange({ horizontalGap: value })}
            min={0}
            max={64}
            step={4}
            className="py-1"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Vertical Gap</Label>
            <span className="text-xs text-muted-foreground">{settings.verticalGap ?? 24}px</span>
          </div>
          <Slider
            value={[settings.verticalGap ?? 24]}
            onValueChange={([value]) => onChange({ verticalGap: value })}
            min={0}
            max={64}
            step={4}
            className="py-1"
          />
        </div>
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

            <div className="space-y-3 pr-8">
              {/* Icon Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Icon</Label>
                <BenefitIconPicker
                  selectedIcon={benefit.icon}
                  customImageUrl={benefit.customImageUrl}
                  iconType={benefit.iconType}
                  onSelectIcon={(icon, type, customUrl) => updateBenefitIcon(index, icon, type, customUrl)}
                  onUploadImage={(url) => updateBenefit(index, "customImageUrl", url)}
                />
              </div>

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

      {/*
        "Mobile Products Per Row" was here. A phone shows one now, whichever
        way the setting is saved, so a control offering two would be a
        promise the page does not keep. The stored value is left alone rather
        than migrated: it is simply no longer read.
      */}

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
      {/*
        There is no "Show Subscribe Bar" toggle any more. The bar is the one
        control on a creator page with a job to do — it always renders, and
        the storefront ignores any `visible: false` still sitting in an old
        saved config. What follows tunes it; nothing here can turn it off.
      */}

      <ToggleField
        label="Enable Sticky Bar"
        /*
          Defaults to ON. Reading `?? true` is only half of it — see
          `stickyBarChoiceMade` in SubscribeBarSettings for why a stored
          `false` cannot be trusted until a creator has actually touched this.
          Moving either switch records the choice, and from then on the
          storefront honours it exactly, off included.
        */
        checked={safeSettings.stickyBarChoiceMade ? (safeSettings.enableStickyBar ?? true) : true}
        onChange={(checked) => onChange({ enableStickyBar: checked, stickyBarChoiceMade: true })}
        description="Bar sticks to top when scrolling"
      />

      {(safeSettings.stickyBarChoiceMade ? (safeSettings.enableStickyBar ?? true) : true) && (
        <ToggleField
          label="Enable Sticky on Scroll Up"
          checked={safeSettings.stickyBarChoiceMade ? (safeSettings.enableStickyOnScrollUp ?? true) : true}
          onChange={(checked) => onChange({ enableStickyOnScrollUp: checked, stickyBarChoiceMade: true })}
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
        value={safeSettings.backgroundColor || safeSettings.colors?.backgroundColor || "#ffffff"}
        onChange={(value) => onChange({
          backgroundColor: value,
          colors: { ...safeSettings.colors, backgroundColor: value }
        })}
      />

      <ColorPicker
        label="Text Color"
        value={safeSettings.textColor || safeSettings.colors?.textColor || "#000000"}
        onChange={(value) => onChange({
          textColor: value,
          colors: { ...safeSettings.colors, textColor: value }
        })}
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
      <ProductSpacingSettings
        spacing={{ ...settings.spacing, paddingLeft: 7, paddingRight: 7 }}
        onChange={(spacing) => onChange({ spacing: { ...spacing, paddingLeft: 7, paddingRight: 7 } })}
      />
      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  )
}

/**
 * The media list — thumbnails, captions and drag-to-reorder — moved to
 * components/social/media-items-editor, which the storefront's own story
 * dialog now uses too. It was the fourth copy of the YouTube regex, and the
 * storefront's version of this list was a column of raw Supabase URLs.
 */

function AboutSettingsForm({
  settings,
  onChange,
}: {
  settings: AboutSettings
  onChange: (settings: Partial<AboutSettings>) => void
}) {
  const [youtubeUrl, setYoutubeUrl] = useState("")

  const addMediaItem = (type: "image" | "youtube", url: string) => {
    const newItem: AboutMediaItem = {
      id: `media_${Date.now()}`,
      type,
      url,
    }
    onChange({
      mediaItems: [...(settings.mediaItems || []), newItem],
    })
  }

  const removeMediaItem = (id: string) => {
    onChange({
      mediaItems: (settings.mediaItems || []).filter((item) => item.id !== id),
    })
  }

  const handleAddYoutubeVideo = () => {
    if (youtubeUrl.trim()) {
      addMediaItem("youtube", youtubeUrl.trim())
      setYoutubeUrl("")
    }
  }

  // About section only has top/bottom padding (left/right fixed at 0)
  const paddingTop = settings.spacing?.paddingTop ?? 48
  const paddingBottom = settings.spacing?.paddingBottom ?? 48

  return (
    <div className="space-y-4">
      {/* Show Sales Stats Toggle */}
      <ToggleField
        label="Show Sales Stats"
        description="Display sales count (joined year is always shown)"
        checked={settings.showSalesStats}
        onChange={(checked) => onChange({ showSalesStats: checked })}
      />

      {/* Show Products Stats Toggle */}
      <ToggleField
        label="Enable Products Stats"
        description="Display number of products in your shop"
        checked={settings.showProductsStats !== false}
        onChange={(checked) => onChange({ showProductsStats: checked })}
      />

      {/* Headline */}
      <div className="space-y-2">
        <Label className="text-sm font-normal">Headline</Label>
        <Input
          value={settings.headline || ""}
          onChange={(e) => onChange({ headline: e.target.value })}
          placeholder="e.g., About my shop"
          className="h-9"
        />
        <p className="text-xs text-muted-foreground">
          You can also click the placeholder in the preview to edit
        </p>
      </div>

      {/* About Content */}
      <div className="space-y-2">
        <Label className="text-sm font-normal">About Content</Label>
        <Textarea
          value={settings.aboutContent || ""}
          onChange={(e) => onChange({ aboutContent: e.target.value })}
          placeholder="Tell visitors about your shop, your story, what makes you unique..."
          rows={6}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          You can also click the placeholder in the preview to edit
        </p>
      </div>

      {/* Spacing - only top/bottom */}
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
              onValueChange={([value]) => onChange({ spacing: { ...settings.spacing, paddingTop: value, paddingLeft: 0, paddingRight: 0 } })}
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
              onValueChange={([value]) => onChange({ spacing: { ...settings.spacing, paddingBottom: value, paddingLeft: 0, paddingRight: 0 } })}
              min={0}
              max={96}
              step={4}
            />
          </div>
        </div>
      </div>

      {/* Colors */}
      <ColorSettings colors={settings.colors} onChange={(colors) => onChange({ colors })} />

      {/* Payment Methods - hidden from settings, always displayed in section */}

      {/* Media Section */}
      <div className="space-y-3 pt-2">
        <Label className="text-sm font-normal">Media</Label>
        <p className="text-xs text-muted-foreground">
          Add up to 5 images and 5 YouTube videos to showcase your shop. Drag to reorder.
        </p>

        {/* Count current media */}
        {(() => {
          const imageCount = (settings.mediaItems || []).filter(m => m.type === "image").length
          const youtubeCount = (settings.mediaItems || []).filter(m => m.type === "youtube").length
          const hasMaxYouTube = youtubeCount >= 5
          const hasMaxImages = imageCount >= 5

          return (
            <>
              {/* Image Upload - only if less than 5 images */}
              {!hasMaxImages && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Add Image ({imageCount}/5)</Label>
                  <ImageUpload
                    bucket="store-builder-images"
                    folder="about-media"
                    value=""
                    onChange={(url) => {
                      if (url) addMediaItem("image", url)
                    }}
                    aspectRatio="video"
                    maxSizeMB={10}
                  />
                </div>
              )}

              {/* YouTube URL Input - only if less than 5 YouTube videos */}
              {!hasMaxYouTube && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Add YouTube Video ({youtubeCount}/5)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="h-9 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddYoutubeVideo}
                      disabled={!youtubeUrl.trim()}
                      className="h-9"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {hasMaxYouTube && (
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  YouTube video limit reached (5/5). Remove a video to add a new one.
                </p>
              )}

              {hasMaxImages && (
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  Image limit reached (5/5). Remove an image to add a new one.
                </p>
              )}
            </>
          )
        })()}

        {/*
          The same editor the storefront's story dialog uses — thumbnails,
          captions, drag-to-reorder, and an editable link on a video. One
          component: the two lists were the same data with different
          affordances, and the worse one was the one creators saw on their own
          page.
        */}
        <MediaItemsEditor
          items={settings.mediaItems || []}
          onChange={(mediaItems) => onChange({ mediaItems })}
        />
      </div>
    </div>
  )
}

// Sortable FAQ Item component for drag and drop - supports both default and custom FAQs
function SortableFAQItem({
  faq,
  index,
  onUpdate,
  onRemove,
  isDefault,
}: {
  faq: FAQItem
  index: number
  onUpdate: (id: string, updates: Partial<FAQItem>) => void
  onRemove: (id: string) => void
  isDefault?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: faq.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 border rounded-lg space-y-3",
        isDefault ? "bg-muted/30 border-border/50" : "bg-background border-border",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className={cn("text-xs font-medium", isDefault ? "text-muted-foreground/70" : "text-muted-foreground")}>
            FAQ {index + 1}
            {isDefault && <span className="ml-1 text-[10px] opacity-70">(default)</span>}
          </span>
        </div>
        {!isDefault && (
          <button
            onClick={() => onRemove(faq.id)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isDefault ? (
        <p className="text-sm text-muted-foreground pl-1">
          {faq.question}
        </p>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Question"
            value={faq.question}
            onChange={(e) => onUpdate(faq.id, { question: e.target.value })}
            className="text-sm"
          />
          <Textarea
            placeholder="Answer"
            value={faq.answer}
            onChange={(e) => onUpdate(faq.id, { answer: e.target.value })}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      )}
    </div>
  )
}

// FAQ Settings Form for product pages - ALL FAQs (default + custom) can be reordered together
function FAQSettingsForm({
  settings,
  onChange,
  productId,
}: {
  settings: FAQSettings
  onChange: (settings: Partial<FAQSettings>) => void
  productId?: string
}) {
  const router = useRouter()

  // Default FAQs that cannot be deleted (3 total)
  const defaultFaqTemplates: FAQItem[] = [
    {
      id: "default-1",
      question: "How do I access my purchase?",
      answer: "After you complete checkout, you can download the product immediately on the download page. You'll also receive an email with the download link, so you can access it anytime from your inbox.",
      isDefault: true,
    },
    {
      id: "default-2",
      question: "Is there a refund policy?",
      answer: "Refund policies are set by individual creators. Please check product info or contact the seller directly if you have questions about refunds.",
      isDefault: true,
    },
    {
      id: "default-3",
      question: "How long do I have access?",
      answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.",
      isDefault: true,
    },
  ]

  // Get all FAQs in order - if allFaqs is set, use it; otherwise initialize with defaults then custom
  const getAllFaqs = (): FAQItem[] => {
    if (settings.allFaqs && settings.allFaqs.length > 0) {
      // Use stored order, but ensure all defaults are present
      const storedIds = new Set(settings.allFaqs.map(f => f.id))
      const missingDefaults = defaultFaqTemplates.filter(d => !storedIds.has(d.id))
      // If any defaults are missing, add them at the start
      if (missingDefaults.length > 0) {
        return [...missingDefaults, ...settings.allFaqs]
      }
      return settings.allFaqs
    }
    // Initialize with defaults first, then any custom FAQs
    const customFaqs = (settings.customFaqs || []).map(faq => ({ ...faq, isDefault: false }))
    return [...defaultFaqTemplates, ...customFaqs]
  }

  const allFaqs = getAllFaqs()
  const customFaqsCount = allFaqs.filter(f => !f.isDefault).length
  const maxCustomFaqs = 4
  const canAddMore = customFaqsCount < maxCustomFaqs

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Add new custom FAQ at the END (below all existing FAQs including defaults)
  const addCustomFaq = () => {
    if (!canAddMore) return
    const newFaq: FAQItem = {
      id: `custom-${Date.now()}`,
      question: "",
      answer: "",
      isDefault: false,
    }
    const updatedAllFaqs = [...allFaqs, newFaq]
    const updatedCustomFaqs = updatedAllFaqs.filter(f => !f.isDefault)
    onChange({
      allFaqs: updatedAllFaqs,
      customFaqs: updatedCustomFaqs
    })
  }

  const updateFaq = (id: string, updates: Partial<FAQItem>) => {
    const updated = allFaqs.map(faq =>
      faq.id === id ? { ...faq, ...updates } : faq
    )
    const updatedCustomFaqs = updated.filter(f => !f.isDefault)
    onChange({
      allFaqs: updated,
      customFaqs: updatedCustomFaqs
    })
  }

  const removeFaq = (id: string) => {
    // Only allow removing custom FAQs
    const faq = allFaqs.find(f => f.id === id)
    if (faq?.isDefault) return

    const updated = allFaqs.filter(faq => faq.id !== id)
    const updatedCustomFaqs = updated.filter(f => !f.isDefault)
    onChange({
      allFaqs: updated,
      customFaqs: updatedCustomFaqs
    })
  }

  const handleFaqDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = allFaqs.findIndex((faq) => faq.id === active.id)
      const newIndex = allFaqs.findIndex((faq) => faq.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(allFaqs, oldIndex, newIndex)
        const reorderedCustomFaqs = reordered.filter(f => !f.isDefault)
        onChange({
          allFaqs: reordered,
          customFaqs: reorderedCustomFaqs
        })
      }
    }
  }

  const handleEditProductFaqs = () => {
    if (productId) {
      window.open(`/app/products/${productId}`, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit FAQs Link */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          To edit FAQs, edit the product directly.
        </p>
        <button
          onClick={handleEditProductFaqs}
          disabled={!productId}
          className="text-xs text-purple-600 hover:text-purple-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
        >
          Edit
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* All FAQs with drag and drop - defaults + custom together */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">FAQs ({allFaqs.length})</Label>
          <span className="text-xs text-muted-foreground">
            {customFaqsCount}/{maxCustomFaqs} custom
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag to reorder all FAQs. Default FAQs cannot be deleted.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFaqDragEnd}>
          <SortableContext items={allFaqs.map(faq => faq.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {allFaqs.map((faq, index) => (
                <SortableFAQItem
                  key={faq.id}
                  faq={faq}
                  index={index}
                  onUpdate={updateFaq}
                  onRemove={removeFaq}
                  isDefault={faq.isDefault}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {canAddMore && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={addCustomFaq}
          >
            <Plus className="h-4 w-4" />
            Add FAQ
          </Button>
        )}
      </div>
    </div>
  )
}
