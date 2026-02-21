"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Calendar, CheckCircle, Download, FileText, Loader2, Package, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

// Lightweight toast notification
function DownloadToast({ message, visible, onDone }: { message: string; visible: boolean; onDone: () => void }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 4000)
      return () => clearTimeout(t)
    }
  }, [visible, onDone])

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
        {message}
      </div>
    </div>
  )
}

export function DownloadsGrid({ items }: { items: DownloadItem[] }) {
  const [activeItem, setActiveItem] = useState<DownloadItem | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState("")
  const [toastVisible, setToastVisible] = useState(false)

  // Mobile bottom sheet close animation state
  const [sheetClosing, setSheetClosing] = useState(false)

  const isMobile = useMemo(() => typeof window !== "undefined" && window.innerWidth <= 768, [activeItem])

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
  }, [])

  const hideToast = useCallback(() => {
    setToastVisible(false)
  }, [])

  const handleDownload = async (assetId: string, fileName?: string) => {
    setDownloadingFileId(assetId)
    const result = await downloadEntitledFile(assetId)
    setDownloadingFileId(null)

    if (result.success) {
      showToast(`Successfully downloaded${fileName ? `: ${fileName}` : ""}`)
    }
  }

  const closeMobileSheet = useCallback(() => {
    setSheetClosing(true)
    setTimeout(() => {
      setActiveItem(null)
      setSheetClosing(false)
    }, 250)
  }, [])

  const fileRows = (
    <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
      {activeItem?.files.map((file) => (
        <div key={file.id} className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5">
          <p className="truncate pr-3 text-sm text-neutral-700">{file.fileName || "File"}</p>
          <Button
            size="sm"
            onClick={() => handleDownload(file.id, file.fileName)}
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
      <DownloadToast message={toastMessage} visible={toastVisible} onDone={hideToast} />

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
                  onClick={() => handleDownload(item.files[0].id, item.files[0].fileName)}
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

      {/* Desktop dialog */}
      {!isMobile && (
        <Dialog open={!!activeItem} onOpenChange={(open) => !open && setActiveItem(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{activeItem?.title || "Download files"}</DialogTitle>
              <DialogDescription className="sr-only">Choose and download included files.</DialogDescription>
            </DialogHeader>
            {fileRows}
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile bottom sheet with smooth open/close animation */}
      {isMobile && activeItem && (
        <div
          className={`fixed inset-0 z-[80] transition-opacity duration-250 ${sheetClosing ? "opacity-0" : "opacity-100 bg-black/45"}`}
          onClick={closeMobileSheet}
        >
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-4 pt-3 shadow-2xl transition-transform duration-250 ease-out ${
              sheetClosing ? "translate-y-full" : "translate-y-0 animate-in slide-in-from-bottom duration-300"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-neutral-200" />
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[16px] font-semibold text-neutral-900 truncate pr-2">{activeItem.title}</h4>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-neutral-200 text-neutral-500 flex items-center justify-center cursor-pointer"
                onClick={closeMobileSheet}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {fileRows}
          </div>
        </div>
      )}
    </>
  )
}
