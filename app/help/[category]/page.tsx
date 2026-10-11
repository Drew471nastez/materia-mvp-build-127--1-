import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ALL_HELP_CATEGORIES, headingId, helpArticlePath, helpArticlesIn, helpCategoriesFor, helpCategory, helpSectionsIn, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { Breadcrumbs, ContactSupport, HELP_READING } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { helpCategoryJsonLd } from "@/lib/help/structured-data"

export const dynamicParams = false
export const revalidate = 60

export function generateStaticParams() {
  return ALL_HELP_CATEGORIES.map((c) => ({ category: c.slug }))
}

interface PageProps {
  params: Promise<{ category: string }>
}

/** A topic's own words for search results, where it has them; otherwise its description. */
const SEO_TITLE: Record<string, string> = {
  "physical-products": "Selling physical products on Storelib: the complete guide",
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params
  const category = helpCategory(slug)
  if (!category) return { title: "Not Found" }
  const title = SEO_TITLE[category.slug] ?? `${category.title}: help and how to`
  return {
    title: { absolute: `${title} | Storelib Help Center` },
    description: category.description,
    alternates: { canonical: `/help/${category.slug}` },
    openGraph: { title, description: category.description, url: `/help/${category.slug}`, siteName: "Storelib Help Center", type: "website" },
    twitter: { card: "summary", title, description: category.description },
  }
}

/**
 * A TOPIC. Its name, what it covers and how many articles, then the articles
 * in their groups, each with its one line. A topic read in groups (the
 * physical products guide) opens with where to start and keeps the list of
 * groups beside it, so a long topic is a page you can jump around in.
 */
export default async function HelpCategoryPage({ params }: PageProps) {
  const { category: slug } = await params
  const physical = await isPhysicalCommerceEnabled()
  const category = helpCategory(slug)
  if (!category || !helpVisible(category, physical)) notFound()
  const sections = helpSectionsIn(category.slug)
  const articles = helpArticlesIn(category.slug)
  const grouped = sections.length > 1
  const first = articles[0]

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpCategoryJsonLd(category, articles)) }} />
      <header className="border-b border-[#eceef1] bg-[#f8f9fa]">
        <div className={`${HELP_READING} py-7 sm:py-10`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: category.title }]} />
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-[40rem]">
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[34px]">{category.title}</h1>
              <p className="mt-2 text-[16px] leading-relaxed text-[#4b5563]">{category.description}</p>
              <p className="mt-2 text-[13px] text-[#6b7280]">{articles.length} articles</p>
            </div>
            <div className="w-full lg:max-w-[320px]">
              <HelpSearch size="compact" />
            </div>
          </div>
        </div>
      </header>

      <div className={`${HELP_READING} grid gap-12 pb-16 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_220px]`}>
        <div className="min-w-0">
          {grouped && first ? (
            <Link
              href={helpArticlePath(first)}
              className="group mb-10 flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb] px-5 py-4 transition-colors hover:border-[#c9ccd2] hover:bg-[#fafafa] sm:px-6 sm:py-5"
              data-help-start=""
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[#6b7280]">New here? Start with</span>
                <span className="mt-0.5 block text-[17px] font-semibold leading-snug tracking-tight text-[#1a1a2e]">{first.title}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-[#6b7280]">{first.summary}</span>
              </span>
              <span aria-hidden className="shrink-0 text-[20px] text-[#9ca3af] transition-[translate] group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
          ) : null}

          {sections.map((section) => (
            <section
              key={section.title ?? "all"}
              id={section.title ? headingId(section.title) : undefined}
              aria-label={section.title ?? undefined}
              className="mb-10 scroll-mt-24 last:mb-0"
              data-help-section={section.title ?? ""}
            >
              {section.title ? <h2 className="mb-1 text-[18px] font-semibold tracking-tight text-[#1a1a2e]">{section.title}</h2> : null}
              <ul className="divide-y divide-[#f0f0f2] border-b border-[#f0f0f2]">
                {section.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={helpArticlePath(a)} className="group flex items-center justify-between gap-4 py-4">
                      <span className="min-w-0">
                        <span className="block text-[15.5px] font-medium leading-snug text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/30 group-hover:underline-offset-2">{a.title}</span>
                        <span className="mt-1 block text-[14px] leading-relaxed text-[#6b7280]">{a.summary}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-[#c4c7cd] transition-[translate] group-hover:translate-x-0.5 group-hover:text-[#6b7280]">
                        &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="text-[14px]">
          <div className="space-y-8 lg:sticky lg:top-24">
            {grouped ? (
              <nav aria-label="In this topic" className="hidden lg:block">
                <h2 className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">In this topic</h2>
                <ul className="-mx-2.5 space-y-0.5">
                  {sections.map((s) =>
                    s.title ? (
                      <li key={s.title}>
                        <a href={`#${headingId(s.title)}`} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[13.5px] text-[#4b5563] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e]">
                          <span className="min-w-0 truncate">{s.title}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{s.articles.length}</span>
                        </a>
                      </li>
                    ) : null,
                  )}
                </ul>
              </nav>
            ) : null}
            <nav aria-label="Other topics">
              <h2 className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">Other topics</h2>
              <ul className="-mx-2.5 space-y-0.5">
                {helpCategoriesFor(physical)
                  .filter((c) => c.slug !== category.slug)
                  .map((c) => (
                    <li key={c.slug}>
                      <Link href={`/help/${c.slug}`} className="block rounded-lg px-2.5 py-1.5 text-[13.5px] text-[#4b5563] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e]">
                        {c.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            </nav>
          </div>
        </aside>
      </div>

      <ContactSupport frame={HELP_READING} />
    </div>
  )
}
