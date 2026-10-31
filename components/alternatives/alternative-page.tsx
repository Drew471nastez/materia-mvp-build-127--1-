/**
 * ===========================================================================
 *  ONE COMPARISON PAGE: /alternatives/<slug>
 * ===========================================================================
 * Drawn on the server from lib/alternatives/<competitor>, so the whole page
 * is readable without JavaScript and every word is in the first response.
 *
 * The order follows what somebody comparing platforms asks, in turn: what
 * is this other platform, what does it cost me, what does each do, where is
 * each weaker, what does Storelib look like, and how would I move. The
 * sources and the date they were checked close the page, numbered, and each
 * claim above links to its number.
 */
import Link from "next/link"
import type { Competitor } from "@/lib/alternatives/types"
import type { Flags } from "@/lib/alternatives/seo"
import { resolveFaqs, alternativeJsonLd } from "@/lib/alternatives/seo"
import { HUB_PATH, alternativePath, categoryLabel, lastChecked, relatedAlternatives } from "@/lib/alternatives/index"
import { STORELIB, STRIPE_PRICING_SOURCE, STORELIB_FEE_HELP_PATH, proBreakEvenDollars } from "@/lib/alternatives/storelib"
import { formatCheckedDate } from "@/lib/alternatives/checked"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { publicHelpUrl } from "@/lib/help/paths"
import { FeeCalculator } from "./fee-calculator"
import { SignupCta } from "./signup-cta"
import { ComparisonViewTracker } from "./view-tracker"
import { BODY, ClaimItem, ClaimList, FeatureTable, MUTED, PointList, Screens, Section, SourceMarks, StatusNote, numberSources, unsettledClaims, visualsFor } from "./parts"
import { Disclaimer } from "./disclaimer"
import { MOVING_HELP, MOVING_TITLES } from "@/lib/alternatives/moving"
import { helpLink } from "@/lib/marketing/help-links"
import { monthYear } from "@/lib/marketing/facts"
import { useCasePath, useCasesFor, useCaseOn } from "@/lib/marketing/use-cases"
import { RelatedVideo } from "@/components/marketing/related-video"

const money = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`)
const rate = (r: { percent: number; fixedCents: number }) =>
  r.percent === 0 && r.fixedCents === 0 ? "0%" : `${r.percent}%${r.fixedCents ? ` + ${r.fixedCents}¢` : ""}`

const NAV = [
  ["pricing", "Fees"],
  ["calculator", "Calculator"],
  ["features", "Features"],
  ["strengths", "Strengths and limits"],
  ["switch", "How to switch"],
  ["questions", "Questions"],
  ["sources", "Sources"],
] as const

export function AlternativePage({ c, flags }: { c: Competitor; flags: Flags }) {
  const sources = [...c.sources, STRIPE_PRICING_SOURCE]
  const numbers = numberSources(sources)
  const faqs = resolveFaqs(c.faqs, flags)
  const shots = visualsFor(c.visuals, flags)
  const checked = formatCheckedDate(lastChecked(c))
  const unsettled = unsettledClaims(c)
  const related = relatedAlternatives(c.slug)
  /* The competitor's own pricing page: the source its first plan was read from. Its prices are printed with the month they were checked. */
  const pricingSource = c.sources.find((s) => s.id === c.plans[0]?.claim.sources[0])
  const landing = useCasesFor(c.slug).filter((u) => useCaseOn(u, flags))

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(alternativeJsonLd(c)) }} />
      <ComparisonViewTracker slug={c.slug} />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {/* ── The top: what this page is, and the two things to do ───────── */}
        <header className="pb-10 pt-8 sm:pb-12 sm:pt-12">
          <nav aria-label="Breadcrumb" className={MUTED}>
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-[#1a1a2e]">Storelib</Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href={HUB_PATH} className="hover:text-[#1a1a2e]">Alternatives</Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-[#1a1a2e]">{c.name}</li>
            </ol>
          </nav>

          <h1 className="mt-5 max-w-[820px] text-[30px] font-bold leading-[1.12] tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">{c.seo.h1}</h1>
          <p className="mt-4 max-w-[680px] text-[17px] leading-[1.55] text-[#4b5563]">
            {c.name}: {c.pricingShort.charAt(0).toLowerCase() + c.pricingShort.slice(1)}. Storelib: no monthly fee and {STORELIB.freeFee} a sale on Free, or {STORELIB.proPrice} a month and {STORELIB.proFee} on Pro.
          </p>
          <p className={`mt-3 ${MUTED}`}>
            {c.categories.map(categoryLabel).join(", ")}. {c.name} facts checked on {checked} against {c.name}&apos;s own pages, listed under <a href="#sources" className="underline underline-offset-2 hover:text-[#1a1a2e]">Sources</a>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SignupCta slug={c.slug} placement="top">Start free on Storelib</SignupCta>
            <a href="#calculator" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#f9fafb]">
              Compare fees for your sales
            </a>
          </div>

          <nav aria-label="On this page" className="mt-8 border-t border-[#eef0f2] pt-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-[#4b5563] underline-offset-4 hover:text-[#1a1a2e] hover:underline">{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        {/* ── What the other platform is ─────────────────────────────────── */}
        <Section id="about" title={`What ${c.name} is`}>
          <div className="max-w-[720px] space-y-4">
            {c.intro.map((p) => (
              <p key={p} className={BODY}>{p}</p>
            ))}
          </div>
        </Section>

        {/* ── Why Storelib, and when not ─────────────────────────────────── */}
        <Section id="why" title={`Why sellers move from ${c.name} to Storelib`}>
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <PointList points={c.whyStorelib} flags={flags} />
            <div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">When {c.name} is the better choice</h3>
              <div className="mt-3">
                <ClaimList claims={c.whenToStay} numbers={numbers} />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Fees and plans ─────────────────────────────────────────────── */}
        <Section id="pricing" title="Fees and plans">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{c.name}</h3>
              <dl className="mt-3 divide-y divide-[#f1f2f4] rounded-2xl border border-[#e5e7eb]/60">
                {c.plans.map((p) => (
                  <div key={p.id} className="px-4 py-3.5 sm:px-5">
                    <dt className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-semibold text-[#1a1a2e]">
                      <span>{p.name}</span>
                      <span className="tabular-nums">
                        {p.monthlyCents ? `${money(p.monthlyCents)} a month` : "No monthly fee"}
                        {p.yearlyMonthlyCents ? <span className="font-normal text-[#6b7280]">, {money(p.yearlyMonthlyCents)} billed yearly</span> : null}
                      </span>
                    </dt>
                    <dd className="mt-1 text-[14px] leading-[1.5] text-[#4b5563]">
                      {rate(p.fee)} per sale to {c.name}. Card processing: {p.processingLabel}.
                      {p.sellsDigital ? null : " Not able to sell digital products."}
                      <SourceMarks ids={p.claim.sources} numbers={numbers} />
                      <StatusNote status={p.claim.status} note={p.claim.note} />
                    </dd>
                  </div>
                ))}
              </dl>
              {pricingSource ? (
                <p className={`mt-3 ${MUTED}`} data-checked-month>
                  Checked {monthYear(pricingSource.checkedOn)} on{" "}
                  <a href={pricingSource.url} rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-[#1a1a2e]">
                    {c.name}&apos;s pricing page
                  </a>
                  . Prices change, so check there before you decide.
                </p>
              ) : null}
              {c.pricingNotes.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {c.pricingNotes.map((n) => (
                    <ClaimItem key={n.text} claim={n} numbers={numbers} className="text-[14px]" />
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Storelib</h3>
              <dl className="mt-3 divide-y divide-[#f1f2f4] rounded-2xl border border-[#e5e7eb]/60">
                <div className="px-4 py-3.5 sm:px-5">
                  <dt className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-semibold text-[#1a1a2e]">
                    <span>Free</span>
                    <span>No monthly fee</span>
                  </dt>
                  <dd className="mt-1 text-[14px] leading-[1.5] text-[#4b5563]">
                    {STORELIB.freeFee} per sale. Under {STORELIB.smallOrderBelow}: {STORELIB.freeSmallRate}, no fixed part. {STORELIB.freeSites} websites, {STORELIB.freeStorage} of storage.
                  </dd>
                </div>
                <div className="px-4 py-3.5 sm:px-5">
                  <dt className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-semibold text-[#1a1a2e]">
                    <span>Pro</span>
                    <span>{STORELIB.proPrice} a month</span>
                  </dt>
                  <dd className="mt-1 text-[14px] leading-[1.5] text-[#4b5563]">
                    {STORELIB.proFee} per sale. Under {STORELIB.smallOrderBelow}: {STORELIB.proSmallRate}, no fixed part. {STORELIB.proSites} websites, {STORELIB.proStorage} of storage{STORELIB.proCustomDomain ? ", your own domain, no Storelib branding" : ""}.
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-2 text-[14px] leading-[1.6] text-[#374151]">
                <li>
                  Stripe&apos;s card processing applies on both plans: 2.9% + 30¢ for a US card on Stripe&apos;s standard pricing.
                  <SourceMarks ids={[STRIPE_PRICING_SOURCE.id]} numbers={numbers} />
                </li>
                <li>Pro&apos;s lower rate covers its price from about ${proBreakEvenDollars().toLocaleString("en-US")} of sales a month.</li>
                <li>
                  <Link href="/pricing" className="font-medium text-[#1a1a2e] underline underline-offset-2">Storelib pricing</Link>
                  {" · "}
                  <a href={publicHelpUrl(STORELIB_FEE_HELP_PATH)} className="font-medium text-[#1a1a2e] underline underline-offset-2">How Storelib&apos;s fee is worked out</a>
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="calculator" title="What a month costs on each" lead={<p>Type your price and how many sales you make in a month. Every plan is worked out the same way.</p>}>
          <FeeCalculator slug={c.slug} competitor={c.name} plans={c.plans} defaults={c.calculatorDefaults} />
        </Section>

        {/* ── Features ───────────────────────────────────────────────────── */}
        <Section id="features" title="Features side by side">
          <FeatureTable name={c.name} rows={c.features} numbers={numbers} flags={flags} />
        </Section>

        {/* ── Strengths and limits, both sides ───────────────────────────── */}
        <Section id="strengths" title="Strengths and limits">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="space-y-8">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Where {c.name} is strong</h3>
                <div className="mt-3"><ClaimList claims={c.strengths} numbers={numbers} /></div>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Where {c.name} falls short</h3>
                <div className="mt-3"><ClaimList claims={c.limits} numbers={numbers} /></div>
              </div>
            </div>
            <div className="space-y-8">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Where Storelib is strong</h3>
                <div className="mt-3"><PointList points={c.storelibStrengths} flags={flags} /></div>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Where Storelib falls short</h3>
                <div className="mt-3"><PointList points={c.storelibLimits} flags={flags} /></div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Real Storelib screens ──────────────────────────────────────── */}
        {shots.length > 0 ? (
          <Section id="screens" title="What selling on Storelib looks like" lead={<p>Real Storelib screens with demo stores. The names, products and figures in them are made up.</p>}>
            <Screens shots={shots} />
          </Section>
        ) : null}

        {/* ── Examples ───────────────────────────────────────────────────── */}
        <Section id="examples" title="Who it suits">
          <div className="grid gap-8 md:grid-cols-3">
            {c.examples.map((e) => (
              <div key={e.title}>
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">{e.who}</p>
                <h3 className="mt-1.5 text-[16px] font-semibold text-[#1a1a2e]">{e.title}</h3>
                <p className={`mt-2 ${BODY}`}>{e.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Switching ──────────────────────────────────────────────────── */}
        <Section id="switch" title={`Moving from ${c.name} to Storelib`}>
          <div className="mb-10 grid gap-8 md:grid-cols-3" data-moving>
            {(Object.keys(MOVING_TITLES) as (keyof typeof MOVING_TITLES)[]).map((k) => (
              <div key={k}>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{MOVING_TITLES[k]}</h3>
                <p className={`mt-2 ${BODY}`}>{c.moving[k]}</p>
                <ul className="mt-3 space-y-1.5 text-[14px]">
                  {MOVING_HELP[k].map(helpLink).filter((h) => !!h).map((h) => (
                    <li key={h.href}>
                      <a href={h.href} className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{h.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <h3 className="mb-5 text-[16px] font-semibold text-[#1a1a2e]">Step by step</h3>
          {c.importer ? (
            <p className={`mb-6 max-w-[720px] ${BODY}`}>
              {c.importer.text}{" "}
              <Link href={c.importer.href} className="font-semibold text-[#1a1a2e] underline underline-offset-2">{c.importer.label}</Link>
            </p>
          ) : null}
          <ol className="max-w-[720px] space-y-5">
            {c.switching.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[28px_1fr] gap-3">
                <span aria-hidden className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#d4d7dc] text-[13px] font-semibold tabular-nums text-[#1a1a2e]">{i + 1}</span>
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{s.title}</h3>
                  <p className={`mt-1 ${BODY}`}>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <SignupCta slug={c.slug} placement="switch">Create a free account</SignupCta>
          </div>
        </Section>

        <RelatedVideo path={alternativePath(c.slug)} />

        {/* ── Questions: plain HTML, no FAQPage markup ───────────────────── */}
        <Section id="questions" title="Questions">
          <div className="max-w-[760px] divide-y divide-[#eef0f2] border-y border-[#eef0f2]">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[16px] font-semibold text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[16px] font-semibold">{f.q}</h3>
                  <span aria-hidden className="text-[20px] leading-none text-[#6b7280] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className={`pb-4 pr-8 ${BODY}`}>{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* ── Sources ────────────────────────────────────────────────────── */}
        <Section id="sources" title="Sources">
          <p className={`max-w-[720px] ${BODY}`}>
            Every {c.name} price, fee and feature above was checked on {checked} against these pages.
            {unsettled > 0 ? ` ${unsettled} ${unsettled === 1 ? "point is" : "points are"} marked where the sources disagree or could not be confirmed.` : ""} Prices change: check {c.name}&apos;s own pricing before you decide. Storelib&apos;s figures come from the code that charges them.
          </p>
          <ol className="mt-5 max-w-[860px] space-y-2">
            {sources.map((s, i) => (
              <li key={s.id} id={`source-${s.id}`} className="scroll-mt-28 grid grid-cols-[28px_1fr] text-[14px] leading-[1.5]">
                <span className="tabular-nums text-[#6b7280]">{i + 1}.</span>
                <span className="min-w-0">
                  <a href={s.url} rel="nofollow noopener" target="_blank" className="break-words font-medium text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">
                    {s.title}
                  </a>
                  <span className="text-[#6b7280]"> · {s.publisher} · checked on {formatCheckedDate(s.checkedOn)}</span>
                </span>
              </li>
            ))}
          </ol>
          <Disclaimer names={[c.name]} className="mt-8" />
        </Section>

        {/* ── Elsewhere ──────────────────────────────────────────────────── */}
        <section aria-labelledby="more-h" className="border-t border-[#eef0f2] py-10 sm:py-14">
          <h2 id="more-h" className="text-[18px] font-semibold text-[#1a1a2e]">More comparisons</h2>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={alternativePath(r.slug)} className="group block">
                  <span className="text-[15px] font-semibold text-[#1a1a2e] group-hover:underline">Storelib vs {r.name}</span>
                  <span className={`mt-0.5 block ${MUTED}`}>{r.pricingShort}</span>
                </Link>
              </li>
            ))}
          </ul>
          {landing.length > 0 ? (
            <>
              <h3 className="mt-8 text-[15px] font-semibold text-[#1a1a2e]">Selling on Storelib</h3>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
                {landing.map((u) => (
                  <li key={u.slug}>
                    <Link href={useCasePath(u.slug)} className="font-medium text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{u.nav}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-6 text-[14px]">
            <Link href={HUB_PATH} className="font-medium text-[#1a1a2e] underline underline-offset-2">All comparisons</Link>
          </p>
        </section>
      </div>

      {/* ── The last word: one band, the same action as the top ──────────── */}
      <section aria-labelledby="start-h" className="bg-[#f8f9fa] border-t border-[#eef0f2]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 id="start-h" className="text-[22px] font-bold text-[#1a1a2e]">Try Storelib next to {c.name}</h2>
            <p className="mt-1.5 text-[15px] text-[#4b5563]">Free has no monthly fee and asks for no card. Keep your {c.name} account until you are ready.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignupCta slug={c.slug} placement="bottom">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
