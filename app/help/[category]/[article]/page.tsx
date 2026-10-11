import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import {
  ALL_HELP_ARTICLES,
  HELP_MOVED,
  helpArticle,
  helpArticlePath,
  helpCategory,
  helpImages,
  helpNeighbours,
  helpRelated,
  helpSectionsIn,
  helpToc,
  helpVisible,
  readingMinutes,
  type HelpArticle,
} from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { ArticleBody, Breadcrumbs, ContactSupport, HELP_READING, OnThisPage } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"
import { TocSpy } from "@/components/help/toc-spy"
import { cn } from "@/lib/utils"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { helpArticleJsonLd } from "@/lib/help/structured-data"

export const dynamicParams = false
export const revalidate = 60

export function generateStaticParams() {
  /* The articles, and the addresses of the ones that moved, which send people on (HELP_MOVED). */
  const moved = Object.keys(HELP_MOVED).map((k) => {
    const [category, article] = k.split("/")
    return { category, article }
  })
  return [...ALL_HELP_ARTICLES.map((a) => ({ category: a.category, article: a.slug })), ...moved]
}

interface PageProps {
  params: Promise<{ category: string; article: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, article: slug } = await params
  const article = helpArticle(category, slug)
  if (!article) return { title: "Not Found" }
  const path = helpArticlePath(article)
  const image = helpImages(article)[0]
  return {
    title: { absolute: `${article.title} | Storelib Help Center` },
    description: article.summary,
    alternates: { canonical: path },
    keywords: article.keywords,
    openGraph: {
      title: article.title,
      description: article.summary,
      url: path,
      siteName: "Storelib Help Center",
      type: "article",
      ...(article.updated ? { modifiedTime: article.updated } : {}),
      ...(image ? { images: [{ url: image, alt: article.title }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: article.title, description: article.summary, ...(image ? { images: [image] } : {}) },
  }
}

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })

/**
 * ONE ARTICLE. Its title and the one line that says what it's about, then
 * the article in a single reading column. Beside it on a wide screen, the
 * article's own contents (kept in view, the heading being read marked) and
 * the other articles in its group; on a phone the contents fold under the
 * title. At the end: the article before and after it in the topic, what to
 * read next, and how to reach a person.
 */
export default async function HelpArticlePage({ params }: PageProps) {
  const { category: categorySlug, article: slug } = await params
  const moved = HELP_MOVED[`${categorySlug}/${slug}`]
  if (moved) permanentRedirect(`/help/${moved}`)
  const article = helpArticle(categorySlug, slug)
  const category = helpCategory(categorySlug)
  if (!article || !category || !helpVisible(category, await isPhysicalCommerceEnabled())) notFound()

  const toc = helpToc(article)
  const { previous, next } = helpNeighbours(article)
  const related = helpRelated(article)
  const own = helpSectionsIn(category.slug).find((g) => g.articles.some((a) => a.slug === article.slug))

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpArticleJsonLd(article, category)) }} />
      <header className="border-b border-[#eceef1] bg-[#f8f9fa]">
        <div className={`${HELP_READING} flex flex-col gap-4 py-5 sm:py-6 lg:flex-row lg:items-center lg:justify-between`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: category.title, href: `/help/${category.slug}` }]} />
          <div className="w-full lg:max-w-[320px]">
            <HelpSearch size="compact" />
          </div>
        </div>
      </header>

      <div className={`${HELP_READING} grid gap-10 pb-16 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_232px] lg:gap-14`}>
        <article className="min-w-0 max-w-[40rem]" data-help-article="">
          {article.section ? <p className="mb-2 text-[13px] font-medium text-[#6b7280]">{article.section}</p> : null}
          <h1 className="text-[28px] font-bold leading-[1.18] tracking-[-0.02em] text-[#1a1a2e] sm:text-[36px]">{article.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-[#4b5563] sm:text-[18px]" data-help-summary="">
            {article.summary}
          </p>
          <p className="mt-4 text-[13px] text-[#6b7280]" data-help-meta="">
            {article.updated ? (
              <>
                Updated <time dateTime={article.updated}>{dateLabel(article.updated)}</time>
                <span aria-hidden className="mx-2 text-[#d1d5db]">
                  ·
                </span>
              </>
            ) : null}
            {readingMinutes(article)} min read
          </p>
          {toc.length >= 2 ? (
            <div className="mt-6">
              <OnThisPage items={toc} variant="inline" />
            </div>
          ) : null}
          <div className="mt-8 border-t border-[#eceef1] pt-8 sm:mt-10 sm:pt-10">
            <ArticleBody blocks={article.body} />
          </div>

          {previous || next ? (
            <nav aria-label="Previous and next articles" className="mt-14 grid gap-3 sm:grid-cols-2" data-help-prevnext="">
              {previous ? <StepLink article={previous} dir="previous" /> : <span className="hidden sm:block" />}
              {next ? <StepLink article={next} dir="next" /> : null}
            </nav>
          ) : null}

          {related.length > 0 ? (
            <section aria-labelledby="related-articles" className="mt-12" data-help-related="">
              <h2 id="related-articles" className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">
                Related articles
              </h2>
              <ul className="mt-3 divide-y divide-[#f0f0f2] border-y border-[#f0f0f2]">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={helpArticlePath(r)} className="group flex items-center justify-between gap-4 py-3.5">
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-2">{r.title}</span>
                        <span className="mt-0.5 block text-[13.5px] leading-snug text-[#6b7280]">{r.summary}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-[#9ca3af] transition-[translate] group-hover:translate-x-0.5">
                        &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-12 rounded-2xl bg-[#f8f9fa] px-5 py-4">
            <ContactSupport compact />
          </div>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-8 overflow-y-auto pb-4">
            <OnThisPage items={toc} variant="side" />
            {own ? (
              <nav aria-label={`More in ${own.title ?? category.title}`}>
                <h2 className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">{own.title ?? category.title}</h2>
                <ul className="-mx-2.5 space-y-0.5">
                  {own.articles.map((a) => {
                    const current = a.slug === article.slug
                    return (
                      <li key={a.slug}>
                        <Link
                          href={helpArticlePath(a)}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "block rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug transition-colors",
                            current ? "bg-[#f1f2f4] font-medium text-[#1a1a2e]" : "text-[#6b7280] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]",
                          )}
                        >
                          {a.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <Link href={`/help/${category.slug}`} className="mt-3 inline-block text-[13.5px] font-medium text-[#6d28d9] hover:underline hover:underline-offset-2">
                  All {category.title.toLowerCase()} articles
                </Link>
              </nav>
            ) : null}
          </div>
        </aside>
      </div>
      <TocSpy />
    </div>
  )
}

function StepLink({ article, dir }: { article: HelpArticle; dir: "previous" | "next" }) {
  return (
    <Link
      href={helpArticlePath(article)}
      rel={dir === "next" ? "next" : "prev"}
      className={cn(
        "group flex min-h-[76px] flex-col justify-center rounded-2xl border border-[#e5e7eb] px-4 py-3 transition-colors hover:border-[#c9ccd2] hover:bg-[#fafafa]",
        dir === "next" && "sm:items-end sm:text-right",
      )}
    >
      <span className="text-[12.5px] text-[#6b7280]">{dir === "next" ? "Next" : "Previous"}</span>
      <span className="mt-0.5 text-[15px] font-medium leading-snug text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-2">
        {dir === "previous" ? <span aria-hidden>&larr; </span> : null}
        {article.title}
        {dir === "next" ? <span aria-hidden> &rarr;</span> : null}
      </span>
    </Link>
  )
}
