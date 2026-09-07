/**
 * The one check that turns something a user typed into a URL safe to put in an
 * href or a src on a public page.
 *
 * TWO THINGS IT REFUSES, and both were reachable:
 *
 * 1. A SCHEME THAT IS NOT http(s). `javascript:` and `data:` in an href are
 *    the whole reason this function exists. The old code prefixed `https://`
 *    onto anything without a scheme and relied on the result failing to parse
 *    — `javascript:alert(1)` survived only because "alert(1)" is an invalid
 *    port, which is an accident, not a defence. A payload that parsed would
 *    have gone straight through. The scheme is now read and checked by name
 *    before anything is prefixed.
 *
 * 2. A HOSTNAME THAT IS NOT A HOSTNAME. The old rule was
 *    `hostname.includes(".")`, and `../../evil` passes it: it has slashes, so
 *    it is treated as a URL, `https://../../evil` parses with a hostname of
 *    `..`, and the dot is right there. The result — `https://../evil` — was
 *    saved and rendered. A real domain needs a label, a dot and a TLD of at
 *    least two letters, which is what is asked for now.
 *
 * Found by a test that fed the resolver its own edge cases rather than
 * asserting the shape of the code.
 */

/** label(.label)+.tld — no empty labels, no bare dots, TLD is letters. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

export function toPublicHttpUrl(raw: unknown, maxLength = 300): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > maxLength) return null

  /**
   * The scheme is checked twice on purpose, and only the second one is load-
   * bearing — a break-test proved it by deleting this line and watching every
   * assertion still pass, because `new URL("javascript:…").protocol` is
   * `javascript:` and the check below catches it.
   *
   * It stays because it is the check that reads as the rule. Without it the
   * only thing standing between `javascript:` and an href is a property of the
   * URL parser, which is how this went wrong the first time: the old code
   * relied on `alert(1)` being an invalid port. Deleting it is safe; deleting
   * the one below is not, and having them adjacent makes that obvious.
   */
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme && scheme !== "http" && scheme !== "https") return null

  try {
    const url = new URL(scheme ? value : `https://${value}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!HOSTNAME.test(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}
