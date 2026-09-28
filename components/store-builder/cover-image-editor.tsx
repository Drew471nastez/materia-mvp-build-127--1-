"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { Move, ZoomIn, Check, X, Upload, ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface CoverImageEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentImageUrl?: string
  currentFocalPoint?: { x: number; y: number }
  onSave: (imageUrl: string, focalPoint: { x: number; y: number }) => void
  bucket?: string
  folder?: string
}

export function CoverImageEditor({
  open,
  onOpenChange,
  currentImageUrl,
  currentFocalPoint = { x: 50, y: 50 },
  onSave,
  bucket = "store-builder-images",
  folder = "store-builder",
}: CoverImageEditorProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl || null)
  const [focalPoint, setFocalPoint] = useState(currentFocalPoint)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [zoom, setZoom] = useState(100)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setImageUrl(currentImageUrl || null)
      setFocalPoint(currentFocalPoint)
      setZoom(100)
    }
  }, [open, currentImageUrl, currentFocalPoint])

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return
    
    setUploading(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const timestamp = Date.now()
      const ext = file.name.split(".").pop()
      const filePath = folder ? `${user.id}/${folder}/${timestamp}.${ext}` : `${user.id}/${timestamp}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { cacheControl: "3600", upsert: true })

      if (uploadError) throw uploadError
      confirmUpload(bucket, filePath)

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
      setImageUrl(urlData.publicUrl)
      setFocalPoint({ x: 50, y: 50 })
    } catch (err) {
      console.error("Upload error:", err)
    } finally {
      setUploading(false)
    }
  }, [bucket, folder])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imageUrl) return
    e.preventDefault()
    setIsDragging(true)
  }, [imageUrl])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setFocalPoint({ x: Math.round(x), y: Math.round(y) })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!imageUrl) return
    setIsDragging(true)
  }, [imageUrl])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const touch = e.touches[0]
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100))
    setFocalPoint({ x: Math.round(x), y: Math.round(y) })
  }, [isDragging])

  const handleSave = () => {
    if (imageUrl) {
      onSave(imageUrl, focalPoint)
      onOpenChange(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-20px)] sm:w-full max-w-lg sm:max-w-[544px] p-0 gap-0 overflow-hidden rounded-2xl flex flex-col max-h-[min(680px,calc(100dvh-16px))] sm:max-h-[calc(100dvh-40px)] max-sm:top-1/2 max-sm:left-2.5 max-sm:right-2.5 max-sm:-translate-y-1/2 max-sm:translate-x-0">
        <DialogHeader className="px-4 sm:px-5 py-3 border-b shrink-0 bg-white">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Move className="h-4 w-4" />
            Adjust Cover Image
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto p-3.5 sm:p-5 space-y-4 sm:space-y-5">
          <div
            ref={containerRef}
            className={cn(
              "relative w-full aspect-[3/1] max-sm:aspect-[16/7] rounded-xl overflow-hidden border-2 border-dashed transition-all",
              imageUrl ? "border-transparent bg-black cursor-move" : "border-muted-foreground/30 bg-muted/50",
              isDragging && "ring-2 ring-primary ring-offset-2"
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt="Cover preview"
                  className="absolute inset-0 w-full h-full object-cover transition-transform select-none pointer-events-none"
                  style={{
                    objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
                    transform: `scale(${zoom / 100})`,
                  }}
                  draggable={false}
                />
                
                <div
                  className="absolute w-8 h-8 border-4 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all"
                  style={{
                    left: `${focalPoint.x}%`,
                    top: `${focalPoint.y}%`,
                    boxShadow: "0 0 0 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                </div>

                <div className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity",
                  isDragging ? "opacity-0" : "opacity-0 hover:opacity-100"
                )}>
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2">
                    <Move className="h-4 w-4" />
                    Drag to reposition
                  </div>
                </div>
              </>
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Click to upload cover image</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 10MB</p>
                  </>
                )}
              </div>
            )}
          </div>

          {imageUrl && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Position</span>
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  X: {focalPoint.x}% / Y: {focalPoint.y}%
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <ZoomIn className="h-4 w-4" />
                    Zoom
                  </span>
                  <span className="font-mono text-xs">{zoom}%</span>
                </div>
                <Slider
                  value={[zoom]}
                  onValueChange={([v]) => setZoom(v)}
                  min={100}
                  max={150}
                  step={5}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Change Image
              </Button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <div className="shrink-0 grid grid-cols-2 sm:flex items-center sm:justify-end gap-2 px-3.5 sm:px-5 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!imageUrl}
            className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
