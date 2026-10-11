/**
 * Mailgun HTTP API email sending
 *
 * Environment variables required:
 * - MAILGUN_API_KEY: Your Mailgun API key
 * - MAILGUN_DOMAIN: storelib.com
 * - MAILGUN_BASE_URL: https://api.eu.mailgun.net (EU region)
 * - EMAIL_FROM: "Storelib <noreply@storelib.com>"
 * - EMAIL_REPLY_TO: "support@storelib.com"
 */
import { maskEmail } from "@/lib/privacy/mask-email"
import { mediaUrlsIn } from "@/lib/storage/media-url"
import { GMAIL_CLIP_BYTES, finalizeEmailHtml } from "@/lib/mail-document"

export { finalizeEmailHtml }

/**
 * The body as it is sent: a whole document (lib/mail-document), and a word
 * in the log when it is heavy enough for Gmail to clip. The size only, never
 * the subject or an address.
 */
function sendableHtml(html: string, subject: string): string {
  /* Every picture at Storelib's own address, never the storage host's (lib/storage/media-url.ts). */
  const doc = mediaUrlsIn(finalizeEmailHtml(html, subject))
  const bytes = Buffer.byteLength(doc)
  if (bytes > GMAIL_CLIP_BYTES * 0.8) console.warn(`[mailgun] HTML is ${Math.round(bytes / 1024)} KB; Gmail clips a message over 102 KB`)
  return doc
}

// Mailgun configuration from environment variables
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ""
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "storelib.com"
const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net"

/**
 * EVERY FROM HEADER HAS A NAME. An address on its own ("noreply@storelib.com",
 * which is what EMAIL_FROM held on the server) shows in the inbox as
 * "noreply": the welcome email arrived that way. Any from without a display
 * name is given "Storelib" here, where every send passes, so no sender can
 * leave it out. A from that already has a name keeps it.
 */
export function withDisplayName(from: string, name = "Storelib"): string {
  const value = (from || "").trim()
  if (!value) return `Storelib <noreply@storelib.com>`
  if (/<[^<>@\s]+@[^<>\s]+>\s*$/.test(value)) {
    /* "<a@b.c>" with nothing before it still has no name. */
    return /^\s*<.+>\s*$/.test(value) ? `${name} ${value}` : value
  }
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(value)) return `${name} <${value}>`
  return value
}

/**
 * A DISPLAY NAME A MAIL SERVER READS AS A NAME. A seller's store name or a
 * buyer's first name goes into From as typed, and a name with a comma, a
 * colon or an @ in it ("Ana, Studio", "Jo: orders") is not a name to a mail
 * server: RFC 5322 reads the comma as a second address and the colon as a
 * group, and the message is refused or shown from someone else. Such a name
 * is put in quotes; quotes and line breaks inside it are taken out first.
 * A name without those characters, or already quoted, is left as it is.
 */
export function quotedFrom(from: string): string {
  const m = (from || "").match(/^\s*([\s\S]*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/)
  if (!m) return from
  if (/^".*"$/.test(m[1])) return from
  const name = m[1].replace(/[\r\n"\\]+/g, " ").replace(/\s+/g, " ").trim()
  if (!name) return `Storelib <${m[2]}>`
  return /[()<>[\]:;@,.]/.test(name) ? `"${name}" <${m[2]}>` : `${name} <${m[2]}>`
}

// Email defaults
export const EMAIL_FROM = withDisplayName(process.env.EMAIL_FROM || "Storelib <noreply@storelib.com>")
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "support@storelib.com"
export const PLATFORM_BRAND = "Storelib"

/**
 * Check if Mailgun is configured
 */
export function isMailgunConfigured(): boolean {
  return !!(MAILGUN_API_KEY && MAILGUN_DOMAIN)
}

/**
 * Email send options interface
 */
export interface MailgunSendOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string // "Display Name <email@domain.com>"
  replyTo?: string
  tags?: string[]
  metadata?: Record<string, string>
  headers?: Record<string, string>
  /** Files sent with the message, such as a buyer's invoice as a PDF. */
  attachments?: MailAttachment[]
  /**
   * A one-time code or other mail the person just asked for. No open or click
   * tracking (rewritten links hurt delivery), and no bounce lookup before the
   * send, so the message leaves on the first request.
   */
  transactional?: boolean
}

export interface MailAttachment {
  filename: string
  content: Uint8Array
  contentType: string
}

/**
 * Email send result
 */
export interface MailgunSendResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Strip HTML to plain text (used as fallback when no text version is provided)
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<head(\s[^>]*)?>[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim()
}

/**
 * Validate email format (RFC 5322 simplified)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false
  const trimmed = email.trim()
  // Basic structural check: local@domain.tld, no spaces, single @
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  return re.test(trimmed) && trimmed.length <= 254
}

/**
 * The From Mailgun will actually accept.
 *
 * Codes were sent as noreply@storelib.com. The domain Mailgun signs, and the
 * address every other Storelib email uses, is MAILGUN_FROM_EMAIL on
 * mg.storelib.com. A From on a different domain is refused or dropped, which
 * is why a code for a Gmail address or an @storelib.com address never arrived.
 * A transactional send uses that signed address. Everything else keeps the
 * From it named, unless that domain is not the sending domain and a signed
 * address is configured.
 */
function fromForSend(requested: string | undefined, _transactional?: boolean): string {
  const sendingDomain = MAILGUN_DOMAIN.toLowerCase()
  const signedEmail = (process.env.MAILGUN_FROM_EMAIL || "").replace(/[<>"\s]/g, "").trim()
  const signedDomain = signedEmail.split("@")[1]?.toLowerCase() || ""
  const name = (process.env.MAILGUN_FROM_NAME || "Storelib").replace(/[<>"\r\n]/g, "").trim() || "Storelib"
  const signed =
    signedEmail.includes("@") && signedDomain === sendingDomain
      ? quotedFrom(withDisplayName(`${name} <${signedEmail}>`))
      : ""
  const built = quotedFrom(withDisplayName(requested || EMAIL_FROM))
  const addr = (built.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] || built).toLowerCase()
  const fromDomain = addr.split("@")[1] || ""
  /* Only swap when the named From is not on the domain Mailgun is sending as.
     A signed address on a different domain is refused, and the code never leaves.
     The address is swapped, never the name: a store's email (a website's
     sign in code, a receipt) still says the store, not "Storelib". */
  if (signed && fromDomain && fromDomain !== sendingDomain) {
    const named = built.match(/^\s*([\s\S]*?)\s*<[^<>]+>\s*$/)?.[1]?.trim() ?? ""
    return named ? quotedFrom(`${named} <${signedEmail}>`) : signed
  }
  return built
}

/** Take one address off the bounce list so the next send is attempted. Never throws. */
async function clearBounce(email: string): Promise<void> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return
  try {
    await fetch(`${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/bounces/${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}` },
    })
  } catch {
    /* A missing bounce is a 404. Either way the send goes ahead. */
  }
}

/**
 * Check Mailgun suppression list before sending
 */
async function isEmailSuppressed(email: string): Promise<boolean> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return false

  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  try {
    // Check bounces
    const bounceRes = await fetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/bounces/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Basic ${authString}` } }
    )
    if (bounceRes.ok) {
      console.warn("[mailgun] Email is on bounce suppression list:", maskEmail(email))
      return true
    }

    // Check complaints
    const complaintRes = await fetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/complaints/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Basic ${authString}` } }
    )
    if (complaintRes.ok) {
      console.warn("[mailgun] Email is on complaint suppression list:", maskEmail(email))
      return true
    }

    return false
  } catch (err) {
    // Don't block sending on suppression check failure
    console.warn("[mailgun] Suppression check failed (allowing send):", err instanceof Error ? err.name : "unknown")
    return false
  }
}

/**
 * Send an email via Mailgun HTTP API
 */
export async function sendMailgunEmail(options: MailgunSendOptions): Promise<MailgunSendResult> {
  if (!isMailgunConfigured()) {
    console.error("[mailgun] Not configured - missing MAILGUN_API_KEY or MAILGUN_DOMAIN")
    return {
      success: false,
      error: "Email service not configured (Mailgun credentials missing)",
    }
  }

  // Validate email format before sending
  if (!isValidEmail(options.to)) {
    console.warn("[mailgun] Invalid email format, skipping:", maskEmail(options.to))
    return {
      success: false,
      error: "Invalid email format",
    }
  }

  // A code the person just asked for leaves at once. A bounce or complaint
  // lookup is two extra round trips before the send, which is what made the
  // verification email feel late.
  const suppressed = options.transactional ? false : await isEmailSuppressed(options.to)
  if (suppressed) {
    return {
      success: false,
      error: "Email suppressed: the address is on the bounce or complaint list",
    }
  }

  const fromAddress = fromForSend(options.from, options.transactional)
  const replyTo = options.replyTo || EMAIL_REPLY_TO
  /* A code they just asked for must not die on a stale bounce. Mailgun
     drops those after it has already answered "queued", so the page looks
     sent and the inbox stays empty. A complaint is left in place. */
  if (options.transactional) await clearBounce(options.to)

  // Build form data for Mailgun API
  const formData = new FormData()
  formData.append("from", fromAddress)
  formData.append("to", options.to)
  formData.append("subject", options.subject)
  const html = sendableHtml(options.html, options.subject)
  formData.append("html", html)

  // Always include a plain text version (critical for spam prevention)
  const textContent = options.text || htmlToPlainText(html)
  formData.append("text", textContent)

  // Add Reply-To header
  formData.append("h:Reply-To", replyTo)

  // Add custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      formData.append(`h:${key}`, value)
    }
  }

  if (options.transactional) {
    formData.append("o:tracking", "no")
    formData.append("o:tracking-clicks", "no")
    formData.append("o:tracking-opens", "no")
    formData.append("o:tag", "transactional")
  }

  // Add tags for tracking
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      formData.append("o:tag", tag)
    }
  }

  for (const file of options.attachments ?? []) {
    formData.append("attachment", new Blob([file.content as BlobPart], { type: file.contentType }), file.filename)
  }

  // Add metadata/variables
  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      formData.append(`v:${key}`, value)
    }
  }

  // Mailgun API endpoint
  const url = `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages`

  // Basic auth credentials
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  console.log("[mailgun] Sending email:", {
    to: maskEmail(options.to),
    replyTo: maskEmail(replyTo),
    domain: MAILGUN_DOMAIN,
  })

  // Retry with backoff for 429 rate limit responses
  const RATE_LIMIT_RETRIES = 3
  const RATE_LIMIT_DELAYS = [2000, 5000, 10000] // 2s, 5s, 10s

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
        },
        body: formData,
      })

      const responseText = await response.text()
      let responseData: any = {}

      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = { raw: responseText }
      }

      // Handle 429 rate limit with retry
      if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_DELAYS[attempt]
        console.warn(`[mailgun] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES})`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      if (!response.ok) {
        /* The status only: the provider's body can repeat the address. */
        console.error("[mailgun] API error:", {
          status: response.status,
          to: maskEmail(options.to),
        })

        return {
          success: false,
          error: responseData.message || `Mailgun API error: ${response.status} ${response.statusText}`,
        }
      }

      console.log("[mailgun] Email sent successfully:", {
        messageId: responseData.id,
        to: maskEmail(options.to),
        message: responseData.message,
      })

      return {
        success: true,
        messageId: responseData.id,
      }
    } catch (error: any) {
      console.error("[mailgun] Request failed:", {
        error: error?.name || "network error",
        to: maskEmail(options.to),
      })

      return {
        success: false,
        error: error.message || "Failed to send email via Mailgun",
      }
    }
  }

  return {
    success: false,
    error: "Mailgun rate limit exceeded after retries",
  }
}

/**
 * ONE ATTEMPT, AND THE WHOLE ANSWER.
 *
 * The campaign queue (lib/email-campaigns/queue.ts) decides for itself what
 * a 429, a 500 or a timeout means for the address it was about, and when to
 * try again. So this makes exactly one request, with a timeout, and returns
 * the status code with the result: no sleeping inside the request, no second
 * try it cannot see, and no suppression lookups (the queue reads the list's
 * own bounce and unsubscribe state, kept current by the Mailgun webhook).
 *
 * `messageId` fixes the Message-Id, so a message sent again after a crash
 * carries the same id as the first and the receiving mailbox can recognise
 * it as the same message.
 */
export interface MailgunOnceResult {
  success: boolean
  messageId?: string
  status?: number
  error?: string
  timedOut?: boolean
  /** The connection never opened: nothing reached Mailgun, so a retry cannot double up. */
  connectFailed?: boolean
  notConfigured?: boolean
}

/** Errors that happen before a request is written: the message cannot have been taken. */
const CONNECT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"])

function connectFailed(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause
  const code = typeof cause?.code === "string" ? cause.code : (error as { code?: unknown } | null)?.code
  return typeof code === "string" && CONNECT_CODES.has(code)
}

export async function sendMailgunOnce(
  options: MailgunSendOptions & { messageId?: string },
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<MailgunOnceResult> {
  if (!isMailgunConfigured()) return { success: false, notConfigured: true, error: "Mailgun is not configured" }
  if (!isValidEmail(options.to)) return { success: false, status: 400, error: "Invalid email address" }

  const form = new FormData()
  form.append("from", quotedFrom(withDisplayName(options.from || EMAIL_FROM)))
  form.append("to", options.to)
  form.append("subject", options.subject)
  const html = sendableHtml(options.html, options.subject)
  form.append("html", html)
  form.append("text", options.text || htmlToPlainText(html))
  form.append("h:Reply-To", options.replyTo || EMAIL_REPLY_TO)
  if (options.messageId) form.append("h:Message-Id", options.messageId)
  for (const [key, value] of Object.entries(options.headers ?? {})) form.append(`h:${key}`, value)
  for (const tag of options.tags ?? []) form.append("o:tag", tag)
  for (const [key, value] of Object.entries(options.metadata ?? {})) form.append(`v:${key}`, value)
  /* Files the message carries, the same way sendMailgunEmail does: a ticket receipt's calendar file. */
  for (const file of options.attachments ?? []) form.append("attachment", new Blob([file.content as BlobPart], { type: file.contentType }), file.filename)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}` },
      body: form,
      signal: controller.signal,
    })
    const raw = await response.text()
    let data: { id?: string; message?: string } = {}
    try {
      data = JSON.parse(raw)
    } catch {
      data = {}
    }
    if (!response.ok) {
      return { success: false, status: response.status, error: (data.message || response.statusText || "").slice(0, 200) }
    }
    return { success: true, status: response.status, messageId: data.id || options.messageId }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return { success: false, timedOut: aborted, connectFailed: !aborted && connectFailed(error), error: aborted ? "Timed out" : "Network error" }
  } finally {
    clearTimeout(timer)
  }
}

/** The domain campaign mail is sent from, for Message-Ids. */
export function mailgunDomain(): string {
  return MAILGUN_DOMAIN
}

/**
 * Build a "from" header with display name
 */
export function buildMailgunFromHeader(displayName?: string): string {
  const name = (displayName || PLATFORM_BRAND).replace(/[<>]/g, "")
  // Extract email from EMAIL_FROM if it contains angle brackets
  const emailMatch = EMAIL_FROM.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : EMAIL_FROM
  return `${name} <${email}>`
}

/**
 * Public suppression check export
 */
export { isEmailSuppressed }

/**
 * Verify Mailgun configuration (basic check)
 */
export async function verifyMailgunConfig(): Promise<boolean> {
  if (!isMailgunConfigured()) {
    console.error("[mailgun] Configuration check failed: missing credentials")
    return false
  }

  // Test API access by checking domain info
  const url = `${MAILGUN_BASE_URL}/v3/domains/${MAILGUN_DOMAIN}`
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authString}`,
      },
    })

    if (response.ok) {
      console.log("[mailgun] Configuration verified successfully")
      return true
    } else {
      console.error("[mailgun] Configuration check failed:", response.status, response.statusText)
      return false
    }
  } catch (error: any) {
    console.error("[mailgun] Configuration check error:", error.message || error)
    return false
  }
}
