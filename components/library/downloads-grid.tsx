"use client"

import { useEffect, useState, useCallback } from "react"
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

   Uses INLINE styles for critical backdrop/animation properties to
   guarantee visibility regardless of CSS compilation.

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
  const [animateIn, setAnimateIn] = useState(false)
  const [isClosingInProgress, setIsClosingInProgress] = useState(false)

  // Double-rAF: guarantees the browser has painted opacity:0 / translateY(100%)
  // BEFORE we flip to the final state, so the CSS transition actually fires.
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimateIn(true)
      })
    })
  }, [])

  const handleClose = useCallback(() => {
    if (isClosingInProgress) return
    setIsClosingInProgress(true)
    setAnimateIn(false)
    setTimeout(() => {
      onClose()
    }, 360)
  }, [onClose, isClosingInProgress])

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
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [handleClose])

  const fileList = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {item.files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onDownload(file.id)}
          disabled={downloadingFileId === file.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #e5e5e5",
            backgroundColor: "#fff",
            cursor: downloadingFileId === file.id ? "default" : "pointer",
            opacity: downloadingFileId === file.id ? 0.6 : 1,
            textAlign: "left" as const,
            transition: "background-color 150ms",
          }}
          onMouseEnter={(e) => {
            if (downloadingFileId !== file.id)
              (e.currentTarget as HTMLElement).style.backgroundColor = "#fafafa"
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#fff"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, paddingRight: 12 }}>
            <div
              style={{
                display: "flex",
                height: 36,
                width: 36,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                backgroundColor: "#f5f5f5",
              }}
            >
              <FileText style={{ height: 16, width: 16, color: "#737373" }} />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#262626",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {file.fileName || "File"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              height: 32,
              width: 32,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: "#171717",
              color: "#fff",
            }}
          >
            {downloadingFileId === file.id ? (
              <Loader2 style={{ height: 14, width: 14 }} className="animate-spin" />
            ) : (
              <Download style={{ height: 14, width: 14 }} />
            )}
          </div>
        </button>
      ))}
    </div>
  )

  return createPortal(
    <>
      {/* ─── Backdrop ─── dark overlay covering ENTIRE viewport */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99998,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          opacity: animateIn ? 1 : 0,
          transition: "opacity 200ms ease-out",
        }}
      />

      {/* ─── Desktop modal (≥768px) ─── */}
      <div
        onClick={handleClose}
        className="hidden md:flex"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a file to download"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 448,
            borderRadius: 16,
            backgroundColor: "#fff",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
            opacity: animateIn ? 1 : 0,
            transform: animateIn ? "scale(1) translateY(0)" : "scale(0.97) translateY(8px)",
            transition: "opacity 200ms ease-out, transform 200ms ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 24px 16px 24px" }}>
            <div style={{ minWidth: 0, paddingRight: 16 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#171717",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                  margin: 0,
                }}
              >
                {item.title}
              </h2>
              <p style={{ marginTop: 2, fontSize: 14, color: "#737373" }}>
                {item.files.length} file{item.files.length !== 1 ? "s" : ""} available
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                display: "flex",
                height: 32,
                width: 32,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                border: "none",
                backgroundColor: "transparent",
                color: "#a3a3a3",
                cursor: "pointer",
                transition: "background-color 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "#f5f5f5"
                ;(e.currentTarget as HTMLElement).style.color = "#525252"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
                ;(e.currentTarget as HTMLElement).style.color = "#a3a3a3"
              }}
            >
              <X style={{ height: 16, width: 16 }} />
            </button>
          </div>

          {/* Divider */}
          <div style={{ margin: "0 24px", borderTop: "1px solid #f5f5f5" }} />

          {/* File list */}
          <div style={{ padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
            {fileList}
          </div>
        </div>
      </div>

      {/* ─── Mobile bottom sheet (<768px) ─── */}
      <div
        className="md:hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a file to download"
          style={{
            borderRadius: "16px 16px 0 0",
            backgroundColor: "#fff",
            boxShadow: "0 -10px 40px -8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            transform: animateIn ? "translateY(0)" : "translateY(100%)",
            transition: "transform 350ms cubic-bezier(0.32, 0.72, 0, 1)",
            maxHeight: "85dvh",
            paddingBottom: "env(safe-area-inset-bottom)",
            display: "flex",
            flexDirection: "column" as const,
          }}
        >
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 8 }}>
            <div style={{ height: 4, width: 36, borderRadius: 9999, backgroundColor: "#d4d4d4" }} />
          </div>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px 20px" }}>
            <div style={{ minWidth: 0, paddingRight: 12 }}>
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: "#171717",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                  margin: 0,
                }}
              >
                {item.title}
              </h2>
              <p style={{ marginTop: 2, fontSize: 13, color: "#737373" }}>
                {item.files.length} file{item.files.length !== 1 ? "s" : ""} available
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                display: "flex",
                height: 32,
                width: 32,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                border: "none",
                backgroundColor: "#f5f5f5",
                color: "#737373",
                cursor: "pointer",
              }}
            >
              <X style={{ height: 16, width: 16 }} />
            </button>
          </div>

          {/* Divider */}
          <div style={{ margin: "0 20px", borderTop: "1px solid #f5f5f5" }} />

          {/* File list */}
          <div
            style={{
              padding: "16px 20px",
              maxHeight: "calc(85dvh - 110px)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {fileList}
          </div>
        </div>
      </div>
    </>,
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
