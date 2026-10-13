"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { forgetProduct } from "@/lib/products/forget-client"
import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { invalidateProductCache, invalidateExploreCache } from "@/hooks/use-cached-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
  ArrowLeft,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  X,
  Lock,
  GripVertical,
  HelpCircle,
} from "lucide-react"
import Link from "next/link"
import { CategoriesSelector } from "@/components/app/categories-selector"
import { getProductUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import type { Product, DigitalAsset } from "@/lib/types"
import { FileUpload } from "@/components/app/file-upload"
import { ImageUpload } from "@/components/app/image-upload"
import { DraggableGalleryUpload } from "@/components/app/draggable-gallery-upload"
import { DescriptionField as DescriptionRichEditor } from "@/components/store-builder/description-field"
import { getProductShareUrl } from "@/lib/url-helpers"
import { tt, msg } from "@/lib/i18n/text"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"

interface ProductEditFormProps {
  product: Product & {
    gallery_urls?: string[]
    whats_included?: string[]
    show_sales_badge?: boolean
    refund_policy_enabled?: boolean
    refund_policy_type?: string | null
    refund_policy_fine_print?: string | null
    refund_policy_updated_at?: string | null
  }
  assets: DigitalAsset[]
  creatorId: string
  creatorUsername: string
}

const REFUND_POLICY_OPTIONS = [
  { value: 'no_refunds', get label() { return tt("No refunds allowed") } },
  { value: '7_day', label: '7-day money back guarantee' },
  { value: '14_day', label: '14-day money back guarantee' },
  { value: '30_day', label: '30-day money back guarantee' },
  { value: '6_month', label: '6-month money back guarantee' },
]

const DEFAULT_WHATS_INCLUDED = [msg("Instant download access"), msg("All included files"), msg("Lifetime access")]

export function ProductEditForm({ product, assets: initialAssets, creatorId, creatorUsername }: ProductEditFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [assets, setAssets] = useState(initialAssets)

  const [title, setTitle] = useState(product.title)
  const [description, setDescription] = useState(product.description || "")
  const [price, setPrice] = useState((product.price_cents / 100).toString())
  const [compareAtPrice, setCompareAtPrice] = useState(
    product.compare_at_cents ? (product.compare_at_cents / 100).toString() : "",
  )
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(product.thumbnail_url)
  const [galleryUrls, setGalleryUrls] = useState<string[]>(product.gallery_urls || [])
  const [status, setStatus] = useState(product.status)

  const initialWhatsIncluded =
    product.whats_included && product.whats_included.length > 0 ? product.whats_included : DEFAULT_WHATS_INCLUDED.map((line) => tt(line))
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>(initialWhatsIncluded)
  const [newIncludeItem, setNewIncludeItem] = useState("")
  const [showSalesBadge, setShowSalesBadge] = useState(product.show_sales_badge !== false)

  // Refund policy state
  const [refundPolicyEnabled, setRefundPolicyEnabled] = useState(product.refund_policy_enabled || false)
  const [refundPolicyType, setRefundPolicyType] = useState(product.refund_policy_type || '7_day')
  const [refundPolicyFinePrint, setRefundPolicyFinePrint] = useState(product.refund_policy_fine_print || '')
  const [initialRefundPolicy, setInitialRefundPolicy] = useState({
    enabled: product.refund_policy_enabled || false,
    type: product.refund_policy_type || '7_day',
    finePrint: product.refund_policy_fine_print || ''
  })

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)

  useEffect(() => {
    const loadCategories = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("product_categories").select("category_id").eq("product_id", product.id)

      if (data && data.length > 0) {
        setCategoryId(data[0].category_id)
      }
      setIsLoadingCategories(false)
    }

    loadCategories()
  }, [product.id])

  const canPublish = !!thumbnailUrl && (product.type !== "digital" || assets.length > 0)

  // Fire-and-forget: trigger ZIP bundle generation when file count reaches threshold.
  // Runs in the background after save/publish so the seller never has to wait.
  const triggerBundleIfNeeded = (fileCount: number) => {
    if (product.type !== "digital" || fileCount < 6) return
    fetch("/api/v2/upload/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id }),
    }).catch(() => {}) // silent — buyer gets ZIP on next download if this fails
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      // Check if refund policy has changed
      const refundPolicyChanged =
        refundPolicyEnabled !== initialRefundPolicy.enabled ||
        refundPolicyType !== initialRefundPolicy.type ||
        refundPolicyFinePrint !== initialRefundPolicy.finePrint

      const { error: updateError } = await supabase
        .from("products")
        .update({
          title,
          description,
          price_cents: Math.round(Number.parseFloat(price) * 100),
          compare_at_cents: compareAtPrice ? Math.round(Number.parseFloat(compareAtPrice) * 100) : null,
          thumbnail_url: thumbnailUrl,
          gallery_urls: galleryUrls,
          status,
          whats_included: whatsIncluded,
          show_sales_badge: showSalesBadge,
          refund_policy_enabled: refundPolicyEnabled,
          refund_policy_type: refundPolicyEnabled ? refundPolicyType : null,
          refund_policy_fine_print: refundPolicyEnabled ? refundPolicyFinePrint || null : null,
          refund_policy_updated_at: refundPolicyChanged ? new Date().toISOString() : product.refund_policy_updated_at,
        })
        .eq("id", product.id)

      if (updateError) throw updateError

      await supabase.from("product_categories").delete().eq("product_id", product.id)

      if (categoryId) {
        await supabase.from("product_categories").insert({
          product_id: product.id,
          category_id: categoryId,
        })
      }

      // Regenerate ZIP bundle in the background if file count ≥ 6
      // (title may have changed, so always re-trigger to update zip filename/hash)
      triggerBundleIfNeeded(assets.length)

      // Invalidate SWR caches so explore/product pages show fresh data
      if (product.slug) invalidateProductCache(product.slug)
      invalidateExploreCache()

      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : tt("An error occurred"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(tt("Are you sure you want to delete this product? This action cannot be undone."))) return

    const supabase = createClient()
    const { error } = await supabase.from("products").delete().eq("id", product.id)

    if (error) {
      setError(error.message)
    } else {
      invalidateExploreCache()
      /* The row is gone; now so is every cached copy of it, and the block on
         their OnePage that named it (app/api/products/forget). */
      await forgetProduct(product.id, product.slug)
      router.push("/app/products")
    }
  }

  const togglePublish = async () => {
    if (status === "draft") {
      if (!thumbnailUrl) {
        setError(tt("Please upload a cover image before publishing"))
        return
      }
      if (product.type === "digital" && assets.length === 0) {
        setError(tt("Please upload at least one file before publishing a digital product"))
        return
      }
    }

    const newStatus = status === "published" ? "draft" : "published"
    setStatus(newStatus)

    const supabase = createClient()
    const { error: statusError } = await supabase.from("products").update({ status: newStatus }).eq("id", product.id)
    if (!statusError) announceChange({ product: product.id })

    // When publishing, ensure bundle is ready so first buyer gets instant ZIP download
    if (newStatus === "published") {
      triggerBundleIfNeeded(assets.length)
    }

    // Invalidate SWR caches on publish/unpublish
    if (product.slug) invalidateProductCache(product.slug)
    invalidateExploreCache()
    /* And the server's, so an unpublished product leaves the product page,
       the shop and the sitemap now rather than when their TTL runs out. */
    await forgetProduct(product.id, product.slug)

    router.refresh()
  }

  const copyProductLink = () => {
    /* The address the creator is about to send to someone: the apex one with
       their handle in it. `window.location.origin` is /app here, and `/p/` is
       the spelling that redirects. */
    navigator.clipboard.writeText(getProductShareUrl(creatorUsername, product.slug))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const addIncludeItem = () => {
    if (newIncludeItem.trim() && whatsIncluded.length < 10) {
      setWhatsIncluded([...whatsIncluded, newIncludeItem.trim()])
      setNewIncludeItem("")
    }
  }

  const removeIncludeItem = (index: number) => {
    if (index < DEFAULT_WHATS_INCLUDED.length) return
    setWhatsIncluded(whatsIncluded.filter((_, i) => i !== index))
  }

  const isDefaultItem = (index: number) => index < DEFAULT_WHATS_INCLUDED.length

  const updateIncludeItem = (index: number, value: string) => {
    const updated = [...whatsIncluded]
    updated[index] = value
    setWhatsIncluded(updated)
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8">
        <Link
          href="/app/products"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tt("Back to products")}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{product.title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={status === "published" ? "default" : "outline"} className="capitalize">
                {status}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {product.type}
              </Badge>
              {product.sales_count > 0 && (
                <span className="text-sm text-muted-foreground">{tt("{sales_count} sales", { sales_count: product.sales_count })}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {status === "published" && (
              <>
                <Button variant="outline" size="icon" onClick={copyProductLink} title={tt("Copy product link")}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" asChild title={tt("View product page")}>
                  <SmartLink href={getProductUrl(creatorUsername, product.slug)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </SmartLink>
                </Button>
              </>
            )}
            <Button
              variant={status === "published" ? "outline" : "default"}
              onClick={togglePublish}
              disabled={!canPublish && status === "draft"}
            >
              {status === "published" ? tt("Unpublish") : tt("Publish")}
            </Button>
          </div>
        </div>
      </div>

      {!thumbnailUrl && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{tt("Upload a cover image to publish this product")}</span>
        </div>
      )}
      {product.type === "digital" && assets.length === 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{tt("Upload at least one file to publish this digital product")}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("Cover Image")}</CardTitle>
            <CardDescription>{tt("Required. This is the main image customers will see.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ImageUpload
              bucket="product-images"
              folder={`${creatorId}/${product.id}`}
              value={thumbnailUrl || undefined}
              onChange={(url) => setThumbnailUrl(url)}
              aspectRatio="video"
              maxSizeMB={10}
            />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("Gallery Images")}</CardTitle>
            <CardDescription>{tt("Optional. Drag to reorder images.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DraggableGalleryUpload
              folder={`${creatorId}/${product.id}/gallery`}
              value={galleryUrls}
              onChange={setGalleryUrls}
              maxImages={8}
            />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("Product Details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{tt("Title")}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{tt("Description")}</Label>
              <DescriptionRichEditor
                value={description}
                onChange={setDescription}
                className="min-h-[200px]"
              />
            </div>
            <div className="grid gap-2">
              {isLoadingCategories ? (
                <div className="text-sm text-muted-foreground">{tt("Loading categories...")}</div>
              ) : (
                <CategoriesSelector selectedCategory={categoryId} onChange={setCategoryId} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("What's Included")}</CardTitle>
            <CardDescription>
              {tt("Customize the bullet points shown on the product page. Default items (with lock icon) cannot be deleted but can be edited.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={tt("e.g. 50+ premium templates")}
                value={newIncludeItem}
                onChange={(e) => setNewIncludeItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIncludeItem())}
              />
              <Button type="button" variant="outline" onClick={addIncludeItem} disabled={whatsIncluded.length >= 10}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {whatsIncluded.length > 0 && (
              <ul className="space-y-2">
                {whatsIncluded.map((item, index) => (
                  <li key={index} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 flex-1">
                      {isDefaultItem(index) ? (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
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

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("Pricing")}</CardTitle>
            <CardDescription>{tt("Set your price and optional sale pricing")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="price">{tt("Price ({currency})", { currency: SHOP_CURRENCY })}</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="compareAtPrice">{tt("Compare at price (optional)")}</Label>
                <Input
                  id="compareAtPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={tt("Original price for sales")}
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">{tt("Show sales badge")}</p>
                <p className="text-sm text-muted-foreground">{tt("Display number of sales on product page")}</p>
              </div>
              <Switch checked={showSalesBadge} onCheckedChange={setShowSalesBadge} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{tt("Refund Policy")}</CardTitle>
            <CardDescription>{tt("Set your refund policy to build customer trust")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">{tt("Enable refund policy")}</p>
                <p className="text-sm text-muted-foreground">{tt("Show refund policy on product page")}</p>
              </div>
              <Switch checked={refundPolicyEnabled} onCheckedChange={setRefundPolicyEnabled} />
            </div>

            {refundPolicyEnabled && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="refundPolicyType">{tt("Refund policy")}</Label>
                  <Select value={refundPolicyType} onValueChange={setRefundPolicyType}>
                    <SelectTrigger id="refundPolicyType">
                      <SelectValue placeholder={tt("Select a refund policy")} />
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
                    <Label htmlFor="refundFinePrint">{tt("Fine print (optional)")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{tt("Extra conditions or details about refunds. Shown to customers in a popup when they click on the refund policy.")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    id="refundFinePrint"
                    value={refundPolicyFinePrint}
                    onChange={(e) => setRefundPolicyFinePrint(e.target.value)}
                    placeholder={tt("e.g. Refunds are only available for unused products. Contact support within the refund period.")}
                    rows={3}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {product.type === "digital" && (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {tt("Digital Files")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {tt("If multiple files, upload ZIP.")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>{tt("Upload the files customers will receive after purchase (max 1GB each)")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload
                productId={product.id}
                existingFiles={assets.map((a) => ({
                  id: a.id,
                  file_name: a.file_name,
                  file_path: a.file_path,
                  file_size: a.file_size || 0,
                }))}
                onUploadComplete={(files) =>
                  setAssets(
                    files.map((f) => ({
                      id: f.id || "",
                      product_id: product.id,
                      file_name: f.file_name,
                      file_path: f.file_path,
                      file_size: f.file_size,
                      created_at: new Date().toISOString(),
                    })),
                  )
                }
              />
            </CardContent>
          </Card>
        )}

        {error && <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

        <div className="flex justify-between">
          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tt("Saving...")}
                </>
              ) : (
                tt("Save changes")
              )}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/app/products">{tt("Cancel")}</Link>
            </Button>
          </div>
          <Button type="button" variant="destructive" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {tt("Delete")}
          </Button>
        </div>
      </form>
    </div>
  )
}
