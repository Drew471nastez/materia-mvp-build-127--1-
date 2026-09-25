/**
 * An address as the queue stores and sends to it, or null when it cannot be
 * one.
 *
 * Lower case, because the list is keyed on it and "Ana@x.com" and
 * "ana@x.com" are one person's inbox at every provider a creator's readers
 * use. Anything with a line break, a space, a quote or angle brackets is
 * refused rather than repaired: those are how a To header grows a second
 * recipient or a Bcc.
 */
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

export function normalizeAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const email = raw.trim().toLowerCase()
  if (!email || email.length > 254) return null
  if (/[\s\r\n<>"(),;:\\[\]]/.test(email)) return null
  const at = email.lastIndexOf("@")
  if (at < 1 || at !== email.indexOf("@")) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || !LOCAL.test(local)) return null
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null
  if (domain.length > 253) return null
  const labels = domain.split(".")
  if (labels.length < 2) return null
  if (!labels.every((l) => LABEL.test(l))) return null
  if (!TLD.test(labels[labels.length - 1])) return null
  return email
}

export function isSendableAddress(raw: unknown): boolean {
  return normalizeAddress(raw) !== null
}

/**
 * A display name as it may appear in a From header: no line breaks, no
 * brackets or quotes that end the phrase early, and no "@", so a creator
 * named "support@bank.com" cannot look like a bank's address in the inbox.
 */
export function safeDisplayName(raw: unknown, fallback = "Storelib"): string {
  const name = typeof raw === "string" ? raw : ""
  const clean = name
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>"@\\;,:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
  return clean || fallback
}
