/**
 * Email sending via Mailgun HTTP API
 *
 * Environment variables required:
 * - MAILGUN_API_KEY: Your Mailgun API key
 * - MAILGUN_DOMAIN: storelib.com
 * - MAILGUN_BASE_URL: https://api.eu.mailgun.net (EU region)
 * - EMAIL_FROM: "Storelib <noreply@storelib.com>"
 * - EMAIL_REPLY_TO: "support@storelib.com"
 */

import { maskEmail } from "@/lib/privacy/mask-email"
import {
  sendMailgunEmail,
  isMailgunConfigured,
  buildMailgunFromHeader,
  verifyMailgunConfig,
  EMAIL_FROM as MAILGUN_EMAIL_FROM,
  EMAIL_REPLY_TO as MAILGUN_EMAIL_REPLY_TO,
  PLATFORM_BRAND as MAILGUN_PLATFORM_BRAND,
} from "./mailgun"

// Re-export for backward compatibility
export const EMAIL_FROM = MAILGUN_EMAIL_FROM
export const EMAIL_REPLY_TO = MAILGUN_EMAIL_REPLY_TO
export const PLATFORM_BRAND = MAILGUN_PLATFORM_BRAND

/**
 * Check if email sending is configured (Mailgun)
 */
export const isSmtpConfigured = (): boolean => {
  return isMailgunConfigured()
}

// Email send options interface (kept for backward compatibility)
export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string // "Display Name <email@domain.com>"
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }> // Legacy format, converted for Mailgun
}

// Email send result
export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Reset transporter (no-op for Mailgun HTTP API, kept for backward compatibility)
 */
export function resetTransporter(): void {
  console.log("[mail] resetTransporter called (no-op for Mailgun HTTP API)")
}

/**
 * Send an email via Mailgun HTTP API
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!isMailgunConfigured()) {
    console.error("[mail] Mailgun not configured - missing MAILGUN_API_KEY or MAILGUN_DOMAIN")
    return {
      success: false,
      error: "Email service not configured (Mailgun credentials missing)",
    }
  }

  // Extract just the email address from EMAIL_FROM if it contains angle brackets
  const emailMatch = EMAIL_FROM.match(/<(.+)>/)
  const emailOnly = emailMatch ? emailMatch[1] : EMAIL_FROM
  const fromAddress = options.from || `${PLATFORM_BRAND} <${emailOnly}>`

  console.log("[mail] Sending email via Mailgun:", {
    from: fromAddress,
    to: maskEmail(options.to),
    subject: options.subject,
    replyTo: options.replyTo || EMAIL_REPLY_TO,
  })

  // Convert legacy tags format to Mailgun format
  const tags = options.tags?.map((t) => t.name) || []

  const result = await sendMailgunEmail({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    headers: options.headers,
    tags,
  })

  if (result.success) {
    console.log("[mail] Email sent successfully:", {
      messageId: result.messageId,
      to: maskEmail(options.to),
    })
  } else {
    console.error("[mail] Failed to send email:", {
      error: result.error,
      to: maskEmail(options.to),
      subject: options.subject,
    })
  }

  return result
}

/**
 * Build a "from" header with display name
 */
export function buildFromHeader(displayName?: string): string {
  return buildMailgunFromHeader(displayName)
}

/**
 * Verify email configuration (Mailgun API access)
 */
export async function verifySmtpConnection(): Promise<boolean> {
  return verifyMailgunConfig()
}
