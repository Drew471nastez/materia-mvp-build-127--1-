"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  X,
  GripVertical,
  Pencil,
  Trash2,
  Package,
  Check,
  Upload,
  FileIcon,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProductVariant {
  id?: string
  name: string
  description?: string
  price_cents: number
  compare_at_cents?: number | null
  position: number
  is_default: boolean
  files?: VariantFile[]
}

export interface VariantFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
}

interface ProductVariantsEditorProps {
  productId: string | null
  variants: ProductVariant[]
  onChange: (variants: ProductVariant[]) => void
  disabled?: boolean
  showFileUpload?: boolean
}

export function ProductVariantsEditor({
  productId,
  variants,
  onChange,
  disabled = false,
  showFileUpload = true,
}: ProductVariantsEditorProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null)
  const [deleteVariant, setDeleteVariant] = useState<ProductVariant | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [compareAtPrice, setCompareAtPrice] = useState("")
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [variantFiles, setVariantFiles] = useState<VariantFile[]>([])

  const resetForm = () => {
    setName("")
    setDescription("")
    setPrice("")
    setCompareAtPrice("")
    setVariantFiles([])
    setEditingVariant(null)
  }

  const openAddDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (variant: ProductVariant) => {
    setEditingVariant(variant)
    setName(variant.name)
    setDescription(variant.description || "")
    setPrice((variant.price_cents / 100).toFixed(2))
    setCompareAtPrice(variant.compare_at_cents ? (variant.compare_at_cents / 100).toFixed(2) : "")
    setVariantFiles(variant.files || [])
    setIsDialogOpen(true)
  }

  const handleSaveVariant = () => {
    if (!name.trim()) return

    const priceCents = Math.round(parseFloat(price || "0") * 100)
    const compareAtCents = compareAtPrice ? Math.round(parseFloat(compareAtPrice) * 100) : null

    if (editingVariant) {
      // Update existing variant
      const updatedVariants = variants.map((v) =>
        v === editingVariant
          ? {
              ...v,
              name: name.trim(),
              description: description.trim() || undefined,
              price_cents: priceCents,
              compare_at_cents: compareAtCents,
              files: variantFiles,
            }
          : v
      )
      onChange(updatedVariants)
    } else {
      // Add new variant
      const newVariant: ProductVariant = {
        name: name.trim(),
        description: description.trim() || undefined,
        price_cents: priceCents,
        compare_at_cents: compareAtCents,
        position: variants.length,
        is_default: variants.length === 0, // First variant is default
        files: variantFiles,
      }
      onChange([...variants, newVariant])
    }

    setIsDialogOpen(false)
    resetForm()
  }

  const handleDeleteVariant = (variant: ProductVariant) => {
    const filteredVariants = variants.filter((v) => v !== variant)

    // Recalculate positions and ensure first variant is default
    const updatedVariants = filteredVariants.map((v, idx) => ({
      ...v,
      position: idx,
      is_default: idx === 0,
    }))

    onChange(updatedVariants)
    setDeleteVariant(null)
  }

  const moveVariant = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === variants.length - 1)
    ) {
      return
    }

    const newVariants = [...variants]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    // Swap positions
    ;[newVariants[index], newVariants[targetIndex]] = [newVariants[targetIndex], newVariants[index]]

    // Update positions and default status
    const updatedVariants = newVariants.map((v, idx) => ({
      ...v,
      position: idx,
      is_default: idx === 0,
    }))

    onChange(updatedVariants)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !productId) return

    setUploadingFiles(true)
    const supabase = createClient()
    const newFiles: VariantFile[] = []

    try {
      for (const file of Array.from(files)) {
        if (file.size > 1024 * 1024 * 1024) {
          continue // Skip files over 1GB
        }

        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const filePath = `products/${productId}/variants/${timestamp}_${safeName}`

        const { error: uploadError } = await supabase.storage
          .from("product-files")
          .upload(filePath, file, { cacheControl: "3600", upsert: false })

        if (!uploadError) {
          newFiles.push({
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
          })
        }
      }

      setVariantFiles([...variantFiles, ...newFiles])
    } finally {
      setUploadingFiles(false)
    }
  }

  const removeVariantFile = (file: VariantFile) => {
    setVariantFiles(variantFiles.filter((f) => f !== file))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Variants
            </CardTitle>
            <CardDescription className="mt-1">
              Add different versions or tiers of your product with unique pricing
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openAddDialog}
                disabled={disabled}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Variant
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingVariant ? "Edit Variant" : "Add Variant"}
                </DialogTitle>
                <DialogDescription>
                  {editingVariant
                    ? "Update the details of this variant"
                    : "Create a new variant for your product with different pricing or files"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="variant-name">Variant Name *</Label>
                  <Input
                    id="variant-name"
                    placeholder="e.g. Basic, Pro, Premium"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="variant-description">Description</Label>
                  <Textarea
                    id="variant-description"
                    placeholder="What's included in this variant..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="variant-price">Price (USD) *</Label>
                    <Input
                      id="variant-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="29.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="variant-compare-price">Compare at price</Label>
                    <Input
                      id="variant-compare-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="49.00"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                    />
                  </div>
                </div>

                {showFileUpload && productId && (
                  <div className="space-y-3">
                    <Label>Digital Files for this Variant</Label>
                    <div
                      className={cn(
                        "relative rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
                        uploadingFiles ? "pointer-events-none opacity-50" : "hover:border-primary/50"
                      )}
                      onClick={() => document.getElementById("variant-file-input")?.click()}
                    >
                      <input
                        id="variant-file-input"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e.target.files)}
                        disabled={uploadingFiles}
                      />
                      {uploadingFiles ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {uploadingFiles ? "Uploading..." : "Click to upload files"}
                      </p>
                    </div>

                    {variantFiles.length > 0 && (
                      <div className="space-y-2">
                        {variantFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg border border-border p-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{file.file_name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => removeVariantFile(file)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveVariant} disabled={!name.trim()}>
                  {editingVariant ? "Save Changes" : "Add Variant"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No variants added yet. Add variants to offer different versions or pricing tiers.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openAddDialog}
              disabled={disabled}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Variant
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {variants.map((variant, index) => (
              <div
                key={variant.id || index}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                  variant.is_default && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveVariant(index, 'up')}
                    disabled={index === 0 || disabled}
                  >
                    <GripVertical className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveVariant(index, 'down')}
                    disabled={index === variants.length - 1 || disabled}
                  >
                    <GripVertical className="h-4 w-4 rotate-90" />
                  </Button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{variant.name}</span>
                    {variant.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="mr-1 h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  {variant.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {variant.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {formatPrice(variant.price_cents)}
                    </span>
                    {variant.compare_at_cents && variant.compare_at_cents > variant.price_cents && (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatPrice(variant.compare_at_cents)}
                      </span>
                    )}
                  </div>
                  {variant.files && variant.files.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <FileIcon className="h-3 w-3" />
                      <span>{variant.files.length} file(s)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(variant)}
                    disabled={disabled}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteVariant(variant)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <p className="text-xs text-muted-foreground mt-2">
              The first variant is automatically selected as the default option for buyers.
            </p>
          </div>
        )}
      </CardContent>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteVariant} onOpenChange={(open) => !open && setDeleteVariant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteVariant?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVariant && handleDeleteVariant(deleteVariant)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
