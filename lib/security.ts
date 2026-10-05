import { nanoid } from "nanoid"
import crypto from "crypto"

export function generateReceiptToken(): string {
  return nanoid(32)
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function generateFingerprint(userAgent: string, ip: string): string {
  const data = `${userAgent}:${ip}:${process.env.NEXT_PUBLIC_SITE_URL || ""}`
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32)
}

export function isValidFingerprint(fingerprint: string): boolean {
  return /^[a-f0-9]{32}$/.test(fingerprint)
}

export const MAX_DEVICES_PER_ORDER = 3

export const VERIFICATION_CODE_EXPIRY_MINUTES = 15

/**
 * The "too many verification attempts, try again in 15 minutes" lock is off
 * until this instant, everywhere a code is sent, then it applies again.
 * 10 hours from 21:33 UTC on 5 October 2026.
 */
export const VERIFICATION_LIMIT_PAUSED_UNTIL = Date.parse("2026-10-06T07:33:00.000Z")

export function verificationLimitPaused(now = Date.now()): boolean {
  return now < VERIFICATION_LIMIT_PAUSED_UNTIL
}

export const SIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes
