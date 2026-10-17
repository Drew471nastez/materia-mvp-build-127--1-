import "server-only"

/**
 * ===========================================================================
 *  EVERY EMAIL STORELIB SENDS, IN ONE PLACE (round AG, /admin/emails)
 * ===========================================================================
 * The owner: "see ALL Storelib platform emails, organized into categories,
 * with a preview of each, and a separate section for business emails".
 *
 * Two sections, each drawn by the code that really sends it, with sample data:
 *
 *   PLATFORM   what Storelib sends its own people: account and sign in codes
 *              (lib/account/code-email, reset-email, the deletion code), and
 *              every notification type (lib/notify/templates renderEmail).
 *   BUSINESS   what a store sends its customers under its own name
 *              (lib/emails/customer-catalog previewCustomerEmail), and the
 *              website account sign in code (lib/site-accounts/code-email).
 *
 * Nothing here sends anything, and no real person's data is in a preview.
 */
import { codeEmail } from "@/lib/account/code-email"
import { googleSignInEmail, resetPasswordEmail } from "@/lib/account/reset-email"
import { platformEmail } from "@/lib/emails/layout"
import { CUSTOMER_EMAILS, GROUP_NAMES, GROUP_ORDER, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { codeEmail as siteCodeEmail } from "@/lib/site-accounts/code-email"
import { DATA_KEYS, renderEmail } from "@/lib/notify/templates"
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notify/types"

export type EmailSection = "platform" | "business"

export interface GalleryEntry {
  id: string
  section: EmailSection
  category: string
  name: string
  /** When it goes out, in a few words. */
  when: string
}

export interface GalleryEmail {
  subject: string
  preview: string
  html: string
  text: string
}

/* ── Platform: account and sign in ─────────────────────────────────────── */

const SAMPLE_CODE = "482913"
const ACCOUNT: { id: string; name: string; when: string; render: () => GalleryEmail }[] = [
  {
    id: "auth:verify",
    name: "Verification code",
    when: "Right after someone creates an account with email and password.",
    render: () => ({ subject: `${SAMPLE_CODE} is your Storelib code`, preview: `${SAMPLE_CODE} is your code.`, ...codeEmail({ heading: "Your verification code", lead: "Use this code to verify your email and finish creating your Storelib account. You can copy it and paste it on the verification page.", code: SAMPLE_CODE, minutes: 15, footer: "Storelib will never ask you to share this code. If you did not try to create an account, you can ignore this email." }) }),
  },
  {
    id: "auth:reset",
    name: "Password reset",
    when: "When someone asks to reset their password.",
    render: () => {
      const m = resetPasswordEmail({ resetUrl: "https://storelib.com/reset-password?token=sample", minutes: 60 })
      return { subject: m.subject, preview: "", html: m.html, text: m.text }
    },
  },
  {
    id: "auth:google",
    name: "Sign in with Google instead",
    when: "When a password reset is asked for an account that signs in with Google or Apple.",
    render: () => {
      const m = googleSignInEmail({ loginUrl: "https://storelib.com/login", provider: "Google" })
      return { subject: m.subject, preview: "", html: m.html, text: m.text }
    },
  },
  {
    id: "auth:new-email",
    name: "New email code",
    when: "When someone changes their email: sent to the new address.",
    render: () => ({ subject: `${SAMPLE_CODE} is your Storelib code`, preview: "", ...codeEmail({ heading: "Confirm your new email", lead: "Enter this code in Storelib to use ana@example.com for your account.", code: SAMPLE_CODE, minutes: 15, footer: "If you did not ask for this, ignore this email. Nothing changes." }) }),
  },
  {
    id: "auth:current-email",
    name: "Email change, to the current address",
    when: "When someone changes their email: sent to the address they had.",
    render: () => ({ subject: `${SAMPLE_CODE} confirms your Storelib email change`, preview: "", ...codeEmail({ heading: "Someone asked to change your email", lead: "A request was made to change your Storelib email from ana@example.com to ana@studio.com. If this was you, enter this code to confirm.", code: SAMPLE_CODE, minutes: 15, footer: "If this was not you, do not share this code. Change your password in Settings, Security." }) }),
  },
  {
    id: "auth:delete",
    name: "Account deletion code",
    when: "When someone asks to delete their account.",
    render: () => {
      const m = platformEmail({ subject: "Confirm account deletion", heading: "Confirm account deletion", label: "Security notice", labelColor: "#b91c1c", paragraphs: ["You asked to permanently delete your Storelib account. This can't be undone. Enter this code to confirm."], code: { value: SAMPLE_CODE, caption: "It expires in 15 minutes." }, note: "If you didn't ask for this, ignore this email and change your password." })
      return { subject: m.subject, preview: "", html: m.html, text: m.text }
    },
  },
]

/* ── Platform: notifications, by what they are about ───────────────────── */

const NOTIFY_CATEGORIES: { name: string; test: (t: string) => boolean }[] = [
  { name: "Account and security", test: (t) => /^(WELCOME_TO_STORELIB|VERIFY_EMAIL|PASSWORD_CHANGED|EMAIL_CHANGED|ACCOUNT_RESTRICTED)$/.test(t) },
  { name: "Getting started", test: (t) => /^(FIRST_PRODUCT|FINISH_PRODUCT|PUBLISH_PRODUCT|STORE_SETUP)/.test(t) },
  { name: "Payments and payouts", test: (t) => /^(PAYMENT_|PAYOUT_|VERIFICATION_REMINDER)/.test(t) },
  { name: "Sales, refunds and disputes", test: (t) => /^(FIRST_SALE|NEW_SALE|REFUND_CREATED|DISPUTE_)/.test(t) },
  { name: "Buyers: receipts and reviews", test: (t) => /^(PURCHASE_CONFIRMATION|DIGITAL_PRODUCT_ACCESS|CUSTOMER_REFUND_PROCESSED|REVIEW_)/.test(t) },
  { name: "Memberships", test: (t) => /^MEMBERSHIP_/.test(t) },
  { name: "Communities", test: (t) => /^COMMUNITY_/.test(t) },
  { name: "Physical products", test: (t) => /^(PHYSICAL_|ORDERS_WAITING|LOW_STOCK|SHIPMENT|RETURN_)/.test(t) },
  { name: "Storelib plan", test: (t) => /^SUBSCRIPTION_/.test(t) },
  { name: "Domains", test: (t) => /^DOMAIN_/.test(t) },
  { name: "Team", test: (t) => /^TEAM_/.test(t) },
]

function notifyCategory(type: string): string {
  return NOTIFY_CATEGORIES.find((c) => c.test(type))?.name ?? "Other"
}

/** "MEMBERSHIP_PLAN_CHANGED" → "Membership plan changed". */
function typeName(type: string): string {
  const s = type.toLowerCase().replace(/_/g, " ").replace(/\b2\b/, "(second reminder)")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const SAMPLE: Record<string, unknown> = {
  storeName: "Ana's Studio",
  creatorName: "Ana Lopez",
  communityName: "Makers Club",
  productTitle: "Lightroom Presets Vol 2",
  planName: "Inner circle",
  email: "ana@example.com",
  amountCents: 4900,
  currency: "usd",
  orderNumber: "1042",
  customerName: "Sam Rivera",
  cardLast4: "4242",
  bankLast4: "6789",
  domain: "shop.example.com",
  reason: "account_closed",
  device: "Chrome on macOS",
  location: "Lisbon, Portugal",
  newEmailMasked: "a***@example.com",
}

/** Sample data for one type: the common sample, and a plausible value for any key it reads that the sample lacks. */
function sampleFor(type: NotificationType): Record<string, unknown> {
  const data: Record<string, unknown> = { ...SAMPLE }
  const day = new Date(Date.now() + 7 * 86_400_000).toISOString()
  for (const k of DATA_KEYS[type] ?? []) {
    if (data[k] !== undefined) continue
    /* A community's own words (round AG) are left out: the gallery shows Storelib's. */
    if (k.startsWith("tpl")) continue
    if (k === "subject") {
      data[k] = "New lessons are up"
      continue
    }
    if (k === "message") {
      data[k] = "Three new lessons on mixing went up this week.\n\nStart with the first one, it is short. See you in the comments."
      continue
    }
    if (/cents$/i.test(k)) data[k] = 4900
    else if (/(At|Date|By|Until)$/.test(k)) data[k] = day
    else if (/(count|Count|days|Days|members|Members)$/.test(k)) data[k] = 3
    else if (/(Url|url)$/.test(k)) data[k] = "https://storelib.com"
    else if (/Id$/.test(k)) data[k] = "sample"
    else if (/^(is|has|paymentsReady)/.test(k)) data[k] = true
    else if (/plan/i.test(k)) data[k] = "Inner circle"
    else if (/community/i.test(k)) data[k] = "Makers Club"
    else if (/event/i.test(k)) data[k] = "Live Q&A"
    else if (/(course|lesson)/i.test(k)) data[k] = "Mixing basics"
    else if (/(product|title)/i.test(k)) data[k] = "Lightroom Presets Vol 2"
    else if (/name/i.test(k)) data[k] = "Sam Rivera"
    else data[k] = "Sample"
  }
  return data
}

/* ── Business: what a store sends its customers ────────────────────────── */

const SAMPLE_SHOP = { name: "Ana's Studio", supportEmail: "hello@anastudio.com", storeUrl: "https://anastudio.com", currency: "USD", logoUrl: null, phone: null, accent: null }

/* ── The catalog ───────────────────────────────────────────────────────── */

export function emailGallery(): GalleryEntry[] {
  const out: GalleryEntry[] = ACCOUNT.map((a) => ({ id: a.id, section: "platform", category: "Sign in and codes", name: a.name, when: a.when }))
  for (const t of NOTIFICATION_TYPES) out.push({ id: `notify:${t}`, section: "platform", category: notifyCategory(t), name: typeName(t), when: `Sent by the notification engine as ${t}.` })
  for (const g of GROUP_ORDER) {
    for (const e of CUSTOMER_EMAILS.filter((x) => x.group === g)) out.push({ id: `business:${e.id}`, section: "business", category: GROUP_NAMES[g], name: e.name, when: e.sentWhen })
  }
  out.push({ id: "business:site-code", section: "business", category: "Website accounts", name: "Sign in code", when: "When a customer signs in or creates an account on a store's website." })
  return out
}

export const PLATFORM_CATEGORY_ORDER = ["Sign in and codes", ...NOTIFY_CATEGORIES.map((c) => c.name), "Other"]

/** One email, drawn by the code that sends it, with sample data. Null for an id it does not know. */
export function renderGalleryEmail(id: string): GalleryEmail | null {
  const account = ACCOUNT.find((a) => a.id === id)
  if (account) return account.render()
  if (id.startsWith("notify:")) {
    const type = id.slice("notify:".length) as NotificationType
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) return null
    const e = renderEmail(type, sampleFor(type), { baseUrl: "https://storelib.com", recipientName: "Ana Lopez", when: "17 October 2026 at 10:00" })
    return { subject: e.subject, preview: e.preview, html: e.html, text: e.text }
  }
  if (id === "business:site-code") {
    const e = siteCodeEmail({ store: "Ana's Studio", code: SAMPLE_CODE, host: "anastudio.com", minutes: 15 }) as unknown as { subject: string; html: string; text: string; preview?: string }
    return { subject: e.subject, preview: e.preview ?? "", html: e.html, text: e.text }
  }
  if (id.startsWith("business:")) {
    const e = previewCustomerEmail(id.slice("business:".length), SAMPLE_SHOP)
    return e ? { subject: e.subject, preview: "", html: e.html, text: e.text } : null
  }
  return null
}
