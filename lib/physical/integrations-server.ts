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
}

export async function loadIntegrations(db: Db, creatorId: string): Promise<IntegrationView[]> {
  const { data } = await db.from("commerce_integrations").select("provider, status, account_label, config, secret_ciphertext, webhook_secret_ciphertext, last_sync_at, last_error").eq("creator_id", creatorId)
  const rows = new Map(((data ?? []) as Record<string, any>[]).map((r) => [r.provider, r]))
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
    }
  })
}

export async function saveIntegration(db: Db, creatorId: string, provider: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const info = providerInfo(provider)
  if (!info || info.fields.length === 0 || info.id === "supplier_email") return { ok: false, error: "That integration has nothing to connect." }
  if (body.disconnect === true) {
    await db.from("commerce_integrations").delete().eq("creator_id", creatorId).eq("provider", info.id)
    return { ok: true }
  }
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
