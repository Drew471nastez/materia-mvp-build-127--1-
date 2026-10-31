import Link from "next/link"
import { alternativesFlags } from "@/lib/alternatives/flags"
import { ALTERNATIVES, HUB_PATH, alternativePath } from "@/lib/alternatives"
import { FACTS_UPDATED, LIMITATIONS, PAYOUTS, PLANS, PRODUCT_TYPES, SELLING_TOOLS, STOREFRONTS, WHO_FOR, monthYear, storelibSummary, type Fact, type FactFlag } from "@/lib/marketing/facts"
import { USE_CASES, useCaseOn, useCasePath } from "@/lib/marketing/use-cases"
import { helpLink } from "@/lib/marketing/help-links"
import { featuresJsonLd } from "@/lib/marketing/features-seo"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { SignupCta } from "@/components/alternatives/signup-cta"
/* Class strings, renamed so they never read as components passed across the server boundary (tests/rsc-boundary). */
import { BODY as bodyText, MUTED as mutedText, Section } from "@/components/alternatives/parts"
import { SaleExample } from "@/components/marketing/sale-example"
import { RelatedVideo } from "@/components/marketing/related-video"

/*
  /features: STORELIB IN ONE PAGE. Who it is for, what you can sell, where,
  what it costs, what it does not do, and how it compares, each line read
  from lib/marketing/facts, which reads it from the code. This is the page a
  search engine or an assistant quotes when asked what Storelib is, so it is
  plain and dated, with no claim the code does not make true.

  Drawn on the server and held for an hour: a feature behind a platform
  switch (communities, Explore, physical products) is said to be off while
  it is off. The title and canonical are in ./layout.tsx.
*/
export const revalidate = 3600

type Flags = Record<FactFlag, boolean>

const STATUS: Record<Fact["status"], string> = { yes: "Yes", partial: "Partly", no: "No" }

/** The /sell page for a product type, when there is one. */
const PAGE_FOR: Record<string, string> = { digital: "digital-products", courses: "online-courses", communities: "communities", memberships: "communities", website: "creator-website" }

function FactTable({ facts, flags, caption }: { facts: readonly Fact[]; flags: Flags; caption: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[38%] sm:w-[28%]" />
          <col className="w-[72px] sm:w-[96px]" />
          <col />
        </colgroup>
        <tbody>
          {facts.map((f) => {
            const off = !!f.flag && !flags[f.flag]
            const status = off ? "No" : STATUS[f.status]
            const page = PAGE_FOR[f.id]
            const uc = page ? USE_CASES.find((u) => u.slug === page) : undefined
            const help = f.help ? helpLink(f.help) : null
            return (
              <tr key={f.id} className="border-b border-[#f1f2f4] align-top last:border-0" data-fact={f.id}>
                <th scope="row" className="px-4 py-3.5 text-[14.5px] font-semibold leading-[1.4] text-[#1a1a2e] sm:px-5">{f.label}</th>
                <td className={`px-2 py-3.5 text-[14px] font-semibold ${status === "No" ? "text-[#6b7280]" : "text-[#1a1a2e]"}`}>{status}</td>
                <td className="px-4 py-3.5 text-[14px] leading-[1.55] text-[#374151] sm:px-5">
                  {off ? "Not offered today." : f.text}
                  {!off && (uc || help) ? (
                    <span className="mt-1 block text-[13px]">
                      {uc && useCaseOn(uc, flags) ? (
                        <Link href={useCasePath(uc.slug)} className="font-medium text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{uc.nav}</Link>
                      ) : null}
                      {uc && useCaseOn(uc, flags) && help ? <span className="text-[#9ca3af]"> · </span> : null}
                      {help ? (
                        <a href={help.href} className="text-[#4b5563] underline decoration-[#c7cbd1] underline-offset-2 hover:text-[#1a1a2e]">{help.title}</a>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default async function FeaturesPage() {
  const flags = await alternativesFlags()
  const free = PLANS.free
  const pro = PLANS.pro
  const yesNo = (b: boolean) => (b ? "Yes" : "No")
  const planRows: [string, string, string][] = [
    ["Monthly price", "None", `${pro.price} a month`],
    ["Storelib fee per sale", free.feeLabel, pro.feeLabel],
    ["Websites", `${free.websites}, ${free.pagesPerWebsite} pages each`, `${pro.websites}, ${pro.pagesPerWebsite} pages each`],
    ["Your own domain", yesNo(free.ownDomain), yesNo(pro.ownDomain)],
    ["Hide Storelib branding", yesNo(free.removeBranding), yesNo(pro.removeBranding)],
    ["File storage", free.storage, pro.storage],
    ["Files per product", String(free.filesPerProduct), String(pro.filesPerProduct)],
    ...(flags.communities ? [["Communities", String(free.communities ?? "No limit"), pro.communities === null ? "No limit" : String(pro.communities)] as [string, string, string]] : []),
  ]

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(featuresJsonLd()) }} />
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <header className="pb-10 pt-8 sm:pb-12 sm:pt-12">
          <h1 className="max-w-[820px] text-[30px] font-bold leading-[1.12] tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">Storelib in one page</h1>
          <p className="mt-4 max-w-[720px] text-[17px] leading-[1.6] text-[#374151]">{storelibSummary(flags)}</p>
          <p className={`mt-3 ${mutedText}`}>Updated {monthYear(FACTS_UPDATED)}. Every price, fee and limit here is read from the code Storelib runs on.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SignupCta slug={null} source="features" placement="top">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </header>

        <Section id="who" title="Who it is for">
          <div className="max-w-[720px] space-y-4">
            <p className={bodyText}>{WHO_FOR}</p>
            <p className={bodyText}>
              Storelib is made by Andrew, a solo founder in Bucharest. He started out selling sample packs to music producers, and he also runs Materia, which makes Shopify themes.
            </p>
          </div>
        </Section>

        <Section id="sell" title="What you can sell">
          <FactTable facts={PRODUCT_TYPES} flags={flags} caption="What you can sell on Storelib" />
        </Section>

        <Section id="where" title="Where you sell it">
          <FactTable facts={STOREFRONTS} flags={flags} caption="Where Storelib sells your products" />
        </Section>

        <Section id="tools" title="Tools for selling">
          <FactTable facts={SELLING_TOOLS} flags={flags} caption="Storelib's tools for selling" />
        </Section>

        <Section id="cost" title="What it costs">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Storelib Free and Pro</caption>
                <thead>
                  <tr className="border-b border-[#eef0f2] bg-[#f8f9fa] text-[13px]">
                    <th scope="col" className="px-4 py-3 font-medium text-[#6b7280]"><span className="sr-only">Plan detail</span></th>
                    <th scope="col" className="px-4 py-3 font-semibold text-[#1a1a2e]">{free.name}</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-[#1a1a2e]">{pro.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {planRows.map(([label, a, b]) => (
                    <tr key={label} className="border-b border-[#f1f2f4] last:border-0">
                      <th scope="row" className="px-4 py-3 text-[14px] font-medium text-[#1a1a2e]">{label}</th>
                      <td className="px-4 py-3 text-[14px] tabular-nums text-[#374151]">{a}</td>
                      <td className="px-4 py-3 text-[14px] tabular-nums text-[#374151]">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SaleExample priceCents={2900} what="a $29 product" />
          </div>
          <p className={`mt-6 max-w-[760px] ${bodyText}`}>
            Payouts go through {PAYOUTS.method} to banks in {PAYOUTS.regions}. Paying yearly for Pro is not on sale yet.
          </p>
        </Section>

        <Section id="limits" title="What Storelib does not do">
          <ul className="grid max-w-[980px] gap-x-10 gap-y-4 md:grid-cols-2">
            {LIMITATIONS.map((f) => (
              <li key={f.id} className={bodyText} data-limit={f.id}>
                <span className="font-semibold text-[#1a1a2e]">{f.label}.</span> {f.text}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="compare" title="How it compares">
          <p className={`max-w-[720px] ${bodyText}`}>
            Each comparison uses the other company&apos;s own pricing and help pages, dated, and says where the other platform is the better choice.
          </p>
          <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {ALTERNATIVES.map((c) => (
              <li key={c.slug}>
                <Link href={alternativePath(c.slug)} className="group block">
                  <span className="text-[15px] font-semibold text-[#1a1a2e] group-hover:underline">Storelib vs {c.name}</span>
                  <span className={`mt-0.5 block ${mutedText}`}>{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px]">
            <Link href={HUB_PATH} className="font-medium text-[#1a1a2e] underline underline-offset-2">All comparisons, side by side</Link>
          </p>
        </Section>

        <RelatedVideo path="/features" />
      </div>

      <section aria-labelledby="start-h" className="border-t border-[#eef0f2] bg-[#f8f9fa]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 id="start-h" className="text-[22px] font-bold text-[#1a1a2e]">Start on Free</h2>
            <p className="mt-1.5 text-[15px] text-[#4b5563]">No monthly fee and no card to sign up.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignupCta slug={null} source="features" placement="bottom">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
