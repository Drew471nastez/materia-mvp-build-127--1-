"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { ZoomIn, ZoomOut, Check, X, Upload, User, RotateCcw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface AvatarCropperProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentImageUrl?: string
  onSave: (croppedImageUrl: string) => void
  bucket?: string
  folder?: string
}

export function AvatarCropper({
  open,
  onOpenChange,
  currentImageUrl,
  onSave,
  bucket = "store-builder-images",
  folder = "store-builder",
}: AvatarCropperProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Position in container pixels (visual shift in the circle)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  // zoom is uniform scale
  const [zoom, setZoom] = useState(1)
  const [minZoom, setMinZoom] = useState(1)

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Base cover size at zoom=1 in container pixels
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })

  const [saving, setSaving] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // keep latest zoom for resize recalcs
  const zoomRef = useRef(1)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // ✅ responsive crop circle size (safe on mobile, never overflow)
  const [containerSize, setContainerSize] = useState(240)
  useEffect(() => {
    const update = () => {
      const w = typeof window !== "undefined" ? window.innerWidth : 1024
      // padding around dialog + keep it comfy on tiny screens - more compact
      const next = Math.max(180, Math.min(260, w - 100))
      setContainerSize(next)
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // reset on open
  useEffect(() => {
    if (open) {
      setImageUrl(null)
      setPosition({ x: 0, y: 0 })
      setZoom(1)
      setMinZoom(1)
      setBaseSize({ width: 0, height: 0 })
      setNaturalSize({ width: 0, height: 0 })
      setSaving(false)
    }
  }, [open])

  // cover sizing at zoom=1
  const computeCoverSize = useCallback((nw: number, nh: number, c: number) => {
    const coverScale = c / Math.min(nw, nh)
    return {
      width: nw * coverScale,
      height: nh * coverScale,
    }
  }, [])

  // ✅ hard clamp so image can never expose empty space
  const constrainPosition = useCallback(
    (pos: { x: number; y: number }, z: number, size: { width: number; height: number }) => {
      const scaledW = size.width * z
      const scaledH = size.height * z

      // if somehow not covering, force center
      if (scaledW <= containerSize || scaledH <= containerSize) return { x: 0, y: 0 }

      const maxX = (scaledW - containerSize) / 2
      const maxY = (scaledH - containerSize) / 2

      return {
        x: Math.max(-maxX, Math.min(maxX, pos.x)),
        y: Math.max(-maxY, Math.min(maxY, pos.y)),
      }
    },
    [containerSize],
  )

  const handleImageLoad = useCallback(
    (img: HTMLImageElement) => {
      const nw = img.naturalWidth || 1
      const nh = img.naturalHeight || 1
      setNaturalSize({ width: nw, height: nh })

      const cover = computeCoverSize(nw, nh, containerSize)
      setBaseSize(cover)

      // base is cover => minZoom = 1
      setMinZoom(1)
      setZoom(1)
      setPosition({ x: 0, y: 0 })
    },
    [containerSize, computeCoverSize],
  )

  // ✅ if the screen resizes after upload, recalc cover + re-clamp
  useEffect(() => {
    if (!imageUrl) return
    if (!naturalSize.width || !naturalSize.height) return

    const cover = computeCoverSize(naturalSize.width, naturalSize.height, containerSize)
    setBaseSize(cover)

    setPosition((prev) => constrainPosition(prev, zoomRef.current, cover))

    // keep zoom within bounds after resize
    setZoom((prev) => {
      const next = Math.max(minZoom, Math.min(prev, minZoom + 2))
      return next
    })
  }, [containerSize, imageUrl, naturalSize.width, naturalSize.height, computeCoverSize, constrainPosition, minZoom])

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return

      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        setImageUrl(dataUrl)

        const img = new Image()
        img.onload = () => handleImageLoad(img)
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    },
    [handleImageLoad],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    e.target.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!imageUrl) return
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    },
    [imageUrl, position],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const next = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }
      setPosition(constrainPosition(next, zoom, baseSize))
    },
    [isDragging, dragStart, zoom, baseSize, constrainPosition],
  )

  const stopDragging = useCallback(() => setIsDragging(false), [])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!imageUrl) return
      const t = e.touches[0]
      setIsDragging(true)
      setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y })
    },
    [imageUrl, position],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return
      e.preventDefault()
      const t = e.touches[0]
      const next = { x: t.clientX - dragStart.x, y: t.clientY - dragStart.y }
      setPosition(constrainPosition(next, zoom, baseSize))
    },
    [isDragging, dragStart, zoom, baseSize, constrainPosition],
  )

  const handleZoomChange = useCallback(
    (z: number) => {
      const clamped = Math.max(minZoom, Math.min(z, minZoom + 2))
      setZoom(clamped)
      setPosition((prev) => constrainPosition(prev, clamped, baseSize))
    },
    [minZoom, baseSize, constrainPosition],
  )

  const handleReset = () => {
    setZoom(minZoom)
    setPosition({ x: 0, y: 0 })
  }

  /**
   * ✅ Render to canvas using the EXACT SAME transform as the preview.
   */
  const cropAndUpload = async () => {
    if (!imageUrl || !canvasRef.current) return
    setSaving(true)

    try {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("No canvas context")

      // crisp output
      const outputSize = 512
      canvas.width = outputSize
      canvas.height = outputSize

      const img = new Image()
      img.crossOrigin = "anonymous"

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("Failed to load image"))
        img.src = imageUrl
      })

      const nw = img.naturalWidth || naturalSize.width || 1
      const nh = img.naturalHeight || naturalSize.height || 1

      // container pixels -> output pixels scale
      const outScale = outputSize / containerSize

      // base cover size must match what preview uses
      const coverScale = containerSize / Math.min(nw, nh)
      const baseW = nw * coverScale
      const baseH = nh * coverScale

      // clamp once more, just in case
      const safePos = constrainPosition(position, zoom, { width: baseW, height: baseH })

      ctx.clearRect(0, 0, outputSize, outputSize)

      // circular clip
      ctx.save()
      ctx.beginPath()
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()

      // recreate preview space
      ctx.translate(outputSize / 2, outputSize / 2)
      ctx.scale(outScale, outScale)

      // exact preview transform behavior
      ctx.scale(zoom, zoom)
      ctx.translate(safePos.x / zoom, safePos.y / zoom)

      // draw image centered with coverScale
      ctx.scale(coverScale, coverScale)
      ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh)

      ctx.restore()

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
          "image/png",
          0.95,
        )
      })

      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Not authenticated")

      const timestamp = Date.now()
      const filePath = folder
        ? `${auth.user.id}/${folder}/avatar_${timestamp}.png`
        : `${auth.user.id}/avatar_${timestamp}.png`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, { cacheControl: "3600", upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

      onSave(urlData.publicUrl)
      onOpenChange(false)
    } catch (err) {
      console.error("Crop/upload error:", err)
    } finally {
      setSaving(false)
    }
  }

  const maxZoom = useMemo(() => minZoom + 2, [minZoom])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // ✅ More compact and responsive
          "p-0 gap-0 overflow-hidden w-[calc(100vw-32px)] sm:w-full",
          "max-w-[420px] sm:max-w-[460px]",
          // ✅ responsive height
          "max-h-[calc(100dvh-32px)]",
          "flex flex-col rounded-2xl",
        )}
      >
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Edit Profile Picture
          </DialogTitle>
        </DialogHeader>

        {/* ✅ body scrolls on short screens (mobile landscape etc.) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex justify-center">
            <div
              className={cn(
                "group relative rounded-full overflow-hidden border-4 transition-all",
                imageUrl
                  ? "border-primary/20 cursor-move bg-gray-900"
                  : "border-dashed border-muted-foreground/30 bg-muted/50 cursor-pointer",
                isDragging && "border-primary",
              )}
              style={{
                width: containerSize,
                height: containerSize,
                maxWidth: "100%",
                touchAction: "none",
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={stopDragging}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !imageUrl && inputRef.current?.click()}
            >
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt="Avatar preview"
                    draggable={false}
                    className="absolute select-none pointer-events-none will-change-transform"
                    style={{
                      width: `${baseSize.width}px`,
                      height: `${baseSize.height}px`,
                      left: "50%",
                      top: "50%",
                      // ✅ exact transform we also use in canvas:
                      transform: `translate(-50%, -50%) scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                      transformOrigin: "center center",
                      // ✅ prevent weird browser auto-scaling on mobile
                      maxWidth: "none",
                      maxHeight: "none",
                      display: "block",
                    }}
                  />

                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none",
                      isDragging ? "opacity-0" : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <div className="bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-medium">
                      Drag to reposition
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-muted-foreground/10 flex items-center justify-center mb-3">
                    <Upload className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Upload photo</p>
                  <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                </div>
              )}
            </div>
          </div>

          {imageUrl && (
            <p className="text-xs text-center text-muted-foreground">Drag to reposition, use slider to zoom</p>
          )}

          {imageUrl && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Slider
                    value={[zoom]}
                    onValueChange={([v]) => handleZoomChange(v)}
                    min={minZoom}
                    max={maxZoom}
                    step={0.05}
                    className="flex-1"
                  />
                  <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="text-center text-xs text-muted-foreground">Zoom: {Math.round(zoom * 100)}%</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Change
                </Button>
              </div>
            </div>
          )}

          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* ✅ footer stays visible and clean on all sizes */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={cropAndUpload}
            disabled={!imageUrl || saving}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Apply
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
