import { webhookUrlProblem } from "./webhook"

/*
  A form's integration settings, as stored (integration_settings) and as
  the owner's browser sees them. The webhook secret is stored sealed
  (lib/physical/secrets.ts) and never sent back: the browser gets its last
  four characters. The plain secret is shown once, when it is created.
*/

export interface StoredIntegrations {
  notify_email?: boolean
  webhook?: { enabled?: boolean; url?: string; secret_sealed?: string; secret_hint?: string; prepared?: boolean }
  google_sheets?: { prepared?: boolean }
}
export interface ClientIntegrations {
  notify_email: boolean
  webhook: { enabled: boolean; url: string; secret_hint: string | null }
  google_sheets: { prepared: boolean }
}

export function clientIntegrations(raw: unknown): ClientIntegrations {
  const s = (raw && typeof raw === "object" ? raw : {}) as StoredIntegrations
  return {
    notify_email: s.notify_email !== false,
    webhook: { enabled: s.webhook?.enabled === true, url: typeof s.webhook?.url === "string" ? s.webhook.url : "", secret_hint: s.webhook?.secret_sealed ? s.webhook.secret_hint || "set" : null },
    google_sheets: { prepared: s.google_sheets?.prepared === true },
  }
}

/** The owner's changes merged over what is stored; the sealed secret is kept. Throws a plain message when the webhook address is not usable. */
export function mergeIntegrations(stored: unknown, incoming: unknown): StoredIntegrations {
  const s = (stored && typeof stored === "object" ? stored : {}) as StoredIntegrations
  const i = (incoming && typeof incoming === "object" ? incoming : {}) as Record<string, any>
  const url = typeof i.webhook?.url === "string" ? i.webhook.url.trim().slice(0, 2048) : s.webhook?.url || ""
  const enabled = i.webhook?.enabled === true
  if (enabled) {
    const problem = webhookUrlProblem(url)
    if (problem) throw new Error(`Webhook: ${problem}`)
    if (!s.webhook?.secret_sealed) throw new Error("Create a signing secret before turning the webhook on.")
  }
  return {
    notify_email: i.notify_email !== false,
    webhook: {
      enabled,
      url,
      ...(s.webhook?.secret_sealed ? { secret_sealed: s.webhook.secret_sealed, secret_hint: s.webhook.secret_hint } : {}),
    },
    google_sheets: { prepared: i.google_sheets?.prepared === true },
  }
}

/** A stored form row as the owner's browser may see it. */
export function clientForm<T extends { integration_settings?: unknown }>(row: T): Omit<T, "integration_settings"> & { integration_settings: ClientIntegrations } {
  return { ...row, integration_settings: clientIntegrations(row.integration_settings) }
}
