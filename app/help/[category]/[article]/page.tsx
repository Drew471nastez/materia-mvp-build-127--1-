import { publicHelpUrl, helpHref } from "@/lib/help/paths"
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
import { ArticleBody, Breadcrumbs, ContactSupport, OnThisPage } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero } from "@/components/help/help-hero"
import { TocSpy } from "@/components/help/toc-spy"
import { cn } from "@/lib/utils"
import { jsonLdScript } from "@/lib/seo/json-ld"
import ReadingProgress from "@/app/(marketing)/blog/[slug]/_reading-progress"
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
    alternates: { canonical: publicHelpUrl(path.replace(/^\/help/, "")) },
    keywords: article.keywords,
    openGraph: {
      title: article.title,
      description: article.summary,
      /* At help.storelib.com, like the canonical: the bare path resolved to storelib.com/help/..., a redirect. */
      url: publicHelpUrl(path.replace(/^\/help/, "")),
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
 * ONE ARTICLE. Under the band: where you are, then the title, the one line
 * that says what it is about, and when it was updated, in a single reading
 * column. Beside it on a wide screen, the article's own contents, kept in
 * view with the heading being read marked: a plain list on one line, never
 * a box of its own that scrolls. On a phone the contents fold under the
 * title. At the end: before and after it in the topic, the rest of its
 * group, what to read next, and how to reach a person.
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
  const siblings = own ? own.articles.filter((a) => a.slug !== article.slug) : []

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpArticleJsonLd(article, category)) }} />
      <HelpHero />

      <ReadingProgress target="[data-help-article]" header="[data-help-header]" />
      {/* The same reading frame as a blog article: the contents on the left, kept in view, the article in a column of about seventy characters. */}
      <div className={`${HELP_WIDTH} pt-6 sm:pt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14`}>
        <div className="hidden lg:block" />
        <Breadcrumbs items={[{ label: "All topics", href: "/help" }, { label: category.title, href: `/help/${category.slug}` }, { label: article.title }]} />
      </div>

      <div className={`${HELP_WIDTH} grid gap-10 pb-16 pt-8 sm:pt-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14`}>
        <aside className="hidden lg:order-first lg:block">
          <div className="sticky top-24">
            <OnThisPage items={toc} variant="side" />
          </div>
        </aside>
        <article className="min-w-0 max-w-[42rem]" data-help-article="">
          {article.section ? <p className="mb-2 text-[13px] font-medium text-[#6b7280]">{article.section}</p> : null}
          <h1 className="text-[28px] font-bold leading-[1.18] tracking-[-0.02em] text-[#1a1a2e] sm:text-[38px]">{article.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-[#4b5563] sm:text-[18px]" data-help-summary="">
            {article.summary}
          </p>
          <p className="mt-4 text-[13.5px] text-[#6b7280]" data-help-meta="">
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
          <div className="mt-8 sm:mt-10">
            <ArticleBody blocks={article.body} />
          </div>

          {previous || next ? (
            <nav aria-label="Previous and next articles" className="mt-14 grid gap-3 sm:grid-cols-2" data-help-prevnext="">
              {previous ? <StepLink article={previous} dir="previous" /> : <span className="hidden sm:block" />}
              {next ? <StepLink article={next} dir="next" /> : null}
            </nav>
          ) : null}

          {siblings.length > 0 ? (
            <section aria-labelledby="more-in-topic" className="mt-12" data-help-more="">
              <h2 id="more-in-topic" className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">
                More in {own?.title ?? category.title}
              </h2>
              <ArticleRows articles={siblings.slice(0, 6)} />
              <Link href={helpHref(`/help/${category.slug}`)} className="mt-3 inline-block text-[14px] font-medium text-[#1a1a2e] hover:underline hover:underline-offset-2">
                All {category.title.toLowerCase()} articles
              </Link>
            </section>
          ) : null}

          {related.length > 0 ? (
            <section aria-labelledby="related-articles" className="mt-12" data-help-related="">
              <h2 id="related-articles" className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">
                Related articles
              </h2>
              <ArticleRows articles={related} withSummary />
            </section>
          ) : null}

          <div className="mt-12 rounded-2xl bg-[#f8f9fa] px-5 py-4">
            <ContactSupport compact />
          </div>
        </article>

      </div>
      <TocSpy />
    </div>
  )
}

/** Articles as rows in one card, each with its arrow. */
function ArticleRows({ articles, withSummary = false }: { articles: HelpArticle[]; withSummary?: boolean }) {
  return (
    <ul className="mt-3 divide-y divide-[#f0f0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white">
      {articles.map((r) => (
        <li key={r.slug}>
          <Link href={helpHref(helpArticlePath(r))} className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[#fafafb]">
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-snug text-[#1a1a2e]">{r.title}</span>
              {withSummary ? <span className="mt-0.5 block text-[13.5px] leading-snug text-[#6b7280]">{r.summary}</span> : null}
            </span>
            <span aria-hidden className="shrink-0 text-[#c4c7cd] transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-[#6b7280]">
              &rarr;
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function StepLink({ article, dir }: { article: HelpArticle; dir: "previous" | "next" }) {
  return (
    <Link
      href={helpHref(helpArticlePath(article))}
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
