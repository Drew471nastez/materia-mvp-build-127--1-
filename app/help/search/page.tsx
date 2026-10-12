import type { Metadata } from "next"
import Link from "next/link"
import { helpArticlePath, helpCategory } from "@/lib/help/articles"
import { searchHelp } from "@/lib/help/search"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { Breadcrumbs, ContactSupport } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero } from "@/components/help/help-hero"

/**
 * The search as a page: where the search field's form goes without script,
 * or when Enter is pressed with no result highlighted. The same searchHelp
 * the field runs as somebody types. Not indexed: a results page is not
 * content of its own.
 */
export const metadata: Metadata = {
  title: "Search | Help Center",
  robots: { index: false, follow: true },
}

export default async function HelpSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").slice(0, 200)
  const results = q.trim() ? searchHelp(q, 30, { physical: await isPhysicalCommerceEnabled() }) : []

  return (
    <div className="bg-[#f8f9fa]">
      <HelpHero query={q} />

      <div className={`${HELP_WIDTH} py-8 sm:py-10`}>
        <Breadcrumbs items={[{ label: "All topics", href: "/help" }, { label: "Search" }]} />
        <div className="mt-6" />
        <h1 className="text-[20px] font-semibold text-[#1a1a2e]" aria-live="polite">
          {!q.trim()
            ? "Type a word to search the Help Center"
            : results.length === 0
              ? `No articles match “${q.trim()}”`
              : `${results.length} ${results.length === 1 ? "article" : "articles"} for “${q.trim()}”`}
        </h1>
        {results.length > 0 ? (
          <ol className="mt-6 divide-y divide-[#f0f0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/80 bg-white">
            {results.map((r) => (
              <li key={`${r.article.category}/${r.article.slug}`} className="px-5 py-4 sm:px-6">
                <Link href={helpArticlePath(r.article)} className="text-[16px] font-medium text-[#1a1a2e] hover:underline hover:underline-offset-2">
                  {r.article.title}
                </Link>
                <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">
                  <span className="text-[#4b5563]">{helpCategory(r.article.category)?.title}</span>
                  <span aria-hidden> · </span>
                  {r.snippet}
                </p>
              </li>
            ))}
          </ol>
        ) : q.trim() ? (
          <p className="mt-3 text-[15px] text-[#6b7280]">
            Try a shorter or different word, or <Link href="/help" className="font-medium text-[#1a1a2e] underline underline-offset-2">browse the topics</Link>.
          </p>
        ) : null}
      </div>

      <div className="bg-white">
        <ContactSupport frame={HELP_WIDTH} />
      </div>
    </div>
  )
}
