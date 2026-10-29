import type { Metadata } from "next"
import Link from "next/link"
import { ALTERNATIVES, CATEGORIES, alternativePath, categoryLabel, searchText } from "@/lib/alternatives"
import { HUB_DESCRIPTION, hubJsonLd, hubMetadata } from "@/lib/alternatives/seo"
import { STORELIB } from "@/lib/alternatives/storelib"
import { CHECKED_ON, formatCheckedDate } from "@/lib/alternatives/checked"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { HubDirectory, type HubItem } from "@/components/alternatives/hub-directory"
import { SignupCta } from "@/components/alternatives/signup-cta"
import { ComparisonViewTracker } from "@/components/alternatives/view-tracker"
import { Disclaimer } from "@/components/alternatives/disclaimer"

export const metadata: Metadata = hubMetadata()

/*
  /alternatives: every comparison, searchable and filtered by what kind of
  platform it is. The same for every visitor, so it is built once and served
  from the CDN; the list is in the HTML and the filters only hide rows.
*/
export default function AlternativesHub() {
  const items: HubItem[] = ALTERNATIVES.map((c) => ({
    slug: c.slug,
    name: c.name,
    href: alternativePath(c.slug),
    summary: c.summary,
    pricingShort: c.pricingShort,
    categories: c.categories,
    categoryLabels: c.categories.map(categoryLabel),
    search: searchText(c),
  }))
  const categories = CATEGORIES.filter((k) => ALTERNATIVES.some((c) => c.categories.includes(k.id)))

  return (
    <div className="bg-[#f8f9fa]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(hubJsonLd()) }} />
      <ComparisonViewTracker slug={null} />
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-[13px] text-[#6b7280]">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-[#1a1a2e]">Storelib</Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-[#1a1a2e]">Alternatives</li>
          </ol>
        </nav>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-[720px]">
            <h1 className="text-[30px] font-bold leading-[1.12] tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">Storelib compared</h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[#4b5563]">{HUB_DESCRIPTION}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignupCta slug={null} placement="hub-top">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </div>

        <div className="mt-10">
          <HubDirectory items={items} categories={categories} />
        </div>

        <section aria-labelledby="method-h" className="mt-14 grid gap-8 border-t border-[#e5e7eb] pt-10 md:grid-cols-2">
          <div>
            <h2 id="method-h" className="text-[20px] font-bold text-[#1a1a2e]">How these comparisons are made</h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">
              Each competitor fact is taken from that company&apos;s own pricing pages and help center, and each page lists its sources with the day they were checked, most recently {formatCheckedDate(CHECKED_ON)}. Where the sources disagree or a fact could not be confirmed, the page says so next to it.
            </p>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">
              Storelib&apos;s fees and limits are read from the code that charges them, so they match checkout. Each page also says where the other platform is the better choice.
            </p>
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#1a1a2e]">Storelib in one line</h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">
              Digital products, courses and memberships sold from a website, a creator page and a OnePage bio link. Free has no monthly fee and takes {STORELIB.freeFee} a sale. Pro is {STORELIB.proPrice} a month and takes {STORELIB.proFee}. Stripe&apos;s card processing applies on both.
            </p>
            <p className="mt-3 text-[15px]">
              <Link href="/pricing" className="font-semibold text-[#1a1a2e] underline underline-offset-2">Compare Storelib&apos;s plans</Link>
            </p>
          </div>
        </section>

        <Disclaimer names={ALTERNATIVES.map((c) => c.name)} className="mt-10" />
      </div>
    </div>
  )
}
