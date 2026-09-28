"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Upload, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { pickPhoto } from "@/lib/native-camera"

interface OnepageAvatarPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (imageUrl: string) => void
  bucket?: string
  folder?: string
}

export function OnepageAvatarPicker({
  open,
  onOpenChange,
  onSave,
  bucket = "store-builder-images",
  folder = "store-builder",
}: OnepageAvatarPickerProps) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [tempImageFile, setTempImageFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, size: 200 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const containerRef = useRef<HTMLDivElement>(null)

  // Sync open prop to upload modal
  useEffect(() => {
    if (open) {
      setShowUploadModal(true)
    } else {
      setShowUploadModal(false)
      setShowCropModal(false)
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl)
        setTempImageUrl(null)
        setTempImageFile(null)
      }
    }
  }, [open])

  const handlePickPhoto = async () => {
    const photo = await pickPhoto("PROMPT")
    if (!photo) return

    setTempImageUrl(photo.dataUrl)
    setTempImageFile(new File([photo.blob], `avatar.${photo.mimeType === "image/png" ? "png" : "jpg"}`, { type: photo.mimeType }))
    setShowUploadModal(false)
    setShowCropModal(true)

    // Load image to get dimensions and set initial crop box
    const img = new Image()
    img.onload = () => {
      const containerSize = 300
      const scale = Math.min(containerSize / img.width, containerSize / img.height)
      const displayWidth = img.width * scale
      const displayHeight = img.height * scale
      setImageSize({ width: displayWidth, height: displayHeight })

      // Initial crop box centered and sized to fit
      const initialSize = Math.min(displayWidth, displayHeight) * 0.8
      setCropBox({
        x: (displayWidth - initialSize) / 2,
        y: (displayHeight - initialSize) / 2,
        size: initialSize,
      })
    }
    img.src = photo.dataUrl
  }

  const handleCropSave = async () => {
    if (!tempImageFile || !tempImageUrl) return
    setUploading(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new Image()

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = tempImageUrl
      })

      // Calculate the actual image coordinates from the crop box
      const containerSize = 300
      const scale = Math.min(containerSize / img.width, containerSize / img.height)

      // Convert crop box coordinates back to original image coordinates
      const actualX = cropBox.x / scale
      const actualY = cropBox.y / scale
      const actualSize = cropBox.size / scale

      // Output size for high quality
      const outputSize = 800
      canvas.width = outputSize
      canvas.height = outputSize

      if (ctx) {
        // Draw the cropped portion at high quality
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(img, actualX, actualY, actualSize, actualSize, 0, 0, outputSize, outputSize)
      }

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.95)
      })

      const fileName = `${user.id}/${folder}/avatar-${Date.now()}.jpg`
      const { error } = await supabase.storage.from(bucket).upload(fileName, blob, { upsert: true })
      if (error) throw error
      confirmUpload(bucket, fileName)

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(fileName)

      onSave(publicUrl)
      setShowCropModal(false)
      onOpenChange(false)
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setUploading(false)
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl)
        setTempImageUrl(null)
        setTempImageFile(null)
      }
    }
  }

  // Mouse/Touch handlers for crop box
  const handleCropMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    setIsDragging(true)
    setDragStart({ x: clientX - cropBox.x, y: clientY - cropBox.y })
  }

  const handleResizeMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    setIsResizing(true)
    setDragStart({ x: clientX, y: clientY })
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

      if (isDragging) {
        const newX = clientX - dragStart.x
        const newY = clientY - dragStart.y

        // Constrain to image bounds
        const maxX = imageSize.width - cropBox.size
        const maxY = imageSize.height - cropBox.size

        setCropBox((prev) => ({
          ...prev,
          x: Math.max(0, Math.min(maxX, newX)),
          y: Math.max(0, Math.min(maxY, newY)),
        }))
      }

      if (isResizing) {
        const deltaX = clientX - dragStart.x
        const deltaY = clientY - dragStart.y
        const delta = Math.max(deltaX, deltaY)

        setCropBox((prev) => {
          const newSize = Math.max(50, Math.min(prev.size + delta, imageSize.width - prev.x, imageSize.height - prev.y))
          return { ...prev, size: newSize }
        })
        setDragStart({ x: clientX, y: clientY })
      }
    },
    [isDragging, isResizing, dragStart, cropBox.size, imageSize],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      window.addEventListener("touchmove", handleMouseMove)
      window.addEventListener("touchend", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
        window.removeEventListener("touchmove", handleMouseMove)
        window.removeEventListener("touchend", handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  return (
    <>
      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={(open) => {
        setShowUploadModal(open)
        if (!open) onOpenChange(false)
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button
              onClick={() => {
                setShowUploadModal(false)
                onOpenChange(false)
              }}
              className="hover:bg-gray-100 p-1 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Upload media</DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <button
              type="button"
              onClick={handlePickPhoto}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors bg-transparent"
            >
              <Upload className="h-12 w-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-600">Tap to select a photo</p>
              <p className="text-sm text-gray-400 mt-2">Camera or photo library</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop Modal */}
      <Dialog
        open={showCropModal}
        onOpenChange={(open) => {
          setShowCropModal(open)
          if (!open && tempImageUrl) {
            URL.revokeObjectURL(tempImageUrl)
            setTempImageUrl(null)
            setTempImageFile(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <DialogHeader className="p-5 border-b flex flex-row items-center gap-3">
            <button
              onClick={() => {
                setShowCropModal(false)
                setShowUploadModal(true)
              }}
              className="hover:bg-gray-100 p-1 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {tempImageUrl && (
              <>
                <div
                  ref={containerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden"
                  style={{ width: "300px", height: "300px" }}
                >
                  {/* Image */}
                  <img
                    src={tempImageUrl}
                    alt="Preview"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={{
                      width: imageSize.width,
                      height: imageSize.height,
                      maxWidth: "300px",
                      maxHeight: "300px",
                      objectFit: "contain",
                    }}
                    draggable={false}
                  />

                  {/* Crop box */}
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: `${150 - imageSize.width / 2 + cropBox.x}px`,
                      top: `${150 - imageSize.height / 2 + cropBox.y}px`,
                      width: `${cropBox.size}px`,
                      height: `${cropBox.size}px`,
                      border: "2px solid #3b82f6",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                    }}
                    onMouseDown={handleCropMouseDown}
                    onTouchStart={handleCropMouseDown}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner handles */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-sm" />
                    <div
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize"
                      onMouseDown={handleResizeMouseDown}
                      onTouchStart={handleResizeMouseDown}
                    />
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Drag to move, drag bottom-right corner to resize
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCropModal(false)
                      setShowUploadModal(true)
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCropSave}
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
