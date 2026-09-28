/**
 * ===========================================================================
 *  WHAT A CREATOR MAY SAVE AS A MEMBERSHIP, AND AS AN UPDATE TO MEMBERS
 * ===========================================================================
 * Checked on the server before anything is written (app/api/app/memberships),
 * and by the creator's screen before it sends, from the same rules, so the
 * screen never says one thing and the server another. Pure and browser safe.
 *
 * The limits match the database's checks (supabase/sql/run-now/75):
 *   monthly price   $1 to $10,000
 *   yearly price    $1 to $100,000
 *   trial           0 to 90 days
 *   an update       a title up to 200 characters, text up to 20,000
 */

export const LIMITS = {
  monthlyMin: 100,
  monthlyMax: 1_000_000,
  yearlyMin: 100,
  yearlyMax: 10_000_000,
  trialMax: 90,
  benefits: 12,
  benefitChars: 120,
  included: 20,
  titleChars: 200,
  bodyChars: 20_000,
  images: 10,
  attachments: 10,
  links: 6,
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; field: string }

export interface PlanValue {
  monthlyPriceCents: number | null
  yearlyPriceCents: number | null
  trialDays: number
  benefits: string[]
  includedProductIds: string[]
}

/** Dollars as typed ("9", "9.50", "$1,200") to whole cents, or null for empty. NaN when it is not a price. */
export function centsFromInput(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : NaN
  const text = String(value).replace(/[$,\s]/g, "")
  if (!text) return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN
  return Math.round(Number.parseFloat(text) * 100)
}

function clean(text: unknown, max: number): string {
  return typeof text === "string" ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/**
 * A plan from the creator's form. `publishing` asks for a price: a draft may
 * be saved without one, a membership on sale may not.
 */
export function checkPlan(raw: unknown, opts: { publishing: boolean }): Checked<PlanValue> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const monthly = typeof r.monthlyPriceCents === "number" || r.monthlyPriceCents === null ? (r.monthlyPriceCents as number | null) : centsFromInput(r.monthlyPrice)
  const yearly = typeof r.yearlyPriceCents === "number" || r.yearlyPriceCents === null ? (r.yearlyPriceCents as number | null) : centsFromInput(r.yearlyPrice)
  if (monthly !== null && (!Number.isInteger(monthly) || monthly < LIMITS.monthlyMin || monthly > LIMITS.monthlyMax)) {
    return { ok: false, field: "monthly", error: "A monthly price is between $1 and $10,000." }
  }
  if (yearly !== null && (!Number.isInteger(yearly) || yearly < LIMITS.yearlyMin || yearly > LIMITS.yearlyMax)) {
    return { ok: false, field: "yearly", error: "A yearly price is between $1 and $100,000." }
  }
  if (opts.publishing && monthly === null && yearly === null) {
    return { ok: false, field: "monthly", error: "Add a monthly or a yearly price before you publish." }
  }
  const trialRaw = r.trialDays === "" || r.trialDays === undefined || r.trialDays === null ? 0 : Number(r.trialDays)
  if (!Number.isInteger(trialRaw) || trialRaw < 0 || trialRaw > LIMITS.trialMax) {
    return { ok: false, field: "trial", error: "A free trial is 0 to 90 days." }
  }
  const benefits = (Array.isArray(r.benefits) ? r.benefits : [])
    .map((b) => clean(b, LIMITS.benefitChars))
    .filter(Boolean)
  if (benefits.length > LIMITS.benefits) return { ok: false, field: "benefits", error: `Up to ${LIMITS.benefits} things members get.` }
  const included = [...new Set((Array.isArray(r.includedProductIds) ? r.includedProductIds : []).filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  if (included.length > LIMITS.included) return { ok: false, field: "included", error: `Up to ${LIMITS.included} included products.` }
  return { ok: true, value: { monthlyPriceCents: monthly, yearlyPriceCents: yearly, trialDays: trialRaw, benefits, includedProductIds: included } }
}

/* ── An update to members ───────────────────────────────────────────────── */

export interface PostImage {
  url: string
  width?: number | null
  height?: number | null
}

export interface PostAttachment {
  assetId: string
  name: string
  size: number
}

export interface PostValue {
  title: string
  body: string
  images: PostImage[]
  attachments: PostAttachment[]
  linkedProductIds: string[]
  sendEmail: boolean
}

/** A picture's address, only when it is an https address on the project's own storage or Storelib. */
export function ownImageUrl(value: unknown, storageHost: string | null): string | null {
  if (typeof value !== "string" || value.length > 1000) return null
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return null
    const host = u.hostname.toLowerCase()
    const own = host === "storelib.com" || host.endsWith(".storelib.com") || (storageHost ? host === storageHost.toLowerCase() : host.endsWith(".supabase.co"))
    return own ? u.toString() : null
  } catch {
    return null
  }
}

/** The text of an update, kept as the creator typed it: line breaks stay, control characters go. */
export function cleanBody(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

export function checkPost(raw: unknown, storageHost: string | null): Checked<PostValue> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const title = clean(r.title, LIMITS.titleChars + 1)
  if (title.length > LIMITS.titleChars) return { ok: false, field: "title", error: "Keep the title under 200 characters." }
  const body = cleanBody(r.body)
  if (body.length > LIMITS.bodyChars) return { ok: false, field: "body", error: "Keep the update under 20,000 characters." }
  const images: PostImage[] = []
  for (const item of Array.isArray(r.images) ? r.images : []) {
    const url = ownImageUrl((item as PostImage)?.url, storageHost)
    if (!url) continue
    const width = Number((item as PostImage).width)
    const height = Number((item as PostImage).height)
    images.push({ url, width: Number.isFinite(width) && width > 0 ? Math.round(width) : null, height: Number.isFinite(height) && height > 0 ? Math.round(height) : null })
  }
  if (images.length > LIMITS.images) return { ok: false, field: "images", error: `Up to ${LIMITS.images} pictures in one update.` }
  const attachments: PostAttachment[] = []
  for (const item of Array.isArray(r.attachments) ? r.attachments : []) {
    const a = item as PostAttachment
    if (!a || typeof a.assetId !== "string" || !UUID.test(a.assetId)) continue
    attachments.push({ assetId: a.assetId, name: clean(a.name, 200) || "File", size: Number.isFinite(Number(a.size)) ? Math.max(0, Math.round(Number(a.size))) : 0 })
  }
  if (attachments.length > LIMITS.attachments) return { ok: false, field: "attachments", error: `Up to ${LIMITS.attachments} files in one update.` }
  const linkedProductIds = [...new Set((Array.isArray(r.linkedProductIds) ? r.linkedProductIds : []).filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  if (linkedProductIds.length > LIMITS.links) return { ok: false, field: "links", error: `Up to ${LIMITS.links} linked products.` }
  if (!title && !body && images.length === 0 && attachments.length === 0) {
    return { ok: false, field: "body", error: "Write something or add a picture or a file." }
  }
  return { ok: true, value: { title, body, images, attachments, linkedProductIds, sendEmail: r.sendEmail !== false } }
}

/** The first words of an update, for an email's preview line and the library's list. */
export function excerpt(post: { title?: string | null; body?: string | null }, max = 140): string {
  const text = (post.body || "").replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}
