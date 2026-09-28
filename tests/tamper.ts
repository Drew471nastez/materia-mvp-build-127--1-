/**
 * ===========================================================================
 *  CHANGING A SIGNATURE SO THAT IT REALLY CHANGED
 * ===========================================================================
 * Three suites checked that a signature a character different is refused, and
 * each wrote the new character itself:
 *
 *     token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA")
 *
 * An HMAC-SHA256 is 32 bytes, and base64url writes 32 bytes in 43 characters.
 * 43 characters carry 258 bits and 32 bytes are 256, so the LAST character's
 * low two bits are not part of the value and the decoder drops them: "A" and
 * "B" in that position decode to the same byte. When the token happened to
 * end in "A" with a "B" before it, writing "BB" over both left the decoded
 * signature exactly as it was, the signature verified, and the check failed
 * although nothing was wrong with the code. About one run in thirty, on a
 * random token, which is why it looked like the machine's fault.
 *
 * So the change is made to the bytes rather than to the text: one byte
 * flipped, then encoded again. Every character the encoder writes then
 * carries the change, whatever the length.
 */

/** The same base64url value with its first byte flipped: always a different value. */
export function tamperBase64url(value: string): string {
  const bytes = Buffer.from(value, "base64url")
  if (bytes.length === 0) return "AA"
  bytes[0] = bytes[0] ^ 0xff
  return bytes.toString("base64url")
}

/** The same dotted token with the signature (its last part) changed. */
export function tamperSignature(token: string): string {
  const parts = token.split(".")
  parts[parts.length - 1] = tamperBase64url(parts[parts.length - 1])
  return parts.join(".")
}
