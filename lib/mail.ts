/**
 * Email sending via Amazon SES SMTP (nodemailer)
 *
 * Environment variables required:
 * - SMTP_HOST: email-smtp.us-east-1.amazonaws.com
 * - SMTP_PORT: 587
 * - SMTP_USER: Your SES SMTP username (AKIAVYC4QXXFBT5IB74A)
 * - SMTP_PASS: Your SES SMTP password
 * - EMAIL_FROM: noreply@storelib.com
 * - EMAIL_REPLY_TO: support@storelib.com (default fallback)
 */

import * as nodemailer from "nodemailer"

// SMTP Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || "email-smtp.us-east-1.amazonaws.com"
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

// Email defaults
export const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@storelib.com"
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "support@storelib.com"
export const PLATFORM_BRAND = "Storelib"

// Check if SMTP is configured
export const isSmtpConfigured = (): boolean => {
  return !!(SMTP_USER && SMTP_PASS)
}

// Create nodemailer transporter
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) {
    console.error("[mail] SMTP not configured - missing SMTP_USER or SMTP_PASS")
    return null
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // Use TLS (STARTTLS)
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        // Required for Amazon SES
        ciphers: "SSLv3",
        rejectUnauthorized: true,
      },
    })
    console.log("[mail] SMTP transporter created for:", SMTP_HOST)
  }

  return transporter
}

// Email send options interface
export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string // "Display Name <email@domain.com>"
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }> // Not used with SMTP, but kept for compatibility
}

// Email send result
export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email via Amazon SES SMTP
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const transport = getTransporter()

  if (!transport) {
    return {
      success: false,
      error: "Email service not configured (SMTP credentials missing)",
    }
  }

  const fromAddress = options.from || `${PLATFORM_BRAND} <${EMAIL_FROM}>`

  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    }

    console.log("[mail] Sending email:", {
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      replyTo: options.replyTo || "none",
    })

    const info = await transport.sendMail(mailOptions)

    console.log("[mail] Email sent successfully:", {
      messageId: info.messageId,
      to: options.to,
    })

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error sending email"
    console.error("[mail] Failed to send email:", {
      error: errorMessage,
      to: options.to,
      subject: options.subject,
    })

    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Build a "from" header with display name
 */
export function buildFromHeader(displayName?: string): string {
  const name = (displayName || PLATFORM_BRAND).replace(/[<>]/g, "")
  return `${name} <${EMAIL_FROM}>`
}

/**
 * Verify SMTP connection (useful for health checks)
 */
export async function verifySmtpConnection(): Promise<boolean> {
  const transport = getTransporter()
  if (!transport) return false

  try {
    await transport.verify()
    console.log("[mail] SMTP connection verified")
    return true
  } catch (error: any) {
    console.error("[mail] SMTP verification failed:", error?.message || error)
    return false
  }
}
