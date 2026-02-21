"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
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

/* ────────────────────────────────────────────────────────────────
   File picker overlay — rendered via createPortal to document.body
   so it always covers the ENTIRE viewport (sidebar, header, etc.)
   regardless of parent CSS transforms, contain, or stacking context.

   Desktop ≥ 768 px → centered modal card
   Mobile  < 768 px → bottom sheet
   ──────────────────────────────────────────────────────────────── */
function FilePickerOverlay({
  item,
  onClose,
  downloadingFileId,
  onDownload,
}: {
  item: DownloadItem
  onClose: () => void
  downloadingFileId: string | null
  onDownload: (id: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Animate in on mount
  useEffect(() => {
    // Force a reflow so the transition fires
    overlayRef.current?.getBoundingClientRect()
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const fileRows = (
    <div className="space-y-2">
      {item.files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onDownload(file.id)}
          disabled={downloadingFileId === file.id}
          className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-60 cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
              <FileText className="h-4 w-4 text-neutral-500" />
            </div>
            <span className="truncate text-sm font-medium text-neutral-800">
              {file.fileName || "File"}
            </span>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
            {downloadingFileId === file.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </div>
        </button>
      ))}
    </div>
  )

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[9999]" role="presentation">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ─── Desktop modal ─── */}
      <div
        className="hidden md:flex absolute inset-0 items-center justify-center p-6"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a file to download"
          className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-200 ease-out"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1) translateY(0)" : "scale(0.97) translateY(8px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <div className="min-w-0 pr-4">
              <h2 className="truncate text-lg font-semibold text-neutral-900">
                {item.title}
              </h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                {item.files.length} file{item.files.length !== 1 ? "s" : ""} available
              </p>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-neutral-100" />

          {/* File list */}
          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {fileRows}
          </div>
        </div>
      </div>

      {/* ─── Mobile bottom sheet ─── */}
      <div
        className="md:hidden absolute inset-x-0 bottom-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a file to download"
          className="rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            transform: visible ? "translateY(0)" : "translateY(100%)",
            maxHeight: "85dvh",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="h-1 w-9 rounded-full bg-neutral-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3">
            <div className="min-w-0 pr-3">
              <h2 className="truncate text-[17px] font-semibold text-neutral-900">
                {item.title}
              </h2>
              <p className="mt-0.5 text-[13px] text-neutral-500">
                {item.files.length} file{item.files.length !== 1 ? "s" : ""} available
              </p>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 cursor-pointer active:scale-95 transition-transform"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-neutral-100" />

          {/* File list */}
          <div className="px-5 py-4 max-h-[calc(85dvh-100px)] overflow-y-auto overscroll-contain">
            {fileRows}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function DownloadsGrid({ items }: { items: DownloadItem[] }) {
  const [activeItem, setActiveItem] = useState<DownloadItem | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)

  const closePicker = useCallback(() => setActiveItem(null), [])

  const handleDownload = async (assetId: string) => {
    setDownloadingFileId(assetId)
    await downloadEntitledFile(assetId)
    setDownloadingFileId(null)
  }

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

      {/* File picker — portaled to document.body for proper full-viewport overlay */}
      {activeItem && (
        <FilePickerOverlay
          item={activeItem}
          onClose={closePicker}
          downloadingFileId={downloadingFileId}
          onDownload={handleDownload}
        />
      )}
    </>
  )
}
