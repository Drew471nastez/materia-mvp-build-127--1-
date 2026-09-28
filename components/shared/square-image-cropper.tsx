"use client"

import { useState, useRef } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface SquareImageCropperProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tempImageUrl: string | null
  onSave: (croppedImageUrl: string) => void
  bucket?: string
  folder?: string
  outputSize?: number
}

export function SquareImageCropper({
  open,
  onOpenChange,
  tempImageUrl,
  onSave,
  bucket = "onepage-assets",
  folder = "avatars",
  outputSize = 512,
}: SquareImageCropperProps) {
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [uploading, setUploading] = useState(false)

  const cropContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = createClient()

  const handleSaveCrop = async () => {
    if (!tempImageUrl || !canvasRef.current) return

    try {
      setUploading(true)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No canvas context')

      canvas.width = outputSize
      canvas.height = outputSize

      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = tempImageUrl
      })

      // Calculate source rectangle from crop box
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      const scale = Math.min(300 / nw, 300 / nh)

      // Convert crop box coordinates back to original image coordinates
      const srcX = cropBox.x / scale
      const srcY = cropBox.y / scale
      const srcSize = cropBox.size / scale

      ctx.clearRect(0, 0, outputSize, outputSize)
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize)

      // Convert to blob and upload
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
          'image/png',
          0.95
        )
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const fileName = `${user.id}/${folder}/${folder}-${Date.now()}.png` // the owner's folder first: storage only lets a person write there
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, blob, { upsert: true })

      if (uploadError) throw uploadError
      confirmUpload(bucket, fileName)

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)

      onSave(publicUrl)
      onOpenChange(false)
      setCropBox({ x: 50, y: 50, size: 200 })
    } catch (e) {
      console.error("Error uploading image:", e)
      alert('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging && !isResizing) return
    const rect = cropContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (isDragging) {
      const newX = e.clientX - rect.left - dragStart.x
      const newY = e.clientY - rect.top - dragStart.y
      const maxX = imageSize.width - cropBox.size
      const maxY = imageSize.height - cropBox.size
      const offsetX = (300 - imageSize.width) / 2
      const offsetY = (300 - imageSize.height) / 2
      setCropBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(maxX, newX - offsetX)),
        y: Math.max(0, Math.min(maxY, newY - offsetY))
      }))
    } else if (isResizing) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      const delta = Math.max(dx, dy)
      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
      const maxSize = Math.min(imageSize.width - cropBox.x, imageSize.height - cropBox.y)
      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging && !isResizing) return
    e.preventDefault()
    const touch = e.touches[0]
    const rect = cropContainerRef.current?.getBoundingClientRect()
    if (!rect || !touch) return

    if (isDragging) {
      const newX = touch.clientX - rect.left - dragStart.x
      const newY = touch.clientY - rect.top - dragStart.y
      const maxX = imageSize.width - cropBox.size
      const maxY = imageSize.height - cropBox.size
      const offsetX = (300 - imageSize.width) / 2
      const offsetY = (300 - imageSize.height) / 2
      setCropBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(maxX, newX - offsetX)),
        y: Math.max(0, Math.min(maxY, newY - offsetY))
      }))
    } else if (isResizing) {
      const dx = touch.clientX - dragStart.x
      const dy = touch.clientY - dragStart.y
      const delta = Math.max(dx, dy)
      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
      const maxSize = Math.min(imageSize.width - cropBox.x, imageSize.height - cropBox.y)
      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
      setDragStart({ x: touch.clientX, y: touch.clientY })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5 text-gray-600" />
            </button>
            <DialogTitle className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</DialogTitle>
          </div>
        </DialogHeader>
        <div className="p-5 space-y-4">
          {tempImageUrl && (
            <>
              <div
                ref={cropContainerRef}
                className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden touch-none"
                style={{ width: '300px', height: '300px' }}
                onMouseMove={handleMouseMove}
                onMouseUp={() => { setIsDragging(false); setIsResizing(false) }}
                onMouseLeave={() => { setIsDragging(false); setIsResizing(false) }}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => { setIsDragging(false); setIsResizing(false) }}
              >
                <img
                  src={tempImageUrl}
                  alt="Preview"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                  style={{
                    width: imageSize.width,
                    height: imageSize.height,
                    maxWidth: '300px',
                    maxHeight: '300px',
                    objectFit: 'contain'
                  }}
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement
                    const nw = img.naturalWidth
                    const nh = img.naturalHeight
                    const scale = Math.min(300 / nw, 300 / nh)
                    const displayW = nw * scale
                    const displayH = nh * scale
                    setImageSize({ width: displayW, height: displayH })
                    const size = Math.min(displayW, displayH) * 0.8
                    setCropBox({
                      x: (displayW - size) / 2,
                      y: (displayH - size) / 2,
                      size
                    })
                  }}
                />

                {/* Crop box */}
                <div
                  className="absolute cursor-move touch-none"
                  style={{
                    left: `${150 - imageSize.width/2 + cropBox.x}px`,
                    top: `${150 - imageSize.height/2 + cropBox.y}px`,
                    width: `${cropBox.size}px`,
                    height: `${cropBox.size}px`,
                    border: '2px solid #8b5cf6',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsDragging(true)
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const touch = e.touches[0]
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    setIsDragging(true)
                    setDragStart({ x: touch.clientX - rect.left, y: touch.clientY - rect.top })
                  }}
                >
                  {/* Resize handle */}
                  <div
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize"
                    style={{ background: '#8b5cf6', borderTopLeftRadius: '4px' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsResizing(true)
                      setDragStart({ x: e.clientX, y: e.clientY })
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const touch = e.touches[0]
                      setIsResizing(true)
                      setDragStart({ x: touch.clientX, y: touch.clientY })
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 rounded-xl"
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveCrop}
                  disabled={uploading}
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {uploading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
