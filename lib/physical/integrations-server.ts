import "server-only"

/**
 * An integration's settings, saved for the owner: secrets sealed
 * (./secrets.ts) and never sent back, only their last four characters. A
 * provider that is not live yet is saved as needs_setup, never connected.
 */

import { publicUrlProblem } from "@/lib/api/public-fetch"
import type { Db } from "./auth"
import { PROVIDERS, providerInfo, type ProviderId } from "./providers"
import { verifyProviderKey } from "./provider-verify"
import { openSecret, sealSecret, secretHint } from "./secrets"
import { afterConnect, beforeDisconnect, connectFields, connectorFor } from "@/lib/integrations/fulfilment/forward-server"

export interface IntegrationView {
  provider: ProviderId
  status: "connected" | "disconnected" | "error" | "needs_setup"
  url: string | null
  keyHint: string | null
  secretHint: string | null
  lastSyncAt: string | null
  lastError: string | null
  /** Who the provider says the key belongs to (a Printful store), when it says. */
  account: string | null
  /** When the provider last accepted the key, and whether it was a test key. */
  verifiedAt: string | null
  mode: "test" | "live" | null
  /** Printful and Printify: orders sent straight to production (true) or kept as drafts to approve there. */
  autoConfirm: boolean
  /** Whether the provider tells Storelib when a parcel ships ("on"), or tracking is read on a timer ("off"), and why. */
  webhooks: "on" | "off" | null
  webhookNote: string | null
  /** The location whose products are sent there. */
  location: { id: string; name: string } | null
}

export async function loadIntegrations(db: Db, creatorId: string): Promise<IntegrationView[]> {
  const { data } = await db.from("commerce_integrations").select("id, provider, status, account_label, config, secret_ciphertext, webhook_secret_ciphertext, last_sync_at, last_error").eq("creator_id", creatorId)
  const rows = new Map(((data ?? []) as Record<string, any>[]).map((r) => [r.provider, r]))
  const ids = ((data ?? []) as Record<string, any>[]).map((r) => r.id).filter(Boolean)
  const { data: locs } = ids.length ? await db.from("inventory_locations").select("id, name, integration_id").eq("creator_id", creatorId).in("integration_id", ids) : { data: [] }
  const locOf = new Map(((locs ?? []) as { id: string; name: string; integration_id: string }[]).map((l) => [l.integration_id, { id: l.id, name: l.name }]))
  return PROVIDERS.filter((p) => p.fields.length > 0).map((p) => {
    const r = rows.get(p.id)
    return {
      provider: p.id,
      status: r?.status ?? "disconnected",
      url: r?.config?.url ?? null,
      keyHint: r?.secret_ciphertext ? secretHint(openSecret(r.secret_ciphertext)) : null,
      secretHint: r?.webhook_secret_ciphertext ? secretHint(openSecret(r.webhook_secret_ciphertext)) : null,
      lastSyncAt: r?.last_sync_at ?? null,
      lastError: r?.last_error ?? null,
      account: r?.account_label ?? null,
      verifiedAt: typeof r?.config?.verified_at === "string" ? r.config.verified_at : null,
      mode: r?.config?.mode === "test" || r?.config?.mode === "live" ? r.config.mode : null,
      autoConfirm: r?.config?.auto_confirm === true,
      webhooks: r?.config?.webhooks === "on" || r?.config?.webhooks === "off" ? r.config.webhooks : null,
      webhookNote: typeof r?.config?.webhook_note === "string" ? r.config.webhook_note : null,
      location: r?.id ? (locOf.get(r.id) ?? null) : null,
    }
  })
}

export async function saveIntegration(db: Db, creatorId: string, provider: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const info = providerInfo(provider)
  if (!info || info.fields.length === 0 || info.id === "supplier_email") return { ok: false, error: "That integration has nothing to connect." }
  if (body.disconnect === true) {
    /* Printful and Printify stop sending updates first; the location keeps its products and says it is not connected. */
    await beforeDisconnect(db, creatorId, info.id).catch(() => undefined)
    await db.from("commerce_integrations").delete().eq("creator_id", creatorId).eq("provider", info.id)
    return { ok: true }
  }
  /* Coming soon: nothing to connect to yet, so no key is taken (one saved before can still be removed above). */
  if (info.availability === "needs_setup") return { ok: false, error: `${info.name} isn't connected to Storelib yet. Press Tell me when it's ready on its page.` }
  if (info.availability === "connect" && connectorFor(info.id)) return saveConnector(db, creatorId, info.id, info.category, body)
  const row: Record<string, unknown> = { creator_id: creatorId, provider: info.id, category: info.category, updated_at: new Date().toISOString(), last_error: null }
  if (info.fields.includes("url")) {
    const url = typeof body.url === "string" ? body.url.trim() : ""
    if (!url.startsWith("https://") || publicUrlProblem(url)) return { ok: false, error: "Use a public https address." }
    row.config = { url: url.slice(0, 500) }
  }
  if (info.fields.includes("webhook_secret")) {
    const secret = typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : ""
    if (secret) {
      if (secret.length < 16 || secret.length > 200) return { ok: false, error: "The signing secret is 16 to 200 characters." }
      row.webhook_secret_ciphertext = sealSecret(secret)
    } else {
      const { data: had } = await db.from("commerce_integrations").select("webhook_secret_ciphertext").eq("creator_id", creatorId).eq("provider", info.id).maybeSingle()
      if (!had?.webhook_secret_ciphertext) return { ok: false, error: "Add a signing secret." }
    }
  }
  row.status = info.availability === "live" ? "connected" : "needs_setup"
  if (info.fields.includes("api_key")) {
    const key = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (key) {
      if (key.length < 8 || key.length > 400) return { ok: false, error: "That key doesn't look right." }
      /*
        THE PROVIDER IS ASKED FIRST (provider-verify.ts). A key it refuses is not saved at all; one it accepts is kept with
        the account it belongs to; one that could not be checked (the provider was down) is kept with that said, so a save
        never fails because of somebody else's outage.
      */
      const verdict = await verifyProviderKey(info.id, key)
      if (verdict.state === "rejected") return { ok: false, error: verdict.error }
      row.secret_ciphertext = sealSecret(key)
      const config = (row.config as Record<string, unknown> | undefined) ?? {}
      if (verdict.state === "verified") {
        row.account_label = verdict.account ? verdict.account.slice(0, 120) : null
        row.config = { ...config, verified_at: new Date().toISOString(), ...(verdict.mode ? { mode: verdict.mode } : {}) }
        row.last_sync_at = new Date().toISOString()
      } else {
        row.config = { ...config, verified_at: null }
        if (verdict.state === "unreachable") row.last_error = verdict.error.slice(0, 500)
      }
    }
  }
  const { error } = await db.from("commerce_integrations").upsert(row, { onConflict: "creator_id,provider" })
  return error ? { ok: false, error: "The integration could not be saved." } : { ok: true }
}

/**
 * Printful and Printify (lib/integrations/fulfilment): a new key is put to
 * the provider, which says which shop or store it works on, and is refused
 * when the provider refuses it. Without a new key, only the seller's
 * choice of drafts or straight to production changes.
 */
async function saveConnector(db: Db, creatorId: string, provider: string, category: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: had } = await db.from("commerce_integrations").select("id, status, config, secret_ciphertext").eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  /* A key saved before Printful and Printify took orders (needs_setup) connects again with no typing. */
  const typed = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  const key = typed || (had?.status === "needs_setup" ? (openSecret(had.secret_ciphertext) ?? "") : "")
  if (!key) {
    if (!had) return { ok: false, error: "Add your API key." }
    if (typeof body.autoConfirm !== "boolean") return { ok: true }
    const { error } = await db.from("commerce_integrations").update({ config: { ...(had.config ?? {}), auto_confirm: body.autoConfirm }, updated_at: new Date().toISOString() }).eq("id", had.id)
    return error ? { ok: false, error: "The integration could not be saved." } : { ok: true }
  }
  if (key.length < 8 || key.length > 400) return { ok: false, error: "That key doesn't look right." }
  const made = await connectFields(provider, key, (had?.config as Record<string, unknown> | null) ?? null, { autoConfirm: body.autoConfirm })
  if (made.ok === false) return made
  const { error } = await db.from("commerce_integrations").upsert({ creator_id: creatorId, provider, category, updated_at: new Date().toISOString(), ...made.fields }, { onConflict: "creator_id,provider" })
  if (error) return { ok: false, error: "The integration could not be saved." }
  await afterConnect(db, creatorId, provider)
  return { ok: true }
}
