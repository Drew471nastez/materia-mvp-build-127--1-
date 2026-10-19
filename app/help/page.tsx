import { publicHelpUrl } from "@/lib/help/paths"
import type { Metadata } from "next"
import Link from "next/link"
import { POPULAR_HELP, helpArticle, helpArticlePath, helpArticlesIn, helpCategoriesFor, helpVisible, helpCategory } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ContactSupport } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero, TopicIcon } from "@/components/help/help-hero"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { helpHomeJsonLd } from "@/lib/help/structured-data"

const DESCRIPTION = "Step by step guides and answers for selling on Storelib: products, shipping, orders and payouts, your website, email, billing and policies."

export const metadata: Metadata = {
  title: { absolute: "Storelib Help Center: guides and answers" },
  description: DESCRIPTION,
  alternates: { canonical: publicHelpUrl("/") },
  openGraph: { title: "Storelib Help Center", description: DESCRIPTION, url: "/help", siteName: "Storelib", type: "website" },
  twitter: { card: "summary", title: "Storelib Help Center", description: DESCRIPTION },
}

/**
 * ===========================================================================
 *  /help
 * ===========================================================================
 * The band with the search first, because most people arrive with a
 * question. Under it every topic as a card, its own mark, what it covers
 * and how many articles it holds, two to a row (one on a phone), with the
 * answers for order problems as a card of its own. Then the articles most
 * people come for, and how to reach a person.
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
    <div className="bg-[#f8f9fa]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpHomeJsonLd(DESCRIPTION)) }} />
      <HelpHero home />

      <div className={`${HELP_WIDTH} py-10 sm:py-14`}>
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5" aria-label="Topics">
          {categories.map((category) => (
            <li key={category.slug}>
              <TopicCard href={`/help/${category.slug}`} slug={category.slug} title={category.title} description={category.description} count={helpArticlesIn(category.slug).length} />
            </li>
          ))}
          <li>
            <TopicCard href="/help/questions" slug="questions" title="Order problems" description="What to do when an order goes wrong, for stores and for buyers." />
          </li>
        </ul>

        {popular.length > 0 ? (
          <section aria-labelledby="popular" className="mt-14">
            <h2 id="popular" className="text-[18px] font-semibold tracking-tight text-[#1a1a2e]">
              Popular articles
            </h2>
            <ul className="mt-4 divide-y divide-[#f0f0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white">
              {popular.map((a) => (
                <li key={helpArticlePath(a)}>
                  <Link href={helpArticlePath(a)} className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#fafafb]">
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug text-[#1a1a2e]">{a.title}</span>
                      <span className="mt-0.5 block text-[13px] text-[#6b7280]">{helpCategory(a.category)?.title}</span>
                    </span>
                    <span aria-hidden className="shrink-0 text-[#c4c7cd] transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-[#6b7280]">
                      &rarr;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="bg-white">
        <ContactSupport frame={HELP_WIDTH} />
      </div>
    </div>
  )
}

/** One topic: its mark, its name, what it covers, how many articles. The whole card is the link. */
function TopicCard({ href, slug, title, description, count }: { href: string; slug: string; title: string; description: string; count?: number }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-[#e5e7eb]/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] outline-none transition-[box-shadow,border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-[#dcdfe4] hover:shadow-[0_10px_28px_-16px_rgba(16,24,40,0.22)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:p-6"
      data-help-topic={slug}
    >
      <TopicIcon slug={slug} />
      <span className="mt-4 block text-[17px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{title}</span>
      <span className="mt-1 block text-[14.5px] leading-relaxed text-[#4b5563]">{description}</span>
      {typeof count === "number" ? <span className="mt-auto block pt-4 text-[13px] text-[#6b7280]">{count} {count === 1 ? "article" : "articles"}</span> : null}
    </Link>
  )
}
