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
  ChevronLeft,
  Check,
  Plus,
  X,
  Loader2,
  FileText,
  GripVertical,
  Play,
  Youtube,
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

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string
}

interface MediaItem {
  id: string
  type: "image" | "video" | "youtube"
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
  const [isSticky, setIsSticky] = useState(false)

  // Refs for sections
  const sectionRefs = useRef<{ [key in SectionId]?: HTMLDivElement | null }>({})
  const pillBarRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // About section fields
  const [title, setTitle] = useState("")

  // Media section fields - unified draggable media
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [youtubeInput, setYoutubeInput] = useState("")
  const [showYoutubeInput, setShowYoutubeInput] = useState(false)

  // Content tab fields
  const [description, setDescription] = useState("")
  const [callToAction, setCallToAction] = useState("")
  const [digitalFiles, setDigitalFiles] = useState<UploadedFile[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

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

  // Scroll spy for active section
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return

      const scrollTop = contentRef.current.scrollTop
      const pillBarHeight = pillBarRef.current?.offsetHeight || 0

      // Check if should be sticky
      setIsSticky(scrollTop > 10)

      // Find which section is currently in view
      let currentSection: SectionId = "about"

      for (const section of SECTIONS) {
        const element = sectionRefs.current[section.id]
        if (element) {
          const rect = element.getBoundingClientRect()
          const containerRect = contentRef.current.getBoundingClientRect()
          const relativeTop = rect.top - containerRect.top - pillBarHeight - 20

          if (relativeTop <= 100) {
            currentSection = section.id
          }
        }
      }

      setActiveSection(currentSection)
    }

    const content = contentRef.current
    if (content) {
      content.addEventListener("scroll", handleScroll, { passive: true })
      return () => content.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // Scroll to section when pill clicked
  const scrollToSection = (sectionId: SectionId) => {
    const element = sectionRefs.current[sectionId]
    if (element && contentRef.current) {
      const pillBarHeight = pillBarRef.current?.offsetHeight || 0
      const containerRect = contentRef.current.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const scrollTop = contentRef.current.scrollTop + (elementRect.top - containerRect.top) - pillBarHeight - 20

      contentRef.current.scrollTo({
        top: scrollTop,
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

      // Get photo URLs from media items (images and videos)
      const photoUrls = mediaItems.filter(m => m.type === "image").map(m => m.url)
      const videoItem = mediaItems.find(m => m.type === "video")
      const youtubeItem = mediaItems.find(m => m.type === "youtube")

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
        video_url: videoItem?.url || youtubeItem?.url || null,
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
        return product.id
      }

      return productId
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, mediaItems, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction])

  // Handle media upload
  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploadingMedia(true)
    const supabase = createClient()
    const newItems: MediaItem[] = []

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          continue
        }

        const isVideo = file.type.startsWith("video/")
        const existingVideos = mediaItems.filter(m => m.type === "video").length

        if (isVideo && existingVideos >= 1) {
          setError("Only 1 video file allowed")
          continue
        }

        const existingImages = mediaItems.filter(m => m.type === "image").length
        if (!isVideo && existingImages + newItems.filter(m => m.type === "image").length >= 20) {
          setError("Maximum 20 photos allowed")
          continue
        }

        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const folder = productId || "temp"
        const filePath = `${creatorId}/${folder}/${timestamp}_${safeName}`

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, file, { cacheControl: "3600", upsert: false })

        if (uploadError) {
          console.error("Upload error:", uploadError)
          continue
        }

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath)

        newItems.push({
          id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
          type: isVideo ? "video" : "image",
          url: publicUrl,
        })
      }

      if (newItems.length > 0) {
        setMediaItems(prev => [...prev, ...newItems])
      }
    } finally {
      setUploadingMedia(false)
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
    if (existingYouTube >= 1) {
      setError("Only 1 YouTube video allowed")
      return
    }

    const newItem: MediaItem = {
      id: `yt-${videoId}`,
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

  // Drag and drop handlers
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

  // Handle file upload for digital assets
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    let currentProductId = productId
    if (!currentProductId) {
      currentProductId = await saveProduct(false)
      if (!currentProductId) return
    }

    setUploadingFiles(true)
    const supabase = createClient()
    const newFiles: UploadedFile[] = []

    try {
      for (const file of Array.from(files)) {
        if (file.size > 1024 * 1024 * 1024) {
          setError(`File "${file.name}" exceeds 1GB limit`)
          continue
        }

        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const filePath = `products/${currentProductId}/${timestamp}_${safeName}`

        const { error: uploadError } = await supabase.storage
          .from("product-files")
          .upload(filePath, file, { cacheControl: "3600", upsert: false })

        if (uploadError) {
          setError(`Failed to upload "${file.name}"`)
          continue
        }

        const { data: asset, error: dbError } = await supabase
          .from("digital_assets")
          .insert({
            product_id: currentProductId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
          })
          .select()
          .single()

        if (!dbError && asset) {
          newFiles.push({
            id: asset.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
          })
        }
      }

      setDigitalFiles(prev => [...prev, ...newFiles])
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleDeleteFile = async (file: UploadedFile) => {
    if (!file.id) return
    const supabase = createClient()
    await supabase.from("digital_assets").delete().eq("id", file.id)
    await supabase.storage
      .from("product-files")
      .remove([file.file_path])
      .catch(() => {})
    setDigitalFiles(prev => prev.filter(f => f.id !== file.id))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleCancel = () => {
    router.push("/app/products")
  }

  const handlePreview = async () => {
    await saveProduct(false)
    if (productId) {
      window.open(`/p/${slug}?preview=true`, "_blank")
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header - no border-b between title and pills */}
      <div className="bg-white">
        <div className="px-8 py-4">
          <div className="flex items-center gap-2">
            <Link
              href="/app/products"
              className="flex items-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-gray-900 tracking-tight">New Product</h1>
          </div>
        </div>
      </div>

      {/* Content with sticky pill bar */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* Sticky Pill Navigation */}
        <div
          ref={pillBarRef}
          className={`sticky top-0 z-20 bg-white transition-shadow ${isSticky ? "shadow-sm" : ""}`}
        >
          <div className="px-8 py-3">
            <div className="flex items-center gap-2">
              {SECTIONS.map((section) => {
                const isCompleted = completedSections.has(section.id)
                const isActive = activeSection === section.id

                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`
                      flex items-center gap-2 px-5 py-2 rounded-full text-[15px] font-medium transition-all
                      ${isActive
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }
                    `}
                  >
                    {/* Checkmark circle icon */}
                    <span className={`
                      flex items-center justify-center w-5 h-5 rounded-full transition-colors
                      ${isCompleted
                        ? "bg-violet-500"
                        : "bg-gray-200"
                      }
                    `}>
                      <Check className={`h-3 w-3 ${isCompleted ? "text-white" : "text-gray-400"}`} />
                    </span>
                    {section.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Form Content - All sections on one page */}
        <div className="px-8 py-6 max-w-3xl pb-32">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* About Section */}
          <div
            ref={(el) => { sectionRefs.current.about = el }}
            className="space-y-6 mb-12"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">About</h2>
              <p className="text-sm text-gray-500">
                Tell the world all about your item and why they'll love it.
              </p>
            </div>

            {/* Title Field */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                  Title
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-xs cursor-help">
                        i
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs p-3">
                      <p className="font-medium mb-2">Title recommendations:</p>
                      <ul className="text-sm space-y-1 list-disc pl-4">
                        <li>Keep it clear and descriptive</li>
                        <li>Include main benefit or outcome</li>
                        <li>Use keywords customers search for</li>
                        <li>Avoid all caps or excessive punctuation</li>
                        <li>Aim for 5-10 words maximum</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="title"
                placeholder="Short sleeve t-shirt"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 border-gray-200 bg-white"
              />
            </div>
          </div>

          {/* Media Section */}
          <div
            ref={(el) => { sectionRefs.current.media = el }}
            className="space-y-6 mb-12"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Photos and video</h2>
              <p className="text-sm text-gray-500">
                Add up to 20 photos, 1 video file, or 1 YouTube video. Drag to reorder - first item is the thumbnail.
              </p>
            </div>

            {/* Draggable Media Grid */}
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {mediaItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      relative aspect-square rounded-lg overflow-hidden border group cursor-move
                      ${dragOverIndex === index
                        ? "border-violet-500 border-2 scale-105"
                        : draggedIndex === index
                          ? "opacity-50 border-dashed border-2"
                          : "border-gray-200"
                      }
                    `}
                  >
                    {item.type === "image" && (
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    )}
                    {item.type === "video" && (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <video src={item.url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    )}
                    {item.type === "youtube" && (
                      <div className="w-full h-full bg-gray-900">
                        <img
                          src={item.thumbnailUrl}
                          alt="YouTube video"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Youtube className="h-8 w-8 text-red-500" />
                        </div>
                      </div>
                    )}

                    {/* Drag handle overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <GripVertical className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeMedia(item.id)}
                      className="absolute top-1.5 right-1.5 p-1 bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-gray-600" />
                    </button>

                    {/* Position indicator */}
                    <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded bg-black/50 text-xs text-white">
                      {index + 1}
                    </div>

                    {/* Type label */}
                    {index === 0 && (
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        Thumbnail
                      </span>
                    )}
                    {item.type === "video" && index !== 0 && (
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        Video
                      </span>
                    )}
                    {item.type === "youtube" && index !== 0 && (
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-red-600 text-white text-[10px] rounded">
                        YouTube
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload Zone */}
            <div className="flex gap-3">
              <div
                className={`
                  flex-1 border border-dashed border-gray-300 rounded-lg
                  flex flex-col items-center justify-center py-8
                  transition-colors cursor-pointer hover:border-gray-400
                  ${uploadingMedia ? "pointer-events-none opacity-50" : ""}
                `}
                onClick={() => document.getElementById("media-input")?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleMediaUpload(e.dataTransfer.files)
                }}
              >
                <input
                  id="media-input"
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleMediaUpload(e.target.files)}
                  disabled={uploadingMedia}
                />

                <p className="text-gray-500 text-sm mb-2">
                  {uploadingMedia ? "Uploading..." : "Drag and drop or"}
                </p>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 h-9 px-4"
                  disabled={uploadingMedia}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Upload files
                </Button>
              </div>

              {/* YouTube Add Button */}
              <div className="flex flex-col">
                {!showYoutubeInput ? (
                  <button
                    type="button"
                    onClick={() => setShowYoutubeInput(true)}
                    className="h-full px-4 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-gray-400 transition-colors"
                  >
                    <Youtube className="h-5 w-5 text-red-500" />
                    <span className="text-xs text-gray-500">YouTube</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <Input
                      placeholder="YouTube URL or video ID"
                      value={youtubeInput}
                      onChange={(e) => setYoutubeInput(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddYouTube}
                        className="bg-red-500 hover:bg-red-600 text-white h-8"
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowYoutubeInput(false)
                          setYoutubeInput("")
                        }}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400">
              {mediaItems.length}/20 images · {mediaItems.filter(m => m.type === "video").length}/1 video · {mediaItems.filter(m => m.type === "youtube").length}/1 YouTube
            </p>
          </div>

          {/* Content Section */}
          <div
            ref={(el) => { sectionRefs.current.content = el }}
            className="space-y-6 mb-12"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Content</h2>
              <p className="text-sm text-gray-500">
                Describe your product and add digital files.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-sm font-medium text-gray-700">
                  Description
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-xs cursor-help">
                        i
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Describe what customers will get</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <DescriptionRichEditor
                value={description}
                onChange={setDescription}
                className="min-h-[180px] border border-gray-200 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="cta" className="text-sm font-medium text-gray-700">
                  Call to action
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-xs cursor-help">
                        i
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Custom button text (e.g., "Buy Now", "Get Access")</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="cta"
                placeholder="Buy Now"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                className="h-10 border-gray-200"
              />
            </div>

            {productType === "digital" && (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-sm font-medium text-gray-700">
                    Digital Files
                  </Label>
                  <span className="text-red-500 text-sm">*</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-xs cursor-help">
                          ?
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Files customers receive after purchase</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-gray-500">
                  Upload files customers will receive (max 1GB each).
                </p>

                {digitalFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {digitalFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{file.file_name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={`
                    mt-2 border border-dashed border-gray-300 rounded-lg
                    flex flex-col items-center justify-center py-6
                    transition-colors cursor-pointer hover:border-gray-400
                    ${uploadingFiles ? "pointer-events-none opacity-50" : ""}
                  `}
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <input
                    id="file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    disabled={uploadingFiles}
                  />

                  <p className="text-gray-500 text-sm mb-2">
                    {uploadingFiles ? "Uploading..." : "Drag and drop files or"}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-700 h-8"
                    disabled={uploadingFiles}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Upload
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Settings Section */}
          <div
            ref={(el) => { sectionRefs.current.settings = el }}
            className="space-y-6 mb-12"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
              <p className="text-sm text-gray-500">
                Configure pricing and product settings.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Pricing</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-sm font-medium text-gray-700">
                    Price (USD)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="h-10 pl-7 border-gray-200"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comparePrice" className="text-sm font-medium text-gray-700">
                    Compare at price
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <Input
                      id="comparePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      className="h-10 pl-7 border-gray-200"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug" className="text-sm font-medium text-gray-700">
                URL slug
              </Label>
              <div className="flex items-center">
                <span className="px-3 h-10 flex items-center bg-gray-50 border border-r-0 border-gray-200 rounded-l-md text-sm text-gray-500">
                  /p/
                </span>
                <Input
                  id="slug"
                  placeholder="my-product"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="h-10 rounded-l-none border-gray-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Product type
              </Label>
              <Select value={productType} onValueChange={(v) => setProductType(v as "digital" | "course")}>
                <SelectTrigger className="h-10 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">Digital Product</SelectItem>
                  <SelectItem value="course">Online Course</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Display</h3>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">Show sales count</p>
                  <p className="text-xs text-gray-500">Display number of sales on product page</p>
                </div>
                <Switch
                  checked={showSalesBadge}
                  onCheckedChange={setShowSalesBadge}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Refund policy</h3>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enable refund policy</p>
                  <p className="text-xs text-gray-500">Show refund policy on product page</p>
                </div>
                <Switch
                  checked={refundPolicyEnabled}
                  onCheckedChange={setRefundPolicyEnabled}
                />
              </div>
              {refundPolicyEnabled && (
                <Select value={refundPolicyType} onValueChange={setRefundPolicyType}>
                  <SelectTrigger className="h-10 border-gray-200">
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
            className="space-y-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SEO</h2>
              <p className="text-sm text-gray-500">
                Optimize your product for search engines.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seoTitle" className="text-sm font-medium text-gray-700">
                SEO title
              </Label>
              <Input
                id="seoTitle"
                placeholder="Product title for search engines"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className="h-10 border-gray-200"
              />
              <p className="text-xs text-gray-400">
                {seoTitle.length}/60 characters
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seoDescription" className="text-sm font-medium text-gray-700">
                SEO description
              </Label>
              <Textarea
                id="seoDescription"
                placeholder="Brief description for search results"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="border-gray-200 min-h-[100px]"
              />
              <p className="text-xs text-gray-400">
                {seoDescription.length}/160 characters
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Search preview
              </Label>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-blue-700 text-base font-medium truncate">
                  {seoTitle || title || "Product title"}
                </p>
                <p className="text-green-700 text-sm truncate">
                  yourstore.com/p/{slug || "product-url"}
                </p>
                <p className="text-gray-600 text-sm line-clamp-2 mt-0.5">
                  {seoDescription || description || "Product description will appear here..."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[220px] bg-white border-t border-gray-200 z-40">
        <div className="px-8 py-3">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="border-gray-300 text-gray-700 hover:bg-gray-50 h-9"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={isLoading || !title.trim()}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 h-9"
              >
                Preview
              </Button>

              <Button
                type="button"
                onClick={handleSaveChanges}
                disabled={isLoading || !title.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white h-9 px-5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
