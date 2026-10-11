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
  /** A membership's line is one period of it: "$9.00/month". Null for anything bought once. */
  priceInterval?: "month" | "year" | null
  /**
   * The line's price before a discount code, when the payment recorded one
   * and it adds up (lib/receipts/discount.ts). Absent otherwise, and the
   * line shows what it was charged.
   */
  listCents?: number | null
  /** The product's refund policy, as the product page states it. Null when it has none. */
  refundPolicy?: { label: string; finePrint: string | null } | null
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
  /** Settings › Taxes: the tax in the total. Added on top unless `taxIncluded`; then it is part of the prices. */
  taxCents?: number
  taxIncluded?: boolean
  /** "VAT 19%", as the checkout named it; "Tax" for an order from before (lib/tax/rules taxLabel). */
  taxLabel?: string | null
  payment: { method: string | null; brand: string | null; last4: string | null }
  /** A code's saving and the code, when the payment recorded one. Zero and null otherwise. */
  discountCents?: number
  discountCode?: string | null
  /** supportEmail is the address the seller chose to be written to, never their login. */
  seller: {
    name: string
    username: string | null
    avatarUrl: string | null
    supportEmail?: string | null
    /** The business that sells (Settings › Store details, SQL part 153): legal name, address lines, tax number. */
    legal?: { name: string; lines: string[]; taxId: string | null; taxIdLabel: string } | null
  }
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
  /** A paid card order, so an invoice PDF can be downloaded. */
  invoice?: boolean
}

/** What the page adds from the session, never cached with the rest. */
export interface ReceiptViewer {
  signedIn: boolean
  /** The signed-in person is the buyer of at least one line. */
  isBuyer: boolean
  /** The signed-in person's own name and photo, for the review card. */
  name?: string | null
  avatarUrl?: string | null
  /**
   * The signed-in buyer's own account email, where Resend sends an order on
   * their account (app/api/receipt/resend, to: "account"). Only set when
   * they are the buyer; it is their own address, shown to them.
   */
  email?: string | null
}
