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
    }, 300)
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

  const handleDownload = async (assetId: string) => {
    setDownloadingFileId(assetId)
    await downloadEntitledFile(assetId)
    setDownloadingFileId(null)
  }

  const fileRows = (
    <div className="space-y-2">
      {activeItem?.files.map((file) => (
        <div key={file.id} className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5">
          <p className="truncate pr-3 text-sm text-neutral-700">{file.fileName || "File"}</p>
          <Button
            size="sm"
            onClick={() => handleDownload(file.id)}
            disabled={downloadingFileId === file.id}
            className="shrink-0 cursor-pointer bg-neutral-900 text-white hover:bg-black"
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
        <div className="fixed inset-0 z-[80]">
          {/* Backdrop overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            style={{
              opacity: pickerAnimating ? 1 : 0,
              transition: "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closePicker}
          />

          {isMobile ? (
            /* Mobile: Bottom sheet */
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white shadow-2xl"
              style={{
                transform: pickerAnimating ? "translateY(0)" : "translateY(100%)",
                transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
                maxHeight: "80vh",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-neutral-300" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3">
                <h4 className="text-base font-semibold text-neutral-900 truncate pr-2">{activeItem?.title}</h4>
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer"
                  onClick={closePicker}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* File list */}
              <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto overscroll-contain">
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
                className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-neutral-200"
                style={{
                  opacity: pickerAnimating ? 1 : 0,
                  transform: pickerAnimating ? "scale(1) translateY(0)" : "scale(0.96) translateY(8px)",
                  transition: "opacity 200ms ease-out, transform 200ms ease-out",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-4">
                  <h3 className="text-lg font-semibold text-neutral-900 truncate pr-2">
                    {activeItem?.title || "Download files"}
                  </h3>
                  <button
                    type="button"
                    className="h-8 w-8 shrink-0 rounded-full hover:bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer transition-colors"
                    onClick={closePicker}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* File list */}
                <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto">
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
