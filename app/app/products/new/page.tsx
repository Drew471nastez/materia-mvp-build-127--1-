"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
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
} from "lucide-react"
import Link from "next/link"
import { DescriptionRichEditor } from "@/components/store-builder/description-rich-editor"

// Section definitions
const SECTIONS = [
  { id: "about", name: "About" },
  { id: "media", name: "Media" },
  { id: "content", name: "Content" },
  { id: "settings", name: "Settings" },
  { id: "seo", name: "SEO" },
] as const

type SectionId = typeof SECTIONS[number]["id"]

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

const getYouTubeThumbnail = (videoId: string): string => {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

export default function NewProductPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SectionId>("about")
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [creator, setCreator] = useState<any>(null)

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

  // Track changes for unsaved warning
  useEffect(() => {
    if (title || description || price || mediaItems.length > 0 || digitalFiles.length > 0) {
      setHasUnsavedChanges(true)
    }
  }, [title, description, price, mediaItems, digitalFiles])

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

    // About: title filled
    if (title.trim()) completed.add("about")

    // Media: at least one media item
    if (mediaItems.length > 0) completed.add("media")

    // Content: description filled
    if (description.trim()) completed.add("content")

    // Settings: price filled
    if (price.trim()) completed.add("settings")

    // SEO: seo title or description filled
    if (seoTitle.trim() || seoDescription.trim()) completed.add("seo")

    setCompletedSections(completed)
  }, [title, mediaItems, description, price, seoTitle, seoDescription])

  useEffect(() => {
    checkSectionCompletion()
  }, [checkSectionCompletion])

  // Scroll spy for active section and header hide/show
  useEffect(() => {
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
      // Initial check
      handleScroll()
      return () => content.removeEventListener("scroll", handleScroll)
    }
  }, [activeSection])

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
        .select("id, stripe_account_id, stripe_onboarding_status")
        .eq("user_id", user.id)
        .single()

      if (!creatorData) {
        router.push("/onboarding")
        return
      }
      setCreatorId(creatorData.id)
      setCreator(creatorData)
    }
    getCreator()
  }, [router])

  // Auto-generate slug from title
  useEffect(() => {
    if (!title) return
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setSlug(generatedSlug)
    if (!seoTitle) {
      setSeoTitle(title)
    }
  }, [title])

  // Create or update product
  const saveProduct = useCallback(async (publish = false) => {
    if (!creatorId) return null
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    try {
      let finalSlug = slug
      if (!productId) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("slug", slug)
          .single()

        if (existing) {
          finalSlug = `${slug}-${Math.random().toString(36).slice(2, 7)}`
        }
      }

      // Get photo URLs from media items (images and YouTube)
      const photoUrls = mediaItems.filter(m => m.type === "image").map(m => m.url)
      const youtubeItems = mediaItems.filter(m => m.type === "youtube")

      const productData = {
        creator_id: creatorId,
        type: productType,
        title,
        slug: finalSlug,
        description,
        status: publish ? "published" : "draft",
        price_cents: Math.round(Number.parseFloat(price || "0") * 100),
        compare_at_cents: compareAtPrice ? Math.round(Number.parseFloat(compareAtPrice) * 100) : null,
        thumbnail_url: mediaItems.length > 0 ? (mediaItems[0].type === "youtube" ? mediaItems[0].thumbnailUrl : mediaItems[0].url) : null,
        gallery_urls: photoUrls.length > 0 ? photoUrls : null,
        video_url: youtubeItems[0]?.url || null,
        show_sales_badge: showSalesBadge,
        refund_policy_enabled: refundPolicyEnabled,
        refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        call_to_action: callToAction || null,
      }

      if (productId) {
        const { error: updateError } = await supabase
          .from("products")
          .update(productData)
          .eq("id", productId)

        if (updateError) throw updateError
      } else {
        const { data: product, error: createError } = await supabase
          .from("products")
          .insert(productData)
          .select()
          .single()

        if (createError) throw createError
        setProductId(product.id)
        setHasUnsavedChanges(false)
        return product.id
      }

      setHasUnsavedChanges(false)
      return productId
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, mediaItems, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction])

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

        // Fill with dark background (matches the placeholder style)
        ctx.fillStyle = "#1f1f1f"
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

    const newItem: MediaItem = {
      id: `yt-${videoId}-${Date.now()}`,
      type: "youtube",
      url: `https://www.youtube.com/embed/${videoId}`,
      thumbnailUrl: getYouTubeThumbnail(videoId),
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
      currentProductId = await saveProduct(false)
      if (!currentProductId) {
        setError("Failed to create product. Please try again.")
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
    const savedProductId = await saveProduct(false)
    setShowExitDialog(false)
    if (savedProductId) {
      router.push(`/app/products/${savedProductId}`)
    }
  }

  const handleSaveChanges = async () => {
    if (!title.trim()) {
      setError("Please enter a product title")
      scrollToSection("about")
      return
    }

    setIsLoading(true)
    const savedProductId = await saveProduct(false)
    setIsLoading(false)

    if (savedProductId) {
      router.push(`/app/products/${savedProductId}`)
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

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
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
              <h1 className="text-lg sm:text-xl lg:text-[22px] font-semibold text-gray-900 tracking-tight">New Product</h1>
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
                {SECTIONS.map((section) => {
                  const isActive = activeSection === section.id

                  return (
                    <button
                      key={section.id}
                      ref={(el) => { pillRefs.current[section.id] = el }}
                      onClick={() => scrollToSection(section.id)}
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
                          <div className="w-full h-full bg-gray-900">
                            <img
                              src={item.thumbnailUrl}
                              alt="YouTube video"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <svg viewBox="0 -7 48 48" className="h-6 w-6 sm:h-8 sm:w-8" fill="none">
                                <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                              </svg>
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
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm"
                        disabled={uploadingMedia}
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
                            <div className="mt-3 relative aspect-video max-w-[200px] mx-auto rounded-lg overflow-hidden border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                              <img
                                src={getYouTubeThumbnail(parseYouTubeUrl(youtubeInput)!)}
                                alt="Video preview"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                                  <Play className="h-6 w-6 text-white ml-0.5" />
                                </div>
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
                    Describe your product and add digital files.
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
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="cta" className="text-sm font-medium text-gray-700">
                      Call to action
                    </Label>
                    <TooltipIcon
                      content={<p>Custom button text (e.g., "Buy Now", "Get Access")</p>}
                    />
                  </div>
                  <Input
                    id="cta"
                    placeholder="Buy Now"
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    className="h-10 sm:h-11 border-gray-200 text-sm sm:text-base"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Digital Files
                    </Label>
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
                          className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{file.file_name}</p>
                              <p className="text-[10px] sm:text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
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
                          className="border-gray-300 text-gray-700 h-7 sm:h-8 text-xs sm:text-sm"
                          disabled={uploadingFiles}
                        >
                          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                          Upload
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <div
                ref={(el) => { sectionRefs.current.settings = el }}
                className="space-y-4 sm:space-y-6 mb-8 sm:mb-12"
              >
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Settings</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Configure pricing and product settings.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-xs sm:text-sm font-medium text-gray-900">Pricing</h3>
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

                <div className="space-y-3">
                  <h3 className="text-xs sm:text-sm font-medium text-gray-900">Display</h3>
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
                  <h3 className="text-xs sm:text-sm font-medium text-gray-900">Refund policy</h3>
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
                  <Label htmlFor="seoDescription" className="text-xs sm:text-sm font-medium text-gray-700">
                    SEO description
                  </Label>
                  <Textarea
                    id="seoDescription"
                    placeholder="Brief description for search results"
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    className="border-gray-200 min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-400">
                    {seoDescription.length}/160 characters
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
                      yourstore.com/p/{slug || "product-url"}
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
              disabled={isLoading || !title.trim()}
              className="bg-violet-500 hover:bg-violet-600 text-white h-10 sm:h-10 px-6 sm:px-6 text-sm sm:text-sm rounded-lg font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-4 sm:w-4 mr-1.5 animate-spin" />
                  Saving...
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
