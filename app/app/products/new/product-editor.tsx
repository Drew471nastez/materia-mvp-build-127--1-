"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { sheetAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, memo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getProductUrl, getProductShareUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
// Native <select> used instead of Radix Select for reliable dropdown behavior
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
  AlertCircle,
  MoreHorizontal,
} from "lucide-react"
import Link from "next/link"
import { DescriptionRichEditor } from "@/components/store-builder/description-rich-editor"
import { DirectUploader, type UploadStatus } from "@/lib/storage/chunked-upload"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { SWITCH_GROUP, SwitchRow } from "./editor-controls"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { buttonAccent, buttonSecondary, iconButton } from "../../orders/order-parts"
import {
  DEFAULT_FAQS,
  DEFAULT_WHATS_INCLUDED,
  initialForm,
  parseYouTubeUrl,
  snapshotOf,
  snapshotOfForm,
  type EditorCreator,
  type FAQItem,
  type LoadedProduct,
  type MediaItem,
  type ProductVariant,
  type UploadedFile,
} from "./editor-form"

// Section definitions - internal refs for all sections
const SECTIONS = [
  { id: "about", name: "Title" },
  { id: "media", name: "Media" },
  { id: "content", name: "Content" },
  { id: "whatsIncluded", name: "Included" },
  { id: "files", name: "Files" },
  { id: "variants", name: "Variants" },
  { id: "pricing", name: "Pricing" },
  { id: "category", name: "Category" },
  { id: "faq", name: "FAQ" },
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

// Map child sections to their parent pill - Content pill encompasses these sections
const CONTENT_CHILD_SECTIONS = ["content", "whatsIncluded", "files", "variants", "pricing", "category", "faq"] as const

type SectionId = typeof SECTIONS[number]["id"]
type PillSectionId = typeof PILL_SECTIONS[number]["id"]

// Helper to determine which pill is active based on current section
const getPillForSection = (sectionId: SectionId): PillSectionId => {
  if ((CONTENT_CHILD_SECTIONS as readonly string[]).includes(sectionId)) {
    return "content"
  }
  // For about, media, settings, seo - they match directly
  return sectionId as PillSectionId
}

// Limits
const MAX_PHOTOS = 12
const MAX_YOUTUBE_VIDEOS = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB per file
const MAX_DIGITAL_FILES = 15

// Blocked file extensions for security
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "mst",
  "cpl", "hta", "inf", "ins", "isp", "lnk", "reg", "rgs",
  "sct", "shb", "shs", "ws", "vbe", "vbs", "vb",
  "jse", "wsc", "wsf", "wsh",
  "ps1", "psm1", "psd1", "ps1xml", "ps2", "ps2xml",
  "sh", "bash", "csh", "ksh", "zsh",
  "py", "pyc", "pyw", "rb", "pl", "php", "asp", "aspx", "jsp",
  "app", "command", "action", "workflow",
  "jar", "class", "jnlp", "dll", "so", "dylib",
  "iso", "img", "dmg", "vhd", "vhdx",
  "url", "webloc", "desktop",
  "cer", "crt", "der", "p7b", "pfx", "p12",
])

interface ActiveFileUpload {
  file: File
  uploader: DirectUploader
  progress: number
  status: UploadStatus
  error?: string
  bytesUploaded: number
  bytesTotal: number
}


const stripHtmlToPlainText = (input: string): string => {
  if (!input) return ""
  return input
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Helper to get YouTube thumbnail URL from video ID (for product listings only)
// This is ONLY used when no images exist - YouTube thumbnail becomes the product cover
const getYouTubeThumbnailUrl = (videoUrl: string): string | null => {
  const videoId = parseYouTubeUrl(videoUrl)
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
}

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

// Memoized checkbox component for variant file assignment - prevents re-render issues
interface VariantFileCheckboxProps {
  fileId: string
  variantId: string
  fileName: string
  fileSize: number
  isAssigned: boolean
  onToggle: (variantId: string, fileId: string) => void
}

const VariantFileCheckbox = React.memo(function VariantFileCheckbox({
  fileId,
  variantId,
  fileName,
  fileSize,
  isAssigned,
  onToggle
}: VariantFileCheckboxProps) {
  const handleClick = useCallback(() => {
    onToggle(variantId, fileId)
  }, [onToggle, variantId, fileId])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
        isAssigned
          ? 'border-violet-200 bg-violet-50/50'
          : 'border-gray-100 hover:border-gray-200 bg-gray-50/50 hover:bg-gray-50'
      }`}
    >
      <div className={`flex items-center justify-center w-5 h-5 rounded-md border-2 transition-all ${
        isAssigned
          ? 'bg-violet-500 border-violet-500'
          : 'bg-white border-gray-300'
      }`}>
        {isAssigned && <Check className="h-3 w-3 text-white" />}
      </div>
      <FileText className={`h-4 w-4 flex-shrink-0 ${isAssigned ? 'text-violet-500' : 'text-gray-400'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${isAssigned ? 'text-gray-900' : 'text-gray-600'}`}>
          {fileName}
        </p>
        <p className="text-[10px] text-gray-400">{formatFileSize(fileSize)}</p>
      </div>
    </div>
  )
})

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
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-faq-id={faq.id}
      className={`rounded-xl overflow-hidden bg-white border transition-all ${
        isDragging ? "shadow-xl border-violet-300 scale-[1.02]" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Mobile: dedicated drag handle button to prevent accidental activation while scrolling */}
      <div className="sm:hidden flex items-center justify-center py-2.5 px-3 bg-gray-50 border-b border-gray-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-grab active:cursor-grabbing active:bg-violet-50 touch-none select-none transition-colors"
          aria-label="Hold and drag to reorder FAQ"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Hold to drag</span>
        </button>
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Drag handle - desktop only, hidden on mobile */}
          <button
            {...attributes}
            {...listeners}
            className="hidden sm:flex p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0 mt-1"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 space-y-2.5 sm:space-y-3 min-w-0">
            {/* Question field */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Question</label>
              <Input
                value={faq.question}
                onChange={(e) => onUpdate(faq.id, { question: e.target.value })}
                className="h-10 text-sm font-medium border-gray-200 rounded-lg bg-gray-50 focus:bg-white transition-colors"
                placeholder="Enter your question..."
              />
            </div>
            {/* Answer field */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Answer</label>
              <Textarea
                value={faq.answer}
                onChange={(e) => onUpdate(faq.id, { answer: e.target.value })}
                className="text-sm border-gray-200 min-h-[60px] sm:min-h-[70px] rounded-lg bg-gray-50 focus:bg-white transition-colors resize-none"
                placeholder="Enter your answer..."
              />
            </div>
          </div>

          {!faq.isDefault && (
            <button
              type="button"
              onClick={() => onRemove(faq.id)}
              className="p-2 sm:p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              title="Remove FAQ"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {faq.isDefault && (
          <div className="mt-2.5 sm:mt-3 sm:ml-9">
            <span className="text-[10px] text-violet-500 font-medium px-2 py-0.5 bg-violet-50 rounded-full">Default FAQ</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Sortable Media Item component for @dnd-kit grid reordering
interface SortableMediaItemProps {
  item: MediaItem
  index: number
  onRemove: (id: string) => void
}

function SortableMediaItem({ item, index, onRemove }: SortableMediaItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-video rounded-lg overflow-hidden border group select-none ${
        isDragging ? "border-dashed border-violet-300 bg-violet-50/40" : "border-gray-200 hover:border-gray-300 transition-shadow"
      }`}
    >
      {item.type === "image" && (
        <img src={item.url} alt="" className="w-full h-full object-cover" draggable={false} />
      )}
      {item.type === "youtube" && (
        <div className="relative w-full h-full">
          <img
            src={`https://img.youtube.com/vi/${parseYouTubeUrl(item.url)}/hqdefault.jpg`}
            alt="YouTube video thumbnail"
            className="w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5 text-white ml-0.5" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Full-area drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-5 w-5 sm:h-6 sm:w-6 text-white opacity-40 sm:opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
        className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 p-1.5 sm:p-1 bg-white/90 rounded-full shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
      >
        <X className="h-3 w-3 text-gray-600" />
      </button>

      {/* Position indicator */}
      <div className="absolute left-1 top-1 sm:left-1.5 sm:top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/50 text-[10px] font-medium text-white backdrop-blur-sm">
        {index + 1}
      </div>

      {/* Type label */}
      {index === 0 && item.type === "image" && (
        <span className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[9px] sm:text-[10px] rounded backdrop-blur-sm">
          Thumbnail
        </span>
      )}
      {item.type === "youtube" && (
        <span className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 px-1.5 py-0.5 bg-red-600 text-white text-[9px] sm:text-[10px] rounded">
          YouTube
        </span>
      )}
    </div>
  )
}

/**
 * The product form's phone sheets (the category, the call to action, the
 * refund policy) are the shared sheet, components/ui/bottom-sheet: the same
 * opening, drag and close as every sheet in /app, above the navigation
 * pill. This was a sheet of its own, on a CSS transition started a paint
 * late from an effect and a React-rendered drag. It still sits on the
 * keyboard when the category search is typed into.
 */
function MobileSheet({
  isOpen,
  onClose,
  children,
  maxHeight,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  maxHeight?: string
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight={maxHeight ?? "85dvh"} aboveKeyboard>
      {children}
    </BottomSheet>
  )
}

/**
 * A carried message: a product created here is opened at its own address,
 * which is a new page, and the "Product is live" it earned is shown there.
 */
let carriedNotice: string | null = null

export function ProductEditor({ creator: loadedCreator, loaded }: { creator: EditorCreator; loaded: LoadedProduct | null }) {
  const router = useRouter()
  /* The form's first frame is the saved product (./editor-form.ts). Read once:
     a server render after a save hands new props that must not reset it. */
  const [initial] = useState(() => initialForm(loaded))
  const editProductId = loaded?.product.id ?? null
  const [activeSection, setActiveSection] = useState<SectionId>("about")
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creatorId = loadedCreator.id
  const creator = loadedCreator
  const [productId, setProductId] = useState<string | null>(initial.productId)
  /* The name in the bar is the saved one, so it does not follow every key. */
  const [savedTitle, setSavedTitle] = useState(initial.title)

  // Product status tracking
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [showNotification, setShowNotification] = useState(() => carriedNotice !== null)
  const [notificationMessage, setNotificationMessage] = useState(() => carriedNotice ?? "")
  const [justSaved, setJustSaved] = useState(!!initial.productId) // A saved product opens saved
  const savedValuesRef = useRef<string>(initial.productId ? snapshotOfForm(initial) : "") // What "unsaved" is measured against

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // YouTube inline input (bottom sheet on mobile)
  const [showYoutubeInput, setShowYoutubeInput] = useState(false)
  const [youtubeInput, setYoutubeInput] = useState("")

  // CTA bottom sheet for mobile
  const [showCtaSheet, setShowCtaSheet] = useState(false)
  const [showRefundPolicySheet, setShowRefundPolicySheet] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  // Bottom sheet dismiss animation states
  const [dismissingSheet, setDismissingSheet] = useState<string | null>(null)
  const sheetSwipeStartY = useRef<number | null>(null)
  const sheetSwipeCurrentY = useRef(0)
  const sheetSwipeRef = useRef<HTMLDivElement | null>(null)
  const sheetSwipeLastY = useRef(0)
  const sheetSwipeLastTime = useRef(0)
  const sheetSwipeVelocity = useRef(0)
  const swipeCloseRef = useRef(false) // Tracks swipe-initiated close to prevent CSS animation conflict

  // Animated close for bottom sheets
  const closeSheet = useCallback((sheetName: string, closer: () => void) => {
    setDismissingSheet(sheetName)
    setTimeout(() => {
      setDismissingSheet(null)
      closer()
    }, 400)
  }, [])

  const closeCategoryModal = useCallback(() => {
    if (isMobileViewport) {
      closeSheet("category", () => setShowCategoryModal(false))
      return
    }
    setShowCategoryModal(false)
  }, [closeSheet, isMobileViewport])

  // Swipe handlers for bottom sheets — GPU-accelerated, 1:1 finger tracking
  const handleSheetTouchStart = useCallback((e: React.TouchEvent, ref: HTMLDivElement | null) => {
    const target = e.target as HTMLElement
    const isDragHandle = target.closest("[data-drag-handle]")
    const scrollContainer = ref?.querySelector("[data-scroll-container]") as HTMLElement
    const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 1
    const touchY = e.touches[0].clientY
    const bounds = ref?.getBoundingClientRect()
    // Allow swipe start from top 120px of sheet or anywhere on drag handle
    const nearTop = !!bounds && touchY - bounds.top <= 120

    if (isDragHandle || (isAtTop && nearTop)) {
      sheetSwipeStartY.current = touchY
      sheetSwipeCurrentY.current = 0
      sheetSwipeLastY.current = touchY
      sheetSwipeLastTime.current = Date.now()
      sheetSwipeVelocity.current = 0
      sheetSwipeRef.current = ref
      // Force GPU layer for smooth animation
      if (ref) {
        ref.style.willChange = "transform"
        ref.style.backfaceVisibility = "hidden"
      }
    }
  }, [])

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (sheetSwipeStartY.current === null) return
    const touchY = e.touches[0].clientY
    const deltaY = touchY - sheetSwipeStartY.current
    const now = Date.now()
    const dt = Math.max(1, now - sheetSwipeLastTime.current)

    // Smoothed velocity (exponential moving average for stability)
    const instantVelocity = (touchY - sheetSwipeLastY.current) / dt
    sheetSwipeVelocity.current = sheetSwipeVelocity.current * 0.4 + instantVelocity * 0.6

    sheetSwipeLastY.current = touchY
    sheetSwipeLastTime.current = now

    // 1:1 finger tracking for first 80px, then gradual resistance
    const resisted = deltaY > 0
      ? (deltaY <= 80 ? deltaY : 80 + (deltaY - 80) * 0.55)
      : deltaY * 0.15
    if (deltaY > 0) e.preventDefault()

    sheetSwipeCurrentY.current = Math.max(0, deltaY)
    if (sheetSwipeRef.current) {
      sheetSwipeRef.current.style.transform = `translate3d(0, ${resisted}px, 0)`
      sheetSwipeRef.current.style.transition = "none"
    }
  }, [])

  const handleSheetTouchEnd = useCallback((sheetName: string, closer: () => void) => {
    if (sheetSwipeStartY.current === null) return
    sheetSwipeStartY.current = null
    const activeSheet = sheetSwipeRef.current
    const shouldDismiss = sheetSwipeCurrentY.current > 70 || sheetSwipeVelocity.current > 0.4

    if (shouldDismiss) {
      swipeCloseRef.current = true
      setDismissingSheet(sheetName)
      if (activeSheet) {
        activeSheet.style.transition = "transform 350ms cubic-bezier(0.32, 0.72, 0, 1)"
        activeSheet.style.transform = "translate3d(0, 105%, 0)"
      }
      setTimeout(() => {
        if (activeSheet) {
          activeSheet.style.transition = ""
          activeSheet.style.transform = ""
          activeSheet.style.willChange = ""
        }
        sheetSwipeRef.current = null
        swipeCloseRef.current = false
        setDismissingSheet(null)
        closer()
      }, 350)
      sheetSwipeCurrentY.current = 0
      sheetSwipeVelocity.current = 0
      return
    }

    // Snap back with spring animation
    if (activeSheet) {
      activeSheet.style.transition = "transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1)"
      activeSheet.style.transform = "translate3d(0, 0, 0)"
      setTimeout(() => {
        if (activeSheet) {
          activeSheet.style.transition = ""
          activeSheet.style.transform = ""
          activeSheet.style.willChange = ""
        }
        sheetSwipeRef.current = null
      }, 300)
    }
    sheetSwipeCurrentY.current = 0
    sheetSwipeVelocity.current = 0
  }, [])

  // Whether anything has scrolled under the bar (its hairline)
  const [isScrolled, setIsScrolled] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 640)
    syncViewport()
    window.addEventListener("resize", syncViewport)
    return () => window.removeEventListener("resize", syncViewport)
  }, [])

  // Refs for sections
  const sectionRefs = useRef<{ [key in SectionId]?: HTMLDivElement | null }>({})
  const pillScrollRef = useRef<HTMLDivElement>(null)
  const pillRefs = useRef<{ [key in SectionId]?: HTMLButtonElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // About section fields
  const [title, setTitle] = useState(initial.title)

  // Media section fields - unified draggable media
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initial.mediaItems)
  const [activeDragItem, setActiveDragItem] = useState<MediaItem | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Content tab fields
  const [description, setDescription] = useState(initial.description)
  const [callToAction, setCallToAction] = useState(initial.callToAction)
  const [digitalFiles, setDigitalFiles] = useState<UploadedFile[]>(initial.digitalFiles)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [fileUploadProgress, setFileUploadProgress] = useState(0)
  const [activeFileUploads, setActiveFileUploads] = useState<Map<string, ActiveFileUpload>>(new Map())
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const fileDragCounterRef = useRef(0)

  // Settings tab fields
  const [price, setPrice] = useState(initial.price)
  const [compareAtPrice, setCompareAtPrice] = useState(initial.compareAtPrice)
  const [slug, setSlug] = useState(initial.slug)
  const [productType] = useState<"digital" | "course">(initial.productType)
  const [showSalesBadge, setShowSalesBadge] = useState(initial.showSalesBadge)
  const [refundPolicyEnabled, setRefundPolicyEnabled] = useState(initial.refundPolicyEnabled)
  const [refundPolicyType, setRefundPolicyType] = useState(initial.refundPolicyType)

  // SEO tab fields
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription)
  const seoManuallyEditedRef = useRef(initial.seoEdited) // A saved SEO description is not rewritten from the description

  // Drag state for media
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Touch drag state for mobile - long press to initiate
  const [touchDragIndex, setTouchDragIndex] = useState<number | null>(null)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null)
  const [touchCurrentPos, setTouchCurrentPos] = useState<{ x: number; y: number } | null>(null)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const [touchLongPressReady, setTouchLongPressReady] = useState(false)
  const touchDragRef = useRef<HTMLDivElement>(null)
  const mediaGridRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const touchPendingIndexRef = useRef<number | null>(null)

  // External file drag state for media picker
  const [isExternalDragOver, setIsExternalDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Scroll-aware touch tracking to prevent accidental triggers while scrolling
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  // Track scrolling state to prevent accidental element activation
  useEffect(() => {
    const scrollContainer = contentRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      isScrollingRef.current = true
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
      }, 150)
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  // Guard click handler: only fire if not scrolling and touch didn't move
  const handleUploadZoneClick = useCallback(() => {
    if (uploadingMedia || isScrollingRef.current) return
    document.getElementById("media-input")?.click()
  }, [uploadingMedia])

  // Ratio warning state for non-widescreen images
  const [ratioWarning, setRatioWarning] = useState<string | null>(null)

  // File renaming state
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [editingFileName, setEditingFileName] = useState("")

  // Variants state (max 7 variants)
  const [variants, setVariants] = useState<ProductVariant[]>(initial.variants)
  const MAX_VARIANTS = 7

  // Pay What You Want state (product-level, used when no variants)
  const [payWhatYouWant, setPayWhatYouWant] = useState(initial.payWhatYouWant)
  const [pwywMinPrice, setPwywMinPrice] = useState(initial.pwywMinPrice)
  const [pwywSuggestedPrice, setPwywSuggestedPrice] = useState(initial.pwywSuggestedPrice)

  // What's Included state (3 defaults + 5 custom max = 8 total)
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>(initial.whatsIncluded)
  const MAX_WHATS_INCLUDED = 8

  // FAQ state (3 defaults + unlimited custom)
  const [faqs, setFaqs] = useState<FAQItem[]>(initial.faqs)

  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initial.selectedCategory)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Toast notification state for validation errors (with dismissing animation state)
  const [toast, setToast] = useState<{ message: string; visible: boolean; dismissing: boolean }>({ message: "", visible: false, dismissing: false })
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Limit product sales state
  const [limitSalesEnabled, setLimitSalesEnabled] = useState(false)
  const [salesLimit, setSalesLimit] = useState("")

  // AI suggestion states
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null)

  // DnD sensors for FAQ reorder (higher thresholds to prevent accidental drag on scroll)
  const faqSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 12,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 380,
        tolerance: 14,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // DnD sensors for media grid reorder (higher thresholds to prevent accidental drag on scroll)
  const mediaSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 12,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 12,
      },
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

  // Handle media drag start - track which item is being dragged (for DragOverlay)
  const handleMediaDragStart = useCallback((event: DragStartEvent) => {
    const item = mediaItems.find((i) => i.id === event.active.id)
    setActiveDragItem(item || null)
  }, [mediaItems])

  // Handle media drag end - reorder media items and clear overlay
  const handleMediaDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragItem(null)
    const { active, over } = event
    if (over && active.id !== over.id) {
      setMediaItems((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id)
        const newIndex = prev.findIndex((item) => item.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [])

  // Stable handler for toggling variant assigned files - defined at component level to avoid closure issues
  const handleToggleVariantFile = useCallback((variantId: string, fileId: string) => {
    if (!variantId || !fileId) return

    setVariants(currentVariants => {
      if (!currentVariants || !Array.isArray(currentVariants)) return currentVariants || []

      return currentVariants.map(v => {
        if (!v || v.id !== variantId) return v

        const currentFiles = Array.isArray(v.assignedFiles) ? v.assignedFiles : []
        const fileExists = currentFiles.includes(fileId)

        return {
          ...v,
          assignedFiles: fileExists
            ? currentFiles.filter(f => f !== fileId)
            : [...currentFiles, fileId]
        }
      })
    })
  }, [])

  // Grouped categories structure
  const CATEGORY_GROUPS: Record<string, { icon: string; categories: string[] }> = {
    "Design & Creative": {
      icon: "•",
      categories: [
        "Digital Art", "Graphics", "Illustrations", "Vector Art", "Icons", "Fonts", "Clip Art",
        "Photoshop Actions", "Photoshop Brushes", "Lightroom Presets", "Lightroom Profiles",
        "Procreate Brushes", "Procreate Stamps", "Design Systems", "UI Kits", "Wireframes",
        "Prototypes", "Brand Kits", "Brand Guidelines", "Logo Templates", "Logo Packs",
        "Pattern Designs", "Textures", "Backgrounds", "Overlays", "Filters", "Color Palettes", "Gradients",
        "Figma Templates", "Sketch Templates", "Adobe XD Templates", "Canva Templates"
      ]
    },
    "VFX & Motion": {
      icon: "•",
      categories: [
        "Motion Graphics", "After Effects Templates", "Premiere Pro Templates", "DaVinci Resolve Templates",
        "Transitions", "Lower Thirds", "Intros", "Outros", "Video Templates", "Video LUTs",
        "Visual Effects", "VFX Presets", "Animation Templates", "Animated Elements", "Title Templates",
        "Green Screen Assets", "Particle Effects", "Light Leaks", "Glitch Effects", "Cinematic LUTs"
      ]
    },
    "Audio & Music": {
      icon: "•",
      categories: [
        "Sample Packs", "Drum Kits", "Loops", "MIDI Files", "Presets", "Synth Presets",
        "Vocal Samples", "Beats", "Instrumentals", "Sound Effects", "Music Tracks", "Audio Files",
        "Sound Libraries", "Ableton Templates", "FL Studio Templates", "Logic Pro Templates",
        "Podcasts", "Audiobooks", "Podcast Templates", "Podcast Artwork", "Podcast Intros",
        "Audio Branding", "Voice Overs", "Jingles", "Ringtones", "Ambient Sounds"
      ]
    },
    "Software & Development": {
      icon: "•",
      categories: [
        "Software", "Plugins", "Extensions", "Code Snippets", "Scripts", "APIs", "SDKs",
        "Libraries", "Frameworks", "WordPress Themes", "WordPress Plugins", "Shopify Themes",
        "Shopify Apps", "Web Apps", "SaaS Products", "Mobile Apps", "Desktop Apps",
        "Source Code", "Databases", "Development Tools", "CLI Tools", "DevOps Tools",
        "Bots", "Automation Scripts", "Browser Extensions", "App Templates"
      ]
    },
    "AI & Automation": {
      icon: "•",
      categories: [
        "AI Tools", "AI Assistants", "AI Agents", "AI Models", "Machine Learning", "Datasets",
        "Algorithms", "GPT Templates", "ChatGPT Prompts", "Claude Prompts", "Gemini Prompts",
        "AI Prompts", "Midjourney Prompts", "Stable Diffusion Prompts", "DALL-E Prompts",
        "AI Workflows", "Automation Workflows", "Zapier Templates", "Make Templates", "n8n Workflows",
        "AI Art Generators", "AI Voice Tools", "Text to Speech", "Prompt Packs"
      ]
    },
    "Gaming & Esports": {
      icon: "•",
      categories: [
        "Games", "Game Assets", "Unity Assets", "Unreal Assets", "Sprites", "Tilesets",
        "Gaming Guides", "Strategy Guides", "Walkthroughs", "Cheat Codes", "Modding Tools", "Game Mods",
        "Esports Coaching", "Gaming Overlays", "Stream Overlays", "Twitch Panels", "Twitch Emotes",
        "Discord Assets", "Discord Bots", "Gaming Avatars", "Gaming Banners", "Gaming Templates",
        "Controller Skins", "Character Models", "Game UI Kits"
      ]
    },
    "3D & Assets": {
      icon: "•",
      categories: [
        "3D Assets", "3D Models", "3D Printing Files", "3D Characters", "3D Environments",
        "3D Props", "3D Textures", "3D Materials", "Blender Assets", "Maya Assets",
        "Cinema 4D Assets", "HDRI Images", "PBR Materials", "CAD Files", "Architectural Models"
      ]
    },
    "Photography & Video": {
      icon: "•",
      categories: [
        "Stock Photos", "Stock Videos", "Photo Presets", "Thumbnails", "YouTube Templates",
        "Instagram Reels Templates", "TikTok Templates", "Travel Photography", "Food Photography Presets",
        "Portrait Presets", "Landscape Presets", "Film Emulation", "Photo Overlays", "Photo Frames"
      ]
    },
    "Templates & Mockups": {
      icon: "•",
      categories: [
        "Templates", "Mockups", "Presentations", "Resume Templates", "Business Cards", "Flyers",
        "Posters", "Brochures", "Social Media Templates", "Website Templates", "Mobile App Templates",
        "Email Templates", "Newsletter Designs", "Notion Templates", "Notion Dashboards",
        "Notion Databases", "Notion Wikis", "Second Brain Templates", "PARA Templates", "GTD Templates"
      ]
    },
    "Education & Courses": {
      icon: "•",
      categories: [
        "Online Courses", "Video Courses", "Tutorials", "Workshops", "Masterclasses", "Video Lessons",
        "Webinars", "Educational Content", "Study Guides", "Cheat Sheets", "Flashcards", "Quizzes",
        "Language Learning", "Test Prep", "Certifications", "Training Materials", "Curriculum",
        "Homeschool Resources", "Learning Materials", "Educational Games"
      ]
    },
    "Business & Marketing": {
      icon: "•",
      categories: [
        "Business Plans", "Marketing Plans", "Sales Funnels", "Marketing Funnels", "Landing Pages",
        "Lead Magnets", "Case Studies", "White Papers", "Pitch Decks", "Reports", "Analytics Templates",
        "CRM Templates", "Project Management", "SOPs", "Spreadsheets", "Financial Models",
        "Invoices", "Contracts", "Legal Templates", "NDA Templates", "Proposal Templates",
        "Quotation Templates", "Business Proposals", "Business Model Canvas", "Lean Canvas"
      ]
    },
    "Startup & Entrepreneurship": {
      icon: "•",
      categories: [
        "Startup Templates", "Investor Decks", "Fundraising Guides", "Startup Playbooks",
        "Growth Hacking", "MVP Templates", "Product Roadmaps", "OKR Templates",
        "Venture Capital", "Angel Investing", "Pitch Templates", "Startup Guides"
      ]
    },
    "Ecommerce & Sales": {
      icon: "•",
      categories: [
        "Ecommerce Templates", "Dropshipping Guides", "Product Research", "Supplier Lists",
        "Store Setups", "Amazon FBA Guides", "Etsy Templates", "Gumroad Templates",
        "Product Descriptions", "Pricing Strategies", "Sales Playbooks", "CRM Setups",
        "HubSpot Templates", "Salesforce Templates", "Pipeline Templates", "Closing Scripts"
      ]
    },
    "Writing & Content": {
      icon: "•",
      categories: [
        "Ebooks", "Writing Templates", "Content Calendars", "Blog Posts", "Articles", "Ghostwriting",
        "Copywriting Templates", "Ad Copy", "Sales Scripts", "Email Sequences", "Cold Email Templates",
        "Newsletter Templates", "Documentation", "Guides", "Manuals"
      ]
    },
    "Social Media": {
      icon: "•",
      categories: [
        "Instagram Templates", "Pinterest Templates", "LinkedIn Posts", "Twitter Templates",
        "Social Media Planners", "Content Planners", "Hashtag Guides", "Bio Templates",
        "Link in Bio Templates", "Creator Toolkits", "Sponsorship Templates", "Media Kits",
        "Brand Deal Templates", "UGC Templates", "Influencer Contracts", "Rate Cards"
      ]
    },
    "Email Marketing": {
      icon: "•",
      categories: [
        "Email Funnels", "Drip Campaigns", "Welcome Sequences", "Launch Sequences",
        "Re-engagement Emails", "Substack Templates", "ConvertKit Templates", "Mailchimp Templates",
        "Beehiiv Templates", "Newsletter Growth", "Cold Outreach Templates"
      ]
    },
    "No-Code & Tools": {
      icon: "•",
      categories: [
        "No-Code Templates", "Bubble Templates", "Webflow Templates", "Airtable Bases", "Glide Apps",
        "Softr Templates", "Adalo Templates", "FlutterFlow Templates", "Retool Templates", "Xano Templates"
      ]
    },
    "Finance & Investing": {
      icon: "•",
      categories: [
        "Investment Templates", "Stock Analysis", "Portfolio Trackers", "Crypto Trackers", "Tax Templates",
        "Expense Trackers", "Savings Planners", "Debt Payoff", "Financial Literacy", "Money Guides",
        "Trading Strategies", "DeFi Guides", "Crypto Guides", "NFT Art", "NFT Collections"
      ]
    },
    "Health & Fitness": {
      icon: "•",
      categories: [
        "Workout Plans", "Meal Plans", "Nutrition Guides", "Recipe Books", "Diet Plans",
        "Fitness Programs", "Meditation Guides", "Wellness Journals", "Health Trackers", "Yoga Guides"
      ]
    },
    "Personal Development": {
      icon: "•",
      categories: [
        "Planners", "Journals", "Trackers", "Goal Setting", "Habit Trackers", "Budget Planners",
        "Mindmaps", "Note Taking", "Productivity Systems", "Life Coaching", "Self-Help Guides",
        "Affirmation Cards", "Vision Boards", "Gratitude Journals", "Daily Planners", "Weekly Reviews"
      ]
    },
    "Spirituality & Mindfulness": {
      icon: "•",
      categories: [
        "Tarot Guides", "Astrology Charts", "Horoscope Templates", "Crystal Guides", "Energy Healing",
        "Chakra Guides", "Manifestation Guides", "Law of Attraction", "Spiritual Journals", "Prayer Guides"
      ]
    },
    "Art & Crafts": {
      icon: "•",
      categories: [
        "Printables", "Coloring Pages", "Patterns", "SVG Files", "Cut Files", "Cricut Designs",
        "Embroidery Designs", "Knitting Patterns", "Sewing Patterns", "Craft Templates",
        "Stickers", "Labels", "Invitations", "Greeting Cards", "Wall Art", "Digital Planners"
      ]
    },
    "Print on Demand": {
      icon: "•",
      categories: [
        "T-Shirt Designs", "Mug Designs", "Phone Case Designs", "Poster Designs", "Tote Bag Designs",
        "Sticker Designs", "Print Designs", "Apparel Graphics", "Merchandise Templates"
      ]
    },
    "Fashion & Beauty": {
      icon: "•",
      categories: [
        "Fashion Lookbooks", "Outfit Guides", "Style Guides", "Fashion Illustrations", "Fashion Sketches",
        "Makeup Tutorials", "Beauty Guides", "Skincare Routines", "Hair Care Guides", "Nail Art Designs",
        "Fashion Presets", "Beauty Presets", "Fashion Templates", "Lookbook Templates"
      ]
    },
    "Real Estate": {
      icon: "•",
      categories: [
        "Real Estate Flyers", "Property Listings", "Real Estate Templates", "Property Management",
        "Rental Agreements", "Real Estate Guides", "Investment Guides", "Property Analysis",
        "Real Estate Marketing", "Open House Templates"
      ]
    },
    "Events & Weddings": {
      icon: "•",
      categories: [
        "Wedding Templates", "Wedding Invitations", "Save the Date", "Event Flyers", "Party Invitations",
        "Event Planning", "Wedding Planning", "Event Checklists", "Seating Charts", "Menu Templates",
        "RSVP Templates", "Thank You Cards", "Event Programs", "Wedding Programs"
      ]
    },
    "Food & Cooking": {
      icon: "•",
      categories: [
        "Cookbook", "Recipe Cards", "Meal Prep Guides", "Cooking Tutorials", "Baking Recipes",
        "Restaurant Menus", "Food Blogs", "Cocktail Recipes", "Smoothie Recipes"
      ]
    },
    "Travel & Adventure": {
      icon: "•",
      categories: [
        "Travel Guides", "Itinerary Templates", "Packing Lists", "Travel Journals", "Destination Guides",
        "Travel Presets", "Adventure Guides", "Hiking Guides", "Camping Guides"
      ]
    },
    "Parenting & Family": {
      icon: "•",
      categories: [
        "Parenting Guides", "Baby Planners", "Pregnancy Journals", "Family Budgets", "Chore Charts",
        "Kids Activities", "Childcare Templates"
      ]
    },
    "Home & Interior": {
      icon: "•",
      categories: [
        "Interior Design", "Home Decor", "Room Planners", "Floor Plans", "Furniture Layouts",
        "DIY Home Projects", "Organization Templates", "Cleaning Checklists", "Home Inventory", "Renovation Guides"
      ]
    },
    "Career & Job Search": {
      icon: "•",
      categories: [
        "Cover Letters", "Portfolio Templates", "LinkedIn Templates", "Interview Prep", "Career Guides",
        "Salary Negotiation", "Job Search Trackers", "Networking Templates", "Personal Branding", "Career Coaching"
      ]
    },
    "Agency & Freelance": {
      icon: "•",
      categories: [
        "Agency Templates", "Client Onboarding", "Project Briefs", "Scope of Work", "Retainer Agreements",
        "Freelance Contracts", "Rate Calculators", "Time Trackers", "Client Portals", "Service Packages"
      ]
    },
    "Community & Membership": {
      icon: "•",
      categories: [
        "Community Templates", "Membership Sites", "Circle Templates", "Skool Templates", "Mighty Networks",
        "Community Playbooks", "Engagement Strategies", "Onboarding Sequences", "Welcome Emails", "Community Guidelines"
      ]
    },
    "Data & Analytics": {
      icon: "•",
      categories: [
        "Dashboard Templates", "Data Visualization", "Excel Templates", "Google Sheets", "Power BI Templates",
        "Tableau Templates", "SQL Queries", "Data Analysis", "KPI Trackers", "Reporting Templates"
      ]
    },
    "Pet & Animals": {
      icon: "•",
      categories: [
        "Pet Care Guides", "Dog Training", "Cat Care", "Pet Health", "Animal Illustrations",
        "Pet Journals", "Vet Records", "Pet Planners"
      ]
    },
    "Other": {
      icon: "•",
      categories: [
        "Memberships", "Subscriptions", "Coaching", "Consulting", "Services", "Freelance Services",
        "Bundles", "Collections", "Preorders", "Gift Cards", "Licenses", "Other"
      ]
    }
  }

  // Flat list of all categories for search and AI suggestion
  const ALL_CATEGORIES = Object.values(CATEGORY_GROUPS).flatMap(g => g.categories).sort()

  // Toggle category group expansion
  const toggleGroupExpansion = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }

  // Find which group a category belongs to
  const findCategoryGroup = (category: string): string | null => {
    for (const [groupName, group] of Object.entries(CATEGORY_GROUPS)) {
      if (group.categories.includes(category)) {
        return groupName
      }
    }
    return null
  }

  // Show toast notification with animated dismiss
  const dismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, dismissing: true }))
    setTimeout(() => {
      setToast({ message: "", visible: false, dismissing: false })
    }, 250)
  }, [])

  const showToast = useCallback((message: string) => {
    // Clear any existing timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    setToast({ message, visible: true, dismissing: false })

    // Hide toast after 5 seconds with animated dismiss
    toastTimeoutRef.current = setTimeout(() => {
      dismissToast()
    }, 5000)
  }, [dismissToast])

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


  // Track changes for unsaved warning - compare against last saved values
  useEffect(() => {
    // Create a snapshot of current values
    const currentValues = snapshotOf({
      title, description, price, compareAtPrice, mediaItems, digitalFiles, variants,
      whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit, callToAction,
      showSalesBadge, refundPolicyEnabled, refundPolicyType,
      payWhatYouWant, pwywMinPrice, pwywSuggestedPrice,
    })

    // Back to exactly what is saved: nothing to save, whatever was typed in between
    if (savedValuesRef.current && currentValues === savedValuesRef.current) {
      setHasUnsavedChanges(false)
      if (productId) setJustSaved(true)
      return
    }

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
  }, [title, description, price, compareAtPrice, mediaItems, digitalFiles, variants, whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit, callToAction, justSaved, showSalesBadge, refundPolicyEnabled, refundPolicyType, payWhatYouWant, pwywMinPrice, pwywSuggestedPrice, productId])

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

  // Update document title based on edit mode
  useEffect(() => {
    const pageTitle = editProductId ? "Edit Product | Storelib" : "Add Product | Storelib"
    document.title = pageTitle

    // Cleanup: restore default title on unmount
    return () => {
      document.title = "Storelib"
    }
  }, [editProductId])

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

  /*
    OPENS AT THE TOP, AND AT ONCE. This used to hold the form back for 300ms
    behind a skeleton of its own while it re-scrolled six times; the form is
    drawn from the first frame now, so one reset before paint is the whole of
    it, and the carried "Product is live" goes away on its own.
  */
  useLayoutEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (contentRef.current) contentRef.current.scrollTop = 0
    if (!carriedNotice) return
    carriedNotice = null
    const t = setTimeout(() => setShowNotification(false), 3000)
    return () => clearTimeout(t)
  }, [])

  // Scroll spy for active section and header hide/show - only after page is ready
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return

      // Track scroll position for header
      const scrollTop = contentRef.current.scrollTop
      setIsScrolled(scrollTop > 0)
      const barHeight = barRef.current?.offsetHeight ?? 0

      // Find which section is currently in view
      let currentSection: SectionId = "about"
      const containerRect = contentRef.current.getBoundingClientRect()

      for (const section of SECTIONS) {
        const element = sectionRefs.current[section.id]
        if (element) {
          const rect = element.getBoundingClientRect()
          // Check if section top is above the middle of the viewport
          const relativeTop = rect.top - containerRect.top

          if (relativeTop <= barHeight + 48) {
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
  }, [activeSection])

  // Scroll to section when pill clicked with smooth animation
  const scrollToSection = (sectionId: SectionId) => {
    const element = sectionRefs.current[sectionId]
    if (element && contentRef.current) {
      const containerRect = contentRef.current.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const bar = barRef.current?.offsetHeight ?? 0
      const scrollTop = contentRef.current.scrollTop + (elementRect.top - containerRect.top) - bar - 16

      contentRef.current.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: "smooth"
      })
    }
  }

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
  // Only updates if user hasn't manually edited the SEO description field directly
  useEffect(() => {
    // Skip if user has manually edited the SEO description field
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

  // Reset the manually edited flag when creating a new product (no edit param)
  useEffect(() => {
    if (!editProductId) {
      seoManuallyEditedRef.current = false
    }
  }, [editProductId])

  // Create or update product
  const saveProduct = useCallback(async (publish = false) => {
    if (!creatorId) return null
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    try {
      let finalSlug = slug
      /** One suffix scheme, used by both checks below. */
      const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
      // Check for duplicate slug for THIS creator (unique constraint is per-creator)
      // Runs for both create AND update — excludes current product when updating
      {
        let query = supabase
          .from("products")
          .select("id")
          .eq("slug", slug)
          .eq("creator_id", creatorId)

        // When updating, exclude the current product from the duplicate check
        if (productId) {
          query = query.neq("id", productId)
        }

        const { data: existing } = await query.maybeSingle()

        if (existing) {
          // Add timestamp + random suffix to ensure uniqueness
          finalSlug = `${slug}-${suffix()}`
        }
      }

      /*
        AND NOT A NAME A ROUTE ALREADY ANSWERS TO. A product sits at
        /{handle}/{slug}, and the OnePage sits at /{handle}/links — a static
        segment, which Next matches ahead of the dynamic one. A product
        slugged `links` would open the creator's OnePage instead of itself,
        with nothing anywhere saying why. It gets the same suffix a duplicate
        gets, so it keeps an address that works.
      */
      finalSlug = avoidReservedProductSlug(finalSlug, suffix)

      // Get photo URLs from media items (images and YouTube)
      const photoUrls = mediaItems.filter(m => m.type === "image").map(m => m.url)
      const youtubeItems = mediaItems.filter(m => m.type === "youtube")

      // Determine thumbnail based on FIRST media item position
      // If YouTube is positioned 1st, use YouTube thumbnail as cover
      // If image is positioned 1st, use that image as cover
      const firstMedia = mediaItems[0]
      let determinedThumbnailUrl: string | null = null
      if (firstMedia?.type === "youtube") {
        determinedThumbnailUrl = getYouTubeThumbnailUrl(firstMedia.url)
      } else if (firstMedia?.type === "image") {
        determinedThumbnailUrl = firstMedia.url
      }

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
        // Thumbnail uses the FIRST media item - respects drag-and-drop ordering
        // If YouTube is 1st, uses YouTube thumbnail. If image is 1st, uses that image.
        thumbnail_url: determinedThumbnailUrl,
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
        // Pay What You Want fields (product-level)
        pay_what_you_want: payWhatYouWant,
        pwyw_min_price_cents: payWhatYouWant && pwywMinPrice ? Math.round(Number.parseFloat(pwywMinPrice) * 100) : null,
        pwyw_suggested_price_cents: payWhatYouWant && pwywSuggestedPrice ? Math.round(Number.parseFloat(pwywSuggestedPrice) * 100) : null,
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

      // Save variants - smart update/delete/insert to preserve IDs and foreign key references
      if (finalProductId) {
        console.log("Managing variants for product", finalProductId, "- UI has", variants.length, "variants")

        // Step 1: Get existing variants from DB
        const { data: existingDbVariants } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", finalProductId)

        const existingDbIds = new Set((existingDbVariants || []).map(v => v.id))
        const uiVariantIds = new Set(variants.filter(v => v.id).map(v => v.id))

        // Step 2: Find variants to delete (in DB but not in UI)
        const variantIdsToDelete = [...existingDbIds].filter(id => !uiVariantIds.has(id))

        // Step 3: Delete removed variants (and their files via cascade)
        if (variantIdsToDelete.length > 0) {
          console.log("Deleting", variantIdsToDelete.length, "removed variants")

          // Delete variant files first
          await supabase
            .from("product_variant_files")
            .delete()
            .in("variant_id", variantIdsToDelete)

          // Delete the variants
          const { error: deleteError } = await supabase
            .from("product_variants")
            .delete()
            .in("id", variantIdsToDelete)

          if (deleteError) {
            console.error("Error deleting variants:", deleteError)
            throw new Error(`Failed to delete variants: ${deleteError.message}`)
          }
        }

        // Step 4: Update existing variants and insert new ones
        const savedVariantIds: string[] = []

        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i]

          const variantData = {
            product_id: finalProductId,
            name: variant.name || "Untitled",
            description: variant.description || null,
            price_cents: Math.round(Number.parseFloat(variant.price || "0") * 100),
            compare_at_price_cents: variant.compareAtPrice ? Math.round(Number.parseFloat(variant.compareAtPrice) * 100) : null,
            max_purchases: variant.maxPurchases ? parseInt(variant.maxPurchases) : null,
            position: i,
            pay_what_you_want: variant.payWhatYouWant || false,
            pwyw_min_price_cents: variant.payWhatYouWant && variant.pwywMinPrice ? Math.round(Number.parseFloat(variant.pwywMinPrice) * 100) : null,
            pwyw_suggested_price_cents: variant.payWhatYouWant && variant.pwywSuggestedPrice ? Math.round(Number.parseFloat(variant.pwywSuggestedPrice) * 100) : null,
          }

          let savedVariant: any = null
          let variantError: any = null

          if (variant.id && existingDbIds.has(variant.id)) {
            // Update existing variant
            const result = await supabase
              .from("product_variants")
              .update(variantData)
              .eq("id", variant.id)
              .select()
              .single()
            savedVariant = result.data
            variantError = result.error
          } else {
            // Insert new variant
            const result = await supabase
              .from("product_variants")
              .insert(variantData)
              .select()
              .single()
            savedVariant = result.data
            variantError = result.error
          }

          if (variantError) {
            console.error("Error saving variant:", variantError)
            const errMsg = variantError.message || ""
            if (errMsg.includes("schema cache") || errMsg.includes("column") || errMsg.includes("does not exist")) {
              throw new Error(`Database schema error: Please run scripts/050_complete_product_features.sql in Supabase SQL Editor, then refresh the page. (Error: ${errMsg})`)
            }
            if (variantError.code === "42501" || errMsg.includes("row-level security") || errMsg.includes("permission")) {
              throw new Error(`Permission denied saving variants. Check RLS policies for product_variants table.`)
            }
            throw new Error(`Failed to save variant "${variant.name}": ${errMsg}`)
          }

          if (savedVariant) {
            savedVariantIds.push(savedVariant.id)

            // Update variant files - delete old and insert new
            await supabase
              .from("product_variant_files")
              .delete()
              .eq("variant_id", savedVariant.id)

            if (variant.assignedFiles && variant.assignedFiles.length > 0) {
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
                }

                // Auto-generate variant ZIP bundle when variant has 6+ assigned files
                if (assets.length >= 6) {
                  fetch("/api/v2/upload/bundle", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productId: finalProductId, variantId: savedVariant.id }),
                  }).catch(() => { /* Non-critical: bundle can be regenerated on next save */ })
                }
              }
            }
          }
        }

        console.log("Saved", savedVariantIds.length, "variants with IDs:", savedVariantIds)

        // Update variants state with saved IDs
        if (savedVariantIds.length > 0) {
          setVariants(currentVariants => currentVariants.map((v, i) => ({
            ...v,
            id: savedVariantIds[i] || v.id,
          })))
        }
      }

      setHasUnsavedChanges(false)

      // Auto-generate ZIP bundle when product has 6+ digital files
      if (digitalFiles.length >= 6) {
        fetch("/api/v2/upload/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: finalProductId }),
        }).catch(() => { /* Non-critical: bundle can be regenerated on next save */ })
      }

      /* Saved: search engines that take IndexNow hear about it now. */
      if (finalProductId) announceChange({ product: finalProductId })

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
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, mediaItems, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction, variants, whatsIncluded, faqs, selectedCategory, payWhatYouWant, pwywMinPrice, pwywSuggestedPrice, digitalFiles.length])

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

  // Mobile touch drag handlers - long press (300ms) to initiate drag
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    touchPendingIndexRef.current = null
    setTouchLongPressReady(false)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    const touch = e.touches[0]
    const startPos = { x: touch.clientX, y: touch.clientY }
    touchPendingIndexRef.current = index
    setTouchStartPos(startPos)
    setTouchCurrentPos(startPos)

    // Start long-press timer (300ms)
    longPressTimerRef.current = setTimeout(() => {
      setTouchDragIndex(index)
      setTouchLongPressReady(true)
      setIsTouchDragging(true)
      touchPendingIndexRef.current = null
    }, 300)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const currentPos = { x: touch.clientX, y: touch.clientY }

    // If long press hasn't fired yet, check if user moved too much (scrolling)
    if (touchPendingIndexRef.current !== null && touchStartPos) {
      const deltaX = Math.abs(touch.clientX - touchStartPos.x)
      const deltaY = Math.abs(touch.clientY - touchStartPos.y)
      if (deltaX > 8 || deltaY > 8) {
        // User is scrolling, cancel the long press
        cancelLongPress()
        return
      }
    }

    // If actively dragging, update position and find drop target
    if (isTouchDragging && touchDragIndex !== null) {
      e.preventDefault()
      setTouchCurrentPos(currentPos)

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
  }, [isTouchDragging, touchDragIndex, touchStartPos, cancelLongPress])

  const handleTouchEnd = useCallback(() => {
    cancelLongPress()

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
    setTouchLongPressReady(false)
    setDragOverIndex(null)
  }, [touchDragIndex, dragOverIndex, mediaItems, cancelLongPress])

  // Handle file upload for digital assets using admin API with progress
  // Helper: get upload status label
  const getUploadStatusLabel = (status: UploadStatus): string => {
    switch (status) {
      case "computing_checksum": return "Verifying integrity..."
      case "preparing": return "Preparing upload..."
      case "uploading": return "Uploading..."
      case "completing": return "Finalizing..."
      case "complete": return "Complete"
      case "paused": return "Paused"
      case "error": return "Failed"
      case "aborted": return "Cancelled"
      default: return "Starting..."
    }
  }

  // Compute overall upload progress from all active uploads
  const computedFileUploadProgress = activeFileUploads.size > 0
    ? Math.round(
        Array.from(activeFileUploads.values()).reduce((sum, u) => sum + u.progress, 0) /
          activeFileUploads.size
      )
    : 0

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Clear previous errors
    setError(null)

    const fileArray = Array.from(files)

    // Validate: max file count
    if (digitalFiles.length + fileArray.length > MAX_DIGITAL_FILES) {
      setError(`Maximum ${MAX_DIGITAL_FILES} digital files per product. You currently have ${digitalFiles.length}.`)
      return
    }

    // Validate each file before starting uploads
    for (const file of fileArray) {
      // Check for empty files
      if (file.size === 0) {
        setError(`File "${file.name}" is empty (0 bytes)`)
        return
      }

      // Check file size (5GB max)
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds 5GB limit`)
        return
      }

      // Check for duplicate file names
      const isDuplicate = digitalFiles.some(f => f.file_name === file.name)
      if (isDuplicate) {
        setError(`A file named "${file.name}" already exists. Please rename it or remove the existing file first.`)
        return
      }

      // Check for invalid file name characters
      const invalidChars = /[<>:"|?*\x00-\x1f]/
      if (invalidChars.test(file.name)) {
        setError(`File "${file.name}" contains invalid characters`)
        return
      }

      // Check file name length (255 char limit for most filesystems)
      if (file.name.length > 255) {
        setError(`File name "${file.name}" is too long (max 255 characters)`)
        return
      }

      // Check blocked extensions
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      if (BLOCKED_EXTENSIONS.has(ext)) {
        setError(`File type ".${ext}" is not allowed for security reasons`)
        return
      }

      // Check double extensions (e.g. file.pdf.exe)
      const parts = file.name.split(".")
      if (parts.length > 2) {
        const lastExt = parts[parts.length - 1].toLowerCase()
        if (BLOCKED_EXTENSIONS.has(lastExt)) {
          setError(`File "${file.name}" has a blocked extension`)
          return
        }
      }
    }

    // Check total storage size (optional warning for very large uploads)
    const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0)
    const existingSize = digitalFiles.reduce((sum, f) => sum + f.file_size, 0)
    const combinedSize = totalSize + existingSize
    if (combinedSize > 20 * 1024 * 1024 * 1024) { // 20GB warning
      const confirmed = confirm(`Total file size will be ${formatFileSize(combinedSize)}. This may take a while to upload. Continue?`)
      if (!confirmed) return
    }

    let currentProductId = productId
    if (!currentProductId) {
      // First, we need to save the product to get an ID
      if (!title.trim()) {
        showToast("Please enter a product title to upload digital product files")
        scrollToSection("about")
        return
      }

      setError(null)

      try {
        const saveResult = await saveProduct(false)
        if (!saveResult) {
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

    for (const file of fileArray) {
      const uploadKey = `${file.name}-${file.size}-${Date.now()}`

      const uploader = new DirectUploader({
        file,
        productId: currentProductId || undefined,
        folder: "digital",
        onProgress: (percent, bytesUploaded, bytesTotal) => {
          setActiveFileUploads(prev => {
            const next = new Map(prev)
            const entry = next.get(uploadKey)
            if (entry) {
              next.set(uploadKey, { ...entry, progress: percent, bytesUploaded, bytesTotal })
            }
            return next
          })
          // Update overall progress
          setActiveFileUploads(prev => {
            const total = Array.from(prev.values()).reduce((s, u) => s + u.progress, 0)
            setFileUploadProgress(prev.size > 0 ? Math.round(total / prev.size) : 0)
            return prev
          })
        },
        onStatusChange: (status) => {
          setActiveFileUploads(prev => {
            const next = new Map(prev)
            const entry = next.get(uploadKey)
            if (entry) {
              next.set(uploadKey, { ...entry, status })
            }
            return next
          })
        },
        onComplete: (result) => {
          const newFile: UploadedFile = {
            id: result.assetId || undefined,
            file_name: result.fileName,
            file_path: result.path,
            file_size: result.fileSize,
            mime_type: result.mimeType,
          }

          setDigitalFiles(prev => [...prev, newFile])

          // Remove from active uploads after showing completion briefly
          setTimeout(() => {
            setActiveFileUploads(prev => {
              const next = new Map(prev)
              next.delete(uploadKey)
              // If no more active uploads, reset progress state
              if (next.size === 0) {
                setUploadingFiles(false)
                setFileUploadProgress(0)
              }
              return next
            })
          }, 1500)

          // Trigger background antivirus scan
          if (result.assetId) {
            fetch("/api/v2/upload/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assetId: result.assetId }),
            }).catch(() => { /* Non-critical: scan will be picked up by cron */ })
          }
        },
        onError: (err) => {
          setActiveFileUploads(prev => {
            const next = new Map(prev)
            const entry = next.get(uploadKey)
            if (entry) {
              next.set(uploadKey, { ...entry, status: "error", error: err.message })
            }
            return next
          })

          // Show the error for 5 seconds, then clean up so the user can retry
          setTimeout(() => {
            setActiveFileUploads(prev => {
              const next = new Map(prev)
              next.delete(uploadKey)
              if (next.size === 0) {
                setUploadingFiles(false)
                setFileUploadProgress(0)
              }
              return next
            })
          }, 5000)
        },
      })

      // Add to active uploads
      setActiveFileUploads(prev => {
        const next = new Map(prev)
        next.set(uploadKey, {
          file,
          uploader,
          progress: 0,
          status: "idle",
          bytesUploaded: 0,
          bytesTotal: file.size,
        })
        return next
      })

      // Start upload (don't await — allow parallel uploads)
      uploader.start().catch(() => {
        // Error already handled by onError callback
      })
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

  /* The same save as the bar's, checks and all, and then on to where they were going. */
  const handleSaveAndExit = async () => {
    setShowExitDialog(false)
    const destination = pendingNavigation ?? "/app/products"
    if (await handleSaveChanges()) {
      carriedNotice = null
      router.push(destination)
    }
  }

  /** Saves and publishes. True when it saved. */
  const handleSaveChanges = async (): Promise<boolean> => {
    if (isLoading) return false
    // Validation 1: Title is required
    if (!title.trim()) {
      showToast("Please add a product title")
      scrollToSection("about")
      return false
    }

    // Validation 2: At least 1 media (photo or video) is required
    if (mediaItems.length === 0) {
      showToast("Please add at least one photo or video")
      scrollToSection("media")
      return false
    }

    // Validation 3: At least 1 digital file is required
    if (digitalFiles.length === 0) {
      showToast("Please upload at least one digital product file")
      scrollToSection("content")
      return false
    }

    // Validation 4: Category is required
    if (!selectedCategory) {
      showToast("Please select a category")
      scrollToSection("category")
      return false
    }

    // Validation 5: If variants exist with multiple files, each variant should have a file assigned
    if (variants.length > 0 && digitalFiles.length > 1) {
      const variantWithoutFiles = variants.find(v => !v.assignedFiles || v.assignedFiles.length === 0)
      if (variantWithoutFiles) {
        const variantName = variantWithoutFiles.name?.trim() || `Variant ${variants.indexOf(variantWithoutFiles) + 1}`
        showToast(`Please assign a file to "${variantName}"`)
        scrollToSection("variants")
        return false
      }
    }

    setIsLoading(true)
    // Always publish when saving
    const result = await saveProduct(true)
    setIsLoading(false)

    if (result) {
      const { productId: savedProductId, slug: savedSlug } = result

      const created = !productId
      setIsPublished(true)
      setJustSaved(true)
      setHasUnsavedChanges(false)
      setSavedTitle(title)

      // Store current values as saved state for change detection
      savedValuesRef.current = snapshotOf({
        title, description, price, compareAtPrice, mediaItems, digitalFiles, variants,
        whatsIncluded, faqs, selectedCategory, limitSalesEnabled, salesLimit, callToAction,
        showSalesBadge, refundPolicyEnabled, refundPolicyType,
        payWhatYouWant, pwywMinPrice, pwywSuggestedPrice,
      })

      // Revalidate the live product page so changes appear immediately
      // Use the actual saved slug in case it was modified due to duplicates
      try {
        await fetch("/api/revalidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* The handle too: the product has two addresses and each holds its
             own cache, so revalidating `/p/<slug>` alone left
             `/<handle>/<slug>` — the one every link uses — stale. */
          body: JSON.stringify({
            slug: savedSlug,
            type: "product",
            handle: creator?.username || creator?.slug || undefined,
            /* The id too: the variants, files and reviews are cached under
               it, and the slug alone does not reach them. */
            productId: savedProductId,
          }),
        })
      } catch (revalidateErr) {
        console.log("Revalidation skipped:", revalidateErr)
      }

      // Ensure the store builder shop page is published so the product
      // appears on the creator's live store, even if they've never opened
      // the store builder editor. Fire-and-forget — non-critical.
      fetch("/api/store-builder/ensure-published", { method: "POST" }).catch(() => {})

      /*
        THE LIST AND THIS PAGE, FRESH. /app pages are kept in the router for
        five minutes (next.config staleTimes), so without this the Products
        list, and this product opened again from it, came back as they were
        before the save. A refresh drops every kept page; the one on screen is
        re-read on the server and its new props are ignored, because the form
        only reads its props once.

        A NEW PRODUCT MOVES TO ITS OWN ADDRESS, where a reload finds it. The
        address changes first and the refresh then reads that page, which
        replaces this one with the same product read back from the database.
        A refresh keeps this page on screen until that is ready, where a
        navigation would have put up the loading outline in between; the
        "Product is live" it earned is carried across.
      */
      const message = typeof window !== "undefined" && window.innerWidth < 640 ? "Product is live" : "Product is live and saved"
      if (created) {
        carriedNotice = message
        /* Only for the page this refresh draws, never a later one. */
        setTimeout(() => { if (carriedNotice === message) carriedNotice = null }, 8000)
        window.history.replaceState({}, "", `/app/products/${savedProductId}`)
        router.refresh()
        return true
      }
      router.refresh()

      // Smooth scroll to top
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      setNotificationMessage(message)
      setShowNotification(true)
      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
      return true
    }
    return false
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

      announceChange({ product: productId })
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
    if (slug && creator) {
      const sellerSubdomain = creator.username || creator.slug || 'store'
      /* One address for both branches. The native one used to build
         `<handle>.storelib.com/p/<slug>`, which is the old subdomain spelling
         of a page that now lives at storelib.com/<handle>/<slug>. */
      const productUrl = getProductShareUrl(sellerSubdomain, slug)
      if (isNativeApp()) {
        // In Capacitor, open in external browser (not inside the app)
        openExternal(productUrl)
      } else {
        window.open(productUrl, "_blank")
      }
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
          <TooltipContent side="right" align="start" sideOffset={8} className="max-w-xs p-3 z-50">
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* Mobile: Popover with safe edge positioning */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="sm:hidden flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-medium cursor-help active:bg-violet-200 transition-colors"
          >
            i
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={4} collisionPadding={16} className="max-w-[min(280px,calc(100vw-2rem))] p-3 text-sm z-50 animate-popover-in">
          {content}
        </PopoverContent>
      </Popover>
    </>
  )

  const existingImages = mediaItems.filter(m => m.type === "image").length
  const existingYouTube = mediaItems.filter(m => m.type === "youtube").length
  const plainSearchPreviewDescription = stripHtmlToPlainText(seoDescription || description)

  /* Save is there to press when there is something to save and a name to save it under. */
  const canSave = !isLoading && !!title.trim() && !justSaved

  /* Cmd or Ctrl and S, from anywhere on the page, instead of the browser's own Save. */
  const saveShortcut = useRef<() => void>(() => {})
  useEffect(() => {
    saveShortcut.current = () => {
      if (canSave) void handleSaveChanges()
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      saveShortcut.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div ref={contentRef} data-product-editor="" className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa]">
      {/* Success Notification - Modern black toast */}
      {showNotification && (
        <div
          className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-3 fade-in duration-300"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 rounded-xl shadow-2xl shadow-gray-900/20 backdrop-blur-sm border border-gray-800 whitespace-nowrap max-w-[calc(100vw-2rem)]">
            <CheckCircle className="h-4 w-4 text-white flex-shrink-0" />
            <span className="text-sm font-medium text-white tracking-tight overflow-hidden text-ellipsis">{notificationMessage}</span>
          </div>
        </div>
      )}

      {/* Validation Toast Notification - Black modern style */}
      {toast.visible && (
        <div
          className={`fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 z-[100] ${
            toast.dismissing ? "animate-toast-out" : "animate-toast-in"
          }`}
        >
          <div className="flex items-center gap-2.5 px-4 py-3 bg-black rounded-xl shadow-2xl shadow-black/20 backdrop-blur-sm border border-gray-800 max-w-[calc(100vw-2rem)] whitespace-nowrap">
            <AlertCircle className="h-4 w-4 text-white/80 flex-shrink-0" />
            <span className="text-sm font-medium text-white tracking-tight sm:block hidden">{toast.message}</span>
            <span className="text-sm font-medium text-white tracking-tight sm:hidden block">
              {toast.message === "Please enter a product title to upload digital product files"
                ? "Add a title first"
                : toast.message === "Please add at least one photo or video"
                ? "Add a photo or video"
                : toast.message === "Please upload at least one digital product file"
                ? "Upload a file"
                : toast.message.startsWith("Please assign a file")
                ? "Assign files to variants"
                : toast.message}
            </span>
            <button
              onClick={dismissToast}
              className="ml-1 p-0.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5 text-white/70" />
            </button>
          </div>
        </div>
      )}

      {/*
        THE BAR: WHERE YOU ARE, WHAT STATE IT IS IN, AND SAVE.
        It used to be two bars, a title row that folded away on scroll over a
        row of section pills, and a Cancel and Save strip across the foot of
        the screen, which on a phone sat under the navigation pill. Now it is
        one bar at the top that never changes size: Cancel, the product's name
        with its state under it (Unsaved changes, Live, Draft), and Save. On a
        computer the sections are a row of tabs under it. It sits on the pane
        that scrolls, like the Orders bar, with a hairline once something is
        under it, and Cmd or Ctrl and S saves from anywhere on the page.
      */}
      <div
        ref={barRef}
        data-editor-bar=""
        className={cn(
          "sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150",
          isScrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "",
        )}
      >
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-11 shrink-0 items-center rounded-[10px] px-2.5 text-[16px] text-[#1a1a2e] active:bg-[#eceef1] sm:hidden"
          >
            Cancel
          </button>
          <Link
            href="/app/products"
            onClick={handleBackClick}
            aria-label="Back to products"
            className={cn(iconButton, "-ml-2 hidden h-9 w-9 sm:inline-flex")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 px-1 sm:px-0">
            <h1 className="truncate text-[16px] font-semibold leading-5 text-[#1a1a2e] sm:text-[20px] sm:leading-6">
              {productId ? savedTitle.trim() || "Untitled product" : "New product"}
            </h1>
            <p aria-live="polite" className="mt-0.5 flex h-4 items-center gap-1.5 text-[12px] leading-4 text-[#6b7280] sm:h-5 sm:text-[13px] sm:leading-5">
              {isLoading ? (
                "Saving"
              ) : hasUnsavedChanges && !justSaved ? (
                <>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#d97706]" />
                  Unsaved changes
                </>
              ) : productId ? (
                <>
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", isPublished ? "bg-[#16a34a]" : "bg-[#9ca3af]")} />
                  {isPublished ? "Live" : "Draft"}
                </>
              ) : (
                "Not saved yet"
              )}
            </p>
          </div>
          {productId ? (
            <ResponsiveActionMenu
              title={savedTitle.trim() || "Product"}
              align="end"
              trigger={
                <button type="button" aria-label="More actions" className={cn(iconButton, "h-10 w-10 shrink-0 rounded-[10px] sm:h-8 sm:w-8 sm:rounded-lg")}>
                  <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              }
              items={[
                ...(isPublished && slug ? [{ label: "View on your page", onClick: handleRedirectToProduct }] : []),
                { label: isPublished ? "Unpublish" : "Publish", onClick: handleTogglePublish },
              ]}
            />
          ) : null}
          <button type="button" onClick={handleCancel} className={cn(buttonSecondary, "hidden sm:inline-flex")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSaveChanges()}
            disabled={!canSave}
            aria-keyshortcuts="Meta+S Control+S"
            className={cn(buttonAccent, "h-10 min-w-[68px] shrink-0 rounded-[10px] px-4 text-[15px] sm:h-8 sm:min-w-[60px] sm:rounded-lg sm:px-3 sm:text-[13px]")}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : "Save"}
          </button>
        </div>
        <div className="mx-auto hidden h-11 max-w-[760px] items-start px-6 sm:flex">
          <div
            ref={pillScrollRef}
            role="tablist"
            aria-label="Sections"
            className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1"
            style={{ scrollbarWidth: "none" }}
          >
            {PILL_SECTIONS.map((section) => {
              const isActive = getPillForSection(activeSection) === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  ref={(el) => { pillRefs.current[section.id as SectionId] = el }}
                  onClick={() => scrollToSection(section.id as SectionId)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100",
                    isActive ? "bg-[#e6e8eb] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2]",
                  )}
                >
                  {section.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-6 pt-3 sm:px-6 sm:pb-16 sm:pt-4">
              {/* Error message */}
              {error && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] text-red-700">
                  {error}
                </div>
              )}

              {/* About Section */}
              <div
                ref={(el) => { sectionRefs.current.about = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">About</h2>
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
                    placeholder="Product title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11 border-gray-200 bg-white text-sm sm:text-base"
                  />
                </div>
              </div>

              {/* Media Section */}
              <div
                ref={(el) => { sectionRefs.current.media = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Photos and video</h2>
                    <span className="text-red-500">*</span>
                    <TooltipIcon
                      content={
                        <p>Add photos and videos to showcase your product. The first item becomes the thumbnail.</p>
                      }
                    />
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    Add up to {MAX_PHOTOS} photos and {MAX_YOUTUBE_VIDEOS} video{MAX_YOUTUBE_VIDEOS > 1 ? 's' : ''}.
                  </p>
                </div>

                {/* Draggable Media Grid - @dnd-kit powered, 2 per row */}
                {mediaItems.length > 0 && (
                  <DndContext
                    sensors={mediaSensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleMediaDragStart}
                    onDragEnd={handleMediaDragEnd}
                  >
                    <SortableContext
                      items={mediaItems.map(item => item.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {mediaItems.map((item, index) => (
                          <SortableMediaItem
                            key={item.id}
                            item={item}
                            index={index}
                            onRemove={removeMedia}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    {/* DragOverlay renders via portal at document.body — floats freely above all containers */}
                    <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
                      {activeDragItem ? (
                        <div className="aspect-video rounded-lg overflow-hidden shadow-2xl ring-2 ring-violet-500 rotate-1 scale-105 cursor-grabbing">
                          {activeDragItem.type === "image" && (
                            <img src={activeDragItem.url} alt="" className="w-full h-full object-cover" draggable={false} />
                          )}
                          {activeDragItem.type === "youtube" && (
                            <div className="relative w-full h-full">
                              <img
                                src={`https://img.youtube.com/vi/${parseYouTubeUrl(activeDragItem.url)}/hqdefault.jpg`}
                                alt=""
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-600 flex items-center justify-center">
                                  <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5 text-white ml-0.5" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                  </svg>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}

                {/* Upload Zone with skeleton loading */}
                <div
                  className={`
                    border-2 border-dashed rounded-xl
                    flex flex-col items-center justify-center py-6 sm:py-8
                    transition-all duration-400 cursor-pointer
                    touch-action-pan-y
                    ${uploadingMedia ? "pointer-events-none border-gray-300" : ""}
                    ${isExternalDragOver
                      ? "border-violet-500 bg-violet-50 scale-[1.02] shadow-lg shadow-violet-100"
                      : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
                    }
                  `}
                  onClick={handleUploadZoneClick}
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
                    <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-400">
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

                      {/* YouTube add — inline toggle */}
                      {!showYoutubeInput ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setShowYoutubeInput(true)
                            // Focus input first (opens keyboard), then scroll after keyboard settles
                            setTimeout(() => {
                              const input = document.getElementById("youtube-url-field") as HTMLInputElement
                              if (input) {
                                input.focus()
                                // Wait for keyboard to open, then scroll into view
                                const scrollAfterKeyboard = () => {
                                  const el = document.getElementById("youtube-inline-input")
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
                                  }
                                }
                                // Use visualViewport resize (keyboard open) or fallback timeout
                                const vv = window.visualViewport
                                if (vv) {
                                  const onResize = () => {
                                    vv.removeEventListener("resize", onResize)
                                    setTimeout(scrollAfterKeyboard, 100)
                                  }
                                  vv.addEventListener("resize", onResize)
                                  // Fallback if keyboard doesn't trigger resize (desktop)
                                  setTimeout(() => {
                                    vv.removeEventListener("resize", onResize)
                                    scrollAfterKeyboard()
                                  }, 600)
                                } else {
                                  setTimeout(scrollAfterKeyboard, 500)
                                }
                              }
                            }, 100)
                          }}
                          className="mt-3 text-xs sm:text-sm text-gray-500 hover:text-red-600 flex items-center gap-1.5 transition-colors pointer-events-auto"
                        >
                          <svg viewBox="0 -7 48 48" className="h-4 w-4 sm:h-5 sm:w-5" fill="none">
                            <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                          </svg>
                          Add YouTube video
                        </button>
                      ) : (
                        <div id="youtube-inline-input" className="mt-3 space-y-3 pointer-events-auto" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 flex-shrink-0">
                              <svg viewBox="0 -7 48 48" className="h-4 w-4" fill="none">
                                <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                              </svg>
                            </div>
                            <Input
                              id="youtube-url-field"
                              placeholder="Paste YouTube URL..."
                              value={youtubeInput}
                              onChange={(e) => setYoutubeInput(e.target.value)}
                              className="flex-1 h-9 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 placeholder:text-gray-400"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleAddYouTube() }
                                if (e.key === 'Escape') { setShowYoutubeInput(false); setYoutubeInput("") }
                              }}
                            />
                            <button type="button" onClick={() => { setShowYoutubeInput(false); setYoutubeInput("") }} className="p-1 text-gray-400 hover:text-gray-600 rounded-full shrink-0">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {youtubeInput && parseYouTubeUrl(youtubeInput) && (
                            <div className="relative aspect-video max-w-[200px] mx-auto rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                              <img src={`https://img.youtube.com/vi/${parseYouTubeUrl(youtubeInput)}/hqdefault.jpg`} alt="Video preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><Play className="h-5 w-5 text-white ml-0.5" /></div>
                              </div>
                            </div>
                          )}
                          <Button
                            type="button"
                            onClick={handleAddYouTube}
                            disabled={!youtubeInput || !parseYouTubeUrl(youtubeInput)}
                            className="w-full h-9 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            Add Video
                          </Button>
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
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Content</h2>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    Describe your product to attract customers.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Description
                    </Label>
                  </div>
                  <DescriptionRichEditor
                    value={description}
                    onChange={setDescription}
                    isMobile={isMobileViewport}
                    className="min-h-[150px] sm:min-h-[180px] border border-gray-200 rounded-lg"
                    disableAutoFocus={true}
                  />
                </div>
              </div>

              {/* What's Included Section */}
              <div
                ref={(el) => { sectionRefs.current.whatsIncluded = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">What's Included</h2>
                    <TooltipIcon
                      content={<p>List what customers will receive with their purchase</p>}
                    />
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    Show customers what they'll get (max {MAX_WHATS_INCLUDED} items).
                  </p>
                </div>

                <div className="space-y-2">
                  {whatsIncluded.map((item, index) => {
                    const isDefaultItem = index < DEFAULT_WHATS_INCLUDED.length && DEFAULT_WHATS_INCLUDED[index] === item
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl border transition-colors ${
                          isDefaultItem
                            ? 'bg-violet-50/50 border-violet-100'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
                          isDefaultItem ? 'bg-violet-100' : 'bg-green-100'
                        }`}>
                          <Check className={`h-3 w-3 ${isDefaultItem ? 'text-violet-500' : 'text-green-600'}`} />
                        </div>
                        {isDefaultItem ? (
                          <span className="flex-1 text-sm text-gray-700">{item}</span>
                        ) : (
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
                        )}
                        {!isDefaultItem && (
                          <button
                            type="button"
                            onClick={() => setWhatsIncluded(prev => prev.filter((_, i) => i !== index))}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Remove item"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isDefaultItem && (
                          <span className="text-[10px] text-violet-400 font-medium px-1.5 py-0.5 bg-violet-100 rounded">Default</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {whatsIncluded.length < MAX_WHATS_INCLUDED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWhatsIncluded(prev => [...prev, ""])}
                    className="text-gray-600 border-gray-300 h-9 rounded-xl"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Item
                  </Button>
                )}
              </div>

              {/* Digital Files Section */}
              <div
                ref={(el) => { sectionRefs.current.files = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Digital Files</h2>
                    <span className="text-red-500 text-sm">*</span>
                    <TooltipIcon
                      content={<p>If multiple files, upload ZIP.</p>}
                    />
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    Files customers receive after purchase.
                  </p>

                  {digitalFiles.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {digitalFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
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
                              <p className="text-sm font-medium text-gray-900 truncate">{file.file_name}</p>
                            )}
                            <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
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
                      mt-3 border-2 border-dashed rounded-xl
                      flex flex-col items-center justify-center py-6
                      transition-all duration-300 cursor-pointer
                      ${uploadingFiles ? "pointer-events-none border-gray-200 bg-gray-50" : ""}
                      ${isFileDragOver
                        ? "border-violet-400 bg-violet-50/70 scale-[1.01]"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }
                    `}
                    onClick={() => { if (!uploadingFiles && !isScrollingRef.current) document.getElementById("file-input")?.click() }}
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
                      accept="*/*"
                      className="hidden"
                      onChange={(e) => {
                        handleFileUpload(e.target.files)
                        // Reset value so the same file can be re-selected
                        e.target.value = ""
                      }}
                      disabled={uploadingFiles}
                    />

                    {uploadingFiles && activeFileUploads.size > 0 ? (
                      <div className="w-full max-w-md mx-auto space-y-2 px-4">
                        {Array.from(activeFileUploads).map(([key, upload]) => (
                          <div key={key} className="flex items-center gap-2 py-1">
                            <div className="flex-shrink-0 w-4 flex items-center justify-center">
                              {upload.status === "complete" ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : upload.status === "error" ? (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <p className="text-xs font-medium text-gray-700 truncate">{upload.file.name}</p>
                                <span className="text-xs tabular-nums text-gray-500 flex-shrink-0 ml-2">{upload.progress}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-200 ease-out ${
                                    upload.status === "error" ? "bg-red-500" :
                                    upload.status === "complete" ? "bg-green-500" : "bg-violet-500"
                                  }`}
                                  style={{ width: `${upload.progress}%` }}
                                />
                              </div>
                              {upload.error && (
                                <p className="text-xs text-red-500 mt-0.5">{upload.error}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : uploadingFiles ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                        <p className="text-xs text-gray-500">Preparing upload...</p>
                      </div>
                    ) : isFileDragOver ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                          <Plus className="h-5 w-5 text-violet-600" />
                        </div>
                        <p className="text-sm font-medium text-violet-600">
                          Drop files here
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-400 text-sm mb-3">
                          Drag and drop or click to upload
                        </p>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-gray-200 text-gray-700 h-9 text-sm hover:bg-gray-50 pointer-events-auto"
                          disabled={uploadingFiles}
                          onClick={(e) => {
                            e.stopPropagation()
                            document.getElementById("file-input")?.click()
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1.5" />
                          Choose Files
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <div
                ref={(el) => { sectionRefs.current.variants = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Variants</h2>
                      <TooltipIcon
                        content={<p>Add different versions of your product with different prices</p>}
                      />
                    </div>
                    <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                      Offer different versions or tiers of your product.
                    </p>
                  </div>
                  {variants.length < MAX_VARIANTS && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const variantId = `new-variant-${Date.now()}`
                        const newVariant: ProductVariant = {
                          id: variantId,
                          name: "",
                          description: "",
                          price: "",
                          compareAtPrice: "",
                          maxPurchases: "",
                          isExpanded: true,
                          assignedFiles: [],
                          payWhatYouWant: false,
                          pwywMinPrice: "",
                          pwywSuggestedPrice: "",
                        }
                        setVariants(prev => [...prev, newVariant])
                        // Smooth scroll to newly added variant after render
                        requestAnimationFrame(() => {
                          setTimeout(() => {
                            const el = document.querySelector(`[data-variant-id="${variantId}"]`)
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                          }, 50)
                        })
                      }}
                      className="text-gray-600 border-gray-200 h-8 text-xs rounded-lg hover:bg-gray-50"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Variant
                    </Button>
                  )}
                </div>

                {/* Variants List */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <div
                        key={variant.id}
                        data-variant-id={variant.id}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors"
                      >
                        {/* Variant Header */}
                        <div
                          className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-white cursor-pointer hover:from-gray-100 hover:to-gray-50 transition-colors"
                          onClick={() => {
                            setVariants(prev => prev.map(v =>
                              v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                            ))
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-600">
                              <Layers className="h-4 w-4" />
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-900">{variant.name || "Untitled"}</span>
                              {variant.price && (
                                <span className="ml-2 text-xs text-gray-500">${parseFloat(variant.price || "0").toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.filter(v => v.id !== variant.id))
                              }}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="h-4 w-4 text-gray-300 hover:text-red-500" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.map(v =>
                                  v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                                ))
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              {variant.isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Variant Content - Collapsible */}
                        {variant.isExpanded && (
                          <div className="p-4 sm:p-5 space-y-5 border-t border-gray-100 bg-white">
                            {/* Name */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</Label>
                              <Input
                                placeholder="e.g. Basic, Pro, Enterprise"
                                value={variant.name}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, name: e.target.value } : v
                                  ))
                                }}
                                className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                              />
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</Label>
                              <Textarea
                                placeholder="What's included in this variant..."
                                value={variant.description}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, description: e.target.value } : v
                                  ))
                                }}
                                className="border-gray-200 min-h-[80px] text-sm resize-none rounded-lg bg-gray-50 focus:bg-white transition-colors"
                              />
                            </div>

                            {/* Pricing Row - Price, Compare-at/Suggested, Max Purchases */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {variant.payWhatYouWant ? "Min amount" : "Price"}
                                </Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={variant.payWhatYouWant ? (variant.pwywMinPrice || "") : variant.price}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '')
                                      setVariants(prev => prev.map(v =>
                                        v.id === variant.id
                                          ? variant.payWhatYouWant
                                            ? { ...v, pwywMinPrice: value }
                                            : { ...v, price: value }
                                          : v
                                      ))
                                    }}
                                    className="h-11 pl-8 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors font-medium"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {variant.payWhatYouWant ? "Suggested" : "Compare-at"}
                                </Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Optional"
                                    value={variant.payWhatYouWant ? (variant.pwywSuggestedPrice || "") : (variant.compareAtPrice || "")}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '')
                                      setVariants(prev => prev.map(v =>
                                        v.id === variant.id
                                          ? variant.payWhatYouWant
                                            ? { ...v, pwywSuggestedPrice: value }
                                            : { ...v, compareAtPrice: value }
                                          : v
                                      ))
                                    }}
                                    className="h-11 pl-8 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Max purchases</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="Unlimited"
                                  value={variant.maxPurchases}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^0-9]/g, '')
                                    setVariants(prev => prev.map(v =>
                                      v.id === variant.id ? { ...v, maxPurchases: value } : v
                                    ))
                                  }}
                                  className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                />
                              </div>
                            </div>

                            {/* Pay What You Want Toggle for this variant */}
                            <div className="pt-1">
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2.5 cursor-pointer group">
                                  <div className="relative">
                                    <input
                                      type="checkbox"
                                      checked={variant.payWhatYouWant || false}
                                      onChange={(e) => {
                                        const checked = e.target.checked
                                        const targetId = variant.id
                                        setVariants(prev => prev.map(v =>
                                          v.id === targetId ? { ...v, payWhatYouWant: checked } : v
                                        ))
                                      }}
                                      className="sr-only peer"
                                    />
                                    <div className={`w-9 h-5 rounded-full transition-colors ${
                                      variant.payWhatYouWant
                                        ? 'bg-violet-500'
                                        : 'bg-gray-200 group-hover:bg-gray-300'
                                    }`}>
                                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                                        variant.payWhatYouWant ? 'translate-x-4' : 'translate-x-0'
                                      }`} />
                                    </div>
                                  </div>
                                  <span className="text-xs font-medium text-gray-600">
                                    Let customers pay what they want
                                  </span>
                                </label>
                                <TooltipIcon
                                  content={
                                    <p className="text-sm">
                                      Enable flexible pricing for this variant. Buyers can pay any amount above your minimum.
                                    </p>
                                  }
                                />
                              </div>
                            </div>

                            {/* Assigned Digital Files */}
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                              <div>
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  Assigned Files
                                </Label>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  Select which files buyers of this variant will receive
                                </p>
                              </div>

                              {/* File selection - uses stable callback handler */}
                              {digitalFiles.length > 0 ? (
                                <div className="space-y-2">
                                  {digitalFiles.map((file) => {
                                    // Skip invalid files
                                    if (!file || !file.id || !variant || !variant.id) return null

                                    const fileId = String(file.id)
                                    const variantId = String(variant.id)
                                    const assignedFiles = Array.isArray(variant.assignedFiles) ? variant.assignedFiles : []
                                    const isAssigned = assignedFiles.includes(fileId)

                                    return (
                                      <VariantFileCheckbox
                                        key={`${variantId}-${fileId}`}
                                        fileId={fileId}
                                        variantId={variantId}
                                        fileName={file.file_name || 'Unnamed file'}
                                        fileSize={file.file_size || 0}
                                        isAssigned={isAssigned}
                                        onToggle={handleToggleVariantFile}
                                      />
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                                  <FileText className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                                  <p className="text-xs text-gray-400">
                                    No files uploaded yet
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {variants.length >= MAX_VARIANTS && (
                  <p className="text-xs text-gray-400 text-center">Maximum {MAX_VARIANTS} variants allowed</p>
                )}

                {variants.length === 0 && (
                  <div className="p-6 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                    <Layers className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-3">No variants yet</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newVariant: ProductVariant = {
                          id: `new-variant-${Date.now()}`,
                          name: "",
                          description: "",
                          price: "",
                          compareAtPrice: "",
                          maxPurchases: "",
                          isExpanded: true,
                          assignedFiles: [],
                          payWhatYouWant: false,
                          pwywMinPrice: "",
                          pwywSuggestedPrice: "",
                        }
                        setVariants(prev => [...prev, newVariant])
                      }}
                      className="text-gray-600 border-gray-300 h-9 rounded-lg"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Create your first variant
                    </Button>
                  </div>
                )}
              </div>

              {/* Pricing Section */}
              <div
                ref={(el) => { sectionRefs.current.pricing = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Pricing</h2>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    Set your product's price.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="price" className="text-xs sm:text-sm font-medium text-gray-700">
                      {payWhatYouWant ? "Minimum amount" : "Price (USD)"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-sm">$</span>
                      <Input
                        id="price"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={payWhatYouWant ? pwywMinPrice : price}
                        onChange={(e) => payWhatYouWant ? setPwywMinPrice(e.target.value) : setPrice(e.target.value)}
                        className="h-11 pl-6 sm:pl-7 border-gray-200 text-sm sm:text-base"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="comparePrice" className="text-xs sm:text-sm font-medium text-gray-700">
                      {payWhatYouWant ? "Suggested amount" : "Compare at price"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-sm">$</span>
                      <Input
                        id="comparePrice"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={payWhatYouWant ? pwywSuggestedPrice : compareAtPrice}
                        onChange={(e) => payWhatYouWant ? setPwywSuggestedPrice(e.target.value) : setCompareAtPrice(e.target.value)}
                        className="h-11 pl-6 sm:pl-7 border-gray-200 text-sm sm:text-base"
                      />
                    </div>
                  </div>
                </div>

                {/* Pay what you want */}
                <div className={SWITCH_GROUP}>
                  <SwitchRow
                    title="Pay what you want"
                    hint={payWhatYouWant ? "Buyers see \"Name a fair price\", starting at your suggested amount" : "Buyers choose the price, from your minimum"}
                    checked={payWhatYouWant}
                    onChange={setPayWhatYouWant}
                  />
                </div>
              </div>

              {/* Category Section */}
              <div
                ref={(el) => { sectionRefs.current.category = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Category</h2>
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
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

                {/* Category Modal - Desktop Dialog only (mobile uses MobileSheet below) */}
                <Dialog open={showCategoryModal && !isMobileViewport} onOpenChange={(open) => {
                  if (!open) closeCategoryModal()
                  else setShowCategoryModal(true)
                }}>
                  <DialogContent
                    disableDefaultAnimations={isMobileViewport}
                    showCloseButton={!isMobileViewport}
                    onOpenAutoFocus={(e) => {
                      if (isMobileViewport) e.preventDefault()
                    }}
                    overlayClassName={isMobileViewport ? `bg-black/40 transition-opacity duration-400 ${dismissingSheet === "category" ? "opacity-0" : "opacity-100"}` : undefined}
                    className={`fixed !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0 sm:!left-[50%] sm:!top-[50%] sm:!bottom-auto sm:!translate-x-[-50%] sm:!translate-y-[-50%] w-full !max-w-none sm:!max-w-2xl lg:!max-w-3xl sm:w-[calc(100%-2rem)] rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border-t sm:border p-0 h-[85vh] sm:h-auto max-h-[85vh] sm:max-h-[85vh] overflow-hidden flex flex-col ${dismissingSheet === "category" && !swipeCloseRef.current ? "animate-bottom-sheet-out" : (!dismissingSheet ? "animate-bottom-sheet-in" : "")} sm:animate-none`}
                    /* The search field in here is typed into; the sheet has to sit on the keyboard. */
                    style={isMobileViewport ? { willChange: 'transform', backfaceVisibility: 'hidden', ...sheetAboveKeyboard(0.85) } : undefined}
                    onTouchStart={(e) => handleSheetTouchStart(e, e.currentTarget as HTMLDivElement)}
                    onTouchMove={handleSheetTouchMove}
                    onTouchEnd={() => handleSheetTouchEnd("category", () => setShowCategoryModal(false))}
                    onTouchCancel={() => handleSheetTouchEnd("category", () => setShowCategoryModal(false))}
                  >
                    <div className="pt-3 pb-1 flex justify-center sm:hidden cursor-grab active:cursor-grabbing touch-none" data-drag-handle><div className="h-[5px] w-10 rounded-full bg-gray-300" /></div>
                    <DialogHeader className="px-4 sm:p-6 pb-3 sm:pb-4 border-b flex-shrink-0">
                      <DialogTitle className="text-lg sm:text-xl font-semibold">Select Category</DialogTitle>
                      <DialogDescription className="text-sm text-gray-500">
                        Choose a category that best describes your product.
                      </DialogDescription>
                    </DialogHeader>

                    {/* Sticky Search Bar */}
                    <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b bg-white">
                      <Input
                        placeholder="Search 300+ categories..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        className="h-11 text-sm sm:text-base rounded-lg"
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-3 sm:pt-4" data-scroll-container>
                      {/* AI Suggestion - Modern Badge Style */}
                      {suggestedCategory && !categorySearch && (
                        <div className="mb-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory(suggestedCategory)
                              closeCategoryModal()
                              setCategorySearch("")
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-400 ${
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

                      {/* Search Results - Flat List */}
                      {categorySearch ? (
                        <div className="space-y-0.5">
                          {ALL_CATEGORIES.filter(cat =>
                            cat.toLowerCase().includes(categorySearch.toLowerCase())
                          ).map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => {
                                setSelectedCategory(category)
                                closeCategoryModal()
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
                              <span className="text-xs text-gray-400">{findCategoryGroup(category)}</span>
                              {selectedCategory === category && (
                                <Check className="h-4 w-4 text-violet-500 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                          {ALL_CATEGORIES.filter(cat =>
                            cat.toLowerCase().includes(categorySearch.toLowerCase())
                          ).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-6">No categories found</p>
                          )}
                        </div>
                      ) : (
                        /* Grouped Categories */
                        <div className="space-y-1">
                          {Object.entries(CATEGORY_GROUPS).map(([groupName, group]) => (
                            <div key={groupName} className="rounded-lg border border-gray-100 overflow-hidden">
                              {/* Group Header */}
                              <button
                                type="button"
                                onClick={() => toggleGroupExpansion(groupName)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
                                  expandedGroups.has(groupName)
                                    ? "bg-gray-50 text-gray-900"
                                    : "bg-white hover:bg-gray-50 text-gray-700"
                                }`}
                              >
                                <span className="text-lg">{group.icon}</span>
                                <span className="flex-1">{groupName}</span>
                                <span className="text-xs text-gray-400 mr-1">{group.categories.length}</span>
                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-400 ${
                                  expandedGroups.has(groupName) ? "rotate-180" : ""
                                }`} />
                              </button>

                              {/* Expanded Categories */}
                              {expandedGroups.has(groupName) && (
                                <div className="border-t border-gray-100 bg-gray-50/50 p-2 space-y-0.5">
                                  {group.categories.map((category) => (
                                    <button
                                      key={category}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCategory(category)
                                        closeCategoryModal()
                                        setCategorySearch("")
                                      }}
                                      className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                                        selectedCategory === category
                                          ? "bg-violet-100 text-violet-900 font-medium"
                                          : "hover:bg-white text-gray-600"
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
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 border-t p-4 sm:p-6 pt-3 sm:pt-4 bg-gray-50 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedCategory(null)
                          closeCategoryModal()
                          setCategorySearch("")
                        }}
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          closeCategoryModal()
                          setCategorySearch("")
                        }}
                        className="w-full sm:w-auto bg-violet-500 hover:bg-violet-600"
                      >
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Mobile Category Bottom Sheet */}
                {isMobileViewport && (
                  <MobileSheet
                    isOpen={showCategoryModal}
                    onClose={() => { setShowCategoryModal(false); setCategorySearch("") }}
                    maxHeight="64vh"
                  >
                    {/* Title row */}
                    <div className="px-5 pb-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className="text-base font-semibold text-gray-900">Select Category</h3>
                        {selectedCategory && (
                          <button
                            type="button"
                            onClick={() => { setSelectedCategory(null); setShowCategoryModal(false); setCategorySearch("") }}
                            className="text-xs text-rose-400 hover:text-rose-600 font-medium px-2 py-1 rounded-md active:bg-rose-50 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Choose the best category for your product.</p>
                    </div>

                    {/* Search */}
                    <div className="px-5 py-2.5 sticky top-7 z-10 bg-white border-b border-gray-100">
                      <Input
                        placeholder="Search 300+ categories..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        className="h-10 text-sm rounded-lg"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                    </div>

                    {/* Category list */}
                    <div className="px-5 py-3 pb-8">
                      {/* AI Suggestion */}
                      {suggestedCategory && !categorySearch && (
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
                                : "bg-gradient-to-r from-violet-50 to-purple-50 active:from-violet-100 active:to-purple-100 border border-violet-200"
                            }`}
                          >
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              selectedCategory === suggestedCategory ? "bg-white/20 text-white" : "bg-violet-500 text-white"
                            }`}>
                              ✨ AI Suggested
                            </span>
                            <span className={`font-medium ${selectedCategory === suggestedCategory ? "text-white" : "text-violet-900"}`}>
                              {suggestedCategory}
                            </span>
                            {selectedCategory === suggestedCategory && <Check className="ml-auto h-4 w-4" />}
                          </button>
                        </div>
                      )}

                      {/* Search results — flat list */}
                      {categorySearch ? (
                        <div className="space-y-0.5">
                          {ALL_CATEGORIES.filter(cat =>
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
                                  : "active:bg-gray-50 text-gray-700"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                selectedCategory === category ? "bg-violet-500" : "bg-gray-300"
                              }`} />
                              <span className="flex-1">{category}</span>
                              <span className="text-xs text-gray-400">{findCategoryGroup(category)}</span>
                              {selectedCategory === category && <Check className="h-4 w-4 text-violet-500 flex-shrink-0" />}
                            </button>
                          ))}
                          {ALL_CATEGORIES.filter(cat =>
                            cat.toLowerCase().includes(categorySearch.toLowerCase())
                          ).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-6">No categories found</p>
                          )}
                        </div>
                      ) : (
                        /* Grouped categories */
                        <div className="space-y-1">
                          {Object.entries(CATEGORY_GROUPS).map(([groupName, group]) => (
                            <div key={groupName} className="rounded-lg border border-gray-100 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => toggleGroupExpansion(groupName)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
                                  expandedGroups.has(groupName)
                                    ? "bg-gray-50 text-gray-900"
                                    : "bg-white active:bg-gray-50 text-gray-700"
                                }`}
                              >
                                <span className="text-lg">{group.icon}</span>
                                <span className="flex-1">{groupName}</span>
                                <span className="text-xs text-gray-400 mr-1">{group.categories.length}</span>
                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                                  expandedGroups.has(groupName) ? "rotate-180" : ""
                                }`} />
                              </button>
                              {expandedGroups.has(groupName) && (
                                <div className="border-t border-gray-100 bg-gray-50/50 p-2 space-y-0.5">
                                  {group.categories.map((category) => (
                                    <button
                                      key={category}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCategory(category)
                                        setShowCategoryModal(false)
                                        setCategorySearch("")
                                      }}
                                      className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                                        selectedCategory === category
                                          ? "bg-violet-100 text-violet-900 font-medium"
                                          : "active:bg-white text-gray-600"
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                        selectedCategory === category ? "bg-violet-500" : "bg-gray-300"
                                      }`} />
                                      <span className="flex-1">{category}</span>
                                      {selectedCategory === category && <Check className="h-4 w-4 text-violet-500 flex-shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </MobileSheet>
                )}
              </div>

              {/* FAQ Section */}
              <div
                ref={(el) => { sectionRefs.current.faq = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">FAQ</h2>
                      <TooltipIcon
                        content={<p>Add frequently asked questions to help customers</p>}
                      />
                    </div>
                    <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                      Answer common questions. Drag to reorder.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const faqId = `custom-${Date.now()}`
                      setFaqs(prev => [...prev, {
                        id: faqId,
                        question: "",
                        answer: "",
                        isDefault: false,
                      }])
                      requestAnimationFrame(() => {
                        setTimeout(() => {
                          const el = document.querySelector(`[data-faq-id="${faqId}"]`)
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                        }, 50)
                      })
                    }}
                    className="text-gray-600 border-gray-200 h-8 text-xs rounded-lg hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add FAQ
                  </Button>
                </div>

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
              </div>

              {/* Settings Section */}
              <div
                ref={(el) => { sectionRefs.current.settings = el }}
                className="mb-3 scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-5 sm:p-6"
              >
                <div>
                  <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Settings</h2>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
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
                  {/* Mobile: button opens bottom sheet */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCtaSheet(true)}
                    className="sm:hidden w-full h-10 justify-between text-sm border-gray-200 font-normal"
                  >
                    <span className="text-gray-900">{callToAction || "I want this!"}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </Button>
                  {/* Desktop: native select — guaranteed to work */}
                  <div className="hidden sm:block relative">
                    <select
                      id="cta"
                      value={callToAction || "I want this!"}
                      onChange={(e) => setCallToAction(e.target.value)}
                      className="w-full h-11 px-3 pr-10 text-base border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors"
                    >
                      <option value="I want this!">I want this!</option>
                      <option value="Buy Now">Buy Now</option>
                      <option value="Get Access">Get Access</option>
                      <option value="Download Now">Download Now</option>
                      <option value="Purchase">Purchase</option>
                      <option value="Add to Cart">Add to Cart</option>
                      <option value="Join Now">Join Now</option>
                      <option value="Get it Now">Get it Now</option>
                      <option value="Start Now">Start Now</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className={SWITCH_GROUP}>
                  <SwitchRow
                    title="Show sales count"
                    hint="The number sold, on the product page"
                    checked={showSalesBadge}
                    onChange={setShowSalesBadge}
                  />
                  <div>
                    <SwitchRow
                      title="Limit sales"
                      hint="Stop selling after a number of copies"
                      checked={limitSalesEnabled}
                      onChange={setLimitSalesEnabled}
                    />
                    {limitSalesEnabled && (
                      <div className="flex items-center gap-2 px-4 pb-3">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          placeholder="100"
                          aria-label="Copies"
                          value={salesLimit}
                          onChange={(e) => setSalesLimit(e.target.value)}
                          className="h-11 w-32 rounded-[10px] border-[#e5e7eb] text-[15px] sm:h-9 sm:rounded-lg sm:text-sm"
                        />
                        <span className="text-[14px] text-[#6b7280]">copies</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <SwitchRow
                      title="Refund policy"
                      hint="Shown on the product page"
                      checked={refundPolicyEnabled}
                      onChange={setRefundPolicyEnabled}
                    />
                    {refundPolicyEnabled && (
                      <div className="px-4 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowRefundPolicySheet(true)}
                        className="sm:hidden w-full h-11 justify-between rounded-[10px] text-[16px] border-[#e5e7eb] font-normal"
                      >
                        <span className="text-gray-900">{refundPolicyType === "no_refunds" ? "No refunds allowed" : refundPolicyType === "7_day" ? "7-day money back guarantee" : refundPolicyType === "14_day" ? "14-day money back guarantee" : "30-day money back guarantee"}</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </Button>
                      <div className="hidden sm:block relative">
                        <select
                          value={refundPolicyType}
                          onChange={(e) => setRefundPolicyType(e.target.value)}
                          className="w-full h-11 px-3 pr-10 text-base border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors"
                        >
                          <option value="no_refunds">No refunds allowed</option>
                          <option value="7_day">7-day money back guarantee</option>
                          <option value="14_day">14-day money back guarantee</option>
                          <option value="30_day">30-day money back guarantee</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SEO Section */}
              <div
                ref={(el) => { sectionRefs.current.seo = el }}
                className="scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:p-6"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">SEO</h2>
                    <TooltipIcon
                      content={
                        <>
                          <p className="font-medium mb-2">Search Engine Optimization</p>
                          <ul className="text-sm space-y-1 list-disc pl-4">
                            <li>Helps your product appear in Google results</li>
                            <li>SEO title: max 60 characters for best display</li>
                            <li>Meta description: max 160 characters</li>
                            <li>Custom URL slug for clean, shareable links</li>
                          </ul>
                        </>
                      }
                    />
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
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
                    className="h-11 border-gray-200 text-sm sm:text-base"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-400">
                    {seoTitle.length}/60 characters
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="seoDescription" className="text-xs sm:text-sm font-medium text-gray-700">
                    SEO description
                  </Label>
                  <Textarea
                    id="seoDescription"
                    placeholder="Auto-generated from your product description"
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
                  <Label htmlFor="productUrl" className="text-xs sm:text-sm font-medium text-gray-700">
                    Product URL
                  </Label>
                  <div className="flex items-center gap-0">
                    <div className="h-11 px-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-lg flex items-center">
                      <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                        https://{creator?.username || creator?.slug || "yourstore"}.storelib.com/p/
                      </span>
                    </div>
                    <Input
                      id="productUrl"
                      placeholder="product-url"
                      value={slug}
                      onChange={(e) => {
                        // Only allow lowercase letters, numbers, and hyphens
                        const newSlug = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-')
                          .replace(/--+/g, '-')
                          .replace(/^-|-$/g, '')
                        setSlug(newSlug)
                      }}
                      className="h-11 border-gray-200 rounded-l-none text-sm sm:text-base flex-1"
                    />
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-400">
                    Customize your product's URL. Use lowercase letters, numbers, and hyphens only.
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
                      {plainSearchPreviewDescription || "Product description will appear here..."}
                    </p>
                  </div>
                </div>
              </div>
      </div>

      {/* YouTube input is now inline in the Photos and video section */}

      {/* CTA Bottom Sheet */}
      <MobileSheet isOpen={showCtaSheet} onClose={() => setShowCtaSheet(false)}>
        <div className="px-5 pb-6 space-y-1" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Call to Action</h3>
          {["I want this!", "Buy Now", "Get Access", "Download Now", "Purchase", "Add to Cart", "Join Now", "Get it Now", "Start Now"].map((cta) => (
            <button
              key={cta}
              type="button"
              onClick={() => { setCallToAction(cta); setShowCtaSheet(false) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                (callToAction || "I want this!") === cta
                  ? "bg-violet-50 text-violet-900 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{cta}</span>
              {(callToAction || "I want this!") === cta && <Check className="h-4 w-4 text-violet-500" />}
            </button>
          ))}
        </div>
      </MobileSheet>

      {/* Refund Policy Bottom Sheet */}
      <MobileSheet isOpen={showRefundPolicySheet} onClose={() => setShowRefundPolicySheet(false)} maxHeight="85vh">
        <div className="px-5 pb-6 space-y-1" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Refund Policy</h3>
          {[
            { value: "no_refunds", label: "No refunds allowed" },
            { value: "7_day", label: "7-day money back guarantee" },
            { value: "14_day", label: "14-day money back guarantee" },
            { value: "30_day", label: "30-day money back guarantee" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setRefundPolicyType(option.value); setShowRefundPolicySheet(false) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                refundPolicyType === option.value
                  ? "bg-violet-50 text-violet-900 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{option.label}</span>
              {refundPolicyType === option.value && <Check className="h-4 w-4 text-violet-500" />}
            </button>
          ))}
        </div>
      </MobileSheet>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showExitDialog} onOpenChange={(open) => {
        if (!open && isMobileViewport) closeSheet("unsaved", () => setShowExitDialog(false))
        else setShowExitDialog(open)
      }}>
        <DialogContent
          disableDefaultAnimations={isMobileViewport}
          showCloseButton={!isMobileViewport}
          onOpenAutoFocus={(e) => {
            if (isMobileViewport) e.preventDefault()
          }}
          overlayClassName={isMobileViewport ? `bg-black/40 transition-opacity duration-400 ${dismissingSheet === "unsaved" ? "opacity-0" : "opacity-100"}` : undefined}
          className={isMobileViewport
            ? `fixed !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0 w-full !max-w-none rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-0 max-h-[70vh] overflow-hidden flex flex-col ${dismissingSheet === "unsaved" && !swipeCloseRef.current ? "animate-bottom-sheet-out" : (!dismissingSheet ? "animate-bottom-sheet-in" : "")}`
            : "sm:max-w-md mx-4"}
          style={isMobileViewport ? { willChange: 'transform', backfaceVisibility: 'hidden', ...sheetAboveKeyboard(0.7) } : undefined}
          onTouchStart={(e) => isMobileViewport && handleSheetTouchStart(e, e.currentTarget as HTMLDivElement)}
          onTouchMove={(e) => isMobileViewport && handleSheetTouchMove(e)}
          onTouchEnd={() => isMobileViewport && handleSheetTouchEnd("unsaved", () => setShowExitDialog(false))}
          onTouchCancel={() => isMobileViewport && handleSheetTouchEnd("unsaved", () => setShowExitDialog(false))}
        >
          {isMobileViewport && (
            <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none" data-drag-handle>
              <div className="h-[5px] w-10 rounded-full bg-gray-300" />
            </div>
          )}
          <DialogHeader className={isMobileViewport ? "px-5 pt-1 pb-3 text-left" : undefined}>
            <DialogTitle className="text-base sm:text-lg">Unsaved changes</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              You have unsaved changes. Would you like to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={isMobileViewport ? "px-5 pb-5 grid grid-cols-1 gap-2" : "flex-col-reverse sm:flex-row gap-2"}>
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
