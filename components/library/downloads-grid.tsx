"use client"

import { useEffect, useState, useCallback } from "react"
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const isPickerOpen = activeItem !== null

  const closePicker = useCallback(() => setActiveItem(null), [])

  // Close on Escape key
  useEffect(() => {
    if (!isPickerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isPickerOpen, closePicker])

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
                <Button className="w-full h-12 cursor-pointer" variant="outline" onClick={() => setActiveItem(item)}>
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

      {/* ──────────────────────────────────────────────────────────────
          Pure CSS file picker — NO Radix Dialog/Sheet, NO react-remove-scroll.
          Eliminates every possible scroll-lock side-effect.
          Desktop: centered modal.  Mobile: bottom sheet.
          ────────────────────────────────────────────────────────────── */}

      {/* Backdrop — always in DOM, visibility via opacity + pointer-events */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 transition-opacity duration-200 ease-out"
        style={{
          opacity: isPickerOpen ? 1 : 0,
          pointerEvents: isPickerOpen ? "auto" : "none",
        }}
        onClick={closePicker}
        aria-hidden="true"
      />

      {/* Desktop modal — always in DOM, visibility via opacity + scale */}
      {!isMobile && (
        <div
          className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          style={{
            pointerEvents: isPickerOpen ? "auto" : "none",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a file to download"
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl transition-all duration-200 ease-out"
            style={{
              opacity: isPickerOpen ? 1 : 0,
              transform: isPickerOpen ? "scale(1)" : "scale(0.96)",
              pointerEvents: isPickerOpen ? "auto" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-semibold truncate pr-4 text-neutral-900">
                {activeItem?.title || "Download files"}
              </h2>
              <button
                type="button"
                className="h-8 w-8 shrink-0 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 flex items-center justify-center transition-colors cursor-pointer"
                onClick={closePicker}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              {fileRows}
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom sheet — always in DOM, slides via translateY */}
      {isMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a file to download"
          className="fixed inset-x-0 bottom-0 z-[101] rounded-t-[20px] bg-white shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            transform: isPickerOpen ? "translateY(0)" : "translateY(100%)",
            maxHeight: "85vh",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-[5px] w-10 rounded-full bg-neutral-300" />
          </div>
          <div className="flex items-center justify-between px-5 pt-1 pb-4 border-b border-neutral-100">
            <h2 className="text-[17px] font-semibold text-neutral-900 truncate pr-3">
              {activeItem?.title}
            </h2>
            <button
              type="button"
              className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
              onClick={closePicker}
              aria-label="Close"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="px-5 py-4 max-h-[calc(85vh-100px)] overflow-y-auto overscroll-contain">
            {fileRows}
          </div>
        </div>
      )}
    </>
  )
}
