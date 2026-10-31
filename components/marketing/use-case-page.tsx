/**
 * ===========================================================================
 *  ONE /sell PAGE: WHAT YOU SELL, HOW IT REACHES THE BUYER, HOW TO SET IT UP,
 *  WHAT IT COSTS
 * ===========================================================================
 * Drawn on the server from lib/marketing/use-cases, so every word is in the
 * first response. The pieces are the comparison pages' own (components/
 * alternatives/parts), so the marketing pages read as one site.
 */
import Image from "next/image"
import Link from "next/link"
import { ALL_FACTS, FACTS_UPDATED, LIMITATIONS, monthYear, type FactFlag } from "@/lib/marketing/facts"
import { USE_CASES, useCasePath, useCaseSource, useCaseOn, type UseCase } from "@/lib/marketing/use-cases"
import { USE_CASE_PARENT, useCaseJsonLd } from "@/lib/marketing/use-case-seo"
import { getAlternative, alternativePath } from "@/lib/alternatives"
import { helpLink } from "@/lib/marketing/help-links"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { SignupCta } from "@/components/alternatives/signup-cta"
import { BODY, MUTED, Section } from "@/components/alternatives/parts"
import { SaleExample } from "./sale-example"
import { RelatedVideo } from "./related-video"

type Flags = Record<FactFlag, boolean>

const DOT = "relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-[5px] before:w-[5px] before:rounded-full"

export function UseCasePage({ u, flags }: { u: UseCase; flags: Flags }) {
  const path = useCasePath(u.slug)
  const source = useCaseSource(u.slug)
  const facts = u.facts.map((id) => ALL_FACTS.find((f) => f.id === id)).filter((f) => !!f)
  const limits = u.limits.map((id) => LIMITATIONS.find((f) => f.id === id)).filter((f) => !!f)
  const help = u.help.map(helpLink).filter((h) => !!h)
  const comparisons = u.alternatives.map((s) => getAlternative(s)).filter((c) => !!c)
  const others = USE_CASES.filter((x) => x.slug !== u.slug && useCaseOn(x, flags))

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(useCaseJsonLd(u)) }} />
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <header className="pb-10 pt-8 sm:pb-12 sm:pt-12">
          <nav aria-label="Breadcrumb" className={MUTED}>
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-[#1a1a2e]">Storelib</Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href={USE_CASE_PARENT.path} className="hover:text-[#1a1a2e]">{USE_CASE_PARENT.name}</Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-[#1a1a2e]">{u.nav}</li>
            </ol>
          </nav>
          <h1 className="mt-5 max-w-[820px] text-[30px] font-bold leading-[1.12] tracking-[-0.02em] text-[#1a1a2e] sm:text-[40px]">{u.seo.h1}</h1>
          <p className="mt-4 max-w-[680px] text-[17px] leading-[1.55] text-[#4b5563]">{u.lede}</p>
          <p className={`mt-3 ${MUTED}`}>Updated {monthYear(u.updated > FACTS_UPDATED ? u.updated : FACTS_UPDATED)}. Prices and fees on this page are read from the code Storelib charges with.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SignupCta slug={null} source={source} placement="top">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#f9fafb]">
              See pricing
            </Link>
          </div>
        </header>

        <Section id="what" title="What you can sell, and how buyers get it">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <ul className="space-y-2.5">
              {u.whatYouSell.map((w) => (
                <li key={w} className={`${BODY} ${DOT} before:bg-[#1a1a2e]`}>{w}</li>
              ))}
            </ul>
            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {u.delivery.map((d) => (
                <div key={d.title}>
                  <dt className="text-[15px] font-semibold text-[#1a1a2e]">{d.title}</dt>
                  <dd className={`mt-1 ${BODY}`}>{d.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        <Section id="how" title="How to set it up" lead={<p>The screens below are Storelib&apos;s own, shown with made up demo content.</p>}>
          <ol className="space-y-10">
            {u.steps.map((s, i) => (
              <li key={s.title} className={`grid gap-5 ${s.shot ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start" : ""}`}>
                <div className="grid grid-cols-[28px_1fr] gap-3">
                  <span aria-hidden className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#d4d7dc] text-[13px] font-semibold tabular-nums text-[#1a1a2e]">{i + 1}</span>
                  <div className="max-w-[520px]">
                    <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{s.title}</h3>
                    <p className={`mt-1 ${BODY}`}>{s.text}</p>
                  </div>
                </div>
                {s.shot ? (
                  <figure className="min-w-0">
                    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#f8f9fa] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <Image src={s.shot.src} alt={s.shot.alt} width={s.shot.width} height={s.shot.height} sizes="(min-width: 1024px) 620px, 100vw" className="h-auto w-full" />
                    </div>
                    <figcaption className={`mt-2 ${MUTED}`}>{s.shot.alt}.</figcaption>
                  </figure>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="cost" title="What it costs">
          <SaleExample priceCents={u.example.priceCents} what={u.example.what} per={u.example.per} />
        </Section>

        <Section id="included" title="What comes with it, and what does not">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Included</h3>
              <ul className="mt-3 space-y-3">
                {facts.map((f) => {
                  const off = f.flag && !flags[f.flag]
                  return (
                    <li key={f.id} className={`${BODY} ${DOT} before:bg-[#1a1a2e]`}>
                      <span className="font-semibold text-[#1a1a2e]">{f.label}{f.status === "partial" ? " (partly)" : ""}.</span> {off ? "Not offered today." : f.text}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Not included</h3>
              <ul className="mt-3 space-y-3">
                {limits.map((f) => (
                  <li key={f.id} className={`${BODY} ${DOT} before:bg-[#9ca3af]`}>
                    <span className="font-semibold text-[#1a1a2e]">{f.label}.</span> {f.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section id="examples" title="Examples">
          <div className="grid gap-8 md:grid-cols-3">
            {u.examples.map((e) => (
              <div key={e.title}>
                <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{e.title}</h3>
                <p className={`mt-2 ${BODY}`}>{e.text}</p>
                {e.href ? (
                  <a href={e.href} className="mt-2 inline-block text-[14px] font-medium text-[#1a1a2e] underline underline-offset-2">
                    {e.href.replace(/^https:\/\//, "")}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </Section>

        <RelatedVideo path={path} />

        <Section id="questions" title="Questions">
          <div className="max-w-[760px] divide-y divide-[#eef0f2] border-y border-[#eef0f2]">
            {u.faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{f.q}</h3>
                  <span aria-hidden className="text-[20px] leading-none text-[#6b7280] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className={`pb-4 pr-8 ${BODY}`}>{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        <section aria-labelledby="more-h" className="border-t border-[#eef0f2] py-10 sm:py-14">
          <h2 id="more-h" className="text-[18px] font-semibold text-[#1a1a2e]">Read more</h2>
          <div className="mt-5 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Help Center</h3>
              <ul className="mt-3 space-y-2 text-[14px]">
                {help.map((h) => (
                  <li key={h.href}>
                    <a href={h.href} className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{h.title}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Compared</h3>
              <ul className="mt-3 space-y-2 text-[14px]">
                {comparisons.map((c) => (
                  <li key={c.slug}>
                    <Link href={alternativePath(c.slug)} className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">Storelib vs {c.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">From the blog</h3>
              <ul className="mt-3 space-y-2 text-[14px]">
                {u.blog.map((b) => (
                  <li key={b.path}>
                    <Link href={b.path} className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{b.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]">Also on Storelib</h3>
              <ul className="mt-3 space-y-2 text-[14px]">
                {others.map((x) => (
                  <li key={x.slug}>
                    <Link href={useCasePath(x.slug)} className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">{x.nav}</Link>
                  </li>
                ))}
                <li>
                  <Link href="/features" className="text-[#1a1a2e] underline decoration-[#c7cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">Storelib in one page</Link>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="start-h" className="border-t border-[#eef0f2] bg-[#f8f9fa]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 id="start-h" className="text-[22px] font-bold text-[#1a1a2e]">Start on Free</h2>
            <p className="mt-1.5 text-[15px] text-[#4b5563]">No monthly fee and no card to sign up. Move to Pro when the lower fee pays for itself.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SignupCta slug={null} source={source} placement="bottom">Start free</SignupCta>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-[10px] border border-[#d4d7dc] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] hover:bg-[#f9fafb]">See pricing</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
