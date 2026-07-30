"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

interface CoverImageLibraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (imageUrl: string) => void
}

// Color & Gradient covers - max 12 options
const colorGradientCovers = [
  // Solid colors row 1
  { id: "coral", type: "solid", value: "#E07B67" },
  { id: "gold", type: "solid", value: "#E5B94E" },
  { id: "sky", type: "solid", value: "#4A9FD4" },
  { id: "cream", type: "solid", value: "#F5EDE3" },
  // Row 2
  { id: "teal", type: "solid", value: "#7EC8C8" },
  { id: "pink", type: "solid", value: "#E0459A" },
  { id: "sunset", type: "gradient", value: "linear-gradient(135deg, #E07B67 0%, #E5B94E 100%)" },
  { id: "ocean", type: "gradient", value: "linear-gradient(135deg, #4A9FD4 0%, #7EC8C8 100%)" },
  // Row 3
  { id: "purple-pink", type: "gradient", value: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)" },
  { id: "warm-sunset", type: "gradient", value: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)" },
  { id: "midnight", type: "gradient", value: "linear-gradient(135deg, #0F172A 0%, #312E81 100%)" },
  { id: "peach-rose", type: "gradient", value: "linear-gradient(135deg, #FDBA74 0%, #FB7185 100%)" },
]

// Curated cover images from Pexels and Pinterest
const curatedCovers = [
  {
    id: "curated-1",
    url: "https://images.pexels.com/photos/2719301/pexels-photo-2719301.jpeg",
    thumb: "https://images.pexels.com/photos/2719301/pexels-photo-2719301.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    id: "curated-2",
    url: "https://images.pexels.com/photos/3648850/pexels-photo-3648850.jpeg",
    thumb: "https://images.pexels.com/photos/3648850/pexels-photo-3648850.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    id: "curated-3",
    url: "https://images.pexels.com/photos/3297593/pexels-photo-3297593.jpeg",
    thumb: "https://images.pexels.com/photos/3297593/pexels-photo-3297593.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    id: "curated-4",
    url: "https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg",
    thumb: "https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    id: "curated-5",
    url: "https://i.pinimg.com/1200x/55/af/e5/55afe5923315c9a3fc7d561766e6866b.jpg",
    thumb: "https://i.pinimg.com/1200x/55/af/e5/55afe5923315c9a3fc7d561766e6866b.jpg",
  },
] as const

export function CoverImageLibraryModal({ open, onOpenChange, onSelect }: CoverImageLibraryModalProps) {
  const { t } = useLocale()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleColorSelect = async (cover: (typeof colorGradientCovers)[0]) => {
    setSelectedId(cover.id)
    setLoading(true)

    // For solid colors and gradients, we create a data URL canvas image
    const canvas = document.createElement("canvas")
    canvas.width = 1200
    canvas.height = 400
    const ctx = canvas.getContext("2d")

    if (ctx) {
      if (cover.type === "solid") {
        ctx.fillStyle = cover.value
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      } else {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
        const colorMatch = cover.value.match(/#[A-Fa-f0-9]{6}/g)
        if (colorMatch && colorMatch.length >= 2) {
          gradient.addColorStop(0, colorMatch[0])
          gradient.addColorStop(1, colorMatch[1])
        }
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
      onSelect(dataUrl)
    }

    setLoading(false)
    onOpenChange(false)
  }

  const handleCuratedSelect = (cover: (typeof curatedCovers)[0]) => {
    setSelectedId(cover.id)
    // Use the full URL when selecting (not the thumbnail)
    onSelect(cover.url)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden",
          "w-[95vw] h-[85vh]",
          "sm:w-full sm:max-w-2xl sm:h-auto sm:max-h-[85vh]",
        )}
      >
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>{t("builder.coverLibrary.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6 space-y-6">
            {/* Color & Gradient Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("builder.coverLibrary.colorGradient")}</h3>
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {colorGradientCovers.map((cover) => (
                  <button
                    key={cover.id}
                    onClick={() => handleColorSelect(cover)}
                    disabled={loading}
                    className={cn(
                      "aspect-[3/2] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                      selectedId === cover.id ? "border-primary ring-2 ring-primary" : "border-transparent",
                    )}
                    style={{ background: cover.value }}
                  >
                    {loading && selectedId === cover.id && (
                      <div className="w-full h-full flex items-center justify-center bg-black/20">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Curated Images Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t("builder.coverLibrary.curatedImages")}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {curatedCovers.map((cover) => (
                  <button
                    key={cover.id}
                    onClick={() => handleCuratedSelect(cover)}
                    className={cn(
                      "aspect-[3/2] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                      selectedId === cover.id ? "border-primary ring-2 ring-primary" : "border-transparent",
                    )}
                  >
                    <img
                      src={cover.thumb}
                      alt={t("builder.coverLibrary.coverOption")}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      referrerPolicy="no-referrer"
                      width={600}
                      height={300}
                      onError={(e) => {
                        // If thumb fails, fall back to the full URL.
                        const img = e.currentTarget
                        if (img.dataset.fallbackApplied === "1") return
                        img.dataset.fallbackApplied = "1"
                        img.src = cover.url
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
