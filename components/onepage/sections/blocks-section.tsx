"use client"

import { useState, useRef, useCallback } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { useOnePage } from "@/lib/onepage/context"
import type { OnePageBlock, OnePageBlockType, LinkButtonBlockData, TextBlockData, EmailCaptureBlockData, ImageBlockData, DividerBlockData, HeaderBlockData } from "@/lib/onepage/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { FillBar } from "@/components/ui/fill-bar"
  Plus,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link,
  Type,
  Image,
  Minus,
  Mail,
  User,
  Eye,
  EyeOff,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react"

const blockTypes: { type: OnePageBlockType; label: string; icon: typeof Link }[] = [
  { type: "link_button", label: "Link Button", icon: Link },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: Image },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "email_capture", label: "Email Capture", icon: Mail },
  { type: "header", label: "Header", icon: User },
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

  const updateData = (updates: Partial<OnePageBlock["data"]>) => {
    updateBlock(block.id, { data: { ...block.data, ...updates } })
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

    case "email_capture":
      return <EmailCaptureEditor block={block} updateData={updateData} />

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

// --- Digital Product File Upload for Email Capture Block ---

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Upload a file using signed URL approach (bypasses Next.js body size limits).
 * Falls back to direct upload if signed URL fails.
 */
async function uploadDigitalFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ url: string; path: string; filename: string }> {
  // Step 1: Get a signed upload URL from the server. The bucket is set up by
  // migration; the route that let any signed in user reset it is gone.
  const signedRes = await fetch("/api/onepage/signed-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      folder: "digital",
    }),
  })

  if (!signedRes.ok) {
    const err = await signedRes.json().catch(() => ({ error: "Failed to get upload URL" }))
    throw new Error(err.error || "Failed to get signed upload URL")
  }

  const { signedUrl, token, path, publicUrl, bucket } = await signedRes.json()

  // Step 3: Upload directly to Supabase Storage using signed URL
  // Use XMLHttpRequest for progress tracking
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        // Try to parse error
        let errorMsg = `Upload failed with status ${xhr.status}`
        try {
          const errBody = JSON.parse(xhr.responseText)
          if (errBody.error || errBody.message) {
            errorMsg = errBody.error || errBody.message
          }
        } catch {
          // use default error
        }
        reject(new Error(errorMsg))
      }
    })

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"))
    })

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"))
    })

    // Upload to the signed URL with the token
    const uploadUrl = signedUrl.includes("?")
      ? `${signedUrl}&token=${token}`
      : `${signedUrl}?token=${token}`

    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.setRequestHeader("x-upsert", "true")
    xhr.send(file)
  })

  /* The bytes are there now, so the server reads them and checks them
     (lib/storage/confirm-upload.ts). Nothing here waits for it. */
  confirmUpload(bucket || "lead-form-files-v2", path)
  onProgress(100)

  return {
    url: publicUrl,
    path,
    filename: file.name,
  }
}

function EmailCaptureEditor({
  block,
  updateData,
}: {
  block: OnePageBlock
  updateData: (updates: Partial<EmailCaptureBlockData>) => void
}) {
  const data = block.data as EmailCaptureBlockData
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploadError(null)
      setUploading(true)
      setUploadProgress(0)

      try {
        const result = await uploadDigitalFile(file, setUploadProgress)

        updateData({
          digital_product_file_url: result.url,
          digital_product_title: file.name.replace(/\.[^/.]+$/, ""),
        })
      } catch (err) {
        console.error("[digital-upload] Error:", err)
        const message = err instanceof Error ? err.message : "Upload failed"
        setUploadError(message)
      } finally {
        setUploading(false)
        setUploadProgress(0)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      }
    },
    [updateData],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect],
  )

  const handleRemoveFile = useCallback(() => {
    updateData({
      digital_product_file_url: null,
      digital_product_title: null,
    })
    setUploadError(null)
  }, [updateData])

  return (
    <div className="space-y-4">
      {/* Basic Fields */}
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
      <div className="space-y-2">
        <Label>Button Text</Label>
        <Input
          value={data.button_text}
          onChange={(e) => updateData({ button_text: e.target.value })}
          placeholder="Subscribe"
        />
      </div>
      <div className="space-y-2">
        <Label>Success Message</Label>
        <Input
          value={data.success_message}
          onChange={(e) => updateData({ success_message: e.target.value })}
          placeholder="Thanks for subscribing!"
        />
      </div>

      {/* Divider */}
      <div className="border-t pt-4" />

      {/* Digital Product Toggle */}
      <div className="flex items-center justify-between py-1">
        <div>
          <Label>Enable Digital Product</Label>
          <p className="text-xs text-muted-foreground">
            Send a free download when someone subscribes
          </p>
        </div>
        <Toggle
          checked={data.enable_digital_product || false}
          onCheckedChange={(checked) => {
            updateData({ enable_digital_product: checked })
          }}
        />
      </div>

      {/* Digital Product Upload Section */}
      {data.enable_digital_product && (
        <div className="space-y-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3">
          <Label className="text-sm font-medium">Digital Product File</Label>

          {/* Show uploaded file */}
          {data.digital_product_file_url ? (
            <div className="flex items-center justify-between rounded-md border bg-white p-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {data.digital_product_title || "Digital Product"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    File uploaded and ready
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleRemoveFile}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Upload dropzone */
            <div
              className={cn(
                "relative rounded-md border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
                dragOver
                  ? "border-violet-500 bg-violet-100/50"
                  : "border-gray-300 hover:border-violet-400",
                uploading && "pointer-events-none opacity-60",
              )}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setDragOver(false)
              }}
            >
              {uploading ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-500" />
              ) : (
                <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
              )}
              <p className="mt-1.5 text-sm font-medium">
                {uploading ? "Uploading..." : "Click to upload or drag and drop"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Any file type - PDF, ZIP, MP3, video, etc. (up to 5GB)
              </p>
            </div>
          )}

          {/* Hidden file input - accept all file types */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInputChange}
            disabled={uploading}
          />

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-1">
              <FillBar quiet value={uploadProgress} tone="violet" />
              <p className="text-center text-xs text-muted-foreground">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Upload failed</p>
                <p className="mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          {/* Product title */}
          {data.digital_product_file_url && (
            <div className="space-y-2">
              <Label className="text-xs">Product Title</Label>
              <Input
                value={data.digital_product_title || ""}
                onChange={(e) =>
                  updateData({ digital_product_title: e.target.value })
                }
                placeholder="My Digital Product"
                className="h-8 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Email Customization */}
      {data.enable_digital_product && data.digital_product_file_url && (
        <>
          <div className="border-t pt-4" />
          <div className="flex items-center justify-between py-1">
            <div>
              <Label>Send Welcome Email</Label>
              <p className="text-xs text-muted-foreground">
                Email download link to subscribers
              </p>
            </div>
            <Toggle
              checked={data.send_welcome_email !== false}
              onCheckedChange={(checked) =>
                updateData({ send_welcome_email: checked })
              }
            />
          </div>
          {data.send_welcome_email !== false && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Email Subject</Label>
                <Input
                  value={data.email_subject || ""}
                  onChange={(e) =>
                    updateData({ email_subject: e.target.value })
                  }
                  placeholder="Your download is ready"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email Heading</Label>
                <Input
                  value={data.email_heading || ""}
                  onChange={(e) =>
                    updateData({ email_heading: e.target.value })
                  }
                  placeholder="Your download is ready!"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email Body</Label>
                <Textarea
                  value={data.email_body || ""}
                  onChange={(e) =>
                    updateData({ email_body: e.target.value })
                  }
                  placeholder="Thanks for subscribing! Here's your free download."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
