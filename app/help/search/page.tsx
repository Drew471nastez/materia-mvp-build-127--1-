import type { Metadata } from "next"
import Link from "next/link"
import { helpArticlePath, helpCategory } from "@/lib/help/articles"
import { searchHelp } from "@/lib/help/search"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { Breadcrumbs, ContactSupport, HELP_READING } from "@/components/help/help-parts"
import { HelpSearch } from "@/components/help/help-search"

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
    <div className="bg-white">
      <header className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
        <div className={`${HELP_READING} py-6 sm:py-8`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: "Search" }]} />
          <div className="mt-5 max-w-[640px]">
            <HelpSearch size="large" defaultQuery={q} />
          </div>
        </div>
      </header>

      <div className={`${HELP_READING} py-10 sm:py-12`}>
        <h1 className="text-[20px] font-semibold text-[#1a1a2e]" aria-live="polite">
          {!q.trim()
            ? "Type a word to search the Help Center"
            : results.length === 0
              ? `No articles match “${q.trim()}”`
              : `${results.length} ${results.length === 1 ? "article" : "articles"} for “${q.trim()}”`}
        </h1>
        {results.length > 0 ? (
          <ol className="mt-6 max-w-[760px] divide-y divide-[#f0f0f2] border-y border-[#f0f0f2]">
            {results.map((r) => (
              <li key={`${r.article.category}/${r.article.slug}`} className="py-4">
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

      <ContactSupport frame={HELP_READING} />
    </div>
  )
}
