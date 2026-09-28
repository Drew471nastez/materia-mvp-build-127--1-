"use client"

import { useOnePage } from "@/lib/onepage/context"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import type { OnePageBlock, OnePageBlockType, LinkButtonBlockData, TextBlockData, EmailCaptureBlockData, ImageBlockData, DividerBlockData, HeaderBlockData, EmailCaptureButtonPreset } from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useRef, useEffect } from "react"
// Custom Toggle Component with theme-style design
function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="theme-checkbox"
    />
  )
}
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Plus,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link,
  Type,
  Image as ImageIcon,
  Minus,
  Mail,
  User,
  Eye,
  EyeOff,
  ChevronRight,
  Upload,
  FileText,
  Loader2,
  X,
  Check,
} from "lucide-react"

const blockTypes: { type: OnePageBlockType; label: string; icon: typeof Link }[] = [
  { type: "link_button", label: "Link Button", icon: Link },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "email_capture", label: "Email Capture", icon: Mail },
  { type: "header", label: "Header", icon: User },
]

// Button text presets for email capture
const buttonPresets: { id: EmailCaptureButtonPreset; label: string }[] = [
  { id: 'subscribe', label: 'Subscribe' },
  { id: 'join', label: 'Join Now' },
  { id: 'get_access', label: 'Get Access' },
  { id: 'download', label: 'Download' },
  { id: 'sign_up', label: 'Sign Up' },
  { id: 'unlock', label: 'Unlock Now' },
  { id: 'custom', label: 'Custom...' },
]

export function BlocksSection() {
  const { onepage, selectedBlockId, setSelectedBlockId, addBlock, removeBlock, moveBlockUp, moveBlockDown, toggleBlockEnabled } = useOnePage()

  if (!onepage) return null

  const { draft_blocks } = onepage
  const sortedBlocks = [...draft_blocks].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Blocks</h2>
          <p className="text-sm text-muted-foreground">
            Add and arrange your content
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {blockTypes.map(({ type, label, icon: Icon }) => (
              <DropdownMenuItem key={type} onClick={() => addBlock(type)}>
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        {sortedBlocks.map((block, index) => (
          <div
            key={block.id}
            className={cn(
              "border rounded-lg transition-all",
              selectedBlockId === block.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              !block.enabled && "opacity-50"
            )}
          >
            <div
              className="flex items-center gap-2 p-3 cursor-pointer"
              onClick={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {getBlockLabel(block)}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {block.type.replace("_", " ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); toggleBlockEnabled(block.id) }}
                >
                  {block.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); moveBlockUp(block.id) }}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); moveBlockDown(block.id) }}
                  disabled={index === sortedBlocks.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeBlock(block.id) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedBlockId === block.id && (
              <div className="border-t p-4">
                <BlockEditor block={block} />
              </div>
            )}
          </div>
        ))}

        {sortedBlocks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No blocks yet</p>
            <p className="text-sm">Click "Add Block" to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

function getBlockLabel(block: OnePageBlock): string {
  switch (block.type) {
    case "link_button":
      return (block.data as LinkButtonBlockData).label || "Link Button"
    case "text":
      return (block.data as TextBlockData).content?.slice(0, 30) || "Text"
    case "email_capture":
      return (block.data as EmailCaptureBlockData).headline || "Email Capture"
    case "header":
      return "Header"
    case "image":
      return "Image"
    case "divider":
      return "Divider"
    default:
      return block.type
  }
}

function BlockEditor({ block }: { block: OnePageBlock }) {
  const { updateBlock } = useOnePage()
  const [showButtonTextMenu, setShowButtonTextMenu] = useState(false)
  const [showImagePickerModal, setShowImagePickerModal] = useState(false)
  const [showFilePickerModal, setShowFilePickerModal] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const buttonTextMenuRef = useRef<HTMLDivElement>(null)

  // Close button text menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonTextMenuRef.current && !buttonTextMenuRef.current.contains(e.target as Node)) {
        setShowButtonTextMenu(false)
      }
    }
    if (showButtonTextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showButtonTextMenu])

  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    updateBlock(block.id, { data: { ...block.data, ...updates } })
  }

  // Handle image upload for email capture product image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/onepage/seller-avatar', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const { url } = await response.json()
        updateData({ product_image: url })
        setShowImagePickerModal(false)
      }
    } catch (error) {
      console.error('Image upload failed:', error)
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  // Handle file upload for digital product — uses signed URL for direct-to-Supabase upload
  // This bypasses the server for the file payload, so large files (100MB+) won't timeout
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileUploading(true)
    setUploadProgress(0)
    setUploadError(null)

    try {
      // Step 1: Get a signed upload URL from our API (small JSON request)
      const signedRes = await fetch('/api/onepage/signed-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          folder: 'digital',
        }),
      })

      if (!signedRes.ok) {
        const err = await signedRes.json().catch(() => ({ error: 'Failed to get upload URL' }))
        throw new Error(err.error || 'Failed to get upload URL')
      }

      const { signedUrl, publicUrl, path, bucket } = await signedRes.json()

      // Step 2: Upload file directly to Supabase Storage using XHR for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(pct)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            let errMsg = `Upload failed (status ${xhr.status})`
            try {
              const body = JSON.parse(xhr.responseText)
              errMsg = body.error || body.message || body.statusCode || errMsg
            } catch {}
            reject(new Error(errMsg))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')))
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')))

        xhr.open('PUT', signedUrl)
        // Supabase API gateway requires apikey header on all requests
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (anonKey) {
          xhr.setRequestHeader('apikey', anonKey)
          xhr.setRequestHeader('Authorization', `Bearer ${anonKey}`)
        }
        xhr.setRequestHeader('x-upsert', 'true')
        // Send as FormData matching Supabase JS client internals
        const formData = new FormData()
        formData.append('cacheControl', '31536000')
        formData.append('', file, file.name)
        xhr.timeout = 600000 // 10 minute timeout for large files
        xhr.send(formData)
      })

      /* The bytes are there now, so the server reads them and checks them
         (lib/storage/confirm-upload.ts). Nothing here waits for it. */
      confirmUpload(bucket || 'lead-form-files-v2', path)

      // Step 3: Update block data with the public URL
      updateData({
        digital_product_file_url: publicUrl,
        digital_product_title: file.name.replace(/\.[^/.]+$/, ""),
      })
      setShowFilePickerModal(false)
    } catch (error) {
      console.error('File upload failed:', error)
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setFileUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  switch (block.type) {
    case "link_button": {
      const data = block.data as LinkButtonBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Button Text</Label>
            <Input
              value={data.label}
              onChange={(e) => updateData({ label: e.target.value })}
              placeholder="My Link"
            />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={data.url}
              onChange={(e) => updateData({ url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      )
    }

    case "text": {
      const data = block.data as TextBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Text Content</Label>
            <Textarea
              value={data.content}
              onChange={(e) => updateData({ content: e.target.value })}
              placeholder="Enter your text..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Alignment</Label>
            <Select
              value={data.alignment}
              onValueChange={(value: "left" | "center" | "right") => updateData({ alignment: value })}
            >
              <SelectTrigger>
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

    case "image": {
      const data = block.data as ImageBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input
              value={data.image_url}
              onChange={(e) => updateData({ image_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Alt Text</Label>
            <Input
              value={data.alt_text || ""}
              onChange={(e) => updateData({ alt_text: e.target.value })}
              placeholder="Describe the image"
            />
          </div>
          <div className="space-y-2">
            <Label>Link URL (optional)</Label>
            <Input
              value={data.link_url || ""}
              onChange={(e) => updateData({ link_url: e.target.value || null })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <Select
              value={data.aspect_ratio || "auto"}
              onValueChange={(value: "auto" | "square" | "video" | "wide") => updateData({ aspect_ratio: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="square">Square (1:1)</SelectItem>
                <SelectItem value="video">Video (16:9)</SelectItem>
                <SelectItem value="wide">Wide (2:1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )
    }

    case "divider": {
      const data = block.data as DividerBlockData
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Style</Label>
            <Select
              value={data.style}
              onValueChange={(value: "line" | "space" | "dots") => updateData({ style: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="space">Space</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="dots">Dots</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Height: {data.height}px</Label>
            <Slider
              value={[data.height]}
              onValueChange={([value]) => updateData({ height: value })}
              min={8}
              max={64}
              step={4}
            />
          </div>
        </div>
      )
    }

    case "email_capture": {
      const data = block.data as EmailCaptureBlockData

      // Get current button text for display
      const getCurrentButtonText = () => {
        if (data.button_preset === 'custom' && data.custom_button_text) {
          return data.custom_button_text
        }
        const preset = buttonPresets.find(p => p.id === (data.button_preset || 'subscribe'))
        return preset?.label || 'Subscribe'
      }

      // Check if button text is short enough to fit on same row
      const buttonText = getCurrentButtonText()
      const isShortButtonText = buttonText.length <= 12

      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Headline</Label>
            <Input
              value={data.headline}
              onChange={(e) => updateData({ headline: e.target.value })}
              placeholder="Join my newsletter"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={data.description || ""}
              onChange={(e) => updateData({ description: e.target.value })}
              placeholder="Get updates and exclusive content"
            />
          </div>
          <div className="space-y-2">
            <Label>Input Placeholder</Label>
            <Input
              value={data.placeholder}
              onChange={(e) => updateData({ placeholder: e.target.value })}
              placeholder="Enter your email"
            />
          </div>

          {/* Button Text Selector */}
          <div className="space-y-2">
            <Label>Button Text</Label>
            <div className="relative" ref={buttonTextMenuRef}>
              <button
                type="button"
                onClick={() => setShowButtonTextMenu(!showButtonTextMenu)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-md text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="truncate">{getCurrentButtonText()}</span>
                <ChevronRight className={cn(
                  "h-4 w-4 text-gray-400 transition-transform",
                  showButtonTextMenu && "rotate-90"
                )} />
              </button>

              {/* Button text dropdown menu */}
              {showButtonTextMenu && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  {buttonPresets.map((preset) => {
                    const isSelected = data.button_preset === preset.id || 
                      (!data.button_preset && preset.id === 'subscribe')
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (preset.id === 'custom') {
                            updateData({ 
                              button_preset: 'custom',
                              custom_button_text: data.custom_button_text || 'Get it Now'
                            })
                          } else {
                            updateData({ 
                              button_preset: preset.id,
                              button_text: preset.label
                            })
                          }
                          if (preset.id !== 'custom') {
                            setShowButtonTextMenu(false)
                          }
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between",
                          isSelected
                            ? "bg-violet-50 text-violet-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <span>{preset.label}</span>
                        {isSelected && <Check className="h-4 w-4" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Custom button text input */}
            {data.button_preset === 'custom' && (
              <Input
                value={data.custom_button_text || ""}
                onChange={(e) => updateData({ custom_button_text: e.target.value })}
                placeholder="Enter custom button text"
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Success Message</Label>
            <Input
              value={data.success_message}
              onChange={(e) => updateData({ success_message: e.target.value })}
              placeholder="Thanks for subscribing!"
            />
          </div>

          {/* Layout Type Selector */}
          <div className="space-y-2">
            <Label>Layout</Label>
            <Select
              value={data.layout_type || "default"}
              onValueChange={(value: "default" | "pro") => updateData({ layout_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="pro">Pro (with thumbnail)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Pro Layout Image Picker */}
          {data.layout_type === "pro" && (
            <div className="space-y-2">
              <Label>Product Image</Label>
              <button
                type="button"
                onClick={() => setShowImagePickerModal(true)}
                className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {data.product_image ? (
                  <img 
                    src={data.product_image} 
                    alt="" 
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">
                    {data.product_image ? "Change image" : "Add image"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Displayed next to your form
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          )}

          {/* Enable Digital Product Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label>Enable Digital Product</Label>
              <p className="text-xs text-muted-foreground">
                Send a free download when someone subscribes
              </p>
            </div>
            <Toggle
              checked={data.enable_digital_product || false}
              onCheckedChange={(checked) => {
                // Only update the enable flag, preserve all other data
                updateData({ enable_digital_product: checked })
              }}
            />
          </div>

          {/* Digital Product File Picker */}
          {data.enable_digital_product && (
            <div className="space-y-2 pl-0 border-l-2 border-violet-200 ml-0">
              <div className="pl-3">
                <Label>Digital Product File</Label>
                <button
                  type="button"
                  onClick={() => setShowFilePickerModal(true)}
                  className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors mt-2"
                >
                  {data.digital_product_file_url ? (
                    <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-violet-600" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">
                      {data.digital_product_title || "Upload file"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {data.digital_product_file_url 
                        ? "Click to change file" 
                        : "PDF, ZIP, or any file type"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                </button>

                {data.digital_product_file_url && (
                  <div className="mt-2 space-y-2">
                    <Label className="text-xs">File Name (shown in email)</Label>
                    <Input
                      value={data.digital_product_title || ""}
                      onChange={(e) => updateData({ digital_product_title: e.target.value })}
                      placeholder="My Free Guide"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Image Picker Modal */}
          <Dialog open={showImagePickerModal} onOpenChange={setShowImagePickerModal}>
            <DialogContent className="p-0 gap-0 overflow-hidden rounded-2xl w-[calc(100%-32px)] sm:max-w-[416px]">
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-base font-semibold">
                  Product Image
                </DialogTitle>
              </DialogHeader>
              <div className="p-4 space-y-3">
                {/* Current image preview */}
                {data.product_image && (
                  <div className="flex items-center justify-center pb-3 border-b">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                      <img src={data.product_image} alt="" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                {/* Upload option */}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={imageUploading}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    {imageUploading ? (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Upload image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, GIF up to 5MB</p>
                  </div>
                </button>

                {/* Remove image */}
                {data.product_image && (
                  <button
                    type="button"
                    onClick={() => {
                      updateData({ product_image: null })
                      setShowImagePickerModal(false)
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors text-left border border-red-200 text-red-600"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium">Remove image</p>
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* File Picker Modal */}
          <Dialog open={showFilePickerModal} onOpenChange={(open) => {
            if (!fileUploading) setShowFilePickerModal(open)
          }}>
            <DialogContent className="p-0 gap-0 overflow-hidden rounded-2xl w-[calc(100%-32px)] sm:max-w-[416px]">
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-base font-semibold">
                  Digital Product File
                </DialogTitle>
              </DialogHeader>
              <div className="p-4 space-y-3">
                {/* Current file preview */}
                {data.digital_product_file_url && !fileUploading && (
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {data.digital_product_title || "Uploaded file"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ready to send
                      </p>
                    </div>
                  </div>
                )}

                {/* Upload progress */}
                {fileUploading && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Uploading...</p>
                        <p className="text-xs text-muted-foreground">{uploadProgress}% complete</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Upload error */}
                {uploadError && !fileUploading && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                    <X className="w-4 h-4 shrink-0" />
                    <p className="text-sm">{uploadError}</p>
                  </div>
                )}

                {/* Upload option */}
                {!fileUploading && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadError(null)
                      fileInputRef.current?.click()
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border"
                  >
                    <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {data.digital_product_file_url ? "Replace file" : "Upload file"}
                      </p>
                      <p className="text-xs text-muted-foreground">PDF, MP3, ZIP, or any file up to 5GB</p>
                    </div>
                  </button>
                )}

                {/* Remove file */}
                {data.digital_product_file_url && !fileUploading && (
                  <button
                    type="button"
                    onClick={() => {
                      updateData({
                        digital_product_file_url: null,
                        digital_product_title: null,
                        digital_product_thumbnail: null,
                      })
                      setShowFilePickerModal(false)
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors text-left border border-red-200 text-red-600"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium">Remove file</p>
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )
    }

    case "header": {
      const data = block.data as HeaderBlockData
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Show Avatar</Label>
            <Toggle
              checked={data.show_avatar}
              onCheckedChange={(checked) => updateData({ show_avatar: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Show Name</Label>
            <Toggle
              checked={data.show_name}
              onCheckedChange={(checked) => updateData({ show_name: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Show Bio</Label>
            <Toggle
              checked={data.show_bio}
              onCheckedChange={(checked) => updateData({ show_bio: checked })}
            />
          </div>
        </div>
      )
    }

    default:
      return <p className="text-sm text-muted-foreground">No settings available</p>
  }
}
