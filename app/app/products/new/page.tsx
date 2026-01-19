"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { AlertTriangle, HelpCircle } from "lucide-react"
import Link from "next/link"
import { ImageUpload } from "@/components/app/image-upload"
import { DraggableGalleryUpload } from "@/components/app/draggable-gallery-upload"
import { CategoriesSelector } from "@/components/app/categories-selector"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Package,
  GraduationCap,
  Plus,
  X,
  GripVertical,
  Upload,
  FileIcon,
  Loader2,
} from "lucide-react"

const STEPS = [
  { id: 1, name: "Basics", description: "Name and type" },
  { id: 2, name: "Content", description: "Description and details" },
  { id: 3, name: "Media", description: "Images and files" },
  { id: 4, name: "Publish", description: "Review and go live" },
]

const DEFAULT_WHATS_INCLUDED = ["Instant download access", "All included files", "Lifetime access"]

const REFUND_POLICY_OPTIONS = [
  { value: 'no_refunds', label: 'No refunds allowed' },
  { value: '7_day', label: '7-day money back guarantee' },
  { value: '14_day', label: '14-day money back guarantee' },
  { value: '30_day', label: '30-day money back guarantee' },
  { value: '6_month', label: '6-month money back guarantee' },
]

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
}

export default function NewProductWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [creator, setCreator] = useState<any>(null)
  const [showStripeWarning, setShowStripeWarning] = useState(false)

  // Step 1: Basics
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [productType, setProductType] = useState<"digital" | "course">("digital")
  const [categoryId, setCategoryId] = useState<string | null>(null)

  // Step 2: Content
  const [description, setDescription] = useState("")
  const [benefits, setBenefits] = useState<string[]>([])
  const [newBenefit, setNewBenefit] = useState("")
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>([...DEFAULT_WHATS_INCLUDED])
  const [newIncludeItem, setNewIncludeItem] = useState("")
  const [showSalesBadge, setShowSalesBadge] = useState(true)

  // Refund policy (Step 2)
  const [refundPolicyEnabled, setRefundPolicyEnabled] = useState(false)
  const [refundPolicyType, setRefundPolicyType] = useState('7_day')
  const [refundPolicyFinePrint, setRefundPolicyFinePrint] = useState('')

  // Step 3: Media & Pricing
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [price, setPrice] = useState("")
  const [compareAtPrice, setCompareAtPrice] = useState("")
  const [digitalFiles, setDigitalFiles] = useState<UploadedFile[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

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
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setSlug(generatedSlug)
  }, [title])

  // Create draft product after step 1
  const createDraftProduct = async () => {
    if (!creatorId || productId) return null

    const supabase = createClient()

    // Check slug uniqueness
    const { data: existing } = await supabase.from("products").select("id").eq("slug", slug).single()

    let finalSlug = slug
    if (existing) {
      finalSlug = `${slug}-${Math.random().toString(36).slice(2, 7)}`
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        creator_id: creatorId,
        type: productType,
        title,
        slug: finalSlug,
        status: "draft",
        price_cents: 0,
        show_sales_badge: showSalesBadge,
        whats_included: whatsIncluded,
        refund_policy_enabled: refundPolicyEnabled,
        refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
        refund_policy_fine_print: refundPolicyEnabled ? refundPolicyFinePrint || null : null,
        refund_policy_updated_at: refundPolicyEnabled ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return null
    }

    if (categoryId) {
      await supabase.from("product_categories").insert({
        product_id: product.id,
        category_id: categoryId,
      })
    }

    setProductId(product.id)
    return product.id
  }

  // Auto-save changes
  const saveProgress = async () => {
    if (!productId) return

    setIsSaving(true)
    const supabase = createClient()

    const benefitsText = benefits.length > 0 ? `\n\nWhat you'll get:\n${benefits.map((b) => `- ${b}`).join("\n")}` : ""

    await supabase
      .from("products")
      .update({
        title,
        description: description + benefitsText,
        price_cents: Math.round(Number.parseFloat(price || "0") * 100),
        compare_at_cents: compareAtPrice ? Math.round(Number.parseFloat(compareAtPrice) * 100) : null,
        thumbnail_url: thumbnailUrl,
        gallery_urls: galleryUrls.length > 0 ? galleryUrls : null,
        whats_included: whatsIncluded,
        show_sales_badge: showSalesBadge,
        refund_policy_enabled: refundPolicyEnabled,
        refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
        refund_policy_fine_print: refundPolicyEnabled ? refundPolicyFinePrint || null : null,
        refund_policy_updated_at: refundPolicyEnabled ? new Date().toISOString() : null,
      })
      .eq("id", productId)

    await supabase.from("product_categories").delete().eq("product_id", productId)

    if (categoryId) {
      await supabase.from("product_categories").insert({
        product_id: productId,
        category_id: categoryId,
      })
    }

    setIsSaving(false)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !productId) return

    setUploadingFiles(true)
    setUploadProgress(0)
    setError(null)

    const supabase = createClient()
    const newFiles: UploadedFile[] = []
    const totalFiles = files.length
    let completed = 0

    try {
      for (const file of Array.from(files)) {
        if (file.size > 1024 * 1024 * 1024) {
          setError(`File "${file.name}" exceeds 1GB limit`)
          continue
        }

        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const filePath = `products/${productId}/${timestamp}_${safeName}`

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
            product_id: productId,
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

        completed++
        setUploadProgress(Math.round((completed / totalFiles) * 100))
      }

      setDigitalFiles([...digitalFiles, ...newFiles])
    } finally {
      setUploadingFiles(false)
      setUploadProgress(0)
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
    setDigitalFiles(digitalFiles.filter((f) => f.id !== file.id))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleNext = async () => {
    setError(null)

    if (currentStep === 1) {
      if (!title.trim()) {
        setError("Please enter a product name")
        return
      }
      setIsLoading(true)
      await createDraftProduct()
      setIsLoading(false)
    }

    if (currentStep === 2 || currentStep === 3) {
      await saveProgress()
    }

    setCurrentStep((prev) => Math.min(prev + 1, 4))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const addBenefit = () => {
    if (newBenefit.trim() && benefits.length < 8) {
      setBenefits([...benefits, newBenefit.trim()])
      setNewBenefit("")
    }
  }

  const removeBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index))
  }

  const addIncludeItem = () => {
    if (newIncludeItem.trim() && whatsIncluded.length < 10) {
      setWhatsIncluded([...whatsIncluded, newIncludeItem.trim()])
      setNewIncludeItem("")
    }
  }

  const removeIncludeItem = (index: number) => {
    // Don't allow removing default items
    if (index < DEFAULT_WHATS_INCLUDED.length) return
    setWhatsIncluded(whatsIncluded.filter((_, i) => i !== index))
  }

  const isDefaultItem = (index: number) => index < DEFAULT_WHATS_INCLUDED.length

  const updateIncludeItem = (index: number, value: string) => {
    const updated = [...whatsIncluded]
    updated[index] = value
    setWhatsIncluded(updated)
  }

  const canPublish = !!thumbnailUrl && (productType !== "digital" || digitalFiles.length > 0)

  const handlePublish = async () => {
    if (!productId) return

    if (!thumbnailUrl) {
      setError("Please upload a cover image before publishing")
      return
    }

    if (productType === "digital" && digitalFiles.length === 0) {
      setError("Please upload at least one digital file before publishing")
      return
    }

    const priceValue = Number.parseFloat(price || "0")
    if (priceValue > 0 && (!creator?.stripe_account_id || creator?.stripe_onboarding_status !== "connected")) {
      setShowStripeWarning(true)
      setError("You must connect Stripe to sell paid products. Go to Settings > Payments to connect.")
      return
    }

    setIsLoading(true)
    await saveProgress()

    const supabase = createClient()
    const { error } = await supabase.from("products").update({ status: "published" }).eq("id", productId)

    if (error) {
      setError(error.message)
      setIsLoading(false)
      return
    }

    router.push(`/app/products/${productId}?published=true`)
  }

  const progressPercent = (currentStep / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/app/products"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to products
          </Link>
          {isSaving && <span className="text-sm text-muted-foreground">Saving...</span>}
        </div>
      </div>

      {/* Progress */}
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-foreground">Create New Product</h1>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of {STEPS.length}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="mt-4 flex justify-between">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex flex-col items-center ${step.id <= currentStep ? "text-foreground" : "text-muted-foreground"}`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                    step.id < currentStep
                      ? "border-green-500 bg-green-500 text-white"
                      : step.id === currentStep
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {step.id < currentStep ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <span className="mt-2 hidden text-xs sm:block">{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Step 1: Basics */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>What are you creating?</CardTitle>
                <CardDescription>Choose the type of product you want to sell</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={productType}
                  onValueChange={(v) => setProductType(v as typeof productType)}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <label
                    className={`flex cursor-pointer flex-col items-center rounded-lg border-2 p-6 transition-all ${productType === "digital" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                  >
                    <RadioGroupItem value="digital" className="sr-only" />
                    <Package
                      className={`h-8 w-8 ${productType === "digital" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="mt-3 font-medium">Digital Product</span>
                    <span className="mt-1 text-center text-xs text-muted-foreground">Templates, ebooks, files</span>
                  </label>
                  <label
                    className={`flex cursor-pointer flex-col items-center rounded-lg border-2 p-6 transition-all ${productType === "course" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                  >
                    <RadioGroupItem value="course" className="sr-only" />
                    <GraduationCap
                      className={`h-8 w-8 ${productType === "course" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="mt-3 font-medium">Online Course</span>
                    <span className="mt-1 text-center text-xs text-muted-foreground">Video lessons, modules</span>
                  </label>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Product Name *</Label>
                  <Input
                    id="title"
                    placeholder="e.g. Social Media Template Pack"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">/p/</span>
                    <Input
                      id="slug"
                      placeholder="my-product"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <CategoriesSelector selectedCategory={categoryId} onChange={setCategoryId} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Display Settings</CardTitle>
                <CardDescription>Configure how your product appears to buyers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">Show sales count badge</p>
                    <p className="text-sm text-muted-foreground">Display number of sales on product page</p>
                  </div>
                  <Switch checked={showSalesBadge} onCheckedChange={setShowSalesBadge} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Content */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
                <CardDescription>Tell potential customers what they&apos;re getting</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Describe your product in detail. What problems does it solve? Who is it for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Benefits</CardTitle>
                <CardDescription>List the key benefits (up to 8) - stored as plain text</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 50+ ready-to-use templates"
                    value={newBenefit}
                    onChange={(e) => setNewBenefit(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenefit())}
                  />
                  <Button type="button" variant="outline" onClick={addBenefit} disabled={benefits.length >= 8}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {benefits.length > 0 && (
                  <ul className="space-y-2">
                    {benefits.map((benefit, index) => (
                      <li key={index} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm">{benefit}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeBenefit(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>What&apos;s Included</CardTitle>
                <CardDescription>
                  Customize the bullet points shown on the product page. Default items cannot be deleted but can be
                  edited.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 50+ premium templates"
                    value={newIncludeItem}
                    onChange={(e) => setNewIncludeItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIncludeItem())}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addIncludeItem}
                    disabled={whatsIncluded.length >= 10}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {whatsIncluded.length > 0 && (
                  <ul className="space-y-2">
                    {whatsIncluded.map((item, index) => (
                      <li key={index} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 flex-1">
                          {isDefaultItem(index) ? (
                            <X className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Check className="h-4 w-4 text-green-600" />
                          <Input
                            value={item}
                            onChange={(e) => updateIncludeItem(index, e.target.value)}
                            className="border-0 p-0 h-auto text-sm focus-visible:ring-0"
                          />
                        </div>
                        {!isDefaultItem(index) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeIncludeItem(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Refund Policy</CardTitle>
                <CardDescription>Set your refund policy to build customer trust</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">Enable refund policy</p>
                    <p className="text-sm text-muted-foreground">Show refund policy on product page</p>
                  </div>
                  <Switch checked={refundPolicyEnabled} onCheckedChange={setRefundPolicyEnabled} />
                </div>

                {refundPolicyEnabled && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="refundPolicyType">Refund policy</Label>
                      <Select value={refundPolicyType} onValueChange={setRefundPolicyType}>
                        <SelectTrigger id="refundPolicyType">
                          <SelectValue placeholder="Select a refund policy" />
                        </SelectTrigger>
                        <SelectContent>
                          {REFUND_POLICY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="refundFinePrint">Fine print (optional)</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Extra conditions or details about refunds. Shown to customers in a popup when they click on the refund policy.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Textarea
                        id="refundFinePrint"
                        value={refundPolicyFinePrint}
                        onChange={(e) => setRefundPolicyFinePrint(e.target.value)}
                        placeholder="e.g. Refunds are only available for unused products. Contact support within the refund period."
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Media & Pricing */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cover Image *</CardTitle>
                <CardDescription>Required to publish. This is the main image customers will see.</CardDescription>
              </CardHeader>
              <CardContent>
                <ImageUpload
                  bucket="product-images"
                  folder={`${creatorId}/${productId || "temp"}`}
                  value={thumbnailUrl || undefined}
                  onChange={(url) => setThumbnailUrl(url)}
                  aspectRatio="video"
                  maxSizeMB={10}
                />
              </CardContent>
            </Card>

            {productType === "digital" && (
              <Card>
                <CardHeader>
                  <CardTitle>Digital Files *</CardTitle>
                  <CardDescription>
                    Upload the files customers will receive after purchase (max 1GB each)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Upload zone */}
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                      uploadingFiles ? "pointer-events-none opacity-50" : "hover:border-primary/50"
                    }`}
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingFiles || !productId}
                    />
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      {uploadingFiles ? "Uploading..." : "Click to upload or drag and drop"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Max file size: 1GB</p>
                  </div>

                  {/* Upload progress */}
                  {uploadingFiles && (
                    <div className="space-y-2">
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-center text-sm text-muted-foreground">{uploadProgress}% uploaded</p>
                    </div>
                  )}

                  {/* Uploaded files list */}
                  {digitalFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Uploaded files</p>
                      {digitalFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <FileIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{file.file_name}</p>
                              <p className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-500" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteFile(file)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warning if no files */}
                  {digitalFiles.length === 0 && !uploadingFiles && (
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Upload at least one file to publish</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Gallery Images</CardTitle>
                <CardDescription>Optional. Drag to reorder images. First image appears after cover.</CardDescription>
              </CardHeader>
              <CardContent>
                <DraggableGalleryUpload
                  folder={`${creatorId}/${productId || "temp"}/gallery`}
                  value={galleryUrls}
                  onChange={setGalleryUrls}
                  maxImages={8}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="price">Price (USD) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="29.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="compareAtPrice">Compare at price</Label>
                    <Input
                      id="compareAtPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="49.00 (optional)"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Review & Publish */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review Your Product</CardTitle>
                <CardDescription>Make sure everything looks good before publishing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Product Name</p>
                    <p className="font-medium">{title}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <Badge variant="secondary" className="mt-1 capitalize">
                      {productType}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Price</p>
                    <p className="font-medium">{price ? `$${price}` : "Free"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cover Image</p>
                    <p className="font-medium">{thumbnailUrl ? "Uploaded" : "Not uploaded"}</p>
                  </div>
                  {productType === "digital" && (
                    <div>
                      <p className="text-sm text-muted-foreground">Digital Files</p>
                      <p className="font-medium">{digitalFiles.length} file(s) uploaded</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Show Sales Badge</p>
                    <p className="font-medium">{showSalesBadge ? "Yes" : "No"}</p>
                  </div>
                </div>

                {!canPublish && (
                  <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-yellow-700 dark:text-yellow-400">
                    <p className="font-medium">Before you can publish:</p>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {!thumbnailUrl && <li>Upload a cover image</li>}
                      {productType === "digital" && digitalFiles.length === 0 && (
                        <li>Upload at least one digital file</li>
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation */}
        {error && <div className="my-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

        {/* Stripe warning banner */}
        {showStripeWarning && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Connect Stripe to sell paid products.</strong>{" "}
              <a href="/app/settings/payments" className="underline">
                Go to Settings → Payments
              </a>
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handlePublish} disabled={isLoading || !canPublish}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Publish Product
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
