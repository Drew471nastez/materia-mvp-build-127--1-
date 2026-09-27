/**
 * ===========================================================================
 *  WHICH DOMAIN STRIPE WILL SHOW APPLE PAY AND GOOGLE PAY ON
 * ===========================================================================
 * Stripe only draws a wallet button on a domain that is registered with the
 * account as a payment method domain. Until storelib.com is on that list the
 * Express Checkout Element asks for Apple Pay, Google Pay and Link, Stripe
 * answers that none is available, and the row is not drawn at all
 * (app/checkout/parts/stripe-pay.tsx hides it when nothing can pay).
 *
 * Charges are destination charges made on the platform account
 * (app/api/checkout/stripe-session), so one domain is registered, not one per
 * creator. A creator's own domain is registered the same way when it starts
 * serving a checkout, which is why the route takes a domain.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING HERE IS PURE
 * ---------------------------------------------------------------------------
 * Reading Stripe's answer, choosing between create and validate, and working
 * out which domain we are talking about are all decided here, from plain
 * objects, so tests/wallet-domains.test.ts runs them without a Stripe key.
 * app/api/admin/payment-domains/route.ts is the thin part: three Stripe calls
 * and one fetch of our own file.
 *
 * The shapes below are Stripe's payment_method_domain as this SDK types it
 * (node_modules/stripe/types/PaymentMethodDomains.d.ts), written structurally
 * and loosely on purpose: the admin panel is a client component and imports
 * these types, and a field Stripe adds later must not throw here.
 */

/** A wallet on a payment method domain, and whether checkout asks for it. */
export const WALLETS = [
  { id: "apple_pay", label: "Apple Pay", checkout: true },
  { id: "google_pay", label: "Google Pay", checkout: true },
  { id: "link", label: "Link", checkout: true },
  { id: "paypal", label: "PayPal", checkout: false },
] as const

export type WalletId = (typeof WALLETS)[number]["id"]

export type WalletState = {
  status?: string | null
  status_details?: { error_message?: string | null } | null
}

export type DomainRecord = {
  id?: string | null
  domain_name?: string | null
  enabled?: boolean | null
  livemode?: boolean | null
  created?: number | null
} & Partial<Record<WalletId, WalletState | null>>

export type WalletRow = {
  id: WalletId
  label: string
  /** Whether the express checkout row asks Stripe for this one. */
  checkout: boolean
  state: "active" | "inactive" | "unknown"
  /** Stripe's own sentence for a wallet it is not showing. It names what to fix. */
  message: string | null
}

/** The file Apple fetches to verify the domain, served from public/.well-known. */
export const ASSOCIATION_PATH = "/.well-known/apple-developer-merchantid-domain-association"

/** Stripe's own association file, to the byte. A shorter answer is the wrong file. */
export const ASSOCIATION_BYTES = 9094

/** The domain the platform's own checkout runs on, when nothing says otherwise. */
export const FALLBACK_DOMAIN = "storelib.com"

/**
 * A host Stripe should never be asked to register: a preview deployment is a
 * new address every push, and localhost is not reachable from Apple.
 */
export function throwawayHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || host.endsWith(".local")
}

/**
 * A bare host out of whatever was given: a full URL, a host with a port, a
 * host with a path, or a host on its own. Null when it is not a domain name.
 */
export function normaliseDomain(input: unknown): string | null {
  if (typeof input !== "string") return null
  let host = input.trim().toLowerCase()
  if (!host) return null
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  host = host.split("/")[0].split("?")[0].split("#")[0]
  host = host.split("@").pop() ?? host
  host = host.replace(/:\d+$/, "")
  host = host.replace(/\.$/, "")
  if (!host) return null
  if (host === "localhost") return host
  /* One label, letters, digits and hyphens, at least two labels, a real last one. */
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null
  if (host.length > 253) return null
  return host
}

/**
 * Which domain this is about.
 *
 * The configured public URL first (lib/notify/urls.ts baseUrl, the same order
 * every email link uses), because that is the address buyers are on. The
 * request's own host only when the configured one is missing or is a throwaway
 * — a preview deployment must not register its own vercel.app host, since the
 * registration outlives the deployment and the next push has a new address.
 */
export function siteDomain(configured: string | null | undefined, requestUrl?: string | null): string {
  const fromConfig = normaliseDomain(configured)
  if (fromConfig && !throwawayHost(fromConfig)) return fromConfig
  const fromRequest = normaliseDomain(requestUrl)
  if (fromRequest && !throwawayHost(fromRequest)) return fromRequest
  return FALLBACK_DOMAIN
}

/** The registration for one domain, out of the account's list. */
export function findDomain(list: readonly DomainRecord[] | null | undefined, domain: string): DomainRecord | null {
  const want = normaliseDomain(domain)
  if (!want) return null
  for (const row of list ?? []) {
    if (normaliseDomain(row?.domain_name) === want) return row
  }
  return null
}

/**
 * A registered domain is re-checked; an unregistered one is created. Pressing
 * the button twice is safe either way: create is only reached when Stripe's own
 * list says the domain is not there, and validate changes nothing by itself.
 */
export function nextStep(record: DomainRecord | null | undefined): "create" | "validate" {
  return record?.id ? "validate" : "create"
}

/** Stripe's per-wallet answer as rows, in one order, whatever it sent. */
export function walletRows(record: DomainRecord | null | undefined): WalletRow[] {
  return WALLETS.map(({ id, label, checkout }) => {
    const wallet = record ? record[id] : null
    const status = typeof wallet?.status === "string" ? wallet.status : null
    const message = wallet?.status_details?.error_message
    return {
      id,
      label,
      checkout,
      state: status === "active" ? "active" : status === "inactive" ? "inactive" : "unknown",
      message: typeof message === "string" && message.trim() ? message.trim() : null,
    }
  })
}

export type AssociationCheck = {
  url: string
  /** The HTTP status our own file answered with, or null when it could not be reached. */
  status: number | null
  /** How many bytes came back. Stripe's file is 9094. */
  bytes: number | null
  redirectedTo: string | null
  ok: boolean
  note: string
}

/** What the association file's answer means, in words the owner can act on. */
export function associationNote(check: Pick<AssociationCheck, "status" | "bytes" | "redirectedTo">): string {
  if (check.status === null) return "The file could not be fetched. Nothing is known about it."
  if (check.redirectedTo) return `It redirects to ${check.redirectedTo}. Apple does not follow a redirect, so this reads as missing.`
  if (check.status === 404) return "Not found. Apple cannot verify the domain until this file is served."
  if (check.status !== 200) return `The server answered ${check.status}. Apple needs a plain 200.`
  if (check.bytes !== null && check.bytes < 100) return `Served, but only ${check.bytes} bytes. Stripe's file is ${ASSOCIATION_BYTES}.`
  if (check.bytes !== null && check.bytes !== ASSOCIATION_BYTES) return `Served, ${check.bytes} bytes. Stripe's own file is ${ASSOCIATION_BYTES}, so check it is the current one.`
  return "Served as Stripe's own file."
}

export function associationOk(check: Pick<AssociationCheck, "status" | "bytes" | "redirectedTo">): boolean {
  return check.status === 200 && !check.redirectedTo && (check.bytes ?? 0) > 100
}

export type WalletDomainReport = {
  domain: string
  registered: boolean
  /** Stripe's id for the registration, so the dashboard can be reached if needed. */
  recordId: string | null
  /** False when the registration exists but is switched off: Elements then shows nothing. */
  enabled: boolean
  livemode: boolean | null
  registeredAt: string | null
  wallets: WalletRow[]
  association: AssociationCheck
  /** Every domain on the account, so a creator's own domain is visible here too. */
  allDomains: { domain: string; enabled: boolean; livemode: boolean | null; activeWallets: string[] }[]
  /** What pressing the button would do next. */
  nextStep: "create" | "validate"
  /** One line at the top of the panel. */
  summary: string
}

/** The whole answer, assembled from what Stripe and our own server said. */
export function buildReport(input: {
  domain: string
  record: DomainRecord | null
  all: readonly DomainRecord[]
  association: AssociationCheck
}): WalletDomainReport {
  const { domain, record, all, association } = input
  const wallets = walletRows(record)
  const enabled = record ? record.enabled !== false : false
  const asked = wallets.filter((w) => w.checkout)
  const live = asked.filter((w) => w.state === "active").map((w) => w.label)

  const summary = !record
    ? `${domain} is not registered with Stripe, so no wallet button is drawn at checkout.`
    : !enabled
      ? `${domain} is registered but switched off, so no wallet button is drawn at checkout.`
      : live.length === asked.length
        ? `${domain} is registered. ${live.join(", ")} are all active.`
        : live.length
          ? `${domain} is registered. ${live.join(", ")} active; ${asked.filter((w) => w.state !== "active").map((w) => w.label).join(", ")} not yet.`
          : `${domain} is registered, and Stripe has no wallet active on it yet.`

  return {
    domain,
    registered: !!record,
    recordId: record?.id ?? null,
    enabled,
    livemode: typeof record?.livemode === "boolean" ? record.livemode : null,
    registeredAt: typeof record?.created === "number" ? new Date(record.created * 1000).toISOString() : null,
    wallets,
    association,
    allDomains: (all ?? []).map((row) => ({
      domain: normaliseDomain(row?.domain_name) ?? String(row?.domain_name ?? ""),
      enabled: row?.enabled !== false,
      livemode: typeof row?.livemode === "boolean" ? row.livemode : null,
      activeWallets: walletRows(row).filter((w) => w.state === "active").map((w) => w.id),
    })),
    nextStep: nextStep(record),
    summary,
  }
}
