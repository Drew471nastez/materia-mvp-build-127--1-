"use client"

import type React from "react"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { AppLink } from "@/components/app/app-link"
import { useLanguage } from "@/lib/i18n"
import { asksInPlace, useNewProductChooser } from "@/app/app/products/new/kind-chooser"
import { NEW_PRODUCT_HREF } from "@/app/app/products/new/product-kinds"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  HOME'S FOUR QUICK ACTIONS
 * ===========================================================================
 * Create product, OnePage, View analytics and Add custom domain, two across
 * from a tablet up. Each is an AppLink (components/app/app-link), so a press
 * moves the way the sidebar does: the page fetched whole under the pointer,
 * the shell told where it is going, the stage's landing.
 *
 * THE THUMBNAILS ARE THE SIZE THEY ARE DRAWN. The four pictures are 1000px
 * PNGs in storage (80KB to 1.1MB each), drawn in a 64px box. They were asked
 * for at `width={128}`, so a 2x screen fetched and decoded the 256px copy:
 * 256KB of pixels each, four times, for a box a quarter of that. Now:
 *
 *   `sizes="64px"`   the browser picks from the optimiser's own widths the
 *                    smallest that fills the box at this screen's density:
 *                    64 at 1x, 128 at 2x, 256 at 3x (the next one up from
 *                    192), so a 3x phone is as sharp as before and nothing
 *                    else pays for it
 *   AVIF or WebP     next.config images.formats, at the default quality 75
 *   width, height    64 by 64 reserved, so nothing moves when they arrive
 *   lazy, async      below the fold on every screen: fetched as they come
 *                    near the viewport, decoded off the main thread, and at
 *                    low priority, behind anything the first screen needs
 */
const STORAGE = "https://storelib.com/media/platform%20images/"

const ACTIONS = [
  { href: "/app/products/new", image: "iiii.png", title: "dashboard.createProduct", body: "dashboard.createProductDesc" },
  { href: "/app/onepage", image: "ooaw.png", title: "dashboard.editOnePage", body: "dashboard.editOnePageDesc" },
  { href: "/app/analytics", image: "naaly.png", title: "dashboard.viewAnalytics", body: "dashboard.viewAnalyticsDesc" },
  { href: "/app/settings?tab=domains", image: "domani.png", title: null, body: null },
] as const

export function QuickActions() {
  const { t } = useLanguage()
  /* Create product asks what is being sold first, over Home (app/app/products/new/kind-chooser). */
  const newProduct = useNewProductChooser()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {newProduct.chooser}
      {ACTIONS.map((a) => {
        const title = a.title ? t(a.title) : tt("Add Custom Domain")
        const body = a.body ? t(a.body) : tt("Connect your own domain to your store")
        return (
          <AppLink
            key={a.href}
            href={a.href}
            data-quick-action=""
            {...(a.href === NEW_PRODUCT_HREF
              ? {
                  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
                    if (!asksInPlace(e)) return
                    e.preventDefault()
                    newProduct.open()
                  },
                  onMouseEnter: newProduct.warm,
                  onFocus: newProduct.warm,
                  onPointerDown: newProduct.warm,
                }
              : null)}
            className="group flex items-center gap-5 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] [-webkit-tap-highlight-color:transparent]"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f3f4f6]">
              <Image
                src={`${STORAGE}${a.image}`}
                alt=""
                width={64}
                height={64}
                sizes="64px"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                data-quick-thumb=""
                className="h-full w-full object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-[#1a1a2e] transition-colors group-hover:text-[#8b5cf6]">{title}</span>
                <ArrowRight className="h-4 w-4 text-[#d1d5db] transition-[color,translate] group-hover:translate-x-0.5 group-hover:text-[#8b5cf6]" aria-hidden="true" />
              </span>
              <span className="mt-0.5 block text-[13px] text-[#6b7280]">{body}</span>
            </span>
          </AppLink>
        )
      })}
    </div>
  )
}
