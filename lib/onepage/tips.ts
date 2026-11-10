// OnePage: the tips block's rules (round AR)
// Location: lib/onepage/tips.ts
//
// A tips block (an app block with provider "tips", lib/onepage/app-blocks)
// takes tips one of two ways:
//
//   storelib   the visitor picks an amount (three presets and, when the
//              creator allows it, their own) and pays through Storelib
//              checkout. The money goes to the creator's connected payout
//              account (lib/onepage/tips-server.ts), as every Storelib sale.
//   link       a tip page somewhere else (Ko-fi, PayPal, Buy Me a Coffee),
//              which is what the block always was.
//
// Pure: the server reads the same answers when it checks an amount, so the
// page's buttons and the charge never disagree.

/** The smallest amount, in minor units, the block's own amounts may be (Stripe's own minimum is checked on the server). */
export const TIP_MIN_CENTS = 100
/** The largest tip, as the product checkout caps a tip (lib/checkout/pricing). */
export const TIP_MAX_CENTS = 100_000
/** What a new block offers. */
export const TIP_DEFAULT_AMOUNTS = [300, 500, 1000] as const
export const TIP_PRESETS_MAX = 4

export type TipMode = "storelib" | "link"

export interface TipFields {
  url?: string | null
  tip_mode?: TipMode | null
  /** The presets, in minor units (cents). */
  tip_amounts?: unknown
  /** The visitor may type their own amount. */
  tip_custom?: boolean | null
  /** The visitor may leave a short message. */
  tip_message?: boolean | null
}

/** How the block takes tips: the creator's choice; a block saved before the choice existed keeps its link. */
export function tipModeOf(data: TipFields | null | undefined): TipMode {
  if (data?.tip_mode === "storelib" || data?.tip_mode === "link") return data.tip_mode
  return (data?.url || "").trim() ? "link" : "storelib"
}

/** One amount as minor units, or null: a whole number between the block's floor and the cap. */
export function tipCents(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n >= TIP_MIN_CENTS && n <= TIP_MAX_CENTS ? n : null
}

/** The block's presets: valid, each once, smallest first, at most four. The defaults when none are valid. */
export function tipAmounts(data: TipFields | null | undefined): number[] {
  const raw = Array.isArray(data?.tip_amounts) ? (data!.tip_amounts as unknown[]) : []
  const ok = [...new Set(raw.map(tipCents).filter((n): n is number => n !== null))].sort((a, b) => a - b).slice(0, TIP_PRESETS_MAX)
  return ok.length ? ok : [...TIP_DEFAULT_AMOUNTS]
}

/** A visitor's typed amount ("5", "5.50", "5,50") as minor units, or null. Two decimals at most. */
export function typedTipCents(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const text = String(raw).trim().replace(",", ".")
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export type TipCheck = { ok: true; cents: number } | { ok: false; error: "amount" | "too_small" | "too_large" | "not_offered" }

/**
 * IS THIS AMOUNT ONE THE BLOCK TAKES? One of its presets, or, when it lets
 * visitors choose, any whole amount from Stripe's smallest charge in the
 * currency (`minimumCents`) up to the cap. Anything the page sends is held
 * to this on the server before Stripe is asked.
 */
export function checkTipAmount(data: TipFields | null | undefined, raw: unknown, minimumCents: number): TipCheck {
  const cents = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) return { ok: false, error: "amount" }
  if (cents > TIP_MAX_CENTS) return { ok: false, error: "too_large" }
  const floor = Math.max(1, Math.floor(minimumCents))
  if (tipAmounts(data).includes(cents)) return cents < floor ? { ok: false, error: "too_small" } : { ok: true, cents }
  if (data?.tip_custom !== true) return { ok: false, error: "not_offered" }
  if (cents < floor) return { ok: false, error: "too_small" }
  return { ok: true, cents }
}

/** A tipper's name or message as kept: one line, no control characters, cut to `max`. */
export function tipText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  return clean || null
}

/** "$5", "5 lei": a whole amount without decimals, else two. In the visitor's language where the browser says one. */
export function tipLabel(cents: number, currency: string | null | undefined, locale = "en-US"): string {
  const code = (currency || "usd").toUpperCase()
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${code}`
  }
}

/** The return address after Stripe, on the page the tip started from: its own path, never another site's. */
export function tipReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "/"
  const path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 300 || /[\s<>"']/.test(path)) return "/"
  return path.split("#")[0].split("?")[0] || "/"
}
