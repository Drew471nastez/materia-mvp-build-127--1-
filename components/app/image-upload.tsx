"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { X, ImageIcon, AlertCircle } from "lucide-react"
import Image from "next/image"

interface ImageUploadProps {
  bucket: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
  value?: string
  onChange: (url: string | null) => void
  aspectRatio?: "square" | "video" | "cover"
  maxSizeMB?: number
}

export function ImageUpload({
  bucket,
  folder = "",
  value,
  onChange,
  aspectRatio = "video",
  maxSizeMB = 5,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    cover: "aspect-[3/1]",
  }

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setUploading(true)
      setProgress(0)

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file")
        setUploading(false)
        return
      }

      // Validate file size
      const maxBytes = maxSizeMB * 1024 * 1024
      if (file.size > maxBytes) {
        setError(`Image must be under ${maxSizeMB}MB`)
        setUploading(false)
        return
      }

      const supabase = createClient()

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error("You must be logged in to upload images")
        }

        // Generate unique path with user folder
        const timestamp = Date.now()
        const ext = file.name.split(".").pop()
        const safeName = `${timestamp}.${ext}`
        const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

        console.log("[v0] Uploading to bucket:", bucket, "path:", filePath)

        setProgress(30)

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        })

        if (uploadError) {
          console.error("[v0] Upload error:", uploadError)
          throw uploadError
        }

        setProgress(70)

        // Get public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

        console.log("[v0] Upload successful, URL:", urlData.publicUrl)

        setProgress(100)
        onChange(urlData.publicUrl)
      } catch (err) {
        console.error("[v0] Upload error:", err)
        setError(err instanceof Error ? err.message : "Failed to upload image")
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [bucket, folder, maxSizeMB, onChange],
  )

  const handleRemove = useCallback(async () => {
    if (!value) return

    // Try to delete from storage
    try {
      const supabase = createClient()
      const url = new URL(value)
      const pathMatch = url.pathname.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`))
      if (pathMatch?.[1]) {
        await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[1])])
      }
    } catch {
      // Ignore deletion errors
    }

    onChange(null)
  }, [value, bucket, onChange])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  if (value) {
    return (
      <div className={`relative overflow-hidden rounded-lg border border-border ${aspectClasses[aspectRatio]}`}>
        <Image src={value || "/placeholder.svg"} alt="Uploaded image" fill className="object-cover" />
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute right-2 top-2 h-8 w-8"
          onClick={handleRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${aspectClasses[aspectRatio]} ${
          dragOver ? "border-blue-500 bg-blue-500/5" : "border-border hover:border-muted-foreground/50"
        } ${uploading ? "pointer-events-none opacity-50" : ""}`}
        onClick={() => inputRef.current?.click()}
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
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <Progress value={progress} className="h-2 w-32" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to {maxSizeMB}MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
