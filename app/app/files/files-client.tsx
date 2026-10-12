"use client"

/**
 * FILES: the store's pictures in one place (components/files/files-library),
 * the same list the website builder's "Choose from your files" opens.
 */
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { FilesLibrary } from "@/components/files/files-library"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"

export function FilesClient() {
  /* "Open in Files" from the builder's chooser lands here with ?file=<id>: that file's details open. */
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => setOpenId(new URLSearchParams(window.location.search).get("file")), [])
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Files</h1>
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <p className="mb-3 text-[13.5px] text-[#6b7280]">Every picture and video you&apos;ve uploaded, from products, your website and here. Use any of them again on your website and products.</p>
        <section aria-label="Files" className={cn(card, "p-3 sm:p-4")}>
          <FilesLibrary mode="manage" kind="media" openId={openId} />
        </section>
      </div>
    </div>
  )
}
