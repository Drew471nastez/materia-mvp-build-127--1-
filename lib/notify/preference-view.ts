/**
 * ===========================================================================
 *  THE PREFERENCE ROWS A CREATOR SEES, AND WHAT EACH ONE MEANS
 * ===========================================================================
 * Settings (components/app/settings/notification-preferences.tsx), the
 * preferences route (app/api/notifications/preferences) and the unsubscribe
 * page (app/api/notify/unsubscribe) all name the categories the same way,
 * from here. Pure, with no server imports, so the settings panel can use it
 * and tests/notify-unsubscribe.test.ts can hold it.
 *
 *   REQUIRED     payouts and payments, account, security. Always sent, on
 *                every channel. They show "Always on" and no switch, the
 *                route refuses a change to them, and no unsubscribe link is
 *                ever signed for them.
 *   OPTIONAL     sales, product and store, onboarding reminders (lifecycle):
 *                on until turned off, per channel.
 *   CONSENT      tips and Storelib news (marketing): email is off until the
 *                creator turns it on. Tips are on in app; news is off there
 *                too, since marketing needs a yes on every channel
 *                (preferences.ts decide).
 *
 * A missing row in notification_preferences means the default below, which
 * matches the registry's defaultOn for the types in that category.
 */
import type { PreferenceCategory } from "./types"
import { tt, msg } from "@/lib/i18n/text"

export type PreferenceChannel = "email" | "in_app"
export const PREFERENCE_CHANNELS: readonly PreferenceChannel[] = ["email", "in_app"]

export interface CategoryInfo {
  category: PreferenceCategory
  label: string
  /** One line under the label. */
  detail: string
  required: boolean
  defaults: Record<PreferenceChannel, boolean>
  /** What the unsubscribe page says was turned off: "Sales emails". */
  emails: string
}

/** In the order Settings shows them. */
export const CATEGORY_INFO: readonly CategoryInfo[] = [
  {
    category: "sales",
    get label() { return tt("Sales") },
    get detail() { return tt("New sales and your first sale.") },
    required: false,
    defaults: { email: true, in_app: true },
    get emails() { return tt("sale emails") },
  },
  {
    category: "payouts_and_payments",
    get label() { return tt("Payouts and payments") },
    get detail() { return tt("Payouts, payment setup and anything that stops you getting paid.") },
    required: true,
    defaults: { email: true, in_app: true },
    get emails() { return tt("payout and payment emails") },
  },
  {
    category: "product_and_store",
    get label() { return tt("Product and store") },
    get detail() { return tt("Published products, domains and your store.") },
    required: false,
    defaults: { email: true, in_app: true },
    get emails() { return tt("product and store emails") },
  },
  {
    category: "account",
    get label() { return tt("Account") },
    get detail() { return tt("Changes to your account and its email address.") },
    required: true,
    defaults: { email: true, in_app: true },
    get emails() { return tt("account emails") },
  },
  {
    category: "security",
    get label() { return tt("Security") },
    get detail() { return tt("Password changes and sign in alerts.") },
    required: true,
    defaults: { email: true, in_app: true },
    get emails() { return tt("security emails") },
  },
  {
    category: "tips",
    get label() { return tt("Tips and ideas") },
    get detail() { return tt("Ways other creators sell more.") },
    required: false,
    defaults: { email: false, in_app: true },
    get emails() { return tt("tips and ideas emails") },
  },
  {
    category: "lifecycle",
    get label() { return tt("Onboarding reminders") },
    get detail() { return tt("A nudge when your first product or payment setup is not done yet.") },
    required: false,
    defaults: { email: true, in_app: true },
    get emails() { return tt("onboarding reminders") },
  },
  {
    category: "marketing",
    get label() { return tt("Storelib news") },
    get detail() { return tt("New features and announcements.") },
    required: false,
    defaults: { email: false, in_app: false },
    get emails() { return tt("Storelib news emails") },
  },
]

export const REQUIRED_CATEGORIES: readonly PreferenceCategory[] = CATEGORY_INFO.filter((c) => c.required).map((c) => c.category)

/** The categories an unsubscribe link can be signed for. Never security, account or payouts and payments. */
export const UNSUBSCRIBABLE: readonly PreferenceCategory[] = ["sales", "product_and_store", "lifecycle", "tips", "marketing"]

/* Said under Settings' rows, where these three categories no longer have rows of their own (round 22). */
export const REQUIRED_WHY = msg("Payout, payment, account and security notices are always sent.")

export function infoFor(category: unknown): CategoryInfo | null {
  return CATEGORY_INFO.find((c) => c.category === category) ?? null
}

export function isUnsubscribable(category: unknown): category is PreferenceCategory {
  return typeof category === "string" && (UNSUBSCRIBABLE as readonly string[]).includes(category)
}

/* ── What the route answers ─────────────────────────────────────────── */

/** One stored row, as preferences.ts getPreferences returns it. */
export interface StoredPreference {
  category: string
  channel: string
  enabled: boolean
  updatedAt?: string | null
}

export interface ChannelState {
  enabled: boolean
  /** When the person last changed it; null while it is the default. */
  updatedAt: string | null
}

export interface CategoryView {
  category: PreferenceCategory
  label: string
  detail: string
  required: boolean
  channels: Record<PreferenceChannel, ChannelState>
}

/**
 * Every category with each channel's state: the stored choice where there is
 * one, the default where there is not, and on for a required one whatever
 * was stored (a row written for it by hand changes nothing it is sent).
 */
export function preferencesView(stored: readonly StoredPreference[]): CategoryView[] {
  return CATEGORY_INFO.map((info) => {
    const channels = {} as Record<PreferenceChannel, ChannelState>
    for (const channel of PREFERENCE_CHANNELS) {
      const row = stored.find((r) => r.category === info.category && r.channel === channel)
      channels[channel] = info.required
        ? { enabled: true, updatedAt: null }
        : { enabled: row ? row.enabled === true : info.defaults[channel], updatedAt: row?.updatedAt ?? null }
    }
    return { category: info.category, label: info.label, detail: info.detail, required: info.required, channels }
  })
}

export interface PreferenceChange {
  category: PreferenceCategory
  channel: PreferenceChannel
  enabled: boolean
}

/**
 * A PUT body: one change `{category, channel, enabled}` or a few
 * `{changes: [...]}`. A required category, an unknown one or a channel that
 * is not email or in app is refused with the reason, and nothing is saved.
 */
export function parseChanges(body: unknown): { changes: PreferenceChange[] } | { error: string } {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  if (!raw) return { error: tt("Nothing to change.") }
  const list = Array.isArray(raw.changes) ? raw.changes : [raw]
  if (list.length === 0 || list.length > 20) return { error: tt("Nothing to change.") }
  const changes: PreferenceChange[] = []
  for (const item of list) {
    const c = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const info = infoFor(c.category)
    if (!info) return { error: tt("That is not a notification setting.") }
    if (info.required) return { error: tt("{label} notices are always sent.", { label: info.label }) }
    if (c.channel !== "email" && c.channel !== "in_app") return { error: tt("That is not a notification setting.") }
    if (typeof c.enabled !== "boolean") return { error: tt("Nothing to change.") }
    changes.push({ category: info.category, channel: c.channel, enabled: c.enabled })
  }
  return { changes }
}
