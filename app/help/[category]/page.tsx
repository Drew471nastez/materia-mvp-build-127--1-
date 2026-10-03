import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ALL_HELP_CATEGORIES, helpArticlePath, helpArticlesIn, helpCategoriesFor, helpCategory, helpVisible } from "@/lib/help/articles"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { Breadcrumbs, ContactSupport, HELP_READING } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"

export const dynamicParams = false
export const revalidate = 60

export function generateStaticParams() {
  return ALL_HELP_CATEGORIES.map((c) => ({ category: c.slug }))
}

interface PageProps {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: slug } = await params
  const category = helpCategory(slug)
  if (!category) return { title: "Not Found" }
  const title = `${category.title} | Help Center`
  return {
    title,
    description: category.description,
    alternates: { canonical: `/help/${category.slug}` },
    openGraph: { title: `${title} | Storelib`, description: category.description, url: `/help/${category.slug}`, siteName: "Storelib", type: "website" },
  }
}

export default async function HelpCategoryPage({ params }: PageProps) {
  const { category: slug } = await params
  const physical = await isPhysicalCommerceEnabled()
  const category = helpCategory(slug)
  if (!category || !helpVisible(category, physical)) notFound()
  const articles = helpArticlesIn(category.slug)

  return (
    <div className="bg-white">
      <header className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
        <div className={`${HELP_READING} flex flex-col gap-5 py-6 sm:py-8 lg:flex-row lg:items-center lg:justify-between`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: category.title }]} />
          <div className="w-full lg:max-w-[300px]">
            <HelpSearch size="compact" />
          </div>
        </div>
      </header>

      <div className={`${HELP_READING} grid gap-12 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_200px]`}>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">{category.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6b7280]">{category.description}</p>

          <ul className="mt-8 divide-y divide-[#f0f0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={helpArticlePath(a)} className="group block px-5 py-4 transition-colors hover:bg-[#f8f9fa] sm:px-6">
                  <span className="block text-[15px] font-medium text-[#1a1a2e] group-hover:underline group-hover:decoration-[#1a1a2e]/40 group-hover:underline-offset-2">
                    {a.title}
                  </span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-[#6b7280]">{a.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Other topics" className="text-[14px]">
          <h2 className="text-[13px] font-semibold text-[#6b7280]">Other topics</h2>
          <ul className="mt-3 space-y-2">
            {helpCategoriesFor(physical)
              .filter((c) => c.slug !== category.slug)
              .map((c) => (
              <li key={c.slug}>
                <Link href={`/help/${c.slug}`} className="text-[#1a1a2e] hover:underline hover:underline-offset-2">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <ContactSupport frame={HELP_READING} />
    </div>
  )
}
