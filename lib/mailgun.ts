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

// Mailgun configuration from environment variables
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ""
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "storelib.com"
const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || "https://api.eu.mailgun.net"

// Email defaults
export const EMAIL_FROM = process.env.EMAIL_FROM || "Storelib <noreply@storelib.com>"
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
      console.warn("[mailgun] Email is on bounce suppression list:", email)
      return true
    }

    // Check complaints
    const complaintRes = await fetch(
      `${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/complaints/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Basic ${authString}` } }
    )
    if (complaintRes.ok) {
      console.warn("[mailgun] Email is on complaint suppression list:", email)
      return true
    }

    return false
  } catch (err) {
    // Don't block sending on suppression check failure
    console.warn("[mailgun] Suppression check failed (allowing send):", err)
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
    console.warn("[mailgun] Invalid email format, skipping:", options.to)
    return {
      success: false,
      error: `Invalid email format: ${options.to}`,
    }
  }

  // Check suppression list before sending
  const suppressed = await isEmailSuppressed(options.to)
  if (suppressed) {
    return {
      success: false,
      error: `Email suppressed: ${options.to} is on the bounce or complaint list`,
    }
  }

  const fromAddress = options.from || EMAIL_FROM
  const replyTo = options.replyTo || EMAIL_REPLY_TO

  // Build form data for Mailgun API
  const formData = new FormData()
  formData.append("from", fromAddress)
  formData.append("to", options.to)
  formData.append("subject", options.subject)
  formData.append("html", options.html)

  // Always include a plain text version (critical for spam prevention)
  const textContent = options.text || htmlToPlainText(options.html)
  formData.append("text", textContent)

  // Add Reply-To header
  formData.append("h:Reply-To", replyTo)

  // Add custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      formData.append(`h:${key}`, value)
    }
  }

  // Add tags for tracking
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      formData.append("o:tag", tag)
    }
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
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    replyTo,
    url,
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
        console.error("[mailgun] API error:", {
          status: response.status,
          statusText: response.statusText,
          body: responseData,
          to: options.to,
          subject: options.subject,
        })

        return {
          success: false,
          error: responseData.message || `Mailgun API error: ${response.status} ${response.statusText}`,
        }
      }

      console.log("[mailgun] Email sent successfully:", {
        messageId: responseData.id,
        to: options.to,
        message: responseData.message,
      })

      return {
        success: true,
        messageId: responseData.id,
      }
    } catch (error: any) {
      console.error("[mailgun] Request failed:", {
        error: error.message || error,
        to: options.to,
        subject: options.subject,
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
