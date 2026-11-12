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
//
// Round AS: amounts are in the store currency's own minor unit and written
// in its own way (lib/markets/money formatMinor: "$5", "5 lei"); the tip
// sheet's stepper, keypad and floor (tipStep, keypadInput, tipFloor) and
// where a tip came from (tipSource, kept with the tip: run-now part 442).

import { formatMinor, minorUnits } from "@/lib/markets/money"

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

/**
 * Round AS: what a block with no amounts of its own offers, in the store's
 * currency: 3, 5 and 10, or 10, 20 and 50 lei, where 3 lei is less than a
 * coffee. The server reads the same (checkTipAmount), so they always agree.
 */
export function tipDefaultAmounts(currency?: string | null): number[] {
  const code = (currency || "usd").toUpperCase()
  if (code === "RON") return [1000, 2000, 5000]
  const unit = 10 ** minorUnits(code)
  return TIP_DEFAULT_AMOUNTS.map((c) => (c / 100) * unit)
}

/** The block's presets: valid, each once, smallest first, at most four. The defaults when none are valid. */
export function tipAmounts(data: TipFields | null | undefined, currency?: string | null): number[] {
  const raw = Array.isArray(data?.tip_amounts) ? (data!.tip_amounts as unknown[]) : []
  const ok = [...new Set(raw.map(tipCents).filter((n): n is number => n !== null))].sort((a, b) => a - b).slice(0, TIP_PRESETS_MAX)
  return ok.length ? ok : tipDefaultAmounts(currency)
}

/** A visitor's typed amount ("5", "5.50", "5,50") as minor units, or null. No more decimals than the currency has. */
export function typedTipCents(raw: unknown, currency?: string | null): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const decimals = minorUnits((currency || "usd").toUpperCase())
  const text = String(raw).trim().replace(",", ".").replace(/\.$/, "")
  const shape = decimals ? new RegExp(`^\\d{1,6}(\\.\\d{1,${decimals}})?$`) : /^\d{1,6}$/
  if (!shape.test(text)) return null
  return Math.round(Number(text) * 10 ** decimals)
}

export type TipCheck = { ok: true; cents: number } | { ok: false; error: "amount" | "too_small" | "too_large" | "not_offered" }

/**
 * IS THIS AMOUNT ONE THE BLOCK TAKES? One of its presets, or, when it lets
 * visitors choose, any whole amount from Stripe's smallest charge in the
 * currency (`minimumCents`) up to the cap. Anything the page sends is held
 * to this on the server before Stripe is asked.
 */
export function checkTipAmount(data: TipFields | null | undefined, raw: unknown, minimumCents: number, currency?: string | null): TipCheck {
  const cents = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) return { ok: false, error: "amount" }
  if (cents > TIP_MAX_CENTS) return { ok: false, error: "too_large" }
  const floor = Math.max(1, Math.floor(minimumCents))
  if (tipAmounts(data, currency).includes(cents)) return cents < floor ? { ok: false, error: "too_small" } : { ok: true, cents }
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

/**
 * "$5", "5 lei", "€5.50": a whole amount without decimals, else the
 * currency's own. In the visitor's language where the browser says one, and
 * in the currency's own minor unit (round AS: it divided by 100 whatever the
 * currency, and wrote RON as "RON 5" where the store writes "5 lei").
 */
export function tipLabel(cents: number, currency: string | null | undefined, locale = "en-US"): string {
  return formatMinor(cents, (currency || "usd").toUpperCase(), locale, { wholeAsWhole: true })
}

/* ── The tip sheet's amount (round AS) ── */

/** One whole unit of the currency, in its minor unit: 100 for dollars, 1 for yen. */
export function tipUnit(currency: string | null | undefined): number {
  return 10 ** minorUnits((currency || "usd").toUpperCase())
}

/* Stripe's smallest charge, for the currencies a store sells in (lib/store/selling-currency STRIPE_MINIMUM_MINOR). */
const STRIPE_FLOOR: Record<string, number> = { USD: 50, EUR: 50, GBP: 30, RON: 200, CAD: 50, AUD: 50 }

/** The least the sheet's stepper goes down to: one whole unit, or Stripe's smallest charge if that is more. */
export function tipFloor(currency: string | null | undefined): number {
  const code = (currency || "usd").toUpperCase()
  return Math.max(tipUnit(code), STRIPE_FLOOR[code] ?? 0)
}

/** How far one press of + moves from `cents`: a unit under 20, five under 100, ten above. */
export function tipStep(cents: number, currency: string | null | undefined): number {
  const unit = tipUnit(currency)
  if (cents < 20 * unit) return unit
  if (cents < 100 * unit) return 5 * unit
  return 10 * unit
}

/**
 * The amount after a press of + (1) or - (-1): to the next step on the
 * grid (5.50 goes up to 6, 23 up to 25), never under the floor nor over
 * the cap. Pure.
 */
export function tipStepped(cents: number, dir: 1 | -1, currency: string | null | undefined): number {
  const floor = tipFloor(currency)
  const at = Math.max(floor, Math.min(TIP_MAX_CENTS, Math.round(cents)))
  if (dir > 0) {
    const step = tipStep(at, currency)
    return Math.min(TIP_MAX_CENTS, (Math.floor(at / step) + 1) * step)
  }
  const step = tipStep(at - 1, currency)
  const down = Math.ceil(at / step) * step - step
  return Math.max(floor, down)
}

/**
 * The keypad's text after a key: a digit, the decimal point ("."), or
 * "back". No leading zeros, no more decimals than the currency has, at most
 * six whole digits. Pure; the amount is typedTipCents of the text.
 */
export function keypadInput(text: string, key: string, currency: string | null | undefined): string {
  const decimals = minorUnits((currency || "usd").toUpperCase())
  if (key === "back") return text.slice(0, -1)
  const [whole, frac] = text.split(".")
  if (key === ".") {
    if (!decimals || text.includes(".")) return text
    return (text || "0") + "."
  }
  if (!/^\d$/.test(key)) return text
  if (frac !== undefined) return frac.length >= decimals ? text : text + key
  if (whole === "0") return key
  if (whole.length >= 6) return text
  return text + key
}

/** The keypad's text for an amount: "5", "5.5" kept as the visitor would type it ("5.50" for 550). */
export function keypadText(cents: number, currency: string | null | undefined): string {
  const unit = tipUnit(currency)
  const whole = Math.floor(cents / unit)
  const frac = cents % unit
  if (!frac) return String(whole)
  return `${whole}.${String(frac).padStart(String(unit).length - 1, "0")}`
}

/* ── Where a tip came from (round AS, run-now part 442) ── */

/** The places a tip can be given on. Only the OnePage's tips block takes tips today; a tip at checkout is an order's. */
export const TIP_SURFACES = ["onepage"] as const
export type TipSurface = (typeof TIP_SURFACES)[number]

export interface TipSource {
  /** The surface: the OnePage. */
  surface: TipSurface
  /** Which of the block's two ways in: its card on the page, or the amount sheet. */
  placement: "card" | "sheet"
  /** The block's title when the tip was given, so the figure keeps a name if the block is renamed or removed. */
  block_title: string | null
  /** The page's own host: storelib.me, storelib.com or the creator's domain. */
  host: string | null
  /** Where the visitor came to the page from (instagram.com, tiktok.com), when another site; null for direct. */
  referrer_host: string | null
}

const HOST = /^[a-z0-9.-]{1,253}$/

function hostOf(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  let h = raw.trim().toLowerCase()
  try {
    if (/^https?:\/\//.test(h)) h = new URL(h).hostname
  } catch {
    return null
  }
  h = h.replace(/^www\./, "").replace(/^(m|l|lm)\.(?=(facebook|instagram)\.com$)/, "")
  return HOST.test(h) ? h : null
}

/**
 * What the page says about where a tip came from, kept only in the shapes
 * above: the server stores this beside the tip and never trusts more of it
 * than a label (it decides nothing about the money). Pure.
 */
export function tipSource(raw: unknown, blockTitle: unknown): TipSource {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const host = hostOf(r.host)
  const referrer = hostOf(r.referrer)
  return {
    surface: "onepage",
    placement: r.placement === "sheet" ? "sheet" : "card",
    block_title: tipText(blockTitle, 80),
    host,
    referrer_host: referrer && referrer !== host ? referrer : null,
  }
}

/** The return address after Stripe, on the page the tip started from: its own path, never another site's. */
export function tipReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "/"
  const path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 300 || /[\s<>"']/.test(path)) return "/"
  return path.split("#")[0].split("?")[0] || "/"
}
