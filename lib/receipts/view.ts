/**
 * What the receipt page and the receipt email are given. Built on the server
 * by lib/receipts/load.ts and safe to send to a browser: it carries the
 * buyer's own receipt tokens (they already hold one, and every line of the
 * same payment is theirs) and nothing else that works as a credential. No
 * storage paths, no fingerprints, no access tokens, no fees, no full email.
 */
import type { AccessState } from "./rules"

export interface ReceiptFile {
  id: string
  name: string
  sizeBytes: number | null
}

export interface ReceiptItem {
  orderId: string
  /** This line's own receipt token. Downloads for the line use it. */
  token: string
  productId: string
  title: string
  slug: string | null
  thumbnailUrl: string | null
  type: string | null
  variantName: string | null
  state: AccessState
  subtotalCents: number
  tipCents: number
  totalCents: number
  refundedCents: number
  refundedAt: string | null
  /** Empty unless the line is open. */
  files: ReceiptFile[]
  /** Where a course is taken, when the product is one. Needs an account. */
  courseHref: string | null
}

export interface ReceiptView {
  /** Short order number, from the first line's id. */
  number: string
  createdAt: string
  currency: string
  state: AccessState
  items: ReceiptItem[]
  subtotalCents: number
  tipCents: number
  totalCents: number
  refundedCents: number
  payment: { method: string | null; brand: string | null; last4: string | null }
  seller: { name: string; username: string | null; avatarUrl: string | null }
  buyer: {
    firstName: string | null
    maskedEmail: string | null
    /** "sent" once any line's receipt email was accepted, "failed" when it bounced. */
    email: "sent" | "failed" | "unknown"
    /** At least one line is a guest order, not tied to an account yet. */
    unclaimed: boolean
  }
  /** The line whose token opened the page. Resend and email changes act through it. */
  primary: { orderId: string; token: string }
}

/** What the page adds from the session, never cached with the rest. */
export interface ReceiptViewer {
  signedIn: boolean
  /** The signed-in person is the buyer of at least one line. */
  isBuyer: boolean
}
