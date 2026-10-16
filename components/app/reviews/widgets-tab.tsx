"use client"

/**
 * ===========================================================================
 *  REVIEWS › WIDGETS
 * ===========================================================================
 * Where reviews show on the store's website: the four review sections the
 * website editor offers (Storelib themes draw them from themes/default/
 * sections/reviews_*.storelib, imported themes from lib/storelib-theme/
 * compat/storelib-reviews.ts), what product pages get on their own, and the
 * website's /reviews page. Each says where to add it; the look follows the
 * theme and Reviews › Settings › On your website.
 *
 * The widget gallery (components/app/reviews/widgets) takes this tab over
 * when it lands: app/app/reviews/widgets/page.tsx renders it in place of
 * this list.
 */
import Link from "next/link"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { REVIEWS_BODY, reviewsHref } from "./reviews-nav"

export function ReviewsWidgetsTab({ enabled, productPage }: { enabled: boolean; productPage: boolean }) {
  const sections = [
    { name: tt("Product reviews"), where: tt("A product page"), what: tt("The product's rating, its reviews with photos and replies, and the form to write one.") },
    { name: tt("Star rating"), where: tt("Any page"), what: tt("The stars and the number of reviews, for one product or the whole store.") },
    { name: tt("Reviews carousel"), where: tt("Home and landing pages"), what: tt("Featured reviews, or else four and five star ones, one after another.") },
    { name: tt("All reviews"), where: tt("Any page"), what: tt("Every review of every product, with each one's product.") },
  ]
  return (
    <div className={REVIEWS_BODY} data-reviews-widgets="">
      {!enabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3 text-[14px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]">
          <span className="min-w-0 flex-1">{tt("Storelib Reviews is off, so these draw nothing on your live website.")}</span>
          <Link href={reviewsHref("settings")} className={cn(buttonPrimary, "h-9 px-3.5 max-md:h-10")}>
            {tt("Turn on")}
          </Link>
        </div>
      ) : null}

      <section className={cn(card, "mt-3 overflow-hidden")} aria-labelledby="widgets-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="widgets-auto" className="text-[15px] font-semibold text-[#1a1a2e]">
              {tt("On every product page")}
            </h2>
            <p className="mt-0.5 text-[14px] text-[#6b7280]">
              {productPage ? tt("Stars under the product name and reviews under the product, with nothing to add.") : tt("Off. Product pages show reviews only where you add the sections below.")}
            </p>
          </div>
          <Link href={reviewsHref("settings")} className={cn(buttonSecondary, "max-md:h-10")}>
            {productPage ? tt("Change") : tt("Turn on")}
          </Link>
        </div>
      </section>

      <section className={cn(card, "mt-3 overflow-hidden")} aria-labelledby="widgets-sections">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3 sm:px-6">
          <h2 id="widgets-sections" className="text-[15px] font-semibold text-[#1a1a2e]">
            {tt("Sections for your website")}
          </h2>
          <Link href="/app/website-builder" className={cn(buttonPrimary, "max-md:h-10")}>
            {tt("Open the website editor")}
          </Link>
        </div>
        <ul className="divide-y divide-[#f1f2f4]">
          {sections.map((s) => (
            <li key={s.name} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)_180px] sm:items-center sm:gap-4 sm:px-6">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{s.name}</p>
              <p className="text-[14px] text-[#4b5563]">{s.what}</p>
              <p className="text-[13px] text-[#9ca3af] sm:text-right">{s.where}</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-[#f1f2f4] px-4 py-3 text-[13px] text-[#6b7280] sm:px-6">
          {tt("In the editor they are under Add section. Imported themes get them too, and a Judge.me block the theme kept shows Storelib Reviews in its place. Your website also has a reviews page at /reviews.")}
        </p>
      </section>
    </div>
  )
}
