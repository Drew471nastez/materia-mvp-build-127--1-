"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Calendar, Download, FileText, Loader2, Package, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadEntitledFile } from "@/components/download-button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

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

  const handlePickerClose = (open: boolean) => {
    if (!open) setActiveItem(null)
  }

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

      {/* Desktop: Radix Dialog with proper overlay */}
      <Dialog open={isPickerOpen && !isMobile} onOpenChange={handlePickerClose}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-neutral-100">
            <DialogTitle className="truncate pr-6 text-neutral-900">
              {activeItem?.title || "Download files"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Choose a file to download
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {fileRows}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile: Radix Sheet as bottom sheet with proper overlay */}
      <Sheet open={isPickerOpen && isMobile} onOpenChange={handlePickerClose}>
        <SheetContent
          side="bottom"
          hideCloseButton
          className="rounded-t-[20px] border-t-0 p-0 gap-0 max-h-[85vh] pb-[env(safe-area-inset-bottom)]"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-[5px] w-10 rounded-full bg-neutral-300" />
          </div>
          <SheetHeader className="px-5 pt-1 pb-4 border-b border-neutral-100 gap-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-[17px] text-neutral-900 truncate pr-3">
                {activeItem?.title}
              </SheetTitle>
              <button
                type="button"
                className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                onClick={() => setActiveItem(null)}
                aria-label="Close"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <SheetDescription className="sr-only">
              Choose a file to download
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 py-4 max-h-[calc(85vh-100px)] overflow-y-auto overscroll-contain">
            {fileRows}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
