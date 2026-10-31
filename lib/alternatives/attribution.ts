/**
 * ===========================================================================
 *  A SIGN UP THAT STARTED ON A COMPARISON PAGE, AND WHERE THE VISIT CAME FROM
 * ===========================================================================
 * The buttons on /alternatives go to `/signup?intent=sell`, the address
 * every "start selling" link uses (lib/auth/continue.ts: signup carries
 * `intent` and `next` through verification and the OAuth round trip).
 *
 * Two things ride along, in the parameters the rest of Storelib already
 * reads as a source (lib/orders/checkout-origin, lib/communities/visit-source):
 *
 *   src       the comparison page the button was on: `alternatives-gumroad`,
 *             or `alternatives` on the hub. Always set by us.
 *   ref,      what the visitor ARRIVED with, carried on unchanged, so a
 *   utm_*     visit from a newsletter's utm tags or a partner's ?ref= is
 *             still credited to them at sign up. With no ref of their own,
 *             ref is the page's src, as a ?ref= link would be.
 *
 * The page is static, so it renders the plain address and the browser adds
 * the visitor's own tags once it has read them (components/alternatives
 * signup-cta): the link is never missing, and never wrong for more than the
 * moment before hydration.
 *
 * Pure: the signup page reads the same parameters back with readSignupSource.
 */

export const CARRIED_PARAMS = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const
export type CarriedParam = (typeof CARRIED_PARAMS)[number]

const SLUG = /^[a-z0-9-]{1,60}$/
const VALUE = /^[\w.\-~+%/: ]{1,120}$/

/** `alternatives-gumroad`, or `alternatives` for the hub. */
export function comparisonSource(slug?: string | null): string {
  return slug && SLUG.test(slug) ? `alternatives-${slug}` : "alternatives"
}

/** A value worth carrying: short, printable, nothing that could be markup. */
function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  return v && VALUE.test(v) ? v : null
}

/** The visitor's own tags from an address's query string. */
export function incomingTags(search: string): Partial<Record<CarriedParam, string>> {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const out: Partial<Record<CarriedParam, string>> = {}
  for (const k of CARRIED_PARAMS) {
    const v = clean(q.get(k))
    if (v) out[k] = v
  }
  return out
}

/** The sign up address for a button on a comparison page, with whatever the visit arrived with. */
export function signupHref(slug: string | null | undefined, search = ""): string {
  return signupHrefFor(comparisonSource(slug), search)
}

/**
 * The same address for any Storelib marketing page, named by its own source
 * (`sell-digital-products` on /sell/digital-products, lib/marketing/use-cases
 * useCaseSource). The signup page reads it back with readSignupSource.
 */
export function signupHrefFor(source: string, search = ""): string {
  const src = SLUG.test(source) ? source : "alternatives"
  const tags = incomingTags(search)
  const q = new URLSearchParams({ intent: "sell", src, ref: tags.ref ?? src })
  for (const k of CARRIED_PARAMS) if (k !== "ref" && tags[k]) q.set(k, tags[k] as string)
  return `/signup?${q.toString()}`
}

export interface SignupSource {
  src: string | null
  ref: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

/** What the signup page was opened with, or null when it carries no source at all. */
export function readSignupSource(params: { get(name: string): string | null }): SignupSource | null {
  const out: SignupSource = {
    src: clean(params.get("src")),
    ref: clean(params.get("ref")),
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
  }
  return Object.values(out).some(Boolean) ? out : null
}
