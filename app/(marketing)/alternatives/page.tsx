import type { Metadata } from "next"
import Link from "next/link"
import { ALTERNATIVES } from "@/lib/alternatives"
import { hubJsonLd, hubMetadata } from "@/lib/alternatives/seo"
import { CHECKED_ON, formatCheckedDate } from "@/lib/alternatives/checked"
import { alternativesFlags } from "@/lib/alternatives/flags"
import { storelibSummary } from "@/lib/marketing/facts"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { HubGroups, HubMatrix } from "@/components/alternatives/hub-sections"
import { SignupCta } from "@/components/alternatives/signup-cta"
import { ComparisonViewTracker } from "@/components/alternatives/view-tracker"
import { Disclaimer } from "@/components/alternatives/disclaimer"

export const metadata: Metadata = hubMetadata()

/*
  /alternatives: every comparison, grouped by what a seller needs, then all
  of them side by side. The same for every visitor, so it is built once and
  served from the CDN, and revalidated hourly so a Storelib switch that turns
  on or off (communities) reaches the table without a deploy.
*/
export const revalidate = 3600

export default async function AlternativesHub() {
  const flags = await alternativesFlags()
  const newest = ALTERNATIVES.flatMap((c) => c.sources.map((s) => s.checkedOn)).sort().at(-1) ?? CHECKED_ON

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
            <p className="mt-4 text-[17px] leading-[1.55] text-[#4b5563]">
              Storelib is one of several ways to sell what you make. These pages put it next to the platforms people most often weigh it against, using each company&apos;s own pricing and help pages. Each one also says where the other platform is the better choice.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignupCta slug={null} placement="hub-top">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </div>

        <div className="mt-12">
          <HubGroups list={ALTERNATIVES} flags={flags} />
        </div>

        <section aria-labelledby="matrix-h" className="mt-16">
          <h2 id="matrix-h" className="text-[22px] font-bold text-[#1a1a2e] sm:text-[26px]">Side by side</h2>
          <p className="mt-2 max-w-[720px] text-[15px] leading-[1.6] text-[#4b5563]">
            The same rows each comparison page shows. Facts about the other platforms were checked against their own pages, most recently on {formatCheckedDate(newest)}. Open a comparison for its sources.
          </p>
          <div className="mt-5">
            <HubMatrix list={ALTERNATIVES} flags={flags} />
          </div>
        </section>

        <section aria-labelledby="method-h" className="mt-14 grid gap-8 border-t border-[#e5e7eb] pt-10 md:grid-cols-2">
          <div>
            <h2 id="method-h" className="text-[20px] font-bold text-[#1a1a2e]">How these comparisons are made</h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">
              Each competitor fact is taken from that company&apos;s own pricing pages and help center, and each page lists its sources with the day they were checked. Where the sources disagree or a fact could not be confirmed, the page says so next to it. Prices change often, so check the other company&apos;s pricing page before you decide.
            </p>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">
              Storelib&apos;s fees and limits are read from the code that charges them, so they match checkout.
            </p>
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#1a1a2e]">Storelib in one paragraph</h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#374151]">{storelibSummary(flags)}</p>
            <p className="mt-3 text-[15px]">
              <Link href="/features" className="font-semibold text-[#1a1a2e] underline underline-offset-2">Storelib in one page</Link>
              <span className="text-[#9ca3af]"> · </span>
              <Link href="/pricing" className="font-semibold text-[#1a1a2e] underline underline-offset-2">Plans and fees</Link>
            </p>
          </div>
        </section>

        <Disclaimer names={ALTERNATIVES.map((c) => c.name)} className="mt-10" />
      </div>
    </div>
  )
}
