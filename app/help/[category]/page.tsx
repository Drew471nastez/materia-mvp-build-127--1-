import { publicHelpUrl, helpHref } from "@/lib/help/paths"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ALL_HELP_CATEGORIES, headingId, helpArticlePath, helpArticlesIn, helpCategoriesFor, helpCategory, helpSectionsIn, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { Breadcrumbs, ContactSupport } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero, TopicIcon } from "@/components/help/help-hero"
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
    alternates: { canonical: publicHelpUrl(`/${category.slug}`) },
    openGraph: { title, description: category.description, url: `/help/${category.slug}`, siteName: "Storelib Help Center", type: "website" },
    twitter: { card: "summary", title, description: category.description },
  }
}

/**
 * A TOPIC. Under the band: where you are, the topic's mark, name, what it
 * covers and how many articles; then its articles as rows in one card per
 * group, each with its one line. A topic read in groups (the physical
 * products guide) opens with where to start. Other topics follow as chips,
 * so nothing sits in a column of its own beside the list.
 */
export default async function HelpCategoryPage({ params }: PageProps) {
  const { category: slug } = await params
  const physical = await isPhysicalCommerceEnabled()
  const category = helpCategory(slug)
  if (!category || !helpVisible(category, physical)) notFound()
  const sections = helpSectionsIn(category.slug)
  const articles = helpArticlesIn(category.slug)
  const grouped = sections.length > 1
  /* The article a newcomer should read first: the topic's own choice (the physical products playbook), else its first. */
  const first = (category.start ? articles.find((a) => a.slug === category.start) : undefined) ?? articles[0]

  return (
    <div className="bg-[#f8f9fa]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(helpCategoryJsonLd(category, articles)) }} />
      <HelpHero />

      <div className={`${HELP_WIDTH} pb-16 pt-6 sm:pt-8`}>
        <Breadcrumbs items={[{ label: "All topics", href: "/help" }, { label: category.title }]} />
        <div className="mt-6 flex items-start gap-4">
          <TopicIcon slug={category.slug} size={52} />
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[32px]">{category.title}</h1>
            <p className="mt-1.5 max-w-[60ch] text-[15.5px] leading-relaxed text-[#4b5563]">{category.description}</p>
            <p className="mt-1.5 text-[13px] text-[#6b7280]">{articles.length} articles</p>
          </div>
        </div>

        {grouped ? (
          <nav aria-label="In this topic" className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s) =>
              s.title ? (
                <a key={s.title} href={`#${headingId(s.title)}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#374151] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a2e]">
                  {s.title}
                  <span className="tabular-nums text-[#9ca3af]">{s.articles.length}</span>
                </a>
              ) : null,
            )}
          </nav>
        ) : null}

        <div className="mt-8 space-y-10">
          {grouped && first ? (
            <Link
              href={helpHref(helpArticlePath(first))}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb]/80 bg-white px-5 py-5 transition-[box-shadow,border-color] hover:border-[#dcdfe4] hover:shadow-[0_10px_28px_-16px_rgba(16,24,40,0.22)] sm:px-6"
              data-help-start=""
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[#6b7280]">{category.start ? "Start here" : "New here? Start with"}</span>
                <span className="mt-1 block text-[17px] font-semibold leading-snug tracking-tight text-[#1a1a2e]">{first.title}</span>
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
              className="scroll-mt-24"
              data-help-section={section.title ?? ""}
            >
              {section.title ? <h2 className="mb-3 text-[17px] font-semibold tracking-tight text-[#1a1a2e]">{section.title}</h2> : null}
              <ul className="divide-y divide-[#f0f0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white">
                {section.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={helpHref(helpArticlePath(a))} className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#fafafb] sm:px-6">
                      <span className="min-w-0">
                        <span className="block text-[15.5px] font-medium leading-snug text-[#1a1a2e]">{a.title}</span>
                        <span className="mt-1 block text-[14px] leading-relaxed text-[#6b7280]">{a.summary}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-[#c4c7cd] transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-[#6b7280]">
                        &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <nav aria-label="Other topics" className="mt-14">
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Other topics</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {helpCategoriesFor(physical)
              .filter((c) => c.slug !== category.slug)
              .map((c) => (
                <li key={c.slug}>
                  <Link href={helpHref(`/help/${c.slug}`)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white pl-1.5 pr-4 text-[14px] font-medium text-[#374151] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a2e]">
                    <TopicIcon slug={c.slug} size={28} />
                    {c.title}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>

      <div className="bg-white">
        <ContactSupport frame={HELP_WIDTH} />
      </div>
    </div>
  )
}
