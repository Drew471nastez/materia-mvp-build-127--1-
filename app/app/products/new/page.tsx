"use client"

import { useState, useEffect, useCallback } from "react"
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
  Info,
  HelpCircle,
  Plus,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  FileText,
  Settings,
  Search,
  GripVertical,
} from "lucide-react"
import Link from "next/link"
import { DraggableGalleryUpload } from "@/components/app/draggable-gallery-upload"
import { DescriptionRichEditor } from "@/components/store-builder/description-rich-editor"

// Tab definitions matching the design
const TABS = [
  { id: "about", name: "About" },
  { id: "media", name: "Media" },
  { id: "content", name: "Content" },
  { id: "settings", name: "Settings" },
  { id: "seo", name: "SEO" },
] as const

type TabId = typeof TABS[number]["id"]

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string
}

export default function NewProductPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>("about")
  const [completedTabs, setCompletedTabs] = useState<Set<TabId>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [creator, setCreator] = useState<any>(null)

  // About tab fields
  const [title, setTitle] = useState("")
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)

  // Media tab fields
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

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
  const [seoKeywords, setSeoKeywords] = useState("")

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
    // Also set SEO title if empty
    if (!seoTitle) {
      setSeoTitle(title)
    }
  }, [title])

  // Mark tab as completed when required fields are filled
  useEffect(() => {
    const newCompletedTabs = new Set<TabId>()

    // About tab - requires title
    if (title.trim()) {
      newCompletedTabs.add("about")
    }

    // Media tab - optional but mark if has any media
    if (photoUrls.length > 0 || galleryUrls.length > 0 || thumbnailUrl) {
      newCompletedTabs.add("media")
    }

    // Content tab - optional but mark if has description
    if (description.trim()) {
      newCompletedTabs.add("content")
    }

    // Settings tab - mark if has price
    if (price) {
      newCompletedTabs.add("settings")
    }

    // SEO tab - optional but mark if filled
    if (seoTitle || seoDescription) {
      newCompletedTabs.add("seo")
    }

    setCompletedTabs(newCompletedTabs)
  }, [title, photoUrls, galleryUrls, thumbnailUrl, description, price, seoTitle, seoDescription])

  // Create or update product
  const saveProduct = useCallback(async (publish = false) => {
    if (!creatorId) return null
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    try {
      // Check slug uniqueness if creating new
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

      const productData = {
        creator_id: creatorId,
        type: productType,
        title,
        slug: finalSlug,
        description,
        status: publish ? "published" : "draft",
        price_cents: Math.round(Number.parseFloat(price || "0") * 100),
        compare_at_cents: compareAtPrice ? Math.round(Number.parseFloat(compareAtPrice) * 100) : null,
        thumbnail_url: thumbnailUrl || (photoUrls.length > 0 ? photoUrls[0] : null),
        gallery_urls: photoUrls.length > 0 ? photoUrls : null,
        show_sales_badge: showSalesBadge,
        refund_policy_enabled: refundPolicyEnabled,
        refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        call_to_action: callToAction || null,
      }

      if (productId) {
        // Update existing product
        const { error: updateError } = await supabase
          .from("products")
          .update(productData)
          .eq("id", productId)

        if (updateError) throw updateError
      } else {
        // Create new product
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
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, thumbnailUrl, photoUrls, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction])

  // Handle photo upload
  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploadingMedia(true)
    const supabase = createClient()
    const newUrls: string[] = []

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          continue
        }

        // Check if video (only allow 1)
        if (file.type.startsWith("video/")) {
          if (videoUrl) {
            setError("Only 1 video allowed")
            continue
          }
        }

        // Check photo limit
        if (file.type.startsWith("image/") && photoUrls.length + newUrls.length >= 20) {
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

        if (file.type.startsWith("video/")) {
          setVideoUrl(publicUrl)
        } else {
          newUrls.push(publicUrl)
        }
      }

      if (newUrls.length > 0) {
        setPhotoUrls(prev => [...prev, ...newUrls])
      }
    } finally {
      setUploadingMedia(false)
    }
  }

  // Handle file upload for digital assets
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Create product first if needed
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

  const removePhoto = (index: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== index))
  }

  const removeVideo = () => {
    setVideoUrl(null)
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
    // Save first then preview
    await saveProduct(false)
    if (productId) {
      window.open(`/p/${slug}?preview=true`, "_blank")
    }
  }

  const handleSaveChanges = async () => {
    if (!title.trim()) {
      setError("Please enter a product title")
      setActiveTab("about")
      return
    }

    setIsLoading(true)
    const savedProductId = await saveProduct(false)
    setIsLoading(false)

    if (savedProductId) {
      router.push(`/app/products/${savedProductId}`)
    }
  }

  const handlePublish = async () => {
    if (!title.trim()) {
      setError("Please enter a product title")
      setActiveTab("about")
      return
    }

    setIsLoading(true)
    const savedProductId = await saveProduct(true)
    setIsLoading(false)

    if (savedProductId) {
      router.push(`/app/products/${savedProductId}?published=true`)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/products"
              className="flex items-center text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">New Product</h1>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            {TABS.map((tab) => {
              const isCompleted = completedTabs.has(tab.id)
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
                    ${isActive
                      ? "bg-gray-900 text-white"
                      : isCompleted
                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }
                  `}
                >
                  {isCompleted && !isActive && (
                    <Check className="h-4 w-4 text-gray-500" />
                  )}
                  {isActive && isCompleted && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                  {tab.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* About Tab */}
          {activeTab === "about" && (
            <div className="space-y-8">
              {/* About Section Header */}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">About</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Tell the world all about your item and why they'll love it.
                </p>
              </div>

              {/* Title Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                    Title
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>The name of your product that customers will see</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="title"
                  placeholder="Short sleeve t-shirt"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11 border-gray-300 focus:border-gray-400 focus:ring-gray-400"
                />
              </div>

              {/* Photos and Video Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Photos and video
                  </Label>
                  <span className="text-red-500">*</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Upload images and videos to showcase your product</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-gray-500">
                  Add up to 20 photos and 1 video.
                </p>

                {/* Uploaded Media Preview */}
                {(photoUrls.length > 0 || videoUrl) && (
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {photoUrls.map((url, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(index)}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4 text-gray-600" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}
                    {videoUrl && (
                      <div className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group bg-gray-100">
                        <video src={videoUrl} className="w-full h-full object-cover" />
                        <button
                          onClick={removeVideo}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4 text-gray-600" />
                        </button>
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                          Video
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Zone */}
                <div
                  className={`
                    relative border-2 border-dashed border-gray-300 rounded-xl p-8
                    flex flex-col items-center justify-center min-h-[180px]
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
                    handlePhotoUpload(e.dataTransfer.files)
                  }}
                >
                  <input
                    id="media-input"
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                    disabled={uploadingMedia}
                  />

                  <p className="text-gray-500 text-sm mb-4">
                    {uploadingMedia ? "Uploading..." : "Drag and drop files or"}
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    disabled={uploadingMedia}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Media Tab */}
          {activeTab === "media" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Media</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Add additional gallery images for your product.
                </p>
              </div>

              {/* Gallery Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Gallery Images
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Drag to reorder. First image will be the cover.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-gray-500">
                  Drag to reorder images. Add up to 8 gallery images.
                </p>

                <DraggableGalleryUpload
                  folder={`${creatorId}/${productId || "temp"}/gallery`}
                  value={galleryUrls}
                  onChange={setGalleryUrls}
                  maxImages={8}
                />
              </div>
            </div>
          )}

          {/* Content Tab */}
          {activeTab === "content" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Content</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Describe your product and add digital files.
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    Description
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-gray-400 cursor-help" />
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
                  className="min-h-[200px] border border-gray-300 rounded-lg"
                />
              </div>

              {/* Call to Action */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cta" className="text-sm font-medium text-gray-700">
                    Call to action
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-gray-400 cursor-help" />
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
                  className="h-11 border-gray-300"
                />
              </div>

              {/* Digital Files */}
              {productType === "digital" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      Digital Files
                    </Label>
                    <span className="text-red-500">*</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
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

                  {/* Uploaded files list */}
                  {digitalFiles.length > 0 && (
                    <div className="space-y-2">
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
                            className="p-1.5 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File Upload Zone */}
                  <div
                    className={`
                      relative border-2 border-dashed border-gray-300 rounded-xl p-6
                      flex flex-col items-center justify-center
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

                    <Upload className="h-6 w-6 text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm mb-2">
                      {uploadingFiles ? "Uploading..." : "Drag and drop files or"}
                    </p>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-300 text-gray-700"
                      disabled={uploadingFiles}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Configure pricing and product settings.
                </p>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-gray-900">Pricing</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price" className="text-sm font-medium text-gray-700">
                      Price (USD)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="h-11 pl-7 border-gray-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="comparePrice" className="text-sm font-medium text-gray-700">
                      Compare at price
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <Input
                        id="comparePrice"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={compareAtPrice}
                        onChange={(e) => setCompareAtPrice(e.target.value)}
                        className="h-11 pl-7 border-gray-300"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* URL Slug */}
              <div className="space-y-2">
                <Label htmlFor="slug" className="text-sm font-medium text-gray-700">
                  URL slug
                </Label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500">
                    /p/
                  </span>
                  <Input
                    id="slug"
                    placeholder="my-product"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="h-11 rounded-l-none border-gray-300"
                  />
                </div>
              </div>

              {/* Product Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Product type
                </Label>
                <Select value={productType} onValueChange={(v) => setProductType(v as "digital" | "course")}>
                  <SelectTrigger className="h-11 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="digital">Digital Product</SelectItem>
                    <SelectItem value="course">Online Course</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Display Options */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-gray-900">Display</h3>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Show sales count</p>
                    <p className="text-sm text-gray-500">Display number of sales on product page</p>
                  </div>
                  <Switch
                    checked={showSalesBadge}
                    onCheckedChange={setShowSalesBadge}
                  />
                </div>
              </div>

              {/* Refund Policy */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-gray-900">Refund policy</h3>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Enable refund policy</p>
                    <p className="text-sm text-gray-500">Show refund policy on product page</p>
                  </div>
                  <Switch
                    checked={refundPolicyEnabled}
                    onCheckedChange={setRefundPolicyEnabled}
                  />
                </div>

                {refundPolicyEnabled && (
                  <Select value={refundPolicyType} onValueChange={setRefundPolicyType}>
                    <SelectTrigger className="h-11 border-gray-300">
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
          )}

          {/* SEO Tab */}
          {activeTab === "seo" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">SEO</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Optimize your product for search engines.
                </p>
              </div>

              {/* SEO Title */}
              <div className="space-y-2">
                <Label htmlFor="seoTitle" className="text-sm font-medium text-gray-700">
                  SEO title
                </Label>
                <Input
                  id="seoTitle"
                  placeholder="Product title for search engines"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className="h-11 border-gray-300"
                />
                <p className="text-xs text-gray-500">
                  {seoTitle.length}/60 characters
                </p>
              </div>

              {/* SEO Description */}
              <div className="space-y-2">
                <Label htmlFor="seoDescription" className="text-sm font-medium text-gray-700">
                  SEO description
                </Label>
                <Textarea
                  id="seoDescription"
                  placeholder="Brief description for search results"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  className="border-gray-300 min-h-[100px]"
                />
                <p className="text-xs text-gray-500">
                  {seoDescription.length}/160 characters
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Search preview
                </Label>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-blue-600 text-lg truncate">
                    {seoTitle || title || "Product title"}
                  </p>
                  <p className="text-green-700 text-sm truncate">
                    yourstore.com/p/{slug || "product-url"}
                  </p>
                  <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                    {seoDescription || description || "Product description will appear here..."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[220px] bg-white border-t border-gray-200 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={isLoading || !title.trim()}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Preview
              </Button>

              <Button
                type="button"
                onClick={handleSaveChanges}
                disabled={isLoading || !title.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white px-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
