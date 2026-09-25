/**
 * ===========================================================================
 *  AFTER CHECKOUT, BACK TO THE CREATOR'S OWN WEBSITE, AND NOWHERE ELSE
 * ===========================================================================
 * A buyer presses Buy on a creator's website, pays on Storelib checkout, and
 * should land back on that website, not on a Storelib page they never chose
 * to visit. So a link to checkout can say where to come back to:
 *
 *   /checkout?productId=…&src=website&return=<url>&cancel=<url>
 *
 *   return   where the buyer goes after paying (with ?checkout=paid added)
 *   cancel   where Back goes, for a buyer who changes their mind
 *
 * The website adds both on its own as the link is followed: the page the
 * buyer was on (lib/orders/checkout-origin.ts, checkoutHrefWithOrigin). A
 * section may ask for another page of the same site, `return=/thank-you`.
 *
 * ---------------------------------------------------------------------------
 *  WHICH IS AN OPEN REDIRECT UNLESS IT IS CHECKED HERE
 * ---------------------------------------------------------------------------
 * Checkout lives on storelib.com and people trust what it does next. A
 * `return` honoured without a check turns the platform's payment page into a
 * way to send a buyer, fresh from paying, anywhere at all: a page that looks
 * like a receipt and asks for their card again. So a target is honoured only
 * when its host is one of THIS creator's own websites, checked on the server
 * against what the database says they own (./site-hosts.ts):
 *
 *   their storelib subdomains   <username>, <creator slug> and the name the
 *                               website was given, under the platform domain
 *   their verified domains      a custom domain whose DNS has been seen
 *                               pointing at us, and its www host
 *
 * Exactly those hosts. Not "anything under storelib.com", which is every
 * other creator's site too; not a host that merely ends with one of them;
 * not a URL with a user name in front of the host; not http; not a port. A
 * path on its own ("/thank-you") is resolved against the site the buyer came
 * from, and only when that site is one of the same hosts.
 *
 * Anything else is dropped, and checkout does what it always did: the
 * Storelib receipt after paying, and Back to the product.
 *
 * Pure, so every shape that has ever been used to smuggle a redirect past a
 * check is executed in tests/agent-brain.test.ts rather than reasoned about.
 */

export interface ReturnRules {
  /** This creator's own website hosts, lower case, no port. */
  hosts: string[]
  /** The platform's domain, e.g. "storelib.com". Decides whether this is a developer's machine. */
  mainDomain: string
  /** The host the buyer came from (`site=` on the checkout link), for a path. Checked like any other. */
  base?: string | null
}

/** The query parameters, named once. */
export const RETURN_PARAM = "return"
export const CANCEL_PARAM = "cancel"
/** What the site is told when the buyer comes back having paid. */
export const RESULT_PARAM = "checkout"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

function isLocalPlatform(mainDomain: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(mainDomain.toLowerCase())
}

/** A host as it is compared: lower case, no trailing dot. */
export function normalHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, "")
}

/**
 * Where to send the buyer, as an absolute URL, or null when this is not one
 * of the creator's own website addresses.
 */
export function checkoutReturnTarget(raw: unknown, rules: ReturnRules): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (value === "" || value.length > 2048) return null
  /* Control characters and spaces, which some browsers strip before
     parsing: a target that reads as safe here could be another one by the
     time it is followed. A backslash is read as a slash by several. */
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(value)) return null

  const allowed = new Set(rules.hosts.map(normalHost).filter(Boolean))
  const local = isLocalPlatform(rules.mainDomain)

  let url: URL
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return null
    const base = rules.base ? normalHost(rules.base) : ""
    if (!base || !allowed.has(base)) return null
    try {
      url = new URL(value, `${local && LOCAL_HOSTS.has(base) ? "http" : "https"}://${base}`)
    } catch {
      return null
    }
  } else {
    try {
      url = new URL(value)
    } catch {
      return null
    }
  }

  const host = normalHost(url.hostname)
  const isLocal = LOCAL_HOSTS.has(host)
  if (url.protocol !== "https:" && !(local && isLocal && url.protocol === "http:")) return null
  /* user:pass@ in front of a host is how a URL is made to read as ours. */
  if (url.username || url.password) return null
  /* A port is a different server, except on a developer's own machine. */
  if (url.port && !(local && isLocal)) return null
  if (!allowed.has(host)) return null

  url.hash = ""
  url.searchParams.delete(RESULT_PARAM)
  return url.toString()
}

/** The address the buyer is sent to after paying: the site's page, saying so. */
export function paidReturnUrl(target: string): string {
  try {
    const url = new URL(target)
    url.searchParams.set(RESULT_PARAM, "paid")
    return url.toString()
  } catch {
    return target
  }
}

/** The host a target names, for the words "Taking you back to …". */
export function returnHostLabel(target: string | null | undefined): string | null {
  if (!target) return null
  try {
    return new URL(target).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}
