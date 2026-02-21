"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Calendar, Download, FileText, Loader2, Package, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadEntitledFile } from "@/components/download-button"

type DownloadFile = {
  id: string
  fileName: string
}

type DownloadItem = {
  id: string
  productId: string
  title: string
  thumbnailUrl: string | null
  creatorName: string
  purchasedAtLabel: string
  files: DownloadFile[]
  highlight?: boolean
}

export function DownloadsGrid({ items }: { items: DownloadItem[] }) {
  const [activeItem, setActiveItem] = useState<DownloadItem | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Picker animation state (shared by desktop modal and mobile bottom sheet)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerAnimating, setPickerAnimating] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Open picker with animation
  const openPicker = useCallback((item: DownloadItem) => {
    setActiveItem(item)
    setPickerVisible(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPickerAnimating(true)
      })
    })
  }, [])

  // Close picker with smooth animation
  const closePicker = useCallback(() => {
    setPickerAnimating(false)
    setTimeout(() => {
      setPickerVisible(false)
      setActiveItem(null)
    }, 400)
  }, [])

  // Close on Escape key
  useEffect(() => {
    if (!pickerVisible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [pickerVisible, closePicker])

  // Body scroll lock while file picker is open
  useEffect(() => {
    if (!pickerVisible) return
    const scrollY = window.scrollY
    document.body.style.setProperty("--scroll-y", `-${scrollY}px`)
    document.body.classList.add("modal-open")
    return () => {
      document.body.classList.remove("modal-open")
      document.body.style.removeProperty("--scroll-y")
      window.scrollTo(0, scrollY)
    }
  }, [pickerVisible])

  const handleDownload = async (assetId: string) => {
    setDownloadingFileId(assetId)
    await downloadEntitledFile(assetId)
    setDownloadingFileId(null)
  }

  const fileRows = (
    <div className="space-y-2.5">
      {activeItem?.files.map((file) => (
        <div key={file.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 min-h-[52px]">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
            <p className="truncate text-sm font-medium text-neutral-700">{file.fileName || "File"}</p>
          </div>
          <Button
            size="sm"
            onClick={() => handleDownload(file.id)}
            disabled={downloadingFileId === file.id}
            className="shrink-0 cursor-pointer bg-neutral-900 text-white hover:bg-black h-9 px-3"
          >
            {downloadingFileId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
              item.highlight ? "border-violet-300 ring-2 ring-violet-100" : "border-neutral-200"
            }`}
          >
            <Link href={`/library/products/${item.productId}`} className="block">
              <div className="relative aspect-video overflow-hidden bg-neutral-100">
                {item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl || "/placeholder.svg"}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-8 w-8 text-neutral-400" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-neutral-900 group-hover:text-violet-700">{item.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">by {item.creatorName}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                  <Calendar className="h-3 w-3" />
                  <span>Purchased {item.purchasedAtLabel}</span>
                </div>
              </div>
            </Link>

            <div className="border-t border-neutral-200 p-3">
              {item.files.length === 1 ? (
                <Button
                  className="w-full h-12 cursor-pointer bg-neutral-900 text-white hover:bg-black overflow-hidden"
                  onClick={() => handleDownload(item.files[0].id)}
                  disabled={downloadingFileId === item.files[0].id}
                >
                  {downloadingFileId === item.files[0].id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                      <span className="truncate">Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">Download File</span>
                    </>
                  )}
                </Button>
              ) : item.files.length > 1 ? (
                <Button className="w-full h-12 cursor-pointer" variant="outline" onClick={() => openPicker(item)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Choose file ({item.files.length})
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="w-full bg-transparent cursor-pointer" asChild>
                  <Link href={`/library/products/${item.productId}`}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    View Details
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* File picker - custom overlay + modal (desktop) / bottom sheet (mobile) */}
      {pickerVisible && (
        <div className="fixed inset-0 z-[2147483638]">
          {/* Backdrop overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            style={{
              opacity: pickerAnimating ? 1 : 0,
              transition: "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closePicker}
            aria-hidden="true"
          />

          {isMobile ? (
            /* Mobile: Bottom sheet */
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-[20px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
              style={{
                transform: pickerAnimating ? "translateY(0)" : "translateY(100%)",
                transition: "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)",
                maxHeight: "85vh",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={activeItem?.title || "Choose file"}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-[5px] w-10 rounded-full bg-neutral-300" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-1 pb-4 border-b border-neutral-100">
                <h4 className="text-[17px] font-semibold text-neutral-900 truncate pr-3">{activeItem?.title}</h4>
                <button
                  type="button"
                  className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                  onClick={closePicker}
                  aria-label="Close"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              {/* File list */}
              <div className="px-5 py-4 max-h-[calc(85vh-100px)] overflow-y-auto overscroll-contain">
                {fileRows}
              </div>
            </div>
          ) : (
            /* Desktop: Centered modal with overlay */
            <div
              className="absolute inset-0 flex items-center justify-center p-4"
              onClick={closePicker}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200/80 ring-1 ring-black/[0.04]"
                style={{
                  opacity: pickerAnimating ? 1 : 0,
                  transform: pickerAnimating ? "scale(1) translateY(0)" : "scale(0.97) translateY(6px)",
                  transition: "opacity 250ms cubic-bezier(0.32, 0.72, 0, 1), transform 250ms cubic-bezier(0.32, 0.72, 0, 1)",
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={activeItem?.title || "Choose file"}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-100">
                  <h3 className="text-lg font-semibold text-neutral-900 truncate pr-3">
                    {activeItem?.title || "Download files"}
                  </h3>
                  <button
                    type="button"
                    className="h-9 w-9 shrink-0 rounded-full hover:bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer transition-colors"
                    onClick={closePicker}
                    aria-label="Close"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                </div>
                {/* File list */}
                <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
                  {fileRows}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
