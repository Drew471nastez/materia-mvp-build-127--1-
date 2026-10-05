/**
 * ===========================================================================
 *  "ABOUT <NAME>" AT THE FOOT OF A PERSON'S PAGE
 * ===========================================================================
 * Every creator page ends with its About block (UnifiedAboutSection in
 * components/store-builder/unified-section-renderer.tsx): a rule, "About
 * <name>" with a row of small facts under it, a second rule. A person
 * without a store gets the same block in the same place, measured to the
 * same column, spacing and type, with only what is true of somebody who sells
 * nothing: the year they joined and how many communities they are in (when
 * they show them). No sales, no products, no payment methods and no "Returns
 * & exchanges", which the creator's block always draws and which would be a
 * promise about a shop that does not exist.
 *
 * In the page's scheme colours (components/storefront/storefront-template),
 * so it reads as the creator page's own About. No "use client".
 */
import type { StorefrontChrome } from "@/lib/store-builder/storefront-chrome"

function Fact({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div data-person-about-fact={label.toLowerCase()}>
      <p className="mb-1 text-xs uppercase tracking-wide" style={{ color: `${ink}80` }}>
        {label}
      </p>
      <p className="text-xl font-semibold md:text-2xl" style={{ color: ink }}>
        {value}
      </p>
    </div>
  )
}

export function PersonAbout({
  name,
  joinedAt,
  communities,
  chrome,
}: {
  name: string
  joinedAt: string | null
  /** How many communities they are in, null when they keep that private (or communities are off). */
  communities: number | null
  chrome: Pick<StorefrontChrome, "text">
}) {
  const ink = chrome.text
  const year = joinedAt ? new Date(joinedAt).getUTCFullYear() : NaN
  const facts = [
    Number.isFinite(year) ? { label: "Joined", value: String(year) } : null,
    communities && communities > 0 ? { label: "Communities", value: String(communities) } : null,
  ].filter((f): f is { label: string; value: string } => !!f)
  return (
    /* The creator's About is a section with 48px above and below it (defaultAboutSettings spacing). */
    <section style={{ paddingTop: 48, paddingBottom: 48 }} aria-labelledby="person-about-heading" data-person-about="">
      <div className="mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6">
        <div className="w-full pt-2 sm:pt-4">
          <div className="mb-8 h-px w-full" style={{ backgroundColor: `${ink}20` }} />
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 md:flex-row md:gap-12">
            <div className="w-full flex-shrink-0 md:w-64">
              <h3 id="person-about-heading" className={`text-lg font-semibold md:text-xl${facts.length ? " mb-6" : ""}`} style={{ color: ink }}>
                About {name}
              </h3>
              {facts.length ? (
                <div className="flex gap-8">
                  {facts.map((f) => (
                    <Fact key={f.label} label={f.label} value={f.value} ink={ink} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-8 h-px w-full" style={{ backgroundColor: `${ink}20` }} />
        </div>
      </div>
    </section>
  )
}
