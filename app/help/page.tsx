import type { Metadata } from "next"
import Link from "next/link"
import { POPULAR_HELP, helpArticle, helpArticlePath, helpArticlesIn, helpCategoriesFor, helpVisible, helpCategory } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ContactSupport, HELP_CONTAINER } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { helpHomeJsonLd } from "@/lib/help/structured-data"

const DESCRIPTION = "Answers and step by step guides for selling on Storelib: products, physical products and shipping, orders and payouts, your website, email, billing and policies."

export const metadata: Metadata = {
  title: { absolute: "Storelib Help Center: guides and answers" },
  description: DESCRIPTION,
  alternates: { canonical: "/help" },
  openGraph: { title: "Storelib Help Center", description: DESCRIPTION, url: "/help", siteName: "Storelib", type: "website" },
  twitter: { card: "summary", title: "Storelib Help Center", description: DESCRIPTION },
}

/**
 * ===========================================================================
 *  /help
 * ===========================================================================
 * A search field first, because most people arrive with a question. Under
 * it, the articles most people come for, then every topic with its first
 * articles. One plain line points at the answers about order problems
 * (/help/questions) for stores and buyers; it used to be a highlighted box
 * and is a sentence now, as the owner asked.
 */
/* The physical products guide follows the switch in /admin; the switch also revalidates /help at once. */
export const revalidate = 60

export default async function HelpPage() {
  const physical = await isPhysicalCommerceEnabled()
  const categories = helpCategoriesFor(physical)
  const popular = POPULAR_HELP.map((p) => {
    const [c, s] = p.split("/")
    return helpVisible(helpCategory(c), physical) ? helpArticle(c, s) : undefined
  }).filter((a): a is NonNullable<typeof a> => !!a)

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpHomeJsonLd(DESCRIPTION)) }} />
      <header className="border-b border-[#eceef1] bg-[#f8f9fa]">
        <div className={`${HELP_CONTAINER} py-12 sm:py-16`}>
          <div className="mx-auto max-w-[680px] text-center">
            <p className="text-[14px] font-medium text-[#6b7280]">Storelib Help Center</p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">How can we help?</h1>
            <div className="mt-6 text-left sm:mt-8">
              <HelpSearch size="large" />
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6b7280]" data-help-questions-line="">
              A problem with an order? Here&apos;s{" "}
              <Link href="/help/questions" className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]">
                what to do, for stores and buyers
              </Link>
              .
            </p>
          </div>
        </div>
      </header>

      <div className={`${HELP_CONTAINER} py-10 sm:py-14`}>
        {popular.length > 0 ? (
          <section aria-labelledby="popular" className="mb-14">
            <h2 id="popular" className="text-[18px] font-semibold tracking-tight text-[#1a1a2e]">
              Popular articles
            </h2>
            <ul className="mt-3 grid border-t border-[#f0f0f2] sm:grid-cols-2 sm:gap-x-10">
              {popular.map((a) => (
                <li key={helpArticlePath(a)} className="border-b border-[#f0f0f2]">
                  <Link href={helpArticlePath(a)} className="group flex items-center justify-between gap-4 py-3.5">
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-2">{a.title}</span>
                      <span className="mt-0.5 block text-[13px] text-[#6b7280]">{helpCategory(a.category)?.title}</span>
                    </span>
                    <span aria-hidden className="shrink-0 text-[#c4c7cd] transition-[translate] group-hover:translate-x-0.5 group-hover:text-[#6b7280]">
                      &rarr;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <h2 className="text-[18px] font-semibold tracking-tight text-[#1a1a2e]">Browse by topic</h2>
        <div className="mt-5 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const articles = helpArticlesIn(category.slug)
            return (
              <section key={category.slug} aria-labelledby={`c-${category.slug}`} className="border-t border-[#e5e7eb] pt-5" data-help-topic={category.slug}>
                <h3 id={`c-${category.slug}`} className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">
                  <Link href={`/help/${category.slug}`} className="hover:underline hover:decoration-[#1a1a2e]/30 hover:underline-offset-4">
                    {category.title}
                  </Link>
                </h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">{category.description}</p>
                <ul className="mt-4 space-y-2.5">
                  {articles.slice(0, 4).map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={helpArticlePath(a)}
                        className="text-[14.5px] leading-snug text-[#1a1a2e] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-[#1a1a2e]/40"
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
