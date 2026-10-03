import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ALL_HELP_ARTICLES, helpArticle, helpArticlePath, helpArticlesIn, helpCategory, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ArticleBody, Breadcrumbs, ContactSupport, HELP_READING } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"
import { cn } from "@/lib/utils"
import { jsonLdScript } from "@/lib/seo/json-ld"

export const dynamicParams = false
export const revalidate = 60

export function generateStaticParams() {
  return ALL_HELP_ARTICLES.map((a) => ({ category: a.category, article: a.slug }))
}

interface PageProps {
  params: Promise<{ category: string; article: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, article: slug } = await params
  const article = helpArticle(category, slug)
  if (!article) return { title: "Not Found" }
  const path = helpArticlePath(article)
  return {
    title: `${article.title} | Help Center`,
    description: article.summary,
    alternates: { canonical: path },
    openGraph: { title: `${article.title} | Storelib Help Center`, description: article.summary, url: path, siteName: "Storelib", type: "article" },
  }
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { category: categorySlug, article: slug } = await params
  const article = helpArticle(categorySlug, slug)
  const category = helpCategory(categorySlug)
  if (!article || !category || !helpVisible(category, await isPhysicalCommerceEnabled())) notFound()
  const siblings = helpArticlesIn(category.slug)

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Help Center", item: "https://storelib.com/help" },
      { "@type": "ListItem", position: 2, name: category.title, item: `https://storelib.com/help/${category.slug}` },
      { "@type": "ListItem", position: 3, name: article.title, item: `https://storelib.com${helpArticlePath(article)}` },
    ],
  }

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />
      <header className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
        <div className={`${HELP_READING} flex flex-col gap-5 py-6 sm:py-8 lg:flex-row lg:items-center lg:justify-between`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: category.title, href: `/help/${category.slug}` }]} />
          <div className="w-full lg:max-w-[300px]">
            <HelpSearch size="compact" />
          </div>
        </div>
      </header>

      <div className={`${HELP_READING} grid gap-12 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-14`}>
        <article className="min-w-0">
          <h1 className="max-w-[24ch] text-[28px] font-bold leading-[1.2] tracking-tight text-[#1a1a2e] sm:max-w-none sm:text-[32px]">{article.title}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-[#4b5563]">{article.summary}</p>
          <div className="mt-8 border-t border-[#e5e7eb] pt-8">
            <ArticleBody blocks={article.body} />
          </div>
          <div className="mt-12 max-w-[36rem] border-t border-[#e5e7eb] pt-6">
            <ContactSupport compact />
          </div>
        </article>

        <nav aria-label={`More in ${category.title}`} className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[13px] font-semibold text-[#6b7280]">
            <Link href={`/help/${category.slug}`} className="hover:text-[#1a1a2e]">
              {category.title}
            </Link>
          </h2>
          <ul className="mt-3 space-y-1 border-l border-[#e5e7eb]">
            {siblings.map((a) => {
              const current = a.slug === article.slug
              return (
                <li key={a.slug}>
                  <Link
                    href={helpArticlePath(a)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1.5 pl-4 text-[14px] leading-snug transition-colors",
                      current ? "border-[#1a1a2e] font-medium text-[#1a1a2e]" : "border-transparent text-[#6b7280] hover:border-[#d1d5db] hover:text-[#1a1a2e]",
                    )}
                  >
                    {a.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
