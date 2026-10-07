/**
 * ===========================================================================
 *  "ABOUT <NAME>" AT THE FOOT OF A PERSON'S PAGE
 * ===========================================================================
 * Every creator page ends with its About block (UnifiedAboutSection in
 * components/store-builder/unified-section-renderer.tsx): a rule, "About
 * <name>" with a row of small facts under it, their own words beside them, a
 * second rule. A person without a store gets the same block in the same
 * place, measured to the same column, spacing and type, and so does the
 * owner's own page at /account (app/account/page.tsx, through
 * components/profile/account-about.tsx).
 *
 * WHAT IT SAYS. The day they joined, where they are from, and how many
 * communities they are in (lib/profile/person-facts.ts), with the line they
 * wrote about themselves beside those, as the creator's story sits beside
 * theirs. One row per value that exists and nothing for a value nothing
 * knows: a person who never said where they are from has no "From" row, not
 * an empty one. No sales, no products, no payment methods and no "Returns
 * & exchanges", which the creator's block always draws and which would be a
 * promise about a shop that does not exist.
 *
 * THE DAY THEY JOINED IS SAID HERE, NOT IN ACTIVITY. The activity list used
 * to end on "Joined Storelib" (components/profile/profile-activity.tsx);
 * joining the platform is not something somebody did, it is a fact about
 * them, so it is one row here instead.
 *
 * NO FOLLOWER COUNTS. They are already under the name, in the header
 * (components/profile/profile-social.tsx), and a number said twice on one
 * page reads as a dashboard rather than as a person.
 *
 * In the page's scheme colours on /@handle (components/storefront/
 * storefront-template), in the account's ink on /account. No "use client".
 */
import type { StorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { personFacts } from "@/lib/profile/person-facts"
import { JoinSocialBrandIcon } from "@/components/onboarding/join-social-brands"
import type { ProfileSocialLink } from "@/lib/profile/social-links"

function Fact({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div data-person-about-fact={label.toLowerCase()}>
      <p className="mb-1 text-xs uppercase tracking-wide" style={{ color: `${ink}80` }}>
        {label}
      </p>
      <p className="text-[17px] font-semibold md:text-[19px]" style={{ color: ink }}>
        {value}
      </p>
    </div>
  )
}

export function PersonAbout({
  name,
  joinedAt,
  bio = null,
  location = null,
  communities,
  socials = [],
  chrome,
  inset = true,
}: {
  name: string
  joinedAt: string | null
  /** The line they wrote about themselves, beside the facts. Null when there is none. */
  bio?: string | null
  /** Where they are from, one line (lib/profile/location.ts locationLine); null when they never said. */
  location?: string | null
  /** How many communities they are in, null when they keep that private (or communities are off). */
  communities: number | null
  /** Handles from Create a profile, the same marks as that step. */
  socials?: ProfileSocialLink[]
  chrome: Pick<StorefrontChrome, "text">
  /**
   * Whether the block brings the creator page's own column with it. False
   * for a caller that is already inside a column (/account's, components/
   * account/account-column.tsx), so the rules keep the page's left edge
   * instead of sitting a gutter inside it.
   */
  inset?: boolean
}) {
  const ink = chrome.text
  const facts = personFacts({ joinedAt, location, communities })
  const story = (bio || "").trim()
  return (
    /* The creator's About is a section with 48px above and below it (defaultAboutSettings spacing). */
    <section style={{ paddingTop: 48, paddingBottom: 48 }} aria-labelledby="person-about-heading" data-person-about="">
      <div className={inset ? "mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6" : "w-full"}>
        <div className="w-full pt-2 sm:pt-4">
          <div className="mb-8 h-px w-full" style={{ backgroundColor: `${ink}20` }} />
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 md:flex-row md:gap-12">
            <div className="w-full flex-shrink-0 md:w-64">
              <h3 id="person-about-heading" className={`text-lg font-semibold md:text-xl${facts.length ? " mb-6" : ""}`} style={{ color: ink }}>
                About {name}
              </h3>
              {facts.length ? (
                <div className="flex flex-wrap gap-x-8 gap-y-5">
                  {facts.map((f) => (
                    <Fact key={f.label} label={f.label} value={f.value} ink={ink} />
                  ))}
                </div>
              ) : null}
              {socials.length ? (
                <div className="mt-6 flex flex-wrap gap-2" data-person-socials="">
                  {socials.map((s) => (
                    <a
                      key={s.id}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={s.label}
                      className="grid h-10 w-10 place-items-center rounded-full bg-[#f4f4f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_0_0_1px_rgba(17,24,39,0.07),0_1px_3px_rgba(17,24,39,0.07)]"
                      style={{ color: ink }}
                    >
                      <JoinSocialBrandIcon id={s.id} className="h-[18px] w-[18px]" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            {story ? (
              /* Their own words, where a creator's story sits: one column, never clamped. */
              <div className="min-w-0 flex-1">
                <p className="max-w-[640px] whitespace-pre-line text-[15px] leading-[1.6] [overflow-wrap:anywhere]" style={{ color: `${ink}cc` }} data-person-about-bio="">
                  {story}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-8 h-px w-full" style={{ backgroundColor: `${ink}20` }} />
        </div>
      </div>
    </section>
  )
}
