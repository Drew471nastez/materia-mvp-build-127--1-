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

import { v4 as uuidv4 } from "uuid"

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
 * Send an email via Mailgun HTTP API
 * Optimized for maximum deliverability
 */
export async function sendMailgunEmail(options: MailgunSendOptions): Promise<MailgunSendResult> {
  if (!isMailgunConfigured()) {
    console.error("[mailgun] Not configured - missing MAILGUN_API_KEY or MAILGUN_DOMAIN")
    return {
      success: false,
      error: "Email service not configured (Mailgun credentials missing)",
    }
  }

  const fromAddress = options.from || EMAIL_FROM
  const replyTo = options.replyTo || EMAIL_REPLY_TO

  // Generate unique Message-ID for tracking and deliverability
  const messageId = `<${uuidv4()}@${MAILGUN_DOMAIN}>`

  // Build form data for Mailgun API
  const formData = new FormData()
  formData.append("from", fromAddress)
  formData.append("to", options.to)
  formData.append("subject", options.subject)
  formData.append("html", options.html)

  // Add plain text version if provided (IMPORTANT for deliverability - always include plain text)
  if (options.text) {
    formData.append("text", options.text)
  }

  // Add Reply-To header
  formData.append("h:Reply-To", replyTo)

  // CRITICAL DELIVERABILITY HEADERS
  // Message-ID helps with threading and deliverability
  formData.append("h:Message-ID", messageId)

  // MIME-Version header
  formData.append("h:MIME-Version", "1.0")

  // Precedence header - indicates transactional email (not bulk)
  formData.append("h:X-Priority", "1")
  formData.append("h:X-MSMail-Priority", "High")
  formData.append("h:Importance", "High")

  // List-Unsubscribe header (helps avoid spam filters even for transactional)
  formData.append("h:List-Unsubscribe", `<mailto:unsubscribe@${MAILGUN_DOMAIN}>`)
  formData.append("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click")

  // Add custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      formData.append(`h:${key}`, value)
    }
  }

  // TRACKING & DELIVERABILITY OPTIONS
  // Enable tracking (helps Mailgun optimize sending reputation)
  formData.append("o:tracking", "yes")
  formData.append("o:tracking-clicks", "htmlonly")
  formData.append("o:tracking-opens", "yes")

  // Require TLS for better security reputation
  formData.append("o:require-tls", "false")
  formData.append("o:skip-verification", "false")

  // DKIM signing - essential for deliverability
  formData.append("o:dkim", "yes")

  // Add tags for tracking
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      formData.append("o:tag", tag)
    }
  }
  // Always add a default tag for tracking
  formData.append("o:tag", "transactional")
  formData.append("o:tag", "download-ready")

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

  console.log("[mailgun] Sending email with enhanced deliverability:", {
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    replyTo,
    messageId,
    url,
    domain: MAILGUN_DOMAIN,
  })

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

/**
 * Check domain DNS records and deliverability status
 * This helps diagnose email deliverability issues
 */
export async function checkDomainHealth(): Promise<{
  healthy: boolean
  spf: boolean
  dkim: boolean
  mxRecords: boolean
  details: Record<string, any>
}> {
  if (!isMailgunConfigured()) {
    return {
      healthy: false,
      spf: false,
      dkim: false,
      mxRecords: false,
      details: { error: "Mailgun not configured" },
    }
  }

  const url = `${MAILGUN_BASE_URL}/v3/domains/${MAILGUN_DOMAIN}`
  const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authString}`,
      },
    })

    if (!response.ok) {
      return {
        healthy: false,
        spf: false,
        dkim: false,
        mxRecords: false,
        details: { error: `API error: ${response.status}` },
      }
    }

    const data = await response.json()
    const domain = data.domain || {}
    const dnsRecords = data.sending_dns_records || []
    const receivingRecords = data.receiving_dns_records || []

    // Check SPF record
    const spfRecord = dnsRecords.find((r: any) => r.record_type === "TXT" && r.name.includes("spf"))
    const spfValid = spfRecord?.valid === "valid" || spfRecord?.valid === true

    // Check DKIM record
    const dkimRecord = dnsRecords.find((r: any) => r.record_type === "TXT" && r.name.includes("domainkey"))
    const dkimValid = dkimRecord?.valid === "valid" || dkimRecord?.valid === true

    // Check MX records
    const mxValid = receivingRecords.some((r: any) => r.record_type === "MX" && (r.valid === "valid" || r.valid === true))

    const healthy = spfValid && dkimValid

    console.log("[mailgun] Domain health check:", {
      domain: MAILGUN_DOMAIN,
      state: domain.state,
      spf: spfValid,
      dkim: dkimValid,
      mx: mxValid,
      healthy,
    })

    return {
      healthy,
      spf: spfValid,
      dkim: dkimValid,
      mxRecords: mxValid,
      details: {
        domainState: domain.state,
        sendingDnsRecords: dnsRecords,
        receivingDnsRecords: receivingRecords,
      },
    }
  } catch (error: any) {
    console.error("[mailgun] Domain health check failed:", error.message || error)
    return {
      healthy: false,
      spf: false,
      dkim: false,
      mxRecords: false,
      details: { error: error.message || "Unknown error" },
    }
  }
}

/**
 * Send a test email with full deliverability logging
 */
export async function sendTestEmail(toEmail: string): Promise<{
  success: boolean
  messageId?: string
  deliverabilityChecks: Record<string, any>
  error?: string
}> {
  // First check domain health
  const health = await checkDomainHealth()

  if (!health.healthy) {
    console.warn("[mailgun] Domain health issues detected before sending:", health)
  }

  const result = await sendMailgunEmail({
    to: toEmail,
    subject: "Test Email - Storelib Deliverability Check",
    html: `
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
        <h1 style="color: #4f46e5;">Deliverability Test</h1>
        <p>This is a test email from Storelib to verify email deliverability.</p>
        <p>If you received this email in your inbox (not spam), the configuration is working correctly.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          Sent at: ${new Date().toISOString()}<br/>
          Domain: ${MAILGUN_DOMAIN}
        </p>
      </body>
      </html>
    `,
    text: `Deliverability Test\n\nThis is a test email from Storelib to verify email deliverability.\n\nIf you received this email in your inbox (not spam), the configuration is working correctly.\n\nSent at: ${new Date().toISOString()}`,
    tags: ["test", "deliverability-check"],
  })

  return {
    success: result.success,
    messageId: result.messageId,
    deliverabilityChecks: {
      domainHealthy: health.healthy,
      spfConfigured: health.spf,
      dkimConfigured: health.dkim,
      mxConfigured: health.mxRecords,
    },
    error: result.error,
  }
}
