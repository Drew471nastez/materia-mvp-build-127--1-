"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { X, ImageIcon, AlertCircle, Video } from "lucide-react"
import Image from "next/image"

interface ImageUploadProps {
  bucket: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
  value?: string
  onChange: (url: string | null) => void
  aspectRatio?: "square" | "video" | "cover" | "compact"
  maxSizeMB?: number
  accept?: "image/*" | "video/*"
}

export function ImageUpload({
  bucket,
  folder = "",
  value,
  onChange,
  aspectRatio = "video",
  maxSizeMB = 5,
  accept = "image/*",
}: ImageUploadProps) {
  const isVideoMode = accept === "video/*"
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    cover: "aspect-[3/1]",
    compact: "min-h-[120px]",
  }

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setUploading(true)
      setProgress(0)

      // Validate file type
      if (isVideoMode) {
        if (!file.type.startsWith("video/")) {
          setError("Please upload a video file")
          setUploading(false)
          return
        }
      } else {
        if (!file.type.startsWith("image/")) {
          setError("Please upload an image file")
          setUploading(false)
          return
        }
      }

      // Validate file size
      const maxBytes = maxSizeMB * 1024 * 1024
      if (file.size > maxBytes) {
        setError(`${isVideoMode ? "Video" : "Image"} must be under ${maxSizeMB}MB`)
        setUploading(false)
        return
      }

      try {
        // For video uploads, use signed URL approach to handle large files
        if (isVideoMode) {
          setProgress(10)

          // Get signed upload URL from API
          const signedUrlResponse = await fetch("/api/storage/upload-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              folder: folder,
            }),
          })

          if (!signedUrlResponse.ok) {
            const errorData = await signedUrlResponse.json()
            throw new Error(errorData.error || "Failed to get upload URL")
          }

          const { token, path, publicUrl } = await signedUrlResponse.json()

          setProgress(20)

          // Use Supabase client's uploadToSignedUrl for reliable uploads
          const supabase = createClient()

          // For progress tracking, we'll use a simulated progress since uploadToSignedUrl doesn't support it
          const progressInterval = setInterval(() => {
            setProgress((prev) => Math.min(prev + 5, 90))
          }, 500)

          try {
            const { error: uploadError } = await supabase.storage
              .from("store-builder-images")
              .uploadToSignedUrl(path, token, file, {
                contentType: file.type,
                upsert: true,
              })

            clearInterval(progressInterval)

            if (uploadError) {
              console.error("[v0] Signed URL upload error:", uploadError)
              throw uploadError
            }
          } catch (uploadErr) {
            clearInterval(progressInterval)
            throw uploadErr
          }

          setProgress(100)
          console.log("[v0] Video upload successful, URL:", publicUrl)
          onChange(publicUrl)
        } else {
          // For image uploads, use the standard Supabase client
          const supabase = createClient()

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
        }
      } catch (err) {
        console.error("[v0] Upload error:", err)
        // Handle specific Supabase storage errors
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (errorMessage.toLowerCase().includes("exceeded the maximum allowed size") ||
            errorMessage.toLowerCase().includes("payload too large") ||
            errorMessage.toLowerCase().includes("file too large")) {
          setError(`${isVideoMode ? "Video" : "File"} is too large. Please use a file under ${maxSizeMB}MB.`)
        } else {
          setError(err instanceof Error ? err.message : `Failed to upload ${isVideoMode ? "video" : "image"}`)
        }
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [bucket, folder, maxSizeMB, onChange, isVideoMode],
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
          accept={accept}
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <Progress value={progress} className="h-2 w-32" />
            <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              {isVideoMode ? (
                <Video className="h-6 w-6 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium">Click to upload{!isVideoMode && " or drag and drop"}</p>
            <p className="text-xs text-muted-foreground">
              {isVideoMode ? `MP4, MOV, WebM up to ${maxSizeMB}MB` : `PNG, JPG, GIF up to ${maxSizeMB}MB`}
            </p>
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
