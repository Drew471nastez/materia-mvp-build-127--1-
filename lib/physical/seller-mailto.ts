/**
 * "Email the seller" from a buyer's order page: a mailto link that opens the
 * buyer's mail app with the shop's address, a subject naming the order and a
 * short letter ready to finish (who they are writing to, which order, the
 * link back to it). The words come in the page's language from the caller
 * (ct), so this only puts them together and encodes them the way every mail
 * app reads a mailto: each part percent encoded, line breaks as CRLF.
 *
 * Pure: the order page and the tests build the same link.
 */

/** A plausible single address, or null: a mailto never carries anything else. */
export function mailAddress(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim()
  return /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/.test(v) ? v : null
}

export interface SellerLetter {
  subject: string
  /** The letter, one entry per line; an empty entry is an empty line. */
  lines: string[]
}

export function sellerMailto(email: string | null | undefined, letter: SellerLetter): string | null {
  const to = mailAddress(email)
  if (!to) return null
  /* Control characters out, the line breaks this puts in kept. */
  const enc = (s: string) => encodeURIComponent(s.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, " "))
  const body = letter.lines.map((l) => l.replace(/\r?\n/g, " ")).join("\r\n")
  return `mailto:${to}?subject=${enc(letter.subject.replace(/\s+/g, " ").trim())}&body=${enc(body)}`
}
