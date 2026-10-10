import type { Metadata } from "next"
import Link from "next/link"
import { helpArticlePath, helpArticlesIn, helpCategoriesFor } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ContactSupport, HELP_CONTAINER } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"

const DESCRIPTION = "How Storelib works: setting up, products, orders and payouts, the website builder, email, billing and policies."

export const metadata: Metadata = {
  title: "Help Center",
  description: DESCRIPTION,
  alternates: { canonical: "/help" },
  openGraph: { title: "Storelib Help Center", description: DESCRIPTION, url: "/help", siteName: "Storelib", type: "website" },
}

/**
 * ===========================================================================
 *  /help
 * ===========================================================================
 * It was a page of placeholders: a search box that searched nothing, forty
 * article titles that all linked to "#", an icon on every card and a purple
 * gradient box at the bottom. The articles exist now (lib/help/articles),
 * the search searches them, and the page is a search field and the seven
 * topics, set as type rather than as tiles.
 */
/* The physical products guide follows the switch in /admin; the switch also revalidates /help at once. */
export const revalidate = 60

export default async function HelpPage() {
  const categories = helpCategoriesFor(await isPhysicalCommerceEnabled())
  return (
    <div className="bg-white">
      <header className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
        <div className={`${HELP_CONTAINER} py-10 sm:py-14`}>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1a1a2e] sm:text-[32px]">Help Center</h1>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[#6b7280]">
            How Storelib works, from your first product to cashing out.
          </p>
          <div className="mt-6 max-w-[640px]">
            <HelpSearch size="large" />
          </div>
        </div>
      </header>

      <div className={`${HELP_CONTAINER} py-10 sm:py-14`}>
        {/* The page most people come for: what happens when something goes wrong, for both sides. */}
        <Link
          href="/help/questions"
          className="mb-10 flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#dfe2e6] hover:shadow-[0_2px_10px_-4px_rgba(17,24,39,0.10)] sm:p-6"
          data-help-questions-link=""
        >
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold tracking-tight text-[#1a1a2e]">What happens if...</span>
            <span className="mt-1 block text-[14px] leading-relaxed text-[#6b7280]">An order you can&apos;t fill, a parcel that never came, a refund, a download that won&apos;t open. What happens and what to do, for stores and buyers.</span>
          </span>
          <span aria-hidden className="shrink-0 text-[20px] text-[#9ca3af]">&rarr;</span>
        </Link>
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const articles = helpArticlesIn(category.slug)
            return (
              <section key={category.slug} aria-labelledby={`c-${category.slug}`} className="border-t border-[#e5e7eb] pt-5">
                <h2 id={`c-${category.slug}`} className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">
                  <Link href={`/help/${category.slug}`} className="hover:underline hover:underline-offset-4">
                    {category.title}
                  </Link>
                </h2>
                <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">{category.description}</p>
                <ul className="mt-4 space-y-2">
                  {articles.slice(0, 4).map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={helpArticlePath(a)}
                        className="text-[14px] leading-snug text-[#1a1a2e] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-[#1a1a2e]/40"
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                {articles.length > 4 && (
                  <Link href={`/help/${category.slug}`} className="mt-3 inline-block text-[14px] font-medium text-[#6d28d9] hover:underline hover:underline-offset-2">
                    All {articles.length} articles
                  </Link>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <ContactSupport />
    </div>
  )
}
