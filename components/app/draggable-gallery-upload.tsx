"use client"
import { useState, useRef, useCallback } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Plus, X, AlertCircle, GripVertical } from "lucide-react"
import Image from "next/image"

interface DraggableGalleryUploadProps {
  folder: string
  value: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
  maxSizeMB?: number
}

export function DraggableGalleryUpload({
  folder,
  value = [],
  onChange,
  maxImages = 8,
  maxSizeMB = 10,
}: DraggableGalleryUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(
    async (files: FileList) => {
      if (value.length + files.length > maxImages) {
        setError(`Maximum ${maxImages} images allowed`)
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
            setError(`${file.name} exceeds ${maxSizeMB}MB limit`)
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
        setError("Failed to upload images")
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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
    // For mobile compatibility
    if (e.dataTransfer.setDragImage) {
      const elem = e.currentTarget as HTMLElement
      e.dataTransfer.setDragImage(elem, 50, 50)
    }
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

    const newUrls = [...value]
    const [draggedItem] = newUrls.splice(draggedIndex, 1)
    newUrls.splice(dropIndex, 0, draggedItem)
    onChange(newUrls)

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchIndex, setTouchIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Threshold for distinguishing drag vs scroll (in pixels)
  const DRAG_THRESHOLD = 10

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    setTouchStartY(e.touches[0].clientY)
    setTouchStartX(e.touches[0].clientX)
    setTouchIndex(index)
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null || touchStartX === null || touchIndex === null) return

    const touch = e.touches[0]
    const deltaY = Math.abs(touch.clientY - touchStartY)
    const deltaX = Math.abs(touch.clientX - touchStartX)

    // If user is scrolling vertically (deltaY > deltaX), don't initiate drag
    if (!isDragging && deltaY > DRAG_THRESHOLD) {
      // User is scrolling, not dragging - cancel drag
      setTouchStartY(null)
      setTouchStartX(null)
      setTouchIndex(null)
      return
    }

    // If horizontal movement exceeds threshold, initiate drag
    if (!isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
      setIsDragging(true)
      // Prevent default to stop page scroll during drag
      e.preventDefault()
    }

    // Only process drag if we're actually dragging
    if (isDragging) {
      e.preventDefault() // Prevent scroll while dragging
      const elements = document.elementsFromPoint(touch.clientX, touch.clientY)
      const dropTarget = elements.find((el) => el.getAttribute("data-gallery-index"))

      if (dropTarget) {
        const targetIndex = Number.parseInt(dropTarget.getAttribute("data-gallery-index") || "-1")
        if (targetIndex !== -1 && targetIndex !== touchIndex) {
          setDragOverIndex(targetIndex)
        }
      }
    }
  }

  const handleTouchEnd = () => {
    // Only perform reorder if we were actually dragging
    if (isDragging && touchIndex !== null && dragOverIndex !== null && touchIndex !== dragOverIndex) {
      const newUrls = [...value]
      const [draggedItem] = newUrls.splice(touchIndex, 1)
      newUrls.splice(dragOverIndex, 0, draggedItem)
      onChange(newUrls)
    }

    setTouchStartY(null)
    setTouchStartX(null)
    setTouchIndex(null)
    setDragOverIndex(null)
    setIsDragging(false)
  }

  return (
    <div className="space-y-3 isolate">
      <div className="grid grid-cols-4 gap-3 relative">
        {value.map((url, index) => (
          <div
            key={url}
            data-gallery-index={index}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, index)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`group relative aspect-square overflow-hidden rounded-lg border transition-all cursor-move will-change-transform ${
              dragOverIndex === index
                ? "border-primary border-2 scale-105 z-[15]"
                : draggedIndex === index || (isDragging && touchIndex === index)
                  ? "opacity-50 border-dashed border-2 z-[20] shadow-lg"
                  : "border-border z-[5]"
            }`}
            style={{
              touchAction: 'none', // Prevent default touch behaviors during drag
            }}
          >
            <Image src={url || "/placeholder.svg"} alt={`Gallery image ${index + 1}`} fill className="object-cover" />

            {/* Drag handle overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <GripVertical className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Remove button */}
            <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(index)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Position indicator */}
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
                <span className="mt-1 text-xs text-muted-foreground">Add</span>
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
        {value.length}/{maxImages} images - Drag to reorder
      </p>
    </div>
  )
}
