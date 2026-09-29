import "server-only"

/**
 * ===========================================================================
 *  AIRWALLEX: WHICH ENVIRONMENT, AND WHETHER IT MAY MOVE REAL MONEY
 * ===========================================================================
 * Read from the server's environment only. Nothing here is ever sent to a
 * browser: the client id travels to the embedded components as part of their
 * own init (Airwallex's design, and it is not a secret on its own), the API
 * key never does.
 *
 *   AIRWALLEX_CLIENT_ID           the platform account's client id
 *   AIRWALLEX_API_KEY             its API key
 *   AIRWALLEX_ENV                 "sandbox" (default) or "production"
 *   AIRWALLEX_ALLOW_LIVE          "1" to let production credentials move money.
 *                                 Without it a production environment refuses
 *                                 to start, so a copied key cannot go live.
 *   AIRWALLEX_API_VERSION         optional x-api-version pin, e.g. 2026-08-21
 *   AIRWALLEX_WEBHOOK_SECRET      the notification URL's signing secret
 *   AIRWALLEX_HOSTED_FLOW_TEMPLATE the hosted onboarding template id (from
 *                                 the Account Manager); without it individuals
 *                                 cannot be onboarded and the hub says so
 *   AIRWALLEX_EMBEDDED_COMPONENTS "1" once Airwallex has switched embedded
 *                                 components on for the platform
 *   STORELIB_PAYMENTS_AIRWALLEX   who is on Airwallex: unset (nobody),
 *                                 "all", or a comma list of creator ids.
 *                                 Production leaves it unset until go-live.
 */

export type AirwallexEnv = "sandbox" | "production"

export interface AirwallexConfig {
  clientId: string
  apiKey: string
  env: AirwallexEnv
  baseUrl: string
  apiVersion: string | null
  webhookSecret: string | null
  hostedFlowTemplate: string | null
  embeddedComponents: boolean
}

const BASE: Record<AirwallexEnv, string> = {
  sandbox: "https://api.sandbox.airwallex.com",
  production: "https://api.airwallex.com",
}

export class AirwallexNotConfigured extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AirwallexNotConfigured"
  }
}

type Env = Record<string, string | undefined>

/** The configuration, or a reason it cannot be used. Never throws. */
export function readAirwallexConfig(env: Env = process.env): { ok: true; config: AirwallexConfig } | { ok: false; reason: string } {
  const clientId = (env.AIRWALLEX_CLIENT_ID ?? "").trim()
  const apiKey = (env.AIRWALLEX_API_KEY ?? "").trim()
  if (!clientId || !apiKey) return { ok: false, reason: "Airwallex credentials are not set." }
  const rawEnv = (env.AIRWALLEX_ENV ?? "sandbox").trim().toLowerCase()
  if (rawEnv !== "sandbox" && rawEnv !== "production") return { ok: false, reason: `AIRWALLEX_ENV must be sandbox or production, not "${rawEnv}".` }
  if (rawEnv === "production" && env.AIRWALLEX_ALLOW_LIVE !== "1") {
    return { ok: false, reason: "Production Airwallex is switched off. Set AIRWALLEX_ALLOW_LIVE=1 only when going live has been approved." }
  }
  return {
    ok: true,
    config: {
      clientId,
      apiKey,
      env: rawEnv,
      baseUrl: BASE[rawEnv],
      apiVersion: (env.AIRWALLEX_API_VERSION ?? "").trim() || null,
      webhookSecret: (env.AIRWALLEX_WEBHOOK_SECRET ?? "").trim() || null,
      hostedFlowTemplate: (env.AIRWALLEX_HOSTED_FLOW_TEMPLATE ?? "").trim() || null,
      embeddedComponents: env.AIRWALLEX_EMBEDDED_COMPONENTS === "1",
    },
  }
}

export function airwallexConfig(env: Env = process.env): AirwallexConfig {
  const r = readAirwallexConfig(env)
  if (r.ok === false) throw new AirwallexNotConfigured(r.reason)
  return r.config
}

/**
 * How the rollout reaches this creator: `named` (their id is listed),
 * `all` (everyone who is not already paid through Stripe; the caller checks
 * that), or `none`. Nobody at all while Airwallex is not configured.
 *
 * An existing Airwallex account row (checked by the caller) also keeps a
 * creator there, so changing this variable never strands someone half way
 * through onboarding.
 */
export function airwallexRollout(creatorId: string, env: Env = process.env): "named" | "all" | "none" {
  if (!readAirwallexConfig(env).ok) return "none"
  const who = (env.STORELIB_PAYMENTS_AIRWALLEX ?? "").trim()
  if (!who) return "none"
  if (who === "all") return "all"
  return who.split(",").map((s) => s.trim()).filter(Boolean).includes(creatorId) ? "named" : "none"
}

/** Named, or reached by `all`: whether the rollout reaches them at all, before Stripe is considered. */
export function inAirwallexRollout(creatorId: string, env: Env = process.env): boolean {
  return airwallexRollout(creatorId, env) !== "none"
}
