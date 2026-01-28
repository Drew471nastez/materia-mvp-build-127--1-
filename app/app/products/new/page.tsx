"use client"

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ChevronLeft,
  Check,
  Plus,
  X,
  Loader2,
  FileText,
  GripVertical,
  Info,
  Play,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  ExternalLink,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react"
import Link from "next/link"
import { DescriptionRichEditor } from "@/components/store-builder/description-rich-editor"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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

// Section definitions - internal refs for all sections
const SECTIONS = [
  { id: "about", name: "Title" },
  { id: "media", name: "Media" },
  { id: "content", name: "Content" },
  { id: "whatsIncluded", name: "Included" },
  { id: "faq", name: "FAQ" },
  { id: "files", name: "Files" },
  { id: "variants", name: "Variants" },
  { id: "pricing", name: "Pricing" },
  { id: "category", name: "Category" },
  { id: "settings", name: "Settings" },
  { id: "seo", name: "SEO" },
] as const

// Pills to show in the navigation bar (only these 5)
const PILL_SECTIONS = [
  { id: "about", name: "About" },
  { id: "media", name: "Media" },
  { id: "content", name: "Content" },
  { id: "settings", name: "Settings" },
  { id: "seo", name: "SEO" },
] as const

type SectionId = typeof SECTIONS[number]["id"]
type PillSectionId = typeof PILL_SECTIONS[number]["id"]

// Limits
const MAX_PHOTOS = 12
const MAX_YOUTUBE_VIDEOS = 2

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string
}

interface MediaItem {
  id: string
  type: "image" | "youtube"
  url: string
  thumbnailUrl?: string
}

// YouTube URL parser
const parseYouTubeUrl = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// YouTube embeds do NOT generate thumbnails - they are pure embeds only
// This ensures no extra media items are created for YouTube videos

// Sortable FAQ Item component for drag-and-drop reordering
interface SortableFAQItemProps {
  faq: {
    id: string
    question: string
    answer: string
    isDefault: boolean
  }
  onUpdate: (id: string, updates: { question?: string; answer?: string }) => void
  onRemove: (id: string) => void
}

function SortableFAQItem({ faq, onUpdate, onRemove }: SortableFAQItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: faq.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-gray-200 rounded-xl overflow-hidden bg-white ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="p-3 sm:p-4 bg-gray-50">
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Drag handle - touch friendly */}
          <button
            {...attributes}
            {...listeners}
            className="p-2 -ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 space-y-2 min-w-0">
            <Input
              value={faq.question}
              onChange={(e) => onUpdate(faq.id, { question: e.target.value })}
              className="h-9 text-sm font-medium border-gray-200"
              placeholder="Question..."
            />
            <Textarea
              value={faq.answer}
              onChange={(e) => onUpdate(faq.id, { answer: e.target.value })}
              className="text-sm border-gray-200 min-h-[60px]"
              placeholder="Answer..."
            />
          </div>

          {!faq.isDefault && (
            <button
              type="button"
              onClick={() => onRemove(faq.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
              title="Remove FAQ"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {faq.isDefault && (
          <p className="text-[10px] text-gray-400 mt-2 ml-9">Default FAQ (editable)</p>
        )}
      </div>
    </div>
  )
}

export default function NewProductPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editProductId = searchParams.get("edit") // Get product ID if editing
  const [activeSection, setActiveSection] = useState<SectionId>("about")
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [creator, setCreator] = useState<any>(null)
  const [isPageReady, setIsPageReady] = useState(false)

  // Product status tracking
  const [isPublished, setIsPublished] = useState(false)
  const [showNotification, setShowNotification] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState("")
  const [justSaved, setJustSaved] = useState(false) // Track if just saved (for button state)
  const savedValuesRef = useRef<string>("") // Track saved values to detect actual changes

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // YouTube inline input (no modal)
  const [showYoutubeInput, setShowYoutubeInput] = useState(false)
  const [youtubeInput, setYoutubeInput] = useState("")

  // Header scroll state
  const [isScrolled, setIsScrolled] = useState(false)

  // Refs for sections
  const sectionRefs = useRef<{ [key in SectionId]?: HTMLDivElement | null }>({})
  const pillBarRef = useRef<HTMLDivElement>(null)
  const pillScrollRef = useRef<HTMLDivElement>(null)
  const pillRefs = useRef<{ [key in SectionId]?: HTMLButtonElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // About section fields
  const [title, setTitle] = useState("")

  // Media section fields - unified draggable media
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Content tab fields
  const [description, setDescription] = useState("")
  const [callToAction, setCallToAction] = useState("")
  const [digitalFiles, setDigitalFiles] = useState<UploadedFile[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [fileUploadProgress, setFileUploadProgress] = useState(0)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const fileDragCounterRef = useRef(0)

  // Settings tab fields
  const [price, setPrice] = useState("")
  const [compareAtPrice, setCompareAtPrice] = useState("")
  const [slug, setSlug] = useState("")
  const [productType, setProductType] = useState<"digital" | "course">("digital")
  const [showSalesBadge, setShowSalesBadge] = useState(true)
  const [refundPolicyEnabled, setRefundPolicyEnabled] = useState(false)
  const [refundPolicyType, setRefundPolicyType] = useState("7_day")

  // SEO tab fields
  const [seoTitle, setSeoTitle] = useState("")
  const [seoDescription, setSeoDescription] = useState("")
  const seoManuallyEditedRef = useRef(false) // Track if user manually edited SEO description

  // Drag state for media
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Touch drag state for mobile
  const [touchDragIndex, setTouchDragIndex] = useState<number | null>(null)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null)
  const [touchCurrentPos, setTouchCurrentPos] = useState<{ x: number; y: number } | null>(null)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const touchDragRef = useRef<HTMLDivElement>(null)
  const mediaGridRef = useRef<HTMLDivElement>(null)

  // External file drag state for media picker
  const [isExternalDragOver, setIsExternalDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Ratio warning state for non-widescreen images
  const [ratioWarning, setRatioWarning] = useState<string | null>(null)

  // File renaming state
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [editingFileName, setEditingFileName] = useState("")

  // Variants state (max 3 variants)
  interface ProductVariant {
    id: string
    name: string
    description: string
    price: string // FINAL price for this variant (not additional)
    maxPurchases: string
    isExpanded: boolean
    assignedFiles: string[] // IDs of assigned digital files
  }
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const MAX_VARIANTS = 3

  // What's Included state (3 defaults + 5 custom max = 8 total)
  const DEFAULT_WHATS_INCLUDED = [
    "Instant download access",
    "All included files",
    "Lifetime access",
  ]
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>(DEFAULT_WHATS_INCLUDED)
  const MAX_WHATS_INCLUDED = 8

  // FAQ state (3 defaults + unlimited custom)
  interface FAQItem {
    id: string
    question: string
    answer: string
    isDefault?: boolean
  }
  const DEFAULT_FAQS: FAQItem[] = [
    { id: "default-1", question: "How do I access my purchase?", answer: "After checkout, download immediately on the download page. You'll also receive an email with the download link.", isDefault: true },
    { id: "default-2", question: "Is there a refund policy?", answer: "Refund policies are set by individual creators. Check product info or contact the seller for details.", isDefault: true },
    { id: "default-3", question: "How long do I have access?", answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.", isDefault: true },
  ]
  const [faqs, setFaqs] = useState<FAQItem[]>(DEFAULT_FAQS)

  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")

  // Limit product sales state
  const [limitSalesEnabled, setLimitSalesEnabled] = useState(false)
  const [salesLimit, setSalesLimit] = useState("")

  // AI suggestion states
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null)
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false)

  // DnD sensors for FAQ reorder (with touch support for mobile)
  const faqSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms delay before touch drag starts
        tolerance: 8, // 8px movement tolerance during delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle FAQ drag end - reorder FAQs
  const handleFaqDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setFaqs((prevFaqs) => {
        const oldIndex = prevFaqs.findIndex((faq) => faq.id === active.id)
        const newIndex = prevFaqs.findIndex((faq) => faq.id === over.id)
        return arrayMove(prevFaqs, oldIndex, newIndex)
      })
    }
  }, [])

  // Categories list (170+ options)
  const CATEGORIES = [
    // Digital Products
    "3D Assets", "3D Models", "3D Printing Files", "Ebooks", "Digital Art", "Stock Photos", "Stock Videos", "Audio Files",
    "Music Tracks", "Sound Effects", "Fonts", "Icons", "Graphics", "Illustrations", "Vector Art", "Clip Art",
    "Templates", "Mockups", "Presentations", "Resume Templates", "Business Cards", "Flyers", "Posters", "Brochures",
    "Social Media Templates", "Website Templates", "Mobile App Templates", "Email Templates", "Newsletter Designs",
    // Software & Development
    "Software", "Plugins", "Extensions", "Code Snippets", "Scripts", "APIs", "SDKs", "Libraries", "Frameworks",
    "WordPress Themes", "WordPress Plugins", "Shopify Themes", "Shopify Apps", "Web Apps", "SaaS Products",
    "Mobile Apps", "Desktop Apps", "Games", "Game Assets", "Unity Assets", "Sprites", "Tilesets",
    "Unreal Assets", "Source Code", "Databases", "Development Tools", "CLI Tools", "DevOps Tools",
    "AI Models", "Machine Learning", "Datasets", "Algorithms", "Bots", "Automation Scripts",
    // Design & Creative
    "Photoshop Actions", "Photoshop Brushes", "Lightroom Presets", "Lightroom Profiles", "Procreate Brushes", "Procreate Stamps",
    "Design Systems", "UI Kits", "Wireframes", "Prototypes", "Brand Kits", "Brand Guidelines", "Logo Templates", "Logo Packs",
    "Pattern Designs", "Textures", "Backgrounds", "Overlays", "Filters", "Color Palettes", "Gradients",
    "Figma Templates", "Sketch Templates", "Adobe XD Templates", "Canva Templates", "Notion Templates",
    // Education & Courses
    "Online Courses", "Video Courses", "Tutorials", "Workshops", "Masterclasses", "Video Lessons", "Webinars",
    "Educational Content", "Study Guides", "Cheat Sheets", "Flashcards", "Quizzes",
    "Language Learning", "Test Prep", "Certifications", "Training Materials", "Curriculum",
    // Business & Marketing
    "Business Plans", "Marketing Plans", "Sales Funnels", "Marketing Funnels",
    "Landing Pages", "Lead Magnets", "Case Studies", "White Papers", "Pitch Decks",
    "Reports", "Analytics Templates", "CRM Templates", "Project Management", "SOPs",
    "Spreadsheets", "Financial Models", "Invoices", "Contracts", "Legal Templates", "NDA Templates",
    "Proposal Templates", "Quotation Templates", "Business Proposals",
    // Writing & Content
    "Writing Templates", "Content Calendars", "Blog Posts", "Articles", "Ghostwriting",
    "Copywriting Templates", "Ad Copy", "Sales Scripts", "Email Sequences", "Cold Email Templates",
    "Newsletter Templates", "Documentation", "Guides", "Manuals", "SOPs",
    "Prompts", "AI Prompts", "ChatGPT Prompts", "Midjourney Prompts", "Prompt Packs",
    // Health & Fitness
    "Workout Plans", "Meal Plans", "Nutrition Guides", "Recipe Books", "Diet Plans",
    "Fitness Programs", "Meditation Guides", "Wellness Journals", "Health Trackers", "Yoga Guides",
    // Personal Development
    "Planners", "Journals", "Trackers", "Goal Setting", "Habit Trackers", "Budget Planners",
    "Mindmaps", "Note Taking", "Productivity Systems", "Life Coaching", "Self-Help Guides",
    "Affirmation Cards", "Vision Boards", "Gratitude Journals",
    // Photography & Video
    "Photo Presets", "Video LUTs", "Video Templates", "Motion Graphics", "After Effects Templates",
    "Transitions", "Lower Thirds", "Intros", "Outros", "Thumbnails", "YouTube Templates",
    "Instagram Reels Templates", "TikTok Templates", "Premiere Pro Templates", "DaVinci Resolve Templates",
    // Art & Crafts
    "Printables", "Coloring Pages", "Patterns", "SVG Files", "Cut Files", "Cricut Designs",
    "Embroidery Designs", "Knitting Patterns", "Sewing Patterns", "Craft Templates",
    "Stickers", "Labels", "Invitations", "Greeting Cards", "Wall Art", "Digital Planners",
    // Music & Audio
    "Sample Packs", "Drum Kits", "Loops", "MIDI Files", "Presets", "Synth Presets",
    "Vocal Samples", "Beats", "Instrumentals", "Podcasts", "Audiobooks", "Sound Libraries",
    "Ableton Templates", "FL Studio Templates", "Logic Pro Templates",
    // NFTs & Crypto
    "NFT Art", "NFT Collections", "Crypto Guides", "Trading Strategies", "DeFi Guides",
    // Other
    "Memberships", "Subscriptions", "Coaching", "Consulting", "Services", "Freelance Services",
    "Physical Products", "Bundles", "Collections", "Preorders", "Gift Cards", "Licenses", "Other",
  ].sort()

  // Smart AI Category suggestion based on title and description
  const suggestCategory = useCallback((text: string) => {
    if (!text || text.length < 3) {
      setSuggestedCategory(null)
      return
    }

    const lowerText = text.toLowerCase()

    // Category keywords mapping with weights (higher weight = more confident match)
    const categoryKeywords: { [key: string]: { keywords: string[], weight: number }[] } = {
      // Audio & Sound
      "Sound Effects": [
        { keywords: ["sound effect", "sfx", "sound fx"], weight: 10 },
        { keywords: ["audio effect", "whoosh", "swoosh", "impact", "transition sound"], weight: 8 },
        { keywords: ["foley", "ambient sound", "noise"], weight: 6 },
      ],
      "Sample Packs": [
        { keywords: ["sample pack", "drum kit", "drum samples"], weight: 10 },
        { keywords: ["loops", "one shots", "wav samples", "audio samples"], weight: 8 },
        { keywords: ["producer", "fl studio", "ableton"], weight: 5 },
      ],
      "Beats": [
        { keywords: ["beat", "beats", "instrumental", "type beat"], weight: 10 },
        { keywords: ["hip hop", "trap", "r&b", "drill", "boom bap"], weight: 7 },
        { keywords: ["rapper", "vocalist"], weight: 4 },
      ],
      "Music Tracks": [
        { keywords: ["music track", "royalty free music", "background music"], weight: 10 },
        { keywords: ["soundtrack", "cinematic music", "production music"], weight: 8 },
        { keywords: ["license", "commercial use"], weight: 3 },
      ],
      // Design & Creative
      "Lightroom Presets": [
        { keywords: ["lightroom preset", "lr preset", "lightroom"], weight: 10 },
        { keywords: ["photo preset", "color preset", "mobile preset"], weight: 7 },
        { keywords: ["instagram filter", "photo editing"], weight: 4 },
      ],
      "Photoshop Actions": [
        { keywords: ["photoshop action", "ps action", "photoshop"], weight: 10 },
        { keywords: ["psd", "photo manipulation", "retouching"], weight: 6 },
      ],
      "Procreate Brushes": [
        { keywords: ["procreate brush", "procreate"], weight: 10 },
        { keywords: ["ipad brush", "digital brush", "illustration brush"], weight: 6 },
      ],
      "Video LUTs": [
        { keywords: ["lut", "luts", "color lut"], weight: 10 },
        { keywords: ["color grade", "color grading", "cinematic look"], weight: 8 },
        { keywords: ["davinci", "premiere", "final cut"], weight: 4 },
      ],
      "Fonts": [
        { keywords: ["font", "fonts", "typeface"], weight: 10 },
        { keywords: ["typography", "lettering", "handwritten"], weight: 6 },
        { keywords: ["otf", "ttf", "woff"], weight: 5 },
      ],
      "Icons": [
        { keywords: ["icon pack", "icon set", "icons"], weight: 10 },
        { keywords: ["vector icons", "ui icons", "line icons"], weight: 7 },
      ],
      // Templates
      "Notion Templates": [
        { keywords: ["notion template", "notion"], weight: 10 },
        { keywords: ["notion workspace", "notion dashboard"], weight: 8 },
      ],
      "Figma Templates": [
        { keywords: ["figma template", "figma"], weight: 10 },
        { keywords: ["figma ui", "figma design"], weight: 7 },
      ],
      "Canva Templates": [
        { keywords: ["canva template", "canva"], weight: 10 },
      ],
      "Social Media Templates": [
        { keywords: ["instagram template", "social media template"], weight: 10 },
        { keywords: ["story template", "post template", "reel template"], weight: 8 },
        { keywords: ["tiktok", "facebook", "twitter", "linkedin"], weight: 5 },
      ],
      "Resume Templates": [
        { keywords: ["resume template", "cv template", "resume"], weight: 10 },
        { keywords: ["curriculum vitae", "job application"], weight: 6 },
      ],
      // AI & Prompts
      "AI Prompts": [
        { keywords: ["ai prompt", "prompt pack", "prompts"], weight: 10 },
        { keywords: ["chatgpt", "midjourney", "dall-e", "stable diffusion"], weight: 8 },
        { keywords: ["prompt engineering", "gpt"], weight: 5 },
      ],
      "ChatGPT Prompts": [
        { keywords: ["chatgpt prompt", "chatgpt", "gpt prompt"], weight: 10 },
        { keywords: ["openai", "gpt-4", "gpt-3"], weight: 7 },
      ],
      "Midjourney Prompts": [
        { keywords: ["midjourney prompt", "midjourney", "mj prompt"], weight: 10 },
        { keywords: ["ai art prompt", "image generation"], weight: 5 },
      ],
      // Education
      "Online Courses": [
        { keywords: ["online course", "course", "masterclass"], weight: 10 },
        { keywords: ["video course", "learn", "training", "tutorial"], weight: 7 },
        { keywords: ["lesson", "module", "curriculum"], weight: 4 },
      ],
      "Ebooks": [
        { keywords: ["ebook", "e-book", "digital book"], weight: 10 },
        { keywords: ["pdf guide", "pdf book"], weight: 8 },
        { keywords: ["guide", "handbook", "manual"], weight: 4 },
      ],
      // Business
      "Spreadsheets": [
        { keywords: ["spreadsheet", "excel template", "google sheets"], weight: 10 },
        { keywords: ["excel", "xlsx", "csv"], weight: 6 },
        { keywords: ["calculator", "tracker"], weight: 3 },
      ],
      "Business Plans": [
        { keywords: ["business plan", "startup plan"], weight: 10 },
        { keywords: ["pitch deck", "investor"], weight: 5 },
      ],
      // Art & Crafts
      "SVG Files": [
        { keywords: ["svg", "svg file", "cut file"], weight: 10 },
        { keywords: ["cricut", "silhouette", "vinyl"], weight: 8 },
        { keywords: ["laser cut", "cnc"], weight: 5 },
      ],
      "Printables": [
        { keywords: ["printable", "print at home"], weight: 10 },
        { keywords: ["wall art", "poster", "art print"], weight: 6 },
        { keywords: ["digital download", "instant download"], weight: 3 },
      ],
      // Development
      "WordPress Themes": [
        { keywords: ["wordpress theme", "wp theme"], weight: 10 },
        { keywords: ["wordpress"], weight: 5 },
      ],
      "Shopify Themes": [
        { keywords: ["shopify theme", "shopify template"], weight: 10 },
        { keywords: ["shopify"], weight: 5 },
      ],
      "UI Kits": [
        { keywords: ["ui kit", "design system"], weight: 10 },
        { keywords: ["user interface", "ui/ux", "component"], weight: 6 },
      ],
      "Source Code": [
        { keywords: ["source code", "github", "repository"], weight: 10 },
        { keywords: ["script", "code", "api"], weight: 4 },
      ],
      // Fitness
      "Workout Plans": [
        { keywords: ["workout plan", "fitness program"], weight: 10 },
        { keywords: ["exercise", "gym", "training plan"], weight: 6 },
        { keywords: ["weight loss", "muscle", "strength"], weight: 3 },
      ],
      "Meal Plans": [
        { keywords: ["meal plan", "diet plan"], weight: 10 },
        { keywords: ["nutrition", "recipe", "food"], weight: 5 },
        { keywords: ["keto", "vegan", "healthy"], weight: 3 },
      ],
      // Personal
      "Planners": [
        { keywords: ["planner", "digital planner"], weight: 10 },
        { keywords: ["daily planner", "weekly planner", "monthly"], weight: 7 },
        { keywords: ["organizer", "schedule"], weight: 4 },
      ],
      "Journals": [
        { keywords: ["journal", "journaling"], weight: 10 },
        { keywords: ["diary", "gratitude", "reflection"], weight: 5 },
      ],
      // 3D & Games
      "3D Assets": [
        { keywords: ["3d model", "3d asset"], weight: 10 },
        { keywords: ["blender", "maya", "c4d", "3ds max"], weight: 7 },
        { keywords: ["fbx", "obj", "stl"], weight: 5 },
      ],
      "Game Assets": [
        { keywords: ["game asset", "sprite", "tileset"], weight: 10 },
        { keywords: ["unity", "unreal", "godot"], weight: 7 },
        { keywords: ["pixel art", "game art", "character"], weight: 5 },
      ],
    }

    // Calculate scores for each category
    const scores: { [key: string]: number } = {}

    for (const [category, keywordGroups] of Object.entries(categoryKeywords)) {
      let categoryScore = 0
      for (const group of keywordGroups) {
        for (const keyword of group.keywords) {
          if (lowerText.includes(keyword)) {
            // Add weighted score + bonus for keyword length (specificity)
            categoryScore += group.weight + (keyword.length * 0.5)
          }
        }
      }
      if (categoryScore > 0) {
        scores[category] = categoryScore
      }
    }

    // Find best matching category
    let bestMatch: string | null = null
    let bestScore = 0

    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score
        bestMatch = category
      }
    }

    setSuggestedCategory(bestMatch)
  }, [])

  // Trigger category suggestion when title or description changes
  useEffect(() => {
    const text = `${title} ${description}`.trim()
    suggestCategory(text)
  }, [title, description, suggestCategory])

  // AI-generated SEO description using API
  const generateSeoDescription = useCallback(async () => {
    if (!description || description.length < 10) return

    setIsGeneratingSeo(true)

    try {
      const response = await fetch('/api/ai/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, title }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.seoDescription) {
          setSeoDescription(data.seoDescription)
          // Mark as manually edited so auto-update doesn't overwrite AI result
          seoManuallyEditedRef.current = true
        }
      } else {
        // Fallback to simple truncation if API fails
        let summary = description
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()

        if (summary.length > 155) {
          summary = summary.substring(0, 155).trim()
          const lastSpace = summary.lastIndexOf(' ')
          if (lastSpace > 100) {
            summary = summary.substring(0, lastSpace)
          }
          summary += '...'
        }
        setSeoDescription(summary)
        seoManuallyEditedRef.current = true
      }
    } catch (error) {
      console.error('SEO generation error:', error)
      // Fallback to simple truncation
      let summary = description
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 155)
      setSeoDescription(summary + '...')
      seoManuallyEditedRef.current = true
    } finally {
      setIsGeneratingSeo(false)
    }
  }, [description, title])

  // Track changes for unsaved warning - compare against last saved values
  useEffect(() => {
    // Create a snapshot of current values
    const currentValues = JSON.stringify({
      title, description, price, mediaItems, digitalFiles, variants,
      whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit
    })

    // If we have content and it's different from saved values, we have unsaved changes
    if (title || description || price || mediaItems.length > 0 || digitalFiles.length > 0) {
      // Only mark as unsaved if different from what was saved
      if (savedValuesRef.current && currentValues !== savedValuesRef.current) {
        setHasUnsavedChanges(true)
        // Reset justSaved when actual changes are made after saving
        if (justSaved) {
          setJustSaved(false)
        }
      } else if (!savedValuesRef.current) {
        // First time - mark as unsaved
        setHasUnsavedChanges(true)
      }
    }
  }, [title, description, price, mediaItems, digitalFiles, variants, whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit, justSaved])

  // Handle browser back/refresh with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Check section completion
  const checkSectionCompletion = useCallback(() => {
    const completed = new Set<SectionId>()

    // About (Title): title filled
    if (title.trim()) completed.add("about")

    // Media: at least one media item
    if (mediaItems.length > 0) completed.add("media")

    // Content: description filled
    if (description.trim()) completed.add("content")

    // What's Included: has items
    if (whatsIncluded.length > 0) completed.add("whatsIncluded")

    // FAQ: has items
    if (faqs.length > 0) completed.add("faq")

    // Files: has digital files
    if (digitalFiles.length > 0) completed.add("files")

    // Variants: has variants
    if (variants.length > 0) completed.add("variants")

    // Pricing: price filled
    if (price.trim()) completed.add("pricing")

    // Category: category selected
    if (selectedCategory) completed.add("category")

    // Settings: any setting configured
    if (callToAction.trim() || refundPolicyEnabled) completed.add("settings")

    // SEO: seo title or description filled
    if (seoTitle.trim() || seoDescription.trim()) completed.add("seo")

    setCompletedSections(completed)
  }, [title, mediaItems, description, whatsIncluded, faqs, digitalFiles, variants, price, selectedCategory, callToAction, refundPolicyEnabled, seoTitle, seoDescription])

  useEffect(() => {
    checkSectionCompletion()
  }, [checkSectionCompletion])

  // Force scroll to top IMMEDIATELY using useLayoutEffect (runs synchronously before paint)
  useLayoutEffect(() => {
    // Disable scroll restoration from Next.js
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    // Blur any focused element to prevent scroll-to-focus
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    // Force scroll to top on ALL possible scroll containers
    const forceScrollTop = () => {
      // Blur again in case something focused during the timeout
      if (document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body) {
        document.activeElement.blur()
      }

      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      if (contentRef.current) {
        contentRef.current.scrollTop = 0
      }
    }

    // Run immediately
    forceScrollTop()

    // Run after RAF to catch any layout shifts
    requestAnimationFrame(forceScrollTop)

    // Run multiple times to override any auto-focus scroll
    const timers = [
      setTimeout(forceScrollTop, 0),
      setTimeout(forceScrollTop, 10),
      setTimeout(forceScrollTop, 50),
      setTimeout(forceScrollTop, 100),
      setTimeout(forceScrollTop, 200),
      setTimeout(() => {
        forceScrollTop()
        setIsPageReady(true)
      }, 300), // Final scroll and show content
    ]

    return () => {
      timers.forEach(clearTimeout)
      // Restore scroll restoration when leaving
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'auto'
      }
    }
  }, [])

  // Scroll spy for active section and header hide/show - only after page is ready
  useEffect(() => {
    if (!isPageReady) return // Don't run until page is ready

    const handleScroll = () => {
      if (!contentRef.current) return

      // Track scroll position for header
      const scrollTop = contentRef.current.scrollTop
      setIsScrolled(scrollTop > 20)

      // Find which section is currently in view
      let currentSection: SectionId = "about"
      const containerRect = contentRef.current.getBoundingClientRect()

      for (const section of SECTIONS) {
        const element = sectionRefs.current[section.id]
        if (element) {
          const rect = element.getBoundingClientRect()
          // Check if section top is above the middle of the viewport
          const relativeTop = rect.top - containerRect.top

          if (relativeTop <= 150) {
            currentSection = section.id
          }
        }
      }

      // Auto-scroll pills to show active pill on mobile
      if (currentSection !== activeSection) {
        const activePill = pillRefs.current[currentSection]
        const pillScroll = pillScrollRef.current
        if (activePill && pillScroll) {
          const pillRect = activePill.getBoundingClientRect()
          const scrollRect = pillScroll.getBoundingClientRect()

          // Check if pill is outside visible area
          if (pillRect.left < scrollRect.left || pillRect.right > scrollRect.right) {
            activePill.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'center'
            })
          }
        }
      }

      setActiveSection(currentSection)
    }

    const content = contentRef.current
    if (content) {
      content.addEventListener("scroll", handleScroll, { passive: true })
      // Initial check after a small delay to ensure scroll position is correct
      setTimeout(() => handleScroll(), 100)
      return () => content.removeEventListener("scroll", handleScroll)
    }
  }, [activeSection, isPageReady])

  // Scroll to section when pill clicked with smooth animation
  const scrollToSection = (sectionId: SectionId) => {
    const element = sectionRefs.current[sectionId]
    if (element && contentRef.current) {
      const containerRect = contentRef.current.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const scrollTop = contentRef.current.scrollTop + (elementRect.top - containerRect.top) - 24

      contentRef.current.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: "smooth"
      })
    }
  }

  // Fetch creator on mount
  useEffect(() => {
    const getCreator = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }

      const { data: creatorData } = await supabase
        .from("creators")
        .select("id, stripe_account_id, stripe_onboarding_status, slug")
        .eq("user_id", user.id)
        .single()

      if (!creatorData) {
        router.push("/onboarding")
        return
      }

      // Also fetch the profile to get the username
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single()

      setCreatorId(creatorData.id)
      setCreator({ ...creatorData, username: profileData?.username })

      // If editing, load the existing product
      if (editProductId) {
        const { data: product } = await supabase
          .from("products")
          .select("*")
          .eq("id", editProductId)
          .eq("creator_id", creatorData.id)
          .single()

        if (product) {
          console.log("Loaded product for editing:", {
            id: product.id,
            title: product.title,
            descriptionLength: product.description?.length || 0,
            hasCategory: !!product.category,
            hasFaqs: !!(product.faqs && product.faqs.length),
            hasWhatsIncluded: !!(product.whats_included && product.whats_included.length),
          })
          setProductId(product.id)
          setTitle(product.title || "")
          setDescription(product.description || "")
          setPrice(product.price_cents ? (product.price_cents / 100).toString() : "")
          setCompareAtPrice(product.compare_at_cents ? (product.compare_at_cents / 100).toString() : "")
          setSlug(product.slug || "")
          setProductType(product.type || "digital")
          setShowSalesBadge(product.show_sales_badge !== false)
          setRefundPolicyEnabled(product.refund_policy_enabled || false)
          setRefundPolicyType(product.refund_policy_type || "7_day")
          setSeoTitle(product.seo_title || "")
          setSeoDescription(product.seo_description || "")
          // If product has a saved SEO description, mark as manually edited so auto-update doesn't overwrite
          seoManuallyEditedRef.current = !!(product.seo_description && product.seo_description.trim())
          setCallToAction(product.call_to_action || "")
          setSelectedCategory(product.category || null)
          setIsPublished(product.status === "published")

          // Load media items
          const mediaList: MediaItem[] = []

          // Add thumbnail/gallery images
          if (product.thumbnail_url) {
            mediaList.push({
              id: `image-0`,
              type: "image",
              url: product.thumbnail_url,
            })
          }
          if (product.gallery_urls && Array.isArray(product.gallery_urls)) {
            product.gallery_urls.forEach((url: string, idx: number) => {
              if (url !== product.thumbnail_url) {
                mediaList.push({
                  id: `image-${idx + 1}`,
                  type: "image",
                  url: url,
                })
              }
            })
          }

          // Add YouTube video - pure embed only, no thumbnail
          if (product.video_url) {
            const videoId = parseYouTubeUrl(product.video_url)
            if (videoId) {
              mediaList.push({
                id: `youtube-${videoId}`,
                type: "youtube",
                url: product.video_url,
              })
            }
          }
          setMediaItems(mediaList)

          // Load digital files
          const { data: assets } = await supabase
            .from("digital_assets")
            .select("*")
            .eq("product_id", product.id)

          if (assets) {
            setDigitalFiles(assets.map(asset => ({
              id: asset.id,
              file_name: asset.file_name,
              file_path: asset.file_path,
              file_size: asset.file_size,
              mime_type: asset.mime_type,
            })))
          }

          // Load variants
          const { data: productVariants, error: variantsLoadError } = await supabase
            .from("product_variants")
            .select(`
              id, name, description, price_cents, max_purchases, position,
              product_variant_files (
                digital_asset_id
              )
            `)
            .eq("product_id", product.id)
            .order("position")

          if (variantsLoadError) {
            console.error("Error loading variants:", variantsLoadError)
            // Don't throw - variants table might not exist yet
          }

          if (productVariants && productVariants.length > 0) {
            console.log("Loaded variants:", productVariants.length)
            setVariants(productVariants.map(v => ({
              id: v.id,
              name: v.name,
              description: v.description || "",
              price: v.price_cents ? (v.price_cents / 100).toString() : "0", // FINAL price
              maxPurchases: v.max_purchases ? v.max_purchases.toString() : "",
              isExpanded: false,
              assignedFiles: v.product_variant_files?.map((pvf: any) => pvf.digital_asset_id) || [],
            })))
          }

          // Load what's included
          if (product.whats_included && Array.isArray(product.whats_included)) {
            setWhatsIncluded(product.whats_included)
          }

          // Load FAQs
          if (product.faqs && Array.isArray(product.faqs)) {
            setFaqs(product.faqs.map((faq: any, idx: number) => ({
              id: `loaded-${idx}`,
              question: faq.question || "",
              answer: faq.answer || "",
              isDefault: false,
            })))
          }

          // Mark that there are no unsaved changes initially when editing
          setHasUnsavedChanges(false)

          // CRITICAL: Set savedValuesRef with loaded values to prevent false "unsaved changes"
          // This ensures the "Saved" button shows correctly after page refresh
          const loadedVariants = productVariants?.map(v => ({
            id: v.id,
            name: v.name,
            description: v.description || "",
            price: v.price_cents ? (v.price_cents / 100).toString() : "0", // FINAL price
            maxPurchases: v.max_purchases ? v.max_purchases.toString() : "",
            isExpanded: false,
            assignedFiles: v.product_variant_files?.map((pvf: any) => pvf.digital_asset_id) || [],
          })) || []

          const loadedWhatsIncluded = product.whats_included && Array.isArray(product.whats_included)
            ? product.whats_included
            : DEFAULT_WHATS_INCLUDED

          const loadedFaqs = product.faqs && Array.isArray(product.faqs)
            ? product.faqs.map((faq: any, idx: number) => ({
                id: `loaded-${idx}`,
                question: faq.question || "",
                answer: faq.answer || "",
                isDefault: false,
              }))
            : DEFAULT_FAQS

          const loadedDigitalFiles = assets?.map(asset => ({
            id: asset.id,
            file_name: asset.file_name,
            file_path: asset.file_path,
            file_size: asset.file_size,
            mime_type: asset.mime_type,
          })) || []

          // Set savedValuesRef with the loaded data so change detection works correctly
          savedValuesRef.current = JSON.stringify({
            title: product.title || "",
            description: product.description || "",
            price: product.price_cents ? (product.price_cents / 100).toString() : "",
            mediaItems: mediaList,
            digitalFiles: loadedDigitalFiles,
            variants: loadedVariants,
            whatsIncluded: loadedWhatsIncluded,
            faqs: loadedFaqs,
            selectedCategory: product.category || null,
            limitSalesEnabled: false,
            salesLimit: ""
          })

          // Show as "Saved" state since data is already persisted
          setJustSaved(true)
        }
      }
    }
    getCreator()
  }, [router, editProductId])

  // Auto-generate slug and SEO from title
  useEffect(() => {
    if (!title) return
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setSlug(generatedSlug)
    // Auto-generate SEO title
    setSeoTitle(title)
  }, [title])

  // Auto-generate SEO description from product description in REAL-TIME
  // Only updates if user hasn't manually edited the SEO description
  useEffect(() => {
    // Skip if user has manually edited
    if (seoManuallyEditedRef.current) return

    if (!description) {
      setSeoDescription("")
      return
    }

    // Strip HTML tags, decode entities, and get plain text for SEO description
    const plainText = description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&')  // Replace &amp;
      .replace(/&lt;/g, '<')   // Replace &lt;
      .replace(/&gt;/g, '>')   // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'")  // Replace &#39;
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim()

    if (plainText) {
      // Truncate to 155 chars for SEO (meta description limit)
      const truncated = plainText.length > 155 ? plainText.substring(0, 152) + '...' : plainText
      setSeoDescription(truncated)
    } else {
      setSeoDescription("")
    }
  }, [description])

  // Create or update product
  const saveProduct = useCallback(async (publish = false) => {
    if (!creatorId) return null
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    try {
      let finalSlug = slug
      if (!productId) {
        // Check for duplicate slug for THIS creator (unique constraint is per-creator)
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("slug", slug)
          .eq("creator_id", creatorId)
          .maybeSingle()

        if (existing) {
          // Add timestamp + random suffix to ensure uniqueness
          finalSlug = `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
        }
      }

      // Get photo URLs from media items (images and YouTube)
      const photoUrls = mediaItems.filter(m => m.type === "image").map(m => m.url)
      const youtubeItems = mediaItems.filter(m => m.type === "youtube")

      // Filter out empty items from whatsIncluded
      const filteredWhatsIncluded = whatsIncluded.filter(item => item.trim() !== "")

      // Format FAQs for database storage (only include non-empty ones)
      const formattedFaqs = faqs
        .filter(faq => faq.question.trim() !== "" && faq.answer.trim() !== "")
        .map(faq => ({ question: faq.question, answer: faq.answer }))

      // Log what we're saving for debugging
      console.log("Saving product data:", {
        productId,
        isUpdate: !!productId,
        title,
        descriptionLength: description?.length || 0,
        variantsCount: variants.length,
        faqsCount: faqs.filter(f => f.question.trim() && f.answer.trim()).length,
        whatsIncludedCount: whatsIncluded.filter(i => i.trim()).length,
        category: selectedCategory,
      })

      const productData = {
        creator_id: creatorId,
        type: productType,
        title,
        slug: finalSlug,
        description,
        status: publish ? "published" : "draft",
        price_cents: Math.round(Number.parseFloat(price || "0") * 100),
        compare_at_cents: compareAtPrice ? Math.round(Number.parseFloat(compareAtPrice) * 100) : null,
        // YouTube embeds do NOT set thumbnail - use first image only
        thumbnail_url: photoUrls.length > 0 ? photoUrls[0] : null,
        gallery_urls: photoUrls.length > 0 ? photoUrls : null,
        video_url: youtubeItems[0]?.url || null,
        show_sales_badge: showSalesBadge,
        refund_policy_enabled: refundPolicyEnabled,
        refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        call_to_action: callToAction || null,
        whats_included: filteredWhatsIncluded.length > 0 ? filteredWhatsIncluded : null,
        faqs: formattedFaqs.length > 0 ? formattedFaqs : null,
        category: selectedCategory || null,
      }

      let finalProductId = productId

      if (productId) {
        // Update existing product - use .select() to verify the update worked
        const { data: updatedProduct, error: updateError } = await supabase
          .from("products")
          .update(productData)
          .eq("id", productId)
          .select()
          .single()

        if (updateError) {
          console.error("Error updating product:", updateError)
          throw new Error(`Failed to update product: ${updateError.message}`)
        }

        if (!updatedProduct) {
          throw new Error("Product update failed - no data returned. Check RLS policies.")
        }

        // Verify description was saved
        if (description && updatedProduct.description !== description) {
          console.warn("Description may not have saved correctly")
        }
      } else {
        const { data: product, error: createError } = await supabase
          .from("products")
          .insert(productData)
          .select()
          .single()

        if (createError) {
          console.error("Error creating product:", createError)
          throw new Error(`Failed to create product: ${createError.message}`)
        }

        if (!product) {
          throw new Error("Product creation failed - no data returned")
        }

        setProductId(product.id)
        finalProductId = product.id
        // Update slug state to match what was actually saved (in case of duplicate handling)
        if (product.slug && product.slug !== slug) {
          setSlug(product.slug)
        }
      }

      // Save variants if we have a product ID
      if (finalProductId && variants.length > 0) {
        // First, delete all existing variants for this product (they'll be recreated)
        const { error: deleteVariantsError } = await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", finalProductId)

        if (deleteVariantsError) {
          console.error("Error deleting existing variants:", deleteVariantsError)
          // If error code is 42P01, table doesn't exist - that's a schema issue
          if (deleteVariantsError.code === "42P01") {
            throw new Error("Variants table doesn't exist. Please run the SQL migration.")
          }
        }

        // Insert all variants
        const savedVariantIds: string[] = []
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i]
          const { data: savedVariant, error: variantError } = await supabase
            .from("product_variants")
            .insert({
              product_id: finalProductId,
              name: variant.name || "Untitled",
              description: variant.description || null,
              price_cents: Math.round(Number.parseFloat(variant.price || "0") * 100), // FINAL price
              max_purchases: variant.maxPurchases ? parseInt(variant.maxPurchases) : null,
              position: i,
            })
            .select()
            .single()

          if (variantError) {
            console.error("Error saving variant:", variantError)
            // Check for schema cache errors
            const errMsg = variantError.message || ""
            if (errMsg.includes("schema cache") || errMsg.includes("column") || errMsg.includes("does not exist")) {
              throw new Error(`Database schema error: Please run scripts/050_complete_product_features.sql in Supabase SQL Editor, then refresh the page. (Error: ${errMsg})`)
            }
            // Check for RLS errors
            if (variantError.code === "42501" || errMsg.includes("row-level security") || errMsg.includes("permission")) {
              throw new Error(`Permission denied saving variants. Check RLS policies for product_variants table.`)
            }
            // Generic error
            throw new Error(`Failed to save variant "${variant.name}": ${errMsg}`)
          }

          if (savedVariant) {
            savedVariantIds.push(savedVariant.id)
          }

          // Save variant files if any
          if (savedVariant && variant.assignedFiles.length > 0) {
            // Get the actual digital asset IDs from file names
            const { data: assets } = await supabase
              .from("digital_assets")
              .select("id, file_name")
              .eq("product_id", finalProductId)
              .in("id", variant.assignedFiles)

            if (assets && assets.length > 0) {
              const variantFilesData = assets.map(asset => ({
                variant_id: savedVariant.id,
                digital_asset_id: asset.id,
              }))

              const { error: variantFilesError } = await supabase
                .from("product_variant_files")
                .insert(variantFilesData)

              if (variantFilesError) {
                console.error("Error saving variant files:", variantFilesError)
                // Don't throw for files - variant was saved
              }
            }
          }
        }

        // Verify all variants were saved
        if (savedVariantIds.length !== variants.length) {
          console.warn(`Only ${savedVariantIds.length} of ${variants.length} variants were saved`)
        }
      } else if (finalProductId && variants.length === 0) {
        // If no variants, delete any existing ones
        const { error: deleteError } = await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", finalProductId)

        if (deleteError) {
          console.error("Error deleting variants:", deleteError)
        }
      }

      setHasUnsavedChanges(false)
      return { productId: finalProductId, slug: finalSlug }
    } catch (err: any) {
      console.error("Error saving product:", err)
      // Check for common database errors and provide helpful messages
      const errorMessage = err.message || "Unknown error"

      // Column doesn't exist error (PostgreSQL error code 42703)
      if (errorMessage.includes("column") && (errorMessage.includes("does not exist") || errorMessage.includes("undefined"))) {
        setError("Database schema is outdated. Please run the SQL migration (scripts/049_add_missing_product_columns.sql) in your Supabase SQL Editor.")
      }
      // Table doesn't exist
      else if (errorMessage.includes("relation") && errorMessage.includes("does not exist")) {
        setError("Required database table is missing. Please run the SQL migration (scripts/049_add_missing_product_columns.sql) in your Supabase SQL Editor.")
      }
      // RLS policy error
      else if (errorMessage.includes("row-level security") || errorMessage.includes("RLS")) {
        setError("Permission denied. Please check your database RLS policies.")
      }
      // Generic error
      else {
        setError(errorMessage)
      }
      return null
    } finally {
      setIsSaving(false)
    }
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, mediaItems, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction, variants, whatsIncluded, faqs, selectedCategory])

  // Process image to fit 1280x720 canvas (for non-widescreen images)
  const processImageToWidescreen = async (file: File): Promise<{ processedFile: File; wasProcessed: boolean; originalRatio: string }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        const targetWidth = 1280
        const targetHeight = 720
        const targetRatio = targetWidth / targetHeight // ~1.78 (16:9)
        const imageRatio = img.width / img.height

        // Determine original ratio description
        let originalRatio = "landscape"
        if (imageRatio < 0.95) {
          originalRatio = "portrait"
        } else if (imageRatio >= 0.95 && imageRatio <= 1.05) {
          originalRatio = "square"
        }

        // Check if image is already close to widescreen ratio (within 10% tolerance)
        const isWidescreen = imageRatio >= 1.5 && imageRatio <= 2.0

        if (isWidescreen) {
          // Image is already widescreen, no processing needed
          resolve({ processedFile: file, wasProcessed: false, originalRatio })
          return
        }

        // Create canvas with target dimensions
        const canvas = document.createElement("canvas")
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error("Could not get canvas context"))
          return
        }

        // Fill with light gray gradient background (smooth white to very light gray)
        const gradient = ctx.createLinearGradient(0, 0, targetWidth, targetHeight)
        gradient.addColorStop(0, "#f8f8f8")
        gradient.addColorStop(0.5, "#f0f0f0")
        gradient.addColorStop(1, "#e8e8e8")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, targetWidth, targetHeight)

        // Calculate dimensions to fit image within the canvas while maintaining aspect ratio
        let drawWidth: number
        let drawHeight: number

        if (imageRatio > targetRatio) {
          // Image is wider than target - fit by width
          drawWidth = targetWidth
          drawHeight = targetWidth / imageRatio
        } else {
          // Image is taller than target - fit by height
          drawHeight = targetHeight
          drawWidth = targetHeight * imageRatio
        }

        // Center the image
        const x = (targetWidth - drawWidth) / 2
        const y = (targetHeight - drawHeight) / 2

        // Draw the image centered on the canvas
        ctx.drawImage(img, x, y, drawWidth, drawHeight)

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"))
              return
            }

            // Create new file with same name but as PNG for lossless quality
            const processedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, "") + "_processed.jpg",
              { type: "image/jpeg" }
            )

            resolve({ processedFile, wasProcessed: true, originalRatio })
          },
          "image/jpeg",
          0.92 // High quality JPEG
        )
      }

      img.onerror = () => reject(new Error("Failed to load image"))
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsDataURL(file)
    })
  }

  // Upload file with XMLHttpRequest for real progress tracking
  const uploadWithProgress = async (
    file: File,
    filePath: string,
    onProgress: (percent: number) => void
  ): Promise<{ error: Error | null }> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return { error: new Error("Not authenticated") }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const uploadUrl = `${supabaseUrl}/storage/v1/object/product-images/${filePath}`

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      })

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ error: null })
        } else {
          resolve({ error: new Error(`Upload failed: ${xhr.statusText}`) })
        }
      })

      xhr.addEventListener("error", () => {
        resolve({ error: new Error("Upload failed") })
      })

      xhr.open("POST", uploadUrl)
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`)
      xhr.setRequestHeader("x-upsert", "false")
      xhr.setRequestHeader("cache-control", "3600")
      xhr.send(file)
    })
  }

  // Handle media upload with progress (images only)
  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploadingMedia(true)
    setUploadProgress(0)
    setError(null)
    const supabase = createClient()
    const newItems: MediaItem[] = []
    let completedFiles = 0

    // Calculate total bytes for accurate progress
    const filesToUpload: File[] = []
    let totalBytes = 0

    try {
      // First pass: validate files and calculate total size
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/")

        if (!isImage) {
          setError(`Only images are supported. Use YouTube for videos.`)
          continue
        }

        const existingImages = mediaItems.filter(m => m.type === "image").length
        if (existingImages + filesToUpload.length >= MAX_PHOTOS) {
          setError(`Maximum ${MAX_PHOTOS} photos allowed`)
          continue
        }

        filesToUpload.push(file)
        totalBytes += file.size
      }

      // Second pass: upload files with progress
      let uploadedBytes = 0
      let processedCount = 0

      // Clear previous ratio warning
      setRatioWarning(null)

      for (const file of filesToUpload) {
        const timestamp = Date.now()

        let fileToUpload = file

        // Process images that are not widescreen
        try {
          const result = await processImageToWidescreen(file)
          fileToUpload = result.processedFile

          if (result.wasProcessed) {
            processedCount++
            // Show ratio warning
            if (result.originalRatio === "square") {
              setRatioWarning(`Image "${file.name}" was square and has been fitted to 1280x720.`)
            } else if (result.originalRatio === "portrait") {
              setRatioWarning(`Image "${file.name}" was portrait and has been fitted to 1280x720.`)
            }
          }
        } catch (err) {
          console.error("Image processing error:", err)
          // Continue with original file if processing fails
        }

        // Upload image with progress
        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const folder = productId || "temp"
        const filePath = `${creatorId}/${folder}/${timestamp}_${safeName}`

        const fileStartBytes = uploadedBytes

        const { error: uploadError } = await uploadWithProgress(
          fileToUpload,
          filePath,
          (filePercent) => {
            // Calculate overall progress based on bytes
            const currentFileUploaded = (filePercent / 100) * fileToUpload.size
            const totalUploaded = fileStartBytes + currentFileUploaded
            const overallPercent = Math.round((totalUploaded / totalBytes) * 100)
            setUploadProgress(Math.min(overallPercent, 99)) // Cap at 99% until fully done
          }
        )

        if (uploadError) {
          console.error("Upload error:", uploadError)
          setError(`Failed to upload ${file.name}: ${uploadError.message}`)
          continue
        }

        uploadedBytes += fileToUpload.size

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath)

        newItems.push({
          id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          url: publicUrl,
        })

        completedFiles++
      }

      // Show combined warning if multiple images were processed
      if (processedCount > 1) {
        setRatioWarning(`${processedCount} images were fitted to 1280x720 (recommended ratio).`)
      }

      if (newItems.length > 0) {
        setUploadProgress(100)
        setMediaItems(prev => [...prev, ...newItems])
      }
    } finally {
      // Brief delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300))
      setUploadingMedia(false)
      setUploadProgress(0)
    }
  }

  // Handle YouTube video add
  const handleAddYouTube = () => {
    const videoId = parseYouTubeUrl(youtubeInput)
    if (!videoId) {
      setError("Invalid YouTube URL")
      return
    }

    const existingYouTube = mediaItems.filter(m => m.type === "youtube").length
    if (existingYouTube >= MAX_YOUTUBE_VIDEOS) {
      setError(`Maximum ${MAX_YOUTUBE_VIDEOS} YouTube videos allowed`)
      return
    }

    // YouTube embeds do NOT generate thumbnails - pure embed only
    const newItem: MediaItem = {
      id: `yt-${videoId}-${Date.now()}`,
      type: "youtube",
      url: `https://www.youtube.com/embed/${videoId}`,
    }

    setMediaItems(prev => [...prev, newItem])
    setYoutubeInput("")
    setShowYoutubeInput(false)
    setError(null)
  }

  // Remove media item
  const removeMedia = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id))
  }

  // Desktop drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newItems = [...mediaItems]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(dropIndex, 0, draggedItem)
    setMediaItems(newItems)

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Mobile touch drag handlers
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    const touch = e.touches[0]
    setTouchDragIndex(index)
    setTouchStartPos({ x: touch.clientX, y: touch.clientY })
    setTouchCurrentPos({ x: touch.clientX, y: touch.clientY })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchDragIndex === null || !touchStartPos) return

    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartPos.x)
    const deltaY = Math.abs(touch.clientY - touchStartPos.y)

    // Start dragging if moved more than 10px
    if (!isTouchDragging && (deltaX > 10 || deltaY > 10)) {
      setIsTouchDragging(true)
    }

    if (isTouchDragging) {
      e.preventDefault()
      setTouchCurrentPos({ x: touch.clientX, y: touch.clientY })

      // Find which element we're over
      const elements = document.elementsFromPoint(touch.clientX, touch.clientY)
      const dropTarget = elements.find(el => el.getAttribute("data-media-index"))

      if (dropTarget) {
        const targetIndex = parseInt(dropTarget.getAttribute("data-media-index") || "-1")
        if (targetIndex !== -1 && targetIndex !== touchDragIndex) {
          setDragOverIndex(targetIndex)
        }
      } else {
        setDragOverIndex(null)
      }
    }
  }

  const handleTouchEnd = () => {
    if (touchDragIndex !== null && dragOverIndex !== null && touchDragIndex !== dragOverIndex) {
      const newItems = [...mediaItems]
      const [draggedItem] = newItems.splice(touchDragIndex, 1)
      newItems.splice(dragOverIndex, 0, draggedItem)
      setMediaItems(newItems)
    }

    setTouchDragIndex(null)
    setTouchStartPos(null)
    setTouchCurrentPos(null)
    setIsTouchDragging(false)
    setDragOverIndex(null)
  }

  // Handle file upload for digital assets using admin API with progress
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Clear previous errors
    setError(null)

    let currentProductId = productId
    if (!currentProductId) {
      // First, we need to save the product to get an ID
      if (!title.trim()) {
        setError("Please enter a product title before uploading digital files")
        scrollToSection("about")
        return
      }

      // Clear any previous error before attempting save
      setError(null)

      try {
        const saveResult = await saveProduct(false)
        if (!saveResult) {
          // If saveProduct returns null, get error from state or use default
          // Small delay to ensure error state is set
          await new Promise(resolve => setTimeout(resolve, 50))
          setError(prev => prev || "Failed to create product. Please check your connection and try again.")
          return
        }
        currentProductId = saveResult.productId
      } catch (saveErr) {
        console.error("Error saving product before file upload:", saveErr)
        setError(saveErr instanceof Error ? saveErr.message : "Failed to create product. Please try again.")
        return
      }
    }

    setUploadingFiles(true)
    setFileUploadProgress(0)
    const newFiles: UploadedFile[] = []
    const totalFiles = Array.from(files).length
    let completedFiles = 0

    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024 * 1024) {
          setError(`File "${file.name}" exceeds 5GB limit`)
          continue
        }

        // Update progress to show which file we're working on
        setFileUploadProgress(Math.round((completedFiles / totalFiles) * 100))

        // Use admin API route to bypass RLS
        const formData = new FormData()
        formData.append("file", file)
        formData.append("productId", currentProductId)

        try {
          const response = await fetch("/api/storage/upload-file", {
            method: "POST",
            body: formData,
          })

          if (!response.ok) {
            let errorMessage = "Upload failed"
            try {
              const errorData = await response.json()
              console.error("Digital file upload error:", errorData)
              errorMessage = errorData.error || errorMessage
            } catch (e) {
              console.error("Could not parse error response:", e)
            }
            setError(`Failed to upload "${file.name}": ${errorMessage}`)
            continue
          }

          const result = await response.json()

          if (result.asset) {
            newFiles.push({
              id: result.asset.id,
              file_name: result.asset.file_name,
              file_path: result.asset.file_path,
              file_size: result.asset.file_size,
            })
          }

          completedFiles++
          setFileUploadProgress(Math.round((completedFiles / totalFiles) * 100))
        } catch (uploadErr) {
          console.error("Digital file upload request error:", uploadErr)
          setError(`Failed to upload "${file.name}": Network error. Please check your connection and try again.`)
          continue
        }
      }

      if (newFiles.length > 0) {
        setDigitalFiles(prev => [...prev, ...newFiles])
        setFileUploadProgress(100)
      }
    } finally {
      // Brief delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300))
      setUploadingFiles(false)
      setFileUploadProgress(0)
    }
  }

  const handleDeleteFile = async (file: UploadedFile) => {
    if (!file.id) return

    try {
      // Use admin API route to bypass RLS
      const response = await fetch(`/api/storage/upload-file?assetId=${file.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Delete file error:", errorData)
        setError(`Failed to delete "${file.file_name}": ${errorData.error || "Delete failed"}`)
        return
      }

      setDigitalFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (err) {
      console.error("Delete file request error:", err)
      setError(`Failed to delete "${file.file_name}": Network error`)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  // Navigation handlers with unsaved changes check
  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation("/app/products")
      setShowExitDialog(true)
    } else {
      router.push("/app/products")
    }
  }

  const handleBackClick = (e: React.MouseEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault()
      setPendingNavigation("/app/products")
      setShowExitDialog(true)
    }
  }

  const handleConfirmExit = () => {
    setShowExitDialog(false)
    setHasUnsavedChanges(false)
    if (pendingNavigation) {
      router.push(pendingNavigation)
    }
  }

  const handleSaveAndExit = async () => {
    const result = await saveProduct(false)
    setShowExitDialog(false)
    if (result) {
      router.push(`/app/products/${result.productId}`)
    }
  }

  const handleSaveChanges = async () => {
    if (!title.trim()) {
      setError("Please enter a product title")
      scrollToSection("about")
      return
    }

    setIsLoading(true)
    // Always publish when saving
    const result = await saveProduct(true)
    setIsLoading(false)

    if (result) {
      const { productId: savedProductId, slug: savedSlug } = result

      // Update URL to include product ID so refresh works correctly
      // Use replaceState to avoid adding to browser history
      const newUrl = `/app/products/new?edit=${savedProductId}`
      window.history.replaceState({}, '', newUrl)

      // Stay on the same page, don't redirect
      setIsPublished(true)
      setJustSaved(true)
      setHasUnsavedChanges(false)

      // Store current values as saved state for change detection
      savedValuesRef.current = JSON.stringify({
        title, description, price, mediaItems, digitalFiles, variants,
        whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit
      })

      // Revalidate the live product page so changes appear immediately
      // Use the actual saved slug in case it was modified due to duplicates
      try {
        await fetch("/api/revalidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: savedSlug, type: "product" }),
        })
      } catch (revalidateErr) {
        console.log("Revalidation skipped:", revalidateErr)
      }

      // Smooth scroll to top
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })

      // Show success notification
      setNotificationMessage("Product is live and saved!")
      setShowNotification(true)

      // Hide notification after 3 seconds
      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
    }
  }

  // Handle publish/unpublish toggle
  const handleTogglePublish = async () => {
    if (!productId || !creatorId) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const newStatus = isPublished ? "draft" : "published"
      const { error: updateError } = await supabase
        .from("products")
        .update({ status: newStatus })
        .eq("id", productId)

      if (updateError) throw updateError

      setIsPublished(!isPublished)
      setNotificationMessage(isPublished ? "Product unpublished" : "Product is live!")
      setShowNotification(true)

      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle redirect to live product page
  const handleRedirectToProduct = () => {
    if (slug) {
      window.open(`/p/${slug}`, "_blank")
    }
  }

  // Tooltip icon component with purple styling - responsive for mobile
  const TooltipIcon = ({ content }: { content: React.ReactNode }) => (
    <>
      {/* Desktop: Tooltip */}
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <span className="hidden sm:flex items-center justify-center w-4 h-4 rounded-full bg-violet-100 text-violet-600 text-[10px] font-medium cursor-help hover:bg-violet-200 transition-colors">
              i
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs p-3">
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* Mobile: Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="sm:hidden flex items-center justify-center w-4 h-4 rounded-full bg-violet-100 text-violet-600 text-[10px] font-medium cursor-help hover:bg-violet-200 transition-colors"
          >
            i
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="max-w-[280px] p-3 text-sm">
          {content}
        </PopoverContent>
      </Popover>
    </>
  )

  const existingImages = mediaItems.filter(m => m.type === "image").length
  const existingYouTube = mediaItems.filter(m => m.type === "youtube").length

  // Skeleton loading component - exact match to final UI structure
  if (!isPageReady) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        {/* Skeleton Header - exact match */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 z-30 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              {/* Title row */}
              <div className="flex items-center gap-2 pt-[14px] pb-3 sm:py-3">
                <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
              </div>
              {/* Pills row - matches actual pill structure */}
              <div className="py-3 pt-0 sm:pt-0.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {["About", "Media", "Content", "Settings", "SEO"].map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 lg:px-5 py-2 rounded-full bg-gray-100"
                    >
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-300 rounded-full animate-pulse" />
                      <div className="h-[14px] w-12 sm:w-14 bg-gray-200 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton Content - exact match to form structure */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8">
            <div className="max-w-5xl mx-auto">
              <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8">
                <div className="lg:w-3/5 space-y-8 sm:space-y-12">

                  {/* About section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-14 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-64 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
                      <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                  </div>

                  {/* Media section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-48 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    {/* Media upload zone placeholder */}
                    <div className="h-40 w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 animate-pulse">
                      <div className="w-10 h-10 bg-gray-200 rounded-full" />
                      <div className="h-4 w-32 bg-gray-200 rounded" />
                      <div className="h-8 w-24 bg-gray-200 rounded-lg" />
                    </div>
                  </div>

                  {/* Content section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-56 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    {/* Description editor placeholder */}
                    <div className="space-y-1.5">
                      <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                      <div className="h-[180px] w-full bg-gray-50 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                    {/* CTA field */}
                    <div className="space-y-1.5">
                      <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                      <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                    </div>
                    {/* Digital files section */}
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
                      <div className="h-24 w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 animate-pulse" />
                    </div>
                  </div>

                  {/* Variants section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-56 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    <div className="h-12 w-full bg-gray-100 rounded-xl animate-pulse" />
                  </div>

                  {/* Settings section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-48 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    <div className="space-y-4">
                      <div className="h-4 w-14 bg-gray-200 rounded animate-pulse" />
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="h-10 sm:h-11 bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                        <div className="h-10 sm:h-11 bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                      </div>
                    </div>
                    {/* Toggles */}
                    <div className="space-y-3">
                      <div className="h-14 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                      <div className="h-14 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                    </div>
                  </div>

                  {/* SEO section skeleton */}
                  <div className="space-y-4 sm:space-y-6">
                    <div>
                      <div className="h-5 w-8 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-44 bg-gray-100 rounded mt-1 animate-pulse" />
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                        <div className="h-10 sm:h-11 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                        <div className="h-20 w-full bg-gray-100 rounded-lg border border-gray-200 animate-pulse" />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton Footer */}
        <div className="fixed bottom-0 left-0 right-0 sm:relative bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="h-10 w-20 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-10 w-28 bg-violet-200 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Success Notification - Modern black toast */}
      {showNotification && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-3 fade-in duration-300"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 rounded-xl shadow-2xl shadow-gray-900/20 backdrop-blur-sm border border-gray-800">
            <CheckCircle className="h-4 w-4 text-white flex-shrink-0" />
            <span className="text-sm font-medium text-white tracking-tight">{notificationMessage}</span>
          </div>
        </div>
      )}

      {/* Sticky Header with Title and Pills */}
      <div
        ref={pillBarRef}
        className="flex-shrink-0 bg-white border-b border-gray-200 z-30 shadow-sm"
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Title Row - Collapses smoothly when scrolled with elegant fade */}
            <div
              className={`
                flex items-center gap-2 overflow-hidden
                ${isScrolled
                  ? 'max-h-0 py-0 opacity-0 pointer-events-none scale-95 blur-[2px]'
                  : 'max-h-16 pt-[14px] pb-3 sm:py-3 opacity-100 scale-100 blur-0'
                }
              `}
              style={{
                transitionProperty: 'max-height, padding, opacity, transform, filter',
                transitionDuration: isScrolled ? '400ms' : '350ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDelay: isScrolled ? '0ms' : '50ms',
                transformOrigin: 'top center',
              }}
            >
              <Link
                href="/app/products"
                onClick={handleBackClick}
                className="flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-lg sm:text-xl lg:text-[22px] font-semibold text-gray-900 tracking-tight">
                {productId ? "Edit Product" : "New Product"}
              </h1>

              {/* Publish/Unpublish and View Live buttons - show when product exists */}
              {productId && (
                <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                  {/* Status indicator pill */}
                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                    isPublished
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {isPublished ? "Live" : "Draft"}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleTogglePublish}
                    disabled={isLoading}
                    className="h-8 px-2.5 sm:px-3 text-xs font-medium rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isPublished ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Unpublish</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Publish</span>
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRedirectToProduct}
                    disabled={!slug || !isPublished}
                    className="h-8 px-2.5 sm:px-3 text-xs font-medium rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-40"
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Pills Row */}
            <div
              className={`py-3 transition-all duration-300 ease-out ${isScrolled ? '' : 'pt-0 sm:pt-0.5'}`}
            >
              <div
                ref={pillScrollRef}
                className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {PILL_SECTIONS.map((section) => {
                  const isActive = activeSection === section.id

                  return (
                    <button
                      key={section.id}
                      ref={(el) => { pillRefs.current[section.id as SectionId] = el }}
                      onClick={() => scrollToSection(section.id as SectionId)}
                      className={`
                        flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 lg:px-5 py-2 rounded-full text-[13px] sm:text-[14px] lg:text-[15px] font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0
                        bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800
                      `}
                    >
                      {/* Checkmark circle icon - purple when active, gray otherwise - smooth animation */}
                      <span
                        className={`
                          flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full
                          transition-all duration-500 ease-out
                          ${isActive
                            ? "bg-violet-500 scale-100 shadow-sm shadow-violet-200"
                            : "bg-gray-300 scale-95"
                          }
                        `}
                        style={{
                          transitionProperty: 'background-color, transform, box-shadow',
                          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <Check
                          className={`
                            h-3 w-3 sm:h-3.5 sm:w-3.5
                            transition-all duration-500 ease-out
                            ${isActive ? "text-white scale-110" : "text-gray-500 scale-100"}
                          `}
                          style={{
                            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        />
                      </span>
                      {section.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto bg-gray-50">

        {/* Form Content - White rounded container */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8">
              {/* Form content wrapper - 60% width and left-aligned on desktop */}
              <div className="lg:w-3/5">
              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* About Section */}
              <div
                ref={(el) => { sectionRefs.current.about = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">About</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Tell the world all about your item and why they'll love it.
                  </p>
                </div>

                {/* Title Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                      Title
                    </Label>
                    <TooltipIcon
                      content={
                        <>
                          <p className="font-medium mb-2">Title recommendations:</p>
                          <ul className="text-sm space-y-1 list-disc pl-4">
                            <li>Keep it clear and descriptive</li>
                            <li>Include main benefit or outcome</li>
                            <li>Use keywords customers search for</li>
                            <li>Avoid all caps or excessive punctuation</li>
                            <li>Aim for 5-10 words maximum</li>
                          </ul>
                        </>
                      }
                    />
                  </div>
                  <Input
                    id="title"
                    placeholder="Short sleeve t-shirt"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10 sm:h-11 border-gray-200 bg-white text-sm sm:text-base"
                  />
                </div>
              </div>

              {/* Media Section */}
              <div
                ref={(el) => { sectionRefs.current.media = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Photos and video</h2>
                    <span className="text-red-500">*</span>
                    <TooltipIcon
                      content={
                        <p>Add photos and videos to showcase your product. The first item becomes the thumbnail.</p>
                      }
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Add up to {MAX_PHOTOS} photos and {MAX_YOUTUBE_VIDEOS} video{MAX_YOUTUBE_VIDEOS > 1 ? 's' : ''}.
                  </p>
                </div>

                {/* Draggable Media Grid - Horizontal 16:9 ratio, 2 per row */}
                {mediaItems.length > 0 && (
                  <div
                    ref={mediaGridRef}
                    className="grid grid-cols-2 gap-3 sm:gap-4"
                  >
                    {mediaItems.map((item, index) => (
                      <div
                        key={item.id}
                        data-media-index={index}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`
                          relative aspect-video rounded-lg overflow-hidden border group cursor-move select-none
                          transition-all duration-200 ease-out
                          ${dragOverIndex === index
                            ? "border-violet-500 border-2 scale-105 shadow-lg"
                            : draggedIndex === index || touchDragIndex === index
                              ? "opacity-50 border-dashed border-2 border-violet-300"
                              : "border-gray-200 hover:border-gray-300"
                          }
                          ${isTouchDragging && touchDragIndex === index ? "z-50" : ""}
                        `}
                        style={
                          isTouchDragging && touchDragIndex === index && touchCurrentPos
                            ? {
                                position: "fixed",
                                left: touchCurrentPos.x - 80,
                                top: touchCurrentPos.y - 45,
                                width: 160,
                                height: 90,
                                zIndex: 9999,
                                pointerEvents: "none",
                              }
                            : undefined
                        }
                      >
                        {item.type === "image" && (
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                        )}
                        {item.type === "youtube" && (
                          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                            <div className="text-center">
                              <svg viewBox="0 -7 48 48" className="h-6 w-6 sm:h-8 sm:w-8 mx-auto" fill="none">
                                <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                              </svg>
                              <span className="text-[10px] text-white/70 mt-1 block">YouTube</span>
                            </div>
                          </div>
                        )}

                        {/* Drag handle overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 sm:group-hover:bg-black/30 transition-colors touch-none">
                          <GripVertical className="h-5 w-5 sm:h-6 sm:w-6 text-white opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 transition-opacity" />
                        </div>

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeMedia(item.id)}
                          className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 p-1 bg-white rounded-full shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3 text-gray-600" />
                        </button>

                        {/* Position indicator */}
                        <div className="absolute left-1 top-1 sm:left-1.5 sm:top-1.5 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded bg-black/50 text-[10px] sm:text-xs text-white">
                          {index + 1}
                        </div>

                        {/* Type label */}
                        {index === 0 && (
                          <span className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[9px] sm:text-[10px] rounded">
                            Thumbnail
                          </span>
                        )}
                        {item.type === "youtube" && index !== 0 && (
                          <span className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 px-1.5 py-0.5 bg-red-600 text-white text-[9px] sm:text-[10px] rounded">
                            YouTube
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Zone with skeleton loading */}
                <div
                  className={`
                    border-2 border-dashed rounded-xl
                    flex flex-col items-center justify-center py-6 sm:py-8
                    transition-all duration-200 cursor-pointer
                    ${uploadingMedia ? "pointer-events-none border-gray-300" : ""}
                    ${isExternalDragOver
                      ? "border-violet-500 bg-violet-50 scale-[1.02] shadow-lg shadow-violet-100"
                      : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
                    }
                  `}
                  onClick={() => !uploadingMedia && document.getElementById("media-input")?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current++
                    if (e.dataTransfer.types.includes('Files')) {
                      setIsExternalDragOver(true)
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'copy'
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current--
                    if (dragCounterRef.current === 0) {
                      setIsExternalDragOver(false)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current = 0
                    setIsExternalDragOver(false)
                    handleMediaUpload(e.dataTransfer.files)
                  }}
                >
                  <input
                    id="media-input"
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMediaUpload(e.target.files)}
                    disabled={uploadingMedia}
                  />

                  {uploadingMedia ? (
                    <div className="flex flex-col items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-violet-600 animate-spin" />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <p className="text-sm font-medium text-gray-700">Uploading...</p>
                        <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">{uploadProgress}%</p>
                      </div>
                    </div>
                  ) : isExternalDragOver ? (
                    <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                      <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center animate-pulse">
                        <Plus className="h-6 w-6 text-violet-600" />
                      </div>
                      <p className="text-sm font-medium text-violet-600">
                        Drop files here
                      </p>
                      <p className="text-xs text-violet-500">
                        Release to upload images and videos
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-500 text-xs sm:text-sm mb-2 sm:mb-3">
                        Drag and drop files or
                      </p>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm pointer-events-auto"
                        disabled={uploadingMedia}
                        onClick={(e) => {
                          e.stopPropagation()
                          document.getElementById("media-input")?.click()
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                        Upload
                      </Button>

                      {/* Recommended ratio info */}
                      <p className="mt-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Recommended: horizontal 1280x720px
                      </p>

                      {/* YouTube inline input */}
                      {!showYoutubeInput ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowYoutubeInput(true)
                          }}
                          className="mt-3 text-xs sm:text-sm text-gray-500 hover:text-red-600 flex items-center gap-1.5 transition-colors"
                        >
                          <svg viewBox="0 -7 48 48" className="h-4 w-4 sm:h-5 sm:w-5" fill="none">
                            <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                          </svg>
                          Add YouTube video
                        </button>
                      ) : (
                        <div
                          className="mt-4 w-full max-w-md animate-in fade-in slide-in-from-top-2 duration-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2.5 shadow-sm">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 flex-shrink-0">
                              <svg viewBox="0 -7 48 48" className="h-5 w-5" fill="none">
                                <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                              </svg>
                            </div>
                            <Input
                              placeholder="Paste YouTube URL..."
                              value={youtubeInput}
                              onChange={(e) => setYoutubeInput(e.target.value)}
                              className="flex-1 h-9 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 placeholder:text-gray-400"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddYouTube()
                                }
                                if (e.key === 'Escape') {
                                  setShowYoutubeInput(false)
                                  setYoutubeInput("")
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddYouTube}
                              disabled={!youtubeInput || !parseYouTubeUrl(youtubeInput)}
                              className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:bg-gray-200 disabled:text-gray-400"
                            >
                              Add
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowYoutubeInput(false)
                                setYoutubeInput("")
                              }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {youtubeInput && parseYouTubeUrl(youtubeInput) && (
                            <div className="mt-3 relative aspect-video max-w-[200px] mx-auto rounded-lg overflow-hidden border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200 bg-gray-900 flex items-center justify-center">
                              <div className="text-center">
                                <div className="w-12 h-12 mx-auto rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                                  <Play className="h-6 w-6 text-white ml-0.5" />
                                </div>
                                <p className="mt-2 text-xs text-white/80">YouTube Embed</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  {existingImages}/{MAX_PHOTOS} images · {existingYouTube}/{MAX_YOUTUBE_VIDEOS} YouTube videos
                </p>

                {/* Ratio warning */}
                {ratioWarning && (
                  <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{ratioWarning}</p>
                      <p className="text-amber-600 mt-1">For best results, use horizontal images (1280x720px or 1920x1080px).</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRatioWarning(null)}
                      className="ml-auto p-0.5 text-amber-500 hover:text-amber-700 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div
                ref={(el) => { sectionRefs.current.content = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Content</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Describe your product to attract customers.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Description
                    </Label>
                    <TooltipIcon
                      content={<p>Describe what customers will get</p>}
                    />
                  </div>
                  <DescriptionRichEditor
                    value={description}
                    onChange={setDescription}
                    className="min-h-[150px] sm:min-h-[180px] border border-gray-200 rounded-lg"
                    disableAutoFocus={true}
                  />
                </div>
              </div>

              {/* What's Included Section */}
              <div
                ref={(el) => { sectionRefs.current.whatsIncluded = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">What's Included</h2>
                    <TooltipIcon
                      content={<p>List what customers will receive with their purchase</p>}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Show customers what they'll get (max {MAX_WHATS_INCLUDED} items).
                  </p>
                </div>

                <div className="space-y-2">
                  {whatsIncluded.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <Input
                        value={item}
                        onChange={(e) => {
                          setWhatsIncluded(prev => prev.map((it, i) =>
                            i === index ? e.target.value : it
                          ))
                        }}
                        className="flex-1 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        placeholder="Enter item..."
                      />
                      {whatsIncluded.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setWhatsIncluded(prev => prev.filter((_, i) => i !== index))}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove item"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {whatsIncluded.length < MAX_WHATS_INCLUDED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWhatsIncluded(prev => [...prev, ""])}
                    className="text-gray-600 border-gray-300 h-9"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Item
                  </Button>
                )}
              </div>

              {/* FAQ Section */}
              <div
                ref={(el) => { sectionRefs.current.faq = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">FAQ</h2>
                    <TooltipIcon
                      content={<p>Add frequently asked questions to help customers</p>}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Answer common questions. Default FAQs are included.
                  </p>
                </div>

                <p className="text-xs text-gray-400 mb-2">Drag to reorder FAQs</p>
                <DndContext
                  sensors={faqSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFaqDragEnd}
                >
                  <SortableContext
                    items={faqs.map(faq => faq.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {faqs.map((faq) => (
                        <SortableFAQItem
                          key={faq.id}
                          faq={faq}
                          onUpdate={(id, updates) => {
                            setFaqs(prev => prev.map(f =>
                              f.id === id ? { ...f, ...updates } : f
                            ))
                          }}
                          onRemove={(id) => {
                            setFaqs(prev => prev.filter(f => f.id !== id))
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFaqs(prev => [...prev, {
                    id: `custom-${Date.now()}`,
                    question: "",
                    answer: "",
                    isDefault: false,
                  }])}
                  className="text-gray-600 border-gray-300 h-9"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add FAQ
                </Button>
              </div>

              {/* Digital Files Section */}
              <div
                ref={(el) => { sectionRefs.current.files = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Digital Files</h2>
                    <span className="text-red-500 text-sm">*</span>
                    <TooltipIcon
                      content={<p>Files customers receive after purchase</p>}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Upload files customers will receive (max 5GB each).
                  </p>

                  {digitalFiles.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {digitalFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                          <div className="min-w-0 flex-1 mr-2">
                            {editingFileId === file.id ? (
                              <Input
                                value={editingFileName}
                                onChange={(e) => setEditingFileName(e.target.value)}
                                className="h-7 text-xs sm:text-sm border-gray-300 w-full"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setDigitalFiles(prev => prev.map(f =>
                                      f.id === file.id ? { ...f, file_name: editingFileName } : f
                                    ))
                                    setEditingFileId(null)
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingFileId(null)
                                  }
                                }}
                                onBlur={() => {
                                  setDigitalFiles(prev => prev.map(f =>
                                    f.id === file.id ? { ...f, file_name: editingFileName } : f
                                  ))
                                  setEditingFileId(null)
                                }}
                              />
                            ) : (
                              <p className="text-xs sm:text-sm font-medium text-gray-900 truncate pr-2">{file.file_name}</p>
                            )}
                            <p className="text-[10px] sm:text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFileId(file.id || null)
                                setEditingFileName(file.file_name)
                              }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title="Rename file"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Delete file"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`
                      mt-2 border-2 border-dashed rounded-xl
                      flex flex-col items-center justify-center py-5 sm:py-6
                      transition-all duration-200 cursor-pointer
                      ${uploadingFiles ? "pointer-events-none border-gray-300" : ""}
                      ${isFileDragOver
                        ? "border-violet-500 bg-violet-50 scale-[1.02] shadow-lg shadow-violet-100"
                        : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
                      }
                    `}
                    onClick={() => !uploadingFiles && document.getElementById("file-input")?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      fileDragCounterRef.current++
                      if (e.dataTransfer.types.includes('Files')) {
                        setIsFileDragOver(true)
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'copy'
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      fileDragCounterRef.current--
                      if (fileDragCounterRef.current === 0) {
                        setIsFileDragOver(false)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      fileDragCounterRef.current = 0
                      setIsFileDragOver(false)
                      handleFileUpload(e.dataTransfer.files)
                    }}
                  >
                    <input
                      id="file-input"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingFiles}
                    />

                    {uploadingFiles ? (
                      <div className="flex flex-col items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 text-violet-600 animate-spin" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-sm font-medium text-gray-700">Uploading digital files...</p>
                          <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${fileUploadProgress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">{fileUploadProgress}%</p>
                        </div>
                      </div>
                    ) : isFileDragOver ? (
                      <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center animate-pulse">
                          <Plus className="h-6 w-6 text-violet-600" />
                        </div>
                        <p className="text-sm font-medium text-violet-600">
                          Drop files here
                        </p>
                        <p className="text-xs text-violet-500">
                          Release to upload digital files
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-500 text-xs sm:text-sm mb-2">
                          Drag and drop files or
                        </p>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-gray-300 text-gray-700 h-7 sm:h-8 text-xs sm:text-sm pointer-events-auto"
                          disabled={uploadingFiles}
                          onClick={(e) => {
                            e.stopPropagation()
                            document.getElementById("file-input")?.click()
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                          Upload
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <div
                ref={(el) => { sectionRefs.current.variants = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Variants</h2>
                    <TooltipIcon
                      content={<p>Add different versions of your product with different prices</p>}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Offer different versions or tiers of your product.
                  </p>
                </div>

                {/* Variants List */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <div
                        key={variant.id}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white"
                      >
                        {/* Variant Header */}
                        <div
                          className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            setVariants(prev => prev.map(v =>
                              v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                            ))
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-gray-600">
                              <GripVertical className="h-3.5 w-3.5" />
                            </div>
                            <Layers className="h-4 w-4 text-violet-500" />
                            <span className="text-sm font-medium text-gray-900">{variant.name || "Untitled"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.map(v =>
                                  v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                                ))
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                            >
                              {variant.isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.filter(v => v.id !== variant.id))
                              }}
                              className="p-1.5 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>

                        {/* Variant Content - Collapsible */}
                        {variant.isExpanded && (
                          <div className="p-4 space-y-4 border-t border-gray-200 bg-white">
                            {/* Name */}
                            <div className="space-y-1.5">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700">Name</Label>
                              <Input
                                placeholder="Untitled"
                                value={variant.name}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, name: e.target.value } : v
                                  ))
                                }}
                                className="h-10 border-gray-200 text-sm"
                              />
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700">Description</Label>
                              <Textarea
                                placeholder="Describe this variant..."
                                value={variant.description}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, description: e.target.value } : v
                                  ))
                                }}
                                className="border-gray-200 min-h-[80px] text-sm resize-none"
                              />
                            </div>

                            {/* Price and Max Purchases Row */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm font-medium text-gray-700">Price</Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0"
                                    value={variant.price}
                                    onChange={(e) => {
                                      setVariants(prev => prev.map(v =>
                                        v.id === variant.id ? { ...v, price: e.target.value } : v
                                      ))
                                    }}
                                    className="h-10 pl-7 border-gray-200 text-sm"
                                  />
                                </div>
                                <p className="text-[10px] text-gray-400">Final price for this variant</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm font-medium text-gray-700">Maximum number of purchases</Label>
                                <Input
                                  type="text"
                                  placeholder="∞"
                                  value={variant.maxPurchases}
                                  onChange={(e) => {
                                    setVariants(prev => prev.map(v =>
                                      v.id === variant.id ? { ...v, maxPurchases: e.target.value } : v
                                    ))
                                  }}
                                  className="h-10 border-gray-200 text-sm"
                                />
                              </div>
                            </div>

                            {/* Assigned Digital Files */}
                            <div className="space-y-2 pt-2 border-t border-gray-100">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700">
                                Assigned digital files (optional)
                              </Label>
                              <p className="text-[10px] sm:text-xs text-gray-500">
                                Select files from your uploaded digital products for this variant.
                              </p>

                              {/* File selection */}
                              {digitalFiles.length > 0 ? (
                                <div className="space-y-2">
                                  {digitalFiles.map((file) => {
                                    const isAssigned = variant.assignedFiles?.includes(file.id || '')
                                    return (
                                      <label
                                        key={file.id}
                                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                          isAssigned
                                            ? 'border-violet-300 bg-violet-50'
                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isAssigned}
                                          onChange={(e) => {
                                            setVariants(prev => prev.map(v => {
                                              if (v.id !== variant.id) return v
                                              const currentFiles = v.assignedFiles || []
                                              if (e.target.checked) {
                                                return { ...v, assignedFiles: [...currentFiles, file.id || ''] }
                                              } else {
                                                return { ...v, assignedFiles: currentFiles.filter(f => f !== file.id) }
                                              }
                                            }))
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{file.file_name}</p>
                                          <p className="text-[10px] text-gray-500">{formatFileSize(file.file_size)}</p>
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">
                                  No digital files uploaded yet. Upload files in the Content section above.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Version Button - Max 3 variants */}
                {variants.length < MAX_VARIANTS && (
                  <button
                    type="button"
                    onClick={() => {
                      if (variants.length >= MAX_VARIANTS) return
                      const newVariant: ProductVariant = {
                        id: `variant-${Date.now()}`,
                        name: "Untitled",
                        description: "",
                        price: "0", // FINAL price for this variant
                        maxPurchases: "",
                        isExpanded: true,
                        assignedFiles: [],
                      }
                      setVariants(prev => [...prev, newVariant])
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3 sm:p-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add version
                  </button>
                )}
                {variants.length >= MAX_VARIANTS && (
                  <p className="text-xs text-gray-400 text-center">Maximum {MAX_VARIANTS} variants allowed</p>
                )}
              </div>

              {/* Pricing Section */}
              <div
                ref={(el) => { sectionRefs.current.pricing = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Pricing</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Set your product's price.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="price" className="text-xs sm:text-sm font-medium text-gray-700">
                      Price (USD)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-sm">$</span>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="h-10 sm:h-11 pl-6 sm:pl-7 border-gray-200 text-sm sm:text-base"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="comparePrice" className="text-xs sm:text-sm font-medium text-gray-700">
                      Compare at price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-sm">$</span>
                      <Input
                        id="comparePrice"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={compareAtPrice}
                        onChange={(e) => setCompareAtPrice(e.target.value)}
                        className="h-10 sm:h-11 pl-6 sm:pl-7 border-gray-200 text-sm sm:text-base"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Section */}
              <div
                ref={(el) => { sectionRefs.current.category = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Category</h2>
                    <TooltipIcon
                      content={<p>Help customers find your product</p>}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Select the best category for your product.
                  </p>
                </div>

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCategoryModal(true)}
                    className="w-full h-11 justify-between text-sm border-gray-200"
                  >
                    <span className={selectedCategory ? "text-gray-900" : "text-gray-400"}>
                      {selectedCategory || "Select a category..."}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>

                {/* Category Modal - Mobile Responsive */}
                <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
                  <DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white shadow-xl border p-0 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
                    <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b flex-shrink-0">
                      <DialogTitle className="text-lg sm:text-xl font-semibold">Select Category</DialogTitle>
                      <DialogDescription className="text-sm text-gray-500">
                        Choose a category that best describes your product.
                      </DialogDescription>
                    </DialogHeader>

                    {/* Sticky Search Bar */}
                    <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b bg-white">
                      <Input
                        placeholder="Search 170+ categories..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        className="h-10 sm:h-11 text-sm sm:text-base rounded-lg"
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-3 sm:pt-4">
                      {/* AI Suggestion - Modern Badge Style */}
                      {suggestedCategory && (
                        <div className="mb-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory(suggestedCategory)
                              setShowCategoryModal(false)
                              setCategorySearch("")
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
                              selectedCategory === suggestedCategory
                                ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md"
                                : "bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 border border-violet-200"
                            }`}
                          >
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              selectedCategory === suggestedCategory
                                ? "bg-white/20 text-white"
                                : "bg-violet-500 text-white"
                            }`}>
                              ✨ AI Suggested
                            </span>
                            <span className={`font-medium ${selectedCategory === suggestedCategory ? "text-white" : "text-violet-900"}`}>
                              {suggestedCategory}
                            </span>
                            {selectedCategory === suggestedCategory && (
                              <Check className="ml-auto h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}

                      <div className="space-y-0.5">
                        {CATEGORIES.filter(cat =>
                          cat.toLowerCase().includes(categorySearch.toLowerCase())
                        ).map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(category)
                              setShowCategoryModal(false)
                              setCategorySearch("")
                            }}
                            className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                              selectedCategory === category
                                ? "bg-violet-100 text-violet-900 font-medium"
                                : "hover:bg-gray-50 text-gray-700"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              selectedCategory === category ? "bg-violet-500" : "bg-gray-300"
                            }`} />
                            <span className="flex-1">{category}</span>
                            {selectedCategory === category && (
                              <Check className="h-4 w-4 text-violet-500 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                        {CATEGORIES.filter(cat =>
                          cat.toLowerCase().includes(categorySearch.toLowerCase())
                        ).length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-6">No categories found</p>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 border-t p-4 sm:p-6 pt-3 sm:pt-4 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedCategory(null)
                          setShowCategoryModal(false)
                          setCategorySearch("")
                        }}
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setShowCategoryModal(false)
                          setCategorySearch("")
                        }}
                        className="w-full sm:w-auto bg-violet-500 hover:bg-violet-600"
                      >
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Settings Section */}
              <div
                ref={(el) => { sectionRefs.current.settings = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Settings</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Configure product display and policies.
                  </p>
                </div>

                {/* Call to Action */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="cta" className="text-sm font-medium text-gray-700">
                      Call to action
                    </Label>
                    <TooltipIcon
                      content={<p>Button text shown on the product page</p>}
                    />
                  </div>
                  <Select value={callToAction || "I want this!"} onValueChange={setCallToAction}>
                    <SelectTrigger className="h-10 sm:h-11 border-gray-200 text-sm sm:text-base">
                      <SelectValue placeholder="Select button text" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I want this!">I want this!</SelectItem>
                      <SelectItem value="Buy Now">Buy Now</SelectItem>
                      <SelectItem value="Get Access">Get Access</SelectItem>
                      <SelectItem value="Download Now">Download Now</SelectItem>
                      <SelectItem value="Purchase">Purchase</SelectItem>
                      <SelectItem value="Add to Cart">Add to Cart</SelectItem>
                      <SelectItem value="Join Now">Join Now</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-gray-900">Show sales count</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">Display number of sales on product page</p>
                    </div>
                    <Switch
                      checked={showSalesBadge}
                      onCheckedChange={setShowSalesBadge}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-gray-900">Limit product sales</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">Set a maximum number of sales</p>
                    </div>
                    <Switch
                      checked={limitSalesEnabled}
                      onCheckedChange={setLimitSalesEnabled}
                    />
                  </div>
                  {limitSalesEnabled && (
                    <div className="pl-3 sm:pl-4">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          placeholder="e.g. 100"
                          value={salesLimit}
                          onChange={(e) => setSalesLimit(e.target.value)}
                          className="h-9 w-32 text-sm border-gray-200"
                        />
                        <span className="text-xs text-gray-500">copies</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-gray-900">Enable refund policy</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">Show refund policy on product page</p>
                    </div>
                    <Switch
                      checked={refundPolicyEnabled}
                      onCheckedChange={setRefundPolicyEnabled}
                    />
                  </div>
                  {refundPolicyEnabled && (
                    <Select value={refundPolicyType} onValueChange={setRefundPolicyType}>
                      <SelectTrigger className="h-10 sm:h-11 border-gray-200 text-sm sm:text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_refunds">No refunds allowed</SelectItem>
                        <SelectItem value="7_day">7-day money back guarantee</SelectItem>
                        <SelectItem value="14_day">14-day money back guarantee</SelectItem>
                        <SelectItem value="30_day">30-day money back guarantee</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* SEO Section */}
              <div
                ref={(el) => { sectionRefs.current.seo = el }}
                className="space-y-4 sm:space-y-6"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">SEO</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Optimize your product for search engines.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="seoTitle" className="text-xs sm:text-sm font-medium text-gray-700">
                    SEO title
                  </Label>
                  <Input
                    id="seoTitle"
                    placeholder="Product title for search engines"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    className="h-10 sm:h-11 border-gray-200 text-sm sm:text-base"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-400">
                    {seoTitle.length}/60 characters
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="seoDescription" className="text-xs sm:text-sm font-medium text-gray-700">
                      SEO description
                    </Label>
                    {description && (
                      <button
                        type="button"
                        onClick={generateSeoDescription}
                        disabled={isGeneratingSeo}
                        className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-violet-50 transition-colors"
                      >
                        {isGeneratingSeo ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <span className="text-sm">✨</span>
                            Generate AI SEO
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <Textarea
                    id="seoDescription"
                    placeholder="Brief description for search results (auto-generated from your description)"
                    value={seoDescription}
                    onChange={(e) => {
                      seoManuallyEditedRef.current = true // Track that user manually edited
                      setSeoDescription(e.target.value)
                    }}
                    className="border-gray-200 min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-400">
                    {seoDescription.length}/160 characters {seoDescription.length > 160 && <span className="text-amber-500">• Recommended: under 160</span>}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-medium text-gray-700">
                    Search preview
                  </Label>
                  <div className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-blue-700 text-sm sm:text-base font-medium truncate">
                      {seoTitle || title || "Product title"}
                    </p>
                    <p className="text-green-700 text-xs sm:text-sm truncate">
                      {creator?.username || creator?.slug || "yourstore"}.storelib.com/p/{slug || "product-url"}
                    </p>
                    <p className="text-gray-600 text-xs sm:text-sm line-clamp-2 mt-0.5">
                      {seoDescription || description || "Product description will appear here..."}
                    </p>
                  </div>
                </div>
              </div>
              </div>{/* Close 60% width wrapper */}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar - Fixed on mobile, part of flex layout on desktop */}
      <div className="fixed bottom-0 left-0 right-0 sm:relative sm:bottom-auto sm:left-auto sm:right-auto flex-shrink-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 safe-area-inset-bottom">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700 h-10 sm:h-10 text-sm sm:text-sm px-5 sm:px-5 rounded-lg"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSaveChanges}
              disabled={isLoading || !title.trim() || justSaved}
              className={`h-10 sm:h-10 px-6 sm:px-6 text-sm sm:text-sm rounded-lg font-medium transition-colors ${
                justSaved
                  ? "bg-violet-400 hover:bg-violet-400 text-white cursor-default disabled:bg-violet-400 disabled:opacity-100"
                  : "bg-violet-500 hover:bg-violet-600 text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-4 sm:w-4 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : justSaved ? (
                <>
                  <CheckCircle className="h-4 w-4 sm:h-4 sm:w-4 mr-1.5" />
                  Saved
                </>
              ) : (
                <>
                  <span className="sm:hidden">Save</span>
                  <span className="hidden sm:inline">Save Changes</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Unsaved changes</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              You have unsaved changes. Would you like to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirmExit}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowExitDialog(false)}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={handleSaveAndExit}
              disabled={!title.trim()}
              className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
