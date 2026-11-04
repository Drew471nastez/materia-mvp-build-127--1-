/**
 * ===========================================================================
 *  WHAT COPY TO STORELIB MAY FETCH, AND WHAT IT MAY KEEP
 * ===========================================================================
 * The blog editor's Copy to Storelib (lib/blog/copy-image.ts) asks Storelib's
 * server to download a picture from an address an admin pasted. A server
 * that fetches whatever address it is handed can be pointed at itself, at
 * the cloud's metadata service (169.254.169.254) or at any machine on its
 * network, so the address and the answer are both checked here:
 *
 *   THE ADDRESS   https only, on the standard port, no user or password in
 *                 it, a public name (not localhost, *.internal, a bare
 *                 word) or a public IP. Every address the name resolves to
 *                 must be public (addressesProblem); the socket checks
 *                 again at the moment it connects, and again for each
 *                 redirect, of which there are at most three
 *                 (lib/api/public-fetch.ts, httpsOnly).
 *   THE ANSWER    a 200, at most 10 MB (counted while it streams, whatever
 *                 the server says its length is), in 10 seconds, declared
 *                 as JPEG, PNG, WebP, GIF or AVIF AND starting with that
 *                 format's own bytes. Never SVG: an SVG is a document that
 *                 can carry script.
 *
 * Private addresses (lib/api/public-fetch isPrivateAddress): 0/8, 10/8,
 * 100.64/10, 127/8, 169.254/16 (link local and the metadata address),
 * 172.16/12, 192.168/16, the documentation and benchmark ranges, multicast
 * and reserved; ::, ::1, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32, and
 * an IPv4 address inside IPv6 (::ffff:127.0.0.1, 64:ff9b::, 2002::) by the
 * IPv4 rules.
 *
 * Pure, so tests/seo-leftovers-b-r45.test.ts runs every case.
 */
import { isPrivateAddress, publicUrlProblem } from "@/lib/api/public-fetch"
import { isPublicImage } from "@/lib/storage/file-signature"

export const COPY_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const COPY_IMAGE_TIMEOUT_MS = 10_000
export const COPY_IMAGE_MAX_REDIRECTS = 3
export const COPY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const

/** Why this address may not be fetched, or null. The addresses its name resolves to are checked separately. */
export function copyImageUrlProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "No picture address."
  if (raw.length > 2048) return "That address is too long."
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return "That is not a picture address."
  }
  if (url.protocol !== "https:") return "Only https addresses can be copied."
  if (url.username || url.password) return "An address with a user name or password in it can't be copied."
  if (url.port && url.port !== "443") return "Only addresses on the standard https port can be copied."
  const shape = publicUrlProblem(url.toString())
  if (shape) return shape === "a private address" || shape === "a local name" ? "That address is not on the public internet." : "That address can't be copied."
  return null
}

/** Why a name that resolves to these addresses may not be fetched, or null. One private address is enough to refuse. */
export function addressesProblem(addresses: readonly string[]): string | null {
  if (!addresses.length) return "That site's name does not resolve."
  return addresses.some((a) => isPrivateAddress(a)) ? "That address is not on the public internet." : null
}

/** The type a server declared, without its parameters and with the old spellings named properly: "image/jpg; x=y" is image/jpeg. */
export function declaredType(contentType: string | null | undefined): string {
  const d = (contentType ?? "").split(";")[0].trim().toLowerCase()
  return d === "image/jpg" || d === "image/pjpeg" ? "image/jpeg" : d === "image/x-png" ? "image/png" : d
}

/**
 * Why this answer is not a picture Storelib keeps, or null: the declared
 * type must be one of the five, and the first bytes must be that same
 * format. An SVG is refused by name, declared or sniffed.
 */
export function imageContentProblem(contentType: string | null | undefined, head: Uint8Array): { problem: string } | { mime: (typeof COPY_IMAGE_TYPES)[number] } {
  const declared = declaredType(contentType)
  const text = new TextDecoder().decode(head.subarray(0, 256)).trimStart().toLowerCase()
  if (declared.includes("svg") || text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return { problem: "SVG pictures can't be copied: an SVG can carry script." }
  if (!(COPY_IMAGE_TYPES as readonly string[]).includes(declared)) return { problem: declared ? `That address answered ${declared}, not a JPEG, PNG, WebP, GIF or AVIF picture.` : "That address did not say it is a picture." }
  const sniffed = isPublicImage(head)?.mime
  if (!sniffed || !(COPY_IMAGE_TYPES as readonly string[]).includes(sniffed)) return { problem: "That file is not a JPEG, PNG, WebP, GIF or AVIF picture." }
  if (sniffed !== declared) return { problem: `That file says it is ${declared} but its bytes are ${sniffed}.` }
  return { mime: sniffed as (typeof COPY_IMAGE_TYPES)[number] }
}
