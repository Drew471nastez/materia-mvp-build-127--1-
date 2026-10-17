"use client"

/**
 * STORELIB REVIEWS › WIDGETS: THE WIDGETS GALLERY'S PLACE.
 *
 * The reviews navigation (./reviews-manage.tsx) draws whatever this file's
 * ReviewsWidgetsTab is. The widgets gallery (round K6: each widget with its
 * settings, saved looks, Add to website) replaces the component below with
 * its own, keeping the export's name; nothing else needs to change.
 *
 * Until then it says where the review sections are placed today: under Add
 * section in the website editor, and on every product page on their own
 * while "Add to product pages" is on (Settings).
 */
import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { buttonPrimary } from "@/app/app/orders/order-parts"
import { CARD, H3, MUTED } from "./parts"

export function ReviewsWidgetsTab() {
  const placed = [
    { name: tt("Product reviews"), where: tt("Under a product, with the average and the form") },
    { name: tt("Star rating"), where: tt("Stars and the count, under a product's name") },
    { name: tt("Reviews carousel"), where: tt("Your featured reviews, on any page") },
    { name: tt("All reviews"), where: tt("Every review, on its own page at /reviews") },
  ]
  return (
    <section className={cn(CARD, "p-4 sm:p-6")} data-reviews-widgets="placeholder">
      <h3 className={H3}>{tt("Reviews on your website")}</h3>
      <p className={cn(MUTED, "mt-1 max-w-[560px]")}>{tt("Add these from Add section in the website editor, under Reviews. Product pages get stars and reviews on their own while Add to product pages is on in Settings.")}</p>
      <ul className="mt-4 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]">
        {placed.map((w) => (
          <li key={w.name} className="flex flex-col gap-0.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{w.name}</span>
            <span className="text-[13px] text-[#6b7280]">{w.where}</span>
          </li>
        ))}
      </ul>
      <Link href="/app/website-builder" className={cn(buttonPrimary, "mt-4 h-10 px-4 text-[14px]")}>
        {tt("Open the website editor")}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  )
}
