import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/*
  SIGNED WEBHOOKS for form responses, the same scheme as the commerce
  webhooks (lib/physical/jobs-server.ts). The receiver gets

    x-storelib-timestamp   seconds since 1970
    x-storelib-signature   v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
    x-storelib-event       form.response or form.test
    x-storelib-delivery    the job id, the same on every retry

  and checks the signature with its secret, refusing a timestamp more than
  five minutes away. verifyWebhook is that check.
*/

export const WEBHOOK_TOLERANCE_S = 300
export const MAX_ATTEMPTS = 6
const DELAYS_MIN = [1, 5, 30, 120, 360, 1440]

export function newWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url")
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

export function verifyWebhook(
  secret: string,
  header: string | null | undefined,
  timestamp: string | number | null | undefined,
  body: string,
  nowMs = Date.now(),
): boolean {
  const ts = Number(timestamp)
  if (!secret || !header || !Number.isInteger(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false
  const expected = Buffer.from(signWebhook(secret, ts, body))
  const given = Buffer.from(String(header))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** How long to wait after this many failed attempts: 1 min, 5 min, 30 min, 2 h, 6 h, then a day. */
export function retryDelayMs(attempts: number): number {
  return DELAYS_MIN[Math.max(0, Math.min(DELAYS_MIN.length - 1, attempts - 1))] * 60_000
}

/** Only an https address on a public host name may receive a webhook. The socket checks the resolved address again. */
export function webhookUrlProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return "Use an https address."
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "Use an https address."
  }
  if (url.protocol !== "https:") return "Use an https address."
  if (url.username || url.password) return "Remove the user name and password from the address."
  if (url.port && url.port !== "443") return "Use the standard https port."
  const host = url.hostname.toLowerCase()
  if (!host.includes(".") || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home\.arpa)$/.test(host) || /^[\d.]+$/.test(host) || host.startsWith("["))
    return "Use a public address."
  return null
}
