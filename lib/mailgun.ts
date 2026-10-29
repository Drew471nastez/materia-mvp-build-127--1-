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
import { deadlineFetch } from "@/lib/net/deadline"
import { breakerFor, unwellStatus } from "@/lib/net/breaker"
/* Imported, not loaded with import(): an import() gave each of the ~670 routes that can send mail its own async chunk for it, and `next build` outgrew Vercel's 8 GB. */
import { settleLogoShapes } from "@/lib/emails/logo-shape-server"

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

/**
 * A store's logo whose shape the template could not know, settled before it
 * goes (lib/emails/logo-shape-server.ts): a square one gets the name beside
 * it. An email without one is not touched; a failure sends it as drawn.
 */
async function withLogoShapes(html: string): Promise<string> {
  if (!html || !html.includes('data-logo-shape="auto"')) return html
  try {
    return await settleLogoShapes(html)
  } catch {
    return html
  }
}

// Mailgun configuration from environment variables
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ""
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "storelib.com"
const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net"

/*
  EVERY CALL TO MAILGUN ENDS. sendMailgunEmail, the path under every
  sendEmail in the app (a website's sign in code, a contact form, a seller's
  test email), called fetch with no deadline at all and then slept 2, 5 and
  10 seconds on a 429: a Mailgun that accepted the connection and never
  answered held the request until Vercel's 300 second ceiling. Now one
  attempt is MAILGUN_TIMING.attemptMs, the whole send with its 429 retries is
  MAILGUN_TIMING.sendBudgetMs, a suppression lookup is MAILGUN_TIMING.lookupMs, and a
  Mailgun that has failed MAILGUN_BREAKER's worth in a row is not asked at
  all for a short while (lib/net/breaker.ts): the send answers "not sent" at
  once, and the notification outbox tries again later.
*/
export const MAILGUN_TIMING = {
  /** One request to Mailgun. */
  attemptMs: 15_000,
  /** A whole send, its 429 retries included. */
  sendBudgetMs: 25_000,
  /** A bounce or complaint lookup. */
  lookupMs: 5_000,
  /** The waits after a 429, before each up to a quarter either way. The suite makes them short. */
  rateLimitDelays: [2000, 5000, 10000],
}
export const MAILGUN_BREAKER = "mailgun"
const mailgunBreaker = () => breakerFor(MAILGUN_BREAKER)
/** Said when the breaker is open: nothing was sent, and nothing reached Mailgun. */
export const MAILGUN_UNAVAILABLE = "The email provider is not answering just now. Nothing was sent; try again shortly."

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
  /**
   * Transactional, but anybody may have typed this address (a signed-out
   * "Forgot password", an order lookup): the bounce list is left as it is.
   * Clearing it is for an address whose owner is the one asking (a sign in
   * code they are waiting for); doing it for any typed address would let a
   * stranger wipe a hard bounce over and over. The send is still made
   * without tracking; Mailgun drops it if the address is still suppressed.
   */
  keepBounce?: boolean
  /**
   * The seller's own domain, verified with Mailgun (lib/emails/sending-domain-
   * server.ts): the message is sent through that domain, so Mailgun signs it
   * with the seller's DKIM and a From on it passes DMARC. Only ever a domain
   * Storelib added to its own Mailgun account and saw verified; anything
   * else is ignored here and the message goes as Storelib's.
   */
  sendingDomain?: string
}

/** A sending domain as Mailgun names it in a path: a hostname and nothing else. */
export function sendingDomainOf(domain: string | undefined | null): string {
  const d = String(domain ?? "").trim().toLowerCase()
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : MAILGUN_DOMAIN
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
    /* The hidden preview line (lib/emails/layout.ts preheader) is for the inbox list, not the text part. */
    .replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/gi, "")
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
    .replace(/&middot;/g, "·")
    .replace(/&#\d+;/g, "")
    .replace(/[ \t]+\n/g, "\n")
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
function fromForSend(requested: string | undefined, _transactional?: boolean, through?: string): string {
  const sendingDomain = (through || MAILGUN_DOMAIN).toLowerCase()
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
    if (mailgunBreaker().state === "open") return
    await deadlineFetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/bounces/${encodeURIComponent(email)}`,
      { method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}` } },
      { ms: MAILGUN_TIMING.lookupMs, retry: false },
    )
  } catch {
    /* A missing bounce is a 404. Either way the send goes ahead. */
  }
}

/**
 * Check Mailgun suppression list before sending
 */
async function isEmailSuppressed(email: string): Promise<boolean> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return false
  /* Not answering: the lookup is skipped, as a failed lookup always was. */
  if (mailgunBreaker().state === "open") return false

  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  try {
    // Check bounces
    const bounceRes = await deadlineFetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/bounces/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Basic ${authString}` } },
      { ms: MAILGUN_TIMING.lookupMs, retry: false },
    )
    if (bounceRes.ok) {
      console.warn("[mailgun] Email is on bounce suppression list:", maskEmail(email))
      return true
    }

    // Check complaints
    const complaintRes = await deadlineFetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/complaints/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Basic ${authString}` } },
      { ms: MAILGUN_TIMING.lookupMs, retry: false },
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

  /* Mailgun not answering: said at once, without a lookup or a send that would wait out the same deadline. */
  if (mailgunBreaker().state === "open") {
    console.warn("[mailgun] Not sent, the provider is not answering:", { to: maskEmail(options.to) })
    return { success: false, error: MAILGUN_UNAVAILABLE }
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

  const domain = sendingDomainOf(options.sendingDomain)
  const fromAddress = fromForSend(options.from, options.transactional, domain)
  const replyTo = options.replyTo || EMAIL_REPLY_TO
  /* A code they just asked for must not die on a stale bounce. Mailgun
     drops those after it has already answered "queued", so the page looks
     sent and the inbox stays empty. A complaint is left in place. */
  if (options.transactional && !options.keepBounce) await clearBounce(options.to)

  // Build form data for Mailgun API
  const formData = new FormData()
  formData.append("from", fromAddress)
  formData.append("to", options.to)
  formData.append("subject", options.subject)
  const html = sendableHtml(await withLogoShapes(options.html), options.subject)
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

  // Mailgun API endpoint: the seller's verified domain when the message has one
  const url = `${MAILGUN_BASE_URL}/v3/${domain}/messages`

  // Basic auth credentials
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  console.log("[mailgun] Sending email:", {
    to: maskEmail(options.to),
    replyTo: maskEmail(replyTo),
    domain,
  })

  // Retry with backoff for 429 rate limit responses: capped, jittered, and
  // never past MAILGUN_TIMING.sendBudgetMs for the whole send.
  const RATE_LIMIT_RETRIES = 3
  const RATE_LIMIT_DELAYS = MAILGUN_TIMING.rateLimitDelays // 2s, 5s, 10s, each with up to a quarter either way
  const began = Date.now()
  const breaker = mailgunBreaker()
  /* The trial after a cool down is one send; any other send meanwhile is told at once. */
  if (!breaker.allow()) return { success: false, error: MAILGUN_UNAVAILABLE }
  let reported = false
  const report = (unwell: boolean) => {
    if (reported) return
    reported = true
    if (unwell) breaker.failure()
    else breaker.success()
  }

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const left = MAILGUN_TIMING.sendBudgetMs - (Date.now() - began)
      const response = await deadlineFetch(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authString}`,
          },
          body: formData,
        },
        { ms: Math.min(MAILGUN_TIMING.attemptMs, Math.max(250, left)), retry: false },
      )

      const responseText = await response.text()
      let responseData: any = {}

      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = { raw: responseText }
      }

      // Handle 429 rate limit with retry
      const delay = Math.round(RATE_LIMIT_DELAYS[Math.min(attempt, RATE_LIMIT_DELAYS.length - 1)] * (0.75 + Math.random() * 0.5))
      if (response.status === 429 && attempt < RATE_LIMIT_RETRIES && Date.now() - began + delay + Math.min(MAILGUN_TIMING.attemptMs, 1_000) < MAILGUN_TIMING.sendBudgetMs) {
        console.warn(`[mailgun] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES})`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      if (!response.ok) {
        report(unwellStatus(response.status))
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

      report(false)
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
      report(true)
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

  report(true)
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
  { timeoutMs = MAILGUN_TIMING.attemptMs }: { timeoutMs?: number } = {},
): Promise<MailgunOnceResult> {
  if (!isMailgunConfigured()) return { success: false, notConfigured: true, error: "Mailgun is not configured" }
  if (!isValidEmail(options.to)) return { success: false, status: 400, error: "Invalid email address" }

  const form = new FormData()
  form.append("from", quotedFrom(withDisplayName(options.from || EMAIL_FROM)))
  form.append("to", options.to)
  form.append("subject", options.subject)
  const html = sendableHtml(await withLogoShapes(options.html), options.subject)
  form.append("html", html)
  form.append("text", options.text || htmlToPlainText(html))
  form.append("h:Reply-To", options.replyTo || EMAIL_REPLY_TO)
  if (options.messageId) form.append("h:Message-Id", options.messageId)
  for (const [key, value] of Object.entries(options.headers ?? {})) form.append(`h:${key}`, value)
  for (const tag of options.tags ?? []) form.append("o:tag", tag)
  for (const [key, value] of Object.entries(options.metadata ?? {})) form.append(`v:${key}`, value)
  /* Files the message carries, the same way sendMailgunEmail does: a ticket receipt's calendar file. */
  for (const file of options.attachments ?? []) form.append("attachment", new Blob([file.content as BlobPart], { type: file.contentType }), file.filename)

  /* Not answering: nothing is sent and nothing reached Mailgun, so the caller's queue may try again without doubling up. */
  const breaker = mailgunBreaker()
  if (!breaker.allow()) return { success: false, connectFailed: true, error: MAILGUN_UNAVAILABLE }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${MAILGUN_BASE_URL}/v3/${sendingDomainOf(options.sendingDomain)}/messages`, {
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
      if (unwellStatus(response.status)) breaker.failure()
      else breaker.success()
      return { success: false, status: response.status, error: (data.message || response.statusText || "").slice(0, 200) }
    }
    breaker.success()
    return { success: true, status: response.status, messageId: data.id || options.messageId }
  } catch (error) {
    breaker.failure()
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
  /* A store's name is typed by its owner: one line, no brackets or quotes to break out of the header with, and
     quoted when it holds a comma or other special, so "Ana, Studio" is one sender rather than two addresses. */
  const name = (displayName || PLATFORM_BRAND).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 78) || PLATFORM_BRAND
  // Extract email from EMAIL_FROM if it contains angle brackets
  const emailMatch = EMAIL_FROM.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : EMAIL_FROM
  return `${/[(),.:;@[\]]/.test(name) ? `"${name}"` : name} <${email}>`
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
    const response = await deadlineFetch(url, { method: "GET", headers: { Authorization: `Basic ${authString}` } }, { ms: MAILGUN_TIMING.lookupMs, retry: false })

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
