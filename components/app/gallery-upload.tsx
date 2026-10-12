"use client"
import { useState, useRef, useCallback } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Plus, X, AlertCircle } from "lucide-react"
import Image from "next/image"
import { tt } from "@/lib/i18n/text"

interface GalleryUploadProps {
  folder: string
  value: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
  maxSizeMB?: number
}

export function GalleryUpload({ folder, value = [], onChange, maxImages = 8, maxSizeMB = 10 }: GalleryUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(
    async (files: FileList) => {
      if (value.length + files.length > maxImages) {
        setError(tt("Maximum {maxImages} images allowed", { maxImages }))
        return
      }

      setError(null)
      setUploading(true)
      setProgress(0)

      const supabase = createClient()
      const newUrls: string[] = []
      const totalFiles = files.length
      let completed = 0

      try {
        for (const file of Array.from(files)) {
          // Validate
          if (!file.type.startsWith("image/")) continue
          if (file.size > maxSizeMB * 1024 * 1024) {
            setError(tt("{name} exceeds {maxSizeMB}MB limit", { name: file.name, maxSizeMB }))
            continue
          }

          const timestamp = Date.now()
          const ext = file.name.split(".").pop()
          const filePath = `${folder}/${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`

          const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          })

          if (uploadError) {
            console.error("[v0] Gallery upload error:", uploadError)
            continue
          }
          confirmUpload("product-images", filePath)

          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath)
          newUrls.push(urlData.publicUrl)

          completed++
          setProgress(Math.round((completed / totalFiles) * 100))
        }

        onChange([...value, ...newUrls])
      } catch (err) {
        setError(tt("Failed to upload images"))
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [folder, value, maxImages, maxSizeMB, onChange],
  )

  const handleRemove = useCallback(
    (index: number) => {
      const newUrls = [...value]
      newUrls.splice(index, 1)
      onChange(newUrls)
    },
    [value, onChange],
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {value.map((url, index) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
            <Image src={url || "/placeholder.svg"} alt={tt("Gallery image {value}", { value: index + 1 })} fill className="object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleRemove(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/50 text-xs text-white">
              {index + 1}
            </div>
          </div>
        ))}

        {value.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-muted-foreground/50 disabled:opacity-50"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-1">
                <Progress value={progress} className="h-1 w-12" />
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
            ) : (
              <>
                <Plus className="h-6 w-6 text-muted-foreground" />
                <span className="mt-1 text-xs text-muted-foreground">{tt("Add")}</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleUpload(e.target.files)}
        disabled={uploading}
      />

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {tt("{length}/{maxImages} images", { length: value.length, maxImages })}
      </p>
    </div>
  )
}
